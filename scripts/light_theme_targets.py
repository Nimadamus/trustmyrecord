#!/usr/bin/env python3
"""The page list for the light-workspace rollout.

Two groups, because the two kinds of dark page need opposite amounts of work:

  DS_DARK    already on the design system, just running its dark surface mode.
             Flipping them is deleting `tmr-ds--dark` -- same tokens, light
             assignments. No stylesheet, no colour rewriting.

  SHELL      the legacy pages on tmr-sitewide.css with their own hardcoded
             palette. These need the class, the shared sheet, and a remap of the
             colours they hardcode in their own <style>.

HELD BACK ON PURPOSE (each is dark for a reason, not by neglect):
  /sportsbook/                 data-dense board; the design system's hybrid
                               surface model puts tools on the navy ramp
  /mlb-simulator/, /nfl-simulator/, /mlb-simulator/season|simulations
                               same -- these are tools, not content
  /betlegend-pro/app/          a separate product surface with its own system
  admin/**                     internal, not public-facing
  approved/**, preview/**      frozen design baselines
  static/og-card.html          an image template, not a page

  python scripts/light_theme_targets.py            # print both groups
  python scripts/light_theme_targets.py --shell    # one path per line
  python scripts/light_theme_targets.py --ds-dark
"""
from __future__ import annotations

import io
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

EXCLUDE = re.compile(
    r"^(tests/|docs/|static/prerender/|static/og-card\.html|u/|forum/thread/|"
    r"admin/|marketplace/admin/|contests/justbet-mlb/admin/|approved/|preview/|"
    r"sportsbook/|betlegend-pro/app/|mlb-simulator/|nfl-simulator/|"
    # already light -- the forum redesign got there first; leave it alone
    r"forum/index\.html$|usercp/index\.html$)"
)

# Data-dense tools that stay on the navy ramp even though they are tmr-ds--dark.
DS_DARK_KEEP = re.compile(r"^(mlb-simulator/|sportsbook/)")

# Public pages that are dark but carry NO shared sheet at all -- written
# standalone, so the tmr-sitewide.css test never sees them. Found by rendering
# every route and measuring, not by reading the markup.
EXTRA_SHELL = ["activation/index.html"]


def git_html_files() -> list[str]:
    out = subprocess.check_output(["git", "ls-files", "*.html"], cwd=ROOT)
    return out.decode("utf-8").splitlines()


def classify():
    shell, ds_dark = [], []
    for rel in git_html_files():
        if EXCLUDE.search(rel):
            continue
        path = os.path.join(ROOT, rel.replace("/", os.sep))
        try:
            with io.open(path, "r", encoding="utf-8", newline="") as fh:
                html = fh.read()
        except (OSError, UnicodeDecodeError):
            continue
        m = re.search(r"(?is)<body[^>]*\bclass\s*=\s*['\"]([^'\"]*)['\"]", html)
        cls = m.group(1) if m else ""
        if "tmr-ds--dark" in cls:
            if not DS_DARK_KEEP.search(rel):
                ds_dark.append(rel)
            continue
        if "tmr-sitewide.css" in html or rel in EXTRA_SHELL:
            shell.append(rel)
    return sorted(shell), sorted(ds_dark)


def main():
    shell, ds_dark = classify()
    arg = sys.argv[1] if len(sys.argv) > 1 else ""
    if arg == "--shell":
        print("\n".join(shell))
    elif arg == "--ds-dark":
        print("\n".join(ds_dark))
    else:
        print(f"# SHELL ({len(shell)})")
        print("\n".join("  " + p for p in shell))
        print(f"# DS_DARK ({len(ds_dark)})")
        print("\n".join("  " + p for p in ds_dark))


if __name__ == "__main__":
    main()
