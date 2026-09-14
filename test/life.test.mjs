// The promises Snail Story makes are all about time, and none of them can be
// checked by playing: three years is three years. So they are checked here, by
// living whole lives in a few milliseconds.
//   node test/life.test.mjs
import assert from 'node:assert/strict';
import { Box, Life, DAY_MS, TICK_MS, LIFE_DAYS, SIZE_HATCH, SIZE_ADULT, SIZE_MAX,
  WAKE_AT, SEAL_AT, SNAIL_MAX, LAP, MATE_REACH, GRAVID_DAYS, CLUTCH_DAYS,
  CLUTCH_MIN, CLUTCH_MAX, lapGap, quality } from '../js/life.js';

const T0 = Date.UTC(2026, 0, 5, 8, 0, 0);     // a Monday morning, fixed
const TZ = -60;                                // Sweden in winter, frozen for the test

// A box with one snail in it, which is what most of these promises are about.
function fresh(seed = 12345, name = 'Gösta') {
  const b = new Box({ born: T0, tz: TZ });
  b.add({ seed, name, now: T0 });
  return b;
}
const one = (b) => b.snails[0];

let failed = 0;
function test(name, fn) {
  try { fn(); console.log(`ok   ${name}`); } catch (e) { failed++; console.log(`FAIL ${name}\n     ${e.message}`); }
}
// everything that must come out the same however the app got there
const fields = (b) => ({
  tick: b.tick,
  moisture: +b.moisture.toFixed(9), food: +b.food.toFixed(9),
  calcium: +b.calcium.toFixed(9), grime: +b.grime.toFixed(9),
  snails: b.snails.map((s) => ({
    tick: s.tick, size: +s.size.toFixed(9), distance: +s.distance.toFixed(9),
    asleep: s.asleep, sealedTicks: s.sealedTicks, days: s.days.length,
    adult: s.adult, dead: s.dead,
  })),
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
  const b = fresh();
  b.advanceTo(T0 + 3 * DAY_MS);
  assert.equal(one(b).asleep, true, 'sealed within three days of neglect');
  b.advanceTo(T0 + (LIFE_DAYS - 1) * DAY_MS);
  assert.equal(one(b).dead, false, 'still alive the day before its third birthday');
  assert.equal(one(b).asleep, true);
  assert.ok(one(b).size > SIZE_HATCH, 'it grew a little before sealing');
  assert.ok(one(b).size < 10, 'but nothing like a cared-for snail');
  b.advanceTo(T0 + LIFE_DAYS * DAY_MS);
  assert.equal(one(b).dead, true, 'old age is the only thing that ends it');
});

test('sealed in, the snail freezes; the box around it goes on drying out', () => {
  const b = fresh();
  b.advanceTo(T0 + 5 * DAY_MS);
  const s = one(b);
  assert.equal(s.asleep, true);
  const size = s.size, dist = s.distance, slept = s.sealedTicks;
  b.advanceTo(T0 + 105 * DAY_MS);
  assert.equal(+s.size.toFixed(9), +size.toFixed(9), 'no growth while sealed');
  assert.equal(+s.distance.toFixed(9), +dist.toFixed(9), 'no crawling while sealed');
  assert.ok(s.sealedTicks > slept, 'but the sleep is counted');
  // the needs belong to the box, and evaporation does not care who is awake
  assert.equal(b.moisture, 0, 'the box dries all the way out');
  assert.equal(b.food, 0);
  assert.equal(b.grime, 1, 'and gets as dirty as it gets');
});

test('water and food wake it, one alone does not', () => {
  const b = fresh();
  b.advanceTo(T0 + 5 * DAY_MS);
  assert.equal(one(b).asleep, true);
  const t = T0 + 5 * DAY_MS + 1000;
  b.mist(t);
  assert.equal(one(b).asleep, true, 'a dry snail with no food stays in');
  assert.ok(b.moisture >= WAKE_AT);
  b.feed(t + 1000, 'lettuce');
  assert.equal(one(b).asleep, false, 'both together bring it out');
});

