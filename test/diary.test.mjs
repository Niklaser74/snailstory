// The diary is the thing people will read, so it gets its own test: every line
// resolves, nothing is left unsubstituted, the same day always reads the same,
// and three months of entries do not repeat themselves into wallpaper.
//   node test/diary.test.mjs
import assert from 'node:assert/strict';
import { Life, DAY_MS, LIFE_DAYS } from '../js/life.js';
import { entryFor, diaryFor, DIARY_KEYS } from '../js/diary.js';
import { t, keysOf } from '../js/i18n.js';

const T0 = Date.UTC(2026, 0, 5, 8, 0, 0);
const TZ = -60;

let failed = 0;
function test(name, fn) {
  try { fn(); console.log(`ok   ${name}`); } catch (e) { failed++; console.log(`FAIL ${name}\n     ${e.message}`); }
}
// the app does the same substitution: the food parameter is itself a key
function render(l) {
  const p = { ...l.params };
  if (p.food && String(p.food).startsWith('food.')) p.food = t(p.food);
  return t(l.key, p);
}
function cared(days) {
  const l = new Life({ seed: 777, name: 'Majken', born: T0, tz: TZ });
  for (let x = T0 + 6 * 3600000; x < T0 + days * DAY_MS; x += 14 * 3600000) {
    l.mist(x); l.feed(x, ['lettuce', 'cucumber', 'carrot', 'dandelion', 'apple', 'oats'][(x / 3600000 | 0) % 6]);
    if (x % (4 * DAY_MS) < 14 * 3600000) { l.clean(x); l.chalk(x); }
    if (x % (3 * DAY_MS) < 14 * 3600000) l.pet(x);
  }
  l.advanceTo(T0 + days * DAY_MS);
  return l;
}

test('every key the diary can reach exists in both languages', () => {
  const sv = new Set(keysOf('sv'));
  const en = new Set(keysOf('en'));
  for (const k of DIARY_KEYS) {
    assert.ok(sv.has(k), 'missing in sv: ' + k);
    assert.ok(en.has(k), 'missing in en: ' + k);
  }
});

test('no entry leaves a placeholder behind', () => {
  const l = cared(120);
  for (const e of diaryFor(l, 'sv')) {
    for (const line of e.lines) {
      const s = render(line);
      assert.ok(!s.includes('{'), `unsubstituted: ${line.key} -> ${s}`);
      assert.ok(s !== line.key, 'key fell through untranslated: ' + line.key);
      assert.ok(s.length > 8, 'suspiciously short: ' + s);
    }
  }
});

test('the same day always reads the same', () => {
  const l = cared(40);
  const rec = l.days[17];
  assert.deepEqual(entryFor(l, rec, 'sv'), entryFor(l, rec, 'sv'));
  const twin = Life.fromJSON(JSON.parse(JSON.stringify(l.toJSON())));
  assert.deepEqual(entryFor(twin, twin.days[17], 'sv'), entryFor(l, rec, 'sv'));
});

test('a hundred days do not read like one day a hundred times', () => {
  const l = cared(100);
  const seen = new Set(diaryFor(l, 'sv').map((e) => e.lines.map((x) => x.key).join('+')));
  assert.ok(seen.size >= 14, `only ${seen.size} shapes of entry in a hundred days`);
  const texts = new Set(diaryFor(l, 'sv').map((e) => e.lines.map(render).join(' ')));
  assert.ok(texts.size >= 40, `only ${texts.size} distinct entries in a hundred days`);
});

test('a neglected snail gets a quiet diary, not an empty one', () => {
  const l = new Life({ seed: 4, name: 'Rune', born: T0, tz: TZ });
  l.advanceTo(T0 + 60 * DAY_MS);
  const entries = diaryFor(l, 'sv');
  assert.equal(entries.length, 60);
  for (const e of entries) assert.ok(e.lines.length >= 1);
  const sealedLines = entries.filter((e) => e.lines.some((x) => x.key.startsWith('d.sealed'))).length;
  assert.ok(sealedLines > 40, `expected mostly sealed-in days, got ${sealedLines}`);
});

test('day zero is the egg, the last day is the last day', () => {
  const l = cared(3);
  const first = entryFor(l, l.days[0], 'sv');
  assert.deepEqual(first.lines.map((x) => x.key), ['d.laid', 'd.hatch']);
  const last = entryFor(l, { ...l.days[0], d: LIFE_DAYS }, 'sv');
  assert.deepEqual(last.lines.map((x) => x.key), ['d.last']);
  assert.ok(render(last.lines[0]).includes('Majken'));
});

test('a birthday is marked, once a year', () => {
  const l = cared(3);
  for (const d of [365, 730, 1094]) {
    const e = entryFor(l, { ...l.days[1], d }, 'sv');
    assert.equal(e.lines[0].key === 'd.birthday', d % 365 === 0, 'day ' + d);
  }
  const b = entryFor(l, { ...l.days[1], d: 730 }, 'sv');
  assert.ok(render(b.lines[0]).includes('2'), 'the second birthday says two');
});

if (failed) { console.log(`${failed} failed`); process.exit(1); }
