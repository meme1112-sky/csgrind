"""
Leetify-inspired layout for /v1/analytics/by-steam — one JSON the UI can render as category cards + match list.
Demo-derived only (not Leetify's proprietary benchmarks).
"""

from __future__ import annotations

import json
from statistics import mean
from typing import Any
from pathlib import Path


_RISK_CFG_CACHE: dict[str, dict[str, Any]] = {}


def _load_risk_cfg(name: str) -> dict[str, Any]:
    """
    Load a Premier risk config from app/static/risk/*.json.
    Cached for process lifetime.
    """
    if name in _RISK_CFG_CACHE:
        return _RISK_CFG_CACHE[name]
    base = Path(__file__).resolve().parents[1] / "static" / "risk"
    p = base / name
    cfg = json.loads(p.read_text(encoding="utf-8"))
    if not isinstance(cfg, dict):
        raise ValueError(f"Invalid risk config: {name}")
    _RISK_CFG_CACHE[name] = cfg
    return cfg


def _risk_cfg_for_premier_rating(premier_rating: int | None) -> dict[str, Any]:
    # Default to the mid bracket if no grade supplied.
    pr = premier_rating or 12_000
    if pr >= 25_000:
        return _load_risk_cfg("premier_25000_plus.json")
    if pr >= 20_000:
        return _load_risk_cfg("premier_20000_24999.json")
    if pr >= 15_000:
        return _load_risk_cfg("premier_15000_19999.json")
    if pr >= 10_000:
        return _load_risk_cfg("premier_10000_14999.json")
    if pr >= 5_000:
        return _load_risk_cfg("premier_5000_9999.json")
    return _load_risk_cfg("premier_1000_4999.json")


def _premier_rating_from_faceit_elo(elo: int | float | None) -> int | None:
    """
    Map FACEIT CS2 Elo → synthetic Premier rating for risk-band selection.

    Used only when Premier is missing / unranked. Anchors ~2.8k Elo (L10) into
    the 25000+ table so FACEIT-only high-level players are not scored against
    the default mid-Premier bands.
    """
    if elo is None:
        return None
    try:
        e = float(elo)
    except (TypeError, ValueError):
        return None
    if e != e or e <= 0:  # NaN / non-positive
        return None
    if e >= 2800:
        return 27_000  # 25000+
    if e >= 2500:
        return 22_500  # 20000-24999
    if e >= 2000:
        return 17_500  # 15000-19999
    if e >= 1500:
        return 12_500  # 10000-14999
    if e >= 1000:
        return 7_500  # 5000-9999
    return 3_000  # 1000-4999


def _resolve_effective_premier_rating(
    premier_rating: int | None,
    faceit_elo: int | float | None = None,
) -> tuple[int, str]:
    """
    Prefer live Premier (≥1000). Else map FACEIT Elo. Else mid-bracket default.

    Returns (rating_for_bands, source) where source is premier|faceit|default.
    """
    if premier_rating is not None and int(premier_rating) >= 1000:
        return int(premier_rating), "premier"
    mapped = _premier_rating_from_faceit_elo(faceit_elo)
    if mapped is not None:
        return mapped, "faceit"
    return 12_000, "default"



def _clamp01(x: float) -> float:
    if x != x:  # NaN
        return 0.0
    if x < 0:
        return 0.0
    if x > 1:
        return 1.0
    return float(x)


def _risk_component(value: float, *, normal_lo: float, normal_hi: float, invert: bool) -> float:
    """
    Return risk in [0..1] for one metric.

    Mirrors csgrind_v1's `norm`/`inv` semantics: the entire normal range
    [normal_lo, normal_hi] is mapped linearly to [0..1] risk. Values beyond
    either edge are clamped (no out-of-range extrapolation).

    - invert=False (e.g. KD, WR, accHead, aim): higher value → higher risk.
        value <= normal_lo → 0.0   (safest end)
        value >= normal_hi → 1.0   (top edge of normal range)
    - invert=True  (e.g. TTD): lower value → higher risk.
        value >= normal_hi → 0.0   (safest end)
        value <= normal_lo → 1.0   (top edge of normal range)

    Pre-aim uses `_risk_component_preaim` instead (lower ° = better skill, not risk).

    Hard "suspicious" floors are NOT applied as instant fails here — TTD uses the
    invert clamp; pre-aim uses `_risk_component_preaim`. The aim force-suspicious
    flag still only affects band colour.
    """
    if normal_hi == normal_lo:
        return 0.0
    if invert:
        return _clamp01((normal_hi - value) / (normal_hi - normal_lo))
    return _clamp01((value - normal_lo) / (normal_hi - normal_lo))


