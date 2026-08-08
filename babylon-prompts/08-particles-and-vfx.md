# Stage 8 — Particle effects and VFX

## Context
Ports the 2D particle effects from `../index.js` (`setupParticles()`, the drain vortex, the
various hit-burst effects created inline in the `hit*()` methods) to Babylon's particle systems,
now that materials/lighting/glow (`07-*.md`) and the physical/trigger bodies that drive these
effects (`06-*.md`) both exist.

## Goal
Ball trail, drain vortex swirl, per-hit burst effects, and chakra sparkle, all in 3D, feeding
into the glow layer from Stage 7 for a cohesive, energetic look.

## What to do
1. **Ball trail**: a `BABYLON.ParticleSystem` (or `GPUParticleSystem` if device-tier allows,
   gated the same way as Stage 7's heavier effects) emitting from the ball's current position
   every frame, short lifespan, additive blending, tinted to match the ball's cyan identity -
   direct port of the existing `ballTrail` emitter's intent from `setupParticles()`.
2. **Drain vortex**: particles swirling into the drain trigger volume from `06-*.md`, matching
   the purple/black "black hole" feel of the current `drainParticles` emitter.
3. **Hit-burst effects**: a short particle burst at each bumper/obstacle/target hit, color-matched
   per element (reusing the same per-obstacle color identity from `07-*.md`'s materials pass),
   triggered from the same collision callbacks Stage 6 wired up.
4. **Chakra sparkle**: an ambient, low-intensity particle effect around each lit/active chakra
   target for extra visual interest beyond the static glow material from Stage 7.
5. Respect the reduced-motion accessibility hook: port the intent of
   `../release-prompts/12-accessibility-pass.md`'s `window.SPIRITBALL_reducedMotion` flag - skip
   or significantly reduce non-essential decorative particle effects (ambient sparkle, drain
   swirl intensity) when it's set, while keeping essential feedback (hit bursts that confirm a
   collision registered) intact, same principle as the original pass applied to camera
   shake/flash and ambient tweens.
6. Performance-gate particle counts/systems by device tier, same mechanism as Stage 7.

## Constraints
- Don't let particle density become so heavy it obscures the ball or gameplay-relevant elements -
  these are meant to read as energy/atmosphere, not visual clutter that hides what's happening.
- Reuse the device-tier gating and reduced-motion flag patterns already established rather than
  inventing new ones - consistency matters more than novelty here.

## Acceptance criteria
- Ball trail is visible and reads clearly as "the ball is moving fast" without obscuring the ball
  itself.
- Drain vortex and hit-burst effects are visually distinct from each other and from the ambient
  chakra sparkle - a player should be able to tell what just happened from the VFX alone.
- With reduced-motion enabled, decorative ambient effects are visibly reduced or absent while hit
  feedback remains.
- No noticeable frame rate drop attributable to particle systems on a mid-tier device with the
  full effect set active; low-tier devices get a reduced particle budget rather than an
  unplayable frame rate.
