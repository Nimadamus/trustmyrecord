#!/usr/bin/env python3
"""
build_mlb_matchup_pages.py - give every MLB game a permanent, crawlable page,
and give the MLB Handicapping Hub server rendered content underneath its cards.

WHY THIS EXISTS
---------------
Audited 2026-08-23. /handicapping/mlb/ shipped 7,389 bytes of HTML: a date bar,
three loading skeletons and a <template>. Every game, every probable pitcher,
every line, every trend arrived from JavaScript after load. So the page had one
crawlable URL for a slate that changes daily, no game ever had an address of its
own, and a search for "pirates vs dodgers odds" had nothing on this site to
match. The tool was fine. The publishing around it did not exist.

WHAT THIS WRITES
----------------
    handicapping/mlb/<away>-vs-<home>-<date>/index.html
        one permanent page per scheduled game, fully baked

    handicapping/mlb/index.html
        the crawlable slate summary between <!--MK:mlbSlateSSR--> markers,
        and the ItemList/BreadcrumbList JSON-LD between <!--MK:mlbHubLd-->

    handicapping/mlb/probable-pitchers/index.html
    handicapping/mlb/odds/index.html
    handicapping/mlb/trends/index.html
        three daily views over datasets the matchup pages do not surface as a
        list: every starter ranked, the whole board including First 5 and team
        totals, and every verified trend with its sample

    sitemap.xml
        the <!-- BEGIN_MLB_MATCHUP_URLS --> block

Build only. Does NOT commit and does NOT deploy. Run from the repo root:

    python scripts/build_mlb_matchup_pages.py
    python scripts/build_mlb_matchup_pages.py --dry-run
    python scripts/build_mlb_matchup_pages.py --date 2026-08-23

THE RULES THIS FILE ENFORCES
----------------------------
1. A PUBLISHED MATCHUP DIRECTORY IS NEVER DELETED.

   Same rule, and the same reason, as build_matchup_articles.py: build_forum_
   threads.py once pruned directories whose per-item fetch had failed and served
   indexed URLs a 404 every time the API blipped. A game page is a permanent
   record of a game that was really played. It drops out of the sitemap when it
   ages out of the window; the URL keeps answering 200 forever.

2. FAIL CLOSED. WRITE NOTHING ON A BAD READ.

   Every page renders into memory first. If the schedule cannot be read, or any
   page fails to render, the script exits non-zero having written nothing and
   the last good bake stays live.

3. NOTHING IS INVENTED. A number is either real and sourced, or the page says
   the provider does not supply it. That is the same rule routes/handicapping.js
   enforces on the API side, and it does not get relaxed on the way to HTML.

4. IT TOUCHES ONLY ITS OWN MARKERS. The hub's interactive slate, its date bar,
   its template and its scripts are not read, not moved and not rewritten.
"""

import argparse
import datetime as dt
import html
import io
import json
import os
import re
import sys
import urllib.parse
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from schema_event import event_description, sports_event  # noqa: E402
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = "https://trustmyrecord.com"
API = os.environ.get("TMR_API", "https://trustmyrecord-api.onrender.com/api")
STATS_API = "https://statsapi.mlb.com/api/v1"
HUB = "/handicapping/mlb/"
TIMEOUT = 45

# ---------------------------------------------------------------------------
# Team tables. The slug half is the URL contract: once a game page is published
# at a slug it must keep that slug forever, so these are hardcoded rather than
# derived from a team name that MLB can and does rename (the Athletics dropped
# their city in 2025, and Cleveland changed nickname in 2022).
# ---------------------------------------------------------------------------
TEAMS = {
    "Arizona Diamondbacks":  ("diamondbacks", "ari"),
    "Atlanta Braves":        ("braves",       "atl"),
    "Baltimore Orioles":     ("orioles",      "bal"),
    "Boston Red Sox":        ("red-sox",      "bos"),
    "Chicago Cubs":          ("cubs",         "chc"),
    "Chicago White Sox":     ("white-sox",    "chw"),
    "Cincinnati Reds":       ("reds",         "cin"),
    "Cleveland Guardians":   ("guardians",    "cle"),
    "Colorado Rockies":      ("rockies",      "col"),
    "Detroit Tigers":        ("tigers",       "det"),
    "Houston Astros":        ("astros",       "hou"),
    "Kansas City Royals":    ("royals",       "kc"),
    "Los Angeles Angels":    ("angels",       "laa"),
    "Los Angeles Dodgers":   ("dodgers",      "lad"),
    "Miami Marlins":         ("marlins",      "mia"),
    "Milwaukee Brewers":     ("brewers",      "mil"),
    "Minnesota Twins":       ("twins",        "min"),
    "New York Mets":         ("mets",         "nym"),
    "New York Yankees":      ("yankees",      "nyy"),
    "Athletics":             ("athletics",    "oak"),
    "Oakland Athletics":     ("athletics",    "oak"),
    "Philadelphia Phillies": ("phillies",     "phi"),
    "Pittsburgh Pirates":    ("pirates",      "pit"),
    "San Diego Padres":      ("padres",       "sd"),
    "San Francisco Giants":  ("giants",       "sf"),
    "Seattle Mariners":      ("mariners",     "sea"),
    "St. Louis Cardinals":   ("cardinals",    "stl"),
    "Tampa Bay Rays":        ("rays",         "tb"),
    "Texas Rangers":         ("rangers",      "tex"),
    "Toronto Blue Jays":     ("blue-jays",    "tor"),
    "Washington Nationals":  ("nationals",    "wsh"),
}

MONTHS = ["January", "February", "March", "April", "May", "June", "July",
          "August", "September", "October", "November", "December"]


def slugify(text):
    s = re.sub(r"[^a-z0-9]+", "-", str(text or "").lower()).strip("-")
    return s or "team"


def team_slug(name):
    hit = TEAMS.get(name)
    return hit[0] if hit else slugify(name)


def team_abbr(name):
    hit = TEAMS.get(name)
    return hit[1] if hit else None


def logo_url(name):
    a = team_abbr(name)
    return "https://a.espncdn.com/i/teamlogos/mlb/500/%s.png" % a if a else None


def nickname(name):
    """Display short form: 'Los Angeles Dodgers' -> 'Dodgers', 'Red Sox' kept."""
    hit = TEAMS.get(name)
    if not hit:
        return name
    return " ".join(w.capitalize() if w not in ("sox", "jays") else w.capitalize()
                    for w in hit[0].split("-"))


# ---------------------------------------------------------------------------
# fetch
# ---------------------------------------------------------------------------
class BuildError(RuntimeError):
    pass


def get_json(url, attempts=3):
    last = None
    for i in range(attempts):
        try:
            req = urllib.request.Request(url, headers={
                "Accept": "application/json",
                "User-Agent": "trustmyrecord-mlb-page-builder/1.0",
            })
            with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
                return json.loads(r.read().decode("utf-8"))
        except Exception as e:  # noqa: BLE001 - reported, never swallowed
            last = e
    raise BuildError("GET failed after %d attempts: %s (%s)" % (attempts, url, last))


# ---------------------------------------------------------------------------
# formatting helpers. Every one of them returns None when the value is missing,
# and the renderers turn None into an explicit "not supplied" cell. None of them
# ever substitutes a zero.
# ---------------------------------------------------------------------------
def esc(v):
    return html.escape("" if v is None else str(v), quote=True)


def has(v):
    return v is not None and v != "" and v != []


def num(v, places=2):
    if not has(v):
        return None
    try:
        return ("%%.%df" % places) % float(v)
    except (TypeError, ValueError):
        return str(v)


def pct(v, places=1):
    if not has(v):
        return None
    try:
        return ("%%.%df%%%%" % places) % float(v)
    except (TypeError, ValueError):
        return str(v)


def odds_str(v):
    if not has(v):
        return None
    try:
        n = int(round(float(v)))
    except (TypeError, ValueError):
        return str(v)
    return "+%d" % n if n > 0 else str(n)


def line_str(v):
    if not has(v):
        return None
    try:
        n = float(v)
    except (TypeError, ValueError):
        return str(v)
    txt = ("%g" % n)
    return "+" + txt if n > 0 else txt


def et_time(iso):
    """First pitch as an Eastern clock time. MLB schedules in ET, and a baked
       page cannot know the reader's zone, so ET is stated rather than implied."""
    if not iso:
        return None
    try:
        t = dt.datetime.strptime(iso.replace("Z", "+0000"), "%Y-%m-%dT%H:%M:%S%z")
    except ValueError:
        try:
            t = dt.datetime.strptime(iso[:19] + "+0000", "%Y-%m-%dT%H:%M:%S%z")
        except ValueError:
            return None
    # US Eastern: DST from the second Sunday in March to the first Sunday in
    # November. Computed rather than imported so the script stays stdlib only
    # and matches the CI runner regardless of its tzdata.
    y = t.year
    mar = dt.datetime(y, 3, 8, tzinfo=dt.timezone.utc)
    while mar.weekday() != 6:
        mar += dt.timedelta(days=1)
    nov = dt.datetime(y, 11, 1, tzinfo=dt.timezone.utc)
    while nov.weekday() != 6:
        nov += dt.timedelta(days=1)
    dst = mar + dt.timedelta(hours=7) <= t < nov + dt.timedelta(hours=6)
    local = t + dt.timedelta(hours=-4 if dst else -5)
    hour = local.hour % 12 or 12
    return "%d:%02d %s ET" % (hour, local.minute, "PM" if local.hour >= 12 else "AM")


def long_date(iso_date):
    y, m, d = (int(x) for x in iso_date.split("-"))
    return "%s %d, %d" % (MONTHS[m - 1], d, y)


def short_date(iso_date):
    """"Aug 23 2026". Titles are a width budget, not a place for a full date:
       Google truncates around 60 to 65 characters and the teams and the market
       words matter more than the comma after the month."""
    y, m, d = (int(x) for x in iso_date.split("-"))
    return "%s %d %d" % (MONTHS[m - 1][:3], d, y)


def weekday_name(iso_date):
    y, m, d = (int(x) for x in iso_date.split("-"))
    return ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday",
            "Saturday", "Sunday"][dt.date(y, m, d).weekday()]


def hand_word(code):
    return {"R": "right handed", "L": "left handed", "S": "switch"}.get(code)


def avail(section):
    return isinstance(section, dict) and section.get("available") is True


