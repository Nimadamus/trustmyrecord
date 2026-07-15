#!/usr/bin/env python3
"""
build_forum_threads.py — generate static, crawler-visible forum thread pages at
/forum/thread/<id>/<slug>/index.html for TrustMyRecord (GitHub Pages, no SSR).

Why: every thread lives at /forum/?thread=<id>, a single client-rendered shell
whose canonical is hardcoded to /forum/. Five different threads therefore served
one canonical, one <title>, one H1, and zero thread text in the raw HTML, so no
thread could ever be indexed. This bakes a real, self-canonical, no-JS page per
thread and adds those URLs to sitemap.xml.

The baked HTML is the crawler / no-JS fallback. For JS visitors,
static/js/tmr-forum-thread-hydrate.js loads the real interactive /forum/ app in
place at the clean URL (same pattern as /u/ + tmr-profile-hydrate.js), so replies,
likes, moderation and the composer all keep working.

The thread ID is authoritative and always stays in the URL: slugs are NOT unique
(two threads share 'athletics', three share another), so a slug-only route would
collide. The slug is decorative and keyword-bearing.

INDEXING: every baked page is `index, follow`. This site never uses noindex.

Build only. Does NOT commit or deploy. Run from the repo root:
    python scripts/build_forum_threads.py
Add --dry-run to print what would be written without touching files.
"""
import json, os, sys, html, re, urllib.request, urllib.error, datetime, shutil

# Thread titles contain emoji. Never let a console encoding kill the build.
for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

API  = "https://trustmyrecord-api.onrender.com/api"
SITE = "https://trustmyrecord.com"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TDIR = os.path.join(ROOT, "forum", "thread")
SITEMAP = os.path.join(ROOT, "sitemap.xml")

PAGE = 100          # threads per enumeration request
POSTS_PAGE = 100    # posts per request

UA = {"User-Agent": "TMR-ForumThreadBuilder/1.0", "Accept": "application/json"}


def get(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=45) as f:
        return json.loads(f.read().decode("utf-8"))


def list_threads():
    """Enumerate EVERY thread. Fails closed: if the API's own reported total does
    not match what we collected, abort rather than emit a short list (a short list
    would silently drop real threads out of the sitemap)."""
    out, page = [], 1
    total = None
    while True:
        d = get(f"{API}/forum/threads?limit={PAGE}&page={page}")
        batch = d.get("threads") or []
        pg = d.get("pagination") or {}
        if total is None:
            total = int(pg.get("total", 0))
        out.extend(batch)
        pages = int(pg.get("pages", 1) or 1)
        if page >= pages or not batch:
            break
        page += 1
    if total is None:
        raise SystemExit("ABORT: threads endpoint returned no pagination block")
    if len(out) != total:
        raise SystemExit(
            f"ABORT: enumerated {len(out)} threads but API reports total={total}. "
            "Refusing to build a partial set.")
    # de-dupe by id, newest wins
    seen, uniq = set(), []
    for t in out:
        if t["id"] in seen:
            continue
        seen.add(t["id"]); uniq.append(t)
    return uniq


def fetch_thread(tid):
    d = get(f"{API}/forum/threads/{tid}")
    return d.get("thread", d)


def fetch_posts(tid):
    out, page = [], 1
    while True:
        d = get(f"{API}/forum/threads/{tid}/posts?limit={POSTS_PAGE}&page={page}")
        batch = d.get("posts") or []
        out.extend(batch)
        pg = d.get("pagination") or {}
        pages = int(pg.get("pages", 1) or 1)
        if page >= pages or not batch:
            break
        page += 1
    return out


def slugify(s, fallback="thread"):
    s = re.sub(r"[^a-zA-Z0-9]+", "-", (s or "")).strip("-").lower()
    s = re.sub(r"-{2,}", "-", s)
    return (s[:100].strip("-") or fallback)


