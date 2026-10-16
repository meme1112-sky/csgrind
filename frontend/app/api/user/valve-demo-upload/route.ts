import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Single-request upload is blocked by Cloudflare Free (~100 MB).
 * Clients must use the chunked endpoints under /api/user/valve-demo-upload/*.
 */
export async function POST() {
  return NextResponse.json(
    {
      error:
        "Use chunked upload (init → chunks → complete). Single-file POST exceeds Cloudflare limits for large demos.",
    },
    { status: 410 }
  );
}
