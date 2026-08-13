# SPIRITBALL Final Stabilization Report

Scope: a full regression pass across BOOT, INPUT, GAMEPLAY, PROGRESSION, LIFECYCLE, and QUALITY,
per the requested matrix. No feature additions, no architectural changes - fixes are limited to
regressions the suite actually demonstrated.

The suite itself lives at `qa/stabilization-suite.js` and is meant to be re-run on future changes.
It requires a temporary debug hook re-added before `engine.runRenderLoop` in `babylon-game.js` (see
the comment block at the top of the script for the exact snippet) and removed again afterward - the
hook is a testing aid, never shipped.

## Tests performed

89 checks across six categories, run against a served build (`python3 -m http.server`) in headless
Chromium (software/swiftshader rendering, no GPU). Each category boots its own fresh page/game
session for isolation. Final result: **89/89 passing**, confirmed stable across multiple repeated
full runs (no flakes in the final version of the suite).

| Category | Checks | Result |
|---|---|---|
| BOOT | 13 | pass |
| INPUT | 9 | pass |
| GAMEPLAY | 17 | pass |
| PROGRESSION | 10 | pass |
| LIFECYCLE | 20 | pass |
| QUALITY | 20 | pass |

**BOOT** - normal boot (loading panel hides, menu appears, Havok reports OK); a slow Havok/WASM
load that still completes within the 20s budget (loading panel stays up, then boots cleanly); a
load that exceeds the 20s budget (settles to a failure screen, no hang); the proactive
pre-Havok-4.4-iOS unsupported-device path (unsupported panel shown, canvas hidden, no crash).

**INPUT** - mouse (menu dismissal), keyboard (flipper activate/deactivate), simultaneous multi-touch
on both flipper zones (independent activation and release), and window blur / tab backgrounding
(stuck controls force-released, game auto-pauses).

**GAMEPLAY** - launch (ball leaves the plunger, skill-shot window arms), flippers, bumpers,
slingshots, mission targets, inlanes/outlanes, orbits (arm + timed completion scoring), Vision Gate
(capture + natural eject), the power-up pickup, and skill-shot lane resolution.

**PROGRESSION** - missions (arm + complete), rank (advances past the starting rank on mission
completion), combos (rapid hits build a streak), the end-of-ball bonus pool, the temporary score
multiplier (value change and that `addScore` actually applies it), kickback arming, and ball save
(arms, and a drain while armed does not cost a life).

**LIFECYCLE** - drain (costs a life when unsaved), next-ball reset, pause/resume (including a drain
outcome deferred mid-pause and correctly applied on resume), background/foreground (hidden pauses;
becoming visible again does *not* auto-resume - confirmed intentional, matches the pause-menu-driven
design), Game Over, restart, and New Game fired mid-transition (mid drain-delay, mid Vision Gate
capture, mid bonus count simultaneously) - confirmed no stray timers, pending actions, or leftover
in-progress state survive into the new run.

**QUALITY** - zero uncaught page errors and zero game-caused `console.error` output across every
session; ball speed stays bounded under an aggressive stress sequence (repeated full-power launches
+ rapid flipper slaps); physics-body count and broader resource counts (meshes/materials/
textures/particleSystems) are stable across repeated play/reset cycles; at most one modal overlay
panel is ever visible at a time across the boot -> playing -> paused -> resumed lifecycle; a mobile
viewport + touch smoke test (touch genuinely drives a flipper); a `prefers-reduced-motion: reduce`
smoke test (flag detected, basic play + the reduced-motion single-step bonus count both run clean).

This complements, rather than replaces, the existing regression scripts
(`cabinet-01-integrity.js`, `cabinet-03-gameplay-smoke.js`, `menu-03-functional.js`) and an earlier
dedicated 18-game resource-leak audit from this same stabilization effort (meshes/materials/
textures/particleSystems/physics bodies/audio nodes/pending timers, with forced-GC heap sampling,
zero leaks found) - both were re-run and still pass; this suite's own resource-count check is a
lighter-weight smoke re-check, not a re-run of that full dedicated audit.

## Bugs found

**1. A slow network timeout while loading Havok could be misreported as "unsupported device."**

`main()` loads Havok's WASM module with a 20-second timeout:
`withTimeout(HavokPhysics(), 20000, 'HavokPhysics() WASM load')`. When that timeout fired, the
resulting error message ("HavokPhysics() WASM load did not finish within 20s.") happened to contain
the word "WASM" - purely from the descriptive label passed in, not because anything was actually
incompatible. `main()`'s outer `.catch()` pattern-matches error messages against
`/wasm|webassembly|simd/i` to decide whether to show the "Unsupported device" screen (with a link to
the 2D fallback) instead of the generic error screen. A plain slow-network stall therefore got
routed to "Unsupported device" - telling a player with a slow connection that their device/browser
can't run the game at all, when retrying (or a better connection) would have worked fine.