def _risk_component_preaim(
    value: float, *, normal_lo: float, suspicious_if_lt: float | None
) -> float:
    """
    Pre-aim / crosshair placement (degrees): lower = better aim.

    Elite and normal-good placement must not inflate trust risk — only values
    below `suspicious_if_lt` add a full weighted pre-aim component (not an
    instant 100% risk fail). Worse-than-normal placement (high °) is zero risk.
    """
    if value >= normal_lo:
        return 0.0
    if suspicious_if_lt is not None and value < float(suspicious_if_lt):
        return 1.0
    return 0.0


def compute_risk_scores(
    *,
    premier_rating: int | None,
    avg_ttd_ms: float | None,
    avg_kd: float | None,
    open_win_pct: float | None,
    avg_crosshair: float | None,
    avg_hs_frac: float | None,
    avg_aim_pct: float | None = None,
    faceit_elo: int | float | None = None,
) -> dict[str, Any]:
    """
    Compute (risk_score, trust_rating, band) using the JSON configs in app/static/risk.

    Mirrors the csgrind_v1 algorithm with one calibration change:
      1. Each metric value is mapped linearly across its normal range to [0..1] risk.
      2. TTD / pre-aim below `suspicious_if_lt` no longer force risk_score=100.
         They contribute through the weighted components only (TTD invert clamps at
         1.0 below normal_lo; pre-aim uses `_risk_component_preaim`). Hard red
         triggers were nuking trust for the whole population while aim_metrics
         runs below Leetify-calibrated bands.
      3. The aim "suspicious_if_gte" flag forces the band to "danger" without changing
         the score.
      4. Weighted sum across metrics produces the final risk_score 0..100.
         Weights sum to ~1.0; missing metrics simply contribute 0 (safer score), matching v1.
      5. trust_rating = 100 - risk_score.
      6. Band thresholds come from `chip_thresholds` in the JSON
         (default: normal_max=30, caution_max=75).
      7. When Premier is missing/unranked, FACEIT Elo selects the risk table.
    """
    effective_pr, bracket_source = _resolve_effective_premier_rating(premier_rating, faceit_elo)
    cfg = _risk_cfg_for_premier_rating(effective_pr)
    metrics = cfg.get("metrics") if isinstance(cfg.get("metrics"), dict) else {}

    def get_val(key: str) -> float | None:
        if key == "ttd":
            return float(avg_ttd_ms) if isinstance(avg_ttd_ms, (int, float)) else None
        if key == "kd":
            return float(avg_kd) if isinstance(avg_kd, (int, float)) else None
        if key == "wr":
            # Config uses 0..1 fractions.
            return float(open_win_pct) / 100.0 if isinstance(open_win_pct, (int, float)) else None
        if key == "preaim":
            return float(avg_crosshair) if isinstance(avg_crosshair, (int, float)) else None
        if key == "accHead":
            # Stored as 0..1 fraction (percent=true in JSON just signals it's a percent-like stat).
            return float(avg_hs_frac) if isinstance(avg_hs_frac, (int, float)) else None
        if key == "aim":
            return float(avg_aim_pct) if isinstance(avg_aim_pct, (int, float)) else None
        return None

    # Aim ≥ suspicious_if_gte — affects band only, not score.
    aim_spec = metrics.get("aim") if isinstance(metrics.get("aim"), dict) else None
    aim_val = get_val("aim")
    aim_susp = aim_spec.get("suspicious_if_gte") if aim_spec else None
    force_suspicious_band = (
        aim_val is not None and isinstance(aim_susp, (int, float)) and aim_val >= float(aim_susp)
    )

    weighted = 0.0
    for k, spec in metrics.items():
        if not isinstance(spec, dict):
            continue
        v = get_val(str(k))
        if v is None:
            continue
        w = spec.get("weight")
        if not isinstance(w, (int, float)) or w <= 0:
            continue
        normal_lo = spec.get("normal_lo")
        normal_hi = spec.get("normal_hi")
        if not isinstance(normal_lo, (int, float)) or not isinstance(normal_hi, (int, float)):
            continue
        if str(k) == "preaim":
            susp = spec.get("suspicious_if_lt")
            susp_f = float(susp) if isinstance(susp, (int, float)) else None
            comp = _risk_component_preaim(
                float(v), normal_lo=float(normal_lo), suspicious_if_lt=susp_f
            )
        else:
            invert = bool(spec.get("invert"))
            comp = _risk_component(
                float(v), normal_lo=float(normal_lo), normal_hi=float(normal_hi), invert=invert
            )
        weighted += float(w) * comp
    # v1 does not normalize by present weights — config weights sum to ~1.0 and a
    # missing metric simply contributes 0 (safer score).
    risk_score = _clamp01(weighted) * 100.0

    thresholds = cfg.get("chip_thresholds") if isinstance(cfg.get("chip_thresholds"), dict) else {}
    normal_max_raw = thresholds.get("normal_max", 30)
    caution_max_raw = thresholds.get("caution_max", 75)
    normal_max = float(normal_max_raw) if isinstance(normal_max_raw, (int, float)) else 30.0
    caution_max = float(caution_max_raw) if isinstance(caution_max_raw, (int, float)) else 75.0

    if force_suspicious_band:
        band = "danger"
    else:
        band = (
            "normal" if risk_score <= normal_max
            else "caution" if risk_score <= caution_max
            else "danger"
        )

    # Trust tracks risk continuously (never flat 100% for the whole normal band).
    # Band is still used for chip colour; trust_rating = 100 - risk_score.
    trust = 100.0 - float(risk_score)

    return {
        "premier_range": cfg.get("range"),
        "premier_bracket_source": bracket_source,
        "effective_premier_rating": effective_pr,
        "risk_score": round(risk_score, 1),
        "trust_rating": round(trust, 1),
        "band": band,
    }


