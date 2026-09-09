"""NCAAF_HANDICAPPING_HUB_20260909 - the research half of /handicapping/ncaaf/.

WHY THIS EXISTS
    The NCAAF hub shipped on 2026-09-08 as a board and a heading: 84 fixtures,
    a moneyline, a spread and a total, and an in-page apology for having no
    matchup pages. Nima, 2026-09-09: "This is not a real handicapping hub page,
    it is just a plain sportsbook board with a heading." He is right. A college
    football reader deciding what to do with Saturday gets nothing out of a
    price list.

    This module builds the research page around the board instead: the AP and
    Coaches polls, featured matchup cards with logos, rankings, records,
    conference badges, kickoff, venue, weather and television, a full team
    statistical comparison with national ranks, against the spread splits,
    recent form with the cover and over/under result of every game, head to
    head history, season leaders and the head coach. The board stays, lower
    down, with logos and filters on it.

WHERE THE NUMBERS COME FROM, AND WHAT IS NOT HERE
    Every figure is read from a live feed on the build that writes the page.
    Nothing is projected, modeled, averaged into existence or carried over.

    ESPN scoreboard      the slate: teams, logos, curated rank, records,
                         conference, venue, weather, broadcast, and the
                         sportsbook line ESPN carries for the game
    ESPN core statistics team season statistics with national rank
    ESPN core event odds the closing number on a COMPLETED game, which is what
                         turns a result into a cover and an over or under, and
                         is where EVERY against the spread and over/under split
                         on this page is counted from. ESPN publishes an
                         odds-records endpoint that would be quicker; it is
                         filed under the live season and on 2026-09-09 it
                         answered eleven games for a team that had played one,
                         so it is not used at all
    ESPN standings       points for and points against, overall / home / away /
                         vs conference / vs ranked. Points allowed lives here
                         because the team statistics feed returns 0 for it
    ESPN team schedule   results, opponents, scores, and head to head history
    ESPN leaders, coaches season statistical leaders and the head coach
    TrustMyRecord board  the priced full board, when the sportsbook feed has
                         the day's games

    NOT AVAILABLE AND THEREFORE NOT SHOWN, rather than estimated:
      yards allowed per game   ESPN's college team statistics feed answers 0
      explosive plays          same, the big play counters are unpopulated
      EPA, success rate, havoc, SP+   no feed we hold carries them
      injuries                 ESPN's college injury feed returns an empty list
    Each of these is omitted silently. A module with no data writes no module.
"""

import concurrent.futures
import datetime
import json
import os
import re
import urllib.error
import urllib.request

SITE_API = "https://site.api.espn.com/apis/site/v2/sports/football/college-football"
WEB_API = "https://site.web.api.espn.com/apis/v2/sports/football/college-football"
CORE_API = "https://sports.core.api.espn.com/v2/sports/football/leagues/college-football"

HTTP_TIMEOUT = 30
FEATURED = int(os.environ.get("NCAAF_HUB_FEATURED", "6"))
FORM_GAMES = 5
H2H_SEASONS = 8

# FBS only. groups=80 is Division I-A; the board carries FCS opponents but a
# handicapping page is built around the teams that have a full statistical
# record behind them.
FBS_GROUP = 80

POWER = {"8": "SEC", "5": "Big Ten", "4": "Big 12", "1": "ACC", "9": "Pac-12"}
GROUP_OF_FIVE = {"151", "12", "15", "17", "37"}

_cache = {}


def _get(url, timeout=HTTP_TIMEOUT):
    """One GET, cached, never fatal.

    NO browser User-Agent: site.api.espn.com answers 403 to anything that looks
    like Chrome and 200 to urllib's own default, which is the opposite of the
    usual trap and has cost this repo a build before."""
    if url in _cache:
        return _cache[url]
    req = urllib.request.Request(url, headers={"Accept": "application/json"})
    data, last = None, None
    for _ in range(3):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                data = json.loads(r.read().decode("utf-8"))
            break
        # Broad on purpose. ESPN truncates a large schedule response often
        # enough that http.client.IncompleteRead alone has killed a build, and
        # no feed on this page is worth failing the page over: a section with
        # no data is simply not written.
        except Exception as exc:  # noqa: BLE001
            last = exc
    if data is None:
        print("  WARN  ncaaf feed unavailable: %s (%s)" % (url.split("?")[0], last))
    _cache[url] = data
    return data


