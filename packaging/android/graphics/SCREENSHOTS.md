# Capturing Play Store screenshots

Play Console requires at least 2, accepts up to 8. We'll capture 3
that walk a prospective installer through the value proposition:
**editing → running → time-travel debugging**.

## Spec recap

- Format: JPEG or 24-bit PNG (no alpha).
- Aspect ratio: 16:9 or 9:16. Portrait reads better on phone listing
  cards; we use **9:16** = 1080 × 1920 px.
- Min short side: 320 px. Max long side: 3840 px. 1080 × 1920 is the
  sweet spot — high enough to look crisp, small enough to upload
  quickly.

## Set up the browser

1. Open Chrome / Edge / any Chromium browser.
2. Visit `https://modern8086.com` (or `http://localhost:5173` if you
   have the dev server running).
3. Open DevTools (`F12` or `Ctrl+Shift+I`).
4. Toggle the device toolbar (`Ctrl+Shift+M`).
5. Set a custom viewport: **1080 × 1920**, DPR **1**, mobile mode.
   - Top of DevTools → "Dimensions" dropdown → **Edit** → **Add custom device**.
   - Name: `Play screenshot`, Width 1080, Height 1920, DPR 1, User agent: Mobile.
6. Reload the page so the responsive layout applies cleanly.

## The three captures

For each, set up the IDE state, then in DevTools:
`Cmd/Ctrl+Shift+P` → type **screenshot** → pick **Capture full size
screenshot** (full page) or **Capture screenshot** (just viewport).

### 1. `screenshots/phone-1-editor.png` — "It's a real IDE"

State to capture:
- Source editor visible at the top with the **Hello world** example loaded.
- Left rail shows Examples + the registers panel populated from a
  recent Run.
- Output panel shows `Hello, world!`.

How to set up:
1. Top of the page → **Load Example** dropdown → "Hello world".
2. Click **Run**. Wait for the output line.
3. Screenshot.

### 2. `screenshots/phone-2-peripherals.png` — "Real I/O devices"

State to capture:
- LED matrix demo loaded + running, with the matrix lit.
- 7-seg + traffic light visible nearby in the device gallery.

How to set up:
1. Load Example → "LED 8×8 walking dot" (or any peripheral example).
2. Click **Run**.
3. Scroll so the device row is centred in the viewport.
4. Screenshot.

### 3. `screenshots/phone-3-debugger.png` — "Step backward in time"

State to capture:
- Source highlighted on a specific line mid-program.
- Register table showing values different from initial state.
- A breakpoint or watch expression visible.

How to set up:
1. Load Example → "Sum of array" (or any multi-step program).
2. Click **Step** four or five times to advance.
3. (Optional) Add a watch on `AX` via the debugger panel.
4. Screenshot.

## After capture

```bash
ls packaging/android/graphics/screenshots/
# phone-1-editor.png
# phone-2-peripherals.png
# phone-3-debugger.png
```

Verify each is 1080 × 1920 (or close — DevTools sometimes captures
the full scroll length, which is fine as long as the short side is
between 320 and 3840):

```bash
file packaging/android/graphics/screenshots/*.png
```

If a capture is too tall (e.g. 1080 × 4500 from a full-page
screenshot), crop it down to a clean 1080 × 1920 in any image
editor before uploading.

## Tablet screenshots (optional, recommended)

Play Console also has slots for **7-inch tablet** and **10-inch
tablet** screenshots. They're optional, but listings with all three
tiers rank slightly higher in search.

If you want to fill them too, repeat the process at:

- 7-inch tablet: 1200 × 1920
- 10-inch tablet: 1920 × 1200 (landscape — the IDE's 3-column
  layout reads great in landscape)

Save under `screenshots/tablet7-*.png` and `screenshots/tablet10-*.png`.
