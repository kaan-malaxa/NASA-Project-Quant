// FABRICATED gallery fixture. Not data. Not a real place.
// Exists only so the gallery can exercise charts before R1's sample files are in web/public/data/
// (role file §11: "fabricate it inside the gallery only"). Marked kind "sample" and
// code_version "sample" per AGENTS.md science rule 10. The numbers are shapes, not results:
// never screenshot this fixture for slides, the README or the video.

import { quantile } from "d3";
import { percentileRank } from "../percentile";
import { statusFromPercentile } from "../smallLayout";

export const FIXTURE_REGION = {
  id: "gallery_fixture",
  name: "Fabricated fixture (not data)",
  country: "ZZ",
  bbox: [0, 0, 1, 1],
  centroid: [0.5, 0.5],
  fire_type: "Fabricated",
  story: "Fabricated shapes for the component gallery.",
  n_cells_r6: 0,
  membership: "bbox",
  last_data_day: "2025-12-31",
  synthetic: true,
  files: ["ruler", "weekly", "monthly", "climatology", "season", "trend", "nowcast"],
  optional_files: [],
};

// Deterministic wiggle, no randomness.
const wiggle = (year, amp) => Math.round(amp * Math.sin(year * 1.7) * 1000) / 1000;

const SWITCH = 2012; // fixture only; the chart reads the switch year from naive_source
const MISSING_YEAR = 2007; // fixture only: exercises the hatched "no data" band
export const FIXTURE_RULER = {
  schema_version: "1.0",
  generated_at: "1970-01-01T00:00:00Z",
  code_version: "sample",
  region: FIXTURE_REGION.id,
  index_base_years: [2003, 2011],
  jump_multiple: {
    value: 2,
    lo: 1.5,
    hi: 2.5,
    years: [2013, 2022],
    definition: "FABRICATED fixture value for the gallery; not a result.",
  },
  rows: Array.from({ length: 2025 - 2003 + 1 }, (_, i) => {
    const year = 2003 + i;
    if (year === MISSING_YEAR) {
      return { year, naive_index: null, harmonized_index: null, naive_source: "modis", kind: "missing" };
    }
    const h = Math.round((1 + wiggle(year, 0.15)) * 1000) / 1000;
    const n =
      year < SWITCH
        ? Math.round((h + wiggle(year + 3, 0.05)) * 1000) / 1000
        : Math.round(h * 2 * 1000) / 1000;
    return {
      year,
      naive_index: n,
      harmonized_index: h,
      naive_source: year < SWITCH ? "modis" : "snpp",
      kind: "sample",
    };
  }),
  sentence:
    "Fabricated gallery fixture: the raw line jumps at the sensor switch while the harmonized line does not.",
};

// ---- weekly / monthly / climatology / season (fabricated shapes) -------------------------------

const YEARS = Array.from({ length: 2025 - 2003 + 1 }, (_, i) => 2003 + i);
const OUTAGE = { year: 2007, fromWeek: 20, toWeek: 24 }; // fixture only: a run of missing weeks
const r1 = (v) => Math.round(v * 10) / 10;

/** Two fabricated burning seasons; small values round to exactly 0 to exercise the zero style. */
function shape(week, year) {
  const s = 40 * Math.exp(-(((week - 17) / 2) ** 2)) + 90 * Math.exp(-(((week - 44) / 2.5) ** 2));
  const v = s * (1 + 0.25 * Math.sin(year * 1.3)) * (1 + 0.1 * Math.sin(week * year));
  return v < 0.5 ? 0 : r1(v);
}

function weeklyRow(series, year, week) {
  const outage = year === OUTAGE.year && week >= OUTAGE.fromWeek && week <= OUTAGE.toWeek;
  const before = series === "viirs_raw" && year < 2012;
  if (outage || before)
    return { year, week, series, value: null, lo: null, hi: null, kind: "missing", source: null };
  const h = shape(week, year);
  let value = h;
  let source = "aqua";
  if (series === "harmonized") source = year <= 2022 ? "aqua" : "snpp";
  if (series === "viirs_raw") {
    value = r1(h * 2);
    source = "snpp";
  }
  return { year, week, series, value, lo: value, hi: value, kind: "sample", source };
}

const SERIES = ["harmonized", "aqua_raw", "viirs_raw"];
const META = {
  harmonized: { label: "Harmonized record (fixture)", unit: "Aqua-equivalent fire cell-days per week" },
  aqua_raw: { label: "MODIS Aqua, as recorded (fixture)", unit: "fire cell-days per week" },
  viirs_raw: { label: "VIIRS, as recorded (fixture)", unit: "fire cell-days per week" },
};

