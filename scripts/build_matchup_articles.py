#!/usr/bin/env python3
"""
build_matchup_articles.py - bake TMR Game Files into the static site.

MATCHUP_OF_THE_DAY_PHASE1_20260810, daily automation PHASE2_20260811.

What it does
------------
Reads published Game Files from /api/matchups and writes:

    matchup-of-the-day/<slug>/index.html  one permanent article per Game File,
                                          slugged after what the game is about
    matchup-of-the-day/index.html         the daily hub + archive (markers)
    static/media/matchups/<slug>-*.svg    that article's original artwork
    matchups/index.html                   the earlier archive (markers)
    matchups/<sport>/index.html           earlier sport hubs (markers)
    sitemap.xml                           <!-- BEGIN_MATCHUP_URLS --> block

It does NOT write the homepage. The homepage link updates itself: the ticker
reads /api/matchups/today and follows the `url` the API returns, so featuring a
new article moves the link with no bake and no deploy.

Build only. Does NOT commit or deploy. Run from the repo root:

    python scripts/build_matchup_articles.py
    python scripts/build_matchup_articles.py --dry-run
    python scripts/build_matchup_articles.py --from-file drafts/g1000.json

THE TWO RULES THIS FILE EXISTS TO ENFORCE
-----------------------------------------
1. A PUBLISHED ARTICLE DIRECTORY IS NEVER DELETED BY THIS SCRIPT.

   Not when the selection changes, not when the API is unreachable, not when a
   record's status changes, not on a redeploy. This is the direct lesson from
   build_forum_threads.py, which pruned any thread directory whose per-thread
   fetch had failed and thereby served real, indexed URLs a 404 every time the
   API blipped (threads 69, 106 and 134 were deleted and re-created across the
   Jul 30 / Aug 8 prerender commits). A Game File is a permanent publication;
   deleting one has to be a deliberate human act, so this script only ever
   reports orphans and leaves them alone.

   Unpublishing is a discovery change: the article drops out of the sitemap and
   the hubs, and the URL keeps serving the article.

2. FAIL CLOSED, WRITE NOTHING ON A BAD READ.

   Every page is rendered into memory first. If any article fails to render, or
   the API's own count disagrees with what we received, the script exits
   non-zero having written nothing, and the last good bake stays live.

Idempotent: re-running replaces content between <!--MK:key--> markers.
"""

import argparse
import calendar as cal
import datetime as dt
import html
import json
import os
import re
import sys
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from schema_event import event_description, sports_event  # noqa: E402
from team_logos import team_logo  # noqa: E402

API = os.environ.get("TMR_API", "https://trustmyrecord-api.onrender.com/api")
SITE = "https://trustmyrecord.com"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

MATCHUPS_DIR = os.path.join(ROOT, "matchups")
MOTD_DIR = os.path.join(ROOT, "matchup-of-the-day")

# ---------------------------------------------------------------- superseded
#
# A published URL is never deleted here — that rule is absolute and is why this
# script only ever REPORTS orphans. But an article can be republished at a
# better address, and then the old directory is still on disk serving the same
# piece, which is duplicate content pointing at itself.
#
# The fix is a canonical, not a redirect: the old page keeps serving, and tells
# search engines which address is the real one. Both stay reachable, nothing
# 404s, and the link equity goes to the right URL.
#
#   "<old path>": "<new path>"
#
# mets-vs-braves-g1000 was minted by Phase 1, before the rule that a slug must
# describe the matchup rather than carry an id. It now lives at a slug naming
# the pitcher the piece is actually about.
SUPERSEDED = {
    "matchups/mlb/mets-vs-braves-g1000": "matchup-of-the-day/mets-braves-christian-scott-pitching-edge",
}
SITEMAP = os.path.join(ROOT, "sitemap.xml")
HOME = os.path.join(ROOT, "index.html")

def article_rel(article):
    """The article's path, relative to the repo root. ONE definition, because
    the URL appears in the file tree, the canonical tag, the hub cards, the
    JSON-LD, the prev/next links and the sitemap, and six copies of a path
    expression is six chances for them to disagree.

    Two shapes, and the row says which. An article created from 2026-08-11 has
    an angle and lives at /matchup-of-the-day/<slug>/, where the slug describes
    what the game is about. The handful created before that are at
    /matchups/<sport>/<slug>/, are indexed there, and STAY there: a published
    URL is permanent, and tidying the tree is not a good enough reason to 404
    something Google already has.
    """
    if article.get("angle_key"):
        return "matchup-of-the-day/%s" % article["slug"]
    return "matchups/%s/%s" % (article["sport"], article["slug"])


def article_href(article):
    return "/%s/" % article_rel(article)


def article_abs(article):
    return "%s/%s/" % (SITE, article_rel(article))


SPORT_LABEL = {
    "mlb": "MLB", "nba": "NBA", "nfl": "NFL", "nhl": "NHL",
    "soccer": "Soccer", "ncaaf": "College Football", "ncaab": "College Basketball",
}

# The governing body that actually stages the fixture, for the leagues where
# there is exactly one and we know it. College and soccer fixtures are staged by
# a conference or a federation that varies game to game, so they name no
# organizer rather than a guessed one. schema_event.organizer_node turns the
# name into a node with the league's homepage, or drops it.
SPORT_ORGANIZER = {
    "mlb": "Major League Baseball",
    "nba": "National Basketball Association",
    "nfl": "National Football League",
    "nhl": "National Hockey League",
}

# Only these hosts may appear in an article image. A Game File must not hotlink
# a photograph from wherever the research happened to find it.
ALLOWED_IMAGE_PREFIXES = ("/static/", SITE + "/static/", "https://trustmyrecord-api.onrender.com/api/share/og")

# Hosts a build may DOWNLOAD from. Not hosts a page may link to — a page links to
# /static/ and nothing else. An article's images are fetched once, at bake time,
# and committed, so a published piece has no third-party dependency at render
# time and cannot have an image change or disappear underneath it later.
ALLOWED_FETCH_HOSTS = ("https://midfield.mlbstatic.com/", "https://www.mlbstatic.com/",
                       "https://a.espncdn.com/")

# A downloaded file has to actually be the kind of image it claims to be. Size
# alone is not a check: an error page is several KB of perfectly valid bytes.
MAGIC = {
    ".png": (bytes.fromhex("89504e470d0a1a0a"),),
    ".svg": (b"<svg", b"<?xml"),
    ".jpg": (bytes.fromhex("ffd8ff"),),
}

DISPLAY_TZ = "America/Los_Angeles"


# --------------------------------------------------------------------------- io

