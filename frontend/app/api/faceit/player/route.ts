import { NextRequest, NextResponse } from "next/server";
import { backendJsonGet } from "@/lib/backendFetch";
import { enforceRateLimit } from "@/lib/rateLimit";

export async function GET(request: NextRequest) {
  const limited = enforceRateLimit(request, "faceit");
  if (limited) return limited;

  const steam64 = request.nextUrl.searchParams.get("steam64");
  const nickname = request.nextUrl.searchParams.get("nickname")?.trim();
  if (!steam64 && !nickname) {
    return NextResponse.json({ error: "steam64 or nickname required" }, { status: 400 });
  }
  const q = nickname
    ? `/faceit/player?nickname=${encodeURIComponent(nickname)}`
    : `/faceit/player?steam64=${encodeURIComponent(steam64!)}`;
  return backendJsonGet(q);
}
