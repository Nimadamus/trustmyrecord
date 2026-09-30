#!/usr/bin/env python3
"""NHL Featured Game of the Day. NHL_FEATURED_GAME_20260929.

Runs in the cloud from .github/workflows/nhl-featured-game.yml every 30
minutes, around the clock. Each run:

  1. reads the league schedule (api-web.nhle.com) and works out the current
     hockey day (Eastern time, rolling over at 5 AM ET so a late West Coast
     game still belongs to the night it was played)
  2. reads standings, both teams' full results, league wide team stats,
     the TMR sportsbook board, Daily Faceoff's
     starting goalie report, ESPN's injury report and the TMR NHL simulator
  3. scores every game on the day and selects the featured game ONCE (a
     selection is sticky; only a postponement moves it)
  4. mints the page URL once, from the matchup and an angle, never a date
  5. rebuilds the page, the archive, the homepage module, the sitemap block
     and the registry entry, writing a file only when its data changed
  6. freezes a finished game: the result goes on the page and nothing else
     about it is rewritten again, so the page stays as a permanent record

A feed that does not answer, or answers with stale data, drops the section it
feeds. Nothing is estimated to fill a layout. The run exits non zero when a
core feed fails, which fails the workflow and raises the alert issue.

    python scripts/nhl_featured_game.py run            normal cloud run
    python scripts/nhl_featured_game.py run --dry      compute, write nothing
    python scripts/nhl_featured_game.py run --now 2026-10-01T15:00:00Z
"""

import argparse
import copy
import datetime as dt
import json
import os
import re
import sys
import unicodedata

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import featured_game_engine as fg  # noqa: E402
import nhl_featured_article as article  # noqa: E402
import nhl_featured_og as og_card  # noqa: E402
import nhl_featured_render as render  # noqa: E402

ROOT = fg.ROOT
SPORT = "nhl"
DATA_DIR = os.path.join(ROOT, "data", "nhl-featured")
STATE = os.path.join(DATA_DIR, "state.json")
LINES = os.path.join(DATA_DIR, "lines.json")
CURRENT = os.path.join(DATA_DIR, "current.json")
VALIDATION = os.path.join(DATA_DIR, "validation.json")
ARCHIVE_URL = "/nhl/featured-games/"
ROLLOVER_HOURS = 5          # the hockey day ends at 5 AM Eastern
FREEZE_AFTER_FINAL_MIN = 30  # one more pass after the final, then frozen
MIN_GP_FOR_CURRENT = 5      # under this, season rates come from last season
ODDS_MAX_AGE_H = 6

NHL = "https://api-web.nhle.com/v1"
NHL_STATS = "https://api.nhle.com/stats/rest/en"
TMR_API = "https://trustmyrecord-api.onrender.com/api"
ESPN_INJ = "https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/injuries"
DFO = "https://www.dailyfaceoff.com/starting-goalies/%s"

FINAL_STATES = ("OFF", "FINAL")
LIVE_STATES = ("LIVE", "CRIT")
BAD_SCHEDULE = ("PPD", "CNCL", "SUSP")

# Home state or province, for the location line. The arena and city come
# from the league feed for every game, neutral sites included.
REGION = {"ANA": "CA", "BOS": "MA", "BUF": "NY", "CGY": "AB", "CAR": "NC", "CHI": "IL", "COL": "CO",
          "CBJ": "OH", "DAL": "TX", "DET": "MI", "EDM": "AB", "FLA": "FL", "LAK": "CA", "MIN": "MN",
          "MTL": "QC", "NSH": "TN", "NJD": "NJ", "NYI": "NY", "NYR": "NY", "OTT": "ON", "PHI": "PA",
          "PIT": "PA", "SJS": "CA", "SEA": "WA", "STL": "MO", "TBL": "FL", "TOR": "ON", "UTA": "UT",
          "VAN": "BC", "VGK": "NV", "WSH": "DC", "WPG": "MB"}
ORIGINAL_SIX = {"BOS", "CHI", "DET", "MTL", "NYR", "TOR"}
RIVALRIES = {
    frozenset(("PIT", "PHI")): "the Battle of Pennsylvania",
    frozenset(("EDM", "CGY")): "the Battle of Alberta",
    frozenset(("NYR", "NYI")): "the Battle of New York",
    frozenset(("TBL", "FLA")): "the Battle of Florida",
    frozenset(("LAK", "ANA")): "the Freeway Face-Off",
    frozenset(("OTT", "TOR")): "the Battle of Ontario",
    frozenset(("BOS", "MTL")): "Bruins and Canadiens, the oldest rivalry in the sport",
    frozenset(("TOR", "MTL")): "Maple Leafs and Canadiens",
    frozenset(("BOS", "TOR")): "Bruins and Maple Leafs",
    frozenset(("NYR", "NJD")): "the Hudson River rivalry",
    frozenset(("NYI", "NJD")): "Islanders and Devils",
    frozenset(("PIT", "WSH")): "Penguins and Capitals",
    frozenset(("NYR", "PHI")): "Rangers and Flyers",
    frozenset(("CHI", "DET")): "Blackhawks and Red Wings",
    frozenset(("CHI", "STL")): "Blackhawks and Blues",
    frozenset(("COL", "DET")): "Avalanche and Red Wings",
    frozenset(("OTT", "MTL")): "Senators and Canadiens",
    frozenset(("BUF", "TOR")): "Sabres and Maple Leafs",
    frozenset(("SJS", "LAK")): "Sharks and Kings",
    frozenset(("SEA", "VAN")): "the Cascadia rivalry",
}
US_MARQUEE_TV = {"TNT", "TRUTV", "ESPN", "ABC", "ESPN2", "HBO MAX"}
CA_MARQUEE_TV = {"CBC", "SN", "SNE", "SNO", "SNP", "SNW", "SN1", "SN360", "TVAS", "CITY"}


def norm(name):
    text = unicodedata.normalize("NFKD", name or "").encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z]", "", text)


def season_label(season_id):
    s = str(season_id)
    return "%s-%s" % (s[:4], s[6:8])


def prev_season(season_id):
    y = int(str(season_id)[:4])
    return int("%d%d" % (y - 1, y))


def hockey_day(now):
    return (now.astimezone(fg.ET) - dt.timedelta(hours=ROLLOVER_HOURS)).date()


# ================================================================== feeds

def nhl_get(src, name, path):
    return src.get(name, NHL + path, browser=True)


def fetch_schedule(src, day):
    """Every game from the day before `day` through six days after it."""
    data = nhl_get(src, "schedule", "/schedule/%s" % (day - dt.timedelta(days=1)).isoformat())
    games = []
    for week in data.get("gameWeek") or []:
        for g in week.get("games") or []:
            if g.get("gameType") not in (2, 3):
                continue
            g = dict(g)
            g["_date"] = week.get("date")
            games.append(g)
    if not games and not data.get("gameWeek"):
        raise fg.FetchError("schedule returned no game weeks")
    return games


def fetch_teams(src):
    """TMR NHL simulator teams: refs for the simulator, colors and logos."""
    data = src.try_get("tmr_teams", TMR_API + "/nhl/public/teams", timeout=60)
    teams = data.get("teams", data) if isinstance(data, dict) else (data or [])
    return {t["abbr"]: t for t in teams if isinstance(t, dict) and t.get("abbr")}


def fetch_standings(src):
    data = nhl_get(src, "standings", "/standings/now")
    out = {}
    for r in data.get("standings") or []:
        ab = (r.get("teamAbbrev") or {}).get("default")
        if ab:
            out[ab] = r
    if len(out) < 30:
        raise fg.FetchError("standings returned %d teams" % len(out))
    return out, data.get("standingsDateTimeUtc")


def fetch_team_stats(src, season_id):
    url = (NHL_STATS + "/team/summary?isAggregate=false&isGame=false&limit=50&start=0"
           "&cayenneExp=gameTypeId=2%%20and%%20seasonId=%d" % season_id)
    data = src.try_get("team_stats_%d" % season_id, url, browser=True) or {}
    return data.get("data") or []


# NHL.com's own team reports behind the advanced stats module: 5 on 5 shot
# attempt shares (Corsi, Fenwick), PDO and zone starts, the real time events,
# and power play and shorthanded volume. A report that does not answer only
# drops its own rows.
EXTRA_REPORTS = ("percentages", "realtime", "powerplay", "penaltykill")


def fetch_team_reports(src, season_id):
    out = {}
    for rep in EXTRA_REPORTS:
        url = (NHL_STATS + "/team/%s?isAggregate=false&isGame=false&limit=50&start=0"
               "&cayenneExp=gameTypeId=2%%20and%%20seasonId=%d" % (rep, season_id))
        data = src.try_get("team_%s_%d" % (rep, season_id), url, browser=True) or {}
        out[rep] = {norm(r.get("teamFullName")): r for r in data.get("data") or []}
    return out


def fetch_club_schedule(src, abbr, season_id):
    data = src.try_get("club_%s_%d" % (abbr, season_id),
                       NHL + "/club-schedule-season/%s/%d" % (abbr, season_id), browser=True) or {}
    return data.get("games") or []


def fetch_board(src):
    url = TMR_API + "/games/board/icehockey_nhl?limit=80"
    data = src.try_get("tmr_board", url, timeout=60)
    if not (data or {}).get("games"):
        import time
        time.sleep(8)
        src.cache.pop(url, None)
        data = src.try_get("tmr_board", url, timeout=60)
    return data or {}


def fetch_dfo(src, day):
    import html as _html
    text = src.try_get("dailyfaceoff_%s" % day.isoformat(), DFO % day.isoformat(), kind="text", browser=True)
    if not text:
        return None
    m = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', text, re.S)
    if not m:
        return None
    try:
        props = json.loads(_html.unescape(m.group(1)) if m.group(1).startswith("&") else m.group(1))["props"]["pageProps"]
    except (ValueError, KeyError):
        return None
    if str(props.get("date") or "")[:10] != day.isoformat():
        return None      # a page for another day is not this day's report
    return props.get("data") or []


def fetch_injuries(src):
    data = src.try_get("espn_injuries", ESPN_INJ)
    out = {}
    for team in (data or {}).get("injuries") or []:
        out[norm(team.get("displayName"))] = team.get("injuries") or []
    return out


