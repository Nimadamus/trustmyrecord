"""MOTD_FINALS_20261115 (Nima): a Matchup of the Day page whose game is over keeps its URL and content, and its
<title> and <h1> change from the preview line to the final score, e.g. "Braves vs. Marlins Final Score: 3-0".

Reads each matchup-of-the-day/<slug>/index.html (SportsEvent JSON-LD: sport, startDate, "Away at Home"),
asks ESPN's public scoreboard for that day, and when the game is final records it in data/matchup-finals.json
and rewrites only the <title> and <h1> of that page. build_matchup_articles.py reads the same file, so a later
bake keeps the final score. Pages already final are skipped. Games are checked 4 hours after the start.

    python scripts/motd_finals.py            # update pages + data file
    python scripts/motd_finals.py --dry-run  # print what would change
"""
import argparse, datetime as dt, glob, html, json, os, re, sys, time, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data", "matchup-finals.json")
UA = {"User-Agent": "Mozilla/5.0 (compatible; TMR-matchup-finals/1.0)"}
PATHS = {
    "MLB": ["baseball/mlb"], "NBA": ["basketball/nba"], "NFL": ["football/nfl"], "NHL": ["hockey/nhl"],
    "College Football": ["football/college-football"], "College Basketball": ["basketball/mens-college-basketball"],
    "Soccer": ["soccer/all"], "Tennis": ["tennis/atp", "tennis/wta"],
}
GROUPS = {"football/college-football": "80", "basketball/mens-college-basketball": "50"}
_cache = {}


def get(path, day):
    key = (path, day)
    if key not in _cache:
        url = f"https://site.api.espn.com/apis/site/v2/sports/{path}/scoreboard?dates={day}&limit=500"
        if path in GROUPS:
            url += "&groups=" + GROUPS[path]
        try:
            _cache[key] = json.loads(urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30).read())
        except Exception as e:
            print("espn", path, day, repr(e)[:80], file=sys.stderr)
            _cache[key] = {}
        time.sleep(0.3)
    return _cache[key]


def norm(s):
    return re.sub(r"[^a-z0-9]", "", (s or "").lower())


def names_of(c):
    t = c.get("team") or c.get("athlete") or {}
    return {norm(t.get(k)) for k in ("displayName", "shortDisplayName", "name", "location", "fullName") if t.get(k)} - {""}


def short_of(c):
    t = c.get("team") or c.get("athlete") or {}
    return t.get("shortDisplayName") or t.get("displayName") or t.get("name") or ""


def comps(ev):
    for comp in ev.get("competitions") or []:
        yield comp
    for g in ev.get("groupings") or []:                     # tennis: event -> groupings -> competitions
        for comp in g.get("competitions") or []:
            yield comp


def tennis_sets(c, other):
    a = b = 0
    for x, y in zip(c.get("linescores") or [], other.get("linescores") or []):
        if (x.get("value") or 0) > (y.get("value") or 0):
            a += 1
        elif (y.get("value") or 0) > (x.get("value") or 0):
            b += 1
    return a, b


def find_final(sport, start, away, home):
    want_a, want_h = norm(away), norm(home)
    et = start.astimezone(dt.timezone(dt.timedelta(hours=-5)))
    days = sorted({(et + dt.timedelta(days=d)).strftime("%Y%m%d") for d in (-1, 0, 1)})
    for path in PATHS.get(sport, []):
        for day in days:
            for ev in get(path, day).get("events") or []:
                for comp in comps(ev):
                    cs = comp.get("competitors") or []
                    if len(cs) != 2:
                        continue
                    st = ((comp.get("status") or ev.get("status") or {}).get("type") or {})
                    if not st.get("completed"):
                        continue
                    when = comp.get("date") or ev.get("date") or ""
                    try:
                        t = dt.datetime.fromisoformat(when.replace("Z", "+00:00"))
                        if abs((t - start).total_seconds()) > 36 * 3600:
                            continue
                    except ValueError:
                        pass
                    match = {}
                    for c in cs:
                        n = names_of(c)
                        if want_a in n or any(x and (x in want_a or want_a in x) and len(x) >= 4 for x in n):
                            match.setdefault("a", c)
                        elif want_h in n or any(x and (x in want_h or want_h in x) and len(x) >= 4 for x in n):
                            match.setdefault("h", c)
                    if "a" not in match or "h" not in match:
                        continue
                    a, h = match["a"], match["h"]
                    if sport == "Tennis":
                        sa, sh = tennis_sets(a, h)
                        lead = a if sa > sh else h if sh > sa else None
                        # a retirement or walkover can leave the set count disagreeing with the winner: leave the page alone
                        if lead is None or (any(c.get("winner") for c in cs) and not lead.get("winner")):
                            continue
                    else:
                        try:
                            sa, sh = int(float(a.get("score"))), int(float(h.get("score")))
                        except (TypeError, ValueError):
                            continue
                    return {"away": short_of(a), "home": short_of(h), "away_score": sa, "home_score": sh,
                            "espn_event": str(ev.get("id") or ""), "checked_at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")}
    return None


def final_line(f):
    return "%s vs. %s Final Score: %s-%s" % (f["away"], f["home"], f["away_score"], f["home_score"])


def apply(page, f):
    line = html.escape(final_line(f), quote=False)
    page = re.sub(r"<title>.*?</title>", "<title>%s</title>" % line, page, count=1, flags=re.S)
    page = re.sub(r'(<h1 class="ed-title">).*?(</h1>)', lambda m: m.group(1) + line + m.group(2), page, count=1, flags=re.S)
    return page


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    finals = json.load(open(DATA, encoding="utf-8")) if os.path.exists(DATA) else {}
    now = dt.datetime.now(dt.timezone.utc)
    changed = found = missed = 0
    for path in sorted(glob.glob(os.path.join(ROOT, "matchup-of-the-day", "*", "index.html"))):
        slug = os.path.basename(os.path.dirname(path))
        raw = open(path, "rb").read()
        page = raw.decode("utf-8")
        m = re.search(r'"@type": "SportsEvent".*?"name": "(.*?)".*?"sport": "(.*?)",\s*"startDate": "(.*?)"', page, re.S)
        if not m:
            continue
        name, sport, start = m.group(1), m.group(2), dt.datetime.fromisoformat(m.group(3).replace("Z", "+00:00"))
        if now - start < dt.timedelta(hours=4):
            continue
        f = finals.get(slug)
        if not f:
            parts = re.split(r" at | vs\.? ", name, maxsplit=1)
            if len(parts) != 2:
                continue
            f = find_final(sport, start, parts[0].strip(), parts[1].strip())
            if not f:
                missed += 1
                print("no final yet:", slug, "|", sport, name, start.date(), flush=True)
                continue
            finals[slug] = f
            found += 1
        new = apply(page, f)
        if new != page:
            changed += 1
            print(("would update " if args.dry_run else "updated ") + slug + " -> " + final_line(f), flush=True)
            if not args.dry_run:
                crlf = b"\r\n" in raw
                out = new.replace("\r\n", "\n")
                open(path, "wb").write((out.replace("\n", "\r\n") if crlf else out).encode("utf-8"))
    if not args.dry_run:
        os.makedirs(os.path.dirname(DATA), exist_ok=True)
        json.dump(finals, open(DATA, "w", encoding="utf-8", newline="\n"), indent=1, sort_keys=True, ensure_ascii=False)
    print(f"finals found {found}, pages changed {changed}, still unmatched {missed}, total known {len(finals)}")


if __name__ == "__main__":
    main()
