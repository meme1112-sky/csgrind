import { NextRequest, NextResponse } from "next/server";
import { getSessionSteamId } from "@/lib/session";
import { enforceRateLimit } from "@/lib/rateLimit";
import { fetchValveLinkStatus, submitValveLink } from "@/lib/valveLink";
import { extractValveShareCode } from "@/lib/valveShareCode";

export async function GET(request: NextRequest) {
  const limited = enforceRateLimit(request, "valve");
  if (limited) return limited;

  const steamId = await getSessionSteamId();
  if (!steamId) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const status = await fetchValveLinkStatus(steamId);
  return NextResponse.json(status);
}

export async function POST(request: NextRequest) {
  const steamId = await getSessionSteamId();
  if (!steamId) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  // Prefer per-user key so one user can't burn the shared IP budget for others on NAT.
  const limited = enforceRateLimit(request, "valve_write", steamId);
  if (limited) return limited;

  let body: { auth_code?: string; share_code?: string };
  try {
    body = (await request.json()) as { auth_code?: string; share_code?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const authCode = body.auth_code?.trim() ?? "";
  const shareRaw = body.share_code?.trim() ?? "";
  const shareCode = extractValveShareCode(shareRaw) ?? "";
  if (!shareCode) {
    return NextResponse.json(
      {
        error:
          "No CSGO share code found — paste the full Steam share link or CSGO-xxxxx-… code",
      },
      { status: 400 }
    );
  }

  // First link needs auth; updates may omit it and reuse the stored code.
  if (!authCode) {
    const status = await fetchValveLinkStatus(steamId);
    if (!status.linked) {
      return NextResponse.json(
        { error: "Authentication code is required for the first Valve link" },
        { status: 400 }
      );
    }
  } else if (authCode.length < 8) {
    return NextResponse.json({ error: "Invalid authentication code" }, { status: 400 });
  }

  try {
    const result = await submitValveLink(steamId, authCode || null, shareCode);
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Link failed";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
