from __future__ import annotations

from pathlib import Path

import httpx
from sqlalchemy.orm import Session

from app.config import settings
from app.faceit_client import FaceitClient
from app.models import FaceitMatchRecord, MatchStatus
from app.services.decompress import decompress_to_dem
from app.services.match_result import extract_match_meta_for_player, merge_match_meta
from app.services.parse_demo import parse_dem_full

# Bump this whenever the analytics schema changes so previously parsed rows are auto-recomputed
# from their local .dem (no FACEIT re-download).
CURRENT_ANALYTICS_KIND = "csgrind_match_analytics_v8"


def _analytics_is_current(analytics: dict | None) -> bool:
    if not isinstance(analytics, dict):
        return False
    return analytics.get("kind") == CURRENT_ANALYTICS_KIND


def _match_dir(match_id: str) -> Path:
    base = Path(settings.demos_dir)
    base.mkdir(parents=True, exist_ok=True)
    d = base / match_id
    d.mkdir(parents=True, exist_ok=True)
    return d


def download_file(url: str, dest: Path) -> int:
    dest.parent.mkdir(parents=True, exist_ok=True)
    size = 0
    with httpx.Client(timeout=300.0, follow_redirects=True) as client:
        with client.stream("GET", url) as r:
            r.raise_for_status()
            with open(dest, "wb") as f:
                for chunk in r.iter_bytes():
                    size += len(chunk)
                    f.write(chunk)
    if size <= 0:
        raise RuntimeError("Downloaded file is empty")
    return size


def extract_demo_urls(match_json: dict) -> list[str]:
    raw = match_json.get("demo_url")
    if isinstance(raw, list):
        return [str(u) for u in raw if u]
    if isinstance(raw, str) and raw:
        return [raw]
    return []


def is_demo_permanently_unavailable(exc: BaseException) -> bool:
    """FACEIT removed the demo file (404 / err_nf0) — retrying will not help."""
    msg = str(exc).lower()
    return (
        "file not found" in msg
        or "err_nf0" in msg
        or ("404" in msg and "download" in msg)
    )


def mark_expired_failed_as_no_demo(db: Session, faceit_player_id: str) -> int:
    """One-time normalization: failed rows with expired-demo errors become no_demo."""
    rows = (
        db.query(FaceitMatchRecord)
        .filter(
            FaceitMatchRecord.player_faceit_id == faceit_player_id,
            FaceitMatchRecord.status == MatchStatus.failed.value,
        )
        .all()
    )
    changed = 0
    for row in rows:
        if is_demo_permanently_unavailable(RuntimeError(row.error_message or "")):
            row.status = MatchStatus.no_demo.value
            changed += 1
    if changed:
        db.commit()
    return changed


def match_already_archived(row: FaceitMatchRecord) -> bool:
    """Demo file is on disk (parsed or archive only) — no FACEIT re-download needed."""
    if row.local_dem_path and Path(row.local_dem_path).is_file():
        return True
    if row.local_archive_path and Path(row.local_archive_path).is_file():
        return True
    return False


def should_skip_match_processing(row: FaceitMatchRecord | None) -> bool:
    if row is None:
        return False
    if row.status == MatchStatus.no_demo.value:
        return True
    if row.status == MatchStatus.parsed.value and _analytics_is_current(row.analytics):
        return True
    return False


def should_skip_archive_attempt(row: FaceitMatchRecord | None) -> bool:
    """Skip when demo is on disk or permanently unavailable on FACEIT."""
    if should_skip_match_processing(row):
        return True
    if row is not None and match_already_archived(row):
        return True
    return False


def _reparse_local_dem(db: Session, row: FaceitMatchRecord, dem_path: Path) -> None:
    """Re-run the parser on an existing .dem and refresh analytics in place."""
    row.status = MatchStatus.parsing.value
    db.commit()
    # Preserve FACEIT score/W-L across demo reparse (parse_summary is replaced).
    prior_meta = dict(row.match_meta) if isinstance(row.match_meta, dict) else None
    summary, analytics = parse_dem_full(dem_path, verbose=False)
    if prior_meta and isinstance(analytics, dict):
        analytics = {**analytics, "match_result": prior_meta}
    row.parse_summary = summary
    row.analytics = analytics
    row.status = MatchStatus.parsed.value
    row.error_message = None
    db.commit()


