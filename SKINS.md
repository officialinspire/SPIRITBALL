# SPIRITBALL decorative-skin architecture

Status as of this document: **one slot populated (`playfieldBackground`), the rest still
`path: null`.** Every other slot's default-null state is still the intended design, not a
work-in-progress snapshot - see "Why every slot defaults to `path: null`" below for why. This
document describes how to actually add artwork (playfieldBackground already shows the full
worked example), and the folder/image spec that artwork needs to follow.

`cabinetRails` and `bumperCap` are unpopulated but their integration paths are finalized and
guarded - see their "Slot spec" sections below for the artwork to author against.
`qa/skin-integration.js` exercises the generic path (unset, broken, valid) and
`qa/skin-bumper-cap.js` covers what is specific to the cap: that artwork there cannot reach the
collider, size, scoring, kick or hit animation, and that the boss bumper stays distinguishable.

## What this is for

SPIRITBALL's playfield, obstacles, and lamps are built entirely from procedural Babylon.js
materials (flat colors, PBR albedo/emissive/metallic/roughness values) - no image textures
anywhere. That's still true after this pass. What changed is that a handful of those materials
now have an optional, centrally-configured *texture slot* that will replace (or layer over) the
procedural look, automatically, the moment a matching image file is dropped into
`assets/skins/` and its path is filled in in `js/skins.js`. Nothing else in the project needs to
change - no other file ever hardcodes an asset path, and no gameplay code reads this system at
all.

## The pieces

1. **`js/skins.js`** - pure data. `SKIN_ASSET_BASE` (the folder everything below is relative to)
   and `SKIN_MANIFEST` (one entry per skin slot: `{ path, kind }`, or an array of those for
   per-index slots like the mission targets). This is the *only* file you edit to point a slot at
   a real image. It has zero `BABYLON` references by design (same reasoning as `hexToColor3()` in
   `js/config.js` - see that comment) so it's safe to import and read even if the Babylon vendor
   bundle itself fails to load.

2. **`applySkinTexture(scene, material, entry)`** in `babylon-game.js` - the *only* place in the
   whole game that ever loads a skin image. Every call site (in `buildTable()`/
   `buildObstacles()`) already builds its material with the existing procedural look first, then
   calls this to optionally layer a texture on top. It:
   - No-ops immediately if `entry.path` is `null` (the shipped default for every slot right now) -
     no network request is made at all.
   - Otherwise loads `SKIN_ASSET_BASE + entry.path` as a `BABYLON.Texture`, asynchronously.
   - On success, assigns the texture to `material.albedoTexture` (or `.diffuseTexture` for a
     `StandardMaterial`) or `material.emissiveTexture`, depending on the slot's `kind`.
   - On failure (missing file, bad format, network error), disposes the failed attempt and leaves
     the material exactly as its caller already configured it - the procedural look is the
     permanent fallback, not a temporary "loading" state.
   - Never throws, never rejects unhandled, and is never awaited by its caller - a skin texture
     can only ever improve the visuals if it loads; it can never delay or block game startup.
   - On success, also resets whatever flat color that property multiplies against
     (`albedoColor`/`diffuseColor`, for `kind: 'albedo'` only) to white, so the real artwork's own
     colors show through instead of getting tinted/darkened by the procedural fallback's color -
     see the visual-integration pass' commit for why this mattered in practice (playfieldMat's
     dark cosmic tint would otherwise noticeably wash out real playfield artwork layered under
     it).
   - Sets `wrapU`/`wrapV` to `CLAMP_ADDRESSMODE` (every skin slot is a single "cover this surface"
     image, never a tiling pattern - **nothing in this system ever tiles or repeats**) and
     `anisotropicFilteringLevel` (capped at 8, only when the engine reports hardware support) on
     every loaded texture - sharpens texture detail at a raking viewing angle, which is exactly
     how this game's fixed camera sees the playfield.
   - Honours an optional per-slot `albedoScale` (0..1, clamped, `kind: 'albedo'` only): where a
     slot declares one, that flat grey is written into `albedoColor` on a successful load instead
     of the plain white above, capping how bright the loaded artwork is allowed to render. It
     exists because a skin slot is otherwise a hole in the board's visual hierarchy - the artwork's
     exposure is whatever the artist happened to author, and on some surfaces that is not a free
     choice. `cabinetRails` and `bumperCap` set it today (see their sections below); on `bumperCap`
     it is specifically preserving a measured tuning that the plain white reset would discard.

