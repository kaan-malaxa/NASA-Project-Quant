# Numbers audit

Every headline number on the site, with the file and JSON Pointer it comes from. No number may appear in the pitch, slides, README or video unless it is on this list. Values are copied exactly from the files; sentences are quoted exactly.

Built from code_version sample.

**SAMPLE DATA: these numbers are fabricated for design work. Do not use them anywhere.**

## Contiguous United States (`conus`)

- jump multiple (value): 3.947  conus/ruler.json#/jump_multiple/value
- jump multiple (lo): 3.473  conus/ruler.json#/jump_multiple/lo
- jump multiple (hi): 4.643  conus/ruler.json#/jump_multiple/hi
- jump multiple years: [2013, 2022]  conus/ruler.json#/jump_multiple/years
- ruler sentence: "In Contiguous United States, VIIRS reports about 3.9 times as many hotspots as MODIS for the same years. Spliced naively, the record jumps in 2012; harmonized, it does not."  conus/ruler.json#/sentence
- harmonized trend pct_per_decade: 2.0  conus/trend.json#/harmonized/pct_per_decade
- harmonized trend lo: -6.0  conus/trend.json#/harmonized/lo
- harmonized trend hi: 9.0  conus/trend.json#/harmonized/hi
- harmonized trend direction: "no_clear_change"  conus/trend.json#/harmonized/direction
- naive trend pct_per_decade: 38.0  conus/trend.json#/naive/pct_per_decade
- naive trend lo: 25.0  conus/trend.json#/naive/lo
- naive trend hi: 52.0  conus/trend.json#/naive/hi
- naive trend direction: "rising"  conus/trend.json#/naive/direction
- trend years: [2003, 2025]  conus/trend.json#/years
- verdict sentence_id: "artifact_flat"  conus/trend.json#/sentence_id
- verdict sentence: "The raw record suggests burning rose 38% per decade. After correcting for the sensor change, there is no clear change (-6 to 9% per decade)."  conus/trend.json#/sentence
- critical weeks: [11, 12, 13, 14, 15, 16, 17, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39]  conus/season.json#/critical_weeks
- window w1 label: "early-July to late-September"  conus/season.json#/windows/0/label
- window w1 start_week: 27  conus/season.json#/windows/0/start_week
- window w1 peak_week: 33  conus/season.json#/windows/0/peak_week
- window w1 end_week: 39  conus/season.json#/windows/0/end_week
- window w1 share: 0.599  conus/season.json#/windows/0/share
- window w1 start shift days per decade (value): -4.0  conus/season.json#/windows/0/shift_days_per_decade/start/value
- window w1 start shift days per decade (lo): -5.294  conus/season.json#/windows/0/shift_days_per_decade/start/lo
- window w1 start shift days per decade (hi): -2.727  conus/season.json#/windows/0/shift_days_per_decade/start/hi
- window w1 sentence: "The early-July to late-September season now starts about 4 days earlier per decade (-5 to -3)."  conus/season.json#/windows/0/sentence
- window w2 label: "mid-March to late-April"  conus/season.json#/windows/1/label
- window w2 start_week: 11  conus/season.json#/windows/1/start_week
- window w2 peak_week: 14  conus/season.json#/windows/1/peak_week
- window w2 end_week: 17  conus/season.json#/windows/1/end_week
- window w2 share: 0.206  conus/season.json#/windows/1/share
- window w2 start shift days per decade (value): -4.615  conus/season.json#/windows/1/shift_days_per_decade/start/value
- window w2 start shift days per decade (lo): -6.667  conus/season.json#/windows/1/shift_days_per_decade/start/lo
- window w2 start shift days per decade (hi): -3.333  conus/season.json#/windows/1/shift_days_per_decade/start/hi
- window w2 sentence: "The mid-March to late-April season now starts about 5 days earlier per decade (-7 to -3)."  conus/season.json#/windows/1/sentence
- this week value: 57.265  conus/nowcast.json#/value
- this week lo: 50.777  conus/nowcast.json#/lo
- this week hi: 63.753  conus/nowcast.json#/hi
- this week percentile: 82.609  conus/nowcast.json#/percentile
- this week status: "above_normal"  conus/nowcast.json#/status
- this week as_of: "2026-11-14T03:00:00Z"  conus/nowcast.json#/as_of
- this week window start: "2026-11-07"  conus/nowcast.json#/window/start
- this week window end: "2026-11-13"  conus/nowcast.json#/window/end
- this week years compared: [2003, 2025]  conus/nowcast.json#/baseline_years
- month to date value: 128.412  conus/nowcast.json#/month_to_date/value
- month to date median: 87.0  conus/nowcast.json#/month_to_date/median
- month to date ratio: 1.476  conus/nowcast.json#/month_to_date/ratio
- month to date percentile: 86.957  conus/nowcast.json#/month_to_date/percentile
- this week sentence: "In the 7 days to 13 November 2026, Contiguous United States had 57 Aqua-equivalent fire cell-days: higher than 83% of the same week in 23 past years."  conus/nowcast.json#/sentence
- LOYO weekly WAPE (tier1): 0.226  methods.json#/validation/0/value
- LOYO weekly WAPE baseline annual_ratio: 0.259  methods.json#/validation/0/baselines/annual_ratio
- LOYO weekly WAPE baseline raw_viirs: 1.418  methods.json#/validation/0/baselines/raw_viirs
- LOYO years: [2013, 2022]  methods.json#/validation/0/years
- eyesight status: "validated"  methods.json#/eyesight/0/status
- eyesight param a: -1.2  methods.json#/eyesight/0/params/a
- eyesight param a_hi: -0.95  methods.json#/eyesight/0/params/a_hi
- eyesight param a_lo: -1.45  methods.json#/eyesight/0/params/a_lo
- eyesight param b: 2.1  methods.json#/eyesight/0/params/b
- eyesight param b_hi: 2.3  methods.json#/eyesight/0/params/b_hi
- eyesight param b_lo: 1.9  methods.json#/eyesight/0/params/b_lo
- eyesight param c: 0.82  methods.json#/eyesight/0/params/c
- eyesight param c_hi: 0.87  methods.json#/eyesight/0/params/c_hi
- eyesight param c_lo: 0.77  methods.json#/eyesight/0/params/c_lo
- eyesight g: 1.12  methods.json#/eyesight/0/g

