// Script moved out of index.html to keep HTML slim.
// All original game logic retained; do not rename this file unless updating index.html.

const canvas = document.getElementById('dragonCanvas');
const ctx = canvas.getContext('2d');
const scoreElement = document.getElementById('score');
const splashScreen = document.getElementById('splashScreen');
const splashTitle = document.getElementById('splashTitle');
const splashMessage = document.getElementById('splashMessage');
const splashPrompt = document.getElementById('splashPrompt');
const shootInstructions = document.getElementById('shoot-instructions');

// Background music setup (autoplay may be blocked by browser policies)
const bgAudio = new Audio('assets/dragonpartyplay.mp3');
bgAudio.loop = true;
bgAudio.preload = 'auto';
bgAudio.volume = 0.45;

// Await the first user gesture; the splash will be used to both enable audio and resume the game
let awaitingFirstGesture = true;
const audioToggleBtn = document.getElementById('audio-toggle');
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

if (audioToggleBtn) {
    audioToggleBtn.addEventListener('click', () => {
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

const DRAGON_SEGMENT_SIZE = 12;
const DRAGON_LENGTH = 4;
const SEGMENT_SPACING = DRAGON_SEGMENT_SIZE * 2;
const PELLET_SPEED = 15;
const DRAGON_SPEED = 5;
const OPEN_MOUTH_DURATION = 150;
const BOSS_ENEMY_SPAWN_THRESHOLD = 10;
        
// Levels will be loaded from JSON files in /assets at runtime.
// `levels` will be a map: levelNumber -> { target, monsters: [{monster, emoji, normalHp, bossHp, enemySpeed}], aimSpeed, spawnRate, collidables }
let levels = {};

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
        levelsArr.forEach(l => {
            const monsterIds = String(l.emoji || '').split(',').map(s => s.trim()).filter(Boolean);
            const monsters = monsterIds.map(id => monsterMap[id]).filter(Boolean);
            const collCount = Math.max(0, Number(l.collidables) || 0);
            const collidables = collidablesPool.slice(0, collCount);
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
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    target.x = canvas.width / 2;
    target.y = canvas.height / 2;
    // Apply responsive class for narrow or short screens
    try {
        const shouldMini = (window.innerWidth <= 480) || (window.innerHeight <= 520) || (window.innerWidth / window.innerHeight < 0.6);
        document.body.classList.toggle('miniScreen', shouldMini);
    } catch (e) {}
    if (dragonSegments.length === 0) {
        initializeDragon();
    }
}

function initializeDragon() {
    dragonSegments = [];
    for (let i = 0; i < DRAGON_LENGTH; i++) {
        dragonSegments.push({
            x: canvas.width / 2 - i * SEGMENT_SPACING,
            y: canvas.height / 2,
            angle: 0
        });
    }
}

function updateDragon() {
    // Update target based on keyboard direction
    if (keyboardDirection.x !== 0 || keyboardDirection.y !== 0) {
        target.x += keyboardDirection.x * DRAGON_SPEED;
        target.y += keyboardDirection.y * DRAGON_SPEED;
    }

    target.x = Math.max(0, Math.min(canvas.width, target.x));
    target.y = Math.max(0, Math.min(canvas.height, target.y));

    const head = dragonSegments[0];
    const dx = target.x - head.x;
    const dy = target.y - head.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    if (distance > 1) {
        head.angle = Math.atan2(dy, dx);
        const moveSpeed = Math.min(DRAGON_SPEED, distance);
        head.x += Math.cos(head.angle) * moveSpeed;
        head.y += Math.sin(head.angle) * moveSpeed;
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
    const levelConfig = levelWatcher.getLevelConfig();
    levelConfig.collidables.forEach(c => {
        ctx.beginPath();
        ctx.rect(c.x, c.y, c.width, c.height);
        ctx.fillStyle = c.color;
        ctx.shadowColor = c.color;
        ctx.shadowBlur = 15;
        ctx.fill();
    });
}

function updatePellets() {
    projectiles.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;

        if (p.x + p.size > canvas.width || p.x - p.size < 0) {
            p.vx = -p.vx;
            p.x = Math.max(p.size, Math.min(canvas.width - p.size, p.x));
            p.color = `hsl(${Math.random() * 360}, 100%, 50%)`;
        }

        if (p.y + p.size > canvas.height || p.y - p.size < 0) {
            p.vy = -p.vy;
            p.y = Math.max(p.size, Math.min(canvas.height - p.size, p.y));
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
    speed = monsterChoice.enemySpeed;

    if (enemiesDestroyed >= BOSS_ENEMY_SPAWN_THRESHOLD && Math.random() < 0.1) {
        size = 60;
        hp = monsterChoice.bossHp || monsterChoice.normalHp * 2;
        speed = (monsterChoice.enemySpeed || 1) / 2;
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
            startX = canvas.width;
            startY = 0;
            break;
        case 2:
            startX = 0;
            startY = canvas.height;
            break;
        case 3:
            startX = canvas.width;
            startY = canvas.height;
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

function updateEnemies() {
    const dragonHead = dragonSegments[0];
    enemies.forEach(enemy => {
        if (enemy.x + (enemy.size / 2) > canvas.width || enemy.x - (enemy.size / 2) < 0) {
            enemy.vx = -enemy.vx;
        }
        if (enemy.y + (enemy.size / 2) > canvas.height || enemy.y - (enemy.size / 2) < 0) {
            enemy.vy = -enemy.vy;
        }
        const dx = dragonHead.x - enemy.x;
        const dy = dragonHead.y - enemy.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance > 0) {
            enemy.vx = (dx / distance) * enemy.speed;
            enemy.vy = (dy / distance) * enemy.speed;
        }
        enemy.x += enemy.vx;
        enemy.y += enemy.vy;
    });
}

function drawEnemies() {
    enemies.forEach(enemy => {
        ctx.font = `${enemy.size}px sans-serif`;
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
    const levelConfig = levelWatcher.getLevelConfig();
    for (let i = 0; i < dragonSegments.length; i++) {
        const segment = dragonSegments[i];
        for (let j = 0; j < levelConfig.collidables.length; j++) {
            const collidable = levelConfig.collidables[j];
            
            const testX = Math.max(collidable.x, Math.min(segment.x, collidable.x + collidable.width));
            const testY = Math.max(collidable.y, Math.min(segment.y, collidable.y + collidable.height));

            const dx = segment.x - testX;
            const dy = segment.y - testY;
            let segmentSize = DRAGON_SEGMENT_SIZE;
            if (i === 0) {
                segmentSize *= 1.5;
            }
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance < segmentSize) {
                // Colliding with an obstacle no longer ends the game.
                // The collision logic is still here to act as a barrier.
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
    // If in miniScreen mode, constrain the splash width so it scales nicely
    try {
        if (document.body.classList.contains('miniScreen')) {
            splashScreen.style.maxWidth = '92%';
            splashScreen.style.padding = '18px 12px';
        } else {
            splashScreen.style.maxWidth = '';
            splashScreen.style.padding = '';
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
    animate();
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
    updateScore();
    gameLoopInterval = setInterval(spawnEnemy, 1000);
    const levelConfig = levelWatcher.getLevelConfig();
    pelletInterval = setInterval(shootPellet, 1000 / levelConfig.aimSpeed);
    animate();
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
    updateScore();
    gameLoopInterval = setInterval(spawnEnemy, 1000);
    const levelConfig = levelWatcher.getLevelConfig();
    pelletInterval = setInterval(shootPellet, 1000 / levelConfig.aimSpeed);
    animate();
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
    if (isPaused) {
        return;
    }

    ctx.fillStyle = 'rgba(13, 17, 23, 0.4)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';
    
    updateDragon();
    updatePellets();
    updateEnemies();
    
    checkDragonCollidableCollision();
    checkDragonEnemyCollision();
    checkPelletEnemyCollision();
    
    drawCollidables();
    drawDragon();
    drawPellets();
    drawEnemies();

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
    target.x = x;
    target.y = y;
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

window.addEventListener('resize', resizeCanvas);
window.addEventListener('mousedown', onDown);
window.addEventListener('touchstart', onDown, { passive: false });
window.addEventListener('mousemove', onMove);
window.addEventListener('touchmove', onMove, { passive: false });
        
window.onload = async function() {
    await loadLevelsAndMonsters();
    // create a LevelWatcher now that `levels` is populated
    levelWatcher = new LevelWatcher(levels);
    resizeCanvas();
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
        } else {
            el.style.width = '';
            el.style.maxWidth = '320px';
            el.style.maxHeight = '';
        }
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
    renderLeaderboard();
}

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

// Wire UI
const submitBtn = document.getElementById('submit-score');
const clearBtn = document.getElementById('clear-leaderboard');
// Wire leaderboard toggle button
const lbToggleBtn = document.getElementById('leaderboard-toggle');
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

// Pause toggle button
const pauseBtn = document.getElementById('pause-toggle');
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
if (submitBtn) {
    submitBtn.addEventListener('click', async (evt) => {
        evt.preventDefault();
        const nameInput = document.getElementById('player-name');
        const scoreInput = document.getElementById('player-score');
        const name = nameInput ? (nameInput.value.trim() || 'Anon') : 'Anon';
        const count = scoreInput ? Number(scoreInput.value || 0) : 0;
        await addScoreEntry({ name, count });
        if (nameInput) nameInput.value = '';
        if (scoreInput) scoreInput.value = '';
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

