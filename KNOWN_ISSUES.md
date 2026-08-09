# SPIRITBALL — Known Issues & Release Stability Report

**Date:** 2026-08-08
**Status update (2026-08-08, same day):** Items 1–10 and 12 have been fixed in this branch — see
the corresponding `release-prompts/NN-*.md` files, which now double as a record of what was
changed and why. Item 11 was reviewed via geometric/physics analysis (live in-browser playtesting
wasn't possible in the sandbox this work was done in — see its entry below and
`release-prompts/11-*.md` for details and what's still recommended before shipping).
**Later same day:** a much larger initiative began — rebuilding SPIRITBALL's rendering and
physics on Babylon.js/Havok as a true 3D pinball game. See `../BABYLON_3D_OVERHAUL.md` and
`../babylon-prompts/01-13-*.md`. This document and `release-prompts/` remain the historical
record of the Phaser/2D-era bug fixes — the mission/scoring/rank *logic* they hardened carries
forward into the 3D rewrite unchanged; the physics/rendering code they fixed is being replaced
wholesale.
**Scope:** `phaser2d.html` (renamed from `index.html` on 2026-08-09 when the Babylon.js 3D build
became the live GitHub Pages entry point — see `../BABYLON_3D_OVERHAUL.md`'s status line), plus
`index.js`, `styles.css` (unchanged, current XP-Pinball-mechanics build, v5.0). Everything below
still applies to that file, just at its new path.
**Supersedes:** `CODE_REVIEW_REPORT.md` (Dec 5 2025), which reviewed an older chakra/combo-based
build and concluded "no blocking bugs." That build no longer matches the code — the game has
since been rewritten around a mission/rank/fuel system, and several real, verifiable bugs exist
in the current version. This document replaces it as the authoritative issue list.

Every item below was confirmed by reading the actual source (not assumed) — file/line references
are current as of this commit but will drift as fixes land.

---

## Critical — core gameplay (desktop + mobile)

### 1. Flippers don't reliably transfer force to the ball — ✅ FIXED
`index.js` `setupFlippers()` (~L1632) creates the flipper bodies as **static** Arcade Physics
bodies (`this.physics.add.existing(this.leftFlipper, true)`). Static bodies never move/rotate
their collision shape — Arcade Physics only tracks axis-aligned bounding boxes, so the hitbox
stays a fixed, unrotated rectangle at the flipper's rest angle even though the *sprite* visually
swings up 70° via a tween in `activateLeftFlipper()`/`activateRightFlipper()` (~L2354, ~L2408).

On top of that, the actual velocity boost ("the flip") is only computed **once, at the instant
the key/button goes down** (`this.physics.overlap(this.ball, this.leftFlipper)` inside the
activate function, which itself only runs on the press edge, not every frame the flipper is
held). If the ball arrives on the flipper a few frames after the press — extremely common —
it just rolls off a mismatched static rectangle with no boost, instead of getting flipped.

**Symptom players will see:** flippers that feel "dead" or inconsistent, ball dribbling through
where the flipper visually is, occasional balls that pass through the flipper graphic entirely.
This is the single most important gameplay bug — it undermines the core interaction on both
desktop and mobile equally.
→ **`release-prompts/01-flipper-collision-physics.md`**

### 2. Mobile touch controls can vanish on landscape phones — ✅ FIXED
`styles.css` hides/shows `#controls-container` via **two conflicting mechanisms**:
- CSS media queries with `!important` (`(max-width:767px), (orientation:portrait)` → show;
  `(min-width:768px) and (orientation:landscape)` → hide).
- `InputManager.updateMobileControlsVisibility()` in `index.js` (~L218) sets
  `controlsContainer.style.display` inline based on real user-agent mobile detection.

CSS `!important` rules beat inline styles without `!important`, so **the JS mobile detection is
silently dead code** — visibility is entirely decided by viewport width/orientation. Many phones
in landscape report a CSS width ≥768px (e.g. iPhone Pro Max ≈926px), which matches the "desktop"
rule and hides the flipper/launch/pause buttons completely, even though `isMobile` is `true`.
There's also no "please rotate to portrait" fallback, so a phone in landscape just shows the
game with no way to play it.
→ **`release-prompts/02-mobile-controls-visibility.md`**

---

## High — gameplay balance / broken features

### 3. "Flag rotation" missions are broken (no flag object exists) — ✅ FIXED
`addScore()` (~L3206) increments `this.gameState.flagRotations++` on **every single scoring
event** (bumper, satellite, lane, fuel, anything). There is no flag/spinner game object anywhere
in `setupObstacles()` or elsewhere. The LT Commander→Fleet Admiral rank missions ("Cosmic
Plague," requiring 75–300 flag rotations) are the intended late-game challenge, but as written
they complete almost instantly during ordinary play and aren't tied to any player skill or
target — the mission is meaningless.
→ **`release-prompts/03-flag-rotation-mission.md`**

### 4. Settings menu Sound/Music toggles do nothing — ✅ FIXED
`showSettingsMenu()` (~L3448) writes `spiritball-sound` / `spiritball-music` flags to
`localStorage` and shows ON/OFF state, but there is **no audio system anywhere in the codebase**
— no `this.sound.play()` calls, no loaded audio assets, nothing reads those flags back. The menu
promises functionality that doesn't exist, which reads as broken to players.
→ **`release-prompts/04-audio-system-or-remove-toggle.md`**

### 5. Mission auto-selected before the player does anything — ✅ FIXED
`gameState.selectedMission` defaults to `0` (not `null`) in `create()` (~L1012), but
`updateHUD()` and `hitLaunchRamp()` treat "a mission is selected" as `selectedMission !== null`.
So "Launch Training" is considered selected from the first frame of gameplay, before the player
ever hits a mission-select target (`missionTargetsLit` stays `[false,false,false]`), letting the
launch ramp start a mission the player never chose and the HUD never asked them to pick.
→ **`release-prompts/05-mission-selection-default.md`**

---

## Medium — content correctness / stability

### 6. Game Over screen shows stats that no longer exist — ✅ FIXED
`GameOverScene.create()` (~L3650) reads `this.statistics.enlightenmentCount` and
`this.statistics.saturnVortexEscapes` — leftovers from the old chakra/combo build. The current
`gameState.statistics` object (~L1048) only has `missionsCompleted`, `totalBumperHits`,
`totalLaneHits`, `totalSatelliteHits`. The lookups silently evaluate to `undefined`, so the
Game Over screen never shows *any* stats line, even though real mission-era data exists and
should be displayed (missions completed, rank reached, bumper/satellite hits).
→ **`release-prompts/06-game-over-stats.md`**

### 7. Pause menu leaks keyboard listeners over a long session — ✅ FIXED
`pauseGame()` (~L3299) registers `this.input.keyboard.once('keydown-ESC', …)` and
`once('keydown-SPACE', …)` every time it runs, in addition to the persistent `on('keydown-ESC', …)`
listener from `setupInput()`. If the player resumes via clicking "RESUME GAME" (pointer, not
keyboard) instead of pressing ESC/SPACE, those one-time listeners are never consumed and stay
registered. Every subsequent pause adds another pair. Over a long session this accumulates
duplicate listeners (each harmless individually, since `resumeGame()` is idempotent, but it's an
unbounded leak and causes a single ESC press to fire `resumeGame()` multiple times).
→ **`release-prompts/07-pause-menu-listener-leak.md`**

### 8. Fuel-light targets on the playfield can show the wrong on/off state — ✅ FIXED
`hitFuelLight()` (~L2564) lights up the specific fuel-target sprite the ball just hit (indexed
by `index`, the physical target). `depleteFuel()` (~L2994) instead dims the sprite at array
index `this.gameState.fuel` (the remaining-fuel count). These two indexing schemes aren't the
same thing, so the individual chakra "fuel light" sprites on the table can end up lit/unlit in a
way that doesn't match the actual fuel total. The HUD fuel-dot row (`updateHUD`, ~L3255) is
correct since it just iterates `0..fuel-1`; only the decorative playfield lights are wrong.
→ **`release-prompts/08-fuel-light-sync.md`**

---

## Medium — mobile/desktop production readiness

### 9. 3 MB background image and unused multi-MB assets — ✅ FIXED
`background.png` loaded in `BootScene.preload()` is **3.1 MB**, loaded on every session before
the menu even shows — a real first-load delay on mobile data connections. The repo also contains
`psychedelic-pinball-playfield.jpg` (1.3 MB) and `chakras_example.png` (125 KB) that are **never
referenced by `index.js`** at all (only `background.png`, `saturn_example.webp`, and
`grimreaper_example.webp` are loaded), plus an unrelated `Taito_Brazil_1980...gif` (70 KB). If
the whole repo directory is deployed as static hosting, that's several MB of dead weight shipped
to every mobile visitor.
→ **`release-prompts/09-asset-optimization.md`**

### 10. No PWA manifest / icons, no CDN-failure fallback — ✅ FIXED
`index.html` sets `mobile-web-app-capable` / `apple-mobile-web-app-capable` meta tags implying
"Add to Home Screen" support, but there's no `<link rel="manifest">`, no `apple-touch-icon`, and
no favicon — home-screen installs get a blank/default icon. Separately, Phaser is loaded from a
CDN (`cdn.jsdelivr.net`) with no fallback or user-facing error if that request fails or is
blocked (corporate wifi, ad-blocker, offline) — the page just shows a blank canvas forever with
nothing telling the player what happened.
→ **`release-prompts/10-pwa-and-cdn-resilience.md`**

### 11. Center post / flipper-gap geometry — ⚠️ REVIEWED, not live-playtested
`setupTable()` places a static `centerPost` circle at `(width/2, height-60)`, sitting directly in
the gap between the two flippers. Live in-browser playtesting wasn't possible in the sandbox this
work was done in (its outbound network policy blocks the Phaser CDN), so this was instead
reviewed analytically using the actual current coordinates: `centerPost` is at `(270, 900)` with
radius 8; after the item-1 flipper fix, `leftFlipper`/`rightFlipper` are circular colliders of
radius 62 centered at `(190, 880)`/`(350, 880)`. Distance from either flipper center to the post
center is `sqrt(80² + 20²) ≈ 82.5px`; subtracting the two radii (`62 + 8 = 70`) leaves only
**~12.5px of clearance** on each side of the post — well under the ball's 40px diameter. So the
ball can **never** physically fit between the post and a flipper: a direct center-line drain
(the classic "missed both flippers" case) is geometrically impossible here, and every drain must
go through the outlanes instead (verified those work: a ball resting against the left/right wall
has its center at x≈50/490, exactly inside the outlane trigger zone, with no collider blocking
its path down to the drain zone). Given the existing bounce coefficient (0.75), drag, and the
generic wall-collision minimum-velocity nudge (all of which already apply to `centerPost` as a
member of `this.walls`), a hard, permanent freeze in this pocket seems unlikely, but this is an
analytical judgment, not a confirmed observation from actual play.
→ **`release-prompts/11-center-post-drain-playtest.md`** (updated with this analysis; a manual
desktop + mobile playtest of this specific area is still recommended before shipping)

### 12. Accessibility: zoom disabled, reduced-motion doesn't cover the canvas — ✅ FIXED
`index.html`'s viewport meta sets `user-scalable=no, maximum-scale=1.0`, blocking pinch-zoom for
low-vision users. `styles.css`'s `prefers-reduced-motion` block only affects CSS
animations/transitions on DOM elements (buttons, etc.) — it has no effect on the dozens of
Phaser `tweens.add(...)` calls that drive on-canvas motion (chakra pulsing, flipper glow, camera
shake/flash), so "reduced motion" users still get full canvas motion and screen shake.
→ **`release-prompts/12-accessibility-pass.md`**

---

## Suggested fix order for a stable release

1. **01** (flippers) — this is the game; nothing else matters if this doesn't feel right.
2. **02** (mobile controls visibility) — mobile is literally unplayable in the affected case.
3. **03**, **05** (mission logic) — correctness of the core scoring/progression loop.
4. **06**, **08** (stats/visual sync) — polish, low risk, quick wins.
5. **04** (audio) — decide: implement real audio, or remove the toggle so it stops lying to players.
6. **07** (listener leak) — small, safe cleanup.
7. **09**, **10** (assets/PWA/CDN) — deployment/production hardening.
8. **11** (playtest) — do this after 01/02 land, since flipper/geometry fixes change ball behavior.
9. **12** (accessibility) — polish pass.

Each `release-prompts/NN-*.md` file is self-contained: it can be hand to a fresh coding session
on its own, in any order within a priority tier, without needing the others done first (dependencies
are called out explicitly where they exist).
