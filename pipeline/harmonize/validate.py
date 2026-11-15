"""V1–V6 diagnostics on observed US counts; no file IO or fitted-truth inputs.

LOYO refits both the monthly model and its annual baseline with the entire
test year removed. Paired observations share a coverage mask before common's
coverage scaling. Point fits supplied by the stage are used only in V2/V3.
"""

from dataclasses import dataclass

import numpy as np
import pandas as pd

from pipeline.common.timebins import aggregate as common_aggregate
from pipeline.common.timebins import week_of_year
from pipeline.harmonize.calibrate import daily_counts, fit_k, paired_fit_days
from pipeline.harmonize.series import region_in_scope

PREDICTIONS = ("tier1", "raw_viirs", "annual_ratio")
VALUE_COLUMNS = ("observed", *PREDICTIONS)


@dataclass
class LoyoResult:
    weekly: pd.DataFrame
    annual: pd.DataFrame
    folds: dict
    unavailable: dict
    backcast_weekly: pd.DataFrame


@dataclass
class ValidationResult:
    document: dict
    loyo: LoyoResult
    overlay: pd.DataFrame
    aqua_trusted_through: str


def loyo_predictions(aqua_daily, snpp_daily, science, *, aggregate=common_aggregate):
    """Refit independently per held-out year; retain fold factors for auditing."""
    start, end = map(pd.Timestamp, science["tier1"]["snpp_fit"])
    pairs = paired_fit_days(aqua_daily, snpp_daily, start, end)
    frames, inverse_frames, folds, unavailable = [], [], {}, {}
    for year in range(start.year, end.year + 1):
        try:
            monthly, annual = fit_k(
                aqua_daily, snpp_daily, start, end, science["tier1"]["n0"], exclude_years=(year,)
            )
        except ValueError as exc:
            if "total VIIRS cell-days is zero" not in str(exc):
                raise
            unavailable[year] = str(exc)
            continue
        train = pairs.loc[~pairs["local_day"].dt.year.eq(year)]
        folds[year] = {
            "k_annual": annual,
            "k": monthly.copy(),
            "training_years": sorted(int(y) for y in train["local_day"].dt.year.unique()),
            "training_days": len(train),
        }
        held = pairs.loc[pairs["local_day"].dt.year.eq(year)].copy()
        factors = (
            held["local_day"].dt.month.map(monthly.set_index("month")["k"])
            if science["tier1"]["monthly"]
            else pd.Series(annual, index=held.index)
        )
        frames.append(
            pd.DataFrame(
                {
                    "local_day": held["local_day"],
                    "observed": held["count_aqua"],
                    "tier1": held["count_viirs"] * factors,
                    "raw_viirs": held["count_viirs"],
                    "annual_ratio": held["count_viirs"] * annual,
                }
            )
        )
        valid = factors.gt(0)
        inverse_frames.append(
            pd.DataFrame(
                {
                    "local_day": held.loc[valid, "local_day"],
                    "observed": held.loc[valid, "count_viirs"],
                    "tier1": held.loc[valid, "count_aqua"] / factors.loc[valid],
                }
            )
        )
    daily = (
        pd.concat(frames, ignore_index=True)
        if frames
        else pd.DataFrame(columns=["local_day", *VALUE_COLUMNS])
    )
    weekly = aggregate(daily, grain="week", value_cols=VALUE_COLUMNS)
    annual = aggregate(daily, grain="year", value_cols=VALUE_COLUMNS)
    inverse = (
        pd.concat(inverse_frames, ignore_index=True)
        if inverse_frames
        else pd.DataFrame(columns=["local_day", "observed", "tier1"])
    )
    backcast_weekly = aggregate(inverse, grain="week", value_cols=("observed", "tier1"))
    return LoyoResult(weekly, annual, folds, unavailable, backcast_weekly)


