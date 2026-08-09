// ===================================
// SPIRITBALL — Babylon.js 3D overhaul
// Stage 2: 3D table geometry + pinball-cabinet camera (babylon-prompts/02-*.md)
// Stage 3: ball physics + anti-stuck logic (babylon-prompts/03-*.md)
// Stage 4: motorized flippers + an authentic Space-Cadet-inspired obstacle layout
//          (babylon-prompts/04-*.md, expanded scope - see that file's implementation note)
// See BABYLON_3D_OVERHAUL.md for the overall architecture.
//
// Scope so far: the static table BOUNDARY, the fixed gameplay camera, one physics-driven ball,
// two motorized flippers, and PLACEHOLDER (unscored) geometry for the pop bumper cluster,
// mission target bank, satellite, slingshots, and re-entry lanes - positioned per a fresh,
// authentic pinball-cabinet-inspired layout rather than a raw port of the old 2D game's
// coordinates. Full scoring/mission logic for those obstacles is still Stage 6's job; this stage
// only establishes where things physically sit and how the ball bounces off them. This file
// supersedes babylon-spike.js as the base for the real game; the spike file stays around as a
// disposable physics-tuning sandbox (per its own stage doc), not because this file depends on it.
// ===================================

(function () {
    'use strict';

    // ===================================
    // Coordinate / scale conversion (the single source of truth every later stage must reuse)
    // ===================================
    //
    // The current 2D game (../index.js) uses CONFIG.width=540 x CONFIG.height=960 pixels, with
    // Phaser's screen convention: +X right, +Y DOWN, rotation measured clockwise-positive on
    // screen. This stage converts that entire layout into a real-world-scale, LEVEL 3D table
    // (see the tilt-convention note below for why "level"), using Babylon's default left-handed
    // convention: +X right, +Y up, +Z "into the screen" / away from the viewer.
    //
    // BABYLON_3D_OVERHAUL.md specified real pinball dimensions of 0.51m x 1.07m, but that pair
    // has a different aspect ratio (0.4766) than the current 2D layout's 540:960 (0.5625).
    // Applying those two numbers as independent non-uniform X/Z scale factors would distort
    // every rotated wall (the slants and guide rails aren't axis-aligned, so non-uniform scaling
    // changes their effective angle and shape, not just their size). Preserving the existing,
    // already-designed table LAYOUT matters more here than hitting an exact real-world figure,
    // so this deliberately deviates from the master doc: ONE uniform scale factor, derived from
    // the width (0.51m target), applied identically to both axes. This keeps every angle and
    // proportion from the 2D layout exactly intact; the resulting table is 0.51m x 0.907m
    // (close to, not identically, "real" pinball length - a reasonable trade to make once, with
    // this comment, rather than silently drifting from the master doc's numbers).
    const PX_TO_M = 0.51 / 540; // uniform scale, ~0.944mm per old pixel
    const TABLE_WIDTH_M = 540 * PX_TO_M; // 0.51
    const TABLE_LENGTH_M = 960 * PX_TO_M; // ~0.9067
    const WALL_HEIGHT_M = 0.04; // new 3D-only dimension - taller than the ball so it can't hop out

    // Converts a 2D CONFIG-space X (0..540) to 3D world X, centered on the table.
    function toWorldX(x2d) {
        return (x2d - 540 / 2) * PX_TO_M;
    }

    // Converts a 2D CONFIG-space Y (0..960, DOWN the screen, 0 = far/top wall, 960 = near/
    // flippers) to 3D world Z. Inverted relative to 2D Y: the far/top wall (2D y=0) becomes
    // +Z ("far" from the camera), and the near/flipper end (2D y=960) becomes -Z ("near" the
    // camera) - matching where the fixed gameplay camera sits (see buildCamera() below).
    function toWorldZ(y2d) {
        return (960 / 2 - y2d) * PX_TO_M;
    }

    // Converts a 2D Phaser rotation (radians, clockwise-positive on a Y-down screen) to a 3D
    // rotation around Babylon's Y axis (vertical - walls lie flat in the X-Z table plane, same
    // role 2D screen-plane rotation played). Because toWorldZ() above inverts one axis relative
    // to the 2D convention, a rotation that reads as one direction in 2D reads as the opposite
    // direction once mapped into this 3D space - negating preserves left/right mirror symmetry
    // between paired pieces (leftSlant/rightSlant, leftGuide/rightGuide) regardless of whether
    // the *overall* sign guess below turns out backwards. NOT visually verified yet (this
    // sandbox cannot load the Babylon CDN - see BABYLON_3D_OVERHAUL.md's risk section): if the
    // whole table looks mirrored end-to-end once viewed for real, flip the sign here in this one
    // place rather than touching each wall's rotation individually.
    function toWorldRotationY(rotation2d) {
        return -rotation2d;
    }

    // ===================================
    // Tilt convention: TILTED GRAVITY, LEVEL GEOMETRY (deliberately different from the Stage 1
    // spike's tilted-geometry approach - see the implementation note in
    // babylon-prompts/02-3d-table-and-camera.md for the full reasoning). All table geometry
    // below is built perfectly level/axis-aligned in local space; gravity itself gets a small
    // -Z component so the ball rolls toward the flipper end, and the CAMERA is angled to sell
    // the visual "tilted cabinet" impression. This keeps every later stage's math simple - wall
    // positions, flipper hinge axes, bumper placements in Stages 4+ never need to account for a
    // globally-tilted parent transform, only the gravity vector (set once, here) does.
    // ===================================
    const TABLE_TILT_DEGREES = 6.5;
    const TILT_RAD = (TABLE_TILT_DEGREES * Math.PI) / 180;
    const GRAVITY_VECTOR_FN = () => new BABYLON.Vector3(
        0,
        -9.8 * Math.cos(TILT_RAD),
        -9.8 * Math.sin(TILT_RAD) // pulls the ball toward -Z, i.e. toward the flipper end
    );

    const BALL_DIAMETER_M = 0.027;
    const BALL_MASS_KG = 0.08;

    // Converted from CONFIG.ballMaxVelocity: 1800 (px/s) in ../index.js, using the same PX_TO_M
    // scale as everything else - a second line of defense against tunneling/instability behind
    // Havok's CCD, same spirit as the old Arcade Physics safety net. See release-prompts/13-*.md
    // for the original 2D value's history.
    const MAX_BALL_SPEED_MS = 1800 * PX_TO_M; // ~1.7 m/s

    // Anti-stuck thresholds, converted from checkBallStuck() in ../index.js (revamped in
    // release-prompts/13-*.md): speed threshold 40px/s -> m/s, kick components 400/380px/s ->
    // m/s. Time values (ms) don't need conversion. "Downhill" in this stage's tilt convention is
    // -Z (see the GRAVITY_VECTOR_FN comment above), replacing the 2D version's "+Y" (toward the
    // bottom of the screen).
    const STUCK_SPEED_THRESHOLD_MS = 40 * PX_TO_M; // ~0.038 m/s
    const STUCK_TIME_THRESHOLD_MS = 450;
    const STUCK_KICK_X_RANGE_MS = 400 * PX_TO_M; // ~0.378 m/s, randomized +/-
    const STUCK_KICK_DOWNHILL_MS = 380 * PX_TO_M; // ~0.359 m/s toward -Z
    const STUCK_KICK_UP_MS = 0.15; // small vertical hop to help clear resting contact - new in
                                    // 3D, no 2D equivalent needed since 2D had no "resting on a
                                    // surface via normal contact" concept the same way

    // ===================================
    // Flippers + obstacle layout: an authentic, Space-Cadet-inspired arrangement, NOT a raw
    // port of the current 2D game's coordinates. The 2D layout put mission targets in a straight
    // column on the far left, fuel lights in a column on the far right, and 4 attack bumpers in
    // a horizontal row near the top - workable in a 2D top-down arcade sense, but not how a real
    // (or Space-Cadet-style) pinball table is actually laid out. This redesigns positions only;
    // the underlying feature set (a target bank, a bumper cluster, a satellite bumper, twin
    // slingshots, re-entry lanes) is unchanged from the existing game, matching real Space Cadet
    // conventions: a tight pop-bumper cluster near table center, an angled target bank in the
    // upper-left, a satellite feature elsewhere up top, slingshots directly above the flippers.
    // ===================================

    // --- Flippers ---
    // Real-world pinball flipper proportions, used directly since this table is already built
    // at real-world scale (no pixel conversion needed for genuinely new elements like this).
    const FLIPPER_LENGTH_M = 0.075;
    const FLIPPER_THICKNESS_M = 0.014;
    const FLIPPER_HEIGHT_M = 0.012;
    const FLIPPER_MASS_KG = 0.03;
    const FLIPPER_GAP_HALF_M = 0.045; // each pivot sits this far from table center X=0
    const FLIPPER_Z_M = -0.36; // near the flipper/near-camera end of the table

    // Sweep angle in radians, converted with plain math, not BABYLON.Tools.ToRadians() - this
    // file's constants are evaluated at script-parse time, before the CDN-load checks inside
    // main() run, so referencing BABYLON up here would throw an unguarded ReferenceError (not a
    // caught, reported failure) if the CDN is blocked, ahead of where the error-handling
    // listeners further down even get registered.
    //
    // The 70-degree sweep magnitude reuses the OLD 2D game's already-tuned value (20deg rest to
    // -50deg active - see release-prompts/01-*.md) but the actual REST ANGLES below are NOT
    // reused from 2D - flippers are a brand-new 3D mechanism (motorized hinge constraint, not a
    // velocity-injection formula), and naively reusing the 2D angle numbers via this file's
    // toWorldRotationY() wall-conversion helper produced physically wrong geometry (paddle tips
    // crossing the centerline AT REST, before activation - verified with a standalone Node
    // script, not by eye, since this sandbox can't render). These values were instead derived by
    // numerically searching for a (rest angle, direction) pair that actually produces correct
    // real-world flipper geometry: tip pointing outward-and-toward-the-near/player-end at rest,
    // swinging toward center-and-up-table when activated - then mirrored exactly for the right
    // flipper (mirroring an angle-plus-rotation-direction pair requires negating both the angle
    // reflection AND the sweep direction, not just the angle - also verified numerically).
    const FLIPPER_SWEEP_RAD = (70 * Math.PI) / 180;
    const FLIPPER_LEFT_REST_RAD = (-100 * Math.PI) / 180;
    const FLIPPER_RIGHT_REST_RAD = (-80 * Math.PI) / 180;

    // Motor tuning - NOT ported from anything (flippers are an entirely new mechanism in this
    // 3D rewrite; the 2D version's velocity-injection formula has no equivalent here). Starting
    // points reasoned from the flipper's own mass/size, not verified by play - see this stage's
    // implementation note for why, and expect to retune once this can actually be tested.
    const FLIPPER_MOTOR_MAX_FORCE = 4; // N*m - generous relative to the flipper's small mass/inertia
    const FLIPPER_ACTIVATE_SPEED_RAD_S = 26; // fast "punch" - the angle limit stops it, like a real solenoid slamming into a mechanical stop
    const FLIPPER_RETURN_SPEED_RAD_S = 9; // slower, controlled return (magnitude only - direction is per-flipper, see createFlipper())

    // --- Obstacle layout (placeholder geometry only this stage - see file header) ---
    const BUMPER_RADIUS_M = 0.02;
    const BUMPER_CLUSTER = [
        { x: 0, z: 0.16 },
        { x: -0.08, z: 0.06 },
        { x: 0.08, z: 0.06 },
        { x: 0, z: -0.02 }
    ]; // 4 bumpers in a tight diamond near table center, matching CONFIG.attackBumperCount in ../index.js

    const TARGET_RADIUS_M = 0.014;
    const MISSION_TARGET_BANK = [
        { x: -0.20, z: 0.32 },
        { x: -0.16, z: 0.28 },
        { x: -0.11, z: 0.24 }
    ]; // 3 targets in an angled upper-left bank, matching CONFIG.missionTargetCount

    const SATELLITE_RADIUS_M = 0.024;
    const SATELLITE_POS = { x: 0.16, z: 0.36 }; // upper-right, deliberately opposite the target bank

    const SLINGSHOT_SIZE_M = 0.05;
    const SLINGSHOTS = [
        { x: -0.13, z: -0.30, mirror: 1 },
        { x: 0.13, z: -0.30, mirror: -1 }
    ]; // directly above/outside each flipper, like real slingshot kickers

    const REENTRY_LANE_RADIUS_M = 0.016;
    const REENTRY_LANES = [
        { x: -0.14, z: 0.40 },
        { x: 0, z: 0.40 },
        { x: 0.14, z: 0.40 }
    ]; // 3 lanes near the top wall, matching CONFIG.reentryLaneCount

    // ===================================
    // Plunger / launch lane (babylon-prompts/05-*.md). Per that stage's own recommendation, this
    // is a kinematic-animated plunger mesh (no physics body of its own) plus a directly-set ball
    // velocity on release - not a simulated spring - for the same determinism reasons the 2D
    // version (CONFIG.plungerMinPower/plungerMaxPower, updatePlunger()/launchBall() in
    // ../index.js, hardened in release-prompts/13-*.md) kept its launch mechanic simple.
    // ===================================

    // Launch lane position/size, ported from setupPlunger()'s launchPort rectangle and
    // resetBall()'s ball-rest position in ../index.js (2D CONFIG-space pixels), not redesigned.
    const BALL_REST_X_PX = 470; // matches resetBall()'s (CONFIG.width-70, CONFIG.height-220) exactly
    const BALL_REST_Z_PX = 740;
    // The lane's only wall that didn't already exist: rightWall (see buildTable()) already forms
    // the lane's outer edge, but nothing separated it from the main playfield on the inner side.
    // NOT derived from setupPlunger()'s launchPort rectangle (center 495, width 50, "inner edge"
    // at 470, same as BALL_REST_X_PX) - confirmed that rectangle is purely decorative in the 2D
    // game (setupPlunger() never calls physics.add.existing() on it, unlike every real wall in
    // setupTable()), so reusing 470 for a genuine physics wall here would put the ball resting
    // flush against it with zero clearance. Node-verified: needs >= ball radius (0.0135m) + this
    // wall's own half-thickness (~0.0038m) =~0.017m of clearance from BALL_REST_X_PX; picked 30px
    // (~0.028m) for a comfortable margin, which also reads as a believably real-width lane.
    const LANE_INNER_WALL_X_PX = BALL_REST_X_PX - 30; // 440
    const LANE_WALL_Z_TOP_PX = 500; // a bit past the old decorative port's own 535-785 span for margin
    const LANE_WALL_Z_BOTTOM_PX = 830;

    const PLUNGER_CHARGE_TIME_MS = 2000; // same charge window as CONFIG.plungerChargeTime
    // Power range ported from CONFIG.plungerMinPower/plungerMaxPower (700/1600 px/s) via the same
    // PX_TO_M scale used for MAX_BALL_SPEED_MS in 03-*.md - these become target ball speeds in
    // m/s, directly set on release (not an impulse - see the block comment above), consistent
    // with how updateBallPhysics()'s anti-stuck kick already sets velocity directly rather than
    // applying a force/impulse.
    const PLUNGER_MIN_POWER_MS = 700 * PX_TO_M; // ~0.66 m/s
    const PLUNGER_MAX_POWER_MS = 1600 * PX_TO_M; // ~1.51 m/s - comfortably under MAX_BALL_SPEED_MS
    // launchBall()'s horizontal kick (-(150 + power*0.08)) ported the same way: a fixed base plus
    // a ratio of the power itself, so proportionally weaker/stronger launches still curve the same
    // relative amount.
    const PLUNGER_HORIZONTAL_BASE_MS = 150 * PX_TO_M;
    const PLUNGER_HORIZONTAL_RATIO = 0.08;

    const PLUNGER_REST_Z_M = -0.02; // new 3D-only visual detail: how far the plunger tip sits
    const PLUNGER_TRAVEL_M = 0.045; // from the ball at rest, and how far it pulls back at full charge

    // ===================================
    // Scoring, collision/trigger detection, and the drain zone (babylon-prompts/06-*.md).
    //
    // SCOPE DECISION for this pass, made explicitly rather than silently: the full mission FSM in
    // ../index.js (mission select/start/complete/abort, fuel depletion, rank-up, the mission-
    // target-selects-mission flow) is deeply tied to Phaser UI that doesn't exist in this build
    // yet (popups, HUD text, mission-select feedback - that's Stage 12's job). Porting that logic
    // now, with nothing able to display it, would be dead code nobody could verify. What IS
    // ported for real this stage: the point values, the physical-vs-trigger collision
    // architecture the doc asks for, per-object hit cooldowns (ported from
    // isOnCooldown()/setCooldown()), and the drain zone (ball-loss detection), all driving a
    // minimal score/lives readout on the existing dev status panel. Mission logic is deferred to
    // whenever Stage 12's real UI exists to show it.
    //
    // Point values ported directly from CONFIG.scores in ../index.js (not redesigned).
    const SCORE_ATTACK_BUMPER = 500;
    const SCORE_SATELLITE = 1000;
    const SCORE_MISSION_TARGET = 750;
    const SCORE_REENTRY_LANE = 2000;
    const SCORE_SLINGSHOT = 100;

    // Cooldown durations ported from setupCollisions()'s setCooldown() calls in ../index.js.
    const COOLDOWN_BUMPER_MS = 300;
    const COOLDOWN_SATELLITE_MS = 400;
    const COOLDOWN_SLINGSHOT_MS = 200;
    const COOLDOWN_MISSION_TARGET_MS = 500;
    const COOLDOWN_REENTRY_LANE_MS = 1000;

    // Drain zone, ported from setupDrainZone() in ../index.js (2D px: center x=270 (table
    // center), y=1010 (50px past the table's bottom edge), width=540, height=150). The 3D table
    // boundary (buildTable()) was already built with no "bottom wall" - Stage 2 faithfully ported
    // setupTable()'s 7 walls, none of which close off the bottom, matching the 2D game's actual
    // open gap between the flippers for the ball to drain through. This trigger volume is what
    // catches it on the far side of that gap, well past FLIPPER_Z_M (-0.36).
    const DRAIN_ZONE_WIDTH_M = TABLE_WIDTH_M;
    const DRAIN_ZONE_DEPTH_PX = 150;
    const DRAIN_ZONE_CENTER_Y_PX = 1010;

    const STARTING_LIVES = 3; // ported from CONFIG.startingLives

    // ===================================
    // Loading/error handling - same hardened pattern proven out in babylon-spike.js after real
    // playtesting found the original version could hang silently. See that file's Stage 1
    // implementation note for why each piece here exists.
    // ===================================
    const statusHavok = document.getElementById('status-havok');
    const statusBalls = document.getElementById('status-balls');
    const statusStuckTimer = document.getElementById('status-stuck-timer');
    const statusCcd = document.getElementById('status-ccd');
    const dropBtn = document.getElementById('drop-btn');
    const clearBtn = document.getElementById('clear-btn');
    const ccdTestBtn = document.getElementById('ccd-test-btn');
    const stuckTestBtn = document.getElementById('stuck-test-btn');
    const errorPanel = document.getElementById('error-panel');
    const errorMessage = document.getElementById('error-message');
    const canvas = document.getElementById('renderCanvas');

    function showFatalError(title, err) {
        console.error(title, err);
        errorPanel.style.display = 'block';
        // Only stomp the Havok status to FAILED if it wasn't already confirmed OK - otherwise a
        // later, unrelated failure (e.g. flipper/constraint setup) misleadingly reads as "Havok
        // is broken" when Havok itself loaded and initialized fine.
        if (statusHavok.textContent !== 'OK') {
            statusHavok.textContent = 'FAILED';
            statusHavok.className = 'bad';
        }
        const detail = err && err.stack ? err.stack : String(err);
        errorMessage.textContent = title + '\n\n' + detail;
    }

    window.addEventListener('error', (event) => {
        showFatalError('Uncaught error.', event.error || event.message);
    });
    window.addEventListener('unhandledrejection', (event) => {
        showFatalError('Unhandled promise rejection.', event.reason);
    });

    function withTimeout(promise, timeoutMs, label) {
        let timer;
        const timeout = new Promise((_, reject) => {
            timer = setTimeout(() => {
                reject(new Error(label + ' did not finish within ' + (timeoutMs / 1000) + 's.'));
            }, timeoutMs);
        });
        return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
    }

    function setStatus(text) {
        statusHavok.textContent = text;
        statusHavok.className = '';
    }

    // ===================================
    // Table geometry, ported from ../index.js GameScene.setupTable(). Boundary only (matches
    // this stage's scope) - the center divider post between the flippers is NOT included here;
    // it belongs conceptually with the flipper/obstacle work in later stages, not the outer
    // boundary this stage is responsible for.
    // ===================================
    function buildTable(scene) {
        const wallMat = new BABYLON.StandardMaterial('wallMat', scene);
        wallMat.diffuseColor = new BABYLON.Color3(0.1, 0.5, 0.55); // placeholder only - Stage 7 does real materials

        // [x2d, y2d, width2d, height2d, rotation2d] - lifted directly from setupTable() in
        // ../index.js so this stays a faithful port, not a redesign.
        const wallDefs = [
            { name: 'topWall', x: 270, y: 15, w: 540, h: 30, rot: 0 },
            { name: 'leftWall', x: 15, y: 480, w: 30, h: 960, rot: 0 },
            { name: 'rightWall', x: 525, y: 480, w: 30, h: 960, rot: 0 },
            { name: 'leftSlant', x: 90, y: 760, w: 180, h: 20, rot: -0.5 },
            { name: 'rightSlant', x: 450, y: 760, w: 180, h: 20, rot: 0.5 },
            { name: 'leftGuide', x: 100, y: 450, w: 200, h: 15, rot: 1.2 },
            { name: 'rightGuide', x: 440, y: 450, w: 200, h: 15, rot: -1.2 }
        ];

        const walls = wallDefs.map((def) => {
            const mesh = BABYLON.MeshBuilder.CreateBox(def.name, {
                width: def.w * PX_TO_M,
                height: WALL_HEIGHT_M,
                depth: def.h * PX_TO_M
            }, scene);
            mesh.position.set(toWorldX(def.x), WALL_HEIGHT_M / 2, toWorldZ(def.y));
            mesh.rotation.y = toWorldRotationY(def.rot);
            mesh.material = wallMat;

            new BABYLON.PhysicsAggregate(
                mesh,
                BABYLON.PhysicsShapeType.BOX,
                { mass: 0, restitution: 0.3, friction: 0.6 },
                scene
            );

            return mesh;
        });

        // A large, level base plane under everything, purely so a ball that somehow gets past a
        // boundary gap is still visible resting somewhere instead of vanishing (a debugging aid
        // for this stage, not a claim that the layout is gap-free - that still needs a real
        // playtest with the drop-ball tool below). Not part of the "official" table geometry.
        const floor = BABYLON.MeshBuilder.CreateBox('debugFloor', {
            width: TABLE_WIDTH_M * 2,
            height: 0.01,
            depth: TABLE_LENGTH_M * 2
        }, scene);
        floor.position.set(0, -0.15, 0);
        const floorMat = new BABYLON.StandardMaterial('floorMat', scene);
        floorMat.diffuseColor = new BABYLON.Color3(0.3, 0, 0.1);
        floorMat.alpha = 0.5;
        floor.material = floorMat;
        new BABYLON.PhysicsAggregate(floor, BABYLON.PhysicsShapeType.BOX, { mass: 0, restitution: 0.1, friction: 0.8 }, scene);

        return walls;
    }

    // The launch lane's one missing wall (see LANE_INNER_WALL_X_PX's comment) - separates the
    // plunger channel from the main playfield. rightWall (above) already forms the lane's outer
    // edge, so this is the only new physical geometry this stage needs beyond that.
    function buildLaunchLane(scene) {
        const laneMat = new BABYLON.StandardMaterial('laneWallMat', scene);
        laneMat.diffuseColor = new BABYLON.Color3(0.1, 0.5, 0.55);

        const wall = BABYLON.MeshBuilder.CreateBox('launchLaneWall', {
            width: 8 * PX_TO_M,
            height: WALL_HEIGHT_M,
            depth: (LANE_WALL_Z_BOTTOM_PX - LANE_WALL_Z_TOP_PX) * PX_TO_M
        }, scene);
        wall.position.set(
            toWorldX(LANE_INNER_WALL_X_PX),
            WALL_HEIGHT_M / 2,
            toWorldZ((LANE_WALL_Z_TOP_PX + LANE_WALL_Z_BOTTOM_PX) / 2)
        );
        wall.material = laneMat;
        new BABYLON.PhysicsAggregate(wall, BABYLON.PhysicsShapeType.BOX, { mass: 0, restitution: 0.3, friction: 0.6 }, scene);

        return wall;
    }

    // Kinematic-animated plunger mesh (no physics body - see the "Plunger / launch lane" block
    // comment above). chargePercent (0-1) directly drives its Z position between rest and
    // fully-pulled-back; main() reads/writes .chargePercent every frame, this function only
    // builds the mesh and applies whatever chargePercent currently holds.
    function createPlunger(scene, mat) {
        const mesh = BABYLON.MeshBuilder.CreateCylinder('plunger', {
            diameter: 8 * PX_TO_M,
            height: 0.03,
            tessellation: 12
        }, scene);
        mesh.rotation.x = Math.PI / 2; // lay the cylinder flat along Z, the lane's long axis
        mesh.material = mat;

        const plunger = {
            mesh,
            chargePercent: 0,
            baseX: toWorldX(BALL_REST_X_PX),
            baseY: 0.02,
            baseZ: toWorldZ(BALL_REST_Z_PX) + PLUNGER_REST_Z_M
        };
        plunger.mesh.position.set(plunger.baseX, plunger.baseY, plunger.baseZ);
        return plunger;
    }

    function updatePlungerVisual(plunger) {
        // Pulls back along -Z (toward the near/camera end) as charge increases, matching the 2D
        // plunger sprite's tween-back-then-snap-forward motion - see release-prompts/13-*.md.
        plunger.mesh.position.z = plunger.baseZ - plunger.chargePercent * PLUNGER_TRAVEL_M;
        // Simple color pulse at max charge in place of a particle effect (Stage 8's job) - the
        // stage doc explicitly allows this as the minimum viable max-charge feedback for now.
        if (plunger.chargePercent >= 1) {
            plunger.mesh.material.emissiveColor = new BABYLON.Color3(0, 0.8, 0.8);
        } else {
            plunger.mesh.material.emissiveColor = new BABYLON.Color3(0, 0.2, 0.2);
        }
    }

    // Fixed, non-orbitable pinball-cabinet camera: positioned near the flipper end (-Z, per the
    // toWorldZ() convention above), above the table surface, angled up the table's length -
    // matching the reference screenshot's vantage point. UniversalCamera (not ArcRotateCamera)
    // because this must never be player-controllable during gameplay; no attachControl() call.
    function buildCamera(scene) {
        const camera = new BABYLON.UniversalCamera(
            'gameplayCamera',
            new BABYLON.Vector3(0, 0.36, -(TABLE_LENGTH_M / 2) - 0.32),
            scene
        );
        camera.setTarget(new BABYLON.Vector3(0, 0, TABLE_LENGTH_M * 0.12));
        camera.fov = BABYLON.Tools.ToRadians(50);
        camera.minZ = 0.01;
        return camera;
    }

    // Creates one physics-driven ball at the given position. Shared by the main game ball and
    // the Stage 2 debug drop-tool below, so there's exactly one place that defines "what a
    // SPIRITBALL ball is" physically.
    function createBall(scene, position, ballMat) {
        const mesh = BABYLON.MeshBuilder.CreateSphere('ball', { diameter: BALL_DIAMETER_M }, scene);
        mesh.position.copyFrom(position);
        mesh.material = ballMat;

        const aggregate = new BABYLON.PhysicsAggregate(
            mesh,
            BABYLON.PhysicsShapeType.SPHERE,
            { mass: BALL_MASS_KG, restitution: 0.65, friction: 0.35 },
            scene
        );

        // Continuous collision detection - confirmed real Havok/Babylon method names (see
        // BABYLON_3D_OVERHAUL.md); defensively checked rather than assumed, same as Stage 1/2.
        if (aggregate.body && typeof aggregate.body.setCcdMotionThreshold === 'function') {
            aggregate.body.setCcdMotionThreshold(BALL_DIAMETER_M * 0.5);
            aggregate.body.setCcdSweptSphereRadius(BALL_DIAMETER_M * 0.5);
        } else {
            console.warn('CCD methods not found on this Havok PhysicsBody build - tunneling protection may be reduced to the manual max-speed clamp only.');
        }

        return { mesh, aggregate, stuckTimeMs: 0 };
    }

    // Per-frame ball physics maintenance: max-speed clamp (defense #2 behind Havok's CCD) and
    // the anti-stuck recovery, ported from checkBallStuck() in ../index.js. Deliberately mirrors
    // that function's "accumulate, then one decisive kick" design rather than the per-frame
    // nudge it replaced - see the STUCK_* constants' comment for why that matters. `ball` is one
    // of the {mesh, aggregate, stuckTimeMs} objects created by createBall().
    function updateBallPhysics(ball, deltaMs) {
        if (!ball.aggregate.body) return;

        const v = ball.aggregate.body.getLinearVelocity();
        const speed = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);

        if (speed > MAX_BALL_SPEED_MS) {
            const scale = MAX_BALL_SPEED_MS / speed;
            ball.aggregate.body.setLinearVelocity(new BABYLON.Vector3(v.x * scale, v.y * scale, v.z * scale));
        }

        if (speed < STUCK_SPEED_THRESHOLD_MS) {
            ball.stuckTimeMs += deltaMs;
            if (ball.stuckTimeMs >= STUCK_TIME_THRESHOLD_MS) {
                const kickX = (Math.random() - 0.5) * STUCK_KICK_X_RANGE_MS;
                ball.aggregate.body.setLinearVelocity(new BABYLON.Vector3(kickX, STUCK_KICK_UP_MS, -STUCK_KICK_DOWNHILL_MS));
                ball.stuckTimeMs = 0;
            }
        } else {
            ball.stuckTimeMs = 0;
        }
    }

    // ===================================
    // Flippers: motorized, limited Physics6DoFConstraint hinges. Uses BABYLON.Physics6DoFConstraint
    // rather than the simpler HingeConstraint, and setAxisMotorType/setAxisMotorTarget/
    // setAxisMotorMaxForce for the motor - all confirmed real, current Babylon.js API (checked
    // directly against Babylon's source/docs before writing this, not guessed - see
    // BABYLON_3D_OVERHAUL.md and babylon-prompts/04-*.md's implementation note).
    //
    // BIGGEST UNVERIFIED ASSUMPTION IN THIS STAGE: that a Physics6DoFConstraint's angular limits
    // (minLimit/maxLimit) are measured relative to the two bodies' RELATIVE orientation at the
    // moment the constraint is created, not some absolute world reference. This code is built
    // entirely around that assumption (each flipper is created already posed at its own rest
    // angle, then limited to [0, FLIPPER_SWEEP_RAD] "from there"). If this sandbox's CDN weren't
    // blocked this would have been confirmed empirically before writing the rest of this file;
    // instead, the on-page flipper-angle readout (see main()) exists specifically so a human can
    // immediately see whether this assumption held - if a flipper doesn't move, moves the wrong
    // way, or both flippers move the same absolute direction instead of mirroring, this is where
    // to look first. (First real playtest showed both flippers reading a static 0.0deg even at
    // rest - that turned out to be a separate bug in the readout itself, not this assumption; see
    // flipperAngleDegrees()'s comment. This assumption is still unconfirmed pending a retest with
    // the fixed readout.)
    // ===================================
    function createFlipper(scene, name, pivotWorldPos, isLeft, mat) {
        const anchor = BABYLON.MeshBuilder.CreateBox(name + 'Anchor', { size: 0.006 }, scene);
        anchor.position.copyFrom(pivotWorldPos);
        anchor.isVisible = false;
        const anchorAggregate = new BABYLON.PhysicsAggregate(anchor, BABYLON.PhysicsShapeType.BOX, { mass: 0 }, scene);

        // Rest angle and mirroring: see FLIPPER_LEFT_REST_RAD/FLIPPER_RIGHT_REST_RAD's comment -
        // these are NOT simple negations of each other, because mirroring a rotating object
        // requires flipping both the angle AND the direction it sweeps in, not just the angle.
        const restAngleRad = isLeft ? FLIPPER_LEFT_REST_RAD : FLIPPER_RIGHT_REST_RAD;
        const halfLength = FLIPPER_LENGTH_M / 2;
        const offsetX = halfLength * Math.cos(restAngleRad);
        const offsetZ = halfLength * Math.sin(restAngleRad);

        const mesh = BABYLON.MeshBuilder.CreateBox(name, {
            width: FLIPPER_LENGTH_M,
            height: FLIPPER_HEIGHT_M,
            depth: FLIPPER_THICKNESS_M
        }, scene);
        mesh.position.set(pivotWorldPos.x + offsetX, pivotWorldPos.y, pivotWorldPos.z + offsetZ);
        mesh.rotation.y = restAngleRad;
        mesh.material = mat;

        const aggregate = new BABYLON.PhysicsAggregate(
            mesh,
            BABYLON.PhysicsShapeType.BOX,
            { mass: FLIPPER_MASS_KG, restitution: 0.3, friction: 0.4 },
            scene
        );

        // Limit range: left sweeps from the creation pose (0) toward +SWEEP; right sweeps from
        // the creation pose (0) toward -SWEEP - the mirrored motor direction that makes the
        // right flipper a true mirror image of the left, not just a mirrored rest angle with the
        // same rotation direction (verified numerically - see the constants' comment).
        const minLimit = isLeft ? 0 : -FLIPPER_SWEEP_RAD;
        const maxLimit = isLeft ? FLIPPER_SWEEP_RAD : 0;

        const constraint = new BABYLON.Physics6DoFConstraint({
            pivotA: BABYLON.Vector3.Zero(),
            pivotB: new BABYLON.Vector3(-halfLength, 0, 0),
            perpAxisA: new BABYLON.Vector3(1, 0, 0),
            perpAxisB: new BABYLON.Vector3(1, 0, 0)
        }, [
            { axis: BABYLON.PhysicsConstraintAxis.ANGULAR_Y, minLimit: minLimit, maxLimit: maxLimit }
        ], scene);

        // Constraint must be attached to the bodies BEFORE any setAxisMotor*() call - Havok only
        // allocates constraint._pluginData (an array the plugin iterates over internally) inside
        // addConstraint()/initConstraint(). Calling a motor setter first hits an empty/undefined
        // _pluginData and throws "not iterable". Confirmed against Babylon's actual source
        // (havokPlugin.ts's own initConstraint comment even calls this ordering "real weird").
        // This was caught via a real Android Chrome playtest, not caught in this sandbox, since
        // this sandbox cannot load the Havok/Babylon CDN to exercise this code path at all.
        anchorAggregate.body.addConstraint(aggregate.body, constraint);

        constraint.setAxisMotorType(BABYLON.PhysicsConstraintAxis.ANGULAR_Y, BABYLON.PhysicsConstraintMotorType.VELOCITY);
        constraint.setAxisMotorMaxForce(BABYLON.PhysicsConstraintAxis.ANGULAR_Y, FLIPPER_MOTOR_MAX_FORCE);
        constraint.setAxisMotorTarget(BABYLON.PhysicsConstraintAxis.ANGULAR_Y, 0);

        // motorSign: left activates toward +maxLimit (positive motor target), right activates
        // toward -maxLimit/minLimit (negative motor target) - see the limit range above.
        const motorSign = isLeft ? 1 : -1;

        return { mesh, aggregate, constraint, active: false, motorSign };
    }

    function activateFlipper(flipper) {
        if (flipper.active) return;
        flipper.active = true;
        flipper.constraint.setAxisMotorTarget(
            BABYLON.PhysicsConstraintAxis.ANGULAR_Y,
            flipper.motorSign * FLIPPER_ACTIVATE_SPEED_RAD_S
        );
    }

    function deactivateFlipper(flipper) {
        flipper.active = false;
        flipper.constraint.setAxisMotorTarget(
            BABYLON.PhysicsConstraintAxis.ANGULAR_Y,
            -flipper.motorSign * FLIPPER_RETURN_SPEED_RAD_S
        );
    }

    // A physics-driven mesh's `.rotation` Euler property is NOT reliable for reading its current
    // orientation. Confirmed against Babylon's actual source (transformNode.pure.ts): the
    // rotationQuaternion setter explicitly resets `.rotation` to (0,0,0) the moment
    // rotationQuaternion takes over ("// reset the rotation vector" in Babylon's own code) -
    // which happens automatically inside PhysicsAggregate's PhysicsBody constructor. Havok's
    // per-frame sync then only ever writes rotationQuaternion, never touches `.rotation` again -
    // so `.rotation.y` stays permanently frozen at 0 for the whole life of any physics body.
    // (This is what made the flipper-angle readout below show a static 0.0deg for both flippers
    // even once real playtesting on a physical device confirmed Havok, the table, and the ball
    // were all otherwise working - a broken readout, not proof of a broken constraint.)
    function flipperAngleDegrees(mesh) {
        if (mesh.rotationQuaternion) {
            return (mesh.rotationQuaternion.toEulerAngles().y * 180) / Math.PI;
        }
        return (mesh.rotation.y * 180) / Math.PI;
    }

    // ===================================
    // Obstacle layout - placeholder geometry only (see file header). All static (mass: 0) so
    // they don't need their own anti-stuck/velocity-clamp handling; restitution alone gives a
    // plausible physical "feel" (bouncy pop bumpers/slingshots vs. firmer targets/lanes) without
    // needing collision-event wiring, which is Stage 6's job once real scoring/mission logic
    // needs to know exactly when the ball touched what. Mission targets and re-entry lanes are
    // solid colliders for now, not the "detect but don't block" sensor volumes they'll become in
    // Stage 6 - a deliberate simplification, not an oversight (see this stage's implementation
    // note for why building real trigger/sensor detection wasn't taken on this turn).
    // ===================================
    function buildObstacles(scene) {
        const bumperMat = new BABYLON.StandardMaterial('bumperMat', scene);
        bumperMat.diffuseColor = new BABYLON.Color3(0, 1, 0.6);
        bumperMat.emissiveColor = new BABYLON.Color3(0, 0.3, 0.2);

        BUMPER_CLUSTER.forEach((pos, i) => {
            const mesh = BABYLON.MeshBuilder.CreateSphere('bumper' + i, { diameter: BUMPER_RADIUS_M * 2 }, scene);
            mesh.position.set(pos.x, BUMPER_RADIUS_M, pos.z);
            mesh.material = bumperMat;
            mesh.metadata = { kind: 'bumper' };
            // Physical body, not a trigger - restitution alone gives the bounce; the ball's
            // collision observable (see main()) reports the hit for scoring on top of that.
            new BABYLON.PhysicsAggregate(mesh, BABYLON.PhysicsShapeType.SPHERE, { mass: 0, restitution: 0.85, friction: 0.3 }, scene);
        });

        const targetMat = new BABYLON.StandardMaterial('targetMat', scene);
        targetMat.diffuseColor = new BABYLON.Color3(1, 0, 0.8);
        targetMat.emissiveColor = new BABYLON.Color3(0.3, 0, 0.25);

        MISSION_TARGET_BANK.forEach((pos, i) => {
            const mesh = BABYLON.MeshBuilder.CreateBox('missionTarget' + i, {
                width: TARGET_RADIUS_M * 2,
                height: 0.03,
                depth: 0.008
            }, scene);
            mesh.position.set(pos.x, 0.015, pos.z);
            mesh.material = targetMat;
            mesh.metadata = { kind: 'missionTarget', index: i };
            const aggregate = new BABYLON.PhysicsAggregate(mesh, BABYLON.PhysicsShapeType.BOX, { mass: 0, restitution: 0.4, friction: 0.5 }, scene);
            // Trigger, not physical - detect-only per the doc (mission targets don't block the
            // ball in the 2D game either; they're an overlap, not a collider, in setupCollisions()).
            aggregate.shape.isTrigger = true;
        });

        const satelliteMat = new BABYLON.StandardMaterial('satelliteMat', scene);
        satelliteMat.diffuseColor = new BABYLON.Color3(1, 0.65, 0);
        satelliteMat.emissiveColor = new BABYLON.Color3(0.3, 0.2, 0);
        const satelliteMesh = BABYLON.MeshBuilder.CreateSphere('satellite', { diameter: SATELLITE_RADIUS_M * 2 }, scene);
        satelliteMesh.position.set(SATELLITE_POS.x, SATELLITE_RADIUS_M, SATELLITE_POS.z);
        satelliteMesh.material = satelliteMat;
        satelliteMesh.metadata = { kind: 'satellite' };
        // Physical (collider in the 2D game's setupCollisions(), not an overlap) - see this
        // stage's implementation note for the full physical-vs-trigger mapping ported from there.
        new BABYLON.PhysicsAggregate(satelliteMesh, BABYLON.PhysicsShapeType.SPHERE, { mass: 0, restitution: 0.8, friction: 0.3 }, scene);

        const slingshotMat = new BABYLON.StandardMaterial('slingshotMat', scene);
        slingshotMat.diffuseColor = new BABYLON.Color3(1, 0, 1);
        slingshotMat.emissiveColor = new BABYLON.Color3(0.3, 0, 0.3);

        SLINGSHOTS.forEach((def, i) => {
            const mesh = BABYLON.MeshBuilder.CreateBox('slingshot' + i, {
                width: SLINGSHOT_SIZE_M,
                height: 0.03,
                depth: SLINGSHOT_SIZE_M * 0.5
            }, scene);
            mesh.position.set(def.x, 0.015, def.z);
            mesh.rotation.y = def.mirror * BABYLON.Tools.ToRadians(20); // angled inward, like a real slingshot kicker
            mesh.material = slingshotMat;
            mesh.metadata = { kind: 'slingshot' };
            new BABYLON.PhysicsAggregate(mesh, BABYLON.PhysicsShapeType.BOX, { mass: 0, restitution: 0.85, friction: 0.3 }, scene);
        });

        const laneMat = new BABYLON.StandardMaterial('laneMat', scene);
        laneMat.diffuseColor = new BABYLON.Color3(1, 1, 0);
        laneMat.alpha = 0.6;

        REENTRY_LANES.forEach((pos, i) => {
            const mesh = BABYLON.MeshBuilder.CreateBox('reentryLane' + i, {
                width: REENTRY_LANE_RADIUS_M * 2,
                height: 0.02,
                depth: 0.03
            }, scene);
            mesh.position.set(pos.x, 0.01, pos.z);
            mesh.material = laneMat;
            mesh.metadata = { kind: 'reentryLane', index: i };
            const aggregate = new BABYLON.PhysicsAggregate(mesh, BABYLON.PhysicsShapeType.BOX, { mass: 0, restitution: 0.3, friction: 0.5 }, scene);
            aggregate.shape.isTrigger = true; // overlap, not collider, in setupCollisions()
        });
    }

    // Drain zone (Stage 6, babylon-prompts/06-*.md) - see the block comment above SCORE_ATTACK_
    // BUMPER for the 2D->3D position conversion. A trigger volume, not a wall - the ball should
    // pass into it, not bounce off it.
    function buildDrainZone(scene) {
        const mesh = BABYLON.MeshBuilder.CreateBox('drainZone', {
            width: DRAIN_ZONE_WIDTH_M,
            height: 0.06,
            depth: DRAIN_ZONE_DEPTH_PX * PX_TO_M
        }, scene);
        mesh.position.set(0, 0.02, toWorldZ(DRAIN_ZONE_CENTER_Y_PX));
        mesh.isVisible = false; // invisible void, matching the 2D game's black drain graphic being purely decorative
        mesh.metadata = { kind: 'drainZone' };
        const aggregate = new BABYLON.PhysicsAggregate(mesh, BABYLON.PhysicsShapeType.BOX, { mass: 0 }, scene);
        aggregate.shape.isTrigger = true;
        return mesh;
    }

    async function main() {
        setStatus('checking scripts…');

        if (typeof BABYLON === 'undefined') {
            throw new Error('window.BABYLON is undefined - check network access to cdn.babylonjs.com.');
        }
        if (typeof HavokPhysics === 'undefined') {
            throw new Error('window.HavokPhysics is undefined - check network access to cdn.babylonjs.com.');
        }

        const engine = new BABYLON.Engine(canvas, true);
        const scene = new BABYLON.Scene(engine);
        scene.clearColor = new BABYLON.Color4(0.02, 0.0, 0.06, 1);

        setStatus('loading Havok WASM…');
        const havokInstance = await withTimeout(HavokPhysics(), 20000, 'HavokPhysics() WASM load');

        setStatus('initializing physics world…');
        const hk = new BABYLON.HavokPlugin(true, havokInstance);
        scene.enablePhysics(GRAVITY_VECTOR_FN(), hk);
        statusHavok.textContent = 'OK';
        statusHavok.className = 'ok';

        const light = new BABYLON.HemisphericLight('light', new BABYLON.Vector3(0, 1, -0.3), scene);
        light.intensity = 0.9;

        buildTable(scene);
        buildCamera(scene);
        buildObstacles(scene);
        buildLaunchLane(scene);
        buildDrainZone(scene);

        const plungerMat = new BABYLON.StandardMaterial('plungerMat', scene);
        plungerMat.diffuseColor = new BABYLON.Color3(0.7, 0.7, 0.7);
        plungerMat.emissiveColor = new BABYLON.Color3(0, 0.2, 0.2);
        const plunger = createPlunger(scene, plungerMat);

        const flipperMat = new BABYLON.StandardMaterial('flipperMat', scene);
        flipperMat.diffuseColor = new BABYLON.Color3(1, 0, 1);
        flipperMat.emissiveColor = new BABYLON.Color3(0.35, 0, 0.35);

        const leftFlipper = createFlipper(
            scene, 'leftFlipper',
            new BABYLON.Vector3(-FLIPPER_GAP_HALF_M, FLIPPER_HEIGHT_M / 2, FLIPPER_Z_M),
            true, flipperMat
        );
        const rightFlipper = createFlipper(
            scene, 'rightFlipper',
            new BABYLON.Vector3(FLIPPER_GAP_HALF_M, FLIPPER_HEIGHT_M / 2, FLIPPER_Z_M),
            false, flipperMat
        );

        // Desktop controls: LEFT/RIGHT arrows, matching the existing 2D game's control scheme
        // (release-prompts/14-*.md documents the equivalent touch controls for mobile, which get
        // reconnected to whatever the final flipper API looks like in Stage 11 - keyboard first
        // here since it's needed just to test flippers at all). window-level listeners, not
        // canvas-focused, so no click-to-focus step is needed first.
        window.addEventListener('keydown', (e) => {
            if (e.code === 'ArrowLeft') activateFlipper(leftFlipper);
            if (e.code === 'ArrowRight') activateFlipper(rightFlipper);
        });
        window.addEventListener('keyup', (e) => {
            if (e.code === 'ArrowLeft') deactivateFlipper(leftFlipper);
            if (e.code === 'ArrowRight') deactivateFlipper(rightFlipper);
        });

        // Mobile touch controls: tap-and-hold the left/right half of the canvas to activate the
        // matching flipper, release to let it fall. This is a minimal placeholder (no visible
        // on-screen buttons/zones yet - that's Stage 11's job), but a real pinball table can't be
        // playtested at all on a touchscreen without *some* way to fire the flippers, so this
        // can't wait for Stage 11. Tracks touches by identifier (a Map) so both flippers can be
        // held at once with two fingers, same as the old 2D game's arcade controls.
        const activeFlipperTouches = new Map();

        function flipperForTouchX(clientX) {
            return clientX < window.innerWidth / 2 ? leftFlipper : rightFlipper;
        }

        canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            for (const touch of e.changedTouches) {
                const flipper = flipperForTouchX(touch.clientX);
                activeFlipperTouches.set(touch.identifier, flipper);
                activateFlipper(flipper);
            }
        }, { passive: false });

        function releaseFlipperTouch(e) {
            for (const touch of e.changedTouches) {
                const flipper = activeFlipperTouches.get(touch.identifier);
                if (flipper) deactivateFlipper(flipper);
                activeFlipperTouches.delete(touch.identifier);
            }
        }
        canvas.addEventListener('touchend', releaseFlipperTouch, { passive: true });
        canvas.addEventListener('touchcancel', releaseFlipperTouch, { passive: true });

        const statusLeftFlipper = document.getElementById('status-left-flipper');
        const statusRightFlipper = document.getElementById('status-right-flipper');

        const flipperDropBtn = document.getElementById('flipper-drop-btn');

        const ballMat = new BABYLON.StandardMaterial('ballMat', scene);
        ballMat.diffuseColor = new BABYLON.Color3(0, 1, 1);
        ballMat.emissiveColor = new BABYLON.Color3(0, 0.3, 0.3);

        // --- The main game ball (Stage 3): one canonical ball, physics-maintained every frame
        // via updateBallPhysics(). Now spawned resting on the plunger (Stage 5), matching
        // resetBall()'s ball-rest position in ../index.js, instead of Stage 3's placeholder spot. ---
        const mainBall = createBall(
            scene,
            new BABYLON.Vector3(plunger.baseX, 0.03, plunger.baseZ),
            ballMat
        );

        // --- Debug drop-tool balls (from Stage 2), kept for repeatable boundary-gap testing -
        // now backed by the same createBall() factory as the main ball instead of duplicating
        // its setup, and also maintained by updateBallPhysics() every frame. ---
        const testBalls = [];

        function dropTestBall() {
            const x = (Math.random() - 0.5) * (TABLE_WIDTH_M - BALL_DIAMETER_M * 2);
            const z = (Math.random() - 0.5) * (TABLE_LENGTH_M - BALL_DIAMETER_M * 2);
            testBalls.push(createBall(scene, new BABYLON.Vector3(x, 0.15, z), ballMat));
            statusBalls.textContent = String(testBalls.length + 1); // +1 for the main ball
        }

        function clearTestBalls() {
            testBalls.forEach((ball) => {
                ball.aggregate.dispose();
                ball.mesh.dispose();
            });
            testBalls.length = 0;
            statusBalls.textContent = '1'; // main ball still present
        }

        dropBtn.addEventListener('click', dropTestBall);
        clearBtn.addEventListener('click', clearTestBalls);
        statusBalls.textContent = '1';

        // --- Stage 3 verification tools ---
        //
        // This sandbox cannot load the Babylon/Havok CDN (see BABYLON_3D_OVERHAUL.md's risk
        // section), so the acceptance criteria that need visual judgment (does rolling/settling
        // "look" physically plausible) can only be checked by a human. But the CCD/tunneling
        // check is a factual pass/fail that doesn't require judgment - self-verifying rather
        // than eyeballing a single fast frame.

        // CCD / anti-tunneling test: reposition the main ball near the flipper end and fire it
        // at extreme velocity (well beyond MAX_BALL_SPEED_MS, deliberately - this tests whether
        // a single physics step can outrun collision detection, which is exactly the scenario
        // CCD exists for) straight at the thin top wall, then watch for a couple of seconds
        // whether it ever ends up beyond that wall's far edge.
        let ccdTestActive = false;
        let ccdTestElapsedMs = 0;
        const CCD_TEST_DURATION_MS = 2500;
        const CCD_TEST_SPEED_MS = 8; // ~4.7x MAX_BALL_SPEED_MS - see comment above
        const topWallFarEdgeZ = toWorldZ(15) + (30 * PX_TO_M) / 2;

        ccdTestBtn.addEventListener('click', () => {
            mainBall.mesh.position.set(0, 0.05, -TABLE_LENGTH_M * 0.3);
            mainBall.aggregate.body.setLinearVelocity(new BABYLON.Vector3(0, 0, CCD_TEST_SPEED_MS));
            mainBall.stuckTimeMs = 0;
            ccdTestActive = true;
            ccdTestElapsedMs = 0;
            statusCcd.textContent = 'running…';
            statusCcd.className = '';
        });

        // Force-stuck test: zero the main ball's velocity in place so the anti-stuck timer can
        // be watched counting up to its kick (status-stuck-timer below), without needing to find
        // or wait for a naturally-occurring stuck spot on the table.
        stuckTestBtn.addEventListener('click', () => {
            mainBall.aggregate.body.setLinearVelocity(BABYLON.Vector3.Zero());
            mainBall.aggregate.body.setAngularVelocity(BABYLON.Vector3.Zero());
            mainBall.stuckTimeMs = 0;
        });

        // Stage 4 test: drop the main ball directly onto the left flipper's resting position,
        // the single most important manual test for this stage - confirms the ball actually
        // rests on the paddle plausibly, and (combined with holding LEFT arrow) that activating
        // sends it somewhere sensible.
        flipperDropBtn.addEventListener('click', () => {
            mainBall.mesh.position.set(-FLIPPER_GAP_HALF_M, 0.08, FLIPPER_Z_M + 0.03);
            mainBall.aggregate.body.setLinearVelocity(BABYLON.Vector3.Zero());
            mainBall.stuckTimeMs = 0;
        });

        // --- Plunger / launch (Stage 5, babylon-prompts/05-*.md) ---
        //
        // ballInPlay is a minimal stand-in for the 2D game's canLaunch/ballInPlay pair
        // (../index.js) - there's no drain/ball-loss detection yet (that's Stage 6's job), so
        // once launched there's currently no automatic way back to "ready to launch" other than
        // the RESET BALL TO PLUNGER button below. That's an accepted, documented gap for this
        // physics-testbed stage, not an oversight.
        let ballInPlay = false;
        let plungerCharging = false;
        let plungerChargeElapsedMs = 0;
        let plungerPower = PLUNGER_MIN_POWER_MS;
        const statusPlungerCharge = document.getElementById('status-plunger-charge');

        function resetBallToPlunger() {
            mainBall.mesh.position.set(plunger.baseX, 0.03, plunger.baseZ);
            mainBall.aggregate.body.setLinearVelocity(BABYLON.Vector3.Zero());
            mainBall.aggregate.body.setAngularVelocity(BABYLON.Vector3.Zero());
            mainBall.stuckTimeMs = 0;
            ballInPlay = false;
            plungerCharging = false;
            plungerChargeElapsedMs = 0;
            plungerPower = PLUNGER_MIN_POWER_MS;
            plunger.chargePercent = 0;
        }

        // Mirrors handleLaunchPress()/handleLaunchRelease() in ../index.js: power is purely a
        // continuous function of hold duration (see the render loop below), and release always
        // tries to launch if the ball is ready - no separate "did we see a press" bookkeeping,
        // which is what makes "release immediately after a reset" reliable (release-prompts/13-
        // *.md's desktop-launch-after-death fix, ported here since Stage 5's acceptance criteria
        // calls out the exact same scenario).
        function handleLaunchPress() {
            if (ballInPlay) return;
            plungerCharging = true;
            plungerChargeElapsedMs = 0;
            plungerPower = PLUNGER_MIN_POWER_MS;
        }

        function handleLaunchRelease() {
            if (ballInPlay) return;
            if (!plungerCharging) {
                plungerPower = PLUNGER_MIN_POWER_MS;
            }
            // +Z = up-table, matching launchBall()'s velocityY = -power under the toWorldZ()
            // sign flip (02-*.md); velocityX keeps the same sign/scale relationship as the 2D
            // version's -(150 + power*0.08) kick - see PLUNGER_HORIZONTAL_BASE_MS's comment.
            const velocityZ = plungerPower;
            const velocityX = -(PLUNGER_HORIZONTAL_BASE_MS + plungerPower * PLUNGER_HORIZONTAL_RATIO);
            mainBall.aggregate.body.setLinearVelocity(new BABYLON.Vector3(velocityX, 0, velocityZ));
            mainBall.stuckTimeMs = 0;
            ballInPlay = true;
            plungerCharging = false;
            plunger.chargePercent = 0;
        }

        window.addEventListener('keydown', (e) => {
            if (e.code === 'Space') {
                e.preventDefault(); // stop the page from scrolling on spacebar
                handleLaunchPress();
            }
        });
        window.addEventListener('keyup', (e) => {
            if (e.code === 'Space') handleLaunchRelease();
        });

        const launchBtn = document.getElementById('launch-btn');
        launchBtn.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            handleLaunchPress();
            launchBtn.classList.add('charging');
        });
        launchBtn.addEventListener('pointerup', () => {
            handleLaunchRelease();
            launchBtn.classList.remove('charging');
        });
        launchBtn.addEventListener('pointercancel', () => {
            handleLaunchRelease();
            launchBtn.classList.remove('charging');
        });

        const resetPlungerBtn = document.getElementById('reset-plunger-btn');
        resetPlungerBtn.addEventListener('click', resetBallToPlunger);

        // --- Scoring, collision/trigger detection, drain (Stage 6, babylon-prompts/06-*.md) ---
        //
        // Architecture confirmed against Babylon's actual source (havokPlugin.ts,
        // IPhysicsEnginePlugin.ts), not guessed: PhysicsAggregate exposes both .body and .shape;
        // a shape's `.isTrigger = true` (set on bumpers/targets/lanes/drain above in
        // buildObstacles()/buildDrainZone()) makes it detect-only, reported through the plugin-
        // level `hk.onTriggerCollisionObservable` (global, not per-body - filtered below by
        // checking which side is the ball). Regular physical hits (bumpers, satellite,
        // slingshots - left as normal, non-trigger bodies) are reported through the ball body's
        // own `getCollisionObservable()`, which needs `setCollisionCallbackEnabled(true)` called
        // once first. Event `.type` values (COLLISION_STARTED, TRIGGER_ENTERED, etc.) are
        // compared as plain strings rather than via `BABYLON.PhysicsEventType.X` - that enum is
        // declared `const enum` in Babylon's source, which TypeScript is allowed to inline away
        // entirely rather than emit as a real runtime object, and this sandbox has no way to load
        // the actual CDN bundle to check whether it survived into the public build. The string
        // values themselves ("COLLISION_STARTED" etc.) are part of the same source and not at risk
        // of changing independently, so comparing against them directly sidesteps that question.
        let score = 0;
        let lives = STARTING_LIVES;
        const statusScore = document.getElementById('status-score');
        const statusLives = document.getElementById('status-lives');
        statusScore.textContent = '0';
        statusLives.textContent = String(lives);

        function addScore(points) {
            score += points;
            statusScore.textContent = String(score);
        }

        // Per-object hit cooldown, ported from isOnCooldown()/setCooldown() in ../index.js
        // (there keyed by Phaser game object + a Map; here keyed by mesh, same idea).
        const hitCooldowns = new Set();
        function isOnCooldown(mesh) {
            return hitCooldowns.has(mesh);
        }
        function setCooldown(mesh, durationMs) {
            hitCooldowns.add(mesh);
            setTimeout(() => hitCooldowns.delete(mesh), durationMs);
        }

        // Lightweight scale-pulse as this stage's hit feedback - a 3D-appropriate stand-in for
        // the 2D version's tween-based flash (Stage 8's particle/VFX system will do this properly
        // later; this is enough to make a hit feel registered in the meantime).
        function pulseMesh(mesh) {
            const original = mesh.scaling.clone();
            mesh.scaling.scaleInPlace(1.3);
            setTimeout(() => {
                if (!mesh.isDisposed()) mesh.scaling.copyFrom(original);
            }, 100);
        }

        // Physical hits: bumpers/satellite/slingshots already bounce the ball via restitution
        // (set in buildObstacles()) - this only adds the score/cooldown/feedback layer on top,
        // it does NOT set the ball's velocity by hand the way the 2D version's hitAttackBumper()/
        // hitSatellite()/hitSlingshot() did. That manual angle-based bounce was a workaround for
        // Arcade Physics circles not imparting real force on overlap; real rigid-body contact
        // response in Havok makes it unnecessary, not just redundant - see 04-*.md's flipper
        // implementation note for the same reasoning applied to flippers.
        function handlePhysicalHit(mesh) {
            const meta = mesh.metadata;
            if (!meta || isOnCooldown(mesh)) return;
            if (meta.kind === 'bumper') {
                setCooldown(mesh, COOLDOWN_BUMPER_MS);
                addScore(SCORE_ATTACK_BUMPER);
                pulseMesh(mesh);
            } else if (meta.kind === 'satellite') {
                setCooldown(mesh, COOLDOWN_SATELLITE_MS);
                addScore(SCORE_SATELLITE);
                pulseMesh(mesh);
            } else if (meta.kind === 'slingshot') {
                setCooldown(mesh, COOLDOWN_SLINGSHOT_MS);
                addScore(SCORE_SLINGSHOT);
                pulseMesh(mesh);
            }
        }

        function handleTriggerHit(mesh) {
            const meta = mesh.metadata;
            if (!meta) return;
            if (meta.kind === 'drainZone') {
                handleDrain();
                return;
            }
            if (isOnCooldown(mesh)) return;
            if (meta.kind === 'missionTarget') {
                setCooldown(mesh, COOLDOWN_MISSION_TARGET_MS);
                addScore(SCORE_MISSION_TARGET);
                pulseMesh(mesh);
            } else if (meta.kind === 'reentryLane') {
                setCooldown(mesh, COOLDOWN_REENTRY_LANE_MS);
                addScore(SCORE_REENTRY_LANE);
                pulseMesh(mesh);
            }
        }

        // Ported from checkDrain() in ../index.js: lose a life, end this ball's turn. No
        // GameOverScene equivalent exists yet (Stage 12), so hitting 0 lives just resets lives
        // and score in place after the same pause the 2D version used before showing Grim
        // Reaper/resetting - documented as a deliberate simplification, not an oversight.
        function handleDrain() {
            if (!ballInPlay) return; // the ball can sit inside the trigger volume for a while;
            // without this guard every frame it stays there would count as a separate drain.
            ballInPlay = false;
            lives--;
            statusLives.textContent = String(lives);
            setTimeout(() => {
                if (lives <= 0) {
                    lives = STARTING_LIVES;
                    score = 0;
                    statusLives.textContent = String(lives);
                    statusScore.textContent = '0';
                }
                resetBallToPlunger();
            }, 1500);
        }

        mainBall.aggregate.body.setCollisionCallbackEnabled(true);
        mainBall.aggregate.body.getCollisionObservable().add((event) => {
            if (event.type !== 'COLLISION_STARTED') return;
            handlePhysicalHit(event.collidedAgainst.transformNode);
        });

        hk.onTriggerCollisionObservable.add((event) => {
            if (event.type !== 'TRIGGER_ENTERED') return;
            const ballBody = mainBall.aggregate.body;
            if (event.collider === ballBody) {
                handleTriggerHit(event.collidedAgainst.transformNode);
            } else if (event.collidedAgainst === ballBody) {
                handleTriggerHit(event.collider.transformNode);
            }
            // Trigger hits from testBalls (Stage 2's debug drop tool) are intentionally ignored -
            // scoring/drain only tracks the one canonical mainBall.
        });

        engine.runRenderLoop(() => {
            const deltaMs = engine.getDeltaTime();

            updateBallPhysics(mainBall, deltaMs);
            testBalls.forEach((ball) => updateBallPhysics(ball, deltaMs));

            if (ccdTestActive) {
                ccdTestElapsedMs += deltaMs;
                if (mainBall.mesh.position.z > topWallFarEdgeZ) {
                    statusCcd.textContent = 'FAIL — tunneled through top wall';
                    statusCcd.className = 'bad';
                    ccdTestActive = false;
                } else if (ccdTestElapsedMs >= CCD_TEST_DURATION_MS) {
                    statusCcd.textContent = 'PASS — never exceeded wall bound';
                    statusCcd.className = 'ok';
                    ccdTestActive = false;
                }
            }

            statusStuckTimer.textContent = Math.round(mainBall.stuckTimeMs) + ' ms';

            // Continuous charge-to-power curve, ported from updatePlunger() in ../index.js - no
            // fixed tiers, power increases smoothly with hold duration up to PLUNGER_CHARGE_TIME_MS.
            if (plungerCharging) {
                plungerChargeElapsedMs += deltaMs;
                const chargePercent = Math.min(plungerChargeElapsedMs / PLUNGER_CHARGE_TIME_MS, 1);
                plungerPower = PLUNGER_MIN_POWER_MS + (PLUNGER_MAX_POWER_MS - PLUNGER_MIN_POWER_MS) * chargePercent;
                plunger.chargePercent = chargePercent;
            }
            updatePlungerVisual(plunger);
            statusPlungerCharge.textContent = Math.round(plunger.chargePercent * 100) + '%';

            // Live flipper angle readout (degrees) - see createFlipper()'s comment on the
            // biggest unverified assumption in this stage; this is how a human confirms whether
            // it held. Uses flipperAngleDegrees(), not raw mesh.rotation.y - see that function's
            // comment for why the raw Euler property can't be trusted on a physics-driven mesh.
            statusLeftFlipper.textContent = flipperAngleDegrees(leftFlipper.mesh).toFixed(1) + '°';
            statusRightFlipper.textContent = flipperAngleDegrees(rightFlipper.mesh).toFixed(1) + '°';

            scene.render();
        });
        window.addEventListener('resize', () => engine.resize());

        console.log('[SPIRITBALL 3D] Flippers + obstacle layout initialized.');
    }

    main().catch((err) => showFatalError('Failed to initialize SPIRITBALL 3D.', err));
})();
