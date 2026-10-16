"""
Extra Leetify-inspired demo metrics that the base awpy.stats output doesn't cover:

- Time To Damage / Pre-aim: computed in `aim_metrics` from engagement primitives.
- Kills through smokes: kills whose attacker→victim line of sight crosses an active smoke cloud.
- Utility damage: cumulative HE / molotov / incendiary damage dealt per match.
- Opening duels: who got the first kill of each round (entry winner) vs. who died first (entry loser).
- Multi-kills: count of 2k/3k/4k/5k rounds a player produced in the match.
- Knife inspections: debounced count of mid-round knife inspect actions from `item_equip` demo events.

All helpers return dicts keyed by the player's SteamID64 string and gracefully degrade if
the demo wasn't parsed with the optional view-angle props.
"""

from __future__ import annotations

import math
from typing import Any

import polars as pl
from awpy import Demo

from app.services.aim_metrics import (
    AimConfig,
    preaim_per_player,
    time_to_damage_per_player,
)

_AIM_CONFIG = AimConfig(
    min_ttd_samples=3,
    min_preaim_samples=5,
)

# Standing-eye-height offset from the player's feet origin (units used by the source engine).
# Used to lift attacker/victim positions to roughly head height when checking smoke line-of-sight.
_EYE_HEIGHT = 64.0
# Default smoke radius in source-engine units (matches the awpy/Leetify convention).
_SMOKE_RADIUS = 144.0
# Weapons whose damage we count as "utility damage".
_UTIL_WEAPONS = {"hegrenade", "inferno", "molotov", "incgrenade"}
# Debounce rapid `item_equip` knife events (~250ms at 64 tick).
_KNIFE_INSPECT_MIN_TICK_GAP = 16


def _segment_point_distance(
    ax: float, ay: float, az: float,
    bx: float, by: float, bz: float,
    px: float, py: float, pz: float,
) -> float:
    """3D distance from point P to the line segment AB."""
    abx, aby, abz = bx - ax, by - ay, bz - az
    apx, apy, apz = px - ax, py - ay, pz - az
    ab_len_sq = abx * abx + aby * aby + abz * abz
    if ab_len_sq <= 0:
        dx, dy, dz = px - ax, py - ay, pz - az
        return math.sqrt(dx * dx + dy * dy + dz * dz)
    t = (apx * abx + apy * aby + apz * abz) / ab_len_sq
    t = max(0.0, min(1.0, t))
    cx, cy, cz = ax + t * abx, ay + t * aby, az + t * abz
    dx, dy, dz = px - cx, py - cy, pz - cz
    return math.sqrt(dx * dx + dy * dy + dz * dz)


def _has_columns(df: pl.DataFrame | None, cols: list[str]) -> bool:
    if df is None or df.height == 0:
        return False
    have = set(df.columns)
    return all(c in have for c in cols)


def kills_through_smokes_per_player(demo: Demo) -> dict[str, int]:
    """Count kills whose attacker→victim line of sight passes within smoke radius of an active smoke."""
    smokes = demo.smokes
    kills = demo.kills
    if smokes is None or smokes.height == 0 or kills is None or kills.height == 0:
        return {}

    needed_k = [
        "attacker_steamid", "tick", "round_num",
        "attacker_X", "attacker_Y", "attacker_Z",
        "victim_X", "victim_Y", "victim_Z",
    ]
    needed_s = ["round_num", "start_tick", "end_tick", "X", "Y", "Z"]
    if not _has_columns(kills, needed_k) or not _has_columns(smokes, needed_s):
        return {}

    sm_by_round: dict[int, list[tuple[int, int, float, float, float]]] = {}
    for s in smokes.select(needed_s).drop_nulls().to_dicts():
        rn = int(s["round_num"])
        sm_by_round.setdefault(rn, []).append(
            (int(s["start_tick"]), int(s["end_tick"]), float(s["X"]), float(s["Y"]), float(s["Z"]))
        )

    counts: dict[str, int] = {}
    for k in kills.select(needed_k).drop_nulls().to_dicts():
        rn = int(k["round_num"])
        active = sm_by_round.get(rn) or []
        if not active:
            continue
        kt = int(k["tick"])
        try:
            ax = float(k["attacker_X"]); ay = float(k["attacker_Y"]); az = float(k["attacker_Z"]) + _EYE_HEIGHT
            vx = float(k["victim_X"]);   vy = float(k["victim_Y"]);   vz = float(k["victim_Z"]) + _EYE_HEIGHT
        except (TypeError, ValueError):
            continue
        for (st, et, sx, sy, sz) in active:
            if not (st <= kt <= et):
                continue
            # Treat the smoke as a ball centered ~60 units above the throw position (smoke rises).
            d = _segment_point_distance(ax, ay, az, vx, vy, vz, sx, sy, sz + 60.0)
            if d <= _SMOKE_RADIUS:
                sid = str(k["attacker_steamid"])
                if sid:
                    counts[sid] = counts.get(sid, 0) + 1
                break
    return counts


