/**
 * Build backend/data/pincode_centroids.json from OSM data.
 *
 * For cities where OSM has postal boundary relations (e.g. Bangalore),
 * centroids come from relation bounding-box centers — more accurate.
 * For cities without relations (e.g. Mumbai), centroids are the median
 * lat/lon across all addr:postcode-tagged nodes — robust against outliers.
 *
 * Run: node scripts/build-pincode-centroids.js
 * Re-run whenever OSM coverage improves (every few months is fine).
 */
const https = require('https');
const fs = require('fs');
const path = require('path');

const OUT_PATH = path.join(__dirname, '../data/pincode_centroids.json');

// ── Cities to cover ──────────────────────────────────────────────────────────
// bbox: "minLat,minLon,maxLat,maxLon"
// prefixRe: regex matching the pincode prefixes expected in this city
const CITIES = [
  { name: 'Mumbai',     bbox: '18.85,72.70,19.40,73.20', prefixRe: /^400/ },
  { name: 'Thane',      bbox: '19.00,72.85,19.80,73.35', prefixRe: /^40[12]/ },
  { name: 'Bangalore',  bbox: '12.75,77.30,13.20,78.00', prefixRe: /^56[0-3]/ },
  { name: 'Pune',       bbox: '18.20,73.50,18.85,74.25', prefixRe: /^41[12]/ },
  { name: 'Hyderabad',  bbox: '17.10,78.15,17.90,79.00', prefixRe: /^50[0-2]/ },
  { name: 'Ahmedabad',  bbox: '22.80,72.30,23.60,73.20', prefixRe: /^3[89][0-6]/ },
  { name: 'Delhi',      bbox: '28.40,76.80,28.90,77.55', prefixRe: /^1[12][0-9]/ },
  { name: 'NCR',        bbox: '28.30,77.00,28.80,77.55', prefixRe: /^20[12]/ },
  { name: 'Chennai',    bbox: '12.80,79.85,13.40,80.40', prefixRe: /^60[0-3]/ },
  { name: 'Kolkata',    bbox: '22.35,88.10,22.75,88.55', prefixRe: /^70[0-2]/ },
  { name: 'Jaipur',     bbox: '26.70,75.55,27.10,76.05', prefixRe: /^30[23]/ },
  { name: 'Indore',     bbox: '22.55,75.70,22.90,76.10', prefixRe: /^45[23]/ },
  { name: 'Lucknow',    bbox: '26.70,80.75,27.00,81.15', prefixRe: /^22[67]/ },
  { name: 'Chandigarh', bbox: '30.60,76.65,30.90,77.00', prefixRe: /^16[0-1]/ },
  { name: 'Surat',      bbox: '20.95,72.65,21.60,73.20', prefixRe: /^39[456]/ },
  { name: 'Nagpur',     bbox: '20.85,78.85,21.45,79.35', prefixRe: /^44[01]/ },
  { name: 'Mysuru',     bbox: '11.80,76.25,12.55,76.80', prefixRe: /^57[01]/ },
  { name: 'Coimbatore', bbox: '10.85,76.80,11.20,77.10', prefixRe: /^64[12]/ },
  { name: 'Kochi',      bbox: '9.85,76.15,10.25,76.55',  prefixRe: /^68[23]/ },
];

const MIRRORS = [
  'overpass-api.de',
  'overpass.kumi.systems',
  'overpass.openstreetmap.ru',
];

function fetchOverpass(mirror, query) {
  return new Promise((resolve, reject) => {
    const body = 'data=' + encodeURIComponent(query);
    const opts = {
      hostname: mirror,
      path: '/api/interpreter',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
        'User-Agent': 'tss-pincode-centroid-builder/1.0',
      },
      timeout: 90000,
    };
    const req = https.request(opts, res => {
      let d = '';
      res.on('data', c => { d += c; });
      res.on('end', () => {
        if (res.statusCode !== 200) { reject(new Error(`HTTP ${res.statusCode}`)); return; }
        try { resolve(JSON.parse(d)); }
        catch { reject(new Error('JSON parse failed')); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.write(body);
    req.end();
  });
}

async function fetchWithFallback(query) {
  let last;
  for (const m of MIRRORS) {
    try { return await fetchOverpass(m, query); }
    catch (e) { last = e; }
  }
  throw last;
}

function median(arr) {
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

async function getRelationCentroids(bbox, prefixRe) {
  const q = `[out:json][timeout:60];(relation["boundary"="postal_code"](${bbox});relation["postal_code"](${bbox}););out center tags;`;
  const data = await fetchWithFallback(q);
  const c = {};
  for (const el of data.elements) {
    const pc = el.tags?.postal_code || el.tags?.postcode;
    if (!pc || !/^\d{6}$/.test(pc) || !prefixRe.test(pc)) continue;
    const lat = el.center?.lat ?? el.lat;
    const lon = el.center?.lon ?? el.lon;
    if (lat == null) continue;
    c[pc] = [parseFloat(lat.toFixed(5)), parseFloat(lon.toFixed(5))];
  }
  return c;
}

async function getNodeCentroids(bbox, prefixRe) {
  const q = `[out:json][timeout:60];(node["addr:postcode"](${bbox});node["postal_code"](${bbox}););out body;`;
  const data = await fetchWithFallback(q);
  const groups = {};
  for (const el of data.elements) {
    const raw = el.tags?.['addr:postcode'] || el.tags?.postal_code || '';
    const pc = raw.replace(/\s+/g, '');
    if (!/^\d{6}$/.test(pc) || !prefixRe.test(pc)) continue;
    if (!groups[pc]) groups[pc] = { lats: [], lons: [] };
    groups[pc].lats.push(el.lat);
    groups[pc].lons.push(el.lon);
  }
  const c = {};
  for (const [pc, { lats, lons }] of Object.entries(groups)) {
    if (lats.length < 3) continue;
    c[pc] = [parseFloat(median(lats).toFixed(5)), parseFloat(median(lons).toFixed(5))];
  }
  return c;
}

async function getCentroids(city) {
  const { name, bbox, prefixRe } = city;
  process.stdout.write(`  ${name}: `);

  // Try relation-based first (more accurate)
  let c = {};
  try {
    c = await getRelationCentroids(bbox, prefixRe);
  } catch {
    // relation query failed — fall through to node-based
  }

  if (Object.keys(c).length === 0) {
    // No relations found — derive from node median positions
    c = await getNodeCentroids(bbox, prefixRe);
    process.stdout.write(`${Object.keys(c).length} (node-median)\n`);
  } else {
    process.stdout.write(`${Object.keys(c).length} (relations)\n`);
  }
  return c;
}

(async () => {
  console.log('Building pincode centroids...');
  const all = {};

  for (const city of CITIES) {
    try {
      Object.assign(all, await getCentroids(city));
    } catch (e) {
      console.warn(`  SKIP ${city.name}: ${e.message}`);
    }
  }

  // Sort for stable diffs
  const sorted = Object.fromEntries(
    Object.entries(all).sort(([a], [b]) => a.localeCompare(b))
  );

  fs.writeFileSync(OUT_PATH, JSON.stringify(sorted));
  console.log(`\nWrote ${Object.keys(sorted).length} centroids → ${OUT_PATH}`);
})();
