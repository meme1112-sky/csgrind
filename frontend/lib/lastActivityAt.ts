import { getBackendFetchTimeoutMs, getBackendOrigin } from "@/lib/backendFetch";
import { internalApiHeaders } from "@/lib/internalApi";
import { fetchLeetifyProfileRaw } from "@/lib/leetifyProfile";

function toIso(ms: number): string {
  return new Date(ms).toISOString();
}

/** Normalize FACEIT unix seconds, ISO strings, or ms timestamps. */
export function parseActivityTimestamp(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === "number" && Number.isFinite(value)) {
    const ms = value < 1e12 ? value * 1000 : value;
    return Number.isFinite(ms) ? ms : null;
  }
  if (typeof value === "string" && value.trim()) {
    const t = new Date(value).getTime();
    return Number.isFinite(t) ? t : null;
  }
  return null;
}

export function latestActivityIso(...candidates: (string | null | undefined)[]): string | null {
  let max: number | null = null;
  for (const iso of candidates) {
    const t = parseActivityTimestamp(iso);
    if (t != null && (max == null || t > max)) max = t;
  }
  return max != null ? toIso(max) : null;
}

type LeetifyProfile = {
  ranks?: { premier?: number | null };
  recent_matches?: Array<{ finished_at?: string | null }>;
};

type FaceitPlayer = {
  player_id?: string;
  games?: {
    cs2?: { faceit_elo?: number | null };
    csgo?: { faceit_elo?: number | null };
  };
};

type FaceitHistoryItem = {
  finished_at?: number | string | null;
  updated_at?: number | string | null;
  started_at?: number | string | null;
};

export async function fetchLeetifyProfile(steamId: string): Promise<{
  premier: number | null;
  lastActivityAt: string | null;
}> {
  const data = (await fetchLeetifyProfileRaw(steamId)) as LeetifyProfile | null;
  if (!data) return { premier: null, lastActivityAt: null };
  const finishedAt = data.recent_matches?.[0]?.finished_at;
  const t = parseActivityTimestamp(finishedAt);
  return {
    premier: data.ranks?.premier ?? null,
    lastActivityAt: t != null ? toIso(t) : null,
  };
}

export async function fetchFaceitProfileActivity(steamId: string): Promise<{
  faceitElo: number | null;
  lastActivityAt: string | null;
}> {
  const origin = getBackendOrigin();
  const timeout = getBackendFetchTimeoutMs();
  const playerRes = await fetch(
    `${origin}/faceit/player?steam64=${encodeURIComponent(steamId)}`,
    {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(timeout),
      cache: "no-store",
    }
  );
  if (!playerRes.ok) return { faceitElo: null, lastActivityAt: null };

  const player = (await playerRes.json()) as FaceitPlayer;
  const cs2 = player.games?.cs2?.faceit_elo ?? null;
  const csgo = player.games?.csgo?.faceit_elo ?? null;
  const faceitElo = cs2 ?? csgo ?? null;

  const playerId = player.player_id;
  if (!playerId) return { faceitElo, lastActivityAt: null };

  const game = cs2 != null ? "cs2" : "csgo";
  const histRes = await fetch(
    `${origin}/faceit/history?player_id=${encodeURIComponent(playerId)}&game=${game}&limit=1`,
    {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(timeout),
      cache: "no-store",
    }
  );
  if (!histRes.ok) return { faceitElo, lastActivityAt: null };

  const hist = (await histRes.json()) as { items?: FaceitHistoryItem[] };
  const last = hist.items?.[0];
  const t = parseActivityTimestamp(
    last?.finished_at ?? last?.updated_at ?? last?.started_at
  );
  return {
    faceitElo,
    lastActivityAt: t != null ? toIso(t) : null,
  };
}

export async function fetchDemoAnalyticsLastActivity(
  steamId: string
): Promise<string | null> {
  const origin = getBackendOrigin();
  const params = new URLSearchParams({
    refresh: "false",
    max_matches: "5",
    scan_recent: "20",
  });
  const res = await fetch(
    `${origin}/v1/analytics/by-steam/${encodeURIComponent(steamId)}?${params}`,
    {
      headers: internalApiHeaders({ Accept: "application/json" }),
      signal: AbortSignal.timeout(getBackendFetchTimeoutMs()),
      cache: "no-store",
    }
  );
  if (!res.ok) return null;

  const data = (await res.json()) as {
    matches?: Array<{ played_at?: string | null }>;
  };

  let max: number | null = null;
  for (const m of data.matches ?? []) {
    const t = parseActivityTimestamp(m.played_at);
    if (t != null && (max == null || t > max)) max = t;
  }
  return max != null ? toIso(max) : null;
}
