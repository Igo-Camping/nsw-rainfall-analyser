// Cumulative radar rainfall (Lizard NB AOI precipitation rasters).
//
// Reads on-disk DEFLATE-compressed Float32 GeoTIFFs from the validated
// archive and produces point / time-series / polygon cumulative rainfall.
// Strict gating policy: a timestep contributes only when ALL of the
// following are true:
//
//   1. it exists in the archive index
//   2. it is classified as DATA_BEARING (not a sentinel/no-data signature)
//   3. radarAvailability state is NOT 'offline'
//   4. radarAvailability state is NOT 'coverage_gap'
//   5. radarAvailability state is NOT 'unknown'
//   6. the sampled raster value is finite numeric rainfall (not nodata)
//
// Missing, sentinel, offline, coverage_gap, unknown, and per-pixel nodata
// are NEVER substituted with zero — they are accounted for as exclusions
// and surfaced via the returned excluded counts and warnings.
//
// This module is fully isolated. It depends only on Node built-ins
// (fs, zlib, path, url) and on the two read-only modules in this folder
// (radarAvailability.js, radarArchiveIndex.js).

import { readFileSync, existsSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  RADAR_STATE,
  getRadarAvailabilityForTimestamp
} from './radarAvailability.js';
import {
  buildRadarArchiveIndex,
  getDataBearingTimestamps
} from './radarArchiveIndex.js';

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ARCHIVE_ROOT = path.resolve(
  MODULE_DIR, '..', '..', '..',
  'data', 'radar_archive', 'processed', 'lizard_precipitation_australia'
);

// AOI bounds and raster nodata sentinel — set at the source. Mismatches
// against actual TIFF tags are hard-failed in the parser (no silent reinterp).
export const AOI_BBOX = Object.freeze({
  minLon: 151.15, minLat: -33.85,
  maxLon: 151.40, maxLat: -33.55
});
export const NODATA_VALUE = -32767;

// =====================================================================
// Lizard GeoTIFF reader (single-band Float32, DEFLATE, EPSG:4326)
// =====================================================================

const TIFF_TYPE_SIZE = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 11: 4, 12: 8 };

function parseIfd(dv, ifdOffset, little) {
  const num = dv.getUint16(ifdOffset, little);
  const tags = {};
  for (let i = 0; i < num; i++) {
    const e = ifdOffset + 2 + i * 12;
    const tag = dv.getUint16(e, little);
    const type = dv.getUint16(e + 2, little);
    const count = dv.getUint32(e + 4, little);
    const sz = (TIFF_TYPE_SIZE[type] || 0) * count;
    const valOffset = sz > 4 ? dv.getUint32(e + 8, little) : (e + 8);
    tags[tag] = { type, count, valOffset };
  }
  return tags;
}

function readU16(dv, tag, little) {
  return dv.getUint16(tag.valOffset, little);
}
function readU32Array(dv, tag, little) {
  const out = new Uint32Array(tag.count);
  for (let i = 0; i < tag.count; i++) out[i] = dv.getUint32(tag.valOffset + i * 4, little);
  return out;
}
function readF64Array(dv, tag, little) {
  const out = new Float64Array(tag.count);
  for (let i = 0; i < tag.count; i++) out[i] = dv.getFloat64(tag.valOffset + i * 8, little);
  return out;
}

