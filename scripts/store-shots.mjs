#!/usr/bin/env node
// Press shots for a store listing: docs/store/screenshots/*.png.
//
// Phone-shaped, because that is where the game is played, plus one wide frame
// for listings that want landscape. Staged by scripts/pose.mjs so every rerun
// gives the same pictures.
//
//   npm run shots
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { root, playwright, serve, stage, hidePanels, place, drySlime } from './pose.mjs';

const out = join(root, 'docs', 'store', 'screenshots');
mkdirSync(out, { recursive: true });

const port = Number(process.env.PORT) || 8097;
const server = serve(port);

const shot = async (page, name) => {
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(out, name) });
  console.log('wrote docs/store/screenshots/' + name);
};

try {
  await new Promise((r) => setTimeout(r, 700));
  const { chromium } = await playwright();
  const browser = await chromium.launch();

  // ---------- the phone, which is what this game is ----------
  const phone = await browser.newPage({
    viewport: { width: 1080 / 3, height: 1920 / 3 },
    deviceScaleFactor: 3,             // 1080x1920, what the stores ask for
    reducedMotion: 'reduce',
  });
  await stage(phone, `http://localhost:${port}/?lang=sv`);
  await place(phone, [118, 620]);
  await drySlime(phone);
  await shot(phone, '1-terrariet.png');

  // the diary, which is what the game is actually about
  await phone.click('#o-diary');
  await shot(phone, '2-dagboken.png');
  await phone.click('#diary-close');

  // what one snail has done with its life
  await phone.click('#o-stats');
  await shot(phone, '3-om-snigeln.png');
  await phone.click('#stats-close');

  // the shelf, which is the slow part of the game
  await phone.click('#o-badges');
  await shot(phone, '4-marken.png');
  await phone.click('#badges-close');

  // looked at closely: tap a snail and the scene moves in on it
  await phone.evaluate(() => {
    window.snailstory.view.watch(window.snailstory.box.snails[0]);
    document.getElementById('zoom-out').hidden = false;
  });
  await phone.waitForTimeout(900);    // let the zoom ease all the way in
  await shot(phone, '5-nara.png');
  await phone.close();

  // ---------- one wide frame for listings that want landscape ----------
  const wide = await browser.newPage({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
    reducedMotion: 'reduce',
  });
  await stage(wide, `http://localhost:${port}/?lang=sv`);
  await place(wide, [118, 620]);
  await hidePanels(wide);
  await drySlime(wide);
  await shot(wide, '6-bred.png');
  await wide.close();

  // ---------- omslaget till itch, 630x500 ----------
  const cover = await browser.newPage({
    viewport: { width: 900, height: 800 },
    deviceScaleFactor: 1,
    reducedMotion: 'reduce',
  });
  await stage(cover, `http://localhost:${port}/?lang=sv`);
  // the title sits across the bottom here, so nobody is posed where it lands:
  // one low on the left wall, one under the lid, one mid left-hand glass
  await place(cover, [975, 620, 880]);
  await cover.addStyleTag({ content: `
    #stage { max-width: none !important; padding: 0 !important; }
    .box-wrap { width: 630px !important; height: 500px !important; max-height: none !important;
      min-height: 0 !important; flex: none !important; position: relative; overflow: hidden; }
    #terrarium { width: 630px !important; height: 500px !important; flex: none !important; }
    #zoom-out { display: none !important; }
    .cover-cap { position: absolute; left: 0; right: 0; bottom: 0; z-index: 5; padding: 26px 24px 22px;
      font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #fff; text-align: center;
      background: linear-gradient(0deg, rgba(20,15,10,0.82) 0%, rgba(20,15,10,0.6) 55%, rgba(20,15,10,0) 100%);
      text-shadow: 0 2px 8px rgba(0,0,0,0.5); }
    .cover-cap b { display: block; font-size: 46px; font-weight: 900; letter-spacing: -0.02em; line-height: 1; }
    .cover-cap span { display: block; font-size: 18px; font-weight: 600; margin-top: 8px; }
  ` });
  await cover.evaluate(() => {
    const cap = document.createElement('div');
    cap.className = 'cover-cap';
    cap.innerHTML = '<b>Snail Story</b><span>Tre år. I verklig tid.</span>';
    document.querySelector('.box-wrap').append(cap);
  });
  await cover.waitForTimeout(600);
  await drySlime(cover);
  await cover.locator('.box-wrap').screenshot({ path: join(root, 'docs', 'store', 'cover-630x500.png') });
  console.log('wrote docs/store/cover-630x500.png');
  await cover.close();

  await browser.close();
} finally {
  server.kill();
}
