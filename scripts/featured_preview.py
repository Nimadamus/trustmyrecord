#!/usr/bin/env python3
"""Research preview for every Featured Matchup page (FEATURED_PREVIEW_20260929).

Nima, 2026-09-29: the Featured Matchup pages shipped as 50 word stubs and
AdSense reviewed the site as low value content. Every page this rotation owns
now carries a real matchup preview built from the ESPN game feed: form,
recent results, offensive and defensive numbers, starters, injuries, rest,
home and road splits, the price, the head to head, the key factors and a
written read. A finished game also gets how it played out.

Rules this file keeps:
  * Only facts read from the feed. A module with no data is omitted silently
    (NO_INTERNAL_DISCLAIMERS_20260909). Nothing is estimated or invented.
  * No dashes as punctuation in prose. Scores and records keep their hyphen.
  * The page URL, title, meta description, canonical and JSON-LD are never
    touched here. Only the body between the when line and the link row.

build(sport, league, event_id, kickoff, get) returns (html, state) or None.
"""

import datetime as dt
import html
import re

import nfl_featured_rotation as nfl

BASE = "https://site.api.espn.com/apis/site/v2/sports/"
WEB = "https://site.web.api.espn.com/apis/common/v3/sports/"
CORE = "https://sports.core.api.espn.com/v2/sports/"
PATHS = {"mlb": "baseball/mlb", "ncaaf": "football/college-football", "nfl": "football/nfl"}
SOCCER = {"Premier League": "eng.1", "LaLiga": "esp.1", "Bundesliga": "ger.1", "Serie A": "ita.1",
          "Ligue 1": "fra.1", "Champions League": "uefa.champions", "MLS": "usa.1"}
TENNIS = {"ATP": "atp", "WTA": "wta"}
FINAL = ("post",)

CSS = """/*FEATURED_PREVIEW_CSS*/
  .fp h2{font:800 1.3rem/1.3 Inter,system-ui,sans-serif;margin:34px 0 10px;color:#fff}
  .fp h3{font:800 1rem/1.3 Inter,system-ui,sans-serif;margin:20px 0 6px;color:#dfe8f5}
  .fp ul{padding-left:1.2rem;margin:8px 0 14px}
  .fp li{font:500 1rem/1.55 Inter,system-ui,sans-serif;margin:6px 0}
  .fp table{display:block;overflow-x:auto;max-width:100%;border-collapse:collapse;margin:10px 0 16px;font:500 .95rem/1.4 Inter,system-ui,sans-serif}
  .fp th,.fp td{padding:7px 8px;border-bottom:1px solid #1d2636;text-align:left}
  .fp th{color:#8A97A8;font-weight:800;font-size:.8rem;letter-spacing:.06em;text-transform:uppercase}
  .fp td.n{text-align:right;font-variant-numeric:tabular-nums}
  .fp .fp-src{color:#8A97A8;font-size:.9rem;margin-top:26px}
  main{max-width:46rem}
  .fp .fp-final{background:#0f1726;border:1px solid #1d2636;border-radius:12px;padding:14px 16px}
  @media (max-width:520px){.fp th,.fp td{padding:6px 5px;font-size:.85rem}}
/*/FEATURED_PREVIEW_CSS*/
"""


# ---------------------------------------------------------------- helpers

def esc(value):
    return html.escape(str(value), quote=True)


def _get(get, url):
    try:
        data = get(url)
    except Exception:  # noqa: BLE001 - one feed down drops that module only
        return None
    return data if isinstance(data, dict) else None


def _num(value):
    try:
        return float(str(value).replace(",", "").replace("+", ""))
    except (TypeError, ValueError):
        return None


def _fmt(value, digits=1):
    if value is None:
        return ""
    if abs(value - round(value)) < 1e-9 and digits <= 1:
        return "%d" % round(value)
    return ("%." + str(digits) + "f") % value


def _ml(value):
    v = _num(value)
    if v is None:
        return ""
    return "+%d" % v if v > 0 else "%d" % v


def _implied(ml):
    v = _num(ml)
    if v is None or v == 0:
        return None
    return 100.0 / (v + 100.0) if v > 0 else -v / (-v + 100.0)


def _ordinal(n):
    n = int(n)
    suffix = "th" if 10 <= n % 100 <= 20 else {1: "st", 2: "nd", 3: "rd"}.get(n % 10, "th")
    return "%d%s" % (n, suffix)


def _parse(value):
    return nfl.parse_utc(value)


def _et_day(when):
    k = nfl.et(when)
    return "%s, %s %d" % (k.strftime("%A"), k.strftime("%B"), k.day)


NUMS = {1: "one", 2: "two", 3: "three", 4: "four", 5: "five", 6: "six"}


def _n(count, word, plural=None):
    return "%s %s" % (_fmt(count), word if count == 1 else (plural or word + "s"))


def _pct3(v):
    return ("%.3f" % v).lstrip("0") if v < 1 else "%.3f" % v


def _poss(name):
    return name + ("'" if name.endswith("s") else "'s")


def _table(head, rows):
    if not rows:
        return ""
    keep = [i for i in range(len(head)) if i == 0 or any(str(r[i]).strip() for r in rows)]
    if len(keep) < 2:
        return ""
    head = [head[i] for i in keep]
    rows = [[r[i] for i in keep] for r in rows]
    out = ["<table><thead><tr>"]
    out += ["<th>%s</th>" % esc(h) for h in head]
    out.append("</tr></thead><tbody>")
    for row in rows:
        out.append("<tr>")
        for i, cell in enumerate(row):
            out.append('<td%s>%s</td>' % (' class="n"' if i else "", esc(cell)))
        out.append("</tr>")
    out.append("</tbody></table>")
    return "".join(out)


def _p(text):
    return "<p>%s</p>" % esc(text) if text else ""


def _ul(items):
    items = [i for i in items if i]
    if not items:
        return ""
    return "<ul>%s</ul>" % "".join("<li>%s</li>" % esc(i) for i in items)


def _section(title, *parts):
    body = "".join(p for p in parts if p)
    if not body:
        return ""
    return "<h2>%s</h2>%s" % (esc(title), body)


def _record_words(summary, draws=False):
    """'93-68' -> (93, 68, 0). Soccer 'W-D-L'."""
    m = re.match(r"^(\d+)-(\d+)(?:-(\d+))?$", str(summary or "").strip())
    if not m:
        return None
    a, b, c = int(m.group(1)), int(m.group(2)), int(m.group(3) or 0)
    if draws:
        return a, c, b  # wins, losses, draws
    return a, b, c


# ---------------------------------------------------------------- team feeds

def _sides(summary):
    comp = ((summary.get("header") or {}).get("competitions") or [{}])[0]
    out = {}
    for c in comp.get("competitors") or []:
        team = c.get("team") or {}
        rec = {}
        for r in c.get("record") or []:
            rec[(r.get("type") or r.get("name") or "").lower()] = r.get("summary") or r.get("displayValue")
        prob = None
        for p in c.get("probables") or []:
            a = p.get("athlete") or {}
            if a.get("id"):
                prob = {"id": str(a["id"]), "name": a.get("displayName") or a.get("fullName"),
                        "throws": ((a.get("throws") or {}).get("displayValue") or "").lower()}
        out[c.get("homeAway") or ("home" if not out else "away")] = {
            "id": str(team.get("id") or c.get("id") or ""),
            "name": team.get("displayName") or team.get("name") or "",
            "short": team.get("shortDisplayName") or team.get("name") or team.get("displayName") or "",
            "abbr": team.get("abbreviation") or "",
            "score": c.get("score"),
            "winner": c.get("winner"),
            "record": rec,
            "hits": c.get("hits"),
            "errors": c.get("errors"),
            "lines": [l.get("displayValue") for l in c.get("linescores") or []],
            "probable": prob,
        }
    return comp, out


