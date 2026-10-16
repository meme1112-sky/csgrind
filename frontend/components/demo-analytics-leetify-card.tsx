"use client";

import { forwardRef, useEffect, useMemo, useState } from "react";
import {
  earliestPlayedAt,
  fetchAnalyticsBySteam,
  fetchAnalyticsJob,
  formatIsoDateShort,
  type AnalyticsBySteamPayload,
} from "@/lib/analyticsBySteam";
import {
  ALWAYS_FEATURED_INTEGRITY_IDS,
  computeIntegritySignals,
  DEMOTE_FROM_FEATURED_INTEGRITY_IDS,
  FEATURED_INTEGRITY_ORDER,
  INTEGRITY_MIN_MATCHES,
  integrityStatusClass,
  integrityStatusLabel,
  type IntegritySignal,
} from "@/lib/integritySignals";
import { resolveEffectiveRiskBracket } from "@/lib/riskBracketResolve";

type Props = {
  steamId: string | null;
  premierRating?: number | null;
  faceitElo?: number | null;
};

function emptyDemoMessage(
  data: AnalyticsBySteamPayload | null,
  refreshing: boolean
): { title: string; body: string } | null {
  if (data?.status === "unavailable") {
    return {
      title: "Demo analytics unavailable",
      body: "Recent FACEIT demos are missing or expired on FACEIT's servers. You can still unlock Premier matches via Valve sync or manual demo upload.",
    };
  }

  if (refreshing || data?.status === "refreshing") {
    return {
      title: "No parsed demos yet",
      body: "FACEIT and Premier demos are downloading and parsing in the background. This can take a few minutes for the first load.",
    };
  }

  const pipeline = data?.pipeline;

  if (!pipeline?.faceit_player_id && !pipeline?.valve_mm?.linked) {
    return {
      title: "No parsed demos yet",
      body: "Link Steam to FACEIT, submit Valve match codes, or upload a Premier .dem to enable integrity analysis.",
    };
  }

  if (!pipeline?.faceit_player_id && pipeline?.valve_mm?.linked) {
    return {
      title: "No parsed Valve demos yet",
      body: "Valve match history is linked. Demos are syncing — or upload a .dem on the Valve link page if Steam has no download URL.",
    };
  }

  return {
    title: "No parsed demos yet",
    body: "No downloadable FACEIT demos were found. Play more FACEIT, sync Valve matches, or upload a Premier demo.",
  };
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

type RiskBand = "normal" | "caution" | "danger" | "unknown" | null | undefined;

function BandBadge({ band }: { band: RiskBand }) {
  if (!band || band === "unknown") return null;
  const cfg = {
    normal: { label: "Reasonable", className: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" },
    caution: { label: "Caution", className: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
    danger: { label: "Suspicious", className: "bg-rose-500/15 text-rose-600 dark:text-rose-400" },
  }[band];
  if (!cfg) return null;
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold leading-none ${cfg.className}`}>
      {cfg.label}
    </span>
  );
}

function TrustVerdict({
  score,
  band,
  bracketLabel,
  matchCount,
  lowConfidence,
}: {
  score: number | null;
  band?: RiskBand;
  bracketLabel: string | null | undefined;
  matchCount: number;
  lowConfidence: boolean;
}) {
  const showScore = band !== "normal" && score != null && Number.isFinite(score);
  const s = showScore ? Math.max(0, Math.min(100, score)) : null;
  const ringFill = s != null ? s / 100 : band === "normal" ? 1 : 0;
  const size = 96;
  const stroke = 10;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = c * clamp01(ringFill);

  const tone =
    band === "danger"
      ? "text-rose-500"
      : band === "caution"
        ? "text-amber-500"
        : "text-emerald-500";

  const centerLabel =
    band === "normal" ? "OK" : s != null ? String(Math.round(s)) : "—";

  return (
    <div className="rounded-lg border border-border bg-muted/20 p-4 sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="relative mx-auto sm:mx-0 w-[96px] h-[96px] shrink-0">
          <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="block">
            <circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke="hsl(var(--muted))"
              strokeWidth={stroke}
              opacity={0.6}
            />
            <circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke="currentColor"
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={`${dash} ${c - dash}`}
              className={`${tone} transition-all`}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div className={`text-2xl font-semibold leading-none tabular-nums ${tone}`}>{centerLabel}</div>
            <div className="text-[10px] text-muted-foreground leading-none mt-1 uppercase tracking-wide">Trust</div>
          </div>
        </div>

        <div className="min-w-0 flex-1 space-y-2 text-center sm:text-left">
          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
            <h3 className="text-base font-semibold text-card-foreground">Integrity verdict</h3>
            <BandBadge band={band} />
          </div>
          <p className="text-sm text-muted-foreground leading-snug">
            {band === "normal"
              ? "No suspicious demo patterns for this Premier bracket."
              : band === "caution"
                ? "Some metrics sit outside the typical band — review signals below."
                : band === "danger"
                  ? "One or more demo metrics look implausible for this skill bracket."
                  : "Integrity check from parsed FACEIT demos."}
          </p>
          <div className="flex flex-wrap justify-center sm:justify-start gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {bracketLabel ? <span>{bracketLabel}</span> : null}
            <span>
              {matchCount} demo{matchCount === 1 ? "" : "s"} analyzed
            </span>
            {lowConfidence ? (
              <span className="text-amber-600 dark:text-amber-400 font-medium">
                Provisional (under {INTEGRITY_MIN_MATCHES} demos)
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function IntegritySignalRow({ signal }: { signal: IntegritySignal }) {
  return (
    <div className="flex items-start gap-3 py-3 border-b border-border last:border-0">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-card-foreground">{signal.label}</span>
          <span
            className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold leading-none ${integrityStatusClass(signal.status)}`}
          >
            {integrityStatusLabel(signal.status)}
          </span>
        </div>
        <p className="text-xs text-muted-foreground mt-1 leading-snug">{signal.detail}</p>
      </div>
      <div className="text-[11px] font-mono tabular-nums text-card-foreground shrink-0 pt-0.5">{signal.value}</div>
    </div>
  );
}

function mergeFeaturedSignals(primary: IntegritySignal[], all: IntegritySignal[]): IntegritySignal[] {
  const byId = new Map(all.map((s) => [s.id, s]));
  const seen = new Set<string>();
  const merged: IntegritySignal[] = [];

  // Prefer client-requested order for always-featured metrics.
  for (const id of FEATURED_INTEGRITY_ORDER) {
    const s = byId.get(id);
    if (s && !seen.has(s.id)) {
      merged.push(s);
      seen.add(s.id);
    }
  }

  for (const s of primary) {
    if (!seen.has(s.id) && !DEMOTE_FROM_FEATURED_INTEGRITY_IDS.has(s.id)) {
      merged.push(s);
      seen.add(s.id);
    }
  }

  for (const s of all) {
    if (ALWAYS_FEATURED_INTEGRITY_IDS.has(s.id) && !seen.has(s.id)) {
      merged.push(s);
      seen.add(s.id);
    }
  }

  return merged;
}

function featuredPrimarySignals(signals: IntegritySignal[]): IntegritySignal[] {
  const flagged = signals.filter(
    (s) =>
      (s.status === "caution" || s.status === "suspicious") &&
      !DEMOTE_FROM_FEATURED_INTEGRITY_IDS.has(s.id)
  );
  const notable = signals.filter(
    (s) => s.status === "elite" || ((s.id === "ttd" || s.id === "preaim") && s.status === "normal")
  );
  return flagged.length > 0
    ? flagged
    : notable.length > 0
      ? notable
      : signals.filter(
          (s) => s.status !== "normal" && !DEMOTE_FROM_FEATURED_INTEGRITY_IDS.has(s.id)
        ).slice(0, 4);
}

function IntegritySignalsList({ signals }: { signals: IntegritySignal[] }) {
  const rows = mergeFeaturedSignals(featuredPrimarySignals(signals), signals);

  if (!rows.length) {
    return (
      <p className="text-sm text-muted-foreground py-2">Not enough demo data to evaluate integrity signals yet.</p>
    );
  }

  return (
    <div className="divide-y divide-border">
      {rows.map((s) => (
        <IntegritySignalRow key={s.id} signal={s} />
      ))}
    </div>
  );
}

function featuredSignalIds(signals: IntegritySignal[]): Set<string> {
  return new Set(mergeFeaturedSignals(featuredPrimarySignals(signals), signals).map((s) => s.id));
}

function AllSignalsTable({ signals }: { signals: IntegritySignal[] }) {
  const [open, setOpen] = useState(false);
  const remaining = signals.filter((s) => !featuredSignalIds(signals).has(s.id));
  if (!remaining.length) return null;

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-xs text-muted-foreground hover:text-card-foreground underline-offset-2 hover:underline"
      >
        {open ? "Hide" : "Show"} remaining integrity signals ({remaining.length})
      </button>
      {open ? (
        <div className="mt-2 rounded-md border border-border bg-muted/10 px-3">
          {remaining.map((s) => (
            <IntegritySignalRow key={s.id} signal={s} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export const DemoAnalyticsLeetifyCard = forwardRef<HTMLDivElement, Props>(function DemoAnalyticsLeetifyCard(
  { steamId, premierRating, faceitElo },
  ref
) {
  const [data, setData] = useState<AnalyticsBySteamPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!steamId) {
      setData(null);
      setError(null);
      setLoading(false);
      setRefreshing(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setData(null);
    setRefreshing(false);
    fetchAnalyticsBySteam(steamId, { signal: controller.signal, premierRating, faceitElo })
      .then((payload) => setData(payload))
      .catch((e: unknown) => {
        if (controller.signal.aborted) return;
        setError(e instanceof Error ? e.message : "Failed to load demo analytics");
      })
      .finally(() => {
        if (controller.signal.aborted) return;
        setLoading(false);
      });
    return () => controller.abort();
  }, [steamId, premierRating, faceitElo]);

  const jobTaskId = data?.job?.task_id;
  const jobState = data?.job?.state;
  const analyticsStatus = data?.status;
  useEffect(() => {
    const shouldPoll =
      steamId &&
      jobTaskId &&
      (jobState === "queued" || analyticsStatus === "refreshing");
    if (!shouldPoll) return;

    const controller = new AbortController();
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    setRefreshing(true);

    const poll = async () => {
      try {
        const status = await fetchAnalyticsJob(jobTaskId, { signal: controller.signal });
        if (cancelled) return;
        if (status.ready) {
          const fresh = await fetchAnalyticsBySteam(steamId, {
            signal: controller.signal,
            premierRating,
            faceitElo,
            refresh: false,
          });
          if (cancelled) return;
          setData(fresh);
          setRefreshing(false);
          return;
        }
        timer = setTimeout(poll, 4000);
      } catch {
        if (!cancelled) setRefreshing(false);
      }
    };
    timer = setTimeout(poll, 3000);

    return () => {
      cancelled = true;
      controller.abort();
      if (timer) clearTimeout(timer);
      setRefreshing(false);
    };
  }, [steamId, jobTaskId, jobState, analyticsStatus, premierRating, faceitElo]);

  const rollup = data?.rollup;
  const coverage = data?.coverage;
  const matches = data?.matches;
  const pipeline = data?.pipeline;

  const trustScore: number | null =
    rollup?.trust_rating != null && Number.isFinite(rollup.trust_rating)
      ? rollup.trust_rating
      : null;
  const riskBand: RiskBand = rollup?.risk_band ?? null;

  const bracket = useMemo(
    () => resolveEffectiveRiskBracket(premierRating, faceitElo),
    [premierRating, faceitElo]
  );
  const premierRange =
    bracket.source !== "default"
      ? bracket.range
      : rollup?.premier_range ?? bracket.range;
  const bracketLabel =
    bracket.source !== "default"
      ? bracket.label
      : rollup?.premier_range
        ? `Premier ${rollup.premier_range}`
        : bracket.label;

  const matchesReturned = coverage?.matches_returned ?? matches?.length ?? 0;
  const lowConfidence = matchesReturned > 0 && matchesReturned < INTEGRITY_MIN_MATCHES;

  const integritySignals = useMemo(
    () =>
      computeIntegritySignals(
        rollup,
        premierRange,
        premierRating,
        steamId,
        null,
        matchesReturned,
        faceitElo
      ),
    [rollup, premierRange, premierRating, faceitElo, steamId, matchesReturned]
  );

  const flaggedCount = integritySignals.filter(
    (s) => s.status === "caution" || s.status === "suspicious"
  ).length;

  const faceitCount =
    coverage?.by_source?.faceit ??
    matches?.filter((m) => (m.source ?? "").toLowerCase() === "faceit").length ??
    0;
  const valveCount =
    coverage?.by_source?.valve ??
    matches?.filter((m) => {
      const s = (m.source ?? "").toLowerCase();
      return s === "valve" || s === "premier";
    }).length ??
    0;
  const sourceParts: string[] = [];
  if (faceitCount > 0) sourceParts.push(`${faceitCount} FACEIT`);
  if (valveCount > 0) sourceParts.push(`${valveCount} Premier`);
  const sourceLabel =
    sourceParts.length > 0 ? sourceParts.join(" + ") : `${matchesReturned} parsed`;

  const subtitle =
    data && !loading && !error
      ? matchesReturned > 0
        ? `Demo-derived integrity check from ${sourceLabel} match${matchesReturned === 1 ? "" : "es"} (TTD, crosshair, and more).`
        : refreshing || analyticsStatus === "refreshing"
          ? "Waiting for parsed demos — integrity check will run when demos are ready."
          : analyticsStatus === "unavailable"
            ? "FACEIT demos could not be loaded for integrity analysis."
            : "No parsed demos available for this player yet."
      : "Integrity analysis from parsed FACEIT and Premier demos.";

  const emptyState = emptyDemoMessage(data, refreshing);

  const oldest = useMemo(() => earliestPlayedAt(matches), [matches]);

  return (
    <div
      id="leetify-section"
      ref={ref}
      className="bg-card text-card-foreground gap-6 rounded-xl border border-border py-6 shadow-sm h-full flex flex-col"
    >
      <div className="px-4 sm:px-6">
        <div className="flex flex-row flex-wrap items-center gap-x-2">
          <h2 className="leading-none font-semibold">Neok AI Integrity</h2>
          {data?.display_name ? (
            <span className="text-sm text-muted font-medium">· {data.display_name}</span>
          ) : null}
        </div>
        <p className="text-muted text-sm mt-1">{subtitle}</p>
        {refreshing ? (
          <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" aria-hidden />
            Refreshing demos in the background…
          </p>
        ) : null}
      </div>

      <div className="px-4 sm:px-6 flex-1">
        {!steamId ? (
          <p className="text-muted text-sm">Steam ID required to run integrity check.</p>
        ) : loading ? (
          <div className="flex items-center justify-center min-h-[200px] text-muted text-sm">
            Running integrity check…
          </div>
        ) : error ? (
          <div className="rounded-lg border border-border bg-muted/20 p-4 text-sm text-rose-600 dark:text-rose-400">
            {error}
          </div>
        ) : matchesReturned === 0 && emptyState ? (
          <div className="rounded-lg border border-dashed border-border bg-muted/10 p-6 text-center text-sm text-muted-foreground space-y-2">
            <p className="font-medium text-card-foreground">{emptyState.title}</p>
            <p>{emptyState.body}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            <TrustVerdict
              score={trustScore}
              band={riskBand}
              bracketLabel={bracketLabel}
              matchCount={matchesReturned}
              lowConfidence={lowConfidence}
            />

            <div>
              <div className="flex items-center justify-between gap-2 mb-1">
                <h3 className="text-sm font-semibold text-card-foreground">Integrity signals</h3>
                {flaggedCount > 0 ? (
                  <span className="text-xs text-rose-600 dark:text-rose-400 font-medium">
                    {flaggedCount} flagged
                  </span>
                ) : (
                  <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">No flags</span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mb-2">
                Each signal is compared to the expected range for this skill bracket
                {bracket.source === "faceit" ? " (mapped from FACEIT Elo)" : ""}. Elite pre-aim is not a
                flag.
              </p>
              <div className="rounded-lg border border-border px-3">
                <IntegritySignalsList signals={integritySignals} />
              </div>
              <AllSignalsTable signals={integritySignals} />
            </div>
          </div>
        )}
      </div>

      {data && !error && matchesReturned > 0 ? (
        <details className="px-6 pt-4 border-t border-border group">
          <summary className="text-xs text-muted-foreground cursor-pointer hover:text-card-foreground list-none flex items-center gap-1">
            <span className="group-open:rotate-90 transition-transform inline-block">▸</span>
            Sample & pipeline details
          </summary>
          <div className="mt-2 space-y-1 text-xs text-muted-foreground">
            <p>Oldest demo: {formatIsoDateShort(oldest)}</p>
            {coverage?.maps_seen && coverage.maps_seen.length > 0 ? (
              <p>Maps: {coverage.maps_seen.slice(0, 8).join(", ")}</p>
            ) : null}
            <p>
              Sample mix: {faceitCount} FACEIT · {valveCount} Premier/Valve
              {pipeline?.valve_mm?.linked ? " · Valve linked" : ""}
            </p>
            {pipeline?.nickname ? <p>FACEIT: {pipeline.nickname}</p> : null}
            {rollup?.risk_band ? (
              <p className="font-mono text-[11px]">
                Risk band: {rollup.risk_band}
                {rollup.risk_score != null ? ` · score ${rollup.risk_score}` : ""}
                {rollup.time_to_damage != null
                  ? ` · TTD ${Math.round(rollup.time_to_damage)} ms`
                  : ""}
                {rollup.crosshair_placement != null
                  ? ` · pre-aim ${rollup.crosshair_placement.toFixed(2)}°`
                  : ""}
              </p>
            ) : null}
          </div>
        </details>
      ) : null}
    </div>
  );
});
