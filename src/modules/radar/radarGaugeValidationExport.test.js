// Tests for radarGaugeValidationExport.js
//
// Run with:  node --test src/modules/radar/radarGaugeValidationExport.test.js
//
// The fixture exporter is browser-side (uses window.fetchStationRainfall +
// download blob URLs). These Node-side tests cover what is portable: pure
// helpers, schema constants, input validation, and the contract that the
// exporter hard-fails when the browser fetch path is not present.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  FIXTURE_SCHEMA,
  FIXTURE_VERSION,
  DEFAULT_DURATION_MINUTES,
  DEFAULT_FILENAME,
  DEFAULT_STATIONS_URL_CANDIDATES,
  exportGaugeComparisonFixture,
  lookupFixtureCase
} from './radarGaugeValidationExport.js';

// =========================================================================
// Schema constants (frozen — change requires consumer update)
// =========================================================================

test('Fixture schema constants: stable identifiers consumed by the Node sanity script', () => {
  assert.equal(FIXTURE_SCHEMA, 'stormgauge-radar-gauge-validation-fixture',
    'schema string regression — Node sanity script keys on this');
  assert.equal(FIXTURE_VERSION, 1, 'schema version regression');
  assert.equal(DEFAULT_DURATION_MINUTES, 30);
  assert.equal(DEFAULT_FILENAME, 'radar_gauge_validation_fixture.json');
});

test('DEFAULT_STATIONS_URL_CANDIDATES: includes a local-first and a remote fallback URL', () => {
  assert.ok(Array.isArray(DEFAULT_STATIONS_URL_CANDIDATES));
  assert.ok(DEFAULT_STATIONS_URL_CANDIDATES.length >= 2,
    'expected at least one local and one remote candidate');
  assert.ok(DEFAULT_STATIONS_URL_CANDIDATES.some((u) => u.startsWith('data/')),
    'expected a local-relative URL among candidates');
  assert.ok(DEFAULT_STATIONS_URL_CANDIDATES.some((u) => u.startsWith('https://')),
    'expected a remote https URL among candidates');
});

// =========================================================================
// lookupFixtureCase (pure helper — Node-safe)
// =========================================================================

const SAMPLE_FIXTURE = Object.freeze({
  schema: FIXTURE_SCHEMA,
  schemaVersion: FIXTURE_VERSION,
  cases: [
    {
      location: { lat: -33.70, lon: 151.25, label: 'AOI centre', id: 'C' },
      startIso: '2025-07-01T00:00:00Z',
      endIso:   '2025-07-04T00:00:00Z',
      gaugeMm: 17.5,
      gaugeReadingCount: 144,
      source: 'mhl'
    },
    {
      location: { lat: -33.68, lon: 151.30, label: 'AOI north', id: 'N' },
      startIso: '2025-07-01T00:00:00Z',
      endIso:   '2025-07-04T00:00:00Z',
      gaugeMm: null,
      gaugeReadingCount: 0,
      source: null,
      error: 'no readings'
    }
  ]
});

test('lookupFixtureCase: returns null for missing/empty fixture', () => {
  assert.equal(
    lookupFixtureCase(null, -33.70, 151.25, '2025-07-01T00:00:00Z', '2025-07-04T00:00:00Z'),
    null
  );
  assert.equal(
    lookupFixtureCase({}, -33.70, 151.25, '2025-07-01T00:00:00Z', '2025-07-04T00:00:00Z'),
    null
  );
  assert.equal(
    lookupFixtureCase({ cases: [] }, -33.70, 151.25, '2025-07-01T00:00:00Z', '2025-07-04T00:00:00Z'),
    null
  );
});

test('lookupFixtureCase: returns the matching case by lat/lon/range', () => {
  const c = lookupFixtureCase(SAMPLE_FIXTURE, -33.70, 151.25,
    '2025-07-01T00:00:00Z', '2025-07-04T00:00:00Z');
  assert.ok(c, 'expected a matching case');
  assert.equal(c.location.id, 'C');
  assert.equal(c.gaugeMm, 17.5);
});

test('lookupFixtureCase: distinguishes cases at different points within the same range', () => {
  const north = lookupFixtureCase(SAMPLE_FIXTURE, -33.68, 151.30,
    '2025-07-01T00:00:00Z', '2025-07-04T00:00:00Z');
  assert.ok(north);
  assert.equal(north.location.id, 'N');
  assert.equal(north.gaugeMm, null,
    'missing gauge data must be null, NEVER 0');
});

test('lookupFixtureCase: returns null when no case matches', () => {
  assert.equal(
    lookupFixtureCase(SAMPLE_FIXTURE, -33.70, 151.25,
      '2024-02-15T00:00:00Z', '2024-02-17T00:00:00Z'),
    null,
    'window with no matching case must return null'
  );
  assert.equal(
    lookupFixtureCase(SAMPLE_FIXTURE, -34.00, 151.25,
      '2025-07-01T00:00:00Z', '2025-07-04T00:00:00Z'),
    null,
    'point with no matching case must return null'
  );
});

test('lookupFixtureCase: tolerates lat/lon precision drift below 6 decimals', () => {
  // The internal caseKey normalises to .toFixed(6) — sub-µ° drift must not
  // break lookup so the Node sanity script can match on points that came
  // back from the browser exporter at higher precision.
  const c = lookupFixtureCase(SAMPLE_FIXTURE, -33.700000001, 151.2500000005,
    '2025-07-01T00:00:00Z', '2025-07-04T00:00:00Z');
  assert.ok(c, 'sub-µ° precision drift must not break lookup');
  assert.equal(c.location.id, 'C');
});

// =========================================================================
// exportGaugeComparisonFixture: input validation
// =========================================================================

test('exportGaugeComparisonFixture: rejects empty points array before touching the browser fetch path', async () => {
  await assert.rejects(
    () => exportGaugeComparisonFixture({
      points: [],
      windows: [{ startIso: '2025-07-01T00:00:00Z', endIso: '2025-07-04T00:00:00Z' }]
    }),
    /points must be a non-empty array/
  );
});

test('exportGaugeComparisonFixture: rejects empty windows array before touching the browser fetch path', async () => {
  await assert.rejects(
    () => exportGaugeComparisonFixture({
      points:  [{ lat: -33.70, lon: 151.25 }],
      windows: []
    }),
    /windows must be a non-empty array/
  );
});

test('exportGaugeComparisonFixture: in Node (no window) hard-fails with the documented browser-only message', async () => {
  // Browser-only path: must NEVER silently degrade to a stub when
  // window.fetchStationRainfall is missing. The Node sanity script depends
  // on this contract — a fabricated 0 here would be silently catastrophic.
  await assert.rejects(
    () => exportGaugeComparisonFixture({
      points:  [{ lat: -33.70, lon: 151.25, id: 'C' }],
      windows: [{ startIso: '2025-07-01T00:00:00Z', endIso: '2025-07-04T00:00:00Z', id: 'jul25' }]
    }),
    /window\.fetchStationRainfall is not available/
  );
});

// =========================================================================
// Node-side import side-effects
// =========================================================================

test('Module import: does not pollute Node globals (browser self-install is gated by typeof window)', () => {
  assert.equal(typeof globalThis.StormgaugeRadarValidation, 'undefined',
    'browser self-install must be a no-op when window is undefined');
});
