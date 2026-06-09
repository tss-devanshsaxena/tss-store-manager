const { getDb } = require('../db/database');

const COORD_TOLERANCE = 0.0001;

function getCachedSearch(storeId, rangeKm, lat, lon) {
  const db = getDb();
  const row = db.prepare(`
    SELECT pincodes_json, total_found, excluded, latitude, longitude, cached_at
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

  const pincodes = JSON.parse(row.pincodes_json);
  return {
    count: pincodes.length,
    total_found: row.total_found,
    excluded: row.excluded,
    range: rangeKm,
    pincodes,
    cached_at: row.cached_at,
  };
}

function saveCache(storeId, rangeKm, lat, lon, pincodes, totalFound, excluded) {
  const db = getDb();
  db.prepare(`
    INSERT INTO pincode_search_cache (
      store_id, range_km, latitude, longitude, pincodes_json, total_found, excluded, cached_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(store_id, range_km) DO UPDATE SET
      latitude = excluded.latitude,
      longitude = excluded.longitude,
      pincodes_json = excluded.pincodes_json,
      total_found = excluded.total_found,
      excluded = excluded.excluded,
      cached_at = CURRENT_TIMESTAMP
  `).run(storeId, rangeKm, lat, lon, JSON.stringify(pincodes), totalFound, excluded);
}

function deleteCacheEntry(storeId, rangeKm) {
  getDb().prepare('DELETE FROM pincode_search_cache WHERE store_id = ? AND range_km = ?').run(storeId, rangeKm);
}

function clearStoreCache(storeId) {
  getDb().prepare('DELETE FROM pincode_search_cache WHERE store_id = ?').run(storeId);
}

module.exports = { getCachedSearch, saveCache, clearStoreCache };
