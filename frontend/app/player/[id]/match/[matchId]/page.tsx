"use client";

import { useParams, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { MatchDetailView } from "@/components/match-detail-view";
import type { MatchPlatform } from "@/lib/recentMatches";

function parsePlatform(raw: string | null): MatchPlatform | null {
  if (raw === "faceit" || raw === "premier") return raw;
  return null;
}

function MatchPageInner() {
  const params = useParams();
  const search = useSearchParams();
  const playerId = typeof params?.id === "string" ? params.id : "";
  const matchId = typeof params?.matchId === "string" ? params.matchId : "";
  const platform = parsePlatform(search.get("platform"));

  if (!playerId || !matchId) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-10 text-sm text-muted-foreground">
        Missing player or match id.
      </div>
    );
  }

  return (
    <MatchDetailView
      playerId={playerId}
      matchId={matchId}
      platform={platform}
      backBase="player"
    />
  );
}

export default function PlayerMatchPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-5xl px-4 py-10 text-sm text-muted-foreground">
          Loading match…
        </div>
      }
    >
      <MatchPageInner />
    </Suspense>
  );
}
