# Improvement 8 — PWA icon/manifest refresh for the new 3D visual identity

## Context

`babylon-prompts/13-*.md` item 4 (never completed): the current app icons (`icons/icon-192.png`,
`icons/icon-512.png`, `icons/apple-touch-icon.png`, `icons/favicon-32.png`) were generated to
match the original 2D game's "cosmic eyeball" sprite. The game itself is now an entirely different
visual experience — a real 3D psychedelic pinball table with neon materials, glow/bloom, and a
starfield skybox, nothing like a flat sprite-based icon. `manifest.json` itself (name, colors,
`start_url`) is otherwise already correct and doesn't need changes — this is specifically about
whether the icon art still represents the game.

## What to do

1. Look at the current icon files and the current game's actual rendered look (take fresh
   Playwright screenshots of the table/flippers/backglass if none exist yet) and make a real
   judgment call: does the eyeball icon still work as a visual identity, or does it need to change?
2. If a refresh is warranted, design new icon art that reflects the 3D game's actual visual
   language (neon/glow palette, the table's psychedelic color scheme) at the same sizes
   (192x192, 512x512, 32x32, plus the Apple touch icon size already in use) - keep it simple
   enough to read clearly at 32x32 favicon size, which is the hardest constraint.
3. Replace the files under `icons/` and verify `manifest.json`'s references still match (they
   should, if filenames are kept the same).
4. If the existing eyeball icon is judged to still work fine (it's a legitimate outcome to decide
   "no change needed" here, not every prompt has to produce a diff) — document that reasoning
   explicitly rather than silently skipping the prompt.

## Acceptance criteria

- A deliberate decision is made and documented (icon refreshed, or explicitly kept with
  reasoning) — not left as an open question.
- If refreshed: new icons exist at all required sizes, `manifest.json` and `index.html`'s
  `<link rel="icon">`/`<link rel="apple-touch-icon">` tags still resolve correctly, and the PWA
  installs with the new icon (verify via a Playwright check that reads the actual served icon
  files, or a manual install test if a real device is available).

## Implementation note

**Decision: refreshed.** Took a fresh Playwright gameplay screenshot first (real launch, table in
view) to judge the actual current visual language: cyan chrome rails, magenta/cyan/gold neon
pop-bumper domes on dark bases, a gold-ringed satellite, deep violet playfield glow. The old
"cosmic eyeball" icon (dark purple/magenta rings around a cyan iris) no longer represents this at
all - worse, the ball itself doesn't even look like an eyeball anymore in the actual game. It was
simplified to a plain glowing white/cyan emissive sphere back in Stage 4 (`babylon-prompts/04-*.md`'s
implementation note: "the doc allows a plain glowing emissive sphere instead of a painted
DynamicTexture eyeball... took the simpler, lower-risk option"), so the eyeball icon had drifted
from both the table's identity AND the ball's own actual rendered look. An eye shape also has no
visual connection to a pinball table's silhouette in the first place.

**New design.** A glowing neon orb (white-hot core fading to cyan - matching the ball's actual
current `HEX_BALL`/`HEX_EYEBALL` albedo/emissive pair, not a redesign of it) inside a magenta ring
accent (echoing the pop-bumper collar / satellite ring motif from `improvement-prompts/06-*.md`),
with a thin gold "Saturn ring" pass-through (matching `HEX_SATURN_RING`), on the game's own dark
violet background (`HEX_BACKGROUND`, `#1a0033`). Every color is pulled directly from
`babylon-game.js`'s existing palette constants, not invented fresh - the icon now reads as a piece
of the actual game rather than a separate logo.

**Generation.** Procedural, via a one-off Python/PIL script (radial gradients + Gaussian-blurred
glow layers, no external images/fonts/CDN) - consistent with this project's established zero-new-
asset-dependency pattern (the starfield skybox and particle texture in `babylon-game.js` make the
same call, both via Babylon's own `DynamicTexture`; this is the same philosophy applied to the
handful of real static PNG files the PWA manifest/favicon require, which can't be
`DynamicTexture`-generated since they're loaded before/outside the game itself). Rendered once at
1024x1024 then downsampled with LANCZOS to every required size, so edges/glow stay smooth even at
the hardest constraint (32x32 favicon) - checked directly by upscaling the actual 32x32 output with
nearest-neighbor for inspection: the cyan orb and magenta ring both stay clearly legible; the gold
ring is subtler at that size but doesn't muddy the read.

**Files replaced** (same filenames/sizes/paths, so no `manifest.json` or `index.html` changes were
needed - both already just reference `icons/icon-192.png`, `icons/icon-512.png`,
`icons/favicon-32.png`, `icons/apple-touch-icon.png`): all four PNGs under `icons/`.

**Verification (Playwright, headless Chromium):** fetched all four icon files plus `manifest.json`
directly from the local dev server - every one resolves with `200` and the correct
`content-type` (`image/png`, `application/json`), `manifest.json`'s `icons` array still points at
the right (now-refreshed) files, and the game loads/plays with zero console errors. (One incidental
`404` for `/favicon.ico` appears in every run regardless of this change - confirmed via the
server's own request log this is Chromium's automatic implicit root-favicon probe, unrelated to
and not fixable via this project's explicit `<link rel="icon">` tag, which loads fine.) Full
existing regression suite (flippers, CCD, HUD, audio, plunger rest) re-run clean afterward, since
this change touches no game code at all.
