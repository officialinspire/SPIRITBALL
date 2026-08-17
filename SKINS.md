# SPIRITBALL decorative-skin architecture

Status as of this document: **the plumbing exists, no artwork does.** This is the intended state,
not a work-in-progress snapshot - `js/skins.js`'s manifest currently maps every skin slot to
`path: null` on purpose (see that file's own comment for why null, not a guessed filename). This
document describes how to actually add artwork once it exists, and the folder/image spec that
artwork needs to follow.

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

3. **`assets/skins/`** - where the actual image files go, in the subfolders described below. Every
   subfolder currently contains only a `.gitkeep` placeholder.

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
      playfield-background.png     - playfield background/art (playfieldMat)
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

- **Format:** PNG (transparency support, no licensing/patent concerns). JPG is fine for fully
  opaque slots (playfield background, cabinet rails) where alpha is never used. Keep files
  reasonably small (target well under 1MB each) - this is a mobile-first game with no build-time
  texture compression step.
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
- **No existing material was removed.** Every procedural material this pass touched keeps its
  exact original `albedoColor`/`emissiveColor`/`metallic`/`roughness` setup - the skin texture is
  an optional layer on top, not a replacement, and today (with every path `null`) every material
  looks pixel-identical to before this pass.
- **No artwork was created or committed.** Every subfolder under `assets/skins/` contains only a
  `.gitkeep` placeholder.
