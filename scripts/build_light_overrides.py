#!/usr/bin/env python3
"""
Generates the auto-derived half of static/css/tmr-light.css.

The legacy shell sheets (tmr-sitewide.css, tmr-page-polish.css, arena-suite.css)
are shared by ~140 pages and hardcode a dark palette. Rather than fork them per
page -- or edit them in place and drag the pages that are SUPPOSED to stay dark
(sportsbook, the simulators) into the light with them -- this lifts only the
rules that actually paint a colour, remaps those colours onto the light palette
with scripts/light_theme_transform.py, and re-scopes them to `body.tmr-light`.

Load order does the rest: tmr-light.css ships after the sheet it overrides, and
`body.tmr-light` matches `body.tmr-site-shell` specificity exactly, so a page
opts in with one class and opts out by removing it.

Chrome that must STAY dark (the global nav, the global footer, their menus) is
excluded by selector, not by colour, so it cannot drift back in later.

  python scripts/build_light_overrides.py > static/css/_light-auto.css
"""
from __future__ import annotations

import io
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from light_theme_transform import CLIP_TEXT, rewrite_declarations  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# (file, selector rewrite). The legacy sheets scope themselves on a BODY class,
# written inconsistently as `body.tmr-site-shell x`, `.tmr-site-shell x` and
# `html body.tmr-site-shell x` -- all three have to be recognised or the rule is
# re-emitted as a descendant selector that can never match (the body IS the
# scoping element), which is exactly how the first pass left every h1 white.
SOURCES = [
    ("static/css/tmr-sitewide.css",
     re.compile(r"(?:\bbody)?\.tmr-site-shell\b"), "body.tmr-light"),
    ("static/css/tmr-page-polish.css",
     re.compile(r"(?:\bbody)?\.tmr-polished-page\b"), "body.tmr-light"),
    ("static/css/arena-suite.css",
     re.compile(r"(?:\bbody)?\.arena-page\b"), "body.tmr-light.arena-page"),
    # /betlegend-pro/ (the marketing page) shares this sheet with
    # /betlegend-pro/app/, which stays dark as a product surface. Deriving
    # rather than editing is what lets the two diverge.
    ("static/css/blp-pro.css",
     re.compile(r"(?:\bbody)?\.blp-page\b"), "body.tmr-light"),
    # Scoped on a bare `body`, and shared by /profile/ (light now), /forum/
    # (already light, never opted in) and /sportsbook/ (stays dark). Deriving is
    # the only way to move one of the three. /u/<name>/ renders THROUGH the
    # profile document, so this covers all 89 baked profile routes too.
    ("static/css/tmr-redesign-overrides.css",
     re.compile(r"(?!x)x"), "body.tmr-light"),
]

# Selectors whose colour must not be touched: the dark navy chrome is the part
# of the design we are keeping.
KEEP_DARK = re.compile(
    # the navy chrome itself ...
    r"tmr-global-nav|tmr-global-footer|tmr-community-menu|tmr-support-menu|"
    r"tmr-account-menu|tmr-nav|ds-nav|ds-footer|tmrlh-footer|tmr-ticker|"
    # ... everything that hangs off it (menus, chips, search and account modals
    # all render ON the navy bar, so lightening them would put white on white) ...
    r"tmr-user-menu|tmr-user-chip|tmr-search-|tmr-member-search|tmr-account-modal|"
    r"tmr-premium-avatar|tmr-notif|"
    # ... and the opt-in dark bands the light pages keep for contrast.
    r"tmr-dark|tmr-hero-dark|scrollbar",
    re.I,
)

COLOR_DECL = re.compile(
    r"(?:^|[;{])\s*(background[a-z-]*|color|border[a-z-]*|outline[a-z-]*|fill|stroke|"
    r"box-shadow|text-shadow|-webkit-text-fill-color)\s*:", re.I | re.M
)

HAS_COLOR_VALUE = re.compile(r"#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(", re.I)


def split_rules(css: str):
    """Yield (selector, body) for top-level rules, recursing into @media."""
    i, n = 0, len(css)
    depth = 0
    buf = []
    while i < n:
        ch = css[i]
        if ch == "/" and css[i:i + 2] == "/*":
            j = css.find("*/", i)
            i = n if j < 0 else j + 2
            continue
        buf.append(ch)
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                chunk = "".join(buf).strip()
                buf = []
                yield chunk
        i += 1


