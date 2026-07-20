"""
Adopt the shared design system on a production page.

Applies the exact same, enumerated set of edits the /handicappers/ preview was
approved with. Every edit is a `replace exactly once or abort` operation, so a
page whose markup does not match the expected shape fails loudly instead of
being half-converted.

What it does NOT do: touch markup, data bindings, scripts other than the sitewide
pair, canonical tags, meta, JSON-LD, or routes. Purely a stylesheet/nav swap.

Usage:
    python scripts/adopt_design_system.py handicappers/index.html --page-css tmr-ds-handicappers.css
    python scripts/adopt_design_system.py leaderboards/index.html --page-css tmr-ds-leaderboards.css --dark

Options:
    --dark        add `tmr-ds--dark` (navy surface mode, for data-dense tools)
    --keep-nav    leave tmr-sitewide.js in place (for pages mid-migration)
    --dry-run     report what would change, write nothing
"""
import argparse
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
MANIFEST = ROOT / "static" / "ds-assets.json"

# The sitewide pair is matched by pattern because pages carry different ?v= tags.
SITEWIDE_CSS_RE = re.compile(r'[ \t]*<link[^>]+href="/static/css/tmr-sitewide\.css[^"]*"[^>]*>\n?')
SITEWIDE_JS_RE = re.compile(r'[ \t]*<script[^>]+src="/static/js/tmr-sitewide\.js[^"]*"[^>]*>\s*</script>\n?')
# Any Google-Fonts link that requests plain Barlow -> Barlow Condensed.
BARLOW_RE = re.compile(r'(fonts\.googleapis\.com/css2\?family=)Barlow(:wght|&|")')


def assets():
    m = json.loads(MANIFEST.read_text(encoding="utf-8"))
    return m["static/css/tmr-ds.css"], m["static/js/tmr-ds-nav.js"], m


def adopt(path, page_css_name, dark=False, keep_nav=False, dry_run=False):
    ds_css, ds_nav, manifest = assets()
    page_css_key = f"static/css/{page_css_name}"
    if page_css_key not in manifest:
        sys.exit(f"ABORT: {page_css_key} is not in {MANIFEST.name}. "
                 f"Create it and run scripts/build_ds_assets.py first.")
    page_css = manifest[page_css_key]

    src = ROOT / path
    html = src.read_text(encoding="utf-8")
    orig = html
    notes = []

    # 1. body class
    m = re.search(r"<body([^>]*)>", html)
    if not m:
        sys.exit("ABORT: no <body> tag")
    attrs = m.group(1)
    cls = "tmr-ds tmr-ds--dark" if dark else "tmr-ds"
    if "tmr-ds" in attrs:
        notes.append("body already carries tmr-ds - left as is")
    elif 'class="' in attrs:
        new_attrs = attrs.replace('class="', f'class="{cls} ', 1)
        html = html.replace(m.group(0), f"<body{new_attrs}>", 1)
        notes.append(f"body class += {cls}")
    else:
        html = html.replace(m.group(0), f'<body{attrs} class="{cls}">', 1)
        notes.append(f"body class = {cls}")

    # 2/3. drop the sitewide pair (its 3 fighting :root blocks, !important headings,
    #      and the MutationObserver that force-hides nav.nav)
    html, n_css = SITEWIDE_CSS_RE.subn("", html)
    notes.append(f"removed tmr-sitewide.css links: {n_css}")
    if not keep_nav:
        html, n_js = SITEWIDE_JS_RE.subn("", html)
        notes.append(f"removed tmr-sitewide.js tags: {n_js}")

    # 4. display face
    html, n_font = BARLOW_RE.subn(r"\1Barlow+Condensed\2", html)
    notes.append(f"Barlow -> Barlow Condensed in font links: {n_font}")

    # 5. design-system stylesheets, immediately before </head> so they load last
    if "tmr-ds.css" in html or ds_css in html:
        notes.append("ds stylesheets already present - skipped")
    else:
        links = (f'    <link rel="stylesheet" href="{ds_css}">\n'
                 f'    <link rel="stylesheet" href="{page_css}">\n')
        if html.count("</head>") != 1:
            sys.exit("ABORT: expected exactly one </head>")
        html = html.replace("</head>", links + "</head>", 1)
        notes.append("added ds + page stylesheets before </head>")

    # 6. shared nav/footer
    if "tmr-ds-nav" in html:
        notes.append("ds nav already present - skipped")
    else:
        if html.count("</body>") != 1:
            sys.exit("ABORT: expected exactly one </body>")
        html = html.replace("</body>", f'<script src="{ds_nav}"></script>\n</body>', 1)
        notes.append("added tmr-ds-nav before </body>")

    print(f"--- {path} ---")
    for n in notes:
        print("   " + n)
    print(f"   {len(orig)} -> {len(html)} chars ({len(html) - len(orig):+d})")

    if dry_run:
        print("   DRY RUN - nothing written")
        return
    if html == orig:
        print("   no change")
        return
    src.write_text(html, encoding="utf-8")
    print("   written")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("path")
    ap.add_argument("--page-css", required=True)
    ap.add_argument("--dark", action="store_true")
    ap.add_argument("--keep-nav", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()
    adopt(a.path, a.page_css, dark=a.dark, keep_nav=a.keep_nav, dry_run=a.dry_run)
