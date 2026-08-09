// ===================================
// SPIRITBALL — Babylon.js 3D overhaul, Stage 1: foundation + physics spike
// See babylon-prompts/01-foundation-and-physics-spike.md and BABYLON_3D_OVERHAUL.md.
//
// Purpose: prove the whole new stack (WebGL context, render loop, Havok physics init, rigid
// bodies, camera) works end to end, at real-world pinball scale, before any real game content
// is built on top of it. This file is disposable - it is NOT part of the shipped game and does
// not touch index.html/index.js/styles.css.
// ===================================

(function () {
    'use strict';

    // Real-world scale, matching the units convention this whole rewrite is committing to (see
    // "Technical foundations" in BABYLON_3D_OVERHAUL.md) - meters, not pixels. A real pinball
    // table's playfield tilts roughly 6-7 degrees; this spike's ground plane stands in for a
    // small patch of that surface.
    const TABLE_TILT_DEGREES = 6.5;
    const BALL_DIAMETER_M = 0.027; // a real pinball ball is ~27mm across
    const BALL_MASS_KG = 0.08; // a real pinball ball is roughly 80g
    const BALL_START_POS = { x: 0, y: 0.25, z: -0.42 }; // near the "uphill" edge of the plane

    const statusHavok = document.getElementById('status-havok');
    const statusSpeed = document.getElementById('status-speed');
    const statusHeight = document.getElementById('status-height');
    const resetBtn = document.getElementById('reset-btn');
    const errorPanel = document.getElementById('error-panel');
    const errorMessage = document.getElementById('error-message');
    const canvas = document.getElementById('renderCanvas');

    function showFatalError(title, err) {
        console.error(title, err);
        errorPanel.style.display = 'block';
        statusHavok.textContent = 'FAILED';
        statusHavok.className = 'bad';
        const detail = err && err.stack ? err.stack : String(err);
        errorMessage.textContent = title + '\n\n' + detail +
            '\n\nThis is exactly the kind of failure Stage 1 exists to catch early - see the ' +
            '"Honest risk disclosure" section in BABYLON_3D_OVERHAUL.md (the Babylon/Havok CDN ' +
            'may be blocked by some network policies the same way the Phaser CDN was in earlier ' +
            'work on this project).';
    }

    async function main() {
        if (typeof BABYLON === 'undefined') {
            throw new Error(
                'window.BABYLON is undefined - the Babylon.js core script ' +
                '(https://cdn.babylonjs.com/babylon.js) did not load. Check network access to ' +
                'cdn.babylonjs.com.'
            );
        }
        if (typeof HavokPhysics === 'undefined') {
            throw new Error(
                'window.HavokPhysics is undefined - the Havok script ' +
                '(https://cdn.babylonjs.com/havok/HavokPhysics_umd.js) did not load. Check ' +
                'network access to cdn.babylonjs.com.'
            );
        }

        const engine = new BABYLON.Engine(canvas, true);
        const scene = new BABYLON.Scene(engine);
        scene.clearColor = new BABYLON.Color4(0.02, 0.0, 0.06, 1);

        // --- Physics init (confirmed pattern, see BABYLON_3D_OVERHAUL.md) ---
        const havokInstance = await HavokPhysics();
        const hk = new BABYLON.HavokPlugin(true, havokInstance);
        scene.enablePhysics(new BABYLON.Vector3(0, -9.8, 0), hk);
        statusHavok.textContent = 'OK';
        statusHavok.className = 'ok';

        // --- Camera (freely orbitable for this spike only - Stage 2 defines the real fixed
        // pinball-cabinet camera) ---
        const camera = new BABYLON.ArcRotateCamera(
            'camera',
            BABYLON.Tools.ToRadians(-90),
            BABYLON.Tools.ToRadians(55),
            1.4,
            new BABYLON.Vector3(0, 0, 0),
            scene
        );
        camera.attachControl(canvas, true);
        camera.lowerRadiusLimit = 0.3;
        camera.upperRadiusLimit = 4;

        // --- Light ---
        const light = new BABYLON.HemisphericLight('light', new BABYLON.Vector3(0, 1, 0.3), scene);
        light.intensity = 0.9;

        // --- Ground: a tilted static box standing in for a patch of pinball playfield ---
        const ground = BABYLON.MeshBuilder.CreateBox('ground', { width: 1, height: 0.02, depth: 1 }, scene);
        const groundMat = new BABYLON.StandardMaterial('groundMat', scene);
        groundMat.diffuseColor = new BABYLON.Color3(0.15, 0.12, 0.25);
        ground.material = groundMat;
        // NOTE: sign of this tilt is a guess pending visual confirmation - if the ball rolls
        // toward the camera / off the visible plane immediately instead of rolling gently
        // "downhill" and settling, flip the sign here (Stage 2 needs to nail this down
        // deliberately as the table's real tilt convention, not leave it as a guess).
        ground.rotation.x = BABYLON.Tools.ToRadians(TABLE_TILT_DEGREES);

        const groundAggregate = new BABYLON.PhysicsAggregate(
            ground,
            BABYLON.PhysicsShapeType.BOX,
            { mass: 0, restitution: 0.3, friction: 0.6 },
            scene
        );

        // --- Ball: a small dynamic sphere at real pinball scale ---
        const ball = BABYLON.MeshBuilder.CreateSphere('ball', { diameter: BALL_DIAMETER_M }, scene);
        const ballMat = new BABYLON.StandardMaterial('ballMat', scene);
        ballMat.diffuseColor = new BABYLON.Color3(0, 1, 1);
        ballMat.emissiveColor = new BABYLON.Color3(0, 0.3, 0.3);
        ball.material = ballMat;

        const startPos = new BABYLON.Vector3(BALL_START_POS.x, BALL_START_POS.y, BALL_START_POS.z);
        ball.position.copyFrom(startPos);

        let ballAggregate = createBallAggregate();

        function createBallAggregate() {
            const aggregate = new BABYLON.PhysicsAggregate(
                ball,
                BABYLON.PhysicsShapeType.SPHERE,
                { mass: BALL_MASS_KG, restitution: 0.65, friction: 0.35 },
                scene
            );

            // Continuous collision detection so a fast-moving, small-radius ball can't tunnel
            // through the (thin) table boundary in one physics step - this is exactly the kind
            // of thing this spike exists to verify works, at tiny scale, before Stage 3 builds
            // the real ball on top of an unverified assumption. Confirmed real Havok/Babylon
            // API names via research (see BABYLON_3D_OVERHAUL.md); exact "good" threshold/radius
            // values below are starting points to tune by testing, not verified-correct numbers.
            if (aggregate.body && typeof aggregate.body.setCcdMotionThreshold === 'function') {
                aggregate.body.setCcdMotionThreshold(BALL_DIAMETER_M * 0.5);
                aggregate.body.setCcdSweptSphereRadius(BALL_DIAMETER_M * 0.5);
            } else {
                console.warn(
                    'setCcdMotionThreshold/setCcdSweptSphereRadius not found on this Havok ' +
                    'PhysicsBody build - CCD may not be active. Check the current Babylon.js ' +
                    'Havok API before Stage 3 relies on this.'
                );
            }

            return aggregate;
        }

        // --- Reset button: dispose and recreate the physics body at the start position. This
        // is a deliberately simple, robust approach for a throwaway spike rather than relying on
        // uncertain mesh-to-physics-transform sync behavior. ---
        resetBtn.addEventListener('click', () => {
            ballAggregate.dispose();
            ball.position.copyFrom(startPos);
            ball.rotationQuaternion = null;
            ball.rotation.set(0, 0, 0);
            ballAggregate = createBallAggregate();
        });

        // --- Status readout ---
        scene.onBeforeRenderObservable.add(() => {
            if (!ballAggregate.body) return;
            const v = ballAggregate.body.getLinearVelocity();
            const speed = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
            statusSpeed.textContent = speed.toFixed(3) + ' m/s';
            statusHeight.textContent = ball.position.y.toFixed(3) + ' m';
        });

        // --- Render loop ---
        engine.runRenderLoop(() => scene.render());
        window.addEventListener('resize', () => engine.resize());

        console.log('[SPIRITBALL Stage 1 spike] Babylon + Havok initialized successfully.');
    }

    main().catch((err) => showFatalError('Failed to initialize the Babylon.js/Havok spike.', err));
})();
