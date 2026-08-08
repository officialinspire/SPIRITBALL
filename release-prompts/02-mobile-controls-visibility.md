# Fix mobile touch-control visibility conflict (landscape phones losing controls)

## Context
SPIRITBALL shows on-screen flipper/launch/pause buttons (`#controls-container` in `index.html`)
on mobile. See `KNOWN_ISSUES.md` item 2 for the full writeup.

## Problem
Two independent systems decide whether `#controls-container` is visible, and they disagree:

1. **CSS** (`styles.css`), using `!important`:
   ```css
   @media (max-width: 767px), (orientation: portrait) {
       #controls-container { display: flex !important; }
   }
   @media (min-width: 768px) and (orientation: landscape) {
       #controls-container { display: none !important; }
   }
   ```
2. **JS** (`index.js`, `InputManager.updateMobileControlsVisibility()`), using real user-agent
   mobile detection:
   ```js
   controlsContainer.style.display = shouldShow ? 'flex' : 'none';
   ```

CSS rules marked `!important` always beat an inline `style.display` that isn't itself
`!important`, so the JS mobile-detection logic is dead — visibility is decided purely by
viewport width + orientation. Many phones report CSS width ≥768px in landscape (e.g. iPhone Pro
Max ≈926px), which matches the "desktop" rule and hides all touch controls even though
`window.gameInputManager.isMobile` is `true` — leaving a real mobile device with no way to play.
There is also no "please rotate to portrait" messaging for this case.

## What to do
1. Make the JS `isMobile` detection authoritative instead of pure viewport width/orientation:
   - Either set the inline style with real priority
     (`controlsContainer.style.setProperty('display', 'flex', 'important')` /
     `'none'` similarly) so it can actually override the CSS media queries, **or**
   - Remove the conflicting CSS `!important` rules and drive all show/hide purely from
     `updateMobileControlsVisibility()`, keeping only non-conflicting responsive *sizing* rules
     (the button-size media queries lower in `styles.css` are fine and unrelated to this bug).
   Prefer the second approach — a single source of truth in JS is easier to reason about than
   fighting CSS specificity, and `updateMobileControlsVisibility()` already runs on load, resize,
   and orientation change.
2. Add a landscape-orientation fallback for the mobile case: when `isMobile` is true and the
   device is in landscape (width > height), show a simple "Rotate your device to play" overlay
   (or a CSS-based prompt) instead of leaving the player looking at a squashed/unplayable board
   with no controls. The game board itself is portrait (540×960 logical size), so landscape play
   isn't expected to work — the goal is to *tell the player why*, not to silently strand them.
3. Verify the decision logic still correctly hides controls for genuine desktop (non-touch,
   landscape, wide viewport) users — don't show touch buttons to mouse/keyboard desktop players.

## Constraints
- Keep `detectMobile()`'s combined signal (user-agent OR small-screen-and-portrait) — it's
  reasonable; just make sure whichever visibility mechanism wins actually reflects it.
- This should be a CSS/JS-only change scoped to `InputManager` in `index.js` and the relevant
  rules in `styles.css`; no gameplay/physics code needs to change.

## Acceptance criteria
- Simulate (via browser devtools device toolbar, or reasoning through the media queries) at
  least: a small phone in portrait (controls show), a large phone in landscape (either controls
  still show, or a clear rotate-prompt appears — never a silent no-controls state), and a desktop
  browser window resized narrow (controls should NOT appear for non-touch desktop users, or if
  they do because the size-based fallback intentionally allows small desktop windows, that's an
  acceptable documented tradeoff — just don't regress the "genuine mobile device gets no
  controls" case).
- No JS console errors from the visibility/orientation logic.