# ---------------------------------------------------------------------------
# data gathering
# ---------------------------------------------------------------------------
def fetch_schedule(date):
    d = get_json("%s/schedule?sportId=1&date=%s&hydrate=probablePitcher,team,venue,linescore"
                 % (STATS_API, urllib.parse.quote(date)))
    games = []
    for day in d.get("dates") or []:
        for g in day.get("games") or []:
            teams = g.get("teams") or {}
            away, home = teams.get("away") or {}, teams.get("home") or {}
            away_name = ((away.get("team") or {}).get("name"))
            home_name = ((home.get("team") or {}).get("name"))
            if not away_name or not home_name:
                continue
            status = ((g.get("status") or {}).get("abstractGameState")) or ""
            games.append({
                "game_pk": g.get("gamePk"),
                "date": date,
                "start_utc": g.get("gameDate"),
                "venue": (g.get("venue") or {}).get("name"),
                "away_team": away_name,
                "home_team": home_name,
                "game_number": g.get("gameNumber") or 1,
                "doubleheader": (g.get("doubleHeader") or "N") != "N",
                "status": status,
                "detailed_status": (g.get("status") or {}).get("detailedState"),
                "away_score": away.get("score"),
                "home_score": home.get("score"),
                "away_probable": ((away.get("probablePitcher") or {}) or {}).get("fullName"),
                "home_probable": ((home.get("probablePitcher") or {}) or {}).get("fullName"),
            })
    games.sort(key=lambda g: (g.get("start_utc") or "", g["away_team"]))
    return games


def matchup_slug(g):
    base = "%s-vs-%s-%s" % (team_slug(g["away_team"]), team_slug(g["home_team"]), g["date"])
    if g.get("game_number") and int(g["game_number"]) > 1:
        base += "-game-%d" % int(g["game_number"])
    return base


def matchup_url(g):
    return "%s%s/" % (HUB, matchup_slug(g))


def fetch_research(g):
    url = ("%s/handicapping/mlb/matchup?away=%s&home=%s&date=%s"
           % (API, urllib.parse.quote(g["away_team"]),
              urllib.parse.quote(g["home_team"]), g["date"]))
    return get_json(url)


def fetch_board():
    """Live sportsbook markets. Optional: a slate with no board still bakes, the
       lines section just says the board is not carrying the game."""
    try:
        return get_json("%s/games/board/baseball_mlb?limit=80" % API)
    except BuildError as e:
        print("  WARN  board unavailable, pages will bake without lines (%s)" % e)
        return {"games": []}


def fetch_verified_trends():
    try:
        return get_json("%s/trendspotter/verified?sport=MLB" % API)
    except BuildError as e:
        print("  WARN  verified trend feed unavailable (%s)" % e)
        return {"trends": [], "matchups": []}


def fetch_game_files():
    try:
        return get_json("%s/matchups?limit=200" % API)
    except BuildError as e:
        print("  WARN  Game File index unavailable (%s)" % e)
        return {"articles": []}


def fetch_consensus():
    try:
        return get_json("%s/external-picks/consensus?days=3" % API)
    except BuildError as e:
        print("  WARN  community consensus unavailable (%s)" % e)
        return {"groups": []}


def implied(american):
    """American price -> implied probability. Used only to pick the main line."""
    try:
        n = float(str(american).replace("+", ""))
    except (TypeError, ValueError):
        return None
    if n == 0:
        return None
    return (100.0 / (n + 100.0)) if n > 0 else ((-n) / ((-n) + 100.0))


def main_team_totals(team_totals):
    """The board carries every team total rung, and DraftKings prices both sides
       on most of them, so "has both sides" does not isolate the real line. The
       main line is the rung whose two prices sit closest to each other, which is
       what the book is actually hanging the market on. One row per team."""
    best = {}
    for (team, line), sides in team_totals.items():
        o, u = implied(sides.get("over")), implied(sides.get("under"))
        if o is None or u is None:
            continue
        spread = abs(o - u)
        if team not in best or spread < best[team][0]:
            best[team] = (spread, line, sides)
    return [(team, best[team][1], best[team][2]) for team in sorted(best)]


def board_for(board, g):
    for bg in board.get("games") or []:
        if (bg.get("away_team") == g["away_team"] and bg.get("home_team") == g["home_team"]
                and str(bg.get("commence_time") or "")[:10] == g["date"]):
            return bg
    return None


def markets_from(bg):
    """Flatten one board game into the markets a matchup page shows.

       Returns a dict of already formatted strings, or None per market when the
       book is not pricing it. Nothing is derived from another market: an absent
       run line stays absent rather than being implied from the moneyline."""
    out = {"book": None, "updated": None, "ml": {}, "rl": {}, "total": {},
           "f5_ml": {}, "f5_total": {}, "team_totals": {}, "nrfi": {}}
    if not bg:
        return out
    books = bg.get("bookmakers") or []
    out["book"] = (books[0].get("title") if books else None)
    out["updated"] = bg.get("updated_at")
    for mg in bg.get("market_groups") or []:
        key = mg.get("key")
        for it in mg.get("items") or []:
            sel = it.get("selection")
            label = it.get("selection_label") or sel
            odds = odds_str(it.get("odds"))
            line = it.get("line")
            mt = it.get("market_type") or ""
            if key == "full_game" and mt == "h2h":
                out["ml"][sel] = odds
            elif key == "spread":
                out["rl"][sel] = {"line": line_str(line), "odds": odds}
            elif key == "total":
                side = "over" if str(label).lower().startswith("over") else "under"
                out["total"][side] = {"line": line_str(line) if line is not None else None,
                                      "raw_line": line, "odds": odds}
            elif key == "first_5" and mt in ("h2h", "f5_h2h"):
                out["f5_ml"][sel] = odds
            elif key == "first_5" and "total" in mt:
                side = "over" if "over" in str(label).lower() else "under"
                out["f5_total"][side] = {"raw_line": line, "odds": odds}
            elif key == "team_totals" and line is not None:
                # The board carries the main team total AND a ladder of alt
                # lines, and the alt rungs are Over only. Grouping by (team,
                # line) and keeping only the rungs that have BOTH sides is what
                # isolates the real team total: two rows a game instead of the
                # twenty-nine the raw feed hands over.
                team = re.sub(r"\s+(Over|Under)$", "", str(sel or ""), flags=re.I).strip()
                side = "under" if "under" in str(sel or label).lower() else "over"
                out["team_totals"].setdefault((team, line), {})[side] = odds
            elif key == "first_inning":
                side = "under" if str(sel or label).lower().startswith("under") else "over"
                out["nrfi"][side] = {"line": line, "odds": odds}
    return out


def trends_for(trend_feed, g):
    away, home = g["away_team"].upper(), g["home_team"].upper()
    hits = []
    for t in trend_feed.get("trends") or []:
        if str(t.get("away_abbr", "")).upper() == away and \
           str(t.get("home_abbr", "")).upper() == home and \
           str(t.get("slate_date", "")) == g["date"]:
            hits.append(t)
    hits.sort(key=lambda t: (-(t.get("sample") or 0), -(t.get("win_percentage") or 0)))
    return hits


def game_file_for(files, g):
    for a in files.get("articles") or []:
        if a.get("away_team") == g["away_team"] and a.get("home_team") == g["home_team"] \
                and str(a.get("game_time_utc") or "")[:10] == g["date"]:
            url = a.get("url")
            if not url:
                url = "/matchup-of-the-day/%s/" % a.get("slug") if a.get("slug") else None
            if url:
                return {"url": url, "title": a.get("h1") or a.get("title")}
    return None


def consensus_for(cons, g):
    for grp in cons.get("groups") or []:
        blob = json.dumps(grp).lower()
        if g["away_team"].lower() in blob and g["home_team"].lower() in blob:
            return grp
    return None


# ---------------------------------------------------------------------------
# shared page furniture
#
# THE DESIGN SYSTEM IS CONTENT HASHED, SO THE FILENAME IS NOT A CONSTANT.
# static/ds-assets.json is the manifest the Static Asset Versions workflow keeps
# in step with the bytes on disk. Reading it here means a fresh bake emits the
# URL that is already live, and CI has nothing to rewrite afterwards. Baking a
# hardcoded hash instead would put this script and repoint_ds_assets.py in a
# loop, each undoing the other once a day. Unhashed files fall back to their
# plain path, which version_static_refs.py then stamps with a ?v= tag.
# ---------------------------------------------------------------------------
def _hashed(src, fallback=None):
    try:
        with io.open(os.path.join(ROOT, "static", "ds-assets.json"), encoding="utf-8") as fh:
            manifest = json.load(fh)
    except (OSError, ValueError):
        manifest = {}
    if src in manifest:
        return manifest[src]
    if fallback:
        # A content-hashed build that is not in the manifest (tmr-session.js is
        # one). Take the newest hashed sibling if there is exactly one, else the
        # plain path, which still resolves.
        import glob as _glob
        base, ext = os.path.splitext(os.path.basename(src))
        hits = sorted(_glob.glob(os.path.join(ROOT, os.path.dirname(src),
                                              "%s.[0-9a-f]" % base + "*" + ext)))
        if len(hits) == 1:
            return "/" + os.path.relpath(hits[0], ROOT).replace(os.sep, "/")
    return "/" + src


HEAD_ASSETS = (
    '    <link rel="icon" type="image/png" href="/static/favicon.png">\n'
    '    <link rel="preconnect" href="https://fonts.googleapis.com">\n'
    '    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n'
    '    <link rel="preconnect" href="https://a.espncdn.com" crossorigin>\n'
    '    <link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700;800;900'
    '&amp;family=Barlow:wght@700;800&amp;family=Inter:wght@400;500;600;700;800;900&amp;display=swap"'
    ' rel="stylesheet">\n'
    '    <link rel="stylesheet" href="%s">\n'
    # The shared navbar's geometry. Without it a page mounts the shared header
    # component and then renders it 5-12px shorter than every other page, because
    # tmr-ds.css's unscaled --nav-h is all it has to go on. (2026-08-31)
    '    <link rel="stylesheet" href="/static/css/tmr-navbar.css">\n'
    '    <link rel="stylesheet" href="/static/css/tmr-mlb-matchup.css">\n'
    '    <link rel="stylesheet" href="/static/css/tmr-linkhub.css">\n'
) % _hashed("static/css/tmr-ds.css")

FOOT_SCRIPTS = (
    '    <script src="/static/js/config.js"></script>\n'
    '    <script src="/static/js/tmr-mlb-analytics.js"></script>\n'
    '    <script defer src="/static/js/tmr-linkhub.js"></script>\n'
    '    <script src="%s"></script>\n'
    '    <script src="%s"></script>\n'
) % (_hashed("static/js/tmr-session.js", fallback=True),
     _hashed("static/js/tmr-ds-nav.js"))


