# Stage 11 — Mobile controls, Havok compatibility fallback, and performance

## Context
Two things converge here: reconnecting the DOM-overlay touch controls already built and tuned in
`../archive/release-prompts/14-arcade-mobile-fullscreen-controls.md` (full-screen arcade-style edge
zones, launch button, fullscreen/orientation-lock request) to the new physics-driven flipper/
plunger functions from `04-*.md`/`05-*.md`, and confronting the hard compatibility ceiling
identified in `../BABYLON_3D_OVERHAUL.md`: **Havok requires WebAssembly SIMD, unsupported on iOS
below 16.4.** That's not a performance issue to tune away - it's devices that categorically cannot
run this version of the game at all.

## Goal
The existing mobile control scheme works against the new 3D physics engine exactly as it did
against the old one, players on unsupported devices get a clear, honest message instead of a
broken/blank experience, and the game runs at an acceptable frame rate across device tiers via
the same device-tier concept already established (`PerformanceManager` in `../index.js`).

## What to do
1. **Reconnect controls**: the DOM elements and touch/mouse event wiring from
   `archive/release-prompts/14-*.md` (`#flipper-zone-left`/`#flipper-zone-right`, `#launch-btn`,
   `InputManager.setLaunchReady()`, `vibrate()`, the fullscreen/orientation-lock request flow)
   don't need to change - they're engine-agnostic DOM/JS. What changes is what they *call*: wire
   `flipper-zone-left`'s press/release to the new `activateLeftFlipper()`/`deactivateLeftFlipper()`
   from `04-*.md` instead of the old Phaser-era methods, and the launch button to the new
   charge/release functions from `05-*.md`. Keep the `.ready`/`.pressed` class-toggling behavior
   working the same way.
2. **Detect Havok/WASM-SIMD support before committing to the 3D experience**: attempt Havok
   initialization (as in `01-*.md`) and handle failure explicitly - don't let it throw an unclear
   console error and leave a blank canvas. Show a clear, honest message
   ("This device doesn't support the 3D version of SPIRITBALL - needs a browser with WebAssembly
   SIMD support, e.g. iOS 16.4+") rather than a silent failure. Decide and document: is there any
   fallback for unsupported devices (e.g. keep the 2D Phaser version alive at a separate URL as a
   compatibility fallback, linked from this message), or is a clear "not supported" message the
   whole of the mitigation? Either is a defensible choice, but it needs to be a **decision**, not
   an accident.
3. **Performance tiering**: extend the existing `PerformanceManager` device-tier detection
   (`../index.js`) to gate the heavier Stage 7/8 effects (bloom/glow intensity, particle system
   type and count, reflection quality, shadow rendering if any) by tier, same pattern already
   established for the 2D game's particle multiplier. Verify on a simulated low-tier profile
   (devtools CPU/GPU throttling, or an actual older device if available) that the game stays
   playable - responsive flippers and a stable-enough frame rate - even if visually reduced.
4. Re-verify the mobile-specific UX work from `archive/release-prompts/02-*.md` and `14-*.md` (landscape
   rotate-prompt, full-screen request, safe-area-aware control positioning) still applies
   correctly with the new full-bleed 3D canvas - the DOM overlay approach means most of this
   should carry over unchanged, but confirm rather than assume, especially the interaction between
   the fullscreen API request and Babylon's canvas resize handling (Babylon needs
   `engine.resize()` called on viewport/orientation changes, analogous to the old
   `window.game.scale.refresh()` call in `InputManager.handleResize()`).

## Constraints
- Don't silently degrade or crash on unsupported devices - the whole point of this stage is
  turning an unhandled failure into a deliberate, honest one.
- Keep the DOM control markup/CSS from `archive/release-prompts/14-*.md` as the source of truth for
  control layout - this stage is about rewiring event handlers, not redesigning the controls.

## Acceptance criteria
- Touch flipper zones and the launch button correctly drive the 3D flippers/plunger with the same
  responsiveness as keyboard input.
- On a device/browser without WASM SIMD support, the player sees a clear explanatory message
  instead of a blank screen or console-only error.
