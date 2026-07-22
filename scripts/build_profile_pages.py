#!/usr/bin/env python3
"""
build_profile_pages.py — generate static, crawler-visible public profile pages
at /u/<username>/index.html for TrustMyRecord (GitHub Pages, no SSR).

Why: /profile/?user=X is a single client-rendered shell whose canonical only
rewrites in JS. Search engines need a real, self-canonical, no-JS page per
public verified record. This bakes that page and regenerates sitemap.xml.

INDEXING: every public profile is `index, follow`. This site NEVER uses noindex,
on any page, for any reason (owner rule, restated July 15 2026: "There's no reason
to noindex anything. If Google doesn't want to index them they won't."). The old
GRADED_MIN noindex gate is GONE. GRADED_MIN now only selects which TEMPLATE a
profile gets -- full (>= GRADED_MIN settled picks) or compact -- never whether it
may be indexed. Do not reintroduce a noindex gate here under any rationale.

Sitemap: only full profiles are submitted. Compact profiles are still fully
indexable and reachable via internal links; they are simply not listed. That is a
submission choice, NOT a noindex, and it is deliberate (owner instruction).

Pending/void picks are never written into the crawlable SEO HTML.

DESIGN SYSTEM (July 20, 2026): these pages are GENERATED, so the design system
has to be applied HERE, not to the output. Hand-editing /u/*/index.html is
pointless — the scheduled prerender workflow regenerates all 59 files and reverts
it (that is exactly what happened once already). Every page now emits
tmr-ds.css + tmr-ds-user.css + tmr-ds-nav.js and `<body class="tmr-ds">`, so the
crawler/no-JS view carries the shared nav and footer instead of shipping with no
site header at all. Asset URLs are content-hashed and read from
static/ds-assets.json at build time, so a CSS change never leaves these stale.

Build only. Does NOT commit or deploy. Run from the repo root:
    python scripts/build_profile_pages.py
Add --dry-run to print the eligible/excluded sets without writing files.
"""
import json, os, sys, html, urllib.request, urllib.parse, datetime, re

API   = "https://trustmyrecord-api.onrender.com/api"
SITE  = "https://trustmyrecord.com"
ROOT  = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # repo root


def _ds_assets():
    """Content-hashed design-system asset URLs, read from the manifest that
    scripts/build_ds_assets.py writes. Hashing is required because the CDN in
    front of this site caches by path and ignores the query string, so `?v=`
    bumps serve stale bytes. Falls back to the unhashed names if the manifest is
    missing, which still renders correctly, just without cache-busting."""
    try:
        with open(os.path.join(ROOT, "static", "ds-assets.json"), encoding="utf-8") as fh:
            m = json.load(fh)
        return (m["static/css/tmr-ds.css"],
                m["static/css/tmr-ds-user.css"],
                m["static/js/tmr-ds-nav.js"])
    except Exception:
        return ("/static/css/tmr-ds.css",
                "/static/css/tmr-ds-user.css",
                "/static/js/tmr-ds-nav.js")


_DS_CSS, _DS_USER_CSS, _DS_NAV = _ds_assets()

# Head block: the design system replaces tmr-sitewide.css. These pages also named
# 'Inter' and 'Barlow' in CSS while loading NEITHER, so they rendered in the
# system fallback font from the day they were created; the real request is here.
DS_HEAD = (
    '<link rel="preconnect" href="https://fonts.googleapis.com">\n'
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n'
    '<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700;800;900'
    '&amp;family=Inter:wght@400;500;600;700;800;900&amp;display=swap" rel="stylesheet">\n'
    f'<link rel="stylesheet" href="{_DS_CSS}">\n'
    f'<link rel="stylesheet" href="{_DS_USER_CSS}">\n'
    # NAV_20260721: shared breadcrumb / related-links / footer component.
    '<link rel="stylesheet" href="/static/css/tmr-linkhub.css?v=20260721nav4">'
)
# Shared nav + footer, so these pages are no longer chrome-less dead ends.
DS_FOOT = (f'<script src="{_DS_NAV}"></script>'
           '<script defer src="/static/js/tmr-linkhub.js?v=20260721nav4"></script>')

