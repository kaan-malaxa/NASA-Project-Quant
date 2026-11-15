/**
 * Test data for the end-to-end tests, served by intercepting requests to data/ (web/public/data is R1's folder and
 * is not touched). Shapes follow contracts section 6. Numbers are deterministic filler, not results.
 *
 * buildFiles({ sample: true })  -> every file marked sample (code_version "sample", kind "sample"), as R1's sample data
 * buildFiles({ sample: false }) -> the same files marked as a real build (code_version "e2e", real kinds), so the
 *                                  SAMPLE banner can be tested as absent. Used only inside these tests.
 */

const LAST = "2026-11-13";
const DAYS = 8718; // 2003-01-01 .. 2026-11-13
const SERIES = ["aqua_raw", "viirs_raw", "viirs_as_aqua", "harmonized", "viirs_equiv"];

function meta(per) {
  return {
    aqua_raw: { label: "MODIS Aqua, as recorded", unit: `fire cell-days per ${per}` },
    viirs_raw: { label: "VIIRS, as recorded", unit: `fire cell-days per ${per}` },
    viirs_as_aqua: {
      label: "VIIRS translated to the Aqua scale",
      unit: `Aqua-equivalent fire cell-days per ${per}`,
    },
    harmonized: { label: "Harmonized record", unit: `Aqua-equivalent fire cell-days per ${per}` },
    viirs_equiv: {
      label: "What VIIRS would have seen",
      unit: `VIIRS-equivalent fire cell-days per ${per}`,
      method: "tier1",
    },
  };
}