def _state(comp):
    return (((comp.get("status") or {}).get("type") or {}).get("state") or "pre").lower()


def _box_stats(summary):
    """Pregame boxscore carries season stats with league ranks."""
    out = {}
    for t in (summary.get("boxscore") or {}).get("teams") or []:
        tid = str((t.get("team") or {}).get("id") or "")
        flat = {}
        for cat in t.get("statistics") or []:
            if isinstance(cat, dict) and "stats" in cat:
                for s in cat.get("stats") or []:
                    key = "%s.%s" % (cat.get("name"), s.get("name"))
                    flat[key] = (s.get("displayValue"), s.get("rankDisplayValue"))
            elif isinstance(cat, dict):
                flat[cat.get("label") or cat.get("name")] = (cat.get("displayValue"), None)
        out[tid] = flat
    return out


def _team_stats(get, path, tid):
    data = _get(get, "%s%s/teams/%s/statistics" % (BASE, path, tid))
    flat = {}
    cats = ((((data or {}).get("results") or {}).get("stats") or {}).get("categories")) or []
    for cat in cats:
        for s in cat.get("stats") or []:
            flat.setdefault("%s.%s" % (cat.get("name"), s.get("name")), (s.get("displayValue"), None))
    return flat


def _form_from_summary(summary, tid, kickoff):
    for block in summary.get("lastFiveGames") or []:
        if str((block.get("team") or {}).get("id")) != tid:
            continue
        rows = []
        for e in block.get("events") or []:
            when = _parse(e.get("gameDate"))
            if when is None or (kickoff and (when >= kickoff or kickoff - when > dt.timedelta(days=200))):
                continue
            home = str(e.get("homeTeamId")) == tid
            us = _num(e.get("homeTeamScore") if home else e.get("awayTeamScore"))
            them = _num(e.get("awayTeamScore") if home else e.get("homeTeamScore"))
            rows.append({"when": when, "opp": (e.get("opponent") or {}).get("displayName") or "",
                         "home": home, "res": (e.get("gameResult") or "").upper(), "us": us, "them": them})
        rows.sort(key=lambda r: r["when"])
        return rows
    return None


def _form_from_schedule(get, path, tid, kickoff, event_id=None):
    rows = []
    year = (kickoff or dt.datetime.now(dt.timezone.utc)).year
    for extra in ("?season=%d&seasontype=2" % year, "?season=%d&seasontype=3" % year, ""):
        data = _get(get, "%s%s/teams/%s/schedule%s" % (BASE, path, tid, extra))
        for e in (data or {}).get("events") or []:
            comp = (e.get("competitions") or [{}])[0]
            if _state(comp) != "post" or (event_id and str(e.get("id")) == str(event_id)):
                continue
            status_name = str((((comp.get("status") or {}).get("type") or {}).get("name")) or "").upper()
            if any(x in status_name for x in ("POSTPONED", "CANCELED", "CANCELLED", "SUSPENDED", "ABANDONED", "FORFEIT")):
                continue
            when = _parse(e.get("date") or comp.get("date"))
            if when is None or (kickoff and when >= kickoff - dt.timedelta(hours=2)):
                continue
            us = them = None
            opp = ""
            home = False
            res = ""
            for c in comp.get("competitors") or []:
                score = c.get("score")
                val = _num(score.get("value") if isinstance(score, dict) else score)
                if str(c.get("id") or (c.get("team") or {}).get("id")) == tid:
                    us, home = val, c.get("homeAway") == "home"
                    res = "W" if c.get("winner") is True else ("L" if c.get("winner") is False else "")
                else:
                    them, opp = val, (c.get("team") or {}).get("displayName") or ""
            if us is not None and them is not None:
                if us == them and not path.startswith("soccer"):
                    continue
                if us == them:
                    res = "D"
                elif not res:
                    res = "W" if us > them else "L"
            rows.append({"id": str(e.get("id")), "when": when, "opp": opp, "home": home, "res": res, "us": us, "them": them})
    seen, out = set(), []
    for r in sorted(rows, key=lambda r: r["when"]):
        key = r["id"]
        if key not in seen:
            seen.add(key)
            out.append(r)
    return out[-5:]


def _form(get, path, summary, side, kickoff, event_id=None):
    rows = _form_from_summary(summary, side["id"], kickoff)
    if not rows:
        rows = _form_from_schedule(get, path, side["id"], kickoff, event_id)
    return rows or []


def _form_line(name, rows, unit):
    if not rows:
        return ""
    w = sum(1 for r in rows if r["res"] == "W")
    l = sum(1 for r in rows if r["res"] == "L")
    d = sum(1 for r in rows if r["res"] == "D")
    scored = sum(r["us"] or 0 for r in rows)
    allowed = sum(r["them"] or 0 for r in rows)
    rec = "%d-%d" % (w, l) + ("-%d" % d if d else "")
    n = len(rows)
    diff = scored - allowed
    tone = ("outscored opponents by %s" % _fmt(diff)) if diff > 0 else (
        "were outscored by %s" % _fmt(-diff) if diff < 0 else "broke even on the scoreboard")
    return "%s went %s over their last %s games, scoring %s and allowing %s, so they %s in that stretch." % (
        name, rec, NUMS.get(n, str(n)), _n(scored, unit.rstrip("s")), _fmt(allowed), tone)


def _form_rows(rows):
    out = []
    for r in reversed(rows):
        where = "vs" if r["home"] else "at"
        score = "%s-%s" % (_fmt(r["us"]), _fmt(r["them"])) if r["us"] is not None else ""
        out.append((nfl.et(r["when"]).strftime("%b %d").replace(" 0", " "), "%s %s" % (where, r["opp"]),
                    ("%s %s" % (r["res"], score)).strip()))
    return out


def _rest_days(rows, kickoff):
    if not rows or not kickoff:
        return None
    last = rows[-1]["when"]
    return (nfl.et(kickoff).date() - nfl.et(last).date()).days


def _injuries(summary, tid, limit=6):
    for block in summary.get("injuries") or []:
        if str((block.get("team") or {}).get("id")) != tid:
            continue
        out = []
        for i in block.get("injuries") or []:
            a = i.get("athlete") or {}
            det = i.get("details") or {}
            status = i.get("status") or (i.get("type") or {}).get("description") or ""
            bits = []
            for x in (det.get("side") if det.get("side") not in (None, "Not Specified") else "",
                      det.get("type") or "", det.get("detail") or ""):
                if x and x.lower() not in [b.lower() for b in bits] and x.lower() != "not specified":
                    bits.append(x)
            what = " ".join(bits).strip()
            pos = (a.get("position") or {}).get("abbreviation") or ""
            text = "%s%s: %s" % (a.get("displayName") or "", " (%s)" % pos if pos else "", status)
            if what:
                text += ", %s" % what.lower()
            ret = _parse(det.get("returnDate"))
            if ret:
                text += ", listed to return %s" % _et_day(ret)
            out.append((a.get("displayName") or "", text))
        return out[:limit]
    return []


def _leaders(summary, tid):
    for block in summary.get("leaders") or []:
        if str((block.get("team") or {}).get("id")) != tid:
            continue
        out = []
        for cat in block.get("leaders") or []:
            top = (cat.get("leaders") or [{}])[0]
            name = (top.get("athlete") or {}).get("displayName")
            if name:
                out.append((cat.get("displayName") or cat.get("name") or "", name, top.get("displayValue") or ""))
        return out
    return []


def _odds(summary):
    for o in (summary.get("pickcenter") or []) + (summary.get("odds") or []):
        if not isinstance(o, dict):
            continue
        a, h = o.get("awayTeamOdds") or {}, o.get("homeTeamOdds") or {}
        if not (a.get("moneyLine") or h.get("moneyLine") or o.get("overUnder") or o.get("details")):
            continue
        return {"book": ((o.get("provider") or {}).get("name") or "").replace("Draft Kings", "DraftKings"),
                "details": o.get("details") or "", "total": _num(o.get("overUnder")),
                "away_ml": a.get("moneyLine"), "home_ml": h.get("moneyLine"),
                "draw_ml": (o.get("drawOdds") or {}).get("moneyLine"),
                "spread": _num(o.get("spread"))}
    return None


