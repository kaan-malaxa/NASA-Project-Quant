"""`python -m pipeline.export --sample`: a complete, deterministic SAMPLE site for us.

Everything here is fabricated so the web team can build every screen before real data exists.
Every data object carries kind "sample", every file code_version "sample", and
manifest.contains_sample is true (AGENTS.md science rule 10).

How the fake data is made (shapes requested in R1 prompt A2):
- A daily Aqua activity rate per region = seasonal bumps (circular, in weeks) x a yearly factor
  x daily noise. us: a spring burning season (peak week 14) and a larger summer-autumn
  wildfire season (peak week 33); both move earlier by about 6 days per decade, and
  one extreme year (2020, 2.5x). These shapes are invented for chart design, not real findings.
- VIIRS (S-NPP from 2012-01-20, NOAA-20 from 2018) sees about 2.5x Aqua. k is then fitted from
  these fake series with the SD-06 formula and used to build harmonized / viirs_as_aqua /
  viirs_equiv exactly as SD-05 and SD-07 describe, so the sample has realistic era switches.
- Three whole Aqua weeks before 2012 are made uncovered, so harmonized has 3 missing weeks.
- Trend estimates are set per region so the requested sentence_ids come out of the SD-15 rule.

The time binning below is a minimal sample-only copy of SD-08. Real statistics must use
pipeline/common/timebins.py (R2); do not import these helpers from anywhere else.
All randomness comes from random.Random seeded with science.yaml `seed` (7) and the region id.
"""

from __future__ import annotations

import csv
import hashlib
import io
import json
import math
import random
from collections import Counter
from collections.abc import Callable, Sequence
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any

import h3

from pipeline.export._contract_defaults import load_regions, load_science
from pipeline.export.audit import AUDIT_FILE, build_audit
from pipeline.export.check import CSV_HEADERS
from pipeline.stats.sentences import (
    Estimate,
    nowcast_sentence,
    ruler_sentence,
    season_shift_sentence,
    verdict_id,
    verdict_sentence,
)

SAMPLE_REGIONS = ("us",)
# The sample series were tuned against random streams keyed by the region's first id ("conus").
# The id is now "us"; keeping the stream key keeps every sample number, and the tests on them, unchanged.
SEED_KEYS = {"us": "conus"}
LAST_DAY = date(2026, 11, 13)          # fixed so output is byte-identical on every run
GENERATED_AT = "2026-11-14T00:00:00Z"
NOWCAST_AS_OF = "2026-11-14T03:00:00Z"
CODE_VERSION = "sample"
KIND = "sample"
SNPP_STOPS = date(2025, 12, 31)        # sample: S-NPP is simply not generated after its era
NOAA20_FIRST_DAY = date(2018, 1, 1)
# Sample-only Aqua gaps before 2012 (nothing can fill them, so harmonized weeks go missing),
# plus the seeded Aqua and S-NPP outages of contracts section 4.3.
AQUA_GAPS = [(2005, 10), (2008, 30), (2010, 47)]    # (year, week): the whole week uncovered
AQUA_OUTAGE = (date(2020, 8, 16), date(2020, 9, 2))
SNPP_OUTAGE = (date(2022, 7, 26), date(2022, 8, 10))

UNIT_DAY = {"harmonized": "Aqua-equivalent fire cell-days per day", "aqua_raw": "fire cell-days per day",
            "viirs_raw": "fire cell-days per day", "viirs_as_aqua": "Aqua-equivalent fire cell-days per day",
            "viirs_equiv": "VIIRS-equivalent fire cell-days per day"}
LABELS = {"aqua_raw": "MODIS Aqua, as recorded", "viirs_raw": "VIIRS, as recorded",
          "viirs_as_aqua": "VIIRS translated to the Aqua scale", "harmonized": "Harmonized record",
          "viirs_equiv": "What VIIRS would have seen"}
WEB_SERIES = ("aqua_raw", "viirs_raw", "viirs_as_aqua", "harmonized", "viirs_equiv")
MONTH_ABBR = ("January", "February", "March", "April", "May", "June", "July", "August",
              "September", "October", "November", "December")

# Per-region shape of the fake data. Bumps are (centre week, amplitude, width in weeks).
# `exact_years` get their year factor without random noise (the planted extreme year).
SHAPES: dict[str, dict[str, Any]] = {
    "us": {"peak": 120.0, "bumps": [(14, 0.55, 2.5), (33, 1.0, 3.5)], "background": 0.05,
              "shift_weeks_per_year": -0.09, "jump": 4.0, "exact_years": {2020},
              # 2026 tuned so this week's sample nowcast reads "above_normal" (about the 83rd percentile)
              "year_factor": lambda y: {2020: 2.5, 2026: 1.3}.get(y, 1.0)},
}
# Trend estimates (pct per decade, lo, hi) chosen so SD-15 yields the requested sentence_id.
TRENDS = {
    "us": {"expect": "artifact_flat", "H": (2.0, -6.0, 9.0), "N": (38.0, 25.0, 52.0),
              "aqua_only_2003_2022": (1.0, -8.0, 10.0), "translated_from_2012": (3.0, -5.0, 11.0)},
}
EYESIGHT = {
    "us": {"status": "validated", "a": -1.2, "b": 2.1, "c": 0.82, "g": 1.12, "n": 48210},
}


# ---------------------------------------------------------------- small helpers
def _d(text: str) -> date:
    return date.fromisoformat(text)


