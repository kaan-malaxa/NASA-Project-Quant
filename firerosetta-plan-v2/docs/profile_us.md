# US data profile

Generated at: 2026-11-15T00:10:11.575181+00:00
Code version: 3a2db5e

Processed-data profile: unavailable (complete cleaning outputs are absent).
The following is a PROVISIONAL, UNFILTERED source inventory, not validated calibration input.
It includes all local source years and detections outside the counting polygon.
These records have not passed SD-02, deduplication, or the static mask.
R3 must confirm n20_first_full_year after clean/grid succeeds.

Source directory: NASA-Project-Quant/data/

| Sensor | First local_day | Last local_day |
|---|---|---|
| aqua | 2002-07-04 | 2025-12-31 |
| terra | 2000-10-31 | 2025-12-31 |
| snpp | 2012-01-20 | 2025-12-31 |
| noaa20 | 2018-04-01 | 2025-12-31 |

Rows per sensor/year; each entry is rows (NRT share). Years use local solar dates.

| Year | aqua | terra | snpp | noaa20 |
|---|---:|---:|---:|---:|
| 2000 | unavailable | 3794 (0.000%) | unavailable | unavailable |
| 2001 | unavailable | 44934 (0.000%) | unavailable | unavailable |
| 2002 | 24199 (0.000%) | 55519 (0.000%) | unavailable | unavailable |
| 2003 | 62094 (0.000%) | 52369 (0.000%) | unavailable | unavailable |
| 2004 | 78318 (0.000%) | 80067 (0.000%) | unavailable | unavailable |
| 2005 | 84501 (0.000%) | 86671 (0.000%) | unavailable | unavailable |
| 2006 | 68244 (0.000%) | 58484 (0.000%) | unavailable | unavailable |
| 2007 | 75366 (0.000%) | 67058 (0.000%) | unavailable | unavailable |
| 2008 | 64532 (0.000%) | 55259 (0.000%) | unavailable | unavailable |
| 2009 | 61806 (0.000%) | 53370 (0.000%) | unavailable | unavailable |
| 2010 | 54252 (0.000%) | 44074 (0.000%) | unavailable | unavailable |
| 2011 | 67777 (0.000%) | 56096 (0.000%) | unavailable | unavailable |
| 2012 | 72062 (0.000%) | 65220 (0.000%) | 536477 (0.000%) | unavailable |
| 2013 | 53241 (0.000%) | 49106 (0.000%) | 404761 (0.000%) | unavailable |
| 2014 | 53774 (0.000%) | 45101 (0.000%) | 377204 (0.000%) | unavailable |
| 2015 | 75268 (0.000%) | 71721 (0.000%) | 581054 (0.000%) | unavailable |
| 2016 | 61895 (0.000%) | 50840 (0.000%) | 432963 (0.000%) | unavailable |
| 2017 | 79135 (0.000%) | 73567 (0.000%) | 596168 (0.000%) | unavailable |
| 2018 | 67895 (0.000%) | 63083 (0.000%) | 556244 (0.000%) | 461477 (0.000%) |
| 2019 | 53500 (0.000%) | 53715 (0.000%) | 453400 (0.000%) | 451429 (0.000%) |
| 2020 | 78606 (0.000%) | 75247 (0.000%) | 672822 (0.000%) | 665078 (0.000%) |
| 2021 | 83689 (0.000%) | 79991 (0.000%) | 664995 (0.000%) | 670917 (0.000%) |
| 2022 | 67926 (0.000%) | 62432 (0.000%) | 531089 (0.000%) | 546431 (0.000%) |
| 2023 | 51287 (0.000%) | 42715 (0.000%) | 388672 (0.000%) | 390873 (0.000%) |
| 2024 | 67227 (0.000%) | 56504 (0.000%) | 484736 (0.000%) | 535136 (0.000%) |
| 2025 | 61797 (0.000%) | 48027 (0.000%) | 469809 (0.000%) | 485403 (0.000%) |

n20_first_full_year: 2019
Criterion: NOAA-20 detections on >=300 distinct local days in a calendar year.

| NOAA-20 year | Distinct local days |
|---|---:|
| 2018 | 275 |
| 2019 | 365 |
| 2020 | 366 |
| 2021 | 365 |
| 2022 | 365 |
| 2023 | 360 |
| 2024 | 365 |
| 2025 | 365 |

## Grid and coverage

Uncovered days per sensor/reason: unavailable (coverage.parquet is missing).
Region cells: unavailable (region_cells.parquet is missing).
Peak Aqua week: unavailable (cell-day and/or coverage output is missing).

## File sizes

