"use client";

import { useEffect } from "react";
import { COOKIE_CONSENT_CHANGE_EVENT, hasAnalyticsConsent } from "@/lib/cookieConsent";

/**
 * Loads optional analytics only when the user accepted all cookies.
 * Add third-party scripts here when you integrate analytics.
 */
export function ConsentAwareAnalytics() {
  useEffect(() => {
    const maybeLoadAnalytics = () => {
      if (!hasAnalyticsConsent()) return;
      // e.g. load Google Analytics, Plausible, etc.
    };

    maybeLoadAnalytics();

    const onConsentChange = () => maybeLoadAnalytics();
    window.addEventListener(COOKIE_CONSENT_CHANGE_EVENT, onConsentChange);
    return () => window.removeEventListener(COOKIE_CONSENT_CHANGE_EVENT, onConsentChange);
  }, []);

  return null;
}
