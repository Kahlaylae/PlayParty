// Level loading and configuration helpers extracted from emojihunter.js
// Handles monsters/levels/obstacles plus position helpers and LevelWatcher.

import { Collidable } from './world.js';

// UI breakpoint used by both CSS and JS. Keep in sync with `@media (min-width: 600px)` in index.html
export const MINI_BREAKPOINT = 600;

// 6-point positioning system for obstacles; uses current world dimensions
export function calculateObstaclePosition(position, radiusWorld, worldWidth = 0, worldHeight = 0) {
    const marginPx = 32;
    let x, y, movementPath = null;

    switch (position) {
        case '.topLeading':
        case '.bottomLeading':
        case '.leading':
            x = marginPx + radiusWorld;
            y = worldHeight / 2;
            movementPath = {
                direction: 'vertical',
                amplitude: Math.min(
                    (worldHeight / 2) - marginPx - radiusWorld,
                    (worldHeight / 2) - marginPx - radiusWorld
                )
            };
            break;
        case '.top':
            x = worldWidth / 2;
            y = marginPx + radiusWorld;
            movementPath = {
                direction: 'horizontal',
                amplitude: (worldWidth / 2) - marginPx - radiusWorld
            };
            break;
        case '.topTrailing':
        case '.bottomTrailing':
        case '.trailing':
            x = worldWidth - marginPx - radiusWorld;
            y = worldHeight / 2;
            movementPath = {
                direction: 'vertical',
                amplitude: Math.min(
                    (worldHeight / 2) - marginPx - radiusWorld,
                    (worldHeight / 2) - marginPx - radiusWorld
                )
            };
            break;
        case '.center':
            x = worldWidth / 2;
            y = worldHeight / 2;
            movementPath = {
                direction: 'horizontal',
                amplitude: (worldWidth / 2) - marginPx - radiusWorld
            };
            break;
        case '.centerVertical':
            x = worldWidth / 2;
            y = worldHeight / 2;
            movementPath = {
                direction: 'vertical',
                amplitude: (worldHeight / 2) - marginPx - radiusWorld
            };
            break;
        case '.bottom':
            x = worldWidth / 2;
            y = worldHeight - marginPx - radiusWorld;
            movementPath = {
                direction: 'horizontal',
                amplitude: (worldWidth / 2) - marginPx - radiusWorld
            };
            break;
        default:
            return null;
    }

    return { x, y, movementPath };
}

export async function loadLevelsAndMonsters({ worldWidth = 0, worldHeight = 0, useMobileBackground = false } = {}) {
    const monsterMap = {};
    const levels = {};
    let obstaclesMap = new Map();

    try {
        const mResp = await fetch('assets/monsters.json');
        const monstersArr = await mResp.json();
        monstersArr.forEach(m => { monsterMap[m.monster] = m; });
    } catch (err) {
        console.error('Failed to load monsters.json', err);
    }

    try {
        const lResp = await fetch('assets/levels.json');
        const levelsArr = await lResp.json();
        let obstaclesArr = [];
        try {
            const oResp = await fetch('assets/obstacles.json');
            obstaclesArr = await oResp.json();
        } catch (e) {
            console.warn('Failed to load obstacles.json; continuing without obstacle presets', e);
        }
        obstaclesMap = new Map();
        obstaclesArr.forEach(o => {
            const key = (o.name || o.obstacles || '').toString().trim();
            if (key) obstaclesMap.set(key, o);
        });
        window.__obstaclesMap = obstaclesMap;

        levelsArr.forEach(l => {
            const monsterIds = String(l.emoji || '').split(',').map(s => s.trim()).filter(Boolean);
            const monsters = monsterIds.map(id => monsterMap[id]).filter(Boolean);
            const obstacleSpec = l.obstacles || [];
            const collidables = [];

            obstacleSpec.forEach(obstacleEntry => {
                const { name, set } = obstacleEntry;
                const def = obstaclesMap.get(name);
                if (!def) return;

                const scale = Math.max(1, Number(def.scale || 1));
                const radius = 20;
                const speed = Number(def.speed || 1);

                set.forEach(position => {
                    const positionData = calculateObstaclePosition(position, radius, worldWidth, worldHeight);
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

            const background = l.background || 'assets/levelbackgrounds/defaultbg.png';
            const resolvedBackground = (useMobileBackground && l.background)
                ? l.background.replace('.png', '-mobile.png')
                : background;

            levels[l.level] = {
                level: l.level,
                target: l.target || 50,
                monsters: monsters.length ? monsters : [{ monster: 'oni', emoji: '👹', normalHp: 1, bossHp: 2, enemySpeed: 0.5 }],
                aimSpeed: l.aimSpeed || 1,
                spawnRate: l.spawnRate || 1,
                collidables,
                multiplier: (l.multiplier !== undefined) ? Number(l.multiplier) : 2,
                background: resolvedBackground
            };
        });
    } catch (err) {
        console.error('Failed to load levels.json', err);
    }

    return { levels, monsterMap, obstaclesMap };
}

// LevelWatcher class to manage the game's level progression.
export class LevelWatcher {
    constructor(levels) {
        this.postgameConfig = null;
        this.levels = {};
        Object.values(levels || {}).forEach(level => {
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
        }
        this.isEndlessMode = true;
        return true;
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
