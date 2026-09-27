"""Write the BetLegend Pro research block of sitemap.xml from the manifest.

    python scripts/blp_seo/sitemap_nfl.py

Owns only the BEGIN_BLP_RESEARCH_URLS / END_BLP_RESEARCH_URLS block, the same
convention every other sitemap writer here follows. Lists exactly the pages in
betlegend-pro/nfl/manifest.json (each is index,follow with a self canonical, so
sitemap and canonical always agree). Run it only in the launch step, after the
pages return 200 live (SEO_INDEXING_PROTOCOL.md section 1). Byte safe: keeps the
file's CRLF line endings.
"""
import json
import os
import re

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SITEMAP = os.path.join(ROOT, "sitemap.xml")
manifest = json.load(open(os.path.join(ROOT, "betlegend-pro", "nfl", "manifest.json"), encoding="utf-8"))
lastmod = manifest["built_from"]["latest_date"]

raw = open(SITEMAP, "rb").read().decode("utf-8")
nl = "\r\n" if "\r\n" in raw else "\n"
urls = sorted(p["url"] for p in manifest["pages"])
block = (f"  <!-- BEGIN_BLP_RESEARCH_URLS -->{nl}"
         + "".join(f"  <url><loc>{u}</loc><lastmod>{lastmod}</lastmod></url>{nl}" for u in urls)
         + "  <!-- END_BLP_RESEARCH_URLS -->")
rx = re.compile(r"  <!-- BEGIN_BLP_RESEARCH_URLS -->.*?<!-- END_BLP_RESEARCH_URLS -->", re.S)
if rx.search(raw):
    out = rx.sub(lambda _m: block, raw)
else:
    out = raw.replace("</urlset>", block + nl + "</urlset>")
dupes = [u for u in urls if out.count(f"<loc>{u}</loc>") != 1]
if dupes:
    raise SystemExit(f"URL listed more than once: {dupes[:3]}")
open(SITEMAP, "wb").write(out.encode("utf-8"))
print(f"sitemap: {len(urls)} BetLegend Pro research URLs, lastmod {lastmod}")