def _predictor(summary, sides):
    p = summary.get("predictor") or {}
    home = _num((p.get("homeTeam") or {}).get("gameProjection"))
    away = _num((p.get("awayTeam") or {}).get("gameProjection"))
    if home is None or away is None:
        return None
    return {"home": home, "away": away}


def _series(summary):
    for s in summary.get("seasonseries") or []:
        if s.get("type") in ("season", "playoff") and s.get("summary"):
            return s.get("title") or "Season series", s.get("summary")
    return None


def _venue(summary):
    info = summary.get("gameInfo") or {}
    v = info.get("venue") or {}
    addr = v.get("address") or {}
    place = ", ".join(x for x in (addr.get("city"), addr.get("state")) if x)
    w = info.get("weather") or {}
    weather = ""
    if w.get("temperature") is not None and w.get("displayValue"):
        weather = "%s degrees, %s" % (w.get("temperature"), str(w.get("displayValue")).lower())
    return (v.get("fullName") or ""), place, weather, v.get("grass")


def _stat(flat, *keys):
    for k in keys:
        if k in flat and flat[k][0] not in (None, ""):
            return flat[k]
    return None, None


# ---------------------------------------------------------------- edges

class Edges:
    """Areas one side leads, each with a reason sentence."""

    def __init__(self, away, home):
        self.names = {"away": away, "home": home}
        self.items = []

    def add(self, side, reason, weight=1.0):
        if side in ("away", "home") and reason:
            self.items.append((side, reason, weight))

    def score(self):
        s = {"away": 0.0, "home": 0.0}
        for side, _, w in self.items:
            s[side] += w
        return s

    def bullets(self, limit=6):
        ranked = sorted(self.items, key=lambda x: -x[2])
        return [r for _, r, _ in ranked[:limit]]


def _compare(edges, label, away_v, home_v, higher_better, fmt, threshold, names, what):
    if away_v is None or home_v is None:
        return
    gap = away_v - home_v
    if abs(gap) < threshold:
        return
    better_is_away = (gap > 0) == higher_better
    side = "away" if better_is_away else "home"
    good, bad = (names["away"], names["home"]) if better_is_away else (names["home"], names["away"])
    gv, bv = (away_v, home_v) if better_is_away else (home_v, away_v)
    first, second = fmt(gv), fmt(bv)
    a_words, b_words = first.split(" "), second.split(" ")
    while len(a_words) > 1 and len(b_words) > 1 and a_words[-1] == b_words[-1]:
        a_words.pop()
        b_words.pop()
    edges.add(side, "%s %s, %s to %s for %s." % (good, what, first, " ".join(b_words), bad),
              min(2.0, abs(gap) / threshold * 0.5 + 0.5))


# ---------------------------------------------------------------- MLB

def _mlb_pitcher(get, pid):
    data = _get(get, "%sbaseball/mlb/athletes/%s/overview" % (WEB, pid))
    if not data:
        return None
    st = data.get("statistics") or {}
    labels = st.get("labels") or []
    season = next((s for s in st.get("splits") or [] if (s.get("displayName") or "").lower().startswith("regular")), None)
    if not season:
        return None
    row = dict(zip(labels, season.get("stats") or []))
    ip_raw = str(row.get("IP") or "0")
    whole, _, part = ip_raw.partition(".")
    ip = (_num(whole) or 0) + (_num(part) or 0) / 3.0
    er, h, bb, k, hr = (_num(row.get(x)) for x in ("ER", "H", "BB", "K", "HR"))
    if not ip:
        return None
    out = {"gs": row.get("GS"), "ip": ip_raw, "era": er * 9 / ip if er is not None else None,
           "whip": (h + bb) / ip if h is not None and bb is not None else None,
           "k9": k * 9 / ip if k is not None else None, "bb9": bb * 9 / ip if bb is not None else None,
           "hr9": hr * 9 / ip if hr is not None else None, "recent": []}
    log = data.get("gameLog") or {}
    for block in (log.get("statistics") or [])[:1]:
        names = block.get("names") or []
        for e in (block.get("events") or [])[:3]:
            vals = dict(zip(names, e.get("stats") or []))
            out["recent"].append(vals)
    out["ipf"] = ip
    return out


def _outs(ip_text):
    whole, _, part = str(ip_text or "0").partition(".")
    return int(_num(whole) or 0) * 3 + int(_num(part) or 0)


