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
