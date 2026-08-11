# SPIRITBALL modularization plan

Status as of this document: **one extraction done** (`js/config.js`), the rest is a documented
plan, not yet executed. This file exists per an explicit instruction from the task that produced
`js/config.js`: *"If splitting everything at once creates unnecessary risk, perform only the
safest first extraction and document the remaining module boundaries."* That's exactly what
happened here, and why - read on for the reasoning, not just the checklist.

## Constraints this plan works within

- **No bundler, no build step.** Everything here is native browser ES modules
  (`<script type="module">` + `import`/`export`), loaded exactly as static files - this has to
  keep working unmodified on GitHub Pages (or any plain static host).
- **Behavior must not change.** Every extraction is a pure code-motion refactor: same values,
  same control flow, same output. Nothing in this plan is a feature change, and no step should be
  combined with one.
- **Vendored Babylon/Havok stay global.** `vendor/babylonjs/havok/HavokPhysics_umd.js` and
  `vendor/babylonjs/babylon.js` stay classic (non-module) `<script>` tags, loaded before the game
  code, exposing `window.BABYLON`/`window.HavokPhysics`. Module scripts can read globals exactly
  like classic scripts can - nothing about "module" changes that - so this requires no change to
  how Babylon/Havok are loaded, and no module in this plan should ever `import` them.
- **Prefer dependency injection / shared state objects over new globals.** Every module below
  takes what it needs as function parameters (a `scene`, a `state` object, a `lampSystem`
  reference, ...) rather than reaching for `window.something`. See "The real obstacle" below for
  why this matters more than the file split itself.
- **Verify after each extraction.** The verification method that worked for `config.js` - and
  should be repeated for every future step - is at the bottom of this file.

## What's done: `js/config.js`

Extracted: every pure, side-effect-free configuration value in the file - physics tuning numbers,
table/obstacle geometry, scoring, timing, cooldowns, mission/combo/rank definitions, the color
palette's raw hex values - plus a handful of pure helper functions with zero external
dependencies (`toWorldX`/`toWorldZ`/`toWorldRotationY`, `hexToColor3`, `missionRequiredCount`).
171 exported names total. `babylon-game.js` imports all of them back as bare identifiers (not a
namespace object), so every existing reference to e.g. `PX_TO_M` or `SCORE_ORBIT` anywhere else in
the file kept working completely unchanged - only the declarations' location moved.

Why this one first: it's the only part of the file with **zero coupling to mutable game state**.
Nothing in `config.js` is ever reassigned, nothing in it touches the DOM, and nothing in it calls
a BABYLON constructor at module-evaluation time (only inside function bodies, called later, after
`main()`'s own `typeof BABYLON === 'undefined'` guard - see `hexToColor3()`'s comment in
`config.js` for why that distinction is load-bearing here). That makes it mechanically
extractable with a plain move + `export`/`import`, verifiable by a byte-for-byte diff against the
original text, with no risk of behavior drift.

