"""Daily handicapping hub and per-game research pages for NFL, NBA and NHL.

WHY THIS EXISTS SEPARATELY FROM build_mlb_matchup_pages.py
The MLB builder is bound to baseball: the MLB Stats API for schedule and
probable pitchers, Baseball Savant for expected stats, and TMR's own
/handicapping/mlb/matchup research route, which exists for no other sport
(/handicapping/nfl/matchup answers 404). Bending it into a four-sport builder
would have meant every sport carrying MLB's shape, and probable pitchers do not
exist in basketball.

So this builder takes its data from the two sources that DO cover all four
sports:

  the board    /api/games/board/<sport_key>   schedule, teams, prices
  the engine   betlegend-pro-api /api/matchup/historical
               14,371 NFL / 24,434 NBA / 28,458 NHL graded games

WHAT IT WILL NOT DO
A sport whose board is empty is out of season, and it is skipped entirely
rather than shipped as a hub with nothing under it. Measured 2026-09-02: NFL
16 games, NBA 0, NHL 0. Thin pages are worse than no pages, and these turn
themselves on when the season does.

Nothing here is projected, modelled or predicted. Every number is a count of
games that have already been played, which is the same standard the MLB pages
and BetLegend Pro hold to.
"""

import datetime
import importlib.util
import io
import json
import os
import sys
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)

# The page shell, escaping and formatting helpers live in the MLB builder and
# are shared rather than copied, so both sets of pages cannot drift apart.
_spec = importlib.util.spec_from_file_location(
    "mlb_builder", os.path.join(HERE, "build_mlb_matchup_pages.py"))
mlb = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(mlb)

SITE = mlb.SITE
API = os.environ.get("TMR_API", "https://trustmyrecord-api.onrender.com/api")
ENGINE = os.environ.get("BETLEGEND_PRO_API_BASE", "https://betlegend-pro-api.onrender.com")
SERVICE_KEY = os.environ.get("BETLEGEND_PRO_SERVICE_KEY", "")

esc = mlb.esc
slugify = mlb.slugify
odds_str = mlb.odds_str
line_str = mlb.line_str
page_head = mlb.page_head
breadcrumb_ld = mlb.breadcrumb_ld

SPORTS = {
    "nfl": {"label": "NFL", "board": "americanfootball_nfl", "engine": "NFL",
            "long": "NFL", "unit": "points"},
    "nba": {"label": "NBA", "board": "basketball_nba", "engine": "NBA",
            "long": "NBA", "unit": "points"},
    "nhl": {"label": "NHL", "board": "icehockey_nhl", "engine": "NHL",
            "long": "NHL", "unit": "goals"},
}


class BuildError(Exception):
    pass


def get_json(url, attempts=3, method="GET", body=None, headers=None):
    last = None
    for i in range(attempts):
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
    key = SPORTS[sport]["board"]
    d = get_json("%s/games/board/%s?limit=80" % (API, key))
    games = []
    for g in d.get("games") or []:
        if g.get("has_placeholder_teams"):
            continue
        home, away = g.get("home_team"), g.get("away_team")
        if not home or not away:
            continue
        games.append({
            "home": home, "away": away,
            "commence": g.get("commence_time"),
            "markets": best_markets(g),
            "priced": bool(g.get("has_sportsbook_odds")),
        })
    games.sort(key=lambda x: (x["commence"] or "", x["away"]))
    return games


def best_markets(g):
    """First bookmaker that carries each market, named so the page can say so.

    Deliberately not an average across books: an averaged line is a number no
    one can actually bet, and the MLB pages already state the single book they
    read."""
    out = {"book": None, "h2h": {}, "spread": {}, "total": {}}
    for b in g.get("bookmakers") or []:
        for m in b.get("markets") or []:
            key, outcomes = m.get("key"), m.get("outcomes") or []
            if key == "h2h" and not out["h2h"]:
                out["h2h"] = {o.get("name"): o.get("price") for o in outcomes}
                out["book"] = out["book"] or b.get("title")
            elif key == "spreads" and not out["spread"]:
                out["spread"] = {o.get("name"): (o.get("point"), o.get("price")) for o in outcomes}
                out["book"] = out["book"] or b.get("title")
            elif key == "totals" and not out["total"]:
                for o in outcomes:
                    if (o.get("name") or "").lower() == "over":
                        out["total"] = {"point": o.get("point"), "price": o.get("price")}
                out["book"] = out["book"] or b.get("title")
    return out


