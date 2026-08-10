// ===================================
// SPIRITBALL — Babylon.js 3D overhaul
// Stage 2: 3D table geometry + pinball-cabinet camera (babylon-prompts/02-*.md)
// Stage 3: ball physics + anti-stuck logic (babylon-prompts/03-*.md)
// Stage 4: motorized flippers + an authentic Space-Cadet-inspired obstacle layout
//          (babylon-prompts/04-*.md, expanded scope - see that file's implementation note)
// Stage 5: plunger and launch mechanic (babylon-prompts/05-*.md)
// Stage 6: collision/trigger detection, scoring, drain zone (babylon-prompts/06-*.md, scoped -
//          see that file's implementation note for what's deferred to Stage 12)
// Stage 7: real materials, lighting, glow/bloom, and a procedural skybox
//          (babylon-prompts/07-*.md - see that file's implementation note, including a real
//          playfield-floor bug fixed as part of this stage, not just a visual pass)
// Stage 8: particle VFX - ball trail, drain vortex, per-hit bursts, chakra sparkle
//          (babylon-prompts/08-*.md - see that file's implementation note)
// Stage 9: 3D-mounted backglass/dot-matrix display (babylon-prompts/09-*.md - see that file's
//          implementation note)
// Stage 10: camera shake/punch/flash juice + an idle attract-mode orbit camera
//           (babylon-prompts/10-*.md - see that file's implementation note)
// Stage 11: real mobile touch controls (arcade edge zones + launch button, ported from
//           archive/release-prompts/14-*.md), Havok/WASM-SIMD compatibility detection with an honest
//           fallback message, and performance-tier gating (babylon-prompts/11-*.md - see that
//           file's implementation note)
// Stage 12: Menu/Pause/Controls/Game-Over DOM-overlay screens, real pause (scene.physicsEnabled),
//           and Game Over on 0 lives (babylon-prompts/12-*.md - see that file's implementation
//           note, including why the full mission FSM still isn't built even now - no stage in
//           this 13-stage plan actually assigns building it, only deferred to "whenever real UI
//           exists," which this stage's screens now do)
// Stage 13 (in progress): self-hosted Babylon/Havok under vendor/babylonjs/ (see VENDORING.md),
//           replacing the CDN <script> tags per Babylon's own "not for production" guidance -
//           this unlocked this project's first real interactive browser testing, which
//           immediately found a severe flipper physics bug: createFlipper() is now a kinematic
//           PhysicsMotionType.ANIMATED body driven by plain JS arithmetic, not a
//           Physics6DoFConstraint hinge (see createFlipper()'s comment for the full debugging
//           history). Phaser (phaser2d.html/index.js/styles.css and its image assets) has since
//           been removed entirely, along with the now-superseded babylon-spike.*; see README.md
//           for current status and improvement-prompts/ for what's next. babylon-prompts/13-*.md's
//           full feature-parity checklist and PWA/manifest check are still not done.
// See BABYLON_3D_OVERHAUL.md for the overall architecture and README.md for project status.
//
// Scope so far: the static table boundary (now with a real playfield floor), the fixed gameplay
// camera (plus an idle attract-mode orbit camera active until the first launch), one physics-
// driven ball, two motorized flippers, a plunger/launch lane, scored obstacles (bumpers, mission
// targets, satellite, slingshots, re-entry lanes) with real collision/trigger detection and a real
// Game Over flow, SPIRITBALL's actual DMT/cosmic/chakra visual identity (PBR materials, glow
// layer, bloom, procedural starfield skybox), particle VFX (ball trail, drain vortex, hit bursts,
// chakra sparkle), a real 3D-mounted backglass panel showing score/high-score/lives/messages,
// camera shake/punch/screen-flash impact juice, real ported mobile touch controls (arcade flipper
// zones + launch button, fullscreen/orientation-lock, rotate-prompt), a proactive+reactive Havok/
// WASM-SIMD compatibility check with a link to the still-working 2D build, and DOM-overlay Menu/
// Pause/Controls/Game-Over screens with a real physics-halting pause. The mission FSM (select/
// complete/rank-up) itself remains unbuilt - this file supersedes babylon-spike.js as the base
// for the real game; the spike file stays around as a disposable physics-tuning sandbox (per its
// own stage doc), not because this file depends on it.
// ===================================

