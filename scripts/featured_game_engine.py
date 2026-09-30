#!/usr/bin/env python3
"""Featured Game engine: the sport agnostic half of a Featured Game of the Day.

FEATURED_GAME_ENGINE_20260929. Built for the NHL (scripts/nhl_featured_game.py)
and written so NFL, NBA and MLB can adopt the same frame without copying it.
A sport module owns its feeds, its scoring and its prose. This module owns
everything that must behave the same for every sport:

  * fetching with retries, and a ledger of every source read on this run with
    the time it answered, so the page can say how current each part is
  * freshness guards: a feed that answers with old data is treated as a feed
    that did not answer, and the section it feeds is dropped, never estimated
  * the state file (one JSON per sport) that makes the job idempotent: a game
    day is selected once, a URL is minted once, and a page is only rewritten
    when the data behind it changed
  * the page shell: head, canonical, Open Graph, Twitter, JSON-LD, the site
    header and footer scripts pinned to their current asset versions
  * sitemap and homepage marker upkeep
  * the run log and the health file the failure alert reads

Nothing here invents a value. Every helper that formats a number returns ""
for a missing one, and the sport module leaves out any row that comes back
empty.
"""

import datetime as dt
import hashlib
import html
import json
import os
import re
import time
import urllib.error
import urllib.request
from zoneinfo import ZoneInfo

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = "https://trustmyrecord.com"
ET = ZoneInfo("America/New_York")
PT = ZoneInfo("America/Los_Angeles")
UTC = dt.timezone.utc


# ------------------------------------------------------------------ time

def now_utc():
    return dt.datetime.now(UTC).replace(microsecond=0)


def parse_utc(value):
    if not value:
        return None
    try:
        text = str(value).replace("Z", "+00:00")
        t = dt.datetime.fromisoformat(text)
        if t.tzinfo is None:
            t = t.replace(tzinfo=UTC)
        return t.astimezone(UTC)
    except ValueError:
        return None


def iso(t):
    return t.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ") if t else None


def clock(t):
    """7:00 PM"""
    h = t.hour % 12 or 12
    return "%d:%02d %s" % (h, t.minute, "AM" if t.hour < 12 else "PM")


def long_date(d):
    """Tuesday, September 29, 2026"""
    return "%s, %s %d, %d" % (d.strftime("%A"), d.strftime("%B"), d.day, d.year)


def month_day_year(d):
    return "%s %d, %d" % (d.strftime("%B"), d.day, d.year)


def pacific_stamp(t):
    """September 29, 2026, 4:35 PM PT"""
    p = t.astimezone(PT)
    return "%s, %s PT" % (month_day_year(p), clock(p))


# ------------------------------------------------------------------ fetch

class FetchError(Exception):
    pass


