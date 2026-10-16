from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from awpy import Demo


def _json_safe(value: Any) -> Any:
    if value is None or isinstance(value, (bool, int, float, str)):
        return value
    if isinstance(value, bytes):
        return value.decode("utf-8", errors="replace")
    if isinstance(value, dict):
        return {str(k): _json_safe(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_json_safe(v) for v in value]
    return str(value)


def _df_height(obj: Any) -> int | None:
    if obj is None:
        return None
    h = getattr(obj, "height", None)
    if isinstance(h, int):
        return h
    return None


def _summary_from_demo(dem: Demo) -> dict[str, Any]:
    header_raw = dem.header
    header: dict[str, Any] = {}
    if isinstance(header_raw, dict):
        header = _json_safe(header_raw)
    elif header_raw is not None and hasattr(header_raw, "to_dicts"):
        rows = header_raw.to_dicts()
        header = _json_safe(rows[0]) if rows else {}

    summary: dict[str, Any] = {
        "map_name": header.get("map_name"),
        "round_count": _df_height(dem.rounds),
        "kill_count": _df_height(dem.kills),
        "damage_rows": _df_height(dem.damages),
        "shot_rows": _df_height(dem.shots),
        "grenade_rows": _df_height(dem.grenades),
        "tick_rows": _df_height(dem.ticks),
        "header": header,
    }

    try:
        json.dumps(summary)
    except TypeError:
        summary["header"] = {"map_name": summary.get("map_name")}

    return summary


def parse_dem_full(dem_path: Path, *, verbose: bool = False) -> tuple[dict[str, Any], dict[str, Any] | None]:
    """Parse a .dem once; return parse summary plus Leetify-style analytics (or None + error in summary)."""
    dem = Demo(str(dem_path), verbose=verbose)
    # Aim metrics (TTD / pre-aim) need view angles, alive/flash/weapon state, and LOS props.
    # demoparser2 aliases: approximate_spotted_by (= m_bSpottedByMask), spotted (= m_bSpotted).
    # "spotted_by_mask" / "is_ducking" are silently omitted by awpy — use the names below.
    dem.parse(
        player_props=[
            "pitch",
            "yaw",
            "X",
            "Y",
            "Z",
            "is_alive",
            "flash_duration",
            "active_weapon",
            "duck_amount",
            "entity_id",
            "approximate_spotted_by",
            "spotted",
        ]
    )
    summary = _summary_from_demo(dem)
    try:
        from app.services.analytics import compute_match_analytics

        analytics = compute_match_analytics(dem)
    except Exception as e:
        summary["analytics_error"] = str(e)[:500]
        return summary, None
    return summary, analytics


def parse_dem_to_summary(dem_path: Path, *, verbose: bool = False) -> dict[str, Any]:
    summary, _ = parse_dem_full(dem_path, verbose=verbose)
    return summary