# ---------------------------------------------------------------------------
# SHARE_SYSTEM_PHASE1_20260721
# Share assets + the per-member Open Graph card endpoint. The card is rendered
# by the API from this member's live ledger; if that renderer is unavailable
# the endpoint serves the existing static site card, so a preview degrades
# rather than breaking.
# ---------------------------------------------------------------------------
OG_CARD_BASE = "https://trustmyrecord-api.onrender.com/api/share/og"
SHARE_HEAD = (
    '<link rel="stylesheet" href="/static/css/tmr-share.css?v=20260721share1">\n'
    '<script defer src="/static/js/tmr-share.js?v=20260721share1"></script>'
)


def share_description(disp, w, l, p, graded, units, roi):
    """Social description built from the numbers already baked into the page.

    Never invents a stat: a member with nothing graded yet gets the plain
    verification sentence instead of a zeroed record."""
    if not graded:
        return (f"{disp} on TrustMyRecord. Every pick is locked before game time and graded "
                f"from the final result — no edits, no deletions.")
    rec = f"{w}-{l}" + (f"-{p}" if p else "")
    units_s = ("+" if units > 0 else "") + f"{units:.2f}"
    roi_s = ("+" if roi > 0 else "") + f"{roi:.2f}"
    return (f"{disp}: {rec} on {graded} graded picks, {units_s} units, {roi_s}% ROI. "
            f"Every pick is locked before game time and graded from the final result "
            f"on TrustMyRecord.")


def share_button(un, disp):
    """Share control for a baked profile page. Real button, real aria-label,
    keyboard reachable; the menu itself comes from tmr-share.js."""
    e = html.escape
    return (
        '<div class="u-actions">'
        f'<button type="button" class="tmrsh-btn" data-tmr-share data-share-type="profile" '
        f'data-share-id="{e(un)}" data-share-url="{SITE}/u/{urllib.parse.quote(un)}/" '
        f'title="Share this profile" aria-label="Share {e(disp)}’s verified record">'
        '<svg viewBox="0 0 24 24" aria-hidden="true" width="15" height="15" fill="currentColor">'
        '<path d="M18 16.1c-.8 0-1.5.3-2 .8l-7.1-4.2c.1-.2.1-.5.1-.7s0-.5-.1-.7L16 7.1c.5.5 1.2.8 2 .8 '
        '1.7 0 3-1.3 3-3s-1.3-3-3-3-3 1.3-3 3c0 .2 0 .5.1.7L8 9.8c-.5-.5-1.2-.8-2-.8-1.7 0-3 1.3-3 3s1.3 3 3 3c.8 0 '
        '1.5-.3 2-.8l7.1 4.2c-.1.2-.1.4-.1.7 0 1.6 1.3 2.9 2.9 2.9s2.9-1.3 2.9-2.9-1.2-3-2.8-3z"/></svg>'
        '<span>Share</span></button></div>'
    )
UDIR  = os.path.join(ROOT, "u")
SITEMAP = os.path.join(ROOT, "sitemap.xml")

GRADED_MIN = 25   # minimum settled (won/lost/push) picks to index a profile (trust-first)

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

SPORT_TRACKER = {
    "MLB": "/mlb-pick-tracker/", "NBA": "/nba-pick-tracker/",
    "NFL": "/nfl-pick-tracker/", "NHL": "/nhl-pick-tracker/",
    "Soccer": "/soccer-pick-tracker/",
}
def sport_cell(lab):
    """Sport label linked to its pick-tracker hub when one exists (internal mesh)."""
    href = SPORT_TRACKER.get(lab)
    return f'<a href="{href}">{html.escape(lab)}</a>' if href else html.escape(lab)

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
    while off < 900:
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

