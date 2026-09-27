"""Independent data audit of the Bet Legend Pro NFL team pages and hub.

    python tests/blp-seo-team-audit.py <data-dir> [--report out.json]

Shares NO code with scripts/blp_seo/build_nfl.py. For every team page it
re-derives, from the engine's game records and the page's own game ID set
(manifest), every cell of: the situation table, the spread and total
buckets, month and day tables, season by season, every opponent, the last
20 games, the moneyline tiles and the headline tiles. For the hub it
re-derives the headline tiles, the ATS since 2002 board and the league
trend tables. Market figures use only the engine's verified seasons.
"""
import html
import json
import os
import re
import sys
from collections import defaultdict
from datetime import date

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
data_dir = sys.argv[1]
G = {g["id"]: g for g in json.load(open(os.path.join(data_dir, "nfl-games.json"), encoding="utf-8"))["games"]}
E = json.load(open(os.path.join(data_dir, "nfl-engine.json"), encoding="utf-8"))
VR = E["meta"]["verified_ranges"]
man = json.load(open(os.path.join(ROOT, "betlegend-pro", "nfl", "manifest.json"), encoding="utf-8"))
cfg = man["config"]
SINCE = cfg["since_realignment"]
MONTH = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
MON3 = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
fails, checked = [], defaultdict(int)


def season(d):
    return int(d[:4]) if int(d[5:7]) >= 3 else int(d[:4]) - 1


def inr(field, s):
    return VR[field][0] <= s <= VR[field][1]


def view(g, team):
    s = season(g["date"])
    home = g["home"] == team
    pf, pa = (g["hs"], g["as"]) if home else (g["as"], g["hs"])
    ln = g["home_line"] if (g["home_line"] is not None and inr("spread", s)) else None
    if ln is not None and not home:
        ln = -ln
    tot = g["total"] if (g["total"] is not None and inr("total", s)) else None
    ml = None
    if g["home_ml"] is not None and g["away_ml"] is not None and inr("moneyline", s):
        ml = g["home_ml"] if home else g["away_ml"]
    return {"id": g["id"], "date": g["date"], "s": s, "home": home, "pf": pf, "pa": pa, "m": pf - pa, "line": ln, "tot": tot,
            "ml": ml, "post": g["season_type"] == "postseason", "opp": g["away"] if home else g["home"],
            "oppname": g["away_name"] if home else g["home_name"]}


def R(w, l, t=0):
    return f"{w}-{l}-{t}" if t else f"{w}-{l}"


def P(a, b):
    return "" if not b else f"{100 * a / b:.1f}%"


def A1(x, n):
    return "" if not n else f"{x / n:.1f}"


def stats(xs):
    w = sum(x["m"] > 0 for x in xs); l = sum(x["m"] < 0 for x in xs); t = len(xs) - w - l
    aw = sum(1 for x in xs if x["line"] is not None and x["m"] + x["line"] > 0)
    al = sum(1 for x in xs if x["line"] is not None and x["m"] + x["line"] < 0)
    ap = sum(1 for x in xs if x["line"] is not None and x["m"] + x["line"] == 0)
    ov = sum(1 for x in xs if x["tot"] is not None and x["pf"] + x["pa"] > x["tot"])
    un = sum(1 for x in xs if x["tot"] is not None and x["pf"] + x["pa"] < x["tot"])
    op = sum(1 for x in xs if x["tot"] is not None and x["pf"] + x["pa"] == x["tot"])
    return {"n": len(xs), "su": R(w, l, t), "winp": P(w + t / 2, len(xs)),
            "ats": R(aw, al, ap) if aw + al + ap else "", "cov": P(aw, aw + al),
            "ou": R(ov, un, op) if ov + un + op else "", "ovp": P(ov, ov + un),
            "pf": A1(sum(x["pf"] for x in xs), len(xs)), "pa": A1(sum(x["pa"] for x in xs), len(xs)),
            "tp": A1(sum(x["pf"] + x["pa"] for x in xs), len(xs)), "w": w, "l": l, "t": t,
            "atsn": aw + al + ap, "oun": ov + un + op}


def txt(f):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", "", f))).strip()


