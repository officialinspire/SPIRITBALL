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

---

## Implementation note (2026-08-08)
Generated a simple icon set (`icons/icon-192.png`, `icons/icon-512.png`,
`icons/apple-touch-icon.png` at 180×180, `icons/favicon-32.png`) matching the game's actual
"cosmic eyeball" ball sprite (white sclera, cyan iris, dark pupil, magenta accent ring) so the
icon is genuinely on-brand rather than a placeholder — total ~14 KB for all four sizes combined.
Added `manifest.json` (name/short_name/start_url/standalone display/portrait orientation/icons)
and linked it plus `<link rel="icon">`/`<link rel="apple-touch-icon">` from `index.html`.

For CDN resilience: added an `onerror` handler on the primary Phaser `<script>` tag that injects
a fallback `<script src="https://unpkg.com/phaser@3.60.0/...">` (set `async = false` so the
browser's `window.load` event correctly waits for it rather than firing before it resolves), plus
a final `window.load` check that shows a plain-language error message in `#game-container` if
`Phaser` is still undefined after both attempts (blocked network, both CDNs down, etc.) instead
of a silent blank canvas. The handler functions are defined in a `<script>` block placed *before*
the Phaser CDN `<script>` tag (not after) — an earlier draft had it the other way around, which
would have relied on the network request always being slower than parsing a few more lines of
HTML to be safe; put the definitions first instead of relying on that timing assumption. Verified this sandbox's own network policy blocks `cdn.jsdelivr.net`
outright (confirmed via the proxy's `__agentproxy/status` endpoint reporting `connect_rejected`
for that host), so I could not do a full end-to-end live-browser verification of this fallback
here — the logic was reviewed carefully by hand instead. Recommend a manual check (e.g. blocking
the CDN domain via browser devtools' request-blocking) before shipping.