def iso_to_dt(v):
    if not v:
        return None
    try:
        return datetime.datetime.fromisoformat(str(v).replace("Z", "+00:00"))
    except Exception:
        return None


def human_date(v):
    d = iso_to_dt(v)
    if not d:
        return ""
    # %-d is not portable (fails on Windows); strip the zero ourselves.
    return f"{d.strftime('%b')} {d.day}, {d.year}"


def iso_date(v):
    d = iso_to_dt(v)
    return d.isoformat() if d else ""


URL_RE = re.compile(r"(https?://[^\s<]+)")


def render_content(raw):
    """Crawler-visible rendering of thread/post body text.

    Mirrors what the live app shows in substance (text + media as links/images)
    without pulling its embed machinery in. The hydrate replaces this wholesale
    for JS visitors, so this only has to be correct, safe and readable.
    """
    e = html.escape(raw or "")

    slots, holder = [], []

    def slot(h):
        holder.append(h)
        return f"\x00SLOT{len(holder)-1}\x00"

    # [img]/[gif]url[/img] -> real <img>
    e = re.sub(r"\[(img|gif)\]\s*(https?://[^\s\]]+?)\s*\[/\1\]",
               lambda m: slot(f'<img class="ft-media" src="{html.escape(m.group(2), quote=True)}" '
                              f'alt="attached {m.group(1)}" loading="lazy">'),
               e, flags=re.I)
    # [video]url[/video] -> link (no iframe in the static fallback)
    e = re.sub(r"\[video\]\s*(https?://[^\s\]]+?)\s*\[/video\]",
               lambda m: slot(f'<a class="ft-vid" href="{html.escape(m.group(1), quote=True)}" '
                              f'rel="nofollow ugc noopener" target="_blank">Watch video</a>'),
               e, flags=re.I)
    # bare urls -> links
    e = URL_RE.sub(lambda m: slot(f'<a href="{html.escape(m.group(1), quote=True)}" '
                                  f'rel="nofollow ugc noopener" target="_blank">{html.escape(m.group(1))}</a>'), e)

    paras = [p.strip() for p in re.split(r"\n{2,}", e) if p.strip()]
    body = "".join(f"<p>{p.replace(chr(10), '<br>')}</p>" for p in paras) or "<p></p>"

    for i, h in enumerate(holder):
        body = body.replace(f"\x00SLOT{i}\x00", h)
    return body


def plain_excerpt(raw, limit=155):
    t = re.sub(r"\[/?[a-zA-Z]+\]", " ", raw or "")
    t = URL_RE.sub(" ", t)
    t = re.sub(r"\s+", " ", t).strip()
    if len(t) <= limit:
        return t
    return t[:limit - 1].rsplit(" ", 1)[0] + "…"


def thread_url(tid, slug):
    return f"{SITE}/forum/thread/{tid}/{slug}/"


def author_block(name, when, is_op=False, headline=None):
    e = html.escape
    who = e(name or "Member")
    prof = f'<a class="ft-au" href="/u/{who}/">{who}</a>' if name else '<span class="ft-au">Member</span>'
    when_h = human_date(when)
    dt = iso_date(when)
    tag = '<span class="ft-op">Original poster</span>' if is_op else ""
    time_h = f'<time datetime="{e(dt)}">{e(when_h)}</time>' if dt else ""
    return f'<div class="ft-meta">{prof}{tag}{time_h}</div>'