def get(url, attempts=3):
    """Render's free tier throws occasional transient 500s; a single hiccup must
    not abort a bake and leave the site a cron tick behind."""
    import time
    last = None
    for i in range(attempts):
        if i:
            time.sleep(2 * i)
        try:
            req = urllib.request.Request(url, headers={"Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=45) as r:
                return json.load(r)
        except Exception as err:      # noqa: BLE001 - retried, then re-raised
            last = err
    raise last


def esc(value):
    return html.escape("" if value is None else str(value), quote=True)


def read(path):
    with open(path, encoding="utf-8") as f:
        return f.read()


def write(path, text):
    """Write, PRESERVING the file's existing line endings.

    This repo has mixed line endings and core.autocrlf=false, so index.html is
    stored with CRLF. Writing it back with newline="\\n" changes every line in
    the file: `git diff --numstat` went 1298/1298 for a change that added
    nothing. That is unreviewable on its own, and worse, this script runs inside
    the 30-minute prerender cron alongside a job that edits the same file — two
    writers, one of them rewriting the whole document every tick, is a merge
    conflict generator and an enormous pointless Pages rebuild.

    A NEW file gets LF, which is what every other generator here emits.
    """
    os.makedirs(os.path.dirname(path), exist_ok=True)
    newline = "\n"
    if os.path.exists(path):
        with open(path, "rb") as f:
            existing = f.read()
        crlf = existing.count(b"\r\n")
        lf = existing.count(b"\n") - crlf
        if crlf > lf:
            newline = "\r\n"
    with open(path, "w", encoding="utf-8", newline=newline) as f:
        f.write(text)
    # C: on this machine intermittently writes files as all-NULL bytes. A Game
    # File that bakes to 40KB of \x00 would pass every downstream check that
    # only looks at file size.
    with open(path, "rb") as f:
        head = f.read(64)
    if head and set(head) == {0}:
        raise RuntimeError(f"{path} wrote as NULL bytes - refusing to continue")


def replace_marker(text, key, payload, path_for_error):
    """Replace <!--MK:key-->...<!--/MK:key--> with payload."""
    pattern = re.compile(
        r"(<!--MK:%s-->)(.*?)(<!--/MK:%s-->)" % (re.escape(key), re.escape(key)),
        re.S,
    )
    if not pattern.search(text):
        raise RuntimeError(f"marker MK:{key} not found in {path_for_error}")
    return pattern.sub(lambda m: m.group(1) + payload + m.group(3), text, count=1)


# ------------------------------------------------------------------- datetime

def parse_iso(value):
    if not value:
        return None
    text = str(value).replace("Z", "+00:00")
    try:
        parsed = dt.datetime.fromisoformat(text)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=dt.timezone.utc)
    return parsed


def to_display(value):
    """UTC instant -> the site's display timezone, without pulling in a dep."""
    parsed = parse_iso(value)
    if parsed is None:
        return None
    try:
        from zoneinfo import ZoneInfo
        return parsed.astimezone(ZoneInfo(DISPLAY_TZ))
    except Exception:                                   # noqa: BLE001
        return parsed.astimezone(dt.timezone.utc)


MONTHS = ("January", "February", "March", "April", "May", "June", "July",
          "August", "September", "October", "November", "December")


def human_date(value):
    """Built by hand rather than with %-d / %#d, which differ between glibc and
    Windows: this script runs on a developer's Windows box and on ubuntu-latest
    in the prerender workflow, and the byte-for-byte output has to match or every
    run produces a spurious diff and a pointless Pages rebuild."""
    shifted = to_display(value)
    if not shifted:
        return ""
    return "%s %d, %d" % (MONTHS[shifted.month - 1], shifted.day, shifted.year)


def human_datetime(value):
    shifted = to_display(value)
    if not shifted:
        return ""
    hour = shifted.hour % 12 or 12
    meridiem = "AM" if shifted.hour < 12 else "PM"
    return "%s at %d:%02d %s%s" % (
        human_date(value), hour, shifted.minute, meridiem,
        " PT" if DISPLAY_TZ == "America/Los_Angeles" else " UTC")


def iso_date(value):
    parsed = parse_iso(value)
    return parsed.date().isoformat() if parsed else ""


# =============================================================== components ==
#
# The Game File renders as a sequence of SECTIONS, each with its own surface
# environment, rather than one column of cards. Every chart below is HTML and
# CSS: the numbers stay in the DOM as selectable, crawlable, screen-readable
# text, they reflow on a phone instead of letterboxing, and the page makes no
# extra requests to draw them.

SOURCE_SHORT = {
    "statsapi": "MLB Data",
    "betlegend-pro": "BetLegend Pro",
    "trendspotter": "Trend Spotter",
    "tmr-sim": "TMR Simulator",
    "actionnetwork": "Market feed",
    "fanduel": "FanDuel props",
    "tmr-editorial": "TMR Research",
    "espn": "ESPN Data",
    "draftkings": "DraftKings",
    "tmr-derived": "TMR Calculation",
}

SOURCE_LABEL = {
    "statsapi": "MLB Stats API (official league data)",
    "betlegend-pro": "BetLegend Pro historical database (TMR)",
    "trendspotter": "TMR Trend Spotter",
    "tmr-sim": "TMR MLB Simulator",
    "actionnetwork": "Market odds feed",
    "fanduel": "FanDuel player props feed",
    "tmr-editorial": "TrustMyRecord Research (editorial analysis)",
    "espn": "ESPN public data APIs (scoreboard, team record, team statistics)",
    "draftkings": "DraftKings odds board",
    "tmr-derived": "TrustMyRecord calculation from the sourced inputs shown",
}


def safe_href(href):
    """Internal, resolvable links only.

    tests/seo-indexability-regression-test.js fails the build if any page links
    to a path that does not exist, and it is right to: TMR must never hand
    Googlebot a 404. Anything not site-relative is dropped rather than shipped.
    """
    href = str(href or "").strip()
    if href.startswith("/") and not href.startswith("//"):
        return href
    return None


def src_badge(source):
    if not source:
        return ""
    return '<span class="gf-src" data-s="%s">%s</span>' % (
        esc(source), esc(SOURCE_SHORT.get(source, source)))


def share(part, whole):
    """Share of a pair, clamped so a zero never renders an invisible bar."""
    try:
        part, whole = float(part), float(whole)
    except (TypeError, ValueError):
        return 50.0
    if whole <= 0:
        return 50.0
    return max(3.0, min(97.0, part / whole * 100.0))


# ------------------------------------------------------------------ blocks ---

def b_prose(block):
    return "<p>%s</p>" % esc(block.get("text"))


def b_h3(block):
    return "<h3>%s</h3>" % esc(block.get("text"))


def b_list(block):
    items = []
    for i in block.get("items") or []:
        text = i.get("text") if isinstance(i, dict) else i
        note = ""
        if isinstance(i, dict) and i.get("sample"):
            note = ' <span class="gf-src">%s</span>' % esc(i["sample"])
        items.append("<li>%s%s</li>" % (esc(text), note))
    return "<ul>%s</ul>" % "".join(items)


def b_herolines(block):
    """Consumed by the hero, not rendered in place.

    It is still authored as a block, and still carries provenance_keys, because
    the line under each team name is numbers ("52-67 / 27-33 on the road"). A
    hero assembled from an un-gated field would be the one place on the page
    where a figure could appear unsourced.
    """
    return ""


def b_rail(block):
    """Edge-to-edge stat rail: the research half of the hero."""
    cells = []
    for i in block.get("items") or []:
        tone = (' data-t="%s"' % esc(i["tone"])) if i.get("tone") else ""
        cells.append('<div class="gf-railcell"%s><b>%s</b><span>%s</span></div>'
                     % (tone, esc(i.get("value")), esc(i.get("label"))))
    return '<div class="gf-rail">%s</div>' % "".join(cells)


def b_trendboard(block):
    """The scannable core: big number, what it is, then where it came from."""
    out = []
    for cat in block.get("categories") or []:
        cards = []
        for it in cat.get("items") or []:
            meta = []
            if it.get("sample"):
                meta.append(esc(it["sample"]))
            if it.get("timeframe"):
                meta.append(esc(it["timeframe"]))
            cards.append(
                '<div class="gf-tcard"%s><b>%s</b>'
                '<span class="gf-tcard-l">%s</span>'
                '<span class="gf-tcard-m">%s%s</span></div>' % (
                    (' data-t="%s"' % esc(it["tone"])) if it.get("tone") else "",
                    esc(it.get("value")), esc(it.get("label")),
                    src_badge(it.get("source")),
                    ("<span>" + " &middot; ".join(meta) + "</span>") if meta else ""))
        out.append('<div class="gf-tgroup"><h3>%s</h3><div class="gf-tcards">%s</div></div>'
                   % (esc(cat.get("name")), "".join(cards)))
    note = ('<p class="gf-chart-note">%s</p>' % esc(block.get("note"))) if block.get("note") else ""
    # Wrapped so the groups can be laid out two-up on a wide screen. Eight
    # groups stacked in one column was the tallest single block on the page,
    # and a stat board is scanned rather than read, so a second column costs
    # the reader nothing.
    return '<div class="gf-tboard">%s</div>%s' % ("".join(out), note)


def b_bars(block):
    """Diverging comparison bars. Bar length is each side's share of the pair,
    so the ratio is visible; the literal value sits beside it."""
    rows = []
    for r in block.get("rows") or []:
        a_raw = r.get("away_n") or 0
        h_raw = r.get("home_n") or 0
        share_a = share(a_raw, a_raw + h_raw)
        better = r.get("better")
        rows.append(
            '<div class="gf-bar">'
            '<div class="gf-bar-s gf-bar-s--a%s"><span class="gf-bar-v">%s</span>'
            '<span class="gf-bar-t" style="width:%.1f%%"></span></div>'
            '<div class="gf-bar-k">%s</div>'
            '<div class="gf-bar-s gf-bar-s--h%s"><span class="gf-bar-t" style="width:%.1f%%"></span>'
            '<span class="gf-bar-v">%s</span></div></div>' % (
                " is-better" if better == "away" else "", esc(r.get("away")), share_a * 0.88,
                esc(r.get("key")),
                " is-better" if better == "home" else "", (100 - share_a) * 0.88, esc(r.get("home"))))
    legend = (
        '<div class="gf-legend">'
        '<span><i class="gf-key gf-key--a"></i>%s</span>'
        '<span><i class="gf-key gf-key--h"></i>%s</span></div>' % (
            esc(block.get("away_label")), esc(block.get("home_label"))))
    head = ('<p class="gf-chart-t">%s%s</p>' % (
        esc(block.get("title") or ""), src_badge(block.get("source")))) if block.get("title") else ""
    note = ('<p class="gf-chart-note">%s</p>' % esc(block.get("note"))) if block.get("note") else ""
    return '<div class="gf-chart">%s<div class="gf-bars">%s</div>%s%s</div>' % (
        head, "".join(rows), legend, note)


def b_benchmark(block):
    """Actual win rate against the market's break-even, on one shared axis.

    This is the chart that explains how 947-825 loses money: the actual marker
    sits LEFT of the expected marker, and that gap is the ROI. A bar chart of
    the win rate alone cannot show it, which is why this component exists.
    """
    lo = float(block.get("min", 48))
    hi = float(block.get("max", 58))

    def x(v):
        return max(0.0, min(100.0, (float(v) - lo) / (hi - lo) * 100.0))

    rows = []
    for r in block.get("rows") or []:
        act, exp = float(r["actual"]), float(r["expected"])
        rows.append(
            '<div class="gf-bench-row" data-t="%s">'
            '<div class="gf-bench-who">%s<small>%s</small></div>'
            '<div class="gf-bench-track">'
            '<span class="gf-bench-fill" style="width:%.1f%%"></span>'
            '<span class="gf-bench-act" style="left:%.1f%%"></span>'
            '<span class="gf-bench-tag gf-bench-tag--act" style="left:%.1f%%">%s%% actual</span>'
            '<span class="gf-bench-exp" style="left:%.1f%%"></span>'
            '<span class="gf-bench-tag gf-bench-tag--exp" style="left:%.1f%%">%s%% break-even</span>'
            '</div>'
            '<div class="gf-bench-roi">%s<small>Return</small></div></div>' % (
                esc(r.get("tone", "")), esc(r.get("who")), esc(r.get("sub")),
                x(act), x(act), x(act), esc(r.get("actual")),
                x(exp), x(exp), esc(r.get("expected")), esc(r.get("roi"))))
    head = '<p class="gf-chart-t">%s%s</p>' % (
        esc(block.get("title") or ""), src_badge(block.get("source")))
    note = ('<p class="gf-chart-note">%s</p>' % esc(block.get("note"))) if block.get("note") else ""
    return '<div class="gf-chart">%s<div class="gf-bench">%s</div>%s</div>' % (head, "".join(rows), note)


def b_timeline(block):
    games = []
    for g in block.get("games") or []:
        games.append('<div class="gf-tlg" data-w="%s"><b>%s</b><span>%s</span><span>%s</span></div>'
                     % (esc(g.get("winner")), esc(g.get("score")), esc(g.get("date")), esc(g.get("site"))))
    head = '<p class="gf-chart-t">%s%s</p>' % (
        esc(block.get("title") or ""), src_badge(block.get("source")))
    note = ('<p class="gf-chart-note">%s</p>' % esc(block.get("note"))) if block.get("note") else ""
    return '<div class="gf-chart">%s<div class="gf-tl">%s</div>%s</div>' % (head, "".join(games), note)


def b_form(block):
    rows = []
    for t in block.get("teams") or []:
        seq = "".join('<i data-r="%s">%s</i>' % (esc(r), esc(r)) for r in t.get("results") or [])
        rows.append('<div class="gf-form"><span class="gf-form-who">%s</span>'
                    '<span class="gf-form-seq">%s</span>'
                    '<span class="gf-form-sum">%s</span></div>' % (
                        esc(t.get("name")), seq, esc(t.get("summary"))))
    head = '<p class="gf-chart-t">%s%s</p>' % (
        esc(block.get("title") or ""), src_badge(block.get("source")))
    note = ('<p class="gf-chart-note">%s</p>' % esc(block.get("note"))) if block.get("note") else ""
    return '<div class="gf-chart">%s%s%s</div>' % (head, "".join(rows), note)


def b_showdown(block):
    """Pitcher feature cards. The monogram behind each card stands in for a
    photograph we cannot license: obviously a graphic, not a fake picture."""
    cards = []
    for side in ("away", "home"):
        p = block.get(side) or {}
        stats = []
        for s in p.get("stats") or []:
            fill = ('<em><i style="width:%.0f%%"></i></em>' % float(s["fill"])) if s.get("fill") else ""
            stats.append('<div class="gf-showstat"><b>%s</b><span>%s</span>%s</div>'
                         % (esc(s.get("value")), esc(s.get("label")), fill))
        # The photograph, when the league has one. `mono` stays as the
        # fallback: a September call-up with no headshot gets the monogram card
        # rather than a broken image or an empty frame.
        photo = p.get("photo") or {}
        shot = ""
        if photo.get("src"):
            check_image(photo["src"], "starter headshot")
            if not photo.get("alt"):
                raise RuntimeError("headshot %s has no alt text" % photo["src"])
            shot = ('<img class="gf-showshot" src="%s" alt="%s" width="%s" height="%s" '
                    'loading="lazy" decoding="async">' % (
                        esc(photo["src"]), esc(photo["alt"]),
                        esc(photo.get("width", 480)), esc(photo.get("height", 480))))

        cards.append(
            '<div class="gf-showcard%s" data-t="%s" data-mono="%s">'
            '%s<div class="gf-showwho"><p class="gf-showname">%s</p>'
            '<p class="gf-showmeta">%s</p></div>'
            '<div class="gf-showstats">%s</div></div>' % (
                " has-shot" if shot else "", side, esc(p.get("mono")), shot,
                esc(p.get("name")), esc(p.get("meta")), "".join(stats)))
    note = ('<p class="gf-chart-note">%s</p>' % esc(block.get("note"))) if block.get("note") else ""
    return '<div class="gf-show">%s</div>%s' % ("".join(cards), note)


def b_call(block):
    body = "".join("<p>%s</p>" % esc(p) for p in (block.get("paragraphs") or [block.get("text", "")]))
    extra = ('<span class="gf-src">%s</span>' % esc(block["sample"])) if block.get("sample") else ""
    return '<aside class="gf-call"><p class="gf-call-t">%s%s%s</p>%s</aside>' % (
        esc(block.get("tag") or "TMR Research"), src_badge(block.get("source")), extra, body)


def b_verdict(block):
    conf = int(block.get("confidence", 0))
    pips = "".join('<i class="%s"></i>' % ("on" if i < conf else "") for i in range(5))
    why = "".join("<li>%s</li>" % esc(x) for x in block.get("why") or [])
    chg = "".join("<li>%s</li>" % esc(x) for x in block.get("changes") or [])
    return (
        '<div class="gf-verdict">'
        '<div class="gf-verdict-l">'
        '<p class="gf-verdict-k">TMR lean</p>'
        '<p class="gf-verdict-team">%s</p>'
        '<p class="gf-verdict-k">Confidence &middot; %s</p>'
        '<div class="gf-conf">%s</div>'
        '<p class="gf-verdict-k" style="margin-top:14px;letter-spacing:.04em;text-transform:none">%s</p>'
        '</div>'
        '<div class="gf-verdict-r"><h3>Why</h3><ul>%s</ul>'
        '<h3>What would change it</h3><ul>%s</ul></div></div>' % (
            esc(block.get("team")), esc(block.get("confidence_label")), pips,
            esc(block.get("note") or ""), why, chg))


def b_cards(block):
    """Graphic player cards. Intrinsic dimensions are required: a card that
    resizes on decode is a layout shift on the busiest part of the page."""
    out = []
    for c in block.get("items") or []:
        src = c.get("src")
        if not str(src or "").startswith("/static/"):
            raise RuntimeError("player card src must be a TMR-controlled /static/ path: %r" % src)
        if not c.get("alt"):
            raise RuntimeError("player card %s has no alt text" % src)
        out.append('<img src="%s" alt="%s" width="520" height="190" loading="lazy" decoding="async">'
                   % (esc(src), esc(c.get("alt"))))
    return '<div class="gf-cards">%s</div>' % "".join(out)


def b_asidestats(block):
    rows = "".join('<div class="gf-aside-row"><span>%s</span><b>%s</b></div>'
                   % (esc(r.get("label")), esc(r.get("value")))
                   for r in block.get("rows") or [])
    return '<div class="gf-aside-card"><h4>%s</h4>%s</div>' % (
        esc(block.get("heading") or "Key numbers"), rows)


def b_tools(block):
    items = []
    for link in block.get("links") or []:
        href = safe_href(link.get("href"))
        if not href:
            continue
        items.append('<li><a href="%s">%s</a></li>' % (esc(href), esc(link.get("text"))))
    if not items:
        return ""
    return '<div class="gf-tools"><p>%s</p><ul>%s</ul></div>' % (
        esc(block.get("heading") or "Run this research yourself"), "".join(items))


RENDERERS = {
    "p": b_prose, "h3": b_h3, "list": b_list, "rail": b_rail, "herolines": b_herolines,
    "trendboard": b_trendboard, "bars": b_bars, "benchmark": b_benchmark,
    "timeline": b_timeline, "form": b_form, "showdown": b_showdown,
    "call": b_call, "verdict": b_verdict, "toollinks": b_tools,
    "cards": b_cards, "asidestats": b_asidestats,
}


def render_block(block):
    kind = (block or {}).get("type", "p")
    fn = RENDERERS.get(kind)
    if not fn:
        raise RuntimeError("unknown block type: %r" % kind)
    return fn(block)


def module_id(module, index):
    raw = module.get("id") or module.get("module") or module.get("heading") or ("section-%d" % index)
    slug = re.sub(r"[^a-z0-9]+", "-", str(raw).lower()).strip("-")
    return slug or ("section-%d" % index)


def render_body(article):
    """Render the sections, the jump nav, the hero rail and the hero lines.

    The `hero-rail` module is lifted OUT of the body flow and rendered into the
    hero. It is still authored as a normal module so the publish gate sees its
    numbers and demands provenance for them.
    """
    out, nav, rail, hero = [], [], "", {}
    for index, module in enumerate(article.get("body_json") or []):
        if module.get("module") == "hero-rail":
            for b in module.get("blocks") or []:
                if (b or {}).get("type") == "herolines":
                    hero = b
                else:
                    rail += render_block(b)
            continue
        mid = module_id(module, index)
        heading = module.get("heading") or module.get("module") or ""
        nav.append('<li><a href="#%s">%s</a></li>' % (esc(mid), esc(module.get("nav") or heading)))
        # A block may declare slot:"aside" to sit in the right-hand rail. It stays
        # inside `blocks` rather than a separate `aside` array on purpose: the
        # publish gate walks body_json[].blocks[], so anything moved out of that
        # array would be rendered on a live page without its numbers ever being
        # checked. Layout choice must not create a hole in the guarantee.
        main_bs = [b for b in module.get("blocks") or [] if (b or {}).get("slot") != "aside"]
        aside_bs = [b for b in module.get("blocks") or [] if (b or {}).get("slot") == "aside"]
        sub = ('<p class="gf-sect-sub">%s</p>' % esc(module.get("sub"))) if module.get("sub") else ""
        mark = (' data-mark="%s"' % esc(module["mark"])) if module.get("mark") else ""
        aside = "".join(render_block(b) for b in aside_bs)

        # ---- prose and data side by side, not stacked -----------------------
        #
        # The reading measure is ~36rem inside a ~74rem wrap, so on a desktop the
        # right half of the page was empty on every paragraph while the charts
        # queued up underneath. That is where the length was coming from: not
        # type size — which has already been cut twice — but a single column
        # using half the available width.
        #
        # Each section is now two streams, prose left and visuals right, with
        # ORDER PRESERVED WITHIN EACH STREAM, which is how a magazine sets a
        # feature and keeps it readable. Sections that are all prose or all
        # visuals (the trend board) are left alone and run full width; splitting
        # those would only make a column of nothing.
        PROSE = {"p", "h3", "list", "call"}
        prose_bs = [b for b in main_bs if (b or {}).get("type", "p") in PROSE]
        data_bs = [b for b in main_bs if (b or {}).get("type", "p") not in PROSE]

        if prose_bs and data_bs and not aside_bs:
            body = ('<div class="gf-duo">'
                    '<div class="gf-duo-read">%s</div>'
                    '<div class="gf-duo-data">%s</div></div>' % (
                        "".join(render_block(b) for b in prose_bs),
                        "".join(render_block(b) for b in data_bs)))
        else:
            blocks = "".join(render_block(b) for b in main_bs)
            body = ('<div class="gf-split"><div class="gf-split-main">%s</div>'
                    '<div class="gf-split-aside">%s</div></div>' % (blocks, aside)) if aside else blocks
        out.append(
            '<section class="gf-sect" id="%s" data-env="%s"%s><div class="gf-wrap">'
            '<div class="gf-sect-head"><h2>%s</h2>%s</div>%s%s</div></section>' % (
                esc(mid), esc(module.get("env", "flat")), mark, esc(heading),
                src_badge(module.get("source")), sub, body))
    return "".join(out), "".join(nav), rail, hero


def count_trends(article):
    """How many trend cards the board carries. Read off the article the cover is
    baking, never typed in: a marketing number that drifts from the page is the
    small lie this whole system exists to prevent."""
    n = 0
    for module in article.get("body_json") or []:
        for block in module.get("blocks") or []:
            if (block or {}).get("type") != "trendboard":
                continue
            for cat in block.get("categories") or []:
                n += len(cat.get("items") or [])
    return n


def check_image(url, what):
    if not url:
        raise RuntimeError("%s is missing" % what)
    if not str(url).startswith(ALLOWED_IMAGE_PREFIXES):
        raise RuntimeError(
            "%s points at %r, which is not a TMR-controlled path. Game Files do not "
            "hotlink third-party imagery." % (what, url))
    return url


def absolute(url):
    return url if str(url).startswith("http") else SITE + str(url)


def breadcrumb_items(article, sport, sport_label, matchup):
    """Breadcrumbs that match the URL the reader is actually on. A trail
    claiming Home > Matchups > MLB on a page served from /matchup-of-the-day/
    is a structured-data error and, worse, a link to a section the page is not
    in."""
    site = SITE
    if article.get("angle_key"):
        return [
            {"@type": "ListItem", "position": 1, "name": "Home", "item": site + "/"},
            {"@type": "ListItem", "position": 2, "name": "Matchup of the Day",
             "item": site + "/matchup-of-the-day/"},
            {"@type": "ListItem", "position": 3, "name": matchup},
        ]
    return [
        {"@type": "ListItem", "position": 1, "name": "Home", "item": site + "/"},
        {"@type": "ListItem", "position": 2, "name": "Matchups", "item": site + "/matchups/"},
        {"@type": "ListItem", "position": 3, "name": sport_label,
         "item": "%s/matchups/%s/" % (site, sport)},
        {"@type": "ListItem", "position": 4, "name": matchup},
    ]


def breadcrumb_html(article, sport, sport_label):
    sep = ' <span aria-hidden="true">&rsaquo;</span>\n        '
    if article.get("angle_key"):
        return ('<a href="/">Home</a>' + sep
                + '<a href="/matchup-of-the-day/">Matchup of the Day</a>'
                + ' <span aria-hidden="true">&rsaquo;</span>')
    return ('<a href="/">Home</a>' + sep
            + '<a href="/matchups/">Matchups</a>' + sep
            + '<a href="/matchups/%s/">%s</a>' % (esc(sport), esc(sport_label))
            + ' <span aria-hidden="true">&rsaquo;</span>')


def collect_media(articles):
    """Every (src, fetch_from) pair the published set needs, de-duplicated.

    Assets are keyed by their own path, not by article, so a pitcher who starts
    twenty Game Files is downloaded once and shared by all of them.
    """
    wanted = {}

    def walk(node):
        if isinstance(node, dict):
            src, remote = node.get("src"), node.get("fetch_from")
            if src and remote:
                wanted[src] = remote
            for v in node.values():
                walk(v)
        elif isinstance(node, list):
            for v in node:
                walk(v)

    for a in articles:
        walk(a.get("body_json") or [])
    return wanted


def fetch_media(wanted):
    """Download anything not already in the tree. Returns how many were new.

    NEVER re-downloads and never deletes. An asset already committed is the one
    the published article is showing; re-fetching it would let a CDN change the
    picture under a piece that has already been read, and would churn the repo
    on every bake for no reason.
    """
    added = 0
    for src, remote in sorted(wanted.items()):
        if not src.startswith("/static/"):
            sys.exit("ABORT: media src %r is not a /static/ path" % src)
        if not remote.startswith(ALLOWED_FETCH_HOSTS):
            sys.exit("ABORT: refusing to download %r - host is not on the allow-list" % remote)

        path = os.path.join(ROOT, src.lstrip("/").replace("/", os.sep))
        if os.path.exists(path) and os.path.getsize(path) > 0:
            continue

        try:
            req = urllib.request.Request(remote, headers={"User-Agent": "TrustMyRecord/1.0 (+%s)" % SITE})
            with urllib.request.urlopen(req, timeout=45) as r:
                blob = r.read()
        except Exception as err:                        # noqa: BLE001
            sys.exit("ABORT: could not download %s (%s). Nothing written; the "
                     "last good bake stays live." % (remote, err))

        ext = os.path.splitext(path)[1].lower()
        expected = MAGIC.get(ext)
        if not blob:
            sys.exit("ABORT: %s came back empty" % remote)
        if expected and not any(blob.lstrip()[:16].startswith(m) for m in expected):
            sys.exit("ABORT: %s did not return a %s (got %r). An error page is "
                     "valid bytes; it is not an image." % (remote, ext, blob[:24]))

        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "wb") as f:
            f.write(blob)
        print("media  %-58s %7d bytes" % (src, len(blob)))
        added += 1
    return added