def page_head(title, description, canonical, ld_json, og_title=None, og_desc=None):
    return (
        "<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n"
        "    <meta charset=\"UTF-8\">\n"
        "    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n"
        "    <title>%s</title>\n"
        "    <meta name=\"description\" content=\"%s\">\n"
        "    <meta name=\"robots\" content=\"index, follow\">\n"
        "    <link rel=\"canonical\" href=\"%s\">\n"
        "    <meta property=\"og:type\" content=\"website\">\n"
        "    <meta property=\"og:site_name\" content=\"TrustMyRecord\">\n"
        "    <meta property=\"og:title\" content=\"%s\">\n"
        "    <meta property=\"og:description\" content=\"%s\">\n"
        "    <meta property=\"og:url\" content=\"%s\">\n"
        "    <meta name=\"twitter:card\" content=\"summary_large_image\">\n"
        "    <meta name=\"theme-color\" content=\"#06101f\">\n"
        "%s"
        "    <script type=\"application/ld+json\">\n%s\n    </script>\n"
        "</head>\n"
        % (esc(title), esc(description), esc(canonical),
           esc(og_title or title), esc(og_desc or description), esc(canonical),
           HEAD_ASSETS, json.dumps(ld_json, indent=2, ensure_ascii=False))
    )


def breadcrumb_ld(trail):
    return {
        "@type": "BreadcrumbList",
        "itemListElement": [
            dict({"@type": "ListItem", "position": i + 1, "name": name},
                 **({"item": SITE + url} if url else {}))
            for i, (name, url) in enumerate(trail)
        ],
    }


def crumb_html(trail):
    parts = []
    for name, url in trail:
        if url:
            parts.append('<a href="%s">%s</a>' % (esc(url), esc(name)))
        else:
            parts.append("<span>%s</span>" % esc(name))
    sep = ' <span aria-hidden="true">&rsaquo;</span> '
    return '        <nav class="mm-crumb" aria-label="Breadcrumb">%s</nav>\n' % sep.join(parts)


def cell(v, na="Not supplied"):
    return esc(v) if has(v) else '<span class="mm-na">%s</span>' % esc(na)


def table(caption, headers, rows, min_cols_numeric=1):
    out = ['        <div class="mm-tablewrap">\n          <table class="mm-t">\n']
    if caption:
        out.append("            <caption>%s</caption>\n" % caption)
    out.append("            <thead><tr>%s</tr></thead>\n"
               % "".join("<th scope=\"col\">%s</th>" % esc(h) for h in headers))
    out.append("            <tbody>\n")
    for row in rows:
        cells = ['<th scope="row">%s</th>' % row[0]]
        for c in row[1:]:
            cells.append('<td class="mm-num">%s</td>' % c)
        out.append("              <tr>%s</tr>\n" % "".join(cells))
    out.append("            </tbody>\n          </table>\n        </div>\n")
    return "".join(out)


# ---------------------------------------------------------------------------
# the research link rail. Every MLB surface on the site, in one place, on every
# matchup page. This is the ecosystem requirement: before this, a reader who
# arrived on MLB research from search had no route to the simulator, the trend
# tool, BetLegend Pro, the Game Files or the handicapper rankings.
# ---------------------------------------------------------------------------
def research_rail(g, game_file):
    away_n, home_n = nickname(g["away_team"]), nickname(g["home_team"])
    items = [
        ("/mlb-simulator/", "MLB Simulator",
         "Run %s at %s through the game simulator and read the box score it produces."
         % (away_n, home_n)),
        ("/trendspotter/", "Trend Spotter",
         "Every verified MLB trend on today's board, with the sample and the game log behind it."),
        ("/betlegend-pro/", "BetLegend Pro",
         "The paid research engine: situational splits and market filters across the full history."),
    ]
    if game_file:
        items.append((game_file["url"], "TMR Game File",
                      esc(game_file["title"] or ("%s at %s, taken apart in full" % (away_n, home_n)))))
    else:
        items.append(("/matchup-of-the-day/", "Matchup of the Day",
                      "One game a day taken apart in full, with every number sourced."))
    items += [
        ("/mlb-handicappers/", "Verified MLB handicappers",
         "Who is actually beating MLB, ranked on a public record rather than a claim."),
        ("/mlb-pick-tracker/", "MLB pick tracker",
         "Log your side on this game and let the result grade itself."),
        ("/mlb-season-simulator/", "MLB Season Simulator",
         "Where this matchup sits in the rest of the season."),
        (HUB, "Back to today's MLB slate",
         "Every game on the board with pitchers, lines and trends side by side."),
    ]
    out = ['        <section class="mm-sec" aria-labelledby="mm-research">\n',
           '          <h2 id="mm-research">Research this game across TrustMyRecord</h2>\n',
           '          <div class="mm-links">\n']
    for href, title, blurb in items:
        out.append('            <a class="mm-link" href="%s"><strong>%s</strong><span>%s</span></a>\n'
                   % (esc(href), esc(title), blurb if href == (game_file or {}).get("url") else esc(blurb)))
    out.append("          </div>\n        </section>\n")
    return "".join(out)


# ---------------------------------------------------------------------------
# the matchup page
# ---------------------------------------------------------------------------
def slate_rail(g, slate):
    """The rest of the day's board, from this page.

       Without it each matchup page was a leaf: the hub linked down to fifteen
       pages and not one of them linked to another, so a crawler arriving on a
       game page had exactly one route back and a reader who wanted the next
       game had to go up and come back down. Fifteen games mesh into one another
       here, which is both the shorter path for a reader and a much flatter
       crawl graph."""
    others = [o for o in slate if o["url"] != matchup_url(g)]
    if not others:
        return ""
    out = [
        '        <section class="mm-sec" aria-labelledby="mm-slate">\n',
        '          <h2 id="mm-slate">The rest of the %s MLB board</h2>\n'
        % esc(long_date(g["date"])),
        '          <p class="mm-sub">Every other game on this slate, each with the same research '
        'panel behind it. The whole board sits on '
        '<a href="%s">today&rsquo;s MLB matchups</a>.</p>\n' % HUB,
        '          <ul class="mm-trends">\n',
    ]
    for o in others:
        meta = " · ".join(x for x in [o.get("start"), o.get("probables")] if x)
        out.append('            <li class="mm-trend"><p><a href="%s">%s at %s</a></p>'
                   '<p class="mm-tmeta">%s</p></li>\n'
                   % (esc(o["url"]), esc(o["away"]), esc(o["home"]), esc(meta)))
    out.append("          </ul>\n        </section>\n")
    return "".join(out)


