"""Write contracts/fixtures/claim_check_parity.json: claim inputs and the Python reference results (SD-20).

    python pipeline/common/tests/make_claim_check_parity.py

The same file is read by pipeline/common/tests/test_claim_check.py (results must still match) and by
web/src/lib/claimCheck.test.js (the browser must give identical results). Inline cases use small fabricated
series with known answers; "us" and "synthland" cases use the published claim_check.json files.
The planted-truth claims take the planted trend from the simulator (pipeline/synth/planted.py); this dev tool
is the only place that reads it, and pipeline/synth/tests/test_claim_check_planted.py re-derives it.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT))

from pipeline.common import config as project_config
from pipeline.common.claim_check import (
    NOTES,
    TEMPLATES,
    check_claim,
    config_from_doc,
    export_config,
    r3,
    series_from_doc,
)

OUT = ROOT / "contracts" / "fixtures" / "claim_check_parity.json"
DOCS = {"us": ("United States", ROOT / "web/public/data/us/claim_check.json"),
        "synthland": ("Synthland", ROOT / "web/public/data/synthland/claim_check.json")}
YEARS = range(2003, 2026)


def row(year, harmonized, naive, kind="observed", lo=None, hi=None):
    missing = harmonized is None or naive is None
    return {"year": year, "harmonized": None if missing else harmonized,
            "lo": None if missing else (harmonized if lo is None else lo),
            "hi": None if missing else (harmonized if hi is None else hi),
            "kind": "missing" if missing else kind, "naive_count": None if missing else naive,
            "naive_source": "modis" if year < 2012 else "snpp"}


def flat_naive(year):
    return 3000.0 if year < 2012 else 12000.0  # the 2012 splice jump: x4


def series(rows, replicates=None, name="Testland", unit="hotspots", no_reps=False):
    reps = None if no_reps else (replicates or {"source": "test", "n": 0, "years": [], "values": []})
    return {"place_name": name, "naive_unit": unit, "annual": rows, "replicates": reps}


def step(before, after):
    """Harmonized `before` to 2010, `after` from 2015, linear between; naive splice x4 from 2012."""
    def h(y):
        if y <= 2010:
            return before
        if y >= 2015:
            return after
        return before + (after - before) * (y - 2010) / 5
    return [row(y, h(y), flat_naive(y) * h(y) / before) for y in YEARS]


def claim(direction, pct, y0, y1, place="region"):
    return {"place": place, "direction": direction, "claimed_pct": pct, "from_year": y0, "to_year": y1}


def inline_cases():
    flat = series([row(y, 1000.0, flat_naive(y)) for y in YEARS])
    rising = series(step(1000.0, 1500.0))            # harmonized +50% for 2005 -> 2020
    falling = series(step(1000.0, 700.0))            # harmonized -30%
    with_missing = series([row(y, None if y == 2004 else 1000.0, flat_naive(y)) for y in YEARS])
    small_jump = series([row(y, 1000.0, 3000.0 if y < 2012 else 3600.0) for y in YEARS])  # naive +20%
    zero_start = series([row(y, 1000.0, 0.0 if y < 2008 else 3000.0) for y in YEARS])
    reps_rows = [row(y, 1000.0 if y < 2023 else 1100.0, flat_naive(y), "observed" if y < 2023 else "harmonized")
                 for y in YEARS]
    reps = {"source": "test", "n": 4, "years": [2023, 2024, 2025],
            "values": [[1080.0, 1090.0, 1085.0], [1100.0, 1100.0, 1100.0], [1120.0, 1110.0, 1115.0],
                       [1060.0, 1140.0, 1100.0]]}
    with_reps = series(reps_rows, reps)
    aoi_rows = [row(y, 100.0 if y < 2015 else 130.0, 40.0 if y < 2012 else 160.0,
                    lo=(100.0 if y < 2015 else 130.0) * 0.97, hi=(100.0 if y < 2015 else 130.0) * 1.03)
                for y in YEARS]
    aoi = series(aoi_rows, name="your drawn area", unit="fire cell-days", no_reps=True)
    return [
        ("error_direction", claim("doubled", 10, 2005, 2020), flat),
        ("error_claimed_pct_zero", claim("increased", 0, 2005, 2020), flat),
        ("error_claimed_pct_too_large", claim("increased", 1000.5, 2005, 2020), flat),
        ("error_year_outside_record", claim("increased", 10, 2002, 2020), flat),
        ("error_from_after_to", claim("increased", 10, 2020, 2005), flat),
        ("error_from_equals_to", claim("increased", 10, 2010, 2010), flat),
        ("rule1_missing_year_in_window", claim("increased", 10, 2005, 2020), with_missing),
        ("rule1_zero_start", claim("increased", 10, 2005, 2020), zero_start),
        ("rule2_contradicted", claim("decreased", 20, 2005, 2020), rising),
        ("rule3_sensor_artifact", claim("increased", 300, 2005, 2020), flat),
        ("rule4_no_clear_change_same_sensor", claim("increased", 10, 2004, 2009), flat),
        ("rule4_naive_below_artifact_threshold", claim("increased", 20, 2005, 2020), small_jump),
        ("rule4_no_clear_change_naive_opposite", claim("decreased", 30, 2005, 2020), flat),
        ("rule5_holds_up", claim("increased", 50, 2005, 2020), rising),
        ("rule5_holds_up_inside_tolerance", claim("increased", 54, 2005, 2020), rising),
        ("rule6_weaker_than_claimed", claim("increased", 100, 2005, 2020), rising),
        ("rule7_stronger_than_claimed", claim("increased", 20, 2005, 2020), rising),
        ("negative_holds_up", claim("decreased", 30, 2005, 2020), falling),
        ("negative_weaker_than_claimed", claim("decreased", 60, 2005, 2020), falling),
        ("negative_stronger_than_claimed", claim("decreased", 10, 2005, 2020), falling),
        ("edge_windows_2003_2025", claim("increased", 50, 2003, 2025), rising),
        ("edge_adjacent_years_overlap", claim("increased", 10, 2003, 2004), rising),
        ("replicate_range", claim("increased", 10, 2005, 2024), with_reps),
        ("aoi_envelope_range", claim("increased", 30, 2005, 2020, place="aoi"), aoi),
    ]


def planted_claims(doc):
    from pipeline.synth import planted as P

    cfg = config_from_doc(doc)
    y0, y1 = cfg["record_years"]
    factor = lambda y: 1 + P.TREND_PER_YEAR * (y - P.TREND_BASE_YEAR)
    start, end = [y0, y0 + 1], [y1 - 1, y1]  # the SD-20 windows at the record edges for window_years 3
    planted = r3((sum(map(factor, end)) / len(end) / (sum(map(factor, start)) / len(start)) - 1) * 100)
    naive_probe = check_claim(claim("increased", 1, 2005, 2020), series_from_doc(doc, "Synthland"), cfg)
    return [("planted_trend_full_record", claim("increased", planted, y0, y1)),
            ("planted_naive_splice_across_2012", claim("increased", naive_probe["naive"]["change_pct"], 2005, 2020))]


def main() -> int:
    science = project_config.load_science()
    inline_config = {**export_config(science), "templates": TEMPLATES, "notes": NOTES}
    cases = []
    for name, c, s in inline_cases():
        cases.append({"name": name, "doc": None, "claim": c, "series": s,
                      "expected": check_claim(c, s, inline_config)})
    docs = {key: json.loads(path.read_text(encoding="utf-8")) for key, (_, path) in DOCS.items()}
    real = [("us", "us_2005_2020_doubled", claim("increased", 100, 2005, 2020)),
            ("us", "us_2003_2025_rise_30", claim("increased", 30, 2003, 2025)),
            ("us", "us_2012_2024_fall_10", claim("decreased", 10, 2012, 2024)),
            ("us", "us_2004_2010_rise_5", claim("increased", 5, 2004, 2010)),
            ("synthland", "synthland_2005_2020_rise_20", claim("increased", 20, 2005, 2020))]
    real += [("synthland", name, c) for name, c in planted_claims(docs["synthland"])]
    for key, name, c in real:
        s = series_from_doc(docs[key], DOCS[key][0])
        cases.append({"name": name, "doc": key, "place_name": DOCS[key][0], "claim": c,
                      "expected": check_claim(c, s, config_from_doc(docs[key]))})
    OUT.parent.mkdir(parents=True, exist_ok=True)
    doc = {"description": __doc__.strip().splitlines()[0], "inline_config": inline_config, "cases": cases}
    OUT.write_text(json.dumps(doc, indent=1, sort_keys=True, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"OK wrote {OUT.relative_to(ROOT)} cases={len(cases)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
