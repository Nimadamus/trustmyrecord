#!/usr/bin/env python3
"""NFL FEATURED GAME ROTATION transitions. NFL_SCHEDULE_ROTATION_20260915.

On Tuesday 2026-09-15 the sportsbook banner still showed Monday night's finished
Broncos at Chiefs game because nothing queued Thursday's game. These fixtures hold
the schedule driven rotation in place, offline, with ESPN shaped events built
here (fictional clubs, so no real matchup is written into a test):

  Sunday -> Monday, Monday final -> Thursday, Thursday final -> Sunday,
  Sunday completion -> Monday, a week with no Thursday game, Thanksgiving,
  Christmas and December Saturdays, the postseason (Pro Bowl excluded),
  a postponed then rescheduled game, cache invalidation (baked surface and
  browser fetch), a spread move that must not flip the pick, a feed outage,
  the safety cap, and a whole simulated week checked hour by hour: a finished
  game is never the feature while a future game exists.

  python tests/featured-nfl-rotation-test.py
"""

import copy
import datetime as dt
import json
import os
import re
import shutil
import sys
import tempfile
from zoneinfo import ZoneInfo

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "scripts"))
import featured_matchups as fm  # noqa: E402
import nfl_featured_rotation as rot  # noqa: E402

ET = ZoneInfo("America/New_York")
failures = 0


def ok(msg):
    print("  ok    " + msg)


def check(cond, msg):
    global failures
    if cond:
        ok(msg)
    else:
        failures += 1
        print("  FAIL  " + msg)


def at(y, mo, d, h, mi=0):
    """An Eastern wall clock instant, in UTC."""
    return dt.datetime(y, mo, d, h, mi, tzinfo=ET).astimezone(dt.timezone.utc)


def iso(t):
    return t.strftime("%Y-%m-%dT%H:%MZ")


CLUBS = {
    "AAA": ("Alphas", "Alpha City"), "BBB": ("Bravos", "Bravo Bay"), "CCC": ("Comets", "Comet Falls"),
    "DDD": ("Dragons", "Dragon Hill"), "EEE": ("Eagles2", "East End"), "FFF": ("Foxes", "Fox Point"),
    "GGG": ("Giants2", "Grand Gate"), "HHH": ("Hawks", "High Harbor"), "III": ("Ibis", "Iron Isle"),
    "JJJ": ("Jaguars2", "Jade Junction"),
}


def ev(eid, kickoff, away, home, state="pre", stype=2, week=2, spread=None, notes="", neutral=False,
       time_valid=True, country="USA", city="Anytown", records=("0-0", "0-0")):
    names = {"pre": ("STATUS_SCHEDULED", False), "in": ("STATUS_IN_PROGRESS", False),
             "post": ("STATUS_FINAL", True), "postponed": ("STATUS_POSTPONED", False)}
    name, completed = names[state]

    def comp(abbr, side, rec):
        nick, loc = CLUBS[abbr]
        return {"homeAway": side, "records": [{"summary": rec}],
                "team": {"abbreviation": abbr, "name": nick, "shortDisplayName": nick,
                         "displayName": "%s %s" % (loc, nick), "location": loc}}
    return {
        "id": str(eid), "date": iso(kickoff), "season": {"year": 2026, "type": stype}, "week": {"number": week},
        "status": {"type": {"name": name, "state": "post" if state == "postponed" else state, "completed": completed}},
        "competitions": [{
            "timeValid": time_valid, "neutralSite": neutral,
            "notes": [{"headline": notes}] if notes else [],
            "venue": {"address": {"city": city, "country": country}},
            "odds": [{"details": "%s -%s" % (home, spread)}] if spread is not None else [],
            "competitors": [comp(home, "home", records[1]), comp(away, "away", records[0])],
        }],
    }


def state_at(kick, now, length_h=3.25):
    if now < kick:
        return "pre"
    return "in" if now < kick + dt.timedelta(hours=length_h) else "post"


