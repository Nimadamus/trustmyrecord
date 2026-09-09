"""Handicapping hubs and evergreen matchup research pages for NFL, NBA and NHL.

WHY THIS EXISTS SEPARATELY FROM build_mlb_matchup_pages.py
The MLB builder is bound to baseball: the MLB Stats API for schedule and
probable pitchers, Baseball Savant for expected stats, and TMR's own
/handicapping/mlb/matchup research route, which exists for no other sport
(/handicapping/nfl/matchup answers 404). Bending it into a four sport builder
would have meant every sport carrying MLB's shape, and probable pitchers do not
exist in basketball.

WHERE THE CONTENT COMES FROM
  the board    /api/games/board/<sport_key>        schedule, teams, live prices
  the engine   betlegend-pro-api /api/matchup/historical
               14,371 NFL / 24,434 NBA / 28,458 NHL graded games: head to head,
               ATS, over/under, favourite and underdog splits, recent form,
               home and road splits, scoring, sample sizes
  NFL only     TMR /api/nfl/starters and /api/nfl/injuries, both already kept
               current by the existing trustmyrecord-nfl-personnel cron

URLS ARE EVERGREEN
/handicapping/nfl/49ers-vs-rams/ is the permanent page for that matchup. It is
rewritten with the next meeting rather than a new dated URL being minted, so
the page accumulates authority instead of being replaced every week.

WHAT IT WILL NOT DO
A sport whose board is empty is out of season and is skipped entirely, writing
nothing, rather than shipping a hub with no games under it. NBA and NHL turn
themselves on when their boards populate.

Nothing here is projected, modelled or predicted, and nothing absent from a
feed is estimated. Opening prices and line movement are not carried by the odds
feed, so the pages say so rather than inventing a number.
"""

import datetime
import importlib.util
import io
import json
import os
import sys
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)

# The page shell, escaping and formatting helpers live in the MLB builder and
# are shared rather than copied, so both sets of pages cannot drift apart.
_spec = importlib.util.spec_from_file_location(
    "mlb_builder", os.path.join(HERE, "build_mlb_matchup_pages.py"))
mlb = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(mlb)

_hspec = importlib.util.spec_from_file_location(
    "seo_hooks", os.path.join(HERE, "matchup_seo_hooks.py"))
seo = importlib.util.module_from_spec(_hspec)
_hspec.loader.exec_module(seo)

# SOCCER_ROOM_20260909. The soccer hub is a research page rather than a table,
# and everything specific to it (the ESPN club index, form, season rates,
# trends, head to head, the cards, the filters and the analysis panel) lives in
# its own module so this builder keeps its shape for the other five sports.
_sspec = importlib.util.spec_from_file_location(
    "soccer_hub", os.path.join(HERE, "soccer_hub.py"))
soccer = importlib.util.module_from_spec(_sspec)
_sspec.loader.exec_module(soccer)

# NFL_DEEP_PREVIEW_20260909: the deep half of an NFL matchup page (team
# statistics with league ranks, personnel, injuries, the TMR model and the
# read). Same generator for every fixture, so next week's game needs no code.
_pspec = importlib.util.spec_from_file_location(
    "nfl_preview", os.path.join(HERE, "nfl_preview_sections.py"))
nflp = importlib.util.module_from_spec(_pspec)
_pspec.loader.exec_module(nflp)

# A deep preview costs a simulation and about a dozen feed calls, so it is
# built for the games a reader is actually about to watch. Everything outside
# the window keeps the permanent research page exactly as it was.
PREVIEW_DAYS = int(os.environ.get("NFL_PREVIEW_DAYS", "9"))

SITE = mlb.SITE
API = os.environ.get("TMR_API", "https://trustmyrecord-api.onrender.com/api")
ENGINE = os.environ.get("BETLEGEND_PRO_API_BASE", "https://betlegend-pro-api.onrender.com")
SERVICE_KEY = os.environ.get("BETLEGEND_PRO_SERVICE_KEY", "")
NFL_TOKEN = os.environ.get("NFL_ADMIN_TOKEN", "")

esc = mlb.esc
slugify = mlb.slugify
odds_str = mlb.odds_str
line_str = mlb.line_str
page_head = mlb.page_head
breadcrumb_ld = mlb.breadcrumb_ld

# HUB_KEEPS_ITSELF_CURRENT_20260909. The hub is a living daily research page,
# so the baked board is the floor, not the ceiling: this script re-reads
# /api/games/board/<key> in the browser on load and every 90 seconds the tab is
# visible, repaints the table, and stamps when it last read the feed. Between
# bakes the prices on the page are the prices in the sportsbook, and a reader
# who arrives at 04:00 ET does not get the 22:40 UTC board. MLB and tennis
# already render their hubs from the feed; this gives the other five the same.
HUB_LIVE = '    <script defer src="/static/js/tmr-hub-live.js"></script>\n'

SPORTS = {
    "nfl": {"label": "NFL", "board": "americanfootball_nfl", "engine": "NFL",
            "unit": "points", "simulator": "/nfl-simulator/"},
    "nba": {"label": "NBA", "board": "basketball_nba", "engine": "NBA",
            "unit": "points", "simulator": "/nba-simulator/"},
    "nhl": {"label": "NHL", "board": "icehockey_nhl", "engine": "NHL",
            "unit": "goals", "simulator": None},
    # HUB ONLY, added 2026-09-08 on Nima's instruction that every sport in the
    # Sportsbook menu's Handicapping Hub submenu has to be a real room.
    #
    # The BetLegend Pro engine answers "'NCAAF' has no historical data in this
    # service. Supported sports are MLB, NBA, NFL, NHL." for both of these, so
    # there is no head to head record, no ATS split and no recent form to put on
    # a per matchup page. Minting 84 college football and 96 soccer permanent
    # pages whose only content is a line the board already shows would be 180
    # thin pages, so these two sports get the hub and stop there: the board, the
    # markets and the start times, which is what the menu row promises. They
    # gain matchup pages the day the engine carries their graded games.
    "ncaaf": {"label": "NCAAF", "board": "americanfootball_ncaaf", "engine": None,
              "unit": "points", "simulator": None, "hub_only": True},
    "soccer": {"label": "Soccer", "board": "soccer", "engine": None,
               "unit": "goals", "simulator": None, "hub_only": True},
}


