# Stage 10 — Camera choreography and impact juice

## Context
The 2D version's `cameraShake()`/`cameraFlash()` helpers (`../release-prompts/12-accessibility-pass.md`)
gave every hit, launch, and mission event some visual punch through Phaser's 2D camera effects.
This stage rebuilds that feeling for the fixed 3D camera from `02-*.md`, plus adds genuinely
3D-only spectacle (a menu-idle orbit) that had no 2D equivalent.

## Goal
The fixed gameplay camera reacts physically to impactful moments (flipper hits, bumper hits,
launches, mission completions, rank-ups, ball loss) without ever losing the table from frame or
becoming disorienting, plus a slow cinematic orbit camera for idle/menu moments.

## What to do
1. Build small, reusable camera-effect helpers analogous to the 2D version's `cameraShake()`/
   `cameraFlash()` - e.g. a brief positional/rotational jitter animation for "shake" (scaled by
   impact intensity, same spirit as the old `duration`/`intensity` parameters), and a brief
   post-processing color-grade pulse (via the `DefaultRenderingPipeline` from `07-*.md`) for
   "flash." Keep the *call sites* conceptually mapped 1:1 to the old ones (flipper hits, every
   `hit*()` collision handler from `06-*.md`, launches from `05-*.md`, mission-complete/rank-up
   from the ported mission logic) so nothing loses its existing feedback moment.
2. Respect `window.SPIRITBALL_reducedMotion` (`../release-prompts/12-*.md`) exactly as the 2D
   version did - these effects should no-op or be significantly dampened when that flag is set,
   reusing the same flag rather than inventing a new one.
3. Add camera beats for moments that didn't have a dedicated camera treatment in 2D but benefit
   from one in 3D: a brief push-in toward the ball on launch, a slightly wider/slower framing
   during a mission-complete or rank-up celebration, a quick snap-toward-drain on ball loss before
   the reset. Keep these subtle enough not to disorient - the player should never lose track of
   the ball or flippers for more than a fraction of a second.
4. Add an **idle/menu attract-mode camera**: when the game is on the menu/title screen (not
   actively being played), slowly orbit or drift around the table for a cinematic showcase shot -
   this has no 2D equivalent and is a genuinely 3D-only opportunity to make the menu screen feel
   impressive. Switch cleanly back to the fixed gameplay camera the instant play starts.
5. Verify the fixed gameplay camera never needs to move far enough to lose the ball from frame
   during any of these effects - bound the shake/push-in magnitude accordingly.

## Constraints
- The core gameplay camera stays fixed/non-orbitable during actual play (per the architecture
  decision in `../BABYLON_3D_OVERHAUL.md`) - only the idle/menu camera orbits.
- Don't add camera effects for every single minor event if it starts feeling noisy - match the
  old game's judgment about what warranted shake vs. what didn't (light taps like inlane hits got
  gentle shake, mission-complete/rank-up got much stronger effects - keep that hierarchy).

## Acceptance criteria
- Every event that had camera feedback in the 2D version has an equivalent, appropriately-scaled
  3D camera/postprocessing reaction.
- `window.SPIRITBALL_reducedMotion` visibly and reliably suppresses/dampens these effects when
  set.
- The ball and both flippers remain visible in frame throughout normal play, even during the
  strongest camera reactions (rank-up, mission-complete).
- The menu/idle camera orbit is visually distinct from gameplay and transitions cleanly when a
  game starts.
