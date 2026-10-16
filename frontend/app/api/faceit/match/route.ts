import { NextRequest, NextResponse } from "next/server";
import { backendJsonGet } from "@/lib/backendFetch";
import { enforceRateLimit } from "@/lib/rateLimit";

export async function GET(request: NextRequest) {
  const limited = enforceRateLimit(request, "faceit");
  if (limited) return limited;

  const matchId = request.nextUrl.searchParams.get("match_id");
  if (!matchId?.trim()) {
    return NextResponse.json({ error: "match_id required" }, { status: 400 });
  }
  const q = `/faceit/match?match_id=${encodeURIComponent(matchId.trim())}`;
  return backendJsonGet(q);
}
