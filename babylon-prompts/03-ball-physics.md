# Stage 3 — 3D ball physics and anti-stuck logic

## Context
Builds on the table/camera from `02-*.md`. Adds the actual ball as a real dynamic rigid body and
carries forward the anti-stuck design already proven out in the 2D version
(`../archive/release-prompts/13-plunger-ball-mechanics-revamp.md`), adapted to 3D.

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
   `../archive/release-prompts/13-*.md`): accumulate how long the ball's linear velocity magnitude has
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

---

## Implementation note (2026-08-09)
Extended `babylon-game.js` (no new files this stage). Added `createBall()` (a shared factory now
used by both the main game ball and the Stage 2 debug drop-tool, removing the duplication that
existed between them) and `updateBallPhysics()`, called every frame from the render loop via
`engine.getDeltaTime()`.

**Values used**, all converted from the 2D game's tuned constants via the same `PX_TO_M` scale
established in Stage 2 (not re-derived from scratch): `MAX_BALL_SPEED_MS` ≈ 1.7 m/s (from
`CONFIG.ballMaxVelocity: 1800`), stuck-speed threshold ≈ 0.038 m/s and kick components ≈ 0.19/0.36
m/s (from `checkBallStuck()`'s 40/400/380 px/s in `archive/release-prompts/13-*.md`). Stuck-time
threshold (450ms) is a duration and didn't need conversion. Added one new, 3D-only component with
no 2D equivalent: a small +Y hop (0.15 m/s) layered into the anti-stuck kick, to help the ball
clear resting *contact* against a surface (a concept that doesn't really exist the same way in a
top-down 2D physics sim) rather than just a horizontal/downhill push. "Downhill" itself is -Z per
Stage 2's tilt convention, replacing the 2D version's "+Y toward the bottom of the screen."

**Self-verifying CCD test, since this sandbox can't be used to eyeball a single fast frame**:
added a button that launches the main ball at 8 m/s (≈4.7x the max-speed clamp, deliberately -
this specifically stresses whether one physics step can outrun collision detection) directly at
the table's thinnest wall, then automatically watches for 2.5 seconds whether the ball's Z
position ever exceeds that wall's far edge - reporting PASS/FAIL to the status panel rather than
requiring a human to catch a ~90ms event by eye. Also added a "freeze ball in place" button
driving a live stuck-timer readout, so the anti-stuck recovery can be watched counting up to its
kick without needing to find or wait for a naturally-occurring stuck spot.

**Verified in this sandbox**: `node --check`; a standalone Node script confirmed all the derived
constants are self-consistent (e.g. the anti-stuck kick's velocity magnitude stays comfortably
under the max-speed clamp, so the two mechanisms can't fight each other; the CCD test's per-frame
travel distance at 8 m/s is ~4.7x the target wall's thickness, a genuine tunneling stress case,
and reaches the wall in ~91ms - well inside the 2.5s test window). Re-ran the CDN-blocked
failure-path check; new buttons render correctly.

**Not verified** (needs a real browser, same CDN-block limitation as Stages 1-2): whether the CCD
test actually reports PASS when run for real, whether the ball's rolling/settling looks physically
plausible (the acceptance criteria's visual-judgment items), and whether the anti-stuck kick's
specific values feel right once there's actually something (Stage 4's flippers) to get stuck
against - the stage doc's own text already flags these values as needing iteration once flippers
exist, and that's still true.
