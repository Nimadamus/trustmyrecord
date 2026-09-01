#!/usr/bin/env python3
"""LIVE_CHAT_20260901: put the live chat widget on every real site page.

Idempotent. Run it again after editing static/js/tmr-live-chat.js and it only
rewrites the version query so browsers pick the new file up.

    python scripts/add_live_chat_widget.py            # write
    python scripts/add_live_chat_widget.py --dry-run  # report only

A page qualifies when it carries the shared navbar (tmr-ds-nav), which is what
separates a real site page from a fragment, a template or a build artifact.
The admin console is skipped: staff answer from the inbox, not the widget.
"""

import argparse
import hashlib
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
ASSET = ROOT / "static" / "js" / "tmr-live-chat.js"
MARKER = "tmr-live-chat.js"
NAVBAR_MARKER = "tmr-ds-nav"

SKIP_DIRS = {"node_modules", ".git", "admin", "scripts", "tests", "archive"}

TAG_RE = re.compile(r'[ \t]*<script src="/static/js/tmr-live-chat\.js\?v=[^"]*"></script>\r?\n?')
BODY_RE = re.compile(r"</body>", re.IGNORECASE)


def asset_version() -> str:
    digest = hashlib.sha256(ASSET.read_bytes()).hexdigest()
    return digest[:12]


def qualifies(path: pathlib.Path) -> bool:
    parts = set(path.relative_to(ROOT).parts)
    if parts & SKIP_DIRS:
        return False
    return True


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    if not ASSET.exists():
        print("missing " + str(ASSET), file=sys.stderr)
        return 1

    tag = '<script src="/static/js/tmr-live-chat.js?v=%s"></script>' % asset_version()
    added = 0
    updated = 0
    skipped = 0

    for path in sorted(ROOT.rglob("*.html")):
        if not qualifies(path):
            continue
        # newline="" both ways: the repo mixes CRLF and LF, and letting Python
        # translate line endings rewrites every line of every page it touches.
        with open(path, "r", encoding="utf-8", errors="ignore", newline="") as handle:
            text = handle.read()
        if NAVBAR_MARKER not in text:
            skipped += 1
            continue
        if not BODY_RE.search(text):
            skipped += 1
            continue

        if MARKER in text:
            new_text = TAG_RE.sub("", text)
            if new_text == text:
                # Present but in a shape this script did not write. Leave it be
                # rather than guess at a hand edit.
                skipped += 1
                continue
            was_present = True
        else:
            new_text = text
            was_present = False

        eol = "\r\n" if "\r\n" in text else "\n"
        new_text = BODY_RE.sub("    " + tag + eol + "</body>", new_text, count=1)
        if new_text == text:
            skipped += 1
            continue

        if not args.dry_run:
            with open(path, "w", encoding="utf-8", newline="") as handle:
                handle.write(new_text)
        if was_present:
            updated += 1
        else:
            added += 1

    verb = "would change" if args.dry_run else "changed"
    print("%s: added %d, updated %d, skipped %d" % (verb, added, updated, skipped))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
