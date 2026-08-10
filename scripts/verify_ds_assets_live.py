#!/usr/bin/env python3
"""Prove every content-hashed design-system asset is actually reachable on the
live site, and repair the edge if it is not.

WHY THIS EXISTS (2026-08-10 incident)
-------------------------------------
Hashed filenames were assumed to be immune to cache trouble, and for STALE
content they are -- the URL changes whenever the bytes do, so nobody can be
served yesterday's file under today's name. But immutability cuts the other
way too, and that half was missed: if the URL is requested in the window
between the repointed HTML going live and the new asset finishing propagation,
the edge sees a 404 and caches THAT. `/static/` is edge-cached for 4 hours
keyed on the full URL, so a single unlucky request pins a 404 onto an asset
every page needs, for hours, while the origin serves it perfectly.

That is exactly what happened to `tmr-ds.61394bbbaf14.css`: origin returned 200
for `?cb=1`, the bare URL returned `404 cf=HIT age=125`, and all 99 pages on the
design system rendered unstyled until the URL was purged. No deploy step failed;
nothing looked wrong in any run log. The failure is invisible from inside CI,
which is why it needs a check that runs from OUTSIDE, against the real hostname.

WHAT IT DOES
------------
Reads static/ds-assets.json -- the manifest of every hashed build -- and fetches
each published URL from the live host. A 404 immediately after a deploy is
expected and harmless while propagation catches up, so each URL is retried with
a delay before it counts as a failure. Anything still failing is then purged
from the edge (a cached negative response is the only thing a purge can fix) and
re-checked. If a URL is still not 200 after that, the edge is not the problem
and the run fails loudly rather than leaving a broken site looking green.

Purging needs a Cloudflare token with Cache Purge on the zone, read from
CLOUDFLARE_API_TOKEN. Without one the check still detects and reports the
breakage -- it just cannot repair it, and says so.

USAGE
    python scripts/verify_ds_assets_live.py
    python scripts/verify_ds_assets_live.py --host https://trustmyrecord.com
    python scripts/verify_ds_assets_live.py --attempts 12 --delay 15
    python scripts/verify_ds_assets_live.py --no-purge     # detect only
"""

from __future__ import annotations

import argparse
import json
import os
import pathlib
import sys
import time
import urllib.error
import urllib.request

ZONE = "f8ec00a722aa024d0145befb02c8e591"  # trustmyrecord.com (not a secret)
MANIFEST = pathlib.Path(__file__).resolve().parent.parent / "static" / "ds-assets.json"


def fetch_status(url: str, timeout: int = 20) -> tuple[int, str]:
    """Return (status, cf-cache-status). Never raises for an HTTP error code."""
    req = urllib.request.Request(url, method="GET")
    # A browser-ish UA: some edge configurations treat unknown agents differently,
    # and this check is only meaningful if it sees what a visitor would see.
    req.add_header("User-Agent", "tmr-ds-asset-check/1.0")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status, resp.headers.get("cf-cache-status", "-")
    except urllib.error.HTTPError as exc:
        return exc.code, exc.headers.get("cf-cache-status", "-") if exc.headers else "-"
    except Exception as exc:  # network hiccup: report as 0 so it retries
        print(f"    (transport error: {exc})")
        return 0, "-"


