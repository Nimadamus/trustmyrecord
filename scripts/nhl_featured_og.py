#!/usr/bin/env python3
"""Open Graph card for an NHL Featured Game page. NHL_FEATURED_REDESIGN_20260930.

1200x630 JPEG at static/og/nhl-featured/<slug>.jpg: both clubs' marks, each
club's lead player photo from the league's own headshot service, the matchup
and the puck drop time. Built once per page (the matchup and time are fixed
when the page is minted); an existing card is reused. Needs Pillow; without
it the page keeps the site default card.
"""

import io
import os
import urllib.request

from nhl_featured_render import _accent

UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128.0 Safari/537.36"}
W, H = 1200, 630
BASE = (6, 16, 31)
FONTS_BOLD = ("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", "C:/Windows/Fonts/arialbd.ttf",
              "/System/Library/Fonts/Supplemental/Arial Bold.ttf")
FONTS_REG = ("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "C:/Windows/Fonts/arial.ttf",
             "/System/Library/Fonts/Supplemental/Arial.ttf")


def _font(bold, size):
    from PIL import ImageFont
    for p in (FONTS_BOLD if bold else FONTS_REG):
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    try:
        return ImageFont.load_default(size=size)
    except TypeError:
        return ImageFont.load_default()


def _get(url):
    from PIL import Image
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=25) as resp:
        return Image.open(io.BytesIO(resp.read())).convert("RGBA")


def _rgb(hexcolor, fallback=(29, 127, 232)):
    try:
        h = hexcolor.lstrip("#")
        return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))
    except (AttributeError, ValueError):
        return fallback


def build(root, ctx):
    """Returns (url path, (w, h)) of the card, or None when it cannot be made."""
    rel = "static/og/nhl-featured/%s.jpg" % ctx["slug"]
    path = os.path.join(root, rel.replace("/", os.sep))
    if os.path.exists(path):
        return "/" + rel, (W, H)
    try:
        from PIL import Image, ImageDraw
    except ImportError:
        return None
    try:
        a, h = ctx["away"], ctx["home"]
        img = Image.new("RGB", (W, H), (6, 16, 31))
        d = ImageDraw.Draw(img)
        # team colour washes from each edge, kept low so the card stays dark
        for side, t in ((0, a), (1, h)):
            c = _rgb(_accent(t))
            for x in range(W // 2):
                k = (1 - x / (W / 2.0)) ** 1.6 * 0.42
                col = tuple(int(BASE[i] + (c[i] - BASE[i]) * k) for i in range(3))
                xx = x if side == 0 else W - 1 - x
                d.line([(xx, 0), (xx, H)], fill=col)
        # lead players, bottom aligned at each edge
        for side, t in (("away", a), ("home", h)):
            ps = (ctx.get("key_players") or {}).get(side) or []
            if ps and ps[0].get("headshot"):
                try:
                    face = _get(ps[0]["headshot"]).resize((420, 420), Image.LANCZOS)
                    x = -50 if side == "away" else W - 370
                    img.paste(face, (x, H - 420), face)
                except Exception:
                    pass
        # centre panel
        panel = Image.new("RGBA", (560, 630), (6, 16, 31, 0))
        pd = ImageDraw.Draw(panel)
        for y in range(630):
            pd.line([(0, y), (560, y)], fill=(6, 16, 31, 215))
        img.paste(panel, (320, 0), panel)
        d = ImageDraw.Draw(img)
        for i, t in enumerate((a, h)):
            try:
                logo = _get(t["logo"]).resize((150, 150), Image.LANCZOS)
                img.paste(logo, (400 + i * 250, 130), logo)
            except Exception:
                pass
        d.text((600, 205), "AT", font=_font(True, 34), fill=(143, 174, 203), anchor="mm")

        def centre(y, text, size, bold=True, fill=(234, 242, 250)):
            f = _font(bold, size)
            while d.textlength(text, font=f) > 520 and size > 18:
                size -= 2
                f = _font(bold, size)
            d.text((600, y), text, font=f, fill=fill, anchor="mm")

        d.rounded_rectangle([430, 48, 770, 92], radius=8, fill=(77, 163, 255))
        d.text((600, 70), "NHL FEATURED GAME", font=_font(True, 24), fill=(4, 16, 28), anchor="mm")
        centre(335, ("%s at %s" % (a["common"], h["common"])).upper(), 50)
        centre(395, ctx["long_date"], 28, False, (195, 216, 236))
        centre(438, "%s ET  |  %s PT" % (ctx["et_time"], ctx["pt_time"]), 28, False, (195, 216, 236))
        centre(500, "Preview, prediction, odds and trends", 26, False, (143, 174, 203))
        centre(575, "TrustMyRecord.com", 30, True, (77, 163, 255))
        os.makedirs(os.path.dirname(path), exist_ok=True)
        img.save(path, "JPEG", quality=84, optimize=True, progressive=True)
        return "/" + rel, (W, H)
    except Exception as exc:  # a card is optional; the page keeps the default
        print("  og card skipped: %s" % exc)
        return None