def yearly_drift(counts, science, n20_first_full_year):
    """Raw paired annual ratios, with reproducible within-year week bootstraps."""
    first, fit_end = map(pd.Timestamp, science["tier1"]["snpp_fit"])
    observed = counts["aqua"].loc[counts["aqua"]["covered"], "local_day"]
    empty = {"mean_k_fit_window": None, "departure_pct_by_year": {}}
    if observed.empty:
        return [], empty
    last = pd.Timestamp(max(observed))
    end = pd.Timestamp(year=last.year, month=12, day=31)
    b = science["validation"]["drift_bootstrap_b"]
    if not isinstance(b, int) or isinstance(b, bool) or b <= 0:
        raise ValueError("validation.drift_bootstrap_b must be a positive integer")
    entries = []
    for sensor_index, sensor in enumerate(("snpp", "noaa20")):
        if sensor == "noaa20" and n20_first_full_year is None:
            continue
        sensor_start = first.year if sensor == "snpp" else max(first.year, n20_first_full_year)
        pairs = paired_fit_days(counts["aqua"], counts[sensor], first, end)
        pairs["year"] = pairs["local_day"].dt.year
        # Binning labels are owned by common; these sums deliberately do not
        # coverage-scale or discard short weeks from the raw annual ratio.
        pairs["week"] = pairs["local_day"].map(week_of_year)
        blocks = pairs.groupby(["year", "week"])[["count_aqua", "count_viirs"]].sum()
        for year in range(sensor_start, last.year + 1):
            entry = {"year": year, "sensor": sensor, "k_annual": None, "lo": None, "hi": None}
            if year in blocks.index.get_level_values("year"):
                sums = blocks.loc[year].to_numpy(dtype=float)
                total_aqua, total_viirs = sums.sum(axis=0)
                if total_viirs > 0:
                    entry["k_annual"] = float(total_aqua / total_viirs)
                    rng = np.random.default_rng(np.random.SeedSequence([science["seed"], sensor_index, year]))
                    sampled = sums[rng.integers(len(sums), size=(b, len(sums)))].sum(axis=1)
                    defined = sampled[:, 1] > 0
                    ratios = sampled[defined, 0] / sampled[defined, 1]
                    if len(ratios):
                        entry["lo"], entry["hi"] = map(
                            float, np.percentile(ratios, science["tier1"]["interval_percentiles"])
                        )
            entries.append(entry)
    snpp = [entry for entry in entries if entry["sensor"] == "snpp"]
    fit_values = [
        entry["k_annual"]
        for entry in snpp
        if first.year <= entry["year"] <= fit_end.year and entry["k_annual"] is not None
    ]
    mean = float(np.mean(fit_values)) if fit_values else None
    summary = {
        "mean_k_fit_window": mean,
        "departure_pct_by_year": {
            str(entry["year"]): (
                float(100 * (entry["k_annual"] / mean - 1))
                if mean is not None and mean > 0 and entry["k_annual"] is not None
                else None
            )
            for entry in snpp
            if entry["year"] > fit_end.year
        },
    }
    return entries, summary


