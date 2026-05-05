/* Stormgrid v0 — static rainfall fetcher.
   Fetches the locally-built JSON produced by
   scripts/build_stormgrid_static_rainfall.py. Returns null on any
   failure so the UI can show a clear "no data available" state.

   This module never reads GeoTIFFs, never imports radar/station code,
   and never invents rainfall values. */

const DATA_URL = './data/catchment_rainfall_latest.json';

let cached = null;
let inflight = null;

export async function loadStaticRainfall(url = DATA_URL) {
  if (cached) return cached;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const r = await fetch(url, { cache: 'no-store' });
      if (!r.ok) {
        return { ok: false, status: r.status, error: `HTTP ${r.status}`, data: null, sizeBytes: 0 };
      }
      const text = await r.text();
      const data = JSON.parse(text);
      cached = { ok: true, status: 200, error: null, data, sizeBytes: text.length };
      return cached;
    } catch (err) {
      return { ok: false, status: 0, error: String(err && err.message || err), data: null, sizeBytes: 0 };
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export function clearRainfallCache() {
  cached = null;
  inflight = null;
}

export function getCatchmentSeries(data, catchmentId) {
  if (!data || !data.catchments) return null;
  return data.catchments[catchmentId] || null;
}

/* Aggregate stats over the trailing N hours of the window.
   Uses the source's interval_hours (Lizard = 3h) to choose the trailing
   number of frames. Returns nulls if no valid frames in the window. */
export function aggregateTrailing(data, catchmentId, hours) {
  const c = getCatchmentSeries(data, catchmentId);
  if (!c) return null;
  const intervalH = (data.source && data.source.interval_hours) || 3;
  const frameCount = data.frames ? data.frames.length : 0;
  if (frameCount === 0) return null;
  const wantFrames = Math.max(1, Math.ceil(hours / intervalH));
  const start = Math.max(0, frameCount - wantFrames);
  const slice = (arr) => (arr || []).slice(start);

  const means     = slice(c.stats.mean).filter((v) => v !== null && Number.isFinite(v));
  const mins      = slice(c.stats.min).filter((v) => v !== null && Number.isFinite(v));
  const maxes     = slice(c.stats.max).filter((v) => v !== null && Number.isFinite(v));
  const medians   = slice(c.stats.median).filter((v) => v !== null && Number.isFinite(v));
  const coverages = slice(c.stats.coverage).filter((v) => v !== null && Number.isFinite(v));

  if (means.length === 0) {
    return {
      windowHours: wantFrames * intervalH,
      framesCovered: 0,
      framesRequested: wantFrames,
      total: null, mean: null, min: null, max: null, median: null, coverageMean: null,
    };
  }
  const sum = (a) => a.reduce((s, v) => s + v, 0);
  return {
    windowHours: wantFrames * intervalH,
    framesCovered: means.length,
    framesRequested: wantFrames,
    total:        round4(sum(means)),
    mean:         round4(sum(means)   / means.length),
    min:          round4(Math.min(...mins)),
    max:          round4(Math.max(...maxes)),
    median:       round4(sum(medians) / medians.length),
    coverageMean: round4(sum(coverages) / coverages.length),
  };
}

function round4(n) {
  return Math.round(n * 10000) / 10000;
}
