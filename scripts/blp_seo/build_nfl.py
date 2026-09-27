"""BetLegend Pro SEO pages, step 2 of 2: build the NFL research pages.

    python scripts/blp_seo/build_nfl.py <data-dir> [--out <repo-root>] [--today YYYY-MM-DD]

<data-dir> holds nfl-games.json, nfl-engine.json (extract_nfl.py) and
prod-parity.json (prod_parity.py). It lives OUTSIDE this public repository:
it is the paid dataset. Only the rendered pages and a manifest of game IDs
are written into the repo.

THE INVARIANT (Nima, 2026-09-27, permanent):
    verified BLP data -> exact game ID set -> page
    and every statistic on the page is computed from those same IDs.

The build refuses to write anything unless every gate passes:
  G1  the game table is sane (unique IDs, scores, dates, both sides present)
  G2  this file's arithmetic equals the BetLegend Pro engine's own summaries,
      team by team and matchup by matchup, on the identical ID sets
  G3  the live tool answers the same meeting count and first and last
      meeting for every matchup (prod-parity.json), and holds the same NFL
      game count
  G4  every market figure uses only seasons the engine marks verified for
      that market (VERIFIED_RANGES), and says how many games it counted
  G5  cross page consistency: a team page's row against a rival equals the
      matchup page, built from the same IDs
  G6  a matchup page exists only with at least config.min_meetings meetings
"""
import argparse
import hashlib
import html
import json
import os
import re
import sys
from collections import defaultdict
from datetime import date, datetime

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from nfl_teams import DIVISIONS, DIVISION_OF, NICKNAME, TEAMS, division_pairs, matchup_slug, team_slug  # noqa: E402

SITE = "https://trustmyrecord.com"
BASE = "/betlegend-pro/nfl/"
BRAND = "Bet Legend Pro"  # visible name; URLs and file names keep "betlegend-pro"
ESPN_ABBR = {
    "Arizona Cardinals": "ari", "Atlanta Falcons": "atl", "Baltimore Ravens": "bal", "Buffalo Bills": "buf",
    "Carolina Panthers": "car", "Chicago Bears": "chi", "Cincinnati Bengals": "cin", "Cleveland Browns": "cle",
    "Dallas Cowboys": "dal", "Denver Broncos": "den", "Detroit Lions": "det", "Green Bay Packers": "gb",
    "Houston Texans": "hou", "Indianapolis Colts": "ind", "Jacksonville Jaguars": "jax", "Kansas City Chiefs": "kc",
    "Las Vegas Raiders": "lv", "Los Angeles Chargers": "lac", "Los Angeles Rams": "lar", "Miami Dolphins": "mia",
    "Minnesota Vikings": "min", "New England Patriots": "ne", "New Orleans Saints": "no", "New York Giants": "nyg",
    "New York Jets": "nyj", "Philadelphia Eagles": "phi", "Pittsburgh Steelers": "pit", "San Francisco 49ers": "sf",
    "Seattle Seahawks": "sea", "Tampa Bay Buccaneers": "tb", "Tennessee Titans": "ten", "Washington Commanders": "wsh",
}
MONTHS = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
MONTH_FULL = ["", "January", "February", "March", "April", "May", "June", "July", "August",
              "September", "October", "November", "December"]
WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]


class GateFailure(Exception):
    pass


def gate(ok, msg):
    if not ok:
        raise GateFailure(msg)


# --------------------------------------------------------------------- data

def season_of(d):
    y, m = int(d[:4]), int(d[5:7])
    return y if m >= 3 else y - 1


def load(data_dir):
    g = json.load(open(os.path.join(data_dir, "nfl-games.json"), encoding="utf-8"))
    e = json.load(open(os.path.join(data_dir, "nfl-engine.json"), encoding="utf-8"))
    p = json.load(open(os.path.join(data_dir, "prod-parity.json"), encoding="utf-8"))
    return g, e, p


def prepare(games_doc, today):
    meta = games_doc["meta"]
    vr = meta["verified_ranges"]
    games = {}
    for g in games_doc["games"]:
        gate(g["id"] not in games, f"G1 duplicate id {g['id']}")
        gate(g["home"] in TEAMS and g["away"] in TEAMS and g["home"] != g["away"], f"G1 bad sides {g['id']}")
        gate(isinstance(g["hs"], int) and isinstance(g["as"], int) and g["hs"] >= 0 and g["as"] >= 0,
             f"G1 bad score {g['id']}")
        gate(g["date"] <= today, f"G1 future game {g['id']}")
        s = season_of(g["date"])
        st = g["season_type"]
        if st is None:
            # Rows the daily refresh inserted carry no season type. Every one of
            # them is a September to December game, which is regular season.
            gate(int(g["date"][5:7]) >= 9, f"G1 untyped non regular season game {g['id']}")
            st = "regular"
        gate(st in ("regular", "postseason"), f"G1 season type {g['id']} {st}")
        g = dict(g, season=s, season_type=st)

        def within(field):
            lo, hi = vr[field]
            return lo <= s <= hi

        # Verified values only (G4). The raw value is kept for the G2 check.
        g["v_line"] = g["home_line"] if (g["home_line"] is not None and within("spread")) else None
        g["v_total"] = g["total"] if (g["total"] is not None and within("total")) else None
        g["v_ml"] = (g["home_ml"], g["away_ml"]) if (g["home_ml"] is not None and g["away_ml"] is not None
                                                     and within("moneyline")) else None
        games[g["id"]] = g
    gate(len(games) == meta["games"], "G1 game count differs from meta")
    return games, vr


def persp(g, team, verified=True):
    home = g["home"] == team
    pf, pa = (g["hs"], g["as"]) if home else (g["as"], g["hs"])
    hl = g["v_line"] if verified else g["home_line"]
    tot = g["v_total"] if verified else g["total"]
    line = None if hl is None else (hl if home else -hl)
    ml = None
    if verified and g["v_ml"]:
        ml = g["v_ml"][0] if home else g["v_ml"][1]
    return {
        "g": g, "id": g["id"], "date": g["date"], "season": g["season"], "home": home,
        "post": g["season_type"] == "postseason",
        "pf": pf, "pa": pa, "m": pf - pa, "line": line, "total": tot, "ml": ml,
        "opp": g["away"] if home else g["home"],
        "opp_name": g["away_name"] if home else g["home_name"],
        "name": g["home_name"] if home else g["away_name"],
    }


def ml_profit(price, result):
    if result == 0:
        return 0.0
    if result < 0:
        return -1.0
    return price / 100.0 if price > 0 else 100.0 / -price


def agg(rows):
    """Every figure is plain arithmetic over exactly `rows`."""
    r = {"n": len(rows), "w": 0, "l": 0, "t": 0, "aw": 0, "al": 0, "ap": 0, "ov": 0, "un": 0, "op": 0,
         "pf": 0, "pa": 0, "tp": 0, "ml_n": 0, "ml_w": 0, "ml_l": 0, "ml_u": 0.0, "ids": []}
    for x in rows:
        r["ids"].append(x["id"])
        r["w"] += x["m"] > 0
        r["l"] += x["m"] < 0
        r["t"] += x["m"] == 0
        r["pf"] += x["pf"]
        r["pa"] += x["pa"]
        r["tp"] += x["pf"] + x["pa"]
        if x["line"] is not None:
            c = x["m"] + x["line"]
            r["aw"] += c > 0
            r["al"] += c < 0
            r["ap"] += c == 0
        if x["total"] is not None:
            d = x["pf"] + x["pa"] - x["total"]
            r["ov"] += d > 0
            r["un"] += d < 0
            r["op"] += d == 0
        if x["ml"] is not None:
            r["ml_n"] += 1
            r["ml_w"] += x["m"] > 0
            r["ml_l"] += x["m"] < 0
            r["ml_u"] += ml_profit(x["ml"], (x["m"] > 0) - (x["m"] < 0))
    r["ats_n"] = r["aw"] + r["al"] + r["ap"]
    r["ou_n"] = r["ov"] + r["un"] + r["op"]
    return r


def rec(w, l, t=0):
    return f"{w}-{l}-{t}" if t else f"{w}-{l}"


def pct(a, b):
    return None if not b else round(100.0 * a / b, 1)


def su(r):
    return rec(r["w"], r["l"], r["t"])


def ats(r):
    return rec(r["aw"], r["al"], r["ap"])


def ou(r):
    return rec(r["ov"], r["un"], r["op"])


def su_pct(r):
    return pct(r["w"] + 0.5 * r["t"], r["n"])


def cover_pct(r):
    return pct(r["aw"], r["aw"] + r["al"])


def over_pct(r):
    return pct(r["ov"], r["ov"] + r["un"])


def avg(total, n):
    return None if not n else round(total / n, 1)


# ------------------------------------------------------------------ gates

def nums(record):
    parts = [int(x) for x in record.split("-")]
    return tuple(parts + [0] * (3 - len(parts)))


