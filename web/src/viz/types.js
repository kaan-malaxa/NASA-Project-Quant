// Data types are aliases to the generated shared contracts.
/** @typedef {import("../data/types").Kind} Kind */
/** @typedef {import("../data/types").Sensor} Sensor */
/** @typedef {import("../data/types").NowcastStatus} NowcastStatus */
/** @typedef {import("../data/types").Direction} Direction */
/** @typedef {import("../data/types").EyesightStatus} EyesightStatus */
/** @typedef {import("../data/types").NaiveSource} NaiveSource */
/** @typedef {import("../data/types").SeriesId} SeriesId */
/** @typedef {import("../data/types").DateRange} DateRange */
/** @typedef {import("../data/types").CellRef} CellRef */
/** @typedef {import("../data/types").SeriesRow} SeriesRow */
/** @typedef {import("../data/types").SeriesJson} SeriesJson */
/** @typedef {import("../data/types").ClimatologyJson} ClimatologyJson */
/** @typedef {import("../data/types").Range3} Range3 */
/** @typedef {import("../data/types").SeasonJson} SeasonJson */
/** @typedef {import("../data/types").TrendSummary} TrendSummary */
/** @typedef {import("../data/types").TrendJson} TrendJson */
/** @typedef {import("../data/types").RulerJson} RulerJson */
/** @typedef {import("../data/types").NowcastJson} NowcastJson */
/** @typedef {import("../data/types").HexJson} HexJson */
/** @typedef {import("../data/types").DriftRow} DriftRow */
/** @typedef {import("../data/types").EyesightEntry} EyesightEntry */
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
