/** True when ?debug=1 is in the page query or in the hash route's query (contracts section 7). */
export function isDebug(hashSearch = "") {
  const hit = (s) => new URLSearchParams(s).get("debug") === "1";
  const pageSearch = typeof window !== "undefined" ? window.location.search : "";
  return hit(pageSearch) || hit(hashSearch);
}
