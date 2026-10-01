// Eggs between terrariums. The two things that matter: an egg must arrive as the
// same egg it left as, and the keeper's own box must not be able to claim what
// somebody else's snails did.
//   node test/egg.test.mjs
import assert from 'node:assert/strict';
import { Box, DAY_MS, SNAIL_MAX, BADGES } from '../js/life.js';
import { encode, decode, EggError, EGG_VERSION } from '../js/egg.js';

let failed = 0;
function test(name, fn) {
  try { fn(); console.log(`ok   ${name}`); } catch (e) { failed++; console.log(`FAIL ${name}\n     ${e.message}`); }
}

// A box kept well enough that two grown snails breed and bury a clutch.
function breeding(days = 420, names = ['Majken', 'Gary']) {
  const now = Date.now();
  const born = now - days * DAY_MS;
  const box = new Box({ born });
  names.forEach((n, i) => box.add({ name: n, seed: 4711 + i * 1000, now: born, quiet: true }));
  for (let t = born + 6 * 3600000; t < now; t += 12 * 3600000) {
    box.mist(t); box.feed(t, 'dandelion'); box.chalk(t); box.clean(t);
  }
  box.advanceTo(now);
  return box;
}
// A clutch in the soil right now, whatever the dice did during the long run.
function withClutch() {
  for (let days = 300; days <= 900; days += 30) {
    const box = breeding(days);
    if (box.clutches.length) return box;
  }
  throw new Error('no clutch in any well-kept box — the mating rules changed');
}

test('an egg arrives as the egg that left', () => {
  const box = withClutch();
  const gift = box.giveEgg();
  const back = decode(encode(gift));
  assert.deepEqual(back, gift, 'the code changed the egg');
});

test('a name with Swedish letters survives the trip', () => {
  const gift = { seed: -12345, color: ['#a8701f', '#e8c56a'], pattern: ['spiral', 'bands'],
    parents: ['Åsa-Märta', 'Gösta'], parentSeeds: [1, 2] };
  assert.deepEqual(decode(encode(gift)), gift);
});

test('two eggs from one clutch are two different snails', () => {
  const box = withClutch();
  const a = box.giveEgg();
  const b = box.giveEgg();
  assert.notEqual(a.seed, b.seed, 'the same egg was handed out twice');
});

test('the eggs run out at the number that was laid', () => {
  // Both of them lay — they are hermaphrodites — so a mating leaves two clutches
  // in the soil, and the eggs on offer are all of them together.
  const box = withClutch();
  const laid = box.clutches.reduce((a, c) => a + c.count, 0);
  for (let i = 0; i < laid; i++) assert.ok(box.giveEgg(), `egg ${i + 1} of ${laid} should be there`);
  assert.equal(box.giveEgg(), null, 'more eggs were given away than were ever laid');
  assert.equal(box.eggsGiven, laid);
  assert.equal(box.clutches.reduce((a, c) => a + (c.count - (c.given || 0)), 0), 0);
});

test('an empty box has nothing to give', () => {
  assert.equal(new Box({ born: Date.now() }).giveEgg(), null);
});

test('the day a keeper gives eggs away is in the layer\'s diary', () => {
  const box = withClutch();
  const c = box.clutches[0];
  const layer = box.snails.find((s) => s.seed === c.parentSeeds[0]);
  const before = layer.today.gave || 0;
  box.giveEgg();
  box.giveEgg();
  assert.equal(layer.today.gave, before + 2);
});

// ---------- the receiving end ----------
test('an egg hatches in the receiving box, named by that box', () => {
  const giver = withClutch();
  const gift = giver.giveEgg();

  const now = Date.now();
  const mine = new Box({ born: now });
  const child = mine.receiveEgg(decode(encode(gift)), now);
  assert.ok(child, 'the egg was refused');
  assert.equal(mine.snails.length, 1);
  assert.ok(child.name, 'the arrival has no name');
  assert.deepEqual(child.parents, gift.parents, 'it lost its family on the way');
  assert.ok(gift.color.includes(child.color), 'its shell is neither parent\'s');
  assert.ok(gift.pattern.includes(child.pattern), 'its pattern is neither parent\'s');
  assert.equal(child.gift, true, 'it does not know it came from elsewhere');
  // ninety seconds in the soil, exactly like the first egg of all
  assert.equal(child.hatched(now), false);
  assert.equal(child.hatched(now + 91 * 1000), true);
});

test('an arrival is numbered against the receiving box, not the sending one', () => {
  const now = Date.now();
  const mine = new Box({ born: now });
  mine.add({ name: 'Majken', seed: 1, now, quiet: true });
  const child = mine.receiveEgg({
    seed: 99, color: ['#a8701f', '#a8701f'], pattern: ['spiral', 'spiral'],
    parents: ['Majken', 'Gary'], parentSeeds: [5, 6],
  }, now);
  assert.notEqual(child.name, 'Majken', 'two Majken in one box');
  assert.match(child.name, /^Majken I{1,3}$/, `odd heir name: ${child.name}`);
});

