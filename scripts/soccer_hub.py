"""The Soccer handicapping room: research page, not an odds dump.

WHY THIS FILE EXISTS
/handicapping/soccer/ used to be one 105 row table with a competition column,
which is a database dump wearing a page's clothes. Nima's instruction on
2026-09-09 was to make it a real research destination: crests, competition
badges, matchup cards, form, attacking and defensive numbers, betting trends,
head to head, competition filters and sort views, with the full board kept but
pushed under all of it.

WHERE EVERY NUMBER COMES FROM
  the board   TMR /api/games/board/soccer
              fixtures, kickoff, competition, and DraftKings prices: moneyline
              (two way, the feed carries no draw price), spread, total, team
              totals, first half and second half markets
  ESPN        site.api.espn.com  club crests, competition crests, club index
              site.web.api.espn.com/apis/v2 league table: played, W D L, goals
                 for, goals against, points, position
              sports.core.api.espn.com team season statistics: goals, goals
                 conceded, shots, shots on target, possession %, corners won,
                 clean sheets, pass %, cards, and ESPN's expected goal
                 averages (avgExpectedGoalsConceded, avgExpectedGoalDifferential)
              team schedule, this season and last: real final scores, which is
                 what every form, streak, over/under, both teams to score,
                 clean sheet and head to head number on the page is counted
                 from. Nothing is modelled and nothing is estimated.

WHAT IS OMITTED (NO_INTERNAL_DISCLAIMERS_20260909)
Fourteen of the 72 Champions League and Europa League clubs play in leagues
ESPN does not carry (Slovak, Czech, Croatian, Hungarian, Polish, Bulgarian,
Ukrainian, Armenian, Azerbaijani). They get their crest, their fixture and
their price, and every stat block simply does not render for them rather than
being filled with a guess. Same rule for first half team splits and for closing
line history: the feeds do not carry them, so the page does not claim them.
"""

import concurrent.futures
import datetime
import json
import re
import unicodedata
import urllib.error
import urllib.request

SITE_API = "https://site.api.espn.com/apis/site/v2/sports/soccer"
WEB_API = "https://site.web.api.espn.com/apis/v2/sports/soccer"
CORE_API = "https://sports.core.api.espn.com/v2/sports/soccer/leagues"
HTTP_TIMEOUT = 30

# Board competition name -> ESPN league slug. The board names eight
# competitions; anything it adds later falls through with crests off rather
# than breaking the build.
COMP_LEAGUE = {
    "Champions League": "uefa.champions",
    "Europa League": "uefa.europa",
    "EPL": "eng.1",
    "Premier League": "eng.1",
    "La Liga": "esp.1",
    "Serie A": "ita.1",
    "Bundesliga": "ger.1",
    "Ligue 1": "fra.1",
    "MLS": "usa.1",
}

# Leagues whose team lists build the club index. The first six are where the
# statistics live; the rest exist so a Champions League or Europa League club
# can be found at all, and so its domestic numbers are the ones shown.
STAT_LEAGUES = ["eng.1", "esp.1", "ita.1", "ger.1", "fra.1", "usa.1",
                "ned.1", "por.1", "tur.1", "sco.1", "aut.1", "nor.1",
                "gre.1", "bel.1", "cyp.1", "isr.1"]
CUP_LEAGUES = ["uefa.champions", "uefa.europa"]

# Ordering weight for the Featured view. A Champions League night outranks a
# midweek MLS fixture; this is the only place that opinion is expressed.
COMP_WEIGHT = {
    "uefa.champions": 100, "eng.1": 92, "esp.1": 88, "ita.1": 84,
    "ger.1": 82, "uefa.europa": 76, "fra.1": 74, "usa.1": 66,
}

# Club-type tokens that carry no identity, dropped before matching a board name
# to an ESPN club. "City" and "United" are NOT here: they are the name.
NOISE = {"fc", "cf", "sc", "ssc", "afc", "ac", "as", "ss", "cd", "ud", "rcd",
         "rc", "sv", "tsv", "sk", "fk", "bk", "if", "cp", "sd", "ca", "nk",
         "club", "de", "the", "calcio"}


class SoccerData(object):
    """Everything the page needs, fetched once and reused."""

    def __init__(self):
        self.cache = {}
        self.leagues = {}      # slug -> {id,name,logo,season}
        self.clubs = {}        # slug -> [team dicts]
        self.by_key = {}       # (slug, normalised name) -> team dict
        self.home_league = {}  # espn team id -> slug whose stats to use
        self.stats = {}        # espn team id -> season stat dict
        self.table = {}        # espn team id -> league table row
        self.matches = {}      # espn team id -> [completed match dicts]
        self.unmatched = []

    # -------------------------------------------------------------- http
    def get(self, url, timeout=HTTP_TIMEOUT):
        if url in self.cache:
            return self.cache[url]
        # NO browser User-Agent. site.api.espn.com answers 403 to anything
        # that looks like Chrome and 200 to urllib's own default.
        req = urllib.request.Request(url, headers={"Accept": "application/json"})
        data = None
        for _ in range(2):
            try:
                with urllib.request.urlopen(req, timeout=timeout) as r:
                    data = json.loads(r.read().decode("utf-8"))
                break
            except (urllib.error.URLError, urllib.error.HTTPError,
                    ValueError, OSError):
                data = None
        self.cache[url] = data
        return data

    def warm(self, urls, workers=10):
        todo = [u for u in dict.fromkeys(urls) if u and u not in self.cache]
        if not todo:
            return
        with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as pool:
            list(pool.map(self.get, todo))


# ------------------------------------------------------------------ naming

# The board and ESPN disagree on a handful of clubs by more than spelling, and
# no amount of fuzzy matching turns "Los Angeles FC" into "LAFC". Keyed on the
# board's normalised name, valued with ESPN's.
ALIAS = {
    "koeln": "cologne",
    "koln": "cologne",
    "los angeles": "lafc",
    "hapoel beer sheva": "hapoel be er",
    "new york red bulls": "red bull new york",
}


def norm(text):
    if not text:
        return ""
    s = unicodedata.normalize("NFKD", text)
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = re.sub(r"[^a-z0-9 ]+", " ", s.replace("&", " and ").lower())
    out = " ".join(t for t in s.split() if t and t not in NOISE)
    out = ALIAS.get(out, out)
    # German transliteration LAST, so the alias table stays readable: the board
    # writes Moenchengladbach and Bodoe where ESPN writes the umlaut, which
    # NFKD has already folded to a bare vowel.
    return out.replace("oe", "o").replace("ue", "u").replace("ae", "a")


def _stem(tok):
    return tok[:-1] if len(tok) > 3 and tok.endswith("s") else tok


def _akin(a, b):
    a, b = _stem(a), _stem(b)
    if a == b:
        return True
    return len(a) >= 4 and len(b) >= 4 and (a.startswith(b) or b.startswith(a))


def name_score(a, b):
    """0..100 similarity between two already normalised club names."""
    if not a or not b:
        return 0
    if a == b:
        return 100
    if a.replace(" ", "") == b.replace(" ", ""):
        return 96
    ta, tb = a.split(), b.split()
    if not ta or not tb:
        return 0
    sa, sb = set(ta), set(tb)
    if sa <= sb or sb <= sa:
        return 88
    hits = sum(1 for x in sa if any(_akin(x, y) for y in sb))
    if not hits:
        return 0
    union = len(sa) + len(sb) - hits
    return int(74.0 * hits / union) if union else 0


# -------------------------------------------------------------- collection

