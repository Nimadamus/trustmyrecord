#!/usr/bin/env python3
"""
build_matchup_articles.py - bake TMR Game Files into the static site.

MATCHUP_OF_THE_DAY_PHASE1_20260810.

What it does
------------
Reads published Game Files from /api/matchups and writes:

    matchups/<sport>/<slug>/index.html   one permanent article per Game File
    matchups/index.html                  hub listings (marker blocks)
    matchups/<sport>/index.html          sport hub listings (marker blocks)
    index.html                           the homepage cover (marker block)
    sitemap.xml                          <!-- BEGIN_MATCHUP_URLS --> block

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
import datetime as dt
import html
import json
import os
import re
import sys
import urllib.request

API = os.environ.get("TMR_API", "https://trustmyrecord-api.onrender.com/api")
SITE = "https://trustmyrecord.com"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

MATCHUPS_DIR = os.path.join(ROOT, "matchups")
SITEMAP = os.path.join(ROOT, "sitemap.xml")
HOME = os.path.join(ROOT, "index.html")

SPORT_LABEL = {
    "mlb": "MLB", "nba": "NBA", "nfl": "NFL", "nhl": "NHL",
    "soccer": "Soccer", "ncaaf": "College Football", "ncaab": "College Basketball",
}

# Only these hosts may appear in an article image. A Game File must not hotlink
# a photograph from wherever the research happened to find it.
ALLOWED_IMAGE_PREFIXES = ("/static/", SITE + "/static/", "https://trustmyrecord-api.onrender.com/api/share/og")

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


# ---------------------------------------------------------------- block render

def sample_chip(block):
    sample = block.get("sample")
    if not sample:
        return ""
    grade = block.get("sample_grade") or "interesting"
    return ' <span class="gf-sample" data-grade="%s">%s</span>' % (esc(grade), esc(sample))


def safe_href(href):
    """Internal, resolvable links only.

    tests/seo-indexability-regression-test.js fails the whole build if any page
    links to a path that does not exist, and it is right to: TMR must never hand
    Googlebot a 404. Anything not site-relative is dropped rather than shipped.
    """
    href = str(href or "").strip()
    if href.startswith("/") and not href.startswith("//"):
        return href
    return None


def render_block(block):
    kind = (block or {}).get("type", "p")

    if kind in ("p", "stat"):
        return "<p>%s%s</p>" % (esc(block.get("text")), sample_chip(block))

    if kind == "h3":
        return "<h3>%s</h3>" % esc(block.get("text"))

    if kind == "list":
        items = "".join(
            "<li>%s%s</li>" % (esc(i.get("text") if isinstance(i, dict) else i),
                               sample_chip(i if isinstance(i, dict) else {}))
            for i in block.get("items") or []
        )
        return "<ul>%s</ul>" % items

    if kind == "finding":
        variant = block.get("variant") or ""
        cls = "gf-finding" + (" gf-finding--%s" % esc(variant) if variant else "")
        body = "".join("<p>%s</p>" % esc(p) for p in (block.get("paragraphs") or [block.get("text", "")]))
        return '<aside class="%s"><span class="gf-finding-tag">%s</span>%s%s</aside>' % (
            cls, esc(block.get("tag") or "TMR Research"), body,
            ('<p>%s</p>' % sample_chip(block)) if block.get("sample") else "")

    if kind == "numbers":
        cells = "".join(
            '<div class="gf-num"><b>%s</b><span>%s</span>%s</div>' % (
                esc(i.get("value")), esc(i.get("label")),
                ("<em>%s</em>" % esc(i.get("note"))) if i.get("note") else "")
            for i in block.get("items") or []
        )
        return '<div class="gf-numbers">%s</div>' % cells

    if kind == "tape":
        rows = ['<div class="gf-tape-row is-head"><div>%s</div><div class="gf-tape-k">&nbsp;</div><div>%s</div></div>'
                % (esc(block.get("away_label")), esc(block.get("home_label")))]
        for row in block.get("rows") or []:
            better = row.get("better")
            rows.append(
                '<div class="gf-tape-row">'
                '<div class="gf-tape-v%s">%s</div>'
                '<div class="gf-tape-k">%s</div>'
                '<div class="gf-tape-v%s">%s</div></div>' % (
                    " is-better" if better == "away" else "", esc(row.get("away")),
                    esc(row.get("key")),
                    " is-better" if better == "home" else "", esc(row.get("home"))))
        return '<div class="gf-tape">%s</div>' % "".join(rows)

    if kind == "table":
        head = "".join("<th scope=\"col\">%s</th>" % esc(h) for h in block.get("head") or [])
        body = "".join(
            "<tr>%s</tr>" % "".join(
                ("<th scope=\"row\">%s</th>" % esc(c)) if ci == 0 else ("<td>%s</td>" % esc(c))
                for ci, c in enumerate(row))
            for row in block.get("rows") or [])
        caption = ("<caption>%s</caption>" % esc(block.get("caption"))) if block.get("caption") else ""
        return ('<div class="gf-tablewrap"><table class="gf-table">%s<thead><tr>%s</tr></thead>'
                '<tbody>%s</tbody></table></div>') % (caption, head, body)

    if kind == "simbar":
        a, b = block.get("a") or {}, block.get("b") or {}
        try:
            apct = max(0.0, min(100.0, float(a.get("pct", 0))))
        except (TypeError, ValueError):
            apct = 0.0
        bpct = max(0.0, 100.0 - apct)
        return (
            '<div class="gf-simbar" role="img" aria-label="%s %s percent, %s %s percent">'
            '<span class="a" style="width:%.1f%%">%s%%</span>'
            '<span class="b" style="width:%.1f%%">%s%%</span></div>'
            '<div class="gf-simlegend"><span><i style="background:var(--brand)"></i>%s</span>'
            '<span><i style="background:var(--violet)"></i>%s</span></div>%s' % (
                esc(a.get("label")), esc(a.get("pct")), esc(b.get("label")), esc(b.get("pct")),
                apct, esc(a.get("pct")), bpct, esc(b.get("pct")),
                esc(a.get("label")), esc(b.get("label")),
                ('<p class="gf-mod-sub">%s</p>' % esc(block.get("note"))) if block.get("note") else ""))

    if kind == "keyfacts":
        cells = "".join(
            '<div class="gf-keyfact"><b>%s</b><span>%s</span></div>' % (
                esc(i.get("value")), esc(i.get("label")))
            for i in block.get("items") or [])
        return '<div class="gf-keyfacts">%s</div>' % cells

    if kind == "trendboard":
        # The scannable core. Each item carries its own sample, timeframe and
        # source, because a trend without those three is a claim, not evidence.
        cats = []
        for cat in block.get("categories") or []:
            items = []
            for it in cat.get("items") or []:
                meta = []
                if it.get("sample"):
                    meta.append("<em>%s</em>" % esc(it["sample"]))
                if it.get("timeframe"):
                    meta.append(esc(it["timeframe"]))
                if it.get("source"):
                    meta.append(esc(SOURCE_SHORT.get(it["source"], it["source"])))
                items.append(
                    '<li class="gf-trend">'
                    '<span class="gf-tag" data-s="%s">%s</span>'
                    '<span><span class="gf-trend-txt">%s</span>'
                    '<span class="gf-trend-meta">%s</span></span></li>' % (
                        esc(it.get("strength") or "interesting"),
                        esc(it.get("strength") or "context"),
                        esc(it.get("text")),
                        " &middot; ".join(meta)))
            cats.append('<div class="gf-board-cat"><h3>%s</h3><ul class="gf-trends">%s</ul></div>'
                        % (esc(cat.get("name")), "".join(items)))
        note = ('<p class="gf-boardnote">%s</p>' % esc(block.get("note"))) if block.get("note") else ""
        return '<div class="gf-board">%s</div>%s' % ("".join(cats), note)

    if kind == "compare":
        away, home = block.get("away") or {}, block.get("home") or {}
        rows = []
        for row in block.get("rows") or []:
            better = row.get("better")
            rows.append(
                '<div class="gf-compare-row">'
                '<div class="gf-compare-v%s">%s</div>'
                '<div class="gf-compare-k">%s</div>'
                '<div class="gf-compare-v%s">%s</div></div>' % (
                    " is-better" if better == "away" else "", esc(row.get("away")),
                    esc(row.get("key")),
                    " is-better" if better == "home" else "", esc(row.get("home"))))
        return (
            '<div class="gf-compare">'
            '<div class="gf-compare-head">'
            '<div class="gf-compare-who">%s<small>%s</small></div>'
            '<div class="gf-compare-k">&nbsp;</div>'
            '<div class="gf-compare-who">%s<small>%s</small></div></div>%s</div>' % (
                esc(away.get("name")), esc(away.get("sub")),
                esc(home.get("name")), esc(home.get("sub")), "".join(rows)))

    if kind == "figure":
        # Dimensions are REQUIRED: an image without width/height is a layout
        # shift, and this page has enough graphics for that to be measurable.
        src = block.get("src")
        if not str(src or "").startswith("/static/"):
            raise RuntimeError("figure src must be a TMR-controlled /static/ path, got %r" % src)
        if not block.get("alt"):
            raise RuntimeError("figure %s has no alt text" % src)
        if not (block.get("width") and block.get("height")):
            raise RuntimeError("figure %s needs width and height (CLS)" % src)
        cap = ('<figcaption>%s</figcaption>' % esc(block.get("caption"))) if block.get("caption") else ""
        return (
            '<figure class="gf-fig"><img src="%s" alt="%s" width="%s" height="%s" '
            'loading="lazy" decoding="async">%s</figure>' % (
                esc(src), esc(block.get("alt")), esc(block.get("width")),
                esc(block.get("height")), cap))

    if kind == "toollinks":
        items = []
        for link in block.get("links") or []:
            href = safe_href(link.get("href"))
            if not href:
                continue
            items.append('<li><a href="%s">%s</a></li>' % (esc(href), esc(link.get("text"))))
        if not items:
            return ""
        return '<div class="gf-toollinks"><p>%s</p><ul>%s</ul></div>' % (
            esc(block.get("heading") or "Run this research yourself"), "".join(items))

    # An unknown block type is a bug in the caller, not something to render badly.
    raise RuntimeError("unknown block type: %r" % kind)


def module_id(module, index):
    raw = module.get("id") or module.get("module") or module.get("heading") or ("section-%d" % index)
    slug = re.sub(r"[^a-z0-9]+", "-", str(raw).lower()).strip("-")
    return slug or ("section-%d" % index)


def render_body(article):
    """Render the modules, the jump nav, and the hero key-facts strip.

    A module named `hero-facts` is lifted OUT of the body flow and rendered in
    the hero instead. It is authored as a normal module so the publish gate
    still sees its numbers and demands provenance for them — the gate walks
    body_json, and a hero built from a separate un-gated field would be the one
    place on the page where a number could appear unsourced.
    """
    out, toc, hero_facts = [], [], ""
    for index, module in enumerate(article.get("body_json") or []):
        if module.get("module") == "hero-facts":
            hero_facts = "".join(render_block(b) for b in module.get("blocks") or [])
            continue
        mid = module_id(module, index)
        heading = module.get("heading") or module.get("module") or ""
        toc.append('<li><a href="#%s">%s</a></li>' % (esc(mid), esc(module.get("nav") or heading)))
        blocks = "".join(render_block(b) for b in module.get("blocks") or [])
        sub = ('<p class="gf-mod-sub">%s</p>' % esc(module.get("sub"))) if module.get("sub") else ""
        out.append('<section class="gf-mod" id="%s"><h2>%s</h2>%s%s</section>' % (
            esc(mid), esc(heading), sub, blocks))
    return "".join(out), "".join(toc), hero_facts


def count_trends(article):
    """How many trend rows the Trend Board actually carries.

    Used by the homepage cover. It is counted from the rendered article, never
    typed in by hand: a marketing number that drifts from the page is exactly
    the kind of small lie this whole system exists to prevent.
    """
    n = 0
    for module in article.get("body_json") or []:
        for block in module.get("blocks") or []:
            if (block or {}).get("type") != "trendboard":
                continue
            for cat in block.get("categories") or []:
                n += len(cat.get("items") or [])
    return n


# ------------------------------------------------------------- article render

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


def render_article(article, provenance, neighbours):
    sport = article["sport"]
    sport_label = SPORT_LABEL.get(sport, sport.upper())
    url = "%s/matchups/%s/%s/" % (SITE, sport, article["slug"])
    matchup = "%s vs. %s" % (article["away_team"], article["home_team"])

    hero = check_image(article.get("hero_image_url"), "hero_image_url")
    og_image = absolute(check_image(article.get("og_image_url") or hero, "og_image_url"))
    hero_alt = article.get("hero_image_alt")
    if not hero_alt:
        raise RuntimeError("hero_image_alt is required (accessibility + image search)")

    published = article.get("published_at")
    modified = article.get("content_modified_at") or published
    body_html, toc_html, hero_facts_html = render_body(article)
    if not body_html:
        raise RuntimeError("article %s has no body modules" % article["slug"])

    # ---- structured data. Every field here is also visible on the page. ----
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
            "author": {
                "@type": "Organization",
                "name": "TrustMyRecord Research",
                "url": SITE + "/about/research/",
            },
            "publisher": {
                "@type": "Organization",
                "name": "TrustMyRecord",
                "url": SITE + "/",
                "logo": {"@type": "ImageObject", "url": SITE + "/static/og/og-home.png"},
            },
            "isAccessibleForFree": True,
        },
        {
            "@type": "BreadcrumbList",
            "@id": url + "#breadcrumbs",
            "itemListElement": [
                {"@type": "ListItem", "position": 1, "name": "Home", "item": SITE + "/"},
                {"@type": "ListItem", "position": 2, "name": "Matchups", "item": SITE + "/matchups/"},
                {"@type": "ListItem", "position": 3, "name": sport_label,
                 "item": "%s/matchups/%s/" % (SITE, sport)},
                {"@type": "ListItem", "position": 4, "name": matchup},
            ],
        },
    ]
    graph[0] = {k: v for k, v in graph[0].items() if v is not None}
    jsonld = json.dumps({"@context": "https://schema.org", "@graph": graph},
                        indent=2, ensure_ascii=False)

    # ---- methodology + sources, built from the provenance record ----
    sources = sorted({(p.get("source") or "").strip() for p in provenance if p.get("source")})
    retrieved = [parse_iso(p.get("retrieved_at")) for p in provenance if parse_iso(p.get("retrieved_at"))]
    counts = {}
    for row in provenance:
        counts[row.get("claim_kind") or "fact"] = counts.get(row.get("claim_kind") or "fact", 0) + 1
    source_items = "".join("<li>%s</li>" % esc(SOURCE_LABEL.get(s, s)) for s in sources)
    research_window = human_datetime(max(retrieved).isoformat()) if retrieved else ""

    # ---- previous / next, so no article is ever an orphan ----
    prev_a, next_a = neighbours
    nav_bits = []
    if prev_a:
        nav_bits.append('<a href="/matchups/%s/%s/">&larr; Previous Game File: %s vs. %s</a>' % (
            esc(prev_a["sport"]), esc(prev_a["slug"]), esc(prev_a["away_team"]), esc(prev_a["home_team"])))
    if next_a:
        nav_bits.append('<a href="/matchups/%s/%s/">Next Game File: %s vs. %s &rarr;</a>' % (
            esc(next_a["sport"]), esc(next_a["slug"]), esc(next_a["away_team"]), esc(next_a["home_team"])))

    postgame_html = ""
    postgame = article.get("postgame_json")
    if postgame:
        pg_blocks = "".join(render_block(b) for b in (postgame.get("blocks") or []))
        postgame_html = (
            '<section class="gf-postgame" id="postgame"><h2>Postgame update</h2>'
            '<p class="gf-mod-sub">Added after the game. The pregame analysis below is '
            'unchanged from what we published before first pitch.</p>%s</section>' % pg_blocks)

    return TEMPLATE.format(
        url=esc(url),
        title=esc(article.get("title")),
        description=esc(article.get("meta_description")),
        og_title=esc(article.get("og_title") or article.get("title")),
        og_description=esc(article.get("og_description") or article.get("meta_description")),
        og_image=esc(og_image),
        sport=esc(sport),
        sport_label=esc(sport_label),
        matchup=esc(matchup),
        h1=esc(article.get("h1") or matchup),
        dek=esc(article.get("dek") or ""),
        hero=esc(hero),
        hero_alt=esc(hero_alt),
        jsonld=jsonld,
        published_iso=esc(parse_iso(published).isoformat() if parse_iso(published) else ""),
        modified_iso=esc(parse_iso(modified).isoformat() if parse_iso(modified) else ""),
        published_human=esc(human_date(published)),
        modified_human=esc(human_datetime(modified)),
        game_time_human=esc(human_datetime(article.get("game_time_utc"))),
        venue_sep=" &middot; " if article.get("venue_name") else "",
        venue=esc(article.get("venue_name") or ""),
        toc=toc_html,
        hero_facts=hero_facts_html,
        body=body_html,
        postgame=postgame_html,
        source_items=source_items or "<li>No external sources recorded.</li>",
        research_window=esc(research_window),
        n_facts=counts.get("fact", 0),
        n_derived=counts.get("derived", 0),
        n_analysis=counts.get("analysis", 0),
        n_total=len(provenance),
        prevnext=(" &middot; ".join(nav_bits)) or "",
    )


# Short forms for the Trend Board chips. The long labels below are for the
# methodology block, where there is room to be explicit; a board row needs the
# source named in three words or it stops being scannable.
SOURCE_SHORT = {
    "statsapi": "MLB Stats API",
    "betlegend-pro": "BetLegend Pro",
    "trendspotter": "Trend Spotter",
    "tmr-sim": "TMR Simulator",
    "actionnetwork": "Market feed",
    "fanduel": "FanDuel props",
    "tmr-editorial": "TMR editorial",
}

SOURCE_LABEL = {
    "statsapi": "MLB Stats API (official league data)",
    "betlegend-pro": "BetLegend Pro historical database (TMR)",
    "trendspotter": "TMR Trend Spotter",
    "tmr-sim": "TMR MLB Simulator",
    "actionnetwork": "Market odds feed",
    "fanduel": "FanDuel player props feed",
    "tmr-editorial": "TrustMyRecord Research (editorial analysis)",
}


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
<link rel="stylesheet" href="/static/css/tmr-ds.47f68ba9c379.css">
<link rel="stylesheet" href="/static/css/tmr-gamefile.css">
<script type="application/ld+json">
{jsonld}
</script>
</head>
<body class="tmr-ds tmr-ds--dark">
<main class="gf-article">

  <nav class="gf-crumb" aria-label="Breadcrumb">
    <a href="/">Home</a> <span aria-hidden="true">&rsaquo;</span>
    <a href="/matchups/">Matchups</a> <span aria-hidden="true">&rsaquo;</span>
    <a href="/matchups/{sport}/">{sport_label}</a> <span aria-hidden="true">&rsaquo;</span>
    <span>{matchup}</span>
  </nav>

  <p class="gf-eyebrow">TMR Game File &middot; Matchup of the Day &middot; {sport_label}</p>
  <h1 class="gf-title">{h1}</h1>

  <figure class="gf-hero">
    <img class="gf-hero-img" src="{hero}" alt="{hero_alt}" width="1200" height="630"
         fetchpriority="high" decoding="async">
  </figure>

  <p class="gf-dek">{dek}</p>

  {hero_facts}

  <div class="gf-byline">
    <span>By <a href="/about/research/">TrustMyRecord Research</a></span>
    <span class="gf-sep" aria-hidden="true">|</span>
    <span>Published <time datetime="{published_iso}">{published_human}</time></span>
    <span class="gf-sep" aria-hidden="true">|</span>
    <span>Updated <time datetime="{modified_iso}">{modified_human}</time></span>
    <span class="gf-sep" aria-hidden="true">|</span>
    <span>First pitch {game_time_human}{venue_sep}{venue}</span>
  </div>

  <nav class="gf-toc" aria-label="Sections in this Game File">
    <ol>{toc}</ol>
  </nav>

  {postgame}

  {body}

  <details class="gf-sources" id="methodology">
    <summary>Methodology, sources and research record</summary>
    <div class="gf-sources-in">
      <p>This Game File carries {n_total} recorded research items:
         {n_facts} measured facts, {n_derived} derived metrics and
         {n_analysis} labelled editorial judgements. Every quantitative claim on
         this page has a stored source, sample and retrieval time; our publishing
         system will not publish a number that does not.</p>
      <p>Research completed {research_window}.</p>
      <h3>Sources used</h3>
      <ul>{source_items}</ul>
      <p><a href="/about/research/">How TrustMyRecord Research works</a> &mdash; what
         our tools do, how we grade sample size, and where automation is and is not
         used.</p>
    </div>
  </details>

  <nav class="gf-related" aria-label="More Game Files">
    <p>{prevnext}</p>
    <p><a href="/matchups/{sport}/">All {sport_label} Game Files</a> &middot;
       <a href="/matchups/">All TMR Game Files</a></p>
  </nav>

</main>
<script src="/static/js/config.js?v=7e4b853bbb3d"></script>
<script src="/static/js/tmr-gamefile.js"></script>
<script src="/static/js/tmr-session.63f50f4d0988.js"></script><script src="/static/js/tmr-ds-nav.442cd8eb543c.js"></script>
</body>
</html>
"""


