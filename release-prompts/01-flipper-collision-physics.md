# Fix flipper collision physics (desktop + mobile)

## Context
SPIRITBALL is a Phaser 3 (Arcade Physics) pinball game in `index.js`. The flippers are the core
interaction and currently feel unreliable. See `KNOWN_ISSUES.md` item 1 for the full writeup.

## Problem
In `setupFlippers()` the flipper collision bodies are created as **static** bodies:
```js
this.leftFlipper = this.add.sprite(...);
this.physics.add.existing(this.leftFlipper, true); // true = static body
this.leftFlipper.body.setSize(flipperWidth, flipperHeight);
```
Static Arcade bodies never move or rotate their collision box, so the hitbox stays a fixed,
unrotated rectangle at the flipper's resting angle even while the *sprite* tweens up 70° in
`activateLeftFlipper()` / `activateRightFlipper()`.

Worse, the velocity boost that makes a "flip" happen is computed only once, at the instant of
the keydown/touchstart edge:
```js
activateLeftFlipper() {
    if (!this.leftFlipperActive) { /* start tween */ }
    if (this.physics.overlap(this.ball, this.leftFlipper) && ...) {
        // apply velocity — only runs here, once, on the press edge
    }
}
```
`activateLeftFlipper()` is only invoked on the rising edge of input (keyboard `keydown-LEFT`
event, or the edge-detected mobile state change in `updateInput()`), never every frame while the
flipper is held down. A ball that reaches the flipper a few frames after the press gets no boost
— it just bounces passively off a hitbox that doesn't match what's on screen.

## What to do
Choose and implement one of these approaches (recommend option A — it's the standard Phaser
Arcade-physics pinball pattern and requires the least rework):

**Option A — dynamic body + continuous power application (recommended)**
1. Convert `leftFlipper`/`rightFlipper` bodies to non-static, but immovable-and-not-affected-by-
   gravity (`this.physics.add.existing(this.leftFlipper)` without `true`, then
   `body.setAllowGravity(false)`, `body.immovable = true`, `body.setSize(...)` as before). This
   lets you rotate the body to match the sprite each frame.
2. In the scene `update()` loop (not just on input edges), when a flipper is active
   (`this.leftFlipperActive`), sync `this.leftFlipper.body.rotation` (or reposition the body
   center) to track the sprite's current tweened angle, OR — simpler and very standard for
   pinball — approximate the swept flipper as a slightly larger static circle/capsule collider
   sized to cover the full swing arc, so the hitbox always matches "flipper is up" regardless of
   exact instantaneous angle.
3. Move the "does this touch the ball right now, apply power" check out of the input-edge
   handlers and into `update()`, run every frame while `leftFlipperActive`/`rightFlipperActive`
   is true and the ball overlaps the flipper, respecting the existing per-flipper cooldown
   (`leftFlipperCooldown`) so it doesn't re-launch the ball every single frame of contact.

**Option B — simplify to a reliable arc-covering static collider (lower effort)**
1. Keep static bodies, but size/position each flipper's collider to cover its full swing arc
   (a capsule or slightly oversized rectangle spanning both rest and extended positions) instead
   of just the rest position.
2. Move the overlap+power-application check into `update()` (gated by `leftFlipperActive`/
   `rightFlipperActive` and the existing cooldown) instead of only in the input-press handler, so
   any ball touching the arc-collider while the flipper is actively "up" gets flipped, not just a
   ball that happened to already be touching at the exact instant of keypress.

Either way, the end state must be: **a ball that rolls onto a flipper while it is being held up
gets flipped, every time**, not just when the press and ball arrival coincide within one frame.

## Constraints
- Don't rewrite the whole physics/collision system — this is a targeted fix to
  `setupFlippers()`, `activateLeftFlipper()`, `deactivateLeftFlipper()`, `activateRightFlipper()`,
  `deactivateRightFlipper()`, and the scene `update()` loop.
- Preserve existing feel constants (power scaling, angle variation based on hit position,
  camera shake) — only fix *when/whether* the boost is applied and *where* the hitbox actually is.
