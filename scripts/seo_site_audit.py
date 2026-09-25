#!/usr/bin/env python3
"""Offline whole site SEO audit for the trustmyrecord repo (cloud audit 2026-09-24).

Complements tests/seo-indexability-regression-test.js (which only checks what IS in
the sitemap) by looking at EVERY tracked HTML page:

  canonical   indexable pages must carry an absolute https://trustmyrecord.com canonical
              that equals the page's own URL
  title/desc  present, not duplicated across indexable pages
  jsonld      every application/ld+json block parses
  sitemap     every indexable self canonical page is listed (coverage), and every
              sitemap URL maps to a tracked file
  orphans     every indexable page has at least one inbound static link from another page
              (or from the JS global nav/footer in static/js/tmr-sitewide.js)
  dates       no URL path carries a calendar date (matchup/article URL rule)

Usage:  python scripts/seo_site_audit.py [--json out.json] [--strict]
Exit 0 always unless --strict, where any FAIL class exits 1.
"""
import json
import os
import re
import subprocess
import sys
from collections import defaultdict
from html.parser import HTMLParser

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HOST = "https://trustmyrecord.com"

# Directories that are never public SEO surfaces.
EXCLUDE_PREFIX = (
    "admin/", "tests/", "test-results/", "docs/", "preview/", "approved/",
    "static/", "workers/", "embed/", "node_modules/", "scripts/", "archive/",
    "betlegend-pro/app/",
)
YEAR_RE = re.compile(r"(?<![0-9])20[2-3][0-9](?![0-9])")
DATE_RE = re.compile(r"(?:19|20)\d\d[-_/]?(?:0[1-9]|1[0-2])[-_/]?(?:0[1-9]|[12]\d|3[01])(?!\d)")


