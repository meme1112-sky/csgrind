import { NextRequest, NextResponse } from "next/server";
import {
  fetchDemoAnalyticsLastActivity,
  fetchFaceitProfileActivity,
  fetchLeetifyProfile,
  latestActivityIso,
} from "@/lib/lastActivityAt";
import { enqueueDemoArchive } from "@/lib/demoArchive";
import { fetchSteamCs2Playtime } from "@/lib/steamPlayerSummary";
import { enforceRateLimit } from "@/lib/rateLimit";

function looksLikeSteamId64(id: string): boolean {
  return /^\d{8,20}$/.test(id.trim());
}

export type UserProfileStatsResponse = {
  steamId: string;
  premier: number | null;
  faceitElo: number | null;
  estPlaytimeMinutes: number | null;
  playtime2WeeksMinutes: number | null;
  playtimePrivate: boolean;
  /** Latest match activity across Leetify, FACEIT, and demo analytics. */
  lastActivityAt: string | null;
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const limited = enforceRateLimit(request, "profile");
  if (limited) return limited;

  const { id: rawId } = await params;
  const steamId = rawId ? decodeURIComponent(rawId).trim() : "";
  if (!steamId) {
    return NextResponse.json({ error: "Missing profile id" }, { status: 400 });
  }
  if (!looksLikeSteamId64(steamId)) {
    return NextResponse.json(
      { error: "Invalid Steam id (expected 64-bit SteamID)" },
      { status: 400 }
    );
  }

  // Live search preview only needs ranks — skip playtime/demo work + archive enqueue.
  const previewOnly = request.nextUrl.searchParams.get("preview") === "1";

  const [leetifyResult, faceitResult, playtimeResult, demoResult] =
    await Promise.allSettled(
      previewOnly
        ? [
            fetchLeetifyProfile(steamId),
            fetchFaceitProfileActivity(steamId),
            Promise.resolve({ status: "unconfigured" as const }),
            Promise.resolve(null),
          ]
        : [
            fetchLeetifyProfile(steamId),
            fetchFaceitProfileActivity(steamId),
            fetchSteamCs2Playtime(steamId),
            fetchDemoAnalyticsLastActivity(steamId),
          ]
    );

  let estPlaytimeMinutes: number | null = null;
  let playtime2WeeksMinutes: number | null = null;
  let playtimePrivate = false;

  if (playtimeResult.status === "fulfilled") {
    const pt = playtimeResult.value;
    if (pt.status === "ok") {
      estPlaytimeMinutes = pt.playtime.playtimeForeverMinutes;
      playtime2WeeksMinutes = pt.playtime.playtime2WeeksMinutes;
    } else if (pt.status === "private") {
      playtimePrivate = true;
    }
  }

  const leetify =
    leetifyResult.status === "fulfilled" ? leetifyResult.value : null;
  const faceit =
    faceitResult.status === "fulfilled" ? faceitResult.value : null;
  const demoLastActivity =
    demoResult.status === "fulfilled" ? demoResult.value : null;

  const body: UserProfileStatsResponse = {
    steamId,
    premier: leetify?.premier ?? null,
    faceitElo: faceit?.faceitElo ?? null,
    estPlaytimeMinutes,
    playtime2WeeksMinutes,
    playtimePrivate,
    lastActivityAt: latestActivityIso(
      leetify?.lastActivityAt,
      faceit?.lastActivityAt,
      demoLastActivity
    ),
  };

  if (!previewOnly) {
    enqueueDemoArchive(steamId);
  }

  return NextResponse.json(body);
}
