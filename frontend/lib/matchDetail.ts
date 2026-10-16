/** Single-match detail from GET /v1/matches/{match_id} (+ embedded analytics). */

import type { AnalyticsBySteamMatch } from "@/lib/analyticsBySteam";
import { fetchAnalyticsBySteam } from "@/lib/analyticsBySteam";
import {
  formatMapLabel,
  isValveShareCode,
  normalizeMapKey,
  type MatchOutcome,
  type MatchPlatform,
} from "@/lib/recentMatches";

export type MatchDetailStatus =
  | "ready"
  | "pending"
  | "partial"
  | "not_found"
  | "error";

export type MatchTeamResult = "win" | "lose" | null;

export type MatchDetailPlayer = {
  name: string;
  steamId: string | null;
  side: string | null;
  /** FACEIT nickname when roster-matched. */
  faceitNickname: string | null;
  faceitPlayerId: string | null;
  avatarUrl: string | null;
  /** FACEIT CS skill level 1–10 when known (match roster). */
  faceitSkillLevel: number | null;
  /**
   * Current FACEIT Elo from the player profile (not Elo-at-match-time).
   * Null when the lobby has no FACEIT ids or the profile fetch failed.
   */
  faceitElo: number | null;
  /**
   * Profile Premier rating when known (usually the page owner's Leetify/CS2 rating).
   * Used for Neok AI brackets / Premier rank cell when FACEIT is missing.
   */
  premierRating: number | null;
  team: MatchTeamResult;
  kills: number | null;
  deaths: number | null;
  assists: number | null;
  adr: number | null;
  kast: number | null;
  hsPct: number | null;
  rating: number | null;
  impact: number | null;
  nRounds: number | null;
  /** Demo-derived aim metrics (ms / degrees) when present in analytics. */
  timeToDamage: number | null;
  crosshairPlacement: number | null;
};

export type MatchTeamAvg = {
  /** FACEIT team average Elo (`teams.*.stats.rating`) when present. */
  avgElo: number | null;
  /** FACEIT team average skill level (`teams.*.stats.skillLevel.average`). */
  avgLevel: number | null;
};

export type MatchDetailViewModel = {
  matchId: string;
  status: MatchDetailStatus;
  pipelineStatus: string | null;
  platform: MatchPlatform | null;
  mapLabel: string;
  mapKey: string;
  scoreUs: number | null;
  scoreThem: number | null;
  scoreLabel: string | null;
  /** Display score with colon (13:6) when known. */
  scoreDisplay: string | null;
  outcome: MatchOutcome | null;
  finishedAt: string | null;
  /** Full lobby when demo analytics exist. */
  players: MatchDetailPlayer[];
  winningTeam: MatchDetailPlayer[];
  losingTeam: MatchDetailPlayer[];
  winningTeamAvg: MatchTeamAvg | null;
  losingTeamAvg: MatchTeamAvg | null;
  /** True when players were split via FACEIT roster. */
  teamsResolved: boolean;
  /** Profiled Steam player row (from lobby or by-steam fallback). */
  focus: MatchDetailPlayer | null;
  message: string | null;
};

type MatchOutPayload = {
  match_id?: string;
  player_faceit_id?: string;
  status?: string;
  error_message?: string | null;
  analytics?: Record<string, unknown> | null;
  match_meta?: {
    map_name?: string | null;
    score_us?: number | null;
    score_them?: number | null;
    outcome?: string | null;
    winner?: string | null;
  } | null;
  match_finished_at?: number | null;
  match_started_at?: number | null;
};

type FaceitRosterPlayer = {
  player_id?: string;
  nickname?: string;
  game_player_id?: string;
  game_player_name?: string;
  avatar?: string;
  game_skill_level?: number | string;
};

function asNum(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) return Number(v);
  return null;
}

function asStr(v: unknown): string | null {
  if (typeof v === "string" && v.trim()) return v.trim();
  return null;
}

function parseOutcome(raw: unknown): MatchOutcome | null {
  const o = String(raw ?? "")
    .trim()
    .toUpperCase();
  return o === "W" || o === "L" ? o : null;
}

function scoreLabel(us: number | null, them: number | null): string | null {
  if (us == null || them == null) return null;
  return `${us}-${them}`;
}

function scoreDisplay(us: number | null, them: number | null): string | null {
  if (us == null || them == null) return null;
  return `${us}:${them}`;
}

function finishedIsoFromUnix(sec: number | null | undefined): string | null {
  if (sec == null || !Number.isFinite(sec)) return null;
  const ms = sec < 1e12 ? sec * 1000 : sec;
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function normalizeKey(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, "");
}

