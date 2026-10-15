#!/usr/bin/env python3
"""README composites: phone screenshots side by side, captioned, on Clink ink.

    python3 scripts/compose-screenshots.py OUT.png "Caption=path/to/shot.png" ...

Screenshots are full-resolution phone captures (e.g. `adb exec-out screencap -p`).
Keep 4-5 per composite so they read at README width.
"""
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

INK = (20, 17, 15)
FRAME = (54, 46, 38)
CREAM = (251, 246, 236)
GOLD = (255, 176, 32)

PHONE_W = 360  # each phone, in output pixels
GAP = 64
PAD_X = 96
PAD_TOP = 72
CAPTION_GAP = 56
CAPTION_SIZE = 40
BEZEL = 10
RADIUS = 44


def font(size: int) -> ImageFont.FreeTypeFont:
    for name in ("Lato-Black.ttf", "Lato-Heavy.ttf", "Lato-Bold.ttf", "DejaVuSans-Bold.ttf"):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    for path in Path("/usr/share/fonts").rglob("Lato-Bold.ttf"):
        return ImageFont.truetype(str(path), size)
    return ImageFont.load_default()


def phone(shot: Image.Image) -> Image.Image:
    """The screenshot inside a rounded bezel."""
    w = PHONE_W
    h = round(shot.height * w / shot.width)
    screen = shot.convert("RGB").resize((w, h), Image.LANCZOS)
    inner = Image.new("L", (w, h), 0)
    ImageDraw.Draw(inner).rounded_rectangle((0, 0, w - 1, h - 1), RADIUS - BEZEL, fill=255)
    out = Image.new("RGBA", (w + 2 * BEZEL, h + 2 * BEZEL), (0, 0, 0, 0))
    ImageDraw.Draw(out).rounded_rectangle((0, 0, out.width - 1, out.height - 1), RADIUS, fill=FRAME)
    out.paste(screen, (BEZEL, BEZEL), inner)
    return out


def main() -> None:
    out_path, *pairs = sys.argv[1:]
    items = [(p.split("=", 1)[0], Image.open(p.split("=", 1)[1])) for p in pairs]
    phones = [(caption, phone(img)) for caption, img in items]
    pw, ph = phones[0][1].size
    width = 2 * PAD_X + len(phones) * pw + (len(phones) - 1) * GAP
    height = PAD_TOP + ph + CAPTION_GAP + CAPTION_SIZE + PAD_TOP
    canvas = Image.new("RGB", (width, height), INK)
    draw = ImageDraw.Draw(canvas)
    f = font(CAPTION_SIZE)
    for i, (caption, img) in enumerate(phones):
        x = PAD_X + i * (pw + GAP)
        canvas.paste(img, (x, PAD_TOP), img)
        tw = draw.textlength(caption, font=f)
        draw.text((x + (pw - tw) / 2, PAD_TOP + ph + CAPTION_GAP), caption, font=f, fill=CREAM)
    # A thin gold rule: the brand, quietly.
    draw.rectangle((PAD_X, height - 20, PAD_X + 120, height - 14), fill=GOLD)
    canvas.save(out_path, optimize=True)
    print(f"  {out_path} {canvas.size[0]}x{canvas.size[1]}")


if __name__ == "__main__":
    main()
