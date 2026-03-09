// Simple frame engine with FPS cap and dt clamping

export function createEngine({ targetFps = 30, maxDt = 0.05, onFrame }) {
    let lastFrameTime = 0;
    let lastTimestamp = null;
    let rafId = null;

    const frame = (ts) => {
        // FPS gating
        const frameInterval = 1000 / targetFps;
        if (lastFrameTime && ts - lastFrameTime < frameInterval) {
            rafId = requestAnimationFrame(frame);
            return;
        }
        lastFrameTime = ts;

        if (lastTimestamp == null) lastTimestamp = ts;
        const rawDt = (ts - lastTimestamp) / 1000;
        const dt = Math.min(maxDt, rawDt);
        lastTimestamp = ts;

        if (typeof onFrame === 'function') {
            onFrame(dt, ts);
        }
        rafId = requestAnimationFrame(frame);
    };

    const start = () => {
        stop();
        lastFrameTime = 0;
        lastTimestamp = null;
        rafId = requestAnimationFrame(frame);
    };

    const stop = () => {
        if (rafId) {
            cancelAnimationFrame(rafId);
            rafId = null;
        }
    };

    return { start, stop };
}
