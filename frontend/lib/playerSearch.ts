export const STEAM_ID64_REGEX = /^\d{17}$/;

const STEAM_PROFILE_REGEX = /steamcommunity\.com\/profiles\/(\d{17})/i;
const CSGRIND_PROFILE_REGEX = /osteamcommunity\.com\/profiles\/(\d{17})/i;
const CSGRIND_VANITY_REGEX = /osteamcommunity\.com\/id\/([^/?#]+)/i;
const LEETIFY_PROFILE_REGEX = /leetify\.com\/app\/profile\/(\d{17})/i;
const FACEIT_PLAYER_REGEX = /faceit\.com\/(?:[a-z]{2}\/)?players\/([^/?#]+)/i;

type FaceitPlayerLookup = {
  games?: {
    cs2?: { game_player_id?: string | null };
    csgo?: { game_player_id?: string | null };
  };
  error?: string;
};

/** Extract Steam vanity slug from a CSGrind-style osteamcommunity URL. */
export function parseCsgrindVanitySlug(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const match = trimmed.match(CSGRIND_VANITY_REGEX);
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1]).trim();
  } catch {
    return match[1].trim();
  }
}

/** Extract FACEIT nickname or SteamID64 slug from a FACEIT profile URL. */
export function parseFaceitPlayerSlug(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const match = trimmed.match(FACEIT_PLAYER_REGEX);
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1]).trim();
  } catch {
    return match[1].trim();
  }
}

function steamIdFromFaceitPlayer(data: FaceitPlayerLookup): string | null {
  const steam64 =
    data.games?.cs2?.game_player_id?.trim() ||
    data.games?.csgo?.game_player_id?.trim() ||
    null;
  return steam64 && STEAM_ID64_REGEX.test(steam64) ? steam64 : null;
}

async function resolveFaceitSlugToSteamId64(slug: string): Promise<string> {
  if (STEAM_ID64_REGEX.test(slug)) return slug;

  const res = await fetch(`/api/faceit/player?nickname=${encodeURIComponent(slug)}`, {
    method: "GET",
    cache: "no-store",
  });
  const data = (await res.json()) as FaceitPlayerLookup;
  const steamId = steamIdFromFaceitPlayer(data);
  if (res.ok && steamId) return steamId;
  throw new Error(data.error || "FACEIT player not found or Steam account not linked.");
}

/** Extract SteamID64 from raw input when pattern is unambiguous (no API call). */
export function parseSearchToSteamId64(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (STEAM_ID64_REGEX.test(trimmed)) return trimmed;
  const profileMatch = trimmed.match(STEAM_PROFILE_REGEX);
  if (profileMatch) return profileMatch[1];
  const csgrindProfileMatch = trimmed.match(CSGRIND_PROFILE_REGEX);
  if (csgrindProfileMatch) return csgrindProfileMatch[1];
  const leetifyMatch = trimmed.match(LEETIFY_PROFILE_REGEX);
  if (leetifyMatch) return leetifyMatch[1];
  const faceitSlug = parseFaceitPlayerSlug(trimmed);
  if (faceitSlug && STEAM_ID64_REGEX.test(faceitSlug)) return faceitSlug;
  return null;
}

/** Resolve search input to SteamID64 (sync parse, then FACEIT / Steam vanity API). */
export async function resolveSearchToSteamId64(input: string): Promise<string> {
  const direct = parseSearchToSteamId64(input);
  if (direct) return direct;

  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error(
      "Enter a SteamID64, CSGrind link, Leetify link, FACEIT profile URL, Steam profile URL, or Steam vanity name/URL."
    );
  }

  const csgrindVanity = parseCsgrindVanitySlug(trimmed);
  if (csgrindVanity) {
    const res = await fetch(`/api/steam/resolve?q=${encodeURIComponent(csgrindVanity)}`, {
      method: "GET",
      cache: "no-store",
    });
    const data = (await res.json()) as { steamId?: string; error?: string };
    const resolved = data.steamId;
    if (res.ok && resolved && STEAM_ID64_REGEX.test(resolved)) {
      return resolved;
    }
    throw new Error(data.error || "CSGrind vanity name not found.");
  }

  const faceitSlug = parseFaceitPlayerSlug(trimmed);
  if (faceitSlug) {
    return resolveFaceitSlugToSteamId64(faceitSlug);
  }

  const res = await fetch(`/api/steam/resolve?q=${encodeURIComponent(trimmed)}`, {
    method: "GET",
    cache: "no-store",
  });
  const data = (await res.json()) as { steamId?: string; error?: string };
  const resolved = data.steamId;
  if (res.ok && resolved && STEAM_ID64_REGEX.test(resolved)) {
    return resolved;
  }
  throw new Error(
    data.error ||
      "Could not resolve that user. Try a SteamID64, CSGrind link, FACEIT profile URL, Leetify link, or steamcommunity.com profile."
  );
}
