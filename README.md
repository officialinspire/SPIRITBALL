# SPIRITBALL — DMT Vision Quest Pinball

A psychedelic 3D pinball game built on [Babylon.js](https://www.babylonjs.com/) and its
[Havok](https://www.havok.com/) physics engine — real rigid-body flippers, plunger, ball, and
table, tilted-gravity playfield, glow/bloom visuals, particle VFX, and a mission-driven scoring
system, playable on desktop and mobile browsers.

SPIRITBALL started as a 2D [Phaser](https://phaser.io/) game and was rewritten from the ground up
into a true 3D physics simulation. The Phaser version has been fully removed — this is now a
Babylon.js/Havok-only project. See `BABYLON_3D_OVERHAUL.md` for the rewrite's architecture and
`archive/` for the retired 2D game's history, if you're curious.

## Playing it

Open `index.html` — no build step, no server-side code, just static files. For local development,
serve the directory over HTTP (opening `index.html` directly via `file://` won't work — the WASM
physics engine needs a real origin):

```bash
python3 -m http.server 8000
# then open http://localhost:8000/index.html
```

Controls: LEFT/RIGHT arrow keys or SPACE (desktop); tap/hold the left/right edge zones for
flippers, hold the round LAUNCH button to charge and fire the plunger (mobile/touch).

Append `?dev=1` to the URL to show the developer panel (physics/engine status, manual test
buttons, live flipper-angle readout) — hidden by default so real players just see the game.

## Requirements

A browser with WebAssembly SIMD support: iOS 16.4+, or a recent Chrome/Firefox/Edge/Android
browser. Havok (the physics engine) requires it; there's no fallback for unsupported devices
beyond an honest "not supported" message.

## Project structure

- `index.html` / `babylon-game.js` — the game. Everything runs client-side, no framework.
- `vendor/babylonjs/` — self-hosted Babylon.js + Havok build artifacts (not loaded from a CDN —
  see `VENDORING.md` for why and how to update them).
- `manifest.json` / `icons/` — PWA manifest and app icons.
- `BABYLON_3D_OVERHAUL.md` — the 3D rewrite's architecture, decisions, and stage-by-stage status.
- `babylon-prompts/` — the 13-stage implementation plan the 3D rewrite was built from, each with
  an implementation note documenting what was actually built and any real bugs found along the way.
- `improvement-prompts/` — scoped, modular prompts for ongoing post-rewrite work (bug fixes and
  new features), each meant to be picked up and implemented independently. Start here if you're
  looking for what to work on next.
- `archive/` — the retired 2D Phaser game's documentation, kept for historical reference only. No
  code from it remains in the repository.

## Current status

The 3D rewrite (`babylon-prompts/` Stages 1–12, plus part of 13) is implemented and playable:
table, physics-driven ball and flippers, plunger, scoring against bumpers/targets/lanes/slingshots,
materials/lighting/glow, particle VFX, a 3D-mounted backglass display, camera juice, an idle
attract-mode camera, mobile touch controls, and menu/pause/controls/game-over screens.

Known gaps and rough edges — see `improvement-prompts/` for the scoped, actionable version of
each of these:

- Sound effects (launch, flipper, obstacle hits, drain, game-over) are procedurally synthesized via
  the Web Audio API, with a mute control on the Controls screen (`improvement-prompts/04-*.md`).
  There's still no background music.
- Mission/rank progression exists: hitting a mission target selects and starts one of 3 missions
  (bumper/satellite/re-entry-lane focused), completing it awards a score bonus and advances a
  Space-Cadet-style rank (Cadet through Fleet Admiral), shown on the backglass and as "Final Rank"
  on the Game Over screen (`improvement-prompts/05-*.md`).
- Materials/lighting/glow, particles, the backglass, camera juice, scoring, drain/lives/Game-Over,
  pause/resume, reduced-motion, and high-score persistence have all been verified against the real
  running game (not just assumed from source) — see `improvement-prompts/03-*.md`. Mobile
  multi-touch interaction specifically still hasn't been verified on a real device (no touch
  hardware in this sandbox) — everything else in that checklist has.
- Obstacle geometry (bumpers, targets, lanes, slingshots) is simple primitive shapes, not
  pinball-shaped models.

## Contributing / continuing development

Each file in `improvement-prompts/` is a self-contained, scoped task — hand one to a fresh coding
session (human or AI) without needing the rest of this history. See
`improvement-prompts/README.md` for the current list and suggested order.
