import { NextRequest, NextResponse } from "next/server";

type BucketEntry = {
  count: number;
  resetAt: number;
};

/** In-memory fixed window. Fine for a single Next.js process (typical PM2 setup). */
const buckets = new Map<string, BucketEntry>();

const MAX_KEYS = 20_000;

export type RateLimitBucket =
  | "steam"
  | "faceit"
  | "leetify"
  | "analytics"
  | "valve"
  | "valve_write"
  | "valve_chunk"
  | "auth"
  | "profile"
  | "api";

type BucketConfig = {
  limit: number;
  windowMs: number;
};

const DEFAULTS: Record<RateLimitBucket, BucketConfig> = {
  steam: { limit: 30, windowMs: 60_000 },
  faceit: { limit: 60, windowMs: 60_000 },
  leetify: { limit: 40, windowMs: 60_000 },
  analytics: { limit: 30, windowMs: 60_000 },
  valve: { limit: 20, windowMs: 60_000 },
  valve_write: { limit: 5, windowMs: 60_000 },
  /** ~50 chunks for a 400 MB demo @ 8 MB; allow headroom for retries. */
  valve_chunk: { limit: 120, windowMs: 60_000 },
  auth: { limit: 20, windowMs: 60_000 },
  profile: { limit: 60, windowMs: 60_000 },
  api: { limit: 120, windowMs: 60_000 },
};

function envInt(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function configFor(bucket: RateLimitBucket): BucketConfig {
  const base = DEFAULTS[bucket];
  const prefix = `RATE_LIMIT_${bucket.toUpperCase()}`;
  return {
    limit: envInt(`${prefix}_LIMIT`, base.limit),
    windowMs: envInt(`${prefix}_WINDOW_MS`, base.windowMs),
  };
}

export function rateLimitEnabled(): boolean {
  const raw = (process.env.RATE_LIMIT_ENABLED ?? "true").trim().toLowerCase();
  return raw !== "0" && raw !== "false" && raw !== "off" && raw !== "no";
}

/** Best-effort client IP behind Cloudflare / reverse proxy / direct. */
export function getClientIp(request: NextRequest): string {
  const cf = request.headers.get("cf-connecting-ip")?.trim();
  if (cf) return cf;

  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;

  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }

  return "unknown";
}

export type RateLimitResult = {
  ok: boolean;
  limit: number;
  remaining: number;
  retryAfterSec: number;
  resetAt: number;
};

function pruneIfNeeded(now: number): void {
  if (buckets.size < MAX_KEYS) return;
  for (const [key, entry] of buckets) {
    if (entry.resetAt <= now) buckets.delete(key);
    if (buckets.size < MAX_KEYS * 0.8) break;
  }
  // Hard cap: drop oldest-ish keys if still over limit
  if (buckets.size >= MAX_KEYS) {
    let n = 0;
    for (const key of buckets.keys()) {
      buckets.delete(key);
      if (++n > 1000) break;
    }
  }
}

/**
 * Fixed-window counter per `key` (usually `${bucket}:${ip}`).
 * Returns whether the request is allowed.
 */
export function checkRateLimit(key: string, bucket: RateLimitBucket): RateLimitResult {
  const { limit, windowMs } = configFor(bucket);
  const now = Date.now();
  pruneIfNeeded(now);

  let entry = buckets.get(key);
  if (!entry || entry.resetAt <= now) {
    entry = { count: 0, resetAt: now + windowMs };
    buckets.set(key, entry);
  }

  entry.count += 1;
  const remaining = Math.max(0, limit - entry.count);
  const retryAfterSec = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));

  if (entry.count > limit) {
    return {
      ok: false,
      limit,
      remaining: 0,
      retryAfterSec,
      resetAt: entry.resetAt,
    };
  }

  return {
    ok: true,
    limit,
    remaining,
    retryAfterSec: 0,
    resetAt: entry.resetAt,
  };
}

function applyRateLimitHeaders(res: NextResponse, result: RateLimitResult): NextResponse {
  res.headers.set("X-RateLimit-Limit", String(result.limit));
  res.headers.set("X-RateLimit-Remaining", String(result.remaining));
  res.headers.set("X-RateLimit-Reset", String(Math.ceil(result.resetAt / 1000)));
  if (!result.ok) {
    res.headers.set("Retry-After", String(result.retryAfterSec));
  }
  return res;
}

/** 429 JSON response with standard rate-limit headers. */
export function rateLimitResponse(result: RateLimitResult): NextResponse {
  return applyRateLimitHeaders(
    NextResponse.json(
      {
        error: "Too many requests",
        detail: "Rate limit exceeded. Please wait and try again.",
        retryAfterSec: result.retryAfterSec,
      },
      { status: 429 }
    ),
    result
  );
}

/**
 * Enforce a bucket for this request.
 * Returns a 429 response if limited, otherwise null (caller continues).
 */
export function enforceRateLimit(
  request: NextRequest,
  bucket: RateLimitBucket,
  identity?: string
): NextResponse | null {
  if (!rateLimitEnabled()) return null;

  const id = (identity ?? getClientIp(request)).trim() || "unknown";
  const result = checkRateLimit(`${bucket}:${id}`, bucket);
  if (!result.ok) return rateLimitResponse(result);
  return null;
}
