"""Claim Checker (science SD-20): templates, exported configuration and the reference check.

The browser runs the same rules in web/src/lib/claimCheck.js; contracts/fixtures/claim_check_parity.json
pins both to identical output. The templates below are the single source: pipeline/export/claim_check.py
publishes them in <region>/claim_check.json and the browser fills them from there.
"""

from __future__ import annotations

import math
import re
from datetime import date
from typing import Any

# SD-20 verdict templates, keyed by template_id. Slots only; nothing else is ever appended.
TEMPLATES: dict[str, str] = {
    "holds_up": (
        "The claim holds up. After correcting for the sensor change, satellite-detected burning activity in "
        "{place} changed by {h_mid} from {start_window} to {end_window} (likely range {h_lo} to {h_hi}), "
        "in line with the claimed {claimed}."),
    "weaker_than_claimed": (
        "The claim overstates the change. After correcting for the sensor change, satellite-detected burning "
        "activity in {place} changed by {h_mid} from {start_window} to {end_window} (likely range {h_lo} to "
        "{h_hi}), less than the claimed {claimed}."),
    "stronger_than_claimed": (
        "The claim understates the change. After correcting for the sensor change, satellite-detected burning "
        "activity in {place} changed by {h_mid} from {start_window} to {end_window} (likely range {h_lo} to "
        "{h_hi}), more than the claimed {claimed}."),
    "contradicted": (
        "The record contradicts the claim. After correcting for the sensor change, satellite-detected burning "
        "activity in {place} changed by {h_mid} from {start_window} to {end_window} (likely range {h_lo} to "
        "{h_hi}), the opposite direction to the claimed {claimed}."),
    "sensor_artifact": (
        "The claimed change looks like a sensor artifact. The raw record, as most people would compute it, "
        "shows {naive} from {start_window} to {end_window} in {place}, but after correcting for the sensor "
        "change there is no clear change (likely range {h_lo} to {h_hi})."),
    "no_clear_change": (
        "The record shows no clear change. After correcting for the sensor change, satellite-detected burning "
        "activity in {place} changed by {h_mid} from {start_window} to {end_window} (likely range {h_lo} to "
        "{h_hi}), too small to support the claimed {claimed}."),
    "cant_tell_missing": (
        "We can't tell. Satellite coverage is too thin in {missing_years}, inside the years this check "
        "compares, and missing data is never counted as zero."),
    "cant_tell_zero_start": (
        "We can't tell. One of the two records shows no satellite-detected burning activity in {place} in "
        "{start_window}, so a percentage change from those years has no meaning."),
}

# SD-20 notes, keyed by note_id.
NOTES: dict[str, str] = {
    "windows": ("Compared the average of {start_window} with the average of {end_window} ({window_years}-year "
                "windows centred on the chosen years, shortened at the edges of the record)."),
    "tolerance": ("A claim counts as matching when it is within {tolerance} percentage points of the corrected "
                  "likely range."),
    "artifact_share": "About {artifact_share} of the raw change comes from the sensor switch.",
    "same_sensor": ("This period doesn't cross the {sensor_change_year} sensor change, so the two records should "
                    "mostly agree."),
    "aoi_calibration": ("Calibration measured for the whole region is applied to your drawn area. Treat small "
                        "areas as indicative."),
}


def export_config(science: dict[str, Any]) -> dict[str, Any]:
    """The configuration block published in claim_check.json; every value comes from science.yaml."""
    cc = science["claim_check"]
    return {
        "window_years": int(cc["window_years"]),
        "artifact_min_naive_pct": cc["artifact_min_naive_pct"],
        "agreement_tolerance_pct_points": cc["agreement_tolerance_pct_points"],
        "max_claim_pct": cc["max_claim_pct"],
        "interval_percentiles": list(science["tier1"]["interval_percentiles"]),
        "record_years": [int(y) for y in science["trend"]["years"]],
        "sensor_change_year": date.fromisoformat(str(science["eras"]["snpp_first_day"])).year,
        "year_min_covered_frac": science["timebins"]["year_min_covered_frac"],
    }


