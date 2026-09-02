#!/usr/bin/env python3
"""
build_trivia_categories.py - generate the crawlable league pages
/trivia/nfl/, /trivia/nba/, /trivia/mlb/, /trivia/nhl/ from the ONE canonical
trivia page at trivia/index.html.

TRIVIA_SEO_CATEGORY_ROUTES_20260811.

These are not second trivia applications. Each generated file is the canonical
page with a league-specific <head>, <h1>, intro line and one supporting
paragraph swapped in, plus a single `window.TMR_TRIVIA_CATEGORY` line that tells
the existing engine which league to lead with. Every line of quiz, scoring,
timing, leaderboard, history and create logic is the same bytes as
trivia/index.html, so there is exactly one code path to maintain.

Edit trivia/index.html, then re-run this script. Never hand-edit a generated
file: tests/trivia-category-pages-test.js regenerates in memory and fails the
build if a committed page has drifted.

Run: python scripts/build_trivia_categories.py [--check]
     --check verifies the committed pages match without writing anything.

To disable this release entirely: set TRIVIA_SEO_CATEGORY_ROUTES to [] in
trivia/index.html, delete the trivia/<slug>/ directories, and drop the four URLs
from sitemap.xml. /trivia/ itself is untouched by all of that.
"""
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MASTER = os.path.join(ROOT, "trivia", "index.html")
SITE = "https://trustmyrecord.com"
OG_IMAGE = SITE + "/static/og/og-trivia.png"

