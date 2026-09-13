// The promises Snail Story makes are all about time, and none of them can be
// checked by playing: three years is three years. So they are checked here, by
// living whole lives in a few milliseconds.
//   node test/life.test.mjs
import assert from 'node:assert/strict';
import { Life, DAY_MS, TICK_MS, LIFE_DAYS, SIZE_HATCH, SIZE_ADULT, SIZE_MAX, WAKE_AT, SEAL_AT, quality } from '../js/life.js';

const T0 = Date.UTC(2026, 0, 5, 8, 0, 0);     // a Monday morning, fixed
const TZ = -60;                                // Sweden in winter, frozen for the test
const fresh = (extra = {}) => new Life({ seed: 12345, name: 'Gösta', born: T0, tz: TZ, ...extra });

let failed = 0;
function test(name, fn) {
  try { fn(); console.log(`ok   ${name}`); } catch (e) { failed++; console.log(`FAIL ${name}\n     ${e.message}`); }
}
const fields = (l) => ({
  tick: l.tick, size: +l.size.toFixed(9), distance: +l.distance.toFixed(9),
  moisture: +l.moisture.toFixed(9), food: +l.food.toFixed(9), calcium: +l.calcium.toFixed(9),
  grime: +l.grime.toFixed(9), asleep: l.asleep, sealedTicks: l.sealedTicks, days: l.days.length,
  adult: l.adult, dead: l.dead,
});

test('the same snail is the same snail however the app got there', () => {
  const end = T0 + 90 * DAY_MS;
  const oneJump = fresh().advanceTo(end);
  const manySteps = fresh();
  // a jagged walk of odd intervals, the way a phone really gets opened
  for (let t = T0; t < end; t += 37 * 60 * 1000 + 11111) manySteps.advanceTo(Math.min(t, end));
  manySteps.advanceTo(end);
  assert.deepEqual(fields(manySteps), fields(oneJump));
});

test('a forgotten snail seals up and is still alive three years later', () => {
  const l = fresh();
  l.advanceTo(T0 + 3 * DAY_MS);
  assert.equal(l.asleep, true, 'sealed within three days of neglect');
  l.advanceTo(T0 + (LIFE_DAYS - 1) * DAY_MS);
  assert.equal(l.dead, false, 'still alive the day before its third birthday');
  assert.equal(l.asleep, true);
  assert.ok(l.size > SIZE_HATCH, 'it grew a little before sealing');
  assert.ok(l.size < 10, 'but nothing like a cared-for snail');
  l.advanceTo(T0 + LIFE_DAYS * DAY_MS);
  assert.equal(l.dead, true, 'old age is the only thing that ends it');
});

test('sealed in, nothing moves: not the needs, not the shell, not the odometer', () => {
  const l = fresh();
  l.advanceTo(T0 + 5 * DAY_MS);
  assert.equal(l.asleep, true);
  const before = fields(l);
  l.advanceTo(T0 + 105 * DAY_MS);
  assert.equal(+l.moisture.toFixed(9), before.moisture, 'moisture frozen');
  assert.equal(+l.food.toFixed(9), before.food, 'food frozen');
  assert.equal(+l.grime.toFixed(9), before.grime, 'the box stops getting dirty');
  assert.equal(+l.size.toFixed(9), before.size, 'no growth while sealed');
  assert.equal(+l.distance.toFixed(9), before.distance, 'no crawling while sealed');
  assert.ok(l.sealedTicks > before.sealedTicks, 'but the sleep is counted');
});

test('water and food wake it, one alone does not', () => {
  const l = fresh();
  l.advanceTo(T0 + 5 * DAY_MS);
  assert.equal(l.asleep, true);
  const t = T0 + 5 * DAY_MS + 1000;
  l.mist(t);
  assert.equal(l.asleep, true, 'a dry snail with no food stays in');
  assert.ok(l.moisture >= WAKE_AT);
  l.feed(t + 1000, 'lettuce');
  assert.equal(l.asleep, false, 'both together bring it out');
});

test('a well kept snail grows up, fills its shell and dies of old age', () => {
  const l = fresh();
  const end = T0 + LIFE_DAYS * DAY_MS;
  // looked after twice a day for three years, which nobody will do
  for (let t = T0 + 6 * 3600000; t < end; t += 12 * 3600000) {
    l.mist(t); l.feed(t, 'dandelion'); l.chalk(t); l.clean(t);
  }
  l.advanceTo(end);
  assert.equal(l.asleep, false, 'never had to seal up');
  assert.equal(l.adult, true);
  assert.ok(l.size >= 38, `shell reached only ${l.size.toFixed(1)} mm`);
  assert.ok(l.size < SIZE_MAX, 'and never passes the limit');
  assert.ok(l.distance > 1000000, `crawled only ${(l.distance / 1000).toFixed(0)} m`);
  assert.equal(l.dead, true);
  for (const id of ['hatched', 'grown', 'threeYears', 'kilometre', 'hundredMeals']) {
    assert.ok(l.badges.includes(id), 'missing badge ' + id);
  }
});

