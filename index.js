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
    gravity: 1400,
    ballRadius: 20,
    ballBounce: 0.75,
    startingLives: 3,
    startingBalls: 3,

    // XP Pinball Game Elements
    attackBumperCount: 4,
    missionTargetCount: 3,
    fuelLightCount: 6,
    reentryLaneCount: 3,

    plungerMaxPower: 1200,
    plungerMinPower: 400,
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
            { id: 12, name: 'Cosmic Plague', description: 'Achieve 75 flag rotations', requirement: 75, type: 'flags' },
            { id: 13, name: 'Black Hole', description: 'Hit Satellite 5 times', requirement: 5, type: 'satellite' },
            { id: 14, name: 'Space Radiation', description: 'Survive 30 seconds', requirement: 30, type: 'time' }
        ],
        5: [ // Commander - uses higher rank missions
            { id: 12, name: 'Cosmic Plague', description: 'Achieve 100 flag rotations', requirement: 100, type: 'flags' },
            { id: 13, name: 'Black Hole', description: 'Hit Satellite 7 times', requirement: 7, type: 'satellite' },
            { id: 15, name: 'Bug Hunt', description: 'Hit all bumpers 30 times', requirement: 30, type: 'bumper' }
        ],
        6: [ // Commodore
            { id: 12, name: 'Cosmic Plague', description: 'Achieve 150 flag rotations', requirement: 150, type: 'flags' },
            { id: 16, name: 'Stray Comet', description: 'Score 500,000 points', requirement: 500000, type: 'score' },
            { id: 13, name: 'Black Hole', description: 'Hit Satellite 10 times', requirement: 10, type: 'satellite' }
        ],
        7: [ // Admiral
            { id: 12, name: 'Cosmic Plague', description: 'Achieve 200 flag rotations', requirement: 200, type: 'flags' },
            { id: 16, name: 'Stray Comet', description: 'Score 1,000,000 points', requirement: 1000000, type: 'score' },
            { id: 13, name: 'Black Hole', description: 'Hit Satellite 15 times', requirement: 15, type: 'satellite' }
        ],
        8: [ // Fleet Admiral
            { id: 12, name: 'Cosmic Plague', description: 'Achieve 300 flag rotations', requirement: 300, type: 'flags' },
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
        this.isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || (window.innerWidth <= 768);
        this.setupMobileControls();
    }

    setupMobileControls() {
        const leftBtn = document.getElementById('left-flipper-btn');
        if (leftBtn) {
            leftBtn.addEventListener('touchstart', (e) => { e.preventDefault(); this.state.leftFlipper = true; }, { passive: false });
            leftBtn.addEventListener('touchend', (e) => { e.preventDefault(); this.state.leftFlipper = false; }, { passive: false });
        }

        const rightBtn = document.getElementById('right-flipper-btn');
        if (rightBtn) {
            rightBtn.addEventListener('touchstart', (e) => { e.preventDefault(); this.state.rightFlipper = true; }, { passive: false });
            rightBtn.addEventListener('touchend', (e) => { e.preventDefault(); this.state.rightFlipper = false; }, { passive: false });
        }

        const launchBtn = document.getElementById('launch-btn');
        if (launchBtn) {
            launchBtn.addEventListener('touchstart', (e) => {
                e.preventDefault();
                this.state.launchHeld = true;
                this.state.launchPressed = true;
            }, { passive: false });

            launchBtn.addEventListener('touchend', (e) => {
                e.preventDefault();
                this.state.launchHeld = false;
                this.state.launchReleased = true;
                setTimeout(() => this.state.launchReleased = false, 50);
            }, { passive: false });
        }

        const pauseBtn = document.getElementById('pause-btn');
        if (pauseBtn) {
            pauseBtn.addEventListener('touchstart', (e) => {
                e.preventDefault();
                this.state.pause = true;
                setTimeout(() => this.state.pause = false, 150);
            }, { passive: false });
        }
    }
}

class BootScene extends Phaser.Scene {
    constructor() { super({ key: 'BootScene' }); }
    
