const DEFAULT_RAINVIEWER_MAX_NATIVE_ZOOM = 10;
const DEFAULT_RAINVIEWER_MIN_ZOOM = 0;
const DEFAULT_RAINVIEWER_MAX_ZOOM = 18;
const DEFAULT_RAINVIEWER_PANE = 'atmos-radar-pane';

export async function fetchRainviewerApi(apiUrl = 'https://api.rainviewer.com/public/weather-maps.json') {
  const response = await fetch(apiUrl, { cache: 'no-store' });

  if (!response.ok) {
    throw new Error(`RainViewer API request failed: ${response.status}`);
  }

  return response.json();
}

export function createRainviewerTileLayer(apiData, options = {}) {
  const host = apiData?.host || 'https://tilecache.rainviewer.com';
  const frames = apiData?.radar?.past || [];
  const frame = options.frame || frames[frames.length - 1];
  const path = frame?.path || '';
  const maxNativeZoom = options.maxNativeZoom ?? DEFAULT_RAINVIEWER_MAX_NATIVE_ZOOM;
  const minZoom = options.minZoom ?? DEFAULT_RAINVIEWER_MIN_ZOOM;
  const maxZoom = options.maxZoom ?? DEFAULT_RAINVIEWER_MAX_ZOOM;
  const tileTemplate = `${host}${path}/256/{z}/{x}/{y}/2/1_1.png`;

  if (!path) {
    throw new Error('RainViewer API returned no radar frames');
  }

  console.info('[Atmos radar] RainViewer tile URL template:', tileTemplate);
  console.info('[Atmos radar] RainViewer map zoom:', options.map?.getZoom?.());
  console.info('[Atmos radar] RainViewer zoom config:', { minZoom, maxNativeZoom, maxZoom });

  return L.tileLayer(tileTemplate, {
    attribution: 'Radar (c) RainViewer',
    ...options.layerOptions,
    opacity: 0.65,
    pane: options.pane || DEFAULT_RAINVIEWER_PANE,
    zIndex: 450,
    minZoom,
    maxNativeZoom,
    maxZoom,
    tileSize: 256,
    updateWhenZooming: false,
    updateWhenIdle: true,
    keepBuffer: 2
  });
}

export async function createRainviewerFallbackLayer(options = {}) {
  const apiData = await fetchRainviewerApi(options.apiUrl);
  return createRainviewerTileLayer(apiData, options);
}
