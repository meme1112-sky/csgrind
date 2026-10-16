from __future__ import annotations

from app.celery_app import app as celery_app
from app.db import SessionLocal
from app.faceit_client import FaceitClient
from app.models import FaceitMatchRecord, LinkedPlayer, MatchStatus
from app.services.analytics_orchestrate import run_steam_analytics_pipeline, run_steam_demo_archive_pipeline
from app.services.match_result import extract_match_meta_for_player, merge_match_meta
from app.services.pipeline import process_match_record


@celery_app.task(name="demos.refresh_player_history", priority=4)
def refresh_player_history(
    faceit_player_id: str,
    limit: int = 20,
    retry_failed: bool = False,
    enqueue_processing: bool = True,
) -> dict:
    db = SessionLocal()
    try:
        linked = db.query(LinkedPlayer).filter_by(faceit_player_id=faceit_player_id).one_or_none()
        linked_id = linked.id if linked else None

        fc = FaceitClient()
        hist = fc.get_history(faceit_player_id, limit=limit)
        items = hist.get("items") or []

        enqueued: list[str] = []
        for item in items:
            mid = item.get("match_id")
            if not mid:
                continue
            game = item.get("game_id") or "cs2"
            meta = extract_match_meta_for_player(item, faceit_player_id)
            row = db.get(FaceitMatchRecord, mid)
            if row is None:
                db.add(
                    FaceitMatchRecord(
                        match_id=str(mid),
                        player_faceit_id=faceit_player_id,
                        game=str(game),
                        status=MatchStatus.pending.value,
                        linked_player_id=linked_id,
                        match_meta=meta,
                        match_started_at=item.get("started_at"),
                        match_finished_at=item.get("finished_at"),
                    )
                )
                enqueued.append(str(mid))
            else:
                row.match_meta = merge_match_meta(
                    row.match_meta if isinstance(row.match_meta, dict) else None,
                    meta,
                )
                if item.get("started_at") is not None:
                    row.match_started_at = item.get("started_at")
                if item.get("finished_at") is not None:
                    row.match_finished_at = item.get("finished_at")
                if retry_failed and row.status == MatchStatus.failed.value:
                    row.status = MatchStatus.pending.value
                    row.error_message = None
                    enqueued.append(str(mid))

        db.commit()

        if enqueue_processing:
            for mid in enqueued:
                process_match_task.delay(mid)

        return {"enqueued": len(enqueued), "match_ids": enqueued}
    finally:
        db.close()


@celery_app.task(name="demos.process_match", priority=5)
def process_match_task(match_id: str) -> None:
    db = SessionLocal()
    try:
        process_match_record(db, match_id)
    finally:
        db.close()


@celery_app.task(name="demos.refresh_steam_analytics", priority=4)
def refresh_steam_analytics(steam_id: str, max_matches: int = 5, scan_recent: int = 50) -> dict:
    """
    Background refresh behind GET /v1/analytics/by-steam.

    Resolves Steam -> FACEIT, pulls recent history, downloads + parses the newest demos, and stores
    per-match analytics. The HTTP endpoint enqueues this and returns cached analytics immediately;
    clients poll GET /v1/analytics/jobs/{task_id} for completion, then re-fetch the fresh cache.

    `process_match_record` is idempotent (already-parsed, current-schema matches return instantly),
    so repeated refreshes only do heavy work for new or previously failed matches.
    """
    db = SessionLocal()
    try:
        return run_steam_analytics_pipeline(
            db,
            str(steam_id).strip(),
            max_matches=max_matches,
            scan_recent=scan_recent,
        )
    finally:
        db.close()


@celery_app.task(name="demos.archive_steam_demos", priority=3)
def archive_steam_demos(steam_id: str, scan_recent: int = 30) -> dict:
    """
    Proactive archival: download+parse recent FACEIT demos for one Steam ID so they are
    cached locally before FACEIT expires them.
    """
    db = SessionLocal()
    try:
        return run_steam_demo_archive_pipeline(
            db,
            str(steam_id).strip(),
            scan_recent=scan_recent,
        )
    finally:
        db.close()


@celery_app.task(name="demos.sync_valve_mm", priority=7)
def sync_valve_mm_task(steam_id: str, max_matches: int | None = None) -> dict:
    from app.services.valve_pipeline import sync_valve_share_codes

    db = SessionLocal()
    try:
        return sync_valve_share_codes(db, str(steam_id).strip(), max_matches=max_matches)
    finally:
        db.close()


@celery_app.task(name="demos.process_valve_upload", priority=9)
def process_valve_upload_task(share_code: str) -> dict:
    """Parse a Valve demo that was stored via manual upload (highest queue priority)."""
    from app.services.valve_pipeline import process_saved_valve_upload

    db = SessionLocal()
    try:
        return process_saved_valve_upload(db, str(share_code).strip())
    finally:
        db.close()


@celery_app.task(name="demos.cleanup_expired_demos", priority=1)
def cleanup_expired_demos_task(dry_run: bool = False) -> dict:
    """Delete local demo files older than DEMO_RETENTION_DAYS (default 14). Analytics stay in DB."""
    from app.services.cleanup_demos import cleanup_expired_demo_files

    return cleanup_expired_demo_files(dry_run=dry_run)