def fetch_history(sport, away, home):
    """Head to head from the BetLegend Pro engine. None when it cannot answer,
    which the page then states rather than papering over."""
    if not SERVICE_KEY:
        return None
    try:
        return get_json(
            "%s/api/matchup/historical" % ENGINE.rstrip("/"),
            attempts=2, method="POST",
            body={"sport": SPORTS[sport]["engine"], "team_1": away, "team_2": home},
            headers={"X-TMR-Service-Key": SERVICE_KEY, "X-TMR-User-Id": "0"},
        )
    except BuildError as exc:
        print("  WARN  history unavailable for %s at %s (%s)" % (away, home, exc))
        return None


# ---------------------------------------------------------------- helpers

def game_slug(g):
    """One permanent URL per matchup, with no date in it.

    Same rule as the MLB builder: the pair of teams is what has a lasting
    identity, not the individual fixture, so brewers-vs-cubs is reused the next
    time they play instead of minting a new URL and stranding the old one.
    """
    return "%s-vs-%s" % (slugify(g["away"]), slugify(g["home"]))


def game_url(sport, g):
    return "/handicapping/%s/%s/" % (sport, game_slug(g))


def kickoff(iso):
    try:
        return mlb.et_time(iso)
    except Exception:  # noqa: BLE001 - formatting only, never fatal
        return "TBD"


def long_date(iso):
    try:
        return datetime.date.fromisoformat((iso or "")[:10]).strftime("%A %B %-d, %Y")
    except Exception:  # noqa: BLE001
        try:
            return datetime.date.fromisoformat((iso or "")[:10]).strftime("%A %B %d, %Y")
        except Exception:  # noqa: BLE001
            return ""


def market_cells(g):
    m = g["markets"]
    ml = m["h2h"]
    sp = m["spread"]
    tot = m["total"]
    ml_txt = ("%s %s / %s %s" % (esc(g["away"]), odds_str(ml.get(g["away"])),
                                 esc(g["home"]), odds_str(ml.get(g["home"])))
              if ml else "not priced")
    if sp.get(g["home"]):
        point, price = sp[g["home"]]
        sp_txt = "%s %s (%s)" % (esc(g["home"]), line_str(point), odds_str(price))
    else:
        sp_txt = "not priced"
    # line_str signs its output, which is right for a spread and wrong for a
    # total: a 44.5 total is not "+44.5". Totals are printed as the number the
    # book shows, prefixed o/u the way a book writes it.
    tot_txt = ("o%g (%s)" % (float(tot["point"]), odds_str(tot.get("price")))
               if tot.get("point") is not None else "not priced")
    return ml_txt, sp_txt, tot_txt


# ---------------------------------------------------------------- rendering

BLP_CROSS_LINK = (
    '    <!--MK:blpCrossLink-->\n'
    '    <p class="mm-note">This page is the read on one game. '
    '<a href="/betlegend-pro/">BetLegend Pro</a> is the read on every game like it: '
    'search 130,000+ graded games across MLB, NBA, NFL and NHL for the same matchup '
    'and situation, and get the record with the sample size behind it. '
    'Free to try, 25 lookups a day.</p>\n'
    '    <!--/MK:blpCrossLink-->\n'
)


def history_section(sport, g, hist):
    unit = SPORTS[sport]["unit"]
    if not hist or hist.get("zero_result"):
        return ('        <section class="mm-sec">\n'
                '            <h2>Head to head history</h2>\n'
                '            <p class="mm-note">The database holds no completed meeting between '
                'these two teams, so there is no record to show. It is left blank rather than '
                'filled with an estimate.</p>\n'
                '        </section>\n')

    ms = hist.get("matchup_summary") or {}
    span = hist.get("qualifying_span") or {}
    t1, t2 = ms.get("team_1") or {}, ms.get("team_2") or {}
    scoring = ms.get("scoring") or {}
    rows = []

    if t1.get("team") and t2.get("team"):
        rows.append(("Record in these meetings",
                     "%s %s-%s, %s %s-%s"
                     % (esc(t1["team"]), t1.get("wins", 0), t1.get("losses", 0),
                        esc(t2["team"]), t2.get("wins", 0), t2.get("losses", 0))))
    if ms.get("home_side_label"):
        rows.append(("Home side", esc(ms["home_side_label"])))
    if scoring.get("avg_combined") is not None:
        rows.append(("Average combined %s" % unit, esc(scoring["avg_combined"])))
    if scoring.get("avg_margin") is not None:
        rows.append(("Average margin", esc(scoring["avg_margin"])))

    body = ['        <section class="mm-sec">\n',
            '            <h2>Head to head history</h2>\n']
    if span.get("label"):
        body.append('            <p class="mm-lede">%s</p>\n' % esc(span["label"]))
    if rows:
        body.append('            <table class="mm-table"><tbody>\n')
        for label, value in rows:
            body.append('                <tr><th scope="row">%s</th><td>%s</td></tr>\n'
                        % (esc(label), value))
        body.append('            </tbody></table>\n')

    # Say what the dataset cannot answer, in its own words, rather than
    # letting a reader assume the blank means zero.
    for item in (ms.get("unavailable_readings") or [])[:2]:
        body.append('            <p class="mm-note"><b>%s.</b> %s</p>\n'
                    % (esc(item.get("reading", "Not available")), esc(item.get("reason", ""))))

    fresh = hist.get("data_freshness") or {}
    if fresh.get("label"):
        body.append('            <p class="mm-note">%s</p>\n' % esc(fresh["label"]))
    body.append('        </section>\n')
    return "".join(body)


