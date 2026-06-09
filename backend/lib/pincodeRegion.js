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

function isPincodePlausibleAtCoords(pincode, lat, lon) {
  const digit = parseInt(String(pincode)[0], 10);
  const zone = ZONE_BY_FIRST_DIGIT[digit];
  if (!zone) return true;
  return (
    lat >= zone.minLat &&
    lat <= zone.maxLat &&
    lon >= zone.minLon &&
    lon <= zone.maxLon
  );
}

module.exports = { isPincodePlausibleAtCoords };
