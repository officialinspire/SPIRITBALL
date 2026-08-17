# SPIRITBALL decorative-skin architecture

Status as of this document: **one slot populated (`playfieldBackground`), the rest still
`path: null`.** Every other slot's default-null state is still the intended design, not a
work-in-progress snapshot - see "Why every slot defaults to `path: null`" below for why. This
document describes how to actually add artwork (playfieldBackground already shows the full
worked example), and the folder/image spec that artwork needs to follow.

## What this is for

SPIRITBALL's playfield, obstacles, and lamps are built entirely from procedural Babylon.js
materials (flat colors, PBR albedo/emissive/metallic/roughness values) - no image textures
anywhere. That's still true after this pass. What changed is that a handful of those materials
now have an optional, centrally-configured *texture slot* that will replace (or layer over) the
procedural look, automatically, the moment a matching image file is dropped into
`assets/skins/` and its path is filled in in `js/skins.js`. Nothing else in the project needs to
change - no other file ever hardcodes an asset path, and no gameplay code reads this system at
all.

## The three pieces

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
     image, never a tiling pattern) and `anisotropicFilteringLevel` (capped at 8, only when the
     engine reports hardware support) on every loaded texture - sharpens texture detail at a
     raking viewing angle, which is exactly how this game's fixed camera sees the playfield.

3. **`assets/skins/`** - where the actual image files go, in the subfolders described below.

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
      lane-insert-inlane.png        - lane inserts (backlit rollover discs)
      lane-insert-outlane.png
      lane-insert-orbit.png
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
| `cabinetRails` | 512x512, tileable | 1:1 | `CreateBox` x7 (each boundary wall) | Applied once, shared by every wall segment (different sizes/orientations) - design as a seamlessly-tileable trim/rail pattern, not a single fixed scene, since it repeats at each wall's own aspect ratio. |
| `bumperCap` | 512x512 | 1:1 | `CreateSphere` (flattened, `scaling.y = 0.55`) | Standard sphere UV (equirectangular-ish): design with the "face" content centered around the vertical middle band, since the cap is a shallow dome - only the top portion of the sphere is ever visible. |
| `missionTargetFace[0..2]` | 256x384 | matches the flag mesh, 2:3 portrait (`TARGET_RADIUS_M * 2` wide by `0.03`m... tall relative to width) | `CreateBox` (thin flag) | Front face only is normally visible (angled slightly toward the camera). Keep important content centered - the box's default UV maps the full image to each face independently. |
| `laneInsertInlane` / `-Outlane` / `-Orbit` | 128x128 | 1:1 | `CreateCylinder` (flat disc, height 0.003) | Only the flat top face is seen. Emissive slot - design these bright/high-contrast on a dark or transparent ground; they render additively over the lamp's own on/off emissive color, so a mid-gray image will look dim when the lamp is "off" and full-bright when "on," matching the existing lamp system automatically. |
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
  contains only a `.gitkeep` placeholder.
