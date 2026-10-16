"""Sync and process Valve matchmaking demos (share-code based)."""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy.orm import Session

from app.config import settings
from app.models import MatchStatus, ValveMatchRecord, ValveMmLink
from app.services.pipeline import _analytics_is_current, discard_compressed_archive, download_file
from app.services.decompress import decompress_to_dem
from app.services.parse_demo import parse_dem_full
from app.services.valve_client import ValveMatchHistoryError, fetch_match_demo_url, get_next_match_sharing_code
from app.services.valve_secrets import decrypt_secret, encrypt_secret
from app.services.valve_sharecode import (
    InvalidShareCode,
    decode_match_share_code,
    extract_match_share_code,
    resolve_upload_share_code,
)


def _valve_match_dir(share_code: str) -> Path:
    safe = share_code.replace("/", "_").replace("\\", "_")
    d = Path(settings.demos_dir) / "valve" / safe
    d.mkdir(parents=True, exist_ok=True)
    return d


def upsert_valve_link(
    db: Session,
    *,
    steam_id: str,
    auth_code: str | None,
    share_code: str,
) -> ValveMmLink:
    """
    Create or update the Valve MM link.

    When `auth_code` is None/blank and a row already exists, keep the encrypted auth
    and only refresh `latest_share_code` (share-code-only updates).
    """
    row = db.get(ValveMmLink, steam_id)
    # Share code must keep Valve dictionary case (extract_match_share_code already normalized).
    normalized_share = extract_match_share_code(share_code)
    auth = (auth_code or "").strip()

    if row is None:
        if len(auth) < 8:
            raise ValueError("auth_code is required for the first Valve link")
        row = ValveMmLink(
            steam_id=steam_id,
            auth_code_encrypted=encrypt_secret(auth),
            latest_share_code=normalized_share,
        )
        db.add(row)
    else:
        if auth:
            if len(auth) < 8:
                raise ValueError("Invalid auth code")
            row.auth_code_encrypted = encrypt_secret(auth)
        row.latest_share_code = normalized_share
    db.commit()
    db.refresh(row)
    return row


def get_valve_link(db: Session, steam_id: str) -> ValveMmLink | None:
    return db.get(ValveMmLink, steam_id)


def sync_valve_share_codes(
    db: Session,
    steam_id: str,
    *,
    max_matches: int | None = None,
) -> dict:
    """Walk share-code history and register new ValveMatchRecord rows."""
    link = get_valve_link(db, steam_id)
    if link is None:
        raise ValueError("Valve MM link not configured for this Steam ID")

    cap = max_matches if max_matches is not None else settings.valve_sync_max_matches
    auth_code = decrypt_secret(link.auth_code_encrypted)
    try:
        known = extract_match_share_code(link.latest_share_code or "")
    except InvalidShareCode as e:
        return {
            "steam_id": steam_id,
            "discovered": 0,
            "processed": 0,
            "errors": [str(e)],
        }

    discovered = 0
    parsed_target = 0
    errors: list[str] = []

    for _ in range(cap):
        try:
            info = decode_match_share_code(known)
        except InvalidShareCode as e:
            errors.append(str(e))
            break

        row = db.get(ValveMatchRecord, known)
        if row is None:
            row = ValveMatchRecord(
                share_code=known,
                steam_id=steam_id,
                match_id=str(info.match_id),
                reservation_id=str(info.reservation_id),
                tv_port=info.tv_port,
                status=MatchStatus.pending.value,
            )
            db.add(row)
            discovered += 1
            db.commit()

        try:
            known = get_next_match_sharing_code(steam_id, auth_code, known)
        except ValveMatchHistoryError as e:
            errors.append(str(e))
            break

    link.last_sync_at = datetime.now(timezone.utc)
    db.commit()

    pending = (
        db.query(ValveMatchRecord)
        .filter(
            ValveMatchRecord.steam_id == steam_id,
            ValveMatchRecord.status.in_(
                [MatchStatus.pending.value, MatchStatus.failed.value]
            ),
        )
        .limit(cap)
        .all()
    )
    for row in pending:
        try:
            if process_valve_match_record(db, row.share_code):
                parsed_target += 1
        except Exception as e:
            errors.append(f"{row.share_code}: {e}"[:200])

    return {
        "steam_id": steam_id,
        "discovered": discovered,
        "processed": parsed_target,
        "errors": errors[:5],
    }


