import { NextRequest, NextResponse } from "next/server";
import { clearLegacySteamCookie, clearSession } from "@/lib/session";

function getBaseUrl(request: NextRequest): string {
  const host = request.headers.get("host") ?? "localhost:3000";
  const proto = request.headers.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}

export async function POST(request: NextRequest) {
  const baseUrl = getBaseUrl(request);
  await clearSession();
  const response = NextResponse.redirect(new URL("/", baseUrl));
  clearLegacySteamCookie(response);
  return response;
}