def _mlb(get, summary, comp, sides, kickoff, state):
    path = PATHS["mlb"]
    a, h = sides["away"], sides["home"]
    names = {"away": a["short"], "home": h["short"]}
    edges = Edges(a["short"], h["short"])
    parts = []
    box = _box_stats(summary) if state != "post" else {}
    stats = {}
    for key in ("away", "home"):
        s = sides[key]
        flat = box.get(s["id"]) or {}
        if "batting.runs" not in flat:
            flat = _team_stats(get, path, s["id"])
        stats[key] = flat

    def val(key, *k):
        return _num(_stat(stats[key], *k)[0])

    def rank(key, *k):
        return _stat(stats[key], *k)[1]

    games = {k: val(k, "batting.teamGamesPlayed", "batting.gamesPlayed") for k in stats}
    rpg = {k: (val(k, "batting.runs") / games[k]) if games[k] and val(k, "batting.runs") is not None else None for k in stats}
    rapg = {k: (val(k, "pitching.runs") / games[k]) if games[k] and val(k, "pitching.runs") is not None else None for k in stats}

    # Where they stand
    ra, rh = _record_words(a["record"].get("total")), _record_words(h["record"].get("total"))
    road, home = _record_words(a["record"].get("road")), _record_words(h["record"].get("home"))
    stand = []
    if ra and rh:
        stand.append("%s %s at %d wins and %d losses, and %s %s at %d and %d." % (
            a["name"], "sit" if state != "post" else "now sit", ra[0], ra[1], h["name"], "sit" if state != "post" else "now sit", rh[0], rh[1]))
    if road and home:
        rp, hp = road[0] / max(1, road[0] + road[1]), home[0] / max(1, home[0] + home[1])
        stand.append("Location matters here. %s %s %d and %d on the road, and %s %s %d and %d at home." % (
            a["short"], "are" if state != "post" else "are now", road[0], road[1],
            h["short"], "are" if state != "post" else "are now", home[0], home[1]))
        _compare(edges, "split", rp, hp, True, _pct3, 0.04,
                 {"away": a["short"] + " on the road", "home": h["short"] + " at home"}, "own the better split for this venue")
    series = _series(summary)
    if series:
        stand.append("Head to head this season: %s." % series[1])
    if ra and rh:
        pa, ph = ra[0] / max(1, ra[0] + ra[1]), rh[0] / max(1, rh[0] + rh[1])
        _compare(edges, "record", pa, ph, True, _pct3, 0.03, names, "have the better season winning percentage")
    parts.append(_section("Where these two stand", "".join(_p(x) for x in stand)))

    # Pitching matchup
    pit = {}
    for key in ("away", "home"):
        p = sides[key].get("probable")
        if p:
            line = _mlb_pitcher(get, p["id"])
            if line:
                pit[key] = (p, line)
    if pit:
        rows = []
        text = []
        for key in ("away", "home"):
            if key not in pit:
                continue
            p, l = pit[key]
            rows.append((p["name"] + " (%s)" % sides[key]["abbr"], l["gs"] or "", l["ip"], _fmt(l["era"], 2),
                         _fmt(l["whip"], 2), _fmt(l["k9"], 1), _fmt(l["bb9"], 1)))
            rec = l["recent"]
            if rec:
                outs = sum(_outs(r.get("innings")) for r in rec)
                er = sum(_num(r.get("earnedRuns")) or 0 for r in rec)
                k = sum(_num(r.get("strikeouts")) or 0 for r in rec)
                started = all((_num(r.get("gamesStarted")) or 0) >= 1 for r in rec)
                text.append("%s, who throws %s handed, covered %d%s innings over his last %s %s, allowing %s with %s." % (
                    p["name"], p["throws"] or "right", outs // 3, ".%d" % (outs % 3) if outs % 3 else "",
                    NUMS.get(len(rec), str(len(rec))), "starts" if started else "outings",
                    _n(er, "earned run"), _n(k, "strikeout")))
        intro = ""
        if len(pit) == 2:
            (pa_, la), (ph_, lh) = pit["away"], pit["home"]
            intro = "%s gets the ball for the %s and %s starts for the %s." % (pa_["name"], a["short"], ph_["name"], h["short"])
        if len(pit) == 2 and min(la["ipf"], lh["ipf"]) >= 40:
            _compare(edges, "era", la["era"], lh["era"], False, lambda v: "%.2f ERA" % v, 0.35,
                     {"away": pa_["name"], "home": ph_["name"]}, "brings the better run prevention")
            _compare(edges, "whip", la["whip"], lh["whip"], False, lambda v: "%.2f WHIP" % v, 0.08,
                     {"away": pa_["name"], "home": ph_["name"]}, "puts fewer men on base")
            _compare(edges, "k9", la["k9"], lh["k9"], True, lambda v: "%.1f strikeouts per nine" % v, 1.0,
                     {"away": pa_["name"], "home": ph_["name"]}, "misses more bats")
        parts.append(_section("The pitching matchup", _p(intro),
                              _table(["Starter", "GS", "IP", "ERA", "WHIP", "K/9", "BB/9"], rows),
                              "".join(_p(t) for t in text)))

    # Lineups and staffs
    metrics = [
        ("Runs per game", lambda k: rpg[k], True, lambda v: "%.2f" % v, None),
        ("Batting average", lambda k: val(k, "batting.avg"), True, lambda v: ("%.3f" % v).lstrip("0"), "batting.avg"),
        ("On base pct", lambda k: val(k, "batting.onBasePct"), True, lambda v: ("%.3f" % v).lstrip("0"), "batting.onBasePct"),
        ("Slugging", lambda k: val(k, "batting.slugAvg"), True, lambda v: ("%.3f" % v).lstrip("0"), "batting.slugAvg"),
        ("Home runs", lambda k: val(k, "batting.homeRuns"), True, lambda v: "%d" % v, "batting.homeRuns"),
        ("Team ERA", lambda k: val(k, "pitching.ERA"), False, lambda v: "%.2f" % v, "pitching.ERA"),
        ("Team WHIP", lambda k: val(k, "pitching.WHIP"), False, lambda v: "%.2f" % v, "pitching.WHIP"),
        ("Runs allowed per game", lambda k: rapg[k], False, lambda v: "%.2f" % v, None),
        ("Strikeouts per nine", lambda k: val(k, "pitching.strikeoutsPerNineInnings"), True, lambda v: "%.1f" % v, "pitching.strikeoutsPerNineInnings"),
    ]
    rows = []
    for label, fn, hib, fmt, rk in metrics:
        av, hv = fn("away"), fn("home")
        if av is None or hv is None:
            continue
        ar = rank("away", rk) if rk else None
        hr = rank("home", rk) if rk else None
        rows.append((label, fmt(av) + (" (%s)" % ar if ar and "Tied" not in str(ar) else ""),
                     fmt(hv) + (" (%s)" % hr if hr and "Tied" not in str(hr) else "")))
    if rows:
        _compare(edges, "off", rpg["away"], rpg["home"], True, lambda v: "%.2f runs a game" % v, 0.2, names, "have the more productive offense")
        _compare(edges, "def", rapg["away"], rapg["home"], False, lambda v: "%.2f runs allowed a game" % v, 0.2, names, "have kept runs off the board better")
        ops = {k: val(k, "batting.OPS") for k in stats}
        _compare(edges, "ops", ops["away"], ops["home"], True, lambda v: ("%.3f OPS" % v).lstrip("0"), 0.02, names, "hit for more damage")
        blurb = []
        if rpg["away"] and rapg["away"] and rpg["home"] and rapg["home"]:
            da, dh = rpg["away"] - rapg["away"], rpg["home"] - rapg["home"]
            blurb.append("Run differential per game tells the season in one number: %s at %s%.2f and %s at %s%.2f." % (
                a["short"], "+" if da >= 0 else "-", abs(da), h["short"], "+" if dh >= 0 else "-", abs(dh)))
        parts.append(_section("Offense and run prevention",
                              _table(["Season", a["abbr"] or a["short"], h["abbr"] or h["short"]], rows),
                              "".join(_p(b) for b in blurb),
                              _p("League rank in parentheses where the feed provides it.") if any("(" in r[1] for r in rows) else ""))
    return parts, edges, path


# ---------------------------------------------------------------- football

