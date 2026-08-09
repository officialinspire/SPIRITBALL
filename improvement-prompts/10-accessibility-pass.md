# Improvement 10 — Accessibility verification pass

## Context

Several accessibility-related features were built across earlier stages but never verified in
practice, since real browser testing wasn't possible until Stage 13: reduced-motion handling
(`window.SPIRITBALL_reducedMotion`, meant to tone down camera shake/particle intensity, built in
Stage 8), ARIA labels on the mobile touch-control zones (`role="button" aria-label="Left
Flipper"`), and whatever color/contrast decisions were made in the neon palette. The 2D game had
its own accessibility pass documented in `archive/release-prompts/12-accessibility-pass.md` —
read that first for context on what was already considered and fixed once, so this doesn't
duplicate that work blindly on the 3D build without accounting for what's actually different now
(a real 3D scene with bloom/glow instead of flat 2D sprites has different contrast/motion
considerations).

## What to do

1. Verify reduced-motion actually works: `page.emulateMedia({ reducedMotion: 'reduce' })` in
   Playwright, then trigger camera-shake-causing events (bumper hit, drain) and confirm shake/
   punch magnitude is genuinely reduced, not just that the flag is read somewhere.
2. Check color contrast and colorblind-safety for anything conveying game-state information
   (score/lives text against its background, the flash-overlay's red drain flash, any
   status/warning coloring) — the neon palette (magenta/cyan/gold) has real potential for
   red-green colorblind issues depending on exact hues used; check actual rendered pixel colors
   via a screenshot analysis, not just the source hex values, since bloom/glow can shift perceived
   color.
3. Verify touch target sizing on the mobile control zones meets a reasonable minimum (44x44 CSS
   pixels is the common accessibility guideline) at real mobile viewport sizes, not just "large
   enough" by eye.
4. Verify screen-reader-relevant markup on the menu/pause/controls/game-over DOM overlays (Stage
   12) — are headings/buttons/live-updating text (score, lives) exposed sensibly, or is everything
   silent to assistive tech? This wasn't part of Stage 12's original scope and likely needs real
   additions (`aria-live` regions for score/lives updates, proper heading structure), not just
   verification.
5. Fix whatever's found rather than just cataloguing it, where the fix is small; file anything
   substantial as its own follow-up if it doesn't fit in this pass.

## Acceptance criteria

- Reduced-motion is verified to measurably reduce camera/particle intensity, not just toggle a
  flag with no confirmed effect.
- Touch targets meet a documented minimum size on real mobile viewport dimensions.
- Score/lives updates and key screen transitions (menu, pause, game over) are exposed to
  assistive technology via appropriate ARIA attributes, verified present in the actual DOM output.