def _get_many(urls, workers=10):
    todo = [u for u in dict.fromkeys(urls) if u and u not in _cache]
    if not todo:
        return
    with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as pool:
        list(pool.map(_get, todo))


def _ref(obj):
    ref = (obj or {}).get("$ref") or ""
    return ref.replace("http://", "https://")


# ---------------------------------------------------------------- time

def _eastern_now():
    """ESPN files a college football game under its EASTERN date, so a build
    running at 02:00 UTC is still on yesterday's slate as far as the feed is
    concerned. US DST: second Sunday in March to first Sunday in November."""
    utc = datetime.datetime.now(datetime.timezone.utc)
    y = utc.year
    mar = datetime.datetime(y, 3, 8, tzinfo=datetime.timezone.utc)
    start = mar + datetime.timedelta(days=(6 - mar.weekday()) % 7, hours=7)
    nov = datetime.datetime(y, 11, 1, tzinfo=datetime.timezone.utc)
    end = nov + datetime.timedelta(days=(6 - nov.weekday()) % 7, hours=6)
    off = -4 if start <= utc < end else -5
    return utc + datetime.timedelta(hours=off), off


def _to_et(iso):
    try:
        dt = datetime.datetime.fromisoformat((iso or "").replace("Z", "+00:00"))
    except ValueError:
        return None
    return dt + datetime.timedelta(hours=_eastern_now()[1])


def kickoff_et(iso):
    dt = _to_et(iso)
    if not dt:
        return ""
    hour = dt.hour % 12 or 12
    return "%d:%02d %s ET" % (hour, dt.minute, "am" if dt.hour < 12 else "pm")


def day_label(iso):
    dt = _to_et(iso)
    if not dt:
        return ""
    delta = (dt.date() - _eastern_now()[0].date()).days
    if delta == 0:
        return "Today"
    if delta == 1:
        return "Tomorrow"
    return "%s %s %d" % (dt.strftime("%a"), dt.strftime("%b"), dt.day)


def long_day(iso):
    dt = _to_et(iso)
    if not dt:
        return ""
    return "%s, %s %d" % (dt.strftime("%A"), dt.strftime("%B"), dt.day)


def short_date(iso):
    dt = _to_et(iso)
    if not dt:
        return ""
    return "%s %d, %d" % (dt.strftime("%b"), dt.day, dt.year)


# ---------------------------------------------------------------- season

def current_season():
    """The season ESPN is filing games under right now.

    January and February belong to the previous season's postseason, so the
    calendar year alone is wrong for six weeks of every year."""
    now = _eastern_now()[0]
    return now.year - 1 if now.month < 3 else now.year


def stat_season(team_id, season):
    """The most recent season with enough games on it to mean something.

    Week 2 of a new season is one game of data. A page that showed a team's
    points per game off one result would be presenting noise as research, so
    the comparison falls back to the completed season until four games are in
    the book, and the card says which season it is reading."""
    cur = team_stats(team_id, season)
    gp = _num(_stat(cur, "general", "gamesPlayed"))
    if gp is not None and gp >= 4:
        return season, cur
    prev = team_stats(team_id, season - 1)
    if prev and _num(_stat(prev, "general", "gamesPlayed")):
        return season - 1, prev
    return season, cur


# ---------------------------------------------------------------- feeds

