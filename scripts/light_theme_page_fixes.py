#!/usr/bin/env python3
"""
The handful of colours the automatic remap cannot get right, fixed by hand.

Each of these is a case where the ROLE of a colour is not recoverable from the
declaration it sits in, so no rule the transform could learn would fix it:

  * a badge painting a solid semantic colour and relying on black ink
  * a disabled button whose background and its text both resolve to --text-muted
  * colour literals inside JavaScript string templates, which the transform
    deliberately never touches

Kept as a script rather than as edits-in-place so that re-running the pipeline
from a clean checkout reproduces the finished state exactly. Every replacement
is asserted: if a source file changes shape, this fails loudly instead of
silently skipping.

  python scripts/light_theme_page_fixes.py          # apply
  python scripts/light_theme_page_fixes.py --check  # exit 1 if not applied
"""
from __future__ import annotations

import io
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

FIXES = [
    # Each fix carries its SELECTOR. Two rules on /premium/ share the exact
    # same two declarations, and an unanchored pattern hit the wrong one.

    # /premium/ -- "Save 17%" was black ink on solid --neon-green, which the
    # remap turns into #0A8B4E: dark on dark. It becomes a soft green chip.
    ("premium/index.html",
     ".save-badge {\n            background: var(--neon-green);\n            color: #000;",
     ".save-badge {\n            background: #DFF3E8;\n            color: #0A8B4E;"),

    # /premium/ -- the primary CTA was a gold-to-cyan gradient carrying black
    # ink. On a light page that reads as a washed-out band; the design of
    # record says a primary action is solid teal with white ink.
    ("premium/index.html",
     ".upgrade-btn.primary {\n            background: linear-gradient(45deg, var(--neon-gold), var(--neon-cyan));\n            color: #000;",
     ".upgrade-btn.primary {\n            background: var(--primary);\n            color: #FFFFFF;"),

    # /premium/ -- background AND colour both resolved to --text-muted, so the
    # disabled button rendered its label in its own background colour.
    ("premium/index.html",
     ".upgrade-btn:disabled {\n            background: var(--text-muted);\n            cursor: not-allowed;",
     ".upgrade-btn:disabled {\n            background: #E6EDF5;\n            border: 1px solid #D2DEEA;\n            cursor: not-allowed;"),

    # /contests/justbet-mlb/ -- entrant names are built in a JS template with a
    # pale-gold literal, chosen for the old dark table.
    ("contests/justbet-mlb/index.html",
     'style="color:#fff5d8; font-weight:700;"',
     'style="color:#07182A; font-weight:700;"'),

    # The JustBet promo widget writes the invite code the same way.
    ("static/js/justbet-promo.js",
     '<strong style="color:#ffd766;letter-spacing:0.06em;">',
     '<strong style="color:#B98505;letter-spacing:0.06em;">'),

    # Shared breadcrumb chip, on ~210 pages. `.tmrlh-home.tmrlh-a` sets
    # #1a1204 on the gold chip and its own comment reports the result as
    # 4.93:1 -- but `.tmrlh-crumbs a.tmrlh-a { color: var(--tmrlh-link) }` two
    # rules above is (0,2,1) against its (0,2,0), so the chip has always
    # rendered in the page link colour instead: 1.9:1, blue on gold. Restated
    # here at (0,3,1) so the intended value actually lands, on the inner span
    # too. Pre-existing -- it read the same on the dark site.
    ("static/css/tmr-linkhub.css",
     "/* The mark is a fixed 22px square",
     ".tmrlh-crumbs a.tmrlh-home.tmrlh-a,\n"
     ".tmrlh-crumbs a.tmrlh-home.tmrlh-a span:not(.tmrlh-home-mark) {\n"
     "    color: #1a1204 !important;\n}\n\n"
     "/* The mark is a fixed 22px square"),
]


def as_pattern(literal: str) -> re.Pattern:
    """Match a literal across either line ending.

    core.autocrlf=true means these files are CRLF on disk while the patterns
    here are written LF. Matching bytes exactly makes every multi-line fix
    silently "not found" on Windows.
    """
    return re.compile(re.escape(literal).replace("\\\n", "\r?\n"))


def main() -> int:
    check = "--check" in sys.argv
    missing = 0
    for rel, old, new in FIXES:
        path = os.path.join(ROOT, rel.replace("/", os.sep))
        with io.open(path, "r", encoding="utf-8", newline="") as fh:
            src = fh.read()
        old_re, new_re = as_pattern(old), as_pattern(new)
        # `new` decides done-ness, not the absence of `old`. Some fixes INSERT
        # ahead of an anchor and deliberately keep it, so testing for `old` would
        # re-apply them on every run and duplicate the rule.
        if new_re.search(src):
            print(f"ok       {rel}: already applied")
            continue
        if not old_re.search(src):
            print(f"MISSING  {rel}: pattern not found -- source changed shape")
            missing += 1
            continue
        if check:
            print(f"PENDING  {rel}")
            missing += 1
            continue
        eol = "\r\n" if "\r\n" in src else "\n"
        with io.open(path, "w", encoding="utf-8", newline="") as fh:
            fh.write(old_re.sub(new.replace("\n", eol).replace("\\", "\\\\"), src, count=1))
        print(f"applied  {rel}")
    return 1 if missing else 0


if __name__ == "__main__":
    sys.exit(main())
