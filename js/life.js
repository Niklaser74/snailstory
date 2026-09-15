// Snail Story: a terrarium and the snails in it, as plain state. No DOM, no
// canvas, no audio, so test/life.test.mjs can live three years in a few
// milliseconds.
//
// Time is wall-clock time. The snails live whether the app is open or not, so
// the simulation is a pure function of "how many five-minute ticks have passed".
// Opening the app after a month means replaying 8 640 ticks, which is cheaper
// than it sounds. Everything random is hashed from (seed, tick), never from a
// running generator, so the same snail at the same moment is the same snail no
// matter how the app got there — one long jump or a thousand small ones.
//
// The rule that makes it a snail game: neglect cannot kill. A snail without
// water or food seals its shell with a membrane and waits, for months if it has
// to. You lose growth, never the snail. Only old age ends it.
//
// WHAT BELONGS TO WHICH. The four needs are the BOX's: you mist the box, a
// lettuce leaf feeds whoever finds it, the cuttlefish bone is in there for
// everyone, and cleaning cleans the box. So one Box holds them, and its tick is
// the only clock. Each Life owns what is its own — its size, how far it has
// crawled, whether it is sealed in, its diary and its death. Three snails are
// three lives to watch, not three times the chores.

export const TICK_MS = 5 * 60 * 1000;      // the grid the whole life is quantised to
export const TICK_H = TICK_MS / 3600000;   // the same step in hours
export const DAY_MS = 86400000;
export const EGG_MS = 90 * 1000;           // the egg hatches after a minute and a half
export const LIFE_DAYS = 1095;             // three years, the point of the whole thing
export const OLD_DAYS = 1005;              // the last ninety days: slower, sleeps more
export const SNAIL_MAX = 3;                // how many fit in one box

// ---- needs: hours from full to empty, at rest ----
// Deliberately independent of how many snails are in there. A second snail
// should be another life to follow, not another chore.
export const MOIST_HOURS = 40;
export const FOOD_HOURS = 36;
export const CALCIUM_HOURS = 240;          // a cuttlefish bone lasts ten days
export const GRIME_HOURS = 120;            // five days from clean to filthy
export const SEAL_AT = 0.06;               // below this on water or food they seal up
export const WAKE_AT = 0.25;               // and need this much of both to come out

// ---- growth, in millimetres of shell ----
export const SIZE_HATCH = 3.5;
export const SIZE_MAX = 40;                // what a well kept garden snail approaches
export const SIZE_ADULT = 34;              // the shell lip thickens: grown up
export const TAU_DAYS = 60;                // time constant of growth under perfect care
export const ADULT_DAYS = 240;             // a stunted snail still matures eventually

// ---- the terrarium, in millimetres ----
// A realistic 30 x 24 cm keeper's box. The inside is a rounded rectangle about
// a metre around, and a snail's place on the glass is its odometer modulo that
// lap — so these are facts about the box, not about how it is drawn. view.js
// turns a point on the lap into pixels.
export const BOX_W = 300;
export const BOX_H = 240;
export const BOX_CORNER = 25;
export const LAP = 2 * (BOX_W - 2 * BOX_CORNER) + 2 * (BOX_H - 2 * BOX_CORNER) + 2 * Math.PI * BOX_CORNER;

// ---- two snails meeting ----
// Garden snails are hermaphrodites: any two grown ones can mate, and afterwards
// BOTH of them lay eggs. That is the whole reason this is in the game. They
// court for hours, and Cornu aspersum really does fire a calcium "love dart" at
// its partner first — which is why mating costs the box a little chalk.
//
// It happens on its own, while you are not looking. You read about it.
export const MATE_REACH = 32;              // mm apart: about a shell's width, same as climbing
export const MATE_CHANCE = 0.006;          // per tick, while two grown ones are touching
export const MATE_QUALITY = 0.5;           // and only in a box worth raising young in
export const MATE_COOLDOWN_DAYS = 45;      // a few times a year, not every time they pass
export const GRAVID_DAYS = 14;             // from mating to digging a hole
export const CLUTCH_DAYS = 21;             // eggs in the soil before they hatch
export const CLUTCH_MIN = 30;              // a real clutch is thirty to a hundred
export const CLUTCH_MAX = 96;
export const DART_CALCIUM = 0.08;

// ---- crawling ----
export const SPEED_MM_S = 0.9;             // about a metre an hour, which is true
export const NIGHT_ACTIVITY = 0.18;        // share of night ticks spent moving
export const DAY_ACTIVITY = 0.03;          // snails are nocturnal
export const NIGHT_FROM = 21;              // garden hours
export const NIGHT_TO = 6;

// ---- being touched ----
// A snail snaps its eye stalks in the moment it is touched and lets them back
// out slowly and warily, which is the whole joke of petting one. It stays put
// a good while longer than it stays blind.
export const PET_SHY_MS = 12000;           // how long it sits still after a pet
const PET_IN_MS = 250;                     // in they go, almost at once
const PET_HELD_MS = 2500;                  // and stay in this long
const PET_OUT_MS = 5500;                   // then back out, at snail speed