# GAME_OF_THE_WEEK_20260907
# The one long form deep dive we publish per week, surfaced at the top of the
# sport hub. It lives at its own URL and is written by hand, so the hub links to
# it rather than trying to generate it. Point this at the current week's article
# and the callout follows; set it to None out of season and the hub renders
# exactly as it did before, with no empty box.
GAME_OF_THE_WEEK = {
    "nfl": {
        "url": "/nfl/49ers-vs-rams-week-1-2026/",
        "week": "Week 1",
        "matchup": "49ers at Rams, Melbourne Cricket Ground",
        "blurb": ("The first NFL regular season game ever played in Australia, taken apart in full: "
                  "every 2025 number for both teams, what the Rams bought in Myles Garrett and Aaron "
                  "Donald, the opener against the current line with the ticket and money splits, the "
                  "live injury board, and the game simulated 1,000 times."),
        "logos": ["sf", "lar"],
        "index": "/nfl-game-of-the-week/",
    },
    "nba": None,
    "nhl": None,
}


def gotw_block(sport):
    """The featured deep dive callout, or nothing at all when none is set."""
    g = GAME_OF_THE_WEEK.get(sport)
    if not g:
        return ""
    logos = "".join(
        '<img src="https://a.espncdn.com/i/teamlogos/nfl/500/%s.png" alt="" width="34" height="34" '
        'loading="lazy">' % a for a in g.get("logos", []))
    return (
        '        <section class="mm-sec mm-gotw">\n'
        '            <a class="mm-gotw-card" href="%s">\n'
        '                <span class="mm-gotw-tag">Game of the Week &middot; %s</span>\n'
        '                <span class="mm-gotw-teams">%s<b>%s</b></span>\n'
        '                <span class="mm-gotw-blurb">%s</span>\n'
        '                <span class="mm-gotw-cta">Read the deep dive and the 1,000 simulations &rsaquo;</span>\n'
        '            </a>\n'
        '        </section>\n'
        '        <style>\n'
        '            .mm-gotw-card{display:block;text-decoration:none;color:inherit;padding:18px 20px;border-radius:16px;\n'
        '                background:linear-gradient(120deg,rgba(255,201,60,.13),rgba(0,53,148,.16) 58%%,rgba(170,0,0,.15));\n'
        '                border:1px solid rgba(255,201,60,.4)}\n'
        '            .mm-gotw-card:hover{border-color:#FFC93C}\n'
        '            .mm-gotw-tag{display:inline-block;font:800 .68rem/1 "Barlow Condensed",Inter,sans-serif;\n'
        '                letter-spacing:.18em;text-transform:uppercase;color:#04101c;background:#FFC93C;\n'
        '                padding:6px 10px;border-radius:5px}\n'
        '            .mm-gotw-teams{display:flex;align-items:center;gap:10px;margin:13px 0 9px}\n'
        '            .mm-gotw-teams img{width:34px;height:34px;object-fit:contain}\n'
        '            .mm-gotw-teams b{font:900 1.25rem/1.1 "Barlow Condensed",Inter,sans-serif;text-transform:uppercase}\n'
        '            .mm-gotw-blurb{display:block;max-width:78ch;line-height:1.6;opacity:.86;font-size:.94rem}\n'
        '            .mm-gotw-cta{display:inline-block;margin-top:12px;font-weight:800;color:#FFC93C;font-size:.9rem}\n'
        '        </style>\n'
        % (g["url"], esc(g["week"]), logos, esc(g["matchup"]), esc(g["blurb"])))


# NEXT_GAME_SPOTLIGHT_20260909
# The hub lists sixteen fixtures in a table, which is the right shape for a
# slate and the wrong shape for "the season starts tomorrow night". The next
# kickoff gets a card of its own above the table, linking into its preview.
# Generated from the board, so it moves on its own every week and disappears
# the moment the board is empty.
def next_game_block(sport, games):
    if sport != "nfl" or not games:
        return ""
    now = datetime.datetime.now(datetime.timezone.utc)
    upcoming = []
    for g in games:
        try:
            kick = datetime.datetime.fromisoformat((g.get("commence") or "").replace("Z", "+00:00"))
        except ValueError:
            continue
        if kick >= now - datetime.timedelta(hours=4):
            upcoming.append((kick, g))
    if not upcoming:
        return ""
    kick, g = sorted(upcoming, key=lambda x: x[0])[0]
    try:
        idx = nflp.team_index()
        away = nflp.find_team(idx, g["away"])
        home = nflp.find_team(idx, g["home"])
    except Exception:  # noqa: BLE001 - a hub must never fail over a logo
        away = home = None
    if not away or not home:
        return ""
    _ml, sp_txt, tot_txt = market_cells(g)
    hours = (kick - now).total_seconds() / 3600.0
    when = "Tonight" if hours <= 10 else ("Tomorrow" if hours <= 34 else long_date(g["commence"]))
    return (
        '        <section class="mm-sec mm-next">\n'
        '            <a class="mm-next-card" href="%s">\n'
        '                <span class="mm-next-tag">Next up &middot; %s</span>\n'
        '                <span class="mm-next-teams">'
        '<img src="%s" alt="" width="42" height="42" loading="lazy"><b>%s</b>'
        '<i>at</i>'
        '<img src="%s" alt="" width="42" height="42" loading="lazy"><b>%s</b></span>\n'
        '                <span class="mm-next-when">%s, %s</span>\n'
        '                <span class="mm-next-mkt">Spread %s &middot; Total %s</span>\n'
        '                <span class="mm-next-cta">Open the full matchup preview &rsaquo;</span>\n'
        '            </a>\n'
        '        </section>\n'
        '        <style>\n'
        '            .mm-next-card{display:block;text-decoration:none;color:inherit;padding:18px 20px;\n'
        '                border-radius:16px;background:linear-gradient(120deg,rgba(66,211,146,.12),rgba(0,53,148,.16));\n'
        '                border:1px solid rgba(66,211,146,.38)}\n'
        '            .mm-next-card:hover{border-color:#42d392}\n'
        '            .mm-next-tag{display:inline-block;font:800 .68rem/1 "Barlow Condensed",Inter,sans-serif;\n'
        '                letter-spacing:.18em;text-transform:uppercase;color:#04101c;background:#42d392;\n'
        '                padding:6px 10px;border-radius:5px}\n'
        '            .mm-next-teams{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:13px 0 6px}\n'
        '            .mm-next-teams img{width:42px;height:42px;object-fit:contain}\n'
        '            .mm-next-teams b{font:900 1.2rem/1.1 "Barlow Condensed",Inter,sans-serif;text-transform:uppercase}\n'
        '            .mm-next-teams i{font-style:normal;opacity:.6;font-size:.8rem;letter-spacing:.14em;text-transform:uppercase}\n'
        '            .mm-next-when,.mm-next-mkt{display:block;font-size:.92rem;opacity:.85}\n'
        '            .mm-next-cta{display:inline-block;margin-top:12px;font-weight:800;color:#42d392;font-size:.9rem}\n'
        '        </style>\n'
        % (game_url(sport, g), esc(when), away["logo"], esc(g["away"]),
           home["logo"], esc(g["home"]),
           esc(long_date(g["commence"])), esc(kickoff(g["commence"])),
           sp_txt, tot_txt))