def tables(page):
    """h2 text -> {row label -> [cell texts]} for every table under that h2."""
    out = {}
    for sec in re.findall(r"<h2>(.*?)</h2>(.*?)(?=<h2>|</section>)", page, re.S):
        rows = {}
        for tr in re.findall(r"<tr[^>]*>(.*?)</tr>", sec[1], re.S):
            th = re.search(r'<th scope="row">(.*?)</th>', tr, re.S)
            tds = [txt(x) for x in re.findall(r"<td[^>]*>(.*?)</td>", tr, re.S)]
            if th:
                rows[txt(th.group(1))] = tds
            elif tds:
                rows[tds[0]] = tds[1:]
        out[txt(sec[0])] = rows
    return out


def cmp(where, got, want):
    checked["cells"] += len(want)
    if got != want:
        fails.append(f"{where}: page {got} vs recomputed {want}")


BUCKETS_S = [("Favored by 10 or more", lambda l: l <= -10), ("Favored by 7 to 9.5", lambda l: -9.5 <= l <= -7),
             ("Favored by 3.5 to 6.5", lambda l: -6.5 <= l <= -3.5), ("Favored by 0.5 to 3", lambda l: -3 <= l <= -0.5),
             ("Pick'em", lambda l: l == 0), ("Underdog of 0.5 to 3", lambda l: 0.5 <= l <= 3),
             ("Underdog of 3.5 to 6.5", lambda l: 3.5 <= l <= 6.5), ("Underdog of 7 or more", lambda l: l >= 7)]
BUCKETS_T = [("Under 38", lambda t: t < 38), ("38 to 41.5", lambda t: 38 <= t < 42), ("42 to 44.5", lambda t: 42 <= t < 45),
             ("45 to 47.5", lambda t: 45 <= t < 48), ("48 or higher", lambda t: t >= 48)]

