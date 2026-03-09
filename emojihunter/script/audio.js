// Audio handling extracted from emojihunter.js
// Manages background music, mute state, and pop sound effects.

const MUTE_KEY = 'emojihunter_muted';
let audioToggleBtnRef = null;

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
let recentKillTimes = [];
let popx3Playing = false;
let popx3Instance = null;
let popx3StopTimeout = null;

let isMuted = (localStorage.getItem(MUTE_KEY) === 'true');
let bgPausedByVisibility = false;
let bgPausedByPause = false;
let pendingVisibilityGesture = false;

function updateToggleUI() {
    if (audioToggleBtnRef) audioToggleBtnRef.innerText = isMuted ? '🔈' : '🔊';
}

function setMuted(nextMuted) {
    isMuted = !!nextMuted;
    bgAudio.muted = isMuted;
    localStorage.setItem(MUTE_KEY, isMuted ? 'true' : 'false');
    updateToggleUI();
    if (!isMuted) tryPlayAudio();
}

export function getIsMuted() {
    return isMuted;
}

export function initAudioControls(audioToggleBtn) {
    audioToggleBtnRef = audioToggleBtn || null;
    bgAudio.muted = isMuted;
    updateToggleUI();
    if (audioToggleBtnRef) {
        audioToggleBtnRef.addEventListener('click', () => setMuted(!isMuted));
    }
}

export async function tryPlayAudio() {
    try {
        await bgAudio.play();
    } catch (err) {
        const resume = async () => {
            try {
                await bgAudio.play();
            } catch (e) {
                console.warn('bgAudio still blocked or failed to play', e);
            }
            window.removeEventListener('pointerdown', resume);
            window.removeEventListener('keydown', resume);
        };
        window.addEventListener('pointerdown', resume, { once: true });
        window.addEventListener('keydown', resume, { once: true });
    }
}

export function playPop() {
    if (isMuted) return;

    const now = performance.now();
    recentKillTimes.push(now);
    recentKillTimes = recentKillTimes.filter(t => now - t < 880);

    if (recentKillTimes.length >= 3) {
        if (!popx3Playing) {
            popx3Instance = popx3SoundBase.cloneNode();
            popx3Instance.loop = true;
            popx3Instance.volume = 0.35;
            popx3Instance.play().catch(() => {});
            popx3Playing = true;
        }

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
        const pop = popSoundBase.cloneNode();
        pop.volume = 0.3;
        pop.play().catch(() => {});
    }
}

export function pauseBackgroundForPause() {
    try {
        if (!bgAudio.paused) {
            bgAudio.pause();
            bgPausedByPause = true;
        } else {
            bgPausedByPause = false;
        }
    } catch (e) {}
}

export function pauseBackgroundForGameOver() {
    pauseBackgroundForPause();
}

export function resumeBackgroundAfterPause() {
    if (isMuted) return;
    try {
        if (bgPausedByVisibility) {
            if (pendingVisibilityGesture) {
                tryPlayAudio();
                bgPausedByVisibility = false;
                pendingVisibilityGesture = false;
            }
        } else {
            tryPlayAudio();
            bgPausedByPause = false;
        }
    } catch (e) {}
}

export function handleVisibilityAudio(isPaused) {
    try {
        if (document.hidden) {
            if (!bgAudio.paused) {
                bgAudio.pause();
                bgPausedByVisibility = true;
            }
            return;
        }

        if (bgPausedByVisibility) {
            const resumeOnGesture = () => {
                pendingVisibilityGesture = true;
                if (!isPaused && !isMuted) {
                    tryPlayAudio();
                    bgPausedByVisibility = false;
                    pendingVisibilityGesture = false;
                }
                window.removeEventListener('pointerdown', resumeOnGesture);
            };
            window.addEventListener('pointerdown', resumeOnGesture, { once: true });
        }
    } catch (e) {}
}

export { bgAudio };
