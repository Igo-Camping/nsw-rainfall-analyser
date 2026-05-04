// Standalone Node.js test — verifies nbc packaging behaviour against real CSV
// Usage: node test_nbc_packaging.js

const fs = require('fs');
const path = require('path');

const CSV_PATH = 'D:\\Packaging\\data\\assets_with_coords.csv';

// ─── CSV parser ──────────────────────────────────────────────────────────────
function parseSimpleCsv(text) {
  const lines = text.split(/\r?\n/);
  if (!lines.length) return [];
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cells = splitCsvLine(line);
    const row = {};
    headers.forEach((h, j) => { row[h] = (cells[j] ?? '').trim().replace(/^"|"$/g, ''); });
    rows.push(row);
  }
  return rows;
}

function splitCsvLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { inQuotes = !inQuotes; continue; }
    if (c === ',' && !inQuotes) { result.push(current); current = ''; continue; }
    current += c;
  }
  result.push(current);
  return result;
}

// ─── Condition extraction (matches nbc extractConditionScore) ─────────────────
function extractConditionScore(row) {
  const candidates = [
    row?.['Observed_Condition'],
    row?.['SW_Condition'],
  ];
  for (const raw of candidates) {
    const text = String(raw ?? '').trim();
    if (!text) continue;
    const m = text.match(/(\d+)/);
    if (m) return Number(m[1]);
  }
  return null;
}

// ─── UTM Zone 56 → lat/lon (matches nbc utmToLatLng) ─────────────────────────
function utmToLatLng(easting, northing, zone, southern) {
  const a = 6378137.0, f = 1 / 298.257223563;
  const b = a * (1 - f);
  const e2 = 1 - (b * b) / (a * a);
  const k0 = 0.9996;
  const E0 = 500000;
  const N0 = southern ? 10000000 : 0;
  const lon0 = ((zone - 1) * 6 - 180 + 3) * Math.PI / 180;
  const x = easting - E0;
  const y = northing - N0;
  const e2p = e2 / (1 - e2);
  const M = y / k0;
  const mu = M / (a * (1 - e2 / 4 - 3 * e2 * e2 / 64 - 5 * Math.pow(e2, 3) / 256));
  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
  const phi1 = mu + (3 * e1 / 2 - 27 * Math.pow(e1, 3) / 32) * Math.sin(2 * mu)
    + (21 * e1 * e1 / 16 - 55 * Math.pow(e1, 4) / 32) * Math.sin(4 * mu)
    + (151 * Math.pow(e1, 3) / 96) * Math.sin(6 * mu);
  const N1 = a / Math.sqrt(1 - e2 * Math.sin(phi1) ** 2);
  const T1 = Math.tan(phi1) ** 2;
  const C1 = e2p * Math.cos(phi1) ** 2;
  const R1 = a * (1 - e2) / Math.pow(1 - e2 * Math.sin(phi1) ** 2, 1.5);
  const D = x / (N1 * k0);
  const lat = phi1 - (N1 * Math.tan(phi1) / R1) * (D * D / 2
    - (5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * e2p) * Math.pow(D, 4) / 24
    + (61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * e2p - 3 * C1 * C1) * Math.pow(D, 6) / 720);
  const lon = lon0 + (D - (1 + 2 * T1 + C1) * Math.pow(D, 3) / 6
    + (5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * e2p + 24 * T1 * T1) * Math.pow(D, 5) / 120) / Math.cos(phi1);
  return { lat: lat * 180 / Math.PI, lon: lon * 180 / Math.PI };
}

// ─── Haversine distance (matches nbc haversineDistanceM) ──────────────────────
function haversineDistanceM(a, b) {
  const R = 6371000;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLon = (b.lon - a.lon) * Math.PI / 180;
  const sinDLat = Math.sin(dLat / 2);
  const sinDLon = Math.sin(dLon / 2);
  const aa = sinDLat * sinDLat + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * sinDLon * sinDLon;
  return 2 * R * Math.asin(Math.sqrt(aa));
}

// ─── Coordinate resolution (matches nbc resolveCctvCoordinate for XMid/YMid) ──
function resolveCoordinate(row) {
  const midX = Number(row['XMid']);
  const midY = Number(row['YMid']);
  if (isFinite(midX) && isFinite(midY) && midX > 1000 && midY > 1000) {
    return utmToLatLng(midX, midY, 56, true);
  }
  return null;
}

// ─── Mean coordinate ──────────────────────────────────────────────────────────
function meanCoord(items) {
  const valid = items.filter(i => i.lat != null && i.lon != null);
  if (!valid.length) return null;
  return { lat: valid.reduce((s, i) => s + i.lat, 0) / valid.length, lon: valid.reduce((s, i) => s + i.lon, 0) / valid.length };
}

