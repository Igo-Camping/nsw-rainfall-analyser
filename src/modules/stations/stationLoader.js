export async function loadStations(ctx) {
  ctx.setStatus(true, 'Loading stations...');
  await ctx.lgaBoundaryLoadPromise;
  const stationDataset = await loadPluviometricsRainfallStationDataset(ctx.stationDataUrl);
  const stations = (stationDataset.stations || [])
    .map(station => normaliseConsolidatedRainfallStation(station, ctx))
    .filter(Boolean);
  const mhlStations = stations.filter(station => station.source === 'mhl');
  const bomStations = stations.filter(station => station.source === 'bom');
  console.info('[Pluviometrics stations] dataset URL:', ctx.stationDataUrl);
  console.info('[Pluviometrics stations] consolidated rainfall stations loaded:', stations.length, '| MHL:', mhlStations.length, '| BOM:', bomStations.length, '| generated_at:', stationDataset.generated_at || 'unknown');

  const oliverRaw = (stationDataset.stations || []).find(s => (s.station_name || s.name || '').toLowerCase().includes('oliver st freshwater'));
  const oliverNorm = stations.find(s => (s.name || '').toLowerCase().includes('oliver st freshwater'));
  if (oliverRaw) {
    console.group('[DEBUG Oliver St] Raw JSON entry:');
    console.log(JSON.parse(JSON.stringify(oliverRaw)));
    console.groupEnd();
  } else {
    console.warn('[DEBUG Oliver St] NOT found in raw JSON. Partial matches:', (stationDataset.stations||[]).filter(s=>(s.station_name||s.name||'').toLowerCase().includes('oliver')).map(s=>s.station_name||s.name));
  }
  if (oliverNorm) {
    console.group('[DEBUG Oliver St] Normalised station:');
    console.log(JSON.parse(JSON.stringify(oliverNorm)));
    console.log('source:', oliverNorm.source, '| data_identifier:', oliverNorm.data_identifier, '| ts_id:', oliverNorm.ts_id, '| bom_id:', oliverNorm.bom_id);
    console.log('lga:', oliverNorm.lga, '| region:', oliverNorm.region, '| lat/lon:', oliverNorm.lat, oliverNorm.lon);
    console.log('canAnalyse:', ctx.canAnalyseStation(oliverNorm));
    console.groupEnd();
  } else {
    console.warn('[DEBUG Oliver St] NOT found after normalisation. Was filtered out.');
  }

  const bomRainfallGauges = loadBomRainfallReferenceGauges(bomStations, ctx);

  ctx.setLoadedStations(mhlStations, bomRainfallGauges);
  ctx.assignStationsToLgas(mhlStations);
  ctx.assignStationsToLgas(bomRainfallGauges);
  ctx.loadIfdData();
  ctx.plotAllMarkers(mhlStations);
  ctx.plotBomRainfallMarkers(bomRainfallGauges);
  ctx.buildLgaDropdown();
  ctx.invalidateMap?.('station layers loaded');
  ctx.setStatus(true, `${mhlStations.length.toLocaleString()} MHL rainfall stations + ${bomRainfallGauges.length.toLocaleString()} BOM rainfall stations`);

  return { allStations: mhlStations, bomRainfallGauges };
}

export async function loadPluviometricsRainfallStationDataset(stationDataUrl) {
  const resp = await fetch(`${stationDataUrl}?v=${Date.now()}`, { cache: 'no-store' });
  if (!resp.ok) throw new Error(`${stationDataUrl} returned ${resp.status}`);
  const data = await resp.json();
  if (!Array.isArray(data?.stations)) throw new Error(`${stationDataUrl} is missing stations[]`);
  return data;
}

export function extractDataIdentifierId(station, prefix) {
  const raw = String(station?.data_identifier || '');
  return raw.toLowerCase().startsWith(`${prefix}:`) ? raw.slice(prefix.length + 1) : '';
}

export function normaliseConsolidatedRainfallStation(station, ctx) {
  if (!station || station.station_type !== 'rainfall') return null;
  const source = String(station.source || '').toLowerCase();
  const lat = Number(station.lat);
  const lon = Number(station.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (source === 'bom') return normaliseConsolidatedBomStation(station, lat, lon, ctx);
  if (source === 'mhl') return normaliseConsolidatedMhlStation(station, lat, lon);
  return null;
}

export function normaliseConsolidatedMhlStation(station, lat, lon) {
  const tsId = String(station.ts_id || extractDataIdentifierId(station, 'mhl') || '').trim();
  return {
    ...station,
    source: 'mhl',
    active: true,
    station_id: String(station.station_id || tsId || '').trim(),
    station_no: String(station.station_no || '').trim(),
    ts_id: tsId || null,
    name: String(station.station_name || station.name || station.station_id || 'MHL rainfall station').trim(),
    lat: Number(station.lat),
    lon: Number(station.lon)
  };
}

export function normaliseConsolidatedBomStation(station, lat, lon, ctx) {
  const bomId = ctx.getBomStationNumber({ bom_id: station.bom_id || extractDataIdentifierId(station, 'bom') || station.station_id });
  const name = String(station.station_name || station.name || `BoM station ${bomId}`).trim();
  return {
    ...station,
    source: 'bom',
    station_id: String(station.station_id || `bom-${bomId}`).trim(),
    isBomGauge: true,
    active: true,
    ts_id: null,
    bom_id: bomId,
    site: bomId,
    name,
    baseName: name,
    element: station.element || 'Rainfall',
    sourceLayer: station.source_layer || station.rainfall_api_source || '',
    lga: station.lga || station.region || '',
    lat,
    lon
  };
}

export function loadBomRainfallReferenceGauges(verifiedStations = null) {
  // BOM reference gauges come only from the consolidated station dataset.
  if (!Array.isArray(verifiedStations)) return [];
  return verifiedStations
    .filter(station => Number.isFinite(station.lat) && Number.isFinite(station.lon))
    .sort((a, b) => a.baseName.localeCompare(b.baseName) || a.element.localeCompare(b.element));
}
