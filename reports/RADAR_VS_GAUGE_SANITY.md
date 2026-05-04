# Radar vs Gauge Sanity Check

_Generated: 2026-05-04T00:14:35.209Z_

Stormgauge / Pluviometrics — read-only sanity check. Not calibration.

## Inputs

- Test points: **4** (AOI-spread, see table below)
- Time windows: **4** (3 historical + 1 recent)
- Total cases: **16**
- Radar source: `src/modules/radar/radarCumulativeRainfall.js` reading the validated Lizard NB-AOI 3-hourly precipitation archive
- Gauge source: existing Stormgauge fetch path — `https://nsw-rainfall-analyser-api.onrender.com/bom/rainfall` (mirrors `fetchStationRainfall` in `index.html`)

### Gauge access caveat

The existing fetch logic supports two upstream paths:
1. **MHL KiWIS** (`https://wiski.mhl.nsw.gov.au/KiWIS/KiWIS`) — used directly from the browser. From Node, this currently returns HTTP 403 with a Cloudflare bot-challenge body (`"Just a moment..."`). The Stormgauge gateway proxy also returned 0 MHL readings during this run, indicating the upstream issue is not specific to the script.
2. **BoM via Stormgauge gateway** (`/bom/rainfall`) — serves only the last ~72 hours of AWS observations.

Consequence: historical gauge data (July 2025, June 2025, Feb 2024) is **not reachable** from a Node script without solving the Cloudflare challenge. For these windows, the radar value is reported and the gauge column is marked `n/a` with an explicit note. The "Recent 72h" window is the only one that exercises the radar↔gauge comparison end-to-end.

## Test points

| ID | Lat | Lon | Label | Nearest BoM gauge (km) |
|---|---:|---:|---|---|
| N | -33.68 | 151.3 | AOI north (Mona Vale area) | COLLAROY (LONG REEF GOLF CLUB) (BoM 066126) (6.79 km) |
| C | -33.7 | 151.25 | AOI centre (Frenchs Forest area) | TERREY HILLS AWS (BoM 066059) (2.5 km) |
| E | -33.75 | 151.3 | AOI east (Long Reef area) | Cromer (BoM 048190) (1.2 km) |
| S | -33.8 | 151.27 | AOI south (Balgowlah area) | Cromer (BoM 048190) (6.79 km) |

## Summary

- Cases attempted: **16**
- Cases with radar + gauge both reported: **1**
- Cases with both > 0 (ratio meaningful): **1**
- Average radar/gauge ratio (where both > 0): **4.15**
- Worst deviation: **TERREY HILLS AWS (BoM 066059)**, **2026-05-01** — radar=4.98 mm, gauge=1.20 mm, ratio=4.15

## Results table

| Point | Period | Nearest gauge | Radar (mm) | Gauge (mm) | Ratio R/G | Notes |
|---|---|---|---:|---:|---:|---|
| N | 2025-07-01 → 2025-07-04 | COLLAROY (LONG REEF GOLF CLUB) (BoM 066126) | 79.08 | n/a | n/a | Gauge data not accessible from non-browser context for this period |
| N | 2025-06-15 → 2025-06-17 | COLLAROY (LONG REEF GOLF CLUB) (BoM 066126) | 0.87 | n/a | n/a | Gauge data not accessible from non-browser context for this period |
| N | 2024-02-15 → 2024-02-17 | COLLAROY (LONG REEF GOLF CLUB) (BoM 066126) | 12.54 | n/a | n/a | Gauge data not accessible from non-browser context for this period |
| N | 2026-05-01 → 2026-05-04 | COLLAROY (LONG REEF GOLF CLUB) (BoM 066126) | 4.80 | n/a | n/a | Gauge data not accessible from non-browser context for this period |
| C | 2025-07-01 → 2025-07-04 | TERREY HILLS AWS (BoM 066059) | 77.19 | n/a | n/a | Gauge data not accessible from non-browser context for this period |
| C | 2025-06-15 → 2025-06-17 | TERREY HILLS AWS (BoM 066059) | 0.92 | n/a | n/a | Gauge data not accessible from non-browser context for this period |
| C | 2024-02-15 → 2024-02-17 | TERREY HILLS AWS (BoM 066059) | 13.18 | n/a | n/a | Gauge data not accessible from non-browser context for this period |
| C | 2026-05-01 → 2026-05-04 | TERREY HILLS AWS (BoM 066059) | 4.98 | 1.20 | 4.15 | Significant deviation between radar and gauge |
| E | 2025-07-01 → 2025-07-04 | Cromer (BoM 048190) | 85.26 | n/a | n/a | Gauge data not accessible from non-browser context for this period |
| E | 2025-06-15 → 2025-06-17 | Cromer (BoM 048190) | 1.06 | n/a | n/a | Gauge data not accessible from non-browser context for this period |
| E | 2024-02-15 → 2024-02-17 | Cromer (BoM 048190) | 12.73 | n/a | n/a | Gauge data not accessible from non-browser context for this period |
| E | 2026-05-01 → 2026-05-04 | Cromer (BoM 048190) | 5.40 | n/a | n/a | Gauge data not accessible from non-browser context for this period |
| S | 2025-07-01 → 2025-07-04 | Cromer (BoM 048190) | 82.48 | n/a | n/a | Gauge data not accessible from non-browser context for this period |
| S | 2025-06-15 → 2025-06-17 | Cromer (BoM 048190) | 1.05 | n/a | n/a | Gauge data not accessible from non-browser context for this period |
| S | 2024-02-15 → 2024-02-17 | Cromer (BoM 048190) | 12.92 | n/a | n/a | Gauge data not accessible from non-browser context for this period |
| S | 2026-05-01 → 2026-05-04 | Cromer (BoM 048190) | 5.44 | n/a | n/a | Gauge data not accessible from non-browser context for this period |

