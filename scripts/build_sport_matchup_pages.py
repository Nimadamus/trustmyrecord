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

SPORTS = {
    "nfl": {"label": "NFL", "board": "americanfootball_nfl", "engine": "NFL",
            "unit": "points", "simulator": "/nfl-simulator/"},
    "nba": {"label": "NBA", "board": "basketball_nba", "engine": "NBA",
            "unit": "points", "simulator": "/nba-simulator/"},
    "nhl": {"label": "NHL", "board": "icehockey_nhl", "engine": "NHL",
            "unit": "goals", "simulator": None},
}


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
                      "markets": best_markets(g), "priced": bool(g.get("has_sportsbook_odds"))})
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


def long_date(iso):
    for fmt in ("%A %B %-d, %Y", "%A %B %d, %Y"):
        try:
            return datetime.date.fromisoformat((iso or "")[:10]).strftime(fmt)
        except Exception:  # noqa: BLE001
            continue
    return ""


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
            bits.append("home %s" % c["last_20_home_record"])
        if c.get("last_20_away_record"):
            bits.append("away %s" % c["last_20_away_record"])
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
    return section("Head to head", rows, None,
                   (hist.get("qualifying_span") or {}).get("label"))


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
                            "%s over %s games" % (esc(s["units"]),
                                                  esc(s.get("eligible_games", 0)))))
    return section("Betting splits in this matchup", rows,
                   ((hist.get("matchup_summary") or {}).get("samples") or {}).get("note"))


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

def render_game(sport, g, hist, slate, extras, built_at, hook=None):
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
    url = SITE + game_url(sport, g)
    ld = {"@context": "https://schema.org", "@graph": [breadcrumb_ld([
        ("Handicapping", "/handicapping/"), (label, "/handicapping/%s/" % sport),
        ("%s at %s" % (g["away"], g["home"]), None)])]}

    others = [o for o in slate if game_url(sport, o) != game_url(sport, g)][:6]
    related = "".join('                <li><a href="%s">%s at %s</a></li>\n'
                      % (game_url(sport, o), esc(o["away"]), esc(o["home"])) for o in others)
    sim = SPORTS[sport]["simulator"]

    b = ['<body>\n', '    <main class="mm-wrap">\n',
         '        <header class="mm-head">\n',
         '            <span class="mm-kicker">%s</span>\n' % esc(label),
         '            <h1>%s at %s</h1>\n' % (esc(g["away"]), esc(g["home"])),
         '            <p class="mm-lede">Next meeting %s, %s. This page is permanent and '
         'carries whichever game these two play next.</p>\n'
         % (esc(long_date(g["commence"])), esc(kickoff(g["commence"]))),
         '        </header>\n',
         board_section(g),
         nfl_people_sections(sport, g, teams_by_name, qb1, injuries),
         division_section(sport, g, teams_by_name),
         form_section(hist),
         h2h_section(sport, hist),
         market_section(hist),
         coverage_section(hist),
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
         BLP_CROSS_LINK_TPL % esc(g["home"]),
         '    </main>\n', mlb.FOOT_SCRIPTS, '</body>\n</html>\n']
    return page_head(title, desc, url, ld) + "".join(b)


def render_hub(sport, games, built_at):
    label = SPORTS[sport]["label"]
    title = "%s Handicapping: Odds, Head to Head and Betting Trends" % label
    desc = ("Every %s game on the board with the current line, and a permanent research page for "
            "each matchup carrying the head to head record, against the spread and over/under "
            "splits and recent form." % label)
    url = SITE + "/handicapping/%s/" % sport
    ld = {"@context": "https://schema.org", "@graph": [
        breadcrumb_ld([("Handicapping", "/handicapping/"), (label, None)]),
        {"@type": "ItemList", "itemListElement": [
            {"@type": "ListItem", "position": i + 1,
             "name": "%s at %s" % (g["away"], g["home"]),
             "url": SITE + game_url(sport, g)} for i, g in enumerate(games)]}]}

    priced = sum(1 for g in games if g["priced"])
    sim = SPORTS[sport]["simulator"]
    b = ['<body>\n', '    <main class="mm-wrap">\n',
         '        <header class="mm-head">\n',
         '            <span class="mm-kicker">Handicapping</span>\n',
         '            <h1>%s Handicapping</h1>\n' % esc(label),
         '            <p class="mm-lede">Every %s game on the board with the line, and a permanent '
         'research page per matchup: head to head record, against the spread and over/under '
         'splits, recent form, and what the data does not cover.</p>\n' % esc(label),
         '        </header>\n',
         '        <section class="mm-sec">\n            <h2>On the board</h2>\n',
         '            <p class="mm-lede">%d game%s listed, %d priced by the sportsbook feed. '
         'Times are Eastern.</p>\n' % (len(games), "" if len(games) == 1 else "s", priced),
         '            <table class="mm-table">\n',
         '                <thead><tr><th>Matchup</th><th>Start</th><th>Moneyline</th>'
         '<th>Spread</th><th>Total</th></tr></thead>\n                <tbody>\n']
    for g in games:
        ml_txt, sp_txt, tot_txt = market_cells(g)
        b.append('                    <tr><td><a href="%s">%s at %s</a></td><td>%s</td>'
                 '<td>%s</td><td>%s</td><td>%s</td></tr>\n'
                 % (game_url(sport, g), esc(g["away"]), esc(g["home"]),
                    esc(kickoff(g["commence"])), ml_txt, sp_txt, tot_txt))
    b += ['                </tbody>\n            </table>\n        </section>\n',
          '        <section class="mm-sec">\n            <h2>Elsewhere on TrustMyRecord</h2>\n',
          '            <ul>\n',
          '                <li><a href="/handicapping/">The handicapping hub, every sport</a></li>\n',
          '                <li><a href="/handicapping/mlb/">MLB matchups, odds and probable pitchers</a></li>\n',
          ('                <li><a href="%s">%s simulator</a></li>\n' % (sim, esc(label))) if sim else "",
          '                <li><a href="/betlegend-pro/">BetLegend Pro, the research database '
          'behind these pages</a></li>\n',
          '            </ul>\n        </section>\n',
          '        <p class="mm-note">Lines come from the sportsbook feed and history from the '
          'graded game database. Nothing here is a projection: every number counts games already '
          'played. Built %s.</p>\n' % esc(built_at[:16].replace("T", " ") + " UTC"),
          '    </main>\n', mlb.FOOT_SCRIPTS, '</body>\n</html>\n']
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
    if not games:
        print("%s: board is empty, skipping (out of season)" % sport.upper())
        return 0, []
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
        if write("handicapping/%s/%s/index.html" % (sport, game_slug(g)),
                 render_game(sport, g, cache[key], games, extras, built_at, hook)):
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
    if not SERVICE_KEY:
        print("WARN  BETLEGEND_PRO_SERVICE_KEY unset; pages will bake without history")
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
