// Mistborn: Allomancy Sandbox
class Game {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.pauseScreen = document.getElementById('pauseScreen');
        this.debugInfo   = document.getElementById('debugInfo');
        this.debugUI     = document.getElementById('debugUI');
        this.controlUI   = {
            root: document.getElementById('controlUI'),
            keyboard: document.querySelector('#controlUI #keyboard'),
            controller: document.querySelector('#controlUI #controller')
        };
        
        this.setupCanvas();
        this.setupInput();
        this.setupGamepad();
        
        this.gameState = 'playing'; // 'playing', 'paused'
        this.lastTime = 0;
        
        // Frame rate capping and fixed timestep
        this.targetFPS = 60;
        this.frameInterval = 1000 / this.targetFPS;
        this.accumulator = 0;
        this.fixedTimeStep = 1 / this.targetFPS; // Fixed timestep for consistent physics
        
        // Game objects
        this.world  = new World();
        const spawn = this.world.getSpawnPoint();
        this.player = new Player(spawn.x, spawn.y);
        this.camera = new Camera(this.canvas.width, this.canvas.height);
        
        // Input state
        this.keys = {};
        this.mouse = { x: 0, y: 0, leftDown: false, rightDown: false };
        this.controller = {
            connected: false,
            leftStick: { x: 0, y: 0 },
            rightStick: { x: 0, y: 0 },
            buttons: {
                a: false,
                start: false,
                back: false,
                leftTrigger: false,
                leftTriggerValue: 0,
                leftBumper: false,
                rightBumper: false
            }
        };
        this.previousControllerButtons = { start: false, back: false, leftBumper: false, rightBumper: false };
        this.controllerDeadZone = 0.25;
        this.debugUIVisible = this.debugUI?.style.display === 'none' ? false : true;
        this.updateControlScheme(this.controller.connected ? 'controller' : 'keyboard');

        this.start();
    }
    
    setupCanvas() {
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());
    }
    
    resizeCanvas() {
        const container = document.getElementById('gameContainer');
        this.canvas.width = container.clientWidth;
        this.canvas.height = container.clientHeight;
        this.camera?.resize(this.canvas.width, this.canvas.height);
    }
    
    setupInput() {
        // Keyboard input
        document.addEventListener('keydown', (e) => {
            this.keys[e.code] = true;
            if (e.code === 'Tab') {
                e.preventDefault();
                this.togglePause();
            }
            if (e.code === 'KeyR') {
                this.restart();
            }
            if (e.code === 'KeyI') {
                this.toggleDebugUI();
            }
            this.updateControlScheme('keyboard');
        });
        
        document.addEventListener('keyup', (e) => {
            this.keys[e.code] = false;
        });
        
        // Mouse input
        this.canvas.addEventListener('mousemove', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            this.mouse.x = e.clientX - rect.left;
            this.mouse.y = e.clientY - rect.top;
        });
        
        this.canvas.addEventListener('mousedown', (e) => {
            if (e.button === 0) this.mouse.leftDown = true;
            if (e.button === 2) this.mouse.rightDown = true;
        });
        
        this.canvas.addEventListener('mouseup', (e) => {
            if (e.button === 0) this.mouse.leftDown = false;
            if (e.button === 2) this.mouse.rightDown = false;
        });
        
        this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    setupGamepad() {
        window.addEventListener('gamepadconnected', () => {
            this.controller.connected = true;
        });

        window.addEventListener('gamepaddisconnected', () => {
            this.controller.connected = false;
            this.resetControllerState();
        });
    }

    resetControllerState() {
        this.controller.connected = false;
        this.controller.leftStick.x = 0;
        this.controller.leftStick.y = 0;
        this.controller.rightStick.x = 0;
        this.controller.rightStick.y = 0;
        this.controller.buttons.a = false;
        this.controller.buttons.start = false;
        this.controller.buttons.back = false;
        this.controller.buttons.leftTrigger = false;
        this.controller.buttons.leftTriggerValue = 0;
        this.controller.buttons.leftBumper = false;
        this.controller.buttons.rightBumper = false;
        this.previousControllerButtons.start = false;
        this.previousControllerButtons.back = false;
        this.previousControllerButtons.leftBumper = false;
        this.previousControllerButtons.rightBumper = false;
    }

    toggleDebugUI() {
        if (!this.debugUI) return;
        this.debugUIVisible = !this.debugUIVisible;
        this.debugUI.style.display = this.debugUIVisible ? 'block' : 'none';
    }

    updateControlScheme(activeScheme) {
        if (!this.controlUI.keyboard || !this.controlUI.controller) {
            return;
        }

        if (activeScheme === 'controller') {
            this.controlUI.keyboard.style.display = 'none';
            this.controlUI.controller.style.display = 'block';
        } else {
            this.controlUI.keyboard.style.display = 'block';
            this.controlUI.controller.style.display = 'none';
        }
    }

    applyDeadZone(value, deadZone = this.controllerDeadZone) {
        if (Math.abs(value) < deadZone) {
            return 0;
        }
        const adjusted = (Math.abs(value) - deadZone) / (1 - deadZone);
        return Math.sign(value) * adjusted;
    }

    pollGamepad() {
        if (typeof navigator === 'undefined' || !navigator.getGamepads) {
            this.resetControllerState();
            return;
        }

        const getGamepads = navigator.getGamepads ? navigator.getGamepads() : [];
        let activePad = null;

        for (const pad of getGamepads) {
            if (pad) {
                activePad = pad;
                if (pad.mapping === 'standard') {
                    break;
                }
            }
        }

        if (!activePad) {
            this.resetControllerState();
            return;
        }

        this.controller.connected = true;
        this.updateControlScheme('controller');

        const leftX = this.applyDeadZone(activePad.axes[0] ?? 0);
        const leftY = this.applyDeadZone(activePad.axes[1] ?? 0);
        const rightX = this.applyDeadZone(activePad.axes[2] ?? 0);
        const rightY = this.applyDeadZone(activePad.axes[3] ?? 0);

        this.controller.leftStick.x = clamp(leftX, -1, 1);
        this.controller.leftStick.y = clamp(leftY, -1, 1);
        this.controller.rightStick.x = clamp(rightX, -1, 1);
        this.controller.rightStick.y = clamp(rightY, -1, 1);

        const aPressed = Boolean(activePad.buttons[0]?.pressed);
        const startPressed = Boolean(activePad.buttons[9]?.pressed);
        const backPressed = Boolean(activePad.buttons[8]?.pressed);
        const leftTriggerValue = activePad.buttons[6]?.value ?? 0;
        const leftTriggerPressed = Boolean(activePad.buttons[6]?.pressed) || leftTriggerValue > 0.4;
        const leftBumperPressed = Boolean(activePad.buttons[4]?.pressed);
        const rightBumperPressed = Boolean(activePad.buttons[5]?.pressed);

        this.controller.buttons.a = aPressed;
        this.controller.buttons.start = startPressed;
        this.controller.buttons.back = backPressed;
        this.controller.buttons.leftTrigger = leftTriggerPressed;
        this.controller.buttons.leftTriggerValue = clamp(leftTriggerValue, 0, 1);
        this.controller.buttons.leftBumper = leftBumperPressed;
        this.controller.buttons.rightBumper = rightBumperPressed;

        if (startPressed && !this.previousControllerButtons.start) {
            this.togglePause();
        }

        if (backPressed && !this.previousControllerButtons.back) {
            this.toggleDebugUI();
        }

        this.previousControllerButtons.start = startPressed;
        this.previousControllerButtons.back = backPressed;
        this.previousControllerButtons.leftBumper = leftBumperPressed;
        this.previousControllerButtons.rightBumper = rightBumperPressed;
    }

    togglePause() {
        this.gameState = this.gameState === 'playing' ? 'paused' : 'playing';
        this.pauseScreen.style.display = this.gameState === 'paused' ? 'flex' : 'none';
    }
    
    restart() {
        this.world = new World();
        const spawn = this.world.getSpawnPoint();
        this.player = new Player(spawn.x, spawn.y);
        this.camera.x = 0;
        this.camera.y = 0;
        this.gameState = 'playing';
        this.pauseScreen.style.display = 'none';
    }
    
    start() {
        this.gameLoop(0);
    }
    
    gameLoop(currentTime) {
        // Calculate delta time
        const deltaTime = currentTime - this.lastTime;
        this.lastTime = currentTime;
        
        // Cap the delta time to prevent spiral of death
        const cappedDeltaTime = Math.min(deltaTime, this.frameInterval * 2);
        
        // Add to accumulator
        this.accumulator += cappedDeltaTime;

        // Poll controller each frame for responsive input even while paused
        this.pollGamepad();

        // Fixed timestep updates
        while (this.accumulator >= this.frameInterval) {
            if (this.gameState === 'playing') {
                this.update(this.fixedTimeStep);
            }
            this.accumulator -= this.frameInterval;
        }
        
        // Render at display refresh rate
        this.render();
        requestAnimationFrame((time) => this.gameLoop(time));
    }
    
    update(deltaTime) {
        // Update player
        this.player.update(deltaTime, this.keys, this.mouse, this.controller, this.world, this.camera);
        
        // Update camera to follow player
        this.camera.follow(this.player, this.world);
        
        // Update world
        this.world.update(deltaTime, this.player.x);
        
        // Update debug info
        this.updateDebugInfo();
    }
    
    updateDebugInfo() {
        const worldMouseX = this.mouse.x + this.camera.x;
        const worldMouseY = this.mouse.y + this.camera.y;
        const actualFPS = Math.round(1000 / this.accumulator) || 0;
        
        const playerChunk = Math.floor(this.player.x / this.world.chunkSize);
        const generatedChunks = this.world.generatedChunks.size;
        const playerBiome = this.world.getBiomeAt(this.player.x);

        this.debugInfo.innerHTML = `
            Player: (${Math.round(this.player.x)}, ${Math.round(this.player.y)})<br>
            Velocity: (${Math.round(this.player.vx)}, ${Math.round(this.player.vy)})<br>
            Mouse: (${Math.round(worldMouseX)}, ${Math.round(worldMouseY)})<br>
            Camera: (${Math.round(this.camera.x)}, ${Math.round(this.camera.y)})<br>
            FPS: ${actualFPS} (Target: ${this.targetFPS})<br>
            Chunk: ${playerChunk} | Generated: ${generatedChunks}<br>
            Biome: ${playerBiome}
        `;
    }
    
    render() {
        // Clear canvas with night sky gradient
        const gradient = this.ctx.createLinearGradient(0, 0, 0, this.canvas.height);
        gradient.addColorStop(0, '#1a1a2e');
        gradient.addColorStop(0.5, '#16213e');
        gradient.addColorStop(1, '#0f0f23');
        this.ctx.fillStyle = gradient;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Draw stars
        this.drawStars();

        // Draw distant skyline silhouettes
        this.drawSkyline();
        
        // Save context for camera transform
        this.ctx.save();
        this.ctx.translate(-this.camera.x, -this.camera.y);
        
        // Render world
        this.world.render(this.ctx, this.camera, this.player);
        
        // Render player
        this.player.render(this.ctx);
        
        // Restore context
        this.ctx.restore();
    }

    drawStars() {
        this.ctx.fillStyle = '#ffffff';
        for (let i = 0; i < 100; i++) {
            const x = (i * 137.5) % this.canvas.width;
            const y = (i * 199.7) % this.canvas.height;
            const size = Math.sin(i) * 2 + 1;
            this.ctx.fillRect(x, y, size, size);
        }
    }

    drawSkyline() {
        const ctx = this.ctx;
        const horizonY = this.canvas.height * 0.75;

        ctx.save();

        // Castle silhouette on hill
        const castleBaseX = this.canvas.width * 0.32;
        const castleBaseY = horizonY - 60;
        const castleWidth = 200;
        const castleHeight = 110;
        ctx.fillStyle = '#11131d';
        ctx.fillRect(castleBaseX, castleBaseY - castleHeight, castleWidth, castleHeight);

        // Castle towers
        const towerWidth = 34;
        const towerHeight = 160;
        const spacing = 48;
        for (let i = 0; i <= 4; i++) {
            const towerX = castleBaseX + i * spacing;
            if (towerX < castleBaseX || towerX > castleBaseX + castleWidth) {
                continue;
            }
            const extraHeight = (i % 2 === 0) ? 30 : 0;
            ctx.fillRect(towerX, castleBaseY - towerHeight - extraHeight, towerWidth, towerHeight + extraHeight);

            // Tower spires
            const spireHeight = 26 + extraHeight * 0.4;
            ctx.beginPath();
            ctx.moveTo(towerX, castleBaseY - towerHeight - extraHeight);
            ctx.lineTo(towerX + towerWidth / 2, castleBaseY - towerHeight - extraHeight - spireHeight);
            ctx.lineTo(towerX + towerWidth, castleBaseY - towerHeight - extraHeight);
            ctx.closePath();
            ctx.fill();
        }

        // Battlements
        const merlonCount = 6;
        const merlonWidth = castleWidth / merlonCount;
        const merlonHeight = 14;
        for (let i = 0; i < merlonCount; i++) {
            ctx.fillRect(castleBaseX + i * merlonWidth + 2, castleBaseY - castleHeight - merlonHeight, merlonWidth - 4, merlonHeight);
        }

        

        // Volcano silhouette on the right
        const volcanoBaseX = this.canvas.width * 0.72;
        const volcanoBaseY = horizonY - 10;
        const volcanoWidth = 800;
        const volcanoHeight = 440;

        // Volcano glow and ash plume
        const craterX = volcanoBaseX + volcanoWidth * 0.5;
        const craterY = volcanoBaseY - volcanoHeight + 50;
        const ashGradient = ctx.createLinearGradient(craterX, craterY, craterX, craterY - 180);
        ashGradient.addColorStop(0, 'rgba(143, 123, 121, 0.55)');
        ashGradient.addColorStop(1, 'rgba(102, 80, 80, 0)');
        ctx.fillStyle = ashGradient;
        ctx.beginPath();
        ctx.moveTo(craterX - 45, craterY);
        ctx.bezierCurveTo(
            craterX - 30,
            craterY - 60,
            craterX - 60,
            craterY - 150,
            craterX - 120,
            craterY - 180
        );
        ctx.lineTo(craterX + 120, craterY - 180);
        ctx.bezierCurveTo(
            craterX + 60,
            craterY - 150,
            craterX + 30,
            craterY - 60,
            craterX + 45,
            craterY
        );
        ctx.closePath();
        ctx.fill();

        // Ash particles
        ctx.fillStyle = 'rgba(170, 170, 190, 0.25)';
        for (let i = 0; i < 40; i++) {
            const offsetX = (Math.random() - 0.5) * 90;
            const offsetY = -Math.random() * 160;
            const size = Math.random() * 4 + 1;
            ctx.beginPath();
            ctx.ellipse(craterX + offsetX, craterY + offsetY, size * 0.6, size, Math.random() * Math.PI, 0, Math.PI * 2);
            ctx.fill();
        }

        // Draw volcano mountain
        ctx.fillStyle = '#151822';
        ctx.beginPath();
        ctx.moveTo(volcanoBaseX, volcanoBaseY);
        ctx.lineTo(volcanoBaseX + volcanoWidth * 0.5, volcanoBaseY - volcanoHeight);
        ctx.lineTo(volcanoBaseX + volcanoWidth, volcanoBaseY);
        ctx.closePath();
        ctx.fill();

        // Distant hills silhouette
        const hillGradient = ctx.createLinearGradient(0, horizonY - 140, 0, this.canvas.height);
        hillGradient.addColorStop(0, 'rgba(20, 24, 34, 0.9)');
        hillGradient.addColorStop(1, 'rgba(10, 11, 18, 1)');
        ctx.fillStyle = hillGradient;
        ctx.beginPath();
        ctx.moveTo(0, this.canvas.height);
        ctx.lineTo(0, horizonY);
        ctx.bezierCurveTo(
            this.canvas.width * 0.2,
            horizonY - 90,
            this.canvas.width * 0.35,
            horizonY - 60,
            this.canvas.width * 0.45,
            horizonY - 70
        );
        ctx.bezierCurveTo(
            this.canvas.width * 0.65,
            horizonY - 20,
            this.canvas.width * 0.8,
            horizonY - 40,
            this.canvas.width,
            horizonY - 10
        );
        ctx.lineTo(this.canvas.width, this.canvas.height);
        ctx.closePath();
        ctx.fill();

        ctx.restore();
    }
}

