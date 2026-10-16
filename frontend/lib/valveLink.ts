import { extractValveShareCode } from "@/lib/valveShareCode";
import { getBackendOrigin, getBackendFetchTimeoutMs } from "@/lib/backendFetch";
import { internalApiHeaders } from "@/lib/internalApi";

export type ValveLinkStatus = {
  linked: boolean;
  steam_id: string;
  latest_share_code?: string;
  last_sync_at?: string | null;
  matches_by_status?: Record<string, number>;
};

export type ValveLinkSubmitResponse = {
  steam_id: string;
  linked: boolean;
  latest_share_code: string;
  sync?: { state?: string; task_id?: string; discovered?: number; processed?: number; errors?: string[] };
};

export async function fetchValveLinkStatus(steamId: string): Promise<ValveLinkStatus> {
  const origin = getBackendOrigin();
  const res = await fetch(
    `${origin}/v1/valve/link/${encodeURIComponent(steamId)}`,
    {
      headers: internalApiHeaders({ Accept: "application/json" }),
      signal: AbortSignal.timeout(getBackendFetchTimeoutMs()),
      cache: "no-store",
    }
  );
  if (!res.ok) {
    return { linked: false, steam_id: steamId };
  }
  return (await res.json()) as ValveLinkStatus;
}

export async function submitValveLink(
  steamId: string,
  authCode: string | null | undefined,
  shareCode: string
): Promise<ValveLinkSubmitResponse> {
  const extracted = extractValveShareCode(shareCode);
  if (!extracted) {
    throw new Error(
      "No CSGO share code found — paste the full Steam share link or CSGO-xxxxx-… code"
    );
  }
  const auth = (authCode ?? "").trim();
  const origin = getBackendOrigin();
  const res = await fetch(
    `${origin}/v1/valve/link/${encodeURIComponent(steamId)}?sync=true`,
    {
      method: "POST",
      headers: internalApiHeaders({
        Accept: "application/json",
        "Content-Type": "application/json",
      }),
      body: JSON.stringify({
        ...(auth ? { auth_code: auth } : { auth_code: "" }),
        share_code: extracted,
      }),
      signal: AbortSignal.timeout(getBackendFetchTimeoutMs()),
      cache: "no-store",
    }
  );
  const data = (await res.json()) as ValveLinkSubmitResponse & { error?: string; detail?: string };
  if (!res.ok) {
    throw new Error(data.detail || data.error || "Failed to link Valve match history");
  }
  return data;
}
