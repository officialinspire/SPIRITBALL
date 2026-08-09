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

---

## Implementation note (2026-08-09)

**Scope expanded at the user's request**: this stage now also includes obstacle placement
(bumper cluster, mission target bank, satellite, slingshots, re-entry lanes) that was originally
`06-bumpers-targets-lanes.md`'s job, pulled forward so flippers and obstacles could be laid out
together as one authentic, Space-Cadet-inspired table rather than flippers alone against an empty
boundary. `06-*.md` has a forward-reference note pointing here for the placement geometry; it
still owns the real scoring/mission-trigger logic for these objects (currently placeholder,
static, non-scoring colliders - see `babylon-game.js`'s obstacle-section comment).

**Motor API, confirmed** (the open question this stage doc flagged as unresolved at write-time):
`Physics6DoFConstraint` exposes `setAxisMotorType(axis, PhysicsConstraintMotorType.VELOCITY)`,
`setAxisMotorTarget(axis, radiansPerSecond)`, and `setAxisMotorMaxForce(axis, maxForce)` on the
constrained angular axis, verified against Babylon's actual source (not guessed). Used
`ANGULAR_Y` as the swing axis, matching this project's "tilted gravity, level geometry" convention
from `02-*.md` (the table is level in local space, so a flipper's vertical swing plane is the
horizontal Y-axis rotation, not X or Z).

**Flipper geometry bug found and fixed before any testing, via Node.js math verification (not
user feedback)**: the first version reused the old 2D game's flipper rest angles (20°/-50°)
mirrored naively. A standalone script computing the flipper *tip* position (not just the mesh
center) showed this put the left flipper's tip at rest on the wrong side of the table centerline
- the two flippers would start overlapping instead of leaving the classic center gap. Rederived
rest angles from scratch by solving for "tip points outward at rest, sweeps inward-and-up-table
when active" directly: `FLIPPER_LEFT_REST_RAD = -100°`, `FLIPPER_RIGHT_REST_RAD = -80°` (these are
**not** simple negations of each other). Also discovered that mirroring a *rotating* constrained
body isn't just mirroring its rest angle - the right flipper additionally needs its constraint
limit range flipped (`[-SWEEP, 0]` instead of the left's `[0, +SWEEP]`) and its motor driven in the
opposite sign, or the two flippers sweep toward the same absolute direction instead of mirroring
each other. Verified the final values numerically: rest tips are exact mirror images
(`leftTip.x + rightTip.x === 0` to float precision) and both flippers' active tips move toward the
center and up-table symmetrically.

**Values used**: `FLIPPER_LENGTH_M = 0.075`, sweep `70°`, motor activate speed `26 rad/s` (fast
"punch," stopped by the angle limit like a real solenoid hitting a mechanical stop), return speed
`9 rad/s` (slower, controlled fall). Flipper mass `0.03kg`, restitution `0.3` against the ball
(lower than the table's general bounce, since a flipper should grip and fling, not just bounce).
These are starting points per the stage doc's own acceptance criteria ("tune by feel") - not
claimed as final.

**Obstacle layout**: positioned fresh (not ported from 2D pixel coordinates) directly in
real-world meters, inspired by Space Cadet's actual table geography rather than SPIRITBALL's old
top-down layout: pop bumper cluster mid-table, mission target bank up the left lane, satellite
upper-right, a slingshot pair just above each flipper (angled 20° inward, mirrored), and three
re-entry lanes across the very top. All positions checked to sit within the table's physical
bounds (`TABLE_WIDTH_M`/`TABLE_LENGTH_M` from `02-*.md`) with no wall overlap.

**Verified in this sandbox**: `node --check`; the mirror-symmetry and tip-position math above via
standalone Node scripts (no Babylon dependency); the CDN-blocked failure-path re-tested in
headless Chromium after this stage's changes, confirming no unguarded parse-time error was
introduced (a real risk here, since an earlier draft of this stage briefly had a top-level
`BABYLON.Tools.ToRadians()` call that would have thrown before the CDN-failure error handling
could register - caught and fixed before it shipped; see the file's inline comments for why plain
math is used instead of Babylon helpers anywhere evaluated outside a function body).

**Not verified** (needs a real browser, same CDN-block limitation as every prior stage): the
single biggest open assumption is that `Physics6DoFConstraint`'s angular limits are measured
relative to each flipper's own creation-time pose, not some absolute world reference - the code is
built entirely around that assumption and it could not be confirmed empirically here. The on-page
live flipper-angle readout exists specifically so a human tester can immediately tell if it's
wrong (flipper doesn't move, moves backwards, or both flippers rotate the same absolute
direction). Also unverified: actual swing feel/speed, whether a ball resting mid-swing gets flung
correctly (this stage's most important acceptance criterion), whether the tuned mass/restitution/
motor-force values feel right, and whether the new obstacle layout plays well or just looks
plausible on paper. The `DROP BALL ON LEFT FLIPPER` button exists as the single most important
manual test for exactly this.
