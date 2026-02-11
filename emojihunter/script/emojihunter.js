import { initializeApp } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-analytics.js";
import { getFirestore, collection, getDocs, query as firestoreQuery, orderBy, limit as firestoreLimit, startAfter, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js";

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
let canvas, ctx, scoreElement, splashScreen, splashTitle, splashMessage, splashPrompt, shootInstructions;

// Game container - all game elements append here instead of body
const gameContainer = document.getElementById('game-container') || document.body;

// Create control buttons dynamically so the entire UI is managed from JS
function createControlButtons() {
    const makeBtn = (id, text, aria, title) => {
        const b = document.createElement('button');
        b.id = id;
        b.type = 'button';
        b.setAttribute('aria-label', aria || '');
        if (title) b.title = title;
        b.textContent = text;
        b.className = 'top-control';
        return b;
    };

    const audioBtn = makeBtn('audio-toggle', '🔊', 'Toggle audio', 'Toggle audio');
    const leaderboardBtn = makeBtn('leaderboard-toggle', '📊', 'Toggle leaderboard', 'Toggle leaderboard');
    const pauseBtn = makeBtn('pause-toggle', '⏸', 'Pause game', 'Pause game');
    const fullscreenBtn = makeBtn('fullscreen-toggle', '⛶', 'Toggle fullscreen', 'Toggle fullscreen');

    gameContainer.appendChild(audioBtn);
    gameContainer.appendChild(leaderboardBtn);
    gameContainer.appendChild(pauseBtn);
    gameContainer.appendChild(fullscreenBtn);

    // Fullscreen toggle logic
    fullscreenBtn.addEventListener('click', () => {
        if (document.fullscreenElement) {
            document.exitFullscreen();
            fullscreenBtn.textContent = '⛶';
        } else {
            gameContainer.requestFullscreen().catch(err => {
                console.warn('Fullscreen request failed:', err);
            });
            fullscreenBtn.textContent = '⛶';
        }
    });

    // Update button on fullscreen change
    document.addEventListener('fullscreenchange', () => {
        fullscreenBtn.textContent = document.fullscreenElement ? '✕' : '⛶';
    });

    return { audioBtn, leaderboardBtn, pauseBtn, fullscreenBtn };
}

// create basic UI elements (score, instructions, canvas, splash, leaderboard)
function createUI() {
    // score
    const scoreEl = document.createElement('div');
    scoreEl.id = 'score';
    gameContainer.appendChild(scoreEl);

    // instructions
    const instr = document.createElement('div');
    instr.id = 'shoot-instructions';
    instr.textContent = 'Tap to shoot faster';
    gameContainer.appendChild(instr);

    // canvas
    const cvs = document.createElement('canvas');
    cvs.id = 'gameCanvas';
    gameContainer.appendChild(cvs);

    // splash
    const splash = document.createElement('div');
    splash.id = 'splashScreen';
    splash.style.cursor = 'pointer'; // Always show pointer cursor on splash
    const inner = document.createElement('div');
    inner.className = 'splash-inner';
    inner.style.cursor = 'pointer'; // Ensure inner also has pointer
    const h1 = document.createElement('h1'); h1.id = 'splashTitle';
    const p = document.createElement('p'); p.id = 'splashMessage';
    const prompt = document.createElement('p'); prompt.id = 'splashPrompt'; prompt.className = 'restart-prompt';
    inner.appendChild(h1); inner.appendChild(p); inner.appendChild(prompt);
    splash.appendChild(inner);
    gameContainer.appendChild(splash);

    // leaderboard (structure only; content is rendered by existing functions)
    const lb = document.createElement('div'); lb.id = 'leaderboard';
    const head = document.createElement('div'); head.className = 'leaderboard-head'; head.style.position='relative';
    const title = document.createElement('h3'); title.textContent = 'Leaderboard'; title.style.margin='0';
    const closeBtn = document.createElement('button'); closeBtn.id='leaderboard-close'; closeBtn.className='close-btn'; closeBtn.textContent='✖';
    head.appendChild(title); head.appendChild(closeBtn); lb.appendChild(head);
    const list = document.createElement('div'); list.id='leaderboard-list'; lb.appendChild(list);
    // Tabs: Top 10 and All
    const tabs = document.createElement('div');
    tabs.className = 'lb-tabs';
    tabs.style.display = 'flex';
    tabs.style.gap = '6px';
    tabs.style.margin = '8px 0 6px';
    const tabTop = document.createElement('button');
    tabTop.type = 'button';
    tabTop.textContent = 'Top';
    tabTop.className = 'tab-btn';
    tabTop.style.padding = '6px 10px';
    tabTop.style.border = '1px solid rgba(255,255,255,0.15)';
    tabTop.style.background = 'transparent';
    tabTop.style.color = '#fff';
    tabTop.style.borderRadius = '6px';
    tabTop.style.cursor = 'pointer';
    const tabAll = document.createElement('button');
    tabAll.type = 'button';
    tabAll.textContent = 'All';
    tabAll.className = 'tab-btn';
    tabAll.style.padding = '6px 10px';
    tabAll.style.border = '1px solid rgba(255,255,255,0.15)';
    tabAll.style.background = 'transparent';
    tabAll.style.color = '#9be7ff';
    tabAll.style.borderRadius = '6px';
    tabAll.style.cursor = 'pointer';
    tabs.appendChild(tabTop); tabs.appendChild(tabAll);
    lb.appendChild(tabs);
    // All-list container (hidden by default); mirror list sizing/overflow
    const listAll = document.createElement('div');
    listAll.id = 'leaderboard-all-list';
    listAll.style.display = 'none';
    listAll.style.maxHeight = '280px';
    listAll.style.overflow = 'auto';
    listAll.style.marginBottom = '8px';
    lb.appendChild(listAll);
    const form = document.createElement('form'); form.id='leaderboard-form'; form.className='leaderboard-form';
    const ni = document.createElement('input'); ni.id='player-name'; ni.placeholder='Name'; ni.maxLength=20; ni.className='lb-input';
    const si = document.createElement('input'); si.id='player-score'; si.placeholder='Score'; si.type='number'; si.min='0'; si.className='lb-input';
    // Score is provided by the game only; make this field readonly to prevent UI edits
    si.readOnly = true;
    form.appendChild(ni); form.appendChild(si); lb.appendChild(form);
    const btnRow = document.createElement('div'); btnRow.className='btn-row';
    const submit = document.createElement('button'); submit.id='submit-score'; submit.className='btn submit'; submit.textContent='Submit';
    // Only allow submitting after a GAME OVER. Disable by default; enabled in endGame().
    submit.disabled = true;
    submit.title = 'Submit available only after GAME OVER';
    const clear = document.createElement('button'); clear.id='clear-leaderboard'; clear.className='btn clear'; clear.textContent='Clear';
    btnRow.appendChild(submit); btnRow.appendChild(clear); lb.appendChild(btnRow);
    const personal = document.createElement('div'); personal.id='personal-hiscore'; lb.appendChild(personal);
    gameContainer.appendChild(lb);

    // persistent cursor element: subtle chevron that orbits the avatar and points toward target
    const cursorEl = document.createElement('div');
    cursorEl.id = 'game-cursor';
    cursorEl.style.position = 'fixed';
    cursorEl.style.left = '0px';
    cursorEl.style.top = '0px';
    cursorEl.style.width = '24px';
    cursorEl.style.height = '24px';
    cursorEl.style.pointerEvents = 'none';
    cursorEl.style.zIndex = '9999';
    cursorEl.style.display = 'none'; // hidden until we have a position
    // Chevron SVG pointing upward (will be rotated via transform)
    cursorEl.innerHTML = `
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(0 0 4px rgba(0,255,255,0.7));">
            <path d="M12 6 L4 16 L8 16 L12 11 L16 16 L20 16 Z" fill="rgba(255,255,255,0.9)" stroke="rgba(0,220,255,0.8)" stroke-width="1"/>
        </svg>
    `;
    gameContainer.appendChild(cursorEl);

    // No CSS transitions - smoothing handled via JS lerping for better performance

    // controls
    const created = createControlButtons();
    return {
        canvasEl: cvs,
        scoreEl,
        instrEl: instr,
        splashEl: splash,
        splashTitleEl: h1,
        splashMessageEl: p,
        splashPromptEl: prompt,
        leaderboardEl: lb,
        leaderboardListEl: list,
        leaderboardFormEl: form,
        playerNameInputEl: ni,
        playerScoreInputEl: si,
        submitBtnEl: submit,
        clearBtnEl: clear,
        leaderboardCloseBtnEl: closeBtn,
        leaderboardAllListEl: listAll,
        leaderboardTabTopBtn: tabTop,
        leaderboardTabAllBtn: tabAll,
        audioBtn: created.audioBtn,
        leaderboardBtn: created.leaderboardBtn,
        pauseBtn: created.pauseBtn
        ,cursorEl
    };
}

const ui = createUI();
// expose shorthand variables used elsewhere
    canvas = ui.canvasEl;
    ctx = canvas.getContext('2d');
    scoreElement = ui.scoreEl;
    splashScreen = ui.splashEl;
    splashTitle = ui.splashTitleEl;
    splashMessage = ui.splashMessageEl;
    splashPrompt = ui.splashPromptEl;
    shootInstructions = ui.instrEl;
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

// Background music setup (autoplay may be blocked by browser policies)
const bgAudio = new Audio('assets/emojihunter.mp3');
bgAudio.loop = true;
bgAudio.preload = 'auto';
bgAudio.volume = 0.45;

// Pop sound for enemy death (cloned each play for overlap)
const popSoundBase = new Audio('assets/pop.mp3');
popSoundBase.preload = 'auto';

// Batch pop sound for rapid kills (3+ in 0.88s)
const popx3SoundBase = new Audio('assets/popx3.mp3');
popx3SoundBase.preload = 'auto';
popx3SoundBase.loop = true;

// Kill tracking for batch sound switching
let recentKillTimes = []; // timestamps of recent kills
let popx3Playing = false;
let popx3Instance = null;
let popx3StopTimeout = null;

function playPop() {
    if (isMuted) return;
    
    const now = performance.now();
    recentKillTimes.push(now);
    
    // Keep only kills within the last 880ms
    recentKillTimes = recentKillTimes.filter(t => now - t < 880);
    
    // If 3+ kills in 880ms, switch to batch sound
    if (recentKillTimes.length >= 3) {
        // Start or continue popx3
        if (!popx3Playing) {
            popx3Instance = popx3SoundBase.cloneNode();
            popx3Instance.loop = true;
            popx3Instance.volume = 0.35;
            popx3Instance.play().catch(() => {});
            popx3Playing = true;
        }
        
        // Reset the stop timer - keep playing until 1s gap
        if (popx3StopTimeout) clearTimeout(popx3StopTimeout);
        popx3StopTimeout = setTimeout(() => {
            if (popx3Instance) {
                popx3Instance.pause();
                popx3Instance.currentTime = 0;
                popx3Instance = null;
            }
            popx3Playing = false;
            recentKillTimes = [];
        }, 1000);
    } else if (!popx3Playing) {
        // Normal single pop for sparse kills
        const pop = popSoundBase.cloneNode();
        pop.volume = 0.3;
        pop.play().catch(() => {});
    }
}

// Await the first user gesture; the splash will be used to both enable audio and resume the game
let awaitingFirstGesture = true;
// Mute state persisted in localStorage
const MUTE_KEY = 'emojihunter_muted';
let isMuted = (localStorage.getItem(MUTE_KEY) === 'true');
if (isMuted) {
    bgAudio.muted = true;
    if (audioToggleBtn) audioToggleBtn.innerText = '🔈';
} else {
    bgAudio.muted = false;
    if (audioToggleBtn) audioToggleBtn.innerText = '🔊';
}

async function tryPlayAudio() {
    try {
        await bgAudio.play();
        // played successfully
        console.log('bgAudio playing');
    } catch (err) {
        // Autoplay was probably blocked; resume on first user gesture
        const resume = async () => {
                try {
                    await bgAudio.play();
                    console.log('bgAudio resumed after user gesture');
                } catch (e) {
                console.warn('bgAudio still blocked or failed to play', e);
            }
            window.removeEventListener('pointerdown', resume);
            window.removeEventListener('keydown', resume);
        };
    // If we're awaiting the first gesture and using the splash prompt, don't show any separate overlay.
        window.addEventListener('pointerdown', resume, { once: true });
        window.addEventListener('keydown', resume, { once: true });
    }
}
    // Audio pause/resume bookkeeping for visibility and pause behaviors
    let bgPausedByVisibility = false;
    let bgPausedByPause = false;
    let pendingVisibilityGesture = false;

if (audioToggleBtn) {
    audioToggleBtn.addEventListener('click',    () => {
        isMuted = !isMuted;
        bgAudio.muted = isMuted;
        localStorage.setItem(MUTE_KEY, isMuted ? 'true' : 'false');
        audioToggleBtn.innerText = isMuted ? '🔈' : '🔊';
        if (!isMuted) {
            // try to play immediately when unmuted
            tryPlayAudio();
        }
    });
}

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
const VIRTUAL_BASE = 600; // Base dimension - shortest side is always 600
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
let __lastTimestamp = null;
let __elapsedTime = 0;

// --- BACKGROUND IMAGE SYSTEM ---
let currentBackgroundImage = null;
let backgroundImages = {}; // Cache loaded background images
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
// UI breakpoint used by both CSS and JS. Keep in sync with `@media (min-width: 600px)` in index.html
const MINI_BREAKPOINT = 600;
// debounce interval for resize handling (ms)
const RESIZE_DEBOUNCE_MS = 100;
let __resizeTimer = null;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// -------------------------
// Obstacle system - emoji-based collidables
// -------------------------
// Cache for pre-rendered emoji sprites (Safari workaround)
const emojiSpriteCache = new Map();

// Pre-render emoji to offscreen canvas at specific size (forces Safari to scale)
function getEmojiSprite(emoji, size) {
    const key = `${emoji}_${size}`;
    if (emojiSpriteCache.has(key)) {
        return emojiSpriteCache.get(key);
    }
    
    // Create offscreen canvas slightly larger than needed
    const padding = Math.ceil(size * 0.2);
    const canvasSize = size + padding * 2;
    const offscreen = document.createElement('canvas');
    offscreen.width = canvasSize;
    offscreen.height = canvasSize;
    const offCtx = offscreen.getContext('2d');
    
    // Draw emoji centered on offscreen canvas
    offCtx.textAlign = 'center';
    offCtx.textBaseline = 'middle';
    offCtx.font = `${size}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
    offCtx.fillStyle = '#000';
    offCtx.fillText(emoji, canvasSize / 2, canvasSize / 2);
    
    // Cache the sprite
    const sprite = { canvas: offscreen, size: canvasSize };
    emojiSpriteCache.set(key, sprite);
    return sprite;
}

class Collidable {
    constructor(opts = {}) {
        this.x = Number(opts.x || 0);
        this.y = Number(opts.y || 0);
        this.emoji = opts.emoji || null;
        this.scale = Number(opts.scale || 1);
        this.id = opts.id || `c-${Math.random().toString(36).slice(2,9)}`;
        this.collidesWith = Object.assign({ dragon: true, pellets: true, enemies: false }, opts.collidesWith || {});
        this.active = true;
        // Hitbox radius = 25% of visual size for very tight collisions
        // Visual size: 32px * scale, so hitbox = 16 * scale * 0.25
        // Cap at 20px to keep large obstacles fair
        const visualRadius = 26 * this.scale;
        this.radius = Number(opts.radius || Math.min(20, visualRadius * 0.6));
    }

    // Push-out vector for circle collision
    getPushOutVector(cx, cy, r) {
        const dx = cx - this.x;
        const dy = cy - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const overlap = (r + this.radius) - dist;
        if (overlap > 0) {
            return { dx: (dx / dist) * (overlap + 1), dy: (dy / dist) * (overlap + 1) };
        }
        return { dx: 0, dy: 0 };
    }

    getBounds() {
        return { x: this.x - this.radius, y: this.y - this.radius, w: this.radius * 2, h: this.radius * 2 };
    }

    intersectsCircle(cx, cy, r) {
        if (!this.active) return false;
        const dx = cx - this.x;
        const dy = cy - this.y;
        return (dx * dx + dy * dy) <= ((r + this.radius) * (r + this.radius));
    }

    draw(ctx) {
        if (!this.emoji) return;
        const scale = (this.scale > 0) ? this.scale : 1;
        const fontSize = Math.max(16, Math.floor(32 * scale));
        
        // DEBUG: Draw hitbox circle (red with transparency)
        ctx.save();
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 0, 0, 0.3)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 0, 0, 0.8)';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();
        
        // Use pre-rendered sprite (Safari-safe scaling)
        const sprite = getEmojiSprite(this.emoji, fontSize);
        const drawSize = sprite.size;
        ctx.drawImage(
            sprite.canvas,
            this.x - drawSize / 2,
            this.y - drawSize / 2,
            drawSize,
            drawSize
        );
    }

    clampToViewport(w, h) {
        if (this.x + this.radius < 0 || this.x - this.radius > w || this.y + this.radius < 0 || this.y - this.radius > h) return false;
        this.x = Math.max(this.radius, Math.min(this.x, w - this.radius));
        this.y = Math.max(this.radius, Math.min(this.y, h - this.radius));
        return true;
    }
}

class CollidableManager {
    constructor() {
        this.list = [];
        this.grid = new Map();
        this.cellSize = 128;
        this._pfCache = null;
        this._pfDirty = true;
    }
    clear() { this.list.length = 0; }
    set(arr) { this.list = arr.slice(); this._pfDirty = true; }
    add(c) { this.list.push(c); this._pfDirty = true; }
    getAll() { return this.list.slice(); }
    draw(ctx) { this.list.forEach(c => c.draw(ctx)); }

    // sanitize: deactivate collidables fully outside viewport
    sanitize(viewW, viewH) {
        this.list.forEach(c => {
            const b = c.getBounds();
            if (b.x + b.w < 0 || b.x > viewW || b.y + b.h < 0 || b.y > viewH) {
                c.active = false;
            } else {
                c.active = true;
            }
        });
    }

    // broadphase AABB then exact intersectsCircle
    queryCircle(cx, cy, r, { groups = null } = {}) {
        // Use spatial grid to reduce candidates
        const bx = Math.floor((cx - r) / this.cellSize);
        const by = Math.floor((cy - r) / this.cellSize);
        const ex = Math.floor((cx + r) / this.cellSize);
        const ey = Math.floor((cy + r) / this.cellSize);
        const seen = new Set();
        const candidates = [];
        for (let gx = bx; gx <= ex; gx++) {
            for (let gy = by; gy <= ey; gy++) {
                const key = gx + ',' + gy;
                const cell = this.grid.get(key);
                if (!cell) continue;
                for (let i = 0; i < cell.length; i++) {
                    const c = cell[i];
                    if (!c || !c.active) continue;
                    if (seen.has(c.id)) continue;
                    seen.add(c.id);
                    candidates.push(c);
                }
            }
        }
        // fallback: if grid empty, use list
        const listToTest = (candidates.length > 0) ? candidates : this.list;
        const out = [];
        for (let i = 0; i < listToTest.length; i++) {
            const c = listToTest[i];
            if (!c || !c.active) continue;
            if (groups) {
                let ok = false;
                for (const k in groups) { if (groups[k] && c.collidesWith[k]) { ok = true; break; } }
                if (!ok) continue;
            }
            if (c.intersectsCircle(cx, cy, r)) out.push(c);
        }
        return out;
    }

    // Build spatial grid covering current world; call after set() or on resize
    buildGrid(cellSize = 128, viewW = WORLD_WIDTH, viewH = WORLD_HEIGHT) {
        this.cellSize = Math.max(32, Number(cellSize) || 128);
        this.grid.clear();
        this.gridCols = Math.ceil(viewW / this.cellSize);
        this.gridRows = Math.ceil(viewH / this.cellSize);
        for (let i = 0; i < this.list.length; i++) {
            const c = this.list[i];
            if (!c) continue;
            const b = c.getBounds();
            const sx = Math.floor(b.x / this.cellSize);
            const sy = Math.floor(b.y / this.cellSize);
            const ex = Math.floor((b.x + b.w) / this.cellSize);
            const ey = Math.floor((b.y + b.h) / this.cellSize);
            for (let gx = sx; gx <= ex; gx++) {
                for (let gy = sy; gy <= ey; gy++) {
                    const key = gx + ',' + gy;
                    if (!this.grid.has(key)) this.grid.set(key, []);
                    this.grid.get(key).push(c);
                }
            }
        }
    }

    // Step any moving collidables according to elapsed time (seconds). Returns true if any moved.
    stepMovers(elapsedTime) {
        if (!this.list || !this.list.length) return false;
        let moved = false;
        for (let i = 0; i < this.list.length; i++) {
            const c = this.list[i];
            if (!c || !c.moving || !c.motion) continue;
            const m = c.motion;
            const offset = Math.sin(elapsedTime * m.speed + m.phase) * m.amplitude;
            if (m.dir === 'horizontal') {
                const nx = (c.baseX || 0) + offset;
                if (Math.abs(nx - c.x) > 0.001) { c.x = nx; moved = true; }
            } else {
                const ny = (c.baseY || 0) + offset;
                if (Math.abs(ny - c.y) > 0.001) { c.y = ny; moved = true; }
            }
        }
        return moved;
    }

    // Build a boolean occupancy grid for pathfinding. Cells marked true are blocked for given radius.
    // This method caches the last-built grid and will reuse it when possible. It defaults to world
    // dimensions so pathfinding is stable across resizes.
    buildPathfindingGrid(cellSize = 32, padding = 0, viewW = WORLD_WIDTH, viewH = WORLD_HEIGHT) {
        const cs = Math.max(8, Number(cellSize) || 32);
        // if cached and matches cellSize & padding and not dirty, return it
        if (this._pfCache && !this._pfDirty && this._pfCache.cs === cs && this._pfCache.padding === padding && this._pfCache.viewW === viewW && this._pfCache.viewH === viewH) {
            return this._pfCache;
        }
        const cols = Math.ceil(viewW / cs);
        const rows = Math.ceil(viewH / cs);
        const grid = new Array(cols * rows).fill(false);
        for (let i = 0; i < this.list.length; i++) {
            const c = this.list[i];
            if (!c || !c.active) continue;
            const b = c.getBounds();
            const sx = Math.max(0, Math.floor((b.x - padding) / cs));
            const sy = Math.max(0, Math.floor((b.y - padding) / cs));
            const ex = Math.min(cols - 1, Math.floor((b.x + b.w + padding) / cs));
            const ey = Math.min(rows - 1, Math.floor((b.y + b.h + padding) / cs));
            for (let gx = sx; gx <= ex; gx++) {
                for (let gy = sy; gy <= ey; gy++) {
                    grid[gy * cols + gx] = true; // blocked
                }
            }
        }
        const out = { grid, cols, rows, cs, padding, viewW, viewH };
        this._pfCache = out;
        this._pfDirty = false;
        return out;
    }

    // Simple A* on the occupancy grid; returns array of world-space points or null
    findPath(startX, startY, targetX, targetY, radius = 0, cellSize = 32) {
        // Build or reuse occupancy grid in world coordinates
        const pf = this.buildPathfindingGrid(cellSize, radius, WORLD_WIDTH, WORLD_HEIGHT);
        const { grid, cols, rows, cs } = pf;
        const toIndex = (x, y) => y * cols + x;
        const sx = Math.max(0, Math.min(cols - 1, Math.floor(startX / cs)));
        const sy = Math.max(0, Math.min(rows - 1, Math.floor(startY / cs)));
        const tx = Math.max(0, Math.min(cols - 1, Math.floor(targetX / cs)));
        const ty = Math.max(0, Math.min(rows - 1, Math.floor(targetY / cs)));
        if (grid[toIndex(tx, ty)]) return null; // target blocked

        const open = new Map();
        const closed = new Set();
        const cameFrom = new Map();
        const gScore = new Map();
        const fScore = new Map();
        const key = (x, y) => x + ',' + y;
        const heuristic = (x, y) => Math.hypot(tx - x, ty - y);
        const startKey = key(sx, sy);
        open.set(startKey, { x: sx, y: sy });
        gScore.set(startKey, 0);
        fScore.set(startKey, heuristic(sx, sy));

        const neighbors = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];

        while (open.size) {
            // pick node in open with lowest fScore
            let currentKey = null; let currentF = Infinity; let current = null;
            for (const [k, v] of open) {
                const f = fScore.get(k) || Infinity;
                if (f < currentF) { currentF = f; currentKey = k; current = v; }
            }
            if (!current) break;
            if (current.x === tx && current.y === ty) {
                // reconstruct path
                const path = [];
                let k = currentKey;
                while (k) {
                    const [px, py] = k.split(',').map(Number);
                    path.push({ x: px * cs + cs/2, y: py * cs + cs/2 });
                    k = cameFrom.get(k);
                }
                path.reverse();
                return path;
            }
            open.delete(currentKey);
            closed.add(currentKey);

            for (let ni = 0; ni < neighbors.length; ni++) {
                const nx = current.x + neighbors[ni][0];
                const ny = current.y + neighbors[ni][1];
                if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
                const nKey = key(nx, ny);
                if (closed.has(nKey)) continue;
                if (grid[ny * cols + nx]) continue; // blocked
                const tentativeG = (gScore.get(currentKey) || Infinity) + ((neighbors[ni][0] && neighbors[ni][1]) ? 1.414 : 1);
                if (!open.has(nKey)) open.set(nKey, { x: nx, y: ny });
                if (tentativeG >= (gScore.get(nKey) || Infinity)) continue;
                cameFrom.set(nKey, currentKey);
                gScore.set(nKey, tentativeG);
                fScore.set(nKey, tentativeG + heuristic(nx, ny));
            }
        }
        return null; // no path
    }
}

// manager instance (current level)
let collidableManager = new CollidableManager();

// monsterMap: monsterId -> monsterData (from monsters.json)
let monsterMap = {};

// 6-point positioning system for obstacles
function calculateObstaclePosition(position, radiusWorld, w = 0, h = 0) {
    const marginPx = 32; // spacing from viewport edge
    let x, y, movementPath = null;
    
    switch (position) {
        case '.topLeading': // Legacy - redirect to .leading
        case '.bottomLeading': // Legacy - redirect to .leading  
        case '.leading': // Consolidated left-side vertical mover
            x = marginPx + radiusWorld;
            y = WORLD_HEIGHT / 2; // Center vertically
            // Vertical movement staying within viewport bounds
            movementPath = {
                direction: 'vertical',
                amplitude: Math.min(
                    (WORLD_HEIGHT / 2) - marginPx - radiusWorld, // Distance to top
                    (WORLD_HEIGHT / 2) - marginPx - radiusWorld  // Distance to bottom
                )
            };
            break;
        case '.top': // 1
            x = WORLD_WIDTH / 2;
            y = marginPx + radiusWorld;
            // Horizontal movement reaching both edges
            movementPath = {
                direction: 'horizontal',
                amplitude: (WORLD_WIDTH / 2) - marginPx - radiusWorld
            };
            break;
        case '.topTrailing': // Legacy - redirect to .trailing
        case '.bottomTrailing': // Legacy - redirect to .trailing
        case '.trailing': // Consolidated right-side vertical mover
            x = WORLD_WIDTH - marginPx - radiusWorld;
            y = WORLD_HEIGHT / 2; // Center vertically
            // Vertical movement staying within viewport bounds
            movementPath = {
                direction: 'vertical',
                amplitude: Math.min(
                    (WORLD_HEIGHT / 2) - marginPx - radiusWorld, // Distance to top
                    (WORLD_HEIGHT / 2) - marginPx - radiusWorld  // Distance to bottom
                )
            };
            break;
        case '.center': // 0
            x = WORLD_WIDTH / 2;
            y = WORLD_HEIGHT / 2;
            // Horizontal movement reaching both edges
            movementPath = {
                direction: 'horizontal',
                amplitude: (WORLD_WIDTH / 2) - marginPx - radiusWorld
            };
            break;
        case '.centerVertical': // Vertical counterpart to .center
            x = WORLD_WIDTH / 2;
            y = WORLD_HEIGHT / 2;
            // Vertical movement reaching top and bottom edges
            movementPath = {
                direction: 'vertical',
                amplitude: (WORLD_HEIGHT / 2) - marginPx - radiusWorld
            };
            break;
        case '.bottom': // 2
            x = WORLD_WIDTH / 2;
            y = WORLD_HEIGHT - marginPx - radiusWorld;
            // Horizontal movement reaching both edges
            movementPath = {
                direction: 'horizontal',
                amplitude: (WORLD_WIDTH / 2) - marginPx - radiusWorld
            };
            break;
        default:
            return null;
    }
    
    return { x, y, movementPath };
}

async function loadLevelsAndMonsters() {
    // load monsters
    try {
        const mResp = await fetch('assets/monsters.json');
        const monstersArr = await mResp.json();
        monstersArr.forEach(m => { monsterMap[m.monster] = m; });
    } catch (err) {
        console.error('Failed to load monsters.json', err);
    }

    // load levels
    try {
        const lResp = await fetch('assets/levels.json');
        const levelsArr = await lResp.json();
        // load reusable obstacle definitions (emoji, positions, scale, direction)
        let obstaclesArr = [];
        try {
            const oResp = await fetch('assets/obstacles.json');
            obstaclesArr = await oResp.json();
        } catch (e) {
            console.warn('Failed to load obstacles.json; continuing without obstacle presets', e);
        }
        // map by name (support either `name` or legacy `obstacles` key)
        const obstaclesMap = new Map();
        obstaclesArr.forEach(o => {
            const key = (o.name || o.obstacles || '').toString().trim();
            if (key) obstaclesMap.set(key, o);
        });
        // Store globally for endless mode obstacle generation
        window.__obstaclesMap = obstaclesMap;
        levelsArr.forEach(l => {
            const monsterIds = String(l.emoji || '').split(',').map(s => s.trim()).filter(Boolean);
            const monsters = monsterIds.map(id => monsterMap[id]).filter(Boolean);
            
            // Build obstacles from level config
            const obstacleSpec = l.obstacles || [];
            const collidables = [];

            obstacleSpec.forEach(obstacleEntry => {
                const { name, set } = obstacleEntry;
                const def = obstaclesMap.get(name);
                if (!def) return;
                
                const scale = Math.max(1, Number(def.scale || 1));
                // Hitbox: fixed 20px max - easy to tune
                const radius = 20;
                const speed = Number(def.speed || 1);

                set.forEach(position => {
                    const positionData = calculateObstaclePosition(position, radius, 0, 0);
                    if (!positionData) return;

                    const { x, y, movementPath } = positionData;
                    
                    const collidable = new Collidable({
                        x, y, radius,
                        emoji: def.emoji,
                        scale,
                        collidesWith: { dragon: true, pellets: true, enemies: true }
                    });
                    
                    collidable.positionToken = position;
                    
                    if (movementPath) {
                        collidable.moving = true;
                        collidable.baseX = x;
                        collidable.baseY = y;
                        collidable.motion = {
                            dir: movementPath.direction,
                            speed: speed * 0.5,
                            amplitude: movementPath.amplitude,
                            phase: Math.random() * Math.PI * 2
                        };
                    }
                    
                    collidables.push(collidable);
                });
            });

            levels[l.level] = {
                level: l.level, // Include level key for LevelWatcher parsing
                target: l.target || 50,
                monsters: monsters.length ? monsters : [{ monster: 'oni', emoji: '👹', normalHp: 1, bossHp: 2, enemySpeed: 0.5 }],
                aimSpeed: l.aimSpeed || 1,
                spawnRate: l.spawnRate || 1,
                collidables: collidables,
                multiplier: (l.multiplier !== undefined) ? Number(l.multiplier) : 2,
                background: l.background || 'assets/levelbackgrounds/defaultbg.png'
            };
        });
    } catch (err) {
        console.error('Failed to load levels.json', err);
    }
}
        
// LevelWatcher class to manage the game's level progression.
class LevelWatcher {
    constructor(levels) {
        // Separate numbered levels from postgame
        this.postgameConfig = null;
        this.levels = {};
        
        // Parse levels - separate postgame from numbered levels
        Object.values(levels).forEach(level => {
            if (level.level === 'postgame') {
                this.postgameConfig = level;
            } else {
                this.levels[level.level] = level;
            }
        });
        
        this.currentLevel = 1;
        this.maxLevel = Math.max(...Object.keys(this.levels).map(Number));
        this.isEndlessMode = false;
    }

    nextLevel() {
        if (this.currentLevel < this.maxLevel) {
            this.currentLevel++;
            return true;
        } else {
            // Enter postgame/endless mode after final level
            this.isEndlessMode = true;
            return true;
        }
    }

    reset() {
        this.currentLevel = 1;
        this.isEndlessMode = false;
    }

    getLevelConfig() {
        if (this.isEndlessMode && this.postgameConfig) {
            return { ...this.postgameConfig, target: Infinity };
        }
        return this.levels[this.currentLevel];
    }

    isLastLevel() {
        return !this.isEndlessMode && this.currentLevel === this.maxLevel;
    }

    isInEndlessMode() {
        return this.isEndlessMode;
    }

    getDisplayLevel() {
        return this.isEndlessMode ? 'Endless' : this.currentLevel;
    }
}
        
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
let boostTimeout = null;
const BOOST_DURATION = 500 ; // ms (boost lasts 1 second - shows activated sprite)
// Cooldown removed - boost is now freely available but shorter and less powerful

// gameLoopInterval = setInterval(spawnEnemy, 1000); // Always 1 enemy per second Session-wide kill counter (persists across levels during a single play session)
let sessionKills = 0;

// Performance optimization variables
let lastFrameTime = 0;
const TARGET_FPS = 60;
const FRAME_TIME = 1000 / TARGET_FPS;
let frameCount = 0;
let lastFPSCheck = 0;

function resizeCanvas() {
    // Use game container size instead of window to account for nav bar
    const containerRect = gameContainer.getBoundingClientRect();
    const cssWidth = Math.floor(containerRect.width) || window.innerWidth;
    const cssHeight = Math.floor(containerRect.height) || window.innerHeight;
    let dpr = Math.max(1, window.devicePixelRatio || 1);
    
    // Reduce DPR on mobile devices for better performance
    const isMobile = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth <= 768;
    if (isMobile) {
        dpr = Math.min(dpr, 1.5); // Cap DPR at 1.5 for mobile
    }
    
    // Don't set CSS size - let CSS handle layout via 100% width/height
    // Just set the drawing buffer to match container size * DPR
    canvas.width = Math.round(cssWidth * dpr);
    canvas.height = Math.round(cssHeight * dpr);

    // ADAPTIVE VIRTUAL CANVAS: Adjust dimensions to match viewport aspect ratio
    // This eliminates letterboxing - the entire canvas is playable area
    const screenAspect = cssWidth / cssHeight;
    
    if (screenAspect >= 1) {
        // Landscape/Desktop: height is base, width expands
        VIRTUAL_HEIGHT = VIRTUAL_BASE;
        VIRTUAL_WIDTH = Math.round(VIRTUAL_BASE * screenAspect);
    } else {
        // Portrait/Mobile: width is base, height expands
        VIRTUAL_WIDTH = VIRTUAL_BASE;
        VIRTUAL_HEIGHT = Math.round(VIRTUAL_BASE / screenAspect);
    }
    
    // Scale maps virtual coords to screen coords (no letterboxing needed)
    canvasScale = cssWidth / VIRTUAL_WIDTH; // Same as cssHeight / VIRTUAL_HEIGHT
    canvasOffsetX = 0;
    canvasOffsetY = 0;
    
    // World size matches virtual dimensions
    WORLD_WIDTH = VIRTUAL_WIDTH;
    WORLD_HEIGHT = VIRTUAL_HEIGHT;
    camera.scale = canvasScale;
    camera.offsetX = canvasOffsetX;
    camera.offsetY = canvasOffsetY;
    // store DPR for use when setting canvas transforms in rendering
    camera.dpr = dpr;
    // center target in world coordinates
    target.x = WORLD_WIDTH / 2;
    target.y = WORLD_HEIGHT / 2;
    // Apply responsive class for narrow or short screens
    try {
    // Use a single width-based breakpoint: treat widths <= MINI_BREAKPOINT as 'mini' layout
    const shouldMini = (window.innerWidth <= MINI_BREAKPOINT);
        document.body.classList.toggle('miniScreen', shouldMini);
    } catch (e) {}
    if (!avatarPosition.x) initializeAvatar();
    // rebuild spatial grid in world units and sanitize collidables against world bounds
    try {
        if (collidableManager) {
            collidableManager.buildGrid(collidableManager.cellSize || 128, WORLD_WIDTH, WORLD_HEIGHT);
            collidableManager.sanitize(WORLD_WIDTH, WORLD_HEIGHT);
            // Reposition all obstacles based on their position tokens for responsive layout
            try {
                if (levelWatcher) {
                    const levelConfig = levelWatcher.getLevelConfig();
                    (levelConfig.collidables || []).forEach(c => {
                        if (c && c.positionToken) {
                            // Recalculate position using the stored token and current viewport
                            const positionData = calculateObstaclePosition(c.positionToken, c.originalRadius || c.radius);
                            if (positionData) {
                                c.x = positionData.x;
                                c.y = positionData.y;
                                c.baseX = positionData.x;
                                c.baseY = positionData.y;
                                
                                // Update movement path for new viewport size
                                if (c.moving && positionData.movementPath) {
                                    c.motion.amplitude = positionData.movementPath.amplitude;
                                }
                            }
                        }
                    });
                    // rebuild grid after repositioning
                    collidableManager.buildGrid(collidableManager.cellSize || 128, WORLD_WIDTH, WORLD_HEIGHT);
                }
            } catch (e) {
                console.warn('Error repositioning obstacles on resize:', e);
            }
        }
    } catch (e) {}
}

// Coordinate helpers: convert between screen/client pixels and world units
function screenToWorld(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const cx = clientX - rect.left;
    const cy = clientY - rect.top;
    const wx = (cx - (camera.offsetX || 0)) / (camera.scale || 1);
    const wy = (cy - (camera.offsetY || 0)) / (camera.scale || 1);
    return { x: wx, y: wy };
}

function worldToScreen(wx, wy) {
    const sx = (wx * (camera.scale || 1)) + (camera.offsetX || 0);
    const sy = (wy * (camera.scale || 1)) + (camera.offsetY || 0);
    return { x: sx, y: sy };
}

function initializeAvatar() {
    avatarPosition = {
        x: WORLD_WIDTH / 2,
        y: WORLD_HEIGHT / 2,
        angle: 0
    };
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
            const avatarScr = worldToScreen(avatarPosition.x, avatarPosition.y);
            const targetScr = worldToScreen(target.x, target.y);
            
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

// Avatar sprite assets - Lottie animations rendered to offscreen canvases
let avatarSprites = {
    default: { anim: null, canvas: null, ctx: null, ready: false },
    activated: { anim: null, canvas: null, ctx: null, ready: false }
};

const SPRITE_SIZE = 200; // Size of the offscreen canvas for Lottie rendering

// Load avatar sprites using Lottie
function loadAvatarSprites() {
    const sprites = [
        { name: 'default', src: 'assets/spritedefault.json' },
        { name: 'activated', src: 'assets/spriteactivated.json' }
    ];

    const promises = sprites.map(({ name, src }) => {
        return new Promise((resolve) => {
            // Create offscreen canvas for this sprite
            const offCanvas = document.createElement('canvas');
            offCanvas.width = SPRITE_SIZE;
            offCanvas.height = SPRITE_SIZE;
            const offCtx = offCanvas.getContext('2d');
            
            // Create hidden container for Lottie to render into
            const container = document.createElement('div');
            container.style.cssText = `position:absolute;left:-9999px;top:-9999px;width:${SPRITE_SIZE}px;height:${SPRITE_SIZE}px;`;
            document.body.appendChild(container);
            
            // Load Lottie animation
            const anim = lottie.loadAnimation({
                container: container,
                renderer: 'canvas',
                loop: true,
                autoplay: true,
                path: src
            });
            
            anim.addEventListener('DOMLoaded', () => {
                avatarSprites[name] = {
                    anim: anim,
                    container: container,
                    canvas: offCanvas,
                    ctx: offCtx,
                    ready: true
                };
                resolve();
            });
            
            anim.addEventListener('error', () => {
                console.warn(`Failed to load Lottie sprite: ${src}`);
                resolve();
            });
        });
    });
    
    return Promise.all(promises);
}

// Get current frame from Lottie animation as drawable canvas
function getLottieSpriteCanvas(spriteName) {
    const sprite = avatarSprites[spriteName];
    if (!sprite || !sprite.ready || !sprite.anim) return null;
    
    // Get the internal canvas from Lottie's canvas renderer
    const lottieCanvas = sprite.container.querySelector('canvas');
    if (lottieCanvas) {
        return lottieCanvas;
    }
    return null;
}

// --- PARALLAX BACKGROUND RENDERING ---
// Draw the level background with subtle 3D parallax + tilt effect based on cursor position
// Creates an iOS Maps-style photoscopic effect where the background shifts AND tilts toward cursor
// Smoothed cursor tracking for fluid movement
let smoothCursorX = VIRTUAL_WIDTH / 2;
let smoothCursorY = VIRTUAL_HEIGHT / 2;
const CURSOR_SMOOTHING = 0.08; // Lower = smoother/slower (0.05-0.15 range)

// Draw background to fill ENTIRE canvas (including letterbox/pillarbox areas)
// This is called BEFORE the virtual coordinate transform is applied
// On mobile (<600px), scales 16:9 images to fill 9:16 canvas (crops sides)
function drawParallaxBackgroundFullCanvas() {
    if (!currentBackgroundImage) {
        return; // Let the solid color fill from animate() show through
    }
    
    const img = currentBackgroundImage;
    const _dpr = (camera && camera.dpr) ? camera.dpr : 1;
    
    // Get actual canvas dimensions in CSS pixels
    const canvasW = canvas.width / _dpr;
    const canvasH = canvas.height / _dpr;
    
    // Smooth cursor tracking - lerp toward actual cursor position
    smoothCursorX += (target.x - smoothCursorX) * CURSOR_SMOOTHING;
    smoothCursorY += (target.y - smoothCursorY) * CURSOR_SMOOTHING;
    
    // Normalize smoothed cursor position to -1 to 1 range from center (in virtual coords)
    const centerVirtualX = VIRTUAL_WIDTH / 2;
    const centerVirtualY = VIRTUAL_HEIGHT / 2;
    const cursorOffsetX = (smoothCursorX - centerVirtualX) / centerVirtualX; // -1 to 1
    const cursorOffsetY = (smoothCursorY - centerVirtualY) / centerVirtualY; // -1 to 1
    
    // === PARALLAX SHIFT (scaled to canvas size) ===
    const maxShiftRatio = 0.02; // 2% of canvas size max shift
    const shiftX = cursorOffsetX * canvasW * maxShiftRatio;
    const shiftY = cursorOffsetY * canvasH * maxShiftRatio;
    
    // === 3D TILT (Photoscopic Effect) ===
    const maxTilt = 0.015;
    const tiltX = cursorOffsetY * maxTilt;
    const tiltY = cursorOffsetX * maxTilt;
    
    // Calculate draw size to COVER entire canvas with oversize for parallax + tilt
    const oversize = Math.max(canvasW, canvasH) * 0.1; // 10% extra
    const imgAspect = img.width / img.height; // Use original image aspect ratio
    const canvasAspect = canvasW / canvasH;
    
    let drawWidth, drawHeight;
    
    // Cover entire canvas - scale to fill (crop overflow)
    // For landscape image on portrait canvas: scale by height, crop width
    // For portrait image on landscape canvas: scale by width, crop height
    if (imgAspect > canvasAspect) {
        // Image is wider than canvas - fit to height, width will overflow/crop
        drawHeight = canvasH + oversize;
        drawWidth = drawHeight * imgAspect;
    } else {
        // Image is taller than canvas - fit to width, height will overflow/crop
        drawWidth = canvasW + oversize;
        drawHeight = drawWidth / imgAspect;
    }
    
    // Center coordinates (in actual canvas space)
    const centerX = canvasW / 2;
    const centerY = canvasH / 2;
    
    // Save and reset to screen coordinates for background
    ctx.save();
    ctx.setTransform(_dpr, 0, 0, _dpr, 0, 0); // Reset to 1:1 screen pixels
    
    // Apply 3D tilt transform from center
    const scaleBoost = 1.02;
    ctx.translate(centerX, centerY);
    ctx.transform(scaleBoost, tiltX, tiltY, scaleBoost, 0, 0);
    ctx.translate(-centerX, -centerY);
    
    // Draw centered with parallax shift - image scales to fill, excess is cropped
    const drawX = (canvasW - drawWidth) / 2 + shiftX;
    const drawY = (canvasH - drawHeight) / 2 + shiftY;
    ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);
    
    // Subtle vignette overlay
    const gradient = ctx.createRadialGradient(
        centerX, centerY, Math.min(canvasW, canvasH) * 0.35,
        centerX, centerY, Math.max(canvasW, canvasH) * 0.6
    );
    gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0.25)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvasW, canvasH);
    
    ctx.restore();
}

// Legacy function kept for compatibility - now just a no-op since background is drawn separately
function drawParallaxBackground() {
    // Background is now drawn by drawParallaxBackgroundFullCanvas() before the virtual transform
    // This function is kept for any code that calls it directly
}

function drawAvatar() {
    // If Lottie sprite isn't loaded yet, skip drawing
    const spriteKey = isBoosting ? 'activated' : 'default';
    const lottieCanvas = getLottieSpriteCanvas(spriteKey);
    if (!lottieCanvas) return;

    // Direction logic - determine if avatar should face left
    const dx = target.x - avatarPosition.x;
    const dy = target.y - avatarPosition.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const isMovingLeft = distance > 5 ? dx < 0 : target.x < avatarPosition.x;

    ctx.save();
    
    // Size the avatar
    const avatarSize = AVATAR_SIZE * 8;
    const imgWidth = avatarSize;
    const imgHeight = avatarSize;
    const verticalOffset = -2;
    
    // Draw the avatar (outline effects removed for Safari compatibility)
    ctx.drawImage(
        lottieCanvas,
        avatarPosition.x - imgWidth / 2,
        avatarPosition.y - imgHeight / 2 + verticalOffset,
        imgWidth,
        imgHeight
    );
    
    // Add hit effect overlay
    if (avatarHit) {
        ctx.globalCompositeOperation = 'source-atop';
        ctx.fillStyle = 'rgba(138, 43, 226, 0.5)';
        ctx.fillRect(
            avatarPosition.x - imgWidth / 2,
            avatarPosition.y - imgHeight / 2 + verticalOffset,
            imgWidth,
            imgHeight
        );
    }
    
    ctx.restore();
}

function drawCollidables() {
    // Use the collidable manager to draw all obstacles
    try {
        if (collidableManager && typeof collidableManager.draw === 'function') {
            collidableManager.draw(ctx);
        }
    } catch (e) {}
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

function drawPellets() {
    projectiles.forEach(p => {
        ctx.save();
        
        // Draw outer glow
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 2.5, 0, Math.PI * 2);
        ctx.fillStyle = p.color.replace('100%', '30%').replace('50%', '20%'); // dimmer outer glow
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 25;
        ctx.globalAlpha = 0.3;
        ctx.fill();
        
        // Draw main pellet with enhanced glow
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 20;
        ctx.fill();
        
        // Draw bright inner core
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 0.6, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.shadowColor = 'rgba(255,255,255,0.9)';
        ctx.shadowBlur = 8;
        ctx.fill();
        
        ctx.restore();
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

function drawEnemies() {
    const now = performance.now();
    
    enemies.forEach(enemy => {
        // Initialize spawn time for breathing animation
        if (!enemy.spawnTime) enemy.spawnTime = now;
        
        // Breathing animation: 0.5s cycle (2Hz), subtle 8% size variation
        const breathCycle = 500; // 0.5 seconds in ms
        const breathPhase = ((now - enemy.spawnTime) % breathCycle) / breathCycle; // 0 to 1
        const breathScale = 1 + Math.sin(breathPhase * Math.PI * 2) * 0.08; // 0.92 to 1.08
        
        // Use consistent sizing across all devices - no DPR scaling for uniform appearance
        const baseSize = Math.max(16, Math.floor(enemy.size * 0.8)); // Direct pixel-based sizing
        const fontSize = Math.floor(baseSize * breathScale);
        
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = `${fontSize + 20}px sans-serif`;
        ctx.fillStyle = '#000'; // Required for Safari
        ctx.fillText(enemy.emoji, enemy.x, enemy.y);
        ctx.restore();
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
    try {
        if (!bgAudio.paused) {
            bgAudio.pause();
            bgPausedByPause = true;
        } else {
            bgPausedByPause = false;
        }
    } catch (e) {}
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
    pelletInterval = setInterval(shootPellet, 1000 / (levelConfig.aimSpeed || 1));
    requestAnimationFrame(animate);
    // resume audio if it was paused by pause (but don't override visibility-paused state)
    try {
        if (!isMuted) {
            if (bgPausedByVisibility) {
                // if we were paused due to visibility, wait for a user gesture to resume audio
                // unless a pending visibility gesture was already received
                if (pendingVisibilityGesture) {
                    tryPlayAudio();
                    bgPausedByVisibility = false;
                    pendingVisibilityGesture = false;
                }
            } else {
                // resume audio when unpausing from user-initiated pause
                tryPlayAudio();
                bgPausedByPause = false;
            }
        }
    } catch (e) {}
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
    try {
        if (!bgAudio.paused) {
            bgAudio.pause();
            bgPausedByPause = true;
        }
    } catch (e) {}
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
    requestAnimationFrame(animate);
    if (shootInstructions) shootInstructions.innerText = getBoostStatusText();
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
    requestAnimationFrame(animate);
    if (shootInstructions) shootInstructions.innerText = getBoostStatusText();
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

function animate() {
    // Frame rate limiting for mobile performance
    const currentTime = performance.now();
    if (currentTime - lastFrameTime < FRAME_TIME) {
        requestAnimationFrame(animate);
        return;
    }
    lastFrameTime = currentTime;
    
    // timestamp-driven loop: use requestAnimationFrame timestamp to compute dt
    const now = performance.now();
    if (__lastTimestamp == null) __lastTimestamp = now;
    const rawDt = (now - __lastTimestamp) / 1000;
    // clamp dt to avoid huge jumps when the tab was backgrounded
    const dt = Math.min(0.05, rawDt);
    __lastTimestamp = now;

    if (isPaused) {
        // still update timestamp but don't advance simulation
        requestAnimationFrame(animate);
        return;
    }

    // Clear entire canvas in screen (pixel) coordinates
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = 'rgba(13, 17, 23, 1)'; // Solid black for letterbox/pillarbox areas
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';
    
    // Draw parallax background to fill ENTIRE canvas (before virtual transform)
    drawParallaxBackgroundFullCanvas();

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
    __elapsedTime += dt;
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

    updateAvatar(dt);
    updatePellets(dt);
    try { checkPelletCollidableCollision(); } catch (e) {}
    updateEnemies(dt);

    checkAvatarCollidableCollision();
    checkAvatarEnemyCollision();
    checkPelletEnemyCollision();

    // Draw scene in world coordinates
    drawCollidables();
    drawAvatar();
    drawPellets();
    drawEnemies();

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

    requestAnimationFrame(animate);
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
    return 'Tap to boost';
}

function startBoost() {
    // Quick burst boost: no cooldown, shorter duration, less powerful but freely usable
    if (isPaused || !levelWatcher || isBoosting) return;
    
    const levelConfig = levelWatcher.getLevelConfig();
    if (!levelConfig) return;

    isBoosting = true;
    
    // update UI
    if (shootInstructions) shootInstructions.innerText = 'Boosted!';
    
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
        if (shootInstructions) shootInstructions.innerText = getBoostStatusText();
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
    const worldPos = screenToWorld(x, y);
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
    await loadLevelsAndMonsters();
    await loadAvatarSprites(); // Load avatar sprite images
    // create a LevelWatcher now that `levels` is populated
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
    if (shootInstructions) shootInstructions.innerText = 'Tap to shoot faster';
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
        const newState = !leaderboardVisible;
        setLeaderboardVisibility(newState, true);
        // if opening the leaderboard while playing, pause the game
        if (newState && !isPaused && !isGameOver) {
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
        if (isPaused && !isGameOver) {
            resumeGame();
        } else {
            pauseGame();
        }
    });
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
window.addEventListener('visibilitychange', () => {
    try {
        if (document.hidden) {
            // pause music when tab/window is not active
            if (!bgAudio.paused) {
                bgAudio.pause();
                bgPausedByVisibility = true;
            }
        } else {
            // When tab becomes visible again, wait for a user gesture to resume audio (autoplay rules)
            if (bgPausedByVisibility) {
                const resumeOnGesture = () => {
                    pendingVisibilityGesture = true;
                    // If the game is already unpaused, we can try to play immediately
                    if (!isPaused && !isMuted) {
                        tryPlayAudio();
                        bgPausedByVisibility = false;
                        pendingVisibilityGesture = false;
                    }
                    window.removeEventListener('pointerdown', resumeOnGesture);
                };
                window.addEventListener('pointerdown', resumeOnGesture, { once: true });
            }
        }
    } catch (e) {}
});
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

