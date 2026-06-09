/**
 * Rebuild postcode_master.json from backend/data/postcode_master.xls
 * Run: node scripts/build-postcode-master.js
 */
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const xlsPath = path.join(__dirname, '../data/postcode_master.xls');
const jsonPath = path.join(__dirname, '../data/postcode_master.json');

if (!fs.existsSync(xlsPath)) {
  console.error('Missing data/postcode_master.xls — place the Shiprocket export there first.');
  process.exit(1);
}

const wb = XLSX.readFile(xlsPath);
const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
const pincodes = rows
  .map((r) => String(r.postcode).padStart(6, '0'))
  .filter((p) => /^\d{6}$/.test(p));
const unique = [...new Set(pincodes)].sort();

fs.writeFileSync(jsonPath, JSON.stringify(unique));
console.log(`Wrote ${unique.length} pincodes → data/postcode_master.json`);
