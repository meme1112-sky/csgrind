/** Response shape from GET /v1/analytics/by-steam/{steam_id} (extra-backend). */

export interface AnalyticsBySteamRollup {
  kd?: number | null;
  rating?: number | null;
  adr?: number | null;
  kast?: number | null;
  headshot_pct?: number | null;
  kills?: number | null;
  deaths?: number | null;
  impact?: number | null;
  time_to_damage?: number | null;
  crosshair_placement?: number | null;
  utility_damage?: number | null;
  kills_through_smokes?: number | null;
  opening_kills_won?: number | null;
  opening_kills_lost?: number | null;
  opening_win_pct?: number | null;
  knife_inspections?: number | null;
  multikills?: { "2k"?: number | null; "3k"?: number | null; "4k"?: number | null; "5k"?: number | null };
  risk_score?: number | null;
  trust_rating?: number | null;
  risk_band?: "normal" | "caution" | "danger" | "unknown" | null;
  premier_range?: string | null;
  premier_bracket_source?: "premier" | "faceit" | "default" | null;
  effective_premier_rating?: number | null;
}

export interface AnalyticsBySteamCoverage {
  matches_returned?: number;
  matches_scanned?: number;
  maps_seen?: string[];
  /** How many demos in the integrity window came from each pipeline. */
  by_source?: { faceit?: number; valve?: number };
}

/** Single metric from `categories[].metrics` (see csgrind_leetify_view_v1). */
export interface AnalyticsCategoryMetric {
  id: string;
  label: string;
  value: string | number | null;
  format?: string;
  unit?: string | null;
  tier?: string | null;
  description?: string | null;
}

export interface AnalyticsCategory {
  id: string;
  title: string;
  subtitle?: string;
  metrics?: AnalyticsCategoryMetric[];
}

export interface AnalyticsBySteamMatch {
  match_id?: string;
  map?: string | null;
  played_at?: string | null;
  source?: string | null;
  faceit_player_id?: string;
  score_us?: number | null;
  score_them?: number | null;
  outcome?: "W" | "L" | string | null;
  panels?: {
    combat?: {
      rating?: number | null;
      impact?: number | null;
      adr?: number | null;
      kd?: number;
      kast_pct?: number | null;
      kills?: number;
      deaths?: number;
      time_to_damage?: number | null;
      opening_kills_won?: number | null;
      opening_kills_lost?: number | null;
      multikills?: { "2k"?: number; "3k"?: number; "4k"?: number; "5k"?: number };
    };
    aim?: {
      headshot_pct?: number | null;
      headshot_kills?: number | null;
      crosshair_placement?: number | null;
      knife_inspections?: number | null;
    };
    utility?: {
      grenades_by_type?: Record<string, number>;
      utility_damage?: number | null;
      kills_through_smokes?: number | null;
    };
  };
  raw_stats?: {
    n_rounds?: number;
    kills?: number;
    deaths?: number;
    kast?: number | null;
    headshot_pct?: number | null;
    time_to_damage?: number | null;
    crosshair_placement?: number | null;
    knife_inspections?: number | null;
    utility_damage?: number | null;
    kills_through_smokes?: number | null;
    opening_kills_won?: number | null;
    opening_kills_lost?: number | null;
    multikills?: { "2k"?: number; "3k"?: number; "4k"?: number; "5k"?: number };
  };
}

export interface AnalyticsBySteamPipeline {
  faceit_player_id?: string | null;
  nickname?: string | null;
  valve_mm?: {
    linked?: boolean;
    steam_id?: string;
    latest_share_code?: string;
    last_sync_at?: string | null;
    matches_by_status?: Record<string, number>;
  };
  history_match_ids_found?: number | null;
  matches_processed_attempted?: number | null;
  process_errors?: string[];
  matches_by_status_for_player?: Record<string, number>;
  sample_row_errors?: string[];
}

/** Background refresh descriptor returned inline by GET /v1/analytics/by-steam. */
export interface AnalyticsRefreshJob {
  task_id?: string;
  /** "queued" (async), "done"/"eager" (ran inline), "error", or "skipped". */
  state?: string;
  eager?: boolean;
  error?: string;
  result?: unknown;
}

/** Response from GET /v1/analytics/jobs/{task_id} (Celery task state). */
export interface AnalyticsJobStatus {
  task_id: string;
  /** Celery state: PENDING | STARTED | SUCCESS | FAILURE | RETRY | REVOKED. */
  state: string;
  ready: boolean;
  successful?: boolean;
  result?: unknown;
  error?: string;
}

