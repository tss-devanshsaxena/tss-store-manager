const fs = require('fs');
const path = require('path');

const JSON_PATH = path.join(__dirname, '../data/postcode_master.json');

let masterSet = null;

function loadPostcodeMaster() {
  if (masterSet) return masterSet;

  if (!fs.existsSync(JSON_PATH)) {
    console.warn('postcode_master.json not found — Shiprocket filter disabled');
    masterSet = new Set();
    return masterSet;
  }

  const pincodes = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));
  masterSet = new Set(pincodes);
  console.log(`Loaded ${masterSet.size} Shiprocket serviceable pincodes`);
  return masterSet;
}

function isServiceablePincode(pincode) {
  const set = loadPostcodeMaster();
  if (set.size === 0) return true;
  return set.has(String(pincode).padStart(6, '0'));
}

function getMasterCount() {
  return loadPostcodeMaster().size;
}

module.exports = { loadPostcodeMaster, isServiceablePincode, getMasterCount };