def render_matchup(g, research, market, trends, game_file, consensus, built_at, slate=()):
    away, home = g["away_team"], g["home_team"]
    away_n, home_n = nickname(away), nickname(home)
    url = SITE + matchup_url(g)
    date_long = long_date(g["date"])
    start = et_time(g.get("start_utc"))
    venue = (research.get("overview") or {}).get("venue") or g.get("venue")
    final = g.get("status") == "Final" and has(g.get("away_score")) and has(g.get("home_score"))

    ov = research.get("overview") or {}
    pit = research.get("pitchers") or {}
    off = research.get("offense") or {}
    tp = research.get("team_pitching") or {}
    rec = research.get("records") or {}
    pen = research.get("bullpens") or {}

    aw_p = pit.get("away") if isinstance(pit, dict) else None
    hm_p = pit.get("home") if isinstance(pit, dict) else None
    aw_start = (ov.get("away_starter") or {}) if avail(ov) else {}
    hm_start = (ov.get("home_starter") or {}) if avail(ov) else {}

    # ---- title and description -------------------------------------------
    # Under 65 characters so it renders whole in a result. The brand is left off
    # on purpose: Google appends the site name itself, and every character spent
    # on it here is a character taken from the teams and the markets.
    # Deterministic on the two club names and the date, so a given URL always
    # gets the same title: the shorter forms only ever fire for the long
    # nickname pairs, and they fire every time for those pairs.
    title = None
    for tail in ("Odds, Probable Pitchers, Stats", "Odds, Pitchers, Stats", "Odds & Stats"):
        candidate = "%s vs %s, %s: %s" % (away_n, home_n, short_date(g["date"]), tail)
        title = candidate
        if len(candidate) <= 65:
            break
    desc_bits = ["%s at %s on %s" % (away, home, date_long)]
    if start:
        desc_bits[0] += " at %s" % start
    if venue:
        desc_bits[0] += " from %s" % venue
    if aw_start.get("name") and hm_start.get("name"):
        desc_bits.append("%s starts against %s" % (aw_start["name"], hm_start["name"]))
    ml_a, ml_h = market["ml"].get(away), market["ml"].get(home)
    if ml_a and ml_h:
        desc_bits.append("Moneyline %s %s, %s %s" % (away_n, ml_a, home_n, ml_h))
    desc_bits.append("Records, recent form, offense, bullpens and verified trends, "
                     "every number sourced")
    description = (". ".join(desc_bits) + ".")[:300]

    # ---- structured data --------------------------------------------------
    # Built by scripts/schema_event.py so this page, the hub ItemList and the
    # Game File articles cannot drift apart on the required Event fields.
    event = sports_event(
        url=url,
        node_id=url + "#event",
        away=away,
        home=home,
        sport="Baseball",
        description=event_description(
            away, home,
            date_long=date_long,
            start=start,
            venue=venue,
            away_sp=aw_start.get("name"),
            home_sp=hm_start.get("name"),
            ml_away=ml_a,
            ml_home=ml_h,
            away_label=away_n,
            home_label=home_n,
            status=g.get("detailed_status"),
        ),
        start_iso=g.get("start_utc"),
        venue=venue,
        status=g.get("detailed_status"),
        organizer="Major League Baseball",
    )
    trail = [("Home", "/"), ("Handicapping Hub", "/handicapping/"),
             ("MLB Matchups", HUB), ("%s vs %s, %s" % (away_n, home_n, date_long), None)]
    ld = {"@context": "https://schema.org", "@graph": [
        {"@type": "WebPage", "@id": url, "url": url, "name": title,
         "description": description, "isPartOf": {"@type": "WebSite", "@id": SITE + "/#website",
                                                  "name": "TrustMyRecord", "url": SITE + "/"},
         "primaryImageOfPage": None, "about": {"@id": url + "#event"},
         "dateModified": built_at},
        breadcrumb_ld(trail),
        event,
    ]}
    ld["@graph"][0] = {k: v for k, v in ld["@graph"][0].items() if v is not None}

    # ---- body -------------------------------------------------------------
    b = []
    b.append('<body class="tmr-ds tmr-ds--dark tmr-site-shell mm-page" data-mlb-analytics="mlb_matchup_page"'
             ' data-slate-date="%s" data-matchup="%s">\n' % (esc(g["date"]), esc(matchup_slug(g))))
    b.append('    <main class="mm-shell" data-mm-live data-away-team="%s" data-home-team="%s"'
             ' data-game-date="%s">\n' % (esc(away), esc(home), esc(g["date"])))
    b.append(crumb_html(trail))

    # hero
    h1 = "%s vs %s: odds, probable pitchers and stats" % (away_n, home_n)
    b.append('        <header class="mm-hero">\n')
    b.append('            <span class="mm-kicker">MLB matchup &middot; %s %s</span>\n'
             % (esc(weekday_name(g["date"])), esc(date_long)))
    b.append("            <h1>%s</h1>\n" % esc(h1))
    lede = ("Everything TrustMyRecord holds on %s at %s in one place: the probable starters and "
            "what they have actually done this season, both records with the home and road split, "
            "the current streak, the last five and last ten, team offense and team pitching, the "
            "sportsbook lines, and the verified trends that clear our sample gate. "
            "Every number on this page names where it came from." % (away, home))
    b.append('            <p class="mm-lede">%s</p>\n' % esc(lede))
    meta = []
    if start:
        meta.append("<span>First pitch <b>%s</b></span>" % esc(start))
    if venue:
        meta.append("<span>Venue <b>%s</b></span>" % esc(venue))
    if g.get("detailed_status"):
        meta.append("<span>Status <b>%s</b></span>" % esc(g["detailed_status"]))
    if meta:
        b.append('            <div class="mm-meta">%s</div>\n' % "".join(meta))
    b.append("        </header>\n")

    # scoreboard strip
    aw_rec = rec.get("away") if isinstance(rec, dict) else None
    hm_rec = rec.get("home") if isinstance(rec, dict) else None
    def side(name, record, cls):
        lg = logo_url(name)
        img = ('<img src="%s" alt="%s logo" width="46" height="46" loading="eager" decoding="async">'
               % (esc(lg), esc(name))) if lg else ""
        r = record.get("record") if avail(record) else None
        return ('            <div class="mm-side %s">%s<span class="mm-tname">%s'
                '<span class="mm-trec">%s</span></span></div>\n'
                % (cls, img, esc(name), esc(r) if r else "record not supplied"))
    b.append('        <div class="mm-board">\n')
    b.append(side(away, aw_rec or {}, "mm-side--away"))
    mid = ["            <div class=\"mm-vs\">"]
    if final:
        mid.append("<strong>%s &ndash; %s</strong>" % (esc(g["away_score"]), esc(g["home_score"])))
        mid.append('<span class="mm-final">Final</span>')
    else:
        mid.append("<strong>at</strong>")
        if start:
            mid.append(esc(start))
    mid.append("</div>\n")
    b.append("".join(mid))
    b.append(side(home, hm_rec or {}, "mm-side--home"))
    b.append("        </div>\n")

    # ---- lines ------------------------------------------------------------
    b.append('        <section class="mm-sec" aria-labelledby="mm-lines">\n')
    b.append('          <h2 id="mm-lines">%s vs %s betting odds</h2>\n' % (esc(away_n), esc(home_n)))
    if market["ml"] or market["rl"] or market["total"]:
        stamp = market.get("updated") or built_at
        b.append('          <p class="mm-sub">Moneyline, run line and total from %s, read '
                 '<span data-live="as-of">%s</span>. %s</p>\n'
                 % (esc(market.get("book") or "the sportsbook feed"),
                    esc(stamp[:16].replace("T", " ") + " UTC"),
                    "This game is over, so these are the last prices the board carried on it."
                    if final else
                    "Prices move; this page refreshes them from the live board when you open it."))
        rows = []
        rl_a = market["rl"].get(away) or {}
        rl_h = market["rl"].get(home) or {}
        rows.append([esc(away),
                     '<span data-live="ml-away">%s</span>' % cell(market["ml"].get(away), "not priced"),
                     '<span data-live="rl-away">%s</span>' % cell(
                         ("%s (%s)" % (rl_a.get("line"), rl_a.get("odds"))) if rl_a.get("line") else None,
                         "not priced"),
                     cell(market["f5_ml"].get(away), "not priced")])
        rows.append([esc(home),
                     '<span data-live="ml-home">%s</span>' % cell(market["ml"].get(home), "not priced"),
                     '<span data-live="rl-home">%s</span>' % cell(
                         ("%s (%s)" % (rl_h.get("line"), rl_h.get("odds"))) if rl_h.get("line") else None,
                         "not priced"),
                     cell(market["f5_ml"].get(home), "not priced")])
        b.append(table("Full game moneyline and run line, plus the First 5 innings moneyline.",
                       ["Team", "Moneyline", "Run line", "First 5 ML"], rows))
        ov_t, un_t = market["total"].get("over") or {}, market["total"].get("under") or {}
        f5o, f5u = market["f5_total"].get("over") or {}, market["f5_total"].get("under") or {}
        trows = []
        if ov_t.get("raw_line") is not None:
            trows.append(["Full game total",
                          '<span data-live="tot-over">%s</span>'
                          % esc("Over %g (%s)" % (float(ov_t["raw_line"]), ov_t.get("odds") or "n/a")),
                          '<span data-live="tot-under">%s</span>'
                          % esc("Under %g (%s)" % (float(un_t.get("raw_line", ov_t["raw_line"])),
                                                   un_t.get("odds") or "n/a"))])
        if f5o.get("raw_line") is not None:
            trows.append(["First 5 innings total",
                          esc("Over %g (%s)" % (float(f5o["raw_line"]), f5o.get("odds") or "n/a")),
                          esc("Under %g (%s)" % (float(f5u.get("raw_line", f5o["raw_line"])),
                                                 f5u.get("odds") or "n/a"))])
        for team, tline, sides in main_team_totals(market["team_totals"]):
            trows.append(["%s team total" % esc(team),
                          esc("Over %g (%s)" % (float(tline), sides["over"])),
                          esc("Under %g (%s)" % (float(tline), sides["under"]))])
        nr_o, nr_u = market["nrfi"].get("over") or {}, market["nrfi"].get("under") or {}
        if nr_o.get("odds") and nr_u.get("odds"):
            trows.append(["First inning run (YRFI / NRFI)",
                          esc("Over %g (%s)" % (float(nr_o["line"]), nr_o["odds"])),
                          esc("Under %g (%s)" % (float(nr_u["line"]), nr_u["odds"]))])
        if trows:
            b.append(table("Totals on offer for this game. The first inning row is whether any run "
                           "scores in the top or bottom of the first.",
                           ["Market", "Over", "Under"], trows))
    else:
        b.append('          <p class="mm-sub">The sportsbook board is not carrying a price on this '
                 'game right now. Nothing is shown rather than filling the section with a number we '
                 'do not have.</p>\n')
    b.append('          <p class="mm-sub">Once you have a side, '
             '<a href="/sportsbook/?sport=baseball_mlb#picks">log the pick on TrustMyRecord</a> '
             'and the result grades itself against a public record.</p>\n')
    b.append("        </section>\n")

    # ---- probable pitchers ------------------------------------------------
    b.append('        <section class="mm-sec" aria-labelledby="mm-pitchers">\n')
    b.append('          <h2 id="mm-pitchers">Probable pitchers</h2>\n')
    if aw_start.get("name") or hm_start.get("name"):
        line = []
        for s in (aw_start, hm_start):
            if s.get("name"):
                hw = hand_word(s.get("hand"))
                line.append("%s%s" % (s["name"], " (%s)" % hw if hw else ""))
        b.append('          <p class="mm-sub">%s. Season lines below are this year only, from the '
                 'MLB Stats API, with the expected numbers from Baseball Savant where Statcast '
                 'covers the pitcher.</p>\n' % esc(" against ".join(line)))
        rows = []
        for name, p, s in ((away, aw_p, aw_start), (home, hm_p, hm_start)):
            sav = (p or {}).get("savant") if avail(p) else None
            rows.append([
                esc("%s: %s" % (nickname(name), s.get("name") or "not announced")),
                cell(num((p or {}).get("era")) if avail(p) else None),
                cell(num((p or {}).get("whip")) if avail(p) else None),
                cell(pct((p or {}).get("k_pct")) if avail(p) else None),
                cell(pct((p or {}).get("bb_pct")) if avail(p) else None),
                cell(num((p or {}).get("fip")) if avail(p) else None),
                cell(num(sav.get("xera")) if avail(sav) else None, "no Statcast"),
                cell((p or {}).get("innings_pitched") if avail(p) else None),
                cell((p or {}).get("games_started") if avail(p) else None),
            ])
        b.append(table("Starter season stats. K% and BB% are of batters faced. FIP uses the "
                       "league constant for the season. xERA is Baseball Savant's expected ERA.",
                       ["Starter", "ERA", "WHIP", "K%", "BB%", "FIP", "xERA", "IP", "GS"], rows))
        # pitch mix, only when Savant actually returned one
        for name, p in ((away, aw_p), (home, hm_p)):
            sav = (p or {}).get("savant") if avail(p) else None
            mix = (sav or {}).get("pitch_mix") if avail(sav) else None
            if mix:
                b.append("          <h3>%s pitch mix</h3>\n"
                         % esc((aw_start if name == away else hm_start).get("name") or nickname(name)))
                rows = [[esc(m.get("pitch")), cell(pct(m.get("usage_pct"))),
                         cell(pct(m.get("whiff_pct"))), cell(pct(m.get("k_pct"))),
                         cell(num(m.get("est_woba"), 3)), cell(pct(m.get("hard_hit_pct")))]
                        for m in mix]
                b.append(table("Source: Baseball Savant, this season.",
                               ["Pitch", "Usage", "Whiff%", "K%", "xwOBA", "Hard hit%"], rows))
    else:
        b.append('          <p class="mm-sub">Neither club has posted a probable starter for this '
                 'game yet. MLB usually publishes them one to two days out.</p>\n')
    b.append("        </section>\n")

    # ---- form -------------------------------------------------------------
    b.append('        <section class="mm-sec" aria-labelledby="mm-form">\n')
    b.append('          <h2 id="mm-form">Records, home and road splits, and recent form</h2>\n')
    if avail(aw_rec) or avail(hm_rec):
        b.append('          <p class="mm-sub">Counted from completed regular season results through '
                 '%s, so the record, the split, the streak and the last ten all come from one list '
                 'and cannot disagree with each other.</p>\n' % esc(date_long))
        rows = []
        for name, r in ((away, aw_rec), (home, hm_rec)):
            rr = r if avail(r) else {}
            rows.append([esc(name), cell(rr.get("record")), cell(rr.get("home_record")),
                         cell(rr.get("away_record")), cell(rr.get("streak")),
                         cell(rr.get("last5")), cell(rr.get("last10")),
                         cell(rr.get("games_counted"))])
        b.append(table("Record and form. Home and road are that team's own splits, not this venue.",
                       ["Team", "Record", "Home", "Road", "Streak", "Last 5", "Last 10", "GP"], rows))
    else:
        b.append('          <p class="mm-sub">Team records are not available from the provider for '
                 'this date.</p>\n')
    b.append("        </section>\n")

    # ---- offense and team pitching ---------------------------------------
    aw_o = off.get("away") if isinstance(off, dict) else None
    hm_o = off.get("home") if isinstance(off, dict) else None
    b.append('        <section class="mm-sec" aria-labelledby="mm-offense">\n')
    b.append('          <h2 id="mm-offense">Team offense and team pitching</h2>\n')
    if avail(aw_o) or avail(hm_o):
        rows = []
        for name, o in ((away, aw_o), (home, hm_o)):
            oo = o if avail(o) else {}
            rows.append([esc(name), cell(num(oo.get("runs_per_game"))), cell(oo.get("avg")),
                         cell(oo.get("obp")), cell(oo.get("slg")), cell(oo.get("ops")),
                         cell(oo.get("home_runs")), cell(num(oo.get("iso"), 3)),
                         cell(oo.get("walks")), cell(oo.get("strikeouts"))])
        b.append(table("Season batting totals from the MLB Stats API.",
                       ["Team", "R/G", "AVG", "OBP", "SLG", "OPS", "HR", "ISO", "BB", "K"], rows))
    aw_tp = tp.get("away") if isinstance(tp, dict) else None
    hm_tp = tp.get("home") if isinstance(tp, dict) else None
    aw_bp = pen.get("away") if isinstance(pen, dict) else None
    hm_bp = pen.get("home") if isinstance(pen, dict) else None
    if avail(aw_tp) or avail(hm_tp) or avail(aw_bp) or avail(hm_bp):
        rows = []
        for name, t, p in ((away, aw_tp, aw_bp), (home, hm_tp, hm_bp)):
            tt = t if avail(t) else {}
            pp = p if avail(p) else {}
            rows.append([esc(name), cell(num(tt.get("era"))), cell(num(tt.get("whip"))),
                         cell(num(tt.get("runs_allowed_per_game"))),
                         cell(num(pp.get("era"))), cell(num(pp.get("whip")))])
        b.append(table("Staff totals and the bullpen split out. RA/G is runs allowed per game.",
                       ["Team", "Staff ERA", "Staff WHIP", "RA/G", "Bullpen ERA", "Bullpen WHIP"], rows))
    if not (avail(aw_o) or avail(hm_o) or avail(aw_tp) or avail(hm_tp)):
        b.append('          <p class="mm-sub">Team season stats are not available from the provider '
                 'for this date.</p>\n')
    b.append("        </section>\n")

    # ---- trends -----------------------------------------------------------
    b.append('        <section class="mm-sec" aria-labelledby="mm-trends">\n')
    b.append('          <h2 id="mm-trends">Verified trends for this matchup</h2>\n')
    if trends:
        b.append('          <p class="mm-sub">Every trend here was measured against completed games '
                 'with final scores, and each one carries the sample it was drawn from. Moneyline '
                 'trends are measured against market implied probability, not against 50 percent. '
                 'Nothing that failed the sample gate is shown.</p>\n')
        b.append('          <ul class="mm-trends">\n')
        for t in trends[:12]:
            bits = []
            if has(t.get("record")):
                bits.append("Record <b>%s</b>" % esc(t["record"]))
            if has(t.get("sample")):
                bits.append("sample <b>%s games</b>" % esc(t["sample"]))
            if has(t.get("market")):
                bits.append("market <b>%s</b>" % esc(t["market"]))
            if has(t.get("date_range")):
                bits.append("window %s" % esc(t["date_range"]))
            b.append('            <li class="mm-trend"><p>%s</p><p class="mm-tmeta">%s</p></li>\n'
                     % (esc(t.get("claim")), ", ".join(bits)))
        b.append("          </ul>\n")
        if len(trends) > 12:
            b.append('          <p class="mm-sub">%d more trends cleared the gate for this game. '
                     'See them all on <a href="%strends/">today\'s verified MLB trends</a>.</p>\n'
                     % (len(trends) - 12, HUB))
    else:
        b.append('          <p class="mm-sub">No trend cleared the sample size and edge gates for '
                 'this matchup, so none is shown. An empty section here is a real answer, not a '
                 'missing one. <a href="%strends/">Every verified MLB trend on today\'s board</a> '
                 'is one click away.</p>\n' % HUB)
    b.append("        </section>\n")

    # ---- community --------------------------------------------------------
    b.append('        <section class="mm-sec" aria-labelledby="mm-community">\n')
    b.append('          <h2 id="mm-community">What the TrustMyRecord community is on</h2>\n')
    if consensus:
        picks = consensus.get("picks") or consensus.get("selections") or []
        b.append('          <p class="mm-sub">Real picks logged by members on this game, with the '
                 'record behind each one public.</p>\n')
        rows = [[esc(p.get("selection") or p.get("label") or ""), cell(p.get("count")),
                 cell(p.get("percent"))] for p in picks] or [["See the full consensus board", "", ""]]
        b.append(table("Community consensus over the last three days.",
                       ["Selection", "Picks", "Share"], rows))
    else:
        b.append('          <p class="mm-sub">No member has logged a pick on this game yet. This '
                 'section stays empty until real picks exist rather than showing a manufactured '
                 'consensus. You can <a href="/sportsbook/?sport=baseball_mlb#picks">be the first '
                 'to log one</a>, or read <a href="/mlb-handicappers/">the verified MLB handicapper '
                 'rankings</a> to see who has actually been right this season.</p>\n')
    b.append("        </section>\n")

    # ---- rail + provenance ------------------------------------------------
    b.append(slate_rail(g, slate))
    b.append(research_rail(g, game_file))

    srcs = research.get("data_sources") or {}
    unavailable = []
    for sec in (ov, aw_p, hm_p, aw_o, hm_o):
        if isinstance(sec, dict):
            unavailable += sec.get("unavailable_metrics") or []
    seen, uniq = set(), []
    for u in unavailable:
        if u not in seen:
            seen.add(u)
            uniq.append(u)
    b.append('        <p class="mm-note"><b>Where this comes from.</b> Schedule, venue, probable '
             'pitchers, team records and season stats: the official MLB Stats API. Expected stats '
             'and pitch mix: Baseball Savant. Trends: TrustMyRecord\'s own historical game corpus, '
             'measured over completed games with final scores. Lines: the sportsbook feed named '
             'above. Page built %s.%s</p>\n'
             % (esc(built_at[:16].replace("T", " ") + " UTC"),
                (" Metrics our providers do not supply for this game, listed rather than guessed: "
                 + esc(", ".join(uniq)) + ".") if uniq else ""))
    b.append("    </main>\n")
    b.append('    <script src="/static/js/tmr-mlb-matchup-live.js"></script>\n')
    b.append(FOOT_SCRIPTS)
    b.append("</body>\n</html>\n")

    return page_head(title, description, url, ld,
                     og_title="%s vs %s, %s: odds, pitchers and stats" % (away_n, home_n, date_long)
                     ) + "".join(b)