# DS_BODY_CLASS_20260909
# Every page this builder writes carried a bare <body>, so none of the design
# system reached it: tmr-ds.css declares its palette on `body.tmr-ds`, and with
# that class absent the tokens are undefined and tmr-mlb-matchup.css paints its
# near-white heading colour onto a plain white page. Section headings on
# /handicapping/nfl/, /handicapping/nba/ and every matchup page under them were
# effectively invisible. The MLB builder has always emitted the class (its pages
# read "tmr-ds tmr-ds--dark tmr-site-shell mm-page"); this one never did.
BODY_TAG = '<body class="tmr-ds tmr-ds--dark tmr-site-shell mm-page">\n'

# The MLB builder wraps its pages in main.mm-shell, which tmr-mlb-matchup.css
# gives a 1120px column. This builder has always used main.mm-wrap, which that
# stylesheet does not style at all, so with the design system finally reaching
# these pages the content ran the full width of the window. The same column is
# declared here rather than in the shared stylesheet, so nothing else moves.
SHELL_STYLE = (
    '    <style>\n'
    '        .mm-wrap{width:min(1120px,calc(100% - 32px));margin:0 auto;padding:34px 0 72px}\n'
    '        .mm-head{margin-bottom:26px}\n'
    '        .mm-sec{margin:0 0 30px}\n'
    '        @media (max-width:620px){.mm-wrap{padding:18px 0 48px}}\n'
    '    </style>\n')


class BuildError(Exception):
    pass


def get_json(url, attempts=3, method="GET", body=None, headers=None):
    last = None
    for _ in range(attempts):
        try:
            data = json.dumps(body).encode() if body is not None else None
            req = urllib.request.Request(url, data=data, method=method)
            req.add_header("Accept", "application/json")
            if data is not None:
                req.add_header("Content-Type", "application/json")
            for k, v in (headers or {}).items():
                req.add_header(k, v)
            with urllib.request.urlopen(req, timeout=90) as r:
                return json.loads(r.read().decode("utf-8"))
        except Exception as exc:  # noqa: BLE001 - retried, then reported
            last = exc
    raise BuildError("%s failed after %d attempts: %s" % (url, attempts, last))


# ---------------------------------------------------------------- data

def fetch_board(sport):
    d = get_json("%s/games/board/%s?limit=80" % (API, SPORTS[sport]["board"]))
    games = []
    for g in d.get("games") or []:
        if g.get("has_placeholder_teams"):
            continue
        home, away = g.get("home_team"), g.get("away_team")
        if not home or not away:
            continue
        games.append({"home": home, "away": away, "commence": g.get("commence_time"),
                      "event_id": g.get("id"),
                      "markets": best_markets(g), "priced": bool(g.get("has_sportsbook_odds")),
                      # Soccer's board is seven competitions in one list, so the
                      # fixture alone does not say what a reader is looking at.
                      "comp": g.get("tournament_name") or g.get("sport_title") or "",
                      "_raw": g if sport == "soccer" else None})
    games.sort(key=lambda x: (x["commence"] or "", x["away"]))
    return games


def best_markets(g):
    """First bookmaker carrying each market, named so the page can say which.

    Deliberately not an average across books: an averaged line is a number
    nobody can actually bet, and the MLB pages already name the single book."""
    out = {"book": None, "h2h": {}, "spread": {}, "total": {}}
    for b in g.get("bookmakers") or []:
        for m in b.get("markets") or []:
            key, outcomes = m.get("key"), m.get("outcomes") or []
            if key == "h2h" and not out["h2h"]:
                out["h2h"] = {o.get("name"): o.get("price") for o in outcomes}
            elif key == "spreads" and not out["spread"]:
                out["spread"] = {o.get("name"): (o.get("point"), o.get("price")) for o in outcomes}
            elif key == "totals" and not out["total"]:
                for o in outcomes:
                    if (o.get("name") or "").lower() == "over":
                        out["total"] = {"point": o.get("point"), "price": o.get("price")}
        if out["h2h"] or out["spread"] or out["total"]:
            out["book"] = out["book"] or b.get("title")
    return out


def fetch_history(sport, away, home):
    """Head to head and both teams' form from the BetLegend Pro engine."""
    if not SERVICE_KEY:
        return None
    try:
        return get_json("%s/api/matchup/historical" % ENGINE.rstrip("/"), attempts=2,
                        method="POST",
                        body={"sport": SPORTS[sport]["engine"], "team_1": away, "team_2": home},
                        headers={"X-TMR-Service-Key": SERVICE_KEY, "X-TMR-User-Id": "0"})
    except BuildError as exc:
        print("  WARN  history unavailable for %s at %s (%s)" % (away, home, exc))
        return None


def fetch_nfl_extras():
    """Starting quarterbacks, status notes and divisions.

    All three already exist and are kept current by the trustmyrecord-nfl-
    personnel cron. Returns empty structures when the token is absent, and the
    pages then omit those sections rather than inventing them."""
    if not NFL_TOKEN:
        print("  WARN  NFL_ADMIN_TOKEN unset; quarterbacks and status notes omitted")
        return {}, {}, {}
    hdr = {"x-nfl-admin-token": NFL_TOKEN}
    try:
        teams = get_json("%s/nfl/teams" % API, attempts=2, headers=hdr).get("teams") or []
        by_name = {t["display_name"]: t for t in teams}
        starters = get_json("%s/nfl/starters" % API, attempts=2, headers=hdr)
        qb1 = {r["franchise_id"]: r for r in starters.get("qb1") or []}
        inj = get_json("%s/nfl/injuries" % API, attempts=2, headers=hdr)
        by_team = {}
        for r in inj.get("injuries") or []:
            by_team.setdefault(r.get("franchise_id"), []).append(r)
        return by_name, qb1, {"by_team": by_team, "disclaimer": inj.get("disclaimer")}
    except BuildError as exc:
        print("  WARN  NFL personnel feed unavailable (%s)" % exc)
        return {}, {}, {}


# ---------------------------------------------------------------- helpers

