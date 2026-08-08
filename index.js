// ===================================
// SPIRITBALL - PHASER 3 GAME
// Windows XP 3D Pinball Space Cadet Gameplay
// Version 5.0 - XP Pinball Mechanics with Original Graphics
// - OVERHAULED: Complete gameplay redesign based on Windows XP 3D Pinball
// - ADDED: Mission system with 17 missions across 9 ranks
// - ADDED: Fuel system with depletion during missions
// - ADDED: Launch ramp for mission acceptance
// - ADDED: Field multiplier system (2x, 3x, 5x, 10x)
// - ADDED: Re-entry lanes and bonus lanes
// - ADDED: Attack bumpers (4 bumpers at top)
// - KEPT: All original graphics (chakras, saturn, cosmic theme)
// - MAPPED: Chakras → Mission targets + Fuel lights
// - MAPPED: Saturn → Satellite bumper
// - MAPPED: Obstacles → Attack bumpers + Targets
// - COMPATIBLE: Desktop (keyboard) and Mobile (touch) controls
// ===================================

const CONFIG = {
    width: 540,
    height: 960,
    // Single source of truth for world gravity. This used to be set here AND overwritten to
    // 800 in GameScene.setupPhysics() - the override silently won, so 1400 never actually took
    // effect. Consolidated to one value and tuned up slightly from the effective 800 for a
    // snappier, less floaty arcade-pinball descent. See release-prompts/13-*.md.
    gravity: 1000,
    ballRadius: 20,
    ballBounce: 0.8, // was 0.75 - a touch more energetic/lively on contact
    ballMaxVelocity: 1800, // was inline in setupBall(); pulled out here for one-place tuning
    ballDrag: 0.995,
    startingLives: 3,
    startingBalls: 3,

    // XP Pinball Game Elements
    attackBumperCount: 4,
    missionTargetCount: 3,
    fuelLightCount: 6,
    reentryLaneCount: 3,

    // Plunger power range was 400-1200: weak enough at minimum that an instant tap barely
    // cleared the launch chute, and strong shots weren't very punchy. Raised so every launch
    // (even a 0ms tap) is a meaningful, playable shot, with more ceiling on a full charge.
    plungerMaxPower: 1600,
    plungerMinPower: 700,
    plungerChargeTime: 2000,

    // XP Pinball Ranks (9 total)
    ranks: [
        'Cadet', 'Ensign', 'Lieutenant', 'Captain',
        'LT Commander', 'Commander', 'Commodore',
        'Admiral', 'Fleet Admiral'
    ],

    // XP Pinball Missions (17 total, organized by rank)
    missions: {
        0: [ // Cadet
            { id: 0, name: 'Launch Training', description: 'Pass the Launch Ramp 3 times', requirement: 3, type: 'ramp' },
            { id: 1, name: 'Re-entry Training', description: 'Pass the Re-entry Lanes 3 times', requirement: 3, type: 'lane' },
            { id: 2, name: 'Target Practice', description: 'Hit the Attack Bumpers 8 times', requirement: 8, type: 'bumper' }
        ],
        1: [ // Ensign
            { id: 3, name: 'Science', description: 'Hit Mission Targets 5 times', requirement: 5, type: 'target' },
            { id: 4, name: 'Launch Training', description: 'Pass the Launch Ramp 5 times', requirement: 5, type: 'ramp' },
            { id: 5, name: 'Target Practice', description: 'Hit the Attack Bumpers 15 times', requirement: 15, type: 'bumper' }
        ],
        2: [ // Lieutenant
            { id: 6, name: 'Satellite Retrieval', description: 'Hit the Satellite 3 times', requirement: 3, type: 'satellite' },
            { id: 7, name: 'Recon', description: 'Pass through lanes 15 times', requirement: 15, type: 'alllanes' },
            { id: 8, name: 'Upgrade', description: 'Light all Re-entry Lanes', requirement: 3, type: 'reentry' }
        ],
        3: [ // Captain
            { id: 9, name: 'Alien Menace', description: 'Hit Attack Bumpers 20 times', requirement: 20, type: 'bumper' },
            { id: 10, name: 'Time Warp', description: 'Collect all Fuel Lights', requirement: 6, type: 'fuel' },
            { id: 11, name: 'Maelstrom', description: 'Hit all targets rapidly', requirement: 10, type: 'rapidtarget' }
        ],
        4: [ // LT Commander
            { id: 12, name: 'Cosmic Plague', description: 'Pass the Launch Ramp 10 times', requirement: 10, type: 'ramp' },
            { id: 13, name: 'Black Hole', description: 'Hit Satellite 5 times', requirement: 5, type: 'satellite' },
            { id: 14, name: 'Space Radiation', description: 'Survive 30 seconds', requirement: 30, type: 'time' }
        ],
        5: [ // Commander - uses higher rank missions
            { id: 12, name: 'Cosmic Plague', description: 'Pass the Launch Ramp 12 times', requirement: 12, type: 'ramp' },
            { id: 13, name: 'Black Hole', description: 'Hit Satellite 7 times', requirement: 7, type: 'satellite' },
            { id: 15, name: 'Bug Hunt', description: 'Hit all bumpers 30 times', requirement: 30, type: 'bumper' }
        ],
        6: [ // Commodore
            { id: 12, name: 'Cosmic Plague', description: 'Pass the Launch Ramp 15 times', requirement: 15, type: 'ramp' },
            { id: 16, name: 'Stray Comet', description: 'Score 500,000 points', requirement: 500000, type: 'score' },
            { id: 13, name: 'Black Hole', description: 'Hit Satellite 10 times', requirement: 10, type: 'satellite' }
        ],
        7: [ // Admiral
            { id: 12, name: 'Cosmic Plague', description: 'Pass the Launch Ramp 18 times', requirement: 18, type: 'ramp' },
            { id: 16, name: 'Stray Comet', description: 'Score 1,000,000 points', requirement: 1000000, type: 'score' },
            { id: 13, name: 'Black Hole', description: 'Hit Satellite 15 times', requirement: 15, type: 'satellite' }
        ],
        8: [ // Fleet Admiral
            { id: 12, name: 'Cosmic Plague', description: 'Pass the Launch Ramp 22 times', requirement: 22, type: 'ramp' },
            { id: 16, name: 'Stray Comet', description: 'Score 2,000,000 points', requirement: 2000000, type: 'score' },
            { id: 13, name: 'Black Hole', description: 'Hit Satellite 20 times', requirement: 20, type: 'satellite' }
        ]
    },

    // XP Pinball Scoring
    scores: {
        attackBumper: 500,
        attackBumperUpgraded: 1500,
        satellite: 1000,
        missionTarget: 750,
        reentryLane: 2000,
        bonusLane: 5000,
        launchRamp: 2500,
        fuelTarget: 500,
        leftLane: 250,
        rightLane: 250,
        missionComplete: 25000,
        rankUp: 100000,
        extraBall: 0
    },

    // Field Multipliers (XP Pinball style)
    multipliers: [1, 2, 3, 5, 10],

    colors: {
        background: 0x1a0033,
        ball: 0xffffff,
        eyeball: 0x00ffff,
        flipper: 0xff00ff,
        bumper1: 0xff0099,
        bumper2: 0x00ffff,
        bumper3: 0xff00ff,
        bumper4: 0xffff00,
        wall: 0x00CCFF,
        chakra: [0x9400D3, 0xFF1493, 0xFFFF00, 0x00FF00, 0x00FFFF, 0x0000FF, 0x8B00FF],
        saturn: 0xFFA500,
        saturnRing: 0xFFD700,
        missionActive: 0x00FF00,
        missionInactive: 0x666666,
        fuelFull: 0x00FF00,
        fuelLow: 0xFF0000
    }
};

class PerformanceManager {
    constructor() {
        this.deviceTier = this.detectPerformance();
    }

    detectPerformance() {
        // Check for performance indicators
        const checks = {
            // Hardware concurrency (CPU cores)
            cores: navigator.hardwareConcurrency || 2,
            // Device memory (in GB)
            memory: navigator.deviceMemory || 2,
            // Connection type
            connection: navigator.connection?.effectiveType || '4g',
            // User agent indicators
            isLowEnd: /Android\s[1-6]\.|iPhone\s[1-7]\.|iPad\s[1-5]\./i.test(navigator.userAgent)
        };

        // Calculate performance tier
        let score = 0;

        if (checks.cores >= 8) score += 3;
        else if (checks.cores >= 4) score += 2;
        else if (checks.cores >= 2) score += 1;

        if (checks.memory >= 8) score += 3;
        else if (checks.memory >= 4) score += 2;
        else if (checks.memory >= 2) score += 1;

        if (checks.connection === '4g' || checks.connection === '5g') score += 1;

        if (checks.isLowEnd) score -= 2;

        // Return tier: 'high', 'medium', 'low'
        if (score >= 6) return 'high';
        if (score >= 3) return 'medium';
        return 'low';
    }

    shouldReduceEffects() {
        return this.deviceTier === 'low';
    }

    shouldReduceParticles() {
        return this.deviceTier === 'low' || this.deviceTier === 'medium';
    }

    getParticleMultiplier() {
        switch(this.deviceTier) {
            case 'high': return 1.0;
            case 'medium': return 0.6;
            case 'low': return 0.3;
            default: return 0.5;
        }
    }
}

class InputManager {
    constructor() {
        this.state = {
            leftFlipper: false,
            rightFlipper: false,
            launchHeld: false,
            launchPressed: false,
            launchReleased: false,
            pause: false
        };
        this._fullscreenRequested = false;
        this.detectMobile();
        this.setupMobileControls();
        this.setupResizeHandlers();
        this.setupFullscreenRequest();
    }

    detectMobile() {
        const userAgent = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        const smallScreen = window.innerWidth <= 768;
        const portrait = window.innerHeight > window.innerWidth;

        // Consider mobile if: user agent matches OR (small screen AND portrait)
        this.isMobile = userAgent || (smallScreen && portrait);

        // Update mobile controls visibility
        this.updateMobileControlsVisibility();
    }

    updateMobileControlsVisibility() {
        const mobileControls = document.getElementById('mobile-controls');
        const rotateOverlay = document.getElementById('rotate-overlay');
        const isLandscape = window.innerWidth > window.innerHeight;

        // The playfield is portrait-only. A real mobile device held in landscape has nowhere
        // to put the touch controls (and previously a CSS !important rule could hide them
        // outright with no explanation) - show a rotate prompt instead of stranding the
        // player with an unplayable, control-less screen. See release-prompts/02-*.md.
        if (this.isMobile && isLandscape) {
            if (rotateOverlay) rotateOverlay.style.display = 'flex';
            if (mobileControls) mobileControls.style.display = 'none';
            return;
        }

        if (rotateOverlay) rotateOverlay.style.display = 'none';

        if (mobileControls) {
            // Show controls if mobile device OR portrait orientation OR small screen.
            // This is the sole authority on visibility - styles.css has no conflicting
            // !important display rule for #mobile-controls.
            const shouldShow = this.isMobile ||
                              window.innerHeight > window.innerWidth ||
                              window.innerWidth <= 767;
            mobileControls.style.display = shouldShow ? 'block' : 'none';
        }
    }

    // Mobile play is meant to be full-screen portrait (see release-prompts/14-*.md): request
    // the Fullscreen API and, where supported, lock orientation to portrait, on the player's
    // first touch anywhere - both require a user gesture, so this can't happen automatically
    // on page load. Failures are silently ignored (fullscreen can be denied by the browser;
    // orientation lock isn't supported at all on iOS Safari) - this is a nice-to-have
    // enhancement, never a requirement to play.
    setupFullscreenRequest() {
        if (!this.isMobile) return;

        document.addEventListener('touchstart', () => this.requestFullscreenAndLock(), { once: true, passive: true });
    }

    requestFullscreenAndLock() {
        if (this._fullscreenRequested) return;
        this._fullscreenRequested = true;

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

    // Short haptic pulse for launch feedback on devices that support it (mostly Android
    // Chrome; iOS Safari has no Vibration API at all, so this silently no-ops there).
    vibrate(ms) {
        if (navigator.vibrate) {
            try { navigator.vibrate(ms); } catch (e) { /* ignore */ }
        }
    }

    // Toggles the ".ready" affordance class on the DOM launch button so it visibly invites a
    // tap only when a launch is actually possible, kept in sync from GameScene at the moments
    // canLaunch/ballInPlay change (resetBall(), launchBall()).
    setLaunchReady(ready) {
        const launchBtn = document.getElementById('launch-btn');
        if (launchBtn) launchBtn.classList.toggle('ready', ready);
    }

    setupResizeHandlers() {
        let resizeTimeout;

        // Handle window resize with debouncing
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                this.detectMobile();
                this.handleResize();
            }, 250);
        });

        // Handle orientation change
        window.addEventListener('orientationchange', () => {
            setTimeout(() => {
                this.detectMobile();
                this.handleResize();
            }, 100);
        });

        // Handle visibility change (when app comes back to foreground)
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                this.detectMobile();
                this.handleResize();
            }
        });
    }

    handleResize() {
        // Let Phaser handle the canvas scaling
        if (window.game && window.game.scale) {
            window.game.scale.refresh();
        }
    }

    setupMobileControls() {
        // Arcade-style flipper zones: the whole left/right edge of the screen is the flipper
        // control (like the flipper buttons on the sides of a real arcade cabinet), not a
        // small button - much easier to hit reliably with a thumb resting anywhere along the
        // edge. See release-prompts/14-*.md.
        const leftZone = document.getElementById('flipper-zone-left');
        if (leftZone) {
            const leftFlipperStart = (e) => {
                e.preventDefault();
                this.state.leftFlipper = true;
                leftZone.classList.add('pressed');
            };
            const leftFlipperEnd = (e) => {
                e.preventDefault();
                this.state.leftFlipper = false;
                leftZone.classList.remove('pressed');
            };

            leftZone.addEventListener('touchstart', leftFlipperStart, { passive: false });
            leftZone.addEventListener('touchend', leftFlipperEnd, { passive: false });
            leftZone.addEventListener('touchcancel', leftFlipperEnd, { passive: false });

            // Add mouse support for desktop testing
            leftZone.addEventListener('mousedown', leftFlipperStart);
            leftZone.addEventListener('mouseup', leftFlipperEnd);
            leftZone.addEventListener('mouseleave', leftFlipperEnd);
        }

        const rightZone = document.getElementById('flipper-zone-right');
        if (rightZone) {
            const rightFlipperStart = (e) => {
                e.preventDefault();
                this.state.rightFlipper = true;
                rightZone.classList.add('pressed');
            };
            const rightFlipperEnd = (e) => {
                e.preventDefault();
                this.state.rightFlipper = false;
                rightZone.classList.remove('pressed');
            };

            rightZone.addEventListener('touchstart', rightFlipperStart, { passive: false });
            rightZone.addEventListener('touchend', rightFlipperEnd, { passive: false });
            rightZone.addEventListener('touchcancel', rightFlipperEnd, { passive: false });

            // Add mouse support for desktop testing
            rightZone.addEventListener('mousedown', rightFlipperStart);
            rightZone.addEventListener('mouseup', rightFlipperEnd);
            rightZone.addEventListener('mouseleave', rightFlipperEnd);
        }

        const launchBtn = document.getElementById('launch-btn');
        if (launchBtn) {
            const launchStart = (e) => {
                e.preventDefault();
                this.state.launchHeld = true;
                this.state.launchPressed = true;
                launchBtn.classList.add('pressed');
            };
            const launchEnd = (e) => {
                e.preventDefault();
                this.state.launchHeld = false;
                this.state.launchReleased = true;
                launchBtn.classList.remove('pressed');
                setTimeout(() => this.state.launchReleased = false, 50);
            };

            launchBtn.addEventListener('touchstart', launchStart, { passive: false });
            launchBtn.addEventListener('touchend', launchEnd, { passive: false });
            launchBtn.addEventListener('touchcancel', launchEnd, { passive: false });

            // Add mouse support for desktop testing
            launchBtn.addEventListener('mousedown', launchStart);
            launchBtn.addEventListener('mouseup', launchEnd);
        }

        const pauseBtn = document.getElementById('pause-btn');
        if (pauseBtn) {
            const pauseHandler = (e) => {
                e.preventDefault();
                this.state.pause = true;
                setTimeout(() => this.state.pause = false, 150);
            };

            pauseBtn.addEventListener('touchstart', pauseHandler, { passive: false });
            pauseBtn.addEventListener('click', pauseHandler);
        }
    }
}

class BootScene extends Phaser.Scene {
    constructor() { super({ key: 'BootScene' }); }
    
