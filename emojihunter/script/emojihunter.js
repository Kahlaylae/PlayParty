import { initializeApp } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-analytics.js";
import { getFirestore, collection, getDocs, query as firestoreQuery, orderBy, limit as firestoreLimit, startAfter, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js";
import { createUI } from "./ui.js";
import { initAudioControls, tryPlayAudio, playPop, pauseBackgroundForPause, pauseBackgroundForGameOver, resumeBackgroundAfterPause, handleVisibilityAudio } from "./audio.js";
import { Collidable, CollidableManager } from "./world.js";
import { loadLevelsAndMonsters, LevelWatcher, calculateObstaclePosition, MINI_BREAKPOINT } from "./levelconfig.js";
import { drawParallaxBackgroundFullCanvas, drawParallaxBackground, drawAvatar, drawCollidables, drawPellets, drawEnemies } from "./objectdraw.js";
import { screenToWorld, worldToScreen, loadAvatarSprites, getLottieSpriteCanvas } from "./utils.js";
import { resizeCamera } from "./camera.js";
import { createEngine } from "./engine.js";
import { CONTROL_MODES, loadControlSettings, saveControlMode } from "./controls.js";

  const firebaseConfig = {
    apiKey: "AIzaSyBeZMtBjXU06ebhdAPrDnOGxNFIheeutwU",
    authDomain: "lizarddefender.firebaseapp.com",
    projectId: "lizarddefender",
    storageBucket: "lizarddefender.firebasestorage.app",
    messagingSenderId: "498728449406",
    appId: "1:498728449406:web:76aba4d9d1e5dc4aae2f2f",
    measurementId: "G-QV7X9NDXCX"
  };

  // Initialize Firebase
  const app = initializeApp(firebaseConfig);
  const analytics = getAnalytics(app);
// Firestore (read-only queries for leaderboard)
const db = getFirestore(app);
// Auth (anonymous sign-in for owner-based rules)
const auth = getAuth(app);
signInAnonymously(auth).catch(e => console.warn('Anonymous sign-in failed', e));

// Script moved out of index.html to keep HTML slim.
// All original game logic retained; do not rename this file unless updating index.html.

// UI variables will be initialized by createUI()
let canvas, ctx, scoreElement, splashScreen, splashTitle, splashMessage, splashPrompt;

// Game container - all game elements append here instead of body
const gameContainer = document.getElementById('game-container') || document.body;

const ui = createUI(gameContainer);
// expose shorthand variables used elsewhere
    canvas = ui.canvasEl;
    ctx = canvas.getContext('2d');
    scoreElement = ui.scoreEl;
    splashScreen = ui.splashEl;
    splashTitle = ui.splashTitleEl;
    splashMessage = ui.splashMessageEl;
    splashPrompt = ui.splashPromptEl;
const cursorEl = ui.cursorEl;
let lastCursorAngle = 0; // Remember last cursor direction when movement stops
let currentCursorAngle = 0; // Smoothly interpolated cursor angle for fluid orbit

// Lerp helper for smooth interpolation
function lerp(a, b, t) {
    return a + (b - a) * t;
}

// Lerp angles properly (handles wraparound at -PI/PI boundary)
function lerpAngle(a, b, t) {
    // Normalize the difference to -PI to PI range
    let diff = b - a;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    return a + diff * t;
}

// Chevron cursor visibility helpers - show only during active gameplay
function showChevronCursor() {
    if (cursorEl) {
        cursorEl.style.display = 'block';
        document.body.style.cursor = 'none'; // Hide system cursor during gameplay
    }
}

function hideChevronCursor() {
    if (cursorEl) {
        cursorEl.style.display = 'none';
        document.body.style.cursor = 'default'; // Restore system pointer cursor
    }
}

function updateControlUI() {
    if (controlToggleBtn) {
        const isKeyboard = controlMode === CONTROL_MODES.KEYBOARD;
        controlToggleBtn.textContent = isKeyboard ? 'Controls: Keyboard' : 'Controls: Mobile';
        controlToggleBtn.title = isKeyboard
            ? 'Use arrow keys or WASD to steer; tap to boost'
            : 'Move cursor or touch to steer; tap to boost';
    }
}

function setControlMode(mode, { persist = false, source = 'manual' } = {}) {
    controlMode = (mode === CONTROL_MODES.KEYBOARD) ? CONTROL_MODES.KEYBOARD : CONTROL_MODES.MOBILE;
    keyboardDirection.x = 0;
    keyboardDirection.y = 0;
    if (controlMode === CONTROL_MODES.KEYBOARD) {
        target.x = avatarPosition.x || WORLD_WIDTH / 2;
        target.y = avatarPosition.y || WORLD_HEIGHT / 2;
    }
    if (persist) saveControlMode(controlMode, source);
    updateControlUI();
}

let menuWasPaused = false;

function showMenuSlide(which = 'main') {
    if (!menuMain || !menuHowTo) return;
    const showHow = which === 'howto';
    menuMain.style.display = showHow ? 'none' : 'flex';
    menuHowTo.style.display = showHow ? 'flex' : 'none';
}

function openMenu(which = 'main') {
    if (!menuOverlay) return;
    if (!isPaused && !isGameOver) {
        pauseGame();
        menuWasPaused = true;
        if (splashScreen) splashScreen.style.display = 'none';
    } else {
        menuWasPaused = false;
    }
    showMenuSlide(which);
    menuOverlay.style.display = 'flex';
}

function closeMenu() {
    if (!menuOverlay) return;
    menuOverlay.style.display = 'none';
    if (menuWasPaused && isPaused && !isGameOver) {
        resumeGame();
    }
    menuWasPaused = false;
}

const audioToggleBtn = ui.audioBtn;
const leaderboardToggleBtn = ui.leaderboardBtn;
const pauseToggleBtn = ui.pauseBtn;
const leaderboardElement = ui.leaderboardEl;
const leaderboardList = ui.leaderboardListEl;
const leaderboardAllList = ui.leaderboardAllListEl;
const leaderboardForm = ui.leaderboardFormEl;
const playerNameInput = ui.playerNameInputEl;
const playerScoreInput = ui.playerScoreInputEl;
    const submitBtn = ui.submitBtnEl;
    const clearBtn = ui.clearBtnEl;
const leaderboardCloseBtn = ui.leaderboardCloseBtnEl;
const tabTopBtn = ui.leaderboardTabTopBtn;
const tabAllBtn = ui.leaderboardTabAllBtn;
const controlToggleBtn = ui.controlBtn;
const hudLayer = ui.hudLayer;
const menuToggleBtn = ui.menuBtn;
const menuOverlay = ui.menuOverlay;
const menuMain = ui.menuMain;
const menuHowTo = ui.menuHowTo;
const menuCloseBtn = ui.menuCloseBtn;
const howToBtn = ui.howToBtn;
const howToBackBtn = ui.howToBackBtn;

// Initialize audio module with the toggle button reference
initAudioControls(audioToggleBtn);
// Await the first user gesture; the splash will be used to both enable audio and resume the game
let awaitingFirstGesture = true;

// Sizes are expressed in world units
const AVATAR_SIZE = 12;
// Speeds are world-units per second
const PELLET_SPEED = 900; // ~15 px/frame @60fps -> 900 world units/sec
const AVATAR_SPEED = 300; // ~5 px/frame @60fps -> 300 world units/sec
const ENEMY_SPEED_SCALE = 80; // multiplier to convert level enemySpeed to world-units/sec
const OPEN_MOUTH_DURATION = 7;
const BOSS_ENEMY_SPAWN_THRESHOLD = 5;
        
// Levels will be loaded from JSON files in /assets at runtime.
// `levels` will be a map: levelNumber -> { target, monsters: [{monster, emoji, normalHp, bossHp, enemySpeed}], aimSpeed, spawnRate, collidables }
let levels = {};

// --- VIRTUAL CANVAS / WORLD / CAMERA / TIMING ---
// Virtual canvas adapts to viewport aspect ratio while maintaining consistent gameplay area
// Desktop (16:9): wider playfield | Mobile (9:16): taller playfield
// Use two base sizes for clarity in tutorial-style docs
const VIRTUAL_BASE_DESKTOP = 640;
const VIRTUAL_BASE_MOBILE = 560;
let VIRTUAL_WIDTH = 800;  // Will adapt to viewport
let VIRTUAL_HEIGHT = 600; // Will adapt to viewport
let canvasScale = 1; // Scale factor from virtual to screen coords
let canvasOffsetX = 0; // Letterbox/pillarbox offset (should be 0 with adaptive sizing)
let canvasOffsetY = 0;

// World size matches virtual canvas for consistent gameplay
let WORLD_WIDTH = VIRTUAL_WIDTH;
let WORLD_HEIGHT = VIRTUAL_HEIGHT;
const MIN_SCALE = 0.5;
const MAX_SCALE = 2.0;
let camera = { x: 0, y: 0, scale: 1, mode: 'zoom-fill' };
let __elapsedTime = 0;

// Performance optimization variables
const TARGET_FPS = 60;
let frameCount = 0;
let lastFPSCheck = 0;

// Engine handles timing / frame gating
const engine = createEngine({ targetFps: TARGET_FPS, maxDt: 0.05, onFrame: animate });

// --- BACKGROUND IMAGE SYSTEM ---
let currentBackgroundImage = null;
let backgroundImages = {}; // Cache loaded background images
// Screen load images for desktop and mobile
const SCREENLOAD_DESKTOP = 'assets/emojiscreenload.png';
const SCREENLOAD_MOBILE = 'assets/emonjiscreenload-mobile.png';
function isMobileViewport() {
    return window.innerWidth < MINI_BREAKPOINT;
}
function getScreenLoadImage() {
    return isMobileViewport() ? SCREENLOAD_MOBILE : SCREENLOAD_DESKTOP;
}
function loadBackgroundImage(src) {
    if (backgroundImages[src]) {
        currentBackgroundImage = backgroundImages[src];
        return Promise.resolve(backgroundImages[src]);
    }
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            backgroundImages[src] = img;
            currentBackgroundImage = img;
            resolve(img);
        };
        img.onerror = () => {
            console.warn(`Failed to load background: ${src}`);
            currentBackgroundImage = null;
            resolve(null);
        };
        img.src = src;
    });
}
// debounce interval for resize handling (ms)
const RESIZE_DEBOUNCE_MS = 100;
let __resizeTimer = null;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// -------------------------
// Obstacle system - emoji-based collidables
// -------------------------
// manager instance (current level)
let collidableManager = new CollidableManager();

