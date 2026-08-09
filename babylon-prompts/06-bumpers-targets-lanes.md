# Stage 6 — Bumpers, targets, obstacles, and lanes as 3D bodies

## Context
This is where the majority of the *existing, already-correct* game logic gets reconnected rather
than redesigned. The mission/rank/scoring system in `../index.js` (`CONFIG.missions`,
`hitAttackBumper()`, `hitSatellite()`, `hitMissionTarget()`, `hitFuelLight()`, `hitReentryLane()`,
`hitLaunchRamp()`, `hitBonusLane()`, `hitObstacle()`, `hitSlingshot()`, `hitInlane()`,
`hitOutlane()`, `checkDrain()`, and the mission-progress plumbing) is correct and tuned - the
`release-prompts/` fixes already hardened it (broken flag-rotation missions fixed, mission
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
  (`../release-prompts/05-mission-selection-default.md`) intact and correctly triggered.

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