export interface AnalyticsBySteamPayload {
  version?: string;
  steam_id?: string;
  display_name?: string | null;
  rollup?: AnalyticsBySteamRollup;
  coverage?: AnalyticsBySteamCoverage;
  query?: { max_matches?: number; scan_recent?: number };
  categories?: AnalyticsCategory[];
  matches?: AnalyticsBySteamMatch[];
  pipeline?: AnalyticsBySteamPipeline;
  job?: AnalyticsRefreshJob;
  /** "ready" (cached data present), "refreshing" (empty, refresh running), "unavailable" (refresh done, no demos), or "empty". */
  status?: string;
}

/** Include enough demos so Premier/Valve uploads are not crowded out by FACEIT. */
const DEFAULT_QUERY = "max_matches=10&scan_recent=30";

function buildAnalyticsQuery(opts?: {
  premierRating?: number | null;
  faceitElo?: number | null;
  refresh?: boolean;
  maxMatches?: number;
  scanRecent?: number;
}): string {
  const params = new URLSearchParams(DEFAULT_QUERY);
  if (opts?.maxMatches != null && Number.isFinite(opts.maxMatches) && opts.maxMatches > 0) {
    params.set("max_matches", String(Math.min(20, Math.round(opts.maxMatches))));
  }
  if (opts?.scanRecent != null && Number.isFinite(opts.scanRecent) && opts.scanRecent > 0) {
    params.set("scan_recent", String(Math.min(50, Math.round(opts.scanRecent))));
  }
  const pr = opts?.premierRating;
  if (pr != null && Number.isFinite(pr) && pr >= 0) {
    params.set("premier_rating", String(Math.round(pr)));
  }
  const elo = opts?.faceitElo;
  if (elo != null && Number.isFinite(elo) && elo >= 0) {
    params.set("faceit_elo", String(Math.round(elo)));
  }
  // Read-only cache fetch (used while polling) must not enqueue another background refresh.
  if (opts?.refresh === false) {
    params.set("refresh", "false");
  }
  return params.toString();
}

function detailMessage(detail: unknown): string {
  if (typeof detail === "string") return detail;
  if (detail && typeof detail === "object" && "message" in detail) {
    const m = (detail as { message?: unknown }).message;
    if (typeof m === "string") return m;
  }
  try {
    return JSON.stringify(detail);
  } catch {
    return "Request failed";
  }
}

export async function fetchAnalyticsBySteam(
  steamId: string,
  opts?: {
    signal?: AbortSignal;
    premierRating?: number | null;
    faceitElo?: number | null;
    refresh?: boolean;
    maxMatches?: number;
    scanRecent?: number;
  }
): Promise<AnalyticsBySteamPayload> {
  const q = buildAnalyticsQuery(opts);
  const res = await fetch(`/api/v1/analytics/by-steam/${encodeURIComponent(steamId)}?${q}`, {
    cache: "no-store",
    signal: opts?.signal,
  });
  if (!res.ok) {
    let msg = res.statusText || `HTTP ${res.status}`;
    try {
      const j = (await res.json()) as { detail?: unknown; error?: string };
      if (j.detail !== undefined) msg = detailMessage(j.detail);
      else if (j.error) msg = j.error;
    } catch {
      try {
        const t = await res.text();
        if (t) msg = t.slice(0, 500);
      } catch {
        /* keep msg */
      }
    }
    throw new Error(msg);
  }
  return res.json() as Promise<AnalyticsBySteamPayload>;
}

/** Poll the background refresh enqueued by `fetchAnalyticsBySteam`. */
export async function fetchAnalyticsJob(
  taskId: string,
  opts?: { signal?: AbortSignal }
): Promise<AnalyticsJobStatus> {
  const res = await fetch(`/api/v1/analytics/jobs/${encodeURIComponent(taskId)}`, {
    cache: "no-store",
    signal: opts?.signal,
  });
  if (!res.ok) {
    let msg = res.statusText || `HTTP ${res.status}`;
    try {
      const t = await res.text();
      if (t) msg = t.slice(0, 500);
    } catch {
      /* keep msg */
    }
    throw new Error(msg);
  }
  return res.json() as Promise<AnalyticsJobStatus>;
}

/** Map HLTV-style rating (~0.6–1.4) to fill fraction for the ring. */
export function ratingToArcFill(rating: number): number {
  if (!Number.isFinite(rating)) return 0;
  return Math.min(1, Math.max(0, (rating - 0.55) / (1.45 - 0.55)));
}