def process_valve_match_record(db: Session, share_code: str) -> bool:
    row = db.get(ValveMatchRecord, share_code)
    if row is None:
        raise RuntimeError(f"Unknown valve share code {share_code!r}")

    # Manual upload recovery: local archive/dem present even if Steam had no_demo.
    if row.status == MatchStatus.no_demo.value:
        dem_path = Path(row.local_dem_path) if row.local_dem_path else None
        archive = Path(row.local_archive_path) if row.local_archive_path else None
        if dem_path and dem_path.is_file() and dem_path.stat().st_size > 0:
            _reparse_valve_dem(db, row, dem_path)
            return True
        if archive and archive.is_file() and archive.stat().st_size > 0:
            process_saved_valve_upload(db, share_code)
            return True
        return False

    if row.status == MatchStatus.parsed.value and _analytics_is_current(row.analytics):
        return True

    if row.status == MatchStatus.parsed.value and row.local_dem_path:
        dem_path = Path(row.local_dem_path)
        if dem_path.is_file() and dem_path.stat().st_size > 0:
            _reparse_valve_dem(db, row, dem_path)
            return True

    link = get_valve_link(db, row.steam_id)
    if link is None:
        row.status = MatchStatus.failed.value
        row.error_message = "Valve MM link missing"
        db.commit()
        return False

    auth_code = decrypt_secret(link.auth_code_encrypted)
    match_id = int(row.match_id or 0)
    outcome_id = int(row.reservation_id or 0)

    row.status = MatchStatus.downloading.value
    row.error_message = None
    db.commit()

    try:
        demo_url = row.demo_url
        if not demo_url:
            demo_url = fetch_match_demo_url(row.steam_id, auth_code, match_id, outcome_id)
            row.demo_url = demo_url
            db.commit()

        if not demo_url:
            row.status = MatchStatus.no_demo.value
            row.error_message = "Demo URL not available from Steam API (GC resolver may be required)"
            db.commit()
            return False

        mdir = _valve_match_dir(share_code)
        ext = ".dem.bz2"
        low = demo_url.lower()
        if ".dem.zst" in low:
            ext = ".dem.zst"
        elif ".dem.gz" in low:
            ext = ".dem.gz"
        elif low.endswith(".dem"):
            ext = ".dem"

        archive_path = mdir / f"demo{ext}"
        download_file(demo_url, archive_path)
        row.local_archive_path = str(archive_path.resolve())

        row.status = MatchStatus.decompressing.value
        db.commit()

        dem_path = mdir / "parsed.dem"
        decompress_to_dem(archive_path, dem_path)
        if not dem_path.is_file() or dem_path.stat().st_size <= 0:
            raise RuntimeError("Decompressed Valve demo is missing or empty")

        row.local_dem_path = str(dem_path.resolve())
        _reparse_valve_dem(db, row, dem_path)
        discard_compressed_archive(db, row)
        return True
    except Exception as e:
        row.status = MatchStatus.failed.value
        row.error_message = str(e)[:8000]
        db.commit()
        raise


def _reparse_valve_dem(db: Session, row: ValveMatchRecord, dem_path: Path) -> None:
    row.status = MatchStatus.parsing.value
    db.commit()
    summary, analytics = parse_dem_full(dem_path, verbose=False)
    row.parse_summary = summary
    row.analytics = analytics
    row.status = MatchStatus.parsed.value
    row.error_message = None
    db.commit()


# Manual uploads (Premier fallback when Steam returns no demo URL).
_MAX_UPLOAD_BYTES = 400 * 1024 * 1024  # 400 MB
# Chunk size for Cloudflare-safe browser uploads (~100 MB request limit).
CHUNK_UPLOAD_SIZE = 8 * 1024 * 1024  # 8 MB


def _upload_staging_dir(upload_id: str) -> Path:
    safe = "".join(c for c in upload_id if c.isalnum() or c in "-_")
    if not safe or safe != upload_id:
        raise ValueError("Invalid upload_id")
    d = Path(settings.demos_dir) / "upload_staging" / safe
    d.mkdir(parents=True, exist_ok=True)
    return d


