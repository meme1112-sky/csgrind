import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { User } from "@/lib/models/User";
import {
  fetchSteamPlayerSummary,
  steamSummaryToPublicProfile,
} from "@/lib/steamPlayerSummary";
import { enforceRateLimit } from "@/lib/rateLimit";
import type { UserProfileResponse } from "../route";

/** Steam Web API accepts 64-bit ids as digit strings */
function looksLikeSteamId64(id: string): boolean {
  return /^\d{8,20}$/.test(id.trim());
}

export type { UserProfileResponse };

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

  try {
    await connectDB();
    const user = await User.findOne({ steamId })
      .select(
        "steamId displayName profileUrl avatar avatarMedium avatarFull realName locCountryCode personaState gameExtraInfo timeCreated lastLoginAt createdAt updatedAt"
      )
      .lean();

    // Prefer a fresh Steam summary for online status / current avatar when configured.
    const summary = process.env.STEAM_API_KEY
      ? await fetchSteamPlayerSummary(steamId)
      : null;

    if (user) {
      const fromSteam = summary
        ? steamSummaryToPublicProfile(steamId, summary)
        : null;
      const profile: UserProfileResponse = {
        steamId: user.steamId,
        displayName: fromSteam?.displayName ?? user.displayName ?? null,
        profileUrl: fromSteam?.profileUrl ?? user.profileUrl ?? null,
        avatar: fromSteam?.avatar ?? user.avatar ?? null,
        avatarMedium: fromSteam?.avatarMedium ?? user.avatarMedium ?? null,
        avatarFull: fromSteam?.avatarFull ?? user.avatarFull ?? null,
        realName: fromSteam?.realName ?? user.realName ?? null,
        locCountryCode: fromSteam?.locCountryCode ?? user.locCountryCode ?? null,
        personaState: fromSteam?.personaState ?? user.personaState ?? null,
        gameExtraInfo: fromSteam?.gameExtraInfo ?? user.gameExtraInfo ?? null,
        timeCreated:
          fromSteam?.timeCreated ??
          (user.timeCreated ? new Date(user.timeCreated).toISOString() : null),
        lastLoginAt:
          fromSteam?.lastLoginAt ??
          (user.lastLoginAt ? new Date(user.lastLoginAt).toISOString() : null),
        createdAt: user.createdAt ? new Date(user.createdAt).toISOString() : null,
        updatedAt: user.updatedAt ? new Date(user.updatedAt).toISOString() : null,
      };
      return NextResponse.json(profile);
    }

    if (!process.env.STEAM_API_KEY) {
      return NextResponse.json(
        { error: "Steam profile lookup is not configured" },
        { status: 503 }
      );
    }

    if (!summary) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const profile = steamSummaryToPublicProfile(steamId, summary);
    return NextResponse.json(profile satisfies UserProfileResponse);
  } catch {
    return NextResponse.json(
      { error: "Failed to load profile" },
      { status: 500 }
    );
  }
}
