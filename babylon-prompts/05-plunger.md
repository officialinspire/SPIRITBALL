# Stage 5 — 3D plunger and launch mechanic

## Context
Ports the charge-and-release power curve already designed and tuned in the 2D version
(`../release-prompts/13-plunger-ball-mechanics-revamp.md`) into the 3D physics world, as a
visible 3D piston in the launch lane.

## Goal
A plunger the player can hold to charge (visually pulling back, with the same charge-time/power
curve as the current 2D game) and release to fire the ball up the launch lane with power
proportional to how long it was held.

## What to do
1. Build the launch lane as part of the table geometry (a walled channel on one side, matching
   the current `setupPlunger()`/`launchPort` layout, converted to the real-world scale from
   `02-*.md`) with the ball resting at its base when not in play.
2. **Recommend a kinematic-animated plunger, not a physically-simulated spring**, for the same
   reliability reasons the 2D version kept its launch mechanic simple and deterministic
   (`../release-prompts/13-*.md`): animate the plunger mesh's position by hand based on charge
   percentage (matching the old pull-back distance/easing), and on release, **apply a calculated
   impulse directly to the ball** (rather than relying on the plunger mesh physically pushing it)
   using the same charge-time-to-power curve as the 2D version:
   `power = minPower + (maxPower - minPower) * chargePercent`, continuously updated from held
   duration exactly as `updatePlunger(delta)` does today - port that pause-safe, delta-accumulated
   charge logic as-is, just retarget the output from a 2D velocity to a 3D impulse vector aimed
   up the launch lane (with the lane's actual 3D direction, not a hardcoded 2D-style
   velocityX/velocityY pair).
3. Re-derive `plungerMinPower`/`plungerMaxPower` for the new scale and impulse-based launch (an
   impulse in a real-world-scale, real-mass simulation needs very different numbers than a
   pixels-per-second velocity did) - start from "does the weakest possible launch reliably clear
   the lane" and "does the strongest reasonable launch reach the top of the table without being
   absurd," the same criteria used to pick 700/1600 in the 2D version, just re-derived from
   scratch for the new units.
4. Keep the same input entry points conceptually (hold-to-charge, release-to-fire via SPACE on
   desktop, wired to a touch control in Stage 11) and the same juice ideas from the 2D revamp -
   MAX-charge visual feedback, a launch impact effect - reimplemented with Babylon animations/
   particles instead of Phaser tweens (particles are Stage 8's job; for now a simple scale/color
   pulse on the plunger mesh at max charge is enough).

## Constraints
- Don't attempt a fully-simulated spring-constraint plunger for this stage - that's a legitimate
  future enhancement but adds risk without adding much player-facing value over a well-tuned
  kinematic-plus-impulse launch, and this project already has enough open physics-tuning surface
  area in Stages 3-4.
- Keep the charge/power curve's *shape* (continuous, proportional to hold duration, no special-
  cased "quick tap" behavior) identical to the 2D version's already-settled design - that design
  decision doesn't need revisiting, just re-scaling.

## Acceptance criteria
- Holding the launch input visibly pulls the plunger back over the same ~2 second charge window
  as the current game, with power increasing continuously and no snapping to fixed tiers.
- The weakest possible launch (an instant tap) reliably gets the ball out of the launch lane and
  into general play, not just a weak dribble that falls back.
- The strongest launch (full charge) sends the ball a clearly greater distance/height than a weak
  one, with a visible difference a player would notice.
- Releasing immediately after a scene reset/ball respawn works reliably (mirrors the desktop
  "launch after death" reliability work already done in the 2D version) - test this specifically,
  it was a real bug there.

---

## Implementation note (2026-08-09)

Extended `babylon-game.js`/`index.html` (no new files). Followed the doc's own recommendation:
the plunger is a plain, non-physics mesh whose Z position is set directly from `chargePercent`
each frame; release sets the ball's velocity directly (matching how `updateBallPhysics()`'s
anti-stuck kick already works, not a Havok impulse), not a simulated spring.

**Charge/power curve**: ported `updatePlunger()`/`handleLaunchPress()`/`handleLaunchRelease()`
from `../index.js` as directly as the doc asked - same 2000ms charge window, same continuous
(no-tiers) power curve, same "release always tries to launch if ready" reliability property that
made desktop launch-after-death work in the 2D version. `plungerMinPower`/`plungerMaxPower`
(700/1600 px/s) re-derived into m/s via the same `PX_TO_M` scale as `MAX_BALL_SPEED_MS`
(`03-*.md`) - Node-verified the resulting launch speed range (~0.69-1.53 m/s) stays comfortably
under that clamp at every horizontal-kick angle, so the plunger and the velocity clamp can't fight.

**A real bug caught before any testing, via the same Node-verification habit used in every prior
stage**: the doc's "build a walled channel" instruction meant adding a genuine physics wall on the
lane's inner edge - something the 2D game never had. Checked `setupPlunger()` in `../index.js`
and confirmed `launchPort` is purely a decorative `add.rectangle()` with no
`physics.add.existing()` call, unlike every real wall in `setupTable()`. Naively reusing that
rectangle's edge (470px, which is *also* `resetBall()`'s exact ball-rest X) for a new physical
wall would have put the ball resting flush against it with zero clearance. A Node script
confirmed this numerically (clearance came out to exactly 0) before moving the wall 30px further
out, re-verified with the same script to give the ball a comfortable ~0.025m of clearance on both
the new inner wall and the existing outer `rightWall`.

**Mobile input**: the flipper touch zones (`04-*.md`'s stopgap) already claim the whole left/right
half of the canvas, so launch needed its own control rather than a tap zone. Added a dedicated
`#launch-btn` (fixed, bottom-center, thumb-sized) using Pointer Events (`pointerdown`/`pointerup`/
`pointercancel`) so the same handlers work for mouse and touch without separate code paths -
mirrors the desktop SPACE key's press/release semantics exactly.

**Scope gap, accepted deliberately**: there's no drain/ball-loss detection yet (`06-*.md`'s job),
so nothing currently returns the ball to "ready to launch" after a real shot other than the new
`RESET BALL TO PLUNGER` test button - used that button specifically to cover this stage's
"release immediately after a reset" acceptance criterion without building the full game-loop
state machine early.

**Verified in this sandbox**: `node --check`; Node scripts confirming lane/wall/ball clearance
geometry and the power-to-speed range against the velocity clamp; re-ran the CDN-blocked
failure-path check in headless Chromium.

**Not verified** (needs the real device): whether the charge/release feel matches the 2D
original's "lightning-fast, satisfying" launch, whether the weakest tap reliably clears the lane
and the strongest reaches meaningfully further (the acceptance criteria's core ask), whether the
new inner wall's clearance is actually enough once real Havok collision (not just this geometry
math) is exercised, and whether the `#launch-btn` is comfortable to hold on an actual phone screen.
