#!/usr/bin/env node
// Refreshes js/game/ from the Snäckmageddon repo: the renderers that draw the
// snails, the garden palette, the sound effects and the deterministic RNG.
//   GAME_DIR=../dev-snailmageddon node scripts/sync-game.mjs
//
// Only what Snail Story actually uses is vendored. game.js (the duel
// simulation), terrain.js (a destructible side-view collision mask) and
// dmath.js belong to Snäckmageddon's world, not to a terrarium — leaving them
// out keeps sw.js and the offline cache honest about what ships.
import { copyFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const game = resolve(root, process.env.GAME_DIR || '../dev-snailmageddon');
const FILES = ['snails.js', 'cosmetics.js', 'themes.js', 'audio.js', 'rng.js'];

if (!existsSync(join(game, 'js', 'snails.js'))) {
  console.error(`No game checkout at ${game} (set GAME_DIR).`);
  process.exit(1);
}
for (const f of FILES) copyFileSync(join(game, 'js', f), join(root, 'js', 'game', f));
const hash = execSync('git rev-parse HEAD', { cwd: game }).toString().trim();
const date = new Date().toISOString().slice(0, 10);
writeFileSync(join(root, 'js', 'game', 'README.md'), `# js/game/

Copies from [Niklaser74/snailmageddon](https://github.com/Niklaser74/snailmageddon)
(\`js/\`): the renderers that draw the snails, the garden palette, the sound
effects and the deterministic RNG — without a build step or a runtime
dependency on the game's deployment.

- Source commit: \`${hash}\` (synced ${date})
- Files: ${FILES.join(', ')}
- Import graph: snails.js → cosmetics.js; themes.js, audio.js and rng.js stand alone. Nothing here touches the network.

**Do not edit these files.** Change them in the game repo and run
\`npm run sync:game\` (env \`GAME_DIR\` points at the checkout, default
\`../dev-snailmageddon\`).
`);
console.log(`synced ${FILES.length} files from ${game} @ ${hash.slice(0, 7)}`);