function blankPlayer(
  partial: Partial<MatchDetailPlayer> & Pick<MatchDetailPlayer, "name">
): MatchDetailPlayer {
  return {
    name: partial.name,
    steamId: partial.steamId ?? null,
    side: partial.side ?? null,
    faceitNickname: partial.faceitNickname ?? null,
    faceitPlayerId: partial.faceitPlayerId ?? null,
    avatarUrl: partial.avatarUrl ?? null,
    faceitSkillLevel: partial.faceitSkillLevel ?? null,
    faceitElo: partial.faceitElo ?? null,
    premierRating: partial.premierRating ?? null,
    team: partial.team ?? null,
    kills: partial.kills ?? null,
    deaths: partial.deaths ?? null,
    assists: partial.assists ?? null,
    adr: partial.adr ?? null,
    kast: partial.kast ?? null,
    hsPct: partial.hsPct ?? null,
    rating: partial.rating ?? null,
    impact: partial.impact ?? null,
    nRounds: partial.nRounds ?? null,
    timeToDamage: partial.timeToDamage ?? null,
    crosshairPlacement: partial.crosshairPlacement ?? null,
  };
}

function skillLevel(raw: unknown): number | null {
  const n = asNum(raw);
  if (n == null) return null;
  const rounded = Math.round(n);
  if (rounded < 1 || rounded > 10) return null;
  return rounded;
}

function rosterMeta(hit: FaceitRosterPlayer | undefined): {
  faceitNickname: string | null;
  faceitPlayerId: string | null;
  avatarUrl: string | null;
  faceitSkillLevel: number | null;
} {
  return {
    faceitNickname: asStr(hit?.nickname),
    faceitPlayerId: asStr(hit?.player_id),
    avatarUrl: asStr(hit?.avatar),
    faceitSkillLevel: skillLevel(hit?.game_skill_level),
  };
}

function findRosterHit(
  players: FaceitRosterPlayer[],
  p: MatchDetailPlayer
): FaceitRosterPlayer | undefined {
  if (p.steamId) {
    const bySteam = players.find((r) => asStr(r.game_player_id) === p.steamId);
    if (bySteam) return bySteam;
  }
  const byNick = players.find(
    (r) => normalizeKey(asStr(r.nickname) ?? "") === normalizeKey(p.name)
  );
  if (byNick) return byNick;
  return players.find(
    (r) =>
      normalizeKey(asStr(r.game_player_name) ?? "") === normalizeKey(p.name) ||
      (p.faceitNickname != null &&
        normalizeKey(asStr(r.nickname) ?? "") === normalizeKey(p.faceitNickname))
  );
}

function normalizePlayer(raw: Record<string, unknown>): MatchDetailPlayer | null {
  const side = asStr(raw.side)?.toLowerCase() ?? null;
  // Analytics stores CT/T split rows plus an aggregate `side: "all"` row.
  if (side && side !== "all" && side !== "ct" && side !== "t") return null;
  if (side && side !== "all") return null;

  const name = asStr(raw.name) ?? "Unknown";
  const steamId = asStr(raw.steamid) ?? asStr(raw.steam_id);
  return blankPlayer({
    name,
    steamId,
    side: side === "all" ? null : side,
    kills: asNum(raw.kills),
    deaths: asNum(raw.deaths),
    assists: asNum(raw.assists),
    adr: asNum(raw.adr),
    kast: asNum(raw.kast),
    hsPct: asNum(raw.headshot_pct),
    rating: asNum(raw.rating),
    impact: asNum(raw.impact),
    nRounds: asNum(raw.n_rounds),
    timeToDamage: asNum(raw.time_to_damage),
    crosshairPlacement: asNum(raw.crosshair_placement),
  });
}

function playersFromAnalytics(analytics: Record<string, unknown> | null | undefined): MatchDetailPlayer[] {
  const list = analytics?.players;
  if (!Array.isArray(list)) return [];
  const out: MatchDetailPlayer[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const p = normalizePlayer(item as Record<string, unknown>);
    if (p) out.push(p);
  }
  return out.sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1));
}

function findFocus(
  players: MatchDetailPlayer[],
  steamId: string | null | undefined
): MatchDetailPlayer | null {
  const sid = (steamId ?? "").trim();
  if (!sid || players.length === 0) return players[0] ?? null;
  return players.find((p) => p.steamId === sid) ?? players[0] ?? null;
}

function rosterFromFaction(team: unknown): FaceitRosterPlayer[] {
  if (!team || typeof team !== "object") return [];
  const t = team as Record<string, unknown>;
  const roster = t.roster ?? t.players ?? t.members;
  if (!Array.isArray(roster)) return [];
  return roster.filter((p): p is FaceitRosterPlayer => !!p && typeof p === "object") as FaceitRosterPlayer[];
}

