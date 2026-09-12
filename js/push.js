// Reminders. The snail's future is deterministic apart from what the keeper
// does, so the app does not need a server that watches it — it hands the server
// a short list of "tell me at this time" rows and refreshes the list whenever it
// is open. A cron job on the other end sends whatever has come due.
//
// Every call here is best effort: the game works with no network, no account
// and no permission, and nothing in this file may throw into the game.
import { VAPID_PUBLIC_KEY, SUPABASE_URL } from './config.js';
import { online } from './supa.js';

function keyBytes(b64) {
  const s = b64.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (b64.length % 4)) % 4);
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export const push = {
  supported() {
    return !!(VAPID_PUBLIC_KEY && SUPABASE_URL) && typeof navigator !== 'undefined'
      && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  },
  // iOS only allows push for apps installed on the home screen
  needsInstall() {
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
    return ios && !standalone;
  },
  permission() { return typeof Notification === 'undefined' ? 'denied' : Notification.permission; },

  async current() {
    try { const reg = await navigator.serviceWorker.ready; return await reg.pushManager.getSubscription(); } catch { return null; }
  },
  // True when this browser is subscribed on the server's behalf. The stored
  // flag is only a hint; the subscription itself is the truth.
  async active() {
    return this.supported() && this.permission() === 'granted' && !!(await this.current());
  },

  // Ask for permission (needs a user gesture), subscribe this browser, and
  // register the snail's schedule. Returns 'on', or why it could not be.
  async enable(life, lang) {
    if (!this.supported()) return 'unsupported';
    if (this.needsInstall()) return 'install';
    if (this.permission() === 'denied') return 'blocked';
    if (this.permission() !== 'granted') {
      const p = await Notification.requestPermission();
      if (p !== 'granted') return 'blocked';
    }
    const reg = await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription())
      || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC_KEY) }));
    const j = sub.toJSON();
    await online.rpc('snailstory_save_push', { p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth, p_lang: lang });
    await this.sync(life, lang);
    return 'on';
  },

  // Stop reminding: drop the browser's subscription and everything queued for
  // this account. The account itself stays, so turning them back on is one tap.
  async disable() {
    const sub = await this.current();
    try { if (sub) await online.rpc('snailstory_remove_push', { p_endpoint: sub.toJSON().endpoint }); } catch { /* best effort */ }
    try { await online.rpc('snailstory_clear_reminders'); } catch { /* best effort */ }
    try { if (sub) await sub.unsubscribe(); } catch { /* best effort */ }
  },

  // Hand the server the snail's whole known future. Replaces what was there, so
  // it is always the latest forecast and never an accumulating queue.
  async sync(life, lang, { keepalive = false } = {}) {
    if (!life || !online.signedIn()) return false;
    const rows = life.schedule(Date.now()).map((r) => ({
      kind: r.kind,
      at: new Date(r.at).toISOString(),
      years: r.years ?? null,
    }));
    await online.rpc('snailstory_set_reminders', {
      p_rows: rows,
      p_lang: lang,
      p_name: (life.name || '').slice(0, 24),
    }, { keepalive });
    return true;
  },

  // Nothing left to remind about: the snail was given up on, or replaced.
  async clearSchedule() {
    if (!online.signedIn()) return;
    try { await online.rpc('snailstory_clear_reminders'); } catch { /* best effort */ }
  },

  // The subscription belongs to this service worker scope, and the browser can
  // drop it on its own (a push service rotating endpoints, a long absence).
  // Quietly put it back when permission is still granted.
  async resubscribe(life, lang) {
    try {
      if (!this.supported() || this.permission() !== 'granted' || this.needsInstall()) return false;
      if (!online.signedIn()) return false;
      if (await this.current()) return false;
      await this.enable(life, lang);
      return true;
    } catch { return false; }
  },
};
