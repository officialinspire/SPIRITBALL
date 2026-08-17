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
    // Future path: 'cabinet/cabinet-rails.png'
    cabinetRails: { path: null, kind: 'albedo' },

    // Bumper caps - one shared texture. bumperCapMat (buildObstacles()) is already a single
    // material instance shared by all 4 bumpers' caps (see its own comment: real machines mold
    // every pop-bumper cap from the same plastic regardless of that bumper's own body color), so
    // one shared skin slot matches the existing architecture rather than adding per-bumper
    // variants gameplay never asked for.
    // Future path: 'bumpers/bumper-cap.png'
    bumperCap: { path: null, kind: 'albedo' },

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