export const FIXTURE_WEEKLY = {
  schema_version: "1.0",
  code_version: "sample",
  generated_at: "1970-01-01T00:00:00Z",
  region: FIXTURE_REGION.id,
  series_meta: META,
  rows: SERIES.flatMap((s) =>
    YEARS.flatMap((y) => Array.from({ length: 52 }, (_, i) => weeklyRow(s, y, i + 1))),
  ),
};

/** Month of a week's first day (non-leap reference). */
const monthOfWeek = (week) => new Date(Date.UTC(2001, 0, 1 + (week - 1) * 7)).getUTCMonth() + 1;

export const FIXTURE_MONTHLY = {
  schema_version: "1.0",
  code_version: "sample",
  generated_at: "1970-01-01T00:00:00Z",
  region: FIXTURE_REGION.id,
  series_meta: Object.fromEntries(
    Object.entries(META).map(([k, m]) => [k, { ...m, unit: m.unit.replace("per week", "per month") }]),
  ),
  rows: SERIES.flatMap((series) =>
    YEARS.flatMap((year) =>
      Array.from({ length: 12 }, (_, i) => {
        const month = i + 1;
        const weeks = FIXTURE_WEEKLY.rows.filter(
          (r) => r.series === series && r.year === year && monthOfWeek(r.week) === month,
        );
        if (weeks.some((w) => w.kind === "missing")) {
          return { year, month, series, value: null, lo: null, hi: null, kind: "missing", source: null };
        }
        const value = r1(weeks.reduce((s, w) => s + (w.value ?? 0), 0));
        return {
          year,
          month,
          series,
          value,
          lo: value,
          hi: value,
          kind: "sample",
          source: weeks[0]?.source ?? null,
        };
      }),
    ),
  ),
};

function stats(values) {
  const v = [...values].sort((a, b) => a - b);
  const q = (p) => r1(quantile(v, p) ?? 0);
  return {
    min: q(0),
    p10: q(0.1),
    p25: q(0.25),
    p50: q(0.5),
    p75: q(0.75),
    p90: q(0.9),
    max: q(1),
    n_years: v.length,
  };
}
const harmonizedValues = (rows, pick) =>
  rows.filter((r) => r.series === "harmonized" && r.value !== null && pick(r)).map((r) => r.value);

export const FIXTURE_CLIMATOLOGY = {
  schema_version: "1.0",
  code_version: "sample",
  generated_at: "1970-01-01T00:00:00Z",
  region: FIXTURE_REGION.id,
  baseline_years: [2003, 2025],
  unit_week: META.harmonized.unit,
  unit_month: META.harmonized.unit.replace("per week", "per month"),
  weeks: Array.from({ length: 52 }, (_, i) => ({
    week: i + 1,
    ...stats(harmonizedValues(FIXTURE_WEEKLY.rows, (r) => "week" in r && r.week === i + 1)),
  })),
  months: Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    ...stats(harmonizedValues(FIXTURE_MONTHLY.rows, (r) => "month" in r && r.month === i + 1)),
  })),
};

const range0 = { value: 0, lo: 0, hi: 0 };
export const FIXTURE_SEASON = {
  schema_version: "1.0",
  code_version: "sample",
  generated_at: "1970-01-01T00:00:00Z",
  region: FIXTURE_REGION.id,
  definition: "The fewest weeks that hold 80% of a typical year's burning",
  critical_weeks: [15, 16, 17, 18, 19, 42, 43, 44, 45, 46],
  windows: [
    {
      id: "w1",
      label: "fixture window 1",
      start_week: 42,
      peak_week: 44,
      end_week: 46,
      share: 0.7,
      by_year: [],
      shift_days_per_decade: { start: range0, centroid: range0, end: range0 },
      sentence: "Fabricated fixture.",
    },
    {
      id: "w2",
      label: "fixture window 2",
      start_week: 15,
      peak_week: 17,
      end_week: 19,
      share: 0.2,
      by_year: [],
      shift_days_per_decade: { start: range0, centroid: range0, end: range0 },
      sentence: "Fabricated fixture.",
    },
  ],
};

// ---- trend / nowcast (fabricated) ----------------------------------------------------------

/** @returns {import("../../data/types.gen").CommonEstimate} */
const trendSummary = (pct, lo, hi) => ({
  pct_per_decade: pct,
  lo,
  hi,
  direction: lo <= 0 && hi >= 0 ? "no_clear_change" : pct > 0 ? "rising" : "falling",
});