def utility_damage_per_player(demo: Demo) -> dict[str, float]:
    """Total HE / molotov / incendiary damage dealt per player in the match."""
    dmg = demo.damages
    if dmg is None or dmg.height == 0:
        return {}
    if "weapon" not in dmg.columns or "attacker_steamid" not in dmg.columns:
        return {}
    dmg_col = "dmg_health_real" if "dmg_health_real" in dmg.columns else (
        "dmg_health" if "dmg_health" in dmg.columns else None
    )
    if dmg_col is None:
        return {}
    df = dmg.filter(pl.col("weapon").is_in(list(_UTIL_WEAPONS)))
    if df.height == 0:
        return {}
    grouped = df.group_by("attacker_steamid").agg(pl.col(dmg_col).sum().alias("util_dmg"))
    return {
        str(r["attacker_steamid"]): float(r["util_dmg"] or 0.0)
        for r in grouped.to_dicts()
        if r["attacker_steamid"]
    }


def opening_duels_per_player(demo: Demo) -> dict[str, dict[str, int]]:
    """For each round's first kill, attribute an opening duel won/lost to attacker/victim."""
    k = demo.kills
    needed = ["round_num", "tick", "attacker_steamid", "victim_steamid"]
    if not _has_columns(k, needed):
        return {}
    sub = k.select(needed).drop_nulls().sort(["round_num", "tick"])
    out: dict[str, dict[str, int]] = {}
    seen: set[int] = set()
    for r in sub.to_dicts():
        rn = int(r["round_num"])
        if rn in seen:
            continue
        seen.add(rn)
        a = str(r["attacker_steamid"])
        v = str(r["victim_steamid"])
        if a:
            slot = out.setdefault(a, {"open_won": 0, "open_lost": 0})
            slot["open_won"] += 1
        if v:
            slot = out.setdefault(v, {"open_won": 0, "open_lost": 0})
            slot["open_lost"] += 1
    return out


def multikills_per_player(demo: Demo) -> dict[str, dict[str, int]]:
    """Count rounds where the player got 2k / 3k / 4k / 5k."""
    k = demo.kills
    if not _has_columns(k, ["attacker_steamid", "round_num"]):
        return {}
    grouped = (
        k.select(["attacker_steamid", "round_num"])
        .drop_nulls()
        .group_by(["attacker_steamid", "round_num"])
        .agg(pl.len().alias("k_in_round"))
    )
    out: dict[str, dict[str, int]] = {}
    for r in grouped.to_dicts():
        sid = str(r["attacker_steamid"])
        if not sid:
            continue
        n = int(r["k_in_round"])
        slot = out.setdefault(sid, {"2k": 0, "3k": 0, "4k": 0, "5k": 0})
        if n == 2:
            slot["2k"] += 1
        elif n == 3:
            slot["3k"] += 1
        elif n == 4:
            slot["4k"] += 1
        elif n >= 5:
            slot["5k"] += 1
    return out


