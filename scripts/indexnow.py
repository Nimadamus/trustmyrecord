#!/usr/bin/env python3
"""IndexNow notifications for trustmyrecord.com.

WHAT THIS DOES
Bing, Yandex, Seznam, Naver and the other IndexNow engines are told about an
indexable public URL when it is created, materially changed, deleted or
redirected. It supplements sitemap.xml, it does not replace it.

HOW IT IS TRIGGERED
Every page on the site ships as a commit to main (Atlas, the bake bots, the
MOTD job, hand edits), and GitHub Pages deploys main. So the one place that
sees every publish is the commit range between the last run and the commit
Pages has actually deployed. `.github/workflows/indexnow.yml` runs `auto` on a
schedule; it diffs that range, decides what qualifies, verifies each URL live,
submits in one batch and records state + a JSON log on the `indexnow-state`
branch. Nothing here runs inside a publish, so a failed IndexNow call can
never break one.

WHAT QUALIFIES (all must hold)
  * the URL is in sitemap.xml at the deployed commit (the site's single list
    of canonical, indexable, public URLs, see SEO_INDEXING_PROTOCOL.md), or it
    was in the previous sitemap and is now deleted or redirected
  * its path is not under an excluded prefix (member profiles, forum, account,
    admin, wallet and the like)
  * for a changed page, the MATERIAL fingerprint changed: title, description,
    canonical, robots, headings and visible text with every digit, month and
    weekday removed. Odds ticks, scores, "updated at" stamps and asset hash
    re-pins do not count.
  * live checks: https://trustmyrecord.com only, no query or fragment, 200 with
    no redirect, exact self canonical, no meta robots or X-Robots-Tag noindex,
    robots.txt allows bingbot. A deletion must answer 404/410 live; a redirect
    must answer 301/302/307/308 or carry a meta refresh / canonical elsewhere.
  * not already sent recently: 1h for created/deleted/redirected, 24h for
    updates.

USAGE
  python scripts/indexnow.py auto   --state DIR [--dry-run]
  python scripts/indexnow.py plan   --from SHA --to SHA
  python scripts/indexnow.py submit URL [URL ...] [--state DIR] [--dry-run]
  python scripts/indexnow.py check-key
"""

import argparse
import datetime as dt
import html.parser
import json
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import urllib.robotparser

HOST = "trustmyrecord.com"
ORIGIN = "https://" + HOST
KEY = "4f623a1ebf25c5359dc7bcbc36f6715f"
KEY_LOCATION = "%s/%s.txt" % (ORIGIN, KEY)
ENDPOINT = "https://api.indexnow.org/indexnow"
UA = "TrustMyRecord-IndexNow/1.0 (+https://trustmyrecord.com/)"

MAX_URLS_PER_POST = 10000          # IndexNow protocol limit per request
MAX_URLS_PER_RUN = 500             # our own ceiling; the rest waits a run
RESUBMIT_UPDATE_S = 24 * 3600
RESUBMIT_EVENT_S = 3600
PENDING_TTL_S = 48 * 3600
LOG_KEEP_LINES = 5000
REPO_SLUG = "nimadamus/trustmyrecord"

# Public but user-specific, private, or community chatter. The sitemap keeps
# whatever it keeps; IndexNow is not spent on these.
EXCLUDED_PREFIXES = (
    "/u/", "/forum/", "/forums/", "/profile/", "/account/", "/admin/",
    "/dashboard/", "/login/", "/register/", "/signin/", "/signup/",
    "/wallet/", "/messages/", "/friends/", "/chat/", "/feed/", "/settings/",
    "/notifications/", "/activation/", "/approved/", "/preview/", "/static/",
    "/arena/challenge/", "/betlegend-pro/app/", "/embed/", "/docs/",
)
BLOCKED_HOST_HINTS = ("localhost", "127.0.0.1", "github.io", "pages.dev",
                      "staging", "onrender.com", "vercel.app", "netlify")


def now():
    return time.time()