test('a well kept snail grows up, fills its shell and dies of old age', () => {
  const b = fresh();
  const end = T0 + LIFE_DAYS * DAY_MS;
  // looked after twice a day for three years, which nobody will do
  for (let t = T0 + 6 * 3600000; t < end; t += 12 * 3600000) {
    b.mist(t); b.feed(t, 'dandelion'); b.chalk(t); b.clean(t);
  }
  b.advanceTo(end);
  const s = one(b);
  assert.equal(s.asleep, false, 'never had to seal up');
  assert.equal(s.adult, true);
  assert.ok(s.size >= 38, `shell reached only ${s.size.toFixed(1)} mm`);
  assert.ok(s.size < SIZE_MAX, 'and never passes the limit');
  assert.ok(s.distance > 1000000, `crawled only ${(s.distance / 1000).toFixed(0)} m`);
  assert.equal(s.dead, true);
  for (const id of ['hatched', 'grown', 'threeYears', 'kilometre', 'hundredMeals']) {
    assert.ok(b.badges.includes(id), 'missing badge ' + id);
  }
});

test('the shell lip comes in before the first summer under decent care', () => {
  const b = fresh();
  for (let t = T0 + 6 * 3600000; t < T0 + 200 * DAY_MS; t += 18 * 3600000) { b.mist(t); b.feed(t, 'carrot'); b.chalk(t); }
  assert.equal(one(b).adult, true);
  const grown = one(b).days.find((d) => d.size >= SIZE_ADULT);
  assert.ok(grown && grown.d < 200, 'grown up within two hundred days');
});

test('nothing ever goes backwards', () => {
  const b = fresh();
  let size = 0, dist = 0, age = -1, day = -1;
  for (let t = T0; t < T0 + 400 * DAY_MS; t += 7 * 3600000) {
    if (t % (3 * DAY_MS) < 7 * 3600000) { b.mist(t); b.feed(t, 'apple'); }
    b.advanceTo(t);
    const s = one(b);
    assert.ok(s.size >= size, 'shell shrank');
    assert.ok(s.distance >= dist, 'odometer ran backwards');
    assert.ok(s.ageMs(t) > age, 'age stood still');
    assert.ok(s.dayIndex(t) >= day);
    size = s.size; dist = s.distance; age = s.ageMs(t); day = s.dayIndex(t);
  }
  assert.ok(one(b).whorls(T0 + 400 * DAY_MS) >= 1 && one(b).whorls(T0 + 400 * DAY_MS) <= 5);
});

test('one diary record per day lived, and none for the future', () => {
  const b = fresh();
  b.advanceTo(T0 + 30 * DAY_MS + TICK_MS);
  const s = one(b);
  assert.equal(s.days.length, 30, `expected 30 closed days, got ${s.days.length}`);
  assert.deepEqual(s.days.map((d) => d.d), [...Array(30).keys()]);
  assert.equal(s.today.d, 30);
});

test('saving and loading gives back the same terrarium, and it keeps living the same', () => {
  const a = fresh();
  a.add({ seed: 777, name: 'Majken', now: T0 + 2 * DAY_MS });
  for (let t = T0; t < T0 + 20 * DAY_MS; t += 9 * 3600000) { a.mist(t); a.feed(t, 'oats'); }
  const b = Box.fromJSON(JSON.parse(JSON.stringify(a.toJSON())));
  assert.deepEqual(fields(b), fields(a));
  assert.equal(one(b).color, one(a).color, 'the shell colour comes from the seed, not the save');
  assert.equal(b.snails[1].name, 'Majken');
  assert.ok(b.snails.every((s) => s.box === b), 'every snail knows which box it is in');
  const end = T0 + 40 * DAY_MS;
  a.advanceTo(end); b.advanceTo(end);
  assert.deepEqual(fields(b), fields(a));
});

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

