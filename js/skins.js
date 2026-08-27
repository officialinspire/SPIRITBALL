// ===================================
// Decorative-skin asset manifest (visual-architecture pass, user-requested - "prepare
// SPIRITBALL's visual architecture for custom generated artwork/textures WITHOUT adding the
// final artwork yet"). See SKINS.md at the repo root for the full asset-folder layout and the
// per-slot image spec (recommended resolution, aspect ratio, UV/orientation notes).
//
// This file is pure data - a stable skin KEY -> relative file path under SKIN_ASSET_BASE - and
// deliberately has ZERO BABYLON references, for the same reason hexToColor3() in config.js
// stays BABYLON-free at module-evaluation time (see its own comment): a top-level call into the
// BABYLON global here would throw an unguarded ReferenceError if the vendored Babylon bundle
// failed to load, before this project's own load-failure error handling ever gets a chance to
// run. Actually loading one of these paths into a texture happens in exactly one place -
// applySkinTexture() in babylon-game.js - and only after main() has already confirmed BABYLON
// is present.
//
// Every entry's `path` starts at null - not "pointed at a file that doesn't exist yet," but
// genuinely unset - and that is deliberate, not a placeholder oversight. applySkinTexture() no-
// ops immediately on a null path, so an unset slot never issues a network request at all. This
// was a real, empirically-verified design decision, not a style preference: an *attempted*
// request for a file that turns out to 404 still gets logged by Chromium's own network stack as
// a "Failed to load resource: 404" console entry - a browser-level diagnostic tied to the HTTP
// response, completely outside any JS onError handler's control, confirmed via a headless
// Chromium run against a real 404 before this file settled on the null-by-default design. With
// 12 slots below, that would mean 12 console entries on every single load of an otherwise
// artwork-free build - a real regression against this project's own zero-console-error bar, not
// a cosmetic nit. Leaving `path: null` until a real file actually exists keeps today's (and
// every artwork-free) load genuinely silent, while still exercising the exact same
// applySkinTexture() load/fallback path the moment a real path IS filled in.
//
// To add real artwork later: drop the image at assets/skins/<the path in that slot's comment
// below>, then change that slot's `path: null` to the matching string (e.g.
// `path: 'playfield/playfield-background.png'`). No other code changes anywhere in the project
// are required - every call site already reads from this manifest, never a literal path.
// ===================================

// Every path in SKIN_MANIFEST is resolved relative to this base at load time (SKIN_ASSET_BASE +
// path). Centralizing the base here means the whole tree can be relocated (e.g. to a CDN origin
// later) by editing exactly one string, never the call sites in babylon-game.js.
export const SKIN_ASSET_BASE = 'assets/skins/';

