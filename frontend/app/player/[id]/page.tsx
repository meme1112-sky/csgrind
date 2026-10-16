"use client";

import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  HiArrowDown,
  HiLockClosed,
  HiClock,
} from "react-icons/hi2";
import { DemoAnalyticsLeetifyCard } from "@/components/demo-analytics-leetify-card";
import {
  faceitLevelBadgePath,
  faceitLevelFromElo as levelFromElo,
} from "@/lib/premierBadges";
import { PremierRatingBadge } from "@/components/premier-rating-badge";
import {
  loadFaceitDisplayForSteam,
  type FaceitDisplay,
  type FaceitGame,
  type FaceitGamesAvailable,
} from "@/lib/faceitLifetime";
import { FaceitStatisticsSection } from "@/components/faceit-statistics-section";
import { LeetifyStatisticsSection } from "@/components/leetify-statistics-section";
import { parseLeetifyDisplay, type LeetifyDisplay } from "@/lib/leetifyProfile";
import { ProfileLastMatchFooter } from "@/components/profile-last-match-footer";
import { ProfileRecentMatches } from "@/components/profile-recent-matches";
import { ProfileViewCount } from "@/components/profile-view-count";
import { PlayerSearchBar } from "@/components/player-search-bar";
import { ProfileWithSidePromos } from "@/components/skinsmonkey-side-banners";
import { formatSteamPlaytimeHours } from "@/lib/steamPlayerSummary";

