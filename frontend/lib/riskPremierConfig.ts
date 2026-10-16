import premier1000 from "@/data/risk/premier_1000_4999.json";
import premier5000 from "@/data/risk/premier_5000_9999.json";
import premier10000 from "@/data/risk/premier_10000_14999.json";
import premier15000 from "@/data/risk/premier_15000_19999.json";
import premier20000 from "@/data/risk/premier_20000_24999.json";
import premier25000 from "@/data/risk/premier_25000_plus.json";

export type PremierRiskConfigJson = typeof premier1000;

const BY_RANGE: Record<string, PremierRiskConfigJson> = {
  [premier1000.range]: premier1000,
  [premier5000.range]: premier5000,
  [premier10000.range]: premier10000,
  [premier15000.range]: premier15000,
  [premier20000.range]: premier20000,
  [premier25000.range]: premier25000,
};

/** Matches backend default when no premier_rating query param is sent. */
const FALLBACK_RANGE = premier10000.range;

function mid(lo: number, hi: number): number {
  return (lo + hi) / 2;
}

/** Same bracket resolution as `extra-backend` `_risk_cfg_for_premier_rating`. */
export function riskConfigForPremierRating(rating: number | null | undefined): PremierRiskConfigJson {
  const pr = rating == null || !Number.isFinite(rating) ? 12_000 : rating;
  if (pr >= 25_000) return premier25000;
  if (pr >= 20_000) return premier20000;
  if (pr >= 15_000) return premier15000;
  if (pr >= 10_000) return premier10000;
  if (pr >= 5_000) return premier5000;
  return premier1000;
}

export function riskConfigForPremierRange(range: string | null | undefined): PremierRiskConfigJson {
  if (range && BY_RANGE[range]) return BY_RANGE[range];
  return BY_RANGE[FALLBACK_RANGE] ?? premier10000;
}

/** Map risk JSON "aim" score (0–100) onto the same HLTV-style scale as rollup.rating in the UI. */
export function aimScoreToHltvRating(aimPct: number): number {
  if (!Number.isFinite(aimPct)) return 0.85;
  const t = Math.min(1, Math.max(0, aimPct / 100));
  return 0.55 + t * 0.9;
}

export type BarBenchmarks = {
  kd: number;
  timeToDamageMs: number;
  crosshairDeg: number;
  hltvRating: number;
  openingWinPct: number;
  headshotPct: number;
};

/**
 * Midpoint of each metric's [normal_lo, normal_hi] band from the Premier risk JSON —
 * typical expectation for that bracket (matches `/data/risk/premier_*.json`).
 */
export function barBenchmarksFromRiskConfig(cfg: PremierRiskConfigJson): BarBenchmarks {
  const m = cfg.metrics;
  const kdSpec = m.kd;
  const ttdSpec = m.ttd;
  const preSpec = m.preaim;
  const aimSpec = m.aim;
  const wrSpec = m.wr;
  const hsSpec = m.accHead;

  const kd =
    kdSpec && typeof kdSpec.normal_lo === "number" && typeof kdSpec.normal_hi === "number"
      ? mid(kdSpec.normal_lo, kdSpec.normal_hi)
      : 1.65;
  const timeToDamageMs =
    ttdSpec && typeof ttdSpec.normal_lo === "number" && typeof ttdSpec.normal_hi === "number"
      ? mid(ttdSpec.normal_lo, ttdSpec.normal_hi)
      : 520;
  const crosshairDeg =
    preSpec && typeof preSpec.normal_lo === "number" && typeof preSpec.normal_hi === "number"
      ? mid(preSpec.normal_lo, preSpec.normal_hi)
      : 7.5;
  const hltvRating =
    aimSpec && typeof aimSpec.normal_lo === "number" && typeof aimSpec.normal_hi === "number"
      ? aimScoreToHltvRating(mid(aimSpec.normal_lo, aimSpec.normal_hi))
      : 0.85;
  const openingWinPct =
    wrSpec && typeof wrSpec.normal_lo === "number" && typeof wrSpec.normal_hi === "number"
      ? mid(wrSpec.normal_lo, wrSpec.normal_hi) * 100
      : 50;
  let headshotPct = 40;
  if (hsSpec && typeof hsSpec.normal_lo === "number" && typeof hsSpec.normal_hi === "number") {
    const lo = hsSpec.normal_lo;
    const hi = hsSpec.normal_hi;
    const c = mid(lo, hi);
    headshotPct = lo <= 1 && hi <= 1 ? c * 100 : c;
  }

  return {
    kd,
    timeToDamageMs,
    crosshairDeg,
    hltvRating,
    openingWinPct,
    headshotPct,
  };
}