def graphics_spec(article):
    """The artwork brief, read off the article the bake is about to write.

    Deliberately derived from body_json rather than passed alongside it. The
    hero already carries the club colours and the pitching section already
    carries the two starters, so taking the brief from there means the artwork
    and the article cannot disagree — there is only one copy of each value. It
    also keeps the API payload from having to grow a graphics field.
    """
    spec = {"venue_name": article.get("venue_name"), "venue_city": ""}
    for module in article.get("body_json") or []:
        for block in module.get("blocks") or []:
            kind = (block or {}).get("type")
            if kind == "herolines":
                spec["away_color"] = block.get("away_color")
                spec["home_color"] = block.get("home_color")
                spec["away_team"] = ("%s %s" % (block.get("away_city", ""), block.get("away_nick", ""))).strip()
                spec["home_team"] = ("%s %s" % (block.get("home_city", ""), block.get("home_nick", ""))).strip()
            elif kind == "showdown":
                for side in ("away", "home"):
                    p = block.get(side) or {}
                    if not p.get("name"):
                        continue
                    spec[side] = {
                        "name": p.get("name"),
                        "mono": p.get("mono"),
                        "team": spec.get("%s_team" % side) or "",
                        "role": "Starting pitcher",
                        "hand": "Left-handed" if str(p.get("meta", "")).startswith("LHP") else "Right-handed",
                        "note": "Tonight's starter",
                    }
            elif kind == "cards":
                # A `cards` block names the people it is drawing, so the artwork
                # is generated from the article rather than being a second copy
                # of the same facts kept somewhere else. Football has no
                # licensable headshot feed, which is exactly the case
                # player_card() was written for and then kept for.
                for item in block.get("items") or []:
                    if not (item or {}).get("src") or not item.get("name"):
                        continue
                    spec.setdefault("cards", []).append({
                        "src": item["src"],
                        "name": item["name"],
                        "mono": item.get("mono") or "",
                        "team": item.get("team") or "",
                        "role": item.get("role") or "",
                        "note": item.get("note") or "",
                        "sample": item.get("sample") or "",
                        "accent": item.get("accent_color") or spec.get("home_color") or "#B3A369",
                    })
    return spec


