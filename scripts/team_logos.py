#!/usr/bin/env python3
"""
team_logos.py - resolve a club's own mark for the Game File bake.

TEAM_LOGO_PIPELINE_20260903.

The problem this replaces
------------------------
The hero used to print whatever logo the article record carried. Nothing in the
bake knew what a given club's mark WAS, so every new club needed a human to go
and find one, and the first college Game File shipped with a hand-drawn "CU"
and "GT" roundel because nobody had. This makes the mark a property of the
TEAM, resolved at bake time from data/team-logos.json, so an article about a
club the site has never covered gets the right logo with no author input.

Three-step resolution, in this order:

 1. data/team-logos.json  -> the club's ESPN mark, downloaded ONCE into
                             static/media/matchups/logos/<sport>/ and served
                             from there.
                             Never hotlinked: a Game File serves its own assets.
 2. the article's own hero logo, if the record carries one and the file is on
    disk. An author can still override the registry for a club whose mark the
    registry gets wrong.
 3. a generated initials badge in the club's own colours. Ugly is a long way
    better than broken, and this is the branch that guarantees the hero never
    renders an <img> that 404s.

Offline-safe. A cached mark is never re-fetched, so a bake with no network
still resolves every club the site has published before, and only a club that
is BOTH new and unreachable falls through to the badge.
"""

import json
import os
import re
import struct
import unicodedata
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REGISTRY = os.path.join(ROOT, "data", "team-logos.json")
CACHE_REL = "/static/media/matchups/logos"
CACHE_DIR = os.path.join(ROOT, "static", "media", "matchups", "logos")
UA = {"User-Agent": "TrustMyRecord-bake/1.0 (+https://trustmyrecord.com)"}

# Under static/media/matchups on purpose: that is the one asset directory the
# daily Matchup of the Day workflow already `git add`s, so a club the site
# covers for the first time ships its mark in the same commit as its article
# with no change to a workflow file.

# A cached mark is never re-fetched, so this only governs a club the repo has
# never seen. Set TMR_LOGO_FETCH=0 to bake with no third-party call at all.
FETCH = os.environ.get("TMR_LOGO_FETCH", "1") not in ("0", "false", "no")

_registry = None
_index = {}


def slugify(v):
    v = unicodedata.normalize("NFKD", str(v or "")).encode("ascii", "ignore").decode()
    v = v.lower().replace("&", " and ")
    return re.sub(r"^-+|-+$", "", re.sub(r"[^a-z0-9]+", "-", v))


def _load():
    """Index every spelling of every club, dropping the ambiguous ones.

    "Bulldogs" is a dozen different college teams and "Colorado" is a Buffalo,
    an Avalanche and a Rockie, so a key that lands on more than one club inside
    a sport is deleted rather than resolved to whichever row was read first. A
    wrong logo is worse than the badge.
    """
    global _registry
    if _registry is not None:
        return
    try:
        with open(REGISTRY, "r", encoding="utf-8") as f:
            _registry = json.load(f)
    except Exception:                                             # noqa: BLE001
        _registry = {"sports": {}}
    for sport, blob in (_registry.get("sports") or {}).items():
        seen = {}
        for t in blob.get("teams") or []:
            keys = [t.get("display"), t.get("slug"), t.get("short"),
                    "%s %s" % (t.get("location") or "", t.get("nick") or ""),
                    t.get("location"), t.get("nick"), t.get("abbr")]
            for k in keys:
                k = slugify(k)
                if not k:
                    continue
                if k in seen and (seen[k] or {}).get("id") != t.get("id"):
                    seen[k] = None
                else:
                    seen.setdefault(k, t)
        _index[sport] = dict((k, v) for k, v in seen.items() if v)


def lookup(sport, *names):
    """First name that lands on exactly one club in this sport."""
    _load()
    table = _index.get((sport or "").lower()) or {}
    for n in names:
        t = table.get(slugify(n))
        if t:
            return t
    return None


def _png_size(path):
    """Intrinsic size, so the img reserves the right box and never shifts."""
    try:
        with open(path, "rb") as f:
            head = f.read(26)
        if head[:8] == b"\x89PNG\r\n\x1a\n":
            w, h = struct.unpack(">II", head[16:24])
            return int(w), int(h)
    except Exception:                                             # noqa: BLE001
        pass
    return 500, 500