def conferences():
    """conference id -> {name, short, tier}."""
    d = _get("%s/seasons/%d/types/2/groups/%d/children?limit=60"
             % (CORE_API, current_season(), FBS_GROUP))
    refs = [_ref(i) for i in (d or {}).get("items") or []]
    _get_many(refs)
    out = {}
    for r in refs:
        j = _get(r)
        if not j or not j.get("id"):
            continue
        cid = str(j["id"])
        out[cid] = {"name": j.get("name"), "short": j.get("shortName") or j.get("name"),
                    "tier": "power" if cid in POWER else
                            ("g5" if cid in GROUP_OF_FIVE else "other")}
    return out


def rankings():
    """team id -> {'ap': n, 'coaches': n}. The FBS polls only."""
    d = _get("%s/rankings" % SITE_API)
    out = {}
    for poll in (d or {}).get("rankings") or []:
        name = poll.get("shortName") or poll.get("name") or ""
        if "FCS" in name or "II" in name:
            continue
        key = "ap" if "AP" in name else ("coaches" if "Coach" in name else None)
        if not key:
            continue
        for rank in poll.get("ranks") or []:
            tid = str(((rank.get("team") or {}).get("id")) or "")
            if tid:
                out.setdefault(tid, {})[key] = rank.get("current")
    return out


def poll_top25():
    """The AP Top 25 in order, for the poll rail."""
    d = _get("%s/rankings" % SITE_API)
    for poll in (d or {}).get("rankings") or []:
        name = poll.get("shortName") or poll.get("name") or ""
        if "AP" not in name or "FCS" in name:
            continue
        rows = []
        for rank in poll.get("ranks") or []:
            t = rank.get("team") or {}
            tid = str(t.get("id") or "")
            rows.append({"rank": rank.get("current"), "id": tid,
                         "name": t.get("nickname") or t.get("name")
                                 or t.get("shortDisplayName") or "",
                         "abbr": (t.get("abbreviation") or "").upper(),
                         "logo": (t.get("logos") or [{}])[0].get("href") or logo_for(tid),
                         "record": rank.get("recordSummary") or ""})
        return [r for r in rows if r["rank"]][:25]
    return []


def logo_for(team_id):
    return ("https://a.espncdn.com/i/teamlogos/ncaa/500/%s.png" % team_id) if team_id else ""


