"""NCAAF_HANDICAPPING_HUB_20260909 - assembly for /handicapping/ncaaf/.

Picks the featured matchups off the slate, warms every feed they need in
parallel, builds one context per game and hands the pieces to the renderer.

The featured set is chosen the way a college football reader would choose it:
a game with two ranked teams first, then one with a ranked team, then a
conference game between two power league teams, with the closest number
breaking every tie. Nothing here is editorial, so the page reorders itself
every week without anyone touching it.
"""

import concurrent.futures

import ncaaf_hub as H
import ncaaf_hub_render as R


def _score(g):
    """Rank one game for the featured set.

    A ranked team is not on its own a reason to feature a game: on any given
    Saturday the top of the poll is mostly playing a two touchdown underdog,
    and four cards of a #1 seed beating up a Group of Five visitor is the
    opposite of a handicapping page. So the number matters as much as the
    ranking, and a game nobody has to think about sinks whatever the logos say.
    """
    a, h = g["away"], g["home"]
    ra, rh = a.get("ap") or 99, h.get("ap") or 99
    sp = abs(g.get("spread") or 40.0)
    both_power = a.get("tier") == "power" and h.get("tier") == "power"
    if ra <= 25 and rh <= 25:
        return (0, ra + rh, sp)
    if min(ra, rh) <= 25 and sp <= 17:
        return (1, min(ra, rh), sp)
    if both_power and sp <= 14:
        return (2, sp, min(ra, rh))
    if min(ra, rh) <= 25:
        return (3, min(ra, rh), sp)
    if both_power:
        return (4, sp, 0)
    if g.get("conf_game") and sp <= 10:
        return (5, sp, 0)
    return (6, sp, 0)


def pick_featured(games, want=H.FEATURED):
    """The best `want` games on the slate, kept in kickoff order.

    Both teams have to be FBS. An FBS team hosting an FCS opponent is on the
    board and stays on the board, but it cannot be a featured card: the
    visitor has no team statistics, no national rank and no priced game log
    behind it, so half of every panel would be blank."""
    fbs = [g for g in games if g["away"].get("conf") and g["home"].get("conf")]
    ranked = sorted(fbs or games, key=_score)[:want]
    return sorted(ranked, key=lambda g: g["date"])


def _warm(games, season):
    """One parallel pass over every per-team feed the cards need.

    Serially this is four hundred round trips and a quarter of an hour. The
    cron that bakes these pages has a budget, so the fan-out is not a nicety."""
    urls = []
    for g in games:
        for t in (g["away"], g["home"]):
            tid = t["id"]
            for s in (season, season - 1):
                urls.append("%s/seasons/%d/types/2/teams/%s/statistics?lang=en&region=us"
                            % (H.CORE_API, s, tid))
                urls.append("%s/teams/%s/schedule?season=%d" % (H.SITE_API, tid, s))
            urls.append("%s/seasons/%d/types/2/teams/%s/leaders?lang=en&region=us"
                        % (H.CORE_API, season, tid))
            urls.append("%s/seasons/%d/teams/%s/coaches?lang=en&region=us"
                        % (H.CORE_API, season, tid))
    H._get_many(urls, workers=12)


def context(g, season, pts_cur, pts_prev):
    a, h = g["away"], g["home"]
    sa, ja = H.stat_season(a["id"], season)
    sh, jh = H.stat_season(h["id"], season)
    pts = pts_cur if min(sa, sh) == season else pts_prev
    log_a = H.game_log(a["id"], season)
    log_b = H.game_log(h["id"], season)
    ctx = {
        "g": g,
        "season_a": sa, "season_h": sh,
        "log_a": log_a, "log_h": log_b,
        "stats_a": ja, "stats_h": jh,
        "pts": pts,
        "der_a": R.derived(ja, (pts or {}).get(a["id"])),
        "der_h": R.derived(jh, (pts or {}).get(h["id"])),
        "ats_a": H.betting_splits(log_a),
        "ats_h": H.betting_splits(log_b),
        "form_a": log_a[:H.FORM_GAMES],
        "form_h": log_b[:H.FORM_GAMES],
        "h2h": H.head_to_head(h["id"], a["id"], season),
        "lead_a": H.leaders(a["id"], sa),
        "lead_h": H.leaders(h["id"], sh),
        "coach_a": H.coach(a["id"], season),
        "coach_h": H.coach(h["id"], season),
    }
    return ctx


# ---------------------------------------------------------------- board join

def _norm(s):
    return "".join(ch for ch in str(s or "").lower() if ch.isalnum())


def merge_board(slate, board_games):
    """Overlay the TrustMyRecord sportsbook feed onto the slate.

    Two feeds price these games and each is better at something. ESPN carries
    every fixture, days out, but usually only a spread and a total. The TMR
    board carries the moneyline and names the book, and is the site's own
    price, but it is a today-only feed. So the board wins wherever it has a
    number and ESPN fills the rest of the week in behind it. The join is on
    normalised team names, because the two feeds share no id.

    Returns the set of slate ids the board actually priced."""
    priced = set()
    if not board_games:
        return priced
    idx = {}
    for bg in board_games:
        idx[(_norm(bg.get("home")), _norm(bg.get("away")))] = bg
    for g in slate:
        hit = None
        for hn in {_norm(g["home"]["name"]), _norm(g["home"]["short"]), _norm(g["home"]["loc"])}:
            for an in {_norm(g["away"]["name"]), _norm(g["away"]["short"]), _norm(g["away"]["loc"])}:
                hit = hit or idx.get((hn, an))
        if not hit:
            continue
        m = hit.get("markets") or {}
        ml, sp, tot = m.get("h2h") or {}, m.get("spread") or {}, m.get("total") or {}
        if ml.get(hit["home"]) is not None and ml.get(hit["away"]) is not None:
            g["home_ml"], g["away_ml"] = ml[hit["home"]], ml[hit["away"]]
        if sp.get(hit["home"]):
            point = sp[hit["home"]][0]
            if point is not None:
                g["spread"] = float(point)
        if tot.get("point") is not None:
            g["total"] = float(tot["point"])
        if m.get("book"):
            g["book"] = m["book"]
        priced.add(g["id"])
    return priced


