/**
 * Resolve which Premier risk bracket to use for Neok AI integrity.
 *
 * Prefer live Premier. When Premier is missing / unranked, map FACEIT CS2 Elo
 * onto a synthetic Premier rating so FACEIT-only high-level players (e.g. L10)
 * are not scored against the default mid Premier table.
 */

import { isUnrankedPremier } from "@/lib/leetifyRatingBenchmarks";
import {
  riskConfigForPremierRating,
  type PremierRiskConfigJson,
} from "@/lib/riskPremierConfig";

export type RiskBracketSource = "premier" | "faceit" | "default";

export type EffectiveRiskBracket = {
  /** Synthetic or real Premier rating used for band lookup. */
  rating: number;
  range: string;
  source: RiskBracketSource;
  /** Short UI label, e.g. "Premier 25000+" or "Premier 25000+ (via FACEIT Elo)". */
  label: string;
};

/**
 * FACEIT CS2 Elo → Premier-equivalent rating (mid-bracket anchors).
 *
 * Rough skill overlap used for integrity tables only — not a claimed conversion
 * formula for ranks. Tuned so ~2.8k Elo L10 lands in 25000+ (PuTz_ / similar).
 */
export function premierRatingFromFaceitElo(elo: number | null | undefined): number | null {
  if (elo == null || !Number.isFinite(elo) || elo <= 0) return null;
  if (elo >= 2800) return 27_000; // 25000+
  if (elo >= 2500) return 22_500; // 20000-24999
  if (elo >= 2000) return 17_500; // 15000-19999
  if (elo >= 1500) return 12_500; // 10000-14999
  if (elo >= 1000) return 7_500; // 5000-9999
  return 3_000; // 1000-4999
}

/**
 * Effective Premier rating for risk JSON + integrity signals.
 * Premier (≥1000) wins; else FACEIT Elo map; else mid-bracket default (12000).
 */
export function resolveEffectiveRiskBracket(
  premierRating?: number | null,
  faceitElo?: number | null
): EffectiveRiskBracket {
  if (!isUnrankedPremier(premierRating)) {
    const rating = Math.round(premierRating as number);
    const cfg = riskConfigForPremierRating(rating);
    return {
      rating,
      range: cfg.range,
      source: "premier",
      label: `Premier ${cfg.range}`,
    };
  }

  const fromFaceit = premierRatingFromFaceitElo(faceitElo);
  if (fromFaceit != null) {
    const cfg = riskConfigForPremierRating(fromFaceit);
    return {
      rating: fromFaceit,
      range: cfg.range,
      source: "faceit",
      label: `Premier ${cfg.range} (via FACEIT Elo)`,
    };
  }

  const cfg = riskConfigForPremierRating(12_000);
  return {
    rating: 12_000,
    range: cfg.range,
    source: "default",
    label: `Premier ${cfg.range}`,
  };
}

export function riskConfigForEffectiveBracket(
  premierRating?: number | null,
  faceitElo?: number | null
): PremierRiskConfigJson {
  return riskConfigForPremierRating(resolveEffectiveRiskBracket(premierRating, faceitElo).rating);
}
