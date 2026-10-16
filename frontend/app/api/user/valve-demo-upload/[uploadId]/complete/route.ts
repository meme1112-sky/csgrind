import { NextRequest, NextResponse } from "next/server";
import { getSessionSteamId } from "@/lib/session";
import { enforceRateLimit } from "@/lib/rateLimit";
import { backendCompleteChunkedUpload } from "@/lib/valveDemoUpload";

export const dynamic = "force-dynamic";
export const maxDuration = 600;

type Ctx = { params: Promise<{ uploadId: string }> };

export async function POST(request: NextRequest, context: Ctx) {
  const steamId = await getSessionSteamId();
  if (!steamId) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const limited = enforceRateLimit(request, "valve_write", steamId);
  if (limited) return limited;

  const { uploadId } = await context.params;
  if (!uploadId) {
    return NextResponse.json({ error: "Missing upload_id" }, { status: 400 });
  }

  try {
    const result = await backendCompleteChunkedUpload(uploadId);
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Upload complete failed";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
