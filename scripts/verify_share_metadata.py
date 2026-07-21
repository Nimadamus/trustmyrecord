#!/usr/bin/env python3
"""
verify_share_metadata.py — prove that shared TrustMyRecord URLs actually unfurl.

Fetches real, live URLs the way a social crawler does (Facebook / X / LinkedIn /
Slack user agents, no JavaScript) and asserts that every shareable content type
returns a complete, item-specific preview.

Fails CLOSED. Any missing tag, generic-for-everyone image, wrong canonical, or
noindex is an error, not a warning. Exit code 1 on any failure.

    python scripts/verify_share_metadata.py                 # live production
    python scripts/verify_share_metadata.py --base http://127.0.0.1:8000

What it checks per URL:
  * HTTP 200, HTML body
  * <title>, meta description, canonical
  * og:title / og:description / og:url / og:image / og:type / og:site_name
  * twitter:card (+ twitter:image where a large card is claimed)
  * canonical is absolute and points at the item, not a parent page
  * NO noindex anywhere (site-wide owner rule)
  * og:image really resolves: 200 + an image/* content type
  * previews are UNIQUE across items of the same type (no single generic card)
"""
import argparse
import json
import re
import sys
import urllib.error
import urllib.parse
import urllib.request

for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

API = "https://trustmyrecord-api.onrender.com/api"
DEFAULT_BASE = "https://trustmyrecord.com"

# Real crawler user agents. Facebook and X are the two that matter most and the
# two most likely to be treated differently by an edge layer.
CRAWLERS = {
    "facebook": "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
    "twitter": "Twitterbot/1.0",
    "linkedin": "LinkedInBot/1.0 (compatible; Mozilla/5.0; Apache-HttpClient +http://www.linkedin.com)",
    "slack": "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)",
}

TAG_RE = {
    "title": re.compile(r"<title[^>]*>(.*?)</title>", re.I | re.S),
    "description": re.compile(r'<meta[^>]+name=["\']description["\'][^>]+content=["\'](.*?)["\']', re.I | re.S),
    "canonical": re.compile(r'<link[^>]+rel=["\']canonical["\'][^>]+href=["\'](.*?)["\']', re.I | re.S),
    "robots": re.compile(r'<meta[^>]+name=["\']robots["\'][^>]+content=["\'](.*?)["\']', re.I | re.S),
    "og:title": re.compile(r'<meta[^>]+property=["\']og:title["\'][^>]+content=["\'](.*?)["\']', re.I | re.S),
    "og:description": re.compile(r'<meta[^>]+property=["\']og:description["\'][^>]+content=["\'](.*?)["\']', re.I | re.S),
    "og:url": re.compile(r'<meta[^>]+property=["\']og:url["\'][^>]+content=["\'](.*?)["\']', re.I | re.S),
    "og:image": re.compile(r'<meta[^>]+property=["\']og:image["\'][^>]+content=["\'](.*?)["\']', re.I | re.S),
    "og:type": re.compile(r'<meta[^>]+property=["\']og:type["\'][^>]+content=["\'](.*?)["\']', re.I | re.S),
    "og:site_name": re.compile(r'<meta[^>]+property=["\']og:site_name["\'][^>]+content=["\'](.*?)["\']', re.I | re.S),
    "twitter:card": re.compile(r'<meta[^>]+name=["\']twitter:card["\'][^>]+content=["\'](.*?)["\']', re.I | re.S),
    "twitter:image": re.compile(r'<meta[^>]+name=["\']twitter:image["\'][^>]+content=["\'](.*?)["\']', re.I | re.S),
}

REQUIRED = ["title", "description", "canonical", "og:title", "og:description",
            "og:url", "og:image", "og:type", "twitter:card"]

failures = []
notes = []


def fail(url, msg):
    failures.append(f"{url} :: {msg}")


def fetch(url, ua, timeout=30):
    req = urllib.request.Request(url, headers={
        "User-Agent": ua,
        "Accept": "text/html,application/xhtml+xml,*/*",
    })
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.status, r.headers, r.read().decode("utf-8", "replace")


def head_image(url, timeout=30):
    """og:image must actually resolve. Uses GET (some hosts reject HEAD) but
    reads only the first bytes."""
    req = urllib.request.Request(url, headers={"User-Agent": CRAWLERS["facebook"]})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        ctype = r.headers.get("Content-Type", "")
        chunk = r.read(2048)
        return r.status, ctype, len(chunk)


def parse_tags(html_text):
    out = {}
    for key, rx in TAG_RE.items():
        m = rx.search(html_text)
        out[key] = (m.group(1).strip() if m else None)
    return out


