import { getIronSession, type SessionOptions } from "iron-session";
import { cookies } from "next/headers";
import type { NextResponse } from "next/server";

export interface SessionData {
  steamId?: string;
}

const SESSION_MAX_AGE_SEC = 60 * 60 * 24 * 30;
const LEGACY_STEAM_COOKIE = "steam_id";

/** Dev-only fallback so local login works before SESSION_SECRET is set. Never use in production. */
const DEV_SESSION_PASSWORD = "csgrind-dev-session-secret-min-32-chars!";

function sessionPassword(): string {
  const secret = process.env.SESSION_SECRET?.trim();
  if (secret && secret.length >= 32) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET must be set and at least 32 characters in production");
  }
  return DEV_SESSION_PASSWORD;
}

export const sessionOptions: SessionOptions = {
  get password() {
    return sessionPassword();
  },
  cookieName: "csgrind_session",
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE_SEC,
    path: "/",
  },
};

export async function getSession() {
  return getIronSession<SessionData>(await cookies(), sessionOptions);
}

/** Verified Steam ID from signed session, or null if not signed in. */
export async function getSessionSteamId(): Promise<string | null> {
  const session = await getSession();
  const steamId = session.steamId?.trim();
  return steamId || null;
}

export async function setSessionSteamId(steamId: string): Promise<void> {
  const session = await getSession();
  session.steamId = steamId;
  await session.save();
}

export async function clearSession(): Promise<void> {
  const session = await getSession();
  session.destroy();
}

/** Clear the old unsigned steam_id cookie if present (migration). */
export function clearLegacySteamCookie(response: NextResponse): void {
  response.cookies.set(LEGACY_STEAM_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });
}