interface PlayerProfileData {
  steamId: string;
  displayName: string | null;
  profileUrl: string | null;
  avatar: string | null;
  avatarMedium: string | null;
  avatarFull: string | null;
  realName: string | null;
  locCountryCode: string | null;
  timeCreated: string | null;
  lastLoginAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

interface ProfileStats {
  premier: number | null;
  faceitElo: number | null;
  estPlaytimeMinutes: number | null;
  playtime2WeeksMinutes: number | null;
  playtimePrivate: boolean;
  lastActivityAt: string | null;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function PlayerPage() {
  const params = useParams();
  const id = typeof params?.id === "string" ? params.id : null;
  const [player, setPlayer] = useState<PlayerProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"faceit" | "neok" | "leetify">("leetify");
  const [faceitGame, setFaceitGame] = useState<FaceitGame>("cs2");
  const [faceitAvailable, setFaceitAvailable] = useState<FaceitGamesAvailable>({
    cs2: true,
    csgo: true,
  });
  const [faceitData, setFaceitData] = useState<FaceitDisplay | null>(null);
  const [faceitLoading, setFaceitLoading] = useState(false);
  const [faceitError, setFaceitError] = useState<string | null>(null);
  const [leetifyData, setLeetifyData] = useState<LeetifyDisplay | null>(null);
  const [leetifyLoading, setLeetifyLoading] = useState(false);
  const [leetifyError, setLeetifyError] = useState<string | null>(null);
  const [profileStats, setProfileStats] = useState<ProfileStats | null>(null);
  const leetifyRef = useRef<HTMLDivElement>(null);
  const skillRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      setError("Missing player id");
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/user/profile/${encodeURIComponent(id)}`)
      .then((res) => {
        if (!res.ok) throw new Error(res.status === 404 ? "Player not found" : "Failed to load player");
        return res.json();
      })
      .then((data) => {
        if (!cancelled) setPlayer(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message ?? "Failed to load player");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    const steam64 = player?.steamId;
    if (!steam64) {
      setProfileStats(null);
      return;
    }
    let cancelled = false;
    fetch(`/api/user/profile/${encodeURIComponent(steam64)}/stats`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("stats failed"))))
      .then((data: ProfileStats) => {
        if (!cancelled) setProfileStats(data);
      })
      .catch(() => {
        if (!cancelled) {
          setProfileStats({
            premier: null,
            faceitElo: null,
            estPlaytimeMinutes: null,
            playtime2WeeksMinutes: null,
            playtimePrivate: false,
            lastActivityAt: null,
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [player?.steamId]);

  useEffect(() => {
    setFaceitGame("cs2");
    setFaceitAvailable({ cs2: true, csgo: true });
    setFaceitData(null);
    setFaceitError(null);
  }, [player?.steamId]);

  useEffect(() => {
    const steam64 = player?.steamId;
    if (!steam64) {
      setFaceitData(null);
      setFaceitError(null);
      return;
    }
    let cancelled = false;
    setFaceitLoading(true);
    setFaceitError(null);
    loadFaceitDisplayForSteam(steam64, faceitGame)
      .then(({ display, available }) => {
        if (cancelled) return;
        setFaceitAvailable(available);
        if (!available[faceitGame]) {
          if (available.cs2 && faceitGame !== "cs2") {
            setFaceitGame("cs2");
            return;
          }
          if (available.csgo && faceitGame !== "csgo") {
            setFaceitGame("csgo");
            return;
          }
        }
        setFaceitData(display);
      })
      .catch((err) => {
        if (!cancelled) {
          setFaceitData(null);
          setFaceitError(err instanceof Error ? err.message : "Failed to load FACEIT");
        }
      })
      .finally(() => {
        if (!cancelled) setFaceitLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [player?.steamId, faceitGame]);

  useEffect(() => {
    const steam64 = player?.steamId;
    if (!steam64) {
      setLeetifyData(null);
      setLeetifyError(null);
      return;
    }
    let cancelled = false;
    setLeetifyLoading(true);
    setLeetifyError(null);
    setLeetifyData(null);
    fetch(`/api/leetify/profile?steam64=${encodeURIComponent(steam64)}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("Leetify profile not found"))))
      .then((profile) => {
        if (!cancelled) setLeetifyData(parseLeetifyDisplay(profile, steam64));
      })
      .catch((err) => {
        if (!cancelled) setLeetifyError(err.message ?? "Failed to load Leetify");
      })
      .finally(() => {
        if (!cancelled) setLeetifyLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [player?.steamId]);

  const scrollToNeok = () => {
    setActiveTab("neok");
    requestAnimationFrame(() => leetifyRef.current?.scrollIntoView({ behavior: "smooth" }));
  };
  const scrollToSkill = () => skillRef.current?.scrollIntoView({ behavior: "smooth" });

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[70vh]">
        <span className="text-muted text-sm">Loading player…</span>
      </div>
    );
  }

  if (error || !player) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-12 text-center">
        <p className="text-muted">{error ?? "Player not found."}</p>
        <Link href="/" className="mt-4 inline-block text-accent hover:underline text-sm">
          Back to home
        </Link>
      </div>
    );
  }

  const displayName = player.displayName ?? "Unknown";
  const avatarUrl = player.avatarFull ?? player.avatarMedium ?? player.avatar ?? "";
  const steamProfileUrl = player.profileUrl ?? `https://steamcommunity.com/profiles/${player.steamId}`;

  return (
    <ProfileWithSidePromos>
      <PlayerSearchBar
        variant="page"
        className="mb-4 sm:mb-6"
        currentQuery={player.displayName ?? player.steamId}
      />
      <div className="grid grid-cols-1 items-start gap-4 sm:gap-6 lg:grid-cols-3">
      {/* Left column: scroll buttons + player card */}
      <div className="flex flex-col gap-2">

        <div className="bg-card text-card-foreground rounded-xl border border-border py-6 shadow-sm lg:col-span-1 flex flex-col">
          <div className="flex flex-col items-center text-center px-6 gap-1.5">
            <div className="relative size-32">
              {avatarUrl ? (
                <span className="relative flex shrink-0 overflow-hidden size-32 border border-border rounded-3xl">
                  <Image
                    src={avatarUrl}
                    alt={`${displayName} avatar`}
                    width={128}
                    height={128}
                    className="aspect-square size-full object-cover"
                    unoptimized={avatarUrl.includes("steam")}
                  />
                </span>
              ) : (
                <span className="flex size-32 items-center justify-center rounded-3xl border border-border bg-muted text-2xl font-semibold text-muted">
                  {displayName.charAt(0).toUpperCase()}
                </span>
              )}
            </div>
            <h1 className="font-semibold text-2xl text-foreground">{displayName}</h1>
            <ProfileViewCount steamId={player.steamId} />
            <p className="text-sm text-muted">Player profile</p>
          </div>

          <div className="w-full flex items-center justify-center my-2" />

          <div className="px-6 space-y-4 flex flex-col">
            <div className="space-y-4">
              <div className="w-full flex flex-wrap justify-center gap-x-6">
                <a
                  href={steamProfileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="size-10 flex border rounded-xl justify-center items-center bg-card hover:scale-105 transition-all duration-200 border-border hover:border-accent/50"
                  aria-label={`${displayName}'s Steam Profile`}
                  title="Steam Profile"
                >
                  <Image
                    src="/images/svg/steam.svg"
                    alt="Steam"
                    width={20}
                    height={20}
                    className="size-5"
                  />
                </a>
                <a
                  href={`https://csstats.gg/player/${player.steamId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="size-10 flex border rounded-xl justify-center items-center bg-card hover:scale-105 transition-all duration-200 border-border hover:border-accent/50"
                  aria-label="CSStats Profile"
                  title="CSStats"
                >
                  <Image
                    src="/images/svg/csstats.svg"
                    alt="CSStats"
                    width={20}
                    height={20}
                    className="size-5"
                  />
                </a>
                <a
                  href={`https://leetify.com/app/profile/${player.steamId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="size-10 flex border rounded-xl justify-center items-center bg-card hover:scale-105 transition-all duration-200 border-border hover:border-accent/50"
                  aria-label="Leetify Profile"
                  title="Leetify"
                >
                  <Image
                    src="/images/svg/leetify.svg"
                    alt="Leetify"
                    width={20}
                    height={20}
                    className="size-5"
                  />
                </a>
                {faceitData && (
                  <a
                    href={faceitData.faceitProfileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="size-10 flex border rounded-xl justify-center items-center bg-card hover:scale-105 transition-all duration-200 border-border hover:border-accent/50"
                    aria-label="FACEIT Profile"
                    title="FACEIT"
                  >
                    <Image
                      src="/images/svg/faceit.svg"
                      alt="FACEIT"
                      width={20}
                      height={20}
                      className="size-5"
                    />
                  </a>
                )}
              </div>

              <div id="player-ranks" className="grid grid-cols-2 gap-4">
                {(() => {
                  const premierRating = profileStats?.premier ?? null;
                  const faceitElo = profileStats?.faceitElo ?? faceitData?.elo ?? null;
                  const faceitLevel = levelFromElo(faceitElo);
                  const faceitBadge = faceitLevelBadgePath(faceitLevel);
                  return (
                    <>
                      <div
                        className="max-h-12 flex items-center justify-center px-2 py-2 bg-background/80 rounded-lg border border-border overflow-hidden"
                        title="CS2 Premier rating"
                      >
                        <PremierRatingBadge rating={premierRating} height={28} size="md" />
                      </div>
                      <div
                        className="max-h-12 flex items-center justify-between px-3 py-2 bg-background/80 rounded-lg border border-border"
                        title="FACEIT level & ELO"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          {faceitBadge ? (
                            <Image
                              src={faceitBadge}
                              alt={`FACEIT level ${faceitLevel}`}
                              width={64}
                              height={64}
                              quality={100}
                              priority
                              unoptimized
                              className="size-8 object-contain rounded"
                            />
                          ) : (
                            <span className="size-8 rounded-md bg-muted/40" aria-hidden />
                          )}
                          <span className="text-sm font-medium text-muted">
                            {faceitLevel > 0 ? `Lvl ${faceitLevel}` : "Unranked"}
                          </span>
                        </div>
                        <span className="text-sm font-semibold tabular-nums">
                          {faceitElo ? `${Math.round(faceitElo).toLocaleString("en-US")}` : "—"}
                        </span>
                      </div>
                    </>
                  );
                })()}
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="border px-3 py-2.5 bg-background/80 rounded-lg flex flex-col gap-1">
                  <span className="text-muted text-md">Member Since</span>
                  <span className="font-medium">{formatDate(player.timeCreated)}</span>
                </div>
                <div className="border px-3 py-2.5 bg-background/80 rounded-lg flex flex-col gap-1">
                  <span className="text-muted text-md">Friends</span>
                  <span className="font-medium flex items-center gap-1">
                    <HiLockClosed className="size-3 text-muted" aria-hidden />
                    Private
                  </span>
                </div>
                <div className="border px-3 py-2.5 bg-background/80 rounded-lg flex flex-col gap-1">
                  <span className="text-muted text-md">Est. Playtime</span>
                  {profileStats?.playtimePrivate ? (
                    <span className="font-medium flex items-center gap-1">
                      <HiLockClosed className="size-3 text-muted" aria-hidden />
                      Private
                    </span>
                  ) : profileStats?.estPlaytimeMinutes != null ? (
                    <span className="font-medium flex items-center gap-1.5">
                      {formatSteamPlaytimeHours(profileStats.estPlaytimeMinutes)}
                      <HiClock className="size-3 text-muted" aria-hidden title="From Steam (CS2 / CS:GO)" />
                    </span>
                  ) : (
                    <span className="font-medium">—</span>
                  )}
                </div>
                <div className="border px-3 py-2.5 bg-background/80 rounded-lg flex flex-col gap-1">
                  <span className="text-muted text-md">Last 2 Weeks</span>
                  {profileStats?.playtimePrivate ? (
                    <span className="font-medium flex items-center gap-1">
                      <HiLockClosed className="size-3 text-muted" aria-hidden />
                      Private
                    </span>
                  ) : profileStats?.playtime2WeeksMinutes != null ? (
                    <span className="font-medium">
                      {formatSteamPlaytimeHours(profileStats.playtime2WeeksMinutes)}
                    </span>
                  ) : (
                    <span className="font-medium">—</span>
                  )}
                </div>
              </div>
            </div>

            <ProfileLastMatchFooter
              lastActivityAt={profileStats?.lastActivityAt}
              fallbackAt={player.updatedAt}
            />
            <ProfileRecentMatches
              steamId={player.steamId}
              premierRating={profileStats?.premier ?? null}
              faceitElo={profileStats?.faceitElo ?? faceitData?.elo ?? null}
              leetifyMatches={leetifyData?.recentMatches}
              premierMatches={leetifyData?.premierMatches}
              faceitMatches={faceitData?.recentMatches}
              sourcesLoading={leetifyLoading || faceitLoading}
            />
          </div>
        </div>
      </div>

      {/* Right column: tabs + stats cards */}
      <div className="lg:col-span-2 flex flex-col gap-6 h-full" ref={skillRef}>
        <div className="flex flex-col gap-2 w-full">
          <div
            role="tablist"
            aria-label="Stats sections"
            className="bg-muted/50 text-muted h-9 items-center rounded-lg p-[3px] grid w-full grid-cols-3"
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "leetify"}
              aria-controls="leetify-panel"
              id="leetify-tab"
              onClick={() => setActiveTab("leetify")}
              className={`inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center rounded-md border px-2 py-1 text-sm font-medium transition-colors ${
                activeTab === "leetify"
                  ? "bg-background text-foreground border-border shadow-sm"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              Leetify
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "faceit"}
              aria-controls="faceit-panel"
              id="faceit-tab"
              onClick={() => setActiveTab("faceit")}
              className={`inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center rounded-md border px-2 py-1 text-sm font-medium transition-colors ${
                activeTab === "faceit"
                  ? "bg-background text-foreground border-border shadow-sm"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              FACEIT
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "neok"}
              aria-controls="neok-panel"
              id="neok-tab"
              onClick={() => setActiveTab("neok")}
              className={`inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center rounded-md border px-2 py-1 text-sm font-medium transition-colors ${
                activeTab === "neok"
                  ? "bg-background text-foreground border-border shadow-sm"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              Neok AI
            </button>
          </div>

          <div
            id="neok-panel"
            role="tabpanel"
            aria-labelledby="neok-tab"
            hidden={activeTab !== "neok"}
            className="flex-1 outline-none space-y-4"
          >
            <DemoAnalyticsLeetifyCard
              ref={leetifyRef}
              steamId={player?.steamId ?? null}
              premierRating={profileStats?.premier ?? null}
              faceitElo={profileStats?.faceitElo ?? faceitData?.elo ?? null}
            />
          </div>

          <div
            id="faceit-panel"
            role="tabpanel"
            aria-labelledby="faceit-tab"
            hidden={activeTab !== "faceit"}
            className="flex-1 outline-none space-y-4"
          >
            <FaceitStatisticsSection
              faceitData={faceitData}
              loading={faceitLoading}
              error={faceitError}
              game={faceitGame}
              availableGames={faceitAvailable}
              onGameChange={setFaceitGame}
            />
          </div>

          <div
            id="leetify-panel"
            role="tabpanel"
            aria-labelledby="leetify-tab"
            hidden={activeTab !== "leetify"}
            className="flex-1 outline-none space-y-4"
          >
            <LeetifyStatisticsSection
              leetifyData={leetifyData}
              loading={leetifyLoading}
              error={leetifyError}
            />
          </div>
        </div>
      </div>
    </div>
    </ProfileWithSidePromos>
  );
}
