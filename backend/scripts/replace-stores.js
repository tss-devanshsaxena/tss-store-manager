/**
 * Wipe all stores + pincode cache, then import from JSON.
 * Usage: node scripts/replace-stores.js [path/to/stores.json]
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { getDb } = require('../db/database');
const { replaceStores } = require('../lib/importStores');

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

const result = replaceStores(getDb(), stores);
console.log(`Removed ${result.removed} old stores, imported ${result.imported} from ${path.basename(jsonPath)}`);
