#!/usr/bin/env python3
"""Pin every mutable /static/ JS+CSS reference to a content-derived version tag.

The edge caches /static/ assets for 4h under their EXACT URL (query included),
and purge-by-URL misses query variants. So any page (or loader JS) that
references an asset with a stale ?v= tag - or no tag at all - keeps serving
hours-old CSS/JS after a deploy: stale layout and dead data hooks "all over
the ship" for returning visitors, while a cold cache (incognito) looks fine.

This rewrites every reference to `?v=<first 12 hex of sha256(file bytes)>`:
a changed asset changes its tag everywhere in the same deploy, so browsers and
the edge fetch the new bytes immediately - no purge, no user action. Unchanged
assets keep their tag, so nothing refetches needlessly.

Covered sources: every *.html in the repo plus mutable static/js/*.js and
static/css/*.css (loader scripts inject their own dependencies). Skipped:
content-hashed immutable files (name contains a 12-hex segment) as both
targets (their filename already versions them) and sources (they are frozen
deploy snapshots), plus .git/node_modules/workers/artifacts.

Byte-level rewriting: only the matched reference substring changes, so CRLF/LF
line endings and everything else are preserved verbatim.

Run after editing any static asset (or let the prerender workflow run it):
    python scripts/version_static_refs.py          # rewrite
    python scripts/version_static_refs.py --check  # exit 1 if refs are stale
"""
import hashlib
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SKIP_DIRS = {".git", "node_modules", "workers", "artifacts", ".github"}
HASHED_NAME = re.compile(r"\.[0-9a-f]{12}\.(?:js|css)$")
REF = re.compile(rb"(/static/(?:js|css)/[A-Za-z0-9._-]+\.(?:js|css))(\?v=[A-Za-z0-9]*)?")

def is_hashed(path_str):
    return bool(HASHED_NAME.search(path_str))

def sources():
    out = []
    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        rel_dir = os.path.relpath(dirpath, ROOT).replace("\\", "/")
        for fn in filenames:
            rel = fn if rel_dir == "." else rel_dir + "/" + fn
            if fn.endswith(".html"):
                out.append(rel)
            elif (rel.startswith("static/js/") or rel.startswith("static/css/")) \
                    and fn.endswith((".js", ".css")) and not is_hashed(fn):
                out.append(rel)
    return out

def run(check_only):
    changed, missing = [], set()
    # Loader JS files reference other assets, so rewriting their internals
    # changes their own hash; iterate to a fixpoint (leaf tags stabilize
    # first, then the loaders, then the HTML - a few passes at most).
    for _ in range(6):
        wrote = False
        tag_cache = {}
        def tag_for(rel):
            if rel not in tag_cache:
                p = os.path.join(ROOT, rel)
                if not os.path.isfile(p):
                    tag_cache[rel] = None
                else:
                    with open(p, "rb") as f:
                        tag_cache[rel] = hashlib.sha256(f.read()).hexdigest()[:12]
            return tag_cache[rel]

        for rel in sources():
            p = os.path.join(ROOT, rel)
            with open(p, "rb") as f:
                raw = f.read()
            def sub(m, self_rel=rel):
                target = m.group(1).decode()          # "/static/js/foo.js"
                if is_hashed(target):
                    return m.group(0)                  # immutable by filename
                target_rel = target.lstrip("/")
                if target_rel == self_rel.replace("\\", "/"):
                    return m.group(0)                  # self-reference: unstable
                h = tag_for(target_rel)
                if h is None:
                    missing.add(target_rel)
                    return m.group(0)                  # dead ref: leave visible
                return (target + "?v=" + h).encode()
            new = REF.sub(sub, raw)
            if new != raw:
                wrote = True
                changed.append(rel)
                if not check_only:
                    with open(p, "wb") as f:
                        f.write(new)
                    with open(p, "rb") as f:
                        if f.read() != new:
                            sys.exit("WRITE VERIFY FAILED: " + rel)
        if not wrote or check_only:
            break

    for m in sorted(missing):
        print("WARN: referenced file missing on disk, ref left as-is: " + m)
    uniq = sorted(set(changed))
    if check_only:
        if uniq:
            print("STALE refs in %d files - run: python scripts/version_static_refs.py" % len(uniq))
            sys.exit(1)
        print("all static refs are content-current")
    else:
        print("rewrote refs in %d files" % len(uniq))
        for u in uniq:
            print("  " + u)

if __name__ == "__main__":
    run("--check" in sys.argv)