test('a full terrarium refuses an egg rather than squeezing it in', () => {
  const now = Date.now();
  const box = new Box({ born: now });
  for (let i = 0; i < SNAIL_MAX; i++) box.add({ name: 'S' + i, seed: i, now, quiet: true });
  const refused = box.receiveEgg({
    seed: 7, color: ['#a8701f', '#a8701f'], pattern: ['spiral', 'spiral'],
    parents: ['A', 'B'], parentSeeds: [1, 2],
  }, now);
  assert.equal(refused, null);
  assert.equal(box.snails.length, SNAIL_MAX);
});

test('a gift does not win the badge for breeding your own', () => {
  const now = Date.now();
  const born = (id) => BADGES.find((b) => b.id === id);
  const box = new Box({ born: now });
  box.receiveEgg({
    seed: 7, color: ['#a8701f', '#a8701f'], pattern: ['spiral', 'spiral'],
    parents: ['A', 'B'], parentSeeds: [1, 2],
  }, now);
  assert.equal(born('born').won(box, now), false, 'a gift was counted as born here');
  assert.equal(born('gifted').won(box, now), true, 'receiving an egg won nothing');
  assert.equal(born('gave').won(box, now), false, 'nothing was given away');

  const giver = withClutch();
  giver.giveEgg();
  assert.equal(born('gave').won(giver, now), true, 'giving an egg away won nothing');
});

test('a snail born here still wins it', () => {
  const box = withClutch();
  box.advanceTo(Date.now());
  const home = box.snails.find((s) => s.parents && !s.gift);
  if (!home) return;                     // the dice gave no hatchling in this run
  assert.equal(BADGES.find((b) => b.id === 'born').won(box, Date.now()), true);
});

// ---------- everything that must be refused ----------
function refuses(text, code, what) {
  try {
    decode(text);
    assert.fail(`${what} was accepted`);
  } catch (e) {
    assert.ok(e instanceof EggError, `${what} threw something else: ${e.message}`);
    assert.equal(e.code, code, what);
  }
}

test('a code that lost something on the way is refused, not guessed at', () => {
  const good = encode({ seed: 5, color: ['#a8701f', '#e8c56a'], pattern: ['spiral', 'bands'],
    parents: ['Majken', 'Gary'], parentSeeds: [1, 2] });
  refuses('god morgon', 'foreign', 'a greeting');
  refuses('SNAILEGG1.abc', 'unreadable', 'half a code');
  refuses(good.slice(0, good.length - 6), 'unreadable', 'a code cut off before its checksum');
  // cut inside the body, so it still looks whole: this is the one the checksum
  // is there for
  refuses(good.replace(/\.(.{6})/, '.'), 'broken', 'a code with a bite out of the middle');
  refuses(good.replace(/.$/, 'x'), 'broken', 'a mistyped checksum');
  refuses(`SNAILEGG${EGG_VERSION + 1}.aa.bb`, 'future', 'a code from a later version');
});

test('whitespace from a chat app does not break a code', () => {
  const gift = { seed: 5, color: ['#a8701f', '#e8c56a'], pattern: ['spiral', 'bands'],
    parents: ['Majken', 'Gary'], parentSeeds: [1, 2] };
  const code = encode(gift);
  assert.deepEqual(decode(`  ${code.slice(0, 20)}\n${code.slice(20)}  `), gift);
});

test('an egg survives the save file, both ends of it', () => {
  const now = Date.now();
  const box = new Box({ born: now });
  box.receiveEgg({
    seed: 7, color: ['#a8701f', '#a8701f'], pattern: ['spiral', 'spiral'],
    parents: ['A', 'B'], parentSeeds: [1, 2],
  }, now);
  const giver = withClutch();
  giver.giveEgg();
  assert.equal(Box.fromJSON(JSON.parse(JSON.stringify(box.toJSON()))).snails[0].gift, true,
    'the arrival forgot it was a gift after a reload');
  assert.equal(Box.fromJSON(JSON.parse(JSON.stringify(giver.toJSON()))).eggsGiven, giver.eggsGiven,
    'the count of given eggs did not survive a reload');
  const c = Box.fromJSON(JSON.parse(JSON.stringify(giver.toJSON()))).clutches[0];
  assert.equal(c.given, giver.clutches[0].given, 'the clutch forgot how many were given');
});

console.log(failed ? `\n${failed} failing` : '\nall good');
process.exit(failed ? 1 : 0);