def _round_start_ticks(parser: Any) -> list[int]:
    """Old knife-inspect helper: takes the awpy parser and returns sorted round_start ticks."""
    try:
        rs = parser.parse_event("round_start")
        if rs is None or len(rs) == 0:
            return []
        return sorted(int(t) for t in rs["tick"].tolist())
    except Exception:
        return []


def _round_index_for_tick(tick: int, round_starts: list[int]) -> int:
    if not round_starts:
        return 1
    n = 0
    for start in round_starts:
        if tick >= start:
            n += 1
    return max(n, 1)


def _debounced_event_groups(ticks: list[int], *, min_gap: int) -> int:
    if not ticks:
        return 0
    ordered = sorted(int(t) for t in ticks)
    groups = 1
    last = ordered[0]
    for tick in ordered[1:]:
        if tick - last >= min_gap:
            groups += 1
        last = tick
    return groups


def knife_inspections_per_player(demo: Demo) -> dict[str, int]:
    """
    Estimate knife inspect count per Steam ID from demo `item_equip` events.

    CS2 logs knife equips on spawn and on inspect (F). We group equips per round,
    debounce bursts within ``_KNIFE_INSPECT_MIN_TICK_GAP`` ticks, then subtract one
    group per round (spawn/switch-in knife).

    Requires reliable ``round_start`` ticks — without them every equip collapses into
    one bucket and the spawn subtract can't keep the rate sane.
    """
    parser = getattr(demo, "parser", None)
    if parser is None:
        return {}
    try:
        equips = parser.parse_event("item_equip")
    except Exception:
        return {}
    if equips is None or len(equips) == 0:
        return {}
    needed = {"item", "tick", "user_steamid"}
    if not needed.issubset(set(equips.columns)):
        return {}

    round_starts = _round_start_ticks(parser)
    # Need multiple round boundaries; a single/empty list makes per-round debouncing
    # treat the whole match as one round and inflate counts into the hundreds.
    if len(round_starts) < 2:
        return {}

    knife = equips[
        equips["item"].astype(str).str.contains("knife", case=False, na=False)
        & equips["user_steamid"].notna()
    ].copy()
    if len(knife) == 0:
        return {}

    knife["user_steamid"] = knife["user_steamid"].astype(str)
    knife["tick"] = knife["tick"].astype(int)
    knife["round"] = knife["tick"].apply(lambda t: _round_index_for_tick(int(t), round_starts))

    out: dict[str, int] = {}
    for (sid, _rnd), group in knife.groupby(["user_steamid", "round"]):
        groups = _debounced_event_groups(
            group["tick"].tolist(),
            min_gap=_KNIFE_INSPECT_MIN_TICK_GAP,
        )
        out[sid] = out.get(sid, 0) + max(0, groups - 1)
    return out


def compute_extras_for_match(demo: Demo) -> dict[str, dict[str, Any]]:
    """One-shot helper that returns a dict keyed by SteamID64 with all extra metrics."""
    out: dict[str, dict[str, Any]] = {}

    def _slot(sid: str) -> dict[str, Any]:
        return out.setdefault(sid, {})

    for sid, ttd in time_to_damage_per_player(demo, _AIM_CONFIG).items():
        _slot(sid)["time_to_damage"] = float(ttd)
    for sid, deg in preaim_per_player(demo, _AIM_CONFIG).items():
        _slot(sid)["preaim"] = float(deg)
        # Alias for existing frontend / display rollups until they read `preaim` directly.
        _slot(sid)["crosshair_placement"] = float(deg)
    for sid, n in kills_through_smokes_per_player(demo).items():
        _slot(sid)["kills_through_smokes"] = int(n)
    for sid, ud in utility_damage_per_player(demo).items():
        _slot(sid)["utility_damage"] = float(ud)
    for sid, od in opening_duels_per_player(demo).items():
        _slot(sid)["opening_kills_won"] = int(od.get("open_won", 0))
        _slot(sid)["opening_kills_lost"] = int(od.get("open_lost", 0))
    for sid, mk in multikills_per_player(demo).items():
        _slot(sid)["multikills"] = mk
    for sid, n in knife_inspections_per_player(demo).items():
        _slot(sid)["knife_inspections"] = int(n)

    return out