// monsterMap: monsterId -> monsterData (from monsters.json)
let monsterMap = {};

let levelWatcher = null; // will be created after loading levels

let gameLoopInterval;
let pelletInterval;
let avatarPosition = { x: 0, y: 0, angle: 0 };
let projectiles = [];
// Object pool for better performance
let projectilePool = [];
const MAX_POOL_SIZE = 50;
let enemies = [];
let target = { x: 0, y: 0 };
let keyboardDirection = { x: 0, y: 0 };
let isMouthOpen = false;
let avatarHit = false;
let enemiesDestroyed = 0;
let isPaused = false;
let isGameOver = false;
let isBoosting = false;
let controlMode = CONTROL_MODES.MOBILE;
let boostTimeout = null;
const BOOST_DURATION = 500 ; // ms (boost lasts 1 second - shows activated sprite)
// Cooldown removed - boost is now freely available but shorter and less powerful

// gameLoopInterval = setInterval(spawnEnemy, 1000); // Always 1 enemy per second Session-wide kill counter (persists across levels during a single play session)
let sessionKills = 0;

// Pick a base virtual size depending on breakpoint (keeps tutorial-friendly constants)
function getVirtualBase() {
    return window.innerWidth <= MINI_BREAKPOINT ? VIRTUAL_BASE_MOBILE : VIRTUAL_BASE_DESKTOP;
}

function resizeCanvas() {
    const state = resizeCamera({
        canvas,
        gameContainer,
        camera,
        virtualBase: getVirtualBase(),
        miniBreakpoint: MINI_BREAKPOINT,
        target,
        collidableManager,
        levelWatcher,
        calculateObstaclePosition
    });

    // Sync derived values back into local state
    VIRTUAL_WIDTH = state.virtualWidth;
    VIRTUAL_HEIGHT = state.virtualHeight;
    WORLD_WIDTH = state.worldWidth;
    WORLD_HEIGHT = state.worldHeight;
    canvasScale = state.canvasScale;
    canvasOffsetX = state.canvasOffsetX;
    canvasOffsetY = state.canvasOffsetY;
    if (!avatarPosition.x) initializeAvatar();
}

function initializeAvatar() {
    avatarPosition = {
        x: WORLD_WIDTH / 2,
        y: WORLD_HEIGHT / 2,
        angle: 0
    };
    target.x = avatarPosition.x;
    target.y = avatarPosition.y;
}

function updateAvatar(dt = 0) {
    // Update target based on keyboard direction
    if (keyboardDirection.x !== 0 || keyboardDirection.y !== 0) {
        target.x += keyboardDirection.x * AVATAR_SPEED * dt;
        target.y += keyboardDirection.y * AVATAR_SPEED * dt;
    }

    target.x = Math.max(0, Math.min(WORLD_WIDTH, target.x));
    target.y = Math.max(0, Math.min(WORLD_HEIGHT, target.y));

    // Update persistent cursor: orbit around avatar, point toward target
    // Only show chevron cursor during active gameplay (not paused/game over)
    try {
        if (cursorEl && !isPaused && !isGameOver) {
            // Get container offset for fixed positioning
            const containerRect = gameContainer.getBoundingClientRect();
            
            // Convert avatar world position to screen coordinates
            const avatarScr = worldToScreen(avatarPosition.x, avatarPosition.y, camera);
            const targetScr = worldToScreen(target.x, target.y, camera);
            
            // Add container offset since cursor uses fixed positioning
            const avatarScreenX = avatarScr.x + containerRect.left;
            const avatarScreenY = avatarScr.y + containerRect.top;
            
            // Calculate angle from avatar to target
            const dx = targetScr.x - avatarScr.x;
            const dy = targetScr.y - avatarScr.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            
            // Calculate target angle (where cursor should eventually point)
            let targetAngle;
            if (dist > 5) {
                targetAngle = Math.atan2(dy, dx);
                lastCursorAngle = targetAngle; // Remember this direction
            } else {
                targetAngle = lastCursorAngle; // Use last direction when stationary
            }
            
            // Smoothly interpolate current angle toward target angle
            const lerpSpeed = 0.18;
            currentCursorAngle = lerpAngle(currentCursorAngle, targetAngle, lerpSpeed);
            
            // Orbit radius: avatar edge + fixed 10px gap (consistent across viewports)
            const avatarScreenRadius = (AVATAR_SIZE * 8 * canvasScale) / 2;
            const orbitRadius = avatarScreenRadius + 10;
            
            // Position chevron on the orbit circle using smoothed angle
            const cursorX = avatarScreenX + Math.cos(currentCursorAngle) * orbitRadius;
            const cursorY = avatarScreenY + Math.sin(currentCursorAngle) * orbitRadius;
            
            cursorEl.style.left = cursorX + 'px';
            cursorEl.style.top = cursorY + 'px';
            
            // Rotate chevron to point in orbit direction
            const rotateDeg = (currentCursorAngle * 180 / Math.PI) + 90;
            cursorEl.style.transform = `translate(-50%, -50%) rotate(${rotateDeg}deg)`;
            cursorEl.style.display = 'block';
        }
    } catch (e) {}

    // Move avatar toward target
    const dx = target.x - avatarPosition.x;
    const dy = target.y - avatarPosition.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    if (distance > 1e-2) {
        avatarPosition.angle = Math.atan2(dy, dx);
        const moveStep = Math.min(AVATAR_SPEED * dt, distance);
        avatarPosition.x += Math.cos(avatarPosition.angle) * moveStep;
        avatarPosition.y += Math.sin(avatarPosition.angle) * moveStep;
    }
}

function updatePellets(dt = 0) {
    projectiles = projectiles.filter(p => {
        // Update pellet age
        p.timeAlive += dt;
        
        // Remove pellet if it has exceeded its lifespan
        if (p.timeAlive >= p.lifespan) {
            // Return to pool for reuse
            if (projectilePool.length < MAX_POOL_SIZE) {
                projectilePool.push(p);
            }
            return false; // Remove from array
        }
        
        // velocities are world-units per second
        p.x += p.vx * dt;
        p.y += p.vy * dt;

        // world bounds
        if (p.x + p.size > WORLD_WIDTH || p.x - p.size < 0) {
            p.vx = -p.vx;
            p.x = Math.max(p.size, Math.min(WORLD_WIDTH - p.size, p.x));
            p.color = `hsl(${Math.random() * 360}, 100%, 50%)`;
        }

        if (p.y + p.size > WORLD_HEIGHT || p.y - p.size < 0) {
            p.vy = -p.vy;
            p.y = Math.max(p.size, Math.min(WORLD_HEIGHT - p.size, p.y));
            p.color = `hsl(${Math.random() * 360}, 100%, 50%)`;
        }
        
        return true; // Keep pellet in array
    });
}

function spawnEnemy() {
    if (isPaused) return;
    // Cap enemies to prevent lag in endless mode
    if (enemies.length >= 30) return;
    let size, hp, emoji, speed;
    const levelConfig = levelWatcher.getLevelConfig();

    // Choose a monster type from the level's monster pool
    const monsterChoice = levelConfig.monsters[Math.floor(Math.random() * levelConfig.monsters.length)];
    emoji = monsterChoice.emoji;
    hp = monsterChoice.normalHp;
    // scale level-defined enemySpeed to world-units/sec for consistent behavior
    speed = (monsterChoice.enemySpeed || 1) * ENEMY_SPEED_SCALE;

    if (enemiesDestroyed >= BOSS_ENEMY_SPAWN_THRESHOLD && Math.random() < 0.1) {
        size = 70;
        hp = monsterChoice.bossHp || monsterChoice.normalHp * 2;
        speed = ((monsterChoice.enemySpeed || 1) * ENEMY_SPEED_SCALE) / 2;
    } else {
        size = 50;
    }

    let startX, startY;
    const corner = Math.floor(Math.random() * 4);
    switch (corner) {
        case 0:
            startX = 0;
            startY = 0;
            break;
        case 1:
            startX = WORLD_WIDTH;
            startY = 0;
            break;
        case 2:
            startX = 0;
            startY = WORLD_HEIGHT;
            break;
        case 3:
            startX = WORLD_WIDTH;
            startY = WORLD_HEIGHT;
            break;
    }

    enemies.push({
        x: startX,
        y: startY,
        vx: 0,
        vy: 0,
        size: size,
        hp: hp,
        speed: speed,
        emoji: emoji
    });
}