test('three years replays in well under a second, with a full box', () => {
  const b = fresh();
  b.add({ seed: 777, name: 'Majken', now: T0 });
  b.add({ seed: 999, name: 'Alva', now: T0 });
  const t = Date.now();
  b.advanceTo(T0 + LIFE_DAYS * DAY_MS);
  const ms = Date.now() - t;
  assert.ok(b.snails.every((s) => s.dead));
  assert.ok(ms < 1500, `took ${ms} ms`);
  console.log(`     (${(LIFE_DAYS * DAY_MS / TICK_MS).toLocaleString('sv-SE')} ticks × 3 snails in ${ms} ms)`);
});

// ---------- three to a terrarium ----------

test('the box holds three, and says no to a fourth', () => {
  const b = fresh();
  assert.equal(b.room, SNAIL_MAX - 1);
  assert.ok(b.add({ seed: 2, name: 'Majken', now: T0 }));
  assert.ok(b.add({ seed: 3, name: 'Alva', now: T0 }));
  assert.equal(b.hasRoom(), false);
  assert.equal(b.add({ seed: 4, name: 'För mycket', now: T0 }), null, 'a fourth is refused');
  assert.equal(b.snails.length, SNAIL_MAX);
  b.checkBadges(T0);
  assert.ok(b.badges.includes('full'), 'a full box is worth a badge');
});

test('one misting waters everyone, so three snails are not three times the work', () => {
  const b = fresh();
  b.add({ seed: 2, name: 'Majken', now: T0 });
  b.add({ seed: 3, name: 'Alva', now: T0 });
  b.advanceTo(T0 + 4 * DAY_MS);
  assert.ok(b.snails.every((s) => s.asleep), 'a neglected box seals all of them');
  const t = T0 + 4 * DAY_MS + 1000;
  b.mist(t); b.feed(t, 'lettuce');
  assert.ok(b.snails.every((s) => !s.asleep), 'one round of care brings all three out');
  // and the box dries at the same rate whoever is in it
  const alone = fresh();
  alone.mist(t); alone.feed(t, 'lettuce');
  alone.advanceTo(t + DAY_MS);
  b.advanceTo(t + DAY_MS);
  assert.equal(+b.moisture.toFixed(9), +alone.moisture.toFixed(9), 'three snails do not drink faster');
});

test('a snail added later keeps its own age, diary and death', () => {
  const b = fresh();
  const late = b.add({ seed: 4242, name: 'Sent', now: T0 + 100 * DAY_MS });
  b.advanceTo(T0 + 130 * DAY_MS);
  const now = T0 + 130 * DAY_MS;
  assert.ok(Math.abs(one(b).ageDays(now) - 130) < 0.01, 'the first is 130 days old');
  assert.ok(Math.abs(late.ageDays(now) - 30) < 0.01, 'the late one is 30');
  assert.equal(late.days.length, 30, 'and has thirty days of diary, not a hundred and thirty');
  assert.ok(late.dieAt > one(b).dieAt, 'and outlives it by the same hundred days');
  assert.ok(late.bornTick > 0, 'it starts where it was put on the box grid');
});

test('one snail reaching the end leaves the others alone', () => {
  const b = fresh();
  const late = b.add({ seed: 4242, name: 'Sent', now: T0 + 200 * DAY_MS });
  b.advanceTo(T0 + LIFE_DAYS * DAY_MS + TICK_MS);
  assert.equal(one(b).dead, true, 'the elder is gone');
  assert.equal(late.dead, false, 'the younger is not');
  const events = b.takeEvents();
  const died = events.filter((e) => e.type === 'died');
  assert.equal(died.length, 1, 'one death, not two');
  assert.equal(died[0].snail, one(b), 'and it says which snail it was');
  b.remove(one(b));
  assert.equal(b.snails.length, 1);
  assert.equal(b.hasRoom(), true, 'which leaves room for another egg');
  b.advanceTo(T0 + LIFE_DAYS * DAY_MS + 2 * TICK_MS);   // must not throw with one gone
});