# ---------------------------------------------------------------- hero

def hero(slate, featured, season):
    ranked_games = sum(1 for g in slate
                       if (g["away"].get("ap") or 99) <= 25 and (g["home"].get("ap") or 99) <= 25)
    ranked_teams = len({t["id"] for g in slate for t in (g["away"], g["home"])
                        if (t.get("ap") or 99) <= 25})
    priced = sum(1 for g in slate if g.get("spread") is not None)
    days = sorted({H.day_label(g["date"]) for g in slate if g.get("date")})
    def plural(n, one, many):
        return one if n == 1 else many

    tiles = [(len(slate), plural(len(slate), "game on the slate", "games on the slate")),
             (ranked_teams, plural(ranked_teams, "ranked team playing", "ranked teams playing")),
             (ranked_games, plural(ranked_games, "ranked matchup", "ranked matchups")),
             (priced, plural(priced, "game with a line", "games with a line"))]
    tiles = [(v, lab) for v, lab in tiles if v]
    return (
        '        <header class="cf-hero">\n'
        '            <span class="cf-kicker">College football research</span>\n'
        '            <h1>NCAAF Handicapping</h1>\n'
        '            <p>The %d season slate, built for handicapping rather than for '
        'scrolling. Featured matchups carry the full statistical comparison with national '
        'ranks, against the spread and over/under splits, the last five results settled at '
        'the closing number, head to head history and the season leaders. The full board is '
        'below, filterable by conference and sortable by what the market is saying.</p>\n'
        '            <div class="cf-stats">%s</div>\n'
        '        </header>\n'
        % (season,
           "".join('<span class="cf-stat-tile"><b>%s</b><i>%s</i></span>' % (v, R.esc(lab))
                   for v, lab in tiles)))


# ---------------------------------------------------------------- page

def build_body(board_games, built_at, esc, foot_scripts, body_tag, shell_style,
               featured_callout=None):
    """The whole <body> of /handicapping/ncaaf/, and the slate it was built from."""
    season = H.current_season()
    slate = H.slate()
    if not slate:
        return None, []

    # Overlay the site's own prices before anything is chosen or rendered: the
    # featured set is partly picked on the number, and the cards quote it.
    priced = merge_board(slate, board_games)

    featured = pick_featured(slate)
    _warm(featured, season)
    pts_cur = H.standings_points(season)
    pts_prev = H.standings_points(season - 1)

    cards = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        ctxs = list(pool.map(lambda g: context(g, season, pts_cur, pts_prev), featured))
    for i, ctx in enumerate(ctxs):
        card = R.featured_card(ctx, i)
        if card:
            cards.append(card)

    featured_ids = {g["id"] for g in featured}

    parts = [body_tag, shell_style, R.CSS, '    <main class="mm-wrap">\n',
             hero(slate, featured, season)]

    # The featured Matchup of the Day, when the lane has one. This is the
    # site's single featured-game system, called rather than reimplemented: it
    # returns "" on a day with no article, and a day with no article is a
    # normal state, not a gap. Nothing below depends on it.
    if featured_callout:
        parts.append(featured_callout("ncaaf") or "")

    if cards:
        parts.append('        <section class="mm-sec">\n'
                     '            <h2>Featured matchups</h2>\n'
                     '            <p class="cf-lede">The biggest games on the slate, each one '
                     'opened up: comparison, trends, form, history and personnel.</p>\n'
                     '            <div class="cf-cards">%s</div>\n'
                     '        </section>\n' % "".join(cards))

    parts.append(R.poll_rail(H.poll_top25()))
    parts.append(R.board_section(slate, featured_ids, priced))

    parts.append(
        '        <section class="mm-sec">\n'
        '            <h2>Elsewhere on TrustMyRecord</h2>\n'
        '            <ul>\n'
        '                <li><a href="/handicapping/">The handicapping hub, every sport</a></li>\n'
        '                <li><a href="/handicapping/nfl/">NFL matchups, previews and trends</a></li>\n'
        '                <li><a href="/handicapping/mlb/">MLB matchups, odds and probable pitchers</a></li>\n'
        '                <li><a href="/sportsbook/">The full sportsbook board, every market</a></li>\n'
        '                <li><a href="/betlegend-pro/">BetLegend Pro, the research database</a></li>\n'
        '            </ul>\n        </section>\n')

    parts.append(
        '        <p class="mm-note">Team statistics, records, rankings, leaders, coaches, '
        'venues and forecasts come from ESPN and are read fresh on every build. Spreads, '
        'totals and moneylines come from the sportsbook feed, named on each game. Every '
        'cover and over/under is settled against that game\'s own closing number. Nothing '
        'here is projected or estimated. Built %s.</p>\n'
        % esc(built_at[:16].replace("T", " ") + " UTC"))

    parts += ['    </main>\n', foot_scripts, R.JS, '</body>\n</html>\n']
    return "".join(parts), slate