def render_game(sport, g, hist, built_at):
    label = SPORTS[sport]["label"]
    title = "%s at %s: %s odds and head to head history" % (g["away"], g["home"], label)
    desc = ("%s at %s. The sportsbook line, and every previously completed meeting between "
            "these two teams from TrustMyRecord's graded game database."
            % (g["away"], g["home"]))
    url = SITE + game_url(sport, g)
    ml_txt, sp_txt, tot_txt = market_cells(g)
    book = g["markets"]["book"]

    ld = {"@context": "https://schema.org", "@graph": [breadcrumb_ld([
        ("Handicapping", "/handicapping/"),
        (label, "/handicapping/%s/" % sport),
        ("%s at %s" % (g["away"], g["home"]), None),
    ])]}

    b = ['<body>\n', '    <main class="mm-wrap">\n',
         '        <header class="mm-head">\n',
         '            <span class="mm-kicker">%s</span>\n' % esc(label),
         '            <h1>%s at %s</h1>\n' % (esc(g["away"]), esc(g["home"])),
         '            <p class="mm-lede">%s, %s ET.</p>\n'
         % (esc(long_date(g["commence"])), esc(kickoff(g["commence"]))),
         '        </header>\n',
         '        <section class="mm-sec">\n',
         '            <h2>The board</h2>\n',
         '            <table class="mm-table"><tbody>\n',
         '                <tr><th scope="row">Moneyline</th><td>%s</td></tr>\n' % ml_txt,
         '                <tr><th scope="row">Spread</th><td>%s</td></tr>\n' % sp_txt,
         '                <tr><th scope="row">Total</th><td>%s</td></tr>\n' % tot_txt,
         '            </tbody></table>\n',
         ('            <p class="mm-note">Prices read from %s and they move. '
          'Check the book before you act on any number here.</p>\n' % esc(book))
         if book else
         '            <p class="mm-note">The sportsbook feed is not carrying this game yet.</p>\n',
         '        </section>\n',
         history_section(sport, g, hist),
         '        <p class="mm-note">Built %s. '
         '<a href="/handicapping/%s/">Back to the %s slate</a>.</p>\n'
         % (esc(built_at[:16].replace("T", " ") + " UTC"), sport, esc(label)),
         BLP_CROSS_LINK,
         '    </main>\n', mlb.FOOT_SCRIPTS, '</body>\n</html>\n']
    return page_head(title, desc, url, ld) + "".join(b)


def render_hub(sport, games, built_at):
    label = SPORTS[sport]["label"]
    title = "%s Handicapping Hub | Odds and Head to Head History" % label
    desc = ("Every %s game on the board with the sportsbook line and a research page carrying "
            "the complete head to head history from TrustMyRecord's graded game database."
            % label)
    url = SITE + "/handicapping/%s/" % sport
    ld = {"@context": "https://schema.org", "@graph": [
        breadcrumb_ld([("Handicapping", "/handicapping/"), (label, None)]),
        {"@type": "ItemList", "itemListElement": [
            {"@type": "ListItem", "position": i + 1,
             "name": "%s at %s" % (g["away"], g["home"]),
             "url": SITE + game_url(sport, g)}
            for i, g in enumerate(games)]},
    ]}

    priced = sum(1 for g in games if g["priced"])
    b = ['<body>\n', '    <main class="mm-wrap">\n',
         '        <header class="mm-head">\n',
         '            <span class="mm-kicker">Handicapping Hub</span>\n',
         '            <h1>%s Handicapping Hub</h1>\n' % esc(label),
         '            <p class="mm-lede">Every %s game on the board, with the line and a '
         'research page for each one carrying the full head to head record.</p>\n' % esc(label),
         '        </header>\n',
         '        <section class="mm-sec">\n',
         '            <h2>On the board</h2>\n',
         '            <p class="mm-lede">%d game%s listed, %d priced by the sportsbook feed. '
         'Times are Eastern.</p>\n' % (len(games), "" if len(games) == 1 else "s", priced),
         '            <table class="mm-table">\n',
         '                <thead><tr><th>Matchup</th><th>Start</th><th>Moneyline</th>'
         '<th>Spread</th><th>Total</th></tr></thead>\n',
         '                <tbody>\n']
    for g in games:
        ml_txt, sp_txt, tot_txt = market_cells(g)
        b.append('                    <tr><td><a href="%s">%s at %s</a></td>'
                 '<td>%s</td><td>%s</td><td>%s</td><td>%s</td></tr>\n'
                 % (game_url(sport, g), esc(g["away"]), esc(g["home"]),
                    esc(kickoff(g["commence"])), ml_txt, sp_txt, tot_txt))
    b += ['                </tbody>\n            </table>\n        </section>\n',
          '        <p class="mm-note">Lines come from the sportsbook feed and history from '
          'TrustMyRecord\'s graded game database. Nothing on these pages is a projection: '
          'every number counts games that have already been played. Built %s.</p>\n'
          % esc(built_at[:16].replace("T", " ") + " UTC"),
          BLP_CROSS_LINK,
          '    </main>\n', mlb.FOOT_SCRIPTS, '</body>\n</html>\n']
    return page_head(title, desc, url, ld) + "".join(b)


