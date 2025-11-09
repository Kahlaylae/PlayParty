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

    document.body.appendChild(audioBtn);
    document.body.appendChild(leaderboardBtn);
    document.body.appendChild(pauseBtn);

    return { audioBtn, leaderboardBtn, pauseBtn };
}

// create basic UI elements (score, instructions, canvas, splash, leaderboard)
function createUI() {
    // score
    const scoreEl = document.createElement('div');
    scoreEl.id = 'score';
    document.body.appendChild(scoreEl);

    // instructions
    const instr = document.createElement('div');
    instr.id = 'shoot-instructions';
    instr.textContent = 'Tap to shoot faster';
    document.body.appendChild(instr);

    // canvas
    const cvs = document.createElement('canvas');
    cvs.id = 'dragonCanvas';
    document.body.appendChild(cvs);

    // splash
    const splash = document.createElement('div');
    splash.id = 'splashScreen';
    const inner = document.createElement('div');
    inner.className = 'splash-inner';
    const h1 = document.createElement('h1'); h1.id = 'splashTitle';
    const p = document.createElement('p'); p.id = 'splashMessage';
    const prompt = document.createElement('p'); prompt.id = 'splashPrompt'; prompt.className = 'restart-prompt';
    inner.appendChild(h1); inner.appendChild(p); inner.appendChild(prompt);
    splash.appendChild(inner);
    document.body.appendChild(splash);

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
    document.body.appendChild(lb);

    // persistent cursor element (visible even when canvas animation is paused)
    const cursorEl = document.createElement('div');
    cursorEl.id = 'game-cursor';
    cursorEl.style.position = 'fixed';
    cursorEl.style.left = '0px';
    cursorEl.style.top = '0px';
    cursorEl.style.width = '14px';
    cursorEl.style.height = '14px';
    cursorEl.style.borderRadius = '50%';
    cursorEl.style.background = 'rgba(255,255,255,0.95)';
    cursorEl.style.boxShadow = '0 0 8px rgba(255,255,255,0.6)';
    cursorEl.style.pointerEvents = 'none';
    cursorEl.style.transform = 'translate(-50%, -50%)';
    cursorEl.style.zIndex = '9999';
    cursorEl.style.display = 'none'; // hidden until we have a position
    document.body.appendChild(cursorEl);

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
const bgAudio = new Audio('assets/dragonpartyplay.mp3');
bgAudio.loop = true;
bgAudio.preload = 'auto';
bgAudio.volume = 0.45;

// Await the first user gesture; the splash will be used to both enable audio and resume the game
let awaitingFirstGesture = true;
// Mute state persisted in localStorage
const MUTE_KEY = 'playdragon_muted';
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
const DRAGON_SEGMENT_SIZE = 12;
const DRAGON_LENGTH = 4;
const SEGMENT_SPACING = DRAGON_SEGMENT_SIZE * 2;
// Speeds are world-units per second
const PELLET_SPEED = 900; // ~15 px/frame @60fps -> 900 world units/sec
const DRAGON_SPEED = 300; // ~5 px/frame @60fps -> 300 world units/sec
const ENEMY_SPEED_SCALE = 80; // multiplier to convert level enemySpeed to world-units/sec
const OPEN_MOUTH_DURATION = 150;
const BOSS_ENEMY_SPAWN_THRESHOLD = 10;
        
// Levels will be loaded from JSON files in /assets at runtime.
// `levels` will be a map: levelNumber -> { target, monsters: [{monster, emoji, normalHp, bossHp, enemySpeed}], aimSpeed, spawnRate, collidables }
let levels = {};

// --- WORLD / CAMERA / TIMING ---
// World size is dynamic: we will match the viewport so the viewport edges act as world walls.
// Defaults are provided but will be overwritten on first resize.
let WORLD_WIDTH = 1200;
let WORLD_HEIGHT = 800;
const MIN_SCALE = 0.5;
const MAX_SCALE = 2.0;
let camera = { x: 0, y: 0, scale: 1, mode: 'zoom-fill' };
let __lastTimestamp = null;
let __elapsedTime = 0;
// UI breakpoint used by both CSS and JS. Keep in sync with `@media (min-width: 600px)` in index.html
const MINI_BREAKPOINT = 600;
// debounce interval for resize handling (ms)
const RESIZE_DEBOUNCE_MS = 100;
let __resizeTimer = null;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// A small pool of collidable objects to be selected from by `collidables` count in levels.json
const collidablesPool = [
    {x: 150, y: 150, width: 80, height: 80, color: 'rgba(255, 0, 255, 0.6)'},
    {x: 500, y: 400, width: 120, height: 120, color: 'rgba(255, 255, 0, 0.6)'},
    {x: 250, y: 350, width: 60, height: 200, color: 'rgba(0, 255, 255, 0.6)'},
    {x: 600, y: 100, width: 200, height: 60, color: 'rgba(255, 0, 255, 0.6)'},
    {x: 100, y: 100, width: 150, height: 40, color: 'rgba(255, 100, 100, 0.6)'},
    {x: 300, y: 500, width: 40, height: 150, color: 'rgba(100, 255, 100, 0.6)'},
    {x: 700, y: 200, width: 100, height: 100, color: 'rgba(100, 100, 255, 0.6)'}
];

// -------------------------
// Collidable system (modular)
// -------------------------
const CollidableType = {
    RECT: 'rect',
    CIRCLE: 'circle'
};

class Collidable {
    constructor(opts = {}) {
        this.type = opts.type || CollidableType.RECT;
        this.x = Number(opts.x || 0);
        this.y = Number(opts.y || 0);
        this.width = Number(opts.width || 0);
        this.height = Number(opts.height || 0);
        this.radius = Number(opts.radius || 0);
        this.color = opts.color || 'rgba(255,255,255,0.6)';
        this.emoji = opts.emoji || null;
        this.scale = Number(opts.scale || 1);
        this.id = opts.id || `c-${Math.random().toString(36).slice(2,9)}`;
        // collidesWith flags: dragon, pellets, enemies, cursor
        this.collidesWith = Object.assign({ dragon: true, pellets: true, enemies: false, cursor: false }, opts.collidesWith || {});
        // flags for behavior: bouncePellets, clampToViewport, activeOutside
        this.flags = Object.assign({ bouncePellets: false, clampToViewport: false, activeOutside: false }, opts.flags || {});
        // active indicates whether it's considered for collision queries
        this.active = true;
    }

    // Compute a minimal push-out vector to move a circle at (cx,cy) with radius r
    // outside this collidable. Returns {dx,dy} to add to cx,cy. If not overlapping, returns {dx:0,dy:0}
    getPushOutVector(cx, cy, r) {
        if (this.type === CollidableType.RECT) {
            const nearestX = Math.max(this.x, Math.min(cx, this.x + this.width));
            const nearestY = Math.max(this.y, Math.min(cy, this.y + this.height));
            const dx = cx - nearestX;
            const dy = cy - nearestY;
            const dist2 = dx * dx + dy * dy;
            if (dist2 === 0) {
                // center is exactly at nearest point (inside or aligned). push out along shortest axis
                // choose axis with more penetration
                const penLeft = Math.abs(cx - this.x);
                const penRight = Math.abs((this.x + this.width) - cx);
                const penTop = Math.abs(cy - this.y);
                const penBottom = Math.abs((this.y + this.height) - cy);
                const minPen = Math.min(penLeft, penRight, penTop, penBottom);
                if (minPen === penLeft) return { dx: -(r + 1), dy: 0 };
                if (minPen === penRight) return { dx: (r + 1), dy: 0 };
                if (minPen === penTop) return { dx: 0, dy: -(r + 1) };
                return { dx: 0, dy: (r + 1) };
            }
            const dist = Math.sqrt(dist2);
            const overlap = r - dist;
            if (overlap >= 0) {
                // normalize dx,dy
                const nx = dx / (dist || 1);
                const ny = dy / (dist || 1);
                // push so circle edge lies just outside rectangle
                return { dx: nx * (overlap + 1), dy: ny * (overlap + 1) };
            }
            return { dx: 0, dy: 0 };
        }
        // circle
        const dx = cx - this.x; const dy = cy - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 0;
        const overlap = (r + this.radius) - dist;
        if (overlap >= 0) {
            const nx = (dist === 0) ? 1 : dx / dist;
            const ny = (dist === 0) ? 0 : dy / dist;
            return { dx: nx * (overlap + 1), dy: ny * (overlap + 1) };
        }
        return { dx: 0, dy: 0 };
    }

    getBounds() {
        if (this.type === CollidableType.RECT) {
            return { x: this.x, y: this.y, w: this.width, h: this.height };
        }
        return { x: this.x - this.radius, y: this.y - this.radius, w: this.radius * 2, h: this.radius * 2 };
    }

    containsPoint(px, py) {
        if (!this.active) return false;
        if (this.type === CollidableType.RECT) {
            return px >= this.x && px <= (this.x + this.width) && py >= this.y && py <= (this.y + this.height);
        }
        const dx = px - this.x; const dy = py - this.y;
        return dx * dx + dy * dy <= this.radius * this.radius;
    }

    intersectsCircle(cx, cy, r) {
        if (!this.active) return false;
        if (this.type === CollidableType.RECT) {
            const testX = Math.max(this.x, Math.min(cx, this.x + this.width));
            const testY = Math.max(this.y, Math.min(cy, this.y + this.height));
            const dx = cx - testX;
            const dy = cy - testY;
            return (dx * dx + dy * dy) <= (r * r);
        }
        const dx = cx - this.x; const dy = cy - this.y;
        const dist2 = dx * dx + dy * dy;
        const cr = r + this.radius;
        return dist2 <= (cr * cr);
    }

    // draw; debug param will stroke bounds
    draw(ctx, debug = false) {
        ctx.save();
        ctx.beginPath();
        if (this.type === CollidableType.RECT) {
            // Draw emoji if present. Emoji drawing is centered within the rect.
            if (this.emoji) {
                const cx = this.x + this.width / 2;
                const cy = this.y + this.height / 2;
                // font size ~ 80% of min(width,height). Adjust by DPR so visual size matches CSS px.
                const rawFontSize = Math.max(12, Math.floor(Math.min(this.width, this.height) * 0.8));
                const _dprFont = (camera && camera.dpr) ? camera.dpr : 1;
                const fontSize = Math.max(12, Math.floor(rawFontSize / _dprFont));
                ctx.font = `${fontSize}px sans-serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                // optionally draw shadow for emoji to make it pop
                try { ctx.shadowColor = this.color || 'rgba(0,0,0,0)'; ctx.shadowBlur = 6; } catch (e) {}
                ctx.fillText(this.emoji, cx, cy);

                // Draw a subtle translucent circular hit-area glow around emoji so players can
                // visually see the collidable region. It's intentionally very faint and
                // mostly transparent, with a soft specular-like highlight.
                try {
                    const pad = 8 * (this.scale || 1);
                    const radius = Math.max(this.width, this.height) / 2 + pad;
                    // soft highlight + fade to transparent
                    const grad = ctx.createRadialGradient(cx - radius * 0.25, cy - radius * 0.25, Math.max(4, radius * 0.08), cx, cy, radius);
                    grad.addColorStop(0, 'rgba(255,255,255,0.06)');
                    grad.addColorStop(0.6, 'rgba(255,255,255,0.02)');
                    grad.addColorStop(1, 'rgba(255,255,255,0)');

                    ctx.save();
                    ctx.globalCompositeOperation = 'source-over';
                    ctx.beginPath();
                    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
                    // subtle shadow to read as a glow but keep transparent
                    ctx.shadowColor = 'rgba(255,255,255,0.04)';
                    ctx.shadowBlur = 16 * (this.scale || 1);
                    ctx.fillStyle = grad;
                    ctx.fill();
                    ctx.restore();
                } catch (e) {
                    // non-fatal; continue without drawing glow
                }
            }
            // Only draw the visible rect if color is not fully transparent or debug is enabled
            const isTransparent = /^rgba\(0,0,0,0\)$/.test(String(this.color));
            if (!isTransparent || debug) {
                ctx.fillStyle = this.color;
                ctx.shadowColor = this.color;
                ctx.shadowBlur = 15;
                ctx.fillRect(this.x, this.y, this.width, this.height);
            }
            if (debug) {
                ctx.strokeStyle = '#ffff66'; ctx.lineWidth = 1; ctx.strokeRect(this.x + 0.5, this.y + 0.5, this.width, this.height);
            }
        } else {
            // Circle collidable — draw emoji-centered glow first (if present) then the (invisible) fill
            if (this.emoji) {
                const cx = this.x;
                const cy = this.y;
                const radius = this.radius;
                const rawFontSizeC = Math.max(12, Math.floor(radius * 1.2));
                const _dprFontC = (camera && camera.dpr) ? camera.dpr : 1;
                const fontSize = Math.max(12, Math.floor(rawFontSizeC / _dprFontC));
                ctx.font = `${fontSize}px sans-serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                try { ctx.shadowColor = this.color || 'rgba(0,0,0,0)'; ctx.shadowBlur = 6; } catch (e) {}
                ctx.fillText(this.emoji, cx, cy);

                try {
                    const pad = 8 * (this.scale || 1);
                    const r = Math.max(radius, 8) + pad;
                    const grad = ctx.createRadialGradient(cx - r * 0.25, cy - r * 0.25, Math.max(4, r * 0.08), cx, cy, r);
                    grad.addColorStop(0, 'rgba(255,255,255,0.06)');
                    grad.addColorStop(0.6, 'rgba(255,255,255,0.02)');
                    grad.addColorStop(1, 'rgba(255,255,255,0)');
                    ctx.save();
                    ctx.globalCompositeOperation = 'source-over';
                    ctx.beginPath();
                    ctx.arc(cx, cy, r, 0, Math.PI * 2);
                    ctx.shadowColor = 'rgba(255,255,255,0.04)';
                    ctx.shadowBlur = 16 * (this.scale || 1);
                    ctx.fillStyle = grad;
                    ctx.fill();
                    ctx.restore();
                } catch (e) {}
            }
            // Invisible circle fill (preserves existing color/shadow logic if needed)
            ctx.fillStyle = this.color;
            ctx.shadowColor = this.color;
            ctx.shadowBlur = 15;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
            ctx.fill();
            if (debug) { ctx.strokeStyle = '#ffff66'; ctx.lineWidth = 1; ctx.stroke(); }
        }
        ctx.restore();
    }

    // clamp into viewport if flagged
    clampToViewport(w, h) {
        if (this.type === CollidableType.RECT) {
            if (this.x + this.width < 0 || this.x > w || this.y + this.height < 0 || this.y > h) return false;
            this.x = Math.max(0, Math.min(this.x, Math.max(0, w - this.width)));
            this.y = Math.max(0, Math.min(this.y, Math.max(0, h - this.height)));
            return true;
        }
        if (this.type === CollidableType.CIRCLE) {
            if (this.x + this.radius < 0 || this.x - this.radius > w || this.y + this.radius < 0 || this.y - this.radius > h) return false;
            this.x = Math.max(this.radius, Math.min(this.x, Math.max(this.radius, w - this.radius)));
            this.y = Math.max(this.radius, Math.min(this.y, Math.max(this.radius, h - this.radius)));
            return true;
        }
        return true;
    }
}

class CollidableManager {
    constructor() {
        this.list = [];
        this.debug = false; // visual debugging
        // spatial grid for faster queries
        this.grid = new Map();
        this.cellSize = 128;
        this.gridCols = 0;
        this.gridRows = 0;
        // pathfinding cache
        this._pfCache = null; // { grid, cols, rows, cs, padding }
        this._pfDirty = true;
    }
    clear() { this.list.length = 0; }
    set(arr) { this.list = arr.slice(); this._pfDirty = true; }
    add(c) { this.list.push(c); this._pfDirty = true; }
    addMany(arr) { arr.forEach(a => this.add(a)); this._pfDirty = true; }
    getAll() { return this.list.slice(); }
    draw(ctx) { this.list.forEach(c => c.draw(ctx, this.debug)); }

    // Draw hitbox outlines (useful for debugging and to visualize exact query bounds)
    drawHitboxes(ctx) {
        ctx.save();
        ctx.strokeStyle = 'rgba(255,255,0,0.9)';
        ctx.lineWidth = 1;
        for (let i = 0; i < this.list.length; i++) {
            const c = this.list[i];
            if (!c) continue;
            const b = c.getBounds();
            ctx.beginPath();
            if (c.type === CollidableType.RECT) {
                ctx.strokeRect(b.x + 0.5, b.y + 0.5, b.w, b.h);
            } else {
                ctx.arc(c.x, c.y, c.radius, 0, Math.PI * 2);
                ctx.stroke();
            }
        }
        ctx.restore();
    }

    // sanitize: clamp or deactivate collidables outside viewport
    sanitize(viewW, viewH) {
        this.list.forEach(c => {
            if (c.flags.clampToViewport) {
                c.clampToViewport(viewW, viewH);
                c.active = true;
            } else if (!c.flags.activeOutside) {
                const b = c.getBounds();
                // if fully outside, deactivate
                if (b.x + b.w < 0 || b.x > viewW || b.y + b.h < 0 || b.y > viewH) {
                    c.active = false;
                } else {
                    c.active = true;
                }
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

    // dragon collision: returns first hit info or {hit:false}
    checkDragonCollision(segments, baseSegmentSize) {
        for (let i = 0; i < segments.length; i++) {
            const seg = segments[i];
            let segSize = baseSegmentSize;
            if (i === 0) segSize *= 1.5;
            const hits = this.queryCircle(seg.x, seg.y, segSize, { groups: { dragon: true } });
            if (hits && hits.length) return { hit: true, segmentIndex: i, collidables: hits };
        }
        return { hit: false };
    }
}

// manager instance (current level)
let collidableManager = new CollidableManager();
window.collidableManager = collidableManager; // quick dev hook

// Diagnostic helper: run a pathfinding occupancy and test a sample path
window.runPathfindingDiagnostic = function(options = {}) {
    try {
        const cellSize = options.cellSize || 32;
        const padding = options.padding || 0;
        // Force rebuild
        collidableManager._pfDirty = true;
        const pf = collidableManager.buildPathfindingGrid(cellSize, padding, WORLD_WIDTH, WORLD_HEIGHT);
        const blockedCount = pf.grid.reduce((acc, v) => acc + (v ? 1 : 0), 0);
        console.log('Pathfinding diagnostic:', { cols: pf.cols, rows: pf.rows, cellSize: pf.cs, blocked: blockedCount });
        // Try a sample path from near top-left to world center
        const start = { x: 10, y: 10 };
        const targ = { x: WORLD_WIDTH / 2, y: WORLD_HEIGHT / 2 };
        const path = collidableManager.findPath(start.x, start.y, targ.x, targ.y, options.radius || 8, cellSize);
        if (!path) {
            console.warn('No path found (blocked)');
        } else {
            console.log('Sample path length:', path.length);
            // Expose last computed path for quick visualization in console
            window._lastPfPath = path;
        }
        return { pf, path };
    } catch (e) {
        console.error('Pathfinding diagnostic failed', e);
        return null;
    }
};

// monsterMap: monsterId -> monsterData (from monsters.json)
let monsterMap = {};

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
        levelsArr.forEach(l => {
            const monsterIds = String(l.emoji || '').split(',').map(s => s.trim()).filter(Boolean);
            const monsters = monsterIds.map(id => monsterMap[id]).filter(Boolean);
            // Build collidables from obstacles list (new format). Backwards-compat: support l.collidables legacy.
            let obstacleSpec = l.obstacles || l.collidables || null;
            let obstacleNames = [];
            if (obstacleSpec == null) {
                obstacleNames = [];
            } else if (typeof obstacleSpec === 'string') {
                obstacleNames = obstacleSpec.split(',').map(s => s.trim()).filter(Boolean);
            } else if (Array.isArray(obstacleSpec)) {
                obstacleNames = obstacleSpec.map(String).map(s => s.trim()).filter(Boolean);
            } else if (typeof obstacleSpec === 'number') {
                // choose first N obstacle presets by input order without duplicating positions
                const n = Math.max(0, Number(obstacleSpec) || 0);
                const chosen = [];
                const usedPositions = new Set();
                for (let i = 0; i < obstaclesArr.length && chosen.length < n; i++) {
                    const name = (obstaclesArr[i].name || obstaclesArr[i].obstacles || '').toString();
                    const posStr = (obstaclesArr[i].position || '').toString();
                    const tokens = posStr.split(',').map(t => t.trim()).filter(Boolean);
                    // skip if any token collides with usedPositions
                    let conflict = false;
                    for (const t of tokens) { if (usedPositions.has(t)) { conflict = true; break; } }
                    if (conflict) continue;
                    chosen.push(name);
                    tokens.forEach(t => usedPositions.add(t));
                }
                obstacleNames = chosen;
            }

            // For each requested obstacle name, convert to one or more Collidable entries based on its position tokens
            const collidables = [];
            const MARGIN = 24; // margin from edges in world units
            const BASE_OBS_SIZE = 64; // base size for scale=1
            const placedPositionTokens = new Set();

            obstacleNames.forEach(name => {
                const def = obstaclesMap.get(name);
                if (!def) {
                    console.warn('Unknown obstacle referenced in levels.json:', name);
                    return;
                }
                const scale = Math.max(1, Math.min(3, Number(def.scale || 1)));
                const w = BASE_OBS_SIZE * scale;
                const h = BASE_OBS_SIZE * scale;
                const posTokens = (String(def.position || 'center')).split(',').map(s => s.trim()).filter(Boolean);
                posTokens.forEach(tok => {
                    // skip if this token already used by another obstacle in this level (compatibility rule)
                    if (placedPositionTokens.has(tok)) {
                        console.warn(`Skipping obstacle ${name} at position ${tok} due to position conflict`);
                        return;
                    }
                    // compute world-space position relative to the current viewport edges so obstacles
                    // align to the visible screen (top/left/right/bottom/center/corners). Use the
                    // helper so resizing the canvas later can recompute positions.
                    const radius = Math.max(w, h) / 2;
                    const pos = worldPosForToken(tok, radius, w, h);
                    const x = pos.x;
                    const y = pos.y;
                    // remember the token so we can reposition on resize
                    // store as the original requested placement for this collidable
                    const posToken = tok;
                    placedPositionTokens.add(tok);
                    // Create circular collidables centered on the emoji so the glow matches the collision shape
                    const coll = new Collidable({
                        type: CollidableType.CIRCLE,
                        x: x,
                        y: y,
                        radius: Math.max(w, h) / 2,
                        color: 'rgba(0,0,0,0)', // invisible hitbox by default
                        collidesWith: Object.assign({ dragon: true, pellets: true, enemies: true, cursor: false }, def.collidesWith || {}),
                        flags: Object.assign({ bouncePellets: !!(def.flags && def.flags.bouncePellets) }, def.flags || {}),
                        emoji: def.emoji || null,
                        scale: scale,
                        posToken: posToken,
                        // store direction for potential motion (left-right default)
                        direction: def.direction || 'ltr'
                    });
                    // store motion parameters so obstacle can animate
                    const dirRaw = (def.direction || 'ltr').toString().toLowerCase();
                    const dir = (dirRaw.indexOf('vert') !== -1 || dirRaw.indexOf('t') === 0 || dirRaw.indexOf('b') === 0) ? 'vertical' : 'horizontal';
                    const speed = Math.max(0.1, Number(def.speed || 1));
                    const amplitude = Math.max(8, (Number(def.amplitude) || BASE_OBS_SIZE / 2) * scale);
                    coll.baseX = coll.x;
                    coll.baseY = coll.y;
                    coll.motion = { dir, speed, amplitude, phase: Math.random() * Math.PI * 2 };
                    // Consider obstacle moving if a direction is specified OR a non-zero speed is provided
                    coll.moving = !!def.direction || (def.speed !== undefined && Number(def.speed) > 0);
                    collidables.push(coll);
                });
            });

            levels[l.level] = {
                target: l.target || 50,
                monsters: monsters.length ? monsters : [{ monster: 'mon1', emoji: '👹', normalHp: 1, bossHp: 2, enemySpeed: 1.5 }],
                aimSpeed: l.aimSpeed || 1,
                spawnRate: l.spawnRate || 1,
                        collidables: collidables,
                multiplier: (l.multiplier !== undefined) ? Number(l.multiplier) : 2
            };
        });
    } catch (err) {
        console.error('Failed to load levels.json', err);
    }
}
        
// LevelWatcher class to manage the game's level progression.
class LevelWatcher {
    constructor(levels) {
        this.levels = levels;
        this.currentLevel = 1;
    }

    nextLevel() {
        if (this.currentLevel < Object.keys(this.levels).length) {
            this.currentLevel++;
            return true;
        }
        return false;
    }

    reset() {
        this.currentLevel = 1;
    }

    getLevelConfig() {
        return this.levels[this.currentLevel];
    }

    isLastLevel() {
        return this.currentLevel === Object.keys(this.levels).length;
    }
}
        
let levelWatcher = null; // will be created after loading levels

let gameLoopInterval;
let pelletInterval;
let dragonSegments = [];
let projectiles = [];
let enemies = [];
let target = { x: 0, y: 0 };
let keyboardDirection = { x: 0, y: 0 };
let isMouthOpen = false;
let dragonHit = false;
let enemiesDestroyed = 0;
let isPaused = false;
let isGameOver = false;
let isBoosting = false;
let boostTimeout = null;
const BOOST_DURATION = 500; // ms (boost lasts 3s)
let isCooling = false;
let cooldownTimeout = null;
const COOLDOWN_DURATION = 2000; // ms
// Session-wide kill counter (persists across levels during a single play session)
let sessionKills = 0;

function resizeCanvas() {
    // Use CSS viewport size for layout and compute a high-DPI drawing buffer using devicePixelRatio
    const cssWidth = Math.max(100, window.innerWidth);
    const cssHeight = Math.max(100, window.innerHeight);
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    // size the canvas in CSS pixels so DOM layout is correct
    canvas.style.width = cssWidth + 'px';
    canvas.style.height = cssHeight + 'px';
    // set the actual drawing buffer to account for DPR
    canvas.width = Math.round(cssWidth * dpr);
    canvas.height = Math.round(cssHeight * dpr);

    // Simplify: treat the viewport as the world bounds. Set world size to CSS pixels and use a 1:1 mapping.
    // This means world coordinates correspond directly to screen pixels and the viewport edges are the walls.
    WORLD_WIDTH = cssWidth;
    WORLD_HEIGHT = cssHeight;
    camera.scale = 1;
    camera.offsetX = 0;
    camera.offsetY = 0;
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
    if (dragonSegments.length === 0) initializeDragon();
    // rebuild spatial grid in world units and sanitize collidables against world bounds
    try {
        if (collidableManager) {
            collidableManager.buildGrid(collidableManager.cellSize || 128, WORLD_WIDTH, WORLD_HEIGHT);
            collidableManager.sanitize(WORLD_WIDTH, WORLD_HEIGHT);
            // If levels are loaded, reposition any token-aligned collidables relative to the new viewport
            try {
                if (levelWatcher) {
                    const levelConfig = levelWatcher.getLevelConfig();
                    (levelConfig.collidables || []).forEach(c => {
                        if (c && c.posToken) {
                            const radius = (c.radius !== undefined) ? c.radius : Math.max((c.width||0), (c.height||0)) / 2;
                            const p = worldPosForToken(c.posToken, radius, c.width || 0, c.height || 0);
                            c.x = p.x; c.y = p.y;
                            c.baseX = c.x; c.baseY = c.y;
                        }
                    });
                    // rebuild grid after repositioning
                    collidableManager.buildGrid(collidableManager.cellSize || 128, WORLD_WIDTH, WORLD_HEIGHT);
                }
            } catch (e) {}
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

// Compute a world-space position for a viewport alignment token (top/bottom/left/right/center/corners)
// radiusWorld is used so placements account for obstacle size when aligning to edges.
function worldPosForToken(token, radiusWorld, w = 0, h = 0) {
    // ensure canvas size and camera are up-to-date
    const marginPx = 24; // spacing from viewport edge in CSS pixels
    // Use the canvas DOM size in CSS pixels (getBoundingClientRect) because
    // canvas.width/height are the drawing buffer (DPR-scaled) and would produce
    // incorrect placements when devicePixelRatio > 1.
    const rect = canvas.getBoundingClientRect();
    const screenW = Math.max(1, rect.width || window.innerWidth);
    const screenH = Math.max(1, rect.height || window.innerHeight);
    // screen coordinates (CSS pixels)
    let sx = Math.floor(screenW / 2);
    let sy = Math.floor(screenH / 2);
    const rScreen = Math.abs((radiusWorld || 0) * (camera.scale || 1));
    switch ((token || '').toString().toLowerCase()) {
        case 'top':
            sx = Math.floor(screenW / 2);
            sy = Math.floor(marginPx + rScreen);
            break;
        case 'bottom':
            sx = Math.floor(screenW / 2);
            sy = Math.floor(screenH - (marginPx + rScreen));
            break;
        case 'left':
        case 'leading':
            sx = Math.floor(marginPx + rScreen);
            sy = Math.floor(screenH / 2);
            break;
        case 'right':
        case 'trailing':
            sx = Math.floor(screenW - (marginPx + rScreen));
            sy = Math.floor(screenH / 2);
            break;
        case 'top-left':
        case 'topleft':
            sx = Math.floor(marginPx + rScreen);
            sy = Math.floor(marginPx + rScreen);
            break;
        case 'top-right':
        case 'topright':
            sx = Math.floor(screenW - (marginPx + rScreen));
            sy = Math.floor(marginPx + rScreen);
            break;
        case 'bottom-left':
        case 'bottomleft':
            sx = Math.floor(marginPx + rScreen);
            sy = Math.floor(screenH - (marginPx + rScreen));
            break;
        case 'bottom-right':
        case 'bottomright':
            sx = Math.floor(screenW - (marginPx + rScreen));
            sy = Math.floor(screenH - (marginPx + rScreen));
            break;
        case 'center':
        default:
            sx = Math.floor(screenW / 2);
            sy = Math.floor(screenH / 2);
            break;
    }
    return screenToWorld(sx, sy);
}

function initializeDragon() {
    dragonSegments = [];
    for (let i = 0; i < DRAGON_LENGTH; i++) {
        dragonSegments.push({
            x: WORLD_WIDTH / 2 - i * SEGMENT_SPACING,
            y: WORLD_HEIGHT / 2,
            angle: 0
        });
    }
}

function updateDragon(dt = 0) {
    // Update target based on keyboard direction
    if (keyboardDirection.x !== 0 || keyboardDirection.y !== 0) {
        target.x += keyboardDirection.x * DRAGON_SPEED * dt;
        target.y += keyboardDirection.y * DRAGON_SPEED * dt;
    }

    target.x = Math.max(0, Math.min(WORLD_WIDTH, target.x));
    target.y = Math.max(0, Math.min(WORLD_HEIGHT, target.y));

    // update persistent cursor position when the dragon/keyboard moves target
    try {
        if (cursorEl) {
            cursorEl.style.display = 'block';
            const scr = worldToScreen(target.x, target.y);
            cursorEl.style.left = (scr.x) + 'px';
            cursorEl.style.top = (scr.y) + 'px';
        }
    } catch (e) {}

    const head = dragonSegments[0];
    const dx = target.x - head.x;
    const dy = target.y - head.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    if (distance > 1e-2) {
        head.angle = Math.atan2(dy, dx);
        const moveStep = Math.min(DRAGON_SPEED * dt, distance);
        head.x += Math.cos(head.angle) * moveStep;
        head.y += Math.sin(head.angle) * moveStep;
    }

    for (let i = 1; i < dragonSegments.length; i++) {
        const currentSegment = dragonSegments[i];
        const prevSegment = dragonSegments[i - 1];
        const angleToPrev = Math.atan2(prevSegment.y - currentSegment.y, prevSegment.x - currentSegment.x);
        currentSegment.angle = angleToPrev;
        currentSegment.x = prevSegment.x - Math.cos(angleToPrev) * SEGMENT_SPACING;
        currentSegment.y = prevSegment.y - Math.sin(angleToPrev) * SEGMENT_SPACING;
    }
}

function drawDragon() {
    ctx.lineCap = 'round';
    const baseColor = dragonHit ? 'rgba(138, 43, 226, 0.8)' : 'rgba(0, 255, 255, 0.8)';
    const shadowColor = dragonHit ? 'rgba(75, 0, 130, 0.8)' : 'rgba(0, 255, 255, 0.5)';

    for (let i = 0; i < dragonSegments.length; i++) {
        const segment = dragonSegments[i];
        const alpha = 1 - (i / dragonSegments.length) * 0.7;

        if (i === 0) {
            ctx.beginPath();
            ctx.arc(segment.x, segment.y, DRAGON_SEGMENT_SIZE * 1.5, 0, Math.PI * 2);
            ctx.fillStyle = baseColor;
            ctx.shadowColor = shadowColor;
            ctx.shadowBlur = 15;
            ctx.fill();

            if (isMouthOpen) {
                ctx.beginPath();
                ctx.arc(segment.x, segment.y, DRAGON_SEGMENT_SIZE * 1.2, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(255, 100, 100, 0.9)`;
                ctx.shadowColor = `rgba(255, 0, 0, 0.7)`;
                ctx.shadowBlur = 10;
                ctx.fill();
            }

            const eyeDist = DRAGON_SEGMENT_SIZE / 2;
            const eyeOffsetAngle = Math.PI / 2;
            const eye1X = segment.x + Math.cos(segment.angle + eyeOffsetAngle) * eyeDist;
            const eye1Y = segment.y + Math.sin(segment.angle + eyeOffsetAngle) * eyeDist;
            const eye2X = segment.x + Math.cos(segment.angle - eyeOffsetAngle) * eyeDist;
            const eye2Y = segment.y + Math.sin(segment.angle - eyeOffsetAngle) * eyeDist;
            
            ctx.beginPath();
            ctx.arc(eye1X, eye1Y, 3, 0, Math.PI * 2);
            ctx.arc(eye2X, eye2Y, 3, 0, Math.PI * 2);
            ctx.fillStyle = '#fff';
            ctx.shadowColor = '#fff';
            ctx.shadowBlur = 5;
            ctx.fill();
            
        } else {
            ctx.beginPath();
            ctx.arc(segment.x, segment.y, DRAGON_SEGMENT_SIZE, 0, Math.PI * 2);
            ctx.fillStyle = baseColor;
            ctx.shadowColor = shadowColor;
            ctx.shadowBlur = 15;
            ctx.fill();
        }
    }
}

function drawCollidables() {
    // Prefer using the collidable manager; fall back to raw level config if manager empty
    try {
        if (collidableManager && typeof collidableManager.draw === 'function') {
            collidableManager.draw(ctx);
            if (collidableManager.debug && typeof collidableManager.drawHitboxes === 'function') {
                collidableManager.drawHitboxes(ctx);
            }
            return;
        }
    } catch (e) {}
    const levelConfig = levelWatcher.getLevelConfig();
    (levelConfig.collidables || []).forEach(c => {
        try {
            if (c && typeof c.draw === 'function') {
                c.draw(ctx, false);
            } else {
                ctx.beginPath();
                ctx.rect(c.x, c.y, c.width || 8, c.height || 8);
                ctx.fillStyle = c.color || 'rgba(255,255,255,0.02)';
                ctx.shadowColor = c.color || 'transparent';
                ctx.shadowBlur = 15;
                ctx.fill();
            }
        } catch (e) {}
    });
}

function updatePellets(dt = 0) {
    projectiles.forEach(p => {
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
    });
}

function drawPellets() {
    projectiles.forEach(p => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 15;
        ctx.fill();
    });
}
        
function spawnEnemy() {
    if (isPaused) return;
    let size, hp, emoji, speed;
    const levelConfig = levelWatcher.getLevelConfig();

    // Choose a monster type from the level's monster pool
    const monsterChoice = levelConfig.monsters[Math.floor(Math.random() * levelConfig.monsters.length)];
    emoji = monsterChoice.emoji;
    hp = monsterChoice.normalHp;
    // scale level-defined enemySpeed to world-units/sec for consistent behavior
    speed = (monsterChoice.enemySpeed || 1) * ENEMY_SPEED_SCALE;

    if (enemiesDestroyed >= BOSS_ENEMY_SPAWN_THRESHOLD && Math.random() < 0.1) {
        size = 60;
        hp = monsterChoice.bossHp || monsterChoice.normalHp * 2;
        speed = ((monsterChoice.enemySpeed || 1) * ENEMY_SPEED_SCALE) / 2;
    } else {
        size = 30;
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
    const dragonHead = dragonSegments[0];
    enemies.forEach(enemy => {
        // keep enemies inside world bounds
        if (enemy.x + (enemy.size / 2) > WORLD_WIDTH || enemy.x - (enemy.size / 2) < 0) {
            enemy.vx = -enemy.vx;
        }
        if (enemy.y + (enemy.size / 2) > WORLD_HEIGHT || enemy.y - (enemy.size / 2) < 0) {
            enemy.vy = -enemy.vy;
        }
        // desired direction toward dragon head
        let dx = dragonHead.x - enemy.x;
        let dy = dragonHead.y - enemy.y;
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
            // Try a simple grid-based A* path to the dragon head
            try {
                const path = collidableManager.findPath(enemy.x, enemy.y, dragonHead.x, dragonHead.y, radius, 32);
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
    enemies.forEach(enemy => {
        const _dprE = (camera && camera.dpr) ? camera.dpr : 1;
        const fontSize = Math.max(12, Math.floor(enemy.size / _dprE));
        ctx.font = `${fontSize}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(enemy.emoji, enemy.x, enemy.y);
    });
}

function checkPelletEnemyCollision() {
    projectiles = projectiles.filter(pellet => {
        let pelletHit = false;
        enemies = enemies.filter(enemy => {
            const dx = pellet.x - enemy.x;
            const dy = pellet.y - enemy.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            if (distance < pellet.size + (enemy.size / 2)) {
                pelletHit = true;
                enemy.hp--;
                if (enemy.hp <= 0) {
                    enemiesDestroyed++;
                    sessionKills++;
                    updateScore();
                    return false;
                }
            }
            return true;
        });
        return !pelletHit;
    });
}

function checkDragonCollidableCollision() {
    // Use the collidable manager to check collisions. Collisions will now push the dragon
    // head out of obstacles so the dragon cannot pass through them.
    try {
        if (collidableManager) {
            const res = collidableManager.checkDragonCollision(dragonSegments, DRAGON_SEGMENT_SIZE);
            if (res.hit) {
                // compute a combined push vector from all hits for the head
                const head = dragonSegments[0];
                let totalDx = 0, totalDy = 0;
                res.collidables.forEach(c => {
                    const v = c.getPushOutVector(head.x, head.y, DRAGON_SEGMENT_SIZE * 1.5);
                    totalDx += v.dx; totalDy += v.dy;
                });
                // average
                const count = Math.max(1, res.collidables.length);
                const avgDx = totalDx / count; const avgDy = totalDy / count;
                // apply push-out
                head.x += avgDx;
                head.y += avgDy;
                // re-link following segments so they follow the head without penetrating
                for (let i = 1; i < dragonSegments.length; i++) {
                    const currentSegment = dragonSegments[i];
                    const prevSegment = dragonSegments[i - 1];
                    const angleToPrev = Math.atan2(prevSegment.y - currentSegment.y, prevSegment.x - currentSegment.x);
                    currentSegment.angle = angleToPrev;
                    currentSegment.x = prevSegment.x - Math.cos(angleToPrev) * SEGMENT_SPACING;
                    currentSegment.y = prevSegment.y - Math.sin(angleToPrev) * SEGMENT_SPACING;
                }
            }
        }
    } catch (e) {
        // fallback: no push-out behavior
    }
}

// Handle pellet collisions with collidables: bounce or remove pellets based on flags
function checkPelletCollidableCollision() {
    if (!collidableManager) return;
    for (let i = projectiles.length - 1; i >= 0; i--) {
        const p = projectiles[i];
        const hits = collidableManager.queryCircle(p.x, p.y, p.size, { groups: { pellets: true } });
        if (hits && hits.length) {
            const c = hits[0];
            if (!c) continue;
                // approximate bounce depending on shape
                let push = { dx: 0, dy: 0 };
                if (c.type === CollidableType.RECT) {
                    const testX = Math.max(c.x, Math.min(p.x, c.x + c.width));
                    const testY = Math.max(c.y, Math.min(p.y, c.y + c.height));
                    const dx = p.x - testX;
                    const dy = p.y - testY;
                    if (Math.abs(dx) > Math.abs(dy)) {
                        p.vx = -p.vx;
                        // push pellet out using collidable push vector to avoid trapping
                        push = c.getPushOutVector(p.x, p.y, p.size);
                        p.x += push.dx || p.vx;
                        p.y += push.dy || 0;
                    } else {
                        p.vy = -p.vy;
                        push = c.getPushOutVector(p.x, p.y, p.size);
                        p.x += push.dx || 0;
                        p.y += push.dy || p.vy;
                    }
                } else {
                    // circle: reflect velocity across normal
                    const dx = p.x - c.x;
                    const dy = p.y - c.y;
                    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                    const nx = dx / dist, ny = dy / dist;
                    const vdotn = p.vx * nx + p.vy * ny;
                    p.vx = p.vx - 2 * vdotn * nx;
                    p.vy = p.vy - 2 * vdotn * ny;
                    push = c.getPushOutVector(p.x, p.y, p.size);
                    p.x += push.dx || p.vx;
                    p.y += push.dy || p.vy;
                }

                // Apply push to nearby enemies and to the dragon head if they are close to the collision point
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
                    // push dragon head (and re-link segments) if head is near collision
                    if (dragonSegments && dragonSegments.length) {
                        const head = dragonSegments[0];
                        const dh = Math.hypot(head.x - COLLIDE_POINT_X, head.y - COLLIDE_POINT_Y);
                        const headTrigger = (DRAGON_SEGMENT_SIZE * 1.5) + (p.size || 0) + 8;
                        if (dh <= headTrigger) {
                            head.x += (push.dx || 0) * PUSH_DISPLACE;
                            head.y += (push.dy || 0) * PUSH_DISPLACE;
                            // re-link segments so they follow the pushed head
                            for (let si = 1; si < dragonSegments.length; si++) {
                                const currentSegment = dragonSegments[si];
                                const prevSegment = dragonSegments[si - 1];
                                const angleToPrev = Math.atan2(prevSegment.y - currentSegment.y, prevSegment.x - currentSegment.x);
                                currentSegment.angle = angleToPrev;
                                currentSegment.x = prevSegment.x - Math.cos(angleToPrev) * SEGMENT_SPACING;
                                currentSegment.y = prevSegment.y - Math.sin(angleToPrev) * SEGMENT_SPACING;
                            }
                        }
                    }
                } catch (e) {
                    // non-fatal; continue
                }
        }
    }
}


function checkDragonEnemyCollision() {
    enemies.forEach(enemy => {
        for (let i = 0; i < dragonSegments.length; i++) {
            const segment = dragonSegments[i];
            const dx = segment.x - enemy.x;
            const dy = segment.y - enemy.y;
            let segmentSize = DRAGON_SEGMENT_SIZE;
            if (i === 0) {
                segmentSize *= 1.5;
            }
            const distance = Math.sqrt(dx * dx + dy * dy);
            if (distance < segmentSize + (enemy.size / 2)) {
                dragonHit = true;
                break;
            }
        }
    });
}
        
function updateScore() {
    const levelConfig = levelWatcher.getLevelConfig();
    scoreElement.innerText = `Level ${levelWatcher.currentLevel}: ${enemiesDestroyed}/${levelConfig.target} Eliminated`;
}

function showSplashScreen(title, message, prompt) {
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
    // resume loops
    const levelConfig = levelWatcher.getLevelConfig();
    if (gameLoopInterval) clearInterval(gameLoopInterval);
    if (pelletInterval) clearInterval(pelletInterval);
    gameLoopInterval = setInterval(spawnEnemy, 1000);
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
    splashScreen.style.display = 'none';
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
    initializeDragon();
    // set collidables for the manager and sanitize against current viewport
    try {
        const levelConfig = levelWatcher.getLevelConfig();
    collidableManager.set(levelConfig.collidables || []);
    collidableManager.buildGrid(128, WORLD_WIDTH, WORLD_HEIGHT);
    collidableManager.sanitize(WORLD_WIDTH, WORLD_HEIGHT);
    } catch (e) {}
    updateScore();
    if (gameLoopInterval) clearInterval(gameLoopInterval);
    gameLoopInterval = setInterval(spawnEnemy, 1000);
    const levelConfig = levelWatcher.getLevelConfig();
    if (pelletInterval) clearInterval(pelletInterval);
    pelletInterval = setInterval(shootPellet, 1000 / levelConfig.aimSpeed);
    requestAnimationFrame(animate);
    if (shootInstructions) shootInstructions.innerText = 'Tap to shoot faster';
}

function restartGame() {
    isPaused = false;
    isGameOver = false;
    dragonHit = false;
    if (levelWatcher) levelWatcher.reset();
    enemiesDestroyed = 0;
    sessionKills = 0; // full restart clears session total
    projectiles = [];
    enemies = [];
    splashScreen.style.display = 'none';
    initializeDragon();
    // set collidables for the manager and sanitize against current viewport
    try {
        const levelConfig = levelWatcher.getLevelConfig();
    collidableManager.set(levelConfig.collidables || []);
    collidableManager.buildGrid(128, WORLD_WIDTH, WORLD_HEIGHT);
    collidableManager.sanitize(WORLD_WIDTH, WORLD_HEIGHT);
    } catch (e) {}
    updateScore();
    if (gameLoopInterval) clearInterval(gameLoopInterval);
    gameLoopInterval = setInterval(spawnEnemy, 1000);
    const levelConfig = levelWatcher.getLevelConfig();
    if (pelletInterval) clearInterval(pelletInterval);
    pelletInterval = setInterval(shootPellet, 1000 / levelConfig.aimSpeed);
    requestAnimationFrame(animate);
    if (shootInstructions) shootInstructions.innerText = 'Tap to shoot faster';
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

    // clear in screen (pixel) coordinates
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = 'rgba(13, 17, 23, 0.4)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';

    // Set transform to map world -> screen using computed camera offsets and DPR
    ctx.save();
    const _dpr = (camera && camera.dpr) ? camera.dpr : 1;
    const _s = (camera.scale || 1) * _dpr;
    ctx.setTransform(_s, 0, 0, _s, (camera.offsetX || 0) * _dpr, (camera.offsetY || 0) * _dpr);

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

    updateDragon(dt);
    updatePellets(dt);
    try { checkPelletCollidableCollision(); } catch (e) {}
    updateEnemies(dt);

    checkDragonCollidableCollision();
    checkDragonEnemyCollision();
    checkPelletEnemyCollision();

    // Draw scene in world coordinates
    drawCollidables();
    drawDragon();
    drawPellets();
    drawEnemies();

    ctx.restore();

    if (dragonHit) {
        endGame();
        return;
    }

    const levelConfig = levelWatcher.getLevelConfig();
    if (enemiesDestroyed >= levelConfig.target) {
        if (!levelWatcher.isLastLevel()) {
            isPaused = true;
            showSplashScreen('LEVEL COMPLETE!', `You've completed Level ${levelWatcher.currentLevel}!`, 'Click or tap to continue to the next level.');
        } else {
            isPaused = true;
            showSplashScreen('VICTORY!', `You have defeated all enemies!`, 'Click or tap to play again.');
        }
    }

    requestAnimationFrame(animate);
}

function shootPellet() {
    if (isPaused) return;
    const head = dragonSegments[0];
    const angle = head.angle;
    projectiles.push({
        x: head.x + Math.cos(angle) * DRAGON_SEGMENT_SIZE * 2,
        y: head.y + Math.sin(angle) * DRAGON_SEGMENT_SIZE * 2,
        vx: Math.cos(angle) * PELLET_SPEED,
        vy: Math.sin(angle) * PELLET_SPEED,
        size: 8,
        color: `hsl(${Math.random() * 360}, 100%, 50%)`
    });

    isMouthOpen = true;
    setTimeout(() => {
        isMouthOpen = false;
    }, OPEN_MOUTH_DURATION);
}

function startBoost() {
    // One-shot timed boost: multiply fire rate once for BOOST_DURATION ms
    if (isPaused || !levelWatcher || isCooling || isBoosting) return;
    const levelConfig = levelWatcher.getLevelConfig();
    if (!levelConfig) return;

    isBoosting = true;
    // update UI
    if (shootInstructions) shootInstructions.innerText = 'Boosted';
    // Fire one immediately for responsiveness
    shootPellet();
    clearInterval(pelletInterval);
    const boostedSpeed = levelConfig.aimSpeed * (Number(levelConfig.multiplier) || 1);
    pelletInterval = setInterval(shootPellet, 1000 / boostedSpeed);

    boostTimeout = setTimeout(() => {
        // boost ending: restore and start cooldown
        isBoosting = false;
        clearInterval(pelletInterval);
        const currentLevel = levelWatcher.getLevelConfig();
        pelletInterval = setInterval(shootPellet, 1000 / (currentLevel.aimSpeed || 1));
        boostTimeout = null;

        isCooling = true;
        if (shootInstructions) shootInstructions.innerText = 'Cooldown...';
        cooldownTimeout = setTimeout(() => {
            isCooling = false;
            if (shootInstructions) shootInstructions.innerText = 'Tap to shoot faster';
            cooldownTimeout = null;
        }, COOLDOWN_DURATION);
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
    const worldPos = screenToWorld(x, y);
    target.x = Math.max(0, Math.min(WORLD_WIDTH, worldPos.x));
    target.y = Math.max(0, Math.min(WORLD_HEIGHT, worldPos.y));
    // show and position persistent cursor
    try {
        if (cursorEl) {
            cursorEl.style.display = 'block';
            // position the DOM cursor in screen pixels (client coords)
            cursorEl.style.left = (x) + 'px';
            cursorEl.style.top = (y) + 'px';
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
    // Ensure the canvas and camera are sized before we compute viewport-aligned placements
    resizeCanvas();
    await loadLevelsAndMonsters();
    // create a LevelWatcher now that `levels` is populated
    levelWatcher = new LevelWatcher(levels);
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

