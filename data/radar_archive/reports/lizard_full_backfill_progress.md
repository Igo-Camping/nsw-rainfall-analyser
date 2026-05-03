# Lizard Precipitation Australia — Full Historical Backfill Progress


## Run started 2026-05-03T13:08:10.899294+00:00
- temporal range discovered: `2017-11-20T15:00:00Z` → `2026-05-10T12:00:00Z`
- 103 calendar months in range
- --only filter: 1 match `2024-02`

### 2024-02
- window: `2024-02-01T00:00:00Z` → `2024-02-29T21:00:00Z`
- expected timesteps: 232
- subprocess rc=0 elapsed=90.5s
- raw=232 meta=232 missing=0 (first=[])
- distinct sha256 = 218/232, distinct sizes = 203
- metadata uses start/stop: True
- spot pixel sanity:
  - `20240201T000000Z`  min=0.020 max=0.160 mean=0.088  size=[256, 256]  valid=65536/65536
  - `20240215T120000Z`  min=2.000 max=3.170 mean=2.772  size=[256, 256]  valid=65536/65536
  - `20240229T210000Z`  min=0.120 max=0.240 mean=0.181  size=[256, 256]  valid=65536/65536
- result: **PASS**

## Run complete 2026-05-03T13:09:46.840296+00:00

## Run started 2026-05-03T13:09:54.676469+00:00
- temporal range discovered: `2017-11-20T15:00:00Z` → `2026-05-10T12:00:00Z`
- 103 calendar months in range
- --only filter: 1 match `2017-11`

### 2017-11
- window: `2017-11-20T15:00:00Z` → `2017-11-30T21:00:00Z`
- expected timesteps: 83
- subprocess rc=0 elapsed=34.8s
- raw=83 meta=83 missing=0 (first=[])
- distinct sha256 = 2/83, distinct sizes = 2
- metadata uses start/stop: True
- spot pixel sanity:
  - `20171120T150000Z`  min=0.000 max=0.000 mean=0.000  size=[256, 256]  valid=65536/65536
  - `20171125T180000Z`  min=0.000 max=0.000 mean=0.000  size=[256, 256]  valid=65536/65536
  - `20171130T210000Z` ERROR: all nodata
- result: **FAIL**

## STOPPED at 2017-11

## Run started 2026-05-03T13:12:03.892564+00:00
- temporal range discovered: `2017-11-20T15:00:00Z` → `2026-05-10T12:00:00Z`
- 103 calendar months in range
- --only filter: 1 match `2017-11`

### 2017-11
- window: `2017-11-20T15:00:00Z` → `2017-11-30T21:00:00Z`
- expected timesteps: 83
- already complete and valid -> **SKIP** (no fetch)

## Run complete 2026-05-03T13:12:05.186141+00:00

## Run started 2026-05-03T13:12:37.964868+00:00
- temporal range discovered: `2017-11-20T15:00:00Z` → `2026-05-10T12:00:00Z`
- 103 calendar months in range

### 2017-11
- window: `2017-11-20T15:00:00Z` → `2017-11-30T21:00:00Z`
- expected timesteps: 83
- already complete and valid -> **SKIP** (no fetch)

### 2017-12
- window: `2017-12-01T00:00:00Z` → `2017-12-31T21:00:00Z`
- expected timesteps: 248
- subprocess rc=0 elapsed=91.4s
- raw=248 meta=248 missing=0 (first=[])
- distinct sha256 = 1/248, distinct sizes = 1
- metadata uses start/stop: True
- spot pixel sanity:
  - `20171201T000000Z` ERROR: all nodata
  - `20171216T120000Z` ERROR: all nodata
  - `20171231T210000Z` ERROR: all nodata
- result: **FAIL**

## STOPPED at 2017-12

## Run started 2026-05-03T13:19:56.191563+00:00
- temporal range discovered: `2017-11-20T15:00:00Z` → `2026-05-10T12:00:00Z`
- 103 calendar months in range
- --only filter: 1 match `2017-12`

### 2017-12
- window: `2017-12-01T00:00:00Z` → `2017-12-31T21:00:00Z`
- expected timesteps: 248
- already complete -> **SKIP** (PASS (coverage gap, all-nodata))

## Run complete 2026-05-03T13:19:58.074165+00:00

## Run started 2026-05-03T13:20:14.440400+00:00
- temporal range discovered: `2017-11-20T15:00:00Z` → `2026-05-10T12:00:00Z`
- 103 calendar months in range

### 2017-11
- window: `2017-11-20T15:00:00Z` → `2017-11-30T21:00:00Z`
- expected timesteps: 83
- already complete -> **SKIP** (PASS)

### 2017-12
- window: `2017-12-01T00:00:00Z` → `2017-12-31T21:00:00Z`
- expected timesteps: 248
- already complete -> **SKIP** (PASS (coverage gap, all-nodata))

### 2018-01
- window: `2018-01-01T00:00:00Z` → `2018-01-31T21:00:00Z`
- expected timesteps: 248
- subprocess rc=0 elapsed=92.2s
- raw=248 meta=248 missing=0 (first=[])
- distinct sha256 = 1/248, distinct sizes = 1
- metadata uses start/stop: True
- spot pixel sanity:
  - `20180101T000000Z` ERROR: all nodata
  - `20180116T120000Z` ERROR: all nodata
  - `20180131T210000Z` ERROR: all nodata
- result: **PASS (coverage gap, all-nodata)**

### 2018-02
- window: `2018-02-01T00:00:00Z` → `2018-02-28T21:00:00Z`
- expected timesteps: 224
- subprocess rc=0 elapsed=84.1s
- raw=224 meta=224 missing=0 (first=[])
- distinct sha256 = 1/224, distinct sizes = 1
- metadata uses start/stop: True
- spot pixel sanity:
  - `20180201T000000Z` ERROR: all nodata
  - `20180215T000000Z` ERROR: all nodata
  - `20180228T210000Z` ERROR: all nodata
- result: **PASS (coverage gap, all-nodata)**

### 2018-03
- window: `2018-03-01T00:00:00Z` → `2018-03-31T21:00:00Z`
- expected timesteps: 248
- subprocess rc=0 elapsed=92.4s
- raw=248 meta=248 missing=0 (first=[])
- distinct sha256 = 1/248, distinct sizes = 1
- metadata uses start/stop: True
- spot pixel sanity:
  - `20180301T000000Z` ERROR: all nodata
  - `20180316T120000Z` ERROR: all nodata
  - `20180331T210000Z` ERROR: all nodata
- result: **PASS (coverage gap, all-nodata)**

### 2018-04
- window: `2018-04-01T00:00:00Z` → `2018-04-30T21:00:00Z`
- expected timesteps: 240
- subprocess rc=0 elapsed=89.2s
- raw=240 meta=240 missing=0 (first=[])
- distinct sha256 = 1/240, distinct sizes = 1
- metadata uses start/stop: True
- spot pixel sanity:
  - `20180401T000000Z` ERROR: all nodata
  - `20180416T000000Z` ERROR: all nodata
  - `20180430T210000Z` ERROR: all nodata
- result: **PASS (coverage gap, all-nodata)**

### 2018-05
- window: `2018-05-01T00:00:00Z` → `2018-05-31T21:00:00Z`
- expected timesteps: 248
- subprocess rc=0 elapsed=91.6s
- raw=248 meta=248 missing=0 (first=[])
- distinct sha256 = 1/248, distinct sizes = 1
- metadata uses start/stop: True
- spot pixel sanity:
  - `20180501T000000Z` ERROR: all nodata
  - `20180516T120000Z` ERROR: all nodata
  - `20180531T210000Z` ERROR: all nodata
- result: **PASS (coverage gap, all-nodata)**

### 2018-06
- window: `2018-06-01T00:00:00Z` → `2018-06-30T21:00:00Z`
- expected timesteps: 240
- subprocess rc=0 elapsed=88.5s
- raw=240 meta=240 missing=0 (first=[])
- distinct sha256 = 1/240, distinct sizes = 1
- metadata uses start/stop: True
- spot pixel sanity:
  - `20180601T000000Z` ERROR: all nodata
  - `20180616T000000Z` ERROR: all nodata
  - `20180630T210000Z` ERROR: all nodata
- result: **PASS (coverage gap, all-nodata)**

### 2018-07
- window: `2018-07-01T00:00:00Z` → `2018-07-31T21:00:00Z`
- expected timesteps: 248
- subprocess rc=0 elapsed=92.9s
- raw=248 meta=248 missing=0 (first=[])
- distinct sha256 = 1/248, distinct sizes = 1
- metadata uses start/stop: True
- spot pixel sanity:
  - `20180701T000000Z` ERROR: all nodata
  - `20180716T120000Z` ERROR: all nodata
  - `20180731T210000Z` ERROR: all nodata
