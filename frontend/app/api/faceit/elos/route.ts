import { NextRequest, NextResponse } from "next/server";
import { backendJsonGet } from "@/lib/backendFetch";
import { enforceRateLimit } from "@/lib/rateLimit";

export async function GET(request: NextRequest) {
  const limited = enforceRateLimit(request, "faceit");
  if (limited) return limited;

  const playerIds = request.nextUrl.searchParams.get("player_ids")?.trim();
  if (!playerIds) {
    return NextResponse.json(
      { error: "player_ids required (comma-separated FACEIT UUIDs)" },
      { status: 400 }
    );
  }

  return backendJsonGet(`/faceit/elos?player_ids=${encodeURIComponent(playerIds)}`);
}