def game_slug(g):
    """One permanent URL per GAME, keyed on the board's own event id.

    A bare pair slug cannot represent two different meetings between the same
    teams: the second one overwrites the first and the earlier page stops
    existing. The board's id is immutable and unique per fixture, so the URL is
    permanent and the changing part of the story lives in the title.

    The feed's ids read an_americanfootball_nfl_290843; only the numeric tail is
    kept, since the sport is already in the path."""
    base = "%s-vs-%s" % (slugify(g["away"]), slugify(g["home"]))
    raw = str(g.get("event_id") or "")
    tail = raw.rsplit("_", 1)[-1] if raw else ""
    if not tail:
        raise BuildError("board game has no id: %s at %s" % (g["away"], g["home"]))
    return "%s-%s" % (base, tail)


def game_url(sport, g):
    return "/handicapping/%s/%s/" % (sport, game_slug(g))


def kickoff(iso):
    try:
        return mlb.et_time(iso)
    except Exception:  # noqa: BLE001 - formatting only
        return "TBD"


def et_date(iso):
    """The calendar date in EASTERN time, which is the date of the game.

    ET_DATE_20260909. The board timestamps in UTC, and a night kickoff is
    already the next UTC day: Patriots at Seahawks starts 2026-09-09 20:20 ET
    and the feed calls it 2026-09-10T00:20Z. Formatting the raw ISO date put
    "Thursday September 10" on a Wednesday night game. The clock beside it was
    already converted (mlb.et_time); only the date was not."""
    raw = (iso or "").strip()
    if not raw:
        return None
    try:
        t = datetime.datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError:
        try:
            return datetime.date.fromisoformat(raw[:10])
        except ValueError:
            return None
    if t.tzinfo is None:
        t = t.replace(tzinfo=datetime.timezone.utc)
    t = t.astimezone(datetime.timezone.utc)
    # US Eastern DST: second Sunday in March to the first Sunday in November.
    # Computed rather than imported, matching mlb.et_time, so the script stays
    # stdlib only and does not depend on the runner's tzdata.
    mar = datetime.datetime(t.year, 3, 8, tzinfo=datetime.timezone.utc)
    while mar.weekday() != 6:
        mar += datetime.timedelta(days=1)
    nov = datetime.datetime(t.year, 11, 1, tzinfo=datetime.timezone.utc)
    while nov.weekday() != 6:
        nov += datetime.timedelta(days=1)
    dst = mar + datetime.timedelta(hours=7) <= t < nov + datetime.timedelta(hours=6)
    return (t + datetime.timedelta(hours=-4 if dst else -5)).date()


def long_date(iso):
    """"Wednesday September 9, 2026". %-d is glibc only and this builder runs
    on Windows as well as CI, so the day is written by hand rather than left
    zero padded on one platform and not the other."""
    d = et_date(iso)
    if not d:
        return ""
    return "%s %s %d, %d" % (d.strftime("%A"), d.strftime("%B"), d.day, d.year)


def market_cells(g):
    m = g["markets"]
    ml, sp, tot = m["h2h"], m["spread"], m["total"]
    ml_txt = ("%s %s / %s %s" % (esc(g["away"]), odds_str(ml.get(g["away"])),
                                 esc(g["home"]), odds_str(ml.get(g["home"])))
              if ml else "not priced")
    if sp.get(g["home"]):
        point, price = sp[g["home"]]
        sp_txt = "%s %s (%s)" % (esc(g["home"]), line_str(point), odds_str(price))
    else:
        sp_txt = "not priced"
    # line_str signs its output, which is right for a spread and wrong for a
    # total: a 44.5 total is not "+44.5".
    tot_txt = ("o%g (%s)" % (float(tot["point"]), odds_str(tot.get("price")))
               if tot.get("point") is not None else "not priced")
    return ml_txt, sp_txt, tot_txt


def row(label, value):
    return '                <tr><th scope="row">%s</th><td>%s</td></tr>\n' % (esc(label), value)


def section(title, rows, note=None, lede=None):
    """A table section, or nothing at all when there is no data for it.

    Returning "" on empty is what keeps a missing feed from leaving an empty
    heading on the page."""
    if not rows:
        return ""
    b = ['        <section class="mm-sec">\n', '            <h2>%s</h2>\n' % esc(title)]
    if lede:
        b.append('            <p class="mm-lede">%s</p>\n' % esc(lede))
    b.append('            <table class="mm-table"><tbody>\n')
    b += rows
    b.append('            </tbody></table>\n')
    if note:
        b.append('            <p class="mm-note">%s</p>\n' % esc(note))
    b.append('        </section>\n')
    return "".join(b)


# ---------------------------------------------------------------- sections

BLP_CROSS_LINK_TPL = (
    '    <!--MK:blpCrossLink-->\n'
    '    <p class="mm-note">Everything above answers one matchup. '
    '<a href="/betlegend-pro/">BetLegend Pro</a> is the same database with the question left '
    'open: stack situational conditions on the %s or anyone else across 130,000+ graded games '
    'and get the record with the sample size attached. Free to try, 25 lookups a day.</p>\n'
    '    <!--/MK:blpCrossLink-->\n'
)


def board_section(g):
    ml_txt, sp_txt, tot_txt = market_cells(g)
    book = g["markets"]["book"]
    rows = [row("Moneyline", ml_txt), row("Spread", sp_txt), row("Total", tot_txt)]
    note = (("Prices read from %s and they move; check the book before acting on any number here. "
             "Opening prices and line movement are not carried by the odds feed, so they are left "
             "out rather than reconstructed." % book) if book else
            "The sportsbook feed is not carrying this game yet.")
    return section("The board", rows, note)


def form_section(hist):
    if not hist:
        return ""
    rows = []
    for key in ("team_1_context", "team_2_context"):
        c = hist.get(key) or {}
        if not c.get("team"):
            continue
        bits = []
        if c.get("last_10_record"):
            bits.append("last 10 %s" % c["last_10_record"])
        if c.get("current_streak"):
            bits.append("streak %s" % c["current_streak"])
        if c.get("last_20_home_record"):
            bits.append("home games within the last 20 %s" % c["last_20_home_record"])
        if c.get("last_20_away_record"):
            bits.append("road games within the last 20 %s" % c["last_20_away_record"])
        if bits:
            rows.append(row(c["team"], esc(", ".join(bits))))
    note = ((hist.get("team_1_context") or {}).get("note") or "").strip() or None
    return section("Recent form", rows, note,
                   "Both teams against all opponents, for context. It is never mixed into the "
                   "head to head sample below.")