def render_article(article, provenance, neighbours):
    sport = article["sport"]
    sport_label = SPORT_LABEL.get(sport, sport.upper())
    url = article_abs(article)
    matchup = "%s vs. %s" % (article["away_team"], article["home_team"])

    og_image = absolute(check_image(article.get("og_image_url"), "og_image_url"))
    # The hero artwork is now RENDERED, not merely recorded. Phase 1 validated
    # hero_image_alt and then never emitted an <img>, so every article carried
    # alt text for a picture that was not on the page.
    hero_image = check_image(article.get("hero_image_url"), "hero_image_url")
    hero_alt = article.get("hero_image_alt")
    if not hero_alt:
        raise RuntimeError("hero_image_alt is required (social + image search)")

    published = article.get("published_at")
    modified = article.get("content_modified_at") or published
    body_html, nav_html, rail_html, hero = render_body(article)
    if not body_html:
        raise RuntimeError("article %s has no body modules" % article["slug"])

    graph = [
        {
            "@type": "Article",
            "@id": url + "#article",
            "mainEntityOfPage": {"@type": "WebPage", "@id": url},
            "headline": article.get("h1") or matchup,
            "description": article.get("meta_description") or "",
            "image": [og_image],
            "datePublished": parse_iso(published).isoformat() if parse_iso(published) else None,
            "dateModified": parse_iso(modified).isoformat() if parse_iso(modified) else None,
            "author": {"@type": "Organization", "name": "TrustMyRecord Research",
                       "url": SITE + "/about/research/"},
            "publisher": {"@type": "Organization", "name": "TrustMyRecord", "url": SITE + "/",
                          "logo": {"@type": "ImageObject", "url": SITE + "/static/og/og-home.png"}},
            "isAccessibleForFree": True,
        },
        {
            "@type": "BreadcrumbList",
            "@id": url + "#breadcrumbs",
            "itemListElement": breadcrumb_items(article, sport, sport_label, matchup),
        },
    ]

    # SportsEvent, added 2026-08-19.
    #
    # The Article node describes the WRITING; it says nothing about the fixture
    # the writing is about. Every one of these pages is a preview of a specific,
    # dated, located game between two named clubs, and that is a thing
    # schema.org has a type for. Emitting it gives search engines the fixture as
    # data rather than as prose to be guessed at, and it is the honest
    # description of the page.
    #
    # It is emitted only when the facts that make an event an event are all
    # present and real - both clubs, and a first pitch we actually hold. A
    # SportsEvent with an invented startDate would be worse than none, so a
    # missing game_time_utc means the node is simply left out. The venue is
    # optional and included when known.
    event_start = parse_iso(article.get("game_time_utc"))
    if event_start and article.get("away_team") and article.get("home_team"):
        # The dek is written about this fixture, so it is the best description
        # we have. When a Game File has no dek and no meta description the node
        # still gets a real one, composed from the fixture facts by the same
        # builder the MLB matchup pages use.
        summary = (article.get("dek") or article.get("meta_description") or "").strip()
        event = sports_event(
            url=url,
            node_id=url + "#event",
            away=article["away_team"],
            home=article["home_team"],
            sport=sport_label,
            description=summary or event_description(
                article["away_team"], article["home_team"],
                date_long=human_date(article.get("game_time_utc")),
                venue=article.get("venue_name"),
            ),
            start_iso=event_start.isoformat(),
            venue=article.get("venue_name"),
            organizer=SPORT_ORGANIZER.get(sport),
            # No game-state field reaches this script - `status` on the payload
            # is the publication state of the Game File, not the state of the
            # fixture - so eventStatus is left to its EventScheduled default
            # rather than derived from a field that means something else.
            image=absolute(article["hero_image_url"]) if article.get("hero_image_url") else None,
        )
        graph.append(event)
        graph[0]["about"] = {"@id": url + "#event"}

    graph[0] = {k: v for k, v in graph[0].items() if v is not None}
    jsonld = json.dumps({"@context": "https://schema.org", "@graph": graph},
                        indent=2, ensure_ascii=False)

    sources = sorted({(p.get("source") or "").strip() for p in provenance if p.get("source")})
    retrieved = [parse_iso(p.get("retrieved_at")) for p in provenance if parse_iso(p.get("retrieved_at"))]
    counts = {}
    for row in provenance:
        counts[row.get("claim_kind") or "fact"] = counts.get(row.get("claim_kind") or "fact", 0) + 1
    source_items = "".join("<li>%s</li>" % esc(SOURCE_LABEL.get(s, s)) for s in sources)
    research_window = human_datetime(max(retrieved).isoformat()) if retrieved else ""

    prev_a, next_a = neighbours
    nav_bits = []
    if prev_a:
        nav_bits.append('<a href="%s">&larr; Previous Game File: %s vs. %s</a>' % (
            esc(article_href(prev_a)), esc(prev_a["away_team"]), esc(prev_a["home_team"])))
    if next_a:
        nav_bits.append('<a href="%s">Next Game File: %s vs. %s &rarr;</a>' % (
            esc(article_href(next_a)), esc(next_a["away_team"]), esc(next_a["home_team"])))

    postgame_html = ""
    postgame = article.get("postgame_json")
    if postgame:
        pg = "".join(render_block(b) for b in (postgame.get("blocks") or []))
        postgame_html = (
            '<section class="gf-sect" data-env="raised" id="postgame"><div class="gf-wrap">'
            '<div class="gf-sect-head"><h2>Postgame update</h2></div>'
            '<p class="gf-sect-sub">Added after the game. The pregame analysis below is unchanged '
            'from what we published before first pitch.</p>%s</div></section>' % pg)

    research = article.get("research_json") or {}
    eyebrow = article.get("angle_label") or research.get("eyebrow") or sport_label

    def club_logo(side):
        """The club's own mark, resolved from the TEAM, not from the article.

        TEAM_LOGO_PIPELINE_20260903. This used to print whatever logo the
        record happened to carry and a coloured rule when it carried none,
        which is how the first college Game File shipped with a hand-drawn
        roundel instead of the Georgia Tech mark. team_logos.team_logo() looks
        the club up in data/team-logos.json, caches its real mark under
        /static/media/matchups/logos/ once, and falls back to an initials badge it
        writes itself, so this branch can no longer produce an empty hero and
        can no longer produce a broken image either.
        """
        authored = hero.get("%s_logo" % side) or {}
        if authored.get("src") and not authored.get("alt"):
            authored = dict(authored, alt=hero.get("%s_logo_alt" % side) or "")
        return team_logo(
            sport,
            city=hero.get("%s_city" % side),
            nick=hero.get("%s_nick" % side),
            full_name=article.get("%s_team" % side),
            authored=authored,
            color=hero.get("%s_color" % side))

    def club_mark(side):
        mark = club_logo(side)
        check_image(mark["src"], "%s club logo" % side)
        # Fail closed, the same way a bad API read does. team_logos writes even
        # its fallback badge to disk, so a src with no file behind it means the
        # resolver could not write one, and shipping the page anyway would put a
        # broken image in the hero of a permanent publication.
        if not os.path.exists(os.path.join(ROOT, mark["src"].lstrip("/"))):
            raise RuntimeError(
                "%s club logo resolved to %s, which is not on disk" % (
                    side, mark["src"]))
        # The rendered box is fixed and square so the two sides of the strip are
        # symmetrical whatever shape the league drew its mark in; the asset
        # itself stays 500px so it is sharp at 2x and 3x.
        return ('<img class="ed-team-logo" src="%s" alt="%s" width="%d" height="%d" '
                'fetchpriority="high" decoding="async">' % (
                    esc(mark["src"]), esc(mark["alt"]), mark["w"], mark["h"]))

    away_logo_html = club_mark("away")
    home_logo_html = club_mark("home")

    # The two club marks as CSS variables on the article root. This is what lets
    # legends, form rows, the season timeline and the verdict all show the badge
    # without every one of those blocks having to carry an image in its data —
    # and a mark in place of a spelled-out club name costs less height than the
    # words did, which is the only way to add imagery without adding scroll.
    logo_bits = ""
    for side in ("away", "home"):
        logo_bits += ";--ed-%s-logo:url('%s')" % (side, esc(club_logo(side)["src"]))

    def hero_faces_html():
        """The two starters, in the hero, beside the headline.

        Read off the pitching block rather than passed in separately, so the
        faces in the hero are by construction the same two people the article
        analyses. Renders nothing at all if either headshot is missing — one
        face and an empty circle is worse than no portraits.
        """
        shots = []
        for module in article.get("body_json") or []:
            for block in module.get("blocks") or []:
                if (block or {}).get("type") != "showdown":
                    continue
                for side in ("away", "home"):
                    photo = ((block.get(side) or {}).get("photo")) or {}
                    if photo.get("src") and photo.get("alt"):
                        check_image(photo["src"], "hero portrait")
                        shots.append((side, photo))
        if len(shots) != 2:
            return ""
        cells = "".join(
            '<img class="ed-face ed-face--%s" src="%s" alt="%s" width="480" height="480" '
            'fetchpriority="high" decoding="async">' % (side, esc(p["src"]), esc(p["alt"]))
            for side, p in shots)
        return '<div class="ed-hero-faces" aria-hidden="false">%s</div>' % cells

    faces_html = hero_faces_html()

    # The ballpark plate is generated and checked, but it is no longer PLACED.
    # It burns the venue name into the artwork at a fixed 52px in a 1040-wide
    # viewBox, so at any width narrower than the old full-bleed band the name is
    # clipped by the SVG itself — and inside the cover card it also printed the
    # name a second time next to the live one in the meta line. The check stays
    # because it is what catches a plate the graphics build failed to write.
    venue_html = ""
    if article.get("venue_name"):
        venue_src = "/static/media/matchups/%s-venue.svg" % article["slug"]
        check_image(venue_src, "venue plate")
        venue_html = (
            '<figure class="ed-venue"><img src="%s" alt="%s" width="1040" height="300" '
            'loading="lazy" decoding="async"><figcaption>%s</figcaption></figure>' % (
                esc(venue_src),
                esc("TMR schematic of the ballpark hosting this game: %s" % article["venue_name"]),
                esc(article["venue_name"])))

    return TEMPLATE.format(
        crumbs=breadcrumb_html(article, sport, sport_label),
        eyebrow=esc(eyebrow),
        url=esc(url), title=esc(article.get("title")),
        description=esc(article.get("meta_description")),
        og_title=esc(article.get("og_title") or article.get("title")),
        og_description=esc(article.get("og_description") or article.get("meta_description")),
        og_image=esc(og_image), hero_image=esc(hero_image), hero_alt=esc(hero_alt),
        sport=esc(sport), sport_label=esc(sport_label), matchup=esc(matchup),
        h1=esc(article.get("h1") or matchup), dek=esc(article.get("dek") or ""),
        jsonld=jsonld,
        away_color=esc(hero.get("away_color", "#FF5910")),
        home_color=esc(hero.get("home_color", "#CE1141")),
        away_logo=away_logo_html, home_logo=home_logo_html, hero_faces=faces_html,
        logo_vars=logo_bits, venue_plate=venue_html,
        away_city=esc(hero.get("away_city", "")), away_nick=esc(hero.get("away_nick", "")),
        home_city=esc(hero.get("home_city", "")), home_nick=esc(hero.get("home_nick", "")),
        away_line=esc(hero.get("away_line", "")), home_line=esc(hero.get("home_line", "")),
        matchup_arrow=esc(hero.get("arrow", "at")),
        rail=rail_html, nav=nav_html, body=body_html, postgame=postgame_html,
        published_iso=esc(parse_iso(published).isoformat() if parse_iso(published) else ""),
        modified_iso=esc(parse_iso(modified).isoformat() if parse_iso(modified) else ""),
        published_human=esc(human_date(published)),
        modified_human=esc(human_datetime(modified)),
        game_time_human=esc(human_datetime(article.get("game_time_utc"))),
        venue=esc(article.get("venue_name") or ""),
        source_items=source_items or "<li>No external sources recorded.</li>",
        research_window=esc(research_window),
        n_facts=counts.get("fact", 0), n_derived=counts.get("derived", 0),
        n_analysis=counts.get("analysis", 0), n_total=len(provenance),
        prevnext=(" &middot; ".join(nav_bits)) or "",
    )


