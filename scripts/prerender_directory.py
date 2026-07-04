#!/usr/bin/env python3
"""
prerender_directory.py - bake real, crawler-visible rows into the static
/handicappers/ and /leaderboards/ pages for TrustMyRecord (GitHub Pages, no SSR).

Why: both pages ship JS shells ("Loading members...", empty <tbody>) so Googlebot
sees zero usernames/records/units/ROI. This pulls the live Render API and writes
the actual ranked rows + hero counts into the initial HTML source. The existing
client JS still runs and overwrites these nodes for human visitors (progressive
enhancement) - the baked rows are the durable, crawler-visible source of truth.

Build only. Does NOT commit or deploy. Run from the repo root:
    python scripts/prerender_directory.py
Add --dry-run to print the eligible set + sample row without writing files.

Idempotent: re-running replaces content between <!--MK:key--> markers, so a
30-min cron/GitHub Action can call it repeatedly without drift.
"""
import json, os, sys, re, html, datetime, urllib.request, urllib.parse

API  = "https://trustmyrecord-api.onrender.com/api"
SITE = "https://trustmyrecord.com"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HANDI = os.path.join(ROOT, "handicappers", "index.html")
LEAD  = os.path.join(ROOT, "leaderboards", "index.html")
HOME  = os.path.join(ROOT, "index.html")

INTERNAL_DENYLIST = {"admin", "test", "tmr", "system", "support", "demo"}
ADMIN_ALLOWLIST   = {"BetLegend"}
DEFAULT_AVATAR    = "https://trustmyrecord.com/static/media/TMR-avatar-256.jpg"

def clean_avatar(url):
    """Never bake giant inline data: URIs into the static HTML (one user's
    avatar is 160KB+). Fall back to the shared default static avatar."""
    url = (url or "").strip()
    if not url or url.startswith("data:") or len(url) > 300:
        return DEFAULT_AVATAR
    return url