# ================================================================== derive

def team_name(g, side):
    t = g[side]
    place = (t.get("placeName") or {}).get("default", "")
    common = (t.get("commonName") or {}).get("default", "")
    return ("%s %s" % (place, common)).strip(), common


def result_rows(games, abbr, season_id=None, types=(2,)):
    """Completed games for `abbr`, oldest first, with the result from its side."""
    rows = []
    for g in games:
        if g.get("gameType") not in types or g.get("gameState") not in FINAL_STATES:
            continue
        if season_id and g.get("season") != season_id:
            continue
        home = g["homeTeam"]["abbrev"] == abbr
        me = g["homeTeam"] if home else g["awayTeam"]
        op = g["awayTeam"] if home else g["homeTeam"]
        if me.get("score") is None or op.get("score") is None:
            continue
        last = ((g.get("gameOutcome") or {}).get("lastPeriodType") or "REG")
        gf, ga = int(me["score"]), int(op["score"])
        res = "W" if gf > ga else ("OTL" if last in ("OT", "SO") else "L")
        rows.append({"id": g["id"], "date": g.get("gameDate"), "season": g.get("season"), "type": g.get("gameType"),
                     "home": home, "opp": op["abbrev"], "gf": gf, "ga": ga, "res": res, "ended": last,
                     "start": g.get("startTimeUTC")})
    rows.sort(key=lambda r: (r["date"] or "", r["id"]))
    return rows


def record(rows):
    w = sum(1 for r in rows if r["res"] == "W")
    l = sum(1 for r in rows if r["res"] == "L")
    o = sum(1 for r in rows if r["res"] == "OTL")
    return {"w": w, "l": l, "otl": o, "gp": len(rows), "pts": 2 * w + o,
            "text": "%d-%d-%d" % (w, l, o), "gf": sum(r["gf"] for r in rows), "ga": sum(r["ga"] for r in rows)}


def playoff_line(rows):
    """Playoff games have no overtime loss column: a loss is a loss."""
    if not rows:
        return None
    w = sum(1 for r in rows if r["res"] == "W")
    series = []
    for r in rows:
        if not series or series[-1]["opp"] != r["opp"]:
            series.append({"opp": r["opp"], "w": 0, "l": 0})
        series[-1]["w" if r["res"] == "W" else "l"] += 1
    for s in series:
        s["result"] = "won" if s["w"] == 4 else "lost" if s["l"] == 4 else None
    return {"gp": len(rows), "w": w, "l": len(rows) - w, "text": "%d-%d" % (w, len(rows) - w), "series": series}


def streak(rows):
    if not rows:
        return None
    kind = rows[-1]["res"]
    n = 0
    for r in reversed(rows):
        if r["res"] != kind:
            break
        n += 1
    return {"kind": kind, "n": n, "text": "%s%d" % ({"W": "W", "L": "L", "OTL": "OT"}[kind], n)}


def rest_info(rows_all_types, game_date):
    """Days since the club's previous game (regular season or playoff)."""
    before = [r for r in rows_all_types if (r["date"] or "") < game_date]
    if not before:
        return {"days": None, "b2b": False, "last": None}
    last = before[-1]
    gap = (dt.date.fromisoformat(game_date) - dt.date.fromisoformat(last["date"])).days
    return {"days": gap - 1, "b2b": gap == 1, "last": last}


def b2b_record(rows):
    """Record in the second game of back to backs, from a season of results."""
    out = []
    for prev, cur in zip(rows, rows[1:]):
        if prev["date"] and cur["date"] and \
                (dt.date.fromisoformat(cur["date"]) - dt.date.fromisoformat(prev["date"])).days == 1:
            out.append(cur)
    return record(out) if out else None


def stat_row(rows, abbr, names):
    """Pick this club's row from a league table keyed by full name."""
    want = norm(names.get(abbr, ""))
    for r in rows:
        if norm(r.get("teamFullName")) == want:
            return r
    return None


def _r(v, digits=5):
    try:
        return round(float(v), digits)
    except (TypeError, ValueError):
        return None


def league_table(rows, names, extra=None):
    """Derived per game rates for all 32 clubs, keyed by abbreviation."""
    by_norm = {norm(v): k for k, v in names.items()}
    extra = extra or {}
    out = []
    for r in rows:
        ab = by_norm.get(norm(r.get("teamFullName")))
        gp = r.get("gamesPlayed") or 0
        if not ab or not gp:
            continue
        sf = (r.get("shotsForPerGame") or 0) * gp
        sa = (r.get("shotsAgainstPerGame") or 0) * gp
        gf, ga = r.get("goalsFor") or 0, r.get("goalsAgainst") or 0
        row = {"_team": ab, "gp": gp, "gfpg": r.get("goalsForPerGame"), "gapg": r.get("goalsAgainstPerGame"),
               "sfpg": r.get("shotsForPerGame"), "sapg": r.get("shotsAgainstPerGame"),
               "shpct": round(gf / sf, 5) if sf else None, "svpct": round(1 - ga / sa, 5) if sa else None,
               "pp": r.get("powerPlayPct"), "pk": r.get("penaltyKillPct"), "fo": r.get("faceoffWinPct"),
               "gdpg": round((gf - ga) / gp, 4), "sdpg": round((sf - sa) / gp, 4), "ptpct": r.get("pointPct"),
               "record": "%s-%s-%s" % (r.get("wins"), r.get("losses"), r.get("otLosses")),
               "points": r.get("points")}
        key = norm(r.get("teamFullName"))
        pc = (extra.get("percentages") or {}).get(key) or {}
        rt = (extra.get("realtime") or {}).get(key) or {}
        pp = (extra.get("powerplay") or {}).get(key) or {}
        pk = (extra.get("penaltykill") or {}).get(key) or {}
        row.update({
            "cf": _r(pc.get("satPct")), "ff": _r(pc.get("usatPct")), "cf_close": _r(pc.get("satPctClose")),
            "gf5": _r(pc.get("goalsForPct")), "pdo": _r(pc.get("shootingPlusSavePct5v5")),
            "sh5": _r(pc.get("shootingPct5v5")), "sv5": _r(pc.get("savePct5v5")), "zs": _r(pc.get("zoneStartPct5v5")),
            "hits60": _r(rt.get("hitsPer60"), 2), "blk60": _r(rt.get("blockedShotsPer60"), 2),
            "tk60": _r(rt.get("takeawaysPer60"), 2), "gv60": _r(rt.get("giveawaysPer60"), 2),
            "ppo": _r(pp.get("ppOpportunitiesPerGame"), 3), "tsh": _r(pk.get("timesShorthandedPerGame"), 3),
        })
        out.append({k: v for k, v in row.items() if v is not None or k in ("shpct", "svpct")})
    return out


STAT_DIRECTION = {"gfpg": True, "gapg": False, "sfpg": True, "sapg": False, "shpct": True, "svpct": True,
                  "pp": True, "pk": True, "fo": True, "gdpg": True, "sdpg": True, "ptpct": True,
                  "cf": True, "ff": True, "cf_close": True, "gf5": True, "pdo": True, "sh5": True, "sv5": True,
                  "zs": True, "hits60": True, "blk60": True, "tk60": True, "gv60": False, "ppo": True, "tsh": False}


def with_ranks(table):
    ranks = {k: fg.rank_map(table, k, hib) for k, hib in STAT_DIRECTION.items()}
    out = {}
    for r in table:
        row = dict(r)
        row["rank"] = {k: ranks[k].get(r["_team"]) for k in ranks if r.get(k) is not None}
        out[r["_team"]] = row
    return out


# ================================================================== odds

def board_match(board, away_name, home_name, start_utc):
    start = fg.parse_utc(start_utc)
    for b in board.get("games") or []:
        if norm(b.get("away_team")) == norm(away_name) and norm(b.get("home_team")) == norm(home_name):
            k = fg.parse_utc(b.get("commence_time"))
            if k and start and abs((k - start).total_seconds()) <= 4 * 3600:
                return b
    return None


def markets(b, away_name, home_name):
    """First book carrying each market, named, never an average."""
    out = {"book": None, "ml": {}, "pl": {}, "total": {}, "updated": b.get("updated_at")}
    for book in b.get("bookmakers") or []:
        for m in book.get("markets") or []:
            key, outs = m.get("key"), m.get("outcomes") or []
            if key == "h2h" and not out["ml"]:
                for o in outs:
                    side = "away" if norm(o.get("name")) == norm(away_name) else "home" if norm(o.get("name")) == norm(home_name) else None
                    if side:
                        out["ml"][side] = o.get("price")
                out["book"] = out["book"] or book.get("title")
            elif key == "spreads" and not out["pl"]:
                for o in outs:
                    side = "away" if norm(o.get("name")) == norm(away_name) else "home" if norm(o.get("name")) == norm(home_name) else None
                    if side:
                        out["pl"][side] = {"point": o.get("point"), "price": o.get("price")}
                out["book"] = out["book"] or book.get("title")
            elif key == "totals" and not out["total"]:
                for o in outs:
                    nm = (o.get("name") or "").lower()
                    if nm in ("over", "under"):
                        out["total"]["point"] = o.get("point")
                        out["total"][nm] = o.get("price")
                out["book"] = out["book"] or book.get("title")
    if len(out["ml"]) < 2:
        out["ml"] = {}
    if len(out["pl"]) < 2:
        out["pl"] = {}
    if "point" not in out["total"]:
        out["total"] = {}
    return out


