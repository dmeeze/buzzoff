# BuzzOff — High-Frequency Tone Detector

Detects ultrasonic annoyance tones and anti-loitering "mosquito" tones via browser microphone + Web Audio API FFT. Single-file app — no build step.

## Status: working

## Detection bands

| Mode | Range | Use |
|------|-------|-----|
| **Annoy** (default) | 14–20 kHz | YouTube/video ultrasonic harassment tones |
| **Mosquito** | 16–18.5 kHz | Anti-loitering tones, inaudible to most adults |
| **Custom** | user-defined | Any frequency range |

## UI

- **Status pill** — OK (green) / DETECTED (red, pulsing)
- **Detection History** — scrolling intensity timeline (5 / 15 / 30 min window); hover or touch a red detection segment to see its clock time range. Hidden automatically on short viewports (landscape phones) to give the spectrum more room.
- **Live Spectrum** — 0–22 kHz FFT so speech and music are visible alongside the target band; band highlighted red with threshold marker. Fills all remaining vertical space.
- **Sensitivity slider** — Low / Med / High (adjusts raw FFT amplitude threshold)
- **Notify / Beep / Tab title / Flash** — optional alerts on detection; tab title on by default, others off
- **Light/dark mode** — follows system preference
- **Layout** — fixed full-viewport height; history (~1/3) and spectrum (~2/3) split the space below the status row. Full-width, no max-width cap. Toolbar buttons are full-height tap targets for mobile.

## Detection logic

Signal in the target band must exceed the sensitivity threshold for **1 consecutive second** before DETECTED is shown. Drops back to OK immediately when signal falls below threshold.

Microphone AGC, noise suppression, and echo cancellation are all disabled so signal levels are unprocessed.

## History tooltip

Hovering (or touching on mobile) a red detection bar shows:
```
⚠ Detected 7s ago
11:35:01 – 11:35:10
```
No tooltip is shown on OK segments.

## Files

- `index.html` — layout
- `styles.css` — mobile-first, light/dark theme
- `audioAnalyzer.js` — FFT, detection, history, canvas drawing
- `app.js` — UI event handling, mode switching, alerts, tooltip

## Usage

```
open index.html
# or serve over HTTP for microphone access on some browsers
python3 -m http.server 8000
```

Requires microphone permission. Works in Chrome, Firefox, Safari, Edge.

## FFT config

- FFT size: 8192 (≈5.4 Hz/bin at 44.1 kHz sample rate)
- Display range: 0–22 kHz
- History: 1 sample/second, up to 30 min retained