    preload() {
        this.add.text(CONFIG.width / 2, CONFIG.height / 2, 'SPIRITBALL\nLOADING...', {
            fontSize: '36px', fontFamily: 'Righteous, Monoton, Orbitron, Arial, sans-serif', color: '#00ffff',
            stroke: '#ff00ff', strokeThickness: 5, align: 'center'
        }).setOrigin(0.5);

        // Load background image
        this.load.image('background', 'background.webp');

        // Load new psychedelic assets
        this.load.image('saturn-psychedelic', 'saturn_example.webp');
        this.load.image('grimreaper', 'grimreaper_example.webp');

        // Create enhanced particle textures
        const graphics = this.add.graphics();
        
        // Circle particle
        graphics.fillStyle(0xffffff, 1);
        graphics.fillCircle(10, 10, 10);
        graphics.generateTexture('particle', 20, 20);
        graphics.clear();
        
        // Triangle particle
        graphics.fillStyle(0xffffff, 1);
        graphics.beginPath();
        graphics.moveTo(10, 2);
        graphics.lineTo(18, 18);
        graphics.lineTo(2, 18);
        graphics.closePath();
        graphics.fillPath();
        graphics.generateTexture('particle-triangle', 20, 20);
        graphics.clear();
        
        // Hexagon particle
        graphics.fillStyle(0xffffff, 1);
        graphics.beginPath();
        for (let i = 0; i < 6; i++) {
            const angle = (i * Math.PI * 2) / 6 - Math.PI / 2;
            const x = 10 + 8 * Math.cos(angle);
            const y = 10 + 8 * Math.sin(angle);
            if (i === 0) graphics.moveTo(x, y);
            else graphics.lineTo(x, y);
        }
        graphics.closePath();
        graphics.fillPath();
        graphics.generateTexture('particle-hex', 20, 20);
        graphics.clear();
        
        // Create detailed eyeball texture - more realistic
        graphics.fillStyle(0xffffff, 1);
        graphics.fillCircle(25, 25, 24);
        // Add veins
        graphics.lineStyle(1, 0xff6666, 0.3);
        for (let i = 0; i < 8; i++) {
            const angle = (i / 8) * Math.PI * 2;
            graphics.lineTo(25, 25);
            graphics.lineTo(25 + Math.cos(angle) * 24, 25 + Math.sin(angle) * 24);
        }
        // Iris
        graphics.fillStyle(0x00aaff, 1);
        graphics.fillCircle(25, 25, 16);
        // Pupil
        graphics.fillStyle(0x000000, 1);
        graphics.fillCircle(25, 25, 10);
        // Highlight
        graphics.fillStyle(0xffffff, 0.9);
        graphics.fillCircle(22, 22, 5);
        graphics.fillCircle(28, 28, 2);
        graphics.generateTexture('eyeball', 50, 50);
        graphics.clear();
        
        // Create flaming eyeball texture
        graphics.fillStyle(0xffffff, 1);
        graphics.fillCircle(25, 25, 24);
        // Fire iris
        graphics.fillStyle(0xff6600, 1);
        graphics.fillCircle(25, 25, 16);
        // Fire pupil
        graphics.fillStyle(0xff0000, 1);
        graphics.fillCircle(25, 25, 10);
        // Yellow highlight
        graphics.fillStyle(0xffff00, 0.9);
        graphics.fillCircle(22, 22, 5);
        graphics.generateTexture('eyeball-fire', 50, 50);
        graphics.clear();
        
        // Create enhanced chakra textures (7 chakras) with lotus petals and sacred geometry
        const chakraColors = [0x9400D3, 0xFF1493, 0xFFFF00, 0x00FF00, 0x00FFFF, 0x0000FF, 0x8B00FF];
        chakraColors.forEach((color, index) => {
            graphics.clear();

            // Outer lotus petal pattern - more detailed
            const petals = 8 + index * 2;
            for (let i = 0; i < petals; i++) {
                const angle = (i / petals) * Math.PI * 2;
                const petalX = 35 + Math.cos(angle) * 28;
                const petalY = 35 + Math.sin(angle) * 28;

                // Draw petal shape
                graphics.fillStyle(color, 0.5);
                graphics.fillEllipse(petalX, petalY, 10, 15);

                // Petal outline
                graphics.lineStyle(1, color, 0.8);
                graphics.strokeEllipse(petalX, petalY, 10, 15);
            }

            // Sacred geometry - outer triangles/sacred pattern
            graphics.lineStyle(2, color, 0.6);
            for (let i = 0; i < 6; i++) {
                const angle = (i / 6) * Math.PI * 2;
                const x1 = 35 + Math.cos(angle) * 22;
                const y1 = 35 + Math.sin(angle) * 22;
                const x2 = 35 + Math.cos(angle + Math.PI / 6) * 22;
                const y2 = 35 + Math.sin(angle + Math.PI / 6) * 22;
                graphics.lineBetween(x1, y1, x2, y2);
            }

            // Outer ring with gradient effect
            graphics.lineStyle(4, color, 0.9);
            graphics.strokeCircle(35, 35, 26);
            graphics.lineStyle(2, color, 0.7);
            graphics.strokeCircle(35, 35, 24);

            // Middle ring - sacred circle
            graphics.fillStyle(color, 0.75);
            graphics.fillCircle(35, 35, 20);

            // Inner sacred geometry pattern
            graphics.lineStyle(2, 0xffffff, 0.6);
            graphics.strokeCircle(35, 35, 15);

            // Inner circle with glow
            graphics.fillStyle(color, 1);
            graphics.fillCircle(35, 35, 14);

            // Center yantra/symbol
            graphics.fillStyle(0xffffff, 1);
            graphics.fillCircle(35, 35, 6);

            // Center dot (bindu)
            graphics.fillStyle(color, 1);
            graphics.fillCircle(35, 35, 3);

            graphics.generateTexture(`chakra${index}`, 70, 70);
        });
        graphics.clear();
        
        // Create enhanced Saturn texture - detailed cartoon style with ORANGE color
        // Main planet body with orange gradient
        graphics.fillGradientStyle(0xFFA500, 0xFFA500, 0xFF8C00, 0xFF8C00, 1);
        graphics.fillCircle(50, 50, 42);

        // Atmospheric bands - detailed orange tones
        graphics.lineStyle(3, 0xFFB347, 0.6);
        graphics.strokeCircle(50, 50, 38);
        graphics.lineStyle(2, 0xFF9933, 0.5);
        graphics.strokeCircle(50, 50, 32);
        graphics.lineStyle(2, 0xFF8800, 0.4);
        graphics.strokeCircle(50, 50, 26);
        graphics.lineStyle(1, 0xFF7700, 0.4);
        graphics.strokeCircle(50, 50, 20);

        // Horizontal bands - orange tones
        graphics.lineStyle(2, 0xCC6600, 0.3);
        graphics.lineBetween(10, 40, 90, 40);
        graphics.lineBetween(10, 50, 90, 50);
        graphics.lineBetween(10, 60, 90, 60);

        // Shadow/depth
        graphics.fillStyle(0x000000, 0.15);
        graphics.fillCircle(65, 50, 15);

        // Highlight - warm orange highlight
        graphics.fillStyle(0xFFCC99, 0.4);
        graphics.fillCircle(35, 35, 12);

        graphics.generateTexture('saturn', 100, 100);
        graphics.clear();

        // Create enhanced Saturn ring texture - bright GOLDEN rings
        // Outer ring band - golden
        graphics.lineStyle(14, 0xFFD700, 0.95);
        graphics.strokeEllipse(60, 30, 90, 25);

        // Middle ring band - golden
        graphics.lineStyle(10, 0xFFD700, 0.9);
        graphics.strokeEllipse(60, 30, 90, 25);

        // Inner ring band - golden
        graphics.lineStyle(6, 0xFFC700, 0.85);
        graphics.strokeEllipse(60, 30, 90, 25);

        // Ring highlights - bright gold
        graphics.lineStyle(3, 0xFFFF99, 1);
        graphics.strokeEllipse(60, 30, 90, 25);

        // Ring shadows (Cassini division) - darker gold
        graphics.lineStyle(2, 0xCCA500, 0.6);
        graphics.strokeEllipse(60, 30, 75, 20);

        graphics.generateTexture('saturn-ring', 120, 60);
        graphics.clear();
        
        // Create enhanced black hexagon vortex texture
        // Dark void center
        graphics.fillStyle(0x000000, 1);
        graphics.beginPath();
        for (let i = 0; i < 6; i++) {
            const angle = (i * Math.PI * 2) / 6 - Math.PI / 2;
            const x = 40 + 32 * Math.cos(angle);
            const y = 40 + 32 * Math.sin(angle);
            if (i === 0) graphics.moveTo(x, y);
            else graphics.lineTo(x, y);
        }
        graphics.closePath();
        graphics.fillPath();

        // Inner void
        graphics.fillStyle(0x0a0a0a, 0.8);
        graphics.fillCircle(40, 40, 24);

        // Mystical outline layers
        graphics.lineStyle(5, 0x4B0082, 1);
        graphics.strokePath();
        graphics.lineStyle(3, 0x9400D3, 0.9);
        graphics.strokePath();
        graphics.lineStyle(2, 0xFF00FF, 0.8);
        graphics.strokePath();
        graphics.lineStyle(1, 0xFF1493, 0.7);
        graphics.strokePath();

        // Mystical energy lines radiating inward
        graphics.lineStyle(1, 0xFF00FF, 0.5);
        for (let i = 0; i < 12; i++) {
            const angle = (i / 12) * Math.PI * 2;
            graphics.lineBetween(
                40 + Math.cos(angle) * 35,
                40 + Math.sin(angle) * 35,
                40 + Math.cos(angle) * 20,
                40 + Math.sin(angle) * 20
            );
        }

        graphics.generateTexture('hexagon', 80, 80);
        graphics.clear();

        // Create plunger/launcher graphics
        graphics.fillStyle(0x8B4513, 1);
        graphics.fillRect(5, 0, 20, 100);
        graphics.lineStyle(2, 0xD2691E, 1);
        graphics.strokeRect(5, 0, 20, 100);

        // Plunger tip
        graphics.fillStyle(0xFF6600, 1);
        graphics.fillCircle(15, 5, 10);
        graphics.lineStyle(2, 0xFF8833, 1);
        graphics.strokeCircle(15, 5, 10);

        graphics.generateTexture('plunger', 30, 100);
        graphics.clear();
        
        // Create Grim Reaper texture - more detailed
        // Hood
        graphics.fillStyle(0x1a1a1a, 1);
        graphics.fillCircle(40, 30, 28);
        // Face area
        graphics.fillStyle(0x000000, 1);
        graphics.fillEllipse(40, 30, 18, 22);
        // Eyes
        graphics.fillStyle(0xff0000, 0.8);
        graphics.fillEllipse(32, 28, 5, 8);
        graphics.fillEllipse(48, 28, 5, 8);
        // Body
        graphics.fillStyle(0x0a0a0a, 1);
        graphics.fillRect(15, 50, 50, 70);
        // Scythe handle
        graphics.lineStyle(5, 0x4a3020, 1);
        graphics.lineTo(55, 60);
        graphics.lineTo(60, 100);
        // Scythe blade
        graphics.fillStyle(0x888888, 1);
        graphics.beginPath();
        graphics.moveTo(60, 85);
        graphics.lineTo(75, 80);
        graphics.lineTo(70, 95);
        graphics.closePath();
        graphics.fillPath();
        graphics.generateTexture('grimreaper', 80, 120);
        graphics.clear();

        // Create cosmic energy flipper textures - LEFT FLIPPER (wing shape)
        // Main crystal/wing body with gradient
        graphics.fillGradientStyle(0xff00ff, 0xff00ff, 0x8B00FF, 0x4B0082, 1, 1, 0.8, 0.6);
        graphics.fillRect(0, 6, 80, 16);

        // Crystal facets/geometric patterns
        graphics.lineStyle(2, 0x00ffff, 0.9);
        graphics.lineBetween(0, 10, 25, 14);
        graphics.lineBetween(25, 14, 50, 10);
        graphics.lineBetween(50, 10, 80, 14);

        // Energy glow lines
        graphics.lineStyle(3, 0xffffff, 0.7);
        graphics.lineBetween(10, 14, 70, 14);
        graphics.lineStyle(2, 0x00ffff, 0.8);
        graphics.lineBetween(15, 10, 65, 10);

        // Cosmic energy dots
        graphics.fillStyle(0x00ffff, 1);
        graphics.fillCircle(20, 14, 2);
        graphics.fillCircle(40, 14, 2);
        graphics.fillCircle(60, 14, 2);

        // Wing tip glow
        graphics.fillStyle(0xffffff, 0.8);
        graphics.fillCircle(5, 14, 4);
        graphics.fillStyle(0xff00ff, 0.6);
        graphics.fillCircle(75, 14, 3);

        // Outline for definition
        graphics.lineStyle(2, 0xff00ff, 1);
        graphics.strokeRect(0, 6, 80, 16);

        graphics.generateTexture('flipper-left', 80, 28);
        graphics.clear();

        // Create cosmic energy flipper textures - RIGHT FLIPPER (wing shape)
        // Main crystal/wing body with gradient (mirrored)
        graphics.fillGradientStyle(0x4B0082, 0x8B00FF, 0xff00ff, 0xff00ff, 0.6, 0.8, 1, 1);
        graphics.fillRect(0, 6, 80, 16);

        // Crystal facets/geometric patterns (mirrored)
        graphics.lineStyle(2, 0x00ffff, 0.9);
        graphics.lineBetween(0, 14, 30, 10);
        graphics.lineBetween(30, 10, 55, 14);
        graphics.lineBetween(55, 14, 80, 10);

        // Energy glow lines
        graphics.lineStyle(3, 0xffffff, 0.7);
        graphics.lineBetween(10, 14, 70, 14);
        graphics.lineStyle(2, 0x00ffff, 0.8);
        graphics.lineBetween(15, 10, 65, 10);

        // Cosmic energy dots
        graphics.fillStyle(0x00ffff, 1);
        graphics.fillCircle(20, 14, 2);
        graphics.fillCircle(40, 14, 2);
        graphics.fillCircle(60, 14, 2);

        // Wing tip glow (mirrored)
        graphics.fillStyle(0xff00ff, 0.6);
        graphics.fillCircle(5, 14, 3);
        graphics.fillStyle(0xffffff, 0.8);
        graphics.fillCircle(75, 14, 4);

        // Outline for definition
        graphics.lineStyle(2, 0xff00ff, 1);
        graphics.strokeRect(0, 6, 80, 16);

        graphics.generateTexture('flipper-right', 80, 28);
        graphics.clear();

        // Create cosmic crystal bumper texture (enhanced multi-layered crystal)
        // Outer glow aura
        graphics.fillStyle(0x00ffff, 0.2);
        graphics.beginPath();
        graphics.moveTo(25, 2);
        graphics.lineTo(48, 42);
        graphics.lineTo(2, 42);
        graphics.closePath();
        graphics.fillPath();

        // Main crystal body with gradient effect
        graphics.fillGradientStyle(0x00ffff, 0x00ffff, 0x00aaff, 0x0088ff, 1, 0.9, 0.8, 0.7);
        graphics.beginPath();
        graphics.moveTo(25, 5);
        graphics.lineTo(45, 40);
        graphics.lineTo(5, 40);
        graphics.closePath();
        graphics.fillPath();

        // Crystal facets and internal structure
        graphics.lineStyle(2, 0xffffff, 0.9);
        graphics.lineBetween(25, 5, 25, 40);
        graphics.lineBetween(15, 22, 35, 22);
        graphics.lineBetween(10, 30, 40, 30);

        // Outer crystal edges with multi-layer glow
        graphics.lineStyle(4, 0x00ffff, 0.4);
        graphics.strokePath();
        graphics.lineStyle(3, 0x00ffff, 0.7);
        graphics.strokePath();
        graphics.lineStyle(2, 0xffffff, 0.9);
        graphics.strokePath();

        // Inner energy core - pulsing center
        graphics.fillStyle(0xffffff, 0.9);
        graphics.fillCircle(25, 20, 6);
        graphics.fillStyle(0x00ffff, 0.7);
        graphics.fillCircle(25, 20, 4);
        graphics.fillStyle(0xffffff, 1);
        graphics.fillCircle(25, 20, 2);

        // Energy sparkles
        graphics.fillStyle(0xffffff, 0.8);
        graphics.fillCircle(15, 15, 1.5);
        graphics.fillCircle(35, 15, 1.5);
        graphics.fillCircle(25, 32, 1.5);

        graphics.generateTexture('cosmic-crystal', 50, 45);
        graphics.clear();

        // Create asteroid texture (enhanced 3D rocky space object)
        // Shadow base for depth
        graphics.fillStyle(0x3a1f0a, 0.8);
        graphics.fillCircle(22, 22, 18);

        // Main body with gradient for 3D effect
        graphics.fillGradientStyle(0xA0522D, 0xA0522D, 0x8B4513, 0x654321, 1, 0.95, 0.85, 0.7);
        graphics.fillCircle(20, 20, 18);

        // Large crater with depth
        graphics.fillStyle(0x4a2f1a, 0.8);
        graphics.fillCircle(18, 28, 6);
        graphics.fillStyle(0x3a1f0a, 0.6);
        graphics.fillCircle(18, 28, 4);

        // Medium craters
        graphics.fillStyle(0x654321, 0.8);
        graphics.fillCircle(14, 12, 4);
        graphics.fillCircle(28, 18, 3);

        // Small crater details
        graphics.fillStyle(0x4a2f1a, 0.7);
        graphics.fillCircle(10, 20, 2);
        graphics.fillCircle(26, 26, 2);
        graphics.fillCircle(15, 30, 2);
        graphics.fillCircle(27, 12, 1.5);

        // Rock texture bumps
        graphics.fillStyle(0x5a3520, 0.6);
        graphics.fillCircle(12, 16, 2);
        graphics.fillCircle(24, 22, 2);
        graphics.fillCircle(16, 24, 1.5);

        // Highlight for 3D lighting effect
        graphics.fillStyle(0xD2691E, 0.8);
        graphics.fillCircle(16, 14, 4);
        graphics.fillStyle(0xCD853F, 0.6);
        graphics.fillCircle(15, 13, 3);
        graphics.fillStyle(0xF4A460, 0.5);
        graphics.fillCircle(14, 12, 2);

        // Rough outline with varied thickness
        graphics.lineStyle(3, 0x3a1f0a, 0.6);
        graphics.strokeCircle(20, 20, 18);
        graphics.lineStyle(2, 0x654321, 0.9);
        graphics.strokeCircle(20, 20, 17.5);

        graphics.generateTexture('asteroid', 40, 40);
        graphics.clear();

        // Create energy vortex portal texture (enhanced swirling portal)
        // Outer energy rings with pulsing effect
        graphics.lineStyle(5, 0xff00ff, 0.3);
        graphics.strokeCircle(20, 20, 18);
        graphics.lineStyle(4, 0xff00ff, 0.9);
        graphics.strokeCircle(20, 20, 16);
        graphics.lineStyle(3, 0x00ffff, 0.8);
        graphics.strokeCircle(20, 20, 14);
        graphics.lineStyle(2, 0x8B00FF, 0.7);
        graphics.strokeCircle(20, 20, 12);

        // Swirling vortex layers
        graphics.fillStyle(0x4B0082, 0.8);
        graphics.fillCircle(20, 20, 11);
        graphics.fillStyle(0x6A0DAD, 0.7);
        graphics.fillCircle(20, 20, 9);
        graphics.fillStyle(0x8B00FF, 0.6);
        graphics.fillCircle(20, 20, 7);

        // Spiral energy particles in vortex pattern
        for (let i = 0; i < 8; i++) {
            const angle = (i / 8) * Math.PI * 2;
            const radius = 13 - (i % 3) * 2;
            graphics.fillStyle(0xff00ff, 0.9);
            graphics.fillCircle(
                20 + Math.cos(angle) * radius,
                20 + Math.sin(angle) * radius,
                2
            );
        }

        // Inner spiral detail
        graphics.lineStyle(1, 0x00ffff, 0.6);
        for (let i = 0; i < 6; i++) {
            const angle = (i / 6) * Math.PI * 2;
            graphics.lineBetween(
                20 + Math.cos(angle) * 10,
                20 + Math.sin(angle) * 10,
                20 + Math.cos(angle + 0.5) * 5,
                20 + Math.sin(angle + 0.5) * 5
            );
        }

        // Center vortex core with intense glow
        graphics.fillStyle(0xffffff, 0.9);
        graphics.fillCircle(20, 20, 5);
        graphics.fillStyle(0x00ffff, 0.8);
        graphics.fillCircle(20, 20, 3);
        graphics.fillStyle(0xffffff, 1);
        graphics.fillCircle(20, 20, 1.5);

        graphics.generateTexture('energy-vortex', 40, 40);
        graphics.clear();

        // Create comet/shooting star obstacle (enhanced with dynamic tail)
        // Extended tail with multiple gradient layers
        graphics.fillGradientStyle(0xff8800, 0xff4400, 0xff0000, 0x000000, 0.6, 0.4, 0.2, 0);
        graphics.fillTriangle(35, 15, 2, 2, 2, 28);

        // Inner tail glow
        graphics.fillGradientStyle(0xffaa00, 0xff6600, 0xff3300, 0x000000, 0.8, 0.6, 0.3, 0);
        graphics.fillTriangle(35, 15, 8, 6, 8, 24);

        // Bright inner tail
        graphics.fillGradientStyle(0xffff00, 0xffaa00, 0xff6600, 0xff0000, 0.9, 0.7, 0.5, 0.2);
        graphics.fillTriangle(35, 15, 15, 9, 15, 21);

        // Comet head outer glow
        graphics.fillStyle(0xffff00, 0.3);
        graphics.fillCircle(35, 15, 15);

        // Comet head with bright gradient
        graphics.fillGradientStyle(0xffffff, 0xffffff, 0xffff00, 0xff8800, 1, 1, 0.95, 0.8);
        graphics.fillCircle(35, 15, 12);

        // Core glow
        graphics.fillStyle(0xffffff, 0.9);
        graphics.fillCircle(35, 15, 7);
        graphics.fillStyle(0xffffcc, 1);
        graphics.fillCircle(35, 15, 4);

        // Sparkle trail particles
        graphics.fillStyle(0xffff00, 0.9);
        graphics.fillCircle(28, 10, 2.5);
        graphics.fillCircle(30, 18, 2.5);
        graphics.fillCircle(22, 15, 2);
        graphics.fillStyle(0xffffff, 0.8);
        graphics.fillCircle(25, 12, 1.5);
        graphics.fillCircle(26, 17, 1.5);
        graphics.fillCircle(18, 14, 1.5);
        graphics.fillStyle(0xff8800, 0.7);
        graphics.fillCircle(15, 11, 1.5);
        graphics.fillCircle(16, 19, 1.5);

        graphics.generateTexture('comet', 50, 30);
        graphics.clear();

        graphics.destroy();
    }
    
