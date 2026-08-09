// ===================================
// SPIRITBALL — Babylon.js 3D overhaul
// Stage 2: 3D table geometry + pinball-cabinet camera (babylon-prompts/02-*.md)
// Stage 3: ball physics + anti-stuck logic (babylon-prompts/03-*.md)
// See BABYLON_3D_OVERHAUL.md for the overall architecture.
//
// Scope so far: the static table BOUNDARY (top wall, left/right walls, corner slants, upper
// guide rails), the fixed gameplay camera, and one physics-driven ball with velocity clamping
// and anti-stuck recovery. Still no flippers, plunger, bumpers, or game logic - those are later
// stages. This file supersedes babylon-spike.js as the base for the real game; the spike file
// stays around as a disposable physics-tuning sandbox (per its own stage doc), not because this
// file depends on it.
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
        statusHavok.textContent = 'FAILED';
        statusHavok.className = 'bad';
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

        const ballMat = new BABYLON.StandardMaterial('ballMat', scene);
        ballMat.diffuseColor = new BABYLON.Color3(0, 1, 1);
        ballMat.emissiveColor = new BABYLON.Color3(0, 0.3, 0.3);

        // --- The main game ball (Stage 3): one canonical ball, physics-maintained every frame
        // via updateBallPhysics(). Spawned near the flipper end, off to one side, roughly where
        // a launch chute will sit in a later stage - not exact plunger placement yet (that's
        // Stage 5's job), just a sensible starting point for observing table-tilt rolling
        // behavior now. ---
        const mainBall = createBall(
            scene,
            new BABYLON.Vector3(TABLE_WIDTH_M * 0.32, 0.05, -TABLE_LENGTH_M * 0.25),
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

            scene.render();
        });
        window.addEventListener('resize', () => engine.resize());

        console.log('[SPIRITBALL Stage 3] Ball physics initialized. Max speed:', MAX_BALL_SPEED_MS.toFixed(3), 'm/s');
    }

    main().catch((err) => showFatalError('Failed to initialize Stage 3.', err));
})();
