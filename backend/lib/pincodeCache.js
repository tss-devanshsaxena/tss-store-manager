const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { getDb } = require('../db/database');

const COORD_TOLERANCE = 0.0001;

let _centroidVersion = null;
function getCentroidVersion() {
  if (!_centroidVersion) {
    try {
      const p = path.join(__dirname, '../data/pincode_centroids.json');
      const content = fs.readFileSync(p);
      _centroidVersion = crypto.createHash('sha1').update(content).digest('hex').slice(0, 8);
    } catch {
      _centroidVersion = 'none';
    }
  }
  return _centroidVersion;
}

function ensureCacheColumns(db) {
  const cols = db.prepare('PRAGMA table_info(pincode_search_cache)').all().map((c) => c.name);
  if (!cols.includes('excluded_pincodes_json')) {
    db.prepare("ALTER TABLE pincode_search_cache ADD COLUMN excluded_pincodes_json TEXT DEFAULT '[]'").run();
  }
  if (!cols.includes('centroid_version')) {
    db.prepare("ALTER TABLE pincode_search_cache ADD COLUMN centroid_version TEXT DEFAULT ''").run();
  }
}

function getCachedSearch(storeId, rangeKm, lat, lon) {
  const db = getDb();
  ensureCacheColumns(db);

  const row = db.prepare(`
    SELECT pincodes_json, excluded_pincodes_json, total_found, excluded, latitude, longitude, cached_at, centroid_version
    FROM pincode_search_cache
    WHERE store_id = ? AND range_km = ?
  `).get(storeId, rangeKm);

  if (!row) return null;

  if (
    Math.abs(row.latitude - lat) > COORD_TOLERANCE ||
    Math.abs(row.longitude - lon) > COORD_TOLERANCE
  ) {
    deleteCacheEntry(storeId, rangeKm);
    return null;
  }

  // Invalidate if the centroid file has been rebuilt since this entry was cached.
  if (row.centroid_version && row.centroid_version !== getCentroidVersion()) {
    deleteCacheEntry(storeId, rangeKm);
    return null;
  }

  const pincodes = JSON.parse(row.pincodes_json);
  let excludedPincodes = [];
  try {
    excludedPincodes = JSON.parse(row.excluded_pincodes_json || '[]');
  } catch { /* ignore */ }

  return {
    count: pincodes.length,
    total_found: row.total_found,
    excluded: row.excluded,
    excluded_pincodes: excludedPincodes,
    range: rangeKm,
    pincodes,
    cached_at: row.cached_at,
  };
}

function saveCache(storeId, rangeKm, lat, lon, pincodes, totalFound, excluded, excludedPincodes = []) {
  const db = getDb();
  ensureCacheColumns(db);

  db.prepare(`
    INSERT INTO pincode_search_cache (
      store_id, range_km, latitude, longitude, pincodes_json, excluded_pincodes_json,
      total_found, excluded, centroid_version, cached_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(store_id, range_km) DO UPDATE SET
      latitude = excluded.latitude,
      longitude = excluded.longitude,
      pincodes_json = excluded.pincodes_json,
      excluded_pincodes_json = excluded.excluded_pincodes_json,
      total_found = excluded.total_found,
      excluded = excluded.excluded,
      centroid_version = excluded.centroid_version,
      cached_at = CURRENT_TIMESTAMP
  `).run(
    storeId, rangeKm, lat, lon,
    JSON.stringify(pincodes),
    JSON.stringify(excludedPincodes),
    totalFound,
    excluded,
    getCentroidVersion()
  );
}

function deleteCacheEntry(storeId, rangeKm) {
  getDb().prepare('DELETE FROM pincode_search_cache WHERE store_id = ? AND range_km = ?').run(storeId, rangeKm);
}

function clearStoreCache(storeId) {
  getDb().prepare('DELETE FROM pincode_search_cache WHERE store_id = ?').run(storeId);
}

module.exports = { getCachedSearch, saveCache, clearStoreCache };