    preload() {
        this.add.text(CONFIG.width / 2, CONFIG.height / 2, 'SPIRITBALL\nLOADING...', {
            fontSize: '36px', fontFamily: 'Arial', color: '#00ffff',
            stroke: '#ff00ff', strokeThickness: 5, align: 'center'
        }).setOrigin(0.5);

        // Load background image
        this.load.image('background', 'background.png');

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

        // Create cosmic crystal bumper texture (triangular crystal)
        graphics.fillStyle(0x00ffff, 0.9);
        graphics.beginPath();
        graphics.moveTo(25, 5);
        graphics.lineTo(45, 40);
        graphics.lineTo(5, 40);
        graphics.closePath();
        graphics.fillPath();

        // Crystal facets
        graphics.lineStyle(2, 0xffffff, 0.8);
        graphics.lineBetween(25, 5, 25, 40);
        graphics.lineBetween(15, 22, 35, 22);

        // Outer glow
        graphics.lineStyle(3, 0x00ffff, 0.6);
        graphics.strokePath();

        // Inner glow
        graphics.fillStyle(0xffffff, 0.6);
        graphics.fillCircle(25, 20, 5);

        graphics.generateTexture('cosmic-crystal', 50, 45);
        graphics.clear();

        // Create asteroid texture (rocky space object)
        graphics.fillStyle(0x8B4513, 1);
        graphics.fillCircle(20, 20, 18);

        // Crater details
        graphics.fillStyle(0x654321, 0.7);
        graphics.fillCircle(14, 12, 4);
        graphics.fillCircle(28, 18, 3);
        graphics.fillCircle(18, 28, 5);

        // Rocky texture
        graphics.fillStyle(0x4a2f1a, 0.5);
        graphics.fillCircle(10, 20, 2);
        graphics.fillCircle(26, 26, 2);
        graphics.fillCircle(15, 30, 2);

        // Highlight
        graphics.fillStyle(0xD2691E, 0.6);
        graphics.fillCircle(16, 14, 3);

        // Outline
        graphics.lineStyle(2, 0x654321, 0.8);
        graphics.strokeCircle(20, 20, 18);

        graphics.generateTexture('asteroid', 40, 40);
        graphics.clear();

        // Create energy vortex portal texture (small portal)
        // Outer ring
        graphics.lineStyle(4, 0xff00ff, 0.9);
        graphics.strokeCircle(20, 20, 16);
        graphics.lineStyle(3, 0x00ffff, 0.8);
        graphics.strokeCircle(20, 20, 14);

        // Inner swirl
        graphics.fillStyle(0x4B0082, 0.7);
        graphics.fillCircle(20, 20, 12);

        // Energy particles
        graphics.fillStyle(0xff00ff, 0.9);
        graphics.fillCircle(20, 8, 2);
        graphics.fillCircle(32, 20, 2);
        graphics.fillCircle(20, 32, 2);
        graphics.fillCircle(8, 20, 2);

        // Center glow
        graphics.fillStyle(0xffffff, 0.8);
        graphics.fillCircle(20, 20, 4);

        graphics.generateTexture('energy-vortex', 40, 40);
        graphics.clear();

        // Create comet/shooting star obstacle
        // Comet head
        graphics.fillGradientStyle(0xffffff, 0xffffff, 0xffff00, 0xff8800, 1, 1, 0.9, 0.7);
        graphics.fillCircle(35, 15, 12);

        // Comet tail
        graphics.fillGradientStyle(0xff8800, 0xff4400, 0xff0000, 0x000000, 0.8, 0.6, 0.4, 0);
        graphics.fillTriangle(35, 15, 5, 5, 5, 25);

        // Glow effect
        graphics.fillStyle(0xffffff, 0.6);
        graphics.fillCircle(35, 15, 6);

        // Sparkles
        graphics.fillStyle(0xffff00, 0.8);
        graphics.fillCircle(25, 10, 2);
        graphics.fillCircle(28, 18, 2);
        graphics.fillCircle(20, 15, 2);

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
            fontSize: '72px', fontFamily: 'Arial', color: '#00ffff',
            stroke: '#ff00ff', strokeThickness: 8
        }).setOrigin(0.5);

        this.tweens.add({
            targets: title, scale: 1.05, duration: 1200,
            yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
        });

        this.add.text(CONFIG.width / 2, CONFIG.height * 0.35, 'DMT Vision Quest Pinball', {
            fontSize: '22px', fontFamily: 'Arial', color: '#ffffff', alpha: 0.9
        }).setOrigin(0.5);

        const highScore = localStorage.getItem('spiritball-highscore') || 0;
        this.add.text(CONFIG.width / 2, CONFIG.height * 0.48, `HIGH SCORE: ${highScore}`, {
            fontSize: '28px', fontFamily: 'Arial', color: '#ffff00',
            stroke: '#000000', strokeThickness: 4
        }).setOrigin(0.5);

        const isMobile = window.gameInputManager && window.gameInputManager.isMobile;
        const startText = isMobile ? 'TAP ⚡ TO START' : 'PRESS SPACE TO START';

        const startInstructions = this.add.text(CONFIG.width / 2, CONFIG.height * 0.65, startText, {
            fontSize: '36px', fontFamily: 'Arial', color: '#00ff99',
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
            plungerChargeStart: 0,

            // XP Pinball: Rank System
            rank: 0, // Current rank index (0 = Cadet, 8 = Fleet Admiral)
            rankProgress: 0, // Missions completed towards next rank
            rankProgressRequired: 3, // Missions needed to rank up

            // XP Pinball: Mission System
            activeMission: null, // Currently active mission object
            selectedMission: 0, // Selected mission index (0-2)
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

            // XP Pinball: Flags (for flag rotation missions)
            flagRotations: 0,

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
        this.setupObstacles(); // Attack bumpers + other obstacles
        this.setupReentryLanes(); // Re-entry lanes, launch ramp, bonus lane
        this.setupFlippers();
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
    }
    
    setupTable() {
        // Solid left wall - wider for reliable collision
        const leftWall = this.add.rectangle(15, CONFIG.height / 2, 30, CONFIG.height, CONFIG.colors.wall);
        this.physics.add.existing(leftWall, true);
        leftWall.body.immovable = true;

        // Solid right wall - wider for reliable collision
        const rightWall = this.add.rectangle(CONFIG.width - 15, CONFIG.height / 2, 30, CONFIG.height, CONFIG.colors.wall);
        this.physics.add.existing(rightWall, true);
        rightWall.body.immovable = true;

        // Solid top wall - thicker for reliable collision
        const topWall = this.add.rectangle(CONFIG.width / 2, 15, CONFIG.width, 30, CONFIG.colors.wall);
        this.physics.add.existing(topWall, true);
        topWall.body.immovable = true;

        // Angled walls for pinball feel - thicker for better collision
        const leftAngle = this.add.rectangle(80, CONFIG.height - 150, 150, 25, CONFIG.colors.wall);
        leftAngle.setRotation(-0.3);
        this.physics.add.existing(leftAngle, true);
        leftAngle.body.immovable = true;

        const rightAngle = this.add.rectangle(CONFIG.width - 80, CONFIG.height - 150, 150, 25, CONFIG.colors.wall);
        rightAngle.setRotation(0.3);
        this.physics.add.existing(rightAngle, true);
        rightAngle.body.immovable = true;

        this.walls = [leftWall, rightWall, topWall, leftAngle, rightAngle];
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
        this.ball.body.setMaxVelocity(1800, 1800); // Prevent extreme speeds that cause tunneling
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

            // Add rotation animation
            this.tweens.add({
                targets: target,
                angle: 360,
                duration: 2500 + (i * 300),
                repeat: -1,
                ease: 'Linear'
            });

            // Add pulsing glow
            this.tweens.add({
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

            // Add rotation animation
            this.tweens.add({
                targets: fuel,
                angle: 360,
                duration: 3000 + (i * 200),
                repeat: -1,
                ease: 'Linear'
            });

            // Add pulsing glow
            this.tweens.add({
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
        // Position Saturn at top center - lowered for better gameplay
        this.saturn = this.add.sprite(CONFIG.width / 2, 180, 'saturn');
        this.saturn.setScale(0.85);
        this.saturn.setDepth(50);
        this.physics.add.existing(this.saturn, true);
        this.saturn.body.setCircle(35);

        // Saturn ring
        this.saturnRing = this.add.sprite(CONFIG.width / 2, 180, 'saturn-ring');
        this.saturnRing.setScale(0.85);
        this.saturnRing.setDepth(49);
        this.saturnRing.setAlpha(0.8);

        // Rotation animation for ring
        this.tweens.add({
            targets: this.saturnRing,
            angle: 360,
            duration: 4000,
            repeat: -1,
            ease: 'Linear'
        });

        // Pulsing effect for Saturn
        this.tweens.add({
            targets: this.saturn,
            scale: 0.9,
            duration: 2000,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
        });

        // Black hexagon vortex (hidden initially) - positioned at Saturn's north pole
        this.saturnHexagon = this.add.sprite(CONFIG.width / 2, 140, 'hexagon');
        this.saturnHexagon.setScale(0.6);
        this.saturnHexagon.setDepth(51);
        this.saturnHexagon.setVisible(false);
        this.physics.add.existing(this.saturnHexagon, true);
        this.saturnHexagon.body.setCircle(25);
    }

    setupObstacles() {
        this.obstacles = [];
        this.attackBumpers = [];

        // XP Pinball: Attack Bumpers (4 bumpers at top) - using cosmic crystals and asteroids
        const bumperY = 240;
        const bumperSpacing = 120;
        const bumperStartX = 120;

        // Attack Bumper 1
        const bumper1 = this.add.sprite(bumperStartX, bumperY, 'cosmic-crystal');
        bumper1.setScale(0.9);
        bumper1.setDepth(50);
        bumper1.setTint(CONFIG.colors.bumper1);
        this.physics.add.existing(bumper1, true);
        bumper1.body.setCircle(22);
        bumper1.isAttackBumper = true;

        // Attack Bumper 2
        const bumper2 = this.add.sprite(bumperStartX + bumperSpacing, bumperY, 'asteroid');
        bumper2.setScale(0.9);
        bumper2.setDepth(50);
        bumper2.setTint(CONFIG.colors.bumper2);
        this.physics.add.existing(bumper2, true);
        bumper2.body.setCircle(22);
        bumper2.isAttackBumper = true;

        // Attack Bumper 3
        const bumper3 = this.add.sprite(bumperStartX + bumperSpacing * 2, bumperY, 'cosmic-crystal');
        bumper3.setScale(0.9);
        bumper3.setDepth(50);
        bumper3.setTint(CONFIG.colors.bumper3);
        this.physics.add.existing(bumper3, true);
        bumper3.body.setCircle(22);
        bumper3.isAttackBumper = true;

        // Attack Bumper 4
        const bumper4 = this.add.sprite(bumperStartX + bumperSpacing * 3, bumperY, 'asteroid');
        bumper4.setScale(0.9);
        bumper4.setDepth(50);
        bumper4.setTint(CONFIG.colors.bumper4);
        this.physics.add.existing(bumper4, true);
        bumper4.body.setCircle(22);
        bumper4.isAttackBumper = true;

        this.attackBumpers = [bumper1, bumper2, bumper3, bumper4];

        // Pulsing animation for attack bumpers
        this.tweens.add({
            targets: this.attackBumpers,
            scale: 1.0,
            alpha: 0.95,
            duration: 800,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
        });

        // Other obstacles (not attack bumpers) - positioned elsewhere
        const vortex1 = this.add.sprite(180, 450, 'energy-vortex');
        vortex1.setScale(0.7);
        vortex1.setDepth(50);
        this.physics.add.existing(vortex1, true);
        vortex1.body.setCircle(14);

        const vortex2 = this.add.sprite(CONFIG.width - 180, 520, 'energy-vortex');
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

        // Comets - shooting star obstacles
        const comet1 = this.add.sprite(250, 600, 'comet');
        comet1.setScale(0.6);
        comet1.setDepth(50);
        comet1.setAngle(45);
        this.physics.add.existing(comet1, true);
        comet1.body.setCircle(10);

        const comet2 = this.add.sprite(CONFIG.width - 250, 680, 'comet');
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
        // XP Pinball: Re-entry lanes at top (3 lanes)
        this.reentryLaneZones = [];
        const laneWidth = 60;
        const laneHeight = 40;
        const laneY = 50;
        const laneSpacing = (CONFIG.width - 100) / 3;

        for (let i = 0; i < CONFIG.reentryLaneCount; i++) {
            const laneX = 50 + (i * laneSpacing) + (laneSpacing / 2);
            const laneZone = this.add.rectangle(laneX, laneY, laneWidth, laneHeight, 0x00FF00, 0.3);
            laneZone.setDepth(40);
            this.physics.add.existing(laneZone, true);
            laneZone.laneIndex = i;
            laneZone.isReentryLane = true;
            this.reentryLaneZones.push(laneZone);
        }

        // Launch ramp zone (right side, going up)
        this.launchRampZone = this.add.rectangle(CONFIG.width - 70, 300, 80, 200, 0xFFFF00, 0.2);
        this.launchRampZone.setDepth(40);
        this.physics.add.existing(this.launchRampZone, true);
        this.launchRampZone.isLaunchRamp = true;

        // Bonus lane (left side)
        this.bonusLaneZone = this.add.rectangle(50, CONFIG.height - 200, 60, 100, 0xFF00FF, 0.2);
        this.bonusLaneZone.setDepth(40);
        this.physics.add.existing(this.bonusLaneZone, true);
        this.bonusLaneZone.isBonusLane = true;
    }

    setupFlippers() {
        const flipperWidth = 110; // Increased from 80 for longer flippers
        const flipperHeight = 16;
        const flipperY = CONFIG.height - 100;

        // Left cosmic energy wing flipper - closer to center and angled down at 45 degrees
        this.leftFlipper = this.add.sprite(100, flipperY, 'flipper-left');
        this.physics.add.existing(this.leftFlipper, true);
        this.leftFlipper.body.setSize(flipperWidth, flipperHeight);
        this.leftFlipper.setDepth(99);
        this.leftFlipper.setAngle(45); // Resting position at 45 degrees facing down

        // Add glow effect to left flipper
        this.tweens.add({
            targets: this.leftFlipper,
            alpha: 0.85,
            duration: 800,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
        });

        // Right cosmic energy wing flipper - closer to center and angled down at 45 degrees
        this.rightFlipper = this.add.sprite(CONFIG.width - 100, flipperY, 'flipper-right');
        this.physics.add.existing(this.rightFlipper, true);
        this.rightFlipper.body.setSize(flipperWidth, flipperHeight);
        this.rightFlipper.setDepth(99);
        this.rightFlipper.setAngle(-45); // Resting position at -45 degrees facing down

        // Add glow effect to right flipper
        this.tweens.add({
            targets: this.rightFlipper,
            alpha: 0.85,
            duration: 800,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
        });
    }

    setupPlunger() {
        // Launch port/channel on the right side
        this.launchPort = this.add.rectangle(CONFIG.width - 45, CONFIG.height - 300, 50, 250, 0x2a1a4a, 0.8);
        this.launchPort.setDepth(10);

        // Plunger sprite
        this.plunger = this.add.sprite(CONFIG.width - 45, CONFIG.height - 200, 'plunger');
        this.plunger.setScale(0.6);
        this.plunger.setDepth(95);

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
            fontFamily: 'Arial',
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
                        this.cameras.main.shake(40, 0.003);
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
            scoreLabel: this.add.text(20, 10, 'SCORE', {
                fontSize: '14px',
                fontFamily: 'Impact, Arial',
                color: '#9400D3',
                stroke: '#000000',
                strokeThickness: 2
            }).setDepth(1001),

            scoreText: this.add.text(20, 28, '0', {
                fontSize: '24px',
                fontFamily: 'Impact, Arial',
                color: '#00ffff',
                stroke: '#000000',
                strokeThickness: 3
            }).setDepth(1001),

            highScoreLabel: this.add.text(CONFIG.width / 2, 10, 'HIGH', {
                fontSize: '14px',
                fontFamily: 'Impact, Arial',
                color: '#9400D3',
                stroke: '#000000',
                strokeThickness: 2
            }).setOrigin(0.5, 0).setDepth(1001),

            highScoreText: this.add.text(CONFIG.width / 2, 28, `${this.gameState.highScore}`, {
                fontSize: '24px',
                fontFamily: 'Impact, Arial',
                color: '#ffff00',
                stroke: '#000000',
                strokeThickness: 3
            }).setOrigin(0.5, 0).setDepth(1001),

            livesLabel: this.add.text(CONFIG.width - 20, 10, 'BALLS', {
                fontSize: '14px',
                fontFamily: 'Impact, Arial',
                color: '#9400D3',
                stroke: '#000000',
                strokeThickness: 2
            }).setOrigin(1, 0).setDepth(1001),

            livesText: this.add.text(CONFIG.width - 20, 28, `${this.gameState.lives}`, {
                fontSize: '24px',
                fontFamily: 'Impact, Arial',
                color: '#ff0099',
                stroke: '#000000',
                strokeThickness: 3
            }).setOrigin(1, 0).setDepth(1001),

            // Second Row: Rank, Mission, Multiplier
            rankLabel: this.add.text(20, 60, 'RANK', {
                fontSize: '12px',
                fontFamily: 'Arial',
                color: '#00ffff',
                stroke: '#000000',
                strokeThickness: 2
            }).setDepth(1001),

            rankText: this.add.text(20, 75, CONFIG.ranks[0], {
                fontSize: '18px',
                fontFamily: 'Impact, Arial',
                color: '#00ff00',
                stroke: '#000000',
                strokeThickness: 2
            }).setDepth(1001),

            missionLabel: this.add.text(CONFIG.width / 2, 60, 'MISSION', {
                fontSize: '12px',
                fontFamily: 'Arial',
                color: '#00ffff',
                stroke: '#000000',
                strokeThickness: 2
            }).setOrigin(0.5, 0).setDepth(1001),

            missionText: this.add.text(CONFIG.width / 2, 75, 'Select Mission', {
                fontSize: '16px',
                fontFamily: 'Arial',
                color: '#ffff00',
                stroke: '#000000',
                strokeThickness: 2
            }).setOrigin(0.5, 0).setDepth(1001),

            multiplierLabel: this.add.text(CONFIG.width - 20, 60, 'MULT', {
                fontSize: '12px',
                fontFamily: 'Arial',
                color: '#00ffff',
                stroke: '#000000',
                strokeThickness: 2
            }).setOrigin(1, 0).setDepth(1001),

            multiplierText: this.add.text(CONFIG.width - 20, 75, '1x', {
                fontSize: '20px',
                fontFamily: 'Impact, Arial',
                color: '#ff00ff',
                stroke: '#000000',
                strokeThickness: 2
            }).setOrigin(1, 0).setDepth(1001),

            // Third Row: Fuel indicator
            fuelLabel: this.add.text(20, 100, 'FUEL', {
                fontSize: '12px',
                fontFamily: 'Arial',
                color: '#00ffff',
                stroke: '#000000',
                strokeThickness: 2
            }).setDepth(1001),

            // Popup messages
            comboText: this.add.text(CONFIG.width / 2, 130, '', {
                fontSize: '20px',
                fontFamily: 'Impact, Arial',
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
        this.input.keyboard.on('keydown-SPACE', () => this.handleLaunchPress());
        this.input.keyboard.on('keyup-SPACE', () => this.handleLaunchRelease());
        this.input.keyboard.on('keydown-ESC', () => this.handlePause());

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
        this.updatePlunger();
        this.checkDrain();

        // XP Pinball: Update mission fuel depletion
        if (this.gameState.missionActive) {
            this.depleteFuel();

            // Check time-based missions
            if (this.gameState.activeMission && this.gameState.activeMission.type === 'time') {
                this.checkMissionComplete();
            }
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

        // Clear all timers
        if (this.quickTapTimer) {
            this.quickTapTimer.remove();
            this.quickTapTimer = null;
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
        // Handle mobile input
        if (window.gameInputManager) {
            if (window.gameInputManager.state.leftFlipper) {
                this.activateLeftFlipper();
            } else {
                this.deactivateLeftFlipper();
            }

            if (window.gameInputManager.state.rightFlipper) {
                this.activateRightFlipper();
            } else {
                this.deactivateRightFlipper();
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

    updatePlunger() {
        if (this.gameState.plungerCharging) {
            const now = Date.now();
            const elapsed = now - this.gameState.plungerChargeStart;
            const chargePercent = Math.min(elapsed / CONFIG.plungerChargeTime, 1);

            // Update plunger power
            this.gameState.plungerPower = CONFIG.plungerMinPower + (CONFIG.plungerMaxPower - CONFIG.plungerMinPower) * chargePercent;

            // Update power meter visual
            const meterHeight = 92 * chargePercent;
            this.powerMeter.setDisplaySize(16, meterHeight);

            // Change color based on charge level
            if (chargePercent < 0.33) {
                this.powerMeter.setFillStyle(0xff0000);
            } else if (chargePercent < 0.66) {
                this.powerMeter.setFillStyle(0xffff00);
            } else {
                this.powerMeter.setFillStyle(0x00ff00);
            }

            // Update charge text
            this.chargeText.setText(`${Math.floor(chargePercent * 100)}%`);
            this.chargeText.setAlpha(1);

            // Pull plunger back visually
            this.plunger.y = CONFIG.height - 200 + (chargePercent * 30);
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
                angle: -20, // Swing up from 45 degree resting position
                duration: 8, // Lightning-fast response - instant feel
                ease: 'Cubic.easeOut' // Snappier easing for instant response
            });
        }

        // ENHANCED ball collision with professional pinball physics
        if (this.physics.overlap(this.ball, this.leftFlipper) && this.ball.body && !this.leftFlipperCooldown) {
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

            // Intense visual feedback for satisfying feel
            if (this.cameras && this.cameras.main) {
                this.cameras.main.shake(150, 0.008);
            }

            // Minimal cooldown for maximum responsiveness - real pinball feel
            this.time.delayedCall(25, () => {
                this.leftFlipperCooldown = false;
            });
        }
    }

    deactivateLeftFlipper() {
        this.leftFlipperActive = false;
        this.tweens.add({
            targets: this.leftFlipper,
            angle: 45, // Return to 45 degree resting position
            duration: 35, // Instant snap-back like real pinball
            ease: 'Cubic.easeIn'
        });
    }

    activateRightFlipper() {
        if (!this.rightFlipperActive) {
            this.rightFlipperActive = true;
            this.tweens.add({
                targets: this.rightFlipper,
                angle: 20, // Swing up from -45 degree resting position
                duration: 8, // Lightning-fast response - instant feel
                ease: 'Cubic.easeOut' // Snappier easing for instant response
            });
        }

        // ENHANCED ball collision with professional pinball physics
        if (this.physics.overlap(this.ball, this.rightFlipper) && this.ball.body && !this.rightFlipperCooldown) {
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

            // Intense visual feedback for satisfying feel
            if (this.cameras && this.cameras.main) {
                this.cameras.main.shake(150, 0.008);
            }

            // Minimal cooldown for maximum responsiveness - real pinball feel
            this.time.delayedCall(25, () => {
                this.rightFlipperCooldown = false;
            });
        }
    }

    deactivateRightFlipper() {
        this.rightFlipperActive = false;
        this.tweens.add({
            targets: this.rightFlipper,
            angle: -45, // Return to -45 degree resting position
            duration: 35, // Instant snap-back like real pinball
            ease: 'Cubic.easeIn'
        });
    }

    handleLaunchPress() {
        // Start charging the plunger if ball is ready to launch
        if (this.gameState.canLaunch && !this.gameState.ballInPlay) {
            this.gameState.plungerCharging = true;
            this.gameState.plungerChargeStart = Date.now();
            this.gameState.plungerPower = CONFIG.plungerMinPower;

            // Track that we started charging for this launch attempt
            this.launchAttemptStarted = true;

            // Auto-launch with minimum power if held less than 100ms (quick tap)
            this.quickTapTimer = this.time.delayedCall(100, () => {
                this.quickTapTimer = null;
            });
        }
    }

    handleLaunchRelease() {
        // ULTIMATE FIX: Always try to launch if ball is ready, regardless of charging state
        // This ensures desktop space press works reliably after death
        if (this.gameState.canLaunch && !this.gameState.ballInPlay) {

            // If plunger was charging, use the charged power
            if (this.gameState.plungerCharging) {
                // Quick tap detection - launch with medium power for quick press
                if (this.quickTapTimer) {
                    this.quickTapTimer.remove();
                    this.quickTapTimer = null;
                    this.gameState.plungerPower = CONFIG.plungerMinPower + (CONFIG.plungerMaxPower - CONFIG.plungerMinPower) * 0.6;
                }
            } else {
                // Fallback: if not charging but ball is ready, launch with good default power
                // This is the critical fix for desktop launch after death
                this.gameState.plungerPower = CONFIG.plungerMinPower + (CONFIG.plungerMaxPower - CONFIG.plungerMinPower) * 0.65;
            }

            // Always launch the ball
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
        this.launchAttemptStarted = false;

        // Clear any timers
        if (this.quickTapTimer) {
            this.quickTapTimer.remove();
            this.quickTapTimer = null;
        }

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
        this.cameras.main.shake(60, 0.002);

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
            fuel.setAlpha(1);
            fuel.setTint(CONFIG.colors.fuelFull);

            this.addScore(CONFIG.scores.fuelTarget);
            this.cameras.main.shake(50, 0.002);
            this.showPopup('+FUEL', fuel.x, fuel.y - 40, 18);
            this.updateHUD();
        }
    }

    hitAttackBumper(bumper) {
        // XP Pinball attack bumper behavior
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

        // Bounce ball away
        if (this.ball.body) {
            const angle = Math.atan2(
                this.ball.y - bumper.y,
                this.ball.x - bumper.x
            );
            this.ball.body.setVelocity(
                Math.cos(angle) * 700,
                Math.sin(angle) * 700
            );
        }

        this.cameras.main.shake(100, 0.004);
        this.tweens.add({
            targets: bumper,
            scale: 1.1,
            duration: 80,
            yoyo: true
        });

        this.showPopup(`+${baseScore}`, bumper.x, bumper.y - 40, 20);
        this.updateHUD();
    }

    hitSatellite() {
        // XP Pinball satellite (Saturn) behavior
        this.gameState.satelliteHits++;
        this.gameState.statistics.totalSatelliteHits++;

        this.addScore(CONFIG.scores.satellite);
        this.cameras.main.shake(120, 0.005);

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
            targets: [this.saturn, this.saturnRing],
            scale: 1.0,
            duration: 100,
            yoyo: true
        });

        this.showPopup('SATELLITE!', this.saturn.x, this.saturn.y - 60, 22);
        this.updateHUD();
    }

    hitReentryLane(lane) {
        // XP Pinball re-entry lane behavior
        const laneIndex = lane.laneIndex;
        this.gameState.reentryLanes[laneIndex] = true;
        this.gameState.allLaneHits++;

        this.addScore(CONFIG.scores.reentryLane);
        this.cameras.main.shake(80, 0.003);

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
        this.cameras.main.shake(90, 0.003);

        // Start mission if one is selected
        if (!this.gameState.missionActive && this.gameState.selectedMission !== null) {
            this.startMission();
        } else if (this.gameState.missionActive && this.gameState.activeMission) {
            // Count towards ramp missions
            if (this.gameState.activeMission.type === 'ramp') {
                this.gameState.missionProgress++;
                this.checkMissionComplete();
            }
        }

        this.showPopup('LAUNCH RAMP!', this.launchRampZone.x, this.launchRampZone.y - 40, 20);
        this.updateHUD();
    }

    hitBonusLane() {
        // XP Pinball bonus lane - big points
        this.addScore(CONFIG.scores.bonusLane);
        this.cameras.main.shake(150, 0.006);
        this.cameras.main.flash(300);

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
        this.cameras.main.shake(60, 0.002);
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

        this.cameras.main.shake(150, 0.006);
        this.cameras.main.flash(400);
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
            case 'flags':
                isComplete = this.gameState.flagRotations >= mission.requirement;
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
        this.cameras.main.shake(250, 0.008);
        this.cameras.main.flash(600);
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

            this.cameras.main.shake(400, 0.01);
            this.cameras.main.flash(1000);
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

            // Update fuel light visuals
            if (this.gameState.fuel >= 0 && this.gameState.fuel < this.fuelLights.length) {
                this.fuelLights[this.gameState.fuel].setAlpha(0.3);
                this.fuelLights[this.gameState.fuel].setTint(CONFIG.colors.fuelLow);
            }

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
        this.cameras.main.shake(120, 0.004);

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
            fontFamily: 'Arial',
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
            this.cameras.main.shake(400, 0.008);
            this.cameras.main.flash(200, 255, 0, 0, true);
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

        if (this.collisionCooldowns) {
            this.collisionCooldowns.clear();
        }

        // Reset input tracking to ensure clean state for next launch
        this.previousSpaceDown = false;
        this.launchAttemptStarted = false;

        // Clear any existing quick tap timer
        if (this.quickTapTimer) {
            this.quickTapTimer.remove();
            this.quickTapTimer = null;
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

        // Use plunger power to determine velocity
        const power = this.gameState.plungerPower;
        const velocityY = -power;
        const velocityX = -250;

        this.ball.body.setVelocity(velocityX, velocityY);

        // Shake intensity based on power - with safety check
        if (this.cameras && this.cameras.main) {
            const shakeIntensity = 0.002 + (power / CONFIG.plungerMaxPower) * 0.005;
            this.cameras.main.shake(150, shakeIntensity);
        }

        // Visual feedback
        this.showPopup('LAUNCH!', this.ball.x, this.ball.y - 40, 20);
    }
    
    addScore(points) {
        // XP Pinball: Apply field multiplier
        const multiplier = CONFIG.multipliers[this.gameState.multiplierIndex];
        const multipliedPoints = Math.floor(points * multiplier);
        this.gameState.score += multipliedPoints;

        // Track flags for flag missions
        this.gameState.flagRotations++;

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
            fontSize: `${fontSize}px`, fontFamily: 'Arial', color: '#ffffff',
            stroke: '#000000', strokeThickness: 5, align: 'center'
        }).setOrigin(0.5).setDepth(1001);
        
        this.tweens.add({
            targets: popup, y: y - 60, alpha: 0, scale: 1.2, duration: 1100,
            ease: 'Power2', onComplete: () => popup.destroy()
        });
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
        
        const bg = this.add.rectangle(CONFIG.width / 2, CONFIG.height / 2, CONFIG.width, CONFIG.height, 0x000000, 0.85).setDepth(2000);
        const title = this.add.text(CONFIG.width / 2, CONFIG.height * 0.4, 'PAUSED', {
            fontSize: '56px', fontFamily: 'Arial', color: '#00ffff', stroke: '#000000', strokeThickness: 7
        }).setOrigin(0.5).setDepth(2001);
        
        const resumeText = this.add.text(CONFIG.width / 2, CONFIG.height * 0.55, 'TAP TO RESUME', {
            fontSize: '24px', fontFamily: 'Arial', color: '#ffffff', stroke: '#000000', strokeThickness: 4
        }).setOrigin(0.5).setDepth(2001);
        
        this.pauseOverlay = [bg, title, resumeText];
        
        this.input.keyboard.once('keydown-SPACE', () => this.resumeGame());
        this.input.keyboard.once('keydown-ESC', () => this.resumeGame());
        this.input.once('pointerdown', () => this.resumeGame());
    }
    
    resumeGame() {
        this.gameState.isPaused = false;
        this.physics.resume();
        if (this.pauseOverlay) {
            this.pauseOverlay.forEach(obj => obj.destroy());
            this.pauseOverlay = null;
        }
    }
    
    gameOver() {
        this.scene.start('GameOverScene', {
            score: this.gameState.score,
            highScore: this.gameState.highScore,
            statistics: this.gameState.statistics
        });
    }
}

class GameOverScene extends Phaser.Scene {
    constructor() { super({ key: 'GameOverScene' }); }
    
    init(data) {
        this.finalScore = data.score;
        this.highScore = data.highScore;
        this.statistics = data.statistics;
    }
    
    create() {
        this.cameras.main.setBackgroundColor(CONFIG.colors.background);
        
        this.add.text(CONFIG.width / 2, 120, 'GAME OVER', {
            fontSize: '64px', fontFamily: 'Arial', color: '#ff0099',
            stroke: '#000000', strokeThickness: 7
        }).setOrigin(0.5);
        
        this.add.text(CONFIG.width / 2, 230, 'FINAL SCORE', {
            fontSize: '26px', fontFamily: 'Arial', color: '#ffffff'
        }).setOrigin(0.5);
        
        this.add.text(CONFIG.width / 2, 280, `${this.finalScore}`, {
            fontSize: '54px', fontFamily: 'Arial', color: '#00ffff',
            stroke: '#000000', strokeThickness: 5
        }).setOrigin(0.5);
        
        if (this.finalScore >= this.highScore) {
            const newHigh = this.add.text(CONFIG.width / 2, 360, 'NEW HIGH SCORE!', {
                fontSize: '36px', fontFamily: 'Arial', color: '#ffff00',
                stroke: '#000000', strokeThickness: 5
            }).setOrigin(0.5);
            this.tweens.add({ targets: newHigh, scale: 1.12, duration: 600, yoyo: true, repeat: -1 });
        } else {
            this.add.text(CONFIG.width / 2, 360, `HIGH SCORE: ${this.highScore}`, {
                fontSize: '26px', fontFamily: 'Arial', color: '#ffff00'
            }).setOrigin(0.5);
        }
        
        // Show statistics
        let statsY = 450;
        if (this.statistics.enlightenmentCount > 0) {
            this.add.text(CONFIG.width / 2, statsY, `Enlightenments: ${this.statistics.enlightenmentCount}`, {
                fontSize: '20px', fontFamily: 'Arial', color: '#ffffff'
            }).setOrigin(0.5);
            statsY += 30;
        }
        
        if (this.statistics.saturnVortexEscapes > 0) {
            this.add.text(CONFIG.width / 2, statsY, `Vortex Escapes: ${this.statistics.saturnVortexEscapes}`, {
                fontSize: '20px', fontFamily: 'Arial', color: '#ffffff'
            }).setOrigin(0.5);
        }
        
        const isMobile = window.gameInputManager && window.gameInputManager.isMobile;
        const playAgainText = isMobile ? 'TAP ⚡ TO PLAY AGAIN' : 'PRESS SPACE TO PLAY AGAIN';

        const playAgain = this.add.text(CONFIG.width / 2, CONFIG.height - 120, playAgainText, {
            fontSize: '28px', fontFamily: 'Arial', color: '#00ffff',
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
        height: CONFIG.height
    },
    scene: [BootScene, MenuScene, GameScene, GameOverScene]
};

window.gameInputManager = new InputManager();

window.addEventListener('load', () => {
    new Phaser.Game(gameConfig);
    document.addEventListener('contextmenu', e => e.preventDefault());
});
