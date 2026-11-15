/**
 * Data shapes from plan/02_CONTRACTS.md section 6, as JSDoc (the web app is plain JavaScript).
 * TEMPORARY hand-written copy; R1's contracts/*.schema.json are the source of truth once they land.
 * Every JSON file also has: schema_version, generated_at, code_version.
 */

/** @typedef {"observed" | "harmonized" | "estimated" | "missing" | "sample"} Kind */
/** @typedef {"aqua" | "terra" | "snpp" | "noaa20" | "noaa21"} Sensor */
/** @typedef {"unavailable" | "low_activity" | "below_normal" | "normal" | "above_normal" | "extreme"} NowcastStatus */
/** @typedef {"rising" | "falling" | "no_clear_change"} Direction */
/** @typedef {"artifact_flat" | "artifact_rising" | "artifact_falling" | "agree" | "unclear"} SentenceId */
/** @typedef {"validated" | "exploratory" | "absent"} EyesightStatus */
/** @typedef {"harmonized" | "aqua_raw" | "viirs_raw" | "naive_splice" | "viirs_as_aqua" | "viirs_equiv"} SeriesId */
/** @typedef {{ from: string, to: string }} DateRange */
/** @typedef {{ year: number, week?: number, month?: number }} CellRef */

/**
 * @typedef {{ id: string, name: string, country: string, bbox: number[], centroid: number[], fire_type: string,
 *   story: string, n_cells_r6: number, membership: "polygon" | "bbox", last_data_day: string, synthetic: boolean,
 *   files: string[], optional_files: string[] }} Region
 * @typedef {{ regions: Region[] }} RegionsJson
 */

/**
 * @typedef {{ label: string, unit: string, method?: "tier1" | "tier2" }} SeriesMeta
 * @typedef {{ year: number, week: number, series: string, value: number | null, lo: number | null,
 *   hi: number | null, kind: Kind, source: string | null }} WeeklyRow
 * @typedef {{ region: string, series_meta: Record<string, SeriesMeta>, rows: WeeklyRow[] }} WeeklyJson
 * @typedef {{ year: number, month: number, series: string, value: number | null, lo: number | null,
 *   hi: number | null, kind: Kind, source: string | null }} MonthlyRow
 * @typedef {{ region: string, series_meta: Record<string, SeriesMeta>, rows: MonthlyRow[] }} MonthlyJson
 */

/**
 * @typedef {{ unit: string, value: (number | null)[], lo?: (number | null)[], hi?: (number | null)[] }} DailySeries
 * @typedef {{ series: string, from: string, to: string, kind: Kind, source: string | null }} KindRun
 * @typedef {{ region: string, start: string, n_days: number, series: Record<string, DailySeries>,
 *   kind_runs: KindRun[] }} DailyJson
 */

/**
 * @typedef {{ min: number, p10: number, p25: number, p50: number, p75: number, p90: number, max: number,
 *   n_years: number }} Pctiles
 * @typedef {{ region: string, baseline_years: number[], unit_week: string, unit_month: string,
 *   weeks: (Pctiles & { week: number })[], months: (Pctiles & { month: number })[] }} ClimatologyJson
 */

/**
 * @typedef {{ value: number, lo: number, hi: number }} Range3
 * @typedef {{ id: string, label: string, start_week: number, peak_week: number, end_week: number, share: number,
 *   by_year: { year: number, start_doy: number, centroid_doy: number, end_doy: number, total: number, kind: Kind }[],
 *   shift_days_per_decade: { start: Range3, centroid: Range3, end: Range3 }, sentence: string }} SeasonWindow
 * @typedef {{ region: string, definition: string, critical_weeks: number[], windows: SeasonWindow[] }} SeasonJson
 */

