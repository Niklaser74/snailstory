// The terrarium lives in this browser's localStorage and nowhere else. That is
// deliberate — the game works with no account and no network — but it means that
// clearing the browser ends a three-year snail in a second, with nothing to
// recover from. This file is the way out: the save, plus the shelf of earlier
// snails, as one file the keeper holds.
//
// Plain JSON, deliberately not compressed and not encoded. A file somebody is
// meant to keep for three years should be one they can open, read, e-mail to
// themselves and repair by hand if a byte goes missing. Base64 or gzip would
// save maybe two thirds of a hundred kilobytes and buy nothing for it.
//
// No DOM in here, so test/backup.test.mjs can round-trip a whole three-year
// save without a browser.
import { Box } from './life.js';

export const FILE_VERSION = 1;
const MARK = 'snailstory';

// Why a restore was refused. The page turns these into sentences; they are not
// user-facing text and never change spelling once shipped.
export class BackupError extends Error {
  constructor(code) { super(code); this.code = code; }
}

// Everything worth keeping, in one object. `previous` is the shelf of departed
// snails — it is part of the keeper's history even though it is not the box.
export function pack({ box, previous = [], savedAt = Date.now(), appVersion = '' } = {}) {
  if (!box) throw new BackupError('empty');
  return {
    app: MARK,
    v: FILE_VERSION,
    made: new Date(savedAt).toISOString(),
    appVersion,
    savedAt,
    box: typeof box.toJSON === 'function' ? box.toJSON() : box,
    previous,
  };
}

// Indented on purpose: a diff of two copies should be readable, and a keeper who
// opens the file should be able to find the diary.
export function serialize(file) { return JSON.stringify(file, null, 1); }

// Read a file back. Refuses anything it cannot prove is a loadable Snail Story
// save, and proves it the only honest way — by building the box from it. Better
// a refusal than a half-restored terrarium in place of a live one.
export function parse(text) {
  let file;
  try { file = JSON.parse(String(text)); } catch { throw new BackupError('unreadable'); }
  if (!file || typeof file !== 'object' || Array.isArray(file)) throw new BackupError('unreadable');
  if (file.app !== MARK) throw new BackupError('foreign');
  if (!(file.v <= FILE_VERSION)) throw new BackupError('future');
  if (!file.box || typeof file.box !== 'object') throw new BackupError('unreadable');

  let box;
  try { box = Box.fromJSON(file.box); } catch { throw new BackupError('broken'); }
  if (!box.snails.length) throw new BackupError('empty');
  if (!(box.born > 0)) throw new BackupError('broken');

  return {
    box: file.box,
    previous: Array.isArray(file.previous) ? file.previous : [],
    savedAt: Number(file.savedAt) || Date.parse(file.made) || 0,
    made: file.made || '',
    appVersion: file.appVersion || '',
    built: box,                       // already validated, so the page need not redo it
  };
}

// What to say before replacing a living terrarium with this one: who is in it,
// how much diary there is, and when the copy was taken.
export function summary(parsed) {
  const snails = (parsed.box.snails || []);
  return {
    names: snails.map((s) => s.name).filter(Boolean),
    count: snails.length,
    days: snails.reduce((a, s) => Math.max(a, (s.days || []).length), 0),
    savedAt: parsed.savedAt,
  };
}

// snailstory-majken-2026-09-28.json — the name carries the snail and the day, so
// a folder of copies sorts and reads by itself.
export function fileName(file, now = Date.now()) {
  const first = ((file.box && file.box.snails) || [])[0];
  const slug = String((first && first.name) || 'snigel')
    .toLowerCase()
    .replace(/[åä]/g, 'a').replace(/ö/g, 'o')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'snigel';
  const d = new Date(now);
  const pad = (n) => String(n).padStart(2, '0');
  const day = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return `${MARK}-${slug}-${day}.json`;
}