test('the shell lip comes in before the first summer under decent care', () => {
  const l = fresh();
  for (let t = T0 + 6 * 3600000; t < T0 + 200 * DAY_MS; t += 18 * 3600000) { l.mist(t); l.feed(t, 'carrot'); l.chalk(t); }
  assert.equal(l.adult, true);
  const grown = l.days.find((d) => d.size >= SIZE_ADULT);
  assert.ok(grown && grown.d < 200, 'grown up within two hundred days');
});

test('nothing ever goes backwards', () => {
  const l = fresh();
  let size = 0, dist = 0, age = -1, day = -1;
  for (let t = T0; t < T0 + 400 * DAY_MS; t += 7 * 3600000) {
    if (t % (3 * DAY_MS) < 7 * 3600000) { l.mist(t); l.feed(t, 'apple'); }
    l.advanceTo(t);
    assert.ok(l.size >= size, 'shell shrank');
    assert.ok(l.distance >= dist, 'odometer ran backwards');
    assert.ok(l.ageMs(t) > age, 'age stood still');
    assert.ok(l.dayIndex(t) >= day);
    size = l.size; dist = l.distance; age = l.ageMs(t); day = l.dayIndex(t);
  }
  assert.ok(l.whorls(T0 + 400 * DAY_MS) >= 1 && l.whorls(T0 + 400 * DAY_MS) <= 5);
});

test('one diary record per day lived, and none for the future', () => {
  const l = fresh();
  l.advanceTo(T0 + 30 * DAY_MS + TICK_MS);
  assert.equal(l.days.length, 30, `expected 30 closed days, got ${l.days.length}`);
  assert.deepEqual(l.days.map((d) => d.d), [...Array(30).keys()]);
  assert.equal(l.today.d, 30);
});

test('saving and loading gives back the same snail, and it keeps living the same', () => {
  const a = fresh();
  for (let t = T0; t < T0 + 20 * DAY_MS; t += 9 * 3600000) { l2(a, t); }
  const b = Life.fromJSON(JSON.parse(JSON.stringify(a.toJSON())));
  assert.deepEqual(fields(b), fields(a));
  assert.equal(b.color, a.color, 'the shell colour comes from the seed, not the save');
  const end = T0 + 40 * DAY_MS;
  a.advanceTo(end); b.advanceTo(end);
  assert.deepEqual(fields(b), fields(a));
});
function l2(l, t) { l.mist(t); l.feed(t, 'oats'); }

test('growth quality reads the four needs in the right direction', () => {
  const base = { moisture: 1, food: 1, calcium: 1, grime: 0 };
  assert.ok(quality(base) > 0.95);
  assert.ok(quality({ ...base, moisture: 0.1 }) < quality(base));
  assert.ok(quality({ ...base, food: 0.1 }) < quality(base));
  assert.ok(quality({ ...base, calcium: 0 }) < quality(base));
  assert.ok(quality({ ...base, grime: 1 }) < quality(base));
  assert.ok(quality({ moisture: 0, food: 0, calcium: 0, grime: 1 }) >= 0);
  assert.ok(SEAL_AT < WAKE_AT, 'it needs more to come out than it took to go in');
});

test('three years replays in well under a second', () => {
  const t = Date.now();
  const l = fresh();
  l.advanceTo(T0 + LIFE_DAYS * DAY_MS);
  const ms = Date.now() - t;
  assert.ok(l.dead);
  assert.ok(ms < 1500, `took ${ms} ms`);
  console.log(`     (${(LIFE_DAYS * DAY_MS / TICK_MS).toLocaleString('sv-SE')} ticks in ${ms} ms)`);
});

