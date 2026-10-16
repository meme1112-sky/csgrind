from __future__ import annotations

from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Annotated, Any

from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, Query, Request, UploadFile
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.auth import require_internal_auth
from app.celery_app import app as celery_app
from app.config import settings
from app.db import engine, ensure_sqlite_schema_compat, get_db
from app.faceit_client import FaceitClient
from app.models import Base, FaceitMatchRecord, LinkedPlayer, MatchStatus, ValveMatchRecord
from app.schemas import LinkPlayerBody, LinkPlayerResponse, MatchOut, ValveLinkBody, ValveLinkResponse, ValveMatchOut
from app.services.analytics_display import build_leetify_by_steam_payload
from app.services.analytics_orchestrate import ensure_linked_player
from app.tasks import (
    archive_steam_demos,
    process_match_task,
    process_valve_upload_task,
    refresh_player_history,
    refresh_steam_analytics,
    sync_valve_mm_task,
)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    Path("data").mkdir(parents=True, exist_ok=True)
    settings.demos_dir.mkdir(parents=True, exist_ok=True)
    Base.metadata.create_all(bind=engine)
    ensure_sqlite_schema_compat()
    yield


app = FastAPI(title="CSGrind demo pipeline & analytics", lifespan=lifespan)


def _normalize_steam_id_for_compare(raw: object) -> str:
    """Canonical string for SteamID64 so path, query, and JSON int/float/string all match."""
    if raw is None or isinstance(raw, bool):
        return ""
    if isinstance(raw, int):
        return str(raw)
    if isinstance(raw, float):
        if raw != raw:  # NaN
            return ""
        # Steam IDs are integers; avoid float string like '7.656e+17'
        return str(int(raw)) if raw.is_integer() else ""
    s = str(raw).strip()
    if s.replace(".", "", 1).isdigit() and "." in s:
        try:
            f = float(s)
            return str(int(f)) if f.is_integer() else ""
        except ValueError:
            return s
    return s


def _steam_ids_match(stored: object, query: str) -> bool:
    a = _normalize_steam_id_for_compare(stored)
    b = _normalize_steam_id_for_compare(query)
    return bool(a and b and a == b)


def _player_stats_for_steam_in_match(
    row: FaceitMatchRecord | ValveMatchRecord, steam_id: str, *, prefer_side: str = "all"
) -> dict | None:
    """Return the analytics row for one Steam ID; prefers `prefer_side`, else first matching row."""
    a = row.analytics
    if not a or not isinstance(a.get("players"), list):
        return None
    want = str(steam_id).strip()
    matches = [p for p in a["players"] if _steam_ids_match(p.get("steamid"), want)]
    if not matches:
        return None
    for p in matches:
        if p.get("side") == prefer_side:
            return p
    return matches[0]


def _averages_from_stat_dicts(stat_rows: list[dict]) -> dict:
    from statistics import mean

    def avg(key: str) -> float | None:
        vals = [s[key] for s in stat_rows if isinstance(s.get(key), (int, float))]
        return float(mean(vals)) if vals else None

    return {
        "rating": avg("rating"),
        "adr": avg("adr"),
        "kast": avg("kast"),
        "kills": avg("kills"),
        "deaths": avg("deaths"),
        "headshot_pct": avg("headshot_pct"),
        "time_to_damage": avg("time_to_damage"),
        "crosshair_placement": avg("crosshair_placement"),
        "utility_damage": avg("utility_damage"),
        "kills_through_smokes": avg("kills_through_smokes"),
        "opening_kills_won": avg("opening_kills_won"),
        "opening_kills_lost": avg("opening_kills_lost"),
        "knife_inspections": avg("knife_inspections"),
    }


def _played_at_iso(row: FaceitMatchRecord | ValveMatchRecord) -> str | None:
    finished = getattr(row, "match_finished_at", None)
    if isinstance(finished, int) and finished > 0:
        # FACEIT timestamps are usually unix seconds.
        ts = finished if finished > 1_000_000_000_000 else finished * 1000
        try:
            from datetime import datetime, timezone

            return datetime.fromtimestamp(ts / 1000, tz=timezone.utc).isoformat()
        except (OverflowError, OSError, ValueError):
            pass
    if row.updated_at:
        return row.updated_at.isoformat()
    return None


