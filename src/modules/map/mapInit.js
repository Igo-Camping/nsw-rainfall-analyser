// Last-resort centre only (Mona Vale). The live initial centre is the centroid of the
// resolved LGA's bounds, supplied by the caller via resolveInitialCenter().
const FALLBACK_CENTER = [-33.75, 151.25];
const DEFAULT_ZOOM = 11;

// [lat, lng] centroid of a Leaflet LatLngBounds; the fallback only when no LGA resolved.
export function resolveInitialCenter(bounds) {
  if (bounds && typeof bounds.getCenter === 'function') {
    const c = bounds.getCenter();
    if (Number.isFinite(c?.lat) && Number.isFinite(c?.lng)) return [c.lat, c.lng];
  }
  return FALLBACK_CENTER;
}

export function createAtmosMap({
  L,
  elementId = 'map',
  center = FALLBACK_CENTER,
  zoom = DEFAULT_ZOOM,
  options = {}
}) {
  return L.map(elementId, options).setView(center, zoom);
}
