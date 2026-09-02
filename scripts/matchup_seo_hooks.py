"""Pick one true, game-specific stat per matchup and freeze it as the SEO hook.

WHY
Every matchup page otherwise carries the same title shape, so a hundred pages
compete for one query and none of them says anything. The hook is the part a
searcher can only find here: a real number about this game, chosen from the
strongest thing the data actually supports.

THE LADDER, strongest first
  1  batter recent form           "Is Batting .375 Over His Last 8 Games"
  2  starting pitcher streak      "Has Allowed 2 Runs or Fewer in 4 Straight Starts"
  2b starting pitcher season line "Takes a 2.81 ERA and 148 Strikeouts Into the Start"
  3  team streak                  "Milwaukee Has Won 8 of Its Last 10"
  4  head to head                 "San Francisco Has Won 36 of 61 Meetings"
  5  verified trend feed          "Cleveland Is 7-3 Against the Spread in Its Last 10"
  6  market trend                 "The Over Is 12-3 in This Matchup"
  7  season record                "Milwaukee Is 84-54 Entering This Game"
A game that supports nothing on the ladder gets no hook and keeps the plain
title. That is deliberate: a page with nothing to say should not pretend.

FROZEN, NOT LIVE
A hook is written into handicapping/_seo_hooks.json under a key built from the
sport, the two teams and the date of that specific game, and is never
recomputed. Titles therefore stay put after the game is played, which is what
makes them safe to index. Only a brand new fixture gets a fresh hook.

NOTHING IS INVENTED
Every claim is computed from a feed and carries the sample it came from. Where
the numbers do not clear the thresholds below, the hook is skipped rather than
softened into something vague.
"""

import io
import json
import os
import re
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
STORE = os.path.join(REPO, "handicapping", "_seo_hooks.json")
STATS_API = "https://statsapi.mlb.com/api/v1"


def _get(url, timeout=40):
    req = urllib.request.Request(url, headers={"Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8"))


# ---------------------------------------------------------------- store

def load_store():
    if not os.path.exists(STORE):
        return {}
    try:
        with io.open(STORE, encoding="utf-8") as fh:
            return json.load(fh)
    except (ValueError, OSError):
        return {}


def save_store(store):
    os.makedirs(os.path.dirname(STORE), exist_ok=True)
    with io.open(STORE, "w", encoding="utf-8", newline="\n") as fh:
        json.dump(store, fh, indent=1, sort_keys=True)
        fh.write("\n")


def game_key(sport, away, home, date):
    """Immutable per fixture. The same two teams meeting again on another date
    is a different key, so that game gets its own hook while the URL stays
    put."""
    return "%s|%s|%s|%s" % (sport.upper(), away, home, (date or "")[:10])


# ---------------------------------------------------------------- MLB

def _ip_to_outs(ip):
    """MLB innings pitched are written 6.1 and 6.2, meaning thirds, not tenths."""
    try:
        whole, _, frac = str(ip).partition(".")
        return int(whole) * 3 + int(frac or 0)
    except ValueError:
        return 0


def pitcher_hook(name, person_id, season):
    """Longest true streak the pitcher's own game log supports."""
    try:
        log = _get("%s/people/%s/stats?stats=gameLog&group=pitching&season=%s"
                   % (STATS_API, person_id, season))
        splits = log["stats"][0]["splits"]
    except Exception:  # noqa: BLE001 - one pitcher failing is not fatal
        return None
    starts = [s for s in splits if (s.get("stat") or {}).get("gamesStarted")]
    if len(starts) < 3:
        return None
    starts.sort(key=lambda s: s.get("date") or "")
    recent = list(reversed(starts))

    def streak(pred):
        n = 0
        for s in recent:
            if pred(s["stat"]):
                n += 1
            else:
                break
        return n

    # Ordered by how much a reader cares, not by how easy they are to hit.
    quality = streak(lambda st: int(st.get("earnedRuns", 99)) <= 2
                     and _ip_to_outs(st.get("inningsPitched", 0)) >= 15)
    if quality >= 3:
        return ("%s Has Allowed 2 Runs or Fewer in %d Straight Starts" % (name, quality),
                "pitcher_streak", {"starts": quality})

    scoreless = streak(lambda st: int(st.get("earnedRuns", 99)) == 0)
    if scoreless >= 2:
        return ("%s Has Not Allowed an Earned Run in %d Straight Starts" % (name, scoreless),
                "pitcher_streak", {"starts": scoreless})

    punchouts = streak(lambda st: int(st.get("strikeOuts", 0)) >= 6)
    if punchouts >= 3:
        return ("%s Has 6 or More Strikeouts in %d Straight Starts" % (name, punchouts),
                "pitcher_streak", {"starts": punchouts})

    # No streak worth the headline. Fall back to the season line, but only when
    # it is genuinely good, so the title is never "carries a 5.20 ERA".
    try:
        season_stats = _get("%s/people/%s/stats?stats=season&group=pitching&season=%s"
                            % (STATS_API, person_id, season))
        st = season_stats["stats"][0]["splits"][0]["stat"]
        era, ks = float(st.get("era", 99)), int(st.get("strikeOuts", 0))
        if era <= 3.80 and ks >= 80:
            return ("%s Takes a %.2f ERA and %d Strikeouts Into the Start" % (name, era, ks),
                    "pitcher_season", {"era": era, "strikeouts": ks})
    except Exception:  # noqa: BLE001
        pass
    return None


