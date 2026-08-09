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