- result: **PASS (coverage gap, all-nodata)**

### 2018-08
- window: `2018-08-01T00:00:00Z` → `2018-08-31T21:00:00Z`
- expected timesteps: 248
- subprocess rc=0 elapsed=93.3s
- raw=248 meta=248 missing=0 (first=[])
- distinct sha256 = 1/248, distinct sizes = 1
- metadata uses start/stop: True
- spot pixel sanity:
  - `20180801T000000Z` ERROR: all nodata
  - `20180816T120000Z` ERROR: all nodata
  - `20180831T210000Z` ERROR: all nodata
- result: **PASS (coverage gap, all-nodata)**

### 2018-09
- window: `2018-09-01T00:00:00Z` → `2018-09-30T21:00:00Z`
- expected timesteps: 240
- subprocess rc=0 elapsed=89.8s
- raw=240 meta=240 missing=0 (first=[])
- distinct sha256 = 1/240, distinct sizes = 1
- metadata uses start/stop: True
- spot pixel sanity:
  - `20180901T000000Z` ERROR: all nodata
  - `20180916T000000Z` ERROR: all nodata
  - `20180930T210000Z` ERROR: all nodata
- result: **PASS (coverage gap, all-nodata)**

### 2018-10
- window: `2018-10-01T00:00:00Z` → `2018-10-31T21:00:00Z`
- expected timesteps: 248
- subprocess rc=0 elapsed=91.1s
- raw=248 meta=248 missing=0 (first=[])
- distinct sha256 = 1/248, distinct sizes = 1
- metadata uses start/stop: True
- spot pixel sanity:
  - `20181001T000000Z` ERROR: all nodata
  - `20181016T120000Z` ERROR: all nodata
  - `20181031T210000Z` ERROR: all nodata
- result: **PASS (coverage gap, all-nodata)**

### 2018-11
- window: `2018-11-01T00:00:00Z` → `2018-11-30T21:00:00Z`
- expected timesteps: 240
- subprocess rc=0 elapsed=88.9s
- raw=240 meta=240 missing=0 (first=[])
- distinct sha256 = 1/240, distinct sizes = 1
- metadata uses start/stop: True
- spot pixel sanity:
  - `20181101T000000Z` ERROR: all nodata
  - `20181116T000000Z` ERROR: all nodata
  - `20181130T210000Z` ERROR: all nodata
- result: **PASS (coverage gap, all-nodata)**

### 2018-12
- window: `2018-12-01T00:00:00Z` → `2018-12-31T21:00:00Z`
- expected timesteps: 248
- subprocess rc=0 elapsed=93.9s
- raw=248 meta=248 missing=0 (first=[])
- distinct sha256 = 1/248, distinct sizes = 1
- metadata uses start/stop: True
- spot pixel sanity:
  - `20181201T000000Z` ERROR: all nodata
  - `20181216T120000Z` ERROR: all nodata
  - `20181231T210000Z` ERROR: all nodata
- result: **PASS (coverage gap, all-nodata)**

### 2019-01
- window: `2019-01-01T00:00:00Z` → `2019-01-31T21:00:00Z`
- expected timesteps: 248
- subprocess rc=0 elapsed=91.9s
- raw=248 meta=248 missing=0 (first=[])
- distinct sha256 = 1/248, distinct sizes = 1
- metadata uses start/stop: True
- spot pixel sanity:
  - `20190101T000000Z` ERROR: all nodata
  - `20190116T120000Z` ERROR: all nodata
  - `20190131T210000Z` ERROR: all nodata
- result: **PASS (coverage gap, all-nodata)**

### 2019-02
- window: `2019-02-01T00:00:00Z` → `2019-02-28T21:00:00Z`
- expected timesteps: 224
- subprocess rc=0 elapsed=83.9s
- raw=224 meta=224 missing=0 (first=[])
- distinct sha256 = 1/224, distinct sizes = 1
- metadata uses start/stop: True
- spot pixel sanity:
  - `20190201T000000Z` ERROR: all nodata
  - `20190215T000000Z` ERROR: all nodata
  - `20190228T210000Z` ERROR: all nodata
- result: **PASS (coverage gap, all-nodata)**

### 2019-03
- window: `2019-03-01T00:00:00Z` → `2019-03-31T21:00:00Z`
- expected timesteps: 248
- subprocess rc=0 elapsed=93.5s
- raw=248 meta=248 missing=0 (first=[])
- distinct sha256 = 1/248, distinct sizes = 1
- metadata uses start/stop: True
- spot pixel sanity:
  - `20190301T000000Z` ERROR: all nodata
  - `20190316T120000Z` ERROR: all nodata
  - `20190331T210000Z` ERROR: all nodata
- result: **PASS (coverage gap, all-nodata)**

### 2019-04
- window: `2019-04-01T00:00:00Z` → `2019-04-30T21:00:00Z`
- expected timesteps: 240
- subprocess rc=0 elapsed=87.6s
- raw=240 meta=240 missing=0 (first=[])
- distinct sha256 = 1/240, distinct sizes = 1
- metadata uses start/stop: True
- spot pixel sanity:
  - `20190401T000000Z` ERROR: all nodata
  - `20190416T000000Z` ERROR: all nodata
  - `20190430T210000Z` ERROR: all nodata
- result: **PASS (coverage gap, all-nodata)**

### 2019-05
- window: `2019-05-01T00:00:00Z` → `2019-05-31T21:00:00Z`
- expected timesteps: 248
- subprocess rc=0 elapsed=92.0s
- raw=248 meta=248 missing=0 (first=[])
- distinct sha256 = 1/248, distinct sizes = 1
- metadata uses start/stop: True
- spot pixel sanity:
  - `20190501T000000Z` ERROR: all nodata
  - `20190516T120000Z` ERROR: all nodata
  - `20190531T210000Z` ERROR: all nodata
- result: **PASS (coverage gap, all-nodata)**

### 2019-06
- window: `2019-06-01T00:00:00Z` → `2019-06-30T21:00:00Z`
- expected timesteps: 240
- subprocess rc=0 elapsed=89.4s
- raw=240 meta=240 missing=0 (first=[])
- distinct sha256 = 1/240, distinct sizes = 1
- metadata uses start/stop: True
- spot pixel sanity:
  - `20190601T000000Z` ERROR: all nodata
  - `20190616T000000Z` ERROR: all nodata
  - `20190630T210000Z` ERROR: all nodata
- result: **PASS (coverage gap, all-nodata)**

### 2019-07
- window: `2019-07-01T00:00:00Z` → `2019-07-31T21:00:00Z`
- expected timesteps: 248
- subprocess rc=0 elapsed=91.3s
- raw=248 meta=248 missing=0 (first=[])
- distinct sha256 = 1/248, distinct sizes = 1
- metadata uses start/stop: True
- spot pixel sanity:
  - `20190701T000000Z` ERROR: all nodata
  - `20190716T120000Z` ERROR: all nodata
  - `20190731T210000Z` ERROR: all nodata
- result: **PASS (coverage gap, all-nodata)**

### 2019-08
- window: `2019-08-01T00:00:00Z` → `2019-08-31T21:00:00Z`
- expected timesteps: 248
- subprocess rc=0 elapsed=92.4s
- raw=248 meta=248 missing=0 (first=[])
- distinct sha256 = 1/248, distinct sizes = 1
- metadata uses start/stop: True
- spot pixel sanity:
  - `20190801T000000Z` ERROR: all nodata
  - `20190816T120000Z` ERROR: all nodata
  - `20190831T210000Z` ERROR: all nodata
- result: **PASS (coverage gap, all-nodata)**

### 2019-09
- window: `2019-09-01T00:00:00Z` → `2019-09-30T21:00:00Z`
- expected timesteps: 240
- subprocess rc=0 elapsed=89.3s
- raw=240 meta=240 missing=0 (first=[])
- distinct sha256 = 1/240, distinct sizes = 1
- metadata uses start/stop: True
- spot pixel sanity:
  - `20190901T000000Z` ERROR: all nodata
  - `20190916T000000Z` ERROR: all nodata
  - `20190930T210000Z` ERROR: all nodata
- result: **PASS (coverage gap, all-nodata)**

### 2019-10
- window: `2019-10-01T00:00:00Z` → `2019-10-31T21:00:00Z`
- expected timesteps: 248
- subprocess rc=0 elapsed=91.6s
- raw=248 meta=248 missing=0 (first=[])
- distinct sha256 = 1/248, distinct sizes = 1
- metadata uses start/stop: True
- spot pixel sanity:
  - `20191001T000000Z` ERROR: all nodata
  - `20191016T120000Z` ERROR: all nodata
  - `20191031T210000Z` ERROR: all nodata