TEMPLATE = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="index, follow, max-image-preview:large">
<link rel="canonical" href="{url}">
<title>{title}</title>
<meta name="description" content="{description}">
<meta property="og:type" content="article">
<meta property="og:title" content="{og_title}">
<meta property="og:description" content="{og_description}">
<meta property="og:url" content="{url}">
<meta property="og:site_name" content="TrustMyRecord">
<meta property="og:image" content="{og_image}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="{hero_alt}">
<meta property="article:published_time" content="{published_iso}">
<meta property="article:modified_time" content="{modified_iso}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{og_title}">
<meta name="twitter:description" content="{og_description}">
<meta name="twitter:image" content="{og_image}">
<link rel="icon" type="image/svg+xml" href="/static/favicon.svg">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700;800;900&family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/static/css/tmr-ds.css">
<link rel="stylesheet" href="/static/css/tmr-navbar.css">
<link rel="stylesheet" href="/static/css/tmr-ds-header.4de36f3898ee.css">
<link rel="stylesheet" href="/static/css/tmr-article.css">
<!-- TMR Concept A theme. Additive: one stylesheet, no markup or script changes. -->
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Anton&family=Barlow+Condensed:ital,wght@0,600;0,700;0,800;0,900;1,600;1,700;1,800;1,900&display=swap">
<link rel="stylesheet" href="/static/css/tmr-theme-a.css">
<script type="application/ld+json">
{jsonld}
</script>
</head>
<body class="tmr-ds tmr-ds--dark tmr-theme-a">
<main class="ed" style="--ed-away:{away_color};--ed-home:{home_color}{logo_vars}">

  <header class="ed-hero">
    <img class="ed-hero-art" src="{hero_image}" alt="{hero_alt}" width="1600" height="620"
         fetchpriority="high" decoding="async">

    <div class="ed-w ed-w--full">
      <nav class="ed-crumb" aria-label="Breadcrumb">
        {crumbs}
        <span>{matchup}</span>
      </nav>

      <!-- THE COVER. Headline on the left, the whole fixture on the right, one
           band. Until 2026-08-13 the headline, the fixture strip, the stat rail
           and the ballpark plate were four stacked full-width bands and cost
           1120px before a reader reached the first sentence — on a 900px screen
           the article started below the second scroll. They are all reference
           material read once, so they belong beside the headline rather than in
           front of it, and the page now opens on the piece itself. -->
      <div class="ed-hero-grid">
      <div class="ed-hero-copy">
      <p class="ed-kicker">
        <span class="ed-kicker-mark">Matchup of the Day</span>
        <span class="ed-kicker-angle">{eyebrow}</span>
      </p>

      <h1 class="ed-title">{h1}</h1>
      <p class="ed-dek">{dek}</p>

      <div class="ed-byline">
        <span>By <a href="/about/research/">TrustMyRecord Research</a></span>
        <span class="ed-sep" aria-hidden="true">&middot;</span>
        <span><time datetime="{published_iso}">{published_human}</time></span>
        <span class="ed-sep" aria-hidden="true">&middot;</span>
        <span>Updated <time datetime="{modified_iso}">{modified_human}</time></span>
      </div>
      </div>

      <aside class="ed-cover" aria-label="The fixture">
        <div class="ed-fixture-in">
          <div class="ed-team ed-team--away">{away_logo}
            <span class="ed-team-city">{away_city}</span>
            <span class="ed-team-nick">{away_nick}</span>
            <span class="ed-team-line">{away_line}</span>
          </div>
          <div class="ed-at">{matchup_arrow}</div>
          <div class="ed-team ed-team--home">{home_logo}
            <span class="ed-team-city">{home_city}</span>
            <span class="ed-team-nick">{home_nick}</span>
            <span class="ed-team-line">{home_line}</span>
          </div>
        </div>
        {hero_faces}
        <p class="ed-fixture-meta">
          <span>{venue}</span><span><b>{game_time_human}</b></span>
        </p>
      </aside>
      </div>
    </div>
  </header>

  {rail}

  <nav class="ed-jump" aria-label="Sections in this article">
    <div class="ed-w ed-w--full"><ol>{nav}</ol></div>
  </nav>

  {postgame}
  {body}

  <div class="ed-w ed-w--wide ed-end">
    <details class="gf-meth" id="methodology">
      <summary>Methodology, sources and research record</summary>
      <div class="gf-meth-in">
        <p>This Game File carries {n_total} recorded research items: {n_facts} measured
           facts, {n_derived} derived metrics and {n_analysis} labelled editorial
           judgements. Every quantitative claim on this page has a stored source,
           sample and retrieval time; our publishing system will not publish a number
           that does not.</p>
        <p>Research completed {research_window}.</p>
        <h3>Sources used</h3>
        <ul>{source_items}</ul>
        <p><a href="/about/research/">How TrustMyRecord Research works</a> &mdash; what our
           tools do, how we grade sample size, and where automation is and is not used.</p>
      </div>
    </details>

    <nav class="gf-foot" aria-label="More Game Files">
      <p>{prevnext}</p>
      <p><a href="/matchup-of-the-day/">Every Matchup of the Day</a> &middot;
         <a href="/matchup-of-the-day/#calendar">Browse the archive by date</a> &middot;
         <a href="/matchups/">The earlier Game File archive</a></p>
    </nav>
  </div>