def load_index(d):
    """Club index, competition crests and the current season year."""
    slugs = STAT_LEAGUES + CUP_LEAGUES
    d.warm(["%s/%s/teams" % (SITE_API, s) for s in slugs])
    d.warm(["%s/%s/scoreboard" % (SITE_API, s) for s in set(COMP_LEAGUE.values())])

    for slug in slugs:
        payload = d.get("%s/%s/teams" % (SITE_API, slug))
        try:
            league = payload["sports"][0]["leagues"][0]
        except (TypeError, KeyError, IndexError):
            continue
        season = ((league.get("season") or {}).get("year")
                  or datetime.datetime.utcnow().year)
        d.leagues.setdefault(slug, {})
        d.leagues[slug].update({"id": league.get("id"), "name": league.get("name"),
                                "season": int(season), "slug": slug})
        teams = []
        for entry in league.get("teams") or []:
            t = entry.get("team") or {}
            if not t.get("id"):
                continue
            logo = t.get("logo") or ((t.get("logos") or [{}])[0]).get("href")
            rec = {"id": str(t["id"]), "name": t.get("displayName") or "",
                   "short": t.get("shortDisplayName") or "",
                   "abbr": t.get("abbreviation") or "", "logo": logo,
                   "league": slug}
            teams.append(rec)
            # A club found in a domestic league keeps that league as its home;
            # the cup lists run last and never overwrite it.
            if slug in STAT_LEAGUES:
                d.home_league.setdefault(rec["id"], slug)
        d.clubs[slug] = teams

    for slug in set(COMP_LEAGUE.values()):
        sb = d.get("%s/%s/scoreboard" % (SITE_API, slug))
        try:
            league = sb["leagues"][0]
        except (TypeError, KeyError, IndexError):
            continue
        logos = league.get("logos") or []
        dark = next((x.get("href") for x in logos
                     if isinstance(x, dict) and "dark" in (x.get("rel") or [])), None)
        plain = next((x.get("href") for x in logos if isinstance(x, dict)), None)
        d.leagues.setdefault(slug, {"slug": slug})
        d.leagues[slug]["logo"] = dark or plain
        d.leagues[slug].setdefault("name", league.get("name"))
        d.leagues[slug].setdefault(
            "season", int(((league.get("season") or {}).get("year")
                           or datetime.datetime.utcnow().year)))


def find_club(d, board_name, comp):
    """Board club name -> ESPN club, searched in its own competition first."""
    target = norm(board_name)
    if not target:
        return None
    pools = []
    slug = COMP_LEAGUE.get(comp)
    if slug:
        pools.append(d.clubs.get(slug) or [])
    pools.append([t for s in STAT_LEAGUES for t in (d.clubs.get(s) or [])])
    pools.append([t for s in CUP_LEAGUES for t in (d.clubs.get(s) or [])])
    for pool in pools:
        best, score = None, 0
        for t in pool:
            s = max(name_score(target, norm(t["name"])),
                    name_score(target, norm(t["short"])))
            if s > score:
                best, score = t, s
        if best and score >= 70:
            return best
    return None


def load_team_data(d, team_ids):
    """Season statistics, league table row and completed matches per club."""
    stat_urls, sched_urls, table_urls = [], [], []
    for tid in team_ids:
        slug = d.home_league.get(tid)
        if not slug:
            continue
        season = (d.leagues.get(slug) or {}).get("season") or 0
        stat_urls.append("%s/%s/seasons/%d/types/1/teams/%s/statistics"
                         % (CORE_API, slug, season, tid))
        sched_urls.append("%s/%s/teams/%s/schedule?season=%d" % (SITE_API, slug, tid, season))
        sched_urls.append("%s/%s/teams/%s/schedule?season=%d" % (SITE_API, slug, tid, season - 1))
    for slug in STAT_LEAGUES:
        season = (d.leagues.get(slug) or {}).get("season")
        if season:
            table_urls.append("%s/%s/standings?season=%d" % (WEB_API, slug, season))

    d.warm(table_urls, workers=6)
    d.warm(stat_urls, workers=10)
    d.warm(sched_urls, workers=10)

    for url in table_urls:
        payload = d.get(url)
        for child in (payload or {}).get("children") or []:
            for entry in ((child.get("standings") or {}).get("entries") or []):
                tid = str((entry.get("team") or {}).get("id") or "")
                if not tid:
                    continue
                stats = {s.get("name"): s for s in entry.get("stats") or []}

                def val(key):
                    s = stats.get(key) or {}
                    v = s.get("value")
                    return None if v is None else v
                d.table[tid] = {
                    "rank": val("rank"), "played": val("gamesPlayed"),
                    "wins": val("wins"), "draws": val("ties"), "losses": val("losses"),
                    "gf": val("pointsFor"), "ga": val("pointsAgainst"),
                    "points": val("points"),
                    "league": (payload or {}).get("abbreviation") or "",
                }

    for url in stat_urls:
        payload = d.get(url)
        if not payload or not payload.get("splits"):
            continue
        tid = str(((payload.get("team") or {}).get("$ref") or "").rstrip("/").split("/")[-1].split("?")[0])
        flat = {}
        for cat in (payload["splits"].get("categories") or []):
            for s in cat.get("stats") or []:
                flat[s.get("name")] = s.get("value")
        if tid:
            d.stats[tid] = flat

    for tid in team_ids:
        slug = d.home_league.get(tid)
        if not slug:
            continue
        season = (d.leagues.get(slug) or {}).get("season") or 0
        rows = []
        seen = set()
        for yr in (season, season - 1):
            payload = d.get("%s/%s/teams/%s/schedule?season=%d" % (SITE_API, slug, tid, yr))
            for ev in (payload or {}).get("events") or []:
                comps = ev.get("competitions") or []
                if not comps:
                    continue
                c = comps[0]
                status = ((c.get("status") or {}).get("type") or {})
                if not status.get("completed"):
                    continue
                us = them = None
                for k in c.get("competitors") or []:
                    if str((k.get("team") or {}).get("id")) == str(tid):
                        us = k
                    else:
                        them = k
                if not us or not them:
                    continue
                try:
                    gf = int(float((us.get("score") or {}).get("value")))
                    ga = int(float((them.get("score") or {}).get("value")))
                except (TypeError, ValueError):
                    continue
                eid = str(ev.get("id") or "")
                if eid in seen:
                    continue
                seen.add(eid)
                rows.append({
                    "id": eid, "date": (ev.get("date") or "")[:10],
                    "home": us.get("homeAway") == "home",
                    "gf": gf, "ga": ga,
                    "opp": (them.get("team") or {}).get("displayName") or "",
                    "opp_id": str((them.get("team") or {}).get("id") or ""),
                    "comp": (((ev.get("season") or {}).get("slug") or "")
                             or ((ev.get("seasonType") or {}).get("name") or "")),
                    "comp_name": (ev.get("league") or {}).get("name") or "",
                })
        rows.sort(key=lambda r: r["date"])
        d.matches[tid] = rows


# ----------------------------------------------------------------- shaping

def result_of(m):
    return "W" if m["gf"] > m["ga"] else ("L" if m["gf"] < m["ga"] else "D")


def window_trends(rows, n=10):
    """Counted from real final scores, never modelled."""
    last = rows[-n:]
    if not last:
        return None
    w = sum(1 for m in last if result_of(m) == "W")
    dr = sum(1 for m in last if result_of(m) == "D")
    ln = len(last)
    return {
        "n": ln, "w": w, "d": dr, "l": ln - w - dr,
        "gf": sum(m["gf"] for m in last), "ga": sum(m["ga"] for m in last),
        "btts": sum(1 for m in last if m["gf"] > 0 and m["ga"] > 0),
        "o25": sum(1 for m in last if m["gf"] + m["ga"] > 2.5),
        "cs": sum(1 for m in last if m["ga"] == 0),
        "fts": sum(1 for m in last if m["gf"] == 0),
        "form": [result_of(m) for m in last[-5:]][::-1],
    }


def venue_record(rows, home, n=12):
    sel = [m for m in rows if m["home"] is home][-n:]
    if not sel:
        return None
    w = sum(1 for m in sel if result_of(m) == "W")
    dr = sum(1 for m in sel if result_of(m) == "D")
    return {"n": len(sel), "w": w, "d": dr, "l": len(sel) - w - dr,
            "gf": sum(m["gf"] for m in sel), "ga": sum(m["ga"] for m in sel)}


def streak(rows):
    if not rows:
        return None
    kind = result_of(rows[-1])
    count = 0
    for m in reversed(rows):
        if result_of(m) != kind:
            break
        count += 1
    return {"kind": kind, "n": count}