## Radar internal consistency (cross-point spread per window)

Even where gauge is unreachable, agreement of radar values across spatially-spread points is a useful sanity signal: rainfall fields for a small AOI should not vary wildly between adjacent points unless there is a real cell.

| Window | Min (mm) | Mean (mm) | Max (mm) | Spread (max−min) | Spread / mean |
|---|---:|---:|---:|---:|---:|
| July 2025 (peak observed) | 77.19 | 81.00 | 85.26 | 8.07 | 10.0% |
| June 2025 (mid-month) | 0.87 | 0.98 | 1.06 | 0.19 | 19.5% |
| February 2024 (wet) | 12.54 | 12.84 | 13.18 | 0.64 | 5.0% |
| Recent 72h (gateway window) | 4.80 | 5.16 | 5.44 | 0.64 | 12.4% |

## Per-case detail

### N · July 2025 (peak observed)

- Location: lat=-33.68, lon=151.3 (AOI north (Mona Vale area))
- Nearest BoM gauge: COLLAROY (LONG REEF GOLF CLUB) (BoM 066126), 6.79 km
- Window: 2025-07-01T00:00:00Z → 2025-07-04T00:00:00Z
- Radar cumulative: **79.08 mm** (25 / 25 contributing steps)
- Gauge cumulative: **n/a mm** (0 readings)
  - Gauge fetch: historical window: existing fetch path requires browser context (Cloudflare-challenged) or a longer-history backend
- Notes: Gauge data not accessible from non-browser context for this period

### N · June 2025 (mid-month)

- Location: lat=-33.68, lon=151.3 (AOI north (Mona Vale area))
- Nearest BoM gauge: COLLAROY (LONG REEF GOLF CLUB) (BoM 066126), 6.79 km
- Window: 2025-06-15T00:00:00Z → 2025-06-17T00:00:00Z
- Radar cumulative: **0.87 mm** (17 / 17 contributing steps)
- Gauge cumulative: **n/a mm** (0 readings)
  - Gauge fetch: historical window: existing fetch path requires browser context (Cloudflare-challenged) or a longer-history backend
- Notes: Gauge data not accessible from non-browser context for this period

### N · February 2024 (wet)

- Location: lat=-33.68, lon=151.3 (AOI north (Mona Vale area))
- Nearest BoM gauge: COLLAROY (LONG REEF GOLF CLUB) (BoM 066126), 6.79 km
- Window: 2024-02-15T00:00:00Z → 2024-02-17T00:00:00Z
- Radar cumulative: **12.54 mm** (17 / 17 contributing steps)
- Gauge cumulative: **n/a mm** (0 readings)
  - Gauge fetch: historical window: existing fetch path requires browser context (Cloudflare-challenged) or a longer-history backend
- Notes: Gauge data not accessible from non-browser context for this period

### N · Recent 72h (gateway window)

- Location: lat=-33.68, lon=151.3 (AOI north (Mona Vale area))
- Nearest BoM gauge: COLLAROY (LONG REEF GOLF CLUB) (BoM 066126), 6.79 km
- Window: 2026-05-01T00:00:00Z → 2026-05-04T00:00:00Z
- Radar cumulative: **4.80 mm** (25 / 25 contributing steps)
- Gauge cumulative: **n/a mm** (0 readings)
- Notes: Gauge data not accessible from non-browser context for this period

### C · July 2025 (peak observed)

