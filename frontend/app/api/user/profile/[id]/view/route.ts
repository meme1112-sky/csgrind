import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { getProfileViewCount, incrementProfileViewCount } from "@/lib/profileViews";
import { hasServerAnalyticsConsent } from "@/lib/cookieConsent.server";
import { enforceRateLimit } from "@/lib/rateLimit";

function looksLikeSteamId64(id: string): boolean {
  return /^\d{8,20}$/.test(id.trim());
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const limited = enforceRateLimit(request, "profile");
  if (limited) return limited;

  const { id: rawId } = await params;
  const steamId = rawId ? decodeURIComponent(rawId).trim() : "";
  if (!steamId || !looksLikeSteamId64(steamId)) {
    return NextResponse.json({ error: "Invalid Steam id" }, { status: 400 });
  }

  try {
    await connectDB();
    const viewCount = await getProfileViewCount(steamId);
    return NextResponse.json({ viewCount });
  } catch {
    return NextResponse.json({ error: "Failed to load view count" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const limited = enforceRateLimit(request, "profile");
  if (limited) return limited;

  const { id: rawId } = await params;
  const steamId = rawId ? decodeURIComponent(rawId).trim() : "";
  if (!steamId || !looksLikeSteamId64(steamId)) {
    return NextResponse.json({ error: "Invalid Steam id" }, { status: 400 });
  }

  try {
    await connectDB();
    const canTrack = await hasServerAnalyticsConsent();
    if (!canTrack) {
      const viewCount = await getProfileViewCount(steamId);
      return NextResponse.json({ viewCount, recorded: false });
    }
    const viewCount = await incrementProfileViewCount(steamId);
    return NextResponse.json({ viewCount, recorded: true });
  } catch {
    return NextResponse.json({ error: "Failed to record view" }, { status: 500 });
  }
}
