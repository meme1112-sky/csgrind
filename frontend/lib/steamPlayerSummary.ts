const STEAM_PLAYER_SUMMARIES =
  "https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/";
const STEAM_OWNED_GAMES =
  "https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/";
const CS2_APP_ID = 730;

/** Fields from Steam GetPlayerSummaries (ISteamUser/GetPlayerSummaries/v2) */
export interface SteamPlayerSummary {
  steamid?: string;
  communityvisibilitystate?: number;
  profilestate?: number;
  personaname?: string;
  profileurl?: string;
  avatar?: string;
  avatarmedium?: string;
  avatarfull?: string;
  personastate?: number;
  commentpermission?: number;
  realname?: string;
  primaryclanid?: string;
  timecreated?: number;
  lastlogoff?: number;
  loccountrycode?: string;
  locstatecode?: string;
  loccityid?: number;
  gameid?: string;
  gameextrainfo?: string;
  gameserverip?: string;
}

export interface SteamCs2Playtime {
  playtimeForeverMinutes: number;
  playtime2WeeksMinutes: number;
}

export type SteamCs2PlaytimeResult =
  | { status: "ok"; playtime: SteamCs2Playtime }
  | { status: "private" }
  | { status: "unconfigured" };

/** CS2 total + recent playtime from Steam GetOwnedGames (appid 730). */
export async function fetchSteamCs2Playtime(
  steamId: string
): Promise<SteamCs2PlaytimeResult> {
  const key = process.env.STEAM_API_KEY;
  if (!key) return { status: "unconfigured" };

  const params = new URLSearchParams({
    key,
    steamid: steamId,
    include_appinfo: "0",
    include_played_free_games: "1",
    "appids_filter[0]": String(CS2_APP_ID),
  });
  const res = await fetch(`${STEAM_OWNED_GAMES}?${params}`, {
    next: { revalidate: 300 },
  });
  if (!res.ok) return { status: "private" };

  const data = (await res.json()) as {
    response?: {
      games?: Array<{
        appid?: number;
        playtime_forever?: number;
        playtime_2weeks?: number;
      }>;
    };
  };

  const games = data.response?.games;
  if (!games?.length) return { status: "private" };

  const cs2 = games.find((g) => g.appid === CS2_APP_ID) ?? games[0];
  const playtimeForeverMinutes = cs2.playtime_forever ?? 0;

  // Steam returns CS2 in the library but zeros playtime when the user hides it
  // ("Always keep my total playtime private") — treat like private, not "0 hrs".
  if (playtimeForeverMinutes <= 0) return { status: "private" };

  return {
    status: "ok",
    playtime: {
      playtimeForeverMinutes,
      playtime2WeeksMinutes: cs2.playtime_2weeks ?? 0,
    },
  };
}

/** Format Steam playtime minutes for profile cards (e.g. "1,234 hrs"). */
export function formatSteamPlaytimeHours(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return "0 hrs";
  if (minutes < 60) return "< 1 hr";
  return `${Math.round(minutes / 60).toLocaleString("en-US")} hrs`;
}

export async function fetchSteamPlayerSummary(
  steamId: string
): Promise<SteamPlayerSummary | null> {
  const key = process.env.STEAM_API_KEY;
  if (!key) return null;
  const url = `${STEAM_PLAYER_SUMMARIES}?key=${encodeURIComponent(key)}&steamids=${encodeURIComponent(steamId)}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    response?: { players?: SteamPlayerSummary[] };
  };
  const player = data.response?.players?.[0];
  return player ?? null;
}

/** Map Steam API response to our User document (all fields) */
export function steamProfileToUserUpdate(
  steamId: string,
  profile: SteamPlayerSummary | null,
  now: Date
): Record<string, unknown> {
  const update: Record<string, unknown> = {
    steamId,
    lastLoginAt: now,
    updatedAt: now,
  };
  if (!profile) return update;

  if (profile.personaname !== undefined)
    update.displayName = profile.personaname;
  if (profile.profileurl !== undefined) update.profileUrl = profile.profileurl;
  if (profile.avatar !== undefined) update.avatar = profile.avatar;
  if (profile.avatarmedium !== undefined)
    update.avatarMedium = profile.avatarmedium;
  if (profile.avatarfull !== undefined) update.avatarFull = profile.avatarfull;
  if (profile.communityvisibilitystate !== undefined)
    update.communityVisibilityState = profile.communityvisibilitystate;
  if (profile.profilestate !== undefined)
    update.profileState = profile.profilestate;
  if (profile.commentpermission !== undefined)
    update.commentPermission = profile.commentpermission;
  if (profile.personastate !== undefined)
    update.personaState = profile.personastate;
  if (profile.lastlogoff !== undefined)
    update.lastLogoff = new Date(profile.lastlogoff * 1000);
  if (profile.realname !== undefined) update.realName = profile.realname;
  if (profile.primaryclanid !== undefined)
    update.primaryClanId = profile.primaryclanid;
  if (profile.timecreated !== undefined)
    update.timeCreated = new Date(profile.timecreated * 1000);
  if (profile.loccountrycode !== undefined)
    update.locCountryCode = profile.loccountrycode;
  if (profile.locstatecode !== undefined)
    update.locStateCode = profile.locstatecode;
  if (profile.loccityid !== undefined) update.locCityId = profile.loccityid;
  if (profile.gameid !== undefined) update.gameId = profile.gameid;
  if (profile.gameextrainfo !== undefined)
    update.gameExtraInfo = profile.gameextrainfo;
  if (profile.gameserverip !== undefined)
    update.gameServerIp = profile.gameserverip;

  return update;
}

/** Public JSON for a Steam user not (yet) stored locally */
export function steamSummaryToPublicProfile(
  steamId: string,
  s: SteamPlayerSummary
): {
  steamId: string;
  displayName: string | null;
  profileUrl: string | null;
  avatar: string | null;
  avatarMedium: string | null;
  avatarFull: string | null;
  realName: string | null;
  locCountryCode: string | null;
  personaState: number | null;
  gameExtraInfo: string | null;
  timeCreated: string | null;
  lastLoginAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
} {
  const id = s.steamid ?? steamId;
  return {
    steamId: id,
    displayName: s.personaname ?? null,
    profileUrl: s.profileurl ?? null,
    avatar: s.avatar ?? null,
    avatarMedium: s.avatarmedium ?? null,
    avatarFull: s.avatarfull ?? null,
    realName: s.realname ?? null,
    locCountryCode: s.loccountrycode ?? null,
    personaState: s.personastate ?? null,
    gameExtraInfo: s.gameextrainfo ?? null,
    timeCreated:
      s.timecreated != null
        ? new Date(s.timecreated * 1000).toISOString()
        : null,
    lastLoginAt:
      s.lastlogoff != null
        ? new Date(s.lastlogoff * 1000).toISOString()
        : null,
    createdAt: null,
    updatedAt: null,
  };
}