function factionTeamAvg(team: unknown): MatchTeamAvg {
  if (!team || typeof team !== "object") return { avgElo: null, avgLevel: null };
  const stats = (team as Record<string, unknown>).stats;
  if (!stats || typeof stats !== "object") return { avgElo: null, avgLevel: null };
  const s = stats as Record<string, unknown>;
  const avgElo = asNum(s.rating);
  let avgLevel: number | null = null;
  const skill = s.skillLevel ?? s.skill_level;
  if (skill && typeof skill === "object") {
    avgLevel = asNum((skill as Record<string, unknown>).average);
  }
  return {
    avgElo: avgElo != null && avgElo > 0 ? Math.round(avgElo) : null,
    avgLevel:
      avgLevel != null && Number.isFinite(avgLevel)
        ? Math.min(10, Math.max(1, avgLevel))
        : null,
  };
}

function assignTeamsFromFaceit(
  players: MatchDetailPlayer[],
  faceitMatch: Record<string, unknown> | null
): {
  players: MatchDetailPlayer[];
  teamsResolved: boolean;
  winningTeamAvg: MatchTeamAvg | null;
  losingTeamAvg: MatchTeamAvg | null;
} {
  const emptyAvgs = {
    winningTeamAvg: null as MatchTeamAvg | null,
    losingTeamAvg: null as MatchTeamAvg | null,
  };
  if (!faceitMatch || players.length === 0) {
    return { players, teamsResolved: false, ...emptyAvgs };
  }

  const teams = faceitMatch.teams;
  if (!teams || typeof teams !== "object") {
    return { players, teamsResolved: false, ...emptyAvgs };
  }

  const tObj = teams as Record<string, unknown>;
  const f1 = rosterFromFaction(tObj.faction1);
  const f2 = rosterFromFaction(tObj.faction2);
  const allRoster = [...f1, ...f2];
  if (allRoster.length === 0) return { players, teamsResolved: false, ...emptyAvgs };

  const f1Avg = factionTeamAvg(tObj.faction1);
  const f2Avg = factionTeamAvg(tObj.faction2);

  const results = faceitMatch.results;
  const resObj = results && typeof results === "object" ? (results as Record<string, unknown>) : {};
  let winner = asStr(resObj.winner);
  const score =
    resObj.score && typeof resObj.score === "object"
      ? (resObj.score as Record<string, unknown>)
      : null;
  const s1 = asNum(score?.faction1);
  const s2 = asNum(score?.faction2);
  if (!winner && s1 != null && s2 != null && s1 !== s2) {
    winner = s1 > s2 ? "faction1" : "faction2";
  }

  type Faction = "faction1" | "faction2";
  const bySteam = new Map<string, Faction>();
  const byNick = new Map<string, Faction>();

  const index = (roster: FaceitRosterPlayer[], faction: Faction) => {
    for (const p of roster) {
      const nick = asStr(p.nickname);
      const gid = asStr(p.game_player_id);
      const gname = asStr(p.game_player_name);
      if (nick) byNick.set(normalizeKey(nick), faction);
      if (gname) byNick.set(normalizeKey(gname), faction);
      if (gid) bySteam.set(gid, faction);
    }
  };
  index(f1, "faction1");
  index(f2, "faction2");

  const teamOf = (faction: Faction | undefined): MatchTeamResult => {
    if (!faction || !winner) return null;
    return faction === winner ? "win" : "lose";
  };

  let teamMatched = 0;
  const enriched = players.map((p) => {
    let faction: Faction | undefined;
    if (p.steamId && bySteam.has(p.steamId)) faction = bySteam.get(p.steamId);
    if (!faction) {
      const nickHit = byNick.get(normalizeKey(p.name));
      if (nickHit) faction = nickHit;
    }

    const hit =
      (faction === "faction1"
        ? findRosterHit(f1, p)
        : faction === "faction2"
          ? findRosterHit(f2, p)
          : undefined) ?? findRosterHit(allRoster, p);

    const meta = rosterMeta(hit);
    if (faction) teamMatched += 1;

    return blankPlayer({
      ...p,
      ...meta,
      faceitNickname: meta.faceitNickname ?? p.faceitNickname,
      faceitPlayerId: meta.faceitPlayerId ?? p.faceitPlayerId,
      avatarUrl: meta.avatarUrl ?? p.avatarUrl,
      faceitSkillLevel: meta.faceitSkillLevel ?? p.faceitSkillLevel,
      team: teamOf(faction) ?? p.team,
    });
  });

  const teamsResolved = teamMatched > 0 && !!winner;
  const winningTeamAvg =
    winner === "faction1" ? f1Avg : winner === "faction2" ? f2Avg : null;
  const losingTeamAvg =
    winner === "faction1" ? f2Avg : winner === "faction2" ? f1Avg : null;

  return {
    players: enriched.sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1)),
    teamsResolved,
    winningTeamAvg: teamsResolved ? winningTeamAvg : null,
    losingTeamAvg: teamsResolved ? losingTeamAvg : null,
  };
}

