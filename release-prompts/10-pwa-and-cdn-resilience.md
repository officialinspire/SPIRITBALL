# Add PWA manifest/icons and a Phaser-CDN-failure fallback

## Context
`index.html` advertises home-screen-app support and loads the Phaser engine from a CDN. See
`KNOWN_ISSUES.md` item 10.

## Problem
1. **No PWA manifest/icons.** `index.html`'s `<head>` sets:
   ```html
   <meta name="mobile-web-app-capable" content="yes">
   <meta name="apple-mobile-web-app-capable" content="yes">
   <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
   ```
   implying "Add to Home Screen" support, but there's no `<link rel="manifest" ...>`, no
   `apple-touch-icon`, and no favicon at all. A player who adds the game to their home screen
   gets a generic/blank icon instead of a proper app icon, and every page load makes a wasted
   `/favicon.ico` request.
2. **No fallback if the Phaser CDN fails.** `index.html` loads:
   ```html
   <script src="https://cdn.jsdelivr.net/npm/phaser@3.60.0/dist/phaser.min.js"></script>
   ```
   with no fallback CDN, no self-hosted copy, and no user-facing message if that script fails to
   load (blocked by a network policy, offline, CDN outage, ad-blocker false positive). The result
   is a blank black canvas with zero indication of what went wrong — indistinguishable from the
   game being "stuck loading" to a player.

## What to do
1. Create a small `manifest.json` (name, short_name, `start_url`, `display: "standalone"`,
   `background_color`/`theme_color` matching the existing `#000000` theme, and at least one
   properly-sized icon — 192×192 and 512×512 PNGs derived from the game's existing art, e.g. the
   eyeball or a chakra symbol rendered to a static image). Link it from `index.html`:
   `<link rel="manifest" href="manifest.json">`.
2. Add `<link rel="apple-touch-icon" href="...">` and a real `<link rel="icon" href="...">`
   favicon so both the browser tab and iOS home-screen installs get a proper icon.
3. Add a CDN-failure fallback in `index.html`: after the Phaser `<script>` tag, check whether
   `window.Phaser` is defined; if not, either dynamically inject a fallback `<script>` pointing at
   a different CDN (e.g. unpkg) or a locally vendored copy of `phaser.min.js`, and/or show a
   simple visible message in `#game-container` like "Failed to load the game engine — check your
   connection and reload" so players aren't staring at a silent blank canvas.

## Constraints
- Keep this additive/isolated to `index.html` plus new small icon/manifest asset files — no
  changes to `index.js` gameplay logic needed for this prompt.
- Keep new icon assets small (a few KB each) — don't reintroduce the asset-bloat problem this
  release is trying to fix (see `release-prompts/09-asset-optimization.md`).

## Acceptance criteria
- `manifest.json` validates (correct JSON, required fields present) and is linked from
  `index.html`; a real favicon and apple-touch-icon are present and load without 404s.
- Simulate a CDN failure (e.g. temporarily rename/block the Phaser `<script src>` in a local test)
  and confirm the page shows a clear message instead of a silent blank canvas.
