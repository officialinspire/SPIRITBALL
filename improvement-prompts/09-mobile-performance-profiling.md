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
