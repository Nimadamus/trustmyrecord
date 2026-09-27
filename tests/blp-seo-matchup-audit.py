"""Independent data audit of one BetLegend Pro matchup page.

    python tests/blp-seo-matchup-audit.py bears-vs-packers <data-dir> [--espn]

Deliberately shares NO code with scripts/blp_seo/build_nfl.py. It reads the
rendered HTML, parses every game row the page prints, and proves:

  A  the page's game set = the manifest = the engine's matchup set, and the
     live tool's meeting count, first and last meeting agree (prod-parity.json)
  B  every printed row equals the engine record for that game ID: date, home
     team, both scores, the margin, the favorite, the spread, the total, the
     moneyline, and the ATS and O/U letters recomputed from those numbers
  C  every summary number printed on the page (lede, tiles, splits, last 10,
     decades, moneyline, notes) recomputes exactly from the printed rows
  D  with --espn, every meeting is compared with ESPN's schedule feed
     (independent source): date within a day, home team and final score

Exit 1 on any mismatch in A to C. D is reported (ESPN's older seasons are
incomplete, so a missing ESPN game is listed, not failed).
"""
import html
import json
import os
import re
import sys
import urllib.request
from collections import defaultdict
from datetime import date

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
slug, data_dir = sys.argv[1], sys.argv[2]
page = open(os.path.join(ROOT, "betlegend-pro", "nfl", slug, "index.html"), encoding="utf-8").read()
games = {g["id"]: g for g in json.load(open(os.path.join(data_dir, "nfl-games.json"), encoding="utf-8"))["games"]}
engine = json.load(open(os.path.join(data_dir, "nfl-engine.json"), encoding="utf-8"))
parity = json.load(open(os.path.join(data_dir, "prod-parity.json"), encoding="utf-8"))
manifest = json.load(open(os.path.join(ROOT, "betlegend-pro", "nfl", "manifest.json"), encoding="utf-8"))
vr = engine["meta"]["verified_ranges"]
fails, notes, ledger = [], [], []


def check(ok, msg):
    if not ok:
        fails.append(msg)


def text(fragment):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", fragment))).strip()


def section(sec_id):
    m = re.search(r'<section[^>]*id="' + sec_id + r'"[^>]*>(.*?)</section>', page, re.S)
    return m.group(1) if m else ""


def nums(rec_txt):
    p = [int(x) for x in rec_txt.split("-")]
    return tuple(p + [0] * (3 - len(p)))


def rec(w, l, t=0):
    return f"{w}-{l}-{t}" if t else f"{w}-{l}"