// How far the eye stalks are pulled in, 0 (out) to 1 (in), `since` ms after the
// last pet. Pure, so test/rules.test.mjs can check the shape of it.
export function retraction(since) {
  if (!(since >= 0) || since >= PET_IN_MS + PET_HELD_MS + PET_OUT_MS) return 0;
  if (since < PET_IN_MS) return since / PET_IN_MS;
  if (since < PET_IN_MS + PET_HELD_MS) return 1;
  return 1 - (since - PET_IN_MS - PET_HELD_MS) / PET_OUT_MS;
}

// ---- coming out of dormancy ----
// A snail that has been sealed in for weeks does not simply appear. The stalks
// are already in when it breaks the membrane, and they come out slowly and
// evenly — no hold first, because it has been holding all along. Slower than
// after a poke: that is a flinch, this is waking up.
export const WAKE_STRETCH_MS = 8000;
export function stretching(since) {
  if (!(since >= 0) || since >= WAKE_STRETCH_MS) return 0;
  return 1 - since / WAKE_STRETCH_MS;
}

// The kinds of reminder the server knows how to send. The same four names
// appear in supabase/migrations (a check constraint) and in the edge function
// (the sentences); test/rules.test.mjs checks that they still agree.
export const REMINDER_KINDS = ['hatch', 'sealed', 'birthday', 'death'];

// ---- what you can hand them ----
export const FOODS = ['lettuce', 'cucumber', 'carrot', 'dandelion', 'apple', 'oats'];
// moisture/calcium a food brings along, and how much a snail thinks of it
export const FOOD_EFFECT = {
  lettuce: { moisture: 0.10, calcium: 0, like: 2 },
  cucumber: { moisture: 0.30, calcium: 0, like: 2 },
  carrot: { moisture: 0.05, calcium: 0.05, like: 3 },
  dandelion: { moisture: 0.12, calcium: 0.08, like: 3 },
  apple: { moisture: 0.15, calcium: 0, like: 1 },
  oats: { moisture: 0, calcium: 0.10, like: 1 },
};

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

// A hash, not a generator: rnd(seed, tick, salt) is the same every time it is
// asked, so replaying a life in one jump or in a thousand gives one answer.
export function rnd(seed, tick, salt = 0) {
  let h = (seed | 0) ^ 0x9e3779b9;
  h = (Math.imul(h ^ tick, 0x85ebca6b) ^ (tick >>> 13)) | 0;
  h = (Math.imul(h ^ salt, 0xc2b2ae35) ^ (h >>> 16)) | 0;
  h ^= h >>> 15;
  return ((h >>> 0) % 100000) / 100000;
}

// The hour in the terrarium. The offset is frozen when the box is set up so the
// lives do not re-run differently after a trip abroad or a clock change.
export function gardenHour(t, tzMinutes) {
  const local = t - tzMinutes * 60000;
  return Math.floor(local / 3600000) % 24;
}
export function isNight(t, tzMinutes) {
  const h = gardenHour(t, tzMinutes);
  return h >= NIGHT_FROM || h < NIGHT_TO;
}
// The weekday in the terrarium, 0 = Sunday, on the same shifted clock as the hour.
export function gardenDay(t, tzMinutes) {
  return new Date(t - tzMinutes * 60000).getUTCDay();
}

// ---- Friday evening ----
// Three hours a week the terrarium has a disco. Nothing in the simulation turns
// on it: the snails do not move faster, grow better or care in the slightest.
// It is lights and hats, and it is over by nine.
export const DISCO_DAY = 5;                // Friday
export const DISCO_FROM = 18;
export const DISCO_TO = 21;
export function isDisco(t, tzMinutes) {
  if (gardenDay(t, tzMinutes) !== DISCO_DAY) return false;
  const h = gardenHour(t, tzMinutes);
  return h >= DISCO_FROM && h < DISCO_TO;
}

// How well shells are being built right now, 0–1, from the box's condition.
// Water and food carry it; calcium and a clean box are multipliers, because a
// dirty snail still grows.
export function quality(b) {
  const m = clamp01(b.moisture / 0.6);
  const f = clamp01(b.food / 0.5);
  const base = 0.5 * Math.min(m, f) + 0.5 * ((m + f) / 2);
  const cal = 0.55 + 0.45 * clamp01(b.calcium / 0.4);
  const clean = 1 - 0.45 * b.grime;
  return clamp01(base * cal * clean);
}

// Shell colours a garden snail could plausibly turn up in, plus the lilac one
// from Snigelkrattan so the series keeps its fifth colour.
export const SHELL_COLORS = ['#c8913f', '#a8701f', '#e0b35e', '#8a5a2b', '#d9a14c', '#b58b5a', '#e8c56a', '#a855f7'];
export const SHELL_PATTERNS = ['spiral', 'stripes', 'dots'];

// ---- names that run in the family ----
// A snail born in the box is named after one of its parents, the way a monarch
// is: Majken, then Majken II, then Majken III. It is only a suggestion — the
// keeper gets the box and can type whatever they like — but a hatchling turning
// up with a stranger's name reads wrong when its diary says whose child it is.
export const NAME_MAX = 16;                // what the name field takes

