// Invariants that are cheap to lock: the balance constants keep their meaning,
// every badge and every food has words in both languages, the numbers are
// formatted the way the diary assumes, and the snail's lap of the glass is a
// continuous path.
//   node test/rules.test.mjs
import assert from 'node:assert/strict';
import { roman, splitHeir, heirName, NAME_MAX,
  LIFE_DAYS, OLD_DAYS, EGG_MS, TICK_MS, SEAL_AT, WAKE_AT, SIZE_HATCH, SIZE_ADULT, SIZE_MAX,
  MOIST_HOURS, FOOD_HOURS, CALCIUM_HOURS, GRIME_HOURS, NIGHT_ACTIVITY, DAY_ACTIVITY, SPEED_MM_S,
  FOODS, FOOD_EFFECT, BADGES, SHELL_COLORS, REMINDER_KINDS, PET_SHY_MS, retraction, WAKE_STRETCH_MS, stretching, identity, isNight, rnd } from '../js/life.js';
import { DIARY_KEYS } from '../js/diary.js';
import { keysOf } from '../js/i18n.js';
import { placeOnPath, stackLayout, PERIMETER, BOX_W, BOX_H } from '../js/view.js';
import * as fmt from '../js/fmt.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

let failed = 0;
function test(name, fn) {
  try { fn(); console.log(`ok   ${name}`); } catch (e) { failed++; console.log(`FAIL ${name}\n     ${e.message}`); }
}

test('three years is three years, and the egg is a short wait', () => {
  assert.equal(LIFE_DAYS, 1095);
  assert.ok(OLD_DAYS < LIFE_DAYS && OLD_DAYS > LIFE_DAYS - 200, 'old age is the last stretch, not half the life');
  assert.ok(EGG_MS < 5 * 60 * 1000, 'nobody waits longer than a few minutes to meet it');
  assert.ok(EGG_MS > 30 * 1000, 'but it is a wait, which is the point');
});

test('the needs run out slowly enough to be a hobby, not a chore', () => {
  assert.ok(MOIST_HOURS >= 24, 'a day away must not be a crisis');
  assert.ok(FOOD_HOURS >= 24);
  assert.ok(CALCIUM_HOURS >= 7 * 24);
  assert.ok(GRIME_HOURS >= 3 * 24);
  assert.ok(SEAL_AT < WAKE_AT, 'coming out takes more than going in');
  assert.ok(SEAL_AT > 0, 'it seals before the bar is empty, so the bar is honest');
});

test('the shell has somewhere to grow to', () => {
  assert.ok(SIZE_HATCH < SIZE_ADULT);
  assert.ok(SIZE_ADULT < SIZE_MAX);
  assert.ok(SIZE_MAX <= 50, 'a garden snail, not a coconut');
});

test('it is nocturnal, and slower than everything else in the series', () => {
  assert.ok(NIGHT_ACTIVITY > DAY_ACTIVITY * 3, 'the night is when it happens');
  assert.ok(SPEED_MM_S < 2, 'about a metre an hour, which is true of real snails');
  const night = Date.UTC(2026, 5, 10, 23, 0, 0);
  const noon = Date.UTC(2026, 5, 10, 11, 0, 0);
  assert.equal(isNight(night, 0), true);
  assert.equal(isNight(noon, 0), false);
});

test('the hash is stable, spread out, and ignores how it was reached', () => {
  assert.equal(rnd(7, 100, 1), rnd(7, 100, 1));
  assert.notEqual(rnd(7, 100, 1), rnd(7, 101, 1));
  assert.notEqual(rnd(7, 100, 1), rnd(8, 100, 1));
  let sum = 0;
  for (let i = 0; i < 5000; i++) { const v = rnd(3, i, 1); assert.ok(v >= 0 && v < 1); sum += v; }
  const mean = sum / 5000;
  assert.ok(mean > 0.45 && mean < 0.55, `mean ${mean.toFixed(3)}`);
});

test('a seed decides the shell, and the same seed decides it again', () => {
  assert.deepEqual(identity(42), identity(42));
  const colors = new Set();
  for (let s = 0; s < 400; s++) colors.add(identity(s).color);
  assert.ok(colors.size >= 6, `only ${colors.size} shell colours ever turn up`);
  for (const c of colors) assert.ok(SHELL_COLORS.includes(c));
});

