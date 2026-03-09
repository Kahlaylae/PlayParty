// Control mode helpers: persist user preference and log selections

const CONTROL_MODES = Object.freeze({
    MOBILE: 'mobile',
    KEYBOARD: 'keyboard'
});

const CONTROL_MODE_KEY = 'emojihunter_control_mode_v1';
const CONTROL_LOG_KEY = 'emojihunter_control_log_v1';
const CONTROL_LOG_LIMIT = 25;

function normalizeMode(mode) {
    return mode === CONTROL_MODES.KEYBOARD ? CONTROL_MODES.KEYBOARD : CONTROL_MODES.MOBILE;
}

function inferDefaultControlMode() {
    try {
        const prefersTouch = typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0;
        const coarsePointer = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
        return (prefersTouch || coarsePointer) ? CONTROL_MODES.MOBILE : CONTROL_MODES.KEYBOARD;
    } catch (e) {
        return CONTROL_MODES.KEYBOARD;
    }
}

function getControlLog() {
    try {
        const raw = localStorage.getItem(CONTROL_LOG_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
        return [];
    }
}

function logControlSelection(mode, source = 'unknown') {
    const entry = { mode: normalizeMode(mode), source, ts: Date.now() };
    const history = getControlLog();
    history.push(entry);
    while (history.length > CONTROL_LOG_LIMIT) history.shift();
    try {
        localStorage.setItem(CONTROL_LOG_KEY, JSON.stringify(history));
    } catch (e) {
        // ignore
    }
    return entry;
}

function loadControlSettings() {
    let mode = inferDefaultControlMode();
    try {
        const stored = localStorage.getItem(CONTROL_MODE_KEY);
        if (stored === CONTROL_MODES.MOBILE || stored === CONTROL_MODES.KEYBOARD) {
            mode = stored;
        } else {
            logControlSelection(mode, 'inferred-default');
        }
    } catch (e) {
        // ignore storage errors and use inferred default
    }
    return { mode: normalizeMode(mode) };
}

function saveControlMode(mode, source = 'manual') {
    const normalized = normalizeMode(mode);
    try {
        localStorage.setItem(CONTROL_MODE_KEY, normalized);
    } catch (e) {
        // ignore storage errors
    }
    logControlSelection(normalized, source);
    return normalized;
}

export {
    CONTROL_MODES,
    loadControlSettings,
    saveControlMode,
    inferDefaultControlMode,
    getControlLog,
    logControlSelection
};