def gate_engine(games, engine, parity, cfg):
    for team, t in engine["teams"].items():
        rows = [persp(games[i], team, verified=False) for i in t["ids"]]
        r = agg(rows)
        s = t["summary"]
        gate(r["n"] == s["qualifying_games"], f"G2 {team} count {r['n']} != {s['qualifying_games']}")
        gate(su(r) == s["record"], f"G2 {team} SU {su(r)} != {s['record']}")
        gate(ats(r) == s["ats"]["record"], f"G2 {team} ATS {ats(r)} != {s['ats']['record']}")
        gate(ou(r) == s["ou"]["record"], f"G2 {team} O/U {ou(r)} != {s['ou']['record']}")
    for key, m in engine["matchups"].items():
        a, b = key.split("|")
        rows = [persp(games[i], a, verified=False) for i in m["ids"]]
        r = agg(rows)
        ms = m["matchup_summary"]
        gate(r["n"] == m["qualifying_games"] == len(m["ids"]), f"G2 {key} ids {r['n']} vs {m['qualifying_games']}")
        gate((r["w"], r["l"], r["t"]) == (ms["team_1"]["wins"], ms["team_1"]["losses"], ms["team_1"]["ties"]),
             f"G2 {key} SU")
        gate(nums(ats(r)) == nums(ms["market"]["ats"]["record"]), f"G2 {key} ATS {ats(r)} vs {ms['market']['ats']['record']}")
        o = ms["market"]["over_under"]
        gate((r["ov"], r["un"], r["op"]) == (o["overs"], o["unders"], o["pushes"]), f"G2 {key} O/U")
        gate(round(r["tp"] / r["n"], 1) == ms["scoring"]["avg_combined"], f"G2 {key} avg combined")
        # The same meetings seen from each team page (G5 is checked on build).
        ids_a = {i for i in engine["teams"][a]["ids"] if games[i]["home"] == b or games[i]["away"] == b}
        gate(ids_a == set(m["ids"]), f"G5 {key} team page set differs from matchup set")
    # G3 production parity
    gate(parity["dataset"]["match"], "G3 NFL game count differs from the live tool")
    gate(parity["extracted_at"] == engine["meta"]["extracted_at"], "G3 parity file is for another extract")
    live = {p["pair"]: p for p in parity["pairs"]}
    for key, m in engine["matchups"].items():
        gate(key in live and live[key]["match"], f"G3 live tool disagrees on {key}")


# ------------------------------------------------------------- formatting

def esc(s):
    return html.escape(str(s), quote=True)


def fmt_date(d):
    return f"{MONTHS[int(d[5:7])]} {int(d[8:10])}, {d[:4]}"


def fmt_date_long(d):
    return f"{MONTH_FULL[int(d[5:7])]} {int(d[8:10])}, {d[:4]}"


def fmt_line(v):
    if v is None:
        return ""
    if v == 0:
        return "PK"
    s = f"{abs(v):g}"
    return ("+" if v > 0 else "-") + s


def fmt_ml(v):
    if v is None:
        return ""
    v = int(round(v))
    return f"+{v}" if v > 0 else str(v)


def fmt_units(u):
    return f"+{u:.2f}" if u > 0 else (f"{u:.2f}" if u < 0 else "0.00")


def fmt_pct(p):
    return "" if p is None else f"{p:.1f}%"


def f1(v):
    return "" if v is None else f"{v:.1f}"


def logo(team, size=48, cls="tl", eager=False):
    load = 'fetchpriority="high"' if eager else 'loading="lazy"'
    # ESPN's resizer serves the mark at twice the display size (4 to 12 KB) instead of the 90 KB original.
    px = 2 * size
    return (f'<img class="{cls}" src="https://a.espncdn.com/combiner/i?img=/i/teamlogos/nfl/500/{ESPN_ABBR[team]}.png&amp;w={px}&amp;h={px}" '
            f'alt="{esc(team)} logo" width="{size}" height="{size}" {load} decoding="async">')


def team_url(team):
    return f"{BASE}{team_slug(team)}/"


def pair_url(a, b):
    return f"{BASE}{matchup_slug(a, b)}/"


def nick(team):
    return NICKNAME[team]


def matchup_title_order(a, b):
    """Nicknames in URL order, so the H1 and the slug read the same way."""
    return tuple(sorted([a, b], key=lambda t: re.sub(r"[^a-z0-9]", "", NICKNAME[t].lower())))


def split_row(label, r, show_ml=False):
    cells = [
        f"<th scope=\"row\">{label}</th>",
        f"<td class=\"n\">{r['n']}</td>",
        f"<td>{su(r)}</td><td class=\"n\">{fmt_pct(su_pct(r))}</td>",
        f"<td>{ats(r) if r['ats_n'] else ''}</td><td class=\"n\">{fmt_pct(cover_pct(r))}</td>",
        f"<td>{ou(r) if r['ou_n'] else ''}</td><td class=\"n\">{fmt_pct(over_pct(r))}</td>",
        f"<td class=\"n\">{f1(avg(r['pf'], r['n']))}</td><td class=\"n\">{f1(avg(r['pa'], r['n']))}</td>",
    ]
    return "<tr>" + "".join(cells) + "</tr>"


SPLIT_HEAD = ("<thead><tr><th scope=\"col\">Split</th><th class=\"n\" scope=\"col\">Games</th>"
              "<th scope=\"col\">SU</th><th class=\"n\" scope=\"col\">Win%</th>"
              "<th scope=\"col\">ATS</th><th class=\"n\" scope=\"col\">Cover%</th>"
              "<th scope=\"col\">O/U</th><th class=\"n\" scope=\"col\">Over%</th>"
              "<th class=\"n\" scope=\"col\">Pts for</th><th class=\"n\" scope=\"col\">Pts vs</th></tr></thead>")


def table(head, rows, cls="dt"):
    return f'<div class="tscroll"><table class="{cls}">{head}<tbody>{"".join(rows)}</tbody></table></div>'


# ------------------------------------------------------------------ page

class Assets:
    def __init__(self, repo):
        man = json.load(open(os.path.join(repo, "static", "ds-assets.json"), encoding="utf-8"))
        ref = open(os.path.join(repo, "nfl-simulator", "teams", "buffalo-bills", "index.html"), encoding="utf-8").read()

        def stamped(name):
            m = re.search(r'/static/(?:js|css)/' + re.escape(name) + r'\?v=[0-9a-f]+', ref)
            if not m:
                raise SystemExit(f"cannot find the current stamp for {name}")
            return m.group(0)
        self.ds = man["static/css/tmr-ds.css"]
        self.ds_header = man["static/css/tmr-ds-header.css"]
        self.nav = man["static/js/tmr-ds-nav.js"]
        self.session = re.search(r'/static/js/tmr-session\.[0-9a-f]+\.js', ref).group(0)
        self.navbar_css = stamped("tmr-navbar.css")
        self.analytics = stamped("tmr-analytics.js")
        self.config = stamped("config.js")
        self.backend = stamped("backend-api.js")
        self.chat = stamped("tmr-live-chat.js")
        css = open(os.path.join(repo, "static", "css", "blp-research.css"), "rb").read()
        self.research_css = "/static/css/blp-research.css?v=" + hashlib.sha256(css).hexdigest()[:12]


FONTS = ("https://fonts.googleapis.com/css2?family=Anton&family=Barlow:wght@600;700;800"
         "&family=Barlow+Condensed:wght@600;700;800;900&family=Inter:wght@400;500;600;700;800;900&display=swap")


def breadcrumbs(items):
    """items: [(name, path or None)]. Visible trail plus BreadcrumbList data."""
    parts = []
    for i, (name, path) in enumerate(items):
        if path and i < len(items) - 1:
            parts.append(f'<a href="{path}">{esc(name)}</a>')
        else:
            parts.append(f'<span aria-current="page">{esc(name)}</span>')
    visible = ('<nav class="crumbs" aria-label="Breadcrumb">'
               + '<span class="sep" aria-hidden="true">&rsaquo;</span>'.join(parts) + "</nav>")
    data = {"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [
        {"@type": "ListItem", "position": i + 1, "name": name, "item": SITE + path}
        for i, (name, path) in enumerate(items)]}
    return visible, data


RECORD_RX = re.compile(r"(?<![\w.-])(\d{1,5}-\d{1,5}(?:-\d{1,5})?)(?![\w-])")


def keep_records_whole(fragment):
    """A record such as 398-390-16 must never break across lines at its
    hyphens; wrap every one in running text (never inside tags) in a nowrap span."""
    def wrap(m):
        return '<span class="nw">' + m.group(1) + "</span>"
    return re.sub(r">([^<]+)<", lambda m: ">" + RECORD_RX.sub(wrap, m.group(1)) + "<", fragment)