</main>
<script src="/static/js/config.js?v=7e4b853bbb3d"></script>
<script src="/static/js/tmr-gamefile.js"></script>
<script src="/static/js/tmr-session.js"></script><script src="/static/js/tmr-ds-nav.js"></script>
</body>
</html>
"""



TODAY_TEMPLATE = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="index, follow">
<title>{eyebrow}: {matchup} | TrustMyRecord</title>
<meta name="description" content="{eyebrow}: {matchup}. Opening the full analysis.">
<link rel="canonical" href="{target_abs}">
<meta http-equiv="refresh" content="0; url={target}">
<link rel="icon" type="image/svg+xml" href="/static/favicon.svg">
<script>location.replace({target!r});</script>
<style>
  html,body{{margin:0;background:#070910;color:#CBD5E1;
    font:500 15px/1.6 Inter,system-ui,-apple-system,'Segoe UI',sans-serif}}
  .t{{max-width:34rem;margin:0 auto;padding:22vh 24px 0}}
  .t p{{color:#8A97A8;margin:0 0 14px;font-size:12px;font-weight:800;
    letter-spacing:.16em;text-transform:uppercase}}
  .t a{{color:#F7F9FC;font-size:1.4rem;font-weight:800;line-height:1.25;
    letter-spacing:-.02em;text-decoration:none;border-bottom:2px solid #35E0CB}}
</style>
</head>
<body>
<main class="t">
  <p>{eyebrow}</p>
  <a href="{target}">{headline}</a>
</main>
</body>
</html>
"""


def card_html(article, lead=False):
    sport_label = SPORT_LABEL.get(article["sport"], article["sport"].upper())
    matchup = "%s vs. %s" % (article["away_team"], article["home_team"])
    href = article_href(article)
    # Descriptive anchor text. The link text is the article's name, never "read more".
    return (
        '<article class="gf-card%s">'
        '<p class="gf-card-kicker">%s</p>'
        '<h3><a href="%s">%s &mdash; Complete TMR Matchup Analysis</a></h3>'
        '<p>%s</p>'
        '<p class="gf-card-meta"><span><strong>%s</strong></span>'
        '<span>Published %s</span></p>'
        '</article>' % (
            " gf-card--lead" if lead else "",
            esc(article.get("angle_label")
                or ("Today's Game File" if lead else sport_label + " Game File")),
            esc(href), esc(matchup),
            esc(article.get("dek") or article.get("meta_description") or ""),
            esc(sport_label), esc(human_date(article.get("published_at")))))


# ================================================================= calendar ==
#
# The archive is the point of this feature: a Matchup of the Day that replaced
# yesterday's would be a widget, not a publication. The calendar is how a reader
# actually reaches into it — pick a date, land on that day's permanent URL.
#
# It is baked, not fetched. Every month grid and every day link is in the HTML
# the crawler receives, and the script below only decides which month is on
# screen. With JS off the reader gets every month stacked, which is a worse
# experience and a complete one; there is no state where a control exists and
# does nothing.

MONTH_ABBR = ("Jan", "Feb", "Mar", "Apr", "May", "Jun",
              "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")
DOW_ABBR = ("Su", "Mo", "Tu", "We", "Th", "Fr", "Sa")


def display_date(value):
    """The date a reader sees on the article, not the UTC instant.

    An article published at 07:00 PT carries a UTC timestamp on the following
    date for seven months of the year. Keying the calendar off the raw UTC date
    would put a third of the archive on the wrong square, one day late, and the
    square the reader clicked on would open a different day's piece."""
    shifted = to_display(value)
    return shifted.date() if shifted else None


def archive_day(article):
    """Which square on the calendar this article belongs to.

    `featured_on` — the day it WAS the Matchup of the Day — not published_at.
    For every article written on its own morning the two agree, which is why the
    distinction was invisible until the first backfill: a piece previewing the
    August 12 game, written from August 12 research but published on the 17th,
    belongs on the 12th. Keyed off published_at it would land on the 17th, on top
    of that day's own article, and one of the two would vanish from the archive.

    published_at stays honest about when the article went live and remains what
    feeds datePublished. These are two different facts and the calendar wants the
    other one.

    featured_on arrives as a DATE at midnight UTC. It is deliberately not put
    through the display timezone: shifting midnight UTC into Pacific moves it to
    the previous day, which is the same off-by-one this function exists to stop.
    """
    featured = parse_iso(article.get("featured_on"))
    if featured:
        return featured.date()
    return display_date(article.get("published_at"))


def month_key(value):
    return "%04d-%02d" % (value.year, value.month)


def month_label(year, month):
    return "%s %d" % (MONTHS[month - 1], year)


def months_between(first, last):
    """Every month from `first` to `last` inclusive.

    Months with nothing published are included on purpose: prev/next has to walk
    a continuous strip or an off-season gap silently teleports the reader across
    it, and a month that published nothing is a true fact about the archive."""
    span = []
    year, month = first.year, first.month
    while (year, month) <= (last.year, last.month):
        span.append((year, month))
        year, month = (year + 1, 1) if month == 12 else (year, month + 1)
    return span


def calendar_html(articles, today):
    """One grid per month. Days that published link to that day's own URL."""
    by_day = {}
    for a in articles:                      # newest first; first writer wins
        day = archive_day(a)
        if day and day not in by_day:
            by_day[day] = a
    if not by_day:
        return ('<p class="gf-empty">The calendar fills in as Matchups of the '
                'Day publish.</p>')

    span = months_between(min(by_day), max(max(by_day), today))
    open_key = month_key(today if (today.year, today.month) in span else max(by_day))

    blocks = []
    for i, (year, month) in enumerate(span):
        key = "%04d-%02d" % (year, month)
        first_weekday, days_in_month = cal.monthrange(year, month)
        # monthrange counts from Monday; the grid starts on Sunday.
        pad = (first_weekday + 1) % 7

        cells = ['<span class="gf-cal-dow" aria-hidden="true">%s</span>' % d
                 for d in DOW_ABBR]
        cells += ['<span class="gf-cal-pad" aria-hidden="true"></span>'] * pad

        for number in range(1, days_in_month + 1):
            day = dt.date(year, month, number)
            article = by_day.get(day)
            classes = ["gf-cal-day"]
            if day == today:
                classes.append("gf-cal-day--today")
            if article:
                classes.append("gf-cal-day--has")
                cells.append(
                    '<a class="%s" href="%s" aria-label="%s %d: %s vs. %s">'
                    '<span class="gf-cal-n">%d</span></a>' % (
                        " ".join(classes), esc(article_href(article)),
                        MONTH_ABBR[month - 1], number,
                        esc(article["away_team"]), esc(article["home_team"]),
                        number))
            else:
                cells.append(
                    '<span class="%s"><span class="gf-cal-n">%d</span></span>' % (
                        " ".join(classes), number))

        if i > 0:
            prev_year, prev_month = span[i - 1]
            nav_prev = ('<a class="gf-cal-nav" href="#cal-%04d-%02d" '
                        'data-gf-cal-go="%04d-%02d" rel="prev">&larr;&nbsp;%s</a>' % (
                            prev_year, prev_month, prev_year, prev_month,
                            MONTH_ABBR[prev_month - 1]))
        else:
            nav_prev = ('<span class="gf-cal-nav gf-cal-nav--off" '
                        'aria-hidden="true">&larr;</span>')

        if i + 1 < len(span):
            next_year, next_month = span[i + 1]
            nav_next = ('<a class="gf-cal-nav" href="#cal-%04d-%02d" '
                        'data-gf-cal-go="%04d-%02d" rel="next">%s&nbsp;&rarr;</a>' % (
                            next_year, next_month, next_year, next_month,
                            MONTH_ABBR[next_month - 1]))
        else:
            nav_next = ('<span class="gf-cal-nav gf-cal-nav--off" '
                        'aria-hidden="true">&rarr;</span>')

        blocks.append(
            '<div class="gf-cal-month" id="cal-%s" data-month="%s">'
            '<div class="gf-cal-bar">%s<h3 class="gf-cal-title">%s</h3>%s</div>'
            '<div class="gf-cal-grid">%s</div>'
            '</div>' % (key, key, nav_prev, esc(month_label(year, month)),
                        nav_next, "".join(cells)))

    return ('<div class="gf-cal" data-gf-cal data-current="%s">%s</div>'
            '<p class="gf-cal-key">'
            '<span class="gf-cal-key-i gf-cal-key-i--has"></span>Published'
            '<span class="gf-cal-key-i gf-cal-key-i--today"></span>Today'
            '</p>' % (open_key, "".join(blocks)))