def saturation_rows(
    celldays, coverage, aqua_daily, region_cells, science, region, *, aggregate=common_aggregate, pass_=None
):
    """Peak-week active fractions; a complete region inventory is mandatory."""
    start, end = science["tier1"]["snpp_fit"]
    years = [pd.Timestamp(start).year, pd.Timestamp(end).year]
    dates = pd.to_datetime(aqua_daily["local_day"])
    aqua = aqua_daily.loc[dates.between(start, end), ["local_day", "count", "covered"]].copy()
    aqua["value"] = aqua["count"].where(aqua["covered"])
    weekly = aggregate(aqua, grain="week", value_cols=("value",))
    climatology = weekly.groupby("week")["value"].mean().dropna()
    peak = int(climatology.idxmax()) if len(climatology) else None
    rows = []
    for sensor in ("aqua", "snpp"):
        for resolution in (science["grid"]["count_res"], science["grid"]["map_res"]):
            column = f"h3_r{resolution}"
            entry = {
                "region": region,
                "test": f"saturation_r{resolution}",
                "method": "none",
                "value": None,
                "n": 0,
                "years": years,
                "note": f"sensor={sensor}; peak Aqua week={peak}; n=valid fit years. ",
            }
            if region_cells is None or region_cells.empty:
                entry["note"] += (
                    "Unavailable: no R2-attested US region_cells.parquet / supplied US polygon; "
                    "a full-region denominator cannot be inferred from detected cells."
                )
            elif peak is None:
                entry["note"] += "Unavailable: no Aqua fit-window week meets common coverage requirements."
            else:
                inventory = region_cells[["h3_r6", "h3_r5"]]
                if inventory.isna().any().any() or inventory["h3_r6"].duplicated().any():
                    raise ValueError("Region-cell inventory must contain unique, non-null resolution-6 cells")
                if celldays is None or coverage is None:
                    raise ValueError(
                        "Saturation with an inventory requires the matching cell-days and coverage"
                    )
                selected_dates = pd.to_datetime(celldays["local_day"])
                selected = celldays.loc[
                    selected_dates.between(start, end)
                    & celldays["sensor"].eq(sensor)
                    & celldays["daynight"].eq(pass_ or science["reference"]["pass"])
                    & selected_dates.isin(
                        pd.to_datetime(
                            coverage.loc[coverage["sensor"].eq(sensor) & coverage["covered"], "local_day"]
                        )
                    )
                ].copy()
                parents = selected["h3_r6"].map(inventory.set_index("h3_r6")["h3_r5"])
                if parents.isna().any() or not parents.eq(selected["h3_r5"]).all():
                    raise ValueError("Active cell-days do not match the supplied US region-cell inventory")
                projected = selected.assign(h3_r6=selected[column])
                counts = daily_counts(projected, coverage, sensor, pass_ or science["reference"]["pass"])
                dates = pd.to_datetime(counts["local_day"])
                counts = counts.loc[dates.between(start, end)].rename(columns={"count": "value"})
                bins = aggregate(counts, grain="week", value_cols=("value",))
                values = bins.loc[bins["week"].eq(peak), "value"].dropna()
                denominator = inventory[column].nunique()
                if len(values):
                    entry["value"] = float((values / science["timebins"]["week_days"] / denominator).mean())
                entry["n"] = len(values)
                entry["note"] += (
                    f"{denominator} region cells; equal-weight mean across years of covered-day "
                    "mean active-cell fraction; uncovered days excluded, covered zero-count days retained."
                )
            rows.append(entry)
    return rows


def _scores(frame, predicted):
    """Undefined denominators/correlations remain null, including empty bins."""
    paired = frame[["observed", predicted]].dropna()
    obs, pred = (paired[column].to_numpy(dtype=float) for column in ("observed", predicted))
    total = obs.sum()
    return {
        "wape": float(np.abs(pred - obs).sum() / total) if total > 0 else None,
        "bias": float((pred - obs).sum() / total) if total > 0 else None,
        "r": (
            float(np.corrcoef(obs, pred)[0, 1])
            if len(obs) > 1 and np.ptp(obs) > 0 and np.ptp(pred) > 0
            else None
        ),
    }


