/** Parse FACEIT `/stats` lifetime blob (keys vary by API version). */

import type { RecentMatchSource } from "@/lib/recentMatches";

export interface FaceitLifetimeCore {
  kd: number;
  hsPct: number;
  wrPct: number;
  matches: number;
}

function v(lf: Record<string, unknown>, key: string): number {
  const n = lf[key];
  const f = typeof n === "number" ? n : parseFloat(String(n ?? ""));
  return Number.isFinite(f) ? f : 0;
}

function vAny(lf: Record<string, unknown>, keys: string[]): number {
  for (const k of keys) {
    const n = lf[k];
    const f = typeof n === "number" ? n : parseFloat(String(n ?? ""));
    if (Number.isFinite(f) && f !== 0) return f;
  }
  return 0;
}

/** First numeric value from `keys` that falls in (min, max) — skips bogus API fields. */
function vAnyInRange(
  lf: Record<string, unknown>,
  keys: string[],
  min: number,
  max: number,
): number {
  for (const k of keys) {
    const n = lf[k];
    const f = typeof n === "number" ? n : parseFloat(String(n ?? ""));
    if (Number.isFinite(f) && f > min && f < max) return f;
  }
  return 0;
}

export function parseFaceitLifetime(lf: Record<string, unknown>): FaceitLifetimeCore {
  // FaceIT may expose "K/D Ratio" as a cumulative total; prefer "Average K/D Ratio".
  const kd = vAnyInRange(lf, ["Average K/D Ratio", "K/D Ratio", "k/d_ratio", "KDR"], 0, 10);
  let hsPct = v(lf, "Average Headshots %") / 100 || v(lf, "Headshots %") / 100;
  if (!(hsPct >= 0 && hsPct <= 1)) hsPct = 0;
  let wrPct = v(lf, "Win Rate %") / 100;
  if (!(wrPct >= 0 && wrPct <= 1)) wrPct = 0;
  const matches = vAny(lf, ["Total Matches", "Matches", "matches"]);
  return { kd, hsPct, wrPct, matches };
}

export interface FaceitExtendedStats {
  adr: string;
  sniperKills: string;
  clutch1v1: string;
  clutch1v2: string;
  flashesPerRound: string;
  flashSuccess: string;
  totalFlashes: string;
  utilityPerRound: string;
  utilitySuccess: string;
  totalUtility: string;
  entryRate: string;
  entrySuccess: string;
  totalEntries: string;
  totalDamage: string;
  totalHeadshotsCount: string;
  totalWins: string;
}

export type FaceitGame = "cs2" | "csgo";

export type FaceitGamesAvailable = {
  cs2: boolean;
  csgo: boolean;
};

/** Built in profile/player pages from FACEIT API + stats. */
export interface FaceitDisplay {
  elo: number;
  nickname: string;
  level: number;
  kd: string;
  headshots: string;
  winrate: string;
  totalMatches: number;
  memberSince: string;
  memberSinceShort: string;
  lastMatch: string;
  wlHistory: string[];
  /** Recent matches for sidebar (joinable to demo HLTV rating via matchId). */
  recentMatches: RecentMatchSource[];
  faceitProfileUrl: string;
  extended: FaceitExtendedStats;
  game: FaceitGame;
}