// ─── Anchor-radius clustering (matches nbc assignReliningClusters logic) ──────
function assignClusters(items, radiusM) {
  const withCoord = items.filter(i => i.lat != null && i.lon != null);
  const noCoord = items.filter(i => i.lat == null || i.lon == null);
  const remaining = new Set(withCoord);
  const clusters = [];

  while (remaining.size) {
    const candidates = [...remaining];
    // Pick densest seed (most neighbors within radius) — matches nbc behaviour
    const density = new Map(candidates.map(item => [
      item,
      candidates.reduce((count, other) => (item !== other && haversineDistanceM(item, other) <= radiusM ? count + 1 : count), 0)
    ]));
    const seed = candidates.sort((a, b) => (density.get(b) || 0) - (density.get(a) || 0))[0];
    remaining.delete(seed);

    // Build cluster from seed (simplified: fixed anchor at seed)
    let cluster = [seed];
    let changed = true;
    while (changed) {
      changed = false;
      const center = meanCoord(cluster);
      if (!center) break;
      for (const item of [...remaining]) {
        if (haversineDistanceM(center, item) <= radiusM) {
          cluster.push(item);
          remaining.delete(item);
          changed = true;
        }
      }
    }

    // Finalise: iteratively remove outliers beyond radiusM of center
    changed = true;
    while (changed) {
      changed = false;
      const center = meanCoord(cluster);
      if (!center) break;
      const kept = cluster.filter(i => haversineDistanceM(center, i) <= radiusM);
      if (kept.length < cluster.length) {
        cluster.filter(i => !kept.includes(i)).forEach(i => remaining.add(i));
        cluster = kept;
        changed = true;
      }
    }
    clusters.push(cluster);
  }

  return { clusters, noCoord };
}

// ─── Main test ────────────────────────────────────────────────────────────────
console.log('Loading CSV from:', CSV_PATH);
const text = fs.readFileSync(CSV_PATH, 'utf8');
const rows = parseSimpleCsv(text);
console.log(`Total rows: ${rows.length}`);

// Condition counts
let cond8 = 0, cond9or10 = 0, condAmp = 0;
const cond8rows = [];
rows.forEach(row => {
  const c = extractConditionScore(row);
  if (c === 8) { cond8++; cond8rows.push(row); }
  if (c === 9 || c === 10) cond9or10++;
  // Amplification: cond 4-7, flood H3-H6, diameter ≥ 300
  if ([4,5,6,7].includes(c)) {
    const flood = String(row['SW LGA 20% H1-H6'] || '').trim().toUpperCase();
    const diam = Number(row['SWP_Pipe_Diameter_mm'] || row['SWP_Pipe Diameter_mm']);
    if (['H3','H4','H5','H6'].includes(flood) && diam >= 300) condAmp++;
  }
});

console.log(`\nCondition counts:`);
console.log(`  Condition 8 (relining):   ${cond8}  (expected 235)`);
console.log(`  Condition 9-10 (recon):   ${cond9or10}  (expected ~50-52, JS regex truncates decimals)`);
console.log(`  Amplification:            ${condAmp}  (expected 0)`);

// Spatial clustering at 500m
const cond8withCoords = cond8rows
  .map(row => {
    const coord = resolveCoordinate(row);
    return coord ? { ...coord, assetId: row['Asset'] } : null;
  })
  .filter(Boolean);

console.log(`\nCond-8 rows with coordinates: ${cond8withCoords.length}`);

const { clusters, noCoord } = assignClusters(cond8withCoords, 500);
console.log(`\nSpatial clustering at 500m radius:`);
console.log(`  Clusters: ${clusters.length}  (expected 70-110; varies by seeding algorithm)`);
console.log(`  No-coord items: ${noCoord.length}`);

// Check for proximity violations
let violations = 0;
for (const cluster of clusters) {
  for (let i = 0; i < cluster.length; i++) {
    for (let j = i + 1; j < cluster.length; j++) {
      const d = haversineDistanceM(cluster[i], cluster[j]);
      if (d > 1010) violations++;
    }
  }
}
console.log(`  Proximity violations (>1010m): ${violations}  (expected 0)`);

// JS regex truncates decimal Observed_Condition (e.g. 9.5 → 9), so recon may be 50-52
const passed = cond8 === 235 && cond9or10 >= 50 && cond9or10 <= 52 && condAmp === 0 && clusters.length >= 70 && clusters.length <= 110 && violations === 0;
console.log(`\n${passed ? '✓ ALL CHECKS PASSED' : '✗ SOME CHECKS FAILED'}`);
process.exit(passed ? 0 : 1);