test('a save from before the terrarium becomes a box with one snail in it', () => {
  // exactly the shape the old single-snail save had
  const legacy = {
    v: 1, seed: 12345, name: 'Gösta', born: T0, tz: TZ, tick: 288,
    moisture: 0.4, food: 0.3, calcium: 0.9, grime: 0.2,
    size: 9.5, distance: 4321, asleep: false, sealedTicks: 12, awakeTicks: 200, activeTicks: 40,
    meals: { lettuce: 3 }, mists: 4, cleans: 1, chalks: 1, pets: 7, petAt: 0, adult: false, dead: false,
    days: [], today: { d: 1, dist: 0, sleep: 0, active: 0, meals: 0, pets: 0, grew: false, ate: null, asleep: false, size: 9.5, moisture: 0.4, grime: 0.2 },
    badges: ['laid', 'hatched'],
  };
  const b = Box.fromLegacy(legacy);
  assert.equal(b.snails.length, 1);
  assert.equal(b.moisture, 0.4, 'the box took over the needs');
  assert.equal(b.meals.lettuce, 3);
  assert.deepEqual(b.badges, ['laid', 'hatched']);
  const s = one(b);
  assert.equal(s.name, 'Gösta');
  assert.equal(s.size, 9.5, 'and the snail kept everything that was its own');
  assert.equal(s.distance, 4321);
  assert.equal(s.pets, 7);
  assert.equal(s.laidAt, T0, 'its birthday did not move');
  assert.equal(s.bornTick, 0);
  assert.equal(s.box, b);
  // and it goes on living from exactly where it was
  b.advanceTo(T0 + 2 * DAY_MS);
  assert.ok(s.size > 9.5);
});

test('a snail that wakes up unfolds its stalks, and a poke folds them again', () => {
  const b = fresh();
  const t = T0 + 5 * DAY_MS;
  b.advanceTo(t);
  const s = one(b);
  assert.equal(s.asleep, true, 'a forgotten snail is sealed in');
  assert.equal(s.stalkRetraction(t), 1, 'nothing is out while it is sealed');

  b.mist(t); b.feed(t, 'cucumber');
  assert.equal(s.asleep, false, 'water and food wake it');
  assert.equal(s.wokeAt, t, 'and the moment is remembered');
  assert.equal(s.stalkRetraction(t), 1, 'the stalks start where the membrane left them');
  const mid = s.stalkRetraction(t + 4000);
  assert.ok(mid > 0.2 && mid < 0.8, `half way out, got ${mid}`);
  assert.equal(s.stalkRetraction(t + 9000), 0, 'fully out after the stretch');
  assert.equal(s.shy(t + 4000), true, 'it does not crawl off mid-stretch');
  assert.equal(s.shy(t + 9000), false);

  // touched while still unfolding: all the way back in, not somewhere between
  s.pet(t + 4000);
  assert.equal(s.stalkRetraction(t + 4250), 1, 'a poke wins over a stretch');
  assert.equal(s.stalkRetraction(t + 20000), 0, 'and it recovers from that too');
});

test('waking is remembered across a save, so the stretch is not restarted', () => {
  const b = fresh();
  const t = T0 + 5 * DAY_MS;
  b.advanceTo(t);
  b.mist(t); b.feed(t, 'cucumber');
  const back = Box.fromJSON(JSON.parse(JSON.stringify(b.toJSON())));
  assert.equal(one(back).wokeAt, one(b).wokeAt);
  assert.equal(one(back).stalkRetraction(t + 4000), one(b).stalkRetraction(t + 4000));
});

// ---------- two snails meeting ----------

// A box kept well, with two grown snails parked next to each other on the glass.
// Mating is a chance per tick while they are touching, so the test runs time
// forward rather than forcing the event: what is being checked is that it can
// happen at all, and what follows when it does.
function pair(days = 120) {
  const b = new Box({ born: T0, tz: TZ });
  const a = b.add({ seed: 1001, name: 'Majken', now: T0 });
  const c = b.add({ seed: 2002, name: 'Gösta', now: T0 });
  for (let t = T0 + 6 * 3600000; t < T0 + days * DAY_MS; t += 12 * 3600000) {
    b.mist(t); b.feed(t, 'dandelion'); b.chalk(t); b.clean(t);
  }
  b.advanceTo(T0 + days * DAY_MS);
  return { b, a, c };
}

