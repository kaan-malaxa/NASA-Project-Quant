/**
 * The region for the landing page's "Live this week" card: the first region in regions.json with synthetic: false
 * that lists a nowcast. Synthetic regions (synthland) are never shown here, even with ?debug=1.
 * @param {object[] | undefined} regions regions.json `regions`
 * @returns {object | null}
 */
export function liveRegion(regions) {
  return (regions || []).find((r) => r.synthetic === false && (r.files || []).includes("nowcast")) ?? null;
}

/** Kinds that get a badge on the card: estimates must never look like observations (science rule 4). */
export const BADGED_KINDS = ["harmonized", "estimated"];
