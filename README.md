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

### Spectrum detail

Three levels — Low (1024 bins), Med (2048 bins), High (4096 bins) — trade frequency resolution for CPU cost. Low is recommended for older or mobile devices; High gives the finest resolution.

### Detection history

A scrolling timeline shows signal intensity over the last 5, 15, or 30 minutes. Hover or tap a detection segment to see its exact time range.

### Alerts

Choose any combination of alert types when a tone is detected:

- **Notify** — browser notification (works in background tabs)
- **Beep** — audible 880 Hz alert tone
- **Tab title** — changes to "⚠ DETECTED" (on by default)
- **Flash** — briefly flashes the screen red

## Why I wrote this

Some jokers at school think it's hilarious to play the high-pitched "mosquito" tones to annoy the other kids in class with pure plausible deniability. The teacher can't hear the tone, so nobody will ever know or prove anything, right? Well maybe not, until now.

I'm an old-school engineer which means I have written my share of FFTs and DCTs by hand, in languages and for platforms nobody cares about any more. For this app I just spent a nice free morning with an AI agent which let me build it in straight no-dependency javascript. It's small, simple, and not quite vibe-coded, but pretty close. And if it helps either of my kids find out which mouth breather is playing that stupid annoying sound then it's been worth it.

The code and app are released free under the MIT license. Go get 'em.

*Dedicated to my kids — Love you <3*

## Privacy

BuzzOff does not record or store audio. It only analyzes the live frequency spectrum in real time, entirely within your browser. No audio or data ever leaves your device.

## Notes

- Requires microphone permission
- Works in Chrome, Firefox, Safari, and Edge
- Physical distance, walls, and your microphone's frequency response all affect detection
- For best accuracy keep the BuzzOff tab visible — browsers throttle background tabs which can delay detection
- BuzzOff is a [PWA](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps) — install it to your home screen or desktop for offline use

---

## Technology

BuzzOff is a standalone browser app with no backend and no build step. It uses the Web Audio API to run a configurable FFT (1024, 2048, or 4096 points — ≈43, 21.5, or 10.8 Hz/bin resolution) entirely client-side. It is packaged as a [PWA (Progressive Web App)](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps) so it can be installed to a home screen or desktop and used offline without an internet connection. Theming (light, dark, etc) is handled entirely in CSS custom properties. All settings persist locally via localStorage.

For local dev, sync the repo locally and open `index.html` in the browser.