# ------------------------------------------------------------------ listings

def card_html(article, lead=False):
    sport_label = SPORT_LABEL.get(article["sport"], article["sport"].upper())
    matchup = "%s vs. %s" % (article["away_team"], article["home_team"])
    href = "/matchups/%s/%s/" % (article["sport"], article["slug"])
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
            esc("Today's Game File" if lead else sport_label + " Game File"),
            esc(href), esc(matchup),
            esc(article.get("dek") or article.get("meta_description") or ""),
            esc(sport_label), esc(human_date(article.get("published_at")))))


def itemlist_jsonld(articles, list_url, name):
    if not articles:
        return ""
    items = [{
        "@type": "ListItem",
        "position": i + 1,
        "url": "%s/matchups/%s/%s/" % (SITE, a["sport"], a["slug"]),
        "name": "%s vs. %s" % (a["away_team"], a["home_team"]),
    } for i, a in enumerate(articles[:50])]
    payload = {"@context": "https://schema.org", "@type": "ItemList",
               "@id": list_url + "#items", "name": name,
               "numberOfItems": len(items), "itemListElement": items}
    return '<script type="application/ld+json">\n%s\n</script>' % json.dumps(
        payload, indent=2, ensure_ascii=False)


def cover_html(article):
    """The homepage cover. Static, self-contained, no runtime dependency: if the
    API is down the last baked cover is still a correct, clickable link to a real
    article rather than a spinner in the first viewport."""
    matchup_a = esc(article["away_team"])
    matchup_b = esc(article["home_team"])
    href = "/matchups/%s/%s/" % (esc(article["sport"]), esc(article["slug"]))
    label = esc(SPORT_LABEL.get(article["sport"], article["sport"].upper()))
    # Counts are COMPUTED from the article, never authored. A cover that claims
    # "27 trends" over a page carrying nine is the same class of small lie the
    # provenance gate exists to stop, and it would be the first thing a visitor
    # could check.
    trends = count_trends(article)
    claims = len(article.get("provenance") or [])
    modules = len([m for m in (article.get("body_json") or [])
                   if m.get("module") != "hero-facts"])
    stats = []
    if trends:
        stats.append('<span><b>%d</b> sourced matchup trends</span>' % trends)
    if claims:
        stats.append('<span><b>%d</b> verified research claims</span>' % claims)
    if modules:
        stats.append('<span><b>%d</b> analysis modules</span>' % modules)
    stats_html = ('    <p class="motd-stats">%s</p>\n' % "".join(stats)) if stats else ""

    return (
        '\n<section class="motd" aria-labelledby="motd-h">\n'
        '  <div class="motd-in">\n'
        '    <p class="motd-kicker">TMR Matchup of the Day &middot; %s</p>\n'
        '    <h2 class="motd-teams" id="motd-h">'
        '<span>%s</span><em>vs</em><span>%s</span></h2>\n'
        '    <p class="motd-file">The TMR Game File</p>\n'
        '    <p class="motd-dek">%s</p>\n'
        '%s'
        '    <p class="motd-cta">'
        '<a class="motd-btn" href="%s">Enter the Game File</a>'
        '<a class="motd-alt" href="/matchups/">All TMR Game Files</a></p>\n'
        '    <p class="motd-scroll" aria-hidden="true">Scroll for the rest of TrustMyRecord</p>\n'
        '  </div>\n'
        '</section>\n' % (label, matchup_a, matchup_b,
                          esc(article.get("dek") or article.get("meta_description") or ""),
                          stats_html, href))


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
        lines.append('  <url><loc>%s/matchups/%s/%s/</loc>%s'
                     '<changefreq>monthly</changefreq><priority>0.7</priority></url>' % (
                         SITE, a["sport"], a["slug"],
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
    ordered = sorted(articles, key=lambda a: (a.get("published_at") or "", a.get("id") or 0), reverse=True)

    # ---- render every page into memory before touching the tree -------------
    rendered = {}
    for i, a in enumerate(ordered):
        prev_a = ordered[i + 1] if i + 1 < len(ordered) else None
        next_a = ordered[i - 1] if i > 0 else None
        prov = a.get("provenance") or []
        try:
            rendered[a["slug"]] = (
                os.path.join(MATCHUPS_DIR, a["sport"], a["slug"], "index.html"),
                render_article(a, prov, (prev_a, next_a)))
        except Exception as err:                        # noqa: BLE001
            sys.exit("ABORT: %s failed to render: %s" % (a["slug"], err))

    today_iso = dt.datetime.now(dt.timezone.utc).date().isoformat()

    # ---- hub listings -------------------------------------------------------
    # Resolve `featured` back to the row in `articles`. The API's featured field
    # is a bare article record without its provenance attached, and the cover
    # counts research claims off it — using the bare copy silently dropped the
    # "verified research claims" line from the homepage.
    lead = None
    if featured and featured.get("slug"):
        lead = next((a for a in ordered if a["slug"] == featured["slug"]), featured)
    elif ordered:
        lead = ordered[0]
    rest = [a for a in ordered if not lead or a["slug"] != lead["slug"]]

    hub_today = card_html(lead, lead=True) if lead else (
        '<p class="gf-empty">Today&rsquo;s Game File is being prepared. '
        'It publishes in the morning, ahead of first pitch.</p>')
    hub_recent = "".join(card_html(a) for a in rest[:20]) or (
        '<p class="gf-empty">The archive starts with our first published Game File.</p>')

    sports_present = sorted({a["sport"] for a in ordered})
    sport_items = []
    for sport in sports_present or ["mlb"]:
        label = SPORT_LABEL.get(sport, sport.upper())
        n = sum(1 for a in ordered if a["sport"] == sport)
        sport_items.append(
            '<li><a href="/matchups/%s/">%s Game Files &mdash; matchup analysis, trends and advanced stats</a>'
            '%s</li>' % (esc(sport), esc(label),
                         (' <span class="gf-sample">%d published</span>' % n) if n else ""))
    hub_sports = '<ul class="gf-sportlist">%s</ul>' % "".join(sport_items)

    writes = []

    hub_path = os.path.join(MATCHUPS_DIR, "index.html")
    hub = read(hub_path)
    hub = replace_marker(hub, "matchupsHubToday", hub_today, hub_path)
    hub = replace_marker(hub, "matchupsHubRecent", hub_recent, hub_path)
    hub = replace_marker(hub, "matchupsHubSports", hub_sports, hub_path)
    hub = replace_marker(hub, "matchupsHubItemList",
                         itemlist_jsonld(ordered, SITE + "/matchups/", "TMR Game Files"), hub_path)
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
        in_sport = [a for a in ordered if a["sport"] == sport]
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

    # ---- homepage cover -----------------------------------------------------
    home = read(HOME)
    if "<!--MK:motdCover-->" in home:
        home = replace_marker(home, "motdCover", cover_html(lead) if lead else "", HOME)
        writes.append((HOME, home))
    else:
        print("WARN: homepage has no MK:motdCover marker; cover not injected")

    # ---- sitemap ------------------------------------------------------------
    # Hubs are discovered from DISK, not from the published set. A sport hub is
    # a real editorial page in its own right (what a Game File covers, how we
    # grade sample size, links into the tools), so it belongs in the sitemap
    # from the day it ships — including the day before the first article in that
    # sport publishes. Deriving the hub list from `sports_present` instead would
    # silently drop /matchups/mlb/ out of the sitemap whenever nothing is
    # published, which is exactly the kind of on-again-off-again URL that taught
    # Google to distrust this site's sitemap in the first place.
    hubs = [("%s/matchups/" % SITE, today_iso)]
    if os.path.isdir(MATCHUPS_DIR):
        for sport in sorted(os.listdir(MATCHUPS_DIR)):
            if os.path.exists(os.path.join(MATCHUPS_DIR, sport, "index.html")):
                hubs.append(("%s/matchups/%s/" % (SITE, sport), today_iso))
    sitemap = update_sitemap(read(SITEMAP), sitemap_block(ordered, hubs))
    writes.append((SITEMAP, sitemap))

    # ---- orphan report. REPORT ONLY. Nothing here deletes anything. ---------
    known = {a["slug"] for a in ordered}
    orphans = []
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
        print("NOTE: /matchups/%s/ is on disk but not in the published set. "
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
    for path, text in writes:
        write(path, text)

    print("baked %d Game File(s); updated %d shared file(s)" % (len(rendered), len(writes)))


if __name__ == "__main__":
    main()
