// Shared JSON shapes are generated from contracts; JavaScript consumes them through JSDoc.
/** @typedef {import("./types.gen").CommonKind} Kind */
/** @typedef {import("./types.gen").CommonSensor} Sensor */
/** @typedef {import("./types.gen").CommonStatus} NowcastStatus */
/** @typedef {import("./types.gen").CommonDirection} Direction */
/** @typedef {import("./types.gen").CommonSentenceId} SentenceId */
/** @typedef {import("./types.gen").CommonEyesightStatus} EyesightStatus */
/** @typedef {import("./types.gen").SeriesId} SeriesId */
/** @typedef {import("./types.gen").DateRange} DateRange */
/** @typedef {import("./types.gen").CellRef} CellRef */
/** @typedef {import("./types.gen").RegionsJson["regions"][number]} Region */
/** @typedef {import("./types.gen").WeeklyJson["rows"][number] | import("./types.gen").MonthlyJson["rows"][number]} SeriesRow */
/** @typedef {import("./types.gen").WeeklyJson["series_meta"]} SeriesMeta */
/** @typedef {import("./types.gen").WeeklyJson | import("./types.gen").MonthlyJson} SeriesJson */
/** @typedef {import("./types.gen").DailyJson["kind_runs"][number]} KindRun */
/** @typedef {import("./types.gen").CommonEstimate} TrendSummary */
/** @typedef {import("./types.gen").CommonEstimate} TrendEstimate */
/** @typedef {import("./types.gen").CommonValueLoHi} Range3 */
/** @typedef {import("./types.gen").CommonKLoHi} KValue */
/** @typedef {import("./types.gen").CalibrationJson["k"]["snpp"][number]} KMonth */
/** @typedef {import("./types.gen").CommonValidationRow} ValidationRow */
/** @typedef {import("./types.gen").MethodsJson["eyesight"][number]} EyesightEntry */
/** @typedef {import("./types.gen").MethodsJson["drift"][number]} DriftRow */
/** @typedef {import("./types.gen").CommonNaiveSource} NaiveSource */
/** @typedef {import("./types.gen").WeeklyJson} WeeklyJson */
/** @typedef {import("./types.gen").MonthlyJson} MonthlyJson */
/** @typedef {import("./types.gen").DailyJson} DailyJson */
/** @typedef {import("./types.gen").ClimatologyJson} ClimatologyJson */
/** @typedef {import("./types.gen").SeasonJson} SeasonJson */
/** @typedef {import("./types.gen").TrendJson} TrendJson */
/** @typedef {import("./types.gen").RulerJson} RulerJson */
/** @typedef {import("./types.gen").NowcastJson} NowcastJson */
/** @typedef {import("./types.gen").HexJson} HexJson */
/** @typedef {import("./types.gen").CalibrationJson} CalibrationJson */
/** @typedef {import("./types.gen").DownloadsJson} DownloadsJson */
/** @typedef {import("./types.gen").MethodsJson} MethodsJson */
/** @typedef {import("./types.gen").ManifestJson} ManifestJson */
/** @typedef {{ h3_r5: string, ym: string, aqua: number, viirs: number }} CellsMonthlyRow */
/** @typedef {{ latitude: number, longitude: number, acq_date: string, acq_time: string, satellite: string, confidence: string, frp: number, daynight: string, local_day: string, h3_r6: string }} HotspotRow */
export {};
