# Arcade-style full-screen mobile controls; confirm desktop keyboard controls

## Context
Requested: mobile should use arcade-style controls and play full-screen in portrait; desktop
should use spacebar + arrow keys. Desktop already worked this way (see `release-prompts/13-*.md`
for confirmation it stayed correct through the plunger rewrite) - this covers the mobile side,
which needed real structural changes across `index.html`, `styles.css`, and `InputManager` in
`index.js`.

## Problems with the previous mobile layout
1. **It wasn't full-screen.** `#controls-container` was a separate flex row below the canvas
   with a fixed height (120-150px depending on breakpoint), so the canvas was always squeezed
   into `calc(100vh - 140..170px)` - a visible reserved bar, not a full-bleed play area.
2. **Small discrete buttons, not "arcade style."** The left/right flipper controls were
   ~90-130px square buttons a thumb had to land precisely on, rather than the large side rails a
   real arcade cabinet's flipper buttons occupy - easy to miss under fast play, especially one-
   handed.
3. No attempt was made to request full-screen mode or lock orientation on mobile, despite the
   game's board being portrait-only.

## What was changed

### Structure (`index.html`)
Removed the separate `#controls-container` bottom bar entirely. All interactive controls now
live inside `#game-wrapper` as **overlays on top of the canvas**:
- `#mobile-controls` (new): a `position:absolute; inset:0` layer, `pointer-events:none` by
  default so it never blocks anything, containing:
  - `#flipper-zone-left` / `#flipper-zone-right`: full-height `div`s spanning the outer ~32% of
    the screen width on each side (`pointer-events:auto`) - tapping **anywhere** in that zone
    triggers the flipper, not just a small icon.
  - `#launch-btn`: kept as a discrete circular button, bottom-center (real arcade cabinets have a
    discrete launch/plunger button, unlike the flipper rails which span the cabinet's sides).
- `#pause-btn` stays a direct sibling inside `#game-wrapper` (unchanged position/role), and
  correctly renders above the new overlay controls via z-index (100 vs. the overlay's 40) even
  though `.flipper-zone-right` visually spans behind it - verified via the CSS stacking model:
  browsers hit-test the topmost positioned element at a given point, so a tap on the pause button
  never reaches the flipper zone beneath it.
- Added `viewport-fit=cover` to the viewport meta tag so `env(safe-area-inset-*)` resolves to
  real values on notched/home-indicator phones instead of always being 0, and every new
  control's positioning uses `max(<fallback>, env(safe-area-inset-*) + <margin>)` so nothing
  sits under a notch or home indicator.

### Styling (`styles.css`)
- Canvas media queries for mobile changed from `calc(100vh - 160px)` (reserving bar space) to
  `100vw` / `100vh` with a `100dvh` follow-up declaration (dynamic viewport height, which
  correctly accounts for mobile browser chrome showing/hiding - browsers that don't support
  `dvh` simply keep the `vh` fallback since the later declaration is just ignored).
- `.flipper-zone`: full height, edge-anchored, subtle cyan gradient tint fading toward the
  playfield center (visual affordance without obscuring the table art), with a large circular
  icon badge (`clamp(56px, 16vw, 84px)`) positioned near the bottom via `align-items:flex-end`.
  A `.pressed` class (toggled from JS touch/mouse handlers, since CSS `:active` doesn't fire
  reliably for touch on plain `div`s) brightens the tint and pulses the icon.
- `.launch-btn`: circular arcade button, fluidly sized via `clamp(84px, 22vw, 120px)` instead of
  fixed per-breakpoint dimensions, with a `.ready` class driving a pulsing glow animation when a
  launch is actually possible (via the new `setLaunchReady()` hook - see `release-prompts/13-*.md`)
  and a `.pressed` class for charge feedback.
- Removed the old small-phone/large-phone/tablet breakpoint blocks that hardcoded button pixel
  sizes per range - replaced by `clamp()`-based fluid sizing everywhere, which scales
  continuously instead of jumping at three fixed breakpoints.
- `.pause-btn` restated as a fully self-contained rule (it used to share a combined selector with
  the old `.flipper-btn`/`.launch-btn`, which no longer exist).

### Behavior (`InputManager` in `index.js`)
- `setupMobileControls()` rewritten to bind to `#flipper-zone-left`/`#flipper-zone-right`
  (instead of the old small-button IDs) with the same touchstart/touchend/touchcancel +
  mouse-event pattern as before, now also toggling a `.pressed` class for the visual feedback
  described above.
- `updateMobileControlsVisibility()` retargeted from `#controls-container` to `#mobile-controls`;
  same show/hide logic (mobile detection + landscape rotate-prompt handling from
  `release-prompts/02-*.md` is unchanged).
- **Full-screen + orientation lock**: new `setupFullscreenRequest()` / `requestFullscreenAndLock()`
  methods. On mobile, a one-time `document` `touchstart` listener (`{ once: true }`) triggers a
  `requestFullscreen()` call (feature-detected across vendor prefixes), and on success attempts
  `screen.orientation.lock('portrait')`. Both are wrapped so failure is silent and harmless:
  fullscreen can be denied by the browser or already be unavailable, and the Orientation Lock API
  doesn't exist at all on iOS Safari - this is treated purely as an enhancement, never a
  requirement to play. A user gesture is required for both APIs, which is why this can't just run
  on page load and instead hooks the first touch anywhere.
- Added `vibrate(ms)` (feature-detected `navigator.vibrate`, silently a no-op where unsupported)
  and `setLaunchReady(bool)` (toggles `#launch-btn`'s `.ready` class) as small reusable hooks,
  used by the plunger rewrite in `release-prompts/13-*.md`.

## Desktop controls: confirmed unchanged
No changes were made to keyboard bindings. `setupInput()` in `GameScene` still wires
LEFT/RIGHT arrow keys to the flippers and SPACE to launch-press/release (plus ESC for pause),
exactly as before - this was already what was asked for and didn't need to change, only the
plunger logic *behind* the SPACE binding changed (see `release-prompts/13-*.md`).

## Constraints followed
- Didn't touch flipper physics/power logic (`release-prompts/01-*.md`'s territory).
- Didn't touch the rotate-overlay's landscape-detection logic itself (`release-prompts/02-*.md`),
  only the element ID it toggles.

## Verification
`node --check index.js` passes; CSS brace-balance checked. Loaded the page in headless Chromium
in this sandbox and confirmed the DOM contains all new elements (`#mobile-controls`,
`#flipper-zone-left/right`, the updated `#launch-btn`) with no new console errors before the
expected "Phaser is not defined" (this sandbox's network policy blocks the Phaser CDN - see
`release-prompts/01-*.md`'s implementation note). **Could not test full-screen request,
orientation lock, touch-zone hit areas, or actual on-device feel** - none of that is exercisable
without a real mobile browser or a working Phaser session. Before shipping, this needs a manual
pass on at least one real Android and one real iOS device: confirm full-screen activates on
first tap, confirm the flipper zones don't visually or functionally collide with the pause
button or each other on the narrowest phones you support, and confirm haptics/orientation lock
behave reasonably (or degrade silently) on both platforms.
