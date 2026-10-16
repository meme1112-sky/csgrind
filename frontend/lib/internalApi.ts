/** Shared secret for Next.js → Express → FastAPI service auth. */

export const INTERNAL_TOKEN_HEADER = "x-internal-token";

export function getInternalApiSecret(): string {
  return (process.env.INTERNAL_API_SECRET || "").trim();
}

/** Headers to attach on server-side calls to the Express `/v1` proxy (or FastAPI). */
export function internalApiHeaders(extra?: HeadersInit): Headers {
  const headers = new Headers(extra);
  if (!headers.has("Accept")) {
    headers.set("Accept", "application/json");
  }
  const secret = getInternalApiSecret();
  if (secret) {
    headers.set(INTERNAL_TOKEN_HEADER, secret);
  }
  return headers;
}