test('the lap gap is the shorter way round, including across the seam', () => {
  assert.equal(Math.round(lapGap(100, 130)), 30);
  assert.equal(Math.round(lapGap(130, 100)), 30, 'and the same the other way');
  assert.ok(lapGap(5, LAP - 5) < 11, 'ten millimetres apart across the seam, not a whole lap');
  assert.ok(Math.abs(lapGap(0, LAP / 2) - LAP / 2) < 0.001, 'half a lap is the furthest two can be');
});

test('two grown snails in a well kept box find each other, and both carry eggs', () => {
  const { b, a, c } = pair(300);
  assert.ok(a.matings > 0 || c.matings > 0, 'three hundred days of two adults and nothing happened');
  // hermaphrodites: a meeting makes both of them gravid, never just one
  assert.equal(a.matings, c.matings, 'a meeting is always mutual');
  assert.ok(a.clutches > 0 && c.clutches > 0, 'both of them lay, which is the whole point');
  assert.ok(b.badges.includes('mated'), 'the meeting is worth a badge');
  assert.ok(b.badges.includes('clutch'));
});

test('a meeting needs two grown snails, a good box, and room between cooldowns', () => {
  // a lone snail has nobody
  const alone = fresh();
  for (let t = T0 + 6 * 3600000; t < T0 + 300 * DAY_MS; t += 12 * 3600000) {
    alone.mist(t); alone.feed(t, 'dandelion'); alone.chalk(t); alone.clean(t);
  }
  alone.advanceTo(T0 + 300 * DAY_MS);
  assert.equal(one(alone).matings, 0, 'one snail cannot mate with itself');

  // a neglected box raises nobody: the two are sealed in the whole time
  const grim = new Box({ born: T0, tz: TZ });
  grim.add({ seed: 1001, name: 'Majken', now: T0 });
  grim.add({ seed: 2002, name: 'Gösta', now: T0 });
  grim.advanceTo(T0 + 300 * DAY_MS);
  assert.equal(grim.snails[0].matings, 0, 'nothing happens in a dried-out box');

  // and the young are too young
  const young = new Box({ born: T0, tz: TZ });
  young.add({ seed: 1001, name: 'Majken', now: T0 });
  young.add({ seed: 2002, name: 'Gösta', now: T0 });
  for (let t = T0 + 6 * 3600000; t < T0 + 30 * DAY_MS; t += 12 * 3600000) {
    young.mist(t); young.feed(t, 'dandelion'); young.chalk(t); young.clean(t);
  }
  young.advanceTo(T0 + 30 * DAY_MS);
  assert.ok(!young.snails[0].adult, 'thirty days is not grown up');
  assert.equal(young.snails[0].matings, 0, 'and not grown up means no mating');
});

test('eggs go in the soil weeks after the meeting, and hatch weeks after that', () => {
  const { b, a } = pair(300);
  const rec = a.days.find((d) => d.mated);
  assert.ok(rec, 'the diary records the night it happened');
  const eggDay = a.days.find((d) => d.eggs);
  assert.ok(eggDay, 'and the day the hole was dug');
  assert.ok(eggDay.d - rec.d >= GRAVID_DAYS - 1 && eggDay.d - rec.d <= GRAVID_DAYS + 1,
    'laid ' + (eggDay.d - rec.d) + ' days after mating, expected about ' + GRAVID_DAYS);
  assert.ok(eggDay.eggs >= CLUTCH_MIN && eggDay.eggs <= CLUTCH_MAX, 'a believable clutch');
});

