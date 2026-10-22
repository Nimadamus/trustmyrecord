#!/usr/bin/env python3
"""Tennis Game File rules: no filler, real round and tournament, local and PT
time, and a page is blocked when data is missing, stale or after the start."""

import datetime as dt
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "scripts"))

import featured_preview as fp  # noqa: E402
import sports_featured_rotation as rot  # noqa: E402
import tennis_game_files as tgf  # noqa: E402

FAILS = 0
START = dt.datetime(2026, 10, 2, 11, 40, tzinfo=dt.timezone.utc)


def check(ok, message):
    global FAILS
    print(("  ok    " if ok else "  FAIL  ") + message)
    if not ok:
        FAILS += 1


def feed(ranked=True, state="pre"):
    def comp(pid, name, rank_ok):
        return {"id": pid, "homeAway": "away" if pid == "1" else "home", "winner": False, "linescores": [],
                "athlete": {"displayName": name, "flag": {"alt": "Spain", "href": ""}}}
    match = {"id": "99", "date": "2026-10-02T11:40Z", "tournamentId": 7, "type": {"slug": "mens-singles"},
             "round": {"displayName": "Round 1"}, "venue": {"fullName": "Beijing, China PR", "court": "Court 1"},
             "status": {"type": {"state": state}},
             "competitors": [comp("1", "Alpha One", ranked), comp("2", "Beta Two", ranked)]}
    board = {"events": [{"name": "China Open", "groupings": [{"competitions": [match]}]}]}
    rankings = {"rankings": [{"ranks": [
        {"athlete": {"id": "1"}, "current": 10, "points": 3000},
        {"athlete": {"id": "2"}, "current": 60, "points": 900}] if ranked else []}]}

    def get(url):
        if url.endswith("/rankings"):
            return rankings
        if "/scoreboard" in url:
            return board
        if "/statistics" in url:
            return {"splits": {"categories": [{"stats": [
                {"name": "singlesWon", "value": 300 if "/athletes/1/" in url else 150},
                {"name": "singlesLost", "value": 200}]}]}} if ranked else {}
        if "/athletes/" in url:
            return {"athlete": {"age": 27, "hand": "Right"}}
        return {}
    return get


def game(**kw):
    g = {"sport": "tennis", "state": "scheduled", "kickoff": START, "time_valid": True, "notes": "China Open",
         "round": "Round 1", "venue": "Beijing, China PR", "starters": {}, "passers": {},
         "away": {"display": "Alpha One", "name": "Alpha One"}, "home": {"display": "Beta Two", "name": "Beta Two"}}
    g.update(kw)
    return g


before = START - dt.timedelta(hours=5)
after = START + dt.timedelta(minutes=1)

# title and lede
head, body = rot.specific_story(game())[1:]
check("China Open" in head and "Round 1" in head, "title names tournament and round: " + head)
check("Beijing" in body[0] and "on the board" not in body[0] and "opening rounds" not in body[0], "lede is specific, no filler")
check(all(f not in " ".join(body) for f in tgf.FILLER), "lede carries none of the known filler sentences")

# featurable gate
check(rot.featurable(game(), before), "scheduled, before start, with tournament: featurable")
check(not rot.featurable(game(), after), "after the start: blocked")
check(not rot.featurable(game(state="in"), before), "live match: blocked")
check(not rot.featurable(game(time_valid=False), before), "start time not confirmed: blocked")
check(not rot.featurable(game(notes=""), before), "no tournament name in the feed: blocked")

# time lines
line = fp.start_lines(START, "Beijing, China PR")
check("7:40 PM local" in line and "4:40 AM PT" in line and "7:40 AM ET" in line, "local, PT and ET shown: " + line)
check("local" not in fp.start_lines(START, "Nowhereville, Atlantis"), "unknown venue zone gives no guessed local time")
check("Start time" in fp.start_lines(START, "Beijing, China PR", played=True), "finished match says Start time")

# build gates
out = fp.build("tennis", "ATP", "99", START, feed(), before)
check(out is not None, "complete data before the start: builds")
if out:
    text = out[0]
    check("Scheduled start" in text and "PT" in text, "preview shows the start in local and PT")
    check("That is how the matchup profiled" not in text and "on the board" not in text, "preview has no filler")
check(fp.build("tennis", "ATP", "99", START, feed(), after) is None, "pregame preview after the start: not built")
check(fp.build("tennis", "ATP", "99", START, feed(ranked=False), before) is None, "missing rankings and records: blocked")
done = fp.build("tennis", "ATP", "99", START, feed(state="post"), after)
check(done is not None and "That is how the matchup profiled" not in done[0], "finished match still gets a recap without filler")

# id reuse: same match id, different players and time must not be taken for this page
reused = fp.build("tennis", "ATP", "99", START + dt.timedelta(days=2), feed(), START + dt.timedelta(days=1))
check(reused is None, "a feed match with the same id but another start time is rejected")
check(fp._find_tennis_match("ATP", "12345", START, feed(), names=["Alpha One", "Beta Two"]) is not None,
      "match found by player names when the id differs")
check(fp._find_tennis_match("ATP", "12345", START, feed(), names=["Someone", "Else"]) is None,
      "wrong players are never matched")

# migration helpers
dirty = "<p>A plays B. The event is in its opening rounds, and this match is on the board.</p>"
check("on the board" not in tgf.strip_filler(dirty), "strip_filler removes the old lede sentence")
page = ('<title>A vs B Preview: opening round | TrustMyRecord</title>'
        '<meta name="description" content="A vs B. A plays B.">'
        '<h1>A vs B Preview: opening round</h1>\n<p class="when" data-feat-when>x</p>\n<p>A plays B.</p>\n'
        '<div class="links"></div>')
g = game(away={"display": "A", "name": "A"}, home={"display": "B", "name": "B"})
new = tgf.retitle(page, g)
check("Round 1 at the China Open" in new and "opening round" not in new, "retitle rewrites title and H1 in place")

wrongpage = ('<h1>A vs B Preview: x</h1><!--FEATURED_PREVIEW--><section><p class="fp-name">C</p>'
             '<p class="fp-name">D</p></section><!--/FEATURED_PREVIEW--><div class="links"></div>')
check("fp-name" not in tgf.drop_mismatched_preview(wrongpage), "a preview for other players is dropped")
rightpage = wrongpage.replace(">C<", ">B<").replace(">D<", ">A<")
check("fp-name" in tgf.drop_mismatched_preview(rightpage), "a matching preview is kept")

print("FAILED %d" % FAILS if FAILS else "all passed")
sys.exit(1 if FAILS else 0)
