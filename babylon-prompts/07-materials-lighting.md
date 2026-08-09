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
   from `../archive/release-prompts/09-*.md` could be reused/adapted here, or a new procedural approach
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

---

## Implementation note (2026-08-09)

**This stage is uniquely unverifiable in this sandbox, more than any prior one.** Every stage so
far had at least some objective signal available (Node-verified geometry, a pass/fail CCD test,
syntax checks). This stage's acceptance criteria are almost entirely subjective visual judgment
("reads as unmistakably SPIRITBALL," "looking meaningfully more impressive," "glow convincingly")
and this sandbox cannot render Babylon at all. Everything below is a well-reasoned first pass, not
a claim that it looks good - it needs the user's real device more than any previous stage did.

**A real bug found and fixed while implementing this stage's own requirements, not a separate
detour**: there was no actual playfield floor. Stages 2-6 built wall boundaries (Y=[0,
`WALL_HEIGHT_M`]) and a large fallback "debugFloor" 0.15m below everything, explicitly commented
as a safety net for an escaped ball, "not part of the official table geometry" - but nothing ever
filled that gap. Every ball has been resting 0.15m below where the flippers/bumpers/walls actually
sit, with no lateral containment at that depth (the walls don't extend down that far). This went
undetected because nothing built so far checks height: the CCD test only checks Z position, ball-
count/stuck-timer readouts don't check Y, and the fixed tilted-camera framing could plausibly hide
a 15cm vertical offset on a phone screen. Found it because this stage's own "playfield surface"
material requirement implied a floor mesh to material - there wasn't one. Added a real playfield
floor (`buildTable()`) at Y=0, sized to the table's active play area only (deliberately NOT
extending into the drain zone's Z range past `FLIPPER_Z_M`, so the drain mechanic from `06-*.md`
still works - the ball needs to keep falling once it clears the flippers).

**Materials**: `PBRMaterial` throughout, using `CONFIG.colors` from `../index.js` ported via a
`hexToColor3()` helper (not redesigned). Bumpers get their 4 distinct `bumper1-4` colors (not one
shared color, unlike Stages 4-6's placeholder); mission targets get 3 of the 7 `chakra` colors;
flippers get `CONFIG.colors.flipper` (already an exact hue match even before this stage). Added
one small extra beyond the doc's list: a torus ring around the satellite (`CONFIG.colors.
saturnRing`), matching its "Saturn" naming/fiction - purely decorative, no physics body, so it
doesn't double up satellite hit detection.

**Deliberate risk reductions, made explicitly rather than silently**:
- No environment/reflection texture for the "chrome" walls - PBR materials with `metallic=1` and
  no environment texture read as nearly black (metals have almost no diffuse response, only
  reflection), which would be worse than not using PBR at all if wrong. Used moderate metallic
  (0.6) with bright-enough albedo so walls stay visible under direct light alone, at the cost of
  looking less convincingly "chrome" without real reflections. Also avoided adding a second
  fragile CDN texture dependency on top of the one this whole project already has (Babylon/Havok
  itself).
- Skybox is a procedural starfield (a `DynamicTexture` with canvas-drawn dots, the same technique
  `BootScene.preload()` already uses for the 2D eyeball sprite) rather than loading an external
  image or adapting the existing `background.webp` - that asset was authored as a flat 2D portrait
  backdrop, not a projection suited to a 3D sphere, and re-authoring a proper equirectangular
  version wasn't worth doing sight-unseen.
- Ball uses a plain glowing emissive sphere (white + cyan, `CONFIG.colors.ball`/`eyeball`), not a
  painted eyeball texture - the doc explicitly allows this "if the eyeball detail doesn't read
  well at pinball-ball scale... judge by how it actually looks once placed," and there is no way
  to make that visual judgment call in this sandbox, so the simpler, lower-risk option was taken.

**Lighting/glow/bloom**: dim ambient `HemisphericLight` (0.35, down from the placeholder 0.9) plus
two `PointLight`s (near the flippers, near the far/re-entry-lane end) - deliberately not flat
scene-wide illumination, per the doc's "emissive materials and glow should carry most of the
visual energy." `GlowLayer` picks up every emissive material automatically. `DefaultRenderingPipeline`
bloom is gated behind a simplified boolean version of `PerformanceManager.detectPerformance()`
(ported faithfully, collapsed to one `detectHighFidelity()` boolean per the doc's own suggested
scope - full mobile tuning stays Stage 11's job). `pulseMesh()` (Stage 6) was extended to flash
emissive color to near-white in addition to its scale pulse, matching the doc's hit-reactivity
spec and the 2D version's `setTint(0xffffff)` flash. Re-entry lanes also now persistently recolor
to `CONFIG.colors.missionActive` green on hit (matching `hitReentryLane()`'s permanent
`setFillStyle()`, not just a brief pulse) - caught and fixed an ordering bug where doing the pulse
before the recolor would let the pulse's own restore-timeout silently clobber the new color back.

**A second top-level-BABYLON-reference bug, caught the same way as Stage 4's**: the first draft of
the new `COLOR_*` palette constants called `hexToColor3()` (which does `new BABYLON.Color3(...)`)
directly at top-level `const` evaluation - exactly the mistake documented as a lesson in `04-*.md`,
reintroduced by not rereading that lesson closely enough while writing new code. Caught via the
same headless-Chromium CDN-blocked-path test used for every other stage (it surfaced as a raw,
unguarded `ReferenceError` instead of the usual graceful error panel) rather than by inspection
this time - fixed by declaring the `COLOR_*` names as unassigned `let`s at top level and only
constructing the actual `Color3` objects inside `main()`, after the CDN-availability guard.

**Verified in this sandbox**: `node --check`; a grep-based sweep for other top-level
`BABYLON.`-referencing constants (only the pre-existing, already-safe `GRAVITY_VECTOR_FN` arrow
function matched); a Node script confirming the new playfield floor's dimensions/position line up
with the wall boundary and don't intrude into the drain zone; re-ran the CDN-blocked failure-path
check in headless Chromium (this is what caught the bug above).

**Not verified at all** (needs the real device, and more urgently than any prior stage): literally
everything about how this looks - materials, colors, glow, bloom, the skybox, lighting balance,
whether the ball is still readable against the glow, frame rate with all effects active. This
stage should be treated as a rough first pass to react to and iterate on, not a finished look.