def _f(x: Any) -> float | None:
    if isinstance(x, (int, float)):
        return float(x)
    return None


def _i(x: Any) -> int:
    if isinstance(x, int):
        return x
    if isinstance(x, float):
        return int(x)
    return 0


def _kd_ratio(kills: int, deaths: int) -> float:
    if deaths <= 0:
        return float(kills)
    return round(kills / deaths, 3)


def _tier_rating(r: float | None) -> str | None:
    if r is None:
        return None
    if r >= 1.25:
        return "exceptional"
    if r >= 1.05:
        return "strong"
    if r >= 0.85:
        return "average"
    return "below_average"


def _tier_hs(h: float | None) -> str | None:
    if h is None:
        return None
    pct = h * 100 if h <= 1.0 else h
    if pct >= 55:
        return "strong"
    if pct >= 40:
        return "average"
    return "below_average"


def _tier_kast(k: float | None) -> str | None:
    if k is None:
        return None
    pct = k * 100 if k <= 1.0 else k
    if pct >= 75:
        return "strong"
    if pct >= 65:
        return "average"
    return "below_average"


def _metric(
    mid: str,
    label: str,
    value: Any,
    *,
    unit: str | None = None,
    format_id: str = "number",
    tier: str | None = None,
    description: str | None = None,
) -> dict[str, Any]:
    out: dict[str, Any] = {
        "id": mid,
        "label": label,
        "value": value,
        "format": format_id,
    }
    if unit:
        out["unit"] = unit
    if tier:
        out["tier"] = tier
    if description:
        out["description"] = description
    return out


