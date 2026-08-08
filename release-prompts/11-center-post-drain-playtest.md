# Playtest pass: center post / flipper-gap ball-trap risk

## Context
This one is a **playtesting task, not a pure code-read fix** — it should be done *after*
`release-prompts/01-flipper-collision-physics.md` lands, since fixing the flipper hitboxes will
change how the ball behaves in this exact area. See `KNOWN_ISSUES.md` item 11.

## Problem
`setupTable()` in `index.js` places a static `centerPost` circle collider at
`(CONFIG.width / 2, CONFIG.height - 60)` — i.e. directly in the ~40px gap between the left and
right flippers (flippers are centered at `width/2 ± 80` with a 120px-wide body each, leaving a
gap roughly `x: 250–290` at `y: height-80`, with the post sitting just below/behind that gap at
`y: height-60`).

Separately, the "drain" isn't a true open gap the ball falls through — `checkDrain()` only fires
when the ball overlaps `drainZone` (a rectangle just below the world's bottom bound), and the
ball can't actually leave the world bounds (`collideWorldBounds: true` on the ball body). So in
practice, a ball that gets between the flippers rests against the (invisible) bottom wall and
that overlap is what counts as "drained" — there's no literal open chute there.

The generic wall collider callback in `setupCollisions()` (which `centerPost` is included in,
via `this.walls.push(centerPost)`) does apply a minimum-velocity nudge on contact, which should
prevent a fully frozen ball, but it's unclear from reading the code alone whether the ball can
get caught oscillating between the post, the flipper bases, and the wall without ever cleanly
reaching either a flipper hit or the drain overlap — that requires actually running the game.

## What to do
1. Run the game locally (open `index.html` in a browser, or serve the directory with any static
   file server) after the flipper fix from prompt 01 has landed.
2. Deliberately try to get the ball into the center gap between the flippers at low speed
   (e.g. let it roll down the middle without flipping) repeatedly, on both a desktop browser and
   a touch/mobile viewport (browser devtools device emulation is fine if a real device isn't
   available). Watch specifically for: the ball oscillating in place for several seconds, the
   ball passing through the post/flipper visually without proper collision, or the ball taking an
   unreasonably long time to either get flipped back into play or drain.
3. If a genuine trap/stuck state is reproducible:
   - Consider widening the gap slightly, shrinking/repositioning the post, or tuning
     `checkBallStuck()`'s nudge strength/threshold (currently nudges `velocityY += 100` whenever
     speed `< 50`) so a trapped ball reliably resolves within a second or two.
   - Alternatively, treat the region directly beneath the flipper gap as an implicit drain (e.g.
     extend/reshape `drainZone`, or add a small dedicated trigger there) so a ball that gets past
     both flippers drains promptly and cleanly, matching real pinball behavior, rather than
     lingering against the invisible floor.
4. If no genuine trap is reproducible after reasonable testing, close this out by adding a short
   note to `KNOWN_ISSUES.md` confirming it was tested and is not an issue in practice, so it
   doesn't get re-flagged by a future review.

## Constraints
- This is verification/tuning work, not a rewrite — keep any changes small and targeted
  (post position/size, drain zone shape, or `checkBallStuck()` constants).

## Acceptance criteria
- A written note (in this file's PR description, commit message, or an update to
  `KNOWN_ISSUES.md`) stating what was tested, what was observed, and what (if anything) was
  changed as a result.
- If a fix was made, confirm the ball still reaches the drain reliably in the normal case (missed
  flip → drains within a couple seconds) and that flipper collisions near the post still behave
  correctly.

---

## Implementation note (2026-08-08) — analysis only, not a live playtest
Could not run this in an actual browser: this sandbox's outbound network policy blocks
`cdn.jsdelivr.net` (confirmed via `curl "$HTTPS_PROXY/__agentproxy/status"`, which reports
`connect_rejected` / gateway 403 for that host, including when routing through the proxy with
`--ignore-certificate-errors`), and Phaser is loaded exclusively from that CDN, so the game
cannot initialize in this environment. Rather than fabricate a "played and confirmed fine"
result, did the next best thing: a precise geometric analysis using the actual current
coordinates in the code (after the item-1 flipper fix, since that changes this exact area).

**Numbers used:** `centerPost` center `(270, 900)`, radius `8` (`setupTable()`). `leftFlipper`
center `(190, 880)`, `rightFlipper` center `(350, 880)`, both now circular colliders of radius
`62` (`setupFlippers()`, post-fix-1). Ball radius `20` (diameter `40`).

**Finding:** distance from either flipper's center to the post's center is
`sqrt(80² + 20²) ≈ 82.5px`. Subtracting the two radii (`62 + 8 = 70`) leaves **~12.5px of actual
clearance** between the post and each flipper's collider — far too narrow for a 40px-diameter
ball to pass through. This means a direct center-line drain (rolling straight down between both
flippers) is **geometrically impossible** in the current layout; the post fully blocks it. This
isn't a regression from the item-1 fix — the old rectangular flipper hitbox left a very similar
~12px gap to the post, so this was already true before this session's changes.

**Is this a problem?** Not obviously. All drains still work correctly through the outlanes (a
ball resting against the left/right wall has its center at x≈50/490 — exactly inside the outlane
trigger zone — with no collider blocking its path down to the drain zone, verified by the same
coordinate check). The practical effect is just that this game variant has no "center drain"
outcome, only outlane drains, which is arguably more forgiving, not broken. Given the existing
ball-bounce coefficient (0.75), drag, and the generic minimum-velocity wall-nudge (which already
applies to `centerPost` as a member of `this.walls`), a permanent frozen-ball state seems unlikely
from this analysis, but that is a judgment call, not an observation from actual play.

**Recommendation:** treat this item as reviewed-but-open. Before shipping, do a real playtest
(desktop and a touch device) specifically trying to send the ball down the center gap at various
speeds/angles, watching for multi-second oscillation or a ball that never resolves. `KNOWN_ISSUES.md`
item 11 has been updated to ⚠️ REVIEWED rather than ✅ FIXED to reflect this honestly.