def fetch_metrics(un):
    """Live aggregator — the SAME source the /profile/ dashboard and the
    /handicappers/ leaderboard (pick-log recompute) use, so the baked public
    numbers match them instead of the lagging materialized /api/users columns."""
    try:
        return get(f"{API}/users/{un}/metrics")
    except Exception:
        return None

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

def page_html(d, recent, avg_amer, sport_rows, m=None, siblings=None):
    e = html.escape
    un    = d["username"]
    disp  = d.get("display_name") or un
    bio   = (d.get("bio") or "").strip()
    avatar= d.get("avatar_url") or ""
    if avatar.startswith("data:") or len(avatar) > 300:
        avatar = ""
    # Prefer the live aggregator (metrics) so the baked numbers match the
    # leaderboard + own dashboard; fall back to the /api/users detail columns.
    summ = (m or {}).get("summary") or {}
    strk = (m or {}).get("streaks") or {}
    if summ:
        w = int(num(summ.get("wins")))
        l = int(num(summ.get("losses")))
        p = int(num(summ.get("pushes")))
        tp = int(num(summ.get("total_picks"))) or (w + l + p)
        wr = num(summ.get("win_rate"))
        roi = num(summ.get("roi"))
        units = num(summ.get("net_units"))
        cur = int(num(strk.get("current", d.get("current_streak"))))
        best = int(num(strk.get("best", d.get("best_streak"))))
        if summ.get("avg_odds") is not None:
            avg_amer = int(num(summ.get("avg_odds")))
    else:
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
    # SHARE_SYSTEM_PHASE1_20260721: one card PER MEMBER, rendered on demand by
    # the API from this member's live ledger, instead of the single generic
    # og-profile.png that every profile used to share. The endpoint falls back
    # to that static image if the renderer is unavailable, so this can only
    # improve a preview, never break one.
    og_card = OG_CARD_BASE + "/profile/" + urllib.parse.quote(un) + ".png"
    og_desc = e(share_description(disp, w, l, p, tp, units, roi))
    og_img = (f'\n<meta property="og:image" content="{og_card}">'
              '\n<meta property="og:image:width" content="1200">'
              '\n<meta property="og:image:height" content="630">'
              f'\n<meta property="og:image:alt" content="{e(disp)} - verified record on TrustMyRecord">'
              '\n<meta name="twitter:card" content="summary_large_image">'
              f'\n<meta name="twitter:title" content="{e(disp)} - Verified Sports Betting Record | TrustMyRecord">'
              f'\n<meta name="twitter:description" content="{og_desc}">'
              f'\n<meta name="twitter:image" content="{og_card}">')
    avatar_html = (f'<img class="u-avatar" src="{e(avatar)}" alt="{e(disp)} avatar" '
                   f'width="84" height="84">') if avatar else ""
    bio_html = f'<p class="u-bio">{e(bio)}</p>' if bio else ""
    share_html = share_button(un, disp)

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

    # Sport breakdown: rich (units/ROI/win%) when metrics is available, else
    # the record-only fallback from the pick log.
    sport_html = ""
    by_sport = (m or {}).get("splits", {}).get("by_sport") if m else None
    if by_sport:
        def sgn_u(v):
            v = num(v); return ("+" if v > 0 else "") + f"{v:.2f}u"
        def sgn_p(v):
            v = num(v); return ("+" if v > 0 else "") + f"{v:.2f}%"
        def clz(v):
            v = num(v); return "u-win" if v > 0 else "u-loss" if v < 0 else "u-push"
        # Merge competitions that share a display label (e.g. all soccer_* -> Soccer).
        merged = {}
        order = []
        for s in by_sport:
            lab = sport_label(s.get("key"))
            if lab not in merged:
                merged[lab] = {"w": 0, "l": 0, "p": 0, "t": 0, "net": 0.0, "risked": 0.0}
                order.append(lab)
            g = merged[lab]
            g["w"] += int(num(s.get("wins"))); g["l"] += int(num(s.get("losses")))
            g["p"] += int(num(s.get("pushes"))); g["t"] += int(num(s.get("total")))
            g["net"] += num(s.get("net")); g["risked"] += num(s.get("risked"))
        srows = []
        for lab in order:
            g = merged[lab]
            roi = (g["net"] / g["risked"] * 100) if g["risked"] else 0.0
            wr = (g["w"] / (g["w"] + g["l"]) * 100) if (g["w"] + g["l"]) else 0.0
            srows.append((lab, g, roi, wr))
        srows.sort(key=lambda x: -x[1]["t"])
        rows = "".join(
            f'<tr><td>{sport_cell(lab)}</td>'
            f'<td>{g["w"]}-{g["l"]}' + (f'-{g["p"]}' if g["p"] else '') + '</td>'
            f'<td>{g["t"]}</td>'
            f'<td class="{clz(g["net"])}">{e(sgn_u(g["net"]))}</td>'
            f'<td class="{clz(roi)}">{e(sgn_p(roi))}</td>'
            f'<td>{wr:.1f}%</td></tr>'
            for lab, g, roi, wr in srows)
        sport_html = (
            '<section class="u-block"><h2>Sport-by-sport breakdown</h2>'
            '<div class="u-scroll"><table class="u-table"><thead><tr><th>Sport</th><th>Record</th>'
            '<th>Picks</th><th>Units</th><th>ROI</th><th>Win %</th></tr></thead>'
            f'<tbody>{rows}</tbody></table></div></section>')
    elif sport_rows:
        rows = "".join(
            f'<tr><td>{sport_cell(lab)}</td><td>{c[0]}-{c[1]}' + (f'-{c[2]}' if c[2] else '') + f'</td><td>{c[0]+c[1]+c[2]}</td></tr>'
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

    related_html = ""
    if siblings:
        sib_links = " · ".join(
            f'<a href="/u/{e(s)}/">{e(s)}</a>' for s in siblings[:6])
        related_html = (
            '<section class="u-block"><h2>Compare verified records</h2>'
            f'<p class="u-links">{sib_links}</p></section>')
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
<meta property="og:description" content="{og_desc}">{og_img}
<link rel="icon" type="image/svg+xml" href="/static/favicon.svg">
{DS_HEAD}
{SHARE_HEAD}
<script type="application/ld+json">
{ld}
</script>
<style>
.u-wrap{{max-width:820px;margin:0 auto;padding:24px 18px 70px;color:#e8e8f0;font-family:'Inter',system-ui,sans-serif;}}
.u-wrap a{{color:#00aeff;text-decoration:none;}}
.u-crumb{{font-size:13px;color:#8890ad;margin:0 0 14px;}}
.u-crumb span{{color:#c9d0e4;}}
.u-head{{display:flex;gap:16px;align-items:center;margin:8px 0 6px;}}
.u-actions{{margin:2px 0 10px;}}
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
.u-scroll{{overflow-x:auto;}}
.u-how{{background:#13131c;border:1px solid #262636;border-radius:12px;padding:16px 18px;color:#a9b0c8;line-height:1.6;font-size:14px;margin-top:26px;}}
.u-cta{{display:inline-block;margin-top:14px;background:#ffd700;color:#1a1200;font-family:'Barlow',sans-serif;
  font-weight:800;padding:12px 22px;border-radius:11px;}}
.u-links{{margin-top:14px;font-size:14px;}}
@media(max-width:640px){{.u-stats{{grid-template-columns:repeat(2,1fr);}}.u-table{{font-size:12.5px;}}}}
</style>
</head>
<body class="tmr-ds">
<main class="u-wrap">
  <nav class="u-crumb" aria-label="Breadcrumb"><a href="/">Home</a> &rsaquo; <a href="/handicappers/">Handicappers</a> &rsaquo; <span>{e(disp)}</span></nav>
  <div class="u-head">
    {avatar_html}
    <div>
      <h1 class="u-name">{e(disp)}</h1>
      <p class="u-tag">@{e(un)} · Verified sports betting record</p>
      {bio_html}
    </div>
  </div>
  {share_html}
  <section class="u-stats" id="uStats">
    {stats_html}
  </section>
  <div id="uDeep">
  {sport_html}
  {recent_html}
  {related_html}
  </div>
  <div class="u-how">
    <strong>How this record is verified:</strong> every pick {e(disp)} makes is timestamped and
    locked before the game starts, then graded automatically when the result settles. Wins and
    losses both stay on this public record, so the units, ROI, and win percentage above reflect
    the full graded history, not a highlight reel.
  </div>
  <a class="u-cta" href="/register/">Start Your Free Verified Record</a>
  <div class="u-links">
    <strong>More from {e(disp)}:</strong>
    <a href="/profile/?user={e(un)}">Full interactive profile</a> ·
    <a href="/profile/?user={e(un)}#record">Picks &amp; record</a> ·
    <a href="/profile/?user={e(un)}#charts">Performance charts</a> ·
    <a href="/profile/?user={e(un)}#challenges">Challenges entered</a> ·
    <a href="/profile/?user={e(un)}#followers">Followers &amp; following</a> ·
    <a href="/forum/">Forum posts</a> ·
    <a href="/marketplace/seller/?u={e(un)}">Pick storefront</a>
  </div>
  <div class="u-links">
    <strong>Explore TrustMyRecord:</strong>
    <a href="/">Home</a> ·
    <a href="/sportsbook/">Make a Verified Pick</a> ·
    <a href="/leaderboards/">Verified Leaderboards</a> ·
    <a href="/handicappers/">Handicappers</a> ·
    <a href="/handicapping/">Handicapping Hub</a> ·
    <a href="/tools/">Tools &amp; Simulators</a> ·
    <a href="/challenges/">Challenges</a> ·
    <a href="/contests/">Contests</a> ·
    <a href="/forum/">Forum</a> ·
    <a href="/feed/">Activity Feed</a> ·
    <a href="/how-it-works/">How It Works</a>
  </div>
</main>
<script>window.__TMR_PROFILE_USERNAME={json.dumps(un)};</script>
<script src="/static/js/tmr-profile-hydrate.js" defer></script>
{DS_FOOT}
</body>
</html>
"""

def compact_html(un):
    """Compact profile for an existing /u page below GRADED_MIN. A REAL profile
    for visitors: the same headline/#uStats + #uDeep mounts that
    tmr-profile-hydrate.js fills live from the metrics aggregator, so clicking
    "View" from the leaderboard for a rising or new member shows their real (if
    smaller) stats, not a dead-end stub.

    INDEXABLE — `index, follow`, like every other page on this site. Never add a
    noindex here."""
    e = html.escape
    url = f"{SITE}/u/{un}/"
    # Same per-member card the full template uses. The API renders it from this
    # member's live ledger, so a profile with few graded picks still previews as
    # itself instead of borrowing the generic site image.
    og_card = OG_CARD_BASE + "/profile/" + urllib.parse.quote(un) + ".png"
    cdesc = e(f"Public TrustMyRecord profile for {un} - verified locked-pick record, units, ROI "
              f"and history. Every pick is locked before game time and graded from the final result.")
    share_html = share_button(un, un)
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="index, follow">
<link rel="canonical" href="{url}">
<title>{e(un)} | TrustMyRecord</title>
<meta name="description" content="Public TrustMyRecord profile for {e(un)} - verified locked-pick record, units, ROI, and history. Building toward the featured leaderboard.">
<meta property="og:type" content="profile">
<meta property="og:site_name" content="TrustMyRecord">
<meta property="og:title" content="{e(un)} | TrustMyRecord">
<meta property="og:url" content="{url}">
<meta property="og:description" content="{cdesc}">
<meta property="og:image" content="{og_card}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="{e(un)} - verified record on TrustMyRecord">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{e(un)} | TrustMyRecord">
<meta name="twitter:description" content="{cdesc}">
<meta name="twitter:image" content="{og_card}">
<link rel="icon" type="image/svg+xml" href="/static/favicon.svg">
{DS_HEAD}
{SHARE_HEAD}
<style>
.u-wrap{{max-width:820px;margin:0 auto;padding:24px 18px 70px;color:#e8e8f0;font-family:'Inter',system-ui,sans-serif;}}
.u-wrap a{{color:#00aeff;text-decoration:none;}}
.u-crumb{{font-size:13px;color:#8890ad;margin:0 0 14px;}}
.u-crumb span{{color:#c9d0e4;}}
.u-head{{display:flex;gap:16px;align-items:center;margin:8px 0 6px;}}
.u-actions{{margin:2px 0 10px;}}
.u-name{{font-size:26px;margin:0;font-family:'Barlow',sans-serif;}}
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
.u-scroll{{overflow-x:auto;}}
.u-building{{background:#13131c;border:1px solid #262636;border-radius:12px;padding:14px 16px;color:#a9b0c8;line-height:1.55;font-size:13.5px;margin-top:18px;}}
@media(max-width:640px){{.u-stats{{grid-template-columns:repeat(2,1fr);}}.u-table{{font-size:12.5px;}}}}
</style>
</head>
<body class="tmr-ds">
<main class="u-wrap">
  <nav class="u-crumb" aria-label="Breadcrumb"><a href="/">Home</a> &rsaquo; <a href="/handicappers/">Handicappers</a> &rsaquo; <span>{e(un)}</span></nav>
  <div class="u-head">
    <div>
      <h1 class="u-name">{e(un)}</h1>
      <p class="u-tag">@{e(un)} · Public pick record</p>
    </div>
  </div>
  {share_html}
  <section class="u-stats" id="uStats">
    <div class="u-stat"><b>&mdash;</b><span>Loading record</span></div>
  </section>
  <div id="uDeep"></div>
  <p class="u-building">Building a public record. Full SEO feature listing unlocks at {GRADED_MIN} graded picks;
  the live stats above update automatically as picks settle.</p>
  <div class="u-note"><strong>More from {e(un)}:</strong>
     <a href="/profile/?user={e(un)}">Full interactive profile</a> ·
     <a href="/profile/?user={e(un)}#record">Picks &amp; record</a> ·
     <a href="/profile/?user={e(un)}#followers">Followers &amp; following</a> ·
     <a href="/marketplace/seller/?u={e(un)}">Pick storefront</a></div>
  <div class="u-note"><strong>Explore:</strong>
     <a href="/">Home</a> ·
     <a href="/sportsbook/">Make a Verified Pick</a> ·
     <a href="/leaderboards/">Verified Leaderboards</a> ·
     <a href="/handicappers/">Handicappers</a> ·
     <a href="/tools/">Tools &amp; Simulators</a> ·
     <a href="/challenges/">Challenges</a> ·
     <a href="/contests/">Contests</a> ·
     <a href="/forum/">Forum</a></div>
</main>
<script>window.__TMR_PROFILE_USERNAME={json.dumps(un)};</script>
<script src="/static/js/tmr-profile-hydrate.js" defer></script>
{DS_FOOT}
</body>
</html>
"""

def forum_thread_authors():
    """Usernames the forum links to as /u/<name>/.

    NAV_20260721: the interactive forum renders every thread/post author as a
    link to /u/<author>/, but this builder only guaranteed a page for members the
    directory and leaderboards can surface — which are gated on
    verification_status. An official bot account slipped through that gap and
    /u/TMRTrivia/ was live and 404ing from the Strategy board. Link integrity is
    the whole point of linked_lowdata, so forum authors feed it too.

    Fails soft: if the forum API is unreachable the build carries on with the
    leaderboard-derived set, exactly as before.
    """
    out, page = set(), 1
    try:
        while True:
            d = get(f"{API}/forum/threads?limit=100&page={page}")
            for t in d.get("threads") or []:
                if t.get("username"):
                    out.add(t["username"])
            pg = d.get("pagination") or {}
            if page >= int(pg.get("pages", 1) or 1):
                break
            page += 1
    except Exception as ex:
        print(f"  ! forum author fetch failed ({ex}) - continuing without it")
    return out


def main():
    dry = "--dry-run" in sys.argv
    base = list_users()
    eligible_pages, excluded = [], []
    linked_lowdata = set()   # every VERIFIED user the directory/leaderboard/sport
                             # boards can render (incl. 0-pick members) but who
                             # falls below GRADED_MIN. Each needs a real (compact)
                             # /u/ page so a leaderboard link to /u/<user>/ never
                             # 404s once those boards point at /u/ instead of the
                             # /profile/?user= shell.
    for u in base:
        un = u["username"]
        try:
            d = get(f"{API}/users/{un}")
            d = d.get("user", d)
        except Exception as ex:
            excluded.append((un, f"detail fetch failed: {ex}")); continue
        ok, why = eligible(d)
        if not ok:
            # Any verified, non-denylist, non-admin(unless allowlisted) member can
            # surface on a board, so guarantee a /u/ page exists for all of them.
            admin_ok = (not d.get("is_admin")) or (un in ADMIN_ALLOWLIST)
            if (d.get("verification_status") == "verified"
                    and un.lower() not in INTERNAL_DENYLIST
                    and admin_ok):
                linked_lowdata.add(un)
            excluded.append((un, why)); continue
        eligible_pages.append(d)

    elig_names = {d["username"] for d in eligible_pages}
    # existing on-disk /u pages below GRADED_MIN -> compact template (still indexable)
    existing = set(os.listdir(UDIR)) if os.path.isdir(UDIR) else set()
    # compact set = existing low-data dirs UNION linked low-data users still
    # missing a page (so a directory/leaderboard link never 404s).
    # NAV_20260721: forum author links are the other place the site points at
    # /u/<name>/, so they get the same guarantee.
    forum_linked = {n for n in forum_thread_authors()
                    if n.lower() not in INTERNAL_DENYLIST}
    to_compact = sorted(({n for n in existing
                          if os.path.isdir(os.path.join(UDIR, n))}
                         | linked_lowdata | forum_linked)
                        - elig_names)

    print(f"eligible (>= {GRADED_MIN} graded): {len(eligible_pages)}")
    for d in sorted(eligible_pages, key=lambda x: x["username"].lower()):
        print(f"  + {d['username']}  ({graded_count(d)} graded)")
    print(f"excluded: {len(excluded)}")
    for un, why in sorted(excluded):
        print(f"  - {un}: {why}")
    print(f"compact low-data pages (existing + linked-but-missing): {len(to_compact)} -> {to_compact}")
    if dry:
        print("DRY RUN — no files written")
        return

    os.makedirs(UDIR, exist_ok=True)
    for d in eligible_pages:
        un = d["username"]
        recent, avg_amer, sport_rows, _ = derive(fetch_picks(un))
        m = fetch_metrics(un)
        ddir = os.path.join(UDIR, un)
        os.makedirs(ddir, exist_ok=True)
        with open(os.path.join(ddir, "index.html"), "w", encoding="utf-8", newline="\n") as f:
            sibs = [x for x in sorted(elig_names) if x != un]
            f.write(page_html(d, recent, avg_amer, sport_rows, m, siblings=sibs))
    for un in to_compact:
        os.makedirs(os.path.join(UDIR, un), exist_ok=True)
        with open(os.path.join(UDIR, un, "index.html"), "w", encoding="utf-8", newline="\n") as f:
            f.write(compact_html(un))
    print(f"wrote {len(eligible_pages)} full + {len(to_compact)} compact pages under {UDIR} (ALL index, follow)")

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
