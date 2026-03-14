// BuzzOff — App controller

// ── Control help text (single source of truth for tooltips) ──────────────────
const TIPS = {
    frequencyBand:    'The range of frequencies to listen for. Annoy covers common deterrent tones, Mosquito targets ultrasonic repellers, or set a Custom range.',
    sensitivity:      'How strong a signal must be to trigger detection. Low = fewer false positives. High = catches weaker tones.',
    filterWhiteNoise: 'Ignores broadband noise (<a href="https://en.wikipedia.org/wiki/White_noise" target="_blank" rel="noopener">white noise</a>, fans, fabric rustling) so only distinct, narrow-band tones trigger an alert. Turn off if you\'re missing real detections in a quiet environment.',
    spectrumDetail:   'Controls how many frequency bins are analyzed each frame. Low (1024) is easiest on the CPU and recommended for older or mobile devices. High (4096) gives the finest resolution but costs more.',
    whenDetected:     'Actions to take when a tone is detected. Notify sends a browser notification, Beep plays an audible alert, Tab title updates the page title, Flash blinks the display.',
    theme:            'Color scheme. Auto follows your system preference.',
};

document.addEventListener('DOMContentLoaded', () => {

    // ── Elements ─────────────────────────────────────

    const startStopBtn   = document.getElementById('start-stop-btn');
    const annoyTab       = document.getElementById('annoy-tab');
    const mosquitoTab    = document.getElementById('mosquito-tab');
    const customTab      = document.getElementById('custom-tab');
    const customBandRow  = document.getElementById('custom-band-row');
    const bandMinInput   = document.getElementById('band-min');
    const bandMaxInput   = document.getElementById('band-max');
    const statusIndicator = document.getElementById('status-indicator');
    const statusText     = document.getElementById('status-text');
    const statusSubtext  = document.getElementById('status-subtext');
    const sensTabs          = document.querySelectorAll('.sens-tab');
    const noiseFloorTabs    = document.querySelectorAll('.noise-floor-tab');
    const fftDetailTabs     = document.querySelectorAll('.fft-detail-tab');
    const notifyToggle   = document.getElementById('notify-toggle');
    const beepToggle     = document.getElementById('beep-toggle');
    const tabTitleToggle = document.getElementById('tab-title-toggle');
    const flashToggle    = document.getElementById('flash-toggle');
    const flashOverlay   = document.getElementById('flash-overlay');
    const timeTabs       = document.querySelectorAll('.time-tab');
    const themeTabs      = document.querySelectorAll('.theme-tab');
    const helpBtn        = document.getElementById('help-btn');
    const helpDialog     = document.getElementById('help-dialog');
    const helpClose      = document.getElementById('help-close');
    const optionsBtn     = document.getElementById('options-btn');
    const optionsDialog  = document.getElementById('options-dialog');
    const optionsClose   = document.getElementById('options-close');

    // ── State ────────────────────────────────────────

    let isRunning        = false;
    let mode             = 'annoy'; // 'annoy' | 'mosquito' | 'custom'
    let noiseFloorEnabled = true;
    let notifyEnabled    = false;
    let beepEnabled      = false;
    let tabTitleEnabled  = true;
    let flashEnabled     = false;

    const ORIGINAL_TITLE = document.title;

    // ── Options persistence ───────────────────────────

    function saveOptions() {
        const activeSens = [...sensTabs].find(t => t.classList.contains('active'));
        localStorage.setItem('opt_mode',    mode);
        localStorage.setItem('opt_bandMin', bandMinInput.value);
        localStorage.setItem('opt_bandMax', bandMaxInput.value);
        localStorage.setItem('opt_sens',    activeSens ? activeSens.dataset.value : 'med');
        localStorage.setItem('opt_noiseFloor',  String(noiseFloorEnabled));
        const activeFftDetail = [...fftDetailTabs].find(t => t.classList.contains('active'));
        localStorage.setItem('opt_fftDetail',   activeFftDetail ? activeFftDetail.dataset.value : 'high');
        localStorage.setItem('opt_beep',      String(beepEnabled));
        localStorage.setItem('opt_notify',    String(notifyEnabled));
        localStorage.setItem('opt_tabTitle',  String(tabTitleEnabled));
        localStorage.setItem('opt_flash',     String(flashEnabled));
    }

    function loadOptions() {
        const savedMode    = localStorage.getItem('opt_mode');
        const savedBandMin = localStorage.getItem('opt_bandMin');
        const savedBandMax = localStorage.getItem('opt_bandMax');
        const savedSens    = localStorage.getItem('opt_sens');
        const savedNoiseFloor  = localStorage.getItem('opt_noiseFloor');
        const savedFftDetail   = localStorage.getItem('opt_fftDetail');
        const savedBeep      = localStorage.getItem('opt_beep');
        const savedNotify    = localStorage.getItem('opt_notify');
        const savedTabTitle  = localStorage.getItem('opt_tabTitle');
        const savedFlash     = localStorage.getItem('opt_flash');

        if (savedBandMin) bandMinInput.value = savedBandMin;
        if (savedBandMax) bandMaxInput.value = savedBandMax;
        if (savedMode)    setMode(savedMode);

        if (savedSens && SENS_VALUES[savedSens] !== undefined) {
            sensTabs.forEach(t => t.classList.toggle('active', t.dataset.value === savedSens));
            audioAnalyzer.setSensitivity(SENS_VALUES[savedSens]);
        }

        if (savedNoiseFloor === 'false') {
            noiseFloorEnabled = false;
            audioAnalyzer.setNoiseFloor(false);
            noiseFloorTabs.forEach(t => t.classList.toggle('active', t.dataset.value === 'off'));
        }

        if (savedFftDetail && FFT_DETAIL_SIZES[savedFftDetail] !== undefined) {
            fftDetailTabs.forEach(t => t.classList.toggle('active', t.dataset.value === savedFftDetail));
            audioAnalyzer.setFftSize(FFT_DETAIL_SIZES[savedFftDetail]);
        }

        if (savedBeep === 'true') {
            beepEnabled = true;
            setToggle(beepToggle, true);
        }

        if (savedNotify === 'true' && 'Notification' in window && Notification.permission === 'granted') {
            notifyEnabled = true;
            setToggle(notifyToggle, true);
        }

        if (savedTabTitle === 'false') {
            tabTitleEnabled = false;
            setToggle(tabTitleToggle, false);
        }

        if (savedFlash === 'true') {
            flashEnabled = true;
            setToggle(flashToggle, true);
        }
    }

    const ANNOY_BAND     = { min: 14000, max: 20000 };
    const MOSQUITO_BAND  = { min: 16000, max: 18500 };

    // ── Theme ─────────────────────────────────────────

    let currentTheme = localStorage.getItem('theme') || 'auto';

    // if you're here from the 80s this app might run a little slow on your computer 
    if (new Date().getFullYear() >= 1980 && new Date().getFullYear() <= 1989) {
        currentTheme = '80s';
    }

    function applyTheme(theme) {
        currentTheme = theme;
        if (theme === 'auto') {
            document.documentElement.removeAttribute('data-theme');
        } else {
            document.documentElement.setAttribute('data-theme', theme);
        }
        themeTabs.forEach(t => t.classList.toggle('active', t.dataset.theme === theme));
        localStorage.setItem('theme', theme);
    }

    applyTheme(currentTheme);

    themeTabs.forEach(tab => {
        tab.addEventListener('click', () => applyTheme(tab.dataset.theme));
    });

    // ── Dialogs ───────────────────────────────────────

    function bindDialog(openBtn, dialog, closeBtn) {
        openBtn.addEventListener('click', () => dialog.showModal());
        closeBtn.addEventListener('click', () => dialog.close());
        dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });
    }

    bindDialog(optionsBtn, optionsDialog, optionsClose);
    bindDialog(helpBtn,    helpDialog,    helpClose);

    // ── Help tips — populate text and wire up mobile tap ─────────────────────

    // Populate any help-body element that references a TIPS key
    document.querySelectorAll('.help-body [data-tip-key]').forEach(el => {
        const key = el.dataset.tipKey;
        if (key && TIPS[key]) el.innerHTML = TIPS[key];
    });

    document.querySelectorAll('.help-tip').forEach(tip => {
        const key = tip.dataset.tipKey;
        if (key && TIPS[key]) {
            tip.querySelector('.help-tip-text').textContent = TIPS[key];
            tip.setAttribute('aria-label', tip.closest('.control-group-label')
                ?.firstChild?.textContent?.trim() + ' help');
        }
        tip.addEventListener('click', e => {
            e.stopPropagation();
            const isOpen = tip.classList.contains('open');
            document.querySelectorAll('.help-tip.open').forEach(t => t.classList.remove('open'));
            if (!isOpen) tip.classList.add('open');
        });
    });
    document.addEventListener('click', () => {
        document.querySelectorAll('.help-tip.open').forEach(t => t.classList.remove('open'));
    });

    // ── Start / Stop ──────────────────────────────────

    startStopBtn.addEventListener('click', async () => {
        if (!isRunning) {
            try {
                setStatus('idle', 'Starting…', '');
                await audioAnalyzer.start();
                audioAnalyzer.onDetectionChange = handleDetectionChange;
                isRunning = true;
                setStartBtn('■', 'Stop');
                startStopBtn.classList.add('running');
                setStatus('clear', 'OK', getSubtext());
            } catch (err) {
                setStatus('idle', 'READY', 'Microphone access denied');
                console.error(err);
            }
        } else {
            audioAnalyzer.stop();
            isRunning = false;
            setStartBtn('▶', 'Start');
            startStopBtn.classList.remove('running');
            setStatus('idle', 'READY', 'Press Start to begin listening');
            document.title = ORIGINAL_TITLE;
        }
    });

    // ── Mode switching ────────────────────────────────

    annoyTab.addEventListener('click',    () => setMode('annoy'));
    mosquitoTab.addEventListener('click', () => setMode('mosquito'));
    customTab.addEventListener('click',   () => setMode('custom'));

    function setMode(newMode) {
        mode = newMode;

        annoyTab.classList.toggle('active',    mode === 'annoy');
        mosquitoTab.classList.toggle('active', mode === 'mosquito');
        customTab.classList.toggle('active',   mode === 'custom');
        customBandRow.classList.toggle('hidden', mode !== 'custom');

        applyBand();
        saveOptions();

        if (isRunning) {
            setStatus(audioAnalyzer.detectionState === 'detected' ? 'detected' : 'clear',
                      audioAnalyzer.detectionState === 'detected' ? 'DETECTED' : 'OK',
                      getSubtext());
        }
    }

    // ── Custom band inputs ────────────────────────────

    [bandMinInput, bandMaxInput].forEach(input => {
        input.addEventListener('change', applyBand);
        input.addEventListener('input',  applyBand);
    });

    function applyBand() {
        if (mode === 'annoy') {
            audioAnalyzer.setBand(ANNOY_BAND.min, ANNOY_BAND.max);
        } else if (mode === 'mosquito') {
            audioAnalyzer.setBand(MOSQUITO_BAND.min, MOSQUITO_BAND.max);
        } else {
            const min = parseInt(bandMinInput.value, 10) || 16000;
            const max = parseInt(bandMaxInput.value, 10) || 18500;
            audioAnalyzer.setBand(min, max);
        }
    }

    applyBand();

    // ── Sensitivity tabs ──────────────────────────────

    const SENS_VALUES       = { low: 20, med: 60, high: 85 };
    const FFT_DETAIL_SIZES  = { low: 1024, med: 2048, high: 4096 };

    sensTabs.forEach(btn => {
        btn.addEventListener('click', () => {
            sensTabs.forEach(t => t.classList.remove('active'));
            btn.classList.add('active');
            audioAnalyzer.setSensitivity(SENS_VALUES[btn.dataset.value]);
            saveOptions();
        });
    });

    // Default sensitivity before loadOptions may override it
    audioAnalyzer.setSensitivity(SENS_VALUES.med);

    // ── Notification / Beep toggles ───────────────────

    notifyToggle.addEventListener('click', () => {
        if (!notifyEnabled) {
            // request permission first
            if ('Notification' in window && Notification.permission === 'default') {
                Notification.requestPermission().then(perm => {
                    if (perm === 'granted') {
                        notifyEnabled = true;
                        setToggle(notifyToggle, true);
                        saveOptions();
                    }
                });
            } else if ('Notification' in window && Notification.permission === 'granted') {
                notifyEnabled = true;
                setToggle(notifyToggle, true);
                saveOptions();
            } else {
                // permission denied or not supported — still let them toggle (silent)
                notifyEnabled = true;
                setToggle(notifyToggle, true);
                saveOptions();
            }
        } else {
            notifyEnabled = false;
            setToggle(notifyToggle, false);
            saveOptions();
        }
    });

    noiseFloorTabs.forEach(btn => {
        btn.addEventListener('click', () => {
            noiseFloorEnabled = btn.dataset.value === 'on';
            noiseFloorTabs.forEach(t => t.classList.toggle('active', t === btn));
            audioAnalyzer.setNoiseFloor(noiseFloorEnabled);
            saveOptions();
        });
    });

    fftDetailTabs.forEach(btn => {
        btn.addEventListener('click', () => {
            fftDetailTabs.forEach(t => t.classList.remove('active'));
            btn.classList.add('active');
            audioAnalyzer.setFftSize(FFT_DETAIL_SIZES[btn.dataset.value]);
            saveOptions();
        });
    });

    beepToggle.addEventListener('click', () => {
        beepEnabled = !beepEnabled;
        setToggle(beepToggle, beepEnabled);
        saveOptions();
    });

    tabTitleToggle.addEventListener('click', () => {
        tabTitleEnabled = !tabTitleEnabled;
        setToggle(tabTitleToggle, tabTitleEnabled);
        if (!tabTitleEnabled) document.title = ORIGINAL_TITLE;
        saveOptions();
    });

    flashToggle.addEventListener('click', () => {
        flashEnabled = !flashEnabled;
        setToggle(flashToggle, flashEnabled);
        saveOptions();
    });

    function setToggle(btn, active) {
        btn.dataset.active = String(active);
    }

    function setStartBtn(icon, label) {
        startStopBtn.querySelector('.start-icon').textContent = icon;
        startStopBtn.querySelector('.start-label').textContent = label;
    }

    // ── Time window tabs ──────────────────────────────

    timeTabs.forEach(btn => {
        btn.addEventListener('click', () => {
            timeTabs.forEach(t => t.classList.remove('active'));
            btn.classList.add('active');
            audioAnalyzer.setHistoryWindow(parseInt(btn.dataset.minutes, 10));
        });
    });

    // ── Detection callback ────────────────────────────

    function handleDetectionChange(state) {
        if (state === 'detected') {
            setStatus('detected', 'DETECTED', getSubtext());
            if (notifyEnabled)   sendNotification();
            if (beepEnabled)     playBeep();
            if (tabTitleEnabled) document.title = '\u26a0 DETECTED \u2013 BuzzOff';
            if (flashEnabled)    triggerFlash();
        } else {
            setStatus('clear', 'OK', getSubtext());
            if (tabTitleEnabled) document.title = ORIGINAL_TITLE;
        }
    }

    // ── Status helpers ────────────────────────────────

    function setStatus(cssState, text, sub) {
        statusIndicator.className = `status-indicator status-${cssState}`;
        statusText.textContent    = text;
        statusSubtext.textContent = sub;
    }

    function getSubtext() {
        if (!isRunning) return '';
        let band;
        if (mode === 'annoy')         band = `${ANNOY_BAND.min / 1000}–${ANNOY_BAND.max / 1000} kHz`;
        else if (mode === 'mosquito') band = `${MOSQUITO_BAND.min / 1000}–${MOSQUITO_BAND.max / 1000} kHz`;
        else                          band = `${bandMinInput.value}–${bandMaxInput.value} Hz`;
        return `Monitoring ${band}`;
    }

    // ── Alert helpers ─────────────────────────────────

    function sendNotification() {
        if (!('Notification' in window)) return;
        if (Notification.permission !== 'granted') return;
        new Notification('BuzzOff', {
            body: 'Mosquito tone detected!',
            icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="50" fill="%23f85149"/></svg>'
        });
    }

    function triggerFlash() {
        flashOverlay.classList.remove('flash');
        void flashOverlay.offsetWidth; // force reflow to restart animation
        flashOverlay.classList.add('flash');
    }

    function playBeep() {
        try {
            const ctx  = new (window.AudioContext || window.webkitAudioContext)();
            const osc  = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.frequency.value = 880;
            gain.gain.setValueAtTime(0.25, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.4);
            osc.onended = () => ctx.close();
        } catch (e) {
            console.warn('Beep failed', e);
        }
    }

    // ── Visibility change — sync title when tab is foregrounded ──────

    document.addEventListener('visibilitychange', () => {
        if (document.hidden || !isRunning) return;
        // Force a fresh detection tick, then sync the title
        audioAnalyzer._tick();
        if (tabTitleEnabled) {
            document.title = audioAnalyzer.detectionState === 'detected'
                ? '\u26a0 DETECTED \u2013 BuzzOff'
                : ORIGINAL_TITLE;
        }
    });

    // ── Restore saved options ─────────────────────────

    loadOptions();

    // ── Resize handling ───────────────────────────────

    const resizeObserver = new ResizeObserver(() => {
        if (isRunning) audioAnalyzer.resizeCanvases();
    });
    resizeObserver.observe(document.getElementById('fft-canvas'));
    resizeObserver.observe(document.getElementById('history-canvas'));

    // ── History tooltip ───────────────────────────────

    const histCanvas = document.getElementById('history-canvas');
    const tooltip    = document.getElementById('history-tooltip');

    // Convert a performance.now() timestamp to a wall-clock Date
    function tsToDate(ts) {
        return new Date(Date.now() - (performance.now() - ts));
    }

    function formatClock(date) {
        return date.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }

    function showTooltip(clientX, clientY) {
        const history = audioAnalyzer.history;
        if (!history.length) { tooltip.style.display = 'none'; return; }

        const rect           = histCanvas.getBoundingClientRect();
        const xInCanvas      = clientX - rect.left;
        const windowSeconds  = audioAnalyzer.historyWindowMinutes * 60;
        const visibleEntries = Math.min(history.length, windowSeconds);
        const colW           = rect.width / windowSeconds;
        const col            = Math.floor(xInCanvas / colW);
        const entryOffset    = col - (windowSeconds - visibleEntries);

        if (entryOffset < 0 || entryOffset >= visibleEntries) {
            tooltip.style.display = 'none';
            return;
        }

        const startIdx = history.length - visibleEntries;
        const entryIdx = startIdx + entryOffset;
        const entry    = history[entryIdx];
        const secondsAgo = Math.round((performance.now() - entry.ts) / 1000);
        const agoLabel   = secondsAgo < 60
            ? `${secondsAgo}s ago`
            : `${Math.floor(secondsAgo / 60)}m ${secondsAgo % 60}s ago`;

        if (!entry.detected) {
            tooltip.style.display = 'none';
            return;
        }

        // Expand to the full contiguous detection run containing this entry
        let runStart = entryIdx;
        let runEnd   = entryIdx;
        while (runStart > 0                  && history[runStart - 1].detected) runStart--;
        while (runEnd   < history.length - 1 && history[runEnd   + 1].detected) runEnd++;

        const startClock = formatClock(tsToDate(history[runStart].ts));
        const isOngoing  = runEnd === history.length - 1 && audioAnalyzer.detectionState === 'detected';
        const endClock   = isOngoing ? 'now' : formatClock(tsToDate(history[runEnd].ts));

        tooltip.innerHTML = `<strong>⚠ Detected</strong> ${agoLabel}<br><span class="tip-time">${startClock} – ${endClock}</span>`;
        tooltip.style.display = 'block';

        const TIP_W = tooltip.offsetWidth;
        const left  = (clientX + 12 + TIP_W > window.innerWidth) ? clientX - TIP_W - 8 : clientX + 12;
        tooltip.style.left = `${left}px`;
        tooltip.style.top  = `${Math.max(4, clientY - 36)}px`;
    }

    histCanvas.addEventListener('mousemove',  e => showTooltip(e.clientX, e.clientY));
    histCanvas.addEventListener('mouseleave', () => { tooltip.style.display = 'none'; });

    histCanvas.addEventListener('touchstart', e => {
        e.preventDefault();
        showTooltip(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: false });
    histCanvas.addEventListener('touchmove', e => {
        e.preventDefault();
        showTooltip(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: false });
    histCanvas.addEventListener('touchend', () => { tooltip.style.display = 'none'; });

});
