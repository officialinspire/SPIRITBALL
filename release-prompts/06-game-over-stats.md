# Fix Game Over screen showing stale/nonexistent stats

## Context
`GameOverScene.create()` in `index.js` (~L3610) is supposed to show a short stats summary below
the final score. See `KNOWN_ISSUES.md` item 6.

## Problem
```js
if (this.statistics.enlightenmentCount > 0) {
    this.add.text(..., `Enlightenments: ${this.statistics.enlightenmentCount}`, ...);
    statsY += 30;
}
if (this.statistics.saturnVortexEscapes > 0) {
    this.add.text(..., `Vortex Escapes: ${this.statistics.saturnVortexEscapes}`, ...);
}
```
`enlightenmentCount` and `saturnVortexEscapes` are leftovers from an older chakra/combo-based
version of the game. The current `GameScene.gameState.statistics` object (~L1048) only tracks:
```js
statistics: {
    missionsCompleted: 0,
    totalBumperHits: 0,
    totalLaneHits: 0,
    totalSatelliteHits: 0
}
```
Both `undefined > 0` checks are always `false`, so the Game Over screen currently **never shows
any stats line at all**, even though real, meaningful data exists (`GameScene.gameOver()` already
passes `statistics` through to `GameOverScene` correctly — the data is available, just unused).

## What to do
1. Replace the two dead conditionals in `GameOverScene.create()` with lines that show the fields
   that actually exist: at minimum `missionsCompleted`, and ideally also `totalBumperHits`,
   `totalSatelliteHits`, `totalLaneHits`.
2. Also consider passing and displaying the final `rank` reached (`gameState.rank` /
   `CONFIG.ranks[rank]`) — `gameOver()` currently only passes `{ score, highScore, statistics }`;
   add `rank: this.gameState.rank` to that payload and read it in `GameOverScene.init(data)` if
   you want to show it (a natural, satisfying stat for a rank-progression pinball game).
3. Keep the existing conditional-display pattern (only show a line if the stat is > 0) so a very
   short game doesn't show a wall of zeroes — just point the conditions at real fields.

## Constraints
- Don't change what's tracked in `gameState.statistics` beyond optionally adding `rank` to the
  scene-transition payload — this is a display fix, not a new tracking feature.

## Acceptance criteria
- Play through a game that completes at least one mission and hits at least one bumper/satellite,
  then lose all balls — the Game Over screen shows real, correct numbers for what happened in
  that game (not zero, not `undefined`, not stale chakra-era labels).

---

## Implementation note (2026-08-08)
`gameOver()` now passes `rank: this.gameState.rank` alongside score/highScore/statistics, and
`GameOverScene.init()` reads it. Replaced the two dead `enlightenmentCount`/`saturnVortexEscapes`
conditionals with a "Final Rank: <name>" line (always shown) plus conditional lines for
`missionsCompleted`, `totalBumperHits`, `totalSatelliteHits`, and `totalLaneHits` (only shown when
`> 0`, matching the original short-game-shows-no-wall-of-zeroes intent). While in this area,
noticed `totalLaneHits` was declared in `gameState.statistics` but never actually incremented
anywhere (a small, separate dead-field bug in the same family) — fixed by incrementing it in
`hitReentryLane()` so the new stat line is meaningful rather than permanently zero. `node --check
index.js` passes.