# ---------------------------------------------------------------- MLB batters

_ROSTER_CACHE = {}
_TEAM_IDS = {}


def _team_id(name):
    """MLB team id by full name, fetched once per process."""
    if not _TEAM_IDS:
        try:
            for t in _get("%s/teams?sportId=1" % STATS_API)["teams"]:
                _TEAM_IDS[t["name"]] = t["id"]
        except Exception:  # noqa: BLE001
            return None
    return _TEAM_IDS.get(name)


def _top_hitters(team_name, season, limit=4):
    """The bats worth writing a headline about: enough plate appearances to
    mean something, ranked by power and run production."""
    if team_name in _ROSTER_CACHE:
        return _ROSTER_CACHE[team_name]
    tid = _team_id(team_name)
    if not tid:
        _ROSTER_CACHE[team_name] = []
        return []
    try:
        r = _get("%s/teams/%s/roster?rosterType=active"
                 "&hydrate=person(stats(type=season,season=%s,group=hitting))"
                 % (STATS_API, tid, season))
    except Exception:  # noqa: BLE001
        _ROSTER_CACHE[team_name] = []
        return []
    out = []
    for entry in r.get("roster") or []:
        person = entry.get("person") or {}
        for block in person.get("stats") or []:
            for split in block.get("splits") or []:
                st = split.get("stat") or {}
                if int(st.get("atBats") or 0) >= 150:
                    out.append({"name": person.get("fullName"), "id": person.get("id"),
                                "hr": int(st.get("homeRuns") or 0),
                                "rbi": int(st.get("rbi") or 0)})
    out.sort(key=lambda c: -(c["hr"] * 3 + c["rbi"]))
    _ROSTER_CACHE[team_name] = out[:limit]
    return _ROSTER_CACHE[team_name]


def _batter_lines(person_id, season):
    """Recent-form numbers straight from the player's own game log."""
    try:
        log = _get("%s/people/%s/stats?stats=gameLog&group=hitting&season=%s"
                   % (STATS_API, person_id, season))
        games = log["stats"][0]["splits"]
    except Exception:  # noqa: BLE001
        return None
    if len(games) < 10:
        return None
    last8 = games[-8:]
    ab8 = sum(int(g["stat"].get("atBats") or 0) for g in last8)
    h8 = sum(int(g["stat"].get("hits") or 0) for g in last8)
    last10 = games[-10:]
    streak = 0
    for g in reversed(games):
        if int(g["stat"].get("atBats") or 0) == 0:
            continue          # a pinch-run or day off does not break a streak
        if int(g["stat"].get("hits") or 0) > 0:
            streak += 1
        else:
            break
    return {
        "avg8": (h8 / ab8) if ab8 else 0.0, "ab8": ab8, "h8": h8,
        "hr10": sum(int(g["stat"].get("homeRuns") or 0) for g in last10),
        "rbi10": sum(int(g["stat"].get("rbi") or 0) for g in last10),
        "streak": streak,
    }