test('every badge, food and diary line has words in both languages', () => {
  const sv = new Set(keysOf('sv'));
  const en = new Set(keysOf('en'));
  assert.deepEqual([...sv].sort(), [...en].sort(), 'sv and en must hold the same keys');
  for (const b of BADGES) {
    assert.ok(sv.has('badge.' + b.id), 'no name for badge ' + b.id);
    assert.ok(sv.has('badge.' + b.id + '.how'), 'no hint for badge ' + b.id);
  }
  for (const f of FOODS) {
    assert.ok(sv.has('food.' + f), 'no name for food ' + f);
    assert.ok(FOOD_EFFECT[f], 'no effect for food ' + f);
  }
  for (const k of DIARY_KEYS) assert.ok(sv.has(k), 'diary key without a line: ' + k);
  for (const s of ['egg', 'hatchling', 'juvenile', 'adult', 'old', 'gone']) assert.ok(sv.has('stage.' + s));
  for (const m of ['egg', 'sealed', 'dead', 'crawling', 'dry', 'hungry', 'dirty', 'resting', 'content']) assert.ok(sv.has('mood.' + m));
});

test('badges are not all won on the first evening', () => {
  const slow = BADGES.filter((b) => /year|month|week|kilometre|hundredM|longSleep/.test(b.id));
  assert.ok(slow.length >= 7, 'the collection has to take time');
  assert.equal(BADGES.length, new Set(BADGES.map((b) => b.id)).size, 'duplicate badge id');
});

test('numbers read as a keeper would say them', () => {
  assert.equal(fmt.distance(8, 'sv'), '8 mm');
  assert.equal(fmt.distance(84, 'sv'), '8,4 cm');
  assert.equal(fmt.distance(84, 'en'), '8.4 cm');
  assert.equal(fmt.distance(1350, 'sv'), '1,35 m');
  assert.equal(fmt.distance(24000, 'sv'), '24,0 m');
  assert.equal(fmt.distance(2400000, 'sv'), '2,40 km');
  assert.equal(fmt.size(38.26, 'sv'), '38,3 mm');
  assert.equal(fmt.age(3 * 86400000, 'sv'), '3 dagar');
  assert.equal(fmt.age(86400000, 'en'), '1 day');
  assert.equal(fmt.age(366 * 86400000, 'sv'), '1 år 1 dag');
  assert.equal(fmt.span(5 * 3600000, 'sv'), '5 h');
});

test('the lap of the glass is one continuous metre', () => {
  assert.ok(Math.abs(PERIMETER - (2 * (BOX_W + BOX_H) - 8 * 25 + 2 * Math.PI * 25)) < 0.001);
  assert.ok(PERIMETER > 900 && PERIMETER < 1100, 'about a metre, so a metre is a lap');
  let prev = placeOnPath(0);
  for (let mm = 1; mm <= PERIMETER + 5; mm += 1) {
    const p = placeOnPath(mm);
    const jump = Math.hypot(p.x - prev.x, p.y - prev.y);
    assert.ok(jump < 1.6, `jump of ${jump.toFixed(2)} mm at ${mm}`);
    assert.ok(Math.abs(Math.hypot(p.nx, p.ny) - 1) < 1e-9, 'the surface normal must be a unit vector');
    assert.ok(p.x >= -0.001 && p.x <= BOX_W + 0.001 && p.y >= -0.001 && p.y <= BOX_H + 0.001, 'outside the box');
    prev = p;
  }
  // all four surfaces are visited, so a snail that keeps going ends up on the lid
  const normals = new Set();
  for (let mm = 0; mm < PERIMETER; mm += 0.5) { const p = placeOnPath(mm); normals.add(`${Math.round(p.nx)},${Math.round(p.ny)}`); }
  for (const n of ['0,-1', '-1,0', '0,1', '1,0']) assert.ok(normals.has(n), 'never on surface ' + n);
});

// A snail is about 30 mm of drawn shell, which is what decides whether two of
// them are touching. `reach` is that width, `height` how far up its shell another
// one ends up standing.
const at = (id, along) => ({ id, along, height: 25, reach: 30 });

test('snails far apart all keep the glass', () => {
  const out = stackLayout([at('a', 100), at('b', 400), at('c', 700)]);
  assert.equal(out.length, 3);
  assert.ok(out.every((r) => r.lift === 0 && !r.riding), 'nobody climbs anybody');
});

test('a snail that catches up rides the one ahead of it', () => {
  //  b is 10 mm in front of a, well within a shell width
  const out = stackLayout([at('a', 100), at('b', 110)]);
  const a = out.find((r) => r.id === 'a');
  const b = out.find((r) => r.id === 'b');
  assert.equal(b.lift, 0, 'the one in front keeps the glass');
  assert.equal(b.riding, false);
  assert.equal(a.lift, 25, 'the one behind ends up on its shell');
  assert.equal(a.riding, true);
  assert.ok(out.indexOf(b) < out.indexOf(a), 'the carrier is drawn first, so the rider is on top');
});

test('three in a huddle make a pile, not three on one', () => {
  const out = stackLayout([at('a', 100), at('b', 112), at('c', 124)]);
  const lift = Object.fromEntries(out.map((r) => [r.id, r.lift]));
  assert.deepEqual(lift, { c: 0, b: 25, a: 50 }, 'each one stands on the pile, not on the glass');
  assert.deepEqual(out.map((r) => r.id), ['c', 'b', 'a'], 'bottom of the pile drawn first');
});

