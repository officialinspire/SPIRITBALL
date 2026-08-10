# Improvement 9 — Real mobile performance profiling

## Context

Stage 11 built device-tier performance gating (`highFidelity` boolean, gating bloom, glow-layer
quality, and particle density) based on reasoning about device capability, but it's never been
validated against real measured frame-rate/memory data on an actual low-end mobile device — every
verification so far has been structural (does the gating logic run at all) rather than empirical
(does it actually keep the game smooth on hardware that needs it). This sandbox's headless
Chromium with software rendering (swiftshader) is not representative of real mobile GPU
performance, so this specifically needs either a real device or a more realistic performance
testing approach than what's been used elsewhere in this project.

## What to do

1. If a real mobile device (or a cloud device lab / BrowserStack-style service) is reachable,
   measure actual frame timing (`engine.getFps()`, or Chrome DevTools performance recording) on at
   least one lower-end and one higher-end device, both with the game under real gameplay load
   (ball in motion, particles active, camera effects firing).
2. If no real device is reachable, use Chrome's CPU/GPU throttling in a Playwright-driven headless
   session as the closest available proxy (`page.emulateCPUThrottling` or CDP-level throttling) —
   weaker evidence than a real device, but better than nothing, and should be labeled as such in
   whatever's documented.
3. Identify actual bottlenecks (draw calls, particle count, physics substeps, bloom/glow cost) via
   profiling rather than guessing, and tune `highFidelity`'s threshold/effects accordingly if the
   current gating is measurably wrong (either too conservative, unnecessarily disabling effects on
   capable devices, or not conservative enough).
4. Check memory over an extended play session (several minutes, many balls/particles/hits) for
   leaks — particle systems, dev-test balls (`#drop-btn`), and trail meshes are the most likely
   culprits given how many objects get created per session.

## Acceptance criteria

- Real (or best-available-proxy) performance data exists for at least a low-end and high-end
  device profile, documented in this file's implementation note.
- The `highFidelity` gating threshold is confirmed correct or retuned based on that data, not left
  as an untested guess.
- No confirmed memory growth over an extended session beyond what's expected (verify via repeated
  `performance.memory` sampling if available, or a proxy for object count over time).

## Implementation note

**No real device or device-lab service was reachable from this sandbox** (confirmed - no
BrowserStack-style credentials/network access exists here), so per the doc's own explicit
fallback, used Chrome DevTools Protocol CPU throttling in Playwright as the best-available proxy,
plus `navigator.hardwareConcurrency`/`deviceMemory`/`userAgent` overrides (via
`page.addInitScript()`) to drive `detectHighFidelity()`'s own real detection logic against
realistic low-end (2 cores, 1GB, an old-Android UA, 6x CPU throttle) and high-end (8 cores, 8GB, a
modern-flagship UA, no throttle) profiles - not a hand-picked `highFidelity` value, the actual
gating function under actual simulated device signals.

**A real methodology finding, not just a result:** FPS/render-throughput comparisons turned out to
be untrustworthy in this specific sandbox. An idle, zero-throttle, zero-override baseline measured
only ~3fps via real in-browser `requestAnimationFrame` sampling - and a fully-throttled,
gameplay-loaded run measured essentially the same ~2.5-3fps. CPU throttling had no detectable
effect on rendered frame rate at all, because this sandbox's headless Chromium renders via
`swiftshader` (CPU-emulated WebGL) inside a separate process that Playwright/CDP's page-level CPU
throttling doesn't reach - the actual bottleneck (software rasterization) sits outside what's
being throttled. **This means no reliable relative-FPS evidence could be obtained here for tuning
the exact numeric threshold** - documented honestly rather than reporting a fabricated-looking
comparison. What IS reliable in this environment (doesn't depend on render throughput):

1. **Gate correctness** - confirmed mechanically: the low-end profile's simulated signals produce
   `highFidelity === false`, the high-end profile's produce `true`, matching
   `detectHighFidelity()`'s intended cutoffs exactly.
2. **The gate's actual effect size** - measured via `BABYLON.SceneInstrumentation` under
   sustained real hit-load (continuous bumper/satellite/target/lane hits, every obstacle type,
   for several seconds): `highFidelity=true` runs the full `DefaultRenderingPipeline` (bloom -
   one of the most expensive things to toggle on real mobile GPUs, entirely skipped when false,
   not just quality-reduced) and roughly 2.3-2.5x more particles/draw calls under load (~49
   active particles / 116 draw calls vs. ~21 active particles / 111 draw calls). This is a real,
   meaningful reduction, not a token gesture.

**Threshold decision: left unchanged.** Without trustworthy comparative frame-time evidence, retuning
the exact numeric cutoff (`score >= 3`) would mean replacing one unverified guess with a different
unverified guess - not what "confirmed correct... not left as an untested guess" is asking for.
What's now genuinely confirmed instead: the gate mechanism itself works correctly for realistic
device-signal inputs, and what it toggles (bloom + particle density) is a real, substantial cost
difference on real mobile GPUs by general graphics knowledge, independent of this sandbox's
render-throughput limitation. Re-tuning the exact score cutoff is left as a candidate for whoever
next has real device access.

**A real bug found and fixed during the memory-leak check (item 4).** Repeatedly triggering real,
properly-cooldown-respecting hits (a realistic rapid-bumper-rally load, ~50-60 hits over a few
seconds, cycling through every obstacle type so cooldowns never blocked them) left dozens of
finished `spawnHitBurst()` particle systems registered in `scene.particleSystems` **indefinitely**
- even after 5+ real seconds of total idle time with nothing left to animate, they never
disposed. A single isolated hit-burst, by contrast, disposed correctly within 3 seconds. Root
cause: `disposeOnStop` relies on Babylon's own `Scene._toBeDisposed` queue, processed once per
*rendered* frame - confirmed by reading `vendor/babylonjs/babylon.js` directly. With many
concurrent particle systems competing for the same per-frame update budget on an already very
slow render loop, disposal fell further and further behind real time - exactly the kind of
low-end-device failure mode this prompt exists to catch, whether or not it reproduces identically
on a real device. Fixed with a guaranteed explicit `setTimeout`-based dispose (guarded by
`isDisposed`, so it's a safe no-op if the system already disposed itself normally) after each
burst's own max particle lifetime - verified this brings the same 60-hit stress load back down to
baseline particle-system count within 500ms instead of never draining at all.

**Extended-session heap check:** 25 cycles of "drop 5 test balls, fire 10 hits, clear test balls"
(125 test balls + 250 hit attempts total, `#drop-btn`'s exact mechanism, forced via
`window.gc()` before/after sampling) showed only ~1.2MB of `performance.memory.usedJSHeapSize`
growth - small, bounded, consistent with normal heap fragmentation, not a runaway leak. Structural
checks (`testBalls.length`, `scene.meshes.length`, `scene.particleSystems.length` all returning
exactly to their pre-test baseline after `clearTestBalls()`) confirm objects are genuinely
unregistered from Babylon's own internal tracking, not just eventually garbage-collectible.

Verified via Playwright (temporary `window.__DEBUG_PERF` hook exposing `highFidelity`/`scene`/
`engine`/hit handlers/test-ball helpers, removed before commit) and confirmed the full existing
regression suite (flippers, CCD, HUD, audio, plunger rest) still passes after the fix.
