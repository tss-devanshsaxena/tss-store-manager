const { ADMIN_EMAIL, isStoreAdmin } = require('../middleware/admin');

function db() {
  return require('../db/database').getDb();
}

function isAuthorizedUser(email) {
  const normalized = String(email || '').toLowerCase().trim();
  if (!normalized) return false;
  if (isStoreAdmin(normalized)) return true;

  const row = db()
    .prepare('SELECT email FROM authorized_users WHERE email = ?')
    .get(normalized);
  return !!row;
}

function authorizeUser(email, authorizedBy = ADMIN_EMAIL) {
  const normalized = String(email || '').toLowerCase().trim();
  if (!normalized) return;

  db()
    .prepare(`
      INSERT INTO authorized_users (email, authorized_by)
      VALUES (?, ?)
      ON CONFLICT(email) DO NOTHING
    `)
    .run(normalized, authorizedBy);
}

function seedAuthorizedUsers(db) {
  db.prepare(`
    INSERT OR IGNORE INTO authorized_users (email, authorized_by)
    VALUES (?, 'system')
  `).run(ADMIN_EMAIL);

  const extra = (process.env.PORTAL_AUTHORIZED_EMAILS || '')
    .split(',')
    .map((e) => e.toLowerCase().trim())
    .filter(Boolean);

  const insert = db.prepare(`
    INSERT OR IGNORE INTO authorized_users (email, authorized_by)
    VALUES (?, 'env')
  `);
  for (const email of extra) {
    insert.run(email);
  }
}

module.exports = { isAuthorizedUser, authorizeUser, seedAuthorizedUsers };