/** @type {import("../../data/types.gen").TrendJson} */
export const FIXTURE_TREND = {
  schema_version: "1.0",
  code_version: "sample",
  generated_at: "1970-01-01T00:00:00Z",
  region: FIXTURE_REGION.id,
  years: [2003, 2025],
  annual: YEARS.map((year) => {
    const v = r1(
      FIXTURE_WEEKLY.rows
        .filter((r) => r.series === "harmonized" && r.year === year)
        .reduce((s, r) => s + (r.value ?? 0), 0),
    );
    return {
      year,
      harmonized: v,
      lo: v,
      hi: v,
      kind: "sample",
      naive_count: year < 2012 ? v * 3 : v * 6,
      naive_source: year < 2012 ? "modis" : "snpp",
    };
  }),
  naive: trendSummary(34, 21, 47),
  harmonized: trendSummary(2.5, -4, 9),
  robustness: [],
  sentence_id: "artifact_rising",
  sentence: "Fabricated fixture: the raw record seems to rise; the harmonized record shows no clear change.",
};

/** Gallery-only variants so every TrendBars look can be seen. */
export const FIXTURE_TREND_VARIANTS = [
  { label: "raw rising, harmonized no clear change", trend: FIXTURE_TREND },
  {
    label: "both falling",
    trend: { ...FIXTURE_TREND, naive: trendSummary(-18, -30, -6), harmonized: trendSummary(-12, -20, -4) },
  },
  {
    label: "harmonized rising, raw no clear change",
    trend: { ...FIXTURE_TREND, naive: trendSummary(4, -8, 15), harmonized: trendSummary(22, 9, 35) },
  },
];

/** @type {import("../../data/types.gen").NowcastJson["history"]} */
const NOWCAST_HISTORY = YEARS.map((year) => {
  if (year === 2007) return { year, value: null, kind: "missing" }; // fixture outage: skipped, not 0
  const w = FIXTURE_WEEKLY.rows.find((r) => r.series === "harmonized" && r.year === year && r.week === 45);
  return { year, value: w?.value ?? null, kind: "sample" };
});
const pastValues = NOWCAST_HISTORY.map((h) => h.value).filter((v) => v !== null);
const sortedPast = [...pastValues].sort((a, b) => a - b);

/** @returns {import("../../data/types.gen").NowcastJson} */
function nowcastWith(value, forcedStatus = undefined) {
  const percentile = value === null ? null : r1(percentileRank(value, pastValues));
  return {
    schema_version: "1.0",
    code_version: "sample",
  generated_at: "1970-01-01T00:00:00Z",
    region: FIXTURE_REGION.id,
    as_of: "2025-11-15T12:00:00Z",
    source: "VIIRS_NOAA20_NRT",
    window: { start: "2025-11-08", end: "2025-11-14", days_covered: 7 },
    value,
    lo: value === null ? null : r1(value * 0.9),
    hi: value === null ? null : r1(value * 1.1),
    unit: "Aqua-equivalent fire cell-days per 7 days",
    percentile: forcedStatus ? null : percentile,
    status: forcedStatus ?? statusFromPercentile(percentile),
    baseline_years: [2003, 2025],
    history: NOWCAST_HISTORY,
    month_to_date: { month: 11, through_day: 14, value: null, median: null, ratio: null, percentile: null },
    kind: "sample",
    input_note: "Near-real-time input; calibration fitted on science-quality data.",
    sentence: forcedStatus
      ? forcedStatus === "low_activity"
        ? "Too little burning at this time of year to rank."
        : "No near-real-time data for this week yet."
      : "Fabricated fixture sentence for this week.",
  };
}

export const FIXTURE_NOWCAST = nowcastWith(sortedPast[Math.floor(sortedPast.length * 0.85)]);

/** Gallery-only variants: one per status. */
export const FIXTURE_NOWCAST_VARIANTS = [
  { label: "below normal", nowcast: nowcastWith(r1(sortedPast[0] * 0.8)) },
  { label: "normal", nowcast: nowcastWith(sortedPast[Math.floor(sortedPast.length / 2)]) },
  { label: "above normal", nowcast: FIXTURE_NOWCAST },
  { label: "extreme", nowcast: nowcastWith(r1(sortedPast[sortedPast.length - 1] * 1.25)) },
  { label: "low activity (empty state)", nowcast: nowcastWith(2, "low_activity") },
  { label: "unavailable (empty state)", nowcast: nowcastWith(null, "unavailable") },
];