def _football(get, summary, comp, sides, kickoff, state, sport):
    path = PATHS[sport]
    a, h = sides["away"], sides["home"]
    names = {"away": a["short"], "home": h["short"]}
    edges = Edges(a["short"], h["short"])
    parts = []
    stats = {}
    box = _box_stats(summary) if state != "post" else {}
    for key in ("away", "home"):
        flat = box.get(sides[key]["id"]) or {}
        if "Points Per Game" not in flat:
            t = _team_stats(get, path, sides[key]["id"])
            gp = _num(_stat(t, "general.gamesPlayed", "rushing.teamGamesPlayed")[0])
            conv = {
                "Points Per Game": _stat(t, "scoring.totalPointsPerGame", "rushing.totalPointsPerGame")[0],
                "Yards Passing": _stat(t, "passing.netPassingYardsPerGame")[0],
                "Yards Rushing": _stat(t, "rushing.rushingYardsPerGame")[0],
                "Yards Per Play": None,
                "Third Down %": _stat(t, "miscellaneous.thirdDownConvPct")[0],
                "Yards Per Pass": _stat(t, "passing.yardsPerPassAttempt")[0],
                "Yards Per Rush": _stat(t, "rushing.yardsPerRushAttempt")[0],
                "Sacks": _stat(t, "defensive.sacks")[0],
                "Takeaways": None,
            }
            tot = _num(_stat(t, "rushing.totalYards")[0])
            if tot is not None and gp:
                conv["Total Yards"] = "%.1f" % (tot / gp)
            flat = {k: (v, None) for k, v in conv.items() if v not in (None, "")}
        stats[key] = flat

    def val(key, k):
        return _num((stats[key].get(k) or (None, None))[0])

    ra, rh = _record_words(a["record"].get("total")), _record_words(h["record"].get("total"))
    stand = []
    if ra and rh:
        stand.append("%s %s %d and %d, and %s %s %d and %d." % (
            a["name"], "are" if state != "post" else "are now", ra[0], ra[1], h["name"], "are" if state != "post" else "are now", rh[0], rh[1]))
        _compare(edges, "rec", ra[0] / max(1, ra[0] + ra[1]), rh[0] / max(1, rh[0] + rh[1]), True,
                 lambda v: _pct3(v) + " winning percentage", 0.15, names, "have won at the higher rate")
    for key, label in (("away", "road"), ("home", "home")):
        r = _record_words(sides[key]["record"].get(label))
        if r:
            stand.append("%s %s %d and %d %s." % (sides[key]["short"], "are" if state != "post" else "are now", r[0], r[1],
                                                   "away from home" if label == "road" else "at home"))
    conf = [(sides[k]["short"], _record_words(sides[k]["record"].get("vsconf"))) for k in ("away", "home")]
    if all(c[1] for c in conf):
        stand.append("In conference play it is %s %d and %d, %s %d and %d." % (
            conf[0][0], conf[0][1][0], conf[0][1][1], conf[1][0], conf[1][1][0], conf[1][1][1]))
    parts.append(_section("Where these two stand", "".join(_p(x) for x in stand)))

    metrics = [("Points per game", "Points Per Game", True), ("Points allowed per game", "Points Allowed Per Game", False),
               ("Total yards per game", "Total Yards", True), ("Yards allowed per game", "Yards Allowed", False),
               ("Passing yards per game", "Yards Passing", True), ("Rushing yards per game", "Yards Rushing", True),
               ("Pass yards allowed", "Pass Yards Allowed", False), ("Rush yards allowed", "Rush Yards Allowed", False),
               ("Yards per pass", "Yards Per Pass", True), ("Yards per rush", "Yards Per Rush", True),
               ("Third down conversion pct", "Third Down %", True), ("Sacks", "Sacks", True)]
    rows = []
    for label, key, _ in metrics:
        av, hv = val("away", key), val("home", key)
        if av is None or hv is None:
            continue
        rows.append((label, "%.1f" % av, "%.1f" % hv))
    if rows:
        _compare(edges, "ppg", val("away", "Points Per Game"), val("home", "Points Per Game"), True,
                 lambda v: "%.1f points a game" % v, 4.0, names, "score more")
        _compare(edges, "papg", val("away", "Points Allowed Per Game"), val("home", "Points Allowed Per Game"), False,
                 lambda v: "%.1f points allowed a game" % v, 4.0, names, "have the stingier defense")
        _compare(edges, "yds", val("away", "Total Yards"), val("home", "Total Yards"), True,
                 lambda v: "%.1f yards a game" % v, 40.0, names, "move the ball better")
        _compare(edges, "yda", val("away", "Yards Allowed"), val("home", "Yards Allowed"), False,
                 lambda v: "%.1f yards allowed a game" % v, 40.0, names, "give up less ground")
        blurb = []
        pa, pha = val("away", "Points Per Game"), val("away", "Points Allowed Per Game")
        ph, phh = val("home", "Points Per Game"), val("home", "Points Allowed Per Game")
        if None not in (pa, pha, ph, phh):
            da, dh = pa - pha, ph - phh
            blurb.append("Scoring margin: %s at %s%.1f points a game, %s at %s%.1f." % (
                a["short"], "+" if da >= 0 else "-", abs(da), h["short"], "+" if dh >= 0 else "-", abs(dh)))
        ra_, rh_ = val("away", "Yards Rushing"), val("home", "Yards Rushing")
        rda, rdh = val("away", "Rush Yards Allowed"), val("home", "Rush Yards Allowed")
        if None not in (ra_, rdh) and ra_ - rdh >= 50:
            blurb.append("%s run for %.1f yards a game and %s allow %.1f on the ground, which is the matchup to watch at the line." % (
                a["short"], ra_, h["short"], rdh))
        if None not in (rh_, rda) and rh_ - rda >= 50:
            blurb.append("%s run for %.1f yards a game against a %s front that allows %.1f." % (h["short"], rh_, a["short"], rda))
        parts.append(_section("Offense and defense", _table(["Season", a["abbr"] or a["short"], h["abbr"] or h["short"]], rows),
                              "".join(_p(b) for b in blurb)))

    if state != "post":
        lead_rows = []
        for key in ("away", "home"):
            for cat, name, value in _leaders(summary, sides[key]["id"])[:3]:
                lead_rows.append((sides[key]["abbr"] or sides[key]["short"], "%s, %s" % (name, cat.lower()), value))
        if lead_rows:
            parts.append(_section("Players who drive it", _table(["Team", "Leader", "Season"], lead_rows)))
    return parts, edges, path


# ---------------------------------------------------------------- soccer

def _soccer(get, summary, comp, sides, kickoff, state, league):
    path = "soccer/%s" % SOCCER.get(league, "usa.1")
    a, h = sides["away"], sides["home"]
    names = {"away": a["short"], "home": h["short"]}
    edges = Edges(a["short"], h["short"])
    parts = []
    table = {}
    for g in ((summary.get("standings") or {}).get("groups") or []):
        for e in ((g.get("standings") or {}).get("entries") or []):
            table[str(e.get("id"))] = {s.get("name"): s.get("displayValue") for s in e.get("stats") or []}
    rows = []
    for key in ("away", "home"):
        t = table.get(sides[key]["id"])
        if t:
            rows.append((sides[key]["short"], t.get("rank") or "", t.get("gamesPlayed") or "", t.get("wins") or "",
                         t.get("ties") or "", t.get("losses") or "", t.get("pointDifferential") or "", t.get("points") or ""))
    text = []
    ta, th = table.get(a["id"]), table.get(h["id"])
    if ta and th:
        ga, gh = _num(ta.get("gamesPlayed")), _num(th.get("gamesPlayed"))
        ppa = _num(ta.get("points")) / ga if ga else None
        pph = _num(th.get("points")) / gh if gh else None
        if ppa is not None and pph is not None:
            text.append("%s take %.2f points a game and %s take %.2f. %s sit %s in the table, %s %s." % (
                a["short"], ppa, h["short"], pph, a["short"], _ordinal(_num(ta.get("rank")) or 0),
                h["short"], _ordinal(_num(th.get("rank")) or 0)))
            _compare(edges, "ppg", ppa, pph, True, lambda v: "%.2f points a game" % v, 0.25, names, "have collected points at the better rate")
        gda, gdh = _num(ta.get("pointDifferential")), _num(th.get("pointDifferential"))
        if ga and gh and gda is not None and gdh is not None:
            _compare(edges, "gd", gda / ga, gdh / gh, True, lambda v: "%+.2f goal difference a game" % v, 0.3, names, "have the stronger goal difference")
    parts.append(_section("League table", _table(["Club", "Pos", "GP", "W", "D", "L", "GD", "Pts"], rows), "".join(_p(t) for t in text)))
    return parts, edges, path


# ---------------------------------------------------------------- shared modules