- result: **PASS (coverage gap, all-nodata)**

### 2019-11
- window: `2019-11-01T00:00:00Z` → `2019-11-30T21:00:00Z`
- expected timesteps: 240
- subprocess rc=0 elapsed=88.1s
- raw=240 meta=240 missing=0 (first=[])
- distinct sha256 = 1/240, distinct sizes = 1
- metadata uses start/stop: True
- spot pixel sanity:
  - `20191101T000000Z` ERROR: all nodata
  - `20191116T000000Z` ERROR: all nodata
  - `20191130T210000Z` ERROR: all nodata
- result: **PASS (coverage gap, all-nodata)**

### 2019-12
- window: `2019-12-01T00:00:00Z` → `2019-12-31T21:00:00Z`
- expected timesteps: 248
- subprocess rc=0 elapsed=93.0s
- raw=248 meta=248 missing=0 (first=[])
- distinct sha256 = 1/248, distinct sizes = 1
- metadata uses start/stop: True
- spot pixel sanity:
  - `20191201T000000Z` ERROR: all nodata
  - `20191216T120000Z` ERROR: all nodata
  - `20191231T210000Z` ERROR: all nodata
- result: **PASS (coverage gap, all-nodata)**

### 2020-01
- window: `2020-01-01T00:00:00Z` → `2020-01-31T21:00:00Z`
- expected timesteps: 248
- subprocess rc=0 elapsed=92.9s
- raw=248 meta=248 missing=0 (first=[])
- distinct sha256 = 1/248, distinct sizes = 1
- metadata uses start/stop: True
- spot pixel sanity:
  - `20200101T000000Z` ERROR: all nodata
  - `20200116T120000Z` ERROR: all nodata
  - `20200131T210000Z` ERROR: all nodata
- result: **PASS (coverage gap, all-nodata)**

### 2020-02
- window: `2020-02-01T00:00:00Z` → `2020-02-29T21:00:00Z`
- expected timesteps: 232
- subprocess rc=0 elapsed=86.7s
- raw=232 meta=232 missing=0 (first=[])
- distinct sha256 = 1/232, distinct sizes = 1
- metadata uses start/stop: True
- spot pixel sanity:
  - `20200201T000000Z` ERROR: all nodata
  - `20200215T120000Z` ERROR: all nodata
  - `20200229T210000Z` ERROR: all nodata
- result: **PASS (coverage gap, all-nodata)**

### 2020-03
- window: `2020-03-01T00:00:00Z` → `2020-03-31T21:00:00Z`
- expected timesteps: 248
- subprocess rc=0 elapsed=92.4s
- raw=248 meta=248 missing=0 (first=[])
- distinct sha256 = 1/248, distinct sizes = 1
- metadata uses start/stop: True
- spot pixel sanity:
  - `20200301T000000Z` ERROR: all nodata
  - `20200316T120000Z` ERROR: all nodata
  - `20200331T210000Z` ERROR: all nodata
- result: **PASS (coverage gap, all-nodata)**

### 2020-04
- window: `2020-04-01T00:00:00Z` → `2020-04-30T21:00:00Z`
- expected timesteps: 240
- subprocess rc=0 elapsed=89.3s
- raw=240 meta=240 missing=0 (first=[])
- distinct sha256 = 1/240, distinct sizes = 1
- metadata uses start/stop: True
- spot pixel sanity:
  - `20200401T000000Z` ERROR: all nodata
  - `20200416T000000Z` ERROR: all nodata
  - `20200430T210000Z` ERROR: all nodata
- result: **PASS (coverage gap, all-nodata)**

### 2020-05
- window: `2020-05-01T00:00:00Z` → `2020-05-31T21:00:00Z`
- expected timesteps: 248
- subprocess rc=0 elapsed=92.9s
- raw=248 meta=248 missing=0 (first=[])
- distinct sha256 = 1/248, distinct sizes = 1
- metadata uses start/stop: True
- spot pixel sanity:
  - `20200501T000000Z` ERROR: all nodata
  - `20200516T120000Z` ERROR: all nodata
  - `20200531T210000Z` ERROR: all nodata
- result: **PASS (coverage gap, all-nodata)**

### 2020-06
- window: `2020-06-01T00:00:00Z` → `2020-06-30T21:00:00Z`
- expected timesteps: 240
- subprocess rc=0 elapsed=91.4s
- raw=240 meta=240 missing=0 (first=[])
- distinct sha256 = 1/240, distinct sizes = 1
- metadata uses start/stop: True
- spot pixel sanity:
  - `20200601T000000Z` ERROR: all nodata
  - `20200616T000000Z` ERROR: all nodata
  - `20200630T210000Z` ERROR: all nodata
- result: **PASS (coverage gap, all-nodata)**

### 2020-07
- window: `2020-07-01T00:00:00Z` → `2020-07-31T21:00:00Z`
- expected timesteps: 248
- subprocess rc=0 elapsed=94.7s
- raw=248 meta=248 missing=0 (first=[])
- distinct sha256 = 1/248, distinct sizes = 1
- metadata uses start/stop: True
- spot pixel sanity:
  - `20200701T000000Z` ERROR: all nodata
  - `20200716T120000Z` ERROR: all nodata
  - `20200731T210000Z` ERROR: all nodata
- result: **PASS (coverage gap, all-nodata)**

### 2020-08
- window: `2020-08-01T00:00:00Z` → `2020-08-31T21:00:00Z`
- expected timesteps: 248
- subprocess rc=0 elapsed=91.5s
- raw=248 meta=248 missing=0 (first=[])
- distinct sha256 = 1/248, distinct sizes = 1
- metadata uses start/stop: True
- spot pixel sanity:
  - `20200801T000000Z` ERROR: all nodata
  - `20200816T120000Z` ERROR: all nodata
  - `20200831T210000Z` ERROR: all nodata
- result: **PASS (coverage gap, all-nodata)**

### 2020-09
- window: `2020-09-01T00:00:00Z` → `2020-09-30T21:00:00Z`
- expected timesteps: 240
- subprocess rc=0 elapsed=89.7s
- raw=240 meta=240 missing=0 (first=[])
- distinct sha256 = 1/240, distinct sizes = 1
- metadata uses start/stop: True
- spot pixel sanity:
  - `20200901T000000Z` ERROR: all nodata
  - `20200916T000000Z` ERROR: all nodata
  - `20200930T210000Z` ERROR: all nodata
- result: **PASS (coverage gap, all-nodata)**

### 2020-10
- window: `2020-10-01T00:00:00Z` → `2020-10-31T21:00:00Z`
- expected timesteps: 248
- subprocess rc=0 elapsed=93.6s
- raw=248 meta=248 missing=0 (first=[])
- distinct sha256 = 1/248, distinct sizes = 1
- metadata uses start/stop: True
- spot pixel sanity:
  - `20201001T000000Z` ERROR: all nodata
  - `20201016T120000Z` ERROR: all nodata
  - `20201031T210000Z` ERROR: all nodata
- result: **PASS (coverage gap, all-nodata)**

### 2020-11
- window: `2020-11-01T00:00:00Z` → `2020-11-30T21:00:00Z`
- expected timesteps: 240
- subprocess rc=0 elapsed=92.3s
- raw=240 meta=240 missing=0 (first=[])
- distinct sha256 = 1/240, distinct sizes = 1
- metadata uses start/stop: True
- spot pixel sanity:
  - `20201101T000000Z` ERROR: all nodata
  - `20201116T000000Z` ERROR: all nodata
  - `20201130T210000Z` ERROR: all nodata
- result: **PASS (coverage gap, all-nodata)**

### 2020-12
- window: `2020-12-01T00:00:00Z` → `2020-12-31T21:00:00Z`
- expected timesteps: 248
- subprocess rc=0 elapsed=91.3s
- raw=248 meta=248 missing=0 (first=[])
- distinct sha256 = 1/248, distinct sizes = 1
- metadata uses start/stop: True
- spot pixel sanity:
  - `20201201T000000Z` ERROR: all nodata
  - `20201216T120000Z` ERROR: all nodata
  - `20201231T210000Z` ERROR: all nodata
- result: **PASS (coverage gap, all-nodata)**

### 2021-01
- window: `2021-01-01T00:00:00Z` → `2021-01-31T21:00:00Z`
- expected timesteps: 248
- subprocess rc=0 elapsed=92.8s
- raw=248 meta=248 missing=0 (first=[])
- distinct sha256 = 1/248, distinct sizes = 1
- metadata uses start/stop: True
- spot pixel sanity:
  - `20210101T000000Z` ERROR: all nodata
  - `20210116T120000Z` ERROR: all nodata
  - `20210131T210000Z` ERROR: all nodata
- result: **PASS (coverage gap, all-nodata)**