def _step(annual, science):
    """Adjacent configured-length windows, also sampled across the baseline."""
    size = science["validation"]["step_window_years"]
    if not isinstance(size, int) or isinstance(size, bool) or size <= 0:
        raise ValueError("validation.step_window_years must be a positive integer")
    splice = pd.Timestamp(science["eras"]["snpp_first_day"]).year
    first = pd.Timestamp(science["eras"]["record_start"]).year

    def ratio(start):
        before = annual.reindex(range(start, start + size))
        after = annual.reindex(range(start + size, start + 2 * size))
        if before.isna().any() or after.isna().any() or before.mean() <= 0:
            return None
        return float(after.mean() / before.mean())

    historical = [
        value for start in range(first, splice - 2 * size + 1) if (value := ratio(start)) is not None
    ]
    percentiles = science["tier1"]["interval_percentiles"]
    variation = (
        " to ".join(f"{value:.6g}" for value in np.percentile(historical, percentiles))
        if historical
        else "unavailable (insufficient complete baseline windows)"
    )
    value = ratio(splice - size)
    note = (
        f"Mean {splice}–{splice + size - 1} / mean {splice - size}–{splice - 1}; "
        f"baseline {first}–{splice - 1} adjacent {size}-year/{size}-year ratio "
        f"{percentiles[0]}th–{percentiles[1]}th percentiles: {variation} "
        f"({len(historical)} consecutive windows); "
        "totals match partly by construction; see LOYO"
    )
    if value is None:
        note += "; step unavailable: incomplete annual coverage or zero pre-step total"
    return value, int(annual.reindex(range(splice - size, splice + size)).notna().sum()), note


def _translated_annual(daily, science, aggregate):
    splice = pd.Timestamp(science["eras"]["snpp_first_day"]).year
    dates = pd.to_datetime(daily["local_day"])
    frame = daily.loc[
        (dates.dt.year.lt(splice) & daily["series"].eq("aqua_raw"))
        | (dates.dt.year.ge(splice) & daily["series"].eq("viirs_as_aqua")),
        ["local_day", "value"],
    ]
    return aggregate(frame, grain="year", value_cols=("value",)).set_index("year")["value"]


def _paired_series(daily, left, right, start, end):
    selected = daily.loc[daily["series"].isin((left, right))]
    frame = selected.pivot(index="local_day", columns="series", values="value")
    # A missing sensor/entire absent era is an unavailable comparison.
    frame = frame.reindex(columns=[left, right]).rename(columns={left: "observed", right: "tier1"})
    frame.index = pd.to_datetime(frame.index)
    frame = frame.loc[frame.index.to_series().between(pd.Timestamp(start), pd.Timestamp(end))]
    frame.loc[frame.isna().any(axis=1), :] = pd.NA
    return frame.rename_axis("local_day").reset_index()


