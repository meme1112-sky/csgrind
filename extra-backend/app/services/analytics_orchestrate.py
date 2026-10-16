"""
Resolve Steam → FACEIT, pull match history, download/parse demos synchronously (used by GET /v1/analytics/by-steam).
"""

from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from app.config import settings
from app.faceit_client import FaceitClient
from app.models import FaceitMatchRecord, LinkedPlayer, MatchStatus
from app.services.match_result import extract_match_meta_for_player, merge_match_meta
from app.services.pipeline import (
    _analytics_is_current,
    mark_expired_failed_as_no_demo,
    process_match_record,
    should_skip_archive_attempt,
    should_skip_match_processing,
)


def fetch_match_items_from_history(
    fc: FaceitClient, player_id: str, cap: int, *, game: str = "cs2"
) -> list[dict[str, Any]]:
    """Newest-first history items from FACEIT, up to `cap` (paginated)."""
    out: list[dict[str, Any]] = []
    seen: set[str] = set()
    offset = 0
    page_size = min(100, max(1, cap))

    while len(out) < cap:
        need = cap - len(out)
        limit = min(page_size, need)
        hist = fc.get_history(player_id, limit=limit, offset=offset, game=game)
        items = hist.get("items") or []
        if not items:
            break
        for item in items:
            if not isinstance(item, dict):
                continue
            mid = item.get("match_id")
            if not mid:
                continue
            sm = str(mid)
            if sm in seen:
                continue
            seen.add(sm)
            enriched = dict(item)
            enriched["_game"] = game
            out.append(enriched)
            if len(out) >= cap:
                return out[:cap]
        if len(items) < limit:
            break
        offset += len(items)

    return out[:cap]


def fetch_match_ids_from_history(
    fc: FaceitClient, player_id: str, cap: int, *, game: str = "cs2"
) -> list[str]:
    """Newest-first match IDs from FACEIT history, up to `cap` items (paginated)."""
    return [
        str(it["match_id"])
        for it in fetch_match_items_from_history(fc, player_id, cap, game=game)
        if it.get("match_id")
    ]


def fetch_match_candidates(fc: FaceitClient, player_id: str, cap: int) -> list[tuple[str, str, dict[str, Any]]]:
    """Newest-first (match_id, game, history_item) — CS2 first, then CSGO to fill the cap."""
    out: list[tuple[str, str, dict[str, Any]]] = []
    seen: set[str] = set()
    for game in ("cs2", "csgo"):
        if len(out) >= cap:
            break
        need = cap - len(out)
        for item in fetch_match_items_from_history(fc, player_id, need, game=game):
            mid = str(item.get("match_id") or "")
            if not mid or mid in seen:
                continue
            seen.add(mid)
            out.append((mid, game, item))
            if len(out) >= cap:
                break
    return out[:cap]


def ensure_linked_player(
    db: Session, faceit_player_id: str, nickname: str, steam_id: str | None = None
) -> LinkedPlayer:
    row = db.query(LinkedPlayer).filter_by(faceit_player_id=faceit_player_id).one_or_none()
    if row is None:
        row = LinkedPlayer(
            faceit_player_id=faceit_player_id,
            nickname=nickname or "unknown",
            steam_id=steam_id or None,
        )
        db.add(row)
        db.commit()
        db.refresh(row)
        return row
    dirty = False
    if nickname and row.nickname != nickname:
        row.nickname = nickname
        dirty = True
    # Backfill / refresh the steam_id mapping so future by-steam calls can serve cache instantly.
    if steam_id and row.steam_id != steam_id:
        row.steam_id = steam_id
        dirty = True
    if dirty:
        db.commit()
        db.refresh(row)
    return row


def ensure_match_placeholder(
    db: Session,
    match_id: str,
    faceit_player_id: str,
    linked_player_id: str | None,
    game: str = "cs2",
    history_item: dict[str, Any] | None = None,
) -> FaceitMatchRecord:
    meta = extract_match_meta_for_player(history_item, faceit_player_id) if history_item else None
    row = db.get(FaceitMatchRecord, match_id)
    if row is None:
        row = FaceitMatchRecord(
            match_id=match_id,
            player_faceit_id=faceit_player_id,
            game=game,
            status=MatchStatus.pending.value,
            linked_player_id=linked_player_id,
            match_meta=meta,
            match_started_at=(history_item or {}).get("started_at"),
            match_finished_at=(history_item or {}).get("finished_at"),
        )
        db.add(row)
        db.commit()
        db.refresh(row)
    else:
        dirty = False
        if game and row.game != game:
            row.game = game
            dirty = True
        merged = merge_match_meta(row.match_meta if isinstance(row.match_meta, dict) else None, meta)
        if merged != row.match_meta:
            row.match_meta = merged
            dirty = True
        if history_item:
            if history_item.get("started_at") is not None and row.match_started_at != history_item.get("started_at"):
                row.match_started_at = history_item.get("started_at")
                dirty = True
            if history_item.get("finished_at") is not None and row.match_finished_at != history_item.get(
                "finished_at"
            ):
                row.match_finished_at = history_item.get("finished_at")
                dirty = True
        if dirty:
            db.commit()
            db.refresh(row)
    return row


