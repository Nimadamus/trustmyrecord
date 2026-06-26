#!/usr/bin/env python3
"""
verify_home_highlights.py - prove the baked homepage "Live highlights" SEO block
(<!--MK:homeHighlights-->) contains ONLY real, currently-reproducible claims.

For every rendered <li> it:
  1. extracts the linked username (href="/u/<user>/") and the claim clause,
  2. re-fetches that user's live graded picks from the API,
  3. re-runs the exact same engine (compute_home_highlight) on fresh data,
  4. asserts the rendered clause equals the freshly-derived clause.

Any mismatch, unknown user, user with zero graded picks, or hand-injected row
fails the run (exit 1). Wired into the daily/30-min refresh workflow BEFORE the
commit step, so fake or stale highlights can never reach the live homepage.

The neutral fallback (<li class="tmrhx-hl-empty">...) is allowed and passes.

Usage:  python scripts/verify_home_highlights.py        (verifies local index.html)
        python scripts/verify_home_highlights.py --live  (verifies live homepage HTML)
"""
import os, re, sys, html, datetime, urllib.request, urllib.parse, importlib.util

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HOME = os.path.join(ROOT, "index.html")
LIVE = "https://trustmyrecord.com/index.html"

# Reuse the SAME engine that bakes the block - single source of truth.
_spec = importlib.util.spec_from_file_location(
    "prerender_directory", os.path.join(ROOT, "scripts", "prerender_directory.py"))
P = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(P)

BLOCK_RE = re.compile(r"<!--MK:homeHighlights-->(.*?)<!--/MK:homeHighlights-->", re.S)
LI_RE = re.compile(r"<li(?P<attrs>[^>]*)>(?P<body>.*?)</li>", re.S)
HREF_RE = re.compile(r'href="/u/([^/"]+)/"')


def fetch(url):
    req = urllib.request.Request(url, headers={"Accept": "text/html,application/json"})
    with urllib.request.urlopen(req, timeout=45) as r:
        return r.read().decode("utf-8", "replace")


def clause_of(li_body):
    """Strip the emoji + linked <b>name</b>, return the trailing claim clause
    exactly as the bake renders it (no trailing period)."""
    txt = re.sub(r"<a[^>]*>.*?</a>", "", li_body, flags=re.S)   # drop the name link
    txt = re.sub(r"<[^>]+>", "", txt)                            # drop any tags
    txt = html.unescape(txt).strip()
    # leading emoji/space already gone with the link removal in practice; trim leftovers
    txt = txt.lstrip("🔥📈🎯💰📊🚀✅⚾🏒🏀🏈 ").strip()
    return txt.rstrip(".").strip()


def main():
    now = datetime.datetime.now(datetime.timezone.utc)
    src = fetch(LIVE) if "--live" in sys.argv else open(HOME, encoding="utf-8").read()
    m = BLOCK_RE.search(src)
    if not m:
        print("FAIL: homeHighlights marker block not found")
        return 1
    block = m.group(1)
    lis = LI_RE.findall(block)
    if not lis:
        print("FAIL: no <li> rows inside homeHighlights block")
        return 1

    errors, checked = [], 0
    for attrs, body in lis:
        if "tmrhx-hl-empty" in attrs:
            print("OK   neutral fallback row (allowed)")
            continue
        hm = HREF_RE.search(body)
        if not hm:
            errors.append(f"row has no /u/<user>/ profile link: {body[:80]!r}")
            continue
        un = hm.group(1)
        rendered = clause_of(body)
        try:
            data = P.get(f"{P.API}/picks?username={urllib.parse.quote(un)}&limit=100")
            picks = data.get("picks", []) if isinstance(data, dict) else []
        except Exception as ex:
            errors.append(f"{un}: live picks fetch failed: {ex}")
            continue
        graded = [p for p in picks if str(p.get("status") or "").lower() in P.GRADED_ST]
        if not graded:
            errors.append(f"{un}: rendered a highlight but has ZERO graded picks (fake/stale)")
            continue
        # Pull this user's authoritative aggregates for the meta passed to the engine.
        try:
            ud = P.get(f"{P.API}/users/{urllib.parse.quote(un)}")
            ud = ud.get("user", ud)
        except Exception:
            ud = {}
        hl = P.compute_home_highlight(picks, {
            "net_units": ud.get("net_units"), "roi": ud.get("roi"),
            "total_picks": ud.get("total_picks"),
        }, now)
        derived = (hl["clause"] if hl else None)
        if derived is None:
            errors.append(f"{un}: engine derives NO qualifying highlight from live data (rendered: {rendered!r})")
        elif derived != rendered:
            errors.append(f"{un}: claim not reproducible.\n      rendered: {rendered!r}\n      live now: {derived!r}")
        else:
            checked += 1
            print(f"OK   {un}: {rendered!r} reproduced from {len(graded)} graded picks")

    if errors:
        print("\nVERIFICATION FAILED - homepage highlights are not all reproducible from live graded data:")
        for e in errors:
            print("  - " + e)
        return 1
    print(f"\nPASS: {checked} highlight row(s) verified against live graded picks. No fake/stale claims.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
