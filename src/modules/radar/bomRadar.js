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
