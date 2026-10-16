import { NextRequest, NextResponse } from "next/server";
import { fetchLeetifyProfileRaw } from "@/lib/leetifyProfile";
import { enforceRateLimit } from "@/lib/rateLimit";

export async function GET(request: NextRequest) {
  const limited = enforceRateLimit(request, "leetify");
  if (limited) return limited;

  const steam64 = request.nextUrl.searchParams.get("steam64")?.trim();
  if (!steam64 || !/^\d{8,20}$/.test(steam64)) {
    return NextResponse.json({ error: "steam64 required" }, { status: 400 });
  }

  const profile = await fetchLeetifyProfileRaw(steam64);
  if (!profile?.steam64_id && !profile?.name && profile?.total_matches == null) {
    return NextResponse.json({ error: "Leetify profile not found" }, { status: 404 });
  }

  return NextResponse.json(profile);
}
