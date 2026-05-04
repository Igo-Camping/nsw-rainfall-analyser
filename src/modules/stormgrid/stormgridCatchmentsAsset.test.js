// Regression guard for Stormgrid catchments asset (404 fix)
//
// Run with:  node --test src/modules/stormgrid/stormgridCatchmentsAsset.test.js
//
// Why this file exists
// --------------------
// Stormgrid v0 fetches a single catchment GeoJSON named in
// stormgridConfig.js (CATCHMENTS_URL). The repo's `.gitignore` has a
// blanket `*.geojson` rule, so without a matching `!` exception the
// asset is silently excluded from commits and the live deploy returns
// 404 even though the file exists on a contributor's local disk. This
// happened during Stormgrid v0 rollout and was fixed by adding an
// explicit allowlist line. These tests fail loudly if any of those
// preconditions regress.
//
// Scope: Stormgrid only. No imports from Stormgauge, AEP, IFD, station,
// radar, export, branding, or unrelated modules. Pure Node, no fetch,
// no DOM.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { CATCHMENTS_URL } from './stormgridConfig.js';

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..', '..', '..'
);

const ASSET_ABS_PATH = path.resolve(REPO_ROOT, CATCHMENTS_URL);
const GITIGNORE_PATH = path.resolve(REPO_ROOT, '.gitignore');

// =========================================================================
// CATCHMENTS_URL shape
// =========================================================================

test('CATCHMENTS_URL: relative path under Assets/Catchments/, no leading slash', () => {
  assert.equal(typeof CATCHMENTS_URL, 'string');
  assert.ok(CATCHMENTS_URL.length > 0, 'CATCHMENTS_URL must not be empty');
  assert.ok(
    !CATCHMENTS_URL.startsWith('/'),
    'CATCHMENTS_URL must be relative (no leading slash) so it resolves under any deploy host'
  );
  assert.ok(
    !/^https?:/i.test(CATCHMENTS_URL),
    'CATCHMENTS_URL must be same-origin, not absolute http(s)'
  );
  assert.ok(
    CATCHMENTS_URL.startsWith('Assets/Catchments/'),
    'CATCHMENTS_URL must live under Assets/Catchments/ (case-sensitive — Linux Pages host is case-sensitive)'
  );
  assert.ok(
    CATCHMENTS_URL.endsWith('.geojson'),
    'CATCHMENTS_URL must end with .geojson'
  );
});

// =========================================================================
// On-disk asset
// =========================================================================

test('catchments asset: file exists at the resolved path', () => {
  let stat;
  try {
    stat = statSync(ASSET_ABS_PATH);
  } catch (err) {
    assert.fail(
      'Catchments asset missing at ' + ASSET_ABS_PATH +
      ' — Stormgrid will 404 on staging. Original cause: .gitignore *.geojson rule. ' +
      'Restore the file and verify the !-exception line in .gitignore is intact.'
    );
  }
  assert.ok(stat.isFile(), 'CATCHMENTS_URL must point at a regular file');
  assert.ok(
    stat.size > 1024,
    'Catchments asset is suspiciously small (' + stat.size + ' bytes) — likely truncated or a placeholder'
  );
});

test('catchments asset: parses as a non-empty GeoJSON FeatureCollection', () => {
  const raw = readFileSync(ASSET_ABS_PATH, 'utf8');
  let fc;
  try {
    fc = JSON.parse(raw);
  } catch (err) {
    assert.fail('Catchments asset is not valid JSON: ' + err.message);
  }
  assert.equal(fc && fc.type, 'FeatureCollection',
    'Catchments asset must be a GeoJSON FeatureCollection');
  assert.ok(Array.isArray(fc.features), 'features must be an array');
  assert.ok(fc.features.length > 0,
    'FeatureCollection must contain at least one feature — empty file would render an empty map');
});

// =========================================================================
// .gitignore allowlist exception
// =========================================================================
//
// The blanket `*.geojson` rule was the original cause of the 404. The
// asset is only kept tracked because of an explicit `!Assets/...` line
// further down. If that line is ever removed, the next push will silently
// drop the geojson from the deploy. Pin the line here.

test('.gitignore: catchments asset has an explicit allowlist exception', () => {
  const text = readFileSync(GITIGNORE_PATH, 'utf8');
  const lines = text.split(/\r?\n/);
  const blanket = lines.findIndex(l => l.trim() === '*.geojson');
  const exception = lines.findIndex(l => l.trim() === '!' + CATCHMENTS_URL);

  assert.ok(blanket !== -1,
    '.gitignore no longer has a blanket *.geojson rule — review whether this guard is still needed');
  assert.ok(exception !== -1,
    '.gitignore is missing the line: !' + CATCHMENTS_URL +
    ' — without it, the *.geojson rule excludes the catchments asset and Stormgrid 404s on staging');
  assert.ok(exception > blanket,
    'The !-exception must come after the *.geojson rule — gitignore evaluates rules in order');
});
