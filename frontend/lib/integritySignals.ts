/**
 * Per-metric integrity status for the Trust / Integrity UI.
 * Mirrors extra-backend `compute_risk_scores` + premier risk JSON bands.
 *
 * TTD / pre-aim / knife use demo-parsed rollup values when present.
 */

import { normalizeHeadshotPct, type AnalyticsBySteamRollup } from "@/lib/analyticsBySteam";
import { resolveEffectiveRiskBracket } from "@/lib/riskBracketResolve";
import {
  riskConfigForPremierRange,
  riskConfigForPremierRating,
  type PremierRiskConfigJson,
} from "@/lib/riskPremierConfig";

export type IntegrityStatus = "normal" | "elite" | "caution" | "suspicious" | "unavailable";

export type IntegritySignal = {
  id: string;
  label: string;
  value: string;
  status: IntegrityStatus;
  detail: string;
};

/** Trust verdict needs enough demos before we treat it as high-confidence. */
export const INTEGRITY_MIN_MATCHES = 10;

/**
 * Always shown in the Neok AI featured "Integrity signals" list when data exists.
 * Order is display priority (TTD → Crosshair placement → K/D → smoke kills).
 */
export const FEATURED_INTEGRITY_ORDER = ["ttd", "preaim", "kd", "smokeKills"] as const;

export const ALWAYS_FEATURED_INTEGRITY_IDS = new Set<string>(FEATURED_INTEGRITY_ORDER);

/** Keep in "remaining" even when caution/suspicious (not elevated to primary list). */
export const DEMOTE_FROM_FEATURED_INTEGRITY_IDS = new Set(["accHead"]);

