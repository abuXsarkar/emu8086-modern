# Play Store graphics

What lives in this directory and how to use each file.

| File | Play Console field | Spec | Status |
|---|---|---|---|
| `app-icon-512.png` | App icon | 512 × 512, 32-bit PNG with alpha, < 1 MB | ✅ ready (same image as `packages/web/public/pwa-512.png`) |
| `feature-graphic.svg` | Feature graphic | 1024 × 500 PNG/JPG, no transparency, < 15 MB | 🟡 source SVG ready; export to PNG before upload |
| `screenshots/phone-*.png` | Phone screenshots | 16:9 or 9:16; 320–3840 px short side; JPEG or 24-bit PNG; ≥ 2 required | ❌ capture from a real session — see SCREENSHOTS.md |

## Exporting the feature graphic to PNG

Three paths; pick whichever you already have tooling for.

**Option A — Local `rsvg-convert` (clean, scriptable)**

```bash
sudo apt install -y librsvg2-bin     # WSL / Ubuntu
brew install librsvg                 # macOS
rsvg-convert -w 1024 -h 500 \
  -o packaging/android/graphics/feature-graphic.png \
  packaging/android/graphics/feature-graphic.svg
```

**Option B — Local ImageMagick / `magick`**

```bash
magick -background none -density 200 \
  packaging/android/graphics/feature-graphic.svg \
  -resize 1024x500 \
  packaging/android/graphics/feature-graphic.png
```

**Option C — Online converter** (no install)

Any of cloudconvert.com, svgomg.net (export), or svg2png.com. Upload
`feature-graphic.svg`, set output to **PNG, 1024 × 500**, no
transparency. Save the result as `feature-graphic.png` next to the
SVG.

The committed `.svg` is the source of truth — re-export the PNG
whenever you edit it.

## App icon

`app-icon-512.png` is identical to the PWA icon
(`packages/web/public/pwa-512.png`). One canonical icon, same on
the web, the desktop installers, and Play Store, so the brand reads
the same wherever a student finds it.

If you ever change the brand mark, regenerate it from
`packages/web/public/icon.svg` and copy the 512×512 PNG to both
places.

## Screenshots

See [`SCREENSHOTS.md`](SCREENSHOTS.md) for the capture process and
suggested scenes. The committed PNGs go under `screenshots/` and are
uploaded directly to the Play Console.
