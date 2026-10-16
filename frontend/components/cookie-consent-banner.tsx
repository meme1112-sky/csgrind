"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { HiChevronDown, HiShieldCheck } from "react-icons/hi2";
import { HiFire } from "react-icons/hi";
import {
  type CookieConsentLevel,
  COOKIE_CONSENT_OPEN_EVENT,
  getCookieConsent,
  setCookieConsent,
} from "@/lib/cookieConsent";

const COOKIE_CATEGORIES = [
  {
    id: "necessary",
    label: "Necessary",
    description: "Sign-in, security, and core site functionality. Always active.",
    required: true,
  },
  {
    id: "analytics",
    label: "Analytics",
    description: "Helps us understand usage and improve CSGrind. Optional.",
    required: false,
  },
] as const;

export default function CookieConsentBanner() {
  const [visible, setVisible] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);

  useEffect(() => {
    const showIfNeeded = () => {
      const needsConsent = getCookieConsent() === null;
      setVisible(needsConsent);
      if (needsConsent) {
        requestAnimationFrame(() => setMounted(true));
      }
    };

    showIfNeeded();

    const openSettings = () => {
      setDetailsOpen(false);
      setVisible(true);
      requestAnimationFrame(() => setMounted(true));
    };

    window.addEventListener(COOKIE_CONSENT_OPEN_EVENT, openSettings);
    return () => window.removeEventListener(COOKIE_CONSENT_OPEN_EVENT, openSettings);
  }, []);

  const choose = (level: CookieConsentLevel) => {
    setMounted(false);
    setCookieConsent(level);
    window.setTimeout(() => setVisible(false), 200);
  };

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:justify-end sm:p-6"
      role="presentation"
    >
      <div
        className={`absolute inset-0 bg-black/55 backdrop-blur-[2px] transition-opacity duration-300 ${
          mounted ? "opacity-100" : "opacity-0"
        }`}
        aria-hidden
      />

      <div
        role="dialog"
        aria-labelledby="cookie-consent-title"
        aria-describedby="cookie-consent-desc"
        className={`relative w-full max-w-md pointer-events-auto transition-all duration-300 ease-out ${
          mounted ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
        }`}
      >
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-[0_0_48px_-8px_rgba(237,174,95,0.18),0_24px_48px_-12px_rgba(0,0,0,0.55)]">
          <div className="h-0.5 w-full bg-gradient-to-r from-transparent via-accent/80 to-transparent" />

          <div className="p-5 sm:p-6">
            <div className="flex items-start gap-3.5">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent">
                <HiShieldCheck className="size-5" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-accent">
                  Privacy
                </p>
                <h2 id="cookie-consent-title" className="mt-0.5 text-base font-semibold text-foreground">
                  Cookie preferences
                </h2>
                <p id="cookie-consent-desc" className="mt-2 text-sm leading-relaxed text-muted">
                  We use cookies to keep CSGrind running and, if you allow it, to understand how the site is used.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setDetailsOpen((open) => !open)}
              className="mt-4 flex w-full items-center justify-between gap-2 rounded-lg border border-border/80 bg-muted/15 px-3 py-2.5 text-left text-sm text-foreground transition-colors hover:bg-muted/25"
              aria-expanded={detailsOpen}
            >
              <span className="font-medium">What we use cookies for</span>
              <HiChevronDown
                className={`size-4 shrink-0 text-muted transition-transform duration-200 ${
                  detailsOpen ? "rotate-180" : ""
                }`}
                aria-hidden
              />
            </button>

            {detailsOpen && (
              <ul className="mt-2 space-y-2 rounded-lg border border-border/60 bg-background/40 p-3">
                {COOKIE_CATEGORIES.map((cat) => (
                  <li key={cat.id} className="flex items-start justify-between gap-3 text-sm">
                    <div className="min-w-0">
                      <p className="font-medium text-foreground">{cat.label}</p>
                      <p className="mt-0.5 text-xs leading-relaxed text-muted">{cat.description}</p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                        cat.required
                          ? "bg-accent/15 text-accent"
                          : "bg-muted/30 text-muted-foreground"
                      }`}
                    >
                      {cat.required ? "Required" : "Optional"}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-5 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => choose("all")}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent-hover"
              >
                <HiFire className="size-4 opacity-90" aria-hidden />
                Accept all
              </button>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => choose("necessary")}
                  className="rounded-xl border border-border bg-muted/20 px-3 py-2.5 text-sm font-medium text-foreground transition-colors hover:border-accent/30 hover:bg-accent/10"
                >
                  Necessary only
                </button>
                <button
                  type="button"
                  onClick={() => choose("declined")}
                  className="rounded-xl border border-border/80 bg-background/50 px-3 py-2.5 text-sm font-medium text-muted transition-colors hover:bg-muted/20 hover:text-foreground"
                >
                  Decline
                </button>
              </div>
            </div>

            <p className="mt-4 text-center text-xs text-muted">
              Read our{" "}
              <Link href="/privacy" className="text-accent underline-offset-2 hover:underline">
                Privacy Policy
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