const ROMAN = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'],
  [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
export function roman(n) {
  let v = Math.max(1, Math.floor(n));
  let out = '';
  for (const [value, sign] of ROMAN) while (v >= value) { out += sign; v -= value; }
  return out;
}

// "Majken III" -> { base: 'Majken', n: 3 }. A name with no numeral is the first.
export function splitHeir(name) {
  const m = /^(.*?)\s+([IVXLCDM]+)$/.exec(String(name || '').trim());
  if (!m || !m[1]) return { base: String(name || '').trim(), n: 1 };
  const n = romanValue(m[2]);
  return n > 1 ? { base: m[1], n } : { base: String(name || '').trim(), n: 1 };
}
function romanValue(str) {
  const one = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
  let total = 0;
  for (let i = 0; i < str.length; i++) {
    const here = one[str[i]], next = one[str[i + 1]] || 0;
    total += here < next ? -here : here;
  }
  return total;
}

// The name for a snail out of its parents, given every name already spoken for.
// Returns null when there is nothing to inherit, and the caller picks a name of
// its own instead.
export function heirName(parents, seed = 0, taken = []) {
  const named = (parents || []).filter((n) => n && String(n).trim());
  if (!named.length) return null;
  const pick = named[Math.floor(rnd(seed, -4, 7) * named.length)] || named[0];
  const { base } = splitHeir(pick);
  if (!base) return null;
  // the highest numeral anyone with this name has used, living or remembered
  let highest = 0;
  for (const other of taken) {
    const it = splitHeir(other);
    if (it.base.toLowerCase() === base.toLowerCase()) highest = Math.max(highest, it.n);
  }
  const n = Math.max(2, highest + 1);
  const numeral = roman(n);
  const room = NAME_MAX - numeral.length - 1;
  const short = base.length > room ? base.slice(0, Math.max(1, room)).trim() : base;
  return short + ' ' + numeral;
}

// Everything about a snail that is decided the moment the egg is laid — unless
// it was born here, in which case its shell comes from its parents instead.
export function identity(seed) {
  return {
    color: SHELL_COLORS[Math.floor(rnd(seed, -1, 7) * SHELL_COLORS.length)],
    pattern: SHELL_PATTERNS[Math.floor(rnd(seed, -2, 7) * SHELL_PATTERNS.length)],
    // where on the lap of the glass this snail's odometer starts, 0-1. Without
    // it three eggs laid on the same evening would sit in exactly one spot.
    offset: rnd(seed, -3, 7),
  };
}

// ===========================================================================
// One snail
// ===========================================================================
export class Life {
  constructor({ seed = (Date.now() | 0), name = '', laidAt = Date.now(), bornTick = 0,
    color = null, pattern = null, parents = null, parentSeeds = null } = {}) {
    this.seed = seed | 0;
    this.name = name;
    const id = identity(this.seed);
    // A snail with no parents gets its shell from its seed. One born in the box
    // inherits, so the colour and the pattern are saved either way.
    this.color = color || id.color;
    this.pattern = pattern || id.pattern;
    this.offset = id.offset;
    this.parents = parents;         // [name, name] for a snail born here
    this.parentSeeds = parentSeeds; // the same two, as ids that cannot be renamed
    this.laidAt = laidAt;           // wall clock, for the ninety-second wait and birthdays
    this.bornTick = bornTick;       // where on the box's grid the egg was laid
    this.tick = 0;                  // last tick of its OWN life already lived through
    this.size = SIZE_HATCH;
    this.distance = 0;              // millimetres crawled, ever
    this.asleep = false;
    this.sealedTicks = 0;           // time spent sealed up, ever
    this.awakeTicks = 0;
    this.activeTicks = 0;
    this.pets = 0;
    this.petAt = 0;
    this.wokeAt = 0;
    this.matedTick = -1e9;          // box ticks, because meeting is a box affair
    this.gravidTick = 0;            // when it will dig a hole; 0 = not carrying
    this.mate = null;               // { name, color, pattern } of the last partner
    this.matings = 0;
    this.clutches = 0;
    this.adult = false;
    this.dead = false;
    this.days = [];                 // one closed-day record per day lived
    this.today = dayRecord(0);
    this.events = [];
    this.box = null;                // set when a box adopts it; never saved
  }

  // ---------- the clock ----------
  get born() { return this.laidAt; }
  get hatchAt() { return this.laidAt + EGG_MS; }
  get dieAt() { return this.laidAt + LIFE_DAYS * DAY_MS; }
  hatched(now) { return now >= this.hatchAt; }
  ageMs(now) { return Math.max(0, Math.min(now, this.dieAt) - this.laidAt); }
  ageDays(now) { return this.ageMs(now) / DAY_MS; }
  dayIndex(now) { return Math.floor(this.ageMs(now) / DAY_MS); }
  // its own tick index at a given tick of the box it lives in
  ownTick(boxTick) { return boxTick - this.bornTick; }

  takeEvents() { const e = this.events; this.events = []; return e; }

  // ---------- living through one tick of the box's clock ----------
  // `b` is the box: the needs are its, not this snail's.
  stepAt(boxTick, b) {
    const i = this.ownTick(boxTick);
    if (i < 1 || this.dead) return;
    if (i * TICK_MS > LIFE_DAYS * DAY_MS) return;      // finish() calls the death
    // nothing happens while it is still an egg
    if (i >= Math.max(1, Math.ceil(EGG_MS / TICK_MS))) this.live(i, b);
    this.rollDay(i, b);
    this.tick = i;
  }

  live(i, b) {
    const t = this.laidAt + i * TICK_MS;
    const night = isNight(t, b.tz);
    const old = i * TICK_MS >= OLD_DAYS * DAY_MS;

    if (this.asleep) {
      // Sealed in: the membrane is the whole point. Nothing grows, nothing is
      // eaten, the odometer stops. The box around it goes on drying out.
      this.sealedTicks++;
      this.today.sleep++;
      return;
    }

    this.awakeTicks++;
    // out of its shell on a Friday evening, which the diary will mention. A
    // sealed snail misses it, which is its own fault.
    if (!this.today.disco && isDisco(t, b.tz)) this.today.disco = true;
    if (b.moisture <= SEAL_AT || b.food <= SEAL_AT) {
      this.asleep = true;
      this.events.push({ type: 'sealed', dry: b.moisture <= SEAL_AT });
      return;
    }

    // growth: an approach to SIZE_MAX with a sixty-day time constant at best care
    const q = quality(b);
    const rate = (1 / (TAU_DAYS * 24)) * (old ? 0.25 : 1);
    this.size += (SIZE_MAX - this.size) * rate * q * TICK_H;
    this.today.grew = true;

    // crawling: mostly at night, less when dry, less in a filthy box
    if (this.isActive(i, night, old, b)) {
      this.activeTicks++;
      this.today.active++;
      const d = this.tickDistance(i);
      this.distance += d;
      this.today.dist += d;
    }
    if (!this.adult && (this.size >= SIZE_ADULT || i * TICK_MS >= ADULT_DAYS * DAY_MS)) {
      this.adult = true;
      this.events.push({ type: 'adult' });
    }
  }

  // Old age, and the last day closed. Called once the box has caught up.
  finish(now, b) {
    if (!this.dead && now >= this.dieAt) {
      this.dead = true;
      this.diedAt = this.dieAt;
      this.closeDay(b);
      this.events.push({ type: 'died' });
    }
  }

  // Whether the snail spent this tick moving. Hashed, so it is the same answer
  // for that tick forever — the odometer cannot be farmed by reloading.
  isActive(i, night, old, b) {
    const p = (night ? NIGHT_ACTIVITY : DAY_ACTIVITY)
      * (0.3 + 0.7 * b.moisture)
      * (1 - 0.4 * b.grime)
      * (old ? 0.6 : 1);
    return rnd(this.seed, i, 1) < p;
  }
  // millimetres covered in one moving tick
  tickDistance(i) {
    return SPEED_MM_S * (TICK_MS / 1000) * (0.6 + 0.8 * rnd(this.seed, i, 2));
  }

  // How far it has crawled right now, the tick in progress included, so the
  // view can move it smoothly instead of in five-minute jumps.
  distanceAt(now) {
    const b = this.box;
    if (this.dead || this.asleep || !b) return this.distance;
    const i = this.ownTick(b.tickAt(now));
    if (i !== this.tick || i < 1) return this.distance;
    const night = isNight(this.laidAt + i * TICK_MS, b.tz);
    const old = i * TICK_MS >= OLD_DAYS * DAY_MS;
    if (!this.isActive(i, night, old, b)) return this.distance;
    const into = ((now - this.laidAt) % TICK_MS) / TICK_MS;
    return this.distance + this.tickDistance(i) * into;
  }

  // Where on the lap of the glass it is, in millimetres. The offset keeps three
  // eggs laid the same evening from sitting in exactly one spot.
  alongAt(now) { return wrapLap(this.distanceAt(now) + this.offset * LAP); }
  // The same at the end of a tick, with no interpolation: what the simulation
  // uses when it asks who is next to whom.
  get along() { return wrapLap(this.distance + this.offset * LAP); }

  // ---------- the diary's raw material ----------
  rollDay(i, b) {
    const d = Math.floor((i * TICK_MS) / DAY_MS);
    if (d > this.today.d) {
      this.closeDay(b);
      this.today = dayRecord(d);
    }
  }
  closeDay(b) {
    const r = this.today;
    r.size = Math.round(this.size * 10) / 10;
    r.moisture = Math.round((b ? b.moisture : 1) * 100) / 100;
    r.grime = Math.round((b ? b.grime : 0) * 100) / 100;
    r.asleep = this.asleep;
    this.days.push(r);
    if (this.days.length > LIFE_DAYS + 2) this.days.shift();
    this.events.push({ type: 'day', day: r });
  }

  // ---------- what you do to one snail ----------
  pet(now) {
    if (this.dead) return this;
    this.pets++;
    this.petAt = now;
    this.today.pets++;
    return this;
  }
  wakeIfPossible(now, b) {
    if (this.asleep && b.moisture >= WAKE_AT && b.food >= WAKE_AT) {
      this.asleep = false;
      this.wokeAt = now;                 // the stalks come back out from here
      this.events.push({ type: 'woke' });
    }
  }

  // ---------- what to tell the player ----------
  // 'egg' · 'sealed' · 'dead' · 'crawling' · 'dry' · 'hungry' · 'dirty' · 'resting' · 'content'
  mood(now) {
    const b = this.box;
    if (this.dead) return 'dead';
    if (!this.hatched(now)) return 'egg';
    if (this.asleep) return 'sealed';
    if (b && b.moisture < 0.2) return 'dry';
    if (b && b.food < 0.2) return 'hungry';
    if (b && b.grime > 0.8) return 'dirty';
    if (this.movingAt(now)) return 'crawling';
    if (isNight(now, b ? b.tz : 0)) return 'content';
    return 'resting';
  }
  // How far the eye stalks are pulled in right now, 0 (out) to 1 (in), for
  // whatever reason. A poke beats a slow morning stretch: being touched while
  // still unfolding should make it flinch all the way back in.
  stalkRetraction(now) {
    if (this.dead || this.asleep) return 1;
    return Math.max(retraction(now - this.petAt), stretching(now - this.wokeAt));
  }
  // Still unfolding after dormancy, or still shy after a pet: either way it is
  // not going anywhere yet.
  shy(now) {
    return now - this.petAt < PET_SHY_MS || now - this.wokeAt < WAKE_STRETCH_MS;
  }

  movingAt(now) {
    const b = this.box;
    if (this.dead || this.asleep || !this.hatched(now) || !b) return false;
    const i = this.ownTick(b.tickAt(now));
    if (i < 1) return false;
    return this.isActive(i, isNight(this.laidAt + i * TICK_MS, b.tz), i * TICK_MS >= OLD_DAYS * DAY_MS, b);
  }
  stage(now) {
    if (!this.hatched(now)) return 'egg';
    if (this.dead) return 'gone';
    const d = this.ageDays(now);
    if (d >= OLD_DAYS) return 'old';
    if (this.adult) return 'adult';
    if (d < 14) return 'hatchling';
    return 'juvenile';
  }
  whorls(now) {
    const f = (this.size - SIZE_HATCH) / (SIZE_MAX - SIZE_HATCH);
    return Math.min(5, 1 + Math.floor(f * 4.2 + 0.001)) * (this.hatched(now) ? 1 : 0);
  }

  // Everything worth a notification that can be known in advance for this one
  // snail, as absolute times. Hatching, the birthdays and the end are fixed the
  // moment the egg is laid; sealing up belongs to the box.
  schedule(now) {
    if (this.dead) return [];
    const out = [];
    if (!this.hatched(now)) out.push({ kind: 'hatch', at: this.hatchAt, snail: this });
    for (const years of [1, 2]) out.push({ kind: 'birthday', at: this.laidAt + years * 365 * DAY_MS, years, snail: this });
    out.push({ kind: 'death', at: this.dieAt, snail: this });
    return out.filter((r) => r.at > now && r.at <= this.dieAt);
  }

  // ---------- saving ----------
  toJSON() {
    const o = {};
    for (const k of SAVED_SNAIL) o[k] = this[k];
    return o;
  }
  static fromJSON(j) {
    const l = new Life({ seed: j.seed, name: j.name, laidAt: j.laidAt ?? j.born, bornTick: j.bornTick ?? 0 });
    for (const k of SAVED_SNAIL) if (j[k] !== undefined) l[k] = j[k];
    l.events = [];
    if (!l.today) l.today = dayRecord(0);
    return l;
  }
}

// ===========================================================================
// The terrarium: the four needs, the clock, and up to three snails
// ===========================================================================
export class Box {
  constructor({ born = Date.now(), tz = new Date().getTimezoneOffset() } = {}) {
    this.v = 2;
    this.born = born;               // when the box was set up; the only clock
    this.tz = tz;
    this.tick = 0;
    this.moisture = 1;
    this.food = 1;
    this.calcium = 1;
    this.grime = 0;
    this.meals = {};                // food id -> times served
    this.served = 'lettuce';        // what is lying in the box right now
    this.mists = 0;
    this.cleans = 0;
    this.chalks = 0;
    this.snails = [];
    this.clutches = [];             // eggs buried in the soil, waiting
    // Every name this terrarium has used, the departed included, so a line of
    // heirs keeps counting up. Scoped to the box on purpose: start a new
    // terrarium and you may call a snail Majken again.
    this.usedNames = [];
    this.badges = [];
    this.events = [];
  }

  // ---------- the snails in it ----------
  get room() { return SNAIL_MAX - this.snails.length; }
  hasRoom() { return this.room > 0; }
  add({ name = '', seed = (Date.now() | 0), now = Date.now(), color = null, pattern = null,
    parents = null, parentSeeds = null, quiet = false } = {}) {
    if (!this.hasRoom()) return null;
    const s = new Life({
      seed, name, laidAt: now, color, pattern, parents, parentSeeds,
      bornTick: Math.max(0, Math.ceil((now - this.born) / TICK_MS)),
    });
    s.box = this;
    this.snails.push(s);
    this.claimName(name);
    if (!quiet) this.events.push({ type: 'laid', snail: s });
    return s;
  }
  claimName(name) {
    const n = String(name || '').trim();
    if (n && !this.usedNames.includes(n)) this.usedNames.push(n);
    return n;
  }
  // A snail that has reached the end leaves the box; the keeper is told first.
  remove(snail) {
    this.snails = this.snails.filter((s) => s !== snail);
    snail.box = null;
    return this;
  }
  takeEvents() {
    const mine = this.events;
    this.events = [];
    // each snail's own events carry which snail they were about
    for (const s of this.snails) for (const e of s.takeEvents()) mine.push({ ...e, snail: s });
    return mine;
  }

  // ---------- the clock ----------
  tickAt(now) { return Math.floor((now - this.born) / TICK_MS); }

  // Replays every five-minute tick between where the box is and `now`. Pure: no
  // wall-clock reads, no randomness beyond the (seed, tick) hash.
  advanceTo(now) {
    const target = this.tickAt(now);
    if (target > this.tick) {
      for (let i = this.tick + 1; i <= target; i++) {
        this.decay(i);
        for (const s of this.snails) s.stepAt(i, this);
        this.courtship(i);
        this.eggs(i);
      }
      this.tick = target;
    }
    for (const s of this.snails) s.finish(now, this);
    this.checkBadges(now);
    return this;
  }

  // One tick of the box drying out, whoever is or is not awake in it.
  decay(i) {
    const night = isNight(this.born + i * TICK_MS, this.tz);
    // water goes faster in the warm part of the day, food at night when they eat
    this.moisture = clamp01(this.moisture - (TICK_H / MOIST_HOURS) * (night ? 0.75 : 1.25));
    this.food = clamp01(this.food - (TICK_H / FOOD_HOURS) * (night ? 1.4 : 0.6));
    this.calcium = clamp01(this.calcium - TICK_H / CALCIUM_HOURS);
    this.grime = clamp01(this.grime + TICK_H / GRIME_HOURS);
  }

  // ---------- two snails meeting ----------
  // Garden snails are hermaphrodites, so there is no pairing to arrange: any two
  // grown ones that happen to be on the same patch of glass will do, and both
  // walk away carrying eggs. Which is the fact that makes this worth having.
  courtship(i) {
    if (this.snails.length < 2) return;
    if (quality(this) < MATE_QUALITY) return;          // not a box to raise young in
    const cool = (MATE_COOLDOWN_DAYS * DAY_MS) / TICK_MS;
    const ready = this.snails.filter((s) =>
      !s.dead && !s.asleep && s.adult && !s.gravidTick && i - s.matedTick >= cool);
    for (let a = 0; a < ready.length; a++) {
      for (let b = a + 1; b < ready.length; b++) {
        const one = ready[a], two = ready[b];
        if (one.gravidTick || two.gravidTick) continue;  // one meeting per tick each
        if (isParent(one, two) || isParent(two, one)) continue;
        if (lapGap(one.along, two.along) > MATE_REACH) continue;
        if (rnd(one.seed ^ two.seed, i, 61) >= MATE_CHANCE) continue;
        this.pairUp(one, two, i);
      }
    }
  }

  // Snails are not fussy, but a terrarium of three fills up with one family fast
  // and "X and its own mother found each other" is not a diary entry anyone wants
  // to read. Siblings are fine: only one of a clutch ever stays.
  pairUp(one, two, i) {
    const gravid = i + Math.round((GRAVID_DAYS * DAY_MS) / TICK_MS);
    for (const [s, other] of [[one, two], [two, one]]) {
      s.matedTick = i;
      s.gravidTick = gravid;
      s.mate = { name: other.name, color: other.color, pattern: other.pattern, seed: other.seed };
      s.matings++;
      s.today.mated = other.name;
    }
    // the love dart is built out of chalk, and it is the box's chalk
    this.calcium = clamp01(this.calcium - DART_CALCIUM);
    this.events.push({ type: 'mated', snail: one, other: two });
  }

  // Digging the hole, and what comes up out of it three weeks later.
  eggs(i) {
    for (const s of this.snails) {
      if (s.dead || s.asleep || !s.gravidTick || i < s.gravidTick) continue;
      s.gravidTick = 0;
      const count = CLUTCH_MIN + Math.floor(rnd(s.seed, i, 71) * (CLUTCH_MAX - CLUTCH_MIN));
      this.clutches.push({
        laidTick: i,
        hatchTick: i + Math.round((CLUTCH_DAYS * DAY_MS) / TICK_MS),
        count,
        spot: rnd(s.seed, i, 73),                      // where in the soil, 0-1
        parents: [s.name, s.mate ? s.mate.name : ''],
        parentSeeds: [s.seed, s.mate ? s.mate.seed : s.seed],
        look: {
          color: [s.color, s.mate ? s.mate.color : s.color],
          pattern: [s.pattern, s.mate ? s.mate.pattern : s.pattern],
        },
        seed: (s.seed ^ (s.mate ? s.mate.seed : 0) ^ Math.imul(i, 2654435761)) | 0,
      });
      s.clutches++;
      s.today.eggs = count;
      this.events.push({ type: 'clutch', snail: s, count });
    }
    const due = this.clutches.filter((c) => i >= c.hatchTick);
    for (const c of due) this.hatchClutch(c, i);
    if (due.length) this.clutches = this.clutches.filter((c) => !due.includes(c));
  }

  // A clutch is thirty to a hundred eggs and the box holds three snails, so at
  // most one stays. The rest go out into the garden, which is where they would
  // have ended up anyway.
  hatchClutch(c, i) {
    if (!this.hasRoom()) {
      this.noteHatch(c, 0, '');
      this.events.push({ type: 'garden', count: c.count, parents: c.parents });
      return;
    }
    const t = this.born + i * TICK_MS;
    const child = this.add({
      // named by the family rule here rather than by the page, so the parent's
      // diary can say who stayed on the day it happened
      name: heirName(c.parents, c.seed, this.usedNames) || '',
      seed: c.seed,
      now: t - EGG_MS,                                  // born, not an egg: the soil was the egg
      color: c.look.color[rnd(c.seed, i, 81) < 0.5 ? 0 : 1],
      pattern: c.look.pattern[rnd(c.seed, i, 83) < 0.5 ? 0 : 1],
      parents: c.parents,
      parentSeeds: c.parentSeeds,
      quiet: true,
    });
    this.noteHatch(c, 1, child.name);
    this.events.push({ type: 'hatchling', snail: child, count: c.count, parents: c.parents });
  }

  // The day a clutch comes up belongs in the diary of the snail that buried it.
  // One birth, two sides of it: the parent writes that they hatched, the young
  // one writes whose it is.
  noteHatch(c, kept, name) {
    const layer = this.snails.find((s) => s.seed === (c.parentSeeds ? c.parentSeeds[0] : null));
    if (!layer || layer.dead) return;
    layer.today.hatched = c.count;
    layer.today.kept = kept ? name : '';
  }

  // ---------- what you do to the box ----------
  mist(now) {
    this.advanceTo(now);
    this.moisture = 1;
    this.mists++;
    this.wakeAll(now);
    return this;
  }
  feed(now, type = 'lettuce') {
    this.advanceTo(now);
    const e = FOOD_EFFECT[type] || FOOD_EFFECT.lettuce;
    this.food = 1;
    this.moisture = clamp01(this.moisture + e.moisture);
    this.calcium = clamp01(this.calcium + e.calcium);
    this.meals[type] = (this.meals[type] || 0) + 1;
    this.served = FOOD_EFFECT[type] ? type : 'lettuce';
    for (const s of this.snails) { s.today.meals++; s.today.ate = type; }
    this.wakeAll(now);
    return this;
  }
  chalk(now) {
    this.advanceTo(now);
    this.calcium = 1;
    this.chalks++;
    return this;
  }
  clean(now) {
    this.advanceTo(now);
    this.grime = 0;
    this.cleans++;
    this.moisture = clamp01(this.moisture + 0.1);   // a wash leaves the glass damp
    this.wakeAll(now);
    return this;
  }
  wakeAll(now) { for (const s of this.snails) s.wakeIfPossible(now, this); }

  favouriteFood() {
    let best = null, n = 0;
    for (const [k, v] of Object.entries(this.meals)) if (v > n) { best = k; n = v; }
    return best;
  }

  // ---------- badges ----------
  // The collection is the keeper's, not any one snail's: three snails share one
  // shelf, and a badge is won when any of them earns it.
  best(pick) { return this.snails.reduce((m, s) => Math.max(m, pick(s) || 0), 0); }
  any(test) { return this.snails.some(test); }
  totalMeals() { return Object.values(this.meals).reduce((a, b) => a + b, 0); }
  checkBadges(now) {
    for (const b of BADGES) {
      if (this.badges.includes(b.id)) continue;
      if (b.won(this, now)) { this.badges.push(b.id); this.events.push({ type: 'badge', id: b.id }); }
    }
  }

  // ---------- telling the server what to remind you of ----------
  // When the box will be dry or empty enough that whoever is awake seals in.
  // Runs the real decay forward on a throwaway copy rather than solving it by
  // hand, so the forecast cannot drift from what actually happens.
  forecastSeal(now, maxDays = 30) {
    // An egg counts: it will hatch into a box that is already drying out, and
    // the reminder is about the box running dry either way.
    if (!this.snails.some((s) => !s.dead && !s.asleep)) return null;
    if (this.moisture <= SEAL_AT || this.food <= SEAL_AT) return null;
    const copy = new Box({ born: this.born, tz: this.tz });
    copy.tick = this.tick;
    copy.moisture = this.moisture; copy.food = this.food;
    copy.calcium = this.calcium; copy.grime = this.grime;
    const limit = copy.tick + Math.ceil((maxDays * DAY_MS) / TICK_MS);
    for (let i = copy.tick + 1; i <= limit; i++) {
      copy.decay(i);
      if (copy.moisture <= SEAL_AT || copy.food <= SEAL_AT) return this.born + i * TICK_MS;
    }
    return null;   // being looked after well enough that this is not news
  }

  // Everything worth a notification, soonest first. The box seals as one, so
  // that is a single reminder however many snails are in it; the rest belong to
  // the individual snails.
  schedule(now = Date.now()) {
    const out = [];
    for (const s of this.snails) out.push(...s.schedule(now));
    const seal = this.forecastSeal(now);
    if (seal && seal > now) out.push({ kind: 'sealed', at: seal, snail: this.snails.find((s) => !s.dead) || null });
    return out.filter((r) => r.at > now).sort((a, b) => a.at - b.at);
  }

  // ---------- saving ----------
  toJSON() {
    const o = {};
    for (const k of SAVED_BOX) o[k] = this[k];
    o.snails = this.snails.map((s) => s.toJSON());
    return o;
  }
  static fromJSON(j) {
    const b = new Box({ born: j.born, tz: j.tz });
    for (const k of SAVED_BOX) if (j[k] !== undefined) b[k] = j[k];
    if (!Array.isArray(b.clutches)) b.clutches = [];
    if (!Array.isArray(b.usedNames)) b.usedNames = [];
    b.snails = (j.snails || []).map((s) => {
      const l = Life.fromJSON(s);
      l.box = b;
      return l;
    });
    b.events = [];
    return b;
  }

  // A save from before the box existed: one snail that owned the needs itself.
  // Its life is kept exactly as it was; the box takes over the four needs and
  // becomes the clock, which it already was under another name.
  static fromLegacy(j) {
    const b = new Box({ born: j.born, tz: j.tz });
    b.tick = j.tick || 0;
    for (const k of ['moisture', 'food', 'calcium', 'grime', 'mists', 'cleans', 'chalks']) {
      if (j[k] !== undefined) b[k] = j[k];
    }
    b.meals = j.meals || {};
    b.badges = j.badges || [];
    const l = Life.fromJSON({ ...j, laidAt: j.born, bornTick: 0 });
    l.box = b;
    b.snails = [l];
    b.claimName(l.name);
    return b;
  }
}

export const BADGES = [
  { id: 'laid', won: (b) => b.snails.length > 0 },
  { id: 'hatched', won: (b, now) => b.any((s) => s.hatched(now)) },
  { id: 'firstMeal', won: (b) => b.totalMeals() >= 1 },
  { id: 'firstCrawl', won: (b) => b.best((s) => s.distance) >= 100 },
  { id: 'metre', won: (b) => b.best((s) => s.distance) >= 1000 },
  { id: 'tenMetres', won: (b) => b.best((s) => s.distance) >= 10000 },
  { id: 'hundredMetres', won: (b) => b.best((s) => s.distance) >= 100000 },
  { id: 'kilometre', won: (b) => b.best((s) => s.distance) >= 1000000 },
  { id: 'week', won: (b, now) => b.best((s) => s.ageDays(now)) >= 7 },
  { id: 'month', won: (b, now) => b.best((s) => s.ageDays(now)) >= 30 },
  { id: 'year', won: (b, now) => b.best((s) => s.ageDays(now)) >= 365 },
  { id: 'twoYears', won: (b, now) => b.best((s) => s.ageDays(now)) >= 730 },
  { id: 'threeYears', won: (b, now) => b.best((s) => s.ageDays(now)) >= LIFE_DAYS },
  { id: 'grown', won: (b) => b.any((s) => s.adult) },
  { id: 'shell', won: (b) => b.best((s) => s.size) >= 38 },
  { id: 'sealed', won: (b) => b.best((s) => s.sealedTicks) >= 1 },
  { id: 'longSleep', won: (b) => b.best((s) => s.sealedTicks) * TICK_MS >= 30 * DAY_MS },
  { id: 'menu', won: (b) => Object.keys(b.meals).length >= FOODS.length },
  { id: 'hundredMeals', won: (b) => b.totalMeals() >= 100 },
  { id: 'spotless', won: (b) => b.cleans >= 20 },
  { id: 'patient', won: (b) => b.snails.reduce((a, s) => a + s.pets, 0) >= 50 },
  { id: 'full', won: (b) => b.snails.length >= SNAIL_MAX },
  { id: 'mated', won: (b) => b.any((s) => s.matings > 0) },
  { id: 'clutch', won: (b) => b.any((s) => s.clutches > 0) },
  { id: 'born', won: (b) => b.any((s) => !!s.parents) },
];

const SAVED_SNAIL = ['seed', 'name', 'laidAt', 'bornTick', 'tick', 'size', 'distance', 'asleep',
  'sealedTicks', 'awakeTicks', 'activeTicks', 'pets', 'petAt', 'wokeAt', 'adult', 'dead', 'diedAt',
  'days', 'today', 'color', 'pattern', 'parents', 'parentSeeds', 'matedTick', 'gravidTick', 'mate',
  'matings', 'clutches'];

const SAVED_BOX = ['v', 'born', 'tz', 'tick', 'moisture', 'food', 'calcium', 'grime',
  'meals', 'served', 'mists', 'cleans', 'chalks', 'badges', 'clutches', 'usedNames'];

function dayRecord(d) {
  return { d, dist: 0, sleep: 0, active: 0, meals: 0, pets: 0, grew: false, ate: null, asleep: false,
    size: SIZE_HATCH, moisture: 1, grime: 0, mated: null, eggs: 0, hatched: 0, kept: '', disco: false };
}

// True when `child` came out of a clutch `other` helped lay.
const isParent = (child, other) => !!(child.parentSeeds && child.parentSeeds.includes(other.seed));

const wrapLap = (mm) => ((mm % LAP) + LAP) % LAP;
// The shorter way round the ring between two places on the lap.
export function lapGap(a, b) {
  const d = Math.abs(wrapLap(a) - wrapLap(b));
  return Math.min(d, LAP - d);
}
