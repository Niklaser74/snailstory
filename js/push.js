// Reminders. The snail's future is deterministic apart from what the keeper
// does, so the app does not need a server that watches it — it hands the server
// a short list of "tell me at this time" rows and refreshes the list whenever it
// is open. A cron job on the other end sends whatever has come due.
//
// Every call here is best effort: the game works with no network, no account
// and no permission, and nothing in this file may throw into the game.
import { VAPID_PUBLIC_KEY, SUPABASE_URL } from './config.js';
import { online } from './supa.js';

// As many rows as the server will take in one schedule. Three snails can have
// a hatching, six birthdays, three ends and one drying-out box between them.
const ROW_MAX = 16;

// A short, stable handle for one snail, used only to keep its reminders apart
// from its box-mates' in the server's key.
const snailKey = (s) => ((s.seed >>> 0).toString(36));

// And one for this browser. The box lives in localStorage, so a phone and a
// laptop are two different terrariums — but the account is shared across both
// as soon as it is linked to Google. Without a handle per browser the two boxes
// share one schedule slot on the server and quietly overwrite each other.
//
// It identifies a browser, nothing else: no name, no fingerprint, and it never
// leaves the reminder rows.
const DEVICE_KEY = 'snailstory.device';
function deviceId() {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return 'ingen';        // private mode: one shared slot is better than none
  }
}

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
  async enable(box, lang) {
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
    await this.sync(box, lang);
    return 'on';
  },

  // Stop reminding: drop this browser's subscription and the schedule it put
  // there. Another device's box keeps its own. The account stays, so turning
  // them back on is one tap.
  async disable() {
    const sub = await this.current();
    try { if (sub) await online.rpc('snailstory_remove_push', { p_endpoint: sub.toJSON().endpoint }); } catch { /* best effort */ }
    try { await online.rpc('snailstory_clear_reminders', { p_device: deviceId() }); } catch { /* best effort */ }
    try { if (sub) await sub.unsubscribe(); } catch { /* best effort */ }
  },

  // Hand the server the terrarium's whole known future. Replaces what was there,
  // so it is always the latest forecast and never an accumulating queue.
  //
  // Three snails have more to say than one: each carries its own name and a
  // short key of its own, because two snails' first birthdays are two different
  // days and must not overwrite each other. Soonest first, capped — by the time
  // the early ones fire the app has been opened and the list rewritten.
  async sync(box, lang, { keepalive = false } = {}) {
    if (!box || !online.signedIn()) return false;
    const rows = box.schedule(Date.now()).slice(0, ROW_MAX).map((r) => ({
      kind: r.kind,
      at: new Date(r.at).toISOString(),
      years: r.years ?? 0,
      snail: r.snail ? snailKey(r.snail) : '',
      name: (r.snail && r.snail.name ? r.snail.name : '').slice(0, 24),
    }));
    await online.rpc('snailstory_set_reminders', {
      p_rows: rows, p_lang: lang, p_device: deviceId(),
    }, { keepalive });
    return true;
  },

  // Nothing left to remind about in THIS box: it was given up on, or replaced.
  // Other devices' boxes are none of its business.
  async clearSchedule() {
    if (!online.signedIn()) return;
    try { await online.rpc('snailstory_clear_reminders', { p_device: deviceId() }); } catch { /* best effort */ }
  },

  // The subscription belongs to this service worker scope, and the browser can
  // drop it on its own (a push service rotating endpoints, a long absence).
  // Quietly put it back when permission is still granted.
  async resubscribe(box, lang) {
    try {
      if (!this.supported() || this.permission() !== 'granted' || this.needsInstall()) return false;
      if (!online.signedIn()) return false;
      if (await this.current()) return false;
      await this.enable(box, lang);
      return true;
    } catch { return false; }
  },
};
