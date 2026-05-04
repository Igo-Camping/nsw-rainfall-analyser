# Radar Gauge Source Mapping — Diagnosis

_Generated: 2026-05-04_

## Root cause

The browser fixture exporter (`radarGaugeValidationExport.js`) selects nearest stations
from the consolidated catalogue (`data/pluviometrics_rainfall_stations.json`, 1394 stations)
and passes those objects directly to `window.fetchStationRainfall`.

The consolidated catalogue stores `ts_id` and `bom_id` inside `data_identifier`
(`"mhl:81802042"`, `"bom:048190"`) rather than as top-level fields.
`fetchStationRainfall` looks for `station.ts_id` (MHL path) and `station.bom_id` /
`station.site` (BoM path). Neither is present → all four stations error.

## Per-station findings

| Point | Station | source | data_identifier | ts_id in cat? | bom_id in cat? | Error |
|---|---|---|---|---|---|---|
| N | Narrabeen Creek (65663) | mhl | mhl:81802042 | no | — | "No rainfall data source is available" |
| C | Wakehurst U/S (185822) | mhl | mhl:154483042 | no | — | "No rainfall data source is available" |
| S | Balgowlah Bowls Club (48405) | mhl | mhl:11125042 | no | — | "No rainfall data source is available" |
| E | Cromer (bom-048190) | bom | bom:048190 | — | no | "BoM station number unavailable" |

### MHL ts_ids (verified in rejected_mhl_rainfall_stations.json)

| Station | ts_id | Rejection reason |
|---|---|---|
| Narrabeen Creek (65663) | 81802042 | HTTP 403 from Node (Cloudflare) — expected; browser bypasses this |
| Wakehurst U/S (185822) | 154483042 | HTTP 403 from Node (Cloudflare) — expected |
| Balgowlah Bowls Club (48405) | 11125042 | HTTP 403 from Node (Cloudflare) — expected |

The 403s are from the Node-side verification script hitting the Cloudflare bot challenge.
From a live browser session (which the exporter runs in), those ts_ids are reachable.

### BoM Cromer (bom-048190)

- `bom_id: "048190"` confirmed in `verified_bom_rainfall_stations.json`
- `activity_status: "historical"`, `latest_reading_time: 2026-02-27`
- Source layer: "Rain gauge locations" (CDO **daily** gauge, not an AWS)
- **Secondary blocker:** The `/bom/rainfall` backend endpoint serves only the last ~72h
  of AWS observations. Cromer is a daily CDO station with no recent activity.
  Even after the field-normalization fix, historical windows will return no gauge data
  for point E via this station.

### Point E secondary recommendation

The next nearest station to E (-33.75, 151.30) that may carry historical MHL data:

| Distance | source | station_id | name | data_identifier |
|---|---|---|---|---|
| 1.22 km | mhl | 106121 | Dee Why Civic Centre (Rain) | mhl:84302042 |
| 2.25 km | mhl | 66743 | Cromer | mhl:81917042 |

Consider passing `sourceFilter: 'mhl'` to `exportDefault()` to skip CDO-only BoM
stations for all points when historical gauge data is needed.

## Fix applied

**File:** `src/modules/radar/radarGaugeValidationExport.js`

Added `normalizeStationForFetch(s)` helper (before the per-case fetch section) that
derives `ts_id` from `data_identifier` matching `/^mhl:(\d+)$/` and `bom_id` from
`/^bom:(\d+)$/`. No values invented — IDs come directly from the catalogue's own
`data_identifier` field.

Changed `runOneCase` to call:
```js
window.fetchStationRainfall(normalizeStationForFetch(station), ...)
```

This fixes the "No rainfall data source" error for N/C/S and the "BoM station number
unavailable" error for E.

## Remaining limitations after fix

- Point E (Cromer BoM): field error resolved, but historical windows still return no data
  (CDO daily gauge, backend serves AWS 72h only). Recent window may return data if Cromer
  were an active AWS — it is not.
- MHL stations N/C/S: will now attempt KiWIS fetch from browser; actual data availability
  depends on whether those ts_ids carry rainfall data in KiWIS for the selected windows.

## Files changed

- `src/modules/radar/radarGaugeValidationExport.js` — normalizeStationForFetch added, call site updated

## Committed: no
## Pushed: no
