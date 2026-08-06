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


# Non-tmr-ds assets that must also be content-hashed.
#
# BOOT_20260806: tmr-profile-hydrate.js is already referenced by hashed filename
# from build_profile_pages.py, but that hash was a hard-coded literal -- so
# editing the file changed nothing on the live site until somebody remembered to
# retype 12 hex characters, and version_static_refs.py deliberately skips
# already-hashed names, so nothing caught it. Hashing it here makes the bake read
# the current hash from the manifest instead.
#
# Everything referenced as `<name>.js?v=<hash>` is NOT listed here: those are
# re-pinned repo-wide on every push by .github/workflows/static-asset-versions.yml
# (scripts/version_static_refs.py), which is the maintained mechanism for them.
# Moving a file onto a hashed filename removes it from that automation, so only
# do it for assets whose references are generated, like this one.
EXTRA_SOURCES = (
    "static/js/tmr-profile-hydrate.js",
)


def sources():
    """Every unhashed tmr-ds* source, discovered rather than listed, so adding a
    page's adoption layer needs no edit here. A hashed build has three
    dot-separated parts (name.hash.ext) and is skipped. EXTRA_SOURCES are then
    appended by name."""
    found = []
    for d, ext in ((ROOT / "static" / "css", ".css"), (ROOT / "static" / "js", ".js")):
        for p in sorted(d.glob(f"tmr-ds*{ext}")):
            if len(p.name.split(".")) == 2:
                found.append(p)
    for rel in EXTRA_SOURCES:
        p = ROOT / rel
        if p.is_file() and p not in found:
            found.append(p)
    return found


def main(only=()):
    """Rebuild every discovered asset, or just the ones named on the command line.

    The selective form exists because the manifest is a shared file: at the time
    this was added, nine CSS entries on main were already pointing at hashes that
    no longer matched their sources, so a full rebuild silently bundled nine
    unrelated live stylesheet swaps into whatever change you were actually making.
    Naming your assets keeps a change to the assets you touched; the drift is real
    and still worth fixing, but on its own commit.  (2026-08-06)

        python scripts/build_ds_assets.py                       # everything
        python scripts/build_ds_assets.py static/js/tmr-ds-nav.js   # just this
    """
    only = {o.replace("\\", "/") for o in only}
    mapping = {}
    if MANIFEST.exists():
        mapping.update(json.loads(MANIFEST.read_text(encoding="utf-8")))

    for src in sources():
        key = str(src.relative_to(ROOT)).replace("\\", "/")
        if only and key not in only:
            continue
        raw = src.read_bytes()
        digest = hashlib.sha256(raw).hexdigest()[:12]
        hashed = src.with_name(f"{src.stem}.{digest}{src.suffix}")
        # Older hashed builds are KEPT (matching build_home_critical.py): a
        # document cached in a returning visitor's browser still references
        # the hash it was built with, and pruning it turns the whole nav/data
        # layer into a 404 for that visitor. Immutable files are cheap; a
        # broken cached page is not.
        # The target's name IS sha256(raw), so by construction it must contain
        # exactly `raw`. Write when it is missing or when it does not -- that is
        # always a correction, never churn. Skipping an identical file matters:
        # an unconditional write flipped line endings on copies that CI had
        # committed as LF from a source that is CRLF in a Windows checkout, which
        # rewrote live stylesheets end to end for no content change. (2026-08-06)
        if not hashed.exists() or hashed.read_bytes() != raw:
            hashed.write_bytes(raw)
        mapping[key] = "/" + str(hashed.relative_to(ROOT)).replace("\\", "/")
        print(f"{key}  ->  {mapping[key]}")

    # Binary write, preserving whatever newline the manifest already uses:
    # pathlib's write_text rewrites every newline as CRLF on Windows and LF on
    # Linux, so the same no-op run produced a whole-file diff depending on who ran
    # it. Keep the existing convention and only the changed lines move.
    body = (json.dumps(mapping, indent=2) + "\n").encode("utf-8")
    if MANIFEST.exists() and b"\r\n" in MANIFEST.read_bytes():
        body = body.replace(b"\n", b"\r\n")
    MANIFEST.write_bytes(body)
    print(f"wrote {MANIFEST.relative_to(ROOT)}")


if __name__ == "__main__":
    import sys
    main(sys.argv[1:])
