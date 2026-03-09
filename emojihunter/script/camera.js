// Camera and viewport management
// Handles canvas sizing, DPR capping, virtual/world dimensions, and obstacle repositioning

export function resizeCamera({
    canvas,
    gameContainer,
    camera,
    virtualBase,
    miniBreakpoint,
    target,
    collidableManager,
    levelWatcher,
    calculateObstaclePosition
}) {
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

    // Set the drawing buffer to match container size * DPR
    canvas.width = Math.round(cssWidth * dpr);
    canvas.height = Math.round(cssHeight * dpr);

    // ADAPTIVE VIRTUAL CANVAS: adjust dimensions to match viewport aspect ratio (fill play area)
    const screenAspect = cssWidth / cssHeight;
    let virtualWidth;
    let virtualHeight;
    if (screenAspect >= 1) {
        // Landscape/Desktop: height is base, width expands
        virtualHeight = virtualBase;
        virtualWidth = Math.round(virtualBase * screenAspect);
    } else {
        // Portrait/Mobile: width is base, height expands
        virtualWidth = virtualBase;
        virtualHeight = Math.round(virtualBase / screenAspect);
    }

    // Scale maps virtual coords to screen coords (no letterboxing needed)
    const canvasScale = cssWidth / virtualWidth; // Same as cssHeight / virtualHeight
    const canvasOffsetX = 0;
    const canvasOffsetY = 0;

    // World size matches virtual dimensions
    const worldWidth = virtualWidth;
    const worldHeight = virtualHeight;
    camera.scale = canvasScale;
    camera.offsetX = canvasOffsetX;
    camera.offsetY = canvasOffsetY;
    // store DPR for use when setting canvas transforms in rendering
    camera.dpr = dpr;

    // center target in world coordinates
    if (target) {
        target.x = worldWidth / 2;
        target.y = worldHeight / 2;
    }

    // Apply responsive class for narrow screens
    try {
        const shouldMini = (window.innerWidth <= miniBreakpoint);
        document.body.classList.toggle('miniScreen', shouldMini);
    } catch (e) {}

    // Rebuild spatial grid and reposition obstacles to new viewport
    try {
        if (collidableManager) {
            collidableManager.setWorldSize(worldWidth, worldHeight);
            collidableManager.buildGrid(collidableManager.cellSize || 128, worldWidth, worldHeight);
            collidableManager.sanitize(worldWidth, worldHeight);
            try {
                if (levelWatcher && calculateObstaclePosition) {
                    const levelConfig = levelWatcher.getLevelConfig();
                    (levelConfig.collidables || []).forEach(c => {
                        if (c && c.positionToken) {
                            const positionData = calculateObstaclePosition(c.positionToken, c.originalRadius || c.radius, worldWidth, worldHeight);
                            if (positionData) {
                                c.x = positionData.x;
                                c.y = positionData.y;
                                c.baseX = positionData.x;
                                c.baseY = positionData.y;
                                if (c.moving && positionData.movementPath) {
                                    c.motion.amplitude = positionData.movementPath.amplitude;
                                }
                            }
                        }
                    });
                    collidableManager.buildGrid(collidableManager.cellSize || 128, worldWidth, worldHeight);
                }
            } catch (e) {
                console.warn('Error repositioning obstacles on resize:', e);
            }
        }
    } catch (e) {}

    return {
        virtualWidth,
        virtualHeight,
        worldWidth,
        worldHeight,
        canvasScale,
        canvasOffsetX,
        canvasOffsetY,
        dpr
    };
}