def slate(days=8):
    """Every FBS game not yet finished in the next `days` Eastern days.

    The TrustMyRecord sportsbook board is a today-only feed, so midweek it is
    empty and a hub built on it alone has nothing on it at all. The slate is
    what the page is actually about, and it is read straight from ESPN."""
    today = _eastern_now()[0].date()
    span = "%s-%s" % (today.strftime("%Y%m%d"),
                      (today + datetime.timedelta(days=days)).strftime("%Y%m%d"))
    d = _get("%s/scoreboard?groups=%d&limit=900&dates=%s" % (SITE_API, FBS_GROUP, span), 45)
    confs = conferences()
    ranks = rankings()
    games = []
    for e in (d or {}).get("events") or []:
        comp = (e.get("competitions") or [{}])[0]
        state = ((comp.get("status") or {}).get("type") or {}).get("state")
        if state == "post":
            continue
        sides = {}
        for c in comp.get("competitors") or []:
            t = c.get("team") or {}
            tid = str(t.get("id") or "")
            recs = {r.get("type"): r.get("summary") for r in c.get("records") or []}
            cid = str(t.get("conferenceId") or "")
            sides[c.get("homeAway")] = {
                "id": tid,
                "name": t.get("displayName") or t.get("shortDisplayName") or "",
                "short": t.get("shortDisplayName") or t.get("name") or "",
                "nick": t.get("name") or "",
                "loc": t.get("location") or "",
                "abbr": (t.get("abbreviation") or "").upper(),
                "logo": t.get("logo") or logo_for(tid),
                "color": t.get("color") or "",
                "conf_id": cid,
                "conf": (confs.get(cid) or {}).get("short") or "",
                "tier": (confs.get(cid) or {}).get("tier") or "other",
                "rank": (c.get("curatedRank") or {}).get("current"),
                "ap": (ranks.get(tid) or {}).get("ap"),
                "coaches": (ranks.get(tid) or {}).get("coaches"),
                "rec": recs.get("total") or "",
                "home_rec": recs.get("homerecord") or "",
                "away_rec": recs.get("awayrecord") or "",
                "conf_rec": recs.get("vsconf") or "",
            }
        if "home" not in sides or "away" not in sides:
            continue
        odds = _first_odds(comp.get("odds") or [])
        venue = comp.get("venue") or {}
        weather = e.get("weather") or {}
        bcast = ""
        for b in comp.get("broadcasts") or []:
            names = b.get("names") or []
            if names:
                bcast = names[0]
                break
        games.append({
            "id": str(e.get("id") or ""), "comp_id": str(comp.get("id") or ""),
            "date": e.get("date") or "", "name": e.get("shortName") or e.get("name") or "",
            "home": sides["home"], "away": sides["away"],
            "neutral": bool(comp.get("neutralSite")),
            "conf_game": bool(comp.get("conferenceCompetition")),
            "venue": venue.get("fullName") or "",
            "city": ", ".join(x for x in [(venue.get("address") or {}).get("city"),
                                          (venue.get("address") or {}).get("state")] if x),
            "indoor": bool(venue.get("indoor")),
            "tv": bcast,
            "weather": {"text": weather.get("displayValue") or "",
                        "temp": weather.get("temperature") or weather.get("highTemperature")},
            "spread": odds.get("spread"), "details": odds.get("details") or "",
            "total": odds.get("overUnder"), "book": odds.get("book") or "",
            "home_ml": odds.get("home_ml"), "away_ml": odds.get("away_ml"),
            "live": state == "in",
        })
    games.sort(key=lambda g: (g["date"], g["home"]["name"]))
    return games


def _first_odds(items):
    """ESPN lists a settled provider and a live one. The live book reprices in
    play, so the first non-live provider is the number to show."""
    for o in items or []:
        prov = ((o.get("provider") or {}).get("name") or "")
        if "live" in prov.lower():
            continue
        return {"spread": o.get("spread"), "overUnder": o.get("overUnder"),
                "details": o.get("details"), "book": prov,
                "home_ml": ((o.get("homeTeamOdds") or {}).get("moneyLine")),
                "away_ml": ((o.get("awayTeamOdds") or {}).get("moneyLine"))}
    return {}


def team_stats(team_id, season):
    return _get("%s/seasons/%d/types/2/teams/%s/statistics?lang=en&region=us"
                % (CORE_API, season, team_id))


def _stat(js, category, name):
    for cat in ((js or {}).get("splits") or {}).get("categories") or []:
        if cat.get("name") != category:
            continue
        for s in cat.get("stats") or []:
            if s.get("name") == name:
                return s
    return None


def _num(s):
    if not s:
        return None
    try:
        return float(s.get("value"))
    except (TypeError, ValueError):
        return None


WINDOW = int(os.environ.get("NCAAF_HUB_WINDOW", "15"))