    create() {
        this.time.delayedCall(500, () => this.scene.start('MenuScene'));
    }
}

class MenuScene extends Phaser.Scene {
    constructor() { super({ key: 'MenuScene' }); }

    create() {
        this.cameras.main.setBackgroundColor(CONFIG.colors.background);

        const title = this.add.text(CONFIG.width / 2, CONFIG.height * 0.25, 'SPIRITBALL', {
            fontSize: '72px', fontFamily: 'Righteous, Monoton, Orbitron, Arial, sans-serif', color: '#00ffff',
            stroke: '#ff00ff', strokeThickness: 8
        }).setOrigin(0.5);

        this.tweens.add({
            targets: title, scale: 1.05, duration: 1200,
            yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
        });

        this.add.text(CONFIG.width / 2, CONFIG.height * 0.35, 'DMT Vision Quest Pinball', {
            fontSize: '22px', fontFamily: 'Righteous, Monoton, Orbitron, Arial, sans-serif', color: '#ffffff', alpha: 0.9
        }).setOrigin(0.5);

        const highScore = localStorage.getItem('spiritball-highscore') || 0;
        this.add.text(CONFIG.width / 2, CONFIG.height * 0.48, `HIGH SCORE: ${highScore}`, {
            fontSize: '28px', fontFamily: 'Righteous, Monoton, Orbitron, Arial, sans-serif', color: '#ffff00',
            stroke: '#000000', strokeThickness: 4
        }).setOrigin(0.5);

        const isMobile = window.gameInputManager && window.gameInputManager.isMobile;
        const startText = isMobile ? 'TAP ⚡ TO START' : 'PRESS SPACE TO START';

        const startInstructions = this.add.text(CONFIG.width / 2, CONFIG.height * 0.65, startText, {
            fontSize: '36px', fontFamily: 'Righteous, Monoton, Orbitron, Arial, sans-serif', color: '#00ff99',
            stroke: '#000000', strokeThickness: 4
        }).setOrigin(0.5);

        this.tweens.add({
            targets: startInstructions, alpha: 0.4, duration: 900, yoyo: true, repeat: -1
        });

        this.input.keyboard.on('keydown-SPACE', () => this.startGame());

        // Mobile touch support - tap anywhere to start
        if (isMobile) {
            this.input.once('pointerdown', () => this.startGame());
        }

        this.launchTimer = this.time.addEvent({
            delay: 100,
            callback: () => {
                if (window.gameInputManager && window.gameInputManager.state.launchReleased) {
                    this.startGame();
                    window.gameInputManager.state.launchReleased = false;
                }
            },
            loop: true
        });
    }

    startGame() {
        if (this.launchTimer) this.launchTimer.remove();
        this.scene.start('GameScene');
    }

    shutdown() {
        // Clean up launch timer
        if (this.launchTimer) {
            this.launchTimer.remove();
            this.launchTimer = null;
        }

        // Remove all input listeners
        this.input.keyboard.removeAllListeners();
    }
}

class GameScene extends Phaser.Scene {
    constructor() { super({ key: 'GameScene' }); }
    
    create() {
        this.gameState = {
            score: 0,
            lives: CONFIG.startingLives,
            highScore: parseInt(localStorage.getItem('spiritball-highscore')) || 0,
            isPaused: false,
            ballInPlay: false,
            canLaunch: true,
            plungerCharging: false,
            plungerPower: 0,
            // Accumulated charge time in ms, built up via update() delta rather than a
            // Date.now() timestamp. This makes charging automatically pause-safe: update()
            // (and therefore updatePlunger()) never runs while isPaused, so no time silently
            // accumulates while the pause menu is open. See release-prompts/13-*.md.
            plungerChargeElapsed: 0,

            // XP Pinball: Rank System
            rank: 0, // Current rank index (0 = Cadet, 8 = Fleet Admiral)
            rankProgress: 0, // Missions completed towards next rank
            rankProgressRequired: 3, // Missions needed to rank up

            // XP Pinball: Mission System
            activeMission: null, // Currently active mission object
            selectedMission: null, // Selected mission index (0-2), null = nothing selected yet
            missionProgress: 0, // Progress towards current mission
            missionActive: false, // Is a mission currently running
            missionTargetsLit: [false, false, false], // Mission selection targets

            // XP Pinball: Fuel System
            fuel: 6, // Current fuel (0-6)
            fuelLights: Array(CONFIG.fuelLightCount).fill(true), // Fuel light states
            fuelDepleting: false, // Is fuel currently depleting
            fuelDepletionRate: 1000, // Fuel depletes every 1 second during mission
            lastFuelDepletion: 0,

            // XP Pinball: Multiplier System
            multiplierIndex: 0, // Current multiplier (0=1x, 1=2x, 2=3x, 3=5x, 4=10x)

            // XP Pinball: Lane Systems
            reentryLanes: [false, false, false], // Re-entry lane lights
            reentryLanesComplete: false, // All re-entry lanes lit
            leftLaneHits: 0,
            rightLaneHits: 0,
            allLaneHits: 0,

            // XP Pinball: Bumper System
            attackBumperHits: 0,
            bumpersUpgraded: false, // Bumpers upgraded when all re-entry lanes lit

            // XP Pinball: Satellite (Saturn)
            satelliteHits: 0,

            // XP Pinball: Mission Start Time (for timed missions)
            missionStartTime: 0,

            // XP Pinball: Statistics
            statistics: {
                missionsCompleted: 0,
                totalBumperHits: 0,
                totalLaneHits: 0,
                totalSatelliteHits: 0
            }
        };
        
        this.collisionCooldowns = new Map();
        this.leftFlipperActive = false;
        this.rightFlipperActive = false;
        this.leftFlipperCooldown = false;
        this.rightFlipperCooldown = false;

        this.setupBackground();
        this.setupPhysics();
        this.setupTable();
        this.setupBall();
        this.setupChakras(); // Mission targets + Fuel lights
        this.setupSaturn(); // Satellite bumper
        this.setupGrimReaper(); // Psychedelic grim reaper element
        this.setupObstacles(); // Attack bumpers + other obstacles
        this.setupReentryLanes(); // Re-entry lanes, launch ramp, bonus lane
        this.setupFlippers();
        this.setupSlingshots(); // Slingshot bumpers
        this.setupInlanesOutlanes(); // Inlanes and outlanes
        this.setupPlunger();
        this.setupDrainZone();
        this.setupCollisions();
        this.setupHUD();
        this.setupInput();
        this.setupParticles();
    }
    
    setupBackground() {
        // Set solid background color as fallback
        this.cameras.main.setBackgroundColor(CONFIG.colors.background);

        // Load background image if it exists
        if (this.textures.exists('background')) {
            try {
                const bg = this.add.image(CONFIG.width / 2, CONFIG.height / 2, 'background');
                bg.setDisplaySize(CONFIG.width, CONFIG.height);
                bg.setDepth(-10);
                bg.setAlpha(0.6); // Slightly transparent so game elements are visible
            } catch (e) {
                console.log('Background image failed to load, using solid color');
            }
        }
    }
    
    setupPhysics() {
        this.physics.world.setBounds(0, 0, CONFIG.width, CONFIG.height);
        // Gravity comes from CONFIG.gravity (set once in the Phaser game config below) - do
        // not override it here. See release-prompts/13-*.md.
    }
    
    setupTable() {
        this.walls = [];

        // Top wall
        const topWall = this.add.rectangle(CONFIG.width / 2, 15, CONFIG.width, 30, CONFIG.colors.wall);
        this.physics.add.existing(topWall, true);
        topWall.body.immovable = true;
        this.walls.push(topWall);

        // Left wall - full height
        const leftWall = this.add.rectangle(15, CONFIG.height / 2, 30, CONFIG.height, CONFIG.colors.wall);
        this.physics.add.existing(leftWall, true);
        leftWall.body.immovable = true;
        this.walls.push(leftWall);

        // Right wall - full height
        const rightWall = this.add.rectangle(CONFIG.width - 15, CONFIG.height / 2, 30, CONFIG.height, CONFIG.colors.wall);
        this.physics.add.existing(rightWall, true);
        rightWall.body.immovable = true;
        this.walls.push(rightWall);

        // Left slant - guides ball toward center (classic pinball shape)
        const leftSlant = this.add.rectangle(90, CONFIG.height - 200, 180, 20, CONFIG.colors.wall);
        leftSlant.setRotation(-0.5); // Angled inward
        this.physics.add.existing(leftSlant, true);
        leftSlant.body.immovable = true;
        this.walls.push(leftSlant);

        // Right slant - guides ball toward center
        const rightSlant = this.add.rectangle(CONFIG.width - 90, CONFIG.height - 200, 180, 20, CONFIG.colors.wall);
        rightSlant.setRotation(0.5); // Angled inward
        this.physics.add.existing(rightSlant, true);
        rightSlant.body.immovable = true;
        this.walls.push(rightSlant);

        // Left guide rail - upper playfield (enhanced with glow)
        // Outer glow layer
        const leftGuideGlow = this.add.rectangle(100, 450, 210, 22, CONFIG.colors.wall, 0.3);
        leftGuideGlow.setRotation(1.2);
        leftGuideGlow.setDepth(30);
        // Main guide rail
        const leftGuide = this.add.rectangle(100, 450, 200, 15, CONFIG.colors.wall);
        leftGuide.setRotation(1.2);
        this.physics.add.existing(leftGuide, true);
        leftGuide.body.immovable = true;
        leftGuide.setDepth(31);
        this.walls.push(leftGuide);
        // Inner highlight
        const leftGuideHighlight = this.add.rectangle(100, 450, 190, 8, 0xffffff, 0.4);
        leftGuideHighlight.setRotation(1.2);
        leftGuideHighlight.setDepth(32);

        // Right guide rail - upper playfield (enhanced with glow)
        // Outer glow layer
        const rightGuideGlow = this.add.rectangle(CONFIG.width - 100, 450, 210, 22, CONFIG.colors.wall, 0.3);
        rightGuideGlow.setRotation(-1.2);
        rightGuideGlow.setDepth(30);
        // Main guide rail
        const rightGuide = this.add.rectangle(CONFIG.width - 100, 450, 200, 15, CONFIG.colors.wall);
        rightGuide.setRotation(-1.2);
        this.physics.add.existing(rightGuide, true);
        rightGuide.body.immovable = true;
        rightGuide.setDepth(31);
        this.walls.push(rightGuide);
        // Inner highlight
        const rightGuideHighlight = this.add.rectangle(CONFIG.width - 100, 450, 190, 8, 0xffffff, 0.4);
        rightGuideHighlight.setRotation(-1.2);
        rightGuideHighlight.setDepth(32);

        // Center divider post (between flippers)
        const centerPost = this.add.circle(CONFIG.width / 2, CONFIG.height - 60, 8, CONFIG.colors.wall);
        this.physics.add.existing(centerPost, true);
        centerPost.body.immovable = true;
        this.walls.push(centerPost);
    }
    
    setupBall() {
        // Verify eyeball texture exists
        if (!this.textures.exists('eyeball')) {
            console.error('Eyeball texture missing - cannot create ball');
            return;
        }

        // Create eyeball as the ball
        this.ball = this.add.sprite(CONFIG.width - 70, CONFIG.height - 220, 'eyeball');
        this.ball.setScale(0.8);
        this.physics.add.existing(this.ball);
        this.ball.body.setCircle(CONFIG.ballRadius);
        this.ball.body.setBounce(CONFIG.ballBounce);
        this.ball.body.setCollideWorldBounds(true); // Keep ball within bounds as safety net
        this.ball.body.setMaxVelocity(CONFIG.ballMaxVelocity, CONFIG.ballMaxVelocity); // Prevent extreme speeds that cause tunneling

        // Add air resistance to prevent ball from getting stuck
        this.ball.body.setDamping(true);
        this.ball.body.setDrag(CONFIG.ballDrag); // Very light air resistance

        this.ball.setDepth(100);

        // Add subtle rotation to eyeball
        this.tweens.add({
            targets: this.ball,
            angle: 360,
            duration: 8000,
            repeat: -1,
            ease: 'Linear'
        });
    }
    
    setupChakras() {
        // XP Pinball: Split chakras into Mission Targets (3) and Fuel Lights (6)
        this.missionTargets = [];
        this.fuelLights = [];

        // Mission Targets - Left side (3 chakras for mission selection)
        const missionTargetX = 80;
        const missionStartY = 350;
        const missionSpacing = 120;

        for (let i = 0; i < CONFIG.missionTargetCount; i++) {
            const target = this.add.sprite(missionTargetX, missionStartY + (i * missionSpacing), `chakra${i}`);
            target.setScale(0.7);
            target.setDepth(50);
            this.physics.add.existing(target, true);
            target.body.setCircle(25);
            target.missionIndex = i; // Store which mission this represents

            // Add rotation animation (decorative - skipped under reduced motion)
            this.addAmbientTween({
                targets: target,
                angle: 360,
                duration: 2500 + (i * 300),
                repeat: -1,
                ease: 'Linear'
            });

            // Add pulsing glow (decorative - skipped under reduced motion)
            this.addAmbientTween({
                targets: target,
                scale: 0.75,
                alpha: 0.7,
                duration: 1200 + (i * 150),
                yoyo: true,
                repeat: -1,
                ease: 'Sine.easeInOut'
            });

            this.missionTargets.push(target);
        }

        // Fuel Lights - Right side (6 chakras as fuel indicators)
        const fuelLightX = CONFIG.width - 80;
        const fuelStartY = 250;
        const fuelSpacing = 90;

        for (let i = 0; i < CONFIG.fuelLightCount; i++) {
            const chakraIndex = (i + 3) % 7; // Use chakras 3-6, then 0-1
            const fuel = this.add.sprite(fuelLightX, fuelStartY + (i * fuelSpacing), `chakra${chakraIndex}`);
            fuel.setScale(0.6);
            fuel.setDepth(50);
            this.physics.add.existing(fuel, true);
            fuel.body.setCircle(20);
            fuel.fuelIndex = i; // Store which fuel light this represents

            // Add rotation animation (decorative - skipped under reduced motion)
            this.addAmbientTween({
                targets: fuel,
                angle: 360,
                duration: 3000 + (i * 200),
                repeat: -1,
                ease: 'Linear'
            });

            // Add pulsing glow (decorative - skipped under reduced motion)
            this.addAmbientTween({
                targets: fuel,
                scale: 0.65,
                alpha: 0.8,
                duration: 1500 + (i * 100),
                yoyo: true,
                repeat: -1,
                ease: 'Sine.easeInOut'
            });

            this.fuelLights.push(fuel);
        }

        // For backwards compatibility, keep this.chakras as combined array
        this.chakras = [...this.missionTargets, ...this.fuelLights];
    }
    
