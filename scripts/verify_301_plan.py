#!/usr/bin/env python3
"""Verify the SEO 301 plan of 2026-09-24 (docs/cloud-audit/SEO_301_PLAN_20260924.md).

Pairs: every row of data/forum-slug-overrides.json plus the NFL Game of the Week
page. For each old URL -> new URL:

  repo (default)
    1. old path is a redirect stub: meta refresh, JS replace and canonical all
       name the new URL                                     (exactly one hop)
    2. new path is a real page: 200 file, self canonical, no noindex, no refresh
                                                             (no chain, no loop)
    3. no stub anywhere in the repo redirects to an old URL  (no chain into it)
    4. new URL in sitemap.xml, old URL not
    5. zero references to the old path in any tracked page, script or data file
    6. no page other than the new page and its redirect stubs names the new URL
       as canonical (pre existing duplicate views are listed as WARN)

  --live (after deploy only)
    follows the old URL hop by hop (HTTP Location or meta refresh) and requires
    exactly one hop to the new URL, then 200 + self canonical on the new URL.

Exit 0 when every check passes, 1 otherwise.
"""
import json
import os
import re
import subprocess
import sys
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = "https://trustmyrecord.com"
NFL = [("/nfl/49ers-vs-rams-week-1-2026/", "/nfl/49ers-vs-rams-melbourne/")]
# Pre existing full duplicate that canonicalises to the NFL game page. Reported,
# not failed: converting it to a redirect is outside the approved plan.
KNOWN_DUPLICATE_VIEWS = {"/nfl-game-of-the-week/week-1-49ers-rams-melbourne/"}
SKIP_SCAN = {"docs/cloud-audit/SEO_20260924.md", "docs/cloud-audit/SEO_301_PLAN_20260924.md",
             "data/forum-slug-overrides.json", "scripts/verify_301_plan.py"}
TEXT_EXT = (".html", ".js", ".cjs", ".json", ".xml", ".txt", ".py", ".md")

CANON = re.compile(r'<link\s+rel="canonical"\s+href="([^"]+)"', re.I)
REFRESH = re.compile(r'http-equiv="refresh"\s+content="\d+;\s*url=([^"]+)"', re.I)
REPLACE = re.compile(r"location\.replace\(\s*[\"']([^\"']+)[\"']")
ROBOTS = re.compile(r'<meta\s+name="robots"\s+content="([^"]*)"', re.I)


def pairs():
    with open(os.path.join(ROOT, "data", "forum-slug-overrides.json"), encoding="utf-8") as fh:
        rows = json.load(fh)["threads"]
    out = [("/forum/thread/%s/%s/" % (tid, r["old"]), "/forum/thread/%s/%s/" % (tid, r["new"]))
           for tid, r in sorted(rows.items(), key=lambda kv: int(kv[0]))]
    # Older renamed-slug stubs of the same threads are old URLs too.
    for tid in rows:
        d = os.path.join(ROOT, "forum", "thread", tid)
        for name in sorted(os.listdir(d)):
            p = "/forum/thread/%s/%s/" % (tid, name)
            if name not in (rows[tid]["old"], rows[tid]["new"]):
                out.append((p, "/forum/thread/%s/%s/" % (tid, rows[tid]["new"])))
    return out + NFL


def read(path):
    f = os.path.join(ROOT, path.strip("/"), "index.html")
    if not os.path.isfile(f):
        return None
    with open(f, encoding="utf-8", errors="ignore") as fh:
        return fh.read()


def absu(u):
    return u if u.startswith("http") else SITE + u


