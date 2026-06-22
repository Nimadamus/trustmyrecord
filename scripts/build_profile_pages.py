#!/usr/bin/env python3
"""
build_profile_pages.py — generate static, crawler-visible public profile pages
at /u/<username>/index.html for TrustMyRecord (GitHub Pages, no SSR).

Why: /profile/?user=X is a single client-rendered shell whose canonical only
rewrites in JS. Search engines need a real, self-canonical, no-JS page per
public verified record. This bakes that page and regenerates sitemap.xml.

Inclusion rule: only profiles with REAL graded history are indexed. Threshold =
GRADED_MIN settled picks (won/lost/push). Profiles below the threshold that
already exist on disk are rewritten as noindex stubs and dropped from the
sitemap, so empty/low-data shells never get indexed. Pending/void picks are
never written into the crawlable SEO HTML.

Build only. Does NOT commit or deploy. Run from the repo root:
    python scripts/build_profile_pages.py
Add --dry-run to print the eligible/excluded sets without writing files.
"""
import json, os, sys, html, urllib.request, datetime, re

API   = "https://trustmyrecord-api.onrender.com/api"
SITE  = "https://trustmyrecord.com"
ROOT  = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # repo root
UDIR  = os.path.join(ROOT, "u")
SITEMAP = os.path.join(ROOT, "sitemap.xml")

GRADED_MIN = 5   # minimum settled (won/lost/push) picks to index a profile

# Internal/system/test accounts to exclude even if they otherwise look eligible.
INTERNAL_DENYLIST = {"admin", "test", "tmr", "system", "support", "demo"}
# is_admin accounts are excluded UNLESS allowlisted here. BetLegend is the
# brand's flagship public handicapper record, not an internal account.
ADMIN_ALLOWLIST   = {"BetLegend"}

SPORT_LABELS = {
    "baseball_mlb": "MLB", "basketball_nba": "NBA", "basketball_wnba": "WNBA",
    "icehockey_nhl": "NHL", "americanfootball_nfl": "NFL",
    "americanfootball_ncaaf": "CFB", "basketball_ncaab": "CBB",
    "tennis": "Tennis",
}
def sport_label(key):
    key = key or ""
    if key in SPORT_LABELS:
        return SPORT_LABELS[key]
    if key.startswith("soccer"):
        return "Soccer"
    if key.startswith("tennis"):
        return "Tennis"
    return key.replace("_", " ").upper() if key else "Other"

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

def num(v, default=0.0):
    try:
        return float(v)
    except (TypeError, ValueError):
        return default

def graded_count(d):
    """Settled picks = wins+losses+pushes (the public graded record)."""
    return int(num(d.get("wins"))) + int(num(d.get("losses"))) + int(num(d.get("pushes")))

def eligible(detail):
    un = detail.get("username", "")
    if detail.get("verification_status") != "verified":
        return False, "not verified"
    if un.lower() in INTERNAL_DENYLIST:
        return False, "internal denylist"
    if detail.get("is_admin") and un not in ADMIN_ALLOWLIST:
        return False, "is_admin (not allowlisted)"
    g = graded_count(detail)
    if g < GRADED_MIN:
        return False, f"only {g} graded picks (< {GRADED_MIN})"
    return True, "ok"

def fetch_picks(un):
    """All public picks for a user (paginate; API caps limit at 100)."""
    out, off = [], 0
    while off < 400:
        try:
            d = get(f"{API}/picks?username={un}&limit=100&offset={off}")
        except Exception:
            break
        ps = d.get("picks", [])
        out += ps
        if len(ps) < 100:
            break
        off += 100
    return out

def amer_to_dec(o):
    o = num(o)
    if o > 0:
        return 1 + o / 100.0
    if o < 0:
        return 1 + 100.0 / abs(o)
    return 0.0

def dec_to_amer(d):
    if d <= 1:
        return 0
    return round((d - 1) * 100) if d >= 2 else round(-100 / (d - 1))

def fmt_amer(o):
    o = int(round(o))
    return (f"+{o}" if o > 0 else str(o))

def fmt_units(v):
    v = num(v)
    return ("+" if v > 0 else "") + f"{v:.2f}u"

MONTHS = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
def short_date(iso):
    try:
        t = datetime.datetime.fromisoformat(str(iso).replace("Z", "+00:00"))
        return f"{MONTHS[t.month]} {t.day}"
    except Exception:
        return ""

def short_team(name):
    name = (name or "").strip()
    return name.split()[-1] if name else ""