    setupSaturn() {
        // Position Saturn at top center - using new psychedelic asset
        this.saturn = this.add.sprite(CONFIG.width / 2, 200, 'saturn-psychedelic');
        this.saturn.setScale(0.35);
        this.saturn.setDepth(50);
        this.physics.add.existing(this.saturn, true);
        this.saturn.body.setCircle(50);

        // Rotation animation for Saturn (decorative - skipped under reduced motion)
        this.addAmbientTween({
            targets: this.saturn,
            angle: 360,
            duration: 6000,
            repeat: -1,
            ease: 'Linear'
        });

        // Pulsing effect for Saturn (decorative - skipped under reduced motion)
        this.addAmbientTween({
            targets: this.saturn,
            scale: { from: 0.35, to: 0.38 },
            duration: 2000,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
        });

        // Black hexagon vortex (hidden initially) - positioned at Saturn's north pole
        this.saturnHexagon = this.add.sprite(CONFIG.width / 2, 160, 'hexagon');
        this.saturnHexagon.setScale(0.6);
        this.saturnHexagon.setDepth(51);
        this.saturnHexagon.setVisible(false);
        this.physics.add.existing(this.saturnHexagon, true);
        this.saturnHexagon.body.setCircle(25);
    }

    setupGrimReaper() {
        // Position Grim Reaper on the left side as a decorative/interactive element
        this.grimReaperDecor = this.add.sprite(80, 700, 'grimreaper');
        this.grimReaperDecor.setScale(0.25);
        this.grimReaperDecor.setDepth(50);
        this.physics.add.existing(this.grimReaperDecor, true);
        this.grimReaperDecor.body.setCircle(40);

        // Floating/bobbing animation for Grim Reaper
        this.tweens.add({
            targets: this.grimReaperDecor,
            y: { from: 690, to: 710 },
            duration: 2500,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
        });

        // Gentle rocking animation
        this.tweens.add({
            targets: this.grimReaperDecor,
            angle: { from: -5, to: 5 },
            duration: 3000,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
        });

        // Pulsing glow effect
        this.tweens.add({
            targets: this.grimReaperDecor,
            alpha: { from: 0.9, to: 1.0 },
            scale: { from: 0.24, to: 0.26 },
            duration: 1800,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
        });
    }

    setupObstacles() {
        this.obstacles = [];
        this.attackBumpers = [];

        // Psychedelic Pinball: Attack Bumpers repositioned to match psychedelic playfield
        const centerX = CONFIG.width / 2;

        // Top row: 3 bumpers in a row (matching psychedelic layout)
        const topRowY = 280;
        const topSpacing = 110;

        // Left top bumper
        const bumper1 = this.add.sprite(centerX - topSpacing, topRowY, 'cosmic-crystal');
        bumper1.setScale(1.0);
        bumper1.setDepth(50);
        bumper1.setTint(0x00FF99); // Green tint for psychedelic feel
        this.physics.add.existing(bumper1, true);
        bumper1.body.setCircle(25);
        bumper1.isAttackBumper = true;

        // Center top bumper
        const bumper2 = this.add.sprite(centerX, topRowY, 'cosmic-crystal');
        bumper2.setScale(1.0);
        bumper2.setDepth(50);
        bumper2.setTint(0x00FF99); // Green tint for psychedelic feel
        this.physics.add.existing(bumper2, true);
        bumper2.body.setCircle(25);
        bumper2.isAttackBumper = true;

        // Right top bumper
        const bumper3 = this.add.sprite(centerX + topSpacing, topRowY, 'cosmic-crystal');
        bumper3.setScale(1.0);
        bumper3.setDepth(50);
        bumper3.setTint(0x00FF99); // Green tint for psychedelic feel
        this.physics.add.existing(bumper3, true);
        bumper3.body.setCircle(25);
        bumper3.isAttackBumper = true;

        // Middle pop bumper (4th bumper - center of playfield)
        const bumper4 = this.add.sprite(centerX, 420, 'asteroid');
        bumper4.setScale(1.1);
        bumper4.setDepth(50);
        bumper4.setTint(0xFFAA00); // Orange sun-like tint
        this.physics.add.existing(bumper4, true);
        bumper4.body.setCircle(28);
        bumper4.isAttackBumper = true;

        this.attackBumpers = [bumper1, bumper2, bumper3, bumper4];

        // Pulsing animation for attack bumpers
        this.tweens.add({
            targets: this.attackBumpers,
            scale: { from: 0.95, to: 1.05 },
            alpha: 0.95,
            duration: 800,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
        });

        // Other obstacles (not attack bumpers) - positioned for gameplay variety
        const vortex1 = this.add.sprite(120, 550, 'energy-vortex');
        vortex1.setScale(0.7);
        vortex1.setDepth(50);
        this.physics.add.existing(vortex1, true);
        vortex1.body.setCircle(14);

        const vortex2 = this.add.sprite(CONFIG.width - 120, 550, 'energy-vortex');
        vortex2.setScale(0.7);
        vortex2.setDepth(50);
        this.physics.add.existing(vortex2, true);
        vortex2.body.setCircle(14);

        // Spinning animation for vortexes
        this.tweens.add({
            targets: [vortex1, vortex2],
            angle: -360,
            duration: 2000,
            repeat: -1,
            ease: 'Linear'
        });

        // Pulsing glow for vortexes
        this.tweens.add({
            targets: [vortex1, vortex2],
            scale: 0.8,
            alpha: 0.8,
            duration: 800,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
        });

        // Comets - shooting star obstacles positioned near midfield
        const comet1 = this.add.sprite(200, 650, 'comet');
        comet1.setScale(0.6);
        comet1.setDepth(50);
        comet1.setAngle(45);
        this.physics.add.existing(comet1, true);
        comet1.body.setCircle(10);

        const comet2 = this.add.sprite(CONFIG.width - 200, 650, 'comet');
        comet2.setScale(0.6);
        comet2.setDepth(50);
        comet2.setAngle(-45);
        this.physics.add.existing(comet2, true);
        comet2.body.setCircle(10);

        // Glowing animation for comets
        this.tweens.add({
            targets: [comet1, comet2],
            alpha: 0.7,
            duration: 500,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
        });

        // Store all obstacles (including attack bumpers)
        this.obstacles = [
            ...this.attackBumpers,
            vortex1, vortex2,
            comet1, comet2
        ];
    }

    setupReentryLanes() {
        // XP Pinball: Re-entry lanes at top (3 lanes) with guide rails
        this.reentryLaneZones = [];
        this.rampGuides = [];

        const laneWidth = 60;
        const laneHeight = 50;
        const laneY = 45;
        const laneSpacing = (CONFIG.width - 140) / 3;

        for (let i = 0; i < CONFIG.reentryLaneCount; i++) {
            const laneX = 70 + (i * laneSpacing) + (laneSpacing / 2);
            const laneZone = this.add.rectangle(laneX, laneY, laneWidth, laneHeight, 0x00FF00, 0.4);
            laneZone.setDepth(40);
            this.physics.add.existing(laneZone, true);
            laneZone.laneIndex = i;
            laneZone.isReentryLane = true;
            this.reentryLaneZones.push(laneZone);

            // Add visual separators between lanes
            if (i < CONFIG.reentryLaneCount - 1) {
                const separator = this.add.rectangle(
                    laneX + laneWidth / 2 + 5,
                    laneY,
                    10,
                    laneHeight,
                    CONFIG.colors.wall
                );
                separator.setDepth(40);
                this.physics.add.existing(separator, true);
                separator.body.immovable = true;
                this.walls.push(separator);
            }
        }

        // Launch ramp with guide rails (right side, going up)
        this.launchRampZone = this.add.rectangle(CONFIG.width - 70, 300, 60, 250, 0xFFFF00, 0.3);
        this.launchRampZone.setDepth(40);
        this.physics.add.existing(this.launchRampZone, true);
        this.launchRampZone.isLaunchRamp = true;

        // Left guide for launch ramp (enhanced with glow)
        // Outer glow
        const launchGuideGlow = this.add.rectangle(CONFIG.width - 100, 300, 16, 290, CONFIG.colors.wall, 0.3);
        launchGuideGlow.setDepth(39);
        // Main guide
        const launchGuideLeft = this.add.rectangle(CONFIG.width - 100, 300, 10, 280, CONFIG.colors.wall);
        launchGuideLeft.setDepth(40);
        this.physics.add.existing(launchGuideLeft, true);
        launchGuideLeft.body.immovable = true;
        this.walls.push(launchGuideLeft);
        this.rampGuides.push(launchGuideLeft);
        // Inner highlight
        const launchGuideHighlight = this.add.rectangle(CONFIG.width - 100, 300, 6, 275, 0xffffff, 0.3);
        launchGuideHighlight.setDepth(41);

        // Bonus lane (left side) with chute
        this.bonusLaneZone = this.add.rectangle(60, 600, 50, 150, 0xFF00FF, 0.3);
        this.bonusLaneZone.setDepth(40);
        this.physics.add.existing(this.bonusLaneZone, true);
        this.bonusLaneZone.isBonusLane = true;

        // Left chute guide (guides ball down the left side) - enhanced with glow
        // Outer glow
        const leftChuteGlow = this.add.rectangle(45, 500, 18, 260, CONFIG.colors.wall, 0.3);
        leftChuteGlow.setDepth(39);
        leftChuteGlow.setRotation(0.15);
        // Main chute
        const leftChute = this.add.rectangle(45, 500, 12, 250, CONFIG.colors.wall);
        leftChute.setDepth(40);
        leftChute.setRotation(0.15);
        this.physics.add.existing(leftChute, true);
        leftChute.body.immovable = true;
        this.walls.push(leftChute);
        this.rampGuides.push(leftChute);
        // Inner highlight
        const leftChuteHighlight = this.add.rectangle(45, 500, 8, 245, 0xffffff, 0.3);
        leftChuteHighlight.setDepth(41);
        leftChuteHighlight.setRotation(0.15);

        // Right chute guide (guides ball down right side to launch area) - enhanced with glow
        // Outer glow
        const rightChuteGlow = this.add.rectangle(CONFIG.width - 45, 500, 18, 260, CONFIG.colors.wall, 0.3);
        rightChuteGlow.setDepth(39);
        rightChuteGlow.setRotation(-0.15);
        // Main chute
        const rightChute = this.add.rectangle(CONFIG.width - 45, 500, 12, 250, CONFIG.colors.wall);
        rightChute.setDepth(40);
        rightChute.setRotation(-0.15);
        this.physics.add.existing(rightChute, true);
        rightChute.body.immovable = true;
        this.walls.push(rightChute);
        this.rampGuides.push(rightChute);
        // Inner highlight
        const rightChuteHighlight = this.add.rectangle(CONFIG.width - 45, 500, 8, 245, 0xffffff, 0.3);
        rightChuteHighlight.setDepth(41);
        rightChuteHighlight.setRotation(-0.15);

        // Center ramp/chute (creates a funnel effect toward center) - enhanced with glow
        // Left funnel ramp
        // Outer glow
        const centerRampLeftGlow = this.add.rectangle(CONFIG.width / 2 - 60, 250, 105, 18, CONFIG.colors.wall, 0.3);
        centerRampLeftGlow.setDepth(39);
        centerRampLeftGlow.setRotation(0.4);
        // Main ramp
        const centerRampLeft = this.add.rectangle(CONFIG.width / 2 - 60, 250, 100, 12, CONFIG.colors.wall);
        centerRampLeft.setDepth(40);
        centerRampLeft.setRotation(0.4);
        this.physics.add.existing(centerRampLeft, true);
        centerRampLeft.body.immovable = true;
        this.walls.push(centerRampLeft);
        this.rampGuides.push(centerRampLeft);
        // Inner highlight
        const centerRampLeftHighlight = this.add.rectangle(CONFIG.width / 2 - 60, 250, 95, 7, 0xffffff, 0.3);
        centerRampLeftHighlight.setDepth(41);
        centerRampLeftHighlight.setRotation(0.4);

        // Right funnel ramp
        // Outer glow
        const centerRampRightGlow = this.add.rectangle(CONFIG.width / 2 + 60, 250, 105, 18, CONFIG.colors.wall, 0.3);
        centerRampRightGlow.setDepth(39);
        centerRampRightGlow.setRotation(-0.4);
        // Main ramp
        const centerRampRight = this.add.rectangle(CONFIG.width / 2 + 60, 250, 100, 12, CONFIG.colors.wall);
        centerRampRight.setDepth(40);
        centerRampRight.setRotation(-0.4);
        this.physics.add.existing(centerRampRight, true);
        centerRampRight.body.immovable = true;
        this.walls.push(centerRampRight);
        this.rampGuides.push(centerRampRight);
        // Inner highlight
        const centerRampRightHighlight = this.add.rectangle(CONFIG.width / 2 + 60, 250, 95, 7, 0xffffff, 0.3);
        centerRampRightHighlight.setDepth(41);
        centerRampRightHighlight.setRotation(-0.4);
    }

    setupFlippers() {
        const flipperY = CONFIG.height - 80; // Moved to very bottom
        const flipperGap = 80; // Gap between flippers

        // Flipper hit detection: Arcade Physics bodies are always axis-aligned and never
        // rotate with the sprite, so a rectangular hitbox sized to the flipper's resting
        // angle badly mismatches the sprite once it swings up. Instead we use a single
        // circular collider centered on the flipper's pivot, sized to cover the full swept
        // arc (rest angle to fully-up angle) so the ball reliably touches "the flipper" for
        // its whole swing, not just its resting pose. See release-prompts/01-*.md.
        this.flipperColliderRadius = 62;

        // Left cosmic energy wing flipper - at bottom left
        this.leftFlipper = this.add.sprite(CONFIG.width / 2 - flipperGap, flipperY, 'flipper-left');
        this.physics.add.existing(this.leftFlipper, true);
        this.leftFlipper.body.setCircle(
            this.flipperColliderRadius,
            this.leftFlipper.width / 2 - this.flipperColliderRadius,
            this.leftFlipper.height / 2 - this.flipperColliderRadius
        );
        this.leftFlipper.setDepth(99);
        this.leftFlipper.setAngle(20); // Resting position angled upward

        // Add glow effect to left flipper (decorative - skipped under reduced motion)
        this.addAmbientTween({
            targets: this.leftFlipper,
            alpha: 0.85,
            duration: 800,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
        });

        // Right cosmic energy wing flipper - at bottom right
        this.rightFlipper = this.add.sprite(CONFIG.width / 2 + flipperGap, flipperY, 'flipper-right');
        this.physics.add.existing(this.rightFlipper, true);
        this.rightFlipper.body.setCircle(
            this.flipperColliderRadius,
            this.rightFlipper.width / 2 - this.flipperColliderRadius,
            this.rightFlipper.height / 2 - this.flipperColliderRadius
        );
        this.rightFlipper.setDepth(99);
        this.rightFlipper.setAngle(-20); // Resting position angled upward

        // Add glow effect to right flipper (decorative - skipped under reduced motion)
        this.addAmbientTween({
            targets: this.rightFlipper,
            alpha: 0.85,
            duration: 800,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
        });
    }

    setupSlingshots() {
        // Slingshots - triangular bumpers near flippers that accelerate the ball
        this.slingshots = [];

        // Left slingshot
        const leftSlingshotX = CONFIG.width / 2 - 140;
        const leftSlingshotY = CONFIG.height - 130;
        const leftSlingshot = this.add.triangle(leftSlingshotX, leftSlingshotY, 0, 0, 40, -30, 40, 30, 0xff00ff);
        leftSlingshot.setAlpha(0.7);
        this.physics.add.existing(leftSlingshot, true);
        leftSlingshot.body.setSize(40, 60);
        leftSlingshot.setDepth(50);
        leftSlingshot.isSlingshot = true;
        leftSlingshot.side = 'left';
        this.slingshots.push(leftSlingshot);

        // Right slingshot
        const rightSlingshotX = CONFIG.width / 2 + 140;
        const rightSlingshotY = CONFIG.height - 130;
        const rightSlingshot = this.add.triangle(rightSlingshotX, rightSlingshotY, 0, 0, -40, -30, -40, 30, 0xff00ff);
        rightSlingshot.setAlpha(0.7);
        this.physics.add.existing(rightSlingshot, true);
        rightSlingshot.body.setSize(40, 60);
        rightSlingshot.setDepth(50);
        rightSlingshot.isSlingshot = true;
        rightSlingshot.side = 'right';
        this.slingshots.push(rightSlingshot);
    }

    setupInlanesOutlanes() {
        // Inlanes and outlanes for ball return/drain mechanics
        this.inlanes = [];
        this.outlanes = [];

        // Left outlane (drain zone)
        const leftOutlane = this.add.rectangle(50, CONFIG.height - 120, 40, 100, 0xff0000, 0.3);
        leftOutlane.setDepth(40);
        this.physics.add.existing(leftOutlane, true);
        leftOutlane.isOutlane = true;
        leftOutlane.side = 'left';
        this.outlanes.push(leftOutlane);

        // Left inlane (safe return)
        const leftInlane = this.add.rectangle(100, CONFIG.height - 120, 40, 100, 0x00ff00, 0.3);
        leftInlane.setDepth(40);
        this.physics.add.existing(leftInlane, true);
        leftInlane.isInlane = true;
        leftInlane.side = 'left';
        this.inlanes.push(leftInlane);

        // Right inlane (safe return)
        const rightInlane = this.add.rectangle(CONFIG.width - 100, CONFIG.height - 120, 40, 100, 0x00ff00, 0.3);
        rightInlane.setDepth(40);
        this.physics.add.existing(rightInlane, true);
        rightInlane.isInlane = true;
        rightInlane.side = 'right';
        this.inlanes.push(rightInlane);

        // Right outlane (drain zone)
        const rightOutlane = this.add.rectangle(CONFIG.width - 50, CONFIG.height - 120, 40, 100, 0xff0000, 0.3);
        rightOutlane.setDepth(40);
        this.physics.add.existing(rightOutlane, true);
        rightOutlane.isOutlane = true;
        rightOutlane.side = 'right';
        this.outlanes.push(rightOutlane);
    }