# ------------------------------------------------------------------ reference check (mirrors web/src/lib/claimCheck.js)
DIRECTIONS = ("increased", "decreased")
KIND_ORDER = ("observed", "harmonized", "estimated", "missing", "sample")
AOI_PLACE_NAME = "your drawn area"
MINUS = "−"


def r3(x: float) -> float:
    """Round half away from zero to 3 decimals (identical in the browser); never returns -0.0."""
    v = math.floor(abs(x) * 1000 + 0.5) / 1000
    v = v if x >= 0 else -v
    return v + 0.0


def whole(x: float) -> int:
    n = math.floor(abs(x) + 0.5)
    return n if x >= 0 or n == 0 else -n


def signed_pct(x: float) -> str:
    n = whole(x)
    return f"+{n}%" if n > 0 else f"{MINUS}{-n}%" if n < 0 else "0%"


def plain_number(x: float) -> str:
    v = r3(x)
    return str(int(v)) if v == int(v) else f"{v:.3f}".rstrip("0").rstrip(".")


def window(center: int, record: list[int], width: int) -> list[int]:
    """`width` years centred on `center` (earlier side gets the extra year when even), trimmed to the record."""
    start = center - width // 2
    return [max(start, record[0]), min(start + width - 1, record[1])]


def window_text(w: list[int]) -> str:
    return str(w[0]) if w[0] == w[1] else f"{w[0]}–{w[1]}"


def quantile(sorted_values: list[float], p: float) -> float:
    """Linear interpolation between order statistics (numpy's default; web/src/lib/aoi.js quantile)."""
    h = (len(sorted_values) - 1) * p
    lo = math.floor(h)
    hi = min(lo + 1, len(sorted_values) - 1)
    return sorted_values[lo] + (sorted_values[hi] - sorted_values[lo]) * (h - lo)


def _mean(values: list[float]) -> float:
    total = 0.0
    for v in values:
        total += v
    return total / len(values)


def _change(start: float, end: float) -> float:
    return (end / start - 1) * 100


def fill(template: str, slots: dict[str, str]) -> str:
    def one(match: re.Match[str]) -> str:
        if match.group(1) not in slots:
            raise KeyError(f"template slot {{{match.group(1)}}} has no value")
        return slots[match.group(1)]
    return re.sub(r"\{(\w+)\}", one, template)


def config_from_doc(doc: dict[str, Any]) -> dict[str, Any]:
    """The `config` argument of check_claim, from a claim_check.json document."""
    return {**doc["config"], "templates": doc["templates"], "notes": doc["notes"]}


def series_from_doc(doc: dict[str, Any], place_name: str) -> dict[str, Any]:
    """The `series` argument of check_claim for a whole region, from a claim_check.json document."""
    return {"place_name": place_name, "naive_unit": doc["naive_unit"], "annual": doc["annual"],
            "replicates": doc["replicates"]}


def _empty(error: str | None = None) -> dict[str, Any]:
    return {"ok": error is None, "error": error, "claimed_change_pct": None, "verdict": None, "template_id": None,
            "sentence": None, "windows": None, "missing_years": [], "naive": None, "naive_unit": None,
            "harmonized": None, "artifact_share": None, "same_sensor": None, "notes": [], "kinds": []}


def _kinds(rows: list[dict[str, Any] | None]) -> list[str]:
    seen = set()
    for row in rows:
        if row is None or row["harmonized"] is None or row["naive_count"] is None:
            seen.add("missing")
            continue
        seen.add(row["kind"])
        seen.add("sample" if row["kind"] == "sample" else "observed")  # the naive lens is counted as recorded
    return [k for k in KIND_ORDER if k in seen]