def by_month_html(articles):
    """The calendar's plain-text twin: every article as a dated line.

    A grid of numbers is quick to scan and tells you nothing about what is on
    the other side of a square. This list is the readable index of the same
    archive, and it is where the descriptive internal links live."""
    groups = []
    seen = {}
    # Re-sorted rather than trusting the caller's order: a backfilled day arrives
    # with a much later published_at and would otherwise sit at the top of its
    # month above days that came after it.
    for a in sorted(articles, key=lambda x: (archive_day(x) or dt.date.min,
                                             x.get("id") or 0), reverse=True):
        day = archive_day(a)
        if not day:
            continue
        key = month_key(day)
        if key not in seen:
            seen[key] = []
            groups.append((day.year, day.month, key))
        seen[key].append((day, a))

    if not groups:
        return ('<p class="gf-empty">The dated index starts with our first '
                'Matchup of the Day.</p>')

    out = []
    for year, month, key in groups:
        rows = "".join(
            '<li><span class="gf-mo-d">%s %d</span>'
            '<a href="%s">%s</a></li>' % (
                MONTH_ABBR[day.month - 1], day.day, esc(article_href(a)),
                esc(a.get("title") or "%s vs. %s" % (a["away_team"], a["home_team"])))
            for day, a in seen[key])
        out.append('<div class="gf-mo"><h3 class="gf-mo-h">%s</h3>'
                   '<ul class="gf-mo-list">%s</ul></div>' % (
                       esc(month_label(year, month)), rows))
    return "".join(out)


def itemlist_jsonld(articles, list_url, name):
    if not articles:
        return ""
    items = [{
        "@type": "ListItem",
        "position": i + 1,
        "url": article_abs(a),
        "name": "%s vs. %s" % (a["away_team"], a["home_team"]),
    } for i, a in enumerate(articles[:50])]
    payload = {"@context": "https://schema.org", "@type": "ItemList",
               "@id": list_url + "#items", "name": name,
               "numberOfItems": len(items), "itemListElement": items}
    return '<script type="application/ld+json">\n%s\n</script>' % json.dumps(
        payload, indent=2, ensure_ascii=False)


def sitemap_block(articles, hubs):
    lines = ["  <!-- BEGIN_MATCHUP_URLS -->"]
    for loc, lastmod in hubs:
        lines.append('  <url><loc>%s</loc><lastmod>%s</lastmod>'
                     '<changefreq>daily</changefreq><priority>0.8</priority></url>' % (loc, lastmod))
    for a in articles:
        # lastmod is the article's real content-modified date. It is NOT today's
        # date, and a widget refresh does not move it: a lastmod that changes
        # every day on a page that did not change teaches Google to ignore it.
        lastmod = iso_date(a.get("content_modified_at") or a.get("published_at"))
        lines.append('  <url><loc>%s</loc>%s'
                     '<changefreq>monthly</changefreq><priority>0.7</priority></url>' % (
                         article_abs(a),
                         "<lastmod>%s</lastmod>" % lastmod if lastmod else ""))
    lines.append("  <!-- END_MATCHUP_URLS -->")
    return "\n".join(lines)


def update_sitemap(text, block):
    text = re.sub(r"\s*<!-- BEGIN_MATCHUP_URLS -->.*?<!-- END_MATCHUP_URLS -->", "", text, flags=re.S)
    return text.replace("</urlset>", block + "\n</urlset>")


# ---------------------------------------------------------------------- main

