/**
 * Schemas used by fetchJson. Bundled at build time.
 *
 * TEMPORARY: contracts/ has no schemas yet, so these come from ./schemas-temp/ (written by R5 from contracts section 6,
 * required fields and types only). When R1's schemas land, switch with this ONE line:
 *   const modules = import.meta.glob("../../../contracts/*.schema.json", { eager: true, import: "default" });
 */
const modules = import.meta.glob("./schemas-temp/*.schema.json", { eager: true, import: "default" });

const byName = Object.fromEntries(
  Object.entries(modules).map(([file, schema]) => [file.split("/").pop().replace(".schema.json", ""), schema]),
);

/** @param {string} name e.g. "weekly" @returns {object | undefined} */
export function getSchema(name) {
  return byName[name];
}

export function schemaNames() {
  return Object.keys(byName).sort();
}

/** "punjab/weekly.json" -> "weekly"; "punjab/outline.geojson" -> "outline"; "regions.json" -> "regions". */
export function schemaNameForPath(path) {
  return path.split("/").pop().replace(/\.(geo)?json$/, "");
}