def _aggregate_grenades(per_match: list[dict]) -> dict[str, float]:
    """Average throws per match by grenade type (across sessions)."""
    totals: dict[str, list[int]] = {}
    for m in per_match:
        g = (m.get("stats") or {}).get("grenades_by_type") or {}
        if not isinstance(g, dict):
            continue
        for t, n in g.items():
            totals.setdefault(str(t), []).append(int(n or 0))
    return {t: round(mean(vals), 2) for t, vals in totals.items() if vals}


def _avg(stat_rows: list[dict], key: str) -> float | None:
    vals = [_f(s.get(key)) for s in stat_rows]
    nums = [v for v in vals if v is not None]
    if not nums:
        return None
    return float(mean(nums))


def _ttd_to_ms(value: float | None) -> float | None:
    """Pass through demo-exported time_to_damage (already milliseconds from aim_metrics)."""
    if value is None:
        return None
    return float(value)


def _sum_avg(stat_rows: list[dict], key: str) -> float | None:
    """Average of a non-negative numeric stat across matches (zero counts as zero)."""
    nums = [float(s.get(key)) for s in stat_rows if isinstance(s.get(key), (int, float))]
    return float(mean(nums)) if nums else None


def _tier_ttd(value_ms: float | None) -> str | None:
    if value_ms is None:
        return None
    if value_ms < 450:
        return "below_average"
    if value_ms <= 650:
        return "average"
    return "strong"


def _ttd_flag(value_ms: float | None) -> str | None:
    if value_ms is None:
        return None
    if value_ms < 450:
        return "suspicious_low"
    return None


def _tier_crosshair(deg: float | None) -> str | None:
    if deg is None:
        return None
    if deg <= 4:
        return "exceptional"
    if deg <= 7:
        return "strong"
    if deg <= 11:
        return "average"
    return "below_average"


def _tier_utility_dmg(util_dmg_per_match: float | None) -> str | None:
    """Crude tier for total HE/molotov damage averaged per match."""
    if util_dmg_per_match is None:
        return None
    if util_dmg_per_match >= 120:
        return "strong"
    if util_dmg_per_match >= 60:
        return "average"
    return "below_average"


def _opening_win_rate(stat_rows: list[dict]) -> float | None:
    won = sum(int(s.get("opening_kills_won") or 0) for s in stat_rows)
    lost = sum(int(s.get("opening_kills_lost") or 0) for s in stat_rows)
    total = won + lost
    if total <= 0:
        return None
    return round(won / total * 100.0, 1)


