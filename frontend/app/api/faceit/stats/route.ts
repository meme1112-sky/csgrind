import { NextRequest, NextResponse } from "next/server";
import { backendJsonGet } from "@/lib/backendFetch";
import { enforceRateLimit } from "@/lib/rateLimit";

export async function GET(request: NextRequest) {
  const limited = enforceRateLimit(request, "faceit");
  if (limited) return limited;

  const playerId = request.nextUrl.searchParams.get("player_id");
  const game = request.nextUrl.searchParams.get("game") || "cs2";
  if (!playerId) {
    return NextResponse.json({ error: "player_id required" }, { status: 400 });
  }
  const q = `/faceit/stats?player_id=${encodeURIComponent(playerId)}&game=${encodeURIComponent(game)}`;
  return backendJsonGet(q);
}
