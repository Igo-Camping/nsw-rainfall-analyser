// Radar archive index layer.
//
// Source of truth: data/radar_archive/processed/lizard_precipitation_australia/
//   metadata/    *.json   (per-timestep metadata — used here, never .tif)
//   raw_payloads/*.tif    (referenced only for 1:1 parity check)
//
// Filename convention: YYYYMMDDTHHMMSSZ_lizard_precipitation_australia.{json,tif}
//
// =====================================================================
// Sentinel / no-data classification
// =====================================================================
//
// Some timesteps in the archive are no-data sentinel responses written
// when the upstream Lizard raster source returned an empty raster for the
// AOI (for example, throughout the historical pre-2022 source-coverage
// gap and the 2024-09 / 2024-10 confirmed radar outage). These must be
// treated as MISSING, never as zero rainfall.
//
// Classification is purely deterministic — exact SHA256 (and byte-size)
// match against an audited registry of known-empty GeoTIFF signatures.
// No file-size heuristics, no fuzzy matching, no pixel decoding.
//
// The registry below was proved by full-archive audit (24,744 frames;
// 7,679 distinct sha256). The single recurring sha that:
//   * never appears in any data-rich month, and
//   * accounts for all 2024-09 / 2024-10 outage frames, and
//   * accounts for the entire 2017-12 .. 2022-04 source-coverage gap,
// was promoted to a sentinel. Other recurring sha256 values appear
// across normal operational months and are NOT promoted — without an
// authoritative metadata flag we conservatively treat them as data-bearing.
//
// To add a new sentinel, prove it via the same audit and append a frozen
// entry to NODATA_SENTINELS below.
//
// This module is fully isolated. It depends only on Node built-ins and on
// radarAvailability.js (read-only).

import { readdirSync, readFileSync, existsSync } from 'node:fs';
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
const HOUR_MS = 3600 * 1000;

// Audited sentinel registry. Each entry MUST specify both sha256 AND the
// exact byte size of the matching GeoTIFF — a sha256 match with an
// unexpected byte size is treated as a signature mismatch (validation
// failure), not as a sentinel.
export const SENTINEL_LIZARD_NB_AOI_EMPTY_V1 = Object.freeze({
  id: 'lizard_nb_aoi_empty_v1',
  sha256: 'f6e3d73671ad6b6827c502d269be2ff86e62e857dfa0f755378f0bb29b8a0ef1',
  bytes: 1774,
  raster_uuid: '1b6c03df-2ad1-4f17-89f6-319ea797b357',
  bbox: [151.15, -33.85, 151.4, -33.55],
  description:
    'Empty / all-nodata GeoTIFF returned by the Lizard Northern-Beaches AOI ' +
    'precipitation rastersource. Observed across the 2017-12..2022-04 source ' +
    'coverage gap and the 2024-09..2024-10 confirmed radar outage. Bit-identical ' +
    'across 14,298 occurrences in the validated archive.'
});

export const NODATA_SENTINELS = Object.freeze([
  SENTINEL_LIZARD_NB_AOI_EMPTY_V1
]);

const SENTINEL_BY_SHA = new Map(NODATA_SENTINELS.map((s) => [s.sha256, s]));

export const CLASSIFICATION = Object.freeze({
  DATA_BEARING:    'data_bearing',         // sha256 present, not in sentinel registry
  SENTINEL_SHA256: 'sentinel_sha256',      // exact sha256 + bytes match in registry
  UNCLASSIFIABLE:  'unclassifiable'        // metadata missing/corrupt/contradictory
});

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

// Pure classifier: given a parsed metadata blob (or null), return the
// classification + reason. No I/O.
export function classifyMetadata(meta) {
  if (!meta || typeof meta !== 'object') {
    return { classification: CLASSIFICATION.UNCLASSIFIABLE, reason: 'metadata missing or not an object' };
  }
  const sha = meta.sha256;
  const bytes = meta.response_bytes;
  if (typeof sha !== 'string' || sha.length !== 64 || !/^[0-9a-f]{64}$/.test(sha)) {
    return { classification: CLASSIFICATION.UNCLASSIFIABLE, reason: 'sha256 missing or malformed' };
  }
  if (!Number.isFinite(bytes)) {
    return { classification: CLASSIFICATION.UNCLASSIFIABLE, reason: 'response_bytes missing or not a number' };
  }
  const sentinel = SENTINEL_BY_SHA.get(sha);
  if (sentinel) {
    if (bytes !== sentinel.bytes) {
      return {
        classification: CLASSIFICATION.UNCLASSIFIABLE,
        reason: `sentinel sha256 ${sha.slice(0, 12)}… matched but byte size ${bytes} != registry ${sentinel.bytes}`
      };
    }
    return { classification: CLASSIFICATION.SENTINEL_SHA256, sentinelId: sentinel.id };
  }
  return { classification: CLASSIFICATION.DATA_BEARING };
}

