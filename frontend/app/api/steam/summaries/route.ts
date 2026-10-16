import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rateLimit";

const STEAM_PLAYER_SUMMARIES =
  "https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/";

/**
 * Batch Steam avatars / persona names for scoreboard enrichment.
 * GET /api/steam/summaries?steamids=id1,id2,...
 */
export async function GET(request: NextRequest) {
  const limited = enforceRateLimit(request, "steam");
  if (limited) return limited;

  const key = process.env.STEAM_API_KEY?.trim();
  if (!key) {
    return NextResponse.json({ players: {} });
  }

  const raw = request.nextUrl.searchParams.get("steamids")?.trim() ?? "";
  const ids = [
    ...new Set(
      raw
        .split(",")
        .map((s) => s.trim())
        .filter((s) => /^\d{8,20}$/.test(s))
    ),
  ].slice(0, 100);

  if (ids.length === 0) {
    return NextResponse.json(
      { error: "steamids required (comma-separated SteamID64)" },
      { status: 400 }
    );
  }

  try {
    const url = `${STEAM_PLAYER_SUMMARIES}?key=${encodeURIComponent(key)}&steamids=${encodeURIComponent(ids.join(","))}`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      return NextResponse.json({ players: {} });
    }
    const data = (await res.json()) as {
      response?: {
        players?: Array<{
          steamid?: string;
          personaname?: string;
          avatar?: string;
          avatarmedium?: string;
          avatarfull?: string;
        }>;
      };
    };
    const players: Record<
      string,
      { personaName: string | null; avatarUrl: string | null }
    > = {};
    for (const p of data.response?.players ?? []) {
      const sid = (p.steamid ?? "").trim();
      if (!sid) continue;
      players[sid] = {
        personaName: p.personaname?.trim() || null,
        avatarUrl: p.avatarmedium || p.avatarfull || p.avatar || null,
      };
    }
    return NextResponse.json({ players });
  } catch {
    return NextResponse.json({ players: {} });
  }
}
