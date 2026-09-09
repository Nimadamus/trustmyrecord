"""NFL_DEEP_PREVIEW_20260909 — the deep-dive half of an NFL matchup page.

WHY THIS EXISTS
    scripts/build_sport_matchup_pages.py already mints one permanent page per
    NFL fixture off the board (the line, head to head, ATS and over/under
    splits, recent form). That is a research stub, not a preview: a reader
    deciding what to do with tomorrow night's game gets no team statistics, no
    personnel, no injuries, no model output and no read on the matchup.

    This module supplies all of that, for EVERY NFL game on the board, on every
    build. It is deliberately a shared generator rather than a hand written
    article: the next fixture gets the same page with no new code.

WHAT IT WILL NOT DO
    Every number on the page is read from a live feed in this build. Nothing is
    estimated, averaged into existence or carried over from a previous run. A
    feed that does not answer produces NO SECTION rather than a placeholder,
    which is why almost every function here returns "" on missing data.

FEEDS
    ESPN core/site API   team season statistics with league ranks, standings,
                         season leaders, results, injuries, venue
    TrustMyRecord API    /api/nfl/public/simulate/<ref>, the TMR NFL drive
                         model (10,000 runs), and /api/nfl/public/schedule for
                         the game ref
    BetLegend Pro        head to head, ATS and over/under splits (handled by
                         the caller and passed in)
"""

import base64
import concurrent.futures
import datetime
import json
import os
import urllib.error
import urllib.request

SITE_API = "https://site.api.espn.com/apis/site/v2/sports/football/nfl"
WEB_API = "https://site.web.api.espn.com/apis/v2/sports/football/nfl"
CORE_API = "https://sports.core.api.espn.com/v2/sports/football/leagues/nfl"
LOGO = "https://a.espncdn.com/i/teamlogos/nfl/500/%s.png"
TMR_API = os.environ.get("TMR_API", "https://trustmyrecord-api.onrender.com/api")

# A simulation is 10,000 drives; give it room, but never hang a build on it.
SIM_TIMEOUT = int(os.environ.get("NFL_PREVIEW_SIM_TIMEOUT", "150"))
HTTP_TIMEOUT = 30

_cache = {}


