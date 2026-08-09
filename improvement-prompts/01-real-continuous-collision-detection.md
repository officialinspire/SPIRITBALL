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