# ---------------------------------------------------------------------------
# the hub's server rendered block
# ---------------------------------------------------------------------------
def render_hub_block(date, rows, built_at):
    """rows: list of dicts produced by build(), one per game, already rendered
       down to plain values. This is the crawlable half of the hub: below the
       interactive cards, the same slate as text, with a link to every game."""
    n = len(rows)
    out = []
    out.append('<section class="mhs" aria-labelledby="mhs-title">\n')
    out.append('  <h2 id="mhs-title">Today\'s MLB matchups, %s %s</h2>\n'
               % (esc(weekday_name(date)), esc(long_date(date))))
    priced = sum(1 for r in rows if r["ml_away"] or r["ml_home"])
    announced = sum(1 for r in rows if r["away_sp"] and r["home_sp"])
    out.append("  <p>%d game%s on the board. %d %s both probable starters posted and %d %s priced "
               "by the sportsbook feed. Every game below has its own page with the full research "
               "panel on it: starter stats, both records with the home and road split, the streak, "
               "the last five and last ten, team offense, team pitching and the verified trends "
               "that cleared our sample gate.</p>\n"
               % (n, "" if n == 1 else "s", announced, "has" if announced == 1 else "have",
                  priced, "is" if priced == 1 else "are"))

    out.append('  <div class="mm-tablewrap"><table class="mm-t">\n')
    out.append('    <caption>Times are Eastern. Odds come from the sportsbook feed and move; each '
               'matchup page carries the time its price was read.</caption>\n')
    out.append('    <thead><tr><th scope="col">Matchup</th><th scope="col">First pitch</th>'
               '<th scope="col">Venue</th><th scope="col">Probable pitchers</th>'
               '<th scope="col">Moneyline</th><th scope="col">Total</th></tr></thead>\n')
    out.append("    <tbody>\n")
    for r in rows:
        probables = ("%s vs %s" % (r["away_sp"], r["home_sp"])) if r["away_sp"] and r["home_sp"] \
            else '<span class="mm-na">not announced</span>'
        ml = ("%s %s, %s %s" % (r["away_nick"], r["ml_away"], r["home_nick"], r["ml_home"])) \
            if r["ml_away"] and r["ml_home"] else '<span class="mm-na">not priced</span>'
        out.append('      <tr><th scope="row"><a href="%s">%s at %s</a></th>'
                   '<td>%s</td><td>%s</td><td>%s</td><td>%s</td><td>%s</td></tr>\n'
                   % (esc(r["url"]), esc(r["away"]), esc(r["home"]),
                      esc(r["start"] or "TBD"), esc(r["venue"] or "TBD"),
                      probables if not (r["away_sp"] and r["home_sp"]) else esc(probables),
                      ml if not (r["ml_away"] and r["ml_home"]) else esc(ml),
                      esc(r["total"]) if r["total"] else '<span class="mm-na">not priced</span>'))
    out.append("    </tbody>\n  </table></div>\n")

    # probable pitcher matchups, as prose a crawler can read
    pitcher_rows = [r for r in rows if r["away_sp"] and r["home_sp"]]
    out.append("  <h3>Today's probable pitcher matchups</h3>\n")
    if pitcher_rows:
        out.append("  <p>Season ERA and WHIP for each announced starter. Full splits, FIP, K rate "
                   "and pitch mix sit on the <a href=\"%sprobable-pitchers/\">MLB probable pitchers "
                   "page</a>.</p>\n" % HUB)
        out.append('  <ul class="mhs-list">\n')
        for r in pitcher_rows:
            a = "%s%s" % (r["away_sp"], " (%s)" % r["away_sp_line"] if r["away_sp_line"] else "")
            h = "%s%s" % (r["home_sp"], " (%s)" % r["home_sp_line"] if r["home_sp_line"] else "")
            out.append('    <li><b>%s at %s</b>: %s against %s. <a href="%s">Full matchup</a></li>\n'
                       % (esc(r["away_nick"]), esc(r["home_nick"]), esc(a), esc(h), esc(r["url"])))
        out.append("  </ul>\n")
    else:
        out.append("  <p>No club has posted a probable starter for today's board yet.</p>\n")

    # form gaps, computed not asserted
    gaps = [r for r in rows if r["form_gap"] is not None]
    gaps.sort(key=lambda r: -abs(r["form_gap"]))
    out.append("  <h3>The widest recent form gaps on today's board</h3>\n")
    if gaps and abs(gaps[0]["form_gap"]) > 0:
        out.append("  <p>Ranked by the difference between the two clubs' last ten records. This is "
                   "a description of what has happened, not a prediction, and recent form is only "
                   "one input.</p>\n")
        out.append('  <ul class="mhs-list">\n')
        for r in gaps[:5]:
            if abs(r["form_gap"]) == 0:
                continue
            hot, cold = (r["home"], r["away"]) if r["form_gap"] < 0 else (r["away"], r["home"])
            hot_l10 = r["home_l10"] if r["form_gap"] < 0 else r["away_l10"]
            cold_l10 = r["away_l10"] if r["form_gap"] < 0 else r["home_l10"]
            out.append('    <li><b>%s at %s</b>: %s are %s in their last ten, %s are %s. '
                       '<a href="%s">See both records in full</a></li>\n'
                       % (esc(r["away_nick"]), esc(r["home_nick"]), esc(nickname(hot)),
                          esc(hot_l10), esc(nickname(cold)), esc(cold_l10), esc(r["url"])))
        out.append("  </ul>\n")
    else:
        out.append("  <p>Last ten records are not available for today's board.</p>\n")

    # trends
    trendy = [r for r in rows if r["top_trend"]]
    out.append("  <h3>Verified MLB trends on today's board</h3>\n")
    if trendy:
        total = sum(r["trend_count"] for r in rows)
        out.append("  <p>%d trends across today's slate cleared the sample size and edge gates. "
                   "Each one is measured over completed games with final scores and carries the "
                   "sample it came from. The full list is on "
                   "<a href=\"%strends/\">today's verified MLB trends</a>.</p>\n" % (total, HUB))
        out.append('  <ul class="mhs-list">\n')
        for r in sorted(trendy, key=lambda r: -r["trend_sample"])[:6]:
            out.append('    <li>%s <span class="mhs-when">Sample %s games. '
                       '<a href="%s">%s at %s</a></span></li>\n'
                       % (esc(r["top_trend"]), esc(r["trend_sample"]), esc(r["url"]),
                          esc(r["away_nick"]), esc(r["home_nick"])))
        out.append("  </ul>\n")
    else:
        out.append("  <p>No trend on today's board cleared the sample gate. Nothing is listed "
                   "rather than filling the section.</p>\n")

    out.append("  <h3>More MLB research on TrustMyRecord</h3>\n")
    out.append('  <p><a href="%sprobable-pitchers/">MLB probable pitchers today</a> ranks every '
               'announced starter on ERA, WHIP, FIP and K rate. '
               '<a href="%sodds/">MLB odds today</a> carries the whole board including First 5, '
               'team totals and the first inning market. '
               '<a href="%strends/">MLB betting trends today</a> lists every verified trend with '
               'its sample. From there, the '
               '<a href="/mlb-simulator/">MLB Simulator</a> plays a game out, '
               '<a href="/trendspotter/">Trend Spotter</a> lets you query the trend corpus '
               'yourself, <a href="/betlegend-pro/">BetLegend Pro</a> runs the deeper situational '
               'splits, the <a href="/matchup-of-the-day/">Matchup of the Day Game File</a> takes '
               'one game apart in full, and <a href="/mlb-handicappers/">verified MLB '
               'handicappers</a> shows who has actually been beating this sport.</p>\n'
               % (HUB, HUB, HUB))
    out.append("</section>\n")
    return "".join(out)


