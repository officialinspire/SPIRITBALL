# Improvement 3 — Real feature-parity checklist and visual QA pass

## Context

`babylon-prompts/13-*.md` (item 1) asked for a feature-parity checklist built from the full
2D-game bug-fix history (`archive/release-prompts/01-14`) and manually verified against the 3D
build. It was never built — every stage before Stage 13 could only be verified via source-reading,
Node scripts, or a CDN-blocked failure-path test, since this sandbox couldn't run real Havok/WebGL
at all. Stage 13 changed that (self-hosted Babylon/Havok, real Playwright testing against a
running game) but ran out of scope before building the actual checklist — it only used the new
capability to chase the flipper bug it happened to stumble into.

This means large swaths of the game have **never actually been seen rendered or exercised**:
materials/lighting/glow (Stage 7), particle VFX (Stage 8), the 3D backglass (Stage 9), camera
juice and attract-mode (Stage 10), mobile touch controls (Stage 11 — desktop keyboard/mouse via
Playwright isn't the same as real touch events), and the menu/pause/controls/game-over screens
(Stage 12) have only had structural/DOM-shape checks, not real visual or interactive
verification. This is genuinely achievable now and is probably the single highest-value thing to
do next, since it might turn up real bugs the way the flipper investigation did.

## What to do

1. Build the actual checklist: go through `babylon-prompts/01-*.md` through `12-*.md` and
   `archive/release-prompts/01-14-*.md`, and list every distinct piece of intended behavior each
   one describes (this doesn't need to be exhaustive to the point of paralysis — focus on
   player-visible/player-affecting behavior, not internal implementation details).
2. For each item, verify it for real using Playwright against the running game (self-hosted
   vendor files + `swiftshader` launch flags — see `improvement-prompts/README.md`): screenshots
   for anything visual (materials, lighting, glow, particles, backglass legibility, menu/pause/
   game-over screen layout and content), keyboard+click simulation for interactive flows (pause/
   resume, menu dismiss, game-over restart, controls screen), and direct state assertions
   (`page.evaluate`) for anything not visible on screen (score/lives/stats tracking, high-score
   persistence across a reload, reduced-motion actually reducing camera shake/particle intensity —
   `page.emulateMedia({ reducedMotion: 'reduce' })`).
3. File every real discrepancy found as its own fix, in this same pass if small, or as a new
   `improvement-prompts/NN-*.md` if it's substantial enough to deserve its own scoped task.
4. Mobile touch controls specifically can't be fully verified via Playwright's desktop-context
   automation (no real multi-touch simulation) — note explicitly what was and wasn't covered, and
   flag real-device testing as still needed for that piece specifically.

## Acceptance criteria

- A written checklist exists (can live in this file's own "Implementation note" section) covering
  every stage's core intended behavior, each marked verified-working, verified-broken (with a
  filed fix), or explicitly out of reach of automated testing (mobile touch) with reasoning why.
- At least the visual stages (7-9) have real screenshot evidence attached or referenced, not just
  "assumed correct because the code looks right."

## Implementation note

### The headline finding: `resetBallToPlunger()`'s position reset never actually worked

While testing scoring (see the checklist below), directly setting `ball.mesh.position` via
Playwright had no effect at all - the ball just kept following its own existing trajectory. This
turned out not to be a test artifact: `PhysicsBody.disablePreStep` defaults to `true` (confirmed
against Babylon's own source, same property already used correctly for the flippers and plunger -
see their comments), meaning a **dynamic** body like the ball never syncs its simulated position
*from* `mesh.position` - only the reverse (body → mesh) happens automatically. `mesh.position.set()`
gets silently overwritten by Havok's own simulated position on the very next physics step.

`resetBallToPlunger()` - called after every drain, by the dev "RESET BALL TO PLUNGER" button, and
on every new game - relies entirely on `mesh.position.set(...)` to teleport the ball back. Direct
measurement confirmed the bug is real, not just a test-script issue: sampling the ball's position
in the exact instant after calling `resetBallToPlunger()` (before any further physics step) showed
the position **completely unchanged** from wherever the ball already was. `setLinearVelocity()`/
`setAngularVelocity()` (also called by the same function) worked fine throughout, since those are
direct body API calls, not mesh-transform-mediated - which is exactly why this went unnoticed: the
launch mechanic (a pure velocity injection) always worked, and casual testing after a drain would
often "look" like it worked too, since the table's own downhill gravity tilt (the same tilt
`improvement 2` found and fixed for the plunger) coincidentally rolls a zero-velocity ball back
toward the plunger area over time anyway, in many but not all cases.

**Fix**: `createBall()` now sets `aggregate.body.disablePreStep = false`, the same pattern already
established for the flippers/plunger. This is a no-op on every ordinary frame (the mesh position
already matches whatever Havok itself just wrote there) and only actually does anything on the
frames something explicitly changes `mesh.position` - exactly the teleport behavior every
reset/dev-button code path already assumed it was getting. Verified via a decisive test: launch
the ball for real, let it travel, call `resetBallToPlunger()`, and check position in the *very
next* instant - before the fix, unchanged; after the fix, exactly `(plunger.baseX, BALL_REST_Y_M,
BALL_REST_Z_M)` immediately, holding stable afterward. Full regression pass (flippers, tunneling
test, plunger resting stability, HUD) confirmed unaffected.