test('the pile works across the start of the lap, which is where it would break', () => {
  // one just before the seam, one just after: on the glass they are neighbours
  const out = stackLayout([at('a', PERIMETER - 6), at('b', 4)]);
  const a = out.find((r) => r.id === 'a');
  const b = out.find((r) => r.id === 'b');
  assert.equal(b.lift, 0, 'b is ahead round the ring');
  assert.equal(a.lift, 25, 'and a, ten millimetres behind it, climbs on');
  // the same two far apart the other way round must NOT stack
  const apart = stackLayout([at('a', 0), at('b', PERIMETER / 2)]);
  assert.ok(apart.every((r) => r.lift === 0), 'half a lap apart is not touching');
});

test('the pile is decided by the gap, not by who was listed first', () => {
  const one = stackLayout([at('a', 100), at('b', 108)]).map((r) => [r.id, r.lift]);
  const other = stackLayout([at('b', 108), at('a', 100)]).map((r) => [r.id, r.lift]);
  assert.deepEqual(one, other, 'the order they arrive in must not matter');
  assert.deepEqual(stackLayout([]), []);
  assert.deepEqual(stackLayout([at('a', 5)]).map((r) => r.lift), [0], 'one snail rides nothing');
});

test('a whole box in one spot piles up rather than sinking into each other', () => {
  const out = stackLayout([at('a', 300), at('b', 301), at('c', 302)]);
  const lifts = out.map((r) => r.lift).sort((x, y) => x - y);
  assert.deepEqual(lifts, [0, 25, 50]);
  assert.equal(new Set(lifts).size, 3, 'no two snails end up at the same height');
});

test('numerals count the way a line of monarchs does', () => {
  assert.deepEqual([1, 2, 3, 4, 5, 9, 10, 14, 40, 90].map(roman),
    ['I', 'II', 'III', 'IV', 'V', 'IX', 'X', 'XIV', 'XL', 'XC']);
  assert.equal(roman(0), 'I', 'there is no zeroth of anyone');
  assert.equal(splitHeir('Majken').n, 1, 'a plain name is the first of its line');
  assert.equal(splitHeir('Majken').base, 'Majken');
  assert.deepEqual(splitHeir('Majken III'), { base: 'Majken', n: 3 });
  assert.deepEqual(splitHeir('Gösta XIV'), { base: 'Gösta', n: 14 });
  // a name that merely ends in letters that look Roman is not a numeral
  assert.equal(splitHeir('Ivar').base, 'Ivar', 'Ivar is a name, not a one');
  assert.equal(splitHeir('Vera').n, 1);
});

test('a snail born here is named after a parent, one numeral further on', () => {
  const name = heirName(['Majken', 'Gösta'], 7, ['Majken', 'Gösta']);
  assert.ok(['Majken II', 'Gösta II'].includes(name), 'got ' + name);
  // the next one along carries on the count rather than repeating it
  const second = heirName(['Majken', 'Majken'], 7, ['Majken', 'Majken II']);
  assert.equal(second, 'Majken III');
  const third = heirName(['Majken III', ''], 7, ['Majken', 'Majken II', 'Majken III']);
  assert.equal(third, 'Majken IV', 'the parent being a III does not reset the line');
});

test('the count remembers snails that are gone, and ignores case', () => {
  assert.equal(heirName(['Majken', ''], 7, ['majken', 'MAJKEN II']), 'Majken III',
    'a name is the same name however it was typed');
  assert.equal(heirName(['Majken', ''], 7, []), 'Majken II',
    'even with nobody about, a child is the second of its name');
});

test('an inherited name fits the field, and a nameless parent hands nothing down', () => {
  const long = heirName(['Trädgårdsmästaren', ''], 7, []);
  assert.ok(long.length <= NAME_MAX, long + ' is ' + long.length + ' characters');
  assert.ok(long.endsWith(' II'), 'the numeral survives the trim, the name gives way');
  assert.equal(heirName([], 7, []), null, 'no parents, nothing to inherit');
  assert.equal(heirName(['', '  '], 7, []), null, 'nor from two blanks');
  assert.equal(heirName(null, 7, []), null);
});

test('the same child always gets the same name', () => {
  const taken = ['Majken', 'Gösta'];
  const a = heirName(['Majken', 'Gösta'], 4242, taken);
  const b = heirName(['Majken', 'Gösta'], 4242, taken);
  assert.equal(a, b, 'the parent it takes after comes from its seed, not a coin toss');
  // and different children do not all take after the same parent
  const names = new Set();
  for (let seed = 0; seed < 60; seed++) names.add(heirName(['Majken', 'Gösta'], seed, taken));
  assert.equal(names.size, 2, 'both parents get a look in');
});