### 2021-02
- window: `2021-02-01T00:00:00Z` → `2021-02-28T21:00:00Z`
- expected timesteps: 224
- subprocess rc=0 elapsed=102.5s
- raw=224 meta=224 missing=0 (first=[])
- distinct sha256 = 1/224, distinct sizes = 1
- metadata uses start/stop: True
- spot pixel sanity:
  - `20210201T000000Z` ERROR: all nodata
  - `20210215T000000Z` ERROR: all nodata
  - `20210228T210000Z` ERROR: all nodata
- result: **PASS (coverage gap, all-nodata)**

### 2021-03
- window: `2021-03-01T00:00:00Z` → `2021-03-31T21:00:00Z`
- expected timesteps: 248
- subprocess rc=0 elapsed=95.9s
- raw=248 meta=248 missing=0 (first=[])
- distinct sha256 = 1/248, distinct sizes = 1
- metadata uses start/stop: True
- spot pixel sanity:
  - `20210301T000000Z` ERROR: all nodata
  - `20210316T120000Z` ERROR: all nodata
  - `20210331T210000Z` ERROR: all nodata
- result: **PASS (coverage gap, all-nodata)**

### 2021-04
- window: `2021-04-01T00:00:00Z` → `2021-04-30T21:00:00Z`
- expected timesteps: 240
- subprocess rc=0 elapsed=88.9s
- raw=240 meta=240 missing=0 (first=[])
- distinct sha256 = 1/240, distinct sizes = 1
- metadata uses start/stop: True
- spot pixel sanity:
  - `20210401T000000Z` ERROR: all nodata
  - `20210416T000000Z` ERROR: all nodata
  - `20210430T210000Z` ERROR: all nodata
- result: **PASS (coverage gap, all-nodata)**

### 2021-05
- window: `2021-05-01T00:00:00Z` → `2021-05-31T21:00:00Z`
- expected timesteps: 248
- subprocess rc=0 elapsed=92.3s
- raw=248 meta=248 missing=0 (first=[])
- distinct sha256 = 1/248, distinct sizes = 1
- metadata uses start/stop: True
- spot pixel sanity:
  - `20210501T000000Z` ERROR: all nodata
  - `20210516T120000Z` ERROR: all nodata
  - `20210531T210000Z` ERROR: all nodata
- result: **PASS (coverage gap, all-nodata)**

### 2021-06
- window: `2021-06-01T00:00:00Z` → `2021-06-30T21:00:00Z`
- expected timesteps: 240
- subprocess rc=0 elapsed=97.1s
- raw=240 meta=240 missing=0 (first=[])
- distinct sha256 = 1/240, distinct sizes = 1
- metadata uses start/stop: True
- spot pixel sanity:
  - `20210601T000000Z` ERROR: all nodata
  - `20210616T000000Z` ERROR: all nodata
  - `20210630T210000Z` ERROR: all nodata
- result: **PASS (coverage gap, all-nodata)**

### 2021-07
- window: `2021-07-01T00:00:00Z` → `2021-07-31T21:00:00Z`
- expected timesteps: 248
- subprocess rc=0 elapsed=93.4s
- raw=248 meta=248 missing=0 (first=[])
- distinct sha256 = 1/248, distinct sizes = 1
- metadata uses start/stop: True
- spot pixel sanity:
  - `20210701T000000Z` ERROR: all nodata
  - `20210716T120000Z` ERROR: all nodata
  - `20210731T210000Z` ERROR: all nodata
- result: **PASS (coverage gap, all-nodata)**

### 2021-08
- window: `2021-08-01T00:00:00Z` → `2021-08-31T21:00:00Z`
- expected timesteps: 248
- subprocess rc=0 elapsed=92.7s
- raw=248 meta=248 missing=0 (first=[])
- distinct sha256 = 1/248, distinct sizes = 1
- metadata uses start/stop: True
- spot pixel sanity:
  - `20210801T000000Z` ERROR: all nodata
  - `20210816T120000Z` ERROR: all nodata
  - `20210831T210000Z` ERROR: all nodata
- result: **PASS (coverage gap, all-nodata)**

### 2021-09
- window: `2021-09-01T00:00:00Z` → `2021-09-30T21:00:00Z`
- expected timesteps: 240
- subprocess rc=0 elapsed=88.9s
- raw=240 meta=240 missing=0 (first=[])
- distinct sha256 = 1/240, distinct sizes = 1
- metadata uses start/stop: True
- spot pixel sanity:
  - `20210901T000000Z` ERROR: all nodata
  - `20210916T000000Z` ERROR: all nodata
  - `20210930T210000Z` ERROR: all nodata
- result: **PASS (coverage gap, all-nodata)**

### 2021-10
- window: `2021-10-01T00:00:00Z` → `2021-10-31T21:00:00Z`
- expected timesteps: 248
- subprocess rc=0 elapsed=92.2s
- raw=248 meta=248 missing=0 (first=[])
- distinct sha256 = 1/248, distinct sizes = 1
- metadata uses start/stop: True
- spot pixel sanity:
  - `20211001T000000Z` ERROR: all nodata
  - `20211016T120000Z` ERROR: all nodata
  - `20211031T210000Z` ERROR: all nodata
- result: **PASS (coverage gap, all-nodata)**

### 2021-11
- window: `2021-11-01T00:00:00Z` → `2021-11-30T21:00:00Z`
- expected timesteps: 240
- subprocess rc=0 elapsed=90.4s
- raw=240 meta=240 missing=0 (first=[])
- distinct sha256 = 1/240, distinct sizes = 1
- metadata uses start/stop: True
- spot pixel sanity:
  - `20211101T000000Z` ERROR: all nodata
  - `20211116T000000Z` ERROR: all nodata
  - `20211130T210000Z` ERROR: all nodata
- result: **PASS (coverage gap, all-nodata)**

### 2021-12
- window: `2021-12-01T00:00:00Z` → `2021-12-31T21:00:00Z`
- expected timesteps: 248
- subprocess rc=0 elapsed=92.3s
- raw=248 meta=248 missing=0 (first=[])
- distinct sha256 = 1/248, distinct sizes = 1
- metadata uses start/stop: True
- spot pixel sanity:
  - `20211201T000000Z` ERROR: all nodata
  - `20211216T120000Z` ERROR: all nodata
  - `20211231T210000Z` ERROR: all nodata
- result: **PASS (coverage gap, all-nodata)**

### 2022-01
- window: `2022-01-01T00:00:00Z` → `2022-01-31T21:00:00Z`
- expected timesteps: 248
- subprocess rc=0 elapsed=91.0s
- raw=248 meta=248 missing=0 (first=[])
- distinct sha256 = 1/248, distinct sizes = 1
- metadata uses start/stop: True
- spot pixel sanity:
  - `20220101T000000Z` ERROR: all nodata
  - `20220116T120000Z` ERROR: all nodata
  - `20220131T210000Z` ERROR: all nodata
- result: **PASS (coverage gap, all-nodata)**

### 2022-02
- window: `2022-02-01T00:00:00Z` → `2022-02-28T21:00:00Z`
- expected timesteps: 224
- subprocess rc=0 elapsed=82.4s
- raw=224 meta=224 missing=0 (first=[])
- distinct sha256 = 1/224, distinct sizes = 1
- metadata uses start/stop: True
- spot pixel sanity:
  - `20220201T000000Z` ERROR: all nodata
  - `20220215T000000Z` ERROR: all nodata
  - `20220228T210000Z` ERROR: all nodata
- result: **PASS (coverage gap, all-nodata)**

### 2022-03
- window: `2022-03-01T00:00:00Z` → `2022-03-31T21:00:00Z`
- expected timesteps: 248
- subprocess rc=0 elapsed=93.5s
- raw=248 meta=248 missing=0 (first=[])
- distinct sha256 = 1/248, distinct sizes = 1
- metadata uses start/stop: True
- spot pixel sanity:
  - `20220301T000000Z` ERROR: all nodata
  - `20220316T120000Z` ERROR: all nodata
  - `20220331T210000Z` ERROR: all nodata
- result: **PASS (coverage gap, all-nodata)**

### 2022-04
- window: `2022-04-01T00:00:00Z` → `2022-04-30T21:00:00Z`
- expected timesteps: 240
- subprocess rc=0 elapsed=88.3s
- raw=240 meta=240 missing=0 (first=[])
- distinct sha256 = 1/240, distinct sizes = 1
- metadata uses start/stop: True
- spot pixel sanity:
  - `20220401T000000Z` ERROR: all nodata
  - `20220416T000000Z` ERROR: all nodata
  - `20220430T210000Z` ERROR: all nodata
- result: **PASS (coverage gap, all-nodata)**

