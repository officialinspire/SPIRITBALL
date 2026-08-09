# Stage 9 — 3D backglass / dot-matrix score display

## Context
The reference screenshot's right-hand panel - a glowing dot-matrix score/message display mounted
above the playfield - is one of the most visually iconic parts of that classic cabinet look, and
currently has no equivalent in SPIRITBALL at all (the current 2D HUD is flat on-canvas text). This
stage builds that panel as an actual mounted object in the 3D scene rather than a flat overlay,
which is what makes it read as "part of the cabinet" instead of a UI layer floating on top.

## Goal
A 3D-mounted panel, visible from the fixed gameplay camera (`02-*.md`), rendering score, ball
count, rank, current mission, and short messages/popups in a retro dot-matrix/segment-display
style, updated live from game state.

## What to do
1. Create a mesh (a simple angled plane is enough) positioned above/behind the playfield in the
   camera's view, sized and placed so it reads clearly without dominating the frame or blocking
   the ball.
2. Drive its content with a `BABYLON.DynamicTexture`: draw to its underlying 2D canvas context
   using the same kind of canvas-drawing calls SPIRITBALL's `BootScene.preload()` already uses to
   procedurally generate its 2D textures today - the technique carries over directly, just
   targeting a `DynamicTexture` instead of a Phaser `Graphics` object, and redrawn whenever the
   displayed content changes rather than once at load time.
3. Style the drawn content to evoke a dot-matrix/plasma display: a grid of dots or a blocky
   pixel-style font, a limited glowing color per line (matching the reference image's amber/
   purple dot-matrix look, adapted to SPIRITBALL's palette), dark background between updates.
4. Port the content currently shown in the 2D HUD (`setupHUD()`/`updateHUD()` in `../index.js`) -
   score, high score, lives/balls remaining, rank, current mission name and progress, multiplier -
   onto this panel, laid out across a few lines given the display's aspect ratio, updated on the
   same events the current HUD updates on.
5. Port the popup-message system (`showPopup()` in `../index.js` - "LAUNCH!", "MISSION COMPLETE!",
   "RANK UP!", etc.) as short-lived overlays on this same panel (or a small subsection of it)
   rather than floating text in 3D space over the playfield - matches how a real cabinet's
   backglass communicates transient messages.
6. Apply the glow layer from `07-*.md` to this panel's emissive dot/segment color so it reads as
   genuinely lit, not just a printed texture.

## Constraints
- Keep this panel's content logic driven by the same underlying game-state fields as the current
  HUD (don't fork a second copy of score/rank/mission tracking) - it's a new *renderer* for
  existing state, not new state.
- Don't try to cram every stat from the old HUD onto this panel if it starts looking cluttered at
  the display's practical resolution - prioritize score, lives, and current mission/message as
  the must-haves, and treat rank/multiplier as secondary if space is tight.

## Acceptance criteria
- The panel is clearly legible from the fixed gameplay camera distance/angle - text and dots
  large enough to read, not a blurry wall of illegible detail.
- Score, lives, rank, and mission progress all update correctly and promptly as the corresponding
  game-state changes (verify against the same trigger points the current `updateHUD()` uses).
- Popup-style messages appear and clear on the panel at the same moments the 2D version shows them
  (launch, hits, mission complete, rank up, etc.), without stacking illegibly if multiple fire in
  quick succession.
- The panel visually reads as "part of the cabinet," lit and glowing consistently with the rest of
  the Stage 7 visual treatment, not like a flat debug-text overlay pasted onto the scene.

---

## Implementation note (2026-08-09)

**Scope, decided consistently with Stage 6**: the doc asks for rank/mission/multiplier alongside
score/lives, but none of that state exists in this build - Stage 6 explicitly deferred the full
mission FSM (select/start/complete/rank-up) to Stage 12, since it needs real UI to be worth
porting. This panel is a *renderer*, not a new source of state, so it can only show what's
actually tracked: score, a new high score, lives, and transient messages. Rank/mission/multiplier
will slot into this same panel once Stage 12 gives them real values.

**Real 3D-mounted panel**, not a DOM overlay: a `MeshBuilder.CreatePlane` positioned above/behind
the playfield at the far end (+Z, opposite the flippers - the real-cabinet backglass position),
tilted to face back toward the fixed camera, `DOUBLESIDE` so it's visible regardless of which way
Babylon's default plane-facing convention turns out to be (unverifiable in this sandbox either
way, so the safer option was taken over guessing the sign). Node-verified the panel sits at ~18.6°
off the camera's look direction, comfortably inside its 25° half-FOV cone.

**Rendering**: one `DynamicTexture` (`{width, height}` constructor form, confirmed against
Babylon's actual source since the alternate `number`-only form was the one already used for
Stage 7's starfield and I wanted to confirm both are real), redrawn from scratch on every change
rather than partially updated - simplest and most robust option, no partial-clear bugs to chase
sight-unseen. A faint repeating dot-grid overlay evokes the dot-matrix look without rasterizing
actual per-character dot glyphs (a lot of unverifiable-by-me complexity for a first pass).

**Message system**: last-message-wins - a new `showMessage()` call cancels any pending clear-timer
from the previous message and replaces it immediately, rather than queuing. This satisfies the
"don't stack illegibly" acceptance criterion directly, at the cost of a very-quick second hit
cutting the first message's dwell time short - judged acceptable over building a real queue for a
panel whose actual on-screen legibility can't be checked here anyway. Wired to the same trigger
points `updateHUD()`/`showPopup()` use in `../index.js`: launch, each hit type (with the exact
point values where the 2D version shows them, e.g. `+500`), mission-target hits (a generic
"TARGET!" instead of `hitMissionTarget()`'s "Selected: {missionName}", since there's no mission to
name yet), and drain (a text message standing in for the 2D version's Grim Reaper visual, which
doesn't exist in this build).

**High score**: new, persisted via `localStorage` under `spiritball3d-highscore` - a deliberately
different key from the 2D game's `spiritball-highscore`, so the two builds don't cross-contaminate
each other's high scores while both exist in parallel during this project.

**Verified in this sandbox**: `node --check`; the DynamicTexture constructor signature confirmed
against Babylon's actual source; a Node script confirming the panel's position/angle sits inside
the fixed camera's FOV cone; the established top-level-`BABYLON`-reference grep sweep (clean); the
CDN-blocked failure-path check in headless Chromium.

**Not verified** (same limitation as Stages 7-8): whether the panel is actually legible at that
size/distance/angle, whether the dot-matrix styling reads as intended, whether messages are
readable during their 600-1400ms window, and whether the tilt/facing direction chosen actually
shows the panel's front (not back) face to the camera - `DOUBLESIDE` should make this moot, but
it's untested.
