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
    --strip-important
                  remove `!important` from the page's own inline <style> blocks.
                  Those declarations exist almost entirely to out-shout
                  tmr-sitewide.css (which declares h1/h2 !important 4+ times and
                  forces the shell background). Once that file is gone they have
                  nothing to fight, and leaving them behind would force the
                  design system to escalate to !important too - which is exactly
                  the specificity war this project exists to end. Always follow
                  with a visual + parity check.
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
# The design system sets display type at weight 900. Pages that already load
# Barlow Condensed often stop at 800, which silently synthesises a fake bold.
BC_WEIGHTS_RE = re.compile(r'(Barlow\+Condensed:wght@)([\d;]+)')


def ensure_bc_900(html):
    def fix(m):
        weights = [w for w in m.group(2).split(";") if w]
        if "900" not in weights:
            weights.append("900")
        return m.group(1) + ";".join(sorted(weights, key=int))
    return BC_WEIGHTS_RE.subn(fix, html)


def assets():
    m = json.loads(MANIFEST.read_text(encoding="utf-8"))
    return m["static/css/tmr-ds.css"], m["static/js/tmr-ds-nav.js"], m


CLUSTER_RE = re.compile(r'(?s)(<section class="tmr-internal-cluster".*?</section>)')
STYLE_ATTR_RE = re.compile(r'\s+style="[^"]*"')


def clean_seo_cluster(html):
    """Strip inline style="" attributes inside .tmr-internal-cluster so the
    design system can style it. The block ships its colours inline on the old
    arena palette, which no stylesheet can beat without !important. Links, text
    and structure are untouched — only presentation attributes are removed.

    Only safe on pages that load tmr-ds.css; on any other page it would leave the
    block unstyled."""
    total = 0

    def repl(m):
        nonlocal total
        block, n = STYLE_ATTR_RE.subn("", m.group(1))
        total += n
        return block

    return CLUSTER_RE.sub(repl, html), total


def strip_important_in_styles(html):
    """Drop `!important` inside <style> blocks only. Inline style="" attributes
    and any JS strings are left alone."""
    total = 0

    def repl(m):
        nonlocal total
        block = m.group(0)
        block, n = re.subn(r"\s*!\s*important", "", block)
        total += n
        return block

    html = re.sub(r"(?s)<style.*?</style>", repl, html)
    return html, total


def adopt(path, page_css_name, dark=False, keep_nav=False, strip_important=False, dry_run=False):
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

    # 3a. the shared SEO cluster carries its palette inline
    html, n_seo = clean_seo_cluster(html)
    if n_seo:
        notes.append(f"stripped inline styles in .tmr-internal-cluster: {n_seo}")

    # 3b. optional: retire the page's own !important war
    if strip_important:
        html, n_imp = strip_important_in_styles(html)
        notes.append(f"stripped !important from inline <style>: {n_imp}")

    # 4. display face
    html, n_font = BARLOW_RE.subn(r"\1Barlow+Condensed\2", html)
    notes.append(f"Barlow -> Barlow Condensed in font links: {n_font}")
    html, n_900 = ensure_bc_900(html)
    notes.append(f"Barlow Condensed weight 900 ensured: {n_900}")
    # A page that loads Inter but no Barlow Condensed would render every display
    # heading in the Inter fallback, which quietly breaks the type hierarchy.
    if "Barlow+Condensed" not in html:
        m2 = re.search(r'(fonts\.googleapis\.com/css2\?family=)(Inter[^"\']*)', html)
        if m2:
            html = html.replace(m2.group(0), m2.group(1) + "Barlow+Condensed:wght@600;700;800;900&family=" + m2.group(2), 1)
            notes.append("added Barlow Condensed to the font request")
        else:
            # No Google-Fonts request at all. Several pages (all 59 /u/ profiles)
            # name 'Inter' and 'Barlow' in CSS but never load either, so they have
            # always rendered in the system fallback. Insert the real request.
            if html.count("</head>") == 1:
                html = html.replace(
                    "</head>",
                    '    <link rel="preconnect" href="https://fonts.googleapis.com">\n'
                    '    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n'
                    '    <link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700;800;900'
                    '&family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">\n</head>',
                    1)
                notes.append("no font request existed - added Barlow Condensed + Inter")
            else:
                notes.append("WARNING: no Google-Fonts link and no unique </head>")

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
    ap.add_argument("--strip-important", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()
    adopt(a.path, a.page_css, dark=a.dark, keep_nav=a.keep_nav,
          strip_important=a.strip_important, dry_run=a.dry_run)