def season_block(flat):
    """ESPN season statistics reshaped, only keys the feed actually returned."""
    if not flat:
        return None
    gp = flat.get("appearances") or 0
    if not gp:
        return None

    def per(key):
        v = flat.get(key)
        return None if v is None else round(float(v) / gp, 2)

    # Expected goals exist for the big five and MLS and are flat zero for the
    # leagues ESPN does not model. A club cannot have played five matches at
    # 0.00 xG, so a zero here means "not carried" and is dropped rather than
    # printed as a real number.
    xga = flat.get("avgExpectedGoalsConceded") or None
    xgd = flat.get("avgExpectedGoalDifferential")
    xg = None
    if xga is not None and xgd is not None:
        xg = round(float(xga) + float(xgd), 2)
    xga = round(float(xga), 2) if xga is not None else None
    cs = flat.get("cleanSheet")
    out = {
        "gp": int(gp),
        "gpm": per("totalGoals"), "gapm": per("goalsConceded"),
        "shots": per("totalShots"), "sot": per("shotsOnTarget"),
        "corners": per("wonCorners"),
        "poss": round(float(flat["possessionPct"]), 1) if flat.get("possessionPct") is not None else None,
        "passpct": round(float(flat["passPct"]) * 100, 1) if flat.get("passPct") is not None else None,
        "xg": xg, "xga": xga,
        "cspct": int(round(100.0 * float(cs) / gp)) if cs is not None else None,
        "yellow": flat.get("yellowCards"), "red": flat.get("redCards"),
        "fouls": per("foulsCommitted"),
    }
    return out


def head_to_head(d, a_id, b_id, limit=6):
    rows = [m for m in (d.matches.get(a_id) or []) if m["opp_id"] == b_id]
    rows.sort(key=lambda r: r["date"])
    out = []
    for m in rows[-limit:][::-1]:
        out.append({"date": m["date"], "home": m["home"], "gf": m["gf"], "ga": m["ga"],
                    "comp": m.get("comp_name") or "",
                    "tot": m["gf"] + m["ga"],
                    "btts": bool(m["gf"] > 0 and m["ga"] > 0)})
    return out


def team_payload(d, club):
    if not club:
        return None
    tid = club["id"]
    rows = d.matches.get(tid) or []
    return {
        "name": club["name"], "short": club["short"] or club["name"],
        "abbr": club["abbr"], "logo": club["logo"], "id": tid,
        "table": d.table.get(tid),
        "season": season_block(d.stats.get(tid)),
        "last10": window_trends(rows, 10),
        "home": venue_record(rows, True),
        "away": venue_record(rows, False),
        "streak": streak(rows),
        "played": len(rows),
    }


# ------------------------------------------------------------------ markets

def extra_markets(raw):
    """Team totals and the first half total, which the shared board reader
    drops. Soccer is the only board that prices them, and a handicapper reads
    a 1H line differently from a full time one, so they are picked up here."""
    out = {"tot_under": None, "h1_point": None, "h1_over": None, "h1_under": None,
           "tt": {}}
    for b in (raw or {}).get("bookmakers") or []:
        for m in b.get("markets") or []:
            key = m.get("key")
            outs = m.get("outcomes") or []
            if key == "totals" and out["tot_under"] is None:
                for o in outs:
                    if (o.get("name") or "").lower() == "under":
                        out["tot_under"] = o.get("price")
            elif key == "first_half_totals" and out["h1_point"] is None:
                for o in outs:
                    nm = (o.get("name") or "").lower()
                    if nm == "over":
                        out["h1_point"], out["h1_over"] = o.get("point"), o.get("price")
                    elif nm == "under":
                        out["h1_under"] = o.get("price")
            elif key == "team_totals" and not out["tt"]:
                for o in outs:
                    who = o.get("description")
                    if who and (o.get("name") or "").lower() == "over":
                        out["tt"][who] = (o.get("point"), o.get("price"))
    return out


def implied(odds):
    """American price to an implied probability, 0..1."""
    try:
        n = float(odds)
    except (TypeError, ValueError):
        return None
    if n == 0:
        return None
    return 100.0 / (n + 100.0) if n > 0 else (-n) / ((-n) + 100.0)


def two_way(a, b):
    """The pair of prices de-vigged to two probabilities that add to one."""
    pa, pb = implied(a), implied(b)
    if pa is None or pb is None or (pa + pb) <= 0:
        return None, None
    return pa / (pa + pb), pb / (pa + pb)


# ------------------------------------------------------------------ shaping

def build_games(d, board):
    """Board fixtures joined to the ESPN research, one dict per match."""
    ids = []
    resolved = []
    for g in board:
        comp = g.get("comp") or ""
        away = find_club(d, g["away"], comp)
        home = find_club(d, g["home"], comp)
        resolved.append((g, away, home))
        for c in (away, home):
            if c and c["id"] not in ids:
                ids.append(c["id"])
    load_team_data(d, ids)

    games = []
    for g, away_c, home_c in resolved:
        comp = g.get("comp") or ""
        slug = COMP_LEAGUE.get(comp) or ("other-" + re.sub(r"[^a-z0-9]+", "-", comp.lower()).strip("-"))
        league = d.leagues.get(slug) or {}
        m = g["markets"]
        ml = m.get("h2h") or {}
        pa, ph = two_way(ml.get(g["away"]), ml.get(g["home"]))
        sp = (m.get("spread") or {}).get(g["home"]) or (None, None)
        tot = m.get("total") or {}
        games.append({
            "board": g,
            "comp": comp, "comp_slug": slug,
            "comp_logo": league.get("logo"),
            "weight": COMP_WEIGHT.get(slug, 50),
            "away": team_payload(d, away_c), "home": team_payload(d, home_c),
            "away_name": g["away"], "home_name": g["home"],
            "ml_away": ml.get(g["away"]), "ml_home": ml.get(g["home"]),
            "p_away": pa, "p_home": ph,
            "sp_point": sp[0], "sp_price": sp[1],
            "tot_point": tot.get("point"), "tot_over": tot.get("price"),
            "extra": extra_markets(g.get("_raw")),
            "h2h": (head_to_head(d, away_c["id"], home_c["id"])
                    if away_c and home_c else []),
        })
    return games


# --------------------------------------------------------------------- css