function updateEnemies(dt = 0) {
    // === MONSTER-TO-MONSTER COLLISION ===
    // Push overlapping enemies apart (bigger + faster = more force)
    for (let i = 0; i < enemies.length; i++) {
        for (let j = i + 1; j < enemies.length; j++) {
            const a = enemies[i];
            const b = enemies[j];
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const distSq = dx * dx + dy * dy;
            const minDist = (a.size + b.size) / 2;
            const minDistSq = minDist * minDist;
            
            if (distSq < minDistSq && distSq > 0.01) {
                const dist = Math.sqrt(distSq);
                const overlap = minDist - dist;
                // Normalize push direction
                const nx = dx / dist;
                const ny = dy / dist;
                
                // Force = size × speed (bigger + faster monsters push harder)
                const aForce = a.size * a.speed;
                const bForce = b.size * b.speed;
                const totalForce = aForce + bForce;
                
                // Ratio: higher force = pushes more, gets pushed less
                const aRatio = bForce / totalForce;
                const bRatio = aForce / totalForce;
                
                // Push apart
                const pushStrength = overlap * 0.6;
                a.x -= nx * pushStrength * aRatio;
                a.y -= ny * pushStrength * aRatio;
                b.x += nx * pushStrength * bRatio;
                b.y += ny * pushStrength * bRatio;
            }
        }
    }
    
    enemies.forEach(enemy => {
        // keep enemies inside world bounds
        if (enemy.x + (enemy.size / 2) > WORLD_WIDTH || enemy.x - (enemy.size / 2) < 0) {
            enemy.vx = -enemy.vx;
        }
        if (enemy.y + (enemy.size / 2) > WORLD_HEIGHT || enemy.y - (enemy.size / 2) < 0) {
            enemy.vy = -enemy.vy;
        }
        // desired direction toward avatar
        let dx = avatarPosition.x - enemy.x;
        let dy = avatarPosition.y - enemy.y;
        let distance = Math.sqrt(dx * dx + dy * dy) || 1;
        let desiredVx = (dx / distance) * enemy.speed;
        let desiredVy = (dy / distance) * enemy.speed;

        // predict next position and test collision with collidables (small step)
        let nextX = enemy.x + desiredVx * dt;
        let nextY = enemy.y + desiredVy * dt;
        const radius = enemy.size / 2;
        let blocked = false;
        try {
            if (collidableManager) {
                const hits = collidableManager.queryCircle(nextX, nextY, radius, { groups: { enemies: true } });
                if (hits && hits.length) blocked = true;
            }
        } catch (e) { blocked = false; }

        if (blocked) {
            // Try a simple grid-based A* path to the avatar
            try {
                const path = collidableManager.findPath(enemy.x, enemy.y, avatarPosition.x, avatarPosition.y, radius, 32);
                if (path && path.length > 1) {
                    const next = path[1];
                    const ddx = next.x - enemy.x;
                    const ddy = next.y - enemy.y;
                    const dlen = Math.sqrt(ddx * ddx + ddy * ddy) || 1;
                    desiredVx = (ddx / dlen) * enemy.speed;
                    desiredVy = (ddy / dlen) * enemy.speed;
                } else {
                    // fallback to sampling alternate headings when pathfinder fails
                    let baseAngle = Math.atan2(dy, dx);
                    let found = false;
                    const offsets = [Math.PI / 2, -Math.PI / 2, Math.PI / 4, -Math.PI / 4, Math.PI, Math.PI / 6, -Math.PI / 6];
                    for (let k = 0; k < offsets.length && !found; k++) {
                        const a = baseAngle + offsets[k];
                        const vx = Math.cos(a) * enemy.speed;
                        const vy = Math.sin(a) * enemy.speed;
                        const tx = enemy.x + vx * dt;
                        const ty = enemy.y + vy * dt;
                        try {
                            const hits = collidableManager.queryCircle(tx, ty, radius, { groups: { enemies: true } });
                            if (!hits || hits.length === 0) {
                                desiredVx = vx; desiredVy = vy; found = true; break;
                            }
                        } catch (e) {
                            // if query fails, fallback to stay
                        }
                    }
                    if (!found) {
                        desiredVx = -desiredVx * 0.3;
                        desiredVy = -desiredVy * 0.3;
                    }
                }
            } catch (e) {
                // pathfinding failed; keep previous sampling fallback
                let baseAngle = Math.atan2(dy, dx);
                let found = false;
                const offsets = [Math.PI / 2, -Math.PI / 2, Math.PI / 4, -Math.PI / 4, Math.PI, Math.PI / 6, -Math.PI / 6];
                for (let k = 0; k < offsets.length && !found; k++) {
                    const a = baseAngle + offsets[k];
                    const vx = Math.cos(a) * enemy.speed;
                    const vy = Math.sin(a) * enemy.speed;
                    const tx = enemy.x + vx * dt;
                    const ty = enemy.y + vy * dt;
                    try {
                        const hits = collidableManager.queryCircle(tx, ty, radius, { groups: { enemies: true } });
                        if (!hits || hits.length === 0) {
                            desiredVx = vx; desiredVy = vy; found = true; break;
                        }
                    } catch (e) {}
                }
                if (!found) { desiredVx = -desiredVx * 0.3; desiredVy = -desiredVy * 0.3; }
            }
        }

        enemy.vx = desiredVx;
        enemy.vy = desiredVy;
        enemy.x += enemy.vx * dt;
        enemy.y += enemy.vy * dt;
    });
}

function checkPelletEnemyCollision() {
    // Use squared distance for faster collision checks (avoids sqrt)
    // Process all collisions - previous limit was causing missed hits
    
    projectiles = projectiles.filter(pellet => {
        let pelletHit = false;
        const pelletRadiusSq = pellet.size * pellet.size;
        
        enemies = enemies.filter(enemy => {
            // Skip if pellet already hit something this frame
            if (pelletHit) return true;
            
            const dx = pellet.x - enemy.x;
            const dy = pellet.y - enemy.y;
            const distSq = dx * dx + dy * dy;
            const hitRadius = pellet.size + (enemy.size / 2);
            const hitRadiusSq = hitRadius * hitRadius;
            
            if (distSq < hitRadiusSq) {
                pelletHit = true;
                // Use pellet's damage value (boosted pellets do 2 damage)
                const damage = pellet.damage || 1;
                enemy.hp -= damage;
                
                // Visual feedback on hit (flash effect)
                enemy.lastHitTime = performance.now();
                
                if (enemy.hp <= 0) {
                    enemiesDestroyed++;
                    sessionKills++;
                    updateScore();
                    playPop();
                    return false; // Remove dead enemy
                }
            }
            return true;
        });
        
        // Return pellet to pool when it hits
        if (pelletHit && projectilePool.length < MAX_POOL_SIZE) {
            projectilePool.push(pellet);
        }
        
        return !pelletHit;
    });
}

function checkAvatarCollidableCollision() {
    // Use the collidable manager to check collisions
    // Push avatar out of obstacles so it cannot pass through them
    try {
        if (collidableManager) {
            const hits = collidableManager.queryCircle(avatarPosition.x, avatarPosition.y, AVATAR_SIZE * 1.5, { groups: { dragon: true } });
            if (hits && hits.length) {
                // Compute combined push vector from all hits
                let totalDx = 0, totalDy = 0;
                hits.forEach(c => {
                    const v = c.getPushOutVector(avatarPosition.x, avatarPosition.y, AVATAR_SIZE * 1.5);
                    totalDx += v.dx; totalDy += v.dy;
                });
                // Average and apply push-out
                const count = Math.max(1, hits.length);
                avatarPosition.x += totalDx / count;
                avatarPosition.y += totalDy / count;
            }
        }
    } catch (e) {
        // fallback: no push-out behavior
    }
}

// Handle pellet collisions with collidables: bounce pellets off obstacles
function checkPelletCollidableCollision() {
    if (!collidableManager) return;
    for (let i = projectiles.length - 1; i >= 0; i--) {
        const p = projectiles[i];
        const hits = collidableManager.queryCircle(p.x, p.y, p.size, { groups: { pellets: true } });
        if (hits && hits.length) {
            const c = hits[0];
            if (!c) continue;
            
            // Circle bounce: reflect velocity across normal from obstacle center
            const dx = p.x - c.x;
            const dy = p.y - c.y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            const nx = dx / dist, ny = dy / dist;
            const vdotn = p.vx * nx + p.vy * ny;
            p.vx = p.vx - 2 * vdotn * nx;
            p.vy = p.vy - 2 * vdotn * ny;
            
            // Push pellet out to avoid getting stuck
            const push = c.getPushOutVector(p.x, p.y, p.size);
            p.x += push.dx;
            p.y += push.dy;

                // Apply push to nearby enemies and to the avatar if close to the collision point
                try {
                    const COLLIDE_POINT_X = p.x;
                    const COLLIDE_POINT_Y = p.y;
                    const PUSH_DISPLACE = 1.2; // positional push multiplier
                    const PUSH_VEL = 0.6; // velocity impulse multiplier
                    // push enemies
                    for (let ei = 0; ei < enemies.length; ei++) {
                        const enemy = enemies[ei];
                        if (!enemy) continue;
                        const ex = enemy.x, ey = enemy.y;
                        const edist = Math.hypot(ex - COLLIDE_POINT_X, ey - COLLIDE_POINT_Y);
                        const trigger = (enemy.size / 2) + (p.size || 0) + 8;
                        if (edist <= trigger) {
                            // nudge enemy outwards and give a small velocity kick
                            enemy.x += (push.dx || 0) * PUSH_DISPLACE;
                            enemy.y += (push.dy || 0) * PUSH_DISPLACE;
                            enemy.vx = (enemy.vx || 0) + (push.dx || 0) * PUSH_VEL;
                            enemy.vy = (enemy.vy || 0) + (push.dy || 0) * PUSH_VEL;
                        }
                    }
                    // push avatar if near collision
                    const dh = Math.hypot(avatarPosition.x - COLLIDE_POINT_X, avatarPosition.y - COLLIDE_POINT_Y);
                    const avatarTrigger = (AVATAR_SIZE * 1.5) + (p.size || 0) + 8;
                    if (dh <= avatarTrigger) {
                        avatarPosition.x += (push.dx || 0) * PUSH_DISPLACE;
                        avatarPosition.y += (push.dy || 0) * PUSH_DISPLACE;
                    }
                } catch (e) {
                    // non-fatal; continue
                }
        }
    }
}