export function parseLizardGeoTiff(buffer) {
  const buf = buffer instanceof Buffer ? buffer : Buffer.from(buffer);
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const order = String.fromCharCode(buf[0], buf[1]);
  const little = order === 'II';
  if (!little && order !== 'MM') throw new Error(`Unrecognised TIFF byte order: ${order}`);
  const version = dv.getUint16(2, little);
  if (version !== 42) throw new Error(`Unsupported TIFF version: ${version} (expected classic TIFF)`);

  const ifdOffset = dv.getUint32(4, little);
  const tags = parseIfd(dv, ifdOffset, little);

  const width  = readU16(dv, tags[256], little);
  const height = readU16(dv, tags[257], little);
  const bps    = readU16(dv, tags[258], little);
  const compression   = readU16(dv, tags[259], little); // 8 = Adobe Deflate
  const samplesPerPixel = readU16(dv, tags[277], little);
  const rowsPerStrip  = readU16(dv, tags[278], little);
  const sampleFormat  = readU16(dv, tags[339], little); // 3 = float
  const predictor = tags[317] ? readU16(dv, tags[317], little) : 1;

  if (bps !== 32 || sampleFormat !== 3) {
    throw new Error(`Unsupported sample format: bps=${bps} fmt=${sampleFormat} (expected 32-bit float)`);
  }
  if (samplesPerPixel !== 1) {
    throw new Error(`Unsupported samples per pixel: ${samplesPerPixel} (expected 1)`);
  }
  if (compression !== 8) {
    throw new Error(`Unsupported compression: ${compression} (expected 8 = DEFLATE)`);
  }
  if (predictor !== 1) {
    throw new Error(`Unsupported TIFF predictor: ${predictor} (expected 1)`);
  }

  const stripOffsets    = readU32Array(dv, tags[273], little);
  const stripByteCounts = readU32Array(dv, tags[279], little);
  const pixelScale = readF64Array(dv, tags[33550], little); // [scaleX, scaleY, scaleZ]
  const tiepoint   = readF64Array(dv, tags[33922], little); // [I, J, K, X, Y, Z]

  const values = new Float32Array(width * height);
  for (let s = 0; s < stripOffsets.length; s++) {
    const compressed = buf.subarray(stripOffsets[s], stripOffsets[s] + stripByteCounts[s]);
    const raw = inflateSync(compressed);
    const f32 = new Float32Array(
      raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength)
    );
    const rowStart = s * rowsPerStrip;
    const rowsInStrip = Math.min(rowsPerStrip, height - rowStart);
    for (let r = 0; r < rowsInStrip; r++) {
      const dstBase = (rowStart + r) * width;
      const srcBase = r * width;
      for (let c = 0; c < width; c++) {
        values[dstBase + c] = f32[srcBase + c];
      }
    }
  }

  // Affine: pixel (col, row) -> (lon, lat)
  // lon = tiepoint.X + (col - tiepoint.I) * scaleX
  // lat = tiepoint.Y - (row - tiepoint.J) * scaleY  (Y decreases as row increases)
  const originLon = tiepoint[3];
  const originLat = tiepoint[4];
  const pxLon = pixelScale[0];
  const pxLat = pixelScale[1];

  return Object.freeze({
    width, height,
    values,
    originLon, originLat,
    pxLon, pxLat,
    nodata: NODATA_VALUE,
    bbox: Object.freeze({
      minLon: originLon,
      maxLon: originLon + width * pxLon,
      maxLat: originLat,
      minLat: originLat - height * pxLat
    })
  });
}

export function sampleAtLonLat(raster, lon, lat) {
  if (lon < raster.bbox.minLon || lon > raster.bbox.maxLon ||
      lat < raster.bbox.minLat || lat > raster.bbox.maxLat) {
    return null;
  }
  const col = Math.floor((lon - raster.originLon) / raster.pxLon);
  const row = Math.floor((raster.originLat - lat) / raster.pxLat);
  if (col < 0 || col >= raster.width || row < 0 || row >= raster.height) return null;
  const v = raster.values[row * raster.width + col];
  if (v === raster.nodata || !Number.isFinite(v)) return null;
  return v;
}

// =====================================================================
// Raster cache (process-local LRU keyed by absolute path)
// =====================================================================

const RASTER_CACHE_LIMIT = 256;
const rasterCache = new Map();

function loadRaster(tifPath) {
  const cached = rasterCache.get(tifPath);
  if (cached) {
    rasterCache.delete(tifPath);
    rasterCache.set(tifPath, cached);
    return cached;
  }
  const raster = parseLizardGeoTiff(readFileSync(tifPath));
  rasterCache.set(tifPath, raster);
  if (rasterCache.size > RASTER_CACHE_LIMIT) {
    const oldest = rasterCache.keys().next().value;
    rasterCache.delete(oldest);
  }
  return raster;
}

