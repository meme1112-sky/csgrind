import { riskConfigForPremierRating } from "@/lib/riskPremierConfig";

export type LeetifySkillKey = "aim" | "utility" | "positioning" | "clutch" | "opening";

type SkillBenchmark = {
  kind: "percent" | "signed";
  /** One value per Premier bracket: 1k–5k, 5k–10k, 10k–15k, 15k–20k, 20k–25k, 25k+. */
  values: number[];
};

/**
 * Approximate Leetify bracket benchmarks (API does not expose these).
 * Signed values are API-raw (display = raw * 100), matching Leetify profile UI.
 */
const SKILL_BENCHMARKS: Record<LeetifySkillKey, SkillBenchmark> = {
  aim: { kind: "percent", values: [68, 74, 78, 80, 81, 82] },
  utility: { kind: "percent", values: [48, 54, 58, 60, 61, 62] },
  positioning: { kind: "percent", values: [45, 48, 50, 52, 55, 57] },
  clutch: { kind: "signed", values: [0.03, 0.04, 0.045, 0.05, 0.08, 0.1093] },
  /** Faceit-10-ish ≈ +0.16; Premier 25k+ ≈ +0.77 (from Leetify UI). */
  opening: { kind: "signed", values: [0.0016, 0.003, 0.0045, 0.0055, 0.0065, 0.0077] },
};

const PREMIER_TIER_INDEX: Record<string, number> = {
  "1000-4999": 0,
  "5000-9999": 1,
  "10000-14999": 2,
  "15000-19999": 3,
  "20000-24999": 4,
  "25000+": 5,
};

/** Same cutoff as `premierBadgeFromRating` — missing / below Premier = unranked. */
export function isUnrankedPremier(premier: number | null | undefined): boolean {
  return premier == null || !Number.isFinite(premier) || premier < 1000;
}

function clampPct(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

/**
 * Signed skills (opening / clutching) are centered at 0 on Leetify:
 * the track midpoint is 0, then the bar still fills left→right up to that mapped point.
 * Opening ±3.00 (API ±0.03) and clutch ±25.00 (API ±0.25) reach the ends.
 * +1.20 → ~70%, +0.16 marker → ~53%, +11.11 → ~72% — matching Leetify screenshots.
 */
const SIGNED_BAR_MAX: Record<"opening" | "clutch", number> = {
  opening: 0.03,
  clutch: 0.25,
};

const SIGNED_CENTER = 50;

function fillPctForSkill(skill: LeetifySkillKey, value: number | null | undefined): number {
  if (value == null || !Number.isFinite(value)) return 0;
  const kind = SKILL_BENCHMARKS[skill].kind;
  if (kind === "signed") {
    const max = SIGNED_BAR_MAX[skill as "opening" | "clutch"];
    return clampPct(SIGNED_CENTER + (value / max) * SIGNED_CENTER);
  }
  return clampPct(value);
}

function indicatorPctForSkill(skill: LeetifySkillKey, benchmark: number): number {
  return fillPctForSkill(skill, benchmark);
}

export function formatSignedRating(value: number | null | undefined, decimals = 2): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const scaled = value * 100;
  const sign = scaled >= 0 ? "+" : "";
  return `${sign}${scaled.toFixed(decimals)}`;
}

/**
 * Overall Leetify rating tile (already on display scale, e.g. 2.91).
 * Positive → "+2.91"; negative keeps the leading minus from toFixed.
 */
export function formatSignedLeetifyRank(
  value: number | null | undefined,
  decimals = 2
): string {
  if (value == null || !Number.isFinite(value)) return "—";
  if (value > 0) return `+${value.toFixed(decimals)}`;
  return value.toFixed(decimals);
}

