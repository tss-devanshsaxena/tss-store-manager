const express = require('express');
const jwt = require('jsonwebtoken');
const { getDb } = require('../db/database');
const { JWT_SECRET } = require('../middleware/auth');
const { isStoreAdmin } = require('../middleware/admin');
const { isSouledStoreEmail, sendOtpToSlack } = require('../lib/slack');
const { saveOtp, verifyOtp } = require('../lib/otp');

const router = express.Router();

function normalizeEmail(email) {
  return String(email || '').toLowerCase().trim();
}

function upsertUser(email) {
  const db = getDb();
  const name = email.split('@')[0].replace(/\./g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  const existing = db.prepare('SELECT id, email, name FROM users WHERE email = ?').get(email);

  if (existing) {
    return existing;
  }

  const result = db.prepare('INSERT INTO users (email, password, name) VALUES (?, ?, ?)').run(email, '', name);
  return db.prepare('SELECT id, email, name FROM users WHERE id = ?').get(result.lastInsertRowid);
}

function buildUserResponse(user) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    isAdmin: isStoreAdmin(user.email),
  };
}

router.post('/request-otp', async (req, res) => {
  const email = normalizeEmail(req.body.email);
  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }
  if (!isSouledStoreEmail(email)) {
    return res.status(400).json({ error: 'Only @thesouledstore.com email addresses are allowed' });
  }

  try {
    const otp = saveOtp(email);
    await sendOtpToSlack(email, otp);
    res.json({ message: 'OTP sent to your Slack DM', email });
  } catch (err) {
    console.error('OTP request failed:', err.message);
    res.status(500).json({ error: err.message || 'Failed to send OTP on Slack' });
  }
});

router.post('/verify-otp', (req, res) => {
  const email = normalizeEmail(req.body.email);
  const code = String(req.body.otp || req.body.code || '').trim();

  if (!email || !code) {
    return res.status(400).json({ error: 'Email and OTP are required' });
  }
  if (!isSouledStoreEmail(email)) {
    return res.status(400).json({ error: 'Only @thesouledstore.com email addresses are allowed' });
  }
  if (!verifyOtp(email, code)) {
    return res.status(401).json({ error: 'Invalid or expired OTP' });
  }

  const user = upsertUser(email);
  const userPayload = buildUserResponse(user);
  const token = jwt.sign(userPayload, JWT_SECRET, { expiresIn: '24h' });

  res.json({ token, user: userPayload });
});

module.exports = router;