    setupPlunger() {
        // Launch port/channel on the right side
        this.launchPort = this.add.rectangle(CONFIG.width - 45, CONFIG.height - 300, 50, 250, 0x2a1a4a, 0.8);
        this.launchPort.setDepth(10);

        // Plunger sprite
        this.plunger = this.add.sprite(CONFIG.width - 45, CONFIG.height - 200, 'plunger');
        this.plunger.setScale(0.6);
        this.plunger.setDepth(95);

        // Idle "ready to launch" glow so the plunger reads as interactive even before the
        // player touches it (decorative - skipped under reduced motion).
        this.addAmbientTween({
            targets: this.plunger,
            alpha: 0.75,
            duration: 900,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
        });

        if (window.gameInputManager) {
            window.gameInputManager.setLaunchReady(true);
        }

        // Power meter background
        this.powerMeterBg = this.add.rectangle(CONFIG.width - 45, CONFIG.height - 450, 20, 100, 0x333333, 0.7);
        this.powerMeterBg.setDepth(98);

        // Power meter fill (starts empty)
        this.powerMeter = this.add.rectangle(CONFIG.width - 45, CONFIG.height - 400, 16, 0, 0x00ff00, 0.9);
        this.powerMeter.setDepth(99);
        this.powerMeter.setOrigin(0.5, 1);

        // Power meter outline
        this.add.rectangle(CONFIG.width - 45, CONFIG.height - 450, 22, 102, 0xffffff, 0).setStrokeStyle(2, 0x00ffff, 1).setDepth(100);

        // Charge text
        this.chargeText = this.add.text(CONFIG.width - 45, CONFIG.height - 520, '', {
            fontSize: '16px',
            fontFamily: 'Righteous, Monoton, Orbitron, Arial, sans-serif',
            color: '#00ffff',
            stroke: '#000000',
            strokeThickness: 3
        }).setOrigin(0.5).setDepth(1000).setAlpha(0);
    }
    
    setupDrainZone() {
        // Create black hole effect at bottom (drain) - positioned to catch falling balls
        this.drainZone = this.add.rectangle(CONFIG.width / 2, CONFIG.height + 50, CONFIG.width, 150, 0x000000);
        this.physics.add.existing(this.drainZone, true);
        this.drainZone.setDepth(5);

        // Add visual black void at the bottom
        const voidGraphics = this.add.graphics();
        voidGraphics.fillGradientStyle(0x4B0082, 0x4B0082, 0x000000, 0x000000, 0.6, 0.6, 1, 1);
        voidGraphics.fillRect(0, CONFIG.height - 60, CONFIG.width, 60);
        voidGraphics.setDepth(6);

        // Add swirling void circles
        for (let i = 0; i < 3; i++) {
            const voidCircle = this.add.circle(CONFIG.width / 2, CONFIG.height - 30, 80 + i * 40, 0x000000, 0.1 + i * 0.1);
            voidCircle.setDepth(7);
            voidCircle.setStrokeStyle(2, 0x9400D3, 0.3);

            // Rotating animation
            this.tweens.add({
                targets: voidCircle,
                scaleX: 1.2,
                scaleY: 0.8,
                alpha: 0.05 + i * 0.05,
                duration: 2000 + i * 500,
                yoyo: true,
                repeat: -1,
                ease: 'Sine.easeInOut'
            });
        }

        // Grim reaper sprite (hidden initially)
        this.grimReaper = this.add.sprite(CONFIG.width / 2, CONFIG.height + 100, 'grimreaper');
        this.grimReaper.setScale(1.2);
        this.grimReaper.setDepth(200);
        this.grimReaper.setVisible(false);
    }

    setupCollisions() {
        // Walls
        this.walls.forEach(wall => {
            this.physics.add.collider(this.ball, wall, (ball, wall) => {
                if (ball.body && ball.body.touching) {
                    if (this.cameras && this.cameras.main) {
                        this.cameraShake(40, 0.003);
                    }
                    const minVelocity = 100;
                    if (Math.abs(ball.body.velocity.x) < minVelocity && ball.body.touching.left) {
                        ball.body.setVelocityX(minVelocity);
                    } else if (Math.abs(ball.body.velocity.x) < minVelocity && ball.body.touching.right) {
                        ball.body.setVelocityX(-minVelocity);
                    }
                    if (Math.abs(ball.body.velocity.y) < minVelocity && ball.body.touching.up) {
                        ball.body.setVelocityY(minVelocity);
                    }
                }
            }, null, this);
        });

        // Flippers
        this.physics.add.collider(this.ball, this.leftFlipper, null, null, this);
        this.physics.add.collider(this.ball, this.rightFlipper, null, null, this);

        // XP Pinball: Mission Targets
        this.missionTargets.forEach((target, index) => {
            this.physics.add.overlap(this.ball, target, () => {
                if (!this.isOnCooldown(target)) {
                    this.hitMissionTarget(target, index);
                    this.setCooldown(target, 500);
                }
            }, null, this);
        });

        // XP Pinball: Fuel Lights
        this.fuelLights.forEach((fuel, index) => {
            this.physics.add.overlap(this.ball, fuel, () => {
                if (!this.isOnCooldown(fuel)) {
                    this.hitFuelLight(fuel, index);
                    this.setCooldown(fuel, 800);
                }
            }, null, this);
        });

        // XP Pinball: Attack Bumpers
        this.attackBumpers.forEach((bumper) => {
            this.physics.add.collider(this.ball, bumper, () => {
                if (!this.isOnCooldown(bumper)) {
                    this.hitAttackBumper(bumper);
                    this.setCooldown(bumper, 300);
                }
            }, null, this);
        });

        // XP Pinball: Satellite (Saturn)
        this.physics.add.collider(this.ball, this.saturn, () => {
            if (!this.isOnCooldown(this.saturn)) {
                this.hitSatellite();
                this.setCooldown(this.saturn, 400);
            }
        }, null, this);

        // Psychedelic: Decorative Grim Reaper
        this.physics.add.collider(this.ball, this.grimReaperDecor, () => {
            if (!this.isOnCooldown(this.grimReaperDecor)) {
                this.hitGrimReaperDecor();
                this.setCooldown(this.grimReaperDecor, 500);
            }
        }, null, this);

        // Slingshots
        this.slingshots.forEach((slingshot) => {
            this.physics.add.collider(this.ball, slingshot, () => {
                if (!this.isOnCooldown(slingshot)) {
                    this.hitSlingshot(slingshot);
                    this.setCooldown(slingshot, 200);
                }
            }, null, this);
        });

        // Inlanes
        this.inlanes.forEach((inlane) => {
            this.physics.add.overlap(this.ball, inlane, () => {
                if (!this.isOnCooldown(inlane)) {
                    this.hitInlane(inlane);
                    this.setCooldown(inlane, 1000);
                }
            }, null, this);
        });

        // Outlanes
        this.outlanes.forEach((outlane) => {
            this.physics.add.overlap(this.ball, outlane, () => {
                if (!this.isOnCooldown(outlane)) {
                    this.hitOutlane(outlane);
                    this.setCooldown(outlane, 1000);
                }
            }, null, this);
        });

        // XP Pinball: Re-entry Lanes
        this.reentryLaneZones.forEach((lane) => {
            this.physics.add.overlap(this.ball, lane, () => {
                if (!this.isOnCooldown(lane)) {
                    this.hitReentryLane(lane);
                    this.setCooldown(lane, 1000);
                }
            }, null, this);
        });

        // XP Pinball: Launch Ramp
        this.physics.add.overlap(this.ball, this.launchRampZone, () => {
            if (!this.isOnCooldown(this.launchRampZone)) {
                this.hitLaunchRamp();
                this.setCooldown(this.launchRampZone, 1500);
            }
        }, null, this);

        // XP Pinball: Bonus Lane
        this.physics.add.overlap(this.ball, this.bonusLaneZone, () => {
            if (!this.isOnCooldown(this.bonusLaneZone)) {
                this.hitBonusLane();
                this.setCooldown(this.bonusLaneZone, 1500);
            }
        }, null, this);

        // Other obstacles (vortexes, comets)
        this.obstacles.forEach((obstacle) => {
            if (!obstacle.isAttackBumper) {
                this.physics.add.collider(this.ball, obstacle, () => {
                    if (!this.isOnCooldown(obstacle)) {
                        this.hitObstacle(obstacle);
                        this.setCooldown(obstacle, 300);
                    }
                }, null, this);
            }
        });
    }

    setupHUD() {
        // XP Pinball HUD - More comprehensive display
        const dashboardBg = this.add.graphics();
        dashboardBg.fillStyle(0x1a0033, 0.9);
        dashboardBg.fillRoundedRect(0, 0, CONFIG.width, 120, 0);
        dashboardBg.lineStyle(3, 0x00ffff, 1);
        dashboardBg.strokeRoundedRect(0, 0, CONFIG.width, 120, 0);
        dashboardBg.setDepth(999);

        this.hud = {
            // Top Row: Score, High Score, Lives
            scoreLabel: this.add.text(25, 12, 'SCORE', {
                fontSize: '16px',
                fontFamily: 'Righteous, Monoton, Orbitron, Arial, sans-serif',
                fontStyle: 'bold',
                color: '#00d4ff',
                stroke: '#001a33',
                strokeThickness: 3
            }).setDepth(1001),

            scoreText: this.add.text(25, 32, '0', {
                fontSize: '32px',
                fontFamily: 'Righteous, Monoton, Orbitron, Arial, sans-serif',
                fontStyle: 'bold',
                color: '#00ffff',
                stroke: '#003366',
                strokeThickness: 4,
                shadow: { offsetX: 2, offsetY: 2, color: '#000000', blur: 4, fill: true }
            }).setDepth(1001),

            highScoreLabel: this.add.text(CONFIG.width / 2, 12, 'HIGH SCORE', {
                fontSize: '16px',
                fontFamily: 'Righteous, Monoton, Orbitron, Arial, sans-serif',
                fontStyle: 'bold',
                color: '#ffd700',
                stroke: '#332200',
                strokeThickness: 3
            }).setOrigin(0.5, 0).setDepth(1001),

            highScoreText: this.add.text(CONFIG.width / 2, 32, `${this.gameState.highScore}`, {
                fontSize: '32px',
                fontFamily: 'Righteous, Monoton, Orbitron, Arial, sans-serif',
                fontStyle: 'bold',
                color: '#ffff00',
                stroke: '#666600',
                strokeThickness: 4,
                shadow: { offsetX: 2, offsetY: 2, color: '#000000', blur: 4, fill: true }
            }).setOrigin(0.5, 0).setDepth(1001),

            livesLabel: this.add.text(CONFIG.width - 25, 12, 'BALLS', {
                fontSize: '16px',
                fontFamily: 'Righteous, Monoton, Orbitron, Arial, sans-serif',
                fontStyle: 'bold',
                color: '#ff66cc',
                stroke: '#330033',
                strokeThickness: 3
            }).setOrigin(1, 0).setDepth(1001),

            livesText: this.add.text(CONFIG.width - 25, 32, `${this.gameState.lives}`, {
                fontSize: '32px',
                fontFamily: 'Righteous, Monoton, Orbitron, Arial, sans-serif',
                fontStyle: 'bold',
                color: '#ff0099',
                stroke: '#660033',
                strokeThickness: 4,
                shadow: { offsetX: 2, offsetY: 2, color: '#000000', blur: 4, fill: true }
            }).setOrigin(1, 0).setDepth(1001),

            // Second Row: Rank, Mission, Multiplier
            rankLabel: this.add.text(25, 68, 'RANK', {
                fontSize: '14px',
                fontFamily: 'Righteous, Monoton, Orbitron, Arial, sans-serif',
                fontStyle: 'bold',
                color: '#00ffcc',
                stroke: '#003333',
                strokeThickness: 2
            }).setDepth(1001),

            rankText: this.add.text(25, 85, CONFIG.ranks[0], {
                fontSize: '20px',
                fontFamily: 'Righteous, Monoton, Orbitron, Arial, sans-serif',
                fontStyle: 'bold',
                color: '#00ff88',
                stroke: '#004400',
                strokeThickness: 3
            }).setDepth(1001),

            missionLabel: this.add.text(CONFIG.width / 2, 68, 'MISSION', {
                fontSize: '14px',
                fontFamily: 'Righteous, Monoton, Orbitron, Arial, sans-serif',
                fontStyle: 'bold',
                color: '#00ffcc',
                stroke: '#003333',
                strokeThickness: 2
            }).setOrigin(0.5, 0).setDepth(1001),

            missionText: this.add.text(CONFIG.width / 2, 85, 'Select Mission', {
                fontSize: '18px',
                fontFamily: 'Righteous, Monoton, Orbitron, Arial, sans-serif',
                fontStyle: 'bold',
                color: '#ffcc00',
                stroke: '#444400',
                strokeThickness: 3
            }).setOrigin(0.5, 0).setDepth(1001),

            multiplierLabel: this.add.text(CONFIG.width - 25, 68, 'MULT', {
                fontSize: '14px',
                fontFamily: 'Righteous, Monoton, Orbitron, Arial, sans-serif',
                fontStyle: 'bold',
                color: '#00ffcc',
                stroke: '#003333',
                strokeThickness: 2
            }).setOrigin(1, 0).setDepth(1001),

            multiplierText: this.add.text(CONFIG.width - 25, 85, '1x', {
                fontSize: '24px',
                fontFamily: 'Righteous, Monoton, Orbitron, Arial, sans-serif',
                fontStyle: 'bold',
                color: '#ff00ff',
                stroke: '#440044',
                strokeThickness: 3
            }).setOrigin(1, 0).setDepth(1001),

            // Third Row: Fuel indicator
            fuelLabel: this.add.text(25, 112, 'FUEL', {
                fontSize: '14px',
                fontFamily: 'Righteous, Monoton, Orbitron, Arial, sans-serif',
                fontStyle: 'bold',
                color: '#00ffcc',
                stroke: '#003333',
                strokeThickness: 2
            }).setDepth(1001),

            // Popup messages
            comboText: this.add.text(CONFIG.width / 2, 130, '', {
                fontSize: '20px',
                fontFamily: 'Righteous, Monoton, Orbitron, Arial, sans-serif',
                color: '#ffffff',
                stroke: '#ff00ff',
                strokeThickness: 4,
                letterSpacing: 2
            }).setOrigin(0.5, 0).setDepth(1001).setAlpha(0)
        };
    }
    
