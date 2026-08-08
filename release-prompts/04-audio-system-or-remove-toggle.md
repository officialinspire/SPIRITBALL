# Make Sound/Music settings real, or remove them

## Context
The pause menu's Settings screen (`showSettingsMenu()` in `index.js`, ~L3448) has Sound and
Music ON/OFF toggles that persist to `localStorage` (`spiritball-sound`, `spiritball-music`).
See `KNOWN_ISSUES.md` item 4.

## Problem
There is no audio system in the game at all: no `this.sound.play(...)` calls, no audio assets
loaded in `BootScene.preload()`, nothing that ever reads `spiritball-sound` / `spiritball-music`
back. The Settings UI implies working audio controls that do nothing — this reads as broken to
any player who toggles them expecting a change.

## What to do
Pick one based on project priorities (recommend option B for a *fast* stable release, option A
if there's time/appetite to add real audio polish):

**Option A — implement real audio (bigger scope)**
1. Source or generate a small set of short sound effects (launch, flipper flip, bumper hit,
   satellite hit, mission complete, rank up, ball drain/death, button press) and optionally a
   background music loop. Keep file sizes small (this game already has an asset-bloat problem —
   see `release-prompts/09-asset-optimization.md` — don't make it worse).
2. Load them in `BootScene.preload()` via `this.load.audio(...)`.
3. Play the appropriate sound at each existing event hook (the `hit*()` methods, `launchBall()`,
   `rankUp()`, `completeMission()`, `showGrimReaper()`, flipper activate methods, button presses
   in `InputManager`).
4. Respect the stored `spiritball-sound`/`spiritball-music` preference: read it at scene start
   and whenever `this.sound.play(...)` would fire, gate on the current toggle state (and update
   live when toggled from Settings while paused, without needing a scene restart).
5. Make sure mobile autoplay restrictions are handled gracefully (most mobile browsers require a
   user gesture before audio can play — the existing tap-to-start flow on `MenuScene` is a
   natural place to unlock audio).

**Option B — remove the non-functional toggle (fast, low-risk)**
1. Remove the Sound/Music toggle UI from `showSettingsMenu()` (the `soundLabel`/`soundToggle`/
   `soundToggleBg` and `musicLabel`/`musicToggle`/`musicToggleBg` blocks and their click handlers).
2. Either remove the Settings screen entirely if nothing else remains in it, or replace it with
   whatever *does* work today (e.g. a simple "controls reference" screen showing the current
   platform's control scheme) so the pause menu's Settings button isn't a dead end.
3. Clean up the now-unused `localStorage` keys read (`spiritball-sound`, `spiritball-music`) if
   nothing else references them.

## Constraints
- Don't touch flipper/mission/collision logic as part of this fix — scope is limited to
  `showSettingsMenu()` and, if choosing option A, the `preload()`/hit-handler hook points.

## Acceptance criteria
- Opening Settings and toggling any control produces an effect the player can actually perceive
  (a sound plays/stops), **or** the toggle no longer exists and Settings only offers things that
  work.
- No dead `localStorage` reads/writes left behind referencing removed features.
