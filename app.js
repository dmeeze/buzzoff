// BuzzOff — App controller

// ── Control help text (single source of truth for tooltips) ──────────────────
const TIPS = {
    frequencyBand:    'The range of frequencies to listen for. Annoy covers common deterrent tones, Mosquito targets anti-loitering teen-deterrent tones, or set a Custom range.',
    sensitivity:      'How strong a signal must be to trigger detection. Low = fewer false positives. High = catches weaker tones.',
    filterWhiteNoise: 'Ignores broadband noise (<a href="https://en.wikipedia.org/wiki/White_noise" target="_blank" rel="noopener">white noise</a>, fans, fabric rustling) so only distinct, narrow-band tones trigger an alert. Turn off if you\'re missing real detections in a quiet environment.',
    spectrumDetail:   'Controls how many frequency bins are analyzed each frame. Low (1024) is easiest on the CPU and recommended for older or mobile devices. Med (2048) is a balanced middle ground. High (4096) gives the finest resolution but costs more.',
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
    const statusIndicator    = document.getElementById('status-indicator');
    const statusText         = document.getElementById('status-text');
    const statusSubtext      = document.getElementById('status-subtext');
    const sensTabs          = document.querySelectorAll('.sens-tab');
    const noiseFloorTabs    = document.querySelectorAll('.noise-floor-tab');
    const fftDetailTabs     = document.querySelectorAll('.fft-detail-tab');
    const notifyToggle   = document.getElementById('notify-toggle');
    const beepToggle     = document.getElementById('beep-toggle');
    const tabTitleToggle = document.getElementById('tab-title-toggle');
    const flashToggle    = document.getElementById('flash-toggle');
    const flashOverlay   = document.getElementById('flash-overlay');
    const eventLog       = document.getElementById('event-log');
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

    const sampleRateInfoDialog = document.getElementById('sample-rate-info-dialog');
    const sampleRateInfoClose  = document.getElementById('sample-rate-info-close');
    sampleRateInfoClose.addEventListener('click', () => sampleRateInfoDialog.close());
    sampleRateInfoDialog.addEventListener('click', e => { if (e.target === sampleRateInfoDialog) sampleRateInfoDialog.close(); });


    // ── Help tips — populate text and wire up mobile tap ─────────────────────

    // Populate any help-body element that references a TIPS key
    document.querySelectorAll('.help-body [data-tip-key]').forEach(el => {
        const key = el.dataset.tipKey;
        if (key && TIPS[key]) el.innerHTML = TIPS[key];
    });

    document.querySelectorAll('.help-tip').forEach(tip => {
        const key = tip.dataset.tipKey;
        if (key && TIPS[key]) {
            tip.querySelector('.help-tip-text').innerHTML = TIPS[key];
            tip.setAttribute('aria-label', tip.closest('.control-group-label')
                ?.firstChild?.textContent?.trim() + ' help');
        }
        tip.addEventListener('click', e => {
            e.stopPropagation();
            const isOpen = tip.classList.contains('open');
            document.querySelectorAll('.help-tip.open').forEach(t => t.classList.remove('open'));
            if (!isOpen) {
                tip.classList.add('open');
                const tipText = tip.querySelector('.help-tip-text');
                const rect = tip.getBoundingClientRect();
                const tipWidth = 200;
                let left = rect.left + rect.width / 2 - tipWidth / 2;
                left = Math.max(8, Math.min(left, window.innerWidth - tipWidth - 8));
                tipText.style.left = left + 'px';
                tipText.style.top = (rect.top - 6) + 'px';
                tipText.style.transform = 'translateY(-100%)';
            }
        });
    });
    document.addEventListener('click', e => {
        if (!e.target.closest('.help-tip-text')) {
            document.querySelectorAll('.help-tip.open').forEach(t => t.classList.remove('open'));
        }
    });

    // ── Start / Stop ──────────────────────────────────

    startStopBtn.addEventListener('click', async () => {
        if (!isRunning) {
            startStopBtn.disabled = true;
            try {
                setStatus('idle', 'Starting…', '');
                await audioAnalyzer.start();
                audioAnalyzer.onDetectionChange = handleDetectionChange;
                isRunning = true;
                setStartBtn('■', 'Stop');
                startStopBtn.classList.add('running');
                setStatus('clear', 'OK', getSubtext());
                updateSampleRateWarning();
                appendLogEntry('Started monitoring', 'log-start');
            } catch (err) {
                setStatus('idle', 'READY', 'Microphone access denied');
                console.error(err);
            } finally {
                startStopBtn.disabled = false;
            }
        } else {
            appendLogEntry('Stopped monitoring', 'log-stop');
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
        updateSampleRateWarning();
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

    // ── Event log ─────────────────────────────────────

    function appendLogEntry(message, cssClass) {
        const emptyEl = eventLog.querySelector('.event-log-empty');
        if (emptyEl) emptyEl.remove();

        const now = new Date();
        const time = now.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });

        const entry = document.createElement('div');
        entry.className = `event-log-entry${cssClass ? ' ' + cssClass : ''}`;
        entry.innerHTML = `<span class="log-time">${time}</span><span>${message}</span>`;
        eventLog.appendChild(entry);
        eventLog.scrollTop = eventLog.scrollHeight;
    }

    // Show placeholder until first event
    const placeholder = document.createElement('div');
    placeholder.className = 'event-log-empty';
    placeholder.textContent = 'No events yet';
    eventLog.appendChild(placeholder);

    // ── Detection callback ────────────────────────────

    function handleDetectionChange(state) {
        if (state === 'detected') {
            setStatus('detected', 'DETECTED', getSubtext());
            appendLogEntry('Sound detected', 'log-detected');
            if (notifyEnabled)   sendNotification();
            if (beepEnabled)     playBeep();
            if (tabTitleEnabled) document.title = '\u26a0 DETECTED \u2013 BuzzOff';
            if (flashEnabled)    triggerFlash();
        } else {
            setStatus('clear', 'OK', getSubtext());
            appendLogEntry('Sound stopped', 'log-cleared');
            if (tabTitleEnabled) document.title = ORIGINAL_TITLE;
        }
    }

    // ── Status helpers ────────────────────────────────

    function updateSampleRateWarning() {
        if (!isRunning || !audioAnalyzer.audioContext) return;
        const nyquist = audioAnalyzer.audioContext.sampleRate / 2;
        const bandMax = audioAnalyzer.band.max;
        if (nyquist < bandMax) {
            const sr     = (audioAnalyzer.audioContext.sampleRate / 1000).toFixed(0);
            const maxKhz = (nyquist / 1000).toFixed(0);
            const bandKhz = (bandMax / 1000).toFixed(0);
            document.getElementById('sample-rate-info-detail').textContent =
                `Your browser is capturing audio at ${sr} kHz, which means that frequencies above ${maxKhz} kHz — including your selected band up to ${bandKhz} kHz — cannot be detected.`;
                statusSubtext.innerHTML =
                `<span class="subtext-warn"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" aria-hidden="true" style="width:1em;height:1em;vertical-align:-0.125em;fill:currentColor"><path d="M256 32c14.2 0 27.3 7.5 34.5 19.8l216 368c7.3 12.4 7.3 27.7 .2 40.1S486.3 480 472 480L40 480c-14.3 0-27.6-7.2-35.2-19c-7.6-11.8-8-26.5-.8-38.8l216-368C227.5 39.5 241.8 32 256 32zm0 128c-13.3 0-24 10.7-24 24l0 112c0 13.3 10.7 24 24 24s24-10.7 24-24l0-112c0-13.3-10.7-24-24-24zm32 224a32 32 0 1 0 -64 0 32 32 0 1 0 64 0z"/></svg> Reduced accuracy — sample rate too low. <button class="warn-more-btn">learn more</button></span>`;
            statusSubtext.querySelector('.warn-more-btn')
                .addEventListener('click', () => sampleRateInfoDialog.showModal());
        }
    }

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

});
