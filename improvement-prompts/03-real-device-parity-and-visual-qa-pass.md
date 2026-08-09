# Improvement 3 — Real feature-parity checklist and visual QA pass

## Context

`babylon-prompts/13-*.md` (item 1) asked for a feature-parity checklist built from the full
2D-game bug-fix history (`archive/release-prompts/01-14`) and manually verified against the 3D
build. It was never built — every stage before Stage 13 could only be verified via source-reading,
Node scripts, or a CDN-blocked failure-path test, since this sandbox couldn't run real Havok/WebGL
at all. Stage 13 changed that (self-hosted Babylon/Havok, real Playwright testing against a
running game) but ran out of scope before building the actual checklist — it only used the new
capability to chase the flipper bug it happened to stumble into.

This means large swaths of the game have **never actually been seen rendered or exercised**:
materials/lighting/glow (Stage 7), particle VFX (Stage 8), the 3D backglass (Stage 9), camera
juice and attract-mode (Stage 10), mobile touch controls (Stage 11 — desktop keyboard/mouse via
Playwright isn't the same as real touch events), and the menu/pause/controls/game-over screens
(Stage 12) have only had structural/DOM-shape checks, not real visual or interactive
verification. This is genuinely achievable now and is probably the single highest-value thing to
do next, since it might turn up real bugs the way the flipper investigation did.

## What to do

1. Build the actual checklist: go through `babylon-prompts/01-*.md` through `12-*.md` and
   `archive/release-prompts/01-14-*.md`, and list every distinct piece of intended behavior each
   one describes (this doesn't need to be exhaustive to the point of paralysis — focus on
   player-visible/player-affecting behavior, not internal implementation details).
2. For each item, verify it for real using Playwright against the running game (self-hosted
   vendor files + `swiftshader` launch flags — see `improvement-prompts/README.md`): screenshots
   for anything visual (materials, lighting, glow, particles, backglass legibility, menu/pause/
   game-over screen layout and content), keyboard+click simulation for interactive flows (pause/
   resume, menu dismiss, game-over restart, controls screen), and direct state assertions
   (`page.evaluate`) for anything not visible on screen (score/lives/stats tracking, high-score
   persistence across a reload, reduced-motion actually reducing camera shake/particle intensity —
   `page.emulateMedia({ reducedMotion: 'reduce' })`).
3. File every real discrepancy found as its own fix, in this same pass if small, or as a new
   `improvement-prompts/NN-*.md` if it's substantial enough to deserve its own scoped task.
4. Mobile touch controls specifically can't be fully verified via Playwright's desktop-context
   automation (no real multi-touch simulation) — note explicitly what was and wasn't covered, and
   flag real-device testing as still needed for that piece specifically.

## Acceptance criteria

- A written checklist exists (can live in this file's own "Implementation note" section) covering
  every stage's core intended behavior, each marked verified-working, verified-broken (with a
  filed fix), or explicitly out of reach of automated testing (mobile touch) with reasoning why.
- At least the visual stages (7-9) have real screenshot evidence attached or referenced, not just
  "assumed correct because the code looks right."
