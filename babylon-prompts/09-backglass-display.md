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