### 2022-05
- window: `2022-05-01T00:00:00Z` → `2022-05-31T21:00:00Z`
- expected timesteps: 248
- subprocess rc=0 elapsed=94.6s
- raw=248 meta=248 missing=0 (first=[])
- distinct sha256 = 65/248, distinct sizes = 63
- metadata uses start/stop: True
- spot pixel sanity:
  - `20220501T000000Z` ERROR: all nodata
  - `20220516T120000Z`  min=0.000 max=0.000 mean=0.000  size=[256, 256]  valid=65536/65536
  - `20220531T210000Z`  min=0.000 max=0.000 mean=0.000  size=[256, 256]  valid=65536/65536
- result: **PASS**

### 2022-06
- window: `2022-06-01T00:00:00Z` → `2022-06-30T21:00:00Z`
- expected timesteps: 240
- subprocess rc=0 elapsed=93.1s
- raw=240 meta=240 missing=0 (first=[])
- distinct sha256 = 10/240, distinct sizes = 10
- metadata uses start/stop: True
- spot pixel sanity:
  - `20220601T000000Z`  min=0.000 max=0.000 mean=0.000  size=[256, 256]  valid=65536/65536
  - `20220616T000000Z`  min=0.000 max=0.000 mean=0.000  size=[256, 256]  valid=65536/65536
  - `20220630T210000Z`  min=0.020 max=0.430 mean=0.178  size=[256, 256]  valid=65536/65536
- result: **PASS**

### 2022-07
- window: `2022-07-01T00:00:00Z` → `2022-07-31T21:00:00Z`
- expected timesteps: 248
- subprocess rc=0 elapsed=93.8s
- raw=248 meta=248 missing=0 (first=[])
- distinct sha256 = 99/248, distinct sizes = 93
- metadata uses start/stop: True
- spot pixel sanity:
  - `20220701T000000Z`  min=0.000 max=1.440 mean=0.760  size=[256, 256]  valid=65536/65536
  - `20220716T120000Z`  min=0.000 max=0.000 mean=0.000  size=[256, 256]  valid=65536/65536
  - `20220731T210000Z`  min=0.000 max=0.000 mean=0.000  size=[256, 256]  valid=65536/65536
- result: **PASS**

### 2022-08
- window: `2022-08-01T00:00:00Z` → `2022-08-31T21:00:00Z`
- expected timesteps: 248
- subprocess rc=0 elapsed=93.1s
- raw=248 meta=248 missing=0 (first=[])
- distinct sha256 = 2/248, distinct sizes = 2
- metadata uses start/stop: True
- spot pixel sanity:
  - `20220801T000000Z`  min=0.000 max=0.000 mean=0.000  size=[256, 256]  valid=65536/65536
  - `20220816T120000Z` ERROR: all nodata
  - `20220831T210000Z`  min=0.000 max=0.000 mean=0.000  size=[256, 256]  valid=65536/65536
- result: **PASS**

### 2022-09
- window: `2022-09-01T00:00:00Z` → `2022-09-30T21:00:00Z`
- expected timesteps: 240
- subprocess rc=0 elapsed=91.6s
- raw=240 meta=240 missing=0 (first=[])
- distinct sha256 = 52/240, distinct sizes = 50
- metadata uses start/stop: True
- spot pixel sanity:
  - `20220901T000000Z`  min=0.000 max=0.000 mean=0.000  size=[256, 256]  valid=65536/65536
  - `20220916T000000Z`  min=0.000 max=0.000 mean=0.000  size=[256, 256]  valid=65536/65536
  - `20220930T210000Z`  min=0.000 max=0.000 mean=0.000  size=[256, 256]  valid=65536/65536
- result: **PASS**

### 2022-10
- window: `2022-10-01T00:00:00Z` → `2022-10-31T21:00:00Z`
- expected timesteps: 248
- subprocess rc=0 elapsed=95.0s
- raw=248 meta=248 missing=0 (first=[])
- distinct sha256 = 175/248, distinct sizes = 159
- metadata uses start/stop: True
- spot pixel sanity:
  - `20221001T000000Z`  min=0.000 max=0.000 mean=0.000  size=[256, 256]  valid=65536/65536
  - `20221016T120000Z`  min=1.600 max=2.780 mean=2.130  size=[256, 256]  valid=65536/65536
  - `20221031T210000Z`  min=0.000 max=0.110 mean=0.018  size=[256, 256]  valid=65536/65536
- result: **PASS**

### 2022-11
- window: `2022-11-01T00:00:00Z` → `2022-11-30T21:00:00Z`
- expected timesteps: 240
- subprocess rc=0 elapsed=92.3s
- raw=240 meta=240 missing=0 (first=[])
- distinct sha256 = 149/240, distinct sizes = 143
- metadata uses start/stop: True
- spot pixel sanity:
  - `20221101T000000Z`  min=0.000 max=0.000 mean=0.000  size=[256, 256]  valid=65536/65536
  - `20221116T000000Z`  min=0.140 max=0.380 mean=0.270  size=[256, 256]  valid=65536/65536
  - `20221130T210000Z`  min=0.090 max=0.370 mean=0.239  size=[256, 256]  valid=65536/65536
- result: **PASS**

### 2022-12
- window: `2022-12-01T00:00:00Z` → `2022-12-31T21:00:00Z`
- expected timesteps: 248
- subprocess rc=0 elapsed=96.1s
- raw=248 meta=248 missing=0 (first=[])
- distinct sha256 = 192/248, distinct sizes = 178
- metadata uses start/stop: True
- spot pixel sanity:
  - `20221201T000000Z`  min=0.090 max=0.360 mean=0.229  size=[256, 256]  valid=65536/65536
  - `20221216T120000Z`  min=0.000 max=0.160 mean=0.065  size=[256, 256]  valid=65536/65536
  - `20221231T210000Z`  min=0.130 max=0.250 mean=0.190  size=[256, 256]  valid=65536/65536
- result: **PASS**

### 2023-01
- window: `2023-01-01T00:00:00Z` → `2023-01-31T21:00:00Z`
- expected timesteps: 248
- subprocess rc=0 elapsed=94.9s
- raw=248 meta=248 missing=0 (first=[])
- distinct sha256 = 202/248, distinct sizes = 188
- metadata uses start/stop: True
- spot pixel sanity:
  - `20230101T000000Z`  min=0.070 max=0.170 mean=0.124  size=[256, 256]  valid=65536/65536
  - `20230116T120000Z`  min=0.010 max=0.020 mean=0.019  size=[256, 256]  valid=65536/65536
  - `20230131T210000Z`  min=0.030 max=0.060 mean=0.033  size=[256, 256]  valid=65536/65536
- result: **PASS**

### 2023-02
- window: `2023-02-01T00:00:00Z` → `2023-02-28T21:00:00Z`
- expected timesteps: 224
- subprocess rc=0 elapsed=85.9s
- raw=224 meta=224 missing=0 (first=[])
- distinct sha256 = 155/224, distinct sizes = 150
- metadata uses start/stop: True
- spot pixel sanity:
  - `20230201T000000Z`  min=0.020 max=0.040 mean=0.033  size=[256, 256]  valid=65536/65536
  - `20230215T000000Z`  min=0.030 max=0.060 mean=0.046  size=[256, 256]  valid=65536/65536
  - `20230228T210000Z`  min=0.040 max=0.060 mean=0.046  size=[256, 256]  valid=65536/65536
- result: **PASS**

### 2023-03
- window: `2023-03-01T00:00:00Z` → `2023-03-31T21:00:00Z`
- expected timesteps: 248
- subprocess rc=0 elapsed=94.8s
- raw=248 meta=248 missing=0 (first=[])
- distinct sha256 = 182/248, distinct sizes = 169
- metadata uses start/stop: True
- spot pixel sanity:
  - `20230301T000000Z`  min=0.040 max=0.060 mean=0.051  size=[256, 256]  valid=65536/65536
  - `20230316T120000Z`  min=0.000 max=0.010 mean=0.003  size=[256, 256]  valid=65536/65536
  - `20230331T210000Z`  min=0.220 max=1.070 mean=0.569  size=[256, 256]  valid=65536/65536
- result: **PASS**

### 2023-04
- window: `2023-04-01T00:00:00Z` → `2023-04-30T21:00:00Z`
- expected timesteps: 240
- subprocess rc=0 elapsed=91.2s
- raw=240 meta=240 missing=0 (first=[])
- distinct sha256 = 212/240, distinct sizes = 193
- metadata uses start/stop: True
- spot pixel sanity:
  - `20230401T000000Z`  min=0.630 max=1.950 mean=1.201  size=[256, 256]  valid=65536/65536
  - `20230416T000000Z`  min=0.010 max=0.020 mean=0.011  size=[256, 256]  valid=65536/65536
  - `20230430T210000Z`  min=0.030 max=0.090 mean=0.048  size=[256, 256]  valid=65536/65536