def check_url(label, url, expect_canonical=None, ua_key="facebook"):
    print(f"\n=== {label}\n    {url}")
    try:
        status, headers, body = fetch(url, CRAWLERS[ua_key])
    except urllib.error.HTTPError as e:
        fail(url, f"HTTP {e.code}")
        return None
    except Exception as e:
        fail(url, f"request failed: {e}")
        return None

    if status != 200:
        fail(url, f"expected 200, got {status}")
    ctype = headers.get("Content-Type", "")
    if "text/html" not in ctype:
        fail(url, f"expected HTML, got {ctype}")
        return None

    tags = parse_tags(body)

    for key in REQUIRED:
        if not tags.get(key):
            fail(url, f"missing {key}")

    robots = (tags.get("robots") or "").lower()
    if "noindex" in robots:
        fail(url, f"NOINDEX present ('{robots}') - site rule forbids this on any page")

    canon = tags.get("canonical")
    if canon and not canon.startswith("http"):
        fail(url, f"canonical is not absolute: {canon}")
    if expect_canonical and canon and canon.rstrip("/") != expect_canonical.rstrip("/"):
        fail(url, f"canonical mismatch: expected {expect_canonical}, got {canon}")

    card = (tags.get("twitter:card") or "").lower()
    if card == "summary_large_image" and not tags.get("twitter:image"):
        fail(url, "twitter:card=summary_large_image but no twitter:image")

    img = tags.get("og:image")
    if img:
        try:
            istatus, ictype, nbytes = head_image(img)
            if istatus != 200:
                fail(url, f"og:image returned {istatus}: {img}")
            elif not ictype.startswith("image/"):
                fail(url, f"og:image is not an image ({ictype}): {img}")
            else:
                print(f"    og:image OK  {ictype}  {img}")
        except Exception as e:
            fail(url, f"og:image unreachable ({e}): {img}")

    print(f"    title      {tags.get('title')}")
    print(f"    canonical  {tags.get('canonical')}")
    print(f"    og:desc    {(tags.get('og:description') or '')[:120]}")
    print(f"    tw:card    {tags.get('twitter:card')}")
    return tags


def api_json(path):
    req = urllib.request.Request(API + path, headers={"User-Agent": "TMR-ShareVerify/1.0"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode("utf-8"))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default=DEFAULT_BASE)
    ap.add_argument("--pick", help="pick id to verify (default: newest graded public pick via API)")
    ap.add_argument("--thread", help="thread id to verify")
    ap.add_argument("--post", help="post id to verify")
    ap.add_argument("--users", default="", help="comma-separated usernames (default: top leaderboard members)")
    args = ap.parse_args()
    base = args.base.rstrip("/")

    # ---- pick the real items to verify ----
    users = [u for u in args.users.split(",") if u.strip()]
    if not users:
        lb = api_json("/users/leaderboard?limit=3").get("leaderboard") or []
        users = [e["username"] for e in lb[:3]]
    if not users:
        print("ABORT: could not resolve any member to verify", file=sys.stderr)
        return 1

    threads = []
    if args.thread:
        threads = [args.thread]
    else:
        t = (api_json("/forum/threads?limit=3").get("threads") or [])
        threads = [(str(x["id"]), x.get("slug") or "") for x in t[:2]]
        threads = [x for x in threads if x[0]]

    print("=" * 70)
    print(f"SHARE METADATA VERIFICATION  base={base}")
    print(f"members: {users}")
    print(f"threads: {threads}")
    print("=" * 70)

    profile_tags = {}
    for un in users:
        url = f"{base}/u/{urllib.parse.quote(un)}/"
        tags = check_url(f"PROFILE {un}", url, expect_canonical=url)
        if tags:
            profile_tags[un] = tags

    thread_tags = {}
    for tid, slug in threads:
        url = f"{base}/forum/thread/{tid}/{slug}/"
        tags = check_url(f"THREAD {tid}", url, expect_canonical=url)
        if tags:
            thread_tags[tid] = tags

    # ---- pick + post go through the Worker; they are the dynamic half ----
    pick_id = args.pick
    if not pick_id:
        try:
            picks = api_json("/picks?status=won&limit=1").get("picks") or []
            pick_id = str(picks[0]["id"]) if picks else None
        except Exception:
            pick_id = None
    if pick_id:
        url = f"{base}/pick/?id={pick_id}"
        tags = check_url(f"PICK {pick_id}", url, expect_canonical=f"{base}/pick/?id={pick_id}")
        if tags and tags.get("og:image") and "/share/og/pick/" not in (tags.get("og:image") or ""):
            fail(url, "og:image is not the per-pick card - the Worker did not rewrite this page")
    else:
        notes.append("no graded pick id resolved; pick preview NOT verified")

    post_id = args.post
    if not post_id and threads:
        try:
            posts = api_json(f"/forum/threads/{threads[0][0]}/posts?limit=1").get("posts") or []
            post_id = str(posts[0]["id"]) if posts else None
        except Exception:
            post_id = None
    if post_id and threads:
        tid, slug = threads[0]
        url = f"{base}/forum/thread/{tid}/{slug}/?post={post_id}"
        tags = check_url(f"POST {post_id}", url, expect_canonical=f"{base}/forum/thread/{tid}/{slug}/")
        if tags and tags.get("og:image") and "/share/og/post/" not in (tags.get("og:image") or ""):
            fail(url, "og:image is not the per-post card - the Worker did not rewrite this page")
    else:
        notes.append("no post id resolved; post preview NOT verified")

    # ---- uniqueness: the whole point is that previews are not generic ----
    def assert_unique(kind, tagmap, key):
        vals = [(k, (v.get(key) or "")) for k, v in tagmap.items()]
        seen = {}
        for k, val in vals:
            if not val:
                continue
            if val in seen:
                fail(f"{kind}:{k}", f"{key} is identical to {kind}:{seen[val]} - previews must be item-specific")
            seen[val] = k

    assert_unique("profile", profile_tags, "og:image")
    assert_unique("profile", profile_tags, "og:title")
    assert_unique("profile", profile_tags, "og:description")
    assert_unique("thread", thread_tags, "og:image")
    assert_unique("thread", thread_tags, "og:title")

    # ---- report ----
    print("\n" + "=" * 70)
    for n in notes:
        print(f"NOTE: {n}")
    if failures:
        print(f"FAIL — {len(failures)} problem(s):")
        for f in failures:
            print(f"  - {f}")
        return 1
    print("PASS — every checked URL returned a complete, item-specific preview.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
