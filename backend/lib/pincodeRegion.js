const fs = require('fs');
const path = require('path');

// Loaded lazily on first use
let _centroids = null;
function loadCentroids() {
  if (_centroids) return _centroids;
  const p = path.join(__dirname, '../data/pincode_centroids.json');
  try {
    _centroids = JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    _centroids = {};
  }
  return _centroids;
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Maximum km a node may be from its pincode's known centroid.
// Covers intra-city mis-tags (e.g. 400001 Fort on a node in Dahisar ~30km away).
const CENTROID_THRESHOLD_KM = 12;

// Extra slack (km) added to radiusKm when checking centroid-to-store distance.
// Accounts for pincodes that straddle the search boundary (centroid just outside).
const CENTROID_STORE_SLACK_KM = 5;

/**
 * Coarse India Post first-digit zones vs lat/lon.
 * Used to drop obvious OSM mis-tags (e.g. 250001 Meerut on a Pune clinic node).
 */
const ZONE_BY_FIRST_DIGIT = {
  1: { minLat: 28, maxLat: 35.5, minLon: 72, maxLon: 77.5 },
  2: { minLat: 26, maxLat: 31.5, minLon: 76.5, maxLon: 84.5 },
  3: { minLat: 20, maxLat: 27, minLon: 68, maxLon: 76.5 },
  4: { minLat: 15, maxLat: 22.5, minLon: 72.5, maxLon: 81 },
  5: { minLat: 12.5, maxLat: 20, minLon: 74, maxLon: 84.5 },
  6: { minLat: 8, maxLat: 13.5, minLon: 74.5, maxLon: 80.5 },
  7: { minLat: 20, maxLat: 28.5, minLon: 84, maxLon: 97.5 },
  8: { minLat: 21.5, maxLat: 27.5, minLon: 83, maxLon: 88.5 },
};

/**
 * Fine-grained 3-digit postal district zones.
 * When a prefix is present here it replaces the coarse first-digit check.
 * Covers every city that has a TSS store plus the cross-city errors observed
 * in the OSM geocoding audit (e.g. 431001 Aurangabad landing near Pune,
 * 570008 Mysuru landing 0.28 km from Indiranagar Bangalore).
 * Bounding boxes are deliberately generous to avoid false rejections on
 * pincodes that straddle district borders.
 */
const ZONE_BY_PREFIX3 = {
  // ── Delhi / NCR ────────────────────────────────────────────────────────────
  110: { minLat: 28.40, maxLat: 28.90, minLon: 76.80, maxLon: 77.50 }, // Delhi
  111: { minLat: 28.40, maxLat: 28.90, minLon: 76.80, maxLon: 77.50 }, // Delhi (army)
  120: { minLat: 28.35, maxLat: 28.70, minLon: 77.10, maxLon: 77.40 }, // Faridabad / Ballabhgarh
  121: { minLat: 28.35, maxLat: 28.65, minLon: 77.20, maxLon: 77.45 }, // Faridabad
  122: { minLat: 28.30, maxLat: 28.65, minLon: 76.90, maxLon: 77.15 }, // Gurugram
  123: { minLat: 28.00, maxLat: 28.45, minLon: 76.80, maxLon: 77.10 }, // Rewari / Mahendragarh
  124: { minLat: 28.40, maxLat: 29.00, minLon: 76.50, maxLon: 76.95 }, // Rohtak / Jhajjar
  201: { minLat: 28.45, maxLat: 28.75, minLon: 77.25, maxLon: 77.55 }, // Noida / Ghaziabad
  202: { minLat: 27.80, maxLat: 28.60, minLon: 77.80, maxLon: 78.80 }, // Aligarh / Agra region
  // ── Gujarat ────────────────────────────────────────────────────────────────
  380: { minLat: 22.85, maxLat: 23.15, minLon: 72.40, maxLon: 72.75 }, // Ahmedabad city
  381: { minLat: 22.85, maxLat: 23.15, minLon: 72.40, maxLon: 72.75 }, // Ahmedabad city
  382: { minLat: 22.55, maxLat: 23.60, minLon: 72.15, maxLon: 73.15 }, // Gandhinagar / Ahmedabad rural
  383: { minLat: 22.30, maxLat: 23.30, minLon: 72.55, maxLon: 73.40 }, // Anand / Kheda
  384: { minLat: 23.10, maxLat: 24.10, minLon: 71.70, maxLon: 72.85 }, // Mehsana / Patan
  385: { minLat: 23.70, maxLat: 24.70, minLon: 71.40, maxLon: 73.10 }, // Banaskantha
  390: { minLat: 21.85, maxLat: 22.65, minLon: 72.90, maxLon: 73.55 }, // Vadodara
  391: { minLat: 21.85, maxLat: 22.65, minLon: 72.90, maxLon: 73.80 }, // Vadodara district
  392: { minLat: 21.70, maxLat: 22.50, minLon: 72.60, maxLon: 73.30 }, // Bharuch / Ankleshwar
  394: { minLat: 21.00, maxLat: 21.60, minLon: 72.50, maxLon: 73.30 }, // Surat south
  395: { minLat: 20.95, maxLat: 21.60, minLon: 72.60, maxLon: 73.25 }, // Surat city
  396: { minLat: 20.45, maxLat: 21.55, minLon: 72.45, maxLon: 73.35 }, // Surat / Navsari
  // ── Maharashtra ─────────────────────────────────────────────────────────────
  400: { minLat: 18.85, maxLat: 19.35, minLon: 72.70, maxLon: 73.15 }, // Mumbai city
  401: { minLat: 19.00, maxLat: 19.80, minLon: 72.75, maxLon: 73.35 }, // Thane / Mira-Bhayandar
  402: { minLat: 18.55, maxLat: 19.25, minLon: 72.75, maxLon: 73.45 }, // Navi Mumbai / Raigad coast
  403: { minLat: 14.80, maxLat: 15.95, minLon: 73.55, maxLon: 74.45 }, // Goa
  410: { minLat: 17.85, maxLat: 19.25, minLon: 72.85, maxLon: 74.05 }, // Pune fringe / Alibag / Pen
  411: { minLat: 18.20, maxLat: 18.80, minLon: 73.50, maxLon: 74.20 }, // Pune city
  412: { minLat: 17.45, maxLat: 18.85, minLon: 73.25, maxLon: 74.75 }, // Pune district
  413: { minLat: 16.80, maxLat: 18.60, minLon: 74.45, maxLon: 76.95 }, // Solapur / Osmanabad
  414: { minLat: 18.45, maxLat: 19.70, minLon: 74.20, maxLon: 75.45 }, // Ahmednagar
  415: { minLat: 16.75, maxLat: 18.25, minLon: 73.70, maxLon: 75.10 }, // Satara / Sangli
  416: { minLat: 16.20, maxLat: 17.30, minLon: 73.75, maxLon: 75.10 }, // Kolhapur / Sangli south
  421: { minLat: 18.85, maxLat: 20.15, minLon: 72.75, maxLon: 73.85 }, // Thane district
  422: { minLat: 19.65, maxLat: 20.45, minLon: 73.40, maxLon: 74.45 }, // Nashik city/near
  423: { minLat: 19.75, maxLat: 20.85, minLon: 73.40, maxLon: 75.10 }, // Nashik district
  424: { minLat: 20.45, maxLat: 21.45, minLon: 74.40, maxLon: 76.10 }, // Dhule / Jalgaon west
  425: { minLat: 20.55, maxLat: 21.55, minLon: 74.90, maxLon: 76.60 }, // Jalgaon
  431: { minLat: 19.25, maxLat: 20.95, minLon: 74.45, maxLon: 77.85 }, // Aurangabad / Marathwada
  432: { minLat: 19.55, maxLat: 20.25, minLon: 74.90, maxLon: 76.60 }, // Aurangabad district
  440: { minLat: 20.85, maxLat: 21.45, minLon: 78.75, maxLon: 79.35 }, // Nagpur city
  441: { minLat: 20.45, maxLat: 21.55, minLon: 78.45, maxLon: 79.85 }, // Nagpur district
  // ── Andhra Pradesh / Telangana ───────────────────────────────────────────────
  500: { minLat: 17.10, maxLat: 17.90, minLon: 78.15, maxLon: 79.00 }, // Hyderabad / Secunderabad
  501: { minLat: 16.75, maxLat: 17.90, minLon: 77.75, maxLon: 79.05 }, // Ranga Reddy / HYD outskirts
  502: { minLat: 17.15, maxLat: 18.25, minLon: 77.75, maxLon: 78.85 }, // Medak / Sangareddy
  503: { minLat: 17.70, maxLat: 18.90, minLon: 77.80, maxLon: 79.30 }, // Nizamabad / Karimnagar
  504: { minLat: 17.80, maxLat: 19.30, minLon: 78.50, maxLon: 80.00 }, // Adilabad / Karimnagar
  508: { minLat: 16.70, maxLat: 17.60, minLon: 78.80, maxLon: 79.80 }, // Nalgonda
  509: { minLat: 16.50, maxLat: 17.50, minLon: 77.70, maxLon: 78.80 }, // Mahbubnagar
  // ── Karnataka ───────────────────────────────────────────────────────────────
  560: { minLat: 12.75, maxLat: 13.20, minLon: 77.30, maxLon: 78.00 }, // Bangalore city
  561: { minLat: 12.45, maxLat: 13.75, minLon: 76.85, maxLon: 77.90 }, // Bangalore rural / Tumkur
  562: { minLat: 12.35, maxLat: 13.55, minLon: 76.65, maxLon: 77.70 }, // Ramanagara / Mandya border
  563: { minLat: 12.35, maxLat: 13.65, minLon: 77.45, maxLon: 78.45 }, // Kolar / Chikkaballapur
  570: { minLat: 11.80, maxLat: 12.60, minLon: 76.20, maxLon: 77.00 }, // Mysuru city
  571: { minLat: 11.45, maxLat: 12.75, minLon: 75.65, maxLon: 77.15 }, // Mysuru district
  572: { minLat: 12.80, maxLat: 14.00, minLon: 76.20, maxLon: 77.20 }, // Tumkur
  573: { minLat: 12.75, maxLat: 13.70, minLon: 75.80, maxLon: 76.70 }, // Hassan
  574: { minLat: 12.40, maxLat: 13.30, minLon: 74.75, maxLon: 75.70 }, // Dakshina Kannada / Udupi
  575: { minLat: 12.60, maxLat: 13.60, minLon: 74.60, maxLon: 75.55 }, // Mangalore / Udupi
  576: { minLat: 13.15, maxLat: 14.10, minLon: 74.40, maxLon: 75.35 }, // Uttara Kannada / Udupi border
  577: { minLat: 13.40, maxLat: 14.40, minLon: 75.35, maxLon: 76.40 }, // Shimoga / Chikmagalur
  580: { minLat: 14.75, maxLat: 15.60, minLon: 74.75, maxLon: 75.65 }, // Dharwad / Hubli
  581: { minLat: 14.20, maxLat: 15.65, minLon: 74.55, maxLon: 75.70 }, // Dharwad district / Haveri
  // ── Tamil Nadu ───────────────────────────────────────────────────────────────
  600: { minLat: 12.80, maxLat: 13.40, minLon: 79.85, maxLon: 80.40 }, // Chennai city
  601: { minLat: 12.40, maxLat: 13.55, minLon: 79.70, maxLon: 80.35 }, // Kancheepuram / Chennai outskirts
  602: { minLat: 12.55, maxLat: 13.45, minLon: 79.75, maxLon: 80.30 }, // Tiruvallur
  603: { minLat: 12.40, maxLat: 13.00, minLon: 79.75, maxLon: 80.20 }, // Kancheepuram south
  620: { minLat: 10.60, maxLat: 11.10, minLon: 78.45, maxLon: 79.00 }, // Tiruchirappalli
  625: { minLat: 9.65,  maxLat: 10.30, minLon: 77.65, maxLon: 78.50 }, // Madurai
  626: { minLat: 9.35,  maxLat: 10.15, minLon: 77.55, maxLon: 78.25 }, // Virudhunagar
  627: { minLat: 8.45,  maxLat: 9.35,  minLon: 77.45, maxLon: 78.05 }, // Tirunelveli
  628: { minLat: 8.35,  maxLat: 9.25,  minLon: 77.45, maxLon: 78.35 }, // Tuticorin / Thoothukudi
  // ── Kerala ───────────────────────────────────────────────────────────────────
  680: { minLat: 9.90,  maxLat: 10.60, minLon: 76.10, maxLon: 76.70 }, // Thrissur
  682: { minLat: 9.85,  maxLat: 10.25, minLon: 76.15, maxLon: 76.55 }, // Ernakulam / Kochi
  695: { minLat: 8.35,  maxLat: 8.85,  minLon: 76.75, maxLon: 77.15 }, // Thiruvananthapuram
};

function isPincodePlausibleAtCoords(pincode, lat, lon) {
  const str = String(pincode);

  // Layer 1: 3-digit district zone (catches cross-city errors like Aurangabad→Pune)
  const prefix3 = parseInt(str.slice(0, 3), 10);
  const zone3 = ZONE_BY_PREFIX3[prefix3];
  if (zone3) {
    if (
      lat < zone3.minLat || lat > zone3.maxLat ||
      lon < zone3.minLon || lon > zone3.maxLon
    ) return false;
  } else {
    // Layer 1 fallback: coarse first-digit zone
    const digit = parseInt(str[0], 10);
    const zone = ZONE_BY_FIRST_DIGIT[digit];
    if (zone && (lat < zone.minLat || lat > zone.maxLat || lon < zone.minLon || lon > zone.maxLon)) {
      return false;
    }
  }

  // Layer 2: centroid proximity (catches intra-city errors like 400001 Fort on a Dahisar node)
  const centroids = loadCentroids();
  const centroid = centroids[str];
  if (centroid) {
    const dist = haversineKm(centroid[0], centroid[1], lat, lon);
    if (dist > CENTROID_THRESHOLD_KM) return false;
  }

  return true;
}

/**
 * Checks that the pincode's centroid is within radiusKm + CENTROID_STORE_SLACK_KM
 * of the store. This catches stray OSM nodes near a store that belong to a
 * pincode whose actual area is far away (e.g. a node physically at Malad
 * tagged 400022 Bandra, 16 km from a Malad store searched at 10 km).
 * Returns true when no centroid data exists for the pincode (benefit of doubt).
 */
function isPincodeCentroidNearStore(pincode, storeLat, storeLon, radiusKm) {
  const centroids = loadCentroids();
  const centroid = centroids[String(pincode)];
  if (!centroid) return true;
  const dist = haversineKm(centroid[0], centroid[1], storeLat, storeLon);
  return dist <= radiusKm + CENTROID_STORE_SLACK_KM;
}

module.exports = { isPincodePlausibleAtCoords, isPincodeCentroidNearStore };
