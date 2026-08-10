# Improvement 6 — Replace placeholder obstacle geometry with real pinball-shaped meshes

## Context

`buildObstacles()` in `babylon-game.js` is explicitly documented as "placeholder geometry only"
(its own header comment, unchanged since Stage 4/6) — bumpers are spheres, targets are simple
shapes, lanes and slingshots are boxes. Stage 7 gave everything real PBR materials, lighting, and
glow, which helps a lot, but the underlying shapes are still primitives, not anything that reads
as "pop bumper," "drop target," "kicker," or "lane guide" the way a real (or even a well-modeled
2D-sprite) pinball table's elements do. This is a real visual-polish gap, lower priority than
functional bugs or missing systems (audio, mission FSM) but worth doing once those are further
along, since it's the kind of thing that makes screenshots/videos of the game look unfinished even
when the underlying mechanics are solid.

## What to do

1. For each obstacle type (bumper, satellite, mission target, slingshot, re-entry lane), design a
   more evocative procedural mesh using Babylon's `MeshBuilder` primitives combined (e.g. a bumper
   as a squat cylinder + dome cap + a thin emissive ring, rather than a bare sphere) — stay
   procedural/code-generated, not externally-modeled assets, consistent with this project's
   established zero-new-asset-dependency pattern (see `babylon-prompts/07-*.md`'s starfield
   skybox and `08-*.md`'s particle texture for precedent).
2. Preserve every existing collision shape's actual physics behavior (restitution, trigger vs.
   solid, position) exactly — this is a visual mesh swap, not a physics change. Consider using a
   separate visual mesh parented to (or positioned to match) the existing invisible physics
   collider if a shape needs to look more complex than what should serve as the collision volume.
3. Verify via Playwright screenshots, comparing before/after, and confirm existing collision
   behavior (hit detection, scoring, camera shake on contact) is unaffected by running the
   existing physical-hit test flow after the change.

## Acceptance criteria

- Each obstacle type is visually distinguishable as a specific pinball element, not a generic
  primitive shape, from a normal gameplay camera distance.
- No change to collision/scoring/trigger behavior — verified via the same hit-detection paths that
  already work today.

## Implementation note

**Approach.** Every obstacle's actual collider mesh (shape, size, position, material assignment,
`PhysicsAggregate`, `metadata.kind`) is completely unchanged. All visual improvement comes from
adding purely-decorative companion meshes with no physics body, positioned to match - the exact
pattern this file already used for the satellite's ring (Stage 4), just applied consistently to
every obstacle type. Because nothing outside `buildObstacles()` needed to change (no new metadata
fields, no changes to `pulseMesh()`/`handlePhysicalHit()`/`handleTriggerHit()`/collision-event
wiring), this was a fully additive, low-risk change with zero code paths to regress.

- **Bumper** (pop bumper): the sphere collider is unchanged; added a wide flat "skirt" cylinder at
  its base (shared dark-metallic `housingMat`) and a glowing torus "collar" around its equator
  (reusing the dome's own colored material, so it reads as one lit fixture). Now reads clearly as
  a dome-on-a-base pop bumper instead of a floating sphere.
- **Mission target**: the thin box collider is unchanged; added a darker backing panel just behind
  it (a mounting bracket) and a small indicator lamp sphere at its base (the classic pinball
  rollover-lane light motif).
- **Satellite**: unchanged sphere + existing ring; added a second, smaller, oppositely-tilted ring
  so it reads as "rings" (plural, like Saturn's real banded ring system) instead of one ring.
- **Slingshot**: the box collider (the rubber-covered kicker face) is unchanged; added a
  triangular-prism "housing" behind it (`MeshBuilder.CreateCylinder` with `tessellation: 3`, a
  cheap way to get a real prism), giving it the wedge silhouette a real slingshot kicker has. The
  collider deliberately stays a box, not a wedge - a wedge-shaped collider would change how the
  ball actually bounces off it, which the doc explicitly said not to do.
- **Re-entry lane**: the flat lit-indicator box collider is unchanged; added two thin flanking
  "guide rail" boxes (chrome-like, sharing `housingMat`) on either side of the lane opening,
  matching a real lane guide's raised metal rails. The rails don't change color on hit - only the
  existing indicator box does, matching the real 2D game's lit/unlit behavior.

**Verification.**
- `obstacle-01-screenshot.js` - full-table and post-launch gameplay-camera screenshots, cropped
  and inspected: all 4 bumpers clearly read as dome-on-base pop bumpers, the satellite reads as a
  ringed planet, the mission-target bank shows distinct colored flag panels, and both slingshots
  show a dark wedge housing behind the rubber face. Zero console/page errors on load or after a
  real launch.
- Collision/scoring parity was checked two ways. First, `qa-02-scoring2.js` (an existing
  Improvement 3 test, re-run via a temporary `window.__DEBUG_STATE` hook) was run against BOTH
  this change and the pre-Improvement-6 baseline (`git stash` back to the prior commit) - the
  results were byte-for-byte identical in both cases (bumper +500, satellite +1000, slingshot 0,
  missionTarget anomalous delta, reentryLane 0), proving the slingshot/reentryLane misses in that
  particular script are pre-existing test-position flakiness (its magic-number ball positions
  predate Stage 5's mission FSM changing what else is going on during the same window), not a
  regression introduced by the geometry swap. Second, direct positive checks were run for every
  type using each obstacle's own well-tuned drop position/velocity
  (`qa-08-slingshot-check.js`, unchanged from Improvement 3: slingshot +100;
  `obstacle-02-lane-target-check.js`, new: re-entry lane +2000, mission target +750) - all five
  obstacle types score exactly their expected point value after the geometry change.
- Full existing regression suite re-run (`flipper-test.js`, `ccd-test2.js`, `hud-check.js`,
  `audio-01-noerrors.js`, a 10s plunger-rest recheck): all pass, zero errors.
- Temporary `window.__DEBUG_STATE` hook removed before commit (`grep -n "__DEBUG_"` returns
  nothing).
