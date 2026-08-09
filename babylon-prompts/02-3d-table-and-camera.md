# Stage 2 — 3D table geometry and the pinball-cabinet camera

## Context
Builds directly on the working Stage 1 spike (`../BABYLON_3D_OVERHAUL.md`, `01-*.md`). This is
where real content starts: the actual table boundary, derived from SPIRITBALL's current 2D
layout, plus the fixed camera angle that defines the whole visual identity of the 3D version
(the reference screenshot's cabinet-viewing perspective).

## Goal
A static 3D table - outer walls, the angled corner slants, the upper guide rails - as real Havok
rigid bodies, at real-world pinball scale, tilted correctly, viewed through a fixed camera that
matches the classic pinball-cabinet vantage point. No ball, flippers, or game content yet - just
the "box" everything else will be built inside.

## What to do
1. **Establish the coordinate/scale conversion once, in one place** (a small constants module or
   a clearly-commented block at the top of the new game file), and use it everywhere from here
   on: the current 2D table is `CONFIG.width: 540` × `CONFIG.height: 960` pixels. Map that to a
   real-world playfield of **0.51m × 1.07m** (matching actual pinball table dimensions, per
   `../BABYLON_3D_OVERHAUL.md`), so `1 old pixel ≈ 0.51/540 m` on X and `1.07/960 m` on Y/Z.
   Every wall/obstacle position pulled from the current `index.js` (`setupTable()`, etc.) should
   go through this conversion, not be reused as raw numbers.
2. Build the table surface as a static physics body (thin box or plane), **tilted ~6.5° around
   the X axis** - this tilt is what makes gravity pull the ball toward the player/flippers even
   though the world's "down" vector stays global-Y-negative; either tilt the whole table+camera
   rig, or (more standard for pinball sims) keep the table geometry level in its own local space
   and instead apply a small forward-tilt component to the physics gravity vector so the ball
   rolls toward the flippers - pick one approach and apply it consistently to every body added in
   later stages (don't mix local-tilted-geometry-with-global-gravity and
   level-geometry-with-tilted-gravity in the same scene).
3. Recreate the boundary geometry from the current `setupTable()` (top wall, left/right full-
   height walls, the two corner slants, the upper-playfield guide rails) as static
   `PhysicsAggregate` box bodies at converted positions/sizes/rotations. These don't need visible
   materials yet (Stage 7 handles that) - simple placeholder meshes are fine, the goal here is
   correct collision geometry.
4. **Camera**: a fixed (not player-controllable during gameplay) `UniversalCamera` or
   `ArcRotateCamera` locked to a single position/target, positioned behind and above where the
   flippers will be, angled down the length of the table - matching the reference screenshot's
   vantage point (looking up/along the table from just behind the flipper zone, table filling
   most of the frame). Get the FOV and distance right so the full table height is visible without
   excessive perspective distortion at the far end.
5. Verify at this stage (visually, dropping a placeholder ball manually or reusing the Stage 1
   spike's ball) that the table boundary correctly contains a ball - no gaps for it to escape
   through, correct orientation.

## Constraints
- Still no flippers, plunger, obstacles, or game logic - just the static boundary and camera.
- Keep this in new files (e.g. `babylon-game.html`/`babylon-game.js`, or continue in the Stage 1
  spike files renamed) - do not touch or remove the working Phaser `index.html`/`index.js` until
  Stage 13 explicitly says to.
- Document the pixel→meter conversion constant somewhere obvious (a comment block or a small
  exported object) - every subsequent stage depends on reusing it consistently.

## Acceptance criteria
- The 3D table boundary visually and physically matches the current 2D table's proportions and
  layout (same relative wall/slant positions, just converted to real-world scale and tilted).
- A test ball placed anywhere within the boundary and given gravity stays within it - no falling
  through gaps at wall joints or slant transitions.
- The camera framing resembles the reference screenshot's cabinet perspective: table filling most
  of the frame, viewed from behind/above the flipper zone, angled down the table's length.
- The chosen tilt approach (tilted geometry vs. tilted gravity) is written down as a comment so
  Stage 3 onward doesn't have to rediscover which convention is in use.