def render_hub_ld(date, rows, built_at):
    # Same builder as the matchup pages: the slate entry and the page it links
    # to describe the same fixture, so they carry the same Event fields.
    items = []
    long = long_date(date)
    for i, r in enumerate(rows):
        items.append({
            "@type": "ListItem",
            "position": i + 1,
            "url": SITE + r["url"],
            "item": sports_event(
                url=SITE + r["url"],
                away=r["away"],
                home=r["home"],
                sport="Baseball",
                description=event_description(
                    r["away"], r["home"],
                    date_long=long,
                    start=r.get("start"),
                    venue=r.get("venue"),
                    away_sp=r.get("away_sp"),
                    home_sp=r.get("home_sp"),
                    ml_away=r.get("ml_away"),
                    ml_home=r.get("ml_home"),
                    away_label=r.get("away_nick"),
                    home_label=r.get("home_nick"),
                    status=r.get("detailed_status"),
                ),
                start_iso=r.get("start_utc"),
                venue=r.get("venue"),
                status=r.get("detailed_status"),
                organizer="Major League Baseball",
            ),
        })
    url = SITE + HUB
    return {"@context": "https://schema.org", "@graph": [
        {"@type": "CollectionPage", "@id": url, "url": url,
         "name": "MLB Matchups Today",
         "description": "Every MLB game today with odds, probable pitchers, team stats and "
                        "verified betting trends.",
         "isPartOf": {"@type": "WebSite", "@id": SITE + "/#website",
                      "name": "TrustMyRecord", "url": SITE + "/"},
         "dateModified": built_at},
        breadcrumb_ld([("Home", "/"), ("Handicapping Hub", "/handicapping/"),
                       ("MLB Matchups", None)]),
        {"@type": "ItemList", "name": "MLB games on %s" % long_date(date),
         "numberOfItems": len(items), "itemListOrder": "https://schema.org/ItemListOrderAscending",
         "itemListElement": items},
    ]}


# ---------------------------------------------------------------------------
# the three supporting daily views
# ---------------------------------------------------------------------------
def _support_page(slug, title, h1, description, kicker, lede, body_html, date, built_at,
                  crumb_name):
    url = SITE + HUB + slug + "/"
    trail = [("Home", "/"), ("Handicapping Hub", "/handicapping/"),
             ("MLB Matchups", HUB), (crumb_name, None)]
    ld = {"@context": "https://schema.org", "@graph": [
        {"@type": "CollectionPage", "@id": url, "url": url, "name": title,
         "description": description, "dateModified": built_at,
         "isPartOf": {"@type": "WebSite", "@id": SITE + "/#website",
                      "name": "TrustMyRecord", "url": SITE + "/"}},
        breadcrumb_ld(trail),
    ]}
    b = ['<body class="tmr-ds tmr-ds--dark tmr-site-shell mm-page"'
         ' data-mlb-analytics="%s" data-slate-date="%s">\n'
         % (esc(slug.replace("-", "_")), esc(date)),
         '    <main class="mm-shell">\n', crumb_html(trail),
         '        <header class="mm-hero">\n',
         '            <span class="mm-kicker">%s</span>\n' % esc(kicker),
         "            <h1>%s</h1>\n" % esc(h1),
         '            <p class="mm-lede">%s</p>\n' % esc(lede),
         "        </header>\n", body_html,
         '        <p class="mm-note"><b>This page rebuilds every day from the same feeds the '
         'matchup pages use.</b> Schedule, starters and season stats come from the official MLB '
         'Stats API, expected stats from Baseball Savant, trends from TrustMyRecord\'s historical '
         'game corpus, and lines from the sportsbook feed. Built %s. '
         '<a href="%s">Back to today\'s MLB slate</a>.</p>\n'
         % (esc(built_at[:16].replace("T", " ") + " UTC"), HUB),
         "    </main>\n", FOOT_SCRIPTS, "</body>\n</html>\n"]
    return page_head(title, description, url, ld) + "".join(b)


def render_probable_pitchers(date, rows, built_at):
    body = ['        <section class="mm-sec" aria-labelledby="pp-t">\n',
            '          <h2 id="pp-t">Every announced MLB starter today</h2>\n']
    entries = []
    for r in rows:
        for side in ("away", "home"):
            p = r["sp_%s_full" % side]
            if p and p.get("name"):
                entries.append((r, side, p))
    if entries:
        body.append('          <p class="mm-sub">Ranked by season ERA, lowest first. Innings '
                    'pitched is in the table on purpose: a low ERA over a handful of innings is not '
                    'the same thing as a low ERA over a season, and this page does not hide that '
                    'behind a rank. A starter with no season line yet is listed at the bottom '
                    'rather than dropped. Click through for the full matchup: the opposing offense, '
                    'both bullpens and the verified trends.</p>\n')
        entries.sort(key=lambda e: (e[2].get("era") is None, e[2].get("era") or 0))
        trows = []
        for r, side, p in entries:
            opp = r["home"] if side == "away" else r["away"]
            trows.append([
                esc(p["name"]),
                esc(r["away"] if side == "away" else r["home"]),
                esc(opp),
                cell(hand_word(p.get("hand")), "not supplied"),
                cell(num(p.get("era"))),
                cell(num(p.get("whip"))),
                cell(pct(p.get("k_pct"))),
                cell(pct(p.get("bb_pct"))),
                cell(num(p.get("fip"))),
                cell(num(p.get("xera")), "no Statcast"),
                cell(p.get("innings_pitched")),
                '<a href="%s">Matchup</a>' % esc(r["url"]),
            ])
        body.append(table("Season stats from the MLB Stats API. xERA from Baseball Savant.",
                          ["Starter", "Team", "Opponent", "Throws", "ERA", "WHIP", "K%", "BB%",
                           "FIP", "xERA", "IP", ""], trows))
        body.append("          <h3>Starting pitcher matchups, head to head</h3>\n")
        body.append('          <ul class="mm-trends">\n')
        for r in rows:
            if not (r["away_sp"] and r["home_sp"]):
                continue
            body.append('            <li class="mm-trend"><p>%s at %s: %s against %s</p>'
                        '<p class="mm-tmeta">%s. <a href="%s">Full matchup research</a></p></li>\n'
                        % (esc(r["away_nick"]), esc(r["home_nick"]), esc(r["away_sp"]),
                           esc(r["home_sp"]),
                           esc(", ".join(x for x in [r["away_sp_line"], r["home_sp_line"]] if x)
                               or "season lines not supplied"),
                           esc(r["url"])))
        body.append("          </ul>\n")
    else:
        body.append('          <p class="mm-sub">No club has posted a probable starter for today '
                    'yet. MLB usually publishes them one to two days out.</p>\n')
    body.append("        </section>\n")
    return _support_page(
        "probable-pitchers",
        "MLB Probable Pitchers Today, %s: ERA, WHIP, K Rate" % short_date(date),
        "MLB probable pitchers today",
        "Every announced MLB starting pitcher for %s with season ERA, WHIP, FIP, K rate and "
        "expected ERA, plus the opposing starter in each game." % long_date(date),
        "MLB starting pitchers · %s" % long_date(date),
        "Every starter announced for today's MLB slate, ranked by season ERA, with the opposing "
        "starter beside each one. Season lines are this year only and come from the official MLB "
        "Stats API, with expected ERA from Baseball Savant where Statcast covers the pitcher.",
        "".join(body), date, built_at, "Probable pitchers")