def repo_checks(plan):
    fails, warns = [], []
    olds = {o for o, _ in plan}
    news = {n for _, n in plan}
    sitemap = open(os.path.join(ROOT, "sitemap.xml"), encoding="utf-8").read()
    locs = set(re.findall(r"<loc>\s*([^<\s]+)\s*</loc>", sitemap))
    for old, new in plan:
        o, n = read(old), read(new)
        if o is None:
            fails.append("%s: old path has no stub" % old)
        else:
            tgt = {absu(x) for x in REFRESH.findall(o) + REPLACE.findall(o)} | set(CANON.findall(o))
            if tgt != {SITE + new}:
                fails.append("%s: stub targets %s, expected %s" % (old, sorted(tgt), SITE + new))
        if n is None:
            fails.append("%s: new page missing" % new)
            continue
        c = CANON.findall(n)
        if c != [SITE + new]:
            fails.append("%s: canonical %s, not self" % (new, c))
        if REFRESH.search(n) or REPLACE.search(n):
            fails.append("%s: new page is itself a redirect (chain)" % new)
        if "noindex" in " ".join(ROBOTS.findall(n)).lower():
            fails.append("%s: noindex" % new)
        if old == new:
            fails.append("%s: redirects to itself (loop)" % old)
        if SITE + new not in locs:
            fails.append("%s: not in sitemap" % new)
        if SITE + old in locs:
            fails.append("%s: old URL still in sitemap" % old)

    files = subprocess.run(["git", "ls-files", "--cached", "--others", "--exclude-standard"],
                           cwd=ROOT, capture_output=True, text=True).stdout.split("\n")
    stub_files = {(o.strip("/") + "/index.html") for o in olds}
    refs, claims = [], {}
    for f in files:
        if not f or not f.endswith(TEXT_EXT) or f in SKIP_SCAN or f.startswith("node_modules/"):
            continue
        try:
            with open(os.path.join(ROOT, f), encoding="utf-8", errors="ignore") as fh:
                t = fh.read()
        except OSError:
            continue
        if f not in stub_files:
            for old in olds:
                if old in t:
                    refs.append("%s -> %s" % (f, old))
        if f.endswith(".html"):
            for c in CANON.findall(t)[:1]:
                path = c[len(SITE):] if c.startswith(SITE) else c
                if path in news:
                    page = "/" + f[: -len("index.html")] if f.endswith("index.html") else "/" + f
                    is_stub = bool(REFRESH.search(t))
                    if page != path and not is_stub:
                        claims.setdefault(path, []).append(page)
    for r in refs:
        fails.append("internal reference to old URL: " + r)
    for path, pages in claims.items():
        for p in pages:
            (warns if p in KNOWN_DUPLICATE_VIEWS else fails).append(
                "%s also claims canonical %s" % (p, path))
    return fails, warns, len(refs)


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k):
        return None


def fetch(url):
    op = urllib.request.build_opener(NoRedirect)
    try:
        r = op.open(urllib.request.Request(url, headers={"User-Agent": "TMR-301-verify"}), timeout=30)
        return r.status, None, r.read().decode("utf-8", "ignore")
    except urllib.error.HTTPError as e:
        return e.code, e.headers.get("Location"), ""


def live_checks(plan):
    fails = []
    for old, new in plan:
        url, hops, seen = SITE + old, 0, set()
        while True:
            if url in seen:
                fails.append("%s: redirect loop" % old)
                break
            seen.add(url)
            st, loc, body = fetch(url)
            nxt = absu(loc) if st in (301, 302, 307, 308) and loc else None
            if st == 200 and not nxt:
                m = REFRESH.search(body)
                nxt = absu(m.group(1)) if m else None
            if not nxt:
                break
            url, hops = nxt, hops + 1
            if hops > 5:
                break
        if hops != 1 or url != SITE + new:
            fails.append("%s: %d hop(s), ends at %s" % (old, hops, url))
            continue
        st, _, body = fetch(url)
        if st != 200 or CANON.findall(body)[:1] != [SITE + new]:
            fails.append("%s: final HTTP %s, canonical %s" % (new, st, CANON.findall(body)[:1]))
    return fails


def main():
    plan = pairs()
    fails, warns, _ = repo_checks(plan)
    print("pairs checked: %d" % len(plan))
    if "--live" in sys.argv:
        fails += live_checks(plan)
    for w in warns:
        print("WARN " + w)
    for f in fails:
        print("FAIL " + f)
    print("ALL 301 PLAN CHECKS PASSED" if not fails else "%d failure(s)" % len(fails))
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
