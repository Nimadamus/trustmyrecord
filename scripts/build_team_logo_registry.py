#!/usr/bin/env python3
"""
build_team_logo_registry.py - refresh data/team-logos.json.

TEAM_LOGO_PIPELINE_20260903.

Why this file exists
--------------------
A Game File's hero used to carry whatever logo the author of that article
happened to put in the record. That is how the first college piece shipped with
a hand-drawn "GT" roundel instead of the Georgia Tech mark: nothing in the bake
knew what a Georgia Tech logo WAS, so the article had to be told, and the next
article would have had to be told again.

This writes the thing the bake looks a team up in. One row per team per league,
keyed by every spelling the rest of the site uses (display name, location,
nickname, abbreviation), carrying the club's own ESPN mark and its colours.

Source is ESPN's core API, which - unlike site.api.espn.com - answers this
network directly. Run it when a league adds, moves or renames a club:

    python scripts/build_team_logo_registry.py            # every league
    python scripts/build_team_logo_registry.py --sport ncaaf

It only writes data/team-logos.json. It never touches an article, and it fails
closed: a league that errors out leaves its previous rows in place.
"""

import argparse
import concurrent.futures as cf
import datetime as dt
import json
import os
import re
import sys
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "data", "team-logos.json")
CORE = "https://sports.core.api.espn.com/v2/sports"
UA = {"User-Agent": "TrustMyRecord-bake/1.0 (+https://trustmyrecord.com)"}

# TMR sport key -> ESPN "<sport>/leagues/<league>". Soccer is deliberately absent: it is
# staged by dozens of competitions with overlapping club names, so a soccer
# Game File resolves through the same fallback as any unknown club rather than
# through a guess.
LEAGUES = {
    "mlb": "baseball/leagues/mlb",
    "nba": "basketball/leagues/nba",
    "nfl": "football/leagues/nfl",
    "nhl": "hockey/leagues/nhl",
    "ncaaf": "football/leagues/college-football",
    "ncaab": "basketball/leagues/mens-college-basketball",
}


def get(url, timeout=30):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.load(r)


def season_for(league):
    """The season ESPN currently files a league's teams under.

    Asking for the wrong year is not an error, it is an empty list, so this
    walks back from the current year until a season answers with teams.
    """
    year = dt.datetime.utcnow().year
    for candidate in (year, year - 1, year - 2):
        try:
            d = get("%s/%s/seasons/%d/teams?limit=1" % (CORE, league, candidate))
            if d.get("count"):
                return candidate
        except Exception:
            continue
    return None


def pick_logos(logos):
    """Both marks: the primary one, and the one drawn for a dark background.

    ESPN ships several per club. `default` is the primary mark. `dark` is the
    same badge redrawn to sit on a dark ground, and the Game File hero card is
    dark, so a club whose primary mark is black - Colorado's buffalo, for one -
    needs it or it disappears into the card. Both are stored: the bake picks,
    not this script.
    """
    default = dark = None
    for lg in logos or []:
        rel = set(lg.get("rel") or [])
        href = lg.get("href")
        if not href:
            continue
        if "dark" in rel:
            dark = dark or href
        elif "default" in rel:
            default = default or href
        else:
            default = default or href
    return default, dark


def team_row(ref):
    d = get(ref.replace("http://", "https://"))
    if d.get("isActive") is False:
        return None
    logo, logo_dark = pick_logos(d.get("logos"))
    if not logo and not logo_dark:
        return None
    return {
        "id": str(d.get("id") or ""),
        "slug": d.get("slug") or "",
        "display": d.get("displayName") or "",
        "short": d.get("shortDisplayName") or "",
        "location": d.get("location") or "",
        "nick": d.get("name") or "",
        "abbr": (d.get("abbreviation") or "").upper(),
        "logo": logo or "",
        "logo_dark": logo_dark or "",
        "color": "#" + (d.get("color") or "").lstrip("#") if d.get("color") else "",
        "alt_color": ("#" + (d.get("alternateColor") or "").lstrip("#")
                      if d.get("alternateColor") else ""),
    }


def fetch_league(sport, league):
    season = season_for(league)
    if not season:
        raise RuntimeError("no season answered for %s" % league)
    refs, page = [], 1
    while True:
        d = get("%s/%s/seasons/%d/teams?limit=1000&page=%d" % (CORE, league, season, page))
        refs += [i["$ref"] for i in d.get("items") or []]
        if page >= (d.get("pageCount") or 1):
            break
        page += 1
    rows = []
    with cf.ThreadPoolExecutor(max_workers=12) as ex:
        for r in ex.map(lambda u: _safe(team_row, u), refs):
            if r:
                rows.append(r)
    if not rows:
        raise RuntimeError("no teams resolved for %s" % league)
    rows.sort(key=lambda r: (r["display"] or "").lower())
    return {"espn": league, "season": season, "teams": rows}


def _safe(fn, arg):
    try:
        return fn(arg)
    except Exception:
        return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sport", action="append", help="only this TMR sport key")
    a = ap.parse_args()

    wanted = a.sport or sorted(LEAGUES)
    existing = {}
    if os.path.exists(OUT):
        with open(OUT, "r", encoding="utf-8") as f:
            existing = json.load(f).get("sports") or {}

    out, failed = dict(existing), []
    for sport in wanted:
        if sport not in LEAGUES:
            sys.exit("unknown sport %r" % sport)
        try:
            out[sport] = fetch_league(sport, LEAGUES[sport])
            print("%-6s %4d teams (season %s)" % (
                sport, len(out[sport]["teams"]), out[sport]["season"]))
        except Exception as e:                                    # noqa: BLE001
            failed.append("%s: %s" % (sport, e))
            print("%-6s FAILED, keeping previous rows: %s" % (sport, e))

    if not out:
        sys.exit("nothing resolved, refusing to write an empty registry")

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump({
            "generated_utc": dt.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
            "source": "sports.core.api.espn.com",
            "sports": out,
        }, f, indent=1, sort_keys=True)
        f.write("\n")
    print("wrote %s" % os.path.relpath(OUT, ROOT))
    return 1 if failed and not existing else 0


if __name__ == "__main__":
    sys.exit(main())