- Must work identically for keyboard input (desktop) and the mobile touch button state in
  `window.gameInputManager.state` — both paths already funnel through `activateLeftFlipper()` /
  `activateRightFlipper()`, so fixing those methods (plus adding the continuous `update()` check)
  fixes both platforms at once.

## Acceptance criteria
- Manually test (or describe a test plan if you can't run a browser): holding a flipper down and
  rolling the ball onto it from a stationary/slow-rolling start reliably flips the ball, not just
  when timed to the exact press instant.
- No regression in existing collision behavior with walls/bumpers/other obstacles.
- No console errors introduced (check for `body` being undefined if you change static→dynamic,
  since some Arcade Physics methods differ between static and dynamic bodies).

---

## Implementation note (2026-08-08)
Implemented a variant of **Option B**: kept the flipper bodies static (Arcade Physics circle
bodies don't need to be dynamic to be resized/repositioned, and static bodies are cheaper), but
replaced the rectangular `body.setSize(120, 16)` hitbox with a single circular collider
(`body.setCircle(62, ...)`) centered on each flipper's pivot, sized to cover the full ±rotation
swing arc (half-diagonal of the old rect was ~60.5px). The power-application logic that used to
live only inside `activateLeftFlipper()`/`activateRightFlipper()` (checked once, on the press
edge) was extracted into a new `updateFlipperPower()` method called every frame from `update()`,
gated on `leftFlipperActive`/`rightFlipperActive` plus the existing per-flipper cooldown (bumped
from 25ms to 150ms to avoid re-triggering every frame while the ball is still inside the now-
larger collider right after being launched). `activateLeftFlipper()`/`activateRightFlipper()` now
only handle the visual swing tween. Verified with `node --check index.js` (syntax) and a manual
review of the diff; could not exercise this in an actual browser in this sandbox because the
Phaser CDN (`cdn.jsdelivr.net`) is blocked by the environment's outbound network policy — a real
deployment target will not have that restriction, but this fix should still get a manual desktop
+ mobile playtest before shipping.

## Follow-up fix (2026-08-09) — the manual playtest found a real regression
Real playtesting reported the ball "flying everywhere," not feeling controlled by the flippers.
Root cause: the 62px collider radius chosen above covers roughly **6x the area** of the thin
120×16 rectangle it replaced (a disk of radius 62 is ~12,076px², versus the rectangle's 1,920px²)
— a large zone of empty space around the visual paddle that still counted as "touching the
flipper." Combined with the 150ms cooldown, a player holding a flipper down with the ball resting
near it could have the ball re-flipped at near-full power (`Math.max(1500, ballSpeed * 2.4)`)
every ~150ms before it had actually cleared that oversized zone — each re-hit computed a new,
somewhat arbitrary launch angle from wherever the ball happened to be within the disk. Repeated
quickly enough, this is a runaway feedback loop that pins the ball at `CONFIG.ballMaxVelocity`
and sends it caroming unpredictably — exactly the reported symptom, and specifically a flipper
problem, not a general physics one.

Fix: shrunk `flipperColliderRadius` from 62 to **40** (area ~5,027px², under half the original,
while still comfortably larger than the ball to catch it reliably through the swing), and
lengthened the cooldown from 150ms to **320ms** so a launched ball has time to clearly exit the
(now smaller) zone before it's eligible to be flipped again. As a side benefit, the smaller radius
also tightens the hit-position-based launch-angle variation (`hitPosition = (ball.x - flipper.x)
/ 40`), so a touch near the collider's edge no longer produces as extreme an angle swing as it
could before — less erratic-feeling shots generally, not just fewer repeat-launches.

Verified with `node --check index.js`; could not re-exercise live flipper feel in this sandbox
(same CDN block as before). This specifically needs the same real-device playtest that surfaced
the original bug, focused on: holding a flipper with the ball resting on/near it (the exact
scenario that broke), and normal single-tap flipping (should feel materially calmer/more
predictable than before, not just "less broken").