(function () {
    'use strict';

    // Reduced-motion detection, ported from the bottom of ../index.js
    // (window.SPIRITBALL_reducedMotion) - re-declared here rather than assumed shared, since this
    // is a separate page load (index.html no longer loads index.js at all; see
    // babylon-prompts/13-*.md's forward-reference note) with its own fresh `window`. Plain
    // browser API, no BABYLON reference, safe to run immediately at top level.
    window.SPIRITBALL_reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

    // ===================================
    // Mobile device detection, fullscreen/orientation-lock, vibration (Stage 11,
    // babylon-prompts/11-*.md) - ported from InputManager in ../index.js (archive/release-prompts/
    // 02-*.md, 14-*.md), same detection logic/thresholds, not redesigned. Plain browser APIs,
    // no BABYLON references, safe at top level/immediately. The actual DOM element wiring
    // (flipper zones, launch button) happens inside main(), since it needs the flipper/plunger
    // functions defined there - these are just the reusable, BABYLON-independent pieces.
    // ===================================
    let isMobileDevice = false;
    let fullscreenRequested = false;

    function detectMobile() {
        const userAgent = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        const smallScreen = window.innerWidth <= 768;
        const portrait = window.innerHeight > window.innerWidth;
        isMobileDevice = userAgent || (smallScreen && portrait);
        updateMobileControlsVisibility();
    }

    function updateMobileControlsVisibility() {
        const mobileControls = document.getElementById('mobile-controls');
        const rotateOverlay = document.getElementById('rotate-overlay');
        const isLandscape = window.innerWidth > window.innerHeight;

        // The playfield is portrait-only, same as the 2D game - a mobile device held in
        // landscape has nowhere to put the touch controls, so show a rotate prompt instead of
        // stranding the player with an unplayable, control-less screen.
        if (isMobileDevice && isLandscape) {
            if (rotateOverlay) rotateOverlay.style.display = 'flex';
            if (mobileControls) mobileControls.style.display = 'none';
            return;
        }

        if (rotateOverlay) rotateOverlay.style.display = 'none';
        if (mobileControls) {
            const shouldShow = isMobileDevice || window.innerHeight > window.innerWidth || window.innerWidth <= 767;
            mobileControls.style.display = shouldShow ? 'block' : 'none';
        }
    }

    // Requires a user gesture, so this can't happen automatically on page load - called from the
    // first touchstart anywhere (see main()). Failures are silently ignored (fullscreen can be
    // denied by the browser; orientation lock isn't supported at all on iOS Safari) - a
    // nice-to-have enhancement, never a requirement to play.
    function requestFullscreenAndLock() {
        if (fullscreenRequested) return;
        fullscreenRequested = true;
        const el = document.documentElement;
        const requestFs = el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen;
        const lockPortrait = () => {
            if (screen.orientation && screen.orientation.lock) {
                screen.orientation.lock('portrait').catch(() => {});
            }
        };
        if (requestFs) {
            Promise.resolve(requestFs.call(el)).then(lockPortrait).catch(() => {});
        } else {
            lockPortrait();
        }
    }

    function vibrateDevice(ms) {
        if (navigator.vibrate) {
            try { navigator.vibrate(ms); } catch (e) { /* ignore */ }
        }
    }

    // ===================================
    // Audio (improvement-prompts/04-*.md) - procedurally synthesized via the Web Audio API, no
    // external files/CDN, consistent with this project's established pattern (the starfield
    // skybox, particle texture, and UI fonts all made this same call - see
    // babylon-prompts/07-*.md/08-*.md's implementation notes). The 2D game never had working
    // audio either - its Sound/Music toggle was removed entirely rather than implemented,
    // becoming this build's Controls screen (archive/release-prompts/04-*.md) - so there's
    // nothing to port, this is new.
    //
    // The AudioContext is created lazily, on the first actual play call - never at page load -
    // so this never fights browser autoplay-policy restrictions (most browsers block audio
    // before a user gesture). The earliest possible call site is already a real gesture (tap-to-
    // start/Space to dismiss the menu triggers the launch sound), so no separate "unlock" hook is
    // needed. Every play function is wrapped defensively - audio is decorative, a failure here
    // must never break gameplay (same philosophy as vibrateDevice() above).
    // ===================================
    let audioCtx = null;
    let masterGainNode = null;
    let audioMuted = localStorage.getItem('spiritball-muted') === 'true';

    function getAudioContext() {
        if (!audioCtx) {
            try {
                const Ctx = window.AudioContext || window.webkitAudioContext;
                if (!Ctx) return null;
                audioCtx = new Ctx();
                masterGainNode = audioCtx.createGain();
                masterGainNode.gain.value = audioMuted ? 0 : 1;
                masterGainNode.connect(audioCtx.destination);
            } catch (e) {
                return null;
            }
        }
        if (audioCtx.state === 'suspended') {
            audioCtx.resume().catch(() => {});
        }
        return audioCtx;
    }

    function setAudioMuted(muted) {
        audioMuted = muted;
        localStorage.setItem('spiritball-muted', String(muted));
        if (masterGainNode) masterGainNode.gain.value = muted ? 0 : 1;
    }

    function isAudioMuted() {
        return audioMuted;
    }

    // A short tone with an exponential decay (percussive "pling" feel), optionally sweeping
    // frequency from freq to opts.freqEnd over the tone's duration - used for the launch (rising
    // sweep) and obstacle hits (flat or slightly falling pitch, varied per type).
    function playTone(freq, durationS, opts) {
        const ctx = getAudioContext();
        if (!ctx) return;
        try {
            const type = (opts && opts.type) || 'sine';
            const freqEnd = (opts && opts.freqEnd) || freq;
            const volume = (opts && opts.volume) || 0.2;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = type;
            osc.frequency.setValueAtTime(Math.max(freq, 1), ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(Math.max(freqEnd, 1), ctx.currentTime + durationS);
            gain.gain.setValueAtTime(volume, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + durationS);
            osc.connect(gain);
            gain.connect(masterGainNode);
            osc.start();
            osc.stop(ctx.currentTime + durationS);
        } catch (e) { /* decorative only - never let a failure break gameplay */ }
    }

    // A short burst of white noise with a decay envelope baked directly into the buffer - a
    // percussive "thock"/"click" feel for physical contacts (flipper solenoid, wall) where a
    // pure tone would sound too musical/soft.
    function playNoiseClick(durationS, volume) {
        const ctx = getAudioContext();
        if (!ctx) return;
        try {
            const bufferSize = Math.max(1, Math.floor(ctx.sampleRate * durationS));
            const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) {
                data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
            }
            const source = ctx.createBufferSource();
            source.buffer = buffer;
            const gain = ctx.createGain();
            gain.gain.value = volume;
            source.connect(gain);
            gain.connect(masterGainNode);
            source.start();
        } catch (e) { /* ignore */ }
    }

    function playLaunchSound(powerPercent) {
        // Rising sweep, low -> high - stronger launches sweep further and land louder.
        playTone(140, 0.22, { type: 'triangle', freqEnd: 140 + powerPercent * 500, volume: 0.15 + powerPercent * 0.1 });
    }

    function playFlipperSound() {
        playNoiseClick(0.05, 0.12);
    }

    function playWallSound() {
        playNoiseClick(0.03, 0.05);
    }

    // One shared "hit" sound, pitched differently per obstacle type (see call sites) so they're
    // distinguishable by ear without needing a separate synthesis routine per type - matches this
    // prompt's own suggestion ("can reuse pitch/tone variation instead of building N separate
    // sounds").
    function playHitSound(pitch) {
        playTone(pitch, 0.15, { type: 'square', freqEnd: pitch * 0.6, volume: 0.14 });
    }

    function playDrainSound() {
        playTone(300, 0.5, { type: 'sawtooth', freqEnd: 50, volume: 0.18 });
    }

    function playGameOverSound() {
        // Three-note descending sting.
        playTone(392, 0.18, { type: 'triangle', volume: 0.16 });
        setTimeout(() => playTone(330, 0.18, { type: 'triangle', volume: 0.16 }), 180);
        setTimeout(() => playTone(220, 0.4, { type: 'triangle', volume: 0.16 }), 360);
    }

    // Ascending fanfare (the reverse shape of playGameOverSound()'s descending sting) for mission
    // completion/rank-up (improvement-prompts/05-*.md) - the biggest positive beat the game has.
    function playRankUpSound() {
        playTone(392, 0.15, { type: 'square', volume: 0.15 });
        setTimeout(() => playTone(523, 0.15, { type: 'square', volume: 0.15 }), 130);
        setTimeout(() => playTone(659, 0.15, { type: 'square', volume: 0.15 }), 260);
        setTimeout(() => playTone(784, 0.35, { type: 'square', volume: 0.17 }), 390);
    }

    function setupResizeHandlers(engine) {
        let resizeTimeout;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                detectMobile();
                engine.resize(); // Babylon's equivalent of the 2D game's window.game.scale.refresh()
            }, 250);
        });
        window.addEventListener('orientationchange', () => {
            setTimeout(() => {
                detectMobile();
                engine.resize();
            }, 100);
        });
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                detectMobile();
                engine.resize();
            }
        });
    }

    // ===================================
    // Havok/WASM-SIMD compatibility (Stage 11) - iOS below 16.4 has no WebAssembly SIMD support
    // at all (confirmed in BABYLON_3D_OVERHAUL.md's research), which Havok requires; this is a
    // hard compatibility ceiling, not a performance tier to tune away. Checked proactively here
    // (before even attempting to load the CDN scripts) via UA version sniffing for the one
    // specific, known-deterministic case; main()'s outer catch handler also treats any
    // WASM/SIMD-flavored error message reactively the same way, covering other unknown
    // SIMD-incompatible browsers this version check doesn't name. No 2D fallback exists anymore
    // (the Phaser build was removed once the 3D build became the only supported version) - an
    // unsupported device gets an honest "not supported" message instead of a broken game.
    // ===================================
    function detectLikelyUnsupportedIOS() {
        const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
        if (!isIOS) return false;
        const match = navigator.userAgent.match(/OS (\d+)_(\d+)/);
        if (!match) return false;
        const major = parseInt(match[1], 10);
        const minor = parseInt(match[2], 10);
        return major < 16 || (major === 16 && minor < 4);
    }

    function showUnsupportedMessage(reason) {
        console.error('[SPIRITBALL 3D] Unsupported device:', reason);
        const panel = document.getElementById('unsupported-panel');
        if (panel) panel.style.display = 'flex';
        const canvasEl = document.getElementById('renderCanvas');
        if (canvasEl) canvasEl.style.display = 'none';
        const mobileControlsEl = document.getElementById('mobile-controls');
        if (mobileControlsEl) mobileControlsEl.style.display = 'none';
    }

    // Dev/debug panel (#status-panel - score/lives/Havok status/CCD test/flipper-angle readouts
    // and the manual test buttons) is hidden by default so a real player just sees the game and
    // the small #player-hud. Append ?dev=1 to the URL to show it - runs immediately, outside
    // main(), so it still works even if Havok/Babylon fail to load entirely. Not persisted
    // (no localStorage) - deliberately explicit per-load, so it can't get silently left on.
    function setDevPanelVisible(visible) {
        const panel = document.getElementById('status-panel');
        if (panel) panel.style.display = visible ? 'block' : 'none';
    }
    setDevPanelVisible(new URLSearchParams(window.location.search).has('dev'));

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

    // Havok collision filtering category for the ball (see PhysicsShape.filterMembershipMask/
    // filterCollideMask - confirmed real API against physicsShape.ts). Everything else keeps
    // Havok's own default membership/collide masks (unrestricted - collides with everything), so
    // this alone changes nothing about existing ball-vs-playfield/wall/bumper/etc. collision. It
    // exists purely so the flipper (see createFlipper()) can restrict ITS collide mask to "ball
    // only" - flippers were exploding on contact with the playfield/nearby scenery once their
    // position became rigidly LOCKED (Stage 13's flipper-constraint fix), and a flipper has no
    // gameplay reason to physically collide with anything but the ball anyway.
    const COLLISION_CATEGORY_BALL = 2;

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
    // scale as everything else - the primary defense against tunneling/instability, same spirit
    // as the old Arcade Physics safety net. See archive/release-prompts/13-*.md for the original
    // 2D value's history.
    //
    // NOT "a second line of defense behind Havok's CCD" (an earlier version of this comment's
    // claim) - improvement-prompts/01-*.md's investigation found this vendored Havok build (grep
    // of both vendor/babylonjs/babylon.js and the compiled HavokPhysics.wasm's own string table)
    // exposes no continuous-collision-detection or "motion quality" API at all, at any level
    // (JS wrapper or native HP_* function). createBall() previously called two methods
    // (setCcdMotionThreshold/setCcdSweptSphereRadius) that don't exist on this PhysicsBody build -
    // dead code, now removed. This per-frame JS clamp is genuinely the only per-body defense.
    const MAX_BALL_SPEED_MS = 1800 * PX_TO_M; // ~1.7 m/s

    // Real Havok API found in the same investigation (HavokPlugin.setVelocityLimits(), backed by
    // the native HP_World_SetSpeedLimit/GetSpeedLimit functions - confirmed present via the same
    // WASM string-table grep, and confirmed live via a temporary debug hook: this build's default
    // is 200 m/s linear / 100 rad/s angular, both far looser than this game's actual scale needs).
    // A world-level clamp Havok enforces inside its own solver every physics substep, not just
    // once per rendered frame the way MAX_BALL_SPEED_MS above is - a genuine second line of
    // defense against a velocity spike happening and causing a tunnel-through in the gap between
    // two JS-side checks. Deliberately looser than MAX_BALL_SPEED_MS (a safety ceiling, not the
    // real gameplay tuning knob, which stays MAX_BALL_SPEED_MS) so it never affects normal play.
    const WORLD_MAX_LINEAR_SPEED_MS = MAX_BALL_SPEED_MS * 3;

    // Anti-stuck thresholds, converted from checkBallStuck() in ../index.js (revamped in
    // archive/release-prompts/13-*.md): speed threshold 40px/s -> m/s, kick components 400/380px/s ->
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
    const FLIPPER_PLAYFIELD_CLEARANCE_M = 0.003; // see createFlipper()'s comment - avoids flipper/playfield contact fighting the LOCKED constraint

    // Sweep angle in radians, converted with plain math, not BABYLON.Tools.ToRadians() - this
    // file's constants are evaluated at script-parse time, before the CDN-load checks inside
    // main() run, so referencing BABYLON up here would throw an unguarded ReferenceError (not a
    // caught, reported failure) if the CDN is blocked, ahead of where the error-handling
    // listeners further down even get registered.
    //
    // The 70-degree sweep magnitude reuses the OLD 2D game's already-tuned value (20deg rest to
    // -50deg active - see archive/release-prompts/01-*.md) but the actual REST ANGLES below are NOT
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
    // 3D rewrite; the 2D version's velocity-injection formula has no equivalent here). These are
    // angle-per-second rates consumed directly by updateFlipperMotor()'s kinematic stepping (see
    // createFlipper()'s comment for why this isn't a physics-constraint motor).
    const FLIPPER_ACTIVATE_SPEED_RAD_S = 26; // fast "punch" - clamped exactly at the sweep limit, like a real solenoid slamming into a mechanical stop
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
    // ../index.js, hardened in archive/release-prompts/13-*.md) kept its launch mechanic simple.
    // ===================================

    // Launch lane position/size, ported from setupPlunger()'s launchPort rectangle and
    // resetBall()'s ball-rest position in ../index.js (2D CONFIG-space pixels), not redesigned.
    const BALL_REST_X_PX = 470; // matches resetBall()'s (CONFIG.width-70, CONFIG.height-220) exactly
    const BALL_REST_Z_PX = 740;
    // The ball's actual rest position in world space - used directly for its spawn/reset
    // position, NOT plunger.baseZ (see PLUNGER_REST_Z_M's comment for why those two used to be,
    // wrongly, the same value). Y is the ball's radius plus a small clearance above the playfield
    // floor (Y=0, see buildTable()'s playfield comment), same clearance reasoning as the
    // flipper's FLIPPER_PLAYFIELD_CLEARANCE_M - previously a hardcoded 0.03, floating the ball
    // ~1.65cm above where it actually needed to rest.
    const BALL_REST_Z_M = toWorldZ(BALL_REST_Z_PX);
    const BALL_REST_Y_M = BALL_DIAMETER_M / 2 + 0.002;
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

    // How far the plunger tip sits behind the ball's true rest spot (toWorldZ(BALL_REST_Z_PX),
    // used directly for the ball's own spawn/reset position - NOT plunger.baseZ, which used to be
    // the same value and meant the ball spawned inside the plunger's own collision volume once
    // the plunger got real physics - see createPlunger()'s comment and
    // improvement-prompts/02-*.md's investigation). Needs >= the plunger cylinder's own
    // half-length (0.015m) + the ball's radius (0.0135m) =~0.0285m of clearance so the two don't
    // overlap at rest; picked -0.035 for a small safety margin beyond that minimum (same
    // reasoning as LANE_INNER_WALL_X_PX's margin above) - the ball settles the last ~6.5mm onto
    // the plunger's tip under gravity after spawning, rather than needing to spawn flush against
    // it (which would risk a spawn-time overlap explosion, the same failure mode the flipper
    // investigation found with FLIPPER_PLAYFIELD_CLEARANCE_M).
    const PLUNGER_REST_Z_M = -0.035;
    const PLUNGER_TRAVEL_M = 0.045; // from the ball at rest, and how far it pulls back at full charge

    // ===================================
    // Scoring, collision/trigger detection, and the drain zone (babylon-prompts/06-*.md).
    //
    // SCOPE DECISION made back in Stage 6, now superseded: the full mission FSM in ../index.js
    // (mission select/start/complete/abort, fuel depletion, rank-up, the mission-target-selects-
    // mission flow) was deferred every stage since because it needed real UI to show it. Stage 12
    // built that UI (backglass, HUD) but still didn't build the FSM itself - see
    // improvement-prompts/05-mission-fsm-and-rank-system.md, implemented below (mission
    // select/progress/complete + rank state live on the `mission` object and backglass.state,
    // declared further down where `stats`/`backglass` are in scope).
    //
    // Point values ported directly from CONFIG.scores in ../index.js (not redesigned).
    const SCORE_ATTACK_BUMPER = 500;
    const SCORE_SATELLITE = 1000;
    const SCORE_MISSION_TARGET = 750;
    const SCORE_REENTRY_LANE = 2000;
    const SCORE_SLINGSHOT = 100;
    const MISSION_COMPLETE_BONUS = 5000;

    // Rank names ported from the classic "3D Pinball for Windows - Space Cadet" progression this
    // table's own layout is explicitly modeled on (see buildObstacles()'s "authentic
    // Space-Cadet-inspired" comment) - the same rank ladder archive/KNOWN_ISSUES.md item 3
    // references ("LT Commander -> Fleet Admiral", ranks 4-8 there matching indices 4-8 here).
    const RANK_NAMES = [
        'Cadet', 'Ensign', 'Lieutenant JG', 'Lieutenant', 'Lt. Commander',
        'Commander', 'Captain', 'Commodore', 'Admiral', 'Fleet Admiral'
    ];

    // One mission slot per mission-target index (0-2, see MISSION_TARGET_BANK), each tied to a
    // distinct scoring category so progress can only come from deliberate play toward the
    // selected mission, not incidental hits of other types - the spirit of the original
    // CONFIG.missions[rank][index] table (archive/KNOWN_ISSUES.md items 3 and 5) without its
    // separate launch-ramp "start" step, which has no equivalent object in this 3D build (a
    // mission-target hit selects AND starts in one action here - a deliberate simplification,
    // not an oversight).
    const MISSION_DEFS = [
        { type: 'bumper', name: 'BUMPER RUN' },
        { type: 'satellite', name: 'SATELLITE SWEEP' },
        { type: 'lane', name: 'RE-ENTRY CIRCUIT' }
    ];
    function missionRequiredCount(rank) {
        return 3 + rank; // scales with rank so later missions take deliberately more effort
    }

    // Cooldown durations ported from setupCollisions()'s setCooldown() calls in ../index.js.
    const COOLDOWN_BUMPER_MS = 300;
    const COOLDOWN_SATELLITE_MS = 400;
    const COOLDOWN_SLINGSHOT_MS = 200;
    const COOLDOWN_MISSION_TARGET_MS = 500;
    const COOLDOWN_REENTRY_LANE_MS = 1000;
    // Not present in the 2D cooldown map (walls/flippers there fire shake unconditionally, every
    // physics-substep-worth of contact) - added here (Stage 10) specifically to keep grinding
    // contact from shaking the camera every single frame, matching the doc's own "don't add
    // camera effects for every single event if it starts feeling noisy" constraint.
    const COOLDOWN_WALL_MS = 150;
    const COOLDOWN_FLIPPER_MS = 150;

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
    // Visual identity (babylon-prompts/07-*.md) - SPIRITBALL's actual DMT/cosmic/chakra palette,
    // ported directly from CONFIG.colors in ../index.js (hex -> BABYLON.Color3, /255 per
    // channel), not redesigned. Used by every material below instead of the Stage 1-6 placeholder
    // flat colors.
    //
    // The actual BABYLON.Color3 objects are NOT constructed here at top-level scope - only the
    // raw hex numbers are (safe, no BABYLON reference). Every prior stage's top-level constants
    // learned this the hard way (see 04-*.md's implementation note): a top-level `new
    // BABYLON.Color3(...)` call evaluates at script-parse time, before the `typeof BABYLON ===
    // 'undefined'` guard in main() ever runs, and would throw an unguarded ReferenceError if the
    // CDN is blocked - defeating this file's entire CDN-failure error-handling effort before it
    // even registers. The COLOR_* names are declared here (as `let`, unassigned) so every
    // function below can close over them, but they're only actually populated inside main(),
    // after the guard - see the "Populate deferred COLOR_* constants" block there.
    // ===================================
    function hexToColor3(hex) {
        return new BABYLON.Color3(
            ((hex >> 16) & 0xff) / 255,
            ((hex >> 8) & 0xff) / 255,
            (hex & 0xff) / 255
        );
    }

    const HEX_BALL = 0xffffff;
    const HEX_EYEBALL = 0x00ffff;
    const HEX_FLIPPER = 0xff00ff;
    const HEX_WALL = 0x00ccff;
    const HEX_BUMPERS = [0xff0099, 0x00ffff, 0xff00ff, 0xffff00];
    const HEX_CHAKRA = [0x9400d3, 0xff1493, 0xffff00, 0x00ff00, 0x00ffff, 0x0000ff, 0x8b00ff];
    const HEX_SATURN = 0xffa500;
    const HEX_SATURN_RING = 0xffd700;
    const HEX_MISSION_ACTIVE = 0x00ff00;
    const HEX_BACKGROUND = 0x1a0033;

    let COLOR_BALL, COLOR_EYEBALL, COLOR_FLIPPER, COLOR_WALL, COLOR_BUMPERS, COLOR_CHAKRA,
        COLOR_SATURN, COLOR_SATURN_RING, COLOR_MISSION_ACTIVE, COLOR_BACKGROUND;

    // Device-tier gate, ported from PerformanceManager.detectPerformance() in ../index.js -
    // simplified to the single boolean the doc asks for ("structured so they *can* be gated...
    // behind a single 'high fidelity' boolean"), not the full 3-tier system, since Stage 11 owns
    // real mobile performance tuning. Gates glow/bloom only - materials/colors/lighting stay the
    // same on every device, only the heavier postprocessing is conditional.
    function detectHighFidelity() {
        const cores = navigator.hardwareConcurrency || 2;
        const memory = navigator.deviceMemory || 2;
        const isLowEnd = /Android\s[1-6]\.|iPhone\s[1-7]\.|iPad\s[1-5]\./i.test(navigator.userAgent);
        let score = 0;
        if (cores >= 8) score += 3;
        else if (cores >= 4) score += 2;
        else if (cores >= 2) score += 1;
        if (memory >= 8) score += 3;
        else if (memory >= 4) score += 2;
        else if (memory >= 2) score += 1;
        if (isLowEnd) score -= 2;
        return score >= 3; // matches the 2D PerformanceManager's "medium" and "high" cutoff
    }

    // ===================================
    // Table geometry, ported from ../index.js GameScene.setupTable(). Boundary only (matches
    // this stage's scope) - the center divider post between the flippers is NOT included here;
    // it belongs conceptually with the flipper/obstacle work in later stages, not the outer
    // boundary this stage is responsible for.
    // ===================================
    function buildTable(scene) {
        // Chrome rails, per the doc's spec - PBR with no environment/reflection texture (a
        // deliberate risk call: this project already depends on one fragile CDN load
        // (Babylon/Havok itself); adding a second external texture fetch for IBL reflections
        // wasn't worth the extra failure mode, especially since this whole stage can't be
        // visually verified in this sandbox anyway). A true metallic=1 PBR material with no
        // environment texture would read as nearly black (metals have almost no diffuse
        // response, they rely on reflection) - kept metallic moderate and albedo bright enough
        // that the walls stay clearly visible under direct light alone, at some cost to how
        // convincingly "chrome" they read without real reflections.
        const wallMat = new BABYLON.PBRMaterial('wallMat', scene);
        wallMat.albedoColor = COLOR_WALL;
        wallMat.metallic = 0.6;
        wallMat.roughness = 0.3;
        wallMat.emissiveColor = COLOR_WALL.scale(0.15);

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
            mesh.metadata = { kind: 'wall' }; // Stage 10's light per-wall-touch camera shake

            new BABYLON.PhysicsAggregate(
                mesh,
                BABYLON.PhysicsShapeType.BOX,
                { mass: 0, restitution: 0.3, friction: 0.6 },
                scene
            );

            return mesh;
        });

        // ---------------------------------------------------------------------------------
        // REAL BUG FIX, not just a visual pass: Stages 2-6 never built an actual playfield floor.
        // The wall boxes above only span Y=[0, WALL_HEIGHT_M] (0 to 0.04) - there was nothing
        // solid at Y=0 for the ball to rest ON. Every ball has actually been falling 0.15m past
        // the walls' base down to the debugFloor below (added purely as an escaped-ball safety
        // net, explicitly "not part of the official table geometry" per its own comment) and
        // settling there - well below where the flippers/bumpers/walls visually and physically
        // sit, with no lateral (X/Z) containment at that depth either, since the walls don't
        // extend down that far. Nothing built so far would have caught this: the CCD test only
        // checks Z position, the stuck-timer/ball-count readouts don't check height, and the
        // camera's tilted long-distance framing could plausibly hide a 15cm vertical offset from
        // a phone screen. Fixed here, discovered while implementing this stage's own "playfield
        // surface" material requirement, which implies a floor mesh should exist to material -
        // it didn't, so this had to be built before it could be materialed.
        // ---------------------------------------------------------------------------------
        const playfieldMat = new BABYLON.PBRMaterial('playfieldMat', scene);
        playfieldMat.albedoColor = COLOR_BACKGROUND.scale(0.5);
        playfieldMat.metallic = 0.3;
        playfieldMat.roughness = 0.35; // glossy-varnished, not mirror-flat, per the doc
        const playfield = BABYLON.MeshBuilder.CreateBox('playfield', {
            width: TABLE_WIDTH_M,
            height: 0.02,
            depth: TABLE_LENGTH_M
        }, scene);
        playfield.position.set(0, -0.01, 0); // top face at Y=0, matching the walls' base
        playfield.material = playfieldMat;
        new BABYLON.PhysicsAggregate(playfield, BABYLON.PhysicsShapeType.BOX, { mass: 0, restitution: 0.2, friction: 0.5 }, scene);
        // Deliberately does NOT extend into the drain zone's Z range (past FLIPPER_Z_M, see
        // 06-*.md) - the ball needs to keep falling through there, that's the whole mechanic.

        // Large safety-net plane well below the real playfield, purely so a ball that somehow
        // gets past a boundary gap (or through the now-unreachable-in-normal-play drain zone) is
        // still visible resting somewhere instead of vanishing into the void forever. Not part of
        // the "official" table geometry.
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
        const laneMat = new BABYLON.PBRMaterial('laneWallMat', scene); // same chrome treatment as buildTable()'s walls
        laneMat.albedoColor = COLOR_WALL;
        laneMat.metallic = 0.6;
        laneMat.roughness = 0.3;
        laneMat.emissiveColor = COLOR_WALL.scale(0.15);

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

    // Kinematic-animated plunger mesh, WITH real collision (see improvement-prompts/02-*.md's
    // investigation) - an earlier version of this function had no physics body at all ("Kinematic-
    // animated plunger mesh (no physics body...)" this comment used to say), which meant nothing
    // ever actually held the ball in place while it rested waiting to be launched: gravity's -Z
    // tilt component (GRAVITY_VECTOR_FN's whole intended purpose - "the ball rolls toward the
    // flipper end") kept accelerating the resting ball down-table, unopposed, until it rolled off
    // the playfield entirely. A real plunger has a mechanical stop the ball rests against; this
    // one now does too, using the same PhysicsMotionType.ANIMATED kinematic pattern the flippers
    // use (Stage 13) - the plunger still isn't simulated, its position is still driven directly by
    // chargePercent below, but Havok now uses that position for real collision response against
    // the ball, both at rest and during the charge-pullback motion.
    //
    // chargePercent (0-1) directly drives its Z position between rest and fully-pulled-back;
    // main() reads/writes .chargePercent every frame, this function only builds the mesh and
    // applies whatever chargePercent currently holds.
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

        const aggregate = new BABYLON.PhysicsAggregate(
            mesh,
            BABYLON.PhysicsShapeType.CYLINDER,
            { mass: 0.05, restitution: 0.2, friction: 0.5 },
            scene
        );
        aggregate.body.setMotionType(BABYLON.PhysicsMotionType.ANIMATED);
        aggregate.body.disablePreStep = false; // same reasoning as the flippers - Havok needs to read this mesh's transform every step, not just once
        aggregate.shape.filterCollideMask = COLLISION_CATEGORY_BALL; // only the ball needs to collide with the plunger
        plunger.aggregate = aggregate;

        return plunger;
    }

    function updatePlungerVisual(plunger) {
        // Pulls back along -Z (toward the near/camera end) as charge increases, matching the 2D
        // plunger sprite's tween-back-then-snap-forward motion - see archive/release-prompts/13-*.md.
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

    // Idle/attract-mode camera (Stage 10, babylon-prompts/10-*.md) - a slow automatic orbit,
    // genuinely 3D-only spectacle with no 2D equivalent. This build has no menu/title screen yet
    // (Stage 12's job), so "idle" is interpreted as "before the player's first launch input" -
    // active from page load, main() switches scene.activeCamera to the fixed gameplay camera the
    // moment handleLaunchPress() first fires (see endAttractMode() in main()). No
    // attachControl() call - rotation is driven programmatically (camera.alpha incremented each
    // frame), not by user drag, so it can't be grabbed by the same touch input the flipper zones
    // already use.
    function buildAttractCamera(scene) {
        const camera = new BABYLON.ArcRotateCamera(
            'attractCamera',
            -Math.PI / 2,
            Math.PI / 3.2,
            1.4,
            new BABYLON.Vector3(0, 0.05, 0),
            scene
        );
        camera.minZ = 0.01;
        camera.fov = BABYLON.Tools.ToRadians(50);
        return camera;
    }

    // Lighting rig (babylon-prompts/07-*.md): dim ambient fill + a couple of point lights for
    // definition, deliberately NOT scene-wide flat illumination - "the emissive materials and
    // glow layer should carry most of the visual energy," matching the reference image's mostly-
    // dark cabinet interior lit by its own glowing elements.
    function buildLighting(scene) {
        const ambient = new BABYLON.HemisphericLight('ambientLight', new BABYLON.Vector3(0, 1, -0.3), scene);
        ambient.intensity = 0.35;

        const flipperLight = new BABYLON.PointLight('flipperLight', new BABYLON.Vector3(0, 0.15, FLIPPER_Z_M), scene);
        flipperLight.diffuse = COLOR_FLIPPER;
        flipperLight.intensity = 0.4;
        flipperLight.range = TABLE_LENGTH_M * 0.6;

        // Near the far/top wall, the re-entry lanes, and the satellite - the "backglass" end of
        // the table conceptually, even though this build has no literal backglass panel yet.
        const backLight = new BABYLON.PointLight('backLight', new BABYLON.Vector3(0, 0.15, TABLE_LENGTH_M * 0.4), scene);
        backLight.diffuse = new BABYLON.Color3(0.6, 0.2, 1);
        backLight.intensity = 0.35;
        backLight.range = TABLE_LENGTH_M * 0.7;

        return { ambient, flipperLight, backLight };
    }

    // Procedural starfield skybox - a DynamicTexture (canvas-drawn dots, the same technique
    // BootScene.preload() uses for the 2D eyeball sprite in ../index.js, just applied here to a
    // sphere instead of a flat sprite) rather than loading an external image. Deliberate: this
    // project already depends on one fragile CDN load (Babylon/Havok itself), and the existing
    // background.webp asset (archive/release-prompts/09-*.md) was authored as a flat 2D portrait-game
    // backdrop, not a projection suited to wrapping around a 3D sphere - reusing it as-is would
    // look wrong, and re-authoring a proper equirectangular version wasn't worth doing sight-
    // unseen in a sandbox that can't render the result either way.
    function createStarfieldTexture(scene) {
        const size = 512;
        const texture = new BABYLON.DynamicTexture('starfieldTex', size, scene, false);
        const ctx = texture.getContext();

        const gradient = ctx.createLinearGradient(0, 0, 0, size);
        gradient.addColorStop(0, '#1a0033'); // CONFIG.colors.background
        gradient.addColorStop(1, '#05000f');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, size, size);

        for (let i = 0; i < 300; i++) {
            const x = Math.random() * size;
            const y = Math.random() * size;
            const r = Math.random() * 1.4 + 0.3;
            ctx.fillStyle = 'rgba(255,255,255,' + Math.random().toFixed(2) + ')';
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fill();
        }

        texture.update();
        return texture;
    }

    function buildSkybox(scene) {
        const skyMat = new BABYLON.StandardMaterial('skyMat', scene);
        skyMat.backFaceCulling = false; // render the inside of the sphere, camera sits inside it
        skyMat.disableLighting = true; // unlit - it's a backdrop, not a lit surface
        skyMat.emissiveTexture = createStarfieldTexture(scene);
        skyMat.diffuseColor = new BABYLON.Color3(0, 0, 0);

        const skybox = BABYLON.MeshBuilder.CreateSphere('skybox', { diameter: 20, sideOrientation: BABYLON.Mesh.BACKSIDE }, scene);
        skybox.material = skyMat;
        skybox.infiniteDistance = true;
        return skybox;
    }

    // ===================================
    // Backglass / dot-matrix display (babylon-prompts/09-*.md) - a real mounted 3D panel, not a
    // flat DOM/canvas overlay, per the doc's explicit point that a floating UI layer wouldn't
    // read as "part of the cabinet." Driven by one DynamicTexture, redrawn from scratch on every
    // change (simplest and most robust option - no partial-clear bugs to chase in a sandbox that
    // can't watch it render). A faint dot-grid overlay evokes the "dot-matrix" look without
    // rasterizing actual per-character dot glyphs, which would be a lot of unverifiable-by-me
    // complexity for a first pass. DOUBLESIDE so it's visible from the fixed camera regardless of
    // which way Babylon's default plane-facing convention turns out to be - another place this
    // sandbox can't confirm visually, so the safer option was taken over guessing the correct sign.
    //
    // Scope note: the doc asks for rank/mission/multiplier alongside score/lives - none of that
    // state exists yet, deliberately (Stage 6's scope decision: the full mission FSM is deferred
    // to Stage 12, since it needs real UI to be worth porting, and this panel doesn't change that
    // - it's a renderer, not a new source of state). Only score, a new high-score (localStorage,
    // separate key from the 2D game's so the two builds don't cross-contaminate during parallel
    // development), lives, and the message line are wired up; rank/mission/multiplier will slot
    // into this same panel once Stage 12 gives them real values to show.
    // ===================================
    function buildBackglass(scene) {
        const width = 512;
        const height = 256;
        const texture = new BABYLON.DynamicTexture('backglassTex', { width, height }, scene, false);
        const ctx = texture.getContext();

        const mat = new BABYLON.StandardMaterial('backglassMat', scene);
        mat.diffuseColor = new BABYLON.Color3(0, 0, 0);
        mat.disableLighting = true; // unlit - the DynamicTexture IS the display's own light source
        mat.emissiveTexture = texture;
        mat.backFaceCulling = false;

        const mesh = BABYLON.MeshBuilder.CreatePlane('backglass', {
            width: 0.32,
            height: 0.15,
            sideOrientation: BABYLON.Mesh.DOUBLESIDE
        }, scene);
        // Mounted above/behind the playfield at the far end (+Z, opposite the flippers), tilted
        // to face back down toward the camera - the real-cabinet backglass position.
        mesh.position.set(0, 0.28, TABLE_LENGTH_M / 2 + 0.06);
        mesh.rotation.x = 0.4;
        mesh.material = mat;

        const state = {
            score: 0, highScore: 0, lives: STARTING_LIVES, message: '', messageTimer: null,
            // Mission/rank progression (improvement-prompts/05-*.md) - missionName is null when
            // no mission is active, matching the original 2D HUD's "Select Mission" idle state.
            rank: RANK_NAMES[0], missionName: null, missionProgress: 0, missionRequired: 0
        };

        function redraw() {
            ctx.fillStyle = '#05000f';
            ctx.fillRect(0, 0, width, height);

            ctx.fillStyle = 'rgba(0, 255, 255, 0.05)';
            for (let y = 6; y < height; y += 8) {
                for (let x = 6; x < width; x += 8) {
                    ctx.fillRect(x, y, 2, 2);
                }
            }

            ctx.textBaseline = 'top';
            ctx.textAlign = 'left';
            ctx.font = 'bold 30px monospace';
            ctx.fillStyle = '#00ffff';
            ctx.fillText('SCORE ' + state.score, 16, 16);

            ctx.font = 'bold 20px monospace';
            ctx.fillStyle = '#ffd700';
            ctx.fillText('HI ' + state.highScore, 16, 58);

            ctx.textAlign = 'right';
            ctx.fillStyle = '#ff0099';
            ctx.fillText('BALLS ' + state.lives, width - 16, 58);
            ctx.textAlign = 'left';

            ctx.font = 'bold 16px monospace';
            ctx.fillStyle = '#00ff99';
            ctx.fillText('RANK: ' + state.rank, 16, 92);

            if (state.missionName) {
                ctx.fillStyle = '#ffaa00';
                ctx.fillText(
                    'MISSION: ' + state.missionName + ' ' + state.missionProgress + '/' + state.missionRequired,
                    16, 114
                );
            }

            if (state.message) {
                ctx.font = 'bold 32px monospace';
                ctx.fillStyle = '#ffffff';
                ctx.textAlign = 'center';
                ctx.fillText(state.message, width / 2, height - 76);
                ctx.textAlign = 'left';
            }

            texture.update();
        }

        // Last-message-wins: a new call cancels any pending clear from the previous one instead
        // of queuing, so rapid-fire hits replace rather than stack illegibly (per the doc's
        // acceptance criteria) - the tradeoff is a very quick second hit can cut the first
        // message's dwell time short, judged an acceptable simplification over building a real
        // message queue for a stage whose actual on-screen legibility can't be checked here.
        function showMessage(text, durationMs) {
            if (state.messageTimer) clearTimeout(state.messageTimer);
            state.message = text;
            redraw();
            state.messageTimer = setTimeout(() => {
                state.message = '';
                state.messageTimer = null;
                redraw();
            }, durationMs || 1100); // 1100ms matches showPopup()'s tween duration in ../index.js
        }

        redraw();
        return { mesh, state, redraw, showMessage };
    }

    // ===================================
    // Particle VFX (babylon-prompts/08-*.md). One shared soft-dot texture (a DynamicTexture radial
    // gradient, same self-contained-asset approach as Stage 7's starfield - no new external image
    // dependency) reused/tinted across every particle system below via color1/color2, rather than
    // loading a dedicated particle sprite.
    //
    // Honesty note: the doc frames ball trail and drain vortex as "direct port[s]" of existing 2D
    // effects, which is accurate (setupParticles() in ../index.js has both, ported faithfully
    // below). Hit-burst effects and chakra sparkle, however, do NOT actually exist in the current
    // 2D codebase - grepped for other add.particles() calls and found none; hit feedback there is
    // tween/tint-based only (Stage 7 already ported the tween-equivalent scale/emissive pulse).
    // Built fresh here to match the doc's intent, not literally ported from anywhere.
    // ===================================
    function createParticleTexture(scene) {
        const size = 32;
        const texture = new BABYLON.DynamicTexture('particleTex', size, scene, false);
        const ctx = texture.getContext();
        const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
        gradient.addColorStop(0, 'rgba(255,255,255,1)');
        gradient.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, size, size);
        texture.update();
        texture.hasAlpha = true;
        return texture;
    }

    // Ball trail: emitter attached directly to the ball mesh (particles spawn at its current
    // position every frame automatically), cyan/eyeball-tinted, additive - direct port of
    // setupParticles()'s follow-the-ball ballTrail emitter. Started immediately but with emitRate
    // driven every frame from the ball's actual speed (see updateBallTrail() in main()'s render
    // loop) rather than a constant rate, so it reads as "the ball is moving fast" per the
    // acceptance criteria instead of a trail that's equally visible at rest.
    function buildBallTrail(scene, texture, ballMesh, highFidelity) {
        const trail = new BABYLON.ParticleSystem('ballTrail', highFidelity ? 200 : 80, scene);
        trail.particleTexture = texture;
        trail.emitter = ballMesh;
        trail.minEmitBox = new BABYLON.Vector3(0, 0, 0);
        trail.maxEmitBox = new BABYLON.Vector3(0, 0, 0);
        trail.color1 = new BABYLON.Color4(COLOR_EYEBALL.r, COLOR_EYEBALL.g, COLOR_EYEBALL.b, 0.7);
        trail.color2 = new BABYLON.Color4(COLOR_EYEBALL.r, COLOR_EYEBALL.g, COLOR_EYEBALL.b, 0.4);
        trail.colorDead = new BABYLON.Color4(COLOR_EYEBALL.r, COLOR_EYEBALL.g, COLOR_EYEBALL.b, 0);
        trail.minSize = 0.005;
        trail.maxSize = 0.012;
        trail.minLifeTime = 0.25;
        trail.maxLifeTime = 0.4; // matches the 2D version's 400ms lifespan
        trail.emitRate = 0; // driven per-frame by updateBallTrail() based on ball speed
        trail.blendMode = BABYLON.ParticleSystem.BLENDMODE_ADD;
        trail.direction1 = new BABYLON.Vector3(-0.05, 0, -0.05);
        trail.direction2 = new BABYLON.Vector3(0.05, 0.05, 0.05);
        trail.minEmitPower = 0.02;
        trail.maxEmitPower = 0.08;
        trail.start();
        return trail;
    }

    // Continuously adjusts the ball trail's emit rate from its actual current speed - called once
    // per frame from the render loop. Below the stuck-speed threshold it's effectively off; above
    // MAX_BALL_SPEED_MS it's at full rate.
    function updateBallTrail(trail, ball, highFidelity) {
        const velocity = ball.aggregate.body.getLinearVelocity();
        const speed = velocity.length();
        const speedFraction = Math.min(speed / MAX_BALL_SPEED_MS, 1);
        const maxRate = highFidelity ? 60 : 25; // ~40/sec at 2D's frequency:25ms was the baseline; scaled up a bit since this trail fades with speed instead of running constantly
        trail.emitRate = speedFraction > 0.1 ? maxRate * speedFraction : 0;
    }

    // Drain vortex: ambient, always-running emitter at the drain zone, purple/black/indigo -
    // direct port of setupParticles()'s drainParticles (continuous for the whole game in the 2D
    // version too, not event-triggered). Simplification: Babylon's core ParticleSystem
    // interpolates color1->color2 per particle rather than picking from a discrete tint array the
    // way Phaser's `tint: [...]` does, and a true inward spiral needs a custom per-particle update
    // function - approximated instead with a downward/inward direction cone, which reads as
    // "falling into a void" without that added complexity in a stage that can't be visually
    // checked anyway. Reduced-motion: this is decorative/ambient, not the "hit confirmed"
    // feedback the doc says must stay intact, so it's significantly reduced (not fully removed -
    // the drain zone should still read as *something*) rather than skipped outright.
    function buildDrainVortex(scene, texture, highFidelity) {
        const vortex = new BABYLON.ParticleSystem('drainVortex', highFidelity ? 150 : 60, scene);
        vortex.particleTexture = texture;
        vortex.emitter = new BABYLON.Vector3(0, 0.02, toWorldZ(DRAIN_ZONE_CENTER_Y_PX) + 0.06);
        vortex.minEmitBox = new BABYLON.Vector3(-DRAIN_ZONE_WIDTH_M / 2, 0, -0.02);
        vortex.maxEmitBox = new BABYLON.Vector3(DRAIN_ZONE_WIDTH_M / 2, 0, 0.02);
        vortex.color1 = new BABYLON.Color4(0.58, 0, 0.83, 0.8); // 0x9400D3
        vortex.color2 = new BABYLON.Color4(0.29, 0, 0.51, 0.6); // 0x4B0082
        vortex.colorDead = new BABYLON.Color4(0, 0, 0, 0);
        vortex.minSize = 0.006;
        vortex.maxSize = 0.014;
        vortex.minLifeTime = 1.0;
        vortex.maxLifeTime = 1.5; // matches the 2D version's 1500ms
        vortex.direction1 = new BABYLON.Vector3(-0.15, -0.1, -0.2);
        vortex.direction2 = new BABYLON.Vector3(0.15, 0.05, -0.35); // net -Z/-Y bias = "into the void"
        vortex.minEmitPower = 0.05;
        vortex.maxEmitPower = 0.15;
        const baseRate = highFidelity ? 20 : 8;
        vortex.emitRate = window.SPIRITBALL_reducedMotion ? baseRate * 0.25 : baseRate;
        vortex.blendMode = BABYLON.ParticleSystem.BLENDMODE_ADD;
        vortex.start();
        return vortex;
    }

    // Chakra sparkle: low-intensity ambient particles rising from each mission target, tinted to
    // that target's own chakra color (reuses the mesh's current material color, so it stays
    // correct even if the material changes later e.g. once mission-select visuals exist in Stage
    // 12). Fully skipped under reduced-motion - purely decorative, no gameplay-feedback role.
    function buildChakraSparkle(scene, texture, targetMesh, highFidelity) {
        if (window.SPIRITBALL_reducedMotion) return null;
        const color = targetMesh.material.albedoColor;
        const sparkle = new BABYLON.ParticleSystem('chakraSparkle', highFidelity ? 40 : 15, scene);
        sparkle.particleTexture = texture;
        sparkle.emitter = targetMesh;
        sparkle.minEmitBox = new BABYLON.Vector3(-0.01, 0, -0.005);
        sparkle.maxEmitBox = new BABYLON.Vector3(0.01, 0.02, 0.005);
        sparkle.color1 = new BABYLON.Color4(color.r, color.g, color.b, 0.6);
        sparkle.color2 = new BABYLON.Color4(color.r, color.g, color.b, 0.3);
        sparkle.colorDead = new BABYLON.Color4(color.r, color.g, color.b, 0);
        sparkle.minSize = 0.003;
        sparkle.maxSize = 0.007;
        sparkle.minLifeTime = 0.6;
        sparkle.maxLifeTime = 1.0;
        sparkle.direction1 = new BABYLON.Vector3(-0.01, 0.03, -0.01);
        sparkle.direction2 = new BABYLON.Vector3(0.01, 0.06, 0.01); // gentle upward drift
        sparkle.minEmitPower = 0.01;
        sparkle.maxEmitPower = 0.03;
        sparkle.emitRate = highFidelity ? 8 : 3;
        sparkle.blendMode = BABYLON.ParticleSystem.BLENDMODE_ADD;
        sparkle.start();
        return sparkle;
    }

    // One-shot hit-burst: color-matched to whatever the hit mesh's material currently shows
    // (so it automatically matches e.g. a re-entry lane's persistent lit-green recolor from
    // 07-*.md, not a separately-tracked color). Always fires regardless of reduced-motion - this
    // IS the "hit confirmed" feedback the doc says must stay intact; only its particle COUNT is
    // reduced on low-tier devices, which is a performance gate, not a motion gate.
    // disposeOnStop cleans itself up automatically once its burst particles finish dying, so
    // repeated hits don't accumulate leaked particle systems.
    function spawnHitBurst(scene, texture, mesh, highFidelity) {
        const color = mesh.material.albedoColor || mesh.material.diffuseColor;
        const burst = new BABYLON.ParticleSystem('hitBurst', highFidelity ? 30 : 12, scene);
        burst.particleTexture = texture;
        burst.emitter = mesh.position.clone();
        burst.minEmitBox = BABYLON.Vector3.Zero();
        burst.maxEmitBox = BABYLON.Vector3.Zero();
        burst.color1 = new BABYLON.Color4(color.r, color.g, color.b, 1);
        burst.color2 = new BABYLON.Color4(1, 1, 1, 0.8);
        burst.colorDead = new BABYLON.Color4(color.r, color.g, color.b, 0);
        burst.minSize = 0.006;
        burst.maxSize = 0.016;
        burst.minLifeTime = 0.25;
        burst.maxLifeTime = 0.45;
        burst.direction1 = new BABYLON.Vector3(-1, -0.3, -1);
        burst.direction2 = new BABYLON.Vector3(1, 0.6, 1);
        burst.minEmitPower = 0.3;
        burst.maxEmitPower = 0.7;
        burst.blendMode = BABYLON.ParticleSystem.BLENDMODE_ADD;
        burst.manualEmitCount = highFidelity ? 22 : 10;
        burst.disposeOnStop = true;
        burst.start();
        burst.stop();
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
        aggregate.shape.filterMembershipMask = COLLISION_CATEGORY_BALL;
        // Found via improvement-prompts/03-*.md's real-device QA pass: disablePreStep defaults to
        // true (see the flipper/plunger's own comments on this same property), meaning
        // mesh.position.set() has NO effect on this DYNAMIC body once it's been simulated even
        // once - Havok keeps writing its own simulated position back to the mesh every step,
        // silently overriding any direct position change. This made resetBallToPlunger() (used
        // after every drain, by the dev reset button, and on every new game) completely
        // non-functional for the position half of what it's supposed to do - confirmed via direct
        // Playwright position sampling showing the ball's position genuinely unchanged in the
        // instant after calling it, only drifting back toward the plunger later purely by
        // coincidence (the same downhill gravity tilt that motivated improvement 2's plunger-
        // collision fix). setLinearVelocity()/setAngularVelocity() were never affected by this -
        // those are direct body API calls, not mesh-transform-mediated - which is why the launch
        // mechanic (also just a velocity injection) always worked fine and this went unnoticed.
        // Setting this false is a normal no-op every other frame (the mesh position already
        // matches wherever Havok itself just wrote it), and only actually does anything on the
        // rare frames something explicitly changes mesh.position - exactly the teleport behavior
        // every reset/dev-button code path already assumed it was getting.
        aggregate.body.disablePreStep = false;

        return { mesh, aggregate, stuckTimeMs: 0 };
    }

    // Per-frame ball physics maintenance: max-speed clamp (see MAX_BALL_SPEED_MS's comment for
    // why this - not Havok CCD, which this build doesn't have - is the real defense) and the
    // anti-stuck recovery, ported from checkBallStuck() in ../index.js. Deliberately mirrors
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
    // Flippers: KINEMATIC (PhysicsMotionType.ANIMATED) meshes, not a physics constraint. This is
    // a deliberate rewrite, not the original design - every earlier version of this function used
    // BABYLON.Physics6DoFConstraint (a motorized, limited hinge pinning a dynamic flipper body to
    // a static anchor). That approach went through an extensive real Playwright/headless-Chromium
    // debugging pass this stage (Stage 13) chasing a genuine, reproducible instability: even after
    // fixing (a) missing axis locks (Havok's SIX_DOF requires every DOF listed explicitly or it
    // defaults to FREE, not LOCKED - confirmed against havokPlugin.ts's
    // initConstraint()/_nativeToLimitMode()), (b) a degenerate constraint frame (axisA/axisB
    // defaulted to the same vector as perpAxisA/perpAxisB, an undefined cross-product axis, and
    // neither was even the flipper's real pivot axis), and (c) a flipper/playfield collision
    // fighting the LOCKED axes every step (fixed via COLLISION_CATEGORY_BALL, kept below since
    // it's still useful) - the constraint remained unstable in a way that tracked disturbingly
    // closely with which flipper's rest angle happened to be more extreme (-100 degrees vs -80
    // degrees, straddling a suspected ~90-degree branch-cut in Havok's own relative-angle
    // computation for LIMITED axes): real angular velocities up to Havok's own ~99 rad/s safety
    // clamp with ZERO player input, and even once "stable" (motionless), the settled rest angle
    // was tens of degrees off from where it was supposed to be (confirmed via direct quaternion
    // comparison, not just the Euler-angle readout, ruling out a decomposition artifact - real
    // physical deviation). Multiple targeted fixes (motor force retuning, axis reference-frame
    // changes, hand-derived compensating vectors) each shifted the symptom without resolving it.
    // Rather than continue chasing undocumented Havok solver internals, this is a standard game-
    // physics technique: a kinematic body's transform is set directly by ordinary JS/game logic
    // (fully deterministic, immune to constraint-solver instability) while Havok still uses it for
    // collision response against DYNAMIC bodies - "they behave like dynamic bodies, but they won't
    // be affected by other bodies, but still push other bodies out of the way" (Babylon's own
    // PhysicsBody doc comment for PhysicsMotionType.ANIMATED). The ball still bounces off flippers
    // correctly; the flipper itself just isn't simulated anymore, it's animated - exactly right
    // for a player-controlled mechanism whose motion is fully specified by input state anyway.
    // ===================================
    function createFlipper(scene, name, pivotWorldPos, isLeft, mat) {
        // Clearance above the playfield: the playfield's top face sits at exactly Y=0 (see its
        // own comment), and pivotWorldPos.y (FLIPPER_HEIGHT_M / 2) would put the flipper box's
        // bottom face flush against it. Kept from the constraint-based version even though a
        // kinematic body can't "fight" a LOCK constraint anymore - real flippers don't drag
        // directly on the playfield surface either, and it costs nothing.
        const pivot = new BABYLON.Vector3(pivotWorldPos.x, pivotWorldPos.y + FLIPPER_PLAYFIELD_CLEARANCE_M, pivotWorldPos.z);

        // Rest angle and mirroring: see FLIPPER_LEFT_REST_RAD/FLIPPER_RIGHT_REST_RAD's comment -
        // these are NOT simple negations of each other, because mirroring a rotating object
        // requires flipping both the angle AND the direction it sweeps in, not just the angle.
        const restAngleRad = isLeft ? FLIPPER_LEFT_REST_RAD : FLIPPER_RIGHT_REST_RAD;
        const halfLength = FLIPPER_LENGTH_M / 2;

        const mesh = BABYLON.MeshBuilder.CreateBox(name, {
            width: FLIPPER_LENGTH_M,
            height: FLIPPER_HEIGHT_M,
            depth: FLIPPER_THICKNESS_M
        }, scene);
        mesh.material = mat;
        mesh.metadata = { kind: 'flipper' }; // Stage 10's flipper-contact camera shake

        const aggregate = new BABYLON.PhysicsAggregate(
            mesh,
            BABYLON.PhysicsShapeType.BOX,
            { mass: FLIPPER_MASS_KG, restitution: 0.3, friction: 0.4 },
            scene
        );
        // PhysicsAggregate only offers STATIC (mass 0) or DYNAMIC (mass > 0) directly - ANIMATED
        // (kinematic) requires an explicit setMotionType() call after construction. Confirmed
        // real API against physicsBody.ts/IPhysicsEnginePlugin.ts.
        aggregate.body.setMotionType(BABYLON.PhysicsMotionType.ANIMATED);
        // disablePreStep defaults to true (Havok's own default, for performance, since most
        // bodies are STATIC or DYNAMIC and never need it) - an ANIMATED body needs it OFF so
        // Havok reads this mesh's transform every step instead of ignoring it. Confirmed real
        // property against physicsBody.ts.
        aggregate.body.disablePreStep = false;
        // Only the ball should ever physically collide with a flipper - see
        // COLLISION_CATEGORY_BALL's comment. No longer needed for LOCK-vs-collision fighting
        // (there's no LOCK constraint anymore), but still correct: flippers have no gameplay
        // reason to push against the playfield, walls, or other scenery.
        aggregate.shape.filterCollideMask = COLLISION_CATEGORY_BALL;

        const motorSign = isLeft ? 1 : -1;
        const minAngleRad = isLeft ? restAngleRad : restAngleRad - FLIPPER_SWEEP_RAD;
        const maxAngleRad = isLeft ? restAngleRad + FLIPPER_SWEEP_RAD : restAngleRad;

        const flipper = { mesh, aggregate, active: false, motorSign, pivot, halfLength, restAngleRad, minAngleRad, maxAngleRad, currentAngleRad: restAngleRad };
        setFlipperAngle(flipper, restAngleRad);
        return flipper;
    }

    // Positions and orients the flipper mesh for a given absolute angle, orbiting its center
    // around the fixed pivot point exactly like the old constraint's pivotB offset did (a
    // rotating box pinned at one end moves its center along an arc, not just spins in place).
    // Havok picks this transform up next physics step via disablePreStep = false (see
    // createFlipper()) and uses it for collision response against the ball.
    function setFlipperAngle(flipper, angleRad) {
        flipper.currentAngleRad = angleRad;
        flipper.mesh.position.set(
            flipper.pivot.x + flipper.halfLength * Math.cos(angleRad),
            flipper.pivot.y,
            flipper.pivot.z + flipper.halfLength * Math.sin(angleRad)
        );
        if (!flipper.mesh.rotationQuaternion) {
            flipper.mesh.rotationQuaternion = BABYLON.Quaternion.Identity();
        }
        BABYLON.Quaternion.RotationAxisToRef(BABYLON.Axis.Y, angleRad, flipper.mesh.rotationQuaternion);
    }

    function activateFlipper(flipper) {
        // Only on the actual off->on transition - browser key-repeat fires keydown repeatedly
        // while a key is held, and this function has no other guard against being called many
        // times per real button press (updateFlipperMotor() handles that idempotently for the
        // physics side, but a sound effect needs its own check to avoid replaying rapidly).
        if (!flipper.active) playFlipperSound();
        flipper.active = true;
    }

    function deactivateFlipper(flipper) {
        flipper.active = false;
    }

    // Advances each flipper's angle by simple, fully deterministic JS arithmetic (called once per
    // frame for both flippers, from the render loop) - see createFlipper()'s comment for why this
    // replaced a physics-constraint motor entirely. While active, sweeps toward the extended
    // limit at FLIPPER_ACTIVATE_SPEED_RAD_S, clamped so it can't overshoot; once released, sweeps
    // back toward restAngleRad at FLIPPER_RETURN_SPEED_RAD_S, also clamped so it settles exactly
    // at rest instead of oscillating past it.
    function updateFlipperMotor(flipper, deltaMs) {
        const dt = deltaMs / 1000;
        if (flipper.active) {
            const target = flipper.motorSign > 0 ? flipper.maxAngleRad : flipper.minAngleRad;
            const step = flipper.motorSign * FLIPPER_ACTIVATE_SPEED_RAD_S * dt;
            const next = flipper.currentAngleRad + step;
            setFlipperAngle(flipper, flipper.motorSign > 0 ? Math.min(next, target) : Math.max(next, target));
        } else {
            const diff = flipper.restAngleRad - flipper.currentAngleRad;
            const maxStep = FLIPPER_RETURN_SPEED_RAD_S * dt;
            if (Math.abs(diff) <= maxStep) {
                setFlipperAngle(flipper, flipper.restAngleRad);
            } else {
                setFlipperAngle(flipper, flipper.currentAngleRad + Math.sign(diff) * maxStep);
            }
        }
    }

    function flipperAngleDegrees(flipper) {
        return (flipper.currentAngleRad * 180) / Math.PI;
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
        // 4 distinct colors (CONFIG.colors.bumper1-4), matching the 2D game's per-bumper
        // identity, not one shared color - each bumper is its own emissive-glass PBR material so
        // it can be individually recolored/pulsed on hit (pulseMesh() in main()).
        const bumperMats = COLOR_BUMPERS.map((color, i) => {
            const mat = new BABYLON.PBRMaterial('bumperMat' + i, scene);
            mat.albedoColor = color;
            mat.metallic = 0.2;
            mat.roughness = 0.3;
            mat.alpha = 0.88; // "glass-or-crystal-like... moderate transparency" per the doc
            mat.emissiveColor = color.scale(0.6);
            return mat;
        });

        BUMPER_CLUSTER.forEach((pos, i) => {
            const mesh = BABYLON.MeshBuilder.CreateSphere('bumper' + i, { diameter: BUMPER_RADIUS_M * 2 }, scene);
            mesh.position.set(pos.x, BUMPER_RADIUS_M, pos.z);
            mesh.material = bumperMats[i % bumperMats.length];
            mesh.metadata = { kind: 'bumper' };
            // Physical body, not a trigger - restitution alone gives the bounce; the ball's
            // collision observable (see main()) reports the hit for scoring on top of that.
            new BABYLON.PhysicsAggregate(mesh, BABYLON.PhysicsShapeType.SPHERE, { mass: 0, restitution: 0.85, friction: 0.3 }, scene);
        });

        // CONFIG.colors.chakra (7 colors) - each mission target gets its own chakra color
        // (targets 0-2 use chakra[0-2]: violet, pink, yellow) instead of one shared color.
        const targetMats = COLOR_CHAKRA.map((color, i) => {
            const mat = new BABYLON.PBRMaterial('targetMat' + i, scene);
            mat.albedoColor = color;
            mat.metallic = 0.15;
            mat.roughness = 0.25;
            mat.alpha = 0.85;
            mat.emissiveColor = color.scale(0.55);
            return mat;
        });

        const missionTargetMeshes = [];
        MISSION_TARGET_BANK.forEach((pos, i) => {
            const mesh = BABYLON.MeshBuilder.CreateBox('missionTarget' + i, {
                width: TARGET_RADIUS_M * 2,
                height: 0.03,
                depth: 0.008
            }, scene);
            mesh.position.set(pos.x, 0.015, pos.z);
            mesh.material = targetMats[i % targetMats.length];
            mesh.metadata = { kind: 'missionTarget', index: i };
            const aggregate = new BABYLON.PhysicsAggregate(mesh, BABYLON.PhysicsShapeType.BOX, { mass: 0, restitution: 0.4, friction: 0.5 }, scene);
            // Trigger, not physical - detect-only per the doc (mission targets don't block the
            // ball in the 2D game either; they're an overlap, not a collider, in setupCollisions()).
            aggregate.shape.isTrigger = true;
            missionTargetMeshes.push(mesh);
        });

        const satelliteMat = new BABYLON.PBRMaterial('satelliteMat', scene);
        satelliteMat.albedoColor = COLOR_SATURN;
        satelliteMat.metallic = 0.5;
        satelliteMat.roughness = 0.3;
        satelliteMat.emissiveColor = COLOR_SATURN.scale(0.3);
        const satelliteMesh = BABYLON.MeshBuilder.CreateSphere('satellite', { diameter: SATELLITE_RADIUS_M * 2 }, scene);
        satelliteMesh.position.set(SATELLITE_POS.x, SATELLITE_RADIUS_M, SATELLITE_POS.z);
        satelliteMesh.material = satelliteMat;
        satelliteMesh.metadata = { kind: 'satellite' };
        // Physical (collider in the 2D game's setupCollisions(), not an overlap) - see this
        // stage's implementation note for the full physical-vs-trigger mapping ported from there.
        new BABYLON.PhysicsAggregate(satelliteMesh, BABYLON.PhysicsShapeType.SPHERE, { mass: 0, restitution: 0.8, friction: 0.3 }, scene);

        // Small ring, matching CONFIG.colors.saturnRing and the satellite's own "Saturn" naming/
        // fiction in ../index.js - a cheap, self-contained addition (one flattened torus, no new
        // asset dependency) beyond what the doc strictly asked for, purely decorative/non-physical.
        const ringMat = new BABYLON.PBRMaterial('saturnRingMat', scene);
        ringMat.albedoColor = COLOR_SATURN_RING;
        ringMat.metallic = 0.6;
        ringMat.roughness = 0.25;
        ringMat.emissiveColor = COLOR_SATURN_RING.scale(0.3);
        const ring = BABYLON.MeshBuilder.CreateTorus('satelliteRing', {
            diameter: SATELLITE_RADIUS_M * 3.2,
            thickness: SATELLITE_RADIUS_M * 0.25,
            tessellation: 24
        }, scene);
        ring.position.set(SATELLITE_POS.x, SATELLITE_RADIUS_M, SATELLITE_POS.z);
        ring.rotation.x = Math.PI / 2.4; // tilted, not flat, so it actually reads as a ring from the fixed camera angle
        ring.material = ringMat;
        // No physics body - purely decorative, would otherwise double the ball's satellite hit
        // detection (this is exactly why it isn't just a bigger satellite sphere).

        const slingshotMat = new BABYLON.PBRMaterial('slingshotMat', scene);
        slingshotMat.albedoColor = new BABYLON.Color3(1, 0, 1); // no direct CONFIG.colors entry for slingshots - kept the existing magenta identity
        slingshotMat.metallic = 0.3;
        slingshotMat.roughness = 0.3;
        slingshotMat.emissiveColor = new BABYLON.Color3(0.5, 0, 0.5);

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

        // Unlit state: dim yellow-ish neutral (no direct 2D equivalent - the 2D lanes start
        // unlit/grey and only take on a color once hit). Lit state (CONFIG.colors.missionActive,
        // green) is applied per-lane in handleTriggerHit() in main(), matching hitReentryLane()'s
        // persistent lane.setFillStyle() recoloring in ../index.js, not just a brief pulse.
        REENTRY_LANES.forEach((pos, i) => {
            const laneMat = new BABYLON.PBRMaterial('laneMat' + i, scene);
            laneMat.albedoColor = new BABYLON.Color3(0.5, 0.5, 0.15);
            laneMat.metallic = 0.1;
            laneMat.roughness = 0.4;
            laneMat.alpha = 0.6;
            laneMat.emissiveColor = new BABYLON.Color3(0.2, 0.2, 0.05);

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

        // Returned so main() can attach Stage 8's chakra-sparkle particle systems - the only
        // piece of obstacle geometry a later stage needs a direct mesh reference to.
        return { missionTargetMeshes };
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

        if (detectLikelyUnsupportedIOS()) {
            showUnsupportedMessage('iOS version below 16.4 - no WebAssembly SIMD support');
            return;
        }

        if (typeof BABYLON === 'undefined') {
            throw new Error('window.BABYLON is undefined - check network access to cdn.babylonjs.com.');
        }
        if (typeof HavokPhysics === 'undefined') {
            throw new Error('window.HavokPhysics is undefined - check network access to cdn.babylonjs.com.');
        }

        // Populate deferred COLOR_* constants (see the "Visual identity" block comment above) -
        // now safe, since BABYLON is confirmed defined past this point.
        COLOR_BALL = hexToColor3(HEX_BALL);
        COLOR_EYEBALL = hexToColor3(HEX_EYEBALL);
        COLOR_FLIPPER = hexToColor3(HEX_FLIPPER);
        COLOR_WALL = hexToColor3(HEX_WALL);
        COLOR_BUMPERS = HEX_BUMPERS.map(hexToColor3);
        COLOR_CHAKRA = HEX_CHAKRA.map(hexToColor3);
        COLOR_SATURN = hexToColor3(HEX_SATURN);
        COLOR_SATURN_RING = hexToColor3(HEX_SATURN_RING);
        COLOR_MISSION_ACTIVE = hexToColor3(HEX_MISSION_ACTIVE);
        COLOR_BACKGROUND = hexToColor3(HEX_BACKGROUND);

        const engine = new BABYLON.Engine(canvas, true);
        const scene = new BABYLON.Scene(engine);
        scene.clearColor = new BABYLON.Color4(0.02, 0.0, 0.06, 1);

        setStatus('loading Havok WASM…');
        const havokInstance = await withTimeout(HavokPhysics(), 20000, 'HavokPhysics() WASM load');

        setStatus('initializing physics world…');
        const hk = new BABYLON.HavokPlugin(true, havokInstance);
        scene.enablePhysics(GRAVITY_VECTOR_FN(), hk);
        // World-level speed ceiling - see WORLD_MAX_LINEAR_SPEED_MS's comment. Angular limit left
        // at Havok's own default (confirmed 100 rad/s on this build, comfortably above the
        // flipper's 26 rad/s activation speed) - no reason to touch it, this improvement is only
        // about linear ball speed.
        hk.setVelocityLimits(WORLD_MAX_LINEAR_SPEED_MS, hk.getMaxAngularVelocity());
        statusHavok.textContent = 'OK';
        statusHavok.className = 'ok';

        buildLighting(scene);
        buildSkybox(scene);

        buildTable(scene);
        const camera = buildCamera(scene);
        const attractCamera = buildAttractCamera(scene);
        scene.activeCamera = attractCamera; // idle/attract mode until the first launch input - see endAttractMode()
        const obstacles = buildObstacles(scene);
        buildLaunchLane(scene);
        buildDrainZone(scene);
        const backglass = buildBackglass(scene);
        // Stage 9 originally used a separate 'spiritball3d-highscore' key to avoid cross-
        // contaminating the 2D build's scores during parallel development. Stage 12's doc asked
        // to reuse the 2D game's key instead so high scores carried over for returning players -
        // kept even after the 2D build's own removal, since it's still just "the" high-score key
        // now, and changing it again would silently reset everyone's saved score for no reason.
        const highScoreKey = 'spiritball-highscore';
        backglass.state.highScore = parseInt(localStorage.getItem(highScoreKey), 10) || 0;
        backglass.redraw();

        // Glow layer picks up every emissive material already assigned above/below automatically
        // - no per-mesh registration needed. Bloom is gated behind detectHighFidelity() per the
        // doc ("structured so they *can* be gated... behind a single 'high fidelity' boolean");
        // materials/colors/lighting stay identical on every device, only this postprocessing pass
        // is conditional. Full mobile performance tuning remains Stage 11's job.
        const highFidelity = detectHighFidelity();
        const glowLayer = new BABYLON.GlowLayer('glow', scene);
        glowLayer.intensity = highFidelity ? 0.8 : 0.5;

        if (highFidelity) {
            const pipeline = new BABYLON.DefaultRenderingPipeline('defaultPipeline', true, scene, [camera]);
            pipeline.bloomEnabled = true;
            pipeline.bloomThreshold = 0.6;
            pipeline.bloomWeight = 0.5;
            pipeline.bloomKernel = 64;
            pipeline.bloomScale = 0.5;
            pipeline.addCamera(attractCamera); // Stage 10's attract-mode orbit gets bloom too, while it's still the active camera
        }

        // --- Camera choreography and impact juice (Stage 10, babylon-prompts/10-*.md) ---
        //
        // Shake and punch are two independently-bounded offsets added to the gameplay camera's
        // fixed base position every frame (never accumulated/stacked - each is capped at the
        // strongest currently-active request, matching triggerCameraShake()'s own "take the max,
        // not the sum" rule), so no sequence of rapid-fire events can push the camera far enough
        // to lose the ball/flippers from frame - the constraint this stage's doc calls out
        // explicitly. Per-axis scaling on shake (full X, half Y, less Z) keeps the "into/out of
        // the screen" axis - the one most likely to feel disorienting or clip the near/far
        // geometry - the most damped of the three.
        const cameraBasePosition = camera.position.clone();
        const cameraForwardDir = camera.getTarget().subtract(camera.position).normalize();

        let shakeRemainingMs = 0;
        let shakeDurationMs = 1;
        let shakeAmplitudeM = 0;

        // intensity mirrors the 2D helper's arbitrary 0.002-0.01 "screen-shake units"
        // (cameraShake(duration, intensity) in ../index.js) - rescaled by a flat factor into a
        // plausible meters-of-camera-jitter amplitude for this table's ~0.5m scale, not
        // separately re-tuned per call site, so the existing 2D hierarchy (light taps vs. strong
        // hits) carries over directly.
        function triggerCameraShake(durationMs, intensity) {
            if (window.SPIRITBALL_reducedMotion) return;
            const amplitude = intensity * 4;
            if (amplitude >= shakeAmplitudeM || durationMs >= shakeRemainingMs) {
                shakeAmplitudeM = Math.max(shakeAmplitudeM, amplitude);
                shakeDurationMs = durationMs;
                shakeRemainingMs = durationMs;
            }
        }

        let punchRemainingMs = 0;
        let punchDurationMs = 1;
        const punchOffsetPeak = BABYLON.Vector3.Zero();

        // A directional (not random) camera nudge - offsetVector is a world-space displacement
        // from the base position, eased back to zero over durationMs. Used for the launch push-in
        // and the drain dip (see their call sites below) - beats the 2D version never needed
        // since its camera couldn't move through 3D space at all.
        function triggerCameraPunch(durationMs, offsetVector) {
            if (window.SPIRITBALL_reducedMotion) return;
            if (offsetVector.length() >= punchOffsetPeak.length() || durationMs >= punchRemainingMs) {
                punchOffsetPeak.copyFrom(offsetVector);
                punchDurationMs = durationMs;
                punchRemainingMs = durationMs;
            }
        }

        function updateCameraEffects(deltaMs) {
            let offsetX = 0, offsetY = 0, offsetZ = 0;

            if (shakeRemainingMs > 0) {
                shakeRemainingMs = Math.max(0, shakeRemainingMs - deltaMs);
                const falloff = shakeRemainingMs / shakeDurationMs;
                const amp = shakeAmplitudeM * falloff;
                offsetX += (Math.random() * 2 - 1) * amp;
                offsetY += (Math.random() * 2 - 1) * amp * 0.5;
                offsetZ += (Math.random() * 2 - 1) * amp * 0.3;
                if (shakeRemainingMs <= 0) shakeAmplitudeM = 0;
            }

            if (punchRemainingMs > 0) {
                punchRemainingMs = Math.max(0, punchRemainingMs - deltaMs);
                const falloff = punchRemainingMs / punchDurationMs;
                offsetX += punchOffsetPeak.x * falloff;
                offsetY += punchOffsetPeak.y * falloff;
                offsetZ += punchOffsetPeak.z * falloff;
                if (punchRemainingMs <= 0) punchOffsetPeak.set(0, 0, 0);
            }

            camera.position.set(
                cameraBasePosition.x + offsetX,
                cameraBasePosition.y + offsetY,
                cameraBasePosition.z + offsetZ
            );
        }

        // Flash: a DOM overlay (see index.html's #flash-overlay and its block comment), not a
        // DefaultRenderingPipeline color-grade pulse - works identically regardless of
        // detectHighFidelity(), where the pipeline doesn't exist at all on low-tier devices.
        const flashOverlay = document.getElementById('flash-overlay');
        function flashScreen(durationMs, r, g, b) {
            if (window.SPIRITBALL_reducedMotion) return;
            flashOverlay.style.background = 'rgb(' + (r ?? 255) + ',' + (g ?? 255) + ',' + (b ?? 255) + ')';
            flashOverlay.style.transition = 'none';
            flashOverlay.style.opacity = '0.5';
            void flashOverlay.offsetWidth; // force a reflow so the transition below animates from 0.5, not skips straight to 0
            flashOverlay.style.transition = 'opacity ' + durationMs + 'ms ease-out';
            flashOverlay.style.opacity = '0';
        }

        let attractModeActive = true;
        function endAttractMode() {
            if (!attractModeActive) return;
            attractModeActive = false;
            scene.activeCamera = camera;
        }

        const plungerMat = new BABYLON.PBRMaterial('plungerMat', scene); // metal piston
        plungerMat.albedoColor = new BABYLON.Color3(0.7, 0.7, 0.7);
        plungerMat.metallic = 0.7;
        plungerMat.roughness = 0.35;
        plungerMat.emissiveColor = new BABYLON.Color3(0, 0.2, 0.2);
        const plunger = createPlunger(scene, plungerMat);

        // CONFIG.colors.flipper (0xff00ff) - already an exact match for the placeholder color
        // used since Stage 4, now upgraded to a proper emissive-glass PBR material.
        const flipperMat = new BABYLON.PBRMaterial('flipperMat', scene);
        flipperMat.albedoColor = COLOR_FLIPPER;
        flipperMat.metallic = 0.4;
        flipperMat.roughness = 0.4;
        flipperMat.emissiveColor = COLOR_FLIPPER.scale(0.5);

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
        // (archive/release-prompts/14-*.md documents the equivalent touch controls for mobile, which get
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

        // Mobile flipper-zone touch controls are wired further down, alongside the launch
        // button, fullscreen/orientation-lock request, and resize handling - see the "Mobile
        // controls" block near handleLaunchRelease() below (Stage 11, babylon-prompts/11-*.md).
        // (Stage 4's original tap-left/right-half-of-canvas stopgap has been fully replaced by
        // the real ported arcade-style edge zones there, not left running alongside them.)

        const statusLeftFlipper = document.getElementById('status-left-flipper');
        const statusRightFlipper = document.getElementById('status-right-flipper');

        const flipperDropBtn = document.getElementById('flipper-drop-btn');

        // "Cosmic eyeball" ball, simplified: the doc allows a plain glowing emissive sphere
        // instead of a painted DynamicTexture eyeball "if the eyeball detail doesn't read well
        // at pinball-ball scale... judge by how it actually looks once placed" - this sandbox
        // cannot render anything, so there is no way to make that visual judgment call here.
        // Took the simpler, lower-risk option the doc explicitly allows for exactly this
        // situation, using CONFIG.colors.ball (white) + CONFIG.colors.eyeball (cyan) as the base/
        // emissive pair rather than attempting unverifiable texture work.
        const ballMat = new BABYLON.PBRMaterial('ballMat', scene);
        ballMat.albedoColor = COLOR_BALL;
        ballMat.metallic = 0.1;
        ballMat.roughness = 0.25;
        ballMat.emissiveColor = COLOR_EYEBALL.scale(0.4);

        // --- The main game ball (Stage 3): one canonical ball, physics-maintained every frame
        // via updateBallPhysics(). Now spawned resting on the plunger (Stage 5), matching
        // resetBall()'s ball-rest position in ../index.js, instead of Stage 3's placeholder spot. ---
        const mainBall = createBall(
            scene,
            new BABYLON.Vector3(plunger.baseX, BALL_REST_Y_M, BALL_REST_Z_M),
            ballMat
        );
        // --- Particle VFX (Stage 8, babylon-prompts/08-*.md) ---
        const particleTexture = createParticleTexture(scene);
        const ballTrail = buildBallTrail(scene, particleTexture, mainBall.mesh, highFidelity);
        buildDrainVortex(scene, particleTexture, highFidelity);
        obstacles.missionTargetMeshes.forEach((mesh) => buildChakraSparkle(scene, particleTexture, mesh, highFidelity));

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
        // "look" physically plausible) can only be checked by a human. But the tunneling check is
        // a factual pass/fail that doesn't require judgment - self-verifying rather than
        // eyeballing a single fast frame.

        // Anti-tunneling test - NOT a "CCD test" (an earlier version of this comment/the button's
        // own label called it that; improvement-prompts/01-*.md's investigation found this
        // vendored Havok build has no continuous-collision-detection API at all - see
        // MAX_BALL_SPEED_MS's comment). What's actually being tested: reposition the main ball
        // near the flipper end and fire it at extreme velocity (well beyond MAX_BALL_SPEED_MS,
        // deliberately, to exercise the per-frame JS clamp and the Havok-level
        // WORLD_MAX_LINEAR_SPEED_MS world speed limit under stress) straight at the thin top
        // wall, then watch for a couple of seconds whether it ever ends up beyond that wall's far
        // edge. A real, separate stress test (temporarily setting CCD_TEST_SPEED_MS far higher
        // than gameplay ever reaches, with both clamps disabled) found tunneling only starts
        // somewhere between 50-70 m/s on this table's geometry - roughly 30-40x faster than
        // MAX_BALL_SPEED_MS (~1.7 m/s) and 10-14x faster than WORLD_MAX_LINEAR_SPEED_MS
        // (~5.1 m/s), a wide safety margin for both real defenses. See that improvement prompt's
        // implementation note for the full methodology.
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
        // (../index.js). Real drain/ball-loss detection was added in Stage 6 (handleDrain()
        // below), which now returns ballInPlay to false automatically via resetBallToPlunger() -
        // the RESET BALL TO PLUNGER dev button remains too, for repeatable manual testing.
        let ballInPlay = false;
        setLaunchReady(true); // matches setupPlunger()'s initial setLaunchReady(true) in ../index.js
        let plungerCharging = false;
        let plungerChargeElapsedMs = 0;
        let plungerPower = PLUNGER_MIN_POWER_MS;
        const statusPlungerCharge = document.getElementById('status-plunger-charge');

        // Ported from InputManager.setLaunchReady() in ../index.js - toggles the launch button's
        // idle-pulse affordance (see .launch-btn.ready in index.html) so it only visibly invites
        // a tap when a launch is actually possible. Looks the button up fresh each call (like the
        // 2D version) rather than relying on a captured reference, so this can be called safely
        // from anywhere regardless of definition order.
        function setLaunchReady(ready) {
            const btn = document.getElementById('launch-btn');
            if (btn) btn.classList.toggle('ready', ready);
        }

        function resetBallToPlunger() {
            mainBall.mesh.position.set(plunger.baseX, BALL_REST_Y_M, BALL_REST_Z_M);
            mainBall.aggregate.body.setLinearVelocity(BABYLON.Vector3.Zero());
            mainBall.aggregate.body.setAngularVelocity(BABYLON.Vector3.Zero());
            mainBall.stuckTimeMs = 0;
            ballInPlay = false;
            plungerCharging = false;
            plungerChargeElapsedMs = 0;
            plungerPower = PLUNGER_MIN_POWER_MS;
            plunger.chargePercent = 0;
            setLaunchReady(true);
        }

        // Mirrors handleLaunchPress()/handleLaunchRelease() in ../index.js: power is purely a
        // continuous function of hold duration (see the render loop below), and release always
        // tries to launch if the ball is ready - no separate "did we see a press" bookkeeping,
        // which is what makes "release immediately after a reset" reliable (archive/release-prompts/13-
        // *.md's desktop-launch-after-death fix, ported here since Stage 5's acceptance criteria
        // calls out the exact same scenario).
        function handleLaunchPress() {
            endAttractMode(); // first launch input ends attract mode, even if this press turns out to be a no-op below
            if (ballInPlay) return;
            plungerCharging = true;
            plungerChargeElapsedMs = 0;
            plungerPower = PLUNGER_MIN_POWER_MS;
            vibrateDevice(15); // matches handleLaunchPress()'s vibrate(15) in ../index.js - light tick: charging started
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
            setLaunchReady(false);
            backglass.showMessage('LAUNCH!', 600);

            // Power-scaled shake, matching launchBall()'s shakeIntensity = 0.002 + powerPercent*0.005
            // in ../index.js, plus a 3D-only push-in toward the ball (no 2D equivalent - that
            // camera couldn't move through space at all) - both new beats the doc calls out
            // explicitly for this stage.
            const powerPercent = (plungerPower - PLUNGER_MIN_POWER_MS) / (PLUNGER_MAX_POWER_MS - PLUNGER_MIN_POWER_MS);
            triggerCameraShake(150, 0.002 + powerPercent * 0.005);
            triggerCameraPunch(300, cameraForwardDir.scale(0.02 + powerPercent * 0.02));
            vibrateDevice(20 + Math.round(powerPercent * 40)); // matches launchBall()'s power-scaled vibrate() in ../index.js
            playLaunchSound(powerPercent);
        }

        // SPACE has multiple jobs depending on screen state, matching the 2D game's single-
        // persistent-listener approach (archive/release-prompts/07-*.md's lesson: check state each time,
        // don't re-register a listener per screen-open) - dismiss the menu and start, resume from
        // pause, restart from game over, or (the normal case) charge/launch the plunger. All of
        // isPaused/gameOverActive/menuOverlay/resumeGame()/startNewGame() are declared later in
        // this function (the screens module below) but safely readable here via closure, since
        // this callback only ever fires after main()'s full synchronous setup has completed.
        window.addEventListener('keydown', (e) => {
            if (e.code !== 'Space') return;
            e.preventDefault(); // stop the page from scrolling on spacebar
            if (menuOverlay.style.display === 'flex') {
                hideMenuScreen();
                handleLaunchPress(); // also ends attract mode internally
                return;
            }
            if (gameOverActive) {
                startNewGame();
                return;
            }
            if (isPaused) {
                resumeGame();
                return;
            }
            handleLaunchPress();
        });
        window.addEventListener('keyup', (e) => {
            if (e.code === 'Space') handleLaunchRelease();
        });

        // --- Mobile controls (Stage 11, babylon-prompts/11-*.md) ---
        //
        // DOM elements/CSS and event pattern ported directly from InputManager.setupMobileControls()
        // in ../index.js (archive/release-prompts/14-*.md) - full-height arcade-style edge zones (tap
        // ANYWHERE along the side, not a small button) plus a discrete round launch button, both
        // wired with the same touchstart/touchend/touchcancel + mousedown/mouseup/mouseleave
        // pattern for touch AND desktop-mouse testing. What changed from the 2D version: press/
        // release call this file's own activateFlipper()/deactivateFlipper()/handleLaunchPress()/
        // handleLaunchRelease() directly, instead of setting InputManager.state flags for a
        // Phaser scene to poll every frame - there's no separate polling step here to slot into.
        const leftZone = document.getElementById('flipper-zone-left');
        const leftFlipperStart = (e) => {
            e.preventDefault();
            activateFlipper(leftFlipper);
            leftZone.classList.add('pressed');
        };
        const leftFlipperEnd = (e) => {
            e.preventDefault();
            deactivateFlipper(leftFlipper);
            leftZone.classList.remove('pressed');
        };
        leftZone.addEventListener('touchstart', leftFlipperStart, { passive: false });
        leftZone.addEventListener('touchend', leftFlipperEnd, { passive: false });
        leftZone.addEventListener('touchcancel', leftFlipperEnd, { passive: false });
        leftZone.addEventListener('mousedown', leftFlipperStart);
        leftZone.addEventListener('mouseup', leftFlipperEnd);
        leftZone.addEventListener('mouseleave', leftFlipperEnd);

        const rightZone = document.getElementById('flipper-zone-right');
        const rightFlipperStart = (e) => {
            e.preventDefault();
            activateFlipper(rightFlipper);
            rightZone.classList.add('pressed');
        };
        const rightFlipperEnd = (e) => {
            e.preventDefault();
            deactivateFlipper(rightFlipper);
            rightZone.classList.remove('pressed');
        };
        rightZone.addEventListener('touchstart', rightFlipperStart, { passive: false });
        rightZone.addEventListener('touchend', rightFlipperEnd, { passive: false });
        rightZone.addEventListener('touchcancel', rightFlipperEnd, { passive: false });
        rightZone.addEventListener('mousedown', rightFlipperStart);
        rightZone.addEventListener('mouseup', rightFlipperEnd);
        rightZone.addEventListener('mouseleave', rightFlipperEnd);

        const launchBtn = document.getElementById('launch-btn');
        const launchStart = (e) => {
            e.preventDefault();
            handleLaunchPress();
            launchBtn.classList.add('pressed');
        };
        const launchEnd = (e) => {
            e.preventDefault();
            handleLaunchRelease();
            launchBtn.classList.remove('pressed');
        };
        launchBtn.addEventListener('touchstart', launchStart, { passive: false });
        launchBtn.addEventListener('touchend', launchEnd, { passive: false });
        launchBtn.addEventListener('touchcancel', launchEnd, { passive: false });
        launchBtn.addEventListener('mousedown', launchStart);
        launchBtn.addEventListener('mouseup', launchEnd);

        // Fullscreen + portrait-lock request on the player's first touch anywhere (needs a user
        // gesture - can't happen automatically on load).
        document.addEventListener('touchstart', () => requestFullscreenAndLock(), { once: true, passive: true });

        setupResizeHandlers(engine);
        detectMobile(); // initial visibility check - also runs on every resize/orientation change above

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
        // Simple hit counters, ported from gameState.statistics in ../index.js - just the ones
        // that actually exist given Stage 6's scoped-down obstacle set (bumper/satellite/mission-
        // target/re-entry-lane; the 2D statistics object also tracks obstacle/inlane/outlane hits
        // that have no 3D equivalent yet). Feeds the Game Over screen's stat lines (Stage 12).
        // Bookkeeping only, not the deferred mission FSM itself.
        const stats = { bumperHits: 0, satelliteHits: 0, targetHits: 0, laneHits: 0, missionsCompleted: 0 };

        // Mission/rank progression state (improvement-prompts/05-*.md). rank is an index into
        // RANK_NAMES; state is 'idle' (no mission active - a target hit will select+start one) or
        // 'active' (progress is accumulating toward `required`, gated by MISSION_DEFS'
        // selectedIndex-matched type in progressMission() below).
        const mission = { state: 'idle', selectedIndex: null, progress: 0, required: 0, rank: 0 };
        const statusScore = document.getElementById('status-score');
        const statusLives = document.getElementById('status-lives');
        const hudScore = document.getElementById('hud-score');
        const hudLives = document.getElementById('hud-lives');
        // Two displays share every score/lives update: #status-panel's dev readout (hidden by
        // default, see setDevPanelVisible()) and #player-hud, the actual player-facing display -
        // see index.html's #player-hud comment for why a second element was needed at all.
        function setScore(value) {
            statusScore.textContent = String(value);
            hudScore.textContent = String(value);
        }
        function setLives(value) {
            statusLives.textContent = String(value);
            hudLives.textContent = String(value);
        }
        setScore(0);
        setLives(lives);

        function addScore(points) {
            score += points;
            setScore(score);
            backglass.state.score = score;
            if (score > backglass.state.highScore) {
                backglass.state.highScore = score;
                localStorage.setItem(highScoreKey, String(score));
            }
            backglass.redraw();
        }

        // Selects AND starts a mission in one action (see MISSION_DEFS' comment for why) -
        // triggered by hitting a mission target while no mission is active.
        function startMission(index) {
            mission.state = 'active';
            mission.selectedIndex = index;
            mission.progress = 0;
            mission.required = missionRequiredCount(mission.rank);
            backglass.state.missionName = MISSION_DEFS[index].name;
            backglass.state.missionProgress = 0;
            backglass.state.missionRequired = mission.required;
            backglass.showMessage('MISSION: ' + MISSION_DEFS[index].name, 900);
        }

        // Called from the hit handlers below with the scoring category that just happened
        // ('bumper'/'satellite'/'lane') - only counts toward an active mission's OWN type, so
        // progress can't come from unrelated incidental scoring (see MISSION_DEFS' comment).
        function progressMission(type) {
            if (mission.state !== 'active' || MISSION_DEFS[mission.selectedIndex].type !== type) return;
            mission.progress++;
            backglass.state.missionProgress = mission.progress;
            if (mission.progress >= mission.required) {
                completeMission();
            } else {
                backglass.redraw();
            }
        }

        function completeMission() {
            mission.state = 'idle';
            mission.selectedIndex = null;
            mission.progress = 0;
            mission.rank = Math.min(mission.rank + 1, RANK_NAMES.length - 1);
            stats.missionsCompleted++;
            backglass.state.missionName = null;
            backglass.state.missionProgress = 0;
            backglass.state.rank = RANK_NAMES[mission.rank];
            addScore(MISSION_COMPLETE_BONUS);
            backglass.showMessage('RANK UP: ' + RANK_NAMES[mission.rank], 1600);
            // A stronger beat than any regular hit's - completing a mission and ranking up is the
            // single biggest moment the game currently has, deserves to read as one.
            triggerCameraShake(500, 0.01);
            triggerCameraPunch(500, new BABYLON.Vector3(0, 0.02, -0.03));
            playRankUpSound();
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
            // Emissive flash to near-white on top of the scale pulse - the doc's "briefly
            // intensify... the object's emissive color" hit-reactivity spec, mirroring the 2D
            // version's setTint(0xffffff) flash in hitAttackBumper() etc. Only meshes with a
            // material exposing emissiveColor get this (all of this stage's PBR materials do).
            const mat = mesh.material;
            const originalEmissive = mat && mat.emissiveColor ? mat.emissiveColor.clone() : null;
            if (originalEmissive) {
                mat.emissiveColor = new BABYLON.Color3(1, 1, 1);
            }
            setTimeout(() => {
                if (mesh.isDisposed()) return;
                mesh.scaling.copyFrom(original);
                if (originalEmissive) mat.emissiveColor.copyFrom(originalEmissive);
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
                stats.bumperHits++;
                pulseMesh(mesh);
                spawnHitBurst(scene, particleTexture, mesh, highFidelity);
                backglass.showMessage('+' + SCORE_ATTACK_BUMPER, 700); // matches hitAttackBumper()'s showPopup(`+${baseScore}`, ...)
                triggerCameraShake(120, 0.006); // matches hitAttackBumper()'s cameraShake(120, 0.006)
                playHitSound(660);
                progressMission('bumper');
            } else if (meta.kind === 'satellite') {
                setCooldown(mesh, COOLDOWN_SATELLITE_MS);
                addScore(SCORE_SATELLITE);
                stats.satelliteHits++;
                pulseMesh(mesh);
                spawnHitBurst(scene, particleTexture, mesh, highFidelity);
                backglass.showMessage('SATELLITE!', 900);
                triggerCameraShake(120, 0.005); // matches hitSatellite()'s cameraShake(120, 0.005)
                playHitSound(880);
                progressMission('satellite');
            } else if (meta.kind === 'slingshot') {
                setCooldown(mesh, COOLDOWN_SLINGSHOT_MS);
                addScore(SCORE_SLINGSHOT);
                pulseMesh(mesh);
                spawnHitBurst(scene, particleTexture, mesh, highFidelity);
                backglass.showMessage('+' + SCORE_SLINGSHOT, 600);
                triggerCameraShake(120, 0.005); // matches hitSlingshot()'s cameraShake(120, 0.005)
                playHitSound(520);
            } else if (meta.kind === 'wall') {
                // No score/pulse/burst - walls aren't scored in the 2D game either, just a very
                // light shake on contact (setupCollisions()'s wall collider: cameraShake(40, 0.003)).
                setCooldown(mesh, COOLDOWN_WALL_MS);
                triggerCameraShake(40, 0.003);
                playWallSound();
            } else if (meta.kind === 'flipper') {
                // Not a literal port - the 2D shake here (updateFlipperPower()'s manual ball-
                // velocity injection, cameraShake(150, 0.008)) belongs to a mechanic that doesn't
                // exist in this build (Havok's real contact response replaces it, see 04-*.md/
                // 06-*.md). Reused as the closest available proxy for "the flipper did something
                // impactful" - fires on any ball-flipper contact, not just an active-swing hit.
                setCooldown(mesh, COOLDOWN_FLIPPER_MS);
                triggerCameraShake(150, 0.008);
                playWallSound(); // ball-vs-flipper contact, distinct from activateFlipper()'s solenoid click
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
                stats.targetHits++;
                pulseMesh(mesh);
                spawnHitBurst(scene, particleTexture, mesh, highFidelity);
                triggerCameraShake(60, 0.002); // matches hitMissionTarget()'s cameraShake(60, 0.002)
                playHitSound(740);
                // hitMissionTarget() in ../index.js shows "Selected: {missionName}" here - now a
                // real mission-select state exists (improvement-prompts/05-*.md): an idle target
                // hit selects+starts this index's mission; a hit while one is already active is
                // just a normal scored hit (matches the original - selecting doesn't interrupt).
                if (mission.state === 'idle') {
                    startMission(meta.index);
                } else {
                    backglass.showMessage('TARGET!', 700);
                }
            } else if (meta.kind === 'reentryLane') {
                setCooldown(mesh, COOLDOWN_REENTRY_LANE_MS);
                addScore(SCORE_REENTRY_LANE);
                stats.laneHits++;
                // Persistent recolor to "lit" green MUST happen before pulseMesh(), not after -
                // pulseMesh() captures whatever emissiveColor is current when it's called and
                // restores exactly that after its 100ms flash, so recoloring afterward would get
                // silently clobbered back to the old unlit color by that restore. Matches
                // hitReentryLane()'s lane.setFillStyle(CONFIG.colors.missionActive, ...) in
                // ../index.js - stays lit, not just a brief pulse like the other obstacle types
                // (07-*.md's new touch, since Stages 4-6 only had the unlit placeholder color).
                mesh.material.albedoColor = COLOR_MISSION_ACTIVE;
                mesh.material.emissiveColor = COLOR_MISSION_ACTIVE.scale(0.5);
                pulseMesh(mesh);
                // After the recolor, not before - the burst should match the new lit-green state.
                spawnHitBurst(scene, particleTexture, mesh, highFidelity);
                backglass.showMessage('RE-ENTRY!', 800);
                triggerCameraShake(80, 0.003); // matches hitReentryLane()'s cameraShake(80, 0.003)
                playHitSound(990);
                progressMission('lane');
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
            setLives(lives);
            backglass.state.lives = lives;
            backglass.showMessage('DRAINED!', 1400); // no Grim Reaper visual yet (Stage 12) - this is the stand-in
            triggerCameraShake(400, 0.008); // matches checkDrain()'s cameraShake(400, 0.008)
            flashScreen(200, 255, 0, 0); // matches checkDrain()'s cameraFlash(200, 255, 0, 0, true) - red
            // Quick downward dip - a 3D-only "snap toward the void" beat with no 2D equivalent
            // (that camera couldn't move through space at all).
            triggerCameraPunch(400, new BABYLON.Vector3(0, -0.03, 0));
            playDrainSound();
            setTimeout(() => {
                if (lives <= 0) {
                    // Stage 12: was "reset lives/score in place" (Stage 6's documented
                    // simplification, made before any Game Over screen existed to show final
                    // results on). Now shows the real Game Over screen instead; NEW GAME/restart
                    // input there is what actually resets state - see showGameOverScreen().
                    showGameOverScreen();
                    return;
                }
                backglass.redraw();
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

        // --- Menu, Pause, Controls, Game Over screens (Stage 12, babylon-prompts/12-*.md) ---
        //
        // Built as DOM/CSS overlays, not 3D meshes or Babylon GUI, per the doc's own explicit
        // instruction (see index.html's <style> block comment for the full reasoning - HTML/CSS
        // is easier to get font rendering/focus/screen-reader behavior right on for text-heavy,
        // infrequently-changing screens than a 3D-scene text layout system would be; the 3D-
        // mounted-panel treatment is reserved for the in-gameplay backglass, 09-*.md, which earns
        // its 3D-ness by being part of the cabinet during play).
        //
        // Final Rank and a Missions Completed stat line (see showGameOverScreen() below) were
        // deliberately NOT shown when this stage was built - no mission FSM existed yet, so a
        // "Final Rank" would've just been a permanently-fake "Rookie." Both now show real,
        // earned values - see improvement-prompts/05-*.md.
        const menuOverlay = document.getElementById('menu-overlay');
        const pauseOverlay = document.getElementById('pause-overlay');
        const controlsOverlay = document.getElementById('controls-overlay');
        const gameOverOverlay = document.getElementById('gameover-overlay');
        const pauseBtn = document.getElementById('pause-btn');

        let isPaused = false;
        let gameOverActive = false;

        // --- Menu/title screen: shown until the first launch input, translucent so the idle
        // attract-mode camera (10-*.md) is visible behind it, matching the doc's explicit spec. ---
        document.getElementById('menu-highscore').textContent = 'HIGH SCORE: ' + backglass.state.highScore;
        document.getElementById('menu-start-instructions').textContent =
            isMobileDevice ? 'TAP ⚡ TO START' : 'PRESS SPACE TO START';
        menuOverlay.style.display = 'flex';

        function hideMenuScreen() {
            menuOverlay.style.display = 'none';
        }

        // Tap-anywhere-to-start, matching MenuScene's this.input.once('pointerdown', ...) in
        // ../index.js - the overlay covers the full screen while visible, so this naturally
        // takes priority over the flipper zones/launch button underneath without needing to
        // modify their own handlers.
        menuOverlay.addEventListener('click', () => {
            hideMenuScreen();
            handleLaunchPress(); // also ends attract mode internally
        });

        // --- Controls reference content, platform-aware (archive/release-prompts/04-*.md's content -
        // this already-replaced the old non-functional sound/music toggle with a real controls
        // reference; that decision carries over unchanged, just re-rendered as DOM). ---
        function renderControlsRows() {
            const rowsEl = document.getElementById('controls-rows');
            rowsEl.innerHTML = '';
            const rows = isMobileDevice ? [
                ['◀ / ▶ ZONES', 'Left / Right Flippers'],
                ['⚡ BUTTON', 'Hold to Charge, Release to Launch'],
                ['⏸ BUTTON', 'Pause / Resume']
            ] : [
                ['LEFT / RIGHT ARROWS', 'Left / Right Flippers'],
                ['SPACE', 'Hold to Charge, Release to Launch'],
                ['ESC', 'Pause / Resume']
            ];
            rows.forEach(([key, action]) => {
                const row = document.createElement('div');
                row.className = 'control-row';
                const keySpan = document.createElement('span');
                keySpan.className = 'key';
                keySpan.textContent = key;
                const actionSpan = document.createElement('span');
                actionSpan.className = 'action';
                actionSpan.textContent = action;
                row.appendChild(keySpan);
                row.appendChild(actionSpan);
                rowsEl.appendChild(row);
            });
        }
        renderControlsRows();

        // --- Pause / Controls flow, ported from pauseGame()/resumeGame()/showSettingsMenu() in
        // ../index.js. scene.physicsEnabled toggling confirmed against Babylon's actual source
        // (see the render loop's pause-gate comment below) - not guessed. ---
        function openPauseMenu() {
            if (isPaused || gameOverActive || menuOverlay.style.display === 'flex') return;
            isPaused = true;
            scene.physicsEnabled = false;
            pauseOverlay.style.display = 'flex';
        }

        function resumeGame() {
            if (!isPaused) return;
            isPaused = false;
            scene.physicsEnabled = true;
            pauseOverlay.style.display = 'none';
            controlsOverlay.style.display = 'none';
        }

        function openControlsScreen() {
            pauseOverlay.style.display = 'none';
            controlsOverlay.style.display = 'flex';
        }

        function backFromControlsScreen() {
            controlsOverlay.style.display = 'none';
            pauseOverlay.style.display = 'flex';
        }

        // Matches restartGame()'s scene.start('GameScene') in ../index.js - straight back into
        // gameplay, no menu detour. Resets all run state, not just the ball's position.
        function startNewGame() {
            score = 0;
            lives = STARTING_LIVES;
            stats.bumperHits = 0;
            stats.satelliteHits = 0;
            stats.targetHits = 0;
            stats.laneHits = 0;
            stats.missionsCompleted = 0;
            // Rank/mission progression (improvement-prompts/05-*.md) is per-run state, same as
            // score/lives/stats above - resets on every new game, not a permanent meta-progression.
            mission.state = 'idle';
            mission.selectedIndex = null;
            mission.progress = 0;
            mission.required = 0;
            mission.rank = 0;
            backglass.state.rank = RANK_NAMES[0];
            backglass.state.missionName = null;
            backglass.state.missionProgress = 0;
            setScore(0);
            setLives(lives);
            backglass.state.score = 0;
            backglass.state.lives = lives;
            backglass.redraw();
            resetBallToPlunger();
            isPaused = false;
            scene.physicsEnabled = true;
            pauseOverlay.style.display = 'none';
            controlsOverlay.style.display = 'none';
            gameOverOverlay.style.display = 'none';
            gameOverActive = false;
        }

        document.getElementById('pause-resume-btn').addEventListener('click', resumeGame);
        document.getElementById('pause-newgame-btn').addEventListener('click', startNewGame);
        document.getElementById('pause-controls-btn').addEventListener('click', openControlsScreen);
        document.getElementById('controls-back-btn').addEventListener('click', backFromControlsScreen);

        // Mute toggle (improvement-prompts/04-*.md) - reflects the persisted isAudioMuted() state
        // on load, not just after the first toggle, so returning players see their previous
        // choice immediately rather than a stale "ON" until they touch it once.
        const muteToggleBtn = document.getElementById('mute-toggle-btn');
        function updateMuteButtonLabel() {
            muteToggleBtn.textContent = isAudioMuted() ? '🔇 SOUND: OFF' : '🔊 SOUND: ON';
        }
        updateMuteButtonLabel();
        muteToggleBtn.addEventListener('click', () => {
            setAudioMuted(!isAudioMuted());
            updateMuteButtonLabel();
        });

        function togglePauseFromButton(e) {
            e.preventDefault();
            if (isPaused) {
                resumeGame();
            } else {
                openPauseMenu();
            }
        }
        pauseBtn.addEventListener('click', togglePauseFromButton);
        pauseBtn.addEventListener('touchstart', togglePauseFromButton, { passive: false });

        // ESC: single persistent listener (archive/release-prompts/07-*.md's lesson - check state each
        // time a key event fires, don't re-register a resume/back shortcut every time a screen
        // opens, which is what caused the original listener-leak bug this ports the fix from).
        // Backs out of the Controls submenu to the pause menu instead of resuming outright when
        // that submenu is open, matching the 2D version's exact behavior.
        window.addEventListener('keydown', (e) => {
            if (e.code !== 'Escape') return;
            if (controlsOverlay.style.display === 'flex') {
                backFromControlsScreen();
                return;
            }
            if (isPaused) {
                resumeGame();
            } else if (!gameOverActive && menuOverlay.style.display !== 'flex') {
                openPauseMenu();
            }
        });

        // --- Game Over screen, ported from GameOverScene in ../index.js. Triggered from
        // handleDrain() above when lives reach 0 (previously that just reset score/lives in
        // place - see this stage's implementation note). ---
        function showGameOverScreen() {
            gameOverActive = true;
            playGameOverSound();
            document.getElementById('gameover-score').textContent = String(score);
            // Final Rank (improvement-prompts/05-*.md) - previously deliberately omitted per
            // Stage 12's implementation note, since no real rank-progression system existed yet
            // to back it; backglass.state.rank now holds this run's genuine final rank.
            document.getElementById('gameover-rank-line').textContent = 'FINAL RANK: ' + backglass.state.rank;

            const hsLine = document.getElementById('gameover-highscore-line');
            if (score >= backglass.state.highScore) {
                hsLine.textContent = 'NEW HIGH SCORE!';
                hsLine.classList.add('pulse-text');
            } else {
                hsLine.textContent = 'HIGH SCORE: ' + backglass.state.highScore;
                hsLine.classList.remove('pulse-text');
            }

            const statsEl = document.getElementById('gameover-stats');
            statsEl.innerHTML = '';
            const statLines = [
                ['Missions Completed', stats.missionsCompleted],
                ['Bumper Hits', stats.bumperHits],
                ['Satellite Hits', stats.satelliteHits],
                ['Target Hits', stats.targetHits],
                ['Lane Hits', stats.laneHits]
            ];
            statLines.forEach(([label, value]) => {
                if (value > 0) {
                    const p = document.createElement('p');
                    p.textContent = label + ': ' + value;
                    statsEl.appendChild(p);
                }
            });

            document.getElementById('gameover-restart-instructions').textContent =
                isMobileDevice ? 'TAP ⚡ TO PLAY AGAIN' : 'PRESS SPACE TO PLAY AGAIN';
            gameOverOverlay.style.display = 'flex';
        }

        // Tap-anywhere-to-restart, matching GameOverScene's this.input.once('pointerdown', ...).
        gameOverOverlay.addEventListener('click', startNewGame);

        engine.runRenderLoop(() => {
            const deltaMs = engine.getDeltaTime();

            // Pause gate (Stage 12, babylon-prompts/12-*.md): scene.physicsEnabled = false
            // (toggled in openPauseMenu()/resumeGame() below) already stops Havok's own step -
            // confirmed against Babylon's actual source (scene.pure.ts: `if (this.physicsEnabled)
            // this._advancePhysicsEngineStep(...)`) - so the flippers/ball naturally freeze via
            // real physics with no separate flag needed for them. What Havok's flag does NOT
            // cover is this file's OWN per-frame JS logic (anti-stuck kicks, velocity clamping,
            // trail emission, plunger charge accumulation) - those run every render-loop tick
            // regardless of scene.physicsEnabled, so they need their own explicit guard here to
            // satisfy the doc's "no charge-time or physics-state corruption from the pause
            // duration" requirement. Camera effects and the dev-panel status readouts are left
            // running during pause - harmless either way, and simpler than guarding everything.
            if (!isPaused) {
                updateFlipperMotor(leftFlipper, deltaMs);
                updateFlipperMotor(rightFlipper, deltaMs);
                updateBallPhysics(mainBall, deltaMs);
                testBalls.forEach((ball) => updateBallPhysics(ball, deltaMs));
                updateBallTrail(ballTrail, mainBall, highFidelity);

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

                // Continuous charge-to-power curve, ported from updatePlunger() in ../index.js -
                // no fixed tiers, power increases smoothly with hold duration up to
                // PLUNGER_CHARGE_TIME_MS. Guarded by isPaused so charge time doesn't keep
                // accumulating while the pause menu is open.
                if (plungerCharging) {
                    plungerChargeElapsedMs += deltaMs;
                    const chargePercent = Math.min(plungerChargeElapsedMs / PLUNGER_CHARGE_TIME_MS, 1);
                    plungerPower = PLUNGER_MIN_POWER_MS + (PLUNGER_MAX_POWER_MS - PLUNGER_MIN_POWER_MS) * chargePercent;
                    plunger.chargePercent = chargePercent;
                }
                updatePlungerVisual(plunger);
            }

            if (attractModeActive) {
                attractCamera.alpha += deltaMs * 0.00015; // slow continuous orbit
            } else {
                updateCameraEffects(deltaMs);
            }

            statusStuckTimer.textContent = Math.round(mainBall.stuckTimeMs) + ' ms';
            statusPlungerCharge.textContent = Math.round(plunger.chargePercent * 100) + '%';

            // Live flipper angle readout (degrees) - reads the flipper's own tracked state
            // directly (see createFlipper()/updateFlipperMotor()), not a physics-engine
            // transform, since flippers are now kinematic (see createFlipper()'s comment).
            statusLeftFlipper.textContent = flipperAngleDegrees(leftFlipper).toFixed(1) + '°';
            statusRightFlipper.textContent = flipperAngleDegrees(rightFlipper).toFixed(1) + '°';

            scene.render();
        });
        window.addEventListener('resize', () => engine.resize());

        console.log('[SPIRITBALL 3D] Flippers + obstacle layout initialized.');
    }

    main().catch((err) => {
        // Reactive fallback for SIMD-incompatible browsers/devices the proactive iOS-version
        // check above doesn't specifically name (e.g. an old desktop browser or unusual WebView)
        // - any Havok init failure whose message mentions WASM/WebAssembly/SIMD is treated as a
        // compatibility issue, not a generic/network failure, and gets the honest message +
        // 2D-version link instead of the raw technical error.
        const message = err && err.message ? err.message : String(err);
        if (/wasm|webassembly|simd/i.test(message)) {
            showUnsupportedMessage(message);
        } else {
            showFatalError('Failed to initialize SPIRITBALL 3D.', err);
        }
    });
})();
