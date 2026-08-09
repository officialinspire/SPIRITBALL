# Improvement 5 — Mission/rank progression system

## Context

Every stage since Stage 6 has explicitly deferred building the mission FSM (select a mission by
hitting its target, track progress, complete it, rank up) — Stage 6's implementation note says
it's "deeply tied to Phaser UI that doesn't exist in this build," Stage 12's note says "no stage
in this 13-stage plan actually assigns building it, only deferred to 'whenever real UI exists,'
which this stage's screens now do" (and then still didn't build it, since that wasn't Stage 12's
actual assigned scope either). Mission targets currently exist as solid colliders that score
points on hit (`meta.kind === 'target'` in the collision handler) but there's no overarching game
goal beyond survival and high score — no mission selection, no completion reward, no rank-up
camera beat (which Stage 10's camera-juice system was explicitly built to support and has never
been exercised), no "Final Rank" on the Game Over screen (present in the UI's stat-line filtering
logic as a deliberately-omitted item, per Stage 12's implementation note).

This is the single largest missing *feature* (as opposed to bug) in the current build, and the
one most responsible for the game feeling like "hit things for points" rather than a real pinball
game with a goal structure.

## Dependency

Read the 2D game's original mission system first, in `archive/KNOWN_ISSUES.md` and
`archive/release-prompts/03-flag-rotation-mission.md`/`05-mission-selection-default.md` — those
document the original design and at least one real bug found in it, worth not repeating.

## What to do

1. Design the FSM: mission states (e.g. idle/available → selected/in-progress → complete), how a
   target-hit selects a mission (the 2D game's original behavior, per the docs above), what
   "completing" a mission requires, and what happens on completion (score bonus, rank-up, a
   backglass message via `backglass.showMessage()`, a camera beat via the existing
   `triggerCameraPunch()`/`triggerCameraShake()` from Stage 10).
2. Track rank as real game state (not a fake permanent "Rookie" — Stage 12's implementation note
   explicitly called out that a fake unchanging rank would be worse than showing none, which is
   why it's currently omitted entirely).
3. Wire the backglass (`buildBackglass()`/`backglass.state`) to show current mission/rank info,
   matching how it already shows score/lives/high-score.
4. Add "Final Rank" to the Game Over screen's stat lines now that there's a real rank to show.
5. Verify via Playwright: drive a full mission-select-to-complete cycle via simulated target hits
   and confirm state transitions, backglass updates, and the completion camera/score effects all
   fire correctly.

## Acceptance criteria

- A player can select, progress, and complete at least one mission through real gameplay actions,
  with visible feedback at each step (backglass message, score bonus, camera beat).
- Rank is real, persistent game state that changes based on actual progression, not a static label.
- Game Over screen shows the player's final rank.
