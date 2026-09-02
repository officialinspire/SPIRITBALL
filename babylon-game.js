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
// Stage 11: real mobile touch controls (arcade corner buttons + launch button, ported from
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
    BALL_MASS_KG, BALL_RESTITUTION, BALL_FRICTION, MAX_BALL_SPEED_MS, WORLD_MAX_LINEAR_SPEED_MS, STUCK_SPEED_THRESHOLD_MS,
    STUCK_TIME_THRESHOLD_MS, STUCK_KICK_CENTERWARD_MS, STUCK_KICK_DOWNHILL_MS, STUCK_KICK_UP_MS,
    STUCK_KICK_ESCALATION_STEP, STUCK_KICK_ESCALATION_MAX,
    FLIPPER_LENGTH_M, FLIPPER_THICKNESS_M, FLIPPER_HEIGHT_M, FLIPPER_MASS_KG,
    FLIPPER_GAP_HALF_M, FLIPPER_PIVOT_X_M, FLIPPER_Z_M, FLIPPER_PLAYFIELD_CLEARANCE_M, FLIPPER_SWEEP_RAD,
    FLIPPER_LEFT_REST_RAD, FLIPPER_RIGHT_REST_RAD, FLIPPER_ACTIVATE_SPEED_RAD_S, FLIPPER_RETURN_SPEED_RAD_S,
    FLIPPER_RESTITUTION, FLIPPER_FRICTION, FLIPPER_CONTACT_VELOCITY_TRANSFER,
    BUMPER_RADIUS_M, BUMPER_CLUSTER, BUMPER_KICK_SPEED_MS, SPECIAL_EVENT_KICK_SPEED_MS, TARGET_RADIUS_M,
    MISSION_TARGET_BANK, TARGET_RAISED_Y_M, TARGET_DROPPED_Y_M, TARGET_DROP_ANIM_MS,
    SATURN_RADIUS_M, SATURN_POS, COMET_RADIUS_M, COMET_POS,
    POWERUP_RADIUS_M, POWERUP_POS, POWERUP_SPAWN_INTERVAL_MS, POWERUP_ACTIVE_DURATION_MS,
    POWERUP_MULTIPLIER, POWERUP_MULTIPLIER_DURATION_MS, SLINGSHOT_SIZE_M, SLINGSHOTS,
    SLINGSHOT_KICK_SPEED_MS, SLINGSHOT_KICK_UPTABLE_BIAS_MS, SLINGSHOT_RESTITUTION, REENTRY_LANE_RADIUS_M, REENTRY_LANES,
    LANE_Z_TOP_M, LANE_Z_BOTTOM_M, LANE_DIVIDER_X_M, LANE_TRIGGER_Z_M, INLANE_GUIDE_BOTTOM_Z_M,
    INLANE_TRIGGER_X_M, OUTLANE_TRIGGER_X_M, LANE_TRIGGER_WIDTH_M, LANE_TRIGGER_DEPTH_M,
    INLANE_GUIDE_TOP_X_M, INLANE_GUIDE_BOTTOM_X_M, SIDE_LANES,
    ORBIT_RAIL_TOP_Z_M, ORBIT_COMPLETION_Z_M, ORBIT_TRIGGER_WIDTH_M,
    ORBIT_ARC_RADIUS_M, ORBIT_LANE_WIDTH_M, ORBIT_ARC_SWEEP_RAD, ORBIT_INNER_SWEEP_RAD,
    ORBIT_ENTRANCE_SWEEP_RAD, ORBIT_ARC_SEGMENTS, orbitArcPoint, ORBIT_WALL_FACE_X_M,
    ORBIT_TOP_ARC_RADIUS_M, ORBIT_TOP_ARC_SWEEP_RAD, ORBIT_TOP_ARC_SEGMENTS, orbitTopArcPoint,
    ORBIT_TOP_LIPS,
    SATURN_CANOPY, SATURN_JAW, SATURN_APPROACH_TINT,
    COMET_RETURN_RAIL, COMET_APPROACH_TINT, VISION_GATE_APPROACH_TINT,
    ORBIT_OUTER_GAP_FROM_RAD, ORBIT_OUTER_GAP_TO_RAD, ORBIT_OUTER_FLANK_SIDES,
    ORBIT_TRIGGER_DEPTH_M, ORBIT_COMPLETION_WINDOW_MS, ORBITS, VISION_GATE_POS,
    MISSION_CUE_MS, MISSION_SELECT_MESSAGE_MS,
    VISION_GATE_RADIUS_M, VISION_GATE_COLLAR_RADIUS_M, SCORE_VISION_GATE, VISION_GATE_SEQUENCE_MS,
    VISION_GATE_HALO_SPIN_RAD_MS, VISION_GATE_HALO_DRIFT_RATE,
    COOLDOWN_VISION_GATE_MS, VISION_GATE_EJECT_SPEED_MS, HEX_VISION_GATE, BALL_REST_X_PX,
    BALL_REST_Z_PX, BALL_REST_Z_M, BALL_REST_Y_M, LANE_INNER_WALL_X_PX, LANE_INNER_WALL_WIDTH_PX,
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
    BONUS_COUNT_REDUCED_MOTION_MS, BONUS_COUNT_HOLD_MS,
    END_OF_BALL_LOST_MS, END_OF_BALL_NO_BONUS_MS, END_OF_BALL_STATE_MS, END_OF_BALL_NEXT_BALL_MS, COMBO_ORBIT_TYPES, COMBO_STEP_WINDOW_MS, COMBO_TRIPLE_STEP_WINDOW_MS,
    COMBO_CHAIN_WINDOW_MS, COMBO_MAX_TIER, COMBO_BASE_SCORE, COMBO_MESSAGE_MS,
    COMBO_DEFS, RANK_NAMES, STATE_COLORS, MISSION_DEFS, missionRequiredCount,
    COOLDOWN_BUMPER_MS, COOLDOWN_COMET_MS, COOLDOWN_SLINGSHOT_MS, COOLDOWN_MISSION_TARGET_MS,
    COOLDOWN_REENTRY_LANE_MS, COOLDOWN_SATURN_MS, COOLDOWN_SIDE_LANE_MS, COOLDOWN_ORBIT_MS,
    COOLDOWN_WALL_MS, COOLDOWN_FLIPPER_MS, DRAIN_ZONE_WIDTH_M, DRAIN_ZONE_DEPTH_PX,
    DRAIN_ZONE_CENTER_Y_PX, STARTING_LIVES, hexToColor3, hexStringToRgb, HEX_BALL,
    HEX_EYEBALL, HEX_FLIPPER, HEX_WALL, HEX_BUMPERS,
    HEX_CHAKRA, HEX_SATURN, HEX_SATURN_RING, HEX_COMET,
    HEX_MISSION_ACTIVE, HEX_LANE_LAMP, HEX_OUTLANE_LAMP, HEX_ORBIT_LAMP, HEX_SKILL_SHOT_LAMP,
    HEX_BALL_SAVE_LAMP, HEX_KICKBACK_LAMP, HEX_BACKGROUND
} from './js/config.js';
// Decorative-skin manifest (visual-architecture pass, user-requested) - pure data, see its own
// file header for why it stays BABYLON-free, and SKINS.md at the repo root for the full asset-
// folder spec this powers. Imported the same bare-identifier way as js/config.js above.
import { SKIN_ASSET_BASE, SKIN_MANIFEST } from './js/skins.js';

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
            document.documentElement.dataset.touchControls = 'off';
            return;
        }

        if (rotateOverlay) rotateOverlay.style.display = 'none';
        const shouldShow = isMobileDevice || window.innerHeight > window.innerWidth || window.innerWidth <= 767;
        if (mobileControls) mobileControls.style.display = shouldShow ? 'block' : 'none';
        // Publish the decision so CSS can agree with it. The title screen's control hint used to
        // pick its wording from `(hover: none) and (pointer: coarse)`, which is a different
        // question than the one asked here - a 390px-wide desktop window is coarse-pointer=false
        // but small-and-portrait=true, so the screen showed on-screen flipper zones and a "TAP to
        // start" button while the hint underneath it said "SPACE LAUNCH / ESC PAUSE". The hint
        // should describe the controls the player can actually see, which is exactly shouldShow.
        // Presentational only: nothing reads this attribute except the hint's CSS.
        document.documentElement.dataset.touchControls = shouldShow ? 'on' : 'off';
    }

    // Do the on-screen flipper zones and launch button exist right now? This is the question the
    // player-facing prompts actually care about, and it is NOT the same as isMobileDevice:
    // updateMobileControlsVisibility() also shows the controls for any portrait or <=767px
    // viewport. A portrait tablet (no mobile UA, 820px wide) got the controls but was told to
    // "PRESS SPACE TO START" - it has no space bar. Reads the attribute that function publishes
    // so there is exactly one definition of the answer.
    function touchControlsActive() {
        return document.documentElement.dataset.touchControls === 'on';
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
    // High-score audit fix (same "storage failures never break the game" policy the fix was
    // written for, applied here too): this runs at module load, before main() and its own
    // defensive high-score storage wrapper even exist - a throwing localStorage (blocked/disabled
    // storage in the current context) used to take the ENTIRE game down before a single frame
    // rendered, matching this block's own "a failure here must never break gameplay" comment in
    // spirit but not, until now, in the actual code.
    let audioMuted = false;
    try {
        audioMuted = localStorage.getItem('spiritball-muted') === 'true';
    } catch (e) {
        // Default to unmuted and move on - see the comment above.
    }

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
        try {
            localStorage.setItem('spiritball-muted', String(muted));
        } catch (e) {
            // Storage unavailable/blocked - the toggle still works for this session, it just
            // won't be remembered next time. Same policy as the read above.
        }
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

    // Responsive QA pass: both showUnsupportedMessage() and showFatalError() below can fire from
    // main()'s own outer .catch() (see its own comment - a Havok/WASM failure partway through
    // setup, not just the proactive pre-flight check at the very top of main()), which means
    // main() may already have gotten as far as showing #menu-overlay, #pause-btn (visible
    // unconditionally from first paint, no JS needed), and #mobile-controls before it failed.
    // Neither failure panel accounted for that - #unsupported-panel/#error-panel sit at z-index
    // 25/20, well BELOW the menu overlay's 200 and the pause button's 45, so a failure reached
    // after that point rendered the actual error message completely hidden behind (and illegible
    // under) the still-visible menu screen, with the pause button and flipper/launch controls
    // floating on top looking tappable. Confirmed via Playwright. Every element hidden here is a
    // fixed lookup (module-scope, so the real menuOverlay/pauseOverlay/etc. references inside
    // main() aren't in scope) rather than an exhaustive trace of exactly which ones COULD be
    // showing at a given failure point - harmless/idempotent to hide one that was never visible.
    function hideAllGameUiForFailure() {
        document.querySelectorAll('.screen-overlay').forEach((el) => { el.style.display = 'none'; });
        ['pause-btn', 'mobile-controls', 'player-hud', 'mission-hud', 'effects-hud'].forEach((id) => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        });
    }

    function showUnsupportedMessage(reason) {
        console.error('[SPIRITBALL 3D] Unsupported device:', reason);
        hideAllGameUiForFailure();
        const panel = document.getElementById('unsupported-panel');
        if (panel) panel.style.display = 'flex';
        const canvasEl = document.getElementById('renderCanvas');
        if (canvasEl) canvasEl.style.display = 'none';
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
        hideAllGameUiForFailure();
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
        COLOR_SATURN, COLOR_SATURN_RING, COLOR_COMET, COLOR_MISSION_ACTIVE, COLOR_LANE_LAMP, COLOR_OUTLANE_LAMP, COLOR_ORBIT_LAMP,
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
    // Decorative-skin texture loader (visual-architecture pass, user-requested - "prepare
    // SPIRITBALL's visual architecture for custom generated artwork... WITHOUT adding the final
    // artwork yet"). This is the ONLY place in the whole file that ever loads a skin image - see
    // js/skins.js for the manifest (SKIN_MANIFEST/SKIN_ASSET_BASE) and SKINS.md at the repo root
    // for the asset-folder spec. Every call site below (buildTable()/buildObstacles()) already
    // builds its material with the existing procedural look FIRST, then calls this - so a slot
    // with no path configured (every slot, until real artwork exists - see skins.js) is a true
    // no-op, not a missing-texture glitch.
    //
    // Null-path slots return immediately below WITHOUT ever issuing a network request - not just
    // an implementation detail. A real attempted load that 404s still gets logged by Chromium's
    // own network stack as a "Failed to load resource: 404" console entry, regardless of any
    // onError handler here - that's a browser-level diagnostic tied to the raw HTTP response, not
    // something JS can suppress (confirmed via a headless Chromium run against a real 404 while
    // building this). With multiple skin slots, attempting every one of them speculatively before
    // any artwork exists would mean that many console entries on every single load - a real
    // regression against this project's own zero-console-error bar. Skipping the request entirely
    // for an unset slot (see skins.js's own comment on why paths default to null, not a guessed
    // future filename) is what actually keeps an artwork-free build's console silent.
    //
    // Deliberately fire-and-forget: BABYLON.Texture's own onLoad/onError callbacks below are how
    // this resolves once a path IS configured, not a Promise a caller could accidentally await
    // and block scene/game startup on. onError is passed explicitly (required - without it, a
    // failed load also calls BABYLON's own Tools.Error internally; with it, the failure path
    // taken by THIS code is entirely this callback) so a genuine load failure on a configured
    // slot (wrong filename, bad deploy, network hiccup) still never throws, never rejects
    // unhandled, and never touches the material beyond disposing the failed attempt - startup and
    // every other decorative surface are unaffected either way. The one thing it can't do (see
    // above) is keep Chromium's own network-failure console line from appearing for that specific
    // configured-but-broken slot; that's expected, standard browser diagnostic behavior for any
    // failed HTTP request, not a bug in this function.
    //
    // entry: one SKIN_MANIFEST value, i.e. { path, kind } (plus an optional albedoScale) - kind
    // picks which material property gets the loaded texture ('albedo' -> albedoTexture/
    // diffuseTexture, 'emissive' -> emissiveTexture), matching whichever of those properties that
    // material's own procedural look already relies on for its base color; albedoScale, where a
    // slot declares one, caps how bright the loaded artwork is allowed to render (see below, and
    // js/skins.js for why a slot would want that). Passing a falsy entry (e.g. an out-of-range
    // missionTargetFace index) is a safe no-op, not an error - callers don't need to guard first.
    function applySkinTexture(scene, material, entry) {
        if (!entry || !entry.path || !material) return;
        const property = entry.kind === 'emissive' ? 'emissiveTexture' : (material.albedoColor ? 'albedoTexture' : 'diffuseTexture');
        try {
            const url = SKIN_ASSET_BASE + entry.path;
            const texture = new BABYLON.Texture(
                url,
                scene,
                undefined,
                undefined,
                undefined,
                () => {
                    // onLoad - only reached once the file has genuinely been fetched and decoded
                    // successfully, safe to swap in now.
                    material[property] = texture;
                    // Reset the tint this property's own color multiplies against, so the loaded
                    // artwork's real colors show through under scene lighting instead of getting
                    // multiplied by whatever flat procedural color that material used as its
                    // plain-color fallback (e.g. playfieldMat's dark cosmic tint would otherwise
                    // significantly darken/wash out real playfield artwork layered on top of it -
                    // exactly the "avoid washing out the artwork" requirement this exists for).
                    // Only for 'albedo': an emissive texture is additive light output, not a
                    // multiplied tint, so emissiveColor staying at its current (usually lamp-
                    // system-controlled) value is correct as-is.
                    //
                    // entry.albedoScale (see js/skins.js) replaces that white with a flat grey
                    // when a slot declares one, which is the same multiply - just at a documented
                    // ceiling instead of wide open. It exists for surfaces whose place in the
                    // board's visual hierarchy is not the artwork's decision to make (cabinetRails
                    // is the case today: structural boundary, must stay under the gameplay
                    // elements it frames). Clamped rather than trusted: a slot is data, and data
                    // outside 0..1 here would either black the surface out or push it back above
                    // the plain-white default this is supposed to sit below.
                    if (entry.kind !== 'emissive') {
                        const level = typeof entry.albedoScale === 'number'
                            ? Math.max(0, Math.min(1, entry.albedoScale))
                            : 1;
                        if (material.albedoColor) material.albedoColor.set(level, level, level);
                        else if (material.diffuseColor) material.diffuseColor.set(level, level, level);
                    }
                },
                () => {
                    // onError - includes a plain 404, the expected/default case for every slot
                    // right now. Dispose the failed attempt and leave the material exactly as
                    // its caller already set it up; deliberately silent, since a missing
                    // optional skin asset is normal, not a bug.
                    texture.dispose();
                }
            );
            // Sensible filtering defaults for every skin texture (visual-integration pass, user-
            // requested - "sensible texture filtering, anisotropic filtering if supported"). Clamp
            // (not the Texture class default of wrap/repeat) since every one of these slots is a
            // single "cover this surface" image, never a tiling pattern - repeat would risk a
            // visible seam if UV drifts even slightly past 0/1 at a mesh edge. Anisotropic
            // filtering sharpens a texture viewed at a raking angle - exactly this game's fixed
            // camera relative to the playfield (see buildCamera()'s own "steeply-angled" note) -
            // gated on the engine actually reporting hardware support (maxAnisotropy > 0; the
            // WEBGL_ANISOTROPIC_FILTER extension isn't universal) rather than assumed present.
            texture.wrapU = BABYLON.Texture.CLAMP_ADDRESSMODE;
            texture.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;
            const maxAnisotropy = scene.getEngine().getCaps().maxAnisotropy;
            if (maxAnisotropy > 0) {
                texture.anisotropicFilteringLevel = Math.min(8, maxAnisotropy);
            }
        } catch (err) {
            // Defensive only - BABYLON.Texture's own async loader is what normally reports
            // failures via onError above; this catches anything more fundamental (e.g. an
            // already-disposed scene) without ever letting a skin-loading problem escape to
            // main()'s own startup error handling.
        }
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
        // Lighting/material hierarchy pass (user-requested - "RAILS/STRUCTURE: metallic or
        // physical-material definition" vs. "not every object should glow"): metallic raised
        // (0.6 -> 0.72) and emissive cut roughly in half (0.15 -> 0.07) - these are the table's
        // structural boundary, not a light source, so their identity should read from reflective/
        // metallic response under the scene's direct lights, not from a self-glow competing with
        // the actual lamps/bumpers/ball for the eye's attention. Left with a small emissive
        // residue rather than zero: fully unlit walls read as flat black silhouettes against the
        // dark space background at this camera angle (verified via screenshot), which loses the
        // wall's own presence entirely rather than looking appropriately "structural."
        // Cabinet/perimeter pass (user-requested): metallic comes DOWN from 0.72, which is the
        // opposite of the direction the last hierarchy pass moved it, and for a reason that only
        // applies now. A metal's albedo is its specular tint, not a diffuse colour, so at 0.72
        // with no environment texture (see this material's own comment above for why there isn't
        // one) almost nothing of an albedo TEXTURE survives - and the crown highlight and dark
        // base band that createCabinetRailTexture() draws are the whole point of the pass. 0.45
        // keeps a clearly metallic response under the three direct lights while letting the
        // profile read. Roughness up a touch to match.
        wallMat.metallic = 0.45;
        wallMat.roughness = 0.36;
        // 0.07 -> 0.045: a flat emissive lifts every band equally, including the dark base band
        // whose entire job is to be dark. Still non-zero for the reason the comment above gives -
        // fully unlit walls read as flat black silhouettes against the space background.
        wallMat.emissiveColor = COLOR_WALL.scale(0.045);
        // White, because createCabinetRailTexture() bakes COLOR_WALL into the texture - see that
        // function's comment.
        wallMat.albedoColor = new BABYLON.Color3(1, 1, 1);
        wallMat.albedoTexture = createCabinetRailTexture(scene, COLOR_WALL);
        // Cabinet/table artwork skin slot (visual-architecture pass, user-requested) - shared by
        // every structural boundary wall below. No-op until assets/skins/cabinet/cabinet-rails.png
        // actually exists (see SKINS.md) - the chrome look above stays exactly as-is either way.
        //
        // Placed AFTER albedoColor/albedoTexture above, not before, and that order is load-bearing
        // in both directions. On a successful load this overwrites both (the artwork's own colours
        // replace the baked-in COLOR_WALL profile, and albedoColor drops to the slot's albedoScale
        // so the rails stay under the gameplay elements they frame). On no path or a failed load
        // it touches neither, so the procedural profile above IS the shipped look rather than a
        // placeholder waiting on a fetch that may never resolve.
        //
        // One shared material across all 7 walls below is also what constrains the artwork itself:
        // every wall is a CreateBox carrying the default full-square UV on all 6 faces, so a single
        // clamped image is stretched onto 42 faces spanning 0.36:1 to 22.67:1. Only detail that
        // varies along v survives that intact - which is precisely why createCabinetRailTexture()
        // draws a V-only profile, and why the slot's artwork spec is a vertical strip. Both the
        // manifest entry in js/skins.js and SKINS.md carry the measurements.
        applySkinTexture(scene, wallMat, SKIN_MANIFEST.cabinetRails);

        // [x2d, y2d, width2d, height2d, rotation2d] - lifted directly from setupTable() in
        // ../index.js so this stays a faithful port, not a redesign.
        const wallDefs = [
            { name: 'topWall', x: 270, y: 15, w: 540, h: 30, rot: 0 },
            { name: 'leftWall', x: 15, y: 480, w: 30, h: 960, rot: 0 },
            { name: 'rightWall', x: 525, y: 480, w: 30, h: 960, rot: 0 },
            // LOWER-FLOW PASS - leftSlant is UNCHANGED, and that is a measured decision.
            //
            // It runs an unbroken 180px from the left wall down to x=-0.095, which is to say it
            // bridges straight over the left outlane. Measured, 132 seeded descents across the full
            // board width: the right outlane trigger registers 9 times, the left registers 0, and
            // not one ball crosses the flipper line outboard of the divider on that side. The left
            // outlane does not exist as a lane.
            //
            // Three ways of opening it were built and measured on the 174-shot fan, and all three
            // cost the same thing:
            //   truncated to 85px (mirroring rightSlant)  left outlane 0 -> 18, orbit completions 5 -> 2
            //   cut in two around a 50mm gap at x -0.20   left outlane 0 -> 19, orbit completions 5 -> 2
            //   truncated to 109px, channel at the wall   outlane hits 3 -> 16, orbit completions 5 -> 2,
            //                                             and orbit ENTRANCES 37 -> 29 as well
            // The section of wall that blocks the outlane is the same section a ball travelling up
            // the left rides on its way to the orbit mouth: it is the left orbit's deflector and
            // the left outlane's lid at once, and the board does not have room for both. Every
            // variant also dropped the p90 height a ball reaches while outboard of x 0.16 from
            // 0.379 to about 0.18.
            //
            // Left as it is rather than trading the left orbit shot away without being asked. The
            // exchange rate is above if that trade is wanted: about 18 left-outlane registrations
            // and 15 points of lane-registration coverage for 3 of 5 orbit completions.
            { name: 'leftSlant', x: 90, y: 760, w: 180, h: 20, rot: -0.5 },
            // Ball-flow geometry pass (user-requested, measured): rightSlant SHORTENED from its
            // outer (wall-side) end, 180px -> 85px, centre walked back along its own axis so the
            // inner end - the junction with slingshot1 that actually forms the lower-right funnel -
            // lands within 0.3mm of where it already was. The removed 95px lay entirely INSIDE the
            // plunger lane, which it crossed diagonally, and did three bad things there:
            //   1. It sealed the lane. Widest opening at z=-0.250 was 12.4mm against a 27.0mm ball;
            //      measured 0/6 balls driven up the lane from below ever got past z=-0.267.
            //   2. It intercepted the ball before the PLUNGER could. createPlunger()'s own comment
            //      is explicit that the plunger is the mechanical stop the resting ball leans on -
            //      but the slant caught the ball ~18mm up-table of the rod, so the rod never
            //      touched it, and the configured rest spot (toWorldX/Z of BALL_REST_*_PX) put the
            //      ball's centre INSIDE this wall, ejecting it at up to 0.15 m/s before every
            //      launch. With the slant clear of the lane the ball rolls the last ~7mm onto the
            //      plunger exactly as that comment describes.
            //   3. It turned the lane into a one-way ball trap. The pocket it formed above the seal
            //      had no drain and no up-table exit, and the anti-stuck kick (centreward + DOWNHILL
            //      by construction) pushes a ball there straight back into the corner: measured 18%
            //      of shots ending permanently parked, unrecoverable. The lane now falls through to
            //      the right outlane like any other return path.
            // The outer end still overlaps launchLaneWall (which runs z -0.331..-0.161 right where
            // the slant now terminates), so the lower-right funnel stays sealed against the
            // playfield - only the part of this wall that was inside the lane is gone.
            { name: 'rightSlant', x: 408, y: 783, w: 85, h: 20, rot: 0.5 },
            // Ball-flow geometry pass (user-requested, measured): both mid-table guides SHORTENED
            // from their lower (down-table) ends, 200px -> 157px, with the centre walked up the
            // guide's own axis by half the removed length (100,450 -> 108,430 and its mirror) so
            // the UPPER tip lands within 0.2mm of where it already was. Only the lower tip moves.
            //
            // Why: each guide's lower tip was the widest-outboard point on the whole rail, and it
            // sat 25.3mm from its side wall's inner face - 1.7mm LESS than the ball's own 27.0mm
            // diameter (BALL_DIAMETER_M). The wall-hugging channel outboard of each guide is the
            // table's only full-height route from mid-table to the top arc, and that tip sealed
            // its entrance. Worse, it sealed it *inconsistently*: measured 0/20 balls through at
            // 0.35-0.70 m/s but 16/20 at 1.20-1.60 m/s, because a fast ball forces the 1.7mm
            // shortfall by solver penetration. Same shot, same aim, different outcome by speed is
            // the definition of "feels random rather than physical".
            //
            // Shortening rather than translating is deliberate and was checked both ways: moving
            // the whole guide inboard widens this pinch but closes the guide-tip-to-orbit-rail gap
            // at the TOP by the same amount, which is the middle third's other entrance to the
            // upper board. Trimming the lower end only widens the pinch to 40.2mm (1.49 ball
            // diameters) while leaving that upper gap untouched. The guides keep their full
            // inward-redirect job for everything approaching between the tips - only their dead
            // bottom 43px, whose sole measured effect was rejecting up-table shots, is gone.
            //
            // ORBIT GEOMETRY PASS: leftGuide/rightGuide are GONE, replaced by the orbit lanes' own
            // inner guides. They cannot coexist - measured against the live scene, leftGuide's
            // lower tip reached x=-0.1865 at z=-0.024, which is 20mm INSIDE the new lane (its inner
            // face is at -0.1668 there and the outer guide at -0.2169). Trimming the guide back to
            // clear the lane leaves an 88mm stub running 19mm inboard of, and parallel to, the
            // orbit's inner arc - a redundant second wall in a corridor that already has one.
            //
            // Their job was redirecting mid-table balls inward, and the arc inherits it with a
            // longer reach: leftGuide's inboard face spanned z -0.024..+0.116, the orbit's inner
            // guide plus its vertical section spans -0.096..+0.300. What genuinely changes is the
            // X at which that deflection happens - the arc's inboard face sits ~29mm further
            // outboard than the guide did at the same height - so balls in that 29mm band now fall
            // to the outlane instead of being turned toward the flipper. That is a real trade and
            // it is why the drain rate and the circulation suite were re-measured after this pass
            // rather than assumed.
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

        // ===================================
        // Cabinet shell
        // ===================================
        // Built here, off wallDefs, because these walls are the source of truth for where the
        // machine's perimeter actually is - every piece below is derived from a wall's own
        // footprint or from TABLE_WIDTH_M/TABLE_LENGTH_M, never from a hand-copied number that
        // could drift out of step with the collider.
        //
        // Nothing here gets a PhysicsAggregate. Not one collision dimension changes.

        // One chrome for every rail on the machine. Looked up by name from buildObstacles() too
        // (it runs after this), so the side rails, the lockdown bar and all seven wall crowns are
        // literally the same material instance rather than three near-matches - which is what
        // "consistent material treatment" has to mean if it is to mean anything.
        const cabinetMetalMat = new BABYLON.PBRMaterial('cabinetMetalMat', scene);
        // Worth knowing before tuning this: with metallic near 1 and no environment texture (see
        // wallMat's comment above for why this project deliberately has none), albedo is the
        // specular tint and almost nothing else, so it barely moves the result. Sweeping 0.38 vs
        // 0.60 against the same frame shifted the wall crown's measured luminance by 4 units out
        // of 255 - the rails' presence comes from roughness and from their silhouette against the
        // dark background, not from this number. Set for a polished-chrome tint and left there.
        cabinetMetalMat.albedoColor = new BABYLON.Color3(0.56, 0.62, 0.68);
        cabinetMetalMat.metallic = 0.88;
        cabinetMetalMat.roughness = 0.18;
        cabinetMetalMat.emissiveColor = new BABYLON.Color3(0.03, 0.04, 0.05); // the same "don't read as flat black against space" allowance wallMat gets

        // The cabinet body itself - matte, unlit, deliberately the least interesting surface on
        // the machine. Its whole job is to be a large dark mass BELOW the playfield so the table
        // has an underside; without it the playfield is a 20mm plate with nothing under it, which
        // is the single biggest reason the machine reads as a floating tray.
        const cabinetBodyMat = new BABYLON.PBRMaterial('cabinetBodyMat', scene);
        cabinetBodyMat.albedoColor = new BABYLON.Color3(0.055, 0.055, 0.075);
        cabinetBodyMat.metallic = 0.15;
        cabinetBodyMat.roughness = 0.82;

        // A polished crown along the top edge of every structural wall, sized from that wall's own
        // box and overhanging it by 1.5mm on each side so it reads as a capping rail rather than
        // as more wall. All seven get one - the two side walls, the top wall, both slants and both
        // mid-table guides - which is what ties the perimeter and the interior rails into one
        // piece of hardware instead of two unrelated sets of blue slabs.
        wallDefs.forEach((def) => {
            const cap = BABYLON.MeshBuilder.CreateBox(def.name + 'Crown', {
                width: def.w * PX_TO_M + 0.003,
                height: 0.0045,
                depth: def.h * PX_TO_M + 0.003
            }, scene);
            cap.position.set(toWorldX(def.x), WALL_HEIGHT_M + 0.00225, toWorldZ(def.y));
            cap.rotation.y = toWorldRotationY(def.rot);
            cap.material = cabinetMetalMat;
            cap.isPickable = false;
        });

        // The cabinet body, and a proud moulding around the playfield's edge.
        //
        // The body runs the machine's full length - from just past the top wall down to in front
        // of the apron at z -0.62 - so the front of the cabinet has a face rather than an edge,
        // and its top sits flush under the playfield slab (which spans y -0.02 to 0).
        //
        // The moulding deliberately wraps the PLAYFIELD footprint only, not the body's. A moulding
        // is a trim line for an edge, and the only edge it has to trim is the playfield's; run
        // around the whole shell it would instead draw a bright line 21cm out in front of the
        // playfield, across the dark ball-trough area where the apron sits, marking nothing.
        const cabShellFrontZ = -0.665;
        const cabShellBackZ = TABLE_LENGTH_M / 2 + 0.018;
        const cabShellDepth = cabShellBackZ - cabShellFrontZ;
        const cabShellCentreZ = (cabShellBackZ + cabShellFrontZ) / 2;

        const cabinetBody = BABYLON.MeshBuilder.CreateBox('cabinetBody', {
            width: TABLE_WIDTH_M + 0.004,
            height: 0.09,
            depth: cabShellDepth
        }, scene);
        cabinetBody.position.set(0, -0.065, cabShellCentreZ);
        cabinetBody.material = cabinetBodyMat;
        cabinetBody.isPickable = false;

        const cabinetLip = BABYLON.MeshBuilder.CreateBox('cabinetLip', {
            width: TABLE_WIDTH_M + 0.016,
            height: 0.008,
            depth: TABLE_LENGTH_M + 0.016
        }, scene);
        cabinetLip.position.set(0, -0.024, 0);
        // Same chrome as the rails, not a second near-match: on a real machine the side rail IS
        // the cabinet's top moulding, and one bright horizontal line at the playfield's edge is
        // also the cleanest possible separation between the playfield art and everything below it.
        cabinetLip.material = cabinetMetalMat;
        cabinetLip.isPickable = false;

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
        // Playfield background/art skin slot (visual-integration pass, user-requested - "Keep
        // enough material response that the surface still looks like a physical pinball playfield
        // rather than a flat webpage image"). Populated with real artwork (see SKINS.md). The two
        // overrides just below apply UNCONDITIONALLY - to the flat-tint fallback above just as
        // much as to the textured look once applySkinTexture() resolves - deliberately: the
        // fallback and the textured surface are the same physical material with two different
        // colors/patterns on it, not two different materials, so both should share one physical
        // response:
        //   - metallic dropped from 0.3 to near-zero: a real playfield's printed art sits under a
        //     clear lacquer coat, it isn't itself a metal surface - the old 0.3 was tuned before
        //     this pass and would read as an odd metallic sheen now that real printed artwork can
        //     be layered under it.
        //   - roughness tightened slightly (0.35 -> 0.28): a bit more clearcoat-like specular
        //     "pop" under the scene's direct lights, without going glassy/mirror-flat.
        // Only albedoColor differs between the two states, and only because applySkinTexture()
        // itself resets it to white on a successful load (see that function's own comment) - nothing
        // here sets it conditionally.
        //
        // No emissiveColor was added (stays at the PBRMaterial default of black/off) - the
        // artwork's own bright glow elements (the flower-of-life's light points) already read as
        // bright via albedo under direct light; adding material-level emissive on top would wash
        // out their contrast rather than help, so none is added ("emissive contribution only
        // where necessary" - none is necessary here).
        //
        // No scene.environmentTexture was added either: matches this project's existing,
        // deliberate policy (see wallMat's own comment above) of not taking on a second fragile
        // CDN texture fetch for IBL reflections. "Subtle environmental response" instead comes
        // from the retained non-zero metallic/roughness Fresnel response Babylon's PBR model
        // already computes from direct scene lights alone, the same tradeoff wallMat already made.
        playfieldMat.metallic = 0.05;
        playfieldMat.roughness = 0.28;
        applySkinTexture(scene, playfieldMat, SKIN_MANIFEST.playfieldBackground);
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
        // Dimmed hard in the hierarchy pass. This is a diagnostic plane, not scenery - but it is
        // not dev-gated, and measured from the gameplay camera it was the third heaviest element
        // in the frame (29,528 visible pixels at p90 58), a translucent red sheet hanging under
        // and well outside the cabinet. It still catches an escaped ball and is still visible
        // enough to find one; it just stops competing for attention with the table.
        floorMat.diffuseColor = new BABYLON.Color3(0.12, 0, 0.05);
        floorMat.alpha = 0.18;
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
        // Lighting/material hierarchy pass (user-requested) - same metallic-up/emissive-down
        // rebalance as buildTable()'s wallMat above (see its own comment); this is the identical
        // "chrome rail" material family, just one more wall segment.
        laneMat.metallic = 0.72;
        laneMat.roughness = 0.3;
        laneMat.emissiveColor = COLOR_WALL.scale(0.07);

        const wall = BABYLON.MeshBuilder.CreateBox('launchLaneWall', {
            width: LANE_INNER_WALL_WIDTH_PX * PX_TO_M,
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
        // PLAYTEST BUG FIX (user-reported: "hold the plunger and release and it wouldn't hit the
        // ball with enough force, and it would constantly be stuck in a draining loop").
        //
        // This was `false`, copied from the flippers with their comment ("Havok needs to read this
        // mesh's transform every step"). For a flipper that is essential - the bat has to sweep
        // physically. For the plunger it was wrong, and it is the bug the player was hitting:
        //
        // updatePlungerVisual() pulls this mesh back along -Z by up to PLUNGER_TRAVEL_M as charge
        // builds. With prestep enabled that dragged the COLLIDER back too, and on a tilted table
        // the resting ball simply followed it down the lane - measured, holding for 2.4s walked
        // the ball from z -0.2525 to -0.2975 while the rod went -0.2806 to -0.3256. Then release
        // set chargePercent = 0, teleporting the collider forward THROUGH the ball, and Havok
        // resolved that penetration by ejecting the ball down-table: recorded leaving the lane at
        // -0.355 and running off the bottom of the table to -0.92 before the reset caught it. The
        // launch impulse was applied correctly every time and was simply overwhelmed by the
        // ejection, which is exactly why it read as "not enough force" followed by an endless
        // drain loop. A quick tap mostly escaped it because the rod barely moved.
        //
        // This is the primary cause but not the whole report: with it fixed the ball leaves the
        // lane properly, and PLUNGER_HORIZONTAL_BASE_MS's own comment covers the second half -
        // where it went from there, and why no charge level used to reach a flipper.
        //
        // The rod's stroke is animation, not mechanism - the launch is an impulse in
        // handleLaunchRelease(), never a rod strike - so the collider has no business moving.
        // Disabling prestep leaves the body at the transform it was created with (the rest pose
        // set just above) while the visible rod still animates freely. The ball now rests against
        // a stop that cannot retract out from under it, which is what createPlunger()'s own
        // "mechanical stop the resting ball leans on" description always claimed it was.
        aggregate.body.disablePreStep = true;
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
    // Vision Gate idle life. Deliberately the cheapest thing that can make a fixture look alive:
    // one rotation write and (outside reduced motion) one Color3 write per frame, on two meshes,
    // with no particle system running. The gate is visited a handful of times per game, so an
    // always-on emitter would be paying a per-frame cost for something the player is not looking
    // at - the "no constant particle spam" line this pass was asked to hold.
    //
    // Reduced motion is treated the way this file already treats the two different concerns
    // separately: the ROTATION is slowed rather than removed (ambient motion, same as
    // updateSaturnRotation() above), but the spectral hue drift is removed outright, because a
    // colour cycle is a photosensitivity trigger rather than a vestibular one - the same
    // distinction startVisionGateColorCycle() makes for the capture sequence.
    function updateVisionGateIdle(obstacles, deltaMs, clockMs) {
        const halo = obstacles.visionGateHalo;
        if (!halo) return;
        const reduced = window.SPIRITBALL_reducedMotion;
        halo.rotation.y += (reduced ? VISION_GATE_HALO_SPIN_RAD_MS * 0.15 : VISION_GATE_HALO_SPIN_RAD_MS) * deltaMs;
        if (reduced) return;
        // A slow drift across the violet end of the spectrum - never a full hue cycle, which would
        // make an idle fixture flash. Sine-driven between the gate's own colour and a cyan-shifted
        // neighbour, so at either extreme it still reads as "the Vision Gate", just breathing:
        // red falls away, green rises, blue holds. Written straight into the existing Color3
        // rather than allocating a new one, since this runs every frame.
        const t = (Math.sin(clockMs * VISION_GATE_HALO_DRIFT_RATE) + 1) / 2; // 0..1
        const level = 0.30; // the halo's step in this fixture's emissive hierarchy - see the collar
        halo.material.emissiveColor.set(
            COLOR_VISION_GATE.r * (1 - 0.45 * t) * level,
            (COLOR_VISION_GATE.g + (0.85 - COLOR_VISION_GATE.g) * t) * level,
            COLOR_VISION_GATE.b * level
        );
    }

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
    // --- Attract-mode shot list -------------------------------------------------------------
    //
    // What this replaces: a single unbounded `camera.alpha += dt * 0.00015`, i.e. a continuous
    // 360-degree orbit at 0.15 rad/s, one revolution every 42 seconds. Three problems with that,
    // all of which this shot list exists to fix:
    //
    //   1. It went BEHIND the table. alpha sweeps all the way round, so for roughly a third of
    //      every revolution the camera sat past the far end looking at the back of the backglass
    //      with the playfield edge-on or fully occluded - the table stopped reading as a pinball
    //      machine at all.
    //   2. Sustained unidirectional rotation is the single most reliable way to make a moving
    //      camera uncomfortable to watch. Constant angular velocity with no rest is exactly the
    //      motion profile to avoid.
    //   3. It showcased nothing. A uniform spin at a fixed radius never dwells, so Saturn, the
    //      bumper cluster and the flippers all just slid past at the same distance.
    //
    // The replacement is five framings with long eased moves between them and a rest at each. All
    // of them sit in the FRONT hemisphere - alpha stays within +/-0.30 rad of ATTRACT_FRONT_ALPHA,
    // which is the flipper-end vantage the gameplay camera also uses - so the playfield is never
    // hidden and the machine always reads as a pinball table.
    //
    // Angular travel is deliberately small and the work is done by dolly and target instead:
    // adjacent shots differ by at most 0.30 rad of alpha. Measured peak combined (alpha+beta)
    // rate across the whole cycle is 0.097 rad/s, against 0.15 for the constant spin this
    // replaced - and unlike that spin it occurs only in a brief eased burst between two genuinely
    // stationary holds, which is the part that matters for comfort. ATTRACT_MOVE_MS was raised
    // from 7500 to 8500 for exactly this: at 7500 the bumpers->flippers leg peaked at 0.110,
    // close enough to the budget that any later widening of a shot would have breached it.
    //
    // FOV is deliberately constant across every shot: varying it while dollying is a dolly-zoom,
    // which warps perspective and is unpleasant to sit through even when it is slow.
    const ATTRACT_FRONT_ALPHA = -Math.PI / 2;   // camera at -Z, the flipper end, looking up-table
    const ATTRACT_DWELL_MS = 5000;              // hold at each framing
    const ATTRACT_MOVE_MS = 8500;               // eased travel between framings
    // dAlpha is an offset from ATTRACT_FRONT_ALPHA. beta is Babylon's polar angle from +Y, so
    // LARGER beta = lower, more raking camera = more sky in frame; smaller = more top-down.
    const ATTRACT_SHOTS = [
        // Establishing shot: whole cabinet at a three-quarter elevation, well off-axis so it
        // reads as a 3D object rather than a flat board, loose enough to sit surrounded by space.
        { name: 'silhouette', dAlpha: 0.30, beta: 1.00, fill: 0.86, target: { x: 0, y: 0.03, z: 0.00 } },
        // Saturn is a tall centrepiece at z=+0.32. Dropping the camera a little and aiming past
        // the table's middle puts its globe and ring against the starfield instead of against the
        // playfield, which is what makes the silhouette of the ring read at all.
        { name: 'saturn', dAlpha: 0.02, beta: 1.08, fill: 0.98, target: { x: 0, y: 0.05, z: 0.13 } },
        // The cluster is a tight diamond spanning z=-0.02..0.16, and a diamond is an arrangement
        // you can only see from above - this is the most top-down beta in the cycle for exactly
        // that reason. From a low angle the four bumpers collapse into a single row.
        { name: 'bumpers', dAlpha: -0.26, beta: 0.82, fill: 0.96, target: { x: 0, y: 0.03, z: 0.04 } },
        // Flippers live at z=-0.36, but this shot does NOT aim at them. Aiming that far off the
        // table's middle throws the footprint so far off-centre that the framing solver has to
        // retreat to radius 2.2 to keep the far end on screen - measured, and it left the table at
        // 18% of frame width, a distant speck. A close-up and "never hide most of the table" are
        // simply contradictory. So the prominence comes from the ANGLE: this is the lowest beta
        // in the cycle, which puts the flipper end nearest the camera and lets perspective make
        // it loom, with the whole machine still in frame.
        { name: 'flippers', dAlpha: -0.04, beta: 1.20, fill: 0.98, clearCta: true, target: { x: 0, y: 0.015, z: -0.12 } },
        // Pull back at a low elevation to let the starfield take the top of the frame: the
        // cabinet lit and suspended in deep space. Also the largest camera TRANSLATION in the
        // cycle, which is what gives the two sky layers something to parallax against.
        { name: 'space', dAlpha: 0.26, beta: 1.12, fill: 0.82, target: { x: 0, y: 0.05, z: 0.02 } }
    ];

    // prefers-reduced-motion gets this and nothing else - no drift, no easing, no cycle. Chosen to
    // be a shot worth holding indefinitely rather than a frozen frame of the animation: slightly
    // wider and more off-axis than the silhouette shot so the whole machine, its depth and a
    // generous field of stars are all present at once.
    const ATTRACT_HERO_SHOT = { name: 'hero', dAlpha: 0.34, beta: 1.03, fill: 0.86, target: { x: 0, y: 0.03, z: 0.01 } };

    // --- Framing solver ----------------------------------------------------------------------
    //
    // Shots store a FILL, not a radius, and the radius is solved per viewport. This is not
    // over-engineering; a fixed radius provably cannot work here. camera.fov is Babylon's default
    // FOVMODE_VERTICAL_FIXED, so the horizontal field narrows as the aspect does, and a phone in
    // portrait sees the table far wider than a desktop does at the same distance. Measured: the
    // closest radius that keeps the whole table on screen is 1.09 at 1280x900 but 2.11 at
    // 390x844 for the same framing. Tuning one number for one of those breaks the other.
    //
    // The safe rect is the part of the screen the menu leaves free - measured from the title
    // block's real box, so the camera follows the layout instead of duplicating its numbers. The
    // table is allowed to sit BEHIND the bottom action block, which is the established
    // composition (HIGH SCORE reads over the playfield by design); what it must not do is touch
    // the hero title or run off the edge.
    const ATTRACT_SAFE_TOP_FALLBACK = 0.28;      // used only if the title block cannot be measured
    const ATTRACT_SAFE_BOTTOM = 0.98;            // default: the table may run behind the CTA
    const ATTRACT_SAFE_BOTTOM_FALLBACK = 0.80;   // used by clearCta shots if unmeasurable
    const ATTRACT_SAFE_SIDE = 0.03;
    // The footprint the solver fits. Table corners at y=0, plus - importantly - the backglass.
    //
    // The backglass is a lit 0.32x0.15m panel standing at y=0.28 above the far end of the table,
    // so it projects HIGHER on screen than any point on the playfield. Fitting the table alone
    // let it drift up behind the marquee: on the Saturn framing the panel's own RANK/MISSION text
    // ended up sitting directly behind "DMT VISION QUEST PINBALL", which is exactly the
    // readability problem the framing is supposed to prevent. Its corners are read from the mesh
    // rather than recomputed here, because the panel is tilted (rotation.x = 0.4) and hand-
    // deriving the rotated corners is how you end up quietly fitting the wrong box.
    //
    // A bounding SPHERE over all of this would be ~2x too conservative for geometry this flat,
    // which is why the fit works on projected corners instead.
    const ATTRACT_TABLE_CORNERS = [
        new BABYLON.Vector3(-TABLE_WIDTH_M / 2, 0, -TABLE_LENGTH_M / 2),
        new BABYLON.Vector3(TABLE_WIDTH_M / 2, 0, -TABLE_LENGTH_M / 2),
        new BABYLON.Vector3(-TABLE_WIDTH_M / 2, 0, TABLE_LENGTH_M / 2),
        new BABYLON.Vector3(TABLE_WIDTH_M / 2, 0, TABLE_LENGTH_M / 2)
    ];

    // Table corners plus the backglass's real world-space corners, once the panel exists. Called
    // from the framing cache, so this resolves on the first solve after the scene is built.
    function attractFramePoints(scene) {
        const glass = scene.getMeshByName('backglass');
        if (!glass) return ATTRACT_TABLE_CORNERS;
        glass.computeWorldMatrix(true);
        return ATTRACT_TABLE_CORNERS.concat(glass.getBoundingInfo().boundingBox.vectorsWorld);
    }

    // Whether the backglass exists yet, cheaply, without touching world matrices. The camera is
    // built BEFORE the backglass is, so the very first solve necessarily runs on table-only
    // points; this is what tells the cache to redo it once the panel appears. Keying the cache on
    // viewport alone silently pinned that first, wrong answer for the whole session.
    function attractPointCount(scene) {
        return scene.getMeshByName('backglass') ? ATTRACT_TABLE_CORNERS.length + 8 : ATTRACT_TABLE_CORNERS.length;
    }

    // Bottom of the free band for shots that set clearCta. The flipper beat needs it: flippers sit
    // at z=-0.36, the near end of the table, which projects to the very bottom of the frame -
    // directly behind the CTA. Framed against the default band, the shot showcased a green button
    // sitting on top of the thing it was supposed to be showing.
    //
    // It clears the BUTTON, not the whole action block. That distinction is load-bearing rather
    // than fussy: HIGH SCORE reading over the playfield is the established composition, and
    // clearing the entire block instead costs about 20 points of band height - measured, that
    // squeezed a 1024x700 window down to a 30%-tall band and drove the flipper shot back to a
    // table 19% of frame width, which fails "avoid angles that hide most of the table" just as
    // badly as the occlusion did. Swinging the camera sideways to dodge the CTA was tried first
    // and does not work at all: at 1024x700 every offset from -0.04 to -0.60 rad still left 3 or
    // 4 of the 4 flipper points behind the button.
    function attractSafeBottom(shot) {
        if (!shot.clearCta) return ATTRACT_SAFE_BOTTOM;
        const el = document.getElementById('menu-start-instructions');
        if (!el || !window.innerHeight) return ATTRACT_SAFE_BOTTOM_FALLBACK;
        const box = el.getBoundingClientRect();
        if (!box.height) return ATTRACT_SAFE_BOTTOM_FALLBACK;
        return Math.max(0.55, box.top / window.innerHeight - 0.015);
    }

    function attractSafeTop() {
        const el = document.querySelector('#menu-overlay .title-marquee');
        if (!el || !window.innerHeight) return ATTRACT_SAFE_TOP_FALLBACK;
        const box = el.getBoundingClientRect();
        if (!box.height) return ATTRACT_SAFE_TOP_FALLBACK;
        return Math.min(0.5, box.bottom / window.innerHeight + 0.02);
    }

    // Projected bbox of the table in normalised screen coords, straight from the camera matrices.
    // Deliberately NOT via scene.render() - the solver samples this repeatedly and rendering the
    // scene per sample turns a millisecond of arithmetic into minutes.
    function attractTableBounds(camera, points) {
        const transform = camera.getViewMatrix(true).multiply(camera.getProjectionMatrix(true));
        const engine = camera.getScene().getEngine();
        const w = engine.getRenderWidth();
        const h = engine.getRenderHeight();
        const viewport = camera.viewport.toGlobal(w, h);
        let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
        for (const corner of points) {
            const p = BABYLON.Vector3.Project(corner, BABYLON.Matrix.Identity(), transform, viewport);
            x0 = Math.min(x0, p.x / w); x1 = Math.max(x1, p.x / w);
            y0 = Math.min(y0, p.y / h); y1 = Math.max(y1, p.y / h);
        }
        return { x0, x1, y0, y1 };
    }

    // Fixed-point solve for the framing: BOTH the radius and a vertical projection shift.
    //
    // The shift is not a refinement, it is what makes the fit possible at all. ArcRotateCamera
    // puts its target at the centre of the frame, but the band the menu leaves free is not
    // centred - it runs from just under the title down to the bottom edge, roughly 0.26..0.98.
    // Fitting a centred footprint into that means only the middle ~48% of the screen is usable
    // and everything below 0.74 is wasted. Measured consequence: once the backglass joined the
    // fit, every shot was forced back to radius 2-3 and the table came out at ~20% of frame
    // width - a distant speck, which is its own failure of "avoid angles that hide most of the
    // table". Biasing the projection down instead uses the full 72% band.
    //
    // targetScreenOffset is Babylon's off-centre projection, equivalent to a shift lens: it moves
    // the image without rotating the camera, so verticals stay vertical and nothing is distorted.
    // Measured behaviour, not assumed: a POSITIVE y offset moves content UP the screen by
    // offset / (2 * radius * tan(fov/2)) of the frame height (verified to within 1.2%).
    //
    // Apparent size is very close to inversely proportional to distance, so alternating "recentre,
    // then rescale" converges in a handful of passes. Extents are measured from the band's own
    // centre, so a shot that aims off the table's middle is handled correctly rather than being
    // allowed to push its far edge into the title.
    function solveAttractFraming(camera, shot, points) {
        const safeTop = attractSafeTop();
        const safeBottom = attractSafeBottom(shot);
        const bandCentre = (safeTop + safeBottom) / 2;
        const bandHalfY = (safeBottom - safeTop) / 2;
        const bandHalfX = 0.5 - ATTRACT_SAFE_SIDE;
        const tanHalfFov = Math.tan(camera.fov / 2);

        const savedAlpha = camera.alpha, savedBeta = camera.beta, savedRadius = camera.radius;
        const savedTarget = camera.target.clone();
        const savedOffset = camera.targetScreenOffset.clone();

        camera.alpha = ATTRACT_FRONT_ALPHA + shot.dAlpha;
        camera.beta = shot.beta;
        camera.target.set(shot.target.x, shot.target.y, shot.target.z);

        let radius = 1.4;
        let offsetY = 0;
        for (let pass = 0; pass < 6; pass++) {
            camera.radius = radius;
            camera.targetScreenOffset.y = offsetY;
            const b = attractTableBounds(camera, points);
            if (!isFinite(b.y0) || !isFinite(b.y1)) break;
            const centreY = (b.y0 + b.y1) / 2;
            offsetY -= (bandCentre - centreY) * 2 * radius * tanHalfFov;
            const halfY = (b.y1 - b.y0) / 2;
            const halfX = Math.max(Math.abs(b.x0 - 0.5), Math.abs(b.x1 - 0.5));
            const need = Math.max(halfY / bandHalfY, halfX / bandHalfX);
            if (!(need > 0) || !isFinite(need)) break;
            radius *= need / shot.fill;
        }

        camera.alpha = savedAlpha; camera.beta = savedBeta; camera.radius = savedRadius;
        camera.target.copyFrom(savedTarget);
        camera.targetScreenOffset.copyFrom(savedOffset);
        return { radius, offsetY };
    }

    // Solved radii, cached per render size - the solve is cheap but there is no reason to redo it
    // 60 times a second when it only ever changes on resize.
    function makeAttractFraming(camera) {
        let key = '';
        let radii = [];
        let heroRadius = 1.5;
        return function framing() {
            const engine = camera.getScene().getEngine();
            const scene = camera.getScene();
            const next = engine.getRenderWidth() + 'x' + engine.getRenderHeight() + '/' + attractPointCount(scene);
            if (next !== key) {
                key = next;
                const points = attractFramePoints(scene);
                radii = ATTRACT_SHOTS.map((shot) => solveAttractFraming(camera, shot, points));
                heroRadius = solveAttractFraming(camera, ATTRACT_HERO_SHOT, points);
            }
            return { radii, heroRadius };
        };
    }

    // Smootherstep, not smoothstep: zero first AND second derivative at both ends. The camera
    // therefore starts and stops with no perceptible acceleration step, which is what keeps a
    // move this size from registering as a lurch.
    function smootherStep(t) {
        return t * t * t * (t * (t * 6 - 15) + 10);
    }

    // Drives one continuous loop through ATTRACT_SHOTS. Advances a single clock rather than
    // integrating camera state, so it cannot accumulate drift over a long idle on the menu.
    function updateAttractCamera(camera, elapsedMs, framing) {
        const { radii } = framing();
        const span = ATTRACT_DWELL_MS + ATTRACT_MOVE_MS;
        const cycle = span * ATTRACT_SHOTS.length;
        const t = ((elapsedMs % cycle) + cycle) % cycle;
        const index = Math.floor(t / span);
        const local = t - index * span;
        const nextIndex = (index + 1) % ATTRACT_SHOTS.length;
        const from = ATTRACT_SHOTS[index];
        const to = ATTRACT_SHOTS[nextIndex];
        // Hold for the whole dwell, then ease across - k is exactly 0 until the move begins, so
        // the camera is genuinely stationary at each framing rather than creeping through it.
        const k = local <= ATTRACT_DWELL_MS ? 0 : smootherStep((local - ATTRACT_DWELL_MS) / ATTRACT_MOVE_MS);
        const mix = (a, b) => a + (b - a) * k;
        camera.alpha = ATTRACT_FRONT_ALPHA + mix(from.dAlpha, to.dAlpha);
        camera.beta = mix(from.beta, to.beta);
        camera.radius = mix(radii[index].radius, radii[nextIndex].radius);
        camera.targetScreenOffset.y = mix(radii[index].offsetY, radii[nextIndex].offsetY);
        camera.target.set(
            mix(from.target.x, to.target.x),
            mix(from.target.y, to.target.y),
            mix(from.target.z, to.target.z)
        );
    }

    // The reduced-motion pose. Re-applied rather than set once, so the framing still adapts if the
    // window is resized or a phone is rotated - a held shot must stay correctly composed, and
    // holding still is not the same as never updating.
    function applyAttractHero(camera, framing) {
        const { heroRadius } = framing();
        camera.alpha = ATTRACT_FRONT_ALPHA + ATTRACT_HERO_SHOT.dAlpha;
        camera.beta = ATTRACT_HERO_SHOT.beta;
        camera.radius = heroRadius.radius;
        camera.targetScreenOffset.y = heroRadius.offsetY;
        camera.target.set(ATTRACT_HERO_SHOT.target.x, ATTRACT_HERO_SHOT.target.y, ATTRACT_HERO_SHOT.target.z);
    }

    function buildAttractCamera(scene) {
        const opening = window.SPIRITBALL_reducedMotion ? ATTRACT_HERO_SHOT : ATTRACT_SHOTS[0];
        const camera = new BABYLON.ArcRotateCamera(
            'attractCamera',
            ATTRACT_FRONT_ALPHA + opening.dAlpha,
            opening.beta,
            1.4, // placeholder - replaced immediately below by the solved radius for this viewport
            new BABYLON.Vector3(opening.target.x, opening.target.y, opening.target.z),
            scene
        );
        camera.minZ = 0.01;
        camera.fov = BABYLON.Tools.ToRadians(50);
        camera.framing = makeAttractFraming(camera);
        if (window.SPIRITBALL_reducedMotion) applyAttractHero(camera, camera.framing);
        else updateAttractCamera(camera, 0, camera.framing);
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
    //
    // Starfield upgrade pass (user-requested - four star classes, non-uniform distribution,
    // clustering, large intentional voids, subtle nebula, deterministic seed, "should look like
    // SPACE, not glitter"). Still exactly ONE DynamicTexture on the ONE existing skybox sphere:
    // no extra meshes, no particle field, no external image, nothing per-frame. The entire cost
    // is a single canvas bake at startup, same as before - only the contents changed.
    //
    // The previous field was a uniform scatter of two tiers at 512 square. Three things made it
    // read as glitter rather than sky, and each is addressed below rather than tuned around:
    //   - UNIFORM (u,v) IS NOT UNIFORM ON A SPHERE. It piles stars into the poles, where an entire
    //     texture row collapses to a single point. Stars are now drawn from the correct
    //     inverse-CDF, so density is even in solid angle.
    //   - EVEN SPACING IS THE ONE THING A REAL SKY NEVER HAS. Stars now come from a density field
    //     (a tilted galactic band times two octaves of periodic value noise, gamma-shaped hard),
    //     which produces clustering and large genuinely-empty regions from the same mechanism.
    //   - A SUB-PIXEL arc() IS A GREY SMUDGE, NOT A STAR. The faint majority are now hard 1px
    //     fillRects; only stars big enough to have a shape are drawn as circles.
    // Plus a resolution and aspect change that is doing more work than any of the tuning (see the
    // width/height comment), and a seeded PRNG so the sky stops being different every reload.
    //
    // Everything scales with highFidelity like every other decorative count in this file, detected
    // locally rather than threaded in as a parameter - the same "cheap and stateless, re-read
    // here" pattern buildObstacles() uses - so main()'s buildSkybox() call site needs no change.
    // Deterministic seed. The sky is a place, not a lottery: the same field every reload means a
    // player recognises their cabinet's backdrop, screenshots stay comparable across runs, and
    // this file's own visual testing is repeatable at all. Any 32-bit constant works; this one is
    // just "SPIRITBALL" squinted at in hex.
    const STARFIELD_SEED = 0x5B17BA11;

    // mulberry32 - 4 lines, no dependency, statistically fine for scattering dots and, unlike
    // Math.random(), seedable. Every random draw in createStarfieldTexture() comes from here.
    function makeSeededRandom(seed) {
        let a = seed >>> 0;
        return function next() {
            a = (a + 0x6D2B79F5) >>> 0;
            let t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    // Approximate sRGB for a stellar spectral class, hottest (blue) to coolest (orange-red). Real
    // temperature ordering, not a decorative palette - it is what stops the coloured stars reading
    // as confetti: an eye that has ever looked up knows blue-white and amber belong in a sky and
    // green and magenta do not.
    const STAR_TEMPERATURE_COLORS = [
        '155,176,255', // O/B - hot blue, genuinely rare
        '202,215,255', // A   - blue-white
        '248,247,255', // F   - white
        '255,244,234', // G   - yellow-white, our own sun
        '255,214,170', // K   - orange
        '255,184,140'  // M   - cool orange-red
    ];

    function createStarfieldTexture(scene) {
        const highFidelity = detectHighFidelity();

        // 2:1, not square. A UV sphere is an equirectangular projection: u spans 2*PI of longitude
        // and v spans PI of latitude, so a square texture spends half its pixels over-sampling the
        // vertical axis. At 2:1 the same byte budget buys twice the horizontal resolution, which
        // is the axis that matters - the camera's ~40 degree FOV crops roughly a ninth of the
        // circumference, so the old 512-square gave about 57 texture pixels across a 390px-wide
        // phone screen. Every star was therefore a blurry ~7px smear of a 1px dot, which is most
        // of why the old field read as glitter rather than as sky. 2048x1024 is 8.4MB of VRAM on
        // the high tier (1024x512 and 2.1MB on the low one, still 2x the old horizontal density
        // for near-identical memory).
        const width = highFidelity ? 2048 : 1024;
        const height = width / 2;
        // Mipmaps stay OFF (the constructor's generateMipMaps argument). This texture is
        // MAGNIFIED, not minified - see the FOV maths above - so a mip chain would cost 33% more
        // memory to supply levels that are never sampled, and any level that did get sampled would
        // average the dim single-pixel stars straight out of existence.
        const texture = new BABYLON.DynamicTexture('starfieldTex', { width, height }, scene, false);
        const ctx = texture.getContext();
        const rand = makeSeededRandom(STARFIELD_SEED);

        // -------------------------------------------------------------------------------------
        // Where stars are ALLOWED to be. Three multiplied fields, evaluated per candidate:
        //
        //   1. Sphere-area correction. Uniform (u, v) is NOT uniform on a sphere - it piles stars
        //      into the poles, where a whole texture row collapses to a point. v is drawn as
        //      acos(1-2r)/PI instead, the standard inverse-CDF for uniform sphere sampling, so
        //      density is even in solid angle rather than in texture space.
        //   2. A galactic band. One broad, tilted great circle of raised density, because the
        //      single strongest "this is space" cue available is that stars are not scattered
        //      evenly - they run in a band, with the sky away from it comparatively empty.
        //   3. Two octaves of periodic value noise, gamma-shaped hard. This is what produces
        //      clustering AND the large intentional voids in one mechanism: after pow(n, 2.2) a
        //      good half of the sky sits near zero density and simply gets no stars.
        //
        // The lattice wraps in x so the field is seamless across the u=0 meridian, which matters
        // because the whole texture wraps around the sphere.
        // -------------------------------------------------------------------------------------
        const GX = 48, GY = 24;
        const lattice = new Float32Array(GX * GY);
        for (let i = 0; i < lattice.length; i++) lattice[i] = rand();
        function latticeAt(gx, gy) {
            const x = ((gx % GX) + GX) % GX;
            const y = Math.min(GY - 1, Math.max(0, gy));
            return lattice[y * GX + x];
        }
        function valueNoise(u, v, freq) {
            const fx = u * GX * freq, fy = v * GY * freq;
            const x0 = Math.floor(fx), y0 = Math.floor(fy);
            const tx = fx - x0, ty = fy - y0;
            const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty); // smoothstep
            const a = latticeAt(x0, y0), b = latticeAt(x0 + 1, y0);
            const c = latticeAt(x0, y0 + 1), d = latticeAt(x0 + 1, y0 + 1);
            return (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
        }
        // Latitude of the band's centreline at a given longitude - one sine, so the band reads as
        // a great circle crossing the sky at an angle rather than a stripe painted round the
        // equator.
        function bandCenter(u) {
            return 0.5 + 0.17 * Math.sin(u * Math.PI * 2 + 1.1);
        }
        function bandWeight(u, v) {
            const d = (v - bandCenter(u)) / 0.19;
            return Math.exp(-d * d * 1.5);
        }
        function density(u, v) {
            const n = 0.62 * valueNoise(u, v, 1) + 0.38 * valueNoise(u, v, 2.7);
            const clustered = Math.pow(n, 2.2);
            return Math.min(1, clustered * (0.26 + 1.15 * bandWeight(u, v)));
        }
        // Rejection sampling against that field. Bounded attempts so a pathological seed can never
        // spin here; a candidate that never lands simply yields one fewer star.
        function sampleStar() {
            for (let k = 0; k < 24; k++) {
                const u = rand();
                const v = Math.acos(1 - 2 * rand()) / Math.PI;
                if (rand() < density(u, v)) return { u, v, x: u * width, y: v * height };
            }
            return null;
        }

        // Anything with a halo has to be drawn twice near the seam, or its glow is sliced in half
        // at the u=0 meridian - invisible in a texture viewer, obvious as a vertical scar on the
        // sphere.
        function drawWrapped(x, reach, paint) {
            paint(x);
            if (x < reach) paint(x + width);
            else if (x > width - reach) paint(x - width);
        }

        // A circle in texture space is an ellipse on the sphere: at latitude theta a fixed du
        // covers only sin(theta) of the arc it covers at the equator, so a star near a pole is
        // squeezed horizontally. Drawing it 1/sin(theta) wider cancels that out, and it is only
        // applied to the classes big enough for the distortion to be visible - a 1px dot cannot
        // look squashed.
        // Clamped at 2.5x rather than at the mathematically-correct limit. The correction is a
        // small-angle approximation, and close to a pole a star wide enough to need more than
        // 2.5x is also wide enough to span real longitude and wrap around the pole rather than
        // stay a disc - a first attempt clamped at 6.25x and put two obvious horizontal smears
        // along the top edge of the texture. Under-correcting leaves a slightly oval star in a
        // region the sphere sampling already keeps nearly empty; over-correcting draws a streak.
        function poleStretch(v) {
            return 1 / Math.max(0.4, Math.sin(v * Math.PI));
        }

        // -------------------------------------------------------------------------------------
        // 1. BASE. Near-black, with the faintest possible warm lift along the band - the diffuse
        //    glow of stars too dim to resolve individually. Kept far below the table's own
        //    lighting: this is the darkest surface in the scene by a wide margin, and every alpha
        //    in this function was chosen to keep it that way.
        // -------------------------------------------------------------------------------------
        const base = ctx.createLinearGradient(0, 0, 0, height);
        base.addColorStop(0, '#120026');
        base.addColorStop(0.5, '#080018');
        base.addColorStop(1, '#03000b');
        ctx.fillStyle = base;
        ctx.fillRect(0, 0, width, height);

        // Unresolved galactic glow, painted as a run of soft blobs along the band's own
        // centreline rather than one rectangle, so its edges are irregular the way a real one is.
        for (let i = 0; i < 26; i++) {
            const u = i / 26 + (rand() - 0.5) * 0.02;
            const cx = u * width;
            const cy = (bandCenter(u) + (rand() - 0.5) * 0.06) * height;
            const r = height * (0.12 + rand() * 0.13);
            const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
            glow.addColorStop(0, 'rgba(120, 130, 190, 0.038)');
            glow.addColorStop(1, 'rgba(120, 130, 190, 0)');
            ctx.fillStyle = glow;
            drawWrapped(cx, r, (px) => ctx.fillRect(px - r, cy - r, r * 2, r * 2));
        }

        // -------------------------------------------------------------------------------------
        // 2. NEBULA HAZE + DUST LANES. Colour first, then darkness on top of it. The dust is the
        //    half that actually sells it: real nebulosity is cut through by opaque lanes, and
        //    subtracting light in large soft shapes is what keeps the field from looking like an
        //    evenly-sprinkled screen. Both are anchored to the band, not scattered at random.
        // -------------------------------------------------------------------------------------
        const nebulaHues = ['92,64,168', '38,104,132', '134,52,110', '70,86,170'];
        const nebulaCount = highFidelity ? 7 : 4;
        for (let i = 0; i < nebulaCount; i++) {
            const u = rand();
            const cx = u * width;
            const cy = (bandCenter(u) + (rand() - 0.5) * 0.34) * height;
            const r = height * (0.16 + rand() * 0.22);
            const rgb = nebulaHues[Math.floor(rand() * nebulaHues.length)];
            const blob = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
            blob.addColorStop(0, 'rgba(' + rgb + ',0.055)');
            blob.addColorStop(0.55, 'rgba(' + rgb + ',0.022)');
            blob.addColorStop(1, 'rgba(' + rgb + ',0)');
            ctx.fillStyle = blob;
            drawWrapped(cx, r, (px) => ctx.fillRect(px - r, cy - r, r * 2, r * 2));
        }
        const dustCount = highFidelity ? 6 : 3;
        for (let i = 0; i < dustCount; i++) {
            const u = rand();
            const cx = u * width;
            const cy = (bandCenter(u) + (rand() - 0.5) * 0.16) * height;
            const r = height * (0.09 + rand() * 0.16);
            const dust = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
            dust.addColorStop(0, 'rgba(2, 0, 8, 0.5)');
            dust.addColorStop(1, 'rgba(2, 0, 8, 0)');
            ctx.fillStyle = dust;
            drawWrapped(cx, r, (px) => ctx.fillRect(px - r, cy - r, r * 2, r * 2));
        }

        // -------------------------------------------------------------------------------------
        // 3. STARS, in four classes. Counts are per-pixel-area constants so they hold at either
        //    resolution, and the population is deliberately pyramid-shaped: the overwhelming
        //    majority are barely-there pixels, and each brighter class is roughly an order of
        //    magnitude rarer than the one below it. That ratio is the difference between a sky
        //    and a sprinkle of glitter - if the bright stars are common enough to notice as a
        //    group, the illusion is gone.
        // -------------------------------------------------------------------------------------
        const areaScale = (width * height) / (2048 * 1024);
        // Star RADII are in texture pixels, so they have to scale with the texture or the same
        // star subtends twice the angle on the low tier as on the high one. That is not a subtle
        // difference: the low tier is also magnified twice as hard on screen (half the texture
        // across the same FOV), so leaving radii absolute made its bright stars land at roughly
        // 17 screen px against the high tier's 8. Scaled here, both tiers draw the same sky at
        // different sample rates rather than two different skies. The class-1 field stars are the
        // exception - one pixel is the smallest thing a canvas can draw, so on the low tier they
        // are unavoidably twice the angular size, which is simply what a coarser sky costs.
        const px = width / 2048;

        // Class 1 - the field. Single pixels via fillRect on integer coordinates, NOT arc(): a
        // sub-pixel arc is antialiased into a soft grey smudge across four pixels, which is
        // exactly the mush the old field was made of. A hard 1px dot at low alpha is what reads
        // as a distant star.
        const fieldCount = Math.round((highFidelity ? 4200 : 2600) * areaScale);
        for (let i = 0; i < fieldCount; i++) {
            const s = sampleStar();
            if (!s) continue;
            const alpha = 0.05 + rand() * rand() * 0.20; // squared -> most sit near the floor
            ctx.fillStyle = 'rgba(255,253,247,' + alpha.toFixed(3) + ')';
            ctx.fillRect(Math.floor(s.x), Math.floor(s.y), 1, 1);
        }

        // Class 2 - resolvable but unremarkable. Still small, still no halo.
        const mediumCount = Math.round((highFidelity ? 620 : 380) * areaScale);
        for (let i = 0; i < mediumCount; i++) {
            const s = sampleStar();
            if (!s) continue;
            const r = (0.55 + rand() * 0.75) * px;
            ctx.fillStyle = 'rgba(255,252,244,' + (0.22 + rand() * 0.3).toFixed(3) + ')';
            ctx.beginPath();
            ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
            ctx.fill();
        }

        // Class 3 - the sky's punctuation. Rare enough to be individually noticeable, each with a
        // soft halo so it reads as bright rather than merely large.
        const brightCount = Math.round((highFidelity ? 74 : 40) * areaScale);
        for (let i = 0; i < brightCount; i++) {
            const s = sampleStar();
            if (!s) continue;
            const r = (1.1 + rand() * 1.0) * px;
            const sx = poleStretch(s.v);
            const reach = r * 5 * sx;
            drawWrapped(s.x, reach, (px) => {
                const halo = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 5);
                halo.addColorStop(0, 'rgba(255,255,255,0.16)');
                halo.addColorStop(1, 'rgba(255,255,255,0)');
                ctx.save();
                ctx.translate(px, s.y);
                ctx.scale(sx, 1);
                ctx.fillStyle = halo;
                ctx.fillRect(-r * 5, -r * 5, r * 10, r * 10);
                ctx.fillStyle = 'rgba(255,255,255,' + (0.7 + rand() * 0.3).toFixed(3) + ')';
                ctx.beginPath();
                ctx.arc(0, 0, r, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            });
        }

        // Class 4 - the handful with visible colour. Weighted toward the middle of the
        // temperature ramp, so blue giants and red dwarfs are the exception rather than half the
        // set, and given a wider, tinted halo since these are the only stars whose colour has to
        // survive being magnified across the screen.
        const coloredCount = Math.round((highFidelity ? 13 : 7) * areaScale);
        for (let i = 0; i < coloredCount; i++) {
            const s = sampleStar();
            if (!s) continue;
            // Average of two rolls: triangular, centred on the white/yellow classes.
            const idx = Math.min(STAR_TEMPERATURE_COLORS.length - 1,
                Math.floor(((rand() + rand()) / 2) * STAR_TEMPERATURE_COLORS.length));
            const rgb = STAR_TEMPERATURE_COLORS[idx];
            const r = (1.4 + rand() * 1.2) * px;
            const sx = poleStretch(s.v);
            const reach = r * 7 * sx;
            drawWrapped(s.x, reach, (px) => {
                const halo = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 7);
                halo.addColorStop(0, 'rgba(' + rgb + ',0.24)');
                halo.addColorStop(0.4, 'rgba(' + rgb + ',0.07)');
                halo.addColorStop(1, 'rgba(' + rgb + ',0)');
                ctx.save();
                ctx.translate(px, s.y);
                ctx.scale(sx, 1);
                ctx.fillStyle = halo;
                ctx.fillRect(-r * 7, -r * 7, r * 14, r * 14);
                ctx.fillStyle = 'rgba(' + rgb + ',0.95)';
                ctx.beginPath();
                ctx.arc(0, 0, r, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            });
        }

        texture.update();
        return texture;
    }

    // ===================================================================================
    // NEAR STAR LAYER (user-requested - "subtle DEPTH... at most one inexpensive secondary star
    // layer that gives the background depth during attract-camera movement"). Exactly one extra
    // sphere and one extra texture; the existing sky sphere is untouched.
    //
    // WHY THE EXISTING SPHERE ALONE CANNOT DO THIS. buildSkybox()'s sphere sets
    // infiniteDistance = true, which pins it to the camera every frame. That is the correct
    // behaviour for a backdrop - it guarantees no edge is ever revealed - but it also means camera
    // TRANSLATION produces exactly zero parallax, and translation is the only depth cue the
    // attract orbit actually has. So the second layer's whole job is to NOT be pinned: it is
    // positioned at camera.position scaled by (1 - NEAR_SKY_PARALLAX) each frame, which is the
    // classic parallax-layer trick and gives a single tunable knob:
    //     0 -> identical to infiniteDistance, no depth at all
    //     1 -> world-locked, full parallax
    // At 0.28 the layer's centre lags the camera by 0.28 * |camera.position|. The attract camera
    // orbits at radius 1.4, so that is a 0.39m offset against the layer's own 8-unit radius:
    // atan(0.39 / 8) = 2.8 degrees of differential drift across the orbit. Subtle by construction,
    // and it needs no separate "is attract mode running" flag - the gameplay camera is FIXED, so
    // its position never changes, so the parallax term is a constant and the layer simply sits
    // still. "Nearly imperceptible during gameplay" falls out of the geometry rather than being
    // special-cased.
    //
    // Radius 8 is deliberately INSIDE the existing sphere's radius of 10. An infiniteDistance mesh
    // still writes real depth (it is pinned to the camera, not pushed to the far plane), so a
    // layer further out than 10 would simply be depth-rejected by the backdrop. Staying inside
    // means ordinary depth testing does the right thing with no rendering-group surgery: the table
    // occludes this layer, this layer draws over the backdrop.
    //
    // COST. One sphere at 16 segments, one 1024x512 texture (2MB, half that on the low tier), one
    // additive draw call, and per frame a vector scale plus one float add. Additive blending means
    // black texels contribute nothing and draw order does not matter; depth WRITE is off so it can
    // never occlude anything, and backface culling is on so it costs one screen of fill, not two.
    // ===================================================================================
    const NEAR_SKY_SEED = 0x2C0FFEE1;
    const NEAR_SKY_RADIUS = 8;
    const NEAR_SKY_PARALLAX = 0.28;
    // Slightly faster than the backdrop's own SKYBOX_SPIN_RATE_RAD_MS, so the two layers shear
    // past each other instead of turning as one painted shell. Still one rotation per ~11 minutes:
    // the differential is a depth cue you notice having happened, never a motion you can watch.
    const NEAR_SKY_SPIN_RATE_RAD_MS = 0.0000095;
    // Between the sky spheres (8 and effectively 10) and the cabinet (never closer to the camera
    // than about 0.4, never further than about 1.6). Any value in that band works - the quad is
    // scaled to the frustum, so its distance changes nothing about how much screen it covers.
    const VIGNETTE_DISTANCE = 5;

    function createNearStarTexture(scene, highFidelity) {
        const width = highFidelity ? 1024 : 512;
        const height = width / 2;
        const texture = new BABYLON.DynamicTexture('nearStarTex', { width, height }, scene, false);
        const ctx = texture.getContext();
        const rand = makeSeededRandom(NEAR_SKY_SEED);

        // Opaque black, not transparent: this layer is composited additively, so black is the
        // identity and an alpha channel would buy nothing but a chance of premultiplication
        // artifacts around every star.
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, width, height);

        // Deliberately NOT the backdrop's galactic band. The band is unresolved distant stars, so
        // reproducing it here would put the same structure at two different depths and read as a
        // registration error. Nearby stars are scattered - so these are drawn uniformly over the
        // sphere (same acos inverse-CDF as the backdrop, for the same reason) with no density
        // field at all, which also makes this generator trivially cheap.
        const px = width / 1024;
        // Sparse on purpose. Measured rather than guessed: differencing a full render against the
        // same frame with this layer disabled counts 27-31 of these stars actually on screen at
        // any moment, which is plenty of points for an eye to read a plane moving at its own rate
        // - and still two orders of magnitude below the backdrop's own field, because this layer
        // is punctuation, not a second sky. (Eyeballing a brightness-boosted crop suggested only
        // two were visible and nearly sent this count far higher; the isolated difference is what
        // the number is set from.)
        const count = Math.round(highFidelity ? 130 : 72);
        for (let i = 0; i < count; i++) {
            const v = Math.acos(1 - 2 * rand()) / Math.PI;
            const x = rand() * width;
            const y = v * height;
            // Radii are corrected for the fact that this layer is magnified roughly TWICE as hard
            // as the backdrop on screen - its sphere is closer (radius 8 against an effective 10)
            // and its texture is half the width, so 1024/360 = 2.84 texture px per degree against
            // the backdrop's 5.69. A first pass used radii comparable to the backdrop's bright
            // class and the result was unmistakable in a camera screenshot: soft blobs four times
            // the size of any real star, which read as lens dirt rather than depth. Halved here,
            // so a near star lands at about the same on-screen size as a backdrop bright star.
            // "Nearer" is then carried entirely by the thing that actually carries it - moving at
            // its own rate - rather than by being fatter.
            const r = (0.45 + rand() * 0.55) * px;
            const roll = rand();
            const tint = roll < 0.12 ? '186,208,255' : roll < 0.22 ? '255,224,190' : '255,253,248';
            const sx = 1 / Math.max(0.4, Math.sin(v * Math.PI)); // same clamped pole correction as the backdrop
            const reach = r * 4 * sx;
            const paint = (cx) => {
                const halo = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 4);
                halo.addColorStop(0, 'rgba(' + tint + ',0.15)');
                halo.addColorStop(1, 'rgba(' + tint + ',0)');
                ctx.save();
                ctx.translate(cx, y);
                ctx.scale(sx, 1);
                ctx.fillStyle = halo;
                ctx.fillRect(-r * 4, -r * 4, r * 8, r * 8);
                ctx.fillStyle = 'rgba(' + tint + ',' + (0.72 + rand() * 0.26).toFixed(3) + ')';
                ctx.beginPath();
                ctx.arc(0, 0, r, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            };
            paint(x);
            if (x < reach) paint(x + width);
            else if (x > width - reach) paint(x - width);
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
        skybox.infiniteDistance = true; // stays centered on the camera - translation never reveals an edge or creates parallax of its own

        const nearMat = new BABYLON.StandardMaterial('nearSkyMat', scene);
        nearMat.disableLighting = true;
        nearMat.diffuseColor = new BABYLON.Color3(0, 0, 0);
        nearMat.emissiveTexture = createNearStarTexture(scene, detectHighFidelity());
        // Additive: black adds nothing, so the layer is pure extra starlight over the backdrop and
        // is order-independent. alpha < 1 is what actually routes a StandardMaterial into the
        // blended pass - alphaMode alone does not - and at 0.985 it is doing nothing else.
        nearMat.alpha = 0.985;
        nearMat.alphaMode = BABYLON.Engine.ALPHA_ADD;
        nearMat.disableDepthWrite = true; // may tint what is behind it, must never occlude anything
        nearMat.backFaceCulling = true;   // inside faces only - one screen of fill, not two

        const nearSky = BABYLON.MeshBuilder.CreateSphere('nearSky', {
            diameter: NEAR_SKY_RADIUS * 2,
            segments: 16, // a backdrop needs no silhouette; 16 is ~500 triangles
            sideOrientation: BABYLON.Mesh.BACKSIDE
        }, scene);
        nearSky.material = nearMat;
        nearSky.isPickable = false;
        // The camera is always inside this sphere, so it is always visible - skipping the frustum
        // test is both free and immune to the "camera inside a mesh gets culled" class of bug.
        nearSky.alwaysSelectAsActiveMesh = true;

        // The parallax follow is registered here, on the per-camera pre-render hook, rather than
        // done alongside the spin in the render loop. Not a style choice: the loop advances the
        // attract camera's orbit AFTER it updates the sky, so positioning the layer there left it
        // one frame stale - harmless at 60fps (0.025 degrees) but measurable at software-renderer
        // frame rates, and under reduced motion "pinned to the camera" has to mean pinned, not
        // pinned-as-of-last-frame. This hook runs with the camera's final transform for the frame,
        // whichever camera is active, so the offset is exact by construction.
        scene.onBeforeCameraRenderObservable.add((cam) => {
            const parallax = window.SPIRITBALL_reducedMotion ? 0 : NEAR_SKY_PARALLAX;
            nearSky.position.copyFrom(cam.position).scaleInPlace(1 - parallax);
        });

        // ===================================================================================
        // BACKGROUND VIGNETTE (user-requested - "the cabinet appears illuminated and suspended in
        // deep space... centre receives strongest focus, outer screen falls into deeper darkness
        // ... do not darken the actual playfield").
        //
        // A post-process vignette cannot do this job here. DefaultRenderingPipeline has one built
        // in, but it darkens the FINAL IMAGE, and the cabinet does not politely stay in the middle
        // of it: measured on a 390px viewport the table spans the full screen width at the bottom,
        // so any vignette strong enough to matter would be shading the flippers. That is the one
        // thing the request rules out.
        //
        // So the darkening is geometry instead of post-processing, and its own depth does the
        // discriminating: a screen-filling quad parented to the camera, 5 units out - in front of
        // both sky spheres (8 and effectively 10) and well behind the cabinet (under 1.6). It is
        // alpha-blended with depth-WRITE off and depth-TEST on, so it composites over background
        // pixels and is rejected by every pixel the opaque cabinet already wrote. The playfield is
        // not "carefully avoided" by tuning - it is unreachable by construction.
        //
        // Draw order is pinned with alphaIndex rather than left to distance sorting, because
        // distance sorting gets this exactly backwards: the near star layer's bounding sphere is
        // centred a few centimetres from the camera, so it sorts as the CLOSEST transparent mesh
        // and would draw last - over the vignette, and over the particle effects too. Explicit
        // indices give sky -> vignette -> everything else. (Everything else keeps Babylon's
        // default alphaIndex of Number.MAX_VALUE, so this only orders these two.)
        // ===================================================================================
        nearSky.alphaIndex = 0;

        const vigSize = 512;
        const vigTex = new BABYLON.DynamicTexture('skyVignetteTex', { width: vigSize, height: vigSize }, scene, true);
        const vctx = vigTex.getContext();
        // Gradient radius is the half-DIAGONAL, not the half-width, so alpha keeps climbing all
        // the way into the corners instead of flattening off at the edge midpoints - the corners
        // are the deepest part of the falloff, which is what makes it read as depth rather than as
        // a dark frame.
        const vg = vctx.createRadialGradient(vigSize / 2, vigSize / 2, 0, vigSize / 2, vigSize / 2, vigSize * 0.707);
        // Stops are authored as the DARKENING WANTED, then converted to texture alpha, because
        // the two are not the same number. Measured on a real frame by painting this texture a
        // series of uniform alphas and reading back the sky: a texture alpha of a produces an
        // effective blend of a^1.99 - the engine blends in linear light and the framebuffer is
        // sRGB-encoded, so half alpha buys about a quarter of the effect. Authoring against raw
        // alpha is what made two earlier passes at these numbers come out barely visible: the
        // ramp asked for 74% in the corners and delivered 24%.
        const vigStop = (r, darkening) => vg.addColorStop(r, 'rgba(255,255,255,' + Math.sqrt(darkening).toFixed(4) + ')');
        vigStop(0.00, 0.04); // centre: imperceptible - the sky immediately behind the cabinet stays a sky
        vigStop(0.35, 0.10);
        vigStop(0.62, 0.32);
        vigStop(0.82, 0.55);
        vigStop(1.00, 0.78); // corners: most of the light gone, so nothing out here competes with the ball
        vctx.fillStyle = vg;
        vctx.fillRect(0, 0, vigSize, vigSize);
        vigTex.update();
        vigTex.wrapU = BABYLON.Texture.CLAMP_ADDRESSMODE;
        vigTex.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;

        const vigMat = new BABYLON.StandardMaterial('skyVignetteMat', scene);
        vigMat.disableLighting = true;
        vigMat.diffuseColor = new BABYLON.Color3(0, 0, 0);
        // A hint of violet rather than a dead grey, but genuinely DARKER than the sky it is laid
        // over - which the first attempt was not. That one used (0.008, 0, 0.030), about RGB
        // (2, 0, 8), which is very nearly the deep-sky background's own colour: blending 76%
        // toward a colour the background already is dims the peripheral stars nicely and does
        // almost nothing to the field between them, and the measured falloff came out at 76% of
        // brightness retained in the corners where the alpha ramp asks for 26%. The value below
        // is a quarter of that luminance, so the ramp actually has somewhere to go.
        vigMat.emissiveColor = new BABYLON.Color3(0.002, 0.0, 0.010);
        vigMat.opacityTexture = vigTex; // alpha channel drives it; RGB above is the colour it fades to
        vigMat.disableDepthWrite = true;
        vigMat.backFaceCulling = false;

        const vignette = BABYLON.MeshBuilder.CreatePlane('skyVignette', { size: 1 }, scene);
        vignette.material = vigMat;
        vignette.isPickable = false;
        vignette.alwaysSelectAsActiveMesh = true;
        vignette.alphaIndex = 1;

        // Parented to the active camera rather than positioned by hand every frame: a child at
        // local (0, 0, VIGNETTE_DISTANCE) is screen-aligned and in front for free, with no
        // per-frame quaternion work. Re-parenting only happens on the one frame the active camera
        // actually changes (attract -> gameplay).
        scene.onBeforeCameraRenderObservable.add((cam) => {
            if (vignette.parent !== cam) {
                vignette.parent = cam;
                vignette.position.set(0, 0, VIGNETTE_DISTANCE);
                vignette.rotation.set(0, 0, 0);
            }
            // Sized to the frustum every frame, because the aspect ratio changes on rotate/resize
            // and a quad that stops short of the edge is far more obvious than one that overhangs.
            // Babylon's default FOVMODE_VERTICAL_FIXED makes height the fixed axis.
            const engine = scene.getEngine();
            const h = 2 * VIGNETTE_DISTANCE * Math.tan(cam.fov / 2) * 1.06; // 6% overscan
            vignette.scaling.set(h * (engine.getRenderWidth() / engine.getRenderHeight()), h, 1);
        });

        return { far: skybox, near: nearSky, vignette };
    }

    // Per-frame sky update - both layers, one call. Two independent mechanisms:
    //
    //   SPIN. Each sphere turns on its own axis at its own rate (backdrop ~17 minutes per
    //   rotation, near layer ~11). This is what a FIXED camera can be shown: the gameplay camera
    //   never moves (buildCamera()'s own comment - "must never be player-controllable during
    //   gameplay"), so translation-based parallax has nothing to work with there, but the sky
    //   drifting against itself still reads as ambient depth. Imperceptible frame to frame by
    //   design; the differential between the two rates is the whole point.
    //
    //   PARALLAX. Only the near layer, and only from camera translation - see NEAR_SKY_PARALLAX.
    //   It is dormant during gameplay for free (fixed camera -> constant term) and does its actual
    //   work during the attract orbit, which is precisely where the request asked for depth.
    //
    // Runs through pause/menu/game-over like updateSaturnRotation() above, being ambient decoration
    // rather than gameplay feedback. Unlike that one it now stops DEAD under reduced motion rather
    // than merely slowing - see the guard below.
    const SKYBOX_SPIN_RATE_RAD_MS = 0.000006;
    function updateSkyboxLayers(layers, deltaMs) {
        // Reduced motion: a HARD stop, not the 15%-rate slowdown this used to do. The request is
        // explicit - "no animated background movement when reduced motion is enabled" - and
        // buildSkybox()'s own pre-render hook zeroes the parallax term at the same time, pinning
        // the near layer to the camera exactly like the backdrop. The two layers then behave as
        // one painted shell: the depth effect is not merely slowed, it is switched off, which is
        // the only reading of that line that holds while the attract camera is still orbiting.
        if (window.SPIRITBALL_reducedMotion) return;
        layers.far.rotation.y += SKYBOX_SPIN_RATE_RAD_MS * deltaMs;
        layers.near.rotation.y += NEAR_SKY_SPIN_RATE_RAD_MS * deltaMs;
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
        // Readability pass (user-requested - "evaluate readability from the ACTUAL gameplay
        // camera, not texture pixels"): the fixed gameplay camera (buildCamera()) sits roughly
        // 1.3m from this panel, and at that distance/FOV the 0.32x0.15m plane only ever covers a
        // small slice of screen - on the smallest phone viewport tested (320px wide) it's well
        // under 100 screen pixels tall regardless of texture resolution. Two consequences drove
        // every change below: (1) texture resolution alone was never the bottleneck - the old
        // 512x256 canvas was already being downsampled well below 1:1 on screen, so the real fix
        // is bigger font-to-panel ratios and fewer/clearer blocks, not just more source pixels;
        // (2) resolution is still bumped 2x (to 1024x480, and corrected to exactly match the
        // panel's own 0.32:0.15 aspect ratio, fixing a pre-existing slight stretch the old
        // 512:256 - 2:1 vs. 2.133:1 - mismatch caused) so the now-much-larger glyphs stay crisp
        // instead of visibly blocky when the GPU downsamples them for a small on-screen area.
        const width = 1024;
        const height = 480;
        // Mipmaps ON (was `false`, the DynamicTexture constructor's generateMipMaps arg) - found
        // via the same real-camera screenshot testing this whole pass is built around: with
        // mipmaps off, the GPU has no choice but to point/bilinear-sample the full-res texture
        // directly at this panel's real, heavily-minified on-screen size, and thin text strokes
        // either vanish between sample points or blur unevenly depending on exactly where they
        // land - confirmed via a zoomed-in crop of a 320px-viewport screenshot showing the
        // smaller-tier text (RANK, mission label/progress, badges) as a barely-legible smear while
        // the larger tiers (message, mission name) stayed readable purely because their strokes
        // were wide enough to survive it anyway. Mipmapping gives the GPU a properly pre-filtered,
        // evenly-downsampled version to sample from instead, which is what small text actually
        // needs at this viewing distance - the DynamicTexture regenerates its mip chain
        // automatically on every texture.update() call below, so this stays correct across
        // redraws, not just the first paint.
        const texture = new BABYLON.DynamicTexture('backglassTex', { width, height }, scene, true);
        // Backglass typography pass: anisotropic filtering, gated on real hardware support the
        // same way applySkinTexture() gates its own (the WEBGL_ANISOTROPIC_FILTER extension is
        // not universal). This panel is BOTH minified ~4.2x and tilted 0.4rad away from the
        // camera, which is precisely the case plain mipmapping handles worst - it picks one mip
        // level for the whole quad, so a surface foreshortened in one axis gets over-blurred
        // along the other. Measured rather than assumed to be the useful lever here: raising the
        // texture's own resolution does nothing at this minification (the source is already ~4x
        // oversampled), whereas how it is SAMPLED is exactly what was costing the small type.
        const bgMaxAnisotropy = scene.getEngine().getCaps().maxAnisotropy;
        if (bgMaxAnisotropy > 0) {
            texture.anisotropicFilteringLevel = Math.min(8, bgMaxAnisotropy);
        }
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
            rank: RANK_NAMES[0], rankColor: STATE_COLORS[0],
            missionName: null, missionProgress: 0, missionRequired: 0,
            // First-play readability (user-requested - "without adding a tutorial screen"). When
            // no vision is running this window said "NONE ACTIVE", which is true and useless: it
            // is the one large, permanently-visible, already-labelled slot on the whole cabinet,
            // and it was spending itself telling a new player that nothing is happening. It now
            // carries one short contextual instruction instead - what to do RIGHT NOW - and falls
            // back to the old text if nothing sets it, so a missed call site degrades rather than
            // blanks. Set by updatePlayerStatusHud(), which already runs on a throttle and
            // already reads exactly the state this depends on.
            idleHint: null,
            // Score-multiplier power-up (board redesign) - true while a collected orb's 2x
            // window is running (see updatePowerUp() in main()).
            multiplierActive: false,
            // Bonus/multiplier subsystem (user-requested) - the CURRENT ball's bonus multiplier
            // (1X-BONUS_MULTIPLIER_MAX), kept in sync with ballBonus.multiplierX in main()
            // whenever it changes. Not the same thing as multiplierActive above - this one only
            // affects the end-of-ball bonus count, not live scoring.
            bonusMultiplierX: 1
        };

        // ===================================================================================
        // Backglass typography pass (user-requested - relate this panel to the player score HUD,
        // keep high score / rank / mission / multiplier / messages, never duplicate the live
        // SCORE, and stop important information depending on tiny text).
        //
        // MEASURED FIRST, designed second. "Readable from the actual gameplay camera" is not a
        // judgement call, so the panel's real on-screen size was measured rather than estimated:
        // the render loop is stopped, the texture is painted flat black, screenshotted, painted
        // flat white, screenshotted again, and the two frames differenced - whatever changed IS
        // the panel, with no projection maths to get wrong and no scene animation to pollute it.
        // Result: this 0.32x0.15m plane covers 238x111 CSS px at a 390px viewport and 253x118 at
        // 1280, i.e. the 1024px-wide texture is minified about 4.2x on screen. That converts
        // directly into a type scale:
        //     30px texture ->  7.0 CSS px    (unreadable - recognisable as a shape at best)
        //     46px         -> 10.7 px        (borderline)
        //     60px         -> 13.9 px        (a readable label)
        //    100px         -> 23.2 px        (comfortably readable)
        //    150px         -> 34.9 px        (hero)
        // The previous layout put RANK, the mission's own label, its progress numbers and both
        // badges at 24-30px - 5.6 to 7.0 CSS px on screen. Those were not small, they were gone.
        // Nothing below 46px survives this pass, every VALUE is at least 78px, and mission
        // progress additionally stopped being text at all (see drawSegmentBar below): a bar is
        // legible at any size, which is the only real answer to "do not make important
        // information depend on tiny text" on a panel this size.
        //
        // RELATING TO #player-hud. The two displays now share a deliberate visual grammar rather
        // than a colour: the same condensed/technical font stack for values and the same plain
        // grotesque for legends, the same legend-above-readout split (small, wide-tracked, cyan
        // legend; large, tight, bright value), and the same recessed display window - near-black
        // face, hairline bezel, light catch along the top edge, fine dot grid. What differs is the
        // register: the DOM HUD's readout is near-white, this panel's primary readout is amber.
        // That is the point - a player must never mistake HIGH SCORE for their live score, which
        // is also why the live score is still not drawn here at all.
        // ===================================================================================
        // Same stacks as #player-hud's --hud-digit-font / --hud-label-font (index.html). Canvas
        // takes a full CSS font shorthand, so the identical fallback chain applies here; on a
        // platform with none of the condensed faces both land on the same technical monospace the
        // DOM HUD does, so the two displays stay in step wherever they end up.
        const BG_VALUE_FONT = '"Bahnschrift", "DIN Condensed", "DIN Alternate", "Roboto Condensed", '
            + '"Arial Narrow", "Liberation Sans Narrow", "Nimbus Sans Narrow", Consolas, "SF Mono", '
            + 'Menlo, "Roboto Mono", "DejaVu Sans Mono", "Liberation Mono", monospace';
        const BG_LABEL_FONT = 'system-ui, -apple-system, "Segoe UI", "Helvetica Neue", Arial, '
            + '"Liberation Sans", "DejaVu Sans", sans-serif';

        // Manual rounded-rect path (not ctx.roundRect - not universally supported on every
        // engine/browser this build might run on) used by the drawing helpers below.
        function roundRectPath(x, y, w, h, r) {
            ctx.beginPath();
            ctx.moveTo(x + r, y);
            ctx.lineTo(x + w - r, y);
            ctx.arcTo(x + w, y, x + w, y + r, r);
            ctx.lineTo(x + w, y + h - r);
            ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
            ctx.lineTo(x + r, y + h);
            ctx.arcTo(x, y + h, x, y + h - r, r);
            ctx.lineTo(x, y + r);
            ctx.arcTo(x, y, x + r, y, r);
            ctx.closePath();
        }

        // Letterspaced legend text. ctx.letterSpacing exists but only landed in Firefox 121 and
        // Safari 17.4, and a legend silently losing its tracking on an older browser would break
        // the one cue that separates a legend from a readout here - so the spacing is applied per
        // character instead, which works everywhere. Legends are short, so the cost is nil.
        function drawLegend(text, x, y, size, color, tracking) {
            ctx.font = '700 ' + size + 'px ' + BG_LABEL_FONT;
            ctx.fillStyle = color;
            ctx.textAlign = 'left';
            let cx = x;
            for (const ch of text) {
                ctx.fillText(ch, cx, y);
                cx += ctx.measureText(ch).width + tracking;
            }
            return cx - tracking;
        }

        // A recessed display window, deliberately the same construction as #player-hud's score
        // well: near-black face, fine dot grid, hairline accent bezel, light catch along the
        // inside top edge. This is what makes a block read as a lit display cut into the panel
        // rather than text floating on a background.
        function drawWindow(x, y, w, h, accent) {
            roundRectPath(x, y, w, h, 12);
            ctx.fillStyle = 'rgba(0, 2, 6, 0.96)';
            ctx.fill();
            ctx.save();
            roundRectPath(x, y, w, h, 12);
            ctx.clip();
            ctx.fillStyle = 'rgba(120, 245, 255, 0.05)';
            for (let gy = y + 6; gy < y + h; gy += 12) {
                for (let gx = x + 6; gx < x + w; gx += 12) ctx.fillRect(gx, gy, 3, 3);
            }
            ctx.restore();
            ctx.lineWidth = 3;
            ctx.strokeStyle = accent;
            roundRectPath(x + 1.5, y + 1.5, w - 3, h - 3, 11);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(x + 14, y + 3.5);
            ctx.lineTo(x + w - 14, y + 3.5);
            ctx.lineWidth = 3;
            ctx.strokeStyle = 'rgba(190, 255, 255, 0.18)';
            ctx.stroke();
        }

        // Mission progress as a segmented bar rather than "2 / 5". At 4.2x minification the old
        // 30px progress text rendered 7 CSS px tall; a bar of the same height carries the same
        // information at any scale, because the reader is comparing lit area, not parsing glyphs.
        // The numbers stay alongside it at a legible size for anyone who wants the exact count.
        function drawSegmentBar(x, y, w, h, filled, total, color) {
            const n = Math.max(1, total);
            const gap = 6;
            const segW = (w - gap * (n - 1)) / n;
            for (let i = 0; i < n; i++) {
                const sx = x + i * (segW + gap);
                roundRectPath(sx, y, segW, h, 4);
                if (i < filled) {
                    ctx.fillStyle = color;
                    ctx.fill();
                } else {
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.07)';
                    ctx.fill();
                    ctx.lineWidth = 2;
                    ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
                    ctx.stroke();
                }
            }
        }

        // Pill badge for the multiplier/bonus indicators - same visual language as the DOM
        // #effects-hud badges, so a player who already reads those reads these the same way.
        // Text raised 30px -> 46px (7.0 -> 10.7 CSS px on screen) with the pill grown to match.
        function drawBadge(x, y, text, color) {
            ctx.font = '700 46px ' + BG_LABEL_FONT;
            const paddingX = 22;
            const w = ctx.measureText(text).width + paddingX * 2;
            const h = 62;
            roundRectPath(x, y, w, h, h / 2);
            ctx.fillStyle = 'rgba(0, 2, 8, 0.85)';
            ctx.fill();
            ctx.lineWidth = 3;
            ctx.strokeStyle = color;
            ctx.stroke();
            ctx.fillStyle = color;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText(text, x + paddingX, y + h / 2 + 2);
            ctx.textBaseline = 'top';
            return x + w;
        }

        // Dot-matrix grid over the message plate, so the message reads as an actual lit matrix
        // rather than as flat painted type. Drawn as thin DARK lines in normal source-over mode,
        // NOT punched out with destination-out: the first attempt carved alpha instead, and this
        // texture is uploaded as an opaque emissive map, so those partially-transparent bands
        // came back as a grey wash across the plate that visibly cost the message its contrast
        // (caught in a real camera screenshot, not reasoned about). Darkening the gaps produces
        // the same matrix read with alpha left at 1 everywhere. Restrained on purpose - at ~3.8x
        // minification a 2px line every 9px lands near half a screen pixel every two, which
        // resolves into texture rather than visible holes, and costs the glyphs almost no weight.
        function drawDotMatrixGrid(x, y, w, h) {
            ctx.save();
            ctx.beginPath();
            ctx.rect(x, y, w, h);
            ctx.clip();
            ctx.fillStyle = 'rgba(0, 4, 10, 0.34)';
            for (let gy = y; gy < y + h; gy += 9) ctx.fillRect(x, gy, w, 2);
            for (let gx = x; gx < x + w; gx += 9) ctx.fillRect(gx, y, 2, h);
            ctx.restore();
        }

        // Layout constants. One place to see the whole vertical budget, which is what stops a
        // future edit quietly re-introducing a 30px line: 480px of texture, and every band below
        // is sized so its VALUE clears 78px.
        const PAD = 26;
        const HS_Y = 14, HS_H = 150;                    // high score window
        const ROW_Y = HS_Y + HS_H + 14, ROW_H = 76;     // rank + badges row
        const MI_Y = ROW_Y + ROW_H + 12;                // mission window
        const MI_H = height - MI_Y - 14;

        // '#rrggbb' -> 'rgba(r, g, b, a)' for the tinted message halo, over config's shared
        // hexStringToRgb() - the ASCENSION screen flash needs the same parse, so it lives there.
        function hexToRgba(hex, alpha) {
            return 'rgba(' + hexStringToRgb(hex).join(', ') + ', ' + alpha + ')';
        }

        // Greedy word wrap into AT MOST two lines - the remainder of a very long string all lands
        // on the second one rather than spilling into a third, because a third line on a panel
        // this size would have to be small enough to be pointless. Assumes ctx.font is already
        // set to the size being tested.
        function wrapToTwoLines(text, maxW) {
            if (ctx.measureText(text).width <= maxW) return [text];
            const words = text.split(' ');
            if (words.length < 2) return [text];
            let first = words[0];
            let i = 1;
            while (i < words.length && ctx.measureText(first + ' ' + words[i]).width <= maxW) {
                first += ' ' + words[i];
                i++;
            }
            const second = words.slice(i).join(' ');
            return second ? [first, second] : [first];
        }

        // --- MESSAGE: takes over the whole transient zone while it is up ----------------------
        // Not the whole panel: HIGH SCORE is the one thing worth keeping visible at all times and
        // it lives in its own band above. Everything below is transient anyway, so a message gets
        // all ~290px of it, which is what lets it be drawn at a size that is genuinely the easiest
        // thing on the panel to notice - about 34 CSS px on screen, against the 18 the old
        // 84px-on-a-small-plate treatment managed.
        function drawMessage() {
            const mY = ROW_Y - 6;
            const mH = height - mY - 14;
            drawWindow(PAD, mY, width - PAD * 2, mH, 'rgba(255, 255, 255, 0.5)');
            const maxW = width - PAD * 2 - 60;
            const maxH = mH - 40;
            // Wrap to a second line BEFORE shrinking past readability. A single-line-only fit was
            // the first attempt and the game's own longest real message ("SUPER SKILL SHOT
            // COMPLETE 25,000", 32 characters) ran straight off both edges of the plate: it needs
            // ~1075px at the old 56px floor against 912px of usable width, so the loop bottomed
            // out and drew it anyway. Two lines at ~90px are far more legible on this panel than
            // one line at 40px would have been, and the plate is tall enough to take them.
            let fontSize = 150;
            let lines = [state.message];
            for (;;) {
                ctx.font = '700 ' + fontSize + 'px ' + BG_VALUE_FONT;
                lines = wrapToTwoLines(state.message, maxW);
                const tooWide = lines.some((l) => ctx.measureText(l).width > maxW);
                const tooTall = lines.length * fontSize * 1.12 > maxH;
                if ((!tooWide && !tooTall) || fontSize <= 48) break;
                fontSize -= 4;
            }
            // Tinted only when the caller asked for it; otherwise the same white/cyan-halo
            // treatment every message has always had. The halo follows the glyph colour rather
            // than staying fixed cyan - a gold ASCENSION sitting in a cyan halo reads as a
            // rendering mistake, not a colour choice.
            ctx.fillStyle = state.messageColor || '#ffffff';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.shadowColor = state.messageColor ? hexToRgba(state.messageColor, 0.55) : 'rgba(160, 250, 255, 0.55)';
            ctx.shadowBlur = 10;
            const lineH = fontSize * 1.12;
            const firstY = mY + mH / 2 + 2 - ((lines.length - 1) * lineH) / 2;
            lines.forEach((line, i) => ctx.fillText(line, width / 2, firstY + i * lineH));
            ctx.shadowBlur = 0;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            drawDotMatrixGrid(PAD + 4, mY + 4, width - PAD * 2 - 8, mH - 8);
        }

        function redraw() {
            // --- Panel face: near-black, with a top-lit gradient so it reads as a surface -----
            const face = ctx.createLinearGradient(0, 0, 0, height);
            face.addColorStop(0, '#0a0718');
            face.addColorStop(1, '#02010a');
            ctx.fillStyle = face;
            ctx.fillRect(0, 0, width, height);

            // Panel-wide dot-matrix grid. Coarser than the grid inside the display windows so the
            // two surfaces read as two materials - the same trick the DOM HUD uses between its
            // panel grain and its score well's dot grid.
            ctx.fillStyle = 'rgba(0, 255, 255, 0.045)';
            for (let y = 12; y < height; y += 16) {
                for (let x = 12; x < width; x += 16) ctx.fillRect(x, y, 4, 4);
            }

            ctx.textBaseline = 'top';
            ctx.textAlign = 'left';

            // --- HIGH SCORE: the panel's primary readout, in its own recessed window ----------
            drawWindow(PAD, HS_Y, width - PAD * 2, HS_H, 'rgba(255, 190, 60, 0.35)');
            drawLegend('HIGH SCORE', PAD + 26, HS_Y + 20, 46, 'rgba(255, 214, 140, 0.85)', 7);
            // Deliberately NOT thousands-separated: #player-hud prints the live score as raw
            // digits, and two score readouts formatting the same kind of number differently is
            // exactly the sort of small inconsistency that makes a cabinet feel assembled from
            // parts. Restrained glow - 8 texture px is under 2 CSS px on screen, a lit edge
            // rather than a bloom.
            ctx.font = '700 108px ' + BG_VALUE_FONT;
            ctx.fillStyle = '#ffc849';
            ctx.textAlign = 'right';
            ctx.shadowColor = 'rgba(255, 170, 40, 0.5)';
            ctx.shadowBlur = 8;
            ctx.fillText(String(state.highScore), width - PAD - 26, HS_Y + 66);
            ctx.shadowBlur = 0;
            ctx.textAlign = 'left';

            // Everything below is the transient zone: while a message is up it is replaced
            // outright rather than drawn under a plate. Drawing it and covering it was the first
            // attempt, and the mission legend ghosted through the plate's own 4% transparency -
            // visible in a camera screenshot. Skipping it is also simply less work per redraw.
            if (state.message) {
                drawMessage();
                texture.update();
                return;
            }

            // --- RANK + multiplier/bonus badges, one row -------------------------------------
            // Badges are vertically centred on the row, so the rank value is drawn from its own
            // middle rather than its top - otherwise a 78px cap sits ~10px proud of a 62px pill
            // and the row reads as two things that missed each other.
            const badges = [];
            if (state.multiplierActive) badges.push(['\u2605 ' + POWERUP_MULTIPLIER + 'X', '#ff5ce0']);
            if (state.bonusMultiplierX > 1) badges.push(['BONUS ' + state.bonusMultiplierX + 'X', '#ffaa00']);
            // Badges first, right-to-left, so the row's right edge stays fixed as they come and go
            // - a badge appearing must not shove its neighbour sideways on a display this small -
            // and so the rank knows how much room is actually left before it draws.
            let badgeX = width - PAD - 4;
            for (let i = badges.length - 1; i >= 0; i--) {
                ctx.font = '700 46px ' + BG_LABEL_FONT;
                const bw = ctx.measureText(badges[i][0]).width + 44;
                badgeX -= bw;
                drawBadge(badgeX, ROW_Y + 2, badges[i][0], badges[i][1]);
                badgeX -= 14;
            }

            // Legend reads STATE, not RANK (user-requested terminology pass). This is the widest
            // of the retheme's string changes in consequence, not just in characters: drawLegend()
            // returns where it stopped, and rankX is that + 22, so a longer legend eats directly
            // into the room the shrink-to-fit below has for the value. Re-measured after the
            // change - see RANK_NAMES' fit note in js/config.js for the numbers.
            const rankLegendEnd = drawLegend('STATE', PAD + 4, ROW_Y + 6, 46, 'rgba(150, 245, 255, 0.8)', 7);
            const rankX = rankLegendEnd + 22;
            // Shrink-to-fit against whatever the badges left. Without this a long rank name runs
            // straight underneath them - "Ascendant" alongside both badges was overlapping in a
            // camera screenshot, and rank names are content, not something this layout controls.
            let rankSize = 78;
            ctx.font = '700 ' + rankSize + 'px ' + BG_VALUE_FONT;
            while (ctx.measureText(state.rank).width > badgeX - rankX - 16 && rankSize > 46) {
                rankSize -= 3;
                ctx.font = '700 ' + rankSize + 'px ' + BG_VALUE_FONT;
            }
            // Was a fixed '#7dffe0'. That exact value is still STATE_COLORS[0], so a fresh game
            // is pixel-identical here; later states drift along the palette. state.rankColor is
            // set beside state.rank at every site that assigns it, and falls back to index 0 so a
            // missed site degrades to the old look rather than to an unset fillStyle.
            ctx.fillStyle = state.rankColor || STATE_COLORS[0];
            ctx.textBaseline = 'middle';
            ctx.fillText(state.rank, rankX, ROW_Y + ROW_H / 2 - 2);
            ctx.textBaseline = 'top';

            // --- MISSION window. Always drawn, even with no mission active: a display that
            // changes height as state comes and goes reads as a web page reflowing, not as a
            // cabinet. Idle simply shows the same "no mission selected" state the 2D HUD had. ---
            const missionActive = !!state.missionName;
            drawWindow(PAD, MI_Y, width - PAD * 2, MI_H,
                missionActive ? 'rgba(255, 170, 0, 0.45)' : 'rgba(120, 245, 255, 0.16)');
            // VISION, not MISSION (user-requested). The window's value line below is drawn at a
            // fixed PAD + 26, so unlike the STATE legend above this one's width does not constrain
            // the name it labels.
            drawLegend('VISION', PAD + 26, MI_Y + 18, 46,
                missionActive ? 'rgba(255, 210, 140, 0.9)' : 'rgba(150, 245, 255, 0.45)', 7);
            if (missionActive) {
                // Shrink-to-fit so a long mission name never spills past the window's bezel.
                let nameSize = 84;
                ctx.font = '700 ' + nameSize + 'px ' + BG_VALUE_FONT;
                while (ctx.measureText(state.missionName).width > width - PAD * 2 - 52 && nameSize > 52) {
                    nameSize -= 4;
                    ctx.font = '700 ' + nameSize + 'px ' + BG_VALUE_FONT;
                }
                ctx.fillStyle = '#ffaa00';
                ctx.fillText(state.missionName, PAD + 26, MI_Y + 62);

                const barY = MI_Y + MI_H - 52;
                const barW = width - PAD * 2 - 52 - 150;
                drawSegmentBar(PAD + 26, barY, barW, 26, state.missionProgress, state.missionRequired, '#ffc849');
                ctx.font = '700 56px ' + BG_VALUE_FONT;
                ctx.fillStyle = '#ffd27a';
                ctx.textAlign = 'right';
                ctx.fillText(state.missionProgress + '/' + state.missionRequired, width - PAD - 26, barY - 18);
                ctx.textAlign = 'left';
            } else {
                // Shrink-to-fit, for the same reason the mission name above has it: this line is
                // now variable-length player-facing text, and "HOLD SPACE TO LAUNCH" is nearly
                // twice the width of the "NONE ACTIVE" this slot was sized around.
                const hint = state.idleHint || 'NONE ACTIVE';
                let hintSize = 64;
                ctx.font = '700 ' + hintSize + 'px ' + BG_VALUE_FONT;
                while (ctx.measureText(hint).width > width - PAD * 2 - 52 && hintSize > 34) {
                    hintSize -= 3;
                    ctx.font = '700 ' + hintSize + 'px ' + BG_VALUE_FONT;
                }
                // Brighter than the old idle grey (0.35 -> 0.62). This is an instruction a new
                // player is meant to read, not a greyed-out "nothing here" placeholder - but still
                // well below the amber an ACTIVE vision uses, so a running objective always wins
                // the slot's visual priority.
                ctx.fillStyle = 'rgba(150, 245, 255, 0.62)';
                ctx.fillText(hint, PAD + 26, MI_Y + 70);
            }

            texture.update();
        }

        // Last-message-wins: a new call cancels any pending clear from the previous one instead
        // of queuing, so rapid-fire hits replace rather than stack illegibly (per the doc's
        // acceptance criteria) - the tradeoff is a very quick second hit can cut the first
        // message's dwell time short, judged an acceptable simplification over building a real
        // message queue for a stage whose actual on-screen legibility can't be checked here.
        // `color` is optional and defaults to the white every message used before it existed -
        // only the ASCENSION toast passes one, so this cannot quietly tint the other two dozen
        // messages (see STATE_COLORS' own comment on keeping the panel quiet).
        function showMessage(text, durationMs, color) {
            if (state.messageTimer) clearTimeout(state.messageTimer);
            state.message = text;
            state.messageColor = color || null;
            // Dev diagnostics (?dev=1 only, see updateDevHud() in main()) - unlike state.message
            // above, this is never cleared back to '', so the dev HUD can always show "last
            // scoring/game event" even well after the toast itself has faded. Purely a diagnostic
            // breadcrumb - nothing reads this outside the dev HUD, no gameplay/visual effect.
            state.lastMessage = text;
            redraw();
            state.messageTimer = setTimeout(() => {
                state.message = '';
                state.messageColor = null;
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

    // The ball's surface markings. Audit finding (user-requested angular-motion pass): the ball's
    // PHYSICS rotation was already correct and already reaching the renderer - measured
    // omega*r/v = 0.998 in free roll, and the mesh quaternion genuinely turning 13.8 revolutions
    // in 1.5s - but none of it was VISIBLE, because the ball was a uniform sphere: one flat albedo
    // colour, one flat emissive colour, no texture. A featureless sphere looks identical at every
    // orientation, so a correctly rolling ball read as a sliding one.
    //
    // This is deliberately NOT faked rotation. Nothing here spins anything; it only gives the real,
    // Havok-driven rotation something to show. Meridian stripes are the shape that does that for
    // both axes that matter here: they sweep sideways when the ball yaws, and converge/part at the
    // poles when it rolls, so travel and spin are both legible. Kept as one procedural
    // DynamicTexture in the same style as createParticleTexture() above - no asset to ship.
    //
    // Brightness is preserved on purpose. The lighting pass that set emissiveColor documents the
    // ball as the top of the visual hierarchy ("highest motion readability"), so the stripes are a
    // modest tint rather than dark bands: the orb still reads as the brightest thing on the board,
    // it just no longer reads as featureless.
    function createBallTexture(scene) {
        const w = 256, h = 128;
        const texture = new BABYLON.DynamicTexture('ballTex', { width: w, height: h }, scene, true);
        const ctx = texture.getContext();
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        // Three meridians, evenly spaced so no orientation looks like any other, drawn with soft
        // edges so they read as markings on a polished ball rather than painted-on stripes.
        for (let i = 0; i < 3; i++) {
            const cx = (i + 0.5) * (w / 3);
            const grad = ctx.createLinearGradient(cx - 12, 0, cx + 12, 0);
            grad.addColorStop(0, 'rgba(120,190,205,0)');
            grad.addColorStop(0.5, 'rgba(120,190,205,0.85)');
            grad.addColorStop(1, 'rgba(120,190,205,0)');
            ctx.fillStyle = grad;
            ctx.fillRect(cx - 12, 0, 24, h);
        }
        // One polar cap, so rotation about the vertical axis is still legible when a meridian
        // happens to be facing the camera.
        const cap = ctx.createRadialGradient(w / 2, 0, 0, w / 2, 0, h * 0.28);
        cap.addColorStop(0, 'rgba(120,190,205,0.8)');
        cap.addColorStop(1, 'rgba(120,190,205,0)');
        ctx.fillStyle = cap;
        ctx.fillRect(0, 0, w, h * 0.3);
        texture.update();
        return texture;
    }

    // Moulded pop-bumper cap face. Turned concentric rings plus faint radial spokes: the shapes a
    // real cap is moulded with. Overridden wholesale by SKIN_MANIFEST.bumperCap when that artwork
    // exists (applySkinTexture() runs after this and reassigns albedoTexture), so this is strictly
    // the fallback look, never something a skin has to fight.
    //
    // Worth knowing before editing this, because the drawing below does not say it: the cap is a
    // SPHERE with equirectangular UV, so this square is a lat/long map, NOT the top-down disc its
    // centred-circle drawing code implies. Measured (eight labelled bands rendered onto the real
    // caps in the real scene), the dome's apex samples the image's BOTTOM edge and the image's
    // centre - where these rings are concentric about - lands on the rim, near the silhouette
    // edge. The consequence is that the rings and spokes are far subtler on the visible face than
    // this drawing suggests: at the cap's 28x24..36x30 on-screen size what actually reads is the
    // pale plastic tone and the gloss highlight, not the turned pattern.
    //
    // Deliberately left as-is rather than redrawn to sit correctly under the mapping: it renders
    // as a clean, glossy off-white cap, which is exactly the fallback's job, and changing it would
    // change the shipped look of every bumper for a pattern that is sub-pixel at this size. The
    // note is here so the next person to touch it knows the geometry they are drawing onto - and
    // so the bumperCap artwork spec in js/skins.js/SKINS.md is not mistakenly written to "match
    // the rings" that a player cannot actually see.
    function createBumperCapTexture(scene) {
        const size = 128;
        const texture = new BABYLON.DynamicTexture('bumperCapTex', { width: size, height: size }, scene, true);
        const ctx = texture.getContext();
        const c = size / 2;
        ctx.fillStyle = '#f2f2f7';
        ctx.fillRect(0, 0, size, size);
        // radial spokes first, so the rings read as sitting on top of them
        ctx.strokeStyle = 'rgba(150,152,168,0.30)';
        ctx.lineWidth = 2;
        for (let i = 0; i < 12; i++) {
            const a = (i / 12) * Math.PI * 2;
            ctx.beginPath();
            ctx.moveTo(c + Math.cos(a) * c * 0.22, c + Math.sin(a) * c * 0.22);
            ctx.lineTo(c + Math.cos(a) * c * 0.92, c + Math.sin(a) * c * 0.92);
            ctx.stroke();
        }
        for (const [r, a, w] of [[0.90, 0.35, 3], [0.66, 0.22, 2], [0.44, 0.30, 2], [0.24, 0.40, 3]]) {
            ctx.beginPath();
            ctx.arc(c, c, c * r, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(120,124,145,' + a + ')';
            ctx.lineWidth = w;
            ctx.stroke();
        }
        // a soft highlight off-centre, so the cap has a consistent moulded sheen
        const gloss = ctx.createRadialGradient(c * 0.72, c * 0.66, 0, c * 0.72, c * 0.66, c * 0.85);
        // 0.85 -> 0.45 (hierarchy pass): this highlight is what actually pinned the caps at 255,
        // not the material tint under it. The moulded sheen still reads, it just stops clipping.
        gloss.addColorStop(0, 'rgba(255,255,255,0.45)');
        gloss.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = gloss;
        ctx.beginPath();
        ctx.arc(c, c, c * 0.95, 0, Math.PI * 2);
        ctx.fill();
        texture.update();
        return texture;
    }

    // Saturn's atmosphere. The centrepiece was a single flat gold colour on a smooth sphere, which
    // at this size (SATURN_RADIUS_M is more than double any bumper) is the one object on the board
    // where a featureless surface is most obvious - it read as a plastic ball, not a planet.
    //
    // Bands are generated from two summed sines over latitude rather than a hand-listed table, so
    // the zones vary in width and brightness the way a real gas giant's do instead of looking like
    // painted stripes, and the values stay adjustable as one curve. Sphere UVs in Babylon are
    // equirectangular (v = latitude), so a row of this texture is a line of latitude - bands drawn
    // as horizontal rows come out as bands around the planet.
    //
    // The gold is baked in here, so saturnMat's albedoColor goes to white; leaving the tint on the
    // material as well would multiply it twice and crush every band into the same dark amber.
    function createSaturnBandTexture(scene) {
        const w = 256, h = 128;
        const texture = new BABYLON.DynamicTexture('saturnBandTex', { width: w, height: h }, scene, true);
        const ctx = texture.getContext();
        // Deep amber -> pale cream, the two ends of a gas giant's belt/zone range.
        const deep = [0.44, 0.25, 0.05], pale = [1.00, 0.86, 0.60];
        for (let y = 0; y < h; y++) {
            const lat = (y / h) * 2 - 1; // -1 pole .. +1 pole
            let t = 0.5 + 0.34 * Math.sin(lat * 11.5) + 0.16 * Math.sin(lat * 23.0 + 1.7);
            t = Math.max(0, Math.min(1, t));
            // Limb/polar darkening - the poles of a banded planet are always dimmer than its
            // equator, and without it the bands alone still read as a flat cylinder.
            const polar = 1 - 0.5 * Math.pow(Math.abs(lat), 2.6);
            const c = deep.map((d, i) => Math.round((d + (pale[i] - d) * t) * polar * 255));
            ctx.fillStyle = 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')';
            ctx.fillRect(0, y, w, 1);
        }
        // Two storm ovals riding in the bands. Purely so the planet is not perfectly
        // rotationally uniform - the detail that stops a banded sphere reading as a lathe turning.
        for (const [cx, cy, rx, ry, a] of [[0.30, 0.62, 0.075, 0.035, 0.30], [0.72, 0.41, 0.045, 0.022, 0.22]]) {
            const g = ctx.createRadialGradient(cx * w, cy * h, 0, cx * w, cy * h, rx * w);
            g.addColorStop(0, 'rgba(255,236,200,' + a + ')');
            g.addColorStop(1, 'rgba(255,236,200,0)');
            ctx.save();
            ctx.translate(cx * w, cy * h);
            ctx.scale(1, (ry * h) / (rx * w));
            ctx.translate(-cx * w, -cy * h);
            ctx.fillStyle = g;
            ctx.fillRect((cx - rx) * w, (cy - rx) * w, rx * 2 * w, rx * 2 * w);
            ctx.restore();
        }
        texture.update();
        return texture;
    }

    // Saturn's ring plane. Two things this fixes.
    //
    // First: the rings were one flat gold colour with no internal structure. Real ring systems are
    // concentric ringlets separated by divisions, and that structure is most of what makes a ring
    // read as a ring rather than a hoop.
    //
    // Second, and less obvious: updateSaturnRotation() has always spun both rings about their own
    // axes, and that rotation has never been visible, because a uniform torus is rotationally
    // symmetric - spinning it produces an identical image every frame. The faint azimuthal
    // variation below is what finally gives that existing animation something to show. (Same class
    // of problem, and the same fix, as the featureless ball whose real physics rotation was
    // invisible - see createBallTexture().)
    //
    // Babylon's torus UVs run u around the ring and v around the tube, so `rad` below - folded so
    // that v and 1-v map to the same value - is a genuine radial coordinate across the ribbon,
    // identical on the ring's top and bottom faces.
    function createSaturnRingTexture(scene) {
        const w = 192, h = 64;
        const texture = new BABYLON.DynamicTexture('saturnRingTex', { width: w, height: h }, scene, true);
        const ctx = texture.getContext();
        for (let y = 0; y < h; y++) {
            const v = y / h;
            const rad = Math.abs(v - 0.5) * 2; // 1 = outer edge of the ribbon, 0 = inner edge
            // Concentric ringlets, plus one wide dark division at rad ~0.55 (a Cassini stand-in)
            // and a soft fade at the very outer edge so the ring does not end on a hard line.
            let b = 0.62 + 0.26 * Math.sin(rad * 26.0) + 0.12 * Math.sin(rad * 61.0 + 0.9);
            b *= 1 - 0.72 * Math.exp(-Math.pow((rad - 0.55) / 0.055, 2));
            b *= 1 - 0.55 * Math.pow(Math.max(0, (rad - 0.86) / 0.14), 2);
            for (let x = 0; x < w; x++) {
                const u = x / w;
                // Faint density variation around the ring - the "spokes" that make the spin read.
                const spoke = 1 + 0.11 * Math.sin(u * Math.PI * 2 * 3) + 0.07 * Math.sin(u * Math.PI * 2 * 7 + 2.1);
                const k = Math.max(0, Math.min(1, b * spoke));
                const c = [Math.round((0.30 + 0.70 * k) * 255), Math.round((0.20 + 0.62 * k) * 255), Math.round((0.06 + 0.34 * k) * 255)];
                ctx.fillStyle = 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')';
                ctx.fillRect(x, y, 1, 1);
            }
        }
        texture.update();
        return texture;
    }

    // Cabinet rail face - the wall texture that gives the table's perimeter an actual profile.
    //
    // Every structural wall (topWall, the two side walls, the two slants, the two mid-table
    // guides) is one flat colour on a plain box, which is most of why the machine reads as a
    // tray rather than as a cabinet: a real side wall has a polished top edge catching light, a
    // body, and a dark shadow line where it meets the playfield.
    //
    // Bands run in V only, with no vertical striations, and that is deliberate: these boxes have
    // wildly different aspect ratios (topWall's face is roughly 12:1, a guide's is 3:1), so
    // anything varying along U would stretch differently on every wall and break the "consistent
    // material treatment" this exists to provide. Horizontal bands look identical on all seven.
    //
    // The cabinetRails skin slot in js/skins.js declares kind:'albedo' and targets exactly this
    // material, so real artwork replaces this wholesale (applySkinTexture() runs after it is
    // assigned). The caller sets albedoColor to white for the usual reason - albedoTexture is
    // multiplied by it, and keeping the cyan tint would square it.
    //
    // This function is also the reference the artwork spec is written against: the V-only band
    // layout below (crown 0.000-0.055, falloff -0.130, body -0.700, lower body -0.860, base band
    // -1.000) is the profile a real cabinet-rails image has to reproduce to sit correctly on the
    // same 42 faces, and its v=0-is-the-top orientation is the one the artwork inherits. A file
    // that ignores it does not fail - it just lands its highlight somewhere down the wall. See
    // SKINS.md's cabinetRails section, which quotes these band boundaries as pixel rows.
    function createCabinetRailTexture(scene, color) {
        const w = 32, h = 128;
        const texture = new BABYLON.DynamicTexture('cabinetRailTex', { width: w, height: h }, scene, true);
        const ctx = texture.getContext();
        const mix = (t) => [color.r + (1 - color.r) * t, color.g + (1 - color.g) * t, color.b + (1 - color.b) * t];
        const dim = (k) => [color.r * k, color.g * k, color.b * k];
        for (let y = 0; y < h; y++) {
            const v = y / h; // 0 at the top of the wall face, 1 where it meets the playfield
            let rgb;
            if (v < 0.055) rgb = mix(0.85);          // polished crown - the edge highlight
            else if (v < 0.13) rgb = mix(0.45);      // its fall-off
            else if (v < 0.70) {
                // Wall body, darkening gently downward the way a lit vertical face actually does.
                rgb = dim(1.0 - 0.32 * ((v - 0.13) / 0.57));
            } else if (v < 0.86) rgb = dim(0.42);    // lower body, in shadow
            else rgb = dim(0.10);                    // dark base band: the shadow line that keeps
                                                     // playfield art from running straight into the wall
            // Fine horizontal machining lines. Also V-only, so they survive any wall's aspect.
            const k = 1 + 0.055 * Math.sin(v * Math.PI * 2 * 34);
            ctx.fillStyle = 'rgb(' + rgb.map((c) => Math.round(Math.max(0, Math.min(1, c * k)) * 255)).join(',') + ')';
            ctx.fillRect(0, y, w, 1);
        }
        texture.update();
        return texture;
    }

    // Slingshot lit plastic. The wide lozenge of illuminated plastic mounted on top of a real
    // slingshot's housing - the part that actually flashes when the kicker fires, and the single
    // clearest "this is a mechanism" cue the fixture has.
    //
    // Rectangular rather than the round lens createInsertLensTexture() draws: this maps onto a box
    // face that is two and a half times wider than it is deep, so a circular design would render
    // as a stretched ellipse. Drawn in the plastic's own aspect instead.
    //
    // This one IS an albedoTexture, unlike the round lane inserts, because that is what the
    // obstacleDecalSlingshot slot in js/skins.js declares (kind:'albedo') - so a real artwork file
    // replaces this wholesale on the same property. The caller sets albedoColor to white for the
    // usual reason: albedoTexture is multiplied by it, and leaving the magenta tint on as well
    // would square it.
    function createSlingshotPlasticTexture(scene) {
        const w = 160, h = 64;
        const texture = new BABYLON.DynamicTexture('slingshotPlasticTex', { width: w, height: h }, scene, true);
        const ctx = texture.getContext();
        const round = (x, y, rw, rh, r) => {
            ctx.beginPath();
            ctx.moveTo(x + r, y);
            ctx.arcTo(x + rw, y, x + rw, y + rh, r);
            ctx.arcTo(x + rw, y + rh, x, y + rh, r);
            ctx.arcTo(x, y + rh, x, y, r);
            ctx.arcTo(x, y, x + rw, y, r);
            ctx.closePath();
        };
        // Dark moulded surround, so the lit lozenge inside it has an edge to read against.
        ctx.fillStyle = '#140416';
        ctx.fillRect(0, 0, w, h);
        // Lit field - magenta, the slingshots' existing identity colour on this board.
        const field = ctx.createLinearGradient(0, 0, 0, h);
        field.addColorStop(0.00, '#ff9bff');
        field.addColorStop(0.45, '#f13cf1');
        field.addColorStop(1.00, '#8a1090');
        ctx.fillStyle = field;
        round(7, 7, w - 14, h - 14, 12);
        ctx.fill();
        // Bright printed border plus a dark hairline inside it - the same two-line treatment the
        // mission-target faces use, for the same reason: the hairline is what stops the bright
        // border bleeding into the lit field at a distance.
        ctx.strokeStyle = 'rgba(255,255,255,0.95)';
        ctx.lineWidth = 5;
        round(11, 11, w - 22, h - 22, 10);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(0,0,0,0.45)';
        ctx.lineWidth = 2;
        round(16, 16, w - 32, h - 32, 7);
        ctx.stroke();
        // Three chevrons pointing along the plastic - a kicker throws the ball sideways, and this
        // is the legend real slingshot plastics use to say so.
        ctx.strokeStyle = 'rgba(255,255,255,0.9)';
        ctx.lineWidth = 5;
        ctx.lineCap = 'round';
        for (let i = 0; i < 3; i++) {
            const cx = w * 0.5 + (i - 1) * 26;
            ctx.beginPath();
            ctx.moveTo(cx - 8, h * 0.32);
            ctx.lineTo(cx + 8, h * 0.5);
            ctx.lineTo(cx - 8, h * 0.68);
            ctx.stroke();
        }
        texture.update();
        return texture;
    }

    // Playfield insert lens face. A real backlit insert is a small moulded lens sitting in a
    // routed hole: unlit it is dark plastic, lit it is a bright translucent lozenge with a printed
    // legend and a hard edge where the plastic ends. The old inserts were flat single-colour discs
    // at full emissive, which under the scene's GlowLayer bloomed into shapeless coloured haze -
    // the "oversized generic glow" this pass exists to remove. Everything that fixes that is here:
    // the lit field stops well inside the lens rim (so the bloom has a boundary instead of running
    // off the edge), it sits at roughly half brightness rather than full (so the bright rim ring
    // and legend are what actually read), and the area outside the lens emits nothing at all.
    //
    // Greyscale on purpose. This is an emissiveTexture, so it is multiplied by the material's
    // emissiveColor - which is the ONLY thing the lamp system ever writes (createLampSystem()).
    // Keeping the texture colourless means it modulates brightness and shape while every lamp's
    // identity colour and its off/dim/lit/blink state still come from exactly where they came from
    // before, untouched. Same reason it is an emissiveTexture and not an albedoTexture: the
    // laneInsert* skin slots in js/skins.js are declared kind:'emissive', so a real artwork file
    // replaces this wholesale on the same property (applySkinTexture() runs after this is
    // assigned) rather than fighting it.
    //
    // legend picks the symbol printed on the lens. Each lane FAMILY gets its own, because a
    // family's identity is the one thing a player has to read at a glance and colour alone was
    // carrying all of it: inlane and outlane both drew the same down-arrow, and orbit drew the
    // same up-arrow as the skill shot, so two pairs of unrelated lanes were visually identical.
    // The four family symbols are chosen to have maximally different SILHOUETTES rather than
    // different detail, because measured, an insert is only 20-40px across at the gameplay camera
    // and detail below that resolves to mush:
    //
    //   'flow'   INLANE    double chevron down-table - return / flow
    //   'void'   OUTLANE   bold X                    - danger / void
    //   'cycle'  ORBIT     ring with an arrowhead    - cycle / infinity
    //   'ground' RE-ENTRY  earth mark, stacked bars  - return-to-body / grounding
    //
    // chevrons / cross / circle / stacked horizontals stay distinguishable from each other when
    // they are only a handful of pixels tall, which four variations on an arrow would not.
    //
    // 'up'/'down' remain for the arrows that genuinely mark a DIRECTION rather than a family - the
    // skill-shot lanes ('up'). 'down' is no longer used by any lane family but is kept because it
    // costs nothing and losing it would make re-introducing a directional insert a code change
    // rather than an argument. null draws concentric rings, for indicators that mark a state
    // rather than a direction (kickback, ball save).
    //
    // Canvas +Y maps down-table, which is why 'down' puts its tip at c + 34 (the original arrow's
    // own convention, verified by a UV probe when it was written, and reused here unchanged).
    function createInsertLensTexture(scene, name, legend) {
        const size = 128, c = size / 2;
        const texture = new BABYLON.DynamicTexture('insertLensTex' + name, { width: size, height: size }, scene, true);
        const ctx = texture.getContext();
        // Black, not transparent: the lens rim and everything outside it must emit nothing, and
        // black in an emissive texture is exactly "no light from here".
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, size, size);

        // Lit field, stopped at 0.86 of the cap radius so a dark moulded margin always frames it.
        const lit = 0.86;
        const field = ctx.createRadialGradient(c, c, 0, c, c, c * lit);
        field.addColorStop(0.00, 'rgba(255,255,255,0.74)');
        field.addColorStop(0.60, 'rgba(255,255,255,0.58)');
        field.addColorStop(1.00, 'rgba(255,255,255,0.36)');
        ctx.fillStyle = field;
        ctx.beginPath();
        ctx.arc(c, c, c * lit, 0, Math.PI * 2);
        ctx.fill();

        // The lens edge, brightest thing on the insert. This single hard ring is what makes a lit
        // insert read as a crisp object rather than a glow: the eye locks onto the boundary.
        ctx.strokeStyle = 'rgba(255,255,255,0.95)';
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.arc(c, c, c * (lit - 0.04), 0, Math.PI * 2);
        ctx.stroke();

        // Every family symbol is stroked with round caps and joins at a deliberately heavy width.
        // At the sizes these render, a thin elegant line disappears entirely and a mitred corner
        // reads as a stray pixel; weight and rounded ends are what survive downsampling.
        ctx.strokeStyle = 'rgba(255,255,255,0.98)';
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        if (legend === 'up' || legend === 'down') {
            // Classic notched lane arrow. dir flips it along the table's Z axis.
            const dir = legend === 'down' ? 1 : -1;
            ctx.fillStyle = 'rgba(255,255,255,0.98)';
            ctx.beginPath();
            ctx.moveTo(c, c + dir * 34);
            ctx.lineTo(c + 26, c - dir * 6);
            ctx.lineTo(c + 10, c - dir * 6);
            ctx.lineTo(c + 10, c - dir * 30);
            ctx.lineTo(c - 10, c - dir * 30);
            ctx.lineTo(c - 10, c - dir * 6);
            ctx.lineTo(c - 26, c - dir * 6);
            ctx.closePath();
            ctx.fill();
        } else if (legend === 'flow') {
            // INLANE - return / flow. Two nested chevrons pointing down-table: the direction the
            // ball returns from, said twice so it reads as movement rather than as a static arrow.
            ctx.lineWidth = 10;
            for (const off of [-16, 8]) {
                ctx.beginPath();
                ctx.moveTo(c - 24, c + off);
                ctx.lineTo(c, c + off + 20);
                ctx.lineTo(c + 24, c + off);
                ctx.stroke();
            }
        } else if (legend === 'void') {
            // OUTLANE - danger / void. A bold X, the one symbol here with no curves and no
            // vertical axis, so it cannot be mistaken for any of the other three at any size.
            ctx.lineWidth = 12;
            const d = 24;
            ctx.beginPath();
            ctx.moveTo(c - d, c - d); ctx.lineTo(c + d, c + d);
            ctx.moveTo(c + d, c - d); ctx.lineTo(c - d, c + d);
            ctx.stroke();
        } else if (legend === 'cycle') {
            // ORBIT - cycle / infinity. A ring broken at the top with an arrowhead on the open
            // end: the gap plus the head is what turns a plain circle into a direction of travel,
            // and the ring is the only closed curve in the set.
            //
            // The head is placed and pointed from the arc's own tangent rather than by hand-picked
            // offsets. A first version offset it by eye and rendered as a blob hanging off the
            // ring at the wrong angle - at this size an arrowhead that is a few degrees out does
            // not read as an arrow at all, it reads as damage.
            ctx.lineWidth = 11;
            const r = 30;
            const gapHalf = Math.PI * 0.24;       // half the opening, centred on 12 o'clock
            const top = -Math.PI / 2;
            const from = top + gapHalf;           // sweep clockwise from the gap's right edge...
            const to = top - gapHalf + Math.PI * 2; // ...all the way round to its left edge
            ctx.beginPath();
            ctx.arc(c, c, r, from, to);
            ctx.stroke();
            // Tangent at the arc's END, in the direction of increasing angle - i.e. the way the
            // stroke was travelling when it stopped.
            const hx = c + Math.cos(to) * r, hy = c + Math.sin(to) * r;
            const tx = -Math.sin(to), ty = Math.cos(to);
            const nx = -ty, ny = tx;              // perpendicular, for the head's base
            const len = 17, half = 11;
            ctx.fillStyle = 'rgba(255,255,255,0.98)';
            ctx.beginPath();
            ctx.moveTo(hx + tx * len, hy + ty * len);
            ctx.lineTo(hx + nx * half, hy + ny * half);
            ctx.lineTo(hx - nx * half, hy - ny * half);
            ctx.closePath();
            ctx.fill();
        } else if (legend === 'ground') {
            // RE-ENTRY - return-to-body / grounding. The electrical earth mark: a stem descending
            // into three stacked bars of decreasing width.
            //
            // Chosen over the obvious "chevron landing on a baseline" because that version shared
            // its basic shape with the inlane's chevrons, and two symbols that differ only by an
            // added bar are exactly the pair that stops being distinguishable first as the insert
            // shrinks. Stacked horizontals against chevrons, a cross and a circle gives all four
            // families a silhouette nothing else in the set approaches.
            ctx.lineWidth = 10;
            ctx.beginPath();
            ctx.moveTo(c, c - 30);
            ctx.lineTo(c, c - 6);
            ctx.stroke();
            const bars = [[28, -4], [18, 10], [8, 24]];
            for (const [halfW, dy] of bars) {
                ctx.lineWidth = 10;
                ctx.beginPath();
                ctx.moveTo(c - halfW, c + dy);
                ctx.lineTo(c + halfW, c + dy);
                ctx.stroke();
            }
        } else {
            // Two concentric rings - the "this is a state lamp, not a shot" legend.
            ctx.strokeStyle = 'rgba(255,255,255,0.96)';
            ctx.lineWidth = 5;
            for (const r of [0.52, 0.28]) {
                ctx.beginPath();
                ctx.arc(c, c, c * r, 0, Math.PI * 2);
                ctx.stroke();
            }
        }

        texture.update();
        return texture;
    }

    // Premium flipper bat face (flipper-visual pass, user-requested - "look like real premium
    // pinball bats with SPIRITBALL identity"). The bat was a bare CreateBox wearing one flat
    // magenta PBR material with a heavy uniform emissive, which the board-graphics audit measured
    // reading as a solid glowing tube: p95 225, blown to near-white at the pivot, no bat shape, no
    // rubber, no hinge, and a bloom halo landing mostly OFF the mesh (the flippers owned 0.6% of
    // the frame's brightest pixels at 1.04% coverage, while the lane geometry they bleed onto
    // owned 40.7%).
    //
    // Everything here is surface. The box's dimensions, pivot, motion, collision filter and
    // restitution are untouched - this only changes what that box is painted with.
    //
    // UV layout, measured by painting four labelled bands onto the real bats in the real scene
    // rather than assumed: u = 0 is the PIVOT end and u = 1 is the TIP, identically on both
    // flippers (they share this material and the same local-space mesh offset, so left/right
    // symmetry is structural rather than something this drawing has to maintain). v runs across
    // the bat, and the large camera-facing striking face carries the full square - it is the
    // surface a player actually looks at, not the narrow top edge.
    //
    // Drawn symmetric about v = 0.5 on purpose: the rubber has to land on BOTH long edges anyway
    // (a real flipper's sleeve wraps it), and a v-symmetric design cannot be installed upside
    // down on any face of the box, which removes a whole class of "which way up is this" bug.
    //
    // Returns { albedo, emissive } - two textures from one drawing pass. Splitting them is the
    // point of the exercise: the albedo carries the bat, and the emissive is near-black except
    // for the accent and hinge ring, so the body stops self-illuminating and only the detail
    // glows. That is what lets the flat emissive come down far enough for the ball to out-shine
    // the flippers again.
    function createFlipperBatTextures(scene) {
        const W = 512, H = 64;
        const albedo = new BABYLON.DynamicTexture('flipperBatTex', { width: W, height: H }, scene, true);
        const emissive = new BABYLON.DynamicTexture('flipperBatEmisTex', { width: W, height: H }, scene, true);
        const a = albedo.getContext();
        const e = emissive.getContext();

        const RUBBER = 0.155;                  // fraction of the bat's width taken by each sleeve
        const bodyTop = H * RUBBER, bodyBot = H * (1 - RUBBER);

        // --- albedo -------------------------------------------------------------------------
        // Rubber sleeve first, as the ground everything else sits inside. Near-black with a warm
        // violet bias rather than neutral: a real sleeve picks up the playfield's colour, and pure
        // grey read as a dead band against this board's magenta.
        a.fillStyle = '#120a16';
        a.fillRect(0, 0, W, H);

        // Bat body - a magenta face that cools and darkens toward the tip. Real bats are lit from
        // the base end by the playfield inserts under them, and the falloff is most of what makes
        // a long flat object read as having a near end and a far end rather than as a bar.
        const body = a.createLinearGradient(0, 0, W, 0);
        body.addColorStop(0.00, '#ff5cf2');
        body.addColorStop(0.30, '#f02fe0');
        body.addColorStop(0.72, '#c018bd');
        body.addColorStop(1.00, '#8a1090');
        a.fillStyle = body;
        a.fillRect(0, bodyTop, W, bodyBot - bodyTop);

        // Taper. The box cannot narrow - its collider depends on staying a box - so the taper is
        // painted: the sleeve is allowed to eat into the body toward the tip, which reads from the
        // gameplay camera as a bat that gets thinner rather than as a rectangle that gets darker.
        a.fillStyle = '#120a16';
        a.beginPath();
        a.moveTo(W, bodyTop); a.lineTo(W, bodyTop + (bodyBot - bodyTop) * 0.30);
        a.lineTo(W * 0.52, bodyTop); a.closePath(); a.fill();
        a.beginPath();
        a.moveTo(W, bodyBot); a.lineTo(W, bodyBot - (bodyBot - bodyTop) * 0.30);
        a.lineTo(W * 0.52, bodyBot); a.closePath(); a.fill();

        // Moulded highlight along the body's upper half - the single strongest "this is a curved
        // plastic object" cue available on a flat face.
        const gloss = a.createLinearGradient(0, bodyTop, 0, bodyTop + (bodyBot - bodyTop) * 0.55);
        gloss.addColorStop(0, 'rgba(255,255,255,0.34)');
        gloss.addColorStop(1, 'rgba(255,255,255,0)');
        a.fillStyle = gloss;
        a.fillRect(0, bodyTop, W, (bodyBot - bodyTop) * 0.55);

        // Bright printed keylines where body meets rubber. This is the rubber-edge CONTRAST the
        // pass exists for: a dark band alone reads as a shadow, but a dark band with a lit edge on
        // it reads as a separate material bolted to the bat.
        a.strokeStyle = 'rgba(255,220,255,0.92)';
        a.lineWidth = 3;
        a.beginPath(); a.moveTo(0, bodyTop); a.lineTo(W, bodyTop);
        a.moveTo(0, bodyBot); a.lineTo(W, bodyBot); a.stroke();

        // Hinge hub at the pivot end - a dark boss with a bright collar, the fixture a real bat is
        // bolted to. Also gives the base end something to BE, instead of the blown-out blob the
        // audit screenshotted.
        const hubX = W * 0.055, hubR = H * 0.30;
        a.fillStyle = '#1d1024';
        a.beginPath(); a.arc(hubX, H / 2, hubR, 0, Math.PI * 2); a.fill();
        a.strokeStyle = 'rgba(255,190,255,0.85)';
        a.lineWidth = 3.5;
        a.beginPath(); a.arc(hubX, H / 2, hubR, 0, Math.PI * 2); a.stroke();
        a.fillStyle = 'rgba(255,255,255,0.55)';
        a.beginPath(); a.arc(hubX, H / 2, hubR * 0.30, 0, Math.PI * 2); a.fill();

        // SPIRITBALL identity mark, centred on the bat: the third-eye lens the board already
        // speaks in (the Vision Gate, the bumpers' circled-dot insert), drawn as a pointed oval
        // with a bright pupil and a pair of chevrons running toward the tip. Bold and closed -
        // measured, a bat renders about 150x25 screen pixels, which carries a silhouette and a
        // couple of strokes and nothing finer.
        const eyeX = W * 0.46, eyeRy = (bodyBot - bodyTop) * 0.34, eyeRx = eyeRy * 2.0;
        a.strokeStyle = 'rgba(255,240,255,0.95)';
        a.lineWidth = 3.5;
        a.beginPath();
        a.moveTo(eyeX - eyeRx, H / 2);
        a.quadraticCurveTo(eyeX, H / 2 - eyeRy * 2.1, eyeX + eyeRx, H / 2);
        a.quadraticCurveTo(eyeX, H / 2 + eyeRy * 2.1, eyeX - eyeRx, H / 2);
        a.closePath(); a.stroke();
        a.fillStyle = 'rgba(255,255,255,0.92)';
        a.beginPath(); a.arc(eyeX, H / 2, eyeRy * 0.52, 0, Math.PI * 2); a.fill();
        a.strokeStyle = 'rgba(255,225,255,0.75)';
        a.lineWidth = 3;
        a.lineCap = 'round';
        for (let i = 0; i < 2; i++) {
            const cx = W * (0.70 + i * 0.085);
            a.beginPath();
            a.moveTo(cx, H / 2 - eyeRy * 0.85);
            a.lineTo(cx + W * 0.030, H / 2);
            a.lineTo(cx, H / 2 + eyeRy * 0.85);
            a.stroke();
        }
        albedo.update();

        // --- emissive -----------------------------------------------------------------------
        // Black everywhere the bat should merely be LIT rather than a light source. The body keeps
        // a low, tip-falling grey so it still reads as backlit plastic; the rubber emits nothing
        // at all, which is what makes the sleeve read as rubber next to a glowing face.
        e.fillStyle = '#000000';
        e.fillRect(0, 0, W, H);
        const bodyE = e.createLinearGradient(0, 0, W, 0);
        bodyE.addColorStop(0.00, '#3a3a3a');
        bodyE.addColorStop(0.55, '#2a2a2a');
        bodyE.addColorStop(1.00, '#141414');
        e.fillStyle = bodyE;
        e.fillRect(0, bodyTop + 2, W, (bodyBot - bodyTop) - 4);
        // The lit detail: keylines, hinge collar, eye and chevrons. These are the only parts of a
        // flipper that should still punch after the body has been quietened.
        e.strokeStyle = 'rgba(255,255,255,0.80)';
        e.lineWidth = 3;
        e.beginPath(); e.moveTo(0, bodyTop); e.lineTo(W, bodyTop);
        e.moveTo(0, bodyBot); e.lineTo(W, bodyBot); e.stroke();
        e.strokeStyle = 'rgba(255,255,255,0.85)';
        e.lineWidth = 3.5;
        e.beginPath(); e.arc(hubX, H / 2, hubR, 0, Math.PI * 2); e.stroke();
        e.fillStyle = 'rgba(255,255,255,0.95)';
        e.beginPath(); e.arc(hubX, H / 2, hubR * 0.30, 0, Math.PI * 2); e.fill();
        e.strokeStyle = 'rgba(255,255,255,0.95)';
        e.lineWidth = 3.5;
        e.beginPath();
        e.moveTo(eyeX - eyeRx, H / 2);
        e.quadraticCurveTo(eyeX, H / 2 - eyeRy * 2.1, eyeX + eyeRx, H / 2);
        e.quadraticCurveTo(eyeX, H / 2 + eyeRy * 2.1, eyeX - eyeRx, H / 2);
        e.closePath(); e.stroke();
        e.fillStyle = 'rgba(255,255,255,1)';
        e.beginPath(); e.arc(eyeX, H / 2, eyeRy * 0.52, 0, Math.PI * 2); e.fill();
        e.strokeStyle = 'rgba(255,255,255,0.70)';
        e.lineWidth = 3;
        e.lineCap = 'round';
        for (let i = 0; i < 2; i++) {
            const cx = W * (0.70 + i * 0.085);
            e.beginPath();
            e.moveTo(cx, H / 2 - eyeRy * 0.85);
            e.lineTo(cx + W * 0.030, H / 2);
            e.lineTo(cx, H / 2 + eyeRy * 0.85);
            e.stroke();
        }
        emissive.update();
        return { albedo, emissive };
    }

    // Vision Gate beacon shaft. The beacon used to be a plain translucent cylinder, and from the
    // gameplay camera that rendered as a 7x130px hard-edged magenta bar running straight through
    // Saturn and 50px past the top rail into empty starfield - measured in the board-graphics
    // audit, where it read as a rendering artifact rather than as a beam of light. A beam needs
    // two things a solid-colour cylinder cannot give: it has to be brightest where it leaves its
    // source and it has to END by fading out, not by stopping.
    //
    // Both come from one 32x256 gradient: full brightness at the base, falling to nothing at the
    // top, with the alpha channel carrying the same curve so the shaft dissolves into the sky.
    // Drawn once at load, shared, no per-frame cost. Greyscale for the usual reason - it is an
    // emissiveTexture, so it multiplies whatever colour the material carries, and the gate's
    // colour has to stay free to be driven by the capture sequence.
    function createGateBeaconTexture(scene) {
        const w = 32, h = 256;
        const texture = new BABYLON.DynamicTexture('gateBeaconTex', { width: w, height: h }, scene, true);
        const ctx = texture.getContext();
        ctx.clearRect(0, 0, w, h);
        // v=0 is the top of the shaft (the far end), v=1 the base at the playfield.
        //
        // The curve holds full brightness through the lower 55% and fades only above it, which is
        // not the obvious choice and was arrived at by looking. A plain squared falloff (bright at
        // the base, dark by mid-shaft) is the physically tidy answer and it made the beacon
        // effectively disappear: from the fixed gameplay camera the boss bumper occludes the gate's
        // base, so the only part of the shaft a player can actually see is the part a base-weighted
        // gradient throws away. Brightness has to live where the shaft CLEARS the bumper, and the
        // fade has to happen above that, at the end that was previously a hard cut across the sky.
        const holdTo = 0.55;                  // fraction of the height (from the base) kept at full
        for (let y = 0; y < h; y++) {
            const t = y / (h - 1);            // 0 at top, 1 at base
            const a = t >= holdTo ? 1 : Math.pow(t / holdTo, 1.6);
            ctx.fillStyle = 'rgba(255,255,255,' + a.toFixed(4) + ')';
            ctx.fillRect(0, y, w, 1);
        }
        // A brighter core down the middle third, so the shaft has an axis rather than being a
        // uniform slab - the same "give it a centre to read" trick the comet tail uses.
        const core = ctx.createLinearGradient(0, 0, w, 0);
        core.addColorStop(0.00, 'rgba(255,255,255,0)');
        core.addColorStop(0.50, 'rgba(255,255,255,0.62)');
        core.addColorStop(1.00, 'rgba(255,255,255,0)');
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = core;
        ctx.fillRect(0, Math.round(h * 0.35), w, h - Math.round(h * 0.35));
        ctx.globalCompositeOperation = 'source-over';
        texture.update();
        texture.hasAlpha = true;
        return texture;
    }

    // Mission drop-target face. A real illuminated drop target is a translucent plastic plate with
    // a bright printed border, a number, and a lamp behind it - the border and the number are what
    // make a bank of them readable at a glance, and are exactly what a single flat colour can't
    // give. Same procedural DynamicTexture approach as createBumperCapTexture() above, for the
    // same reason: no asset to ship, and it stays the FALLBACK - SKIN_MANIFEST.missionTargetFace[i]
    // reassigns albedoTexture wholesale when real artwork exists (applySkinTexture() runs after
    // this), so custom art never has to fight a baked-in border.
    //
    // Deliberately only an albedoTexture, never an emissiveTexture: a skin only ever replaces
    // albedoTexture, so a procedural emissive layer would keep glowing this border through
    // whatever art was dropped on top. The material's flat emissiveColor supplies the "lit plastic"
    // glow instead, which custom art inherits correctly.
    function createTargetFaceTexture(scene, color, number) {
        const w = 128, h = 136;
        const texture = new BABYLON.DynamicTexture('targetFaceTex' + number, { width: w, height: h }, scene, true);
        const ctx = texture.getContext();
        // The chakra colour is baked in here, so the material's own albedoColor is set to white by
        // the caller - otherwise the tint would be applied twice (texture x albedoColor) and every
        // target would read as a muddy near-black plate.
        //
        // Lighter shades mix toward WHITE rather than scaling the colour up, which matters because
        // the chakra palette is deliberately saturated: HEX_CHAKRA[1] is 0xff1493 and [2] is
        // 0xffff00, so multiplying by anything >1 just clamps and every "brighter" stop comes out
        // as the identical flat colour - a gradient that renders as no gradient at all. Mixing
        // toward white is the only way to get real luminance range out of a channel already at 1.
        const rgb = (r, g, b, a) => 'rgba(' + Math.round(r * 255) + ',' + Math.round(g * 255) + ',' + Math.round(b * 255) + ',' + a + ')';
        const lighten = (t, a) => rgb(color.r + (1 - color.r) * t, color.g + (1 - color.g) * t, color.b + (1 - color.b) * t, a === undefined ? 1 : a);
        const shade = (s2, a) => rgb(color.r * s2, color.g * s2, color.b * s2, a === undefined ? 1 : a);
        const roundRect = (x, y, rw, rh, r) => {
            ctx.beginPath();
            ctx.moveTo(x + r, y);
            ctx.arcTo(x + rw, y, x + rw, y + rh, r);
            ctx.arcTo(x + rw, y + rh, x, y + rh, r);
            ctx.arcTo(x, y + rh, x, y, r);
            ctx.arcTo(x, y, x + rw, y, r);
            ctx.closePath();
        };

        // Dark moulded rim right at the plate's edge. Drawn first, as the base layer everything
        // else sits inside: without it the bright border below has nothing to read against on its
        // outer side, and against the dark playfield the plate's silhouette dissolves.
        ctx.fillStyle = shade(0.16);
        ctx.fillRect(0, 0, w, h);

        // Plate body: brightest just under the top edge and deepening downward, the way a plate lit
        // from a lamp behind its upper half actually falls off. Kept deliberately short of white
        // at its brightest stop so the printed border below still stands out against it.
        const body = ctx.createLinearGradient(0, 0, 0, h);
        body.addColorStop(0.00, lighten(0.06));
        body.addColorStop(0.32, lighten(0.34));
        body.addColorStop(1.00, shade(0.30));
        ctx.fillStyle = body;
        roundRect(7, 7, w - 14, h - 14, 8);
        ctx.fill();

        // Printed border: a bright ring, then a dark hairline just inside it. The dark line is what
        // stops the bright ring from bleeding into the plate body at a distance, which is the whole
        // reason real target art draws one - and here it also survives the material's flat emissive
        // glow, which lifts every channel equally and so preserves dark-on-light contrast better
        // than light-on-light.
        ctx.strokeStyle = 'rgba(255,255,255,0.95)';
        ctx.lineWidth = 6;
        roundRect(11, 11, w - 22, h - 22, 7);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(0,0,0,0.55)';
        ctx.lineWidth = 3;
        roundRect(16, 16, w - 32, h - 32, 5);
        ctx.stroke();

        // Bank number. Real drop-target banks are numbered so the player can tell which one is
        // still standing without reading its colour - the single most useful mark to put here.
        ctx.fillStyle = 'rgba(255,255,255,0.97)';
        ctx.strokeStyle = 'rgba(0,0,0,0.55)';
        ctx.lineWidth = 5;
        ctx.font = 'bold 66px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.strokeText(String(number), w / 2, h * 0.52);
        ctx.fillText(String(number), w / 2, h * 0.52);

        // Moulded-plastic sheen across the top third - the highlight a curved plastic face catches,
        // and a cue that reads as depth even when the plate is only ~30px tall on screen.
        const gloss = ctx.createLinearGradient(0, 0, 0, h * 0.40);
        gloss.addColorStop(0, 'rgba(255,255,255,0.22)');
        gloss.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = gloss;
        roundRect(7, 7, w - 14, h * 0.40, 8);
        ctx.fill();

        texture.update();
        return texture;
    }

    // Ball trail: emitter attached directly to the ball mesh (particles spawn at its current
    // position every frame automatically), additive-blended for a luminous (not opaque) look -
    // direct port of setupParticles()'s follow-the-ball ballTrail emitter, kept as the one and
    // only trail system (no second/competing implementation). Started immediately but with
    // emitRate AND lifetime driven every frame from the ball's actual speed (see
    // updateBallTrail() in main()'s render loop) rather than fixed constants, so both the density
    // and the physical length of the trail track how fast the ball is actually moving instead of
    // a trail that looks the same whether the ball is crawling or flying.
    //
    // Cosmic/ethereal pass (user-requested - "subtle luminous comet-like trail... not giant fire
    // particles, not opaque, not visually distracting"): near-zero emit power keeps each particle
    // essentially anchored to the spot it was born at (a "breadcrumb" left behind by the moving
    // emitter) instead of scattering outward - that's what makes this read as a comet tail
    // following the ball's actual recent path rather than a puff of smoke drifting on its own.
    // Two-stop color gradient - a bright cyan-white core (matching the ball's own eyeball tint)
    // cooling to a soft violet (the same cosmic hue family as buildDrainVortex()'s purple/indigo)
    // before fading to fully transparent - gives "brightest close to the ball, smoothly fades
    // with distance" without needing per-particle gradient APIs beyond what this file's other
    // particle systems already use (color1/color2/colorDead, proven elsewhere in this exact
    // function group).
    const BALL_TRAIL_CORE_COLOR = new BABYLON.Color3(0.75, 1, 1); // cyan-white, blended toward white for a brighter "hot" core than the flat eyeball tint alone
    const BALL_TRAIL_COOL_COLOR = new BABYLON.Color3(0.55, 0.35, 0.95); // soft cosmic violet, same family as the drain vortex's purple/indigo
    function buildBallTrail(scene, texture, ballMesh, highFidelity) {
        const trail = new BABYLON.ParticleSystem('ballTrail', highFidelity ? 200 : 80, scene);
        trail.particleTexture = texture;
        trail.emitter = ballMesh;
        trail.minEmitBox = new BABYLON.Vector3(0, 0, 0);
        trail.maxEmitBox = new BABYLON.Vector3(0, 0, 0);
        trail.color1 = new BABYLON.Color4(BALL_TRAIL_CORE_COLOR.r, BALL_TRAIL_CORE_COLOR.g, BALL_TRAIL_CORE_COLOR.b, 0.65); // brightest, right at the ball - well short of opaque
        trail.color2 = new BABYLON.Color4(BALL_TRAIL_COOL_COLOR.r, BALL_TRAIL_COOL_COLOR.g, BALL_TRAIL_COOL_COLOR.b, 0.22); // cooling and dimming with age/distance
        trail.colorDead = new BABYLON.Color4(BALL_TRAIL_COOL_COLOR.r, BALL_TRAIL_COOL_COLOR.g, BALL_TRAIL_COOL_COLOR.b, 0);
        trail.minSize = 0.005;
        trail.maxSize = 0.012; // well under the ball's own 27mm diameter - a wisp, not a fireball
        trail.minLifeTime = 0.25; // base range at low speed; updateBallTrail() scales both up together for a longer trail at higher speed
        trail.maxLifeTime = 0.4;
        trail.emitRate = 0; // driven per-frame by updateBallTrail() based on ball speed
        trail.blendMode = BABYLON.ParticleSystem.BLENDMODE_ADD;
        trail.direction1 = new BABYLON.Vector3(-0.01, 0, -0.01); // a whisper of outward drift for a soft ethereal shimmer, not real scatter
        trail.direction2 = new BABYLON.Vector3(0.01, 0.015, 0.01);
        trail.minEmitPower = 0.005; // near-stationary once spawned - what makes it read as a trail tracing the path, not a cloud
        trail.maxEmitPower = 0.02;
        trail.start();
        return trail;
    }

    // Continuously adjusts the ball trail's emit rate AND per-particle lifetime from its actual
    // current speed - called once per frame from the render loop. Below the stuck-speed-ish
    // threshold it's effectively off (nearly disappears once the ball settles); above
    // MAX_BALL_SPEED_MS both density and length are at their maximum. Reading getLinearVelocity()
    // once and doing only scalar math after it (no `new` calls) keeps this allocation-free beyond
    // whatever that single existing physics-API read itself costs - not adding a second, separate
    // per-frame allocation to what updateBallPhysics() already produces this same frame.
    function updateBallTrail(trail, ball, highFidelity) {
        const velocity = ball.aggregate.body.getLinearVelocity();
        const speed = velocity.length();
        const speedFraction = Math.min(speed / MAX_BALL_SPEED_MS, 1);
        // Reduced-motion: this trail is a motion-READABILITY aid tied directly to gameplay (not
        // pure ambient decoration like buildChakraSparkle(), which fully disables under reduced
        // motion) - same "tone down, don't remove" treatment buildDrainVortex() gives its own
        // continuous emitter, just applied to both rate and length here.
        const reducedMotion = window.SPIRITBALL_reducedMotion;
        const rateScale = reducedMotion ? 0.35 : 1;
        const maxRate = highFidelity ? 60 : 25; // ~40/sec at 2D's frequency:25ms was the baseline; scaled up a bit since this trail fades with speed instead of running constantly
        trail.emitRate = speedFraction > 0.1 ? maxRate * speedFraction * rateScale : 0;

        // Trail length scales moderately with speed: growing minLifeTime/maxLifeTime (not just
        // emitRate) means a fast ball leaves a genuinely LONGER streak, not just a denser one at
        // a fixed length - up to ~1.6x the base lifetime at full speed (a moderate stretch, not
        // an exaggerated one). Babylon reads life{Min,Max}Time only at each particle's own
        // emission, so this never disturbs particles already in flight, only the ones about to
        // spawn.
        const lengthScale = (1 + speedFraction * 0.6) * (reducedMotion ? 0.7 : 1);
        trail.minLifeTime = 0.25 * lengthScale;
        trail.maxLifeTime = 0.4 * lengthScale;
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
    // colorOverride is optional. Without it this reads the struck mesh's own material exactly as
    // it always has, so every existing call site is unchanged; the ASCENSION beat passes the
    // state's palette colour so its burst is spectral rather than whatever the ball happens to
    // be. Short-circuits the material read entirely when given, so the caller is free to pass a
    // mesh whose material has neither albedoColor nor diffuseColor.
    function spawnHitBurst(scene, texture, mesh, highFidelity, colorOverride, name) {
        if (!devParticlesEnabled) return null; // dev HUD "particle effects" toggle - see its own declaration comment
        const color = colorOverride || mesh.material.albedoColor || mesh.material.diffuseColor;
        // Optional name, defaulting to the 'hitBurst' every call site produced before it existed.
        // The ASCENSION beat names its own so it is distinguishable in scene.particleSystems from
        // the ordinary hit bursts firing at the same instant - without that, "did the ascension
        // burst fire?" is unanswerable, because the bumper hits driving the vision are spawning
        // their own bursts in the same frames. qa/ascension-beat.js relies on this.
        const burst = new BABYLON.ParticleSystem(name || 'hitBurst', highFidelity ? 30 : 12, scene);
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
            { mass: BALL_MASS_KG, restitution: BALL_RESTITUTION, friction: BALL_FRICTION },
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

        return { mesh, aggregate, stuckTimeMs: 0, stuckKickStreak: 0, stuckRecoveryMs: 0, stuckKickDirX: 1 };
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
    //
    // Anti-stuck audit (user-requested - "safety net, not visible gameplay mechanic... small
    // deterministic escape... downhill bias... minimal vertical component... avoid obvious random
    // teleport/kick"). The escape direction is fully deterministic, not random: X is a push back
    // toward table center (X=0), signed by whichever side of center the ball is CURRENTLY on -
    // the same physical intuition as "nudge it off whatever wall is probably pinning it" the old
    // random version was going for, but reproducible (the same stuck position always escapes the
    // same way) instead of a coin flip. Z keeps the same fixed downhill (-Z) bias it already had.
    // Y is a much smaller nudge than before (STUCK_KICK_UP_MS) and does NOT escalate - see that
    // constant's own comment for why.
    //
    // The X/Z magnitude escalates on consecutive failed attempts (ball.stuckKickStreak, reset the
    // moment the ball shows real sustained motion on its own) rather than staying flat - see
    // STUCK_KICK_ESCALATION_STEP's own comment for why a flat deterministic magnitude alone turned
    // out to be a real regression against a symmetric trap (a synthetic box-canyon playtest found
    // it could oscillate the ball back toward center forever instead of ever clearing a wall).
    // Escalating keeps the common case small (this preference's #1 priority - most real stuck
    // episodes clear on the first, smallest kick) while still guaranteeing eventual escape for a
    // harder trap, which the old random version got "for free" from luck alone.
    //
    // Audited against genuine trapped corners, a ball cradled on a raised/held flipper, brief
    // low-speed moments in open play (e.g. cresting a slow uphill shot), the plunger's resting
    // state, and Vision Gate capture - the WHEN this fires was already correctly guarded for the
    // last two (see this file's own "Skipped while the Vision Gate holds the ball"/"Anti-stuck
    // audit fix - same reasoning extends to !ballInPlay" comment at the real call site), and
    // direct playtest measurement found the other three don't actually produce a sustained
    // near-zero-speed state in this table's current geometry (a raised flipper has no adjacent
    // wall close enough to trap the ball - it rolls off well within STUCK_TIME_THRESHOLD_MS every
    // time tested, single or double flipper) - so no additional firing-condition guard was needed
    // this pass; only the escape's OWN character (this comment) changed.
    function updateBallPhysics(ball, deltaMs) {
        if (!ball.aggregate.body) return;

        const speed = clampBodySpeed(ball.aggregate.body, MAX_BALL_SPEED_MS);

        if (speed < STUCK_SPEED_THRESHOLD_MS) {
            ball.stuckTimeMs += deltaMs;
            // Any dip back below the speed threshold cancels recovery progress - a kick that only
            // produces a brief high-speed instant before the ball settles right back into the same
            // trap must NOT look like a "real" recovery, or every failed kick would immediately
            // erase the escalation it just earned.
            ball.stuckRecoveryMs = 0;
            if (ball.stuckTimeMs >= STUCK_TIME_THRESHOLD_MS) {
                if (ball.stuckKickStreak === 0) {
                    // Lock in the escape direction on the FIRST kick of a new streak - whichever
                    // side of center the ball is on right now (defaulting rightward in the
                    // vanishingly unlikely exact-center case). Every escalating follow-up kick in
                    // this SAME streak (below) reuses this stored direction instead of
                    // recomputing it from the ball's position each time - recomputing from
                    // current position was the actual bug a synthetic symmetric-trap playtest
                    // found: once an escape attempt overshoots back across center, "always push
                    // toward instantaneous center" reverses direction on the very next kick,
                    // so magnitude escalation alone still zigzagged forever instead of ever
                    // clearing a wall. A locked direction plus escalating magnitude makes
                    // consistent, one-way progress instead.
                    ball.stuckKickDirX = -Math.sign(ball.mesh.position.x) || 1;
                }
                const escalation = Math.min(1 + ball.stuckKickStreak * STUCK_KICK_ESCALATION_STEP, STUCK_KICK_ESCALATION_MAX);
                const kickX = ball.stuckKickDirX * STUCK_KICK_CENTERWARD_MS * escalation;
                const kickZ = -STUCK_KICK_DOWNHILL_MS * escalation;
                ball.aggregate.body.setLinearVelocity(new BABYLON.Vector3(kickX, STUCK_KICK_UP_MS, kickZ));
                ball.stuckTimeMs = 0;
                ball.stuckKickStreak++;
            }
        } else {
            ball.stuckTimeMs = 0;
            // The streak only resets once the ball has stayed above the speed threshold
            // CONTINUOUSLY for as long as the stuck-detection window itself, not just for the one
            // frame right after a kick (which is always fast) - see this branch's own guard
            // above. That's what makes escalation actually escalate for a genuinely hard trap
            // instead of getting wiped back to the base magnitude by the kick's own velocity.
            ball.stuckRecoveryMs += deltaMs;
            if (ball.stuckRecoveryMs >= STUCK_TIME_THRESHOLD_MS) {
                ball.stuckKickStreak = 0;
            }
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
    //
    // PIVOT FIX (root-caused after the ANIMATED rewrite above still didn't behave like a real
    // flipper - see FLIPPER_SWEEP_RAD's comment in config.js for the full numeric proof): the
    // very first ANIMATED version kept the paddle as a plain CENTER-origin box and re-derived its
    // world position every frame by hand - pivot + halfLength*(cos angle, sin angle) - to fake a
    // hinge at one end. That hand-rolled position formula silently used the OPPOSITE Z sign from
    // what BABYLON.Quaternion.RotationAxisToRef(Axis.Y, angle) actually rotates the mesh by, so
    // the "pivot" end wasn't pinned at all - it drifted up to 68mm (most of the paddle's own
    // 75mm length) away from the real pivot as the angle changed, which is what forced every
    // earlier fix into guessing rest/active angles and a 160-degree sweep against a moving target
    // instead of fixing the actual hinge.
    //
    // The fix removes the hand-rolled formula entirely rather than patching its sign: the paddle
    // mesh is now a child of a small pivot TransformNode, offset by a CONSTANT local
    // (FLIPPER_LENGTH_M / 2, 0, 0) that never changes. Only the pivot node's own
    // rotationQuaternion is touched per frame (in setFlipperAngle()) - Babylon's ordinary parent/
    // child transform math (not hand trig) turns that into the paddle's world transform, so the
    // base end is mathematically guaranteed to sit at the pivot's world position for every angle,
    // and there's no second formula left to disagree with the rotation. The physics shape stays
    // on the paddle mesh itself (not the pivot), so it's always exactly the visible box - Havok's
    // ANIMATED sync already resolves a parented mesh's ABSOLUTE (world) position/rotation each
    // step (confirmed against the vendored engine's own havokPlugin _getTransformInfos(), which
    // explicitly branches on `mesh.parent` and uses absolutePosition/absoluteRotationQuaternion),
    // so no other change was needed for collision to keep tracking the paddle correctly.
    // ===================================
    function createFlipper(scene, name, pivotWorldPos, isLeft, mat) {
        // Clearance above the playfield: the playfield's top face sits at exactly Y=0 (see its
        // own comment), and pivotWorldPos.y (FLIPPER_HEIGHT_M / 2) would put the flipper box's
        // bottom face flush against it. Kept from the constraint-based version even though a
        // kinematic body can't "fight" a LOCK constraint anymore - real flippers don't drag
        // directly on the playfield surface either, and it costs nothing.
        const pivotPos = new BABYLON.Vector3(pivotWorldPos.x, pivotWorldPos.y + FLIPPER_PLAYFIELD_CLEARANCE_M, pivotWorldPos.z);

        // The pivot itself: a bare TransformNode with no geometry, positioned once at the true
        // stationary hinge point and never moved again - only ever rotated (see
        // setFlipperAngle()). Everything else (paddle mesh, physics shape) hangs off it.
        const pivotNode = new BABYLON.TransformNode(name + 'Pivot', scene);
        pivotNode.position.copyFrom(pivotPos);
        pivotNode.rotationQuaternion = BABYLON.Quaternion.Identity();

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

        // Paddle offset outward from the pivot by half its own length, in the PIVOT's local
        // space, so the paddle's inner edge sits exactly on the pivot and its outer edge (the
        // tip) sits a full FLIPPER_LENGTH_M away. This local offset and the mesh's own
        // rotationQuaternion (identity - no rotation relative to the pivot) are set ONCE and
        // never touched again; every angle change happens on pivotNode instead, which is what
        // makes the pivot mathematically stationary regardless of angle.
        mesh.parent = pivotNode;
        mesh.position.set(halfLength, 0, 0);
        mesh.rotationQuaternion = BABYLON.Quaternion.Identity();

        const aggregate = new BABYLON.PhysicsAggregate(
            mesh,
            BABYLON.PhysicsShapeType.BOX,
            { mass: FLIPPER_MASS_KG, restitution: FLIPPER_RESTITUTION, friction: FLIPPER_FRICTION },
            scene
        );
        // PhysicsAggregate only offers STATIC (mass 0) or DYNAMIC (mass > 0) directly - ANIMATED
        // (kinematic) requires an explicit setMotionType() call after construction. Confirmed
        // real API against physicsBody.ts/IPhysicsEnginePlugin.ts.
        aggregate.body.setMotionType(BABYLON.PhysicsMotionType.ANIMATED);
        // disablePreStep defaults to true (Havok's own default, for performance, since most
        // bodies are STATIC or DYNAMIC and never need it) - an ANIMATED body needs it OFF so
        // Havok reads this mesh's transform every step instead of ignoring it. Confirmed real
        // property against physicsBody.ts. Works the same for a parented mesh - see this
        // function's own header comment for the confirmed engine-source proof.
        aggregate.body.disablePreStep = false;
        // Only the ball should ever physically collide with a flipper - see
        // COLLISION_CATEGORY_BALL's comment. No longer needed for LOCK-vs-collision fighting
        // (there's no LOCK constraint anymore), but still correct: flippers have no gameplay
        // reason to push against the playfield, walls, or other scenery.
        aggregate.shape.filterCollideMask = COLLISION_CATEGORY_BALL;

        // Real-pinball-mechanics baseline (see FLIPPER_LEFT_REST_RAD/FLIPPER_RIGHT_REST_RAD's own
        // comment): REST points down-and-outward, ACTIVE points up-and-inward, same as every real
        // (and virtual) pinball machine. LEFT sweeps by INCREASING angle and RIGHT by DECREASING.
        const motorSign = isLeft ? 1 : -1;
        const minAngleRad = isLeft ? restAngleRad : restAngleRad - FLIPPER_SWEEP_RAD;
        const maxAngleRad = isLeft ? restAngleRad + FLIPPER_SWEEP_RAD : restAngleRad;

        const flipper = { mesh, pivotNode, aggregate, active: false, motorSign, restAngleRad, minAngleRad, maxAngleRad, currentAngleRad: restAngleRad, angularVelocityRad: 0 };
        setFlipperAngle(flipper, restAngleRad);
        return flipper;
    }

    // Rotates the flipper's pivot node to the given absolute angle. The paddle mesh's own local
    // position/rotation relative to the pivot never change (set once in createFlipper()) - moving
    // only the parent pivot is what keeps the hinge point mathematically fixed at every angle,
    // instead of re-deriving a world position by hand each frame (see createFlipper()'s "PIVOT
    // FIX" comment for why the old per-frame hand-rolled version didn't actually do that). Havok
    // picks the resulting transform up next physics step via disablePreStep = false (see
    // createFlipper()) and uses it for collision response against the ball.
    function setFlipperAngle(flipper, angleRad) {
        flipper.currentAngleRad = angleRad;
        BABYLON.Quaternion.RotationAxisToRef(BABYLON.Axis.Y, angleRad, flipper.pivotNode.rotationQuaternion);
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
    // frame for both flippers, from the render loop, with real elapsed time via deltaMs - see the
    // call site's engine.getDeltaTime()) - see createFlipper()'s comment for why this replaced a
    // physics-constraint motor entirely. Deliberately a hard-clamped constant-angular-velocity
    // ramp, not an eased/lerped animation - see FLIPPER_ACTIVATE_SPEED_RAD_S/
    // FLIPPER_RETURN_SPEED_RAD_S's own comment for why. Because the step is derived from real
    // elapsed seconds (not a fixed per-frame increment), a flip takes the same real-world time
    // regardless of frame rate - the same electromechanical motion, just sampled at more or fewer
    // points.
    //
    // PRESS/HOLD (flipper.active): activateFlipper() flips `active` synchronously on the input
    // event, so the very next frame already starts ramping - no queued/delayed response. Each
    // frame steps flipper.currentAngleRad toward the active stop (maxAngleRad for LEFT,
    // minAngleRad for RIGHT) at FLIPPER_ACTIVATE_SPEED_RAD_S, hard-clamped via Math.min/Math.max
    // so it can never overshoot the stop. Once there, `next` (current + step) is always past the
    // clamp, so the SAME clamp re-selects the stop's exact value every subsequent frame - the
    // flipper holds bit-for-bit at the active angle with no oscillation or creep for as long as
    // the button stays down, using the identical code path as the initial swing.
    //
    // RELEASE (else branch): steps back toward restAngleRad at FLIPPER_RETURN_SPEED_RAD_S. The
    // `Math.abs(diff) <= maxStep` branch snaps directly to the exact rest angle on whichever frame
    // would otherwise overshoot it, instead of taking one more full-length step past it and
    // correcting later - so the return settles at precisely restAngleRad with no overshoot and no
    // jitter, the same guarantee the active-stop clamp gives the other direction.
    function updateFlipperMotor(flipper, deltaMs) {
        const dt = deltaMs / 1000;
        const oldAngleRad = flipper.currentAngleRad;
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
        syncFlipperPhysicsVelocity(flipper, oldAngleRad, dt);
    }

    // Ball<->flipper physics-tuning pass (user-requested): makes the paddle's Havok body carry its
    // own real motion into contact response, instead of only ever moving its COLLISION SHAPE.
    // disablePreStep=false (see createFlipper()'s comment) keeps Havok's contact GEOMETRY in sync
    // with setFlipperAngle()'s transform each step. Also sets the body's own linearVelocity/
    // angularVelocity to match that same motion (v = omega x r about the pivot, not a hand-picked
    // vector) - correct rigid-body bookkeeping for a body that IS moving, and what
    // flipper.angularVelocityRad below is read from. IMPORTANT caveat, confirmed by direct
    // measurement, not assumed: setting these fields on an ANIMATED (kinematic) Havok body does
    // NOT, on its own, make that velocity show up in the ball's post-contact velocity - a
    // fine-grained manual-step playtest (bypassing this sandbox's slow render loop so a full
    // ~115ms stroke could be sampled many times mid-swing, not completed within one throttled
    // frame) showed the paddle's OWN linearVelocity.x reaching >0.8 m/s during an active swing
    // while the ball's vx stayed exactly 0.00000 the entire time - i.e. Havok's kinematic contact
    // response is purely positional (it pushes the ball out of the way of the paddle's new
    // position each step) and never reads this body's velocity for the impulse math, contradicting
    // what "they behave like dynamic bodies... but still push other bodies out of the way" (Babylon's
    // own ANIMATED doc comment) would suggest. So the REAL, physically-derived momentum transfer
    // this pass needs lives in applyFlipperContactVelocity() below, applied once per real contact
    // (COLLISION_STARTED) using this exact same v = omega x r math evaluated at the actual contact
    // point instead of the paddle's center of mass - this function's job is just keeping
    // angularVelocityRad (and the body's own velocity fields, for correctness) current for that to
    // read.
    //
    // RUNAWAY-PADDLE FIX (playtest bug: "flippers fly off the screen after a few flips"): this
    // function used to ALSO push that same omega/v back onto the Havok body via
    // setAngularVelocity()/setLinearVelocity(). Those two calls were the bug. Havok integrates
    // velocity on an ANIMATED body, so each frame it displaced the body slightly; Babylon then
    // synced the body's world transform back onto the paddle mesh, and because that mesh is a
    // CHILD of the pivot node (see createFlipper()) the write landed in its LOCAL offset - the one
    // value createFlipper() sets once to (FLIPPER_LENGTH_M/2, 0, 0) and must never touch again.
    // The error compounded every swing: measured across repeated flip cycles, the local offset
    // drifted 0.03m after one cycle, 1.4m by the eighth, and 4.7m by the twenty-fifth - on a
    // 0.9m table. That is exactly the reported "works the first few times, then flies away"
    // (the pivot node itself never moved - 0.00m drift throughout - so the hierarchy was sound;
    // only the parented mesh was being walked away from it).
    //
    // Removing them costs nothing: this function's own comment above already documents, from
    // direct measurement, that Havok never reads a kinematic body's velocity for contact response,
    // and applyFlipperContactVelocity() - the code that actually transfers momentum to the ball -
    // reads flipper.angularVelocityRad (a plain JS field, set below), not the body. Nothing in
    // this file reads the flipper body's velocity at all. So the paddle keeps its full, correct
    // contact behaviour while no longer being integrated out of position.
    function syncFlipperPhysicsVelocity(flipper, oldAngleRad, dt) {
        const omega = dt > 0 ? (flipper.currentAngleRad - oldAngleRad) / dt : 0;
        flipper.angularVelocityRad = omega;
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
    // opts (all optional - every existing call site keeps its exact prior look untouched):
    //   transparent - skips the dark background chip entirely, leaving the rest of the canvas
    //     genuinely transparent instead of opaque-ish, so only the glyph itself glows. Added for
    //     the lane visual-polish pass' "subtle emissive arrows/markers" - a small floating symbol
    //     reads as a lane-flow indicator, where the existing opaque-chip look (right for a named
    //     callout like "L ORBIT") would look like a second competing label instead.
    //   fontSize - defaults to 20 (the size every existing text label already uses); markers use
    //     a bigger glyph since there's no chip/padding to fill.
    //   planeSize - defaults to 0.05 (every existing label's size); markers use a smaller one to
    //     stay subtle rather than reading as signage.
    // Numeric 0xRRGGBB (this file's/config.js's HEX_* convention) -> CSS hex string, for the rare
    // spot (bumper inserts) that needs a HEX_* color fed into a canvas-2d ctx.fillStyle rather
    // than a BABYLON.Color3.
    function cssColor(hex) {
        return '#' + hex.toString(16).padStart(6, '0');
    }

    // How bright a named shot callout is allowed to be, as a multiplier on its own emissive.
    //
    // Measured from the real gameplay camera, sampling only pixels a scene pick confirms the label
    // owns, on opaque plates so the reading is genuinely theirs: at full strength the callouts
    // rendered at p90 55-195. The BALL, sampled at eight playfield positions, ran p90 47-242 with
    // a MEDIAN of 112, and the flippers sat at 126-128. So 'L ORBIT' (195) and 'R ORBIT' (174)
    // were outranking both the ball and the flippers - tier-7 signage above tiers 1 and 3 - and
    // 'TARGETS' (120) was above the ball's median too.
    //
    // These are words painted on a playfield. On a real machine they are ink, lit by whatever
    // light happens to fall on them; here they were unlit full-strength emissive, which is why
    // they read as lights. The run-to-run noise floor on static scenery is +/-0-2%, so a change
    // this size is unambiguous rather than a lucky frame.
    const LABEL_SIGNAGE_EMISSIVE_LEVEL = 0.5;

    function createLabelPlane(scene, text, x, z, color, opts) {
        opts = opts || {};
        const texW = 128, texH = 48;
        const texture = new BABYLON.DynamicTexture('label' + text.replace(/\s/g, ''), { width: texW, height: texH }, scene, false);
        texture.hasAlpha = true;
        const ctx = texture.getContext();
        if (!opts.transparent) {
            ctx.fillStyle = 'rgba(5, 0, 15, 0.55)';
            ctx.fillRect(0, 0, texW, texH);
        }
        ctx.font = 'bold ' + (opts.fontSize || 20) + 'px monospace';
        ctx.fillStyle = color;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, texW / 2, texH / 2);
        texture.update();

        const mat = new BABYLON.StandardMaterial('labelMat' + text.replace(/\s/g, ''), scene);
        mat.diffuseColor = new BABYLON.Color3(0, 0, 0);
        mat.disableLighting = true;
        mat.emissiveTexture = texture;
        mat.opacityTexture = opts.transparent ? texture : null;
        mat.backFaceCulling = false;
        // Hierarchy pass: the named callouts are dimmed, the gameplay markers are not.
        //
        // The chip branch above is the discriminator, and that is not a coincidence - a label that
        // draws itself a background plate IS a named callout ('L ORBIT', 'VISION GATE'), pure
        // decoration that names a shot and carries no state. Every chipless user is a gameplay
        // marker that happens to reuse this helper: the bumper inserts (star/circle glyphs) and
        // the inlane/outlane flow arrows, which sit on their lamps and mean something. A future
        // transparent callout would have to opt in here.
        //
        // emissiveTexture.level is the scalar Babylon already multiplies the emissive sample by,
        // so this turns an existing dial down rather than adding anything.
        // opts.signage is the opt-in this comment asked for. The six shot glyphs below are
        // transparent (no chip) but ARE decoration naming a shot, so they take the same dimming the
        // worded callouts do - without it they would sit in the undimmed gameplay-marker tier and
        // outrank the ball, which is the exact problem the measurement above was written about.
        if (!opts.transparent || opts.signage) texture.level = LABEL_SIGNAGE_EMISSIVE_LEVEL;

        // Verified via Playwright screenshot (not assumed): a flat, playfield-level decal reads
        // as an edge-on sliver from this game's actual low, close, steeply-angled fixed camera
        // (buildCamera() - y=0.36 over a table extending to z~0.45, looking mostly along +Z with
        // only a ~22 degree downward tilt) - a flat horizontal surface at that shallow a viewing
        // angle is nearly invisible, the same reason real machines put shot callouts on a raised/
        // angled riser rather than flat playfield paint. Standing the plane upright and tilting it
        // back to roughly match the camera's own downward look angle - the same rotation.x=0.4
        // buildBackglass() already uses to face its panel toward this exact camera - fixes that.
        const size = opts.planeSize || 0.05;
        const plane = BABYLON.MeshBuilder.CreatePlane('labelPlane' + text.replace(/\s/g, ''), {
            width: size,
            height: size * (texH / texW),
            sideOrientation: BABYLON.Mesh.DOUBLESIDE
        }, scene);
        plane.material = mat;
        plane.position.set(x, 0.03, z);
        plane.rotation.x = 0.4;
        return plane;
    }

    // The six shots' glyphs. A shot callout on this board used to be a WORD on a chip - eight of
    // them across the playfield, which is signage doing the job geometry should. These replace the
    // six that name a shot with a single symbol each, in that shot's own identity colour, at just
    // over half the worded plate's size and with no background chip, so the playfield art behind
    // them stays visible.
    //
    // Glyphs, not arrows painted on the lane floor, for a reason already measured and recorded in
    // createLabelPlane(): from this game's low, steeply-angled fixed camera a flat playfield decal
    // reads as an edge-on sliver. Direction has to be carried by an upright form, so each symbol is
    // chosen to say the shot rather than point at it - a ring for the ringed planet, a star for the
    // comet, a triangle for the third eye - and the two orbits get the only literally directional
    // pair, pointing the way the ball goes round.
    //
    // Every glyph is from a Unicode block this build already renders elsewhere on the board
    // (the bumper inserts use U+25C9 and U+2605, the lane markers U+25B2/U+25BC), so none of them
    // can come out as a missing-glyph box.
    const SHOT_GLYPH = {
        orbitLeft: '\u25c0',   // solid left triangle - the way a left orbit carries the ball round
        orbitRight: '\u25b6',  // its mirror
        targets: '\u25c6',     // diamond - the drop-target bank's own plate shape
        saturn: '\u25c9',      // ringed circle, which is what Saturn is
        comet: '\u2605',       // star
        visionGate: '\u25b2'   // upward triangle - the third eye, and the gate is a straight-up shot
    };
    // Sized from a screenshot, not guessed. createLabelPlane draws into a 128x48 texture and its
    // plane inherits that 8:3 aspect, so a single centred glyph only ever occupies the middle
    // fontSize/48 of the height and fontSize/128 of the width. At the first attempt - fontSize 30
    // on a 0.028 plane - that worked out to about 7mm of visible symbol and the six of them were
    // simply not there from the gameplay camera. fontSize 44 fills the texture's height, and a
    // 0.055 plane puts each glyph at roughly 19mm square: smaller than the 50mm worded chip it
    // replaces, and readable.
    function createShotGlyph(scene, glyph, x, z, color) {
        return createLabelPlane(scene, glyph, x, z, color,
            { transparent: true, signage: true, fontSize: 44, planeSize: 0.055 });
    }

    // Lane visual-polish pass (user-requested - "raised guide rails... small depth/bevel details
    // rather than flat primitive shapes"): a thin second box stacked on top of an existing rail's
    // own flat top face, narrower and shorter than the rail itself so the rail's own material
    // still shows as a border all the way around it - a "stepped bevel," the cheapest possible
    // way to read as a milled/chamfered metal trim strip instead of a bare rectangular slab,
    // costing exactly one extra low-poly box per rail (never more, regardless of the rail's own
    // length - a 6-vertex-face box either way). Purely decorative, no PhysicsAggregate - the
    // rail underneath is already the real collider and keeps its exact existing shape/position;
    // this only ever adds a thin non-colliding cap on top of it, so ball physics/collision
    // boundaries are untouched by construction, not just by care. One shared material (see
    // buildObstacles()'s railCapMat) is reused across every call, matching housingMat's own
    // "one material instance for every rail" discipline.
    function addRailBevel(scene, name, mat, length, thickness, x, topY, z, rotationY) {
        const capHeight = 0.006;
        const cap = BABYLON.MeshBuilder.CreateBox(name, {
            width: Math.max(length - 0.006, 0.002),
            height: capHeight,
            depth: Math.max(thickness - 0.004, 0.0015)
        }, scene);
        cap.position.set(x, topY + capHeight / 2, z);
        if (rotationY) cap.rotation.y = rotationY;
        cap.material = mat;
        return cap;
    }

    // Lane visual-polish pass (user-requested - "inset/grooved lane surfaces where appropriate...
    // clear visual separation between inlanes/outlanes/orbits"): a paper-thin, low-alpha colored
    // film laid directly on the playfield surface along a lane's actual path, reusing exactly the
    // technique buildObstacles() already established for the reentry lanes' own "lit indicator"
    // box (a translucent colored PBR box, no collider) - just thinner and dimmer, since this is
    // meant to read as ambient corridor tinting across a whole lane, not a single bright mission-
    // state indicator. Deliberately NOT a new PhysicsAggregate and deliberately NOT touching the
    // real playfield mesh/material - the ball's actual rolling surface is entirely unchanged;
    // this sits a fraction of a millimeter above it purely so the two don't z-fight.
    function addLaneFloorTint(scene, name, mat, width, depth, x, z, rotationY) {
        const strip = BABYLON.MeshBuilder.CreateBox(name, { width, height: 0.001, depth }, scene);
        strip.position.set(x, 0.0012, z);
        if (rotationY) strip.rotation.y = rotationY;
        strip.material = mat;
        return strip;
    }

    // ===================================
    // Playfield inserts (lane/shot indicator lamps)
    // ===================================
    // Every rollover lamp on this board - inlane, outlane, orbit entrance/completion, skill-shot
    // lanes, kickback, ball save - was the same thing: one flat cylinder of height 0.003 floating
    // at y=0.011. That is 11mm above a playfield whose surface is y=0, i.e. most of a ball radius
    // (BALL_DIAMETER_M/2 = 0.0135) up in the air, so they read as glowing pucks resting ON the
    // table rather than lamps set INTO it - and a ball rolling over one passed straight through it,
    // since none of these have (or should have) a collider.
    //
    // These two heights put the lens just proud of the lane floor tints (which top out at 0.0017,
    // see addLaneFloorTint above) instead. The lens top lands at 0.0036 - about an eighth of a ball
    // diameter, down from nearly a half - so the insert now sits in the playfield surface, and what
    // little of it a ball overlaps is underneath the ball where no camera angle can see it.
    const INSERT_COLLAR_Y_M = 0.0024, INSERT_COLLAR_H_M = 0.0012;
    const INSERT_LENS_Y_M = 0.00285, INSERT_LENS_H_M = 0.0015;

    // One insert = a dark plastic collar with a chamfered lens sitting in it. The collar is the
    // other half of the anti-glow work (the lens texture is the first, see
    // createInsertLensTexture): an unlit ring of genuinely dark plastic around the lens gives the
    // bloom a hard outer boundary and gives the "off" state something to be, instead of the lamp
    // simply being a dimmer version of itself.
    //
    // Returns the LENS, because that is the mesh the lamp system registers - registerLamp() reads
    // mesh.material, so the returned mesh must be the one carrying lampMat. Neither mesh ever gets
    // a collider; the lane's real trigger volume is built separately and is untouched by this.
    function addPlayfieldInsert(scene, name, lampMat, collarMat, diameter, x, z) {
        const collar = BABYLON.MeshBuilder.CreateCylinder(name + 'Collar', {
            diameter: diameter * 1.45,
            height: INSERT_COLLAR_H_M,
            tessellation: 20
        }, scene);
        collar.position.set(x, INSERT_COLLAR_Y_M, z);
        collar.material = collarMat;

        // diameterTop < diameterBottom gives the lens a chamfered edge, which is both what a
        // moulded insert actually looks like and a surface angled to catch the playfield lights -
        // a highlight that a perfectly flat disc could never pick up.
        const lens = BABYLON.MeshBuilder.CreateCylinder(name, {
            diameterTop: diameter * 0.84,
            diameterBottom: diameter,
            height: INSERT_LENS_H_M,
            tessellation: 20
        }, scene);
        lens.position.set(x, INSERT_LENS_Y_M, z);
        lens.material = lampMat;
        return lens;
    }

    // The unlit look, applied to every insert lamp material. Two things change from what these
    // materials used to be:
    //
    // albedoColor was <identity colour> * 0.3 - a saturated dark tint, so an "off" insert was
    // still an obviously coloured disc. A real unlit insert is near-black plastic that only hints
    // at its colour; that is what this mixes, and it is what makes lit vs. unlit read as ON vs.
    // OFF rather than bright vs. less bright.
    //
    // metallic 0.2 -> 0.04 and roughness 0.4 -> 0.55, because these are plastic lenses, not
    // painted metal discs. The old values gave them a metal sheen that fought the backlit read.
    //
    // emissiveColor is deliberately NOT touched here - it belongs to the lamp system and nothing
    // else may write it (see createLampSystem()). The texture assigned here is multiplied by
    // whatever state that system has the lamp in, so off/dim/lit/blink behave exactly as before.
    // Insert-legibility pass (user-requested - "keep lamp states functional and obvious when
    // lit/unlit"). The albedo floor comes DOWN again, from (0.042,0.042,0.05)+colour*0.09, and the
    // reason is measured rather than aesthetic. Rendering the inserts in isolation (only the
    // insert meshes, glow layer off, so nothing else contributes) and then zeroing emissiveColor
    // showed that 89-94% of an UNLIT insert's brightness was albedo response to the scene lights -
    // a constant the lamp system cannot touch. That floor is what was flattening the on/off read:
    // driving a lamp its full dim->lit range (0.12 -> 0.9, a 7.5x change in emitted light) moved
    // the rendered insert only 1.25-1.41x, because most of what was on screen was never the lamp.
    //
    // Cutting the floor to roughly a sixth puts the emissive swing back in charge without making
    // an unlit insert invisible - it still reads as a dark lens with a hint of its family colour,
    // which is what unlit moulded plastic looks like. Measured over an albedo sweep, the dim->lit
    // ratio goes 1.41x (old floor) -> 1.62x -> 1.75x here, against a hard ceiling of 2.01x at
    // albedo zero; the last stop was rejected because a pure-black unlit lens loses the family's
    // colour identity entirely, which costs more than the remaining 0.26x buys.
    //
    // Roughness was swept alongside and deliberately left alone: 0.55 vs 0.95 moved the ratio by
    // 0.01x, so the residual floor is not a specular lobe and raising roughness would only flatten
    // the lens for nothing. qa/lane-inserts.js measures the ratio on every run, so a future edit
    // that quietly re-raises this floor fails loudly instead of silently costing the board its
    // state signal.
    function styleInsertLampMat(mat, color, lensTexture) {
        mat.albedoColor = new BABYLON.Color3(0.008, 0.008, 0.010).add(color.scale(0.016));
        mat.metallic = 0.04;
        mat.roughness = 0.55;
        mat.emissiveTexture = lensTexture;
    }

    // Obstacle visual-polish pass (user-requested - "readable height differences... make the
    // table read like a designed pinball machine"): a round counterpart to addLaneFloorTint()
    // above, for the board's floating spherical features (Saturn, comet) rather than a lane
    // corridor - a thin backlit-insert disc laid on the playfield directly beneath the sphere,
    // giving it a visible "landing pad" grounding presence instead of just floating over bare
    // playfield the way a primitive-only sphere does. Same paper-thin/no-physics/no-z-fight
    // treatment as addLaneFloorTint(), just circular.
    function addFeatureFloorGlow(scene, name, mat, diameter, x, z) {
        const glow = BABYLON.MeshBuilder.CreateCylinder(name, { diameter, height: 0.002, tessellation: 24 }, scene);
        glow.position.set(x, 0.002, z);
        glow.material = mat;
        return glow;
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

        // Shared bevel-cap material for addRailBevel() above - a touch glossier than housingMat
        // and lifted by a faint cool cyan glint, so every guide rail's raised cap reads as one
        // consistent polished-trim language across the whole board (dividers, inlane guides,
        // orbit rails, reentry-lane flanking rails), independent of whichever lane-specific lamp
        // color happens to be nearby. One instance, reused by every addRailBevel() call below.
        const railCapMat = new BABYLON.PBRMaterial('railCapMat', scene);
        railCapMat.albedoColor = new BABYLON.Color3(0.18, 0.19, 0.22);
        railCapMat.metallic = 0.85;
        railCapMat.roughness = 0.22;
        // Lighting/material hierarchy pass (user-requested - "RAILS/STRUCTURE: metallic or
        // physical-material definition"): this one material is reused by EVERY guide-rail bevel
        // cap on the entire board (dividers, inlane guides, orbit rails, reentry-lane rails,
        // target-bank header) - dozens of small instances all sharing one emissive value, so its
        // brightness has an outsized cumulative effect on how "glowy vs. structural" the whole
        // table reads. Cut to a quarter of its old value (was a fairly noticeable cyan glint) so
        // its "polished trim" read comes from the already-glossy metallic/roughness (0.85/0.22)
        // catching direct light, the same way real machined trim does, rather than from the trim
        // itself glowing.
        railCapMat.emissiveColor = new BABYLON.Color3(0.02, 0.05, 0.065);

        // Shared dark-plastic collar for every playfield insert (see addPlayfieldInsert above).
        // Deliberately NOT housingMat: that one is dark METAL (metallic 0.8) and every insert
        // collar rendered in it would pick up a chrome sheen, which is the opposite of the matte
        // routed-plastic edge that makes a lit lens read as lit. One instance, all 13 inserts.
        const insertCollarMat = new BABYLON.PBRMaterial('insertCollarMat', scene);
        insertCollarMat.albedoColor = new BABYLON.Color3(0.045, 0.045, 0.055);
        insertCollarMat.metallic = 0.12;
        insertCollarMat.roughness = 0.62;

        // Three lens faces, shared by every insert that wants each - not one texture per lamp.
        // 13 inserts x a 128px DynamicTexture would be ~830KB of GPU memory to say three things;
        // sharing costs 3 textures and nothing else, because the only per-lamp state (colour,
        // brightness) lives in each material's own emissiveColor, never in the texture.
        const insertLensTextures = {
            down: createInsertLensTexture(scene, 'ArrowDown', 'down'),
            up: createInsertLensTexture(scene, 'ArrowUp', 'up'),
            ring: createInsertLensTexture(scene, 'Ring', null),
            // One per lane FAMILY - see createInsertLensTexture()'s comment for why each family
            // needs its own silhouette rather than its own colour. Still shared across both
            // mirrored sides of a family, which is the sharing that actually mattered for memory.
            flow: createInsertLensTexture(scene, 'Flow', 'flow'),
            void: createInsertLensTexture(scene, 'Void', 'void'),
            cycle: createInsertLensTexture(scene, 'Cycle', 'cycle'),
            ground: createInsertLensTexture(scene, 'Ground', 'ground')
        };

        // Shared floor-tint materials for addLaneFloorTint() above - one per lane family (inlane,
        // outlane, orbit), each reused by both mirrored sides, matching the lamp identities those
        // lanes already use elsewhere (COLOR_LANE_LAMP/COLOR_OUTLANE_LAMP/COLOR_ORBIT_LAMP) so the
        // floor tint, the lamp, and (for inlane/outlane) the dev debug overlay all agree on what
        // color means what. disableLighting + emissive-only (no albedo term) so the tint reads as
        // a consistent backlit-insert glow rather than shifting with scene light like an ordinary
        // painted surface would - the same unlit-emissive treatment this file's signage (labels,
        // backglass) already uses, applied here to a floor film instead of a plane.
        function makeLaneFloorMat(name, color, alpha) {
            const mat = new BABYLON.PBRMaterial(name, scene);
            mat.albedoColor = new BABYLON.Color3(0, 0, 0);
            mat.disableLighting = true;
            // Insert-polish pass (user-requested - "reduce oversized generic glow, favour crisp
            // illuminated surfaces"): these strips are the largest emissive areas anywhere near
            // the lanes - the outlane's is 55mm x 58mm, the orbit's runs most of the rail - and at
            // 0.55 the scene GlowLayer turned each of them into a soft coloured slab that drowned
            // the small, precise insert lenses sitting on top of them. 0.24 keeps the lane's
            // colour identity as a floor TINT, which is all it was ever meant to be, and hands the
            // "this is a light" job back to the inserts. Their alpha and geometry are unchanged.
            // 0.24 -> 0.14 (hierarchy pass). Measured from the gameplay camera these strips
            // were at p90 130 across 23,887 pixels - above the perimeter walls (124), above the
            // slingshots (123) and the flippers (119), and above an unlit lane insert (93). Floor
            // tint is tier-5 playfield art; it cannot outrank the hardware standing on it.
            mat.emissiveColor = color.scale(0.14);
            mat.alpha = alpha;
            mat.backFaceCulling = false;
            return mat;
        }
        const inlaneFloorMat = makeLaneFloorMat('inlaneFloorMat', COLOR_LANE_LAMP, 0.16);
        const outlaneFloorMat = makeLaneFloorMat('outlaneFloorMat', COLOR_OUTLANE_LAMP, 0.16);
        const orbitFloorMat = makeLaneFloorMat('orbitFloorMat', COLOR_ORBIT_LAMP, 0.14);
        // The mission bank's approach lane. The three plates each carry their own chakra colour,
        // so tinting the approach in any one of them would read as "this lane belongs to target N";
        // COLOR_CHAKRA[1] is the bank's own callout colour (see the TARGETS label), which makes the
        // strip read as the bank's lane rather than any single plate's.
        const targetFloorMat = makeLaneFloorMat('targetFloorMat', COLOR_CHAKRA[1], 0.14);
        // Saturn's approach lane, in Saturn's own gold rather than a lane colour, so the corridor
        // reads as belonging to the planet at the end of it.
        const saturnApproachMat = makeLaneFloorMat('saturnApproachMat', COLOR_SATURN, 0.14);
        // The comet's lane, in the comet's own icy cyan so the two centre corridors read as
        // belonging to different shots rather than as one wide bright area.
        const cometApproachMat = makeLaneFloorMat('cometApproachMat', COLOR_COMET, 0.14);
        const visionGateApproachMat = makeLaneFloorMat('visionGateApproachMat', COLOR_VISION_GATE, 0.14);

        // 4 distinct colors (CONFIG.colors.bumper1-4), matching the 2D game's per-bumper
        // identity, not one shared color - each bumper is its own emissive-glass PBR material so
        // it can be individually recolored/pulsed on hit (pulseMesh() in main()).
        // Perceptual-luminance balance for the bumper palette (visual-hierarchy pass). Returns 1
        // for any colour already at or below the ceiling, so it only ever darkens - never brightens
        // a colour past what its material scale asked for. 0.42 is the ceiling that puts the yellow
        // bumper level with its neighbours without dulling the dim ones; it is a luminance, in the
        // same 0-1 space as the Color3 channels it is computed from.
        const BUMPER_LUM_CEILING = 0.42;
        const bumperLumBalance = (color) => {
            const lum = 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;
            return lum > BUMPER_LUM_CEILING ? BUMPER_LUM_CEILING / lum : 1;
        };

        const bumperMats = COLOR_BUMPERS.map((color, i) => {
            const mat = new BABYLON.PBRMaterial('bumperMat' + i, scene);
            // Albedo, not just emissive, and that distinction is the finding. HEX_BUMPERS is a
            // fully-saturated palette, so a bumper dome clipped to 255 under the scene's three
            // direct lights before its emissive was added at all - cutting only the glow moved the
            // cluster's p90 by two units out of 255.
            //
            // The per-colour balance is the other half, and it fixes a latent problem rather than
            // just trimming one: these four colours are nowhere near equally bright. Measured from
            // the gameplay camera at an identical material scale, the yellow bumper sat at a median
            // of 242 while the magenta one sat at 101 - because perceptual luminance weights green
            // at 0.72 and blue at 0.07, so 0xffff00 carries 0.93 of full luminance and 0xff00ff
            // only 0.28. One flat multiplier can only ever be right for one of them. bumperLumBalance()
            // pulls each colour down to a shared luminance ceiling and leaves the already-dim ones
            // alone, so the cluster reads as one tier instead of one blazing bumper and three quiet
            // ones - and nothing in it clips.
            mat.albedoColor = color.scale(0.75 * bumperLumBalance(color));
            mat.metallic = 0.2;
            mat.roughness = 0.3;
            mat.alpha = 0.88; // "glass-or-crystal-like... moderate transparency" per the doc
            // 0.6 -> 0.42, same hierarchy pass as the lamp rings above and for the same measured
            // reason: the bumper domes were clipping to 255 from the gameplay camera.
            mat.emissiveColor = color.scale(0.40 * bumperLumBalance(color));
            return mat;
        });

        // Premium pop-bumper cap material (visual-upgrade pass, user-requested - "resemble
        // premium 3D pinball pop bumpers"): a single glossy off-white plastic material shared by
        // every bumper's cap, same instance reused across all 4 - real machines mold every pop
        // bumper's cap from the same plastic regardless of that bumper's own color identity, so
        // sharing it here (rather than tinting the cap per-bumper) is both cheaper and more
        // faithful to the reference silhouette. Never mutated by pulseMesh() (see its own comment
        // on why hit-flash is scale-only for extra meshes) - flashing this shared instance would
        // bleed into every other bumper's cap at once.
        const bumperCapMat = new BABYLON.PBRMaterial('bumperCapMat', scene);
        // 0.88 -> 0.66 (hierarchy pass): measured, the caps were the single brightest surface in
        // the frame after the ball, clipping to 255 across their whole visible face. Still clearly
        // the pale plastic of the fixture, just no longer competing with the ball.
        bumperCapMat.albedoColor = new BABYLON.Color3(0.54, 0.54, 0.58);
        // Plastic, deliberately: near-zero metallic and a tighter roughness than the machined
        // metal of the housing below it (bumperBaseMat, 0.95/0.3). That gap is the whole point -
        // a real pop bumper is a moulded plastic cap sitting in a metal fixture, and giving the
        // two the same shading is what made the old fixture read as one undifferentiated blob.
        bumperCapMat.metallic = 0.04;
        bumperCapMat.roughness = 0.12;
        bumperCapMat.emissiveColor = new BABYLON.Color3(0.06, 0.06, 0.08);
        // Procedural moulded-cap face, so the UNSKINNED cap is attractive on its own rather than a
        // blank dome: concentric turned rings plus faint radial spokes, the moulding marks a real
        // cap carries. One 128px DynamicTexture shared by all four caps (same shared-instance
        // design as the material itself), built once at load - no per-frame cost.
        bumperCapMat.albedoTexture = createBumperCapTexture(scene);
        // Bumper cap skin slot (visual-architecture pass, user-requested) - one shared texture
        // for all 4 caps, matching this material's own existing shared-instance design above.
        // No-op until assets/skins/bumpers/bumper-cap.png actually exists (see SKINS.md); the
        // glossy off-white plastic look stays the fallback either way.
        //
        // The slot carries an albedoScale (see js/skins.js) specifically so a load here cannot
        // undo the 0.54/0.58 albedo two lines above. That value is not a default - it is the
        // hierarchy pass' measured answer to the caps clipping at 255 - and applySkinTexture()'s
        // plain white reset would discard it, putting artwork on screen ~1.85x brighter than the
        // fallback it replaced.
        //
        // Everything that makes a bumper a bumper is untouched by this call by construction: the
        // collider and kick live on the parent body mesh (this cap mesh has no physics body at
        // all), scoring and cooldown live in the hit handler, and pulseBumperLamp() deliberately
        // flashes only bodyMat/lampMat - never this shared instance, which would light all four
        // caps at once. A skin can change what the cap looks like and nothing else.
        applySkinTexture(scene, bumperCapMat, SKIN_MANIFEST.bumperCap);

        // Machined-metal fixture, distinct from the shared obstacleHousingMat every other rail and
        // post uses (0.8 metallic / 0.35 rough). Pushing this harder and smoother is what creates
        // the metal-against-plastic contrast with bumperCapMat above; sharing housingMat is what
        // previously made the bumper base read as just another dark rail offcut. One instance for
        // all four fixtures.
        const bumperBaseMat = new BABYLON.PBRMaterial('bumperBaseMat', scene);
        bumperBaseMat.albedoColor = new BABYLON.Color3(0.16, 0.16, 0.20);
        bumperBaseMat.metallic = 0.95;
        bumperBaseMat.roughness = 0.30;

        // Boss-only anodised trim. The boss bumper was previously distinguishable ONLY by being
        // 1.5x bigger, which reads as "nearer the camera" rather than "more important" - this warm
        // gold band is the same trick real machines use to mark their jackpot bumper, and it reads
        // instantly at a glance because nothing else on the board is this colour.
        const bumperTrimMat = new BABYLON.PBRMaterial('bumperTrimMat', scene);
        // Hierarchy pass: a 0.92 gold on a 0.9-metallic band measured p90 249 - the fourth
        // brightest surface on the board, brighter than every tier-2 insert, for a 423-pixel
        // decorative band. Albedo is the lever here; a mid-pass attempt to soften the specular by
        // RAISING roughness to 0.34 was measured to make it worse (p90 230 -> 239, a broader hot
        // streak rather than a tighter one), so roughness stays where it was.
        bumperTrimMat.albedoColor = new BABYLON.Color3(0.30, 0.23, 0.08);
        bumperTrimMat.metallic = 0.9;
        bumperTrimMat.roughness = 0.22;
        bumperTrimMat.emissiveColor = new BABYLON.Color3(0.22, 0.15, 0.03); // cut alongside the albedo above, same pass

        // The lamp ring, one per bumper so it can flash with its own body on a hit. Brighter and
        // markedly more translucent than the body it rings (alpha 0.55 vs 0.88, emissive 1.15x vs
        // 0.6x), because the old ring shared the body's material outright and simply vanished into
        // the dome's own glow - a lit ring has to out-glow what it sits on to read as a lamp at all.
        const bumperLampMats = COLOR_BUMPERS.map((color, i) => {
            const mat = new BABYLON.PBRMaterial('bumperLampMat' + i, scene);
            mat.albedoColor = color.scale(0.85 * bumperLumBalance(color)); // same saturated-palette clipping and the same per-colour balance as the domes - see bumperMats above
            mat.metallic = 0.0;
            mat.roughness = 0.45;
            mat.alpha = 0.55;
            // Visual-hierarchy pass (user-requested). 1.15 made this the brightest material
            // anywhere on the board - above the BALL's own 0.7 - and it showed: measured from the
            // gameplay camera the bumper cluster sat at p90 246 across 14,363 pixels against a
            // ball at 253 across 553. A tier-3 feature was tying the one object the player has to
            // track, over twenty-six times the screen area. 0.62 puts the cluster clearly below
            // the ball and below the tier-2 targets while still reading as a lit ring.
            // pulseBumperLamp()'s x2.1 hit flash is untouched and still peaks at 1.30, so a struck
            // bumper is if anything MORE distinct now that its resting state is not already there.
            mat.emissiveColor = color.scale(0.62 * bumperLumBalance(color));
            return mat;
        });

        // Pop-bumper silhouette (visual-upgrade pass, user-requested): the collider stays the
        // exact same sphere it always was (shape, size, position, physics aggregate, and the
        // 'bumper'/boss metadata this file's scoring/kick/cooldown logic keys off of, all
        // unchanged) - it also still IS the visible "raised bumper body" layer, doubling as both
        // collider and dome. Everything else here is new, purely decorative dressing with no
        // physics body of its own, layered around that unchanged sphere: a wide "base" skirt, a
        // tapered "riser" neck connecting the base up to the body, the pre-existing glowing
        // "collar" ring (now reparented, unchanged otherwise), a small flattened-sphere "cap"
        // sitting on the body's peak, and a decorative color-matched "insert" glyph on the cap's
        // face (built via createLabelPlane() - the same DynamicTexture-based emissiveTexture
        // technique the lane markers use, so a future skin pass can swap in a real image texture
        // by editing exactly one texture assignment, not this geometry). All new meshes are
        // parented under one TransformNode per bumper purely for organizational/hierarchy
        // purposes - reparenting purely decorative, physics-free meshes doesn't affect the
        // collider sphere above, which is never parented and never touched after creation. Low
        // tessellation throughout (12-20 segments), matching this file's existing "cheap
        // primitives, not high-poly meshes" budget for every other obstacle.
        //
        // Board redesign: index 0 (closest to the new giant Saturn centerpiece, at the top of the
        // cluster) is a "boss" bumper - 50% bigger radius and worth notably more (SCORE_BOSS_
        // BUMPER vs SCORE_ATTACK_BUMPER, see handlePhysicalHit()) - so the cluster reads as having
        // real internal variety instead of 4 identical clones in different colors. Every
        // dimension below is derived from that same per-bumper radius, so the boss bumper's whole
        // fixture (base/riser/cap/insert, not just the body) scales up together with it.
        BUMPER_CLUSTER.forEach((pos, i) => {
            const isBoss = i === 0;
            const radius = isBoss ? BUMPER_RADIUS_M * 1.5 : BUMPER_RADIUS_M;
            const colorMat = bumperMats[i % bumperMats.length];

            const mesh = BABYLON.MeshBuilder.CreateSphere('bumper' + i, { diameter: radius * 2 }, scene);
            mesh.position.set(pos.x, radius, pos.z);
            mesh.material = colorMat;
            // Physical body, not a trigger - restitution alone gives the bounce; the ball's
            // collision observable (see main()) reports the hit for scoring on top of that.
            new BABYLON.PhysicsAggregate(mesh, BABYLON.PhysicsShapeType.SPHERE, { mass: 0, restitution: 0.85, friction: 0.3 }, scene);

            const rig = new BABYLON.TransformNode('bumper' + i + 'Rig', scene);
            rig.position.set(pos.x, 0, pos.z);

            // One moulded fixture, lathed from a real profile, replacing the two stacked
            // cylinders that used to stand in for it. The profile carries a skirt, a chamfer, a
            // step ledge for the lamp ring to sit on, and a tapered neck - the dimensional
            // shoulders a cast pop-bumper body actually has, and the reason it now catches light
            // at several distinct angles instead of reading as one flat disc. This is FEWER meshes
            // than before (one lathe instead of base + riser), so the upgrade costs less to draw
            // than what it replaces; tessellation stays at 16, in this file's cheap-primitives
            // budget. Profile radii are multiples of this bumper's own radius, so the boss's whole
            // fixture scales with it exactly as before.
            // NOTE these are RADII, not diameters. The cylinders this replaced were specified as
            // diameters (diameterBottom: radius * 2.9), so the equivalent profile radius is half
            // that - 1.45. Reading those numbers across directly builds a fixture twice as wide as
            // the one it replaces, which swallows the playfield.
            const profile = [
                [1.47, 0.00], [1.47, 0.10], [1.31, 0.22], [1.32, 0.32],
                [1.13, 0.42], [1.10, 0.56], [0.86, 0.74], [0.75, 0.88],
                [0.59, 0.95], [0.43, 0.99]
            ].map(([rx, ry]) => new BABYLON.Vector3(radius * rx, radius * ry, 0));
            // closed:false - 'closed' joins the profile's last point back to its first, which here
            // would sweep a solid diagonal skirt from the neck back down to the outer rim. The
            // open top is covered by the dome (the profile ends well inside it) and the open
            // bottom sits on the playfield.
            const base = BABYLON.MeshBuilder.CreateLathe('bumper' + i + 'Base', {
                shape: profile,
                tessellation: 16,
                closed: false
            }, scene);
            base.parent = rig;
            base.material = bumperBaseMat;

            // Lamp ring, seated on the profile's step ledge rather than floating on the dome.
            const collar = BABYLON.MeshBuilder.CreateTorus('bumper' + i + 'Collar', {
                diameter: radius * 2.5,
                thickness: radius * 0.17,
                tessellation: 18
            }, scene);
            collar.parent = rig;
            collar.position.y = radius * 0.50;
            collar.material = bumperLampMats[i % bumperLampMats.length];

            // Boss only: one extra gold band low on the skirt. A single 14-segment torus on one
            // bumper - the cheapest possible way to say "this one is different" without touching
            // its collider, radius, kick or score.
            if (isBoss) {
                const trim = BABYLON.MeshBuilder.CreateTorus('bumper' + i + 'Trim', {
                    diameter: radius * 2.92,
                    thickness: radius * 0.11,
                    tessellation: 14
                }, scene);
                trim.parent = rig;
                trim.position.y = radius * 0.16;
                trim.material = bumperTrimMat;
            }

            // Flattened sphere, not a hemisphere primitive - simpler geometry, and sinking its
            // equator slightly below the body's own peak hides the seam between the two so the
            // cap reads as continuous with the dome beneath it rather than a disc stuck on top.
            const cap = BABYLON.MeshBuilder.CreateSphere('bumper' + i + 'Cap', { diameter: radius * 1.34, segments: 12 }, scene);
            cap.scaling.y = 0.58;
            cap.parent = rig;
            cap.position.y = radius * 1.85;
            cap.material = bumperCapMat;

            // Decorative insert/icon: a single glyph tinted to this bumper's own color, reusing
            // createLabelPlane()'s DynamicTexture/emissiveTexture pattern instead of a bespoke
            // one - see this block's own comment for why that keeps a future textured-skin pass
            // to a one-line change. The boss gets its own glyph, a second cue that costs nothing.
            const insert = createLabelPlane(scene, isBoss ? '\u2605' : '\u25c9', pos.x, pos.z, cssColor(HEX_BUMPERS[i % HEX_BUMPERS.length]), { transparent: true, fontSize: isBoss ? 34 : 30, planeSize: radius * 1.5 });
            insert.position.y = radius * 2.05;
            // Hierarchy pass: pure decoration on a tier-3 fixture, so it is stepped down with the
            // rest of the bumper. Deliberately not quoting a measured number for this one - the
            // glyph plane is mostly transparent, so what a per-object luminance pass reads inside
            // its silhouette is mostly the bumper cap behind it, not the glyph. Texture level
            // rather than a redraw, because createLabelPlane() is shared with the shot LABELS
            // (L ORBIT, SKILL SHOT, TARGETS), which are gameplay information and keep theirs.
            if (insert.material && insert.material.emissiveTexture) insert.material.emissiveTexture.level = 0.4;

            // bodyMat/lampMat are carried so the hit reaction can flash exactly these two
            // per-bumper materials and nothing else - notably NOT the shared cap material,
            // which would bleed one bumper's flash onto all four at once.
            mesh.metadata = { kind: 'bumper', boss: isBoss, capMesh: cap, insertMesh: insert,
                              bodyMat: colorMat, lampMat: bumperLampMats[i % bumperLampMats.length] };
        });

        // CONFIG.colors.chakra (7 colors) - each mission target gets its own chakra color
        // (targets 0-2 use chakra[0-2]: violet, pink, yellow) instead of one shared color.
        const targetMats = COLOR_CHAKRA.map((color, i) => {
            const mat = new BABYLON.PBRMaterial('targetMat' + i, scene);
            // White, NOT the chakra colour, because createTargetFaceTexture() below bakes that
            // colour into the albedo texture. albedoTexture is multiplied by albedoColor, so
            // leaving the tint here as well would square it and turn every plate near-black. This
            // also matches what applySkinTexture() itself does when real artwork loads (it resets
            // albedoColor to white for exactly the same reason), so the procedural and skinned
            // paths now agree instead of one of them being a special case.
            mat.albedoColor = new BABYLON.Color3(1, 1, 1);
            mat.albedoTexture = createTargetFaceTexture(scene, color, i + 1);
            mat.metallic = 0.15;
            mat.roughness = 0.25;
            mat.alpha = 0.85;
            // The plate's "lit from behind" glow. Flat (no emissive texture) on purpose - see
            // createTargetFaceTexture()'s own comment for why that's what keeps a skin clean.
            //
            // Cut from 0.55 because that was measured (screenshot, gameplay camera) to clip the
            // plate to a flat saturated block: a uniform 0.55 added to an already-saturated chakra
            // colour pushes both live channels past 1 before the scene's GlowLayer even blooms it,
            // so every bit of albedo variation - border, number, gradient - was crushed out. 0.30
            // leaves headroom for the face texture to actually show while keeping the plate
            // clearly self-lit, which is the point of an illuminated drop target. The lamp
            // material below is unchanged and still carries the bank's bright/locked state.
            mat.emissiveColor = color.scale(0.30);
            return mat;
        });

        // The bank's own local frame. Every plate and every piece of its fixture is placed and
        // rotated in THIS frame rather than in world axes, so the whole bank re-aims by editing
        // MISSION_TARGET_BANK's three positions and nothing else can fall out of alignment with
        // anything else. Derived from the bank's endpoints with the same atan2(-dz, dx) rail
        // convention the header rail below already used (see inlaneGuide's comment for where that
        // formula comes from), verified against this Babylon build rather than assumed:
        //   local +X -> ( dx, dz)/len   along the bank, index 0 -> index 2
        //   local +Z -> (-dz, dx)/len   out of the bank's BACK (up-table), which is the side the
        //                               slot wall, posts and header rail have always sat on
        // so local -Z is the plate's face, and with the bank rising to the right it points
        // down-table and slightly right - into the measured right-flipper approach.
        const bankFirst = MISSION_TARGET_BANK[0];
        const bankLast = MISSION_TARGET_BANK[MISSION_TARGET_BANK.length - 1];
        const bankDX = bankLast.x - bankFirst.x;
        const bankDZ = bankLast.z - bankFirst.z;
        const bankSpan = Math.hypot(bankDX, bankDZ);
        const bankRotationY = Math.atan2(-bankDZ, bankDX);
        const bankCos = Math.cos(bankRotationY);
        const bankSin = Math.sin(bankRotationY);
        // (u along the bank, v out of its face) -> world x / z, about `pos`.
        const bankX = (pos, u, v) => pos.x + u * bankCos + v * bankSin;
        const bankZ = (pos, u, v) => pos.z - u * bankSin + v * bankCos;

        const missionTargetMeshes = [];
        const missionTargetLamps = [];
        MISSION_TARGET_BANK.forEach((pos, i) => {
            const mesh = BABYLON.MeshBuilder.CreateBox('missionTarget' + i, {
                width: TARGET_RADIUS_M * 2,
                height: 0.03,
                depth: 0.008
            }, scene);
            mesh.position.set(pos.x, TARGET_RAISED_Y_M, pos.z);
            // Square to the bank line, so all three faces present themselves to the same shot.
            // The drop animation only ever touches position.y, so rotating here cannot affect it -
            // and the trigger aggregate created below inherits this rotation, which is what keeps
            // the detection volume flush with the face a player is aiming at.
            mesh.rotation.y = bankRotationY;
            mesh.material = targetMats[i % targetMats.length];
            // Mission target face skin slot (visual-architecture pass, user-requested) - per-
            // target-index, matching this flag's own already-per-index material above. No-op
            // until assets/skins/targets/mission-target-<i>.png actually exists (see SKINS.md);
            // this flag's existing chakra-color material stays the fallback either way. Sharing
            // one material instance across multiple indices (targetMats wraps at 7 entries, this
            // bank only has 3) would mean two targets fighting over the same texture slot if
            // that ever happened - guarded for by only ever touching THIS target's own material
            // instance, never a shared one, same as the rest of this loop already assumes.
            //
            // Ordering matters and is deliberate: the procedural face texture is assigned to the
            // material ABOVE, so this call cleanly replaces it when a skin exists rather than
            // racing it. Nothing in this decorative block touches the box's dimensions or the
            // aggregate below, so custom art can never alter the physics.
            //
            // Nor can it alter the DROP. updateDropTargetBank() lerps this mesh's position.y
            // between TARGET_RAISED_Y_M and TARGET_DROPPED_Y_M and reads nothing from the
            // material; the trigger aggregate below deliberately stays put while the flag sinks.
            // qa/skin-mission-targets.js stages a real hit and asserts both halves - the flag
            // reaches the dropped position and the trigger's transform does not move - identically
            // with and without artwork loaded.
            //
            // No albedoScale on these slots, unlike cabinetRails/bumperCap: albedoColor is already
            // white here (the chakra colour lives in the texture, not the tint - see targetMats
            // above), so applySkinTexture()'s white reset is a no-op and there is no existing
            // tuning for a ceiling to protect. What artwork DOES inherit is this material's flat
            // chakra emissiveColor, by design - see js/skins.js for the per-index values an artist
            // needs to design around, and createTargetFaceTexture() for why the procedural face
            // carries no emissive texture of its own.
            applySkinTexture(scene, mesh.material, SKIN_MANIFEST.missionTargetFace[i]);
            mesh.metadata = { kind: 'missionTarget', index: i };
            const aggregate = new BABYLON.PhysicsAggregate(mesh, BABYLON.PhysicsShapeType.BOX, { mass: 0, restitution: 0.4, friction: 0.5 }, scene);
            // Trigger, not physical - detect-only per the doc (mission targets don't block the
            // ball in the 2D game either; they're an overlap, not a collider, in setupCollisions()).
            // Deliberately never moved when the target drops (see updateDropTargetBank() in
            // main()) - only the visual mesh above sinks. The trigger volume staying put is what
            // lets handleTriggerHit() treat dropTargetBank[i].dropped as the sole scoring gate,
            // fully decoupled from wherever the flag mesh currently is mid-animation.
            aggregate.shape.isTrigger = true;

            // --- Drop-target fixture (visual-only). ---------------------------------------
            // What a real drop target actually is: a plate that slides in a slot between two
            // posts, with a lamp behind it. The previous look was two flat panels stacked behind
            // the plate, which gave a border but no depth and - more importantly - nothing to see
            // once the plate dropped, so raised vs. dropped read as "flag present / flag gone".
            //
            // Everything below is unparented and static on purpose. The drop animation only moves
            // the face mesh's position.y (updateDropTargetBank() in main()), so leaving the
            // hardware behind is both correct - a real target's mounting bracket doesn't sink with
            // the plate - and what creates the dropped-state read: the lit slot behind the plate
            // is revealed. That means zero changes to the animation, the collider, or the scoring.
            //
            // Mesh budget, measured in-scene rather than estimated: the 2 flat panels per target
            // become 5 (slot wall, 2 posts, front lip, backlight), all untextured 12-triangle
            // boxes on materials that already existed. Whole-scene cost of this pass: 200 -> 209
            // meshes, 78512 -> 78620 triangles (+0.14%), 102 -> 102 materials, 57 -> 57 physics
            // bodies.

            // Slot back wall - the dark recess the plate slides into. Sits behind the plate's own
            // back face (z +0.008 vs. the plate's +0.004), never intersecting it.
            const backPanel = BABYLON.MeshBuilder.CreateBox('missionTarget' + i + 'Housing', {
                width: TARGET_RADIUS_M * 3.1,
                height: 0.034,
                depth: 0.003
            }, scene);
            backPanel.position.set(bankX(pos, 0, 0.0095), 0.017, bankZ(pos, 0, 0.0095));
            backPanel.rotation.y = bankRotationY;
            backPanel.material = housingMat;

            // The two guide posts the plate runs between. Deep enough (0.020) to span from just in
            // front of the plate back to the slot wall, so they read as a real channel rather than
            // trim stuck on the front - that depth is what makes the fixture look moulded. Their
            // inner faces land exactly on the plate's edges (x +/-0.014 = TARGET_RADIUS_M) so they
            // frame it without ever clipping through it. railCapMat is the same polished-trim
            // material every guide rail's bevel cap uses, keeping the bank in the board's existing
            // hardware language instead of introducing a one-off metal.
            [-1, 1].forEach((side) => {
                const post = BABYLON.MeshBuilder.CreateBox('missionTarget' + i + 'Post' + (side < 0 ? 'L' : 'R'), {
                    width: 0.006,
                    height: 0.032,
                    depth: 0.020
                }, scene);
                post.position.set(bankX(pos, side * 0.017, 0.001), 0.016, bankZ(pos, side * 0.017, 0.001));
                post.rotation.y = bankRotationY;
                post.material = railCapMat;
            });

            // Front lip at the mouth of the slot. Low enough to only overlap the plate's bottom
            // few millimetres, so a raised plate looks like it emerges from the fixture - and once
            // the plate drops, this is the edge that keeps the empty slot reading as a slot rather
            // than a hole in the playfield.
            const lip = BABYLON.MeshBuilder.CreateBox('missionTarget' + i + 'Lip', {
                width: 0.040,
                height: 0.0035,
                depth: 0.005
            }, scene);
            lip.position.set(bankX(pos, 0, -0.0070), 0.00175, bankZ(pos, 0, -0.0070));
            lip.rotation.y = bankRotationY;
            lip.material = railCapMat;

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

            // Backlight panel inside the slot, deliberately sized just UNDER the plate (0.026 wide
            // x 0.028 tall vs. the plate's 0.028 x 0.030) so a raised plate hides it completely
            // from every angle the playfield camera can reach, and a dropped plate reveals it. It
            // shares the indicator lamp's material instance, so it inherits that lamp's state for
            // free: full brightness while the target stands, the lamp system's dimmer LOCKED level
            // once it's been knocked down. No new state, no new update hook.
            const slotGlow = BABYLON.MeshBuilder.CreateBox('missionTarget' + i + 'SlotGlow', {
                width: 0.026,
                height: 0.028,
                depth: 0.0012
            }, scene);
            slotGlow.position.set(bankX(pos, 0, 0.0065), 0.015, bankZ(pos, 0, 0.0065));
            slotGlow.rotation.y = bankRotationY;
            slotGlow.material = lampMat;

            // Indicator lamp, now in FRONT of the fixture rather than buried inside the plate's own
            // box where it was previously invisible while the target stood. Flattened the same way
            // the pop-bumper cap is, so it reads as an inset playfield insert rather than a bead.
            const lamp = BABYLON.MeshBuilder.CreateSphere('missionTarget' + i + 'Lamp', {
                diameter: TARGET_RADIUS_M * 0.85
            }, scene);
            lamp.scaling.y = 0.5;
            lamp.position.set(bankX(pos, 0, -0.014), 0.0035, bankZ(pos, 0, -0.014));
            lamp.material = lampMat;
            missionTargetMeshes.push(mesh);
            missionTargetLamps.push(lamp);
        });

        // Target-bank header rail (obstacle visual-polish pass, user-requested - "layered
        // geometry... make the table read like a designed pinball machine instead of a
        // collection of primitives"): MISSION_TARGET_BANK's 3 positions sit exactly colinear (a
        // straight diagonal bank, verified from their own config values, not assumed) - a single
        // raised trim strip spanning that line reads as one designed fixture the 3 flags mount
        // to, rather than 3 independent stakes that happen to share a color family. Computed from
        // the bank's own endpoints rather than hardcoded, so it stays correct if the bank layout
        // ever changes. Same "long axis along local X, then rotationY = atan2(-dz, dx)" rail
        // convention every other angled wall/rail in this file uses (see inlaneGuide's own
        // comment for how that formula was derived) - purely decorative, no physics.
        {
            const bankLength = bankSpan + TARGET_RADIUS_M * 3; // overhangs past the end targets, like a real mounting rail would
            const bankCenterX = (bankFirst.x + bankLast.x) / 2;
            const bankCenterZ = (bankFirst.z + bankLast.z) / 2;
            const header = BABYLON.MeshBuilder.CreateBox('missionTargetHeader', {
                width: bankLength,
                height: 0.006,
                depth: 0.01
            }, scene);
            // Nudged up-table (+14mm in z) as part of the drop-target fixture pass. At its old
            // z it sat directly over the bank centreline at y 0.031-0.037, i.e. immediately above
            // plates that top out at 0.030 - from the playfield camera's downward angle that put
            // a solid dark bar across the upper third of every target face, occluding exactly the
            // border and number the faces now carry. Moved just behind the new slot back walls
            // (which end at z +0.011) it reads as the rail the three housings mount to, which is
            // what it was always meant to be. Decorative only - no collider, no gameplay effect.
            // The +14mm nudge is now taken along the bank's own BACK (local +Z) rather than along
            // world +z, so on an angled bank the rail stays parallel to the plates and a fixed
            // distance behind all three of them instead of drifting across their faces.
            const bankCenter = { x: bankCenterX, z: bankCenterZ };
            const headerX = bankX(bankCenter, 0, 0.014);
            const headerZ = bankZ(bankCenter, 0, 0.014);
            header.position.set(headerX, 0.034, headerZ);
            header.rotation.y = bankRotationY;
            header.material = housingMat;
            addRailBevel(scene, 'missionTargetHeaderCap', railCapMat, bankLength, 0.01, headerX, 0.037, headerZ, bankRotationY);

            // Approach tint, painted down the bank's OWN face normal - which, because the bank is
            // mounted square to the measured flipper approach, is the shot line itself. Same
            // floor-tint idiom the orbit lanes use to make a corridor read as a route at a glance
            // (see addLaneFloorTint), and the reason this bank needs one is that its approach is
            // the widest piece of open playfield on the board: nothing between the flippers and
            // z 0.107 marks where the shot is, so the bank read as a thing to bump into rather
            // than a thing to aim at.
            //
            // Deliberately narrow. makeLaneFloorMat's own comment records what happens when these
            // strips get large: at 50mm x 75mm this is smaller than the outlane's 55mm x 58mm, so
            // it stays a floor tint under the bank's hardware instead of becoming the brightest
            // thing in the lower half of the table. Decorative only - height 0.001 at y 0.0012,
            // no collider, and nothing here is in any ball's way.
            const approachV = -0.048; // just clear of the plates' front faces (v -0.004), running 75mm down-table
            addLaneFloorTint(scene, 'missionTargetApproachTint', targetFloorMat, 0.05, 0.075,
                bankX(bankCenter, 0, approachV), bankZ(bankCenter, 0, approachV), bankRotationY);
        }

        // ===================================
        // Giant spinning Saturn (board redesign) - the table's new visual/gameplay centerpiece.
        // Real collider (a genuine "boss" piece - SATURN_RADIUS_M is more than double every other
        // bumper's radius) plus two decorative rings extending well beyond it, both rotated a
        // little further per frame by updateSaturnRotation() in main()'s render loop. HEX_SATURN/
        // HEX_SATURN_RING (gold/orange) - previously used by the old small "satellite" object -
        // now finally belong to an object actually named and shaped like Saturn.
        // ===================================
        const saturnMat = new BABYLON.PBRMaterial('saturnMat', scene);
        // White, not COLOR_SATURN: createSaturnBandTexture() bakes the gold into the albedo
        // texture, and albedoTexture is multiplied by albedoColor - keeping the tint here as well
        // would square it and flatten every band back into one dark amber. Same reasoning, and the
        // same resulting look, as the mission-target plates.
        // 1.0 -> 0.82 (hierarchy pass). saturnBandTex is multiplied by this, so it scales the
        // whole banded body evenly and keeps every band's relationship intact - which trimming the
        // texture itself would not. Saturn measured p90 245 across 10,618 pixels, level with a
        // ball occupying 553.
        saturnMat.albedoColor = new BABYLON.Color3(0.52, 0.52, 0.52);
        saturnMat.albedoTexture = createSaturnBandTexture(scene);
        // Metallic 0.5 -> 0.06: a gas giant is not a metal ball, and at 0.5 the body picked up a
        // broad specular sheen that washed the new banding straight back out. Roughness up to
        // match - a diffuse atmosphere, lit rather than polished.
        saturnMat.metallic = 0.06;
        saturnMat.roughness = 0.62;
        // Emissive 0.35 -> 0.18. The bands and the rim shell below now carry Saturn's presence, so
        // the flat self-glow that used to do all that work can come down - which also protects the
        // rule that the BALL stays the brightest, easiest-to-track thing on the board (ballMat's
        // own emissive is 0.7 of cyan; see its comment). Measured, not guessed: at 0.35 Saturn's
        // peak emissive channel was half the ball's while covering ~20x the screen area.
        saturnMat.emissiveColor = COLOR_SATURN.scale(0.13); // 0.18 -> 0.13, hierarchy pass - see saturnRimMat below
        const saturnMesh = BABYLON.MeshBuilder.CreateSphere('saturn', { diameter: SATURN_RADIUS_M * 2 }, scene);
        saturnMesh.position.set(SATURN_POS.x, SATURN_RADIUS_M, SATURN_POS.z);
        saturnMesh.material = saturnMat;
        saturnMesh.metadata = { kind: 'saturn' };
        // Physical collider - a real, hittable obstacle (per the user's explicit request), not
        // just a decorative backdrop piece.
        new BABYLON.PhysicsAggregate(saturnMesh, BABYLON.PhysicsShapeType.SPHERE, { mass: 0, restitution: 0.85, friction: 0.3 }, scene);

        // Atmospheric limb - a warm halo hugging Saturn's silhouette, so the planet ends in air
        // rather than at a hard edge.
        //
        // This is a camera-facing plane with an explicit radial-alpha texture, NOT the more obvious
        // Fresnel-opacity shell. That was the first attempt and it was measured, in isolation, to
        // fail: Babylon's opacity Fresnel does fade toward the centre, but even at power 3.4 the
        // bright region covered the outer ~60% of the disc rather than a limb, and the result was a
        // uniform warm veil that erased the new banding underneath completely. A gradient drawn
        // here is exact, costs two triangles, and cannot drift.
        //
        // The halo's inner edge starts at the planet's own silhouette and glows OUTWARD, which also
        // sidesteps a depth problem: a glow band lying inside the silhouette sits at the same depth
        // as the limb it is drawn over.
        const saturnRimSize = SATURN_RADIUS_M * 2 * 1.34;
        const saturnRimTex = (() => {
            const size = 128, c = size / 2;
            const tex = new BABYLON.DynamicTexture('saturnRimTex', { width: size, height: size }, scene, true);
            const ctx = tex.getContext();
            const img = ctx.createImageData(size, size);
            // Planet silhouette lands at this fraction of the plane's half-size.
            const body = 1 / 1.34;
            for (let y = 0; y < size; y++) {
                for (let x = 0; x < size; x++) {
                    const dx = (x + 0.5 - c) / c, dy = (y + 0.5 - c) / c;
                    const r = Math.sqrt(dx * dx + dy * dy);
                    let a = 0;
                    if (r >= body && r <= 1) {
                        const t = (r - body) / (1 - body); // 0 at the limb, 1 at the plane's edge
                        a = Math.pow(1 - t, 2.1) * (1 - Math.pow(1 - Math.min(1, t / 0.10), 2)); // rises fast off the limb, then falls away
                    }
                    const o = (y * size + x) * 4;
                    img.data[o] = 255; img.data[o + 1] = 205; img.data[o + 2] = 128;
                    img.data[o + 3] = Math.round(Math.max(0, Math.min(1, a)) * 255);
                }
            }
            ctx.putImageData(img, 0, 0);
            tex.update();
            tex.hasAlpha = true;
            return tex;
        })();
        const saturnRimMat = new BABYLON.StandardMaterial('saturnRimMat', scene);
        saturnRimMat.diffuseColor = new BABYLON.Color3(0, 0, 0);
        saturnRimMat.specularColor = new BABYLON.Color3(0, 0, 0);
        // 0.8 -> 0.5 (hierarchy pass): Saturn measured p90 245 across 10,618 pixels from the
        // gameplay camera, level with the ball. The limb is the brightest part of it, so it takes
        // most of the cut. The texture still carries the colour and the falloff.
        saturnRimMat.emissiveColor = new BABYLON.Color3(0.62, 0.62, 0.62); // restored toward its original tint now that texture.level above is doing the dimming
        saturnRimMat.emissiveTexture = saturnRimTex;
        // Hierarchy pass: dropping saturnRimMat.emissiveColor from 0.8 all the way to 0.24 moved
        // this limb's measured p90 by only 8 units, because on a StandardMaterial the emissive
        // TEXTURE carries its own brightness and the colour barely scales it. texture.level is the
        // control that actually does - it multiplies the sampled texel directly. Measured, not
        // assumed: this is the difference between the limb sitting above every tier-2 target and
        // sitting with the rest of tier 3.
        saturnRimTex.level = 0.55;
        saturnRimMat.opacityTexture = saturnRimTex;
        saturnRimMat.disableLighting = true;
        saturnRimMat.disableDepthWrite = true; // never let a transparent halo occlude the rings crossing behind it
        saturnRimMat.backFaceCulling = false;
        const saturnRim = BABYLON.MeshBuilder.CreatePlane('saturnRim', { size: saturnRimSize }, scene);
        saturnRim.position.set(SATURN_POS.x, SATURN_RADIUS_M, SATURN_POS.z);
        saturnRim.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL; // the camera shakes and punches; a fixed plane would shear
        saturnRim.material = saturnRimMat;
        saturnRim.isPickable = false;
        // Excluded from the scene GlowLayer in main(). This halo IS the glow, already shaped
        // exactly as intended; letting GlowLayer blur it again just re-creates the oversized soft
        // haze the recent insert pass spent its time removing. Same treatment, for the same
        // reason, the skybox and backglass already get.

        // Ring plane. Structure comes from createSaturnRingTexture() (ringlets, a dark division,
        // faint spokes); this material's job is to stop the rings looking like painted plastic.
        // Metallic drops to 0.10 and the emissive falls from 0.35 to a textured 0.26, so the ring
        // is a lit band of ice and rock rather than a glowing hoop, and alpha 0.82 lets the
        // planet and the starfield show faintly through it the way a real ring plane does.
        const saturnRingMat = new BABYLON.PBRMaterial('saturnRingMat', scene);
        const saturnRingTex = createSaturnRingTexture(scene);
        saturnRingMat.albedoColor = new BABYLON.Color3(1, 1, 1); // texture carries the colour - see saturnMat's own comment
        saturnRingMat.albedoTexture = saturnRingTex;
        saturnRingMat.metallic = 0.10;
        saturnRingMat.roughness = 0.55;
        // Emissive is TEXTURED, unlike the body's: the divisions have to stay dark, and a flat
        // emissive would light them back up and erase the structure the texture just added.
        saturnRingMat.emissiveTexture = saturnRingTex;
        saturnRingMat.emissiveColor = COLOR_SATURN_RING.scale(0.17); // 0.22 -> 0.17, hierarchy pass
        saturnRingMat.alpha = 0.82;

        // scaling.y flattens the torus tube into a ribbon before any rotation is applied (Babylon
        // composes scale, then rotation, then translation), turning a doughnut into a ring plane.
        // This is most of why the old rings read as two hoops around a ball.
        //
        // The tilt also changes, and it fixes a real defect: at the old Math.PI/2.3 (78 degrees)
        // the ring plane stood almost vertical, so ring1 spanned y -0.038 to 0.128 - measured, not
        // estimated - i.e. it passed 38mm THROUGH the playfield. The gameplay camera looks down at
        // Saturn from only 16 degrees (also measured), so the ring needs real tilt of its own to
        // open into a readable ellipse from that view. 0.545 rad (31 degrees) is as far as it can
        // go before the ring's lowest point reaches the playfield again - swept in-browser, not
        // derived: 0.52 puts ring1's world minimum at y 0.0027 and 0.58 puts it at -0.0015, so
        // this sits just inside the limit while opening the ellipse as wide as the table allows.
        const RING_TILT_RAD = 0.545;
        const saturnRing1 = BABYLON.MeshBuilder.CreateTorus('saturnRing1', {
            diameter: SATURN_RADIUS_M * 3.5,
            thickness: SATURN_RADIUS_M * 0.22,
            tessellation: 32
        }, scene);
        saturnRing1.position.set(SATURN_POS.x, SATURN_RADIUS_M, SATURN_POS.z);
        saturnRing1.scaling.y = 0.16;
        saturnRing1.rotation.x = RING_TILT_RAD;
        saturnRing1.material = saturnRingMat;
        saturnRing1.isPickable = false;
        // No physics body - purely decorative, would otherwise double the ball's Saturn hit
        // detection (same reasoning as every other obstacle's decorative ring in this file).

        const saturnRing2 = BABYLON.MeshBuilder.CreateTorus('saturnRing2', {
            diameter: SATURN_RADIUS_M * 2.6,
            thickness: SATURN_RADIUS_M * 0.14,
            tessellation: 32
        }, scene);
        saturnRing2.position.set(SATURN_POS.x, SATURN_RADIUS_M, SATURN_POS.z);
        saturnRing2.scaling.y = 0.22;
        // Coplanar with ring1, not offset: an offset made the two read as two crossing hoops, the
        // exact silhouette this pass is trying to get away from. updateSaturnRotation() already
        // turns them at different speeds and in opposite directions, and now that the ring texture
        // carries spokes that counter-rotation is visible - which is what sells a ring SYSTEM.
        saturnRing2.rotation.x = RING_TILT_RAD;
        saturnRing2.material = saturnRingMat;
        saturnRing2.isPickable = false;
        // Rotated opposite to ring1 each frame (see updateSaturnRotation()) - two rings turning
        // against each other reads as a much more alive, "spinning" system than one ring alone.
        const saturnRings = [saturnRing1, saturnRing2];

        // Polar highlight cap (obstacle visual-polish pass, user-requested - "subtle emissive
        // inserts... contrasting materials"): a small flattened sphere at Saturn's own peak, a
        // brighter neutral-warm material distinct from the body's own gold, the same "cap reads
        // as a highlight, not a lighting artifact" treatment the bumper cluster's caps already
        // established. Purely decorative, embedded slightly into the body to hide the seam.
        const saturnCapMat = new BABYLON.PBRMaterial('saturnCapMat', scene);
        // Roughness up from 0.2 and metallic down from 0.15: against the old flat-gold body a
        // glossy cap read as a highlight, but against the banded atmosphere it caught the point
        // lights as a blown white smear at the pole. Matte cream sits in the bands instead of on
        // top of them. Geometry, position and the skin slot below are unchanged.
        saturnCapMat.albedoColor = new BABYLON.Color3(0.72, 0.67, 0.55); // hierarchy pass - a near-white cap on the board's largest feature clipped alongside the body
        saturnCapMat.metallic = 0.08;
        saturnCapMat.roughness = 0.48;
        // 0.85 -> 0.45. At 0.85 this small cap's peak emissive channel was BRIGHTER than the ball's
        // own (0.7), which put a fixed board decoration above the one object the player has to
        // track continuously. 0.45 keeps it clearly the highlight of Saturn's pole without
        // competing. Purely the resting brightness - nothing about the skin slot below changes.
        saturnCapMat.emissiveColor = COLOR_SATURN.scale(0.22); // 0.45 -> 0.22 across the hierarchy pass - this cap sits at Saturn's brightest point
        // Obstacle decal skin slot (visual-architecture pass, user-requested). No-op until
        // assets/skins/obstacles/obstacle-decal-saturn.png actually exists (see SKINS.md); this
        // highlight cap's neutral-warm material stays the fallback either way.
        applySkinTexture(scene, saturnCapMat, SKIN_MANIFEST.obstacleDecalSaturn);
        const saturnCap = BABYLON.MeshBuilder.CreateSphere('saturnCap', { diameter: SATURN_RADIUS_M * 0.7, segments: 12 }, scene);
        saturnCap.scaling.y = 0.4;
        saturnCap.position.set(SATURN_POS.x, SATURN_RADIUS_M * 1.85, SATURN_POS.z);
        saturnCap.material = saturnCapMat;

        // Landing-pad floor glow (see addFeatureFloorGlow()'s own comment) - grounds the
        // floating sphere with a visible presence on the playfield itself, the same "a raised
        // object needs a visible base" cue this pass gives every other floating obstacle
        // (bumpers' skirt, slingshots' new base plate below). Sized to the sphere's own
        // footprint, deliberately smaller than the tilted decorative rings above it so the pad
        // doesn't visually compete with them.
        const saturnFloorMat = makeLaneFloorMat('saturnFloorMat', COLOR_SATURN_RING, 0.22);
        addFeatureFloorGlow(scene, 'saturnFloorGlow', saturnFloorMat, SATURN_RADIUS_M * 2.4, SATURN_POS.x, SATURN_POS.z);

        // --- Saturn's framing hardware -------------------------------------------------------
        // The canopy over the crown and the mouth's right jaw. See SATURN_CANOPY for the two
        // measured populations this separates and every clearance below is checked against, and
        // SATURN_JAW for why only one cheek is built. Nothing here touches Saturn's own collider,
        // kick, cooldown or score - it changes which ways a ball can REACH it, not what happens
        // when it does.
        //
        // Shared by Saturn's framing, the comet's lane wall and the Vision Gate's scoop cheeks.
        // Same rail convention as every other angled guide on this board: long axis along local X,
        // then rotationY = atan2(-dz, dx). Each segment is stretched 4% past its chord so
        // consecutive ones overlap rather than butting, for the same reason the orbit arcs are -
        // a butt joint leaves a hairline seam and a seam catches a rolling ball.
        const guideRail = (name, pa, pb) => {
            const dx = pb.x - pa.x, dz = pb.z - pa.z;
            const len = Math.hypot(dx, dz);
            if (len < 1e-6) return;
            const rotY = Math.atan2(-dz, dx);
            const cx = (pa.x + pb.x) / 2, cz = (pa.z + pb.z) / 2;
            const box = BABYLON.MeshBuilder.CreateBox(name, {
                width: len * 1.04, height: 0.022, depth: 0.015
            }, scene);
            box.position.set(cx, 0.011, cz);
            box.rotation.y = rotY;
            box.material = housingMat;
            box.metadata = { kind: 'wall' }; // reuses the generic wall shake/sound, same as the orbit rails
            new BABYLON.PhysicsAggregate(box, BABYLON.PhysicsShapeType.BOX, { mass: 0, restitution: 0.4, friction: 0.5 }, scene);
            addRailBevel(scene, name + 'Cap', railCapMat, len * 1.04, 0.015, cx, 0.022, cz, rotY);
        };
        for (let i = 0; i < SATURN_CANOPY.length - 1; i++) {
            guideRail('saturnCanopy' + i, SATURN_CANOPY[i], SATURN_CANOPY[i + 1]);
        }
        guideRail('saturnJaw', SATURN_JAW.from, SATURN_JAW.to);
        // Approach tint - the corridor the shot runs up, painted so the mouth reads as a route
        // rather than a gap between two obstacles. Decorative, height 0.001 at y 0.0012.
        addLaneFloorTint(scene, 'saturnApproachTint', saturnApproachMat,
            SATURN_APPROACH_TINT.width, SATURN_APPROACH_TINT.length,
            SATURN_APPROACH_TINT.x, SATURN_APPROACH_TINT.z, 0);

        // --- Comet lane ----------------------------------------------------------------------
        // See COMET_RETURN_RAIL for the left-flipper band this lane was measured out of and every
        // clearance the rail is checked against. Built with the same helper as Saturn's own
        // framing directly above, so the two centre corridors are made of the same hardware.
        guideRail('cometReturnRail', COMET_RETURN_RAIL.from, COMET_RETURN_RAIL.to);
        // Laid along the 16-degree shot line rather than the board's axis. addLaneFloorTint's
        // `depth` runs along the strip's local Z, and rotationY = the lane's own angle puts that
        // local Z on the shot line - so the tint is drawn where the ball actually travels.
        addLaneFloorTint(scene, 'cometApproachTint', cometApproachMat,
            COMET_APPROACH_TINT.width, COMET_APPROACH_TINT.length,
            COMET_APPROACH_TINT.x, COMET_APPROACH_TINT.z, COMET_APPROACH_TINT.angleRad);

        // ===================================
        // Comet (board redesign) - the old "satellite" object, re-themed now that Saturn is a
        // real dedicated piece. Same role (a physical, scored bumper with its own decorative
        // ring), same general neighborhood, just a new icy-cyan identity (HEX_COMET) instead of
        // sharing Saturn's gold/orange colors, and nudged to sit clear of Saturn's new footprint.
        // ===================================
        const cometMat = new BABYLON.PBRMaterial('cometMat', scene);
        // Pale, desaturated ice rather than the neon cyan it shared with the ball. Two reasons:
        // a comet nucleus is dirty ice and rock, not a glowing orb, and COLOR_COMET is close
        // enough to COLOR_EYEBALL (the ball's own emissive) that a saturated cyan sphere on the
        // board competes with the one object the player must never lose track of.
        cometMat.albedoColor = COLOR_COMET.scale(0.34).add(new BABYLON.Color3(0.12, 0.15, 0.18));
        // metallic 0.4 -> 0.0 with a low roughness: ice is a dielectric that reflects sharply, not
        // a metal. This is what makes the facets below catch light as crystal rather than chrome.
        cometMat.metallic = 0.0;
        cometMat.roughness = 0.14;
        // 0.4 -> 0.20, the "restrained glow" half of this. The nucleus is lit, not a lamp; the
        // tail below carries the comet's brightness, which is where a comet's light belongs.
        cometMat.emissiveColor = COLOR_COMET.scale(0.14); // 0.20 -> 0.14, hierarchy pass - the comet measured p90 222, above every tier-2 target
        // Obstacle decal skin slot (visual-architecture pass, user-requested) - applied to the
        // comet's own material, not its collider: this only ever swaps a texture property on an
        // existing PBRMaterial, the mesh/shape/physics/metadata below are entirely unaffected.
        // No-op until assets/skins/obstacles/obstacle-decal-comet.png actually exists (see
        // SKINS.md); the icy-cyan procedural material stays the fallback either way.
        applySkinTexture(scene, cometMat, SKIN_MANIFEST.obstacleDecalComet);
        // Faceted, not smooth. A low-subdivision flat-shaded icosphere is the single strongest
        // "this is a mineral, not a planet" cue available, and it is what separates the comet from
        // Saturn at a glance now that Saturn is banded and ringed. It is also dramatically CHEAPER
        // than what it replaces: 80 triangles, measured in-scene, against the default 32-segment
        // sphere's 4624.
        //
        // The collider is pinned explicitly to COMET_RADIUS_M rather than left to be inferred from
        // the mesh, because an icosphere's bounding box is not the sphere's - without this the
        // derived radius would shift with the mesh. Verified in-browser to produce the identical
        // shape radius the smooth sphere produced.
        const cometMesh = BABYLON.MeshBuilder.CreateIcoSphere('comet', {
            radius: COMET_RADIUS_M,
            subdivisions: 2,
            flat: true
        }, scene);
        cometMesh.position.set(COMET_POS.x, COMET_RADIUS_M, COMET_POS.z);
        cometMesh.material = cometMat;
        cometMesh.metadata = { kind: 'comet' };
        new BABYLON.PhysicsAggregate(cometMesh, BABYLON.PhysicsShapeType.SPHERE, { mass: 0, restitution: 0.8, friction: 0.3, radius: COMET_RADIUS_M }, scene);

        // The comet's tail, replacing the single tilted ring that used to stand in for it.
        //
        // That ring was the main reason the comet read as a small Saturn: a sphere with a tilted
        // hoop around it is the universal shorthand for a ringed planet, and this board now has an
        // actual ringed planet 17cm away to be confused with. A comet's identifying feature is a
        // tail, so it gets one.
        //
        // Two nested cones, bright narrow core inside a wide faint envelope - the way a real tail
        // reads, and the reason a single cone always looks like a traffic pylon. No particles, no
        // per-frame work, no collider: four meshes' worth of triangles in total.
        //
        // Direction: up-table and rising, so the comet reads as having come DOWN the table toward
        // the player. That also keeps the tail clear of the two places it must not be - the right
        // orbit lane outboard of it, and the ball's own plane, which it leaves within its first
        // centimetre (its far end sits at y 0.045, well above the ball's 0.027 crown).
        const cometTailMeshes = [];
        const cometTailMat = new BABYLON.StandardMaterial('cometTailMat', scene);
        cometTailMat.diffuseColor = new BABYLON.Color3(0, 0, 0);
        cometTailMat.specularColor = new BABYLON.Color3(0, 0, 0);
        // 0.62/0.42 was the first attempt and it was measured (screenshot) to blow out into a
        // white beam - the scene GlowLayer blooms an emissive cone along its whole length, and a
        // long thin bright shape is the worst case for that. Both cones are excluded from the
        // GlowLayer in main() and run at roughly half this brightness instead, which is what keeps
        // this a "restrained glow" and not a searchlight.
        cometTailMat.emissiveColor = COLOR_COMET.scale(0.38);
        cometTailMat.disableLighting = true;
        cometTailMat.alpha = 0.32;
        cometTailMat.disableDepthWrite = true; // a transparent tail must never punch a hole in what is behind it
        cometTailMat.backFaceCulling = false;

        const cometTailCoreMat = cometTailMat.clone('cometTailCoreMat');
        cometTailCoreMat.emissiveColor = COLOR_COMET.scale(0.14).add(new BABYLON.Color3(0.26, 0.31, 0.34)); // pale ice at the core, a step brighter than the envelope around it
        cometTailCoreMat.alpha = 0.40;

        {
            // Built along +Y (a cone's own axis) and then turned onto the tail direction with a
            // single axis-angle rotation. Deliberately not Euler angles: this file's rotation
            // convention is YXZ and composing a two-axis aim by hand there is exactly the kind of
            // sign/order ambiguity that has bitten other rotations in this file.
            // Mostly upward with an up-table, slightly outboard lean. An earlier, flatter aim was
            // measured to foreshorten into a vertical line from the gameplay camera (which looks
            // up-table from only 22 degrees of depression) and to hang over the right orbit lane
            // at ball height. This one leaves the ball's plane immediately and its far end sits at
            // (0.198, 0.066, 0.331) - clear of the lane, the rail and the right wall alike.
            const dir = new BABYLON.Vector3(0.42, 0.66, 0.62).normalize();
            const up = BABYLON.Vector3.Up();
            const axis = BABYLON.Vector3.Cross(up, dir);
            const angle = Math.acos(Math.max(-1, Math.min(1, BABYLON.Vector3.Dot(up, dir))));
            const aim = axis.lengthSquared() < 1e-8
                ? BABYLON.Quaternion.Identity()
                : BABYLON.Quaternion.RotationAxis(axis.normalize(), angle);

            [
                { name: 'cometTail', length: COMET_RADIUS_M * 3.0, base: COMET_RADIUS_M * 1.45, mat: cometTailMat },
                { name: 'cometTailCore', length: COMET_RADIUS_M * 2.1, base: COMET_RADIUS_M * 0.66, mat: cometTailCoreMat }
            ].forEach(({ name, length, base, mat }) => {
                // diameterTop 0 at the far end, widest at the nucleus - a tail spreads AWAY from
                // the body, so the cone points the other way from the obvious orientation: its
                // apex is at the comet and its open end trails off. Built apex-down by giving the
                // wide end to diameterBottom and then offsetting along the aim direction.
                const cone = BABYLON.MeshBuilder.CreateCylinder(name, {
                    diameterTop: base,
                    diameterBottom: 0,
                    height: length,
                    tessellation: 12
                }, scene);
                cone.rotationQuaternion = aim.clone();
                cone.position.set(
                    COMET_POS.x + dir.x * length * 0.5,
                    COMET_RADIUS_M + dir.y * length * 0.5,
                    COMET_POS.z + dir.z * length * 0.5
                );
                cone.material = mat;
                cone.isPickable = false;
                cometTailMeshes.push(cone);
            });
        }

        // Landing-pad floor glow - see saturnFloorGlow's own comment for the reasoning. Sized
        // and dimmed a step down from Saturn's own pad, matching this object's existing "simpler
        // than Saturn" design language (see the tail's own comment).
        const cometFloorMat = makeLaneFloorMat('cometFloorMat', COLOR_COMET, 0.18);
        addFeatureFloorGlow(scene, 'cometFloorGlow', cometFloorMat, COMET_RADIUS_M * 2.6, COMET_POS.x, COMET_POS.z);

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

        // ===================================
        // Slingshots
        // ===================================
        // A real slingshot is a recognisable machine: a moulded housing, a lit plastic on top of
        // it, two posts, and a rubber band stretched between them that the ball actually strikes.
        // What was here was a glowing magenta slab with a dark wedge somewhere behind it - the
        // brightest thing in the lower table and the least mechanical-looking.
        //
        // Everything below is decoration. The collider box keeps its exact dimensions, position,
        // rotation, restitution and friction, and every kick force, cooldown and score is
        // untouched; the parts are laid out around it, never through it.
        //
        // They are positioned in a rig's LOCAL space rather than in world coordinates with a
        // mirror-signed offset, which is how the old decorations were placed - and that convention
        // put the left slingshot's housing on the ball-facing side of its own kicker while the
        // right one's sat correctly behind it. In local space "behind" is +Z on both sides, so the
        // two are genuine mirror images for the first time.
        //
        // Local frame, derived from the collider's own 20-degree angle: +X runs along the kicker
        // toward the middle of the table, -Z is the face the ball strikes (verified from the
        // rotation, not assumed - at +20 degrees the box's local -Z maps to world (-0.34, 0, -0.94),
        // i.e. down-table, which is where a ball coming off the flipper arrives from).
        const slingshotMat = new BABYLON.PBRMaterial('slingshotMat', scene);
        // Was a full-intensity magenta (1,0,1) with a 0.5 emissive - a neon slab. This is the
        // kicker BODY now, the moulded mass the rubber is mounted on, so it reads as dark plastic
        // with the fixture's magenta in it rather than as a light source. The lit plastic and the
        // rubber below are what the eye is meant to land on.
        // Darker than a first pass at this had it: rendered head-on, a mid-magenta body still read
        // as one bright slab with a band drawn on it. Taking the body down to near-black is what
        // lets the posts and the rubber between them come forward as the mechanism, which is the
        // whole point of the fixture.
        slingshotMat.albedoColor = new BABYLON.Color3(0.105, 0.025, 0.10);
        slingshotMat.metallic = 0.12;
        slingshotMat.roughness = 0.6;
        slingshotMat.emissiveColor = new BABYLON.Color3(0.05, 0.0, 0.05);

        // The rubber ring itself. Matte, near-black, barely emissive - rubber does not glow, and
        // making it the darkest part of the fixture is what makes the lit plastic above it read as
        // lit. Shared by both slingshots; nothing ever recolours it per-instance.
        const slingshotRubberMat = new BABYLON.PBRMaterial('slingshotRubberMat', scene);
        // Sits a step LIGHTER than the body behind it, not darker. Rubber genuinely is the darkest
        // material on a real machine, but against a near-black kicker body a near-black band is
        // invisible; a touch of lift plus a matte 0.8 roughness is what makes it read as a
        // separate rubber part rather than a shadow on the body.
        slingshotRubberMat.albedoColor = new BABYLON.Color3(0.21, 0.075, 0.19);
        slingshotRubberMat.metallic = 0.0;
        slingshotRubberMat.roughness = 0.8;
        slingshotRubberMat.emissiveColor = new BABYLON.Color3(0.08, 0.01, 0.08);

        // Post rubber. The board's guard posts - the Vision Gate's three and the four on the lane
        // dividers - are collision surfaces with restitution 0.5 and 0.4, which IS rubber
        // behaviour; they were just drawn as bare metal, so the one part of the board a player
        // reads as "this will kick the ball back" looked like the parts that do not.
        //
        // Its own instance rather than sharing slingshotRubberMat: that one is the slingshots'
        // identity and gets tuned with them, and a future tweak there should not silently recolour
        // every post on the table. Same family though - matte, unlit, a shade off black - so all
        // the rubber on the board reads as one material.
        const postRubberMat = new BABYLON.PBRMaterial('postRubberMat', scene);
        postRubberMat.albedoColor = new BABYLON.Color3(0.19, 0.08, 0.17);
        postRubberMat.metallic = 0.0;
        postRubberMat.roughness = 0.82;
        // Half the slingshot band's emissive. That one sits on a feature that flashes on every hit
        // and needs headroom; a guard post does not glow, and under this scene's magenta key light
        // the higher value rendered the four lane-divider posts - the objects nearest the camera -
        // as saturated pink rather than matte rubber.
        postRubberMat.emissiveColor = new BABYLON.Color3(0.03, 0.005, 0.03);

        // One rubber-sleeved post. The sleeve is the COLLIDER MESH ITSELF, recoloured - not a ring
        // added around it. A real post's rubber is what the ball touches, so drawing it outside the
        // collider would put the visible rubber where the physics is not, which is the mismatch
        // this pass exists to remove (see the slingshot band below for the same fix). The metal cap
        // is decorative, has no collider, and is drawn INSET to 0.8 of the post's diameter. A real
        // star post's cap overhangs its rubber, but overhanging here would again claim contact the
        // collider does not have - and at full width in railCapMat, the board's brightest trim, the
        // four lane-divider caps rendered as pale discs that pulled the eye to the quietest corner
        // of the table (checked against the previous frame from the gameplay camera). Inset, they
        // read as the cap on top of a sleeve, which is the point.
        const dressPostAsRubber = (post, diameter, topY) => {
            post.material = postRubberMat;
            const cap = BABYLON.MeshBuilder.CreateCylinder(post.name + 'Cap', {
                diameter: diameter * 0.8, height: 0.0025
            }, scene);
            cap.position.set(post.position.x, topY, post.position.z);
            cap.material = railCapMat;
            return cap;
        };

        const slingshotPlasticTex = createSlingshotPlasticTexture(scene);

        SLINGSHOTS.forEach((def, i) => {
            const angle = def.mirror * BABYLON.Tools.ToRadians(20);
            const mesh = BABYLON.MeshBuilder.CreateBox('slingshot' + i, {
                width: SLINGSHOT_SIZE_M,
                height: 0.03,
                depth: SLINGSHOT_SIZE_M * 0.5
            }, scene);
            mesh.position.set(def.x, 0.015, def.z);
            mesh.rotation.y = angle; // angled inward, like a real slingshot kicker
            // A per-instance clone of slingshotMat, not the shared instance itself. The hit
            // handler calls pulseMesh(mesh), which flashes mesh.material.emissiveColor to white -
            // and while both slingshots shared one material that flashed BOTH of them on every
            // single hit. It was easy to miss while the body sat at a bright magenta; against the
            // dark moulded body it now has, one slingshot lighting up because the other was struck
            // is obvious. Matches the per-instance-clone convention the housing and the plastic
            // already use, and for the same reason.
            mesh.material = slingshotMat.clone('slingshotBodyMat' + i);
            new BABYLON.PhysicsAggregate(mesh, BABYLON.PhysicsShapeType.BOX, { mass: 0, restitution: SLINGSHOT_RESTITUTION, friction: 0.3 }, scene);

            // Decoration rig - shares the collider's position and angle, so every part below can be
            // written in the fixture's own local space. Nothing is parented to the COLLIDER itself
            // except the rubber (see below), and the aggregate is already built by this point, so
            // none of this can reach the physics shape.
            const rig = new BABYLON.TransformNode('slingshot' + i + 'Rig', scene);
            rig.position.set(def.x, 0, def.z);
            rig.rotation.y = angle;

            // Structural housing: the moulded back wall the kicker is mounted against, standing
            // clear behind the collider's own +Z face (local z 0.014..0.024 vs. the box's 0.0125).
            // Replaces the old triangular prism, which was a nice idea undone by needing two
            // stacked rotations to orient - it ended up nearly invisible and on the wrong side.
            //
            // Still a per-instance clone rather than the shared housingMat, because snapSlingshot()
            // in main() brightens this material directly on a hit and must only affect this one
            // slingshot. Restyled from housingMat's dark chrome (metallic 0.8) to moulded plastic:
            // a chrome back wall reads as a rail, not as a housing.
            const housing = BABYLON.MeshBuilder.CreateBox('slingshot' + i + 'Housing', {
                width: SLINGSHOT_SIZE_M * 1.12,
                height: 0.030,
                depth: 0.010
            }, scene);
            housing.parent = rig;
            housing.position.set(0, 0.015, 0.019);
            housing.material = housingMat.clone('slingshotHousingMat' + i);
            housing.material.albedoColor = new BABYLON.Color3(0.16, 0.14, 0.18);
            housing.material.metallic = 0.25;
            housing.material.roughness = 0.6;

            // Base mount plate (obstacle visual-polish pass, user-requested - "caps/bases...
            // readable height differences"): grounds the fixture with a visible low foot instead of
            // it appearing to hover just above the playfield, the same base-under-fixture cue the
            // bumpers' skirt already gives them. Shares housingMat (not the housing's own hit-flash
            // clone above) - the base never flashes on a kick. Deliberately kept at its original
            // size: this sits inside the left/right flipper's swept arc, and widening it is exactly
            // the change that would put decoration through a moving flipper.
            const base = BABYLON.MeshBuilder.CreateBox('slingshot' + i + 'Base', {
                width: SLINGSHOT_SIZE_M * 1.3,
                height: 0.006,
                depth: SLINGSHOT_SIZE_M * 0.75
            }, scene);
            base.parent = rig;
            base.position.set(0, 0.003, 0.004);
            base.material = housingMat;

            // The two posts the rubber is strung between, sitting just outboard of the collider's
            // own ends (local x +/-0.026 against the box's +/-0.025) so they frame the striking face
            // without ever standing in front of it. railCapMat is the polished-trim material every
            // guide-rail bevel on the board already shares, which is exactly what a real post is.
            [-1, 1].forEach((end) => {
                const post = BABYLON.MeshBuilder.CreateCylinder('slingshot' + i + 'Post' + (end < 0 ? 'A' : 'B'), {
                    diameter: 0.008,
                    height: 0.034,
                    tessellation: 10
                }, scene);
                post.parent = rig;
                post.position.set(end * 0.026, 0.017, -0.012);
                post.material = railCapMat;
            });

            // Illuminated insert: the lit plastic across the top of the housing. This is the mesh
            // the obstacleDecalSlingshot skin slot has always targeted (it was a thin trim bar
            // before), so the slot keeps pointing at exactly the same material - it just now has a
            // surface worth putting artwork on.
            //
            // A per-instance clone (each slingshot's own plastic, matching the housing's own
            // per-instance-clone convention above) so a skin, or the hit flash, can drive one
            // slingshot's plastic independently.
            const ridgeMat = slingshotMat.clone('slingshotRidgeMat' + i);
            // White, because createSlingshotPlasticTexture() bakes the magenta into the albedo
            // texture - see that function's comment. Emissive drops from a flat (1, 0.35, 1) to
            // roughly a third of it: at the old value the plastic clipped to white and none of the
            // border, chevrons or gradient could be seen through it.
            ridgeMat.albedoColor = new BABYLON.Color3(1, 1, 1);
            ridgeMat.albedoTexture = slingshotPlasticTex;
            ridgeMat.metallic = 0.05;
            ridgeMat.roughness = 0.3;
            ridgeMat.emissiveColor = new BABYLON.Color3(0.42, 0.10, 0.42);
            // Obstacle decal skin slot (visual-architecture pass, user-requested). Both slingshots
            // share the same manifest path (two independent Texture loads of the same URL - the
            // browser caches the actual fetch) since they're mirror images of one fixture, not two
            // distinct ones. Assigned AFTER the procedural texture above so real artwork cleanly
            // replaces it rather than racing it. No-op until
            // assets/skins/obstacles/obstacle-decal-slingshot.png actually exists (see SKINS.md).
            applySkinTexture(scene, ridgeMat, SKIN_MANIFEST.obstacleDecalSlingshot);
            const ridge = BABYLON.MeshBuilder.CreateBox('slingshot' + i + 'Ridge', {
                width: SLINGSHOT_SIZE_M,
                height: 0.005,
                depth: 0.020
            }, scene);
            ridge.parent = rig;
            ridge.position.set(0, 0.0325, 0.012); // rests on the collider's own 0.030 crown, never inside it
            ridge.material = ridgeMat;

            // Rubber/contact edge: the band strung between the two posts, now FLUSH with the
            // collider's striking face rather than 3.25mm proud of it.
            //
            // The old comment here claimed the ball "meets rubber first". It did not: the collider
            // box is depth SLINGSHOT_SIZE_M*0.5 centred on the rig, so its striking face is at
            // local z -0.0125, and this band sat at -0.0140 with depth 0.0035 - outer face -0.01575,
            // i.e. 3.25mm out in front of anything solid. The ball visibly sank a quarter of its
            // radius into the rubber before the slingshot noticed. Moved to -0.01245 so the band's
            // outer face lands 0.2mm proud of the collider face: enough to render in front of it
            // without z-fighting, and a mismatch of 0.2mm against a 27mm ball rather than 3.25mm.
            // The collider is untouched, so the kick, SLINGSHOT_RESTITUTION and the lower-playfield
            // flow are exactly as they were.
            //
            // On the rig, NOT parented to the collider. Parenting it there was tried, because
            // snapSlingshot() stretches the collider on every kick and a rubber band riding that
            // for free is an appealing idea - but rendered mid-hit it stretches the band along its
            // own length, past both posts, which reads as the rubber flying off its anchors. A
            // real band bulges FORWARD, so snapSlingshot() pushes this one out along -Z instead.
            const rubber = BABYLON.MeshBuilder.CreateBox('slingshot' + i + 'Rubber', {
                width: SLINGSHOT_SIZE_M * 1.04,
                height: 0.009,
                depth: 0.0035
            }, scene);
            rubber.parent = rig;
            rubber.position.set(0, 0.019, -0.01245);
            rubber.material = slingshotRubberMat;

            // Referenced by snapSlingshot() (in main(), via the collider mesh's metadata below) so
            // the hit handler - which only ever receives the collider mesh from the collision
            // event - can reach these decorative parts without a separate scene lookup. `plastic`
            // and `rubber` are new: the lit insert is the part a real slingshot flashes, and the
            // band is the part that visibly moves.
            //
            // restScale is captured here rather than read off the mesh at hit time. The hit branch
            // calls pulseMesh(mesh) and then snapSlingshot(mesh), and snapSlingshot used to
            // multiply whatever scale it found - which was pulseMesh's 1.3x, already applied - so
            // the fixture actually ballooned to 1.95x rather than the 1.5x that code intends and
            // documents. Anchoring to the true rest scale gives the stretch its intended size.
            mesh.metadata = { kind: 'slingshot', housing, plastic: ridge, rubber, restScale: mesh.scaling.clone() };
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
            // Insert-legibility pass (user-requested). Two changes, both measured.
            //
            // albedoColor 0.5/0.5/0.15 -> a near-black olive. That old value made these the worst
            // offenders on the board for state readability: rendered in isolation with emissive
            // zeroed, 85% of an UNLIT lane's brightness was albedo response to the scene lights,
            // so the lamp system's own 0.12 -> 0.9 swing could only move the rendered lane 1.47-
            // 1.56x. They read as three permanently-lit olive blocks whether the bank was lit or
            // not. Same reasoning and same direction as styleInsertLampMat()'s floor above.
            //
            // These also had NO symbol at all - three identical untextured boxes marking the
            // objective of a whole vision (RETURN TO BODY, "COMPLETE THE RE-ENTRY LANES"). They
            // now carry the family's earth-mark legend on the same emissiveTexture channel every
            // other insert uses, so the lamp system drives them identically and nothing about
            // registerLamp()/setLaneLit() changes.
            laneMat.albedoColor = new BABYLON.Color3(0.028, 0.028, 0.009);
            laneMat.emissiveTexture = insertLensTextures.ground;
            laneMat.metallic = 0.1;
            laneMat.roughness = 0.4;
            laneMat.alpha = 0.6;
            // Re-entry lane insert skin slot - the fourth lane family, added alongside the three
            // that already existed. Emissive like its siblings, for the same reason: a loaded
            // texture is multiplied by whatever state the lamp system has this lane in, so artwork
            // can restyle the symbol without ever overriding lit/unlit. No-op until
            // assets/skins/lanes/lane-insert-reentry.png exists (see SKINS.md).
            applySkinTexture(scene, laneMat, SKIN_MANIFEST.laneInsertReentry);

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
                const railX = pos.x + side * REENTRY_LANE_RADIUS_M * 1.1;
                const rail = BABYLON.MeshBuilder.CreateBox('reentryLane' + i + 'Rail' + side, {
                    width: 0.004,
                    height: 0.018,
                    depth: REENTRY_LANE_RADIUS_M * 2.4
                }, scene);
                rail.position.set(railX, 0.014, pos.z);
                rail.material = housingMat;
                // Raised bevel cap (see addRailBevel()'s own comment) - this rail's own long axis
                // runs along Z (not the X-then-rotated convention every other rail below uses), so
                // the cap is built the same "long along local X" way and then rotated 90 degrees
                // to match, rather than swapping which of width/depth means "length" in the helper.
                addRailBevel(scene, 'reentryLane' + i + 'RailCap' + side, railCapMat, REENTRY_LANE_RADIUS_M * 2.4, 0.004, railX, 0.023, pos.z, Math.PI / 2);
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
            // Same "long axis along Z, rotated 90 degrees to match the helper's along-X default"
            // case as the reentry lane rails above - this divider isn't built with the rotation-
            // formula convention the angled inlane guide just below uses.
            addRailBevel(scene, 'laneDivider' + laneDef.side + 'Cap', railCapMat, Math.abs(LANE_Z_TOP_M - LANE_Z_BOTTOM_M), 0.006, dividerX, 0.022, dividerCenterZ, Math.PI / 2);

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
                // Rubber-sleeved: these are the two posts that separate the inlane from the
                // outlane, and the ones a ball returning down the side actually strikes. Collider
                // restitution here is 0.4, in the same band as the slingshot rubber's 0.45, so the
                // sleeve is describing what the surface already does rather than restyling it.
                dressPostAsRubber(post, 0.016, 0.0305);
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
                // The guide stops at its OWN bottom Z, not the divider's - see
                // INLANE_GUIDE_BOTTOM_Z_M for the pinch this removes. The divider rail and posts
                // below still run to LANE_Z_BOTTOM_M.
                const dx = guideBottomX - guideTopX;
                const dz = INLANE_GUIDE_BOTTOM_Z_M - LANE_Z_TOP_M;
                const guideLength = Math.sqrt(dx * dx + dz * dz);
                const guideRotationY = Math.atan2(-dz, dx);
                const guideCenterZ = (LANE_Z_TOP_M + INLANE_GUIDE_BOTTOM_Z_M) / 2;

                const guide = BABYLON.MeshBuilder.CreateBox('inlaneGuide' + laneDef.side, {
                    width: guideLength,
                    height: 0.022,
                    depth: 0.006
                }, scene);
                guide.position.set((guideTopX + guideBottomX) / 2, 0.011, guideCenterZ);
                guide.rotation.y = guideRotationY;
                guide.material = housingMat;
                guide.metadata = { kind: 'wall' };
                new BABYLON.PhysicsAggregate(guide, BABYLON.PhysicsShapeType.BOX, { mass: 0, restitution: 0.4, friction: 0.5 }, scene);
                // This guide already uses the "long axis along local X, then rotationY" convention
                // addRailBevel() itself assumes, so its own guideRotationY passes straight through.
                addRailBevel(scene, 'inlaneGuide' + laneDef.side + 'Cap', railCapMat, guideLength, 0.006, (guideTopX + guideBottomX) / 2, 0.022, guideCenterZ, guideRotationY);
            }

            // Lane floor tints (visual-polish pass, user-requested - "inset/grooved lane surfaces
            // where appropriate... clear visual separation between inlanes/outlanes/orbits") - see
            // addLaneFloorTint()'s own comment. The outlane's corridor is a simple, unrotated
            // rectangle running the divider's own full Z span, safely inside both the divider
            // (0.04m inward of the trigger) and the outer wall (~0.055m outward of it, well past
            // this strip's own half-width) - see SIDE_LANES' own block comment for those measured
            // boundary values. The inlane strip stays a modest patch centered on the trigger
            // itself instead: its real channel narrows to a taper against the inlane guide (see
            // INLANE_GUIDE_TOP_X_M/INLANE_GUIDE_BOTTOM_X_M's comment) and the trigger sits inboard
            // of most of that taper, so a full-span strip there would visually claim floor space
            // that was never actually a walled channel.
            addLaneFloorTint(scene, 'outlaneFloorTint' + laneDef.side, outlaneFloorMat, 0.055, Math.abs(LANE_Z_TOP_M - LANE_Z_BOTTOM_M) - 0.012, mirror * OUTLANE_TRIGGER_X_M, dividerCenterZ);
            addLaneFloorTint(scene, 'inlaneFloorTint' + laneDef.side, inlaneFloorMat, 0.05, 0.06, mirror * INLANE_TRIGGER_X_M, LANE_TRIGGER_Z_M);

            // Inlane/outlane rollover triggers, each with its own indicator lamp insert. The lamp
            // (a flat disc, like a real backlit playfield insert) is the lane's only always-visible
            // presence - the trigger box itself has no real-pinball shape of its own, so it stays
            // invisible in normal play and only renders (translucent, color-coded) when ?dev=1, to
            // make the actual hitbox extent inspectable during development.
            [
                { kind: 'inlane', x: mirror * INLANE_TRIGGER_X_M, debugColor: new BABYLON.Color3(0.2, 1, 0.4) },
                { kind: 'outlane', x: mirror * OUTLANE_TRIGGER_X_M, debugColor: new BABYLON.Color3(1, 0.2, 0.3) }
            ].forEach((laneKind) => {
                // Visual-polish pass (user-requested - "clear visual separation between inlanes/
                // outlanes/orbits"): inlane and outlane used to share one identity color
                // (COLOR_LANE_LAMP for both) - now each kind gets its own, matching the debugColor
                // split just above that already existed for the dev-only trigger overlay.
                const laneLampColor = laneKind.kind === 'outlane' ? COLOR_OUTLANE_LAMP : COLOR_LANE_LAMP;
                const lampMat = new BABYLON.PBRMaterial(laneKind.kind + 'LampMat' + laneDef.side, scene);
                // One symbol per family, not one arrow for both. These two lanes sit side by side
                // and mean opposite things - an inlane returns the ball to a flipper, an outlane
                // loses it - and until this pass they carried the SAME down-arrow, leaving colour
                // as the only thing distinguishing "safe" from "drain". The inlane gets a double
                // chevron (return / flow), the outlane a bold X (danger / void), which is the one
                // symbol in the set with no curve and no vertical axis.
                styleInsertLampMat(lampMat, laneLampColor,
                    laneKind.kind === 'outlane' ? insertLensTextures.void : insertLensTextures.flow);
                // Lane insert skin slot (visual-architecture pass, user-requested) - shared per
                // kind (inlane/outlane), both sides. Emissive, not albedo, matching the lamp
                // system's own emissive-only on/off convention (registerLamp() in main()) - a
                // loaded texture would only ever show up multiplied by however lit this lamp
                // currently is, never override that state. No-op until the matching
                // assets/skins/lanes/lane-insert-<kind>.png actually exists (see SKINS.md).
                applySkinTexture(scene, lampMat, laneKind.kind === 'outlane' ? SKIN_MANIFEST.laneInsertOutlane : SKIN_MANIFEST.laneInsertInlane);
                const lamp = addPlayfieldInsert(scene, laneKind.kind + 'Lamp' + laneDef.side,
                    lampMat, insertCollarMat, LANE_TRIGGER_WIDTH_M * 0.6, laneKind.x, LANE_TRIGGER_Z_M);
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
        kickbackLampMat.emissiveColor = COLOR_KICKBACK_LAMP.scale(0.12); // faint glow at rest, lit when earned (see setKickbackLampLit() in main())
        // Rings, not an arrow: this lamp marks an earned STATE ("your kickback is armed"), not a
        // lane to shoot, and it sits a few centimetres from the outlane's own arrow insert where
        // a second arrow would just read as more of the same lane.
        styleInsertLampMat(kickbackLampMat, COLOR_KICKBACK_LAMP, insertLensTextures.ring);
        const kickbackLampMesh = addPlayfieldInsert(scene, 'kickbackLamp', kickbackLampMat,
            insertCollarMat, LANE_TRIGGER_WIDTH_M * 0.7, kickbackMirror * OUTLANE_TRIGGER_X_M, LANE_Z_BOTTOM_M);

        // BALL SAVE lamp (fairness mechanics, user-requested) - sits beside the shooter lane, at
        // the ball's own rest spot, so it's the first thing a player sees while charging a
        // launch. Same rest/lit split as every other stateful lamp here (setBallSaveLampLit() in
        // main()).
        const ballSaveLampMat = new BABYLON.PBRMaterial('ballSaveLampMat', scene);
        ballSaveLampMat.emissiveColor = COLOR_BALL_SAVE_LAMP.scale(0.12);
        styleInsertLampMat(ballSaveLampMat, COLOR_BALL_SAVE_LAMP, insertLensTextures.ring); // a state, not a shot - same reasoning as the kickback lamp above
        const ballSaveLampMesh = addPlayfieldInsert(scene, 'ballSaveLamp', ballSaveLampMat,
            insertCollarMat, LANE_TRIGGER_WIDTH_M * 0.7, toWorldX(BALL_REST_X_PX) - 0.035, BALL_REST_Z_M);

        // Upper-lane skill shot (user-requested) - see SKILL_SHOT_LANES' own block comment (near
        // its declaration) for the full geometry reasoning. Same invisible-unless-dev trigger +
        // always-visible lamp insert split as the inlane/outlane rollovers just above; the lamp
        // starts dim/off (armSkillShot()/endSkillShot() in main() toggle it per-ball) since
        // these lanes only matter for the short window right after a launch.
        const skillShotLaneMeshes = [];
        const skillShotLampMeshes = [];
        SKILL_SHOT_LANES.forEach((laneDef, i) => {
            const lampMat = new BABYLON.PBRMaterial('skillShotLampMat' + i, scene);
            lampMat.emissiveColor = COLOR_SKILL_SHOT_LAMP.scale(0.12); // faint glow at rest, like a real backlit-but-unlit insert
            // Up-table arrow: a skill shot is a lane the player aims the launched ball INTO, so
            // here the legend marks the shot, the opposite of the inlane/outlane arrows.
            styleInsertLampMat(lampMat, COLOR_SKILL_SHOT_LAMP, insertLensTextures.up);
            const lamp = addPlayfieldInsert(scene, 'skillShotLamp' + i, lampMat, insertCollarMat,
                laneDef.halfWidth * 2 * 0.5, laneDef.x, SKILL_SHOT_Z_M);
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

        // Upper-table LEFT ORBIT / RIGHT ORBIT shots - see ORBITS' block comment (near its
        // declaration) for the full geometry and the measurements behind it. Each side is a curved
        // channel: an outer guide that is TANGENT to the side wall at its top and sweeps down and
        // inboard from there, a concentric inner guide a constant lane-width inside it, and a
        // straight vertical section carrying the lane up the wall to the upper board.
        //
        // Both guides are built as a chain of short boxes along the arc rather than as one curved
        // mesh, because Havok's static shapes here are boxes and a real curve would need a mesh
        // collider. At ORBIT_ARC_SEGMENTS segments over ORBIT_ARC_SWEEP_RAD the chord-to-arc error
        // is 0.3mm against a 27mm ball - two orders of magnitude under the thing it is guiding, so
        // the ball reads it as a curve. Each box is stretched 4% past its chord so consecutive
        // segments overlap: butted boxes would leave a hairline seam at every joint, and a seam is
        // exactly the kind of edge that catches a rolling ball.
        const ORBIT_RAIL_DEPTH_M = 0.015;
        const ORBIT_RAIL_HALF_DEPTH_M = ORBIT_RAIL_DEPTH_M / 2;
        const orbitLampMeshes = [];
        ORBITS.forEach((orbitDef) => {
            const mirror = orbitDef.mirror;

            // One box spanning two points, using the same empirically-derived rotation convention
            // as every other angled rail in this file (rotationY = atan2(-dz, dx), verified against
            // this Babylon build via mesh.getDirection(Axis.X) rather than assumed).
            const railBox = (name, pa, pb, solid) => {
                const dx = pb.x - pa.x, dz = pb.z - pa.z;
                const len = Math.hypot(dx, dz);
                if (len < 1e-6) return;
                const rotY = Math.atan2(-dz, dx);
                const cx = (pa.x + pb.x) / 2, cz = (pa.z + pb.z) / 2;
                const box = BABYLON.MeshBuilder.CreateBox(name, {
                    width: len * (solid ? 1.04 : 1),
                    height: 0.022,
                    depth: ORBIT_RAIL_DEPTH_M
                }, scene);
                box.position.set(cx, 0.011, cz);
                box.rotation.y = rotY;
                box.material = housingMat;
                box.metadata = { kind: 'wall' }; // reuses the existing generic wall camera-shake/sound feedback, same as the inlane/outlane rails
                new BABYLON.PhysicsAggregate(box, BABYLON.PhysicsShapeType.BOX, { mass: 0, restitution: 0.4, friction: 0.5 }, scene);
                addRailBevel(scene, name + 'Cap', railCapMat, len * 1.04, ORBIT_RAIL_DEPTH_M, cx, 0.022, cz, rotY);
            };

            // Walks one arc from `fromSweep` to `toSweep` at a fixed radius, emitting one box per
            // segment. `radius` is the RAIL'S CENTRE line, not its face - the caller offsets by
            // half the rail's depth so the face lands on the lane boundary it is meant to be.
            const railArc = (name, radius, fromSweep, toSweep) => {
                for (let i = 0; i < ORBIT_ARC_SEGMENTS; i++) {
                    const a = fromSweep + (toSweep - fromSweep) * (i / ORBIT_ARC_SEGMENTS);
                    const b = fromSweep + (toSweep - fromSweep) * ((i + 1) / ORBIT_ARC_SEGMENTS);
                    railBox(name + i, orbitArcPoint(mirror, radius, a), orbitArcPoint(mirror, radius, b), true);
                }
            };

            // OUTER guide. Its body sits OUTBOARD of its face (a larger radius is further from the
            // construction centre, which is inboard of the whole arc), so at the tangency point the
            // box overlaps the side wall it is tangent to - deliberately, so there is no seam there
            // for a ball riding the wall to catch on. Overlapping static colliders are already the
            // norm on this board (leftSlant/leftWall, every divider and its posts).
            // Built in two pieces with a gap across the shooter lane's exit path - see
            // ORBIT_OUTER_GAP_FROM_RAD for the measurement that put it there and the deflector that
            // was tried and discarded first.
            const outerRailRadius = ORBIT_ARC_RADIUS_M + ORBIT_RAIL_HALF_DEPTH_M;
            railArc('orbitRail' + orbitDef.side + 'OuterUpper', outerRailRadius, 0, ORBIT_OUTER_GAP_FROM_RAD);
            if (ORBIT_OUTER_FLANK_SIDES.includes(orbitDef.side)) {
                railArc('orbitRail' + orbitDef.side + 'OuterLower', outerRailRadius, ORBIT_OUTER_GAP_TO_RAD, ORBIT_ARC_SWEEP_RAD);
            }

            // INNER guide, concentric, stopping short of the outer one so the lane's mouth flares.
            const innerFaceRadius = ORBIT_ARC_RADIUS_M - ORBIT_LANE_WIDTH_M;
            const innerRailRadius = innerFaceRadius - ORBIT_RAIL_HALF_DEPTH_M;
            railArc('orbitRail' + orbitDef.side + 'Inner',
                innerRailRadius, 0, ORBIT_INNER_SWEEP_RAD);

            // Straight vertical section, carrying the lane up the wall. It starts exactly where the
            // inner arc's tangency point is, so guide and section are one continuous surface.
            const innerTop = orbitArcPoint(mirror, innerRailRadius, 0);
            railBox('orbitRail' + orbitDef.side + 'Upper',
                { x: innerTop.x, z: innerTop.z }, { x: innerTop.x, z: ORBIT_RAIL_TOP_Z_M }, false);

            // Inner lip on the lower half of the top turn - see ORBIT_TOP_LIPS for the exit probe
            // that put it here and every clearance it was checked against. Starts 2mm inside the
            // vertical section so the two are one continuous face with no seam at the joint.
            const topLip = ORBIT_TOP_LIPS.find((l) => l.side === orbitDef.side);
            if (topLip) {
                railBox('orbitTopLip' + orbitDef.side,
                    { x: innerTop.x, z: ORBIT_RAIL_TOP_Z_M - 0.002 },
                    { x: innerTop.x - mirror * topLip.inboard, z: topLip.toZ }, false);
            }

            // Lane floor tint (visual-polish pass, user-requested) - see addLaneFloorTint()'s own
            // comment. Painted on the lane's own CENTRE line so it follows the ball's path rather
            // than either rail, which is what makes the corridor read as a route at a glance.
            const laneRadius = ORBIT_ARC_RADIUS_M - ORBIT_LANE_WIDTH_M / 2;
            for (let i = 0; i < ORBIT_ARC_SEGMENTS; i++) {
                const a = (ORBIT_ARC_SWEEP_RAD * i) / ORBIT_ARC_SEGMENTS;
                const b = (ORBIT_ARC_SWEEP_RAD * (i + 1)) / ORBIT_ARC_SEGMENTS;
                const pa = orbitArcPoint(mirror, laneRadius, a), pb = orbitArcPoint(mirror, laneRadius, b);
                const dx = pb.x - pa.x, dz = pb.z - pa.z, len = Math.hypot(dx, dz);
                addLaneFloorTint(scene, 'orbitFloorTint' + orbitDef.side + i, orbitFloorMat,
                    0.03, len * 1.04, (pa.x + pb.x) / 2, (pa.z + pb.z) / 2, Math.atan2(-dz, dx));
            }
            const laneTop = orbitArcPoint(mirror, laneRadius, 0);
            addLaneFloorTint(scene, 'orbitFloorTint' + orbitDef.side + 'Upper', orbitFloorMat,
                0.03, ORBIT_RAIL_TOP_Z_M - laneTop.z, laneTop.x, (laneTop.z + ORBIT_RAIL_TOP_Z_M) / 2, Math.PI / 2);

            // TOP ARC - see ORBIT_TOP_ARC_RADIUS_M for what it is for. Tangent to the side wall where
            // the vertical section ends, sweeping inboard and up, and OUTER-ONLY: the inboard side
            // of the turn is deliberately left open so a ball can leave it early into the bumper
            // nest instead of being committed to crossing the top.
            //
            // Same chain-of-boxes construction as the entry arc, at 9 degrees per segment. The rail
            // body sits OUTBOARD of its face (a larger radius is further from the construction
            // centre), so near the tangency point it overlaps the side wall - which is what leaves
            // no seam there for a ball riding the wall to catch on.
            for (let i = 0; i < ORBIT_TOP_ARC_SEGMENTS; i++) {
                const a = (ORBIT_TOP_ARC_SWEEP_RAD * i) / ORBIT_TOP_ARC_SEGMENTS;
                const b = (ORBIT_TOP_ARC_SWEEP_RAD * (i + 1)) / ORBIT_TOP_ARC_SEGMENTS;
                railBox('orbitTopArc' + orbitDef.side + i,
                    orbitTopArcPoint(mirror, ORBIT_TOP_ARC_RADIUS_M + ORBIT_RAIL_HALF_DEPTH_M, a),
                    orbitTopArcPoint(mirror, ORBIT_TOP_ARC_RADIUS_M + ORBIT_RAIL_HALF_DEPTH_M, b), true);
            }
            // Floor tint along the turn, on the ball's own side of the arc rather than under it, so
            // the corridor reads as a route across the top the way the lanes below it do.
            for (let i = 0; i < ORBIT_TOP_ARC_SEGMENTS; i++) {
                const a = (ORBIT_TOP_ARC_SWEEP_RAD * i) / ORBIT_TOP_ARC_SEGMENTS;
                const b = (ORBIT_TOP_ARC_SWEEP_RAD * (i + 1)) / ORBIT_TOP_ARC_SEGMENTS;
                const pa = orbitTopArcPoint(mirror, ORBIT_TOP_ARC_RADIUS_M - ORBIT_LANE_WIDTH_M / 2, a);
                const pb = orbitTopArcPoint(mirror, ORBIT_TOP_ARC_RADIUS_M - ORBIT_LANE_WIDTH_M / 2, b);
                const dx = pb.x - pa.x, dz = pb.z - pa.z, len = Math.hypot(dx, dz);
                addLaneFloorTint(scene, 'orbitTopTint' + orbitDef.side + i, orbitFloorMat,
                    0.03, len * 1.04, (pa.x + pb.x) / 2, (pa.z + pb.z) / 2, Math.atan2(-dz, dx));
            }

            // Entrance/completion rollover triggers, each with its own indicator lamp insert -
            // same invisible-trigger/always-visible-lamp split as the inlane/outlane rollovers,
            // colored with the orbits' own distinct HEX_ORBIT_LAMP identity (see its comment).
            // Both rollovers sit on the lane's own centre line, derived from the same arc the rails
            // are built from - so they cannot drift out of the lane when the arc is retuned, which
            // is exactly how the previous straight-rail version ended up with a completion trigger
            // above anything a real shot could reach.
            const entrancePos = orbitArcPoint(mirror, laneRadius, ORBIT_ENTRANCE_SWEEP_RAD);
            [
                { kind: 'orbitEntrance', x: entrancePos.x, z: entrancePos.z, debugColor: new BABYLON.Color3(0.3, 0.8, 1) },
                { kind: 'orbitCompletion', x: laneTop.x, z: ORBIT_COMPLETION_Z_M, debugColor: new BABYLON.Color3(1, 0.9, 0.2) }
            ].forEach((triggerDef) => {
                const lampMat = new BABYLON.PBRMaterial(triggerDef.kind + 'LampMat' + orbitDef.side, scene);
                // Up-table arrow on both orbit inserts: an orbit is a shot you drive UP the lane,
                // and the entrance insert marking that direction is the cue a player reads when
                // deciding whether to take it.
                // Cycle ring, not the skill shot's up-arrow. An orbit is a loop the ball travels
                // around and back, which the skill-shot arrow said nothing about - and sharing that
                // arrow made two unrelated shot types look like the same call to action.
                styleInsertLampMat(lampMat, COLOR_ORBIT_LAMP, insertLensTextures.cycle);
                // Lane insert skin slot (visual-architecture pass, user-requested) - shared by
                // both orbit trigger kinds (entrance/completion) and both sides, same emissive-
                // over-the-lamp-system reasoning as the inlane/outlane inserts above. No-op until
                // assets/skins/lanes/lane-insert-orbit.png actually exists (see SKINS.md).
                applySkinTexture(scene, lampMat, SKIN_MANIFEST.laneInsertOrbit);
                const lamp = addPlayfieldInsert(scene, triggerDef.kind + 'Lamp' + orbitDef.side,
                    lampMat, insertCollarMat, ORBIT_TRIGGER_WIDTH_M * 0.6, triggerDef.x, triggerDef.z);
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
        // Darker than before (0.02,0,0.05 -> near black) so the throat below actually reads as a
        // depth gradient. A well floor that is already lit has nothing for a funnel to be darker
        // than, which is what made the old gate read as a flat marker with a ring around it.
        wellMat.albedoColor = new BABYLON.Color3(0.008, 0, 0.018);
        wellMat.metallic = 0.1;
        wellMat.roughness = 0.6;
        well.material = wellMat;

        // Portal throat - a cone widening upward from the well floor to the collar, giving the
        // gate an actual inside. This is the piece that turns "a disc with a ring on it" into
        // "a hole you could drop a ball into" from a fixed camera that can never look down it:
        // the cone's inner wall catches light along a curve, so the eye reads a depth cue rather
        // than a silhouette. Decorative only - no PhysicsAggregate, like the ring and the well,
        // so nothing here can touch the verified clearances the guard posts define.
        const throat = BABYLON.MeshBuilder.CreateCylinder('visionGateThroat', {
            diameterTop: VISION_GATE_COLLAR_RADIUS_M * 2.05,
            diameterBottom: VISION_GATE_COLLAR_RADIUS_M * 1.7,
            height: 0.016,
            tessellation: 24,
            sideOrientation: BABYLON.Mesh.DOUBLESIDE // seen from outside AND down the inside
        }, scene);
        throat.position.set(VISION_GATE_POS.x, 0.001, VISION_GATE_POS.z);
        const throatMat = new BABYLON.PBRMaterial('visionGateThroatMat', scene);
        throatMat.albedoColor = new BABYLON.Color3(0.05, 0.012, 0.08);
        throatMat.metallic = 0.25;
        throatMat.roughness = 0.42;
        // The faintest inner glow, an order of magnitude below the rim ring. This is the bottom of
        // the gate's emissive hierarchy and it is meant to be barely-there: it says "something is
        // lit down there" without competing with the rim that defines the portal's edge.
        throatMat.emissiveColor = COLOR_VISION_GATE.scale(0.07);
        throat.material = throatMat;

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

        // Outer collar - a second, wider, DIMMER torus outside the rim ring. Two concentric rings
        // at different brightnesses is what gives a flat table fixture an apparent depth: the eye
        // reads the bright inner rim as the portal's mouth and the dim outer band as the housing
        // it is set into, which a single ring can only ever say is "a circle drawn on the floor".
        // Deliberately the DIMMEST lit element here (0.13 against the rim's 0.4) - it is structure,
        // not signal, and the emissive hierarchy this pass establishes runs
        // throat 0.07 < collar 0.13 < rim 0.40 < halo 0.30(spectral) < beacon 0.55.
        // Tessellation 16, not the 28 this started at. A torus costs tessellation-squared
        // triangles and these render about 20px across: measured, 28 cost 1682 triangles to draw
        // a shape whose polygonal edges are sub-pixel either way. 16 is ~550 for the same picture.
        const collar = BABYLON.MeshBuilder.CreateTorus('visionGateCollar', {
            diameter: VISION_GATE_COLLAR_RADIUS_M * 3.35,
            thickness: 0.0042,
            tessellation: 16
        }, scene);
        collar.position.set(VISION_GATE_POS.x, 0.007, VISION_GATE_POS.z);
        collar.rotation.x = Math.PI / 2;
        const collarMat = new BABYLON.PBRMaterial('visionGateCollarMat', scene);
        collarMat.albedoColor = COLOR_VISION_GATE.scale(0.45);
        collarMat.metallic = 0.55;
        collarMat.roughness = 0.3;
        collarMat.emissiveColor = COLOR_VISION_GATE.scale(0.13);
        collar.material = collarMat;

        // Spectral halo - the one moving part of the idle gate. A thin torus tilted off the table
        // plane and rotated slowly about Y, so it reads as energy circling the mouth rather than
        // as another static ring. Tilted deliberately: a flat ring spinning about its own axis is
        // invisible (a circle of revolution maps to itself), so the tilt is what makes the motion
        // legible at all from a fixed camera.
        //
        // This is the whole of the "subtle rotating energy" budget - one mesh, one rotation write
        // per frame in updateVisionGateIdle(), and NO particle system. An idle emitter running
        // forever on a fixture the ball visits a few times a game is exactly the constant particle
        // spam this pass was asked to avoid; the particles stay where they earn their cost, on the
        // capture itself.
        // Performance tier (user-requested): the halo is the one purely-ambient piece of this
        // fixture - it carries no state, marks no shot, and exists only to make an idle gate feel
        // alive - so it is also the one piece a low-tier device can simply not have. Skipping it
        // there drops a mesh, a material and the per-frame rotation/colour writes in
        // updateVisionGateIdle(), which no-ops cleanly on a null halo. Everything that carries
        // MEANING - the rim, collar, throat, beacon, and the whole capture sequence - is built on
        // every tier, because dropping those would change what the board tells the player.
        const halo = detectHighFidelity() ? BABYLON.MeshBuilder.CreateTorus('visionGateHalo', {
            diameter: VISION_GATE_COLLAR_RADIUS_M * 2.15,
            thickness: 0.0028,
            tessellation: 16
        }, scene) : null;
        if (halo) {
            halo.position.set(VISION_GATE_POS.x, 0.016, VISION_GATE_POS.z);
            halo.rotation.x = Math.PI / 2 - 0.38; // tilted off the table plane so the spin reads
            const haloMat = new BABYLON.PBRMaterial('visionGateHaloMat', scene);
            haloMat.albedoColor = new BABYLON.Color3(0, 0, 0); // unlit: this is energy, not a surface
            haloMat.metallic = 0;
            haloMat.roughness = 1;
            haloMat.emissiveColor = COLOR_VISION_GATE.scale(0.30);
            haloMat.alpha = 0.85;
            halo.material = haloMat;
        }

        // Vertical light beacon - a thin, tall emissive-only spire standing up from the gate,
        // reading clearly against the open dark sky above the table instead of competing with
        // the crowded playfield at the gate's own height. Same material/color-cycle target as the
        // ring (see startVisionGateCapture()) - between the two, the gate is identifiable from
        // across the whole board, not just up close.
        // Reworked from a flat-topped solid cylinder into a tapered shaft that fades out. The old
        // one measured (board-graphics audit) as a 7x130px hard-edged bar punching through Saturn
        // and 50px above the top rail into empty starfield - a beam of light that ends in a
        // straight cut across the sky reads as a missing polygon, not as light.
        //
        // Three changes, all presentation: the height comes down 0.16 -> 0.115 so the shaft stays
        // over the board instead of running off the top of the frame; diameterTop narrows to a
        // near-point so it tapers; and createGateBeaconTexture()'s vertical gradient carries the
        // brightness AND the alpha, so it actually dissolves at its far end. backFaceCulling off
        // because a translucent shaft seen from outside should show its far wall through its near
        // one - that is what gives a volumetric beam its density.
        const beacon = BABYLON.MeshBuilder.CreateCylinder('visionGateBeacon', {
            diameterTop: 0.0016,
            diameterBottom: 0.0092,
            height: 0.115,
            tessellation: 14
        }, scene);
        beacon.position.set(VISION_GATE_POS.x, 0.0575, VISION_GATE_POS.z);
        const beaconMat = new BABYLON.PBRMaterial('visionGateBeaconMat', scene);
        beaconMat.albedoColor = new BABYLON.Color3(0, 0, 0); // unlit: this is light, not a surface
        beaconMat.metallic = 0;
        beaconMat.roughness = 1;
        beaconMat.emissiveColor = COLOR_VISION_GATE.scale(0.62);
        beaconMat.emissiveTexture = createGateBeaconTexture(scene);
        beaconMat.opacityTexture = beaconMat.emissiveTexture; // same curve drives the fade-out
        beaconMat.alpha = 0.72;
        beaconMat.backFaceCulling = false;
        beacon.material = beaconMat;
        ring.material = visionGateMat;

        // 3 guard posts (left/right/far), deliberately leaving the near (-Z, bumper-cluster-
        // facing) side open as the shot's approach mouth - the same "raised back and sides, open
        // front" shape a real scoop has. Real physics (cylinders, unlike the ring above), so a
        // near-miss clips one and bounces away instead of sailing through untouched. Feedback
        // reuses the existing generic 'wall' handling, same as every other guide rail/post added
        // in earlier features.
        //
        // Trap fix, measured (qa/ball-trap-audit.js): the far post used to sit at exactly one
        // collar radius up-table, putting it 28.3mm from each side post. A ball cannot pass
        // through a 28.3mm centre-to-centre gap between two 9mm posts (19.3mm of daylight), so it
        // came to rest OUTSIDE the horseshoe, touching both and held there by the tilt - the board
        // caught 8 of 262 seeded balls in that single V, and the pre-refactor board had the same
        // pocket at its own gate (2 balls, its worst cluster). The threshold is geometric, not a
        // tuning value: a ball rests stably in the outside V of two posts whenever their centres
        // are closer than 2 x (ball radius + post radius) = 36mm. Pushing the far post to 1.75
        // radii opens that pair to 40.3mm, past the threshold with margin, so a ball rolls between
        // them instead of parking on them. The side posts and the capture trigger are untouched,
        // and 1.75 (not more) is what keeps the far post clear of the bumper row above it.
        const GATE_FAR_POST_RADII = 1.75;
        [
            { x: VISION_GATE_POS.x - VISION_GATE_COLLAR_RADIUS_M, z: VISION_GATE_POS.z },
            { x: VISION_GATE_POS.x + VISION_GATE_COLLAR_RADIUS_M, z: VISION_GATE_POS.z },
            { x: VISION_GATE_POS.x, z: VISION_GATE_POS.z + VISION_GATE_COLLAR_RADIUS_M * GATE_FAR_POST_RADII }
        ].forEach((postPos, i) => {
            const post = BABYLON.MeshBuilder.CreateCylinder('visionGatePost' + i, {
                diameter: 0.009,
                height: 0.026
            }, scene);
            post.position.set(postPos.x, 0.013, postPos.z);
            // Rubber-sleeved. These three ARE the scoop's collar - the surfaces that decide whether
            // a shot is captured or thrown back - and the previous commit's measurements lean on
            // them scattering a miss back toward an inlane. Restitution 0.5, the liveliest of the
            // board's rubber, which is what that scattering is. Drawn as rubber so the collar reads
            // as the thing it is.
            dressPostAsRubber(post, 0.009, 0.0265);
            post.metadata = { kind: 'wall' };
            new BABYLON.PhysicsAggregate(post, BABYLON.PhysicsShapeType.CYLINDER, { mass: 0, restitution: 0.5, friction: 0.4 }, scene);
        });

        // The lane the shot runs up - see VISION_GATE_APPROACH_TINT. Uses the gate's own violet so
        // the corridor and the collar at the end of it read as one shot.
        addLaneFloorTint(scene, 'visionGateApproachTint', visionGateApproachMat,
            VISION_GATE_APPROACH_TINT.width, VISION_GATE_APPROACH_TINT.length,
            VISION_GATE_APPROACH_TINT.x, VISION_GATE_APPROACH_TINT.z, 0);

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
        //
        // Cabinet/perimeter pass (user-requested): these were housingMat, the same dark near-black
        // metal every bracket and skirt on the board uses, which made the machine's most prominent
        // hardware its least visible. They now share cabinetMetalMat with the wall crowns and the
        // lockdown bar below - one polished chrome for every rail on the cabinet. Looked up by
        // name because buildTable() creates it (it runs first) off the wall footprints those
        // crowns are derived from; a second, separately-written chrome here is exactly the drift
        // this pass exists to remove.
        const cabinetMetalMat = scene.getMaterialByName('cabinetMetalMat') || housingMat;
        [-1, 1].forEach((side) => {
            const rail = BABYLON.MeshBuilder.CreateCylinder('sideRail' + side, {
                diameter: 0.012,
                height: TABLE_LENGTH_M,
                tessellation: 10
            }, scene);
            rail.rotation.x = Math.PI / 2;
            // Raised to sit ON the wall crown buildTable() now adds (which tops out at 0.0445)
            // instead of half-buried in the wall itself, where its lower half was invisible.
            rail.position.set(side * (TABLE_WIDTH_M / 2 - 0.006), WALL_HEIGHT_M + 0.0085, 0);
            rail.material = cabinetMetalMat;
            rail.isPickable = false;
        });

        // The rail across the top of the machine, closing the perimeter. Its absence was why the
        // two side rails read as two loose bars rather than as a frame.
        {
            const topRail = BABYLON.MeshBuilder.CreateCylinder('topRail', {
                diameter: 0.012,
                height: TABLE_WIDTH_M,
                tessellation: 10
            }, scene);
            topRail.rotation.z = Math.PI / 2;
            topRail.position.set(0, WALL_HEIGHT_M + 0.0085, TABLE_LENGTH_M / 2 - 0.006);
            topRail.material = cabinetMetalMat;
            topRail.isPickable = false;
        }

        // Lockdown bar - the chrome bar across the front of every real machine, at the player's
        // own edge. Placed just beyond the apron (z -0.62, depth 0.05, so its near face is at
        // -0.645), which puts this at the frontmost point of the cabinet and nowhere near any
        // playfield geometry. More than any other single piece, this is what makes the near edge
        // read as the front of a machine rather than as where the model stops.
        {
            const lockdown = BABYLON.MeshBuilder.CreateCylinder('lockdownBar', {
                diameter: 0.018,
                height: TABLE_WIDTH_M + 0.012,
                tessellation: 12
            }, scene);
            lockdown.rotation.z = Math.PI / 2;
            lockdown.position.set(0, 0.017, -0.658);
            lockdown.material = cabinetMetalMat;
            lockdown.isPickable = false;
        }

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
        // Lighting/material hierarchy pass (user-requested) - this is cabinet trim, not a lamp
        // or gameplay indicator, so it belongs in the RAILS/STRUCTURE tier: metallic raised
        // (0.1 -> 0.4) and emissive halved (0.6 -> 0.3) so its violet identity reads as a colored
        // metal inlay catching light, not a light source competing with the actual lamps/ball.
        apronTrimMat.emissiveColor = COLOR_CHAKRA[0].scale(0.3);
        apronTrimMat.metallic = 0.4;
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
        // These three were the last rubber on the board that was not real. Each was an 8mm shaft
        // wearing a 16mm rubber ring - the shape a player reads as "this kicks the ball back" - and
        // the file's own comment said so out loud: "Purely cosmetic - unlike every OTHER post in
        // this file, these get no PhysicsAggregate at all". One of them is at (0, -0.31), on the
        // centre spine, and its comment calls it the center post between the flippers. A ball
        // headed down the middle went straight through all three.
        //
        // That is the mismatch this pass exists to remove, so they are now what they look like: a
        // rubber SLEEVE, at exactly the diameter the ring already occupied (0.016 centreline +
        // 0.0025 tube = 0.0185 outer), with a cylinder collider on that same surface. Nothing about
        // the footprint a player already sees has changed - only whether the ball agrees with it.
        //
        // Restitution 0.45 is SLINGSHOT_RESTITUTION, i.e. the value the board's other struck rubber
        // already uses, chosen over the guard posts' 0.5 precisely to keep these quiet: a lone post
        // on the centre spine is the last place that wants a lively bounce.
        // The CENTRE one is gone rather than made real, and that is the interesting half of this.
        // It stood at (0, -0.31): on the spine, 75mm up-table of the flipper tips. Decorative it was
        // harmless. Physical it is a wall across the shooting lane - a cross-table shot from either
        // flipper crosses x 0 at about z -0.30, which is exactly where it stood. Measured on the
        // 174-shot fan with it solid: the median shot's apex collapsed from z -0.098 to -0.262,
        // orbit entrances fell 35 -> 27, mission targets 21 -> 18 and bumpers 24 -> 21. It was
        // catching the shots, not the drains.
        //
        // So it could not be made honest by giving it physics, and leaving it drawn would have kept
        // the one piece of fake rubber this pass exists to remove. A post that cannot be real on
        // the centre spine should not be drawn there, so it is deleted. The two flanking posts stay
        // and are now solid: they sit on the slingshots' outer corners, out of every shot line, and
        // rounding those square corners is a real job.
        const DECOR_POST_SLEEVE_M = 0.0185;
        [
            { x: SLINGSHOTS[0].x - 0.03, z: SLINGSHOTS[0].z }, // caps the left slingshot's outer corner
            { x: SLINGSHOTS[1].x + 0.03, z: SLINGSHOTS[1].z } // caps the right slingshot's outer corner
        ].forEach((def, i) => {
            const post = BABYLON.MeshBuilder.CreateCylinder('decorPost' + i, {
                diameter: DECOR_POST_SLEEVE_M,
                height: 0.024,
                tessellation: 12
            }, scene);
            post.position.set(def.x, 0.012, def.z);
            post.metadata = { kind: 'wall' }; // generic wall shake/sound, same as every other post
            new BABYLON.PhysicsAggregate(post, BABYLON.PhysicsShapeType.CYLINDER,
                { mass: 0, restitution: SLINGSHOT_RESTITUTION, friction: 0.4 }, scene);
            dressPostAsRubber(post, DECOR_POST_SLEEVE_M, 0.0245);
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
            // Hierarchy pass: these two little discs measured p90 253 across 1,000 pixels -
            // level with the BALL's 252 across 553, and parked at the busiest point on the board.
            // They are ambient set-dressing (this rule's own comment says so), so they have no
            // business at the top of the hierarchy. 0.35 -> 0.20 emissive.
            insertMat.albedoColor = color.scale(0.24);
            insertMat.emissiveColor = color.scale(0.20);
            insertMat.metallic = 0.1;
            insertMat.roughness = 0.5;
            const insert = BABYLON.MeshBuilder.CreateCylinder('flipperInsert' + mirror, {
                diameterTop: 0.02,
                diameterBottom: 0.02,
                height: 0.002,
                tessellation: 10
            }, scene);
            // Tracks the real hinge (FLIPPER_PIVOT_X_M), not the legacy FLIPPER_GAP_HALF_M datum -
            // this rule's own comment says "at each flipper's base", and the base moved outboard
            // with the real-machine mounting fix; left at the old value these two lamps would sit
            // stranded in the middle of the center drain gap instead.
            insert.position.set(mirror * FLIPPER_PIVOT_X_M, 0.002, FLIPPER_Z_M + 0.02);
            insert.material = insertMat;
        });

        // 7. Labels near important shots - small flat playfield decals (createLabelPlane(), the
        // same DynamicTexture-canvas technique buildBackglass() uses) at the shots most likely to
        // need a name to be understood at a glance: the skill-shot lane bank, the kickback
        // outlane, both orbit entrances, and the Vision Gate. Positioned near, not on top of,
        // each shot's own lamp/trigger geometry so nothing visually overlaps.
        // Table-composition pass (user-requested - "immediate readability... inserts/lights
        // communicating important areas"): this label's original position (SKILL_SHOT_Z_M+0.05 =
        // z=0.07, at the lane's own x=0.08) sat almost exactly on top of what was then
        // BUMPER_CLUSTER[2] at (0.08, 0.06) - confirmed via screenshot, the bumper's raised cap
        // occluded half the text from this game's fixed low camera angle. Pulled forward (toward
        // the camera) and lifted slightly - same "read against open space, not crowded geometry"
        // fix as visionGateBeacon's own comment below.
        //
        // The shot-corridor refactor has since moved that whole cluster to a row at z=0.325, so
        // the bumper this dodged is no longer there. The position is KEPT anyway: pulled forward
        // it now sits at the mouth of the right corridor, ahead of the power-up orb's new spot at
        // (0.075, 0.080), which is exactly where a "SKILL SHOT" callout wants to be read from.
        const skillShotLabel = createLabelPlane(scene, 'SKILL SHOT', SKILL_SHOT_LANES[1].x, SKILL_SHOT_Z_M - 0.06, '#ff3366');
        skillShotLabel.position.y = 0.05;
        createLabelPlane(scene, 'KICKBACK', kickbackMirror * OUTLANE_TRIGGER_X_M, LANE_Z_BOTTOM_M - 0.03, '#ff5500');
        // Subtle emissive lane-flow markers (visual-polish pass, user-requested) - unlike every
        // label above, these use createLabelPlane()'s transparent option (no background chip) and
        // a plain triangle glyph instead of a word, so they read as a small glowing flow cue next
        // to each lamp rather than another named callout - inlane/outlane had no signage of their
        // own at all before this (only the plain lamp disc). Up for inlane ("flows back into
        // play"), down for outlane ("heads toward the drain") - the same safe/risky read a real
        // machine's lane position already implies, just made explicit at a glance. Positioned a
        // little toward LANE_Z_TOP_M from each lamp so the two don't overlap.
        SIDE_LANES.forEach((laneDef) => {
            const markerZ = LANE_TRIGGER_Z_M + 0.045;
            createLabelPlane(scene, '▲', laneDef.mirror * INLANE_TRIGGER_X_M, markerZ, '#ffaa00', { transparent: true, fontSize: 26, planeSize: 0.03 });
            createLabelPlane(scene, '▼', laneDef.mirror * OUTLANE_TRIGGER_X_M, markerZ, '#ff1a33', { transparent: true, fontSize: 26, planeSize: 0.03 });
        });
        ORBITS.forEach((orbitDef) => {
            // Side-specific text (not a shared 'ORBIT' label for both) - doubles as telling the
            // two orbits apart at a glance and keeps each label's mesh/texture name unique.
            const orbitLabel = orbitDef.side === 'left' ? 'L ORBIT' : 'R ORBIT';
            // Placed IN the lane rather than below its mouth. At the mouth (z=-0.17) the label sits
            // close to this game's fixed low camera and renders large and bright - measured at p90
            // 170 against the flippers' 128, which breaks the board's own hierarchy rule that
            // signage must never outshine the hardware (qa/visual-hierarchy.js). Moving it 190mm
            // further up-table costs nothing in legibility and puts it back under that bar, and it
            // reads better anyway: the name sits on the route, not in front of it.
            const labelAt = orbitArcPoint(orbitDef.mirror, ORBIT_ARC_RADIUS_M - ORBIT_LANE_WIDTH_M / 2, 8 * Math.PI / 180);
            createShotGlyph(scene, orbitDef.side === 'left' ? SHOT_GLYPH.orbitLeft : SHOT_GLYPH.orbitRight,
                labelAt.x, labelAt.z, '#33ccff');
        });
        // Table-composition pass (user-requested) - the original placement (pulled TOWARD the
        // bumper cluster, z = gate_z - 0.045) sat only ~0.03m from the boss bumper's own center,
        // close enough that the bumper's raised cap visually occluded the leading "VI" from this
        // game's fixed camera angle (confirmed via screenshot). Flipped to the far side of the
        // gate instead (+ offset, away from the crowded bumper cluster) and lifted, so it reads
        // clearly against open playfield the way visionGateBeacon already does against open sky.
        //
        // Game-feel review follow-up: that fix's own +Z offset (toward Saturn's own end of the
        // table) landed the label well inside Saturn's ring radius (SATURN_RADIUS_M*3.5/2 =
        // 0.079m, vs. the ~0.05m this put between them) - confirmed via screenshot, the leading
        // "V" was occluded by the ring the same way the bumper cap used to occlude it. Both
        // Saturn and the bumper cluster sit near the table's own centerline (x~=0); pushing the
        // label sideways (+X, away from centerline) instead of fore/aft clears both without
        // reopening the original bumper-cap problem this same line already solved once.
        // SHOT-CORRIDOR REFACTOR: both obstacles this offset was dodging have moved - the bumper
        // cluster is now a row up at z=0.325 and Saturn dropped to z=0.205 - and the gate itself
        // moved to the left corridor. Re-solved against the new positions rather than kept: a
        // sideways offset from the gate now lands either inside Saturn's ring radius (0.079m) or
        // on the mission target bank that shares the gate's approach, so the label moves DOWN the
        // gate's own lane instead, into open mid-table where nothing overlaps it and it reads as a
        // callout for the shot rather than a tag on the hole. Down-table, not up: the gate ended up
        // on the centre line at z=0.060 and an up-table offset put the text behind the collar's own
        // raised beacon.
        const visionGateLabel = createShotGlyph(scene, SHOT_GLYPH.visionGate, VISION_GATE_POS.x, VISION_GATE_POS.z - 0.075, '#cc66ff');
        visionGateLabel.position.y = 0.045;

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
            trim.material = cabinetMetalMat; // was housingMat - see the side rails' own comment
            trim.isPickable = false;
        });
        const topTrim = BABYLON.MeshBuilder.CreateBox('cabinetTopTrim', {
            width: TABLE_WIDTH_M + 0.04,
            height: 0.01,
            depth: 0.01
        }, scene);
        topTrim.position.set(0, 0.005, TABLE_LENGTH_M / 2 + 0.014);
        topTrim.material = cabinetMetalMat;
        topTrim.isPickable = false;

        // ===================================
        // Table-composition pass (user-requested - "distinct upper/middle/lower table regions...
        // visual rails leading the eye toward shots... clear ball pathways"): classic pinball
        // tables (the doc's own Space-Cadet-style reference) read as three zones at a glance - a
        // tight lower flipper zone, an open mid-table shooting gallery, and a further upper bank
        // of targets/features - usually communicated with paint, ramps, or light rails marking
        // the transitions, and often a visible "lane" cueing the ball's main path from the upper
        // features back down to the flippers. SPIRITBALL has no ramps/paint to add either of
        // those with, but it does already have a cosmic identity to draw on: a "constellation
        // threshold" - a loose scatter of small flush starlight-colored inserts, no two evenly
        // spaced, crossing the table at each zone boundary - reads as a deliberate cosmic dressing
        // choice (not a technical ruled line) while still doing the same visual job a rope-light
        // divider would on a physical machine. Purely decorative: flush with the playfield (same
        // paper-thin/no-collision treatment as addLaneFloorTint()'s films), so nothing here can
        // ever touch the ball physically, and nothing existing moved to make room for it.
        // ===================================
        const constellationMat = makeLaneFloorMat('constellationMat', new BABYLON.Color3(0.78, 0.74, 1), 0.85);

        function addConstellationDot(name, x, z, diameter) {
            const dot = BABYLON.MeshBuilder.CreateCylinder(name, { diameter, height: 0.001, tessellation: 8 }, scene);
            dot.position.set(x, 0.0015, z);
            dot.material = constellationMat;
            return dot;
        }

        // Zone thresholds: lower/mid boundary sits just above the slingshots (LANE_Z_TOP_M=-0.33)
        // and below the open mid-table, marking "the flipper zone starts here"; mid/upper sits
        // just below the mission-target bank's nearest point and the bumper cluster's own top
        // (z=0.16), marking the gateway into the crowded upper-table feature bank. Both scatter
        // across most of the table's own inner width (TABLE_WIDTH_M/2 minus wall clearance), with
        // per-dot jitter in Z/size so the line reads as a loose star-field, not a ruled boundary.
        [
            { name: 'zoneThresholdLower', z: -0.20, count: 9 },
            { name: 'zoneThresholdUpper', z: 0.195, count: 9 }
        ].forEach((zone) => {
            const xHalf = TABLE_WIDTH_M / 2 - 0.05;
            for (let i = 0; i < zone.count; i++) {
                const t = i / (zone.count - 1);
                const x = -xHalf + t * xHalf * 2;
                const z = zone.z + (Math.random() - 0.5) * 0.024;
                const size = 0.005 + Math.random() * 0.007;
                addConstellationDot(zone.name + i, x, z, size);
            }
        });

        // Central ball-pathway cue ("clear ball pathways... functional geometry should visually
        // communicate where the player should shoot"): the open lane between the bumper cluster's
        // lowest point (z~-0.02) and the flipper zone threshold above is the table's single
        // biggest dark, unmarked area - the ball's main return path from every upper shot funnels
        // through here. A faint vertical scatter down the center (low alpha, well under the lane
        // floor tints' own 0.14-0.16, so it never competes with the playfield artwork underneath
        // it) traces that path without implying a new physical lane or gameplay meaning.
        {
            const pathMat = makeLaneFloorMat('centerPathMat', new BABYLON.Color3(0.78, 0.74, 1), 0.4);
            const pathCount = 8;
            for (let i = 0; i < pathCount; i++) {
                const t = i / (pathCount - 1);
                const z = -0.03 + t * (-0.24); // -0.03 down to -0.27 (just above the lower zone threshold). Was described as "just under the bumper cluster"; since the shot-corridor refactor moved the cluster up to z=0.325 these dots mark the open centre corridor's approach instead - the same run of floor, now genuinely a travel lane rather than the apron under an obstacle.
                const x = (Math.random() - 0.5) * 0.05;
                const dot = addConstellationDot('centerPathDot' + i, x, z, 0.005 + Math.random() * 0.005);
                dot.material = pathMat;
            }
        }

        // Target-bank callout ("visible targets"): MISSION_TARGET_BANK had no signage of its own
        // at all before this - just the 3 flags/header rail, easy to miss as a distinct shot
        // against the busier bumper/orbit cluster next to it. Same text-label convention as
        // L ORBIT/R ORBIT/SKILL SHOT above, placed just outside the bank's own nearest (lowest)
        // target so it doesn't overlap the header rail or any flag.
        {
            // SHOT-CORRIDOR REFACTOR: the old -0.055 X offset pushed the label outboard of the
            // bank, which is now where the left orbit rail runs. Moved to just BELOW the bank -
            // same "outside the bank, clear of the header rail and flags" intent, on the axis that
            // still has room in the left corridor.
            //
            // BANK-AS-A-SHOT PASS: taken off the bank's CENTRE and down its own face normal rather
            // than off whichever entry happens to be last. The old form assumed index 2 was the
            // bank's nearest plate, which was true of a bank running down-table and is not true of
            // one running across it - on this layout it would have hung the label off the far end.
            // Hung off the bank's OUTERMOST plate, and a long way down its face: screenshots from
            // the gameplay camera put the label IN the plate row at both -0.05 off the bank centre
            // (it landed between plates 1 and 2) and -0.045 off plate 0 (it read as a fourth plate
            // at the row's left end), because 45mm of z is only a few pixels at this camera's
            // angle. At -0.070 it clears the row, and sits in open playfield outboard of the
            // approach tint and well left of the Vision Gate.
            const bankOuter = MISSION_TARGET_BANK[0];
            createShotGlyph(scene, SHOT_GLYPH.targets, bankX(bankOuter, 0, -0.070), bankZ(bankOuter, 0, -0.070), '#ff66cc');
        }

        // Saturn callout. The board's biggest scoring object was the only major feature with no
        // signage at all - L ORBIT, R ORBIT, SKILL SHOT, VISION GATE and TARGETS all name
        // themselves and Saturn did not, which is half of what "obvious" means for a premium shot.
        // Placed beside the mouth's right jaw rather than below it: the corridor under Saturn is
        // only ~65mm of clear playfield between the Vision Gate's upper post and Saturn's
        // underside, and a label in it would sit on the approach tint and under the VISION GATE
        // callout already there. Out to the right it has open board to itself.
        {
            createShotGlyph(scene, SHOT_GLYPH.saturn, SATURN_JAW.to.x + 0.030, SATURN_JAW.to.z + 0.020, '#ffb347');
            // COMET, up its own lane and outboard of the tint, where the only thing nearby is the
            // right orbit rail. Kept above the SATURN callout in z so the two read as labels on two
            // different corridors rather than as one row of text across the middle of the board.
            createShotGlyph(scene, SHOT_GLYPH.comet, 0.138, 0.168, '#66e0ff');
        }

        // Returned so main() can attach Stage 8's chakra-sparkle particle systems, animate
        // Saturn's rings every frame, drive the power-up orb's spawn/despawn cycle, run the
        // Vision Gate's own capture sequence against a direct mesh reference (the ring, not the
        // trigger - the ring is what's actually visible and worth flashing/sparkling), and
        // register every lamp mesh (sideLaneLampMeshes/orbitLampMeshes: {id, mesh} pairs, the rest:
        // plain mesh arrays/refs) against the centralized lamp system (see createLampSystem()).
        return {
            missionTargetMeshes, missionTargetLamps, reentryLaneMeshes, skillShotLaneMeshes, skillShotLampMeshes,
            sideLaneLampMeshes, orbitLampMeshes, debugTriggerMeshes,
            kickbackLampMesh, ballSaveLampMesh, saturnRings, saturnRim, cometTailMeshes, powerUpMesh, visionGateMesh: ring,
            visionGateHalo: halo, visionGateCollarMesh: collar, visionGateThroat: throat, visionGateBeacon: beacon
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
        COLOR_OUTLANE_LAMP = hexToColor3(HEX_OUTLANE_LAMP);
        COLOR_ORBIT_LAMP = hexToColor3(HEX_ORBIT_LAMP);
        COLOR_SKILL_SHOT_LAMP = hexToColor3(HEX_SKILL_SHOT_LAMP);
        COLOR_BALL_SAVE_LAMP = hexToColor3(HEX_BALL_SAVE_LAMP);
        COLOR_KICKBACK_LAMP = hexToColor3(HEX_KICKBACK_LAMP);
        COLOR_VISION_GATE = hexToColor3(HEX_VISION_GATE);
        COLOR_BACKGROUND = hexToColor3(HEX_BACKGROUND);

        // Containment-regression audit fix: without this, Babylon steps physics once per
        // rendered frame using that frame's RAW, unclamped deltaTime (Scene._advancePhysicsEngineStep
        // calls the physics engine's own accumulator loop with the full elapsed time). Under a
        // real frame hitch - confirmed via direct measurement in this exact build,
        // headless-Chromium/swiftshader frames occasionally ran 350-440ms instead of ~16ms - a
        // fast-moving ball's single physics step could span most of the table's length,
        // reproducibly tunneling clean through a wall (and, via repeated/compounding contact
        // resolution against a large backlog in one step, occasionally producing an unstable,
        // energetic bounce that launched the ball through the floor too) at completely ordinary
        // gameplay speeds, not just extreme ones - confirmed as low as 1.7 m/s (MAX_BALL_SPEED_MS)
        // against the side wall, with the ball ending up meters below the table with no recovery
        // path. deterministicLockstep is Babylon's own built-in, bounded fix for exactly this:
        // physics/animation always advance in fixed timeStep (1/60s) increments, capped at
        // lockstepMaxSteps per rendered frame - a bad frame makes the SIMULATION run in slow
        // motion relative to real time (falling behind, never explosively "catching up" in one
        // giant or bursty step), rather than risking tunneling or solver instability. Confirmed
        // via Playwright: the same reproducible wall-tunneling/floor-fall-through scenarios no
        // longer occur with this enabled.
        const engine = new BABYLON.Engine(canvas, true, { deterministicLockstep: true, lockstepMaxSteps: 4, timeStep: 1 / 60 });
        const scene = new BABYLON.Scene(engine);
        scene.clearColor = new BABYLON.Color4(0.02, 0.0, 0.06, 1);

        setStatus('loading Havok WASM…');
        // Stabilization fix: this label must not contain "wasm"/"webassembly"/"simd" - it feeds
        // directly into withTimeout()'s own generated timeout message ("<label> did not finish
        // within Xs"), which is exactly what main()'s outer .catch() below pattern-matches to
        // decide "unsupported device" vs. a generic failure. Confirmed via Playwright: a plain
        // slow-network stall while fetching the Havok WASM (no incompatibility at all) timed out
        // with a message that happened to contain the word "WASM" purely from this label, and
        // was misclassified as "Unsupported device" - telling a player with a slow connection
        // their device/browser can't run the game at all. A genuine WASM/SIMD incompatibility
        // still reaches that branch correctly, since it comes from HavokPhysics() itself
        // rejecting with its own real WebAssembly-engine error message, not from this label.
        const havokInstance = await withTimeout(HavokPhysics(), 20000, 'Havok physics engine load');

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
        const skybox = buildSkybox(scene);

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
            // dimScale raised well above the 0.12 default (first-play readability pass). These
            // lamps now PULSE whenever no vision is running - see syncMissionTargetLamps() below -
            // and a pulse that troughs at the standard 0.12 reads as a lamp cutting out rather
            // than as a target inviting a shot. 0.45 breathes instead of blinking. ON mode is
            // unaffected: that uses litScale, which is untouched.
            // Registered PULSE, not ON, and that is the boot state rather than a default worth
            // overriding later: a fresh game always starts with no vision active, so the very
            // first thing a new player sees is the three targets inviting a shot.
            //
            // Deliberately NOT a syncMissionTargetLamps() call here even though that would read
            // more symmetrically - `mission` is declared further down this same function, so
            // calling the helper at registration time would read it inside its temporal dead zone
            // and throw at boot. Registering the correct starting mode directly avoids needing
            // the helper before the state it reads exists.
            lampSystem.registerLamp('missionTarget' + i, mesh, COLOR_CHAKRA[i % COLOR_CHAKRA.length],
                LAMP_MODE.PULSE, { dimScale: 0.45 });
        });
        obstacles.reentryLaneMeshes.forEach((mesh, i) => {
            lampSystem.registerLamp('reentryLane' + i, mesh, COLOR_MISSION_ACTIVE, LAMP_MODE.OFF);
        });
        obstacles.sideLaneLampMeshes.forEach((entry) => {
            // entry.id is e.g. 'inlaneLeft'/'outlaneRight' - see its own construction in
            // buildObstacles() - so the kind prefix alone is enough to pick the right identity.
            const laneLampColor = entry.id.startsWith('outlane') ? COLOR_OUTLANE_LAMP : COLOR_LANE_LAMP;
            lampSystem.registerLamp(entry.id, entry.mesh, laneLampColor, LAMP_MODE.OFF);
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
        // High-score audit fix: localStorage can THROW synchronously, not just return null - real
        // browsers do this for ANY access (including getItem) when storage is blocked in the
        // current context (a sandboxed/embedded iframe, some private-browsing configurations, a
        // user-disabled storage permission). Confirmed via Playwright: without this try/catch, a
        // throwing localStorage took the entire game down at load with an uncaught SecurityError
        // before a single frame ever rendered - a persistence nicety breaking the whole game. Also
        // validates the parsed value is actually sane (a finite, non-negative integer) rather than
        // just non-NaN - `parseInt('-500', 10) || 0` used to happily accept a corrupted/hand-
        // edited negative value as a real high score. storageAvailable is checked once here and
        // remembered (see writeHighScoreToStorage() below) so a known-broken browser doesn't retry
        // - and risk re-throwing - on every single high score set during the session.
        let highScoreStorageAvailable = true;
        function readHighScoreFromStorage() {
            try {
                const parsed = parseInt(localStorage.getItem(highScoreKey), 10);
                return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
            } catch (e) {
                highScoreStorageAvailable = false;
                return 0;
            }
        }
        function writeHighScoreToStorage(value) {
            if (!highScoreStorageAvailable) return; // already known broken this session - don't retry/re-throw
            try {
                localStorage.setItem(highScoreKey, String(value));
            } catch (e) {
                highScoreStorageAvailable = false;
            }
        }
        backglass.state.highScore = readHighScoreFromStorage();
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
        // Lighting/material hierarchy pass (user-requested - "SPACE BACKGROUND: darkest visual
        // layer"): GlowLayer scans every emissive material in the WHOLE scene automatically,
        // including the skybox - its starfield is itself an emissiveTexture (see buildSkybox()),
        // so without this exclusion every star gets the same soft outward blur/bloom treatment as
        // the actual playfield's lamps/bumpers, turning the backdrop into a hazy glow instead of a
        // crisp, DARK field the illuminated table is meant to visually float in front of. Excluding
        // it here is the one glow-layer-level fix that establishes the space background as its own
        // distinct (darkest, non-glowing) tier, rather than tuning down every individual star's
        // brightness in createStarfieldTexture() and losing the "sparse bright stars" contrast
        // that texture is deliberately built around.
        glowLayer.addExcludedMesh(skybox.far);
        glowLayer.addExcludedMesh(skybox.near); // same reasoning - its stars are already their own light, bloom would only smear them
        glowLayer.addExcludedMesh(skybox.vignette); // a darkening layer has nothing to glow; excluded so it can never be treated as emissive
        // Backglass readability pass (user-requested - "keep text crisp and avoid excessive
        // bloom"): same reasoning as the skybox exclusion directly above, applied to the
        // backglass panel's own DynamicTexture instead. GlowLayer's soft outward blur is tuned
        // for the game's neon playfield elements (bumpers/lamps/rails), not for small, distant
        // text that already loses definition from the panel's own tiny on-screen footprint at
        // real gameplay camera distance (see buildBackglass()'s own comment) - stacking GlowLayer
        // on top turned already-small glyphs into a soft blur instead of a crisp readout. The
        // panel is still bright/emissive and still reads as part of the same lit cabinet (its own
        // colors/contrast do that job now, see buildBackglass()), it just no longer gets the
        // additional per-mesh glow treatment.
        glowLayer.addExcludedMesh(backglass.mesh);
        // Saturn's atmospheric limb shell - see its own comment in buildObstacles() for why. Its
        // whole look depends on an opacity Fresnel that GlowLayer does not honour; bloomed, it
        // becomes a flat warm disc over the planet instead of a rim around it.
        glowLayer.addExcludedMesh(obstacles.saturnRim);
        // The comet's tail cones, for the same reason: GlowLayer blooms an emissive shape across
        // its whole extent, and a long thin cone bloomed along its length stops being a tail and
        // becomes a beam. Their own alpha already gives them the soft edge they need.
        obstacles.cometTailMeshes.forEach((m) => glowLayer.addExcludedMesh(m));
        // Note for anyone reaching for addExcludedMesh() to dim the shot callouts: it does the
        // opposite. Measured on this scene, excluding them made the glyphs themselves BRIGHTER
        // (SKILL SHOT +53%, VISION GATE +18%, TARGETS +15%, KICKBACK +14%) against a run-to-run
        // noise floor of +/-0-2% on static scenery. The halo goes away and the core comes up, so
        // the thing the eye actually lands on gets louder, not quieter. They are dimmed at the
        // source instead - see LABEL_SIGNAGE_EMISSIVE_LEVEL in createLabelPlane().

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
        // peakOpacity is optional and defaults to the 0.5 this had before it existed, so the drain
        // flash below is byte-identical. The ASCENSION beat passes a much lower peak deliberately:
        // a drain can white the screen out because the ball is already gone, but an ascension
        // fires mid-play with the ball still live, and a half-opacity veil over a moving ball is
        // exactly the "affects ball visibility" problem this game keeps guarding against.
        function flashScreen(durationMs, r, g, b, peakOpacity) {
            if (window.SPIRITBALL_reducedMotion) return;
            flashOverlay.style.background = 'rgb(' + (r ?? 255) + ',' + (g ?? 255) + ',' + (b ?? 255) + ')';
            flashOverlay.style.transition = 'none';
            flashOverlay.style.opacity = String(peakOpacity ?? 0.5);
            void flashOverlay.offsetWidth; // force a reflow so the transition below animates from 0.5, not skips straight to 0
            flashOverlay.style.transition = 'opacity ' + durationMs + 'ms ease-out';
            flashOverlay.style.opacity = '0';
        }

        let attractModeActive = true;
        // Own clock rather than reading the render loop's, so the cycle always starts at the
        // first shot regardless of how long boot took.
        let attractElapsedMs = 0;
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
        // used since Stage 4, then an emissive-glass PBR material, now a painted premium bat.
        // See createFlipperBatTextures() for the face itself and the measured UV layout it is
        // drawn against; everything below is the material tuning that face needs.
        //
        // ONE material instance for both bats, unchanged - that plus their identical local-space
        // mesh offset is what makes left/right symmetry structural rather than maintained.
        const flipperMat = new BABYLON.PBRMaterial('flipperMat', scene);
        const flipperBat = createFlipperBatTextures(scene);
        // White, because the bat texture bakes its own colour - the same reason every other
        // textured material in this file (targets, cabinet rails, bumper caps) sets white here.
        // Leaving COLOR_FLIPPER on would multiply the magenta twice and crush the face to mud.
        flipperMat.albedoColor = new BABYLON.Color3(1, 1, 1);
        flipperMat.albedoTexture = flipperBat.albedo;
        // 0.4 -> 0.25 metallic and 0.4 -> 0.3 roughness: a flipper bat is moulded plastic over a
        // metal core, and the old values gave it a half-metal response that flattened the printed
        // face. Tighter roughness is what lets the painted gloss streak actually catch a highlight.
        flipperMat.metallic = 0.25;
        flipperMat.roughness = 0.30;
        // THE BALL-PROMINENCE CHANGE. This was a flat COLOR_FLIPPER.scale(0.5) applied to every
        // pixel of the bat, which is what made it a glowing tube and what threw the bloom halo
        // that the audit found landing on the lane inserts rather than on the flippers. It is now
        // multiplied by an emissive texture that is BLACK over the rubber, low grey over the body
        // and bright only on the eye, hinge collar and keylines - so the mean emissive across the
        // bat falls sharply while the detail that should read still punches. The scalar is raised
        // to 0.62 precisely because the texture removes so much: 0.62 x a mostly-dark map is far
        // less total light than 0.5 x solid white.
        flipperMat.emissiveColor = COLOR_FLIPPER.scale(0.62);
        flipperMat.emissiveTexture = flipperBat.emissive;

        // REAL-MACHINE FLIPPER MOUNTING - see FLIPPER_PIVOT_X_M's "MOUNTING LAYOUT" comment in
        // config.js for the full root-cause story of why the flippers kept "feeling backwards"
        // no matter how the angles were adjusted. Summary: each hinge now sits at the OUTER end
        // (x = +/-FLIPPER_PIVOT_X_M, just inboard of its inlane guide's delivery point) with the
        // bat extending INWARD toward the centerline, tips leaving a ~1.3-ball drain gap at
        // center - the standard layout of every real machine. Previously the hinges sat near the
        // centerline with the bats extending outward (a mirror image), which is why every
        // motion-logic fix "passed" yet still looked wrong.
        //
        // The isLeft flag controls ONLY the angle/motor-sign profile (see createFlipper()'s
        // "Rest angle and mirroring" comment), and the assignment is deliberately crossed: the
        // 25-degree profile (isLeft=false, tip extending toward +X, sweeping up as the angle
        // DECREASES) is exactly what a LEFT-hinged inward-pointing bat needs, and vice versa -
        // see FLIPPER_LEFT_REST_RAD's own SIDE-SWAP NOTE in config.js. Control mapping is
        // unchanged and verified: ArrowLeft/touch-left drives leftFlipper (the physical paddle
        // on the player's left), ArrowRight/touch-right the one on the right.
        const leftFlipper = createFlipper(
            scene, 'leftFlipper',
            new BABYLON.Vector3(-FLIPPER_PIVOT_X_M, FLIPPER_HEIGHT_M / 2, FLIPPER_Z_M),
            false, flipperMat
        );
        const rightFlipper = createFlipper(
            scene, 'rightFlipper',
            new BABYLON.Vector3(FLIPPER_PIVOT_X_M, FLIPPER_HEIGHT_M / 2, FLIPPER_Z_M),
            true, flipperMat
        );
        // Desktop controls: LEFT/RIGHT arrows, matching the existing 2D game's control scheme
        // (archive/release-prompts/14-*.md documents the equivalent touch controls for mobile, which get
        // reconnected to whatever the final flipper API looks like in Stage 11 - keyboard first
        // here since it's needed just to test flippers at all). window-level listeners, not
        // canvas-focused, so no click-to-focus step is needed first.
        window.addEventListener('keydown', (e) => {
            // Input-boundary audit fix: a flip is a BARE arrow press. Ctrl/Meta/Alt + arrow is a
            // browser or OS shortcut the player is aiming at something else entirely (Alt+Left and
            // Cmd+Left are Back; Ctrl/Cmd+arrow are word/desktop navigation), and firing a flipper
            // off it is both a false activation and a stuck-flipper risk: if the browser consumes
            // the chord to navigate or switch context, the matching keyup may never be delivered
            // to this page at all. Confirmed via Playwright that Ctrl/Alt/Meta+ArrowLeft each flew
            // the left flipper before this guard.
            //
            // Shift is deliberately NOT in this list: it is not a shortcut prefix for the arrows
            // in any browser, and a player resting a hand on Shift must not silently lose their
            // flippers. keyup below is deliberately NOT filtered either - see its own comment.
            //
            // Space and Escape are deliberately left unfiltered, and that asymmetry is the audited
            // decision, not an oversight. Filtering Space's keydown would let its keyup still fall
            // through to handleLaunchRelease() (which intentionally launches without a matching
            // press - see its own comment), turning a harmless chord into a phantom launch; and
            // Escape's only chords (Ctrl/Alt+Esc) background the window, where the blur handler's
            // openPauseMenu() already produces the exact same, idempotent result.
            if (e.ctrlKey || e.metaKey || e.altKey) return;
            // Optional "lane change" mechanic (rotateLaneLamps()) - checked on the off->on edge,
            // BEFORE activateFlipper() flips flipper.active to true, same guard activateFlipper()
            // itself uses to fire its solenoid sound only once per real press, not once per
            // browser key-repeat event. That state-edge check is deliberately used INSTEAD of an
            // `if (e.repeat) return` bail: it suppresses the repeat side effects just as
            // completely, but still activates correctly in the one case an e.repeat bail would
            // break - a key already physically held as the page takes focus, where the browser
            // delivers repeat keydowns with no initial non-repeat one to latch onto.
            if (e.code === 'ArrowLeft') {
                if (!leftFlipper.active) rotateLaneLamps(-1);
                activateFlipper(leftFlipper);
            }
            if (e.code === 'ArrowRight') {
                if (!rightFlipper.active) rotateLaneLamps(1);
                activateFlipper(rightFlipper);
            }
        });
        // Release is deliberately unconditional - no modifier check, no state check. A player who
        // grabs Ctrl/Cmd MID-HOLD and then lets go of the arrow sends a keyup carrying that
        // modifier, and the one thing a flipper must never do is stay down because the release
        // looked unusual. deactivateFlipper() is idempotent, so an unmatched keyup is a harmless
        // no-op; a filtered one would be a flipper stuck up for the rest of the ball.
        window.addEventListener('keyup', (e) => {
            if (e.code === 'ArrowLeft') deactivateFlipper(leftFlipper);
            if (e.code === 'ArrowRight') deactivateFlipper(rightFlipper);
        });

        // Mobile flipper-zone touch controls are wired further down, alongside the launch
        // button, fullscreen/orientation-lock request, and resize handling - see the "Mobile
        // controls" block near handleLaunchRelease() below (Stage 11, babylon-prompts/11-*.md).
        // (Stage 4's original tap-left/right-half-of-canvas stopgap has been fully replaced by
        // the real arcade-style corner buttons there, not left running alongside them.)

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
        // Lighting/material hierarchy pass (user-requested - "BALL: highest motion readability"):
        // raised from 0.4 - at the old value the ball's own glow was DIMMER than the flippers
        // (0.5) and roughly level with the bumpers (0.6), so the single object every player's eye
        // needs to track continuously wasn't actually the brightest thing on the board. Bumped
        // above every other object's resting emissive scale (flippers 0.5, bumpers 0.6, mission
        // targets 0.55) so the ball reads as the clear top of the hierarchy at a glance, moving or
        // still, without needing a value so extreme it blooms into a shapeless blob.
        ballMat.emissiveColor = COLOR_EYEBALL.scale(0.7);
        // Same markings on both channels, so the pattern is visible in the lit surface AND in the
        // ball's own glow - otherwise the emissive would wash the stripes out at exactly the
        // moments the ball is moving fastest and rotation matters most. See createBallTexture().
        {
            const ballTex = createBallTexture(scene);
            ballMat.albedoTexture = ballTex;
            ballMat.emissiveTexture = ballTex;
        }

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
            // Mid-bat, not the hinge: with the real-machine mounting (hinge outboard at
            // FLIPPER_PIVOT_X_M, bat extending inward - see its own comment in config.js) a drop
            // at the hinge itself lands on the pivot end where a flip barely moves the ball.
            // 0.6 of the way out is the sweet spot a player actually aims for.
            mainBall.mesh.position.set(-FLIPPER_PIVOT_X_M * 0.4, 0.08, FLIPPER_Z_M - 0.02);
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
        // Guards triggerLaunchFiredFlash() below against re-entry - not a real-world concern (a
        // second real fire can't happen until ballInPlay cycles back through resetBallToPlunger(),
        // which is well past this flash's own short lifetime either way) but cheap to have.
        let launchFiredFlashActive = false;

        // Ported from InputManager.setLaunchReady() in ../index.js - toggles the launch button's
        // idle-pulse affordance (see .launch-btn.ready in index.html) so it only visibly invites
        // a tap when a launch is actually possible. Looks the button up fresh each call (like the
        // 2D version) rather than relying on a captured reference, so this can be called safely
        // from anywhere regardless of definition order.
        function setLaunchReady(ready) {
            const btn = document.getElementById('launch-btn');
            if (btn) btn.classList.toggle('ready', ready);
        }

        // Touch-controls visual polish (UX/UI polish, no mechanic change) - same "look it up
        // fresh each call" pattern as setLaunchReady() just above. Called from the same two spots
        // that already own .ready (resetBallToPlunger()/handleLaunchRelease() below), reusing
        // ballInPlay's own real off/on edge rather than a new flag - see #mobile-controls.dimmed's
        // own CSS comment in index.html for the full reasoning.
        function setControlsDimmed(dimmed) {
            const controls = document.getElementById('mobile-controls');
            if (controls) controls.classList.toggle('dimmed', dimmed);
        }

        // Control-feedback polish (user-requested - "distinguish READY/CHARGING/FIRED"): the one
        // launch-button state that had no visual of its own before this - READY is .ready (see its
        // own CSS comment) and CHARGING is .pressed with the real chargePercent-scaled glow (see
        // that rule's own comment), but the instant AFTER a real launch both of those get removed
        // and nothing replaced them, so a just-fired button looked identical to an idle one with
        // nothing pending. Same "look the button up fresh" pattern as setLaunchReady()/
        // setControlsDimmed() above. Called only from handleLaunchRelease() at the exact real
        // ballInPlay=false->true transition (see its own call site) - never a decorative timer of
        // its own, so this can't drift out of sync with whether a launch actually happened.
        function triggerLaunchFiredFlash() {
            const btn = document.getElementById('launch-btn');
            if (!btn || launchFiredFlashActive) return;
            launchFiredFlashActive = true;
            btn.classList.add('fired');
            if (window.SPIRITBALL_reducedMotion) {
                // No 'animationend' will ever fire (index.html's reduced-motion block sets
                // animation: none on .fired) - hold the static flash look this same CSS rule
                // defines for a fixed duration instead, so reduced-motion players still get a
                // clear, if motion-free, "that fired" acknowledgement rather than none at all.
                setTimeout(() => {
                    btn.classList.remove('fired');
                    launchFiredFlashActive = false;
                }, 260); // matches launch-fired-flash's own animation-duration in index.html
            } else {
                btn.addEventListener('animationend', function onLaunchFiredFlashEnd() {
                    btn.classList.remove('fired');
                    launchFiredFlashActive = false;
                }, { once: true });
            }
        }

        function resetBallToPlunger() {
            // Interruption-lifecycle audit fix - an active Vision Gate capture holds the ball
            // kinematic (ANIMATED) and owns a bunch of its own timers/visuals; this used to be
            // skipped entirely here, so a hard reset (this function's own dev button, or any
            // future call site) while captured left the ball's mesh moved to the plunger but its
            // physics body still kinematic, unable to respond to a real launch, with the capture's
            // lamp/glow/color-cycle still running and its eject timer still pending to later fire
            // and teleport the ball back to the gate mid-play. cancelVisionGateCapture() is a
            // correct no-op when no capture is active (see its own comment), so this is safe
            // unconditionally - same reasoning startNewGame() already relies on for its own call.
            cancelVisionGateCapture('resetBallToPlunger');
            // Ball-reset authoritative-definition audit fix: cancelVisionGateCapture() only
            // restores DYNAMIC when it actually captured a ball reference (visionGate.ball was
            // non-null), so this function's own guarantee that a reset ball is always DYNAMIC
            // afterward was previously indirect - true today only because Vision Gate capture is
            // the sole mechanism in this file that ever changes mainBall's motion type away from
            // DYNAMIC in the first place. Setting it directly and unconditionally here makes that
            // guarantee this function's own, not a borrowed side effect of another helper - a
            // correct no-op on an already-dynamic body (Havok applies no impulse/velocity change
            // from re-setting the same motion type), so this changes no physics behavior today.
            mainBall.aggregate.body.setMotionType(BABYLON.PhysicsMotionType.DYNAMIC);
            mainBall.mesh.position.set(plunger.baseX, BALL_REST_Y_M, BALL_REST_Z_M);
            mainBall.aggregate.body.setLinearVelocity(BABYLON.Vector3.Zero());
            mainBall.aggregate.body.setAngularVelocity(BABYLON.Vector3.Zero());
            mainBall.stuckTimeMs = 0;
            ballInPlay = false;
            plungerCharging = false;
            plungerChargeElapsedMs = 0;
            plungerPower = PLUNGER_MIN_POWER_MS;
            plunger.chargePercent = 0;
            launchBtn.style.setProperty('--charge-pct', 0);
            setLaunchReady(true);
            setControlsDimmed(false);
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
            // Gameplay-QA regression fix: a drain just happened but resetBallToPlunger() hasn't
            // run yet - the ball is still wherever it physically landed (mid-fall,
            // well below the table), not at the plunger. Without this guard, a launch input
            // landing in that window fired a full "launch" (message/shake/sound/haptic, armed
            // skill shot/ball save) from that stale sub-table position, which the pending reset
            // then silently overwrote a few hundred ms later - the player got launch feedback for
            // a shot that never happened and had to press Launch again. Reproduced deterministically
            // by qa/regression-suite.js's "CONCRETE BUG" test. Doesn't affect the deliberately
            // supported "held Space through a drain, released after" case (archive/release-
            // prompts/13-*.md, see the comment above handleLaunchPress()) - by the time a real
            // release happens after the reset has actually completed, both flags are already back
            // to their idle values.
            //
            // Two flags because there are two such windows, and after the end-of-ball pass they
            // no longer overlap: drainTimeoutHandle is the BALL SAVED return delay (still a
            // timer), endOfBall.active is a real drain's end-of-ball sequence (no timer at all). The sequence clears itself in the same statement
            // that returns the ball to the plunger (finishEndOfBallSequence()), so this blocks a
            // stale-position launch for exactly as long as the ball is genuinely still down the
            // drain, and not one frame into the NEXT BALL message - the player can launch through
            // that message, which is the point of it not being a beat.
            if (ballInPlay || isPaused || drainTimeoutHandle !== null || endOfBall.active) return;
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
            triggerLaunchFiredFlash(); // FIRED state - see its own comment; right at the real fire transition, not before (the guard above can still return early with no fire at all)
            plungerCharging = false;
            plunger.chargePercent = 0;
            launchBtn.style.setProperty('--charge-pct', 0);
            setLaunchReady(false);
            setControlsDimmed(true);
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
            // Input-boundary audit fix: a real, physically-held key fires keydown repeatedly
            // (browser-native auto-repeat), not just once on the initial press - confirmed via a
            // simulated real-repeat sequence in Playwright (repeat:true keydowns, matching actual
            // browser behavior) that this handler's own handleLaunchPress() call was resetting
            // plungerChargeElapsedMs back to 0 on every single repeat, so a genuinely long hold
            // could never accumulate real charge time and stayed stuck near minimum power the
            // entire time it was held. Ignoring repeats here (the true off->on edge is the only
            // one that should mean anything, same principle the flipper keydown handler already
            // uses via its own active-flag edge check) fixes every branch below at once, not just
            // the launch-charge one - a held Space also has no business re-dismissing the menu,
            // re-starting a new game, or re-resuming from pause on every repeat either.
            if (e.repeat) return;
            // Input-boundary audit fix: this branch used to call handleLaunchPress() here
            // ("also ends attract mode internally"), treating menu-dismiss and begin-charging as
            // one continuous gesture on the theory that keydown/keyup are always a real, correctly-
            // paired hold. That part's true, but it made this the ONLY one of the three dismiss
            // branches (menu/game-over/pause) that didn't set suppressNextLaunchRelease, and the
            // one genuine inconsistency it created - a quick tap-and-release Space at the menu
            // charges and launches immediately at whatever tiny amount of time the dismiss+launch
            // pair took, rather than just dismissing - is exactly the kind of "shared input path"
            // ambiguity this audit is about. Now consistent with the other two: dismiss only,
            // suppress the matching keyup, and require the player's own separate, deliberate
            // press afterward to begin charging - same as the click/touch tap-anywhere path below.
            if (isMenuUp()) {
                hideMenuScreen();
                endAttractMode();
                suppressNextLaunchRelease = true;
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
        // (archive/release-prompts/14-*.md). Those were originally full-height edge zones (tap
        // ANYWHERE along the side); they are now compact bottom-corner arcade buttons, because
        // "anywhere along the side" meant an ordinary two-handed grip on the phone, or a tap at
        // the top of the table, silently held a flipper - see index.html's .flipper-zone comment
        // for that hit-area fix. Only the hitbox geometry changed there: these are still the same
        // two elements with the same ids, wiring, and flipper physics. The EVENT WIRING below replaces
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
                launchBtn.style.setProperty('--charge-pct', 0);
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
        // High-score audit fix: addScore() keeps backglass.state.highScore synced to `score` in
        // real time (as soon as either is exceeded, both read the same value from then on) - by
        // Game Over time, `score === backglass.state.highScore` is true both when this GAME
        // genuinely set a new record AND when it merely tied a pre-existing one (never actually
        // exceeded it), so comparing the two numbers there can't tell those apart. This flag is
        // the real "did this game set a new record" signal: set exactly once, at the exact moment
        // addScore()'s own strict `score > backglass.state.highScore` check fires for real, reset
        // per-game (not per-ball - an earlier ball's record in a multi-ball game still counts at
        // the end of THIS game) by startNewGame(). showGameOverScreen() reads this instead of
        // re-deriving (and getting wrong) the same comparison from score/highScore directly.
        let newHighScoreThisGame = false;
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

        // Post-bank-complete reset delay (timer audit fix) - was a bare setTimeout(resetLaneBank,
        // LANE_BANK_RESET_DELAY_MS) fired from the 'reentryLane' branch below, so a pause landing
        // inside that 400ms window let resetLaneBank() (which un-lights every lane) fire on wall-
        // clock time while the pause overlay hid it, silently clearing the just-completed bank's
        // lit state before the player could see the reset happen. Converted to the same remaining-
        // ms-decremented-by-deltaMs idiom as dropTargetBank's animMs/skillShot's remainingMs/
        // ballSave's remainingMs (see updateLaneBankReset() below, called from the render loop's
        // existing !isPaused block) so it now freezes correctly like every other continuous timer.
        let laneBankResetRemainingMs = 0;

        // Bonus/multiplier subsystem state (user-requested) - per-ball, not per-game: `points`
        // accumulates silently from major shots/mission completions during play (see their call
        // sites) and `multiplierX` is advanced by clearing the rollover-lane bank above. Neither
        // touches the real score directly - only startBonusCount() (below) ever does, at drain,
        // via the shared addScore() so high-score tracking stays exactly as it already works.
        // Deliberately separate from `scoreMultiplier`/`powerUp` (a temporary, real-time 2x
        // applied to every ordinary hit while its own window is running) in every sense, not just
        // by name - scoring-accounting audit fix: addScore()'s payout call from the bonus count
        // now explicitly bypasses scoreMultiplier (its own `applyMultiplier=false` argument), so
        // the bonus always pays out exactly points*multiplierX - this pool's own dedicated
        // multiplier - regardless of whether the temporary power-up happens to be active at drain
        // time. An earlier version of this comment described the two as "combining additively
        // through addScore()", which was true of the code but not a deliberate design decision -
        // see addScore()'s own comment for why that combination never should have applied here.
        const ballBonus = { points: 0, multiplierX: 1 };

        // Pause-aware gameplay clock (timer audit fix) - accumulates the render loop's own
        // deltaMs, but ONLY while !isPaused (see the render loop's `if (!isPaused) { gameplayClockMs
        // += deltaMs; ... }` below), unlike performance.now()/Date.now() which keep advancing
        // through a pause or a backgrounded tab. combo/orbit windows below read this instead of
        // performance.now() specifically because they're elapsed-SINCE-an-event comparisons, not
        // continuous per-frame countdowns - the render-loop-deltaMs idiom used elsewhere in this
        // file (updateSkillShot()/updateBallSave()/updateDropTargetBank()) doesn't fit an "N
        // seconds since the last matching hit, whenever that next hit happens" check the same way,
        // so rather than inventing a second pattern, this gives that style of check a clock that's
        // just as pause-safe. Only ever read from inside a hit/trigger handler, which - because
        // Havok's own step is what's gated by scene.physicsEnabled during a pause - can only run
        // while !isPaused anyway, so it's always current when read.
        let gameplayClockMs = 0;

        // Lightweight combo scoring state (user-requested) - one {index, lastAtMs} progress
        // cursor per COMBO_DEFS entry (same array index), advanced by recordComboShot() below.
        // `index` is how many of that def's steps have matched in order so far; `lastAtMs` is
        // when the most recent one did (in gameplayClockMs terms, not wall time - timer audit fix,
        // see gameplayClockMs' own comment above), used to expire a stalled chain cleanly. Separate
        // from `comboStreak`, which tracks chaining multiple DIFFERENT combos back to back for an
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

        // Orbit shot state (one entry per side) - `armedAt` is the timestamp (gameplayClockMs-style
        // ms - timer audit fix, was performance.now(), see gameplayClockMs' own comment) of the
        // last valid entrance hit, or null if the entrance hasn't fired (or its window already
        // expired). A completion trigger only scores if armedAt is set and within
        // ORBIT_COMPLETION_WINDOW_MS - see handleTriggerHit()'s 'orbitCompletion' branch - so a
        // partial shot (entered, stalled, rolled back without reaching the top) can't score, and a
        // stale arm from a much earlier pass can't retroactively count a later, unrelated hit.
        // Reading gameplayClockMs instead of performance.now() means pausing mid-window no longer
        // silently burns down (or entirely blows past) the 4-second completion window - confirmed
        // by playtest-style Playwright timing before/after: previously, pausing for longer than
        // ORBIT_COMPLETION_WINDOW_MS and resuming always found the window already expired, even
        // though the ball hadn't moved.
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

        // Restrained score/lives HUD feedback (user-requested - "brief subtle brightness/scale
        // punch... no long animation... no counting animation delaying true value"). Purely
        // visual: setScore()/setLives() above already update the real text synchronously - this
        // only layers a short CSS animation (transform/filter, compositor-only - never a layout
        // property) on top via a class toggle, so it can never delay or shift the real number.
        // Coalesced rather than restarted on every call: while a pulse is already playing, a
        // fresh addScore() (e.g. the rapid end-of-ball bonus count, ticking every
        // BONUS_COUNT_TICK_MS - far shorter than one pulse's own duration) doesn't restart the
        // animation from scratch, it can only upgrade an in-flight pulse to the "strong" tier if a
        // big-enough delta lands mid-pulse. Without this, a 16-tick bonus count would fire 16
        // back-to-back restarts and read as one continuous flicker/vibration - exactly what "no
        // distracting continuous animation" (the lives half of this same request) rules out for
        // the score side too.
        const HUD_SCORE_PULSE_STRONG_THRESHOLD = 1500; // roughly the line between routine hits (bumpers/targets/combos, 100-1200) and the board's bigger events (Saturn, lane/target-bank clears, Vision Gate, mission bonus, 1500+)
        let scorePulseActive = false;
        function pulseScoreHud(delta) {
            if (window.SPIRITBALL_reducedMotion) return;
            const strong = delta >= HUD_SCORE_PULSE_STRONG_THRESHOLD;
            if (scorePulseActive) {
                if (strong) hudScore.classList.add('hud-pulse-strong');
                return;
            }
            scorePulseActive = true;
            hudScore.classList.toggle('hud-pulse-strong', strong);
            hudScore.classList.add('hud-pulse');
            hudScore.addEventListener('animationend', function onScorePulseEnd() {
                hudScore.classList.remove('hud-pulse', 'hud-pulse-strong');
                scorePulseActive = false;
            }, { once: true });
        }

        // Lives: single subtle "dip" pulse on loss only (never on the initial setLives(lives) at
        // startup or startNewGame()'s full reset, both of which call setLives() directly without
        // going through this) - see its own call site in handleDrain() for why. One-shot and
        // non-overlapping (a second loss can't happen before this animation's own short duration
        // elapses anyway, given the drain/reset flow in between), so there's no coalescing logic
        // to mirror from pulseScoreHud() above.
        let livesPulseActive = false;
        function pulseLivesHud() {
            if (window.SPIRITBALL_reducedMotion) return;
            if (livesPulseActive) return;
            livesPulseActive = true;
            hudLives.classList.add('hud-lives-lost');
            hudLives.addEventListener('animationend', function onLivesPulseEnd() {
                hudLives.classList.remove('hud-lives-lost');
                livesPulseActive = false;
            }, { once: true });
        }

        // HUD hierarchy audit (UX polish, no new mechanic) - see index.html's #mission-hud/
        // #effects-hud CSS comment for the full design reasoning behind which of this game's
        // existing systems get a persistent-while-relevant spot here. Every value read below
        // already exists (ballSave.active, kickback.active, backglass.state.*) - this only
        // surfaces it, on the same throttled-poll pattern updateDevHud() already uses further
        // down this file (a plain accumulator + interval check, not a new timer/mechanic), rather
        // than hunting down and touching every single call site that can change one of these
        // flags. Runs for every player (not gated behind ?dev=1) - unlike updateDevHud, this IS
        // the real, shipped UI.
        const missionHud = document.getElementById('mission-hud');
        const missionHudName = document.getElementById('mission-hud-name');
        const missionHudProgress = document.getElementById('mission-hud-progress');
        const effectsHud = document.getElementById('effects-hud');
        const effectBallSave = document.getElementById('effect-ballsave');
        const effectKickback = document.getElementById('effect-kickback');
        const effectMultiplier = document.getElementById('effect-multiplier');
        effectMultiplier.textContent = '★ ' + POWERUP_MULTIPLIER + 'X SCORE';
        let playerStatusHudAccumulatorMs = 0;
        const PLAYER_STATUS_HUD_UPDATE_INTERVAL_MS = 150; // frequent enough that a badge appearing/disappearing never reads as delayed, far cheaper than every frame
        function updatePlayerStatusHud(deltaMs) {
            playerStatusHudAccumulatorMs += deltaMs;
            if (playerStatusHudAccumulatorMs < PLAYER_STATUS_HUD_UPDATE_INTERVAL_MS) return;
            playerStatusHudAccumulatorMs = 0;

            if (backglass.state.missionName) {
                missionHudName.textContent = backglass.state.missionName;
                missionHudProgress.textContent = backglass.state.missionProgress + '/' + backglass.state.missionRequired;
                missionHud.hidden = false;
                backglass.state.idleHint = null; // the window belongs to the running vision now
            } else {
                missionHud.hidden = true;
                // First-play readability (user-requested). One short instruction in the backglass
                // slot that would otherwise read "NONE ACTIVE", picked from the state the player
                // is actually in. No tutorial page, no timers, no new UI - this is the existing
                // window saying something useful instead of something empty.
                //
                // The two states a new player gets stuck in are the two answered here: a ball
                // sitting on the plunger with no idea it needs launching (the title screen said
                // so, but that screen is gone by the time it matters), and a ball in play with no
                // idea that hitting a target is what starts a vision.
                //
                // Wording follows document.documentElement.dataset.touchControls rather than a
                // media query of its own, because that attribute is this file's authoritative
                // answer to "which controls can the player actually SEE right now" (see
                // updateMobileControlsVisibility()'s comment on why a coarse-pointer query gives
                // the wrong answer at small desktop widths). Sharing it means this hint and the
                // title screen's control hint cannot contradict each other.
                const touch = document.documentElement.dataset.touchControls === 'on';
                backglass.state.idleHint = ballInPlay
                    ? 'HIT A LIT TARGET'
                    : (touch ? 'HOLD LAUNCH BUTTON' : 'HOLD SPACE TO LAUNCH');
            }

            effectBallSave.hidden = !ballSave.active;
            effectKickback.hidden = !kickback.active;
            effectMultiplier.hidden = !backglass.state.multiplierActive;
            effectsHud.hidden = !ballSave.active && !kickback.active && !backglass.state.multiplierActive;
        }

        // Dev diagnostics (?dev=1 only, see updateDevHud() in main()) - the raw numeric half of
        // "last scoring event"; backglass.state.lastMessage (see showMessage()'s own comment) is
        // the human-readable half, since not every scoring hit's message text includes the actual
        // point value (e.g. comet just shows "COMET!"). Purely a diagnostic breadcrumb.
        let lastScoreDelta = 0;
        let lastScoreTotal = 0;

        // Scoring-accounting audit fix: `applyMultiplier` defaults true for every ordinary call
        // (every ordinary hit legitimately gets the temporary scoreMultiplier power-up while it's
        // running - that's its whole point). The end-of-ball bonus count is the one exception -
        // see startBonusCount()/updateBonusCount()'s own comments for why it passes false.
        function addScore(points, applyMultiplier = true) {
            const delta = applyMultiplier ? points * scoreMultiplier : points;
            score += delta;
            lastScoreDelta = delta;
            lastScoreTotal = score;
            setScore(score);
            if (delta > 0) pulseScoreHud(delta);
            if (score > backglass.state.highScore) {
                backglass.state.highScore = score;
                writeHighScoreToStorage(score); // high-score audit fix - see its own comment; a throwing/unavailable browser keeps the in-memory record for this session without crashing
                newHighScoreThisGame = true; // high-score audit fix - see its own declaration comment
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
        // The one definition of "what is this ball's bonus worth". Extracted so the end-of-ball
        // sequence below can ask whether there is a bonus to pay - it needs to know BEFORE
        // calling startBonusCount(), because a zero bonus resolves synchronously and would
        // otherwise complete the BONUS beat inside the call that started it. A read, never a
        // payout: startBonusCount() is still the only thing in this file that moves these points
        // into the score.
        function pendingBonusTotal() {
            return ballBonus.points * ballBonus.multiplierX;
        }

        function startBonusCount(onComplete) {
            const total = pendingBonusTotal();
            if (total <= 0) {
                onComplete();
                return;
            }
            if (window.SPIRITBALL_reducedMotion) {
                // Skip/accelerate per the request - the whole payout lands in one immediate step,
                // not a per-tick sequence. Still routed through updateBonusCount() below (with
                // ticksRemaining already at 0) rather than resolved synchronously here, so a
                // pause landing in the same instant can't skip the completion callback.
                // Scoring-accounting audit fix - see updateBonusCount()'s own call for why this
                // bypasses scoreMultiplier.
                addScore(total, false);
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
        // above, or the normal tick loop just finished its last tick and BONUS_COUNT_HOLD_MS of
        // holding the completed total has now elapsed - either way, time to finish.
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
            // Scoring-accounting audit fix: the end-of-ball bonus already carries its OWN
            // dedicated multiplier (ballBonus.multiplierX, earned via lane-bank clears, capped at
            // BONUS_MULTIPLIER_MAX) - that's the traditional-pinball "bonus multiplier" mechanic.
            // Routing this payout through addScore()'s default path also let it inherit whatever
            // temporary, real-time scoreMultiplier power-up happened to still be active (or
            // frozen, since its own countdown pauses while ballInPlay is false during this exact
            // sequence - see updatePowerUp()'s call site) at the moment of drain - never a
            // deliberate design (the power-up's own commit describes it as applying to "every
            // hit" during live play, not to a deferred lump-sum payout added by an unrelated,
            // later feature purely reusing addScore() for its high-score-tracking side effect).
            // Confirmed via Playwright: an active 2x power-up at drain time doubled the bonus
            // payout on top of ballBonus.multiplierX. Bypassing scoreMultiplier here makes the
            // bonus count always pay out exactly points*multiplierX, matching what the on-screen
            // "BONUS x{multiplierX}" message already claims.
            addScore(step, false);
            playBonusTickSound();
            // The last tick holds the same climbing-number format every other tick uses, not the
            // words 'BONUS AWARDED' it used to swap in. That swap threw away the one number the
            // count-up existed to show: ticks 1-15 walked the total upward and the tick that
            // finally landed it replaced the digits with a label, so the completed bonus was the
            // only value in the sequence a player never actually got to read. Keeping the format
            // makes the whole beat one number settling on its final value and holding there,
            // which is also its own "this is finished" signal - the digits stop moving.
            backglass.showMessage(
                'BONUS x' + bonusCount.multiplierX + ': ' + bonusCount.awarded.toLocaleString(),
                isLastTick ? BONUS_COUNT_HOLD_MS + 120 : BONUS_COUNT_TICK_MS + 60
            );
            bonusCount.remainingMs = isLastTick ? BONUS_COUNT_HOLD_MS : BONUS_COUNT_TICK_MS;
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
            // Stale-callback audit fix - a defensive belt-and-suspenders clear, not the primary
            // fix (handleTriggerHit()'s visionGate.active guard already prevents two REAL captures
            // from overlapping under normal play; this only matters for the New-Game-mid-capture
            // race - see visionGateEjectTimeoutHandle's own comment). Guarantees this capture's
            // own eject timer, scheduled below, is always the only one that can ever fire.
            if (visionGateEjectTimeoutHandle !== null) {
                clearTimeout(visionGateEjectTimeoutHandle);
                visionGateEjectTimeoutHandle = null;
            }
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
            // Capture flash (gate-polish pass, user-requested - "dramatically brighter only during
            // capture"). Two beats on top of the glow boost and colour cycle that were already
            // here, both reusing existing helpers rather than adding an effect system:
            //
            // A brief violet screen wash, at the same restrained peak the ASCENSION beat uses -
            // enough to register as the board firing, well short of a white-out. flashScreen()
            // already no-ops under reduced motion, so no guard is needed here.
            flashScreen(240, 170, 60, 255, 0.20);
            // And a physical snap on the portal itself: the whole ring assembly pops outward,
            // which is what sells the gate as a mouth that just swallowed something rather than a
            // lamp that changed colour. pulseMesh() is the file's existing tested hit reaction
            // (scale + emissive flash, self-restoring), so the gate borrows the same motion
            // vocabulary every bumper and target already speaks.
            //
            // The COLLAR is the primary and the rim ring rides along as an extra, which is the
            // opposite of the obvious wiring and is deliberate. pulseMesh() flashes its primary's
            // emissive to white and restores the value it cloned ~100ms later; on the rim ring
            // that clone is taken before startVisionGateColorCycle()'s first step lands, so the
            // restore would drag the ring back to its REST colour mid-sequence and hold it there
            // until the next cycle step - a visible dip to dim, 100ms into the brightest moment
            // the gate has. Extras get the scale half only and never have their emissive touched,
            // so wiring it this way keeps the ring's colour wholly owned by the cycle while the
            // pop still reads across the whole assembly.
            pulseMesh(obstacles.visionGateCollarMesh, 1.22,
                [obstacles.visionGateMesh, obstacles.visionGateHalo].filter(Boolean));
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

            visionGateEjectTimeoutHandle = setTimeout(() => {
                visionGateEjectTimeoutHandle = null;
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

        // Interruption-lifecycle audit fix: shared teardown for every path that can end a capture
        // early or on schedule - a natural eject (endVisionGateCapture(), below), a hard reset via
        // New Game or the dev "RESET BALL TO PLUNGER" button (resetBallToPlunger()), or any future
        // interruption. Cancels this capture's own eject timer (and any version of it already
        // deferred by a pause), the color-cycle timers, stops/disposes the sparkle, clears
        // visionGate.active/ball, hands the lamp back to its normal rest look, drops the glow
        // boost, and restores the captured ball's motion type to DYNAMIC.
        //
        // Deliberately does NOT touch the ball's position or velocity - callers want different
        // post-cancel physics (a natural eject kicks it back out toward -Z at
        // VISION_GATE_EJECT_SPEED_MS; a hard reset sends it to the plunger instead), so that stays
        // each caller's own job, right after this returns.
        //
        // Safe to call unconditionally regardless of whether a capture is actually active - every
        // field here already degrades to a harmless no-op on an inactive gate (same "unconditional,
        // correct no-op" reasoning startNewGame() already used before this helper existed). Bug
        // fix (interruption-lifecycle audit): resetBallToPlunger() used to skip all of this
        // entirely - confirmed via Playwright that the dev "RESET BALL TO PLUNGER" button during an
        // active capture left the ball's mesh moved to the plunger but its physics body still
        // kinematic (ANIMATED, not DYNAMIC), with the capture's lamp/glow/color-cycle still running
        // and its eject timer still pending - which would later fire and teleport the ball back to
        // the gate mid-play. `reason` is caller-supplied context for future debugging, not branched
        // on.
        //
        // Returns the ball that was captured (or null), so endVisionGateCapture() doesn't need to
        // read visionGate.ball itself after this has already cleared it.
        function cancelVisionGateCapture(reason) {
            // Dev diagnostics (?dev=1 only, see updateDevHud() in main()) - "last reset reason".
            // Purely a diagnostic breadcrumb - `reason` is otherwise unused by this function itself.
            lastResetReason = reason || null;
            if (visionGateEjectTimeoutHandle !== null) {
                clearTimeout(visionGateEjectTimeoutHandle);
                visionGateEjectTimeoutHandle = null;
            }
            pendingVisionGateEject = null;
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
            if (ball && ball.aggregate.body) {
                ball.aggregate.body.setMotionType(BABYLON.PhysicsMotionType.DYNAMIC);
            }
            return ball;
        }

        // Ends an in-progress capture on its own natural schedule: runs the shared teardown above,
        // then ejects the captured ball back into real (dynamic) physics.
        function endVisionGateCapture() {
            const ball = cancelVisionGateCapture('eject');
            // Defensive only - the ball is kinematic and off-screen state changes (drain, new
            // game) can't reach a frozen body, but startNewGame()/resetBallToPlunger() clear
            // visionGate.active/ball directly on a hard reset, so this can legitimately be null if
            // that raced ahead of this timer somehow.
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
            body.setLinearVelocity(new BABYLON.Vector3(-0.05, 0, -VISION_GATE_EJECT_SPEED_MS));
            clampBodySpeed(body, MAX_BALL_SPEED_MS);

            // Eject feedback (gate-polish pass, user-requested). Until this pass the eject was
            // visually silent: the capture built to a colour-cycling, glowing, particle-throwing
            // crescendo and then the ball simply reappeared moving, with the gate dropping back to
            // rest in the same frame. The moment the ball is actually returned to play is the
            // payoff of the whole sequence and it had no beat of its own.
            //
            // Deliberately SMALLER than the capture, in every channel - a shorter, dimmer flash, a
            // gentler pulse, a lighter punch. The capture is the event; this is the release, and
            // matching their intensities would flatten the arc the capture spends 1.8s building.
            // Ordered after the physics above so nothing here can be blamed for the eject vector.
            flashScreen(160, 150, 70, 255, 0.11);
            // Collar as primary again, for the same ownership reason as the capture pulse above -
            // here the rim ring has just been handed back to the lamp system by
            // cancelVisionGateCapture(), and an emissive flash on it would be fighting updateLamps()
            // instead of the colour cycle. Same hazard, same fix.
            pulseMesh(obstacles.visionGateCollarMesh, 1.12,
                [obstacles.visionGateMesh].filter(Boolean));
            spawnHitBurst(scene, particleTexture, obstacles.visionGateMesh, highFidelity,
                COLOR_VISION_GATE, 'visionGateEjectBurst');
            // A short punch along the ball's own exit direction (-Z, the gate's open mouth), so
            // the camera reads as being shoved by the ball leaving rather than by a generic event.
            // Magnitude 0.0054 against the capture's 0.012 - looked at, not assumed. The first
            // version was 0.0108, which is 90% of the capture's punch and made the release read as
            // a second event of equal weight rather than as the tail of the first one.
            triggerCameraPunch(200, new BABYLON.Vector3(0, 0.002, -0.005));
        }

        // Selects AND starts a mission in one action (see MISSION_DEFS' comment for why) -
        // triggered by hitting a mission target while no mission is active.
        // First-play readability (user-requested - "lamp highlighting"). The three mission targets
        // were registered LAMP_MODE.ON and never changed mode again, so they sat statically lit
        // and were indistinguishable from the board's decoration. They are the entry point to the
        // entire vision system and nothing on the table said so.
        //
        // They now pulse while no vision is running - the lamp system's existing invitation mode,
        // driven by the mode it already supports - and go steady once a vision is active, so the
        // invitation stops the moment it has been taken up. That inversion is the point: a pulse
        // that never stops is decoration, and a pulse that stops when you obey it is instruction.
        //
        // Under reduced motion updateLamps() already slows the pulse period rather than removing
        // it (see LAMP_BLINK_PERIOD_MS' own comment on why a lamp's state is real information),
        // so this needs no reduced-motion branch of its own.
        function syncMissionTargetLamps() {
            const inviting = mission.state !== 'active';
            for (let i = 0; i < obstacles.missionTargetLamps.length; i++) {
                lampSystem.setLampMode('missionTarget' + i, inviting ? LAMP_MODE.PULSE : LAMP_MODE.ON);
            }
        }

        // Vision-selection feedback (user-requested - "player should understand what to hit next
        // within ~1 second"). Selecting a vision used to change only TEXT: a 900ms backglass
        // message, the VISION window, and the mission HUD. Nothing on the PLAYFIELD moved, so the
        // objective's own hardware - the thing the player now has to aim at - looked exactly as it
        // had a moment earlier, and "HIT THE POP BUMPERS" left them hunting for which lumps on the
        // table were pop bumpers.
        //
        // This lights the objective's elements once, briefly, right after selection. Deliberately
        // ONE sweep and then nothing: a persistent marker on live gameplay hardware is the
        // permanent-arrow clutter this pass was told not to create, and the backglass window +
        // mission HUD already carry the objective for as long as it is running.
        //
        // Every branch reuses a mechanism this file already had, rather than inventing a cue
        // system: lanes go through the lamp system's own flashLamp() (tick-driven, so it cannot
        // fire while paused and leave a lamp stuck bright - see its own comment), and bumpers go
        // through pulseBumperLamp(), the exact emissive lift a real bumper hit already uses.
        //
        // The comet gets the same emissive-lift treatment written out, NOT pulseMesh(), and that
        // is a deliberate avoidance rather than an inconsistency: pulseMesh() scales the mesh, and
        // the comet is the one objective element carrying a physics body with an explicit collision
        // radius. Scaling it would be a mechanics change on a pass that is not allowed one.
        function cueMissionObjective(index) {
            const type = MISSION_DEFS[index].type;
            if (type === 'lane') {
                for (let i = 0; i < obstacles.reentryLaneMeshes.length; i++) {
                    lampSystem.flashLamp('reentryLane' + i, MISSION_CUE_MS, COLOR_MISSION_ACTIVE);
                }
                return;
            }
            if (type === 'bumper') {
                // The shared CAP material, not each bumper's own bodyMat/lampMat, and that choice
                // fixes a real bug rather than being a stylistic preference. pulseBumperLamp() -
                // the hit reaction - saves and restores exactly those per-bumper materials on a
                // 90ms timer. Two independent save/restore pairs on one material do not compose:
                // a bumper hit landing in the last 90ms of a 620ms cue would snapshot the LIFTED
                // value, the cue would then restore the true rest value, and the hit's own restore
                // would fire afterwards and put the lifted value back - leaving that bumper stuck
                // bright until something else happened to write it.
                //
                // bumperCapMat is written once at construction and never again; the hit reaction
                // deliberately excludes it (flashing one shared instance would light all four caps
                // at once - see its own comment). For a HIT that is a bug, but for a CUE meaning
                // "hit the pop bumpers, all of them" it is exactly the right semantics, and it
                // leaves the hit reaction's materials entirely alone.
                liftEmissive([scene.getMaterialByName('bumperCapMat')],
                    new BABYLON.Color3(0.38, 0.38, 0.45));
                return;
            }
            if (type === 'comet') {
                const comet = scene.getMeshByName('comet');
                // The comet's resting emissive is near-black - it is the board's one deliberately
                // unlit feature - so a multiplier does nothing useful here and it is lifted to an
                // absolute value instead.
                liftEmissive([comet && comet.material], COLOR_COMET.scale(0.55));
            }
        }

        // Briefly lifts a set of materials' emissive and puts it back. Written out rather than
        // reusing pulseBumperLamp() for the bumper branch above, even though that helper does
        // exactly this shape, because its 90ms is the duration of a BUMPER HIT REACTION - and a
        // cue is not a hit. Measured on the first version, borrowing it gave the bumpers a 90ms
        // blink against the lanes' 620ms, so the one objective a new player is most likely to be
        // shown first was also the one whose cue was easiest to miss. Sharing the helper would
        // also mean any future retune of the hit reaction silently retimes this.
        //
        // The restore is a plain setTimeout, unlike the lamp system's tick-driven flashLamp(). A
        // pause landing inside the window leaves the element lit under the overlay for the
        // remainder, then restores on schedule - timers are not pause-gated, so this self-heals
        // rather than sticking. At MISSION_CUE_MS that is at most a few hundred milliseconds of a
        // brighter bumper behind a pause menu, which is not worth a second timer system.
        //
        // Re-entrancy is handled explicitly rather than assumed away. Two overlapping lifts on one
        // material do not compose: the second would snapshot the already-LIFTED value as its
        // "rest", and whichever restore ran last would leave the material stuck bright. That is
        // not hypothetical - it is exactly the bug that moved the bumper cue off the hit
        // reaction's materials, and completing a vision and immediately selecting the same one
        // again inside MISSION_CUE_MS would reach it a second way. liftPending keeps the FIRST
        // snapshot as the authority and lets a later lift only re-arm the timer, so the material
        // always lands back on the value it had before any cue touched it.
        const liftPending = new Map(); // material -> { rest: Color3, timer }
        // Takes an absolute colour rather than a multiplier, deliberately. A multiplier is the
        // obvious signature and it is the wrong one here: the three cued surfaces rest at wildly
        // different levels (the bumper caps at 0.20, the comet near black, the lanes at their dim
        // 0.12), so the same factor would produce three different brightnesses and the cue would
        // read as three different events. Absolute targets land all three within 1.0-1.25, which
        // is what makes "this is the cue" recognisable across objectives.
        function liftEmissive(materials, absoluteColor) {
            const targets = materials.filter((m) => m && m.emissiveColor);
            if (!targets.length) return;
            targets.forEach((m) => {
                const existing = liftPending.get(m);
                // Only snapshot when nothing is already holding this material's true rest value.
                const rest = existing ? existing.rest : m.emissiveColor.clone();
                if (existing) clearTimeout(existing.timer);
                m.emissiveColor = absoluteColor.clone();
                const timer = setTimeout(() => {
                    liftPending.delete(m);
                    if (m.emissiveColor) m.emissiveColor.copyFrom(rest);
                }, MISSION_CUE_MS);
                liftPending.set(m, { rest, timer });
            });
        }

        function startMission(index) {
            mission.state = 'active';
            mission.selectedIndex = index;
            mission.progress = 0;
            mission.required = missionRequiredCount(mission.rank);
            syncMissionTargetLamps(); // invitation taken up - the targets stop pulsing
            backglass.state.missionName = MISSION_DEFS[index].name;
            backglass.state.missionProgress = 0;
            backglass.state.missionRequired = mission.required;
            // Name AND objective (user-requested). One string, not a second showMessage() call:
            // showMessage() has no queue, so a follow-up would just silently overwrite this one
            // (see its own comment). The trailing colon after the name is what makes
            // drawMessage()'s greedy two-line wrap break exactly on the name/objective boundary
            // for all three visions - measured; a dash or a slash there orphans the separator at
            // the start of line 2. See MISSION_DEFS for the full surface-by-surface measurement,
            // including why the steady VISION window and #mission-hud do NOT carry this.
            // 900 -> 1400ms. The brief is that a player understands what to hit next within about
            // a second, and this single message carries BOTH the vision's name and its objective
            // across two wrapped lines - 900ms to read two lines and then look at the table for the
            // cue below is not a second's worth of reading, it is a glimpse. The wrap itself is
            // unchanged; only the dwell is longer.
            backglass.showMessage(
                'VISION: ' + MISSION_DEFS[index].name + ': ' + MISSION_DEFS[index].objective,
                MISSION_SELECT_MESSAGE_MS
            );
            // Light the objective's own hardware, once, so the text above has something on the
            // table to point at. Runs last so it lands with the message rather than before it.
            cueMissionObjective(index);
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
            syncMissionTargetLamps(); // back to inviting the next vision
            // Bug fix (playtest audit): at the top rank (index RANK_NAMES.length - 1), mission.rank
            // was already capped by this same Math.min() below, but the message still read
            // "ASCENSION: <top state>" regardless - misleading every time a vision completed after
            // reaching max rank, since no rank-up actually happened. Confirmed via a forced-max-
            // rank Playwright test. Now only shown when the rank index genuinely changed. (Written
            // against the old naval ladder, where the top rank was 'Fleet Admiral'; the ladder has
            // since been rethemed - see RANK_NAMES - and the index arithmetic is what matters.)
            const rankedUp = mission.rank < RANK_NAMES.length - 1;
            mission.rank = Math.min(mission.rank + 1, RANK_NAMES.length - 1);
            stats.missionsCompleted++;
            backglass.state.missionName = null;
            backglass.state.missionProgress = 0;
            backglass.state.rank = RANK_NAMES[mission.rank];
            backglass.state.rankColor = STATE_COLORS[mission.rank];
            addScore(MISSION_COMPLETE_BONUS);
            // Bonus/multiplier subsystem (user-requested) - a "substantial" contribution to the
            // hidden end-of-ball pool, on top of (not instead of) the immediate MISSION_COMPLETE_
            // BONUS above. Doesn't touch mission/rank state or messaging at all - purely additive.
            ballBonus.points += BONUS_MISSION_COMPLETE_AMOUNT;
            // Two beats, one slot, chosen by which one actually happened (see rankedUp above).
            // A normal completion IS the progression - it is what advanced the state - so it
            // announces the state gained. At the top of the ladder there is no state left to
            // gain, so it names the thing that WAS gained instead of repeating a state the
            // player already has. Was 'VISION COMPLETE!'; there is deliberately no plain
            // "vision complete" message, because every completion is one or the other of these.
            const stateHex = STATE_COLORS[mission.rank];
            backglass.showMessage(
                rankedUp ? 'ASCENSION: ' + RANK_NAMES[mission.rank] : 'INSIGHT GAINED',
                1600,
                // Tinted with the state being announced - the one moment the ladder's colour is
                // worth spending attention on. INSIGHT GAINED takes the top state's colour since
                // that is the state the player is sitting at when it fires.
                stateHex
            );
            // A stronger beat than any regular hit's - completing a vision and ascending is the
            // single biggest moment the game currently has, deserves to read as one. Camera shake
            // and punch are unchanged; the two additions below are what lift it above an ordinary
            // hit, and every piece is an existing primitive with an optional argument, not a new
            // effect system and not a cutscene.
            //
            // The whole beat is over well inside a second and NOTHING is paused: physics keeps
            // stepping, the ball keeps travelling, input stays live. Longest element is the
            // existing rank-up arpeggio at ~740ms; the flash is 260ms and the burst's particles
            // are dead by ~600ms. The backglass message outlives all of it at 1600ms, but that is
            // a panel readout the player can ignore, not an interruption.
            const [sr, sg, sb] = hexStringToRgb(stateHex);
            // Brief spectral wash in the state's own colour. Peak 0.22, not flashScreen()'s
            // default 0.5 - see that function's comment for why a mid-play flash must not be a
            // whiteout. Already a no-op under reduced motion inside flashScreen() itself.
            flashScreen(260, sr, sg, sb, 0.22);
            // Chakra spark burst at the ball, in the state's colour. Emitted where the ball IS,
            // which is also where the player's eye needs to stay - the ball is still live and
            // still travelling through all of this.
            //
            // Reduced motion suppresses this extra burst the same way buildChakraSparkle() does
            // (returns null outright) rather than the vortex's reduce-the-rate approach, because
            // there is nothing to reduce in a one-shot. Deliberately gated HERE at the call site
            // and not inside spawnHitBurst(), which every ordinary hit shares - silencing those
            // too would be a change to existing feedback nobody asked for. A reduced-motion player
            // still gets the tinted ASCENSION message and the arpeggio, the same "clear, if
            // motion-free, acknowledgement" triggerLaunchFiredFlash() already settles on.
            if (!window.SPIRITBALL_reducedMotion) {
                spawnHitBurst(scene, particleTexture, mainBall.mesh, highFidelity,
                    new BABYLON.Color3(sr / 255, sg / 255, sb / 255), 'ascensionBurst');
            }
            triggerCameraShake(500, 0.01);
            triggerCameraPunch(500, new BABYLON.Vector3(0, 0.02, -0.03));
            // Unchanged: the existing four-note rising arpeggio (392 -> 523 -> 659 -> 784) is
            // already the right shape for an ascension and already distinct from every other
            // sound in the game. Refining it would mostly mean lengthening it, which the ~1s
            // budget does not have room for.
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
        //
        // Timer audit fix: this used to be a real setTimeout (hitCooldowns as a Set, cleared by a
        // wall-clock callback). Every one of this file's ~13 physical-hit/trigger cooldowns
        // (bumper, comet, Saturn, slingshot, wall, flipper, mission target, reentry lane, side
        // lane, both orbit triggers, Vision Gate) routed through it, and a setTimeout keeps
        // counting down even while isPaused is true - confirmed via a standalone check, not
        // assumed. Pausing gates Havok's own step (scene.physicsEnabled = false), so this rarely
        // mattered in practice (no new collision can fire mid-pause to consult a stale cooldown),
        // but a ball resting in continuous contact with a collider at the exact moment physics
        // resumes could still see a cooldown that "silently" expired during the pause and get an
        // extra hit it shouldn't. Converted to the same remaining-ms-decremented-by-the-render-
        // loop's-own-deltaMs idiom every other continuous timer in this file already uses
        // (updateDropTargetBank()/updateSkillShot()/updateBallSave()) - see updateHitCooldowns()
        // below, called from the render loop's existing !isPaused block - so cooldowns now freeze
        // exactly like everything else during a pause instead of being the one exception.
        const hitCooldowns = new Map(); // mesh -> remainingMs
        // Phantom/double-scoring audit (?dev=1) - a ring buffer of every raw trigger ENTER Havok
        // reports against mainBall, logged at the very top of handleTriggerHit() below before any
        // of the skillShot/drain/cooldown/active-state gating runs, so a genuine double-fire from
        // Havok itself (e.g. a fast pass tunneling through a thin trigger and re-entering, or a
        // slow pass jittering across a boundary) is visible and distinguishable from a real second
        // physical traversal. Stays null (the push below becomes a no-op) for a normal player -
        // populated and exposed as window.__triggerDebug only under ?dev=1, see its own devMode
        // block further down.
        let triggerEnterLog = null;
        function isOnCooldown(mesh) {
            return hitCooldowns.has(mesh);
        }
        function setCooldown(mesh, durationMs) {
            hitCooldowns.set(mesh, durationMs);
        }
        function updateHitCooldowns(deltaMs) {
            hitCooldowns.forEach((remainingMs, mesh) => {
                const next = remainingMs - deltaMs;
                if (next <= 0) hitCooldowns.delete(mesh);
                else hitCooldowns.set(mesh, next);
            });
        }

        // Lightweight scale-pulse as this stage's hit feedback - a 3D-appropriate stand-in for
        // the 2D version's tween-based flash (Stage 8's particle/VFX system will do this properly
        // later; this is enough to make a hit feel registered in the meantime).
        //
        // extraMeshes (bumper visual-upgrade pass, user-requested - "tiny scale/impact reaction if
        // safe"): optional companion meshes (the bumpers' decorative cap/insert) that get the same
        // brief scale pulse as the primary mesh, WITHOUT the emissive-flash half of the treatment -
        // some of those companion materials (the shared bumper cap) are reused across multiple
        // fixtures, so mutating their emissiveColor here the way the primary mesh's material is
        // mutated below would bleed the flash into every other fixture sharing that material at
        // once. Scale-only sidesteps that while still giving the whole fixture a unified "impact"
        // read, not just its collider. Defaults to none - every pre-existing call site is
        // unaffected.
        function pulseMesh(mesh, scale = 1.3, extraMeshes = []) {
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
            const extras = extraMeshes.filter(Boolean).map((m) => ({ mesh: m, original: m.scaling.clone() }));
            extras.forEach(({ mesh: m }) => m.scaling.scaleInPlace(scale));
            setTimeout(() => {
                if (!mesh.isDisposed()) {
                    mesh.scaling.copyFrom(original);
                    if (originalEmissive) mat.emissiveColor.copyFrom(originalEmissive);
                }
                extras.forEach(({ mesh: m, original: o }) => { if (!m.isDisposed()) m.scaling.copyFrom(o); });
            }, 100);
        }

        // Pop-bumper hit reaction: a short emissive lift on the body and its lamp ring, and
        // nothing else. Deliberately NOT pulseMesh(): that also scales the mesh 1.4x for 100ms,
        // and a bumper visibly inflating on every hit is the one thing that gives away that the
        // fixture is a prop rather than a lit lamp behind plastic. Scaling also fought the new
        // moulded base, which stays put while the dome it is seated in grew.
        //
        // Cheap by construction, which matters on mobile: two emissiveColor writes and one
        // timeout per hit. No light is created, no geometry is touched, nothing runs per frame.
        // The scale-up is a MULTIPLIER on each material's own resting emissive, so each bumper
        // brightens in its own colour rather than all four flashing the same white.
        //
        // The shared cap material is deliberately excluded - flashing that one instance would
        // light up all four caps at once. Same reason the cap was already excluded before.
        // Re-entrancy guard, same shape and same reason as liftEmissive()'s liftPending above -
        // which documents this exact hazard for the mission cue and was the reason that cue was
        // moved off these materials in the first place. This function had the unguarded version:
        // it snapshotted whatever emissive it found, so a second pulse landing inside the first
        // one's 90ms window captured the ALREADY-LIFTED value as its rest, and the later restore
        // wrote the lifted value back permanently - the bumper stayed bright until something else
        // happened to overwrite it.
        //
        // It survived because the cluster's old diamond geometry made a re-pulse inside 90ms
        // essentially unreachable: isOnCooldown() gates this call at COOLDOWN_BUMPER_MS = 300ms per
        // MESH, and the nearest other bumper was 160mm away. The shot-corridor refactor puts the
        // four bumpers in a row 40mm apart edge to edge, which is what a pop-bumper nest is for -
        // and a ball in a nest produces exactly the overlapping-contact pattern this could not
        // survive. Caught by qa/skin-bumper-cap.js's revert check.
        //
        // Two details that matter: the lift is taken from REST (rest.scale(2.1)), never from the
        // current value, so a re-pulse is 2.1x rather than 4.4x; and a re-pulse re-arms the timer
        // rather than adding a second one, so there is always exactly one pending restore holding
        // the one true rest value.
        const bumperPulsePending = new Map(); // material -> { rest: Color3, timer }
        function pulseBumperLamp(meta) {
            const targets = [meta.bodyMat, meta.lampMat].filter((m) => m && m.emissiveColor);
            if (!targets.length) return;
            targets.forEach((m) => {
                const existing = bumperPulsePending.get(m);
                const rest = existing ? existing.rest : m.emissiveColor.clone();
                if (existing) clearTimeout(existing.timer);
                m.emissiveColor = rest.scale(2.1);
                const timer = setTimeout(() => {
                    bumperPulsePending.delete(m);
                    if (m.emissiveColor) m.emissiveColor.copyFrom(rest);
                }, 90);
                bumperPulsePending.set(m, { rest, timer });
            });
        }

        // Physical hits: comet/slingshots already bounce the ball via restitution (set in
        // buildObstacles()) - for those kinds this only adds the score/cooldown/feedback layer on
        // top, it does NOT set the ball's velocity by hand the way the 2D version's hitSatellite()/
        // hitSlingshot() did. That manual angle-based bounce was a workaround for Arcade Physics
        // circles not imparting real force on overlap; real rigid-body contact response in Havok
        // makes it unnecessary, not just redundant - see 04-*.md's flipper implementation note for
        // the same reasoning applied to flippers. Bumpers (and, since the active-obstacle power-
        // hierarchy pass, Saturn) are the deliberate exception: a real pop bumper actively fires
        // the ball away rather than just reflecting it, and Saturn is narratively the board's other
        // "boss" hit, so both the 'bumper' and 'saturn' branches below add a real, controlled
        // velocity kick on top of the restitution bounce via applyRadialKick() - see its comment
        // for how that kick is kept bounded, and SPECIAL_EVENT_KICK_SPEED_MS's own comment for why
        // Saturn didn't have one before this pass.
        //
        // Shared by both callers (not two near-duplicate functions) because the underlying math is
        // identical - only the magnitude differs (BUMPER_KICK_SPEED_MS for a regular bumper,
        // SPECIAL_EVENT_KICK_SPEED_MS for the boss bumper and Saturn, both passed in by the caller
        // rather than hardcoded here).
        function applyRadialKick(mesh, kickSpeed) {
            const body = mainBall.aggregate.body;
            if (!body) return;

            // Horizontal (X/Z) direction from the obstacle's center to the ball's current position -
            // "horizontal" deliberately excludes Y so the kick can't launch the ball vertically off
            // the table, just push it away across the playfield the way a real pop bumper does.
            const dx = mainBall.mesh.position.x - mesh.position.x;
            const dz = mainBall.mesh.position.z - mesh.position.z;
            const horizontalDist = Math.sqrt(dx * dx + dz * dz);
            // Degenerate case (ball reported dead-center over the obstacle, horizontally) - no
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
                v.x + dirX * kickSpeed,
                v.y,
                v.z + dirZ * kickSpeed
            ));

            // Re-clamped through the same ceiling updateBallPhysics() enforces every frame (see
            // clampBodySpeed()'s comment), applied immediately rather than waiting for next frame -
            // this is what actually bounds the kick: no incoming speed, kick magnitude, or run of
            // repeated hits (each individual obstacle is still separately rate-limited by its own
            // per-kind cooldown below) can ever push the ball past MAX_BALL_SPEED_MS.
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

        // Ball<->flipper physics-tuning pass (user-requested). Havok's contact response for the
        // flipper's kinematic (ANIMATED) body turned out to be purely positional - confirmed by
        // direct playtest measurement, not assumed (see syncFlipperPhysicsVelocity()'s and
        // FLIPPER_CONTACT_VELOCITY_TRANSFER's own comments for the measurement itself) - so unlike
        // every other obstacle in this file, a flipper hit needs an explicit velocity contribution
        // here to carry the paddle's own motion into the ball at all. Still "physically coherent
        // velocity transfer from paddle motion/contact" (user-requested), not an arbitrary kick:
        // the direction and magnitude both come from the SAME v = omega x r rigid-body math a
        // native engine would use, evaluated at the REAL contact point Havok itself reported
        // (contactPointWorld, from the collision event itself - not the paddle's center of mass),
        // which is exactly what makes a tip hit (farther from the pivot, larger cross-product
        // radius) carry more speed than a base hit without a single per-position special case.
        // omega is naturally zero whenever the flipper isn't actually moving this frame (held at a
        // stop, resting, or the tail of a return that's about to snap to rest) - so a resting/held
        // contact adds nothing here and stays governed purely by FLIPPER_RESTITUTION/
        // FLIPPER_FRICTION's passive bounce, which is what keeps a held flipper from continuously
        // injecting energy into a ball it's cradling.
        function applyFlipperContactVelocity(flipper, contactPointWorld) {
            const body = mainBall.aggregate.body;
            if (!body || flipper.angularVelocityRad === 0) return;

            const pivotPos = flipper.pivotNode.getAbsolutePosition();
            const r = contactPointWorld.subtract(pivotPos);
            const paddleVelocityAtContact = BABYLON.Vector3.Cross(
                new BABYLON.Vector3(0, flipper.angularVelocityRad, 0), r
            );

            const v = body.getLinearVelocity();
            body.setLinearVelocity(v.add(paddleVelocityAtContact.scale(FLIPPER_CONTACT_VELOCITY_TRANSFER)));

            // Same shared safety ceiling every other velocity source respects - see
            // clampBodySpeed()'s comment. Bounds this regardless of how many times this fires
            // during one swing - whether that's several genuinely separate touches (a ball
            // bouncing against the paddle more than once before flying clear) or one sustained
            // COLLISION_CONTINUED contact reporting on every physics step.
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
            const plastic = mesh.metadata.plastic;

            const rubber = mesh.metadata.rubber;

            // The body no longer stretches sideways, it only compresses slightly into its housing.
            //
            // The old 1.5x-wide, 0.6x-deep stretch was written when this box WAS the visible rubber
            // - the only part of the fixture there was - and stretching it read as a band under
            // load. Now that there is a real rubber band strung between real posts, widening the
            // body just pushes it out past those posts, and the fixture visibly comes apart on
            // every kick. The stretch moves to the rubber below, where it belongs, and the body
            // gets the recoil.
            //
            // This also anchors to the fixture's real rest scale (captured in buildObstacles())
            // rather than to whatever is applied right now: the hit branch calls pulseMesh(mesh)
            // immediately before this, so the old `mesh.scaling.clone()` compounded with pulseMesh's
            // own 1.3x into a measured 1.95x balloon rather than the 1.5x it documented. Setting
            // from restScale supersedes that pulse for this one fixture, the same call
            // pulseBumperLamp() already makes for the pop bumpers and for the same reason - a
            // moulded mechanism that inflates on contact gives away that it is a box.
            const restScale = mesh.metadata.restScale;
            mesh.scaling.set(restScale.x, restScale.y, restScale.z * 0.88);

            // The rubber snaps FORWARD off its posts and flattens, which is what a struck slingshot
            // band actually does. -Z is the striking face in the rig's local frame (see
            // buildObstacles()), so this is a straight push out toward the ball.
            const rubberRestZ = rubber ? rubber.position.z : 0;
            const rubberRestScale = rubber ? rubber.scaling.clone() : null;
            if (rubber) {
                rubber.position.z = rubberRestZ - 0.0032;
                rubber.scaling.z = rubberRestScale.z * 0.65;
                rubber.scaling.y = rubberRestScale.y * 1.25;
            }

            // The flash lands on the lit plastic first and the housing second - on a real machine
            // the plastic is the part that flashes, and it is the only part of this fixture bright
            // enough at rest for a lift to read as "that just fired". Both materials are
            // per-instance clones, so this can never bleed onto the other slingshot.
            const flashed = [housing, plastic].filter((m) => m && m.material && m.material.emissiveColor)
                .map((m) => ({ mesh: m, mat: m.material, original: m.material.emissiveColor.clone() }));
            flashed.forEach(({ mat }, idx) => {
                mat.emissiveColor = idx === 0
                    ? new BABYLON.Color3(0.85, 0.5, 0.85)  // housing: a lift, not a blowout - it is structure
                    : new BABYLON.Color3(1, 0.75, 1);      // plastic: bright magenta-white, the actual lamp
            });

            setTimeout(() => {
                if (!mesh.isDisposed()) mesh.scaling.copyFrom(restScale);
                if (rubber && !rubber.isDisposed()) {
                    rubber.position.z = rubberRestZ;
                    rubber.scaling.copyFrom(rubberRestScale);
                }
                flashed.forEach(({ mesh: m, mat, original }) => {
                    if (!m.isDisposed()) mat.emissiveColor.copyFrom(original);
                });
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

        // Called every frame from the render loop (gated by !isPaused, same as
        // updateDropTargetBank()/updateSkillShot()/updateBallSave()) - see laneBankResetRemainingMs'
        // own declaration comment for why this replaced a bare setTimeout.
        function updateLaneBankReset(deltaMs) {
            if (laneBankResetRemainingMs <= 0) return;
            laneBankResetRemainingMs -= deltaMs;
            if (laneBankResetRemainingMs <= 0) {
                laneBankResetRemainingMs = 0;
                resetLaneBank();
            }
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
            const now = gameplayClockMs; // timer audit fix - was performance.now(), see its own comment
            COMBO_DEFS.forEach((def, i) => advanceCombo(def, comboProgress[i], type, now));
        }

        // A COMBO_DEFS entry just completed. Tracks a SEPARATE thing from that entry's own
        // progress: chaining multiple combos back to back escalates comboStreak.tier (displayed
        // as "COMBO x2", "x3"...), capped at COMBO_MAX_TIER and reset to 1 if too long passes
        // since the last one. Camera feedback is deliberately fixed regardless of tier ("avoid
        // excessive screen flash/camera shake") - only score, sound, and the message text scale.
        function fireCombo(def) {
            const now = gameplayClockMs; // timer audit fix - was performance.now(), see its own comment
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
            // Phantom-scoring audit fix: handleDrain() sets ballInPlay=false the instant the ball
            // first enters the drain trigger, but the ball itself isn't teleported away until
            // resetBallToPlunger() actually runs - up to BALL_SAVE_RETURN_DELAY_MS/1500ms later
            // (longer still on a real drain, since startBonusCount()'s payout sequence runs
            // first). Havok keeps simulating it for that whole window, so it can keep bouncing
            // off nearby bumpers/slingshots/walls/flippers and firing real COLLISION_STARTED
            // events for contact the player didn't make. None of that may score once the ball has
            // already left play.
            if (!ballInPlay) return;
            if (isOnCooldown(mesh)) return;
            if (meta.kind === 'bumper') {
                setCooldown(mesh, COOLDOWN_BUMPER_MS);
                // Board redesign: the boss bumper (index 0, see buildObstacles()) is worth more
                // and gets its own message/pitch, otherwise identical handling.
                const points = meta.boss ? SCORE_BOSS_BUMPER : SCORE_ATTACK_BUMPER;
                addScore(points);
                stats.bumperHits++;
                recordComboShot('bumper'); // combo scoring (user-requested) - feeds 'TRIPLE BUMPER'
                applyRadialKick(mesh, meta.boss ? SPECIAL_EVENT_KICK_SPEED_MS : BUMPER_KICK_SPEED_MS);
                // Feedback bumped slightly (pulse scale, shake, sound volume) above the shared
                // defaults now that bumpers actively kick the ball - the hit should read as a
                // touch punchier than a passive bounce, without changing scoring or any other
                // obstacle kind's feedback (all other pulseMesh()/playHitSound() call sites are
                // untouched, defaulting back to their original 1.3x/0.14 values).
                pulseBumperLamp(meta); // emissive-only lamp pulse - see pulseBumperLamp() for why a bumper must not scale on hit
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
                // bumper cluster's own boss bumper above - including, since the active-obstacle
                // power-hierarchy pass, the same real velocity kick that boss bumper gets
                // (applyRadialKick() with SPECIAL_EVENT_KICK_SPEED_MS - see its own comment).
                // Previously Saturn relied purely on Havok's own restitution bounce, so its
                // resulting speed scaled with whatever the ball happened to be carrying instead of
                // reliably reading as the board's biggest hit.
                setCooldown(mesh, COOLDOWN_SATURN_MS);
                addScore(SCORE_SATURN);
                stats.saturnHits++;
                applyRadialKick(mesh, SPECIAL_EVENT_KICK_SPEED_MS);
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

        // Dev diagnostics (?dev=1 only, see updateDevHud() in main()) - "last trigger kind";
        // handleTriggerHit() is the single entry point for every trigger-based collision (orbits,
        // lanes, vision gate, skill shot lanes, re-entry lanes, drain zone, etc.), so this is the
        // natural place to record it. Purely a diagnostic breadcrumb - no gameplay effect.
        let lastTriggerKind = null;

        function handleTriggerHit(mesh) {
            const meta = mesh.metadata;
            if (!meta) return;
            lastTriggerKind = meta.kind || null;
            if (triggerEnterLog) {
                triggerEnterLog.push({
                    t: gameplayClockMs, kind: meta.kind, side: meta.side, index: meta.index,
                    ballInPlay, onCooldown: isOnCooldown(mesh)
                });
                if (triggerEnterLog.length > 300) triggerEnterLog.shift();
            }
            // Upper-lane skill shot (user-requested) - same "any real contact ends the window"
            // reasoning as handlePhysicalHit()'s guard; 'skillShotLane' is exempt since touching
            // one only ever upgrades the pending result (its own branch below), never closes the
            // window by itself.
            if (skillShot.active && meta.kind !== 'skillShotLane') endSkillShot();
            if (meta.kind === 'drainZone') {
                handleDrain();
                return;
            }
            // Phantom-scoring audit fix: same reasoning as handlePhysicalHit()'s own ballInPlay
            // guard just above - handleDrain() (above) sets ballInPlay=false the instant the ball
            // first enters the drain trigger, but the ball keeps physically rolling for up to
            // ~1.5s+ before resetBallToPlunger() actually moves it. The drain zone spans the full
            // table width right behind the flippers (DRAIN_ZONE_WIDTH_M = TABLE_WIDTH_M), so a
            // drained ball can still cross the inlanes/outlanes, re-enter an orbit, or even
            // re-enter the Vision Gate before it's actually removed from play - none of those are
            // a real shot once the ball has left play, so nothing below may score, arm, or capture
            // against it. Checked after the drainZone branch above (not before) so the drain
            // trigger that sets ballInPlay=false in the first place is unaffected by its own guard.
            if (!ballInPlay) return;
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
                // Unchanged from before this upgrade - still feeds the 'lane' mission (displayed
                // as 'RETURN TO BODY', see MISSION_DEFS) on every scoring hit, lit or not. What is
                // passed here is the TYPE, never the name. Kept fully separate from the bank-complete
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
                    laneBankResetRemainingMs = LANE_BANK_RESET_DELAY_MS; // timer audit fix - was setTimeout(resetLaneBank, ...), see laneBankResetRemainingMs' own comment
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
                lampSystem.flashLamp(meta.lampId, 220, isOutlane ? COLOR_OUTLANE_LAMP : COLOR_LANE_LAMP);
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
                orbitState[meta.side].armedAt = gameplayClockMs; // timer audit fix - was performance.now(), see gameplayClockMs' own comment
                lampSystem.flashLamp(meta.lampId, 150, COLOR_ORBIT_LAMP);
                triggerCameraShake(40, 0.0015);
                playOrbitEnterSound();
            } else if (meta.kind === 'orbitCompletion') {
                setCooldown(mesh, COOLDOWN_ORBIT_MS);
                const armedAt = orbitState[meta.side].armedAt;
                const withinWindow = armedAt !== null && gameplayClockMs - armedAt <= ORBIT_COMPLETION_WINDOW_MS;
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

        // Bug fix (playtest audit): handleDrain()'s post-drain setTimeout is a plain JS timer,
        // not gated by scene.physicsEnabled the way real physics stepping is - confirmed via
        // Playwright that pausing during its window did NOT stop it from firing underneath the
        // pause overlay (resetBallToPlunger()/showGameOverScreen() would run while the player
        // couldn't see it happening, and in the Game-Over case, gameOverOverlay could end up
        // display:flex at the same time as pauseOverlay). pendingDrainAction defers that action
        // until resumeGame() actually runs it, instead of letting it fire invisibly.
        //
        // Scope note after the end-of-ball pass: this now guards ONE path, the BALL SAVED return
        // delay. The real-drain path that motivated it no longer schedules a timer - it runs a
        // render-loop-driven sequence inside the loop's own !isPaused gate (see
        // startEndOfBallSequence()), which is immune to this class of bug by construction rather
        // than by deferral. Kept as-is rather than converted alongside it: a ball save is not a
        // ball change, its 700ms is one delay and not a sequence, and rewriting a working path
        // that this pass was not asked to touch would be scope it did not have.
        let pendingDrainAction = null;

        // Drain lifecycle audit fix: the raw setTimeout below (the BALL SAVED return delay, and
        // before the end-of-ball pass the real-drain delay too) was never
        // cancellable - pendingDrainAction only guards the "still paused when the timer fires"
        // case. If the timer was still in flight (not yet fired) when startNewGame() ran - e.g.
        // the player opened the pause menu mid-delay and immediately hit New Game, all well before
        // the delay elapsed - nothing stopped it from firing later against the FRESH game: its
        // captured `action` closure reads whatever ballBonus/lives/etc happen to hold at fire
        // time, which by then belong to the new game, not the ball that actually drained.
        // Confirmed via Playwright: New Game during the drain delay, followed by a real launch,
        // saw the new ball snapped back to the plunger (a stale resetBallToPlunger()) once the
        // original delay's wall-clock mark passed. Tracking the handle and clearing it in
        // startNewGame() - same clearTimeout-on-reset idiom the Vision Gate's own colorTimers
        // array already uses - stops the stale callback from ever running at all, rather than
        // trying to make its effects conditional after the fact.
        let drainTimeoutHandle = null;

        // Same reasoning as pendingDrainAction above, for the Vision Gate's own post-capture
        // eject timer (see startVisionGateCapture() in main()) - a plain JS setTimeout isn't
        // gated by scene.physicsEnabled either, so pausing mid-sequence must defer the eject
        // rather than let a kinematic-to-dynamic switch + velocity kick fire invisibly underneath
        // the pause overlay.
        let pendingVisionGateEject = null;

        // Stale-callback audit fix: the eject setTimeout scheduled in startVisionGateCapture()
        // was never itself cancellable - only the "still paused when it fires" case was covered
        // (via pendingVisionGateEject above). visionGate.ball being cleared to null by
        // startNewGame() makes a stale eject harmless IF no new capture starts before it fires
        // (endVisionGateCapture()'s own `if (!ball...) return;` guard catches that case) - but if
        // a New Game happens mid-capture and the player relaunches straight into a SECOND,
        // legitimate capture before the OLD capture's original ~1.8s eject mark, visionGate.ball
        // is no longer null by then - it's the NEW capture's ball - so the stale timer would
        // wrongly end/eject the new capture early. Confirmed via Playwright: a second capture
        // started well inside the first one's eject window had visionGate.active/ball forced back
        // to false/null (and the ball kicked back to dynamic) partway through what should still
        // have been its own active window. Tracking the handle here - same clearTimeout-on-reset
        // idiom drainTimeoutHandle already uses - and clearing/reassigning it both in
        // startNewGame() and at the top of every new startVisionGateCapture() call closes this:
        // a capture's own eject timer is always the only one that can ever fire for it.
        let visionGateEjectTimeoutHandle = null;

        // Dev diagnostics (?dev=1 only, see updateDevHud() in main()) - "last reset reason", set
        // inside cancelVisionGateCapture() (see its own comment). Purely a diagnostic breadcrumb.
        let lastResetReason = null;

        // ===================================
        // End-of-ball sequence (user-requested). A ball change used to say one thing and then go
        // quiet: 'DRAINED!' for 1400ms, 100ms of nothing, a bonus count that only happened if this
        // ball had earned something, and then the ball silently reappearing at the plunger. Three
        // of the four things a player needs at a ball change were missing or conditional - what
        // the bonus paid (skipped entirely at zero), where the run now stands, and that a new ball
        // is up at all.
        //
        // Four ordered beats, driven off the render loop's own deltaMs rather than a setTimeout
        // chain. That is the same idiom updateBonusCount()/updatePowerUp()/updateDropTargetBank()
        // already use here, and it buys two things the old raw setTimeout(1500) needed a
        // workaround for: the sequence freezes with a pause instead of firing invisibly underneath
        // the overlay (which is what pendingDrainAction exists to patch around on the paths that
        // still use timers), and its pacing does not depend on how much wall-clock a given frame
        // takes on a given device.
        //
        // "Mobile and desktop behave identically" is a property of that structure rather than
        // something checked at each beat: nothing in this sequence reads pointer type, touch
        // controls, viewport, or input method, and every duration is a shared constant. The only
        // device-conditional thing anywhere near a drain is vibrateDevice() on the ball-save path,
        // which is a capability that either exists or does not, on a path this sequence never
        // touches.
        //
        // Deliberately NOT a fifth beat for anything else. The brief was a brisk transition, not
        // an arcade bookkeeping reel: no per-shot itemisation, no stats roll, no "SHOOT AGAIN"
        // ceremony. Beats are also skipped rather than padded when they have nothing to say - see
        // the game-over branch, which drops STATE and NEXT BALL because the Game Over screen it
        // hands off to already prints the final state, and there is no next ball.
        const END_OF_BALL_BEAT_LOST = 0;
        const END_OF_BALL_BEAT_BONUS = 1;
        const END_OF_BALL_BEAT_STATE = 2;
        // `waiting` means this beat is not on a clock of its own - it is parked until the bonus
        // count signals completion through its own onComplete. Kept separate from remainingMs so
        // a paused frame cannot advance a beat that is waiting on another subsystem.
        const endOfBall = { active: false, beat: -1, remainingMs: 0, waiting: false, gameOver: false };

        // Starts the sequence for a real drain (never a ball save - that is not a ball change).
        // Called with lives already decremented, so `lives <= 0` here is the authoritative "this
        // was the last ball" answer for the whole sequence and is latched rather than re-read: a
        // dev reset or any other write to `lives` mid-sequence must not turn a game-ending drain
        // into a ball change halfway through it.
        function startEndOfBallSequence() {
            endOfBall.active = true;
            endOfBall.gameOver = lives <= 0;
            enterEndOfBallBeat(END_OF_BALL_BEAT_LOST);
        }

        // Wipes the sequence without running any of its remaining beats. Same "starting fresh
        // makes in-progress state stale" reasoning startNewGame() already applies to bonusCount
        // and pendingDrainAction: left running, a sequence belonging to the ball that just
        // drained would keep posting messages over a fresh game and would eventually reset a
        // ball the player may have already launched.
        function cancelEndOfBallSequence() {
            endOfBall.active = false;
            endOfBall.beat = -1;
            endOfBall.remainingMs = 0;
            endOfBall.waiting = false;
            endOfBall.gameOver = false;
        }

        function enterEndOfBallBeat(beat) {
            endOfBall.beat = beat;
            endOfBall.waiting = false;
            // Every showMessage() below is given its beat's duration plus a margin. showMessage()
            // clears itself on a raw setTimeout (wall-clock, like every other message in this
            // file), while the beat advances on gameplay deltaMs - so on an ordinary frame the
            // next beat overwrites the message well before its own clear fires, and a pause landing
            // mid-beat costs a blank panel rather than a stuck one. Same margin idiom
            // updateBonusCount()'s per-tick messages already use.
            if (beat === END_OF_BALL_BEAT_LOST) {
                // 'BALL LOST', not the 'DRAINED!' this replaces. "Drained" is pinball jargon: it
                // is the correct word and it is exactly the word a first-time player does not
                // have. The lives readout has already ticked down and pulsed by the time this
                // shows, so the count is covered - this beat only has to name the event.
                backglass.showMessage('BALL LOST', END_OF_BALL_LOST_MS + 200);
                endOfBall.remainingMs = END_OF_BALL_LOST_MS;
                return;
            }
            if (beat === END_OF_BALL_BEAT_BONUS) {
                // Asked before starting, because startBonusCount() resolves a zero bonus by
                // calling onComplete() synchronously - which would finish this beat inside the
                // call that began it and leave the machine advancing twice in one frame.
                if (pendingBonusTotal() <= 0) {
                    // The old flow simply had no bonus beat at all when nothing was earned, which
                    // is how a subsystem becomes invisible: a player who never lands a major shot
                    // never learns that a bonus pool exists to be filled. Stating it costs 380ms.
                    backglass.showMessage('NO BONUS', END_OF_BALL_NO_BONUS_MS + 200);
                    endOfBall.remainingMs = END_OF_BALL_NO_BONUS_MS;
                    return;
                }
                // The existing count-up, unchanged and unduplicated - this beat owns none of the
                // payout, the pacing, or the messages, it only waits for them. remainingMs stays
                // at 0 the whole time; `waiting` is what holds the machine.
                endOfBall.waiting = true;
                startBonusCount(() => {
                    endOfBall.waiting = false;
                });
                return;
            }
            // STATE + vision progress. Both are permanent backglass readouts - the STATE row and
            // the VISION window - and both are hidden for the entire sequence, because redraw()
            // returns early while a message is up rather than drawing the transient zone under
            // it. So this beat is not duplicating the panel; it is the only time either value is
            // readable during a ball change.
            //
            // Two facts, one string, one showMessage() call: showMessage() has no queue, so a
            // second call would silently overwrite the first (see its own comment). Left to
            // drawMessage()'s greedy two-line wrap and shrink-to-fit, which is what the mission
            // select message already relies on for the same reason.
            //
            // Tinted with this state's own colour, the second of the two sites STATE_COLORS is
            // used for (the other being the ASCENSION toast) - so the ladder the player is
            // climbing is legible as colour here too, not just as a word.
            // The rank's own internal space is made non-breaking, which looks like a fussy detail
            // and is not. drawMessage() wraps greedily on spaces, so the only two-word rank name
            // splits across the two lines at the size the fit loop settles on: measured, every
            // rank produced ['STATE <RANK>', 'VISION n/n'] except COSMIC SELF with a vision
            // running, which produced ['STATE COSMIC', 'SELF VISION 3/3'] - the player's own
            // hard-won top state broken in half. One token cannot be split, so this fixes it for
            // every rank name, present or future, without special-casing the wrap or padding the
            // string to a length that happens to shrink the font enough.
            //
            // U+00A0 rather than a narrower trick because it is what the shipped font stack
            // actually draws: rendered at the panel's own 86px floor, 'STATE COSMIC\u00a0SELF' and
            // 'STATE COSMIC SELF' come back pixel-identical (0 differing pixels, against 579 for a
            // one-letter control), so there is no tofu box and no width change - just a space the
            // wrap is not allowed to break on.
            const rankName = RANK_NAMES[mission.rank].replace(/ /g, '\u00a0');
            // mission.progress survives a drain by design - only dropTargetBank, ballBonus and
            // the combo chain reset between balls - so this genuinely reads as "carry on from
            // here" rather than as a scoreline. 'VISION READY' rather than a zero for the idle
            // case: there is no vision to be 0/3 of, and the useful thing to say is that hitting
            // a target will start one.
            const visionPart = mission.state === 'active'
                ? 'VISION ' + mission.progress + '/' + mission.required
                : 'VISION READY';
            backglass.showMessage('STATE ' + rankName + ' ' + visionPart,
                END_OF_BALL_STATE_MS + 200, STATE_COLORS[mission.rank]);
            endOfBall.remainingMs = END_OF_BALL_STATE_MS;
        }

        // Advanced from the render loop's existing !isPaused block, alongside updateBonusCount()
        // - which this sequence's BONUS beat is parked on, so the two must tick in the same gate
        // or a paused bonus count would hold a running sequence open forever.
        function updateEndOfBallSequence(deltaMs) {
            if (!endOfBall.active) return;
            if (endOfBall.waiting) return;
            endOfBall.remainingMs -= deltaMs;
            if (endOfBall.remainingMs > 0) return;

            if (endOfBall.beat === END_OF_BALL_BEAT_LOST) {
                enterEndOfBallBeat(END_OF_BALL_BEAT_BONUS);
                return;
            }
            if (endOfBall.beat === END_OF_BALL_BEAT_BONUS) {
                if (endOfBall.gameOver) {
                    // Straight to Game Over after the payout, exactly as the old flow did: the
                    // bonus is paid before the lives check either way, so a last-ball bonus is
                    // never swallowed. STATE and NEXT BALL are dropped rather than shortened -
                    // the Game Over screen prints FINAL STATE itself, and there is no next ball
                    // to announce.
                    cancelEndOfBallSequence();
                    showGameOverScreen();
                    return;
                }
                enterEndOfBallBeat(END_OF_BALL_BEAT_STATE);
                return;
            }
            finishEndOfBallSequence();
        }

        // NEXT BALL. Deliberately not a beat of the machine: the ball returns and the message is
        // posted in the same instant, and the sequence is over before the message finishes, so
        // the player can launch straight through it instead of waiting out one more dwell. That
        // is also what keeps this whole flow no slower to a playable ball than the two-beat
        // version it replaces, despite carrying two more beats of information.
        function finishEndOfBallSequence() {
            cancelEndOfBallSequence();
            backglass.redraw();
            resetBallToPlunger();
            // Drop-target bank reset (user-requested upgrade) - real drop-target banks reset at
            // the start of each new ball, not mid-ball. Unchanged from the old onComplete; only
            // its call site moved.
            resetDropTargetBank();
            // Bonus/multiplier subsystem reset - "multiplier resets appropriately between balls."
            // The BONUS beat above has already paid this ball's total, so zeroing here is safe.
            ballBonus.points = 0;
            ballBonus.multiplierX = 1;
            backglass.state.bonusMultiplierX = 1;
            resetCombos();
            // Posted last, after resetBallToPlunger() has put the ball back and after redraw(),
            // so nothing above can overwrite it. Ball number rather than lives remaining: "BALL 2
            // OF 3" says where the player is in the run, where "2 BALLS LEFT" says the same thing
            // in the units of the readout that is already on screen and already just pulsed.
            backglass.showMessage(
                'BALL ' + (STARTING_LIVES - lives + 1) + ' OF ' + STARTING_LIVES,
                END_OF_BALL_NEXT_BALL_MS
            );
        }

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
            // end-of-ball sequence at all (this is not a ball change - see
            // startEndOfBallSequence()), and none of the per-ball resets below run (dropTargetBank/laneBank/
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
                drainTimeoutHandle = setTimeout(() => {
                    drainTimeoutHandle = null;
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
            pulseLivesHud();
            // BALL SAVE reset (fairness mechanics) - this life is genuinely over now, so the next
            // one gets its own fresh save opportunity (see armBallSave()'s "usedThisLife" gate).
            ballSave.usedThisLife = false;
            triggerCameraShake(400, 0.008); // matches checkDrain()'s cameraShake(400, 0.008)
            flashScreen(200, 255, 0, 0); // matches checkDrain()'s cameraFlash(200, 255, 0, 0, true) - red
            // Quick downward dip - a 3D-only "snap toward the void" beat with no 2D equivalent
            // (that camera couldn't move through space at all).
            triggerCameraPunch(400, new BABYLON.Vector3(0, -0.03, 0));
            playDrainSound();
            // End-of-ball sequence (user-requested) - replaces a raw setTimeout(1500) whose whole
            // job was to sit silently between 'DRAINED!' and the bonus count, and whose callback
            // then did every remaining ball-change job at once with no announcement of any of
            // them. The BALL LOST message, the bonus payout, the state/vision readout, the ball
            // return and the per-ball resets are all beats of that sequence now; it owns this
            // path's pacing from here, including the game-over hand-off.
            //
            // No pendingDrainAction wrapper, unlike the ball-save branch above and unlike the
            // timer this replaces: those defer a wall-clock callback that would otherwise fire
            // underneath the pause overlay, and the sequence has no wall-clock callback to defer -
            // it advances on render-loop deltaMs inside the loop's own !isPaused gate, so a pause
            // stops it where it stands and a resume carries on from there.
            startEndOfBallSequence();
        }

        mainBall.aggregate.body.setCollisionCallbackEnabled(true);
        mainBall.aggregate.body.getCollisionObservable().add((event) => {
            const mesh = event.collidedAgainst.transformNode;
            // Real momentum transfer for a flipper hit - see applyFlipperContactVelocity()'s own
            // comment for why this can't just be Havok's native contact response the way every
            // other obstacle in this file relies on. Listens to COLLISION_CONTINUED too, not just
            // COLLISION_STARTED: a ball resting on the paddle when it fires stays in unbroken
            // contact as the paddle accelerates under it (confirmed via playtest - Havok never
            // reports a fresh COLLISION_STARTED for that whole stroke, only the original at-rest
            // touch), so a STARTED-only hook would silently miss exactly the "cradled ball gets
            // thrown" case real pinball relies on. Applied before handlePhysicalHit() purely so the
            // velocity is already updated by the time any feedback/scoring logic might read it -
            // handlePhysicalHit() itself is otherwise unchanged (no new branch there, and it's
            // still called only on COLLISION_STARTED, matching every other obstacle's feedback/
            // scoring cadence).
            if ((event.type === 'COLLISION_STARTED' || event.type === 'COLLISION_CONTINUED') &&
                mesh.metadata && mesh.metadata.kind === 'flipper') {
                const flipper = mesh === leftFlipper.mesh ? leftFlipper : rightFlipper;
                applyFlipperContactVelocity(flipper, event.point);
            }
            if (event.type !== 'COLLISION_STARTED') return;
            handlePhysicalHit(mesh);
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
        // The FINAL STATE line and a Visions Completed stat line (see showGameOverScreen() below)
        // were deliberately NOT shown when this stage was built - no mission FSM existed yet, so a
        // final state would've just been a permanently-fake placeholder. Both now show real,
        // earned values - see improvement-prompts/05-*.md. (Both read "Final Rank"/"Missions
        // Completed" until the user-requested terminology pass; the state itself is still
        // mission.rank internally.)
        const menuOverlay = document.getElementById('menu-overlay');
        // Visual length of the title screen's exit fade. Must match #menu-overlay.is-starting's
        // transition-duration in index.html; nothing about gameplay is gated on it.
        const MENU_EXIT_MS = 170;
        let menuUp = false;
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
        // Title-screen presentation pass: the "HIGH SCORE" legend is now a static sibling element
        // in index.html, so this writes the VALUE only - the two are styled as legend-over-value,
        // the same grammar #player-hud and the backglass already use.
        document.getElementById('menu-highscore').textContent = String(backglass.state.highScore);
        document.getElementById('menu-start-label').textContent =
            touchControlsActive() ? 'TAP TO START' : 'PRESS SPACE TO START';
        menuOverlay.style.display = 'flex';
        menuUp = true;
        // Deliberately NOT auto-focusing the CTA, despite the overlay's aria-modal. Measured in
        // Chromium: a programmatic .focus() matches :focus-visible even when the player has only
        // ever used the mouse, so autofocus puts a 3px ring around the button on every load for
        // everyone. It would buy keyboard users exactly one Tab (Babylon puts a tabIndex on
        // #renderCanvas for its own key handling, so the canvas is first in the order), and it
        // buys them nothing at all for the action the button actually names - SPACE dismisses the
        // menu from anywhere, focus or no focus.

        // Dismissing the title screen is now two separate things happening at two different
        // speeds, and keeping them separate is the whole point.
        //
        // LOGICALLY the menu is gone on the same tick as the input - menuUp flips synchronously,
        // so every guard that asks "are we still at the menu?" (the Space handler, the launch
        // press handler, the dev HUD's phase readout) sees the answer immediately and the player's
        // very next input is live. VISUALLY the overlay spends ~170ms fading out over the game
        // that has already started underneath it. Nothing waits on the animation; there is no
        // artificial delay in front of gameplay.
        //
        // Those guards used to read `menuOverlay.style.display === 'flex'` directly, which made
        // the CSS the state machine. That works only as long as hide is instantaneous - the
        // moment the overlay lingers for a fade, every one of them would keep reporting MENU for
        // 170ms and would swallow the input that arrives during it. menuUp is the single source
        // of truth precisely so the visual can take as long as it likes.
        function isMenuUp() {
            return menuUp;
        }

        // Idempotent: the click-anywhere handler, the Space handler and a click on the CTA itself
        // can all arrive for one dismissal (a keyboard activation of the button fires both the
        // Space handler and a synthetic click), and re-entering must not restart the fade.
        function hideMenuScreen() {
            if (!menuUp) return;
            menuUp = false;
            // Name the starting state here too, not only in startNewGame(). Dismissing the title
            // screen never calls startNewGame() - it only hides the overlay and ends attract mode,
            // because a page load already begins with fresh state - so putting the message solely
            // there would have skipped the FIRST game of every session, which is exactly the run
            // where the player has not seen the ladder yet. This function is the one thing both
            // dismissal paths (Space and tap-anywhere) share, and its menuUp guard above means it
            // cannot fire twice. startNewGame() covers restart and pause -> NEW GAME.
            backglass.showMessage('STATE: ' + RANK_NAMES[0]);
            menuOverlay.classList.add('is-starting');
            // Matches the transition duration in index.html. Under prefers-reduced-motion that
            // transition is removed, so the overlay is already invisible well before this fires
            // and the player sees a straight cut - same code path, no branch.
            setTimeout(() => {
                menuOverlay.style.display = 'none';
                menuOverlay.classList.remove('is-starting');
            }, MENU_EXIT_MS);
        }

        // Tap-anywhere-to-start, matching MenuScene's this.input.once('pointerdown', ...) in
        // ../index.js - the overlay covers the full screen while visible, so this naturally
        // takes priority over the flipper zones/launch button underneath without needing to
        // modify their own handlers.
        //
        // Input-boundary audit fix: this used to also call handleLaunchPress() ("also ends
        // attract mode internally"), on the theory that dismissing the menu and starting to
        // charge the launch are the same gesture. That's a reasonable idea for a real
        // press-and-hold (keydown/keyup are a correctly-paired hold - see the Space keydown
        // handler, which used to do the same thing), but 'click' is a DISCRETE, already-completed
        // gesture - it fires only after the touch/mouse release has already happened - with no
        // matching "release" of its own to end a charge it starts. Confirmed via Playwright: a
        // single tap-to-dismiss left plungerCharging running with nothing to stop it, climbing to
        // and sitting at max power indefinitely (no charge was ever consciously intended by the
        // player) - and a later, entirely unrelated mouseup/touchend landing on the launch button
        // (e.g. a drag-release, or any real pointer activity near it) would silently fire an
        // accidental full-power launch off that stale charge. Both this and the Space keydown
        // handler now agree: dismissing a screen only ever dismisses it (+ ends attract mode, still
        // idempotent/safe to call directly); charging always requires the player's own explicit,
        // separate press on the actual launch control afterward - matching how restarting from
        // Game Over already behaved even before this fix (see gameOverOverlay's own 'click'
        // listener below, which never called handleLaunchPress() either).
        menuOverlay.addEventListener('click', () => {
            hideMenuScreen();
            endAttractMode();
        });

        // --- Controls reference content, platform-aware (archive/release-prompts/04-*.md's content -
        // this already-replaced the old non-functional sound/music toggle with a real controls
        // reference; that decision carries over unchanged, just re-rendered as DOM). ---
        function renderControlsRows() {
            const rowsEl = document.getElementById('controls-rows');
            rowsEl.innerHTML = '';
            const rows = isMobileDevice ? [
                ['◀ / ▶ BUTTONS', 'Left / Right Flippers'],
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
        // Pause panel's status footer (presentation only - see index.html's pause block). The
        // progression state lives on the backglass, and the pause scrim covers the backglass, so
        // pausing used to hide the one number the panel had room to show. This reads the state
        // the panel is ALREADY displaying and writes it into the footer; it sets no state, owns
        // no state, and is safe to call whenever the overlay becomes visible.
        const pauseStatusState = document.getElementById('pause-status-state');
        const pauseSummaryScore = document.getElementById('pause-summary-score');
        const pauseSummaryVisionRow = document.getElementById('pause-summary-vision-row');
        const pauseSummaryVision = document.getElementById('pause-summary-vision');
        const pauseSummaryProgress = document.getElementById('pause-summary-progress');
        function syncPauseStatus() {
            if (!pauseStatusState) return;
            pauseStatusState.textContent = backglass.state.rank;
            pauseStatusState.style.color = backglass.state.rankColor || STATE_COLORS[0];
            // String(score), matching setScore()'s own formatting rather than adding thousands
            // separators here: #player-hud stays visible through the pause, and a summary that
            // renders the same number differently from the readout beside it reads as a bug.
            if (pauseSummaryScore) pauseSummaryScore.textContent = String(score);
            if (pauseSummaryVisionRow) {
                // Shown only while a vision is actually running. backglass.state.missionName is
                // null between visions (see its own declaration), which is the same signal
                // #mission-hud and the backglass window both already use for their idle state.
                const activeVision = backglass.state.missionName;
                pauseSummaryVisionRow.hidden = !activeVision;
                if (activeVision) {
                    pauseSummaryVision.textContent = activeVision;
                    pauseSummaryProgress.textContent =
                        backglass.state.missionProgress + '/' + backglass.state.missionRequired;
                }
            }
        }

        function openPauseMenu() {
            if (isPaused || gameOverActive || isMenuUp()) return;
            isPaused = true;
            scene.physicsEnabled = false;
            syncPauseStatus();
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
            // Also refreshed on the way back from Controls - the panel is being re-shown, and a
            // deferred drain resolved during the detour could have moved the state.
            syncPauseStatus();
            pauseOverlay.style.display = 'flex';
        }

        // Matches restartGame()'s scene.start('GameScene') in ../index.js - straight back into
        // gameplay, no menu detour. Resets all run state, not just the ball's position.
        function startNewGame() {
            // Discard any drain outcome deferred by a pause mid-delay (see handleDrain()'s
            // pendingDrainAction comment) - starting fresh here makes it stale; left set, it
            // would incorrectly fire against this new game's state on a future pause/resume.
            pendingDrainAction = null;
            // Drain lifecycle audit fix - the raw drain-delay/ball-save-return setTimeout itself
            // (see drainTimeoutHandle's own comment) isn't caught by the pendingDrainAction clear
            // above unless the game happened to be paused the instant it fired; cancel it outright
            // so a still-in-flight timer from the ball that just drained can never fire against
            // this new game's fresh state at all.
            if (drainTimeoutHandle !== null) {
                clearTimeout(drainTimeoutHandle);
                drainTimeoutHandle = null;
            }
            // Same reasoning, for a bonus count that's actively mid-sequence (not just scheduled)
            // at the moment of a hard reset - updateBonusCount() only checks bonusCount.active
            // each render-loop tick, with no awareness of which game/ball its `total`/`onComplete`
            // belong to, so left running it would keep paying leftover points from the OLD ball
            // into this new game's fresh score and then call the OLD onComplete (itself another
            // resetBallToPlunger()) against a ball the player may have already relaunched.
            // Confirmed via Playwright: New Game mid-count, followed by a real launch, kept
            // gaining score from the stale count and then got yanked back to the plunger once it
            // finished.
            bonusCount.active = false;
            bonusCount.onComplete = null;
            bonusCount.ticksRemaining = 0;
            bonusCount.remainingMs = 0;
            bonusCount.awarded = 0;
            bonusCount.total = 0;
            // Same reasoning again, one level up: the end-of-ball sequence WRAPS that count, so
            // clearing the count alone would leave a sequence parked on a completion callback
            // that can now never fire (its `waiting` flag holds until bonusCount calls back, and
            // the call was just cancelled) - a permanently active sequence that blocks launch
            // input for the rest of the run. Cancelled outright rather than run to completion:
            // its remaining beats belong to the ball that drained, and finishEndOfBallSequence()
            // would reset a plunger this function is about to reset anyway.
            cancelEndOfBallSequence();
            // Same "starting fresh makes any deferred/in-progress state stale" reasoning as
            // pendingDrainAction above, extended to a Vision Gate capture that might genuinely be
            // in progress (color-cycle timers running, sparkle alive, ball held kinematic) at the
            // moment of a hard reset (e.g. the dev "RESET BALL TO PLUNGER" button, or a future
            // menu path). Interruption-lifecycle audit fix: consolidated into the shared
            // cancelVisionGateCapture() helper (also used by endVisionGateCapture()'s natural eject
            // and resetBallToPlunger()'s own hard reset) instead of duplicating the same ~15 lines
            // here. No separate setMotionType(DYNAMIC) needed after this - resetBallToPlunger()
            // below now guarantees that unconditionally itself (ball-reset authoritative-definition
            // audit fix, see its own comment), so the old redundant belt-and-suspenders copy of
            // that line that used to live here was removed.
            cancelVisionGateCapture('newGame');
            score = 0;
            // High-score audit fix - see its own declaration comment; a fresh game hasn't set a
            // record yet, regardless of whether the previous one did.
            newHighScoreThisGame = false;
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
            // Timer audit fix - per-run state, same reasoning as everything else here: a stray
            // hit-cooldown or pending lane-bank-reset countdown from the previous game has no
            // business surviving into a fresh one (see hitCooldowns'/laneBankResetRemainingMs' own
            // comments for why these are no longer real setTimeouts that could otherwise fire
            // against this new game's state regardless).
            hitCooldowns.clear();
            laneBankResetRemainingMs = 0;
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
            syncMissionTargetLamps();
            mission.rank = 0;
            backglass.state.rank = RANK_NAMES[0];
            backglass.state.rankColor = STATE_COLORS[0];
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
            // High-score audit fix: the menu screen's own high-score line is only ever painted
            // once, at initial page load - nothing currently re-shows that overlay after this
            // point in a session, but keeping its text in sync here is cheap and means it can
            // never go stale if a future path (or a dev/debug route) does bring it back.
            const menuHighScoreEl = document.getElementById('menu-highscore');
            if (menuHighScoreEl) menuHighScoreEl.textContent = String(backglass.state.highScore);
            backglass.redraw();
            // Name the starting state out loud (user-requested). Every other progression beat
            // announces itself on this panel, so the run beginning at the bottom of the ladder
            // should too - the STATE row alone changes silently. No duration passed: this takes
            // showMessage()'s own 1100ms default rather than inventing a new number, and it is
            // last-message-wins like every other toast, so the first launch's own message simply
            // replaces it if the player is quick.
            backglass.showMessage('STATE: ' + RANK_NAMES[0]);
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

        // Pause/duplicate-activation audit fix: this used to also listen for 'touchstart'
        // (with e.preventDefault() to suppress the browser's compatibility 'click' that would
        // otherwise follow) - a common pattern for shaving off perceived tap latency. Confirmed
        // via Playwright that a real single tap does NOT double-fire this on the current build
        // (Chromium correctly honors the synchronous preventDefault()), but that safety depends
        // entirely on an implicit browser contract that isn't guaranteed everywhere (older
        // WebViews, some in-app browsers, assistive-tech input paths that synthesize 'click'
        // directly without ever dispatching touch events at all) - and there's no redundant
        // guard in this code if that contract ever doesn't hold: a synthetic click landing after
        // touchstart, bypassing the suppression, was confirmed to double-toggle pause/resume back
        // to back. touch-action: none (index.html) plus the page's own
        // width=device-width viewport meta already eliminate the legacy ~300ms tap-delay 'click'
        // is sometimes blamed for, so the extra listener bought no latency win. It was therefore
        // removed in favour of a single canonical 'click' listener - the same pattern every other
        // button in this pause/controls flow uses (pause-resume-btn/pause-newgame-btn/
        // pause-controls-btn/controls-back-btn are all click-only) - which structurally cannot
        // double-fire, since only one event type is registered at all.
        //
        // That reasoning holds for those four buttons and does NOT hold for this one, which is
        // what the correction below fixes. They only ever exist on an overlay, where nothing else
        // can be held; this one sits over live play, where something almost always is - and tap
        // latency was never the reason it needs a touch path.
        //
        // Demo-session QA fix: click-only made this button DEAD on touch whenever another control
        // was already held. Browsers only synthesise a compatibility 'click' for a primary touch,
        // so a second-finger tap on a click-only element produces no click at all - measured, the
        // button received 0 click events while #launch-btn, #flipper-zone-left or
        // #flipper-zone-right was held, against 1 with nothing held. Holding a flipper is the
        // normal state during play and a phone has no Escape key, so the only pause control was
        // unreachable exactly when a player wanted it: they had to let go of the flipper first.
        //
        // So the touch listener comes back - but with the redundant guard whose absence is the
        // whole reason the audit above removed it. That comment's objection was never "touchstart
        // is wrong", it was "if the preventDefault contract doesn't hold, a synthetic click lands
        // after touchstart and double-toggles, and nothing here catches it." lastTouchToggleMs
        // catches it: a touch-driven toggle stamps the clock, and any click arriving inside
        // CLICK_AFTER_TOUCH_SUPPRESS_MS is treated as that tap's own echo and dropped. The guard
        // is one-directional on purpose - it can only ever suppress a CLICK, never a touch - so a
        // deliberate rapid double-tap (pause then immediately resume) still toggles twice.
        //
        // Accessibility is unaffected: keyboard and assistive-tech activation of a real <button>
        // arrives as a click with no preceding touch, so the stamp is stale and the click passes.
        let lastTouchToggleMs = -Infinity;
        // Comfortably longer than the ~50-350ms a compatibility click trails its touch by, and
        // harmless if it over-reaches: the only thing inside the window is a click, and the only
        // way to be inside it is to have just toggled by touch.
        const CLICK_AFTER_TOUCH_SUPPRESS_MS = 700;
        function togglePauseFromButton(e) {
            e.preventDefault();
            if (e.type === 'touchstart') {
                lastTouchToggleMs = performance.now();
            } else if (performance.now() - lastTouchToggleMs < CLICK_AFTER_TOUCH_SUPPRESS_MS) {
                return; // the compatibility click for a tap this handler already acted on
            }
            if (isPaused) {
                resumeGame();
            } else {
                openPauseMenu();
            }
        }
        // Not passive: the whole point is the synchronous preventDefault() above, which a passive
        // listener is not allowed to make. Deliberately NOT routed through the
        // trackTouchStart/trackTouchEnd identifier map the flipper/launch zones use - this is a
        // discrete tap, not a held control, and it must not occupy a slot in that map or the
        // window-level touchend would try to release a control it never pressed.
        pauseBtn.addEventListener('touchstart', togglePauseFromButton, { passive: false });
        pauseBtn.addEventListener('click', togglePauseFromButton);

        // ESC: single persistent listener (archive/release-prompts/07-*.md's lesson - check state each
        // time a key event fires, don't re-register a resume/back shortcut every time a screen
        // opens, which is what caused the original listener-leak bug this ports the fix from).
        // Backs out of the Controls submenu to the pause menu instead of resuming outright when
        // that submenu is open, matching the 2D version's exact behavior.
        window.addEventListener('keydown', (e) => {
            if (e.code !== 'Escape') return;
            // Input-boundary audit fix: Escape auto-repeats like any other key, and every branch
            // below is a TOGGLE, so a held Escape was strobing the game between paused and running
            // once per repeat - confirmed via Playwright (a hold with an odd number of repeats
            // ended up un-paused, i.e. the player's deliberate pause had been undone by their own
            // still-held key). Only the true off->on edge may act. Unlike the flipper handler
            // above, an e.repeat bail is exactly right here: there is no held-state to latch, and
            // a missed initial keydown just means no pause, never a stuck control.
            if (e.repeat) return;
            if (controlsOverlay.style.display === 'flex') {
                backFromControlsScreen();
                return;
            }
            if (isPaused) {
                resumeGame();
            } else if (!gameOverActive && !isMenuUp()) {
                openPauseMenu();
            }
        });

        // --- Game Over screen, ported from GameOverScene in ../index.js. Triggered from
        // handleDrain() above when lives reach 0 (previously that just reset score/lives in
        // place - see this stage's implementation note). ---
        // Detail readout labels (Game Over retheme, user-requested - "replace military/progression
        // language"). Every one of these used to end in a combat verb: Bumper HITS, Orbit SHOTS,
        // Vision Gate CAPTURES, Target Bank CLEARS, Kickbacks USED, Power-Ups COLLECTED. Read as a
        // block that was the register of an after-action report, on the closing screen of a game
        // about visions.
        //
        // Fixed by one rule rather than nineteen rewrites: drop the verb and name the feature. The
        // count is already in its own column, so "BUMPERS 42" says everything "Bumper Hits: 42"
        // did, in the machine's own vocabulary and in fewer characters - which is also what lets
        // this block be two columns instead of a nineteen-line list.
        //
        // Two are deliberately NOT reduced to a bare noun. SKILL SHOTS keeps its verb because a
        // skill shot is the name of a real pinball mechanic, not a hit counter, and BALL SAVES the
        // same. BEST COMBO drops "Tier" - the ladder word this pass was asked to remove, and one
        // the player never sees anywhere else.
        const GAME_OVER_DETAIL_LABELS = [
            ['BUMPERS', 'bumperHits'],
            ['COMET', 'cometHits'],
            ['SATURN', 'saturnHits'],
            ['TARGETS', 'targetHits'],
            ['RE-ENTRY LANES', 'laneHits'],
            ['INLANES', 'inlaneHits'],
            ['OUTLANES', 'outlaneHits'],
            ['LEFT ORBIT', 'leftOrbitShots'],
            ['RIGHT ORBIT', 'rightOrbitShots'],
            ['VISION GATE', 'visionGateCaptures'],
            ['POWER-UPS', 'powerUpsCollected'],
            ['TARGET BANKS', 'targetBankCompletions'],
            ['LANE BANKS', 'laneBankCompletions'],
            ['COMBOS', 'combosCompleted'],
            ['BEST COMBO', 'comboMaxTier'],
            ['SKILL SHOTS', 'skillShotsAwarded'],
            ['BALL SAVES', 'ballSaves'],
            ['KICKBACKS', 'kickbacksUsed']
        ];

        function showGameOverScreen() {
            gameOverActive = true;
            playGameOverSound();
            // Raw digits, not thousands-separated - #player-hud and the backglass HIGH SCORE
            // window both print scores this way on purpose (see that window's own comment: two
            // score readouts formatting the same kind of number differently is what makes a
            // cabinet feel assembled from parts). Tabular figures in the CSS do the alignment
            // work a separator would otherwise be doing here.
            document.getElementById('gameover-score').textContent = String(score);

            // FINAL STATE. backglass.state.rank holds this run's genuine final state, and
            // rankColor the matching STATE_COLORS entry - set together at every site that assigns
            // either, so this cannot show one state's name in another's colour.
            const stateEl = document.getElementById('gameover-rank-line');
            stateEl.textContent = backglass.state.rank;
            stateEl.style.color = backglass.state.rankColor || STATE_COLORS[0];

            // Promoted out of the detail block into the summary, per the requested hierarchy -
            // it is the one tally that measures the actual objective of a run.
            document.getElementById('gameover-visions').textContent = String(stats.missionsCompleted);

            // High-score audit fix - see newHighScoreThisGame's own declaration comment for why
            // this can't just compare score to backglass.state.highScore here (addScore() already
            // synced them by now, in both the "genuinely beat it" and "merely tied it" cases).
            // Unchanged logic; only what it writes changed, from one concatenated sentence into
            // the row's label and value.
            const hsRow = document.getElementById('gameover-highscore-row');
            const hsLabel = document.getElementById('gameover-highscore-label');
            const hsLine = document.getElementById('gameover-highscore-line');
            if (newHighScoreThisGame) {
                hsLabel.textContent = 'NEW HIGH SCORE';
                hsLine.textContent = String(backglass.state.highScore);
                hsRow.classList.add('is-new-record');
                hsLine.classList.add('pulse-text');
            } else {
                hsLabel.textContent = 'HIGH SCORE';
                hsLine.textContent = String(backglass.state.highScore);
                hsRow.classList.remove('is-new-record');
                hsLine.classList.remove('pulse-text');
            }

            // Label and value as separate nodes, not one 'Label: 42' string, so the CSS can lay
            // the row out as a readout with the number in the digit face - which is what the rest
            // of this machine's surfaces do with a label/value pair.
            const statsEl = document.getElementById('gameover-stats');
            statsEl.innerHTML = '';
            let shown = 0;
            GAME_OVER_DETAIL_LABELS.forEach(([label, key]) => {
                const value = stats[key];
                if (!(value > 0)) return;
                shown++;
                const row = document.createElement('p');
                row.appendChild(document.createTextNode(label));
                const v = document.createElement('span');
                v.textContent = String(value);
                row.appendChild(v);
                statsEl.appendChild(row);
            });
            // A run that scored none of these gets no empty RUN DETAIL heading over an empty grid
            // - the old screen drew the container regardless and left a gap.
            document.getElementById('gameover-detail').hidden = shown === 0;

            document.getElementById('gameover-restart-instructions').textContent =
                touchControlsActive() ? 'TAP ⚡ TO PLAY AGAIN' : 'PRESS SPACE TO PLAY AGAIN';
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
            // Phantom/double-scoring audit instrumentation - see triggerEnterLog's own declaration
            // comment (near hitCooldowns) for what this captures and why. Exposed on window so it
            // can be inspected from devtools (or an automated test) during on-device tuning without
            // adding any visible UI.
            triggerEnterLog = [];
            window.__triggerDebug = { log: triggerEnterLog };

            // Backglass state, exposed for qa/onboarding.js under the same ?dev=1-only, read-only
            // convention as __flipperDebug/__triggerDebug above. The onboarding hints live in this
            // object as strings, and the alternative - reading them back off the 1024x480 canvas
            // with pixel sampling, the way qa/state-palette.js has to for colours - cannot tell
            // "HOLD SPACE TO LAUNCH" from "HIT A LIT TARGET". This is the same object the panel
            // itself renders from, so a test reading it cannot drift from what a player sees.
            window.__backglassDebug = backglass.state;

            // End-of-ball sequence state, for qa/end-of-ball.js - same ?dev=1-only, read-only
            // convention as __backglassDebug directly above. The beat a drain is currently in is
            // not recoverable from the panel: several beats can share a message length, and the
            // gap between "waiting on the bonus count" and "counting down its own beat" is
            // invisible from outside. `sequence` is the same object the sequence itself runs on,
            // so a test reading it cannot drift from what actually ran; bonusTotal is the same
            // read startBonusCount() makes, exposed so a test can assert the payout landed
            // exactly rather than restating the formula and drifting from it. A wrapper rather
            // than hanging bonusTotal off `endOfBall` itself - a diagnostic must not add fields
            // to live gameplay state.
            window.__endOfBallDebug = { sequence: endOfBall, bonusTotal: pendingBonusTotal };

            // Flipper-geometry regression test instrumentation (qa/flipper-geometry.js) - same
            // "?dev=1-only, read-only, zero impact on a real player" convention as
            // window.__triggerDebug directly above. Deliberately narrow (just the two flipper
            // objects plus the two constants needed to derive a tip position) rather than the
            // broad window.__qaHook the older qa/stabilization-suite.js needs to be temporarily
            // patched in by hand - this one is small enough to stay permanently in the shipped
            // file, so the geometry test that reads it never requires a source edit to run. No
            // setters, no way to mutate gameplay state through it - tipWorldPosition()/
            // pivotWorldPosition() only ever read flipper.pivotNode's existing transform, the same
            // pivot-hierarchy math createFlipper()/setFlipperAngle() themselves use, never a
            // second/competing formula.
            // mainBall/scene added for the ball<->flipper physics-tuning pass (user-requested) -
            // same read-only-in-spirit exposure as leftFlipper/rightFlipper above (no new setter
            // methods; a test harness can still reach into the exposed objects directly, same as
            // it always could for the flippers, e.g. to stage a scenario's starting position/
            // velocity before letting Havok's own step run). scene is exposed so a test can hook
            // scene.onBeforeRenderObservable for per-physics-tick sampling, immune to the render
            // loop's own throttling under slow/headless rendering.
            window.__flipperDebug = {
                leftFlipper, rightFlipper, FLIPPER_SWEEP_RAD, FLIPPER_LENGTH_M, mainBall, scene,
                isBallInPlay() { return ballInPlay; },
                // Attract-camera introspection, for qa/attract-camera.js. Scrubbing the cycle
                // clock is the only way to inspect a specific framing: the shots are 13.5s apart,
                // so waiting for them in real time would make that suite minutes long. The timing
                // is published rather than duplicated in the test, so the two cannot drift apart.
                attract: {
                    dwellMs: ATTRACT_DWELL_MS,
                    moveMs: ATTRACT_MOVE_MS,
                    shotNames: ATTRACT_SHOTS.map((shot) => shot.name),
                    camera: attractCamera,
                    seek(ms) {
                        attractElapsedMs = ms;
                        updateAttractCamera(attractCamera, ms, attractCamera.framing);
                    }
                },
                // Exposes the SAME per-frame stepping function the real render loop calls every
                // tick (see engine.runRenderLoop() below) - not a second/competing implementation.
                // Lets a test drive many small, controlled-deltaMs steps back-to-back (e.g.
                // alongside scene.getPhysicsEngine()._step()) independent of however fast this
                // particular device/sandbox can actually render a frame, which matters for
                // measuring a fast powered stroke: a slow/throttled render loop can complete the
                // whole ~115ms stroke within a single real frame, leaving no intermediate sample
                // where the ball can genuinely be caught mid-swing.
                updateFlipperMotor,
                // Ball-feel tuning pass (user-requested) - same "expose the real per-frame
                // function, not a second implementation" rationale as updateFlipperMotor above.
                // Lets a test exercise the actual MAX_BALL_SPEED_MS clamp / anti-stuck kick path
                // (updateBallPhysics()) at manual-step speed, alongside scene.getPhysicsEngine().
                // _step(), instead of only the raw Havok response - needed to confirm the existing
                // safety systems still engage correctly during this pass's tuning experiments.
                updateBallPhysics,
                // Active-obstacle-physics normalization pass (user-requested) - same "expose the
                // real per-frame function" rationale as the two above. Lets a test drive
                // hitCooldowns' own real decay (updateHitCooldowns()) at manual-step speed
                // alongside scene.getPhysicsEngine()._step(), so a controlled comparison of
                // bumper/slingshot/Saturn/comet kick magnitudes can wait out real per-object
                // cooldowns between measurements (and deliberately hit within cooldown to confirm
                // stacking is actually prevented) without needing real wall-clock time to pass in
                // this sandbox's slow render loop. hitCooldowns itself is exposed read-only
                // (inspecting Map contents only, no mutation) purely so a test can assert whether
                // a given mesh is currently gated, the same thing isOnCooldown() itself checks.
                updateHitCooldowns, hitCooldowns,
                // Backglass readability pass (user-requested) - same "expose the real object, not
                // a second implementation" rationale as everything above. Lets a test drive
                // backglass.state directly (mission/multiplier/bonus/message) and call its own
                // real redraw()/showMessage() to inspect the actual rendered DynamicTexture output
                // for every tier/combination without needing to play through the real, much
                // slower mission-select/powerup/lane-bank flows that would otherwise be required
                // to reach each state at least once.
                backglass,
                pivotWorldPosition(flipper) {
                    return flipper.pivotNode.getAbsolutePosition().clone();
                },
                tipWorldPosition(flipper) {
                    // Tip, in the pivot's own local space: the inner edge sits at local (0,0,0)
                    // (exactly on the pivot - see createFlipper()'s own comment), so the outer tip
                    // sits one full FLIPPER_LENGTH_M further out along local +X.
                    return BABYLON.Vector3.TransformCoordinates(
                        new BABYLON.Vector3(FLIPPER_LENGTH_M, 0, 0),
                        flipper.pivotNode.getWorldMatrix()
                    );
                }
            };

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

            // State diagnostics (?dev=1, user-requested) - see index.html's own "State
            // Diagnostics" section comment for the intent (on-device state-bug diagnosis without
            // remote devtools). Same throttled updateDevHud tick as everything above.
            const statusBallInPlay = document.getElementById('status-ball-in-play');
            const statusPhase = document.getElementById('status-phase');
            const statusPendingDrain = document.getElementById('status-pending-drain');
            const statusPendingVGateEject = document.getElementById('status-pending-vgate-eject');
            const statusSkillShot = document.getElementById('status-skill-shot');
            const statusOrbitArmed = document.getElementById('status-orbit-armed');
            const statusKickback = document.getElementById('status-kickback');
            const statusBonusPool = document.getElementById('status-bonus-pool');
            const statusVisionGate = document.getElementById('status-vision-gate');
            const statusLastResetReason = document.getElementById('status-last-reset-reason');
            const statusLastTriggerKind = document.getElementById('status-last-trigger-kind');
            const statusLastScoringEvent = document.getElementById('status-last-scoring-event');

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

                const inProgress = COMBO_DEFS
                    .map((def, i) => ({ def, prog: comboProgress[i] }))
                    .filter(({ prog }) => prog.index > 0);
                const comboRemainingMs = comboStreak.tier > 0
                    ? Math.max(0, COMBO_CHAIN_WINDOW_MS - (gameplayClockMs - comboStreak.lastAtMs))
                    : 0;
                statusCombo.textContent = (comboStreak.tier > 0 ? 'x' + comboStreak.tier + ' (' + (comboRemainingMs / 1000).toFixed(1) + 's)' : 'none') +
                    (inProgress.length > 0 ? ' (' + inProgress.map(({ def, prog }) => def.name + ' ' + prog.index + '/' + def.steps.length).join(', ') + ')' : '');

                const multiplierRemainingMs = powerUp.multiplierRemainingMs > 0 ? powerUp.multiplierRemainingMs : 0;
                statusMultiplier.textContent += multiplierRemainingMs > 0 ? ' (' + (multiplierRemainingMs / 1000).toFixed(1) + 's)' : '';

                statusBallSaveState.textContent = ballSave.active
                    ? 'ARMED (' + (ballSave.remainingMs / 1000).toFixed(1) + 's)'
                    : 'off';

                // --- State diagnostics (?dev=1, user-requested) - see index.html's own comment. ---
                statusBallInPlay.textContent = ballInPlay ? 'yes' : 'no';

                let phase;
                if (gameOverActive) phase = 'GAME_OVER';
                else if (isPaused) phase = 'PAUSED';
                else if (isMenuUp()) phase = 'MENU';
                else if (visionGate.active) phase = 'VISION_GATE';
                else if (bonusCount.active) phase = 'BONUS_COUNT';
                else if (drainTimeoutHandle !== null) phase = 'DRAIN_DELAY';
                else if (ballSave.active) phase = 'BALL_SAVED';
                else if (ballInPlay) phase = 'PLAYING';
                else phase = 'READY';
                statusPhase.textContent = phase;

                statusPendingDrain.textContent = pendingDrainAction ? 'yes' : 'no';
                statusPendingVGateEject.textContent = pendingVisionGateEject ? 'yes' : 'no';

                statusSkillShot.textContent = skillShot.active
                    ? 'active (' + (skillShot.remainingMs / 1000).toFixed(1) + 's)'
                    : 'off';

                const orbitRemaining = (armedAt) => armedAt === null
                    ? '—'
                    : (Math.max(0, ORBIT_COMPLETION_WINDOW_MS - (gameplayClockMs - armedAt)) / 1000).toFixed(1) + 's';
                statusOrbitArmed.textContent = orbitRemaining(orbitState.left.armedAt) + ' / ' + orbitRemaining(orbitState.right.armedAt);

                statusKickback.textContent = kickback.active ? 'ACTIVE' : 'off';

                statusBonusPool.textContent = ballBonus.points + ' x' + ballBonus.multiplierX;

                statusVisionGate.textContent = visionGate.active ? 'ACTIVE' : 'off';

                statusLastResetReason.textContent = lastResetReason || '—';
                statusLastTriggerKind.textContent = lastTriggerKind || '—';
                statusLastScoringEvent.textContent = backglass.state.lastMessage
                    ? backglass.state.lastMessage + (lastScoreDelta ? ' (+' + lastScoreDelta + ', total ' + lastScoreTotal + ')' : '')
                    : '—';
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
            //
            // Saturn's spin and the skybox parallax used to sit HERE, outside the gate, on the
            // same "harmless either way" reasoning. They are not harmless behind the pause menu:
            // that scene is the pause screen's background, and a rotating planet and drifting
            // starfield behind a paused game are the game still animating. Moved inside the gate
            // as part of the pause-background pass. Both are delta-driven per frame rather than
            // read off an absolute clock, so skipping frames costs nothing on resume - they carry
            // on from where they stopped instead of jumping. Attract mode and the title screen are
            // unaffected: neither is paused.
            if (!isPaused) {
                updateSaturnRotation(obstacles.saturnRings, deltaMs);
                updateVisionGateIdle(obstacles, deltaMs, gameplayClockMs);
                updateSkyboxLayers(skybox, deltaMs);
                // Timer audit fix - accumulates only while unpaused, see gameplayClockMs' own
                // declaration comment for why the orbit/combo windows read this instead of
                // performance.now().
                gameplayClockMs += deltaMs;
                updateFlipperMotor(leftFlipper, deltaMs);
                updateFlipperMotor(rightFlipper, deltaMs);
                updateDropTargetBank(deltaMs);
                updateBonusCount(deltaMs);
                // Ticks in the same gate as updateBonusCount() above, and directly after it, on
                // purpose: the sequence's BONUS beat parks on that count's completion, so a frame
                // that advanced the sequence without having advanced the count would be a frame
                // spent waiting on a subsystem that had not yet had its chance to finish.
                updateEndOfBallSequence(deltaMs);
                updateSkillShot(deltaMs);
                updateBallSave(deltaMs);
                updateHitCooldowns(deltaMs); // timer audit fix - was a real setTimeout per cooldown, see hitCooldowns' own comment
                updateLaneBankReset(deltaMs); // timer audit fix - was setTimeout(resetLaneBank, ...), see laneBankResetRemainingMs' own comment
                lampSystem.updateLamps(performance.now());
                // Skipped while the Vision Gate holds the ball (visionGate.active) - not just a
                // nicety: updateBallPhysics()'s own anti-stuck kick fires after STUCK_TIME_
                // THRESHOLD_MS (450ms) of near-zero speed, which a deliberately-frozen kinematic
                // ball would trip well before VISION_GATE_SEQUENCE_MS (1800ms) elapses, yanking it
                // out of the gate mid-sequence with a random kick. The ball is never actually
                // "stuck" here - it's being held on purpose - so this is the correct guard, not a
                // workaround.
                //
                // Anti-stuck audit fix - same reasoning extends to !ballInPlay: confirmed via a
                // real 60fps-cadence replay of the exact algorithm that a ball resting on the
                // plunger (charging or just waiting for launch input) reaches STUCK_TIME_
                // THRESHOLD_MS in under half a second - its resting velocity there is genuinely
                // near-zero, same as any other settled ball, so nothing about the speed/time check
                // itself distinguishes "waiting to be launched" from "actually stuck". The same
                // window covers the ball sitting wherever it lands after a real drain, before
                // resetBallToPlunger() runs (also !ballInPlay) - in both cases the ball is exactly
                // where the game means it to be, not stuck, so a random kick there is a false
                // positive, not a rescue. Every other scenario tested (resting against a wall/
                // flipper/bumper, between posts, in a lane channel, mid-roll downhill) stayed
                // ballInPlay===true the whole time and never produced a false trigger on its
                // own - gravity's table tilt keeps a genuinely free ball moving above
                // STUCK_SPEED_THRESHOLD_MS almost immediately unless something is actually
                // blocking it, which is exactly the state this mechanism exists to rescue.
                if (!visionGate.active && ballInPlay) {
                    updateBallPhysics(mainBall, deltaMs);
                } else if (!ballInPlay) {
                    // Defensive, same "unconditional reset" idiom resetBallToPlunger() itself
                    // uses - keeps stuckTimeMs consistently at 0 for the whole !ballInPlay window
                    // (not just whatever it happened to be when this branch started) rather than
                    // leaving a stale accumulated value sitting there until the next
                    // resetBallToPlunger() call happens to clear it.
                    mainBall.stuckTimeMs = 0;
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
                    // Touch-controls visual polish - drives .launch-btn.pressed's own charge-scaled
                    // glow in index.html, reusing this same real chargePercent (not a new value).
                    launchBtn.style.setProperty('--charge-pct', chargePercent);
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
                // Under prefers-reduced-motion the attract camera never moves at all: it was
                // built directly on ATTRACT_HERO_SHOT and simply stays there. Everything else
                // about the title screen still works - this is a held hero framing, not a
                // disabled feature.
                if (window.SPIRITBALL_reducedMotion) {
                    applyAttractHero(attractCamera, attractCamera.framing);
                } else {
                    attractElapsedMs += deltaMs;
                    updateAttractCamera(attractCamera, attractElapsedMs, attractCamera.framing);
                }
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

            // HUD hierarchy audit - see updatePlayerStatusHud()'s own declaration comment. Runs
            // for every player, throttled internally (own accumulator), same spot as the dev HUD
            // below.
            updatePlayerStatusHud(deltaMs);

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
