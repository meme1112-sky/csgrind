import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { User } from "@/lib/models/User";
import { getSessionSteamId } from "@/lib/session";
import { enforceRateLimit } from "@/lib/rateLimit";

/** Public profile fields returned to the client */
export interface UserProfileResponse {
  steamId: string;
  displayName: string | null;
  profileUrl: string | null;
  avatar: string | null;
  avatarMedium: string | null;
  avatarFull: string | null;
  realName: string | null;
  locCountryCode: string | null;
  /** Steam personaState: 0=Offline, 1=Online, 2=Busy, 3=Away, 4=Snooze, 5=Trade, 6=Play */
  personaState: number | null;
  /** Present when the player is in-game (Steam gameextrainfo). */
  gameExtraInfo: string | null;
  timeCreated: string | null;
  lastLoginAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export async function GET(request: NextRequest) {
  const limited = enforceRateLimit(request, "profile");
  if (limited) return limited;

  const steamId = await getSessionSteamId();

  if (!steamId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await connectDB();
    const user = await User.findOne({ steamId })
      .select(
        "steamId displayName profileUrl avatar avatarMedium avatarFull realName locCountryCode personaState gameExtraInfo timeCreated lastLoginAt createdAt updatedAt"
      )
      .lean();

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const profile: UserProfileResponse = {
      steamId: user.steamId,
      displayName: user.displayName ?? null,
      profileUrl: user.profileUrl ?? null,
      avatar: user.avatar ?? null,
      avatarMedium: user.avatarMedium ?? null,
      avatarFull: user.avatarFull ?? null,
      realName: user.realName ?? null,
      locCountryCode: user.locCountryCode ?? null,
      personaState: user.personaState ?? null,
      gameExtraInfo: user.gameExtraInfo ?? null,
      timeCreated: user.timeCreated ? new Date(user.timeCreated).toISOString() : null,
      lastLoginAt: user.lastLoginAt ? new Date(user.lastLoginAt).toISOString() : null,
      createdAt: user.createdAt ? new Date(user.createdAt).toISOString() : null,
      updatedAt: user.updatedAt ? new Date(user.updatedAt).toISOString() : null,
    };

    return NextResponse.json(profile);
  } catch {
    return NextResponse.json(
      { error: "Failed to load profile" },
      { status: 500 }
    );
  }
}