def purge(urls: list[str], token: str) -> bool:
    """Purge specific URLs from the Cloudflare edge. Returns True on success."""
    body = json.dumps({"files": urls}).encode()
    req = urllib.request.Request(
        f"https://api.cloudflare.com/client/v4/zones/{ZONE}/purge_cache",
        data=body,
        method="POST",
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read()).get("success", False)
    except Exception as exc:
        print(f"  purge failed: {exc}")
        return False


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--host", default="https://trustmyrecord.com")
    ap.add_argument("--attempts", type=int, default=8,
                    help="tries per URL before it counts as broken (default 8)")
    ap.add_argument("--delay", type=int, default=15,
                    help="seconds between tries (default 15)")
    ap.add_argument("--no-purge", action="store_true",
                    help="report only; never touch the edge")
    args = ap.parse_args()

    host = args.host.rstrip("/")
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    urls = [host + path for path in sorted(manifest.values())]
    print(f"checking {len(urls)} hashed design-system assets on {host}\n")

    broken: list[str] = []
    for url in urls:
        name = url.rsplit("/", 1)[-1]
        # POLL PAST THE EDGE, NOT THROUGH IT (fixed 2026-08-10).
        #
        # The first version of this loop polled the bare URL, and on the run that
        # published tmr-ds.b15051383f72.css the very first probe -- sent while the
        # Pages deploy was still landing -- returned `404 cf=MISS` and TAUGHT the
        # edge that 404. The next twelve probes read it straight back as
        # `cf=HIT` until the negative entry aged out at `cf=EXPIRED`, three
        # minutes later. A check written to prevent a cached 404 was creating one.
        #
        # It was harmless in that it happened during phase 1, when nothing
        # references the URL yet -- but it stalled the deploy for three minutes
        # and seeded exactly the state this script exists to detect.
        #
        # So ask the ORIGIN whether the file has landed, using a unique query
        # string that cannot share a cache key with the real URL. Only once the
        # origin says yes is the bare URL checked, and by then a 200 is what the
        # edge will store.
        for attempt in range(1, args.attempts + 1):
            probe, _ = fetch_status(f"{url}?__deploy_probe={attempt}")
            if probe == 200:
                status, cf = fetch_status(url)
                if status == 200:
                    print(f"  ok   {name}  (cf={cf})")
                    break
                # Origin has it but the edge is serving a negative response held
                # from before the deploy. That IS the incident this guards
                # against, and a purge is the only thing that clears it.
                print(f"  !!   {name}  origin 200 but edge HTTP {status} cf={cf} -- edge holds a stale negative")
                broken.append(url)
                break
            print(f"  ...  {name}  origin HTTP {probe}  try {attempt}/{args.attempts}")
            if attempt < args.attempts:
                time.sleep(args.delay)
        else:
            broken.append(url)

    if not broken:
        print(f"\nall {len(urls)} hashed assets are reachable")
        return 0

    print(f"\n{len(broken)} asset(s) not reachable:")
    for url in broken:
        print(f"  {url}")

    token = os.environ.get("CLOUDFLARE_API_TOKEN", "")
    if args.no_purge or not token:
        why = "--no-purge was passed" if args.no_purge else "CLOUDFLARE_API_TOKEN is not set"
        print(f"\nnot attempting a purge ({why}).")
        print("If cf-cache-status was HIT above, the edge is serving a cached negative")
        print("response and a purge of those exact URLs is the fix.")
        return 1

    # Purge both apex and www: they are separate cache keys, and pages are served
    # from whichever hostname the visitor arrived on.
    variants: list[str] = []
    for url in broken:
        variants.append(url)
        variants.append(url.replace("://trustmyrecord.com", "://www.trustmyrecord.com"))
    print(f"\npurging {len(variants)} URL(s) from the edge...")
    if not purge(sorted(set(variants)), token):
        print("purge did not succeed")
        return 1

    time.sleep(5)
    still: list[str] = []
    for url in broken:
        status, cf = fetch_status(url)
        name = url.rsplit("/", 1)[-1]
        print(f"  {'ok  ' if status == 200 else 'FAIL'} {name}  HTTP {status} cf={cf}")
        if status != 200:
            still.append(url)

    if still:
        print("\nStill broken after a purge, so this is not an edge cache problem:")
        for url in still:
            print(f"  {url}")
        print("Check that the deploy actually published these files.")
        return 1

    print("\nedge repaired: every hashed asset now returns 200")
    return 0


if __name__ == "__main__":
    sys.exit(main())