function checkAvatarEnemyCollision() {
    const avatarRadius = AVATAR_SIZE * 1.5;
    enemies.forEach(enemy => {
        const dx = avatarPosition.x - enemy.x;
        const dy = avatarPosition.y - enemy.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance < avatarRadius + (enemy.size / 2)) {
            avatarHit = true;
        }
    });
}
        
function updateScore() {
    const levelConfig = levelWatcher.getLevelConfig();
    if (levelWatcher.isInEndlessMode()) {
        // Endless mode: show total kills only
        scoreElement.innerText = `Endless Mode: ${sessionKills} Total Kills`;
    } else {
        // Regular levels: show progress format
        scoreElement.innerText = `Level ${levelWatcher.currentLevel}: ${enemiesDestroyed}/${levelConfig.target} Eliminated`;
    }
}

function showSplashScreen(title, message, prompt) {
        // Always use the 16:9 image, gently stretched to fill the window (no bars)
        if (title === '' && prompt === 'Click to begin') {
            const bgUrl = 'assets/emojiscreenload.png';
            splashScreen.style.background = `center/100% 100% no-repeat url('${bgUrl}')`;
        } else {
            splashScreen.style.background = '';
        }
    // Hide chevron cursor and show pointer on splash screens
    hideChevronCursor();
    splashTitle.innerText = title;
    splashMessage.innerText = message;
    // For GAME OVER, require an explicit button click to start a new game.
    if (title === 'GAME OVER') {
        splashPrompt.innerHTML = '';
        // create a dedicated button to start a new game
        const btn = document.createElement('button');
        btn.id = 'splash-newgame-btn';
        btn.innerText = 'Click here for new game';
        btn.style.padding = '10px 14px';
        btn.style.borderRadius = '8px';
        btn.style.border = '0';
        btn.style.background = '#4CAF50';
        btn.style.color = '#000';
        btn.style.fontSize = '1rem';
        btn.style.cursor = 'pointer';
        btn.setAttribute('aria-label', 'Start a new game');
        splashPrompt.appendChild(btn);
        // wire click to restart
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            restartGame();
        });
    } else {
        splashPrompt.innerText = prompt;
    }
    splashScreen.style.display = 'flex';
    // ensure overlay covers viewport; inner content (.splash-inner) is sized by CSS
    try {
        const inner = document.querySelector('#splashScreen .splash-inner');
        if (inner) {
            // clear any inline widths on inner
            inner.style.maxWidth = '';
            inner.style.padding = '';
            // toggle paused class for compact paused presentation
            try {
                const ut = (title || '').toUpperCase();
                // treat PAUSED and level-complete screens as 'paused' (compact single-line title) so
                // their title sizing/nowrap rules apply on small screens
                if (ut === 'PAUSED' || ut.includes('LEVEL COMPLETE') || ut.includes('LEVEL ')) {
                    inner.classList.add('paused');
                } else {
                    inner.classList.remove('paused');
                }
                if (ut.includes('GAME OVER') || ut === 'GAME OVER') {
                    inner.classList.add('gameover');
                } else {
                    inner.classList.remove('gameover');
                }
                if (ut.includes('VICTORY') || ut === 'VICTORY') {
                    inner.classList.add('victory');
                } else {
                    inner.classList.remove('victory');
                }
            } catch (e) {}
        }
    } catch (e) {}
    if (title === 'GAME OVER') {
        splashTitle.style.textShadow = '0 0 20px #ff0000';
    } else {
        splashTitle.style.textShadow = '0 0 20px #00ff00';
    }
    clearInterval(gameLoopInterval);
    clearInterval (pelletInterval);
}

function pauseGame() {
    if (isPaused) return;
    isPaused = true;
    // Hide chevron cursor during pause
    hideChevronCursor();
    // show a paused splash with no extra message (title + prompt only)
    showSplashScreen('PAUSED', '', 'Click to continue');
    // pause background audio when the game is paused by user
    pauseBackgroundForPause();
}

function resumeGame() {
    if (!isPaused) return;
    // remove splash and resume
    splashScreen.style.display = 'none';
    awaitingFirstGesture = false;
    isPaused = false;
    // Restore chevron cursor for gameplay
    showChevronCursor();
    // resume loops
    const levelConfig = levelWatcher.getLevelConfig();
    if (gameLoopInterval) clearInterval(gameLoopInterval);
    if (pelletInterval) clearInterval(pelletInterval);
    // spawnRate multiplier: 1 = 1/sec, 2 = 2/sec, 0.5 = 1 every 2 sec
    gameLoopInterval = setInterval(spawnEnemy, 1000 / (levelConfig.spawnRate || 1));
    pelletInterval = setInterval(shootPellet, 1000 / levelConfig.aimSpeed);
    engine.start();
    // resume audio if it was paused by pause (but don't override visibility-paused state)
    resumeBackgroundAfterPause();
}

function endGame() {
    isPaused = true;
    isGameOver = true;
    showSplashScreen('GAME OVER', `You eliminated ${sessionKills} enemies this session!`, 'Click or tap to play again.');
    // Prefill leaderboard score field and prompt user to submit their score
    try {
        prefillScoreAndShow(sessionKills);
        const personalEl = document.getElementById('personal-hiscore');
        if (personalEl) {
            personalEl.innerHTML = `Your session score: <strong>${sessionKills}</strong>. Submit it to the leaderboard on the right.`;
        }
    } catch (e) {
        // ignore errors
    }
    // Force-show leaderboard at game over (do not persist)
    try {
        const prev = leaderboardVisible ? '1' : '0';
        document.body.dataset._prevLeaderboardVisible = prev;
        setLeaderboardVisibility(true, false);
    } catch (e) {}
    // enable submit button now that game is over
    try {
        const sb = document.getElementById('submit-score');
        if (sb) { sb.disabled = false; sb.title = 'Submit your score'; }
    } catch (e) {}
    // pause music on game over
    pauseBackgroundForGameOver();
}

function startNextLevel() {
    levelWatcher.nextLevel();
    enemiesDestroyed = 0;
    projectiles = [];
    enemies = [];
    isPaused = false;
    
    // Reset boost state for new level
    isBoosting = false;
    if (boostTimeout) { clearTimeout(boostTimeout); boostTimeout = null; }
    
    splashScreen.style.display = 'none';
    // Show chevron cursor for gameplay
    showChevronCursor();
    // Restore leaderboard visibility (restore temporary override if set)
    try {
        const prev = document.body.dataset._prevLeaderboardVisible;
        if (typeof prev !== 'undefined') {
            setLeaderboardVisibility(prev === '1', false);
            delete document.body.dataset._prevLeaderboardVisible;
        } else {
            // apply persisted preference
            setLeaderboardVisibility(leaderboardVisible, false);
        }
    } catch (e) {}
    initializeAvatar();
    // set collidables for the manager and sanitize against current viewport
    try {
        const levelConfig = levelWatcher.getLevelConfig();
        collidableManager.set(levelConfig.collidables || []);
        collidableManager.buildGrid(128, WORLD_WIDTH, WORLD_HEIGHT);
        collidableManager.sanitize(WORLD_WIDTH, WORLD_HEIGHT);
        
        // Load the background image for this level
        if (levelConfig.background) {
            loadBackgroundImage(levelConfig.background);
        }
    } catch (e) {}
    updateScore();
    if (gameLoopInterval) clearInterval(gameLoopInterval);
    const levelConfig2 = levelWatcher.getLevelConfig();
    // spawnRate multiplier: 1 = 1/sec, 2 = 2/sec, 0.5 = 1 every 2 sec
    gameLoopInterval = setInterval(spawnEnemy, 1000 / (levelConfig2.spawnRate || 1));
    if (pelletInterval) clearInterval(pelletInterval);
    pelletInterval = setInterval(shootPellet, 1000 / levelConfig2.aimSpeed);
    engine.start();
    updateControlUI();
}

