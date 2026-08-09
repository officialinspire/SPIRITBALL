# Improvement 1 — Real continuous collision detection (or confirm the fallback is enough)

## Context

`createBall()` in `babylon-game.js` tries to enable Havok's continuous collision detection (CCD)
on the ball, to stop it tunneling through walls/flippers at high speed:

```js
if (aggregate.body && typeof aggregate.body.setCcdMotionThreshold === 'function') {
    aggregate.body.setCcdMotionThreshold(BALL_DIAMETER_M * 0.5);
    aggregate.body.setCcdSweptSphereRadius(BALL_DIAMETER_M * 0.5);
} else {
    console.warn('CCD methods not found on this Havok PhysicsBody build - tunneling protection may be reduced to the manual max-speed clamp only.');
}
```

That `else` branch fires on every load of the game as currently vendored (confirmed via a
Playwright console-message capture during Stage 13's testing pass) — `setCcdMotionThreshold` and
`setCcdSweptSphereRadius` don't exist anywhere on `PhysicsBody` in this Babylon/Havok version
(grepped the actual vendored `vendor/babylonjs/babylon.js` bundle directly for any CCD/sweep/
motion-quality-related identifier: zero matches). These method names were likely carried over
from a different physics engine or an assumption made without checking the real API at the time
this code was written (Stage 3, before real browser testing was possible at all). The game
currently relies entirely on the manual `MAX_BALL_SPEED_MS` velocity clamp in `updateBallPhysics()`
for tunneling protection — the existing CCD dev-test button (`#ccd-test-btn`, "LAUNCH MAIN BALL AT
WALL") does pass, so the manual clamp may already be sufficient, but that's never been confirmed
against a genuinely fast, unclamped impact (the clamp itself limits how fast the ball can ever
get, which could be masking a real tunneling risk at the boundary of that limit).

## What to do

1. Research Havok/Babylon's actual current API for continuous collision detection or "motion
   quality" (check `vendor/babylonjs/babylon.js` directly for the real exported names — the same
   technique used to confirm this bug exists — or Babylon's own docs/playground; don't guess).
   Havok's native concept might be exposed as a shape-level "motion quality" flag, a per-body
   setting with a different name than the current dead code assumes, or it might not be exposed
   at all in this Babylon version (in which case, document that and skip to step 3).
2. If a real API exists, wire it up correctly, remove the dead `typeof === 'function'` guard and
   its console warning, and verify via Playwright that CCD is actually active (e.g. read back
   whatever property confirms it, or construct a test that would fail without it — a ball launched
   at an even higher speed than `MAX_BALL_SPEED_MS` currently allows, temporarily raising the
   clamp for the test only, aimed squarely at a thin wall).
3. Either way, stress-test the manual velocity-clamp fallback directly: temporarily raise
   `MAX_BALL_SPEED_MS` significantly, aim the ball at the thinnest wall/flipper edge in the table,
   and confirm via Playwright position tracking (position samples taken every frame, checking the
   ball's position never ends up outside the table's boundary) whether tunneling actually occurs.
   If it doesn't even under stress, document that the existing clamp is empirically sufficient at
   real gameplay speeds and this was a false alarm — that's a legitimate, valuable outcome too.

## Acceptance criteria

- No dead code silently degrading to a weaker fallback with a console warning nobody sees in a
  shipped build.
- Either real CCD is active and verified, or the velocity-clamp fallback is verified sufficient
  under a genuine stress test (not just the existing, already-passing dev button).
- The dev panel's CCD test button and its "PASS/FAIL" reporting still make sense given whatever
  was found.

## Implementation note

Confirmed exhaustively that this vendored Havok build (1.3.14) exposes **no continuous collision
detection or "motion quality" API at all**, at any level: `grep`ing `vendor/babylonjs/babylon.js`
for any CCD/sweep/motion-quality-related identifier (case-insensitive `ccd`, `sweep`,
`motionquality`, `continuous`) found zero matches, and `strings`-ing the compiled
`HavokPhysics.wasm` binary directly (its native `HP_*` exported function names are embedded as
plain UTF-8 strings for the JS glue layer) confirmed the same at the engine's own native level -
the full `HP_Body_*`/`HP_Shape_*`/`HP_World_*` API surface has no TOI/sweep/CCD-flavored function
anywhere in it. `createBall()`'s `setCcdMotionThreshold`/`setCcdSweptSphereRadius` calls (removed
by this change) were dead code from the start on this build - carried over from a different
engine or an unverified assumption made at Stage 3, before real browser testing was possible at
all in this project.

The same investigation found a real, working replacement for what this dead code was trying to
achieve: `HavokPlugin.setVelocityLimits(linear, angular)`, backed by the native
`HP_World_SetSpeedLimit`/`GetSpeedLimit` functions (confirmed present in both the JS bundle and
the WASM string table, and confirmed live via a temporary debug hook - this build's own default is
200 m/s linear / 100 rad/s angular). This is a **world-level** speed ceiling Havok enforces inside
its own solver every physics substep, not just once per rendered frame the way the existing
`MAX_BALL_SPEED_MS` JS-side clamp is. Now wired up right after `scene.enablePhysics()`:
`WORLD_MAX_LINEAR_SPEED_MS = MAX_BALL_SPEED_MS * 3` (~5.1 m/s) for linear velocity, angular left
untouched at the engine's own default (100 rad/s, comfortably above the flipper's 26 rad/s
activation speed from Stage 13's kinematic-flipper rewrite - verified via Playwright afterward
that flipper behavior is completely unaffected).

**Real stress test performed** (not just the existing, already-passing dev button, per the
acceptance criteria): temporarily set `MAX_BALL_SPEED_MS`/`WORLD_MAX_LINEAR_SPEED_MS` to
effectively unlimited (999) and fired the ball at the thin top wall via the dev panel's tunneling-
test button at escalating speeds, binary-searching for the actual tunneling threshold on this
table's real geometry:

| Speed | Result |
|---|---|
| 50 m/s | PASS - no tunneling |
| 70 m/s | FAIL - tunneled through |
| 100 m/s | FAIL - tunneled through |
| 200 m/s | FAIL - tunneled through (immediate) |

Tunneling starts somewhere between 50-70 m/s on this table. That's roughly **30-40x** faster than
the actual gameplay ceiling (`MAX_BALL_SPEED_MS` ≈ 1.7 m/s) and **10-14x** faster than the new
Havok-level ceiling (`WORLD_MAX_LINEAR_SPEED_MS` ≈ 5.1 m/s) - a wide, comfortable safety margin
for both real defenses. All temporary overrides were reverted after the test (diffed against a
backup of the pre-test file to confirm a clean revert before committing).

Also renamed the dev panel's "CCD TEST" button/label and the corresponding status row to
"TUNNELING TEST" (`index.html`) to stop implying a CCD mechanism that doesn't exist - the
underlying element IDs (`#ccd-test-btn`, `#status-ccd`) were left unchanged (internal, not
user-facing, not worth the extra diff noise to rename throughout `babylon-game.js` too).

Verified via Playwright: no console warnings or errors related to CCD/velocity limits at startup,
normal (non-stress) tunneling test still passes, flipper rest/sweep angles unaffected.