    setupInput() {
        // Set up keyboard listeners
        this.input.keyboard.on('keydown-LEFT', () => this.activateLeftFlipper());
        this.input.keyboard.on('keyup-LEFT', () => this.deactivateLeftFlipper());
        this.input.keyboard.on('keydown-RIGHT', () => this.activateRightFlipper());
        this.input.keyboard.on('keyup-RIGHT', () => this.deactivateRightFlipper());
        this.input.keyboard.on('keyup-SPACE', () => this.handleLaunchRelease());

        // SPACE has two jobs depending on pause state: charge/launch the plunger during play,
        // or resume the game from the top-level pause menu (not from the Controls submenu,
        // matching the original behavior). A single persistent listener here avoids the
        // dangling once()-listener leak that used to come from re-registering a resume
        // shortcut every time the pause menu opened - see release-prompts/07-*.md.
        this.input.keyboard.on('keydown-SPACE', () => {
            if (this.gameState.isPaused) {
                if (!this.settingsOverlay) {
                    this.resumeGame();
                }
                return;
            }
            this.handleLaunchPress();
        });

        // ESC always toggles pause, except when the Controls submenu is open, where it backs
        // out to the pause menu instead of resuming outright.
        this.input.keyboard.on('keydown-ESC', () => {
            if (this.gameState.isPaused && this.settingsOverlay) {
                this.settingsOverlay.forEach(obj => {
                    if (obj && obj.destroy) obj.destroy();
                });
                this.settingsOverlay = null;
                this.pauseGame();
                return;
            }
            this.handlePause();
        });

        // Create keyboard object for direct key checking (more reliable for launch)
        this.keys = {
            space: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE),
            left: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT),
            right: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT)
        };
    }
    
    setupParticles() {
        // Track dynamic particle emitters for cleanup
        this.dynamicParticles = [];

        // Verify particle texture exists
        if (!this.textures.exists('particle')) {
            console.error('Particle texture missing - skipping particle setup');
            return;
        }

        // Verify ball exists before creating trail
        if (!this.ball) {
            console.error('Ball not created - skipping particle setup');
            return;
        }

        // Ball trail using Phaser 3.60 particle system
        try {
            this.ballTrail = this.add.particles(0, 0, 'particle', {
                speed: 10,
                scale: { start: 0.5, end: 0 },
                alpha: { start: 0.7, end: 0 },
                lifespan: 400,
                blendMode: 'ADD',
                frequency: 25,
                tint: CONFIG.colors.eyeball,
                follow: this.ball
            });
            this.ballTrail.setDepth(95);
        } catch (error) {
            console.error('Failed to create ball trail particles:', error);
        }

        // Drain vortex particles
        try {
            this.drainParticles = this.add.particles(CONFIG.width / 2, CONFIG.height - 20, 'particle', {
                speed: { min: 50, max: 150 },
                angle: { min: 0, max: 360 },
                scale: { start: 0.6, end: 0 },
                alpha: { start: 0.8, end: 0 },
                lifespan: 1500,
                blendMode: 'ADD',
                frequency: 50,
                tint: [0x9400D3, 0x000000, 0x4B0082]
            });
            this.drainParticles.setDepth(10);
        } catch (error) {
            console.error('Failed to create drain particles:', error);
        }
    }

    update(time, delta) {
        if (this.gameState.isPaused) return;

        this.updateInput();
        this.updatePlunger(delta);
        this.updateFlipperPower();
        this.checkDrain();
        this.checkBallStuck(delta);

        // XP Pinball: Update mission fuel depletion
        if (this.gameState.missionActive) {
            this.depleteFuel();

            // Check time-based missions
            if (this.gameState.activeMission && this.gameState.activeMission.type === 'time') {
                this.checkMissionComplete();
            }
        }
    }

    checkBallStuck(delta) {
        // Anti-stuck mechanism. This used to add +100 to velocityY EVERY frame the ball was
        // below the speed threshold, which fights against legitimate slow rolling/resting and
        // visibly jitters the ball rather than resolving anything. Now it accumulates how long
        // the ball has been nearly stationary and, only once that's persisted for a real
        // moment (not a single slow frame), applies one decisive, slightly randomized kick and
        // resets - so a ball settling naturally for a few frames isn't constantly zapped, but a
        // genuinely stuck ball actually gets dislodged. See release-prompts/13-*.md.
        if (!this.ball || !this.ball.body || !this.gameState.ballInPlay) {
            this.ballStuckTime = 0;
            return;
        }

        const velocity = this.ball.body.velocity;
        const speed = Math.sqrt(velocity.x * velocity.x + velocity.y * velocity.y);

        if (speed < 40) {
            this.ballStuckTime = (this.ballStuckTime || 0) + delta;
            if (this.ballStuckTime >= 450) {
                const kickX = (Math.random() - 0.5) * 400; // random-ish horizontal escape direction
                this.ball.body.setVelocity(kickX, 380);
                this.ballStuckTime = 0;
            }
        } else {
            this.ballStuckTime = 0;
        }
    }

    shutdown() {
        // Clean up particle emitters
        if (this.ballTrail && this.ballTrail.active) {
            this.ballTrail.destroy();
        }
        if (this.drainParticles && this.drainParticles.active) {
            this.drainParticles.destroy();
        }

        // Clean up any dynamic particle emitters
        if (this.dynamicParticles) {
            this.dynamicParticles.forEach(particles => {
                if (particles && particles.active) {
                    particles.destroy();
                }
            });
            this.dynamicParticles = [];
        }

        // Clear collision cooldowns
        if (this.collisionCooldowns) {
            this.collisionCooldowns.clear();
        }

        // Remove all input listeners
        this.input.keyboard.removeAllListeners();

        // Clear pause overlay
        if (this.pauseOverlay) {
            this.pauseOverlay.forEach(obj => {
                if (obj && obj.active) {
                    obj.destroy();
                }
            });
            this.pauseOverlay = null;
        }
    }
    
    updateInput() {
        // Initialize previous states if needed
        if (this.previousLeftFlipperState === undefined) {
            this.previousLeftFlipperState = false;
        }
        if (this.previousRightFlipperState === undefined) {
            this.previousRightFlipperState = false;
        }

        // Handle mobile input
        if (window.gameInputManager) {
            // Only call activate/deactivate when state CHANGES to prevent animation spam
            const leftFlipperNow = window.gameInputManager.state.leftFlipper;
            if (leftFlipperNow !== this.previousLeftFlipperState) {
                if (leftFlipperNow) {
                    this.activateLeftFlipper();
                } else {
                    this.deactivateLeftFlipper();
                }
                this.previousLeftFlipperState = leftFlipperNow;
            }

            const rightFlipperNow = window.gameInputManager.state.rightFlipper;
            if (rightFlipperNow !== this.previousRightFlipperState) {
                if (rightFlipperNow) {
                    this.activateRightFlipper();
                } else {
                    this.deactivateRightFlipper();
                }
                this.previousRightFlipperState = rightFlipperNow;
            }

            // Handle plunger press
            if (window.gameInputManager.state.launchPressed) {
                this.handleLaunchPress();
                window.gameInputManager.state.launchPressed = false;
            }

            // Handle plunger release
            if (window.gameInputManager.state.launchReleased) {
                this.handleLaunchRelease();
                window.gameInputManager.state.launchReleased = false;
            }

            // Keep charging while held
            if (window.gameInputManager.state.launchHeld && this.gameState.plungerCharging) {
                // Charging is handled in updatePlunger()
            }

            if (window.gameInputManager.state.pause) {
                this.handlePause();
                window.gameInputManager.state.pause = false;
            }
        }

        // Desktop keyboard backup - direct key checking for maximum reliability
        if (this.keys && this.keys.space) {
            // Initialize tracking variable if needed
            if (this.previousSpaceDown === undefined) {
                this.previousSpaceDown = false;
            }

            const spaceCurrentlyDown = this.keys.space.isDown;

            // Space key just pressed (edge detection)
            if (spaceCurrentlyDown && !this.previousSpaceDown) {
                this.handleLaunchPress();
            }

            // Space key just released (edge detection) - CRITICAL for launch after death
            if (!spaceCurrentlyDown && this.previousSpaceDown) {
                this.handleLaunchRelease();
            }

            this.previousSpaceDown = spaceCurrentlyDown;
        }
    }

    updatePlunger(delta) {
        if (this.gameState.plungerCharging) {
            this.gameState.plungerChargeElapsed += delta;
            const chargePercent = Math.min(this.gameState.plungerChargeElapsed / CONFIG.plungerChargeTime, 1);

            // Continuous power from hold duration - this is now the ONLY thing that decides
            // launch power. There used to be a special-cased "quick tap = fixed 60% power" and
            // a "not charging = fixed 65% power" fallback; both are gone. Power always equals
            // exactly how long the plunger was held, from plungerMinPower (0ms) to
            // plungerMaxPower (>= plungerChargeTime ms). See release-prompts/13-*.md.
            this.gameState.plungerPower = CONFIG.plungerMinPower + (CONFIG.plungerMaxPower - CONFIG.plungerMinPower) * chargePercent;

            // Update power meter visual
            const meterHeight = 92 * chargePercent;
            this.powerMeter.setDisplaySize(16, meterHeight);

            const atMaxCharge = chargePercent >= 1;

            // Change color based on charge level
            if (atMaxCharge) {
                this.powerMeter.setFillStyle(0x00ffff);
            } else if (chargePercent < 0.33) {
                this.powerMeter.setFillStyle(0xff0000);
            } else if (chargePercent < 0.66) {
                this.powerMeter.setFillStyle(0xffff00);
            } else {
                this.powerMeter.setFillStyle(0x00ff00);
            }

            // Update charge text - clear "MAX!" feedback instead of just sitting at "100%" so
            // players know holding longer stops helping and it's time to let go.
            this.chargeText.setText(atMaxCharge ? 'MAX!' : `${Math.floor(chargePercent * 100)}%`);
            this.chargeText.setAlpha(1);
            this.chargeText.setScale(atMaxCharge ? 1.15 : 1);

            // Pull plunger back visually, with a small spring wobble layered on top so charging
            // reads as "held under tension" rather than a static bar filling up.
            const wobble = atMaxCharge ? Math.sin(this.gameState.plungerChargeElapsed / 60) * 2 : 0;
            this.plunger.y = CONFIG.height - 200 + (chargePercent * 36) + wobble;
        } else {
            // Reset visuals when not charging
            this.powerMeter.setDisplaySize(16, 0);
            this.chargeText.setAlpha(0);
        }
    }
    
    activateLeftFlipper() {
        if (!this.leftFlipperActive) {
            this.leftFlipperActive = true;
            this.tweens.add({
                targets: this.leftFlipper,
                angle: -50, // Swing up from 20 degree resting position
                duration: 50, // Fast but controlled response
                ease: 'Quad.easeOut' // Snappier easing for responsive feel
            });
        }
        // Power transfer to the ball is handled every frame in updateFlipperPower() while
        // the flipper is active, not just on this press edge - see release-prompts/01-*.md.
    }

    deactivateLeftFlipper() {
        this.leftFlipperActive = false;
        this.tweens.add({
            targets: this.leftFlipper,
            angle: 20, // Return to 20 degree resting position
            duration: 80, // Controlled snap-back like real pinball
            ease: 'Quad.easeIn'
        });
    }

    activateRightFlipper() {
        if (!this.rightFlipperActive) {
            this.rightFlipperActive = true;
            this.tweens.add({
                targets: this.rightFlipper,
                angle: 50, // Swing up from -20 degree resting position
                duration: 50, // Fast but controlled response
                ease: 'Quad.easeOut' // Snappier easing for responsive feel
            });
        }
        // Power transfer to the ball is handled every frame in updateFlipperPower() while
        // the flipper is active, not just on this press edge - see release-prompts/01-*.md.
    }

    deactivateRightFlipper() {
        this.rightFlipperActive = false;
        this.tweens.add({
            targets: this.rightFlipper,
            angle: -20, // Return to -20 degree resting position
            duration: 80, // Controlled snap-back like real pinball
            ease: 'Quad.easeIn'
        });
    }

    // Continuous per-frame flipper power application. Runs every update() tick (not just on
    // the initial press) so a ball that arrives on a flipper anytime while it's held up still
    // gets flipped, instead of only when the press and ball arrival coincide within one frame.
    updateFlipperPower() {
        if (!this.ball || !this.ball.body) return;

        if (this.leftFlipperActive && !this.leftFlipperCooldown &&
            this.physics.overlap(this.ball, this.leftFlipper)) {
            this.leftFlipperCooldown = true;

            const ballSpeed = Math.sqrt(
                this.ball.body.velocity.x ** 2 + this.ball.body.velocity.y ** 2
            );
            const flipperPower = Math.max(1500, ballSpeed * 2.4); // Professional pinball power

            // Calculate angle based on where ball hits flipper - more precision
            const hitPosition = (this.ball.x - this.leftFlipper.x) / 40;
            const angleAdjust = hitPosition * 35; // Maximum angle variation for expert control

            const launchAngle = -68 - angleAdjust; // Optimal steep angle for powerful upward shots
            const radians = (launchAngle * Math.PI) / 180;

            this.ball.body.setVelocity(
                Math.cos(radians) * flipperPower,
                Math.sin(radians) * flipperPower
            );

            if (this.cameras && this.cameras.main) {
                this.cameraShake(150, 0.008);
            }

            // Cooldown here is longer than a single frame so a ball still inside the (larger)
            // flipper collider right after being launched doesn't get re-flipped every frame
            // before it clears the hitbox ("machine-gunning").
            this.time.delayedCall(150, () => {
                this.leftFlipperCooldown = false;
            });
        }

        if (this.rightFlipperActive && !this.rightFlipperCooldown &&
            this.physics.overlap(this.ball, this.rightFlipper)) {
            this.rightFlipperCooldown = true;

            const ballSpeed = Math.sqrt(
                this.ball.body.velocity.x ** 2 + this.ball.body.velocity.y ** 2
            );
            const flipperPower = Math.max(1500, ballSpeed * 2.4); // Professional pinball power

            // Calculate angle based on where ball hits flipper - more precision
            const hitPosition = (this.ball.x - this.rightFlipper.x) / 40;
            const angleAdjust = hitPosition * 35; // Maximum angle variation for expert control

            const launchAngle = -112 - angleAdjust; // Optimal steep angle for powerful upward shots
            const radians = (launchAngle * Math.PI) / 180;

            this.ball.body.setVelocity(
                Math.cos(radians) * flipperPower,
                Math.sin(radians) * flipperPower
            );

            if (this.cameras && this.cameras.main) {
                this.cameraShake(150, 0.008);
            }

            this.time.delayedCall(150, () => {
                this.rightFlipperCooldown = false;
            });
        }
    }

    handleLaunchPress() {
        // Start charging the plunger if ball is ready to launch. Power is now purely a
        // function of how long this stays held - see updatePlunger(). No more quick-tap
        // timers or special-cased power overrides. See release-prompts/13-*.md.
        if (this.gameState.canLaunch && !this.gameState.ballInPlay) {
            this.gameState.plungerCharging = true;
            this.gameState.plungerChargeElapsed = 0;
            this.gameState.plungerPower = CONFIG.plungerMinPower;

            if (window.gameInputManager) {
                window.gameInputManager.vibrate(15); // light tick: charging started
            }
        }
    }

    handleLaunchRelease() {
        // Always try to launch if ball is ready, regardless of charging state - this is what
        // makes desktop SPACE and the mobile launch button reliable immediately after a death
        // (canLaunch/ballInPlay are reset together in resetBall(), so this check alone is
        // enough; no separate "did we see a press" bookkeeping is needed).
        if (this.gameState.canLaunch && !this.gameState.ballInPlay) {
            // gameState.plungerPower already holds the correct, continuously-updated value
            // from updatePlunger() if we were charging. If release fires with no charge in
            // progress at all (shouldn't normally happen given press/release symmetry, but
            // kept as a safe default), fall back to the minimum power rather than a magic ratio.
            if (!this.gameState.plungerCharging) {
                this.gameState.plungerPower = CONFIG.plungerMinPower;
            }

            this.executeLaunch();
        }
    }

    executeLaunch() {
        // Unified launch method - always works when ball is ready
        if (!this.gameState.canLaunch || this.gameState.ballInPlay) {
            return; // Safety check
        }

        this.launchBall();
        this.gameState.plungerCharging = false;

        // Reset plunger position with satisfying animation
        this.tweens.add({
            targets: this.plunger,
            y: CONFIG.height - 200,
            duration: 100,
            ease: 'Back.easeOut'
        });
    }

    handlePause() {
        if (!this.gameState.isPaused) {
            this.pauseGame();
        } else {
            this.resumeGame();
        }
    }
    
    // Old methods removed - replaced with XP Pinball mechanics

    // ===================================
    // XP PINBALL COLLISION HANDLERS
    // ===================================

    hitMissionTarget(target, index) {
        // Select a mission by hitting a mission target
        this.gameState.selectedMission = index;
        this.gameState.missionTargetsLit[index] = true;

        this.addScore(CONFIG.scores.missionTarget);
        this.cameraShake(60, 0.002);

        // Visual feedback
        target.setTint(CONFIG.colors.missionActive);
        this.tweens.add({
            targets: target,
            scale: 0.85,
            duration: 100,
            yoyo: true
        });

        const missionName = CONFIG.missions[this.gameState.rank][index].name;
        this.showPopup(`Selected: ${missionName}`, target.x, target.y - 50, 16);
        this.updateHUD();
    }

    hitFuelLight(fuel, index) {
        // Refuel by hitting fuel lights
        if (this.gameState.fuel < CONFIG.fuelLightCount) {
            this.gameState.fuel++;
            this.gameState.fuelLights[index] = true;
            this.updateFuelLightVisuals();

            this.addScore(CONFIG.scores.fuelTarget);
            this.cameraShake(50, 0.002);
            this.showPopup('+FUEL', fuel.x, fuel.y - 40, 18);
            this.updateHUD();
        }
    }

    // Keeps the 6 fuel-light sprites on the playfield in sync with the actual fuel count as a
    // simple fixed-order countdown bar (lights 0..fuel-1 full, fuel..5 low) - rather than the
    // previous scheme where refueling lit whichever specific target was hit while depletion
    // dimmed by remaining-count index, which could disagree with each other. See
    // release-prompts/08-*.md.
    updateFuelLightVisuals() {
        for (let i = 0; i < this.fuelLights.length; i++) {
            if (i < this.gameState.fuel) {
                this.fuelLights[i].setAlpha(1);
                this.fuelLights[i].setTint(CONFIG.colors.fuelFull);
            } else {
                this.fuelLights[i].setAlpha(0.3);
                this.fuelLights[i].setTint(CONFIG.colors.fuelLow);
            }
        }
    }

    hitAttackBumper(bumper) {
        // XP Pinball attack bumper behavior - classic pinball style with powerful kicks
        const baseScore = this.gameState.bumpersUpgraded ?
            CONFIG.scores.attackBumperUpgraded :
            CONFIG.scores.attackBumper;

        this.addScore(baseScore);
        this.gameState.attackBumperHits++;
        this.gameState.statistics.totalBumperHits++;

        // Check if this advances current mission
        if (this.gameState.missionActive && this.gameState.activeMission) {
            if (this.gameState.activeMission.type === 'bumper') {
                this.gameState.missionProgress++;
                this.checkMissionComplete();
            }
        }

        // POWERFUL bounce like classic pinball - bumpers actively push the ball
        if (this.ball.body) {
            const angle = Math.atan2(
                this.ball.y - bumper.y,
                this.ball.x - bumper.x
            );

            // Moderate bumper force - allows ball to fall through gaps
            const bumperPower = this.gameState.bumpersUpgraded ? 550 : 400;

            this.ball.body.setVelocity(
                Math.cos(angle) * bumperPower,
                Math.sin(angle) * bumperPower
            );
        }

        // Strong visual/audio feedback
        this.cameraShake(120, 0.006);
        this.tweens.add({
            targets: bumper,
            scale: 1.15,
            duration: 60,
            yoyo: true,
            ease: 'Quad.easeOut'
        });

        // Flash effect
        const originalTint = bumper.tintTopLeft;
        bumper.setTint(0xffffff);
        this.time.delayedCall(80, () => {
            bumper.setTint(originalTint);
        });

        this.showPopup(`+${baseScore}`, bumper.x, bumper.y - 40, 20);
        this.updateHUD();
    }

    hitSatellite() {
        // XP Pinball satellite (Saturn) behavior
        this.gameState.satelliteHits++;
        this.gameState.statistics.totalSatelliteHits++;

        this.addScore(CONFIG.scores.satellite);
        this.cameraShake(120, 0.005);

        // Check if this advances current mission
        if (this.gameState.missionActive && this.gameState.activeMission) {
            if (this.gameState.activeMission.type === 'satellite') {
                this.gameState.missionProgress++;
                this.checkMissionComplete();
            }
        }

        // Bounce away
        if (this.ball.body) {
            const angle = Math.atan2(
                this.ball.y - this.saturn.y,
                this.ball.x - this.saturn.x
            );
            this.ball.body.setVelocity(
                Math.cos(angle) * 800,
                Math.sin(angle) * 800
            );
        }

        this.tweens.add({
            targets: this.saturn,
            scale: 0.4,
            duration: 100,
            yoyo: true
        });

        this.showPopup('SATELLITE!', this.saturn.x, this.saturn.y - 60, 22);
        this.updateHUD();
    }

    hitGrimReaperDecor() {
        // Psychedelic Grim Reaper decorative element behavior
        this.addScore(750);
        this.cameraShake(100, 0.004);

        // Bounce away with extra flair
        if (this.ball.body) {
            const angle = Math.atan2(
                this.ball.y - this.grimReaperDecor.y,
                this.ball.x - this.grimReaperDecor.x
            );
            this.ball.body.setVelocity(
                Math.cos(angle) * 700,
                Math.sin(angle) * 700
            );
        }

        // Flash and bounce animation
        this.tweens.add({
            targets: this.grimReaperDecor,
            scale: 0.3,
            duration: 100,
            yoyo: true,
            ease: 'Quad.easeOut'
        });

        // Temporary tint flash
        const originalAlpha = this.grimReaperDecor.alpha;
        this.grimReaperDecor.setAlpha(1);
        this.grimReaperDecor.setTint(0xff00ff);
        this.time.delayedCall(100, () => {
            this.grimReaperDecor.clearTint();
            this.grimReaperDecor.setAlpha(originalAlpha);
        });

        this.showPopup('REAPER!', this.grimReaperDecor.x, this.grimReaperDecor.y - 50, 20);
        this.updateHUD();
    }

    hitReentryLane(lane) {
        // XP Pinball re-entry lane behavior
        const laneIndex = lane.laneIndex;
        this.gameState.reentryLanes[laneIndex] = true;
        this.gameState.allLaneHits++;
        this.gameState.statistics.totalLaneHits++;

        this.addScore(CONFIG.scores.reentryLane);
        this.cameraShake(80, 0.003);

        // Light up the lane
        lane.setFillStyle(CONFIG.colors.missionActive, 0.5);

        // Check if all re-entry lanes are lit
        if (this.gameState.reentryLanes.every(lit => lit)) {
            this.gameState.reentryLanesComplete = true;
            this.gameState.bumpersUpgraded = true;
            this.showPopup('WEAPONS UPGRADED!', CONFIG.width / 2, 200, 24);

            // Check mission progress
            if (this.gameState.missionActive && this.gameState.activeMission) {
                if (this.gameState.activeMission.type === 'reentry') {
                    this.gameState.missionProgress++;
                    this.checkMissionComplete();
                }
            }
        }

        // Check mission progress for lane-based missions
        if (this.gameState.missionActive && this.gameState.activeMission) {
            if (this.gameState.activeMission.type === 'lane' ||
                this.gameState.activeMission.type === 'alllanes') {
                this.gameState.missionProgress++;
                this.checkMissionComplete();
            }
        }

        this.showPopup('RE-ENTRY!', lane.x, lane.y - 30, 18);
        this.updateHUD();
    }

    hitLaunchRamp() {
        // XP Pinball launch ramp - starts selected mission
        this.addScore(CONFIG.scores.launchRamp);
        this.cameraShake(90, 0.003);

        // Start mission if one is selected
        if (!this.gameState.missionActive && this.gameState.selectedMission !== null) {
            this.startMission();
        } else if (this.gameState.missionActive && this.gameState.activeMission) {
            // Count towards ramp missions
            if (this.gameState.activeMission.type === 'ramp') {
                this.gameState.missionProgress++;
                this.checkMissionComplete();
            }
        } else if (!this.gameState.missionActive) {
            this.showPopup('SELECT A MISSION FIRST', CONFIG.width / 2, CONFIG.height / 2, 20);
        }

        this.showPopup('LAUNCH RAMP!', this.launchRampZone.x, this.launchRampZone.y - 40, 20);
        this.updateHUD();
    }

    hitBonusLane() {
        // XP Pinball bonus lane - big points
        this.addScore(CONFIG.scores.bonusLane);
        this.cameraShake(150, 0.006);
        this.cameraFlash(300);

        // Award multiplier progress
        if (this.gameState.multiplierIndex < CONFIG.multipliers.length - 1) {
            this.gameState.multiplierIndex++;
            this.showPopup(`MULTIPLIER ${CONFIG.multipliers[this.gameState.multiplierIndex]}x!`,
                CONFIG.width / 2, 250, 26);
        }

        this.showPopup('BONUS LANE!', this.bonusLaneZone.x, this.bonusLaneZone.y - 40, 24);
        this.updateHUD();
    }

    hitObstacle(obstacle) {
        // Regular obstacles (vortexes, comets) - minor scoring
        const textureName = obstacle.texture.key;
        let points = 100;

        if (textureName === 'energy-vortex') {
            points = 300;
            // Speed boost
            if (this.ball.body) {
                const currentSpeed = Math.sqrt(
                    this.ball.body.velocity.x ** 2 + this.ball.body.velocity.y ** 2
                );
                const newSpeed = currentSpeed * 1.2;
                const angle = Math.atan2(this.ball.body.velocity.y, this.ball.body.velocity.x);
                this.ball.body.setVelocity(
                    Math.cos(angle) * newSpeed,
                    Math.sin(angle) * newSpeed
                );
            }
        } else if (textureName === 'comet') {
            points = 250;
        }

        this.addScore(points);
        this.cameraShake(60, 0.002);
    }

    hitSlingshot(slingshot) {
        // Slingshot behavior - accelerate ball away with force
        this.addScore(100);

        if (this.ball.body) {
            const angle = Math.atan2(
                this.ball.y - slingshot.y,
                this.ball.x - slingshot.x
            );

            // Strong kick from slingshot
            const slingshotPower = 1100;
            this.ball.body.setVelocity(
                Math.cos(angle) * slingshotPower,
                Math.sin(angle) * slingshotPower
            );
        }

        // Visual feedback
        this.cameraShake(120, 0.005);
        this.tweens.add({
            targets: slingshot,
            alpha: 1,
            duration: 50,
            yoyo: true
        });

        this.showPopup('+100', slingshot.x, slingshot.y - 30, 16);
    }

    hitInlane(inlane) {
        // Inlane - safe return to flippers with bonus points
        this.addScore(500);
        this.cameraShake(80, 0.003);

        inlane.setFillStyle(0x00ff00, 0.8);
        this.tweens.add({
            targets: inlane,
            alpha: 0.3,
            duration: 300
        });

        this.showPopup('INLANE +500', inlane.x, inlane.y - 40, 16);
        this.updateHUD();
    }

    hitOutlane(outlane) {
        // Outlane - dangerous area that drains the ball
        this.addScore(200);
        this.cameraShake(100, 0.004);

        outlane.setFillStyle(0xff0000, 0.8);
        this.tweens.add({
            targets: outlane,
            alpha: 0.3,
            duration: 300
        });

        this.showPopup('OUTLANE!', outlane.x, outlane.y - 40, 16);
        this.updateHUD();
    }
    
    // ===================================
    // XP PINBALL MISSION MANAGEMENT
    // ===================================

    startMission() {
        // Start the selected mission
        const mission = CONFIG.missions[this.gameState.rank][this.gameState.selectedMission];
        this.gameState.activeMission = mission;
        this.gameState.missionActive = true;
        this.gameState.missionProgress = 0;
        this.gameState.fuel = CONFIG.fuelLightCount;
        this.gameState.fuelDepleting = true;
        this.gameState.lastFuelDepletion = Date.now();
        this.gameState.missionStartTime = Date.now();
        this.updateFuelLightVisuals();

        this.cameraShake(150, 0.006);
        this.cameraFlash(400);
        this.showPopup(`MISSION: ${mission.name}`, CONFIG.width / 2, CONFIG.height / 2 - 50, 28);
        this.showPopup(mission.description, CONFIG.width / 2, CONFIG.height / 2, 18);

        this.updateHUD();
    }

    checkMissionComplete() {
        if (!this.gameState.activeMission) return;

        const mission = this.gameState.activeMission;
        let isComplete = false;

        switch (mission.type) {
            case 'bumper':
            case 'ramp':
            case 'lane':
            case 'alllanes':
            case 'satellite':
            case 'target':
            case 'reentry':
                isComplete = this.gameState.missionProgress >= mission.requirement;
                break;
            case 'fuel':
                isComplete = this.gameState.fuel >= mission.requirement;
                break;
            case 'score':
                isComplete = this.gameState.score >= mission.requirement;
                break;
            case 'time':
                const elapsed = (Date.now() - this.gameState.missionStartTime) / 1000;
                isComplete = elapsed >= mission.requirement;
                break;
            case 'rapidtarget':
                isComplete = this.gameState.missionProgress >= mission.requirement;
                break;
        }

        if (isComplete) {
            this.completeMission();
        }

        this.updateHUD();
    }

    completeMission() {
        const mission = this.gameState.activeMission;

        // Award points
        this.addScore(CONFIG.scores.missionComplete);

        // Track completion
        this.gameState.statistics.missionsCompleted++;
        this.gameState.rankProgress++;

        // Visual celebration
        this.cameraShake(250, 0.008);
        this.cameraFlash(600);
        this.showPopup('MISSION COMPLETE!', CONFIG.width / 2, CONFIG.height / 2 - 50, 36);
        this.showPopup(`+${CONFIG.scores.missionComplete}`, CONFIG.width / 2, CONFIG.height / 2 + 20, 28);

        // Check rank up
        if (this.gameState.rankProgress >= this.gameState.rankProgressRequired) {
            this.rankUp();
        }

        // End mission
        this.gameState.missionActive = false;
        this.gameState.activeMission = null;
        this.gameState.fuelDepleting = false;
        this.gameState.selectedMission = null;
        this.gameState.missionTargetsLit = [false, false, false];

        // Reset mission targets visually
        this.missionTargets.forEach(target => {
            target.clearTint();
        });

        this.updateHUD();
    }

    rankUp() {
        if (this.gameState.rank < CONFIG.ranks.length - 1) {
            this.gameState.rank++;
            this.gameState.rankProgress = 0;

            this.addScore(CONFIG.scores.rankUp);

            this.cameraShake(400, 0.01);
            this.cameraFlash(1000);
            this.showPopup('RANK UP!', CONFIG.width / 2, CONFIG.height / 2 - 60, 44);
            this.showPopup(CONFIG.ranks[this.gameState.rank], CONFIG.width / 2, CONFIG.height / 2, 36);

            this.updateHUD();
        }
    }

    depleteFuel() {
        if (!this.gameState.fuelDepleting || !this.gameState.missionActive) return;

        const now = Date.now();
        if (now - this.gameState.lastFuelDepletion >= this.gameState.fuelDepletionRate) {
            this.gameState.fuel--;
            this.gameState.lastFuelDepletion = now;
            this.updateFuelLightVisuals();

            if (this.gameState.fuel <= 0) {
                this.abortMission();
            }

            this.updateHUD();
        }
    }

    abortMission() {
        this.gameState.missionActive = false;
        this.gameState.activeMission = null;
        this.gameState.fuelDepleting = false;
        this.gameState.selectedMission = null;
        this.gameState.missionTargetsLit = [false, false, false];

        // Reset mission targets visually
        this.missionTargets.forEach(target => {
            target.clearTint();
        });

        this.showPopup('MISSION ABORTED', CONFIG.width / 2, CONFIG.height / 2, 32);
        this.cameraShake(120, 0.004);

        this.updateHUD();
    }
    
    checkDrain() {
        if (this.gameState.ballInPlay && this.physics.overlap(this.ball, this.drainZone)) {
            // Show Grim Reaper
            this.showGrimReaper();

            this.gameState.lives--;
            this.gameState.ballInPlay = false;

            // XP Pinball: Abort any active mission
            if (this.gameState.missionActive) {
                this.abortMission();
            }

            this.updateHUD();

            if (this.gameState.lives <= 0) {
                this.time.delayedCall(2000, () => this.gameOver());
            } else {
                this.time.delayedCall(2000, () => {
                    this.hideGrimReaper();
                    this.resetBall();
                });
            }
        }
    }
    
    showGrimReaper() {
        this.grimReaper.setVisible(true);
        this.grimReaper.setY(CONFIG.height + 100);
        this.grimReaper.setScale(1.2);
        this.grimReaper.setAlpha(1);
        
        // Rise up from bottom
        this.tweens.add({
            targets: this.grimReaper,
            y: CONFIG.height - 80,
            duration: 400,
            ease: 'Back.easeOut'
        });
        
        // YOU DIED text
        const youDiedText = this.add.text(CONFIG.width / 2, CONFIG.height / 2, 'YOU DIED', {
            fontSize: '72px',
            fontFamily: 'Righteous, Monoton, Orbitron, Arial, sans-serif',
            color: '#ff0000',
            stroke: '#000000',
            strokeThickness: 8
        }).setOrigin(0.5).setDepth(201).setAlpha(0);
        
        this.tweens.add({
            targets: youDiedText,
            alpha: 1,
            scale: 1.2,
            duration: 300,
            ease: 'Power2',
            onComplete: () => {
                this.tweens.add({
                    targets: youDiedText,
                    scale: 1.05,
                    duration: 400,
                    yoyo: true,
                    repeat: 2,
                    onComplete: () => {
                        youDiedText.destroy();
                    }
                });
            }
        });

        // Screen effect
        if (this.cameras && this.cameras.main) {
            this.cameraShake(400, 0.008);
            this.cameraFlash(200, 255, 0, 0, true);
        }
    }
    
    hideGrimReaper() {
        this.tweens.add({
            targets: this.grimReaper,
            y: CONFIG.height + 100,
            alpha: 0,
            duration: 400,
            ease: 'Power2.easeIn',
            onComplete: () => {
                this.grimReaper.setVisible(false);
            }
        });
    }
    
    resetBall() {
        // Ensure ball exists
        if (!this.ball) {
            console.error('Ball does not exist - cannot reset');
            return;
        }

        // Ensure ball is visible and physics enabled
        this.ball.setVisible(true);
        this.ball.setActive(true);
        this.ball.setPosition(CONFIG.width - 70, CONFIG.height - 220);

        // Safely set texture
        if (this.textures.exists('eyeball')) {
            this.ball.setTexture('eyeball');
        }

        this.ball.setScale(0.8);
        this.ball.setAlpha(1);

        // Reset physics body
        if (this.ball.body) {
            this.ball.body.setVelocity(0, 0);
            this.ball.body.setEnable(true);
            this.ball.body.setBounce(CONFIG.ballBounce);
            this.ball.body.setCollideWorldBounds(true); // Ensure ball stays in bounds
        }

        // Reset game state for launch - CRITICAL for desktop launch after death
        this.gameState.ballInPlay = false;
        this.gameState.canLaunch = true;
        this.gameState.plungerCharging = false;
        this.gameState.plungerPower = 0;
        this.gameState.plungerChargeElapsed = 0;

        if (this.collisionCooldowns) {
            this.collisionCooldowns.clear();
        }

        // Reset input tracking to ensure clean state for next launch
        this.previousSpaceDown = false;

        if (window.gameInputManager) {
            window.gameInputManager.setLaunchReady(true);
        }

        // XP Pinball: Abort mission if ball is lost
        if (this.gameState.missionActive) {
            this.abortMission();
        }
    }
    
    launchBall() {
        // Safety check: ensure ball exists before launching
        if (!this.ball || !this.ball.body) {
            console.error('Cannot launch: ball or ball.body is undefined');
            this.gameState.canLaunch = false;
            this.gameState.ballInPlay = false;
            return;
        }

        this.gameState.ballInPlay = true;
        this.gameState.canLaunch = false;

        if (window.gameInputManager) {
            window.gameInputManager.setLaunchReady(false);
        }

        // Use plunger power to determine velocity. Horizontal kick now scales mildly with
        // power too (was a flat -250 regardless of charge) - weak taps go nearly straight up
        // the launch chute, strong shots get a bit more english, without swinging wide enough
        // to clip the chute's guide wall. See release-prompts/13-*.md.
        const power = this.gameState.plungerPower;
        const velocityY = -power;
        const velocityX = -(150 + power * 0.08);

        this.ball.body.setVelocity(velocityX, velocityY);

        // A quick scale punch on the ball itself at the moment of launch, on top of the
        // existing continuous idle rotation tween, for extra impact feedback.
        this.tweens.add({
            targets: this.ball,
            scale: { from: 0.92, to: 0.8 },
            duration: 180,
            ease: 'Back.easeOut'
        });

        const powerPercent = (power - CONFIG.plungerMinPower) / (CONFIG.plungerMaxPower - CONFIG.plungerMinPower);

        // Shake intensity based on power - with safety check
        if (this.cameras && this.cameras.main) {
            const shakeIntensity = 0.002 + powerPercent * 0.005;
            this.cameraShake(150, shakeIntensity);
        }

        if (window.gameInputManager) {
            // Stronger buzz for a stronger launch (roughly 20-60ms)
            window.gameInputManager.vibrate(20 + Math.round(powerPercent * 40));
        }

        // Visual feedback
        this.showPopup('LAUNCH!', this.ball.x, this.ball.y - 40, 20);
    }
    
    addScore(points) {
        // XP Pinball: Apply field multiplier
        const multiplier = CONFIG.multipliers[this.gameState.multiplierIndex];
        const multipliedPoints = Math.floor(points * multiplier);
        this.gameState.score += multipliedPoints;

        if (this.gameState.score > this.gameState.highScore) {
            this.gameState.highScore = this.gameState.score;
            localStorage.setItem('spiritball-highscore', this.gameState.highScore);
        }

        // Check mission progress for score-based missions
        if (this.gameState.missionActive && this.gameState.activeMission) {
            if (this.gameState.activeMission.type === 'score') {
                this.checkMissionComplete();
            }
        }

        this.updateHUD();
    }

    updateHUD() {
        // Update basic stats
        this.hud.scoreText.setText(`${this.gameState.score}`);
        this.hud.highScoreText.setText(`${this.gameState.highScore}`);
        this.hud.livesText.setText(`${this.gameState.lives}`);

        // Update rank
        this.hud.rankText.setText(CONFIG.ranks[this.gameState.rank]);

        // Update mission
        if (this.gameState.missionActive && this.gameState.activeMission) {
            const progress = this.gameState.missionProgress;
            const required = this.gameState.activeMission.requirement;
            this.hud.missionText.setText(`${this.gameState.activeMission.name} (${progress}/${required})`);
        } else if (this.gameState.selectedMission !== null) {
            const mission = CONFIG.missions[this.gameState.rank][this.gameState.selectedMission];
            this.hud.missionText.setText(`Selected: ${mission.name}`);
        } else {
            this.hud.missionText.setText('Select Mission');
        }

        // Update multiplier
        const mult = CONFIG.multipliers[this.gameState.multiplierIndex];
        this.hud.multiplierText.setText(`${mult}x`);

        // Update fuel display (create fuel dots if needed)
        if (!this.fuelDots) {
            this.fuelDots = [];
            for (let i = 0; i < CONFIG.fuelLightCount; i++) {
                const dot = this.add.circle(70 + (i * 15), 110, 5, 0x00FF00).setDepth(1001);
                this.fuelDots.push(dot);
            }
        }

        // Update fuel dots
        for (let i = 0; i < this.fuelDots.length; i++) {
            if (i < this.gameState.fuel) {
                this.fuelDots[i].setFillStyle(0x00FF00);
                this.fuelDots[i].setAlpha(1);
            } else {
                this.fuelDots[i].setFillStyle(0xFF0000);
                this.fuelDots[i].setAlpha(0.3);
            }
        }
    }
    
    showPopup(text, x, y, fontSize = 26) {
        const popup = this.add.text(x, y, text, {
            fontSize: `${fontSize}px`, fontFamily: 'Righteous, Monoton, Orbitron, Arial, sans-serif', color: '#ffffff',
            stroke: '#000000', strokeThickness: 5, align: 'center'
        }).setOrigin(0.5).setDepth(1001);
        
        this.tweens.add({
            targets: popup, y: y - 60, alpha: 0, scale: 1.2, duration: 1100,
            ease: 'Power2', onComplete: () => popup.destroy()
        });
    }
    
    // Intensity-only feedback (screen shake/flash) skips entirely when the player has asked
    // their OS/browser to reduce motion (window.SPIRITBALL_reducedMotion, set once at load
    // from prefers-reduced-motion - see release-prompts/12-*.md). This does not touch
    // essential input feedback like the flipper swing tween itself, only decorative camera
    // punch. Every previous direct `this.cameras.main.shake(...)`/`.flash(...)` call site in
    // this class now goes through these two helpers instead of calling the camera directly.
    cameraShake(duration, intensity) {
        if (window.SPIRITBALL_reducedMotion) return;
        if (this.cameras && this.cameras.main) {
            this.cameras.main.shake(duration, intensity);
        }
    }

    cameraFlash(...args) {
        if (window.SPIRITBALL_reducedMotion) return;
        if (this.cameras && this.cameras.main) {
            this.cameras.main.flash(...args);
        }
    }

    // Skips purely decorative, non-essential looping animation (idle glow/pulse/rotation)
    // under reduced motion, while essential feedback tweens (flipper swing, popups, plunger
    // charge visuals) are left as direct this.tweens.add(...) calls elsewhere and always run.
    addAmbientTween(config) {
        if (window.SPIRITBALL_reducedMotion) return null;
        return this.tweens.add(config);
    }

    isOnCooldown(object) {
        return this.collisionCooldowns.has(object);
    }
    
    setCooldown(object, duration) {
        this.collisionCooldowns.set(object, true);
        this.time.delayedCall(duration, () => {
            this.collisionCooldowns.delete(object);
        });
    }
    
    pauseGame() {
        this.gameState.isPaused = true;
        this.physics.pause();

        // Background overlay
        const bg = this.add.rectangle(CONFIG.width / 2, CONFIG.height / 2, CONFIG.width, CONFIG.height, 0x000000, 0.9).setDepth(2000);

        // Title
        const title = this.add.text(CONFIG.width / 2, CONFIG.height * 0.25, 'GAME PAUSED', {
            fontSize: '48px',
            fontFamily: 'Righteous, Monoton, Orbitron, Arial, sans-serif',
            fontStyle: 'bold',
            color: '#00ffff',
            stroke: '#003366',
            strokeThickness: 6,
            shadow: { offsetX: 3, offsetY: 3, color: '#000000', blur: 6, fill: true }
        }).setOrigin(0.5).setDepth(2001);

        // Menu buttons
        const buttonStyle = {
            fontSize: '28px',
            fontFamily: 'Righteous, Monoton, Orbitron, Arial, sans-serif',
            fontStyle: 'bold',
            color: '#ffffff',
            stroke: '#000000',
            strokeThickness: 4,
            backgroundColor: '#1a1a3e',
            padding: { left: 30, right: 30, top: 15, bottom: 15 }
        };

        const buttonHoverStyle = {
            color: '#00ffff',
            backgroundColor: '#2a2a5e'
        };

        // Resume button
        const resumeButton = this.add.text(CONFIG.width / 2, CONFIG.height * 0.45, '▶ RESUME GAME', buttonStyle)
            .setOrigin(0.5)
            .setDepth(2001)
            .setInteractive({ useHandCursor: true });

        const resumeBg = this.add.rectangle(CONFIG.width / 2, CONFIG.height * 0.45, resumeButton.width + 40, resumeButton.height + 20, 0x1a1a3e)
            .setDepth(2000)
            .setStrokeStyle(3, 0x00ffff);

        resumeButton.on('pointerover', () => {
            resumeButton.setColor('#00ffff');
            resumeBg.setFillStyle(0x2a2a5e);
        });

        resumeButton.on('pointerout', () => {
            resumeButton.setColor('#ffffff');
            resumeBg.setFillStyle(0x1a1a3e);
        });

        resumeButton.on('pointerdown', () => {
            this.resumeGame();
        });

        // New Game button
        const newGameButton = this.add.text(CONFIG.width / 2, CONFIG.height * 0.58, '🔄 NEW GAME', buttonStyle)
            .setOrigin(0.5)
            .setDepth(2001)
            .setInteractive({ useHandCursor: true });

        const newGameBg = this.add.rectangle(CONFIG.width / 2, CONFIG.height * 0.58, newGameButton.width + 40, newGameButton.height + 20, 0x1a1a3e)
            .setDepth(2000)
            .setStrokeStyle(3, 0x00ff00);

        newGameButton.on('pointerover', () => {
            newGameButton.setColor('#00ff00');
            newGameBg.setFillStyle(0x2a2a5e);
        });

        newGameButton.on('pointerout', () => {
            newGameButton.setColor('#ffffff');
            newGameBg.setFillStyle(0x1a1a3e);
        });

        newGameButton.on('pointerdown', () => {
            this.cleanupPauseMenu();
            this.scene.restart();
        });

        // Settings button
        const settingsButton = this.add.text(CONFIG.width / 2, CONFIG.height * 0.71, 'ℹ CONTROLS', buttonStyle)
            .setOrigin(0.5)
            .setDepth(2001)
            .setInteractive({ useHandCursor: true });

        const settingsBg = this.add.rectangle(CONFIG.width / 2, CONFIG.height * 0.71, settingsButton.width + 40, settingsButton.height + 20, 0x1a1a3e)
            .setDepth(2000)
            .setStrokeStyle(3, 0xffff00);

        settingsButton.on('pointerover', () => {
            settingsButton.setColor('#ffff00');
            settingsBg.setFillStyle(0x2a2a5e);
        });

        settingsButton.on('pointerout', () => {
            settingsButton.setColor('#ffffff');
            settingsBg.setFillStyle(0x1a1a3e);
        });

        settingsButton.on('pointerdown', () => {
            this.showSettingsMenu();
        });

        // Instructions
        const instructions = this.add.text(CONFIG.width / 2, CONFIG.height * 0.85, 'ESC or TAP RESUME to continue', {
            fontSize: '16px',
            fontFamily: 'Righteous, Monoton, Orbitron, Arial, sans-serif',
            color: '#888888',
            stroke: '#000000',
            strokeThickness: 2
        }).setOrigin(0.5).setDepth(2001);

        this.pauseOverlay = [bg, title, resumeButton, resumeBg, newGameButton, newGameBg, settingsButton, settingsBg, instructions];

        // ESC/SPACE-to-resume are handled by the single persistent listener registered once
        // in setupInput() - registering another once() listener here every time pauseGame()
        // runs used to leak a dangling listener whenever the player resumed by clicking
        // instead of pressing a key. See release-prompts/07-*.md.
    }

    resumeGame() {
        this.gameState.isPaused = false;
        this.physics.resume();
        this.cleanupPauseMenu();
    }

    cleanupPauseMenu() {
        if (this.pauseOverlay) {
            this.pauseOverlay.forEach(obj => {
                if (obj && obj.destroy) {
                    obj.destroy();
                }
            });
            this.pauseOverlay = null;
        }
        if (this.settingsOverlay) {
            this.settingsOverlay.forEach(obj => {
                if (obj && obj.destroy) {
                    obj.destroy();
                }
            });
            this.settingsOverlay = null;
        }
    }

    showSettingsMenu() {
        // Clean up pause menu
        if (this.pauseOverlay) {
            this.pauseOverlay.forEach(obj => {
                if (obj && obj.destroy) {
                    obj.destroy();
                }
            });
            this.pauseOverlay = null;
        }

        // Background overlay
        const bg = this.add.rectangle(CONFIG.width / 2, CONFIG.height / 2, CONFIG.width, CONFIG.height, 0x000000, 0.9).setDepth(2000);

        // Title. This screen used to be a Sound/Music Settings menu, but the game has no
        // audio system at all - those toggles wrote a localStorage flag nothing ever read,
        // which is misleading. Replaced with a real, working controls reference instead.
        // See release-prompts/04-*.md.
        const title = this.add.text(CONFIG.width / 2, CONFIG.height * 0.2, 'CONTROLS', {
            fontSize: '48px',
            fontFamily: 'Righteous, Monoton, Orbitron, Arial, sans-serif',
            fontStyle: 'bold',
            color: '#ffff00',
            stroke: '#666600',
            strokeThickness: 6,
            shadow: { offsetX: 3, offsetY: 3, color: '#000000', blur: 6, fill: true }
        }).setOrigin(0.5).setDepth(2001);

        const isMobileControls = window.gameInputManager && window.gameInputManager.isMobile;
        const controlRows = isMobileControls ? [
            ['◀ / ▶ BUTTONS', 'Left / Right Flippers'],
            ['⚡ BUTTON', 'Hold to Charge, Release to Launch'],
            ['⏸ BUTTON', 'Pause / Resume']
        ] : [
            ['LEFT / RIGHT ARROWS', 'Left / Right Flippers'],
            ['SPACE', 'Hold to Charge, Release to Launch'],
            ['ESC', 'Pause / Resume']
        ];

        const controlRowObjects = [];
        let controlRowY = CONFIG.height * 0.34;
        controlRows.forEach(([key, action]) => {
            const keyText = this.add.text(CONFIG.width / 2, controlRowY, key, {
                fontSize: '22px',
                fontFamily: 'Righteous, Monoton, Orbitron, Arial, sans-serif',
                fontStyle: 'bold',
                color: '#00ffff',
                stroke: '#000000',
                strokeThickness: 3
            }).setOrigin(0.5).setDepth(2001);

            const actionText = this.add.text(CONFIG.width / 2, controlRowY + 32, action, {
                fontSize: '17px',
                fontFamily: 'Righteous, Monoton, Orbitron, Arial, sans-serif',
                color: '#ffffff',
                stroke: '#000000',
                strokeThickness: 2
            }).setOrigin(0.5).setDepth(2001);

            controlRowObjects.push(keyText, actionText);
            controlRowY += 90;
        });

        // Back button
        const backButton = this.add.text(CONFIG.width / 2, CONFIG.height * 0.78, '◄ BACK', {
            fontSize: '28px',
            fontFamily: 'Righteous, Monoton, Orbitron, Arial, sans-serif',
            fontStyle: 'bold',
            color: '#ffffff',
            stroke: '#000000',
            strokeThickness: 4,
            backgroundColor: '#1a1a3e',
            padding: { left: 30, right: 30, top: 15, bottom: 15 }
        }).setOrigin(0.5).setDepth(2001).setInteractive({ useHandCursor: true });

        const backBg = this.add.rectangle(CONFIG.width / 2, CONFIG.height * 0.78, backButton.width + 40, backButton.height + 20, 0x1a1a3e)
            .setDepth(2000)
            .setStrokeStyle(3, 0x00ffff);

        backButton.on('pointerover', () => {
            backButton.setColor('#00ffff');
            backBg.setFillStyle(0x2a2a5e);
        });

        backButton.on('pointerout', () => {
            backButton.setColor('#ffffff');
            backBg.setFillStyle(0x1a1a3e);
        });

        backButton.on('pointerdown', () => {
            if (this.settingsOverlay) {
                this.settingsOverlay.forEach(obj => {
                    if (obj && obj.destroy) {
                        obj.destroy();
                    }
                });
                this.settingsOverlay = null;
            }
            this.pauseGame();
        });

        this.settingsOverlay = [bg, title, ...controlRowObjects, backButton, backBg];

        // ESC while in this submenu is handled by the single persistent listener in
        // setupInput(), which checks for an open settingsOverlay and backs out to the pause
        // menu instead of resuming - see release-prompts/07-*.md.
    }
    
    gameOver() {
        this.scene.start('GameOverScene', {
            score: this.gameState.score,
            highScore: this.gameState.highScore,
            rank: this.gameState.rank,
            statistics: this.gameState.statistics
        });
    }
}