def week_of_year(d: date) -> int:
    return min(52, (d.timetuple().tm_yday - 1) // 7 + 1)


def _days(start: date, end: date) -> list[date]:
    return [start + timedelta(i) for i in range((end - start).days + 1)]


def _quantile(values: Sequence[float], q: float) -> float:
    """Linear interpolation (numpy's default) on sorted values."""
    s = sorted(values)
    pos = q * (len(s) - 1)
    lo = math.floor(pos)
    hi = min(lo + 1, len(s) - 1)
    return s[lo] + (s[hi] - s[lo]) * (pos - lo)


def _percentile_rank(x: float, past: Sequence[float]) -> float:
    """SD-11 formula."""
    below = sum(p < x for p in past)
    ties = sum(p == x for p in past)
    return 100.0 * (below + 0.5 * ties) / len(past)


def _theil_sen(xs: Sequence[float], ys: Sequence[float]) -> float | None:
    slopes = sorted((ys[j] - ys[i]) / (xs[j] - xs[i])
                    for i in range(len(xs)) for j in range(i + 1, len(xs)) if xs[j] != xs[i])
    return _quantile(slopes, 0.5) if slopes else None


def _round(obj: Any) -> Any:
    if isinstance(obj, float):
        r = round(obj, 3)
        return 0.0 if r == 0 else r
    if isinstance(obj, dict):
        return {k: _round(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_round(v) for v in obj]
    return obj


def json_bytes(obj: Any) -> bytes:
    text = json.dumps(_round(obj), sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False)
    return (text + "\n").encode("utf-8")


def csv_bytes(header: list[str], rows: list[list[Any]]) -> bytes:
    buf = io.StringIO()
    w = csv.writer(buf, lineterminator="\n")
    w.writerow(header)
    w.writerows(rows)
    return buf.getvalue().encode("utf-8")


def _header(**rest: Any) -> dict[str, Any]:
    return {"schema_version": "1.0", "generated_at": GENERATED_AT, "code_version": CODE_VERSION, **rest}


# ---------------------------------------------------------------- binning (sample-only copy of SD-08)
def _bin_key(d: date, grain: str) -> tuple[int, int]:
    return (d.year, week_of_year(d) if grain == "week" else d.month if grain == "month" else 0)


def _bin_complete(key: tuple[int, int], grain: str) -> bool:
    """Bins that end after LAST_DAY are 'in the future' and omitted."""
    y, b = key
    if grain == "year":
        last = date(y, 12, 31)
    elif grain == "month":
        last = (date(y + (b == 12), b % 12 + 1, 1) - timedelta(1))
    else:
        last = date(y, 12, 31) if b == 52 else date(y, 1, 1) + timedelta(b * 7 - 1)
    return last <= LAST_DAY


def aggregate(days: list[date], cols: dict[str, list[float | None]], src: list[str | None],
              grain: str, tb: dict[str, Any]) -> dict[tuple[int, int], dict[str, Any]]:
    groups: dict[tuple[int, int], list[int]] = {}
    for i, d in enumerate(days):
        groups.setdefault(_bin_key(d, grain), []).append(i)
    out = {}
    for key, idx in groups.items():
        if not _bin_complete(key, grain):
            continue
        covered = [i for i in idx if cols["value"][i] is not None]
        n_days, n_cov = len(idx), len(covered)
        if grain == "week":
            missing, scale = n_cov < tb["week_min_covered_days"], 7.0
        elif grain == "month":
            missing, scale = n_cov < tb["month_min_covered_frac"] * n_days, float(n_days)
        else:
            missing, scale = n_cov < tb["year_min_covered_frac"] * n_days, float(n_days)
        row: dict[str, Any] = {}
        for name, col in cols.items():
            row[name] = None if missing else sum(col[i] for i in covered) * scale / n_cov
        sources = Counter(src[i] for i in covered if src[i])
        row["source"] = None if missing or not sources else min(sources.items(), key=lambda kv: (-kv[1], kv[0]))[0]
        out[key] = row
    return out


# ---------------------------------------------------------------- the fake daily world
class Region:
    def __init__(self, meta: dict[str, Any], sci: dict[str, Any]):
        self.meta, self.sci, self.id = meta, sci, meta["id"]
        self.shape = SHAPES[self.id]
        self.seed_key = SEED_KEYS.get(self.id, self.id)
        self.rng = random.Random(f"{sci['seed']}-{self.seed_key}")
        self.days = _days(_d(sci["eras"]["record_start"]), LAST_DAY)
        self._simulate()
        self._fit_k()
        self._translate()

    # -- activity
    def _rate(self, d: date, year_factor: float, jitter: list[float]) -> float:
        wf = (d.timetuple().tm_yday - 1) / 7.0 + 0.5
        s = self.shape["background"]
        for (centre, amp, width), dj in zip(self.shape["bumps"], jitter):
            c = centre + self.shape["shift_weeks_per_year"] * (d.year - 2014) + dj
            dist = abs(wf - c) % 52
            dist = min(dist, 52 - dist)
            s += amp * math.exp(-dist * dist / (2 * width * width))
        return self.shape["peak"] * s * year_factor

    def _simulate(self) -> None:
        rng = self.rng
        years = range(self.days[0].year, LAST_DAY.year + 1)
        exact = self.shape.get("exact_years", set())
        noise = {y: math.exp(rng.gauss(0, 0.22)) for y in years}
        yf = {y: self.shape["year_factor"](y) * (1.0 if y in exact else noise[y]) for y in years}
        # each season's centre wobbles a little from year to year (weeks)
        jitter = {y: [rng.gauss(0, 0.5) for _ in self.shape["bumps"]] for y in years}
        snpp_first = _d(self.sci["eras"]["snpp_first_day"])
        gap_days = {(y, w) for y, w in AQUA_GAPS}
        self.aqua: list[float | None] = []
        self.snpp: list[float | None] = []
        self.noaa20: list[float | None] = []

        def count(x: float) -> float:
            """Unbiased stochastic rounding, so low counts keep the right sensor ratio."""
            return float(math.floor(x + rng.random()))

        for d in self.days:
            true = self._rate(d, yf[d.year], jitter[d.year]) * math.exp(rng.gauss(0, 0.35))
            m = d.month
            snpp_true = true * 2.5 * (1 + 0.1 * math.sin(2 * math.pi * m / 12)) * math.exp(rng.gauss(0, 0.12))
            n20_true = true * 2.4 * (1 + 0.1 * math.sin(2 * math.pi * m / 12)) * math.exp(rng.gauss(0, 0.12))
            aqua_cov = (d.year, week_of_year(d)) not in gap_days and not (AQUA_OUTAGE[0] <= d <= AQUA_OUTAGE[1])
            snpp_cov = snpp_first <= d <= SNPP_STOPS and not (SNPP_OUTAGE[0] <= d <= SNPP_OUTAGE[1])
            a, s, n = count(true), count(snpp_true), count(n20_true)
            self.aqua.append(a if aqua_cov else None)
            self.snpp.append(s if snpp_cov else None)
            self.noaa20.append(n if d >= NOAA20_FIRST_DAY else None)

    # -- SD-06 calibration fitted on the fake series
    def _fit_k(self) -> None:
        n0 = self.sci["tier1"]["n0"]
        windows = {"snpp": tuple(_d(x) for x in self.sci["tier1"]["snpp_fit"]),
                   "noaa20": (date(2019, 1, 1), _d(self.sci["eras"]["aqua_trusted_through"]))}
        self.fit_window = {s: [w[0].isoformat(), w[1].isoformat()] for s, w in windows.items()}
        self.k: dict[str, dict[int, dict[str, float]]] = {}
        self.k_annual: dict[str, dict[str, float]] = {}
        for sensor, (start, end) in windows.items():
            vals = self.snpp if sensor == "snpp" else self.noaa20
            A = dict.fromkeys(range(1, 13), 0.0)
            V = dict.fromkeys(range(1, 13), 0.0)
            for i, d in enumerate(self.days):
                if start <= d <= end and self.aqua[i] is not None and vals[i] is not None:
                    A[d.month] += self.aqua[i]
                    V[d.month] += vals[i]
            k_ann = sum(A.values()) / sum(V.values())
            self.k_annual[sensor] = {"k": k_ann, "lo": k_ann * 0.96, "hi": k_ann * 1.04}
            self.k[sensor] = {}
            for m in range(1, 13):
                k = (A[m] + n0 * k_ann) / (V[m] + n0)
                hw = 0.03 + 3.0 / math.sqrt(A[m] + n0)
                self.k[sensor][m] = {"k": k, "lo": k * (1 - hw), "hi": k * (1 + hw),
                                     "aqua_celldays": A[m], "viirs_celldays": V[m]}

    # -- SD-05 / SD-07 series
    def _translate(self) -> None:
        eras = self.sci["eras"]
        aqua_until, snpp_until = _d(eras["aqua_trusted_through"]), _d(eras["snpp_through"])
        snpp_first = _d(eras["snpp_first_day"])
        n = len(self.days)
        S: dict[str, dict[str, list[Any]]] = {
            s: {"value": [None] * n, "lo": [None] * n, "hi": [None] * n, "source": [None] * n} for s in WEB_SERIES}

        def put(series: str, i: int, v: float | None, lo: float | None, hi: float | None, src: str | None) -> None:
            col = S[series]
            col["value"][i], col["lo"][i], col["hi"][i] = v, lo, hi
            col["source"][i] = src if v is not None else None

        def tr(sensor: str, i: int) -> tuple[float, float, float] | None:
            v = (self.snpp if sensor == "snpp" else self.noaa20)[i]
            if v is None:
                return None
            k = self.k[sensor][self.days[i].month]
            return v * k["k"], v * k["lo"], v * k["hi"]

        for i, d in enumerate(self.days):
            a = self.aqua[i]
            put("aqua_raw", i, a, a, a, "aqua")
            primary = "snpp" if d <= snpp_until else "noaa20"
            v = (self.snpp if primary == "snpp" else self.noaa20)[i]
            put("viirs_raw", i, v, v, v, primary)
            t = tr(primary, i)
            put("viirs_as_aqua", i, *(t or (None, None, None)), primary)
            # harmonized (SD-05)
            if d <= aqua_until:
                order = [("aqua", None)] + ([("snpp", 0)] if d >= snpp_first else [])
            elif d <= snpp_until:
                order = [("snpp", 0), ("noaa20", 0)]
            else:
                order = [("noaa20", 0), ("snpp", 0)]
            put("harmonized", i, None, None, None, None)
            for sensor, _ in order:
                if sensor == "aqua":
                    if a is not None:
                        put("harmonized", i, a, a, a, "aqua")
                        break
                elif (t2 := tr(sensor, i)) is not None:
                    put("harmonized", i, *t2, sensor)
                    break
            # viirs_equiv tier1: Aqua / k_m before S-NPP, observed VIIRS after
            if d < snpp_first:
                if a is not None:
                    k = self.k["snpp"][d.month]
                    put("viirs_equiv", i, a / k["k"], a / k["hi"], a / k["lo"], "aqua")
            else:
                put("viirs_equiv", i, v, v, v, primary)
        self.series = S

    def agg(self, series: str, grain: str) -> dict[tuple[int, int], dict[str, Any]]:
        col = self.series[series]
        return aggregate(self.days, {k: col[k] for k in ("value", "lo", "hi")}, col["source"],
                         grain, self.sci["timebins"])


# ---------------------------------------------------------------- files per region
def _calendar(r: Region, grain: str) -> dict[str, Any]:
    per = "per week" if grain == "week" else "per month"
    meta = {s: {"label": LABELS[s], "unit": UNIT_DAY[s].replace("per day", per)} for s in WEB_SERIES}
    meta["viirs_equiv"]["method"] = "tier1"
    rows = []
    for s in WEB_SERIES:
        for (y, b), row in sorted(r.agg(s, grain).items()):
            rows.append({"year": y, grain: b, "series": s, "value": row["value"], "lo": row["lo"],
                         "hi": row["hi"], "kind": KIND, "source": row["source"]})
    return _header(region=r.id, series_meta=meta, rows=rows)


def _daily(r: Region) -> dict[str, Any]:
    series: dict[str, Any] = {}
    runs = []
    for s in WEB_SERIES:
        col = r.series[s]
        entry: dict[str, Any] = {"unit": UNIT_DAY[s], "value": col["value"]}
        if s in ("harmonized", "viirs_as_aqua", "viirs_equiv"):
            entry["lo"], entry["hi"] = col["lo"], col["hi"]
        series[s] = entry
        start = 0
        for i in range(1, len(r.days) + 1):
            if i == len(r.days) or col["source"][i] != col["source"][start]:
                runs.append({"series": s, "from": r.days[start].isoformat(), "to": r.days[i - 1].isoformat(),
                             "kind": KIND, "source": col["source"][start]})
                start = i
    return _header(region=r.id, start=r.days[0].isoformat(), n_days=len(r.days), series=series, kind_runs=runs)


def _smooth_circular(values: list[float], width: int) -> list[float]:
    half = width // 2
    n = len(values)
    return [sum(values[(i + j) % n] for j in range(-half, half + 1)) / width for i in range(n)]


def _climatology(r: Region) -> dict[str, Any]:
    y0, y1 = r.sci["climatology"]["baseline_years"]
    stats = (("min", 0.0), ("p10", 0.1), ("p25", 0.25), ("p50", 0.5), ("p75", 0.75), ("p90", 0.9), ("max", 1.0))

    def table(grain: str, n_bins: int, smooth: bool) -> list[dict[str, Any]]:
        agg = r.agg("harmonized", grain)
        per_bin = {b: [agg[(y, b)]["value"] for y in range(y0, y1 + 1)
                       if (y, b) in agg and agg[(y, b)]["value"] is not None] for b in range(1, n_bins + 1)}
        curves = {name: [_quantile(per_bin[b], q) for b in range(1, n_bins + 1)] for name, q in stats}
        if smooth:
            curves = {k: _smooth_circular(v, r.sci["climatology"]["smooth_weeks"]) for k, v in curves.items()}
        return [{grain: b, **{k: curves[k][b - 1] for k, _ in stats}, "n_years": len(per_bin[b])}
                for b in range(1, n_bins + 1)]

    return _header(region=r.id, baseline_years=[y0, y1],
                   unit_week="Aqua-equivalent fire cell-days per week",
                   unit_month="Aqua-equivalent fire cell-days per month",
                   weeks=table("week", 52, True), months=table("month", 12, False))


def _week_label(start_week: int, end_week: int) -> str:
    def part(d: date) -> tuple[str, str]:
        return ("early" if d.day <= 10 else "mid" if d.day <= 20 else "late"), MONTH_ABBR[d.month - 1]

    s = part(date(2025, 1, 1) + timedelta((start_week - 1) * 7))
    e = part(date(2025, 1, 1) + timedelta(end_week * 7 - 1))
    if s[1] == e[1]:
        return f"{s[0]} to {e[0]} {s[1]}"
    return f"{s[0]}-{s[1]} to {e[0]}-{e[1]}"


def _windows(p50: list[float], sci: dict[str, Any]) -> tuple[list[int], list[dict[str, Any]]]:
    """SD-13 critical weeks and windows from the smoothed weekly p50 (sample-only version)."""
    total = sum(p50)
    order = sorted(range(52), key=lambda i: (-p50[i], i))
    crit: set[int] = set()
    acc = 0.0
    for i in order:
        if acc >= sci["season"]["critical_share"] * total:
            break
        crit.add(i)
        acc += p50[i]
    inside = [i in crit or ((i - 1) % 52 in crit and (i + 1) % 52 in crit) for i in range(52)]
    runs: list[list[int]] = []
    start = next(i for i in range(52) if not inside[i])
    cur: list[int] = []
    for k in range(1, 53):
        i = (start + k) % 52
        if inside[i]:
            cur.append(i)
        elif cur:
            runs.append(cur)
            cur = []
    if cur:
        runs.append(cur)
    wins = []
    for run in runs:
        share = sum(p50[i] for i in run) / total
        if share >= sci["season"]["min_window_share"]:
            wins.append({"weeks": run, "share": share, "peak": max(run, key=lambda i: (p50[i], -i))})
    wins.sort(key=lambda w: -w["share"])
    return sorted(i + 1 for i in crit), wins[: sci["season"]["max_windows"]]


def _season(r: Region, clim: dict[str, Any]) -> dict[str, Any]:
    p50 = [w["p50"] for w in clim["weeks"]]
    critical, wins = _windows(p50, r.sci)
    y0, y1 = r.sci["climatology"]["baseline_years"]
    harm = r.series["harmonized"]["value"]
    ext = r.sci["season"]["extend_weeks"]
    out = []
    for n, w in enumerate(wins, start=1):
        start_week, end_week = w["weeks"][0] + 1, w["weeks"][-1] + 1
        label = _week_label(start_week, end_week)
        weeks = {((start_week - 1 + k) % 52) + 1 for k in range(-ext, len(w["weeks"]) + ext)}
        by_year = []
        for y in range(y0, y1 + 1):
            pts = [(d.timetuple().tm_yday, harm[i]) for i, d in enumerate(r.days)
                   if d.year == y and harm[i] is not None and week_of_year(d) in weeks]
            tot = sum(v for _, v in pts)
            if tot < r.sci["season"]["min_year_celldays"]:
                continue
            cum, s_doy, e_doy = 0.0, None, None
            for doy, v in pts:
                cum += v
                if s_doy is None and cum >= 0.1 * tot:
                    s_doy = doy
                if e_doy is None and cum >= 0.9 * tot:
                    e_doy = doy
            by_year.append({"year": y, "start_doy": s_doy, "end_doy": e_doy,
                            "centroid_doy": round(sum(doy * v for doy, v in pts) / tot),
                            "total": tot, "kind": KIND})
        shift = {}
        rng = random.Random(f"{r.sci['seed']}-{r.seed_key}-shift-{n}")
        for key in ("start", "centroid", "end"):
            xs = [b["year"] for b in by_year]
            ys = [b[f"{key}_doy"] for b in by_year]
            value = _theil_sen(xs, ys)
            boot = []
            for _ in range(r.sci["trend"]["bootstrap_b"]):
                pick = [rng.randrange(len(xs)) for _ in xs]
                s = _theil_sen([xs[i] for i in pick], [ys[i] for i in pick])
                if s is not None:
                    boot.append(s * 10)
            shift[key] = {"value": None if value is None else value * 10,
                          "lo": _quantile(boot, 0.05), "hi": _quantile(boot, 0.95)}
        out.append({"id": f"w{n}", "label": label, "start_week": start_week, "peak_week": w["peak"] + 1,
                    "end_week": end_week, "share": w["share"], "by_year": by_year,
                    "shift_days_per_decade": shift,
                    "sentence": season_shift_sentence(label, shift["start"]["value"],
                                                      shift["start"]["lo"], shift["start"]["hi"])})
    pct = round(100 * r.sci["season"]["critical_share"])
    return _header(region=r.id, definition=f"The fewest weeks that hold {pct}% of a typical year's burning",
                   critical_weeks=critical, windows=out)


def _annual(r: Region) -> dict[str, Any]:
    """Annual harmonized, Aqua and primary-VIIRS totals plus naive hotspot counts (SD-09)."""
    rng = random.Random(f"{r.sci['seed']}-{r.seed_key}-naive")
    harm, aqua, viirs = r.agg("harmonized", "year"), r.agg("aqua_raw", "year"), r.agg("viirs_raw", "year")
    modis_hpc = 3.0                                     # Terra + Aqua hotspots per Aqua cell-day
    viirs_hpc = r.shape["jump"] / 2.5 * modis_hpc       # so S-NPP / MODIS hotspots is about `jump`
    y0, y1 = r.sci["trend"]["years"]
    out = {}
    for y in range(y0, y1 + 1):
        a, v = aqua.get((y, 0), {}).get("value"), viirs.get((y, 0), {}).get("value")
        modis_hot = None if a is None else a * modis_hpc * math.exp(rng.gauss(0, 0.05))
        snpp_hot = None if v is None else v * viirs_hpc * math.exp(rng.gauss(0, 0.05))
        naive_src = "modis" if y <= 2011 else "snpp"
        h = harm.get((y, 0), {"value": None, "lo": None, "hi": None})
        out[y] = {"harmonized": h["value"], "lo": h["lo"], "hi": h["hi"], "modis_hot": modis_hot,
                  "snpp_hot": snpp_hot, "naive_source": naive_src,
                  "naive": modis_hot if naive_src == "modis" else snpp_hot}
    return out


def _trend(r: Region, annual: dict[int, dict[str, Any]]) -> dict[str, Any]:
    spec = TRENDS[r.id]
    H, N = Estimate(*spec["H"]), Estimate(*spec["N"])
    variants = {k: Estimate(*spec[k]) for k in ("aqua_only_2003_2022", "translated_from_2012")}
    sid = verdict_id(H, N, [v.direction for v in variants.values()], r.sci["trend"]["artifact_gap_points"])
    if sid != spec["expect"]:
        raise AssertionError(f"{r.id}: sample trend gives {sid}, expected {spec['expect']}")

    def est(e: Estimate) -> dict[str, Any]:
        return {"pct_per_decade": e.pct_per_decade, "lo": e.lo, "hi": e.hi, "direction": e.direction}

    return _header(
        region=r.id, years=r.sci["trend"]["years"],
        annual=[{"year": y, "harmonized": a["harmonized"], "lo": a["lo"], "hi": a["hi"], "kind": KIND,
                 "naive_count": a["naive"], "naive_source": a["naive_source"]} for y, a in sorted(annual.items())],
        harmonized=est(H), naive=est(N),
        robustness=[{"variant": k, **est(v)} for k, v in variants.items()],
        sentence_id=sid, sentence=verdict_sentence(sid, H, N))


def _ruler(r: Region, annual: dict[int, dict[str, Any]]) -> dict[str, Any]:
    ratios = [annual[y]["snpp_hot"] / annual[y]["modis_hot"] for y in range(2013, 2023)
              if annual[y]["snpp_hot"] and annual[y]["modis_hot"]]
    j = (sum(annual[y]["snpp_hot"] for y in range(2013, 2023))
         / sum(annual[y]["modis_hot"] for y in range(2013, 2023)))

    def base(key: str) -> float:
        vals = [annual[y][key] for y in range(2003, 2012) if annual[y][key] is not None]
        return sum(vals) / len(vals)

    nb, hb = base("naive"), base("harmonized")
    rows = [{"year": y, "naive_index": None if a["naive"] is None else a["naive"] / nb,
             "harmonized_index": None if a["harmonized"] is None else a["harmonized"] / hb,
             "naive_source": a["naive_source"], "kind": KIND} for y, a in sorted(annual.items())]
    return _header(
        region=r.id, index_base_years=[2003, 2011],
        jump_multiple={"value": j, "lo": min(ratios), "hi": max(ratios), "years": [2013, 2022],
                       "definition": "Mean yearly S-NPP VIIRS hotspot count divided by mean yearly MODIS "
                                     "(Terra + Aqua) hotspot count, same years, same place"},
        rows=rows, sentence=ruler_sentence(r.meta["name"], j))


def _window_sum(r: Region, year: int, end_doy: int, n_days: int, need: int) -> float | None:
    """Coverage-scaled harmonized sum over the n-day window ending at end_doy of `year`."""
    end = date(year, 1, 1) + timedelta(end_doy - 1)
    first = r.days[0]
    vals = []
    for k in range(n_days):
        i = (end - timedelta(k) - first).days
        if 0 <= i < len(r.days):
            vals.append(r.series["harmonized"]["value"][i])
    cov = [v for v in vals if v is not None]
    if len(cov) < need:
        return None
    return sum(cov) * n_days / len(cov)


def _nowcast(r: Region) -> dict[str, Any]:
    an = r.sci["anomaly"]
    y0, y1 = r.sci["climatology"]["baseline_years"]
    end = LAST_DAY
    start = end - timedelta(6)
    idx = [(d - r.days[0]).days for d in _days(start, end)]
    h = r.series["harmonized"]
    covered = [i for i in idx if h["value"][i] is not None]
    value = sum(h["value"][i] for i in covered) if covered else None
    lo = sum(h["lo"][i] for i in covered) if covered else None
    hi = sum(h["hi"][i] for i in covered) if covered else None
    end_doy = end.timetuple().tm_yday
    history = [{"year": y, "value": v, "kind": KIND} for y in range(y0, y1 + 1)
               if (v := _window_sum(r, y, end_doy, 7, 5)) is not None]
    past = [x["value"] for x in history]
    percentile = None if value is None else _percentile_rank(value, past)
    if value is None:
        status = "unavailable"
    elif value < an["low_activity_threshold"] and _quantile(past, 0.9) < an["low_activity_threshold"]:
        status = "low_activity"
    elif percentile >= an["extreme_pct"]:
        status = "extreme"
    elif percentile > an["above_pct"]:
        status = "above_normal"
    elif percentile < an["below_pct"]:
        status = "below_normal"
    else:
        status = "normal"
    # month to date
    n = end.day
    mtd_idx = [(date(end.year, end.month, d) - r.days[0]).days for d in range(1, n + 1)]
    mtd_cov = [h["value"][i] for i in mtd_idx if h["value"][i] is not None]
    mtd = sum(mtd_cov) * n / len(mtd_cov) if mtd_cov else None
    spans = [v for y in range(y0, y1 + 1)
             if (v := _window_sum(r, y, date(y, end.month, n).timetuple().tm_yday, n, math.ceil(0.8 * n))) is not None]
    median = _quantile(spans, 0.5) if spans else None
    return _header(
        region=r.id, as_of=NOWCAST_AS_OF, source="VIIRS_NOAA20_NRT",
        window={"start": start.isoformat(), "end": end.isoformat(), "days_covered": len(covered)},
        value=value, lo=lo, hi=hi, unit="Aqua-equivalent fire cell-days per 7 days",
        percentile=percentile, status=status, baseline_years=[y0, y1], history=history,
        month_to_date={"month": end.month, "through_day": n, "value": mtd, "median": median,
                       "ratio": (mtd / median) if mtd is not None and median else None,
                       "percentile": None if mtd is None or not spans else _percentile_rank(mtd, spans)},
        kind=KIND, input_note="Near-real-time input; calibration fitted on science-quality data.",
        sentence=nowcast_sentence(status, r.meta["name"], end, value, percentile, len(history)))


def _calibration(r: Region) -> dict[str, Any]:
    eras = r.sci["eras"]
    t_aqua, t_snpp = _d(eras["aqua_trusted_through"]), _d(eras["snpp_through"])
    return _header(
        region=r.id, reference="aqua_day", count_resolution=r.sci["grid"]["count_res"],
        shrinkage_n0=r.sci["tier1"]["n0"],
        eras=[{"from": eras["record_start"], "to": t_aqua.isoformat(), "source": "aqua", "kind": KIND},
              {"from": (t_aqua + timedelta(1)).isoformat(), "to": t_snpp.isoformat(), "source": "snpp", "kind": KIND},
              {"from": (t_snpp + timedelta(1)).isoformat(), "to": None, "source": "noaa20", "kind": KIND}],
        fit_window=r.fit_window, noaa20_method="direct", k_annual=r.k_annual,
        k={s: [{"month": m, **r.k[s][m]} for m in range(1, 13)] for s in ("snpp", "noaa20")})


# ---------------------------------------------------------------- spatial files
def _bbox_poly(bbox: Sequence[float]) -> h3.LatLngPoly:
    w, s, e, n = bbox
    return h3.LatLngPoly([(s, w), (s, e), (n, e), (n, w)])


def _cell_weights(r: Region) -> list[tuple[str, float]]:
    """Res-5 cells of the bbox with a fake activity weight (a few hot blobs), heaviest first."""
    w, s, e, n = r.meta["bbox"]
    rng = random.Random(f"{r.sci['seed']}-{r.seed_key}-space")
    blobs = [(rng.uniform(s, n), rng.uniform(w, e), rng.uniform(0.3, 1.2)) for _ in range(6)]
    cells = sorted(h3.polygon_to_cells(_bbox_poly(r.meta["bbox"]), r.sci["grid"]["map_res"]))
    out = []
    for c in cells:
        lat, lon = h3.cell_to_latlng(c)
        wt = sum(math.exp(-((lat - bl) ** 2 + (lon - bn) ** 2) / (2 * sd * sd)) for bl, bn, sd in blobs)
        if wt > 0.01:
            out.append((c, wt))
    out.sort(key=lambda cw: (-cw[1], cw[0]))
    return out[:400]


def _hex(r: Region, weights: list[tuple[str, float]], critical_weeks: list[int]) -> dict[str, Any]:
    snpp, total = r.snpp, sum(wt for _, wt in weights)
    years = [y for y in range(2013, 2026)]
    crit = set(critical_weeks)
    all_year = sum(v for d, v in zip(r.days, snpp) if v is not None and 2013 <= d.year <= 2025) / len(years)
    in_crit = sum(v for d, v in zip(r.days, snpp)
                  if v is not None and 2013 <= d.year <= 2025 and week_of_year(d) in crit) / len(years)
    rng = random.Random(f"{r.sci['seed']}-{r.seed_key}-hex")
    cells = []
    for c, wt in weights:
        jitter = math.exp(rng.gauss(0, 0.1))
        cells.append({"h3": c, "all_year": all_year * wt / total,
                      "critical": min(all_year, in_crit * jitter) * wt / total})
    return _header(region=r.id, resolution=r.sci["grid"]["map_res"], unit="VIIRS fire cell-days per year",
                   source="snpp", years=[years[0], years[-1]], kind=KIND, cells=cells)


def _split(total: int, weights: list[float]) -> list[int]:
    """Largest-remainder split of an integer total by weights (deterministic)."""
    s = sum(weights)
    raw = [total * w / s for w in weights]
    base = [math.floor(x) for x in raw]
    order = sorted(range(len(raw)), key=lambda i: (-(raw[i] - base[i]), i))
    for i in order[: total - sum(base)]:
        base[i] += 1
    return base


def _cells_monthly(r: Region, weights: list[tuple[str, float]]) -> bytes:
    top = weights[:60]
    wts = [wt for _, wt in top]
    months: dict[tuple[int, int], list[float]] = {}
    viirs = r.series["viirs_raw"]["value"]
    for i, d in enumerate(r.days):
        m = months.setdefault((d.year, d.month), [0.0, 0.0])
        m[0] += r.aqua[i] or 0.0
        m[1] += viirs[i] or 0.0
    rows = []
    for (y, mo), (a, v) in sorted(months.items()):
        if not _bin_complete((y, mo), "month"):
            continue
        for (c, _), ca, cv in zip(top, _split(int(a), wts), _split(int(v), wts)):
            if ca or cv:
                rows.append([c, f"{y}{mo:02d}", ca, cv])
    rows.sort(key=lambda row: (row[0], row[1]))
    return csv_bytes(CSV_HEADERS["cells_monthly.csv"], rows)


def _hotspots_recent(r: Region, weights: list[tuple[str, float]]) -> bytes:
    rng = random.Random(f"{r.sci['seed']}-{r.seed_key}-hotspots")
    cells = [c for c, _ in weights[:120]]
    cum = []
    acc = 0.0
    for _, wt in weights[:120]:
        acc += wt
        cum.append(acc)
    rows = []
    first = LAST_DAY - timedelta(30)
    for i, d in enumerate(r.days):
        if d < first or r.noaa20[i] is None:
            continue
        for _ in range(int(r.noaa20[i])):
            c5 = rng.choices(cells, cum_weights=cum)[0]
            child = rng.choice(sorted(h3.cell_to_children(c5, r.sci["grid"]["count_res"])))
            clat, clon = h3.cell_to_latlng(child)
            for _ in range(rng.choice((1, 1, 2, 3))):
                lat = round(clat + rng.uniform(-0.01, 0.01), 3)
                lon = round(clon + rng.uniform(-0.01, 0.01), 3)
                local = datetime(d.year, d.month, d.day, 13, 30) + timedelta(minutes=rng.randint(-40, 40))
                utc = local - timedelta(hours=lon / 15)
                local_day = (utc + timedelta(hours=lon / 15)).date()       # SD-03
                rows.append([f"{lat:.3f}", f"{lon:.3f}", utc.date().isoformat(), utc.strftime("%H%M"), "N20",
                             rng.choices(("n", "h"), weights=(4, 1))[0],
                             f"{math.exp(rng.gauss(math.log(5.0), 0.9)):.3f}", "D", local_day.isoformat(),
                             h3.latlng_to_cell(lat, lon, r.sci["grid"]["count_res"])])
    rows.sort(key=lambda row: (row[8], row[2], row[3], row[0], row[1]))
    return csv_bytes(CSV_HEADERS["hotspots_recent.csv"], rows)


def _outline(r: Region) -> dict[str, Any]:
    w, s, e, n = r.meta["bbox"]
    return {"type": "FeatureCollection", "features": [{
        "type": "Feature", "properties": {"id": r.id, "name": r.meta["name"], "membership": "bbox", "kind": KIND},
        "geometry": {"type": "Polygon", "coordinates": [[[w, s], [e, s], [e, n], [w, n], [w, s]]]}}]}


def _downloads(r: Region) -> dict[str, Any]:
    rng = random.Random(f"{r.sci['seed']}-{r.seed_key}-downloads")
    return _header(region=r.id, hotspot_archives=[
        {"year": y, "sensor": "snpp", "url": "#", "rows": rng.randint(20000, 90000),
         "bytes": rng.randint(900000, 4000000)} for y in (2024, 2025)])


# ---------------------------------------------------------------- top-level files
REGION_FILES = ["weekly", "monthly", "daily", "climatology", "season", "trend", "ruler", "nowcast",
                "hex", "calibration", "outline"]
OPTIONAL_FILES = ["cells_monthly", "downloads", "hotspots_recent"]


def _regions_json(regions: list[Region]) -> dict[str, Any]:
    out = []
    for r in regions:
        w, s, e, n = r.meta["bbox"]
        out.append({
            "id": r.id, "name": r.meta["name"], "country": r.meta["country"], "bbox": list(r.meta["bbox"]),
            "centroid": [(w + e) / 2, (s + n) / 2], "fire_type": r.meta["fire_type"], "story": r.meta["story"],
            "n_cells_r6": len(h3.polygon_to_cells(_bbox_poly(r.meta["bbox"]), r.sci["grid"]["count_res"])),
            "membership": "bbox", "last_data_day": LAST_DAY.isoformat(), "synthetic": bool(r.meta["synthetic"]),
            "files": REGION_FILES, "optional_files": OPTIONAL_FILES})
    return _header(regions=out)


def _eyesight(r: Region) -> dict[str, Any]:
    spec = EYESIGHT.get(r.id)
    if spec is None:
        return {"region": r.id, "status": "absent"}
    rng = random.Random(f"{r.sci['seed']}-{r.seed_key}-eyesight")
    a, b, c = spec["a"], spec["b"], spec["c"]

    def p(frp: float, da: float = 0.0, db: float = 0.0) -> float:
        return c / (1 + math.exp(-(a + da + (b + db) * math.log10(frp))))

    frps = [10 ** (-0.5 + 3.5 * i / 9) for i in range(10)]
    curve = [{"frp_mw": f, "p": p(f), "lo": p(f, -0.25, -0.2), "hi": min(c, p(f, 0.25, 0.2))} for f in frps]
    bins = [10 ** (-0.25 + 3.0 * i / 5) for i in range(6)]
    binned = [{"frp_mw": f, "p_obs": min(1.0, max(0.0, p(f) + rng.gauss(0, 0.03))),
               "n": rng.randint(400, 9000)} for f in bins]
    k_compare = [{"month": m, "k_tier1": r.k["snpp"][m]["k"],
                  "k_tier2": r.k["snpp"][m]["k"] * math.exp(rng.gauss(0, 0.05))} for m in range(1, 13)]
    params = {"a": a, "b": b, "c": c, "a_lo": a - 0.25, "a_hi": a + 0.25, "b_lo": b - 0.2, "b_hi": b + 0.2,
              "c_lo": c - 0.05, "c_hi": min(1.0, c + 0.05)}
    return {"region": r.id, "status": spec["status"], "params": params, "g": spec["g"],
            "n_celldays": spec["n"], "curve": curve, "binned": binned, "k_compare": k_compare}


def _methods(regions: list[Region], sci: dict[str, Any], sci_sha: str) -> dict[str, Any]:
    rng = random.Random(f"{sci['seed']}-methods")
    fit_years = [int(x[:4]) for x in sci["tier1"]["snpp_fit"]]
    validation, drift, inputs, filters = [], [], [], []
    for r in regions:
        wape = rng.uniform(0.12, 0.24)
        validation += [
            {"region": r.id, "test": "loyo_weekly_wape", "method": "tier1", "value": wape,
             "baselines": {"raw_viirs": rng.uniform(1.2, 1.7), "annual_ratio": wape * rng.uniform(1.05, 1.3)},
             "n": 520, "years": fit_years, "note": "Sample value."},
            {"region": r.id, "test": "loyo_weekly_r", "method": "tier1", "value": rng.uniform(0.85, 0.97),
             "n": 520, "years": fit_years, "note": "Sample value."},
            {"region": r.id, "test": "handoff_annual_mape", "method": "tier1", "value": rng.uniform(0.03, 0.09),
             "n": 10, "years": fit_years, "note": "Sample value. Totals match partly by construction."},
            {"region": r.id, "test": "step_naive", "method": "none", "value": r.shape["jump"] * rng.uniform(0.9, 1.1),
             "n": 1, "years": [2011, 2012], "note": "Sample value."},
            {"region": r.id, "test": "step_harmonized", "method": "tier1", "value": rng.uniform(0.9, 1.15),
             "n": 1, "years": [2011, 2012], "note": "Sample value."},
            {"region": r.id, "test": "loyo_bias", "method": "tier1", "value": rng.uniform(-0.04, 0.04),
             "n": 520, "years": fit_years, "note": "Sample value."},
            {"region": r.id, "test": "sat_agreement_wape", "method": "tier1", "value": rng.uniform(0.03, 0.08),
             "n": 156, "years": [2023, 2025], "note": "Sample value."},
            {"region": r.id, "test": "k_direct_vs_chained_pct", "method": "tier1", "value": rng.uniform(-4, 4),
             "n": 12, "years": [2019, 2022], "note": "Sample value."},
            {"region": r.id, "test": "backcast_weekly_wape", "method": "tier1", "value": rng.uniform(0.15, 0.3),
             "n": 520, "years": fit_years, "note": "Sample value."},
        ]
        k_ann = r.k_annual["snpp"]["k"]
        departure = {2023: -0.06, 2024: -0.12, 2025: -0.19}
        for y in range(2013, 2026):
            k = k_ann * (1 + departure.get(y, rng.gauss(0, 0.02)))
            drift.append({"region": r.id, "sensor": "snpp", "year": y, "k_annual": k, "lo": k * 0.96, "hi": k * 1.04})
        for src, first, via in (("MODIS_SP", "2003-01-01", "archive"), ("VIIRS_SNPP_SP", "2012-01-20", "archive"),
                                ("VIIRS_NOAA20_SP", "2018-01-01", "archive"),
                                ("VIIRS_NOAA20_NRT", (LAST_DAY - timedelta(30)).isoformat(), "api")):
            inputs.append({"source": src, "region": r.id, "rows": rng.randint(50000, 900000), "first_date": first,
                           "last_date": LAST_DAY.isoformat(), "downloaded": GENERATED_AT, "via": via})
        for sensor, step in (("aqua", "confidence"), ("snpp", "confidence"), ("snpp", "type")):
            rows_in = rng.randint(100000, 900000)
            filters.append({"region": r.id, "sensor": sensor, "step": step, "rows_in": rows_in,
                            "rows_dropped": int(rows_in * rng.uniform(0.02, 0.15))})
    planted = [("k_annual_snpp", 0.4, 0.41, 0.03), ("trend_pct_per_decade", 20.0, 18.6, 3.0),
               ("peak_week_1", 30.0, 30.0, 1.0), ("peak_week_2", 10.0, 11.0, 1.0),
               ("eyesight_b", 2.0, 2.4, 0.3), ("outage_days_missing", 14.0, 14.0, 0.0)]
    return _header(
        decisions={"reference": "MODIS Aqua, daytime", "count_resolution": sci["grid"]["count_res"],
                   "aqua_trusted_through": sci["eras"]["aqua_trusted_through"],
                   "snpp_through": sci["eras"]["snpp_through"],
                   "baseline_years": sci["climatology"]["baseline_years"], "science_yaml_sha256": sci_sha},
        validation=validation, drift=drift, eyesight=[_eyesight(r) for r in regions],
        planted_truth=[{"quantity": q, "truth": t, "recovered": rec, "tolerance": tol,
                        "pass": abs(rec - t) <= tol} for q, t, rec, tol in planted],
        inputs=inputs, filters=filters,
        sources=[{"claim_id": cid, "text": f"SAMPLE placeholder for claim {cid}; no verified source yet.",
                  "url": "#", "checked": GENERATED_AT[:10]} for cid in ("snpp_end", "snpp_anomaly_2026", "aqua_drift")],
        limitations=["Only daytime detections are used in this version.",
                     "Near-real-time rows are filtered per cell by a static-source mask, standard rows per detection.",
                     "The NOAA-20 era uses the S-NPP eyesight curve (same instrument design)."],
        ai_use="SAMPLE placeholder: this text is replaced by the real statement before release.")


def _kinds(obj: Any, acc: set[str]) -> set[str]:
    if isinstance(obj, dict):
        if isinstance(obj.get("kind"), str):
            acc.add(obj["kind"])
        for v in obj.values():
            _kinds(v, acc)
    elif isinstance(obj, list):
        for v in obj:
            _kinds(v, acc)
    return acc


def build_sample() -> dict[str, bytes]:
    """All sample files as {relative path: bytes}."""
    sci, sci_sha = load_science()
    metas = {m["id"]: m for m in load_regions()}
    regions = [Region(metas[rid], sci) for rid in SAMPLE_REGIONS]
    docs: dict[str, Any] = {"regions.json": _regions_json(regions), "methods.json": _methods(regions, sci, sci_sha)}
    raw: dict[str, bytes] = {}
    builders: dict[str, Callable[[Region], dict[str, Any]]] = {
        "weekly": lambda r: _calendar(r, "week"), "monthly": lambda r: _calendar(r, "month"),
        "daily": _daily, "calibration": _calibration, "nowcast": _nowcast, "downloads": _downloads,
    }
    for r in regions:
        for name, fn in builders.items():
            docs[f"{r.id}/{name}.json"] = fn(r)
        clim = _climatology(r)
        season = _season(r, clim)
        annual = _annual(r)
        weights = _cell_weights(r)
        docs[f"{r.id}/climatology.json"] = clim
        docs[f"{r.id}/season.json"] = season
        docs[f"{r.id}/trend.json"] = _trend(r, annual)
        docs[f"{r.id}/ruler.json"] = _ruler(r, annual)
        docs[f"{r.id}/hex.json"] = _hex(r, weights, season["critical_weeks"])
        docs[f"{r.id}/outline.geojson"] = _outline(r)
        raw[f"{r.id}/cells_monthly.csv"] = _cells_monthly(r, weights)
        raw[f"{r.id}/hotspots_recent.csv"] = _hotspots_recent(r, weights)
    files = {path: json_bytes(doc) for path, doc in docs.items()} | raw
    # the audit reads the files exactly as they will be on disk (rounded), before the manifest lists it
    files[AUDIT_FILE] = build_audit(lambda rel: json.loads(files[rel]) if rel in files else None).encode("utf-8")
    manifest = _header(contains_sample=True, files=[
        {"path": path, "sha256": hashlib.sha256(data).hexdigest(), "bytes": len(data),
         "kinds": sorted(_kinds(docs[path], set())) if path in docs else []}
        for path, data in sorted(files.items())])
    files["manifest.json"] = json_bytes(manifest)
    return files


def write_sample(data_dir: Path) -> list[Path]:
    """Write the sample site under data_dir (normally web/public/data). Returns the written paths."""
    written = []
    for rel, data in sorted(build_sample().items()):
        path = data_dir.joinpath(*rel.split("/"))
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        written.append(path)
    return written
