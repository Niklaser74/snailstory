// The diary is the game. Every day the snail lives through gets one entry, and
// the entries are dull on purpose: a careful log of an animal that does almost
// nothing. They are generated from the day's closed record, never stored as
// text, so switching language rewrites the whole diary.
//
// Picking is hashed from (seed, day) like everything else in life.js, so the
// entry for day 47 is the same entry forever.
import { rnd, LIFE_DAYS } from './life.js';
import * as fmt from './fmt.js';

// key suffix pools. The renderer looks up 'd.' + suffix in i18n.
const MAIN = {
  sealed: ['sealed.1', 'sealed.2', 'sealed.3', 'sealed.4'],
  sealedPart: ['part.1', 'part.2', 'part.3'],
  dry: ['dry.1', 'dry.2'],
  idle: ['idle.1', 'idle.2', 'idle.3', 'idle.4'],
  wander: ['wander.1', 'wander.2', 'wander.3', 'wander.4'],
  busy: ['busy.1', 'busy.2', 'busy.3', 'busy.4'],
};
const EXTRA = {
  ate: ['ate.1', 'ate.2', 'ate.3'],
  grew: ['grew.1', 'grew.2'],
  pets: ['pets.1', 'pets.2'],
  dirty: ['dirty.1', 'dirty.2'],
  still: ['still.1', 'still.2', 'still.3', 'still.4'],
};
// A night two snails found each other, and the day one buried a clutch. Both
// push everything else out of the way: nothing else that happens in a snail's
// day is worth mentioning first.
const MATED = ['mated.1', 'mated.2', 'mated.3'];
const EGGS = ['eggs.1', 'eggs.2'];
const HATCHED = ['hatched.1', 'hatched.2'];
export const FOOD_KEYS = ['lettuce', 'cucumber', 'carrot', 'dandelion', 'apple', 'oats'];

// Every key the diary can ever ask i18n for. test/rules.test.mjs checks them.
export const DIARY_KEYS = [
  ...Object.values(MAIN).flat(),
  ...Object.values(EXTRA).flat(),
  ...MATED, ...EGGS, ...HATCHED,
  'birthday', 'hatch', 'laid', 'last', 'born', 'dart', 'hatchedNone',
].map((k) => 'd.' + k).concat(FOOD_KEYS.map((f) => 'food.' + f));

const pick = (list, seed, day, salt) => list[Math.floor(rnd(seed, day, salt) * list.length)];

// One entry: a heading and one or two sentences, already formatted for `lang`.
export function entryFor(life, rec, lang = 'sv') {
  const day = rec.d;
  const seed = life.seed;
  const P = (extra = {}) => ({
    day: String(day),
    name: life.name,
    dist: fmt.distance(rec.dist || 0, lang),
    size: fmt.size(rec.size ?? 0, lang),
    years: String(Math.floor(day / 365)),
    pets: String(rec.pets || 0),
    mate: rec.mated || '',
    eggs: String(rec.eggs || 0),
    hatched: String(rec.hatched || 0),
    kept: rec.kept || '',
    mother: life.parents ? life.parents[0] : '',
    father: life.parents ? life.parents[1] : '',
    ...extra,
  });

  // Day zero is the hatching. A snail born in this box opens its diary with
  // whose it is, because that is the first thing to say about it.
  if (day === 0) {
    return life.parents
      ? { day, lines: [{ key: 'd.born', params: P() }] }
      : { day, lines: [{ key: 'd.laid', params: P() }, { key: 'd.hatch', params: P() }] };
  }
  if (day >= LIFE_DAYS) return { day, lines: [{ key: 'd.last', params: P() }] };

  // The days worth writing about on their own. They can land together — one
  // clutch coming up while another goes down — so they are collected rather
  // than returned one at a time. The love dart is a real thing a garden snail
  // fires at its partner, and it is made of chalk.
  const notable = [];
  if (rec.mated) {
    notable.push({ key: 'd.' + pick(MATED, seed, day, 37), params: P() });
    notable.push({ key: 'd.dart', params: P() });
  }
  if (rec.eggs) notable.push({ key: 'd.' + pick(EGGS, seed, day, 41), params: P() });
  if (rec.hatched) {
    notable.push(rec.kept
      ? { key: 'd.' + pick(HATCHED, seed, day, 43), params: P() }
      : { key: 'd.hatchedNone', params: P() });
  }
  if (notable.length) return { day, lines: notable };

  const sleepShare = (rec.sleep || 0) / 288;
  let group;
  if (sleepShare > 0.95) group = 'sealed';
  else if (sleepShare > 0.1) group = 'sealedPart';
  else if ((rec.moisture ?? 1) < 0.25) group = 'dry';
  else if (!rec.active) group = 'idle';
  else if (rec.active >= 7) group = 'busy';
  else group = 'wander';

  const lines = [];
  if (day > 0 && day % 365 === 0) lines.push({ key: 'd.birthday', params: P() });
  lines.push({ key: 'd.' + pick(MAIN[group], seed, day, 11), params: P() });

  // a second sentence, when the day gave one
  const extras = [];
  if (rec.ate) extras.push(['ate', { food: 'food.' + rec.ate }]);
  if (rec.pets) extras.push(['pets', {}]);
  if ((rec.grime ?? 0) > 0.75) extras.push(['dirty', {}]);
  if (rec.grew && group !== 'sealed' && (rec.size ?? 0) > 4) extras.push(['grew', {}]);
  if (group !== 'sealed') extras.push(['still', {}]);
  if (extras.length) {
    const [kind, params] = extras[Math.floor(rnd(seed, day, 23) * extras.length)];
    lines.push({ key: 'd.' + pick(EXTRA[kind], seed, day, 29), params: P(params), foodKey: params.food });
  }
  return { day, lines };
}

// Newest first, which is how anyone reads a diary they keep themselves.
export function diaryFor(life, lang = 'sv', limit = 400) {
  const out = [];
  for (let i = life.days.length - 1; i >= 0 && out.length < limit; i--) out.push(entryFor(life, life.days[i], lang));
  return out;
}