test('a snail that wakes up unfolds its stalks, and a poke folds them again', () => {
  const l = fresh();
  const t = T0 + 5 * DAY_MS;
  l.advanceTo(t);
  assert.equal(l.asleep, true, 'a forgotten snail is sealed in');
  assert.equal(l.stalkRetraction(t), 1, 'nothing is out while it is sealed');

  l.mist(t); l.feed(t, 'cucumber');
  assert.equal(l.asleep, false, 'water and food wake it');
  assert.equal(l.wokeAt, t, 'and the moment is remembered');
  assert.equal(l.stalkRetraction(t), 1, 'the stalks start where the membrane left them');
  const mid = l.stalkRetraction(t + 4000);
  assert.ok(mid > 0.2 && mid < 0.8, `half way out, got ${mid}`);
  assert.equal(l.stalkRetraction(t + 9000), 0, 'fully out after the stretch');
  assert.equal(l.shy(t + 4000), true, 'it does not crawl off mid-stretch');
  assert.equal(l.shy(t + 9000), false);

  // touched while still unfolding: all the way back in, not somewhere between
  l.pet(t + 4000);
  assert.equal(l.stalkRetraction(t + 4250), 1, 'a poke wins over a stretch');
  assert.equal(l.stalkRetraction(t + 20000), 0, 'and it recovers from that too');
});

test('waking is remembered across a save, so the stretch is not restarted', () => {
  const l = fresh();
  const t = T0 + 5 * DAY_MS;
  l.advanceTo(t);
  l.mist(t); l.feed(t, 'cucumber');
  const back = Life.fromJSON(JSON.parse(JSON.stringify(l.toJSON())));
  assert.equal(back.wokeAt, l.wokeAt);
  assert.equal(back.stalkRetraction(t + 4000), l.stalkRetraction(t + 4000));
});

// ---------- what the server is told to remind you of ----------

test('the seal forecast is the simulation, not a guess', () => {
  const l = fresh();
  l.advanceTo(T0 + 3600000);
  const at = l.forecastSeal(T0 + 3600000);
  assert.ok(at, 'a neglected snail has a sealing time');
  const before = fresh();
  before.advanceTo(at - TICK_MS - 1);
  assert.equal(before.asleep, false, 'still out one tick earlier');
  const after = fresh();
  after.advanceTo(at);
  assert.equal(after.asleep, true, 'sealed in exactly when the forecast said');
});

test('looking after it pushes the sealing time away', () => {
  const l = fresh();
  const t = T0 + 3600000;
  const dry = l.forecastSeal(t);
  l.mist(t); l.feed(t, 'cucumber');
  const wet = l.forecastSeal(t);
  assert.ok(wet > dry, 'water and food buy time');
  assert.ok(wet - t > 24 * 3600000, 'and at least a day of it');
});

test('a sealed snail has nothing to forecast, a dead one has nothing at all', () => {
  const l = fresh();
  l.advanceTo(T0 + 5 * DAY_MS);
  assert.equal(l.asleep, true);
  assert.equal(l.forecastSeal(T0 + 5 * DAY_MS), null);
  assert.ok(!l.schedule(T0 + 5 * DAY_MS).some((r) => r.kind === 'sealed'), 'no sealing row while sealed');
  l.advanceTo(T0 + LIFE_DAYS * DAY_MS);
  assert.deepEqual(l.schedule(T0 + LIFE_DAYS * DAY_MS), [], 'nothing to say after the end');
});

test('the schedule covers the whole life, in order, never in the past', () => {
  const l = fresh();
  const now = T0 + 1000;
  const s = l.schedule(now);
  const kinds = s.map((r) => r.kind);
  for (const k of ['hatch', 'sealed', 'death']) assert.ok(kinds.includes(k), 'missing ' + k);
  assert.deepEqual(s.filter((r) => r.kind === 'birthday').map((r) => r.years), [1, 2], 'both birthdays; the third is the end');
  for (const r of s) {
    assert.ok(r.at > now, r.kind + ' is in the past');
    assert.ok(r.at <= l.dieAt, r.kind + ' falls after the snail is gone');
  }
  for (let i = 1; i < s.length; i++) assert.ok(s[i].at >= s[i - 1].at, 'out of order');
  assert.ok(s.length <= 10, 'the server takes at most ten');
});

test('a hatched snail is not told to announce its hatching again', () => {
  const l = fresh();
  const now = T0 + 10 * 60000;
  l.advanceTo(now);
  assert.ok(!l.schedule(now).some((r) => r.kind === 'hatch'));
  assert.ok(l.schedule(now).some((r) => r.kind === 'birthday'));
});

test('forecasting does not disturb the snail it forecasts for', () => {
  const l = fresh();
  l.advanceTo(T0 + 6 * 3600000);
  const before = fields(l);
  l.forecastSeal(T0 + 6 * 3600000);
  l.schedule(T0 + 6 * 3600000);
  assert.deepEqual(fields(l), before, 'the throwaway copy must not write back');
});

if (failed) { console.log(`${failed} failed`); process.exit(1); }