# ---------------------------------------------------------------- main

MARK_BEGIN = "  <!-- BEGIN_SPORT_MATCHUP_URLS -->"
MARK_END = "  <!-- END_SPORT_MATCHUP_URLS -->"


def update_sitemap(urls, today):
    """Rewrite this builder's block in sitemap.xml.

    Its own markers, separate from the MLB block, so the two builders cannot
    clobber each other. The block is rebuilt from scratch every run rather than
    merged, which is what makes a sport going out of season drop out instead of
    leaving URLs advertised for pages that are no longer maintained.
    """
    path = os.path.join(REPO, "sitemap.xml")
    raw = io.open(path, encoding="utf-8", newline="").read()
    eol = "\r\n" if "\r\n" in raw else "\n"
    sm = raw.replace("\r\n", "\n")

    rows = ["%s" % MARK_BEGIN]
    for url, prio in urls:
        rows.append('  <url><loc>%s%s</loc><lastmod>%s</lastmod>'
                    '<changefreq>daily</changefreq><priority>%s</priority></url>'
                    % (SITE, url, today, prio))
    rows.append(MARK_END)
    block = "\n".join(rows)

    if MARK_BEGIN in sm and MARK_END in sm:
        start = sm.index(MARK_BEGIN)
        end = sm.index(MARK_END) + len(MARK_END)
        sm = sm[:start] + block + sm[end:]
    else:
        sm = sm.replace("</urlset>", block + "\n</urlset>")

    out = sm.replace("\n", eol)
    if out != raw:
        io.open(path, "w", encoding="utf-8", newline="").write(out)
        print("sitemap: %d matchup url(s) advertised" % len(urls))
        return True
    return False


def write(path, html):
    full = os.path.join(REPO, path)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    existing = None
    if os.path.exists(full):
        with open(full, encoding="utf-8") as fh:
            existing = fh.read()
    if existing == html:
        return False
    with open(full, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(html)
    return True


def build(sport, built_at):
    games = fetch_board(sport)
    if not games:
        # Out of season. Shipping a hub with an empty table would be a thin
        # page competing against the sport's real pages, so nothing is written.
        print("%s: board is empty, skipping (out of season)" % sport.upper())
        return 0, []
    print("%s: %d games on the board" % (sport.upper(), len(games)))

    changed = 0
    cache = {}
    for g in games:
        key = (g["away"], g["home"])
        if key not in cache:
            cache[key] = fetch_history(sport, g["away"], g["home"])
        if write("handicapping/%s/%s/index.html" % (sport, game_slug(g)),
                 render_game(sport, g, cache[key], built_at)):
            changed += 1
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
        print("WARN  BETLEGEND_PRO_SERVICE_KEY is unset; pages will bake without history")
    total = 0
    advertised = []
    for sport in wanted:
        try:
            changed, urls = build(sport, built_at)
            total += changed
            advertised += urls
        except BuildError as exc:
            # One sport failing must not take the others down with it.
            print("ERROR %s: %s" % (sport.upper(), exc))
    print("total files written: %d" % total)
    # Only rewrite the block when every sport was asked for. A partial run
    # (build_sport_matchup_pages.py nfl) would otherwise delete the other
    # sports' entries.
    if sorted(wanted) == sorted(SPORTS):
        update_sitemap(advertised, built_at[:10])
    else:
        print("partial run (%s), sitemap block left alone" % ", ".join(wanted))


if __name__ == "__main__":
    main()