function restartGame() {
    isPaused = false;
    isGameOver = false;
    avatarHit = false;
    if (levelWatcher) levelWatcher.reset();
    enemiesDestroyed = 0;
    sessionKills = 0; // full restart clears session total
    projectiles = [];
    enemies = [];
    
    // Reset boost state
    isBoosting = false;
    if (boostTimeout) { clearTimeout(boostTimeout); boostTimeout = null; }
    
    splashScreen.style.display = 'none';
    // Show chevron cursor for gameplay
    showChevronCursor();
    initializeAvatar();
    // set collidables for the manager and sanitize against current viewport
    try {
        const levelConfig = levelWatcher.getLevelConfig();
        collidableManager.set(levelConfig.collidables || []);
        collidableManager.buildGrid(128, WORLD_WIDTH, WORLD_HEIGHT);
        collidableManager.sanitize(WORLD_WIDTH, WORLD_HEIGHT);
        
        // Load the background image for this level
        if (levelConfig.background) {
            loadBackgroundImage(levelConfig.background);
        }
    } catch (e) {}
    updateScore();
    if (gameLoopInterval) clearInterval(gameLoopInterval);
    const levelConfig2 = levelWatcher.getLevelConfig();
    // spawnRate multiplier: 1 = 1/sec, 2 = 2/sec, 0.5 = 1 every 2 sec
    gameLoopInterval = setInterval(spawnEnemy, 1000 / (levelConfig2.spawnRate || 1));
    if (pelletInterval) clearInterval(pelletInterval);
    pelletInterval = setInterval(shootPellet, 1000 / levelConfig2.aimSpeed);
    engine.start();
    updateControlUI();
    // Restore leaderboard visibility after restarting
    try {
        const prev = document.body.dataset._prevLeaderboardVisible;
        if (typeof prev !== 'undefined') {
            setLeaderboardVisibility(prev === '1', false);
            delete document.body.dataset._prevLeaderboardVisible;
        } else {
            setLeaderboardVisibility(leaderboardVisible, false);
        }
    } catch (e) {}
}

function animate(dt = 0) {
    // Engine provides dt; clamp defensively
    const step = Math.min(0.05, dt || 0);

    if (isPaused) {
        return;
    }

    // Clear entire canvas in screen (pixel) coordinates
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = 'rgba(13, 17, 23, 1)'; // Solid black for letterbox/pillarbox areas
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';
    
    // Draw parallax background to fill ENTIRE canvas (before virtual transform)
    drawParallaxBackgroundFullCanvas({
        ctx,
        canvas,
        camera,
        currentBackgroundImage,
        virtualWidth: VIRTUAL_WIDTH,
        virtualHeight: VIRTUAL_HEIGHT,
        target
    });

    // Set transform to map world -> screen using virtual canvas scale and DPR
    ctx.save();
    const _dpr = (camera && camera.dpr) ? camera.dpr : 1;
    const _s = canvasScale * _dpr;
    ctx.setTransform(_s, 0, 0, _s, canvasOffsetX * _dpr, canvasOffsetY * _dpr);
    
    // Background already drawn above - no need to call drawParallaxBackground() here
    
    // Performance optimizations for mobile
    ctx.imageSmoothingEnabled = false; // Disable for better performance

    // Update simulation using dt (seconds)
    // advance world time and movers before physics
    __elapsedTime += step;
    try {
        // step moving collidables and rebuild spatial grid when they move
        if (collidableManager && typeof collidableManager.stepMovers === 'function') {
            const moved = collidableManager.stepMovers(__elapsedTime);
            if (moved) {
                collidableManager._pfDirty = true;
                collidableManager.buildGrid(collidableManager.cellSize || 128, WORLD_WIDTH, WORLD_HEIGHT);
            }
        }
    } catch (e) {}

    updateAvatar(step);
    updatePellets(step);
    try { checkPelletCollidableCollision(); } catch (e) {}
    updateEnemies(step);

    checkAvatarCollidableCollision();
    checkAvatarEnemyCollision();
    checkPelletEnemyCollision();

    // Draw scene in world coordinates
    drawCollidables({ ctx, collidableManager });
    drawAvatar({ ctx, avatarPosition, target, isBoosting, AVATAR_SIZE, avatarHit, getSpriteCanvas: getLottieSpriteCanvas });
    drawPellets({ ctx, projectiles });
    drawEnemies({ ctx, enemies });

    ctx.restore();

    if (avatarHit) {
        endGame();
        return;
    }

    const levelConfig = levelWatcher.getLevelConfig();
    
    // Only check for level completion in regular levels, not endless mode
    if (!levelWatcher.isInEndlessMode() && enemiesDestroyed >= levelConfig.target) {
        if (!levelWatcher.isLastLevel()) {
            isPaused = true;
            showSplashScreen('LEVEL COMPLETE!', `You've completed Level ${levelWatcher.currentLevel}!`, 'Click or tap to continue to the next level.');
        } else {
            // Last regular level completed - transition to endless mode
            isPaused = true;
            showSplashScreen('FINAL LEVEL COMPLETE!', `You've beaten all levels! Now survive as long as you can!`, 'Click or tap to enter Endless Mode.');
        }
    }

}

function shootPellet() {
    if (isPaused) return;
    const angle = avatarPosition.angle;
    
    // Use object pooling for better performance
    let pellet = projectilePool.pop();
    if (!pellet) {
        pellet = {};
    }
    
    // Boosted pellets are slightly faster and deal more damage
    const speedMultiplier = isBoosting ? 1.25 : 1;
    const currentSpeed = PELLET_SPEED * speedMultiplier;
    
    pellet.x = avatarPosition.x + Math.cos(angle) * AVATAR_SIZE * 2;
    pellet.y = avatarPosition.y + Math.sin(angle) * AVATAR_SIZE * 2;
    pellet.vx = Math.cos(angle) * currentSpeed;
    pellet.vy = Math.sin(angle) * currentSpeed;
    pellet.size = isBoosting ? 9 : 8; // Slightly bigger pellets during boost
    pellet.color = isBoosting 
        ? `hsl(${45 + Math.random() * 30}, 100%, 60%)` // Gold/orange during boost
        : `hsl(${Math.random() * 360}, 100%, 50%)`;
    pellet.timeAlive = 0;
    pellet.lifespan = 8.5;
    pellet.damage = isBoosting ? 1.5 : 1; // 50% more damage during boost (reduced from 2x)
    
    projectiles.push(pellet);

    isMouthOpen = true;
    setTimeout(() => {
        isMouthOpen = false;
    }, OPEN_MOUTH_DURATION);
}

function getBoostStatusText() {
    if (isBoosting) return 'Boosted!';
    const movementHint = controlMode === CONTROL_MODES.KEYBOARD
        ? 'Move with arrows/WASD'
        : 'Move cursor or touch to steer';
    return `${movementHint}. Tap to boost.`;
}

function startBoost() {
    // Quick burst boost: no cooldown, shorter duration, less powerful but freely usable
    if (isPaused || !levelWatcher || isBoosting) return;
    
    const levelConfig = levelWatcher.getLevelConfig();
    if (!levelConfig) return;

    isBoosting = true;
    
    // Fire one immediately for responsiveness
    shootPellet();
    clearInterval(pelletInterval);
    const boostedSpeed = levelConfig.aimSpeed * (Number(levelConfig.multiplier) || 1);
    pelletInterval = setInterval(shootPellet, 1000 / boostedSpeed);

    boostTimeout = setTimeout(() => {
        // boost ending: restore normal fire rate (no cooldown)
        isBoosting = false;
        clearInterval(pelletInterval);
        const currentLevel = levelWatcher.getLevelConfig();
        pelletInterval = setInterval(shootPellet, 1000 / (currentLevel.aimSpeed || 1));
        boostTimeout = null;
    }, BOOST_DURATION);
}

function stopBoost() {
    // No-op for now; retained for API compatibility
}

function onDown(e) {
    // allow interaction with form controls and leaderboard without blocking
    try {
        const target = e.target || e.srcElement;
        if (target && target.closest && target.closest('input, textarea, select, button, #leaderboard')) {
            // let the event behave normally (so inputs can focus/type)
            return;
        }
    } catch (err) {
        // ignore
    }

    e.preventDefault();
    // If the game is paused, use clicks to advance/start
    if (isPaused) {
        if (isGameOver) {
            // When GAME OVER, require dedicated button.
            return;
        } else {
            // Only advance to next level when the splash is a level-complete or victory screen
            const st = (splashTitle && splashTitle.innerText) ? splashTitle.innerText.toUpperCase() : '';
            if (st.includes('LEVEL COMPLETE') || st.includes('VICTORY')) {
                startNextLevel();
            }
        }
        return;
    }

    // When playing, start boost while pointer/touch is down
    startBoost();
}

function onMove(e) {
    if (controlMode !== CONTROL_MODES.MOBILE) return;
    let x, y;
    if (e.type.startsWith('touch')) {
        const touch = e.touches[0];
        x = touch.clientX;
        y = touch.clientY;
    } else {
        x = e.clientX;
        y = e.clientY;
    }
    // Convert screen/client coordinates into world coordinates for the in-game target
    // screenToWorld handles container offset internally via canvas.getBoundingClientRect()
    const worldPos = screenToWorld(x, y, canvas, camera);
    target.x = Math.max(0, Math.min(WORLD_WIDTH, worldPos.x));
    target.y = Math.max(0, Math.min(WORLD_HEIGHT, worldPos.y));
    // Cursor position is handled by game loop (orbit around avatar), just ensure it's visible
    try {
        if (cursorEl && !isPaused && !isGameOver) {
            cursorEl.style.display = 'block';
        }
    } catch (err) {}
}

