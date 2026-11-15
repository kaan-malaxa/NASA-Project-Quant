import { expect, it } from "vitest";
import { parseUrlState, writeUrlState } from "./urlState.js";
import { buildHeatGrid } from "../viz/heatmapData.js";
import { cellDetail } from "./cellDetail.js";
import { percentileRank } from "../viz/percentile.js";
import { bounds, fitProjection } from "../viz/hexLayout.js";
import { analysisYears } from "./analysis.js";
import { lensActivityThreshold } from "../viz/cellStyle.js";

it("converts low-activity thresholds to lens units across a month boundary", () => {
  const configuration = {anomaly:{low_activity_threshold:5},timebins:{week_days:7,weeks_per_year:52}};
  const calibration = {k:{snpp:[{month:1,k:0.5},{month:2,k:0.25}]}};
  const input = {grain:"week",period:5,year:2024,lens:"viirs_raw",source:"snpp",configuration,calibration};
  expect(lensActivityThreshold(input)).toBeCloseTo(5 * (3 * 2 + 4 * 4) / 7);
  expect(lensActivityThreshold({...input,calibration:{k:{snpp:[]}}})).toBeNull();
});

it("falls back for reversed or unavailable scientific years", () => {
  const index = {default_years:[2003,2025],available_years:[2003,2004,2025]};
  expect(analysisYears(index, "2025", "2003")).toEqual([2003,2025]);
  expect(analysisYears(index, "2000", "2004")).toEqual([2003,2025]);
  expect(analysisYears(index, "2003", "2004")).toEqual([2003,2004]);
});

it("restores analysis years independently of exact dates", () => {
  const state = parseUrlState(new URLSearchParams("analysis_from=2010&analysis_to=2020&from=2021-02-01&to=2021-03-01"), "2025-12-31");
  expect(state.analysis_from).toBe("2010");
  expect(state.from).toBe("2021-02-01");
  expect(parseUrlState(writeUrlState(new URLSearchParams(), state, "2025-12-31"), "2025-12-31")).toEqual(state);
});

it("chart and detail rank against the same fixed baseline population", () => {
  const rows = [10, 20, 30].map((value, i) => ({year:2003+i,week:1,series:"harmonized",value,lo:value,hi:value,kind:"observed",source:"aqua"}));
  const climatology = {baseline_years:[2003,2005],weeks:[],months:[]};
  const grid = buildHeatGrid({rows:[rows[1]],baselineRows:rows,grain:"week",lens:"harmonized",mode:"anomaly",climatology,unit:"u"});
  const detail = cellDetail({rows:[rows[1]],baseline_rows:rows}, {year:2004,week:1}, "harmonized", [2003,2005], percentileRank);
  expect(grid.cells[0].percentile).toBe(detail.percentile);
  expect(detail.percentile).toBe(50);
});

it("fits Alaska and Hawaii in a compact longitude interval across the antimeridian", () => {
  const geo = {type:"MultiPoint",coordinates:[[172,52],[-179,52],[-155,20],[-65,45]]};
  const box = bounds(geo);
  expect(box[1][0] - box[0][0]).toBeLessThan(130);
  const project = fitProjection(box, 500, 300);
  for (const point of geo.coordinates) {
    const [x,y] = project(point);
    expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThanOrEqual(500);
    expect(y).toBeGreaterThanOrEqual(0); expect(y).toBeLessThanOrEqual(300);
  }
});
