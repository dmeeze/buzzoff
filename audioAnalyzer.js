// BuzzOff — Audio Analyzer
const audioAnalyzer = {

    // Web Audio
    audioContext: null,
    analyser: null,
    stream: null,
    microphone: null,
    dataArray: null,
    bufferLength: null,
    animationId: null,
    sampleIntervalId: null,

    // Canvases
    fftCanvas: null,
    fftCtx: null,
    historyCanvas: null,
    historyCtx: null,


    // Band config
    band: { min: 14000, max: 20000 },
    fftSize: 4096,

    // Detection
    threshold: 54,              // 0-255 raw FFT amplitude
    consecutiveSeconds: 0,      // seconds in a row above threshold
    detectionState: 'idle',     // 'idle' | 'clear' | 'detected'
    noiseFloor: true,           // require spectral spike, not just broadband noise
    noiseFloorRatio: 1.5,       // in-band max must be this × out-of-band avg

    // History: one entry per second, max 1800 (30 min)
    history: [],
    historyWindowMinutes: 15,

    // Timing
    lastSampleTime: 0,

    // Adaptive rendering
    _renderInterval: 0,     // ms between renders; 0 = every rAF frame
    _lastRenderTime: 0,
    _frameTimes: [],        // rolling window of recent frame durations

    // Callbacks
    onDetectionChange: null,    // fn(state) — 'clear' | 'detected'

    // ── Theme helpers ───────────────────────────────────

    get _theme() {
        const t = document.documentElement.dataset.theme;
        if (t === 'dark' || t === 'light' || t === '80s') return t;
        return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    },
    get _isDark() { return this._theme !== 'light'; },
    _bg() {
        switch (this._theme) {
            case 'light': return '#f5f7fa';
            case '80s':   return '#08001a';
            default:      return '#161b22';
        }
    },
    // Returns the canvas background as [r, g, b] for pre-mixing
    _bgRgb() {
        switch (this._theme) {
            case 'light': return [245, 247, 250];
            case '80s':   return [8, 0, 26];
            default:      return [22, 27, 34];
        }
    },
    // Alpha-composite [r,g,b] at `alpha` over the canvas background — returns solid rgb() string
    _mix(r, g, b, alpha) {
        const [br, bg, bb] = this._bgRgb();
        const ri = Math.round(alpha * r + (1 - alpha) * br);
        const gi = Math.round(alpha * g + (1 - alpha) * bg);
        const bi = Math.round(alpha * b + (1 - alpha) * bb);
        return `rgb(${ri},${gi},${bi})`;
    },
    _a(alpha) {
        switch (this._theme) {
            case 'light': return this._mix(0, 0, 0, alpha);
            case '80s':   return this._mix(230, 180, 255, alpha);
            default:      return this._mix(255, 255, 255, alpha);
        }
    },
    _oobBar(v) {
        const pct = v / 255;
        switch (this._theme) {
            case 'light': return `hsl(210,80%,${50 - pct * 25}%)`;
            case '80s':   return `hsl(270,90%,${28 + pct * 42}%)`;
            default:      return `hsl(210,100%,${30 + pct * 55}%)`;
        }
    },
    _subThreshBar(t) {
        switch (this._theme) {
            case 'light': return this._mix(30, 100, 200, t * 0.35);
            case '80s':   return this._mix(160, 0, 255, t * 0.72);
            default:      return this._mix(88, 166, 255, t * 0.25);
        }
    },
    _inBandBar(t) {
        switch (this._theme) {
            case '80s': return `hsl(${300 - t * 60}, 100%, ${55 + t * 30}%)`;
            default:    return `hsl(${5 + t * 25}, 100%, ${55 + t * 40}%)`;
        }
    },
    _detectedBar(t) {
        switch (this._theme) {
            case '80s': return `hsl(320, 100%, ${42 + t * 42}%)`;
            default:    return `hsl(4, 85%, ${28 + t * 42}%)`;
        }
    },
    _bandColor(alpha = 1) {
        switch (this._theme) {
            case '80s': return this._mix(0, 229, 255, alpha);
            default:    return this._mix(248, 81, 73, alpha);
        }
    },
    _threshColor() {
        switch (this._theme) {
            case '80s': return this._mix(255, 0, 144, 0.7);
            default:    return this._mix(248, 81, 73, 0.6);
        }
    },

    // ── Lifecycle ──────────────────────────────────────

    async start() {
        this.fftCanvas     = document.getElementById('fft-canvas');
        this.fftCtx        = this._initCanvas(this.fftCanvas);
        this.historyCanvas = document.getElementById('history-canvas');
        this.historyCtx    = this._initCanvas(this.historyCanvas);

        this.stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                autoGainControl: false,
                noiseSuppression: false,
                echoCancellation: false
            },
            video: false
        });

        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        this.analyser     = this.audioContext.createAnalyser();
        this.analyser.fftSize = this.fftSize;
        this.bufferLength = this.analyser.frequencyBinCount;
        this.dataArray    = new Uint8Array(this.bufferLength);

        this.microphone = this.audioContext.createMediaStreamSource(this.stream);
        this.microphone.connect(this.analyser);

        this.history            = [];
        this.consecutiveSeconds = 0;
        this.detectionState     = 'clear';
        this.lastSampleTime     = performance.now();
        this._renderInterval    = 0;
        this._lastRenderTime    = 0;
        this._frameTimes        = [];

        this._draw();
        this.sampleIntervalId = setInterval(() => this._tick(), 1000);
    },

    stop() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
        if (this.sampleIntervalId) {
            clearInterval(this.sampleIntervalId);
            this.sampleIntervalId = null;
        }
        if (this.microphone) {
            this.microphone.disconnect();
            this.microphone = null;
        }
        if (this.stream) {
            this.stream.getTracks().forEach(t => t.stop());
            this.stream = null;
        }
        if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = null;
        }
        this.detectionState = 'idle';

        const clearCanvas = (canvas, ctx) => {
            if (ctx) {
                const dpr = window.devicePixelRatio || 1;
                const w = canvas.width / dpr;
                const h = canvas.height / dpr;
                ctx.fillStyle = this._bg();
                ctx.fillRect(0, 0, w, h);
            }
        };
        clearCanvas(this.fftCanvas, this.fftCtx);
        clearCanvas(this.historyCanvas, this.historyCtx);
    },

    // ── Config setters ─────────────────────────────────

    setBand(min, max) {
        this.band = { min: Math.min(min, max), max: Math.max(min, max) };
    },

    // sliderValue 1-100: higher = more sensitive = lower threshold
    setSensitivity(sliderValue) {
        // maps 1→120 (insensitive), 100→10 (very sensitive)
        this.threshold = Math.round(120 - (sliderValue / 100) * 110);
    },

    setHistoryWindow(minutes) {
        this.historyWindowMinutes = minutes;
    },

    setNoiseFloor(enabled) {
        this.noiseFloor = enabled;
    },

    setFftSize(size) {
        this.fftSize = size;
        if (this.analyser) {
            this.analyser.fftSize = size;
            this.bufferLength = this.analyser.frequencyBinCount;
            this.dataArray = new Uint8Array(this.bufferLength);
        }
    },

    // ── Canvas init ────────────────────────────────────

    _initCanvas(canvas) {
        const dpr  = window.devicePixelRatio || 1;
        const parent = canvas.parentElement;
        const rect = canvas.getBoundingClientRect();
        const parentClientW = parent ? parent.clientWidth : 0;
        const w = parentClientW || rect.width || 300;
        const h = rect.height || canvas.offsetHeight || 200;
        canvas.width  = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
        const ctx = canvas.getContext('2d');
        ctx.scale(dpr, dpr);
        return ctx;
    },

    resizeCanvases() {
        if (!this.fftCanvas) return;
        this.fftCtx     = this._initCanvas(this.fftCanvas);
        this.historyCtx = this._initCanvas(this.historyCanvas);
    },

    // ── Core loop ──────────────────────────────────────

    // Detection tick — runs via setInterval so it continues in background tabs
    _tick() {
        this.analyser.getByteFrequencyData(this.dataArray);
        this._sample(performance.now());
    },

    // Render loop — rAF, pauses in background tabs (fine, nobody's watching).
    // Tracks actual frame times and throttles render rate when device is slow.
    _draw() {
        this.animationId = requestAnimationFrame(() => this._draw());

        const now = performance.now();

        // Skip this frame if we're throttling and not enough time has elapsed
        if (this._renderInterval > 0 && now - this._lastRenderTime < this._renderInterval) return;

        // Measure frame gap and adapt throttle every 20 rendered frames
        if (this._lastRenderTime > 0) {
            this._frameTimes.push(now - this._lastRenderTime);
            if (this._frameTimes.length > 20) this._frameTimes.shift();
            if (this._frameTimes.length === 20) {
                const avg = this._frameTimes.reduce((a, b) => a + b, 0) / 20;
                if      (avg > 60) this._renderInterval = 67;   // < ~17fps → target 15fps
                else if (avg > 40) this._renderInterval = 50;   // < ~25fps → target 20fps
                else if (avg > 25) this._renderInterval = 33;   // < ~40fps → target 30fps
                else               this._renderInterval = 0;    // fast enough → native rate
            }
        }
        this._lastRenderTime = now;

        this.analyser.getByteFrequencyData(this.dataArray);
        this._drawFFT();
        this._drawHistory();
    },

    _sample(now) {
        const intensity = this._getBandIntensity();
        const aboveThreshold = intensity > this.threshold;

        let passesNoiseFloor = true;
        if (this.noiseFloor && aboveThreshold) {
            passesNoiseFloor = this._getSpectralContrast() >= this.noiseFloorRatio;
        }

        if (aboveThreshold && passesNoiseFloor) {
            this.consecutiveSeconds++;
        } else {
            this.consecutiveSeconds = 0;
        }

        const detected = this.consecutiveSeconds >= 1;
        const newState = detected ? 'detected' : 'clear';

        if (newState !== this.detectionState) {
            this.detectionState = newState;
            if (this.onDetectionChange) this.onDetectionChange(newState);
        }

        this.history.push({ ts: now, intensity, detected });
        if (this.history.length > 1800) this.history.shift();
    },

    _getBandBins() {
        const nyquist = this.audioContext.sampleRate / 2;
        return {
            startBin: Math.max(1, Math.floor(this.band.min * this.bufferLength / nyquist)),
            endBin:   Math.min(this.bufferLength - 1, Math.ceil(this.band.max * this.bufferLength / nyquist)),
        };
    },

    _getBandIntensity() {
        const { startBin, endBin } = this._getBandBins();
        let max = 0;
        for (let i = startBin; i <= endBin; i++) {
            if (this.dataArray[i] > max) max = this.dataArray[i];
        }
        return max;
    },

    // Ratio of in-band max to average of neighboring out-of-band bins.
    // A broadband noise event produces a ratio near 1; a real spike >> 1.
    _getSpectralContrast() {
        const { startBin, endBin } = this._getBandBins();
        const bandWidth = endBin - startBin;

        let inBandMax = 0;
        for (let i = startBin; i <= endBin; i++) {
            if (this.dataArray[i] > inBandMax) inBandMax = this.dataArray[i];
        }

        // Reference: equal-width neighbor windows on each side
        const loBinStart = Math.max(1, startBin - bandWidth);
        const hiBinEnd   = Math.min(this.bufferLength - 1, endBin + bandWidth);

        let refSum = 0, refCount = 0;
        for (let i = loBinStart; i < startBin; i++) { refSum += this.dataArray[i]; refCount++; }
        for (let i = endBin + 1; i <= hiBinEnd; i++) { refSum += this.dataArray[i]; refCount++; }

        if (refCount === 0) return Infinity;   // no reference bins — always pass
        const refAvg = refSum / refCount;
        if (refAvg < 4) return Infinity;       // near silence — don't suppress
        return inBandMax / refAvg;
    },

    // ── FFT drawing ────────────────────────────────────

    _drawFFT() {
        const canvas = this.fftCanvas;
        const ctx    = this.fftCtx;
        const dpr = window.devicePixelRatio || 1;
        const W = canvas.width / dpr;
        const H = canvas.height / dpr;

        ctx.fillStyle = this._bg();
        ctx.fillRect(0, 0, W, H);

        const nyquist      = this.audioContext.sampleRate / 2;
        const displayMin   = 0;
        const displayMax   = 22000;
        const displayRange = displayMax - displayMin;

        const bx1 = Math.max(0, ((this.band.min - displayMin) / displayRange) * W);
        const bx2 = Math.min(W, ((this.band.max - displayMin) / displayRange) * W);

        // FFT bars
        const startBin = 1; // skip DC
        const endBin   = Math.min(this.bufferLength - 1, Math.ceil(Math.min(displayMax, nyquist) * this.bufferLength / nyquist));

        for (let i = startBin; i <= endBin; i++) {
            const value = this.dataArray[i];
            if (value === 0) continue;

            const freq      = (i / this.bufferLength) * nyquist;
            const x         = ((freq - displayMin) / displayRange) * W;
            const barHeight = (value / 255) * (H - 18);
            const inBand    = freq >= this.band.min && freq <= this.band.max;

            if (inBand) {
                const t = value / 255;
                ctx.fillStyle = this._inBandBar(t);
            } else {
                ctx.fillStyle = this._oobBar(value);
            }

            const barW = Math.max(1, (W / (endBin - startBin)));
            ctx.fillRect(x, H - 18 - barHeight, barW, barHeight);
        }

        // Threshold line (inside band area only)
        const threshY = H - 18 - (this.threshold / 255) * (H - 18);
        ctx.strokeStyle = this._threshColor();
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 4]);
        ctx.beginPath();
        ctx.moveTo(bx1, threshY);
        ctx.lineTo(bx2, threshY);
        ctx.stroke();
        ctx.setLineDash([]);

        // Axis baseline
        ctx.strokeStyle = this._a(0.15);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, H - 18); ctx.lineTo(W, H - 18);
        ctx.stroke();

        // Nyquist boundary — vertical amber line when sample rate < 44kHz
        if (nyquist < displayMax) {
            const nx = (nyquist / displayRange) * W;
            ctx.strokeStyle = 'rgba(210,140,0,0.7)';
            ctx.lineWidth = 1;
            ctx.setLineDash([3, 3]);
            ctx.beginPath();
            ctx.moveTo(nx, 0); ctx.lineTo(nx, H - 18);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.font = '10px monospace';
            const nyqLabel = `${(nyquist / 1000).toFixed(0)}k max`;
            const nyqLabelW = ctx.measureText(nyqLabel).width;
            ctx.fillStyle = 'rgba(210,140,0,0.85)';
            ctx.fillText(nyqLabel, Math.min(W - nyqLabelW - 2, Math.max(2, nx - nyqLabelW - 3)), 10);
        }

        // Frequency labels — ticks across full range
        ctx.font = '10px monospace';
        const ticks = [2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22];
        ticks.forEach(khz => {
            const f = khz * 1000;
            const x = ((f - displayMin) / displayRange) * W;
            const nearBand = Math.abs(x - bx1) < 18 || Math.abs(x - bx2) < 18;
            if (nearBand) return;

            ctx.strokeStyle = f > nyquist ? this._a(0.07) : this._a(0.15);
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(x, H - 18); ctx.lineTo(x, H - 14);
            ctx.stroke();

            const label = `${khz}k`;
            const labelW = ctx.measureText(label).width;
            ctx.fillStyle = f > nyquist ? this._a(0.2) : this._a(0.55);
            ctx.fillText(label, Math.min(W - labelW - 2, Math.max(2, x - labelW / 2)), H - 4);
        });

        // Band axis markers — colored segment + tick + label
        ctx.strokeStyle = this._bandColor(0.9);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(bx1, H - 18); ctx.lineTo(bx2, H - 18);
        ctx.stroke();

        [[bx1, this.band.min], [bx2, this.band.max]].forEach(([x, freq]) => {
            // Tick
            ctx.strokeStyle = this._bandColor(0.9);
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(x, H - 22); ctx.lineTo(x, H - 14);
            ctx.stroke();

            // Label
            const label = `${(freq / 1000).toFixed(1)}k`;
            const labelW = ctx.measureText(label).width;
            ctx.fillStyle = this._bandColor(1);
            ctx.font = 'bold 10px monospace';
            ctx.fillText(label, Math.min(W - labelW - 2, Math.max(2, x - labelW / 2)), H - 4);
            ctx.font = '10px monospace';
        });

        // Band label (top of chart)
        const midX = (bx1 + bx2) / 2;
        const bandLabel = `${(this.band.min / 1000).toFixed(1)}–${(this.band.max / 1000).toFixed(1)} kHz`;
        ctx.fillStyle = this._bandColor(0.9);
        ctx.font = 'bold 10px monospace';
        const lw = ctx.measureText(bandLabel).width;
        ctx.fillText(bandLabel, Math.max(bx1 + 2, midX - lw / 2), 12);
    },

    // ── History drawing ────────────────────────────────

    _drawHistory() {
        const canvas = this.historyCanvas;
        const ctx    = this.historyCtx;
        const dpr = window.devicePixelRatio || 1;
        const W = canvas.width / dpr;
        const H = canvas.height / dpr;

        ctx.fillStyle = this._bg();
        ctx.fillRect(0, 0, W, H);

        const windowSeconds  = this.historyWindowMinutes * 60;
        const visibleEntries = Math.min(this.history.length, windowSeconds);
        if (visibleEntries === 0) {
            ctx.fillStyle = this._a(0.45);
            ctx.font = '11px monospace';
            ctx.fillText('No data yet', W / 2 - 36, H / 2 + 4);
            return;
        }

        const startIdx   = this.history.length - visibleEntries;
        const colW       = W / windowSeconds;

        for (let i = 0; i < visibleEntries; i++) {
            const entry = this.history[startIdx + i];
            const x     = (windowSeconds - visibleEntries + i) * colW;
            const t     = entry.intensity / 255;

            let color;
            if (entry.detected) {
                color = this._detectedBar(t);
            } else if (t > 0.05) {
                color = this._subThreshBar(t);
            } else {
                color = this._bg();
            }

            ctx.fillStyle = color;
            ctx.fillRect(x, 0, colW + 1, H - 14);
        }

        // "now" edge marker
        ctx.strokeStyle = this._a(0.35);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(W - 0.5, 0);
        ctx.lineTo(W - 0.5, H - 14);
        ctx.stroke();

        // Time labels
        ctx.fillStyle = this._a(0.60);
        ctx.font = '9px monospace';

        const labelCount = 5;
        for (let i = 0; i <= labelCount; i++) {
            const secondsAgo = Math.round((windowSeconds / labelCount) * (labelCount - i));
            const x = (i / labelCount) * W;
            const label = secondsAgo === 0 ? 'now' : `-${Math.round(secondsAgo / 60)}m`;
            ctx.fillText(label, i === labelCount ? x - ctx.measureText(label).width - 2 : x + 2, H - 3);
        }
    }
};

window.audioAnalyzer = audioAnalyzer;
