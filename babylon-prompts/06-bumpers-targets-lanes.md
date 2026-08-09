# Stage 6 — Bumpers, targets, obstacles, and lanes as 3D bodies

## Context
This is where the majority of the *existing, already-correct* game logic gets reconnected rather
than redesigned. The mission/rank/scoring system in `../index.js` (`CONFIG.missions`,
`hitAttackBumper()`, `hitSatellite()`, `hitMissionTarget()`, `hitFuelLight()`, `hitReentryLane()`,
`hitLaunchRamp()`, `hitBonusLane()`, `hitObstacle()`, `hitSlingshot()`, `hitInlane()`,
`hitOutlane()`, `checkDrain()`, and the mission-progress plumbing) is correct and tuned - the
`archive/release-prompts/` fixes already hardened it (broken flag-rotation missions fixed, mission
auto-select bug fixed, etc.). None of that needs to change. What changes is *how the ball's
presence at each of these elements gets detected* - from Phaser Arcade Physics overlap/collider
callbacks to Havok collision observables.

## Goal
Every table element from the current game present in 3D, correctly categorized as either a
**physical** body (bumpers, slingshots - things that push the ball) or a **trigger/sensor**
volume (mission targets, fuel lights, lanes, launch ramp, bonus lane, drain zone - things that
just detect the ball's presence without physically blocking it), each wired to call the existing
scoring/mission-progress functions.

## What to do
1. For each element currently built in `setupObstacles()`, `setupChakras()`, `setupSaturn()`,
   `setupSlingshots()`, `setupInlanesOutlanes()`, `setupReentryLanes()`, and `setupDrainZone()` in
   `../index.js`, create a 3D equivalent at the converted position (using the pixel→meter
   conversion from `02-*.md`):
   - **Physical bodies** (impart force on contact): attack bumpers, the satellite/Saturn bumper,
     slingshots, general obstacles (crystals/asteroids/vortexes/comets). Give each a static or
     kinematic rigid body shape; on collision, apply an outward impulse to the ball (porting the
     angle-based "bounce away from center" math already used in `hitAttackBumper()`/
     `hitSatellite()`/`hitObstacle()`/`hitSlingshot()`, just computed in 3D instead of 2D).
   - **Trigger volumes** (detect-only, don't physically block): mission targets, fuel lights,
     re-entry lanes, the launch ramp zone, the bonus lane, inlanes/outlanes, the drain zone. Use
     non-colliding sensor shapes (check current Havok API for the correct way to mark a shape as
     a trigger/sensor rather than a solid collider) with collision-observable callbacks.
2. Port each `hit*()` function's *game-state logic* essentially unchanged (score, mission
   progress, statistics, visual-feedback triggers) - only the calling convention changes (from a
   Phaser `physics.add.overlap`/`collider` callback signature to a Havok collision-observable
   callback). Keep the existing per-object cooldown pattern (`isOnCooldown()`/`setCooldown()`)
   working the same way, just driven by the new collision events.
3. Re-verify `checkDrain()`'s logic makes sense in 3D: in the 2D version the drain zone was really
   just "the ball touching the bottom of the world bounds," which worked because Arcade Physics
   clamped the ball inside the world. In 3D there's no equivalent implicit floor clamp unless one
   is built - decide explicitly whether the drain is a real trigger volume positioned past the
   flippers (the standard pinball approach, and cleaner than the old implicit-floor trick) and
   build it as such.
4. Keep visual meshes for all of these simple/placeholder for now (Stage 7 handles real
   materials) - the acceptance bar for this stage is correct collision behavior and correct game
   logic wiring, not final looks.

## Constraints
- Do not modify the scoring values, mission definitions, or mission-progress logic itself
  (`CONFIG.scores`, `CONFIG.missions`, the body of each `hit*()`/`check*()` function) - port the
  calling mechanism, not the design.
- Keep the mission-target-selects-mission / launch-ramp-starts-mission flow
  (`../archive/release-prompts/05-mission-selection-default.md`) intact and correctly triggered.

## Acceptance criteria
- Every element from the 2D table has a working 3D counterpart in roughly the same relative
  position/layout.
- Hitting a bumper/obstacle physically deflects the ball; passing through a trigger zone (mission
  target, lane, drain) registers the hit without altering the ball's physical trajectory.
- Scoring, mission progress, fuel depletion, and rank-up all still function correctly when
  triggered from the new 3D collision events - verify at least one full mission-select →
  launch-ramp → mission-complete → rank-up cycle works end to end.
- The drain reliably ends a ball's turn (loses a life, resets for the next ball) exactly once per
  drain, with no double-counting or missed detections from rapid ball movement through the zone
  (revisit CCD/trigger-detection reliability from `03-*.md` if a fast ball can skip past the
  drain trigger in one physics step).

---

## Forward reference (2026-08-09)

**Placement geometry for the bumper cluster, mission target bank, satellite, slingshots, and
re-entry lanes was pulled forward into `04-*.md` at the user's request**, so it could be designed
together with the flipper layout as one authentic Space-Cadet-inspired table rather than built in
isolation. See `04-motorized-flippers.md`'s implementation note and `babylon-game.js`'s
`buildObstacles()` for the actual positions/shapes/materials now in place - they're real static
colliders (bounce/restitution feels physically right already) but **not yet wired to any
scoring/mission logic** (no `hit*()` calls, no cooldowns, no trigger/sensor distinction between
physical and detect-only elements). That wiring, along with the drain zone, launch ramp, bonus
lane, inlanes/outlanes (none of which exist in the 3D scene yet), and everything else in this
stage's "What to do" list, is still this stage's job - only the geometry for a subset of elements
was pulled forward, not the logic.

---

## Implementation note (2026-08-09)

**Scope decision, made explicitly rather than silently**: the full mission FSM in `../index.js`
(mission select/start/complete/abort, fuel depletion, rank-up, the mission-target-selects-mission
flow) is deeply tied to Phaser UI - popups, HUD text, mission-select visual feedback - that
doesn't exist in this build yet (`12-*.md`'s job). Porting that logic now, with no UI able to
display any of it, would be dead code nobody could verify or play against. What **is** ported for
real this pass: point values, the physical-vs-trigger collision architecture, per-object hit
cooldowns, and the drain zone, all driving a minimal score/lives readout on the existing dev
status panel. Full mission logic is deferred until Stage 12's real UI exists to show it - at that
point this stage's collision/trigger plumbing should need little to no rework, just real `hit*()`
bodies instead of the simplified scoring calls currently in `handlePhysicalHit()`/
`handleTriggerHit()`.

