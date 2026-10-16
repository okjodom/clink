#!/usr/bin/env python3
"""Build 1080x1920 store artwork from real device captures, without changing app content.

Run from the repository root: python3 scripts/compose-store-screenshots.py
Only the Android status/navigation bars are cropped from the source captures.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "docs/store-listing"
INK, CREAM, GOLD = "#14110f", "#fbf6ec", "#ffb020"
SLIDES = [
    ("01-wallet", "01-home.png", "Money that\njust works.", "One wallet. Your own keys."),
    ("02-receive", "02-receive.png", "A name.\nA way to get paid.", "Your username is your payment address."),
    ("03-send", "09-send.png", "Send in\na few taps.", "Choose who. Enter how much."),
    ("04-payment-qr", "11-payment-qr.png", "Your code.\nReady to scan.", "Show it. Save it. Get paid."),
    ("05-agent", "07-desk.png", "Run your\nown desk.", "Help people add money or cash out."),
    ("06-balance", "05-hold-in.png", "Dollars\nor bitcoin.", "Choose where to keep your balance."),
    ("07-add-money", "03-add-money.png", "Add money.\nKeep moving.", "Through people near you."),
    ("08-cash-out", "13-cash-out.png", "Cash out\nwith an agent.", "To mobile money, bank or cash."),
]


def font(size):
    return ImageFont.truetype("Lato-Bold.ttf", size)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    logo = Image.open(ROOT / "assets/brand/logo-tile.png").convert("RGBA").resize((72, 72), Image.Resampling.LANCZOS)
    for name, source, headline, subtitle in SLIDES:
        canvas = Image.new("RGB", (1080, 1920), CREAM)
        draw = ImageDraw.Draw(canvas)
        canvas.paste(logo, (72, 56), logo)
        draw.text((166, 59), "clink", font=font(56), fill=INK)
        draw.multiline_text((72, 164), headline, font=font(76), fill=INK, spacing=0)
        draw.text((76, 350), subtitle, font=font(31), fill="#5e564c")
        shot = Image.open(ROOT / "docs/screenshots" / source).convert("RGB")
        # Captured on Samsung S23 at 1080x2340; preserve the complete app viewport.
        if shot.size != (1080, 2340):
            raise ValueError(f"Unexpected capture dimensions: {source} {shot.size}")
        shot = shot.crop((0, 95, 1080, 2305))
        shot = shot.resize((680, round(shot.height * 680 / shot.width)), Image.Resampling.LANCZOS)
        x, y = (1080 - shot.width) // 2, 420
        draw.rounded_rectangle((x - 10, y - 10, x + shot.width + 10, y + shot.height + 10), radius=38, fill="#362e26")
        mask = Image.new("L", shot.size, 0)
        ImageDraw.Draw(mask).rounded_rectangle((0, 0, shot.width - 1, shot.height - 1), radius=28, fill=255)
        canvas.paste(shot, (x, y), mask)
        draw.rectangle((76, 1872, 196, 1878), fill=GOLD)
        canvas.save(OUT / f"{name}.png", optimize=True)
        print(OUT / f"{name}.png")


if __name__ == "__main__":
    main()
