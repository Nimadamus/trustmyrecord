"""Conditional GET cache for the prerender generators (BANDWIDTH_ETAG_20261102).

Render bills the API for every response body it sends, at roughly the
uncompressed size, so gzip alone did not lower the bill. The prerender job
re-reads every member's /api/users/<u>, /metrics, /awards and every /picks page
every 30 minutes, and almost none of them change between runs. Express already
sends a content-hash ETag and answers If-None-Match with an empty 304, so this
module remembers the ETag + body from the previous run and asks again with
If-None-Match. A 304 returns the stored body (byte-identical to what a 200
would have returned, by definition of the content hash); anything else behaves
exactly like a plain request (a 404 still raises HTTPError, etc.).

Only active when PRERENDER_ETAG_CACHE names a directory (the workflow restores
and saves it with actions/cache). Unset = no caching, identical to before.
Any cache read/write problem falls back to a plain request.
"""
import gzip, hashlib, json, os, urllib.error, urllib.request

CACHE_DIR = os.environ.get("PRERENDER_ETAG_CACHE") or ""
STATS = {"hit_304": 0, "miss_200": 0, "uncached": 0}


def _paths(url):
    k = hashlib.sha256(url.encode("utf-8")).hexdigest()
    return os.path.join(CACHE_DIR, k + ".etag"), os.path.join(CACHE_DIR, k + ".body.gz")


def _load(url):
    try:
        ep, bp = _paths(url)
        with open(ep, "r", encoding="utf-8") as f:
            etag = f.read().strip()
        with open(bp, "rb") as f:
            body = gzip.decompress(f.read())
        return (etag, body) if etag else None
    except Exception:
        return None


def _store(url, etag, body):
    try:
        os.makedirs(CACHE_DIR, exist_ok=True)
        ep, bp = _paths(url)
        with open(bp + ".tmp", "wb") as f:
            f.write(gzip.compress(body, 6))
        os.replace(bp + ".tmp", bp)
        with open(ep + ".tmp", "w", encoding="utf-8") as f:
            f.write(etag)
        os.replace(ep + ".tmp", ep)
    except Exception:
        pass


def fetch_bytes(url, headers, timeout=45):
    """Decoded (gunzipped) response body for a GET, using the ETag cache when enabled."""
    hdrs = dict(headers)
    cached = _load(url) if CACHE_DIR else None
    if cached:
        hdrs["If-None-Match"] = cached[0]
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers=hdrs), timeout=timeout) as r:
            raw = r.read()
            if (r.headers.get("Content-Encoding") or "").lower() == "gzip":
                raw = gzip.decompress(raw)
            etag = r.headers.get("ETag")
    except urllib.error.HTTPError as e:
        if e.code == 304 and cached:
            STATS["hit_304"] += 1
            return cached[1]
        raise
    if CACHE_DIR and etag:
        _store(url, etag, raw)
        STATS["miss_200"] += 1
    else:
        STATS["uncached"] += 1
    return raw


def get_json(url, headers, timeout=45):
    return json.loads(fetch_bytes(url, headers, timeout).decode("utf-8"))


def report(label=None):
    if CACHE_DIR:
        label = label or os.path.basename(__import__("sys").argv[0])
        print(f"[etag-cache] {label}: 304 reused {STATS['hit_304']}, 200 fetched {STATS['miss_200']}, uncached {STATS['uncached']}", flush=True)


if CACHE_DIR:
    import atexit
    atexit.register(report)
