# BuzzOff

**Detect high-frequency annoyance tones in real time — [drewmayo.com/buzzoff](https://drewmayo.com/buzzoff)**

BuzzOff listens through your microphone and alerts you when it detects ultrasonic tones used by mosquito repellers, anti-loitering "teen deterrent" devices, or other annoying high-frequency sound sources.

## Features

### Detection bands

| Mode | Range | Targets |
|------|-------|---------|
| **Annoy** (default) | 14–20 kHz | Broad range of deterrent and harassment tones |
| **Mosquito** | 16–18.5 kHz | Classic anti-loitering tone, inaudible to most adults |
| **Custom** | user-defined | Any frequency range you specify |

### Sensitivity

Three levels — Low, Med, High — control how strong a signal must be before it triggers a detection. Lower sensitivity reduces false positives; higher sensitivity catches weaker tones.

### Filter white noise

Filters out broadband background noise (fans, air conditioning, fabric rustling) so only distinct, narrow-band tones trigger an alert. Can be turned off in quiet environments if detections are being missed.

### Live spectrum

A full 0–22 kHz FFT display shows the live audio spectrum, with the target frequency band highlighted so you can see signals as they appear. Fills the available screen space.

### Detection history

A scrolling timeline shows signal intensity over the last 5, 15, or 30 minutes. Hover or tap a detection segment to see its exact time range.

### Alerts

Choose any combination of alert types when a tone is detected:

- **Notify** — browser notification (works in background tabs)
- **Beep** — audible 880 Hz alert tone
- **Tab title** — changes to "⚠ DETECTED" (on by default)
- **Flash** — briefly flashes the screen red

## Privacy

BuzzOff does not record or store audio. It only analyzes the live frequency spectrum in real time, entirely within your browser. No audio or data ever leaves your device.

## Notes

- Requires microphone permission
- Works in Chrome, Firefox, Safari, and Edge
- Physical distance, walls, and your microphone's frequency response all affect detection
- For best accuracy keep the BuzzOff tab visible — browsers throttle background tabs which can delay detection

---

## Technology

BuzzOff is a standalone browser app with no backend and no build step. It uses the Web Audio API to run an 8192-point FFT (≈5.4 Hz/bin resolution) entirely client-side. It is packaged as a PWA so it can be installed to a home screen or desktop. Theming (light, dark, etc) is handled entirely in CSS custom properties. All settings persist locally via localStorage.

For local dev, sync the repo locally and open `index.html` in the browser.
