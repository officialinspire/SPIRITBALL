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

## Implementation note

**Design.** A `mission` state object (`{ state: 'idle'|'active', selectedIndex, progress,
required, rank }`) drives the FSM. Each of the 3 mission-target meshes (`MISSION_TARGET_BANK`,
already existing since Stage 4) maps 1:1 to a `MISSION_DEFS` entry with a distinct scoring
category (`bumper`/`satellite`/`lane`) and a display name (`BUMPER RUN`/`SATELLITE SWEEP`/
`RE-ENTRY CIRCUIT`). One deliberate simplification versus the 2D original: hitting a mission
target both **selects and starts** the mission in one action, instead of select-then-hit-the-
launch-ramp — this 3D rebuild never got a launch-ramp object (that whole mechanic doesn't exist
here), so replicating a two-step flow around an object that isn't there would be worse than a
clean one-step version. Progress only accrues from the *active* mission's own matched type
(`progressMission(type)`, called from the existing bumper/satellite/reentryLane hit handlers) -
hitting an unrelated obstacle never contributes, so completion always requires deliberate,
sustained play toward what was selected, not incidental side-effect scoring (the exact bug
`archive/release-prompts/03-flag-rotation-mission.md` documented and fixed in the 2D game).
Required-hit count scales with rank (`3 + rank`), so later missions take more effort.

**Rank.** Ported the classic *3D Pinball for Windows – Space Cadet* rank ladder (Cadet -> Ensign
-> Lieutenant JG -> Lieutenant -> Lt. Commander -> Commander -> Captain -> Commodore -> Admiral ->
Fleet Admiral) as `RANK_NAMES` - the same ladder `archive/KNOWN_ISSUES.md` item 3 references
("LT Commander -> Fleet Admiral" at ranks 4-8), and thematically consistent with this table's own
"authentic Space-Cadet-inspired" layout (Stage 4's implementation note). Completing a mission
advances rank by one (capped at Fleet Admiral) and is per-run state - like score/lives/stats, it
resets to Cadet on `startNewGame()`, not a permanent meta-progression across games.

**Completion reward.** `completeMission()` awards a `MISSION_COMPLETE_BONUS` (5000, via the
existing `addScore()`), shows a `RANK UP: <name>` backglass message, fires a stronger-than-usual
camera beat (`triggerCameraShake(500, 0.01)` + `triggerCameraPunch(500, ...)` - deliberately more
intense than any single-hit effect, since this is the biggest moment the game currently has), and
plays a new ascending-arpeggio `playRankUpSound()` (the mirror-image of the existing descending
`playGameOverSound()`).

**Backglass wiring.** `buildBackglass()`'s `state` gained `rank`/`missionName`/`missionProgress`/
`missionRequired` fields; `redraw()` now draws a `RANK: <name>` line always, plus a
`MISSION: <name> N/M` line only while a mission is active - matching how score/high-score/lives
already render there (per the doc's explicit instruction to wire the backglass, not build new UI
surfaces for this).

**Game Over screen.** Added a `FINAL RANK: <name>` line (new `#gameover-rank-line` element,
reusing the existing `.highscore-line` style) and a `Missions Completed` stat line to the existing
conditional stat-line list. Both were explicitly *not* shown as of Stage 12 - its implementation
note called out that a fake, unchanging "Rookie" label would be worse than omitting rank entirely;
now that real progression exists, both show genuine per-run values.

**Verification (Playwright, headless Chromium, real gameplay actions, not fake state
injection):** a temporary `window.__DEBUG_MISSION` hook exposed the real closures
(`mission`/`stats`/`backglass`/`scene`/`handlePhysicalHit`/`handleTriggerHit`/`handleDrain`/
`showGameOverScreen`) so tests could drive the actual production functions against the actual
scene meshes (`scene.getMeshByName('missionTarget0')`, `'bumper0'`, `'satellite'`), not a
simulation of them - removed before commit (`grep -n "__DEBUG_"` returns nothing).
- `mission-01-full-cycle.js` - real launch, then: idle state confirmed (`Cadet`, no mission);
  hitting `missionTarget0` selects+starts the bumper mission (`required: 3`); 3 real
  `handlePhysicalHit(bumper0)` calls (respecting `COOLDOWN_BUMPER_MS`) complete it, advancing rank
  to `Ensign` and `missionsCompleted` to 1; selecting+completing a second mission (satellite,
  `required: 4` at the new rank) advances rank again to `Lieutenant JG`; hitting a *different*
  mission target while one is already active does **not** change `selectedIndex` (confirms no
  accidental reselect/interrupt).
- `mission-02-gameover-rank.js` - completes one mission for real (rank -> `Ensign`), then calls
  the real `showGameOverScreen()` and confirms the DOM shows `FINAL RANK: Ensign` and
  `Missions Completed: 1` in the stats list - the earned rank genuinely reaches the screen, not
  just the internal state.
- `mission-03-newgame-reset.js` - completes a mission (rank -> `Ensign`), triggers **New Game**
  via the real pause-menu button, confirms rank resets to `Cadet`, `mission.state` resets to
  `idle`, and `missionsCompleted`/`score` reset to 0 - rank is real per-run state, not a value
  that leaks across games.
- Full existing regression suite re-run after these changes (`flipper-test.js`, `ccd-test2.js`,
  `hud-check.js`, `audio-01-noerrors.js`, `audio-02-play.js`, a 10s plunger-rest recheck): all
  pass, zero console/page errors - the mission FSM adds no side effects to physics, audio, or
  existing UI state.

One methodology note: an early combined "select -> complete two missions -> drain to Game Over"
test intermittently showed drains not registering, traced to the *real* ball genuinely draining
on its own mid-test (Havok physics keeps running for real the whole time a Playwright test is
alive) before the test's own manual `handleDrain()` calls ran, silently no-oping them
(`handleDrain()`'s `if (!ballInPlay) return;` guard, existing behavior, working as intended) - not
a mission-system bug. Split into the three focused tests above instead of fighting a long-running
test's real physics for shared state.