def iso(ts=None):
    return dt.datetime.fromtimestamp(ts or now(), dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def git(*args, check=True):
    r = subprocess.run(["git"] + list(args), capture_output=True)
    if check and r.returncode != 0:
        raise RuntimeError("git %s failed: %s" % (" ".join(args), r.stderr.decode("utf-8", "replace")[:300]))
    return r.stdout


# ---------------------------------------------------------------- urls

def path_to_url(path):
    """Repo file path -> the URL GitHub Pages serves it at."""
    if path == "index.html":
        return ORIGIN + "/"
    if path.endswith("/index.html"):
        return ORIGIN + "/" + path[:-len("index.html")]
    return ORIGIN + "/" + path


def url_problem(url):
    """Static checks that need no network. Returns a reason or None."""
    try:
        p = urllib.parse.urlsplit(url)
    except ValueError:
        return "unparseable"
    if p.scheme != "https" or p.netloc != HOST:
        return "not https://%s" % HOST
    if any(h in url.lower() for h in BLOCKED_HOST_HINTS):
        return "staging/dev host"
    if p.query or p.fragment or "?" in url or "#" in url:
        return "query string or fragment"
    path = p.path or "/"
    if any(seg.startswith("_") for seg in path.split("/") if seg):
        return "underscore path (not served by Pages)"
    for pre in EXCLUDED_PREFIXES:
        if path.startswith(pre):
            return "excluded prefix %s" % pre
    return None


def sitemap_urls(xml_bytes):
    if not xml_bytes:
        return set()
    text = xml_bytes.decode("utf-8", "replace")
    return {u.strip() for u in re.findall(r"<loc>\s*([^<]+?)\s*</loc>", text)}


# ---------------------------------------------------------------- html

class _Extract(html.parser.HTMLParser):
    SKIP = {"script", "style", "noscript", "svg", "template"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.depth_skip = 0
        self.title = []
        self.in_title = False
        self.heads = []
        self.in_head_tag = None
        self.text = []
        self.meta = {}
        self.canonical = None
        self.refresh = None

    def handle_starttag(self, tag, attrs):
        a = {k.lower(): (v or "") for k, v in attrs}
        if tag in self.SKIP:
            self.depth_skip += 1
        elif tag == "title":
            self.in_title = True
        elif tag in ("h1", "h2", "h3"):
            self.in_head_tag = tag
        elif tag == "meta":
            name = (a.get("name") or a.get("property") or "").lower()
            if name in ("description", "robots", "bingbot", "og:title"):
                self.meta[name] = a.get("content", "")
            if a.get("http-equiv", "").lower() == "refresh":
                self.refresh = a.get("content", "")
        elif tag == "link" and "canonical" in a.get("rel", "").lower().split():
            if self.canonical is None:
                self.canonical = a.get("href", "").strip()

    def handle_endtag(self, tag):
        if tag in self.SKIP and self.depth_skip:
            self.depth_skip -= 1
        elif tag == "title":
            self.in_title = False
        elif tag == self.in_head_tag:
            self.in_head_tag = None

    def handle_data(self, data):
        if self.depth_skip:
            return
        if self.in_title:
            self.title.append(data)
        if self.in_head_tag:
            self.heads.append(data)
        self.text.append(data)


def parse_html(raw):
    p = _Extract()
    try:
        p.feed(raw.decode("utf-8", "replace") if isinstance(raw, bytes) else raw)
        p.close()
    except Exception:
        pass
    return p


_NOISE = re.compile(
    r"\d+|\b(january|february|march|april|may|june|july|august|september|october|november|december|"
    r"jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec|monday|tuesday|wednesday|thursday|friday|"
    r"saturday|sunday|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun|today|tonight|tomorrow|yesterday|"
    r"am|pm|ago|pdt|pst|edt|est|cdt|utc|et|pt|st|nd|rd|th)\b|"
    r"[+\-−.,:/%$()]", re.I)


def _norm(s):
    return re.sub(r"\s+", " ", _NOISE.sub(" ", s or "")).strip().lower()


def material_fingerprint(raw):
    """What a search engine would index, minus numbers and date words.

    Two versions of a page with the same fingerprint differ only in odds,
    scores, records, timestamps or markup, which is not worth a recrawl."""
    if raw is None:
        return None
    p = parse_html(raw)
    parts = [
        "T:" + _norm("".join(p.title)),
        "D:" + _norm(p.meta.get("description", "")),
        "C:" + (p.canonical or ""),
        "R:" + (p.meta.get("robots", "") + p.meta.get("bingbot", "")).lower(),
        "H:" + _norm(" | ".join(p.heads)),
        "B:" + _norm(" ".join(p.text)),
    ]
    return "\n".join(parts)


# ---------------------------------------------------------------- live checks

class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k):
        return None


_OPENER = urllib.request.build_opener(_NoRedirect)


def fetch(url, timeout=25):
    """(status, headers, body) without following redirects. status 0 = network error."""
    sep = "&" if "?" in url else "?"
    # cache-bust through Cloudflare so a just-deployed page is what we check
    req = urllib.request.Request(url + sep + "indexnow_check=%d" % int(now()),
                                 headers={"User-Agent": UA, "Cache-Control": "no-cache"})
    try:
        with _OPENER.open(req, timeout=timeout) as r:
            return r.status, dict(r.headers), r.read(3_000_000)
    except urllib.error.HTTPError as e:
        try:
            body = e.read(200_000)
        except Exception:
            body = b""
        return e.code, dict(e.headers or {}), body
    except Exception as e:
        return 0, {}, str(e).encode()


_ROBOTS = None


def robots_allows(url):
    global _ROBOTS
    if _ROBOTS is None:
        rp = urllib.robotparser.RobotFileParser()
        st, _, body = fetch(ORIGIN + "/robots.txt")
        if st != 200:
            raise RuntimeError("robots.txt returned %s" % st)
        rp.parse(body.decode("utf-8", "replace").splitlines())
        _ROBOTS = rp
    return _ROBOTS.can_fetch("bingbot", url) and _ROBOTS.can_fetch("*", url)


def verify_indexable(url):
    """None if the live URL is safe to submit as created/updated, else a reason."""
    bad = url_problem(url)
    if bad:
        return bad
    if not robots_allows(url):
        return "robots.txt disallows"
    st, headers, body = fetch(url)
    if st != 200:
        return "live status %s" % st
    xrt = " ".join(v for k, v in headers.items() if k.lower() == "x-robots-tag").lower()
    if "noindex" in xrt:
        return "X-Robots-Tag noindex"
    p = parse_html(body)
    robots = (p.meta.get("robots", "") + " " + p.meta.get("bingbot", "")).lower()
    if "noindex" in robots:
        return "meta robots noindex"
    if p.refresh:
        return "meta refresh stub"
    if not p.canonical:
        return "missing canonical"
    if p.canonical != url:
        return "canonical is %s" % p.canonical
    return None


def verify_gone(url):
    """For a URL that left the sitemap: 'deleted', 'redirected', or a reason to skip."""
    bad = url_problem(url)
    if bad:
        return None, bad
    st, headers, body = fetch(url)
    if st in (404, 410):
        return "deleted", None
    if st in (301, 302, 307, 308):
        return "redirected", None
    if st == 200:
        p = parse_html(body)
        if p.refresh or (p.canonical and p.canonical != url):
            return "redirected", None
        return None, "still 200 and self canonical (only dropped from sitemap)"
    return None, "live status %s" % st


# ---------------------------------------------------------------- submit

def check_key():
    st, _, body = fetch(KEY_LOCATION)
    ok = st == 200 and body.decode("utf-8", "replace").strip() == KEY
    return ok, st


def post_indexnow(urls, dry_run=False):
    """One POST per <=10,000 URLs. Returns a list of result dicts; never raises."""
    results = []
    for i in range(0, len(urls), MAX_URLS_PER_POST):
        chunk = urls[i:i + MAX_URLS_PER_POST]
        payload = {"host": HOST, "key": KEY, "keyLocation": KEY_LOCATION, "urlList": chunk}
        res = {"ts": iso(), "endpoint": ENDPOINT, "url_count": len(chunk), "dry_run": dry_run}
        if dry_run:
            res.update(status=None, ok=True, body="dry run, not sent")
            results.append(res)
            continue
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(ENDPOINT, data=data, method="POST", headers={
            "Content-Type": "application/json; charset=utf-8", "User-Agent": UA})
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                res.update(status=r.status, ok=r.status in (200, 202),
                           body=r.read(2000).decode("utf-8", "replace"))
        except urllib.error.HTTPError as e:
            res.update(status=e.code, ok=False, body=e.read(2000).decode("utf-8", "replace"))
        except Exception as e:
            res.update(status=0, ok=False, body="network error: %s" % e)
        results.append(res)
    return results


# ---------------------------------------------------------------- state

def load_state(d):
    path = os.path.join(d, "state.json")
    if os.path.exists(path):
        with open(path, encoding="utf-8") as fh:
            return json.load(fh)
    return {"last_sha": None, "pending": {}, "submitted": {}}


def save_state(d, state):
    os.makedirs(d, exist_ok=True)
    cutoff = now() - 7 * 86400
    state["submitted"] = {u: v for u, v in state["submitted"].items() if v.get("ts", 0) >= cutoff}
    with open(os.path.join(d, "state.json"), "w", encoding="utf-8", newline="\n") as fh:
        json.dump(state, fh, indent=1, sort_keys=True)
        fh.write("\n")


def append_log(d, record):
    line = json.dumps(record, sort_keys=True)
    print("INDEXNOW_LOG " + line)
    if not d:
        return
    os.makedirs(d, exist_ok=True)
    path = os.path.join(d, "log.jsonl")
    lines = []
    if os.path.exists(path):
        with open(path, encoding="utf-8") as fh:
            lines = fh.read().splitlines()
    lines = (lines + [line])[-LOG_KEEP_LINES:]
    with open(path, "w", encoding="utf-8", newline="\n") as fh:
        fh.write("\n".join(lines) + "\n")


def recently_sent(state, url, kind):
    prev = state["submitted"].get(url)
    if not prev:
        return False
    window = RESUBMIT_UPDATE_S if kind == "updated" else RESUBMIT_EVENT_S
    return now() - prev.get("ts", 0) < window and (kind == "updated" or prev.get("kind") == kind)


# ---------------------------------------------------------------- planning

def blob(sha, path):
    r = subprocess.run(["git", "show", "%s:%s" % (sha, path)], capture_output=True)
    return r.stdout if r.returncode == 0 else None


class Blobs:
    """One long lived `git cat-file --batch` instead of a process per file."""

    def __init__(self):
        self.p = subprocess.Popen(["git", "cat-file", "--batch"], stdin=subprocess.PIPE, stdout=subprocess.PIPE)

    def get(self, sha, path):
        self.p.stdin.write(("%s:%s\n" % (sha, path)).encode("utf-8"))
        self.p.stdin.flush()
        header = self.p.stdout.readline().decode("utf-8", "replace").split()
        if len(header) < 3 or header[1] == "missing":
            return None
        size = int(header[2])
        data = self.p.stdout.read(size)
        self.p.stdout.read(1)
        return data

    def close(self):
        self.p.stdin.close()
        self.p.wait()


def plan(old, new):
    """Candidates between two commits: {url: kind} plus skip reasons."""
    old_map = sitemap_urls(blob(old, "sitemap.xml"))
    new_map = sitemap_urls(blob(new, "sitemap.xml"))
    out, skipped = {}, {}
    blobs = Blobs()
    names = git("diff", "--name-status", "--no-renames", old, new, "--", "*.html").decode("utf-8", "replace")
    for line in names.splitlines():
        status, _, path = line.partition("\t")
        url = path_to_url(path)
        if status == "D":
            if url in old_map:
                out[url] = "removed"
            continue
        if url not in new_map:
            continue
        if url not in old_map:
            out[url] = "created"
            continue
        if material_fingerprint(blobs.get(old, path)) == material_fingerprint(blobs.get(new, path)):
            skipped[url] = "non-material change"
            continue
        out[url] = "updated"
    blobs.close()
    for url in new_map - old_map:
        out.setdefault(url, "created")
    for url in old_map - new_map:
        out.setdefault(url, "removed")
    for url in list(out):
        bad = url_problem(url)
        if bad:
            skipped[url] = bad
            del out[url]
    return out, skipped


def github_api(path, token):
    req = urllib.request.Request("https://api.github.com/repos/%s/%s" % (REPO_SLUG, path),
                                 headers={"Accept": "application/vnd.github+json", "User-Agent": UA,
                                          **({"Authorization": "Bearer " + token} if token else {})})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def deployed_sha(token):
    """head_sha of the newest successful GitHub Pages deployment of main.

    The runs list is not reliably ordered (on 2026-09-14 it returned a Sep 7
    deployment first), so pick by created_at instead of taking the first."""
    runs = github_api("actions/runs?event=dynamic&status=success&branch=main&per_page=50", token).get("workflow_runs", [])
    runs = [r for r in runs if r.get("name") == "pages build and deployment" and r.get("head_branch") == "main"]
    return max(runs, key=lambda r: r.get("created_at", ""))["head_sha"] if runs else None


def is_ahead(old, new, token):
    """True when `new` is `old` or a descendant of it. Never diff backwards."""
    if old == new:
        return True
    return github_api("compare/%s...%s" % (old, new), token).get("status") in ("ahead", "identical")


def ensure_commit(sha):
    if subprocess.run(["git", "cat-file", "-e", sha + "^{commit}"], capture_output=True).returncode != 0:
        shallow = git("rev-parse", "--is-shallow-repository").strip() == b"true"
        # a depth-limited fetch into a full clone would make that clone shallow
        git("fetch", "--quiet", *(["--depth=1"] if shallow else []), "origin", sha)


# ---------------------------------------------------------------- run

def process(candidates, state, state_dir, dry_run, source):
    """Verify live, dedupe, submit, log. Mutates state. Never raises on HTTP trouble."""
    submit, skipped = [], {}
    for url, info in sorted(candidates.items()):
        kind = info["kind"]
        if kind == "removed":
            real_kind, why = verify_gone(url)
            if not real_kind:
                skipped[url] = why
                state["pending"].pop(url, None)
                continue
            kind = real_kind
        else:
            why = verify_indexable(url)
            if why:
                skipped[url] = why
                # a brand new page may simply not be deployed/cached yet
                if why.startswith("live status 404") and now() - info.get("first_seen", now()) < PENDING_TTL_S:
                    state["pending"][url] = info
                else:
                    state["pending"].pop(url, None)
                continue
        if recently_sent(state, url, kind):
            skipped[url] = "already submitted recently"
            state["pending"].pop(url, None)
            continue
        submit.append((url, kind))

    overflow = submit[MAX_URLS_PER_RUN:]
    submit = submit[:MAX_URLS_PER_RUN]
    for url, kind in overflow:
        state["pending"][url] = {"kind": kind, "first_seen": candidates[url].get("first_seen", now())}

    results = post_indexnow([u for u, _ in submit], dry_run=dry_run) if submit else []
    ok = all(r["ok"] for r in results)
    for url, kind in submit:
        if ok:
            state["pending"].pop(url, None)
            if not dry_run:
                state["submitted"][url] = {"ts": now(), "kind": kind}
        else:
            prev = state["pending"].get(url) or candidates[url]
            state["pending"][url] = {"kind": "removed" if kind in ("deleted", "redirected") else kind,
                                     "first_seen": prev.get("first_seen", now()),
                                     "attempts": prev.get("attempts", 0) + 1}
    record = {
        "ts": iso(), "source": source, "dry_run": dry_run,
        "submitted_count": len(submit) if ok else 0,
        "url_count": len(submit),
        "urls": [{"url": u, "kind": k} for u, k in submit],
        "http": [{"status": r["status"], "ok": r["ok"], "body": r["body"][:300], "url_count": r["url_count"]}
                 for r in results],
        "skipped": skipped, "deferred": len(overflow), "pending_total": len(state["pending"]),
        "result": "nothing to submit" if not submit else ("ok" if ok else "FAILED"),
    }
    append_log(state_dir, record)
    return record


def cmd_auto(a):
    state = load_state(a.state)
    token = os.environ.get("GITHUB_TOKEN", "")
    target = a.to or deployed_sha(token)
    if not target:
        append_log(a.state, {"ts": iso(), "source": "auto", "result": "no deployed commit found"})
        return 0
    ensure_commit(target)
    if not state.get("last_sha"):
        # First run: start from what is live now. Never blast the whole site.
        state["last_sha"] = target
        append_log(a.state, {"ts": iso(), "source": "auto", "result": "bootstrapped", "last_sha": target})
        if not a.dry_run:
            save_state(a.state, state)
        return 0
    old = state["last_sha"]
    if not a.to and not is_ahead(old, target, token):
        append_log(a.state, {"ts": iso(), "source": "auto", "result": "deployed commit is not ahead of last processed, waiting",
                             "last_sha": old, "deployed": target})
        return 0
    candidates = {u: dict(v) for u, v in state["pending"].items()}
    skipped = {}
    if old != target:
        try:
            ensure_commit(old)
        except RuntimeError as e:
            # history rewritten under us: restart from the live commit, never blast the site
            append_log(a.state, {"ts": iso(), "source": "auto", "result": "last_sha unreachable, reset",
                                 "last_sha": old, "reset_to": target, "error": str(e)[:300]})
            old = target
    if old != target:
        found, skipped = plan(old, target)
        for url, kind in found.items():
            candidates[url] = {"kind": kind, "first_seen": candidates.get(url, {}).get("first_seen", now())}
    print("range %s..%s: %d candidates, %d filtered before live checks" % (old[:10], target[:10], len(candidates), len(skipped)))
    record = process(candidates, state, a.state, a.dry_run, "auto %s..%s" % (old[:10], target[:10]))
    record_skips = len(skipped)
    state["last_sha"] = target
    state["last_run"] = iso()
    if not a.dry_run:
        save_state(a.state, state)
    reasons = {}
    for why in skipped.values():
        k = why.split(" /")[0]
        reasons[k] = reasons.get(k, 0) + 1
    print("result=%s submitted=%d pre-filtered=%d %s" % (record["result"], record["submitted_count"], record_skips, json.dumps(reasons, sort_keys=True)))
    append_log(a.state, {"ts": iso(), "source": "auto prefilter", "prefiltered": reasons})
    return 0


def cmd_plan(a):
    ensure_commit(a.old)
    ensure_commit(a.new)
    found, skipped = plan(a.old, a.new)
    for url, kind in sorted(found.items()):
        print("%-8s %s" % (kind, url))
    from collections import Counter
    print("candidates=%d %s" % (len(found), dict(Counter(found.values()))))
    print("filtered=%d %s" % (len(skipped), dict(Counter(v.split(" /")[0] for v in skipped.values()))))
    return 0


def cmd_submit(a):
    state = load_state(a.state) if a.state else {"last_sha": None, "pending": {}, "submitted": {}}
    candidates = {u: {"kind": "updated" if a.kind == "updated" else "created", "first_seen": now()} for u in a.urls}
    if a.kind == "removed":
        for u in candidates:
            candidates[u]["kind"] = "removed"
    record = process(candidates, state, a.state, a.dry_run, "manual")
    if a.state and not a.dry_run:
        save_state(a.state, state)
    return 0 if record["result"] != "FAILED" else 1


def cmd_check_key(a):
    ok, st = check_key()
    print("key file %s -> HTTP %s, content %s" % (KEY_LOCATION, st, "matches" if ok else "DOES NOT match"))
    return 0 if ok else 1


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("auto")
    p.add_argument("--state", required=True)
    p.add_argument("--to", help="override the deployed commit")
    p.add_argument("--dry-run", action="store_true")
    p.set_defaults(fn=cmd_auto)
    p = sub.add_parser("plan")
    p.add_argument("--from", dest="old", required=True)
    p.add_argument("--to", dest="new", required=True)
    p.set_defaults(fn=cmd_plan)
    p = sub.add_parser("submit")
    p.add_argument("urls", nargs="+")
    p.add_argument("--state")
    p.add_argument("--kind", choices=("created", "updated", "removed"), default="updated")
    p.add_argument("--dry-run", action="store_true")
    p.set_defaults(fn=cmd_submit)
    p = sub.add_parser("check-key")
    p.set_defaults(fn=cmd_check_key)
    a = ap.parse_args()
    try:
        return a.fn(a)
    except Exception as e:  # a notifier must never fail loudly enough to matter
        append_log(getattr(a, "state", None), {"ts": iso(), "source": a.cmd, "result": "ERROR", "error": str(e)[:500]})
        return 0 if a.cmd == "auto" else 1


if __name__ == "__main__":
    sys.exit(main())
