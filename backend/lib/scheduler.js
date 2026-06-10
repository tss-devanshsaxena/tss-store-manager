/**
 * Periodic background jobs.
 *
 * Jobs defined here:
 *
 *  1. Centroid rebuild  — 1st of every month at 02:00
 *     Refetches OSM postal-code centroid data for all covered cities and
 *     rewrites pincode_centroids.json. Because pincodeCache fingerprints
 *     that file, all existing cache entries are auto-invalidated on the
 *     next read after a rebuild — no manual cache-clearing needed.
 *
 *  2. Stale-cache cleanup — every Sunday at 03:00
 *     Removes any cache entries older than CACHE_MAX_AGE_DAYS. Keeps the DB
 *     small and ensures stores that move or change radius eventually refresh.
 *
 *  3. Active-store cache warmup — every Monday at 04:00
 *     Queues an OSM search for every store marked is_active=1 and
 *     is_hyperlocal=1 at range 10 km (the most-used default). Results are
 *     cached so dashboard users see instant results during the week.
 *
 * Override schedule via environment variables (standard cron syntax):
 *   CRON_CENTROIDS   default "0 2 1 * *"
 *   CRON_CACHE_CLEAN default "0 3 * * 0"
 *   CRON_WARMUP      default "0 4 * * 1"
 *
 * Set DISABLE_SCHEDULER=1 to skip all jobs (useful in test/CI).
 */
