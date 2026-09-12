# js/game/

Copies from [Niklaser74/snailmageddon](https://github.com/Niklaser74/snailmageddon)
(`js/`): the renderers that draw the snails, the garden palette, the sound
effects and the deterministic RNG — without a build step or a runtime
dependency on the game's deployment.

- Source commit: `92325879c137b1ca1dd3630a9df1b0c46cb18ac9` (synced 2026-09-12)
- Files: snails.js, cosmetics.js, themes.js, audio.js, rng.js
- Import graph: snails.js → cosmetics.js; themes.js, audio.js and rng.js stand alone. Nothing here touches the network.

**Do not edit these files.** Change them in the game repo and run
`npm run sync:game` (env `GAME_DIR` points at the checkout, default
`../dev-snailmageddon`).
