# SPIRITBALL — Babylon.js 3D Overhaul: Vision & Architecture

**Date:** 2026-08-08
**Status (2026-08-09):** Stage 1 (`babylon-prompts/01-*.md`) is implemented —
`babylon-spike.html`/`babylon-spike.js` exist as a standalone diagnostic page. Its CDN-failure
handling was verified working in this sandbox (the Babylon/Havok CDN is blocked here, same as
Phaser's was in earlier sessions); the actual physics/rendering behavior still needs a real
browser to verify before Stage 2 begins — see the implementation note in `01-*.md`. Stages 2–13
are planned, not started.

## The goal

Rebuild SPIRITBALL as a genuine 3D pinball game rendered and simulated in
[Babylon.js](https://www.babylonjs.com/), instead of the current Phaser 3 / Arcade Physics 2D
implementation. The reference point is the classic *3D Pinball for Windows – Space Cadet*
cabinet view (fixed, tilted perspective looking down a chrome-railed table, glowing targets, a
dot-matrix backglass score panel) — but built with real-time 3D geometry, PBR materials,
dynamic lighting, and true rigid-body physics rather than pre-rendered sprites, and skinned in
SPIRITBALL's own DMT/cosmic/chakra visual identity rather than a generic space-cadet theme.

## The decision that shapes everything else

Babylon.js is a full 3D engine, but the reference image itself is **not** evidence that real 3D
physics is required — the original Space Cadet game was a 2D physics simulation rendered with a
fixed isometric perspective, the same trick SPIRITBALL already uses today. There were two honest
paths:

1. **3D visuals only** — keep the current, already-tuned 2D Arcade Physics simulation
   (`release-prompts/01-*.md`, `13-*.md`) and use Babylon.js purely as a renderer on top.
   Lower risk, ships fast, every mission/scoring/flipper-feel decision already made stays intact.
2. **Full 3D physics rewrite** — replace the 2D physics with a true 3D rigid-body simulation
   (tilted table, real gravity vector, 3D collision meshes, motorized hinge-jointed flippers,
   an actual pinball-cabinet camera). More authentic, but effectively a ground-up rewrite of
   every physics-dependent mechanic in the game.

**The user chose option 2 — full 3D physics rewrite.** Everything below is scoped accordingly.
This is a genuinely large project; the 13 staged prompts in `babylon-prompts/` exist specifically
to make it survivable as a sequence of independently-reviewable, independently-testable steps
rather than one enormous rewrite commit.

## What gets preserved vs. rewritten

**Preserved (do not redesign, just re-wire to the new engine):**
- The mission/rank system: `CONFIG.missions`, `CONFIG.ranks`, `CONFIG.scores`,
  `CONFIG.multipliers`, and all the mission-progress/completion logic in `checkMissionComplete()`,
  `completeMission()`, `rankUp()`, `abortMission()`, `depleteFuel()`.
- Game state shape and persistence: `gameState.statistics`, `spiritball-highscore` in
  `localStorage`, the fuel/multiplier/lane/bumper tracking fields.
- The DOM-overlay approach for mobile touch controls (`release-prompts/14-*.md`) and menus/HUD
  text — these are independent of the rendering engine and don't need to become 3D meshes.
  (Confirmed as a deliberate choice below, not an oversight.)
- The reduced-motion / accessibility hooks (`release-prompts/12-*.md`) and PWA/manifest/CDN
  fallback pattern (`release-prompts/10-*.md`) — adapted, not discarded.

**Rewritten from scratch:**
- All physics: ball, flippers, plunger, bumpers, obstacles, lanes, drain — every collision body
  and every piece of collision-response tuning (flipper power curves, plunger charge math, bounce
  coefficients) has to be re-derived for a 3D rigid-body engine. 2D pixel-based tuning numbers do
  not transfer.
- All rendering: every texture generated procedurally in `BootScene.preload()` (chakras, Saturn,
  flippers, bumpers, particles) becomes a 3D mesh + material instead of a 2D sprite.
- The scene/state machine: Phaser's `Scene` classes (`BootScene`/`MenuScene`/`GameScene`/
  `GameOverScene`) are replaced by a Babylon-native equivalent (see Stage 1).
- Camera, lighting, particles, postprocessing — none of this exists today in any form that
  carries over; it's new work, not a port.

## Technical foundations (verified, not guessed)

Babylon.js's own documentation and GitHub-hosted docs were checked directly before writing these
prompts, specifically to avoid handing off prompts full of plausible-sounding but made-up API
names. Key confirmed facts:

- **Physics engine: Havok**, Babylon's current first-party physics plugin (WASM-based). CDN
  setup is two script tags:
  ```html
  <script src="https://cdn.babylonjs.com/havok/HavokPhysics_umd.js"></script>
  <script src="https://cdn.babylonjs.com/babylon.js"></script>
  ```
  and initialization is:
  ```javascript
  const havokInstance = await HavokPhysics();
  const hk = new BABYLON.HavokPlugin(true, havokInstance);
  scene.enablePhysics(new BABYLON.Vector3(0, -9.8, 0), hk);
  ```
  (Source: Babylon.js Documentation repo, `usingHavok.md`.)
- **iOS compatibility limit, confirmed**: Havok requires WebAssembly SIMD, **not supported on
  iOS below 16.4**. Given this project explicitly targets mobile play, this is a real ceiling on
  who can play the 3D-physics version, not a hypothetical edge case. Stage 11 addresses detecting
  this and failing gracefully (with a clear message) rather than silently breaking.
- **The Babylon CDN is explicitly documented as not-for-production**: "The purpose of our CDN is
  to serve Babylon packages to users learning how to use the platform or running small
  experiments." SPIRITBALL is currently 100% static files with no build step (Phaser is also
  CDN-loaded today). Early stages should still use the CDN to move fast and match the existing
  project convention, but Stage 13 explicitly calls out self-hosting the Babylon/Havok files (or
  introducing a minimal bundler) as a production-hardening decision to make before a real launch
  — not silently deferred forever.
