const express = require('express');
const { getDb } = require('../db/database');
const { authMiddleware } = require('../middleware/auth');
const { clearStoreCache } = require('../lib/pincodeCache');

const router = express.Router();

router.use(authMiddleware);

router.get('/', (req, res) => {
  const db = getDb();
  const stores = db.prepare(`
    SELECT id, store_name, short_name, type, category, location_code, email,
           latitude, longitude, address, city_name, state_name, phone, pincode,
           is_active, is_hyperlocal, opening_time, closing_time, delivery_type, gstin, created_at
    FROM stores ORDER BY store_name
  `).all();
  res.json(stores);
});

router.get('/:id', (req, res) => {
  const db = getDb();
  const store = db.prepare('SELECT * FROM stores WHERE id = ?').get(req.params.id);
  if (!store) return res.status(404).json({ error: 'Store not found' });
  res.json(store);
});

router.post('/bulk', (req, res) => {
  const { stores } = req.body;
  if (!Array.isArray(stores) || stores.length === 0) {
    return res.status(400).json({ error: 'stores array required' });
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
    ON CONFLICT(id) DO UPDATE SET
      store_name = excluded.store_name,
      latitude = excluded.latitude,
      longitude = excluded.longitude,
      address = excluded.address,
      city_name = excluded.city_name,
      state_name = excluded.state_name,
      pincode = excluded.pincode,
      is_active = excluded.is_active,
      is_hyperlocal = excluded.is_hyperlocal,
      updated_at = CURRENT_TIMESTAMP
  `);

  const bulkInsert = db.transaction((items) => {
    let inserted = 0, updated = 0;
    for (const s of items) {
      const existing = db.prepare('SELECT id FROM stores WHERE id = ?').get(s.id);
      upsert.run({
        id: s.id || null,
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
        message: s.message || null,
        pincode: s.pincode || '',
        is_active: s.is_active !== undefined ? s.is_active : 1,
        per_day_threshold: s.per_day_threshold || null,
        per_hour_threshold: s.per_hour_threshold || null,
        opening_time: s.opening_time || '',
        closing_time: s.closing_time || '',
        delivery_type: s.delivery_type || 'standard',
        ecom_delivery: s.ecom_delivery || 0,
        ecom_threshold: s.ecom_threshold || 1,
        local_feed: s.local_feed || 0,
        local_feed_code: s.local_feed_code || null,
        gst_arn: s.gst_arn || '',
        gstin: s.gstin || '',
        slack_group_url: s.slack_group_url || '',
        city_name: s.city_name || '',
        state_name: s.state_name || '',
        state_id: s.state_id || null,
        priority: s.priority || null,
        is_hyperlocal: s.is_hyperlocal ? 1 : 0
      });
      existing ? updated++ : inserted++;
    }
    return { inserted, updated };
  });

  const result = bulkInsert(stores);
  res.json({ message: 'Bulk upload successful', ...result, total: stores.length });
});

router.post('/', (req, res) => {
  const s = req.body;
  if (!s.store_name || !s.latitude || !s.longitude) {
    return res.status(400).json({ error: 'store_name, latitude, longitude required' });
  }

  const db = getDb();
  const result = db.prepare(`
    INSERT INTO stores (
      store_name, short_name, type, category, location_code, email,
      latitude, longitude, address, city_name, state_name, phone, pincode,
      opening_time, closing_time, gstin, is_active, is_hyperlocal
    ) VALUES (
      @store_name, @short_name, @type, @category, @location_code, @email,
      @latitude, @longitude, @address, @city_name, @state_name, @phone, @pincode,
      @opening_time, @closing_time, @gstin, @is_active, @is_hyperlocal
    )
  `).run({
    store_name: s.store_name,
    short_name: s.short_name || 'The Souled Store Pvt Ltd',
    type: s.type || 'STORE',
    category: s.category || 'IN_HOUSE',
    location_code: s.location_code || '',
    email: s.email || '',
    latitude: parseFloat(s.latitude),
    longitude: parseFloat(s.longitude),
    address: s.address || '',
    city_name: s.city_name || '',
    state_name: s.state_name || '',
    phone: s.phone || '',
    pincode: s.pincode || '',
    opening_time: s.opening_time || '10:00:00',
    closing_time: s.closing_time || '22:00:00',
    gstin: s.gstin || '',
    is_active: 1,
    is_hyperlocal: s.is_hyperlocal ? 1 : 0
  });

  const store = db.prepare('SELECT * FROM stores WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(store);
});

router.put('/:id', (req, res) => {
  const s = req.body;
  const db = getDb();
  const existing = db.prepare('SELECT id, latitude, longitude FROM stores WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Store not found' });

  const updates = { id: req.params.id };
  const fields = [
    'store_name', 'email', 'phone', 'address', 'city_name', 'state_name',
    'pincode', 'latitude', 'longitude', 'opening_time', 'closing_time',
    'is_active', 'location_code', 'gstin'
  ];
  for (const f of fields) {
    if (s[f] !== undefined) {
      updates[f] = (f === 'latitude' || f === 'longitude') ? parseFloat(s[f]) : s[f];
    }
  }
  if (s.is_hyperlocal !== undefined) updates.is_hyperlocal = s.is_hyperlocal ? 1 : 0;

  const setClauses = Object.keys(updates)
    .filter((k) => k !== 'id')
    .map((k) => `${k} = @${k}`)
    .join(', ');

  if (setClauses) {
    db.prepare(`UPDATE stores SET ${setClauses}, updated_at = CURRENT_TIMESTAMP WHERE id = @id`).run(updates);
    if (updates.latitude !== undefined || updates.longitude !== undefined) {
      clearStoreCache(req.params.id);
    }
  }

  res.json(db.prepare('SELECT * FROM stores WHERE id = ?').get(req.params.id));
});

router.delete('/:id', (req, res) => {
  const db = getDb();
  const result = db.prepare('DELETE FROM stores WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Store not found' });
  clearStoreCache(req.params.id);
  res.json({ message: 'Store deleted' });
});

module.exports = router;
