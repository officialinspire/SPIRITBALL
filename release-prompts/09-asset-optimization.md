# Optimize/trim asset payload for mobile load times

## Context
SPIRITBALL loads a background image and two decorative sprites via `BootScene.preload()` in
`index.js`. See `KNOWN_ISSUES.md` item 9.

## Problem
- `background.png` (loaded via `this.load.image('background', 'background.png')`) is **3.1 MB**
  — loaded on every session before the menu even appears. On a mobile data connection this is a
  real, noticeable first-load delay for a game that otherwise generates all its other art
  procedurally at runtime (see the large amount of `graphics.fill*`/`generateTexture` code in
  `preload()`).
- The repo root also contains files that **`index.js` never loads at all**:
  `psychedelic-pinball-playfield.jpg` (1.3 MB), `chakras_example.png` (125 KB), and an unrelated
  `Taito_Brazil_1980_Fire_Action_Parts_Layout_Diagram.gif` (70 KB). Confirm with
  `grep -n "load\.\(image\|audio\|spritesheet\|json\)" index.js` that only `background.png`,
  `saturn_example.webp`, and `grimreaper_example.webp` are actually referenced. If the deploy
  process copies the whole repo directory to static hosting, these unused files ship anyway.

## What to do
1. Re-encode `background.png` to something dramatically smaller while keeping acceptable visual
   quality for a background that's displayed at 0.6 alpha behind gameplay elements
   (`setupBackground()` sets `bg.setAlpha(0.6)`) — e.g. convert to WebP/optimized JPEG and/or
   downscale to the actual displayed resolution (the game canvas is 540×960 logical pixels,
   scaled up via Phaser's `Scale.FIT` to a max of 1080×1920 — there's no need for the source
   asset to be dramatically larger than that). Target well under 500 KB.
2. Confirm which of `psychedelic-pinball-playfield.jpg`, `chakras_example.png`, and the Taito gif
   are genuinely unused (re-run the grep above after any other fixes land, in case a later prompt
   adds a reference to one of them) and either delete them from the repo or move them to a
   `design-reference/` subfolder that's clearly excluded from deployment, so they don't ship to
   players.
3. If there's a build/deploy config anywhere in the repo (check for one — there wasn't one found
   during this review, deployment is currently "serve the static files directly"), make sure it
   only ships `index.html`, `index.js`, `styles.css`, and the assets actually referenced by them.

## Constraints
- Don't change any gameplay code — this is an asset-only pass.
- Keep visual parity: re-encoded background should look equivalent at the 0.6-alpha display
  size, not visibly degraded.

## Acceptance criteria
- `background.png` (or its replacement) is significantly smaller in file size with no visible
  quality regression during actual gameplay (at 0.6 alpha, in-canvas).
- `git status`/repo listing after the change contains no multi-hundred-KB+ files that aren't
  referenced by `index.js`'s `preload()`.
- Total page weight (HTML+CSS+JS+images, excluding the Phaser CDN script) drops meaningfully from
  its current ~4.6 MB.
