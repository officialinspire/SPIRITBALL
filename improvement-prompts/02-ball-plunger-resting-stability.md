# Improvement 2 — Ball drifts off the plunger and falls within ~1 second of load

## Context

During Stage 13's testing pass, the main ball was observed drifting away from its spawn position
(resting on the plunger, `new BABYLON.Vector3(plunger.baseX, 0.03, plunger.baseZ)`) almost
immediately after load, then falling off the playfield entirely and landing on the debug
safety-net floor roughly 1 second later — with **zero player input**. Confirmed reproducible via
an A/B test against the pre-Stage-13 commit (`git stash` back to before that session's changes,
re-tested): identical behavior, so this is **not** a regression from the flipper physics rewrite —
it's a pre-existing issue, just never noticed because nothing before Stage 13 could run real
Havok physics in this sandbox to observe it.

Two working theories, neither confirmed:

1. A genuine resting-contact/friction precision issue specific to this sandbox's
   software-rendered (swiftshader) Havok build — real GPU-backed browsers might not reproduce this
   at all, in which case this could be a non-issue on actual devices and this prompt's real job is
   just confirming that.
2. A genuine gap in the plunger/playfield support geometry near the ball's spawn point - the
   plunger mesh might not actually provide a solid resting surface, or the ball's spawn position
   might not be precisely aligned with whatever surface is supposed to catch it (similar in spirit
   to Stage 7's "there was no playfield floor at all" bug, which also went undetected for several
   stages before being found).

## What to do

1. Reproduce first, via Playwright: load the game, dismiss the menu without launching (direct DOM
   manipulation of `#menu-overlay`, not `Space`, to avoid conflating this with launch mechanics),
   and sample the ball's position every ~150ms for a few seconds with zero input. Confirm the
   drift/fall is still reproducible in the current codebase before investigating further.
2. Inspect the actual geometry around the ball's spawn point: the plunger mesh's collision shape,
   its resting-contact restitution/friction values, and whether the ball's Y spawn position
   (`0.03`) is genuinely resting ON something solid or has any gap/overlap. Use a debug hook (like
   the temporary `window.__DEBUG_*` pattern from Stage 13's own flipper investigation) to read the
   ball's exact linear velocity moment-by-moment right after spawn — a real "why is it moving at
   all with zero forces applied besides gravity" investigation, not just symptom-patching.
3. Fix whatever's actually wrong (likely a geometry/alignment fix, possibly a friction/restitution
   tuning fix) rather than papering over it with a stronger anti-stuck kick or a position-reset
   timer.
4. If, after genuine investigation, this turns out to be specific to this sandbox's software
   renderer and doesn't reproduce on real hardware (test on an actual device if at all possible,
   or reason carefully about why software rendering specifically would cause this), document that
   clearly instead of chasing a phantom bug indefinitely.

## Acceptance criteria

- The ball rests stably on the plunger with zero drift for at least 10 seconds of real time with
  no input, verified via Playwright position sampling.
- The root cause (not just a symptom) is identified and documented, whether the fix was geometric,
  a physics-material tuning issue, or a confirmed sandbox-only artifact.

## Implementation note

Reproduced first (per step 1), confirming the bug was still present, then investigated via a
temporary `window.__DEBUG_MAIN_BALL`/`window.__DEBUG_PLUNGER` hook and direct mesh bounding-box
queries against the plunger, playfield floor, and launch-lane wall.

**Root cause, confirmed (theory 2 from this prompt's own context, not theory 1 - this is not a
sandbox-only artifact)**: `createPlunger()`'s own header comment used to read "Kinematic-animated
plunger mesh (**no physics body**...)" - the plunger has never had any collision shape at all,
purely a visual mesh. Meanwhile `GRAVITY_VECTOR_FN` (Stage 2's own deliberate "tilted gravity,
level geometry" design) gives gravity a real -Z component specifically so balls roll toward the
flipper end - genuinely correct, intended physics for actual gameplay. With nothing physically
blocking the ball at rest, that same intended tilt just kept accelerating the resting ball down
the table, unopposed, until it rolled off the playfield's floor bounds entirely and fell to the
debug safety net. A real pinball plunger has a mechanical stop the ball rests against; this one
didn't.

A second, smaller bug in the same area: the ball's spawn/reset position was hardcoded to
`plunger.baseZ` directly - the exact same Z coordinate the plunger mesh itself sits at. Once the
plunger gets real collision, spawning the ball at that identical position would put it dead center
inside the plunger's own solid geometry (the plunger cylinder, laid along Z, spans
`plunger.baseZ +/- 0.015`, well inside the ball's own 0.0135m radius from that same point) - a
guaranteed spawn-time overlap. A third, minor issue: the ball spawned at a hardcoded Y of `0.03`,
about 1.65cm above where it should actually rest (`BALL_DIAMETER_M / 2` above the playfield
floor's Y=0 top surface, per Stage 7's playfield-floor fix), so it fell that gap before ever
touching anything, however briefly.

**Fix**: `createPlunger()` now builds a real `PhysicsAggregate` on the plunger mesh
(`PhysicsShapeType.CYLINDER`, matching its own visual geometry) and switches it to
`PhysicsMotionType.ANIMATED` with `disablePreStep = false` - the exact same kinematic pattern
Stage 13 established for the flippers, for the same reason (a player/game-driven mechanism that
needs to physically interact with the ball, not be simulated by Havok itself). Decoupled the
ball's true rest position from the plunger's: a new `BALL_REST_Z_M` (`toWorldZ(BALL_REST_Z_PX)`,
the ball's own actual intended spot) replaces every `plunger.baseZ` reference used for the ball's
position, and `PLUNGER_REST_Z_M` (the offset between that spot and where the plunger itself sits)
was tightened from -0.02 to -0.035 - enough clearance (plunger half-length 0.015m + ball radius
0.0135m =~0.0285m minimum, plus a small margin) that the ball never spawns overlapping the
plunger's new collision volume, but close enough that it settles onto the plunger's tip almost
immediately under gravity rather than needing to spawn flush against it (spawning flush was the
exact failure mode the flipper investigation already found explosive - see
`babylon-prompts/13-*.md`'s implementation note). Also introduced `BALL_REST_Y_M`
(`BALL_DIAMETER_M / 2 + 0.002`) replacing the old hardcoded `0.03`, so the ball starts essentially
already resting on the floor instead of falling onto it first.

**Verified via Playwright**:
- Reproduction of the original bug, confirmed present before the fix (drifting from spawn to
  falling off the floor bounds within ~250ms in the worst observed case).
- Post-fix: the ball settles from its spawn position onto the plunger's tip within about 5-6
  seconds (a gentle creep, not a fast drop - rolling friction against the floor dominates the
  small residual gravity component over that short a distance, slower than a naive frictionless
  estimate would suggest, but not a bug), covering a total drift of ~8mm before stopping - then
  holds completely stable. Sampled every 500ms for a full 10 seconds post-settling: position
  unchanging, velocity reporting only numerical noise (0.00-0.03, never sustained).
- The actual launch mechanic (full charge-and-release, matching real player interaction) still
  works correctly with the plunger's new collision in place - the ball launches forward at the
  expected velocity and arcs back down under gravity exactly as before, no interference or
  blocking from the new plunger collision shape during the charge-pullback motion.
- No console warnings/errors introduced.
- Full regression pass (flipper rest/sweep angles, the tunneling-protection test, HUD/dev-panel
  gating) all unaffected.
