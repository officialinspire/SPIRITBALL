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

---

## Implementation note (2026-08-09)

**Honesty check against the actual 2D codebase first**: grepped `../index.js` for every
`add.particles()` call before assuming the doc's framing was accurate. `setupParticles()` really
does have a direct `ballTrail` (follows the ball, cyan, additive, 400ms lifespan) and
`drainParticles` (purple/black/indigo, always-running ambient emitter at the drain, not event-
triggered) - both ported faithfully below. But there is no per-hit burst system and no chakra-
sparkle system anywhere in the 2D game; hit feedback there is entirely tween/tint-based (already
ported as the scale/emissive pulse in `07-*.md`). Built those two fresh to match the doc's intent,
documented as new rather than claimed as ports.

**Shared texture, no new asset**: one `DynamicTexture` (a canvas-drawn radial gradient dot),
tinted per-system via `color1`/`color2`, reused across all five particle systems - same self-
contained-asset principle as Stage 7's procedural starfield, avoiding a second fragile CDN
dependency for a dedicated particle sprite image.

**Ball trail**: emitter attached directly to the ball mesh (`ParticleSystem.emitter = mesh`
follows it automatically every frame, matching Phaser's `follow: this.ball`). Deliberately does
NOT use a constant emit rate like the 2D version's fixed `frequency: 25` - instead
`updateBallTrail()` (called from the render loop) scales `emitRate` continuously from the ball's
actual current speed (0 near the stuck-speed threshold, full rate at `MAX_BALL_SPEED_MS`), a small
improvement on the 2D behavior aimed directly at this stage's own acceptance criterion ("reads
clearly as *the ball is moving fast*").

**Drain vortex**: continuous ambient emitter, always running for the whole game like the 2D
version (not event-triggered). Two simplifications from the literal 2D effect, made explicitly:
Babylon's core `ParticleSystem` interpolates a single `color1`->`color2` range per particle rather
than randomly picking from a discrete tint array the way Phaser's `tint: [0x9400D3, 0x000000,
0x4B0082]` does - approximated with purple->indigo interpolation fading to transparent black.  A
true inward spiral needs a custom per-particle update function; approximated instead with a
downward/inward direction cone ("falling into a void"), reasonable for a first pass in a stage
that can't be visually checked either way.

**Hit bursts**: one-shot `manualEmitCount` + `disposeOnStop` pattern (standard, long-stable
Babylon API - start() then immediately stop() with a manual count emits exactly N particles once
and self-disposes when they finish dying, no pooling needed at pinball hit frequencies). Color is
read directly from the hit mesh's *current* material color rather than a separately-tracked
lookup table, so it automatically matches e.g. a re-entry lane's persistent lit-green recolor
(`07-*.md`) without needing to duplicate that state. Found and fixed one ordering issue before
testing: for re-entry lanes, the burst must spawn *after* the persistent recolor, not before, or
it captures the stale unlit color.

**Reduced-motion**: `window.SPIRITBALL_reducedMotion` is re-declared at the top of this file
(same detection line as the bottom of `../index.js`) rather than assumed inherited - `index.html`
no longer loads `index.js` at all (see `13-*.md`), so there is no shared `window` state to read
from a page that isn't loaded. Chakra sparkle is fully skipped when set (purely decorative, no
gameplay-feedback role); the drain vortex is reduced to 25% rate rather than fully removed (the
doc says "skip *or* significantly reduce," and full removal felt like too much - the drain zone
should still read as *something*); hit bursts are unaffected by reduced-motion at all per the
doc's explicit carve-out for feedback that "confirms a collision registered," though their
particle *count* still scales down on low-tier devices (a performance gate, not a motion gate -
deliberately kept as two separate, independently-toggleable conditions rather than one).

**Device-tier gating**: reuses `detectHighFidelity()` from `07-*.md` (already computed once in
`main()`), not a new mechanism - every system's particle capacity/count/rate has a high/low-tier
pair.

**Verified in this sandbox**: `node --check`; the same top-level-`BABYLON`-reference grep sweep
used since Stage 7's bug (clean); a Node script confirming the drain vortex emitter position sits
between the flipper line and the drain zone's center, not inside a wall or past the debug floor;
re-ran the CDN-blocked failure-path check in headless Chromium.

**Not verified** (needs the real device, same as Stage 7): whether any of this actually looks
good - particle density, whether the ball trail obscures the ball, whether the drain vortex and
hit bursts and chakra sparkle read as visually distinct from each other, whether reduced-motion
is honored correctly on a device that actually has that OS setting on, and frame rate with the
full particle set active alongside Stage 7's glow/bloom.