def page(assets, *, path, title, desc, h1, crumbs, body, schema, og_image, game_set, modified):
    body = keep_records_whole(body)
    crumb_html, crumb_data = breadcrumbs(crumbs)
    lds = [crumb_data] + schema
    ld = "\n".join(f'<script type="application/ld+json">{json.dumps(x, separators=(",", ":"), ensure_ascii=False)}</script>'
                   for x in lds)
    digest = hashlib.sha256("\n".join(sorted(game_set)).encode()).hexdigest()
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<!-- BLP_SEO_NFL_PILOT_20260927. Built by scripts/blp_seo/build_nfl.py from verified Bet Legend Pro data. Do not edit by hand. -->
<title>{esc(title)}</title>
<meta name="description" content="{esc(desc)}">
<link rel="canonical" href="{SITE}{path}">
<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1">
<meta name="blp-game-set" content="n={len(game_set)} sha256={digest}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="TrustMyRecord">
<meta property="og:title" content="{esc(title.split(' | ')[0])}">
<meta property="og:description" content="{esc(desc)}">
<meta property="og:url" content="{SITE}{path}">
<meta property="og:image" content="{esc(og_image)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{esc(title.split(' | ')[0])}">
<meta name="twitter:description" content="{esc(desc)}">
<meta name="twitter:image" content="{esc(og_image)}">
<link rel="icon" type="image/png" href="/static/favicon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="preload" as="style" href="{FONTS}" onload="this.onload=null;this.rel='stylesheet'">
<noscript><link rel="stylesheet" href="{FONTS}"></noscript>
<link rel="stylesheet" href="{assets.ds}">
<link rel="stylesheet" href="{assets.ds_header}">
<link rel="stylesheet" href="{assets.navbar_css}">
<link rel="stylesheet" href="{assets.research_css}">
{ld}
</head>
<body class="tmr-ds-shell tmr-ds--dark blpr-body" data-tmr-route="betlegend-pro">
<main class="blpr">
{crumb_html}
{body}
<p class="asof">Data through games played {fmt_date_long(modified)}. Records count every game in the Bet Legend Pro NFL database for the span shown. Spread, total and moneyline records count only games with a closing number on file, and each table states how many games it counted.</p>
</main>
<script src="{assets.analytics}" defer></script>
<script src="{assets.config}" defer></script>
<script src="{assets.backend}" defer></script>
<script src="{assets.session}" defer></script>
<script src="{assets.nav}" defer></script>
<script src="{assets.chat}" defer></script>
</body>
</html>
"""


def cta(text, sub, button="Open Bet Legend Pro"):
    return (f'<section class="cta" id="research"><div><h2>{esc(text)}</h2><p>{sub}</p></div>'
            f'<div class="cta-actions"><a class="btn" href="/betlegend-pro/app/">{esc(button)}</a>'
            '<a class="btn ghost" href="/betlegend-pro/">How Bet Legend Pro works</a></div></section>')


def jump(items):
    """Compact on-page navigation; every target is an id on this page (tested)."""
    return ('<nav class="jump" aria-label="On this page">'
            + "".join(f'<a href="#{i}">{esc(label)}</a>' for i, label in items) + "</nav>")


def kpis(items):
    return '<div class="kpis">' + "".join(
        f'<div class="kpi"><b>{esc(v)}</b><span>{esc(k)}</span>{f"<small>{esc(s)}</small>" if s else ""}</div>'
        for k, v, s in items) + "</div>"


def web_page(path, title, desc, about, modified, kind="WebPage"):
    return {"@context": "https://schema.org", "@type": kind, "name": title.split(" | ")[0], "url": SITE + path,
            "description": desc, "dateModified": modified, "inLanguage": "en-US",
            "isPartOf": {"@type": "WebSite", "name": "TrustMyRecord", "url": SITE + "/"},
            "about": about}


def sports_team(team):
    return {"@type": "SportsTeam", "name": team, "sport": "American football",
            "memberOf": {"@type": "SportsOrganization", "name": "National Football League"}}


# -------------------------------------------------------------- analysis

SPREAD_BUCKETS = [
    ("Favored by 10 or more", lambda l: l <= -10),
    ("Favored by 7 to 9.5", lambda l: -9.5 <= l <= -7),
    ("Favored by 3.5 to 6.5", lambda l: -6.5 <= l <= -3.5),
    ("Favored by 0.5 to 3", lambda l: -3 <= l <= -0.5),
    ("Pick'em", lambda l: l == 0),
    ("Underdog of 0.5 to 3", lambda l: 0.5 <= l <= 3),
    ("Underdog of 3.5 to 6.5", lambda l: 3.5 <= l <= 6.5),
    ("Underdog of 7 or more", lambda l: l >= 7),
]
TOTAL_BUCKETS = [
    ("Under 38", lambda t: t < 38),
    ("38 to 41.5", lambda t: 38 <= t < 42),
    ("42 to 44.5", lambda t: 42 <= t < 45),
    ("45 to 47.5", lambda t: 45 <= t < 48),
    ("48 or higher", lambda t: t >= 48),
]


def weekday(d):
    return WEEKDAYS[date(int(d[:4]), int(d[5:7]), int(d[8:10])).weekday()]


def streak(results):
    """results newest first, as 'W'/'L'/'T'."""
    if not results:
        return None, 0
    first = results[0]
    n = 0
    for x in results:
        if x != first:
            break
        n += 1
    return first, n


def res_of(x):
    return "W" if x["m"] > 0 else ("L" if x["m"] < 0 else "T")


# ------------------------------------------------------------ team page

def build_team(assets, games, engine, cfg, team, modified, pages_by_pair):
    ids = engine["teams"][team]["ids"]
    rows = sorted((persp(games[i], team) for i in ids), key=lambda x: x["date"])
    allr = agg(rows)
    first_season = rows[0]["season"]
    since = cfg["since_realignment"]
    div = DIVISION_OF[team]
    rivals = [t for t in DIVISIONS[div] if t != team]
    nk = nick(team)

    def sub(pred):
        return agg([x for x in rows if pred(x)])

    splits = [
        ("All games", allr),
        ("Home", sub(lambda x: x["home"])),
        ("Road", sub(lambda x: not x["home"])),
        ("Favorite", sub(lambda x: x["line"] is not None and x["line"] < 0)),
        ("Underdog", sub(lambda x: x["line"] is not None and x["line"] > 0)),
        ("Home favorite", sub(lambda x: x["home"] and x["line"] is not None and x["line"] < 0)),
        ("Home underdog", sub(lambda x: x["home"] and x["line"] is not None and x["line"] > 0)),
        ("Road favorite", sub(lambda x: not x["home"] and x["line"] is not None and x["line"] < 0)),
        ("Road underdog", sub(lambda x: not x["home"] and x["line"] is not None and x["line"] > 0)),
        ("Regular season", sub(lambda x: not x["post"])),
        ("Postseason", sub(lambda x: x["post"])),
        (f"Vs {div} rivals since {since}", sub(lambda x: x["season"] >= since and x["opp"] in rivals)),
        ("After a win", None), ("After a loss", None),
    ]
    prev = {}
    for k in range(1, len(rows)):
        if rows[k]["season"] == rows[k - 1]["season"]:
            prev[rows[k]["id"]] = res_of(rows[k - 1])
    splits[-2] = ("After a win (same season)", sub(lambda x: prev.get(x["id"]) == "W"))
    splits[-1] = ("After a loss (same season)", sub(lambda x: prev.get(x["id"]) == "L"))
    splits = [(k, v) for k, v in splits if v["n"]]

    recent = [x for x in rows if x["season"] >= since]
    recent_r = agg(recent)
    spread_rows = [(lab, agg([x for x in recent if x["line"] is not None and f(x["line"])])) for lab, f in SPREAD_BUCKETS]
    total_rows = [(lab, agg([x for x in recent if x["total"] is not None and f(x["total"])])) for lab, f in TOTAL_BUCKETS]
    month_rows = [(MONTH_FULL[m], agg([x for x in recent if int(x["date"][5:7]) == m])) for m in (9, 10, 11, 12, 1, 2)]
    day_rows = [(d, agg([x for x in recent if weekday(x["date"]) == d])) for d in ("Sunday", "Monday", "Thursday", "Saturday")]

    by_season = defaultdict(list)
    for x in rows:
        by_season[x["season"]].append(x)
    seasons = sorted(by_season)[-cfg["recent_seasons"]:][::-1]

    by_opp = defaultdict(list)
    for x in rows:
        by_opp[x["opp"]].append(x)

    ml_rows = [x for x in rows if x["ml"] is not None]
    ml_r = agg(ml_rows)
    ml_fav = agg([x for x in ml_rows if x["ml"] < 0])
    ml_dog = agg([x for x in ml_rows if x["ml"] > 0])

    # ---- data led notes: strongest and weakest spread spots with a real sample
    minn = cfg["min_split_sample"]
    cands = [(lab, r) for lab, r in spread_rows + [(f"{k}", v) for k, v in splits[1:9]] if (r["aw"] + r["al"]) >= minn]
    notes = []
    if cands:
        best = max(cands, key=lambda c: (cover_pct(c[1]), c[1]["ats_n"]))
        worst = min(cands, key=lambda c: (cover_pct(c[1]), -c[1]["ats_n"]))
        scope_best = f"since {since}" if best in [(l, r) for l, r in spread_rows] else "all time"
        scope_worst = f"since {since}" if worst in [(l, r) for l, r in spread_rows] else "all time"
        notes.append(f"The {nk}' best spread spot with at least {minn} graded games is <b>{esc(best[0].lower())}</b> "
                     f"({scope_best}): {ats(best[1])} against the spread, a {fmt_pct(cover_pct(best[1]))} cover rate.")
        notes.append(f"Their weakest is <b>{esc(worst[0].lower())}</b> ({scope_worst}): {ats(worst[1])}, "
                     f"{fmt_pct(cover_pct(worst[1]))}.")
    tb = [(lab, r) for lab, r in total_rows if r["ov"] + r["un"] >= minn]
    if tb:
        hi = max(tb, key=lambda c: over_pct(c[1]))
        lo = min(tb, key=lambda c: over_pct(c[1]))
        if hi[0] != lo[0]:
            notes.append(f"On totals since {since}, the over hits most often when the closing number is "
                         f"<b>{esc(hi[0].lower())}</b> ({ou(hi[1])}, {fmt_pct(over_pct(hi[1]))} over) and least often at "
                         f"<b>{esc(lo[0].lower())}</b> ({ou(lo[1])}, {fmt_pct(over_pct(lo[1]))}).")
    home, road = splits[1][1], splits[2][1]
    if home["ats_n"] and road["ats_n"]:
        gap = (cover_pct(home) or 0) - (cover_pct(road) or 0)
        side = "at home" if gap > 0 else "on the road"
        notes.append(f"All time they have covered {fmt_pct(cover_pct(home))} at home and {fmt_pct(cover_pct(road))} on the road, "
                     f"a {abs(gap):.1f} point edge {side}.")

    last = rows[-1]
    su_all, ats_all, ou_all = su(allr), ats(allr), ou(allr)
    title = f"{team} Betting History, ATS Record & Trends | Bet Legend Pro"
    desc = (f"{team} betting history: {su_all} straight up and {ats_all} ATS in {allr['n']:,} games since "
            f"{first_season}, with home, road, favorite and underdog splits.")
    h1 = f"{team} Betting History &amp; Research"
    path = team_url(team)

    # ---- sections
    lede = (f"{allr['n']:,} games since the {first_season} season: <b>{su_all}</b> straight up, <b>{ats_all}</b> against "
            f"the spread over {allr['ats_n']:,} graded lines and <b>{ou_all}</b> on {allr['ou_n']:,} closing totals. "
            f"Most recent game: {fmt_date(last['date'])}, {'vs' if last['home'] else 'at'} {esc(last['opp_name'])}, "
            f"{'won' if last['m'] > 0 else ('lost' if last['m'] < 0 else 'tied')} {last['pf']}-{last['pa']}.")
    hero = (f'<header class="hero">{logo(team, 72, "hl", eager=True)}<div><p class="eyebrow">Bet Legend Pro research &middot; NFL &middot; {esc(div)}</p>'
            f'<h1>{h1}</h1><p class="lede">{lede}</p></div></header>')
    k = kpis([
        ("straight up", su_all, fmt_pct(su_pct(allr))),
        ("against the spread", ats_all, f"{fmt_pct(cover_pct(allr))} covers"),
        ("over / under", ou_all, f"{fmt_pct(over_pct(allr))} overs"),
        ("average score", f"{f1(avg(allr['pf'], allr['n']))} to {f1(avg(allr['pa'], allr['n']))}", f"margin {avg(allr['pf'] - allr['pa'], allr['n']):+.1f}"),
    ])
    notes_html = ('<section class="panel notes"><h2>What the record says</h2><ul>'
                  + "".join(f"<li>{n}</li>" for n in notes) + "</ul></section>") if notes else ""

    split_tbl = table(SPLIT_HEAD, [split_row(esc(lab), r) for lab, r in splits])
    sec_splits = (f'<section class="panel" id="overview"><h2>{esc(nk)} records by situation</h2>'
                  f'<p class="sub">All seasons since {first_season}. Favorite and underdog use the closing spread.</p>{split_tbl}</section>')

    def bucket_tbl(rows_, first_col):
        head = (f"<thead><tr><th scope=\"col\">{first_col}</th><th class=\"n\" scope=\"col\">Games</th><th scope=\"col\">SU</th>"
                "<th scope=\"col\">ATS</th><th class=\"n\" scope=\"col\">Cover%</th><th scope=\"col\">O/U</th>"
                "<th class=\"n\" scope=\"col\">Over%</th><th class=\"n\" scope=\"col\">Avg total pts</th></tr></thead>")
        body = [f"<tr><th scope=\"row\">{esc(lab)}</th><td class=\"n\">{r['n']}</td><td>{su(r)}</td><td>{ats(r) if r['ats_n'] else ''}</td>"
                f"<td class=\"n\">{fmt_pct(cover_pct(r))}</td><td>{ou(r) if r['ou_n'] else ''}</td><td class=\"n\">{fmt_pct(over_pct(r))}</td>"
                f"<td class=\"n\">{f1(avg(r['tp'], r['n']))}</td></tr>" for lab, r in rows_ if r["n"]]
        return table(head, body)

    sec_lines = (f'<section class="panel" id="lines"><h2>By closing spread since {since}</h2>'
                 f'<p class="sub">{recent_r["ats_n"]:,} games with a closing spread, from the {esc(nk)} side of the number.</p>'
                 f'{bucket_tbl(spread_rows, "Closing spread")}</section>'
                 f'<section class="panel"><h2>By closing total since {since}</h2>'
                 f'<p class="sub">{recent_r["ou_n"]:,} games with a closing total.</p>{bucket_tbl(total_rows, "Closing total")}</section>')
    sec_cal = (f'<section class="panel two"><div><h2>By month since {since}</h2>{bucket_tbl(month_rows, "Month")}</div>'
               f'<div><h2>By day of the week since {since}</h2>{bucket_tbl(day_rows, "Day")}</div></section>')

    season_head = ("<thead><tr><th scope=\"col\">Season</th><th class=\"n\" scope=\"col\">Games</th><th scope=\"col\">SU</th>"
                   "<th scope=\"col\">ATS</th><th scope=\"col\">O/U</th><th class=\"n\" scope=\"col\">Pts for</th>"
                   "<th class=\"n\" scope=\"col\">Pts vs</th><th scope=\"col\">Postseason</th></tr></thead>")
    season_rows = []
    for s in seasons:
        r = agg(by_season[s])
        post = agg([x for x in by_season[s] if x["post"]])
        season_rows.append(f"<tr><th scope=\"row\">{s}</th><td class=\"n\">{r['n']}</td><td>{su(r)}</td><td>{ats(r) if r['ats_n'] else ''}</td>"
                           f"<td>{ou(r) if r['ou_n'] else ''}</td><td class=\"n\">{f1(avg(r['pf'], r['n']))}</td>"
                           f"<td class=\"n\">{f1(avg(r['pa'], r['n']))}</td><td>{su(post) if post['n'] else ''}</td></tr>")
    sec_seasons = (f'<section class="panel" id="seasons"><h2>Season by season</h2><p class="sub">The last {len(seasons)} seasons, regular season and '
                   f'postseason together.</p>{table(season_head, season_rows)}</section>')

    sec_ml = ""
    if ml_r["ml_n"]:
        sec_ml = (f'<section class="panel"><h2>Moneyline results</h2><p class="sub">{ml_r["ml_n"]} games with a closing moneyline on file, '
                  f'one unit flat on the {esc(nk)} every game.</p>'
                  + kpis([("all games", rec(ml_r["ml_w"], ml_r["ml_l"]), f"{fmt_units(ml_r['ml_u'])} units"),
                          ("as moneyline favorite", rec(ml_fav["ml_w"], ml_fav["ml_l"]), f"{fmt_units(ml_fav['ml_u'])} units"),
                          ("as moneyline underdog", rec(ml_dog["ml_w"], ml_dog["ml_l"]), f"{fmt_units(ml_dog['ml_u'])} units")])
                  + "</section>")

    opp_head = ("<thead><tr><th scope=\"col\">Opponent</th><th class=\"n\" scope=\"col\">Games</th><th scope=\"col\">SU</th>"
                "<th scope=\"col\">ATS</th><th scope=\"col\">O/U</th><th scope=\"col\">Last meeting</th></tr></thead>")
    opp_rows = []
    for opp, xs in sorted(by_opp.items(), key=lambda kv: (-len(kv[1]), kv[0])):
        r = agg(xs)
        lm = xs[-1]
        pair = pages_by_pair.get(frozenset((team, opp)))
        name = f'<a href="{pair}">{esc(opp)}</a>' if pair else esc(opp)
        opp_rows.append(f"<tr><th scope=\"row\">{name}</th><td class=\"n\">{r['n']}</td><td>{su(r)}</td>"
                        f"<td>{ats(r) if r['ats_n'] else ''}</td><td>{ou(r) if r['ou_n'] else ''}</td>"
                        f"<td>{fmt_date(lm['date'])}, {res_of(lm)} {lm['pf']}-{lm['pa']}</td></tr>")
    sec_opp = (f'<section class="panel" id="opponents"><h2>{esc(nk)} against every opponent</h2><p class="sub">Franchise history is kept together, '
               f'so a relocated team counts under its current name. Linked opponents have a full head to head page.</p>'
               f'{table(opp_head, opp_rows)}</section>')

    rg_head = ("<thead><tr><th scope=\"col\">Date</th><th scope=\"col\">Opponent</th><th scope=\"col\">Result</th>"
               "<th scope=\"col\">Spread</th><th scope=\"col\">ATS</th><th scope=\"col\">Total</th><th scope=\"col\">O/U</th></tr></thead>")
    rg_rows = []
    for x in rows[-cfg["recent_games"]:][::-1]:
        ats_r = "" if x["line"] is None else ("W" if x["m"] + x["line"] > 0 else ("L" if x["m"] + x["line"] < 0 else "P"))
        ou_r = "" if x["total"] is None else ("O" if x["pf"] + x["pa"] > x["total"] else ("U" if x["pf"] + x["pa"] < x["total"] else "P"))
        total_txt = "" if x["total"] is None else f"{x['total']:g}"
        rg_rows.append(f"<tr data-game-id=\"{esc(x['id'])}\"><td>{fmt_date(x['date'])}</td><td>{'vs' if x['home'] else 'at'} {esc(x['opp_name'])}"
                       f"{' (playoffs)' if x['post'] else ''}</td><td><b class=\"r{res_of(x)}\">{res_of(x)}</b> {x['pf']}-{x['pa']}</td>"
                       f"<td>{fmt_line(x['line'])}</td><td>{ats_r}</td><td>{total_txt}</td><td>{ou_r}</td></tr>")
    sec_recent = (f'<section class="panel" id="recent"><h2>Last {cfg["recent_games"]} {esc(nk)} games</h2>{table(rg_head, rg_rows)}</section>')

    rival_links = "".join(
        f'<a href="{pair_url(team, r)}">{logo(r, 28)}<span>{esc(nk)} vs {esc(nick(r))}<small>'
        f'{esc(su(agg(by_opp[r])))} all time</small></span></a>' for r in rivals)
    division_links = "".join(f'<a href="{team_url(t)}">{logo(t, 28)}<span>{esc(t)}<small>Team research</small></span></a>'
                             for t in rivals)
    sec_links = (f'<section class="panel" id="related"><h2>{esc(div)} head to head</h2><div class="linkgrid">{rival_links}</div></section>'
                 f'<section class="panel"><h2>Keep researching</h2><div class="linkgrid">{division_links}'
                 f'<a href="/nfl-simulator/teams/{team_slug(team)}/"><span>{esc(nk)} 2026 simulator<small>Projected record and playoff odds</small></span></a>'
                 f'<a href="{BASE}"><span>NFL betting history<small>All 32 teams and every division rivalry</small></span></a>'
                 f'<a href="/handicapping/nfl/"><span>NFL handicapping hub<small>This week\'s games with research</small></span></a>'
                 f'</div></section>')
    nav = jump([("overview", "Overview"), ("lines", "By spread and total"), ("seasons", "Season by season"),
                ("opponents", "Every opponent"), ("recent", "Recent games"), ("related", "Rivalries"),
                ("research", "Run custom research")])
    body = (hero + nav + k + notes_html + sec_splits + sec_lines + sec_cal + sec_seasons + sec_ml + sec_opp + sec_recent + sec_links
            + cta(f"Want to analyze the {team} under your own conditions?",
                  f"Run a custom historical query in Bet Legend Pro. Stack what the tables above cannot: location, month, day, "
                  f"rest, streaks, the prior result, line ranges and the opponent's situation. You get the straight up, ATS and "
                  f"over/under record plus every qualifying game and why it counted.", button=f"Run a {nk} query"))
    crumbs = [("TrustMyRecord", "/"), ("Bet Legend Pro", "/betlegend-pro/"), ("NFL", BASE), (team, path)]
    schema = [web_page(path, title, desc, sports_team(team), modified)]
    logo_url = f"https://a.espncdn.com/i/teamlogos/nfl/500/{ESPN_ABBR[team]}.png"
    htm = page(assets, path=path, title=title, desc=desc, h1=h1, crumbs=crumbs, body=body, schema=schema,
               og_image=logo_url, game_set=ids, modified=modified)
    stats = {"games": allr["n"], "su": su_all, "ats": ats_all, "ats_graded": allr["ats_n"], "ou": ou_all,
             "ou_graded": allr["ou_n"], "first_season": first_season,
             "vs": {r: {"ids": sorted(x["id"] for x in by_opp[r]), "su": su(agg(by_opp[r])), "ats": ats(agg(by_opp[r])),
                        "ou": ou(agg(by_opp[r]))} for r in rivals}}
    return path, title, desc, htm, ids, stats


# --------------------------------------------------------- matchup page

def row_marks(x):
    """ATS and O/U outcome letters for one game from x's side, or '' without a verified number."""
    ats_r = "" if x["line"] is None else ("W" if x["m"] + x["line"] > 0 else ("L" if x["m"] + x["line"] < 0 else "P"))
    ou_r = "" if x["total"] is None else ("O" if x["pf"] + x["pa"] > x["total"] else ("U" if x["pf"] + x["pa"] < x["total"] else "P"))
    return ats_r, ou_r


