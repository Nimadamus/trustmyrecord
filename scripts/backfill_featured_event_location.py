#!/usr/bin/env python3
"""Add the missing "location" and "eventStatus" to already baked featured pages.

Search Console reported 'Missing field "location"' (critical) and 'Missing
field "eventStatus"' on Event structured data on 2026-09-30. The generator
(sports_featured_rotation.py) is fixed at the source, but a baked page is
never rewritten, so this repairs those pages in place. Only the SportsEvent
node changes. The venue comes from ESPN for that exact event id; a page whose
venue cannot be read is left alone rather than given a guessed one.

    python scripts/backfill_featured_event_location.py --dry-run
    python scripts/backfill_featured_event_location.py
"""
import argparse
import datetime as dt
import json
import os
import re
import sys
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from schema_event import event_status, place_node  # noqa: E402

SITE = "https://site.api.espn.com/apis/site/v2/sports/"
SUMMARY = {"mlb": "baseball/mlb", "ncaaf": "football/college-football", "nfl": "football/nfl",
           "nba": "basketball/nba", "nhl": "hockey/nhl", "wnba": "basketball/wnba"}
LD = re.compile(r'(<script type="application/ld\+json">\s*)(.*?)(\s*</script>)', re.S)
_cache = {}


def get(url):
    if url not in _cache:
        with urllib.request.urlopen(url, timeout=30) as fh:
            _cache[url] = json.load(fh)
    return _cache[url]


def venue_for(key, start):
    """(venue name, address dict, status name) for one featured-urls key."""
    sport, _league, ident = key.split(":", 2)
    if sport == "tennis":
        day = dt.datetime.fromisoformat(start.replace("Z", "+00:00"))
        for tour in ("atp", "wta"):
            for d in {day.strftime("%Y%m%d"), (day - dt.timedelta(days=1)).strftime("%Y%m%d")}:
                data = get("%stennis/%s/scoreboard?dates=%s" % (SITE, tour, d))
                for ev in data.get("events") or []:
                    for grp in ev.get("groupings") or []:
                        for comp in grp.get("competitions") or []:
                            if str(comp.get("id")) == ident:
                                v = comp.get("venue") or ev.get("venue") or {}
                                st = ((comp.get("status") or {}).get("type") or {}).get("name")
                                return (v.get("fullName") or v.get("displayName"), {}, st)
        return None, None, None
    path = SUMMARY.get(sport)
    if sport == "soccer":
        from sports_featured_rotation import CATALOG
        boards = dict((CATALOG.get("soccer") or {}).get("boards") or [])
        board = boards.get(_league) or ""
        path = board.split("/sports/", 1)[-1].rsplit("/scoreboard", 1)[0] if board else None
    if not path:
        return None, None, None
    data = get("%s%s/summary?event=%s" % (SITE, path, ident))
    v = (data.get("gameInfo") or {}).get("venue") or {}
    st = ((((data.get("header") or {}).get("competitions") or [{}])[0].get("status") or {}).get("type") or {}).get("name")
    return v.get("fullName"), v.get("address") or {}, st


STATE = {"STATUS_POSTPONED": "postponed", "STATUS_CANCELED": "canceled", "STATUS_SUSPENDED": "suspended"}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    urls = json.load(open("data/featured-urls.json", encoding="utf-8"))
    fixed = skipped = 0
    for key, entry in urls.items():
        path = os.path.join(entry["href"].strip("/"), "index.html")
        if not os.path.exists(path):
            continue
        page = open(path, encoding="utf-8").read()
        changed = False

        def repair(m):
            nonlocal changed, skipped
            doc = json.loads(m.group(2))
            nodes = doc.get("@graph") if isinstance(doc.get("@graph"), list) else [doc]
            for ev in nodes:
                if ev.get("@type") != "SportsEvent" or (ev.get("location") and ev.get("eventStatus")):
                    continue
                name, addr, st = venue_for(key, ev.get("startDate") or "")
                if not ev.get("location"):
                    place = place_node(name, addr)
                    if not place:
                        skipped += 1
                        print("NO VENUE", key, path)
                        continue
                    ev["location"] = place
                if not ev.get("eventStatus"):
                    ev["eventStatus"] = event_status(STATE.get(st or "", ""))
                changed = True
            indent = 2 if "\n" in m.group(2) else None
            return m.group(1) + json.dumps(doc, indent=indent, ensure_ascii=False) + m.group(3)

        new = LD.sub(repair, page)
        if changed:
            fixed += 1
            print("FIX", path)
            if not args.dry_run:
                open(path, "w", encoding="utf-8", newline="").write(new)
    print("fixed %d, no venue %d" % (fixed, skipped))


if __name__ == "__main__":
    main()