def snapshot_lines(lines, games, board, now):
    """Track every NHL game on the board: first line TMR saw, latest line,
    the last pregame line (closing on our board) and the final score. This
    is what opening versus current and every over/under trend is built from,
    so it never estimates a line it did not see."""
    changed = False
    for g in games:
        gid = str(g["id"])
        away_name, _ = team_name(g, "awayTeam")
        home_name, _ = team_name(g, "homeTeam")
        start = fg.parse_utc(g.get("startTimeUTC"))
        rec = lines.get(gid)
        if g.get("gameState") in FINAL_STATES and rec and not rec.get("final"):
            a, h = g["awayTeam"].get("score"), g["homeTeam"].get("score")
            if a is not None and h is not None:
                rec["final"] = {"away": int(a), "home": int(h),
                                "ended": ((g.get("gameOutcome") or {}).get("lastPeriodType") or "REG")}
                changed = True
            continue
        if g.get("gameState") not in ("FUT", "PRE") or not start or now >= start:
            continue
        b = board_match(board, away_name, home_name, g.get("startTimeUTC"))
        if not b or board.get("stale"):
            continue
        mk = markets(b, away_name, home_name)
        if not (mk["ml"] or mk["total"]):
            continue
        snap = {"at": fg.iso(now), "book": mk["book"], "ml": mk["ml"], "pl": mk["pl"], "total": mk["total"]}
        if rec is None:
            rec = lines[gid] = {"away": g["awayTeam"]["abbrev"], "home": g["homeTeam"]["abbrev"],
                                "date": g.get("_date") or g.get("gameDate"), "start": g.get("startTimeUTC"),
                                "season": g.get("season"), "first": snap, "moves": []}
            changed = True
        last = rec.get("last") or rec["first"]
        sig = lambda s: json.dumps([s.get("ml"), s.get("pl"), s.get("total")], sort_keys=True)
        if sig(last) != sig(snap):
            rec["moves"].append(snap)
            del rec["moves"][:-24]
            changed = True
        if sig(rec.get("last") or {}) != sig(snap):
            rec["last"] = snap          # the latest DISTINCT price; unchanged prices write nothing
            changed = True
    return changed


def ou_record(lines, abbr, season_id, venue=None):
    """Over/under record from the last pregame total TMR's board carried."""
    o = u = p = 0
    for rec in lines.values():
        if rec.get("season") != season_id or not rec.get("final") or abbr not in (rec.get("away"), rec.get("home")):
            continue
        if venue == "home" and rec.get("home") != abbr or venue == "away" and rec.get("away") != abbr:
            continue
        tot = ((rec.get("last") or rec.get("first") or {}).get("total") or {}).get("point")
        if tot is None:
            continue
        # The league's final score already credits the shootout winner with
        # one goal, which is how books grade a total, so no adjustment here.
        goals = rec["final"]["away"] + rec["final"]["home"]
        if goals > tot:
            o += 1
        elif goals < tot:
            u += 1
        else:
            p += 1
    n = o + u + p
    return {"over": o, "under": u, "push": p, "n": n} if n else None


# ================================================================== goalies

GOALIE_STATUS = {"Confirmed": "confirmed", "Likely": "expected"}


def dfo_for_game(dfo_rows, away_name, home_name):
    for r in dfo_rows or []:
        if norm(r.get("awayTeamName")) == norm(away_name) and norm(r.get("homeTeamName")) == norm(home_name):
            return r
    return None


def roster_ids(src, abbr):
    """Player ids on the club's current NHL roster, or None when the roster
    feed does not answer (every roster check then fails closed)."""
    data = src.try_get("roster_%s" % abbr, NHL + "/roster/%s/current" % abbr, browser=True)
    if not data:
        return None
    ids = {p.get("id") for grp in ("forwards", "defensemen", "goalies") for p in data.get(grp) or []}
    return ids if len(ids) >= 15 else None


def roster_goalies(src, abbr):
    data = src.try_get("roster_%s" % abbr, NHL + "/roster/%s/current" % abbr, browser=True) or {}
    out = []
    for p in data.get("goalies") or []:
        out.append({"id": p.get("id"), "name": "%s %s" % ((p.get("firstName") or {}).get("default", ""),
                                                        (p.get("lastName") or {}).get("default", "")),
                    "last": (p.get("lastName") or {}).get("default", ""), "headshot": p.get("headshot")})
    return out


def match_goalie(name, roster):
    n = norm(name)
    for g in roster:
        if norm(g["name"]) == n:
            return g
    last = norm((name or "").split(" ")[-1])
    hits = [g for g in roster if norm(g["last"]) == last]
    return hits[0] if len(hits) == 1 else None


def _toi_min(toi):
    try:
        m, s = str(toi).split(":")
        return int(m) + int(s) / 60.0
    except ValueError:
        return 0.0


def goalie_line(rows):
    """GP, record, SV%, GAA, shutouts from game log rows."""
    if not rows:
        return None
    sa = sum(r.get("shotsAgainst") or 0 for r in rows)
    ga = sum(r.get("goalsAgainst") or 0 for r in rows)
    mins = sum(_toi_min(r.get("toi")) for r in rows)
    w = sum(1 for r in rows if r.get("decision") == "W")
    l = sum(1 for r in rows if r.get("decision") == "L")
    o = sum(1 for r in rows if r.get("decision") == "O")
    # Rounded so a float summed on another Python build (3.12 compensates
    # float sums) does not register as new data.
    return {"gp": len(rows), "record": "%d-%d-%d" % (w, l, o), "sv": round(1 - ga / sa, 5) if sa else None,
            "gaa": round(ga * 60.0 / mins, 4) if mins else None, "so": sum(1 for r in rows if r.get("shutouts")),
            "ga": ga, "sa": sa}


def goalie_profile(src, pid, opp, season_id):
    landing = src.try_get("goalie_%s" % pid, NHL + "/player/%s/landing" % pid, browser=True)
    if not landing:
        return None
    logs = {}
    for sid in (season_id, prev_season(season_id), prev_season(prev_season(season_id))):
        data = src.try_get("goalie_log_%s_%d" % (pid, sid), NHL + "/player/%s/game-log/%d/2" % (pid, sid),
                           browser=True) or {}
        logs[sid] = sorted(data.get("gameLog") or [], key=lambda r: r.get("gameDate") or "", reverse=True)
    cur, prev = logs[season_id], logs[prev_season(season_id)]
    basis_sid = season_id if len(cur) >= 3 else prev_season(season_id)
    basis_rows = logs[basis_sid]
    recent = (cur + prev)[:5]
    vs = [r for sid in logs for r in logs[sid] if r.get("opponentAbbrev") == opp]
    career = ((landing.get("careerTotals") or {}).get("regularSeason") or {})
    return {
        "id": pid,
        "name": "%s %s" % ((landing.get("firstName") or {}).get("default", ""),
                           (landing.get("lastName") or {}).get("default", "")),
        "last_name": (landing.get("lastName") or {}).get("default", ""),
        "headshot": landing.get("headshot"),
        "catches": landing.get("shootsCatches"),
        "current": goalie_line(cur),
        "current_label": season_label(season_id),
        "last_season": goalie_line(prev),
        "last_label": season_label(prev_season(season_id)),
        "career": {"gp": career.get("gamesPlayed"), "sv": career.get("savePctg"),
                   "gaa": career.get("goalsAgainstAvg"), "so": career.get("shutouts"),
                   "record": "%s-%s-%s" % (career.get("wins"), career.get("losses"), career.get("otLosses"))}
        if career.get("gamesPlayed") else None,
        "recent": [{"date": r.get("gameDate"), "opp": r.get("opponentAbbrev"), "ha": r.get("homeRoadFlag"),
                    "dec": r.get("decision") or "ND", "ga": r.get("goalsAgainst"), "sa": r.get("shotsAgainst"),
                    "sv": r.get("savePctg")} for r in recent],
        "home": goalie_line([r for r in basis_rows if r.get("homeRoadFlag") == "H"]),
        "road": goalie_line([r for r in basis_rows if r.get("homeRoadFlag") == "R"]),
        "split_label": season_label(basis_sid),
        "vs": goalie_line(vs),
        "vs_span": "%s through %s" % (season_label(prev_season(prev_season(season_id))), season_label(season_id)),
    }


def resolve_goalies(src, g, dfo_rows, season_id):
    """{'away': {...}, 'home': {...}} with status confirmed, expected or unknown.
    Only Daily Faceoff's Confirmed and Likely reports name a starter. Their
    default depth chart projection is not a report, so it names nobody."""
    away_name, _ = team_name(g, "awayTeam")
    home_name, _ = team_name(g, "homeTeam")
    row = dfo_for_game(dfo_rows, away_name, home_name)
    out = {}
    for side, other in (("away", "home"), ("home", "away")):
        abbr = g["%sTeam" % side]["abbrev"]
        opp = g["%sTeam" % other]["abbrev"]
        roster = roster_goalies(src, abbr)
        entry = {"status": "unknown", "source": None, "reported_at": None, "profile": None, "roster": []}
        strength = row.get("%sNewsStrengthName" % side) if row else None
        name = row.get("%sGoalieName" % side) if row else None
        status = GOALIE_STATUS.get(strength or "")
        hit = match_goalie(name, roster) if status and name else None
        if status and name and not hit:
            # A reported starter who is not on the club's current roster is a
            # bad report (or a stale one): nobody is named on the page.
            entry["issue"] = "%s reported as the %s starter but is not on the current roster" % (name, abbr)
            status = None
        if status and name:
            via = row.get("%sNewsSourceName" % side)
            entry.update({"status": status, "name": name,
                          "source": "Daily Faceoff" + (", citing %s" % via if via else ""),
                          "reported_at": row.get("%sNewsCreatedAt" % side)})
            entry["profile"] = goalie_profile(src, hit["id"], opp, season_id)
        if entry["status"] == "unknown":
            for rg in roster[:3]:
                prof = goalie_profile(src, rg["id"], opp, season_id)
                if prof:
                    entry["roster"].append(prof)
        out[side] = entry
    return out


# ================================================================== selection

def team_quality(abbr, standings, prev_table):
    """Points percentage: this season once a club has played ten games, a
    blend from five, last season's before that."""
    st = standings.get(abbr) or {}
    gp = st.get("gamesPlayed") or 0
    if gp >= 10:
        return st.get("pointPctg"), "current"
    prev = prev_table.get(abbr) or {}
    if prev.get("ptpct") is not None:
        cur = st.get("pointPctg") if gp else None
        if cur is not None and gp >= 5:
            w = gp / 10.0
            return w * cur + (1 - w) * prev["ptpct"], "blend"
        return prev["ptpct"], "last"
    return st.get("pointPctg"), "current"