def validate_tier1(
    counts,
    daily,
    naive,
    fits,
    science,
    region,
    *,
    aggregate=common_aggregate,
    celldays=None,
    coverage=None,
    region_cells=None,
    pass_=None,
):
    """Build contracted ValidationRows, drift, and evidence for the figures."""
    if not region_in_scope(science, region):
        raise ValueError("Validation requires the configured United States, simulated or FIRMS world-country region")
    start, end = map(pd.Timestamp, science["tier1"]["snpp_fit"])
    rows = []

    def row(test, value, n, years, note, baselines=None):
        entry = {
            "region": region,
            "test": test,
            "method": "none" if test == "step_naive" else "tier1",
            "value": value,
            "n": int(n),
            "years": list(years),
            "note": note,
        }
        if baselines is not None:
            entry["baselines"] = baselines
        rows.append(entry)

    loyo = loyo_predictions(counts["aqua"], counts["snpp"], science, aggregate=aggregate)
    scores = {name: _scores(loyo.weekly, name) for name in PREDICTIONS}
    n_weeks = int(loyo.weekly["tier1"].notna().sum())
    note = (
        "Entire held-out calendar year excluded from monthly and annual-baseline fits, including shrinkage; "
        "jointly covered Aqua/S-NPP days, common coverage-scaled weeks; n=paired valid weeks. "
        "Zero observed totals or constant weekly counts make the corresponding metric null."
    )
    if loyo.unavailable:
        note += f" Unavailable folds: {loyo.unavailable}."
    for metric, key in (("loyo_weekly_wape", "wape"), ("loyo_weekly_r", "r"), ("loyo_bias", "bias")):
        row(
            metric,
            scores["tier1"][key],
            n_weeks,
            [start.year, end.year],
            note,
            {name: scores[name][key] for name in ("raw_viirs", "annual_ratio")},
        )

    annual = loyo.annual.dropna(subset=["observed", "tier1"])
    positive = annual.loc[annual["observed"].gt(0)]
    mape = (
        float(((positive["tier1"] - positive["observed"]).abs() / positive["observed"]).mean())
        if len(positive)
        else None
    )
    row(
        "handoff_annual_mape",
        mape,
        len(positive),
        [start.year, end.year],
        "LOYO annual totals on jointly covered days, scaled by common.timebins; n=valid positive-observation "
        f"years; {end.year - start.year + 1 - len(positive)} years with insufficient coverage/zero totals excluded. "
        "totals match partly by construction; see LOYO",
    )

    splice = pd.Timestamp(science["eras"]["snpp_first_day"]).year
    size = science["validation"]["step_window_years"]
    naive = naive.set_index("year")
    naive_index = naive["modis_count"].where(naive.index < splice, naive["snpp_count"])
    translated = _translated_annual(daily, science, aggregate)
    for name, values in (("step_naive", naive_index), ("step_harmonized", translated)):
        value, n, step_note = _step(values, science)
        step_note += (
            f"; naive splice: MODIS Terra+Aqua day+night hotspots through {splice - 1}, S-NPP thereafter"
            if name == "step_naive"
            else f"; translated splice: aqua_raw through {splice - 1}, viirs_as_aqua thereafter"
        )
        row(name, value, n, [splice - size, splice + size - 1], step_note)

    overlap_end = pd.Timestamp(science["eras"]["snpp_through"])
    first = fits.n20_first_full_year
    if first is None:
        row("sat_agreement_wape", None, 0, [], "NOAA-20 has no qualifying first full year; no comparison.")
    else:
        paired = _paired_series(
            daily, "snpp_as_aqua", "noaa20_as_aqua", pd.Timestamp(year=first, month=1, day=1), overlap_end
        )
        weekly = aggregate(paired, grain="week", value_cols=("observed", "tier1"))
        row(
            "sat_agreement_wape",
            _scores(weekly, "tier1")["wape"],
            weekly["tier1"].notna().sum(),
            [first, overlap_end.year],
            "WAPE denominator is S-NPP translated total; identical jointly covered "
            "days before common weekly aggregation; n=paired valid weeks. This is in-sample agreement, not LOYO.",
        )
    direct, chained = fits.noaa20_direct, fits.noaa20_chained
    available = direct is not None and chained is not None and chained[1] > 0
    direct_days = (
        paired_fit_days(counts["aqua"], counts["noaa20"], pd.Timestamp(year=first, month=1, day=1), end)
        if first is not None and first <= end.year and available
        else pd.DataFrame()
    )
    row(
        "k_direct_vs_chained_pct",
        float(100 * (direct[1] - chained[1]) / chained[1]) if available else None,
        len(direct_days),
        [first, end.year] if first is not None and first <= end.year else [],
        "100 × (direct annual k − chained annual k) / chained annual k; n=joint Aqua/NOAA-20 direct-fit days. "
        + (
            "Direct fit ends at the S-NPP fit-window end; chained S-NPP/NOAA-20 overlap ends at the S-NPP era end."
            if available
            else f"Unavailable direct/chained fit or zero chained factor: {fits.unavailable}."
        ),
    )

    overlay = _paired_series(
        daily, "aqua_raw", "viirs_as_aqua", pd.Timestamp(year=splice, month=1, day=1), overlap_end
    )
    overlay = aggregate(overlay, grain="year", value_cols=("observed", "tier1"))
    drift, drift_summary = yearly_drift(counts, science, fits.n20_first_full_year)
    rows.extend(
        saturation_rows(
            celldays,
            coverage,
            counts["aqua"],
            region_cells,
            science,
            region,
            aggregate=aggregate,
            pass_=pass_,
        )
    )
    row(
        "backcast_weekly_wape",
        _scores(loyo.backcast_weekly, "tier1")["wape"],
        loyo.backcast_weekly["tier1"].notna().sum(),
        [start.year, end.year],
        "Aqua divided by V1's year-held-out S-NPP factors; the entire test year is excluded from "
        "monthly fits and annual shrinkage targets. Joint coverage before common weekly aggregation; "
        "zero fitted factors give unavailable predictions; n=paired valid weeks.",
    )
    document = {
        "validation": rows,
        "drift": drift,
        "drift_summary": drift_summary,
    }
    return ValidationResult(document, loyo, overlay, science["eras"]["aqua_trusted_through"])