CSS = """
    <style>
    .sh-wrap{width:min(1220px,calc(100% - 28px));margin:0 auto;padding:30px 0 70px}
    .sh-hero{margin:0 0 22px}
    .sh-kick{display:inline-block;font:800 12px/1 var(--display),sans-serif;letter-spacing:.16em;
      text-transform:uppercase;color:var(--gold);border:1px solid var(--gold-soft);
      background:var(--gold-soft);border-radius:999px;padding:7px 12px;margin:0 0 12px}
    .sh-hero h1{font:900 clamp(30px,5vw,46px)/1.03 var(--display),sans-serif;margin:0 0 10px;
      letter-spacing:.01em;text-transform:uppercase}
    .sh-lede{color:var(--ink-2);font-size:15.5px;line-height:1.62;max-width:74ch;margin:0}
    .sh-metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin:20px 0 0}
    .sh-metric{background:var(--panel);border:1px solid var(--line);border-radius:var(--r);padding:12px 14px}
    .sh-metric b{display:block;font:900 22px/1 var(--display),sans-serif;color:var(--ink)}
    .sh-metric span{display:block;font-size:11px;letter-spacing:.09em;text-transform:uppercase;
      color:var(--muted);margin-top:5px;font-weight:700}
    .sh-filters{position:sticky;top:0;z-index:20;background:var(--page);padding:12px 0 10px;
      margin:24px 0 18px;border-bottom:1px solid var(--line)}
    .sh-tabs,.sh-views{display:flex;flex-wrap:wrap;gap:7px}
    .sh-views{margin-top:9px}
    .sh-tab{display:inline-flex;align-items:center;gap:7px;background:var(--panel-2);
      border:1px solid var(--line);color:var(--ink-2);border-radius:999px;padding:7px 13px;
      font:700 12.5px/1 var(--font),sans-serif;cursor:pointer;letter-spacing:.02em}
    .sh-tab img{width:17px;height:17px;object-fit:contain}
    .sh-tab u{text-decoration:none;color:var(--muted);font-weight:700}
    .sh-tab:hover{border-color:var(--line-2);color:var(--ink)}
    .sh-tab.is-on{background:var(--brand-soft);border-color:var(--brand);color:var(--brand-dk)}
    .sh-view{border-radius:var(--r-sm);padding:6px 11px;font-size:12px}
    .sh-sec{margin:0 0 34px}
    .sh-sec-head{display:flex;align-items:baseline;justify-content:space-between;gap:14px;
      flex-wrap:wrap;margin:0 0 14px}
    .sh-sec-head h2{font:900 20px/1.1 var(--display),sans-serif;text-transform:uppercase;
      letter-spacing:.05em;margin:0}
    .sh-sec-head p{margin:0;color:var(--muted);font-size:12.5px}
    .sh-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(352px,1fr));gap:14px}
    .sh-card{background:var(--panel);border:1px solid var(--line);border-radius:var(--r);
      padding:14px 15px 13px;display:flex;flex-direction:column;gap:11px;box-shadow:var(--sh)}
    .sh-card.is-hid{display:none}
    .sh-card-top{display:flex;align-items:center;gap:8px;font-size:11.5px;color:var(--muted);
      font-weight:700;letter-spacing:.05em;text-transform:uppercase}
    .sh-card-top img{width:18px;height:18px;object-fit:contain}
    .sh-card-top .sh-when{margin-left:auto;color:var(--ink-2);letter-spacing:.02em}
    .sh-side{display:flex;align-items:center;gap:11px}
    .sh-side + .sh-side{margin-top:9px}
    .sh-crest{width:38px;height:38px;object-fit:contain;flex:0 0 38px}
    .sh-crest.sh-blank{border:1px dashed var(--line-2);border-radius:50%}
    .sh-side-main{min-width:0;flex:1}
    .sh-name{font:800 15px/1.2 var(--font),sans-serif;color:var(--ink);
      white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .sh-meta{font-size:11.5px;color:var(--muted);margin-top:3px;font-weight:600}
    .sh-pills{display:flex;gap:3px;margin-top:6px}
    .sh-pill{width:17px;height:17px;border-radius:4px;display:grid;place-items:center;
      font:800 10px/1 var(--font),sans-serif;color:#06131f}
    .sh-pill.sh-W{background:var(--green)}
    .sh-pill.sh-D{background:var(--gold)}
    .sh-pill.sh-L{background:var(--red)}
    .sh-ml{font:900 16px/1 var(--display),sans-serif;color:var(--ink);min-width:56px;text-align:right}
    .sh-ml.sh-none{color:var(--muted);font-size:12px;font-weight:700}
    .sh-mkt{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px}
    .sh-chip{background:var(--panel-2);border:1px solid var(--line);border-radius:var(--r-sm);
      padding:7px 8px;text-align:center}
    .sh-chip span{display:block;font-size:9.5px;letter-spacing:.1em;text-transform:uppercase;
      color:var(--muted);font-weight:800}
    .sh-chip b{display:block;font:800 13px/1.25 var(--font),sans-serif;color:var(--ink);margin-top:4px}
    .sh-cmp{display:grid;grid-template-columns:46px 1fr 1fr 46px;align-items:center;
      column-gap:7px;row-gap:3px}
    .sh-cmp .sh-k{grid-column:2/4;text-align:center;font-size:10px;letter-spacing:.08em;
      text-transform:uppercase;color:var(--muted);font-weight:800}
    .sh-cmp .sh-v{font:800 12.5px/1 var(--font),sans-serif;color:var(--ink);
      font-variant-numeric:tabular-nums}
    .sh-cmp .sh-v.sh-r{text-align:right}
    .sh-cmp .sh-t{height:6px;background:var(--panel-3);border-radius:999px;overflow:hidden;
      display:flex;grid-column:3}
    .sh-cmp .sh-t.sh-l{justify-content:flex-end;grid-column:2}
    .sh-cmp .sh-t i{display:block;height:100%;background:var(--brand);border-radius:999px}
    .sh-cmp .sh-t.sh-l i{background:var(--violet)}
    .sh-met{display:grid;grid-template-columns:78px 1fr 44px;align-items:center;gap:8px;
      font-size:11px;font-weight:700;color:var(--muted)}
    .sh-met .sh-t{height:6px;background:var(--panel-3);border-radius:999px;overflow:hidden}
    .sh-met .sh-t i{display:block;height:100%;background:var(--green);border-radius:999px}
    .sh-met b{color:var(--ink);text-align:right;font-size:11.5px;font-variant-numeric:tabular-nums}
    .sh-blockhead{font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);
      font-weight:800;border-top:1px solid var(--line);padding-top:9px}
    .sh-open{margin-top:auto;background:var(--brand-soft);border:1px solid var(--brand);
      color:var(--brand-dk);border-radius:var(--r-sm);padding:9px 12px;font:800 12.5px/1 var(--font),
      sans-serif;cursor:pointer;letter-spacing:.04em;text-transform:uppercase}
    .sh-open:hover{background:var(--brand);color:#04121f}
    .sh-more{display:block;margin:16px auto 0;background:var(--panel-2);border:1px solid var(--line-2);
      color:var(--ink);border-radius:999px;padding:10px 22px;font:800 12.5px/1 var(--font),sans-serif;
      cursor:pointer;letter-spacing:.06em;text-transform:uppercase}
    .sh-empty{color:var(--muted);font-size:13.5px;padding:18px 0}
    .sh-boardwrap{border:1px solid var(--line);border-radius:var(--r);overflow:hidden;
      background:var(--panel)}
    .sh-scroll{overflow-x:auto}
    table.sh-board{width:100%;border-collapse:collapse;min-width:880px}
    table.sh-board th{font:800 10px/1 var(--font),sans-serif;letter-spacing:.11em;
      text-transform:uppercase;color:var(--muted);text-align:left;padding:11px 12px;
      background:var(--panel-2);border-bottom:1px solid var(--line)}
    table.sh-board td{padding:12px;border-bottom:1px solid var(--line);font-size:13px;
      color:var(--ink-2);vertical-align:middle}
    table.sh-board tr:last-child td{border-bottom:0}
    table.sh-board tr.is-hid{display:none}
    .sh-fix{display:flex;flex-direction:column;gap:6px;min-width:196px}
    .sh-fixline{display:flex;align-items:center;gap:8px;color:var(--ink);font-weight:700}
    .sh-fixline img{width:22px;height:22px;object-fit:contain;flex:0 0 22px}
    .sh-fixline span.sh-blank{width:22px;height:22px;flex:0 0 22px;border:1px dashed var(--line-2);
      border-radius:50%;display:inline-block}
    .sh-badge{display:inline-flex;align-items:center;gap:6px;background:var(--panel-2);
      border:1px solid var(--line);border-radius:999px;padding:4px 9px;font-size:11px;
      font-weight:800;color:var(--ink-2);white-space:nowrap}
    .sh-badge img{width:14px;height:14px;object-fit:contain}
    .sh-num{font-variant-numeric:tabular-nums;white-space:nowrap}
    .sh-mini{background:none;border:1px solid var(--line-2);color:var(--ink-2);border-radius:999px;
      padding:5px 11px;font:800 11px/1 var(--font),sans-serif;cursor:pointer;white-space:nowrap}
    .sh-mini:hover{border-color:var(--brand);color:var(--brand-dk)}
    .sh-note{color:var(--muted);font-size:12.5px;line-height:1.65;margin:22px 0 0;max-width:86ch}
    .sh-links{display:flex;flex-wrap:wrap;gap:8px;margin:0;padding:0;list-style:none}
    .sh-links a{display:inline-block;background:var(--panel-2);border:1px solid var(--line);
      border-radius:999px;padding:8px 14px;font-size:12.5px;font-weight:700;color:var(--ink-2);
      text-decoration:none}
    .sh-links a:hover{border-color:var(--brand);color:var(--brand-dk)}
    .sh-modal{position:fixed;inset:0;z-index:120;background:rgba(3,10,19,.74);
      display:none;align-items:flex-start;justify-content:center;padding:22px 14px;overflow-y:auto}
    .sh-modal.is-on{display:flex}
    .sh-modal-inner{background:var(--page);border:1px solid var(--line-2);border-radius:var(--r);
      width:min(980px,100%);box-shadow:var(--sh-up);padding:20px 22px 26px}
    .sh-x{float:right;background:none;border:1px solid var(--line-2);color:var(--ink-2);
      border-radius:999px;width:32px;height:32px;font-size:16px;cursor:pointer;line-height:1}
    .sh-mhead{display:flex;align-items:center;gap:13px;flex-wrap:wrap;margin:0 0 6px}
    .sh-mcrests{display:flex;align-items:center;gap:12px;margin:0 0 10px}
    .sh-mcrests img{width:46px;height:46px;object-fit:contain}
    .sh-mcrests span{font:800 11px/1 var(--font),sans-serif;letter-spacing:.12em;
      text-transform:uppercase;color:var(--muted)}
    .sh-mhead h3{font:900 22px/1.15 var(--display),sans-serif;margin:0;text-transform:uppercase}
    .sh-msub{color:var(--muted);font-size:12.5px;font-weight:700;margin:0 0 16px}
    .sh-grid2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;margin:0 0 14px}
    .sh-box{background:var(--panel);border:1px solid var(--line);border-radius:var(--r);
      padding:13px 14px;margin:0 0 14px}
    .sh-grid2 .sh-box{margin:0}
    .sh-box h4{font:800 11px/1 var(--font),sans-serif;letter-spacing:.11em;text-transform:uppercase;
      color:var(--muted);margin:0 0 11px}
    .sh-kv{display:flex;justify-content:space-between;gap:10px;font-size:12.5px;padding:6px 0;
      border-bottom:1px dashed var(--line)}
    .sh-kv:last-child{border-bottom:0}
    .sh-kv span{color:var(--muted);font-weight:700}
    .sh-kv b{color:var(--ink);font-weight:800;font-variant-numeric:tabular-nums;text-align:right}
    table.sh-h2h{width:100%;border-collapse:collapse;font-size:12.5px}
    table.sh-h2h th{text-align:left;font:800 10px/1 var(--font),sans-serif;letter-spacing:.1em;
      text-transform:uppercase;color:var(--muted);padding:7px 8px;border-bottom:1px solid var(--line)}
    table.sh-h2h td{padding:7px 8px;border-bottom:1px solid var(--line);color:var(--ink-2)}
    .sh-yes{color:var(--green);font-weight:800}
    .sh-no{color:var(--red);font-weight:800}
    @media (max-width:900px){
      .sh-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}
      .sh-grid2{grid-template-columns:1fr}
    }
    @media (max-width:620px){
      .sh-wrap{padding:18px 0 46px}
      .sh-cards{grid-template-columns:1fr}
      .sh-filters{position:static}
      /* The cards already carry the crests, form and competition on a phone,
         so the board drops its widest repeat columns and becomes a short
         sideways scroll for the prices instead of a very long one. */
      table.sh-board{min-width:600px}
      table.sh-board th:nth-child(2),table.sh-board td:nth-child(2),
      table.sh-board th:nth-child(7),table.sh-board td:nth-child(7){display:none}
      table.sh-board th,table.sh-board td{padding:9px 8px;font-size:12px}
      .sh-fix{min-width:142px}
      .sh-fixline img,.sh-fixline span.sh-blank{width:18px;height:18px;flex:0 0 18px}
      .sh-modal{padding:0}
      .sh-modal-inner{border-radius:0;min-height:100%;padding:16px 14px 26px}
    }
    </style>
"""