export function clearRadarRasterCache() {
  rasterCache.clear();
  dataBearingByRoot.clear();
}

// =====================================================================
// Input + AOI validation
// =====================================================================

function ensureFiniteLonLat(lon, lat) {
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
    throw new TypeError(`lon/lat must be finite numbers (got ${lon}, ${lat})`);
  }
  if (lon < -180 || lon > 180 || lat < -90 || lat > 90) {
    throw new RangeError(`lon/lat out of geographic range: (${lon}, ${lat})`);
  }
}

function ensureIsoRange(startIso, endIso) {
  const startMs = Date.parse(startIso);
  const endMs   = Date.parse(endIso);
  if (!Number.isFinite(startMs)) throw new TypeError(`startIso is not a parseable ISO timestamp: ${startIso}`);
  if (!Number.isFinite(endMs))   throw new TypeError(`endIso is not a parseable ISO timestamp: ${endIso}`);
  if (endMs < startMs)           throw new RangeError(`endIso (${endIso}) is before startIso (${startIso})`);
  return { startMs, endMs };
}

function ensureWithinAoi(lon, lat) {
  if (lon < AOI_BBOX.minLon || lon > AOI_BBOX.maxLon ||
      lat < AOI_BBOX.minLat || lat > AOI_BBOX.maxLat) {
    throw new RangeError(
      `Point (${lon}, ${lat}) is outside the radar AOI ` +
      `[${AOI_BBOX.minLon}, ${AOI_BBOX.minLat}, ${AOI_BBOX.maxLon}, ${AOI_BBOX.maxLat}]`
    );
  }
}

// =====================================================================
// Per-step gating
// =====================================================================

const dataBearingByRoot = new Map();
function dataBearingSet(archiveRoot) {
  let s = dataBearingByRoot.get(archiveRoot);
  if (!s) {
    s = new Set(getDataBearingTimestamps({ archiveRoot }));
    dataBearingByRoot.set(archiveRoot, s);
  }
  return s;
}

function classifyStep(ts, archiveRoot) {
  const availability = getRadarAvailabilityForTimestamp(ts);
  if (availability === RADAR_STATE.OFFLINE)      return 'offline';
  if (availability === RADAR_STATE.COVERAGE_GAP) return 'coverage_gap';
  if (availability === RADAR_STATE.UNKNOWN)      return 'unknown';
  if (!dataBearingSet(archiveRoot).has(ts))      return 'missing';
  return 'data';
}

function expectedTimestepsForRange(startMs, endMs, archiveRoot) {
  const idx = buildRadarArchiveIndex({ archiveRoot });
  const stepHours = idx.timestepHours;
  if (!Number.isFinite(stepHours) || stepHours <= 0) {
    throw new Error('Cannot compute rainfall: archive timestep could not be inferred');
  }
  const stepMs = stepHours * 3600 * 1000;
  const anchorMs = Date.parse(idx.firstTimestamp);
  const firstStepIndex = Math.ceil((startMs - anchorMs) / stepMs);
  const lastStepIndex  = Math.floor((endMs   - anchorMs) / stepMs);
  const out = [];
  for (let i = firstStepIndex; i <= lastStepIndex; i++) {
    out.push(new Date(anchorMs + i * stepMs).toISOString().replace('.000Z', 'Z'));
  }
  return out;
}

function tsToTifPath(ts, archiveRoot) {
  const stamp = ts.replace(/[-:]/g, ''); // 2024-09-01T00:00:00Z -> 20240901T000000Z
  return path.join(archiveRoot, 'raw_payloads', `${stamp}_lizard_precipitation_australia.tif`);
}

function emptyExclusions() {
  return {
    offline: 0,
    coverage_gap: 0,
    unknown: 0,
    sentinel_or_missing: 0,
    nodata_at_point: 0
  };
}