def discard_compressed_archive(db: Session, row) -> bool:
    """
    After a successful parse, delete the compressed download (zst/gz/bz2/bin/copy)
    and clear local_archive_path. Keeps parsed.dem for local re-parse / schema bumps.

    Safe if the archive is missing or already cleared. Never deletes local_dem_path.
    """
    archive = (getattr(row, "local_archive_path", None) or "").strip()
    if not archive:
        return False

    dem = (getattr(row, "local_dem_path", None) or "").strip()
    archive_path = Path(archive)
    dem_path = Path(dem) if dem else None

    try:
        if dem_path is not None and archive_path.resolve() == dem_path.resolve():
            return False
    except OSError:
        pass

    deleted = False
    try:
        if archive_path.is_file():
            archive_path.unlink()
            deleted = True
    except OSError:
        # Disk/permission issues must not fail the parse result already committed.
        return False

    row.local_archive_path = None
    db.commit()
    return deleted


def process_match_record(db: Session, match_id: str) -> None:
    row = db.get(FaceitMatchRecord, match_id)
    if not row:
        raise RuntimeError(f"Unknown match_id {match_id!r}")

    if row.status == MatchStatus.no_demo.value:
        return

    # Already parsed AND analytics schema is current -> nothing to do.
    if row.status == MatchStatus.parsed.value and _analytics_is_current(row.analytics):
        return

    # Already parsed but analytics is stale (older schema): re-parse the local .dem if we still
    # have it, no re-download required.
    if row.status == MatchStatus.parsed.value and not _analytics_is_current(row.analytics):
        if row.local_dem_path:
            dem_path = Path(row.local_dem_path)
            if dem_path.is_file() and dem_path.stat().st_size > 0:
                try:
                    _reparse_local_dem(db, row, dem_path)
                    return
                except Exception as e:
                    row.status = MatchStatus.failed.value
                    row.error_message = f"reparse failed: {e}"[:8000]
                    db.commit()
                    raise
        # Local .dem missing -> fall through to a fresh download.

    client = FaceitClient()
    row.status = MatchStatus.downloading.value
    row.error_message = None
    db.commit()

    try:
        detail = client.get_match(match_id)
        row.match_started_at = detail.get("started_at")
        row.match_finished_at = detail.get("finished_at")

        meta = extract_match_meta_for_player(detail, row.player_faceit_id)
        row.match_meta = merge_match_meta(
            row.match_meta if isinstance(row.match_meta, dict) else None,
            meta,
        )

        urls = extract_demo_urls(detail)
        row.demo_resource_urls = urls
        if not urls:
            row.status = MatchStatus.no_demo.value
            db.commit()
            return

        resource = urls[0]
        mdir = _match_dir(match_id)

        dl_url = client.get_signed_demo_url(resource)

        ext = ".bin"
        low = resource.lower()
        if ".dem.zst" in low:
            ext = ".dem.zst"
        elif ".dem.gz" in low:
            ext = ".dem.gz"
        elif low.endswith(".dem"):
            ext = ".dem"

        archive_path = mdir / f"demo{ext}"
        download_file(dl_url, archive_path)
        row.local_archive_path = str(archive_path.resolve())

        row.status = MatchStatus.decompressing.value
        db.commit()

        dem_path = mdir / "parsed.dem"
        decompress_to_dem(archive_path, dem_path)
        if not dem_path.is_file() or dem_path.stat().st_size <= 0:
            raise RuntimeError("Decompressed .dem is missing or empty")
        row.local_dem_path = str(dem_path.resolve())

        _reparse_local_dem(db, row, dem_path)
        # Drop compressed download once analytics are stored (saves ~40% disk per match).
        discard_compressed_archive(db, row)

    except Exception as e:
        if is_demo_permanently_unavailable(e):
            row.status = MatchStatus.no_demo.value
            row.error_message = str(e)[:8000]
            db.commit()
            return
        row.status = MatchStatus.failed.value
        row.error_message = str(e)[:8000]
        db.commit()
        raise
