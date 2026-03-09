// Shared utility helpers for coordinate transforms and avatar sprite loading

// Convert screen/client pixels to world units using the active camera transform
export function screenToWorld(clientX, clientY, canvas, camera = {}) {
    if (!canvas) return { x: clientX, y: clientY };
    const rect = canvas.getBoundingClientRect();
    const cx = clientX - rect.left;
    const cy = clientY - rect.top;
    const scale = camera.scale || 1;
    const offsetX = camera.offsetX || 0;
    const offsetY = camera.offsetY || 0;
    return { x: (cx - offsetX) / scale, y: (cy - offsetY) / scale };
}

// Convert world units to screen/client pixels using the active camera transform
export function worldToScreen(wx, wy, camera = {}) {
    const scale = camera.scale || 1;
    const offsetX = camera.offsetX || 0;
    const offsetY = camera.offsetY || 0;
    return { x: (wx * scale) + offsetX, y: (wy * scale) + offsetY };
}

// Avatar sprite assets - Lottie animations rendered to offscreen canvases
const avatarSprites = {
    default: { anim: null, container: null, ready: false },
    activated: { anim: null, container: null, ready: false }
};

const SPRITE_SIZE = 200; // Size of the offscreen canvas for Lottie rendering

// Load avatar sprites using Lottie
export function loadAvatarSprites() {
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
            offCanvas.getContext('2d');
            
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
export function getLottieSpriteCanvas(spriteName) {
    const sprite = avatarSprites[spriteName];
    if (!sprite || !sprite.ready || !sprite.anim) return null;
    const lottieCanvas = sprite.container.querySelector('canvas');
    if (lottieCanvas) {
        return lottieCanvas;
    }
    return null;
}
