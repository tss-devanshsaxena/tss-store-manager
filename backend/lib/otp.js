const crypto = require('crypto');
const { getDb } = require('../db/database');

const OTP_TTL_MS = 10 * 60 * 1000;

function generateOtp() {
  return String(crypto.randomInt(100000, 999999));
}

function saveOtp(email) {
  const db = getDb();
  const code = generateOtp();
  const expiresAt = new Date(Date.now() + OTP_TTL_MS).toISOString();

  db.prepare(`
    INSERT INTO otp_codes (email, code, expires_at)
    VALUES (?, ?, ?)
    ON CONFLICT(email) DO UPDATE SET
      code = excluded.code,
      expires_at = excluded.expires_at,
      created_at = CURRENT_TIMESTAMP
  `).run(email, code, expiresAt);

  return code;
}

function verifyOtp(email, code) {
  const db = getDb();
  const row = db.prepare('SELECT code, expires_at FROM otp_codes WHERE email = ?').get(email);
  if (!row) return false;
  if (new Date(row.expires_at) < new Date()) {
    db.prepare('DELETE FROM otp_codes WHERE email = ?').run(email);
    return false;
  }
  if (row.code !== String(code).trim()) return false;

  db.prepare('DELETE FROM otp_codes WHERE email = ?').run(email);
  return true;
}

module.exports = { saveOtp, verifyOtp, OTP_TTL_MS };