const ALLOMANCY_PUSH_COLORtemp = '#24c0f0';
const ALLOMANCY_PULL_COLORtemp = '#ce2071';
const ALLOMANCY_AIM_COLORtemp  = '#c4d9ff';
const ALLOMANCY_PUSH_COLOR = [36, 192, 240];
const ALLOMANCY_PULL_COLOR = [206, 32, 113];
const ALLOMANCY_AIM_COLOR  = [196, 217, 255];
const ALLOMANCY_STRENGTH_PROFILES = {
    normal: { dashLength: 5, baseAlpha: 0.65 },
    shift:  { dashLength: 10, baseAlpha: 0.8 },
    launch: { dashLength: 15, baseAlpha: 0.9 }
};
const ALLOMANCY_GAP_MIN = 3;
const ALLOMANCY_GAP_MAX = 15;
const ALLOMANCY_DISTANCE_FADE = 0.75;

const BUILDING_WINDOW_STYLES = {
    default: {
        windowWidth: 16,
        windowHeight: 22,
        marginX: 12,
        marginTop: 18,
        marginBottom: 16,
        minColumns: 2,
        maxColumns: 3,
        minRows: 2,
        maxRows: 4,
        horizontalSpacing: 14,
        verticalSpacing: 24,
        windowColor: '#444',
        frameColor: '#2b2b2cff',
        randomOmissions: 0
    },
    slums: {
        windowWidth: 12,
        windowHeight: 20,
        marginX: 10,
        marginTop: 14,
        marginBottom: 14,
        minColumns: 1,
        maxColumns: 4,
        minRows: 1,
        maxRows: 6,
        horizontalSpacing: 10,
        verticalSpacing: 22,
        windowColor: '#494942ff',
        frameColor: '#24211cff',
        randomOmissions: 0.3
    },
    noble_housing: {
        windowWidth: 18,
        windowHeight: 28,
        marginX: 16,
        marginTop: 20,
        marginBottom: 18,
        minColumns: 2,
        maxColumns: 3,
        minRows: 2,
        maxRows: 5,
        horizontalSpacing: 18,
        verticalSpacing: 26,
        windowColor: '#515868ff',
        frameColor: '#3a2923ff',
        randomOmissions: 0.025
    },
    town_square: {
        windowWidth: 20,
        windowHeight: 22,
        marginX: 12,
        marginTop: 16,
        marginBottom: 18,
        minColumns: 2,
        maxColumns: 4,
        minRows: 1,
        maxRows: 3,
        horizontalSpacing: 12,
        verticalSpacing: 16,
        windowColor: '#3b4653ff',
        frameColor: '#2c251cff',
        randomOmissions: 0
    },
    marketplace: {
        windowWidth: 24,
        windowHeight: 24,
        marginX: 6,
        marginTop: 18,
        marginBottom: 12,
        minColumns: 2,
        maxColumns: 2,
        minRows: 1,
        maxRows: 1,
        horizontalSpacing: 4,
        verticalSpacing: 0,
        windowColor: '#706650ff',
        frameColor: '#2c2a23ff',
        randomOmissions: 0
    },
    grand_keep: {
        windowWidth: 18,
        windowHeight: 30,
        marginX: 18,
        marginTop: 26,
        marginBottom: 24,
        minColumns: 3,
        maxColumns: 4,
        minRows: 3,
        maxRows: 6,
        horizontalSpacing: 14,
        verticalSpacing: 26,
        windowColor: '#54666eff',
        frameColor: '#2b2b2cff',
        randomOmissions: 0.02
    }
};

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function randomInRange(range, fallback = 0) {
    if (!range || !Array.isArray(range)) {
        return fallback;
    }
    const [min, max] = range;
    if (max === undefined) {
        return min ?? fallback;
    }
    return min + Math.random() * (max - min);
}

function randomIntInRange(range, fallback = 0) {
    const value = randomInRange(range, fallback);
    return Math.round(value);
}

const BUILDING_TYPES = {
    default: {
        buildingColor: '#3f4041ff',
        windowColor: '#444444ff',
        widthRange: [80, 110],
        heightRange: [200, 320],
        windowStyleKey: 'default',
        attachMetals: true
    },
    slum_shack: {
        buildingColor: '#3a3833ff',
        windowColor: '#494942ff',
        widthRange: [72, 100],
        heightRange: [120, 360],
        windowStyleKey: 'slums',
        attachMetals: true
    },
    noble_estate: {
        buildingColor: '#4b3434ff',
        windowColor: '#515868ff',
        widthRange: [120, 160],
        heightRange: [280, 420],
        windowStyleKey: 'noble_housing',
        attachMetals: true,
        extras: {
            rooftop: {
                color: "#3d2a2aff",
                platform: true,
                overhang: 12,
                thickness: 10,
                verticalOffset: 0,
            }
        }
    },
    town_square_hall: {
        buildingColor: '#443a2eff',
        windowColor: '#3b4653ff',
        widthRange: [140, 160],
        heightRange: [100, 140],
        windowStyleKey: 'town_square',
        attachMetals: true
    },
    marketplace_stall: {
        buildingColor: '#534633ff',
        windowColor: '#706650ff',
        widthRange: [64, 96],
        heightRange: [48, 64],
        windowStyleKey: 'marketplace',
        attachMetals: true
    },
    keep_tower: {
        buildingColor: '#3f4246ff',
        windowColor: '#54666eff',
        widthRange: [160, 200],
        heightRange: [540, 720],
        windowStyleKey: 'grand_keep',
        attachMetals: true,
        extras: {
            rooftop: {
                color: "#373a3dff",
                platform: true,
                overhang: 20,
                thickness: 20,
                verticalOffset: 0,
            }
        }
    }
};

const BIOME_CONFIGS = {
    slums: {
        temperature: 0,
        repeatability: 2,
        buildingTypes: ['slum_shack'],
        buildingCountRange: [3, 5],
        spacingRange: [20, 50],
        edgePaddingRange: [6, 20],
        streetLampSpacingRange: [150, 220],
        streetLampHeightRange: [110, 150],
        streetLampChance: 0.33,
        manholeChance: 0.8,
        manholeCountRange: [1, 3],
        treeChance: 0.2,
        treeCountRange: [0, 2]
    },
    noble_housing: {
        temperature: 0.7,
        repeatability: 1,
        buildingTypes: ['noble_estate'],
        buildingCountRange: [2, 3],
        spacingRange: [60, 110],
        edgePaddingRange: [40, 70],
        streetLampSpacingRange: [200, 260],
        streetLampHeightRange: [140, 180],
        streetLampChance: 2,
        manholeChance: 0.2,
        manholeCountRange: [1, 2],
        treeChance: 0.3,
        treeCountRange: [0, 3]
    },
    town_square: {
        temperature: 0.5,
        repeatability: 0,
        buildingTypes: ['town_square_hall'],
        buildingCountRange: [1, 1],
        spacingRange: [0, 0],
        edgePaddingRange: [120, 120],
        streetLampSpacingRange: [140, 200],
        streetLampHeightRange: [80, 120],
        streetLampChance: 1.5,
        manholeChance: 0.35,
        manholeCountRange: [0, 2],
        treeChance: 1,
        treeCountRange: [4, 6]
    },
    marketplace: {
        temperature: 0.3,
        repeatability: 1,
        buildingTypes: ['marketplace_stall'],
        buildingCountRange: [4, 6],
        spacingRange: [0, 40],
        edgePaddingRange: [25, 40],
        streetLampSpacingRange: [130, 180],
        streetLampHeightRange: [80, 100],
        streetLampChance: 0.85,
        manholeChance: 0.45,
        manholeCountRange: [1, 3],
        treeChance: 0.6,
        treeCountRange: [1, 5]
    },
    grand_keep: {
        temperature: 1,
        repeatability: 0,
        buildingTypes: ['keep_tower'],
        buildingCountRange: [1, 2],
        spacingRange: [120, 160],
        edgePaddingRange: [80, 100],
        streetLampSpacingRange: [220, 260],
        streetLampHeightRange: [180, 220],
        streetLampChance: 0.6,
        manholeChance: 0.15,
        manholeCountRange: [0, 1],
        treeChance: 0.6,
        treeCountRange: [2, 4]
    },
    default: {
        temperature: 0.5,
        repeatability: 1,
        buildingTypes: ['default'],
        buildingCountRange: [3, 4],
        spacingRange: [40, 80],
        edgePaddingRange: [30, 50],
        streetLampSpacingRange: [150, 210],
        streetLampHeightRange: [130, 160],
        streetLampChance: 0.8,
        manholeChance: 0.3,
        manholeCountRange: [0, 2]
    }
};