## Planted truth (synthland)

- planted truth passed (count of pass = true): 5 of 6  methods.json#/planted_truth
- k_annual_snpp truth: 0.4  methods.json#/planted_truth/0/truth
- k_annual_snpp recovered: 0.41  methods.json#/planted_truth/0/recovered
- k_annual_snpp tolerance: 0.03  methods.json#/planted_truth/0/tolerance
- k_annual_snpp pass: true  methods.json#/planted_truth/0/pass
- trend_pct_per_decade truth: 20.0  methods.json#/planted_truth/1/truth
- trend_pct_per_decade recovered: 18.6  methods.json#/planted_truth/1/recovered
- trend_pct_per_decade tolerance: 3.0  methods.json#/planted_truth/1/tolerance
- trend_pct_per_decade pass: true  methods.json#/planted_truth/1/pass
- peak_week_1 truth: 30.0  methods.json#/planted_truth/2/truth
- peak_week_1 recovered: 30.0  methods.json#/planted_truth/2/recovered
- peak_week_1 tolerance: 1.0  methods.json#/planted_truth/2/tolerance
- peak_week_1 pass: true  methods.json#/planted_truth/2/pass
- peak_week_2 truth: 10.0  methods.json#/planted_truth/3/truth
- peak_week_2 recovered: 11.0  methods.json#/planted_truth/3/recovered
- peak_week_2 tolerance: 1.0  methods.json#/planted_truth/3/tolerance
- peak_week_2 pass: true  methods.json#/planted_truth/3/pass
- eyesight_b truth: 2.0  methods.json#/planted_truth/4/truth
- eyesight_b recovered: 2.4  methods.json#/planted_truth/4/recovered
- eyesight_b tolerance: 0.3  methods.json#/planted_truth/4/tolerance
- eyesight_b pass: false  methods.json#/planted_truth/4/pass
- outage_days_missing truth: 14.0  methods.json#/planted_truth/5/truth
- outage_days_missing recovered: 14.0  methods.json#/planted_truth/5/recovered
- outage_days_missing tolerance: 0.0  methods.json#/planted_truth/5/tolerance
- outage_days_missing pass: true  methods.json#/planted_truth/5/pass