function readEntries(metadataDir) {
  const files = readdirSync(metadataDir).filter((f) => f.endsWith('.json'));
  const entries = [];
  for (const f of files) {
    const iso = filenameToIso(f);
    if (!iso) {
      entries.push({
        filename: f,
        iso: null,
        sha256: null,
        bytes: null,
        classification: CLASSIFICATION.UNCLASSIFIABLE,
        reason: 'filename does not match expected pattern'
      });
      continue;
    }
    let meta = null;
    let parseError = null;
    try {
      meta = JSON.parse(readFileSync(path.join(metadataDir, f), 'utf8'));
    } catch (err) {
      parseError = err.message;
    }
    let result;
    if (parseError) {
      result = { classification: CLASSIFICATION.UNCLASSIFIABLE, reason: `JSON parse error: ${parseError}` };
    } else {
      result = classifyMetadata(meta);
    }
    entries.push({
      filename: f,
      iso,
      sha256: meta?.sha256 ?? null,
      bytes: Number.isFinite(meta?.response_bytes) ? meta.response_bytes : null,
      classification: result.classification,
      sentinelId: result.sentinelId,
      reason: result.reason
    });
  }
  entries.sort((a, b) => {
    const ai = a.iso || '';
    const bi = b.iso || '';
    if (ai < bi) return -1;
    if (ai > bi) return 1;
    return 0;
  });
  return entries;
}

function tallyClassificationCounts(entries) {
  const counts = {
    [CLASSIFICATION.DATA_BEARING]: 0,
    [CLASSIFICATION.SENTINEL_SHA256]: 0,
    [CLASSIFICATION.UNCLASSIFIABLE]: 0,
    total: entries.length
  };
  for (const e of entries) counts[e.classification]++;
  return counts;
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
  const timestamps = entries.filter((e) => e.iso).map((e) => e.iso);
  const dataBearingTimestamps = entries
    .filter((e) => e.classification === CLASSIFICATION.DATA_BEARING && e.iso)
    .map((e) => e.iso);
  const classificationCounts = tallyClassificationCounts(entries);
  const timestepHours = inferTimestepHours(timestamps);

  const publicIndex = {
    timestamps,
    firstTimestamp: timestamps[0] ?? null,
    lastTimestamp:  timestamps[timestamps.length - 1] ?? null,
    timestepHours,
    classificationCounts: { ...classificationCounts }
  };

  cachedIndex = {
    public: publicIndex,
    entries,
    dataBearingTimestamps,
    classificationCounts,
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

export function getClassificationMethodCounts(options) {
  return { ...ensureCache(options).classificationCounts };
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

  // Build (or reuse) the index so we can audit classifications too.
  let cache;
  if (cachedIndex && cachedRoot === archiveRoot) {
    cache = cachedIndex;
  } else {
    buildRadarArchiveIndex({ archiveRoot, force: true });
    cache = cachedIndex;
  }

  const jsonFiles = readdirSync(metadataDir).filter((f) => f.endsWith('.json'));
  const tifFiles  = readdirSync(rasterDir).filter((f) => f.endsWith('.tif'));

  const jsonStems = new Set(jsonFiles.map((f) => f.replace(/\.json$/, '')));
  const tifStems  = new Set(tifFiles.map((f) => f.replace(/\.tif$/, '')));
  const jsonOnly = [...jsonStems].filter((s) => !tifStems.has(s));
  const tifOnly  = [...tifStems].filter((s) => !jsonStems.has(s));
  if (jsonOnly.length) issues.push(`Metadata without raster: ${jsonOnly.length}`);
  if (tifOnly.length)  issues.push(`Raster without metadata: ${tifOnly.length}`);

  // Duplicate / malformed timestamp checks.
  const seenIso = new Map();
  let malformedFilenames = 0;
  const unclassifiable = [];
  for (const e of cache.entries) {
    if (!e.iso) {
      malformedFilenames++;
    } else {
      const prev = seenIso.get(e.iso);
      if (prev) issues.push(`Duplicate timestamp ${e.iso}: ${prev}, ${e.filename}`);
      else seenIso.set(e.iso, e.filename);
    }
    if (e.classification === CLASSIFICATION.UNCLASSIFIABLE) {
      unclassifiable.push({ file: e.filename, reason: e.reason });
    }
  }
  if (malformedFilenames > 0) issues.push(`Malformed metadata filenames: ${malformedFilenames}`);

  if (unclassifiable.length > 0) {
    const sample = unclassifiable.slice(0, 5).map((u) => `${u.file} (${u.reason})`).join('; ');
    issues.push(`Unclassifiable frames: ${unclassifiable.length}${unclassifiable.length > 5 ? ` (e.g. ${sample})` : ` (${sample})`}`);
  }

  // Timestep consistency among ALL parseable timestamps.
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

  return {
    valid: issues.length === 0,
    issues,
    classificationCounts: { ...cache.classificationCounts }
  };
}

export const __internal = Object.freeze({
  DEFAULT_ARCHIVE_ROOT,
  filenameToIso,
  inferTimestepHours
});