def batter_hook(away, home, season):
    """Strongest true recent-form line among either side's real bats.

    Deliberately not restricted to a confirmed lineup: batting orders are not
    posted early enough to build a page around, and "Soto has 5 homers in his
    last 10" is true and useful whether or not he is later penciled in. The
    wording never claims he is starting.
    """
    best = None
    for team in (away, home):
        for cand in _top_hitters(team, season):
            line = _batter_lines(cand["id"], season)
            if not line:
                continue
            name = cand["name"]
            options = []
            if line["hr10"] >= 5:
                options.append((100 + line["hr10"],
                                "%s Has %d Home Runs in His Last 10 Games" % (name, line["hr10"]),
                                {"hr10": line["hr10"]}))
            if line["avg8"] >= 0.375 and line["ab8"] >= 20:
                options.append((90 + line["avg8"] * 10,
                                "%s Is Batting .%03d Over His Last 8 Games"
                                % (name, round(line["avg8"] * 1000)),
                                {"avg8": round(line["avg8"], 3), "at_bats": line["ab8"]}))
            if line["streak"] >= 10:
                options.append((80 + line["streak"],
                                "%s Has Hit Safely in %d Straight Games" % (name, line["streak"]),
                                {"streak": line["streak"]}))
            if line["hr10"] in (3, 4):
                options.append((70 + line["hr10"],
                                "%s Has %d Home Runs in His Last 10 Games"
                                % (name, line["hr10"]), {"hr10": line["hr10"]}))
            if 0.333 <= line["avg8"] < 0.375 and line["ab8"] >= 18:
                options.append((65, "%s Is Batting .%03d Over His Last 8 Games"
                                % (name, round(line["avg8"] * 1000)),
                                {"avg8": round(line["avg8"], 3), "at_bats": line["ab8"]}))
            if 6 <= line["streak"] < 10:
                options.append((60, "%s Has Hit Safely in %d Straight Games" % (name, line["streak"]),
                                {"streak": line["streak"]}))
            if line["rbi10"] >= 9:
                options.append((55, "%s Has %d RBI in His Last 10 Games" % (name, line["rbi10"]),
                                {"rbi10": line["rbi10"]}))
            for score, text, evidence in options:
                if not best or score > best[0]:
                    best = (score, text, evidence)
    return (best[1], "batter", best[2]) if best else None


def mlb_probables(date):
    """{team name: (pitcher name, id)} for one slate date."""
    out = {}
    try:
        d = _get("%s/schedule?sportId=1&date=%s&hydrate=probablePitcher,team" % (STATS_API, date))
    except Exception:  # noqa: BLE001
        return out
    for day in d.get("dates") or []:
        for g in day.get("games") or []:
            for side in ("away", "home"):
                t = g["teams"][side]
                pp = t.get("probablePitcher") or {}
                if pp.get("id") and pp.get("fullName"):
                    out[(t["team"]["name"], side, g.get("gameDate", "")[:10])] = (
                        pp["fullName"], pp["id"])
    return out


# ---------------------------------------------------------------- generic

# Two-word nicknames exist and stripping only the last word leaves "Boston Red"
# and "Chicago White", which is worse than not shortening at all.
_TWO_WORD_NICKNAMES = ("Red Sox", "White Sox", "Blue Jays", "Trail Blazers",
                       "Maple Leafs", "Golden Knights", "Golden State Warriors")
# Clubs whose nickname is grammatically singular, so they take "has", not "have".
_SINGULAR_NICKNAMES = ("Heat", "Jazz", "Magic", "Thunder", "Lightning", "Wild",
                       "Avalanche", "Utah", "Storm", "Sky", "Dream", "Fever")


def short_name(team):
    """"Milwaukee Brewers" -> "Milwaukee", but "Boston Red Sox" -> "Boston".

    Keeps a headline readable without losing which club it is, and without
    producing half a nickname."""
    name = (team or "").strip()
    for nick in _TWO_WORD_NICKNAMES:
        if name.endswith(nick):
            trimmed = name[: -len(nick)].strip()
            return trimmed or name
    parts = name.split()
    if len(parts) < 2:
        return name          # "Athletics" has no city to strip
    trimmed = " ".join(parts[:-1])
    return trimmed if len(trimmed) > 2 else name


def verb(team, singular, plural):
    """Agree with the label the headline actually prints, not the club's name.

    American usage takes the city as singular and the nickname as plural:
    "Seattle has won 10 straight" but "the Seahawks have won 10 straight".
    short_name() usually reduces to a city, so that is the singular case. The
    exception is a club with no city to strip, "Athletics", which stays plural.
    An earlier version picked the number from the nickname and produced
    "Seattle Have Won", which reads as a mistake in a title.
    """
    label = short_name(team)
    if label != (team or "").strip():
        return singular                      # shortened to a city
    last = label.split()[-1] if label else ""
    if last in _SINGULAR_NICKNAMES:
        return singular
    return plural if last.endswith("s") else singular


