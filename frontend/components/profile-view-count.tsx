"use client";

import { useEffect, useRef, useState } from "react";
import { HiEye } from "react-icons/hi2";
import {
  COOKIE_CONSENT_CHANGE_EVENT,
  hasPreferenceConsent,
  hasProfileViewTrackingConsent,
} from "@/lib/cookieConsent";
import { PROFILE_VIEW_SESSION_PREFIX } from "@/lib/cookieConsent.shared";

export function ProfileViewCount({ steamId }: { steamId: string }) {
  const [viewCount, setViewCount] = useState<number | null>(null);
  const recordedRef = useRef(false);

  useEffect(() => {
    if (!steamId || recordedRef.current) return;
    recordedRef.current = true;

    const loadCount = async () => {
      try {
        const canTrack = hasProfileViewTrackingConsent();
        const canUseSession = hasPreferenceConsent();
        const sessionKey = `${PROFILE_VIEW_SESSION_PREFIX}${steamId}`;
        const alreadyViewed = canUseSession && sessionStorage.getItem(sessionKey) === "1";

        const res = await fetch(
          `/api/user/profile/${encodeURIComponent(steamId)}/view`,
          canTrack && !alreadyViewed ? { method: "POST" } : undefined,
        );
        if (!res.ok) return;
        const data = (await res.json()) as { viewCount?: number };
        if (typeof data.viewCount === "number") {
          setViewCount(data.viewCount);
          if (canTrack && canUseSession && !alreadyViewed) {
            sessionStorage.setItem(sessionKey, "1");
          }
        }
      } catch {
        // Non-critical — hide badge on failure
      }
    };

    void loadCount();

    const onConsentChange = () => {
      recordedRef.current = false;
      void loadCount();
    };
    window.addEventListener(COOKIE_CONSENT_CHANGE_EVENT, onConsentChange);
    return () => window.removeEventListener(COOKIE_CONSENT_CHANGE_EVENT, onConsentChange);
  }, [steamId]);

  if (viewCount == null) return null;

  return (
    <div
      className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-muted/25 px-2.5 py-1 text-xs text-muted-foreground"
      title="Profile views"
    >
      <HiEye className="size-3.5 shrink-0 opacity-80" aria-hidden />
      <span className="tabular-nums font-medium">{viewCount.toLocaleString("en-US")}</span>
    </div>
  );
}
