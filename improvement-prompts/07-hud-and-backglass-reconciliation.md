# Improvement 7 — Reconcile the player HUD and the 3D backglass (both show score)

## Context

Two separate score displays now exist: the DOM `#player-hud` (added in the Phaser-removal/cleanup
pass, since the dev panel was previously the *only* place score/lives ever showed to a real
player - not acceptable) and the existing 3D-mounted backglass panel from Stage 9
(`buildBackglass()`, a `DynamicTexture`-driven plane showing score, high score, lives, and
transient messages, positioned in-scene as part of the cabinet). A screenshot taken while
verifying the HUD change showed both visible at once, near each other, both saying "SCORE 0" -
functionally fine, but visually redundant and not deliberately designed as a pair.

## What to do

1. Decide the actual division of labor between the two, deliberately - options include (pick one,
   don't half-do both):
   - The DOM HUD becomes minimal (lives + pause button only, or even just a pause button), and the
     backglass is the sole score/high-score display, matching how a real pinball cabinet's
     backglass is the primary score display.
   - The DOM HUD stays as the primary always-visible readout (better for players who aren't
     looking at the exact backglass angle/distance on a small mobile screen), and the backglass's
     score text is removed or made secondary (kept for messages/mission info instead, once
     `05-mission-fsm-and-rank-system.md` exists).
   - Reposition one so they're not visually adjacent/competing, if keeping both showing score is
     intentional (e.g. backglass score is the "real" in-fiction display, DOM HUD is a lives-only
     accessibility aid).
2. Whatever's chosen, update `setScore()`/`setLives()` in `babylon-game.js` and/or
   `backglass.state` updates accordingly, and adjust `index.html`'s `#player-hud` markup/CSS if
   its content changes.
3. Verify via Playwright screenshot (mobile viewport, matching the one taken during the original
   cleanup pass) that the result reads as a single coherent design, not two competing HUDs.

## Acceptance criteria

- A single screenshot of the running game (mobile viewport) shows a deliberate, non-redundant
  relationship between the DOM HUD and the backglass — not two elements both saying "SCORE 0"
  right next to each other with no explanation.

## Implementation note

**Decision.** Went with the doc's option B: the DOM `#player-hud` stays the primary, always-
guaranteed-legible readout (Score + Lives, unchanged - this is exactly why it was built in the
first place, per its own existing comment, and that reasoning still holds regardless of camera
angle/device). The backglass's plain `SCORE`/`BALLS` lines were removed entirely - it now shows
only what the DOM HUD doesn't: the high score to beat (promoted to the headline number, since
that's the one score-related fact worth featuring on the cabinet), current rank, active mission
name/progress (both from `improvement-prompts/05-*.md`, which now exists - this option was
explicitly blocked on that prompt landing first), and transient hit messages. The two displays now
show genuinely non-overlapping information instead of two "SCORE 0"s standing next to each other.

**Cleanup.** `backglass.state.score` and `backglass.state.lives` were dead state once `redraw()`
stopped drawing them (nothing else read them), so both fields and their write sites in
`addScore()`, `handleDrain()`, and `startNewGame()` were removed rather than left as unused
plumbing. `backglass.state.highScore` is unaffected - still tracked and drawn, just bigger/
featured now. Updated `#player-hud`'s own comment in `index.html` to document the deliberate
division of labor, since the old comment only explained the HUD's original reason for existing,
not how it now relates to the backglass.

**Verification (Playwright, mobile viewport 390x844, real iOS 17.4 UA to clear the device-tier
gate).**
- `hud-01-mobile-screenshot.js` - before-launch and post-launch gameplay screenshots: DOM HUD
  shows `SCORE 0` / `LIVES 3` top-right; backglass shows `HIGH SCORE 0` / `RANK: Cadet`, no score
  duplication anywhere on screen. Zero console/page errors.
- `hud-02-mission-active-screenshot.js` - drove a real mission-target hit (via the existing
  `handleTriggerHit()`, exposed through a temporary debug hook removed before commit) to confirm
  the mission-active state renders correctly: DOM HUD shows `SCORE 750`; backglass shows
  `HIGH SCORE 750` / `RANK: Cadet` / `MISSION: BUMPER RUN 0/3`, plus the transient
  `MISSION: BUMPER RUN` selection message - all legible, no layout overlap.
- `hud-03-drain-newgame-check.js` - confirmed score/lives still update and reset correctly end to
  end (a scoring hit, then New Game resetting both back to 0/3 on the DOM HUD) now that the dead
  `backglass.state.score`/`.lives` writes are gone.
- Full existing regression suite re-run (`flipper-test.js`, `ccd-test2.js`, `hud-check.js`,
  `audio-01-noerrors.js`, a 10s plunger-rest recheck): all pass, zero errors.
- Temporary `window.__DEBUG_HUD` hook removed before commit (`grep -n "__DEBUG_"` returns
  nothing).