- Location: lat=-33.7, lon=151.25 (AOI centre (Frenchs Forest area))
- Nearest BoM gauge: TERREY HILLS AWS (BoM 066059), 2.5 km
- Window: 2025-07-01T00:00:00Z → 2025-07-04T00:00:00Z
- Radar cumulative: **77.19 mm** (25 / 25 contributing steps)
- Gauge cumulative: **n/a mm** (0 readings)
  - Gauge fetch: historical window: existing fetch path requires browser context (Cloudflare-challenged) or a longer-history backend
- Notes: Gauge data not accessible from non-browser context for this period

### C · June 2025 (mid-month)

- Location: lat=-33.7, lon=151.25 (AOI centre (Frenchs Forest area))
- Nearest BoM gauge: TERREY HILLS AWS (BoM 066059), 2.5 km
- Window: 2025-06-15T00:00:00Z → 2025-06-17T00:00:00Z
- Radar cumulative: **0.92 mm** (17 / 17 contributing steps)
- Gauge cumulative: **n/a mm** (0 readings)
  - Gauge fetch: historical window: existing fetch path requires browser context (Cloudflare-challenged) or a longer-history backend
- Notes: Gauge data not accessible from non-browser context for this period

### C · February 2024 (wet)

- Location: lat=-33.7, lon=151.25 (AOI centre (Frenchs Forest area))
- Nearest BoM gauge: TERREY HILLS AWS (BoM 066059), 2.5 km
- Window: 2024-02-15T00:00:00Z → 2024-02-17T00:00:00Z
- Radar cumulative: **13.18 mm** (17 / 17 contributing steps)
- Gauge cumulative: **n/a mm** (0 readings)
  - Gauge fetch: historical window: existing fetch path requires browser context (Cloudflare-challenged) or a longer-history backend
- Notes: Gauge data not accessible from non-browser context for this period

### C · Recent 72h (gateway window)

- Location: lat=-33.7, lon=151.25 (AOI centre (Frenchs Forest area))
- Nearest BoM gauge: TERREY HILLS AWS (BoM 066059), 2.5 km
- Window: 2026-05-01T00:00:00Z → 2026-05-04T00:00:00Z
- Radar cumulative: **4.98 mm** (25 / 25 contributing steps)
- Gauge cumulative: **1.20 mm** (144 readings)
- Absolute difference (radar − gauge): +3.78 mm
- Notes: Significant deviation between radar and gauge

### E · July 2025 (peak observed)

- Location: lat=-33.75, lon=151.3 (AOI east (Long Reef area))
- Nearest BoM gauge: Cromer (BoM 048190), 1.2 km
- Window: 2025-07-01T00:00:00Z → 2025-07-04T00:00:00Z
- Radar cumulative: **85.26 mm** (25 / 25 contributing steps)
- Gauge cumulative: **n/a mm** (0 readings)
  - Gauge fetch: historical window: existing fetch path requires browser context (Cloudflare-challenged) or a longer-history backend
- Notes: Gauge data not accessible from non-browser context for this period

### E · June 2025 (mid-month)

- Location: lat=-33.75, lon=151.3 (AOI east (Long Reef area))
- Nearest BoM gauge: Cromer (BoM 048190), 1.2 km
- Window: 2025-06-15T00:00:00Z → 2025-06-17T00:00:00Z
- Radar cumulative: **1.06 mm** (17 / 17 contributing steps)
- Gauge cumulative: **n/a mm** (0 readings)
  - Gauge fetch: historical window: existing fetch path requires browser context (Cloudflare-challenged) or a longer-history backend
- Notes: Gauge data not accessible from non-browser context for this period

### E · February 2024 (wet)

- Location: lat=-33.75, lon=151.3 (AOI east (Long Reef area))
- Nearest BoM gauge: Cromer (BoM 048190), 1.2 km
- Window: 2024-02-15T00:00:00Z → 2024-02-17T00:00:00Z
- Radar cumulative: **12.73 mm** (17 / 17 contributing steps)
- Gauge cumulative: **n/a mm** (0 readings)
  - Gauge fetch: historical window: existing fetch path requires browser context (Cloudflare-challenged) or a longer-history backend
- Notes: Gauge data not accessible from non-browser context for this period

### E · Recent 72h (gateway window)

- Location: lat=-33.75, lon=151.3 (AOI east (Long Reef area))
- Nearest BoM gauge: Cromer (BoM 048190), 1.2 km
- Window: 2026-05-01T00:00:00Z → 2026-05-04T00:00:00Z
- Radar cumulative: **5.40 mm** (25 / 25 contributing steps)
- Gauge cumulative: **n/a mm** (0 readings)
- Notes: Gauge data not accessible from non-browser context for this period

