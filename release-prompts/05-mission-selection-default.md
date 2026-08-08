# Fix mission auto-selected before the player picks one

## Context
XP-Pinball-style mission selection: hitting one of the 3 mission-target chakras on the left
(`hitMissionTarget()` in `index.js`) is supposed to *select* a mission, then hitting the launch
ramp (`hitLaunchRamp()`) *starts* it. See `KNOWN_ISSUES.md` item 5.

## Problem
`gameState.selectedMission` is initialized to `0` in `create()` (~L1012):
```js
selectedMission: 0, // Selected mission index (0-2)
```
But every place that checks "has the player selected a mission" tests `!== null`:
```js
// hitLaunchRamp()
if (!this.gameState.missionActive && this.gameState.selectedMission !== null) {
    this.startMission();
}
// updateHUD()
} else if (this.gameState.selectedMission !== null) {
    const mission = CONFIG.missions[this.gameState.rank][this.gameState.selectedMission];
    this.hud.missionText.setText(`Selected: ${mission.name}`);
}
```
Since `0` is truthy-comparable and `!== null` is true for `0`, mission index 0 ("Launch
Training") is considered selected from the very first frame, before the player has hit any
mission-select target. `missionTargetsLit` correctly stays `[false, false, false]` (visually no
target looks selected), but functionally the ramp will happily start mission 0 anyway — the
selection step is a no-op until the player picks something *else*.

## What to do
1. Change the initial value in `create()` to `selectedMission: null` so "nothing selected" is the
   real starting state.
2. Verify `updateHUD()` falls through correctly to the `'Select Mission'` branch when
   `selectedMission === null` (it already does — just confirm after the initial-value change).
3. Verify `hitLaunchRamp()` correctly does nothing (or shows a "no mission selected" popup
   instead of silently no-oping) when `selectedMission === null` and the player hits the ramp
   before selecting anything — currently it just skips the `if` block with no feedback; consider
   adding `this.showPopup('SELECT A MISSION FIRST', ...)` in the `else` case for clarity.
4. Double check `completeMission()` and `abortMission()`, which already correctly reset
   `selectedMission` back to `null` — no change needed there, just confirm they still make sense
   given the new default.

## Constraints
- Single, small, surgical change plus one optional UX popup — don't restructure the mission
  system itself (that's covered by `release-prompts/03-flag-rotation-mission.md` for a different
  bug).

## Acceptance criteria
- On a fresh game start, the HUD shows "Select Mission" (not "Selected: Launch Training") and
  hitting the launch ramp before hitting any mission target does not start a mission.
- After hitting a mission-select target, the HUD updates to "Selected: <name>" and the ramp
  correctly starts that mission, exactly as before.
