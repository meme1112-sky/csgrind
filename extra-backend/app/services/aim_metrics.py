"""
Aim metrics for CSgrind: time-to-damage and crosshair placement (pre-aim).

Aligned with Leetify / CSRep public definitions:

  * Time to damage — average ms from the enemy first becoming visible to the
    attacker (FOV + LOS/spotted when parsed) until the attacker first deals
    firearm damage to that enemy. Not raw reaction time.

  * Crosshair placement — median angular change (degrees) of the attacker's
    eye angles between first visibility and first damaging hit on that enemy.
    Lower is better. Only converted engagements count; the median rejects
    outliers.

Both metrics share one primitive — the *engagement* — built once per demo and
cached on the demo object.

Engagement design notes:
  * Keyed on (attacker, victim, round) so a round can yield several samples.
  * Visibility uses FOV + an available line-of-sight source when parsed.
  * Damage is firearm-only and matched to the specific victim.

Usage:
    from aim_metrics import time_to_damage_per_player, preaim_per_player

    ttd    = time_to_damage_per_player(demo)   # {steamid: milliseconds}
    preaim = preaim_per_player(demo)           # {steamid: degrees}

For calibration:
    from aim_metrics import AimConfig, debug_aim_stats
    print(debug_aim_stats(demo))
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field, replace
from typing import Any, Optional

import numpy as np
import polars as pl


# --------------------------------------------------------------------------
# Configuration
# --------------------------------------------------------------------------


@dataclass(frozen=True)
class AimConfig:
    """Tunable parameters. Sweep these when calibrating against Leetify."""

    # Geometry
    eye_height_stand: float = 64.06
    eye_height_duck: float = 46.04
    fov_half_angle_deg: float = 53.0      # ~106 deg horizontal FOV at 16:9
    max_engage_distance: float = 2400.0   # units; beyond this it is not a duel

    # Engagement lifecycle
    los_grace_seconds: float = 0.30       # LOS may break this long without reset
    min_visible_ticks: int = 2            # ignore single-tick glimpses
    ttd_max_seconds: float = 3.0          # discard slower conversions

    # Crosshair placement (Leetify-style eye-angle travel until first hit)
    preaim_max_deg: float = 45.0          # discard extreme flicks / tracking noise
    preaim_use_median: bool = True        # Leetify: median excludes outliers
    # TTD stays a mean (Leetify: "average time"); median is only for placement.

    # State gating
    blind_threshold_seconds: float = 0.4  # remaining flash duration = blind
    require_firearm: bool = True

    # Line of sight
    los_mode: str = "auto"                # "auto" | "mask" | "spotted" | "fov_only"
    spotted_mask_bit_offset: int = 1      # bit index = entity_id - offset
    # Require LOS (or spotted proxy) to open an engagement. FOV-only start
    # matches Leetify's wording loosely but fires the clock through walls /
    # pre-peek and inflates TTD (~1.5–2s) and eye-angle travel. Keep True.
    require_los_to_engage: bool = True

    # --- Leetify display calibration (2026-10 FACEIT L10 anchors) ---
    # Raw demo primitives stay Leetify-*style*; these scales map our output onto
    # Leetify public profile magnitudes so Premier risk bands (Leetify-calibrated)
    # and client side-by-side checks land closer.
    #
    # Anchors (Leetify last-30 FACEIT vs our v7 Neok AI small-demo rollup):
    #   neok  TTD 472 / 379 ≈ 1.25 ; placement band ~6.5–7.4 vs 2.28 ≈ 3.0
    #   putz  TTD 482 / 217 ≈ 2.22 ; placement ~8.5 / 2.86 ≈ 3.0
    # TTD uses geometric mean of the two TTD ratios (~1.67). Placement is stable ~3.0.
    # Small demo samples will still diverge from Leetify's 30-match window.
    leetify_ttd_scale: float = 1.67
    leetify_preaim_scale: float = 3.0

    # Minimum sample sizes before a player is reported at all
    min_ttd_samples: int = 5
    min_preaim_samples: int = 10


DEFAULT_CONFIG = AimConfig()


# Anything whose name contains one of these is not a firearm.
_NON_FIREARM_TOKENS = (
    "knife", "bayonet", "karambit", "daggers", "talon", "stiletto", "ursus",
    "navaja", "nomad", "skeleton", "survival", "paracord", "classic knife",
    "bowie", "butterfly", "falchion", "flip", "gut", "huntsman", "shadow",
    "hegrenade", "he grenade", "grenade", "molotov", "incendiary", "inferno",
    "flashbang", "smokegrenade", "smoke", "decoy",
    "c4", "bomb", "planted",
    "taser", "zeus",
    "world", "fists", "fist", "hammer", "axe", "spanner", "wrench",
    "breachcharge", "bumpmine", "tablet", "healthshot", "shield",
)


def _is_firearm(name: Any) -> bool:
    if name is None:
        return False
    n = str(name).strip().lower()
    if not n:
        return False
    return not any(tok in n for tok in _NON_FIREARM_TOKENS)


# --------------------------------------------------------------------------
# Data model
# --------------------------------------------------------------------------


@dataclass
class Engagement:
    attacker: str
    victim: str
    round_num: int
    first_seen_tick: int
    last_seen_tick: int
    first_seen_pitch: float
    first_seen_yaw: float
    # Filled for converted engagements: eye-angle travel first_seen → first hit.
    # Unconverted engagements leave this at 0; callers must check `converted`.
    preaim_deg: float = 0.0
    distance: float = 0.0
    first_damage_tick: Optional[int] = None
    hit_pitch: Optional[float] = None
    hit_yaw: Optional[float] = None

    @property
    def converted(self) -> bool:
        return self.first_damage_tick is not None

    def ttd_seconds(self, tickrate: float) -> Optional[float]:
        if self.first_damage_tick is None:
            return None
        return (self.first_damage_tick - self.first_seen_tick) / tickrate


@dataclass
class EngagementSet:
    engagements: list[Engagement] = field(default_factory=list)
    tickrate: float = 64.0
    los_mode_used: str = "fov_only"
    warnings: list[str] = field(default_factory=list)


# --------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------


def _has_columns(df: Optional[pl.DataFrame], cols: list[str]) -> bool:
    if df is None or df.height == 0:
        return False
    return all(c in df.columns for c in cols)


def _forward_vectors(pitch_deg: np.ndarray, yaw_deg: np.ndarray) -> np.ndarray:
    """Source engine forward vectors. Positive pitch means looking down."""
    p = np.radians(pitch_deg)
    y = np.radians(yaw_deg)
    cp = np.cos(p)
    return np.stack([cp * np.cos(y), cp * np.sin(y), -np.sin(p)], axis=1)


def _view_angle_delta_deg(
    pitch0: float, yaw0: float, pitch1: float, yaw1: float
) -> float:
    """
    Angular distance (degrees) between two Source eye-angle samples.

    Matches Leetify's crosshair-placement idea: how far the view direction
    moved between first see and first damaging hit.
    """
    f0 = _forward_vectors(np.array([pitch0]), np.array([yaw0]))[0]
    f1 = _forward_vectors(np.array([pitch1]), np.array([yaw1]))[0]
    dot = float(np.clip(np.dot(f0, f1), -1.0, 1.0))
    return math.degrees(math.acos(dot))


def _round_start_ticks(demo: Any) -> dict[int, int]:
    rounds_df = demo.rounds
    if not _has_columns(rounds_df, ["round_num", "start"]):
        return {}
    cols = ["round_num", "start"]
    if "freeze_end" in rounds_df.columns:
        cols.append("freeze_end")
    rs = rounds_df.select(cols)
    if "freeze_end" in rs.columns:
        rs = rs.with_columns(
            pl.coalesce([pl.col("freeze_end"), pl.col("start")]).alias("rs_tick")
        )
    else:
        rs = rs.with_columns(pl.col("start").alias("rs_tick"))
    out: dict[int, int] = {}
    for r in rs.select(["round_num", "rs_tick"]).to_dicts():
        try:
            out[int(r["round_num"])] = int(r["rs_tick"])
        except (TypeError, ValueError):
            continue
    return out


def _truthy(value: Any, default: bool = True) -> bool:
    """Robust against bool / int8 / uint8 / None encodings from the parser."""
    if value is None:
        return default
    if isinstance(value, (bool, np.bool_)):
        return bool(value)
    try:
        return bool(int(value))
    except (TypeError, ValueError):
        return default


# --------------------------------------------------------------------------
# Tick frame preparation
# --------------------------------------------------------------------------


class _TickFrame:
    """Per-tick arrays for one round, prepared once and sliced per tick."""

    __slots__ = (
        "tick", "sid", "side", "eye", "fwd", "pitch", "yaw", "eligible",
        "entity_id", "spotted_mask", "spotted_by", "spotted",
    )

    def __init__(self, **kw: Any) -> None:
        for k, v in kw.items():
            setattr(self, k, v)


def _as_steamid_set(value: Any) -> set[str]:
    """Normalize demoparser `approximate_spotted_by` (list of steamids) into a set."""
    if value is None:
        return set()
    if isinstance(value, (list, tuple, set)):
        out: set[str] = set()
        for item in value:
            if item is None:
                continue
            s = str(item).strip()
            if s and s.lower() not in ("none", "nan"):
                out.add(s)
        return out
    # Rare: raw integer bitmask (legacy / other parsers).
    if isinstance(value, (int, np.integer)) and not isinstance(value, bool):
        return set()  # cannot map bits without slot indices; ignore here
    return set()


def _as_int_mask(value: Any) -> int:
    if value is None or isinstance(value, (list, tuple, set)):
        return 0
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


def _prepare_ticks(demo: Any, cfg: AimConfig) -> tuple[dict[int, _TickFrame], list[str]]:
    warnings: list[str] = []
    ticks = demo.ticks
    required = ["round_num", "tick", "steamid", "side", "X", "Y", "Z", "pitch", "yaw"]
    if not _has_columns(ticks, required):
        return {}, ["ticks frame is missing required columns"]

    optional = [
        "is_alive", "is_ducking", "duck_amount", "flash_duration",
        "active_weapon", "entity_id",
        # demoparser2 / awpy LOS aliases (spotted_by_mask is silently omitted)
        "spotted_by_mask", "approximate_spotted_by", "m_bSpottedByMask",
        "is_spotted", "spotted", "m_bSpotted",
    ]
    present_optional = [c for c in optional if c in ticks.columns]
    for name, why in (
        ("is_alive", "dead players cannot be filtered out"),
        ("flash_duration", "blind players are not excluded"),
        ("active_weapon", "knife/utility holders are not excluded"),
    ):
        if name not in present_optional:
            warnings.append(f"'{name}' not parsed - {why}")

    df = ticks.select(required + present_optional).drop_nulls(required)
    if df.height == 0:
        return {}, warnings + ["no usable tick rows"]

    round_starts = _round_start_ticks(demo)
    if not round_starts:
        return {}, warnings + ["could not determine round start ticks"]

    rows = df.to_dicts()

    # Bucket rows by (round, tick) while applying per-row eligibility.
    buckets: dict[int, dict[int, list[dict[str, Any]]]] = {}
    for r in rows:
        try:
            rn = int(r["round_num"])
            tk = int(r["tick"])
        except (TypeError, ValueError):
            continue
        rs_tick = round_starts.get(rn)
        if rs_tick is None or tk < rs_tick:
            continue
        if "is_alive" in r and not _truthy(r["is_alive"], True):
            continue
        buckets.setdefault(rn, {}).setdefault(tk, []).append(r)

    frames: dict[int, _TickFrame] = {}
    for rn, per_tick in buckets.items():
        frames[rn] = per_tick  # type: ignore[assignment]

    return frames, warnings  # type: ignore[return-value]


def _build_tick_arrays(players: list[dict[str, Any]], cfg: AimConfig) -> Optional[_TickFrame]:
    n = len(players)
    if n < 2:
        return None

    sid = np.empty(n, dtype=object)
    side = np.empty(n, dtype=object)
    pos = np.empty((n, 3), dtype=np.float64)
    pitch = np.empty(n, dtype=np.float64)
    yaw = np.empty(n, dtype=np.float64)
    eligible = np.ones(n, dtype=bool)
    entity_id = np.full(n, -1, dtype=np.int64)
    spotted_mask = np.zeros(n, dtype=np.int64)
    spotted_by = np.empty(n, dtype=object)
    spotted = np.ones(n, dtype=bool)

    for i, p in enumerate(players):
        try:
            sid[i] = str(p.get("steamid") or "")
            side[i] = str(p.get("side") or "").strip().lower()
            x, y, z = float(p["X"]), float(p["Y"]), float(p["Z"])
            pitch[i] = float(p["pitch"])
            yaw[i] = float(p["yaw"])
        except (TypeError, ValueError, KeyError):
            eligible[i] = False
            pos[i] = (0.0, 0.0, 0.0)
            spotted_by[i] = set()
            continue

        # Eye height: interpolate if duck_amount is available, else binary.
        eye_h = cfg.eye_height_stand
        if "duck_amount" in p and p["duck_amount"] is not None:
            try:
                da = max(0.0, min(1.0, float(p["duck_amount"])))
                eye_h = cfg.eye_height_stand + da * (cfg.eye_height_duck - cfg.eye_height_stand)
            except (TypeError, ValueError):
                pass
        elif "is_ducking" in p and _truthy(p.get("is_ducking"), False):
            eye_h = cfg.eye_height_duck
        pos[i] = (x, y, z + eye_h)

        if not sid[i] or not side[i]:
            eligible[i] = False

        # Blind gate
        if "flash_duration" in p and p["flash_duration"] is not None:
            try:
                if float(p["flash_duration"]) > cfg.blind_threshold_seconds:
                    eligible[i] = False
            except (TypeError, ValueError):
                pass

        # Weapon gate
        if cfg.require_firearm and "active_weapon" in p:
            if not _is_firearm(p.get("active_weapon")):
                eligible[i] = False

        if "entity_id" in p and p["entity_id"] is not None:
            try:
                entity_id[i] = int(p["entity_id"])
            except (TypeError, ValueError):
                pass

        spotted_by[i] = set()
        for key in ("approximate_spotted_by", "spotted_by_mask", "m_bSpottedByMask"):
            if key in p and p[key] is not None:
                if isinstance(p[key], (list, tuple, set)):
                    spotted_by[i] = _as_steamid_set(p[key])
                else:
                    spotted_mask[i] = _as_int_mask(p[key])
                break
        for key in ("is_spotted", "spotted", "m_bSpotted"):
            if key in p and p[key] is not None:
                spotted[i] = _truthy(p[key], True)
                break

    return _TickFrame(
        tick=0,
        sid=sid,
        side=side,
        eye=pos,
        fwd=_forward_vectors(pitch, yaw),
        pitch=pitch,
        yaw=yaw,
        eligible=eligible,
        entity_id=entity_id,
        spotted_mask=spotted_mask,
        spotted_by=spotted_by,
        spotted=spotted,
    )


# --------------------------------------------------------------------------
# Line of sight
# --------------------------------------------------------------------------


_MASK_COLS = ("approximate_spotted_by", "spotted_by_mask", "m_bSpottedByMask")
_SPOTTED_COLS = ("is_spotted", "spotted", "m_bSpotted")


def _resolve_los_mode(demo: Any, cfg: AimConfig) -> str:
    if cfg.los_mode != "auto":
        return cfg.los_mode
    cols = set(demo.ticks.columns) if demo.ticks is not None else set()
    # Prefer per-observer lists/masks from demoparser2 (`approximate_spotted_by`).
    if any(c in cols for c in _MASK_COLS):
        return "mask"
    if any(c in cols for c in _SPOTTED_COLS):
        return "spotted"
    return "fov_only"


def _los_matrix(f: _TickFrame, mode: str, cfg: AimConfig) -> np.ndarray:
    """(n, n) boolean: does attacker i have line of sight to target j?"""
    n = len(f.sid)
    if mode == "mask":
        out = np.zeros((n, n), dtype=bool)
        # demoparser2 exposes approximate_spotted_by as a list of steamids who see j.
        has_lists = any(isinstance(f.spotted_by[j], set) and f.spotted_by[j] for j in range(n)) or any(
            isinstance(f.spotted_by[j], set) for j in range(n)
        )
        if has_lists and any(isinstance(f.spotted_by[j], set) for j in range(n)):
            for j in range(n):
                seen_by = f.spotted_by[j] if isinstance(f.spotted_by[j], set) else set()
                if not seen_by:
                    continue
                for i in range(n):
                    if i == j:
                        continue
                    if f.sid[i] in seen_by:
                        out[i, j] = True
            return out
        # Fallback: classic integer bit mask keyed by entity slot.
        bits = f.entity_id - cfg.spotted_mask_bit_offset
        valid = bits >= 0
        for i in range(n):
            if not valid[i]:
                out[i, :] = True  # unknown entity id, do not block
                continue
            out[i, :] = ((f.spotted_mask >> int(bits[i])) & 1).astype(bool)
        return out
    if mode == "spotted":
        # Weaker: target is visible to *someone* on the attacking team.
        return np.broadcast_to(f.spotted[None, :], (n, n)).copy()
    return np.ones((n, n), dtype=bool)


# --------------------------------------------------------------------------
# Engagement construction
# --------------------------------------------------------------------------


def build_engagements(demo: Any, cfg: AimConfig = DEFAULT_CONFIG) -> EngagementSet:
    tickrate = float(getattr(demo, "tickrate", 64) or 64)
    result = EngagementSet(tickrate=tickrate)

    buckets, warnings = _prepare_ticks(demo, cfg)
    result.warnings.extend(warnings)
    if not buckets:
        return result

    los_mode = _resolve_los_mode(demo, cfg)
    result.los_mode_used = los_mode
    if los_mode == "fov_only":
        result.warnings.append(
            "no line-of-sight source available - results will be badly inflated. "
            "Re-parse with player_props including 'approximate_spotted_by'."
        )
    elif los_mode == "spotted":
        result.warnings.append(
            "using team-wide 'spotted' flag as LOS proxy - some through-wall "
            "false positives remain. 'approximate_spotted_by' is exact (steamid lists)."
        )

    cos_thr = math.cos(math.radians(cfg.fov_half_angle_deg))
    grace_ticks = max(1, int(round(cfg.los_grace_seconds * tickrate)))
    max_dist = cfg.max_engage_distance

    for rn in sorted(buckets.keys()):
        per_tick = buckets[rn]
        open_eng: dict[tuple[str, str], Engagement] = {}
        visible_count: dict[tuple[str, str], int] = {}
        lost_since: dict[tuple[str, str], int] = {}

        for tk in sorted(per_tick.keys()):
            f = _build_tick_arrays(per_tick[tk], cfg)
            if f is None:
                continue

            n = len(f.sid)
            delta = f.eye[None, :, :] - f.eye[:, None, :]        # [i, j] = j - i
            dist = np.linalg.norm(delta, axis=2)
            np.fill_diagonal(dist, np.inf)

            with np.errstate(divide="ignore", invalid="ignore"):
                cos_a = np.einsum("ik,ijk->ij", f.fwd, delta) / dist
            cos_a = np.nan_to_num(cos_a, nan=-1.0, posinf=-1.0, neginf=-1.0)

            enemy = f.side[:, None] != f.side[None, :]
            for arr in (enemy,):
                np.fill_diagonal(arr, False)

            # Leetify: first appearance in field of view. Optional LOS gate is
            # stricter and pulls TTD down vs reference sites.
            in_fov = (
                enemy
                & f.eligible[:, None]
                & (dist <= max_dist)
                & (cos_a >= cos_thr)
            )
            if cfg.require_los_to_engage:
                vis = in_fov & _los_matrix(f, los_mode, cfg)
            else:
                vis = in_fov

            seen_now: set[tuple[str, str]] = set()
            idx_i, idx_j = np.nonzero(vis)
            for i, j in zip(idx_i.tolist(), idx_j.tolist()):
                key = (f.sid[i], f.sid[j])
                if not key[0] or not key[1]:
                    continue
                seen_now.add(key)
                lost_since.pop(key, None)
                if key in open_eng:
                    open_eng[key].last_seen_tick = tk
                    visible_count[key] = visible_count.get(key, 0) + 1
                else:
                    open_eng[key] = Engagement(
                        attacker=key[0],
                        victim=key[1],
                        round_num=rn,
                        first_seen_tick=tk,
                        last_seen_tick=tk,
                        first_seen_pitch=float(f.pitch[i]),
                        first_seen_yaw=float(f.yaw[i]),
                        distance=float(dist[i, j]),
                    )
                    visible_count[key] = 1

            # Close engagements whose LOS has been broken past the grace period.
            for key in list(open_eng.keys()):
                if key in seen_now:
                    continue
                since = lost_since.setdefault(key, tk)
                if tk - since > grace_ticks:
                    eng = open_eng.pop(key)
                    lost_since.pop(key, None)
                    if visible_count.get(key, 0) >= cfg.min_visible_ticks:
                        result.engagements.append(eng)
                    visible_count.pop(key, None)

        # Flush anything still open at round end.
        for key, eng in open_eng.items():
            if visible_count.get(key, 0) >= cfg.min_visible_ticks:
                result.engagements.append(eng)

    _attach_damage(demo, result, cfg)
    _finalize_crosshair_placement(demo, result, cfg)
    return result


def _attacker_view_index(
    demo: Any,
) -> dict[str, list[tuple[int, float, float]]]:
    """steamid -> sorted [(tick, pitch, yaw), ...] for nearest-tick view lookup."""
    ticks = demo.ticks
    required = ["tick", "steamid", "pitch", "yaw"]
    if not _has_columns(ticks, required):
        return {}
    out: dict[str, list[tuple[int, float, float]]] = {}
    for r in ticks.select(required).drop_nulls(required).to_dicts():
        try:
            sid = str(r.get("steamid") or "")
            if not sid:
                continue
            tk = int(r["tick"])
            pitch = float(r["pitch"])
            yaw = float(r["yaw"])
        except (TypeError, ValueError, KeyError):
            continue
        out.setdefault(sid, []).append((tk, pitch, yaw))
    for sid in out:
        out[sid].sort(key=lambda x: x[0])
    return out


def _view_at_or_before(
    series: list[tuple[int, float, float]], tick: int
) -> Optional[tuple[float, float]]:
    """Latest (pitch, yaw) at or before `tick` (demo ticks are discrete)."""
    if not series:
        return None
    lo, hi = 0, len(series) - 1
    best: Optional[tuple[float, float]] = None
    while lo <= hi:
        mid = (lo + hi) // 2
        tk, pitch, yaw = series[mid]
        if tk <= tick:
            best = (pitch, yaw)
            lo = mid + 1
        else:
            hi = mid - 1
    return best


def _attach_damage(demo: Any, result: EngagementSet, cfg: AimConfig) -> None:
    damages = demo.damages
    needed = ["attacker_steamid", "victim_steamid", "round_num", "tick"]
    if not _has_columns(damages, needed):
        result.warnings.append("damages frame unusable - no TTD will be produced")
        return

    cols = list(needed)
    for extra in ("weapon", "dmg_health", "attacker_side", "victim_side"):
        if extra in damages.columns:
            cols.append(extra)
    if "weapon" not in cols:
        result.warnings.append("'weapon' missing from damages - utility damage is counted")

    rows = damages.select(cols).drop_nulls(needed).to_dicts()

    # (attacker, victim, round) -> sorted list of firearm damage ticks
    by_pair: dict[tuple[str, str, int], list[int]] = {}
    for r in rows:
        a = str(r.get("attacker_steamid") or "")
        v = str(r.get("victim_steamid") or "")
        if not a or not v or a == v:
            continue
        if "attacker_side" in r and "victim_side" in r:
            if str(r["attacker_side"] or "").lower() == str(r["victim_side"] or "").lower():
                continue  # team damage
        if "weapon" in r and not _is_firearm(r.get("weapon")):
            continue
        if "dmg_health" in r and r["dmg_health"] is not None:
            try:
                if float(r["dmg_health"]) <= 0:
                    continue
            except (TypeError, ValueError):
                pass
        try:
            rn = int(r["round_num"])
            tk = int(r["tick"])
        except (TypeError, ValueError):
            continue
        by_pair.setdefault((a, v, rn), []).append(tk)

    for k in by_pair:
        by_pair[k].sort()

    max_ttd_ticks = int(round(cfg.ttd_max_seconds * result.tickrate))
    grace_ticks = max(1, int(round(cfg.los_grace_seconds * result.tickrate)))
    used: dict[tuple[str, str, int], set[int]] = {}

    ordered = sorted(result.engagements, key=lambda e: (e.round_num, e.first_seen_tick))
    for eng in ordered:
        key = (eng.attacker, eng.victim, eng.round_num)
        ticks = by_pair.get(key)
        if not ticks:
            continue
        taken = used.setdefault(key, set())
        window_end = eng.last_seen_tick + grace_ticks + max_ttd_ticks
        for tk in ticks:
            if tk in taken:
                continue
            if tk < eng.first_seen_tick:
                continue
            if tk > window_end:
                break
            if tk - eng.first_seen_tick > max_ttd_ticks:
                break
            eng.first_damage_tick = tk
            taken.add(tk)
            break


def _finalize_crosshair_placement(
    demo: Any, result: EngagementSet, cfg: AimConfig
) -> None:
    """
    Leetify crosshair placement: degrees of eye-angle change from first
    visibility to first damaging hit on that enemy (converted only).
    """
    del cfg  # reserved for future caps / sample filters
    views = _attacker_view_index(demo)
    if not views:
        result.warnings.append(
            "ticks missing pitch/yaw - crosshair placement cannot be finalized"
        )
        return

    missing = 0
    for eng in result.engagements:
        if eng.first_damage_tick is None:
            continue
        series = views.get(eng.attacker)
        if not series:
            missing += 1
            continue
        hit = _view_at_or_before(series, int(eng.first_damage_tick))
        if hit is None:
            missing += 1
            continue
        eng.hit_pitch, eng.hit_yaw = hit
        eng.preaim_deg = _view_angle_delta_deg(
            eng.first_seen_pitch,
            eng.first_seen_yaw,
            eng.hit_pitch,
            eng.hit_yaw,
        )

    if missing:
        result.warnings.append(
            f"crosshair placement: missing attacker view for {missing} converted engagement(s)"
        )


# --------------------------------------------------------------------------
# Caching
# --------------------------------------------------------------------------


_CACHE_ATTR = "_csgrind_engagement_set"


def get_engagements(demo: Any, cfg: AimConfig = DEFAULT_CONFIG) -> EngagementSet:
    cached = getattr(demo, _CACHE_ATTR, None)
    if isinstance(cached, tuple) and cached[0] == cfg:
        return cached[1]
    built = build_engagements(demo, cfg)
    try:
        setattr(demo, _CACHE_ATTR, (cfg, built))
    except (AttributeError, TypeError):
        pass
    return built


# --------------------------------------------------------------------------
# Public metrics
# --------------------------------------------------------------------------


def time_to_damage_per_player(
    demo: Any, cfg: AimConfig = DEFAULT_CONFIG
) -> dict[str, float]:
    """
    Leetify-style TTD: mean milliseconds from enemy first visible (FOV+LOS when
    available) to first firearm damage on that enemy, then scaled toward Leetify
    public magnitudes (`leetify_ttd_scale`).
    """
    es = get_engagements(demo, cfg)
    samples: dict[str, list[float]] = {}
    for eng in es.engagements:
        ttd = eng.ttd_seconds(es.tickrate)
        if ttd is None or ttd < 0.0 or ttd > cfg.ttd_max_seconds:
            continue
        samples.setdefault(eng.attacker, []).append(ttd * 1000.0)

    scale = float(cfg.leetify_ttd_scale) if cfg.leetify_ttd_scale > 0 else 1.0
    return {
        sid: (sum(v) / len(v)) * scale
        for sid, v in samples.items()
        if len(v) >= cfg.min_ttd_samples
    }


def preaim_per_player(demo: Any, cfg: AimConfig = DEFAULT_CONFIG) -> dict[str, float]:
    """
    Leetify crosshair placement: median degrees of eye-angle travel from first
    visibility to first firearm hit (converted only), then scaled toward Leetify
    public magnitudes (`leetify_preaim_scale`). Lower is better.
    """
    es = get_engagements(demo, cfg)
    samples: dict[str, list[float]] = {}
    for eng in es.engagements:
        if not eng.converted or eng.hit_pitch is None or eng.hit_yaw is None:
            continue
        if eng.preaim_deg > cfg.preaim_max_deg:
            continue
        samples.setdefault(eng.attacker, []).append(eng.preaim_deg)

    scale = float(cfg.leetify_preaim_scale) if cfg.leetify_preaim_scale > 0 else 1.0
    out: dict[str, float] = {}
    for sid, v in samples.items():
        if len(v) < cfg.min_preaim_samples:
            continue
        raw = float(np.median(v)) if cfg.preaim_use_median else sum(v) / len(v)
        out[sid] = raw * scale
    return out


def preaim_components_per_player(
    demo: Any, cfg: AimConfig = DEFAULT_CONFIG
) -> dict[str, dict[str, float]]:
    """
    Crosshair-placement components for converted engagements only (same sample
    set as `preaim_per_player`).
    """
    es = get_engagements(demo, cfg)
    agg: dict[str, dict[str, list[float]]] = {}
    for eng in es.engagements:
        if not eng.converted or eng.hit_pitch is None or eng.hit_yaw is None:
            continue
        if eng.preaim_deg > cfg.preaim_max_deg:
            continue
        agg.setdefault(eng.attacker, {"total": []})["total"].append(eng.preaim_deg)

    scale = float(cfg.leetify_preaim_scale) if cfg.leetify_preaim_scale > 0 else 1.0
    return {
        sid: {
            "total_deg": float(np.median(v["total"])) * scale,
            "samples": float(len(v["total"])),
        }
        for sid, v in agg.items()
        if len(v["total"]) >= cfg.min_preaim_samples
    }


# --------------------------------------------------------------------------
# Calibration helpers
# --------------------------------------------------------------------------


def debug_aim_stats(demo: Any, cfg: AimConfig = DEFAULT_CONFIG) -> dict[str, Any]:
    """Distribution diagnostics. Run this before comparing against Leetify."""
    es = get_engagements(demo, cfg)
    engs = es.engagements
    if not engs:
        return {"engagements": 0, "warnings": es.warnings, "los_mode": es.los_mode_used}

    rounds = len({e.round_num for e in engs})
    players = len({e.attacker for e in engs})
    ttds = [e.ttd_seconds(es.tickrate) * 1000.0 for e in engs if e.converted]
    ttds = [t for t in ttds if 0 <= t <= cfg.ttd_max_seconds * 1000.0]
    preaims = [
        e.preaim_deg
        for e in engs
        if e.converted
        and e.hit_pitch is not None
        and e.preaim_deg <= cfg.preaim_max_deg
    ]

    def pct(v: list[float], q: float) -> Optional[float]:
        return float(np.percentile(v, q)) if v else None

    return {
        "los_mode": es.los_mode_used,
        "warnings": es.warnings,
        "engagements": len(engs),
        "engagements_per_player_per_round": round(
            len(engs) / max(1, rounds * players), 2
        ),
        "conversion_rate": round(sum(1 for e in engs if e.converted) / len(engs), 3),
        "ttd_ms": {
            "n": len(ttds),
            "mean": round(sum(ttds) / len(ttds), 1) if ttds else None,
            "p25": pct(ttds, 25),
            "p50": pct(ttds, 50),
            "p75": pct(ttds, 75),
            "at_cap_share": round(
                sum(1 for t in ttds if t > cfg.ttd_max_seconds * 1000.0 * 0.95)
                / max(1, len(ttds)),
                3,
            ),
        },
        "preaim_deg": {
            "n": len(preaims),
            "mean": round(sum(preaims) / len(preaims), 2) if preaims else None,
            "p25": pct(preaims, 25),
            "p50": pct(preaims, 50),
            "p75": pct(preaims, 75),
        },
        "median_engage_distance": round(
            float(np.median([e.distance for e in engs])), 1
        ),
    }


def sweep(
    demo: Any,
    steamid: str,
    param: str,
    values: list[Any],
    base: AimConfig = DEFAULT_CONFIG,
) -> list[dict[str, Any]]:
    """
    Vary one config parameter and report the resulting metrics for one player.
    Use this to find the settings that land closest to the reference sites.

        sweep(demo, "76561198043955928", "fov_half_angle_deg", [35, 45, 53, 60])
    """
    out = []
    for v in values:
        cfg = replace(base, **{param: v})
        es = build_engagements(demo, cfg)
        setattr(demo, _CACHE_ATTR, (cfg, es))
        ttd = time_to_damage_per_player(demo, cfg).get(steamid)
        pre = preaim_per_player(demo, cfg).get(steamid)
        out.append(
            {
                param: v,
                "ttd_ms": round(ttd, 1) if ttd is not None else None,
                "preaim_deg": round(pre, 2) if pre is not None else None,
                "engagements": len(es.engagements),
            }
        )
    try:
        delattr(demo, _CACHE_ATTR)
    except AttributeError:
        pass
    return out