def _get(url, timeout=HTTP_TIMEOUT):
    if url in _cache:
        return _cache[url]
    # NO browser User-Agent. site.api.espn.com answers 403 to anything that
    # looks like Chrome and 200 to urllib's own default, which is the opposite
    # of the usual trap and cost a build to find.
    req = urllib.request.Request(url, headers={"Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            data = json.loads(r.read().decode("utf-8"))
    except (urllib.error.URLError, urllib.error.HTTPError, ValueError, OSError) as exc:
        print("  WARN  preview feed unavailable: %s (%s)" % (url.split("?")[0], exc))
        data = None
    _cache[url] = data
    return data


def _get_many(urls, workers=8):
    """Warm the cache for a list of URLs in parallel.

    ESPN hands out lists of $refs (an injury list is 60 links, a leaders board
    is 40), and resolving them one at a time is what makes a full slate take a
    quarter of an hour. The cron that bakes these pages has a 20 minute budget
    for every sport, so the fan-out is not a nicety. Bounded and fail-open:
    _get() already swallows its own errors and caches the result."""
    todo = [u for u in dict.fromkeys(urls) if u and u not in _cache]
    if not todo:
        return
    with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as pool:
        list(pool.map(_get, todo))


# ---------------------------------------------------------------- teams

def team_index():
    """abbreviation -> {id, abbr, name, logo}. One call, cached."""
    d = _get("%s/teams?limit=40" % SITE_API)
    out = {}
    if not d:
        return out
    for entry in (d.get("sports") or [{}])[0].get("leagues", [{}])[0].get("teams", []):
        t = entry.get("team") or {}
        if not t.get("abbreviation"):
            continue
        out[t["abbreviation"].upper()] = {
            "id": t.get("id"), "abbr": t["abbreviation"].upper(),
            "name": t.get("displayName"), "short": t.get("shortDisplayName"),
            "logo": LOGO % t["abbreviation"].lower(),
            "color": t.get("color"),
        }
    # The board and the standings do not always agree on a franchise's
    # abbreviation (LA / LAR), so index the full name too.
    for t in list(out.values()):
        if t.get("name"):
            out[t["name"].lower()] = t
    return out


def find_team(idx, name, abbr=None):
    if abbr and abbr.upper() in idx:
        return idx[abbr.upper()]
    return idx.get(str(name or "").lower())


# ---------------------------------------------------------------- season

def reference_season(kickoff_iso):
    """The most recent season these teams actually played.

    A Week 1 page is written before a single 2026 snap, so every team number on
    it belongs to 2025 and the page has to SAY so. Resolved from the feed, not
    assumed: the current season is used the moment its statistics carry games."""
    try:
        year = int((kickoff_iso or "")[:4])
    except ValueError:
        year = datetime.date.today().year
    for candidate in (year, year - 1):
        d = _get("%s/seasons/%d/types/2/teams/17/statistics?lang=en&region=us"
                 % (CORE_API, candidate))
        played = _stat(d, "general", "gamesPlayed")
        if played and float(played.get("value") or 0) > 0:
            return candidate, candidate == year
    return year - 1, False


# ---------------------------------------------------------------- stats

def _stat(stats_json, category, name):
    for cat in ((stats_json or {}).get("splits") or {}).get("categories") or []:
        if cat.get("name") != category:
            continue
        for s in cat.get("stats") or []:
            if s.get("name") == name:
                return s
    return None


def team_stats(team_id, season):
    return _get("%s/seasons/%d/types/2/teams/%s/statistics?lang=en&region=us"
                % (CORE_API, season, team_id))


def standings(season):
    """abbr -> {stat name: displayValue} for the whole league."""
    d = _get("%s/standings?season=%d&level=3" % (WEB_API, season))
    out = {}
    if not d:
        return out
    for conf in d.get("children") or []:
        for div in conf.get("children") or []:
            for e in ((div.get("standings") or {}).get("entries")) or []:
                abbr = ((e.get("team") or {}).get("abbreviation") or "").upper()
                if not abbr:
                    continue
                vals = {s.get("name"): s.get("displayValue") for s in e.get("stats") or []}
                vals["_division"] = div.get("name")
                vals["_conference"] = conf.get("abbreviation")
                out[abbr] = vals
    return out


def team_results(team_id, season, limit=6):
    """The team's last completed games, newest first."""
    d = _get("%s/teams/%s/schedule?season=%d" % (SITE_API, team_id, season))
    rows = []
    for e in (d or {}).get("events") or []:
        comp = (e.get("competitions") or [{}])[0]
        if not (comp.get("status") or {}).get("type", {}).get("completed"):
            continue
        us = them = None
        for c in comp.get("competitors") or []:
            side = {"abbr": ((c.get("team") or {}).get("abbreviation") or "").upper(),
                    "score": (c.get("score") or {}).get("displayValue"),
                    "winner": c.get("winner"), "home": c.get("homeAway") == "home"}
            if str((c.get("team") or {}).get("id")) == str(team_id):
                us = side
            else:
                them = side
        if not us or not them or us["score"] is None or them["score"] is None:
            continue
        rows.append({"date": (e.get("date") or "")[:10], "us": us, "them": them,
                     "week": (e.get("week") or {}).get("number")})
    rows.sort(key=lambda r: r["date"], reverse=True)
    return rows[:limit]


def team_leaders(team_id, season):
    """category -> [{name, line}] for the season, athlete names resolved."""
    d = _get("%s/seasons/%d/types/2/teams/%s/leaders?lang=en&region=us"
             % (CORE_API, season, team_id))
    out = {}
    _get_many([str((l.get("athlete") or {}).get("$ref") or "").replace("http://", "https://")
               for cat in (d or {}).get("categories") or []
               for l in (cat.get("leaders") or [])[:3]])
    for cat in (d or {}).get("categories") or []:
        rows = []
        for lead in (cat.get("leaders") or [])[:3]:
            ref = ((lead.get("athlete") or {}).get("$ref") or "").replace("http://", "https://")
            if not ref:
                continue
            ath = _get(ref)
            name = (ath or {}).get("displayName")
            if not name:
                continue
            rows.append({"name": name, "line": lead.get("displayValue"),
                         "pos": ((ath or {}).get("position") or {}).get("abbreviation") or ""})
        if rows:
            out[cat.get("name")] = rows
    return out


def team_injuries(team_id, cap=18):
    """Live injury rows. Each is a $ref, so this is bounded on purpose."""
    d = _get("%s/teams/%s/injuries?lang=en&region=us" % (CORE_API, team_id))
    items = (d or {}).get("items") or []
    _get_many([str(i.get("$ref") or "").replace("http://", "https://") for i in items])
    rows = []
    for item in items:
        ref = (item.get("$ref") or "").replace("http://", "https://")
        if not ref:
            continue
        rec = _get(ref)
        if not rec:
            continue
        ath = rec.get("athlete") or {}
        name = ath.get("displayName")
        if not name and ath.get("$ref"):
            name = (_get(ath["$ref"].replace("http://", "https://")) or {}).get("displayName")
        if not name:
            continue
        status = rec.get("status") or (rec.get("type") or {}).get("description") or ""
        # ESPN's injury feed carries every player it has ever flagged, including
        # the ones cleared and back to Active. A preview that listed those would
        # read as an injury list twice as long as the real one, so only players
        # whose availability is actually in question are shown.
        if str(status).strip().lower() in ("", "active"):
            continue
        rows.append({
            "name": name,
            "status": status,
            "detail": ((rec.get("details") or {}).get("type")
                       or (rec.get("details") or {}).get("detail") or ""),
            "date": (rec.get("date") or "")[:10],
        })
        if len(rows) >= cap:
            break
    return rows


def game_venue(kickoff_iso, away_abbr, home_abbr):
    """Venue and broadcast for this fixture, off the ESPN scoreboard."""
    # ESPN files a game under its EASTERN date; the board timestamps in UTC, so
    # a night kickoff is already the next UTC day and a single day query missed
    # every one of them (Patriots at Seahawks is 2026-09-10T00:20Z on the board
    # and sits on ESPN's 2026-09-09 scoreboard). Scan the day either side.
    try:
        day0 = datetime.date.fromisoformat((kickoff_iso or "")[:10])
    except ValueError:
        return {}
    lo = (day0 - datetime.timedelta(days=1)).strftime("%Y%m%d")
    hi = (day0 + datetime.timedelta(days=1)).strftime("%Y%m%d")
    d = _get("%s/scoreboard?dates=%s-%s&limit=100" % (SITE_API, lo, hi))
    for e in (d or {}).get("events") or []:
        comp = (e.get("competitions") or [{}])[0]
        abbrs = {((c.get("team") or {}).get("abbreviation") or "").upper()
                 for c in comp.get("competitors") or []}
        if away_abbr.upper() in abbrs and home_abbr.upper() in abbrs:
            venue = comp.get("venue") or {}
            addr = venue.get("address") or {}
            casts = [b.get("names", [""])[0] for b in comp.get("broadcasts") or [] if b.get("names")]
            return {
                "venue": venue.get("fullName"),
                "city": ", ".join([x for x in (addr.get("city"), addr.get("state")) if x]),
                "indoor": venue.get("indoor"),
                "neutral": comp.get("neutralSite"),
                "tv": ", ".join(casts),
                "week": (e.get("week") or {}).get("number"),
                "espn_id": e.get("id"),
            }
    return {}


# ---------------------------------------------------------------- simulation

def simulation(kickoff_iso, away, home):
    """TMR's own NFL drive model for this exact fixture, or None.

    The public simulator is keyed on a base64 ref of the board event id, which
    /api/nfl/public/schedule hands out. Looked up rather than constructed so a
    fixture the model does not carry returns nothing instead of a bad ref."""
    try:
        season = int((kickoff_iso or "")[:4])
    except ValueError:
        return None
    for week in range(1, 24):
        sched = _get("%s/nfl/public/schedule?season=%d&week=%d" % (TMR_API, season, week))
        games = (sched or {}).get("games") or []
        if not games:
            continue
        for g in games:
            if (g.get("home") == home and g.get("away") == away
                    and (g.get("kickoff_utc") or "")[:10] == (kickoff_iso or "")[:10]):
                ref = g.get("ref")
                if not ref:
                    return None
                return _get("%s/nfl/public/simulate/%s" % (TMR_API, ref), timeout=SIM_TIMEOUT)
        # The schedule is ordered by kickoff; once a week starts after this
        # game there is no point walking the rest of the season.
        last = (games[-1].get("kickoff_utc") or "")
        if last and last > (kickoff_iso or "") and week > 1:
            break
    return None


def decode_ref(ref):
    try:
        return base64.b64decode(ref + "==").decode("utf-8")
    except Exception:  # noqa: BLE001
        return ""


# ================================================================ rendering

def esc(s):
    return (str("" if s is None else s)
            .replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
            .replace('"', "&quot;"))


def _num(v):
    try:
        return float(str(v).replace(",", "").replace("%", ""))
    except (TypeError, ValueError):
        return None


def ord_rank(n):
    """1 -> 1st. Used only on ranks the feed actually supplies."""
    try:
        n = int(n)
    except (TypeError, ValueError):
        return ""
    suffix = "th" if 10 <= n % 100 <= 20 else {1: "st", 2: "nd", 3: "rd"}.get(n % 10, "th")
    return "%d%s" % (n, suffix)


def mmss(seconds):
    try:
        s = int(float(seconds))
    except (TypeError, ValueError):
        return None
    return "%d:%02d" % (s // 60, s % 60)


# Everything the comparison tables are allowed to show, with the direction that
# counts as better. Nothing outside this list is read: ESPN populates a rank of
# 1 on several stats it does not actually rank (gamesPlayed, snap share), and a
# page that printed those would be quietly lying about where a team stands.
OFFENSE_STATS = [
    ("scoring", "totalPointsPerGame", "Points per game", True, None),
    ("passing", "yardsPerGame", "Total yards per game", True, None),
    ("passing", "netPassingYardsPerGame", "Net passing yards per game", True, None),
    ("rushing", "rushingYardsPerGame", "Rushing yards per game", True, None),
    ("passing", "yardsPerPassAttempt", "Yards per pass attempt", True, None),
    ("passing", "quarterbackRating", "Team passer rating", True, None),
    ("passing", "completionPct", "Completion percentage", True, "%"),
    ("miscellaneous", "firstDownsPerGame", "First downs per game", True, None),
    ("passing", "sacks", "Sacks allowed", False, None),
]
SITUATIONAL_STATS = [
    ("miscellaneous", "thirdDownConvPct", "Third down conversions", True, "%"),
    ("miscellaneous", "fourthDownConvPct", "Fourth down conversions", True, "%"),
    ("miscellaneous", "redzoneTouchdownPct", "Red zone touchdown rate", True, "%"),
    ("miscellaneous", "redzoneScoringPct", "Red zone scoring rate", True, "%"),
    ("miscellaneous", "totalTakeaways", "Takeaways", True, None),
    ("miscellaneous", "totalGiveaways", "Giveaways", False, None),
    ("miscellaneous", "turnOverDifferential", "Turnover differential", True, None),
    ("miscellaneous", "totalPenaltyYards", "Penalty yards", False, None),
]
DEFENSE_STATS = [
    ("defensive", "sacks", "Sacks", True, None),
    ("defensiveInterceptions", "interceptions", "Interceptions", True, None),
    ("defensive", "tacklesForLoss", "Tackles for loss", True, None),
    ("defensive", "passesDefended", "Passes defended", True, None),
    ("defensive", "stuffs", "Run stuffs", True, None),
    ("defensive", "defensiveTouchdowns", "Defensive touchdowns", True, None),
]
PASSING_STATS = [
    ("passing", "passingYards", "Passing yards", True, None),
    ("passing", "passingTouchdowns", "Passing touchdowns", True, None),
    ("passing", "interceptions", "Interceptions thrown", False, None),
    ("passing", "yardsPerCompletion", "Yards per completion", True, None),
    ("passing", "passingFirstDowns", "Passing first downs", True, None),
    ("passing", "longPassing", "Longest completion", True, None),
]
RUSHING_STATS = [
    ("rushing", "rushingYards", "Rushing yards", True, None),
    ("rushing", "rushingAttempts", "Rushing attempts", True, None),
    ("rushing", "rushingTouchdowns", "Rushing touchdowns", True, None),
    ("rushing", "rushingFirstDowns", "Rushing first downs", True, None),
    ("rushing", "longRushing", "Longest run", True, None),
]
RECEIVING_STATS = [
    ("receiving", "receivingYards", "Receiving yards", True, None),
    ("receiving", "receptions", "Receptions", True, None),
    ("receiving", "receivingTouchdowns", "Receiving touchdowns", True, None),
    ("receiving", "receivingYardsPerGame", "Receiving yards per game", True, None),
    ("receiving", "yardsPerReception", "Yards per reception", True, None),
]


def compare_table(title, spec, away, home, stats_away, stats_home, note=None, lede=None):
    """Two teams, one metric per row, the better side marked.

    'Better' is only ever claimed when BOTH teams answered for that metric; a
    row with one side missing prints the side that exists and marks neither."""
    body = []
    for cat, name, label, higher, unit in spec:
        sa, sh = _stat(stats_away, cat, name), _stat(stats_home, cat, name)
        if not sa and not sh:
            continue
        va, vh = _num(sa and sa.get("displayValue")), _num(sh and sh.get("displayValue"))
        better = None
        if va is not None and vh is not None and va != vh:
            better = "away" if ((va > vh) == higher) else "home"

        def cell(s, v, side):
            if s is None or v is None:
                return '<td class="nflp-c">&mdash;</td>'
            txt = esc(s.get("displayValue"))
            if unit:
                txt += unit
            # A rank is only printed where a bigger number is better. ESPN
            # ranks sacks allowed, giveaways and penalty yards by raw volume,
            # so 1st there means MOST, which reads exactly backwards.
            rank = s.get("rank") if higher else None
            rk = ('<span class="nflp-rk">%s</span>' % esc(ord_rank(rank))) if rank else ""
            cls = "nflp-c" + (" nflp-win" if better == side else "")
            return '<td class="%s"><b>%s</b>%s</td>' % (cls, txt, rk)

        body.append("                <tr>%s<th scope=\"row\">%s</th>%s</tr>\n"
                    % (cell(sa, va, "away"), esc(label), cell(sh, vh, "home")))
    if not body:
        return ""
    out = ['        <section class="mm-sec">\n', '            <h2>%s</h2>\n' % esc(title)]
    if lede:
        out.append('            <p class="mm-lede">%s</p>\n' % esc(lede))
    out += ['            <table class="mm-table nflp-cmp">\n',
            '                <thead><tr><th>%s</th><th class="nflp-mid">Metric</th><th>%s</th></tr></thead>\n'
            % (esc(away), esc(home)),
            '                <tbody>\n']
    out += body
    out += ['                </tbody>\n            </table>\n']
    if note:
        out.append('            <p class="mm-note">%s</p>\n' % esc(note))
    out.append('        </section>\n')
    return "".join(out)


def kv_section(title, rows, note=None, lede=None):
    if not rows:
        return ""
    out = ['        <section class="mm-sec">\n', '            <h2>%s</h2>\n' % esc(title)]
    if lede:
        out.append('            <p class="mm-lede">%s</p>\n' % esc(lede))
    out.append('            <table class="mm-table"><tbody>\n')
    for label, value in rows:
        out.append('                <tr><th scope="row">%s</th><td>%s</td></tr>\n'
                   % (esc(label), value))
    out.append('            </tbody></table>\n')
    if note:
        out.append('            <p class="mm-note">%s</p>\n' % esc(note))
    out.append('        </section>\n')
    return "".join(out)


# ---------------------------------------------------------------- hero

def hero(ctx):
    """Crests, kickoff, venue and both records, above everything else."""
    a, h = ctx["away_team"], ctx["home_team"]
    if not a or not h:
        return ""
    meta = []
    when = ctx.get("kickoff_text")
    if when:
        meta.append(esc(when))
    v = ctx.get("venue") or {}
    if v.get("venue"):
        place = v["venue"] + ((" · " + v["city"]) if v.get("city") else "")
        meta.append(esc(place))
    if v.get("week"):
        meta.append("Week %s" % esc(v["week"]))
    if v.get("tv"):
        meta.append(esc(v["tv"]))
    st = ctx.get("standings") or {}
    ra = (st.get(a["abbr"]) or {}).get("overall")
    rh = (st.get(h["abbr"]) or {}).get("overall")
    season = ctx.get("season")

    def side(team, rec):
        return ('                <div class="nflp-side">'
                '<img src="%s" alt="%s" width="76" height="76" loading="eager">'
                '<b>%s</b>%s</div>\n'
                % (team["logo"], esc(team["name"]), esc(team["name"]),
                   ('<span>%s %s</span>' % (season, esc(rec))) if rec else ""))

    return ('        <section class="mm-sec nflp-hero">\n'
            '            <div class="nflp-crests">\n'
            + side(a, ra)
            + '                <span class="nflp-at">at</span>\n'
            + side(h, rh)
            + '            </div>\n'
            + ('            <p class="nflp-meta">%s</p>\n' % " &middot; ".join(meta) if meta else "")
            + '        </section>\n')


# ---------------------------------------------------------------- records

def records(ctx):
    a, h = ctx["away_team"], ctx["home_team"]
    st = ctx.get("standings") or {}
    sa, sh = st.get(a["abbr"]) or {}, st.get(h["abbr"]) or {}
    if not sa and not sh:
        return ""
    fields = [("overall", "Record"), ("pointsFor", "Points scored"),
              ("pointsAgainst", "Points allowed"), ("pointDifferential", "Point differential"),
              ("Home", "Home record"), ("Road", "Road record"),
              ("vs. Div.", "Division record"), ("vs. Conf.", "Conference record"),
              ("streak", "Streak ending the season")]
    rows = []
    for key, label in fields:
        va, vh = sa.get(key), sh.get(key)
        if va is None and vh is None:
            continue
        rows.append('                <tr><td class="nflp-c"><b>%s</b></td>'
                    '<th scope="row">%s</th><td class="nflp-c"><b>%s</b></td></tr>\n'
                    % (esc(va or "—"), esc(label), esc(vh or "—")))
    if not rows:
        return ""
    if ctx.get("season_is_current"):
        tail = "Numbers move as the season is played."
    else:
        tail = ("No %d game has been played by either team, so every team number on this page "
                "counts %d games and says so." % (ctx["season"] + 1, ctx["season"]))
    lede = "Final %d standings for both teams. %s" % (ctx["season"], tail)
    return ('        <section class="mm-sec">\n            <h2>Records and current form</h2>\n'
            '            <p class="mm-lede">%s</p>\n'
            '            <table class="mm-table nflp-cmp">\n'
            '                <thead><tr><th>%s</th><th class="nflp-mid">Season</th><th>%s</th></tr></thead>\n'
            '                <tbody>\n%s                </tbody>\n            </table>\n'
            '        </section>\n'
            % (esc(lede), esc(a["name"]), esc(h["name"]), "".join(rows)))


def home_road(ctx):
    """The split that actually applies to this game: road team, home team."""
    a, h = ctx["away_team"], ctx["home_team"]
    st = ctx.get("standings") or {}
    sa, sh = st.get(a["abbr"]) or {}, st.get(h["abbr"]) or {}
    rows = []
    if sa.get("Road"):
        rows.append(("%s on the road" % a["name"], "<b>%s</b>" % esc(sa["Road"])))
    if sh.get("Home"):
        rows.append(("%s at home" % h["name"], "<b>%s</b>" % esc(sh["Home"])))
    if sa.get("Home"):
        rows.append(("%s at home, for contrast" % a["name"], esc(sa["Home"])))
    if sh.get("Road"):
        rows.append(("%s on the road, for contrast" % h["name"], esc(sh["Road"])))
    return kv_section("Home and road splits", rows, lede=(
        "%s is the visitor here, so its road record is the one that applies." % a["name"]))


# ---------------------------------------------------------------- results

def recent_results(ctx):
    out = []
    for key, team in (("away", ctx["away_team"]), ("home", ctx["home_team"])):
        games = (ctx.get("results") or {}).get(key) or []
        if not games:
            continue
        items = []
        for r in games:
            res = "W" if r["us"].get("winner") else ("L" if r["them"].get("winner") else "T")
            items.append('<li class="nflp-r nflp-r--%s"><b>%s</b> %s %s&ndash;%s '
                         '<span>%s %s</span></li>'
                         % (res.lower(), res, "vs" if r["us"]["home"] else "at",
                            esc(r["us"]["score"]), esc(r["them"]["score"]),
                            esc(r["them"]["abbr"]), esc(r["date"])))
        out.append('            <h3>%s</h3>\n            <ul class="nflp-results">%s</ul>\n'
                   % (esc(team["name"]), "".join(items)))
    if not out:
        return ""
    return ('        <section class="mm-sec">\n            <h2>How each team finished</h2>\n'
            '            <p class="mm-lede">The last games each side actually played, newest '
            'first, straight off the results feed.</p>\n%s        </section>\n' % "".join(out))


# ---------------------------------------------------------------- people

LEADER_ROWS_OFF = [("passingYards", "Passing yards"), ("rushingYards", "Rushing yards"),
                   ("receivingYards", "Receiving yards"), ("receptions", "Receptions"),
                   ("passingTouchdowns", "Passing touchdowns"),
                   ("rushingTouchdowns", "Rushing touchdowns"),
                   ("receivingTouchdowns", "Receiving touchdowns")]
LEADER_ROWS_DEF = [("sacks", "Sacks"), ("totalTackles", "Tackles"),
                   ("interceptions", "Interceptions")]


def _leader_block(team, leaders, spec):
    rows = []
    for key, label in spec:
        entries = leaders.get(key) or []
        if not entries:
            continue
        top = entries[0]
        who = "%s%s" % (esc(top["name"]), (" (%s)" % esc(top["pos"])) if top.get("pos") else "")
        rows.append('                <tr><th scope="row">%s</th><td><b>%s</b> '
                    '<span class="nflp-line">%s</span></td></tr>\n'
                    % (esc(label), who, esc(top.get("line") or "")))
    if not rows:
        return ""
    return ('            <h3>%s</h3>\n            <table class="mm-table"><tbody>\n%s'
            '            </tbody></table>\n' % (esc(team["name"]), "".join(rows)))


def quarterbacks(ctx):
    """Who is expected to start, and what that quarterback did last season."""
    rows = []
    sim_roster = ((ctx.get("sim") or {}).get("roster")) or {}
    for key, team in (("away", ctx["away_team"]), ("home", ctx["home_team"])):
        name = None
        for starter in ((sim_roster.get(key) or {}).get("expected_starters") or []):
            if starter.get("role") == "QB":
                name = starter.get("name")
                break
        if not name:
            name = (ctx.get("qb_fallback") or {}).get(key)
        if not name:
            continue
        lead = ((ctx.get("leaders") or {}).get(key) or {}).get("passingLeader") or []
        line = ""
        for entry in lead:
            if entry["name"].lower() == name.lower():
                line = entry.get("line") or ""
                break
        rows.append((team["name"], "<b>%s</b>%s" % (
            esc(name), (' <span class="nflp-line">%s in %d</span>' % (esc(line), ctx["season"]))
            if line else "")))
    return kv_section(
        "Expected starting quarterbacks", rows,
        note=("Expected starters are the TrustMyRecord NFL model's own roster read: a projection "
              "of who takes the first snap, not an official inactive list."),
        lede="The single biggest input into everything below.")


def key_players(ctx):
    blocks = []
    for key, team in (("away", ctx["away_team"]), ("home", ctx["home_team"])):
        blocks.append(_leader_block(team, (ctx.get("leaders") or {}).get(key) or {}, LEADER_ROWS_OFF))
    blocks = [b for b in blocks if b]
    if not blocks:
        return ""
    return ('        <section class="mm-sec">\n            <h2>Key offensive players</h2>\n'
            '            <p class="mm-lede">Each team&rsquo;s %d leader in the categories that '
            'decide a football game, with the full season line.</p>\n%s        </section>\n'
            % (ctx["season"], "".join(blocks)))


def key_defenders(ctx):
    blocks = []
    for key, team in (("away", ctx["away_team"]), ("home", ctx["home_team"])):
        blocks.append(_leader_block(team, (ctx.get("leaders") or {}).get(key) or {}, LEADER_ROWS_DEF))
    blocks = [b for b in blocks if b]
    if not blocks:
        return ""
    return ('        <section class="mm-sec">\n            <h2>Key defensive players</h2>\n'
            '            <p class="mm-lede">Pressure, tackling and takeaways, by the player who '
            'led the team in each.</p>\n%s        </section>\n' % "".join(blocks))


def injuries(ctx):
    blocks = []
    for key, team in (("away", ctx["away_team"]), ("home", ctx["home_team"])):
        rows = (ctx.get("injuries") or {}).get(key) or []
        if not rows:
            continue
        items = []
        for r in rows:
            detail = " · ".join([x for x in (r.get("status"), r.get("detail")) if x])
            items.append('                <tr><th scope="row">%s</th><td>%s</td></tr>\n'
                         % (esc(r["name"]), esc(detail or "listed")))
        blocks.append('            <h3>%s</h3>\n            <table class="mm-table"><tbody>\n%s'
                      '            </tbody></table>\n' % (esc(team["name"]), "".join(items)))
    if not blocks:
        return ""
    return ('        <section class="mm-sec">\n            <h2>Injuries and availability</h2>\n'
            '            <p class="mm-lede">The live injury feed for both teams. A name here is a '
            'reported status, not a ruling: the official inactive list lands 90 minutes before '
            'kickoff.</p>\n%s        </section>\n' % "".join(blocks))


# ---------------------------------------------------------------- read

# Only stats where a bigger number is plainly better are read for rank, because
# ESPN ranks a "bad" counting stat (giveaways, penalty yards, sacks allowed) by
# raw volume, where 1st means most and reads backwards on a page like this.
RANKABLE = [(c, n, l, u) for (c, n, l, hi, u) in
            (OFFENSE_STATS + SITUATIONAL_STATS + DEFENSE_STATS) if hi]


def _ranked(stats):
    out = []
    for cat, name, label, unit in RANKABLE:
        s = _stat(stats, cat, name)
        if not s or not s.get("rank"):
            continue
        try:
            rank = int(s["rank"])
        except (TypeError, ValueError):
            continue
        if not 1 <= rank <= 32:
            continue
        out.append({"label": label, "rank": rank,
                    "value": "%s%s" % (s.get("displayValue"), unit or "")})
    return out


def strengths(ctx):
    """Where each side actually ranked, best and worst, nothing editorialised."""
    blocks = []
    for key, team in (("away", ctx["away_team"]), ("home", ctx["home_team"])):
        ranked = _ranked((ctx.get("stats") or {}).get(key))
        if not ranked:
            continue
        best = sorted(ranked, key=lambda r: r["rank"])[:5]
        worst = [r for r in sorted(ranked, key=lambda r: -r["rank"]) if r["rank"] >= 17][:5]
        if not best:
            continue

        def li(rows):
            return "".join('<li><b>%s</b> <span class="nflp-line">%s, %s in the NFL</span></li>'
                           % (esc(r["label"]), esc(r["value"]), esc(ord_rank(r["rank"])))
                           for r in rows)
        blocks.append('            <h3>%s</h3>\n'
                      '            <div class="nflp-sw">\n'
                      '                <div class="nflp-swcol nflp-swcol--up"><h4>Strengths</h4>'
                      '<ul>%s</ul></div>\n'
                      '                <div class="nflp-swcol nflp-swcol--down"><h4>Weaknesses</h4>'
                      '<ul>%s</ul></div>\n'
                      '            </div>\n'
                      % (esc(team["name"]), li(best),
                         li(worst) or '<li><span class="nflp-line">Nothing in this set ranked '
                                      'outside the top half.</span></li>'))
    if not blocks:
        return ""
    return ('        <section class="mm-sec">\n            <h2>Strengths and weaknesses</h2>\n'
            '            <p class="mm-lede">Every metric on this page that the league ranks, '
            'sorted by where each team finished in %d. Best five and worst five, chosen by rank '
            'and not by opinion.</p>\n%s        </section>\n' % (ctx["season"], "".join(blocks)))


# Each factor pits one side's strength against the other's, and both halves have
# to come back from the feed or the factor is dropped.
FACTOR_SPEC = [
    ("away", ("passing", "netPassingYardsPerGame"), "home", ("defensive", "sacks"),
     "%(away)s through the air against the %(home)s pass rush"),
    ("home", ("passing", "netPassingYardsPerGame"), "away", ("defensive", "sacks"),
     "%(home)s through the air against the %(away)s pass rush"),
    ("away", ("rushing", "rushingYardsPerGame"), "home", ("defensive", "stuffs"),
     "%(away)s on the ground against the %(home)s front"),
    ("home", ("rushing", "rushingYardsPerGame"), "away", ("defensive", "stuffs"),
     "%(home)s on the ground against the %(away)s front"),
    ("away", ("miscellaneous", "thirdDownConvPct"), "home", ("defensive", "tacklesForLoss"),
     "%(away)s on third down against a defence that lives in the backfield"),
    ("home", ("miscellaneous", "redzoneTouchdownPct"), "away", ("defensiveInterceptions", "interceptions"),
     "%(home)s in the red zone against a defence that takes the ball away"),
]


def matchup_factors(ctx):
    names = {"away": ctx["away_team"]["name"], "home": ctx["home_team"]["name"]}
    cards = []
    for side_a, stat_a, side_b, stat_b, headline in FACTOR_SPEC:
        sa = _stat((ctx.get("stats") or {}).get(side_a), *stat_a)
        sb = _stat((ctx.get("stats") or {}).get(side_b), *stat_b)
        if not sa or not sb or not sa.get("rank") or not sb.get("rank"):
            continue
        label_a = next((l for c, n, l, _u in RANKABLE if (c, n) == stat_a), stat_a[1])
        label_b = next((l for c, n, l, _u in RANKABLE if (c, n) == stat_b), stat_b[1])
        try:
            ra, rb = int(sa["rank"]), int(sb["rank"])
        except (TypeError, ValueError):
            continue
        gap = rb - ra
        if gap >= 8:
            read = "%s holds the clear edge in this one." % names[side_a]
        elif gap <= -8:
            read = "%s holds the clear edge in this one." % names[side_b]
        else:
            read = "Close to even on last season's ranks."
        cards.append('                <li class="nflp-fac"><h4>%s</h4>'
                     '<p><b>%s</b> %s, %s &middot; <b>%s</b> %s, %s</p>'
                     '<p class="nflp-line">%s</p></li>\n'
                     % (esc(headline % names),
                        esc(names[side_a]), esc(label_a.lower()) + " " + esc(sa.get("displayValue")),
                        esc(ord_rank(ra)),
                        esc(names[side_b]), esc(label_b.lower()) + " " + esc(sb.get("displayValue")),
                        esc(ord_rank(rb)), esc(read)))
    if not cards:
        return ""
    return ('        <section class="mm-sec">\n            <h2>Key matchup factors</h2>\n'
            '            <p class="mm-lede">One side&rsquo;s strength against the other&rsquo;s, '
            'with both %d league ranks attached. The read underneath each one is a rank gap, not '
            'a prediction.</p>\n            <ul class="nflp-facs">\n%s            </ul>\n'
            '        </section>\n' % (ctx["season"], "".join(cards)))


# ---------------------------------------------------------------- model

def _pct(x):
    try:
        return "%.1f%%" % (float(x) * 100)
    except (TypeError, ValueError):
        return None


def simulation_section(ctx):
    sim = ctx.get("sim")
    if not sim:
        return ""
    a, h = ctx["away_team"], ctx["home_team"]
    proj = sim.get("projection") or {}
    meta = sim.get("meta") or {}
    score = proj.get("score") or {}
    wp = proj.get("win_probability") or {}
    if not score or not wp:
        return ""
    runs = meta.get("simulations")
    rows = [
        ("Projected score", "<b>%s %s, %s %s</b>" % (
            esc(a["name"]), esc(score.get("away")), esc(h["name"]), esc(score.get("home")))),
        ("Win probability", "%s <b>%s</b> &middot; %s <b>%s</b>" % (
            esc(a["abbr"]), esc(_pct(wp.get("away")) or "—"),
            esc(h["abbr"]), esc(_pct(wp.get("home")) or "—"))),
    ]
    if proj.get("median_margin") is not None:
        rows.append(("Median margin", "%s by <b>%s</b>" % (
            esc(h["name"] if float(proj["median_margin"]) >= 0 else a["name"]),
            esc(abs(float(proj["median_margin"]))))))
    if proj.get("projected_total") is not None:
        rows.append(("Projected total", "<b>%s</b>" % esc(proj["projected_total"])))
    cr = proj.get("confidence_range") or {}
    if cr.get("margin_low") is not None:
        rows.append(("Middle of the margin range", "%s to %s, from the home side"
                     % (esc(cr.get("margin_low")), esc(cr.get("margin_high")))))
    shape = proj.get("margin_shape") or {}
    if shape.get("one_score") is not None:
        rows.append(("One score game", "<b>%s</b> of runs" % esc(_pct(shape["one_score"]))))
    if shape.get("blowout") is not None:
        rows.append(("Decided by more than two scores", esc(_pct(shape["blowout"]))))

    likely = ""
    if proj.get("likely_scores"):
        cells = "".join('<li><b>%s&ndash;%s</b><span>%s</span></li>'
                        % (esc(s.get("home")), esc(s.get("away")), esc(_pct(s.get("prob")) or ""))
                        for s in proj["likely_scores"][:6])
        likely = ('            <h3>Most common final scores</h3>\n'
                  '            <ul class="nflp-scores">%s</ul>\n'
                  '            <p class="mm-note">Home score first. No single scoreline is likely; '
                  'the point is how flat the distribution is.</p>\n' % cells)

    env = sim.get("environment") or {}
    env_rows = []
    if env.get("hfa_points") is not None:
        env_rows.append(("Home field", "%s points to %s" % (esc(env["hfa_points"]), esc(h["abbr"]))))
    if env.get("travel_points") is not None:
        env_rows.append(("Travel", "%s points for %s" % (esc(env["travel_points"]), esc(a["abbr"]))))
    tz = env.get("timezones") or {}
    if tz.get("crossed"):
        env_rows.append(("Time zones crossed", "%s by %s" % (esc(tz["crossed"]), esc(a["abbr"]))))
    weather = env.get("weather") or {}
    if weather.get("roof"):
        env_rows.append(("Roof", esc(weather["roof"])))
    env_block = ""
    if env_rows:
        env_block = ('            <h3>What the model adjusted for</h3>\n'
                     '            <table class="mm-table"><tbody>\n'
                     + "".join('                <tr><th scope="row">%s</th><td>%s</td></tr>\n'
                               % (esc(k), v) for k, v in env_rows)
                     + '            </tbody></table>\n')

    notes = ""
    grouped = sim.get("notes_grouped") or {}
    lines = (grouped.get("environment") or []) + (grouped.get("team_strength") or [])
    if lines:
        notes = ('            <ul class="nflp-notes">%s</ul>\n'
                 % "".join("<li>%s</li>" % esc(_fixmojibake(x)) for x in lines[:4]))

    head = ('        <section class="mm-sec">\n'
            '            <h2>TrustMyRecord model output</h2>\n'
            '            <p class="mm-lede">%s run through the TrustMyRecord NFL drive model%s. '
            'This is a probability estimate, not a guarantee and not betting advice.</p>\n'
            % (esc("%s at %s" % (a["name"], h["name"])),
               esc(", %s simulations" % "{:,}".format(int(runs))) if runs else ""))
    table = ('            <table class="mm-table"><tbody>\n'
             + "".join('                <tr><th scope="row">%s</th><td>%s</td></tr>\n'
                       % (esc(k), v) for k, v in rows)
             + '            </tbody></table>\n')
    foot = ""
    if meta.get("model") or meta.get("data_freshness"):
        foot = ('            <p class="mm-note">Model %s, data through %s%s.</p>\n'
                % (esc(meta.get("model") or "TrustMyRecord NFL"),
                   esc(meta.get("data_freshness") or "the latest feed"),
                   ", roster read is current" if meta.get("roster_stale") is False else ""))
    return head + table + likely + env_block + notes + foot + '        </section>\n'


def _fixmojibake(s):
    """The sim feed double-encodes its curly apostrophes; undo that, once."""
    try:
        return str(s).encode("latin-1").decode("utf-8")
    except (UnicodeEncodeError, UnicodeDecodeError):
        return str(s)


def sim_box_score(ctx):
    """One representative run, so the projection is something you can picture."""
    sim = ctx.get("sim") or {}
    rep = ((sim.get("box_score") or {}).get("representative")) or {}
    if not rep:
        return ""
    a, h = ctx["away_team"], ctx["home_team"]
    blocks = []
    for key, team in (("away", a), ("home", h)):
        side = rep.get(key) or {}
        summ = side.get("summary") or {}
        if not summ:
            continue
        want = [("total_yards", "Total yards"), ("net_pass_yards", "Net passing"),
                ("rush_yards", "Rushing"), ("yards_per_play", "Yards per play"),
                ("first_downs", "First downs"), ("third", "Third down"),
                ("red_zone", "Red zone"), ("turnovers", "Turnovers"), ("top", "Time of possession")]
        rows = "".join('                <tr><th scope="row">%s</th><td>%s</td></tr>\n'
                       % (esc(label), esc(summ[k])) for k, label in want if summ.get(k) is not None)
        people = []
        for group, label in (("passing", "Passing"), ("rushing", "Rushing"), ("receiving", "Receiving")):
            top = (side.get(group) or [])[:2]
            for p in top:
                if group == "passing":
                    line = "%s/%s, %s yds, %s TD, %s INT" % (p.get("comp"), p.get("att"),
                                                             p.get("yards"), p.get("td"), p.get("int"))
                elif group == "rushing":
                    line = "%s car, %s yds, %s TD" % (p.get("carries"), p.get("yards"), p.get("td"))
                else:
                    line = "%s rec, %s yds, %s TD" % (p.get("rec") or p.get("receptions"),
                                                      p.get("yards"), p.get("td"))
                if p.get("name"):
                    people.append('<li><b>%s</b> <span class="nflp-line">%s &middot; %s</span></li>'
                                  % (esc(p["name"]), esc(label.lower()), esc(line)))
        blocks.append('            <h3>%s</h3>\n            <table class="mm-table"><tbody>\n%s'
                      '            </tbody></table>\n'
                      % (esc(team["name"]), rows)
                      + ('            <ul class="nflp-people">%s</ul>\n' % "".join(people)
                         if people else ""))
    if not blocks:
        return ""
    return ('        <section class="mm-sec">\n            <h2>One simulated game, in full</h2>\n'
            '            <p class="mm-lede">A single representative run out of the set above, '
            'final score %s %s to %s %s. It is an illustration of the shape the model expects, '
            'not a prediction of these exact numbers.</p>\n%s        </section>\n'
            % (esc(a["abbr"]), esc(rep.get("away_score")), esc(h["abbr"]), esc(rep.get("home_score")),
               "".join(blocks)))


# ---------------------------------------------------------------- the read

def analysis(ctx):
    """TMR's read, assembled from numbers already on the page.

    Every sentence here is generated from a value fetched in this build. There
    is no hand written opinion in it, which is the only way a generated page can
    carry a read on every fixture without inventing one."""
    a, h = ctx["away_team"], ctx["home_team"]
    sim = ctx.get("sim") or {}
    proj = sim.get("projection") or {}
    wp = proj.get("win_probability") or {}
    lines = []

    if wp.get("home") is not None:
        fav, dog = (h, a) if float(wp["home"]) >= 0.5 else (a, h)
        favp = max(float(wp["home"]), float(wp.get("away") or 0))
        lines.append("The model makes %s the side, at %s to win outright." % (fav["name"], _pct(favp)))
        lines.append("That leaves %s live in roughly %s of simulated games, which is a long way "
                     "from a formality." % (dog["name"], _pct(1 - favp)))

    board = ctx.get("board_spread")
    if board and proj.get("mean_margin") is not None:
        model_margin = float(proj["mean_margin"])
        book_home_line = board.get("home_point")
        if book_home_line is not None:
            book_margin = -float(book_home_line)
            diff = model_margin - book_margin
            side = h["name"] if diff > 0 else a["name"]
            lines.append("The board has %s %s and the model's average margin is %.1f points to the "
                         "home side, a gap of %.1f points in favour of %s."
                         % (h["name"], ("%+g" % float(book_home_line)), model_margin,
                            abs(diff), side))

    shape = proj.get("margin_shape") or {}
    if shape.get("one_score") is not None:
        lines.append("%s of runs finish inside one score, so a late touchdown decides this game "
                     "more often than not." % _pct(shape["one_score"]))

    st = ctx.get("standings") or {}
    sa, sh = st.get(a["abbr"]) or {}, st.get(h["abbr"]) or {}
    if sa.get("Road") and sh.get("Home"):
        lines.append("%s went %s away from home in %d; %s went %s at home."
                     % (a["name"], sa["Road"], ctx["season"], h["name"], sh["Home"]))

    for key, team in (("away", a), ("home", h)):
        ranked = _ranked((ctx.get("stats") or {}).get(key))
        top = sorted(ranked, key=lambda r: r["rank"])[:1]
        if top:
            lines.append("The best league rank %s carried in this set was %s at %s (%s)."
                         % (team["name"], top[0]["label"].lower(), ord_rank(top[0]["rank"]),
                            top[0]["value"]))

    if not lines:
        return ""
    return ('        <section class="mm-sec nflp-read">\n            <h2>The TrustMyRecord read</h2>\n'
            '            <ul class="nflp-read-list">%s</ul>\n'
            '            <p class="mm-note">Assembled from the numbers above and nothing else. '
            'No part of this is a recommendation to bet.</p>\n        </section>\n'
            % "".join("<li>%s</li>" % esc(x) for x in lines))


def what_to_watch(ctx):
    a, h = ctx["away_team"], ctx["home_team"]
    sim = ctx.get("sim") or {}
    proj = sim.get("projection") or {}
    bullets = []

    roster = sim.get("roster") or {}
    qbs = []
    for key, team in (("away", a), ("home", h)):
        for s in ((roster.get(key) or {}).get("expected_starters") or []):
            if s.get("role") == "QB" and s.get("name"):
                qbs.append("%s for %s" % (s["name"], team["abbr"]))
    if len(qbs) == 2:
        bullets.append(("The quarterbacks", "%s and %s. Everything else on this page moves if "
                                            "either one does not take the first snap." % tuple(qbs)))

    for key, team, other in (("away", a, h), ("home", h, a)):
        ranked = _ranked((ctx.get("stats") or {}).get(key))
        worst = [r for r in sorted(ranked, key=lambda r: -r["rank"]) if r["rank"] >= 20][:1]
        if worst:
            bullets.append(("Where %s can be got at" % team["name"],
                            "%s: %s, %s in the league last season."
                            % (worst[0]["label"], worst[0]["value"], ord_rank(worst[0]["rank"]))))

    shape = proj.get("margin_shape") or {}
    if shape.get("exactly_3") is not None:
        bullets.append(("The key numbers",
                        "%s of simulated games land on exactly 3 points and %s on exactly 7, which "
                        "is where a half point on the spread is worth paying for."
                        % (_pct(shape["exactly_3"]), _pct(shape.get("exactly_7")))))

    inj = ctx.get("injuries") or {}
    counted = sum(len(inj.get(k) or []) for k in ("away", "home"))
    if counted:
        bullets.append(("The inactive list",
                        "%d players carry a status on the live injury feed across the two teams. "
                        "The official list lands 90 minutes before kickoff and is the one that "
                        "counts." % counted))

    if proj.get("projected_total") is not None and ctx.get("board_total") is not None:
        bullets.append(("Model against the market",
                        "The model projects %s combined points; the board is at %s."
                        % (proj["projected_total"], ctx["board_total"])))

    if not bullets:
        return ""
    return ('        <section class="mm-sec nflp-watch">\n            <h2>What to watch</h2>\n'
            '            <dl>%s</dl>\n        </section>\n'
            % "".join("<dt>%s</dt><dd>%s</dd>" % (esc(k), esc(v)) for k, v in bullets))


# ---------------------------------------------------------------- assembly

STYLE = """        <style>
        .nflp-hero{text-align:center}
        .nflp-crests{display:flex;align-items:center;justify-content:center;gap:clamp(14px,5vw,46px);flex-wrap:wrap}
        .nflp-side{display:flex;flex-direction:column;align-items:center;gap:6px;min-width:120px}
        .nflp-side img{width:76px;height:76px;object-fit:contain}
        .nflp-side b{font:900 1.05rem/1.15 "Barlow Condensed",Inter,sans-serif;text-transform:uppercase;letter-spacing:.02em}
        .nflp-side span{font-size:.82rem;opacity:.72}
        .nflp-at{font:800 .78rem/1 "Barlow Condensed",Inter,sans-serif;letter-spacing:.2em;text-transform:uppercase;opacity:.6}
        .nflp-meta{margin:14px 0 0;font-size:.9rem;opacity:.8}
        .nflp-cmp td.nflp-c{text-align:center;width:30%}
        .nflp-cmp th.nflp-mid{text-align:center}
        .nflp-cmp .nflp-rk{display:block;font-size:.72rem;opacity:.6;font-weight:600}
        .nflp-cmp td.nflp-win b{color:#42d392}
        .nflp-line{opacity:.72;font-weight:500;font-size:.86rem}
        .nflp-results{list-style:none;margin:0 0 10px;padding:0;display:flex;flex-wrap:wrap;gap:8px}
        .nflp-results li{padding:7px 11px;border-radius:9px;background:rgba(255,255,255,.05);font-size:.87rem}
        .nflp-r b{display:inline-block;min-width:1.1em;font-weight:900}
        .nflp-r--w b{color:#42d392}.nflp-r--l b{color:#ff6b6b}
        .nflp-r span{opacity:.6;font-size:.8rem}
        .nflp-sw{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px;margin-bottom:18px}
        .nflp-swcol{padding:14px 16px;border-radius:12px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.07)}
        .nflp-swcol h4{margin:0 0 8px;font:800 .72rem/1 "Barlow Condensed",Inter,sans-serif;letter-spacing:.16em;text-transform:uppercase}
        .nflp-swcol--up h4{color:#42d392}.nflp-swcol--down h4{color:#ffb44c}
        .nflp-swcol ul{margin:0;padding-left:18px}.nflp-swcol li{margin:5px 0}
        .nflp-facs{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:14px}
        .nflp-fac{padding:15px 17px;border-radius:12px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.07)}
        .nflp-fac h4{margin:0 0 8px;font:800 .95rem/1.25 Inter,sans-serif}
        .nflp-fac p{margin:0 0 5px;font-size:.88rem}
        .nflp-scores{list-style:none;margin:0 0 6px;padding:0;display:flex;flex-wrap:wrap;gap:9px}
        .nflp-scores li{padding:9px 13px;border-radius:10px;background:rgba(255,255,255,.05);text-align:center}
        .nflp-scores b{display:block;font:900 1.02rem/1.2 "Barlow Condensed",Inter,sans-serif}
        .nflp-scores span{font-size:.76rem;opacity:.65}
        .nflp-notes{margin:12px 0 0;padding-left:18px;font-size:.88rem;opacity:.85}
        .nflp-people{list-style:none;margin:8px 0 16px;padding:0;display:flex;flex-wrap:wrap;gap:8px}
        .nflp-people li{padding:7px 11px;border-radius:9px;background:rgba(255,255,255,.05);font-size:.85rem}
        .nflp-read-list{margin:0;padding-left:18px}.nflp-read-list li{margin:8px 0;line-height:1.55}
        .nflp-watch dl{margin:0}
        .nflp-watch dt{margin-top:14px;font:800 .74rem/1 "Barlow Condensed",Inter,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:#FFC93C}
        .nflp-watch dd{margin:6px 0 0;line-height:1.6}
        @media (max-width:640px){
            .nflp-side img{width:58px;height:58px}
            .nflp-cmp td.nflp-c{width:32%;font-size:.9rem}
            .nflp-results li{font-size:.8rem;padding:6px 9px}
        }
        </style>
"""


def build_context(game, kickoff_text=None, qb_fallback=None):
    """Fetch everything one NFL matchup page needs. Never raises."""
    idx = team_index()
    away = find_team(idx, game.get("away"))
    home = find_team(idx, game.get("home"))
    if not away or not home:
        print("  WARN  preview skipped, team not in the ESPN index: %s at %s"
              % (game.get("away"), game.get("home")))
        return None

    kickoff = game.get("commence") or ""
    season, is_current = reference_season(kickoff)
    ctx = {
        "away_team": away, "home_team": home, "season": season,
        "season_is_current": is_current, "kickoff_text": kickoff_text,
        "qb_fallback": qb_fallback or {},
        "venue": game_venue(kickoff, away["abbr"], home["abbr"]),
        "standings": standings(season),
        "stats": {"away": team_stats(away["id"], season),
                  "home": team_stats(home["id"], season)},
        "results": {"away": team_results(away["id"], season),
                    "home": team_results(home["id"], season)},
        "leaders": {"away": team_leaders(away["id"], season),
                    "home": team_leaders(home["id"], season)},
        "injuries": {"away": team_injuries(away["id"]),
                     "home": team_injuries(home["id"])},
        "sim": simulation(kickoff, game.get("away"), game.get("home")),
    }
    markets = game.get("markets") or {}
    spread = markets.get("spread") or {}
    if spread.get(game.get("home")):
        point, _price = spread[game["home"]]
        ctx["board_spread"] = {"home_point": point}
    total = markets.get("total") or {}
    if total.get("point") is not None:
        ctx["board_total"] = total["point"]
    return ctx


# The order a reader actually needs: who and where, then the market, then the
# teams, then the people, then the model, then the read.
SECTIONS = [records, home_road, recent_results,
            quarterbacks, key_players, key_defenders, injuries]
COMPARISONS = [
    ("Offensive comparison", OFFENSE_STATS,
     "Both offences across the %d season, with each number's league rank underneath it."),
    ("Defensive comparison", DEFENSE_STATS,
     "What each defence actually produced in %d. Yards and points allowed are not carried "
     "per team by this feed, so the scoring column above is the one that answers that."),
    ("Situational statistics", SITUATIONAL_STATS,
     "Third down, the red zone, turnovers and discipline in %d."),
    ("Passing", PASSING_STATS, "Passing production across %d."),
    ("Rushing", RUSHING_STATS, "Rushing production across %d."),
    ("Receiving", RECEIVING_STATS, "Receiving production across %d."),
]


def render_hero(ctx):
    """Crests and kickoff, which belong above the line and nothing else."""
    if not ctx:
        return ""
    block = hero(ctx)
    return (STYLE + block) if block else ""


def render_teams(ctx):
    """Everything between the line and the head to head record."""
    if not ctx:
        return ""
    a, h = ctx["away_team"]["name"], ctx["home_team"]["name"]
    out = [fn(ctx) for fn in SECTIONS]
    for title, spec, lede in COMPARISONS:
        out.append(compare_table(title, spec, a, h,
                                 (ctx.get("stats") or {}).get("away"),
                                 (ctx.get("stats") or {}).get("home"),
                                 lede=lede % ctx["season"]))
    out.append(strengths(ctx))
    out.append(matchup_factors(ctx))
    return "".join(x for x in out if x)


def render_model(ctx):
    """The model, the read and the handicapping summary, last."""
    if not ctx:
        return ""
    out = [simulation_section(ctx), sim_box_score(ctx), analysis(ctx), what_to_watch(ctx)]
    return "".join(x for x in out if x)


def render(ctx):
    """The whole preview in one string. Kept for callers that want it flat."""
    return render_hero(ctx) + render_teams(ctx) + render_model(ctx)


def sources_note(ctx):
    """Say where every number came from. Non negotiable on a page like this."""
    if not ctx:
        return ""
    bits = ["team statistics, standings, season leaders, results and injuries from the ESPN "
            "public feeds for the %d season" % ctx["season"],
            "the line from the TrustMyRecord sportsbook board"]
    if ctx.get("sim"):
        meta = ctx["sim"].get("meta") or {}
        runs = meta.get("simulations")
        bits.append("the projection from the TrustMyRecord NFL drive model%s"
                    % (", %s simulations" % "{:,}".format(int(runs)) if runs else ""))
    return ('        <p class="mm-note">Sources: %s. Every number on this page was read live when '
            'it was built; anything a feed did not answer is absent rather than estimated.</p>\n'
            % esc("; ".join(bits)))