def betting_splits(rows):
    """Every ATS and over/under split, counted off the game log itself.

    NOT from ESPN's odds-records endpoint. That feed is filed under the live
    season and on 2026-09-09 it answered eleven games for a team that had
    played one, so publishing it would have put last season's 2-9 on the page
    under this season's heading. Every split here is counted from games this
    build actually read, each settled against that game's own closing number,
    which is also the only way the sample size can be stated honestly."""
    def tally(pick, key):
        w = l = p = 0
        for r in rows:
            if not pick(r) or not r.get(key):
                continue
            v = r[key]
            if v in ("W", "O"):
                w += 1
            elif v in ("L", "U"):
                l += 1
            else:
                p += 1
        if w + l + p == 0:
            return None
        return {"record": "%d-%d" % (w, l) + ("-%d" % p if p else ""),
                "w": w, "l": l, "p": p, "n": w + l + p,
                "pct": (w / (w + l)) if (w + l) else None}

    su_w = sum(1 for r in rows if r["us"].get("winner"))
    su_l = sum(1 for r in rows if r["them"].get("winner"))
    out = {
        "ats": tally(lambda r: True, "cover"),
        "ats_home": tally(lambda r: r["us"]["home"], "cover"),
        "ats_away": tally(lambda r: not r["us"]["home"], "cover"),
        "ats_fav": tally(lambda r: (r.get("line") or 0) < 0, "cover"),
        "ats_dog": tally(lambda r: (r.get("line") or 0) > 0, "cover"),
        "ou": tally(lambda r: True, "ou"),
        "ou_home": tally(lambda r: r["us"]["home"], "ou"),
        "ou_away": tally(lambda r: not r["us"]["home"], "ou"),
    }
    if su_w or su_l:
        out["su"] = {"record": "%d-%d" % (su_w, su_l), "w": su_w, "l": su_l, "p": 0,
                     "n": su_w + su_l,
                     "pct": (su_w / (su_w + su_l)) if (su_w + su_l) else None}
    return {k: v for k, v in out.items() if v}


def schedule(team_id, season):
    return _get("%s/teams/%s/schedule?season=%d" % (SITE_API, team_id, season))


def _completed(js, team_id):
    rows = []
    for e in (js or {}).get("events") or []:
        comp = (e.get("competitions") or [{}])[0]
        if not ((comp.get("status") or {}).get("type") or {}).get("completed"):
            continue
        us = them = None
        for c in comp.get("competitors") or []:
            t = c.get("team") or {}
            raw = c.get("score")
            if isinstance(raw, dict):
                raw = raw.get("value", raw.get("displayValue"))
            side = {"id": str(t.get("id") or ""),
                    "name": t.get("shortDisplayName") or t.get("displayName") or "",
                    "abbr": (t.get("abbreviation") or "").upper(),
                    "home": c.get("homeAway") == "home",
                    "winner": c.get("winner")}
            try:
                side["score"] = int(float(raw))
            except (TypeError, ValueError):
                side["score"] = None
            if side["id"] == str(team_id):
                us = side
            else:
                them = side
        if not us or not them or us["score"] is None or them["score"] is None:
            continue
        rows.append({"date": (e.get("date") or "")[:10], "iso": e.get("date") or "",
                     "event": str(e.get("id") or ""), "comp": str(comp.get("id") or ""),
                     "us": us, "them": them, "neutral": bool(comp.get("neutralSite"))})
    rows.sort(key=lambda r: r["date"], reverse=True)
    return rows


def closing_line(event_id, comp_id):
    """The settled number on a finished game: home spread and total.

    Without this a results list is a scoreboard. With it, it is a form line
    that says whether the team covered and whether the game went over."""
    d = _get("%s/events/%s/competitions/%s/odds" % (CORE_API, event_id, comp_id))
    for o in (d or {}).get("items") or []:
        prov = ((o.get("provider") or {}).get("name") or "")
        if "live" in prov.lower():
            continue
        spread, total = o.get("spread"), o.get("overUnder")
        if spread is None:
            m = re.search(r"(-?\d+(?:\.\d+)?)", str(o.get("details") or ""))
            spread = m.group(1) if m else None
        try:
            return (float(spread) if spread is not None else None,
                    float(total) if total is not None else None)
        except (TypeError, ValueError):
            return None, None
    return None, None


