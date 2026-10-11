# FieldEval — Real Phone QA Checklist (`docs/PHONE_QA.md`)

This checklist is designed for physical device fieldwork validation on iOS (Mobile Safari) and Android (Chrome). Test under real field conditions (bright outdoor light, cellular data, offline).

---

## Pre-requisites & Setup
- **Target Devices**: iPhone (e.g. 13/14/15 running iOS 16+) and Android (Pixel/Samsung running Android 13+).
- **Network Modes**: Cellular data (LTE/5G) and Airplane mode.
- **Base URL**: Local network HTTPS tunnel (e.g., Cloudflare Tunnel, ngrok, or local LAN IP).

---

## 📋 Real-Device Test Checklist

| # | Test Scenario | Steps to Execute | Expected Behavior | Pass / Fail |
|---|---|---|---|---|
| **1** | **First Load on Mobile Data** | 1. Disable Wi-Fi; enable cellular data.<br>2. Open app URL in clean browser tab.<br>3. Inspect layout at viewport width (360px or 430px). | • Page renders within 2 seconds without layout shift.<br>• Viewport fills mobile screen with 16px safe margins.<br>• Typography renders cleanly with system fallback if Google Fonts is slow.<br>• Tap targets are $\ge 56\text{px}$. | [ ] |
| **2** | **Native Camera Capture** | 1. Tap **"Open camera"**.<br>2. Allow camera permissions when prompted.<br>3. Cancel picker once; verify no session state changes.<br>4. Re-open and capture a live specimen. | • `<input capture="environment">` invokes the device's rear-facing camera directly.<br>• Cancelling picker maintains current stage.<br>• Captured photo decodes without orientation inversion (EXIF orientation respected).<br>• Image is normalized to max 1024px JPEG $\le 1.5\text{MB}$. | [ ] |
| **3** | **Photo in Bright Direct Sunlight** | 1. Capture a specimen in direct, intense outdoor sunlight.<br>2. Pick ground truth; tap **"Lock my answer"**.<br>3. Observe reveal flagging tape. | • Screen remains readable in harsh glare (Concrete `#E8EAEC` and Ballpoint `#1F2FD0` maintain $>7:1$ contrast).<br>• Flagging tape slap lands diagonally with high contrast (`#000000` text on lime `#C8F03C` or pink `#FF3D81`). | [ ] |
| **4** | **Photo in Deep Shade / Canopy** | 1. Capture a specimen under dense tree shade / overcast lighting.<br>2. Lock ground truth and inspect model inference. | • Camera auto-exposure adjusts.<br>• Image compressor strips EXIF and GPS without crushing dark levels.<br>• SHA-256 hash calculated correctly. | [ ] |
| **5** | **Airplane Mode & Reconnection** | 1. Enable Airplane Mode (offline).<br>2. Capture a photo and tap **"Lock my answer"**.<br>3. Observe status pill.<br>4. Disable Airplane Mode (restore connectivity). | • Status shows yellow `OFFLINE` badge and `QUEUED OFFLINE`.<br>• Photo blob and observation saved safely in IndexedDB.<br>• When connectivity restores, background sync triggers automatically and model scores the queued observation. | [ ] |
| **6** | **Reload Mid-Session** | 1. Advance to Scene #3 or #4.<br>2. Capture photo; lock ground truth.<br>3. Force-refresh browser tab (or swipe quit browser and re-open). | • Session resumes exactly at Scene #3/#4.<br>• Photo thumbnail, locked ground truth, and scoring state restore from IndexedDB.<br>• No data loss or reset to Scene #1. | [ ] |
| **7** | **Model Failure / Bad API Key** | 1. Break API key or simulate network timeout.<br>2. Submit photo. | • Toast notification displays error/timeout message.<br>• Flagging tape displays `TIMED OUT` or `RATE LIMITED`.<br>• Observation is marked `status: 'error'` or `'timeout'` in IndexedDB without crashing app. | [ ] |
| **8** | **Post-Reveal Revision Audit** | 1. After reveal tape appears, tap **"Change my answer after reveal"**.<br>2. Select a different answer or "Unsure"; tap **"Confirm revision"**.<br>3. View results screen. | • Flagging tape updates to `EXCLUDED (REVISED)`.<br>• Audit banner confirms original answer kept and observation excluded.<br>• In results, scorable denominator excludes this observation. | [ ] |
| **9** | **Export (.jsonl) & Web Share Sheet** | 1. On Results screen, tap **"Export results file (.jsonl)"**.<br>2. On iOS Safari / Android Chrome, verify native share sheet opens. | • On supported mobile browsers, `navigator.share({ files })` invokes native OS share sheet (AirDrop, Messages, Save to Files).<br>• On desktop or unsupported browsers, downloads `.jsonl` directly via Blob anchor.<br>• Every record matches `fieldeval.v1` schema with SHA-256 and dimensions. | [ ] |
| **10** | **Delete All My Data** | 1. Tap **"Delete all my data"**.<br>2. Confirm danger modal dialog. | • IndexedDB stores (`sessions`, `observations`, `blobs`) and localStorage are purged completely.<br>• Redirects to home screen (`/`) in clean state. | [ ] |
| **11** | **Install to Home Screen (PWA)** | 1. In Safari (iOS), tap Share $\rightarrow$ "Add to Home Screen".<br>2. On Android, tap "Install app" banner.<br>3. Launch from Home Screen icon. | • Launches in standalone display mode without browser URL bar.<br>• Safe area insets (notch, dynamic island, home bar) respected with `pb-safe`.<br>• Theme color `#E8EAEC` colors the OS status bar. | [ ] |

---

## ⚠️ What Could NOT Be Verified Without a Real Device

The following hardware and operating-system-level behaviors cannot be verified purely inside desktop emulation or CI test suites:

1. **Native iOS Safari Share Sheet (`navigator.canShare({ files })`)**:
   Desktop Chrome/Chromium implements `navigator.share` without native file handler attachments on non-mobile OSs, whereas iOS Safari delegates file payloads to the system share sheet (Files, AirDrop). Desktop falls back cleanly to the anchor blob download.
2. **Camera Sensor EXIF Orientation**:
   Different mobile camera hardware (Apple iPhone HEIC/JPEG vs Samsung/Pixel sensors) embeds hardware-specific EXIF rotation flags (orientations 1, 3, 6, 8). While `createImageBitmap({ imageOrientation: 'from-image' })` handles this in modern browsers, physical sensor orientation can only be verified with live camera hardware.
3. **Physical Outdoor Screen Glare**:
   The perceptual legibility of Concrete (`#E8EAEC`), Ballpoint (`#1F2FD0`), and high-saturation lime/pink tape under $>50,000\text{ lux}$ direct summer sunlight requires a physical OLED/LCD smartphone display.
4. **PWA Standalone Safe-Area Notch Insets**:
   Hardware cutouts (Dynamic Island, iPhone home indicator bar, Android curved edges) require physical testing to ensure `env(safe-area-inset-bottom)` prevents overlapping bottom buttons.
5. **Native Storage Quota Pressure**:
   Mobile OS aggressive evictions during device-wide storage pressure (e.g. low device disk space) must be tested on a phone with `< 500\text{MB}` free storage to confirm `navigator.storage.persist()` durability.