- **Flipper hinges need `Physics6DoFConstraint`, not the simpler `HingeConstraint`.** Community
  reports (Babylon.js forum) confirm Havok's basic hinge constraint cannot be limited the way the
  older v1 `HingeJoint` could — a flipper needs a limited swing range *and* a motor, which
  requires configuring individual axes on a `Physics6DoFConstraint`. A confirmed, real code
  pattern for axis limits:
  ```javascript
  let constraint = new BABYLON.Physics6DoFConstraint({
      pivotA: new BABYLON.Vector3(0, -0.5, 0),
      pivotB: new BABYLON.Vector3(0, 0.5, 0),
      perpAxisA: new BABYLON.Vector3(1, 0, 0),
      perpAxisB: new BABYLON.Vector3(1, 0, 0),
  }, [
      { axis: BABYLON.PhysicsConstraintAxis.ANGULAR_Y, minLimit: 0, maxLimit: 1.58 }
  ], scene);
  ```
  The **motor** side of this (driving the flipper up fast on activation, letting it fall back) is
  real and documented to exist (a "Motor Constraints" example is referenced by Babylon's own
  docs), but the exact method names for setting motor type/target/force were **not** confirmed
  during this research pass — Stage 4's prompt explicitly calls out verifying the current
  motor API against Babylon's live docs/playground before implementing, rather than asserting
  specific method names here that couldn't be confirmed.
- **Units matter for physics stability.** Havok (like most rigid-body engines) assumes
  roughly real-world/meter scale. The current 2D game uses pixel-scale numbers directly
  (`CONFIG.width: 540`, ball radius `20`, flipper power `1500+`) — carrying those numbers over
  as literal 3D unit values would create a physics simulation with an effectively room-sized
  table and beach-ball-sized ball, which is a well-known source of instability (huge inertia
  values, joints that need absurd force to move, floating-point precision issues at that scale).
  **Stage 2 mandates modeling the table at real-world pinball dimensions in meters**
  (~0.51m × 1.07m playfield, ~6.5° tilt, 27mm-diameter ball) as the unit convention for every
  later stage, with an explicit conversion note for anyone tempted to reuse the old pixel numbers.

