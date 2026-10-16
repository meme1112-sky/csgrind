/** Extract Valve MM share codes from bare codes or full Steam clipboard URLs. */

/** Same alphabet as extra-backend `valve_sharecode.py` (no I/L/O/0/1). Case-sensitive. */
const DICTIONARY =
  "ABCDEFGHJKLMNOPQRSTUVWXYZabcdefhijkmnopqrstuvwxyz23456789";
const DICTIONARY_SET = new Set(DICTIONARY);

const SHARE_CODE_RE = /CSGO(?:-?[A-Za-z0-9]{5}){5}/i;

/**
 * Pull `CSGO-xxxxx-xxxxx-xxxxx-xxxxx-xxxxx` from pasted text.
 * Returns null if no valid share code segment is found.
 */
export function extractValveShareCode(raw: string): string | null {
  const text = (raw ?? "").trim();
  if (!text) return null;
  const m = text.match(SHARE_CODE_RE);
  if (!m) return null;
  const body = m[0].replace(/^CSGO/i, "").replace(/-/g, "");
  if (body.length !== 25) return null;
  for (const ch of body) {
    if (!DICTIONARY_SET.has(ch)) return null;
  }
  return `CSGO-${[0, 5, 10, 15, 20].map((i) => body.slice(i, i + 5)).join("-")}`;
}