pages_ok = {}
for p in man["pages"]:
    if p["kind"] != "team":
        continue
    before = len(fails)
    path = p["url"].replace("https://trustmyrecord.com", "")
    page = open(os.path.join(ROOT, path.strip("/"), "index.html"), encoding="utf-8").read()
    team = re.search(r"<h1>(.*?) Betting History", page).group(1)
    team = html.unescape(team)
    ids = p["game_ids"]
    if sorted(E["teams"][team]["ids"]) != ids:
        fails.append(f"{team}: manifest set differs from engine set")
    X = sorted((view(G[i], team) for i in ids), key=lambda x: x["date"])
    T = tables(page)
    nk = team.rsplit(" ", 1)[1]

    # situation table
    sit = T[f"{nk} records by situation"]
    prev = {}
    for k in range(1, len(X)):
        if X[k]["s"] == X[k - 1]["s"]:
            pm = X[k - 1]["m"]
            prev[X[k]["id"]] = "W" if pm > 0 else ("L" if pm < 0 else "T")
    defs = {
        "All games": X, "Home": [x for x in X if x["home"]], "Road": [x for x in X if not x["home"]],
        "Favorite": [x for x in X if x["line"] is not None and x["line"] < 0],
        "Underdog": [x for x in X if x["line"] is not None and x["line"] > 0],
        "Home favorite": [x for x in X if x["home"] and x["line"] is not None and x["line"] < 0],
        "Home underdog": [x for x in X if x["home"] and x["line"] is not None and x["line"] > 0],
        "Road favorite": [x for x in X if not x["home"] and x["line"] is not None and x["line"] < 0],
        "Road underdog": [x for x in X if not x["home"] and x["line"] is not None and x["line"] > 0],
        "Regular season": [x for x in X if not x["post"]], "Postseason": [x for x in X if x["post"]],
        "After a win (same season)": [x for x in X if prev.get(x["id"]) == "W"],
        "After a loss (same season)": [x for x in X if prev.get(x["id"]) == "L"],
    }
    for label, xs in defs.items():
        if not xs:
            continue
        st = stats(xs)
        cmp(f"{team} situation '{label}'", sit.get(label), [str(st["n"]), st["su"], st["winp"], st["ats"], st["cov"], st["ou"], st["ovp"], st["pf"], st["pa"]])
    rival_label = next((k for k in sit if k.startswith("Vs ") and "rivals since" in k), None)
    if rival_label:
        # the rivals are the teams on the division head to head cards of this page
        rv = set(html.unescape(x) for x in re.findall(r'<a href="/betlegend-pro/nfl/[a-z0-9-]+-vs-[a-z0-9-]+/"><img[^>]*alt="([^"]+) logo"', page))
        st = stats([x for x in X if x["s"] >= SINCE and x["opp"] in rv])
        cmp(f"{team} '{rival_label}'", sit.get(rival_label), [str(st["n"]), st["su"], st["winp"], st["ats"], st["cov"], st["ou"], st["ovp"], st["pf"], st["pa"]])

    Y = [x for x in X if x["s"] >= SINCE]

    def bucket_check(title, groups):
        tb = T[title]
        for label, xs in groups:
            if not xs:
                continue
            st = stats(xs)
            cmp(f"{team} {title} '{label}'", tb.get(label), [str(st["n"]), st["su"], st["ats"], st["cov"], st["ou"], st["ovp"], st["tp"]])
    bucket_check(f"By closing spread since {SINCE}", [(l, [x for x in Y if x["line"] is not None and f(x["line"])]) for l, f in BUCKETS_S])
    bucket_check(f"By closing total since {SINCE}", [(l, [x for x in Y if x["tot"] is not None and f(x["tot"])]) for l, f in BUCKETS_T])
    bucket_check(f"By month since {SINCE}", [(MONTH[m], [x for x in Y if int(x["date"][5:7]) == m]) for m in (9, 10, 11, 12, 1, 2)])
    bucket_check(f"By day of the week since {SINCE}",
                 [(d, [x for x in Y if DAYS[date.fromisoformat(x["date"]).weekday()] == d]) for d in ("Sunday", "Monday", "Thursday", "Saturday")])

    # seasons
    bys = defaultdict(list)
    for x in X:
        bys[x["s"]].append(x)
    sea = T["Season by season"]
    for s in sorted(bys)[-cfg["recent_seasons"]:]:
        st = stats(bys[s])
        po = stats([x for x in bys[s] if x["post"]])
        cmp(f"{team} season {s}", sea.get(str(s)), [str(st["n"]), st["su"], st["ats"], st["ou"], st["pf"], st["pa"], po["su"] if po["n"] else ""])

    # every opponent
    byo = defaultdict(list)
    for x in X:
        byo[x["opp"]].append(x)
    opp = T[f"{nk} against every opponent"]
    for o, xs in byo.items():
        st = stats(xs)
        lm = xs[-1]
        res = "W" if lm["m"] > 0 else ("L" if lm["m"] < 0 else "T")
        cmp(f"{team} vs {o}", opp.get(o), [str(st["n"]), st["su"], st["ats"], st["ou"],
                                            f"{MON3[int(lm['date'][5:7])]} {int(lm['date'][8:10])}, {lm['date'][:4]}, {res} {lm['pf']}-{lm['pa']}"])
    if len(opp) != len(byo):
        fails.append(f"{team}: {len(opp)} opponent rows vs {len(byo)} opponents in the game set")

    # last 20 games, row by row
    rec_rows = re.findall(r'<tr data-game-id="([^"]+)">(.*?)</tr>', page, re.S)
    want_ids = [x["id"] for x in X[-cfg["recent_games"]:][::-1]]
    if [html.unescape(i) for i, _ in rec_rows] != want_ids:
        fails.append(f"{team}: recent games are not the newest {cfg['recent_games']}")
    for (gid, tr), x in zip(rec_rows, X[-cfg["recent_games"]:][::-1]):
        tds = [txt(c) for c in re.findall(r"<td[^>]*>(.*?)</td>", tr, re.S)]
        res = "W" if x["m"] > 0 else ("L" if x["m"] < 0 else "T")
        lt = "" if x["line"] is None else ("PK" if x["line"] == 0 else ("+" if x["line"] > 0 else "-") + f"{abs(x['line']):g}")
        at = "" if x["line"] is None else ("W" if x["m"] + x["line"] > 0 else ("L" if x["m"] + x["line"] < 0 else "P"))
        ot = "" if x["tot"] is None else ("O" if x["pf"] + x["pa"] > x["tot"] else ("U" if x["pf"] + x["pa"] < x["tot"] else "P"))
        want = [f"{MON3[int(x['date'][5:7])]} {int(x['date'][8:10])}, {x['date'][:4]}",
                f"{'vs' if x['home'] else 'at'} {x['oppname']}{' (playoffs)' if x['post'] else ''}",
                f"{res} {x['pf']}-{x['pa']}", lt, at, "" if x["tot"] is None else f"{x['tot']:g}", ot]
        cmp(f"{team} recent {x['date']}", tds, want)

    # headline tiles
    st = stats(X)
    vis = txt(page[page.index("<main"):page.index("</main>")])
    for claim in (f"{st['n']:,} games since the {X[0]['s']} season", f"{st['su']} straight up", f"{st['ats']} against the spread over {st['atsn']:,} graded lines",
                  f"{st['ou']} on {st['oun']:,} closing totals"):
        checked["claims"] += 1
        if claim not in vis:
            fails.append(f"{team}: headline '{claim}' not on the page")
    mls = [x for x in X if x["ml"] is not None]
    if mls:
        def u(x):
            if x["m"] == 0:
                return 0.0
            if x["m"] < 0:
                return -1.0
            return x["ml"] / 100 if x["ml"] > 0 else 100 / -x["ml"]
        for lab, xs in ((f"all games", mls), ("as moneyline favorite", [x for x in mls if x["ml"] < 0]), ("as moneyline underdog", [x for x in mls if x["ml"] > 0])):
            w = sum(x["m"] > 0 for x in xs); l = sum(x["m"] < 0 for x in xs); un = sum(u(x) for x in xs)
            want = f"{R(w, l)}{lab}{('+' if un > 0 else '')}{un:.2f} units"
            checked["claims"] += 1
            if want.replace(" ", "") not in vis.replace(" ", ""):
                fails.append(f"{team}: moneyline '{lab}' expected {want}")
    pages_ok[path] = len(fails) == before