// kind: 'albedo' | 'emissive' - which material property applySkinTexture() assigns the loaded
// texture to. Recorded here per-slot (not left to each call site to remember) so the mapping
// between "what this decorative surface is" and "how it's lit" lives in one place. 'albedo'
// surfaces read like printed/painted artwork under the scene's existing lighting; 'emissive'
// surfaces read like a backlit insert glowing on their own, independent of scene light -
// matching which of those two treatments each slot's *current* procedural material already
// uses (see each call site in babylon-game.js).
//
// albedoScale (optional, 'albedo' slots only, default 1): a flat 0..1 multiplier written into
// albedoColor when the artwork loads, instead of the plain white this otherwise resets to. It
// exists because a skin slot is a hole in this project's visual hierarchy: the loaded artwork's
// own exposure is whatever the artist happened to author, and on some surfaces that is not a
// free choice. Declaring the ceiling HERE, as data next to the path it applies to, is what makes
// the hierarchy a property of the slot rather than an instruction an artist has to remember and
// re-apply on every revision of the file. Only set it where a surface has a real reason to stay
// subordinate to something else on the board (cabinetRails is the current case - see its own
// comment); leaving it unset keeps the plain full-brightness reset every other slot wants.
export const SKIN_MANIFEST = {
    // Playfield background/art - the ball-rolling surface itself (playfieldMat in buildTable()).
    // Populated (user-supplied artwork, visual-integration pass) - a portrait 887x1774 cosmic/
    // sacred-geometry piece (webp). See SKINS.md's "Populated slots" note for the aspect-ratio
    // reasoning (the table's own top-face aspect is ~0.5625, the artwork's is exactly 0.5 - close
    // enough that the default full-face UV stretch reads as a deliberate design, not a visible
    // distortion bug, so no custom UV crop was added).
    playfieldBackground: { path: 'playfield/playfield-background.webp', kind: 'albedo' },

    // Cabinet/table artwork - the perimeter wall/rail material (wallMat in buildTable()), shared
    // by every structural boundary wall on the board (top/left/right/slants/guides).
    //
    // ARTWORK SHAPE IS CONSTRAINED HERE, and not in the way an artist would guess. wallMat is a
    // SINGLE material instance on 7 CreateBox walls, every face of every one of them carrying the
    // default full u[0,1]/v[0,1] square, and applySkinTexture() clamps (never repeats). So one
    // image is STRETCHED to fit 42 faces of wildly different shapes rather than tiled across them:
    // measured, the visible long faces alone span 2.01:1 (rightSlant) to 22.67:1 (leftWall), an
    // 11.3x spread, and on the top faces u/v swap axes outright (topWall's top is 18.02:1, the
    // side walls' tops are 0.03:1 - the same image laid down rotated 90 degrees relative to each
    // other). Any detail that varies along u is therefore stretched by a different factor on every
    // wall and cannot be made to line up.
    //
    // What DOES map cleanly on all 42 faces is detail that varies only along v - a vertical rail
    // PROFILE (crown highlight, body falloff, shadowed base band), constant across u. That is
    // exactly what createCabinetRailTexture() draws today and exactly what real artwork here must
    // be: a narrow portrait strip, 64x512, read top-to-bottom as the wall's own cross-section.
    // See SKINS.md's cabinetRails section for the full spec and the per-face measurements.
    //
    // albedoScale is set (and is the only slot that sets it) because the rails are already the
    // brightest large surfaces in frame - HEX_WALL is 0x00ccff, and the right inner wall measures
    // mean luminance 159.6/255 with 15.4% of its pixels clipped to pure white against a playfield
    // at 31.4. They are the table's structural boundary, not a gameplay element, so artwork here
    // has to come in UNDER the bumpers/inserts/flippers it frames rather than out-shouting them.
    // Measured, 0.55 lands the textured rails at 103.0 against the procedural profile's 113.7,
    // and the ceiling is doing real work rather than being decorative: the dimmest lamp-lit
    // gameplay element on the board (bumper0) sits at 119.5, so the fallback clears it by only
    // 5.8 luminance and the ceiling widens that to 16.5. qa/skin-integration.js re-measures all
    // three numbers from real pixels on every run, so a future revision of this value is checked
    // rather than assumed.
    // Future path: 'cabinet/cabinet-rails.png'
    cabinetRails: { path: null, kind: 'albedo', albedoScale: 0.55 },

    // Bumper caps - one shared texture. bumperCapMat (buildObstacles()) is already a single
    // material instance shared by all 4 bumpers' caps (see its own comment: real machines mold
    // every pop-bumper cap from the same plastic regardless of that bumper's own body color), so
    // one shared skin slot matches the existing architecture rather than adding per-bumper
    // variants gameplay never asked for.
    //
    // THIS IS AN EQUIRECTANGULAR SPHERE MAP, NOT A TOP-DOWN DISC, and that is the single thing
    // most likely to be got wrong here because a real bumper cap decal IS a top-down disc. The
    // cap is a CreateSphere flattened to scaling.y 0.58, so Babylon's sphere UV applies: v is
    // latitude, and a row of the image is a line of latitude wrapped all the way around. Measured
    // from the mesh's own vertex data, v=0 is the TOP pole and v=0.5 the equator; measured again
    // by rendering eight labelled bands onto the real caps in the real scene, invertY puts the
    // dome's apex at the image's BOTTOM edge. So:
    //
    //   image bottom edge   -> the cap's apex (a single point, stretched across the full width)
    //   moving UP the image -> moving outward and down the dome
    //   image vertical mid  -> the cap's rim/equator
    //   top 25% of image    -> NEVER RENDERED (the buried underside; measured 0% on all 4 caps)
    //
    // The face a player actually reads - the upper 45% of the cap's silhouette from the gameplay
    // camera - comes 97-99% from the BOTTOM 37.5% of the image, with the last eighth alone (the
    // apex) accounting for 17-20% and the image's vertical middle contributing 1-3%. Design
    // accordingly: content near the image's bottom edge lands dead centre on the cap and must be
    // drawn pre-distorted (wide and short, since it is pinched to a point at the pole), content in
    // the middle of the image lands on the rim, and the top quarter is wasted.
    //
    // Also worth knowing before authoring detail: the whole cap is 28x24 to 36x30 screen pixels
    // at 1280x800. Two or three tonal zones read; fine pattern does not.
    //
    // albedoScale exists here to PRESERVE AN EXISTING DECISION, not to add a new one. The cap
    // albedo was deliberately walked down 0.88 -> 0.66 -> the current 0.54/0.58 by the lighting-
    // hierarchy pass, whose comment records the measurement: the caps were the single brightest
    // surface in the frame after the ball, clipping to 255 across their whole visible face.
    // applySkinTexture() resets albedoColor to white on a successful load, which would throw that
    // tuning away and render artwork ~1.85x brighter than the fallback it replaced - re-creating
    // the exact clipping that pass fixed. 0.55 keeps a skinned cap in the same band the tuned
    // procedural cap already occupies. qa/skin-bumper-cap.js measures that rather than trusting it.
    //
    // A skin here CANNOT affect which bumper is the boss. All three boss cues live outside this
    // material: the 1.5x radius, the boss-only gold trim torus, and the star glyph on its own
    // label plane. One shared texture lands identically on all four caps, so it can only ever
    // change them together - qa/skin-bumper-cap.js re-measures all three cues under artwork chosen
    // specifically to be as hostile to them as possible (flat pure white at full brightness).
    // Future path: 'bumpers/bumper-cap.png'
    bumperCap: { path: null, kind: 'albedo', albedoScale: 0.55 },

    // Mission target faces - per-target-index (MISSION_TARGET_BANK has 3 entries; targetMats[i]
    // is already a distinct material per index). Index order matches MISSION_TARGET_BANK's own
    // array order. Future paths: 'targets/mission-target-0.png' / '-1.png' / '-2.png'
    missionTargetFace: [
        { path: null, kind: 'albedo' },
        { path: null, kind: 'albedo' },
        { path: null, kind: 'albedo' }
    ],

    // Lane inserts - the small backlit discs set into the inlane/outlane/orbit rollovers
    // (buildObstacles()' lampMat instances). Emissive, not albedo - these read as a lit insert,
    // not painted artwork, matching the lamp system's existing emissive-only on/off convention.
    // Future paths: 'lanes/lane-insert-inlane.png' / '-outlane.png' / '-orbit.png'
    laneInsertInlane: { path: null, kind: 'emissive' },
    laneInsertOutlane: { path: null, kind: 'emissive' },
    laneInsertOrbit: { path: null, kind: 'emissive' },

    // Obstacle decals - small decorative accents on the board's named feature obstacles.
    // Future paths: 'obstacles/obstacle-decal-saturn.png' / '-comet.png' / '-slingshot.png'
    obstacleDecalSaturn: { path: null, kind: 'albedo' },
    obstacleDecalComet: { path: null, kind: 'albedo' },
    obstacleDecalSlingshot: { path: null, kind: 'albedo' }
};
