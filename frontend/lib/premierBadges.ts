/** CS2 Premier-style bracket images (public/images/premier). Lowest → highest skill band. */

export const PREMIER_BADGE_PATHS = [
  "/images/premier/1-4k.png",
  "/images/premier/5-9k.png",
  "/images/premier/10-14k.png",
  "/images/premier/15-19k.png",
  "/images/premier/20-24k.png",
  "/images/premier/25-29k.png",
  "/images/premier/30-40k.png",
] as const;

export function clampPremierIndex(i: number): number {
  return Math.max(0, Math.min(PREMIER_BADGE_PATHS.length - 1, Math.round(i)));
}

export function premierBadgePath(index: number): string {
  return PREMIER_BADGE_PATHS[clampPremierIndex(index)];                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           
}

/**
 * Maps a raw Premier rating (e.g. 14250) to the matching bracket badge.
 * Returns null when the rating is missing or below the lowest bracket (< 1000).
 */
export function premierBadgeFromRating(rating: number | null | undefined): string | null {
  if (rating == null || !Number.isFinite(rating) || rating < 1000) return null;
  if (rating < 5000) return PREMIER_BADGE_PATHS[0];
  if (rating < 10000) return PREMIER_BADGE_PATHS[1];
  if (rating < 15000) return PREMIER_BADGE_PATHS[2];
  if (rating < 20000) return PREMIER_BADGE_PATHS[3];
  if (rating < 25000) return PREMIER_BADGE_PATHS[4];
  if (rating < 30000) return PREMIER_BADGE_PATHS[5];
  return PREMIER_BADGE_PATHS[6];
}

/** Formats a Premier rating with thousands grouping (e.g. 14250 -> "14,250"). */
export function formatPremierRating(rating: number | null | undefined): string {
  if (rating == null || !Number.isFinite(rating)) return "—";
  return Math.round(rating).toLocaleString("en-US");
}

/** Maps a FACEIT elo value to a level (1-10), or 0 when below the cutoff. */
export function faceitLevelFromElo(elo: number | null | undefined): number {
  if (elo == null || !Number.isFinite(elo)) return 0;
  const e = Math.floor(elo);
  if (e >= 2001) return 10;
  if (e >= 1751) return 9;
  if (e >= 1531) return 8;
  if (e >= 1351) return 7;
  if (e >= 1201) return 6;
  if (e >= 1051) return 5;
  if (e >= 901) return 4;
  if (e >= 751) return 3;
  if (e >= 501) return 2;
  if (e >= 100) return 1;
  return 0;
}

/** Returns the FACEIT level icon path for levels 1-10, or null otherwise. */
export function faceitLevelBadgePath(level: number | null | undefined): string | null {
  if (level == null || !Number.isInteger(level)) return null;
  if (level < 1 || level > 10) return null;
  return `/images/faceit/level${level}.jpeg`;
}

/** Official FACEIT level accent color (levels 1–10). */
export function faceitLevelColor(level: number | null | undefined): string {
  if (level == null || level < 1) return "#888888";
  if (level === 1) return "#dddddd";
  if (level <= 3) return "#47e36e";
  if (level <= 7) return "#ffcd25";
  if (level <= 9) return "#ff6c20";
  return "#e80128";
}

/** Maps backend category `tier` (see analytics_display.py) to a premier bracket index. */
export function premierIndexFromSemanticTier(tier: string | null | undefined): number | null {
  if (!tier) return null;
  const t = tier.toLowerCase();
  if (t === "below_average" || t === "poor") return 1;
  if (t === "average") return 3;
  if (t === "strong") return 5;
  if (t === "exceptional") return 6;
  return null;
}

export function premierIndexFromKd(kd: number | null | undefined): number {
  if (kd == null || !Number.isFinite(kd)) return 3;
  if (kd < 0.72) return 0;
  if (kd < 0.82) return 1;
  if (kd < 0.92) return 2;
  if (kd < 1.02) return 3;
  if (kd < 1.12) return 4;
  if (kd < 1.28) return 5;
  return 6;
}

/** Opening duel win share 0–100. */
export function premierIndexFromOpeningWinPct(pct: number | null | undefined): number {
  if (pct == null || !Number.isFinite(pct)) return 3;
  if (pct < 38) return 0;
  if (pct < 44) return 1;
  if (pct < 49) return 2;
  if (pct < 54) return 3;
  if (pct < 58) return 4;
  if (pct < 63) return 5;
  return 6;
}

/** HLTV-style rating (~0.55–1.45). Higher is better. */
export function premierIndexFromHltvRating(rating: number | null | undefined): number {
  if (rating == null || !Number.isFinite(rating)) return 3;
  if (rating < 0.72) return 0;
  if (rating < 0.82) return 1;
  if (rating < 0.92) return 2;
  if (rating < 1.02) return 3;
  if (rating < 1.12) return 4;
  if (rating < 1.22) return 5;
  return 6;
}

/**
 * Time-to-damage (ms). Backend tiers: <450 suspicious (below_average), 450–650 average, >650 strong.
 * Maps so that stronger combat reaction → higher premier bracket.
 */
export function premierIndexFromTtdMs(ms: number | null | undefined): number {
  if (ms == null || !Number.isFinite(ms)) return 3;
  if (ms < 450) return 1;
  if (ms < 520) return 3;
  if (ms < 600) return 4;
  if (ms < 650) return 5;
  return 6;
}

/** Crosshair placement (°): lower is better (matches backend _tier_crosshair). */
export function premierIndexFromCrosshairDeg(deg: number | null | undefined): number {
  if (deg == null || !Number.isFinite(deg)) return 3;
  if (deg <= 4) return 6;
  if (deg <= 7) return 5;
  if (deg <= 11) return 3;
  if (deg <= 14) return 2;
  if (deg <= 18) return 1;
  return 0;
}

/** Headshot share as 0–100 percent. */
export function premierIndexFromHeadAccuracyPct(pct: number | null | undefined): number {
  if (pct == null || !Number.isFinite(pct)) return 3;
  if (pct < 28) return 0;
  if (pct < 34) return 1;
  if (pct < 40) return 2;
  if (pct < 46) return 3;
  if (pct < 52) return 4;
  if (pct < 58) return 5;
  return 6;
}
