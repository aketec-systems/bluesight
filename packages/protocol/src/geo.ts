/**
 * Location never leaves the phone at full precision. It is snapped to a ~2 km grid first, and the
 * server snaps again, so precise distances (and trilateration from repeated distance readings) are
 * impossible by construction.
 */
export const GRID_DEGREES = 0.02;

export function snapToGrid(lat: number, lon: number): { lat: number; lon: number } {
  const s = (v: number) => Math.round(Math.round(v / GRID_DEGREES) * GRID_DEGREES * 1000) / 1000;
  return { lat: Math.max(-90, Math.min(90, s(lat))), lon: ((((s(lon) + 180) % 360) + 360) % 360) - 180 };
}

export function distanceKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Coarse buckets are all that's ever shown. */
export function distanceLabel(km: number): string {
  if (km < 3) return 'Under 3 km';
  if (km < 10) return 'Under 10 km';
  if (km < 25) return 'Under 25 km';
  if (km < 50) return 'Under 50 km';
  return '50+ km away';
}

/** Rough bounding box for a radius query on snapped coordinates. */
export function boundingBox(lat: number, lon: number, km: number) {
  const dLat = km / 111;
  const dLon = km / (111 * Math.max(0.1, Math.cos((lat * Math.PI) / 180)));
  return { minLat: lat - dLat, maxLat: lat + dLat, minLon: lon - dLon, maxLon: lon + dLon };
}
