import { NextRequest, NextResponse } from "next/server";
import { getSessionSteamId } from "@/lib/session";
import { enforceRateLimit } from "@/lib/rateLimit";
import { backendInitChunkedUpload } from "@/lib/valveDemoUpload";
import { extractValveShareCode } from "@/lib/valveShareCode";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const steamId = await getSessionSteamId();
  if (!steamId) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const limited = enforceRateLimit(request, "valve_write", steamId);
  if (limited) return limited;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const shareRaw = String(form.get("share_code") ?? "").trim();
  const shareCode = shareRaw ? extractValveShareCode(shareRaw) ?? "" : "";
  if (shareRaw && !shareCode) {
    return NextResponse.json(
      {
        error:
          "No CSGO share code found — paste the full Steam share link or CSGO-xxxxx-… code",
      },
      { status: 400 }
    );
  }

  const filename = String(form.get("filename") ?? "demo.dem").trim() || "demo.dem";
  const totalBytes = Number(form.get("total_bytes"));
  if (!Number.isFinite(totalBytes) || totalBytes < 1024) {
    return NextResponse.json({ error: "Invalid total_bytes" }, { status: 400 });
  }

  try {
    const result = await backendInitChunkedUpload({
      steamId,
      shareCode,
      filename,
      totalBytes,
    });
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Upload init failed";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
