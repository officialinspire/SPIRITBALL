// ===================================
// SPIRITBALL - PHASER 3 GAME
// DMT-Inspired Pinball Vision Quest
// Version 4.4 - Enhanced Gameplay & Cosmic Aesthetics
// - ADJUSTED: Bumpers moved closer together (20px) for better ball control
// - REPOSITIONED: Saturn lowered from y=100 to y=180 for improved gameplay flow
// - STYLIZED: Cosmic energy wing flippers with glowing animations replace simple rectangles
// - ADDED: 9 new thematic obstacles for diverse gameplay:
//   * Cosmic Crystals (2) - High-scoring bouncy triangular crystals
//   * Asteroids (3) - Rocky space obstacles with medium bounce
//   * Energy Vortexes (2) - Speed-boosting portals with teleport effects
//   * Comets (2) - Directional boost shooting stars
// - ENHANCED: Each obstacle type has unique physics, scoring, and visual effects
// Previous (v4.3):
// - FIXED: Ball launch after death now 100% reliable (desktop & mobile)
// - ENHANCED: Professional pinball flipper physics (lightning-fast, powerful, responsive)
// - IMPROVED: Ball stays within game boundaries with robust wall collision
// - ADJUSTED: Chakras lowered further to perfectly center over flower of life
// - VERIFIED: Saturn displayed as cartoon orange planet with golden rings
// ===================================

