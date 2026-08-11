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

// All config/constants (physics tuning, table/obstacle geometry, scoring, timing, cooldowns,
// mission/combo/rank definitions, the palette's raw hex values, and a few pure helper
// functions) live in js/config.js - the first extraction of a larger effort to split this
// file's accumulated systems into logical ES modules (user-requested; see MODULARIZATION.md
// at the repo root for the full remaining plan). Every name below is imported back as a bare
// identifier (not a namespace object) specifically so every other line in this file that
// already refers to e.g. PX_TO_M or SCORE_ORBIT by that bare name keeps working completely
// unchanged - only the declarations' location moved, nothing about how they're used did.
import {
    PX_TO_M, TABLE_WIDTH_M, TABLE_LENGTH_M, WALL_HEIGHT_M,
    COLLISION_CATEGORY_BALL, toWorldX, toWorldZ, toWorldRotationY,
    TABLE_TILT_DEGREES, TILT_RAD, GRAVITY_VECTOR_FN, BALL_DIAMETER_M,
    BALL_MASS_KG, MAX_BALL_SPEED_MS, WORLD_MAX_LINEAR_SPEED_MS, STUCK_SPEED_THRESHOLD_MS,
    STUCK_TIME_THRESHOLD_MS, STUCK_KICK_X_RANGE_MS, STUCK_KICK_DOWNHILL_MS, STUCK_KICK_UP_MS,
    FLIPPER_LENGTH_M, FLIPPER_THICKNESS_M, FLIPPER_HEIGHT_M, FLIPPER_MASS_KG,
    FLIPPER_GAP_HALF_M, FLIPPER_Z_M, FLIPPER_PLAYFIELD_CLEARANCE_M, FLIPPER_SWEEP_RAD,
    FLIPPER_LEFT_REST_RAD, FLIPPER_RIGHT_REST_RAD, FLIPPER_ACTIVATE_SPEED_RAD_S, FLIPPER_RETURN_SPEED_RAD_S,
    BUMPER_RADIUS_M, BUMPER_CLUSTER, BUMPER_KICK_SPEED_MS, TARGET_RADIUS_M,
    MISSION_TARGET_BANK, TARGET_RAISED_Y_M, TARGET_DROPPED_Y_M, TARGET_DROP_ANIM_MS,
    SATURN_RADIUS_M, SATURN_POS, COMET_RADIUS_M, COMET_POS,
    POWERUP_RADIUS_M, POWERUP_POS, POWERUP_SPAWN_INTERVAL_MS, POWERUP_ACTIVE_DURATION_MS,
    POWERUP_MULTIPLIER, POWERUP_MULTIPLIER_DURATION_MS, SLINGSHOT_SIZE_M, SLINGSHOTS,
    SLINGSHOT_KICK_SPEED_MS, SLINGSHOT_KICK_UPTABLE_BIAS_MS, REENTRY_LANE_RADIUS_M, REENTRY_LANES,
    LANE_Z_TOP_M, LANE_Z_BOTTOM_M, LANE_DIVIDER_X_M, LANE_TRIGGER_Z_M,
    INLANE_TRIGGER_X_M, OUTLANE_TRIGGER_X_M, LANE_TRIGGER_WIDTH_M, LANE_TRIGGER_DEPTH_M,
    INLANE_GUIDE_TOP_X_M, INLANE_GUIDE_BOTTOM_X_M, SIDE_LANES, ORBIT_RAIL_BOTTOM_Z_M,
    ORBIT_RAIL_TOP_Z_M, ORBIT_ENTRANCE_Z_M, ORBIT_COMPLETION_Z_M, ORBIT_TRIGGER_WIDTH_M,
    ORBIT_TRIGGER_DEPTH_M, ORBIT_COMPLETION_WINDOW_MS, ORBITS, VISION_GATE_POS,
    VISION_GATE_RADIUS_M, VISION_GATE_COLLAR_RADIUS_M, SCORE_VISION_GATE, VISION_GATE_SEQUENCE_MS,
    COOLDOWN_VISION_GATE_MS, VISION_GATE_EJECT_SPEED_MS, HEX_VISION_GATE, BALL_REST_X_PX,
    BALL_REST_Z_PX, BALL_REST_Z_M, BALL_REST_Y_M, LANE_INNER_WALL_X_PX,
    LANE_WALL_Z_TOP_PX, LANE_WALL_Z_BOTTOM_PX, PLUNGER_CHARGE_TIME_MS, PLUNGER_MIN_POWER_MS,
    PLUNGER_MAX_POWER_MS, PLUNGER_HORIZONTAL_BASE_MS, PLUNGER_HORIZONTAL_RATIO, SKILL_SHOT_WINDOW_MS,
    SKILL_SHOT_Z_M, SKILL_SHOT_DEPTH_M, SCORE_SKILL_SHOT_SUPER, SCORE_SKILL_SHOT_MID,
    SCORE_SKILL_SHOT_SAFE, SKILL_SHOT_LANES, BALL_SAVE_WINDOW_MS, BALL_SAVE_RETURN_DELAY_MS,
    KICKBACK_SIDE, KICKBACK_INWARD_SPEED_MS, KICKBACK_UPTABLE_BIAS_MS, PLUNGER_REST_Z_M,
    PLUNGER_TRAVEL_M, SCORE_ATTACK_BUMPER, SCORE_BOSS_BUMPER, SCORE_COMET,
    SCORE_MISSION_TARGET, SCORE_TARGET_BANK_COMPLETE, SCORE_REENTRY_LANE, SCORE_LANE_BANK_COMPLETE,
    LANE_BANK_RESET_DELAY_MS, SCORE_SLINGSHOT, SCORE_SATURN, MISSION_COMPLETE_BONUS,
    SCORE_INLANE, SCORE_OUTLANE, SCORE_ORBIT, BONUS_MULTIPLIER_MAX,
    BONUS_MISSION_COMPLETE_AMOUNT, BONUS_MAJOR_SHOT_AMOUNT, BONUS_COUNT_TICKS, BONUS_COUNT_TICK_MS,
    BONUS_COUNT_REDUCED_MOTION_MS, COMBO_ORBIT_TYPES, COMBO_STEP_WINDOW_MS, COMBO_TRIPLE_STEP_WINDOW_MS,
    COMBO_CHAIN_WINDOW_MS, COMBO_MAX_TIER, COMBO_BASE_SCORE, COMBO_MESSAGE_MS,
    COMBO_DEFS, RANK_NAMES, MISSION_DEFS, missionRequiredCount,
    COOLDOWN_BUMPER_MS, COOLDOWN_COMET_MS, COOLDOWN_SLINGSHOT_MS, COOLDOWN_MISSION_TARGET_MS,
    COOLDOWN_REENTRY_LANE_MS, COOLDOWN_SATURN_MS, COOLDOWN_SIDE_LANE_MS, COOLDOWN_ORBIT_MS,
    COOLDOWN_WALL_MS, COOLDOWN_FLIPPER_MS, DRAIN_ZONE_WIDTH_M, DRAIN_ZONE_DEPTH_PX,
    DRAIN_ZONE_CENTER_Y_PX, STARTING_LIVES, hexToColor3, HEX_BALL,
    HEX_EYEBALL, HEX_FLIPPER, HEX_WALL, HEX_BUMPERS,
    HEX_CHAKRA, HEX_SATURN, HEX_SATURN_RING, HEX_COMET,
    HEX_MISSION_ACTIVE, HEX_LANE_LAMP, HEX_ORBIT_LAMP, HEX_SKILL_SHOT_LAMP,
    HEX_BALL_SAVE_LAMP, HEX_KICKBACK_LAMP, HEX_BACKGROUND
} from './js/config.js';

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

    // Dev HUD "particle effects" toggle (?dev=1 tuning HUD, user-requested) - module-scope because
    // spawnHitBurst()/buildChakraSparkle()/buildDrainVortex() below are module-scope helpers, not
    // closures over main()'s local state, and every one of their call sites lives inside main().
    // A single flag checked inside those three shared functions covers every particle spawn site
    // in the game without touching each call site individually. Defaults true - normal players see
    // no behavior change; only the dev HUD's own checkbox (main()) ever sets this false.
    let devParticlesEnabled = true;

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

    // Requires a user gesture, so this can't happen automatically on page load - called from
    // every touchstart anywhere (see main()) until it actually succeeds. Failures are silently
    // ignored (fullscreen can be denied by the browser; orientation lock isn't supported at all
    // on iOS Safari) - a nice-to-have enhancement, never a requirement to play.
    function requestFullscreenAndLock() {
        if (fullscreenRequested) return;
        fullscreenRequested = true;
        const el = document.documentElement;
        const lockPortrait = () => {
            if (screen.orientation && screen.orientation.lock) {
                screen.orientation.lock('portrait').catch(() => {});
            }
        };
        // Already running as an installed/standalone PWA (matchMedia covers Android/desktop;
        // navigator.standalone covers iOS home-screen web apps) - the OS is already presenting
        // this as a fullscreen app window, so calling the Fullscreen API here would be redundant
        // (and on iOS standalone specifically, unsupported). Orientation lock is still worth
        // attempting either way.
        const alreadyStandalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
        if (alreadyStandalone) {
            lockPortrait();
            return;
        }
        const requestFs = el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen;
        if (requestFs) {
            Promise.resolve(requestFs.call(el)).then(lockPortrait).catch(() => {});
        } else {
            lockPortrait();
        }
    }

    // If fullscreen is exited for any reason mid-game (a system gesture, the browser's own UI,
    // the player backing out) - not just at page load - fullscreenRequested resets so the next
    // touch anywhere retries entering it, instead of requestFullscreenAndLock() being a permanent
    // no-op for the rest of the session after the very first attempt.
    document.addEventListener('fullscreenchange', () => {
        if (!document.fullscreenElement) fullscreenRequested = false;
    });
    document.addEventListener('webkitfullscreenchange', () => {
        if (!document.webkitFullscreenElement) fullscreenRequested = false;
    });

    // vibrateDevice() accepts either a plain ms number (a single buzz) or an array (navigator.
    // vibrate()'s native alternating vibrate/pause-ms pattern format) - callers below pass whichever
    // shape fits. Differentiated haptics (user-requested), all deliberately short - a single quick
    // tick for the two high-frequency events (every flipper flap, every bumper hit) and a brief
    // two/three-pulse pattern for the two rare, celebratory ones, kept well under a few hundred ms
    // total so none of them ever reads as a "long vibration."
    const HAPTIC_FLIPPER_MS = 8;
    const HAPTIC_BUMPER_MS = 18;
    const HAPTIC_BALL_SAVE_PATTERN = [20, 60, 20];
    const HAPTIC_MISSION_COMPLETE_PATTERN = [15, 40, 15, 40, 30];

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

    // Continuous ball-rolling texture (user-requested) - tuning for updateRollingSound()/
    // initRollingSound() further below. Mapped against the same MAX_BALL_SPEED_MS ceiling every
    // other speed-based system in this file already uses, not a separately-invented range.
    // Kept deliberately quiet (MAX_GAIN) - background texture, not a lead sound.
    const ROLLING_SOUND_MIN_SPEED_MS = 0.03; // below this the ball reads as "at rest" - silent rather than a constant idle hiss
    const ROLLING_SOUND_MAX_GAIN = 0.08;
    const ROLLING_SOUND_MIN_FILTER_HZ = 140; // slow ball: dull low rumble
    const ROLLING_SOUND_MAX_FILTER_HZ = 1600; // fast ball: brighter, rougher texture
    const ROLLING_SOUND_MIN_RATE = 0.7;
    const ROLLING_SOUND_MAX_RATE = 2.0;
    // setTargetAtTime() time-constant - smooths frame-to-frame speed jitter into one continuous
    // glide instead of a stepped/zippery sweep; also what makes the sound fade in/out cleanly
    // rather than clicking on/off (see updateRollingSound()'s comment).
    const ROLLING_SOUND_SMOOTHING_S = 0.09;

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
        // Plunger spring/launch (user-requested layer) - a short noise transient (the spring
        // itself releasing, louder on a stronger charge) right under the existing rising sweep
        // (the ball being carried away) - the sweep alone read as a pure electronic "whoosh" with
        // no mechanical attack; this gives it a physical onset without changing its shape.
        playNoiseClick(0.025, 0.08 + powerPercent * 0.05);
        // Rising sweep, low -> high - stronger launches sweep further and land louder.
        playTone(140, 0.22, { type: 'triangle', freqEnd: 140 + powerPercent * 500, volume: 0.15 + powerPercent * 0.1 });
    }

    function playFlipperSound() {
        playNoiseClick(0.05, 0.12);
    }

    function playWallSound() {
        // Ball hitting rail/wall (user-requested layer) - the existing noise click alone read as
        // a flat tap; a very short, quiet resonant knock underneath gives the rail a touch of
        // physical body without turning it into a musical tone or competing with the sharper
        // dedicated impact sounds (bumper/slingshot/target) above.
        playNoiseClick(0.03, 0.05);
        playTone(180, 0.04, { type: 'triangle', volume: 0.04 });
    }

    // One shared "hit" sound, pitched differently per obstacle type (see call sites) so they're
    // distinguishable by ear without needing a separate synthesis routine per type - matches this
    // prompt's own suggestion ("can reuse pitch/tone variation instead of building N separate
    // sounds").
    function playHitSound(pitch, volume = 0.14) {
        playTone(pitch, 0.15, { type: 'square', freqEnd: pitch * 0.6, volume });
    }

    // Pop-bumper solenoid (user-requested layer) - a fast noise "thwack" (the solenoid firing)
    // immediately under a quick downward-pitched triangle (the rubber ring's brief resonance
    // settling right after) - two short mechanical components instead of playHitSound()'s single
    // square-wave blip, so a bumper reads as a physical spring-loaded fixture rather than just a
    // differently-pitched ping. The boss bumper gets a lower, slightly louder version of the same
    // two-part shape - a bigger fixture, not a different sound.
    function playBumperSound(isBoss) {
        const base = isBoss ? 150 : 220;
        playNoiseClick(0.035, isBoss ? 0.16 : 0.13);
        playTone(base, 0.09, { type: 'triangle', freqEnd: base * 0.5, volume: isBoss ? 0.17 : 0.14 });
    }

    // Slingshot snap (user-requested layer) - a very short, sharp noise burst plus a fast rising
    // sawtooth chirp, shorter and higher than playBumperSound() above so the two "active kicker"
    // mechanisms read as distinctly different fixtures (a slingshot's rubber-band snap is a much
    // quicker, thinner sound than a pop bumper's springy thwack).
    function playSlingshotSound() {
        playNoiseClick(0.02, 0.13);
        playTone(700, 0.06, { type: 'sawtooth', freqEnd: 1400, volume: 0.13 });
    }

    // Target/drop-target clack (user-requested layer) - a noise burst plus a low-mid percussive
    // square-wave thock with no sweep, reading as a solid plastic/wood clack rather than
    // playBumperSound()'s springy resonance or playSlingshotSound()'s thin snap - matches a drop
    // target's own "flat panel physically dropping" feel.
    function playTargetClackSound() {
        playNoiseClick(0.03, 0.11);
        playTone(320, 0.08, { type: 'square', freqEnd: 200, volume: 0.12 });
    }

    // Rollover switch click (user-requested layer) - deliberately the lightest/shortest/quietest
    // of the physical-contact sounds here (a real rollover is a leaf switch brushed by the
    // ball's own weight, not an active mechanism like the three above), just a brief noise tick
    // plus a very short high sine blip. `pitch` keeps this file's existing per-side/per-lane
    // pitch-variation convention (e.g. inlane vs. outlane) without needing a separate function
    // per lane kind.
    function playRolloverClickSound(pitch = 900) {
        playNoiseClick(0.012, 0.06);
        playTone(pitch, 0.04, { type: 'sine', volume: 0.08 });
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

    // Giant Saturn hit (board redesign) - a single big, low-then-high "boom" distinct from the
    // regular playHitSound() ping, matching a boss-scale obstacle's weight.
    function playSaturnHitSound() {
        playTone(110, 0.35, { type: 'sawtooth', freqEnd: 220, volume: 0.2 });
        playNoiseClick(0.08, 0.15);
    }

    // Power-up collected (board redesign) - a bright, quick upward chime, distinct in timbre from
    // playRankUpSound()'s longer fanfare so the two "good news" stings don't sound identical.
    function playPowerUpSound() {
        playTone(500, 0.12, { type: 'sine', freqEnd: 900, volume: 0.18 });
        setTimeout(() => playTone(700, 0.18, { type: 'sine', freqEnd: 1200, volume: 0.16 }), 90);
    }

    // Orbit entrance - a short, quiet rising sweep, just enough to confirm "the shot registered"
    // without competing with the bigger completion sting that follows if the shot lands.
    function playOrbitEnterSound() {
        playTone(320, 0.09, { type: 'sine', freqEnd: 480, volume: 0.1 });
    }

    // Orbit completed - a two-note ascending sweep-then-chime, distinct in shape from both
    // playPowerUpSound() (two short upward chimes, no sweep) and playRankUpSound() (a longer
    // four-note fanfare) - reads as "you finished a loop," not "you collected something" or
    // "you ranked up." `pitchBase` differs between the two orbits (see the call sites) purely so
    // the ear can tell them apart, matching this file's existing per-obstacle pitch convention.
    function playOrbitCompleteSound(pitchBase) {
        playTone(pitchBase, 0.16, { type: 'sine', freqEnd: pitchBase * 1.8, volume: 0.17 });
        setTimeout(() => playTone(pitchBase * 1.5, 0.14, { type: 'triangle', volume: 0.15 }), 100);
    }

    // VISION GATE capture - a multi-layered "portal reveal," deliberately the longest and most
    // elaborate sting in the game (matching its status as the signature feature): a slow rising
    // sweep underneath two shimmering, overlapping tones, plus a soft noise layer for texture -
    // distinct in shape from every other sound here, none of which use more than two layers.
    function playVisionGateSound() {
        playTone(160, 0.5, { type: 'sawtooth', freqEnd: 420, volume: 0.16 });
        setTimeout(() => playTone(660, 0.3, { type: 'sine', freqEnd: 990, volume: 0.13 }), 150);
        setTimeout(() => playTone(880, 0.35, { type: 'triangle', freqEnd: 660, volume: 0.12 }), 300);
        playNoiseClick(0.15, 0.08);
    }

    // Drop-target bank cleared (user-requested upgrade) - a three-note ascending square-wave
    // fanfare, shorter than playRankUpSound()'s four-note one so the two "you achieved something"
    // stings don't read as identical, and square-toned rather than sine/triangle so it's also
    // distinct from playOrbitCompleteSound()'s sweep-then-chime.
    function playTargetBankCompleteSound() {
        playTone(440, 0.14, { type: 'square', volume: 0.16 });
        setTimeout(() => playTone(660, 0.14, { type: 'square', volume: 0.16 }), 110);
        setTimeout(() => playTone(880, 0.22, { type: 'square', volume: 0.18 }), 220);
    }

    // Rollover-lane bank cleared (user-requested upgrade) - two rising triangle sweeps plus a
    // settling sine note and a noise click, distinct in shape from playTargetBankCompleteSound()'s
    // flat square-wave notes so the two "you cleared a bank" stings don't read as the same sound
    // with different pitches.
    function playLaneBankCompleteSound() {
        playTone(300, 0.16, { type: 'triangle', freqEnd: 600, volume: 0.17 });
        setTimeout(() => playTone(500, 0.16, { type: 'triangle', freqEnd: 1000, volume: 0.18 }), 120);
        setTimeout(() => playTone(750, 0.28, { type: 'sine', volume: 0.2 }), 240);
        playNoiseClick(0.1, 0.1);
    }

    // One tick of the end-of-ball bonus count (user-requested subsystem) - deliberately short
    // and quiet, since updateBonusCount() in main() fires this up to BONUS_COUNT_TICKS times in
    // quick succession; anything longer/louder than playHitSound()'s regular pitch would stack
    // into a mess at that repetition rate.
    function playBonusTickSound() {
        playTone(660, 0.05, { type: 'square', volume: 0.09 });
    }

    // Combo completion (lightweight combo scoring, user-requested) - pitch rises and gains one
    // extra harmonizing note per tier (capped at three notes total even at the highest tier), so
    // higher combos read as "bigger" purely through timbre/pitch, not volume or duration -
    // deliberately restrained rather than an increasingly long/loud sting, matching the "avoid
    // excessive" spirit that also keeps this feature's camera shake fixed regardless of tier.
    function playComboSound(tier) {
        const basePitch = 480 + tier * 90;
        playTone(basePitch, 0.1, { type: 'sine', freqEnd: basePitch * 1.4, volume: 0.14 });
        if (tier >= 2) {
            setTimeout(() => playTone(basePitch * 1.3, 0.12, { type: 'sine', volume: 0.15 }), 80);
        }
        if (tier >= 3) {
            setTimeout(() => playTone(basePitch * 1.6, 0.14, { type: 'triangle', volume: 0.16 }), 160);
        }
    }

    // Upper-lane skill shot award (user-requested) - laneIndex 0 (SUPER SKILL SHOT, the hardest/
    // best lane) gets the biggest three-note fanfare; laneIndex 2 (LAUNCH SHOT, the easy/common
    // lane) gets a single short chime - so the sound itself telegraphs which tier was hit, same
    // "bigger achievement, bigger sting" scaling as playComboSound()/playRankUpSound(), just keyed
    // by lane instead of tier.
    function playSkillShotSound(laneIndex) {
        const notes = 3 - laneIndex;
        const basePitch = 700 - laneIndex * 60;
        for (let i = 0; i < notes; i++) {
            setTimeout(() => playTone(basePitch * (1 + i * 0.35), 0.12, { type: 'triangle', freqEnd: basePitch * (1 + i * 0.35) * 1.3, volume: 0.16 }), i * 90);
        }
    }

    // Ball save (fairness mechanics, user-requested) - a warm, rising sine sweep plus a bright
    // confirm note: the deliberate mirror-image of playDrainSound()'s single downward sawtooth
    // sweep, so a save reads as unambiguously good news at a glance (by ear) even before the
    // backglass text registers.
    function playBallSaveSound() {
        playTone(300, 0.3, { type: 'sine', freqEnd: 700, volume: 0.16 });
        setTimeout(() => playTone(900, 0.18, { type: 'sine', volume: 0.18 }), 220);
    }

    // Outlane kickback fired (fairness mechanics, user-requested) - a mechanical clack (reusing
    // playWallSound()'s own noise-click building block, just louder/longer - a real solenoid
    // firing) immediately followed by a rising "launched back into play" tone, distinct in shape
    // from playLaunchSound()'s own sweep so the two don't sound interchangeable.
    function playKickbackSound() {
        playNoiseClick(0.05, 0.14);
        setTimeout(() => playTone(260, 0.16, { type: 'sawtooth', freqEnd: 620, volume: 0.17 }), 30);
    }

    // ===================================
    // Ball rolling intensity (user-requested layer) - the one sound in this file that has to run
    // CONTINUOUSLY and track a smoothly-changing value (ball speed) instead of firing once per
    // event, so it uses a fundamentally different technique from every play*Sound() function
    // above: one persistent node graph (a looping noise buffer -> lowpass filter -> gain ->
    // masterGainNode), built exactly ONCE by initRollingSound() and then left connected and
    // playing for the rest of the session. updateRollingSound() (called every render-loop frame
    // in main()) never creates a node - it only calls setTargetAtTime() on that same filter/gain/
    // playbackRate three times a frame, satisfying "avoid creating excessive nodes every frame"
    // by construction. setTargetAtTime()'s exponential glide toward a moving target is also what
    // gives "start/stop cleanly and scale smoothly" for free: there's no discrete start or stop
    // at all, just a continuously-updated target the sound eases toward - a to-rest ball or a
    // paused game both just glide down to targetGain 0 the same way a fast one glides up.
    // ===================================
    let rollingSoundNodes = null;

    // Lazy, one-time init - only ever actually invoked once updateRollingSound() below has real
    // speed to report (i.e. after the ball's first genuine launch), so this can't spin up an
    // AudioContext during attract mode before any tap/keypress - same mobile-autoplay-safe rule
    // getAudioContext() already enforces for every other sound in this file.
    function initRollingSound() {
        if (rollingSoundNodes) return rollingSoundNodes;
        const ctx = getAudioContext();
        if (!ctx) return null;
        try {
            const bufferSize = Math.floor(ctx.sampleRate); // 1 second - a loop point in raw noise reads as inaudible (no coherent waveform to interrupt), no crossfade needed
            const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

            const source = ctx.createBufferSource();
            source.buffer = buffer;
            source.loop = true;

            const filter = ctx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.value = ROLLING_SOUND_MIN_FILTER_HZ;

            const gain = ctx.createGain();
            gain.gain.value = 0; // silent until updateRollingSound() reports real speed

            source.connect(filter);
            filter.connect(gain);
            gain.connect(masterGainNode); // shared master gain, same as every other sound - respects mute automatically
            source.start();

            rollingSoundNodes = { source, filter, gain };
        } catch (e) {
            rollingSoundNodes = null; // decorative only - a failed init just means silence, never a crash
        }
        return rollingSoundNodes;
    }

    // Called every render-loop frame from main() with the main ball's physics body and whether
    // it should currently be audible (ballInPlay && !isPaused - computed by the caller, not read
    // from closure, matching this file's existing top-level update*() convention of taking state
    // as parameters rather than reaching into main()'s scope). `active` false with no nodes yet
    // built is the common "game hasn't started" case and exits before touching audio at all.
    function updateRollingSound(body, active) {
        if (!active && !rollingSoundNodes) return;
        const nodes = initRollingSound();
        if (!nodes || !body) return;
        const ctx = audioCtx;

        let targetGain = 0;
        let targetFilterHz = ROLLING_SOUND_MIN_FILTER_HZ;
        let targetRate = ROLLING_SOUND_MIN_RATE;
        if (active) {
            const v = body.getLinearVelocity();
            const speed = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
            if (speed >= ROLLING_SOUND_MIN_SPEED_MS) {
                const t = Math.min(speed / MAX_BALL_SPEED_MS, 1);
                targetGain = ROLLING_SOUND_MAX_GAIN * t;
                targetFilterHz = ROLLING_SOUND_MIN_FILTER_HZ + (ROLLING_SOUND_MAX_FILTER_HZ - ROLLING_SOUND_MIN_FILTER_HZ) * t;
                targetRate = ROLLING_SOUND_MIN_RATE + (ROLLING_SOUND_MAX_RATE - ROLLING_SOUND_MIN_RATE) * t;
            }
        }

        nodes.gain.gain.setTargetAtTime(targetGain, ctx.currentTime, ROLLING_SOUND_SMOOTHING_S);
        nodes.filter.frequency.setTargetAtTime(targetFilterHz, ctx.currentTime, ROLLING_SOUND_SMOOTHING_S);
        nodes.source.playbackRate.setTargetAtTime(targetRate, ctx.currentTime, ROLLING_SOUND_SMOOTHING_S);
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

    // Visual identity (babylon-prompts/07-*.md) - SPIRITBALL's actual DMT/cosmic/chakra palette.
    // The raw HEX_* numbers and the hexToColor3() conversion helper live in js/config.js (see its
    // own comment there for why BABYLON.Color3 objects are deliberately never constructed at
    // module-evaluation time); these COLOR_* names are declared here (as `let`, unassigned) so
    // every function below can close over them, but they're only actually populated inside
    // main(), after BABYLON is confirmed loaded - see the "Populate deferred COLOR_* constants"
    // block there.
    let COLOR_BALL, COLOR_EYEBALL, COLOR_FLIPPER, COLOR_WALL, COLOR_BUMPERS, COLOR_CHAKRA,
        COLOR_SATURN, COLOR_SATURN_RING, COLOR_COMET, COLOR_MISSION_ACTIVE, COLOR_LANE_LAMP, COLOR_ORBIT_LAMP,
        COLOR_SKILL_SHOT_LAMP, COLOR_BALL_SAVE_LAMP, COLOR_KICKBACK_LAMP, COLOR_VISION_GATE, COLOR_BACKGROUND;

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

    // Giant Saturn's continuous spin (board redesign) - two rings turning in opposite directions,
    // called unconditionally every rendered frame (not gated by isPaused) so the table still
    // reads as "alive" on the menu/pause/game-over screens, matching the drain vortex particle
    // system's own always-running treatment. Reduced under prefers-reduced-motion (slowed, not
    // stopped outright) - this is ambient/decorative motion, not gameplay-critical feedback, the
    // same category buildDrainVortex()'s emitRate reduction already established.
    const SATURN_SPIN_RATE_RAD_MS = 0.0006;
    function updateSaturnRotation(saturnRings, deltaMs) {
        const rate = window.SPIRITBALL_reducedMotion ? SATURN_SPIN_RATE_RAD_MS * 0.15 : SATURN_SPIN_RATE_RAD_MS;
        saturnRings[0].rotation.y += rate * deltaMs;
        saturnRings[1].rotation.y -= rate * deltaMs * 0.7; // slightly different speed/opposite direction, so the two rings read as independently turning, not one solid piece
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

        // Score/lives (improvement-prompts/07-*.md) deliberately live ONLY on #player-hud now,
        // not here - see that DOM element's own comment in index.html for the full reasoning
        // (guaranteed-legible on any device/camera angle vs. this panel's "cabinet flavor" role).
        // The backglass keeps everything the DOM HUD doesn't show: the high score to beat, rank,
        // active mission progress, and transient hit messages - genuinely complementary now,
        // not a second "SCORE 0" competing with the first.
        const state = {
            highScore: 0, message: '', messageTimer: null,
            // Mission/rank progression (improvement-prompts/05-*.md) - missionName is null when
            // no mission is active, matching the original 2D HUD's "Select Mission" idle state.
            rank: RANK_NAMES[0], missionName: null, missionProgress: 0, missionRequired: 0,
            // Score-multiplier power-up (board redesign) - true while a collected orb's 2x
            // window is running (see updatePowerUp() in main()).
            multiplierActive: false,
            // Bonus/multiplier subsystem (user-requested) - the CURRENT ball's bonus multiplier
            // (1X-BONUS_MULTIPLIER_MAX), kept in sync with ballBonus.multiplierX in main()
            // whenever it changes. Not the same thing as multiplierActive above - this one only
            // affects the end-of-ball bonus count, not live scoring.
            bonusMultiplierX: 1
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
            // HIGH SCORE is now the headline number here (score itself lives on #player-hud) -
            // the one score-related fact worth featuring on the cabinet is the target to beat.
            ctx.font = 'bold 28px monospace';
            ctx.fillStyle = '#ffd700';
            ctx.fillText('HIGH SCORE ' + state.highScore, 16, 16);

            ctx.font = 'bold 18px monospace';
            ctx.fillStyle = '#00ff99';
            ctx.fillText('RANK: ' + state.rank, 16, 58);

            if (state.missionName) {
                ctx.fillStyle = '#ffaa00';
                ctx.fillText(
                    'MISSION: ' + state.missionName + ' ' + state.missionProgress + '/' + state.missionRequired,
                    16, 84
                );
            }

            if (state.multiplierActive) {
                ctx.fillStyle = '#ff00ff';
                ctx.fillText('★ ' + POWERUP_MULTIPLIER + 'X SCORE ACTIVE ★', 16, 110);
            }

            if (state.bonusMultiplierX > 1) {
                ctx.fillStyle = '#ffaa00';
                ctx.fillText('BONUS MULT: ' + state.bonusMultiplierX + 'X', 16, 136);
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
        if (!devParticlesEnabled) return null; // dev HUD "particle effects" toggle - see its own declaration comment
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
        if (!devParticlesEnabled) return null; // dev HUD "particle effects" toggle - see its own declaration comment
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
    function spawnHitBurst(scene, texture, mesh, highFidelity) {
        if (!devParticlesEnabled) return null; // dev HUD "particle effects" toggle - see its own declaration comment
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
        // Bug fix (improvement-prompts/09-*.md's memory-leak check): disposeOnStop relies on the
        // scene's own per-frame cleanup queue picking a system up once its particles finish
        // dying (Scene._toBeDisposed, processed once per rendered frame in Babylon's own
        // source) - confirmed via Playwright that under sustained hit-heavy load (a realistic
        // rapid-bumper rally, ~50+ bursts alive at once) this reliably failed to happen at all:
        // dozens of finished burst systems stayed registered in scene.particleSystems
        // indefinitely, even after 5+ real seconds with nothing left to animate, while a single
        // isolated burst disposed correctly within 3s. Likely a feedback loop specific to very
        // low real frame rates (many concurrent systems compete for the same per-frame update
        // budget, further slowing an already-slow frame rate, which in turn delays how much
        // simulated particle-aging time each frame actually represents) - exactly the kind of
        // low-end-device condition this prompt exists to profile for. A guaranteed explicit
        // dispose after the system's own maximum particle lifetime closes that gap regardless of
        // the underlying cause, with no visual cost (particles have already finished animating by
        // then either way) and no risk of double-disposing (guarded by the isDisposed check).
        setTimeout(() => {
            if (!burst.isDisposed) burst.dispose();
        }, (burst.maxLifeTime + 0.15) * 1000);
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

    // Shared speed ceiling enforcement - uniformly rescales a body's velocity down to maxSpeed if
    // it's currently over, leaving direction untouched. Used every frame by updateBallPhysics()
    // below (see MAX_BALL_SPEED_MS's comment for why this JS-side clamp is the real defense) and,
    // on demand, by applyBumperKick() in main() so a pop-bumper kick can never push the ball past
    // the same ceiling normal play already respects. Returns the pre-clamp speed.
    function clampBodySpeed(body, maxSpeed) {
        const v = body.getLinearVelocity();
        const speed = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
        if (speed > maxSpeed) {
            const scale = maxSpeed / speed;
            body.setLinearVelocity(new BABYLON.Vector3(v.x * scale, v.y * scale, v.z * scale));
        }
        return speed;
    }

    // Per-frame ball physics maintenance: max-speed clamp (see MAX_BALL_SPEED_MS's comment for
    // why this - not Havok CCD, which this build doesn't have - is the real defense) and the
    // anti-stuck recovery, ported from checkBallStuck() in ../index.js. Deliberately mirrors
    // that function's "accumulate, then one decisive kick" design rather than the per-frame
    // nudge it replaced - see the STUCK_* constants' comment for why that matters. `ball` is one
    // of the {mesh, aggregate, stuckTimeMs} objects created by createBall().
    function updateBallPhysics(ball, deltaMs) {
        if (!ball.aggregate.body) return;

        const speed = clampBodySpeed(ball.aggregate.body, MAX_BALL_SPEED_MS);

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
        // physics side, but a sound effect needs its own check to avoid replaying rapidly). The
        // haptic tick (touch input audit, user-requested) needs the exact same guard, for the
        // exact same reason - one tick per real flap, not one per repeated event.
        if (!flipper.active) {
            playFlipperSound();
            vibrateDevice(HAPTIC_FLIPPER_MS);
        }
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
    // Obstacle layout. All static (mass: 0) so they don't need their own anti-stuck/velocity-clamp
    // handling; restitution alone gives a plausible physical "feel" (bouncy pop bumpers/slingshots
    // vs. firmer targets/lanes) without needing collision-event wiring for that, separate from the
    // scoring/mission collision-event wiring in main(). Mission targets and re-entry lanes are
    // trigger volumes ("detect but don't block"), matching the 2D game's overlap-not-collider
    // treatment of the same objects.
    //
    // Geometry (improvement-prompts/06-*.md): each obstacle's actual collider mesh - shape, size,
    // position, material, physics aggregate, metadata - is UNCHANGED from the primitive-only
    // version; every addition below is a purely decorative companion mesh with no physics body,
    // positioned to match, following the same pattern this file already used for the satellite's
    // ring (Stage 4). This keeps the visual upgrade fully isolated from collision/scoring/trigger
    // behavior - nothing outside this function needed to change.
    // ===================================
    // Small upright text-plaque label (cabinet visual-geometry pass, user-requested) - reuses the
    // same DynamicTexture-canvas-text technique buildBackglass()/createStarfieldTexture() already
    // established, just for compact playfield signage near an individual shot instead of one big
    // panel. One small texture per label (drawn once, never redrawn - this is static signage, not
    // a HUD), kept tiny (128x48) to stay cheap. DOUBLESIDE sidesteps ever having to get the exact
    // facing-normal convention right.
    function createLabelPlane(scene, text, x, z, color) {
        const texW = 128, texH = 48;
        const texture = new BABYLON.DynamicTexture('label' + text.replace(/\s/g, ''), { width: texW, height: texH }, scene, false);
        const ctx = texture.getContext();
        ctx.fillStyle = 'rgba(5, 0, 15, 0.55)';
        ctx.fillRect(0, 0, texW, texH);
        ctx.font = 'bold 20px monospace';
        ctx.fillStyle = color;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, texW / 2, texH / 2);
        texture.update();

        const mat = new BABYLON.StandardMaterial('labelMat' + text.replace(/\s/g, ''), scene);
        mat.diffuseColor = new BABYLON.Color3(0, 0, 0);
        mat.disableLighting = true;
        mat.emissiveTexture = texture;
        mat.backFaceCulling = false;

        // Verified via Playwright screenshot (not assumed): a flat, playfield-level decal reads
        // as an edge-on sliver from this game's actual low, close, steeply-angled fixed camera
        // (buildCamera() - y=0.36 over a table extending to z~0.45, looking mostly along +Z with
        // only a ~22 degree downward tilt) - a flat horizontal surface at that shallow a viewing
        // angle is nearly invisible, the same reason real machines put shot callouts on a raised/
        // angled riser rather than flat playfield paint. Standing the plane upright and tilting it
        // back to roughly match the camera's own downward look angle - the same rotation.x=0.4
        // buildBackglass() already uses to face its panel toward this exact camera - fixes that.
        const plane = BABYLON.MeshBuilder.CreatePlane('labelPlane' + text.replace(/\s/g, ''), {
            width: 0.05,
            height: 0.05 * (texH / texW),
            sideOrientation: BABYLON.Mesh.DOUBLESIDE
        }, scene);
        plane.material = mat;
        plane.position.set(x, 0.03, z);
        plane.rotation.x = 0.4;
        return plane;
    }

    function buildObstacles(scene) {
        // Same dev-mode flag setDevPanelVisible() checks at module load - re-read here (cheap,
        // stateless) rather than threaded through as a parameter, purely to decide whether the new
        // inlane/outlane rollover triggers below render their (otherwise invisible) hitbox as a
        // translucent debug overlay.
        const devMode = new URLSearchParams(window.location.search).has('dev');
        // Every otherwise-invisible trigger volume that gets a translucent debug overlay under
        // ?dev=1 (see each push() below) - collected so the dev HUD's "collider/trigger
        // visualization" checkbox (main()) can toggle all of them live, not just at load time.
        const debugTriggerMeshes = [];

        // Shared dark-metallic material for every non-colliding "housing/bracket/rail" decoration
        // below (bumper skirts, target mounting posts, slingshot housings, lane guide rails) - one
        // material instance reused everywhere it's needed, keeping them visually unified as
        // "hardware" distinct from each obstacle's own colored/emissive collider.
        const housingMat = new BABYLON.PBRMaterial('obstacleHousingMat', scene);
        housingMat.albedoColor = new BABYLON.Color3(0.12, 0.12, 0.15);
        housingMat.metallic = 0.8;
        housingMat.roughness = 0.35;

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

        // Pop-bumper silhouette: the collider stays the exact same sphere it always was (shape,
        // position, material, physics aggregate, metadata all unchanged) - a wide low "skirt"
        // base and a glowing "collar" ring around its equator are purely decorative additions
        // with no physics body, giving it the cap-on-a-base read a real pop bumper has instead of
        // a bare sphere floating above the table.
        //
        // Board redesign: index 0 (closest to the new giant Saturn centerpiece, at the top of the
        // cluster) is a "boss" bumper - 50% bigger radius and worth notably more (SCORE_BOSS_
        // BUMPER vs SCORE_ATTACK_BUMPER, see handlePhysicalHit()) - so the cluster reads as having
        // real internal variety instead of 4 identical clones in different colors.
        BUMPER_CLUSTER.forEach((pos, i) => {
            const isBoss = i === 0;
            const radius = isBoss ? BUMPER_RADIUS_M * 1.5 : BUMPER_RADIUS_M;
            const mesh = BABYLON.MeshBuilder.CreateSphere('bumper' + i, { diameter: radius * 2 }, scene);
            mesh.position.set(pos.x, radius, pos.z);
            mesh.material = bumperMats[i % bumperMats.length];
            mesh.metadata = { kind: 'bumper', boss: isBoss };
            // Physical body, not a trigger - restitution alone gives the bounce; the ball's
            // collision observable (see main()) reports the hit for scoring on top of that.
            new BABYLON.PhysicsAggregate(mesh, BABYLON.PhysicsShapeType.SPHERE, { mass: 0, restitution: 0.85, friction: 0.3 }, scene);

            const skirt = BABYLON.MeshBuilder.CreateCylinder('bumper' + i + 'Skirt', {
                diameter: radius * 2.6,
                height: radius * 0.35,
                tessellation: 20
            }, scene);
            skirt.position.set(pos.x, radius * 0.18, pos.z);
            skirt.material = housingMat;

            const collar = BABYLON.MeshBuilder.CreateTorus('bumper' + i + 'Collar', {
                diameter: radius * 2.15,
                thickness: radius * 0.14,
                tessellation: 20
            }, scene);
            collar.position.set(pos.x, radius * 0.75, pos.z);
            collar.material = bumperMats[i % bumperMats.length]; // shares the dome's own material/color - reads as one glowing fixture, not a mismatched add-on
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
        const missionTargetLamps = [];
        MISSION_TARGET_BANK.forEach((pos, i) => {
            const mesh = BABYLON.MeshBuilder.CreateBox('missionTarget' + i, {
                width: TARGET_RADIUS_M * 2,
                height: 0.03,
                depth: 0.008
            }, scene);
            mesh.position.set(pos.x, TARGET_RAISED_Y_M, pos.z);
            mesh.material = targetMats[i % targetMats.length];
            mesh.metadata = { kind: 'missionTarget', index: i };
            const aggregate = new BABYLON.PhysicsAggregate(mesh, BABYLON.PhysicsShapeType.BOX, { mass: 0, restitution: 0.4, friction: 0.5 }, scene);
            // Trigger, not physical - detect-only per the doc (mission targets don't block the
            // ball in the 2D game either; they're an overlap, not a collider, in setupCollisions()).
            // Deliberately never moved when the target drops (see updateDropTargetBank() in
            // main()) - only the visual mesh above sinks. The trigger volume staying put is what
            // lets handleTriggerHit() treat dropTargetBank[i].dropped as the sole scoring gate,
            // fully decoupled from wherever the flag mesh currently is mid-animation.
            aggregate.shape.isTrigger = true;

            // Drop-target read: a darker backing panel just behind the flag (a real drop target's
            // mounting bracket) plus a small indicator lamp at its base, matching the classic
            // pinball rollover-lane light motif - both purely decorative, no physics.
            const backing = BABYLON.MeshBuilder.CreateBox('missionTarget' + i + 'Backing', {
                width: TARGET_RADIUS_M * 2.4,
                height: 0.034,
                depth: 0.004
            }, scene);
            backing.position.set(pos.x, 0.015, pos.z + 0.006);
            backing.material = housingMat;

            // Its own cloned material (not shared with the flag's targetMats[i] like before) so
            // the lamp can independently show the target's raised/dropped state - matching the
            // per-instance-clone treatment every other stateful lamp in this file already gets
            // (inlane/outlane lamps, orbit lamps). Starts bright/"lit" since targets begin raised.
            const lampColor = COLOR_CHAKRA[i % COLOR_CHAKRA.length];
            const lampMat = new BABYLON.PBRMaterial('missionTarget' + i + 'LampMat', scene);
            lampMat.albedoColor = lampColor.scale(0.3);
            lampMat.metallic = 0.2;
            lampMat.roughness = 0.4;
            lampMat.emissiveColor = lampColor.scale(0.9);
            const lamp = BABYLON.MeshBuilder.CreateSphere('missionTarget' + i + 'Lamp', {
                diameter: TARGET_RADIUS_M * 0.6
            }, scene);
            lamp.position.set(pos.x, 0.004, pos.z);
            lamp.material = lampMat;
            missionTargetMeshes.push(mesh);
            missionTargetLamps.push(lamp);
        });

        // ===================================
        // Giant spinning Saturn (board redesign) - the table's new visual/gameplay centerpiece.
        // Real collider (a genuine "boss" piece - SATURN_RADIUS_M is more than double every other
        // bumper's radius) plus two decorative rings extending well beyond it, both rotated a
        // little further per frame by updateSaturnRotation() in main()'s render loop. HEX_SATURN/
        // HEX_SATURN_RING (gold/orange) - previously used by the old small "satellite" object -
        // now finally belong to an object actually named and shaped like Saturn.
        // ===================================
        const saturnMat = new BABYLON.PBRMaterial('saturnMat', scene);
        saturnMat.albedoColor = COLOR_SATURN;
        saturnMat.metallic = 0.5;
        saturnMat.roughness = 0.3;
        saturnMat.emissiveColor = COLOR_SATURN.scale(0.35);
        const saturnMesh = BABYLON.MeshBuilder.CreateSphere('saturn', { diameter: SATURN_RADIUS_M * 2 }, scene);
        saturnMesh.position.set(SATURN_POS.x, SATURN_RADIUS_M, SATURN_POS.z);
        saturnMesh.material = saturnMat;
        saturnMesh.metadata = { kind: 'saturn' };
        // Physical collider - a real, hittable obstacle (per the user's explicit request), not
        // just a decorative backdrop piece.
        new BABYLON.PhysicsAggregate(saturnMesh, BABYLON.PhysicsShapeType.SPHERE, { mass: 0, restitution: 0.85, friction: 0.3 }, scene);

        const saturnRingMat = new BABYLON.PBRMaterial('saturnRingMat', scene);
        saturnRingMat.albedoColor = COLOR_SATURN_RING;
        saturnRingMat.metallic = 0.6;
        saturnRingMat.roughness = 0.25;
        saturnRingMat.emissiveColor = COLOR_SATURN_RING.scale(0.35);
        const saturnRing1 = BABYLON.MeshBuilder.CreateTorus('saturnRing1', {
            diameter: SATURN_RADIUS_M * 3.5,
            thickness: SATURN_RADIUS_M * 0.22,
            tessellation: 32
        }, scene);
        saturnRing1.position.set(SATURN_POS.x, SATURN_RADIUS_M, SATURN_POS.z);
        saturnRing1.rotation.x = Math.PI / 2.3; // tilted, not flat, so it reads as a ring from the fixed camera angle
        saturnRing1.material = saturnRingMat;
        // No physics body - purely decorative, would otherwise double the ball's Saturn hit
        // detection (same reasoning as every other obstacle's decorative ring in this file).

        const saturnRing2 = BABYLON.MeshBuilder.CreateTorus('saturnRing2', {
            diameter: SATURN_RADIUS_M * 2.6,
            thickness: SATURN_RADIUS_M * 0.14,
            tessellation: 32
        }, scene);
        saturnRing2.position.set(SATURN_POS.x, SATURN_RADIUS_M, SATURN_POS.z);
        saturnRing2.rotation.x = Math.PI / 2.5;
        saturnRing2.material = saturnRingMat;
        // Rotated opposite to ring1 each frame (see updateSaturnRotation()) - two rings turning
        // against each other reads as a much more alive, "spinning" system than one ring alone.
        const saturnRings = [saturnRing1, saturnRing2];

        // ===================================
        // Comet (board redesign) - the old "satellite" object, re-themed now that Saturn is a
        // real dedicated piece. Same role (a physical, scored bumper with its own decorative
        // ring), same general neighborhood, just a new icy-cyan identity (HEX_COMET) instead of
        // sharing Saturn's gold/orange colors, and nudged to sit clear of Saturn's new footprint.
        // ===================================
        const cometMat = new BABYLON.PBRMaterial('cometMat', scene);
        cometMat.albedoColor = COLOR_COMET;
        cometMat.metallic = 0.4;
        cometMat.roughness = 0.25;
        cometMat.emissiveColor = COLOR_COMET.scale(0.4);
        const cometMesh = BABYLON.MeshBuilder.CreateSphere('comet', { diameter: COMET_RADIUS_M * 2 }, scene);
        cometMesh.position.set(COMET_POS.x, COMET_RADIUS_M, COMET_POS.z);
        cometMesh.material = cometMat;
        cometMesh.metadata = { kind: 'comet' };
        new BABYLON.PhysicsAggregate(cometMesh, BABYLON.PhysicsShapeType.SPHERE, { mass: 0, restitution: 0.8, friction: 0.3 }, scene);

        // A single thin "tail" ring standing in for a comet's streak - simpler than the two-ring
        // Saturn/old-satellite treatment (a comet isn't a ringed planet), still reads as a
        // distinct halo of motion around the core.
        const cometRingMat = new BABYLON.PBRMaterial('cometRingMat', scene);
        cometRingMat.albedoColor = COLOR_COMET;
        cometRingMat.metallic = 0.2;
        cometRingMat.roughness = 0.2;
        cometRingMat.emissiveColor = COLOR_COMET.scale(0.6);
        cometRingMat.alpha = 0.7;
        const cometRing = BABYLON.MeshBuilder.CreateTorus('cometRing', {
            diameter: COMET_RADIUS_M * 3,
            thickness: COMET_RADIUS_M * 0.18,
            tessellation: 24
        }, scene);
        cometRing.position.set(COMET_POS.x, COMET_RADIUS_M, COMET_POS.z);
        cometRing.rotation.x = Math.PI / 2.4;
        cometRing.material = cometRingMat;

        // ===================================
        // Score-multiplier power-up orb (board redesign) - hidden at load, toggled visible/
        // invisible by updatePowerUp() in main()'s render loop on its own spawn/despawn timer.
        // Trigger-only (detect, don't block), matching mission targets/re-entry lanes.
        // ===================================
        const powerUpMat = new BABYLON.PBRMaterial('powerUpMat', scene);
        powerUpMat.albedoColor = new BABYLON.Color3(1, 1, 1);
        powerUpMat.metallic = 0.1;
        powerUpMat.roughness = 0.15;
        powerUpMat.emissiveColor = new BABYLON.Color3(1, 1, 1);
        const powerUpMesh = BABYLON.MeshBuilder.CreateSphere('powerUp', { diameter: POWERUP_RADIUS_M * 2, segments: 12 }, scene);
        powerUpMesh.position.set(POWERUP_POS.x, POWERUP_RADIUS_M, POWERUP_POS.z);
        powerUpMesh.material = powerUpMat;
        powerUpMesh.metadata = { kind: 'powerUp' };
        powerUpMesh.isVisible = false;
        const powerUpAggregate = new BABYLON.PhysicsAggregate(powerUpMesh, BABYLON.PhysicsShapeType.SPHERE, { mass: 0 }, scene);
        powerUpAggregate.shape.isTrigger = true;
        // isVisible/setEnabled hide the mesh, but whether Havok still reports trigger overlaps
        // for a disabled node isn't something to assume either way - handleTriggerHit()'s own
        // powerUp.active check (see main()) is the real, explicit source of truth for whether a
        // hit should actually count, independent of this mesh's enabled state.
        powerUpMesh.setEnabled(false);

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
            new BABYLON.PhysicsAggregate(mesh, BABYLON.PhysicsShapeType.BOX, { mass: 0, restitution: 0.85, friction: 0.3 }, scene);

            // Kicker housing: a triangular-prism wedge (a cylinder with 3-sided tessellation is a
            // cheap way to get a real prism from MeshBuilder) behind the rubber face above,
            // matching a real slingshot's wedge shape - the collider itself stays the box it
            // always was (a wedge-shaped collider would change how the ball bounces off it, which
            // this doc explicitly says not to do).
            const housing = BABYLON.MeshBuilder.CreateCylinder('slingshot' + i + 'Housing', {
                diameterTop: SLINGSHOT_SIZE_M * 1.1,
                diameterBottom: SLINGSHOT_SIZE_M * 1.1,
                height: 0.026,
                tessellation: 3
            }, scene);
            housing.position.set(def.x, 0.013, def.z - def.mirror * SLINGSHOT_SIZE_M * 0.15);
            housing.rotation.x = Math.PI / 2; // lay the prism flat, matching the table plane
            housing.rotation.y = def.mirror * BABYLON.Tools.ToRadians(20) + Math.PI / 2;
            // A per-instance clone, not the shared housingMat every other decorative housing/
            // skirt/rail uses - the new active-kick "rubber snap" flash (see snapSlingshot() in
            // main()) brightens this material directly, and it must only affect this one
            // slingshot's housing, not every object on the board that happens to share housingMat.
            housing.material = housingMat.clone('slingshotHousingMat' + i);

            // Referenced by snapSlingshot() (in main(), via the collider mesh's metadata below) so
            // the hit handler - which only ever receives the collider mesh from the collision
            // event - can reach this decorative housing without a separate scene lookup.
            mesh.metadata = { kind: 'slingshot', housing };
        });

        // Unlit state: dim yellow-ish neutral (no direct 2D equivalent - the 2D lanes start
        // unlit/grey and only take on a color once hit). Lit state (CONFIG.colors.missionActive,
        // green) is applied per-lane in handleTriggerHit() in main(), matching hitReentryLane()'s
        // persistent lane.setFillStyle() recoloring in ../index.js, not just a brief pulse.
        // albedoColor stays fixed at this rest look forever - only emissiveColor ever changes, via
        // the centralized lamp system (setLaneLit() in main(), registered as lamp id
        // 'reentryLane'+i), the same emissive-only on/off convention every other lamp in this file
        // already uses.
        const reentryLaneMeshes = [];
        REENTRY_LANES.forEach((pos, i) => {
            const laneMat = new BABYLON.PBRMaterial('laneMat' + i, scene);
            laneMat.albedoColor = new BABYLON.Color3(0.5, 0.5, 0.15);
            laneMat.metallic = 0.1;
            laneMat.roughness = 0.4;
            laneMat.alpha = 0.6;

            const mesh = BABYLON.MeshBuilder.CreateBox('reentryLane' + i, {
                width: REENTRY_LANE_RADIUS_M * 2,
                height: 0.02,
                depth: 0.03
            }, scene);
            mesh.position.set(pos.x, 0.01, pos.z);
            mesh.material = laneMat;
            reentryLaneMeshes.push(mesh);
            mesh.metadata = { kind: 'reentryLane', index: i };
            const aggregate = new BABYLON.PhysicsAggregate(mesh, BABYLON.PhysicsShapeType.BOX, { mass: 0, restitution: 0.3, friction: 0.5 }, scene);
            aggregate.shape.isTrigger = true; // overlap, not collider, in setupCollisions()

            // Flanking guide rails (improvement-prompts/06-*.md) - real lane guides are raised
            // metal wires/rails either side of the lane opening, not just a flat colored patch.
            // Decorative only, chrome-like (shares housingMat), doesn't change color on hit like
            // the lit-indicator box above does.
            [-1, 1].forEach((side) => {
                const rail = BABYLON.MeshBuilder.CreateBox('reentryLane' + i + 'Rail' + side, {
                    width: 0.004,
                    height: 0.018,
                    depth: REENTRY_LANE_RADIUS_M * 2.4
                }, scene);
                rail.position.set(pos.x + side * REENTRY_LANE_RADIUS_M * 1.1, 0.014, pos.z);
                rail.material = housingMat;
            });
        });

        // Lower-table inlanes/outlanes - see SIDE_LANES' block comment (near its declaration) for
        // the full layout reasoning and the real-scene-measured geometry it's based on.
        const sideLaneLampMeshes = [];
        SIDE_LANES.forEach((laneDef) => {
            const mirror = laneDef.mirror;
            const dividerX = mirror * LANE_DIVIDER_X_M;
            const dividerCenterZ = (LANE_Z_TOP_M + LANE_Z_BOTTOM_M) / 2;

            // Divider rail - separates the outlane from the inlane. The outlane's own outer edge
            // reuses the already-existing leftWall/rightWall (no new wall needed there). Shares
            // housingMat like every other decorative guide rail on the board, and its own hit
            // feedback reuses the existing generic 'wall' handling in handlePhysicalHit() - a
            // guide rail is still a wall to the ball, no new feedback code needed for it.
            const divider = BABYLON.MeshBuilder.CreateBox('laneDivider' + laneDef.side, {
                width: 0.006,
                height: 0.022,
                depth: Math.abs(LANE_Z_TOP_M - LANE_Z_BOTTOM_M)
            }, scene);
            divider.position.set(dividerX, 0.011, dividerCenterZ);
            divider.material = housingMat;
            divider.metadata = { kind: 'wall' };
            new BABYLON.PhysicsAggregate(divider, BABYLON.PhysicsShapeType.BOX, { mass: 0, restitution: 0.4, friction: 0.5 }, scene);

            // End posts, capping the divider top/bottom - real guide rails read as bounded by
            // round posts, not a bare floating box segment, and give the ball a rounder surface to
            // deflect off if it clips the very top/bottom of the rail. Also physical (same 'wall'
            // feedback reuse as the rail itself), not just decorative.
            [LANE_Z_TOP_M, LANE_Z_BOTTOM_M].forEach((postZ, i) => {
                const post = BABYLON.MeshBuilder.CreateCylinder('laneDivider' + laneDef.side + 'Post' + i, {
                    diameter: 0.016,
                    height: 0.03
                }, scene);
                post.position.set(dividerX, 0.015, postZ);
                post.material = housingMat;
                post.metadata = { kind: 'wall' };
                new BABYLON.PhysicsAggregate(post, BABYLON.PhysicsShapeType.CYLINDER, { mass: 0, restitution: 0.4, friction: 0.5 }, scene);
            });

            // Inlane inner guide - see INLANE_GUIDE_TOP_X_M/INLANE_GUIDE_BOTTOM_X_M's comment for
            // why this exists as a real angled wall instead of an open gap. Built the same way
            // every other angled wall in this file is (buildTable()'s leftSlant/rightSlant/
            // leftGuide/rightGuide): long axis along local X before rotation, rotation.y then
            // aims that axis at the real world-space direction between the two endpoints. That
            // rotation formula (rotationY = atan2(-dz, dx)) was derived empirically against this
            // exact Babylon build via a live probe (mesh.getDirection(Axis.X) on both a controlled
            // test box and the real, already-rendered leftSlant wall), not assumed from Babylon's
            // documented convention - the same kind of sign ambiguity toWorldRotationY's own
            // comment flags for 2D->3D rotation mapping generally.
            {
                const guideTopX = mirror * INLANE_GUIDE_TOP_X_M;
                const guideBottomX = mirror * INLANE_GUIDE_BOTTOM_X_M;
                const dx = guideBottomX - guideTopX;
                const dz = LANE_Z_BOTTOM_M - LANE_Z_TOP_M;
                const guideLength = Math.sqrt(dx * dx + dz * dz);
                const guideRotationY = Math.atan2(-dz, dx);

                const guide = BABYLON.MeshBuilder.CreateBox('inlaneGuide' + laneDef.side, {
                    width: guideLength,
                    height: 0.022,
                    depth: 0.006
                }, scene);
                guide.position.set((guideTopX + guideBottomX) / 2, 0.011, dividerCenterZ);
                guide.rotation.y = guideRotationY;
                guide.material = housingMat;
                guide.metadata = { kind: 'wall' };
                new BABYLON.PhysicsAggregate(guide, BABYLON.PhysicsShapeType.BOX, { mass: 0, restitution: 0.4, friction: 0.5 }, scene);
            }

            // Inlane/outlane rollover triggers, each with its own indicator lamp insert. The lamp
            // (a flat disc, like a real backlit playfield insert) is the lane's only always-visible
            // presence - the trigger box itself has no real-pinball shape of its own, so it stays
            // invisible in normal play and only renders (translucent, color-coded) when ?dev=1, to
            // make the actual hitbox extent inspectable during development.
            [
                { kind: 'inlane', x: mirror * INLANE_TRIGGER_X_M, debugColor: new BABYLON.Color3(0.2, 1, 0.4) },
                { kind: 'outlane', x: mirror * OUTLANE_TRIGGER_X_M, debugColor: new BABYLON.Color3(1, 0.2, 0.3) }
            ].forEach((laneKind) => {
                const lampMat = new BABYLON.PBRMaterial(laneKind.kind + 'LampMat' + laneDef.side, scene);
                lampMat.albedoColor = COLOR_LANE_LAMP.scale(0.3);
                lampMat.metallic = 0.2;
                lampMat.roughness = 0.4;
                const lamp = BABYLON.MeshBuilder.CreateCylinder(laneKind.kind + 'Lamp' + laneDef.side, {
                    diameterTop: LANE_TRIGGER_WIDTH_M * 0.6,
                    diameterBottom: LANE_TRIGGER_WIDTH_M * 0.6,
                    height: 0.003
                }, scene);
                lamp.position.set(laneKind.x, 0.011, LANE_TRIGGER_Z_M);
                lamp.material = lampMat;
                // Lamp system id (registered in main()) - kind+side, e.g. 'inlaneLeft' - unique
                // per lane/side combination, matching the naming every other lamp id in this file uses.
                const lampId = laneKind.kind + (laneDef.side === 'left' ? 'Left' : 'Right');
                sideLaneLampMeshes.push({ id: lampId, mesh: lamp });

                const triggerMat = new BABYLON.PBRMaterial(laneKind.kind + 'TriggerMat' + laneDef.side, scene);
                triggerMat.albedoColor = laneKind.debugColor;
                triggerMat.alpha = 0.35;
                triggerMat.emissiveColor = laneKind.debugColor.scale(0.5);
                const trigger = BABYLON.MeshBuilder.CreateBox(laneKind.kind + laneDef.side, {
                    width: LANE_TRIGGER_WIDTH_M,
                    height: 0.02,
                    depth: LANE_TRIGGER_DEPTH_M
                }, scene);
                trigger.position.set(laneKind.x, 0.01, LANE_TRIGGER_Z_M);
                trigger.material = triggerMat;
                trigger.isVisible = devMode;
                debugTriggerMeshes.push(trigger);
                trigger.metadata = { kind: laneKind.kind, side: laneDef.side, lampId };
                const aggregate = new BABYLON.PhysicsAggregate(trigger, BABYLON.PhysicsShapeType.BOX, { mass: 0 }, scene);
                aggregate.shape.isTrigger = true;
            });
        });

        // OUTLANE KICKBACK lamp (fairness mechanics, user-requested) - a separate lamp from the
        // outlane's own rollover lamp just above (that one briefly flashes on every rollover;
        // this one shows the longer-lived earned/armed state, so the two signals don't get
        // conflated). Positioned further down the same outlane, toward the drain end - reads as
        // "your last line of defense" - no physics of its own, purely a state indicator.
        const kickbackMirror = SIDE_LANES.find((l) => l.side === KICKBACK_SIDE).mirror;
        const kickbackLampMat = new BABYLON.PBRMaterial('kickbackLampMat', scene);
        kickbackLampMat.albedoColor = COLOR_KICKBACK_LAMP.scale(0.3);
        kickbackLampMat.metallic = 0.2;
        kickbackLampMat.roughness = 0.4;
        kickbackLampMat.emissiveColor = COLOR_KICKBACK_LAMP.scale(0.12); // faint glow at rest, lit when earned (see setKickbackLampLit() in main())
        const kickbackLampMesh = BABYLON.MeshBuilder.CreateCylinder('kickbackLamp', {
            diameterTop: LANE_TRIGGER_WIDTH_M * 0.7,
            diameterBottom: LANE_TRIGGER_WIDTH_M * 0.7,
            height: 0.003
        }, scene);
        kickbackLampMesh.position.set(kickbackMirror * OUTLANE_TRIGGER_X_M, 0.011, LANE_Z_BOTTOM_M);
        kickbackLampMesh.material = kickbackLampMat;

        // BALL SAVE lamp (fairness mechanics, user-requested) - sits beside the shooter lane, at
        // the ball's own rest spot, so it's the first thing a player sees while charging a
        // launch. Same rest/lit split as every other stateful lamp here (setBallSaveLampLit() in
        // main()).
        const ballSaveLampMat = new BABYLON.PBRMaterial('ballSaveLampMat', scene);
        ballSaveLampMat.albedoColor = COLOR_BALL_SAVE_LAMP.scale(0.3);
        ballSaveLampMat.metallic = 0.2;
        ballSaveLampMat.roughness = 0.4;
        ballSaveLampMat.emissiveColor = COLOR_BALL_SAVE_LAMP.scale(0.12);
        const ballSaveLampMesh = BABYLON.MeshBuilder.CreateCylinder('ballSaveLamp', {
            diameterTop: LANE_TRIGGER_WIDTH_M * 0.7,
            diameterBottom: LANE_TRIGGER_WIDTH_M * 0.7,
            height: 0.003
        }, scene);
        ballSaveLampMesh.position.set(toWorldX(BALL_REST_X_PX) - 0.035, 0.011, BALL_REST_Z_M);
        ballSaveLampMesh.material = ballSaveLampMat;

        // Upper-lane skill shot (user-requested) - see SKILL_SHOT_LANES' own block comment (near
        // its declaration) for the full geometry reasoning. Same invisible-unless-dev trigger +
        // always-visible lamp insert split as the inlane/outlane rollovers just above; the lamp
        // starts dim/off (armSkillShot()/endSkillShot() in main() toggle it per-ball) since
        // these lanes only matter for the short window right after a launch.
        const skillShotLaneMeshes = [];
        const skillShotLampMeshes = [];
        SKILL_SHOT_LANES.forEach((laneDef, i) => {
            const lampMat = new BABYLON.PBRMaterial('skillShotLampMat' + i, scene);
            lampMat.albedoColor = COLOR_SKILL_SHOT_LAMP.scale(0.3);
            lampMat.metallic = 0.2;
            lampMat.roughness = 0.4;
            lampMat.emissiveColor = COLOR_SKILL_SHOT_LAMP.scale(0.12); // faint glow at rest, like a real backlit-but-unlit insert
            const lamp = BABYLON.MeshBuilder.CreateCylinder('skillShotLamp' + i, {
                diameterTop: laneDef.halfWidth * 2 * 0.5,
                diameterBottom: laneDef.halfWidth * 2 * 0.5,
                height: 0.003
            }, scene);
            lamp.position.set(laneDef.x, 0.011, SKILL_SHOT_Z_M);
            lamp.material = lampMat;
            skillShotLampMeshes.push(lamp);

            const triggerMat = new BABYLON.PBRMaterial('skillShotTriggerMat' + i, scene);
            triggerMat.albedoColor = new BABYLON.Color3(1, 0.4, 0.6);
            triggerMat.alpha = 0.35;
            triggerMat.emissiveColor = new BABYLON.Color3(0.6, 0.15, 0.3);
            const trigger = BABYLON.MeshBuilder.CreateBox('skillShotLane' + i, {
                width: laneDef.halfWidth * 2,
                height: 0.02,
                depth: SKILL_SHOT_DEPTH_M
            }, scene);
            trigger.position.set(laneDef.x, 0.01, SKILL_SHOT_Z_M);
            trigger.material = triggerMat;
            trigger.isVisible = devMode;
            debugTriggerMeshes.push(trigger);
            trigger.metadata = { kind: 'skillShotLane', index: i, lamp };
            const skillShotAggregate = new BABYLON.PhysicsAggregate(trigger, BABYLON.PhysicsShapeType.BOX, { mass: 0 }, scene);
            skillShotAggregate.shape.isTrigger = true;
            skillShotLaneMeshes.push(trigger);
        });

        // Upper-table LEFT ORBIT / RIGHT ORBIT skill shots - see ORBITS' block comment (near its
        // declaration) for the full layout reasoning. Each side gets one visible guide rail
        // (capped by end posts, same visual language as the inlane/outlane divider above) running
        // alongside the existing mission-target-bank/comet, plus an entrance and a completion
        // rollover trigger with their own lamp inserts.
        const orbitLampMeshes = [];
        ORBITS.forEach((orbitDef) => {
            // Same empirically-derived rotation formula as the inlane guide above (see its own
            // comment for how rotationY = atan2(-dz, dx) was verified against this exact Babylon
            // build via mesh.getDirection(Axis.X), not assumed from documented convention).
            const dx = orbitDef.railTopX - orbitDef.railBottomX;
            const dz = ORBIT_RAIL_TOP_Z_M - ORBIT_RAIL_BOTTOM_Z_M;
            const railLength = Math.sqrt(dx * dx + dz * dz);
            const railRotationY = Math.atan2(-dz, dx);
            const railCenterX = (orbitDef.railBottomX + orbitDef.railTopX) / 2;
            const railCenterZ = (ORBIT_RAIL_BOTTOM_Z_M + ORBIT_RAIL_TOP_Z_M) / 2;

            const rail = BABYLON.MeshBuilder.CreateBox('orbitRail' + orbitDef.side, {
                width: railLength,
                height: 0.022,
                depth: 0.015
            }, scene);
            rail.position.set(railCenterX, 0.011, railCenterZ);
            rail.rotation.y = railRotationY;
            rail.material = housingMat;
            rail.metadata = { kind: 'wall' }; // reuses the existing generic wall camera-shake/sound feedback, same as the inlane/outlane rails
            new BABYLON.PhysicsAggregate(rail, BABYLON.PhysicsShapeType.BOX, { mass: 0, restitution: 0.4, friction: 0.5 }, scene);

            // Only the TOP end gets a capping post, not the bottom - verified via Playwright that
            // a post at the rail's bottom tip sits close enough to a realistic entry trajectory to
            // actually block shots into the lane rather than just marking it (an early build had
            // one there; a ball aimed at the entrance clipped it and got knocked back inboard
            // before ever reaching the entrance trigger). The rail's own open bottom tip is the
            // entrance's real visual cue, alongside the entrance trigger's lamp insert below.
            [
                { x: orbitDef.railTopX, z: ORBIT_RAIL_TOP_Z_M }
            ].forEach((endPos, i) => {
                const post = BABYLON.MeshBuilder.CreateCylinder('orbitRail' + orbitDef.side + 'Post' + i, {
                    diameter: 0.016,
                    height: 0.03
                }, scene);
                post.position.set(endPos.x, 0.015, endPos.z);
                post.material = housingMat;
                post.metadata = { kind: 'wall' };
                new BABYLON.PhysicsAggregate(post, BABYLON.PhysicsShapeType.CYLINDER, { mass: 0, restitution: 0.4, friction: 0.5 }, scene);
            });

            // Entrance/completion rollover triggers, each with its own indicator lamp insert -
            // same invisible-trigger/always-visible-lamp split as the inlane/outlane rollovers,
            // colored with the orbits' own distinct HEX_ORBIT_LAMP identity (see its comment).
            [
                { kind: 'orbitEntrance', x: orbitDef.entranceX, z: ORBIT_ENTRANCE_Z_M, debugColor: new BABYLON.Color3(0.3, 0.8, 1) },
                { kind: 'orbitCompletion', x: orbitDef.completionX, z: ORBIT_COMPLETION_Z_M, debugColor: new BABYLON.Color3(1, 0.9, 0.2) }
            ].forEach((triggerDef) => {
                const lampMat = new BABYLON.PBRMaterial(triggerDef.kind + 'LampMat' + orbitDef.side, scene);
                lampMat.albedoColor = COLOR_ORBIT_LAMP.scale(0.3);
                lampMat.metallic = 0.2;
                lampMat.roughness = 0.4;
                const lamp = BABYLON.MeshBuilder.CreateCylinder(triggerDef.kind + 'Lamp' + orbitDef.side, {
                    diameterTop: ORBIT_TRIGGER_WIDTH_M * 0.6,
                    diameterBottom: ORBIT_TRIGGER_WIDTH_M * 0.6,
                    height: 0.003
                }, scene);
                lamp.position.set(triggerDef.x, 0.011, triggerDef.z);
                lamp.material = lampMat;
                // Lamp system id (registered in main()) - kind+side, e.g. 'orbitEntranceLeft'.
                const lampId = triggerDef.kind + (orbitDef.side === 'left' ? 'Left' : 'Right');
                orbitLampMeshes.push({ id: lampId, mesh: lamp });

                const triggerMat = new BABYLON.PBRMaterial(triggerDef.kind + 'TriggerMat' + orbitDef.side, scene);
                triggerMat.albedoColor = triggerDef.debugColor;
                triggerMat.alpha = 0.35;
                triggerMat.emissiveColor = triggerDef.debugColor.scale(0.5);
                const trigger = BABYLON.MeshBuilder.CreateBox(triggerDef.kind + orbitDef.side, {
                    width: ORBIT_TRIGGER_WIDTH_M,
                    height: 0.02,
                    depth: ORBIT_TRIGGER_DEPTH_M
                }, scene);
                trigger.position.set(triggerDef.x, 0.01, triggerDef.z);
                trigger.material = triggerMat;
                trigger.isVisible = devMode;
                debugTriggerMeshes.push(trigger);
                trigger.metadata = { kind: triggerDef.kind, side: orbitDef.side, lampId };
                const aggregate = new BABYLON.PhysicsAggregate(trigger, BABYLON.PhysicsShapeType.BOX, { mass: 0 }, scene);
                aggregate.shape.isTrigger = true;
            });
        });

        // VISION GATE - see its own block comment (near VISION_GATE_POS' declaration) for the
        // layout/clearance reasoning and why the "physical rim" is a 3-post ring, not a torus
        // (Havok has no torus primitive - none of this file's existing decorative rings, Saturn's
        // included, ever get a PhysicsAggregate).
        const visionGateMat = new BABYLON.PBRMaterial('visionGateMat', scene);
        visionGateMat.albedoColor = COLOR_VISION_GATE;
        visionGateMat.metallic = 0.3;
        visionGateMat.roughness = 0.25;
        visionGateMat.emissiveColor = COLOR_VISION_GATE.scale(0.4); // dim "at rest" glow - startVisionGateCapture() in main() brightens/cycles this well past resting value, endVisionGateCapture() restores it

        // Sunken well - a dark disc set slightly below the playfield surface, reading as an
        // actual hole/portal rather than a flat decal. Purely decorative, like every other
        // "housing" piece on the board.
        const well = BABYLON.MeshBuilder.CreateCylinder('visionGateWell', {
            diameter: VISION_GATE_COLLAR_RADIUS_M * 1.7,
            height: 0.006,
            tessellation: 24
        }, scene);
        well.position.set(VISION_GATE_POS.x, -0.005, VISION_GATE_POS.z);
        const wellMat = new BABYLON.PBRMaterial('visionGateWellMat', scene);
        wellMat.albedoColor = new BABYLON.Color3(0.02, 0, 0.05);
        wellMat.metallic = 0.1;
        wellMat.roughness = 0.6;
        well.material = wellMat;

        // Glowing rim ring - decorative only (see the block comment above), but the visual "this
        // is a real fixture, not a flat marker" cue, and the mesh startVisionGateCapture()'s
        // psychedelic color-cycle actually animates. Deliberately sized well past the physical
        // guard posts' own footprint (2.6x VISION_GATE_COLLAR_RADIUS_M, vs the posts sitting
        // right on it) - verified via Playwright screenshot that the posts/well alone, sized to
        // fit this gate's tight real-estate, read as visually lost against the boss bumper/orbit
        // rail/comet crowding it from the fixed gameplay camera. The ring has no clearance
        // constraint of its own (no PhysicsAggregate), so it can extend past them for real
        // distinctiveness without risking any of the physical layout's verified clearances.
        const ring = BABYLON.MeshBuilder.CreateTorus('visionGateRing', {
            diameter: VISION_GATE_COLLAR_RADIUS_M * 2.6,
            thickness: 0.007,
            tessellation: 24
        }, scene);
        ring.position.set(VISION_GATE_POS.x, 0.01, VISION_GATE_POS.z);
        ring.rotation.x = Math.PI / 2; // lay flat against the table plane

        // Vertical light beacon - a thin, tall emissive-only spire standing up from the gate,
        // reading clearly against the open dark sky above the table instead of competing with
        // the crowded playfield at the gate's own height. Same material/color-cycle target as the
        // ring (see startVisionGateCapture()) - between the two, the gate is identifiable from
        // across the whole board, not just up close.
        const beacon = BABYLON.MeshBuilder.CreateCylinder('visionGateBeacon', {
            diameter: 0.006,
            height: 0.16,
            tessellation: 12
        }, scene);
        beacon.position.set(VISION_GATE_POS.x, 0.08, VISION_GATE_POS.z);
        const beaconMat = new BABYLON.PBRMaterial('visionGateBeaconMat', scene);
        beaconMat.albedoColor = COLOR_VISION_GATE;
        beaconMat.emissiveColor = COLOR_VISION_GATE.scale(0.5);
        beaconMat.alpha = 0.55; // translucent - reads as a beam of light, not a solid post
        beacon.material = beaconMat;
        ring.material = visionGateMat;

        // 3 guard posts (left/right/far), deliberately leaving the near (-Z, bumper-cluster-
        // facing) side open as the shot's approach mouth - the same "raised back and sides, open
        // front" shape a real scoop has. Real physics (cylinders, unlike the ring above), so a
        // near-miss clips one and bounces away instead of sailing through untouched. Feedback
        // reuses the existing generic 'wall' handling, same as every other guide rail/post added
        // in earlier features.
        [
            { x: VISION_GATE_POS.x - VISION_GATE_COLLAR_RADIUS_M, z: VISION_GATE_POS.z },
            { x: VISION_GATE_POS.x + VISION_GATE_COLLAR_RADIUS_M, z: VISION_GATE_POS.z },
            { x: VISION_GATE_POS.x, z: VISION_GATE_POS.z + VISION_GATE_COLLAR_RADIUS_M }
        ].forEach((postPos, i) => {
            const post = BABYLON.MeshBuilder.CreateCylinder('visionGatePost' + i, {
                diameter: 0.009,
                height: 0.026
            }, scene);
            post.position.set(postPos.x, 0.013, postPos.z);
            post.material = housingMat;
            post.metadata = { kind: 'wall' };
            new BABYLON.PhysicsAggregate(post, BABYLON.PhysicsShapeType.CYLINDER, { mass: 0, restitution: 0.5, friction: 0.4 }, scene);
        });

        // The actual capture trigger - centered at the ball's own resting height (not the well's
        // sunken visual depth) so its overlap volume genuinely intersects the ball's collision
        // sphere as it rolls across the playfield surface. Invisible in normal play, translucent
        // debug overlay under ?dev=1, same convention as every other trigger added so far.
        const visionGateTrigger = BABYLON.MeshBuilder.CreateSphere('visionGateTrigger', {
            diameter: VISION_GATE_RADIUS_M * 2
        }, scene);
        visionGateTrigger.position.set(VISION_GATE_POS.x, 0.015, VISION_GATE_POS.z);
        const triggerMat = new BABYLON.PBRMaterial('visionGateTriggerMat', scene);
        triggerMat.albedoColor = new BABYLON.Color3(0.8, 0.3, 1);
        triggerMat.alpha = 0.35;
        triggerMat.emissiveColor = new BABYLON.Color3(0.8, 0.3, 1).scale(0.5);
        visionGateTrigger.material = triggerMat;
        visionGateTrigger.isVisible = devMode;
        debugTriggerMeshes.push(visionGateTrigger);
        visionGateTrigger.metadata = { kind: 'visionGate' };
        const visionGateAggregate = new BABYLON.PhysicsAggregate(visionGateTrigger, BABYLON.PhysicsShapeType.SPHERE, { mass: 0 }, scene);
        visionGateAggregate.shape.isTrigger = true;

        // ===================================
        // Cabinet visual-geometry pass (user-requested) - purely decorative dressing that makes
        // the table read as a physical cabinet (metal side rails, an apron, shooter-lane
        // hardware, posts/rubber rings, extra lane guides, playfield inserts, shot labels, a
        // backglass surround, and an outer cabinet frame), without touching any existing
        // obstacle/wall/scoring geometry. Every mesh below is deliberately built WITHOUT a
        // PhysicsAggregate - nothing here can accidentally receive a collision/trigger body.
        // Reuses housingMat throughout, exactly like every other decorative piece above, and
        // keeps polygon counts low (tessellation 8-10 on every cylinder/torus here, well under
        // Babylon's defaults) - this whole pass adds well under 2000 triangles to a scene that
        // already has particle systems and dozens of obstacles.
        // ===================================

        // 1. Metal side rails - a raised chrome cap along the top edge of the existing left/right
        // walls, the rounded rail real cabinets run the full length of the playfield. Dressing on
        // top of an already-physical collider, not a new one.
        [-1, 1].forEach((side) => {
            const rail = BABYLON.MeshBuilder.CreateCylinder('sideRail' + side, {
                diameter: 0.012,
                height: TABLE_LENGTH_M,
                tessellation: 10
            }, scene);
            rail.rotation.x = Math.PI / 2;
            rail.position.set(side * (TABLE_WIDTH_M / 2 - 0.006), WALL_HEIGHT_M + 0.004, 0);
            rail.material = housingMat;
        });

        // 2. Apron - the trim strip below the flippers, closest to the player/camera, where a
        // real cabinet's ball-return/coin-door graphics live. Sits just beyond the drain zone's
        // own near edge (see DRAIN_ZONE_CENTER_Y_PX's comment - inner edge ~-0.43) so it can
        // never overlap the drain trigger or the flippers themselves. A thin chakra-colored trim
        // line keeps it tied to the table's own identity rather than reading as generic hardware.
        const apronZ = -0.62;
        const apron = BABYLON.MeshBuilder.CreateBox('apron', {
            width: TABLE_WIDTH_M * 0.92,
            height: 0.018,
            depth: 0.05
        }, scene);
        apron.position.set(0, 0.005, apronZ);
        apron.material = housingMat;

        const apronTrimMat = new BABYLON.PBRMaterial('apronTrimMat', scene);
        apronTrimMat.albedoColor = COLOR_CHAKRA[0];
        apronTrimMat.emissiveColor = COLOR_CHAKRA[0].scale(0.6);
        apronTrimMat.metallic = 0.1;
        apronTrimMat.roughness = 0.4;
        const apronTrim = BABYLON.MeshBuilder.CreateBox('apronTrim', {
            width: TABLE_WIDTH_M * 0.92,
            height: 0.003,
            depth: 0.004
        }, scene);
        apronTrim.position.set(0, 0.015, apronZ - 0.023);
        apronTrim.material = apronTrimMat;

        // 3. Shooter-lane hardware - a coil-spring suggestion (three thin low-poly rings) plus a
        // mechanical end cap, positioned behind the plunger's own fully-pulled-back position
        // (PLUNGER_REST_Z_M/PLUNGER_TRAVEL_M) so nothing here can ever visually overlap the
        // animated plunger mesh itself at any charge level.
        const shooterLaneX = toWorldX(BALL_REST_X_PX);
        const plungerRestZ = toWorldZ(BALL_REST_Z_PX) + PLUNGER_REST_Z_M;
        const coilBaseZ = plungerRestZ - PLUNGER_TRAVEL_M - 0.015;
        for (let i = 0; i < 3; i++) {
            const coil = BABYLON.MeshBuilder.CreateTorus('shooterCoil' + i, {
                diameter: 0.014,
                thickness: 0.0025,
                tessellation: 8
            }, scene);
            coil.rotation.x = Math.PI / 2;
            coil.position.set(shooterLaneX, 0.014, coilBaseZ - i * 0.008);
            coil.material = housingMat;
        }
        const shooterEndCap = BABYLON.MeshBuilder.CreateCylinder('shooterEndCap', {
            diameter: 0.02,
            height: 0.01,
            tessellation: 10
        }, scene);
        shooterEndCap.rotation.x = Math.PI / 2;
        shooterEndCap.position.set(shooterLaneX, 0.014, coilBaseZ - 3 * 0.008 - 0.008);
        shooterEndCap.material = housingMat;

        // 4. Posts and rubber rings - a classic center post between the flippers, plus one
        // flanking each slingshot's outer edge, each a housing-colored post with a thin
        // matte-rubber ring at its base. Purely cosmetic - unlike every OTHER post in this file,
        // these get no PhysicsAggregate at all.
        const rubberMat = new BABYLON.PBRMaterial('rubberRingMat', scene);
        rubberMat.albedoColor = new BABYLON.Color3(0.05, 0.05, 0.06);
        rubberMat.metallic = 0;
        rubberMat.roughness = 0.9; // matte rubber, not chrome like housingMat
        [
            { x: 0, z: FLIPPER_Z_M + 0.05 }, // center post between the flippers
            { x: SLINGSHOTS[0].x - 0.03, z: SLINGSHOTS[0].z }, // flanking the left slingshot
            { x: SLINGSHOTS[1].x + 0.03, z: SLINGSHOTS[1].z } // flanking the right slingshot
        ].forEach((def, i) => {
            const post = BABYLON.MeshBuilder.CreateCylinder('decorPost' + i, {
                diameter: 0.008,
                height: 0.024,
                tessellation: 8
            }, scene);
            post.position.set(def.x, 0.012, def.z);
            post.material = housingMat;

            const ring = BABYLON.MeshBuilder.CreateTorus('decorRing' + i, {
                diameter: 0.016,
                thickness: 0.0025,
                tessellation: 8
            }, scene);
            ring.rotation.x = Math.PI / 2;
            ring.position.set(def.x, 0.014, def.z);
            ring.material = rubberMat;
        });

        // 5. Visible lane guides - small angled decorative fins at each flipper's outer edge,
        // aiming the eye up the lane the same way a real machine's flipper-base guide plastic
        // does. The actual guide walls/rails elsewhere (inlane guides, orbit rails, launch lane
        // wall) already handle real deflection; this is a purely visual cue at the one spot on
        // the table without any guide accent yet.
        [-1, 1].forEach((mirror) => {
            const fin = BABYLON.MeshBuilder.CreateBox('flipperGuideFin' + mirror, {
                width: 0.002,
                height: 0.02,
                depth: 0.06
            }, scene);
            fin.position.set(mirror * (FLIPPER_GAP_HALF_M + 0.09), 0.011, FLIPPER_Z_M - 0.01);
            fin.rotation.y = mirror * 0.35;
            fin.material = housingMat;
        });

        // 6. Playfield inserts/lamps - flush glowing insert plates at each flipper's base, the
        // one classic pinball light location this table didn't have yet (every other lamp so far
        // is a raised bumper/lane/target insert). Lit continuously at a low level, like a real
        // backlit-but-otherwise-idle insert - this is ambient set-dressing, not gameplay state.
        [-1, 1].forEach((mirror, i) => {
            const color = COLOR_CHAKRA[(i + 3) % COLOR_CHAKRA.length];
            const insertMat = new BABYLON.PBRMaterial('flipperInsertMat' + i, scene);
            insertMat.albedoColor = color.scale(0.3);
            insertMat.emissiveColor = color.scale(0.35);
            insertMat.metallic = 0.1;
            insertMat.roughness = 0.5;
            const insert = BABYLON.MeshBuilder.CreateCylinder('flipperInsert' + mirror, {
                diameterTop: 0.02,
                diameterBottom: 0.02,
                height: 0.002,
                tessellation: 10
            }, scene);
            insert.position.set(mirror * FLIPPER_GAP_HALF_M, 0.002, FLIPPER_Z_M + 0.02);
            insert.material = insertMat;
        });

        // 7. Labels near important shots - small flat playfield decals (createLabelPlane(), the
        // same DynamicTexture-canvas technique buildBackglass() uses) at the shots most likely to
        // need a name to be understood at a glance: the skill-shot lane bank, the kickback
        // outlane, both orbit entrances, and the Vision Gate. Positioned near, not on top of,
        // each shot's own lamp/trigger geometry so nothing visually overlaps.
        createLabelPlane(scene, 'SKILL SHOT', SKILL_SHOT_LANES[1].x, SKILL_SHOT_Z_M + 0.05, '#ff3366');
        createLabelPlane(scene, 'KICKBACK', kickbackMirror * OUTLANE_TRIGGER_X_M, LANE_Z_BOTTOM_M - 0.03, '#ff5500');
        ORBITS.forEach((orbitDef) => {
            // Side-specific text (not a shared 'ORBIT' label for both) - doubles as telling the
            // two orbits apart at a glance and keeps each label's mesh/texture name unique.
            const orbitLabel = orbitDef.side === 'left' ? 'L ORBIT' : 'R ORBIT';
            createLabelPlane(scene, orbitLabel, orbitDef.entranceX, ORBIT_ENTRANCE_Z_M - 0.04, '#33ccff');
        });
        createLabelPlane(scene, 'VISION GATE', VISION_GATE_POS.x, VISION_GATE_POS.z - VISION_GATE_RADIUS_M - 0.03, '#cc66ff');

        // 8. Physical backing around the backglass - a frame border plus a receding cabinet
        // "head" riser behind the panel buildBackglass() builds separately (called after this
        // function). These numbers deliberately mirror its own fixed position/rotation
        // (position.set(0, 0.28, TABLE_LENGTH_M/2+0.06), rotation.x=0.4) rather than needing a
        // mesh reference - both larger than the 0.32x0.15 panel and positioned slightly further
        // from the camera (+Z) than it, so the panel stays the frontmost, readable layer with the
        // frame/head peeking out around its edges, not covering it.
        const backglassX = 0, backglassY = 0.28, backglassZ = TABLE_LENGTH_M / 2 + 0.06;
        const backglassFrame = BABYLON.MeshBuilder.CreateBox('backglassFrame', {
            width: 0.36,
            height: 0.19,
            depth: 0.02
        }, scene);
        backglassFrame.position.set(backglassX, backglassY, backglassZ + 0.012);
        backglassFrame.rotation.x = 0.4;
        backglassFrame.material = housingMat;

        const cabinetHead = BABYLON.MeshBuilder.CreateBox('cabinetHead', {
            width: 0.38,
            height: 0.22,
            depth: 0.05
        }, scene);
        cabinetHead.position.set(backglassX, backglassY - 0.01, backglassZ + 0.03);
        cabinetHead.rotation.x = 0.4;
        cabinetHead.material = housingMat;

        // 9. Subtle cabinet depth/frame - a thin outer trim just beyond the existing side/top
        // walls, suggesting the surrounding cabinet body without changing the actual playfield
        // boundary at all (the walls keep their existing collision exactly as-is; this sits
        // purely outside it).
        [-1, 1].forEach((side) => {
            const trim = BABYLON.MeshBuilder.CreateBox('cabinetSideTrim' + side, {
                width: 0.01,
                height: 0.01,
                depth: TABLE_LENGTH_M + 0.04
            }, scene);
            trim.position.set(side * (TABLE_WIDTH_M / 2 + 0.014), 0.005, 0);
            trim.material = housingMat;
        });
        const topTrim = BABYLON.MeshBuilder.CreateBox('cabinetTopTrim', {
            width: TABLE_WIDTH_M + 0.04,
            height: 0.01,
            depth: 0.01
        }, scene);
        topTrim.position.set(0, 0.005, TABLE_LENGTH_M / 2 + 0.014);
        topTrim.material = housingMat;

        // Returned so main() can attach Stage 8's chakra-sparkle particle systems, animate
        // Saturn's rings every frame, drive the power-up orb's spawn/despawn cycle, run the
        // Vision Gate's own capture sequence against a direct mesh reference (the ring, not the
        // trigger - the ring is what's actually visible and worth flashing/sparkling), and
        // register every lamp mesh (sideLaneLampMeshes/orbitLampMeshes: {id, mesh} pairs, the rest:
        // plain mesh arrays/refs) against the centralized lamp system (see createLampSystem()).
        return {
            missionTargetMeshes, missionTargetLamps, reentryLaneMeshes, skillShotLaneMeshes, skillShotLampMeshes,
            sideLaneLampMeshes, orbitLampMeshes, debugTriggerMeshes,
            kickbackLampMesh, ballSaveLampMesh, saturnRings, powerUpMesh, visionGateMesh: ring
        };
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

    // ===================================
    // Centralized playfield-lamp system (user-requested) - a small, reusable state layer so
    // gameplay code never mutates a lamp mesh's material directly. Every lamp insert in the game
    // (mission targets, re-entry lanes, inlanes, outlanes, orbits, the Vision Gate, the
    // score-multiplier orb, ball save, kickback) registers itself once against its own
    // already-existing per-instance material - see buildObstacles()'s per-instance-clone
    // convention every one of those meshes already follows, this system never allocates a new
    // material itself - and after that, gameplay code only ever calls setLampMode(id, mode) or
    // flashLamp(id, ...) by ID. updateLamps(), called once per frame from the render loop, is the
    // only place that actually drives BLINK/PULSE animation or an in-flight flash; OFF/ON/LOCKED
    // are fully static and cost nothing per frame beyond one comparison per lamp. No Color3 or
    // material is ever allocated here, at registration or per frame - only the scratch Color3
    // below and each lamp's own pre-existing emissiveColor are mutated in place (scaleToRef).
    //
    // Deliberately one-directional: this registry is pure VISUAL state, never gameplay state.
    // dropTargetBank[i].dropped, laneBank[i].lit, kickback.active, ballSave.active, skillShot.
    // active, powerUp.active all stay exactly where they already lived, as the sole source of
    // truth - this system only ever gets told about a change after the fact, from the same
    // handful of call sites that already flip those flags.
    // ===================================
    const LAMP_MODE = { OFF: 'off', ON: 'on', BLINK: 'blink', PULSE: 'pulse', LOCKED: 'locked' };
    const LAMP_DIM_SCALE = 0.12; // matches this file's pre-existing "faint glow at rest" convention (every lamp's original unlit emissive)
    const LAMP_LIT_SCALE = 0.9; // matches this file's pre-existing "lit" convention
    const LAMP_LOCKED_SCALE = 0.5; // a new, distinct fixed brightness - reads as "done", not just "off" or "on"
    const LAMP_BLINK_PERIOD_MS = 300; // one on/off half-period
    const LAMP_PULSE_PERIOD_MS = 1100; // one full sine cycle
    // Slowed, not eliminated under reduced motion - same treatment updateSaturnRotation() already
    // gives purely ambient motion, applied here to a gameplay-meaningful blink/pulse instead. A
    // lamp's state is real information (a window's open, a shot is ready), so it stays legible,
    // just at a calmer, well-under-3Hz rate rather than removed outright.
    const LAMP_REDUCED_MOTION_PERIOD_SCALE = 2.5;

    function createLampSystem() {
        const lamps = new Map();
        const scratch = new BABYLON.Color3(); // reused every frame - values only ever copied OUT of it, never held onto

        function applyBrightness(lamp, brightness) {
            scratch.copyFrom(lamp.flashColor || lamp.baseColor);
            scratch.scaleToRef(brightness, lamp.material.emissiveColor);
        }

        // Renders a lamp's current mode immediately - used at registration and for every static
        // mode change (OFF/ON/LOCKED). BLINK/PULSE deliberately fall through to a dim resting look
        // here; their real per-frame animation only starts once updateLamps() next ticks.
        function applyMode(lamp) {
            if (lamp.mode === LAMP_MODE.ON) applyBrightness(lamp, lamp.litScale);
            else if (lamp.mode === LAMP_MODE.LOCKED) applyBrightness(lamp, lamp.lockedScale);
            else applyBrightness(lamp, lamp.dimScale);
        }

        // opts optionally overrides this one lamp's dim/lit/locked brightness scale (e.g. the
        // Vision Gate, whose rest look predates this system and doesn't distinguish dim/lit at
        // all) - every other lamp just takes the shared LAMP_*_SCALE constants above.
        function registerLamp(id, mesh, baseColor, mode, opts) {
            opts = opts || {};
            const lamp = {
                material: mesh.material,
                baseColor,
                mode: mode || LAMP_MODE.OFF,
                dimScale: opts.dimScale !== undefined ? opts.dimScale : LAMP_DIM_SCALE,
                litScale: opts.litScale !== undefined ? opts.litScale : LAMP_LIT_SCALE,
                lockedScale: opts.lockedScale !== undefined ? opts.lockedScale : LAMP_LOCKED_SCALE,
                phase: Math.random() * 1000, // desyncs same-mode lamps so a whole bank doesn't blink/pulse in lockstep
                flashUntilMs: 0,
                flashColor: null
            };
            lamps.set(id, lamp);
            applyMode(lamp);
        }

        // id must already be registered - every call site owns a fixed, known set of lamp ids
        // (see the registration block in main()), so a missing id here is a real bug, not a
        // routine "might not exist yet" case worth silently no-oping.
        function setLampMode(id, mode) {
            const lamp = lamps.get(id);
            lamp.mode = mode;
            if (mode !== LAMP_MODE.BLINK && mode !== LAMP_MODE.PULSE) applyMode(lamp);
        }

        // One-shot brief brightening on top of whatever persistent mode is already set (hit
        // feedback - a rollover/orbit lamp flashing bright for a beat), reverting cleanly back to
        // that mode's own steady look once it expires. Driven by the same nowMs tick as
        // everything else here instead of an independent setTimeout, so it can never fire while
        // paused/backgrounded and leave a lamp stuck bright.
        function flashLamp(id, durationMs, color) {
            const lamp = lamps.get(id);
            lamp.flashColor = color || null;
            lamp.flashUntilMs = performance.now() + durationMs;
        }

        // Called once per frame from the render loop. Cheap: every lamp gets one flash-expiry
        // comparison, and only lamps currently in BLINK/PULSE (or mid-flash) do any further work -
        // the rest (the vast majority - OFF/ON/LOCKED) are already-correct static materials this
        // tick touches but doesn't change.
        function updateLamps(nowMs) {
            const reducedMotion = window.SPIRITBALL_reducedMotion;
            const blinkPeriod = reducedMotion ? LAMP_BLINK_PERIOD_MS * LAMP_REDUCED_MOTION_PERIOD_SCALE : LAMP_BLINK_PERIOD_MS;
            const pulsePeriod = reducedMotion ? LAMP_PULSE_PERIOD_MS * LAMP_REDUCED_MOTION_PERIOD_SCALE : LAMP_PULSE_PERIOD_MS;

            lamps.forEach((lamp) => {
                if (lamp.flashUntilMs > nowMs) {
                    applyBrightness(lamp, 1);
                    return;
                }
                if (lamp.flashUntilMs !== 0) {
                    lamp.flashUntilMs = 0;
                    lamp.flashColor = null;
                    // Restores the static OFF/ON/LOCKED look immediately - those modes otherwise
                    // never get re-rendered here (see the comment at the bottom of this loop), so
                    // without this a lamp that flashed while static would stay stuck bright
                    // forever. Harmless if the mode turns out to be BLINK/PULSE instead - the
                    // branches below immediately overwrite it again in this same tick.
                    applyMode(lamp);
                }
                if (lamp.mode === LAMP_MODE.BLINK) {
                    const on = Math.floor((nowMs + lamp.phase) / blinkPeriod) % 2 === 0;
                    applyBrightness(lamp, on ? lamp.litScale : lamp.dimScale);
                } else if (lamp.mode === LAMP_MODE.PULSE) {
                    const t = ((nowMs + lamp.phase) % pulsePeriod) / pulsePeriod;
                    const wave = (Math.sin(t * Math.PI * 2) + 1) / 2; // 0..1
                    applyBrightness(lamp, lamp.dimScale + wave * (lamp.litScale - lamp.dimScale));
                }
                // OFF/ON/LOCKED are static and already applied by setLampMode()/registerLamp() -
                // nothing else to do for them here.
            });
        }

        return { registerLamp, setLampMode, flashLamp, updateLamps };
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
        COLOR_COMET = hexToColor3(HEX_COMET);
        COLOR_MISSION_ACTIVE = hexToColor3(HEX_MISSION_ACTIVE);
        COLOR_LANE_LAMP = hexToColor3(HEX_LANE_LAMP);
        COLOR_ORBIT_LAMP = hexToColor3(HEX_ORBIT_LAMP);
        COLOR_SKILL_SHOT_LAMP = hexToColor3(HEX_SKILL_SHOT_LAMP);
        COLOR_BALL_SAVE_LAMP = hexToColor3(HEX_BALL_SAVE_LAMP);
        COLOR_KICKBACK_LAMP = hexToColor3(HEX_KICKBACK_LAMP);
        COLOR_VISION_GATE = hexToColor3(HEX_VISION_GATE);
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

        // Centralized playfield-lamp system (user-requested) - see createLampSystem()'s own block
        // comment for the full design. Every lamp mesh built in buildObstacles() registers here,
        // once, by a fixed string id; every gameplay call site below only ever refers to a lamp by
        // that id from this point on, never its mesh/material directly.
        const lampSystem = createLampSystem();
        obstacles.missionTargetLamps.forEach((mesh, i) => {
            lampSystem.registerLamp('missionTarget' + i, mesh, COLOR_CHAKRA[i % COLOR_CHAKRA.length], LAMP_MODE.ON);
        });
        obstacles.reentryLaneMeshes.forEach((mesh, i) => {
            lampSystem.registerLamp('reentryLane' + i, mesh, COLOR_MISSION_ACTIVE, LAMP_MODE.OFF);
        });
        obstacles.sideLaneLampMeshes.forEach((entry) => {
            lampSystem.registerLamp(entry.id, entry.mesh, COLOR_LANE_LAMP, LAMP_MODE.OFF);
        });
        obstacles.orbitLampMeshes.forEach((entry) => {
            lampSystem.registerLamp(entry.id, entry.mesh, COLOR_ORBIT_LAMP, LAMP_MODE.OFF);
        });
        obstacles.skillShotLampMeshes.forEach((mesh, i) => {
            lampSystem.registerLamp('skillShot' + i, mesh, COLOR_SKILL_SHOT_LAMP, LAMP_MODE.OFF);
        });
        lampSystem.registerLamp('ballSave', obstacles.ballSaveLampMesh, COLOR_BALL_SAVE_LAMP, LAMP_MODE.OFF);
        lampSystem.registerLamp('kickback', obstacles.kickbackLampMesh, COLOR_KICKBACK_LAMP, LAMP_MODE.OFF);
        // litScale:1 matches the multiplier orb's own always-fully-bright-while-visible material
        // (powerUpMat.emissiveColor starts at (1,1,1) in buildObstacles()) - PULSE then sweeps it
        // between the shared dim rest scale and this full brightness while it's spawned/collectible.
        lampSystem.registerLamp('multiplier', obstacles.powerUpMesh, new BABYLON.Color3(1, 1, 1), LAMP_MODE.OFF, { litScale: 1 });
        // dimScale/litScale/lockedScale all pinned to 0.4 - the Vision Gate's own pre-existing rest
        // brightness (COLOR_VISION_GATE.scale(0.4)), which doesn't distinguish "off" from "on" the
        // way every other lamp here does. LOCKED is used only to freeze this lamp under the
        // system's own control while startVisionGateColorCycle()'s bespoke sequence drives the same
        // material directly during a capture.
        lampSystem.registerLamp('visionGate', obstacles.visionGateMesh, COLOR_VISION_GATE, LAMP_MODE.ON, { dimScale: 0.4, litScale: 0.4, lockedScale: 0.4 });

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
        // Named (not just assigned inline) so the Vision Gate's temporary glow boost
        // (startVisionGateCapture() in main()) has a real "what does resting look like" value to
        // restore, rather than assuming "whatever it happened to be right before" - this is the
        // only place glowLayer.intensity is ever set outside that one feature.
        const restGlowIntensity = highFidelity ? 0.8 : 0.5;
        glowLayer.intensity = restGlowIntensity;

        // Hoisted to a `let` (not a const declared only inside the if-block) so the dev HUD's
        // "post-processing" checkbox (below, once devMode is confirmed) can toggle
        // pipeline.bloomEnabled live - stays null on a non-highFidelity device, exactly like
        // before.
        let pipeline = null;
        if (highFidelity) {
            pipeline = new BABYLON.DefaultRenderingPipeline('defaultPipeline', true, scene, [camera]);
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
        //
        // Tuning fix (user-reported - "reduce the shakiness so it's not over-dramatic"): this one
        // multiplier is the single scale factor every one of the ~25 triggerCameraShake() call
        // sites across the file passes through, so halving it here (4 -> 2) uniformly softens
        // every hit's shake by 50% while preserving the carefully-tuned RELATIVE proportions
        // between them (a boss bumper still shakes harder than a regular one, a drain still
        // shakes harder than a rollover, etc.) - deliberately not hand-tuning all ~25 individual
        // intensity values, which would risk losing that relative balance. Only the random-jitter
        // shake is touched, not triggerCameraPunch() - that's a separate, smooth directional
        // camera nudge (the launch push-in, the drain dip), not the "shakiness" being described.
        function triggerCameraShake(durationMs, intensity) {
            if (window.SPIRITBALL_reducedMotion) return;
            const amplitude = intensity * 2;
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
            // Optional "lane change" mechanic (rotateLaneLamps()) - checked on the off->on edge,
            // BEFORE activateFlipper() flips flipper.active to true, same guard activateFlipper()
            // itself uses to fire its solenoid sound only once per real press, not once per
            // browser key-repeat event.
            if (e.code === 'ArrowLeft') {
                if (!leftFlipper.active) rotateLaneLamps(-1);
                activateFlipper(leftFlipper);
            }
            if (e.code === 'ArrowRight') {
                if (!rightFlipper.active) rotateLaneLamps(1);
                activateFlipper(rightFlipper);
            }
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
        // Captured (not discarded like before) so the dev HUD's "particle effects" toggle can
        // stop/restart this one ambient system too, not just gate future one-shot bursts/sparkles.
        const drainVortex = buildDrainVortex(scene, particleTexture, highFidelity);
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
            // Upper-lane skill shot (user-requested) - defensive, unconditional reset, same
            // pattern as the Vision Gate's own motion-type restore here: correct no-op if no
            // shot is pending, and guarantees a dev "RESET BALL TO PLUNGER" tap or any other path
            // into this function can never leave a stale window (or lit lamps) armed for the
            // next ball. Force-reset, not endSkillShot() - a hard reset shouldn't retroactively
            // award whatever lane happened to be pending.
            forceResetSkillShot();
            // Ball save (fairness mechanics, user-requested) - same defensive, unconditional
            // reset for the same reason: no path into this function should ever leave a stale
            // window armed for whatever ball is about to start. Deliberately does NOT touch
            // ballSave.usedThisLife - that flag's whole job is to survive exactly this call (a
            // save's own relaunch goes through here too), see armBallSave()'s comment.
            ballSave.active = false;
            ballSave.remainingMs = 0;
            setBallSaveLampLit(false);
        }

        // Mirrors handleLaunchPress()/handleLaunchRelease() in ../index.js: power is purely a
        // continuous function of hold duration (see the render loop below), and release always
        // tries to launch if the ball is ready - no separate "did we see a press" bookkeeping,
        // which is what makes "release immediately after a reset" reliable (archive/release-prompts/13-
        // *.md's desktop-launch-after-death fix, ported here since Stage 5's acceptance criteria
        // calls out the exact same scenario).
        function handleLaunchPress() {
            endAttractMode(); // first launch input ends attract mode, even if this press turns out to be a no-op below
            if (ballInPlay || isPaused) return;
            plungerCharging = true;
            plungerChargeElapsedMs = 0;
            plungerPower = PLUNGER_MIN_POWER_MS;
            vibrateDevice(15); // matches handleLaunchPress()'s vibrate(15) in ../index.js - light tick: charging started
        }

        // Bug fix (playtest audit): the isPaused guard matters specifically for the keyboard path
        // - a player can hold Space (charging), tap Escape to pause with Space still physically
        // down, then release Space while the pause menu is showing. Nothing about the pause
        // overlay blocks a global `keyup` listener the way it blocks mobile touch controls (CSS
        // z-index only stops pointer events, not keyboard events), so without this guard the ball
        // would launch - complete with the LAUNCH! message, camera shake/punch, and sound -
        // while still paused, purely because physics itself was frozen (scene.physicsEnabled =
        // false), not because launching was actually blocked. Confirmed via Playwright: releasing
        // Space mid-pause produced backglass.state.message === 'LAUNCH!' while the pause overlay
        // was still showing.
        function handleLaunchRelease() {
            if (ballInPlay || isPaused) return;
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
            // Upper-lane skill shot (user-requested) - armed on every launch, not just the first
            // of the game; "award once per ball" is enforced by skillShot.active itself (see its
            // own block comment), not by anything here. Folded into the existing LAUNCH! message
            // rather than a second showMessage() call right after it, which would just silently
            // overwrite it (showMessage() has no queue - see its own comment).
            armSkillShot();
            // Ball save (fairness mechanics, user-requested) - armed on every launch too;
            // armBallSave() itself is what refuses to re-arm once used this life (see its own
            // comment), so no extra guard is needed here.
            armBallSave();
            backglass.showMessage('LAUNCH! SKILL SHOT READY', 900);

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
        // Bug fix (playtest audit): handleLaunchRelease() deliberately launches even without a
        // matching handleLaunchPress() (see its own comment - "release immediately after a
        // reset" needs to work if the key was already held down through a drain). But that same
        // leniency meant the Space keyup from a restart-after-Game-Over or a resume-from-pause
        // tap - keydowns that intentionally do NOT call handleLaunchPress(), since they're
        // consumed by startNewGame()/resumeGame() instead - fell through to handleLaunchRelease()
        // anyway, silently auto-launching the ball at minimum power the instant the game
        // resumed/restarted, before the player had any chance to charge a real shot. Confirmed via
        // Playwright: a single Space tap to resume from pause (or to restart after Game Over)
        // left the launch button's "ready" class false immediately after, i.e. already launched.
        // suppressNextLaunchRelease marks exactly those two keydown branches so the very next
        // keyup is a no-op instead of an unintended launch, without touching the legitimate
        // "held through a drain" case (which never sets this flag).
        let suppressNextLaunchRelease = false;
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
                suppressNextLaunchRelease = true;
                return;
            }
            if (isPaused) {
                resumeGame();
                suppressNextLaunchRelease = true;
                return;
            }
            handleLaunchPress();
        });
        window.addEventListener('keyup', (e) => {
            if (e.code !== 'Space') return;
            if (suppressNextLaunchRelease) {
                suppressNextLaunchRelease = false;
                return;
            }
            handleLaunchRelease();
        });

        // --- Mobile controls (Stage 11, babylon-prompts/11-*.md; touch input audit, user-requested) ---
        //
        // DOM elements/CSS ported from InputManager.setupMobileControls() in ../index.js
        // (archive/release-prompts/14-*.md) - full-height arcade-style edge zones (tap ANYWHERE
        // along the side, not a small button) plus a discrete round launch button - unchanged by
        // this audit (the doc explicitly asks to preserve them). The EVENT WIRING below replaces
        // the original direct touchstart/touchend/touchcancel-per-element approach with an
        // identifier-tracked model, for a handful of real gaps that approach had:
        //
        // 1. Two touches on the SAME zone (e.g. a stray second finger) - the original code called
        //    deactivate on ANY touchend/touchcancel targeting that zone, so the first finger
        //    lifting released the flipper even while a second finger was still holding it down.
        //    Now every touch identifier is tracked individually per control, and a control only
        //    releases once its last touch ends.
        // 2. touchend/touchcancel were only listened for on each zone element specifically. Touch
        //    events keep targeting the ORIGINAL element for the life of the touch even if the
        //    finger moves elsewhere, so this usually worked - but listening once on window with
        //    the identifier map above is simpler AND catches a cancellation the original per-zone
        //    touchcancel might miss.
        // 3. A finger dragged off the edge of the SCREEN (not just off the zone - genuinely
        //    leaving the viewport) doesn't reliably fire touchend/touchcancel on every platform,
        //    which could leave a flipper permanently "held". A window-level touchmove watches
        //    every tracked touch's position and treats leaving the viewport bounds as a release.
        // 4. Backgrounding the tab/app (another app, a notification, alt-tab) can strand a touch
        //    mid-press with no DOM event at all - see forceReleaseAllControls()'s blur/
        //    visibilitychange wiring right below this block.
        const leftZone = document.getElementById('flipper-zone-left');
        const rightZone = document.getElementById('flipper-zone-right');
        const launchBtn = document.getElementById('launch-btn');

        function pressLeft() {
            if (!leftFlipper.active) rotateLaneLamps(-1); // "lane change" - see the keydown handler's comment
            activateFlipper(leftFlipper);
            leftZone.classList.add('pressed');
        }
        function releaseLeft() {
            deactivateFlipper(leftFlipper);
            leftZone.classList.remove('pressed');
        }
        function pressRight() {
            if (!rightFlipper.active) rotateLaneLamps(1); // "lane change" - see the keydown handler's comment
            activateFlipper(rightFlipper);
            rightZone.classList.add('pressed');
        }
        function releaseRight() {
            deactivateFlipper(rightFlipper);
            rightZone.classList.remove('pressed');
        }
        function pressLaunch() {
            handleLaunchPress();
            launchBtn.classList.add('pressed');
        }
        function releaseLaunch() {
            handleLaunchRelease();
            launchBtn.classList.remove('pressed');
        }
        const CONTROL_PRESS = { left: pressLeft, right: pressRight, launch: pressLaunch };
        const CONTROL_RELEASE = { left: releaseLeft, right: releaseRight, launch: releaseLaunch };

        // touch identifier -> which control it's holding down, plus a live count per control -
        // together these are the single source of truth for "is this control actually pressed
        // right now", replacing the original code's implicit "last touchend on this element wins"
        // assumption. Very rapid alternating presses stay correct under this model too: each
        // touchstart/touchend pair is matched by identifier, not by ordering assumptions, so a
        // fast left-right-left-right sequence can never cross-cancel the wrong zone.
        const touchIdToControl = new Map();
        const controlTouchCounts = { left: 0, right: 0, launch: 0 };

        function trackTouchStart(control, touchList) {
            for (const touch of touchList) {
                if (touchIdToControl.has(touch.identifier)) continue; // defensive - shouldn't normally happen
                touchIdToControl.set(touch.identifier, control);
                controlTouchCounts[control]++;
                if (controlTouchCounts[control] === 1) CONTROL_PRESS[control]();
            }
        }

        // Shared release path for touchend, touchcancel, AND a tracked touch whose position has
        // left the viewport (see the touchmove listener below) - all three mean "this finger no
        // longer counts as a press" and must be handled identically so a control can never get
        // stuck active from one of them being missed.
        function trackTouchEnd(touchList) {
            for (const touch of touchList) {
                const control = touchIdToControl.get(touch.identifier);
                if (!control) continue;
                touchIdToControl.delete(touch.identifier);
                controlTouchCounts[control] = Math.max(0, controlTouchCounts[control] - 1);
                if (controlTouchCounts[control] === 0) CONTROL_RELEASE[control]();
            }
        }

        leftZone.addEventListener('touchstart', (e) => { e.preventDefault(); trackTouchStart('left', e.changedTouches); }, { passive: false });
        rightZone.addEventListener('touchstart', (e) => { e.preventDefault(); trackTouchStart('right', e.changedTouches); }, { passive: false });
        launchBtn.addEventListener('touchstart', (e) => { e.preventDefault(); trackTouchStart('launch', e.changedTouches); }, { passive: false });

        // Window-level, not per-zone: touch events keep bubbling from whichever element actually
        // received the touchstart regardless of where the finger ends up, so one listener per
        // event type correctly covers all three controls (point 2 above).
        window.addEventListener('touchend', (e) => trackTouchEnd(e.changedTouches), { passive: true });
        window.addEventListener('touchcancel', (e) => trackTouchEnd(e.changedTouches), { passive: true });
        // Leaving-the-viewport detection (point 3 above) - purely a coordinate read, never calls
        // preventDefault, so this stays passive for scroll/composite performance.
        window.addEventListener('touchmove', (e) => {
            for (const touch of e.changedTouches) {
                if (!touchIdToControl.has(touch.identifier)) continue;
                if (touch.clientX < 0 || touch.clientX > window.innerWidth || touch.clientY < 0 || touch.clientY > window.innerHeight) {
                    trackTouchEnd([touch]);
                }
            }
        }, { passive: true });

        // Desktop-mouse testing path - no multi-touch concerns, so this stays the original direct
        // press/release wiring (not routed through the touch-identifier tracking above).
        leftZone.addEventListener('mousedown', pressLeft);
        leftZone.addEventListener('mouseup', releaseLeft);
        leftZone.addEventListener('mouseleave', releaseLeft);
        rightZone.addEventListener('mousedown', pressRight);
        rightZone.addEventListener('mouseup', releaseRight);
        rightZone.addEventListener('mouseleave', releaseRight);
        launchBtn.addEventListener('mousedown', pressLaunch);
        launchBtn.addEventListener('mouseup', releaseLaunch);

        // Safety net (touch input audit, user-requested) for focus/visibility changes: backgrounding
        // the tab/app (another app, a notification, an OS gesture, alt-tab) can strand a touch
        // mid-press with no touchend/touchcancel ever firing, since the finger physically lifts
        // while this page isn't receiving events at all. Force-releasing every tracked control (and
        // cancelling an in-progress plunger charge, which has the exact same "silently stuck"
        // failure mode) whenever the page is hidden or loses focus guarantees nothing can come back
        // from the background still holding a flipper or mid-charge. Also pauses the game itself via
        // the existing openPauseMenu() - already a correct, safe stopped state, and its own guard
        // (isPaused/gameOverActive/menuOverlay checks) makes this a harmless no-op when a pause
        // wouldn't make sense (menu screen, already paused, game over).
        function forceReleaseAllControls() {
            touchIdToControl.clear();
            controlTouchCounts.left = 0;
            controlTouchCounts.right = 0;
            controlTouchCounts.launch = 0;
            deactivateFlipper(leftFlipper);
            deactivateFlipper(rightFlipper);
            leftZone.classList.remove('pressed');
            rightZone.classList.remove('pressed');
            launchBtn.classList.remove('pressed');
            if (plungerCharging) {
                plungerCharging = false;
                plungerChargeElapsedMs = 0;
                plungerPower = PLUNGER_MIN_POWER_MS;
                plunger.chargePercent = 0;
            }
        }
        window.addEventListener('blur', () => {
            forceReleaseAllControls();
            openPauseMenu();
        });
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                forceReleaseAllControls();
                openPauseMenu();
            }
        });

        // Fullscreen + portrait-lock request on the player's first touch anywhere (needs a user
        // gesture - can't happen automatically on load). Not {once: true} - requestFullscreenAndLock()
        // guards itself, and resets that guard on fullscreenchange (see its own comment), so a later
        // tap can retry if fullscreen was exited mid-game.
        document.addEventListener('touchstart', () => requestFullscreenAndLock(), { passive: true });

        // Bug fix (playtest audit): a second, undebounced `window.addEventListener('resize', ...)`
        // used to sit right after the render loop below - a leftover from this file's very first
        // version (Stage 2), predating setupResizeHandlers() entirely. It was never removed once
        // that debounced handler existed, so every resize fired engine.resize() twice (once
        // instantly there, once again 250ms later here) and skipped detectMobile() on the instant
        // path. setupResizeHandlers() alone is correct and sufficient.
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
        const stats = {
            bumperHits: 0, cometHits: 0, saturnHits: 0, targetHits: 0, laneHits: 0,
            missionsCompleted: 0, powerUpsCollected: 0, inlaneHits: 0, outlaneHits: 0,
            leftOrbitShots: 0, rightOrbitShots: 0, visionGateCaptures: 0, targetBankCompletions: 0,
            laneBankCompletions: 0, combosCompleted: 0, comboMaxTier: 0, skillShotsAwarded: 0,
            ballSaves: 0, kickbacksUsed: 0
        };

        // Mission/rank progression state (improvement-prompts/05-*.md). rank is an index into
        // RANK_NAMES; state is 'idle' (no mission active - a target hit will select+start one) or
        // 'active' (progress is accumulating toward `required`, gated by MISSION_DEFS'
        // selectedIndex-matched type in progressMission() below).
        const mission = { state: 'idle', selectedIndex: null, progress: 0, required: 0, rank: 0 };

        // Drop-target bank state (mission targets upgraded from a flash-and-cooldown flag into a
        // real drop-target bank, user-requested) - one entry per MISSION_TARGET_BANK index.
        // `dropped` is the actual trigger/collision gate, checked synchronously in
        // handleTriggerHit() the instant a hit lands; `animMs` (remaining ms in the current sink
        // tween) drives updateDropTargetBank()'s purely visual position lerp below. Deliberately
        // two separate fields, not one - a target is unhittable the instant it's marked dropped,
        // well before its multi-frame drop animation finishes settling, matching the requirement
        // that visual animation and trigger/collision state stay cleanly separated. Independent
        // of `mission` above: dropping a target still selects/starts a mission exactly as before
        // (see handleTriggerHit()), but the bank itself - and its own bank-complete bonus - is a
        // separate mechanic that doesn't feed mission.progress and isn't reset by it, only reset
        // alongside it (see resetDropTargetBank()'s call sites).
        const dropTargetBank = MISSION_TARGET_BANK.map(() => ({ dropped: false, animMs: 0 }));

        // Rollover-lane bank state (re-entry lanes upgraded from a one-way permanent recolor into
        // a real lit-bank mechanic, user-requested) - one entry per REENTRY_LANES index. `lit` is
        // the lamp's ON/OFF state: passing through an unlit lane lights it (and counts toward the
        // bank); an already-lit lane still scores its normal SCORE_REENTRY_LANE hit but doesn't
        // relight or recount (see handleTriggerHit()'s 'reentryLane' branch). Deliberately kept
        // fully independent of `mission`/`dropTargetBank` above - lighting a lane still calls
        // progressMission('lane') exactly as before (unchanged), but the bank-complete bonus below
        // is its own separate mechanic with its own stats counter, precisely so it can later feed
        // multiplier progression without any mission-FSM coupling.
        const laneBank = REENTRY_LANES.map(() => ({ lit: false }));

        // Bonus/multiplier subsystem state (user-requested) - per-ball, not per-game: `points`
        // accumulates silently from major shots/mission completions during play (see their call
        // sites) and `multiplierX` is advanced by clearing the rollover-lane bank above. Neither
        // touches the real score directly - only startBonusCount() (below) ever does, at drain,
        // via the shared addScore() so high-score tracking stays exactly as it already works.
        // Deliberately separate from `scoreMultiplier`/`powerUp` (a temporary, real-time 2x
        // applied to every hit while its own window is running) - the two combine additively
        // through addScore() during the bonus count, not by referencing each other.
        const ballBonus = { points: 0, multiplierX: 1 };

        // Lightweight combo scoring state (user-requested) - one {index, lastAtMs} progress
        // cursor per COMBO_DEFS entry (same array index), advanced by recordComboShot() below.
        // `index` is how many of that def's steps have matched in order so far; `lastAtMs` is
        // when the most recent one did, used to expire a stalled chain cleanly. Separate from
        // `comboStreak`, which tracks chaining multiple DIFFERENT combos back to back for an
        // escalating tier (COMBO x2, x3...) - see fireCombo() below.
        const comboProgress = COMBO_DEFS.map(() => ({ index: 0, lastAtMs: 0 }));
        const comboStreak = { tier: 0, lastAtMs: 0 };

        // Upper-lane skill shot state (user-requested) - `active` is the real gate checked in
        // handleTriggerHit()'s 'skillShotLane' branch and armed only by handleLaunchRelease()
        // below (once per launch); `remainingMs` is the short timeout, counted down by
        // updateSkillShot() from the render loop like every other continuous per-ball timer here
        // (updatePowerUp()/updateDropTargetBank()/updateBonusCount()) rather than a bare
        // setTimeout, so it pauses correctly with everything else instead of burning down during
        // a paused game.
        //
        // `bestLaneIndex` is why a lane touch doesn't resolve the shot immediately: the three
        // lanes sit side by side at the same depth (see SKILL_SHOT_LANES), the ball always
        // travels across them in the same right-to-left order, and they're pure detectors (not
        // physical blockers) - so a shot that carries far enough legitimately crosses more than
        // one lane's trigger in a row. Each touch only ever UPGRADES bestLaneIndex to the better
        // lane (see the 'skillShotLane' branch below); the window closing - via endSkillShot(),
        // on a timeout or the ball entering normal play (the guard near the top of
        // handlePhysicalHit()/handleTriggerHit()) - is what actually awards whichever lane ended
        // up best, so "where the first clean launch lands" means the FURTHEST lane it reached,
        // not just whichever one happened to be geometrically nearest.
        const skillShot = { active: false, remainingMs: 0, bestLaneIndex: null };

        // BALL SAVE state (fairness mechanics, user-requested) - `active`/`remainingMs` are the
        // live grace window, same render-loop-driven countdown idiom as skillShot above
        // (updateBallSave() below). `usedThisLife` is the actual "limit abuse/retriggering"
        // mechanism: once a save is consumed, armBallSave() (called on every launch, same as
        // armSkillShot()) refuses to re-arm until this life genuinely ends (a real, unsaved
        // drain - see handleDrain()) or a new game starts - otherwise a player could bounce the
        // same "free" ball off the drain zone indefinitely within one life.
        const ballSave = { active: false, remainingMs: 0, usedThisLife: false };

        // OUTLANE KICKBACK state (fairness mechanics, user-requested) - a plain earned/armed
        // boolean, not time-limited (real pinball kickbacks stay loaded until used, however long
        // that takes). Deliberately persists across a drain/relaunch (NOT reset by
        // resetBallToPlunger(), unlike skillShot/ballSave above) - it was earned through real
        // play (clearing the rollover-lane bank) and should stay earned until actually consumed
        // by an outlane roll or the game ends, same "survives a drain" treatment laneBank's own
        // lit state already gets.
        const kickback = { active: false };

        // Orbit shot state (one entry per side) - `armedAt` is the timestamp (performance.now()-
        // style ms) of the last valid entrance hit, or null if the entrance hasn't fired (or its
        // window already expired). A completion trigger only scores if armedAt is set and within
        // ORBIT_COMPLETION_WINDOW_MS - see handleTriggerHit()'s 'orbitCompletion' branch - so a
        // partial shot (entered, stalled, rolled back without reaching the top) can't score, and a
        // stale arm from a much earlier pass can't retroactively count a later, unrelated hit.
        const orbitState = { left: { armedAt: null }, right: { armedAt: null } };

        // VISION GATE capture state (see its own block comment near VISION_GATE_POS' declaration
        // for the full feature design). `active` is the single source of truth handleTriggerHit()
        // checks before starting a new capture - both a debounce layer on top of the trigger's
        // own cooldown, and what guarantees the ball can never be captured twice at once (so it
        // can never appear lost or duplicated). `ball` is deliberately a reference to the same
        // {mesh, aggregate, stuckTimeMs} shape createBall()/updateBallPhysics() already use, not
        // hardcoded to "the" global mainBall - startVisionGateCapture()/endVisionGateCapture()
        // both take a `ball` parameter and operate purely through it, so a future multiball
        // system could call them for whichever ball entered the gate without changing either
        // function. `colorTimers`/`sparkle` are just handles this file's own code needs to clean
        // up if a capture is cut short (see startNewGame()) rather than running to completion.
        const visionGate = { active: false, ball: null, colorTimers: [], sparkle: null };

        // Score-multiplier power-up state (board redesign) - `active` is the real source of truth
        // for whether the orb is currently hittable (checked in handleTriggerHit()), `timerMs`
        // counts down to either the next spawn (while hidden) or an unhit despawn (while active),
        // both advanced in updatePowerUp() below. scoreMultiplier is applied directly in
        // addScore().
        const powerUp = { active: false, timerMs: POWERUP_SPAWN_INTERVAL_MS, multiplierRemainingMs: 0 };
        let scoreMultiplier = 1;
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
            score += points * scoreMultiplier;
            setScore(score);
            if (score > backglass.state.highScore) {
                backglass.state.highScore = score;
                localStorage.setItem(highScoreKey, String(score));
            }
            backglass.redraw();
        }

        // Classic end-of-ball "bonus count" (bonus/multiplier subsystem, user-requested) - pays
        // ballBonus.points * ballBonus.multiplierX into the real score via addScore() (so high-
        // score tracking works exactly as it already does, no separate code path) as a rapid,
        // visible count-up on the backglass, then calls `onComplete` so handleDrain()'s normal
        // life/game-over flow continues. Called with the ball's already-accumulated bonus, before
        // anything resets it for the next ball.
        // Render-loop-driven state for the count-up (see updateBonusCount() below) - the same
        // "remaining-ms field, advanced by the render loop's own deltaMs" idiom every other
        // continuous effect in this file already uses (updateCameraEffects()'s shake/punch decay,
        // updatePowerUp(), updateDropTargetBank()), deliberately NOT an independent setTimeout
        // chain: pacing this way stays correct regardless of how much real wall-clock time a
        // given frame takes on a particular device, and it naturally pauses along with everything
        // else when isPaused is true, matching player expectation.
        const bonusCount = {
            active: false, total: 0, awarded: 0, multiplierX: 1,
            ticksRemaining: 0, remainingMs: 0, onComplete: null
        };

        // Kicks off the classic end-of-ball "bonus count": ballBonus.points * ballBonus.
        // multiplierX, paid into the real score via addScore() (so high-score tracking works
        // exactly as it already does) as a rapid, visible count-up on the backglass. Calls
        // `onComplete` once the whole sequence (including reduced-motion's single-step version)
        // has finished, so handleDrain()'s normal life/game-over flow can continue.
        function startBonusCount(onComplete) {
            const total = ballBonus.points * ballBonus.multiplierX;
            if (total <= 0) {
                onComplete();
                return;
            }
            if (window.SPIRITBALL_reducedMotion) {
                // Skip/accelerate per the request - the whole payout lands in one immediate step,
                // not a per-tick sequence. Still routed through updateBonusCount() below (with
                // ticksRemaining already at 0) rather than resolved synchronously here, so a
                // pause landing in the same instant can't skip the completion callback.
                addScore(total);
                backglass.showMessage('BONUS x' + ballBonus.multiplierX + ': ' + total.toLocaleString(), BONUS_COUNT_REDUCED_MOTION_MS);
                bonusCount.active = true;
                bonusCount.ticksRemaining = 0;
                bonusCount.remainingMs = BONUS_COUNT_REDUCED_MOTION_MS;
                bonusCount.onComplete = onComplete;
                return;
            }
            bonusCount.active = true;
            bonusCount.total = total;
            bonusCount.awarded = 0;
            bonusCount.multiplierX = ballBonus.multiplierX;
            bonusCount.ticksRemaining = BONUS_COUNT_TICKS;
            bonusCount.remainingMs = BONUS_COUNT_TICK_MS;
            bonusCount.onComplete = onComplete;
        }

        // Called every frame (render loop, gated by !isPaused like updatePowerUp()/
        // updateDropTargetBank()) while a count is running. `ticksRemaining <= 0` covers two
        // cases the same way: the reduced-motion single-step already ran in startBonusCount()
        // above, or the normal tick loop just finished its last tick and its "BONUS AWARDED"
        // dwell time has now elapsed - either way, time to finish.
        function updateBonusCount(deltaMs) {
            if (!bonusCount.active) return;
            bonusCount.remainingMs -= deltaMs;
            if (bonusCount.remainingMs > 0) return;

            if (bonusCount.ticksRemaining <= 0) {
                bonusCount.active = false;
                const onComplete = bonusCount.onComplete;
                bonusCount.onComplete = null;
                onComplete();
                return;
            }

            bonusCount.ticksRemaining--;
            const isLastTick = bonusCount.ticksRemaining <= 0;
            // The last tick absorbs whatever the division below rounded away, so the full
            // `total` always lands exactly rather than drifting off by a few points.
            const step = isLastTick ? (bonusCount.total - bonusCount.awarded) : Math.round(bonusCount.total / BONUS_COUNT_TICKS);
            bonusCount.awarded += step;
            addScore(step);
            playBonusTickSound();
            backglass.showMessage(
                isLastTick ? 'BONUS AWARDED' : 'BONUS x' + bonusCount.multiplierX + ': ' + bonusCount.awarded.toLocaleString(),
                isLastTick ? 500 : BONUS_COUNT_TICK_MS + 60
            );
            bonusCount.remainingMs = isLastTick ? 500 : BONUS_COUNT_TICK_MS;
        }

        // Power-up orb (board redesign): collectPowerUp() runs when the ball hits it while active
        // (see handleTriggerHit()); updatePowerUp() advances its spawn/despawn timer and the
        // multiplier countdown every frame (called from the render loop, gated by !isPaused &&
        // ballInPlay - no point spawning it or burning down an active window before the ball is
        // even launched).
        function collectPowerUp() {
            powerUp.active = false;
            obstacles.powerUpMesh.setEnabled(false);
            lampSystem.setLampMode('multiplier', LAMP_MODE.OFF);
            powerUp.timerMs = POWERUP_SPAWN_INTERVAL_MS;
            scoreMultiplier = POWERUP_MULTIPLIER;
            powerUp.multiplierRemainingMs = POWERUP_MULTIPLIER_DURATION_MS;
            backglass.state.multiplierActive = true;
            stats.powerUpsCollected++;
            backglass.showMessage(POWERUP_MULTIPLIER + 'X SCORE!', 1200);
            triggerCameraShake(150, 0.007);
            triggerCameraPunch(300, cameraForwardDir.scale(0.02));
            playPowerUpSound();
        }

        function updatePowerUp(deltaMs) {
            if (powerUp.multiplierRemainingMs > 0) {
                powerUp.multiplierRemainingMs -= deltaMs;
                if (powerUp.multiplierRemainingMs <= 0) {
                    powerUp.multiplierRemainingMs = 0;
                    scoreMultiplier = 1;
                    backglass.state.multiplierActive = false;
                    backglass.redraw();
                }
            }
            powerUp.timerMs -= deltaMs;
            if (powerUp.active) {
                if (powerUp.timerMs <= 0) {
                    powerUp.active = false;
                    obstacles.powerUpMesh.setEnabled(false);
                    lampSystem.setLampMode('multiplier', LAMP_MODE.OFF);
                    powerUp.timerMs = POWERUP_SPAWN_INTERVAL_MS;
                }
            } else if (powerUp.timerMs <= 0) {
                powerUp.active = true;
                obstacles.powerUpMesh.setEnabled(true);
                lampSystem.setLampMode('multiplier', LAMP_MODE.PULSE);
                powerUp.timerMs = POWERUP_ACTIVE_DURATION_MS;
            }
        }

        // VISION GATE - see its own block comment (near VISION_GATE_POS' declaration) for the
        // full design. Called from handleTriggerHit()'s 'visionGate' branch with the ball that
        // entered (mainBall today; written to take a `ball` parameter rather than close over
        // mainBall directly, so a future multiball system can reuse this unchanged).
        function startVisionGateCapture(ball) {
            const body = ball.aggregate.body;
            body.setLinearVelocity(BABYLON.Vector3.Zero());
            body.setAngularVelocity(BABYLON.Vector3.Zero());
            // Snap to the gate's own center at a slightly sunken height, reading as "held inside
            // the well" rather than resting on top of it - then go kinematic so nothing (gravity,
            // the tilt, a stray nearby collision) can move it until endVisionGateCapture() runs.
            // This is the "pause only that ball's movement, not the entire game" mechanism -
            // scene.physicsEnabled stays true throughout, so flippers/other geometry keep
            // stepping normally; only this one body stops responding to forces.
            ball.mesh.position.set(VISION_GATE_POS.x, 0.008, VISION_GATE_POS.z);
            body.setMotionType(BABYLON.PhysicsMotionType.ANIMATED);

            visionGate.active = true;
            visionGate.ball = ball;

            addScore(SCORE_VISION_GATE);
            stats.visionGateCaptures++;
            recordComboShot('visionGate'); // combo scoring (user-requested) - feeds 'COMET GATE'
            // Bonus/multiplier subsystem (user-requested) - a Vision Gate capture is a "major
            // shot," on top of (not instead of) the addScore() above.
            ballBonus.points += BONUS_MAJOR_SHOT_AMOUNT;
            // No MISSION_DEFS entry uses type 'visionGate' yet (this task only asks that the
            // feature be ABLE to participate in missions later) - progressMission() already no-ops
            // for any type the active mission isn't selected on, so calling it unconditionally
            // here costs nothing today and means a future mission definition needs zero changes
            // to this function to start working.
            progressMission('visionGate');
            backglass.showMessage('VISION GATE', VISION_GATE_SEQUENCE_MS - 100);

            triggerCameraShake(300, 0.008);
            triggerCameraPunch(400, cameraForwardDir.scale(0.012));
            playVisionGateSound();
            spawnHitBurst(scene, particleTexture, obstacles.visionGateMesh, highFidelity);
            // buildChakraSparkle() already no-ops (returns null) under reduced motion - no extra
            // guard needed here, just the null-check before disposing it later.
            visionGate.sparkle = buildChakraSparkle(scene, particleTexture, obstacles.visionGateMesh, highFidelity);

            // A brief scene-wide bloom boost - reusing the existing GlowLayer (see the doc's
            // "existing glow... systems" requirement) rather than standing up a second, separate
            // effect. Not gated by reduced-motion: this is a brightness change, not motion/
            // flashing, so it doesn't carry the same photosensitivity concern the color-cycle
            // below deliberately treats more strictly.
            glowLayer.intensity = restGlowIntensity + 0.4;

            // LOCKED freezes the lamp system's own control of this material - startVisionGateColorCycle()
            // below drives obstacles.visionGateMesh.material.emissiveColor directly for the
            // duration of the capture, and LOCKED guarantees updateLamps() never fights it.
            lampSystem.setLampMode('visionGate', LAMP_MODE.LOCKED);
            startVisionGateColorCycle();

            setTimeout(() => {
                // Same pendingDrainAction pattern used for the drain->reset delay: a plain JS
                // timer isn't gated by scene.physicsEnabled, so pausing mid-sequence must defer
                // the eject rather than let it fire invisibly underneath the pause overlay.
                if (isPaused) {
                    pendingVisionGateEject = endVisionGateCapture;
                } else {
                    endVisionGateCapture();
                }
            }, VISION_GATE_SEQUENCE_MS);
        }

        // Cycles the gate ring's emissive color through COLOR_CHAKRA for the "psychedelic"
        // reveal. Under reduced motion this is deliberately NOT just slowed (this file's usual
        // "ambient motion reduced, not eliminated" pattern, e.g. updateSaturnRotation()) - rapid
        // color flashing is a specific photosensitivity trigger, not general vestibular motion,
        // so it's replaced outright with one steady bright color instead of a dimmer cycle.
        function startVisionGateColorCycle() {
            const mat = obstacles.visionGateMesh.material;
            if (window.SPIRITBALL_reducedMotion) {
                mat.emissiveColor = COLOR_VISION_GATE.scale(1.3);
                return;
            }
            const steps = COLOR_CHAKRA.length;
            const stepMs = VISION_GATE_SEQUENCE_MS / steps;
            for (let i = 0; i < steps; i++) {
                const timer = setTimeout(() => {
                    mat.emissiveColor = COLOR_CHAKRA[i].scale(1.2);
                }, i * stepMs);
                visionGate.colorTimers.push(timer);
            }
        }

        // Ends an in-progress capture: restores the gate's rest-state visuals, cleans up the
        // sparkle particle system, and ejects the captured ball back into real (dynamic) physics.
        function endVisionGateCapture() {
            visionGate.colorTimers.forEach(clearTimeout);
            visionGate.colorTimers = [];
            lampSystem.setLampMode('visionGate', LAMP_MODE.ON); // hands control back from the capture's own bespoke color-cycle to the lamp system's normal rest look
            glowLayer.intensity = restGlowIntensity;

            if (visionGate.sparkle) {
                const sparkle = visionGate.sparkle;
                sparkle.stop();
                setTimeout(() => {
                    if (!sparkle.isDisposed) sparkle.dispose();
                }, (sparkle.maxLifeTime + 0.15) * 1000);
                visionGate.sparkle = null;
            }

            const ball = visionGate.ball;
            visionGate.ball = null;
            visionGate.active = false;
            // Defensive only - the ball is kinematic and off-screen state changes (drain, new
            // game) can't reach a frozen body, but startNewGame() clears visionGate.active/ball
            // directly on a hard reset, so this can legitimately be null if that raced ahead of
            // this timer somehow.
            if (!ball || !ball.aggregate.body) return;

            const body = ball.aggregate.body;
            // Repositioned back toward -Z before going dynamic again - the gate's own open mouth
            // (the 3 guard posts only cover left/right/far, see buildObstacles()), and already
            // outside the trigger's own radius (0.015m) so the instant physics resumes, the ball
            // isn't still sitting inside the volume it just fired. Checked clear of both nearby
            // obstacles at this exact offset: ~0.067m from the boss bumper's center (needs >
            // 0.0435m combined radii) and ~0.046m from the power-up orb's (needs > 0.0295m) -
            // real margin on both, unlike ejecting toward Saturn/the orbit rail's much tighter
            // quarters on the other sides of this gate.
            ball.mesh.position.set(VISION_GATE_POS.x, BALL_REST_Y_M, VISION_GATE_POS.z - 0.03);
            body.setMotionType(BABYLON.PhysicsMotionType.DYNAMIC);
            body.setLinearVelocity(new BABYLON.Vector3(-0.05, 0, -VISION_GATE_EJECT_SPEED_MS));
            clampBodySpeed(body, MAX_BALL_SPEED_MS);
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
        // ('bumper'/'comet'/'lane') - only counts toward an active mission's OWN type, so
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
            // Bug fix (playtest audit): at max rank (Fleet Admiral), mission.rank was already
            // capped by this same Math.min() below, but the message always read "RANK UP: Fleet
            // Admiral" regardless - misleading every time a mission completed after reaching max
            // rank, since no rank-up actually happened. Confirmed via a forced-max-rank Playwright
            // test. Now only shown when the rank index genuinely changed.
            const rankedUp = mission.rank < RANK_NAMES.length - 1;
            mission.rank = Math.min(mission.rank + 1, RANK_NAMES.length - 1);
            stats.missionsCompleted++;
            backglass.state.missionName = null;
            backglass.state.missionProgress = 0;
            backglass.state.rank = RANK_NAMES[mission.rank];
            addScore(MISSION_COMPLETE_BONUS);
            // Bonus/multiplier subsystem (user-requested) - a "substantial" contribution to the
            // hidden end-of-ball pool, on top of (not instead of) the immediate MISSION_COMPLETE_
            // BONUS above. Doesn't touch mission/rank state or messaging at all - purely additive.
            ballBonus.points += BONUS_MISSION_COMPLETE_AMOUNT;
            backglass.showMessage(rankedUp ? 'RANK UP: ' + RANK_NAMES[mission.rank] : 'MISSION COMPLETE!', 1600);
            // A stronger beat than any regular hit's - completing a mission and ranking up is the
            // single biggest moment the game currently has, deserves to read as one.
            triggerCameraShake(500, 0.01);
            triggerCameraPunch(500, new BABYLON.Vector3(0, 0.02, -0.03));
            playRankUpSound();
            vibrateDevice(HAPTIC_MISSION_COMPLETE_PATTERN); // differentiated haptics (user-requested) - a short multi-pulse "fanfare", distinct from every single-tick haptic elsewhere
            // Drop-target bank reset (user-requested upgrade) - a mission completing is one of
            // the transitions the bank is required to reset on, regardless of which targets are
            // currently down (a target dropped toward this mission doesn't need to stay down once
            // the mission it helped select/finish is over).
            resetDropTargetBank();
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
        function pulseMesh(mesh, scale = 1.3) {
            const original = mesh.scaling.clone();
            mesh.scaling.scaleInPlace(scale);
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

        // Physical hits: comet/slingshots already bounce the ball via restitution (set in
        // buildObstacles()) - for those kinds this only adds the score/cooldown/feedback layer on
        // top, it does NOT set the ball's velocity by hand the way the 2D version's hitSatellite()/
        // hitSlingshot() did. That manual angle-based bounce was a workaround for Arcade Physics
        // circles not imparting real force on overlap; real rigid-body contact response in Havok
        // makes it unnecessary, not just redundant - see 04-*.md's flipper implementation note for
        // the same reasoning applied to flippers. Bumpers are the one deliberate exception: real
        // pop bumpers actively fire the ball away rather than just reflecting it, so the 'bumper'
        // branch below adds a real, controlled velocity kick on top of the restitution bounce via
        // applyBumperKick() - see its comment for how that kick is kept bounded.
        function applyBumperKick(mesh) {
            const body = mainBall.aggregate.body;
            if (!body) return;

            // Horizontal (X/Z) direction from the bumper's center to the ball's current position -
            // "horizontal" deliberately excludes Y so the kick can't launch the ball vertically off
            // the table, just push it away across the playfield the way a real pop bumper does.
            const dx = mainBall.mesh.position.x - mesh.position.x;
            const dz = mainBall.mesh.position.z - mesh.position.z;
            const horizontalDist = Math.sqrt(dx * dx + dz * dz);
            // Degenerate case (ball reported dead-center over the bumper, horizontally) - no
            // well-defined push direction, so skip the kick rather than divide by ~0. The
            // restitution bounce and normal scoring/feedback still happen either way.
            if (horizontalDist < 1e-4) return;
            const dirX = dx / horizontalDist;
            const dirZ = dz / horizontalDist;

            // Added to the ball's existing velocity, not substituted for it - a fast incoming shot
            // keeps carrying its own momentum through the hit instead of every hit collapsing to
            // the same fixed exit speed regardless of how the ball arrived (a glancing graze gets a
            // gentler net result than a square hit at speed, matching how a real pop bumper feels).
            const v = body.getLinearVelocity();
            body.setLinearVelocity(new BABYLON.Vector3(
                v.x + dirX * BUMPER_KICK_SPEED_MS,
                v.y,
                v.z + dirZ * BUMPER_KICK_SPEED_MS
            ));

            // Re-clamped through the same ceiling updateBallPhysics() enforces every frame (see
            // clampBodySpeed()'s comment), applied immediately rather than waiting for next frame -
            // this is what actually bounds the kick: no incoming speed, kick magnitude, or run of
            // repeated bumper hits (each individual bumper is still separately rate-limited by its
            // own COOLDOWN_BUMPER_MS below) can ever push the ball past MAX_BALL_SPEED_MS.
            clampBodySpeed(body, MAX_BALL_SPEED_MS);
        }

        // Slingshot active kick - same "add to existing velocity, then clamp" shape as
        // applyBumperKick() above, but with two separately-tunable directional components (see
        // SLINGSHOT_KICK_SPEED_MS/SLINGSHOT_KICK_UPTABLE_BIAS_MS's comment for why the up-table
        // bias can't just be folded into the ball-relative direction the way the bumper kick is).
        function applySlingshotKick(mesh) {
            const body = mainBall.aggregate.body;
            if (!body) return;

            const dx = mainBall.mesh.position.x - mesh.position.x;
            const dz = mainBall.mesh.position.z - mesh.position.z;
            const horizontalDist = Math.sqrt(dx * dx + dz * dz);
            if (horizontalDist < 1e-4) return; // ball reported dead-center over the slingshot - no well-defined push direction, skip rather than divide by ~0
            const dirX = dx / horizontalDist;
            const dirZ = dz / horizontalDist;

            // Added to the ball's existing velocity, not substituted for it, same reasoning as
            // applyBumperKick(). The up-table bias is a flat addition, not scaled by direction -
            // it's what guarantees a positive net Z push regardless of approach angle (see the
            // constants' comment).
            const v = body.getLinearVelocity();
            body.setLinearVelocity(new BABYLON.Vector3(
                v.x + dirX * SLINGSHOT_KICK_SPEED_MS,
                v.y,
                v.z + dirZ * SLINGSHOT_KICK_SPEED_MS + SLINGSHOT_KICK_UPTABLE_BIAS_MS
            ));

            // Same shared safety ceiling as the bumper kick - see clampBodySpeed()'s comment.
            // Combined with this branch only ever running once per COOLDOWN_SLINGSHOT_MS per
            // slingshot (the isOnCooldown()/setCooldown() gate in handlePhysicalHit() below), a
            // ball resting against a slingshot can never accumulate velocity frame over frame:
            // Havok's own per-frame contact response isn't touched here, and this kick only fires
            // on the discrete COLLISION_STARTED event through the cooldown gate, not every frame
            // of continued contact.
            clampBodySpeed(body, MAX_BALL_SPEED_MS);
        }

        // Fast "rubber snap" visual, layered on top of the shared pulseMesh() flash already used
        // for every obstacle kind's hit feedback (kept as-is below - see the "reuse existing VFX"
        // requirement). Distinct from pulseMesh() in two ways: it's a directional squash-and-
        // stretch along the rubber face's own local width instead of a uniform scale-up, and it
        // brightens the slingshot's own decorative housing (its per-instance material clone, see
        // buildObstacles()) rather than the collider mesh - together reading as the rubber face
        // physically recoiling, not just a generic hit flash. Snaps back faster (90ms) than
        // pulseMesh()'s 100ms, matching the "fast" spec.
        function snapSlingshot(mesh) {
            const housing = mesh.metadata.housing;

            const originalScale = mesh.scaling.clone();
            mesh.scaling.x = originalScale.x * 1.5;
            mesh.scaling.z = originalScale.z * 0.6;

            const housingMat = housing.material;
            const originalHousingEmissive = housingMat.emissiveColor ? housingMat.emissiveColor.clone() : null;
            if (originalHousingEmissive) {
                housingMat.emissiveColor = new BABYLON.Color3(1, 0.6, 1); // bright magenta-white, echoing the slingshot's own magenta identity rather than pulseMesh()'s plain white
            }

            setTimeout(() => {
                if (!mesh.isDisposed()) mesh.scaling.copyFrom(originalScale);
                if (originalHousingEmissive && !housing.isDisposed()) housingMat.emissiveColor.copyFrom(originalHousingEmissive);
            }, 90);
        }

        // Marks a target dropped (the real trigger/collision gate, checked in handleTriggerHit()
        // below) and starts its visual sink - see dropTargetBank's own block comment above for why
        // these are two separate pieces of state rather than one. The trigger volume itself never
        // moves (buildObstacles()), so nothing here needs to touch physics.
        function dropMissionTarget(index) {
            const target = dropTargetBank[index];
            target.dropped = true;
            target.animMs = TARGET_DROP_ANIM_MS;
            lampSystem.setLampMode('missionTarget' + index, LAMP_MODE.LOCKED);
        }

        // Pops every target in the bank back up and relights its lamp - instant, not animated,
        // matching every other per-run reset in this file (mission/orbitState/powerUp/visionGate
        // in startNewGame() below, none of which animate back to their rest state either).
        // Called from the three transitions the bank is required to reset on: a drain that
        // doesn't end the game and a fresh new game (both via resetBallToPlunger()'s two call
        // sites), and completeMission().
        function resetDropTargetBank() {
            dropTargetBank.forEach((target, i) => {
                target.dropped = false;
                target.animMs = 0;
                obstacles.missionTargetMeshes[i].position.y = TARGET_RAISED_Y_M;
                lampSystem.setLampMode('missionTarget' + i, LAMP_MODE.ON);
            });
        }

        // Per-frame visual-only tween, driven by the render loop's deltaMs like every other
        // continuous effect here (updateSaturnRotation()/updatePowerUp()). Purely cosmetic - a
        // target already stopped scoring the instant dropMissionTarget() set `dropped`, well
        // before this finishes sinking the mesh.
        function updateDropTargetBank(deltaMs) {
            dropTargetBank.forEach((target, i) => {
                if (target.animMs <= 0) return;
                target.animMs = Math.max(0, target.animMs - deltaMs);
                const progress = 1 - target.animMs / TARGET_DROP_ANIM_MS;
                obstacles.missionTargetMeshes[i].position.y =
                    BABYLON.Scalar.Lerp(TARGET_RAISED_Y_M, TARGET_DROPPED_Y_M, progress);
            });
        }

        // Recolors one re-entry lane to its lit or unlit rest look, via the centralized lamp system.
        function setLaneLit(index, lit) {
            lampSystem.setLampMode('reentryLane' + index, lit ? LAMP_MODE.ON : LAMP_MODE.OFF);
        }

        // Un-lights every lane for another cycle - called after LANE_BANK_RESET_DELAY_MS from a
        // completed bank (see handleTriggerHit()'s 'reentryLane' branch) and unconditionally from
        // startNewGame(), same "per-run state" treatment as dropTargetBank/mission/orbitState.
        function resetLaneBank() {
            laneBank.forEach((lane, i) => {
                lane.lit = false;
                setLaneLit(i, false);
            });
        }

        // Optional "lane change" skill mechanic (classic pinball - a flipper press rotates which
        // lanes are lit, letting a player shift their progress into a more useful pattern without
        // needing to physically hit anything). Rotates the lit/unlit PATTERN circularly by one
        // position; doesn't change how many lanes are lit, just which ones. Call sites (the four
        // flipper-input handlers below) already gate this to the actual off->on press edge, same
        // guard activateFlipper() uses for its own one-shot sound.
        function rotateLaneLamps(dir) {
            if (!ballInPlay) return;
            const n = laneBank.length;
            const previousLit = laneBank.map((lane) => lane.lit);
            laneBank.forEach((lane, i) => {
                lane.lit = previousLit[(((i - dir) % n) + n) % n];
                setLaneLit(i, lane.lit);
            });
        }

        // Advances one COMBO_DEFS entry's progress cursor against a new shot `type` - the one
        // small generic matcher every definition shares (see COMBO_DEFS' block comment for why
        // this isn't a per-combo FSM). Expiry is checked first: a stalled chain (no matching step
        // within its own stepWindowMs) cleanly resets to idle BEFORE this event is evaluated
        // against it, which for free also lets a late-but-otherwise-matching event start a brand
        // new chain from step 0 in the same call, with no separate case needed for that.
        function advanceCombo(def, prog, type, now) {
            if (prog.index > 0 && now - prog.lastAtMs > def.stepWindowMs) {
                prog.index = 0;
            }
            const expected = def.steps[prog.index];
            const matches = Array.isArray(expected) ? expected.includes(type) : expected === type;
            if (!matches) return;
            prog.index++;
            prog.lastAtMs = now;
            if (prog.index >= def.steps.length) {
                fireCombo(def);
                prog.index = 0;
            }
        }

        // Called once per already-scored "major shot" event - see each call site below (orbit
        // completion, comet hit, Vision Gate capture, bumper hit, lane-bank completion). Every
        // call site sits behind that hit's own existing isOnCooldown()/setCooldown() gate (or,
        // for the bank/gate events, their own one-shot completion guards), so a ball resting or
        // jittering in one trigger can never log the same shot twice - this function never needs
        // its own separate debounce.
        function recordComboShot(type) {
            const now = performance.now();
            COMBO_DEFS.forEach((def, i) => advanceCombo(def, comboProgress[i], type, now));
        }

        // A COMBO_DEFS entry just completed. Tracks a SEPARATE thing from that entry's own
        // progress: chaining multiple combos back to back escalates comboStreak.tier (displayed
        // as "COMBO x2", "x3"...), capped at COMBO_MAX_TIER and reset to 1 if too long passes
        // since the last one. Camera feedback is deliberately fixed regardless of tier ("avoid
        // excessive screen flash/camera shake") - only score, sound, and the message text scale.
        function fireCombo(def) {
            const now = performance.now();
            comboStreak.tier = (now - comboStreak.lastAtMs <= COMBO_CHAIN_WINDOW_MS)
                ? Math.min(comboStreak.tier + 1, COMBO_MAX_TIER)
                : 1;
            comboStreak.lastAtMs = now;

            addScore(COMBO_BASE_SCORE * comboStreak.tier);
            stats.combosCompleted++;
            stats.comboMaxTier = Math.max(stats.comboMaxTier, comboStreak.tier);
            backglass.showMessage(def.name + ' COMBO x' + comboStreak.tier, COMBO_MESSAGE_MS);
            triggerCameraShake(100, 0.0035);
            playComboSound(comboStreak.tier);
        }

        // Per-ball reset (user-requested) - combos are a live-play chaining mechanic scoped to
        // the ball currently in play, same as ballBonus above; a stalled chain or an escalated
        // tier has no business surviving into the next ball. Called from both of
        // resetBallToPlunger()'s two "a new ball is starting" call sites (a continuing drain and
        // startNewGame()), same pattern as resetDropTargetBank()/resetLaneBank(). Doesn't touch
        // stats.combosCompleted/comboMaxTier - those are whole-game totals, reset only by
        // startNewGame()'s own stats block, same as every other stat.
        function resetCombos() {
            comboProgress.forEach((prog) => { prog.index = 0; prog.lastAtMs = 0; });
            comboStreak.tier = 0;
            comboStreak.lastAtMs = 0;
        }

        // BLINK while active - a real "shoot now" window, matching a classic machine's blinking
        // time-limited insert rather than a plain steady light.
        function setSkillShotLampsLit(lit) {
            obstacles.skillShotLampMeshes.forEach((_, i) => {
                lampSystem.setLampMode('skillShot' + i, lit ? LAMP_MODE.BLINK : LAMP_MODE.OFF);
            });
        }

        // Called once, from handleLaunchRelease() - "award once per ball" starts here, since this
        // is the only place that ever sets `active` true.
        function armSkillShot() {
            skillShot.active = true;
            skillShot.remainingMs = SKILL_SHOT_WINDOW_MS;
            skillShot.bestLaneIndex = null;
            setSkillShotLampsLit(true);
        }

        // Closes the window - from a timeout, or the ball entering normal play - and awards
        // whichever lane ended up best (see skillShot's own block comment for why a lane touch
        // only upgrades bestLaneIndex instead of resolving immediately). Silent if no lane was
        // ever reached (bestLaneIndex stays null): a plain timeout/normal-play exit with no
        // skill-shot contact at all is a routine, expected outcome on most launches, not a
        // failure worth announcing - the lamps simply going dark is the whole cue for that case.
        function endSkillShot() {
            if (!skillShot.active) return;
            skillShot.active = false;
            setSkillShotLampsLit(false);
            if (skillShot.bestLaneIndex !== null) {
                const laneDef = SKILL_SHOT_LANES[skillShot.bestLaneIndex];
                addScore(laneDef.points);
                stats.skillShotsAwarded++;
                // Bonus/multiplier subsystem (established pattern) - a skill shot is a deliberate
                // "major shot," on top of (not instead of) the addScore() above.
                ballBonus.points += BONUS_MAJOR_SHOT_AMOUNT;
                backglass.showMessage(laneDef.label + '! +' + laneDef.points, 1200);
                triggerCameraShake(150, 0.004);
                triggerCameraPunch(200, cameraForwardDir.scale(0.012));
                playSkillShotSound(skillShot.bestLaneIndex);
            }
            skillShot.bestLaneIndex = null;
        }

        // Hard reset (dev "RESET BALL TO PLUNGER" button, a drain, or a new game via
        // resetBallToPlunger() below) - deliberately does NOT award even if a lane had already
        // been reached; the ball never got to actually finish that shot.
        function forceResetSkillShot() {
            skillShot.active = false;
            skillShot.bestLaneIndex = null;
            skillShot.remainingMs = 0;
            setSkillShotLampsLit(false);
        }

        function updateSkillShot(deltaMs) {
            if (!skillShot.active) return;
            skillShot.remainingMs -= deltaMs;
            if (skillShot.remainingMs <= 0) endSkillShot();
        }

        // BLINK while active - a real time-limited window, same reasoning as the skill-shot lamps.
        function setBallSaveLampLit(lit) {
            lampSystem.setLampMode('ballSave', lit ? LAMP_MODE.BLINK : LAMP_MODE.OFF);
        }

        // Called once per launch (handleLaunchRelease()) - see ballSave's own block comment for
        // why `usedThisLife` can block this from re-arming.
        function armBallSave() {
            if (ballSave.usedThisLife) return;
            ballSave.active = true;
            ballSave.remainingMs = BALL_SAVE_WINDOW_MS;
            setBallSaveLampLit(true);
        }

        // Natural expiry only (called from the render loop below) - quietly turns the window off,
        // same "no announcement for a routine, expected outcome" reasoning as skillShot's own
        // timeout. Consuming the save (an actual drain-within-window) is handled directly in
        // handleDrain() instead, since it needs to short-circuit that function's normal life-loss
        // path entirely, not just flip a flag here.
        function updateBallSave(deltaMs) {
            if (!ballSave.active) return;
            ballSave.remainingMs -= deltaMs;
            if (ballSave.remainingMs <= 0) {
                ballSave.active = false;
                setBallSaveLampLit(false);
            }
        }

        // Steady ON, not BLINK - unlike ball save/skill shot, kickback isn't time-boxed; it stays
        // armed until actually used, so a blink would misleadingly suggest it's about to expire.
        function setKickbackLampLit(lit) {
            lampSystem.setLampMode('kickback', lit ? LAMP_MODE.ON : LAMP_MODE.OFF);
        }

        // Earned via an existing gameplay achievement (the 'reentryLane' bank-complete branch
        // below calls this) - a no-op if already armed, so clearing the bank again while a
        // kickback is still loaded doesn't stack or re-announce anything. Returns whether it
        // actually newly armed, so the caller can fold that into its own message only when true.
        function activateKickback() {
            if (kickback.active) return false;
            kickback.active = true;
            setKickbackLampLit(true);
            return true;
        }

        // Fixed-direction kick (unlike applyBumperKick()/applySlingshotKick(), which derive their
        // direction from the ball's position relative to a movable contact point) - the outlane
        // itself never moves, so "which way is inward" is just KICKBACK_SIDE's own mirror sign,
        // looked up from SIDE_LANES rather than duplicated as a second hardcoded value.
        function applyKickback() {
            const body = mainBall.aggregate.body;
            if (!body) return;
            const mirror = SIDE_LANES.find((l) => l.side === KICKBACK_SIDE).mirror;
            const v = body.getLinearVelocity();
            body.setLinearVelocity(new BABYLON.Vector3(
                v.x - mirror * KICKBACK_INWARD_SPEED_MS,
                v.y,
                v.z + KICKBACK_UPTABLE_BIAS_MS
            ));
            // Same shared safety ceiling every other active kick (bumper/slingshot) is re-clamped
            // through - see clampBodySpeed()'s comment.
            clampBodySpeed(body, MAX_BALL_SPEED_MS);
        }

        function handlePhysicalHit(mesh) {
            const meta = mesh.metadata;
            if (!meta) return;
            // Upper-lane skill shot (user-requested): any real contact other than a structural
            // wall means the ball has left its clean post-launch arc and entered normal play -
            // close the window (awarding the best lane reached, if any - see endSkillShot()).
            // Checked before the cooldown gate below on purpose: even an on-cooldown hit (e.g.
            // grazing a bumper mid-cooldown) is still evidence normal play has started. 'wall' is
            // exempt - guide rails/dividers are structural, not a deliberate shot, and a clean
            // skill-shot launch can legitimately graze one.
            if (skillShot.active && meta.kind !== 'wall') endSkillShot();
            if (isOnCooldown(mesh)) return;
            if (meta.kind === 'bumper') {
                setCooldown(mesh, COOLDOWN_BUMPER_MS);
                // Board redesign: the boss bumper (index 0, see buildObstacles()) is worth more
                // and gets its own message/pitch, otherwise identical handling.
                const points = meta.boss ? SCORE_BOSS_BUMPER : SCORE_ATTACK_BUMPER;
                addScore(points);
                stats.bumperHits++;
                recordComboShot('bumper'); // combo scoring (user-requested) - feeds 'TRIPLE BUMPER'
                applyBumperKick(mesh);
                // Feedback bumped slightly (pulse scale, shake, sound volume) above the shared
                // defaults now that bumpers actively kick the ball - the hit should read as a
                // touch punchier than a passive bounce, without changing scoring or any other
                // obstacle kind's feedback (all other pulseMesh()/playHitSound() call sites are
                // untouched, defaulting back to their original 1.3x/0.14 values).
                pulseMesh(mesh, 1.4);
                spawnHitBurst(scene, particleTexture, mesh, highFidelity);
                backglass.showMessage('+' + points, 700); // matches hitAttackBumper()'s showPopup(`+${baseScore}`, ...)
                triggerCameraShake(130, meta.boss ? 0.009 : 0.007); // was 120/0.008/0.006 - a bit stronger, matching the new active-kick feel
                playBumperSound(meta.boss); // pop-bumper solenoid layer, distinct from the generic playHitSound()
                vibrateDevice(HAPTIC_BUMPER_MS); // differentiated haptics (user-requested) - a touch punchier tick than the flipper's, matching the punchier sound/shake above
                progressMission('bumper');
            } else if (meta.kind === 'comet') {
                setCooldown(mesh, COOLDOWN_COMET_MS);
                addScore(SCORE_COMET);
                stats.cometHits++;
                recordComboShot('comet'); // combo scoring (user-requested) - feeds 'COMET GATE'
                pulseMesh(mesh);
                spawnHitBurst(scene, particleTexture, mesh, highFidelity);
                backglass.showMessage('COMET!', 900);
                triggerCameraShake(120, 0.005); // matches hitSatellite()'s cameraShake(120, 0.005)
                playHitSound(880);
                progressMission('comet');
            } else if (meta.kind === 'saturn') {
                // Board redesign: the giant Saturn centerpiece - the single biggest non-mission
                // scoring hit on the board (SCORE_SATURN), with a correspondingly bigger camera
                // beat than any regular obstacle. Not mission-tied (there's no 4th mission-target
                // object for it to belong to) - a standalone "boss" bonus, same spirit as the
                // bumper cluster's own boss bumper above.
                setCooldown(mesh, COOLDOWN_SATURN_MS);
                addScore(SCORE_SATURN);
                stats.saturnHits++;
                pulseMesh(mesh);
                spawnHitBurst(scene, particleTexture, mesh, highFidelity);
                backglass.showMessage('SATURN! +' + SCORE_SATURN, 1100);
                triggerCameraShake(200, 0.009);
                triggerCameraPunch(300, cameraForwardDir.scale(0.015));
                playSaturnHitSound();
                // Bonus/multiplier subsystem (user-requested) - a "major shot," on top of (not
                // instead of) the addScore() above. Silent until the end-of-ball bonus count.
                ballBonus.points += BONUS_MAJOR_SHOT_AMOUNT;
            } else if (meta.kind === 'slingshot') {
                setCooldown(mesh, COOLDOWN_SLINGSHOT_MS);
                addScore(SCORE_SLINGSHOT);
                applySlingshotKick(mesh);
                pulseMesh(mesh);
                snapSlingshot(mesh); // extra "rubber snap" flourish on top of the shared pulseMesh() flash - see its comment
                spawnHitBurst(scene, particleTexture, mesh, highFidelity);
                backglass.showMessage('+' + SCORE_SLINGSHOT, 600);
                triggerCameraShake(120, 0.005); // matches hitSlingshot()'s cameraShake(120, 0.005)
                playSlingshotSound(); // slingshot snap layer, distinct from the generic playHitSound()
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
            // Upper-lane skill shot (user-requested) - same "any real contact ends the window"
            // reasoning as handlePhysicalHit()'s guard; 'skillShotLane' is exempt since touching
            // one only ever upgrades the pending result (its own branch below), never closes the
            // window by itself.
            if (skillShot.active && meta.kind !== 'skillShotLane') endSkillShot();
            if (meta.kind === 'drainZone') {
                handleDrain();
                return;
            }
            if (isOnCooldown(mesh)) return;
            if (meta.kind === 'skillShotLane') {
                // Doesn't score or close the window here - see skillShot's own block comment for
                // why: the three lanes sit side by side and the ball always crosses them in the
                // same order, so a shot that carries far enough legitimately touches more than
                // one. Only upgrade to this lane if it's worth more than whatever's pending, then
                // acknowledge the touch with a brief flash (stays lit, doesn't dim - the window
                // is still open) rather than the full award feedback, which only fires once,
                // in endSkillShot(), when the window actually closes.
                if (!skillShot.active) return;
                if (skillShot.bestLaneIndex === null || SKILL_SHOT_LANES[meta.index].points > SKILL_SHOT_LANES[skillShot.bestLaneIndex].points) {
                    skillShot.bestLaneIndex = meta.index;
                }
                lampSystem.flashLamp('skillShot' + meta.index, 150, new BABYLON.Color3(1, 1, 1));
            } else if (meta.kind === 'missionTarget') {
                // Drop-target bank upgrade: the trigger volume never moves once a target drops
                // (see buildObstacles()'s comment - only the flag mesh sinks, in
                // updateDropTargetBank()), so the ball can keep overlapping a dropped target's
                // trigger indefinitely. dropTargetBank[].dropped is the real "can this still
                // score" gate, checked here instead of relying on the cooldown alone -
                // COOLDOWN_MISSION_TARGET_MS below still debounces the single valid hit itself
                // (rapid multi-frame overlap on first contact), same as it always did.
                if (dropTargetBank[meta.index].dropped) return;
                setCooldown(mesh, COOLDOWN_MISSION_TARGET_MS);
                addScore(SCORE_MISSION_TARGET);
                stats.targetHits++;
                pulseMesh(mesh);
                spawnHitBurst(scene, particleTexture, mesh, highFidelity);
                triggerCameraShake(60, 0.002); // matches hitMissionTarget()'s cameraShake(60, 0.002)
                playTargetClackSound(); // target/drop-target clack layer, distinct from the generic playHitSound()
                dropMissionTarget(meta.index);
                // hitMissionTarget() in ../index.js shows "Selected: {missionName}" here - now a
                // real mission-select state exists (improvement-prompts/05-*.md): an idle target
                // hit selects+starts this index's mission; a hit while one is already active is
                // just a normal scored hit (matches the original - selecting doesn't interrupt).
                if (mission.state === 'idle') {
                    startMission(meta.index);
                } else {
                    backglass.showMessage('TARGET!', 700);
                }
                // Bank-complete check, after the above so its message/feedback lands last (the
                // more significant beat) - see SCORE_TARGET_BANK_COMPLETE's comment for why this
                // stays fully independent of mission.progress/completeMission().
                if (dropTargetBank.every((t) => t.dropped)) {
                    addScore(SCORE_TARGET_BANK_COMPLETE);
                    stats.targetBankCompletions++;
                    backglass.showMessage('TARGET BANK CLEARED!', 1200);
                    triggerCameraShake(250, 0.005);
                    triggerCameraPunch(250, new BABYLON.Vector3(0, 0.015, -0.02));
                    playTargetBankCompleteSound();
                }
            } else if (meta.kind === 'reentryLane') {
                setCooldown(mesh, COOLDOWN_REENTRY_LANE_MS);
                addScore(SCORE_REENTRY_LANE);
                stats.laneHits++;
                // Rollover-lane bank upgrade: only an unlit lane actually lights (and counts
                // toward the bank) - an already-lit lane still scores the hit above but doesn't
                // relight or recount, matching the "passing through an unlit lane lights it"
                // requirement. The recolor - when it happens - MUST run before pulseMesh() below,
                // same ordering constraint the original persistent-recolor comment always had:
                // pulseMesh() captures whatever emissiveColor is current when it's called and
                // restores exactly that after its 100ms flash, so recoloring after would get
                // silently clobbered back to the old color by that restore.
                const newlyLit = !laneBank[meta.index].lit;
                if (newlyLit) {
                    laneBank[meta.index].lit = true;
                    setLaneLit(meta.index, true);
                }
                pulseMesh(mesh);
                // After the recolor, not before - the burst should match the new lit-green state.
                spawnHitBurst(scene, particleTexture, mesh, highFidelity);
                backglass.showMessage('RE-ENTRY!', 800);
                triggerCameraShake(80, 0.003); // matches hitReentryLane()'s cameraShake(80, 0.003)
                playRolloverClickSound(990); // rollover switch click layer, distinct from the generic playHitSound()
                // Unchanged from before this upgrade - still feeds the 'RE-ENTRY CIRCUIT' mission
                // on every scoring hit, lit or not. Kept fully separate from the bank-complete
                // check below (see laneBank's own block comment for why).
                progressMission('lane');
                if (newlyLit && laneBank.every((lane) => lane.lit)) {
                    addScore(SCORE_LANE_BANK_COMPLETE);
                    stats.laneBankCompletions++;
                    recordComboShot('laneBankComplete'); // combo scoring (user-requested) - feeds 'BANK RUSH'
                    // Bonus/multiplier subsystem (user-requested) - a cleared rollover bank is
                    // this game's "advance the bonus multiplier" shot, the traditional pinball
                    // role for a lit-lane bank. Capped at BONUS_MULTIPLIER_MAX, not reset by
                    // completing the bank again - only a drain (via startBonusCount()) or a new
                    // game/ball resets it back to 1X.
                    ballBonus.multiplierX = Math.min(ballBonus.multiplierX + 1, BONUS_MULTIPLIER_MAX);
                    backglass.state.bonusMultiplierX = ballBonus.multiplierX;
                    // Outlane kickback (fairness mechanics, user-requested) - "let the player
                    // earn/activate it through an existing gameplay achievement such as a
                    // rollover-bank completion." Folded into the same message rather than a
                    // second showMessage() call (which would just silently overwrite this one -
                    // see showMessage()'s own comment), and only when it actually newly armed -
                    // no point announcing "KICKBACK!" every single bank clear once it's already
                    // loaded and waiting to be used.
                    const kickbackArmed = activateKickback();
                    backglass.showMessage(
                        'LANE BANK COMPLETE! BONUS ' + ballBonus.multiplierX + 'X' + (kickbackArmed ? ' + KICKBACK!' : ''),
                        1200
                    );
                    triggerCameraShake(280, 0.006);
                    triggerCameraPunch(280, new BABYLON.Vector3(0, 0.018, -0.022));
                    playLaneBankCompleteSound();
                    setTimeout(resetLaneBank, LANE_BANK_RESET_DELAY_MS);
                }
            } else if (meta.kind === 'inlane' || meta.kind === 'outlane') {
                // Not mission-tied (unlike 'reentryLane' above, whose 'lane' mission type belongs
                // specifically to the top-of-table reentry lanes) - see SIDE_LANES' block comment
                // for why these stay a fully separate mechanic.
                const isOutlane = meta.kind === 'outlane';
                setCooldown(mesh, COOLDOWN_SIDE_LANE_MS);
                const points = isOutlane ? SCORE_OUTLANE : SCORE_INLANE;
                addScore(points);
                if (isOutlane) stats.outlaneHits++; else stats.inlaneHits++;
                pulseMesh(mesh);
                lampSystem.flashLamp(meta.lampId, 220, COLOR_LANE_LAMP);
                spawnHitBurst(scene, particleTexture, mesh, highFidelity);
                backglass.showMessage((isOutlane ? 'OUTLANE! +' : 'INLANE! +') + points, 700);
                triggerCameraShake(70, isOutlane ? 0.003 : 0.0025); // a modest rollover beat, not a collision - outlane a touch stronger, it's the more consequential of the two
                // Rollover switch click layer, distinct from the generic playHitSound() - lower
                // pitch for the outlane, matching the existing "different obstacle kinds get
                // different pitches" convention.
                playRolloverClickSound(isOutlane ? 430 : 600);
                // Outlane kickback (fairness mechanics, user-requested) - on top of (not instead
                // of) the normal outlane scoring above, only for the one designated side
                // (KICKBACK_SIDE) and only while armed. Overwrites the OUTLANE! message just
                // shown - the bigger event wins the visible text, same precedent as every other
                // "two things happened on one hit" case in this file (e.g. the bank-complete
                // check right above).
                if (isOutlane && meta.side === KICKBACK_SIDE && kickback.active) {
                    kickback.active = false;
                    setKickbackLampLit(false);
                    stats.kickbacksUsed++;
                    applyKickback();
                    backglass.showMessage('KICKBACK!', 900);
                    triggerCameraShake(150, 0.005);
                    playKickbackSound();
                }
            } else if (meta.kind === 'orbitEntrance') {
                // Arms this side's orbit - does NOT score by itself (see ORBITS' block comment:
                // "Award score only after a valid entrance->completion traversal"). Light feedback
                // only, so a completed shot's own bigger beat stands out by comparison.
                setCooldown(mesh, COOLDOWN_ORBIT_MS);
                orbitState[meta.side].armedAt = performance.now();
                lampSystem.flashLamp(meta.lampId, 150, COLOR_ORBIT_LAMP);
                triggerCameraShake(40, 0.0015);
                playOrbitEnterSound();
            } else if (meta.kind === 'orbitCompletion') {
                setCooldown(mesh, COOLDOWN_ORBIT_MS);
                const armedAt = orbitState[meta.side].armedAt;
                const withinWindow = armedAt !== null && performance.now() - armedAt <= ORBIT_COMPLETION_WINDOW_MS;
                // Always flash the lamp and give a small acknowledgement, even for a stray hit on
                // the completion trigger with no matching entrance - only the scoring/stat/message
                // below is gated on a genuine traversal.
                lampSystem.flashLamp(meta.lampId, 150, COLOR_ORBIT_LAMP);
                if (!withinWindow) return;
                orbitState[meta.side].armedAt = null; // consume the arm - one entrance buys one completion, not a standing "always score" state
                const isLeft = meta.side === 'left';
                addScore(SCORE_ORBIT);
                if (isLeft) stats.leftOrbitShots++; else stats.rightOrbitShots++;
                recordComboShot(isLeft ? 'orbitLeft' : 'orbitRight'); // combo scoring (user-requested) - feeds 'ORBIT SWITCH' and 'BANK RUSH'
                spawnHitBurst(scene, particleTexture, mesh, highFidelity);
                backglass.showMessage((isLeft ? 'LEFT' : 'RIGHT') + ' ORBIT! +' + SCORE_ORBIT, 900);
                triggerCameraShake(150, 0.006);
                triggerCameraPunch(250, cameraForwardDir.scale(0.01));
                playOrbitCompleteSound(isLeft ? 520 : 620); // distinct pitch per side, matching this file's existing per-obstacle pitch convention
                // Bonus/multiplier subsystem (user-requested) - a completed orbit is a "major
                // shot," on top of (not instead of) the addScore() above.
                ballBonus.points += BONUS_MAJOR_SHOT_AMOUNT;
            } else if (meta.kind === 'powerUp') {
                // powerUp.active (see updatePowerUp()) is the real source of truth for whether
                // this should count - guards against a trigger event that fires right as the orb
                // is being hidden/despawned in the same frame.
                if (!powerUp.active) return;
                collectPowerUp();
            } else if (meta.kind === 'visionGate') {
                // Debounced two independent ways - the shared isOnCooldown() gate above
                // (COOLDOWN_VISION_GATE_MS) plus visionGate.active itself. This is the one
                // trigger in the game that must never let two captures overlap (it would mean
                // trying to freeze/score/eject against a ball that's already mid-sequence), so it
                // gets the same "active flag as the real source of truth" pattern powerUp.active
                // already uses, on top of - not instead of - the normal per-mesh cooldown.
                if (visionGate.active) return;
                setCooldown(mesh, COOLDOWN_VISION_GATE_MS);
                startVisionGateCapture(mainBall);
            }
        }

        // Bug fix (playtest audit): handleDrain()'s post-drain setTimeout below is a plain JS
        // timer, not gated by scene.physicsEnabled the way real physics stepping is - confirmed
        // via Playwright that pausing during its 1500ms window did NOT stop it from firing
        // underneath the pause overlay (resetBallToPlunger()/showGameOverScreen() would run while
        // the player couldn't see it happening, and in the Game-Over case, gameOverOverlay could
        // end up display:flex at the same time as pauseOverlay). pendingDrainAction defers that
        // action until resumeGame() actually runs it, instead of letting it fire invisibly.
        let pendingDrainAction = null;

        // Same reasoning as pendingDrainAction above, for the Vision Gate's own post-capture
        // eject timer (see startVisionGateCapture() in main()) - a plain JS setTimeout isn't
        // gated by scene.physicsEnabled either, so pausing mid-sequence must defer the eject
        // rather than let a kinematic-to-dynamic switch + velocity kick fire invisibly underneath
        // the pause overlay.
        let pendingVisionGateEject = null;

        // Ported from checkDrain() in ../index.js: lose a life, end this ball's turn. No
        // GameOverScene equivalent exists yet (Stage 12), so hitting 0 lives just resets lives
        // and score in place after the same pause the 2D version used before showing Grim
        // Reaper/resetting - documented as a deliberate simplification, not an oversight.
        function handleDrain() {
            if (!ballInPlay) return; // the ball can sit inside the trigger volume for a while;
            // without this guard every frame it stays there would count as a separate drain.
            ballInPlay = false;

            // BALL SAVE (fairness mechanics, user-requested) - checked before anything else
            // touches lives/scoring, so a saved drain genuinely costs nothing: no life lost, no
            // DRAINED! beat, and none of the per-ball resets below run (dropTargetBank/laneBank/
            // combos/ballBonus all stay exactly as they were - the ball never really left play).
            // Consumes the save immediately (ballSave.usedThisLife = true) so it can't retrigger
            // from the very next drain - see armBallSave()'s own comment.
            if (ballSave.active) {
                ballSave.active = false;
                ballSave.usedThisLife = true;
                setBallSaveLampLit(false);
                stats.ballSaves++;
                backglass.showMessage('BALL SAVED!', 1400);
                // Deliberately gentler/shorter than the real-drain beats below, and no red
                // flashScreen() at all - this is good news, not a punishment.
                triggerCameraShake(200, 0.004);
                playBallSaveSound();
                vibrateDevice(HAPTIC_BALL_SAVE_PATTERN); // differentiated haptics (user-requested) - a two-pulse "saved!" blip, distinct from mission complete's three-pulse fanfare
                setTimeout(() => {
                    const action = () => {
                        backglass.redraw();
                        resetBallToPlunger();
                    };
                    if (isPaused) {
                        pendingDrainAction = action;
                    } else {
                        action();
                    }
                }, BALL_SAVE_RETURN_DELAY_MS);
                return;
            }

            lives--;
            setLives(lives);
            // BALL SAVE reset (fairness mechanics) - this life is genuinely over now, so the next
            // one gets its own fresh save opportunity (see armBallSave()'s "usedThisLife" gate).
            ballSave.usedThisLife = false;
            backglass.showMessage('DRAINED!', 1400); // no Grim Reaper visual yet (Stage 12) - this is the stand-in
            triggerCameraShake(400, 0.008); // matches checkDrain()'s cameraShake(400, 0.008)
            flashScreen(200, 255, 0, 0); // matches checkDrain()'s cameraFlash(200, 255, 0, 0, true) - red
            // Quick downward dip - a 3D-only "snap toward the void" beat with no 2D equivalent
            // (that camera couldn't move through space at all).
            triggerCameraPunch(400, new BABYLON.Vector3(0, -0.03, 0));
            playDrainSound();
            setTimeout(() => {
                const action = () => {
                    // Bonus/multiplier subsystem (user-requested) - "on drain: calculate bonus x
                    // multiplier, rapidly count the bonus into score, show the sequence on HUD/
                    // backglass, then continue normal life/game-over flow." startBonusCount() pays
                    // out (or no-ops instantly if this ball earned no bonus) BEFORE the lives<=0
                    // check below, so the payout always plays regardless of whether the game is
                    // about to end.
                    startBonusCount(() => {
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
                        // Drop-target bank reset (user-requested upgrade) - real drop-target banks
                        // reset at the start of each new ball, not mid-ball; this is the "life lost,
                        // game continues" path (the lives<=0/showGameOverScreen() branch above
                        // returns before reaching here, so a true game-ending drain doesn't double up
                        // with startNewGame()'s own reset later).
                        resetDropTargetBank();
                        // Bonus/multiplier subsystem reset - "multiplier resets appropriately
                        // between balls." startBonusCount() above already paid out this ball's
                        // total before this runs, so it's safe to zero here.
                        ballBonus.points = 0;
                        ballBonus.multiplierX = 1;
                        backglass.state.bonusMultiplierX = 1;
                        resetCombos();
                    });
                };
                if (isPaused) {
                    pendingDrainAction = action;
                } else {
                    action();
                }
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

        // Bug fix (repo audit): #loading-panel (index.html) is visible from the very first paint,
        // with zero JS needed to reveal it - see its own CSS comment for why. This is the one
        // point in main() that reliably means "the scene is actually ready to show the player
        // something", so it's hidden here, right alongside #menu-overlay first appearing.
        const loadingPanel = document.getElementById('loading-panel');
        if (loadingPanel) loadingPanel.style.display = 'none';

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
            // Run any drain outcome (game over or ball reset) that was deferred because it would
            // otherwise have fired invisibly underneath the pause overlay - see handleDrain()'s
            // pendingDrainAction comment.
            if (pendingDrainAction) {
                const action = pendingDrainAction;
                pendingDrainAction = null;
                action();
            }
            // Same deferred-action pattern for a Vision Gate eject that would otherwise have
            // fired mid-pause - see pendingVisionGateEject's own declaration comment.
            if (pendingVisionGateEject) {
                const eject = pendingVisionGateEject;
                pendingVisionGateEject = null;
                eject();
            }
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
            // Discard any drain outcome deferred by a pause mid-delay (see handleDrain()'s
            // pendingDrainAction comment) - starting fresh here makes it stale; left set, it
            // would incorrectly fire against this new game's state on a future pause/resume.
            pendingDrainAction = null;
            // Same "starting fresh makes any deferred/in-progress state stale" reasoning as
            // pendingDrainAction above, extended to a Vision Gate capture that might genuinely be
            // in progress (color-cycle timers running, sparkle alive, ball held kinematic) at the
            // moment of a hard reset (e.g. the dev "RESET BALL TO PLUNGER" button, or a future
            // menu path). Restoring the ball to DYNAMIC unconditionally here - not just when
            // visionGate.active is true - is deliberate: it's a correct no-op on an already-
            // dynamic ball, and guarantees resetBallToPlunger() below (which assumes a normal
            // dynamic body and doesn't itself touch motion type) can never leave the ball
            // permanently frozen.
            pendingVisionGateEject = null;
            visionGate.colorTimers.forEach(clearTimeout);
            visionGate.colorTimers = [];
            if (visionGate.sparkle) {
                visionGate.sparkle.stop();
                if (!visionGate.sparkle.isDisposed) visionGate.sparkle.dispose();
                visionGate.sparkle = null;
            }
            visionGate.active = false;
            visionGate.ball = null;
            lampSystem.setLampMode('visionGate', LAMP_MODE.ON);
            glowLayer.intensity = restGlowIntensity;
            mainBall.aggregate.body.setMotionType(BABYLON.PhysicsMotionType.DYNAMIC);
            score = 0;
            lives = STARTING_LIVES;
            stats.bumperHits = 0;
            stats.cometHits = 0;
            stats.saturnHits = 0;
            stats.targetHits = 0;
            stats.laneHits = 0;
            stats.missionsCompleted = 0;
            stats.powerUpsCollected = 0;
            stats.inlaneHits = 0;
            stats.outlaneHits = 0;
            stats.leftOrbitShots = 0;
            stats.rightOrbitShots = 0;
            stats.visionGateCaptures = 0;
            stats.targetBankCompletions = 0;
            stats.laneBankCompletions = 0;
            orbitState.left.armedAt = null;
            orbitState.right.armedAt = null;
            // Drop-target bank (user-requested upgrade) - per-run state, same reasoning as
            // mission/rank/power-up above.
            resetDropTargetBank();
            // Rollover-lane bank (user-requested upgrade) - same per-run reasoning; a fresh game
            // shouldn't inherit a previous run's lit lanes.
            resetLaneBank();
            // Bonus/multiplier subsystem (user-requested) - a fresh game starts back at 1X with
            // an empty pool, same per-run reasoning as everything else here.
            ballBonus.points = 0;
            ballBonus.multiplierX = 1;
            backglass.state.bonusMultiplierX = 1;
            resetCombos();
            stats.combosCompleted = 0;
            stats.comboMaxTier = 0;
            stats.skillShotsAwarded = 0;
            stats.ballSaves = 0;
            stats.kickbacksUsed = 0;
            // Ball save (fairness mechanics, user-requested) - a fresh game gets a fresh save
            // opportunity for its very first life. resetBallToPlunger() below already clears
            // active/remainingMs/the lamp; usedThisLife is deliberately NOT touched by that
            // function (see its own comment), so it needs its own explicit reset here.
            ballSave.usedThisLife = false;
            // Outlane kickback (fairness mechanics, user-requested) - unlike ballSave/skillShot,
            // this is NOT reset by resetBallToPlunger() (it's meant to survive a drain - see
            // kickback's own block comment), so a new game needs to explicitly clear it here;
            // otherwise an earned-but-unused kickback would incorrectly carry over from a
            // finished game into a brand new one.
            kickback.active = false;
            setKickbackLampLit(false);
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
            // Power-up (board redesign) - also per-run state, same reasoning as mission/rank above.
            powerUp.active = false;
            powerUp.timerMs = POWERUP_SPAWN_INTERVAL_MS;
            powerUp.multiplierRemainingMs = 0;
            scoreMultiplier = 1;
            backglass.state.multiplierActive = false;
            obstacles.powerUpMesh.setEnabled(false);
            lampSystem.setLampMode('multiplier', LAMP_MODE.OFF);
            setScore(0);
            setLives(lives);
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
                ['Comet Hits', stats.cometHits],
                ['Saturn Hits', stats.saturnHits],
                ['Target Hits', stats.targetHits],
                ['Lane Hits', stats.laneHits],
                ['Inlane Hits', stats.inlaneHits],
                ['Outlane Hits', stats.outlaneHits],
                ['Left Orbit Shots', stats.leftOrbitShots],
                ['Right Orbit Shots', stats.rightOrbitShots],
                ['Vision Gate Captures', stats.visionGateCaptures],
                ['Power-Ups Collected', stats.powerUpsCollected],
                ['Target Bank Clears', stats.targetBankCompletions],
                ['Lane Bank Clears', stats.laneBankCompletions],
                ['Combos', stats.combosCompleted],
                ['Best Combo Tier', stats.comboMaxTier],
                ['Skill Shots', stats.skillShotsAwarded],
                ['Ball Saves', stats.ballSaves],
                ['Kickbacks Used', stats.kickbacksUsed]
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

        // ===================================
        // Tuning/debug HUD (?dev=1, user-requested) - a lightweight readout + toggle layer for
        // on-device pinball tuning, especially useful on Android where remote devtools access is
        // often unavailable mid-playtest. Dev-only, zero visible impact for normal players:
        // updateDevHud stays null outside a dev session, so the render loop's own call site is a
        // single pointer check, not a function call - and every readout below is even THEN
        // throttled (DEV_HUD_UPDATE_INTERVAL_MS), not recomputed every single frame, so the HUD
        // itself never becomes a measurable cost on the FPS number it's showing.
        // ===================================
        const devMode = new URLSearchParams(window.location.search).has('dev');
        // Toggle-ball-trail state (see the render loop's own use of this) - declared outside the
        // `if (devMode)` block below since the render loop always reads it; stays permanently true
        // for a normal player, identical to today's behavior.
        let devBallTrailEnabled = true;
        let updateDevHud = null;

        if (devMode) {
            const statusFps = document.getElementById('status-fps');
            const statusFrameTime = document.getElementById('status-frame-time');
            const statusPhysicsBodies = document.getElementById('status-physics-bodies');
            const statusBallSpeed = document.getElementById('status-ball-speed');
            const statusBallVelocity = document.getElementById('status-ball-velocity');
            const statusBallPosition = document.getElementById('status-ball-position');
            const statusFlipperState = document.getElementById('status-flipper-state');
            const statusMission = document.getElementById('status-mission');
            const statusMultiplier = document.getElementById('status-multiplier');
            const statusBallSaveState = document.getElementById('status-ball-save-state');
            const statusCombo = document.getElementById('status-combo');
            const statusFidelity = document.getElementById('status-fidelity');

            // Static for the whole session (detectHighFidelity() only ever runs once, at load) -
            // set once here rather than every HUD tick. cores/mem are shown alongside the tier
            // itself specifically for Android tuning - the two inputs detectHighFidelity() actually
            // bases its decision on, so a dev can immediately see WHY a device landed on LOW
            // without needing separate devtools access.
            statusFidelity.textContent = (highFidelity ? 'HIGH' : 'LOW') +
                ' (cores=' + (navigator.hardwareConcurrency || '?') + ', mem=' + (navigator.deviceMemory || '?') + 'GB)';

            // Physics body count barely changes mid-session (only the dev drop-test-ball/clear-
            // test-balls buttons touch it) - recomputed on the same throttle as everything else
            // below rather than a separate, even-slower timer; still nowhere near "every frame".
            function countPhysicsBodies() {
                return scene.meshes.reduce((count, m) => count + (m.physicsBody ? 1 : 0), 0);
            }

            let devHudAccumulatorMs = 0;
            const DEV_HUD_UPDATE_INTERVAL_MS = 200; // 5/sec - plenty legible for a tuning readout, avoids "expensive profiling every frame"
            updateDevHud = function (deltaMs) {
                devHudAccumulatorMs += deltaMs;
                if (devHudAccumulatorMs < DEV_HUD_UPDATE_INTERVAL_MS) return;
                devHudAccumulatorMs = 0;

                statusFps.textContent = engine.getFps().toFixed(0);
                statusFrameTime.textContent = deltaMs.toFixed(1) + ' ms';
                statusPhysicsBodies.textContent = String(countPhysicsBodies());

                const velocity = mainBall.aggregate.body.getLinearVelocity();
                const position = mainBall.mesh.position;
                statusBallSpeed.textContent = velocity.length().toFixed(2) + ' m/s';
                statusBallVelocity.textContent = velocity.x.toFixed(2) + ', ' + velocity.y.toFixed(2) + ', ' + velocity.z.toFixed(2);
                statusBallPosition.textContent = position.x.toFixed(2) + ', ' + position.y.toFixed(2) + ', ' + position.z.toFixed(2);

                statusFlipperState.textContent = (leftFlipper.active ? 'ACTIVE' : 'idle') + ' / ' + (rightFlipper.active ? 'ACTIVE' : 'idle');

                statusMission.textContent = mission.selectedIndex !== null
                    ? MISSION_DEFS[mission.selectedIndex].name + ' (' + mission.progress + '/' + mission.required + ')'
                    : 'none';

                statusMultiplier.textContent = (scoreMultiplier > 1 ? scoreMultiplier + 'X score' : '1X') +
                    (ballBonus.multiplierX > 1 ? ' / bonus ' + ballBonus.multiplierX + 'X' : '');

                statusBallSaveState.textContent = ballSave.active ? 'ARMED' : 'off';

                const inProgress = COMBO_DEFS
                    .map((def, i) => ({ def, prog: comboProgress[i] }))
                    .filter(({ prog }) => prog.index > 0);
                statusCombo.textContent = (comboStreak.tier > 0 ? 'x' + comboStreak.tier : 'none') +
                    (inProgress.length > 0 ? ' (' + inProgress.map(({ def, prog }) => def.name + ' ' + prog.index + '/' + def.steps.length).join(', ') + ')' : '');
            };

            // --- Optional toggles (user-requested) ---
            const toggleColliderViz = document.getElementById('toggle-collider-viz');
            toggleColliderViz.addEventListener('change', () => {
                obstacles.debugTriggerMeshes.forEach((mesh) => { mesh.isVisible = toggleColliderViz.checked; });
            });

            const toggleBallTrail = document.getElementById('toggle-ball-trail');
            toggleBallTrail.addEventListener('change', () => {
                devBallTrailEnabled = toggleBallTrail.checked;
                if (!devBallTrailEnabled) ballTrail.emitRate = 0; // stop immediately rather than waiting for the next speed-based fade
            });

            const togglePostProcessing = document.getElementById('toggle-post-processing');
            togglePostProcessing.addEventListener('change', () => {
                glowLayer.isEnabled = togglePostProcessing.checked;
                if (pipeline) pipeline.bloomEnabled = togglePostProcessing.checked;
            });

            const toggleParticles = document.getElementById('toggle-particles');
            toggleParticles.addEventListener('change', () => {
                devParticlesEnabled = toggleParticles.checked;
                // Future hit bursts/sparkles already check devParticlesEnabled themselves (see
                // each function's own guard) - the one already-running system that needs an
                // explicit stop/restart is the ambient drain vortex, built once at load.
                if (drainVortex) {
                    if (devParticlesEnabled) drainVortex.start(); else drainVortex.stop();
                }
            });
        }

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
            updateSaturnRotation(obstacles.saturnRings, deltaMs);

            if (!isPaused) {
                updateFlipperMotor(leftFlipper, deltaMs);
                updateFlipperMotor(rightFlipper, deltaMs);
                updateDropTargetBank(deltaMs);
                updateBonusCount(deltaMs);
                updateSkillShot(deltaMs);
                updateBallSave(deltaMs);
                lampSystem.updateLamps(performance.now());
                // Skipped while the Vision Gate holds the ball (visionGate.active) - not just a
                // nicety: updateBallPhysics()'s own anti-stuck kick fires after STUCK_TIME_
                // THRESHOLD_MS (450ms) of near-zero speed, which a deliberately-frozen kinematic
                // ball would trip well before VISION_GATE_SEQUENCE_MS (1800ms) elapses, yanking it
                // out of the gate mid-sequence with a random kick. The ball is never actually
                // "stuck" here - it's being held on purpose - so this is the correct guard, not a
                // workaround.
                if (!visionGate.active) {
                    updateBallPhysics(mainBall, deltaMs);
                }
                testBalls.forEach((ball) => updateBallPhysics(ball, deltaMs));
                // Dev HUD "ball trail" toggle (default on, zero impact for normal players - this
                // boolean is never false outside a dev session) - pins emitRate to 0 while off
                // instead of skipping updateBallTrail() silently, so an already-emitting trail
                // stops immediately rather than fading out on its own schedule.
                if (devBallTrailEnabled) {
                    updateBallTrail(ballTrail, mainBall, highFidelity);
                } else {
                    ballTrail.emitRate = 0;
                }

                // Power-up spawn/despawn timer + multiplier countdown - gated on ballInPlay too
                // (not just isPaused), same reasoning as the plunger-charge guard just below: no
                // point burning down a spawn timer or an active multiplier window before the ball
                // is even launched.
                if (ballInPlay) {
                    updatePowerUp(deltaMs);
                }

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

            // Ball rolling intensity (user-requested audio layer) - called every frame regardless
            // of isPaused (unlike the block above), deliberately: it needs to keep running while
            // paused so it can glide the rolling texture down to silence (active=false) instead
            // of freezing mid-volume at whatever it last was when the pause hit. See
            // updateRollingSound()'s own comment for why this never creates new audio nodes.
            updateRollingSound(mainBall.aggregate.body, ballInPlay && !isPaused);

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

            // Tuning/debug HUD (?dev=1, user-requested) - null outside a dev session (see its own
            // declaration below), so this is a single pointer comparison for a normal player, not
            // a function call - genuinely zero per-frame cost beyond that one `if`.
            if (updateDevHud) updateDevHud(deltaMs);

            scene.render();
        });

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
