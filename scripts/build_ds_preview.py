"""
Stage a design-system version of a page at /preview/<name>/ without touching it.

Same enumerated edits as scripts/adopt_design_system.py, but written to a preview
path so production is untouched until the design is approved. Used for pages
whose current design was recently signed off and therefore should not be replaced
without a fresh look.

Usage:
    python scripts/build_ds_preview.py polls/index.html preview/polls/index.html \
        --page-css tmr-ds-polls.css [--strip-important] [--dark]
"""
import argparse
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from adopt_design_system import adopt, ROOT  # noqa: E402


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("src")
    ap.add_argument("out")
    ap.add_argument("--page-css", required=True)
    ap.add_argument("--dark", action="store_true")
    ap.add_argument("--strip-important", action="store_true")
    a = ap.parse_args()

    src = ROOT / a.src
    out = ROOT / a.out
    out.parent.mkdir(parents=True, exist_ok=True)
    # copy first, then run the normal adoption against the copy, so the preview
    # and a later real cutover are byte-identical transformations
    out.write_text(src.read_text(encoding="utf-8"), encoding="utf-8")
    adopt(a.out, a.page_css, dark=a.dark, strip_important=a.strip_important)
    print(f"staged {a.out} (source {a.src} untouched)")


if __name__ == "__main__":
    main()
