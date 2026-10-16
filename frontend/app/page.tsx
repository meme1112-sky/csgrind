"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  HiChartBar,
  HiFilm,
  HiClipboardList,
  HiCheck,
  HiSearch,
  HiCog,
  HiFire,
} from "react-icons/hi";
import { HiXMark } from "react-icons/hi2";
import TypingEffect from "./components/TypingEffect";
import { resolveSearchToSteamId64 } from "@/lib/playerSearch";
import { useLivePlayerSearch } from "@/lib/hooks/useLivePlayerSearch";
import {
  PlayerSearchPreviewCard,
  PlayerSearchSearching,
} from "@/components/player-search-preview";

const SEARCH_FORMATS = [
  { label: "CSGrind", example: "osteamcommunity.com/id/LeKoen", color: "bg-emerald-500/20 text-emerald-400" },
  { label: "Leetify", example: "leetify.com/app/profile/76561198043955928", color: "bg-pink-500/20 text-pink-400" },
  { label: "FACEIT", example: "www.faceit.com/en/players/neok", color: "bg-[#ff5500]/20 text-[#ff5500]" },
  { label: "SteamID", example: "76561198043955928", color: "bg-blue-500/20 text-blue-400" },
] as const;

const FEATURES = [
  { title: "Match stats & analytics", description: "Detailed performance data across maps, roles, and time. Know exactly how someone plays.", Icon: HiChartBar },
  { title: "Demo analysis", description: "Automatic demo parsing with integrity signals — plus manual Valve demo upload when Steam sync fails.", Icon: HiFilm },
  { title: "Multi-source profiles", description: "Steam, FACEIT, and Leetify stats in one place so you can review a player quickly.", Icon: HiClipboardList },
  { title: "Trust indicators", description: "Clear demo-based integrity signals so you can queue with more confidence.", Icon: HiCheck },
] as const;