# ---------------------------------------------------------------- rendering

FEATURED_ON_LOAD = 9


def _fmt(v, nd=2):
    if v is None:
        return None
    try:
        return ("%%.%df" % nd) % float(v)
    except (TypeError, ValueError):
        return None


def _pills(form, esc):
    if not form:
        return ""
    return ('<div class="sh-pills" aria-label="Last %d results, most recent first">%s</div>'
            % (len(form), "".join('<span class="sh-pill sh-%s">%s</span>' % (r, r)
                                  for r in form)))


def _crest(team, esc, cls="sh-crest"):
    if team and team.get("logo"):
        return ('<img class="%s" src="%s" alt="" width="38" height="38" loading="lazy" '
                'decoding="async">' % (cls, esc(team["logo"])))
    return '<span class="%s sh-blank" aria-hidden="true"></span>' % cls


def _record_line(team):
    """League position and record, or the last ten when there is no table row."""
    if not team:
        return ""
    t = team.get("table")
    bits = []
    if t and t.get("played"):
        if t.get("rank"):
            bits.append("%s in %s" % (_ordinal(int(t["rank"])), t.get("league") or "the table"))
        bits.append("%d-%d-%d" % (int(t.get("wins") or 0), int(t.get("draws") or 0),
                                  int(t.get("losses") or 0)))
        if t.get("gf") is not None and t.get("ga") is not None:
            bits.append("%d GF / %d GA" % (int(t["gf"]), int(t["ga"])))
    elif team.get("last10"):
        l = team["last10"]
        bits.append("%d-%d-%d in the last %d" % (l["w"], l["d"], l["l"], l["n"]))
    return " &middot; ".join(bits)


def _ordinal(n):
    if 10 <= n % 100 <= 20:
        return "%dth" % n
    return "%d%s" % (n, {1: "st", 2: "nd", 3: "rd"}.get(n % 10, "th"))


def _cmp_row(label, a, h, esc, nd=2):
    """Two bars growing out from the middle, away on the left, home on the right."""
    if a is None and h is None:
        return ""
    av, hv = float(a or 0), float(h or 0)
    top = max(av, hv) or 1.0
    return ('<div class="sh-cmp">'
            '<b class="sh-v">%s</b><span class="sh-k">%s</span><b class="sh-v sh-r">%s</b>'
            '<span class="sh-t sh-l"><i style="width:%d%%"></i></span>'
            '<span class="sh-t"><i style="width:%d%%"></i></span>'
            '</div>'
            % (_fmt(a, nd) or "n/a", esc(label), _fmt(h, nd) or "n/a",
               int(round(100.0 * av / top)), int(round(100.0 * hv / top))))


def _meter(label, hit, n, esc):
    if not n:
        return ""
    return ('<div class="sh-met"><span>%s</span><span class="sh-t">'
            '<i style="width:%d%%"></i></span><b>%d/%d</b></div>'
            % (esc(label), int(round(100.0 * hit / n)), hit, n))


def _card(g, i, H):
    esc = H["esc"]
    away, home = g["away"], g["home"]
    comp_logo = ('<img src="%s" alt="" width="18" height="18" loading="lazy">'
                 % esc(g["comp_logo"])) if g["comp_logo"] else ""
    parts = ['<article class="sh-card" data-i="%d">' % i,
             '<div class="sh-card-top">%s<span>%s</span><span class="sh-when">%s</span></div>'
             % (comp_logo, esc(g["comp"] or "Soccer"), esc(H["kickoff"](g["board"]["commence"])))]

    parts.append('<div>')
    for side, name, price in (("away", g["away_name"], g["ml_away"]),
                              ("home", g["home_name"], g["ml_home"])):
        team = g[side]
        odds = H["odds_str"](price)
        parts.append(
            '<div class="sh-side">%s<div class="sh-side-main">'
            '<div class="sh-name">%s</div><div class="sh-meta">%s</div>%s</div>'
            '<div class="sh-ml%s">%s</div></div>'
            % (_crest(team, esc), esc((team or {}).get("name") or name),
               _record_line(team) or "&mdash;",
               _pills(((team or {}).get("last10") or {}).get("form"), esc),
               "" if odds else " sh-none", esc(odds or "n/p")))
    parts.append('</div>')

    spread = ("%s %s" % (H["line_str"](g["sp_point"]), H["odds_str"](g["sp_price"]) or "")
              if g["sp_point"] is not None else None)
    total = ("o%g (%s)" % (float(g["tot_point"]), H["odds_str"](g["tot_over"]) or "")
             if g["tot_point"] is not None else None)
    h1 = g["extra"].get("h1_point")
    h1txt = ("o%g (%s)" % (float(h1), H["odds_str"](g["extra"].get("h1_over")) or "")
             if h1 is not None else None)
    parts.append('<div class="sh-mkt">%s</div>' % "".join(
        '<div class="sh-chip"><span>%s</span><b>%s</b></div>' % (esc(k), esc(v or "not priced"))
        for k, v in (("Home spread", spread), ("Total", total), ("1st half", h1txt))))

    sa = (away or {}).get("season") or {}
    sh_ = (home or {}).get("season") or {}
    cmps = [_cmp_row("Goals / match", sa.get("gpm"), sh_.get("gpm"), esc),
            _cmp_row("Conceded / match", sa.get("gapm"), sh_.get("gapm"), esc),
            _cmp_row("xG / match", sa.get("xg"), sh_.get("xg"), esc)]
    cmps = [c for c in cmps if c]
    if cmps:
        parts.append('<div class="sh-blockhead">This season, per match</div>')
        parts.append("".join(cmps))

    la, lh = (away or {}).get("last10"), (home or {}).get("last10")
    if la or lh:
        mets = []
        for team, lab in ((la, (away or {}).get("short") or g["away_name"]),
                          (lh, (home or {}).get("short") or g["home_name"])):
            if not team:
                continue
            mets.append('<div class="sh-met" style="grid-template-columns:1fr">'
                        '<span>%s, last %d</span></div>' % (esc(lab), team["n"]))
            mets.append(_meter("Over 2.5", team["o25"], team["n"], esc))
            mets.append(_meter("BTTS", team["btts"], team["n"], esc))
            mets.append(_meter("Clean sheet", team["cs"], team["n"], esc))
        parts.append('<div class="sh-blockhead">Betting trends</div>')
        parts.append("".join(mets))

    if away or home:
        parts.append('<button type="button" class="sh-open" data-open="%d">Full analysis</button>' % i)
    parts.append('</article>')
    return "".join(parts)