test('the reminder kinds the client sends are the ones the table accepts', () => {
  // The client decides what to schedule and the table refuses anything else.
  // Drift between the two is silent in production: the insert just drops rows.
  // (That the sender has a sentence for each is checked in push.test.mjs.)
  const sql = read('supabase/migrations/20260912190000_snailstory_reminders.sql');
  const allowed = sql.match(/check \(kind in \(([^)]*)\)\)/)[1].split(',').map((x) => x.trim().replace(/'/g, ''));
  assert.deepEqual([...REMINDER_KINDS].sort(), [...allowed].sort(), 'the check constraint and the client disagree');
  for (const k of REMINDER_KINDS) assert.ok(sql.includes(`'${k}'`), 'the filter in set_reminders drops ' + k);
  assert.ok(sql.includes('snailstory_take_due'), 'the sender must be able to take what is due');
  assert.ok(sql.includes('delete from public.snailstory_reminders where user_id = auth.uid()'),
    'set_reminders must replace the schedule, not append to it');
});

test('a reminder key says which snail, so three do not overwrite each other', () => {
  const sql = read('supabase/migrations/20260913210000_snailstory_reminders_per_snail.sql');
  assert.ok(sql.includes('add primary key (user_id, kind, years, snail)'), 'the snail must be part of the key');
  assert.ok(sql.includes('drop function if exists public.snailstory_set_reminders(jsonb, text, text)'),
    'the old three-argument form has to go, or PostgREST sees two overloads');
  assert.ok(sql.includes("r->>'snail'"), 'the insert has to read the snail from the row');
});

test('no secret was committed with the migration', () => {
  const sql = read('supabase/migrations/20260912190000_snailstory_reminders.sql');
  assert.ok(sql.includes('vault.decrypted_secrets'), 'the cron key is read from the vault at run time');
  assert.ok(!/create_secret\s*\(\s*'[0-9a-f]{16}/.test(sql), 'a vault secret value is in the repository');
  assert.ok(!/[0-9a-f]{48}/.test(sql), 'something that looks like a key is in the repository');
});

test('a touched snail pulls its eyes in at once and lets them out slowly', () => {
  assert.equal(retraction(0), 0, 'nothing has happened yet at the moment of the touch');
  assert.equal(retraction(250), 1, 'in within a quarter second');
  assert.equal(retraction(1000), 1, 'and held there');
  assert.ok(retraction(4000) > 0 && retraction(4000) < 1, 'on its way back out');
  assert.equal(retraction(8250), 0, 'fully out again');
  assert.equal(retraction(60000), 0, 'and stays out');
  // never negative, never above one, whatever it is handed
  for (const v of [-1, -0.001, NaN, Infinity, 1e12]) {
    const r = retraction(v);
    assert.ok(r >= 0 && r <= 1, `retraction(${v}) = ${r}`);
  }
  // coming back out is monotone: no twitching
  let prev = 1;
  for (let ms = 2750; ms <= 8250; ms += 100) {
    const r = retraction(ms);
    assert.ok(r <= prev, `went back in at ${ms} ms`);
    prev = r;
  }
  // the eyes are out again well before the snail starts moving
  assert.equal(retraction(PET_SHY_MS), 0, 'eyes out before it dares move');
  assert.ok(PET_SHY_MS > 8250, 'and it stays put a while after that');
});

test('waking out of dormancy unfolds slowly, with no pause first', () => {
  assert.equal(stretching(0), 1, 'it breaks the membrane with the stalks already in');
  assert.equal(stretching(WAKE_STRETCH_MS), 0, 'and is fully out at the end');
  assert.equal(stretching(WAKE_STRETCH_MS * 2), 0);
  let prev = 1;
  for (let ms = 0; ms <= WAKE_STRETCH_MS; ms += 100) {
    const v = stretching(ms);
    assert.ok(v >= 0 && v <= 1, `stretching(${ms}) = ${v}`);
    assert.ok(v <= prev, 'the stalks must never go back in on their own');
    prev = v;
  }
  // no hold at the start: unlike a flinch, this is already on its way out
  assert.ok(stretching(500) < 1, 'a stretch has no held phase');
  // and it takes longer than recovering from a poke
  assert.ok(WAKE_STRETCH_MS > PET_SHY_MS / 2, 'waking up is not a flinch');
  for (const v of [-1, NaN, Infinity]) assert.equal(stretching(v), 0);
});

test('a tick is five minutes, which is what the save assumes', () => {
  assert.equal(TICK_MS, 300000);
  assert.equal((LIFE_DAYS * 86400000) % TICK_MS, 0, 'the last day must end on a tick');
});

if (failed) { console.log(`${failed} failed`); process.exit(1); }