def registry():
    return {"grace_minutes": 210, "sports": {"nfl": {
        "label": "NFL", "hub": "/handicapping/nfl/", "doors": [],
        "strips": [{"file": "sportsbook/index.html", "marker": "featuredStripNfl"}],
        "features": []}}}


def sandbox(reg=None):
    root = tempfile.mkdtemp(prefix="nflrot-")
    os.makedirs(os.path.join(root, "data"))
    os.makedirs(os.path.join(root, "sportsbook"))
    with open(os.path.join(root, "data", "featured-matchups.json"), "w", encoding="utf-8") as fh:
        json.dump(reg or registry(), fh)
    with open(os.path.join(root, "sportsbook", "index.html"), "w", encoding="utf-8") as fh:
        fh.write("<html><body><!--MK:featuredStripNfl--><!--/MK:featuredStripNfl--></body></html>\n")
    return root


def run(events, now, reg=None, root=None):
    """One rotation pass in memory. Returns (registry, current entry, log lines)."""
    reg = reg if reg is not None else registry()
    root = root or ROOT_EMPTY
    games = [g for g in (rot.normalize(e) for e in events) if g]
    _, lines, _ = rot.apply(reg, games, now, root, fm.resolve)
    return reg, fm.resolve(reg, "nfl", now), lines


ROOT_EMPTY = tempfile.mkdtemp(prefix="nflrot-empty-")


def teams(entry):
    return (entry or {}).get("away"), (entry or {}).get("home")


# A standard week: Sunday 1pm x2, 4:25 national, SNF, MNF, next TNF, next Sunday, next MNF.
def week(now, overrides=None):
    o = overrides or {}
    sched = [
        (1, at(2026, 9, 20, 13), "AAA", "BBB", 1.5), (2, at(2026, 9, 20, 13), "CCC", "DDD", 9.5),
        (3, at(2026, 9, 20, 16, 25), "EEE", "FFF", 3), (4, at(2026, 9, 20, 20, 20), "GGG", "HHH", 6.5),
        (5, at(2026, 9, 21, 20, 15), "III", "JJJ", 7), (6, at(2026, 9, 24, 20, 15), "BBB", "CCC", 2.5),
        (7, at(2026, 9, 27, 13), "DDD", "AAA", 3), (8, at(2026, 9, 27, 20, 20), "FFF", "EEE", 4),
        (9, at(2026, 9, 28, 20, 15), "HHH", "GGG", 1),
    ]
    out = []
    for eid, kick, a, h, spread in sched:
        if eid in o.get("drop", ()):
            continue
        kick = o.get("move", {}).get(eid, kick)
        st = o.get("state", {}).get(eid) or state_at(kick, now)
        out.append(ev(eid, kick, a, h, state=st, week=3 if kick >= at(2026, 9, 22, 6) else 2, spread=spread))
    return out


