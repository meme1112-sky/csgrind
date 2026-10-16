import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { User } from "@/lib/models/User";
import { getSessionSteamId } from "@/lib/session";

export async function GET() {
  const steamId = await getSessionSteamId();
  if (!steamId) {
    return NextResponse.json({ steamId: null });
  }
  try {
    await connectDB();
    const user = await User.findOne(
      { steamId },
      { displayName: 1, avatarMedium: 1, avatar: 1 }
    ).lean();
    return NextResponse.json({
      steamId,
      displayName: user?.displayName ?? null,
      avatar: user?.avatarMedium ?? user?.avatar ?? null,
    });
  } catch {
    return NextResponse.json({ steamId, displayName: null, avatar: null });
  }
}
