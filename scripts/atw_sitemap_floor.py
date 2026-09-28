#!/usr/bin/env python3
"""ATW_SITEMAP_FLOOR_20260928 (Nima approved, AdSense cleanup A).

A Handicappers Around the Web profile stays in sitemap.xml only while it has
at least MIN_GRADED graded picks. Below that the page is untouched: still live,
still index,follow, same URL and canonical. It is only left out of the sitemap.

The count is read from the published page itself (window.__TMR_EXTERNAL_SAMPLE,
written by the Watchdog profile builder), so this script and the page can never
disagree.

Why it lives here and not only in the Watchdog: the Watchdog rewrites the
BEGIN/END_AROUND_THE_WEB_URLS block on its daily publish, and while the SEO
freeze is on it only keeps URLs that were already in that block. A profile
pruned here would then never come back. So the candidate set is the current
block plus data/atw-sitemap-approved.json (every profile URL that was in the
sitemap on 2026-09-28), and a pruned profile returns automatically on the next
run after it reaches MIN_GRADED.

Runs as a stage of scripts/prerender_run.py (every 30 minutes). Idempotent.
"""
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITEMAP = os.path.join(ROOT, "sitemap.xml")
APPROVED = os.path.join(ROOT, "data", "atw-sitemap-approved.json")
SITE = "https://trustmyrecord.com"
HUB = f"{SITE}/around-the-web/"
MIN_GRADED = 5
BLOCK_RE = re.compile(r"(?P<indent>[ \t]*)<!-- BEGIN_AROUND_THE_WEB_URLS -->.*?<!-- END_AROUND_THE_WEB_URLS -->", re.S)
SAMPLE_RE = re.compile(r"window\.__TMR_EXTERNAL_SAMPLE=(\d+)")


def graded(url):
    slug = url[len(HUB):].strip("/")
    path = os.path.join(ROOT, "around-the-web", slug, "index.html")
    if not slug or not os.path.isfile(path):
        return None
    with open(path, encoding="utf-8") as f:
        m = SAMPLE_RE.search(f.read())
    return int(m.group(1)) if m else None


def main():
    with open(SITEMAP, "rb") as f:
        xml = f.read().decode("utf-8")
    m = BLOCK_RE.search(xml)
    if not m:
        print("no Around the Web block in sitemap.xml; nothing to do")
        return 0
    nl = "\r\n" if "\r\n" in xml else "\n"
    in_block = re.findall(r"<loc>\s*([^<\s]+)\s*</loc>", m.group(0))
    approved = []
    if os.path.isfile(APPROVED):
        with open(APPROVED, encoding="utf-8") as f:
            approved = json.load(f)
    outside = set(re.findall(r"<loc>\s*([^<\s]+)\s*</loc>", xml[:m.start()] + xml[m.end():]))

    keep, dropped, seen = [], 0, set()
    for url in [HUB] + in_block + approved:
        if url in seen or url in outside:
            continue
        seen.add(url)
        if url == HUB:
            keep.append(url)
            continue
        n = graded(url)
        if n is not None and n >= MIN_GRADED:
            keep.append(url)
        elif url in in_block:
            dropped += 1

    ind = m.group("indent")
    block = [f"{ind}<!-- BEGIN_AROUND_THE_WEB_URLS -->"]
    block += [f"{ind}<url><loc>{u}</loc><changefreq>daily</changefreq><priority>0.6</priority></url>" for u in keep]
    block.append(f"{ind}<!-- END_AROUND_THE_WEB_URLS -->")
    new = xml[:m.start()] + nl.join(block) + xml[m.end():]
    if new != xml:
        with open(SITEMAP, "wb") as f:
            f.write(new.encode("utf-8"))
    print(f"Around the Web sitemap: {len(keep) - 1} profiles with {MIN_GRADED}+ graded picks listed, "
          f"{dropped} under {MIN_GRADED} left out (pages stay live and indexable)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
