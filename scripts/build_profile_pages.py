#!/usr/bin/env python3
"""
build_profile_pages.py — generate static, crawler-visible public profile pages
at /u/<username>/index.html for TrustMyRecord (GitHub Pages, no SSR).

Why: /profile/?user=X is a single client-rendered shell whose canonical only
rewrites in JS. Search engines need a real, self-canonical, no-JS page per
public verified record. This bakes that page and regenerates sitemap.xml.

Build only. Does NOT commit or deploy. Run from the repo root:
    python scripts/build_profile_pages.py
Add --dry-run to print the eligible set without writing files.
"""
import json, os, sys, html, urllib.request, datetime, re

API   = "https://trustmyrecord-api.onrender.com/api"
SITE  = "https://trustmyrecord.com"
ROOT  = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # repo root
UDIR  = os.path.join(ROOT, "u")
SITEMAP = os.path.join(ROOT, "sitemap.xml")

# Internal/system/test accounts to exclude even if they otherwise look eligible.
INTERNAL_DENYLIST = {"admin", "test", "tmr", "system", "support", "demo"}
# is_admin accounts are excluded UNLESS allowlisted here. BetLegend is the
# brand's flagship public handicapper record, not an internal account.
ADMIN_ALLOWLIST   = {"BetLegend"}

