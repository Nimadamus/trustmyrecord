#!/usr/bin/env python3
"""TrustMyRecord automated SEO crawl check (SEO_INDEXING_PROTOCOL.md section 8).

Run after EVERY deploy that touches pages, sitemap.xml, or robots.txt:
    python scripts/seo_audit.py

Checks (live site, no auth):
  1. https://trustmyrecord.com/ , /robots.txt , /sitemap.xml all return 200
  2. robots.txt references the full sitemap URL and does not Disallow Googlebot from /
  3. Every sitemap URL returns 200 directly (no 3xx redirect, no 404)
  4. No sitemap URL carries meta robots noindex or X-Robots-Tag noindex
  5. Every sitemap URL has a self-referencing canonical (exact match)
  6. Every sitemap URL has a non-empty <title> and <h1>

Exit 0 = ALL SEO CHECKS PASSED. Exit 2 = failures listed.
"""
import re
import sys
import urllib.request
import concurrent.futures

BASE = "https://trustmyrecord.com"
UA = {"User-Agent": "Mozilla/5.0 (compatible; TMR-SEO-Audit/1.0)"}


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k):
        return None


OPENER = urllib.request.build_opener(NoRedirect)


def fetch(url):
    """Return (status, headers, body_text_or_None, redirect_location)."""
    try:
        r = OPENER.open(urllib.request.Request(url, headers=UA), timeout=30)
        return r.status, r.headers, r.read(800000).decode("utf-8", "ignore"), ""
    except urllib.error.HTTPError as e:
        return e.code, e.headers, None, e.headers.get("Location", "")
    except Exception as e:  # network error
        return 0, {}, None, str(e)


def check_url(url):
    errs = []
    status, headers, body, loc = fetch(url)
    if status != 200:
        errs.append(f"{url} -> HTTP {status} {loc}".strip())
        return errs
    xrt = (headers.get("X-Robots-Tag") or "").lower()
    if "noindex" in xrt:
        errs.append(f"{url} -> X-Robots-Tag noindex")
    robots = re.search(r'<meta[^>]+name=["\']robots["\'][^>]*>', body, re.I)
    if robots and "noindex" in robots.group(0).lower():
        errs.append(f"{url} -> meta robots noindex")
    canon = re.search(r'<link[^>]+rel=["\']canonical["\'][^>]*href=["\']([^"\']+)["\']', body, re.I)
    if not canon:
        errs.append(f"{url} -> MISSING canonical")
    elif canon.group(1) != url:
        errs.append(f"{url} -> canonical mismatch: {canon.group(1)}")
    if not re.search(r"<title[^>]*>[^<]+</title>", body, re.I):
        errs.append(f"{url} -> missing/empty <title>")
    if not re.search(r"<h1[\s>]", body, re.I):
        errs.append(f"{url} -> missing <h1>")
    return errs


def main():
    failures = []

    # 1-2. homepage, robots, sitemap
    for path in ("/", "/robots.txt", "/sitemap.xml"):
        status, _, body, loc = fetch(BASE + path)
        print(f"{status} {BASE}{path}")
        if status != 200:
            failures.append(f"{BASE}{path} -> HTTP {status} {loc}")
            body = None
        if path == "/robots.txt" and body:
            if f"Sitemap: {BASE}/sitemap.xml" not in body:
                failures.append("robots.txt missing full sitemap URL")
            for block in re.split(r"\n\s*\n", body):
                if re.search(r"User-agent:\s*(\*|Googlebot)\s*$", block, re.I | re.M) and re.search(r"^Disallow:\s*/\s*$", block, re.M):
                    failures.append(f"robots.txt blocks Googlebot/* from /: {block[:80]}")
        if path == "/sitemap.xml" and body:
            sitemap_body = body

    urls = re.findall(r"<loc>([^<]+)</loc>", sitemap_body) if "sitemap_body" in dir() else []
    if not urls:
        failures.append("sitemap.xml has zero <loc> URLs")
    print(f"sitemap URLs: {len(urls)}")

    # 3-6. every sitemap URL
    with concurrent.futures.ThreadPoolExecutor(8) as ex:
        for errs in ex.map(check_url, urls):
            failures.extend(errs)

    print()
    if failures:
        print("SEO AUDIT FAILED:")
        for f in failures:
            print("  -", f)
        sys.exit(2)
    print(f"ALL SEO CHECKS PASSED ({len(urls)} sitemap URLs: 200, no redirect, no noindex, self-canonical, title+h1)")
    sys.exit(0)


if __name__ == "__main__":
    main()
