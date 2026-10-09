#!/usr/bin/env python3
"""Give every existing rotation Matchup of the Day page its own OG card.
MOTD_OG_CARD_20261008.

Reads each page listed in data/featured-urls.json, rebuilds the card from what
the page itself states (the SportsEvent teams and start time, the H1 angle) and
points og:image, og:image:width/height and the Article image at it. Nothing
else on the page changes. A page whose card cannot be built is left exactly as
it was and reported.

  python scripts/backfill_featured_og.py --render-only SLUG [SLUG...]   cards only, pages untouched
  python scripts/backfill_featured_og.py                                every page
"""

import argparse
import datetime as dt
import html
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import featured_og  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = "https://trustmyrecord.com"
GENERIC = SITE + "/static/og/og-home.png"


def page_ctx(path, sport):
    text = open(path, encoding="utf-8").read()
    event = None
    for block in re.findall(r'<script type="application/ld\+json">\s*(.*?)\s*</script>', text, re.S):
        try:
            data = json.loads(block)
        except ValueError:
            continue
        for node in data.get("@graph", [data]) if isinstance(data, dict) else data:
            if isinstance(node, dict) and node.get("@type") == "SportsEvent":
                event = node
    if not event:
        return text, None
    h1 = re.search(r"<h1[^>]*>(.*?)</h1>", text, re.S)
    start = dt.datetime.strptime(event["startDate"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=dt.timezone.utc)
    return text, {
        "sport": sport,
        "away": event["awayTeam"]["name"],
        "home": event["homeTeam"]["name"],
        "start": start,
        "time_valid": "time to be determined" not in text,
        "angle": html.unescape(re.sub(r"<[^>]+>", "", h1.group(1))).strip() if h1 else None,
    }


def patch(text, url):
    out = text.replace('<meta property="og:image" content="%s">' % GENERIC,
                       '<meta property="og:image" content="%s">\n<meta property="og:image:width" content="1200">\n'
                       '<meta property="og:image:height" content="630">' % url, 1)
    out = out.replace('"image": "%s"' % GENERIC, '"image": "%s"' % url, 1)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--render-only", nargs="*")
    a = ap.parse_args()
    store = json.load(open(os.path.join(ROOT, "data", "featured-urls.json"), encoding="utf-8"))
    entries = {v["slug"]: (k.split(":", 1)[0], v["href"]) for k, v in store.items()}
    slugs = a.render_only if a.render_only else sorted(entries)
    done, skipped = 0, []
    for slug in slugs:
        href = entries.get(slug, (None, ""))[1]
        path = os.path.join(ROOT, href.strip("/").replace("/", os.sep), "index.html")
        if slug not in entries or not os.path.exists(path):
            skipped.append((slug, "no page"))
            continue
        text, ctx = page_ctx(path, entries[slug][0])
        if not ctx:
            skipped.append((slug, "no SportsEvent"))
            continue
        rel = featured_og.build(ROOT, slug, ctx, force=bool(a.render_only))
        if not rel:
            skipped.append((slug, "Pillow missing"))
            continue
        if a.render_only is None:
            new = patch(text, SITE + rel)
            if new != text:
                with open(path, "w", encoding="utf-8", newline="\n") as fh:
                    fh.write(new)
        done += 1
        print("OK", slug, rel)
    for s, why in skipped:
        print("SKIP", s, why)
    print("cards %d, skipped %d" % (done, len(skipped)))
    return 1 if skipped and not a.render_only else 0


if __name__ == "__main__":
    sys.exit(main())