| File | Bytes |
|---|---:|
| ../data/MODIS_data/modis_2000_United_States.csv | 303009 |
| ../data/MODIS_data/modis_2001_United_States.csv | 3601083 |
| ../data/MODIS_data/modis_2002_United_States.csv | 6402373 |
| ../data/MODIS_data/modis_2003_United_States.csv | 9143035 |
| ../data/MODIS_data/modis_2004_United_States.csv | 12681927 |
| ../data/MODIS_data/modis_2005_United_States.csv | 13696548 |
| ../data/MODIS_data/modis_2006_United_States.csv | 10115387 |
| ../data/MODIS_data/modis_2007_United_States.csv | 11392524 |
| ../data/MODIS_data/modis_2008_United_States.csv | 9546176 |
| ../data/MODIS_data/modis_2009_United_States.csv | 9196476 |
| ../data/MODIS_data/modis_2010_United_States.csv | 7817497 |
| ../data/MODIS_data/modis_2011_United_States.csv | 9873534 |
| ../data/MODIS_data/modis_2012_United_States.csv | 10990750 |
| ../data/MODIS_data/modis_2013_United_States.csv | 8177124 |
| ../data/MODIS_data/modis_2014_United_States.csv | 7873157 |
| ../data/MODIS_data/modis_2015_United_States.csv | 11775566 |
| ../data/MODIS_data/modis_2016_United_States.csv | 8992320 |
| ../data/MODIS_data/modis_2017_United_States.csv | 12216545 |
| ../data/MODIS_data/modis_2018_United_States.csv | 10619746 |
| ../data/MODIS_data/modis_2019_United_States.csv | 8661787 |
| ../data/MODIS_data/modis_2020_United_States.csv | 12497392 |
| ../data/MODIS_data/modis_2021_United_States.csv | 13287566 |
| ../data/MODIS_data/modis_2022_United_States.csv | 10554458 |
| ../data/MODIS_data/modis_2023_United_States.csv | 7666284 |
| ../data/MODIS_data/modis_2024_United_States.csv | 10130018 |
| ../data/MODIS_data/modis_2025_United_States.csv | 8984242 |
| ../data/VIIRS-JPSS_data/viirs-jpss1_2018_United_States.csv | 38297124 |
| ../data/VIIRS-JPSS_data/viirs-jpss1_2019_United_States.csv | 37400235 |
| ../data/VIIRS-JPSS_data/viirs-jpss1_2020_United_States.csv | 55202682 |
| ../data/VIIRS-JPSS_data/viirs-jpss1_2021_United_States.csv | 55646945 |
| ../data/VIIRS-JPSS_data/viirs-jpss1_2022_United_States.csv | 45265406 |
| ../data/VIIRS-JPSS_data/viirs-jpss1_2023_United_States.csv | 32317030 |
| ../data/VIIRS-JPSS_data/viirs-jpss1_2024_United_States.csv | 44325866 |
| ../data/VIIRS-JPSS_data/viirs-jpss1_2025_United_States.csv | 40166431 |
| ../data/VIIRS-SNPP_data/viirs-snpp_2012_United_States.csv | 43376908 |
| ../data/VIIRS-SNPP_data/viirs-snpp_2013_United_States.csv | 32698823 |
| ../data/VIIRS-SNPP_data/viirs-snpp_2014_United_States.csv | 30438954 |
| ../data/VIIRS-SNPP_data/viirs-snpp_2015_United_States.csv | 47028405 |
| ../data/VIIRS-SNPP_data/viirs-snpp_2016_United_States.csv | 34943483 |
| ../data/VIIRS-SNPP_data/viirs-snpp_2017_United_States.csv | 48214199 |
| ../data/VIIRS-SNPP_data/viirs-snpp_2018_United_States.csv | 44998998 |
| ../data/VIIRS-SNPP_data/viirs-snpp_2019_United_States.csv | 36655419 |
| ../data/VIIRS-SNPP_data/viirs-snpp_2020_United_States.csv | 54488777 |
| ../data/VIIRS-SNPP_data/viirs-snpp_2021_United_States.csv | 53821377 |
| ../data/VIIRS-SNPP_data/viirs-snpp_2022_United_States.csv | 42927300 |
| ../data/VIIRS-SNPP_data/viirs-snpp_2023_United_States.csv | 31350864 |
| ../data/VIIRS-SNPP_data/viirs-snpp_2024_United_States.csv | 39159899 |
| ../data/VIIRS-SNPP_data/viirs-snpp_2025_United_States.csv | 37923148 |
| raw/us/modis_country_2023.csv | 7572283 |
| raw/us/viirs_noaa20_country_2023.csv | 31926156 |
| raw/us/viirs_snpp_country_2023.csv | 30962191 |