def render_odds(date, rows, built_at):
    body = ['        <section class="mm-sec" aria-labelledby="od-t">\n',
            '          <h2 id="od-t">Today\'s MLB betting board</h2>\n']
    priced = [r for r in rows if r["ml_away"] or r["ml_home"]]
    if priced:
        body.append('          <p class="mm-sub">Moneyline, run line and total for every game the '
                    'book is pricing, with the First 5 innings market beside it. Prices move; each '
                    'row was read at the time stamped at the bottom of this page.</p>\n')
        trows = []
        for r in priced:
            trows.append([
                '<a href="%s">%s at %s</a>' % (esc(r["url"]), esc(r["away_nick"]), esc(r["home_nick"])),
                esc(r["start"] or "TBD"),
                cell(r["ml_away"], "n/a"), cell(r["ml_home"], "n/a"),
                cell(r["rl_away"], "n/a"), cell(r["rl_home"], "n/a"),
                cell(r["total"], "n/a"), cell(r["f5_ml_away"], "n/a"), cell(r["f5_ml_home"], "n/a"),
                cell(r["f5_total"], "n/a"),
            ])
        body.append(table("Full game and First 5 innings markets.",
                          ["Game", "First pitch", "Away ML", "Home ML", "Away RL", "Home RL",
                           "Total", "Away F5", "Home F5", "F5 total"], trows))
        tt = [r for r in rows if r["team_total_lines"]]
        if tt:
            body.append("          <h3>Team totals and the first inning market</h3>\n")
            trows = []
            for r in tt:
                for label, val in r["team_total_lines"]:
                    trows.append(['<a href="%s">%s</a>' % (esc(r["url"]), esc(label)),
                                  esc(val), esc("%s at %s" % (r["away_nick"], r["home_nick"]))])
            for r in rows:
                for label, val in r["nrfi_lines"]:
                    trows.append([esc(label), esc(val),
                                  esc("%s at %s" % (r["away_nick"], r["home_nick"]))])
            body.append(table("Team totals are a single club's runs. The first inning market is "
                              "whether any run scores in the top or bottom of the first.",
                              ["Market", "Price", "Game"], trows))
    else:
        body.append('          <p class="mm-sub">The sportsbook feed is not carrying a price on any '
                    'game on today\'s board right now. Nothing is listed rather than showing a '
                    'number we do not have.</p>\n')
    unpriced = [r for r in rows if not (r["ml_away"] or r["ml_home"])]
    if unpriced and priced:
        body.append("          <h3>On the schedule, not yet priced</h3>\n")
        body.append('          <ul class="mm-trends">\n')
        for r in unpriced:
            body.append('            <li class="mm-trend"><p>%s at %s</p>'
                        '<p class="mm-tmeta">%s. <a href="%s">Research the matchup</a></p></li>\n'
                        % (esc(r["away"]), esc(r["home"]), esc(r["start"] or "start time TBD"),
                           esc(r["url"])))
        body.append("          </ul>\n")
    body.append("        </section>\n")
    return _support_page(
        "odds",
        "MLB Odds Today, %s: Moneyline, Run Line, Totals" % short_date(date),
        "MLB odds today",
        "Today's full MLB betting board for %s: moneyline, run line, totals, First 5 innings "
        "markets, team totals and the first inning market, with a research page behind every "
        "game." % long_date(date),
        "MLB betting board · %s" % long_date(date),
        "The whole MLB board in one table: moneyline, run line and total for every priced game, "
        "plus the First 5 innings markets, team totals and the first inning market. Every row "
        "links through to the full research page for that game.",
        "".join(body), date, built_at, "Odds")


def render_trends(date, rows, all_trends, built_at):
    body = ['        <section class="mm-sec" aria-labelledby="tr-t">\n',
            '          <h2 id="tr-t">Every verified MLB trend on today\'s board</h2>\n']
    if all_trends:
        body.append('          <p class="mm-sub">%d trends cleared the sample size and edge gates '
                    'for today\'s slate. Each was measured over completed games with final scores '
                    'and carries the sample it came from. Moneyline trends are measured against '
                    'market implied probability, not against 50 percent. A trend describes what has '
                    'already happened. It is not a prediction and it is not a pick.</p>\n'
                    % len(all_trends))
        by_game = {}
        for r in rows:
            hits = [t for t in all_trends
                    if str(t.get("away_abbr", "")).upper() == r["away"].upper()
                    and str(t.get("home_abbr", "")).upper() == r["home"].upper()]
            if hits:
                by_game[r["url"]] = (r, sorted(hits, key=lambda t: -(t.get("sample") or 0)))
        for url in sorted(by_game, key=lambda u: -len(by_game[u][1])):
            r, hits = by_game[url]
            body.append('          <h3><a href="%s">%s at %s</a> &middot; %d trends</h3>\n'
                        % (esc(url), esc(r["away"]), esc(r["home"]), len(hits)))
            body.append('          <ul class="mm-trends">\n')
            for t in hits:
                bits = []
                if has(t.get("record")):
                    bits.append("Record <b>%s</b>" % esc(t["record"]))
                if has(t.get("sample")):
                    bits.append("sample <b>%s games</b>" % esc(t["sample"]))
                if has(t.get("market")):
                    bits.append("market <b>%s</b>" % esc(t["market"]))
                if has(t.get("date_range")):
                    bits.append("window %s" % esc(t["date_range"]))
                body.append('            <li class="mm-trend"><p>%s</p>'
                            '<p class="mm-tmeta">%s</p></li>\n'
                            % (esc(t.get("claim")), ", ".join(bits)))
            body.append("          </ul>\n")
        body.append('          <p class="mm-sub">Want to run your own query over the same corpus '
                    'rather than read ours? That is what <a href="/trendspotter/">Trend Spotter</a> '
                    'is for, and <a href="/betlegend-pro/">BetLegend Pro</a> goes deeper into '
                    'situational splits.</p>\n')
    else:
        body.append('          <p class="mm-sub">No trend on today\'s board cleared the sample size '
                    'and edge gates. Nothing is listed rather than filling the page. You can query '
                    'the corpus yourself on <a href="/trendspotter/">Trend Spotter</a>.</p>\n')
    body.append("        </section>\n")
    return _support_page(
        "trends",
        "MLB Betting Trends Today, %s: Verified, With Samples" % short_date(date),
        "MLB betting trends today",
        "Every verified MLB betting trend on today's board for %s, each one measured over "
        "completed games with final scores and shown with the sample size behind it."
        % long_date(date),
        "Verified MLB trends · %s" % long_date(date),
        "Every MLB trend on today's board that cleared our sample size and edge gates, grouped by "
        "game, each shown with its record, its sample and the window it was measured over. Nothing "
        "that failed the gate appears here.",
        "".join(body), date, built_at, "Trends")


# ---------------------------------------------------------------------------
# marker replacement, byte safe
# ---------------------------------------------------------------------------
def replace_marker(text, key, payload, anchor):
    begin, end = "<!--MK:%s-->" % key, "<!--/MK:%s-->" % key
    block = "%s\n%s%s" % (begin, payload, end)
    if begin in text and end in text:
        head, rest = text.split(begin, 1)
        _, tail = rest.split(end, 1)
        return head + block + tail
    if anchor not in text:
        raise BuildError("anchor %r not found for marker %s" % (anchor, key))
    i = text.rindex(anchor)
    return text[:i] + block + "\n" + text[i:]


def sitemap_block(urls):
    lines = ["  <!-- BEGIN_MLB_MATCHUP_URLS -->"]
    for u, lastmod, freq, prio in urls:
        lines.append("  <url><loc>%s%s</loc><lastmod>%s</lastmod>"
                     "<changefreq>%s</changefreq><priority>%s</priority></url>"
                     % (SITE, u, lastmod, freq, prio))
    lines.append("  <!-- END_MLB_MATCHUP_URLS -->")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# build