def _board_row(g, i, H):
    esc = H["esc"]
    cells = []
    fix = []
    for side, name in (("away", g["away_name"]), ("home", g["home_name"])):
        team = g[side] or {}
        crest = ('<img src="%s" alt="" width="22" height="22" loading="lazy">' % esc(team["logo"])
                 if team.get("logo") else '<span class="sh-blank"></span>')
        fix.append('<div class="sh-fixline">%s<span>%s</span></div>'
                   % (crest, esc(team.get("name") or name)))
    cells.append('<td><div class="sh-fix">%s</div></td>' % "".join(fix))
    badge = ('<span class="sh-badge">%s%s</span>'
             % (('<img src="%s" alt="" width="14" height="14" loading="lazy">' % esc(g["comp_logo"]))
                if g["comp_logo"] else "", esc(g["comp"] or "Soccer")))
    cells.append('<td>%s</td>' % badge)
    cells.append('<td class="sh-num">%s</td>' % esc(H["kickoff"](g["board"]["commence"])))
    ml = ('<div class="sh-num">%s</div><div class="sh-num">%s</div>'
          % (esc(H["odds_str"](g["ml_away"]) or "not priced"),
             esc(H["odds_str"](g["ml_home"]) or "not priced")))
    cells.append('<td>%s</td>' % ml)
    cells.append('<td class="sh-num">%s</td>'
                 % (esc("%s (%s)" % (H["line_str"](g["sp_point"]),
                                     H["odds_str"](g["sp_price"]) or ""))
                    if g["sp_point"] is not None else "not priced"))
    if g["tot_point"] is not None:
        tot = ('<div class="sh-num">o%g %s</div><div class="sh-num">u%g %s</div>'
               % (float(g["tot_point"]), esc(H["odds_str"](g["tot_over"]) or ""),
                  float(g["tot_point"]),
                  esc(H["odds_str"](g["extra"].get("tot_under")) or "")))
    else:
        tot = "not priced"
    cells.append('<td>%s</td>' % tot)
    forms = []
    for side in ("away", "home"):
        team = g[side] or {}
        forms.append(_pills((team.get("last10") or {}).get("form"), esc)
                     or '<div class="sh-pills">&mdash;</div>')
    cells.append('<td>%s</td>' % "".join(forms))
    cells.append('<td>%s</td>'
                 % ('<button type="button" class="sh-mini" data-open="%d">Analysis</button>' % i
                    if (g["away"] or g["home"]) else ""))
    return '<tr data-i="%d">%s</tr>' % (i, "".join(cells))


def _payload(g, H):
    """The JSON the analysis panel is drawn from. Only measured values."""
    def side(team, fallback):
        if not team:
            return {"n": fallback}
        return {"n": team["name"], "logo": team.get("logo"), "tbl": team.get("table"),
                "s": team.get("season"), "l10": team.get("last10"),
                "hm": team.get("home"), "aw": team.get("away"), "st": team.get("streak")}
    return {
        "c": g["comp"], "cl": g["comp_logo"],
        "t": H["kickoff"](g["board"]["commence"]), "d": H["long_date"](g["board"]["commence"]),
        "a": side(g["away"], g["away_name"]), "h": side(g["home"], g["home_name"]),
        "m": {"ml": [H["odds_str"](g["ml_away"]), H["odds_str"](g["ml_home"])],
              "sp": ([H["line_str"](g["sp_point"]), H["odds_str"](g["sp_price"])]
                     if g["sp_point"] is not None else None),
              "tot": ([g["tot_point"], H["odds_str"](g["tot_over"]),
                       H["odds_str"](g["extra"].get("tot_under"))]
                      if g["tot_point"] is not None else None),
              "h1": ([g["extra"]["h1_point"], H["odds_str"](g["extra"].get("h1_over")),
                      H["odds_str"](g["extra"].get("h1_under"))]
                     if g["extra"].get("h1_point") is not None else None),
              "tt": [[k, v[0], H["odds_str"](v[1])]
                     for k, v in sorted((g["extra"].get("tt") or {}).items())],
              "book": (g["board"].get("markets") or {}).get("book")},
        "x": g["h2h"],
    }


