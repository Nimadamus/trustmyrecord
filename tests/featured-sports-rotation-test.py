#!/usr/bin/env python3
"""Schedule rotation for MLB, college football, soccer, tennis, and a sport
added later. Permanent angle URLs, never reused, never dated."""

import datetime as dt
import json
import os
import re
import shutil
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "scripts"))

import featured_matchups as fm  # noqa: E402
import sports_featured_rotation as rot  # noqa: E402

NOW = dt.datetime(2026, 9, 24, 16, 0, tzinfo=dt.timezone.utc)
FAILS = 0


def check(ok, message):
    global FAILS
    print(("  ok    " if ok else "  FAIL  ") + message)
    if not ok:
        FAILS += 1


def event(eid, away, home, kick, state="pre", records=("90-60", "60-90"),
          home_rec=None, road_rec=None, round_name="", league="MLB", pitchers=None):
    names = {"pre": ("STATUS_SCHEDULED", "pre", False),
             "post": ("STATUS_FINAL", "post", True)}
    status_name, status_state, completed = names[state]

    def side(display, short, rec, kind):
        records = [{"name": "overall", "type": "total", "summary": rec}]
        if kind == "home" and home_rec:
            records.append({"name": "Home", "type": "home", "summary": home_rec})
        if kind == "away" and road_rec:
            records.append({"name": "Road", "type": "road", "summary": road_rec})
        row = {"homeAway": kind, "records": records,
               "team": {"abbreviation": short[:3].upper(), "shortDisplayName": short,
                        "displayName": display, "name": short}}
        if pitchers and pitchers.get(kind):
            row["probables"] = [{"athlete": {"displayName": pitchers[kind]}, "statistics": [
                {"name": "wins", "displayValue": "10"},
                {"name": "losses", "displayValue": "4"},
                {"name": "ERA", "displayValue": "3.10"}]}]
        return row

    return {
        "id": str(eid), "date": kick, "league": league,
        "status": {"type": {"name": status_name, "state": status_state, "completed": completed}},
        "competitions": [{
            "timeValid": True, "neutralSite": False,
            "round": {"displayName": round_name} if round_name else None,
            "competitors": [
                side(away[0], away[1], records[0], "away"),
                side(home[0], home[1], records[1], "home"),
            ],
        }],
    }


def registry():
    return {"grace_minutes": 210, "sports": {
        "mlb": {"label": "MLB", "hub": "/handicapping/mlb/", "doors": [], "features": [
            {"id": "game-file-old", "source": "game-file", "status": "active",
             "href": "/matchup-of-the-day/cardinals-pirates-old-story/",
             "headline": "A finished story",
             "matchup": "St. Louis Cardinals vs. Pittsburgh Pirates",
             "kickoff_utc": "2026-09-20T17:00:00Z"},
            {"id": "game-file-live", "source": "game-file", "status": "active",
             "href": "/matchup-of-the-day/cardinals-pirates-existing-angle/",
             "headline": "Existing angle for this exact game",
             "matchup": "St. Louis Cardinals vs. Pittsburgh Pirates",
             "kickoff_utc": "2026-09-24T23:00:00Z"},
        ]},
        "tennis": {"label": "Tennis", "hub": "/handicapping/tennis/", "doors": [], "features": []},
        "cricket": {"label": "Cricket", "hub": "/handicapping/cricket/", "doors": [], "features": [],
                    "feed": {"kind": "days", "days": 3, "boards": [["Tests", "https://example.test/cricket"]]}},
    }}


def feed(url):
    if "baseball/mlb" in url and "20260924" in url:
        return {"events": [event("24", ("St. Louis Cardinals", "Cardinals"),
                                  ("Pittsburgh Pirates", "Pirates"), "2026-09-24T23:00:00Z")]}
    if "baseball/mlb" in url and "20260928" in url:
        return {"events": [event("28", ("St. Louis Cardinals", "Cardinals"),
                                  ("Pittsburgh Pirates", "Pirates"), "2026-09-28T23:00:00Z",
                                  records=("90-60", "70-80"), home_rec="50-20", road_rec="20-40",
                                  pitchers={"away": "Kyle Leahy", "home": "Paul Skenes"})]}
    if "baseball/mlb" in url and "20260923" in url:
        return {"events": [event("23", ("St. Louis Cardinals", "Cardinals"),
                                  ("Pittsburgh Pirates", "Pirates"), "2026-09-23T23:00:00Z", state="post")]}
    if "tennis/atp" in url and "20260924" in url:
        return {"events": [{"id": "t1", "name": "Chengdu Open", "groupings": [{"competitions": [
            event("m1", ("Lorenzo Sonego", "Sonego"), ("James Duckworth", "Duckworth"),
                  "2026-09-24T18:00:00Z", records=("0-0", "0-0"), round_name="Round 1")["competitions"][0]
            | {"id": "m1", "date": "2026-09-24T18:00:00Z", "status": {"type": {"name": "STATUS_SCHEDULED", "state": "pre", "completed": False}}}
        ]}]}]}
    if "example.test/cricket" in url and "20260925" in url:
        return {"events": [event("c1", ("Australia", "Australia"), ("India", "India"),
                                  "2026-09-25T04:00:00Z", records=("12-2", "4-10"), league="Tests",
                                  pitchers={"away": "Pat Cummins", "home": "Jasprit Bumrah"})]}
    return {"events": []}