def h2h_section(sport, hist):
    unit = SPORTS[sport]["unit"]
    if not hist or hist.get("zero_result"):
        return ('        <section class="mm-sec">\n'
                '            <h2>Head to head</h2>\n'
                '            <p class="mm-note">The database holds no completed meeting between '
                'these two teams, so there is no record to show. It is left blank rather than '
                'filled with an estimate.</p>\n        </section>\n')
    ms = hist.get("matchup_summary") or {}
    t1, t2 = ms.get("team_1") or {}, ms.get("team_2") or {}
    sc = ms.get("scoring") or {}
    rows = []
    if t1.get("team") and t2.get("team"):
        rows.append(row("Record in these meetings",
                        "%s %s-%s, %s %s-%s" % (esc(t1["team"]), t1.get("wins", 0),
                                                t1.get("losses", 0), esc(t2["team"]),
                                                t2.get("wins", 0), t2.get("losses", 0))))
    if ms.get("home_side_label"):
        rows.append(row("Home side", esc(ms["home_side_label"])))
    if sc.get("avg_combined") is not None:
        rows.append(row("Average combined %s" % unit, esc(sc["avg_combined"])))
    if sc.get("avg_margin") is not None:
        rows.append(row("Average margin", esc(sc["avg_margin"])))
    if (ms.get("close_games") or {}).get("label"):
        rows.append(row("One score games", esc(ms["close_games"]["label"])))
    # The engine states the sample it answered with; the page repeats it
    # verbatim so a reader knows which meetings are in and which are out.
    lede_bits = []
    qs = (hist.get("query_summary") or {}).get("text")
    if qs:
        lede_bits.append(esc(qs))
    span = (hist.get("qualifying_span") or {}).get("label")
    if span:
        lede_bits.append(esc(span))
    h2h = hist.get("head_to_head") or {}
    if h2h.get("lifetime_meetings") and h2h.get("record"):
        lede_bits.append("Every completed meeting on file, no filters: %s meetings, %s %s."
                         % (esc(h2h["lifetime_meetings"]), esc(h2h.get("team") or ""),
                            esc(h2h["record"])))
    applied = [str(f) for f in (hist.get("filters_applied") or []) if f]
    if applied:
        lede_bits.append("Filter applied by the engine: %s. Neutral-site games are counted by "
                         "the designated home side; the dataset carries no neutral-site flag."
                         % esc("; ".join(applied)))
    return section("Head to head", rows, None, " ".join(lede_bits) or None)


def market_section(hist):
    if not hist:
        return ""
    mk = ((hist.get("matchup_summary") or {}).get("market")) or {}
    rows = []
    for key, label in (("ats", "Against the spread"), ("over_under", "Over / under"),
                       ("favorite", "As favourite"), ("underdog", "As underdog")):
        item = mk.get(key) or {}
        if item.get("label"):
            rows.append(row(label, esc(item["label"])))
    money = mk.get("moneyline") or {}
    for side in ("team_1", "team_2"):
        s = money.get(side) or {}
        if s.get("team") and s.get("units") is not None:
            rows.append(row("%s moneyline units" % s["team"],
                            "%s over %s games, flat one-unit stake at the closing price"
                            % (esc(s["units"]), esc(s.get("eligible_games", 0)))))
    note = ((hist.get("matchup_summary") or {}).get("samples") or {}).get("note")
    money_note = (money.get("note") or "").strip()
    if money_note:
        note = ("%s %s" % (note, money_note)).strip() if note else money_note
    return section("Betting splits in this matchup", rows, note)


def nfl_people_sections(sport, g, teams_by_name, qb1, injuries):
    if sport != "nfl" or not teams_by_name:
        return ""
    out = []
    qb_rows = []
    for side in ("away", "home"):
        t = teams_by_name.get(g[side])
        starter = qb1.get(t["franchise_id"]) if t else None
        if starter and starter.get("full_name"):
            qb_rows.append(row("%s QB" % g[side], esc(starter["full_name"])))
    out.append(section("Starting quarterbacks", qb_rows, None,
                       "Top of the depth chart, refreshed daily."))

    inj_rows = []
    for side in ("away", "home"):
        t = teams_by_name.get(g[side])
        listed = (injuries.get("by_team") or {}).get(t["franchise_id"]) if t else None
        if listed:
            names = sorted({r.get("full_name", "") for r in listed if r.get("full_name")})
            if names:
                inj_rows.append(row(g[side], esc(", ".join(names)[:400])))
    out.append(section("Players carrying status notes", inj_rows,
                       injuries.get("disclaimer")))
    return "".join(out)


def division_section(sport, g, teams_by_name):
    if sport != "nfl" or not teams_by_name:
        return ""
    rows = []
    for side in ("away", "home"):
        t = teams_by_name.get(g[side])
        if t and t.get("conference"):
            rows.append(row(g[side], "%s %s" % (esc(t["conference"]), esc(t.get("division", "")))))
    return section("Conference and division", rows)


def coverage_section(hist):
    if not hist:
        return ""
    rows = []
    cov = hist.get("database_coverage") or {}
    if cov.get("games"):
        rows.append(row("Games in the database",
                        "%s %s, %s to %s" % (esc(cov.get("games")), esc(cov.get("sport", "")),
                                             esc(cov.get("earliest_date", "")),
                                             esc(cov.get("latest_date", "")))))
    fresh = hist.get("data_freshness") or {}
    if fresh.get("label"):
        rows.append(row("Data through", esc(fresh["label"])))
    unavailable = (hist.get("matchup_summary") or {}).get("unavailable_readings") or []
    note = None
    if unavailable:
        first = unavailable[0]
        note = "%s. %s" % (first.get("reading", ""), first.get("reason", ""))
    return section("What the data covers, and what it does not", rows, note)


# ---------------------------------------------------------------- pages

def wants_preview(sport, g):
    """True when this fixture is close enough to warrant the deep build."""
    if sport != "nfl":
        return False
    try:
        kick = datetime.datetime.fromisoformat(
            (g.get("commence") or "").replace("Z", "+00:00"))
    except ValueError:
        return False
    now = datetime.datetime.now(datetime.timezone.utc)
    return -datetime.timedelta(hours=6) <= (kick - now) <= datetime.timedelta(days=PREVIEW_DAYS)


def preview_context(sport, g, extras):
    """Fetch the deep preview for one game, or None. Never raises."""
    if not wants_preview(sport, g):
        return None
    teams_by_name, qb1, _inj = extras
    fallback = {}
    for side in ("away", "home"):
        t = (teams_by_name or {}).get(g[side])
        starter = (qb1 or {}).get(t["franchise_id"]) if t else None
        if starter and starter.get("full_name"):
            fallback[side] = starter["full_name"]
    when = "%s, %s" % (long_date(g["commence"]), kickoff(g["commence"]))
    try:
        ctx = nflp.build_context(g, kickoff_text=when, qb_fallback=fallback)
    except Exception as exc:  # noqa: BLE001 - a preview must never fail a build
        print("  WARN  preview build failed for %s at %s (%s)" % (g["away"], g["home"], exc))
        return None
    if ctx:
        print("  preview built: %s at %s" % (g["away"], g["home"]))
    return ctx