JS = """
    <script>
    (function(){
      var node=document.getElementById('sh-data');
      if(!node){return;}
      var D=JSON.parse(node.textContent);
      var cards=Array.prototype.slice.call(document.querySelectorAll('.sh-card'));
      var rows=Array.prototype.slice.call(document.querySelectorAll('tr[data-i]'));
      var grid=document.getElementById('sh-cards');
      var tbody=document.getElementById('sh-rows');
      var more=document.getElementById('sh-more');
      var cardCount=document.getElementById('sh-card-count');
      var boardCount=document.getElementById('sh-board-count');
      var comp='all', view='featured', open=false;
      function num(el,k){var v=parseFloat(el.getAttribute(k));return isNaN(v)?0:v;}
      function keyed(list){
        var f=list.filter(function(el){
          return comp==='all'||el.getAttribute('data-comp')===comp;});
        f.sort(function(a,b){
          if(view==='soon'){return num(a,'data-ts')-num(b,'data-ts');}
          if(view==='fav'){return num(b,'data-fav')-num(a,'data-fav')||num(a,'data-ts')-num(b,'data-ts');}
          if(view==='total'){return num(b,'data-tot')-num(a,'data-tot')||num(a,'data-ts')-num(b,'data-ts');}
          if(view==='close'){return num(a,'data-close')-num(b,'data-close')||num(a,'data-ts')-num(b,'data-ts');}
          if(view==='league'){
            var c=a.getAttribute('data-comp').localeCompare(b.getAttribute('data-comp'));
            return c||num(a,'data-ts')-num(b,'data-ts');}
          return num(b,'data-w')-num(a,'data-w')||num(a,'data-ts')-num(b,'data-ts');});
        return f;
      }
      function apply(){
        var vis=keyed(cards), i;
        cards.forEach(function(el){el.classList.add('is-hid');});
        var frag=document.createDocumentFragment();
        for(i=0;i<vis.length;i++){frag.appendChild(vis[i]);}
        grid.appendChild(frag);
        var cap=open?vis.length:%d;
        for(i=0;i<vis.length&&i<cap;i++){vis[i].classList.remove('is-hid');}
        if(more){
          if(vis.length>%d){
            more.style.display='block';
            more.textContent=open?'Show fewer':('Show all '+vis.length+' matchup cards');
          }else{more.style.display='none';}
        }
        if(cardCount){
          cardCount.textContent=vis.length?
            (Math.min(cap,vis.length)+' of '+vis.length+' shown'):'nothing on the board here';
        }
        var vr=keyed(rows);
        rows.forEach(function(el){el.classList.add('is-hid');});
        var f2=document.createDocumentFragment();
        for(i=0;i<vr.length;i++){vr[i].classList.remove('is-hid');f2.appendChild(vr[i]);}
        tbody.appendChild(f2);
        if(boardCount){boardCount.textContent=vr.length+(vr.length===1?' fixture':' fixtures');}
      }
      document.getElementById('sh-comps').addEventListener('click',function(e){
        var b=e.target.closest('button[data-comp]');if(!b){return;}
        comp=b.getAttribute('data-comp');open=false;
        this.querySelectorAll('button').forEach(function(x){x.classList.remove('is-on');});
        b.classList.add('is-on');apply();});
      document.getElementById('sh-views').addEventListener('click',function(e){
        var b=e.target.closest('button[data-view]');if(!b){return;}
        view=b.getAttribute('data-view');
        this.querySelectorAll('button').forEach(function(x){x.classList.remove('is-on');});
        b.classList.add('is-on');apply();});
      if(more){more.addEventListener('click',function(){open=!open;apply();
        if(!open){grid.scrollIntoView({block:'start'});}});}

      function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){
        return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
      function pills(f){if(!f||!f.length){return '';}
        return '<div class="sh-pills">'+f.map(function(r){
          return '<span class="sh-pill sh-'+r+'">'+r+'</span>';}).join('')+'</div>';}
      function kv(k,v){return v==null||v===''?'':
        '<div class="sh-kv"><span>'+esc(k)+'</span><b>'+esc(v)+'</b></div>';}
      function cmp(label,a,h,nd){
        if(a==null&&h==null){return '';}
        var av=a==null?0:a, hv=h==null?0:h, top=Math.max(av,hv)||1;
        return '<div class="sh-cmp"><b class="sh-v">'+(a==null?'n/a':a.toFixed(nd))+
          '</b><span class="sh-k">'+esc(label)+'</span><b class="sh-v sh-r">'+
          (h==null?'n/a':h.toFixed(nd))+'</b>'+
          '<span class="sh-t sh-l"><i style="width:'+Math.round(av/top*100)+'%%"></i></span>'+
          '<span class="sh-t"><i style="width:'+Math.round(hv/top*100)+'%%"></i></span></div>';}
      function met(label,hit,n){if(!n){return '';}
        return '<div class="sh-met"><span>'+esc(label)+'</span><span class="sh-t"><i style="width:'+
          Math.round(hit/n*100)+'%%"></i></span><b>'+hit+'/'+n+'</b></div>';}
      function ord(n){n=Math.round(n);
        if(n%%100>=10&&n%%100<=20){return n+'th';}
        return n+({1:'st',2:'nd',3:'rd'}[n%%10]||'th');}
      function rec(r){return r?(r.w+'-'+r.d+'-'+r.l+', '+r.gf+' GF / '+r.ga+' GA'):null;}
      function formBox(t,label){
        if(!t.l10&&!t.tbl){return '';}
        var b='<div class="sh-box"><h4>'+esc(label)+'</h4>';
        if(t.l10){b+=pills(t.l10.form);}
        if(t.tbl&&t.tbl.played){
          b+=kv('League table',(t.tbl.rank?ord(t.tbl.rank)+', ':'')+t.tbl.points+' pts ('+
            t.tbl.wins+'W '+t.tbl.draws+'D '+t.tbl.losses+'L)');
          b+=kv('Goals, league',t.tbl.gf+' for / '+t.tbl.ga+' against in '+t.tbl.played);}
        if(t.l10){b+=kv('Last '+t.l10.n,rec(t.l10));}
        if(t.st){b+=kv('Current run',t.st.n===1?
          ({W:'1 win',D:'1 draw',L:'1 defeat'}[t.st.kind]||''):
          (t.st.n+' straight '+({W:'wins',D:'draws',L:'defeats'}[t.st.kind]||'')));}
        if(t.hm){b+=kv('At home, last '+t.hm.n,rec(t.hm));}
        if(t.aw){b+=kv('Away, last '+t.aw.n,rec(t.aw));}
        return b+'</div>';}
      function trendBox(t,label){
        if(!t.l10){return '';}
        var l=t.l10,b='<div class="sh-box"><h4>'+esc(label)+', last '+l.n+'</h4>';
        b+=met('Over 2.5',l.o25,l.n)+met('Under 2.5',l.n-l.o25,l.n)+met('BTTS',l.btts,l.n)+
           met('Clean sheets',l.cs,l.n)+met('Failed to score',l.fts,l.n);
        b+=kv('Goals','+'+l.gf+' / -'+l.ga+' ('+(l.gf/l.n).toFixed(2)+' and '+
          (l.ga/l.n).toFixed(2)+' per match)');
        return b+'</div>';}

      var modal=document.getElementById('sh-modal');
      var box=document.getElementById('sh-modal-body');
      function draw(i){
        var g=D[i];if(!g){return;}
        var a=g.a,h=g.h,sa=a.s||{},sh=h.s||{},out='';
        out+='<div class="sh-mcrests">'+
          (a.logo?'<img src="'+esc(a.logo)+'" alt="" width="46" height="46">':'')+
          '<span>at</span>'+
          (h.logo?'<img src="'+esc(h.logo)+'" alt="" width="46" height="46">':'')+'</div>'+
          '<div class="sh-mhead"><h3>'+esc(a.n)+' at '+esc(h.n)+'</h3></div>';
        out+='<p class="sh-msub">'+esc(g.c||'Soccer')+' &middot; '+esc(g.d||'')+
          ' &middot; '+esc(g.t||'')+'</p>';
        var m=g.m,mk='<div class="sh-box"><h4>The market</h4>';
        mk+=kv('Moneyline, '+a.n,m.ml[0]);
        mk+=kv('Moneyline, '+h.n,m.ml[1]);
        if(m.sp){mk+=kv('Spread, '+h.n,m.sp[0]+' ('+(m.sp[1]||'')+')');}
        if(m.tot){mk+=kv('Total','o'+m.tot[0]+' '+(m.tot[1]||'')+
          '  /  u'+m.tot[0]+' '+(m.tot[2]||''));}
        if(m.h1){mk+=kv('First half total','o'+m.h1[0]+' '+(m.h1[1]||'')+
          '  /  u'+m.h1[0]+' '+(m.h1[2]||''));}
        (m.tt||[]).forEach(function(t){mk+=kv('Team total, '+t[0],'o'+t[1]+' '+(t[2]||''));});
        mk+=kv('Priced by',m.book||'the sportsbook feed');
        out+=mk+'</div>';
        out+='<div class="sh-grid2">'+formBox(a,a.n)+formBox(h,h.n)+'</div>';
        var bars=cmp('Goals / match',sa.gpm,sh.gpm,2)+cmp('Conceded / match',sa.gapm,sh.gapm,2)+
          cmp('xG / match',sa.xg,sh.xg,2)+cmp('xG against / match',sa.xga,sh.xga,2)+
          cmp('Shots / match',sa.shots,sh.shots,1)+cmp('On target / match',sa.sot,sh.sot,1)+
          cmp('Possession %%',sa.poss,sh.poss,1)+cmp('Pass accuracy %%',sa.passpct,sh.passpct,1)+
          cmp('Corners / match',sa.corners,sh.corners,1)+
          cmp('Clean sheet %%',sa.cspct,sh.cspct,0)+cmp('Fouls / match',sa.fouls,sh.fouls,1);
        if(bars.replace(/\\s/g,'')){
          out+='<div class="sh-box"><h4>Attack and defence, this season'+
            (sa.gp||sh.gp?' ('+(sa.gp||0)+' and '+(sh.gp||0)+' matches played)':'')+
            '</h4><p class="sh-msub" style="margin:0 0 10px">'+esc(a.n)+' left, '+esc(h.n)+
            ' right.</p>'+bars+'</div>';}
        var tb=trendBox(a,a.n)+trendBox(h,h.n);
        if(tb){out+='<div class="sh-grid2">'+tb+'</div>';}
        if(g.x&&g.x.length){
          var t='<div class="sh-box"><h4>Head to head, last '+g.x.length+' meetings on file</h4>'+
            '<table class="sh-h2h"><thead><tr><th>Date</th><th>Venue</th><th>Score</th>'+
            '<th>Goals</th><th>O/U 2.5</th><th>BTTS</th><th>Competition</th></tr></thead><tbody>';
          g.x.forEach(function(r){
            t+='<tr><td>'+esc(r.date)+'</td><td>'+(r.home?esc(a.n)+' home':esc(a.n)+' away')+
              '</td><td>'+r.gf+'-'+r.ga+'</td><td>'+r.tot+'</td><td>'+
              (r.tot>2.5?'<span class="sh-yes">Over</span>':'<span class="sh-no">Under</span>')+
              '</td><td>'+(r.btts?'<span class="sh-yes">Yes</span>':'<span class="sh-no">No</span>')+
              '</td><td>'+esc(r.comp||'')+'</td></tr>';});
          out+=t+'</tbody></table></div>';}
        out+='<p class="sh-note">Prices from the sportsbook feed. Every record, run, trend and '+
          'head to head number above is counted from completed matches and their final scores. '+
          'Season rates come from the club statistics feed.</p>';
        box.innerHTML=out;
        modal.classList.add('is-on');
        document.body.style.overflow='hidden';
        box.parentNode.scrollTop=0;
      }
      function shut(){modal.classList.remove('is-on');document.body.style.overflow='';}
      document.addEventListener('click',function(e){
        var b=e.target.closest('[data-open]');
        if(b){draw(parseInt(b.getAttribute('data-open'),10));return;}
        if(e.target.closest('[data-shut]')||e.target===modal){shut();}});
      document.addEventListener('keydown',function(e){if(e.key==='Escape'){shut();}});
      apply();
    })();
    </script>
"""


