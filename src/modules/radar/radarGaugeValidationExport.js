// Browser-side gauge validation fixture exporter.
//
// Stormgauge / Pluviometrics. Read-only helper. Does NOT modify any existing
// module, the UI, or branding. Loaded on demand from DevTools, e.g.:
//
//     await import('./src/modules/radar/radarGaugeValidationExport.js');
//     const fx = await window.StormgaugeRadarValidation.exportGaugeComparisonFixture({
//       points: [
//         { id: 'C', lat: -33.70, lon: 151.25, label: 'AOI centre' },
//         ...
//       ],
//       windows: [
//         { id: 'jul25',  startIso: '2025-07-01T00:00:00Z', endIso: '2025-07-04T00:00:00Z', label: 'July 2025 (peak)' },
//         ...
//       ]
//     });
//
// The browser triggers a download of:
//     reports/fixtures/radar_gauge_validation_fixture.json   (recommended save path)
//
// The Node radar-vs-gauge script can then consume it:
//     node scripts/radar_vs_gauge_sanity.js --gauge-fixture reports/fixtures/radar_gauge_validation_fixture.json
//
// Why this exists: the MHL KiWIS API is reachable from the browser (Stormgauge
// already passes its Cloudflare bot challenge during normal use) but not from
// a Node process. The Node script needs an authoritative gauge reading for
// historical event windows; this bridge produces it.
//
// Strict rules:
//   * Uses the existing browser fetch path (window.fetchStationRainfall) — does
//     NOT reimplement gauge fetching.
//   * Missing gauge data is recorded as null (NEVER 0).
//   * Errors per case are recorded but do not abort the run.

export const FIXTURE_SCHEMA   = 'stormgauge-radar-gauge-validation-fixture';
export const FIXTURE_VERSION  = 1;
export const DEFAULT_DURATION_MINUTES = 30;
export const DEFAULT_FILENAME = 'radar_gauge_validation_fixture.json';
export const DEFAULT_STATIONS_URL_CANDIDATES = [
  'data/pluviometrics_rainfall_stations.json',
  'https://data.pluviometrics.com.au/pluviometrics_rainfall_stations.json'
];

// =====================================================================
// Helpers
// =====================================================================