def game_log(team_id, season, limit=WINDOW):
    """The last `limit` completed games, each settled at its closing number.

    Spans back into the previous season when the current one is young, because
    two games is neither form nor a trend."""
    rows = _completed(schedule(team_id, season), team_id)
    if len(rows) < limit:
        rows = rows + _completed(schedule(team_id, season - 1), team_id)
    rows = rows[:limit]
    _get_many(["%s/events/%s/competitions/%s/odds" % (CORE_API, r["event"], r["comp"])
               for r in rows])
    for r in rows:
        spread, total = closing_line(r["event"], r["comp"])
        r["spread"], r["total"], r["line"] = spread, total, None
        r["cover"] = r["ou"] = None
        if spread is not None:
            home, away = (r["us"], r["them"]) if r["us"]["home"] else (r["them"], r["us"])
            margin = (home["score"] + spread) - away["score"]
            if abs(margin) < 1e-9:
                r["cover"] = "P"
            elif (margin > 0) == bool(r["us"]["home"]):
                r["cover"] = "W"
            else:
                r["cover"] = "L"
            r["line"] = spread if r["us"]["home"] else -spread
        if total is not None:
            pts = r["us"]["score"] + r["them"]["score"]
            r["ou"] = "O" if pts > total else ("U" if pts < total else "P")
    return rows


def head_to_head(a_id, b_id, season, seasons=H2H_SEASONS):
    """Every meeting these two have had in the seasons we can reach."""
    _get_many(["%s/teams/%s/schedule?season=%d" % (SITE_API, a_id, s)
               for s in range(season, season - seasons, -1)])
    met = []
    for s in range(season, season - seasons, -1):
        for r in _completed(schedule(a_id, s), a_id):
            if r["them"]["id"] == str(b_id):
                met.append(r)
    seen, uniq = set(), []
    for r in met:
        if r["event"] in seen:
            continue
        seen.add(r["event"])
        uniq.append(r)
    uniq.sort(key=lambda r: r["date"], reverse=True)
    uniq = uniq[:5]
    _get_many(["%s/events/%s/competitions/%s/odds" % (CORE_API, r["event"], r["comp"])
               for r in uniq])
    for r in uniq:
        r["spread"], r["total"] = closing_line(r["event"], r["comp"])
    return uniq


def standings_points(season):
    """team id -> points for / against, overall, home, away and vs ranked.

    The team statistics feed answers 0 for pointsAllowed and yardsAllowed in
    college football, so scoring defence has to come from here or not at all."""
    d = _get("%s/standings?season=%d&level=1" % (WEB_API, season), 45)

    def walk(node):
        if ((node or {}).get("standings") or {}).get("entries"):
            return node["standings"]["entries"]
        for c in (node or {}).get("children") or []:
            got = walk(c)
            if got:
                return got
        return None

    out = {}
    for e in walk(d) or []:
        tid = str((e.get("team") or {}).get("id") or "")
        if not tid:
            continue
        vals = {}
        for s in e.get("stats") or []:
            vals.setdefault(s.get("type"), s.get("displayValue"))
        out[tid] = vals
    return out


def leaders(team_id, season):
    d = _get("%s/seasons/%d/types/2/teams/%s/leaders?lang=en&region=us"
             % (CORE_API, season, team_id))
    cats = (d or {}).get("categories") or []
    _get_many([_ref(l.get("athlete")) for c in cats for l in (c.get("leaders") or [])[:1]])
    out = {}
    for c in cats:
        for lead in (c.get("leaders") or [])[:1]:
            ath = _get(_ref(lead.get("athlete")))
            if not ath or not ath.get("displayName"):
                continue
            out[c.get("name")] = {
                "name": ath["displayName"],
                "pos": ((ath.get("position") or {}).get("abbreviation") or ""),
                "line": lead.get("displayValue")}
    return out


def coach(team_id, season):
    d = _get("%s/seasons/%d/teams/%s/coaches?lang=en&region=us" % (CORE_API, season, team_id))
    for r in [_ref(i) for i in (d or {}).get("items") or []][:1]:
        j = _get(r)
        if not j:
            continue
        exp = j.get("experience") or {}
        rec = j.get("record")
        return {"name": j.get("displayName") or "",
                "years": exp.get("years"),
                "record": rec.get("summary") if isinstance(rec, dict) else None}
    return None
