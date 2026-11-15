// JSDoc types for web/src/viz (plan/02_CONTRACTS.md §6, §8, §9). No runtime code.
// The project is JavaScript; these typedefs give editors hints and document the contract shapes.
// When R5 generates web/src/data/types.gen.*, prefer those and keep this file in step.
// Use in a file:  /** @param {import("./types").BrokenRulerProps} props */
// A value that can be missing is `number|null` (missing is never 0).

// ---- §9 enums ----------------------------------------------------------------------------
/** @typedef {"observed"|"harmonized"|"estimated"|"missing"|"sample"} Kind */
/** @typedef {"aqua"|"terra"|"snpp"|"noaa20"|"noaa21"} Sensor */
/** @typedef {"unavailable"|"low_activity"|"below_normal"|"normal"|"above_normal"|"extreme"} NowcastStatus */
/** @typedef {"rising"|"falling"|"no_clear_change"} Direction */
/** @typedef {"validated"|"exploratory"|"absent"} EyesightStatus */
/** @typedef {"modis"|Sensor} NaiveSource  "modis" = Terra + Aqua (SD-09) */

// ---- §8 shared -----------------------------------------------------------------------------
/** @typedef {"harmonized"|"aqua_raw"|"viirs_raw"|"naive_splice"|"viirs_as_aqua"|"viirs_equiv"} SeriesId */
/** @typedef {{ from: string, to: string }} DateRange  YYYY-MM-DD */
/** @typedef {{ year: number, week?: number, month?: number }} CellRef */

// ---- §6 files (fields the charts read) -------------------------------------------------------
/**
 * @typedef {Object} SeriesRow  one row of weekly.json (`week`) or monthly.json (`month`)
 * @property {number} year
 * @property {number} [week]
 * @property {number} [month]
 * @property {Exclude<SeriesId, "naive_splice">} series
 * @property {number|null} value
 * @property {number|null} lo
 * @property {number|null} hi
 * @property {Kind} kind
 * @property {Sensor|null} source
 */
/**
 * @typedef {Object} SeriesJson  weekly.json / monthly.json
 * @property {string} region
 * @property {Object<string, {label: string, unit: string, method?: string}>} series_meta
 * @property {SeriesRow[]} rows
 */
/**
 * @typedef {Object} ClimatologyJson
 * @property {[number, number]} baseline_years
 * @property {string} unit_week
 * @property {string} unit_month
 * @property {Array<{week: number, min: number, p10: number, p25: number, p50: number, p75: number, p90: number, max: number, n_years: number}>} weeks
 * @property {Array<{month: number, min: number, p10: number, p25: number, p50: number, p75: number, p90: number, max: number, n_years: number}>} months
 */
/** @typedef {{ value: number, lo: number, hi: number }} Range3 */
/**
 * @typedef {Object} SeasonJson
 * @property {string} definition
 * @property {number[]} critical_weeks
 * @property {Array<{id: string, label: string, start_week: number, peak_week: number, end_week: number, share: number,
 *   by_year: Array<{year: number, start_doy: number, centroid_doy: number, end_doy: number, total: number, kind: Kind}>,
 *   shift_days_per_decade: {start: Range3, centroid: Range3, end: Range3}, sentence: string}>} windows
 */
/** @typedef {{ pct_per_decade: number, lo: number, hi: number, direction: Direction }} TrendSummary */
/**
 * @typedef {Object} TrendJson
 * @property {[number, number]} years
 * @property {Array<{year: number, harmonized: number|null, lo: number|null, hi: number|null, kind: Kind, naive_count: number|null, naive_source: NaiveSource}>} annual
 * @property {TrendSummary} harmonized
 * @property {TrendSummary} naive
 * @property {Array<TrendSummary & {variant: string}>} robustness
 * @property {string} sentence_id
 * @property {string} sentence
 */
/**
 * @typedef {Object} RulerJson
 * @property {[number, number]} index_base_years
 * @property {{value: number, lo: number, hi: number, years: [number, number], definition: string}} jump_multiple
 * @property {Array<{year: number, naive_index: number|null, harmonized_index: number|null, naive_source: NaiveSource, kind: Kind}>} rows
 * @property {string} sentence
 */
/**
 * @typedef {Object} NowcastJson
 * @property {string} as_of
 * @property {{start: string, end: string, days_covered: number}} window
 * @property {number|null} value
 * @property {number|null} lo
 * @property {number|null} hi
 * @property {string} unit
 * @property {number|null} percentile
 * @property {NowcastStatus} status
 * @property {[number, number]} baseline_years
 * @property {Array<{year: number, value: number|null, kind: Kind}>} history
 * @property {Kind} kind
 * @property {string} input_note
 * @property {string} sentence
 */
/**
 * @typedef {Object} HexJson
 * @property {number} resolution
 * @property {string} unit
 * @property {Array<{h3: string, critical: number, all_year: number}>} cells
 */
/** @typedef {{ region: string, sensor: Sensor, year: number, k_annual: number|null, lo: number|null, hi: number|null }} DriftRow */
/**
 * @typedef {Object} EyesightEntry  one item of methods.json → eyesight
 * @property {string} region
 * @property {EyesightStatus} status
 * @property {Array<{frp_mw: number, p: number, lo: number, hi: number}>} curve
 * @property {Array<{frp_mw: number, p_obs: number, n: number}>} binned
 */

// ---- §8 component props (exactly the contract) --------------------------------------------------
/** @typedef {{ ruler: RulerJson, animate?: boolean }} BrokenRulerProps */
/**
 * @typedef {{ weekly: SeriesJson, climatology: ClimatologyJson, season?: SeasonJson, lens: SeriesId,
 *   mode: "activity"|"anomaly", range: DateRange, currentYear: number, onSelect?: (c: CellRef) => void }} FireYearClockProps
 */
/**
 * @typedef {{ grain: "week"|"month", weekly?: SeriesJson, monthly?: SeriesJson, climatology: ClimatologyJson,
 *   season?: SeasonJson, lens: SeriesId, mode: "activity"|"anomaly", range: DateRange,
 *   onSelect?: (c: CellRef) => void }} CalendarHeatmapProps
 */
/** @typedef {{ season: SeasonJson }} SeasonShiftChartProps */
/** @typedef {{ trend: TrendJson }} TrendBarsProps */
/** @typedef {{ nowcast: NowcastJson }} PercentileStripProps */
/**
 * @typedef {{ hex: HexJson, outline?: object, metric: "critical"|"all_year", selectedCells?: string[],
 *   drawEnabled?: boolean, onAoiChange?: (cellsR5: string[]) => void }} HexMapProps
 */
/** @typedef {{ eyesight: EyesightEntry }} EyesightCurveProps */
/** @typedef {{ drift: DriftRow[], region: string, trustedThrough: string }} DriftChartProps */
/** @typedef {{ kind: Kind }} KindBadgeProps */
/** @typedef {{ scale: "activity"|"anomaly", unit: string }} LegendProps */

export {};