# ---------------------------------------------------------------------------
def build(dates, today, dry_run=False, workers=4):
    built_at = dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    board = fetch_board()
    trend_feed = fetch_verified_trends()
    game_files = fetch_game_files()
    consensus = fetch_consensus()

    pending = {}          # repo relative path -> html
    sitemap_urls = []
    hub_rows_by_date = {}
    trends_by_date = {}

    for date in dates:
        games = fetch_schedule(date)
        print("  %s  %d games on the MLB schedule" % (date, len(games)))
        if not games:
            continue

        # Built before any page renders, so every game page can link every other
        # game on the same slate. Probables come from the schedule feed itself,
        # not from the per-game research call, so this costs nothing extra.
        slate_index = [{
            "url": matchup_url(x),
            "away": x["away_team"], "home": x["home_team"],
            "start": et_time(x.get("start_utc")),
            "probables": ("%s vs %s" % (x["away_probable"], x["home_probable"]))
                         if x.get("away_probable") and x.get("home_probable") else None,
        } for x in games]

        with ThreadPoolExecutor(max_workers=workers) as ex:
            research_list = list(ex.map(fetch_research, games))

        rows = []
        day_trends = []
        for g, research in zip(games, research_list):
            bg = board_for(board, g)
            market = markets_from(bg)
            trends = trends_for(trend_feed, g)
            day_trends += trends
            gf = game_file_for(game_files, g)
            cons = consensus_for(consensus, g)

            path = os.path.join("handicapping", "mlb", matchup_slug(g), "index.html")
            pending[path] = render_matchup(g, research, market, trends, gf, cons, built_at,
                                            slate=slate_index)

            ov = research.get("overview") or {}
            pit = research.get("pitchers") or {}
            rec = research.get("records") or {}
            aw_p = pit.get("away") if isinstance(pit, dict) else None
            hm_p = pit.get("home") if isinstance(pit, dict) else None
            aw_s = (ov.get("away_starter") or {}) if avail(ov) else {}
            hm_s = (ov.get("home_starter") or {}) if avail(ov) else {}

            def sp_line(p):
                if not avail(p):
                    return None
                era, whip = num(p.get("era")), num(p.get("whip"))
                if era and whip:
                    return "%s ERA, %s WHIP" % (era, whip)
                return "%s ERA" % era if era else None

            def sp_full(p, s):
                if not s.get("name"):
                    return None
                out = {"name": s["name"], "hand": s.get("hand")}
                if avail(p):
                    out.update({k: p.get(k) for k in
                                ("era", "whip", "k_pct", "bb_pct", "fip", "innings_pitched")})
                    sav = p.get("savant")
                    if avail(sav):
                        out["xera"] = sav.get("xera")
                return out

            aw_r = rec.get("away") if isinstance(rec, dict) else None
            hm_r = rec.get("home") if isinstance(rec, dict) else None

            def l10_pct(r):
                if not avail(r) or not has(r.get("last10")):
                    return None
                try:
                    w, l = (int(x) for x in str(r["last10"]).split("-"))
                except (TypeError, ValueError):
                    return None
                return w / float(w + l) if (w + l) else None

            a10, h10 = l10_pct(aw_r), l10_pct(hm_r)
            ov_t = market["total"].get("over") or {}
            un_t = market["total"].get("under") or {}
            f5o = market["f5_total"].get("over") or {}
            rl_a, rl_h = market["rl"].get(g["away_team"]) or {}, market["rl"].get(g["home_team"]) or {}
            tt_lines = []
            for team, tline, sides in main_team_totals(market["team_totals"]):
                tt_lines.append(("%s team total" % team,
                                 "Over %g (%s) / Under %g (%s)"
                                 % (float(tline), sides["over"], float(tline), sides["under"])))
            nr_o = market["nrfi"].get("over") or {}
            nr_u = market["nrfi"].get("under") or {}
            nrfi_lines = ([("First inning run (YRFI / NRFI)",
                            "Over %g (%s) / Under %g (%s)"
                            % (float(nr_o["line"]), nr_o["odds"], float(nr_u["line"]), nr_u["odds"]))]
                          if nr_o.get("odds") and nr_u.get("odds") else [])
            top = trends[0] if trends else None
            rows.append({
                "away": g["away_team"], "home": g["home_team"],
                "away_nick": nickname(g["away_team"]), "home_nick": nickname(g["home_team"]),
                "url": matchup_url(g), "start": et_time(g.get("start_utc")),
                "start_utc": g.get("start_utc"),
                "detailed_status": g.get("detailed_status"),
                "venue": ov.get("venue") if avail(ov) else g.get("venue"),
                "away_sp": aw_s.get("name"), "home_sp": hm_s.get("name"),
                "away_sp_line": sp_line(aw_p), "home_sp_line": sp_line(hm_p),
                "sp_away_full": sp_full(aw_p, aw_s), "sp_home_full": sp_full(hm_p, hm_s),
                "ml_away": market["ml"].get(g["away_team"]),
                "ml_home": market["ml"].get(g["home_team"]),
                "rl_away": ("%s (%s)" % (rl_a["line"], rl_a["odds"])) if rl_a.get("line") else None,
                "rl_home": ("%s (%s)" % (rl_h["line"], rl_h["odds"])) if rl_h.get("line") else None,
                "total": ("%g (O %s / U %s)" % (float(ov_t["raw_line"]),
                                                ov_t.get("odds") or "n/a",
                                                un_t.get("odds") or "n/a"))
                         if ov_t.get("raw_line") is not None else None,
                "f5_ml_away": market["f5_ml"].get(g["away_team"]),
                "f5_ml_home": market["f5_ml"].get(g["home_team"]),
                "f5_total": ("%g" % float(f5o["raw_line"])) if f5o.get("raw_line") is not None else None,
                "team_total_lines": tt_lines,
                "nrfi_lines": nrfi_lines,
                "away_l10": (aw_r or {}).get("last10") if avail(aw_r) else None,
                "home_l10": (hm_r or {}).get("last10") if avail(hm_r) else None,
                "form_gap": (a10 - h10) if (a10 is not None and h10 is not None) else None,
                "trend_count": len(trends),
                "top_trend": top.get("claim") if top else None,
                "trend_sample": (top.get("sample") if top else 0) or 0,
            })

            # sitemap: the game page, dated
            sitemap_urls.append((matchup_url(g), date, "daily" if date >= today else "monthly",
                                 "0.8" if date >= today else "0.5"))

        hub_rows_by_date[date] = rows
        trends_by_date[date] = day_trends

    if not hub_rows_by_date:
        raise BuildError("no MLB games found for %s, refusing to write an empty slate"
                         % ", ".join(dates))

    # --- the hub and the three daily views always describe TODAY -----------
    today_rows = hub_rows_by_date.get(today) or hub_rows_by_date[sorted(hub_rows_by_date)[-1]]
    today_date = today if today in hub_rows_by_date else sorted(hub_rows_by_date)[-1]

    hub_path = os.path.join("handicapping", "mlb", "index.html")
    hub_raw = io.open(os.path.join(ROOT, hub_path), encoding="utf-8", newline="").read()
    hub_nl = "\r\n" if "\r\n" in hub_raw else "\n"
    hub = hub_raw.replace("\r\n", "\n")
    hub = replace_marker(hub, "mlbSlateSSR",
                         render_hub_block(today_date, today_rows, built_at),
                         "<!--MK:gfCrossLink-->" if "<!--MK:gfCrossLink-->" in hub else "</main>")
    hub = replace_marker(hub, "mlbHubLd",
                         '    <script type="application/ld+json">\n%s\n    </script>\n'
                         % json.dumps(render_hub_ld(today_date, today_rows, built_at),
                                      indent=2, ensure_ascii=False),
                         "</head>")
    pending[hub_path] = hub.replace("\n", hub_nl)

    pending[os.path.join("handicapping", "mlb", "probable-pitchers", "index.html")] = \
        render_probable_pitchers(today_date, today_rows, built_at)
    pending[os.path.join("handicapping", "mlb", "odds", "index.html")] = \
        render_odds(today_date, today_rows, built_at)
    pending[os.path.join("handicapping", "mlb", "trends", "index.html")] = \
        render_trends(today_date, today_rows, trends_by_date.get(today_date) or [], built_at)

    for slug in ("probable-pitchers", "odds", "trends"):
        sitemap_urls.append(("%s%s/" % (HUB, slug), today_date, "daily", "0.7"))

    # --- sitemap ------------------------------------------------------------
    sm_path = "sitemap.xml"
    sm_raw = io.open(os.path.join(ROOT, sm_path), encoding="utf-8", newline="").read()
    sm_nl = "\r\n" if "\r\n" in sm_raw else "\n"
    sm = sm_raw.replace("\r\n", "\n")
    # Keep the block to a rolling window. A game page NEVER disappears from the
    # site, it only stops being advertised: exactly the unpublish behaviour
    # build_matchup_articles.py uses for a Game File.
    existing = re.findall(r"<loc>%s(/handicapping/mlb/[a-z0-9-]+-vs-[a-z0-9-]+-(\d{4}-\d{2}-\d{2})[a-z0-9-]*/)</loc>"
                          % re.escape(SITE), sm)
    cutoff = (dt.date(*(int(x) for x in today.split("-"))) - dt.timedelta(days=13)).isoformat()
    merged = {}
    for u, lastmod, freq, prio in sitemap_urls:
        merged[u] = (u, lastmod, freq, prio)
    for u, d in existing:
        if u not in merged and d >= cutoff:
            merged[u] = (u, d, "monthly", "0.5")
    ordered = sorted(merged.values(), key=lambda t: (t[1], t[0]), reverse=True)
    block = sitemap_block(ordered)
    if "<!-- BEGIN_MLB_MATCHUP_URLS -->" in sm:
        sm = re.sub(r"  <!-- BEGIN_MLB_MATCHUP_URLS -->.*?  <!-- END_MLB_MATCHUP_URLS -->",
                    lambda m: block, sm, flags=re.S)
    else:
        sm = sm.replace("</urlset>", block + "\n</urlset>")
    pending[sm_path] = sm.replace("\n", sm_nl)

    # --- write --------------------------------------------------------------
    new_pages = [p for p in pending
                 if not os.path.exists(os.path.join(ROOT, p))]
    if dry_run:
        print("\n  DRY RUN. %d files would be written, %d of them new."
              % (len(pending), len(new_pages)))
        for p in sorted(new_pages)[:80]:
            print("      new  %s" % p.replace(os.sep, "/"))
        return 0

    # Every page carries the build timestamp, so a byte comparison would say
    # "changed" on every run even when not one number moved, and the daily job
    # would commit forty files of pure noise four times a day. Comparing with
    # every ISO timestamp blanked answers the question that actually matters:
    # did the DATA change? If it did not, the file on disk is left alone and its
    # existing timestamp stands, which is honest, because nothing was rebuilt.
    stamp_re = re.compile(r"\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}Z?)?")

    def same_data(a, b):
        return stamp_re.sub("~", a) == stamp_re.sub("~", b)

    written = 0
    for rel, content in sorted(pending.items()):
        full = os.path.join(ROOT, rel)
        os.makedirs(os.path.dirname(full), exist_ok=True)
        prev = None
        if os.path.exists(full):
            prev = io.open(full, encoding="utf-8", newline="").read()
        if prev is not None and same_data(prev, content):
            continue
        io.open(full, "w", encoding="utf-8", newline="").write(content)
        written += 1
    print("\n  wrote %d files (%d new URLs), %d unchanged."
          % (written, len(new_pages), len(pending) - written))
    return 0


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--date", action="append", default=None,
                    help="slate date YYYY-MM-DD, repeatable. Default: yesterday, today, tomorrow.")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--workers", type=int, default=4)
    args = ap.parse_args()

    # "Today" is the Eastern calendar date of the slate, which is how MLB
    # numbers its days and how the hub's own JS decides what to show.
    now_et = dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=5)
    today = now_et.date().isoformat()
    if args.date:
        dates = sorted(set(args.date))
    else:
        d = now_et.date()
        dates = [(d - dt.timedelta(days=1)).isoformat(), d.isoformat(),
                 (d + dt.timedelta(days=1)).isoformat()]

    print("build_mlb_matchup_pages: dates %s (today=%s)" % (", ".join(dates), today))
    try:
        return build(dates, today, dry_run=args.dry_run, workers=args.workers)
    except BuildError as e:
        print("\n  FAILED, nothing written: %s" % e, file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
