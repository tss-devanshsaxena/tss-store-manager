require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { getDb } = require('./db/database');
const { loadPostcodeMaster } = require('./lib/postcodeMaster');
const { startScheduler } = require('./lib/scheduler');

const app = express();
const PORT = process.env.PORT || 5000;

const allowedOrigins = (process.env.FRONTEND_URL || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    // Allow non-browser clients (curl, server-to-server)
    if (!origin) return callback(null, true);
    if (allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    callback(new Error(`CORS blocked for origin: ${origin}`));
  },
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));

// Init DB, Shiprocket postcode master, and background scheduler on startup
getDb();
loadPostcodeMaster();
startScheduler();

app.use('/api/auth', require('./routes/auth'));
app.use('/api/stores', require('./routes/stores'));
app.use('/api/pincodes', require('./routes/pincodes'));

app.get('/api/health', (_, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason?.message || reason);
});

app.listen(PORT, () => {
  console.log(`TSS Store Dashboard API running on port ${PORT}`);
});
