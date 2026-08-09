# Stage 3 — 3D ball physics and anti-stuck logic

## Context
Builds on the table/camera from `02-*.md`. Adds the actual ball as a real dynamic rigid body and
carries forward the anti-stuck design already proven out in the 2D version
(`../release-prompts/13-plunger-ball-mechanics-revamp.md`), adapted to 3D.

## Goal
A ball that rolls, bounces, and settles convincingly on the tilted 3D table, at real pinball
scale, with no tunneling at realistic pinball speeds, and a 3D equivalent of the existing
"stuck ball" recovery logic.

## What to do
1. Create the ball as a dynamic `PhysicsAggregate` sphere, ~27mm diameter (real pinball ball
   size, matching the Stage 1 spike and the scale convention from `02-*.md`), with mass, friction,
   and restitution values tuned by feel starting from real-pinball-ish defaults (mass ~0.08kg,
   restitution ~0.6-0.7, moderate friction) - these will need iteration once flippers exist in
   Stage 4 and there's something to actually play against.
2. **Verify continuous collision detection / anti-tunneling is actually active.** Pinball balls
   move fast relative to their size and wall thickness; a 3D physics engine is just as capable of
   letting a fast-moving small sphere pass through a thin wall in one physics step as the old 2D
   Arcade Physics was (which is why `CONFIG.ballMaxVelocity` existed there). Check Havok's current
   API for CCD on dynamic bodies at implementation time (don't assume a specific property name
   without checking current docs) and confirm empirically: launch the ball at a high velocity
   directly at a thin wall and confirm it always collides rather than occasionally passing
   through.
3. Set a maximum velocity clamp on the ball (converted proportionally from the old
   `CONFIG.ballMaxVelocity: 1800` px/s using the pixel→meter conversion from `02-*.md`) as a
   second line of defense against tunneling/instability, same spirit as the old Arcade Physics
   safety net.
4. Port the anti-stuck design from `checkBallStuck()` (`../index.js`, revamped in
   `../release-prompts/13-*.md`): accumulate how long the ball's linear velocity magnitude has
   stayed below a low threshold; after it's been stuck for a real moment (not one slow physics
   step), apply one decisive corrective impulse (a randomized small horizontal component plus a
   push along the table's downhill direction) and reset the timer. Do **not** reintroduce the old
   per-frame nudge (the bug that prompt fixed) - the whole point of the earlier fix was replacing
   constant fighting with occasional decisive intervention, and that reasoning applies just as
   much in 3D.
5. Manually test: ball dropped from various heights/speeds settles naturally, rolls downhill
   under the table's tilt without external force, and a deliberately-stalled ball (e.g. balanced
   on a flat spot) gets dislodged within about half a second rather than sitting forever or
   jittering continuously.

## Constraints
- No flippers, plunger, or scoring yet - this stage is purely "does a ball behave like a pinball
  on this table."
- Reuse the pixel→meter conversion and tilt convention established in `02-*.md` - don't invent a
  second scale system.

## Acceptance criteria
- A ball launched at realistic pinball speeds toward the table boundary always collides, never
  tunnels through, across repeated tests at various angles/speeds.
- A ball at rest or rolling slowly is not visibly jittering or vibrating in place.
- A ball deliberately stuck (e.g. wedged in a corner) is reliably freed within roughly half a
  second of settling, via one clean kick, not a stream of small nudges.
- The ball's resting/rolling behavior on the tilted table looks physically plausible without
  being told exactly how - it should just look like a small heavy ball rolling on a tilted
  surface, not floating, not skating on ice, not vibrating.
