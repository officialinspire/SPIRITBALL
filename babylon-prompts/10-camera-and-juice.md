# Stage 10 — Camera choreography and impact juice

## Context
The 2D version's `cameraShake()`/`cameraFlash()` helpers (`../archive/release-prompts/12-accessibility-pass.md`)
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
2. Respect `window.SPIRITBALL_reducedMotion` (`../archive/release-prompts/12-*.md`) exactly as the 2D
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

---

## Implementation note (2026-08-09)

**Scope**: only wired to events that actually exist in this build - wall/flipper contact,
bumper/satellite/slingshot/mission-target/re-entry-lane hits (Stage 6), launch (Stage 5), and
drain (Stage 6), using the 2D game's own `cameraShake(duration, intensity)`/`cameraFlash(...)`
values at each corresponding call site (grepped every call in `../index.js` first to build the
full hierarchy, not guessed). Fuel lights, obstacles, inlanes/outlanes, bonus lane, launch ramp,
mission-complete, rank-up, and abort-mission don't have anything to attach to yet - none of that
game state or geometry exists (Stage 6's mission-FSM deferral to Stage 12 again). The helper
functions below are fully general and ready to use the moment those elements get built.

**Shake/punch model**: two independently-bounded offsets added to the camera's fixed base
position every frame, never accumulated across events - each call takes the max of its own
request vs. whatever's already in flight, not a sum, so no burst of rapid-fire hits can push the
camera arbitrarily far. Node-verified the worst realistic case (a flipper hit's shake plus a
max-power launch's push-in, both simultaneously): ~0.072m combined displacement against a
camera-to-table distance of ~0.5-1.3m (from `09-*.md`'s frustum check) - comfortably bounded,
directly satisfying this stage's "never lose the ball from frame" constraint with real numbers
rather than just intuition. Shake amplitude is `intensity * 4`, a flat rescale of the 2D helper's
arbitrary 0.002-0.01 "screen-shake units" into plausible meters of jitter at this table's ~0.5m
scale - not separately re-tuned per call site, so the existing 2D hierarchy (light taps vs. strong
hits) carries over by construction. Per-axis damping (full X, half Y, less Z on the shake) keeps
the into/out-of-screen axis - the one most likely to feel disorienting - the most restrained.

**Flash uses a DOM overlay, not the `DefaultRenderingPipeline`**, despite the doc's suggestion -
deliberate deviation: the pipeline only exists when `detectHighFidelity()` is true (`07-*.md`), so
tying flash exclusively to it would make it silently vanish on low-tier devices for a feedback
mechanism (drain's red flash) that arguably matters most on exactly the devices most likely to be
low-tier. A plain full-screen div works identically everywhere and needed no image-processing
parameter tuning I can't verify anyway.

**Attract-mode camera**: this build has no menu/title screen yet (Stage 12), so "idle" was
interpreted as "before the player's first launch input" - the orbit `ArcRotateCamera` is
`scene.activeCamera` from load, switching to the fixed gameplay camera the instant
`handleLaunchPress()` first fires (before its own `ballInPlay` guard, so even a no-op press still
ends attract mode). No `attachControl()` - rotation is driven by incrementing `.alpha` each frame,
not user drag, so it can't be grabbed by the same touch input the flipper zones use. Also added to
the bloom pipeline's camera list (when `highFidelity`) so attract mode gets the same visual
treatment as gameplay, not a downgrade.

**Wall/flipper camera shake, not literal ports**: the 2D wall shake fires unconditionally on every
collider contact; added a short cooldown here (not present in the 2D cooldown map) specifically so
grinding along a wall doesn't shake the camera every physics substep, per the doc's own "don't
feel noisy" constraint. The flipper shake is an even looser adaptation - the 2D version's trigger
was its manual ball-velocity-injection code, a mechanic that doesn't exist in this build at all
(Havok's real contact response replaces it, per `04-*.md`/`06-*.md`), so it's reused here as the
closest available proxy for "the flipper did something impactful," firing on any ball-flipper
contact rather than specifically an active-swing hit.

**Verified in this sandbox**: `node --check`; the established top-level-`BABYLON`-reference grep
sweep (clean); a Node script confirming worst-case combined shake+punch displacement stays small
relative to the camera-to-table distance; the CDN-blocked failure-path check in headless Chromium.

**Not verified** (same limitation as every visual/juice stage so far): whether the shake actually
feels proportional to impact, whether the flash reads as intended, whether the attract-mode orbit
looks cinematic or just slow, and whether the ball/flippers genuinely stay in frame during real
gameplay rather than just in this sandbox's displacement-magnitude math.
