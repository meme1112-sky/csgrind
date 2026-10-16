"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FaSteam } from "react-icons/fa";
import { useAppSelector } from "../../lib/hooks";

export default function ProfilePage() {
  const router = useRouter();
  const { steamId, loading } = useAppSelector((state) => state.session);

  useEffect(() => {
    if (loading) return;
    if (!steamId) return;

    let cancelled = false;
    fetch("/api/user/valve-link")
      .then((res) => (res.ok ? res.json() : { linked: false }))
      .then((data: { linked?: boolean }) => {
        if (cancelled) return;
        if (!data.linked) {
          router.replace("/profile/link-valve");
        } else {
          router.replace(`/profile/${steamId}`);
        }
      })
      .catch(() => {
        if (!cancelled) router.replace(`/profile/${steamId}`);
      });
    return () => {
      cancelled = true;
    };
  }, [steamId, loading, router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <span className="text-muted text-sm">Loading…</span>
      </div>
    );
  }

  if (steamId) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <span className="text-muted text-sm">Redirecting to your profile…</span>
      </div>
    );
  }

  return (
    <>
      <div
        className="fixed inset-0 z-30 bg-black/50 backdrop-blur-sm"
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="login-modal-title"
        aria-describedby="login-modal-desc"
        className="fixed left-1/2 top-1/2 z-40 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-card p-6 shadow-xl"
      >
        <h2 id="login-modal-title" className="text-xl font-semibold text-foreground">
          Sign in to view your profile
        </h2>
        <p id="login-modal-desc" className="mt-2 text-sm text-muted">
          Log in with your Steam account to access your profile, stats, and reputation on CSGrind.
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
          <Link
            href="/api/auth/steam"
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-background"
          >
            <FaSteam className="size-5 shrink-0" />
            Sign in with Steam
          </Link>
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-lg border border-border bg-transparent px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-background"
          >
            Cancel
          </Link>
        </div>
      </div>
    </>
  );
}