function haversineKm(aLat, aLon, bLat, bLon) {
  const R = 6371;
  const toRad = (x) => x * Math.PI / 180;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function nearestStation(point, stations, sourceFilter) {
  let best = null;
  for (const s of stations) {
    if (!Number.isFinite(s.lat) || !Number.isFinite(s.lon)) continue;
    if (sourceFilter && String(s.source).toLowerCase() !== String(sourceFilter).toLowerCase()) continue;
    if (!s.data_identifier) continue;
    const d = haversineKm(point.lat, point.lon, s.lat, s.lon);
    if (best === null || d < best.distKm) best = { station: s, distKm: d };
  }
  return best;
}

function sumIncrementalReadings(readings) {
  // Returns null when no readings exist — NEVER fabricates a 0.
  if (!Array.isArray(readings) || readings.length === 0) return null;
  let sum = 0;
  let countedAny = false;
  for (const r of readings) {
    const v = Number(r?.value);
    if (Number.isFinite(v) && v >= 0) {
      sum += v;
      countedAny = true;
    }
  }
  return countedAny ? sum : null;
}

async function loadStationCatalogue(urlOverride) {
  const candidates = urlOverride ? [urlOverride] : DEFAULT_STATIONS_URL_CANDIDATES;
  let lastErr = null;
  for (const url of candidates) {
    try {
      const r = await fetch(url, { cache: 'no-store' });
      if (!r.ok) { lastErr = new Error(`${url}: HTTP ${r.status}`); continue; }
      const j = await r.json();
      const stations = Array.isArray(j) ? j : (j.stations || []);
      if (Array.isArray(stations) && stations.length > 0) return { stations, sourceUrl: url };
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error(`Could not load station catalogue from ${candidates.join(', ')}: ${lastErr?.message || 'unknown error'}`);
}

function ensureBrowserFetchAvailable() {
  if (typeof window === 'undefined' || typeof window.fetchStationRainfall !== 'function') {
    throw new Error(
      'window.fetchStationRainfall is not available. Open the Stormgauge page (index.html) ' +
      'first, then load this exporter from DevTools so it can use the same fetch path.'
    );
  }
}

function triggerJsonDownload(payload, filename) {
  if (typeof document === 'undefined' || typeof URL?.createObjectURL !== 'function') return false;
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}

function caseKey(lat, lon, startIso, endIso) {
  return `${Number(lat).toFixed(6)},${Number(lon).toFixed(6)}|${startIso}|${endIso}`;
}

// =====================================================================
// Station field normalisation
// =====================================================================

// The consolidated catalogue (pluviometrics_rainfall_stations.json) stores
// ts_id and bom_id inside `data_identifier` ("mhl:XXXXXXXX", "bom:XXXXXX")
// rather than as top-level fields.  window.fetchStationRainfall needs them
// as top-level fields.  Derive them here — no values are invented; the IDs
// come directly from the catalogue's own data_identifier.
function normalizeStationForFetch(s) {
  if (!s) return s;
  const norm = { ...s };
  if (!norm.ts_id && typeof norm.data_identifier === 'string') {
    const m = norm.data_identifier.match(/^mhl:(\d+)$/);
    if (m) norm.ts_id = m[1];
  }
  if (!norm.bom_id && typeof norm.data_identifier === 'string') {
    const m = norm.data_identifier.match(/^bom:(\d+)$/);
    if (m) norm.bom_id = m[1];
  }
  return norm;
}

// =====================================================================
// Per-case fetch
// =====================================================================

async function runOneCase({ point, win, station, distKm, durationMinutes, onProgress }) {
  const c = {
    location: { lat: point.lat, lon: point.lon, label: point.label || null, id: point.id || null },
    startIso: win.startIso,
    endIso:   win.endIso,
    windowLabel: win.label || null,
    windowId:    win.id || null,
    nearestStation: station ? {
      source: station.source,
      station_id: station.station_id,
      station_name: station.station_name,
      lat: station.lat,
      lon: station.lon,
      data_identifier: station.data_identifier || null,
      distanceKm: distKm == null ? null : +distKm.toFixed(3)
    } : null,
    gaugeMm: null,
    gaugeReadingCount: 0,
    intervalMinutes: null,
    source: null,
    error: null,
    fetchedAt: null
  };

  if (!station) {
    c.error = 'no candidate station in catalogue near point';
    return c;
  }

  try {
    const fromDt = new Date(win.startIso);
    const toDt   = new Date(win.endIso);
    const result = await window.fetchStationRainfall(normalizeStationForFetch(station), fromDt, toDt, durationMinutes);
    const readings = Array.isArray(result?.readings) ? result.readings : [];
    c.gaugeReadingCount = readings.length;
    c.gaugeMm           = sumIncrementalReadings(readings);
    c.intervalMinutes   = result?.intervalMinutes ?? null;
    c.source            = result?.source ?? null;
    c.fetchedAt         = new Date().toISOString();
  } catch (err) {
    c.error = err?.message ? err.message : String(err);
  }

  if (typeof onProgress === 'function') {
    try { onProgress(c); } catch { /* ignore listener errors */ }
  }
  return c;
}

// =====================================================================
// Public entry point
// =====================================================================

export async function exportGaugeComparisonFixture(config = {}) {
  const points  = Array.isArray(config.points)  ? config.points  : [];
  const windows = Array.isArray(config.windows) ? config.windows : [];
  if (points.length === 0)  throw new Error('config.points must be a non-empty array of {lat, lon, [id, label]}');
  if (windows.length === 0) throw new Error('config.windows must be a non-empty array of {startIso, endIso, [id, label]}');

  ensureBrowserFetchAvailable();

  const downloadFile     = config.download !== false;
  const filename         = config.filename || DEFAULT_FILENAME;
  const sourceFilter     = config.sourceFilter || null;
  const durationMinutes  = Number.isFinite(config.durationMinutes) ? config.durationMinutes : DEFAULT_DURATION_MINUTES;
  const onProgress       = typeof config.onProgress === 'function' ? config.onProgress : null;

  let stations, sourceUrl;
  if (Array.isArray(config.stations) && config.stations.length > 0) {
    stations  = config.stations;
    sourceUrl = config.stationsSource || 'inline';
  } else {
    ({ stations, sourceUrl } = await loadStationCatalogue(config.stationCatalogueUrl));
  }

  const cases = [];
  const seenCaseKeys = new Set();
  for (const pt of points) {
    if (!Number.isFinite(pt?.lat) || !Number.isFinite(pt?.lon)) {
      throw new TypeError(`Point must have finite numeric lat/lon: ${JSON.stringify(pt)}`);
    }
    const nearest = nearestStation(pt, stations, sourceFilter);
    for (const win of windows) {
      if (!win?.startIso || !win?.endIso) {
        throw new TypeError(`Window must have startIso/endIso: ${JSON.stringify(win)}`);
      }
      const key = caseKey(pt.lat, pt.lon, win.startIso, win.endIso);
      if (seenCaseKeys.has(key)) continue;
      seenCaseKeys.add(key);
      const c = await runOneCase({
        point: pt,
        win,
        station: nearest?.station ?? null,
        distKm:  nearest?.distKm  ?? null,
        durationMinutes,
        onProgress
      });
      cases.push(c);
    }
  }

  const fixture = {
    schema: FIXTURE_SCHEMA,
    schemaVersion: FIXTURE_VERSION,
    generatedAt: new Date().toISOString(),
    catalogue: { sourceUrl, stationCount: stations.length },
    durationMinutes,
    sourceFilter,
    pointCount: points.length,
    windowCount: windows.length,
    caseCount: cases.length,
    cases
  };

  if (downloadFile) {
    triggerJsonDownload(fixture, filename);
  }
  return fixture;
}

// =====================================================================
// Reverse lookup helper (used by the Node side)
// =====================================================================

export function lookupFixtureCase(fixture, lat, lon, startIso, endIso) {
  if (!fixture || !Array.isArray(fixture.cases)) return null;
  const key = caseKey(lat, lon, startIso, endIso);
  for (const c of fixture.cases) {
    if (!c?.location) continue;
    if (caseKey(c.location.lat, c.location.lon, c.startIso, c.endIso) === key) return c;
  }
  return null;
}

// =====================================================================
// Browser-side self-install (no UI, no DOM mutation, no module mutation)
// =====================================================================

if (typeof window !== 'undefined') {
  window.StormgaugeRadarValidation = window.StormgaugeRadarValidation || {};
  window.StormgaugeRadarValidation.exportGaugeComparisonFixture = exportGaugeComparisonFixture;
  window.StormgaugeRadarValidation.lookupFixtureCase            = lookupFixtureCase;
  window.StormgaugeRadarValidation.FIXTURE_SCHEMA               = FIXTURE_SCHEMA;
  window.StormgaugeRadarValidation.FIXTURE_VERSION              = FIXTURE_VERSION;
  // Convenience: pre-load the canonical defaults the Node sanity script uses,
  // so a console caller can do `await window.StormgaugeRadarValidation.exportDefault()`.
  window.StormgaugeRadarValidation.DEFAULT_POINTS = [
    { id: 'N', lat: -33.68, lon: 151.30, label: 'AOI north (Mona Vale area)' },
    { id: 'C', lat: -33.70, lon: 151.25, label: 'AOI centre (Frenchs Forest area)' },
    { id: 'E', lat: -33.75, lon: 151.30, label: 'AOI east (Long Reef area)' },
    { id: 'S', lat: -33.80, lon: 151.27, label: 'AOI south (Balgowlah area)' }
  ];
  window.StormgaugeRadarValidation.DEFAULT_WINDOWS = [
    { id: 'jul25',  startIso: '2025-07-01T00:00:00Z', endIso: '2025-07-04T00:00:00Z', label: 'July 2025 (peak observed)' },
    { id: 'jun25',  startIso: '2025-06-15T00:00:00Z', endIso: '2025-06-17T00:00:00Z', label: 'June 2025 (mid-month)' },
    { id: 'feb24',  startIso: '2024-02-15T00:00:00Z', endIso: '2024-02-17T00:00:00Z', label: 'February 2024 (wet)' },
    { id: 'recent', startIso: '2026-05-01T00:00:00Z', endIso: '2026-05-04T00:00:00Z', label: 'Recent 72h (gateway window)' }
  ];
  window.StormgaugeRadarValidation.exportDefault = (overrides = {}) =>
    exportGaugeComparisonFixture({
      points:  window.StormgaugeRadarValidation.DEFAULT_POINTS,
      windows: window.StormgaugeRadarValidation.DEFAULT_WINDOWS,
      ...overrides
    });
}
