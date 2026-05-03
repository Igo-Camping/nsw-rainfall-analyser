// Radar archive index layer.
//
// Source of truth: data/radar_archive/processed/lizard_precipitation_australia/
//   metadata/    *.json   (per-timestep metadata — used here, never .tif)
//   raw_payloads/*.tif    (referenced only for 1:1 parity check)
//
// Filename convention: YYYYMMDDTHHMMSSZ_lizard_precipitation_australia.{json,tif}
//
// Some timesteps in the archive are "all-nodata" sentinel responses written
// during periods when the upstream Lizard raster source returned an empty
// raster for the AOI (e.g., the confirmed 2024-09 / 2024-10 radar outage).
// Every such file shares an identical sha256 (recorded in the metadata).
// Those timesteps must be treated as MISSING for accumulation purposes —
// not as zero rainfall.
//
// This module is fully isolated. It depends only on Node built-ins and on
// radarAvailability.js (read-only).

import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  RADAR_STATE,
  getRadarAvailabilityForTimestamp
} from './radarAvailability.js';

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ARCHIVE_ROOT = path.resolve(
  MODULE_DIR,
  '..', '..', '..',
  'data', 'radar_archive', 'processed', 'lizard_precipitation_australia'
);

const FILENAME_RE = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z_lizard_precipitation_australia\.(json|tif)$/;
const NODATA_SENTINEL_SHA256 = 'f6e3d73671ad6b6827c502d269be2ff86e62e857dfa0f755378f0bb29b8a0ef1';
const HOUR_MS = 3600 * 1000;

let cachedIndex = null;
let cachedRoot = null;

function filenameToIso(filename) {
  const m = FILENAME_RE.exec(filename);
  if (!m) return null;
  const [, y, mo, d, hh, mm, ss] = m;
  return `${y}-${mo}-${d}T${hh}:${mm}:${ss}Z`;
}

function inferTimestepHours(sortedIsoTimestamps) {
  if (sortedIsoTimestamps.length < 2) return null;
  const counts = new Map();
  for (let i = 1; i < sortedIsoTimestamps.length; i++) {
    const delta = Date.parse(sortedIsoTimestamps[i]) - Date.parse(sortedIsoTimestamps[i - 1]);
    if (!Number.isFinite(delta) || delta <= 0) continue;
    counts.set(delta, (counts.get(delta) || 0) + 1);
  }
  let bestDelta = null;
  let bestCount = -1;
  for (const [delta, count] of counts) {
    if (count > bestCount) { bestCount = count; bestDelta = delta; }
  }
  return bestDelta == null ? null : bestDelta / HOUR_MS;
}

function readEntries(metadataDir) {
  const files = readdirSync(metadataDir).filter((f) => f.endsWith('.json'));
  const entries = [];
  for (const f of files) {
    const iso = filenameToIso(f);
    if (!iso) continue;
    let sha256 = null;
    try {
      const meta = JSON.parse(readFileSync(path.join(metadataDir, f), 'utf8'));
      sha256 = typeof meta.sha256 === 'string' ? meta.sha256 : null;
    } catch {
      // Malformed metadata: still index the timestamp, but mark sha unknown
      // so it is conservatively excluded from data-bearing.
      sha256 = null;
    }
    entries.push({ filename: f, iso, sha256 });
  }
  entries.sort((a, b) => (a.iso < b.iso ? -1 : a.iso > b.iso ? 1 : 0));
  return entries;
}

