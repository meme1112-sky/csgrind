import { getBackendOrigin } from "@/lib/backendFetch";
import { internalApiHeaders } from "@/lib/internalApi";

/** Fire-and-forget: enqueue proactive FACEIT demo archival for one Steam ID. */
export function enqueueDemoArchive(steamId: string): void {
  const origin = getBackendOrigin();
  const url = `${origin}/v1/analytics/archive/by-steam/${encodeURIComponent(steamId)}`;
  void fetch(url, {
    method: "POST",
    headers: internalApiHeaders({ Accept: "application/json" }),
    signal: AbortSignal.timeout(8_000),
    cache: "no-store",
  }).catch(() => {
    /* non-critical background work */
  });
}
