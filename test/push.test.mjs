// The reminder pipeline, as far as it can be checked without a phone: the
// sentences the server will send, and the encryption the push service will
// receive. The last hop — a real push service delivering to a real browser —
// is the one thing a test cannot stand in for.
//   node test/push.test.mjs
import assert from 'node:assert/strict';
import { TITLE, KINDS, body, fallbackName, tagFor } from '../supabase/functions/snailstory-notify/texts.js';
import { encryptPayload, decryptPayload, vapidAuthorization, b64url, b64urlDecode } from '../supabase/functions/snailstory-notify/webpush.js';
import { REMINDER_KINDS } from '../js/life.js';

let failed = 0;
async function test(name, fn) {
  try { await fn(); console.log(`ok   ${name}`); } catch (e) { failed++; console.log(`FAIL ${name}\n     ${e.message}`); }
}

await test('every kind the client can schedule has a sentence in both languages', () => {
  assert.deepEqual([...KINDS].sort(), [...REMINDER_KINDS].sort(), 'the sender and the client know different kinds');
  for (const kind of KINDS) {
    for (const lang of ['sv', 'en']) {
      const s = body(kind, lang, 'Majken', 2);
      assert.ok(s.length > 10, `${kind}/${lang} is too short`);
      assert.ok(s.includes('Majken'), `${kind}/${lang} does not name the snail`);
      assert.ok(!s.includes('{') && !s.includes('undefined'), `${kind}/${lang}: ${s}`);
      assert.ok(/[.!]$/.test(s), `${kind}/${lang} does not end in a full stop`);
    }
  }
  assert.notEqual(body('hatch', 'sv', 'Majken'), body('hatch', 'en', 'Majken'), 'the languages must differ');
});

await test('a birthday says which one, and only the birthday does', () => {
  assert.ok(body('birthday', 'sv', 'Gösta', 1).includes('1'));
  assert.ok(body('birthday', 'en', 'Gösta', 2).includes('2'));
  for (const kind of ['hatch', 'sealed', 'death']) {
    assert.ok(!/\d/.test(body(kind, 'sv', 'Gösta', 2)), kind + ' should not carry a number');
  }
});

await test('a nameless snail still gets a sentence', () => {
  for (const lang of ['sv', 'en']) {
    const s = body('sealed', lang, fallbackName(lang));
    assert.ok(s.length > 10 && !s.startsWith(' '), s);
  }
});

await test('the kinds get their own notification tags, so none buries another', () => {
  const tags = new Set();
  for (const kind of KINDS) tags.add(tagFor(kind, 0));
  tags.add(tagFor('birthday', 1));
  tags.add(tagFor('birthday', 2));
  assert.equal(tags.size, KINDS.length + 2, 'two reminders share a tag');
  for (const t of tags) assert.match(t, /^snailstory-/, 'tags are namespaced: one origin for the whole series');
});

await test('a reminder survives the round trip a push service puts it through', async () => {
  // a subscriber key pair, exactly as a browser would hand one over
  const user = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const auth = crypto.getRandomValues(new Uint8Array(16));
  const sub = {
    endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
    keys: { p256dh: b64url(await crypto.subtle.exportKey('raw', user.publicKey)), auth: b64url(auth) },
  };
  const payload = JSON.stringify({
    title: TITLE,
    body: body('sealed', 'sv', 'Majken'),
    url: 'https://snails.se/snailstory/',
    tag: tagFor('sealed', 0),
  });
  const enc = await encryptPayload(sub, payload);
  assert.equal(enc[20], 65, 'key id length');
  assert.deepEqual([...enc.slice(16, 20)], [0, 0, 16, 0], 'record size');
  assert.equal(await decryptPayload(enc, user, auth), payload, 'the payload did not come back intact');
});

await test('the VAPID header is signed for the push service it is sent to', async () => {
  const vk = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const jwk = await crypto.subtle.exportKey('jwk', vk.privateKey);
  const pub = b64url(await crypto.subtle.exportKey('raw', vk.publicKey));
  const header = await vapidAuthorization('https://fcm.googleapis.com/fcm/send/abc', { publicKey: pub, jwk }, 'https://snails.se');
  const m = header.match(/^vapid t=([^,]+), k=(.+)$/);
  assert.ok(m, 'authorization header format');
  assert.equal(m[2], pub);
  const [h, c, s] = m[1].split('.');
  const claims = JSON.parse(new TextDecoder().decode(b64urlDecode(c)));
  assert.equal(claims.aud, 'https://fcm.googleapis.com', 'audience must be the push service origin');
  assert.equal(claims.sub, 'https://snails.se');
  assert.ok(claims.exp > Date.now() / 1000 + 3600);
  const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, vk.publicKey, b64urlDecode(s), new TextEncoder().encode(`${h}.${c}`));
  assert.equal(ok, true, 'the VAPID signature does not verify');
});

if (failed) { console.log(`${failed} failed`); process.exit(1); }