def run_steam_analytics_pipeline(
    db: Session,
    steam_id: str,
    *,
    max_matches: int,
    scan_recent: int,
) -> dict[str, Any]:
    """
    1) FACEIT: SteamID64 → player
    2) CS2 history, then CSGO history up to `scan_recent` matches
    3) Download + parse newest demos until `max_matches` are parsed or history is exhausted.
    """
    if not settings.faceit_key:
        raise RuntimeError("FACEIT_KEY is not configured")

    fc = FaceitClient()
    player = fc.get_player_by_steam64(steam_id)
    faceit_pid = str(player.get("player_id") or "").strip()
    if not faceit_pid:
        raise RuntimeError("FACEIT response missing player_id")

    nickname = str(player.get("nickname") or "").strip()

    linked = ensure_linked_player(db, faceit_pid, nickname, steam_id=str(steam_id).strip())
    mark_expired_failed_as_no_demo(db, faceit_pid)

    history_cap = max(1, min(scan_recent, 10_000))
    want_parsed = max(1, min(max_matches, history_cap))
    candidates = fetch_match_candidates(fc, faceit_pid, history_cap)

    for mid, game, item in candidates:
        ensure_match_placeholder(db, mid, faceit_pid, linked.id, game, history_item=item)

    errors: list[dict[str, str]] = []
    attempted: list[str] = []
    parsed_ok = 0

    # Walk history newest-first until we have enough parsed demos or exhaust candidates.
    # Failed/expired demos are skipped so we can fall through to older CS2/CSGO matches.
    # Already-parsed current-schema matches count toward the target (do not re-download).
    for mid, _game, _item in candidates:
        if parsed_ok >= want_parsed:
            break
        row = db.get(FaceitMatchRecord, mid)
        if row is not None and row.status == MatchStatus.parsed.value and _analytics_is_current(row.analytics):
            parsed_ok += 1
            continue
        if should_skip_match_processing(row):
            continue
        attempted.append(mid)
        try:
            process_match_record(db, mid)
            row = db.get(FaceitMatchRecord, mid)
            if row and row.status == MatchStatus.parsed.value:
                parsed_ok += 1
        except Exception as e:
            errors.append({"match_id": mid, "error": str(e)[:500]})

    # Workers committed on other sessions; drop cached rows so the caller's session sees fresh status/analytics.
    db.expire_all()

    return {
        "faceit_player_id": faceit_pid,
        "nickname": nickname or None,
        "history_match_ids_found": len(candidates),
        "matches_scheduled": len(attempted),
        "matches_parsed": parsed_ok,
        "process_errors": errors,
    }


def run_steam_demo_archive_pipeline(
    db: Session,
    steam_id: str,
    *,
    scan_recent: int,
) -> dict[str, Any]:
    """
    Proactively download+parse recent FACEIT demos for one Steam ID.

    Walks the full recent history (CS2 then CSGO) so demos are cached locally before
    FACEIT expires them. Skips matches already archived or permanently unavailable.
    """
    if not settings.faceit_key:
        raise RuntimeError("FACEIT_KEY is not configured")

    fc = FaceitClient()
    player = fc.get_player_by_steam64(steam_id)
    faceit_pid = str(player.get("player_id") or "").strip()
    if not faceit_pid:
        raise RuntimeError("FACEIT response missing player_id")

    nickname = str(player.get("nickname") or "").strip()
    linked = ensure_linked_player(db, faceit_pid, nickname, steam_id=str(steam_id).strip())
    mark_expired_failed_as_no_demo(db, faceit_pid)

    history_cap = max(1, min(scan_recent, 10_000))
    candidates = fetch_match_candidates(fc, faceit_pid, history_cap)

    for mid, game, item in candidates:
        ensure_match_placeholder(db, mid, faceit_pid, linked.id, game, history_item=item)

    attempted: list[str] = []
    archived = 0
    skipped = 0
    errors: list[dict[str, str]] = []

    for mid, _game, _item in candidates:
        row = db.get(FaceitMatchRecord, mid)
        if should_skip_archive_attempt(row):
            skipped += 1
            continue
        attempted.append(mid)
        try:
            process_match_record(db, mid)
            row = db.get(FaceitMatchRecord, mid)
            if row and row.status in (MatchStatus.parsed.value, MatchStatus.no_demo.value):
                if row.status == MatchStatus.parsed.value:
                    archived += 1
            elif row and (row.local_archive_path or row.local_dem_path):
                archived += 1
        except Exception as e:
            errors.append({"match_id": mid, "error": str(e)[:500]})

    db.expire_all()

    return {
        "faceit_player_id": faceit_pid,
        "nickname": nickname or None,
        "history_match_ids_found": len(candidates),
        "matches_attempted": len(attempted),
        "matches_archived": archived,
        "matches_skipped": skipped,
        "process_errors": errors,
    }
