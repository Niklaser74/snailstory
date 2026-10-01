// A copy of the terrarium on the account.
//
// The box lives in localStorage and still does. This is the answer to the one
// thing a local save cannot survive: three years is longer than anybody keeps a
// phone. The client uploads its save about once a day; a new device *fetches*
// it on purpose, with a question first, through the same restore path as a
// file. Nothing merges, nothing is written back on its own, and two boxes on one
// account never race each other.
//
// Everything here is best effort, like push.js: the game works with no network,
// no account and no permission, and nothing in this file may throw into it.
import { online } from './supa.js';
import { pack, serialize } from './backup.js';

// How often a copy is worth uploading. A snail's day is a line in a diary, so
// anything oftener than daily uploads the same box again for nothing.
export const EVERY_MS = 20 * 3600 * 1000;
// A three-year box with three snails is about 400 kB. Well past that is a sign
// something is wrong, and it is better to stop uploading than to hammer the
// server with it.
const MAX_BYTES = 3000000;

export const cloud = {
  // The copy is a choice, and an off switch that leaves a copy behind on the
  // server would be a lie — `disable` deletes it.
  // Returns the time the copy was stored, or null if it was not. The caller must
  // believe the answer and not the attempt: a switch that says "saved" when
  // nothing was saved is worse than no switch, because the player stops worrying.
  async enable(box, opts) {
    return this.put(box, { ...opts, force: true });
  },
  async disable(device) {
    try { await online.rpc('snailstory_drop_save', { p_device: device }); } catch { /* best effort */ }
  },

  // Upload this browser's copy. Returns the time it was stored, or null if there
  // was nothing to do — not signed in, nothing to copy, or copied recently
  // enough already. The shelf of departed snails travels with it: a restore
  // replaces the whole state, and arriving on a new phone with the shelf wiped
  // would lose the only trace those snails left.
  // `force` is the keeper asking for this, so it may create the invisible
  // account the series shares — the same thing turning reminders on does.
  // Without it there is no account-making: a daily upload is not a reason to
  // sign somebody up for anything.
  async put(box, { device = '', previous = [], appVersion = '', force = false, since = 0 } = {}) {
    if (!box || !box.snails.length) return null;
    if (!force && (!online.signedIn() || Date.now() - since < EVERY_MS)) return null;
    const text = serialize(pack({ box, previous, savedAt: Date.now(), appVersion }));
    if (text.length > MAX_BYTES) return null;
    const stamp = await online.rpc('snailstory_put_save', {
      p_save: text,
      p_device: device,
      p_label: box.snails.map((s) => s.name).filter(Boolean).join(', ').slice(0, 120),
      p_days: box.snails.reduce((a, s) => Math.max(a, (s.days || []).length), 0),
      p_saved_at: new Date().toISOString(),
    });
    return stamp || new Date().toISOString();
  },

  // What is on the account, newest first, without the saves themselves.
  async list() {
    if (!online.signedIn()) return [];
    const rows = await online.rpc('snailstory_list_saves', {});
    return Array.isArray(rows) ? rows : [];
  },

  // One copy back, as the text a restore reads. Null device means the newest.
  async get(device = null) {
    if (!online.signedIn()) return null;
    const row = await online.rpc('snailstory_get_save', { p_device: device });
    return row && row.save ? row : null;
  },
};