document.addEventListener('keydown', (e) => {
    // Ignore key presses when typing in form controls
    try {
        const tg = e.target || e.srcElement;
        if (tg && tg.closest && tg.closest('input, textarea, select, button, #leaderboard')) {
            return;
        }
    } catch (err) {}

    // Space toggles pause/resume globally unless GAME OVER (in which case space is ignored)
    if (e.code === 'Space' || e.key === ' ') {
        if (isGameOver) return; // don't toggle during GAME OVER
        if (isPaused) {
            // If splash is a level-complete/victory screen, advance instead
            const st = (splashTitle && splashTitle.innerText) ? splashTitle.innerText.toUpperCase() : '';
            if (st.includes('LEVEL COMPLETE') || st.includes('VICTORY')) {
                startNextLevel();
                return;
            }
            resumeGame();
        } else {
            pauseGame();
        }
        e.preventDefault();
        return;
    }
    if (controlMode !== CONTROL_MODES.KEYBOARD) return;
    e.preventDefault();
    switch (e.key.toLowerCase()) {
        case 'w':
        case 'arrowup':
            keyboardDirection.y = -1;
            break;
        case 's':
        case 'arrowdown':
            keyboardDirection.y = 1;
            break;
        case 'a':
        case 'arrowleft':
            keyboardDirection.x = -1;
            break;
        case 'd':
        case 'arrowright':
            keyboardDirection.x = 1;
            break;
    }
});

document.addEventListener('keyup', (e) => {
    if (isPaused) return;
    if (controlMode !== CONTROL_MODES.KEYBOARD) return;
    switch (e.key.toLowerCase()) {
        case 'w':
        case 'arrowup':
        case 's':
        case 'arrowdown':
            keyboardDirection.y = 0;
            break;
        case 'a':
        case 'arrowleft':
        case 'd':
        case 'arrowright':
            keyboardDirection.x = 0;
            break;
    }
});

// Debounced resize handler to avoid thrashing heavy logic during window resizing
window.addEventListener('resize', () => {
    if (__resizeTimer) clearTimeout(__resizeTimer);
    __resizeTimer = setTimeout(() => {
        try { resizeCanvas(); } catch (e) { console.warn('resizeCanvas failed', e); }
    }, RESIZE_DEBOUNCE_MS);
});
window.addEventListener('mousedown', onDown);
window.addEventListener('touchstart', onDown, { passive: false });
window.addEventListener('mousemove', onMove);
window.addEventListener('touchmove', onMove, { passive: false });
        
window.onload = async function() {
    // Wait for next frame to ensure CSS layout is computed
    await new Promise(r => requestAnimationFrame(r));
    // Ensure the canvas and camera are sized before we compute viewport-aligned placements
    resizeCanvas();
    await loadAvatarSprites(); // Load avatar sprite images
    // Load levels/monsters and create a LevelWatcher now that `levels` is populated
    const useMobileBackground = (typeof window !== 'undefined' && window.innerWidth < MINI_BREAKPOINT);
    const loaded = await loadLevelsAndMonsters({ worldWidth: WORLD_WIDTH, worldHeight: WORLD_HEIGHT, useMobileBackground });
    levels = loaded.levels || {};
    monsterMap = loaded.monsterMap || {};
    levelWatcher = new LevelWatcher(levels);
    
    // Preload all level background images
    const backgroundPromises = Object.values(levels).map(level => {
        if (level.background) {
            return loadBackgroundImage(level.background);
        }
        return Promise.resolve();
    });
    await Promise.all(backgroundPromises);
    // Set initial background for level 1
    const initialConfig = levelWatcher.getLevelConfig();
    if (initialConfig.background) {
        await loadBackgroundImage(initialConfig.background);
    }
    
    restartGame();
    try {
        const stored = loadControlSettings();
        setControlMode(stored && stored.mode ? stored.mode : CONTROL_MODES.MOBILE, { persist: false, source: 'init-load' });
    } catch (e) {
        setControlMode(CONTROL_MODES.MOBILE, { persist: false, source: 'init-fallback' });
    }
    // Start paused with a single 'Click to begin' prompt
    isPaused = true;
    showSplashScreen('', '', 'Click to begin');
    try {
        // Ensure we use the splash as the single first-gesture handler
        awaitingFirstGesture = true;
        const onInit = async (ev) => {
            ev && ev.preventDefault && ev.preventDefault();
            // Attempt to play audio using the existing helper
            await tryPlayAudio();
            // mark that initial gesture has occurred
            awaitingFirstGesture = false;
            // remove splash and resume
            resumeGame();
            // ensure click handlers don't linger
            splashScreen.removeEventListener('pointerdown', onInit);
            try {
                const mb = document.getElementById('menu-toggle');
                if (mb) mb.style.display = 'block';
            } catch (e) {}
        };
        // wire the whole splash to accept the first gesture
        splashScreen.addEventListener('pointerdown', onInit, { once: true });
        // also accept keyboard Enter/Space as first gesture
        const onKey = async (e) => {
            if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
                e.preventDefault();
                await onInit(e);
                window.removeEventListener('keydown', onKey);
            }
        };
        window.addEventListener('keydown', onKey, { once: true });
    } catch (e) {
        console.warn('Failed to setup initial splash gesture', e);
    }
    document.body.focus();
    updateControlUI();
    // try to autoplay background audio
    tryPlayAudio();
};

// -------------------------
// Leaderboard (localStorage)
// -------------------------
const LEADERBOARD_KEY = 'playdragon_leaderboard_v1';
const PERSONAL_KEY = 'playdragon_personal_hiscore_v1';
const LEADERBOARD_LIMIT = 10;
const LB_VISIBLE_KEY = 'playdragon_leaderboard_visible_v1';

// Leaderboard visibility state (persisted)
let leaderboardVisible = (localStorage.getItem(LB_VISIBLE_KEY) === 'true');

function setLeaderboardVisibility(visible, persist = true) {
    const el = document.getElementById('leaderboard');
    if (!el) return;
    if (visible) {
        // center in viewport; if miniScreen is active, give it more room and center nicely
        el.style.display = 'block';
        el.style.position = 'fixed';
        el.style.left = '50%';
        el.style.top = '50%';
        el.style.transform = 'translate(-50%, -50%)';
        el.style.zIndex = '60';
        if (document.body.classList.contains('miniScreen')) {
            el.style.width = '92%';
            el.style.maxWidth = '680px';
            el.style.maxHeight = '70%';
            el.style.overflow = 'auto';
            el.style.padding = '12px';
            el.style.right = 'auto';
            el.style.top = '52%';
            // apply centered class for nicer presentation
            el.classList.add('centered');
        } else {
            el.style.width = '';
            el.style.maxWidth = '320px';
            el.style.maxHeight = '';
            el.classList.remove('centered');
        }
        // load remote hiscores when opening leaderboard (best-effort, read-only)
        try { loadHiscores().catch(() => {}); } catch (e) {}
        // focus the name input if present
        try {
            const nameInput = document.getElementById('player-name');
            if (nameInput) nameInput.focus();
        } catch (e) {}
    } else {
        // restore anchored position (right-top corner as default)
        el.style.display = 'none';
        el.style.position = 'absolute';
        el.style.right = '32px';
        el.style.top = '80px';
        el.style.transform = 'none';
        el.style.zIndex = '25';
        el.classList.remove('centered');
    }
    leaderboardVisible = !!visible;
    if (persist) localStorage.setItem(LB_VISIBLE_KEY, leaderboardVisible ? 'true' : 'false');
}

function loadLeaderboard() {
    try {
        const raw = localStorage.getItem(LEADERBOARD_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed;
    } catch (e) {
        console.warn('Failed to parse leaderboard', e);
        return [];
    }
}

function saveLeaderboard(list) {
    localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(list.slice(0, LEADERBOARD_LIMIT)));
}

function getPersonalHiscore() {
    try { return JSON.parse(localStorage.getItem(PERSONAL_KEY)); } catch { return null; }
}

function setPersonalHiscore(entry) {
    localStorage.setItem(PERSONAL_KEY, JSON.stringify(entry));
}

function renderLeaderboard() {
    const listEl = document.getElementById('leaderboard-list');
    const personalEl = document.getElementById('personal-hiscore');
    if (!listEl || !personalEl) return;
    const list = loadLeaderboard();
    if (list.length === 0) {
        listEl.innerHTML = '<div style="opacity:0.8">No scores yet — be the first!</div>';
    } else {
        listEl.innerHTML = list.map((e, i) => {
            const place = i + 1;
            const name = escapeHtml(e.name || 'Anon');
            const cnt = Number(e.count || 0);
            const loc = e.location ? ` — <a href="${e.mapUrl}" target="_blank" rel="noopener noreferrer" style="color:#9be7ff">${escapeHtml(e.location)}</a>` : '';
            return `<div style="padding:6px 4px;border-bottom:1px solid rgba(255,255,255,0.04);">#${place} <strong style="color:#ffd54f">${name}</strong> — ${cnt}${loc}</div>`;
        }).join('');
    }

    const personal = getPersonalHiscore();
    if (personal && (!list.length || !list.some(l => l.id === personal.id))) {
        personalEl.innerHTML = `Personal hiscore: <strong>${escapeHtml(personal.name || 'You')}</strong> — ${Number(personal.count || 0)}` + (personal.location ? ` — <a href="${personal.mapUrl}" target="_blank" rel="noopener noreferrer" style="color:#9be7ff">${escapeHtml(personal.location)}</a>` : '');
    } else {
        personalEl.innerHTML = '';
    }
}

