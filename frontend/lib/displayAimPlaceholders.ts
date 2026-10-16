/**
 * @deprecated Unused. Neok AI integrity now reads TTD / pre-aim / knife from
 * demo-parsed rollup fields. Kept temporarily so old imports don't break mid-deploy.
 */

export type DisplayAimPlaceholders = {
  ttdMs: number;
  preaimDeg: number;
  knifePerMatch: number;
};

export function demoSampleKey(
  matches: Array<{ match_id?: string | null }> | null | undefined
): string {
  if (!matches?.length) return "none";
  const ids = matches
    .map((m) => (typeof m.match_id === "string" ? m.match_id.trim() : ""))
    .filter(Boolean)
    .sort();
  return ids.length ? ids.join(",") : `count:${matches.length}`;
}

export function displayAimPlaceholders(): DisplayAimPlaceholders {
  return { ttdMs: 0, preaimDeg: 0, knifePerMatch: 0 };
}