def _shared(get, summary, sides, kickoff, state, path, edges, unit):
    a, h = sides["away"], sides["home"]
    parts = []
    event_id = ((summary.get("header") or {}).get("id"))
    forms = {k: _form(get, path, summary, sides[k], kickoff, event_id) for k in ("away", "home")}
    if forms["away"] or forms["home"]:
        body = []
        for key in ("away", "home"):
            rows = forms[key]
            if not rows:
                continue
            body.append("<h3>%s</h3>" % esc(sides[key]["name"]))
            body.append(_p(_form_line(sides[key]["short"], rows, unit)))
            body.append(_table(["Date", "Opponent", "Result"], _form_rows(rows)))
        diffs = {}
        for key in ("away", "home"):
            rows = forms[key]
            if len(rows) >= 3:
                diffs[key] = sum((r["us"] or 0) - (r["them"] or 0) for r in rows) / len(rows)
        if len(diffs) == 2:
            unit_word = {"runs": "runs", "points": "points", "goals": "goals"}.get(unit, unit)
            _compare(edges, "form", diffs["away"], diffs["home"], True,
                     lambda v: "%+.1f %s a game in recent games" % (v, unit_word),
                     1.0 if unit != "goals" else 0.5, {"away": a["short"], "home": h["short"]}, "arrive in better form")
        parts.append(_section("Recent form", "".join(body)))

    # Rest and venue
    notes = []
    rest = {k: _rest_days(forms[k], kickoff) for k in ("away", "home")}
    if rest["away"] is not None and rest["home"] is not None:
        notes.append("%s last played %s before this one and %s %s before." % (
            a["short"], _n(rest["away"], "day"), h["short"], _n(rest["home"], "day")))
        if abs(rest["away"] - rest["home"]) >= 3:
            fresher = "away" if rest["away"] > rest["home"] else "home"
            edges.add(fresher, "%s get the rest edge, %d days off against %d." % (
                sides[fresher]["short"], max(rest.values()), min(rest.values())), 0.5)
    venue, place, weather, grass = _venue(summary)
    if venue:
        line = "The game is at %s%s." % (venue, " in %s" % place if place else "")
        if weather:
            line += " The forecast feed shows %s." % weather
        notes.append(line)
    if comp_neutral(summary):
        notes.append("It is a neutral site, so neither side gets its usual home crowd.")
    parts.append(_section("Rest, travel and venue", "".join(_p(n) for n in notes)))

    # Injuries
    # The injury feed is today's list. On a finished game that is not the list
    # the teams had that day, so the module only runs before and during a game.
    inj = {k: _injuries(summary, sides[k]["id"]) if state != "post" else [] for k in ("away", "home")}
    if inj["away"] or inj["home"]:
        body = []
        for key in ("away", "home"):
            if inj[key]:
                body.append("<h3>%s</h3>" % esc(sides[key]["name"]))
                body.append(_ul([t for _, t in inj[key]]))
        leaders = {k: {n for _, n, _ in _leaders(summary, sides[k]["id"])} for k in ("away", "home")}
        for key in ("away", "home"):
            hurt = [n for n, _ in inj[key] if n in leaders[key]]
            if hurt:
                other = "home" if key == "away" else "away"
                edges.add(other, "%s is on the injury report for %s, and that name also leads the team in a category." % (
                    hurt[0], sides[key]["short"]), 1.0)
        parts.append(_section("Injuries and availability", "".join(body)))
    return parts, forms


def comp_neutral(summary):
    comp = ((summary.get("header") or {}).get("competitions") or [{}])[0]
    return bool(comp.get("neutralSite"))


def _market(summary, sides, edges, sport):
    a, h = sides["away"], sides["home"]
    odds = _odds(summary)
    pred = _predictor(summary, sides)
    body = []
    rows = []
    fair = None
    if odds:
        if odds["away_ml"] is not None or odds["home_ml"] is not None:
            rows.append(("Moneyline", _ml(odds["away_ml"]), _ml(odds["home_ml"])))
        if odds.get("draw_ml") is not None:
            rows.append(("Draw", _ml(odds["draw_ml"]), ""))
        if sport in ("ncaaf", "nfl") and odds["details"]:
            body.append(_p("The spread at %s is %s%s." % (odds["book"] or "the book", odds["details"],
                                                          ", with the total at %s" % _fmt(odds["total"], 1) if odds["total"] else "")))
        elif odds["total"]:
            body.append(_p("%s has the total at %s." % (odds["book"] or "The book", _fmt(odds["total"], 1))))
        ia, ih = _implied(odds["away_ml"]), _implied(odds["home_ml"])
        if ia and ih and not odds.get("draw_ml"):
            fair = {"away": ia / (ia + ih), "home": ih / (ia + ih)}
            body.append(_p("Take the margin out of those two prices and the market makes it %s %.0f percent, %s %.0f percent." % (
                a["short"], fair["away"] * 100, h["short"], fair["home"] * 100)))
    if pred:
        body.append(_p("ESPN's matchup model has %s at %.1f percent and %s at %.1f percent." % (
            a["short"], pred["away"], h["short"], pred["home"])))
        if fair:
            gap = pred["home"] / 100.0 - fair["home"]
            if abs(gap) >= 0.04:
                side = "home" if gap > 0 else "away"
                edges.add(side, "The model rates %s %.0f points higher than the price does, which is where value would sit if the model is right." % (
                    sides[side]["short"], abs(gap) * 100), 1.0)
            else:
                body.append(_p("The model and the price are within a few points of each other, so the number looks fair on its face."))
    if not body and not rows:
        return "", odds, pred, fair
    table = _table(["Market", a["abbr"] or a["short"], h["abbr"] or h["short"]], rows) if rows else ""
    src = _p("Prices from %s via the ESPN odds feed." % odds["book"]) if odds and odds.get("book") else ""
    return _section("The betting line", table, "".join(body), src), odds, pred, fair


def _read(sides, edges, odds, pred, fair, state, single=False):
    a, h = sides["away"], sides["home"]
    score = edges.score()
    total = len(edges.items)
    if not total:
        return ""
    lead = "away" if score["away"] > score["home"] else "home" if score["home"] > score["away"] else None
    count = {k: sum(1 for s, _, _ in edges.items if s == k) for k in ("away", "home")}
    paras = []
    if lead:
        other = "home" if lead == "away" else "away"
        paras.append("Put the pieces side by side and %s %s more of the areas we measured, %d to %d. %s" % (
            sides[lead]["short"], "wins" if single else "win", count[lead], count[other],
            "The case is fairly lopsided." if count[other] == 0 else "It is not one way traffic, though, and %s %s real answers." % (
                sides[other]["short"], "has" if single else "have")))
    else:
        paras.append("The measured areas split evenly, which usually means the price and the starting assignments decide it.")
    if lead and total <= 2:
        paras[-1] = "There is not much separating these two on paper. The clearest difference: %s" % edges.bullets(1)[0]
    if fair and lead:
        pct = fair[lead] * 100
        if pct >= 65:
            paras.append("The market already agrees and prices %s near %.0f percent, so the numbers support the favorite without leaving much margin at that cost." % (sides[lead]["short"], pct))
        elif pct < 50:
            paras.append("The market has %s as the underdog at %.0f percent even though the underlying numbers lean their way, and that gap is the most interesting thing on this card." % (sides[lead]["short"], pct))
        else:
            paras.append("The market has %s as a modest favorite at %.0f percent, which is in line with what the numbers say." % (sides[lead]["short"], pct))
    if state == "post":
        paras.append("That is how the matchup profiled on the numbers. The final result is at the top of the page.")
    return _section("Our read", "".join(_p(p) for p in paras))


def _final(summary, sides, sport, state):
    if state != "post":
        return ""
    a, h = sides["away"], sides["home"]
    sa, sh = _num(a["score"]), _num(h["score"])
    if sa is None or sh is None:
        return ""
    if sa == sh:
        line = "Final: %s %s, %s %s. The points were shared." % (a["short"], _fmt(sa), h["short"], _fmt(sh))
    else:
        w, l = (a, h) if sa > sh else (h, a)
        line = "Final: %s %s, %s %s." % (w["short"], _fmt(max(sa, sh)), l["short"], _fmt(min(sa, sh)))
    extra = []
    if sport == "mlb" and a.get("hits") is not None and h.get("hits") is not None:
        extra.append("%s had %s and %s, %s had %s and %s." % (
            a["short"], _n(a["hits"], "hit"), _n(a.get("errors") or 0, "error"),
            h["short"], _n(h["hits"], "hit"), _n(h.get("errors") or 0, "error")))
    odds = _odds(summary)
    if odds and odds.get("total") and sa is not None:
        tot = sa + sh
        unit = {"mlb": "runs", "soccer": "goals"}.get(sport, "points")
        extra.append("The two sides combined for %s %s against a closing total of %s, so the game went %s." % (
            _fmt(tot), unit, _fmt(odds["total"], 1), "over" if tot > odds["total"] else "under" if tot < odds["total"] else "exactly on the number"))
    return '<div class="fp-final"><h2>How it played out</h2>%s%s</div>' % (_p(line), "".join(_p(x) for x in extra))


# ---------------------------------------------------------------- tennis

