"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { HiArrowUpTray, HiCheck, HiChevronDown, HiLockClosed } from "react-icons/hi2";
import { useAppSelector } from "@/lib/hooks";
import { extractValveShareCode } from "@/lib/valveShareCode";

const STEAM_CODES_URL =
  "https://help.steampowered.com/en/wizard/HelpWithGameIssue/?appid=730&issueid=128";

const ACCENT = "#edae5f";

function LinkValvePageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { steamId, displayName, loading: sessionLoading } = useAppSelector((s) => s.session);
  const [authCode, setAuthCode] = useState("");
  const [shareCode, setShareCode] = useState("");
  const [helpOpen, setHelpOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linked, setLinked] = useState(false);
  const [statusLoaded, setStatusLoaded] = useState(false);
  /** When already linked, auth stays locked unless the user opts in. */
  const [editAuth, setEditAuth] = useState(false);

  useEffect(() => {
    const raw = searchParams.get("share")?.trim() ?? "";
    if (!raw) return;
    const extracted = extractValveShareCode(raw) ?? raw;
    setShareCode((prev) => prev || extracted);
  }, [searchParams]);

  useEffect(() => {
    if (sessionLoading || !steamId) return;
    let cancelled = false;
    fetch("/api/user/valve-link")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled) return;
        if (data?.linked) setLinked(true);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setStatusLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [sessionLoading, steamId]);

  const authLocked = linked && !editAuth;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!authLocked && !authCode.trim()) {
      setError("Authentication code is required");
      return;
    }
    if (!extractValveShareCode(shareCode)) {
      setError(
        "No CSGO share code found — paste the full Steam share link or CSGO-xxxxx-… code"
      );
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/user/valve-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          auth_code: authLocked ? "" : authCode.trim(),
          share_code: shareCode,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Failed to submit codes");
      setLinked(true);
      setEditAuth(false);
      setAuthCode("");
      router.push(`/profile/${steamId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submit failed");
    } finally {
      setSubmitting(false);
    }
  };

  if (sessionLoading || (steamId && !statusLoaded)) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-sm text-muted">
        Loading…
      </div>
    );
  }

  if (!steamId) {
    return (
      <div className="mx-auto max-w-md space-y-4 px-4 py-16 text-center">
        <p className="text-muted">Sign in with Steam to link your Valve match history.</p>
        <Link
          href="/api/auth/steam"
          className="inline-flex rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover"
        >
          Sign in with Steam
        </Link>
      </div>
    );
  }

  const name = displayName || "Player";

  return (
    <div className="mx-auto mt-16 max-w-lg px-4 py-10 sm:py-14">
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="border-b border-border/80 bg-muted/10 p-6 sm:p-8">
          <h1 className="text-xl font-semibold text-foreground">
            Welcome, {name}! <span aria-hidden>🎉</span>
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {linked ? (
              <>
                Paste a new <strong className="font-medium text-foreground">Share Code</strong> to
                refresh Valve match history. Your authentication code stays saved on the server.
              </>
            ) : (
              <>
                You&apos;re almost done! Enter your Steam codes below to enable{" "}
                <strong className="font-medium text-foreground">Valve matchmaking</strong> demo
                analysis for Neok AI integrity checks.
              </>
            )}
          </p>
          {linked ? (
            <p className="mt-3 text-sm font-medium text-emerald-500">
              Valve codes linked — you can update the share code anytime.
            </p>
          ) : null}
        </div>

        <form className="space-y-5 p-6 sm:p-8" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <label htmlFor="auth-code" className="text-sm font-medium text-foreground">
                Authentication Code
              </label>
              {authLocked ? (
                <button
                  type="button"
                  onClick={() => setEditAuth(true)}
                  className="text-xs font-medium text-accent hover:underline"
                >
                  Change auth code
                </button>
              ) : linked ? (
                <button
                  type="button"
                  onClick={() => {
                    setEditAuth(false);
                    setAuthCode("");
                  }}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Keep saved code
                </button>
              ) : null}
            </div>
            <div className="relative">
              <input
                id="auth-code"
                type="text"
                value={authLocked ? "••••••••••••••••" : authCode}
                onChange={(e) => setAuthCode(e.target.value)}
                placeholder="AAAA-AAAAA-AAAA"
                autoComplete="off"
                spellCheck={false}
                readOnly={authLocked}
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 pr-10 font-mono text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-70"
                disabled={submitting || authLocked}
                required={!authLocked}
              />
              {authLocked ? (
                <HiLockClosed
                  className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
              ) : null}
            </div>
          </div>

          <div className="space-y-2">
            <label htmlFor="share-code" className="text-sm font-medium text-foreground">
              Matchmaking Share Code
            </label>
            <input
              id="share-code"
              type="text"
              value={shareCode}
              onChange={(e) => {
                const raw = e.target.value;
                setShareCode(extractValveShareCode(raw) ?? raw);
              }}
              placeholder="CSGO-XXXXX-…"
              autoComplete="off"
              spellCheck={false}
              className="w-full rounded-lg border border-border bg-background px-3 py-2.5 font-mono text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent"
              disabled={submitting}
              required
            />
          </div>

          <div className="rounded-lg border border-border/80 bg-muted/10">
            <button
              type="button"
              onClick={() => setHelpOpen((o) => !o)}
              className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm font-medium text-foreground"
              aria-expanded={helpOpen}
            >
              How do I get these codes?
              <HiChevronDown
                className={`size-4 shrink-0 text-muted-foreground transition-transform ${
                  helpOpen ? "rotate-180" : ""
                }`}
                aria-hidden
              />
            </button>
            {helpOpen ? (
              <div className="space-y-2 border-t border-border/60 px-3 py-3 text-xs leading-relaxed text-muted-foreground">
                <p>
                  Open Steam → help for CS2 authentication / matchmaking share codes, or use Valve&apos;s
                  official flow:
                </p>
                <a
                  href={STEAM_CODES_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-accent hover:underline"
                >
                  Steam CS2 codes wizard →
                </a>
              </div>
            ) : null}
          </div>

          {error ? (
            <p className="text-sm text-rose-500" role="alert">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={submitting}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold text-white transition-colors disabled:opacity-60"
            style={{ backgroundColor: ACCENT }}
          >
            <HiCheck className="size-5" aria-hidden />
            {submitting
              ? "Submitting…"
              : linked
                ? authLocked
                  ? "Update Share Code"
                  : "Update Codes"
                : "Submit Codes"}
          </button>
        </form>

        <div className="flex flex-col items-center justify-between gap-3 border-t border-border/60 px-6 pb-6 pt-4 text-sm text-muted-foreground sm:flex-row sm:px-8">
          <Link href={`/profile/${steamId}`} className="transition-colors hover:text-foreground">
            Don&apos;t want to share right now?
          </Link>
          <Link href="/api/auth/signout" className="transition-colors hover:text-foreground">
            Log out
          </Link>
        </div>
      </div>

      <div className="mt-6 overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="flex flex-col gap-3 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
          <div>
            <h2 className="text-base font-semibold text-foreground">Need to upload a demo?</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Manual Premier uploads live on their own page in the top menu.
            </p>
          </div>
          <Link
            href="/upload"
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white"
            style={{ backgroundColor: ACCENT }}
          >
            <HiArrowUpTray className="size-4" aria-hidden />
            Upload demo
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function LinkValvePage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-lg px-4 py-16 text-sm text-muted-foreground">
          Loading…
        </div>
      }
    >
      <LinkValvePageInner />
    </Suspense>
  );
}