# ------------------------------------------------------------- parse rows
MONTHS = {m: i for i, m in enumerate(["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], 1)}
h1 = text(re.search(r"<h1>(.*?)</h1>", page).group(1))
na, nb = re.match(r"(.+?) vs (.+?) Betting History", h1).groups()


def parse_rows(fragment):
    out = []
    for gid, tr in re.findall(r'<tr data-game-id="([^"]+)">(.*?)</tr>', fragment, re.S):
        tds = re.findall(r"<td[^>]*>(.*?)</td>", tr, re.S)
        d = re.match(r"(\w{3}) (\d+), (\d{4})", text(tds[0]))
        home_cell = re.match(r"(.*?)<small>", tds[1])
        res, pf, pa = re.match(r"([WLT]) (\d+)-(\d+)", text(tds[2])).groups()
        out.append({
            "id": html.unescape(gid),
            "date": date(int(d.group(3)), MONTHS[d.group(1)], int(d.group(2))).isoformat(),
            "post": "playoffs" in tds[0],
            "home_name": text(home_cell.group(1) if home_cell else tds[1]),
            "res": res, "pf": int(pf), "pa": int(pa), "margin": int(text(tds[3])),
            "fav": text(tds[4]) or None, "line": text(tds[5]) or None, "ats": text(tds[6]) or None,
            "total": text(tds[7]) or None, "ou": text(tds[8]) or None, "ml": text(tds[9]) or None,
        })
    return out


rows = parse_rows(section("meetings"))
recent_rows = parse_rows(section("recent"))
ids = sorted(r["id"] for r in rows)

# ------------------------------------------------------------------- A
entry = next(p for p in manifest["pages"] if p["url"].endswith(f"/{slug}/"))
key = next(k for k in engine["matchups"] if {s for s in k.split("|")} == {entry["stats"]["a"], entry["stats"]["b"]})
live = next(p for p in parity["pairs"] if p["pair"] == key)
check(len(ids) == len(set(ids)), "A duplicate game rows")
check(ids == entry["game_ids"], "A page rows differ from manifest game IDs")
check(ids == sorted(engine["matchups"][key]["ids"]), "A page rows differ from the engine's matchup set")
check(live["match"] and live["live"][0] == len(ids), "A live tool meeting count differs")
check(live["live"][1] == min(r["date"] for r in rows) and live["live"][2] == max(r["date"] for r in rows),
      "A live tool first/last meeting differs")
check([r["id"] for r in recent_rows] == [r["id"] for r in rows[:len(recent_rows)]], "A recent table is not the newest meetings")
check(parity["dataset"]["match"], "A NFL game count differs from the live tool")
digest = re.search(r'<meta name="blp-game-set" content="n=(\d+) sha256=([0-9a-f]+)">', page)
import hashlib  # noqa: E402
check(digest and digest.group(2) == hashlib.sha256("\n".join(ids).encode()).hexdigest(), "A page digest does not match its rows")

# ------------------------------------------------------------------- B
A = entry["stats"]["a"]
B = entry["stats"]["b"]
nick = {A: na, B: nb}


def season(d):
    return int(d[:4]) if int(d[5:7]) >= 3 else int(d[:4]) - 1


def fmt_line(v):
    return None if v is None else ("PK" if v == 0 else ("+" if v > 0 else "-") + f"{abs(v):g}")


for r in rows:
    g = games[r["id"]]
    s = season(g["date"])
    a_home = g["home"] == A
    pf, pa = (g["hs"], g["as"]) if a_home else (g["as"], g["hs"])
    line = g["home_line"] if (g["home_line"] is not None and vr["spread"][0] <= s <= vr["spread"][1]) else None
    tot = g["total"] if (g["total"] is not None and vr["total"][0] <= s <= vr["total"][1]) else None
    ml = None
    if g["home_ml"] is not None and vr["moneyline"][0] <= s <= vr["moneyline"][1]:
        ml = g["home_ml"] if a_home else g["away_ml"]
    a_line = None if line is None else (line if a_home else -line)
    exp = {
        "date": g["date"], "home_name": g["home_name"], "pf": pf, "pa": pa, "margin": pf - pa,
        "res": "W" if pf > pa else ("L" if pf < pa else "T"),
        "post": g["season_type"] == "postseason",
        "line": fmt_line(a_line),
        "fav": None if a_line is None else ("Pick'em" if a_line == 0 else (na if a_line < 0 else nb)),
        "ats": None if a_line is None else ("W" if pf - pa + a_line > 0 else ("L" if pf - pa + a_line < 0 else "P")),
        "total": None if tot is None else f"{tot:g}",
        "ou": None if tot is None else ("O" if pf + pa > tot else ("U" if pf + pa < tot else "P")),
        "ml": None if ml is None else (f"+{int(ml)}" if ml > 0 else str(int(ml))),
    }
    for k, v in exp.items():
        check(r[k] == v, f"B {r['id']} {k}: page {r[k]!r} vs engine {v!r}")


# ------------------------------------------------------------------- C
def agg(rs, side="a"):
    """Recompute from printed rows only. side 'a' = the page's first team, 'b' = the other."""
    sg = 1 if side == "a" else -1
    o = defaultdict(int)
    for r in rs:
        m = r["margin"] * sg
        o["n"] += 1
        o["w"] += m > 0
        o["l"] += m < 0
        o["t"] += m == 0
        o["msum"] += m
        o["tp"] += r["pf"] + r["pa"]
        o["absm"] += abs(m)
        if r["ats"]:
            a = {"W": "W", "L": "L", "P": "P"}[r["ats"]] if sg == 1 else {"W": "L", "L": "W", "P": "P"}[r["ats"]]
            o["a" + a] += 1
        if r["ou"]:
            o["o" + r["ou"]] += 1
        if r["ml"]:
            o["mln"] += 1
    return o


def su(o):
    return rec(o["w"], o["l"], o["t"])


def ats(o):
    return rec(o["aW"], o["aL"], o["aP"])


def ou(o):
    return rec(o["oO"], o["oU"], o["oP"])


all_a = agg(rows)
main_html = page[page.index("<main"):page.index("</main>")]
# inline tags (b, span, a) join without a space; block ends become one
visible = re.sub(r"\s+", " ", html.unescape(re.sub(r"<(?!/?(b|span|a|small|em)\b)[^>]+>", " ", main_html)))
visible = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", visible))
lead_b = all_a["l"] > all_a["w"]
series = rec(all_a["l"], all_a["w"], all_a["t"]) if lead_b else su(all_a)
level = all_a["l"] == all_a["w"]
gap = abs(all_a["msum"]) / all_a["n"]
gap_claim = ("averaged the same points per game" if round(gap, 1) == 0 else
             f"the {na if all_a['msum'] > 0 else nb} have outscored the {nb if all_a['msum'] > 0 else na} by {gap:.1f} points a game")
claims = {
    "meeting count": f"{all_a['n']} meetings",
    "series": f"series is level at {su(all_a)}" if level else f"lead the series {series}",
    f"{na} ATS": f"the {na} are {ats(all_a)}",
    f"{nb} ATS": f"({nb} {rec(all_a['aL'], all_a['aW'], all_a['aP'])})",
    "over/under": f"the over is {ou(all_a)}",
    "points per game gap": gap_claim,
    "average margin tile": f"{all_a['absm'] / all_a['n']:.1f} pts",
    "one score games": f"{sum(1 for r in rows if abs(r['margin']) <= 8)} of {all_a['n']} decided by 8 or fewer",
    "ATS graded": f"{all_a['aW'] + all_a['aL'] + all_a['aP']} of {all_a['n']} meetings graded",
    "O/U graded": f"{all_a['oO'] + all_a['oU'] + all_a['oP']} of {all_a['n']} meetings graded",
    "home team record": "The home team is " + rec(sum(1 for r in rows if (r["margin"] > 0) == (games[r["id"]]["home"] == A) and r["margin"]),
                                                  sum(1 for r in rows if (r["margin"] > 0) != (games[r["id"]]["home"] == A) and r["margin"])),
}
for label, claim in claims.items():
    check(claim in visible, f"C {label}: expected '{claim}' on the page")
    ledger.append({"figure": label, "recomputed_from_rows": claim, "on_page": claim in visible})


def graded_cell(o, kind):
    """What the page must print: the record, plus '(graded of games)' when not every game has a verified number."""
    if kind == "ats":
        n = o["aW"] + o["aL"] + o["aP"]
        r_ = ats(o)
    else:
        n = o["oO"] + o["oU"] + o["oP"]
        r_ = ou(o)
    if not n:
        return ""
    return r_ if n == o["n"] else f"{r_} ({n} of {o['n']})"


def split_row(label):
    tr = re.search(r"<tr><th scope=\"row\">" + re.escape(html.escape(label)) + r"</th>(.*?)</tr>", section("overview"), re.S)
    return [text(x) for x in re.findall(r"<td[^>]*>(.*?)</td>", tr.group(1), re.S)] if tr else None


def expect_split(label, rs, side):
    o = agg(rs, side)
    got = split_row(label)
    want = [str(o["n"]), su(o), graded_cell(o, "ats"), graded_cell(o, "ou"), f"{o['msum'] / o['n']:+.1f}", f"{o['tp'] / o['n']:.1f}"]
    check(got == want, f"C split '{label}': page {got} vs rows {want}")
    ledger.append({"figure": f"split: {label}", "recomputed_from_rows": " | ".join(want), "page": " | ".join(got or []), "on_page": got == want})


expect_split(f"{na}, all meetings", rows, "a")
expect_split(f"{na}, last {len(recent_rows)} meetings", rows[:len(recent_rows)], "a")
expect_split(f"{na} at home", [r for r in rows if games[r["id"]]["home"] == A], "a")
expect_split(f"{nb} at home", [r for r in rows if games[r["id"]]["home"] == B], "b")
fav_a = [r for r in rows if r["fav"] == na]
fav_b = [r for r in rows if r["fav"] == nb]
# favorite rows: flip each game to the favorite's side, then count
fav_side = [dict(r, margin=r["margin"], ats=r["ats"]) for r in fav_a] + \
           [dict(r, margin=-r["margin"], ats={"W": "L", "L": "W", "P": "P", None: None}[r["ats"]]) for r in fav_b]
dog_side = [dict(r, margin=-r["margin"], ats={"W": "L", "L": "W", "P": "P", None: None}[r["ats"]]) for r in fav_a] + \
           [dict(r, margin=r["margin"], ats=r["ats"]) for r in fav_b]
expect_split("Closing favorite", fav_side, "a")
expect_split("Closing underdog", dog_side, "a")

rsum = agg(recent_rows)
check(f"{na} {su(rsum)} straight up, {ats(rsum)} against the spread, over/under {ou(rsum)}" in text(section("recent")),
      "C recent meetings summary line")

dec = defaultdict(list)
for r in rows:
    dec[(season(r["date"]) // 10) * 10].append(r)
dec_html = section("decades")
for d, rs in dec.items():
    o = agg(rs)
    tr = re.search(rf"<tr><th scope=\"row\">{d}s</th>(.*?)</tr>", dec_html, re.S)
    got = [text(x) for x in re.findall(r"<td[^>]*>(.*?)</td>", tr.group(1), re.S)] if tr else None
    tots = [float(r["total"]) for r in rs if r["total"]]
    want = [str(o["n"]), su(o), graded_cell(o, "ats"), graded_cell(o, "ou"), f"{o['msum'] / o['n']:+.1f}", f"{o['tp'] / o['n']:.1f}",
            f"{sum(tots) / len(tots):.1f}" if tots else ""]
    check(got == want, f"C decade {d}s: page {got} vs rows {want}")
    ledger.append({"figure": f"decade: {d}s", "recomputed_from_rows": " | ".join(want), "page": " | ".join(got or []), "on_page": got == want})
check(sum(len(v) for v in dec.values()) == len(rows), "C decades do not add up to the meeting count")

# moneyline: units recomputed from printed prices
mlr = [r for r in rows if r["ml"]]
if mlr:
    def units(price, won):
        return (price / 100 if price > 0 else 100 / -price) if won else -1.0
    ua = sum(units(int(r["ml"]), r["margin"] > 0) for r in mlr if r["margin"])
    ub = 0.0
    for r in mlr:
        g = games[r["id"]]
        pb = g["away_ml"] if g["home"] == A else g["home_ml"]
        if r["margin"]:
            ub += units(pb, r["margin"] < 0)
    wa = sum(1 for r in mlr if r["margin"] > 0)
    la = sum(1 for r in mlr if r["margin"] < 0)
    check(f"{len(mlr)} meetings with a verified closing moneyline" in visible, "C moneyline sample")
    def tile(value, label, sub):
        return re.search(re.escape(value) + r" ?" + re.escape(label) + r" ?" + re.escape(sub), visible) is not None
    check(tile(rec(wa, la), f"{na} moneyline", f"{ua:+.2f} units"), f"C {na} moneyline units {ua:+.2f}")
    check(tile(rec(la, wa), f"{nb} moneyline", f"{ub:+.2f} units"), f"C {nb} moneyline units {ub:+.2f}")

# ------------------------------------------------------------------- D
if "--espn" in sys.argv:
    # ESPN team ids survive relocations (Oakland, San Diego, St. Louis, Houston Oilers), abbreviations do not.
    logos = json.load(open(os.path.join(ROOT, "data", "team-logos.json"), encoding="utf-8"))["sports"]["nfl"]["teams"]
    tid = {t["display"]: t["id"] for t in logos}
    who = {tid[A]: A, tid[B]: B}
    ESPN_FROM = 2002  # ESPN's feed before this is incomplete and carries 0-0 placeholders and misdated games
    espn, stamp = {}, {}
    for yr in sorted({season(r["date"]) for r in rows if season(r["date"]) >= ESPN_FROM}):
        for st in (2, 3):
            url = f"https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/{tid[A]}/schedule?season={yr}&seasontype={st}"
            d = None
            for attempt in range(6):
                try:
                    d = json.load(urllib.request.urlopen(url, timeout=30))
                    break
                except Exception as exc:  # noqa: BLE001
                    err = exc
                    import time
                    time.sleep(2 + 3 * attempt)
            if d is None:
                fails.append(f"D ESPN {yr} type {st} unreachable: {err}")
                continue
            for ev in d.get("events", []):
                comp = ev["competitions"][0]["competitors"]
                by = {c["team"]["id"]: c for c in comp}
                if tid[A] in by and tid[B] in by:
                    home = who[next(c for c in comp if c["homeAway"] == "home")["team"]["id"]]
                    sa = (by[tid[A]].get("score") or {}).get("value")
                    sb = (by[tid[B]].get("score") or {}).get("value")
                    if sa is not None and (sa, sb) != (0, 0):
                        espn.setdefault(ev["date"][:10], []).append((home, int(sa), int(sb)))
                        stamp[(ev["date"][:10], (home, int(sa), int(sb)))] = ev["date"]
    from datetime import date as _d, timedelta
    checked = [r for r in rows if season(r["date"]) >= ESPN_FROM]
    matched = 0
    used = set()
    for r in checked:
        dd = _d.fromisoformat(r["date"])
        mine = (games[r["id"]]["home"], r["pf"], r["pa"])
        keys = [(dd + timedelta(days=o)).isoformat() for o in (0, 1, -1)]
        cands = [(k, v) for k in keys for v in espn.get(k, [])]
        if not cands:
            fails.append(f"D ESPN has no meeting near {r['date']}")
            continue
        hit = next(((k, v) for k, v in cands if v == mine), None)
        if hit:
            matched += 1
            used.add(hit)
        else:
            fails.append(f"D ESPN disagrees on {r['date']}: ESPN {cands[0][1]}, page {mine}")
    extra = [(k, v) for k, vs in espn.items() for v in vs if (k, v) not in used]
    notes.append(f"D ESPN matched {matched} of {len(checked)} meetings since {ESPN_FROM}")
    for k, v in extra:
        # A time of exactly midnight Eastern (05:00Z / 04:00Z) is ESPN's date only placeholder record; seen
        # carrying scores from other games (a third 2004 Broncos vs Chiefs game, a 1969 Bears vs Packers game
        # with the 1970 score). Reported, not failed, when every real meeting already matched.
        placeholder = stamp.get((k, v), "").endswith(("T05:00Z", "T04:00Z"))
        if placeholder and matched == len(checked):
            notes.append(f"D ignored ESPN placeholder record {stamp[(k, v)]} {v}: not a real meeting")
        else:
            fails.append(f"D ESPN lists a meeting on {k} {v} that the page does not")

b_fields = sum(1 for _ in rows) * 13
ledger.insert(0, {"figure": "rows vs engine records", "recomputed_from_rows": f"{len(rows)} rows x 13 fields = {b_fields} field checks", "on_page": not any(f.startswith("B ") for f in fails)})
ledger.insert(0, {"figure": "game set", "recomputed_from_rows": f"{len(ids)} IDs = manifest = engine set; live tool {live['live']}", "on_page": not any(f.startswith("A ") for f in fails)})
if "--report" in sys.argv:
    json.dump({"ledger": ledger, "notes": notes, "fails": fails}, open(sys.argv[sys.argv.index("--report") + 1], "w", encoding="utf-8"), indent=1)
for n in notes:
    print("NOTE", n)
for f in fails:
    print("FAIL", f)
print(f"{slug}: {len(rows)} rows audited, {len(fails)} failures")
sys.exit(1 if fails else 0)