Demonstrated directly by the BOOT category's slow-Havok-load test (artificially delaying the `.wasm`
response past 20 seconds and inspecting which failure panel actually appeared).

## Fixes made

**Fix for bug 1**: renamed the timeout's descriptive label from `'HavokPhysics() WASM load'` to
`'Havok physics engine load'`, removing the word that was accidentally tripping the compatibility
regex. A genuine WASM/SIMD incompatibility is unaffected - that comes from `HavokPhysics()` itself
rejecting with its own real WebAssembly-engine error message, not from this label, and still
correctly reaches the "Unsupported device" screen. Verified via the suite: the same 20s-exceeding
timeout now correctly shows the generic failure screen, not the unsupported-device screen, across
repeated runs.

No other regressions were demonstrated by the matrix. No other code changes were made.

## Known remaining risks

- The Havok-timeout mislabeling was found by directly inspecting which failure screen appears, not
  by any user-facing symptom report - there may be other message-pattern-matching decisions in the
  codebase with similarly narrow assumptions about what an error string will or won't contain. This
  pass did not audit every such pattern, only the one this matrix's BOOT tests exercised.
- The reactive "unsupported device" fallback path itself (a *genuine* WASM/SIMD-incompatible
  browser, as opposed to the proactive iOS-version check) was not exercised end-to-end - see Testing
  Limitations below for why, and what would be needed to close that gap.
- Bonus/skill-shot/ball-save/orbit/combo windows all count down against real elapsed frame time
  (`deltaMs`), unclamped. A single very large frame stall while actively playing (thermal throttling,
  a GC pause, a background app stealing CPU) will collapse those windows to fully-expired in one
  jump rather than a smooth countdown. That is arguably correct behavior for a real stall (the
  player did lose that real time), and this pass found no evidence it produces an inconsistent or
  broken state - but it was not exhaustively fuzzed for every possible mid-window interruption point,
  and it is worth keeping in mind if a future bug report describes a window "closing instantly" after
  a device hiccup.

## Device/testing limitations

- All testing ran in headless Chromium with software (swiftshader) rendering, not a real GPU and not
  real Android hardware. Frame pacing under this setup is measurably slower and less regular than a
  real device - one contributor to a testing artifact described below - so timing-sensitive results
  here are a reasonable proxy, not a substitute for an on-device pass.
- This same headless/software-rendered sandbox occasionally destabilized under a single very long,
  continuous, uninterrupted test session (one observed "execution context destroyed" crash partway
  through a long chained run, not reproducible as a small isolated case). The final suite structure
  splits BOOT/INPUT/GAMEPLAY/PROGRESSION/LIFECYCLE into separate fresh page sessions specifically to
  avoid this - a test-harness robustness measure, not a change to the game itself, and not something
  that pointed to any actual in-game resource leak (the dedicated leak audit referenced above,
  run separately and much more thoroughly, found none).
- No real touchscreen, no real network conditions (only simulated request delays), and no audio
  hardware were exercised - Web Audio API calls run in headless Chromium but were not verified to
  actually produce correct sound.
- The genuine WASM/SIMD-incompatible-browser path (as opposed to the proactive iOS-version-string
  check, which was tested) could not be exercised: this sandbox's Chromium build fully supports
  WebAssembly SIMD, so there was no way to make `HavokPhysics()` itself genuinely fail to
  instantiate for that reason. Confirming that path still routes to the correct screen would need
  either a real incompatible engine/device or a way to make Havok's own WASM module reject with a
  realistic SIMD-related error, neither of which was available here.
- No visual/screenshot regression comparison was performed - checks are behavioral/state-based
  (DOM, internal game state, physics readouts), not pixel-level.
- This pass did not fuzz arbitrary or adversarial input timing beyond the specific scenarios listed
  in the matrix (e.g. rapid-fire pause/resume spam, out-of-order multi-touch releases, malformed
  touch sequences).

## Recommended next step

Re-run `qa/stabilization-suite.js` (and the existing `cabinet-01-integrity.js` /
`cabinet-03-gameplay-smoke.js` / `menu-03-functional.js` scripts) as a standard gate before any
future release, and again after any change that touches boot/error handling, input wiring, scoring,
or lifecycle/transition code - this catches the class of regression this pass was built to catch
before it reaches players, without requiring a full manual playtest each time.