// -------------------------
// Firestore: read-only hiscores
// -------------------------
async function loadHiscores(limit = 10) {
    const listEl = document.getElementById('leaderboard-list');
    if (!listEl) return;
    listEl.innerHTML = '<div style="opacity:0.85">Loading hiscores...</div>';
    try {
        const colRef = collection(db, 'hiscores');
        const q = firestoreQuery(colRef, orderBy('score', 'desc'), firestoreLimit(limit));
        const snap = await getDocs(q);
        const items = [];
        snap.forEach(doc => {
            const data = doc.data();
            items.push({ id: doc.id, name: data.name || 'Anon', score: Number(data.score || 0) });
        });
        renderHiscores(items);
        return items;
    } catch (e) {
        console.warn('Failed to load hiscores from Firestore', e);
        if (listEl) listEl.innerHTML = '<div style="opacity:0.8">Failed to load hiscores (offline or permissions). Showing local scores.</div>';
        // fall back to local leaderboard rendering after a short delay so user sees message
        setTimeout(renderLeaderboard, 700);
        throw e;
    }
}

function renderHiscores(items) {
    const listEl = document.getElementById('leaderboard-list');
    const personalEl = document.getElementById('personal-hiscore');
    if (!listEl || !personalEl) return;
    if (!Array.isArray(items) || items.length === 0) {
        listEl.innerHTML = '<div style="opacity:0.8">No hiscores found.</div>';
        return;
    }
    listEl.innerHTML = items.map((e, i) => {
        const place = i + 1;
        const name = escapeHtml(e.name || 'Anon');
        const score = Number(e.score || 0);
        return `<div style="padding:6px 4px;border-bottom:1px solid rgba(255,255,255,0.04);">#${place} <strong style="color:#ffd54f">${name}</strong> — ${score}</div>`;
    }).join('');
    // don't override personal hiscore area here; keep local personal display
}

// Initialize leaderboard visibility based on persisted value
setTimeout(() => setLeaderboardVisibility(leaderboardVisible, false), 0);