def page_html(t, posts):
    e = html.escape
    tid = t["id"]
    slug = t.get("slug") or slugify(t.get("title"))
    title_txt = (t.get("title") or "Thread").strip()
    url = thread_url(tid, slug)
    cat_name = t.get("category_name") or "Forum"
    cat_slug = t.get("category_slug") or ""
    author = t.get("username") or "Member"
    created = t.get("created_at")
    reply_n = len(posts)

    # The thread's own title, verbatim, and nothing else. Members reuse titles
    # ("Athletics" twice, "Weekly leaderboard talk..." three times) exactly like
    # every other sports forum does; that is normal and harmless -- each thread
    # still has its own unique canonical URL. Do NOT bolt category/date/keyword
    # strings onto these titles.
    page_title = f"{title_txt} | TrustMyRecord Forum"
    desc = plain_excerpt(t.get("content")) or (
        f"{title_txt} - sports betting discussion in {cat_name} on the TrustMyRecord forum.")

    # ---- JSON-LD: DiscussionForumPosting (+ breadcrumb) ----
    def person(nm):
        return {"@type": "Person", "name": nm, "url": f"{SITE}/u/{nm}/"}

    ld = {
        "@context": "https://schema.org",
        "@graph": [
            {
                "@type": "DiscussionForumPosting",
                "@id": url + "#thread",
                "mainEntityOfPage": url,
                "headline": title_txt[:110],
                "name": title_txt,
                "text": plain_excerpt(t.get("content"), 500) or title_txt,
                "url": url,
                "datePublished": iso_date(created),
                "dateModified": iso_date(t.get("last_post_at") or created),
                "author": person(author),
                "publisher": {"@type": "Organization", "name": "TrustMyRecord",
                              "url": SITE + "/"},
                "interactionStatistic": [
                    {"@type": "InteractionCounter",
                     "interactionType": "https://schema.org/CommentAction",
                     "userInteractionCount": reply_n},
                    {"@type": "InteractionCounter",
                     "interactionType": "https://schema.org/LikeAction",
                     "userInteractionCount": int(t.get("like_count") or 0)},
                ],
                "comment": [
                    {
                        "@type": "Comment",
                        "@id": f"{url}#post-{p.get('id')}",
                        "text": plain_excerpt(p.get("content"), 500),
                        "datePublished": iso_date(p.get("created_at")),
                        "author": person(p.get("username") or "Member"),
                    } for p in posts[:50] if plain_excerpt(p.get("content"), 500)
                ],
            },
            {
                "@type": "BreadcrumbList",
                "itemListElement": [
                    {"@type": "ListItem", "position": 1, "name": "Forums",
                     "item": f"{SITE}/forum/"},
                    {"@type": "ListItem", "position": 2, "name": cat_name,
                     "item": f"{SITE}/forum/#cat-{cat_slug}" if cat_slug else f"{SITE}/forum/"},
                    {"@type": "ListItem", "position": 3, "name": title_txt, "item": url},
                ],
            },
        ],
    }
    # drop empty comment array so we never ship an empty node
    if not ld["@graph"][0]["comment"]:
        del ld["@graph"][0]["comment"]
    ld_json = json.dumps(ld, indent=2, ensure_ascii=False)

    # ---- static body ----
    op_html = (f'<article class="ft-post" id="post-thread-{tid}-starter">'
               f'{author_block(author, created, is_op=True)}'
               f'<div class="ft-body">{render_content(t.get("content"))}</div>'
               f'</article>')

    reply_html = ""
    if posts:
        items = []
        for p in posts:
            pid = p.get("id")
            items.append(
                f'<article class="ft-post" id="post-{e(str(pid))}">'
                f'{author_block(p.get("username"), p.get("created_at"))}'
                f'<div class="ft-body">{render_content(p.get("content"))}</div>'
                f'</article>')
        reply_html = (f'<section class="ft-block"><h2>{reply_n} '
                      f'{"reply" if reply_n == 1 else "replies"}</h2>'
                      + "".join(items) + '</section>')
    else:
        reply_html = ('<section class="ft-block"><h2>Replies</h2>'
                      '<p class="ft-none">No replies yet. Be the first to post.</p></section>')

    crumb = (f'<nav class="ft-crumb" aria-label="Breadcrumb">'
             f'<a href="/forum/">Forums</a> &rsaquo; '
             + (f'<a href="/forum/#cat-{e(cat_slug)}">{e(cat_name)}</a> &rsaquo; ' if cat_slug
                else f'<span>{e(cat_name)}</span> &rsaquo; ')
             + f'<span>{e(title_txt)}</span></nav>')

    locked = ('<p class="ft-note">This thread is locked.</p>' if t.get("is_locked") else "")

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="index, follow">
<link rel="canonical" href="{url}">
<title>{e(page_title)}</title>
<meta name="description" content="{e(desc)}">
<meta property="og:type" content="article">
<meta property="og:title" content="{e(title_txt)} | TrustMyRecord Forum">
<meta property="og:url" content="{url}">
<meta property="og:description" content="{e(desc)}">
<meta property="og:site_name" content="TrustMyRecord">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="{e(title_txt)}">
<meta name="twitter:description" content="{e(desc)}">
<link rel="icon" type="image/svg+xml" href="/static/favicon.svg">
<link rel="stylesheet" href="/static/css/tmr-sitewide.css">
<script type="application/ld+json">
{ld_json}
</script>
<style>
.ft-wrap{{max-width:900px;margin:0 auto;padding:22px 18px 70px;color:#e8e8f0;font-family:'Inter',system-ui,sans-serif;}}
.ft-wrap a{{color:#00aeff;text-decoration:none;}}
.ft-crumb{{font-size:13px;color:#8890ad;margin:2px 0 14px;}}
.ft-crumb span{{color:#8890ad;}}
.ft-title{{font-family:'Barlow',sans-serif;font-size:27px;line-height:1.25;margin:0 0 6px;}}
.ft-sub{{color:#8890ad;font-size:13px;margin:0 0 18px;}}
.ft-block{{margin-top:26px;}}
.ft-block h2{{font-family:'Barlow',sans-serif;font-size:17px;margin:0 0 12px;color:#c9d0e4;}}
.ft-post{{background:#13131c;border:1px solid #262636;border-radius:12px;padding:14px 16px;margin:0 0 12px;}}
.ft-meta{{display:flex;gap:10px;align-items:center;font-size:12.5px;color:#8890ad;margin:0 0 8px;flex-wrap:wrap;}}
.ft-au{{color:#00aeff;font-weight:600;}}
.ft-op{{background:#1d2740;color:#7fb0ff;border-radius:20px;padding:1px 8px;font-size:11px;}}
.ft-body{{line-height:1.65;font-size:15px;color:#dfe3ef;word-wrap:break-word;overflow-wrap:anywhere;}}
.ft-body p{{margin:0 0 10px;}}
.ft-body p:last-child{{margin-bottom:0;}}
.ft-media{{max-width:100%;height:auto;border-radius:8px;margin:6px 0;}}
.ft-none{{color:#8890ad;font-size:14px;}}
.ft-note{{color:#ffb454;font-size:13px;}}
.ft-cta{{display:inline-block;margin-top:18px;background:#ffd700;color:#1a1200;font-family:'Barlow',sans-serif;font-weight:800;padding:11px 20px;border-radius:11px;}}
.ft-links{{margin-top:16px;font-size:14px;color:#8890ad;}}
@media(max-width:640px){{.ft-title{{font-size:22px;}}.ft-wrap{{padding:16px 14px 60px;}}}}
</style>
</head>
<body>
<main class="ft-wrap">
  {crumb}
  <h1 class="ft-title">{e(title_txt)}</h1>
  <p class="ft-sub">Posted by <a href="/u/{e(author)}/">{e(author)}</a> in
     {(f'<a href="/forum/#cat-{e(cat_slug)}">{e(cat_name)}</a>' if cat_slug else e(cat_name))}
     &middot; {e(human_date(created))} &middot; {reply_n} {"reply" if reply_n == 1 else "replies"}</p>
  {locked}
  <section class="ft-block"><h2>Original post</h2>{op_html}</section>
  {reply_html}
  <a class="ft-cta" href="/register/">Join the discussion</a>
  <p class="ft-links"><a href="/forum/">All TrustMyRecord forums</a> &middot;
     <a href="/handicappers/">Verified handicappers</a> &middot;
     <a href="/leaderboards/">Leaderboards</a></p>
</main>
<script>window.__TMR_FORUM_THREAD_ID={json.dumps(tid)};window.__TMR_FORUM_THREAD_SLUG={json.dumps(slug)};</script>
<script src="/static/js/tmr-forum-thread-hydrate.js" defer></script>
</body>
</html>
"""


def regen_sitemap(entries):
    """entries: list of (url, lastmod_iso_date). Mirrors the BEGIN/END marker
    pattern build_profile_pages.py uses so the two generators never clobber
    each other's block."""
    if not os.path.exists(SITEMAP):
        print("sitemap.xml not found, skipping"); return
    with open(SITEMAP, encoding="utf-8") as f:
        xml = f.read()
    xml = re.sub(r"\s*<!-- BEGIN_THREAD_URLS -->.*?<!-- END_THREAD_URLS -->",
                 "", xml, flags=re.S)
    block = ["  <!-- BEGIN_THREAD_URLS -->"]
    for url, lastmod in entries:
        lm = f"<lastmod>{lastmod}</lastmod>" if lastmod else ""
        block.append(f"  <url><loc>{url}</loc>{lm}"
                     f"<changefreq>weekly</changefreq><priority>0.5</priority></url>")
    block.append("  <!-- END_THREAD_URLS -->")
    xml = xml.replace("</urlset>", "\n".join(block) + "\n</urlset>")
    with open(SITEMAP, "w", encoding="utf-8", newline="\n") as f:
        f.write(xml)
    print(f"sitemap.xml updated with {len(entries)} thread URLs")


def main():
    dry = "--dry-run" in sys.argv
    threads = list_threads()
    print(f"enumerated {len(threads)} threads")

    built, entries, keep = [], [], {}
    for t0 in threads:
        tid = t0["id"]
        try:
            t = fetch_thread(tid)
            posts = fetch_posts(tid)
        except Exception as ex:
            print(f"  ! thread {tid}: fetch failed ({ex}) — skipped, keeping any existing page")
            continue
        slug = t.get("slug") or slugify(t.get("title"))
        keep[str(tid)] = slug
        built.append((tid, slug, t, posts))
        entries.append((thread_url(tid, slug),
                        (iso_date(t.get("last_post_at") or t.get("created_at")) or "")[:10]))

    print(f"buildable: {len(built)} threads")
    if dry:
        for tid, slug, t, posts in built:
            print(f"  + /forum/thread/{tid}/{slug}/  ({len(posts)} replies)  {t.get('title')!r}")
        print("DRY RUN — no files written")
        return

    os.makedirs(TDIR, exist_ok=True)
    for tid, slug, t, posts in built:
        d = os.path.join(TDIR, str(tid), slug)
        os.makedirs(d, exist_ok=True)
        html_out = page_html(t, posts)
        if not html_out.strip():
            raise SystemExit(f"ABORT: empty HTML generated for thread {tid}")
        with open(os.path.join(d, "index.html"), "w", encoding="utf-8", newline="\n") as f:
            f.write(html_out)

    # Remove stale slug dirs (thread renamed) and dirs for threads that are gone.
    removed = 0
    if os.path.isdir(TDIR):
        for idname in os.listdir(TDIR):
            idpath = os.path.join(TDIR, idname)
            if not os.path.isdir(idpath):
                continue
            if idname not in keep:
                shutil.rmtree(idpath); removed += 1; continue
            for slugname in os.listdir(idpath):
                if slugname != keep[idname]:
                    shutil.rmtree(os.path.join(idpath, slugname)); removed += 1

    print(f"wrote {len(built)} thread pages under {TDIR} (all index, follow); removed {removed} stale dirs")
    regen_sitemap(entries)


if __name__ == "__main__":
    main()
