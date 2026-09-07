// BoM radar — static PNG overlay loop.
//
// Replaces the prior tile-based implementation, which hit BoM's
// "Zoom Level Not Supported" error PNG outside the tile service's narrow
// valid zoom range. Static PNGs are full-extent, fixed-bounds overlays —
// no zoom restriction.
//
// IDR product code convention (trailing digit = range):
//   IDR<NN>1 = 512 km   IDR<NN>2 = 256 km
//   IDR<NN>3 = 128 km   IDR<NN>4 = 64 km
// The site is chosen per selected LGA (nearest verified site to the LGA's
// centroid, 128 km product), except that an LGA lying wholly inside Terrey
// Hills' 64 km range keeps IDR714 (~0.25 km/pixel) for the NBC stormwater focus.
// Terrey Hills IDR714 is also the last-resort fallback when no LGA resolves.
//
// PNG URL pattern (HTTPS, verified live 2026-05-28, re-verified by browser 2026-09-07):
//   https://www.bom.gov.au/radar/<IDR>.T.<YYYYMMDDHHMM>.png
//   timestamp is UTC. Frames are published at minutes ending in 4 or 9
//   (verified across all NSW sites on BoM's FTP mirror, 2026-09-07), i.e.
//   one minute before each round 5-minute boundary. Discovery probes only
//   those stamps. BoM's edge returns 403 to HEAD and rate-limits bursts
//   (a few hundred requests in a minute blocked a browser for ~5 min), so
//   probes are plain GETs via <img>, and a rediscover pass looks at no more
//   than the last three candidate stamps.
//
// Bounds are computed from radar site centre + range (azimuthal equidistant
// approximated as a lat/lng rectangle). At Sydney's latitude over 256 km
// the edge misregistration is small single-digit km — acceptable for v1.
// Refinement path: pixel-match against IDR712.background.png.

const BOM_RADAR_HOST = 'https://www.bom.gov.au';
const BOM_RADAR_PATH = '/radar/';
const DEFAULT_BOM_PANE = 'atmos-radar-pane';

const DEFAULT_CADENCE_MINUTES = 5; // frames land at minutes ending in 4 or 9
const DEFAULT_HISTORY_HORIZON_MINUTES = 90;
const MAX_REDISCOVER_CANDIDATES = 3;  // rate-limit guard: newest stamps only on refresh
const MIN_FRAMES_FOR_ANIMATION = 2;
const DEFAULT_FRAME_COUNT = 10;
const DEFAULT_FRAME_INTERVAL_MS = 500;
const DEFAULT_LOOP_PAUSE_MS = 1000;
const DEFAULT_REDISCOVER_INTERVAL_MS = 5 * 60 * 1000;
const DEFAULT_PRELOAD_TIMEOUT_MS = 8000;
const DEFAULT_OPACITY = 0.6;

// NSW/ACT BoM radar sites. Coordinates from BoM's NSW radar info page and
// NSW/ACT sites table; frames_verified = the 128 km product was seen serving
// frames on www.bom.gov.au/radar/ by browser at 06:14Z on 2026-09-07.
//   55 Wagga Wagga: on the FTP mirror but not seen on HTTPS in a 20-minute
//      window; FTP wrote 10 stamps 04:59-05:44Z then nothing for an hour.
//   03 Wollongong (Appin): no frames anywhere (IDR034 last wrote Oct 2021).
// Nearest-site selection considers verified sites only.
export const BOM_RADAR_SITES = Object.freeze([
  { site: '04', name: 'Newcastle',          lat: -32.730,  lon: 152.027,  frames_verified: true  },
  { site: '28', name: 'Grafton',            lat: -29.62,   lon: 152.97,   frames_verified: true  },
  { site: '40', name: 'Canberra',           lat: -35.66,   lon: 149.51,   frames_verified: true  },
  { site: '53', name: 'Moree',              lat: -29.50,   lon: 149.85,   frames_verified: true  },
  { site: '69', name: 'Namoi',              lat: -31.0240, lon: 150.1915, frames_verified: true  },
  { site: '71', name: 'Terrey Hills',       lat: -33.701,  lon: 151.210,  frames_verified: true  },
  { site: '93', name: 'Brewarrina',         lat: -29.96,   lon: 146.81,   frames_verified: true  },
  { site: '94', name: 'Hillston',           lat: -33.55,   lon: 145.52,   frames_verified: true  },
  { site: '96', name: 'Yeoval',             lat: -32.74,   lon: 148.70,   frames_verified: true  },
  { site: '55', name: 'Wagga Wagga',        lat: -35.17,   lon: 147.47,   frames_verified: false },
  { site: '03', name: 'Wollongong (Appin)', lat: -34.264,  lon: 150.874,  frames_verified: false }
]);

