const DEFAULT_BOM_TILE_TEMPLATE = 'https://radar-tiles.service.bom.gov.au/tiles/{time}/{z}/{x}/{y}.png';
const DEFAULT_SAMPLE_TILE = { z: 5, x: 29, y: 19 };
const DEFAULT_BOM_HOST = 'radar-tiles.service.bom.gov.au';

export async function fetchBomRadarFrames(framesUrl, fetchOptions = {}) {
  const response = await fetch(framesUrl, {
    cache: 'no-store',
    ...fetchOptions
  });

  if (!response.ok) {
    throw new Error(`BOM radar frames request failed: ${response.status}`);
  }

  const data = await response.json();
  return Array.isArray(data) ? data : data.frames || [];
}

export function buildBomRadarTileUrl(template, frame, coords) {
  const timestamp = frame?.time ?? frame?.timestamp ?? frame;
  return String(template)
    .replace('{time}', encodeURIComponent(timestamp ?? ''))
    .replace('{z}', coords.z)
    .replace('{x}', coords.x)
    .replace('{y}', coords.y);
}

export function getBomRadarFrameCandidates(now = Date.now(), intervalMinutes = 10, count = 12) {
  const intervalSeconds = intervalMinutes * 60;
  const latest = Math.floor((now / 1000) / intervalSeconds) * intervalSeconds;

  return Array.from({ length: count }, (_, index) => latest - (index * intervalSeconds));
}

export function createBomRadarTileLayer(frame, options = {}) {
  const tileTemplate = options.tileTemplate || DEFAULT_BOM_TILE_TEMPLATE;

  return L.tileLayer(tileTemplate.replace('{time}', encodeURIComponent(frame)), {
    opacity: 0.55,
    zIndex: 450,
    attribution: 'Radar (c) Australian Bureau of Meteorology',
    ...options.layerOptions
  });
}

export async function createAvailableBomRadarLayer(options = {}) {
  const tileTemplate = options.tileTemplate || DEFAULT_BOM_TILE_TEMPLATE;
  const sampleTile = options.sampleTile || DEFAULT_SAMPLE_TILE;
  const frames = options.frames || getBomRadarFrameCandidates(
    options.now || Date.now(),
    options.intervalMinutes || 10,
    options.frameCount || 12
  );

  if (!(await isBomRadarHostAvailable(options.host || DEFAULT_BOM_HOST, options.dnsUrl))) {
    throw new Error('BOM radar host is unavailable');
  }

  for (const frame of frames) {
    const tileUrl = buildBomRadarTileUrl(tileTemplate, frame, sampleTile);
    if (await canLoadTile(tileUrl, options.timeoutMs || 5000)) {
      return createBomRadarTileLayer(frame, options);
    }
  }

  throw new Error('No loadable BOM radar tile was found');
}

export async function isBomRadarHostAvailable(host = DEFAULT_BOM_HOST, dnsUrl = 'https://dns.google/resolve') {
  const response = await fetch(`${dnsUrl}?name=${encodeURIComponent(host)}&type=A`, { cache: 'no-store' });
  if (!response.ok) return false;

  const data = await response.json();
  return data.Status === 0 && Array.isArray(data.Answer) && data.Answer.length > 0;
}

export async function startBomRadarUpdateLoop({
  framesUrl,
  intervalMs,
  onFrames,
  onError = console.error,
  fetchOptions
}) {
  let stopped = false;
  let timerId = null;

  async function update() {
    try {
      const frames = await fetchBomRadarFrames(framesUrl, fetchOptions);
      if (!stopped) onFrames(frames);
    } catch (error) {
      if (!stopped) onError(error);
    }
  }

  await update();

  if (Number.isFinite(intervalMs) && intervalMs > 0) {
    timerId = setInterval(update, intervalMs);
  }

  return function stopBomRadarUpdateLoop() {
    stopped = true;
    if (timerId !== null) clearInterval(timerId);
  };
}

function canLoadTile(url, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  return fetch(url, {
    cache: 'no-store',
    mode: 'no-cors',
    signal: controller.signal
  }).then(() => true).catch(() => false).finally(() => {
    clearTimeout(timeout);
  });
}