class Sources:
    """Every feed read on this run: name, url, when it answered, ok or not."""

    def __init__(self):
        self.rows = {}
        self.cache = {}

    def get(self, name, url, kind="json", attempts=3, timeout=25, headers=None, browser=False):
        if url in self.cache:
            return self.cache[url]
        hdrs = dict(headers or {})
        if browser:
            hdrs.setdefault("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                                          "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36")
        last = None
        for i in range(attempts):
            try:
                req = urllib.request.Request(url, headers=hdrs)
                with urllib.request.urlopen(req, timeout=timeout) as resp:
                    raw = resp.read()
                text = raw.decode("utf-8", errors="replace")
                data = json.loads(text) if kind == "json" else text
                self.rows[name] = {"url": url, "ok": True, "at": iso(now_utc())}
                self.cache[url] = data
                return data
            except urllib.error.HTTPError as exc:
                last = "HTTP %s" % exc.code
                if exc.code in (400, 401, 403, 404):
                    break
            except Exception as exc:  # network, timeout, bad JSON
                last = "%s: %s" % (type(exc).__name__, exc)
            time.sleep(1.5 * (i + 1))
        self.rows[name] = {"url": url, "ok": False, "at": iso(now_utc()), "error": last}
        raise FetchError("%s unavailable (%s)" % (name, last))

    def try_get(self, name, url, **kw):
        try:
            return self.get(name, url, **kw)
        except FetchError:
            return None

    def failed(self):
        return {k: v for k, v in self.rows.items() if not v.get("ok")}


# ------------------------------------------------------------------ state

def load_json(path, default):
    try:
        with open(path, encoding="utf-8") as fh:
            return json.load(fh)
    except (OSError, ValueError):
        return default


def save_json(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8", newline="\n") as fh:
        json.dump(data, fh, indent=1, sort_keys=True, ensure_ascii=False)
        fh.write("\n")
    os.replace(tmp, path)


def content_hash(obj):
    return hashlib.sha256(json.dumps(obj, sort_keys=True, default=str).encode("utf-8")).hexdigest()[:16]


def write_text(path, text):
    """Write only when the bytes differ. Returns True when the file changed."""
    try:
        with open(path, encoding="utf-8") as fh:
            if fh.read() == text:
                return False
    except OSError:
        pass
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(text)
    return True


# ------------------------------------------------------------------ text

esc = lambda v: html.escape("" if v is None else str(v), quote=True)

# House rule: nothing published carries a dash as punctuation. Feeds write
# them; this is the last place to catch every one. Hyphens inside a token
# ("43-27-12", "-110") are not punctuation and are left alone.
_DASHES = ((" — ", ", "), (" – ", ", "), ("—", ", "), ("–", ", "), (" - ", ", "))


def undash(text):
    for a, b in _DASHES:
        text = text.replace(a, b)
    return text


def slugify(text):
    import unicodedata
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    text = re.sub(r"[^a-zA-Z0-9]+", "-", text.lower())
    return re.sub(r"-+", "-", text).strip("-")


def american(v):
    try:
        n = int(round(float(v)))
    except (TypeError, ValueError):
        return ""
    return "+%d" % n if n > 0 else str(n)


def implied(price):
    try:
        p = float(price)
    except (TypeError, ValueError):
        return None
    return 100.0 / (p + 100.0) if p > 0 else -p / (-p + 100.0)


def pct(v, digits=1):
    """0.9123 -> 91.2%. Values already on a 0..100 scale pass through."""
    if v is None:
        return ""
    try:
        f = float(v)
    except (TypeError, ValueError):
        return ""
    if f <= 1.0:
        f *= 100
    return "%.*f%%" % (digits, f)


def svpct(v):
    """Save percentage the hockey way: .912"""
    if v is None:
        return ""
    try:
        f = float(v)
    except (TypeError, ValueError):
        return ""
    if f > 1:
        f /= 100.0
    return ("%.3f" % f).lstrip("0") if f < 1 else "1.000"


def num(v, digits=2):
    if v is None:
        return ""
    try:
        return "%.*f" % (digits, float(v))
    except (TypeError, ValueError):
        return ""


def ordinal(n):
    n = int(n)
    if 10 <= n % 100 <= 20:
        suf = "th"
    else:
        suf = {1: "st", 2: "nd", 3: "rd"}.get(n % 10, "th")
    return "%d%s" % (n, suf)


ORDINAL_WORDS = ["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth"]


def rank_map(rows, key, higher_better=True):
    """{team: rank} across a league table, 1 = best. Ties share a rank."""
    vals = [(r["_team"], r.get(key)) for r in rows if r.get(key) is not None]
    vals.sort(key=lambda x: x[1], reverse=higher_better)
    out, prev, prev_rank = {}, None, 0
    for i, (team, v) in enumerate(vals, 1):
        rank = prev_rank if prev is not None and abs(v - prev) < 1e-9 else i
        out[team] = rank
        prev, prev_rank = v, rank
    return out


# ------------------------------------------------------------------ assets

def asset(root, src):
    """Current URL of a static asset: the content hashed name when the build
    publishes one, else ?v=<first 12 hex of sha256>, the exact tag
    scripts/version_static_refs.py would write."""
    manifest = load_json(os.path.join(root, "static", "ds-assets.json"), {})
    if manifest.get(src):
        return manifest[src]
    path = os.path.join(root, src.replace("/", os.sep))
    try:
        with open(path, "rb") as fh:
            tag = hashlib.sha256(fh.read()).hexdigest()[:12]
        return "/%s?v=%s" % (src, tag)
    except OSError:
        return "/" + src


# ------------------------------------------------------------------ images

def local_image(root, url, rel_path, size, quality=80):
    """Self host a remote image as a square WebP of `size` pixels at
    static/<rel_path>.webp, so a page serves a small, cached, same origin file
    with known dimensions. Written once: an existing file is reused, which
    keeps quiet runs byte identical. Returns {"src", "w", "h"}; the original
    URL when Pillow is not installed or the conversion fails; None when there
    is no URL."""
    if not url:
        return None
    rel = "static/%s.webp" % rel_path.strip("/")
    path = os.path.join(root, rel.replace("/", os.sep))
    if os.path.exists(path):
        return {"src": "/" + rel, "w": size, "h": size}
    try:
        import io
        from PIL import Image
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                                                                 "AppleWebKit/537.36 Chrome/128.0 Safari/537.36"})
        with urllib.request.urlopen(req, timeout=25) as resp:
            raw = resp.read()
        im = Image.open(io.BytesIO(raw)).convert("RGBA")
        im.thumbnail((size, size), Image.LANCZOS)
        canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        canvas.paste(im, ((size - im.width) // 2, size - im.height))
        os.makedirs(os.path.dirname(path), exist_ok=True)
        canvas.save(path, "WEBP", quality=quality, method=6)
        return {"src": "/" + rel, "w": size, "h": size}
    except Exception:  # no Pillow, network, bad image: serve the source URL
        return {"src": url, "w": size, "h": size}


# ------------------------------------------------------------------ page shell

def json_ld(graph):
    return ('<script type="application/ld+json">\n%s\n</script>'
            % json.dumps({"@context": "https://schema.org", "@graph": graph}, indent=1, ensure_ascii=False)
            .replace("</", "<\\/"))


def head(root, title, description, canonical, og_image, ld_graph, extra_meta="", css=(), robots="index, follow",
         og_type="article", published=None, modified=None, og_alt=None, og_size=None):
    links = "".join('<link rel="stylesheet" href="%s">\n' % esc(asset(root, c)) for c in css)
    art = ""
    if og_size:
        art += ('<meta property="og:image:width" content="%d">\n<meta property="og:image:height" content="%d">\n'
                % tuple(og_size))
    if og_alt:
        art += ('<meta property="og:image:alt" content="%s">\n<meta name="twitter:image:alt" content="%s">\n'
                % (esc(og_alt), esc(og_alt)))
    if og_type == "article":
        if published:
            art += '<meta property="article:published_time" content="%s">\n' % esc(published)
        if modified:
            art += '<meta property="article:modified_time" content="%s">\n' % esc(modified)
    return (
        '<!DOCTYPE html>\n<html lang="en">\n<head>\n'
        '<meta charset="UTF-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1.0">\n'
        '<title>%(title)s</title>\n'
        '<meta name="description" content="%(desc)s">\n'
        '<meta name="robots" content="%(robots)s">\n'
        '<link rel="canonical" href="%(canon)s">\n'
        '<meta property="og:type" content="%(ogt)s">\n'
        '<meta property="og:site_name" content="TrustMyRecord">\n'
        '<meta property="og:title" content="%(title)s">\n'
        '<meta property="og:description" content="%(desc)s">\n'
        '<meta property="og:url" content="%(canon)s">\n'
        '<meta property="og:image" content="%(img)s">\n'
        '%(art)s'
        '<meta name="twitter:card" content="summary_large_image">\n'
        '<meta name="twitter:site" content="@TrustMyRecord">\n'
        '<meta name="twitter:title" content="%(title)s">\n'
        '<meta name="twitter:description" content="%(desc)s">\n'
        '<meta name="twitter:image" content="%(img)s">\n'
        '<meta name="theme-color" content="#06101f">\n'
        '%(extra)s'
        '<link rel="icon" type="image/png" href="/static/favicon.png">\n'
        '<link rel="preconnect" href="https://fonts.googleapis.com">\n'
        '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n'
        '<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700;800;900&amp;'
        'family=Inter:wght@400;500;600;700;800;900&amp;display=swap" rel="stylesheet">\n'
        '<link rel="stylesheet" href="%(ds)s">\n'
        '<link rel="stylesheet" href="%(nav)s">\n'
        '<link rel="stylesheet" href="%(hdr)s">\n'
        '%(links)s'
        '%(ld)s\n'
        '</head>\n'
    ) % {"title": esc(title), "desc": esc(description), "robots": esc(robots), "canon": esc(canonical),
         "ogt": og_type, "img": esc(og_image), "art": art, "extra": extra_meta,
         "ds": esc(asset(root, "static/css/tmr-ds.css")), "nav": esc(asset(root, "static/css/tmr-navbar.css")),
         "hdr": esc(asset(root, "static/css/tmr-ds-header.css")), "links": links, "ld": json_ld(ld_graph)}


def foot(root):
    return ('<script src="%s"></script>\n<script defer src="%s"></script>\n'
            '<script src="%s"></script>\n<script src="%s"></script>\n</body>\n</html>\n'
            % (esc(asset(root, "static/js/config.js")), esc(asset(root, "static/js/tmr-linkhub.js")),
               esc(asset(root, "static/js/tmr-session.js")), esc(asset(root, "static/js/tmr-ds-nav.js"))))


def breadcrumb_ld(items):
    return {"@type": "BreadcrumbList", "itemListElement": [
        {"@type": "ListItem", "position": i, "name": name, "item": SITE + href}
        for i, (name, href) in enumerate(items, 1)]}


# ------------------------------------------------------------------ markers

def replace_marker(text, key, payload):
    """Swap the body of <!--MK:key-->...<!--/MK:key-->. None when absent."""
    pat = re.compile(r"(<!--MK:%s-->)[\s\S]*?(<!--/MK:%s-->)" % (re.escape(key), re.escape(key)))
    if not pat.search(text):
        return None
    return pat.sub(lambda m: m.group(1) + payload + m.group(2), text, count=1)


def sync_sitemap(root, begin, end, urls):
    """urls: [(loc, lastmod)]. Rewrites only the block between the markers,
    inserting the block before </urlset> the first time."""
    path = os.path.join(root, "sitemap.xml")
    try:
        with open(path, encoding="utf-8") as fh:
            text = fh.read()
    except OSError:
        return False
    body = "".join("  <url><loc>%s</loc><lastmod>%s</lastmod></url>\n" % (esc(u), esc(m)) for u, m in urls)
    block = "  <!-- %s -->\n%s  <!-- %s -->\n" % (begin, body, end)
    pat = re.compile(r"  <!-- %s -->\n[\s\S]*?  <!-- %s -->\n" % (re.escape(begin), re.escape(end)))
    if pat.search(text):
        new = pat.sub(lambda m: block, text, count=1)
    else:
        new = text.replace("</urlset>", block + "</urlset>", 1)
    return write_text(path, new)


# ------------------------------------------------------------------ health

def record_run(path, entry, keep=96):
    log = load_json(path, {"runs": []})
    log.setdefault("runs", []).append(entry)
    del log["runs"][:-keep]
    log["last"] = entry
    if entry.get("status") == "ok":
        log["last_ok"] = entry
    save_json(path, log)
    return log
