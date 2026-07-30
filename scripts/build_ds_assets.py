"""
Publish the design-system assets under content-hashed filenames.

WHY: the CDN in front of this site caches by path and ignores the query string,
so `?v=` cache-busting is a no-op — a changed stylesheet keeps serving its old
bytes indefinitely, and a page can end up running new HTML against old CSS. The
homepage already solved this by content-hashing its JS. Same fix here.

Sources of truth (edit these):
    static/css/tmr-ds.css
    static/css/tmr-ds-handicappers.css
    static/js/tmr-ds-nav.js

This script writes `<name>.<sha256[:12]>.<ext>` copies alongside them and prints
the mapping. Pages reference ONLY the hashed filenames, so a content change
always produces a new URL the CDN has never seen.

Run:  python scripts/build_ds_assets.py
"""
import hashlib
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
MANIFEST = ROOT / "static" / "ds-assets.json"


def sources():
    """Every unhashed tmr-ds* source, discovered rather than listed, so adding a
    page's adoption layer needs no edit here. A hashed build has three
    dot-separated parts (name.hash.ext) and is skipped."""
    found = []
    for d, ext in ((ROOT / "static" / "css", ".css"), (ROOT / "static" / "js", ".js")):
        for p in sorted(d.glob(f"tmr-ds*{ext}")):
            if len(p.name.split(".")) == 2:
                found.append(p)
    return found


def main():
    mapping = {}
    for src in sources():
        raw = src.read_bytes()
        digest = hashlib.sha256(raw).hexdigest()[:12]
        hashed = src.with_name(f"{src.stem}.{digest}{src.suffix}")
        # Older hashed builds are KEPT (matching build_home_critical.py): a
        # document cached in a returning visitor's browser still references
        # the hash it was built with, and pruning it turns the whole nav/data
        # layer into a 404 for that visitor. Immutable files are cheap; a
        # broken cached page is not.
        hashed.write_bytes(raw)
        key = str(src.relative_to(ROOT)).replace("\\", "/")
        mapping[key] = "/" + str(hashed.relative_to(ROOT)).replace("\\", "/")
        print(f"{key}  ->  {mapping[key]}")

    MANIFEST.write_text(json.dumps(mapping, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {MANIFEST.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
