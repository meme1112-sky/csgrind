"""Leetify-style match analytics built on Awpy demo parse + awpy.stats (HLTV-like metrics)."""

from __future__ import annotations

from typing import Any

import polars as pl
from awpy import Demo
from awpy.constants import CT_SIDE, T_SIDE
from awpy.stats import adr, kast, rating

from app.services.analytics_extra import compute_extras_for_match
from app.services.parse_demo import _json_safe


def _round_floats(obj: Any, ndigits: int = 4) -> Any:
    if isinstance(obj, float):
        return round(obj, ndigits)
    if isinstance(obj, dict):
        return {k: _round_floats(v, ndigits) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_round_floats(v, ndigits) for v in obj]
    return obj


def _kill_death_hs_frames(demo: Demo) -> tuple[pl.DataFrame, pl.DataFrame, pl.DataFrame]:
    """Per (name, steamid, side): kills, deaths, headshot kills."""
    kills = demo.kills
    if kills.height == 0:
        empty = pl.DataFrame(
            schema={
                "name": pl.String,
                "steamid": pl.String,
                "side": pl.String,
                "kills": pl.Int64,
                "deaths": pl.Int64,
                "headshot_kills": pl.Int64,
            }
        )
        return empty, empty, empty

    kt = (
        kills.group_by(["attacker_name", "attacker_steamid"])
        .agg(pl.count("attacker_name").alias("kills"))
        .with_columns(pl.lit("all").alias("side"))
        .rename({"attacker_name": "name", "attacker_steamid": "steamid"})
    )
    kct = (
        kills.filter(pl.col("attacker_side") == CT_SIDE)
        .group_by(["attacker_name", "attacker_steamid"])
        .agg(pl.count("attacker_name").alias("kills"))
        .with_columns(pl.lit("ct").alias("side"))
        .rename({"attacker_name": "name", "attacker_steamid": "steamid"})
    )
    kt_side = (
        kills.filter(pl.col("attacker_side") == T_SIDE)
        .group_by(["attacker_name", "attacker_steamid"])
        .agg(pl.count("attacker_name").alias("kills"))
        .with_columns(pl.lit("t").alias("side"))
        .rename({"attacker_name": "name", "attacker_steamid": "steamid"})
    )
    kills_all = pl.concat([kt, kct, kt_side])

    dt = (
        kills.group_by(["victim_name", "victim_steamid"])
        .agg(pl.count("victim_name").alias("deaths"))
        .with_columns(pl.lit("all").alias("side"))
        .rename({"victim_name": "name", "victim_steamid": "steamid"})
    )
    dct = (
        kills.filter(pl.col("victim_side") == CT_SIDE)
        .group_by(["victim_name", "victim_steamid"])
        .agg(pl.count("victim_name").alias("deaths"))
        .with_columns(pl.lit("ct").alias("side"))
        .rename({"victim_name": "name", "victim_steamid": "steamid"})
    )
    dt_side = (
        kills.filter(pl.col("victim_side") == T_SIDE)
        .group_by(["victim_name", "victim_steamid"])
        .agg(pl.count("victim_name").alias("deaths"))
        .with_columns(pl.lit("t").alias("side"))
        .rename({"victim_name": "name", "victim_steamid": "steamid"})
    )
    deaths_all = pl.concat([dt, dct, dt_side])

    hs = kills.filter(pl.col("hitgroup") == "head")
    if hs.height == 0:
        hs_all = pl.DataFrame(
            schema={"name": pl.String, "steamid": pl.String, "side": pl.String, "headshot_kills": pl.Int64}
        )
    else:
        ht = (
            hs.group_by(["attacker_name", "attacker_steamid"])
            .agg(pl.count("attacker_name").alias("headshot_kills"))
            .with_columns(pl.lit("all").alias("side"))
            .rename({"attacker_name": "name", "attacker_steamid": "steamid"})
        )
        hct = (
            hs.filter(pl.col("attacker_side") == CT_SIDE)
            .group_by(["attacker_name", "attacker_steamid"])
            .agg(pl.count("attacker_name").alias("headshot_kills"))
            .with_columns(pl.lit("ct").alias("side"))
            .rename({"attacker_name": "name", "attacker_steamid": "steamid"})
        )
        ht_side = (
            hs.filter(pl.col("attacker_side") == T_SIDE)
            .group_by(["attacker_name", "attacker_steamid"])
            .agg(pl.count("attacker_name").alias("headshot_kills"))
            .with_columns(pl.lit("t").alias("side"))
            .rename({"attacker_name": "name", "attacker_steamid": "steamid"})
        )
        hs_all = pl.concat([ht, hct, ht_side])

    return kills_all, deaths_all, hs_all