export function leetifyRankToneClass(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "text-muted-foreground";
  if (value > 0) return "text-emerald-400";
  if (value < 0) return "text-rose-400";
  return "text-foreground";
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function tierIndexForPremier(premier: number | null | undefined): number | null {
  if (isUnrankedPremier(premier)) return null;
  const cfg = riskConfigForPremierRating(premier);
  return PREMIER_TIER_INDEX[cfg.range] ?? 2;
}

export function premierBracketLabel(premier: number | null | undefined): string {
  if (isUnrankedPremier(premier)) return "Unranked";
  const pr = premier as number;
  if (pr >= 25_000) return "25k+";
  if (pr >= 20_000) return "20k";
  if (pr >= 15_000) return "15k";
  if (pr >= 10_000) return "10k";
  if (pr >= 5_000) return "5k";
  return "1k";
}

export type PremierBracketPalette = {
  /** Solid fill used by skill rating bars. */
  accent: string;
  /** Dark badge background. */
  bg: string;
  /** Badge border + chevron SVG. */
  border: string;
  /** Rating text. */
  text: string;
};

/** CS2 Premier–style palette for each skill-rating tier. */
export function premierBracketPalette(label: string): PremierBracketPalette {
  switch (label) {
    case "1k":
      return { accent: "#8B9BB4", bg: "#1A1F28", border: "#8B9BB4", text: "#D0D8E8" };
    case "5k":
      return { accent: "#5E98D9", bg: "#0C1A2A", border: "#5E98D9", text: "#B8D8FF" };
    case "10k":
      return { accent: "#4B69FF", bg: "#0A1228", border: "#4B69FF", text: "#B0C0FF" };
    case "15k":
      return { accent: "#8847FF", bg: "#160A2A", border: "#8847FF", text: "#D0B8FF" };
    case "20k":
      return { accent: "#D32CE6", bg: "#1E0628", border: "#C400E0", text: "#F0A0FF" };
    case "25k+":
      return { accent: "#EB4B4B", bg: "#240A0A", border: "#EB4B4B", text: "#FFB4B4" };
    default:
      return { accent: "#6B7280", bg: "#1F2329", border: "#6B7280", text: "#C4C4C4" };
  }
}

/** Main tier accent — used for skill rating bar fills. */
export function premierBracketColor(label: string): string {
  return premierBracketPalette(label).accent;
}

function benchmarkRaw(skill: LeetifySkillKey, premier: number | null | undefined): number {
  const idx = tierIndexForPremier(premier);
  const values = SKILL_BENCHMARKS[skill].values;
  // Unranked: compare against global average across Premier brackets.
  if (idx == null) return mean(values);
  return values[idx] ?? values[2];
}

export function formatSkillValue(skill: LeetifySkillKey, value: number): string {
  const kind = SKILL_BENCHMARKS[skill].kind;
  if (kind === "signed") return formatSignedRating(value);
  return String(Math.round(value));
}

export type LeetifyRatingBarData = {
  label: string;
  display: string;
  fillPct: number;
  indicatorPct: number;
  comparison: string;
  /** Player vs bracket benchmark (for the trend arrow). */
  trend: "up" | "down" | "even";
};

export function buildRatingBarsFromApi(
  rating:
    | {
        aim?: number | null;
        utility?: number | null;
        positioning?: number | null;
        clutch?: number | null;
        opening?: number | null;
      }
    | null
    | undefined,
  premier: number | null | undefined
): LeetifyRatingBarData[] {
  const r = rating ?? {};
  const rows: Array<{ label: string; skill: LeetifySkillKey; value: number | null }> = [
    { label: "Aim", skill: "aim", value: r.aim ?? null },
    { label: "Utility", skill: "utility", value: r.utility ?? null },
    { label: "Positioning", skill: "positioning", value: r.positioning ?? null },
    { label: "Opening duels", skill: "opening", value: r.opening ?? null },
    { label: "Clutching", skill: "clutch", value: r.clutch ?? null },
  ];

  return rows.map(({ label, skill, value }) => {
    const benchmark = benchmarkRaw(skill, premier);
    const trend: LeetifyRatingBarData["trend"] =
      value == null || !Number.isFinite(value)
        ? "even"
        : value > benchmark + 1e-6
          ? "up"
          : value < benchmark - 1e-6
            ? "down"
            : "even";
    return {
      label,
      display: value != null ? formatSkillValue(skill, value) : "—",
      fillPct: fillPctForSkill(skill, value),
      indicatorPct: indicatorPctForSkill(skill, benchmark),
      comparison: formatSkillValue(skill, benchmark),
      trend,
    };
  });
}
