import { ageFromDob, boundingBox, distanceKm, distanceLabel, snapToGrid, wantsToSee } from '@bluesight/protocol';
import type { Ctx } from './context';
import type { UserRow } from './db';
import { nowSec } from './util';

const ACTIVE_WINDOW = 30 * 86400;

/**
 * "Around" deck: people within the radius of where you are, or of the city you chose to search
 * (a Liberian in Maryland can browse Monrovia before flying home), filtered both ways (each side's age range and who they
 * want to see), minus anyone already swiped, matched or blocked. Cards carry no photo bytes — just
 * a ~25-byte thumbhash and a photo key the app fetches only if the data plan allows it.
 */
export function deckFor(ctx: Ctx, me: UserRow, n: number) {
  if (!me.name || !me.dob || me.lat == null || me.lon == null) return [];
  const myAge = ageFromDob(me.dob) ?? 0;
  const box = boundingBox(me.lat, me.lon, me.radius_km);
  const rows = ctx.db
    .prepare(
      `SELECT u.* FROM users u
       WHERE u.id != ? AND u.banned = 0 AND u.name IS NOT NULL AND u.dob IS NOT NULL
         AND u.lat BETWEEN ? AND ? AND u.lon BETWEEN ? AND ? AND u.last_active > ?
         AND NOT EXISTS (SELECT 1 FROM swipes s WHERE s.from_id = ? AND s.to_id = u.id)
         AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.from_id = ? AND b.to_id = u.id) OR (b.from_id = u.id AND b.to_id = ?))
         AND NOT EXISTS (SELECT 1 FROM matches m WHERE (m.a = ? AND m.b = u.id) OR (m.a = u.id AND m.b = ?))
       ORDER BY u.last_active DESC LIMIT 300`,
    )
    .all(
      me.id,
      box.minLat,
      box.maxLat,
      box.minLon,
      box.maxLon,
      nowSec() - ACTIVE_WINDOW,
      me.id,
      me.id,
      me.id,
      me.id,
      me.id,
    ) as unknown as UserRow[];

  const here = { lat: me.lat, lon: me.lon };
  const out = [];
  for (const u of rows) {
    const age = ageFromDob(u.dob!) ?? 0;
    if (age < me.age_min || age > me.age_max) continue;
    if (myAge < u.age_min || myAge > u.age_max) continue;
    if (!wantsToSee(me.show_me, u.gender) || !wantsToSee(u.show_me, me.gender)) continue;
    const km = distanceKm(here, { lat: u.lat!, lon: u.lon! });
    if (km > me.radius_km) continue;
    out.push({
      u: u.id,
      n: u.name,
      a: age,
      g: u.gender,
      i: u.intent,
      v: u.vibes,
      b: u.bio,
      li: u.lives_in || undefined,
      th: u.thumbhash ?? undefined,
      p: u.photo_key ?? undefined,
      ps: u.photo_key ? [u.photo_s, u.photo_f] : undefined,
      // Someone browsing this city from elsewhere is never shown as "Under 3 km".
      d: u.away ? 'Not in town' : distanceLabel(km),
      aw: u.away ? 1 : undefined,
    });
    if (out.length >= n) break;
  }
  return out;
}

/**
 * Back to "near me" without a location fix: they stop appearing in the city they were browsing
 * (and see nobody) until their phone shares where they are.
 */
export function clearAwayLocation(ctx: Ctx, me: UserRow) {
  ctx.db.prepare('UPDATE users SET lat = NULL, lon = NULL, away = 0 WHERE id = ?').run(me.id);
  me.lat = null;
  me.lon = null;
  me.away = 0;
}

export function updateLocation(ctx: Ctx, me: UserRow, lat: number, lon: number, away: boolean) {
  const p = snapToGrid(lat, lon);
  ctx.db.prepare('UPDATE users SET lat = ?, lon = ?, away = ? WHERE id = ?').run(p.lat, p.lon, away ? 1 : 0, me.id);
  me.lat = p.lat;
  me.lon = p.lon;
  me.away = away ? 1 : 0;
}