const TERREY_HILLS = BOM_RADAR_SITES.find((s) => s.site === '71');
const TERREY_HILLS_LAT = TERREY_HILLS.lat;
const TERREY_HILLS_LON = TERREY_HILLS.lon;
const TERREY_HILLS_64KM_IDR = 'IDR714';
const FALLBACK_IDR = TERREY_HILLS_64KM_IDR;   // last resort only, when no LGA resolves

const RANGE_KM_BY_IDR_SUFFIX = { '1': 512, '2': 256, '3': 128, '4': 64 };

function rangeKmForIdr(idr) {
  const suffix = String(idr).slice(-1);
  return RANGE_KM_BY_IDR_SUFFIX[suffix] || 256;
}

function computeRectangularBoundsKm(centerLat, centerLon, rangeKm) {
  const latDelta = rangeKm / 111.32;
  const lonDelta = rangeKm / (111.32 * Math.cos((centerLat * Math.PI) / 180));
  return [
    [centerLat - latDelta, centerLon - lonDelta],
    [centerLat + latDelta, centerLon + lonDelta]
  ];
}

const DEFAULT_BOUNDS = computeRectangularBoundsKm(
  TERREY_HILLS_LAT,
  TERREY_HILLS_LON,
  rangeKmForIdr(FALLBACK_IDR)
);

export function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Pick the radar product for an LGA extent { south, west, north, east } (degrees),
// or a point { lat, lon }. Rules:
//   1. The extent lies wholly within 64 km of Terrey Hills -> IDR714 (64 km).
//   2. Otherwise the nearest frames_verified site to the centroid -> its 128 km product.
//   3. No usable input -> Terrey Hills IDR714 (fallback).
export function selectRadarSite(extent, sites = BOM_RADAR_SITES) {
  const hasExtent = extent && ['south', 'west', 'north', 'east'].every((k) => Number.isFinite(extent[k]));
  const hasPoint = extent && Number.isFinite(extent.lat) && Number.isFinite(extent.lon);
  const describe = (site, idr, distanceKm, rule) => ({
    site: site.site, name: site.name, lat: site.lat, lon: site.lon, idr,
    rangeKm: rangeKmForIdr(idr), distanceKm, rule,
    bounds: computeRectangularBoundsKm(site.lat, site.lon, rangeKmForIdr(idr))
  });
  if (!hasExtent && !hasPoint) return describe(TERREY_HILLS, FALLBACK_IDR, null, 'fallback');

  const centroid = hasExtent
    ? { lat: (extent.south + extent.north) / 2, lon: (extent.west + extent.east) / 2 }
    : { lat: extent.lat, lon: extent.lon };

  if (hasExtent) {
    const corners = [
      [extent.south, extent.west], [extent.south, extent.east],
      [extent.north, extent.west], [extent.north, extent.east]
    ];
    const farthest = Math.max(...corners.map(([la, lo]) => haversineKm(la, lo, TERREY_HILLS_LAT, TERREY_HILLS_LON)));
    if (farthest <= rangeKmForIdr(TERREY_HILLS_64KM_IDR)) {
      return describe(TERREY_HILLS, TERREY_HILLS_64KM_IDR,
        haversineKm(centroid.lat, centroid.lon, TERREY_HILLS_LAT, TERREY_HILLS_LON), 'inside-terrey-hills-64km');
    }
  }

  let best = null, bestKm = Infinity;
  for (const site of sites) {
    if (!site.frames_verified) continue;
    const km = haversineKm(centroid.lat, centroid.lon, site.lat, site.lon);
    if (km < bestKm) { best = site; bestKm = km; }
  }
  // 128 km product when the whole extent is within its range; otherwise the 256 km product.
  const reachKm = hasExtent
    ? Math.max(...[
        [extent.south, extent.west], [extent.south, extent.east],
        [extent.north, extent.west], [extent.north, extent.east]
      ].map(([la, lo]) => haversineKm(la, lo, best.lat, best.lon)))
    : bestKm;
  const within128 = reachKm <= RANGE_KM_BY_IDR_SUFFIX['3'];
  const result = describe(best, `IDR${best.site}${within128 ? '3' : '2'}`, bestKm,
    within128 ? 'nearest-verified-128km' : 'nearest-verified-256km');
  result.reachKm = reachKm;
  return result;
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function formatUtcTimestamp(date) {
  return (
    date.getUTCFullYear().toString() +
    pad2(date.getUTCMonth() + 1) +
    pad2(date.getUTCDate()) +
    pad2(date.getUTCHours()) +
    pad2(date.getUTCMinutes())
  );
}

function buildFrameUrl(idr, timestampStr) {
  return `${BOM_RADAR_HOST}${BOM_RADAR_PATH}${idr}.T.${timestampStr}.png`;
}

function probeFrameUrl(url, timeoutMs) {
  return new Promise((resolve) => {
    const img = new Image();
    let settled = false;
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      img.onload = null;
      img.onerror = null;
      resolve(ok);
    };
    const timer = setTimeout(() => finish(false), timeoutMs);
    img.onload = () => { clearTimeout(timer); finish(true); };
    img.onerror = () => { clearTimeout(timer); finish(false); };
    img.src = url;
  });
}

