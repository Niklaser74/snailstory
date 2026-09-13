// Sends Snail Story's reminders: the egg hatched, the snail sealed itself in,
// a birthday, the end of the three years.
//
// Called only by the cron job in 20260912190000_snailstory_reminders.sql, which
// proves itself with a shared secret from Supabase Vault — there is no user
// request behind this, so JWT verification is off and that check is the door.
// Everything due is taken and deleted in one statement, so a slow run or an
// overlapping one cannot send the same reminder twice.
import { sendPush, b64url, b64urlDecode } from './webpush.js';
import { TITLE, body, fallbackName, tagFor } from './texts.js';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SITE = 'https://snails.se';   // also the VAPID subject: keep it the origin
const GAME = `${SITE}/snailstory/`;

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } });

const rest = (path: string, init: RequestInit = {}) =>
  fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
  });

type Sub = { endpoint: string; p256dh: string; auth: string };
type Row = { kind: string; years: number; snail: string | null; lang: string | null; name: string | null; subs: Sub[] };

// Comparison that does not leak the secret's length or its first differing byte.
function sameSecret(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  try {
    const expected = await (await rest('rpc/snailstory_cron_key', { method: 'POST', body: '{}' })).json();
    if (!expected || typeof expected !== 'string') return json({ error: 'cron key missing' }, 500);
    if (!sameSecret(req.headers.get('x-cron-key') || '', expected)) return json({ error: 'forbidden' }, 403);

    const due: Row[] = await (await rest('rpc/snailstory_take_due', { method: 'POST', body: JSON.stringify({ p_limit: 500 }) })).json();
    if (!Array.isArray(due) || !due.length) return json({ due: 0, sent: 0 });

    // The series has one VAPID key pair; Snäckmageddon's migration created it.
    const jwkText = await (await rest('rpc/snails_vapid_private', { method: 'POST', body: '{}' })).json();
    if (!jwkText) return json({ error: 'vapid key missing' }, 500);
    const jwk = typeof jwkText === 'string' ? JSON.parse(jwkText) : jwkText;
    const publicKey = b64url(new Uint8Array([4, ...b64urlDecode(jwk.x), ...b64urlDecode(jwk.y)]));
    const vapid = { publicKey, jwk };

    let sent = 0;
    const dead = new Set<string>();
    for (const r of due) {
      const name = (r.name || '').trim() || fallbackName(r.lang);
      const payload = { title: TITLE, body: body(r.kind, r.lang, name, r.years), url: GAME, tag: tagFor(r.kind, r.years, r.snail) };
      for (const s of r.subs || []) {
        const status = await sendPush({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, vapid, SITE).catch(() => 0);
        if (status === 200 || status === 201) sent++;
        else if (status === 404 || status === 410) dead.add(s.endpoint);
      }
    }
    for (const e of dead) await rest(`snailstory_push_subscriptions?endpoint=eq.${encodeURIComponent(e)}`, { method: 'DELETE' });
    return json({ due: due.length, sent, dead: dead.size });
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