export function formatIsoDateShort(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/**
 * KAST may be stored as a 0–1 fraction or 0–100 (rollup / per-match raw_stats).
 */
export function normalizeKastPct(raw: number | null | undefined): number | null {
  if (raw == null || !Number.isFinite(raw)) return null;
  if (raw >= 0 && raw <= 1) return raw * 100;
  return raw;
}

/**
 * Headshot share may be 0–1 (rollup) or already 0–100 (panels / some rollups).
 */
export function normalizeHeadshotPct(raw: number | null | undefined): number | null {
  if (raw == null || !Number.isFinite(raw)) return null;
  if (raw >= 0 && raw <= 1) return raw * 100;
  return raw;
}

export function findCategory(
  categories: AnalyticsCategory[] | undefined,
  id: string
): AnalyticsCategory | undefined {
  return categories?.find((c) => c.id === id);
}

export function findMetric(
  categories: AnalyticsCategory[] | undefined,
  categoryId: string,
  metricId: string
): AnalyticsCategoryMetric | undefined {
  const cat = findCategory(categories, categoryId);
  return cat?.metrics?.find((m) => m.id === metricId);
}

export function findMetricTier(
  categories: AnalyticsCategory[] | undefined,
  metricId: string
): string | undefined {
  for (const c of categories ?? []) {
    const m = c.metrics?.find((x) => x.id === metricId);
    if (m?.tier) return m.tier;
  }
  return undefined;
}

/** Format a category metric for read-only display (matches API `format` hints). */
export function formatCategoryMetricValue(m: AnalyticsCategoryMetric): string {
  const { value, format: fmt, unit } = m;
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value;
  if (!Number.isFinite(value)) return "—";
  if (m.id === "kast") {
    const p = normalizeKastPct(value);
    return p != null ? `${p.toFixed(1)}%` : "—";
  }
  if (fmt === "percent" || m.id === "headshot_pct" || m.id === "opening_win_pct") {
    const n = m.id === "opening_win_pct" ? value : normalizeHeadshotPct(value);
    return n != null && Number.isFinite(n) ? `${n.toFixed(1)}%` : "—";
  }
  if (fmt === "decimal") {
    // Tight units (°, %, x) render without a leading space; word units get a separating space.
    const tight = unit && /^[°%x]$/.test(unit);
    const u = unit ? (tight ? unit : ` ${unit}`) : "";
    const decimals = m.id === "rating" ? 3 : 2;
    return `${value.toFixed(decimals)}${u}`;
  }
  return String(value);
}

const MAX_PLAUSIBLE_GRENADES_PER_MATCH = 80;

/**
 * Always-allowed utility metrics added by the v2 payload (utility damage, smoke kills, opening duels).
 * For raw grenade-type rows we still apply a sanity cap because some demos report broken entity counts.
 */
const ALWAYS_VISIBLE_UTILITY_METRICS = new Set([
  "utility_damage",
  "kills_through_smokes",
]);

/** Utility metrics whose numeric value looks meaningful (filters out broken raw entity counts). */
export function plausibleUtilityMetrics(
  categories: AnalyticsCategory[] | undefined
): AnalyticsCategoryMetric[] {
  const util = findCategory(categories, "utility");
  if (!util?.metrics?.length) return [];
  return util.metrics.filter((m) => {
    if (typeof m.value !== "number" || !Number.isFinite(m.value) || m.value < 0) return false;
    if (ALWAYS_VISIBLE_UTILITY_METRICS.has(m.id)) return true;
    return m.value <= MAX_PLAUSIBLE_GRENADES_PER_MATCH;
  });
}

export function averageKillsPerRound(matches: AnalyticsBySteamMatch[] | undefined): string {
  if (!matches?.length) return "—";
  let sum = 0;
  let n = 0;
  for (const m of matches) {
    const kills = m.raw_stats?.kills;
    const rounds = m.raw_stats?.n_rounds;
    if (typeof kills === "number" && typeof rounds === "number" && rounds > 0) {
      sum += kills / rounds;
      n += 1;
    }
  }
  if (!n) return "—";
  return (sum / n).toFixed(2);
}

export function kdFormHistory(matches: AnalyticsBySteamMatch[] | undefined, limit = 12): { kd: number; mark: "W" | "L" }[] {
  if (!matches?.length) return [];
  const out: { kd: number; mark: "W" | "L" }[] = [];
  for (const m of matches) {
    if (out.length >= limit) break;
    const kd = m.panels?.combat?.kd;
    if (typeof kd !== "number" || !Number.isFinite(kd)) continue;
    out.push({ kd, mark: kd >= 1 ? "W" : "L" });
  }
  return out;
}

export function earliestPlayedAt(matches: AnalyticsBySteamMatch[] | undefined): string | null {
  if (!matches?.length) return null;
  let minT = Infinity;
  for (const m of matches) {
    const t = m.played_at ? new Date(m.played_at).getTime() : NaN;
    if (Number.isFinite(t) && t < minT) minT = t;
  }
  if (!Number.isFinite(minT)) return null;
  return new Date(minT).toISOString();
}