def derive(picks):
    """Return (graded_list_recent5, avg_odds_amer, sport_rows) from graded picks."""
    graded = [p for p in picks if p.get("status") in ("won", "lost", "push")]
    decs = [amer_to_dec(p.get("odds_snapshot")) for p in graded if num(p.get("odds_snapshot"))]
    avg_amer = dec_to_amer(sum(decs) / len(decs)) if decs else None
    # sport breakdown: count + W-L-P per sport
    by = {}
    for p in graded:
        lab = sport_label(p.get("sport_key"))
        rec = by.setdefault(lab, [0, 0, 0])
        st = p.get("status")
        if st == "won": rec[0] += 1
        elif st == "lost": rec[1] += 1
        else: rec[2] += 1
    sport_rows = sorted(by.items(), key=lambda kv: sum(kv[1]), reverse=True)
    # recent 5 graded by graded_at desc
    graded_sorted = sorted(graded, key=lambda p: p.get("graded_at") or "", reverse=True)
    return graded_sorted[:5], avg_amer, sport_rows, len(graded)

def page_html(d, recent, avg_amer, sport_rows):
    e = html.escape
    un    = d["username"]
    disp  = d.get("display_name") or un
    bio   = (d.get("bio") or "").strip()
    avatar= d.get("avatar_url") or ""
    if avatar.startswith("data:") or len(avatar) > 300:
        avatar = ""
    w, l, p = int(num(d.get("wins"))), int(num(d.get("losses"))), int(num(d.get("pushes")))
    tp    = graded_count(d)
    wr    = num(d.get("win_rate"))
    roi   = num(d.get("roi"))
    units = num(d.get("net_units"))
    cur   = int(num(d.get("current_streak")))
    best  = int(num(d.get("best_streak")))
    rec   = f"{w}-{l}" + (f"-{p}" if p else "")
    url   = f"{SITE}/u/{un}/"
    title = f"{disp} - Verified Sports Betting Record, ROI & Public Picks | TrustMyRecord"
    desc  = (f"View {disp}'s verified TrustMyRecord betting record, including graded picks, "
             f"units, ROI, win percentage, streaks, and public performance history.")
    desc  = e(desc)
    og_img = f'\n<meta property="og:image" content="{e(avatar)}">' if avatar else ""
    avatar_html = (f'<img class="u-avatar" src="{e(avatar)}" alt="{e(disp)} avatar" '
                   f'width="84" height="84">') if avatar else ""
    bio_html = f'<p class="u-bio">{e(bio)}</p>' if bio else ""

    def stat(big, lab):
        return f'<div class="u-stat"><b>{e(big)}</b><span>{e(lab)}</span></div>'
    stats = [
        stat(rec, f"Record (W-L{'-P' if p else ''})"),
        stat(fmt_units(units), "Net Units"),
        stat(f"{roi:.2f}%", "ROI"),
        stat(f"{wr:.1f}%", "Win Rate"),
        stat(str(tp), "Graded Picks"),
        stat(("W" + str(cur)) if cur > 0 else ("L" + str(abs(cur))) if cur < 0 else "0", "Current Streak"),
    ]
    if best:
        stats.append(stat("W" + str(best), "Best Streak"))
    if avg_amer is not None:
        stats.append(stat(fmt_amer(avg_amer), "Avg Odds"))
    stats_html = "".join(stats)

    sport_html = ""
    if sport_rows:
        rows = "".join(
            f'<tr><td>{e(lab)}</td><td>{c[0]}-{c[1]}' + (f'-{c[2]}' if c[2] else '') + f'</td><td>{c[0]+c[1]+c[2]}</td></tr>'
            for lab, c in sport_rows)
        sport_html = (
            '<section class="u-block"><h2>Sport breakdown</h2>'
            '<table class="u-table"><thead><tr><th>Sport</th><th>Record</th><th>Graded</th></tr></thead>'
            f'<tbody>{rows}</tbody></table></section>')

    recent_html = ""
    if recent:
        rows = []
        for r in recent:
            matchup = f"{short_team(r.get('away_team'))} @ {short_team(r.get('home_team'))}".strip(" @")
            sel = (r.get("selection") or "").strip()
            line = (r.get("line_snapshot") or "").strip()
            pick = (sel + (f" {line}" if line and line not in sel else "")).strip()
            odds = fmt_amer(num(r.get("odds_snapshot"))) if num(r.get("odds_snapshot")) else ""
            st = r.get("status")
            badge = {"won": "WON", "lost": "LOST", "push": "PUSH"}.get(st, st.upper())
            cls = {"won": "win", "lost": "loss", "push": "push"}.get(st, "")
            d_s = short_date(r.get("graded_at") or r.get("commence_time"))
            rows.append(
                f'<tr><td>{e(d_s)}</td><td>{e(sport_label(r.get("sport_key")))}</td>'
                f'<td>{e(matchup)}</td><td>{e(pick)}{(" (" + odds + ")") if odds else ""}</td>'
                f'<td>{e(fmt_units(num(r.get("units"))))}</td><td class="u-{cls}">{e(badge)}</td></tr>')
        recent_html = (
            '<section class="u-block"><h2>Recent graded picks</h2>'
            '<table class="u-table"><thead><tr><th>Date</th><th>Sport</th><th>Matchup</th>'
            '<th>Pick</th><th>Units</th><th>Result</th></tr></thead>'
            f'<tbody>{"".join(rows)}</tbody></table>'
            '<p class="u-note">Graded picks only. Pending picks are excluded until they settle.</p></section>')

    ld = json.dumps({
        "@context": "https://schema.org", "@type": "ProfilePage",
        "mainEntity": {"@type": "Person", "name": disp, "url": url,
                       **({"image": avatar} if avatar else {})},
        "url": url,
    })
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
<meta property="og:title" content="{e(disp)} - Verified Sports Betting Record | TrustMyRecord">
<meta property="og:url" content="{url}">
<meta property="og:description" content="{desc}">{og_img}
<link rel="icon" type="image/svg+xml" href="/static/favicon.svg">
<link rel="stylesheet" href="/static/css/tmr-sitewide.css">
<script type="application/ld+json">
{ld}
</script>
<style>
.u-wrap{{max-width:820px;margin:0 auto;padding:24px 18px 70px;color:#e8e8f0;font-family:'Inter',system-ui,sans-serif;}}
.u-wrap a{{color:#00aeff;text-decoration:none;}}
.u-head{{display:flex;gap:16px;align-items:center;margin:8px 0 6px;}}
.u-avatar{{border-radius:50%;object-fit:cover;border:2px solid #262636;}}
.u-name{{font-size:26px;margin:0;font-family:'Barlow',sans-serif;}}
.u-bio{{color:#9aa;margin:6px 0 0;}}
.u-tag{{color:#8890ad;font-size:13px;margin:2px 0 0;}}
.u-stats{{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:18px 0;}}
.u-stat{{background:#13131c;border:1px solid #262636;border-radius:12px;padding:14px;}}
.u-stat b{{display:block;font-size:20px;}}
.u-stat span{{color:#9aa;font-size:11px;text-transform:uppercase;letter-spacing:.5px;}}
.u-block{{margin-top:26px;}}
.u-block h2{{font-family:'Barlow',sans-serif;font-size:18px;margin:0 0 10px;}}
.u-table{{width:100%;border-collapse:collapse;font-size:14px;background:#13131c;border:1px solid #262636;border-radius:12px;overflow:hidden;}}
.u-table th,.u-table td{{text-align:left;padding:9px 11px;border-bottom:1px solid #20202e;}}
.u-table th{{color:#8890ad;font-size:11px;text-transform:uppercase;letter-spacing:.4px;}}
.u-win{{color:#00ff88;font-weight:700;}}.u-loss{{color:#ff5566;font-weight:700;}}.u-push{{color:#9aa;font-weight:700;}}
.u-note{{color:#8890ad;font-size:12px;margin:8px 0 0;}}
.u-how{{background:#13131c;border:1px solid #262636;border-radius:12px;padding:16px 18px;color:#a9b0c8;line-height:1.6;font-size:14px;margin-top:26px;}}
.u-cta{{display:inline-block;margin-top:14px;background:#ffd700;color:#1a1200;font-family:'Barlow',sans-serif;
  font-weight:800;padding:12px 22px;border-radius:11px;}}
.u-links{{margin-top:14px;font-size:14px;}}
@media(max-width:640px){{.u-stats{{grid-template-columns:repeat(2,1fr);}}.u-table{{font-size:12.5px;}}}}
</style>
</head>
<body>
<main class="u-wrap">
  <div class="u-head">
    {avatar_html}
    <div>
      <h1 class="u-name">{e(disp)}</h1>
      <p class="u-tag">@{e(un)} · Verified sports betting record</p>
      {bio_html}
    </div>
  </div>
  <section class="u-stats">
    {stats_html}
  </section>
  {sport_html}
  {recent_html}
  <div class="u-how">
    <strong>How this record is verified:</strong> every pick {e(disp)} makes is timestamped and
    locked before the game starts, then graded automatically when the result settles. Wins and
    losses both stay on this public record, so the units, ROI, and win percentage above reflect
    the full graded history, not a highlight reel.
  </div>
  <a class="u-cta" href="/register/">Start Your Free Verified Record</a>
  <div class="u-links">
    <a href="/leaderboards/">Verified Leaderboards</a> ·
    <a href="/handicappers/">Handicappers</a> ·
    <a href="/how-it-works/">How It Works</a> ·
    <a href="/profile/?user={e(un)}">Full interactive profile</a>
  </div>
</main>
<script>window.__TMR_PROFILE_USERNAME={json.dumps(un)};</script>
<script src="/static/js/tmr-profile-hydrate.js" defer></script>
</body>
</html>
"""

def noindex_html(un):
    """Slim noindex stub for an existing /u page that no longer qualifies."""
    e = html.escape
    url = f"{SITE}/u/{un}/"
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex, follow">
<link rel="canonical" href="{url}">
<title>{e(un)} | TrustMyRecord</title>
<meta name="description" content="This TrustMyRecord profile does not yet have enough graded pick history to be featured.">
<link rel="icon" type="image/svg+xml" href="/static/favicon.svg">
<link rel="stylesheet" href="/static/css/tmr-sitewide.css">
</head>
<body>
<main style="max-width:640px;margin:0 auto;padding:48px 20px;color:#e8e8f0;font-family:'Inter',system-ui,sans-serif;">
  <h1 style="font-family:'Barlow',sans-serif;">@{e(un)}</h1>
  <p style="color:#9aa;line-height:1.6;">This public profile does not yet have enough graded pick history to be
  featured. Records are published once a member has at least {GRADED_MIN} graded picks.</p>
  <p><a href="/profile/?user={e(un)}" style="color:#00aeff;">View the live interactive profile</a> ·
     <a href="/leaderboards/" style="color:#00aeff;">Verified Leaderboards</a></p>
</main>
<script>window.__TMR_PROFILE_USERNAME={json.dumps(un)};</script>
<script src="/static/js/tmr-profile-hydrate.js" defer></script>
</body>
</html>
"""

def main():
    dry = "--dry-run" in sys.argv
    base = list_users()
    eligible_pages, excluded = [], []
    for u in base:
        un = u["username"]
        try:
            d = get(f"{API}/users/{un}")
            d = d.get("user", d)
        except Exception as ex:
            excluded.append((un, f"detail fetch failed: {ex}")); continue
        ok, why = eligible(d)
        if not ok:
            excluded.append((un, why)); continue
        eligible_pages.append(d)

    elig_names = {d["username"] for d in eligible_pages}
    # existing on-disk /u pages that are no longer eligible -> noindex
    existing = set(os.listdir(UDIR)) if os.path.isdir(UDIR) else set()
    to_noindex = sorted(n for n in existing
                        if os.path.isdir(os.path.join(UDIR, n)) and n not in elig_names)

    print(f"eligible (>= {GRADED_MIN} graded): {len(eligible_pages)}")
    for d in sorted(eligible_pages, key=lambda x: x["username"].lower()):
        print(f"  + {d['username']}  ({graded_count(d)} graded)")
    print(f"excluded: {len(excluded)}")
    for un, why in sorted(excluded):
        print(f"  - {un}: {why}")
    print(f"existing pages to noindex (low-data, kept on disk): {len(to_noindex)} -> {to_noindex}")
    if dry:
        print("DRY RUN — no files written")
        return

    os.makedirs(UDIR, exist_ok=True)
    for d in eligible_pages:
        un = d["username"]
        recent, avg_amer, sport_rows, _ = derive(fetch_picks(un))
        ddir = os.path.join(UDIR, un)
        os.makedirs(ddir, exist_ok=True)
        with open(os.path.join(ddir, "index.html"), "w", encoding="utf-8", newline="\n") as f:
            f.write(page_html(d, recent, avg_amer, sport_rows))
    for un in to_noindex:
        with open(os.path.join(UDIR, un, "index.html"), "w", encoding="utf-8", newline="\n") as f:
            f.write(noindex_html(un))
    print(f"wrote {len(eligible_pages)} indexable + {len(to_noindex)} noindex pages under {UDIR}")

    regen_sitemap(sorted(elig_names))

def regen_sitemap(usernames):
    if not os.path.exists(SITEMAP):
        print("sitemap.xml not found, skipping"); return
    with open(SITEMAP, encoding="utf-8") as f:
        xml = f.read()
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
    print(f"sitemap.xml updated with {len(usernames)} eligible profile URLs")

if __name__ == "__main__":
    main()
