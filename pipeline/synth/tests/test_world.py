"""World generator: known-answer checks on season, trend and fire counts."""

from __future__ import annotations

import numpy as np

from pipeline.synth import planted as P
from pipeline.synth.truth import peak_weeks, weekly_fire_totals
from pipeline.synth.world import day_range, season, simulate_fires, trend

BBOX = (10.0, 10.0, 12.0, 12.0)


def test_season_peaks_in_planted_weeks():
    doy = np.arange(1, 366)
    s = season(doy)
    assert np.isclose(s.max(), 1.0)
    week = np.minimum(52, (doy - 1) // 7 + 1)
    assert week[np.argmax(s)] == 44
    spring = (week >= 10) & (week <= 26)
    assert week[spring][np.argmax(s[spring])] == 18
    assert s.min() > 0.0  # floor of 2 % of the peak


def test_trend_is_15_percent_per_decade():
    assert np.isclose(trend(2013) / trend(2003), 1.15)


def test_fires_inside_bbox_and_frp_median():
    fires = simulate_fires(3, "tiny", BBOX)
    assert fires["lon"].between(10, 12).all() and fires["lat"].between(10, 12).all()
    assert abs(np.median(fires["frp"]) - P.FRP_MEDIAN_MW) / P.FRP_MEDIAN_MW < 0.05
    assert abs(fires["night"].mean() - P.NIGHT_SHARE) < 0.01


def test_mean_fires_at_main_peak():
    fires = simulate_fires(3, "tiny", BBOX, start="2003-01-01", end="2003-12-31")
    peak_days = day_range("2003-10-29", "2003-11-04")  # week 44 of 2003, trend = 1
    n = fires["day"].isin(peak_days).sum() / peak_days.size
    assert 20 < n < 30  # base 25 fires/day at the main peak


def test_weekly_and_monthly_distribution_peaks_in_planted_weeks():
    fires = simulate_fires(7, "tiny", BBOX)
    main, second, share_main, share_second = peak_weeks(fires)
    assert abs(main - 44) <= 1 and abs(second - 18) <= 1
    assert share_main > share_second
    months = fires["day"].dt.month.value_counts()
    assert months.idxmax() in (10, 11)  # week 44 straddles October / November
    spring = months.loc[[3, 4, 5, 6]]
    assert spring.idxmax() in (4, 5)  # week 18 is late April / early May
    assert weekly_fire_totals(fires).sum() == len(fires)