export function buildRadarArchiveIndex(options = {}) {
  const archiveRoot = options.archiveRoot || DEFAULT_ARCHIVE_ROOT;
  const force = options.force === true;

  if (!force && cachedIndex && cachedRoot === archiveRoot) {
    return cachedIndex.public;
  }

  const metadataDir = path.join(archiveRoot, 'metadata');
  const rasterDir   = path.join(archiveRoot, 'raw_payloads');
  if (!existsSync(metadataDir)) {
    throw new Error(`Radar archive metadata directory not found: ${metadataDir}`);
  }

  const entries = readEntries(metadataDir);
  const timestamps = entries.map((e) => e.iso);
  const dataBearingTimestamps = entries
    .filter((e) => e.sha256 && e.sha256 !== NODATA_SENTINEL_SHA256)
    .map((e) => e.iso);

  const timestepHours = inferTimestepHours(timestamps);

  const publicIndex = {
    timestamps,
    firstTimestamp: timestamps[0] ?? null,
    lastTimestamp:  timestamps[timestamps.length - 1] ?? null,
    timestepHours
  };

  cachedIndex = {
    public: publicIndex,
    entries,
    dataBearingTimestamps,
    archiveRoot,
    metadataDir,
    rasterDir
  };
  cachedRoot = archiveRoot;
  return publicIndex;
}

function ensureCache(options) {
  if (!cachedIndex || (options?.archiveRoot && options.archiveRoot !== cachedRoot)) {
    buildRadarArchiveIndex(options);
  }
  return cachedIndex;
}

export function getDataBearingTimestamps(options) {
  return ensureCache(options).dataBearingTimestamps.slice();
}

export function clearRadarArchiveIndexCache() {
  cachedIndex = null;
  cachedRoot = null;
}

export function detectRadarGaps(timestamps, expectedTimestepHours) {
  const list = (timestamps && timestamps.length)
    ? timestamps
    : ensureCache().dataBearingTimestamps;
  const stepHours = Number.isFinite(expectedTimestepHours)
    ? expectedTimestepHours
    : (cachedIndex?.public.timestepHours ?? inferTimestepHours(list));
  if (!Number.isFinite(stepHours) || stepHours <= 0) return [];

  const stepMs = stepHours * HOUR_MS;
  const gaps = [];
  for (let i = 1; i < list.length; i++) {
    const prev = Date.parse(list[i - 1]);
    const curr = Date.parse(list[i]);
    const delta = curr - prev;
    if (delta > stepMs) {
      const missingCount = Math.max(0, Math.round(delta / stepMs) - 1);
      gaps.push({
        start: list[i - 1],
        end:   list[i],
        missingCount
      });
    }
  }
  return gaps;
}

function expectedStepsBetween(startMs, endMs, stepMs) {
  if (!(stepMs > 0) || endMs <= startMs) return 0;
  return Math.floor((endMs - startMs) / stepMs) + 1;
}

export function getArchiveCoverageForRange(startIso, endIso, options) {
  const cache = ensureCache(options);
  const startMs = Date.parse(startIso);
  const endMs   = Date.parse(endIso);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) {
    return {
      totalExpectedSteps: 0,
      availableSteps: 0,
      missingSteps: 0,
      missingTimestamps: [],
      coverageRatio: 0,
      isContinuous: false
    };
  }

  const stepHours = cache.public.timestepHours;
  if (!Number.isFinite(stepHours) || stepHours <= 0) {
    throw new Error('Cannot evaluate coverage: timestep could not be inferred from archive');
  }
  const stepMs = stepHours * HOUR_MS;

  // Anchor the expected grid to the archive's first timestamp so we evaluate
  // on the same cadence as the archive itself.
  const anchorMs = Date.parse(cache.public.firstTimestamp);
  const firstStepIndex = Math.ceil((startMs - anchorMs) / stepMs);
  const lastStepIndex  = Math.floor((endMs   - anchorMs) / stepMs);
  if (lastStepIndex < firstStepIndex) {
    return {
      totalExpectedSteps: 0,
      availableSteps: 0,
      missingSteps: 0,
      missingTimestamps: [],
      coverageRatio: 0,
      isContinuous: false
    };
  }

  const dataBearingSet = new Set(cache.dataBearingTimestamps);
  const expected = [];
  for (let i = firstStepIndex; i <= lastStepIndex; i++) {
    expected.push(new Date(anchorMs + i * stepMs).toISOString().replace('.000Z', 'Z'));
  }

  const missingTimestamps = expected.filter((ts) => !dataBearingSet.has(ts));
  const totalExpectedSteps = expected.length;
  const availableSteps = totalExpectedSteps - missingTimestamps.length;

  return {
    totalExpectedSteps,
    availableSteps,
    missingSteps: missingTimestamps.length,
    missingTimestamps,
    coverageRatio: totalExpectedSteps === 0 ? 0 : availableSteps / totalExpectedSteps,
    isContinuous: missingTimestamps.length === 0 && totalExpectedSteps > 0
  };
}

