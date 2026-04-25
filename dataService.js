export const LOCATIONS = [
  { id: "sydney", label: "Sydney", datasetUrl: "data/sydney.json" },
  { id: "newcastle", label: "Newcastle", datasetUrl: "data/newcastle.json" },
  { id: "moree", label: "Moree", datasetUrl: "data/moree.json" },
];

const datasetCache = new Map();

export function getLocationById(locationId) {
  return LOCATIONS.find((location) => location.id === locationId) || null;
}

export async function loadIfdDataset(locationId, options = {}) {
  const location = getLocationById(locationId);

  if (!location) {
    throw new Error("Select a supported rainfall station.");
  }

  if (datasetCache.has(location.id)) {
    return datasetCache.get(location.id);
  }

  const dataset = await fetchDataset(location, options.fetchClient || fetch);
  datasetCache.set(location.id, dataset);
  return dataset;
}

async function fetchDataset(location, fetchClient) {
  const response = await fetchClient(location.datasetUrl);

  if (!response.ok) {
    throw new Error(`Could not load rainfall IFD data for ${location.label}.`);
  }

  return response.json();
}