def check_claim(claim: dict[str, Any], series: dict[str, Any], config: dict[str, Any]) -> dict[str, Any]:
    """SD-20. claim: {place, direction, claimed_pct, from_year, to_year}; series: {place_name, naive_unit, annual,
    replicates | None}; config: config_from_doc(claim_check.json). Pure; returns the contract `result`."""
    record = config["record_years"]
    pct = claim.get("claimed_pct")
    y0, y1 = claim.get("from_year"), claim.get("to_year")
    if claim.get("direction") not in DIRECTIONS:
        return _empty("direction")
    if (not isinstance(pct, (int, float)) or isinstance(pct, bool) or not math.isfinite(pct)
            or not 0 < pct <= config["max_claim_pct"]):
        return _empty("claimed_pct_range")
    if not all(isinstance(y, int) and not isinstance(y, bool) and record[0] <= y <= record[1] for y in (y0, y1)):
        return _empty("years_range")
    if y0 >= y1:
        return _empty("years_order")

    out = _empty()
    claimed = r3(pct if claim["direction"] == "increased" else -pct)
    width = int(config["window_years"])
    w_start, w_end = window(y0, record, width), window(y1, record, width)
    by_year = {int(row["year"]): row for row in series["annual"]}
    start_years = list(range(w_start[0], w_start[1] + 1))
    end_years = list(range(w_end[0], w_end[1] + 1))
    all_years = sorted(set(start_years) | set(end_years))
    rows = [by_year.get(y) for y in all_years]
    missing = [y for y, row in zip(all_years, rows)
               if row is None or row["harmonized"] is None or row["naive_count"] is None]
    scy = config["sensor_change_year"]
    same_sensor = all(y < scy for y in all_years) or all(y >= scy for y in all_years)
    aoi = claim.get("place") == "aoi"
    texts = config["notes"]
    slots = {"place": series["place_name"], "claimed": signed_pct(claimed),
             "start_window": window_text(w_start), "end_window": window_text(w_end),
             "window_years": str(width), "tolerance": plain_number(config["agreement_tolerance_pct_points"]),
             "sensor_change_year": str(scy)}
    out.update({"claimed_change_pct": claimed, "windows": {"start": w_start, "end": w_end},
                "missing_years": missing, "naive_unit": series["naive_unit"], "same_sensor": same_sensor,
                "kinds": _kinds(rows)})
    aoi_note = [{"id": "aoi_calibration", "text": fill(texts["aoi_calibration"], slots)}] if aoi else []

    def cant_tell(template_id: str) -> dict[str, Any]:
        out.update({"verdict": "cant_tell_missing", "template_id": template_id,
                    "sentence": fill(config["templates"][template_id], slots), "notes": aoi_note})
        return out

    if missing:
        slots["missing_years"] = ", ".join(str(y) for y in missing)
        return cant_tell("cant_tell_missing")

    def means(key: str, years: list[int]) -> float:
        return _mean([float(by_year[y][key]) for y in years])

    ns, ne = means("naive_count", start_years), means("naive_count", end_years)
    hs, he = means("harmonized", start_years), means("harmonized", end_years)
    reps = series.get("replicates")
    use_reps = reps is not None
    if not use_reps:
        hs_lo, hs_hi = means("lo", start_years), means("hi", start_years)
        he_lo, he_hi = means("lo", end_years), means("hi", end_years)
    if ns == 0 or hs == 0 or (not use_reps and hs_lo == 0):
        return cant_tell("cant_tell_zero_start")

    n_change = r3(_change(ns, ne))
    mid = r3(_change(hs, he))
    if use_reps:
        index = {int(y): i for i, y in enumerate(reps["years"])}
        changes = []
        for values in reps["values"]:
            def value(y: int, values=values) -> float:
                return float(values[index[y]]) if y in index else float(by_year[y]["harmonized"])
            s = _mean([value(y) for y in start_years])
            if s != 0:
                changes.append(_change(s, _mean([value(y) for y in end_years])))
        if changes:
            changes.sort()
            p_lo, p_hi = config["interval_percentiles"]
            lo, hi = r3(quantile(changes, p_lo / 100)), r3(quantile(changes, p_hi / 100))
        else:
            lo = hi = mid
        source = "replicates"
    else:
        lo, hi = r3(_change(hs_hi, he_lo)), r3(_change(hs_lo, he_hi))
        source = "envelope"
    lo, hi = min(lo, mid), max(hi, mid)
    tol = config["agreement_tolerance_pct_points"]
    band_lo, band_hi = r3(lo - tol), r3(hi + tol)

    sign = 1 if claimed > 0 else -1
    contains_zero = band_lo <= 0 <= band_hi
    if (sign > 0 and band_hi < 0) or (sign < 0 and band_lo > 0):
        verdict = "contradicted"
    elif (n_change * sign > 0 and abs(n_change) >= config["artifact_min_naive_pct"] and contains_zero):
        verdict = "sensor_artifact"
    elif contains_zero:
        verdict = "no_clear_change"
    elif band_lo <= claimed <= band_hi:
        verdict = "holds_up"
    elif (sign > 0 and claimed > band_hi) or (sign < 0 and claimed < band_lo):
        verdict = "weaker_than_claimed"
    else:
        verdict = "stronger_than_claimed"

    share = None
    if not same_sensor and n_change != 0 and n_change * mid > 0:
        s = r3((n_change - mid) / n_change)
        share = s if s > 0 else None

    slots.update({"h_mid": signed_pct(mid), "h_lo": signed_pct(lo), "h_hi": signed_pct(hi),
                  "naive": signed_pct(n_change)})
    if share is not None:
        slots["artifact_share"] = f"{whole(share * 100)}%"
    notes = [{"id": "windows", "text": fill(texts["windows"], slots)},
             {"id": "tolerance", "text": fill(texts["tolerance"], slots)}]
    if share is not None:
        notes.append({"id": "artifact_share", "text": fill(texts["artifact_share"], slots)})
    if same_sensor:
        notes.append({"id": "same_sensor", "text": fill(texts["same_sensor"], slots)})
    out.update({"verdict": verdict, "template_id": verdict, "sentence": fill(config["templates"][verdict], slots),
                "naive": {"start_mean": r3(ns), "end_mean": r3(ne), "change_pct": n_change},
                "harmonized": {"start_mean": r3(hs), "end_mean": r3(he), "mid": mid, "lo": lo, "hi": hi,
                               "band_lo": band_lo, "band_hi": band_hi, "range_source": source},
                "artifact_share": share, "notes": notes + aoi_note})
    return out