One deliberate exclusion: the `let COLOR_BALL, COLOR_EYEBALL, ...` declarations stayed in
`babylon-game.js`, *not* moved alongside the `HEX_*` values that feed them. They're populated by
assignment (`COLOR_BALL = hexToColor3(HEX_BALL);`) inside `main()`, and ES module imports are
**read-only bindings** - a module cannot reassign a `let`/`const` it imported from elsewhere. Any
plan to relocate them has to either export a setter/init function from wherever they end up, or
restructure the ~15 bare variables into an object (`colors.ball` instead of `COLOR_BALL`) - the
second option touches every one of the many call sites that reference them by bare name throughout
the file. Both are real design decisions, not one-line moves, so they're deliberately deferred to
whichever future step actually owns that state (most likely "VFX" or "physics/table", once that
module's own shape is decided) rather than smuggled into this first, supposedly-safe pass.

## The real obstacle to splitting the rest

`babylon-game.js` is currently one `(function () { ... })()` IIFE. Everything *before*
`async function main()` (now ~2700 lines) is builder functions and self-contained subsystems -
`buildTable()`, `buildCamera()`, `createBall()`, `createFlipper()`, `buildObstacles()`, the audio
system, `createLampSystem()` - each one takes what it needs as parameters and returns what it
built, with no shared mutable state beyond its own closure. Those are almost as mechanically
extractable as `config.js` was.

`main()` itself is the problem: **~2600 lines, ~90 nested functions, sharing dozens of mutable
`let`/`const` locals by closure** - `score`, `lives`, `mission`, `ballBonus`, `comboProgress`,
`comboStreak`, `ballSave`, `kickback`, `powerUp`, `dropTargetBank`, `laneBank`, `skillShot`,
`visionGate`, `orbitState`, `stats`, `isPaused`, `ballInPlay`, the plunger-charge fields, camera
shake/punch state, and more. `handleTriggerHit()` alone touches nearly all of them. Splitting
`main()` along the suggested module boundaries *before* addressing this would mean either:

- **duplicating** the shared state per module (wrong - they'd desync), or
- **inventing new globals** to hold it (explicitly against this task's own rules), or
- threading a **shared state object** through every extracted function as a parameter - the
  correct answer, and exactly what "prefer dependency injection/shared state objects" already
  points at, but a large, careful rewrite of every one of those ~90 functions' signatures and call
  sites, not a code-motion move.

That rewrite is real work with real regression risk, and mixing it with the file-split itself
would violate "verify after each extraction" - there'd be no way to tell whether a bug came from
the move or from the state restructuring. Hence: not attempted in the same pass as `config.js`.

## Remaining module boundaries

Mapped against the current file (all line numbers approximate - they'll drift as extractions
happen; re-locate by function name, not line number, when you actually do this).

| Module | What moves | Extractable now? |
|---|---|---|
| **physics/table** | `buildTable()`, `buildDrainZone()`, `buildLaunchLane()`, `createPlunger()`/`updatePlungerVisual()`, `buildCamera()`/`buildAttractCamera()`, `updateSaturnRotation()`, gravity/tilt setup | Yes - pure builders, take `scene` as a parameter, no shared state |
| **ball** | `createBall()`, `clampBodySpeed()`, `updateBallPhysics()` | Yes - same shape |
| **flippers/plunger** | `createFlipper()`, `setFlipperAngle()`, `activateFlipper()`, `deactivateFlipper()`, `updateFlipperMotor()`, `flipperAngleDegrees()` | Yes |
| **obstacles** | `buildObstacles()` (~930 lines - bumpers, targets, slingshots, lanes, orbits, Vision Gate, cabinet dressing), `createLabelPlane()`, `createLampSystem()` and the `LAMP_MODE`/`LAMP_*_SCALE` constants | Yes for construction; the lamp system's `registerLamp`/`setLampMode`/`flashLamp`/`updateLamps` calls from inside `main()`'s gameplay handlers would need `main()`'s eventual state object passed in, same as everything below |
| **VFX** | `buildLighting()`, `createStarfieldTexture()`, `buildSkybox()`, `createParticleTexture()`, `buildBallTrail()`/`updateBallTrail()`, `buildDrainVortex()`, `buildChakraSparkle()`, `spawnHitBurst()`, `buildBackglass()` (the 3D-mounted display's own small `redraw()`/`showMessage()` closure) | Yes for construction; `spawnHitBurst()`/`buildChakraSparkle()`/`buildDrainVortex()` already gate on the module-scope `devParticlesEnabled` flag (dev HUD toggle) - that flag needs to move with them or be passed in |
| **audio** | Every `play*Sound()` function, `getAudioContext()`/`setAudioMuted()`/`isAudioMuted()`, `initRollingSound()`/`updateRollingSound()`, `vibrateDevice()` and the `HAPTIC_*` pattern constants | Yes - `audioCtx`/`masterGainNode`/`audioMuted`/`rollingSoundNodes` are module-scope `let`s today, but already fully encapsulated (only these functions touch them) - move as a unit, no external coupling to unwind |
| **UI/input** | The `#status-panel`/mobile-controls DOM lookups, `detectMobile()`/`updateMobileControlsVisibility()`, `requestFullscreenAndLock()` + its `fullscreenchange` listeners, `setupResizeHandlers()`, `setDevPanelVisible()`, the dev-HUD wiring (`updateDevHud`, the four toggle checkboxes), the touch/mouse/keyboard input wiring (`pressLeft`/`releaseLeft`/.../`trackTouchStart`/`trackTouchEnd`/`forceReleaseAllControls`), pause/menu/controls/game-over screen functions | Partially - the DOM lookups and pure browser-API wrappers (`detectMobile`, `requestFullscreenAndLock`, `setupResizeHandlers`) are extractable now; everything that calls into gameplay functions (`activateFlipper`, `handleLaunchPress`, `openPauseMenu`, `startNewGame`, ...) needs those passed in once `main()`'s state split happens |
| **scoring/progression** | `setScore()`/`setLives()`/`addScore()`, `startBonusCount()`/`updateBonusCount()`, combo functions (`advanceCombo`/`recordComboShot`/`fireCombo`/`resetCombos`), skill-shot functions, ball-save functions, kickback functions, `stats` | No - this is the dense core of `main()`'s shared-state problem; needs the state-object rewrite first |
| **missions** | `startMission()`/`progressMission()`/`completeMission()`, `mission`/`RANK_NAMES`-driven rank-up | No - same reason, and reads/writes score + backglass + drop-target-bank state that would live in other modules |
| **persistence** | High score `localStorage` read/write (currently inline near backglass/score wiring), `spiritball-muted` read/write (currently inline in the audio section) | Small enough to extract on its own once identified precisely - genuinely low risk, just currently scattered across two spots rather than centralized |
| **main/bootstrap** | `async function main()` itself, once everything above has been peeled out of it: Havok/Babylon init, the `typeof BABYLON === 'undefined'` guard, wiring every extracted module together, `engine.runRenderLoop()` | This is what's left over, by definition - the true "compose everything" entry point |

## Recommended path forward

1. **Extract the remaining pure module-scope builders next** (physics/table, ball,
   flippers/plunger, obstacles, VFX, audio) - same mechanical, verifiable process as `config.js`:
   each function already takes `scene`/its own parameters and returns what it built, so this is
   another low-risk code-motion pass, one module at a time, verified after each with the same
   Playwright regression checks used for `config.js` (see below). Do this **before** touching
   `main()` - it shrinks the file substantially and proves the module-loading mechanics (relative
   imports, `<script type="module">`, GitHub Pages static serving) work for more than one file
   without adding any state-coupling risk.
2. **Only then** design the shared state object `main()`'s gameplay functions will take as a
   parameter (score/lives/mission/combo/ball-save/kickback/power-up/drop-target-bank/lane-bank/
   skill-shot/Vision-Gate/stats/pause/ball-in-play - everything currently a bare `let`/`const`
   inside `main()`). This is a design task in its own right, worth its own review before code
   moves, specifically because every one of ~90 functions' signatures changes.
3. **Peel scoring/progression and missions out together** (they're tightly coupled - missions
   call `progressMission()`/`completeMission()` which call scoring), passing the new state object
   in, followed by UI/input's gameplay-facing pieces, then persistence.
4. **`main()` last** - once everything else has a real module boundary, what remains in `main()`
   is exactly the bootstrap/composition root the "main/bootstrap" boundary describes.

Do not batch steps 1 and 2+ together, and do not batch multiple boundaries from step 3 with the
state-object introduction in step 2 - each is independently risky enough to deserve its own
extraction-then-verify cycle, per this task's own rules.

## Verification method (repeat for every future extraction)

What actually caught real issues while producing `config.js` (an accidental double blank line, a
comment left referring to a declaration that had moved) and confirmed zero behavior drift:

1. `node --check` (or `node --input-type=module --check`) on every changed file - syntax only, but
   free and instant.
2. A **byte-for-byte diff** of the moved code against its pre-move source (e.g. via
   `git show HEAD:babylon-game.js` for the version before the change), to mechanically prove
   nothing was retyped/corrupted in transit - especially important for large moves, where manual
   transcription is exactly how subtle bugs get introduced.
3. Static checks for **reassignment of imported bindings** and **duplicate declarations** left
   behind by an incomplete move (both are the kind of mistake `node --check` won't catch, but a
   `grep`/regex pass across the moved identifier list will).
4. **Playwright regression tests** run against the real page, before AND after, comparing:
   - page-load error count (`pageerror` listener) in both a normal load and `?dev=1`
   - total scene mesh count, physics-body count, and triangle count (any of these drifting means
     something built differently than before)
   - camera position (confirms `buildCamera()`'s output is untouched)
   - a real keyboard-driven launch-and-flip playthrough
   - a real `page.locator().tap()` touch playthrough
   - whatever `?dev=1` HUD readouts exist, cross-checked against known-good values
5. Browser console check (not just uncaught exceptions) for module-loading-specific failures -
   wrong relative import path, MIME-type/CORS issues, a missing export - which surface as console
   errors/failed network requests rather than thrown JS exceptions.

If any of these disagree between before/after, stop and fix before moving to the next boundary -
don't accumulate multiple unverified extractions.