# Only leagues that really exist in /api/trivia/v2/categories. There is no
# soccer category on the backend, so there is no /trivia/soccer/ page.
LEAGUES = {
    "nfl": {
        "name": "NFL Trivia",
        "sport": "football",
        "h1": "NFL TRIVIA",
        "title": "NFL Trivia: Free Football Trivia Questions & Quiz | TrustMyRecord",
        "description": (
            "Free NFL trivia. Timed football trivia questions on quarterbacks, Super Bowls, "
            "records and draft history. Score points, build streaks and climb the leaderboard."),
        "og_title": "NFL Trivia | Free Football Trivia Questions",
        "intro": (
            "Timed NFL trivia questions on quarterbacks, Super Bowls, records and draft history. "
            "Climb the leaderboard, or contribute your own questions to the community pool."),
        "copy": (
            "TrustMyRecord's NFL trivia runs on a server-side clock, so a football trivia round here "
            "is a real test rather than a browser quiz you can pause. Questions span Super Bowl "
            "history, single-season and career records, quarterback lore, draft classes, coaching "
            "trees and the moments that decided seasons, and each one is graded easy, medium or hard "
            "before you see it. Answer fast and the speed multiplier pays up to double; let the clock "
            "run out and the question scores zero. Every NFL question in the pool was either written "
            "for the site or submitted by a member and reviewed, so the mix keeps growing. Create a "
            "free TrustMyRecord profile to save your football trivia scores, build a streak across "
            "sessions and appear on the public NFL leaderboard."),
        "keywords": ("nfl trivia, football trivia, nfl trivia questions, football trivia questions, "
                     "nfl quiz, football quiz, super bowl trivia, nfl trivia game"),
    },
    "nba": {
        "name": "NBA Trivia",
        "sport": "basketball",
        "h1": "NBA TRIVIA",
        "title": "NBA Trivia: Free Basketball Trivia Questions & Quiz | TrustMyRecord",
        "description": (
            "Free NBA trivia. Timed basketball trivia questions on Finals history, scoring records, "
            "MVPs and draft classes. Score points, build streaks and climb the leaderboard."),
        "og_title": "NBA Trivia | Free Basketball Trivia Questions",
        "intro": (
            "Timed NBA trivia questions on Finals history, scoring records, MVPs and draft classes. "
            "Climb the leaderboard, or contribute your own questions to the community pool."),
        "copy": (
            "TrustMyRecord's NBA trivia is played against a server-side clock, so a basketball trivia "
            "round is a real test of recall rather than a quiz you can stall on. Questions run from "
            "Finals history and championship rosters through scoring records, MVP and Defensive Player "
            "voting, dynasty eras, draft classes and the trades that reshaped the league, each graded "
            "easy, medium or hard before it reaches you. Answering quickly pays: the speed multiplier "
            "goes up to double on a correct answer, while an expired question scores nothing. The pool "
            "keeps growing because members write and submit basketball trivia questions of their own. "
            "Create a free TrustMyRecord profile to save scores, build a streak and rank on the public "
            "NBA leaderboard."),
        "keywords": ("nba trivia, basketball trivia, nba trivia questions, basketball trivia questions, "
                     "nba quiz, basketball quiz, nba finals trivia, nba trivia game"),
    },
    "mlb": {
        "name": "MLB Trivia",
        "sport": "baseball",
        "h1": "MLB TRIVIA",
        "title": "MLB Trivia: Free Baseball Trivia Questions & Quiz | TrustMyRecord",
        "description": (
            "Free MLB trivia. Timed baseball trivia questions on World Series history, career records "
            "and Hall of Famers. Score points, build streaks and climb the leaderboard."),
        "og_title": "MLB Trivia | Free Baseball Trivia Questions",
        "intro": (
            "Timed MLB trivia questions on World Series history, career records, Hall of Famers and "
            "stats. Climb the leaderboard, or contribute your own questions to the community pool."),
        "copy": (
            "MLB trivia is the deepest category on TrustMyRecord, and it is played against a "
            "server-side clock rather than an honour system. Baseball trivia questions cover World "
            "Series history, career and single-season records, Hall of Fame cases, no-hitters and "
            "perfect games, franchise history and the statistical arguments that never quite settle, "
            "each graded easy, medium or hard before you see it. A fast correct answer earns up to "
            "double points from the speed multiplier; a question that times out earns zero. Because "
            "members submit and review baseball questions, the pool keeps deepening rather than going "
            "stale. Create a free TrustMyRecord profile to save your MLB trivia scores, carry a streak "
            "between sessions and climb the public leaderboard."),
        "keywords": ("mlb trivia, baseball trivia, mlb trivia questions, baseball trivia questions, "
                     "mlb quiz, baseball quiz, world series trivia, mlb trivia game"),
    },
    "nhl": {
        "name": "NHL Trivia",
        "sport": "hockey",
        "h1": "NHL TRIVIA",
        "title": "NHL Trivia: Free Hockey Trivia Questions & Quiz | TrustMyRecord",
        "description": (
            "Free NHL trivia. Timed hockey trivia questions on Stanley Cup history, scoring records "
            "and goaltenders. Score points, build streaks and climb the leaderboard."),
        "og_title": "NHL Trivia | Free Hockey Trivia Questions",
        "intro": (
            "Timed NHL trivia questions on Stanley Cup history, scoring records, goaltenders and "
            "dynasties. Climb the leaderboard, or contribute your own questions to the community pool."),
        "copy": (
            "TrustMyRecord's NHL trivia runs on a server-side clock, so a hockey trivia round is a "
            "genuine recall test instead of a quiz you can pause and look up. Questions cover Stanley "
            "Cup history and playoff runs, scoring and goaltending records, dynasty rosters, trophy "
            "voting, expansion and relocation, and the goals people still argue about, each graded "
            "easy, medium or hard before it is served. Answer fast and the speed multiplier can double "
            "the points; let the clock expire and the question is worth nothing. Members write and "
            "submit hockey questions too, so the pool keeps growing. Create a free TrustMyRecord "
            "profile to save your NHL trivia scores, build a streak and take a place on the public "
            "leaderboard."),
        "keywords": ("nhl trivia, hockey trivia, nhl trivia questions, hockey trivia questions, "
                     "nhl quiz, hockey quiz, stanley cup trivia, nhl trivia game"),
    },
}

SUPPORTING_ANCHOR = (
    "    <!-- Supporting info (moved below the game so the categories sit near the top) -->")


