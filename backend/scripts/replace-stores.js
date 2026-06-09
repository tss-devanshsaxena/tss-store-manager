/**
 * Wipe all stores + pincode cache, then import from JSON.
 * Usage: node scripts/replace-stores.js [path/to/stores.json]
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { getDb } = require('../db/database');

const jsonPath = process.argv[2] || path.join(__dirname, '../data/tss-stores.json');

if (!fs.existsSync(jsonPath)) {
  console.error('File not found:', jsonPath);
  process.exit(1);
}

const stores = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
if (!Array.isArray(stores) || stores.length === 0) {
  console.error('JSON must be a non-empty array of stores');
  process.exit(1);
}

const db = getDb();

const upsert = db.prepare(`
  INSERT INTO stores (
    id, store_name, short_name, type, category, franchise_id, location_code,
    email, latitude, longitude, address, alt_address, city_id, country_id, phone,
    url_key, store_image, message, pincode, is_active, per_day_threshold,
    per_hour_threshold, opening_time, closing_time, delivery_type, ecom_delivery,
    ecom_threshold, local_feed, local_feed_code, gst_arn, gstin, slack_group_url,
    city_name, state_name, state_id, priority, is_hyperlocal
  ) VALUES (
    @id, @store_name, @short_name, @type, @category, @franchise_id, @location_code,
    @email, @latitude, @longitude, @address, @alt_address, @city_id, @country_id, @phone,
    @url_key, @store_image, @message, @pincode, @is_active, @per_day_threshold,
    @per_hour_threshold, @opening_time, @closing_time, @delivery_type, @ecom_delivery,
    @ecom_threshold, @local_feed, @local_feed_code, @gst_arn, @gstin, @slack_group_url,
    @city_name, @state_name, @state_id, @priority, @is_hyperlocal
  )
`);

const mapStore = (s) => ({
  id: s.id,
  store_name: s.store_name || '',
  short_name: s.short_name || '',
  type: s.type || 'STORE',
  category: s.category || '',
  franchise_id: s.franchise_id || 0,
  location_code: s.location_code || '',
  email: s.email || '',
  latitude: parseFloat(s.latitude) || 0,
  longitude: parseFloat(s.longitude) || 0,
  address: s.address || '',
  alt_address: s.alt_address || '',
  city_id: s.city_id || null,
  country_id: s.country_id || null,
  phone: s.phone || '',
  url_key: s.url_key || '',
  store_image: s.store_image || '',
  message: s.message ?? null,
  pincode: s.pincode || '',
  is_active: s.is_active !== undefined ? s.is_active : 1,
  per_day_threshold: s.per_day_threshold ?? null,
  per_hour_threshold: s.per_hour_threshold ?? null,
  opening_time: s.opening_time || '',
  closing_time: s.closing_time || '',
  delivery_type: s.delivery_type || 'standard',
  ecom_delivery: s.ecom_delivery || 0,
  ecom_threshold: s.ecom_threshold ?? 1,
  local_feed: s.local_feed || 0,
  local_feed_code: s.local_feed_code ?? null,
  gst_arn: s.gst_arn || '',
  gstin: s.gstin || '',
  slack_group_url: String(s.slack_group_url || '').includes('hooks.slack.com') ? '' : (s.slack_group_url || ''),
  city_name: s.city_name || '',
  state_name: s.state_name || '',
  state_id: s.state_id ?? null,
  priority: s.priority ?? null,
  is_hyperlocal: s.is_hyperlocal ? 1 : 0,
});

const replaceAll = db.transaction((items) => {
  const before = db.prepare('SELECT COUNT(*) AS n FROM stores').get().n;
  db.exec('DELETE FROM pincode_search_cache');
  db.exec('DELETE FROM stores');
  for (const s of items) upsert.run(mapStore(s));
  return { removed: before, imported: items.length };
});

const result = replaceAll(stores);
console.log(`Removed ${result.removed} old stores, imported ${result.imported} from ${path.basename(jsonPath)}`);