def render_game(sport, g, hist, slate, extras, built_at, hook=None, preview=None):
    label = SPORTS[sport]["label"]
    teams_by_name, qb1, injuries = extras
    # The hook is one true, game-specific number, frozen the first time this
    # fixture is seen. Without it every page in the sport carries the same
    # title and they compete with each other for one query.
    title = ("%s vs %s: %s" % (g["away"], g["home"], hook[0]) if hook
             else "%s vs %s: %s Odds, Head to Head and Betting Trends"
             % (g["away"], g["home"], label))
    desc = ("%s at %s. The current line, the complete head to head record, against the spread and "
            "over/under splits, and recent form for both teams." % (g["away"], g["home"]))
    if preview:
        desc = ("%s at %s: the full matchup preview. Line, records, offensive and defensive "
                "comparison, expected quarterbacks, key players, injuries, the head to head "
                "record and the TrustMyRecord model projection." % (g["away"], g["home"]))
    url = SITE + game_url(sport, g)
    ld = {"@context": "https://schema.org", "@graph": [breadcrumb_ld([
        ("Handicapping", "/handicapping/"), (label, "/handicapping/%s/" % sport),
        ("%s at %s" % (g["away"], g["home"]), None)])]}

    others = [o for o in slate if game_url(sport, o) != game_url(sport, g)][:6]
    related = "".join('                <li><a href="%s">%s at %s</a></li>\n'
                      % (game_url(sport, o), esc(o["away"]), esc(o["home"])) for o in others)
    sim = SPORTS[sport]["simulator"]

    b = [BODY_TAG, SHELL_STYLE, '    <main class="mm-wrap">\n',
         '        <header class="mm-head">\n',
         '            <span class="mm-kicker">%s</span>\n' % esc(label),
         '            <h1>%s at %s</h1>\n' % (esc(g["away"]), esc(g["home"])),
         (('            <p class="mm-lede">%s, %s. The full preview: the board, both teams by '
           'the numbers, who is expected to play, the head to head record and what the '
           'TrustMyRecord model makes of it.</p>\n'
           % (esc(long_date(g["commence"])), esc(kickoff(g["commence"])))) if preview else
          ('            <p class="mm-lede">Next meeting %s, %s. This page is permanent and '
           'carries whichever game these two play next.</p>\n'
           % (esc(long_date(g["commence"])), esc(kickoff(g["commence"]))))),
         '        </header>\n',
         # NFL_DEEP_PREVIEW_20260909. Reading order: who and where, the price,
         # the two teams in full, then the record between them, then the model
         # and the read. The stub sections a preview supersedes (starting
         # quarterbacks, status notes) are dropped rather than printed twice.
         (nflp.render_hero(preview) if preview else ""),
         board_section(g),
         (nflp.render_teams(preview) if preview else ""),
         ("" if preview else nfl_people_sections(sport, g, teams_by_name, qb1, injuries)),
         division_section(sport, g, teams_by_name),
         form_section(hist),
         h2h_section(sport, hist),
         market_section(hist),
         coverage_section(hist),
         (nflp.render_model(preview) if preview else ""),
         '        <section class="mm-sec">\n',
         '            <h2>Rest of the %s board</h2>\n' % esc(label),
         '            <ul>\n', related,
         '                <li><a href="/handicapping/%s/">Every %s game on the board</a></li>\n'
         % (sport, esc(label)),
         ('                <li><a href="%s">Simulate this matchup</a></li>\n' % sim) if sim else "",
         '            </ul>\n        </section>\n',
         '        <p class="mm-note">Built %s. '
         '<a href="/handicapping/%s/">Back to the %s slate</a>, or the '
         '<a href="/handicapping/">handicapping hub</a>.</p>\n'
         % (esc(built_at[:16].replace("T", " ") + " UTC"), sport, esc(label)),
         (nflp.sources_note(preview) if preview else ""),
         BLP_CROSS_LINK_TPL % esc(g["home"]),
         '    </main>\n', mlb.FOOT_SCRIPTS, '</body>\n</html>\n']
    return page_head(title, desc, url, ld) + "".join(b)


FOOT = "</body>" + chr(10) + "</html>" + chr(10)


def render_soccer_hub(games, built_at):
    """The soccer room. Same shell and same sitemap entry, different body."""
    title = "Soccer Handicapping: Form, Stats, Trends and Today's Odds"
    desc = ("Every soccer fixture on the board with the price beside the research: recent form, "
            "season attacking and defensive rates, expected goals, over/under and both teams to "
            "score trends, home and away records and head to head.")
    url = SITE + "/handicapping/soccer/"
    data = soccer.SoccerData()
    soccer.load_index(data)
    rich = soccer.build_games(data, games)
    items = [{"@type": "ListItem", "position": i + 1,
              "name": "%s at %s" % (g["away_name"], g["home_name"])}
             for i, g in enumerate(rich)]
    ld = {"@context": "https://schema.org", "@graph": [
        breadcrumb_ld([("Handicapping", "/handicapping/"), ("Soccer", None)]),
        {"@type": "ItemList", "itemListElement": items}]}
    helpers = {"esc": esc, "odds_str": odds_str, "line_str": line_str,
               "kickoff": kickoff, "long_date": long_date}
    extras = """        <section class="sh-sec">
            <div class="sh-sec-head"><h2>Elsewhere on TrustMyRecord</h2></div>
            <ul class="sh-links">
                <li><a href="/handicapping/">The handicapping hub, every sport</a></li>
                <li><a href="/soccer-pick-tracker/">Soccer pick tracker</a></li>
                <li><a href="/sportsbook/">The sportsbook, every market</a></li>
                <li><a href="/handicapping/mlb/">MLB matchups and probable pitchers</a></li>
                <li><a href="/betlegend-pro/">BetLegend Pro, the research database</a></li>
            </ul>
        </section>
"""
    body = soccer.render_body(rich, built_at, helpers, extras, gotw_block("soccer"))
    return (page_head(title, desc, url, ld) + BODY_TAG + soccer.CSS + body
            + mlb.FOOT_SCRIPTS + FOOT)