def _tennis(sport_league, event_id, kickoff, get):
    code = TENNIS.get(sport_league, "atp")
    match = None
    events = []
    days = [None]
    if kickoff:
        days = [(nfl.et(kickoff).date() - dt.timedelta(days=i)).strftime("%Y%m%d") for i in (0, 1, 3, 6)]
    for day in days:
        url = "%stennis/%s/scoreboard%s" % (BASE, code, "?dates=%s" % day if day else "")
        data = _get(get, url)
        for ev in (data or {}).get("events") or []:
            for g in ev.get("groupings") or []:
                for c in g.get("competitions") or []:
                    if str(c.get("id")) == str(event_id):
                        match = (ev, c)
            events.append(ev)
        if match:
            break
    if not match:
        return None
    ev, c = match
    tid = c.get("tournamentId")
    draw = (c.get("type") or {}).get("slug")
    players = []
    for comp in c.get("competitors") or []:
        ath = comp.get("athlete") or {}
        players.append({"id": str(comp.get("id") or ""), "name": ath.get("displayName") or "",
                        "country": (ath.get("flag") or {}).get("alt") or "", "winner": comp.get("winner"),
                        "sets": [(_num(l.get("value")), l.get("tiebreak")) for l in comp.get("linescores") or []]})
    if len(players) != 2:
        return None
    state = _state(c)
    # A combined event lists the women's draw on the ATP board. Rankings and
    # player records live on the tour the draw belongs to.
    tour = "wta" if str(draw or "").startswith("women") else "atp" if str(draw or "").startswith("men") else code
    sport_league = tour.upper()
    ranks = {}
    rk = _get(get, "%stennis/%s/rankings" % (BASE, tour))
    for r in ((rk or {}).get("rankings") or [{}])[0].get("ranks") or []:
        ranks[str((r.get("athlete") or {}).get("id"))] = (r.get("current"), r.get("points"))
    # path through this event, every completed match before this one
    path = {p["id"]: [] for p in players}
    later = {p["id"]: [] for p in players}
    seen = set()
    for e in events:
        for g in e.get("groupings") or []:
            for m in g.get("competitions") or []:
                if m.get("tournamentId") != tid or (m.get("type") or {}).get("slug") != draw:
                    continue
                if str(m.get("id")) == str(event_id) or m.get("id") in seen or _state(m) != "post":
                    continue
                when = _parse(m.get("date"))
                start = _parse(c.get("date")) or kickoff
                bucket = "path"
                if start and when and when >= start:
                    bucket = "later"
                seen.add(m.get("id"))
                comps = m.get("competitors") or []
                for p in players:
                    me = next((x for x in comps if str(x.get("id")) == p["id"]), None)
                    if me is None:
                        continue
                    opp = next((x for x in comps if x is not me), {})
                    sets = []
                    for mine, theirs in zip(me.get("linescores") or [], opp.get("linescores") or []):
                        sets.append("%s-%s" % (_fmt(_num(mine.get("value"))), _fmt(_num(theirs.get("value")))))
                    won = me.get("winner") is True
                    (path if bucket == "path" else later)[p["id"]].append({"when": when, "round": (m.get("round") or {}).get("displayName") or "",
                                          "opp": (opp.get("athlete") or {}).get("displayName") or "",
                                          "won": won, "sets": sets})
    # results from the weeks before this event, any tournament on the same tour
    before = {p["id"]: [] for p in players}
    start_ev = min([x["when"] for v in path.values() for x in v if x["when"]] + [_parse(c.get("date")) or kickoff or dt.datetime.now(dt.timezone.utc)])
    done = set()
    boards = []
    for back in (7, 14):
        day = (nfl.et(start_ev).date() - dt.timedelta(days=back)).strftime("%Y%m%d")
        for board in sorted({code, tour}):
            boards.append(_get(get, "%stennis/%s/scoreboard?dates=%s" % (BASE, board, day)))
    for data in boards:
        for e in (data or {}).get("events") or []:
            for g in e.get("groupings") or []:
                for m in g.get("competitions") or []:
                    if m.get("tournamentId") == tid or (m.get("type") or {}).get("slug") != draw:
                        continue
                    if m.get("id") in done or _state(m) != "post":
                        continue
                    when = _parse(m.get("date"))
                    if not when or when >= start_ev:
                        continue
                    done.add(m.get("id"))
                    comps = m.get("competitors") or []
                    for p in players:
                        me = next((x for x in comps if str(x.get("id")) == p["id"]), None)
                        if me is None:
                            continue
                        opp = next((x for x in comps if x is not me), {})
                        sets = ["%s-%s" % (_fmt(_num(x.get("value"))), _fmt(_num(y.get("value"))))
                                for x, y in zip(me.get("linescores") or [], opp.get("linescores") or [])]
                        before[p["id"]].append({"when": when, "event": e.get("name") or "",
                                                "round": (m.get("round") or {}).get("displayName") or "",
                                                "opp": (opp.get("athlete") or {}).get("displayName") or "",
                                                "won": me.get("winner") is True, "sets": sets})
    bios = {}
    for p in players:
        b = (_get(get, "%stennis/%s/athletes/%s" % (WEB, tour, p["id"])) or {}).get("athlete") or {}
        st = _get(get, "%stennis/leagues/%s/athletes/%s/statistics" % (CORE, tour, p["id"])) or {}
        gen = {}
        for cat in ((st.get("splits") or {}).get("categories") or []):
            for s in cat.get("stats") or []:
                gen[s.get("name")] = _num(s.get("value"))
        bios[p["id"]] = {"age": b.get("age"), "height": b.get("displayHeight"),
                         "hand": ((b.get("hand") or {}).get("displayValue") if isinstance(b.get("hand"), dict) else b.get("hand")) or "",
                         "exp": b.get("displayExperience") or "", "won": gen.get("singlesWon"),
                         "lost": gen.get("singlesLost"), "titles": gen.get("singlesTitles")}
    p1, p2 = players
    names = {"away": p1["name"], "home": p2["name"]}
    edges = Edges(p1["name"], p2["name"])
    parts = []
    tourney = ev.get("name") or ""
    rnd = (c.get("round") or {}).get("displayName") or ""
    venue = (c.get("venue") or {}).get("fullName") or ""
    court = (c.get("venue") or {}).get("court") or ""
    rnd_words = " " + _round_phrase(rnd) if rnd else ""
    setting = "%s meets %s%s at the %s%s." % (
        p1["name"], p2["name"], rnd_words, tourney or "event",
        " in %s" % venue if venue else "")
    if court:
        setting += " The match is on %s." % court
    parts.append(_section("The setting", _p(setting)))

    rows = []
    for p in players:
        b = bios[p["id"]]
        rank = ranks.get(p["id"])
        won, lost = b.get("won"), b.get("lost")
        pct = "%.0f%%" % (won * 100 / (won + lost)) if won is not None and lost and won + lost > 0 else ""
        rows.append((p["name"], "%s" % rank[0] if rank else "", p["country"], "%s" % (b.get("age") or ""),
                     b.get("hand") or "", "%s-%s" % (_fmt(won), _fmt(lost)) if won is not None and lost is not None else "",
                     pct, _fmt(b.get("titles")) if b.get("titles") is not None else ""))
    prof = []
    r1, r2 = ranks.get(p1["id"]), ranks.get(p2["id"])
    if r1 and r2:
        better, worse = (p1, p2) if r1[0] < r2[0] else (p2, p1)
        rb, rw = (r1, r2) if r1[0] < r2[0] else (r2, r1)
        prof.append("%s is ranked %s in the current %s list with %s points, %s is %s with %s." % (
            better["name"], _ordinal(rb[0]), sport_league, _fmt(rb[1]), worse["name"], _ordinal(rw[0]), _fmt(rw[1])))
        _compare(edges, "rank", -r1[0], -r2[0], True, lambda v: "No. %d" % -v, 15, names, "carries the higher ranking")
    elif r1 or r2:
        ranked = p1 if r1 else p2
        rr = r1 or r2
        other = p2 if r1 else p1
        prof.append("%s is ranked %s in the current %s list. %s sits outside the top %d." % (
            ranked["name"], _ordinal(rr[0]), sport_league, other["name"], len(ranks)))
        edges.add("away" if r1 else "home", "%s is inside the top %d and %s is not." % (ranked["name"], len(ranks), other["name"]), 1.5)
    b1, b2 = bios[p1["id"]], bios[p2["id"]]
    if b1.get("won") is not None and b2.get("won") is not None and b1.get("lost") and b2.get("lost"):
        c1 = b1["won"] / (b1["won"] + b1["lost"])
        c2 = b2["won"] / (b2["won"] + b2["lost"])
        _compare(edges, "career", c1, c2, True, lambda v: "%.0f percent of career tour matches" % (v * 100), 0.06, names, "has won more often at tour level")
        prof.append("At tour level %s has won %d and lost %d, %s has won %d and lost %d." % (
            p1["name"], b1["won"], b1["lost"], p2["name"], b2["won"], b2["lost"]))
    parts.append(_section("The players", _table(["Player", "Rank", "Country", "Age", "Plays", "Career W-L", "Win pct", "Titles"], rows),
                          "".join(_p(x) for x in prof)))

    body = []
    for p in players:
        runs = sorted(path[p["id"]], key=lambda x: x["when"] or dt.datetime.min.replace(tzinfo=dt.timezone.utc))
        if not runs:
            continue
        body.append("<h3>%s</h3>" % esc(p["name"]))
        body.append(_table(["Round", "Opponent", "Result"], [
            (r["round"], r["opp"], ("Won " if r["won"] else "Lost ") + " ".join(r["sets"])) for r in runs]))
        dropped = sum(1 for r in runs if r["won"] for s in r["sets"] if _set_lost(s))
        wins = sum(1 for r in runs if r["won"])
        if wins:
            body.append(_p("%s has won %d match%s here and dropped %d set%s doing it." % (
                p["name"], wins, "" if wins == 1 else "es", dropped, "" if dropped == 1 else "s")))
    if body:
        parts.append(_section("The road to this match", "".join(body)))
    body = []
    for p in players:
        runs = sorted(before[p["id"]], key=lambda x: x["when"])[-6:]
        if not runs:
            continue
        w_ = sum(1 for r in runs if r["won"])
        body.append("<h3>%s</h3>" % esc(p["name"]))
        body.append(_p("Across the most recent tour matches before this event, %s went %d and %d." % (p["name"], w_, len(runs) - w_)))
        body.append(_table(["Event", "Round", "Opponent", "Result"], [
            (r["event"], r["round"], r["opp"], ("Won " if r["won"] else "Lost ") + " ".join(r["sets"])) for r in reversed(runs)]))
    if body:
        parts.append(_section("Form coming in", "".join(body)))
        d = {}
        for idx, p in enumerate(players):
            wins = [r for r in path[p["id"]] if r["won"]]
            if wins:
                d["away" if idx == 0 else "home"] = sum(1 for r in wins for s in r["sets"] if _set_lost(s))
        if len(d) == 2 and d["away"] != d["home"]:
            side = "away" if d["away"] < d["home"] else "home"
            edges.add(side, "%s has had the cleaner week, dropping %d set%s to the other side's %d." % (
                names[side], min(d.values()), "" if min(d.values()) == 1 else "s", max(d.values())), 0.8)
    keys = edges.bullets()
    if keys:
        parts.append(_section("Key factors", _ul(keys)))
    sides = {"away": {"short": p1["name"], "name": p1["name"], "abbr": ""}, "home": {"short": p2["name"], "name": p2["name"], "abbr": ""}}
    parts.append(_read(sides, edges, None, None, None, state, single=True))
    final = ""
    if state == "post":
        w = p1 if p1.get("winner") else p2 if p2.get("winner") else None
        if w:
            l = p2 if w is p1 else p1
            sets = []
            for (ws, wtb), (ls, ltb) in zip(w["sets"], l["sets"]):
                tb = wtb if wtb is not None else ltb
                sets.append("%s-%s%s" % (_fmt(ws), _fmt(ls), " (%s)" % tb if tb is not None else ""))
            note = ""
            if r1 and r2:
                fav = p1 if r1[0] < r2[0] else p2
                note = " The higher ranked player %s." % ("came through" if fav is w else "went out")
            nxt = ""
            runs = sorted(later.get(w["id"]) or [], key=lambda x: x["when"] or dt.datetime.min.replace(tzinfo=dt.timezone.utc))
            if runs:
                r = runs[0]
                nxt = " %s then %s %s %s, %s." % (
                    w["name"], "beat" if r["won"] else "lost to", r["opp"], _round_phrase(r["round"]), " ".join(r["sets"]))
                if r["won"] and r["round"].lower() == "final":
                    nxt += " That made %s the champion here." % w["name"]
            final = '<div class="fp-final"><h2>How it played out</h2>%s</div>' % _p(
                "%s beat %s %s.%s%s" % (w["name"], l["name"], ", ".join(sets), note, nxt))
    return final + "".join(parts), state, "ESPN tennis feed and the current %s rankings" % sport_league