const cron = require('node-cron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const crypto = require('crypto');
const { getDb } = require('../db/database');
const { saveCache } = require('./pincodeCache');
const { isServiceablePincode } = require('./postcodeMaster');
const { isPincodePlausibleAtCoords, isPincodeCentroidNearStore } = require('./pincodeRegion');

const CACHE_MAX_AGE_DAYS = parseInt(process.env.CACHE_MAX_AGE_DAYS || '30', 10);
const WARMUP_RANGE_KM = parseFloat(process.env.WARMUP_RANGE_KM || '10');
const CENTROIDS_PATH = path.join(__dirname, '../data/pincode_centroids.json');
const OVERPASS_MIRRORS = [
  'overpass-api.de',
  'overpass.kumi.systems',
  'overpass.openstreetmap.ru',
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function log(job, msg) {
  console.log(`[scheduler:${job}] ${new Date().toISOString()} ${msg}`);
}

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function fetchOverpass(mirror, body) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: mirror,
      path: '/api/interpreter',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
        'User-Agent': 'tss-pincode-scheduler/1.0',
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

async function overpassWithFallback(query) {
  let last;
  for (const m of OVERPASS_MIRRORS) {
    try { return await fetchOverpass(m, 'data=' + encodeURIComponent(query)); }
    catch (e) { last = e; }
  }
  throw last;
}

// ── Job 1: Centroid rebuild ───────────────────────────────────────────────────

const CENTROID_CITIES = [
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

function median(arr) {
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

async function fetchCityRelations(bbox, prefixRe) {
  const q = `[out:json][timeout:60];(relation["boundary"="postal_code"](${bbox});relation["postal_code"](${bbox}););out center tags;`;
  const data = await overpassWithFallback(q);
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

async function fetchCityNodes(bbox, prefixRe) {
  const q = `[out:json][timeout:60];(node["addr:postcode"](${bbox});node["postal_code"](${bbox}););out body;`;
  const data = await overpassWithFallback(q);
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

async function rebuildCentroids() {
  log('centroids', 'Starting monthly centroid rebuild...');
  const all = {};
  for (const city of CENTROID_CITIES) {
    try {
      let c = {};
      try { c = await fetchCityRelations(city.bbox, city.prefixRe); } catch { /* fallthrough */ }
      if (Object.keys(c).length === 0) {
        c = await fetchCityNodes(city.bbox, city.prefixRe);
        log('centroids', `  ${city.name}: ${Object.keys(c).length} (node-median)`);
      } else {
        log('centroids', `  ${city.name}: ${Object.keys(c).length} (relations)`);
      }
      Object.assign(all, c);
    } catch (e) {
      log('centroids', `  SKIP ${city.name}: ${e.message}`);
    }
  }

  const sorted = Object.fromEntries(Object.entries(all).sort(([a], [b]) => a.localeCompare(b)));
  const newContent = JSON.stringify(sorted);

  // Only write if content actually changed (skip needless cache invalidations)
  let oldHash = '';
  try { oldHash = crypto.createHash('sha1').update(fs.readFileSync(CENTROIDS_PATH)).digest('hex').slice(0, 8); } catch { /* no existing file */ }
  const newHash = crypto.createHash('sha1').update(newContent).digest('hex').slice(0, 8);

  if (oldHash === newHash) {
    log('centroids', `No change (${Object.keys(sorted).length} centroids, hash ${newHash}). Cache intact.`);
    return;
  }

  fs.writeFileSync(CENTROIDS_PATH, newContent);
  log('centroids', `Wrote ${Object.keys(sorted).length} centroids (${oldHash} → ${newHash}). Cache will auto-invalidate on next read.`);
}

// ── Job 2: Stale-cache cleanup ────────────────────────────────────────────────

function cleanStaleCache() {
  log('cache-clean', `Removing cache entries older than ${CACHE_MAX_AGE_DAYS} days...`);
  const db = getDb();
  const result = db
    .prepare(`DELETE FROM pincode_search_cache WHERE cached_at < datetime('now', '-' || ? || ' days')`)
    .run(CACHE_MAX_AGE_DAYS);
  log('cache-clean', `Removed ${result.changes} stale cache entries.`);
}

// ── Job 3: Active-store cache warmup ─────────────────────────────────────────

async function warmupActiveStores() {
  log('warmup', `Warming up caches for active hyperlocal stores at ${WARMUP_RANGE_KM} km...`);
  const db = getDb();
  const stores = db
    .prepare('SELECT id, store_name, latitude, longitude FROM stores WHERE is_active = 1 AND is_hyperlocal = 1')
    .all();

  if (stores.length === 0) {
    log('warmup', 'No active hyperlocal stores found.');
    return;
  }

  log('warmup', `Found ${stores.length} stores to warm up.`);
  let success = 0;
  let failed = 0;

  for (const store of stores) {
    try {
      const lat = parseFloat(store.latitude);
      const lon = parseFloat(store.longitude);
      const radiusKm = WARMUP_RANGE_KM;

      const latDelta = radiusKm / 111;
      const lonDelta = radiusKm / (111 * Math.cos((lat * Math.PI) / 180));
      const bbox = `${(lat - latDelta).toFixed(6)},${(lon - lonDelta).toFixed(6)},${(lat + latDelta).toFixed(6)},${(lon + lonDelta).toFixed(6)}`;

      const query = `[out:json][timeout:25];(relation["boundary"="postal_code"](${bbox});relation["postal_code"](${bbox});node["postal_code"](${bbox});node["addr:postcode"](${bbox}););out tags center;`;
      const data = await overpassWithFallback(query);

      const seen = new Map();
      for (const el of data.elements) {
        const pincode = el.tags?.postal_code || el.tags?.['addr:postcode'] || el.tags?.postcode;
        if (!pincode || !/^\d{6}$/.test(pincode)) continue;
        const elLat = el.lat ?? el.center?.lat;
        const elLon = el.lon ?? el.center?.lon;
        if (elLat == null) continue;
        const dist = haversine(lat, lon, elLat, elLon);
        if (dist > radiusKm) continue;
        if (!isPincodePlausibleAtCoords(pincode, elLat, elLon)) continue;
        if (!isPincodeCentroidNearStore(pincode, lat, lon, radiusKm)) continue;
        if (!seen.has(pincode) || seen.get(pincode).distance > dist) {
          seen.set(pincode, {
            pincode, lat: elLat, lon: elLon,
            distance: parseFloat(dist.toFixed(2)),
            name: el.tags?.name || el.tags?.['addr:suburb'] || '',
            city: el.tags?.['addr:city'] || '',
            state: el.tags?.['addr:state'] || '',
          });
        }
      }

      const all = Array.from(seen.values()).sort((a, b) => a.distance - b.distance);
      const serviceable = all.filter(p => isServiceablePincode(p.pincode));
      const excluded = all.filter(p => !isServiceablePincode(p.pincode));

      saveCache(store.id, radiusKm, lat, lon, serviceable, all.length, excluded.length, excluded);
      log('warmup', `  ${store.store_name}: ${serviceable.length} pincodes cached`);
      success++;

      // Polite delay between stores to avoid hammering Overpass
      await new Promise(r => setTimeout(r, 2000));
    } catch (e) {
      log('warmup', `  FAIL ${store.store_name}: ${e.message}`);
      failed++;
    }
  }

  log('warmup', `Done. ${success} refreshed, ${failed} failed.`);
}

// ── Register jobs ─────────────────────────────────────────────────────────────

function startScheduler() {
  if (process.env.DISABLE_SCHEDULER === '1') {
    console.log('[scheduler] DISABLE_SCHEDULER=1 — all jobs skipped');
    return;
  }

  const centroidsCron  = process.env.CRON_CENTROIDS   || '0 2 1 * *';   // 1st of month 02:00
  const cacheCleanCron = process.env.CRON_CACHE_CLEAN  || '0 3 * * 0';   // every Sunday 03:00
  const warmupCron     = process.env.CRON_WARMUP       || '0 4 * * 1';   // every Monday 04:00

  cron.schedule(centroidsCron, () => {
    rebuildCentroids().catch(e => log('centroids', `ERROR: ${e.message}`));
  }, { timezone: 'Asia/Kolkata' });

  cron.schedule(cacheCleanCron, () => {
    try { cleanStaleCache(); }
    catch (e) { log('cache-clean', `ERROR: ${e.message}`); }
  }, { timezone: 'Asia/Kolkata' });

  cron.schedule(warmupCron, () => {
    warmupActiveStores().catch(e => log('warmup', `ERROR: ${e.message}`));
  }, { timezone: 'Asia/Kolkata' });

  console.log(`[scheduler] Jobs registered (IST):
  Centroid rebuild : ${centroidsCron}
  Cache cleanup    : ${cacheCleanCron}
  Store warmup     : ${warmupCron}`);
}

module.exports = { startScheduler };