def init_chunked_valve_upload(
    *,
    steam_id: str,
    share_code_raw: str,
    filename: str,
    total_bytes: int,
) -> dict:
    """Start a multi-chunk manual Valve demo upload (bypasses Cloudflare body limits)."""
    import json
    import uuid

    sid = str(steam_id).strip()
    if len(sid) < 5:
        raise ValueError("steam_id is too short")
    if total_bytes < 1024:
        raise ValueError("Demo file is empty or too small")
    if total_bytes > _MAX_UPLOAD_BYTES:
        raise ValueError("Demo file too large (max 400 MB)")

    # Validate filename extension early.
    _upload_ext_from_filename(filename)
    share = resolve_upload_share_code(share_code_raw=share_code_raw, filename=filename)

    total_chunks = (total_bytes + CHUNK_UPLOAD_SIZE - 1) // CHUNK_UPLOAD_SIZE
    upload_id = str(uuid.uuid4())
    staging = _upload_staging_dir(upload_id)
    meta = {
        "upload_id": upload_id,
        "steam_id": sid,
        "share_code": share,
        "filename": filename,
        "total_bytes": int(total_bytes),
        "total_chunks": int(total_chunks),
        "chunk_size": CHUNK_UPLOAD_SIZE,
        "received": [],
    }
    (staging / "meta.json").write_text(json.dumps(meta), encoding="utf-8")
    return {
        "upload_id": upload_id,
        "share_code": share,
        "chunk_size": CHUNK_UPLOAD_SIZE,
        "total_chunks": total_chunks,
        "total_bytes": int(total_bytes),
    }


def save_valve_upload_chunk(upload_id: str, index: int, data: bytes) -> dict:
    """Persist one chunk for a staged Valve demo upload."""
    import json

    if index < 0:
        raise ValueError("Invalid chunk index")
    if not data:
        raise ValueError("Empty chunk")
    if len(data) > CHUNK_UPLOAD_SIZE + 64 * 1024:
        raise ValueError("Chunk too large")

    staging = _upload_staging_dir(upload_id)
    meta_path = staging / "meta.json"
    if not meta_path.is_file():
        raise ValueError("Unknown or expired upload_id")
    meta = json.loads(meta_path.read_text(encoding="utf-8"))
    total_chunks = int(meta["total_chunks"])
    if index >= total_chunks:
        raise ValueError(f"Chunk index out of range (0..{total_chunks - 1})")

    chunk_path = staging / f"chunk_{index:05d}"
    chunk_path.write_bytes(data)
    received = set(meta.get("received") or [])
    received.add(index)
    meta["received"] = sorted(received)
    meta_path.write_text(json.dumps(meta), encoding="utf-8")
    return {
        "upload_id": upload_id,
        "index": index,
        "bytes": len(data),
        "received_chunks": len(received),
        "total_chunks": total_chunks,
    }


def complete_chunked_valve_upload(db: Session, upload_id: str) -> dict:
    """Assemble chunks, save as a Valve demo, then delete the staging dir."""
    import json
    import shutil

    staging = _upload_staging_dir(upload_id)
    meta_path = staging / "meta.json"
    if not meta_path.is_file():
        raise ValueError("Unknown or expired upload_id")
    meta = json.loads(meta_path.read_text(encoding="utf-8"))
    total_chunks = int(meta["total_chunks"])
    total_bytes = int(meta["total_bytes"])
    received = set(meta.get("received") or [])
    missing = [i for i in range(total_chunks) if i not in received]
    if missing:
        raise ValueError(f"Missing chunks: {missing[:10]}{'…' if len(missing) > 10 else ''}")

    parts: list[bytes] = []
    size = 0
    for i in range(total_chunks):
        chunk_path = staging / f"chunk_{i:05d}"
        if not chunk_path.is_file():
            raise ValueError(f"Missing chunk file {i}")
        blob = chunk_path.read_bytes()
        parts.append(blob)
        size += len(blob)
    if size != total_bytes:
        raise ValueError(f"Assembled size {size} != declared {total_bytes}")

    data = b"".join(parts)
    try:
        saved = save_uploaded_valve_demo(
            db,
            steam_id=str(meta["steam_id"]),
            share_code_raw=str(meta["share_code"]),
            filename=str(meta["filename"]),
            data=data,
        )
    finally:
        shutil.rmtree(staging, ignore_errors=True)
    return saved


def _upload_ext_from_filename(filename: str) -> str:
    name = (filename or "").strip().lower()
    if name.endswith(".dem.bz2") or name.endswith(".bz2"):
        return ".dem.bz2"
    if name.endswith(".dem.zst") or name.endswith(".zst"):
        return ".dem.zst"
    if name.endswith(".dem.gz") or name.endswith(".gz"):
        return ".dem.gz"
    if name.endswith(".dem"):
        return ".dem"
    raise ValueError("Unsupported file type — use .dem, .dem.bz2, .dem.gz, or .dem.zst")