def build_leetify_by_steam_payload(
    steam_id: str,
    *,
    max_matches: int,
    scan_recent: int,
    matches_scanned: int,
    per_match_raw: list[dict],
    averages: dict[str, float | None],
    premier_rating: int | None = None,
    faceit_elo: int | float | None = None,
) -> dict[str, Any]:
    """
    Build the single response body for GET /v1/analytics/by-steam/...
    """
    display_name = ""
    if per_match_raw:
        display_name = str((per_match_raw[0].get("stats") or {}).get("name") or "").strip()

    stat_rows = [m["stats"] for m in per_match_raw if isinstance(m.get("stats"), dict)]
    kd_ratios = [_kd_ratio(_i(s.get("kills")), _i(s.get("deaths"))) for s in stat_rows]
    avg_kd = round(mean(kd_ratios), 3) if kd_ratios else None

    n = len(per_match_raw)
    maps = list({m.get("map_name") for m in per_match_raw if m.get("map_name")})

    avg_rating = averages.get("rating")
    avg_adr = averages.get("adr")
    avg_kast = averages.get("kast")
    avg_hs = averages.get("headshot_pct")
    avg_kills = averages.get("kills")
    avg_deaths = averages.get("deaths")

    impact_vals = [x for x in (_f(s.get("impact")) for s in stat_rows) if x is not None]
    impact_avg = round(mean(impact_vals), 4) if impact_vals else None

    avg_ttd = _ttd_to_ms(_avg(stat_rows, "time_to_damage"))
    avg_xhair = _avg(stat_rows, "crosshair_placement")
    avg_util_dmg = _sum_avg(stat_rows, "utility_damage")
    avg_smoke_kills = _sum_avg(stat_rows, "kills_through_smokes")
    avg_open_won = _sum_avg(stat_rows, "opening_kills_won")
    avg_open_lost = _sum_avg(stat_rows, "opening_kills_lost")
    avg_knife_inspects = _sum_avg(stat_rows, "knife_inspections")
    # Heuristic knife inspects collapse without round_start boundaries and can
    # report 100+/match. Drop clearly impossible rates from the integrity UI.
    if avg_knife_inspects is not None and avg_knife_inspects > 40:
        avg_knife_inspects = None
    open_win_pct = _opening_win_rate(stat_rows)
    # Opening WR is extremely noisy under ~10 demos (e.g. 100% from a hot streak).
    # Exclude it from trust scoring until the sample is large enough.
    risk_open_wr = open_win_pct if n >= 10 else None

    risk = compute_risk_scores(
        premier_rating=premier_rating,
        faceit_elo=faceit_elo,
        avg_ttd_ms=avg_ttd,
        avg_kd=avg_kd,
        open_win_pct=risk_open_wr,
        avg_crosshair=avg_xhair,
        avg_hs_frac=avg_hs,
        # avg_aim_pct not currently produced by the pipeline (leave None until added).
        avg_aim_pct=None,
    )

    multi_totals: dict[str, list[int]] = {"2k": [], "3k": [], "4k": [], "5k": []}
    for s in stat_rows:
        mk = s.get("multikills") or {}
        if not isinstance(mk, dict):
            continue
        for k in multi_totals:
            multi_totals[k].append(int(mk.get(k) or 0))
    avg_multi = {k: (round(mean(v), 2) if v else None) for k, v in multi_totals.items()}

    categories: list[dict[str, Any]] = [
        {
            "id": "combat",
            "title": "Combat",
            "subtitle": "Impact, rating, and trading (HLTV-style from demos)",
            "metrics": [
                _metric(
                    "rating",
                    "Rating",
                    round(avg_rating, 3) if avg_rating is not None else None,
                    format_id="decimal",
                    tier=_tier_rating(avg_rating),
                    description="HLTV 2.0-style rating averaged across matches.",
                ),
                _metric(
                    "impact",
                    "Impact",
                    impact_avg,
                    format_id="decimal",
                    description="Per-round impact from kills and assists.",
                ),
                _metric(
                    "adr",
                    "ADR",
                    round(avg_adr, 2) if avg_adr is not None else None,
                    unit="dmg/round",
                    format_id="decimal",
                    description="Average damage per round.",
                ),
                _metric(
                    "kd",
                    "K/D",
                    avg_kd,
                    format_id="decimal",
                    description="Kill/death ratio per match, then averaged.",
                ),
                _metric(
                    "kast",
                    "KAST",
                    round(avg_kast * 100, 1) if avg_kast is not None and avg_kast <= 1 else avg_kast,
                    unit="%"
                    if avg_kast is not None and avg_kast <= 1
                    else None,
                    format_id="percent" if avg_kast is not None and avg_kast <= 1 else "decimal",
                    tier=_tier_kast(avg_kast),
                    description="Rounds with kill, assist, survival, or traded death.",
                ),
                _metric(
                    "kills",
                    "Kills / Deaths",
                    f"{round(avg_kills, 1) if avg_kills is not None else '—'} / "
                    f"{round(avg_deaths, 1) if avg_deaths is not None else '—'}",
                    format_id="text",
                    description="Average kills and deaths per match.",
                ),
                _metric(
                    "time_to_damage",
                    "Time To Damage",
                    round(avg_ttd, 2) if avg_ttd is not None else None,
                    unit="ms",
                    format_id="decimal",
                    tier=_tier_ttd(avg_ttd),
                    description=(
                        "Average milliseconds from first enemy appearing in your view to first damage. "
                        "<450ms is suspiciously low; most pros are 450ms+."
                    ),
                ),
                _metric(
                    "opening_duels",
                    "Opening duels",
                    f"{round(avg_open_won, 1) if avg_open_won is not None else '—'} W / "
                    f"{round(avg_open_lost, 1) if avg_open_lost is not None else '—'} L",
                    format_id="text",
                    description="Average wins and losses on the first kill of each round.",
                ),
                _metric(
                    "opening_win_pct",
                    "Opening win %",
                    open_win_pct,
                    unit="%",
                    format_id="percent",
                    description="Share of opening duels won across all rounds in the sample.",
                ),
                _metric(
                    "multikills",
                    "Multi-kill rounds",
                    "/".join(
                        f"{avg_multi[k]:.1f}" if avg_multi[k] is not None else "—"
                        for k in ("2k", "3k", "4k", "5k")
                    ) + " (2k/3k/4k/5k per match)",
                    format_id="text",
                    description="Average rounds per match with 2/3/4/5 kills.",
                ),
            ],
        },
        {
            "id": "aim",
            "title": "Aim",
            "subtitle": "Headshot share and crosshair placement from demo events",
            "metrics": [
                _metric(
                    "headshot_pct",
                    "Headshot %",
                    round((avg_hs or 0) * 100, 1) if avg_hs is not None and avg_hs <= 1 else avg_hs,
                    unit="%",
                    format_id="percent",
                    tier=_tier_hs(avg_hs),
                    description="Headshot kills divided by total kills (demo events).",
                ),
                _metric(
                    "headshot_kills",
                    "Headshot kills",
                    round(mean([_i(s.get("headshot_kills")) for s in stat_rows]), 1) if stat_rows else None,
                    format_id="decimal",
                    description="Average headshot kills per match.",
                ),
                _metric(
                    "crosshair_placement",
                    "Crosshair placement",
                    round(avg_xhair, 2) if avg_xhair is not None else None,
                    unit="°",
                    format_id="decimal",
                    tier=_tier_crosshair(avg_xhair),
                    description=(
                        "Avg angular distance between aim and victim at the kill. Lower ° = better pre-aim. "
                        "Values well below the bracket typical are elite skill; only implausibly low values "
                        "(below ~2°) affect trust."
                    ),
                ),
                _metric(
                    "knife_inspections",
                    "Knife inspections",
                    round(avg_knife_inspects, 1) if avg_knife_inspects is not None else None,
                    unit="/match",
                    format_id="decimal",
                    description="Estimated knife inspect actions per match from demo item_equip events.",
                ),
            ],
        },
        {
            "id": "utility",
            "title": "Utility",
            "subtitle": "Grenade impact and throws (per demo)",
            "metrics": [
                _metric(
                    "utility_damage",
                    "Utility damage",
                    round(avg_util_dmg, 1) if avg_util_dmg is not None else None,
                    unit="dmg/match",
                    format_id="decimal",
                    tier=_tier_utility_dmg(avg_util_dmg),
                    description="Average HE / molotov / incendiary damage dealt per match.",
                ),
                _metric(
                    "kills_through_smokes",
                    "Kills through smokes",
                    round(avg_smoke_kills, 2) if avg_smoke_kills is not None else None,
                    format_id="decimal",
                    description="Average kills per match where the line of sight crosses an active smoke.",
                ),
                *[
                    _metric(
                        gtype,
                        gtype.replace("_", " ").title(),
                        val,
                        format_id="decimal",
                        description="Average throws per match of this type.",
                    )
                    for gtype, val in sorted(_aggregate_grenades(per_match_raw).items(), key=lambda x: -x[1])
                ],
            ],
        },
    ]

    matches_ui: list[dict[str, Any]] = []
    for m in per_match_raw:
        s = m.get("stats") or {}
        r = _f(s.get("rating"))
        hs = _f(s.get("headshot_pct"))
        ks = _i(s.get("kills"))
        ds = _i(s.get("deaths"))
        ttd = _ttd_to_ms(_f(s.get("time_to_damage")))
        matches_ui.append(
            {
                "match_id": m.get("match_id"),
                "map": m.get("map_name"),
                "played_at": m.get("updated_at"),
                "source": m.get("source"),
                "faceit_player_id": m.get("faceit_player_id"),
                "score_us": m.get("score_us"),
                "score_them": m.get("score_them"),
                "outcome": m.get("outcome"),
                "panels": {
                    "combat": {
                        "rating": r,
                        "impact": _f(s.get("impact")),
                        "adr": _f(s.get("adr")),
                        "kd": _kd_ratio(ks, ds),
                        "kast_pct": round((_f(s.get("kast")) or 0) * 100, 1)
                        if (_f(s.get("kast")) or 0) <= 1
                        else _f(s.get("kast")),
                        "kills": ks,
                        "deaths": ds,
                        "time_to_damage": ttd,
                        "time_to_damage_flag": _ttd_flag(ttd),
                        "opening_kills_won": _i(s.get("opening_kills_won")),
                        "opening_kills_lost": _i(s.get("opening_kills_lost")),
                        "multikills": s.get("multikills") or {"2k": 0, "3k": 0, "4k": 0, "5k": 0},
                    },
                    "aim": {
                        "headshot_pct": round((hs or 0) * 100, 1) if hs is not None and hs <= 1 else hs,
                        "headshot_kills": _i(s.get("headshot_kills")),
                        "crosshair_placement": _f(s.get("crosshair_placement")),
                        "knife_inspections": _i(s.get("knife_inspections")),
                    },
                    "utility": {
                        "grenades_by_type": s.get("grenades_by_type") or {},
                        "utility_damage": _f(s.get("utility_damage")),
                        "kills_through_smokes": _i(s.get("kills_through_smokes")),
                    },
                },
                "raw_stats": s,
            }
        )

    return {
        "version": "csgrind_leetify_view_v2",
        "steam_id": steam_id,
        "display_name": display_name or None,
        "query": {
            "max_matches": max_matches,
            "scan_recent": scan_recent,
        },
        "coverage": {
            "matches_returned": n,
            "matches_scanned": matches_scanned,
            "maps_seen": maps,
            "by_source": {
                "faceit": sum(1 for m in per_match_raw if m.get("source") == "faceit"),
                "valve": sum(1 for m in per_match_raw if m.get("source") == "valve"),
            },
        },
        "rollup": {
            "kd": avg_kd,
            "rating": round(avg_rating, 4) if avg_rating is not None else None,
            "adr": round(avg_adr, 4) if avg_adr is not None else None,
            "kast": avg_kast,
            "headshot_pct": avg_hs,
            "kills": avg_kills,
            "deaths": avg_deaths,
            "impact": impact_avg,
            "time_to_damage": round(avg_ttd, 3) if avg_ttd is not None else None,
            "time_to_damage_flag": _ttd_flag(avg_ttd),
            "crosshair_placement": round(avg_xhair, 3) if avg_xhair is not None else None,
            "utility_damage": round(avg_util_dmg, 3) if avg_util_dmg is not None else None,
            "kills_through_smokes": round(avg_smoke_kills, 3) if avg_smoke_kills is not None else None,
            "opening_kills_won": round(avg_open_won, 3) if avg_open_won is not None else None,
            "opening_kills_lost": round(avg_open_lost, 3) if avg_open_lost is not None else None,
            "opening_win_pct": open_win_pct,
            "knife_inspections": round(avg_knife_inspects, 2) if avg_knife_inspects is not None else None,
            "multikills": avg_multi,
            "risk_score": risk.get("risk_score"),
            "trust_rating": risk.get("trust_rating"),
            "risk_band": risk.get("band"),
            "premier_range": risk.get("premier_range"),
            "premier_bracket_source": risk.get("premier_bracket_source"),
            "effective_premier_rating": risk.get("effective_premier_rating"),
        },
        "categories": categories,
        "matches": matches_ui,
    }