// Candidate frame stamps, newest first: UTC minutes ending in 4 or 9 at or
// before `now`, at most `limit` of them.
export function candidateFrameStamps(now = Date.now(), limit = 1) {
  const minuteMs = 60 * 1000;
  let t = Math.floor(now / minuteMs) * minuteMs;
  while (new Date(t).getUTCMinutes() % 5 !== 4) t -= minuteMs;   // back to a 4 or 9
  const out = [];
  for (let i = 0; i < limit; i++) out.push(new Date(t - i * 5 * minuteMs));
  return out;
}

export async function fetchRecentBomFrames({
  idr = FALLBACK_IDR,
  count = DEFAULT_FRAME_COUNT,
  now = Date.now(),
  probeTimeoutMs = DEFAULT_PRELOAD_TIMEOUT_MS,
  historyMinutes = DEFAULT_HISTORY_HORIZON_MINUTES,
  // Cap on stamps probed in this pass. Initial discovery walks the history
  // horizon; a rediscover pass passes MAX_REDISCOVER_CANDIDATES.
  maxCandidates = null,
  skipUrls = null,
  cadenceMinutes = DEFAULT_CADENCE_MINUTES // eslint-disable-line no-unused-vars
} = {}) {
  void cadenceMinutes;
  const limit = maxCandidates || Math.ceil(historyMinutes / 5);
  const frames = [];

  for (const ts of candidateFrameStamps(now, limit)) {
    if (frames.length >= count) break;
    const url = buildFrameUrl(idr, formatUtcTimestamp(ts));
    if (skipUrls && skipUrls.has(url)) continue;   // already held; no request
    const ok = await probeFrameUrl(url, probeTimeoutMs);
    if (ok) frames.push({ timestamp: ts, url });
  }

  if (skipUrls) {
    // Rediscover pass: new frames only; the caller merges with what it holds.
    frames.sort((a, b) => a.timestamp - b.timestamp);
    return frames;
  }

  if (frames.length < MIN_FRAMES_FOR_ANIMATION) {
    throw new Error(
      `Too few BoM radar frames available (${frames.length}); ` +
      `animation requires at least ${MIN_FRAMES_FOR_ANIMATION}`
    );
  }

  frames.sort((a, b) => a.timestamp - b.timestamp);
  console.info('[Atmos radar] discovered frames:', frames.map((f) => f.url));
  return frames;
}

export function preloadFrames(frames, perFrameTimeoutMs = DEFAULT_PRELOAD_TIMEOUT_MS) {
  return Promise.all(frames.map((f) => new Promise((resolve, reject) => {
    const img = new Image();
    const timer = setTimeout(() => reject(new Error(`Preload timeout: ${f.url}`)), perFrameTimeoutMs);
    img.onload = () => { clearTimeout(timer); resolve(img); };
    img.onerror = () => { clearTimeout(timer); reject(new Error(`Preload failed: ${f.url}`)); };
    img.src = f.url;
  })));
}

