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

## Implementation note

**A real regression found and fixed, not called out in the "what to do" list.** `archive/release-
prompts/12-*.md` (read first, per this prompt's own instruction) already fixed pinch-zoom being
disabled in the 2D game. The 3D rewrite's `index.html` never carried that fix forward -
`maximum-scale=1.0, user-scalable=no` was still blocking pinch-zoom for low-vision users. Fixed the
same way the 2D game did: `maximum-scale=5.0`, `user-scalable=no` removed entirely. The existing
`touch-action: none` already set on the flipper-zone/launch-btn elements continues to prevent
pinch/double-tap-zoom specifically on those controls, so this doesn't interfere with flipper/
launch responsiveness.

**1. Reduced motion - verified, with a methodology finding.** The original rAF-camera-position-
sampling approach (this file's own precedent from `improvement-prompts/03-*.md`) returned
0.000000m deviation in BOTH the reduced and normal-motion cases this time - not a regression, but
a consequence of `improvement-prompts/09-*.md`'s own finding that this sandbox now renders at only
~3fps (swiftshader-bound). At that rate a single frame step (~333ms) can exceed the 120ms bumper-
shake's whole duration, consuming it entirely (`shakeRemainingMs - deltaMs` clamped to 0 on the
very first processed frame) before it ever produces a nonzero camera offset - true for both motion
settings equally, an unrelated rendering-performance artifact. Verified the actual gate instead,
directly and deterministically: called `triggerCameraShake(120, 0.006)` (the exact real bumper-hit
call) and read the shake system's own internal amplitude state immediately after, with no
dependency on the render loop ever catching up. Result: normal motion arms real nonzero shake
amplitude; reduced motion leaves it at zero, confirming `triggerCameraShake()`'s
`if (window.SPIRITBALL_reducedMotion) return;` early-out genuinely suppresses every camera effect,
not just a flag that's read somewhere with no confirmed effect.

**2. Color contrast / colorblind-safety - checked via real rendered pixels, not source hex values.**
Took a real gameplay screenshot and sampled actual composited pixel colors (not CSS source colors)
at the `#player-hud` score/lives text: cyan value text against the real rendered HUD background
measured **15.6:1** contrast, grey label text measured **5.5:1** - both clear passes of WCAG AA's
4.5:1 for normal text. Separately checked the neon palette's real colorblind risk case: the
re-entry lane's lit (bright green)/unlit (dim olive) state, a green-vs-olive distinction that sits
close to the red-green confusion axis. Applied a real deuteranopia simulation matrix (Machado/
Oliveira/Fernandes 2009 coefficients) to sampled pixels from a screenshot with one lane genuinely
lit via a real hit: the lit lane retained **14:1** contrast against the dark background under
simulation (vs. 15.2:1 unsimulated) - the state is conveyed mainly through a real *luminance* gap
(lit crosses the bloom-glow threshold, unlit doesn't) that survives colorblind simulation, not
through hue discrimination alone. No fix needed here - verified passing, not assumed.

**3. Touch targets - measured at a real mobile viewport (375x667, iPhone SE - the smallest common
size, the actual stress case), not eyeballed.** All four interactive control elements meet or
exceed the 44x44 CSS-pixel guideline: flipper zones 134x667 (full-height edge zones, already far
larger than needed), launch button 84x84, pause button exactly 44x44 (at the guideline, not below
it).

**4. Screen-reader markup - real additions, not just verification (this wasn't in Stage 12's
original scope, exactly as this prompt anticipated).** Added `role="status" aria-live="polite"
aria-atomic="true"` to each `#player-hud` row so score/lives changes are announced with their
label as context ("Score 1500"), not a bare, contextless number. Added
`role="dialog" aria-modal="true" aria-labelledby="<heading-id>"` to all four full-screen overlays
(menu/pause/controls/game-over), each referencing its own now-id'd `<h1>`, so assistive tech
announces which screen is showing. **Deliberately NOT attempted in this pass** (substantial enough
to be its own follow-up, per this prompt's own explicit allowance): full focus-trap modal
behavior (moving DOM focus into an overlay when it opens, containing Tab-cycling, restoring focus
on close) - `role="dialog"`/`aria-modal` alone doesn't guarantee that; and giving the backglass's
transient hit messages (`DRAINED!`, `MISSION: ...`, etc.) any screen-reader parity - the backglass
is a `DynamicTexture`-rendered WebGL surface, inherently invisible to assistive tech, and the
game's real state transitions (score, lives, screen changes) already have accessible equivalents
via the fixes above.

Verified via Playwright (a temporary `window.__DEBUG_A11Y` hook - `scene`, hit handlers,
`triggerCameraShake`, and a shake-amplitude reader - removed before commit) and the full existing
regression suite (flippers, CCD, HUD, audio, plunger rest) re-run clean afterward.
