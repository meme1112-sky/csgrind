"""Extract FACEIT match score / W-L / map for the owning player."""

from __future__ import annotations

from typing import Any


def _roster_ids(team: Any) -> list[str]:
    if not isinstance(team, dict):
        return []
    roster = team.get("roster") or team.get("players") or team.get("members") or []
    if not isinstance(roster, list):
        return []
    out: list[str] = []
    for p in roster:
        if isinstance(p, dict) and p.get("player_id"):
            out.append(str(p["player_id"]))
    return out


def _map_from_detail(detail: dict[str, Any]) -> str | None:
    voting = detail.get("voting")
    if isinstance(voting, dict):
        m = voting.get("map")
        if isinstance(m, dict):
            pick = m.get("pick")
            if isinstance(pick, list) and pick and isinstance(pick[0], str) and pick[0].strip():
                return pick[0].strip()
    for key in ("game_map", "map", "map_name"):
        v = detail.get(key)
        if isinstance(v, str) and v.strip():
            return v.strip()
    return None


def extract_match_meta_for_player(
    detail: dict[str, Any] | None,
    faceit_player_id: str | None,
) -> dict[str, Any] | None:
    """
    Build { map_name, score_us, score_them, outcome, winner } for faceit_player_id.

    Works with FACEIT match detail OR history list items (same results/teams shape).
    """
    if not isinstance(detail, dict) or not faceit_player_id:
        return None

    teams = detail.get("teams") if isinstance(detail.get("teams"), dict) else {}
    f1 = teams.get("faction1")
    f2 = teams.get("faction2")
    r1 = _roster_ids(f1)
    r2 = _roster_ids(f2)
    pid = str(faceit_player_id)
    my_team: str | None = None
    if pid in r1:
        my_team = "faction1"
    elif pid in r2:
        my_team = "faction2"

    results = detail.get("results") if isinstance(detail.get("results"), dict) else {}
    score = results.get("score") if isinstance(results.get("score"), dict) else {}
    s1_raw, s2_raw = score.get("faction1"), score.get("faction2")
    try:
        s1 = int(s1_raw) if s1_raw is not None and str(s1_raw).strip() != "" else None
    except (TypeError, ValueError):
        s1 = None
    try:
        s2 = int(s2_raw) if s2_raw is not None and str(s2_raw).strip() != "" else None
    except (TypeError, ValueError):
        s2 = None

    winner = results.get("winner")
    if not winner and s1 is not None and s2 is not None and s1 != s2:
        winner = "faction1" if s1 > s2 else "faction2"
    if isinstance(winner, str):
        winner = winner.strip() or None
    else:
        winner = None

    score_us: int | None = None
    score_them: int | None = None
    if my_team and s1 is not None and s2 is not None:
        score_us = s1 if my_team == "faction1" else s2
        score_them = s2 if my_team == "faction1" else s1
    elif s1 is not None and s2 is not None:
        # Unknown roster — keep raw faction scores (still useful for display).
        score_us, score_them = s1, s2

    outcome: str | None = None
    if my_team and winner in ("faction1", "faction2"):
        outcome = "W" if my_team == winner else "L"

    map_name = _map_from_detail(detail)

    if (
        score_us is None
        and score_them is None
        and outcome is None
        and not map_name
    ):
        return None

    return {
        "map_name": map_name,
        "score_us": score_us,
        "score_them": score_them,
        "outcome": outcome,
        "winner": winner,
        "my_team": my_team,
    }


def merge_match_meta(
    existing: dict[str, Any] | None,
    incoming: dict[str, Any] | None,
) -> dict[str, Any] | None:
    """Prefer non-null fields from incoming, keep prior values otherwise."""
    if not incoming and not existing:
        return None
    base = dict(existing or {})
    for k, v in (incoming or {}).items():
        if v is not None and v != "":
            base[k] = v
    return base or None
