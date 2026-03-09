// UI creation helpers extracted from emojihunter.js
// Builds all DOM elements for the game and returns references

function createControlButtons(container) {
    const host = container || document.body;

    // Ensure host can anchor absolutely positioned controls inside the game window
    try {
        const pos = window.getComputedStyle(host).position;
        if (!pos || pos === 'static') {
            host.style.position = 'relative';
        }
    } catch (e) {}

    // HUD layer so controls feel part of the game (overlay above canvas/splash)
    const hudLayer = document.createElement('div');
    hudLayer.id = 'hud-layer';
    hudLayer.style.position = 'absolute';
    hudLayer.style.inset = '0';
    hudLayer.style.pointerEvents = 'none';
    hudLayer.style.zIndex = '130';
    host.appendChild(hudLayer);

    const menuBtn = document.createElement('button');
    menuBtn.id = 'menu-toggle';
    menuBtn.type = 'button';
    menuBtn.setAttribute('aria-label', 'Open game menu');
    menuBtn.textContent = '☰';
    menuBtn.style.position = 'absolute';
    menuBtn.style.top = '8px';
    menuBtn.style.right = '8px';
    menuBtn.style.zIndex = '140'; // above splash/canvas
    menuBtn.style.padding = '10px 14px';
    menuBtn.style.borderRadius = '10px';
    menuBtn.style.border = '1px solid rgba(255,255,255,0.2)';
    menuBtn.style.background = 'rgba(10,12,16,0.7)';
    menuBtn.style.color = '#fff';
    menuBtn.style.cursor = 'pointer';
    menuBtn.style.fontSize = '18px';
    menuBtn.style.pointerEvents = 'auto';
    menuBtn.style.display = 'none';
    hudLayer.appendChild(menuBtn);

    const overlay = document.createElement('div');
    overlay.id = 'menu-overlay';
    overlay.style.position = 'absolute';
    overlay.style.inset = '0';
    overlay.style.display = 'none';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.padding = '12px';
    overlay.style.zIndex = '145';
    overlay.style.background = 'rgba(0,0,0,0.55)';
    overlay.style.backdropFilter = 'blur(6px)';

    const panel = document.createElement('div');
    panel.id = 'menu-window';
    panel.style.width = '320px';
    panel.style.maxWidth = '92%';
    panel.style.maxHeight = 'calc(100% - 24px)';
    panel.style.background = '#0f141c';
    panel.style.border = '1px solid rgba(255,255,255,0.14)';
    panel.style.borderRadius = '14px';
    panel.style.boxShadow = '0 18px 48px rgba(0,0,0,0.45)';
    panel.style.color = '#fff';
    panel.style.padding = '16px';
    panel.style.display = 'flex';
    panel.style.flexDirection = 'column';
    panel.style.gap = '12px';
    panel.style.overflow = 'auto';

    const header = document.createElement('div');
    header.style.display = 'flex';
    header.style.alignItems = 'center';
    header.style.justifyContent = 'space-between';
    const title = document.createElement('h3');
    title.textContent = 'Game Menu';
    title.style.margin = '0';
    const closeBtn = document.createElement('button');
    closeBtn.id = 'menu-close';
    closeBtn.type = 'button';
    closeBtn.textContent = '×';
    closeBtn.style.background = 'transparent';
    closeBtn.style.color = '#fff';
    closeBtn.style.border = 'none';
    closeBtn.style.fontSize = '20px';
    closeBtn.style.cursor = 'pointer';
    closeBtn.style.padding = '4px 6px';
    header.appendChild(title);
    header.appendChild(closeBtn);

    const mainView = document.createElement('div');
    mainView.id = 'menu-main';
    mainView.style.display = 'flex';
    mainView.style.flexDirection = 'column';
    mainView.style.gap = '10px';

    const howToView = document.createElement('div');
    howToView.id = 'menu-howto';
    howToView.style.display = 'none';
    howToView.style.flexDirection = 'column';
    howToView.style.gap = '10px';

    const makeItem = (id, label) => {
        const b = document.createElement('button');
        b.id = id;
        b.type = 'button';
        b.textContent = label;
        b.style.width = '100%';
        b.style.padding = '12px';
        b.style.borderRadius = '10px';
        b.style.border = '1px solid rgba(255,255,255,0.16)';
        b.style.background = 'rgba(255,255,255,0.06)';
        b.style.color = '#fff';
        b.style.fontSize = '0.95rem';
        b.style.fontWeight = '600';
        b.style.cursor = 'pointer';
        return b;
    };

    const fullscreenBtn = makeItem('fullscreen-toggle', 'Fullscreen');
    const audioBtn = makeItem('audio-toggle', 'Music');
    const leaderboardBtn = makeItem('leaderboard-toggle', 'Leaderboard');
    const controlBtn = makeItem('control-toggle', 'Controls: Mobile');
    const howToBtn = makeItem('howto-toggle', 'How to Play');
    const pauseBtn = makeItem('pause-toggle', 'Resume');

    mainView.appendChild(fullscreenBtn);
    mainView.appendChild(audioBtn);
    mainView.appendChild(leaderboardBtn);
    mainView.appendChild(controlBtn);
    mainView.appendChild(howToBtn);
    mainView.appendChild(pauseBtn);

    const howTitle = document.createElement('h4');
    howTitle.textContent = 'How to Play';
    howTitle.style.margin = '0';
    const howText = document.createElement('div');
    howText.innerText = 'Keyboard: arrows/WASD to steer.\nMobile: move cursor or touch to steer.\nTap/click/hold to boost fire. Clear enemies to advance; survive in endless mode.';
    howText.style.lineHeight = '1.4';
    howText.style.whiteSpace = 'pre-line';
    const howBack = makeItem('howto-back', 'Back to Menu');
    howToView.appendChild(howTitle);
    howToView.appendChild(howText);
    howToView.appendChild(howBack);

    panel.appendChild(header);
    panel.appendChild(mainView);
    panel.appendChild(howToView);
    overlay.appendChild(panel);
    host.appendChild(overlay);

    return {
        hudLayer,
        menuBtn,
        menuOverlay: overlay,
        menuMain: mainView,
        menuHowTo: howToView,
        menuCloseBtn: closeBtn,
        fullscreenBtn,
        audioBtn,
        leaderboardBtn,
        pauseBtn,
        controlBtn,
        howToBtn,
        howToBackBtn: howBack
    };
}