- result: **PASS**

### 2023-05
- window: `2023-05-01T00:00:00Z` → `2023-05-31T21:00:00Z`
- expected timesteps: 248
- subprocess rc=0 elapsed=94.7s
- raw=248 meta=248 missing=0 (first=[])
- distinct sha256 = 159/248, distinct sizes = 141
- metadata uses start/stop: True
- spot pixel sanity:
  - `20230501T000000Z`  min=0.030 max=0.050 mean=0.042  size=[256, 256]  valid=65536/65536
  - `20230516T120000Z`  min=0.160 max=2.420 mean=0.848  size=[256, 256]  valid=65536/65536
  - `20230531T210000Z`  min=0.770 max=1.040 mean=0.929  size=[256, 256]  valid=65536/65536
- result: **PASS**

### 2023-06
- window: `2023-06-01T00:00:00Z` → `2023-06-30T21:00:00Z`
- expected timesteps: 240
- subprocess rc=0 elapsed=91.0s
- raw=240 meta=240 missing=0 (first=[])
- distinct sha256 = 121/240, distinct sizes = 119
- metadata uses start/stop: True
- spot pixel sanity:
  - `20230601T000000Z`  min=0.040 max=0.200 mean=0.137  size=[256, 256]  valid=65536/65536
  - `20230616T000000Z`  min=0.000 max=0.000 mean=0.000  size=[256, 256]  valid=65536/65536
  - `20230630T210000Z`  min=0.000 max=0.000 mean=0.000  size=[256, 256]  valid=65536/65536
- result: **PASS**

### 2023-07
- window: `2023-07-01T00:00:00Z` → `2023-07-31T21:00:00Z`
- expected timesteps: 248
- subprocess rc=0 elapsed=94.2s
- raw=248 meta=248 missing=0 (first=[])
- distinct sha256 = 105/248, distinct sizes = 104
- metadata uses start/stop: True
- spot pixel sanity:
  - `20230701T000000Z`  min=0.000 max=0.000 mean=0.000  size=[256, 256]  valid=65536/65536
  - `20230716T120000Z`  min=0.230 max=0.380 mean=0.313  size=[256, 256]  valid=65536/65536
  - `20230731T210000Z`  min=0.000 max=0.000 mean=0.000  size=[256, 256]  valid=65536/65536
- result: **PASS**

### 2023-08
- window: `2023-08-01T00:00:00Z` → `2023-08-31T21:00:00Z`
- expected timesteps: 248
- subprocess rc=0 elapsed=94.7s
- raw=248 meta=248 missing=0 (first=[])
- distinct sha256 = 177/248, distinct sizes = 163
- metadata uses start/stop: True
- spot pixel sanity:
  - `20230801T000000Z`  min=0.000 max=0.010 mean=0.009  size=[256, 256]  valid=65536/65536
  - `20230816T120000Z`  min=0.040 max=0.130 mean=0.061  size=[256, 256]  valid=65536/65536
  - `20230831T210000Z`  min=0.020 max=0.260 mean=0.099  size=[256, 256]  valid=65536/65536
- result: **PASS**

### 2023-09
- window: `2023-09-01T00:00:00Z` → `2023-09-30T21:00:00Z`
- expected timesteps: 240
- subprocess rc=0 elapsed=91.9s
- raw=240 meta=240 missing=0 (first=[])
- distinct sha256 = 94/240, distinct sizes = 90
- metadata uses start/stop: True
- spot pixel sanity:
  - `20230901T000000Z`  min=0.020 max=0.080 mean=0.038  size=[256, 256]  valid=65536/65536
  - `20230916T000000Z`  min=0.000 max=0.000 mean=0.000  size=[256, 256]  valid=65536/65536
  - `20230930T210000Z`  min=0.010 max=0.020 mean=0.011  size=[256, 256]  valid=65536/65536
- result: **PASS**

### 2023-10
- window: `2023-10-01T00:00:00Z` → `2023-10-31T21:00:00Z`
- expected timesteps: 248
- subprocess rc=0 elapsed=97.4s
- raw=248 meta=248 missing=0 (first=[])
- distinct sha256 = 123/248, distinct sizes = 118
- metadata uses start/stop: True
- spot pixel sanity:
  - `20231001T000000Z`  min=0.010 max=0.020 mean=0.011  size=[256, 256]  valid=65536/65536
  - `20231016T120000Z`  min=0.010 max=0.050 mean=0.011  size=[256, 256]  valid=65536/65536
  - `20231031T210000Z`  min=0.060 max=0.090 mean=0.084  size=[256, 256]  valid=65536/65536
- result: **PASS**

### 2023-11
- window: `2023-11-01T00:00:00Z` → `2023-11-30T21:00:00Z`
- expected timesteps: 240
- subprocess rc=0 elapsed=93.7s
- raw=240 meta=240 missing=0 (first=[])
- distinct sha256 = 201/240, distinct sizes = 187
- metadata uses start/stop: True
- spot pixel sanity:
  - `20231101T000000Z`  min=0.040 max=0.080 mean=0.065  size=[256, 256]  valid=65536/65536
  - `20231116T000000Z`  min=0.050 max=0.140 mean=0.089  size=[256, 256]  valid=65536/65536
  - `20231130T210000Z`  min=0.030 max=0.040 mean=0.040  size=[256, 256]  valid=65536/65536
- result: **PASS**

### 2023-12
- window: `2023-12-01T00:00:00Z` → `2023-12-31T21:00:00Z`
- expected timesteps: 248
- subprocess rc=0 elapsed=96.4s
- raw=248 meta=248 missing=0 (first=[])
- distinct sha256 = 203/248, distinct sizes = 196
- metadata uses start/stop: True
- spot pixel sanity:
  - `20231201T000000Z`  min=0.060 max=0.120 mean=0.101  size=[256, 256]  valid=65536/65536
  - `20231216T120000Z`  min=0.010 max=0.010 mean=0.010  size=[256, 256]  valid=65536/65536
  - `20231231T210000Z`  min=0.120 max=0.260 mean=0.200  size=[256, 256]  valid=65536/65536
- result: **PASS**

### 2024-01
- window: `2024-01-01T00:00:00Z` → `2024-01-31T21:00:00Z`
- expected timesteps: 248
- already complete -> **SKIP** (PASS)

### 2024-02
- window: `2024-02-01T00:00:00Z` → `2024-02-29T21:00:00Z`
- expected timesteps: 232
- already complete -> **SKIP** (PASS)

### 2024-03
- window: `2024-03-01T00:00:00Z` → `2024-03-31T21:00:00Z`
- expected timesteps: 248
- subprocess rc=0 elapsed=97.1s
- raw=248 meta=248 missing=0 (first=[])
- distinct sha256 = 175/248, distinct sizes = 167
- metadata uses start/stop: True
- spot pixel sanity:
  - `20240301T000000Z`  min=0.090 max=0.150 mean=0.125  size=[256, 256]  valid=65536/65536
  - `20240316T120000Z`  min=0.140 max=0.310 mean=0.218  size=[256, 256]  valid=65536/65536
  - `20240331T210000Z`  min=0.000 max=0.000 mean=0.000  size=[256, 256]  valid=65536/65536
- result: **PASS**

### 2024-04
- window: `2024-04-01T00:00:00Z` → `2024-04-30T21:00:00Z`
- expected timesteps: 240
- subprocess rc=0 elapsed=90.0s
- raw=240 meta=240 missing=0 (first=[])
- distinct sha256 = 203/240, distinct sizes = 194
- metadata uses start/stop: True
- spot pixel sanity:
  - `20240401T000000Z`  min=0.000 max=0.000 mean=0.000  size=[256, 256]  valid=65536/65536
  - `20240416T000000Z`  min=0.000 max=0.010 mean=0.008  size=[256, 256]  valid=65536/65536
  - `20240430T210000Z`  min=0.440 max=1.830 mean=0.944  size=[256, 256]  valid=65536/65536
- result: **PASS**

### 2024-05
- window: `2024-05-01T00:00:00Z` → `2024-05-31T21:00:00Z`
- expected timesteps: 248
- subprocess rc=0 elapsed=93.8s
- raw=248 meta=248 missing=0 (first=[])
- distinct sha256 = 196/248, distinct sizes = 172
- metadata uses start/stop: True
- spot pixel sanity:
  - `20240501T000000Z`  min=0.430 max=1.230 mean=0.786  size=[256, 256]  valid=65536/65536
  - `20240516T120000Z`  min=0.000 max=0.010 mean=0.003  size=[256, 256]  valid=65536/65536
  - `20240531T210000Z`  min=0.620 max=1.540 mean=0.950  size=[256, 256]  valid=65536/65536
