// The ONE function that maps a calendar cell to its style. CalendarHeatmap and FireYearClock both
// use it, so the two can never disagree (role file §10: "Clock = heatmap, identical style object").

import { KIND_STYLE, UNRANKED_STYLE, ZERO_STYLE } from "./theme";

const isNum = (v) => typeof v === "number" && Number.isFinite(v);

/**
 * Style of one cell.
 * - Missing (kind missing, or value null): the hatch, never a ramp colour. Never drawn as zero.
 * - Activity: exactly 0 → ZERO_STYLE ("covered, nothing burning"); otherwise the activity ramp.
 * - Anomaly: low-activity or unrankable → UNRANKED_STYLE; otherwise the anomaly ramp.
 * - Estimated: the same fill, lighter, with a dashed outline.
 */
export function cellStyle(c, mode, scales) {
  if (c.kind === "missing" || !isNum(c.value)) {
    const m = KIND_STYLE.missing;
    return { state: "missing", fill: m.fill, fillOpacity: 1, stroke: "none", strokeWidth: 0 };
  }

  let base;
  if (mode === "anomaly") {
    if (c.unranked || !isNum(c.percentile)) {
      base = {
        state: "unranked",
        fill: UNRANKED_STYLE.fill,
        fillOpacity: 1,
        stroke: UNRANKED_STYLE.stroke,
        strokeWidth: UNRANKED_STYLE.strokeWidth,
        strokeDasharray: UNRANKED_STYLE.strokeDasharray,
      };
    } else {
      base = {
        state: "value",
        fill: scales.anomaly(c.percentile),
        fillOpacity: 1,
        stroke: "none",
        strokeWidth: 0,
      };
    }
  } else if (c.value === 0) {
    base = {
      state: "zero",
      fill: ZERO_STYLE.fill,
      fillOpacity: 1,
      stroke: ZERO_STYLE.stroke,
      strokeWidth: ZERO_STYLE.strokeWidth,
    };
  } else {
    base = { state: "value", fill: scales.activity(c.value), fillOpacity: 1, stroke: "none", strokeWidth: 0 };
  }

  if (c.kind === "estimated") {
    const e = KIND_STYLE.estimated;
    return {
      ...base,
      fillOpacity: e.fillOpacity,
      stroke: e.stroke,
      strokeWidth: e.strokeWidth,
      strokeDasharray: e.strokeDasharray,
    };
  }
  return base;
}

/**
 * SD-11 low_activity threshold for a period, in the period's own unit.
 * SD-11 states it per 7 days (5 cell-days); a month scales it by its length (non-leap year).
 */
export function lowActivityThreshold(grain, period, threshold = null, factor = 1) {
  if (threshold === null || !Number.isFinite(factor)) return null;
  if (grain === "week") return threshold * factor;
  const days = new Date(Date.UTC(2001, period, 0)).getUTCDate();
  return (threshold * days * factor) / 7;
}

/** SD-11 low_activity: x < threshold AND the climatological p90 < threshold. */
export function isLowActivity(value, p90, threshold) {
  return isNum(threshold) && isNum(p90) && p90 < threshold && value < threshold;
}

/** Convert the configured Aqua-scale threshold to the selected lens using its exported calibration. */
export function lensActivityThreshold({grain, period, year, lens, source, configuration, calibration}) {
  const threshold = configuration?.anomaly?.low_activity_threshold;
  if (!isNum(threshold)) return null;
  const weekDays = configuration.timebins?.week_days;
  if (!isNum(weekDays)) return null;
  const start = grain === "month" ? new Date(Date.UTC(year, period - 1, 1)) :
    new Date(Date.UTC(year, 0, 1 + (period - 1) * weekDays));
  const nDays = grain === "month" ? new Date(Date.UTC(year, period, 0)).getUTCDate() :
    period === configuration.timebins?.weeks_per_year ?
      Math.round((Date.UTC(year + 1, 0, 1) - start.getTime()) / 86400000) : weekDays;
  const viirs = lens === "viirs_equiv" || lens === "viirs_raw" ||
    (lens === "naive_splice" && year >= Number(configuration.eras?.snpp_first_day?.slice(0, 4)));
  let factor = 1;
  if (viirs) {
    const sensor = source === "noaa20" ? "noaa20" : "snpp";
    factor = 0;
    for (let i = 0; i < nDays; i++) {
      const month = new Date(start.getTime() + i * 86400000).getUTCMonth() + 1;
      const k = calibration?.k?.[sensor]?.find((entry) => entry.month === month)?.k ?? calibration?.k_annual?.[sensor]?.k;
      if (!(k > 0)) return null;
      factor += 1 / k / nDays;
    }
  }
  return threshold * factor * (grain === "month" ? nDays / weekDays : 1);
}
