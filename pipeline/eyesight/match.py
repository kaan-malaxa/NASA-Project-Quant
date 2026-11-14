"""Cell-day matching of S-NPP and Aqua for the eyesight curve (SD-16).

Population: S-NPP fire cell-days (res 6, one pass) in the fit window, on days both Aqua and S-NPP are covered.
Outcome y: Aqua has a fire cell-day in the same cell on the same local day (or, in neighbour mode, in the cell or
one of its six neighbours). Predictor x: log10(max(S-NPP frp_sum, frp floor)). No Aqua column is ever a
predictor: the output carries only S-NPP columns plus y.
"""

from __future__ import annotations

import duckdb
import pandas as pd

from . import compat

AQUA, SNPP = "aqua", "snpp"
MATCHED_COLUMNS = ["local_day", "year", "month", "h3_r6", "frp_sum", "n_det", "x", "y"]


def _neighbour_keys(aqua: pd.DataFrame) -> pd.DataFrame:
    """Every (local_day, cell) within one ring of an Aqua fire cell-day."""
    import h3

    rows = [(d, c) for d, cell in zip(aqua["local_day"], aqua["h3_r6"]) for c in h3.grid_disk(cell, 1)]
    return pd.DataFrame(rows, columns=["local_day", "h3_r6"]).drop_duplicates()


def build_matched(celldays: pd.DataFrame, coverage: pd.DataFrame, fit_start: str, fit_end: str, pass_: str = "D",
                  neighbour: bool = False, frp_floor_mw: float | None = None) -> tuple[pd.DataFrame, dict]:
    """Return (matched S-NPP cell-days, counts) for the window [fit_start, fit_end].

    counts: aqua_celldays_total (Aqua cell-days on the same days), aqua_celldays_matched (those whose cell also
    has an S-NPP row that day, always same-cell), n_matched_rows. g = total / matched.
    """
    if frp_floor_mw is None:
        frp_floor_mw = float(compat.science()[0]["tier2"]["frp_floor_mw"])

    con = duckdb.connect()
    try:
        con.register("celldays", celldays)
        con.register("coverage", coverage)
        params = {"start": fit_start, "end": fit_end, "aqua": AQUA, "snpp": SNPP}
        # Days in the window on which both sensors are covered (SD-08: uncovered days are excluded entirely).
        con.execute("""
            CREATE TEMP TABLE days AS
            SELECT CAST(local_day AS DATE) AS local_day FROM coverage
            WHERE sensor IN ($aqua, $snpp) AND covered
              AND CAST(local_day AS DATE) BETWEEN CAST($start AS DATE) AND CAST($end AS DATE)
            GROUP BY 1 HAVING count(DISTINCT sensor) = 2
        """, params)
        for name, sensor in (("aqua_cd", AQUA), ("snpp_cd", SNPP)):
            con.execute(f"""
                CREATE TEMP TABLE {name} AS
                SELECT CAST(c.local_day AS DATE) AS local_day, c.h3_r6, c.frp_sum, c.n_det
                FROM celldays c JOIN days d ON CAST(c.local_day AS DATE) = d.local_day
                WHERE c.sensor = $sensor AND c.daynight = $pass
            """, {"sensor": sensor, "pass": pass_})

        if neighbour:
            con.register("aqua_keys_df", _neighbour_keys(con.execute("SELECT * FROM aqua_cd").df()))
            con.execute("CREATE TEMP TABLE aqua_keys AS "
                        "SELECT DISTINCT CAST(local_day AS DATE) AS local_day, h3_r6 FROM aqua_keys_df")
        else:
            con.execute("CREATE TEMP TABLE aqua_keys AS SELECT DISTINCT local_day, h3_r6 FROM aqua_cd")

        matched = con.execute("""
            SELECT s.local_day,
                   CAST(year(s.local_day) AS INTEGER) AS year,
                   CAST(month(s.local_day) AS INTEGER) AS month,
                   s.h3_r6,
                   s.frp_sum,
                   s.n_det,
                   log10(greatest(coalesce(CAST(s.frp_sum AS DOUBLE), 0.0), $floor)) AS x,
                   CAST(a.h3_r6 IS NOT NULL AS INTEGER) AS y
            FROM snpp_cd s
            LEFT JOIN aqua_keys a ON a.local_day = s.local_day AND a.h3_r6 = s.h3_r6
            ORDER BY s.local_day, s.h3_r6
        """, {"floor": frp_floor_mw}).df()

        total, both = con.execute("""
            SELECT count(*),
                   count(*) FILTER (WHERE EXISTS (
                       SELECT 1 FROM snpp_cd s WHERE s.local_day = a.local_day AND s.h3_r6 = a.h3_r6))
            FROM (SELECT DISTINCT local_day, h3_r6 FROM aqua_cd) a
        """).fetchone()
    finally:
        con.close()

    matched["local_day"] = pd.to_datetime(matched["local_day"]).dt.date
    counts = {"aqua_celldays_total": int(total), "aqua_celldays_matched": int(both),
              "n_matched_rows": int(len(matched))}
    return matched[MATCHED_COLUMNS], counts


def g_factor(counts: dict) -> float | None:
    """SD-16 Aqua-only factor g = total / matched (None when nothing matched)."""
    if counts["aqua_celldays_matched"] == 0:
        return None
    return counts["aqua_celldays_total"] / counts["aqua_celldays_matched"]
