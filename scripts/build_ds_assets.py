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
import re
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

# ASSETS THAT NAME OTHER ASSETS MUST BE HASHED LAST (2026-09-08).
# tmr-ds-nav.js is both a hashed build and a file that carries a hashed URL: it
# names tmr-ds-avatar.<hash>.js so that 684 pages get the avatar resolver from
# the one bundle they all already load. That makes the nav's own bytes depend on
# another asset's hash, and hashing it in arbitrary order produced a build that
# could never be self-consistent -- repoint_ds_assets.py rewrote the nav AFTER
# its hashed copy had been published, so the manifest named a hash the source no
# longer had. "Prove every hashed build matches its own name" failed on every CI
# run because of it, and the practical damage was worse than a red job: main
# shipped a nav whose bytes still pointed at the PREVIOUS avatar build.
#
# Fix the order instead of iterating: hash every ordinary asset first, rewrite
# the loaders against that finished mapping, and only then hash the loaders. The
# nav is published already carrying the final avatar URL, so the later repoint
# pass has nothing left to change in it and reaches a fixpoint in one round --
# which also keeps CI's publish-then-verify-then-reference order intact, because
# no new hashed build appears after the availability gate.
LOADER_SOURCES = (
    "static/js/tmr-ds-nav.js",
)

# Assets referenced by their unhashed name (with or without ?v=) as well as by a
# previous hash. Mirrors repoint_ds_assets.QUERY_REPOINT.
QUERY_REPOINT = {"tmr-profile-hydrate.js", "tmr-ds-avatar.js"}


def loader_rules(mapping):
    """The same substitutions repoint_ds_assets.py makes, built from the mapping
    THIS run just produced rather than from the manifest on disk, which is the
    whole point: the nav has to be rewritten before it is hashed."""
    rules = []
    for src, url in mapping.items():
        q = pathlib.Path(src)
        stem, ext = q.stem, q.suffix
        sub = "css" if ext == ".css" else "js"
        rules.append((re.compile(
            (r"/static/%s/%s\.[0-9a-f]{12}%s" % (sub, re.escape(stem), re.escape(ext))).encode()),
            url.encode()))
        if q.name in QUERY_REPOINT:
            rules.append((re.compile(
                (r"/static/%s/%s%s(\?v=[A-Za-z0-9._-]+)?" % (sub, re.escape(stem), re.escape(ext))).encode()),
                url.encode()))
    return rules


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

    # Ordinary assets first, then the loaders that name them. See LOADER_SOURCES.
    discovered = sources()
    ordinary = [s for s in discovered
                if str(s.relative_to(ROOT)).replace("\\", "/") not in LOADER_SOURCES]
    loaders = [s for s in discovered
               if str(s.relative_to(ROOT)).replace("\\", "/") in LOADER_SOURCES]

    for src in ordinary + loaders:
        key = str(src.relative_to(ROOT)).replace("\\", "/")
        if only and key not in only:
            continue
        if key in LOADER_SOURCES:
            # Binary I/O, so a loader that needed no rewrite stays byte-identical
            # and cannot pick up CRLF on a Windows run.
            before = src.read_bytes()
            after = before
            for pat, url in loader_rules(mapping):
                after = pat.sub(url, after)
            if after != before:
                src.write_bytes(after)
                print(f"{key}  ->  rewritten against this run's hashes")
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
