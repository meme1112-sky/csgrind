import { extractValveShareCode } from "@/lib/valveShareCode";
import { getBackendOrigin } from "@/lib/backendFetch";
import { internalApiHeaders } from "@/lib/internalApi";

export type ValveDemoUploadResult = {
  share_code: string;
  steam_id: string;
  match_id?: string | null;
  status: string;
  bytes?: number;
  parsed?: boolean;
  job?: { state?: string; task_id?: string; note?: string };
};

/** Long timeout — decompress + parse can take several minutes for large demos. */
const UPLOAD_TIMEOUT_MS = 10 * 60 * 1000;
/** Keep each request well under Cloudflare Free’s ~100 MB body limit. */
export const VALVE_DEMO_CHUNK_SIZE = 8 * 1024 * 1024;
const MAX_BYTES = 400 * 1024 * 1024;

export type ValveDemoUploadProgress = {
  phase: "init" | "chunks" | "complete";
  sentBytes: number;
  totalBytes: number;
  chunkIndex: number;
  totalChunks: number;
};

async function readJsonError(res: Response): Promise<string> {
  const data = (await res.json().catch(() => ({}))) as {
    detail?: unknown;
    error?: string;
  };
  const detail = data.detail;
  if (typeof detail === "string") return detail;
  return data.error || `Upload failed (HTTP ${res.status})`;
}

/**
 * Browser → Next BFF chunked upload (each request ~8 MB so Cloudflare Free accepts it).
 * Call this from client components only.
 */
export async function uploadValveDemo(
  _steamId: string,
  shareCode: string,
  file: File,
  onProgress?: (p: ValveDemoUploadProgress) => void
): Promise<ValveDemoUploadResult> {
  // Share code optional when filename is Valve-style (match730_…).
  const extracted = shareCode.trim() ? extractValveShareCode(shareCode) : null;
  if (shareCode.trim() && !extracted) {
    throw new Error(
      "No CSGO share code found — paste the full Steam share link or CSGO-xxxxx-… code"
    );
  }
  if (!file || file.size < 1024) {
    throw new Error("Choose a demo file (.dem / .dem.bz2)");
  }
  if (file.size > MAX_BYTES) {
    throw new Error("Demo file too large (max 400 MB)");
  }

  const totalBytes = file.size;
  const totalChunks = Math.ceil(totalBytes / VALVE_DEMO_CHUNK_SIZE);

  onProgress?.({
    phase: "init",
    sentBytes: 0,
    totalBytes,
    chunkIndex: 0,
    totalChunks,
  });

  const initForm = new FormData();
  if (extracted) initForm.set("share_code", extracted);
  initForm.set("filename", file.name || "demo.dem");
  initForm.set("total_bytes", String(totalBytes));

  const initRes = await fetch("/api/user/valve-demo-upload/init", {
    method: "POST",
    body: initForm,
    signal: AbortSignal.timeout(60_000),
  });
  if (!initRes.ok) throw new Error(await readJsonError(initRes));

  const initData = (await initRes.json()) as {
    upload_id: string;
    chunk_size?: number;
    share_code?: string;
  };
  const uploadId = initData.upload_id;
  if (!uploadId) throw new Error("Upload init failed (no upload_id)");

  const chunkSize = initData.chunk_size || VALVE_DEMO_CHUNK_SIZE;
  let sentBytes = 0;

  for (let index = 0; index < totalChunks; index++) {
    const start = index * chunkSize;
    const end = Math.min(start + chunkSize, totalBytes);
    const buf = await file.slice(start, end).arrayBuffer();

    const chunkRes = await fetch(
      `/api/user/valve-demo-upload/${encodeURIComponent(uploadId)}/chunks/${index}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/octet-stream" },
        body: buf,
        signal: AbortSignal.timeout(5 * 60 * 1000),
      }
    );
    if (!chunkRes.ok) throw new Error(await readJsonError(chunkRes));

    sentBytes = end;
    onProgress?.({
      phase: "chunks",
      sentBytes,
      totalBytes,
      chunkIndex: index + 1,
      totalChunks,
    });
  }

  onProgress?.({
    phase: "complete",
    sentBytes: totalBytes,
    totalBytes,
    chunkIndex: totalChunks,
    totalChunks,
  });

  const completeRes = await fetch(
    `/api/user/valve-demo-upload/${encodeURIComponent(uploadId)}/complete`,
    {
      method: "POST",
      signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
    }
  );
  if (!completeRes.ok) throw new Error(await readJsonError(completeRes));

  const result = (await completeRes.json()) as ValveDemoUploadResult;
  if (!result.share_code && initData.share_code) {
    result.share_code = initData.share_code;
  }
  return result;
}

/** Server-side helpers used by the Next BFF to talk to Express → FastAPI. */
export async function backendInitChunkedUpload(params: {
  steamId: string;
  shareCode: string;
  filename: string;
  totalBytes: number;
}): Promise<{ upload_id: string; chunk_size: number; total_chunks: number }> {
  const form = new FormData();
  form.set("steam_id", params.steamId);
  form.set("share_code", params.shareCode);
  form.set("filename", params.filename);
  form.set("total_bytes", String(params.totalBytes));

  const res = await fetch(`${getBackendOrigin()}/v1/valve/matches/upload/init`, {
    method: "POST",
    headers: internalApiHeaders({ Accept: "application/json" }),
    body: form,
    signal: AbortSignal.timeout(60_000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(await readJsonError(res));
  return res.json();
}

export async function backendPutChunk(
  uploadId: string,
  index: number,
  body: ArrayBuffer
): Promise<unknown> {
  const res = await fetch(
    `${getBackendOrigin()}/v1/valve/matches/upload/${encodeURIComponent(uploadId)}/chunks/${index}`,
    {
      method: "PUT",
      headers: internalApiHeaders({
        Accept: "application/json",
        "Content-Type": "application/octet-stream",
      }),
      body,
      signal: AbortSignal.timeout(5 * 60 * 1000),
      cache: "no-store",
    }
  );
  if (!res.ok) throw new Error(await readJsonError(res));
  return res.json();
}

export async function backendCompleteChunkedUpload(
  uploadId: string
): Promise<ValveDemoUploadResult> {
  const res = await fetch(
    `${getBackendOrigin()}/v1/valve/matches/upload/${encodeURIComponent(uploadId)}/complete`,
    {
      method: "POST",
      headers: internalApiHeaders({ Accept: "application/json" }),
      signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
      cache: "no-store",
    }
  );
  if (!res.ok) throw new Error(await readJsonError(res));
  return res.json();
}