class GameOverScene extends Phaser.Scene {
    constructor() { super({ key: 'GameOverScene' }); }
    
    init(data) {
        this.finalScore = data.score;
        this.highScore = data.highScore;
        this.rank = data.rank;
        this.statistics = data.statistics;
    }
    
    create() {
        this.cameras.main.setBackgroundColor(CONFIG.colors.background);
        
        this.add.text(CONFIG.width / 2, 120, 'GAME OVER', {
            fontSize: '64px', fontFamily: 'Righteous, Monoton, Orbitron, Arial, sans-serif', color: '#ff0099',
            stroke: '#000000', strokeThickness: 7
        }).setOrigin(0.5);

        this.add.text(CONFIG.width / 2, 230, 'FINAL SCORE', {
            fontSize: '26px', fontFamily: 'Righteous, Monoton, Orbitron, Arial, sans-serif', color: '#ffffff'
        }).setOrigin(0.5);

        this.add.text(CONFIG.width / 2, 280, `${this.finalScore}`, {
            fontSize: '54px', fontFamily: 'Righteous, Monoton, Orbitron, Arial, sans-serif', color: '#00ffff',
            stroke: '#000000', strokeThickness: 5
        }).setOrigin(0.5);

        if (this.finalScore >= this.highScore) {
            const newHigh = this.add.text(CONFIG.width / 2, 360, 'NEW HIGH SCORE!', {
                fontSize: '36px', fontFamily: 'Righteous, Monoton, Orbitron, Arial, sans-serif', color: '#ffff00',
                stroke: '#000000', strokeThickness: 5
            }).setOrigin(0.5);
            this.tweens.add({ targets: newHigh, scale: 1.12, duration: 600, yoyo: true, repeat: -1 });
        } else {
            this.add.text(CONFIG.width / 2, 360, `HIGH SCORE: ${this.highScore}`, {
                fontSize: '26px', fontFamily: 'Righteous, Monoton, Orbitron, Arial, sans-serif', color: '#ffff00'
            }).setOrigin(0.5);
        }

        // Show statistics that actually exist in the current mission/rank system
        // (previously this checked stats left over from an older chakra-based build that no
        // longer exist, so nothing ever displayed here - see release-prompts/06-*.md)
        let statsY = 450;

        const rankName = CONFIG.ranks[this.rank] || CONFIG.ranks[0];
        this.add.text(CONFIG.width / 2, statsY, `Final Rank: ${rankName}`, {
            fontSize: '20px', fontFamily: 'Righteous, Monoton, Orbitron, Arial, sans-serif', color: '#ffffff'
        }).setOrigin(0.5);
        statsY += 30;

        const statLines = [
            ['Missions Completed', this.statistics.missionsCompleted],
            ['Bumper Hits', this.statistics.totalBumperHits],
            ['Satellite Hits', this.statistics.totalSatelliteHits],
            ['Lane Hits', this.statistics.totalLaneHits]
        ];

        statLines.forEach(([label, value]) => {
            if (value > 0) {
                this.add.text(CONFIG.width / 2, statsY, `${label}: ${value}`, {
                    fontSize: '20px', fontFamily: 'Righteous, Monoton, Orbitron, Arial, sans-serif', color: '#ffffff'
                }).setOrigin(0.5);
                statsY += 30;
            }
        });

        const isMobile = window.gameInputManager && window.gameInputManager.isMobile;
        const playAgainText = isMobile ? 'TAP ⚡ TO PLAY AGAIN' : 'PRESS SPACE TO PLAY AGAIN';

        const playAgain = this.add.text(CONFIG.width / 2, CONFIG.height - 120, playAgainText, {
            fontSize: '28px', fontFamily: 'Righteous, Monoton, Orbitron, Arial, sans-serif', color: '#00ffff',
            stroke: '#000000', strokeThickness: 4
        }).setOrigin(0.5);

        this.tweens.add({ targets: playAgain, alpha: 0.35, duration: 900, yoyo: true, repeat: -1 });

        this.input.keyboard.on('keydown-SPACE', () => this.restartGame());

        // Mobile touch support - tap anywhere to restart
        if (isMobile) {
            this.input.once('pointerdown', () => this.restartGame());
        }

        this.launchTimer = this.time.addEvent({
            delay: 100,
            callback: () => {
                if (window.gameInputManager && window.gameInputManager.state.launchReleased) {
                    this.restartGame();
                    window.gameInputManager.state.launchReleased = false;
                }
            },
            loop: true
        });
    }