const WARNING_BY_STATUS = Object.freeze({
  offline:          'range overlaps confirmed-offline period',
  coverage_gap:     'range overlaps historical source coverage gap',
  unknown:          'range extends outside the validated archive',
  missing:          'range contains sentinel/no-data or missing frames',
  no_data_at_point: 'point/polygon falls on nodata pixels in some frames'
});

// =====================================================================
// Public: time series at a point
// =====================================================================

export function getRainfallTimeSeriesAtPoint(options = {}) {
  const { lon, lat, startIso, endIso, archiveRoot = DEFAULT_ARCHIVE_ROOT } = options;
  ensureFiniteLonLat(lon, lat);
  ensureWithinAoi(lon, lat);
  const { startMs, endMs } = ensureIsoRange(startIso, endIso);

  const expected = expectedTimestepsForRange(startMs, endMs, archiveRoot);
  const out = [];
  for (const ts of expected) {
    const status = classifyStep(ts, archiveRoot);
    if (status !== 'data') {
      out.push({ ts, valueMm: null, status });
      continue;
    }
    const tifPath = tsToTifPath(ts, archiveRoot);
    if (!existsSync(tifPath)) {
      out.push({ ts, valueMm: null, status: 'missing' });
      continue;
    }
    const v = sampleAtLonLat(loadRaster(tifPath), lon, lat);
    if (v == null) {
      out.push({ ts, valueMm: null, status: 'no_data_at_point' });
    } else {
      out.push({ ts, valueMm: v, status: 'data' });
    }
  }
  return out;
}

// =====================================================================
// Public: cumulative rainfall at a point
// =====================================================================

export function getCumulativeRainfallAtPoint(options = {}) {
  const series = getRainfallTimeSeriesAtPoint(options);
  const excluded = emptyExclusions();
  const warnings = new Set();
  let total = 0;
  let contributing = 0;
  for (const s of series) {
    switch (s.status) {
      case 'data':
        total += s.valueMm; contributing++; break;
      case 'offline':
        excluded.offline++; warnings.add(WARNING_BY_STATUS.offline); break;
      case 'coverage_gap':
        excluded.coverage_gap++; warnings.add(WARNING_BY_STATUS.coverage_gap); break;
      case 'unknown':
        excluded.unknown++; warnings.add(WARNING_BY_STATUS.unknown); break;
      case 'missing':
        excluded.sentinel_or_missing++; warnings.add(WARNING_BY_STATUS.missing); break;
      case 'no_data_at_point':
        excluded.nodata_at_point++; warnings.add(WARNING_BY_STATUS.no_data_at_point); break;
    }
  }
  return {
    totalMm: contributing > 0 ? total : null,
    contributingSteps: contributing,
    expectedSteps: series.length,
    excludedSteps: excluded,
    warnings: [...warnings]
  };
}

// =====================================================================
// Public: combined summary
// =====================================================================

export function getRainfallComputationSummary(options = {}) {
  const cum = getCumulativeRainfallAtPoint(options);
  const isComplete = cum.contributingSteps === cum.expectedSteps && cum.expectedSteps > 0;
  return {
    startIso: options.startIso,
    endIso:   options.endIso,
    expectedSteps: cum.expectedSteps,
    contributingSteps: cum.contributingSteps,
    excludedSteps: cum.excludedSteps,
    totalMm: cum.totalMm,
    coverageRatio: cum.expectedSteps === 0 ? 0 : cum.contributingSteps / cum.expectedSteps,
    isComplete,
    warnings: cum.warnings
  };
}

// =====================================================================
// Public: cumulative rainfall over a polygon
// =====================================================================

