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

  return L.tileLayer(`${host}${path}/256/{z}/{x}/{y}/2/1_1.png`, {
    opacity: 0.55,
    zIndex: 450,
    ...options.layerOptions
  });
}