export default function Home() {
  const router = useRouter();
  const [searchFocused, setSearchFocused] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitLoading, setSubmitLoading] = useState(false);

  const trimmedQuery = searchValue.trim();
  const liveEnabled = trimmedQuery.length > 0;
  const { searching, preview, error: liveError } = useLivePlayerSearch(
    searchValue,
    liveEnabled
  );

  const showFormats = searchFocused && !trimmedQuery;
  const showLivePanel = liveEnabled && (searching || !!preview);
  const dropdownOpen = showFormats || showLivePanel;
  const displayError = submitError ?? (liveEnabled && !searching ? liveError : null);

  const goToPlayer = (steamId: string) => {
    router.push(`/player/${steamId}`);
  };

  const handleSearchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    if (preview?.steamId) {
      goToPlayer(preview.steamId);
      return;
    }
    try {
      setSubmitLoading(true);
      const steamId = await resolveSearchToSteamId64(searchValue);
      goToPlayer(steamId);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setSubmitLoading(false);
    }
  };

  const clearSearch = () => {
    setSearchValue("");
    setSubmitError(null);
  };

  return (
    <div className="font-exo">
      <section className="relative -mt-14 flex absolute top-[50px] min-h-[calc(100svh)] flex-col justify-center overflow-hidden px-4 pb-16 pt-28 sm:-mt-16 sm:min-h-[calc(100svh)] sm:px-6 sm:pb-20 sm:pt-32">
        {/* <div className="absolute inset-0 z-0 bg-[url('/images/hero.webp')] bg-cover bg-[background-position: top center;] bg-no-repeat" /> */}
        <video
          className="absolute inset-0 z-0 size-full object-cover object-top"
          src="/images/hero%20banner.mp4"
          poster="/images/hero.webp"
          autoPlay
          muted
          loop
          playsInline
          aria-hidden
        />
        <div className="absolute bottom-0 left-0 right-0 z-0 h-[450px] bg-gradient-to-b from-background/0 via-background/85 to-background" />
        <div className="relative z-10 mx-auto mb-20 flex w-full max-w-2xl flex-col items-center justify-center">
          {/* <p className="mb-4 text-sm tracking-[0.2em] text-accent uppercase">
            Stats · Profiles · AI
          </p> */}
          <h1 className="text-center text-4xl font-semibold leading-[1.1] tracking-tight text-foreground sm:text-5xl md:text-5xl">
            Know who you <TypingEffect />
          </h1>
          <p className="mt-6 max-w-xl text-center text-base leading-relaxed text-white sm:text-lg">
            Transparent player profiles powered by match stats, FACEIT, Leetify, and demo analysis.
            Review performance before you queue.
          </p>
          <form className="mt-10 flex flex-wrap gap-4 w-full relative" onSubmit={handleSearchSubmit}>
            <div className="relative w-full">
              <HiSearch
                className="pointer-events-none absolute top-1/2 left-4 z-10 size-5 -translate-y-1/2 text-muted"
                aria-hidden
              />
              <input
                type="text"
                value={searchValue}
                onChange={(e) => {
                  setSearchValue(e.target.value);
                  if (submitError) setSubmitError(null);
                }}
                placeholder="Enter SteamID64, CSGrind link, FACEIT profile, or Leetify link..."
                className="w-full min-w-0 rounded-full border border-border bg-card/80 py-3.5 pr-12 pl-12 text-base text-foreground shadow-lg shadow-black/20 placeholder:text-muted backdrop-blur-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-accent"
                disabled={submitLoading}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setTimeout(() => setSearchFocused(false), 150)}
                aria-expanded={dropdownOpen}
                aria-haspopup="listbox"
                aria-autocomplete="list"
                aria-invalid={!!displayError}
                aria-describedby={displayError ? "search-error" : undefined}
                autoComplete="off"
                spellCheck={false}
              />
              {trimmedQuery ? (
                <button
                  type="button"
                  onClick={clearSearch}
                  className="absolute top-1/2 right-3 z-10 flex size-8 -translate-y-1/2 items-center justify-center rounded-full text-muted transition-colors hover:bg-muted/40 hover:text-foreground"
                  aria-label="Clear search"
                >
                  <HiXMark className="size-5" aria-hidden />
                </button>
              ) : null}
            </div>
            {displayError && (
              <p id="search-error" className="w-full text-sm text-rose-500 -mt-2" role="alert">
                {displayError}
              </p>
            )}
            <div
              className="absolute top-[60px] left-0 right-0 mt-1 z-20 origin-top"
              aria-hidden={!dropdownOpen}
            >
              {showFormats ? (
                <div
                  className={`rounded-lg border border-border bg-card shadow-xl overflow-hidden transition-all duration-200 ease-out ${
                    searchFocused
                      ? "opacity-100 translate-y-0 scale-100 pointer-events-auto"
                      : "opacity-0 -translate-y-2 scale-[0.98] pointer-events-none"
                  }`}
                  role="menu"
                  onMouseDown={(e) => e.preventDefault()}
                >
                  <div className="p-4 border-b border-border">
                    <div className="flex items-center gap-2 text-foreground font-medium">
                      <HiFire className="size-5 shrink-0 text-accent sm:size-5" aria-hidden />
                      <span>Supported Search Formats</span>
                    </div>
                    <ul className="mt-3 space-y-2">
                      {SEARCH_FORMATS.map(({ label, example, color }) => (
                        <li key={label} className="flex items-center gap-3">
                          <span
                            className={`inline-flex w-20 shrink-0 justify-center px-2 py-0.5 rounded text-xs font-medium ${color}`}
                          >
                            {label}
                          </span>
                          <span className="min-w-0 flex-1 truncate rounded bg-muted/50 px-2 py-1 font-mono text-xs text-muted sm:text-sm">
                            {example}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-border bg-muted/20 px-4 py-3 text-xs text-muted sm:text-sm">
                    <HiCog className="size-4 text-accent shrink-0" aria-hidden />
                    <span>Player Insights</span>
                    <span aria-hidden>•</span>
                    <span>FACEIT Stats</span>
                    <span aria-hidden>•</span>
                    <span>Leetify</span>
                    <span aria-hidden>•</span>
                    <span>Demo Analysis</span>
                  </div>
                </div>
              ) : null}

              {showLivePanel ? (
                <div
                  className="transition-all duration-200 ease-out"
                  role="listbox"
                  aria-label="Search results"
                  onMouseDown={(e) => e.preventDefault()}
                >
                  {searching ? (
                    <PlayerSearchSearching />
                  ) : preview ? (
                    <PlayerSearchPreviewCard
                      preview={preview}
                      onSelect={goToPlayer}
                    />
                  ) : null}
                </div>
              ) : null}
            </div>
          </form>
          <div className="mt-12 w-full max-w-2xl grid grid-cols-1 sm:grid-cols-3 gap-6 sm:gap-8">
            <div className="text-center">
              <p className="text-2xl sm:text-3xl font-bold text-accent tabular-nums">18.6K+</p>
              <p className="mt-1 text-sm text-muted">Profiles analyzed</p>
            </div>
            <div className="text-center">
              <p className="text-2xl sm:text-3xl font-bold text-accent tabular-nums">142K+</p>
              <p className="mt-1 text-sm text-muted">Matches processed</p>
            </div>
            <div className="text-center">
              <p className="text-2xl sm:text-3xl font-bold text-accent tabular-nums">9.4K+</p>
              <p className="mt-1 text-sm text-muted">Demos parsed</p>
            </div>
          </div>
        </div>
      </section>

      <section className="relative px-4 py-24 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <p className="mb-2 text-sm tracking-widest text-accent uppercase">
            Why CSGrind
          </p>
          <h2 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            Everything you need to play with confidence
          </h2>
          <p className="mt-4 max-w-2xl text-muted">
            From match analytics to demo-based integrity signals — see the full picture before you queue.
          </p>
          <div className="mt-16 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((feature, i) => {
              const Icon = feature.Icon;
              return (
                <article
                  key={i}
                  className="group rounded-xl border border-border bg-card p-6 transition-all duration-200 hover:border-accent/40 hover:shadow-[0_0_24px_-4px_rgba(237,174,95,0.15)]"
                >
                  <Icon className="size-8 text-accent/90" aria-hidden />
                  <h3 className="mt-4 text-lg font-semibold text-foreground">
                    {feature.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted">
                    {feature.description}
                  </p>
                </article>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}