function splitTeams(players: MatchDetailPlayer[]): {
  winningTeam: MatchDetailPlayer[];
  losingTeam: MatchDetailPlayer[];
} {
  const winningTeam = players
    .filter((p) => p.team === "win")
    .sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1));
  const losingTeam = players
    .filter((p) => p.team === "lose")
    .sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1));
  return { winningTeam, losingTeam };
}

async function fetchFaceitMatchDetail(
  matchId: string,
  signal?: AbortSignal
): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(`/api/faceit/match?match_id=${encodeURIComponent(matchId)}`, {
      cache: "no-store",
      signal,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as unknown;
    return data && typeof data === "object" ? (data as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

type FaceitEloEntry = { elo: number | null; skillLevel: number | null };

/**
 * Current Elo for lobby players (FACEIT profile). Failures are soft — scoreboard
 * still renders with level icons only.
 */
async function fetchFaceitElosByPlayerId(
  playerIds: string[],
  signal?: AbortSignal
): Promise<Map<string, FaceitEloEntry>> {
  const out = new Map<string, FaceitEloEntry>();
  const ids = [...new Set(playerIds.map((id) => id.trim()).filter(Boolean))].slice(0, 10);
  if (ids.length === 0) return out;

  try {
    const res = await fetch(
      `/api/faceit/elos?player_ids=${encodeURIComponent(ids.join(","))}`,
      { cache: "no-store", signal }
    );
    if (!res.ok) return out;
    const data = (await res.json()) as { elos?: Record<string, FaceitEloEntry> };
    const elos = data?.elos;
    if (!elos || typeof elos !== "object") return out;
    for (const [id, entry] of Object.entries(elos)) {
      if (!entry || typeof entry !== "object") continue;
      const elo = asNum(entry.elo);
      const level = skillLevel(entry.skillLevel);
      out.set(id, {
        elo: elo != null && elo > 0 ? Math.round(elo) : null,
        skillLevel: level,
      });
    }
  } catch {
    /* soft fail */
  }
  return out;
}

async function enrichPlayersWithFaceitElo(
  players: MatchDetailPlayer[],
  signal?: AbortSignal
): Promise<MatchDetailPlayer[]> {
  const ids = players
    .map((p) => p.faceitPlayerId)
    .filter((id): id is string => typeof id === "string" && id.length > 0);
  if (ids.length === 0) return players;

  const elos = await fetchFaceitElosByPlayerId(ids, signal);
  if (elos.size === 0) return players;

  return players.map((p) => {
    const id = p.faceitPlayerId;
    if (!id) return p;
    const hit = elos.get(id);
    if (!hit) return p;
    return {
      ...p,
      faceitElo: hit.elo ?? p.faceitElo,
      // Keep match-time skill level when present; fill gaps from live profile.
      faceitSkillLevel: p.faceitSkillLevel ?? hit.skillLevel,
    };
  });
}

type SteamSummaryHit = { personaName: string | null; avatarUrl: string | null };

async function fetchSteamSummariesBySteamId(
  steamIds: string[],
  signal?: AbortSignal
): Promise<Map<string, SteamSummaryHit>> {
  const out = new Map<string, SteamSummaryHit>();
  const ids = [...new Set(steamIds.map((id) => id.trim()).filter((id) => /^\d{8,20}$/.test(id)))].slice(
    0,
    100
  );
  if (ids.length === 0) return out;

  try {
    const res = await fetch(
      `/api/steam/summaries?steamids=${encodeURIComponent(ids.join(","))}`,
      { cache: "no-store", signal }
    );
    if (!res.ok) return out;
    const data = (await res.json()) as {
      players?: Record<string, SteamSummaryHit>;
    };
    const players = data?.players;
    if (!players || typeof players !== "object") return out;
    for (const [sid, hit] of Object.entries(players)) {
      if (!hit || typeof hit !== "object") continue;
      out.set(sid, {
        personaName: typeof hit.personaName === "string" ? hit.personaName : null,
        avatarUrl: typeof hit.avatarUrl === "string" ? hit.avatarUrl : null,
      });
    }
  } catch {
    /* soft fail */
  }
  return out;
}

type FaceitBySteamHit = {
  faceitPlayerId: string | null;
  faceitNickname: string | null;
  avatarUrl: string | null;
  faceitElo: number | null;
  faceitSkillLevel: number | null;
};

async function fetchFaceitBySteamId(
  steamId: string,
  signal?: AbortSignal
): Promise<FaceitBySteamHit | null> {
  try {
    const res = await fetch(`/api/faceit/player?steam64=${encodeURIComponent(steamId)}`, {
      cache: "no-store",
      signal,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Record<string, unknown>;
    const playerId = asStr(data.player_id) ?? asStr(data.guid);
    const nickname = asStr(data.nickname);
    const avatar = asStr(data.avatar);
    const games = data.games && typeof data.games === "object" ? (data.games as Record<string, unknown>) : null;
    const cs2 = games?.cs2 && typeof games.cs2 === "object" ? (games.cs2 as Record<string, unknown>) : null;
    const csgo =
      games?.csgo && typeof games.csgo === "object" ? (games.csgo as Record<string, unknown>) : null;
    const pick = cs2 ?? csgo;
    const eloRaw = pick ? asNum(pick.faceit_elo) : null;
    const levelRaw = pick ? skillLevel(pick.skill_level) : null;
    return {
      faceitPlayerId: playerId,
      faceitNickname: nickname,
      avatarUrl: avatar,
      faceitElo: eloRaw != null && eloRaw > 0 ? Math.round(eloRaw) : null,
      faceitSkillLevel: levelRaw,
    };
  } catch {
    return null;
  }
}

/**
 * Premier/Valve lobbies: fill Steam avatars + FACEIT rank/Elo by SteamID64.
 * Soft-fails so scoreboard still renders if Steam/FACEIT are slow.
 */
async function enrichPremierLobbyPlayers(
  players: MatchDetailPlayer[],
  signal?: AbortSignal
): Promise<MatchDetailPlayer[]> {
  const steamIds = players
    .map((p) => p.steamId)
    .filter((id): id is string => typeof id === "string" && /^\d{8,20}$/.test(id));
  if (steamIds.length === 0) return players;

  const unique = [...new Set(steamIds)].slice(0, 10);
  const [steamMap, faceitHits] = await Promise.all([
    fetchSteamSummariesBySteamId(unique, signal),
    Promise.all(unique.map(async (sid) => [sid, await fetchFaceitBySteamId(sid, signal)] as const)),
  ]);
  const faceitBySteam = new Map(faceitHits.filter(([, hit]) => hit != null) as [string, FaceitBySteamHit][]);

  return players.map((p) => {
    const sid = p.steamId;
    if (!sid) return p;
    const steam = steamMap.get(sid);
    const faceit = faceitBySteam.get(sid);
    return {
      ...p,
      name: p.name || steam?.personaName || p.name,
      avatarUrl: p.avatarUrl || faceit?.avatarUrl || steam?.avatarUrl || null,
      faceitNickname: p.faceitNickname || faceit?.faceitNickname || null,
      faceitPlayerId: p.faceitPlayerId || faceit?.faceitPlayerId || null,
      faceitElo: p.faceitElo ?? faceit?.faceitElo ?? null,
      faceitSkillLevel: p.faceitSkillLevel ?? faceit?.faceitSkillLevel ?? null,
    };
  });
}

function playerFromBySteamMatch(
  m: AnalyticsBySteamMatch,
  steamId: string
): MatchDetailPlayer {
  const combat = m.panels?.combat;
  const aim = m.panels?.aim;
  const raw = m.raw_stats;
  return blankPlayer({
    name: "You",
    steamId,
    side: null,
    kills: combat?.kills ?? raw?.kills ?? null,
    deaths: combat?.deaths ?? raw?.deaths ?? null,
    assists: null,
    adr: combat?.adr ?? null,
    kast: combat?.kast_pct != null ? combat.kast_pct / 100 : raw?.kast ?? null,
    hsPct: aim?.headshot_pct ?? raw?.headshot_pct ?? null,
    rating: combat?.rating ?? null,
    impact: combat?.impact ?? null,
    nRounds: raw?.n_rounds ?? null,
  });
}

function emptyModel(
  matchId: string,
  status: MatchDetailStatus,
  message: string,
  platform: MatchPlatform | null
): MatchDetailViewModel {
  return {
    matchId,
    status,
    pipelineStatus: null,
    platform,
    mapLabel: "UNKNOWN",
    mapKey: "",
    scoreUs: null,
    scoreThem: null,
    scoreLabel: null,
    scoreDisplay: null,
    outcome: null,
    finishedAt: null,
    players: [],
    winningTeam: [],
    losingTeam: [],
    winningTeamAvg: null,
    losingTeamAvg: null,
    teamsResolved: false,
    focus: null,
    message,
  };
}

function withTeams(
  base: Omit<
    MatchDetailViewModel,
    | "winningTeam"
    | "losingTeam"
    | "winningTeamAvg"
    | "losingTeamAvg"
    | "teamsResolved"
    | "scoreDisplay"
    | "players"
  > & {
    scoreDisplay?: string | null;
    teamsResolved?: boolean;
    winningTeamAvg?: MatchTeamAvg | null;
    losingTeamAvg?: MatchTeamAvg | null;
  },
  players: MatchDetailPlayer[],
  teamsResolved: boolean
): MatchDetailViewModel {
  const { winningTeam, losingTeam } = splitTeams(players);
  return {
    ...base,
    scoreDisplay: base.scoreDisplay ?? scoreDisplay(base.scoreUs, base.scoreThem),
    players,
    winningTeam,
    losingTeam,
    winningTeamAvg: base.winningTeamAvg ?? null,
    losingTeamAvg: base.losingTeamAvg ?? null,
    teamsResolved,
  };
}

type ValveMatchPayload = {
  share_code?: string;
  match_id?: string | null;
  steam_id?: string;
  status?: string;
  error_message?: string | null;
  analytics?: Record<string, unknown> | null;
  parse_summary?: { map_name?: string | null } | null;
  updated_at?: string | null;
  created_at?: string | null;
};

async function fetchValveMatch(
  shareCode: string,
  signal?: AbortSignal
): Promise<{ ok: true; data: ValveMatchPayload } | { ok: false; status: number; detail: string }> {
  try {
    const res = await fetch(`/api/v1/valve/matches/${encodeURIComponent(shareCode)}`, {
      cache: "no-store",
      signal,
    });
    if (res.ok) {
      return { ok: true, data: (await res.json()) as ValveMatchPayload };
    }
    const body = await res.json().catch(() => null);
    const detail =
      body && typeof body === "object" && "detail" in body
        ? String((body as { detail?: unknown }).detail ?? "")
        : "";
    return { ok: false, status: res.status, detail };
  } catch (e) {
    if (signal?.aborted) throw e;
    return { ok: false, status: 502, detail: "Could not reach Valve match service." };
  }
}

function modelFromValve(
  valve: ValveMatchPayload,
  matchId: string,
  steamId: string,
  platformHint: MatchPlatform | null
): MatchDetailViewModel {
  const mapRaw =
    asStr(valve.parse_summary?.map_name) ?? asStr(valve.analytics?.map_name) ?? null;
  const players = playersFromAnalytics(
    valve.analytics && typeof valve.analytics === "object" ? valve.analytics : null
  );
  const statusRaw = (valve.status ?? "").toLowerCase();
  const hasScoreboard = players.length > 0;

  let status: MatchDetailStatus = "pending";
  let message: string | null = null;
  if (hasScoreboard) {
    status = "ready";
  } else if (statusRaw === "parsed") {
    status = "partial";
    message = "Demo is parsed, but scoreboard stats are unavailable for this match.";
  } else if (statusRaw === "failed" || statusRaw === "error") {
    status = "error";
    message = valve.error_message?.trim() || "Valve demo processing failed for this match.";
  } else if (statusRaw === "no_demo") {
    status = "not_found";
    message =
      "Steam did not provide a demo URL for this Premier match. Upload the .dem manually to unlock the scoreboard.";
  } else {
    status = "pending";
    message =
      "Valve demo is still downloading or parsing. Scoreboard unlocks once processing finishes — or upload the .dem if sync is stuck.";
  }

  return withTeams(
    {
      matchId: valve.share_code ?? matchId,
      status,
      pipelineStatus: valve.status ?? null,
      platform: platformHint ?? "premier",
      mapLabel: formatMapLabel(mapRaw),
      mapKey: normalizeMapKey(mapRaw),
      scoreUs: null,
      scoreThem: null,
      scoreLabel: null,
      scoreDisplay: null,
      outcome: null,
      finishedAt: valve.updated_at ?? valve.created_at ?? null,
      focus: findFocus(players, steamId),
      message,
    },
    players,
    false
  );
}

async function finalizePremierModel(
  model: MatchDetailViewModel,
  signal?: AbortSignal
): Promise<MatchDetailViewModel> {
  if (model.players.length === 0) return model;
  const players = await enrichPremierLobbyPlayers(model.players, signal);
  const focusSteam = model.focus?.steamId ?? null;
  return withTeams(
    {
      matchId: model.matchId,
      status: model.status,
      pipelineStatus: model.pipelineStatus,
      platform: model.platform,
      mapLabel: model.mapLabel,
      mapKey: model.mapKey,
      scoreUs: model.scoreUs,
      scoreThem: model.scoreThem,
      scoreLabel: model.scoreLabel,
      scoreDisplay: model.scoreDisplay,
      outcome: model.outcome,
      finishedAt: model.finishedAt,
      focus: findFocus(players, focusSteam),
      message: model.message,
      winningTeamAvg: model.winningTeamAvg,
      losingTeamAvg: model.losingTeamAvg,
    },
    players,
    model.teamsResolved
  );
}

/**
 * Load match detail for the clickthrough page.
 * FACEIT pipeline first; Valve share-code demos for Premier; by-steam last resort.
 */
export async function loadMatchDetail(opts: {
  matchId: string;
  steamId: string;
  platform?: MatchPlatform | null;
  signal?: AbortSignal;
}): Promise<MatchDetailViewModel> {
  const matchId = opts.matchId.trim();
  const steamId = opts.steamId.trim();
  const platformHint = opts.platform ?? null;

  if (!matchId) {
    return emptyModel("", "not_found", "Missing match id.", platformHint);
  }

  // Premier / Valve share codes skip the FACEIT table.
  const preferValve =
    platformHint === "premier" || isValveShareCode(matchId);

  if (preferValve) {
    const valve = await fetchValveMatch(matchId, opts.signal);
    if (valve.ok) {
      return finalizePremierModel(
        modelFromValve(valve.data, matchId, steamId, platformHint ?? "premier"),
        opts.signal
      );
    }
    if (valve.status !== 404) {
      return emptyModel(
        matchId,
        "error",
        valve.detail || `Failed to load Valve match (${valve.status}).`,
        platformHint ?? "premier"
      );
    }
  }

  let pipeline: MatchOutPayload | null = null;
  let pipelineHttp: number | null = null;

  if (!preferValve || platformHint !== "premier") {
    try {
      const res = await fetch(`/api/v1/matches/${encodeURIComponent(matchId)}`, {
        cache: "no-store",
        signal: opts.signal,
      });
      pipelineHttp = res.status;
      if (res.ok) {
        pipeline = (await res.json()) as MatchOutPayload;
      } else if (res.status !== 404) {
        const body = await res.json().catch(() => null);
        const detail =
          body && typeof body === "object" && "detail" in body
            ? String((body as { detail?: unknown }).detail ?? "")
            : "";
        return emptyModel(
          matchId,
          "error",
          detail || `Failed to load match (${res.status}).`,
          platformHint ?? "faceit"
        );
      }
    } catch (e) {
      if (opts.signal?.aborted) throw e;
      return emptyModel(matchId, "error", "Could not reach match service.", platformHint);
    }
  }

  if (pipeline) {
    const meta = pipeline.match_meta ?? null;
    const mapRaw = meta?.map_name ?? asStr(pipeline.analytics?.map_name) ?? null;
    const scoreUs = meta?.score_us ?? null;
    const scoreThem = meta?.score_them ?? null;
    const outcome = parseOutcome(meta?.outcome);
    const finishedAt =
      finishedIsoFromUnix(pipeline.match_finished_at) ??
      finishedIsoFromUnix(pipeline.match_started_at);
    let players = playersFromAnalytics(
      pipeline.analytics && typeof pipeline.analytics === "object"
        ? (pipeline.analytics as Record<string, unknown>)
        : null
    );
    const statusRaw = (pipeline.status ?? "").toLowerCase();
    const hasScoreboard = players.length > 0;

    let status: MatchDetailStatus = "pending";
    let message: string | null = null;
    if (hasScoreboard) {
      status = "ready";
    } else if (statusRaw === "parsed") {
      status = "partial";
      message = "Demo is parsed, but scoreboard stats are unavailable for this match.";
    } else if (statusRaw === "error") {
      status = "error";
      message = pipeline.error_message?.trim() || "Demo processing failed for this match.";
    } else {
      status = "pending";
      message =
        "Demo is still downloading or parsing. Scoreboard unlocks once processing finishes.";
    }

    let teamsResolved = false;
    let winningTeamAvg: MatchTeamAvg | null = null;
    let losingTeamAvg: MatchTeamAvg | null = null;
    if (hasScoreboard && (platformHint === "faceit" || platformHint == null)) {
      const faceit = await fetchFaceitMatchDetail(matchId, opts.signal);
      const assigned = assignTeamsFromFaceit(players, faceit);
      players = assigned.players;
      teamsResolved = assigned.teamsResolved;
      winningTeamAvg = assigned.winningTeamAvg;
      losingTeamAvg = assigned.losingTeamAvg;
      if (teamsResolved) {
        players = await enrichPlayersWithFaceitElo(players, opts.signal);
      }
    }

    return withTeams(
      {
        matchId: pipeline.match_id ?? matchId,
        status,
        pipelineStatus: pipeline.status ?? null,
        platform: platformHint ?? "faceit",
        mapLabel: formatMapLabel(mapRaw),
        mapKey: normalizeMapKey(mapRaw),
        scoreUs,
        scoreThem,
        scoreLabel: scoreLabel(scoreUs, scoreThem),
        scoreDisplay: scoreDisplay(scoreUs, scoreThem),
        outcome,
        finishedAt,
        focus: findFocus(players, steamId),
        message,
        winningTeamAvg,
        losingTeamAvg,
      },
      players,
      teamsResolved
    );
  }

  // FACEIT 404 → try Valve if we haven't already.
  if (!preferValve) {
    const valve = await fetchValveMatch(matchId, opts.signal);
    if (valve.ok) {
      return finalizePremierModel(
        modelFromValve(valve.data, matchId, steamId, platformHint ?? "premier"),
        opts.signal
      );
    }
  }

  // Last resort: single-player panel from by-steam cache.
  if (!steamId) {
    return emptyModel(
      matchId,
      "not_found",
      "Match not found in the demo pipeline.",
      platformHint
    );
  }

  try {
    const payload = await fetchAnalyticsBySteam(steamId, {
      signal: opts.signal,
      maxMatches: 20,
      scanRecent: 40,
      refresh: false,
    });
    const hit = (payload.matches ?? []).find((m) => {
      const mid = (m.match_id ?? "").trim();
      return mid === matchId || mid.toUpperCase() === matchId.toUpperCase();
    });
    if (!hit) {
      return emptyModel(
        matchId,
        "not_found",
        platformHint === "premier" || isValveShareCode(matchId)
          ? "No stored Valve demo for this Premier match yet. Link match codes, wait for a lobby teammate, or upload the .dem manually on the Valve link page."
          : "This match is not in the demo pipeline yet.",
        platformHint
      );
    }

    const hitId = (hit.match_id ?? "").trim();
    const src = (hit.source ?? "").toLowerCase();
    const isValveHit =
      src === "valve" ||
      src === "premier" ||
      platformHint === "premier" ||
      isValveShareCode(hitId);

    // Recover full lobby when Recent Matches used a wrong-cased share code.
    if (isValveHit && hitId && isValveShareCode(hitId)) {
      const valveRetry = await fetchValveMatch(hitId, opts.signal);
      if (valveRetry.ok) {
        return finalizePremierModel(
          modelFromValve(valveRetry.data, hitId, steamId, platformHint ?? "premier"),
          opts.signal
        );
      }
    }

    const focus = playerFromBySteamMatch(hit, steamId);
    const scoreUs = hit.score_us ?? null;
    const scoreThem = hit.score_them ?? null;
    const platform: MatchPlatform | null =
      platformHint ??
      (src === "valve" || src === "premier" ? "premier" : src === "faceit" ? "faceit" : null);

    const players = [focus];
    return withTeams(
      {
        matchId: hitId || matchId,
        status: "partial",
        pipelineStatus: null,
        platform,
        mapLabel: formatMapLabel(hit.map),
        mapKey: normalizeMapKey(hit.map),
        scoreUs,
        scoreThem,
        scoreLabel: scoreLabel(scoreUs, scoreThem),
        scoreDisplay: scoreDisplay(scoreUs, scoreThem),
        outcome: parseOutcome(hit.outcome),
        finishedAt: hit.played_at ?? null,
        focus,
        message:
          platform === "premier"
            ? "Showing this player’s stats from a stored Valve demo."
            : "Full lobby scoreboard is only available for parsed demos. Showing this player’s demo stats.",
      },
      players,
      false
    );
  } catch (e) {
    if (opts.signal?.aborted) throw e;
    return emptyModel(
      matchId,
      "not_found",
      "Match not found in the demo pipeline.",
      platformHint
    );
  }
}

/** Top N performers by HLTV rating. */
export function topPerformers(
  players: MatchDetailPlayer[],
  n = 3
): MatchDetailPlayer[] {
  return [...players]
    .filter((p) => p.rating != null && Number.isFinite(p.rating))
    .sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1))
    .slice(0, n);
}
