"""
Point every page at the current hashed asset URLs.

Run after scripts/build_ds_assets.py whenever a shared file changes. Without it a
page keeps referencing the previous hash and silently runs stale CSS/JS — the
exact failure the hashing was introduced to prevent.

Run:  python scripts/build_ds_assets.py && python scripts/repoint_ds_assets.py

BYTE-SAFE (2026-08-06): this used to read/write with pathlib's text helpers, which
on Windows rewrite every LF in the file as CRLF. That turns a one-token repoint
into a whole-file diff on a repo with mixed line endings, and it has bitten this
site before. Everything below is binary I/O, so a file that needed no change keeps
byte-identical content and a file that did shows a one-line diff.

?v= REPOINT (2026-08-06): an asset promoted into build_ds_assets.EXTRA_SOURCES may
still be referenced the old way somewhere, as `<name>.js?v=<stamp>`. Those refs are
collapsed onto the hashed filename too -- in HTML and in the JS loaders that build
script URLs at runtime -- so one asset never ships under two different URLs.
"""
import json
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent
MANIFEST = json.loads((ROOT / "static" / "ds-assets.json").read_text(encoding="utf-8"))

SKIP_DIRS = {".git", "node_modules", "_qa_baseline", "artifacts", "test-results",
             "playwright-report", ".playwright-mcp"}

# Sources whose old `?v=` references must also be collapsed onto the hashed name.
QUERY_REPOINT = {"tmr-profile-hydrate.js"}

# Files that build script URLs in JavaScript rather than in markup.
JS_LOADERS = ("static/js/tmr-ds-nav.js", "static/js/tmr-sitewide.js")

RULES = []
for src, url in MANIFEST.items():
    p = pathlib.Path(src)
    stem, ext = p.stem, p.suffix
    sub = "css" if ext == ".css" else "js"
    # any previous hash for this asset
    RULES.append((re.compile(
        rf"/static/{sub}/{re.escape(stem)}\.[0-9a-f]{{12}}{re.escape(ext)}".encode()), url.encode()))
    if p.name in QUERY_REPOINT:
        # the unhashed name, with or without a ?v= stamp
        RULES.append((re.compile(
            rf"/static/{sub}/{re.escape(stem)}{re.escape(ext)}(\?v=[A-Za-z0-9._-]+)?".encode()), url.encode()))


def targets():
    for path in ROOT.rglob("*.html"):
        if SKIP_DIRS & set(path.parts):
            continue
        yield path
    for rel in JS_LOADERS:
        p = ROOT / rel
        if p.is_file():
            yield p


def main():
    changed = []
    for page in targets():
        raw = page.read_bytes()
        new = raw
        for pat, url in RULES:
            new = pat.sub(url, new)
        if new != raw:
            page.write_bytes(new)
            changed.append(str(page.relative_to(ROOT)).replace("\\", "/"))

    for c in changed:
        print("repointed " + c)
    print(f"{len(changed)} file(s) updated")


if __name__ == "__main__":
    main()