function computeAllomancyLineParams(strengthLevel, distanceRatio, baseColor, strengthFactor = 1, fadeFactor = 1) {
    const profile = ALLOMANCY_STRENGTH_PROFILES[strengthLevel] || ALLOMANCY_STRENGTH_PROFILES.normal;
    const normalizedDistance = clamp(distanceRatio, 0, 1);
    const dashLength = profile.dashLength;
    const gapLength = ALLOMANCY_GAP_MIN + (ALLOMANCY_GAP_MAX - ALLOMANCY_GAP_MIN) * normalizedDistance;

    const strengthContribution = 0.7 + 0.3 * clamp(strengthFactor, 0.1, 3);
    const distanceContribution = 1 - (normalizedDistance * ALLOMANCY_DISTANCE_FADE);
    const rawAlpha = profile.baseAlpha * strengthContribution * distanceContribution * fadeFactor;
    const minAlpha = 0.08 * fadeFactor;
    const alpha = clamp(rawAlpha, minAlpha, 1);

    return {
        strokeStyle: `rgba(${baseColor[0]}, ${baseColor[1]}, ${baseColor[2]}, ${alpha})`,
        dash: [dashLength, gapLength]
    };
}

// Player class representing Vin
class Player {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.vx = 0;
        this.vy = 0;
        this.width = 20;
        this.height = 32;
        this.onGround = false;
        this.facing = 1; // 1 for right, -1 for left

        // Physics
        this.gravity = 600;
        this.maxSpeedX = 260;
        this.maxSpeedY = 260;
        this.jumpPower = -300;
        this.acceleration = 1000;
        this.groundFriction = 0.85;
        this.airFriction = 0.95;
        
        // Allomancy
        this.steelTarget = null;
        this.ironTarget = null;
        this.allomancyStrength = 0;
        this.allomancyRange = 150;