def _leaders(landing, category="points"):
    out = {}
    for lead in (((landing or {}).get("matchup") or {}).get("skaterComparison") or {}).get("leaders") or []:
        if lead.get("category") == category:
            for side in ("away", "home"):
                p = lead.get("%sLeader" % side) or {}
                if p.get("value") is not None:
                    out[side] = {"first": (p.get("firstName") or {}).get("default", ""),
                                 "last": (p.get("lastName") or {}).get("default", ""),
                                 "value": p.get("value"), "pos": p.get("positionCode"),
                                 "headshot": p.get("headshot"), "id": p.get("playerId")}
    return out


def _skater_line(s):
    """A season line from a stats row (game center or player landing)."""
    if not s or not s.get("gamesPlayed"):
        return None
    return {"gp": s.get("gamesPlayed"), "g": s.get("goals"), "a": s.get("assists"), "pts": s.get("points"),
            "pm": s.get("plusMinus"), "ppg": s.get("powerPlayGoals"), "ppp": s.get("powerPlayPoints"),
            "shots": s.get("shots"), "shpct": _r(s.get("shootingPctg"), 4), "toi": s.get("avgTimeOnIce"),
            "gwg": s.get("gameWinningGoals")}


def key_players(src, g, landing, cur_sid):
    """Two players per club to feature: the club's top two scorers in the
    game center's comparison season, kept only while they are on the club's
    current roster (and the league's own player record agrees)."""
    m = ((landing or {}).get("matchup") or {}).get("skaterSeasonStats") or {}
    ctx_sid = m.get("contextSeason")
    out, issues = {}, []
    for side in ("away", "home"):
        abbr = g["%sTeam" % side]["abbrev"]
        tid = ((landing or {}).get("%sTeam" % side) or {}).get("id")
        ids = roster_ids(src, abbr)
        if not tid or not ids:
            issues.append("key players for %s skipped: roster or game center unavailable" % abbr)
            continue
        pool = [s for s in m.get("skaters") or [] if s.get("teamId") == tid]
        pool.sort(key=lambda s: (-(s.get("points") or 0), -(s.get("goals") or 0), s.get("playerId") or 0))
        picked = []
        for s in pool:
            if len(picked) == 2:
                break
            pid = s.get("playerId")
            if pid not in ids:
                issues.append("%s player %s not on the current roster, not featured" % (abbr, pid))
                continue
            land = src.try_get("player_%s" % pid, NHL + "/player/%s/landing" % pid, browser=True)
            if not land or land.get("currentTeamAbbrev") != abbr or not land.get("isActive", True):
                issues.append("%s player %s: league record does not place him on the club" % (abbr, pid))
                continue
            first = (land.get("firstName") or {}).get("default", "")
            last = (land.get("lastName") or {}).get("default", "")
            fs = land.get("featuredStats") or {}
            cur_line = None
            if fs.get("season") == cur_sid:
                cur_line = _skater_line(((fs.get("regularSeason") or {}).get("subSeason")))
            season = _skater_line(s)
            if season and fs.get("season") == ctx_sid:
                # the landing's line for the same season adds power play points
                sub = _skater_line(((fs.get("regularSeason") or {}).get("subSeason"))) or {}
                if sub.get("gp") == season["gp"] and sub.get("pts") == season["pts"]:
                    season["ppp"] = sub.get("ppp")
            career = _skater_line((land.get("careerTotals") or {}).get("regularSeason"))
            last5 = [{"date": r.get("gameDate"), "opp": r.get("opponentAbbrev"), "ha": r.get("homeRoadFlag"),
                      "g": r.get("goals"), "a": r.get("assists"), "pts": r.get("points"), "shots": r.get("shots"),
                      "toi": r.get("toi"), "playoff": r.get("gameTypeId") == 3}
                     for r in (land.get("last5Games") or [])[:5]]
            picked.append({
                "id": pid, "name": ("%s %s" % (first, last)).strip(), "first": first, "last": last,
                "num": land.get("sweaterNumber") or s.get("sweaterNumber"), "pos": land.get("position") or s.get("position"),
                "headshot": land.get("headshot"), "season_label": season_label(ctx_sid) if ctx_sid else None,
                "season": season, "current": cur_line, "current_label": season_label(cur_sid),
                "career": career, "last5": last5,
            })
        out[side] = picked
    return out, issues


def score_game(g, standings, prev_table, landing, mk, goalies=None):
    a, h = g["awayTeam"]["abbrev"], g["homeTeam"]["abbrev"]
    sa, sh = standings.get(a) or {}, standings.get(h) or {}
    factors = []

    def add(label, pts, detail):
        if pts and pts > 0.05:
            factors.append({"label": label, "points": round(pts, 1), "detail": detail})

    qa, ba = team_quality(a, standings, prev_table)
    qh, bh = team_quality(h, standings, prev_table)
    if qa is not None and qh is not None:
        basis = ("points percentage this season" if ba == bh == "current" else
                 "points percentage from last season" if ba == bh == "last" else "points percentage")
        add("Team quality", 80 * max(0.0, (qa + qh) / 2 - 0.40), "Combined %s of %.3f" % (basis, (qa + qh) / 2))
        add("Two good teams", 40 * max(0.0, min(qa, qh) - 0.50),
            "Even the weaker side sits at %.3f" % min(qa, qh))
    if (sa.get("gamesPlayed") or 0) >= 5 and (sh.get("gamesPlayed") or 0) >= 5:
        l10 = [(s.get("l10Points") or 0) / (2.0 * s["l10GamesPlayed"]) for s in (sa, sh) if s.get("l10GamesPlayed")]
        if len(l10) == 2:
            add("Recent form", 8 * sum(l10) / 2, "Combined points rate over the last ten of %.3f" % (sum(l10) / 2))
    if sa.get("divisionName") and sa.get("divisionName") == sh.get("divisionName"):
        add("Division game", 6, "Both clubs play in the %s Division" % sa["divisionName"])
    elif sa.get("conferenceName") and sa.get("conferenceName") == sh.get("conferenceName"):
        add("Conference game", 3, "Both clubs play in the %s Conference" % sa["conferenceName"])
    riv = RIVALRIES.get(frozenset((a, h)))
    if riv:
        add("Rivalry", 10, riv[0].upper() + riv[1:])
    if a in ORIGINAL_SIX and h in ORIGINAL_SIX:
        add("Original Six", 4, "Two Original Six clubs")
    stars = _leaders(landing)
    if len(stars) == 2:
        pts = sum(min(6.0, max(0.0, ((p["value"] or 0) - 70) / 8.0)) for p in stars.values())
        add("Star power", pts, "%s %s (%s points) and %s %s (%s points), last season" % (
            stars["away"]["first"], stars["away"]["last"], stars["away"]["value"],
            stars["home"]["first"], stars["home"]["last"], stars["home"]["value"]))
    if goalies:
        both = [goalies[s] for s in ("away", "home")
                if goalies[s]["status"] in ("confirmed", "expected") and goalies[s].get("profile")]
        svs = [(x["profile"].get("last_season") or {}).get("sv") for x in both]
        if len(both) == 2 and all(v and v >= 0.905 for v in svs):
            add("Goalie matchup", 4, "Two named starters who both saved at least .905 last season")
    if mk and mk.get("ml"):
        ih, ia = fg.implied(mk["ml"].get("home")), fg.implied(mk["ml"].get("away"))
        if ih and ia:
            fair = ih / (ih + ia)
            add("Betting interest", 5 * max(0.0, 1 - abs(fair - 0.5) / 0.2),
                "The moneyline makes it close to a coin flip (home side %.1f%% with the margin removed)" % (fair * 100))
    nets = [(b.get("network") or "").upper() for b in g.get("tvBroadcasts") or [] if b.get("market") == "N"]
    us = sorted({n for n in nets if n in US_MARQUEE_TV})
    ca = sorted({n for n in nets if n in CA_MARQUEE_TV})
    if us:
        add("National TV", 8, "National US broadcast on %s" % ", ".join(us))
    elif ca:
        add("National TV", 4, "National Canadian broadcast on %s" % ", ".join(ca))
    gp_all = [s.get("gamesPlayed") or 0 for s in standings.values()]
    if gp_all and sum(gp_all) / len(gp_all) >= 46:
        for ab, s in ((a, sa), (h, sh)):
            conf = sorted([x for x in standings.values() if x.get("conferenceName") == s.get("conferenceName")],
                          key=lambda x: x.get("conferenceSequence") or 99)
            if len(conf) >= 9 and abs((s.get("points") or 0) - (conf[7].get("points") or 0)) <= 5:
                add("Playoff race", 5, "the %s sit within five points of the %s Conference's eighth spot"
                    % ((s.get("teamCommonName") or {}).get("default", ab), s.get("conferenceName")))
    if sh and (sh.get("homeGamesPlayed") or 0) == 0:
        add("Home opener", 3, "First home game of the season for the %s" % team_name(g, "homeTeam")[1])
    return round(sum(f["points"] for f in factors), 1), factors


def choose(games, day, standings, prev_table, landings, board):
    """The strongest game on `day`. Games already under way only count when
    nothing on the day has yet to start."""
    todays = [g for g in games if g.get("_date") == day.isoformat() and g.get("gameScheduleState") == "OK"]
    if not todays:
        return None, []
    pending = [g for g in todays if g.get("gameState") in ("FUT", "PRE")]
    scored = []
    for g in (pending or todays):
        an, _ = team_name(g, "awayTeam")
        hn, _ = team_name(g, "homeTeam")
        b = board_match(board, an, hn, g.get("startTimeUTC"))
        mk = markets(b, an, hn) if b else None
        s, f = score_game(g, standings, prev_table, landings.get(g["id"]), mk)
        scored.append((s, g.get("startTimeUTC") or "", g, f))
    scored.sort(key=lambda x: (-x[0], x[1]))
    board_view = [{"id": x[2]["id"], "matchup": "%s at %s" % (x[2]["awayTeam"]["abbrev"], x[2]["homeTeam"]["abbrev"]),
                   "score": x[0]} for x in scored]
    return scored[0], board_view


# ================================================================== URL