AT_RULE = re.compile(r"^\s*@(media|supports)([^{]*)\{(.*)\}\s*$", re.S)


def rescope(one: str, scope_re, repl: str) -> str:
    """Point a legacy-shell selector at `body.tmr-light` instead."""
    # A legacy sheet's own token block. `body.tmr-light :root` matches nothing,
    # which is how tmr-page-polish.css kept painting .tmr-glass a dark card on
    # an otherwise converted page -- its palette lives on :root as --tmrp-*.
    if one in (":root", "html", ":root, html", "html, :root"):
        return "body.tmr-light"
    if scope_re.search(one):
        return scope_re.sub(repl, one, count=1)
    if one.startswith("html body"):
        return "html body.tmr-light" + one[len("html body"):]
    if one == "body" or one.startswith("body.") or one.startswith("body "):
        return "body.tmr-light" + one[4:]
    return "body.tmr-light " + one


def process(chunk: str, scope, out: list[str], repl: str = "body.tmr-light"):
    m = AT_RULE.match(chunk)
    if m:
        inner: list[str] = []
        for sub in split_rules(m.group(3)):
            process(sub, scope, inner, repl)
        if inner:
            out.append(f"@{m.group(1)}{m.group(2)}{{\n" + "\n".join(inner) + "\n}")
        return

    if "{" not in chunk:
        return
    sel, _, body = chunk.partition("{")
    body = body.rstrip().rstrip("}")
    sel = " ".join(sel.split())
    if sel.startswith("@"):
        return
    if KEEP_DARK.search(sel):
        return
    # Keep only the colour-bearing declarations: geometry stays with the source
    # sheet so this file can never silently re-lay-out a page.
    #
    # Custom properties count. A block that is ONLY custom properties is a
    # palette -- tmr-page-polish.css keeps its whole dark ramp in one such
    # `:root` -- and skipping those is what left .tmr-glass a dark card on an
    # otherwise converted page.
    decls = []
    for d in body.split(";"):
        if not d.strip():
            continue
        prop = d.split(":", 1)[0].strip().lower()
        if not HAS_COLOR_VALUE.search(d):
            continue
        if prop.startswith("--") or COLOR_DECL.search(";" + d + ":"):
            decls.append(d.strip())
    if not decls:
        return

    new_body, changed = rewrite_declarations(";".join(decls) + ";",
                                             clip_text=bool(CLIP_TEXT.search(body)))
    if not changed:
        return

    parts = []
    for one in sel.split(","):
        one = one.strip()
        if one:
            parts.append(rescope(one, scope, repl))
    out.append(",".join(parts) + "{" + new_body + "}")


BASE = "static/css/tmr-light-base.css"
TARGET = "static/css/tmr-light.css"

BANNER = """/* =============================================================================
   GENERATED FILE — DO NOT EDIT.
   Rebuild with:  python scripts/build_light_overrides.py
   Source of truth: static/css/tmr-light-base.css  (hand written, edit that)
                  + colour-only overrides derived from the legacy shell sheets.
   ============================================================================= */
"""


def main():
    with io.open(os.path.join(ROOT, BASE.replace("/", os.sep)), "r",
                 encoding="utf-8", newline="") as fh:
        base = fh.read()

    chunks: list[str] = []
    for rel, scope, repl in SOURCES:
        path = os.path.join(ROOT, rel.replace("/", os.sep))
        with io.open(path, "r", encoding="utf-8", newline="") as fh:
            css = fh.read()
        out: list[str] = []
        for chunk in split_rules(css):
            process(chunk, scope, out, repl)
        chunks.append(f"/* ---- derived from {rel} ---- */\n" + "\n".join(out))

    # Derived rules first, hand-written base LAST: the base file is the design
    # decision (one navy, one radius, two shadows) and has to be able to beat a
    # rule it was derived from at equal specificity.
    body = BANNER + "\n" + "\n\n".join(chunks) + "\n\n" + base + "\n"
    out_path = os.path.join(ROOT, TARGET.replace("/", os.sep))
    with io.open(out_path, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(body)
    sys.stderr.write(f"wrote {TARGET} ({len(body)} bytes)\n")


if __name__ == "__main__":
    main()