        // Advanced allomancy movement
        this.airAllomancyForce = 750;
        this.shiftAllomancyMultiplier = 1.4;
        this.burstImpulse = 900;
        this.burstCooldownDuration = 2;
        this.burstCooldownRemaining = 0;
        this.previousSpaceDown = false;
        this.activeAirMetals = [];
        this.airAllomancyStrengthLevel = 'none';
        this.airAllomancyStrengthValue = 0;
        this.lingeringAllomancyLines = [];
        this.currentAllomancyShift = false;
        this.targetedMetal = null;
        this.targeterSource = null;
        this.targeterStrengthLevel = 'none';
        this.targeterStrengthValue = 0;
        this.windRushes = [];
        this.hasJumpedSinceGround = false;
        this.jumpForgivenessPixels = 6;
        this.tassels = [
            { offsetY: 0, lengths: [14, 12], points: [], base: { x: this.x, y: this.y } },
            { offsetY: 2, lengths: [12, 10], points: [], base: { x: this.x, y: this.y } },
            { offsetY: 4, lengths: [10, 8], points: [], base: { x: this.x, y: this.y } }
        ];
        this.airAllomancyDirection = null;
        this.tiltAngle = 0;
    }
    
    update(deltaTime, keys, mouse, controller, world, camera) {
        this.updateCooldowns(deltaTime);
        this.updateLingeringLines(deltaTime);
        this.updateWindRushes(deltaTime);
        this.activeAirMetals = [];
        this.airAllomancyStrengthLevel = 'none';
        this.airAllomancyStrengthValue = 0;
        this.targetedMetal = null;
        this.targeterSource = null;
        this.targeterStrengthLevel = 'none';
        this.targeterStrengthValue = 0;
        // Handle movement
        this.handleMovement(deltaTime, keys, controller, world);
        
        // Handle allomancy
        this.handleAllomancy(mouse, controller, world, camera);
        
        // Apply physics
        this.applyPhysics(deltaTime);
        
        // Check collisions with world
        this.checkCollisions(world);

        this.updateTilt(deltaTime, world);
    }

    updateCooldowns(deltaTime) {
        if (this.burstCooldownRemaining > 0) {
            this.burstCooldownRemaining = Math.max(0, this.burstCooldownRemaining - deltaTime);
        }
    }

    updateLingeringLines(deltaTime) {
        if (!this.lingeringAllomancyLines.length) {
            return;
        }

        this.lingeringAllomancyLines = this.lingeringAllomancyLines.filter(line => {
            line.age += deltaTime;
            return line.age < line.duration;
        });
    }

    updateWindRushes(deltaTime) {
        if (!this.windRushes.length) {
            return;
        }

        this.windRushes = this.windRushes.filter(rush => {
            rush.age += deltaTime;
            const progress = rush.age / rush.duration;
            const decay = 1 - Math.min(progress, 1);
            rush.x += rush.dirX * rush.speed * deltaTime;
            rush.y += rush.dirY * rush.speed * 0.35 * deltaTime;
            rush.currentWidth = rush.baseWidth * (0.5 + decay * 0.5);
            rush.currentLength = rush.baseLength * (0.7 + decay * 0.6);
            return rush.age < rush.duration;
        });
    }

    updateTilt(deltaTime, world) {
        let target = this.vx / this.maxSpeedX * 0.2;

        if (!this.onGround && this.vy > 300 && world?.isNearSurface(this, 70)) {
            target *= -1
        }

        target = clamp(target, -0.6, 0.6);
        const lerp = Math.min(1, deltaTime * 10);
        this.tiltAngle += (target - this.tiltAngle) * lerp;
    }
    
    handleMovement(deltaTime, keys, controller, world) {
        const leftStick = controller?.leftStick || { x: 0, y: 0 };
        const buttons = controller?.buttons || {};

        const keyInputX = (keys['KeyD'] ? 1 : 0) - (keys['KeyA'] ? 1 : 0);
        const keyInputY = (keys['KeyS'] ? 1 : 0) - (keys['KeyW'] ? 1 : 0);

        const stickInputX = clamp(leftStick.x || 0, -1, 1);
        const stickInputY = clamp(leftStick.y || 0, -1, 1);

        const combinedX = clamp(keyInputX + stickInputX, -1, 1);
        const combinedY = clamp(keyInputY + stickInputY, -1, 1);

        const shiftActive = Boolean(keys['ShiftLeft'] || keys['ShiftRight'] || buttons.leftTrigger);
        const spacePressed = Boolean(keys['Space'] || buttons.a);
        const justPressedSpace = spacePressed && !this.previousSpaceDown;

        this.currentAllomancyShift = shiftActive;

        if (this.onGround) {
            if (Math.abs(combinedX) > 0.1) {
                this.vx += combinedX * this.acceleration * deltaTime;
                this.facing = combinedX > 0 ? 1 : -1;
            } else {
                this.vx *= this.groundFriction;
            }

            this.vx = clamp(this.vx, -this.maxSpeedX, this.maxSpeedX);

            if (justPressedSpace) {
                this.vy = this.jumpPower;
                this.onGround = false;
                this.hasJumpedSinceGround = true;
            }
        } else {
            
            if (justPressedSpace) {
                if (this.canUseJumpForgiveness(world)) {
                    this.vy = this.jumpPower;
                    this.hasJumpedSinceGround = true;
                    this.onGround = false;
                } else {
                    this.tryAllomancyBurst(combinedX, combinedY, shiftActive, world);
                }
            }
            
            if (Math.abs(combinedX) < 0.1) {
                this.vx *= this.airFriction;
            }
        }
        
        this.handleAirDirectionalAllomancy(deltaTime, combinedX, combinedY, shiftActive, world);

        if (!this.onGround && Math.abs(this.vx) > 2) {
            this.facing = this.vx > 0 ? 1 : -1;
        }

        this.updateTassels(deltaTime);

        this.previousSpaceDown = spacePressed;
    }

    handleAirDirectionalAllomancy(deltaTime, inputX, inputY, shiftActive, world) {
        this.activeAirMetals = [];
        const directionLength = Math.hypot(inputX, inputY);
        if (directionLength === 0) {
            this.airAllomancyDirection = null;
            return;
        }

        const metals = this.getNearbyMetals(world, 5);
        if (!metals.length) {
            this.airAllomancyDirection = null;
            return;
        }

        const influence = this.calculateMetalInfluence(metals);
        if (influence <= 0) {
            this.airAllomancyDirection = null;
            return;
        }

        const dirX = inputX / directionLength;
        const dirY = inputY / directionLength;
        const strengthValue = shiftActive ? this.shiftAllomancyMultiplier : 1;
        const force = this.airAllomancyForce * influence * strengthValue;

        this.vx += dirX * force * deltaTime;
        this.vy += dirY * force * deltaTime;

        this.airAllomancyDirection = { x: dirX, y: dirY };

        const speedLimitMultiplier = shiftActive ? 2 : 1.5;
        const maxX = this.maxSpeedX * speedLimitMultiplier;
        const maxY = this.maxSpeedY * speedLimitMultiplier;

        this.vx = Math.max(-maxX, Math.min(maxX, this.vx));
        this.vy = Math.max(-maxY, Math.min(maxY, this.vy));

        this.activeAirMetals = metals;
        this.airAllomancyStrengthLevel = shiftActive ? 'shift' : 'normal';
        this.airAllomancyStrengthValue = strengthValue;
    }

    tryAllomancyBurst(inputX, inputY, shiftActive, world) {
        if (this.onGround || this.burstCooldownRemaining > 0) {
            return;
        }

        const baseMetals = this.activeAirMetals.length ? this.activeAirMetals : this.getNearbyMetals(world, 5);
        const metals = baseMetals.slice(0, 5);
        if (!metals.length) {
            return;
        }

        const influence = this.calculateMetalInfluence(metals);
        if (influence <= 0) {
            return;
        }

        let dirX = inputX;
        let dirY = inputY;
        if (dirX === 0 && dirY === 0) {
            dirX = this.facing;
            dirY = -0.4;
        }

        const directionLength = Math.hypot(dirX, dirY);
        if (directionLength === 0) {
            return;
        }

        dirX /= directionLength;
        dirY /= directionLength;

        const shiftMultiplier = shiftActive ? this.shiftAllomancyMultiplier : 1;
        const impulse = this.burstImpulse * influence * shiftMultiplier;

        this.vx += dirX * impulse;
        this.vy += dirY * impulse;

        const burstLimitMultiplier = shiftActive ? 3 : 2.5;
        const maxX = this.maxSpeedX * burstLimitMultiplier;
        const maxY = this.maxSpeedY * burstLimitMultiplier;

        this.vx = Math.max(-maxX, Math.min(maxX, this.vx));
        this.vy = Math.max(-maxY, Math.min(maxY, this.vy));

        this.activeAirMetals = metals;
        this.airAllomancyStrengthLevel = 'launch';
        this.airAllomancyStrengthValue = shiftMultiplier;

        for (const metal of metals) {
            this.lingeringAllomancyLines.push({
                metal,
                age: 0,
                duration: 0.75,
                strengthLevel: 'launch',
                strengthValue: shiftMultiplier,
                isPull: this.isPullingTowardsMetal(metal)
            });
        }

        if (this.lingeringAllomancyLines.length > 20) {
            this.lingeringAllomancyLines = this.lingeringAllomancyLines.slice(-20);
        }

        this.spawnWindRushEffect(dirX, dirY, influence, shiftMultiplier);

        this.burstCooldownRemaining = this.burstCooldownDuration;
    }

    getNearbyMetals(world, limit = null) {
        const metals = world.getNearbyMetalSources(this.x, this.y, this.allomancyRange);
        metals.sort((a, b) => {
            const aDx = a.x - this.x;
            const aDy = a.y - this.y;
            const bDx = b.x - this.x;
            const bDy = b.y - this.y;
            return (aDx * aDx + aDy * aDy) - (bDx * bDx + bDy * bDy);
        });

        if (limit !== null && metals.length > limit) {
            return metals.slice(0, limit);
        }

        return metals;
    }

    calculateMetalInfluence(metals) {
        let contribution = 0;
        for (const metal of metals) {
            const dx = metal.x - this.x;
            const dy = metal.y - this.y;
            const distance = Math.hypot(dx, dy);
            const proximity = 1 - Math.min(distance / this.allomancyRange, 1);
            contribution += Math.max(0, proximity);
        }

        return Math.min(1.5, contribution);
    }

    canUseJumpForgiveness(world) {
        if (this.onGround || this.hasJumpedSinceGround) {
            return false;
        }

        return world.isNearSurface(this, this.jumpForgivenessPixels);
    }

    isPullingTowardsMetal(metal) {
        if (this.ironTarget && this.ironTarget === metal) {
            return true;
        }

        if (!this.activeAirMetals || !this.activeAirMetals.length) {
            return false;
        }

        const dx = metal.x - this.x;
        const dy = metal.y - this.y;
        const dirLength = Math.hypot(this.airAllomancyDirection?.x ?? 0, this.airAllomancyDirection?.y ?? 0);
        const metalDirLength = Math.hypot(dx, dy);

        if (dirLength > 0 && metalDirLength > 0) {
            const normDirX = (this.airAllomancyDirection.x ?? 0) / dirLength;
            const normDirY = (this.airAllomancyDirection.y ?? 0) / dirLength;
            const normMetalX = dx / metalDirLength;
            const normMetalY = dy / metalDirLength;
            const alignment = normDirX * normMetalX + normDirY * normMetalY;
            if (alignment > 0.2) {
                return true;
            }
        }

        return false;
    }

    renderAllomancyArrows(ctx) {
        if (this.ironTarget) {
            this.drawAimArrow(
                ctx, this.getAllomancyTargetDirection(this.ironTarget), 24, 
                ALLOMANCY_PULL_COLOR, 1, 0.4
            );
        } 
        if (this.steelTarget) {
            this.drawAimArrow(
                ctx, this.getAllomancyTargetDirection(this.steelTarget), 24,
                ALLOMANCY_PUSH_COLOR, 1, 0.4
            );
        } 
        if ((!this.ironTarget || !this.steelTarget) && this.targetedMetal) {
            this.drawAimArrow(
                ctx, this.getAllomancyTargetDirection(this.targetedMetal), 24,
                ALLOMANCY_AIM_COLOR, 0.8, 0.2
            );
        }

        if (this.airAllomancyDirection) {
            const len = Math.hypot(this.airAllomancyDirection.x, this.airAllomancyDirection.y);
            if (len > 0.05) {
                const dir = {
                    x: this.airAllomancyDirection.x / len,
                    y: this.airAllomancyDirection.y / len
                };
                this.drawAimArrow(ctx, dir, 32, ALLOMANCY_AIM_COLOR, 1.1);
            }
        }
    }

    drawAimArrow(ctx, direction, orbitRadius, color, scale = 1, opacity = 0.35) {
        const centerX = this.x;
        const centerY = this.y;
        const angle = Math.atan2(direction.y, direction.x);

        const offsetX = direction.x * orbitRadius;
        const offsetY = direction.y * orbitRadius;

        ctx.save();
        ctx.translate(centerX + offsetX, centerY + offsetY);
        ctx.rotate(angle);

        const farPoint = 15 * scale;
        const midPoint = 8 * scale;
        const lowPoint = 4 * scale;
        const halfWidth = 5 * scale;

        ctx.fillStyle = `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${opacity})`;
        ctx.beginPath();
        ctx.moveTo(midPoint, -halfWidth);
        ctx.quadraticCurveTo(farPoint, 0, midPoint, halfWidth);
        ctx.quadraticCurveTo(lowPoint, midPoint*1.2, lowPoint, halfWidth);
        ctx.quadraticCurveTo(midPoint, 0, lowPoint, -halfWidth);
        ctx.quadraticCurveTo(lowPoint, -midPoint*1.2, midPoint, -halfWidth);
        ctx.closePath();
        ctx.fill();

        ctx.restore();
    }

    getAllomancyTargetDirection(target) {

        const dx = target.x - this.x;
        const dy = target.y - this.y;
        const len = Math.hypot(dx, dy);
        if (len === 0) {
            return null;
        }

        return {x: dx / len, y: dy / len};
    }

    updateTassels(deltaTime) {
        const baseShoulderY = this.y - this.height / 2 + 8;
        const speed = Math.hypot(this.vx, this.vy);
        const stiffnessBase = Math.min(0.55, 0.25 + speed / 600);

        let dirX = -(this.vx) - this.facing * 90;
        let dirY = -(this.vy) + 35;
        if (this.airAllomancyDirection) {
            dirX += -this.airAllomancyDirection.x * 70;
            dirY += -this.airAllomancyDirection.y * 50;
        }
        if (Math.abs(dirX) < 1 && Math.abs(dirY) < 1) {
            dirX = -this.facing * 25;
            dirY = 15;
        }

        let dirLen = Math.hypot(dirX, dirY);
        if (dirLen === 0) {
            dirX = -this.facing;
            dirY = 0.2;
            dirLen = 1;
        }
        dirX /= dirLen;
        dirY /= dirLen;

        if (this.facing > 0 && dirX > -0.1) dirX = -0.1;
        if (this.facing < 0 && dirX < 0.1) dirX = 0.1;
        const norm = Math.hypot(dirX, dirY) || 1;
        dirX /= norm;
        dirY /= norm;

        this.tassels.forEach((tassel) => {
            const baseX = this.x - this.facing * (this.width * 0.4);
            const baseY = baseShoulderY + tassel.offsetY;
            tassel.base = { x: baseX, y: baseY };

            if (tassel.points.length !== tassel.lengths.length) {
                tassel.points = tassel.lengths.map((length, index) => ({
                    x: baseX + dirX * length * (index + 1),
                    y: baseY + dirY * length * (index + 1)
                }));
            }

            let prevX = baseX;
            let prevY = baseY;
            tassel.lengths.forEach((length, segIndex) => {
                const point = tassel.points[segIndex];
                const desiredX = prevX + dirX * length;
                const desiredY = prevY + dirY * length + (segIndex + 1) * 2;
                const stiffness = Math.min(0.6, stiffnessBase + segIndex * 0.1);
                point.x += (desiredX - point.x) * stiffness;
                point.y += (desiredY - point.y) * stiffness;

                if (this.facing > 0 && point.x > baseX - 1) {
                    point.x = baseX - 1;
                }
                if (this.facing < 0 && point.x < baseX + 1) {
                    point.x = baseX + 1;
                }

                prevX = point.x;
                prevY = point.y;
            });
        });
    }

    spawnWindRushEffect(dirX, dirY, influence, shiftMultiplier) {
        const baselineLength = 32;
        const baselineWidth = 20;
        const length = baselineLength + influence * 40;
        const width = baselineWidth + shiftMultiplier * 10;
        const speed = 90 + influence * 140;
        const duration = 0.45 + influence * 0.15;

        const reverseX = -dirX;
        const reverseY = -dirY;

        const offsetDistance = 20 + influence * 18;
        const spawnX = this.x + reverseX * offsetDistance;
        const spawnY = this.y + reverseY * offsetDistance;

        this.windRushes.push({
            x: spawnX,
            y: spawnY,
            dirX: reverseX,
            dirY: reverseY,
            baseLength: length,
            baseWidth: width,
            currentLength: length,
            currentWidth: width,
            speed,
            duration,
            age: 0
        });

        if (this.windRushes.length > 10) {
            this.windRushes = this.windRushes.slice(-10);
        }
    }

    findDirectionalMetal(world, direction, minMagnitude) {
        if (!direction) {
            return null;
        }

        const magnitude = Math.hypot(direction.x, direction.y);
        if (magnitude < (minMagnitude ?? 0.2)) {
            return null;
        }

        const dirX = direction.x / magnitude;
        const dirY = direction.y / magnitude;
        let bestMatch = null;
        let bestScore = -Infinity;
        let bestDistance = Infinity;

        for (const metal of world.metalSources) {
            const dx = metal.x - this.x;
            const dy = metal.y - this.y;
            const distance = Math.hypot(dx, dy);
            if (distance > this.allomancyRange || distance === 0) {
                continue;
            }

            const normX = dx / distance;
            const normY = dy / distance;
            const alignment = dirX * normX + dirY * normY;
            if (alignment < 0.45) {
                continue;
            }

            const score = alignment - (distance / this.allomancyRange) * 0.25;

            if (score > bestScore || (Math.abs(score - bestScore) < 1e-6 && distance < bestDistance)) {
                bestScore = score;
                bestDistance = distance;
                bestMatch = { metal, distance, alignment };
            }
        }

        return bestMatch;
    }

    updateTargeter(mouse, controller, world, camera) {
        const rightStick = controller?.rightStick || { x: 0, y: 0 };
        const controllerDirection = { x: rightStick.x, y: rightStick.y };
        const controllerResult = this.findDirectionalMetal(world, controllerDirection, 0.25);

        const worldMouseX = mouse.x + camera.x;
        const worldMouseY = mouse.y + camera.y;
        const mouseDirection = { x: worldMouseX - this.x, y: worldMouseY - this.y };
        const mouseResult = this.findDirectionalMetal(world, mouseDirection, 0.05);

        let chosen = null;
        let source = null;

        if (controllerResult) {
            chosen = controllerResult;
            source = 'controller';
        } else if (mouseResult) {
            chosen = mouseResult;
            source = 'mouse';
        }

        if (chosen) {
            const activeLevel = this.airAllomancyStrengthLevel !== 'none'
                ? this.airAllomancyStrengthLevel
                : (this.currentAllomancyShift ? 'shift' : 'normal');
            const activeValue = this.airAllomancyStrengthLevel !== 'none'
                ? this.airAllomancyStrengthValue
                : (this.currentAllomancyShift ? this.shiftAllomancyMultiplier : 1);

            this.targetedMetal = chosen.metal;
            this.targeterSource = source;
            this.targeterStrengthLevel = activeLevel;
            this.targeterStrengthValue = activeValue;
        } else {
            this.targetedMetal = null;
            this.targeterSource = null;
            this.targeterStrengthLevel = 'none';
            this.targeterStrengthValue = 0;
        }
    }
    
    handleAllomancy(mouse, controller, world, camera) {
        const worldMouseX = mouse.x + camera.x;
        const worldMouseY = mouse.y + camera.y;

        const controllerButtons = controller?.buttons || {};
        const steelInput = Boolean(mouse.leftDown || controllerButtons.rightBumper);
        const ironInput = Boolean(mouse.rightDown || controllerButtons.leftBumper);

        this.updateTargeter(mouse, controller, world, camera);

        // Find closest metal source to the mouse cursor
        let closestMetal = null;
        let closestDistance = Infinity;

        for (const metal of world.metalSources) {
            const dx = metal.x - worldMouseX;
            const dy = metal.y - worldMouseY;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance < this.allomancyRange && distance < closestDistance) {
                closestMetal = metal;
                closestDistance = distance;
            }
        }

        const preferredTarget = this.targetedMetal;
        const steelTargetCandidate = controllerButtons.rightBumper
            ? (preferredTarget || closestMetal)
            : closestMetal;
        const ironTargetCandidate = controllerButtons.leftBumper
            ? (preferredTarget || closestMetal)
            : closestMetal;

        if (steelInput) {
            if (!this.steelTarget || this.steelTarget === null) {
                this.steelTarget = steelTargetCandidate || null;
            } else if (controllerButtons.rightBumper && preferredTarget && this.steelTarget !== preferredTarget) {
                this.steelTarget = preferredTarget;
            }

            if (!this.steelTarget && steelTargetCandidate) {
                this.steelTarget = steelTargetCandidate;
            }

            if (this.steelTarget) {
                const dx = this.steelTarget.x - this.x;
                const dy = this.steelTarget.y - this.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                this.allomancyStrength = Math.max(0.1, 1 - (distance / this.allomancyRange));
            }
        } else {
            this.steelTarget = null;
        }

        if (ironInput) {
            if (!this.ironTarget || this.ironTarget === null) {
                this.ironTarget = ironTargetCandidate || null;
            } else if (controllerButtons.leftBumper && preferredTarget && this.ironTarget !== preferredTarget) {
                this.ironTarget = preferredTarget;
            }

            if (!this.ironTarget && ironTargetCandidate) {
                this.ironTarget = ironTargetCandidate;
            }

            if (this.ironTarget) {
                const dx = this.ironTarget.x - this.x;
                const dy = this.ironTarget.y - this.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                this.allomancyStrength = Math.max(0.1, 1 - (distance / this.allomancyRange));
            }
        } else {
            this.ironTarget = null;
        }

        this.applyAllomancy();
    }
    
    applyAllomancy() {
        const force = this.airAllomancyForce * 2 * this.allomancyStrength;
        
        if (this.steelTarget) {
            // Push away from metal source
            const dx = this.x - this.steelTarget.x;
            const dy = this.y - this.steelTarget.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance > 0) {
                const fx = (dx / distance) * force;
                const fy = (dy / distance) * force;
                this.vx += fx * 0.016;
                this.vy += fy * 0.016;
            }
        }
        
        if (this.ironTarget) {
            // Pull towards metal source
            const dx = this.ironTarget.x - this.x;
            const dy = this.ironTarget.y - this.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance > 0) {
                const fx = (dx / distance) * force;
                const fy = (dy / distance) * force;
                this.vx += fx * 0.016;
                this.vy += fy * 0.016;
            }
        }
    }
    
    applyPhysics(deltaTime) {
        // Apply gravity
        if (!this.onGround) {
            this.vy += this.gravity * deltaTime;
        }

        // Update position
        this.x += this.vx * deltaTime;
        this.y += this.vy * deltaTime;
    }
    
    checkCollisions(world) {
        this.onGround = false;
        
        // Check collision with dynamic ground first
        const groundY = world.getGroundY();
        if (this.y + this.height / 2 >= groundY) {
            this.y = groundY - this.height / 2;
            this.vy = 0;
            this.onGround = true;
            this.hasJumpedSinceGround = false;
        }

        // Check collision with platforms
        const chunkSize = world?.chunkSize ?? 480;
        // Limit collision checks to the current chunk and the chunk we're moving toward
        const currentChunk = Math.floor(this.x / chunkSize);
        const fallbackDirection = (typeof this.facing === 'number' && this.facing < 0) ? -1 : 1;
        const direction = this.vx !== 0 ? Math.sign(this.vx) : fallbackDirection;
        const forwardEdgeX = direction >= 0 ? this.x + this.width / 2 : this.x - this.width / 2;
        const movingChunk = Math.floor(forwardEdgeX / chunkSize);
        const chunkRanges = [];
        const checkedChunks = new Set();

        for (const chunkIndex of [currentChunk, movingChunk]) {
            if (checkedChunks.has(chunkIndex)) {
                continue;
            }

            checkedChunks.add(chunkIndex);
            const chunkStart = chunkIndex * chunkSize;
            chunkRanges.push({ start: chunkStart, end: chunkStart + chunkSize });
        }

        for (const platform of world.platforms) {
            const platformStart = platform.x;
            const platformEnd = platform.x + platform.width;
            const intersectsRelevantChunk = chunkRanges.some(range => platformEnd > range.start && platformStart < range.end);

            if (!intersectsRelevantChunk) {
                continue;
            }

            if (this.checkPlatformCollision(platform)) {
                // Handle collision
                if (this.vy > 0 && this.y - this.height / 2 < platform.y) {
                    this.y = platform.y - this.height / 2;
                    this.vy = 0;
                    this.onGround = true;
                    this.hasJumpedSinceGround = false;
                }
            }
        }
    }
    
    checkPlatformCollision(platform) {
        return this.x + this.width / 2 > platform.x &&
               this.x - this.width / 2 < platform.x + platform.width &&
               this.y + this.height / 2 > platform.y &&
               this.y - this.height / 2 < platform.y + platform.height;
    }
    
    render(ctx) {
        ctx.save();       
        
        // Draw allomancy effects
        if (this.steelTarget) {
            const distance = Math.hypot(this.steelTarget.x - this.x, this.steelTarget.y - this.y);
            const distanceRatio = distance / this.allomancyRange;
            const { strokeStyle, dash } = computeAllomancyLineParams('normal', distanceRatio, ALLOMANCY_PUSH_COLOR, this.allomancyStrength);
            ctx.strokeStyle = strokeStyle;
            ctx.lineWidth = 2;
            ctx.setLineDash(dash);
            ctx.beginPath();
            ctx.moveTo(this.x, this.y);
            ctx.lineTo(this.steelTarget.x, this.steelTarget.y);
            ctx.stroke();
            ctx.setLineDash([]);
        }
        
        if (this.ironTarget) {
            const distance = Math.hypot(this.ironTarget.x - this.x, this.ironTarget.y - this.y);
            const distanceRatio = distance / this.allomancyRange;
            const { strokeStyle, dash } = computeAllomancyLineParams('normal', distanceRatio, ALLOMANCY_PULL_COLOR, this.allomancyStrength);
            ctx.strokeStyle = strokeStyle;
            ctx.lineWidth = 2;
            ctx.setLineDash(dash);
            ctx.beginPath();
            ctx.moveTo(this.x, this.y);
            ctx.lineTo(this.ironTarget.x, this.ironTarget.y);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        if (this.targetedMetal) {
            const distance = Math.hypot(this.targetedMetal.x - this.x, this.targetedMetal.y - this.y);
            const distanceRatio = distance / this.allomancyRange;
            const strengthLevel = this.targeterStrengthLevel === 'none' ? 'normal' : this.targeterStrengthLevel;
            const strengthValue = this.targeterStrengthValue || 1;
            const { strokeStyle, dash } = computeAllomancyLineParams(strengthLevel, distanceRatio, ALLOMANCY_AIM_COLOR, strengthValue, 0.85);
            ctx.strokeStyle = strokeStyle;
            ctx.lineWidth = strengthLevel === 'launch' ? 2 : 1.5;
            ctx.setLineDash(dash);
            ctx.beginPath();
            ctx.moveTo(this.x, this.y);
            ctx.lineTo(this.targetedMetal.x, this.targetedMetal.y);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        if (this.activeAirMetals.length) {
            const strengthLevel = this.airAllomancyStrengthLevel === 'none' ? 'normal' : this.airAllomancyStrengthLevel;
            const strengthValue = this.airAllomancyStrengthValue || 1;
            const baseLineWidth = strengthLevel === 'launch' ? 2.1 : strengthLevel === 'shift' ? 1.75 : 1.5;

            for (const metal of this.activeAirMetals) {
                const distance = Math.hypot(metal.x - this.x, metal.y - this.y);
                const distanceRatio = distance / this.allomancyRange;
                const color = this.isPullingTowardsMetal(metal) ? ALLOMANCY_PULL_COLOR : ALLOMANCY_PUSH_COLOR;
                const { strokeStyle, dash } = computeAllomancyLineParams(strengthLevel, distanceRatio, color, strengthValue);
                ctx.strokeStyle = strokeStyle;
                ctx.lineWidth = baseLineWidth;
                ctx.setLineDash(dash);
                ctx.beginPath();
                ctx.moveTo(this.x, this.y);
                ctx.lineTo(metal.x, metal.y);
                ctx.stroke();
            }
            ctx.setLineDash([]);
        }

        if (this.windRushes.length) {
            for (const rush of this.windRushes) {
                const progress = Math.min(rush.age / rush.duration, 1);
                const alpha = Math.max(0, 0.35 * (1 - progress));
                if (alpha <= 0.01) {
                    continue;
                }

                const angle = Math.atan2(rush.dirY, rush.dirX);
                const length = rush.currentLength;
                const halfWidth = (rush.currentWidth / 2) * (0.65 + 0.35 * (1 - progress));

                ctx.save();
                ctx.translate(rush.x, rush.y);
                ctx.rotate(angle);

                const gradient = ctx.createLinearGradient(0, 0, -length, 0);
                gradient.addColorStop(0, 'rgba(170, 200, 255, 0)');
                gradient.addColorStop(0.6, `rgba(170, 200, 255, ${alpha * 0.6})`);
                gradient.addColorStop(1, `rgba(210, 230, 255, ${alpha})`);

                ctx.fillStyle = gradient;
                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.lineTo(-length * 0.9, halfWidth);
                ctx.quadraticCurveTo(-length * 0.4, 0, -length * 0.9, -halfWidth);
                ctx.closePath();
                ctx.fill();

                ctx.restore();
            }
        }

        if (this.lingeringAllomancyLines.length) {
            for (const line of this.lingeringAllomancyLines) {
                const fade = 1 - (line.age / line.duration);
                const metal = line.metal;
                const distance = Math.hypot(metal.x - this.x, metal.y - this.y);
                const distanceRatio = distance / this.allomancyRange;
                const color = line.isPull ? ALLOMANCY_PULL_COLOR : ALLOMANCY_PUSH_COLOR;
                const { strokeStyle, dash } = computeAllomancyLineParams(line.strengthLevel, distanceRatio, color, line.strengthValue, fade);
                ctx.strokeStyle = strokeStyle;
                ctx.lineWidth = 1.2 + 0.4 * fade;
                ctx.setLineDash(dash);
                ctx.beginPath();
                ctx.moveTo(this.x, this.y);
                ctx.lineTo(metal.x, metal.y);
                ctx.stroke();
            }
            ctx.setLineDash([]);
        }

        this.renderAllomancyArrows(ctx);

        ctx.translate(this.x, this.y);
        ctx.rotate(this.tiltAngle);
        ctx.translate(-this.x, -this.y);

        // Launch Cooldown Aura
        const cooldownRatio = this.burstCooldownDuration > 0 ? this.burstCooldownRemaining / this.burstCooldownDuration : 0;
        const auraStrength = 1 - Math.max(0, Math.min(1, cooldownRatio));
        if (auraStrength < 1) {
            const auraGradient = ctx.createRadialGradient(this.x, this.y, 8, this.x, this.y, 24);
            auraGradient.addColorStop(0, `rgba(120, 160, 255, ${0.22 * auraStrength})`);
            auraGradient.addColorStop(1, 'rgba(120, 160, 255, 0)');
            ctx.fillStyle = auraGradient;
            ctx.beginPath();
            ctx.arc(this.x, this.y, 24, 0, Math.PI * 2);
            ctx.fill();
        }

        // Mistcloak tassels
        ctx.lineCap = 'round';
        ctx.strokeStyle = 'rgba(83, 99, 134, 0.85)';
        ctx.lineWidth = 1.6;
        for (const tassel of this.tassels) {
            if (!tassel.points.length) continue;
            const base = tassel.base || { x: this.x - this.facing*5, y: this.y };
            ctx.beginPath();
            ctx.moveTo(base.x, base.y);
            tassel.points.forEach(point => ctx.lineTo(point.x, point.y));
            ctx.stroke();
        }

        // Draw player (Vin)
        const torsoX = this.x - this.width / 2;
        const torsoY = this.y - this.height / 2;

        // Body
        ctx.fillStyle = '#3b3c46';
        ctx.fillRect(torsoX + this.width * 0.15, torsoY + this.height * 0.22, this.width - this.width * 0.3, this.height * 0.4);

        // Legs
        ctx.beginPath();
        ctx.moveTo(torsoX + this.width * 0.15, torsoY + this.height * 0.60);
        ctx.lineTo(torsoX + this.width * 0.35, torsoY + this.height);
        ctx.lineTo(torsoX + this.width * 0.65, torsoY + this.height);
        ctx.lineTo(torsoX + this.width * 0.85, torsoY + this.height * 0.60);
        ctx.closePath();
        ctx.fill();

        // Head params
        const headWidth = this.width/3
        const headHeight = this.height/4
        const headX = this.x - headWidth/2 + (this.facing * 3);

        // Hood
        ctx.fillStyle = '#2a2b34';
        ctx.beginPath();
        ctx.ellipse(this.x, torsoY + 7, this.width * 0.48, this.height * 0.32, 0, Math.PI, 0, true);
        ctx.roundRect(this.x - headWidth/2, this.y - this.height/2 - 1, headWidth+1, headHeight+1, 3);
        ctx.fill();
        
        // Launch Charged Outline
        if (auraStrength >= 0.999 && this.burstCooldownRemaining <= 0) {
            ctx.strokeStyle = 'rgba(61, 85, 136, 0.65)';
        } else {
            ctx.strokeStyle = 'rgba(38, 54, 87, 0.71)';
        }
        ctx.beginPath();
        ctx.moveTo(torsoX + this.width * 0.15, torsoY + this.height * 0.45);
        ctx.lineTo(torsoX + this.width * 0.15, torsoY + this.height * 0.60);
        ctx.lineTo(torsoX + this.width * 0.35, torsoY + this.height);
        ctx.lineTo(torsoX + this.width * 0.65, torsoY + this.height);
        ctx.lineTo(torsoX + this.width * 0.85, torsoY + this.height * 0.60);
        ctx.lineTo(torsoX + this.width * 0.85, torsoY + this.height * 0.45);
        ctx.moveTo(this.x, torsoY + 7, this.width * 0.48);
        ctx.ellipse(this.x, torsoY + 7, this.width * 0.48, this.height * 0.32, 0, Math.PI, 0, true);
        ctx.lineTo(this.x, torsoY + 7, this.width * 0.48)
        ctx.roundRect(this.x - headWidth/2, this.y - this.height/2 - 1, headWidth+1, headHeight+1, 3);
        ctx.stroke()

        // Face
        ctx.fillStyle = 'rgba(138, 131, 114, 1)';
        ctx.beginPath();
        ctx.roundRect(headX, this.y - this.height/2, headWidth, headHeight, 2);
        ctx.fill();

        ctx.restore();
    }
}

// Camera system
class Camera {
    constructor(width, height) {
        this.width = width;
        this.height = height;
        this.x = 0;
        this.y = 0;
        this.targetX = 0;
        this.targetY = 0;
        this.smoothness = 0.1;
    }
    
    resize(width, height) {
        this.width = width;
        this.height = height;
    }
    
    follow(player, world) {
        this.targetX = player.x - this.width / 2;

        const desiredY = player.y - this.height / 2;
        const groundBottom = world.getGroundY() + world.getGroundHeight();
        const minY = groundBottom - this.height;
        this.targetY = Math.min(desiredY, minY);
        
        // Smooth camera movement
        this.x += (this.targetX - this.x) * this.smoothness;
        this.y += (this.targetY - this.y) * this.smoothness;

        if (this.y > minY) {
            this.y = minY;
        }
    }
}

// World generation and management
class World {
    constructor() {
        this.platforms = [];
        this.metalSources = [];
        this.buildings = [];
        this.streetLamps = [];
        this.groundMetals = [];
        this.trees = [];
        this.chunkBiomes = new Map();
        this.biomes = ['slums', 'noble_housing', 'town_square', 'marketplace', 'grand_keep'];
        
        // World generation tracking
        this.generatedChunks = new Set(); // Track which chunks have been generated
        this.chunkSize = 480; // Size of each world chunk
        this.renderDistance = 3; // How many chunks ahead to generate
        
        this.generateWorld();
    }

    createPlatform({ x, y, width, height, type, biome, attachMetals = false, windowStyleKey = null, buildingTypeKey = null, buildingColor = null, windowColor = null }) {
        const platform = { x, y, width, height, type, biome };

        if (type === 'building') {
            const windowStyle = this.getWindowStyle(windowStyleKey || biome);
            platform.windowStyleKey = windowStyleKey || biome;
            if (windowColor) {
                windowStyle.windowColor = windowColor;
            }
            platform.windowStyle = windowStyle;
            platform.buildingTypeKey = buildingTypeKey;
            platform.buildingColor = buildingColor;
            platform.windowRects = this.generateWindowRects(platform, windowStyle);
            this.buildings.push(platform);
        }

        this.platforms.push(platform);

        if (attachMetals) {
            this.addRoofMetalSources(platform);
        }

        return platform;
    }

    createBuilding(x, width, height, biome, options = {}) {
        const y = this.getGroundY() - height;
        const attachMetals = options.attachMetals !== false;
        const windowStyleKey = options.windowStyleKey || biome;
        const buildingTypeKey = options.buildingTypeKey || null;
        const buildingColor = options.buildingColor || null;
        const windowColor = options.windowColor || null;

        return this.createPlatform({
            x,
            y,
            width,
            height,
            type: 'building',
            biome,
            attachMetals,
            windowStyleKey,
            buildingTypeKey,
            buildingColor,
            windowColor
        });
    }

    addRoofMetalSources(platform) {
        const width = platform.width;
        const height = platform.height;
        const radiusBase = Math.min(width, height) * 0.12;
        let radius = clamp(radiusBase, 4.5, 11);
        const maxRadiusByWidth = Math.max(3.5, (width - 4) / 2);
        radius = clamp(radius, 3.5, maxRadiusByWidth);

        if (!Number.isFinite(radius) || radius < 3.5) {
            radius = Math.max(3.5, maxRadiusByWidth);
        }

        const triangleBase = Math.min(radius * 1.8, width * 0.45);
        const triangleHeight = Math.min(radius * 1.5, platform.height * 0.35);

        const leftCornerX = platform.x;
        const rightCornerX = platform.x + width;
        const cornerY = platform.y;

        const leftTriangle = {
            x: leftCornerX + triangleBase / 3,
            y: cornerY + triangleHeight / 3,
            type: 'metal',
            size: Math.max(triangleBase, triangleHeight) * 0.45,
            shape: 'triangle',
            orientation: 'left',
            base: triangleBase,
            height: triangleHeight,
            cornerX: leftCornerX,
            cornerY,
            sourcePlatform: platform
        };

        const rightTriangle = {
            x: rightCornerX - triangleBase / 3,
            y: cornerY + triangleHeight / 3,
            type: 'metal',
            size: Math.max(triangleBase, triangleHeight) * 0.45,
            shape: 'triangle',
            orientation: 'right',
            base: triangleBase,
            height: triangleHeight,
            cornerX: rightCornerX,
            cornerY,
            sourcePlatform: platform
        };

        this.metalSources.push(leftTriangle, rightTriangle);
    }

    getWindowStyle(key) {
        const base = BUILDING_WINDOW_STYLES[key] || BUILDING_WINDOW_STYLES.default;
        return { ...base };
    }

    generateWindowRects(platform, style) {
        const marginX = style.marginX ?? 12;
        const marginTop = style.marginTop ?? 16;
        const marginBottom = style.marginBottom ?? 16;
        const availableWidth = Math.max(0, platform.width - marginX * 2);
        const availableHeight = Math.max(0, platform.height - marginTop - marginBottom);

        const windowWidth = style.windowWidth ?? 16;
        const horizontalSpacing = style.horizontalSpacing ?? 12;
        const windowHeight = style.windowHeight ?? 22;
        const verticalSpacing = style.verticalSpacing ?? 24;

        const maxColumns = Math.max(1, Math.floor((availableWidth + horizontalSpacing) / Math.max(1, windowWidth + horizontalSpacing)));
        const minColumns = style.minColumns ?? 1;
        const desiredColumns = style.maxColumns ?? maxColumns;
        const columns = clamp(desiredColumns, minColumns, maxColumns);
        const actualColumns = Math.max(minColumns, Math.min(Math.floor(columns), maxColumns));

        const totalWindowWidth = actualColumns * windowWidth;
        const spacingX = actualColumns > 1 ? Math.max(0, (availableWidth - totalWindowWidth) / (actualColumns - 1)) : 0;

        const maxRows = Math.max(1, Math.floor((availableHeight + verticalSpacing) / Math.max(1, windowHeight + verticalSpacing)));
        const minRows = style.minRows ?? 1;
        const desiredRows = style.maxRows ?? maxRows;
        const rows = clamp(desiredRows, minRows, maxRows);
        const actualRows = Math.max(minRows, Math.min(Math.floor(rows), maxRows));

        const totalWindowHeight = actualRows * windowHeight;
        const spacingY = actualRows > 1 ? Math.max(0, (availableHeight - totalWindowHeight) / (actualRows - 1)) : 0;

        const rects = [];
        const omissionChance = clamp(style.randomOmissions ?? 0, 0, 0.9);

        for (let row = 0; row < actualRows; row++) {
            const rowY = platform.y + marginTop + row * (windowHeight + spacingY);
            for (let col = 0; col < actualColumns; col++) {
                const colX = platform.x + marginX + col * (windowWidth + spacingX);

                if (rowY + windowHeight > platform.y + platform.height - marginBottom + 0.1) {
                    continue;
                }

                const omitValue = World.pseudoRandom(platform.x + col * 13.37, platform.y + row * 7.91);
                if (omitValue < omissionChance) {
                    continue;
                }

                rects.push({ x: colX, y: rowY, width: windowWidth, height: windowHeight });
            }
        }

        return rects;
    }

    static pseudoRandom(x, y) {
        const seed = Math.sin((x * 127.1) + (y * 311.7)) * 43758.5453;
        return seed - Math.floor(seed);
    }
    
    generateWorld() {
        this.platforms = [];
        this.metalSources = [];
        this.buildings = [];
        this.streetLamps = [];
        this.groundMetals = [];
        this.trees = [];
        this.chunkBiomes.clear();
        this.generatedChunks.clear();
        
        // Generate initial chunks around spawn
        this.generateChunk(-3, "slums")
        this.generateChunk(-2, "marketplace")
        this.generateChunk(-1, "noble_housing")
        this.generateChunk(0, "grand_keep")
        this.generateChunk(1, "slums")
        this.generateChunk(2, "slums")
        this.generateChunk(3, "town_square")
    }
    
    generateChunkRange(startChunk, endChunk, forced_biome = null) {
        for (let chunkX = startChunk; chunkX <= endChunk; chunkX++) {
            this.generateChunk(chunkX, forced_biome);
        }
    }
    
    generateChunk(chunkX, force_biome = null) {
        const chunkKey = chunkX;
        
        // Skip if already generated
        if (this.generatedChunks.has(chunkKey)) {
            return;
        }
        
        this.generatedChunks.add(chunkKey);
        
        // Select a single biome for this entire chunk
        const biome = force_biome || this.biomes[Math.floor(Math.random() * this.biomes.length)];
        const biomeConfig = BIOME_CONFIGS[biome] || BIOME_CONFIGS.default;
        this.chunkBiomes.set(chunkX, biome);
        
        // Generate buildings in this chunk
        const startX = chunkX * this.chunkSize;
        const endX = startX + this.chunkSize;
        const buildingTypes = (biomeConfig.buildingTypes && biomeConfig.buildingTypes.length)
            ? biomeConfig.buildingTypes
            : BIOME_CONFIGS.default.buildingTypes;

        const edgePadding = randomInRange(biomeConfig.edgePaddingRange, 40);
        const buildingCount = Math.max(1, randomIntInRange(biomeConfig.buildingCountRange, 3));
        const chunkBuildings = [];
        let currentX = startX + edgePadding;

        for (let i = 0; i < buildingCount && currentX < endX - edgePadding; i++) {
            const typeKey = buildingTypes[i % buildingTypes.length];
            const buildingDef = BUILDING_TYPES[typeKey] || BUILDING_TYPES.default;

            const width = randomInRange(buildingDef.widthRange, 90);
            const height = randomInRange(buildingDef.heightRange, 240);

            if (currentX + width > endX - edgePadding) {
                if (i === 0) {
                    currentX = Math.max(startX + edgePadding, endX - edgePadding - width);
                } else {
                    break;
                }
            }

            this.generateBiome(currentX, biome, {
                width,
                height,
                buildingTypeKey: typeKey,
                buildingDefinition: buildingDef
            });

            chunkBuildings.push({ x: currentX, width, height });

            const spacing = Math.max(10, randomInRange(biomeConfig.spacingRange, 50));
            currentX += width + spacing;
        }

        this.placeChunkStreetFeatures(startX, endX, biomeConfig, biome, chunkBuildings);
    }

    positionOverlapsBuilding(x, buildings, buffer = 0) {
        for (const building of buildings) {
            if (x >= building.x - buffer && x <= building.x + building.width + buffer) {
                return true;
            }
        }
        return false;
    }

    hasNearbyGroundMetal(x, radius = 40) {
        for (const feature of this.groundMetals) {
            if (Math.abs(feature.x - x) <= radius) {
                return true;
            }
        }
        return false;
    }

    placeChunkStreetFeatures(startX, endX, biomeConfig, biome, buildings) {
        const groundY = this.getGroundY();

        if (biomeConfig.streetLampSpacingRange) {
            let lampX = startX + randomInRange(biomeConfig.edgePaddingRange, 40);
            const spacingRange = biomeConfig.streetLampSpacingRange;
            const lampChance = biomeConfig.streetLampChance ?? 1;
            let iterations = 0;

            while (lampX < endX - 20 && iterations < 20) {
                if (Math.random() <= lampChance && !this.positionOverlapsBuilding(lampX, buildings, 12)) {
                    this.createStreetLamp(lampX, groundY, biome, biomeConfig);
                }
                lampX += Math.max(40, randomInRange(spacingRange, 180));
                iterations++;
            }
        }

        if (biomeConfig.manholeChance && biomeConfig.manholeChance > 0) {
            const manholeCount = Math.max(0, randomIntInRange(biomeConfig.manholeCountRange, 0));
            let placed = 0;
            let attempts = 0;

            while (placed < manholeCount && attempts < manholeCount * 6) {
                const offset = randomInRange([40, this.chunkSize - 40], this.chunkSize / 2);
                const x = startX + offset;
                const chance = Math.random();
                if (chance <= biomeConfig.manholeChance &&
                    !this.positionOverlapsBuilding(x, buildings, 25) &&
                    !this.hasNearbyGroundMetal(x, 60)) {
                    this.createManhole(x, groundY, biome);
                    placed++;
                }
                attempts++;
            }
        }

        if (biomeConfig.treeChance && biomeConfig.treeChance > 0 && biomeConfig.treeCountRange) {
            this.placeTreesInOpenSpaces(startX, endX, biomeConfig, buildings, biome);
        }
    }

    placeTreesInOpenSpaces(startX, endX, biomeConfig, buildings, biome) {
        const treeChance = Math.max(0, biomeConfig.treeChance ?? 0);
        if (treeChance <= 0) {
            return;
        }

        const sorted = [...buildings].sort((a, b) => a.x - b.x);
        let cursor = startX;
        const gaps = [];

        for (const building of sorted) {
            const gapStart = cursor;
            const gapEnd = building.x;
            if (gapEnd - gapStart > 25) {
                gaps.push({ start: gapStart, end: gapEnd });
            }
            cursor = Math.max(cursor, building.x + building.width);
        }

        if (endX - cursor > 25) {
            gaps.push({ start: cursor, end: endX });
        }

        const groundY = this.getGroundY();

        for (const gap of gaps) {
            const gapWidth = gap.end - gap.start;
            if (gapWidth < 25) continue;

            const maxTreesInGap = Math.max(1, Math.floor(gapWidth / 40));
            let desiredCount = Math.max(0, randomIntInRange(biomeConfig.treeCountRange, 1));
            desiredCount = Math.min(desiredCount, maxTreesInGap);

            for (let i = 0; i < desiredCount; i++) {
                if (Math.random() > treeChance) {
                    continue;
                }

                const margin = 12;
                const x = gap.start + margin + Math.random() * Math.max(1, gapWidth - margin * 2);
                this.createTree(x, groundY, biome);
            }
        }
    }

    createStreetLamp(x, groundY, biome, biomeConfig) {
        const height = Math.max(100, randomInRange(biomeConfig.streetLampHeightRange, 140));
        const lamp = {
            x,
            baseY: groundY,
            height,
            biome
        };
        this.streetLamps.push(lamp);

        const lampHeadHeight = 10;
        this.metalSources.push({
            x,
            y: groundY - height - lampHeadHeight / 2,
            type: 'metal',
            size: 7,
            shape: 'rect',
            width: 18,
            height: 10,
            sourceType: 'streetlamp',
            streetLamp: lamp
        });
    }

    createManhole(x, groundY, biome) {
        const width = 24;
        const height = 6;
        const manhole = {
            x,
            y: groundY,
            width,
            height,
            biome
        };
        this.groundMetals.push(manhole);

        this.metalSources.push({
            x,
            y: manhole.y,
            type: 'metal',
            size: Math.max(width, height) * 0.5,
            shape: 'rect',
            width,
            height,
            sourceType: 'manhole',
            manhole
        });
    }

    createTree(x, groundY, biome) {
        const height = 70 + Math.random() * 80;
        const crownRadius = 16 + Math.random() * 18;
        const trunkWidth = 6 + Math.random() * 3;
        const lean = (Math.random() - 0.5) * 6;
        const tree = {
            x,
            baseY: groundY,
            height,
            crownRadius,
            trunkWidth,
            lean,
            biome
        };
        this.trees.push(tree);
    }
    
    checkAndGenerate(playerX) {
        const playerChunk = Math.floor(playerX / this.chunkSize);
        const minChunk = playerChunk - this.renderDistance;
        const maxChunk = playerChunk + this.renderDistance;
        
        // Generate chunks ahead of the player
        for (let chunkX = minChunk; chunkX <= maxChunk; chunkX++) {
            this.generateChunk(chunkX);
        }
        
        // Clean up chunks that are too far away (optional optimization)
        this.cleanupDistantChunks(playerChunk);
    }
    
    cleanupDistantChunks(playerChunk) {
        const cleanupDistance = this.renderDistance + 10;
        const minKeepChunk = playerChunk - cleanupDistance;
        const maxKeepChunk = playerChunk + cleanupDistance;
        
        // Remove platforms and metal sources from distant chunks
        this.platforms = this.platforms.filter(platform => {
            const platformChunk = Math.floor(platform.x / this.chunkSize);
            return platformChunk >= minKeepChunk && platformChunk <= maxKeepChunk;
        });

        this.buildings = this.buildings.filter(building => {
            const buildingChunk = Math.floor(building.x / this.chunkSize);
            return buildingChunk >= minKeepChunk && buildingChunk <= maxKeepChunk;
        });

        this.metalSources = this.metalSources.filter(metal => {
            const metalChunk = Math.floor(metal.x / this.chunkSize);
            return metalChunk >= minKeepChunk && metalChunk <= maxKeepChunk;
        });

        this.streetLamps = this.streetLamps.filter(lamp => {
            const lampChunk = Math.floor(lamp.x / this.chunkSize);
            return lampChunk >= minKeepChunk && lampChunk <= maxKeepChunk;
        });

        this.groundMetals = this.groundMetals.filter(feature => {
            const featureChunk = Math.floor(feature.x / this.chunkSize);
            return featureChunk >= minKeepChunk && featureChunk <= maxKeepChunk;
        });

        this.trees = this.trees.filter(tree => {
            const treeChunk = Math.floor(tree.x / this.chunkSize);
            return treeChunk >= minKeepChunk && treeChunk <= maxKeepChunk;
        });

        // Remove chunk tracking for cleaned up chunks
        const chunksToRemove = [];
        for (const chunkKey of this.generatedChunks) {
            if (chunkKey < minKeepChunk || chunkKey > maxKeepChunk) {
                chunksToRemove.push(chunkKey);
            }
        }
        
        chunksToRemove.forEach(chunk => {
            this.generatedChunks.delete(chunk);
            this.chunkBiomes.delete(chunk);
        });
    }

    getSpawnPoint() {
        const defaultX = this.chunkSize * 0.5;
        const defaultY = this.getGroundY() - 12;

        let bestPlatform = null;
        let bestDistance = Infinity;
        const targetCenter = this.chunkSize * 0.5;

        for (const platform of this.platforms) {
            if (platform.type !== 'rooftop') continue;

            const centerX = platform.x + platform.width / 2;
            const chunk = Math.floor(centerX / this.chunkSize);
            const intersectsChunkZero = (platform.x < this.chunkSize) && (platform.x + platform.width > 0);

            if (chunk !== 0 && !intersectsChunkZero) {
                continue;
            }

            const distance = Math.abs(centerX - targetCenter);
            if (distance < bestDistance) {
                bestDistance = distance;
                bestPlatform = platform;
            }
        }

        if (!bestPlatform) {
            return { x: defaultX, y: defaultY };
        }

        const spawnX = bestPlatform.x + bestPlatform.width / 2;
        const spawnY = (bestPlatform.y ?? this.getGroundY()) - 12;
        return { x: spawnX, y: spawnY };
    }

    getGroundY() {
        return 600; // Fixed ground level
    }

    getGroundHeight() {
        return 100;
    }

    isPlayerOnGround(playerX, playerY, playerHeight) {
        const groundY = this.getGroundY();
        return playerY + playerHeight / 2 >= groundY;
    }

    getBiomeAt(x) {
        const chunk = Math.floor(x / this.chunkSize);
        return this.chunkBiomes.get(chunk) || 'unknown';
    }

    isNearSurface(player, tolerance = 6, consider_angle = false) {
        const tol = Math.max(0, tolerance);
        const bottom = player.y + player.height / 2;
        const groundY = this.getGroundY();

        if (bottom >= groundY - tol && bottom <= groundY + tol) {
            return true;
        }

        for (const platform of this.platforms) {
            const withinX = (player.x + player.width / 2) > platform.x &&
                            (player.x - player.width / 2) < platform.x + platform.width;
            if (!withinX) {
                continue;
            }

            const surfaceY = platform.y;
            if (bottom >= surfaceY - tol && bottom <= surfaceY + tol) {
                return true;
            }
        }

        return false;
    }

    getNearbyMetalSources(x, y, range) {
        const rangeSq = range * range;
        const metals = [];

        for (const metal of this.metalSources) {
            const dx = metal.x - x;
            const dy = metal.y - y;
            if ((dx * dx + dy * dy) <= rangeSq) {
                metals.push(metal);
            }
        }

        return metals;
    }

    generateBiome(x, biome, options = {}) {
        switch (biome) {
            case 'slums':
                this.generateSlums(x, options);
                break;
            case 'noble_housing':
                this.generateNobleHousing(x, options);
                break;
            case 'town_square':
                this.generateTownSquare(x, options);
                break;
            case 'marketplace':
                this.generateMarketplace(x, options);
                break;
            case 'grand_keep':
                this.generateGrandKeep(x, options);
                break;
        }
    }
    
    generateSlums(x, options = {}) {
        const def = options.buildingDefinition || BUILDING_TYPES.slum_shack;
        const width = Math.max(60, Math.round(options.width ?? randomInRange(def.widthRange, 85)));
        const height = Math.max(140, Math.round(options.height ?? randomInRange(def.heightRange, 240)));
        this.createBuilding(x, width, height, 'slums', {
            attachMetals: def.attachMetals !== false,
            windowStyleKey: def.windowStyleKey,
            buildingTypeKey: options.buildingTypeKey || 'slum_shack',
            buildingColor: def.buildingColor,
            windowColor: def.windowColor
        });
    }
    
    generateNobleHousing(x, options = {}) {
        const def = options.buildingDefinition || BUILDING_TYPES.noble_estate;
        const width = Math.round(options.width ?? randomInRange(def.widthRange, 110));
        const height = Math.round(options.height ?? randomInRange(def.heightRange, 320));
        const building = this.createBuilding(x, width, height, 'noble_housing', {
            attachMetals: def.attachMetals !== false,
            windowStyleKey: def.windowStyleKey,
            buildingTypeKey: options.buildingTypeKey || 'noble_estate',
            buildingColor: def.buildingColor,
            windowColor: def.windowColor
        });

        const roof = def.extras?.rooftop;
        if (building && roof) {
            const rooftopWidth = building.width + (roof.overhang || 0)*2;
            const rooftopHeight = roof.thickness ?? 16;
            const rooftopY = building.y - rooftopHeight + (roof.verticalOffset || 0);
            const rooftopX = building.x - (roof.overhang || 0);
            this.createPlatform({
                x: rooftopX,
                y: rooftopY,
                width: rooftopWidth,
                height: rooftopHeight,
                type: 'rooftop',
                biome: 'noble_housing',
                attachMetals: false
            });
        }
    }
    
    generateTownSquare(x, options = {}) {
        const def = options.buildingDefinition || BUILDING_TYPES.town_square_hall;
        const width = Math.round(options.width ?? randomInRange(def.widthRange, 110));
        const height = Math.round(options.height ?? randomInRange(def.heightRange, 100));
        this.createBuilding(x, width, height, 'town_square', {
            attachMetals: def.attachMetals !== false,
            windowStyleKey: def.windowStyleKey,
            buildingTypeKey: options.buildingTypeKey || 'town_square_hall',
            buildingColor: def.buildingColor,
            windowColor: def.windowColor
        });
    }
    
    generateMarketplace(x, options = {}) {
        const def = options.buildingDefinition || BUILDING_TYPES.marketplace_stall;
        const width = Math.round(options.width ?? randomInRange(def.widthRange, 70));
        const height = Math.round(options.height ?? randomInRange(def.heightRange, 130));
        this.createBuilding(x, width, height, 'marketplace', {
            attachMetals: def.attachMetals !== false,
            windowStyleKey: def.windowStyleKey,
            buildingTypeKey: options.buildingTypeKey || 'marketplace_stall',
            buildingColor: def.buildingColor,
            windowColor: def.windowColor
        });
    }
    
    generateGrandKeep(x, options = {}) {
        const def = options.buildingDefinition || BUILDING_TYPES.keep_tower;
        const width = Math.round(options.width ?? randomInRange(def.widthRange, 170));
        const height = Math.round(options.height ?? randomInRange(def.heightRange, 600));
        const building = this.createBuilding(x, width, height, 'grand_keep', {
            attachMetals: def.attachMetals !== false,
            midLevelMetals: true,
            windowStyleKey: def.windowStyleKey,
            buildingTypeKey: options.buildingTypeKey || 'keep_tower',
            buildingColor: def.buildingColor,
            windowColor: def.windowColor
        });

        // Mid level metal sources
        const metal_width  = 8
        const metal_height = 16
        const placement_x = [x, x + width]
        const placement_y = [height/3, height/3*2]
        for (let x = 0; x < placement_x.length; x++) {
            for (let y = 0; y < placement_y.length; y++) {
                this.metalSources.push({
                    x: placement_x[x],
                    y: placement_y[y],
                    type: 'metal',
                    shape: 'rect',
                    width: metal_width,
                    height: metal_height,
                    sourcePlatform: building,
                });
            }
        }

        const roof = def.extras?.rooftop;
        if (building && roof) {
            const rooftopWidth = building.width + (roof.overhang || 0)*2;
            const rooftopHeight = roof.thickness ?? 16;
            const rooftopY = building.y - rooftopHeight + (roof.verticalOffset || 0);
            const rooftopX = building.x - (roof.overhang || 0);
            this.createPlatform({
                x: rooftopX,
                y: rooftopY,
                width: rooftopWidth,
                height: rooftopHeight,
                type: 'rooftop',
                biome: 'grand_keep',
                attachMetals: true
            });
        }
    }
    
    update(deltaTime, playerX) {
        // Check if we need to generate new chunks based on player position
        this.checkAndGenerate(playerX);
    }
    
    render(ctx, camera, player) {
        // Render dynamic ground that follows the camera
        this.renderGround(ctx, camera);

        this.renderTrees(ctx);

        // Render platforms
        for (const platform of this.platforms) {
            const biomeConfig = BIOME_CONFIGS[platform.biome] || BIOME_CONFIGS.default;
            const defaultTypeKey = Array.isArray(biomeConfig.buildingTypes) ? biomeConfig.buildingTypes[0] : biomeConfig.buildingTypes;
            const typeDef = (platform.buildingTypeKey && BUILDING_TYPES[platform.buildingTypeKey])
                || (defaultTypeKey ? BUILDING_TYPES[defaultTypeKey] : null);
            const buildingColor = platform.buildingColor || typeDef?.buildingColor || '#2a2a2a';

            ctx.fillStyle = buildingColor;
            ctx.fillRect(platform.x, platform.y, platform.width, platform.height);
            
            // Add building details
            if (platform.type === 'building') {
                const windowStyle = platform.windowStyle || {};
                const windows = platform.windowRects || [];
                if (windows.length) {
                    const windowFill = platform.windowColor || windowStyle.windowColor || typeDef?.windowColor || '#444';
                    ctx.fillStyle = windowFill;
                    const frameColor = windowStyle.frameColor ?? null;
                    windows.forEach(rect => {
                        ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
                        if (frameColor) {
                            ctx.strokeStyle = frameColor;
                            ctx.lineWidth = 1;
                            ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
                        }
                    });
                }
            }
        }
        
        this.renderStreetLamps(ctx, player);

        // Render metal sources
        for (const metal of this.metalSources) {
            ctx.save();
            const isTargeted = Boolean(player && player.targetedMetal === metal);
            const baseFill = '#7a7f8b';
            const highlightedFill = '#a9c7ff';
            const fillColor = isTargeted ? highlightedFill : baseFill;
            const baseShadow = 'rgba(118, 150, 255, 0.6)';
            ctx.fillStyle = fillColor;
            ctx.shadowColor = isTargeted ? 'rgba(255, 255, 255, 0.9)' : baseShadow;
            ctx.shadowBlur = isTargeted ? 20 : 10;

            switch (metal.shape) {
                case 'rect': {
                    const width = metal.width ?? (metal.size * 2);
                    const height = metal.height ?? (metal.size * 1.2);
                    const halfW = width / 2;
                    const halfH = height / 2;
                    ctx.beginPath();
                    ctx.rect(metal.x - halfW, metal.y - halfH, width, height);
                    ctx.fill();
                    break;
                }
                case 'triangle': {
                    const cornerX = metal.cornerX ?? metal.x;
                    const cornerY = metal.cornerY ?? metal.y;
                    const base = metal.base ?? (metal.size * 2);
                    const height = metal.height ?? (metal.size * 2);
                    ctx.beginPath();
                    if (metal.orientation === 'right') {
                        ctx.moveTo(cornerX, cornerY);
                        ctx.lineTo(cornerX - base, cornerY);
                        ctx.lineTo(cornerX, cornerY + height);
                    } else {
                        ctx.moveTo(cornerX, cornerY);
                        ctx.lineTo(cornerX + base, cornerY);
                        ctx.lineTo(cornerX, cornerY + height);
                    }
                    ctx.closePath();
                    ctx.fill();
                    break;
                }
                default: {
                    const radius = metal.size ?? 10;
                    ctx.beginPath();
                    ctx.arc(metal.x, metal.y, radius, 0, Math.PI * 2);
                    ctx.fill();
                    break;
                }
            }
            ctx.restore();
        }

        //this.renderManholes(ctx);
    }

    renderGround(ctx, camera) {
        const groundY = this.getGroundY();
        const groundHeight = this.getGroundHeight();

        // Draw ground that extends across the entire visible area
        const leftEdge = camera.x - 100;
        const rightEdge = camera.x + camera.width + 100;
        const groundWidth = rightEdge - leftEdge;

        // Ground base
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(leftEdge, groundY, groundWidth, groundHeight);

        // Add some cobblestone texture
        ctx.fillStyle = '#333333';
        const cobbleSpacingX = 20;
        const cobbleSpacingY = 15;
        const startX = Math.floor(leftEdge / cobbleSpacingX) * cobbleSpacingX;
        const endX = Math.ceil(rightEdge / cobbleSpacingX) * cobbleSpacingX;
        const startY = Math.floor(groundY / cobbleSpacingY) * cobbleSpacingY;
        const endY = Math.ceil((groundY + groundHeight) / cobbleSpacingY) * cobbleSpacingY;

        for (let x = startX; x < endX; x += cobbleSpacingX) {
            for (let y = startY; y < endY; y += cobbleSpacingY) {
                const cellX = x / cobbleSpacingX;
                const cellY = y / cobbleSpacingY;
                const cobbleChance = World.pseudoRandom(cellX, cellY);

                if (cobbleChance > 0.3) {
                    const offsetX = (World.pseudoRandom(cellX + 0.17, cellY) - 0.5) * 10;
                    const offsetY = (World.pseudoRandom(cellX, cellY + 0.31) - 0.5) * 5;
                    const cobbleWidth = 6 + World.pseudoRandom(cellX + 0.63, cellY + 0.27) * 4;
                    const cobbleHeight = 4 + World.pseudoRandom(cellX + 0.9, cellY + 0.54) * 2;

                    ctx.fillRect(x + offsetX, y + offsetY, cobbleWidth, cobbleHeight);
                }
            }
        }
    }

    renderManholes(ctx) {
        if (!this.groundMetals.length) {
            return;
        }

        ctx.save();
        for (const manhole of this.groundMetals) {
            const halfWidth = manhole.width / 2;
            const halfHeight = manhole.height / 2;
            ctx.fillStyle = 'rgba(70, 70, 80, 0.9)';
            ctx.fillRect(manhole.x - halfWidth, manhole.y - halfHeight, manhole.width, manhole.height);

            ctx.strokeStyle = 'rgba(25, 25, 30, 0.95)';
            ctx.lineWidth = 2;
            ctx.strokeRect(manhole.x - halfWidth, manhole.y - halfHeight, manhole.width, manhole.height);

            ctx.strokeStyle = 'rgba(30, 167, 64, 0.35)';
            ctx.lineWidth = 1;
            const grooveCount = 3;
            for (let i = 1; i <= grooveCount; i++) {
                const inset = (manhole.height / (grooveCount + 1)) * i - halfHeight;
                ctx.beginPath();
                ctx.moveTo(manhole.x - halfWidth + 4, manhole.y + inset);
                ctx.lineTo(manhole.x + halfWidth - 4, manhole.y + inset);
                ctx.stroke();
            }
        }
        ctx.restore();
    }

    renderTrees(ctx) {
        if (!this.trees.length) {
            return;
        }

        ctx.save();
        for (const tree of this.trees) {
            const trunkHeight = tree.height * 0.55;
            const trunkWidth = tree.trunkWidth;
            const trunkBaseY = tree.baseY;
            const trunkTopY = trunkBaseY - trunkHeight;
            const trunkX = tree.x + tree.lean * 0.2 - trunkWidth / 2;

            ctx.fillStyle = '#5a3b27';
            ctx.fillRect(trunkX, trunkTopY, trunkWidth, trunkHeight);

            const crownCenterX = tree.x + tree.lean;
            const crownCenterY = trunkTopY - tree.crownRadius * 0.3;
            const crownRadiusX = tree.crownRadius * 1.05;
            const crownRadiusY = tree.crownRadius * 0.85;

            const gradient = ctx.createRadialGradient(
                crownCenterX,
                crownCenterY,
                crownRadiusX * 0.25,
                crownCenterX,
                crownCenterY,
                crownRadiusX
            );
            gradient.addColorStop(0, 'rgba(95, 155, 89, 0.9)');
            gradient.addColorStop(1, 'rgba(46, 87, 46, 0.7)');

            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.ellipse(
                crownCenterX,
                crownCenterY,
                crownRadiusX,
                crownRadiusY,
                0,
                0,
                Math.PI * 2
            );
            ctx.fill();
        }
        ctx.restore();
    }

    renderStreetLamps(ctx, player) {
        if (!this.streetLamps.length) {
            return;
        }

        ctx.save();
        for (const lamp of this.streetLamps) {
            const poleWidth = 5;
            const poleHeight = lamp.height;
            const baseX = lamp.x - poleWidth / 2;
            const baseY = lamp.baseY;
            const poleTopY = baseY - poleHeight;
            const headY = poleTopY - 5;

            ctx.fillStyle = '#2b2b33';
            ctx.fillRect(baseX, poleTopY, poleWidth, poleHeight);

            const glowGradient = ctx.createRadialGradient(lamp.x, headY, 0, lamp.x, headY, 64);
            glowGradient.addColorStop(0, 'rgba(240, 236, 184, 0.2)');
            glowGradient.addColorStop(1, 'rgba(241, 233, 216, 0)');
            ctx.fillStyle = glowGradient;
            ctx.beginPath();
            ctx.arc(lamp.x, headY, 62, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }
}

// Initialize game when page loads
window.addEventListener('load', () => {
    new Game();
});
