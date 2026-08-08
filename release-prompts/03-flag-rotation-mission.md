# Fix broken "flag rotation" missions (Cosmic Plague, ranks LT Commander → Fleet Admiral)

## Context
SPIRITBALL's mission system (`CONFIG.missions` in `index.js`) includes a recurring "Cosmic
Plague" mission at ranks 4–8 requiring 75–300 "flag rotations." See `KNOWN_ISSUES.md` item 3.

## Problem
`addScore()` (~L3206) does this unconditionally on *every* scoring event in the entire game:
```js
addScore(points) {
    ...
    this.gameState.flagRotations++;
    ...
}
```
There is no flag, spinner, or any dedicated object anywhere in `setupObstacles()` or elsewhere
that represents "a flag rotation." Every bumper hit, satellite hit, lane pass, and fuel pickup
counts as one, so a mission requiring 75+ "flag rotations" completes almost immediately during
completely ordinary play, with the player having no idea what a "flag" even is since none exists
on the table.

## What to do
Pick one of these (recommend option A if you want a real feature, option B if you want a fast,
low-risk fix for a stable release):

**Option A — implement a real flag/spinner object (bigger scope)**
1. Add a small spinner/flag game object to the playfield in `setupObstacles()` (visually
   distinct — e.g. a spinning line or small flag sprite using the existing texture-generation
   style in `BootScene.preload()`), with its own physics body and collider.
2. Increment `this.gameState.flagRotations` only when the ball passes through/spins this specific
   object, with a short cooldown like the other obstacles (`isOnCooldown`/`setCooldown`).
3. Remove the blanket `this.gameState.flagRotations++` from `addScore()`.
4. Rebalance the requirement numbers in `CONFIG.missions` (75/100/150/200/300) if needed once the
   object exists, since a dedicated spinner is hit far less often than every score event —
   playtest and tune so the mission is achievable but takes meaningful effort, consistent with
   the difficulty curve of the other rank-4+ missions in the same table (satellite hit counts,
   score thresholds).

**Option B — retire the mission type instead (smaller scope)**
1. Replace the `'flags'` mission type entries in `CONFIG.missions` (ranks 4–8, mission id 12,
   "Cosmic Plague") with a mission type that already has a working implementation in
   `checkMissionComplete()` (e.g. another `'satellite'`, `'bumper'`, or `'score'` mission scaled
   appropriately for that rank), so every mission in the game is actually completable through
   real, intentional play.
2. Remove the now-unused `flagRotations` tracking (`gameState.flagRotations`, the increment in
   `addScore()`, and the `case 'flags':` branch in `checkMissionComplete()`) to avoid dead code.

## Constraints
- Don't change scoring values (`CONFIG.scores`) or other mission types as part of this fix.
- Whichever option you choose, every mission listed in `CONFIG.missions` must be genuinely
  completable through a real, distinct player action — no mission should complete as a side
  effect of unrelated scoring.

## Acceptance criteria
- Reach (or simulate reaching) a rank-4+ "Cosmic Plague" mission and confirm it requires
  deliberate, specific play to complete — not just "keep scoring points doing anything."
- `checkMissionComplete()`'s `'flags'` case (or its replacement) works correctly and doesn't
  throw if the object/state it depends on doesn't exist yet at low ranks.
