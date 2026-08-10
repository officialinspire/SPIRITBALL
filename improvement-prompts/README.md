# Improvement prompts — ongoing post-rewrite work

The Babylon.js/Havok 3D rewrite (`../babylon-prompts/`, Stages 1-13) got SPIRITBALL to a playable
state and removed the old Phaser 2D game entirely. These prompts are the next layer: real bugs
and missing features found during that rewrite (particularly during Stage 13's first-ever real
interactive browser testing), scoped as independent, modular tasks.

**Unlike `../babylon-prompts/`, these are independent, not sequential** — each is self-contained
and can be handed to a fresh session on its own, in any order, without needing the others done
first (aside from the explicit dependency noted in `05-*.md`). This is the point: implement one
at a time, as a single focused unit of work, rather than one huge session trying to do everything.

Each file: context (what's wrong/missing and why), what to do, and acceptance criteria - same
format as `../babylon-prompts/`. Add an "Implementation note" section (like every file in that
directory has) when you finish one, documenting what was actually done, what was verified and
how, and anything discovered along the way. Don't delete or renumber a finished prompt — its
implementation note is the historical record, same convention as `../babylon-prompts/`.

## Suggested order

Roughly bug-fixes-first, then features, then polish - but pick based on what you actually want to
work on next, not this order:

| # | File | Fixes / delivers |
|---|------|-------------------|
| 1 | `01-real-continuous-collision-detection.md` | ✅ Done — dead CCD API call removed, replaced with a real Havok world-level speed limit; stress-tested. |
| 2 | `02-ball-plunger-resting-stability.md` | ✅ Done — plunger now has real kinematic collision (it had none at all); ball rests stably instead of rolling off the table. |
| 3 | `03-real-device-parity-and-visual-qa-pass.md` | ✅ Done — full checklist verified; found and fixed a major bug (`resetBallToPlunger()`'s position reset silently never worked, since Stage 5 - every drain/reset relied on it). |
| 4 | `04-basic-audio.md` | The game currently has no sound or music at all. |
| 5 | `05-mission-fsm-and-rank-system.md` | The mission/rank progression system, deferred since Stage 6, still doesn't exist. |
| 6 | `06-obstacle-geometry-polish.md` | Bumpers/targets/lanes/slingshots are still placeholder primitive shapes. |
| 7 | `07-hud-and-backglass-reconciliation.md` | The new player HUD and the 3D backglass both show score - redundant, needs a real design decision. |
| 8 | `08-pwa-icon-and-manifest-refresh.md` | The app icon still matches the old 2D "cosmic eyeball" sprite, not the new 3D visual identity. |
| 9 | `09-mobile-performance-profiling.md` | Device-tier performance gating exists but has never been validated against real low-end hardware. |
| 10 | `10-accessibility-pass.md` | Reduced-motion, color-contrast, and touch-target-sizing were built but never verified in practice. |

## What changed that makes these possible now

Every prompt in `../babylon-prompts/` before Stage 13 could only be verified via source-reading,
Node scripts, or a CDN-blocked headless-Chromium failure path — this sandbox could not actually
run Havok/WebGL. Stage 13 unlocked real interactive browser testing (self-hosted Babylon/Havok
under `../vendor/babylonjs/`, plus specific headless-Chromium launch flags for software-rendered
WebGL — see `../VENDORING.md` and `../babylon-prompts/13-*.md`'s implementation note for exact
details). Every prompt below that references "verify via Playwright" is relying on that
capability; use the same technique (self-hosted vendor files, `--use-gl=swiftshader
--enable-unsafe-swiftshader --ignore-gpu-blocklist --enable-webgl` launch flags, the pre-installed
Chromium at `/opt/pw-browsers/...`, `require()`d via its absolute path since there's no local
`node_modules`) rather than falling back to static analysis where real testing is possible.
