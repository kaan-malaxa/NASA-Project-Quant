import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { checkClaim, claimWindow, configFromDoc, r3, seriesFromArea, seriesFromDoc, signedPct, windowText } from "./claimCheck.js";

const read = (rel) => JSON.parse(readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8"));
const FIXTURE = read("../../../contracts/fixtures/claim_check_parity.json");
const DOCS = { us: read("../../public/data/us/claim_check.json"), synthland: read("../../public/data/synthland/claim_check.json") };
const CASES = Object.fromEntries(FIXTURE.cases.map((c) => [c.name, c]));

function run(name) {
  const c = CASES[name];
  if (!c) throw new Error(`no parity case ${name}`);
  if (c.doc === null) return checkClaim(c.claim, c.series, FIXTURE.inline_config);
  const doc = DOCS[c.doc];
  return checkClaim(c.claim, seriesFromDoc(doc, c.place_name), configFromDoc(doc));
}

describe("checkClaim: one test per SD-20 verdict branch, in rule order", () => {
  it("1. cant_tell_missing when a window year is missing (never read as zero)", () => {
    const r = run("rule1_missing_year_in_window");
    expect(r.verdict).toBe("cant_tell_missing");
    expect(r.missing_years).toEqual([2004]);
    expect(r.naive).toBeNull();
    expect(r.harmonized).toBeNull();
    expect(r.kinds).toContain("missing");
    expect(r.sentence).toContain("2004");
  });
  it("1. cant_tell_missing (zero-start template) when a start mean is 0", () => {
    const r = run("rule1_zero_start");
    expect([r.verdict, r.template_id]).toEqual(["cant_tell_missing", "cant_tell_zero_start"]);
  });
  it("2. contradicted when the whole band is on the other side of 0", () => {
    const r = run("rule2_contradicted");
    expect(r.verdict).toBe("contradicted");
    expect(r.harmonized.band_lo).toBeGreaterThan(0);
  });
  it("3. sensor_artifact when the naive change backs the claim but the corrected band contains 0", () => {
    const r = run("rule3_sensor_artifact");
    expect(r.verdict).toBe("sensor_artifact");
    expect(r.naive.change_pct).toBe(300);
    expect(r.harmonized.band_lo).toBeLessThanOrEqual(0);
  });
  it("4. no_clear_change when the band contains 0 and the naive change is below the artifact threshold", () => {
    expect(run("rule4_naive_below_artifact_threshold").verdict).toBe("no_clear_change");
    expect(run("rule4_no_clear_change_naive_opposite").verdict).toBe("no_clear_change");
  });
  it("4. no_clear_change with the same-sensor note when the period does not cross 2012", () => {
    const r = run("rule4_no_clear_change_same_sensor");
    expect(r.verdict).toBe("no_clear_change");
    expect(r.same_sensor).toBe(true);
    expect(r.notes.map((n) => n.id)).toContain("same_sensor");
  });
  it("5. holds_up when the claim is inside the band (tolerance included)", () => {
    expect(run("rule5_holds_up").verdict).toBe("holds_up");
    const r = run("rule5_holds_up_inside_tolerance");
    expect(r.verdict).toBe("holds_up");
    expect(r.claimed_change_pct).toBeGreaterThan(r.harmonized.hi);
    expect(r.claimed_change_pct).toBeLessThanOrEqual(r.harmonized.band_hi);
  });
  it("6. weaker_than_claimed when the claim is beyond the band's far end", () => {
    expect(run("rule6_weaker_than_claimed").verdict).toBe("weaker_than_claimed");
  });
  it("7. stronger_than_claimed when the claim is short of the band's near end", () => {
    expect(run("rule7_stronger_than_claimed").verdict).toBe("stronger_than_claimed");
  });
});

describe("checkClaim: edges and inputs", () => {
  it("trims the windows at 2003 and 2025", () => {
    const r = run("edge_windows_2003_2025");
    expect(r.windows).toEqual({ start: [2003, 2004], end: [2024, 2025] });
    expect(r.notes[0].text).toContain("2003–2004");
  });
  it("handles a negative claim ('decreased by 30%')", () => {
    const r = run("negative_holds_up");
    expect(r.claimed_change_pct).toBe(-30);
    expect(r.verdict).toBe("holds_up");
    expect(r.sentence).toContain("−30%");
    expect(run("negative_weaker_than_claimed").verdict).toBe("weaker_than_claimed");
    expect(run("negative_stronger_than_claimed").verdict).toBe("stronger_than_claimed");
  });
  it("rejects from_year >= to_year, out-of-record years, bad percents and directions", () => {
    expect(run("error_from_after_to")).toMatchObject({ ok: false, error: "years_order", verdict: null, sentence: null });
    expect(run("error_from_equals_to").error).toBe("years_order");
    expect(run("error_year_outside_record").error).toBe("years_range");
    expect(run("error_claimed_pct_zero").error).toBe("claimed_pct_range");
    expect(run("error_claimed_pct_too_large").error).toBe("claimed_pct_range");
    expect(run("error_direction").error).toBe("direction");
  });
  it("uses replicate percentiles for regions and the envelope for drawn areas", () => {
    expect(run("replicate_range").harmonized).toMatchObject({ range_source: "replicates", lo: 8.725, hi: 11.275 });
    const aoi = run("aoi_envelope_range");
    expect(aoi.harmonized.range_source).toBe("envelope");
    expect(aoi.notes.map((n) => n.id)).toContain("aoi_calibration");
  });
  it("shows the artifact share only across the sensor change", () => {
    expect(run("rule5_holds_up").artifact_share).toBe(0.9);
    expect(run("rule5_holds_up").notes.find((n) => n.id === "artifact_share").text).toBe("About 90% of the raw change comes from the sensor switch.");
    expect(run("rule4_no_clear_change_same_sensor").artifact_share).toBeNull();
  });
  it("formats and windows like the Python reference", () => {
    expect(r3(0.0005)).toBe(0.001);
    expect(r3(-0.0005)).toBe(-0.001);
    expect(Object.is(r3(-0.0001), -0)).toBe(false);
    expect([signedPct(20.5), signedPct(-20.5), signedPct(-0.4)]).toEqual(["+21%", "−21%", "0%"]);
    expect(claimWindow(2003, [2003, 2025], 3)).toEqual([2003, 2004]);
    expect(claimWindow(2025, [2003, 2025], 3)).toEqual([2024, 2025]);
    expect(windowText([2010, 2010])).toBe("2010");
  });
});

describe("parity with pipeline/common/claim_check.py", () => {
  it.each(FIXTURE.cases.map((c) => [c.name]))("%s gives the identical result", (name) => {
    expect(run(name)).toEqual(CASES[name].expected);
  });
});

describe("planted truth on synthland", () => {
  it("a claim equal to the planted trend over the planted period holds up", () => {
    expect(run("planted_trend_full_record").verdict).toBe("holds_up");
  });
  it("a claim built from the naive splice across 2012 is flagged", () => {
    expect(["sensor_artifact", "weaker_than_claimed"]).toContain(run("planted_naive_splice_across_2012").verdict);
  });
});

describe("seriesFromArea", () => {
  const config = FIXTURE.inline_config;
  const months = (year, value, kind = "observed") =>
    Array.from({ length: 12 }, (_, i) => ({ year, month: i + 1, value, lo: value * 0.9, hi: value * 1.1, kind }));
  it("sums complete years, marks a year with any missing month missing, and keeps the worst kind", () => {
    const h = [...months(2003, 1), ...months(2004, 2), ...months(2023, 3, "harmonized")];
    h[13] = { ...h[13], value: null, lo: null, hi: null, kind: "missing" };
    const n = [...months(2003, 5), ...months(2004, 5), ...months(2023, 7)];
    const s = seriesFromArea(h, n, config);
    const byYear = Object.fromEntries(s.annual.map((r) => [r.year, r]));
    expect(byYear[2003]).toMatchObject({ harmonized: 12, naive_count: 60, kind: "observed", naive_source: "modis" });
    expect(byYear[2003].lo).toBeCloseTo(10.8, 9);
    expect(byYear[2004]).toMatchObject({ harmonized: null, kind: "missing" });
    expect(byYear[2023]).toMatchObject({ harmonized: 36, naive_count: 84, kind: "harmonized", naive_source: "snpp" });
    expect(byYear[2010]).toMatchObject({ harmonized: null, kind: "missing" });
    expect(s).toMatchObject({ place_name: "your drawn area", naive_unit: "fire cell-days", replicates: null });
  });
});
