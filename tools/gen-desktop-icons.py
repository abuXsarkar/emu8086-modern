#!/usr/bin/env python3
"""Generate the icon set for `packages/desktop/icons/` from scratch.

The Tauri bundler validates icon paths at compile time, so we need
real files present even when there is no designed asset yet. This
script ships placeholder solid-color blocks using only Python stdlib
(no PIL, no ImageMagick) so it runs anywhere.

Replace with a designed source PNG by editing the `RGBA` constant
to a no-op or swapping the body for a `source.png` decode + resize
pipeline.

Usage:
  python3 tools/gen-desktop-icons.py
  # or with an explicit target:
  python3 tools/gen-desktop-icons.py packages/desktop/icons
"""
import os
import struct
import sys
import zlib

DEFAULT_OUT_DIR = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    "..",
    "packages",
    "desktop",
    "icons",
)

# Ink blue; matches the IDE's `--accent` token (#1E3A8A).
RGBA = (30, 58, 138, 255)


def make_png(size: int, rgba: tuple) -> bytes:
    width = height = size
    row = bytes(rgba) * width
    raw = b"".join(b"\x00" + row for _ in range(height))
    compressed = zlib.compress(raw, 9)

    def chunk(name: bytes, data: bytes) -> bytes:
        length = struct.pack(">I", len(data))
        crc = zlib.crc32(name + data) & 0xFFFFFFFF
        return length + name + data + struct.pack(">I", crc)

    signature = b"\x89PNG\r\n\x1a\n"
    ihdr_data = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    return signature + chunk(b"IHDR", ihdr_data) + chunk(b"IDAT", compressed) + chunk(b"IEND", b"")


def make_ico(png_bytes: bytes, size: int) -> bytes:
    header = struct.pack("<HHH", 0, 1, 1)
    w = 0 if size == 256 else size
    h = 0 if size == 256 else size
    entry = struct.pack(
        "<BBBBHHII",
        w, h,
        0,
        0,
        1,
        32,
        len(png_bytes),
        6 + 16,
    )
    return header + entry + png_bytes


def make_icns(png_bytes: bytes) -> bytes:
    type_code = b"ic08"
    entry_size = 8 + len(png_bytes)
    file_size = 8 + entry_size
    return b"icns" + struct.pack(">I", file_size) + type_code + struct.pack(">I", entry_size) + png_bytes


def main(out_dir: str) -> None:
    os.makedirs(out_dir, exist_ok=True)
    png32 = make_png(32, RGBA)
    png128 = make_png(128, RGBA)
    png256 = make_png(256, RGBA)
    for name, data in [
        ("32x32.png", png32),
        ("128x128.png", png128),
        ("128x128@2x.png", png256),
        ("icon.ico", make_ico(png256, 256)),
        ("icon.icns", make_icns(png256)),
    ]:
        path = os.path.join(out_dir, name)
        with open(path, "wb") as f:
            f.write(data)
        print(f"wrote {path} ({len(data)} bytes)")


if __name__ == "__main__":
    target = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_OUT_DIR
    main(target)