function pointInPolygon(lon, lat, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0], yi = polygon[i][1];
    const xj = polygon[j][0], yj = polygon[j][1];
    const denom = (yj - yi) || 1e-30;
    const intersect = ((yi > lat) !== (yj > lat)) &&
      (lon < (xj - xi) * (lat - yi) / denom + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function pixelMaskForPolygon(polygon, raster) {
  const mask = [];
  let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
  for (const [lon, lat] of polygon) {
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
  if (maxLon < raster.bbox.minLon || minLon > raster.bbox.maxLon ||
      maxLat < raster.bbox.minLat || minLat > raster.bbox.maxLat) {
    return mask;
  }
  const colMin = Math.max(0, Math.floor((minLon - raster.originLon) / raster.pxLon));
  const colMax = Math.min(raster.width - 1,  Math.floor((maxLon - raster.originLon) / raster.pxLon));
  const rowMin = Math.max(0, Math.floor((raster.originLat - maxLat) / raster.pxLat));
  const rowMax = Math.min(raster.height - 1, Math.floor((raster.originLat - minLat) / raster.pxLat));
  for (let r = rowMin; r <= rowMax; r++) {
    const lat = raster.originLat - (r + 0.5) * raster.pxLat;
    for (let c = colMin; c <= colMax; c++) {
      const lon = raster.originLon + (c + 0.5) * raster.pxLon;
      if (pointInPolygon(lon, lat, polygon)) {
        mask.push(r * raster.width + c);
      }
    }
  }
  return mask;
}

export function getCumulativeRainfallForPolygon(options = {}) {
  const { polygon, startIso, endIso, archiveRoot = DEFAULT_ARCHIVE_ROOT } = options;
  if (!Array.isArray(polygon) || polygon.length < 3) {
    throw new TypeError('polygon must be an array of at least 3 [lon, lat] vertices');
  }
  for (const v of polygon) {
    if (!Array.isArray(v) || v.length < 2) {
      throw new TypeError('polygon vertices must be [lon, lat] pairs');
    }
    ensureFiniteLonLat(v[0], v[1]);
  }
  const { startMs, endMs } = ensureIsoRange(startIso, endIso);

  const expected = expectedTimestepsForRange(startMs, endMs, archiveRoot);
  const excluded = emptyExclusions();
  const warnings = new Set();

  let cumulativeMeanMm = 0;
  let contributingSteps = 0;
  let mask = null;
  let pixelCount = 0;

  for (const ts of expected) {
    const status = classifyStep(ts, archiveRoot);
    if (status !== 'data') {
      switch (status) {
        case 'offline':      excluded.offline++; warnings.add(WARNING_BY_STATUS.offline); break;
        case 'coverage_gap': excluded.coverage_gap++; warnings.add(WARNING_BY_STATUS.coverage_gap); break;
        case 'unknown':      excluded.unknown++; warnings.add(WARNING_BY_STATUS.unknown); break;
        case 'missing':      excluded.sentinel_or_missing++; warnings.add(WARNING_BY_STATUS.missing); break;
      }
      continue;
    }
    const tifPath = tsToTifPath(ts, archiveRoot);
    if (!existsSync(tifPath)) {
      excluded.sentinel_or_missing++;
      warnings.add(WARNING_BY_STATUS.missing);
      continue;
    }
    const raster = loadRaster(tifPath);
    if (mask === null) {
      mask = pixelMaskForPolygon(polygon, raster);
      pixelCount = mask.length;
      if (pixelCount === 0) {
        throw new RangeError('Polygon does not overlap any raster pixel inside the AOI');
      }
    }
    let validSum = 0;
    let validCount = 0;
    for (const idx of mask) {
      const v = raster.values[idx];
      if (v === raster.nodata || !Number.isFinite(v)) continue;
      validSum += v;
      validCount++;
    }
    if (validCount === 0) {
      excluded.nodata_at_point++;
      warnings.add(WARNING_BY_STATUS.no_data_at_point);
      continue;
    }
    cumulativeMeanMm += validSum / validCount;
    contributingSteps++;
  }

  return {
    meanMm: contributingSteps > 0 ? cumulativeMeanMm : null,
    contributingSteps,
    expectedSteps: expected.length,
    pixelCount,
    excludedSteps: excluded,
    warnings: [...warnings]
  };
}