/**
 * @typedef {{ pct_per_decade: number, lo: number, hi: number, direction: Direction }} TrendFigure
 * @typedef {{ region: string, years: number[],
 *   annual: { year: number, harmonized: number, lo: number, hi: number, kind: Kind, naive_count: number,
 *     naive_source: string }[],
 *   harmonized: TrendFigure, naive: TrendFigure, robustness: (TrendFigure & { variant: string })[],
 *   sentence_id: SentenceId, sentence: string }} TrendJson
 */

/**
 * @typedef {{ region: string, index_base_years: number[],
 *   jump_multiple: { value: number, lo: number, hi: number, years: number[], definition: string },
 *   rows: { year: number, naive_index: number, harmonized_index: number, naive_source: string, kind: Kind }[],
 *   sentence: string }} RulerJson
 */

/**
 * @typedef {{ region: string, as_of: string, source: string,
 *   window: { start: string, end: string, days_covered: number },
 *   value: number | null, lo: number | null, hi: number | null, unit: string, percentile: number | null,
 *   status: NowcastStatus, baseline_years: number[], history: { year: number, value: number, kind: Kind }[],
 *   month_to_date: { month: number, through_day: number, value: number, median: number, ratio: number | null,
 *     percentile: number },
 *   kind: Kind, input_note: string, sentence: string }} NowcastJson
 */

/**
 * @typedef {{ region: string, resolution: number, unit: string, source: string, years: number[], kind: Kind,
 *   cells: { h3: string, critical: number, all_year: number }[] }} HexJson
 */

/**
 * @typedef {{ k: number, lo: number, hi: number }} KValue
 * @typedef {{ month: number, k: number, lo: number, hi: number, aqua_celldays: number, viirs_celldays: number }} KMonth
 * @typedef {{ region: string, reference: string, count_resolution: number, shrinkage_n0: number,
 *   eras: { from: string, to: string | null, source: string, kind: Kind }[],
 *   fit_window: Record<string, string[]>, noaa20_method: string,
 *   k_annual: Record<string, KValue>, k: Record<string, KMonth[]> }} CalibrationJson
 */

/**
 * @typedef {{ region: string, hotspot_archives: { year: number, sensor: string, url: string, rows: number,
 *   bytes: number }[] }} DownloadsJson
 * @typedef {{ h3_r5: string, ym: string, aqua: number, viirs: number }} CellsMonthlyRow
 * @typedef {{ latitude: number, longitude: number, acq_date: string, acq_time: string, satellite: string,
 *   confidence: string, frp: number, daynight: string, local_day: string, h3_r6: string }} HotspotRow
 */

/**
 * @typedef {{ region: string, test: string, method: "tier1" | "tier2" | "none", value: number,
 *   baselines?: Record<string, number>, n: number, years: number[], note: string }} ValidationRow
 * @typedef {{ region: string, status: EyesightStatus, params: Record<string, number>, g: number, n_celldays: number,
 *   curve: { frp_mw: number, p: number, lo: number, hi: number }[], binned: { frp_mw: number, p_obs: number, n: number }[],
 *   k_compare: { month: number, k_tier1: number, k_tier2: number }[] }} EyesightEntry
 * @typedef {{ decisions: { reference: string, count_resolution: number, aqua_trusted_through: string,
 *     snpp_through: string, baseline_years: number[], science_yaml_sha256: string },
 *   validation: ValidationRow[],
 *   drift: { region: string, sensor: string, year: number, k_annual: number, lo: number, hi: number }[],
 *   eyesight: EyesightEntry[],
 *   planted_truth: { quantity: string, truth: number, recovered: number, tolerance: number, pass: boolean }[],
 *   inputs: { source: string, region: string, rows: number, first_date: string, last_date: string,
 *     downloaded: string, via: string }[],
 *   filters: { region: string, sensor: string, step: string, rows_in: number, rows_dropped: number }[],
 *   sources: { claim_id: string, text: string, url: string, checked: string }[],
 *   limitations: string[], ai_use: string }} MethodsJson
 */

/**
 * @typedef {{ contains_sample: boolean, files: { path: string, sha256: string, bytes: number, kinds: Kind[] }[] }} ManifestJson
 */

export {};
