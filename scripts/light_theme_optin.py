#!/usr/bin/env python3
"""
Opts a page into the light workspace.

  - adds `tmr-light` to <body class> (creating the attribute if absent)
  - adds a single <link> to the shared static/css/tmr-light.css, last in <head>
    so it wins load order against the legacy shell sheet it overrides

Reverting a page is deleting one class and one link. Nothing else in the
document is touched -- no markup, no scripts, no URLs, no metadata.

  python scripts/light_theme_optin.py [--undark] <files...>

--undark additionally drops `tmr-ds--dark` from design-system pages, which is
all a tmr-ds page needs to render light: the same tokens, reassigned.
"""
from __future__ import annotations

import argparse
import io
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LINK = '<link rel="stylesheet" href="/static/css/tmr-light.css">'

BODY_RE = re.compile(r"(?is)<body\b([^>]*)>")
CLASS_RE = re.compile(r"""(?is)\bclass\s*=\s*(['"])(.*?)\1""")


def add_body_class(html: str, cls: str) -> tuple[str, bool]:
    m = BODY_RE.search(html)
    if not m:
        return html, False
    attrs = m.group(1)
    cm = CLASS_RE.search(attrs)
    if cm:
        names = cm.group(2).split()
        if cls in names:
            return html, False
        names.append(cls)
        new_attrs = attrs[:cm.start()] + f'class={cm.group(1)}{" ".join(names)}{cm.group(1)}' + attrs[cm.end():]
    else:
        new_attrs = attrs.rstrip() + f' class="{cls}"'
    return html[:m.start()] + f"<body{new_attrs}>" + html[m.end():], True


def drop_body_class(html: str, cls: str) -> tuple[str, bool]:
    m = BODY_RE.search(html)
    if not m:
        return html, False
    attrs = m.group(1)
    cm = CLASS_RE.search(attrs)
    if not cm:
        return html, False
    names = cm.group(2).split()
    if cls not in names:
        return html, False
    names = [n for n in names if n != cls]
    new_attrs = attrs[:cm.start()] + f'class={cm.group(1)}{" ".join(names)}{cm.group(1)}' + attrs[cm.end():]
    return html[:m.start()] + f"<body{new_attrs}>" + html[m.end():], True


HEAD_END = re.compile(r"(?i)</head>")


def add_link(html: str) -> tuple[str, bool]:
    if "/static/css/tmr-light.css" in html:
        return html, False
    m = HEAD_END.search(html)
    if not m:
        return html, False
    # match the indentation of the last existing stylesheet link
    indent = "    "
    prev = re.findall(r"(?im)^([ \t]*)<link[^>]*rel=\"stylesheet\"", html[:m.start()])
    if prev:
        indent = prev[-1]
    return html[:m.start()] + f"{indent}{LINK}\n" + html[m.start():], True


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("files", nargs="+")
    ap.add_argument("--undark", action="store_true",
                    help="also drop tmr-ds--dark (design-system pages)")
    ap.add_argument("--no-link", action="store_true",
                    help="body class only (design-system pages need no extra sheet)")
    args = ap.parse_args()

    for rel in args.files:
        path = os.path.join(ROOT, rel.replace("/", os.sep))
        with io.open(path, "r", encoding="utf-8", newline="") as fh:
            src = fh.read()
        out = src
        notes = []
        if args.undark:
            out, ok = drop_body_class(out, "tmr-ds--dark")
            if ok:
                notes.append("-tmr-ds--dark")
        if not args.no_link:
            out, ok = add_body_class(out, "tmr-light")
            if ok:
                notes.append("+tmr-light")
            out, ok = add_link(out)
            if ok:
                notes.append("+link")
        if out != src:
            with io.open(path, "w", encoding="utf-8", newline="") as fh:
                fh.write(out)
        print(f"{'  '.join(notes) or 'no change':28s} {rel}")


if __name__ == "__main__":
    sys.exit(main())
