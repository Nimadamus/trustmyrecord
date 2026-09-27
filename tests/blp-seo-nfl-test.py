"""Static validation for the BetLegend Pro NFL research pages.

    python tests/blp-seo-nfl-test.py

Checks every page under /betlegend-pro/nfl/ against its manifest: status of
the file, one title / description / canonical / H1, unique titles,
descriptions and H1s, index,follow robots, valid JSON-LD with a
BreadcrumbList that matches the visible trail, every internal link resolving
to a real page, no parameter URLs, no orphan, the game set digest matching
the manifest, the matchup table listing exactly its meetings, and house style
(no dashes as punctuation, no spelled out minus, no backend disclaimers).
"""
import hashlib
import html
import json
import os
import re
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
SITE = "https://trustmyrecord.com"
fails = []


def fail(msg):
    fails.append(msg)


def exists(path):
    path = path.split("#")[0]
    if not path.startswith("/"):
        return True
    local = os.path.join(ROOT, path.strip("/").replace("/", os.sep))
    return os.path.isfile(os.path.join(local, "index.html")) or os.path.isfile(local)


manifest = json.load(open(os.path.join(ROOT, "betlegend-pro", "nfl", "manifest.json"), encoding="utf-8"))
pages = manifest["pages"]
if len(pages) != 81:
    fail(f"expected 81 pages, manifest has {len(pages)}")

seen = {"title": {}, "description": {}, "h1": {}}
inbound = {p["url"]: 0 for p in pages}
DISCLAIMERS = re.compile(r"not in this dataset|no data|unavailable|missing|not available|estimate|database does not|behind today",
                         re.I)
for p in pages:
    path = p["url"][len(SITE):]
    f = os.path.join(ROOT, path.strip("/").replace("/", os.sep), "index.html")
    if not os.path.isfile(f):
        fail(f"missing file for {path}")
        continue
    s = open(f, encoding="utf-8").read()
    head = s[:s.index("</head>")]

    def one(rx, label):
        m = re.findall(rx, head if label != "h1" else s, re.S)
        if len(m) != 1:
            fail(f"{path}: {len(m)} {label}")
            return ""
        return html.unescape(m[0])

    title = one(r"<title>(.*?)</title>", "title")
    desc = one(r'<meta name="description" content="(.*?)">', "description")
    canon = one(r'<link rel="canonical" href="(.*?)">', "canonical")
    robots = one(r'<meta name="robots" content="(.*?)">', "robots")
    h1 = re.sub(r"<[^>]+>", "", one(r"<h1>(.*?)</h1>", "h1"))
    if canon != p["url"]:
        fail(f"{path}: canonical {canon}")
    if not robots.startswith("index, follow"):
        fail(f"{path}: robots {robots}")
    if title != p["title"] or desc != p["description"]:
        fail(f"{path}: title/description differ from manifest")
    if not (70 <= len(desc) <= 170):
        fail(f"{path}: description length {len(desc)}")
    for k, v in (("title", title), ("description", desc), ("h1", h1)):
        if v in seen[k]:
            fail(f"duplicate {k}: {path} and {seen[k][v]}")
        seen[k][v] = path

    # JSON-LD and breadcrumbs
    lds = [json.loads(x) for x in re.findall(r'<script type="application/ld\+json">(.*?)</script>', s, re.S)]
    crumbs = [x for x in lds if x.get("@type") == "BreadcrumbList"]
    if len(crumbs) != 1:
        fail(f"{path}: {len(crumbs)} BreadcrumbList")
    else:
        items = crumbs[0]["itemListElement"]
        if [i["position"] for i in items] != list(range(1, len(items) + 1)):
            fail(f"{path}: breadcrumb positions")
        if items[-1]["item"] != p["url"]:
            fail(f"{path}: last breadcrumb is not the page")
        for i in items:
            if not exists(i["item"][len(SITE):]) and i["item"] != SITE + "/":
                fail(f"{path}: breadcrumb target missing {i['item']}")
        nav = re.search(r'<nav class="crumbs"[^>]*>(.*?)</nav>', s, re.S)
        visible = [html.unescape(re.sub(r"<[^>]+>", "", x)).strip()
                   for x in re.split(r'<span class="sep"[^>]*>.*?</span>', nav.group(1))] if nav else []
        if visible != [i["name"] for i in items]:
            fail(f"{path}: visible breadcrumb {visible} != schema")
    types = {x.get("@type") for x in lds}
    if not ({"WebPage", "CollectionPage"} & types):
        fail(f"{path}: no WebPage schema")
    if "FAQPage" in types or "Dataset" in types:
        fail(f"{path}: schema type not approved for these pages")

    # links
    main = s[s.index("<main"):s.index("</main>")]
    for href in re.findall(r'<a [^>]*href="([^"]+)"', main):
        if "?" in href:
            fail(f"{path}: parameter URL {href}")
        if href.startswith("/") and not exists(href):
            fail(f"{path}: broken link {href}")
        full = SITE + href.split("#")[0]
        if full in inbound and full != p["url"]:
            inbound[full] += 1

    # game set
    digest = re.search(r'<meta name="blp-game-set" content="n=(\d+) sha256=([0-9a-f]+)">', head)
    if not digest or int(digest.group(1)) != p["games"] or digest.group(2) != p["sha256"]:
        fail(f"{path}: game set digest differs from manifest")
    if p["game_ids"] is not None and hashlib.sha256("\n".join(p["game_ids"]).encode()).hexdigest() != p["sha256"]:
        fail(f"{path}: manifest id list does not hash to its digest")
    if p["kind"] == "matchup":
        full = re.search(r'<section[^>]*id="meetings"[^>]*>(.*?)</section>', main, re.S)
        listed = re.findall(r'<tr data-game-id="([^"]+)"', full.group(1) if full else main)
        if sorted(html.unescape(x) for x in listed) != p["game_ids"]:
            fail(f"{path}: meetings table lists {len(listed)} rows, not the page's game set")

    # the headline figures in the manifest are printed on the page
    if "<span class=\"nw\"></span>" in s:
        fail(f"{path}: empty record span")
    visible_main = html.unescape(re.sub(r"<[^>]+>", "", main))
    st = p["stats"]
    for key in ("su", "ats", "ou", "ats_a", "home_su", "home_ats"):
        if key in st and st[key] not in visible_main:
            fail(f"{path}: headline {key} {st[key]} not printed")
    if "su_a" in st:
        # The series is printed from the leader's side, so either orientation.
        w, l, *t = st["su_a"].split("-")
        flipped = "-".join([l, w] + t)
        if st["su_a"] not in visible_main and flipped not in visible_main:
            fail(f"{path}: series record {st['su_a']} not printed")

    # house style on visible text
    text = html.unescape(re.sub(r"<[^>]+>", " ", re.sub(r"<script.*?</script>", "", s, flags=re.S)))
    if re.search("[–—]", text) or re.search(r"\s-\s", text):
        fail(f"{path}: dash used as punctuation")
    if re.search(r"\bminus\b", text, re.I):
        fail(f"{path}: spelled out minus")
    if DISCLAIMERS.search(re.sub(r"<[^>]+>", " ", main)):
        fail(f"{path}: internal disclaimer wording: {DISCLAIMERS.search(main).group(0)}")

for url, n in inbound.items():
    if n == 0:
        fail(f"orphan: {url}")

for f in fails:
    print("FAIL", f)
print(f"{len(pages)} pages checked, {len(fails)} failures")
sys.exit(1 if fails else 0)
