# Stage 12 — Menu, Game Over, pause, and settings screens

## Context
The current Phaser version implements its title screen, game-over stats screen, pause menu, and
controls-reference screen (`MenuScene`, `GameOverScene`, `pauseGame()`/`showSettingsMenu()` in
`../index.js`) as in-canvas Phaser text/rectangles. None of that exists yet in the Babylon
version - Stages 1-11 have been entirely about the gameplay scene itself.

## Goal
All the non-gameplay screens rebuilt against the new engine, preserving their content and
behavior (high score display, platform-aware instructions, final-run stats, pause/resume,
controls reference) from the already-correct 2D versions.

## What to do
1. **Build these as DOM/CSS overlays, not 3D meshes or Babylon GUI**, deliberately mirroring the
   decision already made for mobile touch controls (`release-prompts/14-*.md`): these are
   text-heavy, infrequently-changing, accessibility-sensitive screens, and HTML/CSS remains easier
   to get right (font rendering, focus states, screen-reader friendliness) than recreating a text
   layout system in a 3D scene. Reserve the 3D-mounted-panel treatment for the in-gameplay
   backglass (`09-*.md`), which earns its 3D-ness by being part of the cabinet's visual identity
   during play - these menu screens don't need that treatment to look good.
2. **Title/menu screen**: port `MenuScene`'s content (title, tagline, high score from
   `localStorage`, platform-aware "press SPACE" vs "tap to start" instructions) to a DOM overlay
   shown before gameplay starts, with the idle attract-mode camera from `10-*.md` visible behind
   it through the canvas.
3. **Game Over screen**: port `GameOverScene`'s content (final score, high score comparison, final
   rank, mission/bumper/satellite/lane stats from `release-prompts/06-game-over-stats.md`) to a
   DOM overlay shown when a run ends.
4. **Pause menu / Controls reference**: port `pauseGame()`'s resume/new-game/controls-reference
   flow and the controls-reference content from `release-prompts/04-audio-system-or-remove-toggle.md`
   (which already replaced the old non-functional sound/music toggle with a real controls
   reference - keep that decision, just re-render it as DOM instead of in-canvas text) and the
   listener-leak-safe pause/resume input handling from `release-prompts/07-pause-menu-listener-leak.md`
   - the *lesson* from that fix (single persistent listeners, not per-open `once()` registrations)
   applies just as much to whatever new input wiring drives DOM-overlay show/hide here.
5. Ensure pausing correctly halts the Havok physics simulation (Babylon's physics step needs an
   explicit pause/resume equivalent to the old `this.physics.pause()`/`this.physics.resume()`
   calls - check the current API) and that the plunger charge-accumulation from `05-*.md` remains
   pause-safe (delta-based accumulation only advances when the render/physics loop is actually
   ticking, same reasoning as the original pause-safety fix).

## Constraints
- Preserve existing content and behavior from the screens being ported - this is a rendering-
  target change (Phaser canvas text → DOM), not a content or flow redesign.
- Reuse `localStorage` keys as-is (`spiritball-highscore`) so high scores aren't lost in the
  transition for anyone who played the 2D version in the same browser.

## Acceptance criteria
- Title, Game Over, pause, and controls-reference screens all show correct, live content matching
  their 2D counterparts.
- Pausing during gameplay actually halts ball/flipper physics (not just visually freezing) and
  resuming continues cleanly with no charge-time or physics-state corruption from the pause
  duration.
- High scores persist correctly across sessions via the same `localStorage` key the 2D version
  used.