export function getUsableTimesteps(startIso, endIso, options) {
  const cache = ensureCache(options);
  const startMs = Date.parse(startIso);
  const endMs   = Date.parse(endIso);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) {
    return [];
  }
  const out = [];
  for (const ts of cache.dataBearingTimestamps) {
    const ms = Date.parse(ts);
    if (ms < startMs || ms > endMs) continue;
    if (getRadarAvailabilityForTimestamp(ts) === RADAR_STATE.OFFLINE) continue;
    out.push(ts);
  }
  return out;
}

export function validateArchiveIntegrity(options) {
  const archiveRoot = options?.archiveRoot || DEFAULT_ARCHIVE_ROOT;
  const metadataDir = path.join(archiveRoot, 'metadata');
  const rasterDir   = path.join(archiveRoot, 'raw_payloads');

  const issues = [];
  if (!existsSync(metadataDir)) issues.push(`Missing metadata dir: ${metadataDir}`);
  if (!existsSync(rasterDir))   issues.push(`Missing raster dir: ${rasterDir}`);
  if (issues.length) return { valid: false, issues };

  const jsonFiles = readdirSync(metadataDir).filter((f) => f.endsWith('.json'));
  const tifFiles  = readdirSync(rasterDir).filter((f) => f.endsWith('.tif'));

  const jsonStems = new Set();
  const malformed = [];
  const seenIso = new Map();
  for (const f of jsonFiles) {
    const stem = f.replace(/\.json$/, '');
    jsonStems.add(stem);
    const iso = filenameToIso(f);
    if (!iso) {
      malformed.push(f);
      continue;
    }
    const prev = seenIso.get(iso);
    if (prev) issues.push(`Duplicate timestamp ${iso}: ${prev}, ${f}`);
    else seenIso.set(iso, f);
  }
  if (malformed.length) issues.push(`Malformed metadata filenames: ${malformed.length}`);

  const tifStems = new Set(tifFiles.map((f) => f.replace(/\.tif$/, '')));
  const jsonOnly = [...jsonStems].filter((s) => !tifStems.has(s));
  const tifOnly  = [...tifStems].filter((s) => !jsonStems.has(s));
  if (jsonOnly.length) issues.push(`Metadata without raster: ${jsonOnly.length}`);
  if (tifOnly.length)  issues.push(`Raster without metadata: ${tifOnly.length}`);

  // Timestep consistency among ALL indexed timestamps. The archive is
  // expected to be evenly cadenced; deviations from the inferred timestep
  // are reported as integrity issues.
  const sortedIso = [...seenIso.keys()].sort();
  const stepHours = inferTimestepHours(sortedIso);
  if (!Number.isFinite(stepHours) || stepHours <= 0) {
    issues.push('Unable to infer a positive timestep from indexed timestamps');
  } else {
    const stepMs = stepHours * HOUR_MS;
    let inconsistentDeltas = 0;
    for (let i = 1; i < sortedIso.length; i++) {
      const delta = Date.parse(sortedIso[i]) - Date.parse(sortedIso[i - 1]);
      if (delta !== stepMs) inconsistentDeltas++;
    }
    if (inconsistentDeltas > 0) {
      issues.push(`Timestep inconsistencies: ${inconsistentDeltas} delta(s) differ from ${stepHours}h`);
    }
  }

  return { valid: issues.length === 0, issues };
}

export const __internal = Object.freeze({
  NODATA_SENTINEL_SHA256,
  DEFAULT_ARCHIVE_ROOT,
  filenameToIso,
  inferTimestepHours
});