def validation_figures(result, place="United States"):
    """Return headless figures; the stage writes them through common IO."""
    from matplotlib.backends.backend_agg import FigureCanvasAgg
    from matplotlib.figure import Figure

    scatter = Figure(figsize=(6, 6), layout="constrained")
    FigureCanvasAgg(scatter)
    ax = scatter.subplots()
    points = result.loyo.weekly.dropna(subset=["observed", "tier1"])
    ax.scatter(points["observed"], points["tier1"], alpha=0.5, label="Held-out weeks")
    limit = float(points[["observed", "tier1"]].max().max()) if len(points) else 1
    ax.plot([0, limit], [0, limit], color="black", label="1:1")
    ax.set(
        xlabel="Observed Aqua fire cell-days",
        ylabel="LOYO predicted Aqua-equivalent fire cell-days",
        title=f"{place}: leave-one-year-out weekly validation",
    )
    ax.legend()

    overlay = Figure(figsize=(9, 4), layout="constrained")
    FigureCanvasAgg(overlay)
    ax = overlay.subplots()
    for column, label, marker in (
        ("observed", "Aqua observed", "o"),
        ("tier1", "VIIRS translated to Aqua-equivalent", "s"),
    ):
        ax.plot(
            result.overlay["year"],
            result.overlay[column].to_numpy(dtype=float, na_value=np.nan),
            marker=marker,
            label=label,
        )
    ax.set(
        xlabel="Year",
        ylabel="Annual Aqua-equivalent fire cell-days",
        title=f"{place}: annual totals on joint coverage (coverage-scaled)",
    )
    ax.legend()
    drift = Figure(figsize=(9, 4), layout="constrained")
    FigureCanvasAgg(drift)
    ax = drift.subplots()
    for sensor, label, marker in (("snpp", "Aqua / S-NPP", "o"), ("noaa20", "Aqua / NOAA-20", "s")):
        entries = [entry for entry in result.document["drift"] if entry["sensor"] == sensor]
        if not entries:
            continue
        years = [pd.Timestamp(year=entry["year"], month=1, day=1) for entry in entries]
        values = [np.nan if entry["k_annual"] is None else entry["k_annual"] for entry in entries]
        lo = [np.nan if entry["lo"] is None else entry["lo"] for entry in entries]
        hi = [np.nan if entry["hi"] is None else entry["hi"] for entry in entries]
        (line,) = ax.plot(years, values, marker=marker, label=label)
        ax.fill_between(years, lo, hi, color=line.get_color(), alpha=0.2)
    ax.axvline(
        pd.Timestamp(result.aqua_trusted_through),
        color="black",
        linestyle="--",
        label=f"Aqua trusted through {result.aqua_trusted_through}",
    )
    ax.set(
        xlabel="Calendar year",
        ylabel="Annual Aqua / VIIRS fire cell-day ratio",
        title=f"{place}: yearly ratios with within-year week-bootstrap ranges",
    )
    ax.legend()
    return {
        "loyo_scatter.png": scatter,
        "overlay_aqua_vs_translated.png": overlay,
        "drift_k_by_year.png": drift,
    }
