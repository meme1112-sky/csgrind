"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FaSteam } from "react-icons/fa";
import { useAppSelector } from "@/lib/hooks";
import { extractValveShareCode } from "@/lib/valveShareCode";
import { ValveDemoUploadForm } from "@/components/valve-demo-upload-form";

function UploadPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { steamId, loading: sessionLoading } = useAppSelector((s) => s.session);

  const shareRaw = searchParams.get("share")?.trim() ?? "";
  const initialShare = shareRaw ? extractValveShareCode(shareRaw) ?? shareRaw : "";

  return (
    <div className="mx-auto w-full max-w-lg px-4 pb-16 pt-24 sm:px-6">
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="border-b border-border/80 bg-muted/10 p-6 sm:p-8">
          <h1 className="text-xl font-semibold text-foreground">Upload Premier demo</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Drop your <span className="font-mono text-foreground/80">.dem</span> here and we&apos;ll
            parse it for the scoreboard + Neok AI. Share code can be skipped only for original Valve
            filenames (<span className="font-mono text-foreground/80">match730_…</span>); renamed
            demos still need CSGO-….
          </p>
        </div>

        <div className="p-6 sm:p-8">
          {sessionLoading ? (
            <p className="text-sm text-muted-foreground">Loading session…</p>
          ) : !steamId ? (
            <div className="space-y-4 text-sm text-muted-foreground">
              <p>Sign in with Steam to upload a Premier demo.</p>
              <Link
                href="/api/auth/steam"
                className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent-hover"
              >
                <FaSteam className="size-4" aria-hidden />
                Sign in with Steam
              </Link>
            </div>
          ) : (
            <ValveDemoUploadForm steamId={steamId} initialShareCode={initialShare} />
          )}
        </div>

        {steamId ? (
          <div className="flex flex-col gap-2 border-t border-border/60 px-6 py-4 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-8">
            <Link
              href="/profile/link-valve"
              className="transition-colors hover:text-foreground"
            >
              Link Valve auth / share codes →
            </Link>
            <button
              type="button"
              onClick={() => router.push(`/profile/${steamId}`)}
              className="text-left transition-colors hover:text-foreground sm:text-right"
            >
              Back to profile
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function UploadDemoPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-lg px-4 py-24 text-sm text-muted-foreground">
          Loading…
        </div>
      }
    >
      <UploadPageInner />
    </Suspense>
  );
}