def team_streak_hook(hist):
    """Strongest recent-form line either side supports."""
    best = None
    for key in ("team_1_context", "team_2_context"):
        c = (hist or {}).get(key) or {}
        team, rec, streak = c.get("team"), c.get("last_10_record"), c.get("current_streak")
        if not team:
            continue
        if rec and "-" in rec:
            try:
                w, losses = (int(x) for x in rec.split("-")[:2])
            except ValueError:
                w = losses = 0
            if w >= 7:
                cand = ("%s %s Won %d of %s Last %d"
                        % (short_name(team), verb(team, "Has", "Have"), w,
                           verb(team, "Its", "Their"), w + losses),
                        "team_form", {"record": rec})
                if not best or w > best[2].get("wins", 0):
                    best = (cand[0], cand[1], {"record": rec, "wins": w})
        if streak and re.fullmatch(r"[WL]\d+", streak or ""):
            n = int(streak[1:])
            if n >= 4:
                word = "Won" if streak[0] == "W" else "Lost"
                cand = ("%s %s %s %d Straight"
                        % (short_name(team), verb(team, "Has", "Have"), word, n),
                        "team_streak", {"streak": streak})
                if not best or n >= 6:
                    best = (cand[0], cand[1], {"streak": streak, "wins": n})
    return best


def h2h_hook(hist):
    ms = (hist or {}).get("matchup_summary") or {}
    t1 = ms.get("team_1") or {}
    total = ms.get("qualifying_games") or 0
    wins = t1.get("wins") or 0
    if total >= 8 and wins and (wins / total) >= 0.62:
        return ("%s %s Won %d of the Last %d Meetings"
                % (short_name(t1["team"]), verb(t1["team"], "Has", "Have"), wins, total),
                "h2h", {"wins": wins, "meetings": total})
    return None


def market_hook(hist):
    mk = ((hist or {}).get("matchup_summary") or {}).get("market") or {}
    ats = mk.get("ats") or {}
    rec, pct = ats.get("record"), ats.get("cover_pct")
    if rec and pct and pct >= 60 and (ats.get("eligible_games") or 0) >= 10:
        team = (ats.get("label") or "").split(" against")[0]
        if team:
            return ("%s %s %s Against the Spread in This Matchup"
                    % (short_name(team), verb(team, "Is", "Are"), rec),
                    "ats", {"record": rec, "cover_pct": pct})
    ou = mk.get("over_under") or {}
    if (ou.get("graded_games") or 0) >= 10 and ou.get("over_pct") is not None:
        overs, unders = ou.get("overs", 0), ou.get("unders", 0)
        if max(overs, unders) / max(overs + unders, 1) >= 0.65:
            side = "Over" if overs > unders else "Under"
            return ("The %s Is %d-%d in This Matchup" % (side, max(overs, unders),
                                                         min(overs, unders)),
                    "total", {"overs": overs, "unders": unders})
    return None


# ---------------------------------------------------------------- choose

def candidates(sport, away, home, date, hist=None, probables=None, season=None,
               trends=None, records=None):
    """Every hook this game can honestly support, strongest first.

    A list rather than a single answer so the caller can skip one that another
    game already used. Cal Raleigh homering six times in ten days is true for
    both of his team's fixtures, but two pages must not carry the same title.
    """
    out = []
    if sport.upper() == "MLB":
        hook = batter_hook(away, home, season)
        if hook:
            out.append(hook)
        for team, side in ((away, "away"), (home, "home")):
            entry = (probables or {}).get((team, side, (date or "")[:10]))
            if entry:
                hook = pitcher_hook(entry[0], entry[1], season)
                if hook:
                    out.append(hook)
    for fn in (team_streak_hook, h2h_hook):
        hook = fn(hist)
        if hook:
            out.append(hook)
    hook = trend_hook(trends)
    if hook:
        out.append(hook)
    hook = market_hook(hist)
    if hook:
        out.append(hook)
    hook = record_hook(records, away, home)
    if hook:
        out.append(hook)
    return out


