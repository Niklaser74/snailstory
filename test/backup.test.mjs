// The copy the keeper holds. The point of these tests is that a restore must
// either give back exactly the same terrarium or refuse — a half-restored box in
// place of a living one is worse than no backup at all.
//   node test/backup.test.mjs
import assert from 'node:assert/strict';
import { Box, DAY_MS } from '../js/life.js';
import { pack, serialize, parse, summary, fileName, FILE_VERSION, BackupError } from '../js/backup.js';

let failed = 0;
function test(name, fn) {
  try { fn(); console.log(`ok   ${name}`); } catch (e) { failed++; console.log(`FAIL ${name}\n     ${e.message}`); }
}

// A terrarium with some life behind it: two snails, a long diary, badges, a
// mating or two if the dice allow it.
function raised(days = 420, names = ['Majken', 'Gary']) {
  const now = Date.now();
  const born = now - days * DAY_MS;
  const box = new Box({ born, tz: -120 });
  names.forEach((n, i) => box.add({ name: n, seed: 4711 + i * 1000, now: born, quiet: true }));
  for (let t = born + 6 * 3600000; t < now; t += 12 * 3600000) {
    box.mist(t); box.feed(t, 'dandelion'); box.chalk(t); box.clean(t);
  }
  box.advanceTo(now);
  return box;
}

test('a copy of a long life reads back as the same terrarium, to the byte', () => {
  const box = raised();
  assert.ok(box.snails[0].days.length > 400, 'the fixture has no diary to speak of');
  const text = serialize(pack({ box, previous: [], savedAt: 1700000000000, appVersion: 'v14' }));
  const back = parse(text);
  // Compared against the save as JSON can carry it: fields that are `undefined`
  // on a living snail have no spelling in JSON and come back absent, which is
  // exactly what the game's own localStorage save does too.
  const asSaved = JSON.parse(JSON.stringify(box.toJSON()));
  assert.deepEqual(back.box, asSaved, 'the save came back changed');
  // and the same again through the class, so a restore cannot lose a field
  assert.deepEqual(JSON.parse(JSON.stringify(Box.fromJSON(back.box).toJSON())), asSaved);
  assert.equal(back.savedAt, 1700000000000);
  assert.equal(back.appVersion, 'v14');
});

test('the diary, the badges and the shelf all survive the trip', () => {
  const box = raised();
  const previous = [{ name: 'Gunsan', age: 3 * 365 * DAY_MS, distance: 120000, size: 39, days: 1095 }];
  const back = parse(serialize(pack({ box, previous, savedAt: Date.now() })));
  assert.equal(back.box.snails[0].days.length, box.snails[0].days.length, 'the diary is shorter');
  assert.deepEqual(back.box.badges, box.badges, 'the shelf of badges changed');
  assert.deepEqual(back.box.usedNames, box.usedNames, 'the name memory changed');
  assert.deepEqual(back.previous, previous, 'the departed were left behind');
  assert.deepEqual(back.built.snails.map((s) => s.name), box.snails.map((s) => s.name));
});

test('what the confirmation says about a copy is what is in it', () => {
  // 300 well-kept days is long enough that the two may have bred, so the count
  // comes from the box rather than from the two names it started with.
  const box = raised(300, ['Majken', 'Gary']);
  const s = summary(parse(serialize(pack({ box, savedAt: 1700000000000 }))));
  assert.deepEqual(s.names, box.snails.map((x) => x.name));
  assert.equal(s.count, box.snails.length);
  assert.equal(s.days, box.snails[0].days.length);
  assert.equal(s.savedAt, 1700000000000);
});

// ---------- everything that must be refused rather than half-loaded ----------
function refuses(text, code, what) {
  try {
    parse(text);
    assert.fail(`${what} was accepted`);
  } catch (e) {
    assert.ok(e instanceof BackupError, `${what} threw something else: ${e.message}`);
    assert.equal(e.code, code, what);
  }
}

test('anything that is not a Snail Story save is refused, with a reason', () => {
  refuses('not json at all', 'unreadable', 'a shopping list');
  refuses('[1,2,3]', 'unreadable', 'a bare array');
  refuses('"hello"', 'unreadable', 'a bare string');
  refuses(JSON.stringify({ app: 'snailmageddon', v: 1, box: {} }), 'foreign', "another game's save");
  refuses(JSON.stringify({ app: 'snailstory', v: FILE_VERSION + 1, box: {} }), 'future', 'a copy from a later version');
  refuses(JSON.stringify({ app: 'snailstory', v: 1 }), 'unreadable', 'a copy with no box');
  refuses(JSON.stringify({ app: 'snailstory', v: 1, box: { born: Date.now(), snails: [] } }), 'empty', 'an empty terrarium');
  refuses(JSON.stringify({ app: 'snailstory', v: 1, box: { born: 0, snails: [{ seed: 1, name: 'A' }] } }), 'broken', 'a box with no birth');
});

test('a truncated file is refused, not loaded as far as it goes', () => {
  const text = serialize(pack({ box: raised(200) }));
  refuses(text.slice(0, Math.floor(text.length * 0.8)), 'unreadable', 'a file cut off mid-diary');
});

test('a copy older than the running version still loads', () => {
  // What a v13 client would have written: no appVersion field, no previous.
  const box = raised(120, ['Majken']);
  const old = { app: 'snailstory', v: 1, made: new Date(1700000000000).toISOString(), box: box.toJSON() };
  const back = parse(JSON.stringify(old));
  assert.deepEqual(back.previous, [], 'a missing shelf should read as an empty one');
  assert.equal(back.savedAt, 1700000000000, 'the date should fall back to the stamp');
});

test('the file name says which snail and which day, and is safe on any disk', () => {
  const box = raised(30, ['Åsa-Märta']);
  const name = fileName(pack({ box }), Date.parse('2026-09-28T10:00:00'));
  assert.equal(name, 'snailstory-asa-marta-2026-09-28.json');
  assert.ok(!/[^a-z0-9.-]/.test(name), `unsafe characters in ${name}`);
});

test('packing without a box is refused rather than writing an empty file', () => {
  try {
    pack({ box: null });
    assert.fail('an empty backup was packed');
  } catch (e) {
    assert.equal(e.code, 'empty');
  }
});

console.log(failed ? `\n${failed} failing` : '\nall good');
process.exit(failed ? 1 : 0);
