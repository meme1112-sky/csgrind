import { resolveSearchToSteamId64 } from "@/lib/playerSearch";
import type { UserProfileResponse } from "@/app/api/user/profile/route";
import type { UserProfileStatsResponse } from "@/app/api/user/profile/[id]/stats/route";

export type PlayerSearchPreview = {
  steamId: string;
  displayName: string;
  avatarUrl: string | null;
  personaState: number | null;
  gameExtraInfo: string | null;
  premier: number | null;
  faceitElo: number | null;
};

/** Steam personaState → short status label for search preview cards. */
export function steamPresenceLabel(
  personaState: number | null | undefined,
  gameExtraInfo?: string | null
): { label: string; online: boolean } {
  if (gameExtraInfo?.trim()) {
    return { label: gameExtraInfo.trim(), online: true };
  }
  switch (personaState) {
    case 1:
      return { label: "Online", online: true };
    case 2:
      return { label: "Busy", online: true };
    case 3:
      return { label: "Away", online: true };
    case 4:
      return { label: "Snooze", online: true };
    case 5:
      return { label: "Looking to trade", online: true };
    case 6:
      return { label: "Looking to play", online: true };
    default:
      return { label: "Offline", online: false };
  }
}

export async function fetchPlayerSearchPreview(
  query: string,
  signal?: AbortSignal
): Promise<PlayerSearchPreview> {
  const steamId = await resolveSearchToSteamId64(query);
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

  const [profileRes, statsRes] = await Promise.all([
    fetch(`/api/user/profile/${encodeURIComponent(steamId)}`, {
      method: "GET",
      cache: "no-store",
      signal,
    }),
    fetch(`/api/user/profile/${encodeURIComponent(steamId)}/stats?preview=1`, {
      method: "GET",
      cache: "no-store",
      signal,
    }),
  ]);

  if (!profileRes.ok) {
    const data = (await profileRes.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error || "Player not found");
  }

  const profile = (await profileRes.json()) as UserProfileResponse;
  const stats = statsRes.ok
    ? ((await statsRes.json()) as UserProfileStatsResponse)
    : null;

  return {
    steamId: profile.steamId,
    displayName: profile.displayName?.trim() || profile.steamId,
    avatarUrl: profile.avatarMedium ?? profile.avatarFull ?? profile.avatar ?? null,
    personaState: profile.personaState ?? null,
    gameExtraInfo: profile.gameExtraInfo ?? null,
    premier: stats?.premier ?? null,
    faceitElo: stats?.faceitElo ?? null,
  };
}