export function createBomStaticRadarLayer({
  map,
  pane = DEFAULT_BOM_PANE,
  opacity = DEFAULT_OPACITY,
  idr = FALLBACK_IDR,
  bounds = null,
  cadenceMinutes = DEFAULT_CADENCE_MINUTES,
  frameCount = DEFAULT_FRAME_COUNT,
  onFrameChange = null
} = {}) {
  if (!map) {
    throw new Error('createBomStaticRadarLayer: map is required');
  }

  const effectiveBounds = bounds
    || computeRectangularBoundsKm(TERREY_HILLS_LAT, TERREY_HILLS_LON, rangeKmForIdr(idr));

  let overlay = null;
  let frames = [];
  let currentIdx = 0;
  let advanceHandle = null;
  let rediscoverHandle = null;
  let stopped = false;
  let currentOpacity = opacity;

  function notifyFrame() {
    if (!onFrameChange || !frames.length) return;
    try { onFrameChange(frames[currentIdx]); } catch (err) {
      console.warn('[Atmos radar] onFrameChange threw:', err);
    }
  }

  function showFrame(idx) {
    if (!frames.length || !overlay) return;
    const wrapped = ((idx % frames.length) + frames.length) % frames.length;
    currentIdx = wrapped;
    overlay.setUrl(frames[wrapped].url);
    notifyFrame();
  }

  function clearAdvanceHandle() {
    if (advanceHandle !== null) {
      clearTimeout(advanceHandle);
      clearInterval(advanceHandle);
      advanceHandle = null;
    }
  }

  function scheduleAdvance() {
    if (stopped || !frames.length) return;
    clearAdvanceHandle();
    advanceHandle = setInterval(() => {
      if (stopped) return;
      const next = currentIdx + 1;
      if (next >= frames.length) {
        clearAdvanceHandle();
        advanceHandle = setTimeout(() => {
          if (stopped) return;
          showFrame(0);
          scheduleAdvance();
        }, DEFAULT_LOOP_PAUSE_MS);
      } else {
        showFrame(next);
      }
    }, DEFAULT_FRAME_INTERVAL_MS);
  }

  async function discoverAndPaint() {
    const fresh = await fetchRecentBomFrames({ idr, cadenceMinutes, count: frameCount });
    // Best-effort preload — tolerate partial failures.
    await preloadFrames(fresh).catch((err) => {
      console.warn('[Atmos radar] partial preload failure:', err?.message || err);
    });
    frames = fresh;
    currentIdx = 0;
    if (!overlay) {
      overlay = L.imageOverlay(frames[0].url, effectiveBounds, {
        pane,
        opacity: currentOpacity,
        interactive: false,
        attribution: 'Radar (c) Australian Bureau of Meteorology'
      });
      overlay.addTo(map);
    } else {
      overlay.setBounds(L.latLngBounds(effectiveBounds));
      overlay.setUrl(frames[0].url);
    }
    notifyFrame();
  }

  function scheduleRediscover() {
    if (rediscoverHandle !== null) return;
    rediscoverHandle = setInterval(() => {
      if (stopped) return;
      // Probe only the newest few stamps (rate-limit guard), skip frames we
      // already hold, then roll the window forward to the newest frameCount.
      const held = new Set(frames.map((f) => f.url));
      fetchRecentBomFrames({ idr, cadenceMinutes, count: frameCount, maxCandidates: MAX_REDISCOVER_CANDIDATES, skipUrls: held })
        .then((fresh) => preloadFrames(fresh).catch(() => null).then(() => fresh))
        .then((fresh) => {
          if (stopped || !fresh.length) return;
          frames = [...frames, ...fresh]
            .sort((a, b) => a.timestamp - b.timestamp)
            .slice(-frameCount);
          currentIdx = 0;
          if (overlay) overlay.setUrl(frames[0].url);
          notifyFrame();
        })
        .catch((err) => {
          console.warn('[Atmos radar] frame rediscovery failed:', err?.message || err);
        });
    }, DEFAULT_REDISCOVER_INTERVAL_MS);
  }

  async function start() {
    stopped = false;
    await discoverAndPaint();
    scheduleAdvance();
    scheduleRediscover();
    return controller;
  }

  function stop() {
    stopped = true;
    clearAdvanceHandle();
    if (rediscoverHandle !== null) {
      clearInterval(rediscoverHandle);
      rediscoverHandle = null;
    }
    if (overlay && map) {
      map.removeLayer(overlay);
      overlay = null;
    }
  }

  function setOpacity(n) {
    currentOpacity = n;
    if (overlay) overlay.setOpacity(n);
  }

  function getCurrentFrame() {
    if (!frames.length) return null;
    return frames[currentIdx];
  }

  function getIdr() {
    return idr;
  }

  const controller = { start, stop, setOpacity, getCurrentFrame, getIdr };
  return controller;
}

// ─── Deprecated shims ────────────────────────────────────────────────────────
// Preserved so any stray caller fails loudly instead of silently doing nothing.

function deprecated(name) {
  throw new Error(
    `${name}: deprecated — tile-based BoM radar removed. ` +
    `Use createBomStaticRadarLayer({ map, pane }).start() instead.`
  );
}

export function fetchBomRadarFrames() { deprecated('fetchBomRadarFrames'); }
export function buildBomRadarTileUrl() { deprecated('buildBomRadarTileUrl'); }
export function getBomRadarFrameCandidates() { deprecated('getBomRadarFrameCandidates'); }
export function createBomRadarTileLayer() { deprecated('createBomRadarTileLayer'); }
export function createAvailableBomRadarLayer() { deprecated('createAvailableBomRadarLayer'); }
export function isBomRadarHostAvailable() { deprecated('isBomRadarHostAvailable'); }
export function startBomRadarUpdateLoop() { deprecated('startBomRadarUpdateLoop'); }
