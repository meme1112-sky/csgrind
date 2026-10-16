import { NextResponse } from "next/server";
import { internalApiHeaders } from "@/lib/internalApi";

const DEFAULT_BACKEND_TIMEOUT_MS = 25_000;

export function getBackendOrigin(): string {
  return (process.env.BACKEND_URL || "http://localhost:3001").replace(/\/$/, "");
}

export function getBackendFetchTimeoutMs(): number {
  const raw = process.env.BACKEND_FETCH_TIMEOUT_MS;
  if (!raw) return DEFAULT_BACKEND_TIMEOUT_MS;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_BACKEND_TIMEOUT_MS;
  return Math.min(n, 120_000);
}

function isTimeoutLike(e: unknown): boolean {
  if (!(e instanceof Error)) return false;
  if (e.name === "TimeoutError" || e.name === "AbortError") return true;
  const cause = "cause" in e ? (e as Error & { cause?: unknown }).cause : undefined;
  if (cause instanceof Error && (cause.name === "TimeoutError" || cause.name === "AbortError")) {
    return true;
  }
  return /timeout|timed out|abort/i.test(e.message);
}

/**
 * GET JSON from the Node backend (FaceIT proxy, etc.) with a hard upper bound on wait time.
 */
export async function backendJsonGet(pathWithLeadingSlash: string): Promise<NextResponse> {
  const path = pathWithLeadingSlash.startsWith("/") ? pathWithLeadingSlash : `/${pathWithLeadingSlash}`;
  const url = `${getBackendOrigin()}${path}`;
  try {
    const res = await fetch(url, {
      headers: internalApiHeaders({ Accept: "application/json" }),
      signal: AbortSignal.timeout(getBackendFetchTimeoutMs()),
      cache: "no-store",
    });
    const data = await res.text();
    const status = res.ok ? res.status : res.status >= 400 ? res.status : 500;
    return new NextResponse(data, {
      status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const timeout = isTimeoutLike(e);
    return NextResponse.json(
      {
        error: timeout ? "backend timeout" : "backend fetch failed",
        detail: msg,
      },
      { status: timeout ? 504 : 502 }
    );
  }
}