def esc(s):
    return (s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;"))


def build(slug, cfg, master):
    """Return the generated bytes for /trivia/<slug>/index.html."""
    t = master
    url = SITE + "/trivia/" + slug + "/"
    img_alt = "TrustMyRecord %s - free %s trivia questions" % (cfg["name"], cfg["sport"])

    def one(old, new, label):
        if t.count(old) != 1:
            raise SystemExit("ABORT [%s] %s: expected 1 occurrence, found %d"
                             % (slug, label, t.count(old)))
        return t.replace(old, new, 1)

    # ---- head -------------------------------------------------------------
    t = one('<link rel="canonical" href="%s/trivia/">' % SITE,
            '<link rel="canonical" href="%s">' % url, "canonical")
    t = one("<title>Sports Trivia: NFL, NBA, MLB &amp; NHL Quizzes | TrustMyRecord</title>",
            "<title>%s</title>" % esc(cfg["title"]), "title")
    t = one('<meta name="description" content="Free sports trivia: timed NFL, NBA, MLB and NHL '
            'quizzes plus sports history and mixed rounds. Score points, build streaks and climb '
            'the public leaderboard.">',
            '<meta name="description" content="%s">' % esc(cfg["description"]), "description")
    t = re.subn(r'<meta name="keywords" content="[^"]*">',
                '<meta name="keywords" content="%s">' % esc(cfg["keywords"]), t, count=1)[0]
    t = one('<meta property="og:title" content="Free Sports Trivia | NFL, NBA, MLB &amp; NHL Quizzes">',
            '<meta property="og:title" content="%s">' % esc(cfg["og_title"]), "og:title")
    t = one('<meta property="og:description" content="Play sports trivia tied to your public profile. '
            'Climb the trivia leaderboard and prove you actually know sports.">',
            '<meta property="og:description" content="%s">' % esc(cfg["description"]), "og:description")
    t = one('<meta property="og:url" content="%s/trivia/">' % SITE,
            '<meta property="og:url" content="%s">' % url, "og:url")
    t = one('<meta property="og:image:alt" content="TrustMyRecord sports trivia — free NFL, NBA, '
            'MLB and NHL quizzes">',
            '<meta property="og:image:alt" content="%s">' % esc(img_alt), "og:image:alt")
    t = one('<meta name="twitter:title" content="Free Sports Trivia | NFL, NBA, MLB &amp; NHL Quizzes">',
            '<meta name="twitter:title" content="%s">' % esc(cfg["og_title"]), "twitter:title")
    t = one('<meta name="twitter:description" content="Timed sports trivia scored on the server. '
            'Build streaks and climb the public TrustMyRecord leaderboard.">',
            '<meta name="twitter:description" content="%s">' % esc(cfg["description"]), "twitter:description")
    t = one('<meta name="twitter:image:alt" content="TrustMyRecord sports trivia — free NFL, NBA, '
            'MLB and NHL quizzes">',
            '<meta name="twitter:image:alt" content="%s">' % esc(img_alt), "twitter:image:alt")

    # ---- which league this shell initialises ------------------------------
    t = one('    <meta charset="UTF-8">\r\n',
            '    <meta charset="UTF-8">\r\n'
            '    <script>window.TMR_TRIVIA_CATEGORY = "%s";</script>\r\n' % slug,
            "TMR_TRIVIA_CATEGORY")

    # ---- structured data --------------------------------------------------
    t = one('{"@type": "ListItem", "position": 2, "name": "SPORTS TRIVIA", "item": '
            '"%s/trivia/"}]}' % SITE,
            '{"@type": "ListItem", "position": 2, "name": "Sports Trivia", "item": "%s/trivia/"}, '
            '{"@type": "ListItem", "position": 3, "name": "%s", "item": "%s"}]}'
            % (SITE, cfg["name"], url), "BreadcrumbList")
    t = one('"@type": "WebApplication", "name": "TrustMyRecord Sports Trivia", '
            '"url": "%s/trivia/"' % SITE,
            '"@type": "WebApplication", "name": "TrustMyRecord %s", "url": "%s"'
            % (cfg["name"], url), "WebApplication name/url")
    t = one('"applicationSubCategory": "Sports Trivia"',
            '"applicationSubCategory": "%s"' % cfg["name"], "WebApplication subcategory")
    t = one('"description": "Free timed sports trivia quizzes on TrustMyRecord. Answer NFL, NBA, MLB, '
            'NHL, sports history, mixed sports and pop culture questions against a server-run clock, '
            'earn points for speed and accuracy, build streaks and climb the public trivia '
            'leaderboard.", ',
            '"description": "%s", ' % cfg["description"], "WebApplication description")

    # ---- visible page -----------------------------------------------------
    t = one("<h1>SPORTS TRIVIA</h1>", "<h1>%s</h1>" % esc(cfg["h1"]), "h1")
    t = one("<p>Test your knowledge across NFL, NBA, MLB, NHL and more. Climb the leaderboard. "
            "Or contribute your own questions to the community pool.</p>",
            "<p>%s</p>" % esc(cfg["intro"]), "intro paragraph")

    league_block = (
        '    <div class="glass-card" style="margin-top:28px;">\r\n'
        '        <h2 style="margin-bottom: 10px;font-size:1.05rem;">About %s</h2>\r\n'
        '        <p style="color: var(--text-muted); line-height: 1.6; margin: 0 0 12px;font-size:14px;">%s</p>\r\n'
        '        <p style="color: var(--text-muted); line-height: 1.6; margin: 0;font-size:14px;">'
        'More categories: %s &middot; <a href="/trivia/">all sports trivia</a>.</p>\r\n'
        '    </div>\r\n\r\n' % (esc(cfg["name"]), esc(cfg["copy"]), sibling_links(slug)))
    t = one(SUPPORTING_ANCHOR, league_block + SUPPORTING_ANCHOR, "league copy block")

    return t.encode("utf-8")


def sibling_links(slug):
    """Crawlable links from each league page to the other three."""
    return " &middot; ".join(
        '<a href="/trivia/%s/">%s</a>' % (s, LEAGUES[s]["name"])
        for s in LEAGUES if s != slug)


def nl_agnostic(b):
    return b.replace(bytes([13, 10]), bytes([10]))


# Content-hash pins: "?v=<12 hex>" query pins and "<name>.<12 hex>.<ext>" files.
PIN_RE = re.compile(rb"(" + re.escape(b"?v=") + rb")[0-9a-f]{12}|[.][0-9a-f]{12}([.](?:js|css|png|jpg|jpeg|webp|svg|ico|woff2?))")


def pin_agnostic(b):
    """Content-hash pins are not content. The Static Asset Versions workflow
    lands them in two commits (publish the hashed builds, then re-pin every
    page), so a push that runs this check between the two sees the master and
    the league pages carrying different hashes for the same asset. Only what
    the master says should red the build, so hashes are blanked on both sides."""
    return PIN_RE.sub(lambda m: (m.group(1) or b"") + b"HASH" + (m.group(2) or b""), nl_agnostic(b))


def main():
    check = "--check" in sys.argv
    master = open(MASTER, "rb").read().decode("utf-8")
    # The anchors below carry CRLF because the repo files do. A Linux CI checkout
    # (core.autocrlf) hands us LF, and every anchor then reads "found 0", so the
    # master is normalised back to CRLF before any anchor is looked for.
    if chr(13) + chr(10) not in master:
        master = master.replace(chr(10), chr(13) + chr(10))
    if "<script>window.TMR_TRIVIA_CATEGORY = " in master:
        raise SystemExit("ABORT: trivia/index.html looks like a generated league page, not the master")

    failures = []
    for slug in LEAGUES:
        out = build(slug, LEAGUES[slug], master)
        # fail closed on the C: NULL-byte hazard and on newline damage
        assert b"\x00" not in out, "NULL bytes in generated %s" % slug
        assert out.replace(b"\r\n", b"").count(b"\r") == 0, "stray CR in generated %s" % slug
        assert out.count(b"<h1") == 1, "generated %s does not have exactly one h1" % slug
        assert b"noindex" not in out, "generated %s carries noindex" % slug

        path = os.path.join(ROOT, "trivia", slug, "index.html")
        if check:
            have = open(path, "rb").read() if os.path.exists(path) else b""
            # Compare newline-insensitively. core.autocrlf means a Linux CI
            # checkout can hand us LF where a Windows box has CRLF; that is a
            # checkout artefact, not content drift, and only content drift
            # should red the build.
            if pin_agnostic(have) != pin_agnostic(out):
                failures.append(slug)
                print("  DRIFT  /trivia/%s/ (%d bytes on disk, %d generated)"
                      % (slug, len(have), len(out)))
            else:
                print("  ok     /trivia/%s/ (%d bytes)" % (slug, len(out)))
        else:
            os.makedirs(os.path.dirname(path), exist_ok=True)
            open(path, "wb").write(out)
            back = open(path, "rb").read()
            assert back == out, "short write on %s" % path
            print("  wrote  trivia/%s/index.html (%d bytes)" % (slug, len(out)))

    if failures:
        raise SystemExit("\nFAILED: %d generated page(s) drifted from trivia/index.html. "
                         "Run: python scripts/build_trivia_categories.py" % len(failures))
    print("\n%s %d league pages" % ("checked" if check else "generated", len(LEAGUES)))


if __name__ == "__main__":
    main()
