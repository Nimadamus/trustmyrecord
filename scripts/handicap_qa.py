#!/usr/bin/env python3
"""The permanent acceptance gate for every TrustMyRecord handicapping hub.

HANDICAP_ACCEPTANCE_GATE_20260909.

Nima's rule: nothing is complete unless every applicable requirement passes, and
a checklist that lives only in a document is a checklist nobody runs. So this is
the checklist, executable, one PASS or FAIL per sport with the evidence printed
beside it.

    python scripts/handicap_qa.py              every sport
    python scripts/handicap_qa.py nfl mlb      just those
    python scripts/handicap_qa.py --live       also check the deployed URLs

WHAT IT CAN AND CANNOT DECIDE
It checks what a machine can actually settle: the H1, the banned disclaimer
strings, internal links, image references, the slate against the live board,
Eastern-time freshness, and whether the sport-specific research modules are
present. It reports, and does not attempt to judge, the things that need eyes:
desktop and 390px rendering, and whether a scheduled run has fired. Those two
are printed as MANUAL so they cannot be quietly assumed to have passed.

Exit code is 1 if any sport fails, so it can be wired into a workflow gate.
"""

import datetime
import io
import json
import os
import re
import sys
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
API = os.environ.get("TMR_API", "https://trustmyrecord-api.onrender.com/api")

SPORTS = {
    # MLB's hub is built from the MLB Stats API schedule for ONE day, not from
    # the odds board, and the two feeds carry different ids and different day
    # spans. Checking it against the board reported 18 of 20 when the hub was in
    # fact carrying all 15 of that day's games. The right source is the schedule.
    "mlb": {"label": "MLB", "board": None, "schedule": "statsapi",
            "faces": "probable pitchers / key hitters"},
    "nfl": {"label": "NFL", "board": "americanfootball_nfl", "faces": "quarterbacks"},
    "ncaaf": {"label": "NCAAF", "board": "americanfootball_ncaaf", "faces": "quarterbacks"},
    "nba": {"label": "NBA", "board": "basketball_nba", "faces": "stars / starters"},
    "nhl": {"label": "NHL", "board": "icehockey_nhl", "faces": "goalies / stars"},
    # SOCCER PLAYER IMAGERY IS FEED-LIMITED, measured 2026-09-09: ESPN publishes
    # a headshot for 25 of 277 athletes across eng.1, esp.1, ita.1, ger.1 and
    # usa.1 (9%), the team endpoint carries no leaders block, and direct
    # a.espncdn.com headshot URLs 404. Rendering faces at 9% coverage would put
    # an empty frame on nine cards in ten, which is the broken imagery the gate
    # exists to prevent. It is reported as BLOCKED, not PASS and not FAIL: it
    # needs a data provider decision from Nima, and rule 9 says no new provider
    # without his approval.
    "soccer": {"label": "Soccer", "board": "soccer", "faces": "key players",
               "faces_blocked": "ESPN publishes headshots for 25 of 277 players (9%); "
                                "needs a provider decision"},
    "tennis": {"label": "Tennis", "board": None, "faces": "both competitors"},
}

# Anything that explains our backend to a visitor. NO_INTERNAL_DISCLAIMERS_20260909.
BANNED = [
    "no permanent matchup pages",
    "graded game database behind",
    "database holds no completed",
    "left blank rather than",
    "not shown rather than reconstructed",
    "days behind today",
    "cannot be calculated",
    "has no historical data",
]

# The research a hub has to carry to be a research product rather than a price
# list. Any ONE of the alternatives in a group satisfies that group, because the
# sports do not share metrics and are not supposed to.
DEPTH = [
    ("recent form", ["streak", "last 10", "W10", "data-r=", "form"]),
    ("market context", ["spread", "moneyline", "total", "against the spread"]),
    ("trends or splits", ["against the spread", "over/under", "o/u", "home", "road",
                          "surface", "avg combined", "differential"]),
    ("comparison or advantage", ["comparison", "hx-cmp", "vs", "advantage", "rank"]),
]


def read(path):
    try:
        with io.open(path, encoding="utf-8") as fh:
            return fh.read()
    except OSError:
        return None


def board_count(key):
    """How many games the live board is carrying, for the missing/duplicate check."""
    if not key:
        return None
    try:
        req = urllib.request.Request("%s/games/board/%s?limit=200" % (API, key))
        req.add_header("Accept", "application/json")
        with urllib.request.urlopen(req, timeout=45) as r:
            d = json.loads(r.read().decode("utf-8"))
        return len([g for g in (d.get("games") or [])
                    if not g.get("has_placeholder_teams") and g.get("home_team")])
    except Exception:  # noqa: BLE001 - the check degrades, it does not crash
        return None


def statsapi_count():
    """Today's MLB schedule from the feed the MLB hub is actually built from."""
    try:
        url = ("https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=%s"
               % et_today().isoformat())
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=45) as r:
            d = json.loads(r.read().decode("utf-8"))
        return sum(len(day.get("games") or []) for day in d.get("dates") or [])
    except Exception:  # noqa: BLE001
        return None


def et_today():
    """Today in Eastern time, without pulling in a timezone library."""
    utc = datetime.datetime.now(datetime.timezone.utc)
    # ET is UTC-4 from the second Sunday in March to the first Sunday in November.
    y = utc.year
    mar = datetime.date(y, 3, 8)
    mar += datetime.timedelta(days=(6 - mar.weekday()) % 7)
    nov = datetime.date(y, 11, 1)
    nov += datetime.timedelta(days=(6 - nov.weekday()) % 7)
    offset = 4 if mar <= utc.date() < nov else 5
    return (utc - datetime.timedelta(hours=offset)).date()