# Map awpy/source projectile class names to friendly throw-type labels.
# Only `*Projectile` entries are actual throws — the bare `C{Type}` entries are the
# held inventory weapon entity (one row per tick the player has it equipped).
_PROJECTILE_TYPE_LABELS: dict[str, str] = {
    "CFlashbangProjectile": "flashbang",
    "CSmokeGrenadeProjectile": "smoke",
    "CHEGrenadeProjectile": "he_grenade",
    "CMolotovProjectile": "molotov",
    "CIncendiaryGrenadeProjectile": "incendiary",
    "CDecoyProjectile": "decoy",
}


def _normalize_projectile_type(raw: str | None) -> str | None:
    """Return a friendly grenade label for a projectile class, or None for non-throw entities."""
    if not raw:
        return None
    s = str(raw)
    if s in _PROJECTILE_TYPE_LABELS:
        return _PROJECTILE_TYPE_LABELS[s]
    if s.endswith("Projectile") and s.startswith("C"):
        core = s[1:-len("Projectile")]
        return core.lower() if core else None
    return None


def _grenade_counts_by_player(demo: Demo) -> pl.DataFrame | None:
    """Per (thrower, grenade_type) count of UNIQUE projectile entities (i.e. throws)."""
    g = demo.grenades
    if g is None or g.height == 0:
        return None
    cols = set(g.columns)
    if "thrower_steamid" not in cols or "grenade_type" not in cols:
        return None
    # Keep only rows whose class name maps to a real projectile (skip held-weapon class entries).
    is_projectile = pl.col("grenade_type").map_elements(
        lambda v: _normalize_projectile_type(v) is not None,
        return_dtype=pl.Boolean,
    )
    g = g.filter(is_projectile)
    if g.height == 0:
        return None
    if "entity_id" in cols:
        per_throw = g.select(["thrower", "thrower_steamid", "grenade_type", "entity_id"]).unique()
    else:
        per_throw = g.select(["thrower", "thrower_steamid", "grenade_type", "tick"]).unique()
    return (
        per_throw.group_by(["thrower", "thrower_steamid", "grenade_type"])
        .agg(pl.len().alias("n"))
        .rename({"thrower": "name", "thrower_steamid": "steamid"})
    )


