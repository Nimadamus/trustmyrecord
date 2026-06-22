#!/usr/bin/env python3
"""
build_og_images.py - generate 1200x630 Open Graph cards for key TrustMyRecord
pages. Dark TMR styling, brand wordmark + check shield, page-specific headline,
verified-records angle. No API calls. Static output to /static/og/.

Run: python scripts/build_og_images.py
"""
import os
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "static", "og")
os.makedirs(OUT, exist_ok=True)

BG = (10, 10, 15)
CARD = (19, 19, 28)
BLUE = (0, 174, 255)
GOLD = (255, 215, 0)
GREEN = (0, 255, 136)
WHITE = (235, 235, 240)
DIM = (150, 156, 176)
BORDER = (38, 38, 54)

ARIAL = "C:/Windows/Fonts/arial.ttf"
ARIALBD = "C:/Windows/Fonts/arialbd.ttf"

def font(bold, size):
    return ImageFont.truetype(ARIALBD if bold else ARIAL, size)

def wrap(draw, text, fnt, max_w):
    words, lines, cur = text.split(), [], ""
    for w in words:
        t = (cur + " " + w).strip()
        if draw.textlength(t, font=fnt) <= max_w:
            cur = t
        else:
            if cur:
                lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines

CARDS = {
    "og-home": ("Free Verified Sports Betting Records", "Lock picks before game time. Auto-graded. Public units, ROI & streaks."),
    "og-handicappers": ("Verified Sports Handicappers Ranked by Public Records", "Compare records, units, ROI, win rate and streaks. Free and auto-graded."),
    "og-leaderboards": ("Public Betting Leaderboards Built on Units and ROI", "Real, verified performance. No screenshots. No deleted losses."),
    "og-transparent": ("Communities With Transparent Pick Tracking", "Locked picks. Auto-graded results. Public records nobody can fake."),
    "og-profile": ("Verified Sports Betting Record", "Every pick locked before the game and graded automatically on TrustMyRecord."),
}

def make(name, headline, sub):
    W, H = 1200, 630
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)
    # subtle top glow band
    for y in range(0, 180):
        a = int(22 * (1 - y / 180))
        d.line([(0, y), (W, y)], fill=(BG[0] + a // 3, BG[1] + a // 2, BG[2] + a))
    # inner card frame
    d.rounded_rectangle([40, 40, W - 40, H - 40], radius=28, outline=BORDER, width=2, fill=CARD)
    # brand row: check shield + wordmark
    bx, by = 80, 86
    d.rounded_rectangle([bx, by, bx + 56, by + 56], radius=14, fill=BLUE)
    d.text((bx + 16, by + 8), "T", font=font(True, 40), fill=(0, 16, 24))
    d.text((bx + 74, by + 6), "TrustMyRecord", font=font(True, 40), fill=WHITE)
    # green verified pill
    pill = "VERIFIED PUBLIC RECORDS"
    pf = font(True, 22)
    pw = d.textlength(pill, font=pf)
    d.rounded_rectangle([80, 188, 80 + pw + 44, 188 + 46], radius=23, outline=GREEN, width=2)
    d.text((80 + 22, 188 + 10), pill, font=pf, fill=GREEN)
    # headline (wrapped, gold accent on last word handled simply as one color)
    hf = font(True, 64)
    lines = wrap(d, headline, hf, W - 200)
    y = 270
    for ln in lines:
        d.text((80, y), ln, font=hf, fill=WHITE)
        y += 76
    # subline
    sf = font(False, 30)
    for ln in wrap(d, sub, sf, W - 200):
        d.text((80, y + 14), ln, font=sf, fill=DIM)
        y += 40
    # footer url
    d.text((80, H - 96), "trustmyrecord.com", font=font(True, 30), fill=BLUE)
    img.save(os.path.join(OUT, name + ".png"), "PNG")
    return name + ".png"

if __name__ == "__main__":
    for name, (hl, sub) in CARDS.items():
        f = make(name, hl, sub)
        p = os.path.join(OUT, f)
        print(f"wrote {f}  ({os.path.getsize(p)} bytes)")