- Performance on a simulated low-tier device is playable (flippers respond promptly, frame rate
  doesn't degrade to the point of missed inputs), even if visually reduced relative to high-tier.
- Fullscreen request, portrait orientation lock (where supported), and the landscape rotate-prompt
  all still function correctly against the new Babylon canvas.

---

## Implementation note (2026-08-09)

**Reconnected controls, replacing an earlier stopgap**: `index.html`/`babylon-game.js` had a
minimal placeholder from Stage 4 - tap the left/right half of the canvas for flippers, a plain
rectangular launch button - built early because a pinball game genuinely can't be tested on a
touchscreen with zero flipper input, but explicitly documented as "not Stage 11's real touch-zone
UI." That stopgap is now fully replaced (not left running alongside the real thing) with the
actual `#flipper-zone-left`/`#flipper-zone-right`/`#launch-btn` markup, CSS, and
touchstart/touchend/touchcancel + mousedown/mouseup/mouseleave event pattern ported directly from
`InputManager` in `../index.js` (`archive/release-prompts/14-*.md`) - copied inline into `index.html`'s
own `<style>` block rather than linking `styles.css` wholesale, since that file also carries a lot
of 2D-game-specific canvas/HUD/menu/pause-button CSS that doesn't apply here and risked selector
collisions with this page's own `#status-panel`/`#error-panel`/`#flash-overlay`. Press/release now
call this file's own `activateFlipper()`/`deactivateFlipper()`/`handleLaunchPress()`/
`handleLaunchRelease()` directly, instead of setting `InputManager.state` flags for a Phaser scene
to poll every frame - there's no separate polling step here to slot into, so the direct-call
wiring the doc itself describes ("wire flipper-zone-left's press/release to the new
activateLeftFlipper()...") was simpler than reproducing the polling indirection. Also ported:
`setLaunchReady()`'s idle-pulse toggle (now driven by `ballInPlay`, called at the same three
points the 2D version does - initial setup, launch, and reset-to-plunger), the exact
`vibrate()` call sites and values (15ms on charge start, 20-60ms scaled by launch power),
`detectMobile()`/`updateMobileControlsVisibility()`'s device/orientation logic including the
landscape rotate-prompt, and `requestFullscreenAndLock()`'s first-touch fullscreen/portrait-lock
request. `setupResizeHandlers()` calls `engine.resize()` (Babylon's equivalent of the 2D version's
`window.game.scale.refresh()`) instead, per the doc's own note about this exact substitution.

**Havok/WASM-SIMD compatibility, both proactive and reactive**: checked via iOS-version UA
sniffing *before* even attempting to load the CDN scripts (iOS below 16.4 is a known,
deterministic ceiling per `BABYLON_3D_OVERHAUL.md`'s own research - no point waiting for a load
that's certain to fail). Real-browser-verified in this sandbox (see below) with spoofed user
agents at the exact boundary: iOS 15.4 correctly shows the honest message immediately without
attempting any CDN load; iOS 16.4 correctly does *not*, falling through to the normal loading
path. A reactive fallback also wraps the outer `main().catch()` handler: any Havok init failure
whose error message mentions "wasm"/"webassembly"/"simd" gets the same honest message instead of
the generic CDN-failure panel, covering SIMD-incompatible browsers the version check doesn't name
(old desktop browsers, unusual WebViews). **Fallback decision, made explicitly per the doc's own
prompt**: yes - `phaser2d.html` already exists and works (from the earlier `index.html` promotion
work), so the unsupported-device message links to it rather than leaving an unsupported player
with nothing playable at all.

**Performance tiering**: largely already in place from Stages 7-8, not new infrastructure - Stage
7's `detectHighFidelity()` (a simplified, single-boolean port of `PerformanceManager.
detectPerformance()`) already gates bloom (enabled/disabled entirely) and glow intensity; Stage
8's particle systems already have high/low-tier capacity and emit-rate pairs. Re-reviewed for
anything heavy left ungated and found nothing further worth gating - no shadow generator exists
in this build, lighting is 3 lights total (cheap regardless of tier), and the shared particle
texture is a single small `DynamicTexture` reused everywhere.

**Verified in this sandbox**: `node --check`; the established top-level-`BABYLON`-reference grep
sweep (clean); the CDN-blocked failure-path check in headless Chromium, run additionally with
spoofed iOS 15.4 and iOS 16.4 user agents specifically to exercise the new proactive-detection
boundary - this is real, functional verification of actual runtime behavior (not just a syntax
check) since the browser genuinely evaluates `detectLikelyUnsupportedIOS()` and branches
correctly in both directions.

**Not verified** (needs the real device): the touch flipper zones' and launch button's actual
responsiveness/feel, whether the rotate-prompt and fullscreen/orientation-lock requests behave
correctly on a real mobile browser (this sandbox can only confirm the *code path* is reachable and
correctly branches, not that `requestFullscreen()`/`screen.orientation.lock()` succeed against
real browser security/gesture requirements), and actual frame rate under devtools CPU/GPU
throttling or a genuinely low-tier device - the doc's own suggested verification method, not
something this sandbox can run at all.