- result: **PASS**

### 2024-06
- window: `2024-06-01T00:00:00Z` → `2024-06-30T21:00:00Z`
- expected timesteps: 240
- subprocess rc=0 elapsed=98.2s
- raw=240 meta=240 missing=0 (first=[])
- distinct sha256 = 180/240, distinct sizes = 166
- metadata uses start/stop: True
- spot pixel sanity:
  - `20240601T000000Z`  min=1.950 max=5.330 mean=3.437  size=[256, 256]  valid=65536/65536
  - `20240616T000000Z`  min=0.000 max=0.020 mean=0.005  size=[256, 256]  valid=65536/65536
  - `20240630T210000Z`  min=0.030 max=0.790 mean=0.187  size=[256, 256]  valid=65536/65536
- result: **PASS**

### 2024-07
- window: `2024-07-01T00:00:00Z` → `2024-07-31T21:00:00Z`
- expected timesteps: 248
- subprocess rc=0 elapsed=110.1s
- raw=248 meta=248 missing=0 (first=[])
- distinct sha256 = 199/248, distinct sizes = 171
- metadata uses start/stop: True
- spot pixel sanity:
  - `20240701T000000Z`  min=0.110 max=0.960 mean=0.394  size=[256, 256]  valid=65536/65536
  - `20240716T120000Z`  min=0.100 max=0.240 mean=0.142  size=[256, 256]  valid=65536/65536
  - `20240731T210000Z`  min=0.070 max=0.900 mean=0.335  size=[256, 256]  valid=65536/65536
- result: **PASS**

### 2024-08
- window: `2024-08-01T00:00:00Z` → `2024-08-31T21:00:00Z`
- expected timesteps: 248
- subprocess rc=0 elapsed=92.8s
- raw=248 meta=248 missing=0 (first=[])
- distinct sha256 = 91/248, distinct sizes = 82
- metadata uses start/stop: True
- spot pixel sanity:
  - `20240801T000000Z`  min=0.200 max=0.750 mean=0.411  size=[256, 256]  valid=65536/65536
  - `20240816T120000Z` ERROR: all nodata
  - `20240831T210000Z` ERROR: all nodata
- result: **PASS**

### 2024-09
- window: `2024-09-01T00:00:00Z` → `2024-09-30T21:00:00Z`
- expected timesteps: 240
- subprocess rc=0 elapsed=88.8s
- raw=240 meta=240 missing=0 (first=[])
- distinct sha256 = 1/240, distinct sizes = 1
- metadata uses start/stop: True
- spot pixel sanity:
  - `20240901T000000Z` ERROR: all nodata
  - `20240916T000000Z` ERROR: all nodata
  - `20240930T210000Z` ERROR: all nodata
- result: **PASS (coverage gap, all-nodata)**

### 2024-10
- window: `2024-10-01T00:00:00Z` → `2024-10-31T21:00:00Z`
- expected timesteps: 248
- subprocess rc=0 elapsed=91.1s
- raw=248 meta=248 missing=0 (first=[])
- distinct sha256 = 1/248, distinct sizes = 1
- metadata uses start/stop: True
- spot pixel sanity:
  - `20241001T000000Z` ERROR: all nodata
  - `20241016T120000Z` ERROR: all nodata
  - `20241031T210000Z` ERROR: all nodata
- result: **PASS (coverage gap, all-nodata)**

### 2024-11
- window: `2024-11-01T00:00:00Z` → `2024-11-30T21:00:00Z`
- expected timesteps: 240
- subprocess rc=0 elapsed=89.4s
- raw=240 meta=240 missing=0 (first=[])
- distinct sha256 = 77/240, distinct sizes = 74
- metadata uses start/stop: True
- spot pixel sanity:
  - `20241101T000000Z` ERROR: all nodata
  - `20241116T000000Z` ERROR: all nodata
  - `20241130T210000Z`  min=0.420 max=0.530 mean=0.489  size=[256, 256]  valid=65536/65536
- result: **PASS**

### 2024-12
- window: `2024-12-01T00:00:00Z` → `2024-12-31T21:00:00Z`
- expected timesteps: 248
- subprocess rc=0 elapsed=91.8s
- raw=248 meta=248 missing=0 (first=[])
- distinct sha256 = 73/248, distinct sizes = 71
- metadata uses start/stop: True
- spot pixel sanity:
  - `20241201T000000Z`  min=0.270 max=0.900 mean=0.558  size=[256, 256]  valid=65536/65536
  - `20241216T120000Z` ERROR: all nodata
  - `20241231T210000Z` ERROR: all nodata
- result: **PASS**

### 2025-01
- window: `2025-01-01T00:00:00Z` → `2025-01-31T21:00:00Z`
- expected timesteps: 248
- subprocess rc=0 elapsed=93.4s
- raw=248 meta=248 missing=0 (first=[])
- distinct sha256 = 194/248, distinct sizes = 174
- metadata uses start/stop: True
- spot pixel sanity:
  - `20250101T000000Z` ERROR: all nodata
  - `20250116T120000Z`  min=1.000 max=2.730 mean=1.662  size=[256, 256]  valid=65536/65536
  - `20250131T210000Z`  min=0.020 max=0.140 mean=0.107  size=[256, 256]  valid=65536/65536
- result: **PASS**

### 2025-02
- window: `2025-02-01T00:00:00Z` → `2025-02-28T21:00:00Z`
- expected timesteps: 224
- subprocess rc=0 elapsed=84.6s
- raw=224 meta=224 missing=0 (first=[])
- distinct sha256 = 217/224, distinct sizes = 195
- metadata uses start/stop: True
- spot pixel sanity:
  - `20250201T000000Z`  min=0.020 max=0.160 mean=0.115  size=[256, 256]  valid=65536/65536
  - `20250215T000000Z`  min=0.030 max=0.110 mean=0.080  size=[256, 256]  valid=65536/65536
  - `20250228T210000Z`  min=0.060 max=0.120 mean=0.087  size=[256, 256]  valid=65536/65536
- result: **PASS**

### 2025-03
- window: `2025-03-01T00:00:00Z` → `2025-03-31T21:00:00Z`
- expected timesteps: 248
- subprocess rc=0 elapsed=101.4s
- raw=248 meta=248 missing=0 (first=[])
- distinct sha256 = 235/248, distinct sizes = 201
- metadata uses start/stop: True
- spot pixel sanity:
  - `20250301T000000Z`  min=0.040 max=0.050 mean=0.046  size=[256, 256]  valid=65536/65536
  - `20250316T120000Z`  min=0.100 max=0.180 mean=0.146  size=[256, 256]  valid=65536/65536
  - `20250331T210000Z`  min=0.030 max=1.490 mean=0.318  size=[256, 256]  valid=65536/65536
- result: **PASS**

### 2025-04
- window: `2025-04-01T00:00:00Z` → `2025-04-30T21:00:00Z`
- expected timesteps: 240
- subprocess rc=0 elapsed=93.6s
- raw=240 meta=240 missing=0 (first=[])
- distinct sha256 = 234/240, distinct sizes = 209
- metadata uses start/stop: True
- spot pixel sanity:
  - `20250401T000000Z`  min=0.090 max=0.880 mean=0.205  size=[256, 256]  valid=65536/65536
  - `20250416T000000Z`  min=0.090 max=0.190 mean=0.142  size=[256, 256]  valid=65536/65536
  - `20250430T210000Z`  min=0.230 max=2.370 mean=1.133  size=[256, 256]  valid=65536/65536
- result: **PASS**

### 2025-05
- window: `2025-05-01T00:00:00Z` → `2025-05-31T21:00:00Z`
- expected timesteps: 248
- subprocess rc=0 elapsed=95.3s
- raw=248 meta=248 missing=0 (first=[])
- distinct sha256 = 237/248, distinct sizes = 203
- metadata uses start/stop: True
- spot pixel sanity:
  - `20250501T000000Z`  min=0.690 max=2.420 mean=1.418  size=[256, 256]  valid=65536/65536
  - `20250516T120000Z`  min=0.110 max=0.390 mean=0.179  size=[256, 256]  valid=65536/65536
  - `20250531T210000Z`  min=0.010 max=0.030 mean=0.020  size=[256, 256]  valid=65536/65536
- result: **PASS**

### 2025-06
- window: `2025-06-01T00:00:00Z` → `2025-06-30T21:00:00Z`
- expected timesteps: 240
- subprocess rc=0 elapsed=93.2s
- raw=240 meta=240 missing=0 (first=[])
- distinct sha256 = 185/240, distinct sizes = 170
- metadata uses start/stop: True
- spot pixel sanity:
  - `20250601T000000Z`  min=0.010 max=0.050 mean=0.023  size=[256, 256]  valid=65536/65536
  - `20250616T000000Z`  min=0.010 max=0.010 mean=0.010  size=[256, 256]  valid=65536/65536
  - `20250630T210000Z`  min=6.620 max=11.810 mean=9.156  size=[256, 256]  valid=65536/65536