export function createUI(gameContainer) {
    const host = gameContainer || document.body;

    // score
    const scoreEl = document.createElement('div');
    scoreEl.id = 'score';
    host.appendChild(scoreEl);

    // canvas
    const cvs = document.createElement('canvas');
    cvs.id = 'gameCanvas';
    host.appendChild(cvs);

    // splash
    const splash = document.createElement('div');
    splash.id = 'splashScreen';
    splash.style.cursor = 'pointer'; // Always show pointer cursor on splash
    const inner = document.createElement('div');
    inner.className = 'splash-inner';
    inner.style.cursor = 'pointer'; // Ensure inner also has pointer
    const h1 = document.createElement('h1'); h1.id = 'splashTitle';
    const p = document.createElement('p'); p.id = 'splashMessage';
    const prompt = document.createElement('p'); prompt.id = 'splashPrompt'; prompt.className = 'restart-prompt';
    inner.appendChild(h1); inner.appendChild(p); inner.appendChild(prompt);
    splash.appendChild(inner);
    host.appendChild(splash);

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
    host.appendChild(lb);

    // persistent cursor element: subtle chevron that orbits the avatar and points toward target
    const cursorEl = document.createElement('div');
    cursorEl.id = 'game-cursor';
    cursorEl.style.position = 'fixed';
    cursorEl.style.left = '0px';
    cursorEl.style.top = '0px';
    cursorEl.style.width = '24px';
    cursorEl.style.height = '24px';
    cursorEl.style.pointerEvents = 'none';
    cursorEl.style.zIndex = '9999';
    cursorEl.style.display = 'none'; // hidden until we have a position
    // Chevron SVG pointing upward (will be rotated via transform)
    cursorEl.innerHTML = `
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(0 0 4px rgba(0,255,255,0.7));">
            <path d="M12 6 L4 16 L8 16 L12 11 L16 16 L20 16 Z" fill="rgba(255,255,255,0.9)" stroke="rgba(0,220,255,0.8)" stroke-width="1"/>
        </svg>
    `;
    host.appendChild(cursorEl);

    // No CSS transitions - smoothing handled via JS lerping for better performance

    // controls
    const created = createControlButtons(host);
    return {
        canvasEl: cvs,
        scoreEl,
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
        pauseBtn: created.pauseBtn,
        controlBtn: created.controlBtn,
        menuBtn: created.menuBtn,
        menuOverlay: created.menuOverlay,
        menuMain: created.menuMain,
        menuHowTo: created.menuHowTo,
        menuCloseBtn: created.menuCloseBtn,
        howToBtn: created.howToBtn,
        howToBackBtn: created.howToBackBtn,
        cursorEl
    };
}