**Collision architecture, confirmed against Babylon's actual source** (`havokPlugin.ts`,
`IPhysicsEnginePlugin.ts`), not guessed: `PhysicsAggregate` exposes both `.body` and `.shape`.
Setting `.shape.isTrigger = true` makes a shape detect-only, reported through the physics
plugin's global `onTriggerCollisionObservable`. Regular physical contact is reported per-body via
`body.getCollisionObservable()` (after `body.setCollisionCallbackEnabled(true)` once). Cross-
checked the physical-vs-trigger split itself against `setupCollisions()` in `../index.js`
directly (`physics.add.collider` vs `physics.add.overlap`) rather than assuming: bumpers,
satellite, and slingshots are real colliders there too (matches what Stage 4 already built as
physical, non-trigger bodies); mission targets and re-entry lanes are overlaps (now marked
`isTrigger = true` to match). One deliberate behavior change from the 2D version: `hitAttackBumper()`/
`hitSatellite()`/`hitSlingshot()` manually computed and set the ball's bounce velocity by hand -
a workaround for Arcade Physics circle-vs-circle overlaps not imparting real force. Havok's actual
rigid-body contact response (via each object's `restitution`, already tuned in Stage 4) makes that
unnecessary here, not just redundant, so it wasn't ported - same reasoning already documented for
flippers in `04-*.md`.

**Event `.type` comparisons use plain strings** (`'COLLISION_STARTED'`, `'TRIGGER_ENTERED'`), not
`BABYLON.PhysicsEventType.X`. Babylon's source declares that enum as TypeScript `const enum`,
which can legally be inlined away entirely and omitted from a compiled bundle rather than kept as
a real runtime object - and this sandbox has no way to load the actual CDN build to check whether
it survived. The string values are part of the same source file and not at risk of changing
independently of the enum, so comparing directly against them sidesteps the question rather than
guessing.

**Drain zone**: ported from `setupDrainZone()`'s position (2D px, converted the same way as every
other element). Node-verified it sits past `FLIPPER_Z_M` with a real gap (~0.07m) for the ball to
travel through first, and past the existing side walls' Z-extent (they stop at the table's nominal
boundary, matching the 2D game's walls not reaching the drain either) - so the ball genuinely has
to clear the flipper zone into open space to reach it, not get caught by a wall first. The debug
floor from Stage 2 remains a backstop if a fast ball somehow skips the trigger.

**Verified in this sandbox**: `node --check`; a Node script confirming the drain zone's geometry
(position relative to the flippers, table walls, and ball-rest position); re-ran the CDN-blocked
failure-path check in headless Chromium.

**Not verified** (needs the real device): whether trigger detection actually fires reliably for a
fast-moving ball (this stage's own acceptance criteria calls out exactly this risk - CCD helps
solid-collision tunneling but this hasn't been confirmed to also cover trigger volumes), whether
the cooldown durations feel right without the 2D version's tween/camera-shake feedback to lean on,
and whether the minimal score/lives readout is legible/useful during actual play on a phone.
