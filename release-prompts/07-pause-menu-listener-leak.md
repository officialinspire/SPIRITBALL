# Fix pause-menu keyboard listener leak

## Context
`GameScene.pauseGame()` in `index.js` (~L3299) builds the pause overlay UI and additionally
registers one-shot keyboard shortcuts to resume. See `KNOWN_ISSUES.md` item 7.

## Problem
```js
pauseGame() {
    ...
    this.input.keyboard.once('keydown-ESC', () => this.resumeGame());
    this.input.keyboard.once('keydown-SPACE', () => this.resumeGame());
}
```
This runs every time `pauseGame()` is called, in addition to the persistent
`this.input.keyboard.on('keydown-ESC', () => this.handlePause())` registered once in
`setupInput()` at scene start. If the player resumes by clicking the "RESUME GAME" button
(pointer input) instead of pressing ESC/SPACE, the `once` listeners registered in that
`pauseGame()` call are never consumed and stay attached. Every subsequent pause→resume-by-click
cycle adds another orphaned pair, so a long session accumulates an unbounded number of dangling
one-time listeners. It also means a single ESC press while paused can trigger `resumeGame()`
more than once in the same event (once via the persistent listener's `handlePause()`, once via
whichever `once` listeners haven't fired yet) — harmless today since `resumeGame()` is
idempotent, but wasteful and a source of future bugs if that method ever becomes non-idempotent.

## What to do
1. Remove the `once('keydown-ESC', ...)` / `once('keydown-SPACE', ...)` registrations from
   `pauseGame()` entirely — the persistent `on('keydown-ESC', ...)` listener from `setupInput()`
   already toggles pause/resume correctly via `handlePause()`. If SPACE-to-resume is a wanted
   feature (it currently isn't handled by any persistent listener), add a persistent
   `on('keydown-SPACE', ...)` in `setupInput()` instead, gated on `this.gameState.isPaused` so it
   only resumes (doesn't interfere with the launch-plunger SPACE handling when unpaused).
2. Apply the same fix to `showSettingsMenu()`, which has the identical pattern
   (`once('keydown-ESC', ...)` re-registered every time settings opens).
3. After the fix, verify pausing/resuming via keyboard, via the Resume button, and via opening
   Settings then going Back, all work correctly with no duplicate resume calls and no listener
   growth over repeated cycles (you can sanity check by logging
   `this.input.keyboard.listenerCount('keydown-ESC')` before/after several pause cycles during
   manual testing, then removing the log).

## Constraints
- Small, surgical fix scoped to `pauseGame()`, `showSettingsMenu()`, and possibly one new line in
  `setupInput()` — no other behavior should change.

## Acceptance criteria
- Pause/resume repeatedly (say 10+ times) via a mix of ESC key and clicking the Resume button;
  confirm no duplicate/triple resume side effects and no growing listener count.
- ESC and (if kept) SPACE both still correctly resume from the paused state; SPACE still works
  normally for the plunger charge/launch when the game is *not* paused.
