const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'store_dashboard.db');

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initSchema();
  }
  return db;
}

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      name TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS stores (
      id INTEGER PRIMARY KEY,
      store_name TEXT NOT NULL,
      short_name TEXT,
      type TEXT,
      category TEXT,
      franchise_id INTEGER DEFAULT 0,
      location_code TEXT,
      email TEXT,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      address TEXT,
      alt_address TEXT,
      city_id INTEGER,
      country_id INTEGER,
      phone TEXT,
      url_key TEXT,
      store_image TEXT,
      message TEXT,
      pincode TEXT,
      is_active INTEGER DEFAULT 1,
      per_day_threshold INTEGER,
      per_hour_threshold INTEGER,
      opening_time TEXT,
      closing_time TEXT,
      delivery_type TEXT,
      ecom_delivery INTEGER DEFAULT 0,
      ecom_threshold INTEGER DEFAULT 1,
      local_feed INTEGER DEFAULT 0,
      local_feed_code INTEGER,
      gst_arn TEXT,
      gstin TEXT,
      slack_group_url TEXT,
      city_name TEXT,
      state_name TEXT,
      state_id INTEGER,
      priority TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  migrateStores();

  db.exec(`
    CREATE TABLE IF NOT EXISTS pincode_search_cache (
      store_id INTEGER NOT NULL,
      range_km REAL NOT NULL,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      pincodes_json TEXT NOT NULL,
      total_found INTEGER NOT NULL DEFAULT 0,
      excluded INTEGER NOT NULL DEFAULT 0,
      cached_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (store_id, range_km)
    );
  `);

  // Seed default admin user
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get('admin@thesouledstore.com');
  if (!existing) {
    const hashed = bcrypt.hashSync('TSS@admin123', 10);
    db.prepare('INSERT INTO users (email, password, name) VALUES (?, ?, ?)').run(
      'admin@thesouledstore.com',
      hashed,
      'TSS Admin'
    );
  }
}

function migrateStores() {
  const cols = db.prepare('PRAGMA table_info(stores)').all().map((c) => c.name);
  if (!cols.includes('is_hyperlocal')) {
    db.prepare('ALTER TABLE stores ADD COLUMN is_hyperlocal INTEGER DEFAULT 0').run();
  }
}

module.exports = { getDb };
