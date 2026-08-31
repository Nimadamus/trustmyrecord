"""
Targeted rollback of the Concept A dark-theme overlay on INTERNAL pages.

WHAT THIS DOES, per page:
  - deletes the three lines the rollout added:
        <!-- TMR Concept A theme. Additive: ... -->
        <link ... family=Anton&family=Barlow+Condensed ...>
        <link rel="stylesheet" href="/static/css/tmr-theme-a.css?v=...">
  - puts the approved navbar in their place:
        the homepage's own font request (Barlow Condensed 600..900 + Inter)
        <link rel="stylesheet" href="/static/css/tmr-navbar.css?v=1">

WHAT IT NEVER TOUCHES:
  - index.html            the homepage is approved and frozen
  - handicappers/index.html   also approved and frozen
  - anything outside the <head> link block: no markup, no scripts, no page CSS

Byte-safe: binary I/O, so a file's line endings are preserved and a file that
needs no change keeps byte-identical content.

Run:  python scripts/restore_pre_theme.py --list          # show what would change
      python scripts/restore_pre_theme.py --apply         # do it
      python scripts/restore_pre_theme.py --apply a/ b/    # only these paths
"""
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
LOCKED = {"index.html", "handicappers/index.html"}

THEME_LINK = re.compile(rb'[ \t]*<link rel="stylesheet" href="/static/css/tmr-theme-a\.css[^"]*">[ \t]*\r?\n')
ANTON_LINK = re.compile(rb'[ \t]*<link rel="stylesheet" href="https://fonts\.googleapis\.com/css2\?family=Anton[^"]*">[ \t]*\r?\n')
THEME_NOTE = re.compile(rb'[ \t]*<!-- TMR Concept A theme\.[^\n]*-->[ \t]*\r?\n')

NAVBAR_BLOCK = (
    b'<!-- The one approved navbar: the shared header component (tmr-ds-nav.js)\n'
    b'     plus the homepage\'s own navbar rules, so every page renders the same bar. -->\n'
    b'<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700;800;900&family=Inter:wght@400;500;600;700;800;900&display=swap">\n'
    b'<link rel="stylesheet" href="/static/css/tmr-navbar.css?v=1">\n'
)


SKIP_DIRS = {"node_modules", "tests", ".git", ".github", "scripts"}


def pages():
    import os
    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for fn in filenames:
            if not fn.endswith(".html"):
                continue
            p = pathlib.Path(dirpath) / fn
            yield p.relative_to(ROOT).as_posix(), p


def convert(data, nl):
    block = NAVBAR_BLOCK.replace(b"\n", nl) if nl == b"\r\n" else NAVBAR_BLOCK
    had_theme = bool(THEME_LINK.search(data))
    if not had_theme:
        return data, False
    data = THEME_LINK.sub(b"", data, count=1)
    data = ANTON_LINK.sub(b"", data, count=1)
    data = THEME_NOTE.sub(b"", data, count=1)
    if b"tmr-navbar.css" not in data:
        # sit in the same place the theme block occupied: last thing before </head>
        idx = data.lower().rfind(b"</head>")
        if idx == -1:
            return data, True
        data = data[:idx] + block + data[idx:]
    return data, True


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    apply_ = "--apply" in sys.argv
    only = {a.strip("/") + "/index.html" if not a.endswith(".html") else a for a in args} or None
    changed = 0
    for rel, p in pages():
        if rel in LOCKED:
            continue
        if only is not None and rel not in only:
            continue
        raw = p.read_bytes()
        nl = b"\r\n" if raw.count(b"\r\n") > raw.count(b"\n") // 2 else b"\n"
        out, hit = convert(raw, nl)
        if not hit or out == raw:
            continue
        changed += 1
        if apply_:
            p.write_bytes(out)
        else:
            print(rel)
    print(("applied to " if apply_ else "would change ") + str(changed) + " page(s)")


if __name__ == "__main__":
    main()