def render_body(games, built_at, H, extras_html="", featured_html=""):
    """The whole page body, cards first and the full board underneath."""
    esc = H["esc"]
    priced = sum(1 for g in games if g["board"].get("priced"))
    comps = []
    for g in games:
        if g["comp_slug"] not in [c["slug"] for c in comps]:
            comps.append({"slug": g["comp_slug"], "name": g["comp"] or "Soccer",
                          "logo": g["comp_logo"], "weight": g["weight"], "n": 0})
    for g in games:
        for c in comps:
            if c["slug"] == g["comp_slug"]:
                c["n"] += 1
    comps.sort(key=lambda c: (-c["weight"], c["name"]))
    with_stats = sum(1 for g in games
                     if (g["away"] and g["away"].get("season"))
                     or (g["home"] and g["home"].get("season")))

    b = ['    <main class="sh-wrap">\n',
         '        <header class="sh-hero">\n',
         '            <span class="sh-kick">Handicapping</span>\n',
         '            <h1>Soccer Handicapping</h1>\n',
         '            <p class="sh-lede">Every fixture on the board, priced, with the research '
         'beside it: recent form and current run, attacking and defensive rates for the season, '
         'expected goals, over/under and both teams to score trends counted from real results, '
         'home and away records, and head to head where the clubs have met. Filter by '
         'competition, sort by what you are looking for, and open any match for the full '
         'breakdown.</p>\n',
         '            <div class="sh-metrics">\n']
    for label, value in (("Fixtures on the board", str(len(games))),
                         ("Competitions", str(len(comps))),
                         ("Priced by the book", str(priced)),
                         ("With club research", str(with_stats))):
        b.append('                <div class="sh-metric"><b>%s</b><span>%s</span></div>\n'
                 % (esc(value), esc(label)))
    b.append('            </div>\n        </header>\n')
    # FEATURED_CALLOUT_20260909. The optional Matchup of the Day. The builder
    # returns an empty string when there is no current article for soccer, so
    # nothing is drawn on a day without one.
    b.append(featured_html)

    b.append('        <div class="sh-filters">\n')
    b.append('            <div class="sh-tabs" id="sh-comps" role="group" '
             'aria-label="Filter by competition">\n')
    b.append('                <button type="button" class="sh-tab is-on" data-comp="all">'
             'All <u>%d</u></button>\n' % len(games))
    for c in comps:
        logo = ('<img src="%s" alt="" width="17" height="17" loading="lazy">' % esc(c["logo"])
                if c["logo"] else "")
        b.append('                <button type="button" class="sh-tab" data-comp="%s">%s%s '
                 '<u>%d</u></button>\n' % (esc(c["slug"]), logo, esc(c["name"]), c["n"]))
    b.append('            </div>\n')
    b.append('            <div class="sh-tabs sh-views" id="sh-views" role="group" '
             'aria-label="Sort the board">\n')
    for key, label, on in (("featured", "Featured", True), ("soon", "Starting soon", False),
                           ("fav", "Biggest favourites", False),
                           ("total", "Highest totals", False),
                           ("close", "Closest matches", False),
                           ("league", "By competition", False)):
        b.append('                <button type="button" class="sh-tab sh-view%s" data-view="%s">'
                 '%s</button>\n' % (" is-on" if on else "", key, esc(label)))
    b.append('            </div>\n        </div>\n')

    b.append('        <section class="sh-sec">\n            <div class="sh-sec-head">\n'
             '                <h2>Matchups</h2>\n'
             '                <p id="sh-card-count">%d of %d shown</p>\n'
             '            </div>\n' % (min(FEATURED_ON_LOAD, len(games)), len(games)))
    if games:
        b.append('            <div class="sh-cards" id="sh-cards">\n')
        order = sorted(range(len(games)),
                       key=lambda i: (-games[i]["weight"], games[i]["board"]["commence"] or ""))
        rank = {idx: pos for pos, idx in enumerate(order)}
        for i, g in enumerate(games):
            html = _card(g, i, H)
            if rank[i] >= FEATURED_ON_LOAD:
                html = html.replace('class="sh-card"', 'class="sh-card is-hid"', 1)
            b.append("                " + _with_attrs(html, g) + "\n")
        b.append('            </div>\n')
        b.append('            <button type="button" class="sh-more" id="sh-more">'
                 'Show all %d matchup cards</button>\n' % len(games))
    else:
        b.append('            <p class="sh-empty">No soccer fixtures are on the board right '
                 'now. The page fills in as the next slate is posted and priced.</p>\n')
    b.append('        </section>\n')

    b.append('        <section class="sh-sec">\n            <div class="sh-sec-head">\n'
             '                <h2>Today\'s full soccer board</h2>\n'
             '                <p id="sh-board-count">%d fixtures</p>\n'
             '            </div>\n' % len(games))
    b.append('            <div class="sh-boardwrap"><div class="sh-scroll">\n')
    b.append('            <table class="sh-board">\n'
             '                <thead><tr><th>Fixture</th><th>Competition</th><th>Start (ET)</th>'
             '<th>Moneyline</th><th>Home spread</th><th>Total</th><th>Last 5</th><th></th></tr>'
             '</thead>\n                <tbody id="sh-rows">\n')
    for i, g in enumerate(games):
        b.append("                    " + _with_attrs(_board_row(g, i, H), g) + "\n")
    b.append('                </tbody>\n            </table>\n            </div></div>\n')
    b.append('        </section>\n')

    b.append(extras_html)

    b.append('        <p class="sh-note">Moneylines, spreads, totals, team totals and half '
             'markets are priced from the sportsbook feed. Form, current runs, home and away '
             'records, over/under, both teams to score, clean sheet and head to head numbers '
             'are counted from completed matches and their final scores. Season rates, '
             'expected goals, shots, possession and corners come from the club statistics '
             'feed. Built %s.</p>\n'
             % esc(built_at[:16].replace("T", " ") + " UTC"))
    b.append('    </main>\n')
    b.append('    <div class="sh-modal" id="sh-modal" role="dialog" aria-modal="true" '
             'aria-label="Matchup analysis">\n'
             '        <div class="sh-modal-inner">\n'
             '            <button type="button" class="sh-x" data-shut aria-label="Close">'
             '&times;</button>\n'
             '            <div id="sh-modal-body"></div>\n'
             '        </div>\n    </div>\n')
    b.append('    <script type="application/json" id="sh-data">%s</script>\n'
             % json.dumps([_payload(g, H) for g in games], ensure_ascii=False,
                          separators=(",", ":")).replace("</", "<\\/"))
    b.append(JS % (FEATURED_ON_LOAD, FEATURED_ON_LOAD))
    return "".join(b)


def _with_attrs(html, g):
    """Filter and sort keys, written onto whichever element opens the string."""
    ts = 0
    iso = (g["board"].get("commence") or "")
    try:
        t = datetime.datetime.fromisoformat(iso.replace("Z", "+00:00"))
        ts = int(t.timestamp())
    except (ValueError, TypeError, OSError):
        ts = 0
    pa, ph = g["p_away"], g["p_home"]
    fav = max(pa, ph) if (pa is not None and ph is not None) else 0.0
    close = abs(pa - ph) if (pa is not None and ph is not None) else 9.0
    attrs = (' data-comp="%s" data-ts="%d" data-w="%d" data-fav="%.4f" data-close="%.4f"'
             ' data-tot="%s"'
             % (g["comp_slug"], ts, g["weight"], fav, close,
                ("%g" % float(g["tot_point"])) if g["tot_point"] is not None else "0"))
    cut = html.index(">")
    return html[:cut] + attrs + html[cut:]
