// An egg you can give away, as a code somebody can paste.
//
// A clutch is thirty to a hundred eggs and the box holds three snails, so all
// but one of them were going out into the garden anyway. That surplus is the
// thing worth trading: an egg carries a family, a shell colour and a pattern,
// but no diary — so nobody's three-year snail is ever duplicated, and it does
// not matter in the slightest if the same code is pasted ten times. No scarcity
// to guard means no server to guard it: this works offline, between two people
// who can send each other a line of text.
//
// Unlike the backup file, which is plain JSON because somebody has to keep it
// for three years and may have to repair it by hand, this is encoded. It lives
// for the minutes between one chat message and the next, nobody reads it, and
// what matters is that it survives being pasted and that a truncated one is
// refused rather than half-understood.
export const EGG_VERSION = 1;
const MARK = 'SNAILEGG';

export class EggError extends Error {
  constructor(code) { super(code); this.code = code; }
}

// Base64url over UTF-8, so a parent called Åsa-Märta travels intact. btoa and
// TextEncoder are both global in browsers and in node, so the tests run the
// same code the page does.
function toB64(s) {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromB64(s) {
  const pad = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4);
  const bin = atob(pad);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

// FNV-1a. Not a security measure — nobody is being kept out, since anybody
// could write their own code and the eggs are free. It is there so that a code
// that lost its last line in a chat app is refused instead of decoding into
// something shapeless.
function check(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return (h >>> 0).toString(36).padStart(7, '0').slice(-4);
}

// Both parents' colours and patterns travel, and the receiving box draws which
// one the young takes after — the same lottery as a clutch hatching at home.
// Keeping it on the receiver's side means the giver cannot see what they sent,
// which is the better half of the surprise.
export function encode(gift) {
  const body = toB64(JSON.stringify([
    gift.seed | 0,
    gift.color[0], gift.color[1],
    gift.pattern[0], gift.pattern[1],
    String(gift.parents[0] || '').slice(0, 16), String(gift.parents[1] || '').slice(0, 16),
    gift.parentSeeds[0] | 0, gift.parentSeeds[1] | 0,
  ]));
  return `${MARK}${EGG_VERSION}.${body}.${check(body)}`;
}

export function decode(text) {
  const raw = String(text || '').trim().replace(/\s+/g, '');
  if (!raw.startsWith(MARK)) throw new EggError('foreign');
  const parts = raw.slice(MARK.length).split('.');
  if (parts.length !== 3) throw new EggError('unreadable');
  const [v, body, sum] = parts;
  if (!(Number(v) <= EGG_VERSION)) throw new EggError('future');
  if (check(body) !== sum) throw new EggError('broken');

  let a;
  try { a = JSON.parse(fromB64(body)); } catch { throw new EggError('broken'); }
  if (!Array.isArray(a) || a.length !== 9) throw new EggError('broken');
  const [seed, c0, c1, p0, p1, n0, n1, s0, s1] = a;
  if (!Number.isFinite(seed) || !c0 || !c1 || !p0 || !p1) throw new EggError('broken');

  return {
    seed: seed | 0,
    color: [String(c0), String(c1)],
    pattern: [String(p0), String(p1)],
    parents: [String(n0 || ''), String(n1 || '')],
    parentSeeds: [s0 | 0, s1 | 0],
  };
}

// What to say about an egg before taking it in. Deliberately not the shell: the
// young takes after one parent or the other and which one is not decided until
// it hatches.
export function describe(gift) {
  return { parents: gift.parents.filter(Boolean), seed: gift.seed };
}