def main():
    print("NFL featured rotation")

    # Sunday -> Monday
    now = at(2026, 9, 21, 0, 45)   # 12:45am ET Monday, SNF final
    _, cur, _ = run(week(now), now)
    check(teams(cur) == ("III", "JJJ") and cur["label"] == "Monday Night Football",
          "Sunday slate final -> Monday Night Football (%s, %s)" % (teams(cur), cur and cur["label"]))

    # Sunday feature while the slate is under way: SNF held, not the first kickoff.
    now = at(2026, 9, 18, 9)
    _, cur, _ = run(week(now), now)
    check(teams(cur) == ("GGG", "HHH") and cur["label"] == "Sunday Night Football",
          "Friday: Sunday night game featured, not the first kickoff (%s)" % (teams(cur),))
    now = at(2026, 9, 20, 17)      # 5pm Sunday: 1pm games final, SNF still to play
    _, cur, _ = run(week(now), now)
    check(teams(cur) == ("GGG", "HHH"), "Sunday 5pm: featured Sunday game kept until it is played")

    # Monday final -> Thursday, driven by status the same night, not by midnight.
    reg = registry()
    now = at(2026, 9, 21, 22, 30)
    reg, cur, _ = run(week(now), now, reg)
    check(teams(cur) == ("III", "JJJ"), "MNF in progress at 10:30pm ET stays featured")
    now = at(2026, 9, 21, 23, 35)
    ev_final = week(now, {"state": {5: "post"}})
    reg, cur, lines = run(ev_final, now, reg)
    check(teams(cur) == ("BBB", "CCC") and cur["label"] == "Thursday Night Football",
          "MNF FINAL at 11:35pm ET -> Thursday Night Football immediately (%s)" % (teams(cur),))
    check(lines and lines[1] == "Previous: III @ JJJ, FINAL" and "Reason: Previous featured game completed" in lines
          and lines[2].startswith("Next: BBB @ CCC, Thu Sep 24, 8:15 PM ET"),
          "rotation log names previous FINAL, next kickoff and reason: %s" % (lines,))
    check(lines and re.match(r"^Updated: \w{3} \w{3} \d+ 2026, \d+:\d\d (AM|PM) PDT$", lines[-1]),
          "rotation log timestamp is Pacific: %s" % (lines and lines[-1]))
    check(reg["sports"]["nfl"]["rotation_log"][-1]["reason"] == "Previous featured game completed",
          "transition persisted to rotation_log")

    # Thursday final -> Sunday
    now = at(2026, 9, 24, 23, 40)
    _, cur, _ = run(week(now, {"state": {6: "post"}}), now)
    check(teams(cur) == ("FFF", "EEE"), "TNF FINAL -> featured Sunday game (%s)" % (teams(cur),))

    # Sunday completion -> Monday
    now = at(2026, 9, 27, 23, 50)
    _, cur, _ = run(week(now, {"state": {8: "post"}}), now)
    check(teams(cur) == ("HHH", "GGG") and cur["label"] == "Monday Night Football",
          "featured Sunday game FINAL -> next Monday Night Football")

    # Missing Thursday
    now = at(2026, 9, 22, 9)
    _, cur, _ = run(week(now, {"drop": (6,)}), now)
    check(teams(cur) == ("FFF", "EEE"), "no Thursday game: MNF final -> next Sunday feature (%s)" % (teams(cur),))

    # Editorial page wins its slot; once played, the slot's next game takes over.
    reg = registry()
    reg["sports"]["nfl"]["features"].append({
        "id": "page:/nfl/alphas-bravos/", "source": "page", "status": "active", "href": "/nfl/alphas-bravos/",
        "headline": "Alphas at Bravos", "matchup": "Alphas at Bravos", "cta": "Full Breakdown",
        "away_logo": rot.LOGO % "aaa", "home_logo": rot.LOGO % "bbb", "kickoff_utc": iso(at(2026, 9, 20, 13))})
    now = at(2026, 9, 19, 12)
    reg, cur, _ = run(week(now), now, reg)
    check(teams(cur) == ("AAA", "BBB") and cur["href"] == "/nfl/alphas-bravos/" and cur["label"] == "NFL Featured Matchup",
          "hand built feature page chooses the Sunday game and is the link (%s)" % (cur and cur["href"],))
    now = at(2026, 9, 20, 16, 30)
    reg, cur, _ = run(week(now), now, reg)
    check(teams(cur) == ("GGG", "HHH"), "that game FINAL -> Sunday night game, never the finished one")

    # Thanksgiving, December Saturday, Christmas
    now = at(2026, 11, 24, 9)
    tg = [ev(20, at(2026, 11, 26, 12, 30), "AAA", "BBB", week=12), ev(21, at(2026, 11, 26, 16, 30), "CCC", "DDD", week=12),
          ev(22, at(2026, 11, 26, 20, 20), "EEE", "FFF", week=12), ev(23, at(2026, 11, 29, 13), "GGG", "HHH", week=12)]
    _, cur, _ = run(tg, now)
    check(teams(cur) == ("EEE", "FFF") and cur["label"] == "Thanksgiving Football",
          "Thanksgiving: holiday slate featured with its own label (%s)" % (cur and cur["label"],))
    now = at(2026, 12, 17, 23, 45)
    sat = [ev(30, at(2026, 12, 17, 20, 15), "AAA", "BBB", state="post", week=16),
           ev(31, at(2026, 12, 19, 16, 30), "CCC", "DDD", week=16), ev(32, at(2026, 12, 19, 20, 15), "EEE", "FFF", week=16),
           ev(33, at(2026, 12, 20, 20, 20), "GGG", "HHH", week=16)]
    _, cur, _ = run(sat, now)
    check(teams(cur) == ("EEE", "FFF") and "Saturday, December 19" in cur["when"],
          "December Saturday games come before Sunday, straight from the schedule (%s)" % (cur and cur["when"],))
    now = at(2026, 12, 23, 9)
    xmas = [ev(40, at(2026, 12, 25, 13), "AAA", "BBB", week=17), ev(41, at(2026, 12, 25, 20, 15), "CCC", "DDD", week=17)]
    _, cur, _ = run(xmas, now)
    check(cur["label"] == "Christmas Football" and teams(cur) == ("CCC", "DDD"), "Christmas Day game labelled Christmas Football")

    # International game and a flexed game with no time yet
    now = at(2026, 10, 9, 9)
    intl = [ev(50, at(2026, 10, 11, 9, 30), "AAA", "BBB", week=6, country="England", city="London")]
    _, cur, _ = run(intl, now)
    check(cur["when"].endswith("9:30am ET · London") and cur["label"] == "NFL Featured Matchup",
          "international game: venue city in the date line (%s)" % cur["when"])
    now = at(2027, 1, 5, 9)
    flex = [ev(51, dt.datetime(2027, 1, 10, 5, tzinfo=dt.timezone.utc), "CCC", "DDD", week=18, time_valid=False)]
    _, cur, _ = run(flex, now)
    check(cur and "Time TBD" in cur["when"], "flexed game without a kickoff time says Time TBD (%s)" % (cur and cur["when"],))

    # Postseason
    now = at(2027, 1, 14, 9)
    post = [ev(60, at(2027, 1, 16, 16, 30), "AAA", "BBB", stype=3, week=1, notes="AFC Wild Card Playoffs"),
            ev(61, at(2027, 1, 16, 20, 15), "CCC", "DDD", stype=3, week=1, notes="NFC Wild Card Playoffs"),
            ev(62, at(2027, 1, 17, 13), "EEE", "FFF", stype=3, week=1, notes="AFC Wild Card Playoffs")]
    _, cur, _ = run(post, now)
    check(teams(cur) == ("CCC", "DDD") and cur["label"] == "Wild Card Round" and "Wild Card Round" in cur["when"],
          "postseason Saturday: Wild Card Round featured with its round name")
    now = at(2027, 2, 3, 9)
    sb = [ev(70, at(2027, 2, 3, 20), "AAA", "BBB", stype=3, week=4, notes="Pro Bowl Games", neutral=True),
          ev(71, at(2027, 2, 14, 18, 30), "CCC", "DDD", stype=3, week=5, notes="Super Bowl LXI", neutral=True)]
    sb[0]["competitions"][0]["competitors"][0]["team"]["abbreviation"] = "AFC"
    _, cur, _ = run(sb, now)
    check(teams(cur) == ("CCC", "DDD") and cur["label"] == "Super Bowl" and cur["matchup"] == "Comets vs Dragons",
          "Pro Bowl skipped; Super Bowl across the bye week, neutral site reads vs")
    reg, _, _ = run(sb, now)
    now = at(2027, 2, 15, 9)
    _, cur, _ = run([ev(71, at(2027, 2, 14, 18, 30), "CCC", "DDD", state="post", stype=3, week=5, neutral=True)], now, reg)
    check(cur and cur["game_state"] == "final", "offseason: nothing ahead, the last game stays (no future game exists)")

    # Postponed, then rescheduled
    reg = registry()
    now = at(2026, 9, 22, 9)
    reg, cur, _ = run(week(now), now, reg)
    check(teams(cur) == ("BBB", "CCC"), "TNF queued")
    now = at(2026, 9, 24, 12)
    reg, cur, lines = run(week(now, {"state": {6: "postponed"}}), now, reg)
    check(teams(cur) == ("FFF", "EEE") and lines and "postponed" in lines[4],
          "TNF POSTPONED -> next featured game, reason logged (%s)" % (lines and lines[4],))
    check(fm.resolve_live(reg, "nfl", now)["event_id"] != "6"
          and not any(f.get("event_id") == "6" and f.get("game_state") not in fm.ENDED_STATES
                      for f in reg["sports"]["nfl"]["features"]),
          "postponed game can never resolve live")
    stale = copy.deepcopy(reg)
    for f in stale["sports"]["nfl"]["features"]:
        if f.get("event_id") == "6":
            f["game_state"] = "postponed"
    stale["sports"]["nfl"]["features"].append(dict(cur, id="nfl-event:6", event_id="6", game_state="postponed",
                                                   kickoff_utc=iso(at(2026, 9, 24, 20, 15))))
    check(fm.resolve(stale, "nfl", now)["event_id"] != "6", "an entry marked postponed is skipped by the resolver")
    new_kick = at(2026, 9, 26, 16, 30)
    now = at(2026, 9, 25, 9)
    reg, cur, _ = run(week(now, {"move": {6: new_kick}, "state": {6: "pre"}}), now, reg)
    check(teams(cur) == ("BBB", "CCC") and cur["kickoff_utc"] == new_kick.strftime("%Y-%m-%dT%H:%M:%SZ")
          and "Saturday, September 26" in cur["when"],
          "rescheduled to Saturday -> featured again with the new date (%s)" % (cur and cur["when"],))

    # A spread move must not flip a queued pick.
    reg = registry()
    now = at(2026, 9, 18, 9)
    reg, cur, _ = run(week(now), now, reg)
    moved = week(now)
    for e in moved:
        if e["id"] == "3":
            e["competitions"][0]["odds"] = [{"details": "FFF -0.5"}]
            e["competitions"][0]["competitors"][0]["records"] = [{"summary": "4-0"}]
            e["competitions"][0]["competitors"][1]["records"] = [{"summary": "4-0"}]
    reg, cur, _ = run(moved, now, reg)
    check(teams(cur) == ("GGG", "HHH"), "queued Sunday pick held when another game's line moves")

    # Every surface field comes from one entry.
    now = at(2026, 9, 22, 9)
    _, cur, _ = run(week(now), now)
    check(cur["away_logo"].endswith("/bbb.png&h=96&w=96") and cur["home_logo"].endswith("/ccc.png&h=96&w=96")
          and cur["matchup"] == "Bravos at Comets" and cur["when"] == "Thursday, September 24 · Week 3 · 8:15pm ET",
          "label, teams, logos, date, week and kickoff all from the selected event")

    # Article link: the automatic breakdown for that exact game.
    root = sandbox()
    try:
        os.makedirs(os.path.join(root, "handicapping", "nfl", "bravos-comets-1"))
        with open(os.path.join(root, "handicapping", "nfl", "bravos-comets-1", "index.html"), "w", encoding="utf-8") as fh:
            fh.write("<title>Bravo Bay Bravos vs Comet Falls Comets: A Hook</title> 10,000 simulations")
        with open(os.path.join(root, "handicapping", "_seo_hooks.json"), "w", encoding="utf-8") as fh:
            json.dump({"NFL|Bravo Bay Bravos|Comet Falls Comets|2026-09-25": {"slug": "bravos-comets-1",
                       "page": "/handicapping/nfl/bravos-comets-1/"}}, fh)
        events = week(now)
        code = fm.rotate(now=now, root=root, fetch=lambda _now: events)
        reg = fm.load(os.path.join(root, "data", "featured-matchups.json"))
        cur = fm.resolve(reg, "nfl", now)
        check(code == 0 and cur["href"] == "/handicapping/nfl/bravos-comets-1/"
              and cur["cta"] == "Full Breakdown, Odds & 10,000 Simulations"
              and cur["headline"] == "Bravo Bay Bravos vs Comet Falls Comets: A Hook",
              "CTA opens that game's own breakdown, text taken from the article (%s)" % cur["href"])
        strip = open(os.path.join(root, "sportsbook", "index.html"), encoding="utf-8").read()
        check('href="/handicapping/nfl/bravos-comets-1/"' in strip and "Thursday Night Football" in strip
              and "bbb.png" in strip, "cache invalidation: baked strip rewritten in the same run")
        # Monday night ends: the next run rewrites the baked strip, no stale copy survives.
        later = at(2026, 9, 24, 23, 45)
        events2 = week(later, {"state": {6: "post"}})
        fm.rotate(now=later, root=root, fetch=lambda _now: events2)
        strip = open(os.path.join(root, "sportsbook", "index.html"), encoding="utf-8").read()
        check("bravos-comets-1" not in strip and "Bravos at Comets" not in strip and "Foxes at Eagles2" in strip,
              "cache invalidation: finished game gone from the baked strip after the transition")
        check(fm.sync(check=True, now=later, root=root) == 0, "sync --check agrees with the rotated registry")
        # Feed outage: nothing changes, nothing fails.
        before = open(os.path.join(root, "data", "featured-matchups.json"), encoding="utf-8").read()

        def boom(_now):
            raise OSError("feed down")
        code = fm.rotate(now=later, root=root, fetch=boom)
        after = open(os.path.join(root, "data", "featured-matchups.json"), encoding="utf-8").read()
        check(code == 0 and before == after, "schedule feed outage leaves the registry untouched and exits 0")
    finally:
        shutil.rmtree(root, ignore_errors=True)

    # Browser side cache: the runtime always refetches the registry.
    js = open(os.path.join(ROOT, "static", "js", "tmr-featured.js"), encoding="utf-8").read()
    check("cache: 'no-store'" in js and "'?b=' + bucket" in js and "setInterval(refresh, 60000)" in js,
          "cache invalidation: browser refetches the registry (no-store, minute bucket) and re-resolves every minute")

    # Safety cap: if the job stops and a game is never marked final, the queue still moves on.
    reg = registry()
    now = at(2026, 9, 21, 12)
    reg, cur, _ = run(week(now), now, reg)
    frozen = copy.deepcopy(reg)
    after_cap = at(2026, 9, 21, 20, 15) + dt.timedelta(minutes=rot.SAFETY_CAP_MINUTES)
    check(teams(fm.resolve(frozen, "nfl", after_cap)) == ("BBB", "CCC"),
          "rotation job stopped: MNF retires at the %d minute safety cap, TNF takes over" % rot.SAFETY_CAP_MINUTES)

    # The rule, hour by hour across a whole week.
    reg = registry()
    t = at(2026, 9, 20, 9)
    end = at(2026, 9, 28, 23)
    bad = []
    while t < end:
        events = week(t)
        reg, cur, _ = run(events, t, reg)
        games = [rot.normalize(e) for e in events]
        future = [g for g in games if g["state"] != "final"]
        if future and (cur is None or cur.get("game_state") == "final"):
            bad.append(iso(t))
        t += dt.timedelta(minutes=30)
    check(not bad, "every half hour for 9 days: never a finished feature while a future game exists %s" % bad[:3])

    print("\n%s" % ("ALL PASS" if not failures else "%d FAILURE(S)" % failures))
    return 1 if failures else 0


if __name__ == "__main__":
    code = main()
    shutil.rmtree(ROOT_EMPTY, ignore_errors=True)
    sys.exit(code)
