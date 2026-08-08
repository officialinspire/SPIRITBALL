# Stage 7 — Materials, lighting, and the "make it cooler" visual identity

## Context
Everything up to this stage has been deliberately plain (placeholder boxes/spheres) so physics
could be validated without visual noise. This is the stage where SPIRITBALL's actual look gets
built - the whole point of switching to Babylon.js in the first place.

## Goal
Replace every placeholder mesh with a properly materialed, lit version carrying SPIRITBALL's
existing DMT/cosmic/chakra visual identity, elevated by real-time 3D lighting, PBR materials, and
postprocessing - aiming for the production-quality, glowing, dynamic feel the reference
screenshot's cabinet view has, in SPIRITBALL's own psychedelic palette rather than a generic
space theme.

## What to do
1. **Materials**, using `BABYLON.PBRMaterial` (or `StandardMaterial` where PBR is overkill, e.g.
   flat UI-adjacent elements):
   - Chrome/metal rails and walls: high-metallic, low-roughness PBR material with an environment
     reflection texture, matching the reference image's chrome table edges.
   - Chakra targets, fuel lights, mission targets: emissive, glass-or-crystal-like material
     (moderate transparency + strong emissive glow in each chakra's color from
     `CONFIG.colors.chakra` in `../index.js`) rather than flat-colored geometry.
   - Bumpers/obstacles: match the existing per-obstacle color identity (cosmic crystal cyan,
     asteroid brown/rock, energy-vortex magenta/purple, comet orange) as emissive-accented PBR
     materials instead of flat sprites.
   - Ball: keep the "cosmic eyeball" identity (white sclera, cyan iris, dark pupil) - either as a
     material with a procedurally-drawn texture (a `DynamicTexture` painted with the same 2D-
     canvas-drawing technique `BootScene.preload()` already uses for the eyeball sprite, just
     applied to a sphere UV-mapped material instead of a flat sprite) or a simpler glowing
     emissive sphere if the eyeball detail doesn't read well at pinball-ball scale from the
     camera distance - judge by how it actually looks once placed.
   - Playfield surface: a subtly reflective, dark material (not a mirror-flat reflection, which
     would look unnatural for a cabinet playfield - more of a glossy varnished-wood/glass
     highlight response) using an environment texture or reflection probe.
2. **Lighting rig**: a soft `HemisphericLight` for ambient fill, plus a small number of point
   lights at key table features (near the flippers, near the drain/backglass area) for definition
   - avoid over-lighting; the emissive materials and glow layer should carry most of the visual
     energy, matching the reference image's mostly-dark cabinet interior lit by its own glowing
     elements rather than flat scene-wide illumination.
   - Add pulse/flash reactivity: when a bumper/target is hit (Stage 6's collision callbacks),
     briefly intensify a nearby point light or the object's emissive color, mirroring the flash-
     tint feedback the 2D version already does in `hitAttackBumper()` etc.
3. **Postprocessing**: `BABYLON.GlowLayer` on emissive materials (chakras, bumpers, ball trail
   once it exists in Stage 8), plus a `DefaultRenderingPipeline` with bloom enabled and tuned to
   taste - this is likely the single highest-impact change for "looking cooler," since it's what
   makes emissive neon materials actually read as glowing rather than just brightly colored.
4. **Skybox/backdrop**: replace the flat background with either a procedural starfield/nebula
   skybox or a large backdrop plane using a cosmic texture (the existing `background.webp` asset
   from `../release-prompts/09-*.md` could be reused/adapted here, or a new procedural approach
   built directly in Babylon).
5. Performance-gate the heavier effects (glow layer, bloom, reflection probes) behind the device-
   tier detection already established in `../index.js`'s `PerformanceManager` - port that concept
   forward so low-tier mobile devices get a reduced-fidelity version rather than an unplayable
   frame rate. (Full mobile performance tuning is Stage 11's job; just make sure this stage's
   effects are structured so they *can* be gated, e.g. behind a single "high fidelity" boolean
   rather than hardcoded on.)

## Constraints
- Keep the color identity consistent with the existing game (`CONFIG.colors` in `../index.js`) -
  this is a visual upgrade of SPIRITBALL's existing theme, not a redesign of it.
- Don't let postprocessing/glow intensity wash out gameplay readability - the ball and active
  flippers need to stay clearly visible against the glow.

## Acceptance criteria
- The scene reads as unmistakably SPIRITBALL (DMT/cosmic/chakra palette and iconography), not a
  generic sci-fi pinball table, while looking meaningfully more impressive than the flat 2D canvas
  version - side-by-side, this should be an obvious visual upgrade.
- Emissive elements (chakras, bumpers, ball trail once present) glow convincingly via the glow
  layer/bloom rather than just appearing as flat bright colors.
- Frame rate stays reasonable on a mid-tier device with all these effects active - if bloom/glow
  meaningfully tanks performance, gate it behind the device-tier check rather than shipping it
  unconditionally.
