# Accessibility pass: zoom, reduced motion, focus

## Context
General accessibility polish for the release. See `KNOWN_ISSUES.md` item 12.

## Problem
1. **Pinch-zoom is disabled.** `index.html`'s viewport meta tag:
   ```html
   <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
   ```
   `user-scalable=no` / `maximum-scale=1.0` blocks pinch-zoom entirely, which hurts low-vision
   mobile users who rely on browser zoom to read HUD text/menus.
2. **`prefers-reduced-motion` doesn't reach the canvas.** `styles.css` has:
   ```css
   @media (prefers-reduced-motion: reduce) {
       * {
           animation-duration: 0.01ms !important;
           animation-iteration-count: 1 !important;
           transition-duration: 0.01ms !important;
       }
   }
   ```
   This is a CSS-only rule — it affects DOM elements (buttons, etc.) but has **no effect** on the
   large number of Phaser `this.tweens.add(...)` calls throughout `index.js` that animate
   on-canvas motion (chakra pulsing/rotation, flipper glow, Saturn rotation, camera
   `.shake()`/`.flash()` calls throughout the `hit*()` methods). Users who've asked their OS/
   browser to reduce motion still get full canvas animation and repeated screen shake.

## What to do
1. Change the viewport meta to allow zoom — at minimum remove `user-scalable=no` and raise
   `maximum-scale` to something reasonable (e.g. `5.0`), while keeping `initial-scale=1.0` so the
   default view is unaffected. Verify this doesn't break the touch-control layout (test on a
   mobile viewport after the change — double-tap-to-zoom shouldn't interfere with rapid flipper
   button taps; `touch-action: manipulation` already set in `styles.css`'s `*` rule should help
   prevent double-tap-zoom on the buttons specifically even with pinch-zoom re-enabled elsewhere).
2. Add a JS-level reduced-motion check: read
   `window.matchMedia('(prefers-reduced-motion: reduce)').matches` once at game start (e.g. in
   `InputManager` or as a small shared flag), and use it to:
   - Skip or shorten the more intense camera effects (`this.cameras.main.shake(...)`,
     `.flash(...)`) throughout `GameScene`'s `hit*()` methods, `showGrimReaper()`, `rankUp()`, etc.
   - Optionally reduce/skip the purely decorative looping tweens (chakra pulse/rotation, Saturn
     ring rotation, flipper idle glow) — these aren't essential to gameplay feedback, unlike, say,
     the flipper swing tween itself, which should stay since it's core visual feedback for input.
   A simple approach: add a `window.reducedMotion` boolean set once at load, and gate the
   non-essential `cameras.main.shake/flash` calls and decorative tweens behind
   `if (!window.reducedMotion) { ... }`.

## Constraints
- Don't remove animations/effects that convey essential gameplay information (e.g. the flipper
  swing itself, or visual feedback that a hit registered) — only reduce/skip decorative or
  intensity-only effects (screen shake magnitude, idle pulsing, flash effects).
- This is a polish pass — keep changes additive and easy to revert if they cause unexpected
  layout issues on mobile.

## Acceptance criteria
- Pinch-zoom works on a mobile browser without breaking touch-control responsiveness.
- With `prefers-reduced-motion: reduce` set in the OS/browser, camera shake/flash intensity and
  decorative canvas animation are visibly reduced, while core input feedback (flipper movement,
  ball trail) still functions.
