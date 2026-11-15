import { describe, expect, it } from "vitest";
import { buildLensList, seriesForLens } from "./lenses.js";

const META = {
  harmonized: { label: "Harmonized record", unit: "Aqua-equivalent fire cell-days per week" },
  viirs_equiv: { label: "What VIIRS would have seen", unit: "VIIRS-equivalent fire cell-days per week" },
  aqua_raw: { label: "MODIS Aqua, as recorded", unit: "fire cell-days per week" },
  viirs_raw: { label: "VIIRS, as recorded", unit: "fire cell-days per week" },
  viirs_as_aqua: { label: "VIIRS translated to the Aqua scale", unit: "Aqua-equivalent fire cell-days per week" },
};

describe("lens list", () => {
  it("is built from series_meta keys plus naive_splice, in contract order, with JSON labels", () => {
    const list = buildLensList(META);
    expect(list.map((l) => l.id)).toEqual(["harmonized", "aqua_raw", "viirs_raw", "naive_splice", "viirs_as_aqua", "viirs_equiv"]);
    expect(list[0].label).toBe("Harmonized record");
    expect(list[3]).toEqual({ id: "naive_splice", label: "Naive splice", unit: "fire cell-days per week" });
  });

  it("leaves out series that are not in series_meta", () => {
    expect(buildLensList({ harmonized: META.harmonized }).map((l) => l.id)).toEqual(["harmonized", "naive_splice"]);
  });

  it("naive splice takes Aqua before 2012 and VIIRS from 2012", () => {
    expect(seriesForLens("naive_splice", 2011)).toBe("aqua_raw");
    expect(seriesForLens("naive_splice", 2012)).toBe("viirs_raw");
    expect(seriesForLens("harmonized", 2011)).toBe("harmonized");
  });
});
