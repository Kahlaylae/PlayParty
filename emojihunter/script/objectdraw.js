// Rendering helpers for background, avatar, pellets, collidables, and enemies.
// These functions are pure renderers: callers provide state/refs each frame.

// Smooth cursor tracking state for parallax background
let smoothCursorX = 0;
let smoothCursorY = 0;
const CURSOR_SMOOTHING = 0.08; // Lower = smoother/slower (0.05-0.15 range)

// Draw background to fill entire canvas with parallax and tilt
export function drawParallaxBackgroundFullCanvas({
    ctx,
    canvas,
    camera,
    currentBackgroundImage,
    virtualWidth,
    virtualHeight,
    target
}) {
    if (!ctx || !canvas || !camera || !currentBackgroundImage || !target) return;

    // lazy-init smoothing centers
    if (smoothCursorX === 0) smoothCursorX = virtualWidth / 2;
    if (smoothCursorY === 0) smoothCursorY = virtualHeight / 2;

    const img = currentBackgroundImage;
    const dpr = (camera && camera.dpr) ? camera.dpr : 1;
    const canvasW = canvas.width / dpr;
    const canvasH = canvas.height / dpr;

    smoothCursorX += (target.x - smoothCursorX) * CURSOR_SMOOTHING;
    smoothCursorY += (target.y - smoothCursorY) * CURSOR_SMOOTHING;

    const centerVirtualX = virtualWidth / 2;
    const centerVirtualY = virtualHeight / 2;
    const cursorOffsetX = (smoothCursorX - centerVirtualX) / centerVirtualX;
    const cursorOffsetY = (smoothCursorY - centerVirtualY) / centerVirtualY;

    const maxShiftRatio = 0.02;
    const shiftX = cursorOffsetX * canvasW * maxShiftRatio;
    const shiftY = cursorOffsetY * canvasH * maxShiftRatio;

    const maxTilt = 0.015;
    const tiltX = cursorOffsetY * maxTilt;
    const tiltY = cursorOffsetX * maxTilt;

    const oversize = Math.max(canvasW, canvasH) * 0.1;
    const imgAspect = img.width / img.height;
    const canvasAspect = canvasW / canvasH;

    let drawWidth, drawHeight;
    if (imgAspect > canvasAspect) {
        drawHeight = canvasH + oversize;
        drawWidth = drawHeight * imgAspect;
    } else {
        drawWidth = canvasW + oversize;
        drawHeight = drawWidth / imgAspect;
    }

    const centerX = canvasW / 2;
    const centerY = canvasH / 2;

    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const scaleBoost = 1.02;
    ctx.translate(centerX, centerY);
    ctx.transform(scaleBoost, tiltX, tiltY, scaleBoost, 0, 0);
    ctx.translate(-centerX, -centerY);

    const drawX = (canvasW - drawWidth) / 2 + shiftX;
    const drawY = (canvasH - drawHeight) / 2 + shiftY;
    ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);

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

export function drawParallaxBackground(opts) {
    drawParallaxBackgroundFullCanvas(opts);
}

export function drawAvatar({ ctx, avatarPosition, target, isBoosting, AVATAR_SIZE, avatarHit, getSpriteCanvas }) {
    if (!ctx || !avatarPosition || !target || !getSpriteCanvas) return;
    const spriteKey = isBoosting ? 'activated' : 'default';
    const lottieCanvas = getSpriteCanvas(spriteKey);
    if (!lottieCanvas) return;

    const dx = target.x - avatarPosition.x;
    const dy = target.y - avatarPosition.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const isMovingLeft = distance > 5 ? dx < 0 : target.x < avatarPosition.x;
    // isMovingLeft currently unused but kept for potential sprite flipping

    ctx.save();
    const avatarSize = AVATAR_SIZE * 8;
    const imgWidth = avatarSize;
    const imgHeight = avatarSize;
    const verticalOffset = -2;

    ctx.drawImage(
        lottieCanvas,
        avatarPosition.x - imgWidth / 2,
        avatarPosition.y - imgHeight / 2 + verticalOffset,
        imgWidth,
        imgHeight
    );

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

export function drawCollidables({ ctx, collidableManager }) {
    if (!ctx || !collidableManager || typeof collidableManager.draw !== 'function') return;
    try {
        collidableManager.draw(ctx);
    } catch (e) {}
}

export function drawPellets({ ctx, projectiles }) {
    if (!ctx || !Array.isArray(projectiles)) return;
    projectiles.forEach(p => {
        ctx.save();
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 2.5, 0, Math.PI * 2);
        ctx.fillStyle = p.color.replace('100%', '30%').replace('50%', '20%');
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 25;
        ctx.globalAlpha = 0.3;
        ctx.fill();

        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 20;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 0.6, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.shadowColor = 'rgba(255,255,255,0.9)';
        ctx.shadowBlur = 8;
        ctx.fill();

        ctx.restore();
    });
}

export function drawEnemies({ ctx, enemies }) {
    if (!ctx || !Array.isArray(enemies)) return;
    const now = performance.now();
    enemies.forEach(enemy => {
        if (!enemy) return;
        if (!enemy.spawnTime) enemy.spawnTime = now;
        const breathCycle = 500;
        const breathPhase = ((now - enemy.spawnTime) % breathCycle) / breathCycle;
        const breathScale = 1 + Math.sin(breathPhase * Math.PI * 2) * 0.08;
        const baseSize = Math.max(16, Math.floor(enemy.size * 0.8));
        const fontSize = Math.floor(baseSize * breathScale);
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = `${fontSize + 20}px sans-serif`;
        ctx.fillStyle = '#000';
        ctx.fillText(enemy.emoji, enemy.x, enemy.y);
        ctx.restore();
    });
}
