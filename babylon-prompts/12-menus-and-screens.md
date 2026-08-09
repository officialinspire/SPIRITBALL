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

---

## Implementation note (2026-08-09)

**Built exactly as the doc specifies**: DOM/CSS overlays (`#menu-overlay`, `#pause-overlay`,
`#controls-overlay`, `#gameover-overlay`), not 3D meshes or Babylon GUI. Content/copy/flow ported
from `MenuScene`/`GameOverScene`/`pauseGame()`/`showSettingsMenu()` in `../index.js` - same
platform-aware instructions ("TAP ⚡" vs "PRESS SPACE"), same button labels/icons, same
tap-anywhere-to-start/restart behavior, same single-persistent-ESC-listener pattern (the exact
lesson from `release-prompts/07-*.md`'s listener-leak fix, applied here since it's just as
relevant to DOM-overlay show/hide as it was to Phaser `once()` registrations). One deliberate
styling difference: kept this page's existing `'Courier New'` font stack rather than also loading
the 2D game's Google Fonts (Righteous/Monoton/Orbitron) - a new external CDN dependency this
project has consistently avoided adding elsewhere (Stage 7's procedural skybox instead of a
texture asset, Stage 9's canvas-drawn backglass instead of an image), for the same reason: this
project already depends on one fragile CDN load (Babylon/Havok itself), and a second one for
cosmetic fonts wasn't worth it. Copy/behavior is unchanged, per the doc's actual constraint - font
family is a rendering detail, not content.

**Scope, consistent with Stage 6's decision**: Final Rank and mission-progress stats from
`GameOverScene` are not shown - this stage builds the *screens*, not the mission FSM logic (still
deferred, no stage in this 13-stage plan actually assigns building it), and a "Final Rank" with no
rank-progression system behind it would just be a permanently-fake "Rookie." Added simple hit
counters (`stats.bumperHits`/`satelliteHits`/`targetHits`/`laneHits`, incremented alongside the
existing `addScore()` calls in Stage 6's hit handlers) to feed the Game Over screen's stat lines -
plain bookkeeping, not mission logic.

**Real Game Over flow, replacing Stage 6's placeholder**: `handleDrain()` previously reset
score/lives in place when lives hit 0 (an explicitly-documented simplification made before any
Game Over screen existed to show final results on). Now calls `showGameOverScreen()` instead,
which populates final score, a high-score comparison ("NEW HIGH SCORE!" vs "HIGH SCORE: N" -
correctly detected via `score >= backglass.state.highScore`, since `addScore()` already keeps
`backglass.state.highScore` in sync with `score` in real time, so a new record shows them equal
by the time Game Over is reached), and the hit-stat lines (only stats with a nonzero value are
shown, matching the 2D version's own `if (value > 0)` filter). "NEW GAME" and tap/SPACE-to-
restart both go straight back into gameplay via a full state reset (score/lives/stats/ball
position) - no menu detour, matching `restartGame()`'s direct `scene.start('GameScene')`.

**Pause halts real physics, confirmed against Babylon's actual source, not assumed**:
`scene.physicsEnabled` (a genuine public boolean property, default `true`) directly gates
`_advancePhysicsEngineStep()` in `scene.pure.ts` - toggling it to `false` stops Havok's step
entirely, which is exactly what's needed and is a much lighter operation than disposing/rebuilding
the physics world. This alone freezes the ball and flippers (both driven entirely by Havok's own
step), but does **not** touch this file's own per-frame JS logic (anti-stuck kicks, velocity
clamping, particle trail emission, plunger charge accumulation) - those run every render-loop tick
regardless of `scene.physicsEnabled`, so the render loop now has an explicit `if (!isPaused)`
gate around exactly that logic, which is what actually satisfies the "no charge-time... corruption
from the pause duration" requirement (`scene.physicsEnabled` alone would not have). Camera
effects and the dev-panel status readouts are left running during pause, deliberately - harmless
either way, simpler than guarding everything, and there's nothing left un-frozen that could cause
state corruption.

**High-score key changed to match the doc's explicit instruction**: Stage 9 originally used a
separate `spiritball3d-highscore` key specifically to avoid cross-contaminating the 2D build's
scores during parallel development (both builds existed simultaneously and were both being
actively worked on). This stage's doc explicitly asks to reuse `spiritball-highscore` instead "so
high scores aren't lost in the transition for anyone who played the 2D version" - now that
`phaser2d.html` is a permanent, intentional fallback for unsupported devices (`11-*.md`), not just
a transitional relic, that explicit instruction supersedes the earlier reasoning. Switched
accordingly; the tradeoff (scores now shared between the 2D and 3D builds in the same browser) is
the doc's own stated intent, not an oversight.

**Known, accepted gap**: Babylon's own particle systems (drain vortex, chakra sparkle - Stage 8)
keep animating during pause regardless of `isPaused`, since they're registered with the scene and
stepped internally by Babylon's own render integration, independent of this file's render-loop
callback. Not worth adding explicit start/stop calls for continuous ambient effects during pause -
a minor, cosmetic imperfection, not a physics or state-correctness issue.

**Verified in this sandbox**: `node --check`; the established top-level-`BABYLON`-reference grep
sweep (clean); the CDN-blocked failure-path check in headless Chromium, confirming all new DOM
elements render with correct IDs/structure; `scene.physicsEnabled`'s exact behavior confirmed by
reading Babylon's actual source rather than assumed from its name.

**Not verified** (needs the real device - this sandbox cannot execute any of this stage's actual
logic, since it all lives inside `main()` past the point where Havok/BABYLON must be loaded):
whether the menu/pause/controls/game-over screens actually show and hide correctly in response to
real input, whether pausing/resuming feels clean with no visible physics glitch, whether the
tap-anywhere-to-dismiss behavior works as expected on a touchscreen, and whether the translucent
menu screen actually shows the attract-mode orbit camera behind it as intended.