- result: **PASS**

### 2025-07
- window: `2025-07-01T00:00:00Z` → `2025-07-31T21:00:00Z`
- expected timesteps: 248
- subprocess rc=0 elapsed=92.6s
- raw=248 meta=248 missing=0 (first=[])
- distinct sha256 = 186/248, distinct sizes = 174
- metadata uses start/stop: True
- spot pixel sanity:
  - `20250701T000000Z`  min=11.220 max=14.900 mean=13.730  size=[256, 256]  valid=65536/65536
  - `20250716T120000Z`  min=0.020 max=0.020 mean=0.020  size=[256, 256]  valid=65536/65536
  - `20250731T210000Z`  min=1.390 max=4.570 mean=2.542  size=[256, 256]  valid=65536/65536
- result: **PASS**

### 2025-08
- window: `2025-08-01T00:00:00Z` → `2025-08-31T21:00:00Z`
- expected timesteps: 248
- subprocess rc=0 elapsed=94.3s
- raw=248 meta=248 missing=0 (first=[])
- distinct sha256 = 227/248, distinct sizes = 198
- metadata uses start/stop: True
- spot pixel sanity:
  - `20250801T000000Z`  min=2.720 max=4.140 mean=3.394  size=[256, 256]  valid=65536/65536
  - `20250816T120000Z`  min=0.030 max=0.210 mean=0.053  size=[256, 256]  valid=65536/65536
  - `20250831T210000Z`  min=0.010 max=0.010 mean=0.010  size=[256, 256]  valid=65536/65536
- result: **PASS**

### 2025-09
- window: `2025-09-01T00:00:00Z` → `2025-09-30T21:00:00Z`
- expected timesteps: 240
- subprocess rc=0 elapsed=91.2s
- raw=240 meta=240 missing=0 (first=[])
- distinct sha256 = 205/240, distinct sizes = 194
- metadata uses start/stop: True
- spot pixel sanity:
  - `20250901T000000Z`  min=0.010 max=0.010 mean=0.010  size=[256, 256]  valid=65536/65536
  - `20250916T000000Z`  min=0.010 max=0.020 mean=0.016  size=[256, 256]  valid=65536/65536
  - `20250930T210000Z`  min=0.020 max=0.040 mean=0.024  size=[256, 256]  valid=65536/65536
- result: **PASS**

### 2025-10
- window: `2025-10-01T00:00:00Z` → `2025-10-31T21:00:00Z`
- expected timesteps: 248
- subprocess rc=0 elapsed=95.7s
- raw=248 meta=248 missing=0 (first=[])
- distinct sha256 = 220/248, distinct sizes = 201
- metadata uses start/stop: True
- spot pixel sanity:
  - `20251001T000000Z`  min=0.010 max=0.080 mean=0.023  size=[256, 256]  valid=65536/65536
  - `20251016T120000Z`  min=0.030 max=0.050 mean=0.042  size=[256, 256]  valid=65536/65536
  - `20251031T210000Z`  min=0.570 max=1.070 mean=0.736  size=[256, 256]  valid=65536/65536
- result: **PASS**

### 2025-11
- window: `2025-11-01T00:00:00Z` → `2025-11-30T21:00:00Z`
- expected timesteps: 240
- subprocess rc=0 elapsed=91.0s
- raw=240 meta=240 missing=0 (first=[])
- distinct sha256 = 216/240, distinct sizes = 201
- metadata uses start/stop: True
- spot pixel sanity:
  - `20251101T000000Z`  min=0.620 max=2.040 mean=1.309  size=[256, 256]  valid=65536/65536
  - `20251116T000000Z`  min=0.050 max=0.080 mean=0.060  size=[256, 256]  valid=65536/65536
  - `20251130T210000Z`  min=0.010 max=0.010 mean=0.010  size=[256, 256]  valid=65536/65536
- result: **PASS**

### 2025-12
- window: `2025-12-01T00:00:00Z` → `2025-12-31T21:00:00Z`
- expected timesteps: 248
- subprocess rc=0 elapsed=95.5s
- raw=248 meta=248 missing=0 (first=[])
- distinct sha256 = 227/248, distinct sizes = 207
- metadata uses start/stop: True
- spot pixel sanity:
  - `20251201T000000Z`  min=0.010 max=0.020 mean=0.011  size=[256, 256]  valid=65536/65536
  - `20251216T120000Z`  min=0.020 max=0.070 mean=0.042  size=[256, 256]  valid=65536/65536
  - `20251231T210000Z`  min=1.020 max=1.480 mean=1.304  size=[256, 256]  valid=65536/65536
- result: **PASS**

### 2026-01
- window: `2026-01-01T00:00:00Z` → `2026-01-31T21:00:00Z`
- expected timesteps: 248
- subprocess rc=0 elapsed=94.1s
- raw=248 meta=248 missing=0 (first=[])
- distinct sha256 = 237/248, distinct sizes = 220
- metadata uses start/stop: True
- spot pixel sanity:
  - `20260101T000000Z`  min=0.200 max=0.660 mean=0.356  size=[256, 256]  valid=65536/65536
  - `20260116T120000Z`  min=1.560 max=2.780 mean=2.130  size=[256, 256]  valid=65536/65536
  - `20260131T210000Z`  min=0.110 max=0.160 mean=0.135  size=[256, 256]  valid=65536/65536
- result: **PASS**

### 2026-02
- window: `2026-02-01T00:00:00Z` → `2026-02-28T21:00:00Z`
- expected timesteps: 224
- subprocess rc=0 elapsed=84.7s
- raw=224 meta=224 missing=0 (first=[])
- distinct sha256 = 224/224, distinct sizes = 199
- metadata uses start/stop: True
- spot pixel sanity:
  - `20260201T000000Z`  min=0.220 max=0.500 mean=0.329  size=[256, 256]  valid=65536/65536
  - `20260215T000000Z`  min=0.510 max=0.710 mean=0.620  size=[256, 256]  valid=65536/65536
  - `20260228T210000Z`  min=0.200 max=0.530 mean=0.386  size=[256, 256]  valid=65536/65536
- result: **PASS**

### 2026-03
- window: `2026-03-01T00:00:00Z` → `2026-03-31T21:00:00Z`
- expected timesteps: 248
- subprocess rc=0 elapsed=94.6s
- raw=248 meta=248 missing=0 (first=[])
- distinct sha256 = 242/248, distinct sizes = 224
- metadata uses start/stop: True
- spot pixel sanity:
  - `20260301T000000Z`  min=0.080 max=0.510 mean=0.272  size=[256, 256]  valid=65536/65536
  - `20260316T120000Z`  min=0.010 max=0.040 mean=0.018  size=[256, 256]  valid=65536/65536
  - `20260331T210000Z`  min=0.000 max=0.030 mean=0.017  size=[256, 256]  valid=65536/65536
- result: **PASS**

### 2026-04
- window: `2026-04-01T00:00:00Z` → `2026-04-30T21:00:00Z`
- expected timesteps: 240
- subprocess rc=0 elapsed=91.1s
- raw=240 meta=240 missing=0 (first=[])
- distinct sha256 = 208/240, distinct sizes = 194
- metadata uses start/stop: True
- spot pixel sanity:
  - `20260401T000000Z`  min=0.000 max=0.010 mean=0.010  size=[256, 256]  valid=65536/65536
  - `20260416T000000Z`  min=0.000 max=0.040 mean=0.013  size=[256, 256]  valid=65536/65536
  - `20260430T210000Z`  min=0.040 max=0.220 mean=0.092  size=[256, 256]  valid=65536/65536
- result: **PASS**

### 2026-05
- window: `2026-05-01T00:00:00Z` → `2026-05-10T12:00:00Z`
- expected timesteps: 77
- subprocess rc=0 elapsed=31.5s
- raw=77 meta=77 missing=0 (first=[])
- distinct sha256 = 76/77, distinct sizes = 74
- metadata uses start/stop: True
- spot pixel sanity:
  - `20260501T000000Z`  min=0.070 max=0.190 mean=0.138  size=[256, 256]  valid=65536/65536
  - `20260505T180000Z`  min=0.010 max=0.060 mean=0.026  size=[256, 256]  valid=65536/65536
  - `20260510T120000Z`  min=0.090 max=0.460 mean=0.258  size=[256, 256]  valid=65536/65536
- result: **PASS**

## Run complete 2026-05-03T15:53:29.972099+00:00
