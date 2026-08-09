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
