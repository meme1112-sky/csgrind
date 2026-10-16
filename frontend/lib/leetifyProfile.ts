import {
  faceitLevelFromElo,
  formatPremierRating,
  premierBadgeFromRating,
} from "@/lib/premierBadges";
import { buildRatingBarsFromApi, formatSignedRating } from "@/lib/leetifyRatingBenchmarks";
import type { RecentMatchSource } from "@/lib/recentMatches";

const LEETIFY_PROFILE_URL =
  "https://api-public.cs-prod.leetify.com/v3/profile";

export type LeetifyProfileResponse = {
  id?: string;
  steam64_id?: string;
  name?: string;
  privacy_mode?: string;
  winrate?: number;
  total_matches?: number;
  first_match_date?: string | null;
  ranks?: {
    leetify?: number | null;
    premier?: number | null;
    faceit?: number | null;
    faceit_elo?: number | null;
    wingman?: number | null;
  };
  rating?: {
    aim?: number | null;
    positioning?: number | null;
    utility?: number | null;
    clutch?: number | null;
    opening?: number | null;
    ct_leetify?: number | null;
    t_leetify?: number | null;
  };
  stats?: Record<string, number | null | undefined>;
  recent_matches?: Array<{
    outcome?: string | null;
    finished_at?: string | null;
    map_name?: string | null;
    score?: [number, number] | null;
    /** e.g. "faceit" | "matchmaking" (Premier). */
    data_source?: string | null;
    rank?: number | null;
    rank_type?: number | null;
    leetify_rating?: number | null;
  }>;
};

export type LeetifyDisplay = {
  name: string;
  steamId: string;
  profileUrl: string;
  privacyMode: string;
  premier: number | null;
  premierFormatted: string;
  premierBadge: string | null;
  faceitLevel: number;
  faceitElo: number | null;
  leetifyRank: number | null;
  winrate: string;
  totalMatches: number;
  firstMatch: string;
  lastMatch: string;
  ratings: {
    aim: string;
    positioning: string;
    utility: string;
    clutch: string;
    opening: string;
  };
  /** Leetify-style horizontal rating bars with bracket benchmark line. */
  ratingBars: Array<{
    label: string;
    display: string;
    fillPct: number;
    indicatorPct: number;
    comparison: string;
    trend: "up" | "down" | "even";
  }>;
  stats: {
    accuracy: string;
    headshotAccuracy: string;
    preaim: string;
    reactionTime: string;
    sprayAccuracy: string;
  };
  wlHistory: ("W" | "L")[];
  /** Recent matches for sidebar (map · score · W/L); rating joined from demos. */
  recentMatches: RecentMatchSource[];
  /** Leetify matchmaking / Premier history for the Premier chip. */
  premierMatches: RecentMatchSource[];
};

function leetifyHeaders(): HeadersInit {
  const headers: Record<string, string> = { Accept: "application/json" };
  const key = process.env.LEETIFY_KEY?.trim();
  if (key) headers.Authorization = `Bearer ${key}`;
  return headers;
}

function formatPct(value: number | null | undefined, decimals = 0): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value.toFixed(decimals)}%`;
}

function formatNum(value: number | null | undefined, decimals = 1): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toFixed(decimals);
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function parseLeetifyDisplay(
  data: LeetifyProfileResponse,
  steamId: string
): LeetifyDisplay {
  const stats = data.stats ?? {};
  const rating = data.rating ?? {};
  const ranks = data.ranks ?? {};
  const premier = ranks.premier ?? null;
  const faceitElo = ranks.faceit_elo ?? null;
  const recentMatches: RecentMatchSource[] = (data.recent_matches ?? [])
    .slice(0, 40)
    .map((m) => {
      const o = (m.outcome ?? "").toLowerCase();
      const outcome = o === "win" ? ("W" as const) : o === "loss" ? ("L" as const) : null;
      const score = m.score;
      const scoreUs =
        Array.isArray(score) && score.length >= 2 && Number.isFinite(Number(score[0]))
          ? Number(score[0])
          : null;
      const scoreThem =
        Array.isArray(score) && score.length >= 2 && Number.isFinite(Number(score[1]))
          ? Number(score[1])
          : null;
      const ds = (m.data_source ?? "").trim().toLowerCase();
      const platform =
        ds === "matchmaking" || ds === "matchmaking_competitive" || ds === "premier"
          ? ("premier" as const)
          : ds === "faceit"
            ? ("faceit" as const)
            : null;
      return {
        mapName: m.map_name ?? null,
        scoreUs,
        scoreThem,
        outcome,
        finishedAt: m.finished_at ?? null,
        platform,
        leetifyRating:
          m.leetify_rating != null && Number.isFinite(Number(m.leetify_rating))
            ? Number(m.leetify_rating)
            : null,
      };
    });

  /** Premier / Valve MM history from Leetify (display only — not demo-parsed HLTV). */
  const premierMatches = recentMatches.filter((m) => m.platform === "premier");

  const wlHistory = recentMatches
    .map((m) => m.outcome)
    .filter((r): r is "W" | "L" => r === "W" || r === "L")
    .slice(0, 10);

  const lastFinished = data.recent_matches?.[0]?.finished_at ?? null;

  return {
    name: data.name?.trim() || "Player",
    steamId,
    profileUrl: `https://leetify.com/app/profile/${steamId}`,
    privacyMode: data.privacy_mode ?? "unknown",
    premier,
    premierFormatted: formatPremierRating(premier),
    premierBadge: premierBadgeFromRating(premier),
    faceitLevel: faceitLevelFromElo(faceitElo),
    faceitElo,
    leetifyRank: ranks.leetify ?? null,
    winrate:
      data.winrate != null && Number.isFinite(data.winrate)
        ? `${Math.round(data.winrate * 100)}%`
        : "—",
    totalMatches: data.total_matches ?? 0,
    firstMatch: formatDate(data.first_match_date),
    lastMatch: formatDate(lastFinished),
    ratings: {
      aim: formatNum(rating.aim, 0),
      positioning: formatNum(rating.positioning, 0),
      utility: formatNum(rating.utility, 0),
      clutch: formatSignedRating(rating.clutch),
      opening: formatSignedRating(rating.opening),
    },
    ratingBars: buildRatingBarsFromApi(rating, premier),
    stats: {
      accuracy: formatPct(stats.accuracy_enemy_spotted, 1),
      headshotAccuracy: formatPct(stats.accuracy_head, 1),
      preaim: formatNum(stats.preaim, 2),
      reactionTime:
        stats.reaction_time_ms != null && Number.isFinite(stats.reaction_time_ms)
          ? `${Math.round(stats.reaction_time_ms)} ms`
          : "—",
      sprayAccuracy: formatPct(stats.spray_accuracy, 1),
    },
    wlHistory,
    recentMatches,
    premierMatches,
  };
}

export async function fetchLeetifyProfileRaw(
  steamId: string
): Promise<LeetifyProfileResponse | null> {
  const url = `${LEETIFY_PROFILE_URL}?steam64_id=${encodeURIComponent(steamId)}`;
  const res = await fetch(url, {
    headers: leetifyHeaders(),
    next: { revalidate: 120 },
  });
  if (!res.ok) return null;
  return (await res.json()) as LeetifyProfileResponse;
}
