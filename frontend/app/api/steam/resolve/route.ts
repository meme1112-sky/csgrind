import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

const STEAM_RESOLVE_VANITY_URL =
  "https://api.steampowered.com/ISteamUser/ResolveVanityURL/v1/";

const STEAM_ID64_REGEX = /^\d{17}$/;
const STEAM_PROFILE_REGEX = /steamcommunity\.com\/profiles\/(\d{17})/i;
const STEAM_VANITY_URL_REGEX = /steamcommunity\.com\/id\/([^/?#]+)/i;
const CSGRIND_PROFILE_REGEX = /osteamcommunity\.com\/profiles\/(\d{17})/i;
const CSGRIND_VANITY_URL_REGEX = /osteamcommunity\.com\/id\/([^/?#]+)/i;

function extractVanity(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Full vanity URL: steamcommunity.com/id/<name> or osteamcommunity.com/id/<name>
  const vanityUrlMatch =
    trimmed.match(STEAM_VANITY_URL_REGEX) ?? trimmed.match(CSGRIND_VANITY_URL_REGEX);
  if (vanityUrlMatch?.[1]) return vanityUrlMatch[1];

  // If it's a Steam profile URL or SteamID64, it's not a vanity.
  if (STEAM_ID64_REGEX.test(trimmed)) return null;
  if (STEAM_PROFILE_REGEX.test(trimmed)) return null;
  if (CSGRIND_PROFILE_REGEX.test(trimmed)) return null;

  // Treat as a raw vanity string if it looks plausible.
  // (Steam allows a fairly broad charset; we keep it conservative.)
  if (/^[a-zA-Z0-9_-]{2,64}$/.test(trimmed)) return trimmed;

  return null;
}

export async function GET(request: NextRequest) {
  const limited = enforceRateLimit(request, "steam");
  if (limited) return limited;

  const key = process.env.STEAM_API_KEY;
  if (!key) {
    return NextResponse.json(
      { error: "Server is missing STEAM_API_KEY" },
      { status: 500 }
    );
  }

  const q = request.nextUrl.searchParams.get("q") ?? "";
  const trimmed = q.trim();
  if (!trimmed) {
    return NextResponse.json({ error: "Missing query param: q" }, { status: 400 });
  }

  // If caller passed SteamID64 directly.
  if (STEAM_ID64_REGEX.test(trimmed)) {
    return NextResponse.json({ steamId: trimmed });
  }

  // If caller passed steamcommunity.com/profiles/<steamId64> or osteamcommunity.com/profiles/<steamId64>
  const profileMatch =
    trimmed.match(STEAM_PROFILE_REGEX) ?? trimmed.match(CSGRIND_PROFILE_REGEX);
  if (profileMatch?.[1] && STEAM_ID64_REGEX.test(profileMatch[1])) {
    return NextResponse.json({ steamId: profileMatch[1] });
  }

  const vanity = extractVanity(trimmed);
  if (!vanity) {
    return NextResponse.json(
      { error: "Unsupported Steam input. Use SteamID64, /profiles/<id>, or /id/<vanity>." },
      { status: 400 }
    );
  }

  const url = `${STEAM_RESOLVE_VANITY_URL}?key=${encodeURIComponent(key)}&vanityurl=${encodeURIComponent(vanity)}`;

  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      return NextResponse.json(
        { error: "Steam ResolveVanityURL failed" },
        { status: 502 }
      );
    }

    const data = (await res.json()) as {
      response?: { success?: number; steamid?: string; message?: string };
    };

    const steamId = data.response?.steamid;
    if (steamId && STEAM_ID64_REGEX.test(steamId)) {
      return NextResponse.json({ steamId });
    }

    const message = data.response?.message;
    return NextResponse.json(
      { error: message || "Steam vanity name not found" },
      { status: 404 }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: "Steam ResolveVanityURL request failed", detail: msg },
      { status: 502 }
    );
  }
}