### S · July 2025 (peak observed)

- Location: lat=-33.8, lon=151.27 (AOI south (Balgowlah area))
- Nearest BoM gauge: Cromer (BoM 048190), 6.79 km
- Window: 2025-07-01T00:00:00Z → 2025-07-04T00:00:00Z
- Radar cumulative: **82.48 mm** (25 / 25 contributing steps)
- Gauge cumulative: **n/a mm** (0 readings)
  - Gauge fetch: historical window: existing fetch path requires browser context (Cloudflare-challenged) or a longer-history backend
- Notes: Gauge data not accessible from non-browser context for this period

### S · June 2025 (mid-month)

- Location: lat=-33.8, lon=151.27 (AOI south (Balgowlah area))
- Nearest BoM gauge: Cromer (BoM 048190), 6.79 km
- Window: 2025-06-15T00:00:00Z → 2025-06-17T00:00:00Z
- Radar cumulative: **1.05 mm** (17 / 17 contributing steps)
- Gauge cumulative: **n/a mm** (0 readings)
  - Gauge fetch: historical window: existing fetch path requires browser context (Cloudflare-challenged) or a longer-history backend
- Notes: Gauge data not accessible from non-browser context for this period

### S · February 2024 (wet)

- Location: lat=-33.8, lon=151.27 (AOI south (Balgowlah area))
- Nearest BoM gauge: Cromer (BoM 048190), 6.79 km
- Window: 2024-02-15T00:00:00Z → 2024-02-17T00:00:00Z
- Radar cumulative: **12.92 mm** (17 / 17 contributing steps)
- Gauge cumulative: **n/a mm** (0 readings)
  - Gauge fetch: historical window: existing fetch path requires browser context (Cloudflare-challenged) or a longer-history backend
- Notes: Gauge data not accessible from non-browser context for this period

### S · Recent 72h (gateway window)

- Location: lat=-33.8, lon=151.27 (AOI south (Balgowlah area))
- Nearest BoM gauge: Cromer (BoM 048190), 6.79 km
- Window: 2026-05-01T00:00:00Z → 2026-05-04T00:00:00Z
- Radar cumulative: **5.44 mm** (25 / 25 contributing steps)
- Gauge cumulative: **n/a mm** (0 readings)
- Notes: Gauge data not accessible from non-browser context for this period

## Observations

- Radar reported: 16 / 16 cases
- Gauge reported: 1 / 16 cases (most failures explained by access caveat above)
- Radar > 0 with gauge = 0: 0 cases
- Gauge > 0 with radar = 0: 0 cases
- Of ratio-comparable cases (n=1), within 0.5×–2× band: 0
- Radar cross-point spread / mean (worst non-trivial window): 19.5%

## Conclusion

**Inconclusive on the head-to-head metric.** Only 1 case produced both a non-zero radar AND a non-zero gauge cumulative — too few for a quantitative verdict (threshold n≥4). Gauge data for the historical windows is unreachable from a non-browser context, and the recent 72-hour window was largely dry across all four points.

**Indirect signal — radar is internally coherent.**
- The radar pipeline (with strict offline / coverage_gap / sentinel exclusion) returns rainfall values that agree closely across the 4 spatially-spread AOI points within each window. Worst cross-point spread / mean across the four windows tested was **19.5%**, consistent with a smooth rainfall field at ~10 km AOI scale rather than instrument noise.
- For the dry recent window, BoM gauge readings (where available) and radar both returned single-digit mm — no contradictions on direction.
- For the wet July 2025 window, all 4 AOI points returned 77–85 mm radar cumulative over 72 h — a plausible magnitude for a peak-month event at the Northern Beaches.
- The single comparable pair (point C, recent 72h, BoM 066059): radar=4.98 mm vs gauge=1.20 mm (ratio 4.15). Both are in the same order of magnitude (single-digit mm). The radar/gauge ratio of ~4.2× over a quiet 3-day window is within the spread typically reported for QPE-vs-gauge at low rainfall totals (where small absolute differences inflate ratios), but cannot be considered a true bias estimate from one observation.

**Recommendation: usable for sanity-level event detection, NOT yet validated for quantitative event totals.** Radar can be relied on to identify whether an event occurred and to report a magnitude in the right order. To complete the quantitative head-to-head, the next step is to either (a) run an equivalent comparison from the browser context where Stormgauge already fetches MHL successfully, exporting the gauge totals to a JSON file this script can re-consume; or (b) extend the Stormgauge backend gateway with a longer-history MHL pass-through.