# ---------------------------------------------------------------- hub
hub = open(os.path.join(ROOT, "betlegend-pro", "nfl", "index.html"), encoding="utf-8").read()
HX = [view(g, g["home"]) for g in sorted(G.values(), key=lambda g: g["date"])]
hst = stats(HX)
hv = txt(hub[hub.index("<main"):hub.index("</main>")])
before = len(fails)
for claim in (f"{hst['n']:,} games", f"{hst['atsn']:,} graded against a closing spread", f"{hst['oun']:,} against a closing total",
              f"Home teams have won {hst['winp']} and covered {hst['cov']}"):
    checked["claims"] += 1
    if claim not in hv:
        fails.append(f"hub: '{claim}' not on the page")
HT = tables(hub)
board = HT[f"Against the spread since {SINCE}"]
for t in E["teams"]:
    st = stats([view(G[i], t) for i in E["teams"][t]["ids"] if season(G[i]["date"]) >= SINCE])
    row = board.get(t)  # cells: rank, games, SU, ATS, cover, O/U, over
    cmp(f"hub board {t}", row[1:] if row else None, [str(st["n"]), st["su"], st["ats"], st["cov"], st["ou"], st["ovp"]])


def league(xs):
    st = stats(xs)
    fv = [x for x in xs if x["line"] is not None and x["line"] != 0]
    fp = stats([view(G[x["id"]], G[x["id"]]["home"] if x["line"] < 0 else G[x["id"]]["away"]) for x in fv])
    tots = [x["tot"] for x in xs if x["tot"] is not None]
    return [f"{st['n']:,}", st["winp"], st["cov"], fp["winp"], fp["cov"], st["ovp"], st["tp"], A1(sum(tots), len(tots))]


bys = defaultdict(list)
dec = defaultdict(list)
for x in HX:
    bys[x["s"]].append(x)
    dec[x["s"] // 10 * 10].append(x)
tr10 = HT["League trends, last 10 seasons"]
for s in sorted(bys)[-10:]:
    cmp(f"hub season {s}", tr10.get(str(s)), league(bys[s]))
trd = HT["League trends by decade"]
for d in dec:
    cmp(f"hub decade {d}s", trd.get(f"{d}s"), league(dec[d]))
pages_ok["/betlegend-pro/nfl/"] = len(fails) == before

for f in fails[:60]:
    print("FAIL", f)
print(f"team pages + hub: {len(pages_ok)} pages, {checked['cells']} table cells and {checked['claims']} headline figures re-derived, "
      f"{sum(pages_ok.values())} pages pass, {len(fails)} failures")
if "--report" in sys.argv:
    json.dump({"pages_ok": pages_ok, "checked": checked, "fails": fails},
              open(sys.argv[sys.argv.index("--report") + 1], "w", encoding="utf-8"), indent=1)
sys.exit(1 if fails else 0)
