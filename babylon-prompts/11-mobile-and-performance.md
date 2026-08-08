# Stage 11 — Mobile controls, Havok compatibility fallback, and performance

## Context
Two things converge here: reconnecting the DOM-overlay touch controls already built and tuned in
`../release-prompts/14-arcade-mobile-fullscreen-controls.md` (full-screen arcade-style edge
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
   `release-prompts/14-*.md` (`#flipper-zone-left`/`#flipper-zone-right`, `#launch-btn`,
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
4. Re-verify the mobile-specific UX work from `release-prompts/02-*.md` and `14-*.md` (landscape
   rotate-prompt, full-screen request, safe-area-aware control positioning) still applies
   correctly with the new full-bleed 3D canvas - the DOM overlay approach means most of this
   should carry over unchanged, but confirm rather than assume, especially the interaction between
   the fullscreen API request and Babylon's canvas resize handling (Babylon needs
   `engine.resize()` called on viewport/orientation changes, analogous to the old
   `window.game.scale.refresh()` call in `InputManager.handleResize()`).

## Constraints
- Don't silently degrade or crash on unsupported devices - the whole point of this stage is
  turning an unhandled failure into a deliberate, honest one.
- Keep the DOM control markup/CSS from `release-prompts/14-*.md` as the source of truth for
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