def compute_match_analytics(demo: Demo) -> dict[str, Any]:
    """
    Aggregate combat stats similar in spirit to Leetify / HLTV:
    rating, impact, ADR, KAST, kills/deaths, HS%, grenade usage.
    """
    header = demo.header if isinstance(demo.header, dict) else {}
    map_name = header.get("map_name")

    rate = rating(demo)
    adr_df = adr(demo).select(["name", "steamid", "side", "dmg", "adr"])
    kast_df = kast(demo).select(["name", "steamid", "side", "kast_rounds", "kast"])

    merged = (
        rate.join(adr_df, on=["name", "steamid", "side"], how="left")
        .join(kast_df, on=["name", "steamid", "side"], how="left")
        .fill_null(0)
    )

    kf, df, hsf = _kill_death_hs_frames(demo)
    if kf.height:
        merged = merged.join(kf, on=["name", "steamid", "side"], how="left")
    if "kills" not in merged.columns:
        merged = merged.with_columns(pl.lit(0).cast(pl.Int64).alias("kills"))
    else:
        merged = merged.with_columns(pl.col("kills").fill_null(0).cast(pl.Int64))

    if df.height:
        merged = merged.join(df, on=["name", "steamid", "side"], how="left")
    if "deaths" not in merged.columns:
        merged = merged.with_columns(pl.lit(0).cast(pl.Int64).alias("deaths"))
    else:
        merged = merged.with_columns(pl.col("deaths").fill_null(0).cast(pl.Int64))

    if hsf.height:
        merged = merged.join(hsf, on=["name", "steamid", "side"], how="left")
    if "headshot_kills" not in merged.columns:
        merged = merged.with_columns(pl.lit(0).cast(pl.Int64).alias("headshot_kills"))
    else:
        merged = merged.with_columns(pl.col("headshot_kills").fill_null(0).cast(pl.Int64))

    merged = merged.with_columns(
        pl.when(pl.col("kills") > 0)
        .then(pl.col("headshot_kills") / pl.col("kills"))
        .otherwise(0.0)
        .alias("headshot_pct")
    )

    grenades_long = _grenade_counts_by_player(demo)
    grenade_map: dict[str, dict[str, int]] = {}
    if grenades_long is not None and grenades_long.height:
        for gr in grenades_long.to_dicts():
            sid = str(gr.get("steamid") or "")
            label = _normalize_projectile_type(gr.get("grenade_type"))
            if not label:
                continue
            n = int(gr.get("n") or 0)
            bucket = grenade_map.setdefault(sid, {})
            bucket[label] = bucket.get(label, 0) + n

    try:
        extras_by_sid = compute_extras_for_match(demo)
    except Exception:
        # Extras are best-effort; never block the base analytics on a regression here.
        extras_by_sid = {}

    players: list[dict[str, Any]] = []
    for row in merged.to_dicts():
        sid = str(row.get("steamid", "") or "")
        grenades_by_type: dict[str, int] = dict(grenade_map.get(sid, {}))
        extras = extras_by_sid.get(sid, {}) if sid else {}
        players.append(
            {
                "name": row.get("name"),
                "steamid": sid,
                "side": row.get("side"),
                "n_rounds": int(row.get("n_rounds") or 0),
                "kills": int(row.get("kills") or 0),
                "deaths": int(row.get("deaths") or 0),
                "headshot_kills": int(row.get("headshot_kills") or 0),
                "headshot_pct": float(row.get("headshot_pct") or 0.0),
                "kast": float(row.get("kast") or 0.0),
                "kast_rounds": int(row.get("kast_rounds") or 0),
                "dmg": float(row.get("dmg") or 0.0),
                "adr": float(row.get("adr") or 0.0),
                "impact": float(row.get("impact") or 0.0),
                "rating": float(row.get("rating") or 0.0),
                "grenades_by_type": grenades_by_type,
                "time_to_damage": extras.get("time_to_damage"),
                "preaim": extras.get("preaim"),
                "crosshair_placement": extras.get("crosshair_placement"),
                "kills_through_smokes": int(extras.get("kills_through_smokes") or 0),
                "utility_damage": float(extras.get("utility_damage") or 0.0),
                "opening_kills_won": int(extras.get("opening_kills_won") or 0),
                "opening_kills_lost": int(extras.get("opening_kills_lost") or 0),
                "multikills": extras.get("multikills") or {"2k": 0, "3k": 0, "4k": 0, "5k": 0},
                "knife_inspections": int(extras.get("knife_inspections") or 0),
            }
        )

    out: dict[str, Any] = {
        "map_name": map_name,
        "tickrate": getattr(demo, "tickrate", None),
        "kind": "csgrind_match_analytics_v8",
        "source": "awpy.stats (HLTV-style) + kills/HS/grenades + extras (TTD/aim/smoke/util/opens/multis/knife inspects)",
        "players": _json_safe(_round_floats(players)),
    }
    return out


def analytics_from_dem_path(path: str | Any) -> dict[str, Any]:
    """Parse a .dem file and return analytics (heavy; use sparingly)."""
    from pathlib import Path

    p = Path(path)
    dem = Demo(str(p), verbose=False)
    dem.parse()
    return compute_match_analytics(dem)
