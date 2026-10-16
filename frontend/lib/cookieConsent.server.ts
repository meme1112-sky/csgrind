import { cookies } from "next/headers";
import {
  allowsAnalytics,
  COOKIE_CONSENT_COOKIE_NAME,
  parseConsentLevel,
  type CookieConsentLevel,
} from "@/lib/cookieConsent.shared";

export async function getServerCookieConsent(): Promise<CookieConsentLevel | null> {
  const cookieStore = await cookies();
  return parseConsentLevel(cookieStore.get(COOKIE_CONSENT_COOKIE_NAME)?.value);
}

export async function hasServerAnalyticsConsent(): Promise<boolean> {
  return allowsAnalytics(await getServerCookieConsent());
}
