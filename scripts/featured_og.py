#!/usr/bin/env python3
"""Open Graph card for a rotation Matchup of the Day page. MOTD_OG_CARD_20261008.

These pages shipped the site wide card (/static/og/og-home.png), so every
share of a featured game showed the same generic image. This builds the page's
own 1200x630 JPEG at static/og/featured/<slug>.jpg in the same layout the API
draws for the written Matchup of the Day articles: both sides' marks, who plays
whom, when, and the page's own angle, each in a fixed one line slot that can
only shrink, never run into the next line.

Marks are the clubs' own ESPN logos (or the players' flags for tennis), matched
on the exact team name the page names. A mark that cannot be fetched becomes
the club's initials; it is never another club's logo or a placeholder picture.
Needs Pillow (the workflow installs it). Fonts: Barlow, OFL, bundled in
scripts/og_fonts.
"""

import datetime as dt
import io
import json
import os
import re
import unicodedata
import urllib.request
from zoneinfo import ZoneInfo

W, H = 1200, 630
HERE = os.path.dirname(os.path.abspath(__file__))
FONT_DIR = os.path.join(HERE, "og_fonts")
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128.0 Safari/537.36"}
NAVY, NAVY3, LINE = (8, 25, 43), (16, 51, 79), (27, 58, 87)
INK, INK2, MUTED, TEAL = (234, 242, 250), (195, 216, 236), (143, 174, 203), (34, 210, 192)
ESPN_LEAGUE = {
    "nhl": "hockey/nhl", "nfl": "football/nfl", "nba": "basketball/nba", "mlb": "baseball/mlb",
    "ncaaf": "football/college-football", "ncaab": "basketball/mens-college-basketball",
}
SPORT_LABEL = {"nhl": "NHL", "nfl": "NFL", "nba": "NBA", "mlb": "MLB", "ncaaf": "COLLEGE FOOTBALL",
               "ncaab": "COLLEGE BASKETBALL", "soccer": "SOCCER", "tennis": "TENNIS"}
_teams = {}


def _font(name, size):
    from PIL import ImageFont
    return ImageFont.truetype(os.path.join(FONT_DIR, name), size)


def norm(s):
    s = unicodedata.normalize("NFKD", str(s or "")).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", " ", s.lower()).strip()


def _get(url, timeout=20):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def _league(sport):
    lg = ESPN_LEAGUE.get(sport)
    if not lg:
        return {}
    if lg not in _teams:
        out = {}
        try:
            data = json.loads(_get("https://site.api.espn.com/apis/site/v2/sports/%s/teams?limit=1000" % lg))
            for w in data["sports"][0]["leagues"][0]["teams"]:
                t = w["team"]
                logos = [l for l in t.get("logos") or [] if "dark" not in (l.get("rel") or [])] or t.get("logos") or []
                out[norm(t.get("displayName"))] = {
                    "short": t.get("shortDisplayName") or t.get("name") or t.get("displayName"),
                    "location": t.get("location") or "",
                    "color": "#" + t["color"] if t.get("color") else None,
                    "logo": logos[0]["href"] if logos else None,
                }
        except Exception:
            out = {}
        _teams[lg] = out
    return _teams[lg]


SOCCER_LEAGUES = ("usa.1", "eng.1", "esp.1", "ita.1", "ger.1", "fra.1", "mex.1", "uefa.champions")


def team(sport, display):
    """ESPN's record for the club the page names, or None. Exact name match only."""
    if sport == "soccer":
        for lg in SOCCER_LEAGUES:
            ESPN_LEAGUE["soccer:" + lg] = "soccer/" + lg
            hit = _league("soccer:" + lg).get(norm(display))
            if hit:
                return hit
        return None
    return _league(sport).get(norm(display))


def _mark(url):
    if not url:
        return None
    try:
        from PIL import Image
        return Image.open(io.BytesIO(_get(url))).convert("RGBA")
    except Exception:
        return None


def _rgb(hexcolor, fallback):
    try:
        h = hexcolor.lstrip("#")
        return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))
    except (AttributeError, ValueError):
        return fallback


def _fit(draw, text, font_name, size, min_size, max_w):
    while size > min_size:
        f = _font(font_name, size)
        if draw.textlength(text, font=f) <= max_w:
            return f, text
        size -= 2
    f = _font(font_name, min_size)
    while text and draw.textlength(text + "…", font=f) > max_w:
        text = text[:-1]
    return f, (text.rstrip() + "…") if draw.textlength(text, font=f) > 0 else text


def when_lines(start_utc, time_valid=True):
    kick = start_utc.astimezone(ZoneInfo("America/Los_Angeles"))
    if not time_valid:
        # an unset start is carried as midnight Eastern: the game's date is the
        # Eastern one (rotation pages say the same in their own when line)
        et_day = start_utc.astimezone(ZoneInfo("America/New_York"))
        return "%s, %s %d" % (et_day.strftime("%A"), et_day.strftime("%B"), et_day.day), "Start time to be announced"
    day = "%s, %s %d" % (kick.strftime("%A"), kick.strftime("%B"), kick.day)
    et = start_utc.astimezone(ZoneInfo("America/New_York"))
    fmt = lambda d: d.strftime("%I:%M %p").lstrip("0")
    return day, "%s ET  |  %s PT" % (fmt(et), fmt(kick))