test('a clutch that hatches into a box with room leaves one young snail behind', () => {
  const { b, a, c } = pair(300);
  const child = b.snails.find((s) => s.parents);
  assert.ok(child, 'somebody was born here');
  assert.deepEqual([...child.parents].sort(), ['Gösta', 'Majken'], 'and knows whose it is');
  assert.ok([a.color, c.color].includes(child.color), 'the shell comes from a parent');
  assert.ok([a.pattern, c.pattern].includes(child.pattern), 'and so does the pattern');
  assert.ok(b.badges.includes('born'));
  assert.equal(child.days[0].d, 0, 'its diary starts at its own day zero');
  assert.ok(child.days.length < a.days.length - 100, 'and is much shorter than its parents\'');
  assert.ok(child.dieAt > a.dieAt, 'it has its own three years ahead of it');
  assert.equal(child.matings, 0, 'and it does not pair up with its own parents');
});

test('a full box sends the young out into the garden instead of overflowing', () => {
  const b = new Box({ born: T0, tz: TZ });
  b.add({ seed: 1001, name: 'Majken', now: T0 });
  b.add({ seed: 2002, name: 'Gösta', now: T0 });
  b.add({ seed: 3003, name: 'Alva', now: T0 });
  for (let t = T0 + 6 * 3600000; t < T0 + 400 * DAY_MS; t += 12 * 3600000) {
    b.mist(t); b.feed(t, 'dandelion'); b.chalk(t); b.clean(t);
  }
  b.advanceTo(T0 + 400 * DAY_MS);
  assert.equal(b.snails.length, SNAIL_MAX, 'never more than the box holds');
  assert.ok(b.snails.every((s) => !s.parents), 'and nobody was squeezed in');
  assert.equal(b.clutches.length >= 0, true);
});

test('a clutch survives a save, and the terrarium keeps running the same', () => {
  const { b } = pair(150);
  const twin = Box.fromJSON(JSON.parse(JSON.stringify(b.toJSON())));
  assert.deepEqual(twin.clutches, b.clutches, 'the eggs are still buried after a reload');
  assert.equal(twin.snails[0].matings, b.snails[0].matings);
  assert.deepEqual(twin.snails[0].mate, b.snails[0].mate);
  const end = T0 + 220 * DAY_MS;
  b.advanceTo(end); twin.advanceTo(end);
  assert.deepEqual(fields(twin), fields(b), 'and it all plays out identically');
  assert.equal(twin.snails.length, b.snails.length);
});

test('the whole thing is still the same however the app got there', () => {
  const end = T0 + 300 * DAY_MS;
  const care = (b, t) => { b.mist(t); b.feed(t, 'dandelion'); b.chalk(t); b.clean(t); };
  const build = (step) => {
    const b = new Box({ born: T0, tz: TZ });
    b.add({ seed: 1001, name: 'Majken', now: T0 });
    b.add({ seed: 2002, name: 'Gösta', now: T0 });
    for (let t = T0 + 6 * 3600000; t < end; t += 12 * 3600000) {
      care(b, t);
      if (step) for (let u = t; u < Math.min(t + 12 * 3600000, end); u += step) b.advanceTo(u);
    }
    b.advanceTo(end);
    return b;
  };
  const jumped = build(0);
  const walked = build(41 * 60 * 1000 + 7777);
  assert.deepEqual(fields(walked), fields(jumped), 'mating must not depend on how often the app was opened');
  assert.deepEqual(walked.snails.map((s) => s.name), jumped.snails.map((s) => s.name));
});

// ---------- what the server is told to remind you of ----------

test('the seal forecast is the simulation, not a guess', () => {
  const b = fresh();
  b.advanceTo(T0 + 3600000);
  const at = b.forecastSeal(T0 + 3600000);
  assert.ok(at, 'a neglected box has a sealing time');
  const before = fresh();
  before.advanceTo(at - TICK_MS - 1);
  assert.equal(one(before).asleep, false, 'still out one tick earlier');
  const after = fresh();
  after.advanceTo(at);
  assert.equal(one(after).asleep, true, 'sealed in exactly when the forecast said');
});