### The checklist

Verified via Playwright against the real running game (self-hosted vendor files + swiftshader
launch flags), using a temporary `window.__DEBUG_STATE` hook exposing internal score/lives/pause/
game-over state and key functions (removed before commit, same pattern as every prior debug
investigation in this project).

**Stages 1-6 (foundation, table, ball, flippers, plunger, scoring/drain)**
- Flipper rest angle, sweep limits, and motor behavior - ✅ already covered by Stage 13's own
  regression tests (`-100.0°`/`-80.0°` rest, `-30.0°`/`-150.0°` limits), re-confirmed still passing.
- Plunger/ball resting stability - ✅ covered by improvement 2, re-confirmed still passing
  (`10.6mm` max drift over 10s).
- Tunneling protection - ✅ covered by improvement 1, re-confirmed still passing.
- Bumper/satellite/slingshot/mission-target/re-entry-lane scoring - ✅ **verified for real** for
  the first time: each obstacle type hit individually with a real physics-driven approach (not a
  teleport-into-overlap, which doesn't fire Havok's transition-based collision events), confirming
  the correct point value (`500`/`1000`/`100`/`750`/`2000`) and stat counter increment for each.
  This is what surfaced the `resetBallToPlunger()` bug above.
- Drain → lives decrement → Game Over at 0 lives - ✅ verified via three real drains in sequence
  (`lives: 3→2→1→0`, `gameOverActive` becomes `true` exactly at 0, not before).

**Stage 7-9 (materials/lighting/glow, particles, backglass)** - never seen rendered before this
pass. Screenshots taken at menu/attract-mode, settled gameplay, and mid-hit-effect. Table, walls,
flippers, bumpers, targets, slingshots, and the starfield skybox all render with the intended neon
PBR/glow look, visually cohesive and legible. Backglass renders correctly and is legible when
viewed at a reasonable distance/crop (confirmed via a cropped close-up screenshot) - it reads as
small in the default gameplay camera framing, which matches the doc's own "reference screenshot
vantage point" intent (a real cabinet's backglass is normally viewed at an angle/distance, not
head-on), not a legibility bug. ✅ verified working, no real bugs found.

**Stage 10 (camera juice, attract mode)** - camera shake genuinely displaces the camera during a
hit (confirmed via in-browser `requestAnimationFrame` sampling after an initial round of
Node-side polling gave a false negative - see the methodology note below). Attract mode is active
from page load and ends on the first real launch input, matching its own documented "idle means
before first launch" interpretation (not an idle-timeout system) - ✅ verified working as designed.

**Stage 11 (mobile controls, perf tiering)** - the DOM structure and visibility logic were
verified (mobile-controls show/hide correctly based on viewport aspect ratio, confirmed a
portrait-any-device rule is intentional, not mobile-UA-only), but **genuine multi-touch
interaction cannot be verified via Playwright's desktop-context automation** - there's no real
touch hardware/gesture simulation available in this sandbox. This still needs a real mobile
device pass. Explicitly out of reach here, not silently skipped.

**Stage 12 (menu/pause/controls/game-over)** - ✅ fully verified interactively: ESC pauses (physics
genuinely halts - `0.000000m` ball movement sampled while paused) and resumes correctly; the
controls screen shows correct, platform-aware content and returns to pause on back; Game Over
triggers correctly at 0 lives with the right final score and restart correctly resets all state
(score/lives/gameOverActive). One minor cosmetic nit found: "NEW HIGH SCORE!" displays even for a
literal 0-point game (since `0 >= 0` is technically a new high score on a fresh install) - low
priority, not filed as its own improvement, just noted here.

**Reduced motion** - ✅ verified via `page.emulateMedia({ reducedMotion: 'reduce' })`: camera
deviation during a hit is exactly `0.000000` under reduced motion vs. a real, measurable
`~0.0115m` without it, while scoring still registers correctly in both cases (confirming the hit
itself isn't being skipped, only the visual effect).

**High-score persistence** - ✅ verified across a real page reload in the same browser context:
score written to `localStorage['spiritball-highscore']` during play, correctly read back and shown
on the menu screen (`HIGH SCORE: 500`) after a fresh reload.

### A methodology note worth keeping in mind for future QA passes

Node-side Playwright polling (repeated `page.evaluate()` calls from outside the browser, each with
real IPC/round-trip latency) is too coarse to reliably catch short-duration, small-amplitude
effects like a 40-150ms camera shake - an initial polling-based test showed `0.000000` deviation
even *without* reduced motion active, which looked like a real bug until an in-browser
`requestAnimationFrame`-driven sampling loop (collecting all samples in one `page.evaluate()` call,
no cross-process round-trips between frames) revealed the effect was real all along. Prefer
in-browser rAF sampling over repeated external polling when verifying anything with a duration
under a few hundred milliseconds.
