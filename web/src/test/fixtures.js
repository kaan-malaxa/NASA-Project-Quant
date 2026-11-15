// Tiny fabricated files shaped like contracts section 6. Test-only; never shipped.
const header = { schema_version: "1.0", generated_at: "2026-11-14T00:00:00Z", code_version: "test" };

export function regionsJson(overrides = {}) {
  return {
    ...header,
    regions: [
      {
        id: "testland", name: "Testland", country: "XX", bbox: [0, 0, 1, 1], centroid: [0.5, 0.5],
        fire_type: "Test burning", story: "A test region.", n_cells_r6: 10, membership: "polygon",
        last_data_day: "2026-11-13", synthetic: false,
        files: ["weekly", "trend"], optional_files: ["cells_monthly"],
        ...overrides,
      },
      {
        id: "synthland", name: "Synthland", country: "XX", bbox: [0, 0, 1, 1], centroid: [0.5, 0.5],
        fire_type: "Simulated", story: "Simulated region.", n_cells_r6: 10, membership: "bbox",
        last_data_day: "2026-11-13", synthetic: true, files: [], optional_files: [],
      },
    ],
  };
}

export function weeklyJson(kind = "observed") {
  return {
    ...header,
    region: "testland",
    series_meta: { harmonized: { label: "Harmonized record", unit: "Aqua-equivalent fire cell-days per week" } },
    rows: [{ year: 2015, week: 43, series: "harmonized", value: 3, lo: 3, hi: 3, kind, source: "aqua" }],
  };
}

export function trendJson() {
  const fig = { pct_per_decade: 1, lo: 0, hi: 2, direction: "no_clear_change" };
  return {
    ...header,
    region: "testland", years: [2003, 2025],
    annual: [{ year: 2003, harmonized: 1, lo: 1, hi: 1, kind: "observed", naive_count: 1, naive_source: "modis" }],
    harmonized: fig, naive: fig, robustness: [{ variant: "aqua_only_2003_2022", ...fig }],
    sentence_id: "unclear", sentence: "Test sentence.",
  };
}

export function manifestJson(contains_sample = false) {
  return { ...header, contains_sample, files: [] };
}
