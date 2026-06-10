/**
 * Import validated store→pincode mappings from the hyperlocal Excel file
 * into the pincode_search_cache.
 *
 * Reads the "New format" sheet which has: City, DestPincode, Priority,
 * StoreCode (S01…), StoreName, KM (road distance).
 *
 * For each store and each standard search range, builds a pincode list from
 * the Excel rows whose KM <= range, then saves it to the cache. This
 * pre-populates cache so the dashboard shows validated data without a live
 * OSM query.
 *
 * Uses pincode_centroids.json for lat/lon (map display). Pincodes without a
 * centroid are still imported — they appear in the list but not on the map.
 *
 * Run: node scripts/import-excel-pincodes.js [/path/to/file.xlsx]
 * Default path: ~/Downloads/Hyperlocal_Pincode_store_priority_v8_100626.xlsx
 */
const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');
const { getDb } = require('../db/database');
const { isServiceablePincode } = require('../lib/postcodeMaster');
const { saveCache } = require('../lib/pincodeCache');

const EXCEL_PATH = process.argv[2] ||
  path.join(process.env.HOME, 'Downloads/Hyperlocal_Pincode_store_priority_v8_100626.xlsx');

const STANDARD_RANGES = [5, 10, 12, 15, 20];

function loadCentroids() {
  const p = path.join(__dirname, '../data/pincode_centroids.json');
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch { return {}; }
}

function buildStoreMap(db) {
  const rows = db.prepare('SELECT id, store_name, location_code, latitude, longitude FROM stores').all();
  const map = {};
  for (const r of rows) {
    if (r.location_code) map[r.location_code] = r;
  }
  return map;
}

function readExcelRows(filePath) {
  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets['New format'];
  if (!ws) throw new Error('Sheet "New format" not found in the Excel file');
  const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
  // header row: [City, DestPincode, Priority, StoreCode, StoreName, KM, ...]
  const rows = [];
  for (let i = 1; i < raw.length; i++) {
    const [city, pincode, , storeCode, , km] = raw[i];
    if (!city || !pincode || !storeCode || km == null) continue;
    const pcStr = String(pincode).padStart(6, '0');
    if (!/^\d{6}$/.test(pcStr)) continue;
    rows.push({ city: String(city), pincode: pcStr, storeCode: String(storeCode), km: parseFloat(km) });
  }
  return rows;
}

function groupByStore(rows) {
  const map = {};
  for (const r of rows) {
    if (!map[r.storeCode]) map[r.storeCode] = [];
    map[r.storeCode].push(r);
  }
  return map;
}

async function main() {
  if (!fs.existsSync(EXCEL_PATH)) {
    console.error(`Excel file not found: ${EXCEL_PATH}`);
    console.error('Usage: node scripts/import-excel-pincodes.js [/path/to/file.xlsx]');
    process.exit(1);
  }

  console.log(`Reading: ${EXCEL_PATH}`);
  const rows = readExcelRows(EXCEL_PATH);
  console.log(`Read ${rows.length} rows from "New format" sheet`);

  const db = getDb();
  const storeMap = buildStoreMap(db);
  const centroids = loadCentroids();
  const byStore = groupByStore(rows);

  let totalImported = 0;
  let totalSkipped = 0;
  const missingStores = [];

  for (const [storeCode, storeRows] of Object.entries(byStore)) {
    const store = storeMap[storeCode];
    if (!store) {
      missingStores.push(storeCode);
      continue;
    }

    for (const rangeKm of STANDARD_RANGES) {
      const eligible = storeRows.filter(r => r.km <= rangeKm);
      if (eligible.length === 0) continue;

      const allPincodes = eligible.map(r => {
        const centroid = centroids[r.pincode];
        return {
          pincode: r.pincode,
          distance: parseFloat(r.km.toFixed(2)),
          lat: centroid ? centroid[0] : null,
          lon: centroid ? centroid[1] : null,
          name: '',
          city: r.city,
          state: '',
        };
      }).sort((a, b) => a.distance - b.distance);

      const serviceable = allPincodes.filter(p => isServiceablePincode(p.pincode));
      const excluded = allPincodes.filter(p => !isServiceablePincode(p.pincode));

      saveCache(
        store.id, rangeKm,
        parseFloat(store.latitude), parseFloat(store.longitude),
        serviceable, allPincodes.length, excluded.length, excluded
      );

      totalImported += serviceable.length;
    }

    process.stdout.write(`  ${storeCode} ${store.store_name}: ${storeRows.length} pincodes imported\n`);
  }

  if (missingStores.length > 0) {
    console.warn(`\nWarning: ${missingStores.length} store codes from Excel not found in DB: ${missingStores.join(', ')}`);
    totalSkipped = missingStores.length;
  }

  console.log(`\nDone. ${Object.keys(byStore).length - totalSkipped} stores, ${totalImported} serviceable pincode×range entries written to cache.`);
  console.log('Re-fetch from OSM at any time via the dashboard to refresh with live data.');
}

main().catch(err => { console.error(err); process.exit(1); });
