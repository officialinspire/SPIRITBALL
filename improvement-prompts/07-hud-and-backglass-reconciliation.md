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