def example_claims(doc: dict[str, Any]) -> list[dict[str, Any]]:
    """SD-20 example chips, computed (never chosen by hand) from the region's own record.

    Year pairs come only from config: the first and last untrimmed window centres of the record, and the last
    centre whose window ends before / the first whose window starts at the sensor change year. Each claim is the
    whole-percent change one lens actually shows over that pair (naive: "as most people would compute it";
    harmonized: the corrected change). An example is kept only when it is valid and not cant_tell, and the
    verdict stored with it is the reference result, so the site can verify it.
    """
    cfg = config_from_doc(doc)
    series = series_from_doc(doc, "")
    half = int(cfg["window_years"]) // 2
    first, last = cfg["record_years"][0] + half, cfg["record_years"][1] - half
    scy = cfg["sensor_change_year"]
    pairs = [("naive", first, last), ("harmonized", first, last), ("naive", first, scy - 1 - half),
             ("harmonized", scy + half, last)]
    out, seen = [], set()
    for lens, y0, y1 in pairs:
        probe = check_claim({"place": "region", "direction": "increased", "claimed_pct": 1, "from_year": y0,
                             "to_year": y1}, series, cfg)
        if not probe["ok"] or probe["verdict"] == "cant_tell_missing":
            continue
        value = probe["naive"]["change_pct"] if lens == "naive" else probe["harmonized"]["mid"]
        pct = abs(whole(value))
        if pct == 0 or pct > cfg["max_claim_pct"]:
            continue
        claim = {"place": "region", "direction": "increased" if value > 0 else "decreased", "claimed_pct": pct,
                 "from_year": y0, "to_year": y1}
        key = tuple(claim.values())
        if key in seen:
            continue
        seen.add(key)
        result = check_claim(claim, series, cfg)
        out.append({"source_lens": lens, "claim": claim, "verdict": result["verdict"],
                    "template_id": result["template_id"]})
    return out