def _cache(sport, team):
    """Download the club's mark once. Returns (site path, disk path) or None.

    The DARK variant, because a Game File hero is dark (tmr-theme-a.css sets
    --ed-bg-warm to #0E1620). Colorado's primary mark is a black buffalo and it
    disappeared into the card; the dark variant is the same badge redrawn to
    sit on a dark ground. A club with no dark variant falls back to its
    primary.
    """
    href = team.get("logo_dark") or team.get("logo")
    suffix = "-dark" if team.get("logo_dark") else ""
    ext = os.path.splitext((href or "").split("?")[0])[1].lower()
    if ext not in (".png", ".svg", ".webp"):
        ext = ".png"
    name = "%s-%s%s%s" % (team.get("id") or "x", team.get("slug") or "team",
                          suffix, ext)
    disk = os.path.join(CACHE_DIR, sport, name)
    rel = "%s/%s/%s" % (CACHE_REL, sport, name)
    if os.path.exists(disk) and os.path.getsize(disk) > 512:
        return rel, disk
    if not FETCH or not href:
        return None
    try:
        req = urllib.request.Request(href, headers=UA)
        with urllib.request.urlopen(req, timeout=25) as r:
            blob = r.read()
        if len(blob) < 512:
            return None
        os.makedirs(os.path.dirname(disk), exist_ok=True)
        with open(disk, "wb") as f:
            f.write(blob)
        return rel, disk
    except Exception:                                             # noqa: BLE001
        return None


def _badge(sport, label, initials, color, alt_color):
    """Last resort: the club's initials on its own colour, written to disk.

    Deliberately NOT a data: URI and not inline SVG - it goes through the same
    img element as a real mark so the card's geometry is identical either way,
    and a club that later joins the registry simply swaps the file for the logo
    with no template change.
    """
    key = slugify("%s-%s" % (sport, label)) or "team"
    disk = os.path.join(CACHE_DIR, "fallback", key + ".svg")
    rel = "%s/fallback/%s.svg" % (CACHE_REL, key)
    bg = color or "#0B2239"
    ink = alt_color or "#FFFFFF"
    if ink.lower() == bg.lower():
        ink = "#FFFFFF"
    svg = (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160" width="160" '
        'height="160" role="img" aria-label="%s"><title>%s</title>'
        '<circle cx="80" cy="80" r="76" fill="%s"/>'
        '<circle cx="80" cy="80" r="76" fill="none" stroke="%s" stroke-width="4" '
        'opacity=".9"/>'
        '<text x="80" y="103" text-anchor="middle" fill="%s" font-size="66" '
        'font-weight="800" letter-spacing="2" '
        'font-family="Barlow Condensed, Inter, Segoe UI, Arial, sans-serif">%s</text>'
        '</svg>' % (label, label, bg, ink, ink, initials))
    try:
        os.makedirs(os.path.dirname(disk), exist_ok=True)
        old = ""
        if os.path.exists(disk):
            with open(disk, "r", encoding="utf-8") as f:
                old = f.read()
        if old != svg:
            with open(disk, "w", encoding="utf-8") as f:
                f.write(svg)
    except Exception:                                             # noqa: BLE001
        return None
    return {"src": rel, "alt": "%s logo" % label, "w": 160, "h": 160,
            "kind": "fallback"}


def _initials(city, nick, abbr):
    if abbr and 2 <= len(abbr) <= 4:
        return abbr.upper()
    words = [w for w in re.split(r"\s+", "%s %s" % (city or "", nick or "")) if w]
    if not words:
        return "?"
    if len(words) == 1:
        return words[0][:2].upper()
    return (words[0][0] + words[-1][0]).upper()


def team_logo(sport, city=None, nick=None, full_name=None, authored=None,
              color=None):
    """The mark to print for one side of a fixture. Never returns None.

    `authored` is the record's own {src, alt} if it has one; it is used only
    when the registry has nothing, so a Game File can no longer ship a
    placeholder for a club whose real mark is known.
    """
    sport = (sport or "").lower()
    label = (full_name or ("%s %s" % (city or "", nick or ""))).strip() or "Team"
    team = lookup(sport, full_name, "%s %s" % (city or "", nick or ""), city, nick)

    if team:
        got = _cache(sport, team)
        if got:
            rel, disk = got
            w, h = _png_size(disk) if disk.endswith(".png") else (500, 500)
            return {"src": rel, "alt": "%s logo" % (team.get("display") or label),
                    "w": w, "h": h, "kind": "official"}

    if authored and authored.get("src"):
        src = str(authored["src"])
        on_disk = os.path.join(ROOT, src.lstrip("/"))
        if src.startswith("/") and os.path.exists(on_disk):
            return {"src": src, "alt": authored.get("alt") or ("%s logo" % label),
                    "w": 144, "h": 144, "kind": "authored"}

    return _badge(sport, label, _initials(city, nick, (team or {}).get("abbr")),
                  (team or {}).get("color") or color,
                  (team or {}).get("alt_color"))
