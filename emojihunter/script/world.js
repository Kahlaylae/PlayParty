// Collidables and pathfinding extracted from emojihunter.js
// Provides Collidable sprites and a CollidableManager with spatial grid and A* pathfinding.

// Cache for pre-rendered emoji sprites (Safari workaround)
const emojiSpriteCache = new Map();

// Pre-render emoji to offscreen canvas at specific size (forces Safari to scale)
function getEmojiSprite(emoji, size) {
    const key = `${emoji}_${size}`;
    if (emojiSpriteCache.has(key)) {
        return emojiSpriteCache.get(key);
    }
    const padding = Math.ceil(size * 0.2);
    const canvasSize = size + padding * 2;
    const offscreen = document.createElement('canvas');
    offscreen.width = canvasSize;
    offscreen.height = canvasSize;
    const offCtx = offscreen.getContext('2d');
    offCtx.textAlign = 'center';
    offCtx.textBaseline = 'middle';
    offCtx.font = `${size}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
    offCtx.fillStyle = '#000';
    offCtx.fillText(emoji, canvasSize / 2, canvasSize / 2);
    const sprite = { canvas: offscreen, size: canvasSize };
    emojiSpriteCache.set(key, sprite);
    return sprite;
}

export class Collidable {
    constructor(opts = {}) {
        this.x = Number(opts.x || 0);
        this.y = Number(opts.y || 0);
        this.emoji = opts.emoji || null;
        this.scale = Number(opts.scale || 1);
        this.id = opts.id || `c-${Math.random().toString(36).slice(2,9)}`;
        this.collidesWith = Object.assign({ dragon: true, pellets: true, enemies: false }, opts.collidesWith || {});
        this.active = true;
        const visualRadius = 26 * this.scale;
        this.radius = Number(opts.radius || Math.min(20, visualRadius * 0.6));
        this.moving = opts.moving || false;
        this.motion = opts.motion || null;
        this.baseX = opts.baseX || this.x;
        this.baseY = opts.baseY || this.y;
        this.positionToken = opts.positionToken;
    }

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
        const sprite = getEmojiSprite(this.emoji, fontSize);
        const drawSize = sprite.size;
        ctx.drawImage(sprite.canvas, this.x - drawSize / 2, this.y - drawSize / 2, drawSize, drawSize);
    }

    clampToViewport(w, h) {
        if (this.x + this.radius < 0 || this.x - this.radius > w || this.y + this.radius < 0 || this.y - this.radius > h) return false;
        this.x = Math.max(this.radius, Math.min(this.x, w - this.radius));
        this.y = Math.max(this.radius, Math.min(this.y, h - this.radius));
        return true;
    }
}

export class CollidableManager {
    constructor(worldWidth = 800, worldHeight = 600) {
        this.list = [];
        this.grid = new Map();
        this.cellSize = 128;
        this._pfCache = null;
        this._pfDirty = true;
        this.worldWidth = worldWidth;
        this.worldHeight = worldHeight;
    }

    setWorldSize(w, h) {
        this.worldWidth = Math.max(1, Number(w) || this.worldWidth);
        this.worldHeight = Math.max(1, Number(h) || this.worldHeight);
        this._pfDirty = true;
    }

    clear() { this.list.length = 0; }
    set(arr) { this.list = arr.slice(); this._pfDirty = true; }
    add(c) { this.list.push(c); this._pfDirty = true; }
    getAll() { return this.list.slice(); }
    draw(ctx) { this.list.forEach(c => c.draw(ctx)); }

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

    queryCircle(cx, cy, r, { groups = null } = {}) {
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

    buildGrid(cellSize = 128, viewW = this.worldWidth, viewH = this.worldHeight) {
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

    buildPathfindingGrid(cellSize = 32, padding = 0, viewW = this.worldWidth, viewH = this.worldHeight) {
        const cs = Math.max(8, Number(cellSize) || 32);
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
                    grid[gy * cols + gx] = true;
                }
            }
        }
        const out = { grid, cols, rows, cs, padding, viewW, viewH };
        this._pfCache = out;
        this._pfDirty = false;
        return out;
    }

    findPath(startX, startY, targetX, targetY, radius = 0, cellSize = 32) {
        const pf = this.buildPathfindingGrid(cellSize, radius, this.worldWidth, this.worldHeight);
        const { grid, cols, rows, cs } = pf;
        const toIndex = (x, y) => y * cols + x;
        const sx = Math.max(0, Math.min(cols - 1, Math.floor(startX / cs)));
        const sy = Math.max(0, Math.min(rows - 1, Math.floor(startY / cs)));
        const tx = Math.max(0, Math.min(cols - 1, Math.floor(targetX / cs)));
        const ty = Math.max(0, Math.min(rows - 1, Math.floor(targetY / cs)));
        if (grid[toIndex(tx, ty)]) return null;

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
            let currentKey = null; let currentF = Infinity; let current = null;
            for (const [k, v] of open) {
                const f = fScore.get(k) || Infinity;
                if (f < currentF) { currentF = f; currentKey = k; current = v; }
            }
            if (!current) break;
            if (current.x === tx && current.y === ty) {
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
                if (grid[ny * cols + nx]) continue;
                const tentativeG = (gScore.get(currentKey) || Infinity) + ((neighbors[ni][0] && neighbors[ni][1]) ? 1.414 : 1);
                if (!open.has(nKey)) open.set(nKey, { x: nx, y: ny });
                if (tentativeG >= (gScore.get(nKey) || Infinity)) continue;
                cameFrom.set(nKey, currentKey);
                gScore.set(nKey, tentativeG);
                fScore.set(nKey, tentativeG + heuristic(nx, ny));
            }
        }
        return null;
    }
}
