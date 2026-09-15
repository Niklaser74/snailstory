// Shared staging for the pictures: a terrarium that looks the same every time
// it is photographed. Seeds are fixed and the run of care is fixed, so the
// press shots and the OG image can be regenerated without the picture quietly
// becoming a different picture — which is what makes anyone afraid to retake it.
//
// Used by scripts/og-image.mjs and scripts/store-shots.mjs.
import { spawn } from 'node:child_process';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// The hub repo owns the Playwright install; scripts/icons.mjs borrows it the
// same way rather than adding a dependency to a game with none.
export async function playwright() {
  const pw = resolve(root, process.env.PLAYWRIGHT_DIR || '../dev-snails/node_modules/playwright');
  return import(pathToFileURL(join(pw, 'index.mjs')).href);
}

export function serve(port) {
  const server = spawn(process.execPath, [join(root, 'scripts', 'serve.mjs')],
    { env: { ...process.env, PORT: String(port) }, stdio: 'ignore' });
  return server;
}

// Builds the terrarium in the page, saves it the way the game would, and
// reloads so the app picks it up as an ordinary save. Two snails looked after
// for seven months; whether a third has been born in that time is up to the
// simulation, and it usually has been.
export async function stage(page, url) {
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.evaluate(async () => {
    const L = await import('./js/life.js');
    const DAY = 86400000;
    const born = Date.now() - 210 * DAY;
    const box = new L.Box({ born, tz: -60 });
    box.add({ seed: 4711, name: 'Majken', now: born });
    box.add({ seed: 1337, name: 'Gösta', now: born + 30 * DAY });
    for (let t = born + 6 * 3600000; t < Date.now(); t += 12 * 3600000) {
      box.mist(t); box.feed(t, 'dandelion'); box.chalk(t); box.clean(t);
    }
    box.advanceTo(Date.now());
    for (const s of box.snails) { s.petAt = 0; s.wokeAt = 0; }
    localStorage.setItem('snailstory.box', JSON.stringify(box.toJSON()));
    localStorage.setItem('snailstory.savedAt', String(Date.now()));
  });
  await page.reload({ waitUntil: 'networkidle' });
  await hidePanels(page);
}

export async function hidePanels(page) {
  await page.evaluate(() => {
    for (const id of ['away', 'egg', 'welcome', 'death', 'menu', 'toast']) {
      const el = document.getElementById(id);
      if (el) el.hidden = true;
    }
  });
}

// Where each snail sits on the lap of the glass. Posed after the reload because
// the offset that spreads them out comes from the seed and is not saved.
export async function place(page, spots) {
  await page.evaluate((list) => {
    const box = window.snailstory.box;
    list.forEach((mm, i) => {
      if (!box.snails[i]) return;
      box.snails[i].offset = 0;
      box.snails[i].distance = mm;
    });
  }, spots);
}

// A drying slime trail is right in the game and loud in a still picture. The
// positions do not change between frames, so an expired entry is kept rather
// than replaced with a fresh trail.
export async function drySlime(page) {
  await page.evaluate(() => {
    for (const t of window.snailstory.view.trails.values()) t.until = 0;
  });
  await page.waitForTimeout(120);
}