def _round_phrase(rnd):
    rnd = (rnd or "").strip()
    if not rnd:
        return "in the next round"
    return "in %s" % rnd.lower() if re.match(r"(?i)round \d", rnd) else "in the %s" % rnd.lower()


def _set_lost(score):
    m = re.match(r"^(\d+)-(\d+)$", score or "")
    return bool(m) and int(m.group(1)) < int(m.group(2))


# ---------------------------------------------------------------- entry

def _key_factors(edges):
    keys = edges.bullets()
    return _section("Key factors", _ul(keys)) if keys else ""


def build(sport, league, event_id, kickoff=None, get=None, now=None):
    """(html, state) for the preview body, or None when the feed has nothing."""
    get = get or nfl._get_json
    now = now or dt.datetime.now(dt.timezone.utc)
    try:
        if sport == "tennis":
            out = _tennis(league, event_id, kickoff, get)
            if not out:
                return None
            body, state, source = out
        else:
            if sport == "soccer":
                path = "soccer/%s" % SOCCER.get(league, "usa.1")
            else:
                path = PATHS.get(sport)
            if not path:
                return None
            summary = _get(get, "%s%s/summary?event=%s" % (BASE, path, event_id))
            if not summary or not summary.get("header"):
                return None
            comp, sides = _sides(summary)
            if "away" not in sides or "home" not in sides:
                return None
            kickoff = _parse(comp.get("date")) or kickoff
            state = _state(comp)
            if sport == "mlb":
                parts, edges, path = _mlb(get, summary, comp, sides, kickoff, state)
                unit = "runs"
            elif sport in ("ncaaf", "nfl"):
                parts, edges, path = _football(get, summary, comp, sides, kickoff, state, sport)
                unit = "points"
            elif sport == "soccer":
                parts, edges, path = _soccer(get, summary, comp, sides, kickoff, state, league)
                unit = "goals"
            else:
                return None
            shared, _ = _shared(get, summary, sides, kickoff, state, path, edges, unit)
            market, odds, pred, fair = _market(summary, sides, edges, sport)
            body = (_final(summary, sides, sport, state) + "".join(parts) + "".join(shared) + market
                    + _key_factors(edges) + _read(sides, edges, odds, pred, fair, state))
            source = "ESPN game feed, season to date"
    except Exception:  # noqa: BLE001 - a malformed feed keeps the page as it is
        return None
    if not body or len(re.sub(r"<[^>]+>", " ", body).split()) < (80 if sport == "tennis" else 150):
        return None
    stamp = nfl.et(now)
    src = '<p class="fp-src">Data: %s. Updated %s, %s.</p>' % (
        esc(source), esc(_et_day(now)), esc(nfl.clock(stamp, "ET")))
    return body + src, state


def words(fragment):
    return len(re.sub(r"<[^>]+>", " ", fragment or "").split())