def _render_ncaaf_research_hub(games, built_at):
    """/handicapping/ncaaf/, built by the NCAAF research modules.

    Returns None when ESPN has no upcoming slate at all, in which case the
    caller falls back to the plain board hub rather than writing an empty page
    over a good one."""
    if HERE not in sys.path:
        sys.path.insert(0, HERE)
    import ncaaf_hub_page
    body, slate = ncaaf_hub_page.build_body(
        games, built_at, esc, mlb.FOOT_SCRIPTS, BODY_TAG, SHELL_STYLE,
        featured_callout=gotw_block)
    if not body:
        return None
    title = "NCAAF Handicapping: Matchups, Team Stats, ATS Trends and Odds"
    desc = ("College football handicapping: featured matchup cards with team statistical "
            "comparisons and national ranks, against the spread and over/under splits, recent "
            "form settled at the closing number, head to head history, and the full NCAAF "
            "board filterable by conference.")
    url = SITE + "/handicapping/ncaaf/"
    ld = {"@context": "https://schema.org", "@graph": [
        breadcrumb_ld([("Handicapping", "/handicapping/"), ("NCAAF", None)]),
        {"@type": "ItemList", "itemListElement": [
            {"@type": "ListItem", "position": i + 1,
             "name": "%s at %s" % (g["away"]["name"], g["home"]["name"])}
            for i, g in enumerate(slate)]}]}
    return page_head(title, desc, url, ld) + body


def render_hub(sport, games, built_at):
    if sport == "soccer":
        return render_soccer_hub(games, built_at)
    # NCAAF_HANDICAPPING_HUB_20260909. NCAAF is hub-first and stays hub-first:
    # no per-fixture page is minted here and none ever was. What changed is the
    # hub itself, which was a price list with a heading. ESPN carries college
    # team statistics with national ranks, closing numbers on every completed
    # game, polls, leaders and coaches, so the hub is now the research: see
    # scripts/ncaaf_hub*.py. If ESPN has no upcoming slate the board hub below
    # is written instead, rather than an empty page over a good one.
    if sport == "ncaaf":
        research = _render_ncaaf_research_hub(games, built_at)
        if research:
            return research
    label = SPORTS[sport]["label"]
    hub_only = bool(SPORTS[sport].get("hub_only"))
    title = ("%s Handicapping: Today's Board, Odds and Totals" % label if hub_only
             else "%s Handicapping: Odds, Head to Head and Betting Trends" % label)
    desc = (("Every %s game on the board today with the moneyline, the spread and the total, "
             "priced from the sportsbook feed." % label) if hub_only else
            ("Every %s game on the board with the current line, and a permanent research page for "
             "each matchup carrying the head to head record, against the spread and over/under "
             "splits and recent form." % label))
    url = SITE + "/handicapping/%s/" % sport
    # A hub-only sport has no matchup pages, so its ItemList must not advertise
    # URLs that would answer 404. The fixtures are still listed.
    items = [{"@type": "ListItem", "position": i + 1,
              "name": "%s at %s" % (g["away"], g["home"])}
             for i, g in enumerate(games)]
    if not hub_only:
        for i, g in enumerate(games):
            items[i]["url"] = SITE + game_url(sport, g)
    ld = {"@context": "https://schema.org", "@graph": [
        breadcrumb_ld([("Handicapping", "/handicapping/"), (label, None)]),
        {"@type": "ItemList", "itemListElement": items}]}

    priced = sum(1 for g in games if g["priced"])
    sim = SPORTS[sport]["simulator"]
    b = [BODY_TAG, SHELL_STYLE, '    <main class="mm-wrap">\n',
         '        <header class="mm-head">\n',
         '            <span class="mm-kicker">Handicapping</span>\n',
         '            <h1>%s Handicapping</h1>\n' % esc(label),
         (('            <p class="mm-lede">Every %s game on the board today with the moneyline, '
           'the spread and the total, straight off the sportsbook feed. There are no permanent '
           'matchup pages for this sport yet: the graded game database behind them does not carry '
           '%s, and a page with no record on it is not research.</p>\n' % (esc(label), esc(label)))
          if hub_only else
          ('            <p class="mm-lede">Every %s game on the board with the line, and a permanent '
           'research page per matchup: head to head record, against the spread and over/under '
           'splits, recent form, and what the data does not cover.</p>\n' % esc(label))),
         '        </header>\n',
         next_game_block(sport, games),
         gotw_block(sport),
         '        <section class="mm-sec">\n            <h2>On the board</h2>\n',
         ('            <p class="mm-lede">%d game%s listed, %d priced by the sportsbook feed. '
          'Times are Eastern.</p>\n' % (len(games), "" if len(games) == 1 else "s", priced))
         if games else
         ('            <p class="mm-lede">No %s games are on the board right now. Matchup pages '
          'are built from the board, so none exist until the league schedule is posted; nothing '
          'is shown in the meantime rather than a stale or estimated slate.</p>\n' % esc(label)),
         '            <table class="mm-table">\n',
         '                <thead><tr><th>Matchup</th>%s<th>Start</th><th>Moneyline</th>'
         '<th>Spread</th><th>Total</th></tr></thead>\n                <tbody>\n'
         % ('<th>Competition</th>' if sport == "soccer" else "")]
    for g in games:
        ml_txt, sp_txt, tot_txt = market_cells(g)
        # A hub-only sport has no matchup page to link to, so the fixture is
        # plain text rather than a link into a 404.
        fixture = ('%s at %s' % (esc(g["away"]), esc(g["home"])) if hub_only else
                   '<a href="%s">%s at %s</a>' % (game_url(sport, g), esc(g["away"]),
                                                  esc(g["home"])))
        comp = '<td>%s</td>' % esc(g.get("comp") or "") if sport == "soccer" else ""
        b.append('                    <tr><td>%s</td>%s<td>%s</td>'
                 '<td>%s</td><td>%s</td><td>%s</td></tr>\n'
                 % (fixture, comp, esc(kickoff(g["commence"])), ml_txt, sp_txt, tot_txt))
    b += ['                </tbody>\n            </table>\n        </section>\n',
          '        <section class="mm-sec">\n            <h2>Elsewhere on TrustMyRecord</h2>\n',
          '            <ul>\n',
          '                <li><a href="/handicapping/">The handicapping hub, every sport</a></li>\n',
          ('                <li><a href="%s">%s Game of the Week, the weekly deep dive</a></li>\n'
           % (GAME_OF_THE_WEEK[sport]["index"], esc(SPORTS[sport]["label"]))) if GAME_OF_THE_WEEK.get(sport) else "",
          '                <li><a href="/handicapping/mlb/">MLB matchups, odds and probable pitchers</a></li>\n',
          ('                <li><a href="%s">%s simulator</a></li>\n' % (sim, esc(label))) if sim else "",
          '                <li><a href="/betlegend-pro/">BetLegend Pro, the research database '
          'behind these pages</a></li>\n',
          '            </ul>\n        </section>\n',
          ('        <p class="mm-note">Lines come from the sportsbook feed. Nothing here is a '
           'projection and nothing is estimated: this page shows the board and nothing else. '
           'Built %s.</p>\n' % esc(built_at[:16].replace("T", " ") + " UTC")) if hub_only else
          ('        <p class="mm-note">Lines come from the sportsbook feed and history from the '
           'graded game database. Nothing here is a projection: every number counts games already '
           'played. Built %s.</p>\n' % esc(built_at[:16].replace("T", " ") + " UTC")),
          '    </main>\n', mlb.FOOT_SCRIPTS, HUB_LIVE, '</body>\n</html>\n']
    return page_head(title, desc, url, ld) + "".join(b)