4. **`qa/skin-integration.js`**, **`qa/skin-bumper-cap.js`**, **`qa/skin-mission-targets.js`** and
   **`qa/lane-inserts.js`** - the guards. The first exercises all three states of the `cabinetRails`
   slot on every run (unset / configured-but-missing / configured-and-valid), by intercepting
   `js/skins.js` in the browser and rewriting the one slot - the shipped manifest is never edited
   and the test leaves no residue. It pins that an unset slot issues no request, that a failed load
   cannot break boot, that a valid load actually swaps in and gets its `albedoScale` applied, that
   the wall UV layout the artwork spec depends on is intact, that wall colliders are byte-identical
   across all three states, and that no file outside `js/skins.js` contains an `assets/skins/` path
   literal in code (comments are stripped first - the cross-references in `babylon-game.js` are
   documentation, and are meant to stay). The second does the same three states for `bumperCap` and
   adds what is specific to a slot sitting on live gameplay hardware: that the cap mesh has no
   collider, that bumper geometry and physics bodies are unchanged, that a real staged hit still
   awards the same score and still throws the ball back, that the hit flash still lifts
   `bodyMat`/`lampMat` and still never touches the shared cap material, and that the boss bumper's
   three cues survive deliberately hostile artwork. The third covers the `missionTargetFace` array:
   that each index has its own material and picks up its own slot's file (no cross-wiring), that
   UV orientation is upright and un-mirrored, that the drop animation's endpoints and the trigger
   volume's position are unchanged by artwork, and it measures what neutral grey renders as on each
   plate so the emissive-wash spec is a measurement rather than a guess. The fourth covers the
   four `laneInsert*` families: that no two share a lens texture (the exact regression the pass
   removed), that every lane trigger still matches the config constants it is built from, that no
   insert lens carries a physics body, and it re-measures the dim-to-lit ratio against a 1.40x
   floor so a re-raised albedo floor fails loudly.

5. **`assets/skins/`** - where the actual image files go, in the subfolders described below.

## Why every slot defaults to `path: null`, not a real-looking filename

An earlier version of this manifest pointed every slot at its intended future filename directly.
That turned out to be the wrong default: `applySkinTexture()`'s `onError` handler prevents any *JS
exception* from a failed load, but it can't prevent the browser's own network stack from logging a
plain `Failed to load resource: 404` line to the console for that request - that's standard
Chromium diagnostic behavior for any failed HTTP request, entirely outside what an `onError`
callback controls. Verified directly via a headless Chromium run against a real 404. With every
slot pre-wired to a not-yet-existing filename, that would mean one console entry per slot on
*every single load* of the current, artwork-free build - a real regression against this project's
own "zero console errors" bar, not just a style nit.

Setting `path: null` until an asset genuinely exists means no request is ever attempted for an
unpopulated slot, so today's build (and any build before real art is added) has a clean console.
The graceful-fallback behavior in `applySkinTexture()` still exists and is still exercised (and
still matters) for the case a path *is* configured but the file is temporarily missing (a bad
deploy, a typo) - that's a real failure mode worth defending against, just not the default state
of an intentionally artwork-free repo.

## Populated slots

### `playfieldBackground`

`assets/skins/playfield/playfield-background.webp` - a user-supplied portrait (887x1774) cosmic/
sacred-geometry piece, applied to `playfieldMat` (the ball-rolling surface). Worked example of the
full pipeline described above:

- **Format:** shipped as the original `.webp` the artwork was supplied in, not re-encoded -
  avoids introducing a second generation of compression artifacts on top of whatever the source
  already has. See the format note below: webp is a fine choice alongside PNG/JPG as long as the
  target browsers support it (every browser this WebGL2/WASM-Havok game already requires does).
- **Aspect ratio:** the image is exactly 2:1 (887:1774, i.e. width:height = 0.5); the playfield's
  own top-face aspect is `TABLE_WIDTH_M : TABLE_LENGTH_M` = 0.51:0.9067 ≈ 0.5625. Close enough
  (~11%) that the default full-face box UV (a uniform stretch to fit, no custom crop) reads as a
  natural part of the design rather than a visible distortion - confirmed via a headless Chromium
  screenshot, not assumed. A custom UV crop (matching width, cropping the top/bottom ~5.5% each to
  hit the exact target aspect) was considered but deliberately not implemented: getting the crop
  axis and V-direction right without being able to visually distinguish a subtly-wrong crop from a
  correct one (this particular image is close to top/bottom-symmetric) was a real risk for a
  refinement that the plain stretch already made unnecessary.
