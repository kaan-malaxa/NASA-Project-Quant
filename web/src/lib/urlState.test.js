import { describe, expect, it } from "vitest";
import { latLngToCell } from "h3-js";
import { defaultUrlState, parseUrlState, writeUrlState } from "./urlState.js";

const LAST = "2026-11-13";
const r5a = latLngToCell(30.1, 75.7, 5);
const r5b = latLngToCell(30.5, 76.0, 5);
const r6 = latLngToCell(30.1, 75.7, 6);
const parse = (q) => parseUrlState(new URLSearchParams(q), LAST);

describe("URL state (contracts section 7)", () => {
  it("defaults when empty", () => {
    expect(parse("")).toEqual(defaultUrlState(LAST));
    expect(parse("")).toEqual({ from: "2003-01-01", to: LAST, lens: "harmonized", view: "clock", mode: "activity", aoi: [] });
  });

  it("round-trips every parameter", () => {
    const state = { from: "2012-01-20", to: "2020-02-29", lens: "naive_splice", view: "months", mode: "anomaly", aoi: [r5a, r5b] };
    const written = writeUrlState(new URLSearchParams("debug=1"), state, LAST);
    expect(written.get("debug")).toBe("1");
    expect(parse(written.toString())).toEqual(state);
    for (const lens of ["harmonized", "aqua_raw", "viirs_raw", "naive_splice", "viirs_as_aqua", "viirs_equiv"]) {
      expect(parse(writeUrlState(new URLSearchParams(), { ...state, lens }, LAST).toString()).lens).toBe(lens);
    }
    for (const view of ["clock", "weeks", "months"]) {
      expect(parse(writeUrlState(new URLSearchParams(), { ...state, view }, LAST).toString()).view).toBe(view);
    }
  });

  it("omits defaults when writing", () => {
    expect(writeUrlState(new URLSearchParams(), defaultUrlState(LAST), LAST).toString()).toBe("");
  });

  it("rejects bad values silently", () => {
    const s = parse(
      `from=2003-02-30&to=tomorrow&lens=fires&view=pie&mode=loud&aoi=${r6},nothex,${r5a},${r5a}`,
    );
    expect(s).toEqual({ ...defaultUrlState(LAST), aoi: [r5a] });
    expect(parse("from=2002-12-31").from).toBe("2003-01-01");
    expect(parse("to=2026-11-14").to).toBe(LAST);
    expect(parse("from=2020-01-01&to=2019-01-01")).toMatchObject({ from: "2003-01-01", to: LAST });
  });
});