def render(ctx):
    """ctx: sport, away, home (display names), start (aware datetime), time_valid,
    angle, flags (tennis: [away_url, home_url]). Returns a PIL image."""
    from PIL import Image, ImageDraw
    sport = ctx["sport"]
    img = Image.new("RGB", (W, H), NAVY)
    px = img.load()
    for y in range(H):                                   # navy diagonal like the API card
        for x in range(0, W, 4):
            t = (x / W + y / H) / 2
            c = tuple(int(NAVY[i] + (NAVY3[i] - NAVY[i]) * t) for i in range(3))
            for k in range(4):
                px[x + k, y] = c
    d = ImageDraw.Draw(img, "RGBA")
    sides = []
    for key in ("away", "home"):
        disp = ctx[key]
        info = None if sport == "tennis" else team(sport, disp)
        if sport == "tennis":
            mark = _mark((ctx.get("flags") or [None, None])[0 if key == "away" else 1])
            short = disp.split()[-1]
        else:
            mark = _mark(info["logo"]) if info else None
            short = (info["location"] if sport in ("ncaaf", "ncaab") else info["short"]) if info else disp
        sides.append({"display": disp, "short": short, "mark": mark,
                      "color": _rgb(info["color"], TEAL) if info and info.get("color") else TEAL})
    # side tints
    for i, s in enumerate(sides):
        d.rectangle((i * W // 2, 0, (i + 1) * W // 2, H), fill=s["color"] + (26,))
    d.rectangle((0, 0, W, 8), fill=TEAL)
    # kicker pill
    kick = "MATCHUP OF THE DAY  ·  %s" % SPORT_LABEL.get(sport, sport.upper())
    fk = _font("Barlow-Bold.ttf", 22)
    kw = d.textlength(kick, font=fk) + 36
    d.rounded_rectangle((W / 2 - kw / 2, 44, W / 2 + kw / 2, 86), radius=21, fill=(34, 210, 192, 36), outline=(34, 210, 192, 115))
    d.text((W / 2, 65), kick, font=fk, fill=TEAL, anchor="mm")
    # marks
    for i, s in enumerate(sides):
        cx, cy, r = (W / 2 - 230, W / 2 + 230)[i], 214, 92
        d.ellipse((cx - r - 26, cy - r - 26, cx + r + 26, cy + r + 26), fill=s["color"] + (40,))
        d.ellipse((cx - r - 7, cy - r - 7, cx + r + 7, cy + r + 7), outline=s["color"] + (230,), width=5)
        if s["mark"] is not None:
            d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=(255, 255, 255))
            m = s["mark"].copy()
            m.thumbnail((int(r * 1.44), int(r * 1.44)))
            img.paste(m, (int(cx - m.width / 2), int(cy - m.height / 2)), m)
        else:
            d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=NAVY3)
            ini = "".join(w[0] for w in s["display"].split()[:2]).upper() or "?"
            d.text((cx, cy), ini, font=_font("BarlowCondensed-Bold.ttf", 80), fill=INK, anchor="mm")
    d.text((W / 2, 216), "VS" if sport == "tennis" else "AT", font=_font("BarlowCondensed-Bold.ttf", 44), fill=MUTED, anchor="mm")
    # fixed one line slots
    head = ("%s %s %s" % (sides[0]["short"], "vs" if sport == "tennis" else "at", sides[1]["short"])).upper()
    fh, head = _fit(d, head, "BarlowCondensed-Bold.ttf", 76, 46, W - 160)
    d.text((W / 2, 392), head, font=fh, fill=INK, anchor="ms")
    day, clock = when_lines(ctx["start"], ctx.get("time_valid", True))
    d.text((W / 2, 438), day, font=_font("Barlow-SemiBold.ttf", 30), fill=INK2, anchor="ms")
    d.text((W / 2, 474), clock, font=_font("Barlow-Regular.ttf", 26), fill=MUTED, anchor="ms")
    if ctx.get("angle"):
        fa, angle = _fit(d, ctx["angle"], "Barlow-Bold.ttf", 25, 20, W - 240)
        d.text((W / 2, 512), angle, font=fa, fill=TEAL, anchor="ms")
    d.line((64, H - 96, W - 64, H - 96), fill=LINE, width=2)
    d.text((64, H - 52), "Every figure sourced. TrustMyRecord Research.", font=_font("Barlow-Regular.ttf", 24), fill=MUTED, anchor="ls")
    d.text((W - 64, H - 52), "TrustMyRecord.com", font=_font("Barlow-Bold.ttf", 26), fill=TEAL, anchor="rs")
    return img


def build(root, slug, ctx, force=False):
    """Writes static/og/featured/<slug>.jpg once. Returns the site path, or None
    when Pillow is missing (the caller then fails loudly in CI)."""
    rel = "static/og/featured/%s.jpg" % slug
    path = os.path.join(root, rel.replace("/", os.sep))
    if os.path.exists(path) and not force:
        return "/" + rel
    try:
        img = render(ctx)
    except ImportError:
        return None
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path, "JPEG", quality=88, optimize=True, progressive=True)
    return "/" + rel
