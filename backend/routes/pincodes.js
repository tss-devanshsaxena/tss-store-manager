const express = require('express');
const { getDb } = require('../db/database');
const { authMiddleware } = require('../middleware/auth');
const { isServiceablePincode, getMasterCount } = require('../lib/postcodeMaster');
const { getCachedSearch, saveCache } = require('../lib/pincodeCache');
const { queryOverpass } = require('../lib/overpassClient');

const router = express.Router();
router.use(authMiddleware);

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

function buildResponse(pincodes, totalFound, excluded, radiusKm, extra = {}) {
  return {
    count: pincodes.length,
    total_found: totalFound,
    excluded,
    shiprocket_master_count: getMasterCount(),
    range: radiusKm,
    pincodes,
    ...extra,
  };
}

async function fetchPincodesFromOverpass(latitude, longitude, radiusKm, dedupeKey) {
  const latDelta = radiusKm / 111;
  const lonDelta = radiusKm / (111 * Math.cos((latitude * Math.PI) / 180));
  const S = (latitude - latDelta).toFixed(6);
  const N = (latitude + latDelta).toFixed(6);
  const W = (longitude - lonDelta).toFixed(6);
  const E = (longitude + lonDelta).toFixed(6);
  const bbox = `${S},${W},${N},${E}`;

  const query = `
[out:json][timeout:25];
(
  relation["boundary"="postal_code"](${bbox});
  relation["postal_code"](${bbox});
  node["postal_code"](${bbox});
  node["addr:postcode"](${bbox});
);
out tags center;
`.trim();

  const fallbackQuery = `
[out:json][timeout:20];
(
  node["postal_code"](${bbox});
  node["addr:postcode"](${bbox});
);
out body;
`.trim();

  const data = await queryOverpass(query, fallbackQuery, dedupeKey);
  const seen = new Map();

  for (const el of data.elements) {
    const pincode =
      el.tags?.postal_code ||
      el.tags?.['addr:postcode'] ||
      el.tags?.postcode;

    if (!pincode || !/^\d{6}$/.test(pincode)) continue;

    const elLat = el.lat ?? el.center?.lat;
    const elLon = el.lon ?? el.center?.lon;
    if (elLat == null || elLon == null) continue;

    const dist = haversine(latitude, longitude, elLat, elLon);
    if (dist > radiusKm) continue;

    if (!seen.has(pincode) || seen.get(pincode).distance > dist) {
      seen.set(pincode, {
        pincode,
        lat: elLat,
        lon: elLon,
        distance: parseFloat(dist.toFixed(2)),
        name: el.tags?.name || el.tags?.['addr:suburb'] || el.tags?.['addr:quarter'] || '',
        city: el.tags?.['addr:city'] || el.tags?.['is_in:city'] || '',
        state: el.tags?.['addr:state'] || el.tags?.['is_in:state'] || '',
      });
    }
  }

  const allResults = Array.from(seen.values()).sort((a, b) => a.distance - b.distance);
  const results = allResults.filter((p) => isServiceablePincode(p.pincode));
  return { allResults, results };
}

router.get('/nearby', async (req, res) => {
  const { store_id, lat, lon, range, refresh, cache_only } = req.query;
  if (!range) {
    return res.status(400).json({ error: 'range required' });
  }

  const radiusKm = parseFloat(range);
  const forceRefresh = refresh === '1' || refresh === 'true';
  const cacheOnly = cache_only === '1' || cache_only === 'true';

  let storeId = store_id ? parseInt(store_id, 10) : null;
  let latitude;
  let longitude;

  if (storeId) {
    const store = getDb().prepare('SELECT id, latitude, longitude FROM stores WHERE id = ?').get(storeId);
    if (!store) return res.status(404).json({ error: 'Store not found' });
    latitude = store.latitude;
    longitude = store.longitude;
  } else if (lat && lon) {
    latitude = parseFloat(lat);
    longitude = parseFloat(lon);
  } else {
    return res.status(400).json({ error: 'store_id or lat/lon required' });
  }

  try {
    if (storeId && !forceRefresh) {
      const cached = getCachedSearch(storeId, radiusKm, latitude, longitude);
      if (cached) {
        return res.json(buildResponse(
          cached.pincodes,
          cached.total_found,
          cached.excluded,
          radiusKm,
          { cached: true, cached_at: cached.cached_at }
        ));
      }
      if (cacheOnly) {
        return res.json(buildResponse([], 0, 0, radiusKm, { cached: false }));
      }
    }

    if (cacheOnly) {
      return res.json(buildResponse([], 0, 0, radiusKm, { cached: false }));
    }

    const dedupeKey = storeId ? `${storeId}:${radiusKm}` : null;
    const { allResults, results } = await fetchPincodesFromOverpass(
      latitude, longitude, radiusKm, dedupeKey
    );
    const totalFound = allResults.length;
    const excluded = totalFound - results.length;

    if (storeId) {
      saveCache(storeId, radiusKm, latitude, longitude, results, totalFound, excluded);
      console.log(`Cached ${results.length} pincodes for store ${storeId} @ ${radiusKm}km`);
    }

    res.json(buildResponse(results, totalFound, excluded, radiusKm, { cached: false }));

  } catch (err) {
    console.error('Pincode search failed:', err.message);

    if (res.headersSent) return;

    if (storeId && !forceRefresh) {
      try {
        const stale = getCachedSearch(storeId, radiusKm, latitude, longitude);
        if (stale) {
          return res.json(buildResponse(
            stale.pincodes,
            stale.total_found,
            stale.excluded,
            radiusKm,
            { cached: true, cached_at: stale.cached_at, stale_fallback: true }
          ));
        }
      } catch (cacheErr) {
        console.error('Stale cache read failed:', cacheErr.message);
      }
    }

    res.status(500).json({ error: 'Pincode search failed — Overpass API unavailable. Try again in a moment.' });
  }
});

module.exports = router;