- **Material tuning:** `playfieldMat.metallic` dropped from 0.3 to 0.05 (real playfield art sits
  under a clear lacquer coat, it isn't a metal surface itself) and `roughness` tightened from 0.35
  to 0.28 (a bit more clearcoat-like specular response under the scene's direct lights). No
  `emissiveColor` was added - the artwork's own bright elements already read as bright via albedo
  under direct light, and material-level emissive on top would wash out their contrast rather than
  help. No `scene.environmentTexture` was added either, matching this project's existing policy
  (see `wallMat`'s own comment in `babylon-game.js`) of not taking on a second fragile CDN texture
  fetch for IBL reflections - "subtle environmental response" instead comes from the retained
  non-zero metallic/roughness Fresnel response Babylon's PBR model already computes from direct
  lights alone.
- **Verification:** confirmed via a temporary debug hook and headless Chromium screenshots that
  the texture loads and renders correctly (right-side-up, centered, covering the full playfield,
  no seams at the boundary), that removing the file falls back cleanly to the original flat cosmic
  tint with zero console/page errors, and that the playfield mesh's position and physics body are
  byte-for-byte unchanged from before this pass.

## Slot spec: `cabinetRails`

**Not populated.** The integration path is finished and guarded; this section is the spec real
artwork has to be authored against.

### Required file

| | |
|---|---|
| Path | `assets/skins/cabinet/cabinet-rails.png` (`.webp` also fine - opaque slot, no alpha used) |
| Dimensions | **64 x 512**, portrait |
| Orientation | `v = 0` is the **top** of the wall (the polished crown); `v = 1` is where it meets the playfield |
| Content along the width | **constant** - see "Why a strip" below |
| Brightness | authored freely; the slot applies a 0.55 ceiling on load (`albedoScale`) |

Then set the slot in `js/skins.js` to
`cabinetRails: { path: 'cabinet/cabinet-rails.png', kind: 'albedo', albedoScale: 0.55 }`.
Nothing else, anywhere, needs to change.

### Why a strip, and not the 512x512 tileable pattern this document used to ask for

The previous spec here was wrong on three counts, and an artist following it would have produced a
file that could not work: it asked for a tileable pattern, said the image "repeats at each wall's
own aspect ratio", and gave a square target. **Nothing in this system tiles** -
`applySkinTexture()` sets `CLAMP_ADDRESSMODE` on every texture it loads. One image is *stretched*
to fit, not repeated.

And it is stretched onto a lot of very different shapes. `wallMat` is a **single material instance
shared by all 7 boundary walls**, each a `CreateBox` whose every face carries the default full
`u[0,1] / v[0,1]` square - 42 faces in total, all showing the same image. Measured from the live
scene:

| Wall | Long visible face (m) | Aspect | Top face aspect |
|---|---|---|---|
| `leftWall` / `rightWall` | 0.9067 x 0.0400 | **22.67 : 1** | 0.03 : 1 |
| `topWall` | 0.5100 x 0.0400 | 12.75 : 1 | 18.02 : 1 |
| `leftSlant` | 0.1700 x 0.0400 | 4.25 : 1 | 8.99 : 1 |
| `leftGuide` / `rightGuide` | 0.1483 x 0.0400 | 3.71 : 1 | 10.44 : 1 |
| `rightSlant` | 0.0803 x 0.0400 | **2.01 : 1** | 4.25 : 1 |

The visible long faces alone span 2.01:1 to 22.67:1 - an **11.3x spread**. Across all side faces
it is 0.36:1 to 22.67:1, a 63.9x spread. And on the top faces `u` and `v` swap axes outright:
`topWall`'s top is 18.02:1 while the side walls' tops are 0.03:1, i.e. the same image laid down
rotated 90 degrees relative to each other.

So **any detail that varies along `u` is stretched by a different factor on every wall and cannot
be made to line up.** A logo, lettering, a repeating motif, a fixed scene - all of them break.

What maps cleanly onto all 42 faces is detail that varies **only along `v`**: a vertical rail
cross-section, constant across its width. That is what `createCabinetRailTexture()` already draws
procedurally, and it is why the target is a narrow portrait strip rather than a square.

(A per-wall `faceUV` layout, or one material per wall with `uScale` proportional to wall length,
would lift this constraint and allow length-wise detail. That is a real option, but it is a change
to how the table is built rather than to how a texture is loaded, so it is deliberately out of
scope for the skin path - noted here so the constraint reads as a decision rather than an
oversight.)

### Band layout to reproduce

Match `createCabinetRailTexture()`'s profile, quoted here as pixel rows for a 512-tall image:

| `v` range | Rows (of 512) | Band |
|---|---|---|
| 0.000 - 0.055 | 0 - 28 | Polished crown - the bright edge highlight that catches the light |
| 0.055 - 0.130 | 28 - 67 | Highlight fall-off |
| 0.130 - 0.700 | 67 - 358 | Wall body, darkening gently downward the way a lit vertical face does |
| 0.700 - 0.860 | 358 - 440 | Lower body, in shadow |
| 0.860 - 1.000 | 440 - 512 | Dark base band - the shadow line that stops playfield art running straight into the wall |

Artwork that ignores this does not fail; it just lands its highlight somewhere down the wall
instead of on the crown. Fine horizontal machining lines (or any other `v`-varying detail) are
free to be added on top - the procedural version carries a 34-cycle sine ripple for exactly that
reason.

### Why the brightness ceiling

The rails are structure, not gameplay, and they are already the brightest large surfaces in frame -
`HEX_WALL` is `0x00ccff`, and the board-graphics audit measured the right inner wall at mean
luminance 159.6/255 with 15.4% of its pixels clipped to pure white against a playfield at 31.4.
Artwork here has to come in *under* the bumpers, inserts and targets it frames rather than out-
shouting them, and that is not something an artwork file should have to remember on every
revision - so the slot declares it as data instead.

`qa/skin-integration.js` measures the result from real pixels (pick-verified, so it samples the
walls themselves rather than their projected bounding boxes):

| | rails | dimmest lamp-lit gameplay element |
|---|---|---|
| Procedural fallback | 113.7 | 119.5 (`bumper0`) |
| With artwork + `albedoScale: 0.55` | 103.0 | 119.5 |

The ceiling is doing real work: without it the rails clear the dimmest lamp-lit element by only
5.8 luminance, with it by 16.5.

One number the guard prints but deliberately does not assert on: the **flipper mesh** medians 84.8,
i.e. *below* the rails. That is not the rails being too bright relative to the flippers - it is
that a flipper's brightness does not live on the flipper. Its glow blooms onto the surrounding lane
geometry, so the bat's own pixels read dark while the flipper *area* reads far brighter (the audit
measured the flipper meshes owning 0.6% of the frame's top-1% brightest pixels at 1.04% screen
coverage, against 40.7% for the lane geometry the halo lands on). Asserting a minimum over the
flipper mesh would be asserting against a number that does not describe what a player sees.

## Slot spec: `bumperCap`

**Not populated.** Integration path finished and guarded by `qa/skin-bumper-cap.js` (40 checks).

### Required file

| | |
|---|---|
| Path | `assets/skins/bumpers/bumper-cap.png` (`.webp` fine - opaque, no alpha used) |
| Dimensions | **512 x 512** |
| Projection | **Equirectangular sphere map** - see below. Not a top-down disc. |
| Brightness | authored freely; the slot applies a 0.55 ceiling on load (`albedoScale`) |

Then set the slot to
`bumperCap: { path: 'bumpers/bumper-cap.png', kind: 'albedo', albedoScale: 0.55 }`.

### Where the image actually lands on the cap

This is the thing most likely to be got wrong, because a real pop-bumper cap decal *is* a
top-down disc and this image is not. The cap is a `CreateSphere` flattened to `scaling.y = 0.58`,
so Babylon's sphere UV applies: `v` is latitude, and a row of the image is a line of latitude
wrapped the whole way around.

Measured two ways - from the mesh's own vertex data (`v = 0` at the top pole, `v = 0.5` at the
equator), and by rendering eight labelled colour bands onto the real caps in the real scene to
settle which image rows those correspond to after `invertY`:

| Image region | Lands on | Visible? |
|---|---|---|
| Bottom eighth (last 12.5%) | The cap's **apex** - dead centre as seen from above | Yes - 17-20% of the readable face |
| Bottom 37.5% (last three eighths) | The cap face a player reads | **Yes - 97-99% of it** |
| Vertical middle | The cap's rim / equator | Barely - 1-3% |
| **Top 25%** | The buried underside | **No - measured 0% on all four caps** |

So: **the readable cap face is essentially the bottom 37.5% of the image** (97-99% of it), content
near the bottom edge lands dead centre on the cap, moving up the image moves outward and down the
dome, and the top quarter is wasted. Anything intended to read as
centred on the cap must be drawn near the bottom edge and pre-distorted - wide and short - because
it gets pinched to a point at the pole.

The previous spec here said to centre the face content "around the vertical middle band", which
lands it on the rim instead of the face, and did not mention that a quarter of the image is never
drawn. Both are corrected above.

One more thing worth knowing before authoring detail: **the whole cap is 28x24 to 36x30 screen
pixels** at 1280x800. Two or three tonal zones read at that size; fine pattern does not. The
procedural fallback's turned rings are themselves much subtler on the visible face than its
drawing code suggests, for exactly the UV reason above - see `createBumperCapTexture()`'s comment.

### Why the brightness ceiling

`albedoScale` here preserves an existing decision rather than adding a new one. The cap albedo was
deliberately walked down `0.88 -> 0.66 -> 0.54/0.58` by the lighting-hierarchy pass, which recorded
the reason: the caps were the single brightest surface in the frame after the ball, clipping to 255
across their whole visible face. `applySkinTexture()` resets `albedoColor` to white on a successful
load, which would discard that tuning and put artwork on screen **~1.85x brighter than the fallback
it replaced** - re-creating precisely the clipping that pass fixed. `0.55` keeps a skinned cap in
the band the tuned procedural cap already occupies, and the QA asserts the skinned value stays
within 0.02 of the fallback's.

### What a cap skin cannot affect

Guarded by `qa/skin-bumper-cap.js`, measured rather than argued:

- **Collider.** No cap mesh carries a physics body at all - the collider is on the parent fixture.
  Bumper extents, positions and physics bodies are asserted byte-identical across unset,
  broken-path and loaded-artwork.
- **Size.** Cap mesh scaling, extents and positions are asserted identical across those states.
- **Scoring and kick.** A real hit is staged - the ball is placed beside a bumper, given velocity
  into it, and Havok's own steps are allowed to run. The award for that hit is read off the HUD the
  player sees (500, identical skinned and unskinned) and the kick off the ball's own post-contact
  velocity (thrown back at -0.86 m/s against a +1.15 m/s approach, matching within 12%).
- **Hit animation.** `pulseBumperLamp()` still lifts `bodyMat` and `lampMat` emissive by 2.1x and
  still never touches the shared cap material - which is the point of the exclusion, since one
  shared instance would flash all four caps on any single bumper's hit.

### Boss vs normal bumpers

All three boss cues live **outside** this material, so one shared cap texture lands identically on
all four caps and cannot differentiate or un-differentiate them:

| Cue | Where it lives | Measured |
|---|---|---|
| 1.5x radius | fixture geometry | boss 54x67px vs normals 42x50/42x55 - **1.57x screen area** |
| Gold trim torus | boss-only mesh, own material | 274 visible px |
| Star vs circled-dot glyph | separate label planes, own emissive texture | 222 visible px (boss) |

The QA re-measures all three under artwork chosen to be maximally hostile to them - flat pure
white at full brightness, identical on all four caps - and asserts none of them weakens. Measured,
all three are bit-identical between the fallback and hostile-artwork runs, which is what "the cues
do not live in this material" looks like when it is true.

## Slot spec: `missionTargetFace[0..2]`

**Not populated.** Integration path finished and guarded by `qa/skin-mission-targets.js`.

### Theme mapping

| Index | Vision | Motif |
|---|---|---|
| `[0]` | CHAKRA AWAKENING | symbolic chakra / lotus / energy |
| `[1]` | ASTRAL PURSUIT | comet / astral eye / star |
| `[2]` | RETURN TO BODY | spiral / portal / grounding / re-entry |

Index order matches `MISSION_TARGET_BANK`, and each index has its **own** `PBRMaterial` instance,
so the three slots are genuinely independent - the QA proves each target holds the texture from its
own slot rather than trusting it.

### Required files

| | |
|---|---|
| Paths | `assets/skins/targets/mission-target-0.png` / `-1.png` / `-2.png` |
| Dimensions | **448 x 480** each |
| Aspect | **14:15 (0.9333)** - the visible face is 0.028m x 0.030m, very slightly taller than square |
| Orientation | Draw it the way it should appear. No flip, no mirror needed. |

Then set the three slots to
`{ path: 'targets/mission-target-<i>.png', kind: 'albedo' }`.

**The aspect in this table is a correction.** The previous spec said *2:3 portrait, 256x384* -
that is 0.667 against a real face of 0.933, a **29% error**, and artwork drawn to it would have been
noticeably squashed. The procedural fallback's own texture is 128x136 (0.9412), so the fallback was
authored correctly and only the written spec was wrong. The old note that the plate is "angled
slightly toward the camera" was also wrong: measured, all three plates have rotation `[0,0,0]`.

### UV orientation - already correct

Unusually for this manifest there is nothing to work around here. Measured by painting a quadrant
map onto the real plates in the real scene (image TL red, TR green, BL blue, BR yellow) and reading
back which image quadrant lands in which screen quadrant:

| Screen | Image quadrant found there |
|---|---|
| top-left | top-left |
| top-right | top-right |
| bottom-left | bottom-left |
| bottom-right | bottom-right |

Consistent on all three targets. **No vertical flip, no horizontal mirroring** - artwork arrives the
way it was drawn. All six box faces carry the default full `u[0,1]/v[0,1]` square, so the image also
paints the 0.008m edge slivers; those are a few pixels and effectively never read.

### The tint artwork inherits

This is the one thing likely to surprise an artist, and it is deliberate. `applySkinTexture()` only
ever replaces `albedoTexture`, so each plate keeps its flat chakra-coloured `emissiveColor`
(`COLOR_CHAKRA[i].scale(0.30)`). That emissive is what supplies the "lamp behind lit plastic" glow,
and `createTargetFaceTexture()` deliberately carries **no** emissive texture of its own precisely so
a skin inherits it cleanly rather than glowing a baked-in border through the new art.

| Index | Emissive wash | Note |
|---|---|---|
| `[0]` | violet `#9400d3` x 0.30 | suits the chakra/lotus motif directly |
| `[1]` | deep pink `#ff1493` x 0.30 | **a cyan comet motif will read magenta** - `HEX_COMET` is `#66e0ff`, but this plate's identity colour is pink |
| `[2]` | yellow `#ffff00` x 0.30 | suits a warm grounding/re-entry motif |

The plate is also `alpha 0.85`, so roughly 15% of the lit slot behind it shows through the artwork.
Design around the wash rather than fighting it - artwork cannot cancel an additive emissive.

### No brightness ceiling on these slots

Unlike `cabinetRails` and `bumperCap`, these slots set **no** `albedoScale`, and that is a decision
rather than an omission. These materials already set `albedoColor` to white - the chakra colour is
baked into the texture, not applied as a tint - so `applySkinTexture()`'s white reset is a no-op and
there is no existing tuning for a ceiling to protect. Adding one for symmetry would darken artwork
for nothing.

### What a target skin cannot affect

- **The drop animation.** `updateDropTargetBank()` lerps only the flag mesh's `position.y` between
  `TARGET_RAISED_Y_M` (0.015) and `TARGET_DROPPED_Y_M` (-0.05) over `TARGET_DROP_ANIM_MS` (220),
  and reads nothing from the material. The QA stages a real hit and asserts the flag reaches the
  dropped position and the **trigger volume does not move** - that split is what keeps scoring
  decoupled from the animation - identically with and without artwork.
- **Collider, size, position.** Extents, positions, rotations and physics bodies are asserted
  byte-identical across unset, broken-path and loaded-artwork.

One limitation the QA states rather than papers over: it does not test the drop's intermediate
interpolation. This headless environment runs at ~1.6 fps with frame deltas up to 677ms against a
220ms animation, so the lerp completes inside a single frame and no intermediate value is
observable at any sampling rate. Endpoints, constants, trigger invariance and skinned-vs-unskinned
equality are observable, and those are what is asserted.

### Authoring note

The plate renders **24x24 screen pixels** at 1280x800. Bold, high-contrast, centred symbols read at
that size; fine linework does not. The 448x480 target is for headroom, not for detail that will
survive.

## Slot spec: `laneInsert*` (four lane families)

**Not populated.** Guarded by `qa/lane-inserts.js` (16 checks).

### One symbol per family

| Slot | Family | Symbol | Meaning |
|---|---|---|---|
| `laneInsertInlane` | INLANE | double chevron down-table | return / flow |
| `laneInsertOutlane` | OUTLANE | bold X | danger / void |
| `laneInsertOrbit` | ORBIT | ring with a tangential arrowhead | cycle / infinity |
| `laneInsertReentry` | RE-ENTRY | earth mark (stem + three stacked bars) | return-to-body / grounding |

`laneInsertReentry` is new in this pass. The re-entry lanes previously had **no** insert slot and
no symbol - three untextured boxes marking a whole vision's objective.

The four differ by **silhouette**, not by detail or colour: chevrons / cross / circle / stacked
horizontals. That is deliberate and measured - an insert is only 17x7 to 41x23 screen pixels at the
gameplay camera, so four variations on an arrow would be indistinguishable. Before this pass,
inlane and outlane drew the *same* down-arrow (two adjacent lanes meaning opposite things - return
the ball, lose the ball) and orbit drew the *same* up-arrow as the skill shot.

An earlier draft gave re-entry a chevron landing on a baseline; it was replaced because it shared
its basic shape with the inlane's chevrons, and two symbols differing only by an added bar are the
pair that stops being distinguishable first as the insert shrinks.

### Authoring artwork for these slots

| | |
|---|---|
| Paths | `assets/skins/lanes/lane-insert-inlane.png` / `-outlane.png` / `-orbit.png` / `-reentry.png` |
| Dimensions | **128x128** (what the procedural lenses use; ample at these on-screen sizes) |
| Kind | `emissive` |
| Colour | **Greyscale.** The texture multiplies the lamp's own identity colour - a coloured file tints it twice. |
| Content | One bold, centred, high-contrast mark on a black ground. No text. Black = emits nothing. |

Emissive is not an implementation detail here: it is the channel the lamp system owns, so a loaded
texture is multiplied by whatever state the lamp is in. Artwork can restyle the symbol and can
never override lit/unlit.

### Lit vs unlit - what was actually wrong

The board-graphics audit found insert state barely readable. The cause was measured rather than
guessed: rendering the inserts in isolation (only insert meshes, glow layer off) and then zeroing
`emissiveColor` showed **85-94% of an unlit insert's brightness was albedo response to the scene
lights** - a constant the lamp system cannot touch. Driving a lamp its full dim-to-lit range
(0.12 to 0.9, a 7.5x change in emitted light) moved the rendered insert only **1.25-1.41x**, because
most of what was on screen was never the lamp.

Lowering that albedo floor put the lamp back in charge:

| | dim -> lit ratio |
|---|---|
| Before | 1.25 - 1.41x |
| After | **1.55 - 1.75x** |
| Ceiling, at albedo zero | 2.01x |

The last stop was rejected: a pure-black unlit lens loses the family's colour identity entirely,
which costs more than the remaining 0.26x buys. Roughness was swept alongside and left alone -
0.55 vs 0.95 moved the ratio by 0.01x, so the residual floor is not a specular lobe.
`qa/lane-inserts.js` re-measures the ratio every run against a 1.40x floor.

### Honest limits at the gameplay camera

Two families read well and two are constrained by things outside the inserts themselves:

- **OUTLANE** - the X is clearly visible lit and absent unlit. Works.
- **RE-ENTRY** - dark olive unlit, bright green lit. State is obvious. Works.
- **INLANE** - the symbol is legible in isolation but is **swamped in situ by flipper bloom**,
  which sits at ~200 luminance directly on the lower lane band. That is the board-graphics audit's
  own top-5 item (pull the flipper and ball bloom back); it is not fixable from inside the insert.
- **ORBIT** - projects to 17x7px because the orbit lamps sit far up-table at a raking angle.
  Enlarging the decorative lens was tested at 1.4x and 1.8x and buys 17x7 -> 23x9, so it was
  rejected: it does not solve the problem (the viewing angle does) and would make the insert
  oversized relative to its lane.

### What this pass did not change

No trigger, collider, score, or lamp-system behaviour. `js/config.js` was not touched, so every
lane trigger still matches the constants it is built from - which `qa/lane-inserts.js` asserts
directly (`LANE_TRIGGER_WIDTH_M`, `ORBIT_TRIGGER_WIDTH_M`/`_DEPTH_M`, `REENTRY_LANE_RADIUS_M`). The
insert lenses carry no physics body at all, which is what makes them incapable of affecting a
trigger however they are restyled.

## How to add real artwork

1. Drop the image at `assets/skins/<subfolder>/<filename>.png` (or `.jpg`/`.webp` - see format
   notes below), matching the path noted in that slot's comment in `js/skins.js`.
2. In `js/skins.js`, change that slot's `path: null` to the matching string, e.g.
   `path: 'playfield/playfield-background.png'`.
3. Reload the page. No other code changes, anywhere, are required - `applySkinTexture()` picks it
   up automatically the next time `buildTable()`/`buildObstacles()` runs.

If the image fails to load for any reason, the existing procedural material stays exactly as it
was - there's no broken/blank-texture state to worry about.

## Asset folder structure

```
assets/
  skins/
    playfield/
      playfield-background.webp    - playfield background/art (playfieldMat) - POPULATED
    cabinet/
      cabinet-rails.png            - cabinet/table artwork (wallMat - all boundary walls)
    bumpers/
      bumper-cap.png                - bumper caps (bumperCapMat, shared by all 4 bumpers)
    targets/
      mission-target-0.png          - mission target faces, one per MISSION_TARGET_BANK index
      mission-target-1.png
      mission-target-2.png
    lanes/
      lane-insert-inlane.png        - lane inserts (backlit rollover discs), one per family
      lane-insert-outlane.png
      lane-insert-orbit.png
      lane-insert-reentry.png
    obstacles/
      obstacle-decal-saturn.png     - obstacle decals
      obstacle-decal-comet.png
      obstacle-decal-slingshot.png
```

This mirrors `SKIN_MANIFEST`'s own grouping in `js/skins.js` exactly - one subfolder per category
named in the original request (playfield background/art, bumper caps, mission target faces, lane
inserts, obstacle decals, cabinet/table artwork). Adding a new decorative slot in the future
should follow the same pattern: a new subfolder (or a new file in an existing one) plus a new
`SKIN_MANIFEST` entry - never a hardcoded path in `babylon-game.js`.

## Image format, resolution, and UV notes

General:

- **Format:** PNG (transparency support, no licensing/patent concerns). JPG or WebP are both fine
  for fully opaque slots (playfield background, cabinet rails) where alpha is never used - WebP in
  particular gives noticeably better compression at equivalent quality (the populated
  `playfieldBackground` slot uses it: 887x1774 at ~325KB). Keep files reasonably small (target
  well under 1MB each) - this is a mobile-first game with no build-time texture compression step.
- **Power-of-two dimensions** (e.g. 512, 1024, 2048) are recommended but not required - Babylon
  will accept non-PoT textures, but PoT sizes mipmap and compress more predictably and avoid any
  GPU-specific edge cases.
- Nothing here needs its own UV-unwrapped model - every skinned mesh is a `MeshBuilder` primitive
  (box/sphere/cylinder/plane) using Babylon's default automatic UVs for that primitive type, so
  "UV requirements" below means "how the image maps onto that primitive's default UV layout,"
  not a custom unwrap.

Per slot:

| Slot | Recommended size | Aspect | Mesh / default UV | Notes |
|---|---|---|---|---|
| `playfieldBackground` | 1024x1820 | matches `TABLE_WIDTH_M` : `TABLE_LENGTH_M` (~0.51 : 0.907, i.e. ~9:16) | `CreateBox` (playfield) | Top face only is ever seen (fixed camera looks down at the playfield); design the full image as a top-down playfield illustration. Portrait orientation, same as the table itself. |
| `cabinetRails` | **64x512 portrait strip** | 1:8 | `CreateBox` x7 (each boundary wall), 42 faces, one shared material | **Not a tileable pattern and not a scene** - a vertical rail *profile*, read top-to-bottom, constant across its width. See the `cabinetRails` section above for why, the band layout to reproduce, and the brightness ceiling. |
| `bumperCap` | 512x512 | 1:1 | `CreateSphere` (flattened, `scaling.y = 0.58`) | **Equirectangular sphere map, not a top-down disc.** The cap's apex is the image's BOTTOM edge; the top 25% of the image never renders. See the `bumperCap` section above for the measurements and the brightness ceiling. |
| `missionTargetFace[0..2]` | **448x480** | **14:15 (0.9333)** - the face is 0.028m x 0.030m | `CreateBox` (thin flag), one material per index | Camera-facing face only. **UV orientation is already correct** - upright, un-mirrored. Artwork inherits a per-index chakra emissive wash. See the `missionTargetFace` section above. |
| `laneInsertInlane` / `-Outlane` / `-Orbit` / `-Reentry` | 128x128 | 1:1 | `CreateCylinder` (flat disc) for the three rollovers; `CreateBox` top face for re-entry | One slot per lane FAMILY, each with its own symbol. Emissive - the texture multiplies the lamp's own colour and state, so artwork restyles the symbol without ever overriding lit/unlit. **Greyscale**: a coloured file tints twice. See the `laneInsert*` section above. |
| `obstacleDecalSaturn` | 256x256 | 1:1 | `CreateSphere` (flattened cap) | Same sphere-UV note as `bumperCap` - keep key content in the visible top band. |
| `obstacleDecalComet` | 256x256 | 1:1 | `CreateSphere` (full sphere, this is the comet's own body/collider) | Standard equirectangular sphere UV - a simple radial/icy pattern reads best given the shallow default camera angle (most of the sphere's far side is never seen). |
| `obstacleDecalSlingshot` | 256x128 | 2:1 | `CreateBox` (thin ridge trim) | Same image is reused for both the left and right slingshot (mirrored geometry, not a mirrored UV) - avoid asymmetric content that would look wrong reversed. |

## What deliberately did NOT change in this pass

- **No gameplay geometry, collider shape/size/position, physics aggregate, trigger, score, or
  cooldown changed anywhere.** `applySkinTexture()` only ever assigns a texture property on an
  already-fully-configured material; it never touches a mesh's shape, transform, or physics body.
- **No existing material was removed.** Every material's own procedural fallback color/texture-
  property state is still set first, on every load - the skin texture (where one is configured) is
  an optional layer on top of that, not a replacement, and `albedoColor`/`diffuseColor` is only
  ever touched by `applySkinTexture()` itself on a *successful* load (see above), never on
  failure. `playfieldMat`'s `metallic`/`roughness` are the one exception worth calling out
  explicitly: those were re-tuned (see "Populated slots" below) as a small unconditional
  improvement to the surface's physical response, so they apply to the fallback flat-color look
  too, not just the textured one - a deliberate choice (the two states should share the same
  physical material, only the color/pattern differs), not an oversight. Removing
  `playfield-background.webp` still reverts the *color* to exactly its pre-artwork flat cosmic
  tint; the surface's roughness/metallic response stays at this pass' slightly glossier tuning
  either way.
- **No artwork was invented.** The one populated slot (`playfieldBackground`) uses artwork
  supplied directly by the user, not generated. Every other subfolder under `assets/skins/`
  contains only a `.gitkeep` placeholder - `cabinet/`, `bumpers/` and `targets/` included. The
  `cabinetRails`, `bumperCap` and `missionTargetFace` passes finalized and tested the paths into
  those slots and wrote the specs above; none produced a file to put in them, and all keep
  `path: null` until a real one exists.
- **The lane-insert pass changed no trigger, collider, score or lamp-system behaviour, and did not
  touch `js/config.js`.** It changed what the inserts look like: four family symbols where two
  pairs previously shared one mark, a lowered albedo floor so the lamp's own state drives the
  rendered brightness, and a fourth skin slot (`laneInsertReentry`) for the re-entry lanes, which
  had none. Two families (inlane, orbit) remain hard to read at the gameplay camera for reasons
  outside the inserts - flipper bloom and viewing angle - documented in their section above rather
  than papered over.
- **The `missionTargetFace` pass changed no code at all.** Its entire diff is comments, this
  document and `qa/skin-mission-targets.js` - the slots already accepted textures cleanly and the
  UV orientation was already correct, which the pass verified rather than altered. The one
  substantive change is to the written spec: the recommended aspect was wrong by 29% (2:3 against
  a real 14:15) and is corrected above.
- **The `bumperCap` pass changed no geometry, UV layout, collider, physics body, score, kick,
  cooldown or hit animation.** Its entire executable change is one manifest field
  (`albedoScale: 0.55` on the `bumperCap` slot) - the multiply it feeds already existed from the
  `cabinetRails` pass. Everything else is comments, this document and `qa/skin-bumper-cap.js`.
  The procedural `createBumperCapTexture()` fallback is byte-for-byte unchanged: its comment was
  corrected to record that its centred-ring drawing does not land as rings on the visible face
  under the sphere's equirectangular UV, but the pixels it draws were deliberately left alone,
  since redrawing them would change the shipped look of every bumper for a pattern that is
  sub-pixel at the cap's 28x24..36x30 on-screen size.
- **The `cabinetRails` pass changed no geometry, UV layout, collider or physics body.**
  `albedoScale` is a new optional manifest field plus the multiply it feeds in
  `applySkinTexture()`; everything else in that pass is comments, this document, and
  `qa/skin-integration.js`. The guard asserts wall extents, positions, rotations and physics-body
  presence are byte-identical across the unset, failed-load and loaded-artwork states, so that
  claim is measured rather than asserted.
