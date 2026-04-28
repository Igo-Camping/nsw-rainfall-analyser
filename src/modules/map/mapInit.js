const DEFAULT_CENTER = [-33.75, 151.25];
const DEFAULT_ZOOM = 11;

export function createAtmosMap({
  L,
  elementId = 'map',
  center = DEFAULT_CENTER,
  zoom = DEFAULT_ZOOM,
  options = {}
}) {
  return L.map(elementId, options).setView(center, zoom);
}
