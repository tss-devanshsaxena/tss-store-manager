const fs = require('fs');
const path = require('path');

const SEED_PATH = path.join(__dirname, '../data/tss-stores.seed.json');

function mapStore(s) {
  return {
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
  };
}

const INSERT_SQL = `
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
`;

function insertStores(db, stores) {
  const upsert = db.prepare(INSERT_SQL);
  for (const s of stores) upsert.run(mapStore(s));
  return stores.length;
}

function importStores(db, stores) {
  return db.transaction((items) => insertStores(db, items))(stores);
}

function replaceStores(db, stores) {
  return db.transaction((items) => {
    const before = db.prepare('SELECT COUNT(*) AS n FROM stores').get().n;
    db.exec('DELETE FROM pincode_search_cache');
    db.exec('DELETE FROM stores');
    return { removed: before, imported: insertStores(db, items) };
  })(stores);
}

function seedStoresIfEmpty(db) {
  const count = db.prepare('SELECT COUNT(*) AS n FROM stores').get().n;
  if (count > 0) return 0;

  if (!fs.existsSync(SEED_PATH)) {
    console.warn('No stores in DB and no seed file at data/tss-stores.seed.json');
    return 0;
  }

  const stores = JSON.parse(fs.readFileSync(SEED_PATH, 'utf8'));
  if (!Array.isArray(stores) || stores.length === 0) return 0;

  const imported = importStores(db, stores);
  console.log(`Seeded ${imported} stores from tss-stores.seed.json`);
  return imported;
}

module.exports = { mapStore, importStores, replaceStores, seedStoresIfEmpty, SEED_PATH };
