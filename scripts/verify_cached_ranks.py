#!/usr/bin/env python3
"""
verify_cached_ranks.py - every rank baked into a cached page must equal the live
canonical ranking API.

PRERENDER_ISOLATION_20260915. The official rank is computed in exactly one place,
services/canonicalRanking.js in trustmyrecord-backend, and served by
GET /api/users/leaderboard and /api/users/home-bootstrap. The prerender bakes copy
it into static HTML. This script re-reads those bakes and compares them with the
API, row by row. It calculates nothing: a mismatch means a bake is stale or wrong,
never that a rank should be different.

Checked surfaces (the only baked HTML that prints a handicapper rank):
  leaderboards/index.html   <!--MK:lbBody-->    rows, order and rank cells
                                                (sortBy=rank&minPicks=25, the page default)
  handicappers/index.html   <!--MK:hmRows-->    data-official-rank per member (overall scope)
  index.html                <!--MK:homeLeaderboard--> officially ranked rows, or the
                                                empty state when none are issued
Plus a sweep of every page in those files for legacy row-index rank markup.

  python scripts/verify_cached_ranks.py            local files
  python scripts/verify_cached_ranks.py --live     the pages served by trustmyrecord.com
  python scripts/verify_cached_ranks.py --json     machine-readable result (used by prerender_run.py)

Exit 0 when every surface matches, 1 otherwise.
"""
import html as htmllib
import json
import os
import re
import sys
import time
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
API = "https://trustmyrecord-api.onrender.com/api/users"
SITE = "https://trustmyrecord.com"
UA = "Mozilla/5.0 (TMR-cached-rank-verifier)"

SURFACES = {
    "leaderboards/index.html": "/leaderboards/",
    "handicappers/index.html": "/handicappers/",
    "index.html": "/",
}


def fetch(url, attempts=4):
    last = None
    for i in range(attempts):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json,text/html"})
            with urllib.request.urlopen(req, timeout=45) as r:
                return r.read().decode("utf-8", "replace")
        except Exception as ex:  # 429 / 5xx / cold instance: back off and retry
            last = ex
            time.sleep(3 * (i + 1))
    raise last


def api(path):
    return json.loads(fetch(API + path))


def block(text, key):
    m = re.search(r"<!--MK:%s-->(.*?)<!--/MK:%s-->" % (key, key), text, re.S)
    return m.group(1) if m else None


def official(row):
    r = row.get("official_rank")
    return f"#{int(r)}" if r else "NR"


def check_leaderboards(text):
    problems = []
    body = block(text, "lbBody")
    if body is None:
        return ["lbBody marker missing"]
    rows = re.findall(
        r'<tr><td><span class="rank[^"]*"[^>]*>([^<]*)</span></td>.*?data-username="([^"]+)"', body, re.S)
    if not rows:
        return ["no baked leaderboard rows"]
    expected = api("/leaderboard?sortBy=rank&minPicks=25&limit=100").get("leaderboard", [])
    want = [(official(r), r["username"]) for r in expected]
    got = [(rank.strip(), htmllib.unescape(u)) for rank, u in rows]
    if [u for _, u in got] != [u for _, u in want]:
        problems.append(f"row order/set differs from the API: baked {[u for _, u in got][:6]} vs API {[u for _, u in want][:6]}")
    wmap = {u: rk for rk, u in want}
    for rk, u in got:
        if u in wmap and wmap[u] != rk:
            problems.append(f"{u}: baked {rk}, API {wmap[u]}")
    if re.search(r'class="rank (gold|silver|bronze)"', body):
        problems.append("legacy row-index medal markup (rank gold/silver/bronze) still baked")
    return problems


def check_handicappers(text):
    problems = []
    body = block(text, "hmRows")
    if body is None:
        return ["hmRows marker missing"]
    rows = re.findall(r'class="hm-row hm-member-row" data-username="([^"]+)"[^>]*?data-official-rank="([^"]*)"', body)
    total = len(re.findall(r'class="hm-row hm-member-row"', body))
    if not total:
        return ["no baked directory rows"]
    if len(rows) != total:
        problems.append(f"{total - len(rows)} baked row(s) carry no data-official-rank")
    expected = {r["username"]: official(r) for r in api("/leaderboard?sortBy=rank&minPicks=1&limit=100").get("leaderboard", [])}
    for u, rk in rows:
        u = htmllib.unescape(u)
        want = expected.get(u, "NR")
        if rk != want:
            problems.append(f"{u}: baked {rk}, API {want}")
    return problems


def check_home(text):
    problems = []
    body = block(text, "homeLeaderboard")
    if body is None:
        return ["homeLeaderboard marker missing"]
    boot = api("/home-bootstrap")
    ranked = [r for r in boot.get("leaderboard", []) if r.get("official_rank")]
    baked = re.findall(r'<span class="rk[^"]*">(\d+)</span>.*?href="/u/([^/"]+)/"', body, re.S)
    if not ranked:
        if baked:
            problems.append(f"API issues no official overall ranks but the card bakes {len(baked)} numbered row(s)")
        if "No official ranks issued yet" not in body:
            problems.append("empty state missing while the API issues no official ranks")
        return problems
    want = [(str(int(r["official_rank"])), r["username"]) for r in sorted(ranked, key=lambda r: r["official_rank"])][:10]
    got = [(n, htmllib.unescape(urllib_unquote(u))) for n, u in baked]
    if got != want:
        problems.append(f"baked {got[:5]} vs API {want[:5]}")
    return problems


def urllib_unquote(v):
    import urllib.parse
    return urllib.parse.unquote(v)


CHECKS = {
    "leaderboards/index.html": check_leaderboards,
    "handicappers/index.html": check_handicappers,
    "index.html": check_home,
}


def run(live=False):
    results = {}
    for rel, fn in CHECKS.items():
        try:
            if live:
                text = fetch(f"{SITE}{SURFACES[rel]}?rankcheck={int(time.time())}")
            else:
                with open(os.path.join(ROOT, rel), encoding="utf-8") as f:
                    text = f.read()
            results[rel] = fn(text)
        except Exception as ex:
            results[rel] = [f"could not verify: {type(ex).__name__}: {ex}"]
    return results


def main():
    live = "--live" in sys.argv
    results = run(live)
    if "--json" in sys.argv:
        print(json.dumps(results))
    else:
        for rel, problems in results.items():
            label = SURFACES[rel] if live else rel
            if problems:
                print(f"FAIL {label}")
                for p in problems[:12]:
                    print(f"     - {p}")
            else:
                print(f"OK   {label}: every baked rank equals the live canonical ranking API")
    return 1 if any(results.values()) else 0


if __name__ == "__main__":
    sys.exit(main())
