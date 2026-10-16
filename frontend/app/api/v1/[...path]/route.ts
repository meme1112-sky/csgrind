import { NextRequest, NextResponse } from "next/server";
import { INTERNAL_TOKEN_HEADER, getInternalApiSecret } from "@/lib/internalApi";
import { enforceRateLimit } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

const BACKEND_URL = (process.env.BACKEND_URL || "http://localhost:3001").replace(/\/$/, "");

/** Long-running demo download + parse (extra-backend). */
const FORWARD_TIMEOUT_MS = 60 * 60 * 1000;

const PASSTHROUGH_HEADERS = ["content-type", "accept"] as const;

/** Browser-facing /api/v1 is read-only. Mutations go through dedicated BFF routes. */
const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

type RouteCtx = { params: Promise<{ path: string[] }> };

async function forward(request: NextRequest, segments: string[], method: string) {
  const limited = enforceRateLimit(request, "analytics");
  if (limited) return limited;

  if (WRITE_METHODS.has(method.toUpperCase())) {
    return NextResponse.json(
      {
        error: "Method not allowed",
        detail: "Write operations are not exposed on /api/v1. Use authenticated BFF routes.",
      },
      { status: 405 }
    );
  }

  if (!segments.length) {
    return NextResponse.json({ error: "missing path under /api/v1" }, { status: 400 });
  }

  const subpath = segments.map((s) => encodeURIComponent(s)).join("/");
  const search = request.nextUrl.search;
  const url = `${BACKEND_URL}/v1/${subpath}${search}`;

  const headers = new Headers();
  for (const name of PASSTHROUGH_HEADERS) {
    const v = request.headers.get(name);
    if (v) headers.set(name, v);
  }

  // Inject service token server-side so refresh=true analytics and other gated GETs work.
  // Never accept a client-supplied internal token.
  const secret = getInternalApiSecret();
  if (secret) {
    headers.set(INTERNAL_TOKEN_HEADER, secret);
  }

  const init: RequestInit = {
    method,
    headers,
    cache: "no-store",
    signal: AbortSignal.timeout(FORWARD_TIMEOUT_MS),
  };

  try {
    const res = await fetch(url, init);
    const body = await res.arrayBuffer();
    const out = new NextResponse(body, { status: res.status });
    const ct = res.headers.get("content-type");
    if (ct) out.headers.set("content-type", ct);
    return out;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: "backend fetch failed", detail: msg }, { status: 502 });
  }
}

export async function GET(request: NextRequest, ctx: RouteCtx) {
  const { path } = await ctx.params;
  return forward(request, path, "GET");
}

export async function HEAD(request: NextRequest, ctx: RouteCtx) {
  const { path } = await ctx.params;
  return forward(request, path, "HEAD");
}

export async function POST(request: NextRequest, ctx: RouteCtx) {
  const { path } = await ctx.params;
  return forward(request, path, "POST");
}

export async function PUT(request: NextRequest, ctx: RouteCtx) {
  const { path } = await ctx.params;
  return forward(request, path, "PUT");
}

export async function PATCH(request: NextRequest, ctx: RouteCtx) {
  const { path } = await ctx.params;
  return forward(request, path, "PATCH");
}

export async function DELETE(request: NextRequest, ctx: RouteCtx) {
  const { path } = await ctx.params;
  return forward(request, path, "DELETE");
}
