import { describe, expect, it } from "vitest";
import { GLOSSARY, KIND_INFO } from "./glossary.js";

// Every term in plan/roles/R5_web_app.md section 10.
const TABLE_TERMS = [
  "Hotspot", "MODIS", "VIIRS", "FIRMS", "Fire cell-day", "Aqua-equivalent", "VIIRS-equivalent", "Harmonized",
  "Observed / Harmonized / Estimated / No data", "Percentile", "Critical weeks", "FRP", "Eyesight curve",
  "Naive splice", "Range (likely range)", "NRT",
];

describe("glossary", () => {
  it("has a non-empty entry for every term in the table", () => {
    const terms = Object.values(GLOSSARY).map((e) => e.term);
    for (const t of TABLE_TERMS) expect(terms, t).toContain(t);
    for (const e of Object.values(GLOSSARY)) expect(e.text.length).toBeGreaterThan(10);
  });

  it("has a label for every kind", () => {
    for (const k of ["observed", "harmonized", "estimated", "missing", "sample"]) expect(KIND_INFO[k].label).toBeTruthy();
  });
});