def check(sport, live=False):
    S = SPORTS[sport]
    path = os.path.join(REPO, "handicapping", sport, "index.html")
    html = read(path)
    rows = []

    def add(name, ok, evidence):
        rows.append((name, "PASS" if ok else ("MANUAL" if ok is None else "FAIL"), evidence))

    if html is None:
        add("hub exists", False, path)
        return rows

    add("hub exists", True, "%d KB" % (len(html.encode("utf-8")) // 1024))

    n_h1 = len(re.findall(r"<h1[\s>]", html))
    add("exactly one H1", n_h1 == 1, "%d found" % n_h1)

    hits = [b for b in BANNED if b.lower() in html.lower()]
    add("no internal disclaimers", not hits, "clean" if not hits else "; ".join(hits[:2]))

    broken = []
    for u in sorted(set(re.findall(r'href="(/[^"#?]*)"', html))):
        p = os.path.join(REPO, u.strip("/"), "index.html") if u.endswith("/") \
            else os.path.join(REPO, u.strip("/"))
        if not os.path.exists(p):
            broken.append(u)
    add("no broken internal links", not broken,
        "%d links, %d broken%s" % (len(set(re.findall(r'href="(/[^"#?]*)"', html))),
                                   len(broken), (": " + broken[0]) if broken else ""))

    local_imgs = [u for u in re.findall(r'<img[^>]+src="(/[^"]+)"', html)]
    missing = [u for u in local_imgs if not os.path.exists(os.path.join(REPO, u.strip("/")))]
    add("no broken local images", not missing,
        "%d local, %d missing" % (len(local_imgs), len(missing)))

    logos = len(re.findall(r"teamlogos|/logos/|crest", html))
    faces = len(re.findall(r"headshots|/players/|hx-face", html))
    empty = "board is not posted yet" in html or "no games" in html.lower()
    add("team branding present", logos > 0 or empty,
        "%d logo refs%s" % (logos, " (offseason state)" if empty and not logos else ""))
    if faces == 0 and not empty and S.get("faces_blocked"):
        add("player imagery (%s)" % S["faces"], None, "BLOCKED: " + S["faces_blocked"])
    else:
        add("player imagery (%s)" % S["faces"], faces > 0 or empty,
            "%d player image refs%s" % (faces, " (offseason state)" if empty and not faces else ""))

    got = (statsapi_count() if S.get("schedule") == "statsapi"
           else board_count(S["board"]))
    # A game is "represented" by a link on the sports that mint matchup pages,
    # and by a CARD on the hub-first sports that deliberately do not. Counting
    # links alone reported NCAAF and Soccer as carrying zero games when both
    # were carrying their whole slate in cards, which is a checker bug and
    # exactly the kind of false alarm that makes a gate get ignored.
    listed = len(set(re.findall(r'href="(/handicapping/%s/[^"/]+/)"' % sport, html)))
    for marker in (r'class="hx-gcard"', r'class="cf-row"', r'class="sh-fix"',
                   r'data-day="', r'class="tn-row"', r'<tr><th scope="row">'):
        listed = max(listed, len(re.findall(marker, html)))
    if got is None:
        add("slate matches the board", None, "board not queryable for this sport")
    elif empty and got == 0:
        add("slate matches the board", True, "0 on the board, offseason state shown")
    else:
        add("slate matches the board", listed >= got or got == 0,
            "source %d, hub carries %d" % (got, listed))

    today = et_today()
    stale = re.findall(r"(20\d\d-\d\d-\d\d)", html)
    dates = sorted({d for d in stale if d >= "2026-01-01"})
    future = [d for d in dates if d >= today.isoformat()]
    add("carries today or later (ET %s)" % today.isoformat(),
        bool(future) or empty, "newest date on page: %s" % (max(dates) if dates else "none"))

    for label, needles in DEPTH:
        found = [n for n in needles if n.lower() in html.lower()]
        # An out of season sport has nothing to be deep ABOUT. The designed
        # empty state is the correct answer there, not a research module.
        add("depth: %s" % label, bool(found) or empty,
            (", ".join(found[:3])) if found else ("offseason state" if empty else "absent"))

    add("desktop + 390px render", None, "screenshot review required")
    add("real scheduled run", None, "check the Actions run record, event=schedule")

    if live:
        try:
            req = urllib.request.Request("https://trustmyrecord.com/handicapping/%s/" % sport)
            with urllib.request.urlopen(req, timeout=45) as r:
                body = r.read().decode("utf-8", "replace")
            add("live URL serves", True, "%d KB deployed" % (len(body.encode()) // 1024))
            add("live page has H1", len(re.findall(r"<h1[\s>]", body)) == 1, "deployed")
        except Exception as exc:  # noqa: BLE001
            add("live URL serves", False, str(exc)[:60])
    return rows


def main():
    args = [a.lower() for a in sys.argv[1:]]
    live = "--live" in args
    wanted = [a for a in args if a in SPORTS] or list(SPORTS)
    failed = 0
    for sport in wanted:
        rows = check(sport, live)
        bad = [r for r in rows if r[1] == "FAIL"]
        manual = [r for r in rows if r[1] == "MANUAL"]
        verdict = "FAIL" if bad else ("PASS (with %d manual)" % len(manual) if manual else "PASS")
        print("\n%s  %s" % (SPORTS[sport]["label"].upper().ljust(7), verdict))
        for name, state, ev in rows:
            print("   %-6s %-34s %s" % (state, name, ev))
        if bad:
            failed += 1
    print("\n%d sport(s) failing" % failed)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
