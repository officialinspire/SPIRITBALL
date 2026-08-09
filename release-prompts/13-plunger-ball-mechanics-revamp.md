# Revamp plunger and ball mechanics for better gameplay/UX

## Context
Player feedback: the plunger and ball mechanics needed a real gameplay/UX pass, not just bug
fixes. This covers `CONFIG` physics/plunger constants, `setupPhysics()`, `setupBall()`,
`checkBallStuck()`, `setupPlunger()`, `updatePlunger()`, `handleLaunchPress()`,
`handleLaunchRelease()`, `executeLaunch()`, and `launchBall()` in `index.js`.

## Problems found while reviewing the existing implementation
1. **Gravity was configured twice and the second value silently won.** `CONFIG.gravity: 1400`
   was passed into the Phaser game config, but `GameScene.setupPhysics()` immediately
   overwrote it with `this.physics.world.gravity.y = 800`. The 1400 value never took effect at
   all - the game had been running on 800 the whole time with no obvious indication of that in
   the CONFIG block a developer would look at to tune it.
2. **The plunger's power range was too weak at the bottom end.** `plungerMinPower: 400` meant an
   instant tap barely nudged the ball out of the launch chute - a "quick tap" felt broken rather
   than like a deliberate weak shot.
3. **The charge-to-power logic had two hardcoded special cases layered on top of the real
   charge value**: a "quick tap" (< 100ms hold) forced power to a fixed 60% regardless of how
   short the tap actually was, and a "not currently charging" fallback forced 65% - both dating
   back to earlier bug workarounds. Neither was necessary once launch input became reliable, and
   both made the power the player got disconnected from what they actually did.
4. **Charge timing used `Date.now()` against a stored start timestamp**, which is not pause-safe:
   pausing mid-charge and resuming would show the charge having silently jumped forward by the
   entire time the game was paused, since wall-clock time doesn't stop just because
   `gameState.isPaused` is true.
5. **`checkBallStuck()` fought itself.** It added +100 to the ball's downward velocity on
   **every single frame** the ball's speed stayed under 50px/s, rather than resolving anything
   once. A ball settling naturally (e.g. coming to rest briefly against a flipper) got visibly
   jittered every frame instead of being left alone, and a genuinely stuck ball wasn't
   necessarily freed any faster.
6. Launch always used a fixed `velocityX: -250` regardless of charge power, so weak and strong
   shots had identical horizontal drift - one axis of "aim" was doing nothing.

## What was changed
- **Gravity**: consolidated to one value, `CONFIG.gravity = 1000` (tuned up slightly from the
  effective-but-hidden 800 for a snappier arcade feel), with the `setupPhysics()` override
  removed and a comment pointing back at the single source of truth.
- **Ball feel**: `ballBounce` raised from 0.75 → 0.8 for livelier contact; `ballMaxVelocity`
  (1800) and drag (0.995) pulled out of inline magic numbers into `CONFIG` for one-place tuning.
- **Plunger power range**: `plungerMinPower` 400 → 700, `plungerMaxPower` 1200 → 1600, so even a
  0ms tap is a meaningful, playable launch, and a full charge has more punch/ceiling.
- **Charge model rewritten to be purely continuous and pause-safe**: `gameState.plungerChargeElapsed`
  accumulates via `delta` inside `updatePlunger(delta)`, which is only ever called from
  `GameScene.update()` - and `update()` returns immediately when `isPaused`, so charge time
  automatically cannot accrue while paused. Power is always exactly
  `plungerMinPower + (plungerMaxPower - plungerMinPower) * chargePercent`, live, with no special
  cases. The quick-tap timer and its 60%/65% hardcoded overrides are gone entirely.
- **Launch velocity**: horizontal kick now scales mildly with power
  (`-(150 + power * 0.08)`, ranging roughly -206 to -278 across the new power range) instead of a
  flat -250, kept conservative enough not to risk clipping the launch chute's guide wall at high
  power (the chute is narrow - a much larger swing was deliberately avoided).
- **checkBallStuck() rewritten**: accumulates stuck-duration in `this.ballStuckTime` instead of
  nudging every frame, and only intervenes with one decisive, randomized kick
  (`setVelocity(randomX, 380)`) after ~450ms of near-zero speed, then resets. A ball resting
  normally for a couple of frames is no longer jittered.
- **Juice/feedback pass**: power meter flashes cyan and the charge text reads "MAX!" (with a
  scale pop) at 100% charge instead of just sitting at "100%"; the plunger sprite has a subtle
  spring-wobble while at max charge and a continuous idle "ready" glow when not in use; the ball
  gets a quick scale-punch tween at the instant of launch; mobile gets haptic vibration pulses
  (`navigator.vibrate`, feature-detected, silently a no-op on iOS Safari which has no Vibration
  API) - a light tick on charge-start and a stronger buzz scaled to launch power on release.
- A `window.gameInputManager.setLaunchReady(bool)` hook keeps the DOM launch button's `.ready`
  pulsing-glow class in sync with `canLaunch`/`ballInPlay`, called from `setupPlunger()` (initial
  state), `resetBall()` (ball ready again), and `launchBall()` (no longer ready) - see
  `release-prompts/14-*.md` for the mobile control side of this.

## Desktop controls (unchanged, confirmed still correct)
Desktop already used SPACE (hold to charge / release to launch) and LEFT/RIGHT arrows for
flippers, wired through the same `handleLaunchPress()`/`handleLaunchRelease()` entry points that
the rewritten plunger logic lives behind - both the persistent `keydown-SPACE`/`keyup-SPACE`
listeners and the direct-key-polling backup in `updateInput()` were left as-is and verified (by
reading, not live play - see below) to still route through the new logic correctly, including the
pre-existing dual-input-path design (event listener + polling backup) which already tolerated
being triggered twice per press via `canLaunch`/`ballInPlay` guards.

## Constraints followed
- Didn't change flipper power/angle logic (that's `release-prompts/01-*.md`'s territory) - only
  plunger charge/launch and general ball physics tuning.
- Kept the existing visual style (colors, power meter, plunger sprite) - enhanced, not replaced.

## Verification
`node --check index.js` passes. Manually traced every call site of the removed
`quickTapTimer`/`plungerChargeStart`/`launchAttemptStarted` state to confirm nothing else
referenced them after removal (`grep` sweep, zero hits). Loaded the page in headless Chromium in
this sandbox to confirm no new console errors before the expected "Phaser is not defined" (this
sandbox's network policy blocks the Phaser CDN, same limitation as prior sessions - see
`release-prompts/01-*.md`'s implementation note for background). **Could not actually feel the
new plunger/ball tuning in a live game** - the specific numbers above (gravity 1000, power
700-1600, stuck-kick timing/strength) are reasoned estimates, not playtested values. Treat this as
a strong first pass and expect to want another round of numeric tuning after playing it for real.