export function buildFiles({ sample }) {
  const head = {
    schema_version: "1.0",
    generated_at: "2026-11-14T00:00:00Z",
    code_version: sample ? "sample" : "e2e",
  };
  const k = (real) => (sample ? "sample" : real);
  const files = {};
  const put = (path, obj) => (files[path] = { body: JSON.stringify(obj), type: "application/json" });

  const regions = [
    {
      id: "alpha",
      name: "Alpha test region",
      poly: [
        [
          [74, 28],
          [77.5, 28.5],
          [77, 32.5],
          [74.5, 32],
          [74, 28],
        ],
      ],
    },
    {
      id: "beta",
      name: "Beta test region",
      poly: [
        [
          [-122, 37],
          [-118, 36],
          [-117, 41],
          [-121, 42],
          [-122, 37],
        ],
      ],
    },
  ];
  const listed = [
    "weekly",
    "monthly",
    "daily",
    "climatology",
    "season",
    "trend",
    "ruler",
    "nowcast",
    "hex",
    "calibration",
    "outline",
  ];
  put("regions.json", {
    ...head,
    regions: regions.map((r) => ({
      id: r.id,
      name: r.name,
      country: "XX",
      bbox: [0, 0, 1, 1],
      centroid: [75, 30],
      fire_type: "Test fire type",
      story: "Test story for end-to-end checks.",
      n_cells_r6: 10,
      membership: "polygon",
      last_data_day: LAST,
      synthetic: false,
      files: listed,
      optional_files: [],
    })),
  });
  put("manifest.json", {
    ...head,
    contains_sample: sample,
    files: [{ path: "numbers_audit.md", sha256: "0", bytes: 24, kinds: [] }],
  });
  put("methods.json", {
    ...head,
    decisions: {
      reference: "MODIS Aqua, daytime",
      count_resolution: 6,
      aqua_trusted_through: "2022-12-31",
      snpp_through: "2025-12-31",
      baseline_years: [2003, 2025],
      science_yaml_sha256: "0000",
    },
    validation: [
      {
        region: "alpha",
        test: "loyo_weekly_wape",
        method: "tier1",
        value: 0.2,
        baselines: { raw_viirs: 0.5, annual_ratio: 0.25 },
        n: 520,
        years: [2013, 2022],
        note: "",
      },
    ],
    drift: [{ region: "alpha", sensor: "snpp", year: 2013, k_annual: 0.5, lo: 0.45, hi: 0.55 }],
    eyesight: [
      { region: "alpha", status: "exploratory", k_compare: [{ month: 1, k_tier1: 0.5, k_tier2: 0.55 }] },
    ],
    planted_truth: [{ quantity: "k_annual_snpp", truth: 0.5, recovered: 0.49, tolerance: 0.03, pass: true }],
    inputs: [
      {
        source: "MODIS_SP",
        region: "alpha",
        rows: 100,
        first_date: "2003-01-01",
        last_date: "2025-12-31",
        downloaded: "2026-11-14",
        via: "archive",
      },
    ],
    filters: [{ region: "alpha", sensor: "aqua", step: "confidence", rows_in: 100, rows_dropped: 3 }],
    sources: [
      { claim_id: "snpp_end", text: "Test claim text.", url: "https://example.org/", checked: "2026-11-14" },
    ],
    limitations: ["Test limitation."],
    ai_use: "Test AI-use text.",
  });
  files["numbers_audit.md"] = { body: "# Numbers audit (test)\n", type: "text/markdown" };

  for (const r of regions) {
    const kindAt = (y) => (y <= 2022 ? k("observed") : k("harmonized"));
    const rows = (grain, n) => {
      const out = [];
      for (let y = 2003; y <= 2026; y++) {
        for (let s = 1; s <= n; s++) {
          if (y === 2026 && s > (grain === "week" ? 45 : 11)) continue;
          for (const se of SERIES) {
            const v = ((y * 31 + s * 7) % 50) + 1;
            out.push({
              year: y,
              [grain]: s,
              series: se,
              value: v,
              lo: v,
              hi: v,
              kind: kindAt(y),
              source: y <= 2022 ? "aqua" : "snpp",
            });
          }
        }
      }
      return out;
    };
    put(`${r.id}/weekly.json`, { ...head, region: r.id, series_meta: meta("week"), rows: rows("week", 52) });
    put(`${r.id}/monthly.json`, {
      ...head,
      region: r.id,
      series_meta: meta("month"),
      rows: rows("month", 12),
    });
    const value = Array.from({ length: DAYS }, (_, i) => (i % 97 === 0 ? null : (i % 40) / 4));
    put(`${r.id}/daily.json`, {
      ...head,
      region: r.id,
      start: "2003-01-01",
      n_days: DAYS,
      series: { harmonized: { unit: "Aqua-equivalent fire cell-days per day", value, lo: value, hi: value } },
      kind_runs: [
        { series: "harmonized", from: "2003-01-01", to: "2022-12-31", kind: k("observed"), source: "aqua" },
        { series: "harmonized", from: "2023-01-01", to: LAST, kind: k("harmonized"), source: "snpp" },
      ],
    });
    const p = { min: 0, p10: 1, p25: 2, p50: 3, p75: 4, p90: 5, max: 6, n_years: 23 };
    put(`${r.id}/climatology.json`, {
      ...head,
      region: r.id,
      baseline_years: [2003, 2025],
      unit_week: "Aqua-equivalent fire cell-days per week",
      unit_month: "Aqua-equivalent fire cell-days per month",
      weeks: Array.from({ length: 52 }, (_, i) => ({ week: i + 1, ...p })),
      months: Array.from({ length: 12 }, (_, i) => ({ month: i + 1, ...p })),
    });
    const zero = { value: 0, lo: 0, hi: 0 };
    put(`${r.id}/season.json`, {
      ...head,
      region: r.id,
      definition: "The fewest weeks that hold 80% of a typical year's burning",
      critical_weeks: [42, 43, 44],
      windows: [
        {
          id: "w1",
          label: "test window",
          start_week: 42,
          peak_week: 43,
          end_week: 44,
          share: 0.7,
          by_year: [
            { year: 2003, start_doy: 290, centroid_doy: 300, end_doy: 310, total: 10, kind: k("observed") },
          ],
          shift_days_per_decade: { start: zero, centroid: zero, end: zero },
          sentence: "Test window sentence.",
        },
      ],
    });
    const fig = (d) => ({ pct_per_decade: 1, lo: -2, hi: 4, direction: d });
    put(`${r.id}/trend.json`, {
      ...head,
      region: r.id,
      years: [2003, 2025],
      annual: [
        {
          year: 2003,
          harmonized: 10,
          lo: 10,
          hi: 10,
          kind: k("observed"),
          naive_count: 10,
          naive_source: "modis",
        },
      ],
      harmonized: fig("no_clear_change"),
      naive: fig("no_clear_change"),
      robustness: [{ variant: "aqua_only_2003_2022", ...fig("no_clear_change") }],
      sentence_id: "unclear",
      sentence: "Test verdict sentence.",
    });
    put(`${r.id}/ruler.json`, {
      ...head,
      region: r.id,
      index_base_years: [2003, 2011],
      jump_multiple: { value: 2, lo: 1.8, hi: 2.2, years: [2013, 2022], definition: "Test definition" },
      rows: Array.from({ length: 23 }, (_, i) => 2003 + i).map((year) => ({
        year,
        naive_index: year < 2012 ? 1 : 3,
        harmonized_index: 1,
        naive_source: year < 2012 ? "modis" : "snpp",
        kind: k(year <= 2022 ? "observed" : "harmonized"),
      })),
      sentence: "Test ruler sentence.",
    });
    put(`${r.id}/nowcast.json`, {
      ...head,
      region: r.id,
      as_of: "2026-11-14T12:00:00Z",
      source: "VIIRS_NOAA20_NRT",
      window: { start: "2026-11-07", end: LAST, days_covered: 7 },
      value: 12,
      lo: 10,
      hi: 14,
      unit: "Aqua-equivalent fire cell-days per 7 days",
      percentile: 60,
      status: "normal",
      baseline_years: [2003, 2025],
      history: [{ year: 2003, value: 1, kind: k("observed") }],
      month_to_date: { month: 11, through_day: 13, value: 40, median: 35, ratio: 1.14, percentile: 60 },
      kind: k("harmonized"),
      input_note: "Test input note.",
      sentence: "Test nowcast sentence.",
    });
    put(`${r.id}/hex.json`, {
      ...head,
      region: r.id,
      resolution: 5,
      unit: "VIIRS fire cell-days per year",
      source: "snpp",
      years: [2013, 2025],
      kind: k("observed"),
      cells: [{ h3: "85283473fffffff", critical: 1, all_year: 2 }],
    });
    const months = Array.from({ length: 12 }, (_, i) => i + 1);
    const kRow = (month) => ({ month, k: 0.5, lo: 0.45, hi: 0.55, aqua_celldays: 100, viirs_celldays: 200 });
    put(`${r.id}/calibration.json`, {
      ...head,
      region: r.id,
      reference: "aqua_day",
      count_resolution: 6,
      shrinkage_n0: 50,
      eras: [
        { from: "2003-01-01", to: "2022-12-31", source: "aqua", kind: k("observed") },
        { from: "2023-01-01", to: null, source: "snpp", kind: k("harmonized") },
      ],
      fit_window: { snpp: ["2013-01-01", "2022-12-31"], noaa20: ["2019-01-01", "2022-12-31"] },
      noaa20_method: "direct",
      k_annual: { snpp: { k: 0.5, lo: 0.45, hi: 0.55 }, noaa20: { k: 0.5, lo: 0.45, hi: 0.55 } },
      k: { snpp: months.map(kRow), noaa20: months.map(kRow) },
    });
    files[`${r.id}/outline.geojson`] = {
      body: JSON.stringify({
        type: "FeatureCollection",
        features: [{ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: r.poly } }],
      }),
      type: "application/geo+json",
    };
  }
  return files;
}

/** Serve buildFiles(...) for every request to .../data/...; anything not in the set is a 404 (and fails the test). */
export async function serveData(page, opts = { sample: true }) {
  const files = buildFiles({ sample: opts.sample ?? true });
  // The landing loader shows once per session; tests skip it unless they are about it ({ showLoader: true }).
  if (!opts.showLoader)
    await page.addInitScript(() => sessionStorage.setItem("firerosetta-landing-loader", "1"));
  await page.route(/\/data\//, (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^.*?\/data\//, "");
    const f = files[path];
    return f
      ? route.fulfill({ status: 200, contentType: f.type, body: f.body })
      : route.fulfill({ status: 404, body: "not found" });
  });
}