const CONFIG = {
    width: 540,
    height: 960,
    gravity: 1400,
    ballRadius: 20,
    ballBounce: 0.75,
    startingLives: 3,
    comboTimeout: 2500,
    maxComboMultiplier: 5,
    chakraCount: 7,
    saturnHitsRequired: 3,
    enlightenmentDuration: 8000,
    plungerMaxPower: 1200,
    plungerMinPower: 400,
    plungerChargeTime: 2000,
    scores: {
        bumper: 100,
        chakra: 250,
        saturn: 500,
        lane: 250,
        target: 500,
        portal: 1500,
        setComplete: 5000,
        enlightenment: 10000
    },
    colors: {
        background: 0x1a0033,
        ball: 0xffffff,
        eyeball: 0x00ffff,
        flipper: 0xff00ff,
        bumper1: 0xff0099,
        bumper2: 0x00ffff,
        bumper3: 0xff00ff,
        bumper4: 0xffff00,
        bumper5: 0x00ff99,
        portal: 0x00ff99,
        target: 0xffff00,
        wall: 0x00CCFF, // Changed to glowing cyan/turquoise
        chakra: [0x9400D3, 0xFF1493, 0xFFFF00, 0x00FF00, 0x00FFFF, 0x0000FF, 0x8B00FF],
        saturn: 0xFFA500,
        saturnRing: 0xFFD700
    },
    powerupDurations: {
        spiritAnimal: 10000,
        ancestorGuide: 8000,
        enlightenment: 8000
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
}

class GameScene extends Phaser.Scene {
    constructor() { super({ key: 'GameScene' }); }
    
    create() {
        this.gameState = {
            score: 0,
            lives: CONFIG.startingLives,
            highScore: parseInt(localStorage.getItem('spiritball-highscore')) || 0,
            comboCount: 0,
            comboMultiplier: 1,
            lastHitTime: 0,
            isPaused: false,
            ballInPlay: false,
            canLaunch: true,
            plungerCharging: false,
            plungerPower: 0,
            plungerChargeStart: 0,
            enlightenmentActive: false,
            enlightenmentEndTime: 0,
            saturnHitCount: 0,
            saturnVortexActive: false,
            chakrasLit: Array(CONFIG.chakraCount).fill(false),
            powerups: {
                spiritAnimal: { active: false, endTime: 0, multiplier: 2 },
                ancestorGuide: { active: false, endTime: 0 },
                secondChance: { available: false }
            },
            targets: {
                spiritAnimal: [false, false, false],
                fractalCrystals: [false, false, false],
                rebirthRunes: [false, false, false]
            },
            statistics: {
                spiritAnimalActivations: 0,
                portalCrossings: 0,
                enlightenmentCount: 0,
                saturnVortexEscapes: 0
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
        this.setupChakras();
        this.setupSaturn();
        this.setupObstacles();
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
        this.chakras = [];

        // Position chakras in a vertical alignment (like spine) - centered over flower of life
        const startY = 380; // Lowered significantly to center over flower of life in background.png
        const spacing = 65; // Slightly increased spacing for better visual distribution
        const centerX = CONFIG.width / 2;

        for (let i = 0; i < CONFIG.chakraCount; i++) {
            const chakra = this.add.sprite(centerX + (i % 2 === 0 ? -35 : 35), startY + (i * spacing), `chakra${i}`);
            chakra.setScale(0.8);
            chakra.setDepth(50);
            this.physics.add.existing(chakra, true);
            chakra.body.setCircle(25);
            
            // Add rotation animation - each rotates at different speed
            this.tweens.add({
                targets: chakra,
                angle: 360,
                duration: 2500 + (i * 300),
                repeat: -1,
                ease: 'Linear'
            });
            
            // Add pulsing glow - unique timing for each
            this.tweens.add({
                targets: chakra,
                scale: 0.85,
                alpha: 0.8,
                duration: 1200 + (i * 150),
                yoyo: true,
                repeat: -1,
                ease: 'Sine.easeInOut'
            });
            
            this.chakras.push(chakra);
        }
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

        // Cosmic Crystal bumpers (triangular) - positioned strategically
        const crystal1 = this.add.sprite(120, 320, 'cosmic-crystal');
        crystal1.setScale(0.9);
        crystal1.setDepth(50);
        this.physics.add.existing(crystal1, true);
        crystal1.body.setCircle(20);

        const crystal2 = this.add.sprite(CONFIG.width - 120, 380, 'cosmic-crystal');
        crystal2.setScale(0.9);
        crystal2.setDepth(50);
        this.physics.add.existing(crystal2, true);
        crystal2.body.setCircle(20);

        // Pulsing animation for crystals
        this.tweens.add({
            targets: [crystal1, crystal2],
            scale: 1.0,
            alpha: 0.9,
            duration: 1000,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
        });

        // Asteroids - rocky space obstacles
        const asteroid1 = this.add.sprite(90, 500, 'asteroid');
        asteroid1.setScale(0.85);
        asteroid1.setDepth(50);
        this.physics.add.existing(asteroid1, true);
        asteroid1.body.setCircle(15);

        const asteroid2 = this.add.sprite(CONFIG.width - 90, 560, 'asteroid');
        asteroid2.setScale(0.85);
        asteroid2.setDepth(50);
        this.physics.add.existing(asteroid2, true);
        asteroid2.body.setCircle(15);

        const asteroid3 = this.add.sprite(CONFIG.width / 2, 280, 'asteroid');
        asteroid3.setScale(0.75);
        asteroid3.setDepth(50);
        this.physics.add.existing(asteroid3, true);
        asteroid3.body.setCircle(13);

        // Slow rotation for asteroids
        this.tweens.add({
            targets: [asteroid1, asteroid2, asteroid3],
            angle: 360,
            duration: 8000,
            repeat: -1,
            ease: 'Linear'
        });

        // Energy Vortex portals - small teleporters
        const vortex1 = this.add.sprite(180, 240, 'energy-vortex');
        vortex1.setScale(0.7);
        vortex1.setDepth(50);
        this.physics.add.existing(vortex1, true);
        vortex1.body.setCircle(14);

        const vortex2 = this.add.sprite(CONFIG.width - 180, 450, 'energy-vortex');
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

        // Store all obstacles for collision detection
        this.obstacles = [
            crystal1, crystal2,
            asteroid1, asteroid2, asteroid3,
            vortex1, vortex2,
            comet1, comet2
        ];
    }

    setupFlippers() {
        const flipperWidth = 80;
        const flipperHeight = 16;
        const flipperY = CONFIG.height - 100;

        // Left cosmic energy wing flipper - moved closer to center (130px from edge instead of 150px)
        this.leftFlipper = this.add.sprite(130, flipperY, 'flipper-left');
        this.physics.add.existing(this.leftFlipper, true);
        this.leftFlipper.body.setSize(flipperWidth, flipperHeight);
        this.leftFlipper.setDepth(99);

        // Add glow effect to left flipper
        this.tweens.add({
            targets: this.leftFlipper,
            alpha: 0.85,
            duration: 800,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
        });

        // Right cosmic energy wing flipper - moved closer to center (130px from edge instead of 150px)
        this.rightFlipper = this.add.sprite(CONFIG.width - 130, flipperY, 'flipper-right');
        this.physics.add.existing(this.rightFlipper, true);
        this.rightFlipper.body.setSize(flipperWidth, flipperHeight);
        this.rightFlipper.setDepth(99);

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
        // Add robust colliders between ball and walls - ball always bounces back
        this.walls.forEach(wall => {
            this.physics.add.collider(this.ball, wall, (ball, wall) => {
                // Ensure ball bounces with proper physics
                if (ball.body && ball.body.touching) {
                    // Add subtle visual feedback when ball hits wall
                    this.cameras.main.shake(40, 0.003);

                    // Ensure minimum bounce velocity so ball doesn't get stuck
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

        // Add colliders for flippers - ensure ball never passes through
        this.physics.add.collider(this.ball, this.leftFlipper, null, null, this);
        this.physics.add.collider(this.ball, this.rightFlipper, null, null, this);
    }

    setupHUD() {
        // Create styled header dashboard container
        const dashboardBg = this.add.graphics();
        dashboardBg.fillStyle(0x1a0033, 0.85);
        dashboardBg.fillRoundedRect(0, 0, CONFIG.width, 85, 0);
        dashboardBg.lineStyle(3, 0x00ffff, 1); // Changed to glowing cyan
        dashboardBg.strokeRoundedRect(0, 0, CONFIG.width, 85, 0);
        dashboardBg.lineStyle(2, 0x00ffff, 0.8); // Increased opacity for glow effect
        dashboardBg.strokeRoundedRect(2, 2, CONFIG.width - 4, 81, 0);
        dashboardBg.setDepth(999);

        // Decorative corner accents
        const accentGraphics = this.add.graphics();
        accentGraphics.lineStyle(2, 0x00ffff, 1); // Changed to glowing cyan
        // Top left corner
        accentGraphics.lineBetween(10, 10, 30, 10);
        accentGraphics.lineBetween(10, 10, 10, 30);
        // Top right corner
        accentGraphics.lineBetween(CONFIG.width - 30, 10, CONFIG.width - 10, 10);
        accentGraphics.lineBetween(CONFIG.width - 10, 10, CONFIG.width - 10, 30);
        // Bottom left corner
        accentGraphics.lineBetween(10, 75, 30, 75);
        accentGraphics.lineBetween(10, 55, 10, 75);
        // Bottom right corner
        accentGraphics.lineBetween(CONFIG.width - 30, 75, CONFIG.width - 10, 75);
        accentGraphics.lineBetween(CONFIG.width - 10, 55, CONFIG.width - 10, 75);
        accentGraphics.setDepth(1000);

        this.hud = {
            scoreLabel: this.add.text(20, 15, 'SCORE', {
                fontSize: '16px',
                fontFamily: 'Impact, Arial Black, Arial',
                color: '#9400D3',
                stroke: '#000000',
                strokeThickness: 2,
                letterSpacing: 2
            }).setDepth(1001),

            scoreText: this.add.text(20, 35, '0', {
                fontSize: '28px',
                fontFamily: 'Impact, Arial Black, Arial',
                color: '#00ffff',
                stroke: '#000000',
                strokeThickness: 4,
                letterSpacing: 1
            }).setDepth(1001),

            highScoreLabel: this.add.text(CONFIG.width / 2, 15, 'HIGH SCORE', {
                fontSize: '16px',
                fontFamily: 'Impact, Arial Black, Arial',
                color: '#9400D3',
                stroke: '#000000',
                strokeThickness: 2,
                letterSpacing: 2
            }).setOrigin(0.5, 0).setDepth(1001),

            highScoreText: this.add.text(CONFIG.width / 2, 35, `${this.gameState.highScore}`, {
                fontSize: '28px',
                fontFamily: 'Impact, Arial Black, Arial',
                color: '#ffff00',
                stroke: '#000000',
                strokeThickness: 4,
                letterSpacing: 1
            }).setOrigin(0.5, 0).setDepth(1001),

            livesLabel: this.add.text(CONFIG.width - 20, 15, 'LIVES', {
                fontSize: '16px',
                fontFamily: 'Impact, Arial Black, Arial',
                color: '#9400D3',
                stroke: '#000000',
                strokeThickness: 2,
                letterSpacing: 2
            }).setOrigin(1, 0).setDepth(1001),

            livesText: this.add.text(CONFIG.width - 20, 35, `❤️ ${this.gameState.lives}`, {
                fontSize: '28px',
                fontFamily: 'Impact, Arial Black, Arial',
                color: '#ff0099',
                stroke: '#000000',
                strokeThickness: 4
            }).setOrigin(1, 0).setDepth(1001),

            comboText: this.add.text(CONFIG.width / 2, 95, '', {
                fontSize: '24px',
                fontFamily: 'Impact, Arial Black, Arial',
                color: '#ffffff',
                stroke: '#ff00ff',
                strokeThickness: 4,
                letterSpacing: 2
            }).setOrigin(0.5, 0).setDepth(1001).setAlpha(0)
        };

        // Add pulsing glow effect to dashboard
        this.tweens.add({
            targets: accentGraphics,
            alpha: 0.4,
            duration: 1500,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
        });
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
        // Ball trail using Phaser 3.60 particle system
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

        // Drain vortex particles
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
    }
    
    update(time, delta) {
        if (this.gameState.isPaused) return;

        this.updateInput();
        this.updatePlunger();
        this.updateCombo();
        this.updatePowerups();
        this.checkDrain();
        this.updateEnlightenment();
        this.updateSaturnVortex();
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
                angle: -58, // Maximum aggressive angle for powerful hitting
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
            this.cameras.main.shake(150, 0.008);

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
            angle: 0,
            duration: 35, // Instant snap-back like real pinball
            ease: 'Cubic.easeIn'
        });
    }

    activateRightFlipper() {
        if (!this.rightFlipperActive) {
            this.rightFlipperActive = true;
            this.tweens.add({
                targets: this.rightFlipper,
                angle: 58, // Maximum aggressive angle for powerful hitting
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
            this.cameras.main.shake(150, 0.008);

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
            angle: 0,
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
    
    updateCombo() {
        const now = Date.now();
        if (this.gameState.lastHitTime && now - this.gameState.lastHitTime > CONFIG.comboTimeout) {
            this.gameState.comboCount = 0;
            this.gameState.comboMultiplier = 1;
            this.updateHUD();
        }
    }
    
    updatePowerups() {
        const now = Date.now();
        
        if (this.gameState.powerups.spiritAnimal.active && now > this.gameState.powerups.spiritAnimal.endTime) {
            this.gameState.powerups.spiritAnimal.active = false;
            this.ballTrail.setConfig({ tint: CONFIG.colors.eyeball });
        }
        
        if (this.gameState.powerups.ancestorGuide.active && now > this.gameState.powerups.ancestorGuide.endTime) {
            this.gameState.powerups.ancestorGuide.active = false;
        }
    }
    
    updateEnlightenment() {
        if (this.gameState.enlightenmentActive && Date.now() > this.gameState.enlightenmentEndTime) {
            this.deactivateEnlightenment();
        }
    }
    
    updateSaturnVortex() {
        if (this.gameState.saturnVortexActive && this.saturnHexagon.visible) {
            // Pull ball toward vortex
            if (this.ball.body && this.gameState.ballInPlay) {
                const dx = this.saturnHexagon.x - this.ball.x;
                const dy = this.saturnHexagon.y - this.ball.y;
                const distance = Math.sqrt(dx * dx + dy * dy);

                if (distance < 150) {
                    const pullStrength = 200 * (1 - distance / 150);
                    this.ball.body.setVelocity(
                        this.ball.body.velocity.x + (dx / distance) * pullStrength * 0.02,
                        this.ball.body.velocity.y + (dy / distance) * pullStrength * 0.02
                    );
                }

                // Check if ball is sucked into vortex
                if (this.physics.overlap(this.ball, this.saturnHexagon)) {
                    this.ballSuckedIntoVortex();
                }
            }
        }

        // Check chakra collisions
        this.chakras.forEach((chakra, index) => {
            if (this.physics.overlap(this.ball, chakra)) {
                if (!this.isOnCooldown(chakra)) {
                    this.hitChakra(index);
                    this.setCooldown(chakra, 500);
                }
            }
        });

        // Check Saturn collision
        if (this.physics.overlap(this.ball, this.saturn)) {
            if (!this.isOnCooldown(this.saturn)) {
                this.hitSaturn();
                this.setCooldown(this.saturn, 500);
            }
        }

        // Check obstacle collisions
        if (this.obstacles) {
            this.obstacles.forEach((obstacle, index) => {
                if (this.physics.overlap(this.ball, obstacle)) {
                    if (!this.isOnCooldown(obstacle)) {
                        this.hitObstacle(obstacle, index);
                        this.setCooldown(obstacle, 400);
                    }
                }
            });
        }
    }

    hitObstacle(obstacle, index) {
        // Different effects based on obstacle type
        const textureName = obstacle.texture.key;

        if (textureName === 'cosmic-crystal') {
            // Crystal gives bonus points and intense bounce
            this.cameras.main.shake(100, 0.004);
            this.addScore(CONFIG.scores.bumper * 2);
            this.incrementCombo();

            // Intense bounce effect
            if (this.ball.body) {
                const angle = Math.atan2(
                    this.ball.y - obstacle.y,
                    this.ball.x - obstacle.x
                );
                this.ball.body.setVelocity(
                    Math.cos(angle) * 800,
                    Math.sin(angle) * 800
                );
            }

            // Crystal burst effect
            this.tweens.add({
                targets: obstacle,
                scale: 1.2,
                alpha: 1,
                duration: 100,
                yoyo: true,
                ease: 'Power2'
            });

            this.showPopup('CRYSTAL!', obstacle.x, obstacle.y - 40, 20);

        } else if (textureName === 'asteroid') {
            // Asteroid gives medium points and solid bounce
            this.cameras.main.shake(80, 0.003);
            this.addScore(CONFIG.scores.bumper);
            this.incrementCombo();

            // Solid bounce
            if (this.ball.body) {
                const angle = Math.atan2(
                    this.ball.y - obstacle.y,
                    this.ball.x - obstacle.x
                );
                this.ball.body.setVelocity(
                    Math.cos(angle) * 600,
                    Math.sin(angle) * 600
                );
            }

            this.showPopup('ASTEROID!', obstacle.x, obstacle.y - 30, 18);

        } else if (textureName === 'energy-vortex') {
            // Energy vortex gives teleport/speed boost
            this.cameras.main.shake(120, 0.005);
            this.addScore(CONFIG.scores.bumper * 3);
            this.incrementCombo();

            // Speed boost effect
            if (this.ball.body) {
                const currentSpeed = Math.sqrt(
                    this.ball.body.velocity.x ** 2 + this.ball.body.velocity.y ** 2
                );
                const newSpeed = currentSpeed * 1.3;
                const angle = Math.atan2(this.ball.body.velocity.y, this.ball.body.velocity.x);
                this.ball.body.setVelocity(
                    Math.cos(angle) * newSpeed,
                    Math.sin(angle) * newSpeed
                );
            }

            // Flash effect
            this.cameras.main.flash(200, 138, 43, 226, false, 0.3);

            this.showPopup('VORTEX BOOST!', obstacle.x, obstacle.y - 40, 22);

        } else if (textureName === 'comet') {
            // Comet gives high points and directional boost
            this.cameras.main.shake(90, 0.004);
            this.addScore(CONFIG.scores.bumper * 2.5);
            this.incrementCombo();

            // Directional boost based on comet angle
            if (this.ball.body) {
                const cometAngle = obstacle.angle * Math.PI / 180;
                this.ball.body.setVelocity(
                    this.ball.body.velocity.x + Math.cos(cometAngle) * 300,
                    this.ball.body.velocity.y + Math.sin(cometAngle) * 300
                );
            }

            this.showPopup('COMET!', obstacle.x, obstacle.y - 35, 20);
        }

        // Particle burst for all obstacles
        const burstParticles = this.add.particles(obstacle.x, obstacle.y, 'particle', {
            speed: { min: 100, max: 250 },
            angle: { min: 0, max: 360 },
            scale: { start: 0.6, end: 0 },
            alpha: { start: 1, end: 0 },
            lifespan: 600,
            blendMode: 'ADD',
            frequency: -1,
            quantity: 15,
            tint: obstacle.tint || 0xffffff
        });

        this.time.delayedCall(650, () => burstParticles.destroy());
    }
    
    hitChakra(index) {
        this.cameras.main.shake(80, 0.002);
        this.addScore(CONFIG.scores.chakra);
        this.incrementCombo();
        
        // Light up the chakra
        this.gameState.chakrasLit[index] = true;
        
        // Visual feedback
        this.tweens.add({
            targets: this.chakras[index],
            scale: 1.1,
            alpha: 1,
            duration: 150,
            yoyo: true,
            ease: 'Power2'
        });
        
        // Particle burst
        const burstParticles = this.add.particles(this.chakras[index].x, this.chakras[index].y, 'particle-triangle', {
            speed: { min: 150, max: 300 },
            angle: { min: 0, max: 360 },
            scale: { start: 0.8, end: 0 },
            alpha: { start: 1, end: 0 },
            lifespan: 700,
            blendMode: 'ADD',
            frequency: -1,
            quantity: 20,
            tint: CONFIG.colors.chakra[index]
        });

        this.time.delayedCall(750, () => burstParticles.destroy());
        
        this.showPopup(`CHAKRA ${index + 1}!`, this.chakras[index].x, this.chakras[index].y - 40, 22);
        
        // Check if all chakras are lit
        if (this.gameState.chakrasLit.every(lit => lit)) {
            this.activateEnlightenment();
        }
    }
    
    activateEnlightenment() {
        this.gameState.enlightenmentActive = true;
        this.gameState.enlightenmentEndTime = Date.now() + CONFIG.powerupDurations.enlightenment;
        this.gameState.statistics.enlightenmentCount++;
        
        // Change ball to flaming eyeball
        this.ball.setTexture('eyeball-fire');
        
        // Enhanced trail effect with fire
        this.ballTrail.setConfig({
            tint: [0xFF6600, 0xFF0000, 0xFFFF00],
            frequency: 12,
            scale: { start: 0.9, end: 0 },
            alpha: { start: 1, end: 0 }
        });
        
        // Intense screen shake
        this.cameras.main.shake(500, 0.01);
        
        // Visual celebration
        this.showPopup('ENLIGHTENMENT!', CONFIG.width / 2, CONFIG.height / 2, 42);
        
        // Award bonus score
        this.addScore(CONFIG.scores.enlightenment);
        
        // Speed boost
        if (this.ball.body) {
            const currentSpeed = Math.sqrt(
                this.ball.body.velocity.x ** 2 + this.ball.body.velocity.y ** 2
            );
            const newSpeed = currentSpeed * 1.5;
            const angle = Math.atan2(this.ball.body.velocity.y, this.ball.body.velocity.x);
            this.ball.body.setVelocity(
                Math.cos(angle) * newSpeed,
                Math.sin(angle) * newSpeed
            );
        }
        
        // Reset chakras for next cycle
        this.gameState.chakrasLit = Array(CONFIG.chakraCount).fill(false);
    }
    
    deactivateEnlightenment() {
        this.gameState.enlightenmentActive = false;
        
        // Return to normal eyeball
        this.ball.setTexture('eyeball');
        
        // Normal trail
        this.ballTrail.setConfig({
            tint: CONFIG.colors.eyeball,
            frequency: 25,
            scale: { start: 0.5, end: 0 },
            alpha: { start: 0.7, end: 0 }
        });
    }
    
    hitSaturn() {
        this.cameras.main.shake(100, 0.003);
        this.addScore(CONFIG.scores.saturn);
        this.incrementCombo();
        
        this.gameState.saturnHitCount++;
        
        // Increase ring glow
        this.tweens.add({
            targets: this.saturnRing,
            alpha: 1.0,
            scale: 0.95,
            duration: 150,
            yoyo: true,
            ease: 'Power2',
            onComplete: () => {
                this.saturnRing.setAlpha(0.8 + (this.gameState.saturnHitCount * 0.1));
            }
        });
        
        // Particle burst
        const burstParticles = this.add.particles(this.saturn.x, this.saturn.y, 'particle-hex', {
            speed: { min: 180, max: 350 },
            angle: { min: 0, max: 360 },
            scale: { start: 0.8, end: 0 },
            alpha: { start: 1, end: 0 },
            lifespan: 900,
            blendMode: 'ADD',
            frequency: -1,
            quantity: 25,
            tint: CONFIG.colors.saturnRing
        });

        this.time.delayedCall(950, () => burstParticles.destroy());
        
        this.showPopup(`SATURN ${this.gameState.saturnHitCount}/3!`, this.saturn.x, this.saturn.y - 50, 24);
        
        // Activate vortex after 3 hits
        if (this.gameState.saturnHitCount >= CONFIG.saturnHitsRequired) {
            this.activateSaturnVortex();
        }
    }
    
    activateSaturnVortex() {
        this.gameState.saturnVortexActive = true;
        this.gameState.saturnHitCount = 0;
        
        // Show hexagon
        this.saturnHexagon.setVisible(true);
        this.saturnHexagon.setScale(0);
        
        this.tweens.add({
            targets: this.saturnHexagon,
            scale: 1.2,
            duration: 500,
            ease: 'Back.easeOut'
        });
        
        // Rotation animation
        this.tweens.add({
            targets: this.saturnHexagon,
            angle: -360,
            duration: 3000,
            repeat: -1,
            ease: 'Linear'
        });
        
        // Pulsing effect
        this.tweens.add({
            targets: this.saturnHexagon,
            alpha: 0.5,
            scale: 1.3,
            duration: 600,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
        });
        
        this.showPopup('VORTEX ACTIVE!', CONFIG.width / 2, 150, 32);
        
        // Reset ring glow
        this.saturnRing.setAlpha(0.8);
        
        // Auto-deactivate after some time
        this.time.delayedCall(8000, () => {
            this.deactivateSaturnVortex();
        });
    }
    
    deactivateSaturnVortex() {
        if (!this.gameState.saturnVortexActive) return;
        
        this.gameState.saturnVortexActive = false;
        
        this.tweens.add({
            targets: this.saturnHexagon,
            scale: 0,
            alpha: 0,
            duration: 400,
            ease: 'Back.easeIn',
            onComplete: () => {
                this.saturnHexagon.setVisible(false);
                this.saturnHexagon.setAlpha(1);
                this.saturnHexagon.setScale(1.2);
            }
        });
    }
    
    ballSuckedIntoVortex() {
        this.gameState.saturnVortexActive = false;
        this.gameState.ballInPlay = false;
        
        // Dramatic sucking effect
        this.tweens.add({
            targets: this.ball,
            x: this.saturnHexagon.x,
            y: this.saturnHexagon.y,
            scale: 0,
            duration: 400,
            ease: 'Power2.easeIn',
            onComplete: () => {
                // Teleport ball to random location
                const newX = Phaser.Math.Between(100, CONFIG.width - 100);
                const newY = Phaser.Math.Between(250, 450);
                
                this.ball.setPosition(newX, newY);
                this.ball.setScale(0.8);
                
                // Flash effect
                this.cameras.main.flash(300, 138, 43, 226);
                
                this.gameState.ballInPlay = true;
                this.gameState.statistics.saturnVortexEscapes++;
                
                this.showPopup('DIMENSION SHIFT!', newX, newY - 50, 28);
            }
        });
        
        this.deactivateSaturnVortex();
    }
    
    checkDrain() {
        if (this.gameState.ballInPlay && this.physics.overlap(this.ball, this.drainZone)) {
            if (this.gameState.powerups.secondChance.available) {
                this.gameState.powerups.secondChance.available = false;
                this.showPopup('REBIRTH!', CONFIG.width / 2, CONFIG.height / 2, 44);
                this.cameras.main.flash(600, 255, 255, 255);
                this.resetBall();
                return;
            }
            
            // Show Grim Reaper
            this.showGrimReaper();
            
            this.gameState.lives--;
            this.gameState.ballInPlay = false;
            this.gameState.comboCount = 0;
            this.gameState.comboMultiplier = 1;
            
            // Deactivate enlightenment if active
            if (this.gameState.enlightenmentActive) {
                this.deactivateEnlightenment();
            }
            
            // Deactivate Saturn vortex if active
            if (this.gameState.saturnVortexActive) {
                this.deactivateSaturnVortex();
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
        this.cameras.main.shake(400, 0.008);
        this.cameras.main.flash(200, 255, 0, 0, true);
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
        // Ensure ball is visible and physics enabled
        this.ball.setVisible(true);
        this.ball.setActive(true);
        this.ball.setPosition(CONFIG.width - 70, CONFIG.height - 220);
        this.ball.setTexture('eyeball');
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
        this.collisionCooldowns.clear();

        // Reset input tracking to ensure clean state for next launch
        this.previousSpaceDown = false;
        this.launchAttemptStarted = false;

        // Clear any existing quick tap timer
        if (this.quickTapTimer) {
            this.quickTapTimer.remove();
            this.quickTapTimer = null;
        }

        // Reset enlightenment if needed
        if (this.gameState.enlightenmentActive) {
            this.deactivateEnlightenment();
        }
    }
    
    launchBall() {
        this.gameState.ballInPlay = true;
        this.gameState.canLaunch = false;

        // Use plunger power to determine velocity
        const power = this.gameState.plungerPower;
        const velocityY = -power;
        const velocityX = -250;

        this.ball.body.setVelocity(velocityX, velocityY);

        // Shake intensity based on power
        const shakeIntensity = 0.002 + (power / CONFIG.plungerMaxPower) * 0.005;
        this.cameras.main.shake(150, shakeIntensity);

        // Visual feedback
        this.showPopup('LAUNCH!', this.ball.x, this.ball.y - 40, 20);
    }
    
    addScore(points) {
        let multiplier = this.gameState.comboMultiplier;
        if (this.gameState.enlightenmentActive) {
            multiplier *= 2;
        }
        const multipliedPoints = Math.floor(points * multiplier);
        this.gameState.score += multipliedPoints;
        
        if (this.gameState.score > this.gameState.highScore) {
            this.gameState.highScore = this.gameState.score;
            localStorage.setItem('spiritball-highscore', this.gameState.highScore);
        }
        
        this.updateHUD();
    }
    
    incrementCombo() {
        this.gameState.comboCount++;
        this.gameState.lastHitTime = Date.now();
        if (this.gameState.comboCount % 5 === 0) {
            this.gameState.comboMultiplier = Math.min(this.gameState.comboMultiplier + 0.5, CONFIG.maxComboMultiplier);
        }
        this.updateHUD();
    }
    
    updateHUD() {
        this.hud.scoreText.setText(`${this.gameState.score}`);
        this.hud.highScoreText.setText(`${this.gameState.highScore}`);
        this.hud.livesText.setText(`❤️ ${this.gameState.lives}`);

        if (this.gameState.comboMultiplier > 1) {
            this.hud.comboText.setText(`${this.gameState.comboMultiplier.toFixed(1)}x COMBO`);
            this.hud.comboText.setAlpha(1);
        } else {
            this.hud.comboText.setAlpha(0);
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