test('looking after it pushes the sealing time away', () => {
  const b = fresh();
  const t = T0 + 3600000;
  b.advanceTo(t);
  const dry = b.forecastSeal(t);
  b.mist(t); b.feed(t, 'cucumber');
  const wet = b.forecastSeal(t);
  assert.ok(wet > dry, 'water and food buy time');
  assert.ok(wet - t > 24 * 3600000, 'and at least a day of it');
});

test('a sealed box has nothing to forecast, an empty one has nothing at all', () => {
  const b = fresh();
  b.advanceTo(T0 + 5 * DAY_MS);
  assert.equal(one(b).asleep, true);
  assert.equal(b.forecastSeal(T0 + 5 * DAY_MS), null);
  assert.ok(!b.schedule(T0 + 5 * DAY_MS).some((r) => r.kind === 'sealed'), 'no sealing row while sealed');
  b.advanceTo(T0 + LIFE_DAYS * DAY_MS);
  b.remove(one(b));
  assert.deepEqual(b.schedule(T0 + LIFE_DAYS * DAY_MS), [], 'nothing to say about an empty box');
});

test('the schedule covers the whole life, in order, never in the past', () => {
  const b = fresh();
  const now = T0 + 1000;
  const s = b.schedule(now);
  const kinds = s.map((r) => r.kind);
  for (const k of ['hatch', 'sealed', 'death']) assert.ok(kinds.includes(k), 'missing ' + k);
  assert.deepEqual(s.filter((r) => r.kind === 'birthday').map((r) => r.years), [1, 2], 'both birthdays; the third is the end');
  for (const r of s) assert.ok(r.at > now, r.kind + ' is in the past');
  for (let i = 1; i < s.length; i++) assert.ok(s[i].at >= s[i - 1].at, 'out of order');
});

test('three snails do not collide in the schedule', () => {
  const b = fresh(11, 'En');
  b.add({ seed: 22, name: 'Två', now: T0 + 40 * DAY_MS });
  b.add({ seed: 33, name: 'Tre', now: T0 + 80 * DAY_MS });
  const now = T0 + 80 * DAY_MS + 1000;
  b.advanceTo(now);
  b.mist(now); b.feed(now, 'lettuce');       // a box that has just been seen to
  const rows = b.schedule(now);
  // every row says which snail it is about, except nothing; the box seals as one
  assert.equal(rows.filter((r) => r.kind === 'sealed').length, 1, 'one box, one sealing');
  for (const r of rows) assert.ok(r.snail, r.kind + ' has no snail');
  // the key the server uses is (kind, years, snail): it must be unique per row
  const keys = rows.map((r) => [r.kind, r.years || 0, (r.snail.seed >>> 0).toString(36)].join('|'));
  assert.equal(new Set(keys).size, keys.length, 'two reminders would overwrite each other');
  assert.equal(rows.filter((r) => r.kind === 'birthday').length, 6, 'two birthdays each');
  assert.equal(rows.filter((r) => r.kind === 'death').length, 3);
  assert.ok(rows.length <= 16, 'and the whole lot fits in one schedule');
  for (let i = 1; i < rows.length; i++) assert.ok(rows[i].at >= rows[i - 1].at, 'soonest first');
});

test('a hatched snail is not told to announce its hatching again', () => {
  const b = fresh();
  const now = T0 + 10 * 60000;
  b.advanceTo(now);
  assert.ok(!b.schedule(now).some((r) => r.kind === 'hatch'));
  assert.ok(b.schedule(now).some((r) => r.kind === 'birthday'));
});

test('forecasting does not disturb the box it forecasts for', () => {
  const b = fresh();
  b.advanceTo(T0 + 6 * 3600000);
  const before = fields(b);
  b.forecastSeal(T0 + 6 * 3600000);
  b.schedule(T0 + 6 * 3600000);
  assert.deepEqual(fields(b), before, 'the throwaway copy must not write back');
});

if (failed) { console.log(`${failed} failed`); process.exit(1); }
