# Stage 4 — Motorized hinge-constraint flippers

## Context
The single biggest gameplay-feel change in this whole rewrite. The current 2D flipper feel
(`../release-prompts/01-flipper-collision-physics.md`) worked by directly setting the ball's
velocity based on a hand-tuned power/angle formula the instant a collision was detected - that
approach doesn't exist in a real rigid-body simulation. Here, the flipper is a physical object
with mass and angular momentum, driven by a motor, and it transfers force to the ball through
genuine contact dynamics. This needs its own tuning pass; nothing from the old formula transfers
directly.

## Goal
Two flippers, each a real 3D rigid body attached to a fixed pivot via a limited, motorized joint,
that snap up sharply when activated and fall back under gravity/spring when released, and that
convincingly fling the ball when it's struck mid-swing - reachable from both keyboard (desktop)
and the existing touch-zone controls (mobile, wiring happens in Stage 11).

## What to do
1. Model each flipper as a dynamic rigid body (an elongated box or capsule shape is fine -
   detailed flipper geometry is Stage 7's job) at the correct converted position from the current
   `setupFlippers()` layout, pivoted at its base (matching where a real flipper pivots, not its
   center).
2. **Use `Physics6DoFConstraint`, not the basic `HingeConstraint`.** Confirmed via Babylon's own
   forum/community reports (see `../BABYLON_3D_OVERHAUL.md`): Havok's simple hinge constraint
   cannot be range-limited the way flippers need. Configure a single angular axis
   (e.g. `BABYLON.PhysicsConstraintAxis.ANGULAR_Z` or whichever axis matches the flipper's actual
   swing plane given the table's tilt convention from `02-*.md`) with `minLimit`/`maxLimit`
   matching the flipper's real rest-to-extended swing range (roughly 40-70° depending on the
   final geometry - tune by feel), using the confirmed constraint-construction pattern in
   `../BABYLON_3D_OVERHAUL.md` as your starting template.
3. **Add a motor to that same axis.** The motor API's exact method names were **not** confirmed
   during this project's research pass (Babylon's docs reference a "Motor Constraints" example
   that wasn't directly readable at the time) - check Babylon's current documentation/playground
   for the live API (likely something in the shape of setting a motor type, target velocity, and
   max force on the constrained axis) before writing this code, rather than guessing method
   names. The behavior needed: on activation, drive the flipper toward its extended limit
   quickly and with enough force to feel snappy (matching the old 2D version's "lightning-fast"
   50ms swing feel as a rough target); on release, either let it fall back under gravity/a weaker
   return motor, or reverse the motor toward the rest limit - whichever the confirmed API makes
   more natural.
4. Wire activation to the same input entry points the current game uses conceptually (not the
   same code - this is a different engine): LEFT/RIGHT arrow keys on desktop map to left/right
   flipper motor activation; touch input wiring is deferred to `11-*.md` but keep the activation
   function itself input-agnostic (a plain `activateLeftFlipper()`/`deactivateLeftFlipper()` pair
   any input source can call) so that stage just has to call it.
5. **Tune, playtest, iterate** on: flipper mass, motor force/speed, the ball's restitution against
   the flipper specifically (may need a different value than ball-vs-wall), and the swing angle
   limits, until a ball resting on a flipper and then flipped travels a satisfying distance up
   the table - this is inherently a feel-by-play exercise, not something to get right from theory
   on the first attempt.

## Constraints
- Keep the flipper's swing axis, motor direction, and rest angle consistent with the tilt
  convention chosen in `02-*.md` - a common bug source here is a flipper that swings on the wrong
  plane relative to the tilted table.
- Don't try to replicate the old 2D formula's exact numbers (power multiplier, angle-based hit
  position adjustment) - those were tuned for a completely different physics model and won't mean
  anything here. Tune fresh, from what looks/feels right in the new simulation.

## Acceptance criteria
- Both flippers rest in their down position and snap to their up position within roughly the same
  ballpark responsiveness as the old game (fast, not floaty) when activated, and return to rest
  when released.
- A ball resting on a flipper gets propelled a meaningful distance up the table when the flipper
  is activated - not just nudged.
- A ball arriving on a flipper *while it's already held up* (not just at the exact instant of
  activation) still gets flipped - this was the core bug fixed in the 2D version
  (`../release-prompts/01-*.md`) and the 3D rigid-body approach should get this right more
  naturally (continuous contact dynamics rather than a one-shot velocity injection), but confirm
  it's actually true here rather than assuming the new engine automatically solves it.
- No physics instability (flippers vibrating, snapping to extreme angles, or launching the ball
  at absurd unphysical speeds) during normal play.
