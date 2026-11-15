# US data profile

Generated at: 2026-11-15T19:26:48.830792+00:00
Code version: 7ca983e0

Basis: cleaned detections; all sensor files are present.
Scope is the existing cleaning outputs, which may cover only a staged subset of the archive.

| Sensor | First local_day | Last local_day |
|---|---|---|
| aqua | 2003-01-01 | 2025-12-31 |
| terra | 2002-12-31 | 2025-12-31 |
| snpp | 2012-01-20 | 2025-12-31 |
| noaa20 | 2018-04-01 | 2025-12-31 |

Rows per sensor/year; each entry is rows (NRT share). Years use local solar dates.

| Year | aqua | terra | snpp | noaa20 |
|---|---:|---:|---:|---:|
| 2002 | unavailable | 1 (0.000%) | unavailable | unavailable |
| 2003 | 56340 (0.000%) | 46244 (0.000%) | unavailable | unavailable |
| 2004 | 70866 (0.000%) | 71116 (0.000%) | unavailable | unavailable |
| 2005 | 75667 (0.000%) | 76359 (0.000%) | unavailable | unavailable |
| 2006 | 62787 (0.000%) | 52769 (0.000%) | unavailable | unavailable |
| 2007 | 68644 (0.000%) | 59800 (0.000%) | unavailable | unavailable |
| 2008 | 59621 (0.000%) | 49844 (0.000%) | unavailable | unavailable |
| 2009 | 57266 (0.000%) | 48421 (0.000%) | unavailable | unavailable |
| 2010 | 49545 (0.000%) | 39276 (0.000%) | unavailable | unavailable |
| 2011 | 62833 (0.000%) | 50786 (0.000%) | unavailable | unavailable |
| 2012 | 65984 (0.000%) | 58263 (0.000%) | 416453 (0.000%) | unavailable |
| 2013 | 47453 (0.000%) | 42891 (0.000%) | 297815 (0.000%) | unavailable |
| 2014 | 48296 (0.000%) | 39248 (0.000%) | 281094 (0.000%) | unavailable |
| 2015 | 67598 (0.000%) | 62784 (0.000%) | 469564 (0.000%) | unavailable |
| 2016 | 56063 (0.000%) | 45073 (0.000%) | 324839 (0.000%) | unavailable |
| 2017 | 71717 (0.000%) | 65129 (0.000%) | 478798 (0.000%) | unavailable |
| 2018 | 59234 (0.000%) | 53194 (0.000%) | 448434 (0.000%) | 362180 (0.000%) |
| 2019 | 48373 (0.000%) | 47241 (0.000%) | 353615 (0.000%) | 342749 (0.000%) |
| 2020 | 72520 (0.000%) | 67595 (0.000%) | 566497 (0.000%) | 559277 (0.000%) |
| 2021 | 76241 (0.000%) | 71249 (0.000%) | 557067 (0.000%) | 560022 (0.000%) |
| 2022 | 60852 (0.000%) | 53815 (0.000%) | 427075 (0.000%) | 435344 (0.000%) |
| 2023 | 46270 (0.000%) | 36913 (0.000%) | 289456 (0.000%) | 290194 (0.000%) |
| 2024 | 61708 (0.000%) | 50033 (0.000%) | 387620 (0.000%) | 427993 (0.000%) |
| 2025 | 55779 (0.000%) | 40793 (0.000%) | 357897 (0.000%) | 368642 (0.000%) |

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

| Sensor | Uncovered reason | Days |
|---|---|---:|
| aqua | no_raw_rows | 2 |
| aqua | outage_list | 34 |
| noaa20 | before_start | 5569 |
| noaa20 | outage_list | 6 |
| snpp | before_start | 3306 |
| snpp | no_raw_rows | 2 |
| snpp | outage_list | 36 |
| terra | no_raw_rows | 40 |
Region cells: 257738; membership: polygon.
Peak Aqua daytime week: year=2024, week=8, fire cell-days per 7 days=2597.000.

## File sizes

| File | Bytes |
|---|---:|
| clean/us/detections_aqua.parquet | 30017440 |
| clean/us/detections_noaa20.parquet | 69690792 |
| clean/us/detections_snpp.parquet | 117758217 |
| clean/us/detections_terra.parquet | 26678153 |
| grid/us/celldays.parquet | 38986677 |
| grid/us/coverage.parquet | 81370 |
| grid/us/region_cells.parquet | 4901256 |
| raw/us/modis_country_2003.csv | 9028563 |
| raw/us/modis_country_2004.csv | 12523541 |
| raw/us/modis_country_2005.csv | 13525387 |
| raw/us/modis_country_2006.csv | 9988649 |
| raw/us/modis_country_2007.csv | 11250103 |
| raw/us/modis_country_2008.csv | 9426378 |
| raw/us/modis_country_2009.csv | 9081301 |
| raw/us/modis_country_2010.csv | 7719174 |
| raw/us/modis_country_2011.csv | 9749666 |
| raw/us/modis_country_2012.csv | 10853454 |
| raw/us/modis_country_2013.csv | 8074775 |
| raw/us/modis_country_2014.csv | 7774285 |
| raw/us/modis_country_2015.csv | 11628581 |
| raw/us/modis_country_2016.csv | 8879583 |
| raw/us/modis_country_2017.csv | 12063842 |
| raw/us/modis_country_2018.csv | 10488759 |
| raw/us/modis_country_2019.csv | 8554573 |
| raw/us/modis_country_2020.csv | 12343543 |
| raw/us/modis_country_2021.csv | 13123878 |
| raw/us/modis_country_2022.csv | 10424099 |
| raw/us/modis_country_2023.csv | 7572283 |
| raw/us/modis_country_2024.csv | 10006305 |
| raw/us/modis_country_2025.csv | 8874396 |
| raw/us/viirs_noaa20_country_2018.csv | 37835646 |
| raw/us/viirs_noaa20_country_2019.csv | 36948805 |
| raw/us/viirs_noaa20_country_2020.csv | 54537603 |
| raw/us/viirs_noaa20_country_2021.csv | 54976027 |
| raw/us/viirs_noaa20_country_2022.csv | 44718974 |
| raw/us/viirs_noaa20_country_2023.csv | 31926156 |
| raw/us/viirs_noaa20_country_2024.csv | 43790729 |
| raw/us/viirs_noaa20_country_2025.csv | 39681027 |
| raw/us/viirs_snpp_country_2012.csv | 42840430 |
| raw/us/viirs_snpp_country_2013.csv | 32294061 |
| raw/us/viirs_snpp_country_2014.csv | 30061749 |
| raw/us/viirs_snpp_country_2015.csv | 46447362 |
| raw/us/viirs_snpp_country_2016.csv | 34510507 |
| raw/us/viirs_snpp_country_2017.csv | 47618030 |
| raw/us/viirs_snpp_country_2018.csv | 44442753 |
| raw/us/viirs_snpp_country_2019.csv | 36202018 |
| raw/us/viirs_snpp_country_2020.csv | 53815954 |
| raw/us/viirs_snpp_country_2021.csv | 53156381 |
| raw/us/viirs_snpp_country_2022.csv | 42396210 |
| raw/us/viirs_snpp_country_2023.csv | 30962191 |
| raw/us/viirs_snpp_country_2024.csv | 38675162 |
| raw/us/viirs_snpp_country_2025.csv | 37453338 |
