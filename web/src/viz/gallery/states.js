export const GALLERY_STATES = ["normal", "all_missing", "estimated", "single_year", "empty"];

export const STATE_LABEL = {
  normal: "Normal (file as loaded)",
  all_missing: "All missing",
  estimated: "Estimated band (last 2 years)",
  single_year: "Single year (first year only)",
  empty: "Empty",
};

// ---- helpers ----------------------------------------------------------------------------

const round3 = (v) => Math.round(v * 1000) / 1000;

/** Give an estimate a visible band when the file has none (lo == hi). Gallery-only fabrication. */
function widen(value, lo, hi) {
  if (value === null) return { lo, hi };
  if (lo !== null && hi !== null && lo !== hi) return { lo, hi };
  return { lo: round3(value * 0.8), hi: round3(value * 1.2) };
}

function lastYears(rows, n) {
  const years = [...new Set(rows.map((r) => r.year))].sort((a, b) => a - b);
  return new Set(years.slice(-n));
}

function firstYear(rows) {
  let min;
  for (const r of rows) if (min === undefined || r.year < min) min = r.year;
  return min;
}

/** Apply a state to rows that carry year + kind. */
function applyRows(rows, state, toMissing, toEstimate) {
  const list = rows ?? [];
  switch (state) {
    case "normal":
      return [...list];
    case "all_missing":
      return list.map(toMissing);
    case "estimated": {
      const years = lastYears(list, 2);
      return list.map((r) => (years.has(r.year) && r.kind !== "missing" ? toEstimate(r) : r));
    }
    case "single_year": {
      const y = firstYear(list);
      return list.filter((r) => r.year === y);
    }
    case "empty":
      return [];
  }
}

function seriesRows(rows, state) {
  return applyRows(
    rows,
    state,
    (r) => ({ ...r, value: null, lo: null, hi: null, kind: "missing" }),
    (r) => ({ ...r, kind: "estimated", ...widen(r.value, r.lo, r.hi) }),
  );
}

function ruler(f, state) {
  return {
    ...f,
    rows: applyRows(
      f.rows,
      state,
      (r) => ({ ...r, naive_index: null, harmonized_index: null, kind: "missing" }),
      (r) => ({ ...r, kind: "estimated" }),
    ),
  };
}

function trend(f, state) {
  return {
    ...f,
    annual: applyRows(
      f.annual,
      state,
      (r) => ({ ...r, harmonized: null, lo: null, hi: null, naive_count: null, kind: "missing" }),
      (r) => ({ ...r, kind: "estimated", ...widen(r.harmonized, r.lo, r.hi) }),
    ),
  };
}

function season(f, state) {
  if (state === "empty") return { ...f, critical_weeks: [], windows: [] };
  return {
    ...f,
    windows: (f.windows ?? []).map((w) => ({
      ...w,
      // SD-13 skips years without enough activity, so "all missing" means no by_year rows.
      by_year:
        state === "all_missing"
          ? []
          : applyRows(
              w.by_year,
              state,
              (r) => ({ ...r, kind: "missing" }),
              (r) => ({ ...r, kind: "estimated" }),
            ),
    })),
  };
}

function nowcast(f, state) {
  const history = applyRows(
    f.history,
    state,
    (r) => ({ ...r, value: null, kind: "missing" }),
    (r) => ({ ...r, kind: "estimated" }),
  );
  if (state === "all_missing") {
    return {
      ...f,
      value: null,
      lo: null,
      hi: null,
      percentile: null,
      status: "unavailable",
      kind: "missing",
      history,
      month_to_date: { ...f.month_to_date, value: null, ratio: null, percentile: null },
    };
  }
  if (state === "estimated") return { ...f, kind: "estimated", ...widen(f.value, f.lo, f.hi), history };
  return { ...f, history };
}

function hex(f, state) {
  if (state === "all_missing") return { ...f, kind: "missing", cells: [] };
  if (state === "estimated") return { ...f, kind: "estimated" };
  if (state === "empty") return { ...f, cells: [] };
  return f;
}

function climatology(f, state) {
  return state === "empty" ? { ...f, weeks: [], months: [] } : f;
}

function methods(f, state) {
  const drift = (() => {
    switch (state) {
      case "all_missing":
        return f.drift.map((d) => ({ ...d, k_annual: null, lo: null, hi: null }));
      case "single_year": {
        const y = firstYear(f.drift);
        return f.drift.filter((d) => d.year === y);
      }
      case "empty":
        return [];
      default:
        return f.drift;
    }
  })();
  const eyesight = f.eyesight.map((e) => {
    switch (state) {
      case "all_missing":
        return { ...e, status: "absent", curve: [], binned: [] };
      case "estimated":
        return { ...e, status: "exploratory" };
      case "empty":
        return { ...e, curve: [], binned: [] };
      default:
        return e;
    }
  });
  return { ...f, drift, eyesight };
}

/** Build one state of the whole bundle. Absent files stay absent. */
export function bundleForState(b, state) {
  if (state === "normal") return b;
  return {
    weekly: b.weekly && { ...b.weekly, rows: seriesRows(b.weekly.rows, state) },
    monthly: b.monthly && { ...b.monthly, rows: seriesRows(b.monthly.rows, state) },
    climatology: b.climatology && climatology(b.climatology, state),
    season: b.season && season(b.season, state),
    trend: b.trend && trend(b.trend, state),
    ruler: b.ruler && ruler(b.ruler, state),
    nowcast: b.nowcast && nowcast(b.nowcast, state),
    hex: b.hex && hex(b.hex, state),
    outline: b.outline,
    methods: b.methods && methods(b.methods, state),
  };
}
