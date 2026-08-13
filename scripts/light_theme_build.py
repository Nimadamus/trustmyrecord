#!/usr/bin/env python3
"""
The whole light-workspace rollout, in the order it has to run.

Kept as one entry point because the order matters and two of the steps are not
idempotent: light_theme_transform.py maps a colour onto the light ramp, and
running it twice on the same file keeps mapping the already-mapped value (a
2% ink wash decays to 0.2%). So the transform must only ever see pristine
input. `--reset <commit>` restores the content files first and is the supported
way to re-run.

  python scripts/light_theme_build.py                    # build from current tree
  python scripts/light_theme_build.py --reset e4d320f2   # restore, then build

Steps:
  1. transform the shell pages' own <style> and opt them in
  2. drop tmr-ds--dark from the design-system pages and transform their styles
  3. transform the page-dedicated stylesheets and the one JS-injected stylesheet
  4. apply the page-specific fixes no rule can infer  (idempotent)
  5. regenerate static/css/tmr-light.css
  6. restamp every /static/ ?v= tag so the edge serves the new bytes
"""
from __future__ import annotations

import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PY = sys.executable

# Stylesheets used ONLY by pages being converted, so they can be edited in
# place. Anything shared with a page that stays dark is derived into
# tmr-light.css instead -- see scripts/build_light_overrides.py.
DEDICATED = [
    "static/css/tmr-gamefile.css",   # /matchups/, /matchup-of-the-day/, /about/research/
    "static/css/tmr-article.css",    # the Game File articles
    "static/js/tmr-fan-identity.js",  # builds the profile's Sports Identity card
]


def run(args: list[str], capture: bool = False) -> str:
    r = subprocess.run(args, cwd=ROOT, text=True,
                       stdout=subprocess.PIPE if capture else None)
    if r.returncode != 0 and not capture:
        raise SystemExit(f"step failed: {' '.join(args)}")
    return r.stdout or ""


def lines(out: str) -> list[str]:
    return [l.strip() for l in out.splitlines() if l.strip()]


def main() -> int:
    if "--reset" in sys.argv:
        base = sys.argv[sys.argv.index("--reset") + 1]
        print(f"== restoring content files from {base}")
        run(["git", "checkout", base, "--", "."])

    targets = os.path.join("scripts", "light_theme_targets.py")
    shell = lines(run([PY, targets, "--shell"], capture=True))
    ds = lines(run([PY, targets, "--ds-dark"], capture=True))
    print(f"== {len(shell)} shell pages, {len(ds)} design-system pages")

    tr = os.path.join("scripts", "light_theme_transform.py")
    optin = os.path.join("scripts", "light_theme_optin.py")

    run([PY, tr, "--apply"] + shell, capture=True)
    run([PY, optin] + shell, capture=True)
    if ds:
        run([PY, optin, "--undark", "--no-link"] + ds, capture=True)
        run([PY, tr, "--apply"] + ds, capture=True)
    run([PY, tr, "--apply"] + DEDICATED, capture=True)

    print("== page fixes")
    run([PY, os.path.join("scripts", "light_theme_page_fixes.py")])
    print("== generating tmr-light.css")
    run([PY, os.path.join("scripts", "build_light_overrides.py")])
    print("== restamping asset versions")
    run([PY, os.path.join("scripts", "version_static_refs.py")], capture=True)
    print("done")
    return 0


if __name__ == "__main__":
    sys.exit(main())