# ---------------------------------------------------------------- sitemap

MARK_BEGIN = "  <!-- BEGIN_SPORT_MATCHUP_URLS -->"
MARK_END = "  <!-- END_SPORT_MATCHUP_URLS -->"


def update_sitemap(urls, today):
    """Rewrite this builder's block in sitemap.xml.

    Its own markers, separate from the MLB block, so the two builders cannot
    clobber each other. Rebuilt from scratch every run rather than merged,
    which is what makes a sport going out of season drop out instead of leaving
    URLs advertised for pages nobody maintains."""
    path = os.path.join(REPO, "sitemap.xml")
    raw = io.open(path, encoding="utf-8", newline="").read()
    eol = "\r\n" if "\r\n" in raw else "\n"
    sm = raw.replace("\r\n", "\n")

    rows = [MARK_BEGIN]
    for url, prio in urls:
        rows.append('  <url><loc>%s%s</loc><lastmod>%s</lastmod>'
                    '<changefreq>daily</changefreq><priority>%s</priority></url>'
                    % (SITE, url, today, prio))
    rows.append(MARK_END)
    block = "\n".join(rows)

    if MARK_BEGIN in sm and MARK_END in sm:
        sm = sm[:sm.index(MARK_BEGIN)] + block + sm[sm.index(MARK_END) + len(MARK_END):]
    else:
        sm = sm.replace("</urlset>", block + "\n</urlset>")

    out = sm.replace("\n", eol)
    if out != raw:
        io.open(path, "w", encoding="utf-8", newline="").write(out)
        print("sitemap: %d matchup url(s) advertised" % len(urls))


# ---------------------------------------------------------------- main

def write(path, html):
    full = os.path.join(REPO, path)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    existing = None
    if os.path.exists(full):
        with io.open(full, encoding="utf-8") as fh:
            existing = fh.read()
    if existing == html:
        return False
    with io.open(full, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(html)
    return True


def build(sport, built_at):
    games = fetch_board(sport)
    # HUB ONLY. No engine, so no head to head, ATS or form to put on a matchup
    # page; the hub is written with the live board and nothing else is minted.
    if SPORTS[sport].get("hub_only"):
        print("%s: hub only, %d game(s) on the board" % (sport.upper(), len(games)))
        changed = 1 if write(os.path.join("handicapping", sport, "index.html"),
                             render_hub(sport, games, built_at)) else 0
        print("%s: %d file(s) written" % (sport.upper(), changed))
        return changed, [("/handicapping/%s/" % sport, "0.8")]
    if not games:
        # Out of season the board is empty. The hub page is still written so
        # /handicapping/<sport>/ answers with the true state ("no games on the
        # board") instead of a 404, and stays in the sitemap.
        print("%s: board is empty, writing the hub page only (out of season)" % sport.upper())
        hub_path = os.path.join("handicapping", sport, "index.html")
        changed = 1 if write(hub_path, render_hub(sport, [], built_at)) else 0
        return changed, [("/handicapping/%s/" % sport, "0.8")]
    print("%s: %d games on the board" % (sport.upper(), len(games)))

    extras = fetch_nfl_extras() if sport == "nfl" else ({}, {}, {})
    changed = 0
    cache = {}
    store = seo.load_store()
    used = set()
    for g in games:
        key = (g["away"], g["home"])
        if key not in cache:
            cache[key] = fetch_history(sport, g["away"], g["home"])
        hook = seo.hook_for(SPORTS[sport]["engine"], g["away"], g["home"],
                            (g["commence"] or "")[:10], cache[key],
                            None, None, store, used)
        seo.record_page(store, SPORTS[sport]["engine"], g["away"], g["home"],
                        (g["commence"] or "")[:10],
                        "/handicapping/%s/%s/" % (sport, game_slug(g)))
        if write("handicapping/%s/%s/index.html" % (sport, game_slug(g)),
                 render_game(sport, g, cache[key], games, extras, built_at, hook,
                             preview_context(sport, g, extras))):
            changed += 1
    seo.save_store(store)
    if write("handicapping/%s/index.html" % sport, render_hub(sport, games, built_at)):
        changed += 1
    print("%s: %d file(s) written" % (sport.upper(), changed))

    urls = [("/handicapping/%s/" % sport, "0.8")]
    urls += [(game_url(sport, g), "0.6") for g in games]
    return changed, urls


def main():
    built_at = datetime.datetime.now(datetime.timezone.utc).isoformat()
    wanted = [a.lower() for a in sys.argv[1:] if a.lower() in SPORTS] or list(SPORTS)
    # FAIL CLOSED ON A MISSING KEY, 2026-09-08, the day this became a cron.
    # Without BETLEGEND_PRO_SERVICE_KEY fetch_history() returns None for every
    # matchup, and every engine-backed page would be REWRITTEN with its head to
    # head record, ATS split and form gone. Unattended, that is silent data loss
    # dressed up as a successful build. A sport that needs the engine is skipped
    # entirely rather than rebuilt blind; yesterday's good pages stay live.
    # hub_only sports never call the engine, so they still run.
    if not SERVICE_KEY:
        blocked = [x for x in wanted if not SPORTS[x].get("hub_only")]
        if blocked:
            print("WARN  BETLEGEND_PRO_SERVICE_KEY unset; skipping %s "
                  "(their pages carry engine history and must not be rebuilt "
                  "without it)" % ", ".join(sorted(b.upper() for b in blocked)))
            wanted = [x for x in wanted if SPORTS[x].get("hub_only")]
        if not wanted:
            print("nothing to build")
            return
    total, advertised = 0, []
    for sport in wanted:
        try:
            changed, urls = build(sport, built_at)
            total += changed
            advertised += urls
        except BuildError as exc:
            # One sport failing must not take the others down with it.
            print("ERROR %s: %s" % (sport.upper(), exc))
    print("total files written: %d" % total)
    # Only rewrite the block on a full run. A partial run would otherwise
    # delete the other sports' entries.
    if sorted(wanted) == sorted(SPORTS):
        update_sitemap(advertised, built_at[:10])
    else:
        print("partial run (%s), sitemap block left alone" % ", ".join(wanted))


if __name__ == "__main__":
    main()