def mint_slug(g, landing, state, meeting_n):
    """nhl/<away>-<home>-<angle>, minted once per game. Words only: the two
    clubs' top scorers, then the meeting of the season, then fallbacks."""
    _, ac = team_name(g, "awayTeam")
    _, hc = team_name(g, "homeTeam")
    base = "%s-%s" % (fg.slugify(ac), fg.slugify(hc))
    taken = {v.get("slug") for v in (state.get("games") or {}).values()}
    stars = _leaders(landing)
    duel = None
    if len(stars) == 2 and stars["away"]["last"] and stars["home"]["last"]:
        duel = "%s-vs-%s" % (fg.slugify(stars["away"]["last"]), fg.slugify(stars["home"]["last"]))
    word = fg.ORDINAL_WORDS[meeting_n - 1] if 1 <= meeting_n <= len(fg.ORDINAL_WORDS) else None
    angles = [a for a in (duel, word and "%s-meeting" % word, duel and word and "%s-%s-meeting" % (duel, word))
              if a]
    angles += ["preview-and-prediction", "stats-and-trends", "betting-preview"]
    for angle in angles:
        slug = "%s-%s" % (base, angle)
        if re.search(r"\d", slug) or slug in taken:
            continue
        path = os.path.join(ROOT, "nhl", slug, "index.html")
        if os.path.exists(path):
            with open(path, encoding="utf-8") as fh:
                if ("nhl-featured-game:%s" % g["id"]) not in fh.read(6000):
                    continue
        return slug
    return None


# ================================================================== context

def side_block(src, g, side, standings, names, tmr_teams, cur_sid, sched):
    t = g["%sTeam" % side]
    abbr = t["abbrev"]
    full, common = team_name(g, "%sTeam" % side)
    st = standings.get(abbr) or {}
    tt = tmr_teams.get(abbr) or {}
    cur = result_rows(sched[abbr][cur_sid], abbr, cur_sid, (2,))
    game_date = g.get("_date") or g.get("gameDate")
    cur = [r for r in cur if (r["date"] or "") < game_date or (r["id"] != g["id"] and (r["date"] or "") <= game_date)]
    cur = [r for r in cur if r["id"] != g["id"]]
    every = result_rows(sched[abbr][cur_sid], abbr, cur_sid, (2, 3))
    prev_rows = result_rows(sched[abbr][prev_season(cur_sid)], abbr, prev_season(cur_sid), (2,))
    rec = record(cur)
    last10 = cur[-10:]
    return {
        "abbr": abbr, "name": full, "common": common, "place": (t.get("placeName") or {}).get("default", ""),
        "logo": tt.get("logo") or t.get("darkLogo") or t.get("logo"),
        "color": tt.get("color") or "#1D7FE8", "alt_color": tt.get("altColor"),
        "ref": tt.get("ref"),
        "record": rec,
        "home_rec": record([r for r in cur if r["home"]]),
        "road_rec": record([r for r in cur if not r["home"]]),
        "last5": record(cur[-5:]) if cur else None,
        "last10": record(last10) if cur else None,
        "games5": cur[-5:],
        "games10": last10,
        "streak": streak(cur),
        "rest": rest_info(every, game_date),
        "prev": {"record": record(prev_rows), "home": record([r for r in prev_rows if r["home"]]),
                 "road": record([r for r in prev_rows if not r["home"]]), "b2b": b2b_record(prev_rows),
                 "last10": record(prev_rows[-10:]), "last5": record(prev_rows[-5:]),
                 "games10": prev_rows[-10:], "games5": prev_rows[-5:], "streak": streak(prev_rows),
                 "playoffs": playoff_line(result_rows(sched[abbr][prev_season(cur_sid)], abbr, prev_season(cur_sid), (3,))),
                 "label": season_label(prev_season(cur_sid))} if prev_rows else None,
        "b2b_cur": b2b_record(cur),
        "standing": {
            "division": st.get("divisionName"), "division_rank": st.get("divisionSequence"),
            "conference": st.get("conferenceName"), "conference_rank": st.get("conferenceSequence"),
            "league_rank": st.get("leagueSequence"), "points": st.get("points"), "gp": st.get("gamesPlayed"),
            "pt_pct": st.get("pointPctg"), "wildcard": st.get("wildcardSequence"),
            "as_of": st.get("date"),
        },
        "slug": fg.slugify(full),
    }


def h2h_rows(sched, a, h, cur_sid, game_id):
    rows = []
    for sid in sched[a]:
        for r in result_rows(sched[a][sid], a, sid, (2, 3)):
            if r["opp"] == h and r["id"] != game_id:
                rows.append(r)
    rows.sort(key=lambda r: (r["date"] or "", r["id"]), reverse=True)
    return [{"date": r["date"], "season": season_label(r["season"]), "playoff": r["type"] == 3,
             "home_abbr": a if r["home"] else h, "away_abbr": h if r["home"] else a,
             "a_goals": r["gf"], "h_goals": r["ga"], "winner": a if r["gf"] > r["ga"] else h,
             "ended": r["ended"], "total": r["gf"] + r["ga"]} for r in rows]


def meeting_number(sched, a, h, cur_sid, g):
    n = 0
    for x in sched[a][cur_sid]:
        if x.get("gameType") != 2:
            continue
        opp = x["homeTeam"]["abbrev"] if x["awayTeam"]["abbrev"] == a else x["awayTeam"]["abbrev"]
        if opp == h and (x.get("startTimeUTC") or "") <= (g.get("startTimeUTC") or ""):
            n += 1
    return n or 1


def stat_side(table, abbr):
    row = table.get(abbr)
    return row


def run_model(src, away, home, goalies, game_id):
    if not away.get("ref") or not home.get("ref"):
        return None
    q = "home=%s&away=%s&sims=10000&seed=%d" % (home["ref"], away["ref"], int(game_id) % 100000)
    named = {}
    for side in ("home", "away"):
        gl = goalies.get(side) or {}
        if gl.get("status") in ("confirmed", "expected") and (gl.get("profile") or {}).get("id"):
            q += "&%sGoalie=%s" % (side, gl["profile"]["id"])
            named[side] = gl["profile"]["name"]
    data = src.try_get("tmr_nhl_model", TMR_API + "/nhl/public/simulate?" + q, timeout=60)
    if not data or not data.get("projection"):
        return None
    p = data["projection"]
    sg = (data.get("matchup") or {}).get("starting_goalies") or {}
    return {"win": p.get("win_probability"), "score": p.get("projected_score"), "total": p.get("total"),
            "puckline": p.get("puckline"), "ot": p.get("overtime_share"), "so": p.get("shootout_share"),
            "sims": (data.get("meta") or {}).get("simulations"), "version": data.get("model_version"),
            "stats_season": (data.get("meta") or {}).get("stats_season"),
            "goalies": {s: (sg.get(s) or {}).get("name") for s in ("home", "away")}, "named_goalies": named,
            "drivers": [d for d in data.get("drivers") or [] if isinstance(d, dict)][:5]}


def injuries_for(inj, full):
    rows = []
    for e in inj.get(norm(full)) or []:
        ath = e.get("athlete") or {}
        det = e.get("details") or {}
        rows.append({"name": ath.get("displayName"), "pos": (ath.get("position") or {}).get("abbreviation"),
                     "status": e.get("status"), "type": det.get("type"), "return": det.get("returnDate"),
                     "date": (e.get("date") or "")[:10]})
    order = {"Out": 0, "Injured Reserve": 1, "Long Term Injured Reserve": 1, "Day-To-Day": 2}
    rows.sort(key=lambda r: (order.get(r["status"], 3), r["name"] or ""))
    return rows


def the(t, cap=False):
    """'the Canucks'. NHL club names read as plurals, so every sentence that
    names a club takes a plural verb: the Canucks are, the Wild have."""
    s = "the %s" % t["common"]
    return s[0].upper() + s[1:] if cap else s


def poss(t, cap=False):
    s = the(t, cap)
    return s + ("'" if s.endswith("s") else "'s")


