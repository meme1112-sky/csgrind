export type CookieConsentLevel = "declined" | "necessary" | "all";

export const COOKIE_CONSENT_STORAGE_KEY = "csgrind_cookie_consent";
export const COOKIE_CONSENT_COOKIE_NAME = "cookie_consent";
export const COOKIE_CONSENT_OPEN_EVENT = "cookie-consent-open";
export const COOKIE_CONSENT_CHANGE_EVENT = "cookie-consent-change";

/** Prefix for optional client storage (preferences, analytics helpers). */
export const OPTIONAL_SESSION_PREFIX = "csgrind:";
/** Prefix for profile view dedup keys (analytics). */
export const PROFILE_VIEW_SESSION_PREFIX = "csgrind:profile-view:";

export function parseConsentLevel(
  raw: string | null | undefined,
): CookieConsentLevel | null {
  if (raw === "declined" || raw === "necessary" || raw === "all") return raw;
  return null;
}

export function allowsAnalytics(level: CookieConsentLevel | null): boolean {
  return level === "all";
}

export function allowsPreferences(level: CookieConsentLevel | null): boolean {
  return level === "all" || level === "necessary";
}

export function allowsProfileViewTracking(level: CookieConsentLevel | null): boolean {
  return allowsAnalytics(level);
}
