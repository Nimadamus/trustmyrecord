"""
Put the ONE shared navbar on the pages that were still building their own.

tmr-sitewide.js injects a second, differently styled bar (nav.tmr-global-nav) on
the 143 pages that never loaded the design-system header. Those pages get the
shared component instead:

  - body gains `tmr-ds-shell`, the chrome-only shell class the DS sheet scopes
    its .ds-* rules to (it does not restyle page content)
  - tmr-ds.<hash>.css is linked before tmr-light.css so page styling still wins
  - tmr-session.js + tmr-ds-nav.<hash>.js are added before </body>

tmr-sitewide.js then sees the shared nav and stands its own bar down, so each
page ends with exactly one navigation.

Never touched: index.html, handicappers/index.html, today/index.html.

Byte-safe binary I/O. Run:
    python scripts/adopt_shared_navbar.py           # list
    python scripts/adopt_shared_navbar.py --apply
"""
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
LOCKED = {"index.html", "handicappers/index.html", "today/index.html"}
SKIP_DIRS = {"node_modules", "tests", ".git", ".github", "scripts"}
MAN = json.loads((ROOT / "static" / "ds-assets.json").read_text())
DS_CSS = MAN["static/css/tmr-ds.css"]
NAV_JS = MAN["static/js/tmr-ds-nav.js"]
SESSION_JS = "/static/js/tmr-session.63f50f4d0988.js"


def pages():
    import os
    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for fn in filenames:
            if fn.endswith(".html"):
                p = pathlib.Path(dirpath) / fn
                yield p.relative_to(ROOT).as_posix(), p


def main():
    apply_ = "--apply" in sys.argv
    n = 0
    for rel, p in pages():
        if rel in LOCKED:
            continue
        raw = p.read_bytes()
        if b"tmr-sitewide.js" not in raw:
            continue
        if b"tmr-ds-nav." in raw and b'src="/static/js/tmr-ds-nav.' in raw:
            continue
        text = raw.decode("utf-8", "replace")
        nl = "\r\n" if raw.count(b"\r\n") > raw.count(b"\n") // 2 else "\n"

        new, hit = re.subn(r'(<body class="[^"]*?)tmr-site-shell', r"\1tmr-site-shell tmr-ds-shell", text, count=1)
        if not hit:
            new, hit = re.subn(r"<body(\s|>)", r'<body class="tmr-ds-shell"\1', text, count=1)
            if not hit:
                continue
        text = new

        css_tag = '<link rel="stylesheet" href="' + DS_CSS + '">'
        if "tmr-ds.css" not in text and DS_CSS not in text:
            if '<link rel="stylesheet" href="/static/css/tmr-light.css' in text:
                text = text.replace('<link rel="stylesheet" href="/static/css/tmr-light.css',
                                    css_tag + nl + '<link rel="stylesheet" href="/static/css/tmr-light.css', 1)
            else:
                i = text.lower().rfind("</head>")
                if i == -1:
                    continue
                text = text[:i] + css_tag + nl + text[i:]

        scripts = '<script src="' + SESSION_JS + '"></script><script src="' + NAV_JS + '"></script>'
        i = text.lower().rfind("</body>")
        if i == -1:
            continue
        text = text[:i] + scripts + nl + text[i:]

        n += 1
        if apply_:
            p.write_bytes(text.encode("utf-8"))
        else:
            print(rel)
    print(("adopted on " if apply_ else "would adopt on ") + str(n) + " page(s)")


if __name__ == "__main__":
    main()