def get(url):
    req = urllib.request.Request(url, headers={"Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=45) as r:
        return json.load(r)

def list_users():
    out, off = [], 0
    while True:
        d = get(f"{API}/users?limit=200&offset={off}")
        u = d.get("users", [])
        out += u
        if len(u) < 200:
            break
        off += 200
    return out

def eligible(detail):
    un = detail.get("username", "")
    if detail.get("verification_status") != "verified":
        return False, "not verified"
    if (detail.get("total_picks") or 0) <= 0:
        return False, "no graded picks"
    if un.lower() in INTERNAL_DENYLIST:
        return False, "internal denylist"
    if detail.get("is_admin") and un not in ADMIN_ALLOWLIST:
        return False, "is_admin (not allowlisted)"
    return True, "ok"

def num(v, default=0):
    try:
        return float(v)
    except (TypeError, ValueError):
        return default

def fmt_units(v):
    v = num(v)
    return ("+" if v > 0 else "") + f"{v:.2f}u"

def page_html(d):
    un    = d["username"]
    disp  = d.get("display_name") or un
    bio   = (d.get("bio") or "").strip()
    avatar= d.get("avatar_url") or ""
    w, l, p = int(num(d.get("wins"))), int(num(d.get("losses"))), int(num(d.get("pushes")))
    tp    = int(num(d.get("total_picks")))
    wr    = num(d.get("win_rate"))
    roi   = num(d.get("roi"))
    units = num(d.get("net_units"))
    rec   = f"{w}-{l}" + (f"-{p}" if p else "")
    url   = f"{SITE}/u/{un}/"
    e     = html.escape
    title = f"{disp} — Verified Betting Record ({rec}, {fmt_units(units)}) | TrustMyRecord"
    desc  = (f"{disp}'s verified sports betting record on TrustMyRecord: {rec} on "
             f"{tp} graded picks, {fmt_units(units)} net units, {roi:.2f}% ROI, "
             f"{wr:.1f}% win rate. Every pick timestamped and graded.")
    desc  = e(desc)
    og_img = f'\n<meta property="og:image" content="{e(avatar)}">' if avatar else ""
    avatar_html = (f'<img class="u-avatar" src="{e(avatar)}" alt="{e(disp)} avatar" '
                   f'width="96" height="96">') if avatar else ""
    bio_html = f'<p class="u-bio">{e(bio)}</p>' if bio else ""
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="index, follow">
<link rel="canonical" href="{url}">
<title>{e(title)}</title>
<meta name="description" content="{desc}">
<meta property="og:type" content="profile">
<meta property="og:title" content="{e(disp)} — Verified Betting Record | TrustMyRecord">
<meta property="og:url" content="{url}">
<meta property="og:description" content="{desc}">{og_img}
<link rel="icon" type="image/svg+xml" href="/static/favicon.svg">
<link rel="stylesheet" href="/static/css/tmr-sitewide.css">
<script type="application/ld+json">
{json.dumps({
  "@context":"https://schema.org","@type":"ProfilePage",
  "mainEntity":{"@type":"Person","name":disp,"url":url,
    **({"image":avatar} if avatar else {})},
  "url":url
})}
</script>
<style>
.u-wrap{{max-width:760px;margin:0 auto;padding:24px 18px 60px}}
.u-head{{display:flex;gap:16px;align-items:center;margin:8px 0 18px}}
.u-avatar{{border-radius:50%;object-fit:cover;border:2px solid #262636}}
.u-name{{font-size:26px;margin:0}}
.u-bio{{color:#9aa;margin:6px 0 0}}
.u-stats{{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:18px 0}}
.u-stat{{background:#13131c;border:1px solid #262636;border-radius:12px;padding:14px}}
.u-stat b{{display:block;font-size:22px}}
.u-stat span{{color:#9aa;font-size:12px;text-transform:uppercase;letter-spacing:.5px}}
.u-cta{{display:inline-block;margin-top:10px;background:#00aeff;color:#001018;
  font-weight:700;padding:10px 18px;border-radius:999px;text-decoration:none}}
</style>
</head>
<body>
<main class="u-wrap">
  <div class="u-head">
    {avatar_html}
    <div>
      <h1 class="u-name">{e(disp)}</h1>
      {bio_html}
    </div>
  </div>
  <section class="u-stats" id="uStats">
    <div class="u-stat"><b>{rec}</b><span>Record (W-L{'-P' if p else ''})</span></div>
    <div class="u-stat"><b>{fmt_units(units)}</b><span>Net Units</span></div>
    <div class="u-stat"><b>{roi:.2f}%</b><span>ROI</span></div>
    <div class="u-stat"><b>{wr:.1f}%</b><span>Win Rate</span></div>
    <div class="u-stat"><b>{tp}</b><span>Graded Picks</span></div>
    <div class="u-stat"><b>{int(num(d.get('current_streak')))}</b><span>Current Streak</span></div>
  </section>
  <p>Every pick on this record is timestamped before the game and graded
     automatically. This is the verified public record for {e(disp)} on TrustMyRecord.</p>
  <a class="u-cta" href="/profile/?user={e(un)}">View full interactive profile &amp; pick history</a>
</main>
<!-- Live hydration: refresh the baked summary from the API for JS users.
     The static numbers above are the durable, crawler-visible source of truth. -->
<script>window.__TMR_PROFILE_USERNAME={json.dumps(un)};</script>
<script src="/static/js/tmr-profile-hydrate.js" defer></script>
</body>
</html>
"""

def main():
    dry = "--dry-run" in sys.argv
    base = list_users()
    pages, skipped = [], []
    for u in base:
        un = u["username"]
        try:
            d = get(f"{API}/users/{un}")
            d = d.get("user", d)
        except Exception as ex:
            skipped.append((un, f"detail fetch failed: {ex}")); continue
        ok, why = eligible(d)
        if not ok:
            skipped.append((un, why)); continue
        pages.append(d)

    print(f"eligible: {len(pages)}  skipped: {len(skipped)}")
    for un, why in skipped:
        print(f"  skip {un}: {why}")
    if dry:
        print("DRY RUN — no files written")
        print("would generate:", [p['username'] for p in pages])
        return

    os.makedirs(UDIR, exist_ok=True)
    for d in pages:
        un = d["username"]
        ddir = os.path.join(UDIR, un)
        os.makedirs(ddir, exist_ok=True)
        with open(os.path.join(ddir, "index.html"), "w", encoding="utf-8", newline="\n") as f:
            f.write(page_html(d))
    print(f"wrote {len(pages)} pages under {UDIR}")

    regen_sitemap([p["username"] for p in pages])

def regen_sitemap(usernames):
    if not os.path.exists(SITEMAP):
        print("sitemap.xml not found, skipping"); return
    with open(SITEMAP, encoding="utf-8") as f:
        xml = f.read()
    # Strip any prior auto-generated profile block, then re-insert.
    xml = re.sub(r"\s*<!-- BEGIN_PROFILE_URLS -->.*?<!-- END_PROFILE_URLS -->",
                 "", xml, flags=re.S)
    block = ["  <!-- BEGIN_PROFILE_URLS -->"]
    for un in sorted(usernames):
        block.append(f"  <url><loc>{SITE}/u/{un}/</loc><changefreq>daily</changefreq>"
                     f"<priority>0.6</priority></url>")
    block.append("  <!-- END_PROFILE_URLS -->")
    block = "\n".join(block)
    xml = xml.replace("</urlset>", block + "\n</urlset>")
    with open(SITEMAP, "w", encoding="utf-8", newline="\n") as f:
        f.write(xml)
    print(f"sitemap.xml updated with {len(usernames)} profile URLs")

if __name__ == "__main__":
    main()
