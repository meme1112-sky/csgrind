import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { User } from "@/lib/models/User";
import {
  fetchSteamPlayerSummary,
  steamProfileToUserUpdate,
} from "@/lib/steamPlayerSummary";
import { clearLegacySteamCookie, setSessionSteamId } from "@/lib/session";

const STEAM_OPENID_VERIFY = "https://steamcommunity.com/openid/login";
const STEAM_ID_REGEX = /^https?:\/\/steamcommunity\.com\/openid\/id\/(\d+)$/;

function getBaseUrl(request: NextRequest): string {
  const host = request.headers.get("host") ?? "localhost:3000";
  const proto = request.headers.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const baseUrl = getBaseUrl(request);

  // Steam sends openid.* query params on callback
  const openidMode = url.searchParams.get("openid.mode");
  if (openidMode !== "id_res") {
    return NextResponse.redirect(`${baseUrl}/?error=invalid_callback`);
  }

  const claimedId = url.searchParams.get("openid.claimed_id");
  if (!claimedId || !STEAM_ID_REGEX.test(claimedId)) {
    return NextResponse.redirect(`${baseUrl}/?error=invalid_claimed_id`);
  }

  // Verify with Steam by replaying the response with mode=check_authentication
  const verifyParams = new URLSearchParams();
  url.searchParams.forEach((value, key) => {
    if (key.startsWith("openid.")) {
      verifyParams.set(key, value);
    }
  });
  verifyParams.set("openid.mode", "check_authentication"); // overwrite id_res

  const verifyRes = await fetch(STEAM_OPENID_VERIFY, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: verifyParams.toString(),
  });
  const body = await verifyRes.text();
  if (!body.includes("is_valid:true")) {
    return NextResponse.redirect(`${baseUrl}/?error=steam_verification_failed`);
  }

  const steamId = claimedId.replace(STEAM_ID_REGEX, "$1");

  // Persist user in MongoDB with all Steam profile data
  try {
    await connectDB();
    const profile = await fetchSteamPlayerSummary(steamId);
    const now = new Date();
    const update = steamProfileToUserUpdate(steamId, profile, now);
    await User.findOneAndUpdate(
      { steamId },
      { $set: update },
      { upsert: true, new: true }
    );
  } catch (err) {
    console.error("MongoDB save user on login:", err);
    return NextResponse.redirect(`${baseUrl}/?error=db_save_failed`);
  }

  await setSessionSteamId(steamId);

  const response = NextResponse.redirect(baseUrl);
  clearLegacySteamCookie(response);
  return response;
}