function specNum(spec: Record<string, unknown> | undefined, key: string): number | null {
  const v = spec?.[key];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function formatTtd(ms: number | null | undefined): string {
  return ms != null && Number.isFinite(ms) ? `${Math.round(ms)} ms` : "—";
}

function formatPreaim(deg: number | null | undefined): string {
  return deg != null && Number.isFinite(deg) ? `${deg.toFixed(2)}°` : "—";
}

function formatPct(pct: number | null | undefined): string {
  return pct != null && Number.isFinite(pct) ? `${pct.toFixed(1)}%` : "—";
}

function inBand(value: number, lo: number, hi: number): boolean {
  return value >= lo && value <= hi;
}

/**
 * Higher-is-riskier metrics (KD, opening WR, head %).
 * Values inside [lo, hi] are Normal for integrity display.
 * Above hi → Caution / Suspicious. Below lo → Normal (weak, not a cheat signal).
 */
function statusHigherIsRiskier(
  value: number,
  lo: number,
  hi: number,
  bandLabel: string
): { status: IntegrityStatus; detail: string } {
  if (inBand(value, lo, hi)) {
    return {
      status: "normal",
      detail: `Within bracket band (${bandLabel})`,
    };
  }
  if (value > hi) {
    const overshoot = (value - hi) / Math.max(hi - lo, 1e-6);
    const status: IntegrityStatus = overshoot >= 0.5 ? "suspicious" : "caution";
    return {
      status,
      detail: `Above typical bracket band (${bandLabel})`,
    };
  }
  return {
    status: "normal",
    detail: `Below typical bracket band (${bandLabel}) — not a cheat signal`,
  };
}

/** TTD: lower ms is riskier (invert). Below floor → caution until bands are recalibrated. */
function statusTtd(
  valueMs: number,
  lo: number,
  hi: number,
  suspiciousIfLt: number | null,
  rangeLabel: string
): { status: IntegrityStatus; detail: string } {
  const bandLabel = `${lo}–${hi} ms`;
  if (suspiciousIfLt != null && valueMs < suspiciousIfLt) {
    return {
      status: "caution",
      detail: `Faster than Premier ${rangeLabel} floor (${suspiciousIfLt} ms) — weighted signal, not an instant fail`,
    };
  }
  if (inBand(valueMs, lo, hi)) {
    return {
      status: "normal",
      detail: `Within Premier ${rangeLabel} typical band (${bandLabel})`,
    };
  }
  if (valueMs < lo) {
    return {
      status: "caution",
      detail: `Faster than typical Premier ${rangeLabel} band (${bandLabel})`,
    };
  }
  return {
    status: "normal",
    detail: `Slower than typical Premier ${rangeLabel} band (${bandLabel})`,
  };
}

/**
 * Crosshair placement (Leetify): lower degrees of eye-angle travel until first
 * hit can be elite; only implausibly low → suspicious.
 */
function statusPreaim(
  valueDeg: number,
  lo: number,
  hi: number,
  suspiciousIfLt: number | null,
  rangeLabel: string
): { status: IntegrityStatus; detail: string } {
  const bandLabel = `${lo}–${hi}°`;
  if (suspiciousIfLt != null && valueDeg < suspiciousIfLt) {
    return {
      status: "suspicious",
      detail: `Implausibly tight placement (<${suspiciousIfLt}°) for Premier ${rangeLabel}`,
    };
  }
  if (valueDeg < lo) {
    return {
      status: "elite",
      detail: `Tighter than typical Premier ${rangeLabel} band (${bandLabel}) — elite, not a cheat signal`,
    };
  }
  if (inBand(valueDeg, lo, hi)) {
    return {
      status: "normal",
      detail: `Within Premier ${rangeLabel} typical (${bandLabel})`,
    };
  }
  return {
    status: "normal",
    detail: `Looser than typical Premier ${rangeLabel} band (${bandLabel})`,
  };
}

function statusKnife(perMatch: number): { status: IntegrityStatus; detail: string } {
  if (perMatch > 25) {
    return { status: "suspicious", detail: "Unusual knife inspection rate (25+ /match)" };
  }
  if (perMatch > 8) {
    return { status: "caution", detail: "Above typical knife inspection rate (0–8 /match)" };
  }
  return { status: "normal", detail: "Typical knife inspection rate (0–8 /match)" };
}

/** Resolve risk JSON: Premier → FACEIT Elo map → rollup range → mid default. */
function resolveRiskConfig(
  premierRange: string | null | undefined,
  premierRating?: number | null,
  faceitElo?: number | null
): PremierRiskConfigJson {
  const effective = resolveEffectiveRiskBracket(premierRating, faceitElo);
  if (effective.source === "premier" || effective.source === "faceit") {
    return riskConfigForPremierRating(effective.rating);
  }
  if (premierRange) {
    return riskConfigForPremierRange(premierRange);
  }
  return riskConfigForPremierRating(effective.rating);
}

/** Build integrity signal rows from rollup + Premier / FACEIT risk config. */
export function computeIntegritySignals(
  rollup: AnalyticsBySteamRollup | null | undefined,
  premierRange: string | null | undefined,
  premierRating?: number | null,
  _steamId?: string | null,
  _demoSampleKey?: string | null,
  matchCount?: number | null,
  faceitElo?: number | null
): IntegritySignal[] {
  if (!rollup) return [];

  const cfg = resolveRiskConfig(premierRange, premierRating, faceitElo);
  const m = cfg.metrics;
  const rangeLabel = cfg.range;
  const nMatches =
    matchCount != null && Number.isFinite(matchCount) ? Math.max(0, Math.floor(matchCount)) : null;

  const ttd = rollup.time_to_damage;
  const preaim = rollup.crosshair_placement;
  const knife = rollup.knife_inspections;
  const kd = rollup.kd;
  const wr = rollup.opening_win_pct;
  const hs = normalizeHeadshotPct(rollup.headshot_pct);
  const smokeKills = rollup.kills_through_smokes;

  const signals: IntegritySignal[] = [];

  const ttdSpec = m.ttd as Record<string, unknown> | undefined;
  const ttdLo = specNum(ttdSpec, "normal_lo");
  const ttdHi = specNum(ttdSpec, "normal_hi");
  const ttdSusp = specNum(ttdSpec, "suspicious_if_lt");
  if (ttd != null && Number.isFinite(ttd) && ttdLo != null && ttdHi != null) {
    const { status, detail } = statusTtd(ttd, ttdLo, ttdHi, ttdSusp, rangeLabel);
    signals.push({
      id: "ttd",
      label: "Time to damage",
      value: formatTtd(ttd),
      status,
      detail,
    });
  }

  const preSpec = m.preaim as Record<string, unknown> | undefined;
  const preLo = specNum(preSpec, "normal_lo");
  const preHi = specNum(preSpec, "normal_hi");
  const preSusp = specNum(preSpec, "suspicious_if_lt");
  if (preaim != null && Number.isFinite(preaim) && preLo != null && preHi != null) {
    const { status, detail } = statusPreaim(preaim, preLo, preHi, preSusp, rangeLabel);
    signals.push({
      id: "preaim",
      label: "Crosshair placement",
      value: formatPreaim(preaim),
      status,
      detail,
    });
  }

  const kdSpec = m.kd as Record<string, unknown> | undefined;
  const kdLo = specNum(kdSpec, "normal_lo");
  const kdHi = specNum(kdSpec, "normal_hi");
  if (kd != null && Number.isFinite(kd) && kdLo != null && kdHi != null) {
    const { status, detail } = statusHigherIsRiskier(kd, kdLo, kdHi, `${kdLo}–${kdHi}`);
    signals.push({
      id: "kd",
      label: "K/D ratio",
      value: kd.toFixed(2),
      status,
      detail,
    });
  }

  const wrSpec = m.wr as Record<string, unknown> | undefined;
  const wrLo = specNum(wrSpec, "normal_lo");
  const wrHi = specNum(wrSpec, "normal_hi");
  if (wr != null && Number.isFinite(wr) && wrLo != null && wrHi != null) {
    const wrFrac = wr / 100;
    const bandLabel = `${(wrLo * 100).toFixed(0)}–${(wrHi * 100).toFixed(0)}%`;
    // Tiny demo samples make 100% open WR look "suspicious" by chance.
    if (nMatches != null && nMatches > 0 && nMatches < INTEGRITY_MIN_MATCHES) {
      signals.push({
        id: "wr",
        label: "Opening win rate",
        value: formatPct(wr),
        status: "normal",
        detail: `Provisional under ${INTEGRITY_MIN_MATCHES} demos — not used as a cheat signal yet`,
      });
    } else {
      const { status, detail } = statusHigherIsRiskier(wrFrac, wrLo, wrHi, bandLabel);
      signals.push({
        id: "wr",
        label: "Opening win rate",
        value: formatPct(wr),
        status,
        detail,
      });
    }
  }

  const hsSpec = m.accHead as Record<string, unknown> | undefined;
  const hsLo = specNum(hsSpec, "normal_lo");
  const hsHi = specNum(hsSpec, "normal_hi");
  if (hs != null && Number.isFinite(hs) && hsLo != null && hsHi != null) {
    const hsFrac = hsLo <= 1 ? hs / 100 : hs;
    const lo = hsLo <= 1 ? hsLo : hsLo / 100;
    const hi = hsHi <= 1 ? hsHi : hsHi / 100;
    const bandLabel = `${(lo * 100).toFixed(0)}–${(hi * 100).toFixed(0)}%`;
    const { status, detail } = statusHigherIsRiskier(hsFrac, lo, hi, bandLabel);
    signals.push({
      id: "accHead",
      label: "Head accuracy",
      value: formatPct(hs),
      status,
      detail,
    });
  }

  const smokeSpec = m.smokeKills as Record<string, unknown> | undefined;
  const smokeLo = specNum(smokeSpec, "normal_lo");
  const smokeHi = specNum(smokeSpec, "normal_hi");
  if (smokeKills != null && Number.isFinite(smokeKills) && smokeLo != null && smokeHi != null) {
    const bandLabel = `${smokeLo}–${smokeHi} /match`;
    const { status, detail } = statusHigherIsRiskier(smokeKills, smokeLo, smokeHi, bandLabel);
    signals.push({
      id: "smokeKills",
      label: "Kills through smokes",
      value: `${smokeKills.toFixed(2)} /match`,
      status,
      detail: `Demo-derived avg per match where line of sight crosses an active smoke. ${detail}`,
    });
  }

  if (knife != null && Number.isFinite(knife)) {
    const { status, detail } = statusKnife(knife);
    signals.push({
      id: "knife",
      label: "Knife inspections",
      value: `${knife.toFixed(1)} /match`,
      status,
      detail,
    });
  }

  return signals;
}

export function integrityStatusLabel(status: IntegrityStatus): string {
  switch (status) {
    case "normal":
      return "Normal";
    case "elite":
      return "Elite";
    case "caution":
      return "Caution";
    case "suspicious":
      return "Suspicious";
    default:
      return "—";
  }
}

export function integrityStatusClass(status: IntegrityStatus): string {
  switch (status) {
    case "normal":
      return "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400";
    case "elite":
      return "bg-sky-500/15 text-sky-600 dark:text-sky-400";
    case "caution":
      return "bg-amber-500/15 text-amber-600 dark:text-amber-400";
    case "suspicious":
      return "bg-rose-500/15 text-rose-600 dark:text-rose-400";
    default:
      return "bg-muted text-muted-foreground";
  }
}

export function chipThresholds(cfg: PremierRiskConfigJson): { normalMax: number; cautionMax: number } {
  const t = cfg.chip_thresholds;
  return {
    normalMax: typeof t.normal_max === "number" ? t.normal_max : 30,
    cautionMax: typeof t.caution_max === "number" ? t.caution_max : 75,
  };
}