def build_trends(ctx):
    """Every line here is computed from a number published elsewhere on the
    page. A trend without enough games behind it is left out."""
    a, h = ctx["away"], ctx["home"]
    out = []
    for t in (a, h):
        l10 = t.get("last10")
        if l10 and l10["gp"] >= 3:
            out.append({"tag": "Form", "text": "%s are %s in their last %d games%s, with %d goals for and %d against." % (
                the(t, True), l10["text"], l10["gp"], "" if l10["gp"] == 10 else " this season", l10["gf"], l10["ga"])})
    for t, venue, key in ((h, "home", "home_rec"), (a, "road", "road_rec")):
        rec = t.get(key)
        where = "at home" if venue == "home" else "on the road"
        if rec and rec["gp"] >= 3:
            out.append({"tag": "Home and road", "text": "%s are %s %s this season, %+d in goal differential." % (
                the(t, True), rec["text"], where, rec["gf"] - rec["ga"])})
        elif t.get("prev"):
            pr = t["prev"]["home" if venue == "home" else "road"]
            if pr and pr["gp"]:
                out.append({"tag": "Home and road", "text": "%s went %s %s in %s, %+d in goal differential." % (
                    the(t, True), pr["text"], where, t["prev"]["label"], pr["gf"] - pr["ga"])})
    for t in (a, h):
        ou = t.get("ou")
        if ou and ou["n"] >= 5:
            out.append({"tag": "Over/under", "text": "The over is %d-%d%s in %s games this season, graded against the "
                        "last pregame total on the TMR board." % (
                            ou["over"], ou["under"], ("-%d" % ou["push"]) if ou["push"] else "", poss(t))})
    sa, sh = (ctx.get("stats") or {}).get("away"), (ctx.get("stats") or {}).get("home")
    lbl = (ctx.get("stats") or {}).get("label", "").replace(" regular season", "")
    if sa and sh:
        for off, dfn, o_row, d_row in ((a, h, sa, sh), (h, a, sh, sa)):
            if o_row.get("pp") is not None and d_row.get("pk") is not None:
                out.append({"tag": "Special teams", "text": "%s power play (%s, %s in the league in %s) meets %s penalty "
                            "kill, which ranked %s at %s." % (
                                poss(off, True), fg.pct(o_row["pp"]), fg.ordinal(o_row["rank"]["pp"]), lbl, poss(dfn),
                                fg.ordinal(d_row["rank"]["pk"]), fg.pct(d_row["pk"]))})
    for t in (a, h):
        g5, rec = t.get("last5"), t.get("record")
        if g5 and rec and rec["gp"] >= 8 and g5["gp"] == 5:
            recent, season = g5["gf"] / 5.0, rec["gf"] / float(rec["gp"])
            if abs(recent - season) >= 0.5:
                out.append({"tag": "Scoring", "text": "%s have scored %.1f goals a game over their last five, %s their "
                            "season rate of %.2f." % (the(t, True), recent, "above" if recent > season else "below", season)})
            ra, sa_ = g5["ga"] / 5.0, rec["ga"] / float(rec["gp"])
            if abs(ra - sa_) >= 0.5:
                out.append({"tag": "Defense", "text": "%s have allowed %.1f goals a game over their last five against "
                            "%.2f on the season." % (the(t, True), ra, sa_)})
    for t in (a, h):
        r = t.get("rest") or {}
        if r.get("b2b"):
            b2b = (t.get("prev") or {}).get("b2b")
            tail = (" They went %s in the second half of back to backs in %s." % (b2b["text"], t["prev"]["label"])
                    if b2b else "")
            out.append({"tag": "Rest", "text": "%s are on the second night of a back to back.%s" % (the(t, True), tail)})
    ra, rh = (a.get("rest") or {}).get("days"), (h.get("rest") or {}).get("days")
    if ra is not None and rh is not None and ra != rh and not (a["rest"].get("b2b") or h["rest"].get("b2b")):
        more, less = (a, h) if ra > rh else (h, a)
        out.append({"tag": "Rest", "text": "%s come in with %d %s of rest to %s %d." % (
            the(more, True), max(ra, rh), "day" if max(ra, rh) == 1 else "days", poss(less), min(ra, rh))})
    hh = ctx.get("h2h") or []
    if len(hh) >= 3:
        wins = sum(1 for r in hh if r["winner"] == a["abbr"])
        avg = sum(r["total"] for r in hh) / float(len(hh))
        out.append({"tag": "Head to head", "text": "%s have won %d of the last %d meetings, going back to %s, and those "
                    "games averaged %.1f total goals." % (the(a, True), wins, len(hh), hh[-1]["season"], avg)})
    for side, opp in (("away", h), ("home", a)):
        gl = (ctx.get("goalies") or {}).get(side) or {}
        prof = gl.get("profile")
        if gl.get("status") in ("confirmed", "expected") and prof and prof.get("vs") and prof["vs"]["gp"] >= 2:
            vs = prof["vs"]
            out.append({"tag": "Goaltending", "text": "%s is %s with a %s save percentage in %d games against %s since "
                        "the start of %s." % (prof["name"], vs["record"], fg.svpct(vs["sv"]), vs["gp"], the(opp),
                                              prof["vs_span"].split(" through ")[0])})
    return out


def build_context(src, g, standings, names, tmr_teams, tables, board, lines, dfo_rows, inj, now, state_game):
    cur_sid = g["season"]
    a_abbr, h_abbr = g["awayTeam"]["abbrev"], g["homeTeam"]["abbrev"]
    sched = {}
    for ab in (a_abbr, h_abbr):
        sched[ab] = {}
        for sid in (cur_sid, prev_season(cur_sid), prev_season(prev_season(cur_sid))):
            sched[ab][sid] = fetch_club_schedule(src, ab, sid)
        if not sched[ab][cur_sid]:
            raise fg.FetchError("club schedule for %s unavailable" % ab)
    landing = src.try_get("landing_%s" % g["id"], NHL + "/gamecenter/%s/landing" % g["id"], browser=True) or {}
    away = side_block(src, g, "away", standings, names, tmr_teams, cur_sid, sched)
    home = side_block(src, g, "home", standings, names, tmr_teams, cur_sid, sched)
    for t in (away, home):
        t["ou"] = ou_record(lines, t["abbr"], cur_sid)
    start = fg.parse_utc(g.get("startTimeUTC"))
    et, pt = start.astimezone(fg.ET), start.astimezone(fg.PT)

    # Season rates: this season once both clubs have five games, else last.
    cur_gp = min(away["record"]["gp"], home["record"]["gp"])
    use_cur = cur_gp >= MIN_GP_FOR_CURRENT and tables["cur"].get(a_abbr) and tables["cur"].get(h_abbr)
    tbl = tables["cur"] if use_cur else tables["prev"]
    stats = {}
    if tbl.get(a_abbr) and tbl.get(h_abbr):
        stats = {"away": tbl[a_abbr], "home": tbl[h_abbr], "current": bool(use_cur),
                 "label": ctx_label(cur_sid if use_cur else prev_season(cur_sid), use_cur)}
    if stats:
        rows_ = list(tbl.values())
        stats["avg"] = {k: round(sum(r[k] for r in rows_ if r.get(k) is not None) / max(1, len([r for r in rows_ if r.get(k) is not None])), 4)
                        for k in ("gfpg", "gapg", "sfpg", "sapg", "pp", "pk", "shpct", "svpct")}

    # Odds: the live board when it is current, else the last good read if it
    # is under ODDS_MAX_AGE_H old, else nothing.
    an, hn = away["name"], home["name"]
    odds, odds_src = None, None
    b = board_match(board, an, hn, g.get("startTimeUTC")) if board and not board.get("stale") else None
    if b:
        mk = markets(b, an, hn)
        upd = fg.parse_utc(mk.get("updated"))
        if (mk["ml"] or mk["total"]) and upd and now - upd <= dt.timedelta(hours=ODDS_MAX_AGE_H):
            odds = mk
            odds_src = "live"
    rec = lines.get(str(g["id"])) or {}
    if odds is None and g.get("gameState") in ("FUT", "PRE") and rec.get("last"):
        at = fg.parse_utc(rec["last"]["at"])
        if at and now - at <= dt.timedelta(hours=ODDS_MAX_AGE_H):
            odds = {"book": rec["last"]["book"], "ml": rec["last"]["ml"], "pl": rec["last"]["pl"],
                    "total": rec["last"]["total"], "updated": rec["last"]["at"]}
            odds_src = rec["last"]["at"]
    if odds:
        odds = {k: v for k, v in odds.items() if k != "updated"}   # freshness checked above; not page data
    line_track = None
    if rec.get("first"):
        line_track = {"first": rec["first"], "last": rec.get("last") or rec["first"], "moves": rec.get("moves") or []}

    goalies = resolve_goalies(src, g, dfo_rows, cur_sid)

    ctx = {
        "id": g["id"], "season": cur_sid, "season_label": season_label(cur_sid),
        "prev_label": season_label(prev_season(cur_sid)),
        "game_type": g.get("gameType"),
        "date": g.get("_date"), "start_utc": g.get("startTimeUTC"),
        "et_time": fg.clock(et), "pt_time": fg.clock(pt), "long_date": fg.long_date(et.date()),
        "date_text": fg.month_day_year(et.date()),
        "venue": (landing.get("venue") or g.get("venue") or {}).get("default"),
        "city": (landing.get("venueLocation") or {}).get("default"),
        "region": None if g.get("neutralSite") else REGION.get(h_abbr),
        "neutral": bool(g.get("neutralSite")),
        "tv": [{"net": b_.get("network"), "market": b_.get("market"), "country": b_.get("countryCode")}
               for b_ in g.get("tvBroadcasts") or []],
        "state": g.get("gameState"), "schedule_state": g.get("gameScheduleState"),
        "away": away, "home": home,
        "stats": stats,
        "h2h": h2h_rows(sched, a_abbr, h_abbr, cur_sid, g["id"])[:10],
        "meeting_n": meeting_number(sched, a_abbr, h_abbr, cur_sid, g),
        "division_game": bool(away["standing"]["division"] and away["standing"]["division"] == home["standing"]["division"]),
        "conference_game": bool(away["standing"]["conference"] and away["standing"]["conference"] == home["standing"]["conference"]),
        "rivalry": RIVALRIES.get(frozenset((a_abbr, h_abbr))),
        "odds": odds, "line_track": line_track, "_odds_src": odds_src,
        "goalies": goalies,
        "injuries": {"away": injuries_for(inj, an), "home": injuries_for(inj, hn)} if inj else None,
        "leaders": {"points": _leaders(landing, "points"), "goals": _leaders(landing, "goals")},
        "leaders_season": season_label(((landing.get("matchup") or {}).get("skaterComparison") or {}).get("contextSeason") or prev_season(cur_sid)),
        "selection": state_game.get("selection") or {},
        "slug": state_game["slug"], "url": "/nhl/%s/" % state_game["slug"],
        "research_page": research_page(g),
        "team_names": dict(sorted(names.items())),
    }
    ctx["key_players"], ctx["issues"] = key_players(src, g, landing, cur_sid)
    ctx["issues"] += [x["issue"] for x in goalies.values() if x.get("issue")]
    ctx["model"] = run_model(src, away, home, goalies, g["id"])
    if g.get("gameState") in FINAL_STATES:
        ctx["final"] = {"away": g["awayTeam"].get("score"), "home": g["homeTeam"].get("score"),
                        "ended": ((g.get("gameOutcome") or {}).get("lastPeriodType") or "REG")}
    ctx["trends"] = build_trends(ctx)
    return ctx


def research_page(g):
    """The game's own /handicapping/nhl/ page, when the hub bake made one."""
    hooks = fg.load_json(os.path.join(ROOT, "handicapping", "_seo_hooks.json"), {})
    an, hn = team_name(g, "awayTeam")[0], team_name(g, "homeTeam")[0]
    start = fg.parse_utc(g.get("startTimeUTC"))
    for day in {start.astimezone(fg.ET).strftime("%Y-%m-%d"), start.strftime("%Y-%m-%d")}:
        rec = hooks.get("NHL|%s|%s|%s" % (an, hn, day)) or {}
        page = rec.get("page") or ""
        if page and os.path.exists(os.path.join(ROOT, page.strip("/").replace("/", os.sep), "index.html")):
            return page
    return None


def ctx_label(sid, current):
    return ("%s regular season" % season_label(sid)) if current else ("%s regular season" % season_label(sid))


# ================================================================== validation

