#!/usr/bin/env node
// Renders icons/og-1200x630.png: a real frame of the game with a caption over
// it, not a mock-up. The terrarium is staged by scripts/pose.mjs, which seeds it
// the same way every time — a screenshot that changes on its own is one nobody
// dares retake.
//
//   npx playwright install chromium   (once, in the hub repo)
//   npm run og:image
import { join } from 'node:path';
import { root, playwright, serve, stage, place, drySlime } from './pose.mjs';

const port = Number(process.env.PORT) || 8098;
const server = serve(port);

try {
  await new Promise((r) => setTimeout(r, 700));
  const { chromium } = await playwright();
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1400, height: 1000 },
    deviceScaleFactor: 1,
    reducedMotion: 'reduce',          // no disco lights, no wobble: a still picture
  });

  await stage(page, `http://localhost:${port}/?lang=sv`);
  await place(page, [118, 620]);      // one on the soil by the leaf, one under the lid

  // The frame is the terrarium at 1200x630. The page is a phone-first column
  // with a max width on wide screens, so that cap has to go or the canvas never
  // reaches the edges.
  await page.addStyleTag({ content: `
    #stage { max-width: none !important; padding: 0 !important; }
    .box-wrap { width: 1200px !important; height: 630px !important;
      max-height: none !important; min-height: 0 !important; flex: none !important;
      position: relative; overflow: hidden; }
    #terrarium { width: 1200px !important; height: 630px !important; flex: none !important; }
    #zoom-out { display: none !important; }
    /* a soft scrim so the words hold up over glass, soil or sky alike */
    .og-caption { position: absolute; left: 0; top: 0; width: 640px; height: 630px; z-index: 5;
      display: flex; flex-direction: column; justify-content: center; padding: 0 0 0 52px;
      box-sizing: border-box; color: #fff;
      font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      background: linear-gradient(90deg, rgba(20,15,10,0.72) 0%, rgba(20,15,10,0.55) 55%, rgba(20,15,10,0) 100%);
      text-shadow: 0 2px 10px rgba(0,0,0,0.5); }
    .og-caption b { display: block; font-size: 64px; font-weight: 900; letter-spacing: -0.02em; line-height: 1; }
    .og-caption span { display: block; font-size: 26px; font-weight: 600; margin-top: 14px; max-width: 480px; line-height: 1.35; }
    .og-caption small { display: block; font-size: 20px; font-weight: 700; margin-top: 26px; opacity: 0.85; }
  ` });
  await page.evaluate(() => {
    const cap = document.createElement('div');
    cap.className = 'og-caption';
    cap.innerHTML = '<b>Snail Story</b>'
      + '<span>Sköt om en snigel i verklig tid. Den gör nästan ingenting, och den lever i tre år.</span>'
      + '<small>snails.se/snailstory</small>';
    document.querySelector('.box-wrap').append(cap);
  });
  await page.waitForTimeout(600);     // let the canvas settle at its new size
  await drySlime(page);

  await page.locator('.box-wrap').screenshot({ path: join(root, 'icons', 'og-1200x630.png') });
  await browser.close();
  console.log('wrote icons/og-1200x630.png');
} finally {
  server.kill();
}
