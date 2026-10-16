import {
  allowsAnalytics,
  allowsPreferences,
  COOKIE_CONSENT_CHANGE_EVENT,
  COOKIE_CONSENT_COOKIE_NAME,
  COOKIE_CONSENT_OPEN_EVENT,
  COOKIE_CONSENT_STORAGE_KEY,
  OPTIONAL_SESSION_PREFIX,
  PROFILE_VIEW_SESSION_PREFIX,
  parseConsentLevel,
  type CookieConsentLevel,
} from "./cookieConsent.shared";

export type { CookieConsentLevel } from "./cookieConsent.shared";
export {
  COOKIE_CONSENT_OPEN_EVENT,
  COOKIE_CONSENT_CHANGE_EVENT,
} from "./cookieConsent.shared";

export function getCookieConsent(): CookieConsentLevel | null {
  if (typeof window === "undefined") return null;
  return parseConsentLevel(localStorage.getItem(COOKIE_CONSENT_STORAGE_KEY));
}

function clearPrefixedKeys(storage: Storage, prefix: string): void {
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key?.startsWith(prefix) && key !== COOKIE_CONSENT_STORAGE_KEY) {
      keys.push(key);
    }
  }
  keys.forEach((key) => storage.removeItem(key));
}

function clearOptionalClientStorage(level: CookieConsentLevel): void {
  if (typeof window === "undefined") return;

  if (!allowsPreferences(level)) {
    clearPrefixedKeys(sessionStorage, OPTIONAL_SESSION_PREFIX);
    clearPrefixedKeys(localStorage, OPTIONAL_SESSION_PREFIX);
    return;
  }

  if (!allowsAnalytics(level)) {
    clearPrefixedKeys(sessionStorage, PROFILE_VIEW_SESSION_PREFIX);
    clearPrefixedKeys(localStorage, PROFILE_VIEW_SESSION_PREFIX);
  }
}

function applyConsentSideEffects(level: CookieConsentLevel): void {
  clearOptionalClientStorage(level);
}

export function setCookieConsent(level: CookieConsentLevel): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(COOKIE_CONSENT_STORAGE_KEY, level);
  document.cookie = `${COOKIE_CONSENT_COOKIE_NAME}=${level}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;
  applyConsentSideEffects(level);
  window.dispatchEvent(new CustomEvent(COOKIE_CONSENT_CHANGE_EVENT, { detail: level }));
}

export function openCookieConsentSettings(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(COOKIE_CONSENT_OPEN_EVENT));
}

export function hasAnalyticsConsent(): boolean {
  return allowsAnalytics(getCookieConsent());
}

export function hasPreferenceConsent(): boolean {
  return allowsPreferences(getCookieConsent());
}

export function hasProfileViewTrackingConsent(): boolean {
  return allowsAnalytics(getCookieConsent());
}