function escapeHtml(s) {
    return String(s).replace(/[&<>"'`]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;', '`':'&#96;' })[c]);
}

// Determine if score qualifies for top N
function qualifiesForLeaderboard(count) {
    const list = loadLeaderboard();
    if (list.length < LEADERBOARD_LIMIT) return true;
    const nth = list[list.length - 1];
    return Number(count) > Number(nth.count);
}

// Add a score entry; if it doesn't make top N it's saved as personal hiscore
async function addScoreEntry({ name, count }) {
    const list = loadLeaderboard();
    const entry = { id: cryptoRandomId(), name: name || 'Anon', count: Number(count || 0), ts: Date.now() };

    // Try to fetch IP-based location info (best-effort). We'll try two public APIs and fall back silently.
    try {
        // prefer ipapi.co which supports CORS in many cases
        let resp = await fetch('https://ipapi.co/json/');
        if (resp.ok) {
            const d = await resp.json();
            entry.ip = d.ip;
            entry.location = [d.city, d.region, d.country_name].filter(Boolean).join(', ');
            entry.mapUrl = d.latitude && d.longitude ? `https://www.openstreetmap.org/?mlat=${d.latitude}&mlon=${d.longitude}#map=6/${d.latitude}/${d.longitude}` : '';
        }
    } catch (e) {
        try {
            let r2 = await fetch('https://ipinfo.io/json?token='); // token optional; may be rate-limited
            if (r2.ok) {
                const d2 = await r2.json();
                entry.ip = d2.ip || entry.ip;
                entry.location = d2.city ? [d2.city, d2.region, d2.country].filter(Boolean).join(', ') : entry.location;
                if (d2.loc) {
                    const [lat, lon] = d2.loc.split(',');
                    entry.mapUrl = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=6/${lat}/${lon}`;
                }
            }
        } catch (e2) {
            // ignore
        }
    }

    // Try to write to Firestore (best-effort). If it fails, fall back to localStorage.
    let remoteWritten = false;
    try {
        await saveHiscoreToFirestore({ name: entry.name, score: entry.count });
        remoteWritten = true;
    } catch (e) {
        console.warn('Failed to save hiscore to Firestore, falling back to localStorage', e);
        // show temporary message in leaderboard panel so user knows remote write failed and provide details
        const listEl = document.getElementById('leaderboard-list');
        if (listEl) {
            const msg = document.createElement('div');
            msg.style.opacity = '0.95';
            msg.style.marginBottom = '8px';
            msg.innerHTML = `Could not save to remote hiscores: <strong>${escapeHtml(e && e.message ? e.message : String(e))}</strong>`;
            const retry = document.createElement('button');
            retry.textContent = 'Retry remote save';
            retry.className = 'btn submit';
            retry.style.marginTop = '8px';
            retry.addEventListener('click', async () => {
                retry.disabled = true;
                retry.textContent = 'Retrying...';
                try {
                    await saveHiscoreToFirestore({ name: entry.name, score: entry.count });
                    // on success, reload remote hiscores
                    await loadHiscores(LEADERBOARD_LIMIT);
                } catch (err) {
                    console.warn('Retry failed', err);
                    retry.disabled = false;
                    retry.textContent = 'Retry remote save';
                    // update message
                    msg.innerHTML = `Retry failed: <strong>${escapeHtml(err && err.message ? err.message : String(err))}</strong>`;
                }
            });
            listEl.innerHTML = '';
            listEl.appendChild(msg);
            listEl.appendChild(retry);
        }
        // continue to save locally
    }

    if (qualifiesForLeaderboard(entry.count)) {
        list.push(entry);
        list.sort((a, b) => Number(b.count) - Number(a.count));
        saveLeaderboard(list.slice(0, LEADERBOARD_LIMIT));
        // clear personal hiscore if it made top
        setPersonalHiscore(entry);
    } else {
        // Save as personal hiscore and don't add to public top list
        setPersonalHiscore(entry);
    }

    // If remote write succeeded, refresh remote list in the leaderboard panel.
    if (remoteWritten) {
        try { await loadHiscores(LEADERBOARD_LIMIT); } catch (e) { /* ignore */ }
    } else {
        renderLeaderboard();
    }
}

// Attempt to save a hiscore document to Firestore (best-effort). Throws on failure.
async function saveHiscoreToFirestore({ name, score }) {
    if (!db) throw new Error('Firestore not initialized');
    const colRef = collection(db, 'hiscores');
    const ownerUid = (auth && auth.currentUser) ? auth.currentUser.uid : null;
    const payload = { name: String(name || 'Anon').slice(0, 40), score: Number(score || 0), ownerUid: ownerUid, ts: serverTimestamp() };
    // addDoc will throw if permissions deny or network fails
    return await addDoc(colRef, payload);
}

// Diagnostic helper: attempt a quick read to verify Firestore connectivity and rules
window.testFirestoreConnectivity = async function(limit = 1) {
    try {
        console.log('Testing Firestore connectivity...');
        const colRef = collection(db, 'hiscores');
        const q = firestoreQuery(colRef, orderBy('score', 'desc'), firestoreLimit(limit));
        const snap = await getDocs(q);
        console.log('Firestore test read succeeded. Documents found:', snap.size);
        snap.forEach(doc => console.log(' -', doc.id, doc.data()));
        return { ok: true, count: snap.size };
    } catch (e) {
        console.error('Firestore connectivity test failed:', e);
        return { ok: false, error: e };
    }
};

function cryptoRandomId() {
    try {
        // use crypto API when available
        const arr = new Uint32Array(4);
        crypto.getRandomValues(arr);
        return Array.from(arr).map(n => n.toString(36)).join('-');
    } catch (e) {
        return 'id-' + Math.random().toString(36).slice(2, 9);
    }
}

// Wire UI (submitBtn and clearBtn are provided by createUI and assigned above)
// Wire leaderboard toggle button (use JS-created element)
const lbToggleBtn = (typeof leaderboardToggleBtn !== 'undefined') ? leaderboardToggleBtn : document.getElementById('leaderboard-toggle');
if (lbToggleBtn) {
    lbToggleBtn.addEventListener('click', () => {
        closeMenu();
        setLeaderboardVisibility(true, true);
        if (!isPaused && !isGameOver) {
            pauseGame();
        }
    });
}
// Close button in the leaderboard panel
const lbCloseBtn = document.getElementById('leaderboard-close');
if (lbCloseBtn) {
    lbCloseBtn.addEventListener('click', (e) => {
        e.preventDefault();
        setLeaderboardVisibility(false, true);
    });
}

// Pause toggle button (use JS-created element)
const pauseBtn = (typeof pauseToggleBtn !== 'undefined') ? pauseToggleBtn : document.getElementById('pause-toggle');
if (pauseBtn) {
    pauseBtn.addEventListener('click', (e) => {
        e.preventDefault();
        closeMenu();
    });
}

// Control mode toggle button
const ctrlBtn = (typeof controlToggleBtn !== 'undefined') ? controlToggleBtn : document.getElementById('control-toggle');
if (ctrlBtn) {
    ctrlBtn.addEventListener('click', () => {
        const nextMode = controlMode === CONTROL_MODES.KEYBOARD ? CONTROL_MODES.MOBILE : CONTROL_MODES.KEYBOARD;
        setControlMode(nextMode, { persist: true, source: 'ui-toggle' });
    });
}

// Menu toggle buttons
const menuBtn = (typeof menuToggleBtn !== 'undefined') ? menuToggleBtn : document.getElementById('menu-toggle');
if (menuBtn) {
    menuBtn.addEventListener('click', () => {
        if (menuOverlay && menuOverlay.style.display === 'flex') {
            closeMenu();
        } else {
            openMenu('main');
        }
    });
}
const menuClose = (typeof menuCloseBtn !== 'undefined') ? menuCloseBtn : document.getElementById('menu-close');
if (menuClose) {
    menuClose.addEventListener('click', () => closeMenu());
}
if (howToBtn) {
    howToBtn.addEventListener('click', () => openMenu('howto'));
}
if (howToBackBtn) {
    howToBackBtn.addEventListener('click', () => showMenuSlide('main'));
}

// When the document visibility changes, pause if not visible. When returning, show the resume prompt.
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        if (!isPaused) pauseGame();
    } else {
        // show a resume prompt but don't auto-resume
        if (!isGameOver) pauseGame();
    }
});
// Enhance visibility handling to pause audio and allow resuming on click when visible
window.addEventListener('visibilitychange', () => handleVisibilityAudio(isPaused));
if (submitBtn) {
    submitBtn.addEventListener('click', async (evt) => {
        evt.preventDefault();
        // Only allow submit when the game is over
        if (!isGameOver) {
            // briefly flash a message
            try {
                const listEl = document.getElementById('leaderboard-list');
                if (listEl) listEl.innerHTML = '<div style="opacity:0.9">You can only submit after GAME OVER.</div>';
            } catch (e) {}
            return;
        }
        const nameInput = document.getElementById('player-name');
        const scoreInput = document.getElementById('player-score');
        const name = nameInput ? (nameInput.value.trim() || 'Anon') : 'Anon';
        const count = scoreInput ? Number(scoreInput.value || 0) : 0;
        await addScoreEntry({ name, count });
        if (nameInput) nameInput.value = '';
        if (scoreInput) scoreInput.value = '';
        // after submit, disable button until next GAME OVER
        try { submitBtn.disabled = true; submitBtn.title = 'Submit available only after GAME OVER'; } catch (e) {}
    });
}

if (clearBtn) {
    clearBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (!confirm('Clear leaderboard? This cannot be undone locally.')) return;
        localStorage.removeItem(LEADERBOARD_KEY);
        localStorage.removeItem(PERSONAL_KEY);
        renderLeaderboard();
    });
}

// Expose a helper to prefill the form with a game score (used on game end)
function prefillScoreAndShow(score) {
    const scoreInput = document.getElementById('player-score');
    if (scoreInput) scoreInput.value = Number(score || 0);
}

// initial render
renderLeaderboard();

// -------------------------
// Leaderboard Tabs + All Scores (infinite scroll)
// -------------------------
let lbCurrentTab = 'top'; // 'top' | 'all'
let allScoresPageSize = 30;
let allScoresLastDoc = null;
let allScoresExhausted = false;
let allScoresLoading = false;
let allRenderedCount = 0; // for numbering

function setActiveTabStyles() {
    try {
        if (tabTopBtn && tabAllBtn) {
            if (lbCurrentTab === 'top') {
                tabTopBtn.style.background = 'rgba(255,255,255,0.08)';
                tabTopBtn.style.color = '#fff';
                tabAllBtn.style.background = 'transparent';
                tabAllBtn.style.color = '#9be7ff';
            } else {
                tabAllBtn.style.background = 'rgba(255,255,255,0.08)';
                tabAllBtn.style.color = '#fff';
                tabTopBtn.style.background = 'transparent';
                tabTopBtn.style.color = '#9be7ff';
            }
        }
    } catch (e) {}
}

function setLeaderboardTab(tab) {
    lbCurrentTab = (tab === 'all') ? 'all' : 'top';
    if (leaderboardList && leaderboardAllList) {
        if (lbCurrentTab === 'top') {
            leaderboardList.style.display = 'block';
            leaderboardAllList.style.display = 'none';
            // refresh top on switch
            try { loadHiscores(LEADERBOARD_LIMIT).catch(() => {}); } catch (e) {}
        } else {
            leaderboardList.style.display = 'none';
            leaderboardAllList.style.display = 'block';
            if (!allScoresLastDoc && !allScoresLoading && !allScoresExhausted) {
                resetAllScoresPagination();
                loadMoreAllScores().catch(() => {});
            }
        }
    }
    setActiveTabStyles();
}

function resetAllScoresPagination() {
    allScoresLastDoc = null;
    allScoresExhausted = false;
    allScoresLoading = false;
    allRenderedCount = 0;
    if (leaderboardAllList) leaderboardAllList.innerHTML = '';
}

async function loadMoreAllScores() {
    if (allScoresLoading || allScoresExhausted) return;
    allScoresLoading = true;
    // Show loading indicator
    try {
        const indicatorId = 'lb-all-loading';
        let ind = document.getElementById(indicatorId);
        if (!ind && leaderboardAllList) {
            ind = document.createElement('div');
            ind.id = indicatorId;
            ind.style.opacity = '0.85';
            ind.style.padding = '6px 4px';
            ind.textContent = 'Loading more...';
            leaderboardAllList.appendChild(ind);
        }
    } catch (e) {}

    try {
        const colRef = collection(db, 'hiscores');
        let q = firestoreQuery(colRef, orderBy('score', 'desc'), firestoreLimit(allScoresPageSize));
        if (allScoresLastDoc) {
            q = firestoreQuery(colRef, orderBy('score', 'desc'), startAfter(allScoresLastDoc), firestoreLimit(allScoresPageSize));
        }
        const snap = await getDocs(q);
        const items = [];
        snap.forEach(doc => {
            const data = doc.data();
            items.push({ id: doc.id, name: data.name || 'Anon', score: Number(data.score || 0) });
        });
        appendAllScores(items);
        if (snap.docs.length > 0) {
            allScoresLastDoc = snap.docs[snap.docs.length - 1];
        }
        if (snap.docs.length < allScoresPageSize) {
            allScoresExhausted = true;
            // Show end marker
            if (leaderboardAllList) {
                const end = document.createElement('div');
                end.style.opacity = '0.75';
                end.style.padding = '8px 4px';
                end.textContent = 'No more scores';
                leaderboardAllList.appendChild(end);
            }
        }
    } catch (e) {
        console.warn('Failed to load all scores', e);
        if (leaderboardAllList && leaderboardAllList.children.length === 0) {
            leaderboardAllList.innerHTML = '<div style="opacity:0.85">Failed to load scores.</div>';
        }
    } finally {
        // Remove loading indicator
        try {
            const ind = document.getElementById('lb-all-loading');
            if (ind && ind.parentNode) ind.parentNode.removeChild(ind);
        } catch (e) {}
        allScoresLoading = false;
    }
}

function appendAllScores(items) {
    if (!leaderboardAllList) return;
    if (!Array.isArray(items) || items.length === 0) {
        if (allRenderedCount === 0) {
            leaderboardAllList.innerHTML = '<div style="opacity:0.8">No scores yet.</div>';
        }
        return;
    }
    const html = items.map((e, i) => {
        const place = allRenderedCount + i + 1;
        const name = escapeHtml(e.name || 'Anon');
        const score = Number(e.score || 0);
        return `<div style="padding:6px 4px;border-bottom:1px solid rgba(255,255,255,0.04);">#${place} <strong style="color:#ffd54f">${name}</strong> — ${score}</div>`;
    }).join('');
    const temp = document.createElement('div');
    temp.innerHTML = html;
    while (temp.firstChild) leaderboardAllList.appendChild(temp.firstChild);
    allRenderedCount += items.length;
}

// Scroll listener for infinite loading
if (leaderboardAllList) {
    leaderboardAllList.addEventListener('scroll', () => {
        const threshold = 40; // px from bottom
        if (leaderboardAllList.scrollTop + leaderboardAllList.clientHeight >= leaderboardAllList.scrollHeight - threshold) {
            if (!allScoresLoading && !allScoresExhausted) {
                loadMoreAllScores().catch(() => {});
            }
        }
    });
}

// Wire tab buttons
if (tabTopBtn) tabTopBtn.addEventListener('click', () => setLeaderboardTab('top'));
if (tabAllBtn) tabAllBtn.addEventListener('click', () => setLeaderboardTab('all'));

// Default to Top tab on load
setActiveTabStyles();

// Enhance setLeaderboardVisibility to account for centered mode sizing for all-list too
const _origSetLeaderboardVisibility = setLeaderboardVisibility;
setLeaderboardVisibility = function(visible, persist = true) {
    _origSetLeaderboardVisibility(visible, persist);
    try {
        if (!leaderboardElement) return;
        if (visible) {
            // Adjust all-list size similar to top list
            if (document.body.classList.contains('miniScreen')) {
                if (leaderboardAllList) {
                    leaderboardAllList.style.maxHeight = '60vh';
                }
            } else {
                if (leaderboardAllList) {
                    leaderboardAllList.style.maxHeight = '280px';
                }
            }
            // Load appropriate tab content
            if (lbCurrentTab === 'all') {
                if (!allScoresLastDoc && !allScoresExhausted && !allScoresLoading) {
                    resetAllScoresPagination();
                    loadMoreAllScores().catch(() => {});
                }
            } else {
                try { loadHiscores(LEADERBOARD_LIMIT).catch(() => {}); } catch (e) {}
            }
        }
    } catch (e) {}
};