def _season_for(date):
    y, mo = int(date[:4]), int(date[5:7])
    start = y if mo >= 8 else y - 1
    return "%d-%02d" % (start, (start + 1) % 100)


def clean_odds(odds):
    """Drop any market whose numbers cannot be a real posted price. Returns
    (odds or None, [problems])."""
    if not odds:
        return odds, []
    o, bad = dict(odds), []
    ml = o.get("ml") or {}
    if ml:
        ia, ih = fg.implied(ml.get("away")), fg.implied(ml.get("home"))
        if not (ia and ih and 0.98 <= ia + ih <= 1.15):
            bad.append("moneyline %s / %s is not a two sided price" % (ml.get("away"), ml.get("home")))
            o["ml"] = {}
    pl = o.get("pl") or {}
    if pl:
        try:
            pa, ph = float(pl["away"]["point"]), float(pl["home"]["point"])
            ok = pa + ph == 0 and abs(pa) in (1.5, 2.5) and fg.implied(pl["away"]["price"]) and fg.implied(pl["home"]["price"])
        except (KeyError, TypeError, ValueError):
            ok = False
        if not ok:
            bad.append("puck line %s is not a valid pair" % pl)
            o["pl"] = {}
    tot = o.get("total") or {}
    if tot:
        try:
            ok = 4.0 <= float(tot.get("point")) <= 9.0 and fg.implied(tot.get("over")) and fg.implied(tot.get("under"))
        except (TypeError, ValueError):
            ok = False
        if not ok:
            bad.append("total %s is not a valid market" % tot)
            o["total"] = {}
    if not (o.get("ml") or o.get("pl") or o.get("total")):
        return None, bad
    return o, bad


def validate(ctx, g, sg, now, cur_sid):
    """Checks run before a page is written. Errors block the write and fail
    the run, which raises the alert issue, so an impossible page is never
    published. Warnings drop or relabel the piece concerned and are logged."""
    errors, warnings = [], list(ctx.get("issues") or [])
    a, h = ctx["away"], ctx["home"]
    if (a["abbr"], h["abbr"]) != (sg.get("away"), sg.get("home")):
        errors.append("teams %s at %s do not match the selected game %s at %s"
                      % (a["abbr"], h["abbr"], sg.get("away"), sg.get("home")))
    if g.get("season") != cur_sid:
        errors.append("game season %s is not the current season %s" % (g.get("season"), cur_sid))
    if ctx.get("date") and ctx["season_label"] != _season_for(ctx["date"]):
        errors.append("season label %s does not fit the game date %s" % (ctx["season_label"], ctx["date"]))
    if ctx.get("date") and ctx["date"] != sg.get("date"):
        errors.append("game date %s moved from the selected date %s" % (ctx["date"], sg.get("date")))
    start = fg.parse_utc(ctx.get("start_utc"))
    if ctx.get("state") in FINAL_STATES and not ctx.get("final"):
        errors.append("game is final but carries no final score")
    if ctx.get("state") in ("FUT", "PRE") and start and now > start + dt.timedelta(hours=5):
        errors.append("game still reads as not started five hours after puck drop")
    st = ctx.get("stats") or {}
    if st and not st.get("current") and ctx["prev_label"] not in st.get("label", ""):
        errors.append("prior season rates are not labeled with %s" % ctx["prev_label"])
    ctx["odds"], bad = clean_odds(ctx.get("odds"))
    warnings += ["odds: %s" % b for b in bad]
    if ctx.get("state") in ("FUT", "PRE") and start and start - now <= dt.timedelta(hours=12) and not ctx.get("odds"):
        warnings.append("no current odds within 12 hours of puck drop")
    for t in (a, h):
        sgp = (t.get("standing") or {}).get("gp")
        if ctx.get("state") in ("FUT", "PRE") and sgp is not None and sgp != t["record"]["gp"]:
            warnings.append("%s record %s counts %d games, standings count %d"
                            % (t["abbr"], t["record"]["text"], t["record"]["gp"], sgp))
    inj = ctx.get("injuries") or {}
    today = now.astimezone(fg.ET).date()
    for side in ("away", "home"):
        keep = []
        for r in inj.get(side) or []:
            try:
                age = (today - dt.date.fromisoformat(r.get("date") or "")).days
            except ValueError:
                age = None
            if r.get("status") == "Day-To-Day" and age is not None and age > 30:
                warnings.append("injury entry for %s (day to day, %d days old) dropped" % (r.get("name"), age))
                continue
            keep.append(r)
        if side in inj:
            inj[side] = keep
    return errors, warnings


def localize_images(ctx):
    """Logos, key player and goalie headshots as small self hosted WebP files.
    A new face (a different club, a new season's photo) gets a new file."""
    def name(url):
        return fg.content_hash(url)[:10]
    for side in ("away", "home"):
        t = ctx[side]
        if t.get("logo"):
            # ESPN publishes a dark background version of each mark (the
            # Lightning's navy bolt vanishes on the dark hero otherwise). It
            # is used only once it has converted to a local file; a missing
            # one falls back to the standard mark.
            dark = t["logo"].replace("/teamlogos/nhl/500/", "/teamlogos/nhl/500-dark/")
            got = None
            if dark != t["logo"]:
                got = fg.local_image(ROOT, dark, "img/nhl-featured/logos/%s-%s" % (t["abbr"].lower(), name(dark)), 240)
                if not (got or {}).get("src", "").startswith("/static/"):
                    got = None
            t["logo_img"] = got or fg.local_image(ROOT, t["logo"], "img/nhl-featured/logos/%s-%s" % (
                t["abbr"].lower(), name(t["logo"])), 240)
        for p in (ctx.get("key_players") or {}).get(side) or []:
            if p.get("headshot"):
                p["img"] = fg.local_image(ROOT, p["headshot"], "img/nhl-featured/players/%s-%s" % (p["id"], name(p["headshot"])), 320)
        gl = (ctx.get("goalies") or {}).get(side) or {}
        for prof in [gl.get("profile")] + list(gl.get("roster") or []):
            if prof and prof.get("headshot"):
                prof["img"] = fg.local_image(ROOT, prof["headshot"], "img/nhl-featured/players/%s-%s" % (prof["id"], name(prof["headshot"])), 192)


# ================================================================== run

def section_cache(state_game, key, value, now, max_h):
    """A volatile section falls back to its last good value while it is still
    young enough to be honest, and is dropped after that."""
    cache = state_game.setdefault("cache", {})
    old = cache.get(key)
    if value:
        # The confirmation time is rewritten at most every two hours when the
        # value itself has not changed, so a quiet run does not commit.
        stale_mark = not old or now - fg.parse_utc(old["at"]) >= dt.timedelta(hours=2)
        if not old or fg.content_hash(old.get("data")) != fg.content_hash(value) or stale_mark:
            cache[key] = {"at": fg.iso(now), "data": value}
        return value
    if old and now - fg.parse_utc(old["at"]) <= dt.timedelta(hours=max(1, max_h - 2)):
        return old["data"]
    return value


