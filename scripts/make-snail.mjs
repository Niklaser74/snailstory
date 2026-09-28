#!/usr/bin/env node
// Writes a backup file for a snail that does not exist yet: a terrarium of a
// given age, looked after twice a day the whole way, saved in the format the
// game's own "Läs in en kopia" reads.
//
// This is for one situation only — somebody lost a snail that cannot be
// recovered, because the box lives in their browser and there was no copy. It
// gives back the name, the age and a look. It does not give back their snail:
// the diary it writes is a diary of days that were simulated just now, not the
// days they kept. Say so when you hand it over.
//
//   node scripts/make-snail.mjs --name Majken --days 74
//   node scripts/make-snail.mjs --name Majken --hatched 2026-07-16 --seed 4711
//
// --care none  leaves the box untended, so it seals up and stays small, which is
// closer to the truth for a snail somebody forgot about.
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Box, DAY_MS } from '../js/life.js';
import { pack, serialize, fileName } from '../js/backup.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (flag, fallback = null) => {
  const i = process.argv.indexOf(flag);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

const name = arg('--name');
const seed = Number(arg('--seed', String((Math.random() * 2 ** 31) | 0)));
const care = arg('--care', 'daily');
const hatched = arg('--hatched');
const days = hatched
  ? Math.round((Date.now() - Date.parse(hatched)) / DAY_MS)
  : Number(arg('--days', '0'));

if (!name || !(days > 0)) {
  console.error('usage: node scripts/make-snail.mjs --name <namn> (--days <n> | --hatched <YYYY-MM-DD>) [--seed n] [--care daily|none] [--out fil]');
  process.exit(1);
}

const now = Date.now();
const born = now - days * DAY_MS;
const box = new Box({ born });
box.add({ name, seed, now: born, quiet: true });

// Twice a day is what a keeper who opens the app morning and evening does, and
// it is what the growth curve is balanced around.
if (care !== 'none') {
  for (let t = born + 6 * 3600000; t < now; t += 12 * 3600000) {
    box.mist(t); box.feed(t, t % 2 ? 'dandelion' : 'lettuce'); box.chalk(t); box.clean(t);
  }
}
box.advanceTo(now);

const file = pack({ box, previous: [], savedAt: now, appVersion: 'made-by-hand' });
const out = arg('--out', join(root, fileName(file, now)));
writeFileSync(out, serialize(file));

const s = box.snails[0];
console.log(`${out}
  ${s.name}, ${days} dygn, skal ${s.size.toFixed(1)} mm, krypt ${(s.distance / 1000).toFixed(1)} m
  ${s.days.length} dagboksrader, ${box.badges.length} märken
  seed ${s.seed} — färg och mönster följer av den, så spara den om bilden ska gå att göra om

  Dagboken är simulerad nu, inte förd. Säg det till den som får filen.`);