def trend_hook(trends):
    """Strongest verified trend for this game, phrased as a headline.

    The feed writes claims for its own page ("New York Yankees is 6-4 on the
    MONEYLINE in its last 10 completed games."), which is not a title. The
    record and the market are what matter, so they are rebuilt into one, and
    only when the split is lopsided enough to be worth reading.
    """
    best = None
    for t in trends or []:
        rec = (t.get("record") or "").strip()
        parts = rec.split("-")
        if len(parts) < 2:
            continue
        try:
            wins, losses = int(parts[0]), int(parts[1])
        except ValueError:
            continue
        total = wins + losses
        if total < 10 or wins < 7:
            continue
        team = t.get("team_abbr") or ""
        label, verb_is = short_name(team), verb(team, "Is", "Are")
        market = (t.get("market") or t.get("bet_type") or "").upper()
        kind = (t.get("kind") or "").upper()
        if market == "MONEYLINE":
            text = "%s %s Won %d of %s Last %d" % (
                label, verb(team, "Has", "Have"), wins, verb(team, "Its", "Their"), total)
        elif market == "SPREAD":
            text = "%s %s %d-%d Against the Spread in %s Last %d" % (
                label, verb_is, wins, losses, verb(team, "Its", "Their"), total)
        elif market == "TOTAL":
            side = "Over" if "OVER" in (t.get("claim") or "").upper() else "Under"
            text = "The %s Is %d-%d in %s Last %d Games" % (
                side, wins, losses, "%s's" % label, total)
        else:
            continue          # team totals are too niche for a headline
        score = wins + (2 if kind == "RECENT_FORM" else 0)
        if not best or score > best[0]:
            best = (score, text, {"record": rec, "market": market,
                                  "sample": t.get("sample"), "kind": kind})
    return (best[1], "verified_trend", best[2]) if best else None


def record_hook(records, away, home):
    """Last resort, and still a real number: how the two sides actually stand.

    Nine of forty two games supported nothing higher on the ladder, and a
    generic title on a page that does have facts is a wasted page. Season
    record, a hot or cold ten game stretch, or a live streak are all specific,
    checkable and true entering the game.
    """
    if not records:
        return None
    best = None
    for side, team in (("away", away), ("home", home)):
        r = (records.get(side) or {})
        if not r.get("available"):
            continue
        label = short_name(team)
        has = verb(team, "Has", "Have")
        is_ = verb(team, "Is", "Are")
        its = verb(team, "Its", "Their")
        last10 = r.get("last10") or ""
        streak = r.get("streak") or ""
        wins, losses = r.get("wins"), r.get("losses")
        if "-" in last10:
            try:
                lw, ll = (int(x) for x in last10.split("-")[:2])
            except ValueError:
                lw = ll = 0
            if lw >= 7:
                cand = (40 + lw, "%s %s Won %d of %s Last %d" % (label, has, lw, its, lw + ll),
                        {"last10": last10})
                if not best or cand[0] > best[0]:
                    best = cand
            elif ll >= 7:
                cand = (35 + ll, "%s %s Lost %d of %s Last %d" % (label, has, ll, its, lw + ll),
                        {"last10": last10})
                if not best or cand[0] > best[0]:
                    best = cand
        if len(streak) > 1 and streak[0] in "WL" and streak[1:].isdigit():
            n = int(streak[1:])
            if n >= 4:
                word = "Won" if streak[0] == "W" else "Lost"
                cand = (45 + n, "%s %s %s %d Straight" % (label, has, word, n), {"streak": streak})
                if not best or cand[0] > best[0]:
                    best = cand
        if wins is not None and losses is not None and (wins + losses) >= 40:
            cand = (20 + (wins - losses) / 10.0,
                    "%s %s %d-%d Entering This Game" % (label, is_, wins, losses),
                    {"record": "%d-%d" % (wins, losses)})
            if not best or cand[0] > best[0]:
                best = cand
    return (best[1], "team_record", best[2]) if best else None


def choose_hook(sport, away, home, date, hist=None, probables=None, season=None,
                used=None, trends=None, records=None):
    """First hook on the ladder that no other page has already taken."""
    used = used or set()
    options = candidates(sport, away, home, date, hist, probables, season, trends,
                         records)
    for hook in options:
        if hook[0] not in used:
            return hook
    return None


def hook_for(sport, away, home, date, hist=None, probables=None, season=None,
             store=None, used=None, trends=None, records=None):
    """Frozen hook for this fixture, computed once on first sight.

    Returns (text, source, evidence) or None. The store keeps it stable for
    every later build, so a title never changes after the game is played."""
    store = load_store() if store is None else store
    key = game_key(sport, away, home, date)
    if key in store:
        e = store[key]
        if e.get("hook") and used is not None:
            used.add(e["hook"])
        return (e["hook"], e["source"], e.get("evidence")) if e.get("hook") else None
    hook = choose_hook(sport, away, home, date, hist, probables, season, used,
                       trends, records)
    store[key] = ({"hook": hook[0], "source": hook[1], "evidence": hook[2],
                   "frozen": (date or "")[:10]}
                  if hook else {"hook": None, "source": None, "frozen": (date or "")[:10]})
    if hook and used is not None:
        used.add(hook[0])
    return hook