    restartGame() {
        if (this.launchTimer) this.launchTimer.remove();
        this.scene.start('GameScene');
    }

    shutdown() {
        // Clean up launch timer
        if (this.launchTimer) {
            this.launchTimer.remove();
            this.launchTimer = null;
        }

        // Remove all input listeners
        this.input.keyboard.removeAllListeners();
    }
}

const gameConfig = {
    type: Phaser.AUTO,
    parent: 'game-container',
    width: CONFIG.width,
    height: CONFIG.height,
    backgroundColor: CONFIG.colors.background,
    physics: {
        default: 'arcade',
        arcade: { gravity: { y: CONFIG.gravity }, debug: false }
    },
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        width: CONFIG.width,
        height: CONFIG.height,
        min: {
            width: 270,
            height: 480
        },
        max: {
            width: 1080,
            height: 1920
        },
        autoRound: true
    },
    scene: [BootScene, MenuScene, GameScene, GameOverScene],
    render: {
        antialias: true,
        pixelArt: false,
        roundPixels: true
    }
};

// Read once at load: honors the OS/browser "reduce motion" accessibility preference for
// decorative, non-essential canvas animation and camera punch (screen shake/flash). See
// release-prompts/12-*.md. The CSS prefers-reduced-motion rule in styles.css only affects DOM
// elements, not Phaser's on-canvas tweens/camera effects, so this flag is what those check.
window.SPIRITBALL_reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

window.performanceManager = new PerformanceManager();
window.gameInputManager = new InputManager();

window.addEventListener('load', () => {
    window.game = new Phaser.Game(gameConfig);
    document.addEventListener('contextmenu', e => e.preventDefault());

    // Log performance tier for debugging
    console.log(`Performance tier: ${window.performanceManager.deviceTier}`);
});