def run(now=None, dry=False):
    now = now or fg.now_utc()
    src = fg.Sources()
    notes = []
    day = hockey_day(now)
    games = fetch_schedule(src, day)                       # core: raises
    standings, standings_at = fetch_standings(src)         # core: raises
    names = {ab: (r.get("teamName") or {}).get("default", "") for ab, r in standings.items()}
    tmr_teams = fetch_teams(src)
    season_ids = sorted({g["season"] for g in games if g.get("gameType") == 2}) or [None]
    cur_sid = season_ids[-1] or int("%d%d" % (day.year, day.year + 1))
    tables = {"cur": with_ranks(league_table(fetch_team_stats(src, cur_sid), names, fetch_team_reports(src, cur_sid))),
              "prev": with_ranks(league_table(fetch_team_stats(src, prev_season(cur_sid)), names,
                                              fetch_team_reports(src, prev_season(cur_sid))))}
    if not tables["prev"]:
        raise fg.FetchError("league team stats unavailable")
    board = fetch_board(src)
    lines = fg.load_json(LINES, {})
    lines_changed = snapshot_lines(lines, games, board, now)
    notes.append("board: %d NHL games, stale=%s, %d tracked" % (len(board.get("games") or []), board.get("stale"), len(lines)))
    inj = fetch_injuries(src)
    state = fg.load_json(STATE, {"days": {}, "games": {}})
    state.setdefault("days", {})
    state.setdefault("games", {})
    by_id = {g["id"]: g for g in games}

    game_days = sorted({g["_date"] for g in games if g.get("gameScheduleState") == "OK" and g["_date"] >= day.isoformat()})
    targets = game_days[:1]
    if targets:
        sel = state["days"].get(targets[0]) or {}
        gm = by_id.get(sel.get("game_id"))
        if gm and gm.get("gameState") in FINAL_STATES and len(game_days) > 1:
            targets.append(game_days[1])        # tonight's feature is over: queue the next day's

    for gd in targets:
        sel = state["days"].get(gd)
        g_sel = by_id.get((sel or {}).get("game_id"))
        if sel and g_sel and g_sel.get("gameScheduleState") in BAD_SCHEDULE:
            notes.append("featured game %s on %s is %s; reselecting" % (g_sel["id"], gd, g_sel["gameScheduleState"]))
            state["games"].get(str(g_sel["id"]), {})["withdrawn"] = True
            sel = None
        if sel:
            continue
        cands = [g for g in games if g["_date"] == gd and g.get("gameScheduleState") == "OK"]
        landings = {}
        for g in cands:
            landings[g["id"]] = src.try_get("landing_%s" % g["id"], NHL + "/gamecenter/%s/landing" % g["id"], browser=True)
        prev_rank_table = tables["prev"]
        pick, board_view = choose(games, dt.date.fromisoformat(gd), standings, prev_rank_table, landings, board)
        if not pick:
            continue
        score, _, g, factors = pick
        sched_a = {g["awayTeam"]["abbrev"]: {cur_sid: fetch_club_schedule(src, g["awayTeam"]["abbrev"], cur_sid)}}
        meeting = meeting_number(sched_a, g["awayTeam"]["abbrev"], g["homeTeam"]["abbrev"], cur_sid, g)
        slug = mint_slug(g, landings.get(g["id"]), state, meeting)
        if not slug:
            notes.append("no free URL for game %s" % g["id"])
            continue
        state["days"][gd] = {"game_id": g["id"], "selected_at": fg.iso(now), "score": score}
        state["games"][str(g["id"])] = {
            "slug": slug, "date": gd, "start": g.get("startTimeUTC"),
            "matchup": "%s at %s" % (team_name(g, "awayTeam")[0], team_name(g, "homeTeam")[0]),
            "away": g["awayTeam"]["abbrev"], "home": g["homeTeam"]["abbrev"],
            "selection": {"score": score, "factors": factors, "board": board_view[:16], "slate_games": len(cands),
                          "selected_at": fg.iso(now), "selected_pt": fg.pacific_stamp(now)},
            "published": fg.iso(now),
        }
        notes.append("selected %s for %s (score %.1f of %d games)" % (state["games"][str(g["id"])]["matchup"], gd,
                                                                      score, len(board_view)))

    # Build every featured page that is not frozen yet.
    dfo_cache = {}
    written = []
    blocked = []
    for gid, sg in sorted(state["games"].items(), key=lambda kv: kv[1].get("start") or ""):
        if sg.get("frozen") or sg.get("withdrawn"):
            continue
        g = by_id.get(int(gid))
        if not g:
            continue
        gdate = dt.date.fromisoformat(sg["date"])
        if sg["date"] not in dfo_cache:
            dfo_cache[sg["date"]] = fetch_dfo(src, gdate)
        dfo_rows = dfo_cache[sg["date"]]
        ctx = build_context(src, g, standings, names, tmr_teams, tables, board, lines, dfo_rows or [], inj,
                            now, sg)
        # Volatile sections ride on their last good value for a few hours.
        # "Updated" on the odds board is the last time the live board
        # confirmed the price (refreshed at most every two hours while it holds
        # still). A price read back from the line log keeps the time it was
        # last seen live, never the time of this run.
        src_ = ctx.pop("_odds_src", None)
        checked = None
        if ctx["state"] in ("FUT", "PRE"):
            if src_ == "live":
                ctx["odds"] = section_cache(sg, "odds", ctx["odds"], now, ODDS_MAX_AGE_H)
                checked = sg["cache"]["odds"]["at"]
            else:
                cached = section_cache(sg, "odds", None, now, ODDS_MAX_AGE_H)
                if cached:
                    ctx["odds"], checked = cached, sg["cache"]["odds"]["at"]
                elif ctx.get("odds"):
                    checked = src_
        if dfo_rows is None:
            ctx["goalies"] = section_cache(sg, "goalies", None, now, 6) or ctx["goalies"]
        else:
            section_cache(sg, "goalies", ctx["goalies"], now, 6)
        ctx["injuries"] = section_cache(sg, "injuries", ctx["injuries"], now, 24)
        ctx["model"] = section_cache(sg, "model", ctx["model"], now, 24)
        ctx["odds_checked"] = checked if ctx.get("odds") else None
        # The cached sections are shared with the state file: work on copies,
        # so validation and image paths never leak back into the cache.
        for k in ("odds", "goalies", "injuries", "model"):
            ctx[k] = copy.deepcopy(ctx.get(k))
        errors, warnings = validate(ctx, g, sg, now, cur_sid)
        sg["validation"] = {"errors": errors, "warnings": warnings} if (errors or warnings) else None
        if errors:
            # Flagged, not published: the page keeps its last good version and
            # the finding goes to data/nhl-featured/validation.json and the run
            # summary.
            blocked.append("%s: %s" % (sg["slug"], "; ".join(errors)))
            continue
        if not dry:
            localize_images(ctx)
            ctx["og"] = og_card.build(ROOT, ctx)
        ctx["others"] = [{"headline": o["headline"], "url": "/nhl/%s/" % o["slug"]}
                         for oid, o in sorted(state["games"].items(), key=lambda kv: kv[1].get("start") or "", reverse=True)
                         if oid != gid and not o.get("withdrawn") and o.get("headline")][:3]
        ctx["trends"] = build_trends(ctx)
        ctx["article"] = article.build(ctx)
        # Fetch times are not data: a price the book has not moved does not
        # make the page new, so they stay out of the change hash.
        stable = dict(ctx, odds=dict(ctx["odds"] or {}, updated=None) if ctx.get("odds") else None)
        digest = fg.content_hash([render.RENDER_VERSION,
                                  {k: v for k, v in stable.items() if k not in ("updated_pt", "sources")}])
        if digest != sg.get("hash"):
            sg["hash"] = digest
            sg["updated"] = fg.iso(now)
        ctx["updated_iso"] = sg.get("updated") or fg.iso(now)
        ctx["updated_pt"] = fg.pacific_stamp(fg.parse_utc(ctx["updated_iso"]))
        ctx["published_iso"] = sg.get("published") or ctx["updated_iso"]
        ctx["sources"] = {k: v for k, v in src.rows.items() if v.get("ok")}
        sg["headline"] = ctx["article"]["headline"]
        sg["title"] = ctx["article"]["title"]
        sg["records"] = {"away": ctx["away"]["record"]["text"], "home": ctx["home"]["record"]["text"]}
        sg["logos"] = {"away": ctx["away"]["logo"], "home": ctx["home"]["logo"]}
        sg["names"] = {"away": ctx["away"]["name"], "home": ctx["home"]["name"],
                       "away_common": ctx["away"]["common"], "home_common": ctx["home"]["common"]}
        sg["et_time"], sg["pt_time"], sg["long_date"] = ctx["et_time"], ctx["pt_time"], ctx["long_date"]
        sg["odds"] = ctx["odds"]
        sg["teaser"] = (ctx["trends"][0]["text"] if ctx["trends"] else "")
        sg["state"] = ctx["state"]
        if ctx.get("final"):
            sg["final"] = ctx["final"]
        page = render.page(ROOT, ctx)
        path = os.path.join(ROOT, "nhl", sg["slug"], "index.html")
        if not dry and fg.write_text(path, page):
            written.append(path)
        if ctx.get("final"):
            end = fg.parse_utc(g.get("startTimeUTC"))
            if end and now - end >= dt.timedelta(hours=3, minutes=FREEZE_AFTER_FINAL_MIN):
                sg["frozen"] = True
                notes.append("froze %s after the final" % sg["slug"])

    current = current_feature(state, now)
    if not dry:
        withdraw_in_registry(state)
        fg.save_json(STATE, state)
        if lines_changed:
            fg.save_json(LINES, lines)
        fg.save_json(CURRENT, public_current(state, current, now, game_days))
        for p in render.site_surfaces(ROOT, state, current, now, game_days):
            written.append(p)
    out = {"day": day.isoformat(), "targets": targets, "current": (current or {}).get("slug"),
           "written": [os.path.relpath(p, ROOT) for p in written], "notes": notes,
           "validation": {sg["slug"]: sg["validation"] for sg in state["games"].values()
                          if sg.get("validation") and not sg.get("frozen")},
           "failed_sources": src.failed(), "sources_ok": len([1 for v in src.rows.values() if v.get("ok")])}
    out["blocked"] = blocked
    if not dry:
        # The flag file: what every run checked and what it held back. It only
        # changes when a finding changes, so a quiet run still commits nothing.
        fg.save_json(VALIDATION, {"blocked": blocked, "pages": out["validation"]})
    return out


def withdraw_in_registry(state):
    """A postponed feature must not stay live on the doors, hub card or menu:
    its registry entry is marked withdrawn (the page itself stays up)."""
    import featured_matchups as fm
    reg = fm.load(os.path.join(ROOT, "data", "featured-matchups.json"))
    spec = ((reg or {}).get("sports") or {}).get(SPORT)
    if not spec:
        return False
    gone = {"/nhl/%s/" % sg["slug"] for sg in state["games"].values() if sg.get("withdrawn")}
    changed = False
    for f in spec.get("features") or []:
        if f.get("href") in gone and f.get("status") != "withdrawn":
            f["status"] = "withdrawn"
            changed = True
    if changed:
        fm.save(reg, os.path.join(ROOT, "data", "featured-matchups.json"))
    return changed


def current_feature(state, now):
    """The game a visitor should see now: the earliest feature that has not
    finished (or finished under four hours ago), else the newest feature."""
    live = []
    for gid, sg in state["games"].items():
        if sg.get("withdrawn"):
            continue
        start = fg.parse_utc(sg.get("start"))
        if start and now < start + dt.timedelta(hours=4) and not (sg.get("final") and now > start + dt.timedelta(hours=4)):
            live.append((start, gid, sg))
    if live:
        live.sort(key=lambda x: x[0])
        return dict(live[0][2], id=live[0][1])
    rest = sorted(((sg.get("start") or "", gid, sg) for gid, sg in state["games"].items() if not sg.get("withdrawn")),
                  reverse=True)
    return dict(rest[0][2], id=rest[0][1]) if rest else None


def public_current(state, cur, now, game_days):
    return {"current": {k: cur.get(k) for k in ("slug", "matchup", "date", "start", "headline", "records", "odds",
                                                "et_time", "pt_time", "long_date", "state", "final", "teaser")}
            if cur else None,
            "url": "/nhl/%s/" % cur["slug"] if cur else None,
            "next_game_day": game_days[0] if game_days else None}


def main(argv):
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["run"])
    ap.add_argument("--dry", action="store_true")
    ap.add_argument("--now")
    args = ap.parse_args(argv)
    now = fg.parse_utc(args.now) if args.now else None
    try:
        out = run(now=now, dry=args.dry)
    except Exception as exc:
        import traceback
        traceback.print_exc()
        print("NHL FEATURED GAME: FAILED: %s" % exc)
        summary("FAILED", {"error": str(exc)})
        return 1
    print(json.dumps(out, indent=1, default=str))
    summary("ok", out)
    return 0


def summary(status, out):
    path = os.environ.get("GITHUB_STEP_SUMMARY")
    if not path:
        return
    with open(path, "a", encoding="utf-8") as fh:
        fh.write("## NHL Featured Game: %s\n\n" % status)
        fh.write("Run at %s\n\n" % fg.pacific_stamp(fg.now_utc()))
        fh.write("```json\n%s\n```\n" % json.dumps(out, indent=1, default=str)[:6000])


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
