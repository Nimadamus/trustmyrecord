"""
Build the design-system preview of /handicappers/ at /preview/handicappers/.

Method (the one that worked for the homepage v2 preview): byte-for-byte clone of
the live page + a small, enumerated set of edits. Every data binding, script,
JSON-LD block and piece of markup is carried over untouched, so the preview is a
pure visual comparison against production.

Edits applied (and nothing else):
  1. <body>  ->  <body class="tmr-ds">          (opt into the design system)
  2. drop  tmr-sitewide.css                     (its 3 fighting :root blocks and
  3. drop  tmr-sitewide.js                       !important headings are what the
                                                 design system replaces; its nav
                                                 kill-switch also force-hides the
                                                 approved nav, so the two cannot
                                                 coexist)
  4. font link gains Barlow Condensed           (the approved display face)
  5. add   tmr-ds.css + tmr-ds-handicappers.css
  6. add   tmr-ds-nav.js                        (approved nav + footer)

Canonical is deliberately left pointing at the production URL.

Run:  python scripts/build_ds_preview_handicappers.py
"""
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "handicappers" / "index.html"
OUT = ROOT / "preview" / "handicappers" / "index.html"

# Content-hashed asset URLs. `?v=` is useless here — the CDN caches by path and
# ignores the query string — so the filename itself has to change.
# Run scripts/build_ds_assets.py first; it writes this manifest.
ASSETS = json.loads((ROOT / "static" / "ds-assets.json").read_text(encoding="utf-8"))
DS_CSS = ASSETS["static/css/tmr-ds.css"]
DS_PAGE_CSS = ASSETS["static/css/tmr-ds-handicappers.css"]
DS_NAV = ASSETS["static/js/tmr-ds-nav.js"]

OLD_FONTS = ('<link href="https://fonts.googleapis.com/css2?family=Barlow:wght@600;700;800;900'
             '&family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">')
NEW_FONTS = ('<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700;800;900'
             '&family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">\n'
             f'    <link rel="stylesheet" href="{DS_CSS}">\n'
             f'    <link rel="stylesheet" href="{DS_PAGE_CSS}">')

SITEWIDE_CSS = '<link rel="stylesheet" href="/static/css/tmr-sitewide.css?v=20260720v4">'
SITEWIDE_JS = '<script defer src="/static/js/tmr-sitewide.js?v=20260720alerts"></script>'
DS_NAV_JS = f'<script src="{DS_NAV}"></script>\n</body>'


def sub_once(html, old, new, label):
    """Replace exactly once, or fail loudly. A silent no-op here would ship a
    preview that quietly still loads the old stylesheet."""
    n = html.count(old)
    if n != 1:
        sys.exit(f"ABORT: expected exactly 1 occurrence of {label}, found {n}")
    return html.replace(old, new, 1)


def main():
    html = SRC.read_text(encoding="utf-8")

    html = sub_once(html, "<body>", '<body class="tmr-ds">', "<body>")
    html = sub_once(html, SITEWIDE_CSS + "\n", "", "tmr-sitewide.css link")
    html = sub_once(html, SITEWIDE_JS + "\n", "", "tmr-sitewide.js tag")
    html = sub_once(html, OLD_FONTS, NEW_FONTS, "google fonts link")
    html = sub_once(html, "</body>", DS_NAV_JS, "</body>")

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(html, encoding="utf-8")

    src_len = len(SRC.read_text(encoding="utf-8"))
    print(f"wrote {OUT.relative_to(ROOT)}")
    print(f"source {src_len} chars -> preview {len(html)} chars (delta {len(html) - src_len:+d})")


if __name__ == "__main__":
    main()
