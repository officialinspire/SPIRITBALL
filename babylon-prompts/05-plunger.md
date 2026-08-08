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