def favorite_of(x, a, b):
    """Closing favorite by the verified spread, from the a-side line."""
    if x["line"] is None:
        return None
    if x["line"] == 0:
        return "PK"
    return a if x["line"] < 0 else b


def graded(rec_txt, n_graded, n_games):
    if not n_graded:
        return ""
    return rec_txt if n_graded == n_games else f'{rec_txt}<small class="g">({n_graded} of {n_games})</small>'


def meeting_rows(rows, a, b, na, nb):
    out = []
    for x in rows:
        g = x["g"]
        ats_r, ou_r = row_marks(x)
        fav = favorite_of(x, a, b)
        fav_txt = "" if fav is None else ("Pick'em" if fav == "PK" else nick(fav))
        where = f"{esc(g['home_name'])}" + (f"<small>{esc(g['venue'])}</small>" if g.get("venue") else "")
        tag = " <em>playoffs</em>" if x["post"] else ""
        total_txt = "" if x["total"] is None else f"{x['total']:g}"
        out.append(f"<tr data-game-id=\"{esc(x['id'])}\"><td>{fmt_date(x['date'])}{tag}</td><td>{where}</td>"
                   f"<td><b class=\"r{res_of(x)}\">{res_of(x)}</b> {x['pf']}-{x['pa']}</td><td class=\"n\">{x['m']:+d}</td>"
                   f"<td>{esc(fav_txt)}</td><td>{fmt_line(x['line'])}</td><td>{ats_r}</td><td>{total_txt}</td><td>{ou_r}</td>"
                   f"<td>{fmt_ml(x['ml'])}</td></tr>")
    return out