def load_payload(args):
    if args.from_file:
        with open(args.from_file, encoding="utf-8") as f:
            return json.load(f)
    return get(API + "/matchups")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="render everything, write nothing")
    ap.add_argument("--from-file", help="read the /api/matchups payload from a local JSON file")
    args = ap.parse_args()

    payload = load_payload(args)
    articles = payload.get("articles") or []
    featured = payload.get("featured")

    declared = payload.get("count")
    if declared is not None and int(declared) != len(articles):
        # Fail closed on a partial read, exactly as build_forum_threads.py does:
        # a short list would silently drop live articles out of the sitemap.
        sys.exit("ABORT: API reported %s articles, received %d" % (declared, len(articles)))

    for a in articles:
        for field in ("sport", "slug", "away_team", "home_team", "published_at"):
            if not a.get(field):
                sys.exit("ABORT: article %s is missing %s" % (a.get("id"), field))

    # Newest first, so "previous" walks backwards through the archive.
    #
    # Sorted by the day each piece COVERS (archive_day), not the moment it went
    # live. Identical for anything written on its own morning; the two only
    # diverge for a backfilled day, and there the reader's "previous matchup"
    # plainly means the previous day's game, not whatever happened to be
    # published before it. published_at breaks ties.
    ordered = sorted(
        articles,
        key=lambda a: (archive_day(a) or dt.date.min,
                       a.get("published_at") or "",
                       a.get("id") or 0),
        reverse=True)

    # ---- render every page into memory before touching the tree -------------
    rendered = {}
    for i, a in enumerate(ordered):
        prev_a = ordered[i + 1] if i + 1 < len(ordered) else None
        next_a = ordered[i - 1] if i > 0 else None
        prov = a.get("provenance") or []
        try:
            rendered[a["slug"]] = (
                os.path.join(ROOT, article_rel(a), "index.html"),
                render_article(a, prov, (prev_a, next_a)))
        except Exception as err:                        # noqa: BLE001
            sys.exit("ABORT: %s failed to render: %s" % (a["slug"], err))

    # ---- artwork -----------------------------------------------------------
    # Generated for every published article on every bake. Output is
    # deterministic, so an unchanged article rewrites byte-identical files and
    # produces no diff; a NEW article gets its artwork in the same commit as its
    # HTML, which is the only way the hero image is never a 404 on the day the
    # piece goes live.
    if not args.dry_run:
        # Photography first: a missing headshot must stop the bake BEFORE any
        # HTML is written, not after, or the article ships with a broken <img>.
        fetch_media(collect_media(ordered))
        try:
            sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
            import build_matchup_graphics as art
            for a in ordered:
                art.build_for_article(a["slug"], graphics_spec(a))
        except Exception as err:                        # noqa: BLE001
            sys.exit("ABORT: artwork generation failed: %s" % err)

    today_iso = dt.datetime.now(dt.timezone.utc).date().isoformat()

    # ---- hub listings -------------------------------------------------------
    # Resolve `featured` back to the row in `articles`. The API's featured field
    # is a bare article record without its provenance attached, and the cover
    # counts research claims off it — using the bare copy silently dropped the
    # "verified research claims" line from the homepage.
    # The two hubs do not compete. /matchup-of-the-day/ is the daily feature and
    # lists the articles that have an angle; /matchups/ is the earlier archive
    # and lists only its own. Before this split both hubs listed every article,
    # which put two near-identical listing pages in the index pointing at the
    # same URLs — the sort of self-competition that costs a section its rankings.
    legacy = [a for a in ordered if not a.get("angle_key")]

    lead = None
    if featured and featured.get("slug"):
        lead = next((a for a in ordered if a["slug"] == featured["slug"]), featured)
    elif ordered:
        lead = ordered[0]
    rest = [a for a in ordered if not lead or a["slug"] != lead["slug"]]

    legacy_lead = legacy[0] if legacy else None
    legacy_rest = legacy[1:]

    hub_today = card_html(lead, lead=True) if lead else (
        '<p class="gf-empty">Today&rsquo;s Game File is being prepared. '
        'It publishes in the morning, ahead of first pitch.</p>')
    hub_recent = "".join(card_html(a) for a in rest[:20]) or (
        '<p class="gf-empty">The archive starts with our first published Game File.</p>')

    sports_present = sorted({a["sport"] for a in legacy})
    sport_items = []
    for sport in sports_present or ["mlb"]:
        label = SPORT_LABEL.get(sport, sport.upper())
        n = sum(1 for a in legacy if a["sport"] == sport)
        sport_items.append(
            '<li><a href="/matchups/%s/">%s Game Files &mdash; matchup analysis, trends and advanced stats</a>'
            '%s</li>' % (esc(sport), esc(label),
                         (' <span class="gf-sample">%d published</span>' % n) if n else ""))
    hub_sports = '<ul class="gf-sportlist">%s</ul>' % "".join(sport_items)

    writes = []

    # /matchup-of-the-day/ — the daily feature's own home and its archive.
    # Driven off the articles that HAVE an angle, so the legacy /matchups/ pages
    # keep their own listings and neither hub claims the other's articles.
    motd_path = os.path.join(MOTD_DIR, "index.html")
    if os.path.exists(motd_path):
        daily = [a for a in ordered if a.get("angle_key")]
        # NEWEST WINS, ALWAYS (Nima's ruling, 2026-08-13). This used to prefer
        # whatever the API had flagged `featured`, falling back to newest — so a
        # `featured_on` that failed to move, or a day whose article published
        # after the flag was set, left the section's lead card AND the nav's
        # /today/ handoff pointing at yesterday's piece while today's sat live
        # in the archive below it. `ordered` is already newest-first.
        motd_lead = daily[0] if daily else None
        motd_rest = [a for a in daily if not motd_lead or a["slug"] != motd_lead["slug"]]
        text = read(motd_path)
        text = replace_marker(text, "motdToday",
                              card_html(motd_lead, lead=True) if motd_lead else
                              '<p class="gf-empty">Today&rsquo;s Matchup of the Day is being '
                              'prepared. It publishes in the morning, ahead of first pitch.</p>',
                              motd_path)
        text = replace_marker(text, "motdRecent",
                              "".join(card_html(a) for a in motd_rest[:40]) or
                              '<p class="gf-empty">The archive starts with our first '
                              'Matchup of the Day.</p>', motd_path)
        # The calendar and the dated index are both built from `daily`, so a day
        # that is on the calendar is a day that has an article; there is no
        # second source of truth to drift out of step with the archive.
        today_local = (to_display(dt.datetime.now(dt.timezone.utc).isoformat())
                       or dt.datetime.now(dt.timezone.utc)).date()
        text = replace_marker(text, "motdCalendar",
                              calendar_html(daily, today_local), motd_path)
        text = replace_marker(text, "motdByMonth",
                              by_month_html(daily), motd_path)
        text = replace_marker(text, "motdItemList",
                              itemlist_jsonld(daily, SITE + "/matchup-of-the-day/",
                                              "TMR Matchup of the Day"), motd_path)
        writes.append((motd_path, text))

        # /matchup-of-the-day/today/ — the front door for the NAV.
        #
        # The Sportsbook menu used to point at the hub, so clicking "Matchup of
        # the Day" landed a reader on a page explaining what the section is,
        # with the day's piece a scroll and a second click away. Pointing the
        # menu straight at the article's own URL is not an option: that URL
        # changes every morning and the nav bundle is content-hashed and
        # referenced by every page on the site, so a daily href would rewrite
        # the whole tree daily.
        #
        # This is the stable address in between. It is baked with the day's
        # article, canonicalised TO that article so search consolidates on the
        # permanent URL rather than this one, and it is deliberately kept out of
        # the sitemap for the same reason. It is not noindexed: it is a real
        # page with a real link on it, and it hands off in about a frame.
        if motd_lead:
            target = article_href(motd_lead)
            today_dir = os.path.join(MOTD_DIR, "today")
            headline = motd_lead.get("h1") or ("%s vs. %s" % (
                motd_lead["away_team"], motd_lead["home_team"]))
            writes.append((os.path.join(today_dir, "index.html"), TODAY_TEMPLATE.format(
                target=esc(target),
                target_abs=esc(SITE + target),
                headline=esc(headline),
                eyebrow="Today&#39;s Matchup of the Day",
                matchup=esc("%s vs. %s" % (motd_lead["away_team"], motd_lead["home_team"])),
            )))

        # /matchup-of-the-day/<sport>/ - the same stable door, one per sport.
        #
        # /today/ is newest-wins across every sport, which is the right answer
        # for one nav entry and the wrong one the moment there are two. A menu
        # item that says NCAAF Matchup of the Day has to land on the NCAAF piece
        # on a Thursday in September whether or not baseball published later
        # that morning, so each sport gets its own address, baked with that
        # sport's newest Game File.
        #
        # Same contract as /today/: canonicalised TO the article so search
        # consolidates on the permanent URL, deliberately kept out of the
        # sitemap, and never noindexed, because it is a real page with a real
        # link on it.
        by_sport = {}
        for a in daily:
            by_sport.setdefault(a["sport"], a)      # `daily` is already newest-first
        for sport, lead in sorted(by_sport.items()):
            s_target = article_href(lead)
            s_label = SPORT_LABEL.get(sport, sport.upper())
            s_headline = lead.get("h1") or ("%s vs. %s" % (lead["away_team"], lead["home_team"]))
            writes.append((os.path.join(MOTD_DIR, sport, "index.html"), TODAY_TEMPLATE.format(
                target=esc(s_target),
                target_abs=esc(SITE + s_target),
                headline=esc(s_headline),
                eyebrow=esc("%s Matchup of the Day" % s_label),
                matchup=esc("%s vs. %s" % (lead["away_team"], lead["home_team"])),
            )))
    else:
        print("WARN: matchup-of-the-day/index.html is missing; the daily hub was not written")

    hub_path = os.path.join(MATCHUPS_DIR, "index.html")
    hub = read(hub_path)
    hub = replace_marker(hub, "matchupsHubToday",
                         card_html(legacy_lead, lead=True) if legacy_lead else
                         '<p class="gf-empty">The daily article now publishes at '
                         '<a href="/matchup-of-the-day/">Matchup of the Day</a>. '
                         'The Game Files below remain published at their original addresses.</p>',
                         hub_path)
    hub = replace_marker(hub, "matchupsHubRecent",
                         "".join(card_html(a) for a in legacy_rest[:20]) or
                         '<p class="gf-empty">Every Game File in this archive is listed above.</p>',
                         hub_path)
    hub = replace_marker(hub, "matchupsHubSports", hub_sports, hub_path)
    hub = replace_marker(hub, "matchupsHubItemList",
                         itemlist_jsonld(legacy, SITE + "/matchups/", "TMR Game Files"), hub_path)
    writes.append((hub_path, hub))

    # Iterate over the hub shells that EXIST, not over the sports that happen to
    # have something published. Driving this from `sports_present` meant a hub
    # was only ever rewritten while it had articles: unpublish the last MLB Game
    # File and /matchups/mlb/ would keep serving the stale card, the stale
    # ItemList JSON-LD and a link to an article we had just withdrawn. A hub has
    # to be able to go back to empty.
    hub_sports = sorted(
        s for s in (os.listdir(MATCHUPS_DIR) if os.path.isdir(MATCHUPS_DIR) else [])
        if os.path.exists(os.path.join(MATCHUPS_DIR, s, "index.html"))
    )
    for sport in sports_present:
        if sport not in hub_sports:
            print("WARN: no hub shell for %s; its articles are still baked" % sport)
    for sport in hub_sports:
        sport_path = os.path.join(MATCHUPS_DIR, sport, "index.html")
        in_sport = [a for a in legacy if a["sport"] == sport]
        s_lead = in_sport[0] if in_sport else None
        s_rest = in_sport[1:]
        text = read(sport_path)
        key = "matchups%s" % sport.capitalize()
        text = replace_marker(text, key + "Today",
                              card_html(s_lead, lead=True) if s_lead else
                              '<p class="gf-empty">Today&rsquo;s %s Game File is being prepared.</p>'
                              % SPORT_LABEL.get(sport, sport.upper()), sport_path)
        text = replace_marker(text, key + "Recent",
                              "".join(card_html(a) for a in s_rest[:20]) or
                              '<p class="gf-empty">The %s archive starts with our first published Game File.</p>'
                              % SPORT_LABEL.get(sport, sport.upper()), sport_path)
        text = replace_marker(text, key + "ItemList",
                              itemlist_jsonld(in_sport, "%s/matchups/%s/" % (SITE, sport),
                                              "%s Game Files" % SPORT_LABEL.get(sport, sport.upper())),
                              sport_path)
        writes.append((sport_path, text))

    # ---- homepage: intentionally NOT touched --------------------------------
    # A full-viewport Matchup cover was built here and rejected outright. The
    # homepage is not this system's surface, so the generator no longer writes
    # to it at all - not even behind a marker check. Leaving the injection code
    # in place "harmlessly" is how a rejected design comes back: someone restores
    # the marker and the cover silently reappears on the highest-traffic page on
    # the site. If a homepage promo is ever wanted it will be a small, separately
    # approved module, added deliberately rather than revived by accident.
    #
    # Guarded by tests/homepage-approved-baseline-lock-test.js.

    # ---- sitemap ------------------------------------------------------------
    # Hubs are discovered from DISK, not from the published set. A sport hub is
    # a real editorial page in its own right (what a Game File covers, how we
    # grade sample size, links into the tools), so it belongs in the sitemap
    # from the day it ships — including the day before the first article in that
    # sport publishes. Deriving the hub list from `sports_present` instead would
    # silently drop /matchups/mlb/ out of the sitemap whenever nothing is
    # published, which is exactly the kind of on-again-off-again URL that taught
    # Google to distrust this site's sitemap in the first place.
    hubs = []
    if os.path.exists(os.path.join(MOTD_DIR, "index.html")):
        hubs.append(("%s/matchup-of-the-day/" % SITE, today_iso))
    hubs.append(("%s/matchups/" % SITE, today_iso))
    if os.path.isdir(MATCHUPS_DIR):
        for sport in sorted(os.listdir(MATCHUPS_DIR)):
            if os.path.exists(os.path.join(MATCHUPS_DIR, sport, "index.html")):
                hubs.append(("%s/matchups/%s/" % (SITE, sport), today_iso))
    sitemap = update_sitemap(read(SITEMAP), sitemap_block(ordered, hubs))
    writes.append((SITEMAP, sitemap))

    # ---- orphan report. REPORT ONLY. Nothing here deletes anything. ---------
    known = {a["slug"] for a in ordered}
    orphans = []
    if os.path.isdir(MOTD_DIR):
        for entry in os.listdir(MOTD_DIR):
            if entry == "index.html" or not os.path.isdir(os.path.join(MOTD_DIR, entry)):
                continue
            if entry not in known:
                orphans.append("matchup-of-the-day/%s" % entry)
    if os.path.isdir(MATCHUPS_DIR):
        for sport in os.listdir(MATCHUPS_DIR):
            sport_dir = os.path.join(MATCHUPS_DIR, sport)
            if not os.path.isdir(sport_dir):
                continue
            for entry in os.listdir(sport_dir):
                if entry == "index.html" or not os.path.isdir(os.path.join(sport_dir, entry)):
                    continue
                if entry not in known:
                    orphans.append("%s/%s" % (sport, entry))
    for orphan in orphans:
        print("NOTE: /%s/ is on disk but not in the published set. "
              "LEFT IN PLACE - a published Game File is permanent, and removing one "
              "is a deliberate manual act, never a side effect of a bake." % orphan)

    if args.dry_run:
        print("DRY RUN - %d article(s), %d file(s) would be written" % (len(ordered), len(writes) + len(rendered)))
        for slug, (path, _) in rendered.items():
            print("  article %s -> %s" % (slug, os.path.relpath(path, ROOT)))
        for path, _ in writes:
            print("  update  %s" % os.path.relpath(path, ROOT))
        return

    for path, text in rendered.values():
        write(path, text)

    # ---- superseded URLs: repoint the canonical, keep serving --------------
    for old_rel, new_rel in SUPERSEDED.items():
        old_file = os.path.join(ROOT, old_rel.replace("/", os.sep), "index.html")
        if not os.path.exists(old_file):
            continue
        new_url = "%s/%s/" % (SITE, new_rel)
        page = read(old_file)
        page, n = re.subn(r'<link rel="canonical" href="[^"]*">',
                          '<link rel="canonical" href="%s">' % new_url, page, count=1)
        if not n:
            print("WARN: %s has no canonical tag to repoint" % old_rel)
            continue
        # og:url follows the canonical, or a share preview names the old address.
        page = re.sub(r'<meta property="og:url" content="[^"]*">',
                      '<meta property="og:url" content="%s">' % new_url, page, count=1)
        write(old_file, page)
        print("canonical %s -> %s" % (old_rel, new_rel))
    for path, text in writes:
        # Hard stop: this generator has no business writing the homepage.
        assert os.path.abspath(path) != os.path.abspath(HOME),             "build_matchup_articles.py must never write the homepage"
        write(path, text)

    print("baked %d Game File(s); updated %d shared file(s)" % (len(rendered), len(writes)))


if __name__ == "__main__":
    main()