function faceitLevelFromElo(elo: number): number {
  const e = Math.floor(Number(elo) || 0);
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

function hasFaceitGame(
  games: { cs2?: { faceit_elo?: number }; csgo?: { faceit_elo?: number } } | undefined,
  game: FaceitGame
): boolean {
  const elo = games?.[game]?.faceit_elo;
  return elo != null && Number.isFinite(elo) && elo > 0;
}

export function preferredFaceitGame(
  games: { cs2?: { faceit_elo?: number }; csgo?: { faceit_elo?: number } } | undefined
): FaceitGame {
  if (hasFaceitGame(games, "cs2")) return "cs2";
  if (hasFaceitGame(games, "csgo")) return "csgo";
  return "cs2";
}

export function faceitGamesAvailable(
  games: { cs2?: { faceit_elo?: number }; csgo?: { faceit_elo?: number } } | undefined
): FaceitGamesAvailable {
  return {
    cs2: hasFaceitGame(games, "cs2"),
    csgo: hasFaceitGame(games, "csgo"),
  };
}

/** Fetch FACEIT player + lifetime/history for a SteamID64 and game. */
export async function loadFaceitDisplayForSteam(
  steam64: string,
  game: FaceitGame
): Promise<{ display: FaceitDisplay; available: FaceitGamesAvailable }> {
  const playerRes = await fetch(`/api/faceit/player?steam64=${encodeURIComponent(steam64)}`);
  if (!playerRes.ok) throw new Error("FACEIT player not found");

  const player = (await playerRes.json()) as {
    player_id?: string;
    nickname?: string;
    games?: { cs2?: { faceit_elo?: number }; csgo?: { faceit_elo?: number } };
    activated_at?: string;
    created_at?: string;
  };
  if (!player?.player_id) throw new Error("FACEIT player not found");

  const available = faceitGamesAvailable(player.games);
  const games = player.games || {};
  const elo = games[game]?.faceit_elo ?? 0;
  const level = faceitLevelFromElo(elo);
  const nickname = player.nickname || "—";
  const faceitProfileUrl = `https://www.faceit.com/en/players/${encodeURIComponent(nickname)}`;

  const [statsRes, historyRes, matchesRes] = await Promise.all([
    fetch(`/api/faceit/stats?player_id=${encodeURIComponent(player.player_id)}&game=${game}`),
    fetch(`/api/faceit/history?player_id=${encodeURIComponent(player.player_id)}&game=${game}&limit=30`),
    fetch(`/api/faceit/matches?player_id=${encodeURIComponent(player.player_id)}&game=${game}&limit=30`),
  ]);

  if (!statsRes.ok && !available[game]) {
    throw new Error(`No FACEIT ${game.toUpperCase()} stats for this player`);
  }

  const stats = statsRes.ok ? await statsRes.json() : null;
  const history = historyRes.ok ? await historyRes.json() : null;
  const matchStats = matchesRes.ok ? await matchesRes.json() : null;

  const lf = (stats?.lifetime || {}) as Record<string, unknown>;
  const extended = parseFaceitExtendedStats(lf);
  const { kd, hsPct, wrPct, matches } = parseFaceitLifetime(lf);
  const items = (history?.items || []) as Array<{
    match_id?: string;
    teams?: { faction1?: unknown; faction2?: unknown };
    results?: { winner?: string; score?: { faction1?: number; faction2?: number } };
    finished_at?: number | string;
    updated_at?: number | string;
    started_at?: number | string;
    voting?: { map?: { pick?: string[] } };
    game_map?: string;
  }>;

  const toArr = (team: { roster?: unknown[]; players?: unknown[]; members?: unknown[] } | undefined) =>
    team?.roster || team?.players || team?.members || [];

  function faceitMapName(it: (typeof items)[number]): string | null {
    const pick = it.voting?.map?.pick;
    if (Array.isArray(pick) && typeof pick[0] === "string" && pick[0].trim()) return pick[0].trim();
    const rec = it as Record<string, unknown>;
    for (const key of ["game_map", "map", "map_name"] as const) {
      const v = rec[key];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
    return null;
  }

  function mapFromPlayerStats(statsObj: Record<string, unknown> | null | undefined): {
    matchId: string | null;
    mapName: string | null;
  } {
    if (!statsObj) return { matchId: null, mapName: null };
    const idRaw = statsObj["Match Id"] ?? statsObj["Match ID"] ?? statsObj.matchId ?? statsObj.match_id;
    const mapRaw = statsObj.Map ?? statsObj.map ?? statsObj.i1 ?? statsObj.map_name;
    const matchId = typeof idRaw === "string" && idRaw.trim() ? idRaw.trim() : null;
    const mapName = typeof mapRaw === "string" && mapRaw.trim() ? mapRaw.trim() : null;
    return { matchId, mapName };
  }

  function finishedIso(it: (typeof items)[number]): string | null {
    const ts = it.finished_at ?? it.updated_at ?? it.started_at;
    if (ts == null) return null;
    if (typeof ts === "number" && Number.isFinite(ts)) {
      const ms = ts < 1e12 ? ts * 1000 : ts;
      return new Date(ms).toISOString();
    }
    const d = new Date(ts);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }

  const recentMatches: RecentMatchSource[] = items.slice(0, 30).map((it) => {
    const roster1 = toArr(it.teams?.faction1 as { roster?: unknown[] });
    const roster2 = toArr(it.teams?.faction2 as { roster?: unknown[] });
    const r1Ids = (roster1 as { player_id?: string }[]).map((r) => r.player_id).filter(Boolean);
    const r2Ids = (roster2 as { player_id?: string }[]).map((r) => r.player_id).filter(Boolean);
    const myTeam = r1Ids.includes(player.player_id!)
      ? "faction1"
      : r2Ids.includes(player.player_id!)
        ? "faction2"
        : null;
    const res = it.results || {};
    let winKey = res.winner ?? null;
    const s1 = res.score?.faction1;
    const s2 = res.score?.faction2;
    if (!winKey && Number.isFinite(s1) && Number.isFinite(s2)) {
      winKey = s1 === s2 ? null : s1! > s2! ? "faction1" : "faction2";
    }
    const outcome: "W" | "L" | null =
      myTeam && winKey ? (myTeam === winKey ? "W" : "L") : null;
    let scoreUs: number | null = null;
    let scoreThem: number | null = null;
    if (myTeam && Number.isFinite(s1) && Number.isFinite(s2)) {
      scoreUs = myTeam === "faction1" ? Number(s1) : Number(s2);
      scoreThem = myTeam === "faction1" ? Number(s2) : Number(s1);
    } else if (Number.isFinite(s1) && Number.isFinite(s2)) {
      scoreUs = Number(s1);
      scoreThem = Number(s2);
    }
    return {
      matchId: typeof it.match_id === "string" ? it.match_id : null,
      mapName: faceitMapName(it),
      scoreUs,
      scoreThem,
      outcome,
      finishedAt: finishedIso(it),
      platform: "faceit",
    };
  });

  const mapByMatchId = new Map<string, string>();
  const statsItems = (matchStats?.items || []) as Array<{ stats?: Record<string, unknown> }>;
  for (const row of statsItems) {
    const parsed = mapFromPlayerStats(row.stats);
    if (parsed.matchId && parsed.mapName) mapByMatchId.set(parsed.matchId, parsed.mapName);
  }
  if (mapByMatchId.size > 0) {
    for (const m of recentMatches) {
      if (m.mapName) continue;
      const mid = m.matchId?.trim();
      if (mid && mapByMatchId.has(mid)) m.mapName = mapByMatchId.get(mid) ?? null;
    }
  }

  const wlHistory: string[] = recentMatches.slice(0, 10).map((m) => m.outcome ?? "-");

  const lastItem = items[0];
  const ts = lastItem?.finished_at ?? lastItem?.updated_at ?? lastItem?.started_at;
  const lastMatchDate = typeof ts === "number" ? new Date(ts * 1000) : ts ? new Date(ts) : null;
  const since = player.activated_at || player.created_at;

  const display: FaceitDisplay = {
    elo,
    nickname,
    level: level || 0,
    kd: kd > 0 ? kd.toFixed(2) : "—",
    headshots: hsPct > 0 ? `${Math.round(hsPct * 100)}%` : "—",
    winrate: wrPct > 0 ? `${Math.round(wrPct * 100)}%` : "—",
    totalMatches: matches,
    memberSince: since
      ? new Date(since).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
      : "—",
    memberSinceShort: since
      ? new Date(since).toLocaleDateString("en-US", { month: "short", year: "numeric" })
      : "—",
    lastMatch: lastMatchDate
      ? lastMatchDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
      : "—",
    wlHistory,
    recentMatches,
    faceitProfileUrl,
    extended,
    game,
  };

  return { display, available };
}

function pctStr(raw: number, divide100: boolean): string {
  if (!Number.isFinite(raw) || raw <= 0) return "—";
  const p = divide100 && raw <= 1 ? raw * 100 : raw > 1 ? raw : raw * 100;
  if (!Number.isFinite(p)) return "—";
  return `${Math.round(p)}%`;
}

function numStr(raw: number, digits?: number): string {
  if (!Number.isFinite(raw) || raw < 0) return "—";
  if (digits != null) return raw.toFixed(digits);
  return Math.round(raw).toLocaleString("en-US");
}

export function parseFaceitExtendedStats(lf: Record<string, unknown>): FaceitExtendedStats {
  const core = parseFaceitLifetime(lf);
  const adrRaw = vAny(lf, [
    "Average Damage per Round",
    "ADR",
    "adr",
    "Average ADR",
    "Damage per Round",
  ]);
  const sniperRaw = vAny(lf, [
    "Sniper Kill Rate %",
    "Sniper Kill Rate",
    "Sniper Kills %",
    "Sniper Kills Rate",
  ]);

  const c11 = vAny(lf, ["1v1 Win Rate %", "1v1 Win Rate", "1v1 Win"]);
  const c12 = vAny(lf, ["1v2 Win Rate %", "1v2 Win Rate", "1v2 Win"]);

  const fpr = vAny(lf, ["Flashes per Round", "Flashes/Round", "Average Flashes per Round"]);
  const fs = vAny(lf, ["Flash Success Rate %", "Flash Success", "Flash Success Rate"]);
  const tf = vAny(lf, ["Total Flash Count", "Total Flashes", "Flashes"]);

  const upr = vAny(lf, [
    "Utility Usage per Round",
    "Utility per Round",
    "Utility/Round",
    "Average Utility per Round",
  ]);
  const us = vAny(lf, ["Utility Success Rate %", "Utility Success", "Utility Success Rate"]);
  const tu = vAny(lf, ["Total Utility Count", "Total Utility", "Utility Throws", "Utility"]);

  const er = vAny(lf, ["Entry Rate %", "Entry Rate"]);
  const es = vAny(lf, ["Entry Success Rate %", "Entry Success", "Entry Success Rate"]);
  const te = vAny(lf, ["Total Entry Count", "Total Entries", "Entries"]);

  const td = vAny(lf, ["Total Damage", "Damage"]);
  const th = vAny(lf, ["Total Headshots %", "Total Headshots", "Headshots"]);
  let tw = vAny(lf, ["Total Wins", "Wins"]);
  if (!(tw > 0) && core.matches > 0 && core.wrPct > 0) tw = Math.round(core.matches * core.wrPct);

  return {
    adr: adrRaw > 0 ? adrRaw.toFixed(2) : "—",
    sniperKills: pctStr(sniperRaw, true),
    clutch1v1: pctStr(c11, true),
    clutch1v2: pctStr(c12, true),
    flashesPerRound: fpr > 0 ? fpr.toFixed(2) : "—",
    flashSuccess: pctStr(fs, true),
    totalFlashes: tf > 0 ? numStr(tf) : "—",
    utilityPerRound: upr > 0 ? upr.toFixed(2) : "—",
    utilitySuccess: pctStr(us, true),
    totalUtility: tu > 0 ? numStr(tu) : "—",
    entryRate: pctStr(er, true),
    entrySuccess: pctStr(es, true),
    totalEntries: te > 0 ? numStr(te) : "—",
    totalDamage: td > 0 ? numStr(td) : "—",
    totalHeadshotsCount: th > 0 ? numStr(th) : "—",
    totalWins: tw > 0 ? numStr(tw) : "—",
  };
}
