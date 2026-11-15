/**
 * Schemas used by fetchJson. Bundled at build time.
 *
 * The site validates every data file against the SAME JSON Schemas the pipeline checks its output with:
 * contracts/*.schema.json (owner R1). They refer to each other by file name (common.schema.json), so
 * fetchJson registers all of them under their file names.
 *
 * contracts/ has no schema for outline.geojson, so that one still comes from ./schemas-temp/ (R5).
 */
const contract = import.meta.glob("../../../contracts/*.schema.json", { eager: true, import: "default" });


const fileName = (file) => file.split("/").pop();
const byFile = Object.fromEntries(
  // contracts/ wins if a schema ever exists in both places
  Object.entries(contract).map(([file, schema]) => [fileName(file), schema]),
);

/** Every schema as [file name, schema], e.g. ["weekly.schema.json", {...}]: the keys cross-references use. */
export function schemaFiles() {
  return Object.entries(byFile);
}

/** @param {string} name e.g. "weekly" @returns {object | undefined} */
export function getSchema(name) {
  return byFile[`${name}.schema.json`];
}

export function schemaNames() {
  return Object.keys(byFile).map((file) => file.replace(".schema.json", "")).sort();
}

/** "us/weekly.json" -> "weekly"; "us/outline.geojson" -> "outline"; "regions.json" -> "regions". */
export function schemaNameForPath(path) {
  return path.split("/").pop().replace(/\.(geo)?json$/, "");
}
