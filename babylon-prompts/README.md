# Babylon.js 3D overhaul — staged implementation prompts

Read `../BABYLON_3D_OVERHAUL.md` first — it has the full vision, the architecture decision (full
3D physics rewrite via Havok, not just a visual re-skin), and verified technical foundations
(confirmed CDN URLs, init code, the iOS/Havok compatibility limit, the flipper-constraint API
note) that every stage below assumes.

**Unlike `../release-prompts/`, these are sequential, not independent.** Each stage builds
physically on the last — apply them in order. A fresh coding session can still be handed just one
stage file at a time (each is self-contained with its own context/goal/steps/acceptance
criteria), but it needs the *previous* stages to already be done, not just the master doc.

| # | File | Delivers |
|---|------|----------|
| 1 | `01-foundation-and-physics-spike.md` | Babylon engine + Havok scaffold, throwaway tilted-plane-and-ball spike to de-risk the pipeline. |
| 2 | `02-3d-table-and-camera.md` | Real-world-scale 3D table boundary, tilt convention, fixed pinball-cabinet camera. |
| 3 | `03-ball-physics.md` | 3D ball rigid body, anti-tunneling verification, anti-stuck logic. |
| 4 | `04-motorized-flippers.md` | Flippers as limited, motorized `Physics6DoFConstraint` hinges — the biggest feel-tuning stage. |
| 5 | `05-plunger.md` | 3D plunger charge/launch, power curve ported from the 2D revamp. |
| 6 | `06-bumpers-targets-lanes.md` | Every remaining table element wired to the existing (already-correct) mission/scoring logic. |
| 7 | `07-materials-lighting.md` | PBR materials, lighting, glow/bloom — the core "looks cooler" pass. |
| 8 | `08-particles-and-vfx.md` | Ball trail, drain vortex, hit bursts, chakra sparkle in 3D. |
| 9 | `09-backglass-display.md` | 3D-mounted dot-matrix score/message panel, matching the reference image. |
| 10 | `10-camera-and-juice.md` | Impact camera shake/flash, launch/mission/rank-up camera beats, menu attract-mode orbit. |
| 11 | `11-mobile-and-performance.md` | Reconnect existing DOM touch controls, handle Havok/iOS incompatibility honestly, device-tier perf gating. |
| 12 | `12-menus-and-screens.md` | Title/Game Over/pause/controls screens, rebuilt as DOM overlays (not 3D meshes). |
| 13 | `13-parity-qa-and-cleanup.md` | Full parity checklist, remove Phaser, resolve the CDN-for-production question. |

## Why this is such a big project

The user explicitly chose the higher-risk of two options presented: a full 3D *physics* rewrite
(Havok rigid bodies, motorized hinge-jointed flippers, real gravity vector on a tilted table)
rather than keeping the existing, already-tuned 2D Arcade Physics simulation and using Babylon.js
only as a renderer. That choice is the right call if the goal is a genuinely "real" 3D pinball
feel rather than a re-skinned 2D game — but it means almost none of the physics-dependent tuning
work already done (`../release-prompts/01-*.md`, `13-*.md`) transfers directly. Budget Stages 3-5
in particular as real, iterative feel-tuning work, not mechanical ports.

## What was and wasn't verified before writing these

Babylon.js/Havok documentation was checked directly (via GitHub-hosted docs, since
`doc.babylonjs.com` and the community forum were blocked by this environment's network policy)
before writing any code-shaped guidance, specifically to avoid handing off prompts full of
plausible-sounding but invented API names. Confirmed: the CDN URLs and Havok init pattern, the
iOS SIMD limitation, the "CDN not for production" guidance, and a working `Physics6DoFConstraint`
axis-limit example. **Not confirmed**: the exact method names for adding a *motor* to a
`Physics6DoFConstraint` axis (needed for the flippers in Stage 4) — that prompt says so explicitly
and instructs checking Babylon's current docs/playground at implementation time rather than
guessing. Treat any other Babylon/Havok API detail mentioned across these files as "the
documented intent, verify the exact current method name before writing code."