def _collect_per_match_for_steam(
    db: Session,
    steam_id: str,
    *,
    faceit_player_id: str | None,
    max_matches: int,
) -> tuple[list[dict], int]:
    """Build per-match analytics rows from FACEIT + Valve MM parsed demos."""
    per_match: list[dict] = []
    scanned = 0

    if faceit_player_id:
        rows = (
            db.query(FaceitMatchRecord)
            .filter(
                FaceitMatchRecord.player_faceit_id == faceit_player_id,
                FaceitMatchRecord.status == MatchStatus.parsed.value,
                FaceitMatchRecord.analytics.isnot(None),
            )
            .order_by(FaceitMatchRecord.updated_at.desc())
            .limit(max(max_matches * 5, 100))
            .all()
        )
        for row in rows:
            scanned += 1
            p = _player_stats_for_steam_in_match(row, steam_id)
            if not p:
                continue
            a = row.analytics or {}
            meta = row.match_meta if isinstance(row.match_meta, dict) else {}
            if not meta and isinstance(a.get("match_result"), dict):
                meta = a["match_result"]
            m = (
                (meta.get("map_name") if meta else None)
                or (row.parse_summary.get("map_name") if row.parse_summary else None)
                or a.get("map_name")
            )
            per_match.append(
                {
                    "match_id": row.match_id,
                    "source": "faceit",
                    "faceit_player_id": row.player_faceit_id,
                    "map_name": m,
                    "updated_at": _played_at_iso(row),
                    "score_us": meta.get("score_us") if meta else None,
                    "score_them": meta.get("score_them") if meta else None,
                    "outcome": meta.get("outcome") if meta else None,
                    "stats": p,
                }
            )

    valve_rows = (
        db.query(ValveMatchRecord)
        .filter(
            ValveMatchRecord.steam_id == steam_id,
            ValveMatchRecord.status == MatchStatus.parsed.value,
            ValveMatchRecord.analytics.isnot(None),
        )
        .order_by(ValveMatchRecord.updated_at.desc())
        .limit(max(max_matches * 5, 100))
        .all()
    )
    seen_share_codes: set[str] = set()

    def _append_valve(row: ValveMatchRecord) -> None:
        nonlocal scanned
        if row.share_code in seen_share_codes:
            return
        scanned += 1
        p = _player_stats_for_steam_in_match(row, steam_id)
        if not p:
            return
        seen_share_codes.add(row.share_code)
        a = row.analytics or {}
        m = row.parse_summary.get("map_name") if row.parse_summary else None
        per_match.append(
            {
                "match_id": row.share_code,
                "source": "valve",
                "faceit_player_id": None,
                "map_name": m or a.get("map_name"),
                "updated_at": _played_at_iso(row),
                "score_us": None,
                "score_them": None,
                "outcome": None,
                "stats": p,
            }
        )

    for row in valve_rows:
        _append_valve(row)

    # Coverage model: a linked teammate's parsed demo includes the full lobby.
    # Surface those matches for any Steam ID that appears in analytics.players.
    coverage_rows = (
        db.query(ValveMatchRecord)
        .filter(
            ValveMatchRecord.status == MatchStatus.parsed.value,
            ValveMatchRecord.analytics.isnot(None),
            ValveMatchRecord.steam_id != steam_id,
        )
        .order_by(ValveMatchRecord.updated_at.desc())
        .limit(250)
        .all()
    )
    for row in coverage_rows:
        _append_valve(row)

    per_match.sort(key=lambda x: x.get("updated_at") or "", reverse=True)

    # Keep Premier/Valve demos in the integrity window when FACEIT would otherwise
    # fill every slot (manual uploads + MM sync must still affect Neok AI).
    if len(per_match) > max_matches:
        valve_pool = [m for m in per_match if m.get("source") == "valve"]
        other = [m for m in per_match if m.get("source") != "valve"]
        valve_keep = min(len(valve_pool), max(1, max_matches // 3))
        other_keep = max_matches - valve_keep
        selected = other[:other_keep] + valve_pool[:valve_keep]
        selected.sort(key=lambda x: x.get("updated_at") or "", reverse=True)
        per_match = selected
    else:
        per_match = per_match[:max_matches]

    return per_match, scanned


@app.get("/")
def root():
    return {"service": "csgrind-extra-backend", "health": "/health", "docs": "/docs"}


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/v1/players/link", response_model=LinkPlayerResponse)
def link_player(
    body: LinkPlayerBody,
    db: Session = Depends(get_db),
    _: None = Depends(require_internal_auth),
):
    if not settings.faceit_key:
        raise HTTPException(500, "FACEIT_KEY is not configured")
    try:
        fc = FaceitClient()
        p = fc.get_player_by_nickname(body.nickname.strip())
    except Exception as e:
        raise HTTPException(502, f"FACEIT lookup failed: {e}") from e

    fid = p.get("player_id")
    nick = p.get("nickname") or body.nickname.strip()
    if not fid:
        raise HTTPException(502, "FACEIT response missing player_id")

    row = db.query(LinkedPlayer).filter_by(faceit_player_id=str(fid)).one_or_none()
    if row:
        row.nickname = str(nick)
    else:
        row = LinkedPlayer(faceit_player_id=str(fid), nickname=str(nick))
        db.add(row)
    db.commit()
    db.refresh(row)
    return LinkPlayerResponse(id=row.id, faceit_player_id=row.faceit_player_id, nickname=row.nickname)


@app.post("/v1/players/{faceit_player_id}/sync")
def sync_player_matches(
    faceit_player_id: str,
    limit: int = Query(20, ge=1, le=100),
    retry_failed: bool = Query(False),
    enqueue_processing: bool = Query(False),
    db: Session = Depends(get_db),
    _: None = Depends(require_internal_auth),
):
    linked = db.query(LinkedPlayer).filter_by(faceit_player_id=faceit_player_id).one_or_none()
    if not linked:
        raise HTTPException(404, "Player not linked; POST /v1/players/link first")

    if settings.celery_eager:
        result = refresh_player_history(
            faceit_player_id, limit=limit, retry_failed=retry_failed, enqueue_processing=enqueue_processing
        )
    else:
        async_result = refresh_player_history.delay(
            faceit_player_id, limit=limit, retry_failed=retry_failed, enqueue_processing=enqueue_processing
        )
        result = {"task_id": async_result.id, "state": "queued"}
    return {"faceit_player_id": faceit_player_id, "result": result}


@app.get("/v1/players/{faceit_player_id}/matches", response_model=list[MatchOut])
def list_player_matches(faceit_player_id: str, db: Session = Depends(get_db)):
    linked = db.query(LinkedPlayer).filter_by(faceit_player_id=faceit_player_id).one_or_none()
    if not linked:
        raise HTTPException(
            404,
            "Unknown player_id. Link first via POST /v1/players/link (nickname -> faceit_player_id), "
            "then POST /v1/players/{faceit_player_id}/sync.",
        )
    rows = (
        db.query(FaceitMatchRecord)
        .filter_by(player_faceit_id=faceit_player_id)
        .order_by(FaceitMatchRecord.updated_at.desc())
        .limit(200)
        .all()
    )
    return rows


@app.get("/v1/players/by-nickname/{nickname}/matches", response_model=list[MatchOut])
def list_matches_by_nickname(
    nickname: str,
    sync: bool = Query(False),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    x_internal_token: Annotated[str | None, Header(alias="X-Internal-Token")] = None,
):
    """
    Convenience endpoint:
    - Resolves nickname -> faceit_player_id via FACEIT Data API (requires FACEIT_KEY)
    - Optionally triggers a sync (sync=true) to pull recent matches and enqueue processing.
    - Returns currently stored matches (may be empty until sync completes).
    """
    if sync:
        require_internal_auth(x_internal_token)

    if not settings.faceit_key:
        raise HTTPException(500, "FACEIT_KEY is not configured")
    try:
        fc = FaceitClient()
        p = fc.get_player_by_nickname(nickname.strip())
    except Exception as e:
        raise HTTPException(502, f"FACEIT lookup failed: {e}") from e

    fid = p.get("player_id")
    if not fid:
        raise HTTPException(502, "FACEIT response missing player_id")
    faceit_player_id = str(fid)

    linked = db.query(LinkedPlayer).filter_by(faceit_player_id=faceit_player_id).one_or_none()
    if not linked:
        linked = LinkedPlayer(faceit_player_id=faceit_player_id, nickname=str(p.get("nickname") or nickname))
        db.add(linked)
        db.commit()

    if sync:
        if settings.celery_eager:
            refresh_player_history(faceit_player_id, limit=limit, retry_failed=False, enqueue_processing=False)
        else:
            refresh_player_history.delay(faceit_player_id, limit=limit, retry_failed=False, enqueue_processing=False)

    rows = (
        db.query(FaceitMatchRecord)
        .filter_by(player_faceit_id=faceit_player_id)
        .order_by(FaceitMatchRecord.updated_at.desc())
        .limit(200)
        .all()
    )
    return rows


@app.get("/v1/matches/{match_id}", response_model=MatchOut)
def get_match(match_id: str, db: Session = Depends(get_db)):
    row = db.get(FaceitMatchRecord, match_id)
    if not row:
        raise HTTPException(404, "Unknown match")
    return row


@app.get("/v1/matches/{match_id}/analytics")
def get_match_analytics(match_id: str, db: Session = Depends(get_db)):
    """Leetify-style per-match stats (HLTV rating, ADR, KAST, HS%, grenades) after demo processing."""
    row = db.get(FaceitMatchRecord, match_id)
    if not row:
        raise HTTPException(404, "Unknown match")
    if row.status != MatchStatus.parsed.value:
        raise HTTPException(409, f"Match not parsed yet (status={row.status})")
    if not row.analytics:
        raise HTTPException(404, "No analytics stored; re-run process or POST .../analytics/recompute")
    return row.analytics


@app.post("/v1/matches/{match_id}/analytics/recompute")
def recompute_match_analytics(
    match_id: str,
    db: Session = Depends(get_db),
    _: None = Depends(require_internal_auth),
):
    """Re-parse local .dem and refresh analytics only (no re-download)."""
    from app.services.analytics import analytics_from_dem_path

    row = db.get(FaceitMatchRecord, match_id)
    if not row:
        raise HTTPException(404, "Unknown match")
    dem_path = row.local_dem_path
    if not dem_path:
        raise HTTPException(400, "No local demo path; process the match first")
    p = Path(dem_path)
    if not p.is_file():
        raise HTTPException(400, f"Demo file missing on disk: {dem_path}")
    try:
        row.analytics = analytics_from_dem_path(p)
    except Exception as e:
        raise HTTPException(500, f"Analytics failed: {e}") from e
    db.commit()
    db.refresh(row)
    return {"match_id": match_id, "state": "ok", "analytics": row.analytics}


def _player_pipeline_diagnostics(db: Session, fid: str) -> dict[str, Any]:
    """Status breakdown + a few sample errors so an empty result is still debuggable."""
    status_rows = (
        db.query(FaceitMatchRecord.status, func.count())
        .filter(FaceitMatchRecord.player_faceit_id == fid)
        .group_by(FaceitMatchRecord.status)
        .all()
    )
    matches_by_status = {str(st): int(n) for st, n in status_rows}
    failed_rows = (
        db.query(FaceitMatchRecord)
        .filter(
            FaceitMatchRecord.player_faceit_id == fid,
            FaceitMatchRecord.status == MatchStatus.failed.value,
            FaceitMatchRecord.error_message.isnot(None),
        )
        .limit(8)
        .all()
    )
    sample_errors: list[str] = []
    seen: set[str] = set()
    for fr in failed_rows:
        em = (fr.error_message or "").strip()
        if em and em not in seen:
            seen.add(em)
            sample_errors.append(em[:2000])
        if len(sample_errors) >= 3:
            break
    return {"matches_by_status_for_player": matches_by_status, "sample_row_errors": sample_errors}


def _build_cached_analytics_payload(
    db: Session,
    steam_id: str,
    faceit_player_id: str | None,
    *,
    max_matches: int,
    scan_recent: int,
    premier_rating: int | None,
    faceit_elo: int | float | None = None,
) -> tuple[dict, int]:
    """Build the Leetify-style dashboard from FACEIT + Valve MM analytics in the DB."""
    per_match, scanned = _collect_per_match_for_steam(
        db, steam_id, faceit_player_id=faceit_player_id, max_matches=max_matches
    )
    stat_rows = [item["stats"] for item in per_match]
    averages = _averages_from_stat_dicts(stat_rows)
    payload = build_leetify_by_steam_payload(
        steam_id,
        max_matches=max_matches,
        scan_recent=scan_recent,
        matches_scanned=scanned,
        per_match_raw=per_match,
        averages=averages,
        premier_rating=premier_rating,
        faceit_elo=faceit_elo,
    )
    return payload, len(per_match)


def _derive_analytics_status(
    n: int,
    job: dict[str, Any],
    fid: str | None,
    pipeline_info: dict[str, Any],
) -> str:
    """ready | refreshing | unavailable | empty"""
    if n > 0:
        return "ready"
    if job.get("state") == "queued":
        return "refreshing"
    by_status = pipeline_info.get("matches_by_status_for_player") or {}
    if isinstance(by_status, dict) and by_status:
        in_flight = sum(
            int(by_status.get(s, 0) or 0)
            for s in ("pending", "downloading", "decompressing", "parsing")
        )
        if in_flight > 0:
            return "refreshing"
        parsed = int(by_status.get("parsed", 0) or 0)
        blocked = int(by_status.get("failed", 0) or 0) + int(by_status.get("no_demo", 0) or 0)
        if fid and parsed == 0 and blocked > 0:
            return "unavailable"
    if job.get("state") in ("done", "eager") and n == 0 and fid:
        return "unavailable"
    if job.get("state") in ("done", "eager"):
        return "empty"
    return "empty"


def _enqueue_steam_refresh(db: Session, steam_id: str, *, max_matches: int, scan_recent: int) -> dict[str, Any]:
    """Kick off the background download+parse refresh; returns a small job descriptor for polling."""
    if settings.celery_eager:
        # No broker configured: run inline (blocking) so this same request returns fresh data.
        try:
            result = refresh_steam_analytics(steam_id, max_matches=max_matches, scan_recent=scan_recent)
            db.expire_all()
            return {"state": "done", "eager": True, "result": result}
        except Exception as e:  # noqa: BLE001 - surface as a job error; cached data still serves
            return {"state": "error", "error": str(e)[:500]}
    try:
        async_result = refresh_steam_analytics.delay(steam_id, max_matches=max_matches, scan_recent=scan_recent)
        return {"task_id": async_result.id, "state": "queued"}
    except Exception as e:  # noqa: BLE001 - broker unreachable etc.; cached data still serves
        return {"state": "error", "error": f"Could not enqueue refresh: {e}"[:500]}


def _archive_recently_enqueued(linked: LinkedPlayer | None) -> bool:
    if not linked or not linked.demos_archive_enqueued_at:
        return False
    if settings.archive_dedupe_hours <= 0:
        return False
    ts = linked.demos_archive_enqueued_at
    if ts.tzinfo is None:
        ts = ts.replace(tzinfo=timezone.utc)
    age = datetime.now(timezone.utc) - ts
    return age < timedelta(hours=settings.archive_dedupe_hours)


def _enqueue_steam_archive(db: Session, steam_id: str, *, scan_recent: int) -> dict[str, Any]:
    """Enqueue proactive demo archival (non-blocking)."""
    sid = str(steam_id).strip()
    linked = db.query(LinkedPlayer).filter_by(steam_id=sid).one_or_none()
    if _archive_recently_enqueued(linked):
        return {"state": "skipped", "reason": "recently_enqueued"}

    now = datetime.now(timezone.utc)

    def _stamp_enqueue_time() -> None:
        nonlocal linked
        if linked is None and settings.faceit_key:
            try:
                fc = FaceitClient()
                player = fc.get_player_by_steam64(sid)
                pid = str(player.get("player_id") or "").strip()
                nickname = str(player.get("nickname") or "").strip()
                if pid:
                    linked = ensure_linked_player(db, pid, nickname, steam_id=sid)
            except Exception:
                return
        if linked is not None:
            linked.demos_archive_enqueued_at = now
            db.commit()

    if settings.celery_eager:
        try:
            result = archive_steam_demos(sid, scan_recent=scan_recent)
            db.expire_all()
            _stamp_enqueue_time()
            return {"state": "done", "eager": True, "result": result}
        except Exception as e:  # noqa: BLE001
            return {"state": "error", "error": str(e)[:500]}

    try:
        async_result = archive_steam_demos.delay(sid, scan_recent=scan_recent)
        _stamp_enqueue_time()
        return {"task_id": async_result.id, "state": "queued"}
    except Exception as e:  # noqa: BLE001
        return {"state": "error", "error": f"Could not enqueue archive: {e}"[:500]}


@app.post("/v1/analytics/archive/by-steam/{steam_id}")
def archive_demos_by_steam(
    steam_id: str,
    scan_recent: int = Query(
        None,
        ge=1,
        le=100_000,
        description="How many recent FACEIT matches to try archiving (default from ARCHIVE_SCAN_RECENT).",
    ),
    db: Session = Depends(get_db),
    _: None = Depends(require_internal_auth),
):
    """
    Proactively download+parse recent FACEIT demos when a profile is viewed.

    Non-blocking: enqueues a Celery task. Deduped per player for ``archive_dedupe_hours``.
    """
    sid = str(steam_id).strip()
    if len(sid) < 5:
        raise HTTPException(400, "steam_id is too short")

    cap = scan_recent if scan_recent is not None else settings.archive_scan_recent
    job = _enqueue_steam_archive(db, sid, scan_recent=cap)
    return {"steam_id": sid, "scan_recent": cap, "job": job}


@app.get("/v1/analytics/by-steam/{steam_id}")
def get_analytics_by_steam(
    steam_id: str,
    max_matches: int = Query(
        5,
        ge=1,
        le=200,
        description="How many recent FACEIT matches the background refresh downloads+parses, then aggregates",
    ),
    scan_recent: int = Query(
        50,
        ge=1,
        le=100_000,
        description="How many FACEIT history entries to pull (newest first); processing uses the first max_matches",
    ),
    premier_rating: int | None = Query(
        None,
        ge=0,
        le=40_000,
        description="CS2 Premier rating/grade used to select risk thresholds (static/risk/premier_*.json).",
    ),
    faceit_elo: int | None = Query(
        None,
        ge=0,
        le=10_000,
        description=(
            "FACEIT CS2 Elo used to select risk thresholds when Premier is missing/unranked."
        ),
    ),
    refresh: bool = Query(
        True,
        description="Enqueue a background Celery refresh (download+parse newest demos). Set false to read cache only.",
    ),
    db: Session = Depends(get_db),
    x_internal_token: Annotated[str | None, Header(alias="X-Internal-Token")] = None,
):
    """
    **Non-blocking dashboard.** Returns analytics already cached in the DB *immediately*, and (by default)
    enqueues a background Celery task that resolves Steam → FACEIT, downloads the newest demos, parses them,
    and stores fresh analytics. Poll `GET /v1/analytics/jobs/{task_id}` (`payload.job.task_id`) until it is
    `ready`, then re-fetch this endpoint to read the refreshed cache.

    The heavy refresh requires `FACEIT_KEY` + `FACEIT_DOWNLOAD_TOKEN` and a running Celery worker
    (or `CELERY_EAGER=true` to run it inline, which makes this call blocking again).

    When ``refresh=true``, callers must supply ``X-Internal-Token`` (service auth).
    """
    if refresh:
        require_internal_auth(x_internal_token)

    sid = str(steam_id).strip()
    if len(sid) < 5:
        raise HTTPException(400, "steam_id is too short")

    linked = db.query(LinkedPlayer).filter_by(steam_id=sid).one_or_none()

    job: dict[str, Any] = (
        _enqueue_steam_refresh(db, sid, max_matches=max_matches, scan_recent=scan_recent)
        if refresh
        else {"state": "skipped"}
    )

    # In eager mode the refresh ran inline and may have created the steam_id → FACEIT mapping just now.
    if linked is None:
        linked = db.query(LinkedPlayer).filter_by(steam_id=sid).one_or_none()

    fid = linked.faceit_player_id if linked else None
    nickname = linked.nickname if linked else None

    from app.services.valve_pipeline import valve_link_status

    valve_status = valve_link_status(db, sid)
    if refresh and valve_status.get("linked"):
        if settings.celery_eager:
            try:
                sync_valve_mm_task(steam_id=sid)
                db.expire_all()
            except Exception:
                pass
        else:
            try:
                sync_valve_mm_task.delay(sid)
            except Exception:
                pass

    payload, n = _build_cached_analytics_payload(
        db,
        sid,
        fid,
        max_matches=max_matches,
        scan_recent=scan_recent,
        premier_rating=premier_rating,
        faceit_elo=faceit_elo,
    )

    pipeline_info: dict[str, Any] = {
        "faceit_player_id": fid,
        "nickname": nickname,
        "valve_mm": valve_status,
        "history_match_ids_found": None,
        "matches_processed_attempted": None,
        "process_errors": [],
    }
    if fid and n == 0:
        pipeline_info.update(_player_pipeline_diagnostics(db, fid))
    payload["pipeline"] = pipeline_info

    payload["job"] = job
    payload["status"] = _derive_analytics_status(n, job, fid, pipeline_info)
    return payload


@app.get("/v1/analytics/jobs/{task_id}")
def get_refresh_job(task_id: str):
    """Poll a background refresh enqueued by GET /v1/analytics/by-steam (Celery task state + result)."""
    from celery.result import AsyncResult

    res = AsyncResult(task_id, app=celery_app)
    try:
        state = str(res.state)
        ready = bool(res.ready())
        out: dict[str, Any] = {"task_id": task_id, "state": state, "ready": ready}
        if ready:
            ok = bool(res.successful())
            out["successful"] = ok
            if ok:
                out["result"] = res.result
            else:
                out["error"] = str(res.result)[:1000] if res.result is not None else "task failed"
        return out
    except Exception as e:  # noqa: BLE001 - result backend unreachable; report instead of 500
        # "unknown"/ready=false keeps clients polling rather than treating the refresh as finished.
        return {"task_id": task_id, "state": "unknown", "ready": False, "error": str(e)[:500]}


@app.get("/v1/players/{faceit_player_id}/analytics/rollup")
def rollup_player_analytics(
    faceit_player_id: str,
    steam_id: str = Query(
        ...,
        min_length=5,
        description="SteamID64 as shown in demo analytics (link FACEIT account to Steam in-game).",
    ),
    limit: int = Query(20, ge=1, le=200),
    db: Session = Depends(get_db),
):
    """Average Leetify-style stats across recent parsed demos for one Steam ID."""
    linked = db.query(LinkedPlayer).filter_by(faceit_player_id=faceit_player_id).one_or_none()
    if not linked:
        raise HTTPException(404, "Unknown player; link first")

    rows = (
        db.query(FaceitMatchRecord)
        .filter_by(player_faceit_id=faceit_player_id, status=MatchStatus.parsed.value)
        .order_by(FaceitMatchRecord.updated_at.desc())
        .limit(limit)
        .all()
    )
    points: list[dict] = []
    for row in rows:
        p = _player_stats_for_steam_in_match(row, steam_id)
        if not p:
            continue
        a = row.analytics or {}
        m = row.parse_summary.get("map_name") if row.parse_summary else None
        points.append(
            {
                "match_id": row.match_id,
                "map_name": m or a.get("map_name"),
                "rating": p.get("rating"),
                "adr": p.get("adr"),
                "kast": p.get("kast"),
                "kills": p.get("kills"),
                "deaths": p.get("deaths"),
                "headshot_pct": p.get("headshot_pct"),
            }
        )

    if not points:
        raise HTTPException(
            404,
            "No analytics for that steam_id in recent parsed matches (process demos and ensure steam_id matches demo).",
        )

    stat_rows = [
        {
            "rating": x.get("rating"),
            "adr": x.get("adr"),
            "kast": x.get("kast"),
            "kills": x.get("kills"),
            "deaths": x.get("deaths"),
            "headshot_pct": x.get("headshot_pct"),
        }
        for x in points
    ]

    return {
        "faceit_player_id": faceit_player_id,
        "steam_id": str(steam_id).strip(),
        "matches": len(points),
        "per_match": points,
        "averages": _averages_from_stat_dicts(stat_rows),
    }


@app.post("/v1/matches/{match_id}/process")
def enqueue_process_match(
    match_id: str,
    db: Session = Depends(get_db),
    _: None = Depends(require_internal_auth),
):
    row = db.get(FaceitMatchRecord, match_id)
    if not row:
        raise HTTPException(404, "Unknown match")
    if settings.celery_eager:
        process_match_task(match_id)
        return {"match_id": match_id, "state": "done"}
    ar = process_match_task.delay(match_id)
    return {"match_id": match_id, "task_id": ar.id, "state": "queued"}


@app.post("/v1/debug/faceit/match/{match_id}")
def debug_faceit_match(
    match_id: str,
    _: None = Depends(require_internal_auth),
):
    """Return raw FACEIT match JSON (demo_url fields) without storing."""
    if not settings.faceit_key:
        raise HTTPException(500, "FACEIT_KEY is not configured")
    try:
        fc = FaceitClient()
        m = fc.get_match(match_id)
    except Exception as e:
        raise HTTPException(502, str(e)) from e
    return {
        "match_id": m.get("match_id"),
        "game": m.get("game"),
        "status": m.get("status"),
        "demo_url": m.get("demo_url"),
        "started_at": m.get("started_at"),
        "finished_at": m.get("finished_at"),
    }


@app.get("/v1/valve/link/{steam_id}")
def get_valve_mm_link(
    steam_id: str,
    db: Session = Depends(get_db),
    _: None = Depends(require_internal_auth),
):
    from app.services.valve_pipeline import valve_link_status

    sid = str(steam_id).strip()
    if len(sid) < 5:
        raise HTTPException(400, "steam_id is too short")
    return valve_link_status(db, sid)


def _resolve_valve_share_code(share_code: str) -> str:
    """Normalize share code without uppercasing (Valve codes are case-sensitive)."""
    from app.services.valve_sharecode import InvalidShareCode, extract_match_share_code

    raw = str(share_code or "").strip()
    try:
        return extract_match_share_code(raw)
    except InvalidShareCode:
        if raw.upper().startswith("CSGO-") and len(raw) >= 12:
            # Already a bare code but failed strict extract — keep original case.
            return raw if raw.startswith("CSGO-") else "CSGO-" + raw[5:]
        raise


@app.get("/v1/valve/matches/{share_code}", response_model=ValveMatchOut)
def get_valve_match(share_code: str, db: Session = Depends(get_db)):
    """Return a parsed Valve MM demo by share code (full lobby analytics)."""
    from app.services.valve_sharecode import InvalidShareCode

    try:
        code = _resolve_valve_share_code(share_code)
    except InvalidShareCode:
        code = str(share_code or "").strip()
        if not (code.upper().startswith("CSGO-") and len(code) >= 12):
            # Allow lookup by decoded numeric match_id when share code is unknown.
            row = (
                db.query(ValveMatchRecord)
                .filter(ValveMatchRecord.match_id == code)
                .order_by(ValveMatchRecord.updated_at.desc())
                .first()
            )
            if row:
                return row
            raise HTTPException(400, "Invalid Valve share code") from None

    row = db.get(ValveMatchRecord, code)
    if not row:
        row = (
            db.query(ValveMatchRecord)
            .filter(ValveMatchRecord.match_id == str(share_code).strip())
            .order_by(ValveMatchRecord.updated_at.desc())
            .first()
        )
    if not row:
        raise HTTPException(404, "Unknown Valve match")
    return row


@app.get("/v1/valve/matches/{share_code}/analytics")
def get_valve_match_analytics(share_code: str, db: Session = Depends(get_db)):
    from app.services.valve_sharecode import InvalidShareCode

    try:
        code = _resolve_valve_share_code(share_code)
    except InvalidShareCode:
        code = str(share_code or "").strip()
    row = db.get(ValveMatchRecord, code)
    if not row:
        raise HTTPException(404, "Unknown Valve match")
    if row.status != MatchStatus.parsed.value:
        raise HTTPException(409, f"Match not parsed yet (status={row.status})")
    if not row.analytics:
        raise HTTPException(404, "No analytics stored for this Valve match")
    return row.analytics


@app.post("/v1/valve/matches/upload")
async def post_valve_demo_upload(
    steam_id: str = Form(...),
    share_code: str = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _: None = Depends(require_internal_auth),
):
    """
    Manual Premier/Valve demo upload fallback when Steam does not return a demo URL.

    Accepts .dem / .dem.bz2 / .dem.gz / .dem.zst (max 400 MB). Stores the file, then
    enqueues Celery parse (or runs inline when CELERY_EAGER=true).
    """
    from app.services.valve_pipeline import save_uploaded_valve_demo
    from app.services.valve_sharecode import InvalidShareCode

    sid = str(steam_id).strip()
    if len(sid) < 5:
        raise HTTPException(400, "steam_id is too short")

    raw = await file.read()
    try:
        saved = save_uploaded_valve_demo(
            db,
            steam_id=sid,
            share_code_raw=share_code,
            filename=file.filename or "demo.dem",
            data=raw,
        )
    except InvalidShareCode as e:
        raise HTTPException(400, str(e)) from e
    except ValueError as e:
        raise HTTPException(400, str(e)) from e

    return _enqueue_valve_upload_parse(db, saved)


def _enqueue_valve_upload_parse(db: Session, saved: dict) -> dict:
    """Shared enqueue / eager / inline-fallback for Valve manual uploads."""
    share = saved["share_code"]
    if settings.celery_eager:
        from app.services.valve_pipeline import process_saved_valve_upload

        try:
            result = process_saved_valve_upload(db, share)
            return {**saved, **result, "job": {"state": "done"}}
        except Exception as e:
            raise HTTPException(500, f"Upload saved but parse failed: {e}") from e

    try:
        ar = process_valve_upload_task.apply_async(args=[share], priority=9)
        return {**saved, "job": {"state": "queued", "task_id": ar.id}}
    except Exception as e:
        from app.services.valve_pipeline import process_saved_valve_upload

        try:
            result = process_saved_valve_upload(db, share)
            return {
                **saved,
                **result,
                "job": {
                    "state": "done",
                    "note": f"celery enqueue failed ({e}); parsed inline",
                },
            }
        except Exception as pe:
            raise HTTPException(502, f"Could not enqueue or parse upload: {pe}") from pe


@app.post("/v1/valve/matches/upload/init")
async def post_valve_demo_upload_init(
    steam_id: str = Form(...),
    filename: str = Form(...),
    total_bytes: int = Form(...),
    share_code: str = Form(""),
    _: None = Depends(require_internal_auth),
):
    """Start a chunked Valve demo upload (each chunk stays under Cloudflare limits).

    `share_code` is optional when the filename is Valve-style
    (`match730_<matchId>_<reservationId>_<tvPort>.dem`).
    """
    from app.services.valve_pipeline import init_chunked_valve_upload
    from app.services.valve_sharecode import InvalidShareCode

    try:
        return init_chunked_valve_upload(
            steam_id=steam_id,
            share_code_raw=share_code or "",
            filename=filename,
            total_bytes=int(total_bytes),
        )
    except InvalidShareCode as e:
        raise HTTPException(400, str(e)) from e
    except ValueError as e:
        raise HTTPException(400, str(e)) from e


@app.put("/v1/valve/matches/upload/{upload_id}/chunks/{index}")
async def put_valve_demo_upload_chunk(
    upload_id: str,
    index: int,
    request: Request,
    _: None = Depends(require_internal_auth),
):
    """Receive one binary chunk of a staged Valve demo upload."""
    from app.services.valve_pipeline import save_valve_upload_chunk

    data = await request.body()
    try:
        return save_valve_upload_chunk(upload_id, int(index), data)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e


@app.post("/v1/valve/matches/upload/{upload_id}/complete")
def post_valve_demo_upload_complete(
    upload_id: str,
    db: Session = Depends(get_db),
    _: None = Depends(require_internal_auth),
):
    """Assemble chunks, store the demo, and enqueue parse."""
    from app.services.valve_pipeline import complete_chunked_valve_upload
    from app.services.valve_sharecode import InvalidShareCode

    try:
        saved = complete_chunked_valve_upload(db, upload_id)
    except InvalidShareCode as e:
        raise HTTPException(400, str(e)) from e
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    except Exception as e:
        raise HTTPException(500, f"Failed to assemble upload: {e}") from e

    return _enqueue_valve_upload_parse(db, saved)


@app.post("/v1/valve/link/{steam_id}", response_model=ValveLinkResponse)
def post_valve_mm_link(
    steam_id: str,
    body: ValveLinkBody,
    db: Session = Depends(get_db),
    sync: bool = Query(True, description="Enqueue share-code walk + demo processing after linking"),
    _: None = Depends(require_internal_auth),
):
    from app.services.valve_pipeline import get_valve_link, sync_valve_share_codes, upsert_valve_link

    sid = str(steam_id).strip()
    if len(sid) < 5:
        raise HTTPException(400, "steam_id is too short")

    auth = (body.auth_code or "").strip()
    existing = get_valve_link(db, sid)
    if not auth and existing is None:
        raise HTTPException(400, "auth_code is required for the first Valve link")
    if auth and len(auth) < 8:
        raise HTTPException(400, "Invalid auth code")

    from app.services.valve_sharecode import InvalidShareCode, extract_match_share_code

    try:
        # Accept bare CSGO-… or a full Steam “copy share code” URL and extract the code.
        share = extract_match_share_code(body.share_code)
    except InvalidShareCode as e:
        raise HTTPException(400, str(e)) from e

    if not (settings.steam_api_key or "").strip():
        raise HTTPException(500, "STEAM_API_KEY is not configured on extra-backend")

    try:
        upsert_valve_link(
            db,
            steam_id=sid,
            auth_code=auth or None,
            share_code=share,
        )
    except ValueError as e:
        raise HTTPException(400, str(e)) from e

    sync_result = None
    if sync:
        if settings.celery_eager:
            sync_result = sync_valve_share_codes(db, sid)
        else:
            try:
                ar = sync_valve_mm_task.delay(sid)
                sync_result = {"state": "queued", "task_id": ar.id}
            except Exception as e:
                sync_result = {"state": "error", "error": str(e)[:300]}

    return ValveLinkResponse(
        steam_id=sid,
        linked=True,
        latest_share_code=share,
        sync=sync_result,
    )


@app.post("/v1/valve/sync/{steam_id}")
def post_valve_mm_sync(
    steam_id: str,
    db: Session = Depends(get_db),
    max_matches: int = Query(None, ge=1, le=50),
    _: None = Depends(require_internal_auth),
):
    from app.services.valve_pipeline import get_valve_link

    sid = str(steam_id).strip()
    if get_valve_link(db, sid) is None:
        raise HTTPException(404, "Valve MM link not configured")

    if settings.celery_eager:
        from app.services.valve_pipeline import sync_valve_share_codes

        return sync_valve_share_codes(db, sid, max_matches=max_matches)

    try:
        ar = sync_valve_mm_task.delay(sid, max_matches=max_matches)
        return {"steam_id": sid, "state": "queued", "task_id": ar.id}
    except Exception as e:
        raise HTTPException(502, f"Could not enqueue Valve sync: {e}") from e