def build_pair(assets, games, engine, cfg, a0, b0, modified):
    a, b = matchup_title_order(a0, b0)
    key = f"{a0}|{b0}"
    ids = engine["matchups"][key]["ids"]
    rows = sorted((persp(games[i], a) for i in ids), key=lambda x: x["date"])
    r = agg(rows)
    na, nb = nick(a), nick(b)
    first, lastg = rows[0], rows[-1]
    n_recent = cfg.get("recent_meetings", 10)

    # ---- every split is a subset of `rows` (the page's one game set), seen from a named side
    def side(xs, team):
        return agg([persp(x["g"], team) for x in xs])

    recent = rows[-n_recent:]
    at_a = [x for x in rows if x["home"]]
    at_b = [x for x in rows if not x["home"]]
    fav_games = [x for x in rows if favorite_of(x, a, b) in (a, b)]
    pickem = sum(1 for x in rows if favorite_of(x, a, b) == "PK")
    fav_agg = agg([persp(x["g"], favorite_of(x, a, b)) for x in fav_games])
    dog_agg = agg([persp(x["g"], b if favorite_of(x, a, b) == a else a) for x in fav_games])
    home_w = sum(1 for x in rows if (x["m"] > 0) == x["home"] and x["m"] != 0)
    home_l = sum(1 for x in rows if (x["m"] > 0) != x["home"] and x["m"] != 0)
    one_score = sum(1 for x in rows if abs(x["m"]) <= 8)
    abs_margin = avg(sum(abs(x["m"]) for x in rows), r["n"])
    signed = avg(sum(x["m"] for x in rows), r["n"])  # a-side
    newest_first = [res_of(x) for x in rows[::-1]]
    cur, cur_n = streak(newest_first)
    longest = {"W": 0, "L": 0}
    run_v, run_n = None, 0
    for x in rows:
        v = res_of(x)
        run_n = run_n + 1 if v == run_v else 1
        run_v = v
        if v in longest:
            longest[v] = max(longest[v], run_n)
    leader = a if r["w"] > r["l"] else (b if r["l"] > r["w"] else None)
    series = su(r) if leader != b else rec(r["l"], r["w"], r["t"])
    lead_txt = (f"The {nick(leader)} lead the series {series}" if leader else f"The series is level at {su(r)}")
    b_ats = rec(r["al"], r["aw"], r["ap"])
    if round(abs(signed), 1) == 0:
        margin_txt = "the two teams have averaged the same points per game"
    else:
        up, down = (a, b) if signed > 0 else (b, a)
        margin_txt = f"the {nick(up)} have outscored the {nick(down)} by {abs(signed):.1f} points a game"

    decades = defaultdict(list)
    for x in rows:
        decades[(x["season"] // 10) * 10].append(x)

    title = f"{na} vs {nb} Betting History: ATS, Odds & Results | Bet Legend Pro"
    lead_short = f"the {nick(leader)} lead {series}" if leader else f"the series is tied {su(r)}"
    desc = (f"All {r['n']} {na} vs {nb} games since {first['season']}: {lead_short}, the {na} are {ats(r)} ATS and the "
            f"over is {ou(r)}. Every score, closing spread and total.")
    h1 = f"{na} vs {nb} Betting History"
    path = pair_url(a, b)

    lede = (f"Every <a href=\"{team_url(a)}\">{esc(a)}</a> vs <a href=\"{team_url(b)}\">{esc(b)}</a> game since the "
            f"{first['season']} season: <b>{r['n']}</b> meetings with the final score, the closing point spread, the closing total "
            f"and how each game graded against both. {esc(lead_txt)}. Against the spread the {esc(na)} are <b>{ats(r)}</b> "
            f"({esc(nb)} {b_ats}), the over is <b>{ou(r)}</b>, and {margin_txt}.")
    lede2 = (f"Below are the head to head results, ATS and over/under history, closing odds and scoring margins for this "
             f"rivalry, split by venue, by favorite and underdog, by decade and over the last {len(recent)} meetings. "
             f"Most recent meeting: {fmt_date(lastg['date'])}, "
             f"{esc(na if lastg['m'] > 0 else nb)} {max(lastg['pf'], lastg['pa'])}-{min(lastg['pf'], lastg['pa'])}"
             f"{' (tie)' if lastg['m'] == 0 else ''}.")
    hero = (f'<header class="hero vs">{logo(a, 64, "hl", eager=True)}<span class="vsx">vs</span>{logo(b, 64, "hl", eager=True)}<div>'
            f'<p class="eyebrow">Bet Legend Pro research &middot; NFL &middot; {esc(DIVISION_OF[a])} rivalry</p>'
            f'<h1>{h1}</h1><p class="lede">{lede}</p><p class="lede">{lede2}</p></div></header>')
    nav = jump([("overview", "Overview"), ("recent", "Recent meetings"), ("decades", "By decade"), ("meetings", "All meetings"),
                ("related", "Related matchups"), ("research", "Run custom research")])
    k = kpis([
        ("series, straight up", series if leader else su(r), f"{nick(leader)} lead" if leader else "level"),
        (f"{na} against the spread", ats(r), f"{r['ats_n']} of {r['n']} meetings graded"),
        ("over / under", ou(r), f"{r['ou_n']} of {r['n']} meetings graded"),
        ("average final margin", f"{abs_margin:.1f} pts", f"{one_score} of {r['n']} decided by 8 or fewer"),
    ])

    split_head = ("<thead><tr><th scope=\"col\">Split</th><th class=\"n\" scope=\"col\">Games</th><th scope=\"col\">SU</th>"
                  "<th scope=\"col\">ATS</th><th scope=\"col\">O/U</th><th class=\"n\" scope=\"col\">Avg margin</th>"
                  "<th class=\"n\" scope=\"col\">Avg total pts</th></tr></thead>")

    def split(label, x):
        return (f"<tr><th scope=\"row\">{label}</th><td class=\"n\">{x['n']}</td><td>{su(x)}</td>"
                f"<td>{graded(ats(x), x['ats_n'], x['n'])}</td><td>{graded(ou(x), x['ou_n'], x['n'])}</td>"
                f"<td class=\"n\">{(x['pf'] - x['pa']) / x['n']:+.1f}</td><td class=\"n\">{f1(avg(x['tp'], x['n']))}</td></tr>")
    splits = [split(f"{esc(na)}, all meetings", r),
              split(f"{esc(na)}, last {len(recent)} meetings", side(recent, a)),
              split(f"{esc(na)} at home", side(at_a, a)),
              split(f"{esc(nb)} at home", side(at_b, b))]
    if fav_games:
        splits += [split("Closing favorite", fav_agg), split("Closing underdog", dog_agg)]
    fav_note = (f"Favorite and underdog use the verified closing spread; {len(fav_games)} meetings had a favorite"
                + (f" and {pickem} closed pick'em" if pickem else "") + f". The home team is {rec(home_w, home_l)} straight up.")
    streak_line = ""
    if cur in ("W", "L"):
        who = na if cur == "W" else nb
        streak_line = (f" The {esc(who)} have won the last {cur_n} meeting{'s' if cur_n > 1 else ''}; the longest runs are "
                       f"{esc(na)} {longest['W']} and {esc(nb)} {longest['L']}.")
    sec_over = (f'<section class="panel" id="overview"><h2>{esc(na)} vs {esc(nb)} betting splits</h2>'
                f'<p class="sub">Each row names whose record it is, and average margin is from that side. A count in brackets, such as '
                f'(94 of 120), is how many of those meetings had a verified closing number to grade.</p>{table(split_head, splits)}'
                f'<p>{fav_note}{streak_line}</p></section>')

    mt_head = (f"<thead><tr><th scope=\"col\">Date</th><th scope=\"col\">Home team</th><th scope=\"col\">{esc(na)} result</th>"
               f"<th class=\"n\" scope=\"col\">Margin</th><th scope=\"col\">Favorite</th><th scope=\"col\">{esc(na)} spread</th>"
               f"<th scope=\"col\">ATS</th><th scope=\"col\">Total</th><th scope=\"col\">O/U</th><th scope=\"col\">{esc(na)} ML</th></tr></thead>")
    rx = side(recent, a)
    sec_recent = (f'<section class="panel" id="recent"><h2>Last {len(recent)} {esc(na)} vs {esc(nb)} meetings</h2>'
                  f'<p class="sub">{esc(na)} {su(rx)} straight up, {ats(rx)} against the spread, over/under {ou(rx)}. '
                  f'Results, margin, spread and moneyline are from the {esc(na)} side.</p>'
                  f'{table(mt_head, meeting_rows(recent[::-1], a, b, na, nb), "dt games")}</section>')

    dec_head = ("<thead><tr><th scope=\"col\">Decade</th><th class=\"n\" scope=\"col\">Meetings</th>"
                f"<th scope=\"col\">{esc(na)} SU</th><th scope=\"col\">{esc(na)} ATS</th><th scope=\"col\">O/U</th>"
                f"<th class=\"n\" scope=\"col\">{esc(na)} avg margin</th><th class=\"n\" scope=\"col\">Avg total pts</th>"
                "<th class=\"n\" scope=\"col\">Avg closing total</th></tr></thead>")
    dec_rows = []
    for d in sorted(decades, reverse=True):
        x = agg(decades[d])
        tots = [y["total"] for y in decades[d] if y["total"] is not None]
        dec_rows.append(f"<tr><th scope=\"row\">{d}s</th><td class=\"n\">{x['n']}</td><td>{su(x)}</td>"
                        f"<td>{graded(ats(x), x['ats_n'], x['n'])}</td><td>{graded(ou(x), x['ou_n'], x['n'])}</td>"
                        f"<td class=\"n\">{(x['pf'] - x['pa']) / x['n']:+.1f}</td><td class=\"n\">{f1(avg(x['tp'], x['n']))}</td>"
                        f"<td class=\"n\">{f1(avg(sum(tots), len(tots)))}</td></tr>")
    sec_dec = f'<section class="panel" id="decades"><h2>The rivalry by decade</h2>{table(dec_head, dec_rows)}</section>'

    sec_ml = ""
    if r["ml_n"]:
        rb = agg([persp(x["g"], b) for x in rows if x["ml"] is not None])
        sec_ml = (f'<section class="panel"><h2>Moneyline in this matchup</h2><p class="sub">{r["ml_n"]} meetings with a verified closing '
                  f'moneyline, one unit flat on each side.</p>'
                  + kpis([(f"{na} moneyline", rec(r["ml_w"], r["ml_l"]), f"{fmt_units(r['ml_u'])} units"),
                          (f"{nb} moneyline", rec(rb["ml_w"], rb["ml_l"]), f"{fmt_units(rb['ml_u'])} units")]) + "</section>")

    sec_all = (f'<section class="panel" id="meetings"><h2>Every {esc(na)} vs {esc(nb)} game</h2><p class="sub">{r["n"]} meetings, '
               f'newest first. Score, margin, spread and moneyline are from the {esc(na)} side; the favorite is the team laying '
               f'points at the close.</p>{table(mt_head, meeting_rows(rows[::-1], a, b, na, nb), "dt games")}</section>')

    others = [t for t in DIVISIONS[DIVISION_OF[a]] if t not in (a, b)]
    cards = []
    for x in (a, b):
        for y in others:
            ps = agg([persp(games[i], x) for i in engine["teams"][x]["ids"]
                      if y in (games[i]["home"], games[i]["away"])])
            cards.append(f'<a href="{pair_url(x, y)}">{logo(x, 24)}{logo(y, 24)}<span>{esc(nick(x))} vs {esc(nick(y))}'
                         f'<small>{ps["n"]} meetings, {esc(nick(x))} {su(ps)}</small></span></a>')
    sec_related = (f'<section class="panel" id="related"><h2>Related matchups</h2><div class="linkgrid">{"".join(cards)}'
                   f'<a href="{team_url(a)}">{logo(a, 28)}<span>{esc(a)}<small>Team betting history</small></span></a>'
                   f'<a href="{team_url(b)}">{logo(b, 28)}<span>{esc(b)}<small>Team betting history</small></span></a>'
                   f'<a href="/nfl-simulator/{matchup_slug(a, b)}/"><span>{esc(na)} vs {esc(nb)} simulator<small>This season\'s meetings, 10,000 simulations</small></span></a>'
                   f'<a href="{BASE}"><span>NFL betting history<small>All 32 teams and 48 rivalries</small></span></a>'
                   f'</div></section>')
    sec_cta = cta(f"Want to analyze {na} vs {nb} under your own conditions?",
                  "Run a custom historical query in Bet Legend Pro. Choose who is home, the month and day, who was favored and by how much, "
                  "the total, rest days, streaks and each team's last result. You get the straight up, ATS and over/under record "
                  "plus every qualifying game and why it counted.", button=f"Run a {na} vs {nb} query")
    body = hero + nav + k + sec_over + sec_recent + sec_dec + sec_ml + sec_all + sec_related + sec_cta
    crumbs = [("TrustMyRecord", "/"), ("Bet Legend Pro", "/betlegend-pro/"), ("NFL", BASE), (a, team_url(a)), (f"{na} vs {nb}", path)]
    schema = [web_page(path, title, desc, [sports_team(a), sports_team(b)], modified)]
    htm = page(assets, path=path, title=title, desc=desc, h1=h1, crumbs=crumbs, body=body, schema=schema,
               og_image=SITE + "/static/og/og-home.png", game_set=ids, modified=modified)
    stats = {"a": a, "b": b, "meetings": r["n"], "su_a": su(r), "ats_a": ats(r), "ats_graded": r["ats_n"], "ou": ou(r),
             "ou_graded": r["ou_n"], "avg_combined": avg(r["tp"], r["n"]), "avg_abs_margin": abs_margin,
             "avg_margin_a": signed, "first": first["date"], "last": lastg["date"],
             "splits": {"last_n": su(side(recent, a)), "a_home": su(side(at_a, a)), "b_home": su(side(at_b, b)),
                        "favorite_su": su(fav_agg), "favorite_ats": ats(fav_agg), "underdog_su": su(dog_agg),
                        "underdog_ats": ats(dog_agg)}}
    return path, title, desc, htm, ids, stats


# -------------------------------------------------------------- hub page

def build_hub(assets, games, engine, cfg, modified, team_stats, pair_stats, pages_by_pair):
    allg = sorted(games.values(), key=lambda g: g["date"])
    home_rows = [persp(g, g["home"]) for g in allg]
    r = agg(home_rows)
    seasons = sorted({g["season"] for g in allg})
    fav = [x for x in home_rows if x["line"] is not None and x["line"] != 0]
    fav_persp = [persp(x["g"], x["g"]["home"] if x["line"] < 0 else x["g"]["away"]) for x in fav]
    fr = agg(fav_persp)

    def league_row(label, xs):
        hr = agg(xs)
        fv = [x for x in xs if x["line"] is not None and x["line"] != 0]
        fp = agg([persp(x["g"], x["g"]["home"] if x["line"] < 0 else x["g"]["away"]) for x in fv])
        tots = [x["total"] for x in xs if x["total"] is not None]
        return (f"<tr><th scope=\"row\">{label}</th><td class=\"n\">{hr['n']:,}</td><td class=\"n\">{fmt_pct(su_pct(hr))}</td>"
                f"<td class=\"n\">{fmt_pct(cover_pct(hr))}</td><td class=\"n\">{fmt_pct(su_pct(fp))}</td><td class=\"n\">{fmt_pct(cover_pct(fp))}</td>"
                f"<td class=\"n\">{fmt_pct(over_pct(hr))}</td><td class=\"n\">{f1(avg(hr['tp'], hr['n']))}</td>"
                f"<td class=\"n\">{f1(avg(sum(tots), len(tots)))}</td></tr>")
    lg_head = ("<thead><tr><th scope=\"col\">Span</th><th class=\"n\" scope=\"col\">Games</th><th class=\"n\" scope=\"col\">Home win%</th>"
               "<th class=\"n\" scope=\"col\">Home cover%</th><th class=\"n\" scope=\"col\">Fav win%</th><th class=\"n\" scope=\"col\">Fav cover%</th>"
               "<th class=\"n\" scope=\"col\">Over%</th><th class=\"n\" scope=\"col\">Avg pts</th><th class=\"n\" scope=\"col\">Avg closing total</th></tr></thead>")
    by_season = defaultdict(list)
    for x in home_rows:
        by_season[x["season"]].append(x)
    recent_seasons = [s for s in seasons][-10:][::-1]
    season_rows = [league_row(str(s), by_season[s]) for s in recent_seasons]
    dec = defaultdict(list)
    for x in home_rows:
        dec[(x["season"] // 10) * 10].append(x)
    dec_rows = [league_row(f"{d}s", dec[d]) for d in sorted(dec, reverse=True)]

    title = "NFL Betting History, ATS Records & Trends Database | Bet Legend Pro"
    desc = (f"{r['n']:,} NFL games since {seasons[0]} with final scores, closing spreads and totals. Team ATS records, "
            f"48 division rivalry histories and league trends by season.")
    h1 = "NFL Betting History &amp; Research"
    path = BASE
    lede = (f"Every NFL game in Bet Legend Pro: <b>{r['n']:,}</b> games from {seasons[0]} through {fmt_date(allg[-1]['date'])}, "
            f"{r['ats_n']:,} graded against a closing spread and {r['ou_n']:,} against a closing total. Home teams have won "
            f"{fmt_pct(su_pct(r))} and covered {fmt_pct(cover_pct(r))}. Favorites have won {fmt_pct(su_pct(fr))} and covered {fmt_pct(cover_pct(fr))}.")
    hero = (f'<header class="hero"><div><p class="eyebrow">Bet Legend Pro research &middot; NFL</p><h1>{h1}</h1>'
            f'<p class="lede">{lede}</p></div></header>')
    k = kpis([("NFL games on file", f"{r['n']:,}", f"{len(seasons)} seasons"),
              ("home team straight up", fmt_pct(su_pct(r)), su(r)),
              ("home team against the spread", fmt_pct(cover_pct(r)), ats(r)),
              ("overs on closing totals", fmt_pct(over_pct(r)), ou(r))])

    div_cards = []
    for div, members in DIVISIONS.items():
        team_links = "".join(
            f'<a href="{team_url(t)}">{logo(t, 28)}<span>{esc(t)}<small>{team_stats[t]["su"]} SU &middot; {team_stats[t]["ats"]} ATS</small></span></a>'
            for t in members)
        rivalry_links = "".join(
            f'<li><a href="{pages_by_pair[frozenset((x, y))]}">{esc(nick(ps["a"]))} vs {esc(nick(ps["b"]))}</a> '
            f'<span>{ps["meetings"]} games</span></li>'
            for (x, y) in division_pairs() if DIVISION_OF[x] == div and frozenset((x, y)) in pages_by_pair
            for ps in [pair_stats[frozenset((x, y))]])
        div_cards.append(f'<div class="divcard"><h3>{esc(div)}</h3><div class="linkgrid tight">{team_links}</div>'
                         f'<ul class="rivals">{rivalry_links}</ul></div>')
    sec_div = f'<section class="panel" id="teams"><h2>Teams and division rivalries</h2><div class="divgrid">{"".join(div_cards)}</div></section>'

    since = cfg["since_realignment"]
    board = []
    for t in TEAMS:
        rows = [persp(games[i], t) for i in engine["teams"][t]["ids"] if games[i]["season"] >= since]
        board.append((t, agg(rows)))
    board.sort(key=lambda kv: (-(cover_pct(kv[1]) or 0), kv[0]))
    bd_head = ("<thead><tr><th class=\"n\" scope=\"col\">#</th><th scope=\"col\">Team</th><th class=\"n\" scope=\"col\">Games</th>"
               "<th scope=\"col\">SU</th><th scope=\"col\">ATS</th><th class=\"n\" scope=\"col\">Cover%</th><th scope=\"col\">O/U</th>"
               "<th class=\"n\" scope=\"col\">Over%</th></tr></thead>")
    bd_rows = [f"<tr><td class=\"n\">{i + 1}</td><th scope=\"row\"><a href=\"{team_url(t)}\">{esc(t)}</a></th><td class=\"n\">{x['n']}</td>"
               f"<td>{su(x)}</td><td>{ats(x)}</td><td class=\"n\">{fmt_pct(cover_pct(x))}</td><td>{ou(x)}</td><td class=\"n\">{fmt_pct(over_pct(x))}</td></tr>"
               for i, (t, x) in enumerate(board)]
    sec_board = (f'<section class="panel" id="ats"><h2>Against the spread since {since}</h2><p class="sub">All 32 teams since the league moved to '
                 f'eight divisions, ranked by cover rate. Regular season and postseason.</p>{table(bd_head, bd_rows)}</section>')
    sec_league = (f'<section class="panel" id="trends"><h2>League trends, last 10 seasons</h2><p class="sub">From the home team\'s side, with favorites '
                  f'measured on the closing spread.</p>{table(lg_head, season_rows)}</section>'
                  f'<section class="panel"><h2>League trends by decade</h2>{table(lg_head, dec_rows)}</section>')
    what = ('<section class="panel prose"><h2>What Bet Legend Pro can answer about the NFL</h2>'
            '<p>The team and rivalry pages here are fixed views of the same database the Bet Legend Pro tool searches. '
            'In the tool you choose two teams and stack conditions on either side: who was home, the month and day, whether a team '
            'was favored and by how much, rest days, winning or losing streaks, the result of the previous game, and the closing total. '
            'It returns the record straight up, against the spread and on the total, and lists every game that qualified with its final '
            'score, closing line and the reason it counted.</p></section>')
    nav = jump([("teams", "Teams and rivalries"), ("ats", "ATS since 2002"), ("trends", "League trends"),
                ("research", "Run custom research")])
    body = (hero + nav + k + sec_div + sec_board + sec_league + what
            + cta("Want to research any NFL matchup under your own conditions?",
                  "Run a custom historical query in Bet Legend Pro: any two teams, who was home, the month, the line, rest and form. "
                  "Every answer lists the exact games behind it.", button="Run an NFL query")
            + '<section class="panel"><h2>More NFL on TrustMyRecord</h2><div class="linkgrid">'
              '<a href="/nfl-simulator/"><span>NFL simulator<small>Simulate any 2026 matchup</small></span></a>'
              '<a href="/nfl-season-simulator/"><span>NFL season simulator<small>All 32 teams projected</small></span></a>'
              '<a href="/handicapping/nfl/"><span>NFL handicapping hub<small>This week\'s games with research</small></span></a>'
              '<a href="/betlegend-pro/"><span>Bet Legend Pro<small>How the research tool works</small></span></a>'
              '</div></section>')
    crumbs = [("TrustMyRecord", "/"), ("Bet Legend Pro", "/betlegend-pro/"), ("NFL", path)]
    schema = [web_page(path, title, desc, {"@type": "SportsOrganization", "name": "National Football League",
                                           "sport": "American football"}, modified, kind="CollectionPage")]
    ids = sorted(games)
    htm = page(assets, path=path, title=title, desc=desc, h1=h1, crumbs=crumbs, body=body, schema=schema,
               og_image=SITE + "/static/og/og-home.png", game_set=ids, modified=modified)
    stats = {"games": r["n"], "home_su": su(r), "home_ats": ats(r), "ou": ou(r), "fav_su": su(fr), "fav_ats": ats(fr)}
    return path, title, desc, htm, ids, stats


# ------------------------------------------------------------------- main

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("data_dir")
    ap.add_argument("--out", default=os.path.abspath(os.path.join(HERE, "..", "..")))
    ap.add_argument("--today", default=date.today().isoformat())
    ap.add_argument("--only", help="write only this page path, e.g. /betlegend-pro/nfl/bears-vs-packers/ "
                    "(every gate still runs over the whole set)")
    args = ap.parse_args()
    cfg = json.load(open(os.path.join(HERE, "config.json"), encoding="utf-8"))["nfl"]
    games_doc, engine, parity = load(args.data_dir)
    games, vr = prepare(games_doc, args.today)
    gate_engine(games, engine, parity, cfg)
    modified = games_doc["meta"]["latest_date"]
    assets = Assets(args.out)

    pages_by_pair, pair_stats, built, skipped = {}, {}, [], []
    for a, b in division_pairs():
        n = engine["matchups"][f"{a}|{b}"]["qualifying_games"]
        if n < cfg["min_meetings"]:  # G6
            skipped.append({"pair": [a, b], "meetings": n})
            continue
        pages_by_pair[frozenset((a, b))] = pair_url(a, b)

    team_stats = {}
    for t in TEAMS:
        path, title, desc, htm, ids, stats = build_team(assets, games, engine, cfg, t, modified, pages_by_pair)
        team_stats[t] = stats
        built.append((path, title, desc, htm, ids, stats, "team"))
    for a, b in division_pairs():
        if frozenset((a, b)) not in pages_by_pair:
            continue
        path, title, desc, htm, ids, stats = build_pair(assets, games, engine, cfg, a, b, modified)
        pair_stats[frozenset((a, b))] = stats
        # G5: the team page row against this rival is the same games and the same numbers.
        ta = team_stats[stats["a"]]["vs"][stats["b"]]
        gate(ta["ids"] == sorted(ids), f"G5 {a}|{b} ids")
        gate(ta["su"] == stats["su_a"] and ta["ats"] == stats["ats_a"] and ta["ou"] == stats["ou"], f"G5 {a}|{b} numbers")
        built.append((path, title, desc, htm, ids, stats, "matchup"))
    path, title, desc, htm, ids, stats = build_hub(assets, games, engine, cfg, modified, team_stats, pair_stats, pages_by_pair)
    built.append((path, title, desc, htm, ids, stats, "hub"))

    for field, idx in (("title", 1), ("description", 2)):
        vals = [p[idx] for p in built]
        gate(len(set(vals)) == len(vals), f"duplicate {field}")

    manifest = {"built_from": games_doc["meta"], "parity_checked_at": parity["checked_at"], "config": cfg,
                "skipped_below_min_meetings": skipped, "pages": []}
    man_path = os.path.join(args.out, "betlegend-pro", "nfl", "manifest.json")
    if args.only:
        gate(any(p[0] == args.only for p in built), f"--only {args.only} is not a page of this build")
        prior = json.load(open(man_path, encoding="utf-8"))
        manifest["pages"] = [p for p in prior["pages"] if p["url"] != SITE + args.only]
        built = [p for p in built if p[0] == args.only]
    for path, title, desc, htm, ids, stats, kind in built:
        dest = os.path.join(args.out, path.strip("/").replace("/", os.sep), "index.html")
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        with open(dest, "w", encoding="utf-8", newline="\n") as fh:
            fh.write(htm)
        manifest["pages"].append({"url": SITE + path, "kind": kind, "title": title, "description": desc,
                                  "games": len(ids), "sha256": hashlib.sha256("\n".join(sorted(ids)).encode()).hexdigest(),
                                  "stats": {k: v for k, v in stats.items() if k != "vs"},
                                  "game_ids": sorted(ids) if kind != "hub" else None})
    manifest["pages"].sort(key=lambda p: p["url"])
    with open(man_path, "w", encoding="utf-8", newline="\n") as fh:
        json.dump(manifest, fh, indent=1)
    print(f"built {len(built)} pages ({sum(1 for p in built if p[6] == 'team')} team, "
          f"{sum(1 for p in built if p[6] == 'matchup')} matchup, {sum(1 for p in built if p[6] == 'hub')} hub); skipped {len(skipped)} below {cfg['min_meetings']} meetings")


if __name__ == "__main__":
    try:
        main()
    except GateFailure as exc:
        print("GATE FAILED:", exc)
        sys.exit(2)