def save_uploaded_valve_demo(
    db: Session,
    *,
    steam_id: str,
    share_code_raw: str,
    filename: str,
    data: bytes,
) -> dict:
    """
    Store a manually uploaded Valve demo and enqueue/parse later via
    `process_saved_valve_upload`.

    Bypasses Steam demo URL fetch (used when status would otherwise be no_demo).
    """
    sid = str(steam_id).strip()
    if len(sid) < 5:
        raise ValueError("steam_id is too short")
    if not data or len(data) < 1024:
        raise ValueError("Demo file is empty or too small")
    if len(data) > _MAX_UPLOAD_BYTES:
        raise ValueError("Demo file too large (max 400 MB)")

    ext = _upload_ext_from_filename(filename)
    share = resolve_upload_share_code(share_code_raw=share_code_raw, filename=filename)
    info = decode_match_share_code(share)

    row = db.get(ValveMatchRecord, share)
    if row is None:
        row = ValveMatchRecord(
            share_code=share,
            steam_id=sid,
            match_id=str(info.match_id),
            reservation_id=str(info.reservation_id),
            tv_port=info.tv_port,
            status=MatchStatus.pending.value,
        )
        db.add(row)
    else:
        if not row.steam_id:
            row.steam_id = sid
        row.match_id = str(info.match_id)
        row.reservation_id = str(info.reservation_id)
        row.tv_port = info.tv_port
        row.error_message = None
        row.status = MatchStatus.pending.value

    mdir = _valve_match_dir(share)
    archive_path = mdir / f"upload{ext}"
    archive_path.write_bytes(data)
    row.local_archive_path = str(archive_path.resolve())
    row.local_dem_path = None
    row.demo_url = row.demo_url or "manual-upload"
    db.commit()

    return {
        "share_code": share,
        "steam_id": row.steam_id,
        "match_id": row.match_id,
        "status": row.status,
        "bytes": len(data),
    }


def process_saved_valve_upload(db: Session, share_code: str) -> dict:
    """Decompress + parse a previously saved manual Valve upload."""
    try:
        share = extract_match_share_code(share_code)
    except InvalidShareCode:
        share = str(share_code).strip()

    row = db.get(ValveMatchRecord, share)
    if row is None:
        raise RuntimeError(f"Unknown valve share code {share!r}")

    archive = Path(row.local_archive_path) if row.local_archive_path else None
    dem_existing = Path(row.local_dem_path) if row.local_dem_path else None

    if dem_existing and dem_existing.is_file() and dem_existing.stat().st_size > 0:
        _reparse_valve_dem(db, row, dem_existing)
        return {"share_code": share, "status": row.status, "parsed": True}

    if archive is None or not archive.is_file() or archive.stat().st_size <= 0:
        row.status = MatchStatus.failed.value
        row.error_message = "Uploaded demo file missing on disk"
        db.commit()
        raise RuntimeError(row.error_message)

    row.status = MatchStatus.decompressing.value
    row.error_message = None
    db.commit()

    dem_path = _valve_match_dir(share) / "parsed.dem"
    try:
        decompress_to_dem(archive, dem_path)
        if not dem_path.is_file() or dem_path.stat().st_size <= 0:
            raise RuntimeError("Decompressed Valve demo is missing or empty")
        row.local_dem_path = str(dem_path.resolve())
        _reparse_valve_dem(db, row, dem_path)
        discard_compressed_archive(db, row)
        return {"share_code": share, "status": row.status, "parsed": True}
    except Exception as e:
        row.status = MatchStatus.failed.value
        row.error_message = str(e)[:8000]
        db.commit()
        raise


def valve_link_status(db: Session, steam_id: str) -> dict:
    from sqlalchemy import func

    link = get_valve_link(db, steam_id)
    if link is None:
        return {"linked": False, "steam_id": steam_id}

    status_rows = (
        db.query(ValveMatchRecord.status, func.count())
        .filter(ValveMatchRecord.steam_id == steam_id)
        .group_by(ValveMatchRecord.status)
        .all()
    )
    return {
        "linked": True,
        "steam_id": steam_id,
        "latest_share_code": link.latest_share_code,
        "last_sync_at": link.last_sync_at.isoformat() if link.last_sync_at else None,
        "matches_by_status": {str(st): int(n) for st, n in status_rows},
    }