## Staged prompt index

Each `babylon-prompts/NN-*.md` file is self-contained (context, goal, concrete steps,
constraints, acceptance criteria) and can be handed to a fresh coding session — but unlike
`release-prompts/`, **these are sequential, not independent**: each stage builds physically on
the last, so apply them in order.

| # | File | What it delivers | Depends on |
|---|------|-------------------|------------|
| 1 | `01-foundation-and-physics-spike.md` | Babylon engine/canvas/render-loop scaffold, Havok init, a throwaway tilted-plane-and-bouncing-ball spike to prove the whole pipeline works before any real content is built on it. | — |
| 2 | `02-3d-table-and-camera.md` | Real-world-scale 3D table geometry (walls/slants/guides as static rigid bodies) ported from the current 2D layout, table tilt, fixed pinball-cabinet camera. | 1 |
| 3 | `03-ball-physics.md` | 3D ball rigid body, CCD/tunneling verification, anti-stuck logic ported to 3D. | 2 |
| 4 | `04-motorized-flippers.md` | Flippers as `Physics6DoFConstraint` limited+motorized hinges, keyboard/touch activation, first real feel-tuning pass. | 3 |
| 5 | `05-plunger.md` | 3D plunger/launch mechanic, charge-and-release power curve ported from `release-prompts/13-*.md`. | 3 |
| 6 | `06-bumpers-targets-lanes.md` | All remaining table elements (attack bumpers, satellite, mission targets, fuel lights, obstacles, slingshots, lanes, ramp, drain) as 3D physical/trigger bodies wired to the existing mission/scoring logic. | 2, 4 |
| 7 | `07-materials-lighting.md` | PBR materials, lighting rig, glow/bloom postprocessing, skybox — the core "make it look cooler" visual identity pass. | 2 |
| 8 | `08-particles-and-vfx.md` | Ball trail, drain vortex, hit bursts, chakra sparkle ported to Babylon particle systems. | 6, 7 |
| 9 | `09-backglass-display.md` | 3D-mounted dynamic-texture backglass panel (dot-matrix score/mission/message display), matching the reference image's right-hand panel. | 6 |
| 10 | `10-camera-and-juice.md` | Impact camera shake/kick, launch/mission-complete/rank-up camera beats, idle attract-mode orbit for the menu. | 4, 5, 6 |
| 11 | `11-mobile-and-performance.md` | Reconnect the existing DOM touch-control overlay to the new physics, graceful "Havok unsupported" fallback messaging (iOS < 16.4), device-tier performance scaling. | 4, 5, 6 |
| 12 | `12-menus-and-screens.md` | Menu/Game Over/pause/settings screens rebuilt against the new engine (DOM overlay, not 3D meshes — same reasoning as the existing mobile controls). | 9, 10 |
| 13 | `13-parity-qa-and-cleanup.md` | Full feature-parity checklist against the current game, remove Phaser entirely, decide on the CDN-vs-self-hosted/bundler question for production. | 1–12 |

## Honest risk disclosure

This plan is written the same way the earlier bug-fix and control-revamp work in this repo was:
carefully reasoned, but **not playtested or even loaded in a real browser** — this sandbox's
outbound network policy already blocked the Phaser CDN in earlier sessions, and Babylon.js +
Havok add a second CDN dependency (and a WASM binary) that's equally likely to be blocked here.
Every stage prompt below says so explicitly and defines what a human needs to verify by hand.
Beyond that:

- **This is a multi-week-scale rewrite**, not a quick reskin, because option 2 (full 3D physics)
  was chosen. Nothing about the current flipper/plunger feel transfers automatically — Stage 4
  and Stage 5 are genuinely new tuning work, not ports.
- **iOS < 16.4 cannot run Havok at all.** Decide (Stage 11) whether that's an acceptable
  platform floor or whether a 2D fallback path needs to be kept alive for older devices.
- **The Babylon CDN is not meant for production.** Decide (Stage 13) whether to self-host the
  engine files (in the spirit of the asset-optimization work in `release-prompts/09-*.md`) or
  adopt a build step before calling this shippable.
