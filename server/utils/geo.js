const EARTH_RADIUS_KM = 6371;

/** Great-circle distance between two {lat,lng} points. */
function haversineKm(a, b) {
  if (!a || !b) return null;
  const lat1 = Number(a.lat);
  const lng1 = Number(a.lng);
  const lat2 = Number(b.lat);
  const lng2 = Number(b.lng);
  if (![lat1, lng1, lat2, lng2].every(Number.isFinite)) return null;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Privacy: persist a coarse point (~1 km) instead of the exact coordinates the browser
 * reported. Distances are computed from the coarse point, so nobody can reconstruct an
 * address from stored data.
 */
function coarsePoint(lat, lng) {
  const round = (n) => Math.round(n * 100) / 100;
  return { lat: round(lat), lng: round(lng), updatedAt: new Date() };
}

function formatDistance(km) {
  if (km === null || km === undefined) return null;
  if (km < 1) return 'less than 1 km away';
  if (km < 10) return `${km.toFixed(1)} km away`;
  return `${Math.round(km)} km away`;
}

module.exports = { haversineKm, coarsePoint, formatDistance };
