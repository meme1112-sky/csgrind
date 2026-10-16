import { NextRequest, NextResponse } from "next/server";
import { getSessionSteamId } from "@/lib/session";
import { enforceRateLimit } from "@/lib/rateLimit";
import { backendPutChunk } from "@/lib/valveDemoUpload";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Ctx = { params: Promise<{ uploadId: string; index: string }> };

export async function PUT(request: NextRequest, context: Ctx) {
  const steamId = await getSessionSteamId();
  if (!steamId) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const limited = enforceRateLimit(request, "valve_chunk", steamId);
  if (limited) return limited;

  const { uploadId, index: indexRaw } = await context.params;
  const index = Number(indexRaw);
  if (!uploadId || !Number.isInteger(index) || index < 0) {
    return NextResponse.json({ error: "Invalid chunk path" }, { status: 400 });
  }

  const buf = await request.arrayBuffer();
  if (!buf.byteLength) {
    return NextResponse.json({ error: "Empty chunk" }, { status: 400 });
  }

  try {
    const result = await backendPutChunk(uploadId, index, buf);
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Chunk upload failed";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