class Head(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.title = None
        self._in_title = False
        self._in_ld = False
        self._ld = []
        self.ld_blocks = []
        self.desc = None
        self.canonical = None
        self.robots = ""
        self.refresh = None
        self.hrefs = []
        self.h1 = 0

    def handle_starttag(self, tag, attrs):
        a = {k.lower(): (v or "") for k, v in attrs}
        if tag == "title" and self.title is None:
            self._in_title = True
            self.title = ""
        elif tag == "meta":
            n = a.get("name", "").lower()
            if n == "description" and self.desc is None:
                self.desc = a.get("content", "")
            elif n in ("robots", "googlebot"):
                self.robots += " " + a.get("content", "").lower()
            if a.get("http-equiv", "").lower() == "refresh":
                self.refresh = a.get("content", "")
        elif tag == "link" and "canonical" in a.get("rel", "").lower().split() and self.canonical is None:
            self.canonical = a.get("href", "")
        elif tag == "a" and a.get("href"):
            self.hrefs.append(a["href"])
        elif tag == "script" and a.get("type", "").lower() == "application/ld+json":
            self._in_ld = True
            self._ld = []
        elif tag == "h1":
            self.h1 += 1

    def handle_endtag(self, tag):
        if tag == "title":
            self._in_title = False
        elif tag == "script" and self._in_ld:
            self._in_ld = False
            self.ld_blocks.append("".join(self._ld))

    def handle_data(self, data):
        if self._in_title:
            self.title += data
        if self._in_ld:
            self._ld.append(data)


def url_for(path):
    if path == "index.html":
        return HOST + "/"
    if path.endswith("/index.html"):
        return HOST + "/" + path[: -len("index.html")]
    return HOST + "/" + path


def norm_href(href, base_url):
    href = href.split("#")[0].split("?")[0].strip()
    if not href or href.startswith(("mailto:", "tel:", "javascript:", "data:")):
        return None
    if href.startswith("//"):
        href = "https:" + href
    if href.startswith("http://trustmyrecord.com") or href.startswith("https://www.trustmyrecord.com"):
        href = HOST + href.split("trustmyrecord.com", 1)[1]
    if href.startswith("http"):
        return href if href.startswith(HOST) else None
    if href.startswith("/"):
        return HOST + href
    # relative
    base = base_url if base_url.endswith("/") else base_url.rsplit("/", 1)[0] + "/"
    parts = (base[len(HOST):] + href).split("/")
    out = []
    for p in parts:
        if p == "..":
            if out:
                out.pop()
        elif p != ".":
            out.append(p)
    return HOST + "/".join(out) if out and out[0] == "" else HOST + "/" + "/".join(out)


def canon_key(u):
    u = u.split("#")[0].split("?")[0]
    if u.endswith("/index.html"):
        u = u[: -len("index.html")]
    return u


def main():
    args = sys.argv[1:]
    files = subprocess.run(["git", "ls-files", "*.html"], cwd=ROOT, capture_output=True, text=True).stdout.split()
    sitemap = open(os.path.join(ROOT, "sitemap.xml"), encoding="utf-8").read()
    locs = re.findall(r"<loc>\s*([^<\s]+)\s*</loc>", sitemap)
    locset = set(locs)

    pages = {}
    inbound = defaultdict(set)
    raw_links = defaultdict(set)
    for f in files:
        if f.startswith(EXCLUDE_PREFIX) or "/_" in "/" + f or f.startswith("_") or f.startswith("."):
            continue
        try:
            html = open(os.path.join(ROOT, f), encoding="utf-8", errors="ignore").read()
        except OSError:
            continue
        p = Head()
        try:
            p.feed(html)
        except Exception:
            pass
        u = url_for(f)
        pages[u] = dict(file=f, title=(p.title or "").strip(), desc=(p.desc or "").strip(),
                        canonical=p.canonical, robots=p.robots, refresh=p.refresh,
                        ld=p.ld_blocks, h1=p.h1)
        for h in p.hrefs:
            t = norm_href(h, u)
            if t:
                t = canon_key(t)
                if t != u:
                    inbound[t].add(u)
                    raw_links[t].add(u)

    # JS global nav/footer + sitewide scripts count as inbound from every page.
    js_links = set()
    for js in ("static/js/tmr-sitewide.js", "static/js/navbar.js", "static/js/tmr-nav.js"):
        fp = os.path.join(ROOT, js)
        if os.path.exists(fp):
            for m in re.findall(r"""['"](/[a-z0-9][a-z0-9\-/]*/)['"]""", open(fp, encoding="utf-8", errors="ignore").read()):
                js_links.add(HOST + m)

    res = defaultdict(list)
    titles = defaultdict(list)
    descs = defaultdict(list)
    for u, d in pages.items():
        can = d["canonical"]
        noindex = "noindex" in d["robots"]
        stub = bool(d["refresh"]) or (can and canon_key(can) != u)
        # JSON-LD parses on every page
        for i, b in enumerate(d["ld"]):
            try:
                json.loads(b)
            except Exception as e:
                res["jsonld_invalid"].append(f"{u} block{i}: {str(e)[:80]}")
        if DATE_RE.search(u[len(HOST):]) and not noindex:
            res["date_in_url"].append(u)
        elif YEAR_RE.search(u[len(HOST):]) and not noindex and not d["refresh"]:
            res["year_in_url"].append(u)
        if noindex:
            if u in locset:
                res["noindex_in_sitemap"].append(u)
            continue
        if not can:
            res["canonical_missing"].append(u)
            continue
        if not can.startswith(HOST + "/"):
            res["canonical_bad_host_or_scheme"].append(f"{u} -> {can}")
        if stub:
            if u in locset:
                res["stub_in_sitemap"].append(u)
            continue
        if can != u:
            res["canonical_not_exact"].append(f"{u} -> {can}")
        if not d["title"]:
            res["title_missing"].append(u)
        else:
            titles[d["title"].lower()].append(u)
        if not d["desc"]:
            res["description_missing"].append(u)
        else:
            descs[d["desc"].lower()].append(u)
        if d["h1"] == 0:
            res["h1_missing"].append(u)
        if u not in locset:
            res["not_in_sitemap"].append(u)
        if not inbound.get(u) and u not in js_links and u != HOST + "/":
            res["orphan"].append(u)
    for t, us in titles.items():
        if len(us) > 1:
            res["duplicate_title"].append(f"{len(us)}x '{t[:70]}': " + ", ".join(sorted(us)[:4]))
    for t, us in descs.items():
        if len(us) > 1:
            res["duplicate_description"].append(f"{len(us)}x '{t[:60]}': " + ", ".join(sorted(us)[:4]))
    # Internal links that cost a redirect hop: a directory linked without its
    # trailing slash (GitHub Pages answers 301) or an alias stub (meta refresh).
    stubs = {u for u, d in pages.items() if d["refresh"]}
    for t, srcs in raw_links.items():
        if t in stubs:
            res["link_to_redirect_stub"].append("%s <- %d page(s), e.g. %s" % (t, len(srcs), sorted(srcs)[0]))
        elif not t.endswith("/") and "." not in t.rsplit("/", 1)[-1] and (t + "/") in pages:
            res["link_missing_trailing_slash"].append("%s <- %d page(s), e.g. %s" % (t, len(srcs), sorted(srcs)[0]))
    for loc in locs:
        if canon_key(loc) not in pages:
            res["sitemap_url_without_file"].append(loc)
        if DATE_RE.search(loc[len(HOST):]):
            res["sitemap_date_url"].append(loc)

    order = ["canonical_missing", "canonical_bad_host_or_scheme", "canonical_not_exact", "noindex_in_sitemap",
             "stub_in_sitemap", "sitemap_url_without_file", "jsonld_invalid", "title_missing",
             "description_missing", "h1_missing", "not_in_sitemap", "orphan", "duplicate_title",
             "duplicate_description", "date_in_url", "sitemap_date_url", "year_in_url",
             "link_to_redirect_stub", "link_missing_trailing_slash"]
    indexable = len([1 for u, d in pages.items() if d["canonical"] and "noindex" not in d["robots"]])
    print(f"pages scanned {len(pages)}  sitemap {len(locs)}  indexable-with-canonical {indexable}")
    for k in order:
        v = res.get(k, [])
        print(f"{'OK  ' if not v else 'FAIL'} {k}: {len(v)}")
        for x in sorted(v)[:12]:
            print("       " + x)
    if "--json" in args:
        json.dump(res, open(args[args.index("--json") + 1], "w"), indent=1)
    if "--strict" in args and any(res.get(k) for k in order):
        sys.exit(1)


if __name__ == "__main__":
    main()