def get(url):
    req = urllib.request.Request(url, headers={"Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=45) as r:
        return json.load(r)

def num(v, d=0.0):
    try:
        return float(v)
    except (TypeError, ValueError):
        return d

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

def eligible(d):
    un = d.get("username", "")
    if d.get("verification_status") != "verified":
        return False
    if (d.get("total_picks") or 0) <= 0:
        return False
    if un.lower() in INTERNAL_DENYLIST:
        return False
    if d.get("is_admin") and un not in ADMIN_ALLOWLIST:
        return False
    return True

def active_within(last_pick_at, now, days):
    if not last_pick_at:
        return False
    try:
        t = datetime.datetime.fromisoformat(str(last_pick_at).replace("Z", "+00:00"))
        if t.tzinfo is None:
            t = t.replace(tzinfo=datetime.timezone.utc)
        return (now - t).total_seconds() < days * 86400
    except Exception:
        return False

# Tier thresholds mirror the page JS exactly (handicappers/index.html).
TIER_VERIFIED_MIN = 25
TIER_RISING_MIN = 5
TIER_ORDER = ["verified", "rising", "new"]
TIER_META = {
    "verified": ("Featured Verified Handicappers",
                 "Members with 25+ graded picks and a real, public ROI/units record."),
    "rising": ("Rising Pick Makers",
               "Members building their public record (5 to 24 graded picks). Not yet fully qualified for the main leaderboard."),
    "new": ("New / Building Records",
            "New members who have started building a public record (1 to 4 graded picks). Shown as community activity, not ranked aggressively by ROI."),
}

def graded(r):
    return r["wins"] + r["losses"] + r["pushes"]

def tier_of(r):
    g = graded(r)
    if g >= TIER_VERIFIED_MIN:
        return "verified"
    if g >= TIER_RISING_MIN:
        return "rising"
    return "new"

def tier_badge(r):
    g = graded(r)
    if g >= TIER_VERIFIED_MIN:
        return None
    if g >= TIER_RISING_MIN:
        return ("building", "Building Record", f"Needs {TIER_VERIFIED_MIN} graded picks to be verified")
    if g >= 1:
        return ("sample", "Small Sample", "Small sample - record still forming")
    return ("joined", "Recently Joined", "No graded picks yet")

def collect():
    """Return ranked list of member dicts with full record stats."""
    base = list_users()
    rows = []
    for u in base:
        un = u["username"]
        try:
            d = get(f"{API}/users/{un}")
            d = d.get("user", d)
        except Exception:
            d = u
        if not eligible(d):
            continue
        # The per-user detail endpoint omits last_pick_at; the /users LIST row
        # carries the real timestamp. Prefer detail, fall back to the list row so
        # "Active This Week" is correct and matches the live JS (which reads the
        # same list field), instead of baking a stale 0.
        last_pick_at = d.get("last_pick_at") or u.get("last_pick_at") or ""
        rows.append({
            "username": un,
            "display_name": d.get("display_name") or un,
            "avatar_url": clean_avatar(d.get("avatar_url")),
            "wins": int(num(d.get("wins"))),
            "losses": int(num(d.get("losses"))),
            "pushes": int(num(d.get("pushes"))),
            "total_picks": int(num(d.get("total_picks"))),
            "net_units": num(d.get("net_units")),
            "roi": num(d.get("roi")),
            "win_rate": num(d.get("win_rate")),
            "current_streak": int(num(d.get("current_streak"))),
            "last_pick_at": last_pick_at,
        })
    rows.sort(key=lambda r: r["net_units"], reverse=True)
    return rows

# ---------- formatters (mirror the page JS exactly) ----------
def e(s):
    return html.escape(str(s), quote=True)

def rec(r):
    s = f"{r['wins']}-{r['losses']}"
    return s + (f"-{r['pushes']}" if r["pushes"] else "")

def units_plain(v):   # handicappers cell: "+20.66" / "-19.48"
    return ("+" if v > 0 else "") + f"{v:.2f}"

def units_u(v):       # leaderboards cell: "+20.66u"
    return ("+" if v > 0 else "") + f"{v:.2f}u"

def pct(v):
    return f"{v:.1f}%"

def roi_pct(v):       # leaderboards signed %
    return ("+" if v > 0 else "") + f"{v:.2f}%"

def streak(v):
    if not v:
        return "0"
    return ("W" + str(v)) if v > 0 else ("L" + str(abs(v)))

def sclass(v):
    if v > 0: return "is-positive"
    if v < 0: return "is-negative"
    return "is-muted"

def lclass(v):        # leaderboards: pos/neg/neutral
    return "pos" if v > 0 else "neg" if v < 0 else "neutral"

# ---------- row builders (match each page's JS markup) ----------
def handi_row(r):
    href = f"/u/{e(r['username'])}/"
    label = f"View {r['username']} profile"
    has_graded = graded(r) > 0
    roi_cls = sclass(r["roi"]) if has_graded else "is-neutral"
    wr_cls = sclass(r["win_rate"] - 50) if has_graded else "is-neutral"
    badge = tier_badge(r)
    badge_html = (
        f'<span class="hm-badge hm-badge--{badge[0]}" title="{e(badge[2])}">{e(badge[1])}</span>'
        if badge else ""
    )
    return (
        f'<div class="hm-row hm-member-row" data-username="{e(r["username"])}" data-profile-href="{href}" role="link" tabindex="0" aria-label="{e(label)}">'
        f'<div class="hm-user">'
        f'<a class="hm-avatar-link" href="{href}" aria-label="{e(label)}" title="{e(label)}">'
        f'<img class="hm-avatar" src="{e(r["avatar_url"])}" alt="{e(r["display_name"])} avatar"></a>'
        f'<div class="hm-name"><a class="hm-profile-name" href="{href}" aria-label="{e(label)}" title="{e(label)}">'
        f'<strong data-tmr-username="{e(r["username"])}">{e(r["display_name"])}</strong></a><span>@{e(r["username"])}</span>{badge_html}</div>'
        f'</div>'
        f'<div class="hm-stat" data-label="Record">{e(rec(r))}</div>'
        f'<div class="hm-stat {sclass(r["net_units"])}" data-label="Units">{e(units_plain(r["net_units"]))}</div>'
        f'<div class="hm-stat {roi_cls}" data-label="ROI">{e(pct(r["roi"]))}</div>'
        f'<div class="hm-stat {wr_cls}" data-label="Win %">{e(pct(r["win_rate"]))}</div>'
        f'<div class="hm-stat" data-label="Total picks">{r["total_picks"]}</div>'
        f'<div class="hm-stat {sclass(r["current_streak"])}" data-label="Current streak">{e(streak(r["current_streak"]))}</div>'
        f'<div class="hm-stat is-muted" data-label="Last active">{"Recent" if r["last_pick_at"] else "No recent activity"}</div>'
        f'<div class="hm-actions"><a class="hm-action-btn hm-action-btn--view" href="{href}" aria-label="{e(label)}" title="{e(label)}">View</a></div>'
        f'</div>'
    )

def lead_row(r, idx):
    href = f"/u/{e(r['username'])}/"
    rank_cls = "gold" if idx == 0 else "silver" if idx == 1 else "bronze" if idx == 2 else ""
    initial = e((r["display_name"] or "?")[:1].upper())
    if r["avatar_url"]:
        avatar = f'<img class="avatar" src="{e(r["avatar_url"])}" alt="{e(r["display_name"])} avatar">'
    else:
        avatar = f'<span class="avatar avatar-initial">{initial}</span>'
    return (
        f'<tr>'
        f'<td><span class="rank {rank_cls}">#{idx + 1}</span></td>'
        f'<td><div class="person">{avatar}<div class="person-meta">'
        f'<a class="person-name" href="{href}" data-action="open-profile" data-username="{e(r["username"])}" data-source="board">{e(r["display_name"])}</a>'
        f'<span class="person-sub">@{e(r["username"])} &bull; All sports &bull; streak {e(streak(r["current_streak"]))}</span>'
        f'</div></div></td>'
        f'<td class="{lclass(r["win_rate"] - 50)}">{e(rec(r))}</td>'
        f'<td class="{lclass(r["roi"])}">{e(roi_pct(r["roi"]))}</td>'
        f'<td class="{lclass(r["net_units"])}">{e(units_u(r["net_units"]))}</td>'
        f'<td class="{lclass(r["win_rate"] - 50)}">{e(pct(r["win_rate"]))}</td>'
        f'<td>{r["total_picks"]}</td>'
        f'<td><div class="link-actions">'
        f'<a class="mini-link" href="{href}" data-action="open-profile" data-username="{e(r["username"])}" data-source="board">Profile</a>'
        f'<a class="mini-link" href="/arena/?challenge={e(r["username"])}" data-action="challenge-capper" data-username="{e(r["username"])}" data-source="board">Challenge</a>'
        f'</div></td>'
        f'</tr>'
    )

# ---------- idempotent injection helpers ----------
def set_marker(text, key, inner, anchor_pat, anchor_repl_template):
    """Replace between <!--MK:key-->...<!--/MK:key-->; first run uses anchor_pat."""
    block = f"<!--MK:{key}-->{inner}<!--/MK:{key}-->"
    mk = re.compile(rf"<!--MK:{re.escape(key)}-->.*?<!--/MK:{re.escape(key)}-->", re.S)
    if mk.search(text):
        return mk.sub(lambda m: block, text, count=1)
    new, n = re.subn(anchor_pat, anchor_repl_template.replace("@@BLOCK@@", block), text, count=1, flags=re.S)
    if n == 0:
        raise RuntimeError(f"anchor not found for key={key}")
    return new

def set_text(text, pat, value):
    new, n = re.subn(pat, lambda m: m.group(1) + value + m.group(2), text, count=1, flags=re.S)
    if n == 0:
        raise RuntimeError(f"text anchor not found: {pat}")
    return new

def handi_tier_header(tier, count):
    title, copy = TIER_META[tier]
    return (
        f'<div class="hm-tier-header hm-tier-header--{tier}" role="presentation">'
        f'<h3>{e(title)} <span class="hm-tier-count">{count}</span></h3>'
        f'<p>{e(copy)}</p></div>'
    )

def bake_handicappers(rows, now):
    with open(HANDI, encoding="utf-8") as f:
        t = f.read()
    # Default static view = grouped "All Pick Makers": tier header + its rows.
    body_parts = []
    for tier in TIER_ORDER:
        group = [r for r in rows if tier_of(r) == tier]
        if not group:
            continue
        body_parts.append(handi_tier_header(tier, len(group)))
        body_parts.extend(handi_row(r) for r in group)
    body = "".join(body_parts)
    # Static default view is grouped, so mark #hmRows to suppress global rank/medal
    # chips (the client JS toggles this class too). Idempotent.
    t = re.sub(r'<div id="hmRows"(?:\s+class="[^"]*")?>', '<div id="hmRows" class="hm-grouped">', t, count=1)
    t = set_marker(
        t, "hmRows", body,
        r'<div class="hm-empty"><strong>Loading handicappers</strong>Pulling public profiles and performance stats\.</div>',
        "@@BLOCK@@",
    )
    total_graded = sum(graded(r) for r in rows)
    verified_count = sum(1 for r in rows if tier_of(r) == "verified")
    building_count = len(rows) - verified_count
    active_week = sum(1 for r in rows if active_within(r["last_pick_at"], now, 7))
    # drop loading styling now that real numbers are baked in
    for hid in ("hmVerifiedCount", "hmPickMakers", "hmTotalPicks", "hmActiveWeek",
                "hmVisibleMembers", "hmBuildingCount"):
        t = re.sub(rf'(<strong id="{hid}")[^>]*(>)', r'\1\2', t, count=1)
    t = set_text(t, r'(<strong id="hmVerifiedCount"[^>]*>).*?(</strong>)', f"{verified_count:,}")
    t = set_text(t, r'(<strong id="hmPickMakers"[^>]*>).*?(</strong>)', f"{len(rows):,}")
    t = set_text(t, r'(<strong id="hmTotalPicks"[^>]*>).*?(</strong>)', f"{total_graded:,}")
    t = set_text(t, r'(<strong id="hmActiveWeek"[^>]*>).*?(</strong>)', f"{active_week:,}")
    t = set_text(t, r'(<strong id="hmVisibleMembers"[^>]*>).*?(</strong>)', f"{verified_count:,}")
    t = set_text(t, r'(<strong id="hmBuildingCount"[^>]*>).*?(</strong>)', f"{building_count:,}")
    with open(HANDI, "w", encoding="utf-8", newline="\n") as f:
        f.write(t)
    return len(rows), total_graded, active_week

def bake_leaderboards(rows):
    with open(LEAD, encoding="utf-8") as f:
        t = f.read()
    body = "".join(lead_row(r, i) for i, r in enumerate(rows))
    t = set_marker(
        t, "lbBody", body,
        r'(<tbody id="leaderboardBody">)(</tbody>)',
        r'\g<1>@@BLOCK@@\g<2>',
    )
    # make the static table visible without JS; hide the JS loading state
    t = t.replace('<div id="leaderboardWrap" class="table-wrap" style="display:none;">',
                  '<div id="leaderboardWrap" class="table-wrap" data-prerendered="1">')
    t = t.replace('<div id="leaderboardState" class="loading">Loading verified handicapper data...</div>',
                  '<div id="leaderboardState" class="loading" style="display:none;">Loading verified handicapper data...</div>')
    t = set_text(t, r'(<div class="count-chip" id="resultCount">).*?(</div>)', f"{len(rows)} cappers")
    t = set_text(t, r'(<b id="qsHandicappers">).*?(</b>)', str(len(rows)))
    with open(LEAD, "w", encoding="utf-8", newline="\n") as f:
        f.write(t)
    return len(rows)

def home_preview_rows(rows, k=5):
    out = []
    for i, r in enumerate(rows[:k]):
        href = f"/u/{e(r['username'])}/"
        out.append(
            f'<tr><td class="rk">#{i+1}</td>'
            f'<td><a href="{href}">{e(r["display_name"])}</a></td>'
            f'<td>{e(rec(r))}</td>'
            f'<td class="{lclass(r["net_units"])}">{e(units_u(r["net_units"]))}</td>'
            f'<td class="{lclass(r["roi"])}">{e(pct(r["roi"]))}</td></tr>'
        )
    return "".join(out)

# ---------- per-pick highlight engine (mirrors the homepage hero JS exactly) ----------
# The hero "Live Highlights" card (#tmrHeroPicksList) computes these client-side
# from /api/picks. This bakes the SAME sample-guarded, category-aware highlights
# into the crawler-visible SEO block so Googlebot sees real, current records and
# thin-sample users (e.g. a 1-0 +5u account) can never dominate a claim.
GRADED_ST = {"won", "lost", "push"}
HOME_HL_CANDIDATES = 16   # richest records to inspect per refresh
HOME_HL_ROWS = 4          # max highlight rows rendered

def _pick_dt(p):
    for k in ("commence_time", "graded_at", "created_at"):
        v = p.get(k)
        if v:
            try:
                d = datetime.datetime.fromisoformat(str(v).replace("Z", "+00:00"))
                return d.replace(tzinfo=datetime.timezone.utc) if d.tzinfo is None else d
            except Exception:
                pass
    return None

def _pick_pl(p):
    ru = p.get("result_units")
    try:
        if ru is not None and str(ru) != "":
            return float(ru)
    except (TypeError, ValueError):
        pass
    units = num(p.get("units") or p.get("stake") or 1, 1.0)
    odds = num(p.get("odds_snapshot") or p.get("odds") or -110, -110.0)
    st = str(p.get("status") or "").lower()
    if st == "won":
        return units * odds / 100 if odds > 0 else units
    if st == "lost":
        return -(units * abs(odds) / 100) if odds < 0 else -units
    return 0.0

def _sport_label(key):
    k = str(key or "").lower()
    if "mlb" in k or "baseball" in k: return "MLB"
    if "nhl" in k or "hockey" in k: return "NHL"
    if "nba" in k or "basketball" in k: return "NBA"
    if "nfl" in k or "football" in k: return "NFL"
    return None

def _cat_key(market):
    m = str(market or "").lower()
    if "team_total" in m: return "team_totals"
    if "total" in m: return "totals"
    if "spread" in m or "runline" in m or "run_line" in m or "puck" in m: return "spreads"
    if "h2h" in m or "moneyline" in m or m == "ml" or m.startswith("ml_") or m.endswith("_ml"): return "moneylines"
    if "batter_" in m or "pitcher_" in m or "player_" in m or "_prop" in m: return "props"
    return None

def _dominant_sport(picks):
    c = {}
    for p in picks:
        s = _sport_label(p.get("sport_key"))
        if s: c[s] = c.get(s, 0) + 1
    return max(c, key=c.get) if c else None

def _cat_label(key, picks):
    if key == "spreads":
        s = _dominant_sport(picks)
        return "run lines" if s == "MLB" else "puck lines" if s == "NHL" else "spreads"
    return {"totals": "totals", "team_totals": "team totals",
            "moneylines": "moneylines", "props": "player props"}.get(key, key)

def _end_streak(chrono):
    s = 0
    for p in reversed(chrono):
        st = str(p.get("status") or "").lower()
        if st == "push":
            continue
        if st == "won":
            s += 1
        else:
            break
    return s

def _wlr(picks):
    dec = [p for p in picks if str(p.get("status") or "").lower() != "push"]
    w = sum(1 for p in dec if str(p.get("status") or "").lower() == "won")
    n = len(dec)
    return w, n - w, n, (w / n if n else 0.0)

def _su(v):   # signed units, "+7.01u"
    return ("+" if v > 0 else "") + f"{v:.2f}u"

def _sroi(v): # signed pct, "+12.20%"
    return ("+" if v > 0 else "") + f"{v:.2f}%"

def compute_home_highlight(picks, meta, now):
    """Single best sample-guarded highlight for one capper, or None.
    Mirrors index.html computeHighlight(): pending picks never count, every
    %/units claim is gated on a real settled sample so no 1-0 user can brag."""
    graded = sorted([p for p in (picks or []) if str(p.get("status") or "").lower() in GRADED_ST],
                    key=lambda p: (_pick_dt(p) or datetime.datetime.min.replace(tzinfo=datetime.timezone.utc)))
    if not graded:
        return None
    wins = sum(1 for p in graded if str(p.get("status") or "").lower() == "won")
    losses = sum(1 for p in graded if str(p.get("status") or "").lower() == "lost")
    decided = wins + losses
    win_rate = wins / decided if decided else 0.0
    net = num(meta.get("net_units"), None) if meta.get("net_units") is not None else None
    roi = num(meta.get("roi"), None) if meta.get("roi") is not None else None
    total = int(num(meta.get("total_picks"), 0))
    by_cat, by_sport = {}, {}
    for p in graded:
        c = _cat_key(p.get("market_type"))
        if c: by_cat.setdefault(c, []).append(p)
        s = _sport_label(p.get("sport_key"))
        if s: by_sport.setdefault(s, []).append(p)
    out = []  # (score, emoji, clause)

    # 1. overall active winning streak (>= 3)
    ovr = _end_streak(graded)
    if ovr >= 3:
        out.append((1000 + ovr * 10, "🔥", f"has won {ovr} straight"))
    # 2. category-specific active streak (moneylines / totals / team totals / props / spreads)
    for c, sub in by_cat.items():
        st = _end_streak(sub)
        if st >= 3:
            out.append((840 + st * 10, "🔥", f"hit the last {st} {_cat_label(c, sub)}"))
    # 3. per-sport active streak
    for s, sub in by_sport.items():
        st = _end_streak(sub)
        if st >= 3:
            out.append((760 + st * 10, "⚾🏒🏀🏈🎯"[0], f"has won {st} straight {s} picks"))
    # 4. recent hot window (>=5 settled, >=4 wins, >=60%)
    for n in (20, 12, 10, 8, 5):
        w, l, nn, r = _wlr(graded[-n:])
        if nn >= 5 and w >= 4 and r >= 0.6:
            out.append((600 + r * 120 + nn, "📈", f"is {w}-{l} over the last {nn} picks"))
            break
    # 5. category record (>=5 settled, >=60%) e.g. "10-3 on MLB totals".
    # When labeled with a sport, count ONLY that sport's picks so the record
    # exactly matches the label (no all-sport count under an MLB header).
    for c, sub in by_cat.items():
        sp = _dominant_sport(sub)
        scoped = [p for p in sub if _sport_label(p.get("sport_key")) == sp] if sp else sub
        w, l, nn, r = _wlr(scoped)
        if nn >= 5 and r >= 0.6:
            label = _cat_label(c, scoped)
            out.append((500 + r * 100 + nn, "🎯", f"is {w}-{l} on {(sp + ' ') if sp else ''}{label}"))
    # 6. last 30-day units (>=3 settled in window, positive)
    w30 = [p for p in graded if _pick_dt(p) and (now - _pick_dt(p)).total_seconds() <= 30 * 86400]
    if len(w30) >= 3:
        u30 = sum(_pick_pl(p) for p in w30)
        if u30 >= 1:
            out.append((580 + u30, "📈", f"is {_su(u30)} over the last 30 days"))
    # 7. last 7-day units (>=2 settled, positive)
    w7 = [p for p in graded if _pick_dt(p) and (now - _pick_dt(p)).total_seconds() <= 7 * 86400]
    if len(w7) >= 2:
        u7 = sum(_pick_pl(p) for p in w7)
        if u7 >= 1:
            out.append((540 + u7, "📈", f"is {_su(u7)} over the last 7 days"))
    # 8. strong lifetime units (net >= 3 on a real settled sample)
    if net is not None and net >= 3 and decided >= 5:
        out.append((300 + net, "💰", f"is {_su(net)} lifetime across {total or decided} verified picks"))
    # 9. ROI on a meaningful sample (>=20 settled, >=5%)
    if decided >= 20 and roi is not None and roi >= 5:
        out.append((460 + roi, "📊", f"holds a {_sroi(roi)} ROI across {total or decided} graded picks"))
    # 10. long-term verified volume milestone (>=25 settled)
    vol = total or decided
    if vol >= 25:
        out.append((200 + min(vol, 150), "🚀", f"has {vol} verified picks tracked"))
    # 11. positive-only fallback (never a losing record; requires a real sample)
    if not out:
        if decided >= 5 and net is not None and net > 0:
            out.append((100 + net, "✅", f"is {_su(net)} overall across {total or decided} verified picks"))
        elif decided >= 5 and win_rate >= 0.5:
            out.append((80 + win_rate * 100, "✅", f"holds a {wins}-{losses} verified record"))

    if not out:
        return None
    out.sort(key=lambda x: x[0], reverse=True)
    score, emoji, clause = out[0]
    return {"score": score, "emoji": emoji, "clause": clause}

# Fallback shown when not enough qualifying highlights exist. NEVER a fake user.
HOME_HL_EMPTY = ('<li class="tmrhx-hl-empty">Public records update daily after '
                 'results are graded.</li>')

def home_highlights(rows, now):
    """Real, per-pick-derived highlights (no fabricated data). Each row links to
    the capper's public profile. Falls back to a neutral message - never to a
    fake user or stat - when too few qualifying highlights exist."""
    # Keep the site owner out of the highlights module (mirrors hero JS
    # TREND_EXCLUDE_OWNER); someone else fills the slot.
    HL_EXCLUDE = {"moneymakers"}
    found = []  # (score, username, display, emoji, clause)
    cands = [r for r in rows if r["username"].lower() not in HL_EXCLUDE][:HOME_HL_CANDIDATES]
    for r in cands:
        un = r["username"]
        try:
            d = get(f"{API}/picks?username={urllib.parse.quote(un)}&limit=100")
            picks = d.get("picks", []) if isinstance(d, dict) else []
        except Exception:
            picks = []
        hl = compute_home_highlight(picks, {
            "net_units": r["net_units"], "roi": r["roi"], "total_picks": r["total_picks"],
        }, now)
        if hl:
            found.append((hl["score"], un, r["display_name"], hl["emoji"], hl["clause"]))
    # best highlights, one per distinct user
    found.sort(key=lambda x: x[0], reverse=True)
    items, seen = [], set()
    for score, un, disp, emoji, clause in found:
        if un.lower() in seen:
            continue
        seen.add(un.lower())
        href = f"/u/{e(un)}/"
        items.append(f'<li>{emoji} <a href="{href}"><b>{e(disp)}</b></a> {clause}.</li>')
        if len(items) >= HOME_HL_ROWS:
            break
    if not items:
        return HOME_HL_EMPTY
    return "".join(items)

def bake_homepage(rows, now):
    with open(HOME, encoding="utf-8") as f:
        t = f.read()
    t = set_marker(t, "homeLbPreview", home_preview_rows(rows),
                   r'(<tbody>)(<tr><td colspan="5")', r'\g<1>@@BLOCK@@')  # unused fallback
    t = set_marker(t, "homeHighlights", home_highlights(rows, now),
                   r'(<ul class="tmrhx-hl">)(<li>)', r'\g<1>@@BLOCK@@')   # unused fallback
    with open(HOME, "w", encoding="utf-8", newline="\n") as f:
        f.write(t)
    return len(rows[:5])

def main():
    now = datetime.datetime.now(datetime.timezone.utc)
    rows = collect()
    if not rows:
        print("no eligible members - aborting (will not blank pages)")
        sys.exit(1)
    if "--dry-run" in sys.argv:
        print(f"eligible members: {len(rows)}")
        for r in rows[:8]:
            print(f"  {r['username']:>20}  {rec(r):>9}  {units_u(r['net_units']):>9}  ROI {r['roi']:.2f}%  {r['total_picks']} picks  streak {streak(r['current_streak'])}")
        print("\nSAMPLE handicappers row:\n", handi_row(rows[0])[:400])
        print("\nSAMPLE leaderboard row:\n", lead_row(rows[0], 0)[:400])
        return
    n1, tp, act = bake_handicappers(rows, now)
    n2 = bake_leaderboards(rows)
    n3 = bake_homepage(rows, now)
    print(f"handicappers: baked {n1} rows, {tp} total picks, {act} active")
    print(f"leaderboards: baked {n2} rows")
    print(f"homepage: baked {n3} preview rows + highlights")

if __name__ == "__main__":
    main()