def main():
    root = tempfile.mkdtemp(prefix="sportrot-")
    try:
        os.makedirs(os.path.join(root, "data"))
        os.makedirs(os.path.join(root, "matchup-of-the-day", "cardinals-pirates-one-side-is-far-better"))
        with open(os.path.join(root, "data", "featured-matchups.json"), "w", encoding="utf-8") as fh:
            json.dump(registry(), fh)
        with open(os.path.join(root, "sitemap.xml"), "w", encoding="utf-8") as fh:
            fh.write('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n</urlset>\n')
        reg = fm.load(os.path.join(root, "data", "featured-matchups.json"))
        changed, lines = rot.apply_all(reg, NOW, root, fm.resolve, get=feed)
        print("\n".join(lines))
        check(changed, "rotation changed the registry")
        mlb = fm.resolve(reg, "mlb", NOW)
        check(mlb and mlb["href"] == "/matchup-of-the-day/cardinals-pirates-existing-angle/",
              "today's MLB feature reuses the page already published for that game")
        check(mlb and mlb.get("game_state") != "final", "current MLB feature is not a finished game")
        check(reg["sports"]["mlb"].get("selection") == "schedule", "MLB now follows the schedule")
        later = [f for f in reg["sports"]["mlb"]["features"] if f.get("event_id") == "MLB:28"]
        check(len(later) == 1 and later[0]["href"] == "/mlb/cardinals-pirates-leahy-vs-skenes/",
              "the rematch got its own pitcher URL")
        check("2026" not in later[0]["href"] and "week" not in later[0]["href"] and not re.search(r"\d", later[0]["href"]),
              "rematch URL has no date, week stamp, or id")
        check("September" not in later[0]["headline"] and later[0]["headline"].startswith("Cardinals vs Pirates Preview:"),
              "rematch title names the pitchers and has no date")
        tennis = fm.resolve_live(reg, "tennis", NOW)
        check(tennis and tennis["href"].startswith("/tennis/") and "sonego" in tennis["href"],
              "tennis minted a permanent page for the live draw")
        check(tennis and not re.search(r"\d", (rot.load_store(root).get("tennis:ATP:m1") or {}).get("angle") or "9"),
              "tennis angle has no digits")
        cricket = fm.resolve_live(reg, "cricket", NOW)
        check(cricket and cricket["href"].startswith("/cricket/") and "cummins-vs-bumrah" in cricket["href"],
              "a sport added with a feed object rotates without new code")
        hrefs = [f["href"] for s in reg["sports"].values() for f in s["features"] if f.get("source") == "rotation"]
        check(len(hrefs) == len(set(hrefs)), "no two featured games share a URL")
        page = os.path.join(root, tennis["href"].strip("/"), "index.html")
        text = open(page, encoding="utf-8").read()
        check("<h1>" in text and "September" not in text.split("<h1>")[1].split("</h1>")[0],
              "minted page has an h1 with no date")
        check('rel="canonical"' in text and "noindex" not in text and "http-equiv=\"refresh\"" not in text,
              "minted page is indexable and self contained")
        text2 = text.replace("</h1>", "</h1><!--SENTINEL-->")
        with open(page, "w", encoding="utf-8") as fh:
            fh.write(text2)
        rot.apply_all(reg, NOW, root, fm.resolve, get=feed)
        check("<!--SENTINEL-->" in open(page, encoding="utf-8").read(),
              "a published featured URL is not rewritten")
        sm = open(os.path.join(root, "sitemap.xml"), encoding="utf-8").read()
        check(tennis["href"] in sm and sm.count(tennis["href"]) == 1, "new page is in the sitemap once")
    finally:
        shutil.rmtree(root, ignore_errors=True)
    if FAILS:
        print("%d failed" % FAILS)
        return 1
    print("featured sports rotation: all checks passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
