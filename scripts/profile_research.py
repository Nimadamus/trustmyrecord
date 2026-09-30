#!/usr/bin/env python3
"""Research blocks for /u/<username>/ profile pages (PROFILE_RESEARCH_20260929).

Nima, 2026-09-29: profile pages have to stand on their own for a visitor who
lands on one from Google. This adds a research section built ONLY from data the
build already fetches: GET /api/users/:u/metrics (the same aggregator the stat
tiles, leaderboard and dashboard use) and the member's graded public picks.

Rules:
  * Nothing is estimated or invented. A block with no data is left out.
  * A small sample is described as a small sample, plainly.
  * Pending and void picks never appear (same rule as the rest of the page).
  * Title, meta description, canonical, robots and JSON-LD are not touched here.
  * No dashes as punctuation in prose.

research_html(...) returns an HTML fragment.
"""
import datetime
import html

e = html.escape
MONTHS = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

MARKETS = {
    "h2h": "Moneyline", "spreads": "Spread", "totals": "Game total",
    "alt_spreads": "Alternate spread", "alt_totals": "Alternate total",
    "team_totals": "Team total", "alt_team_totals": "Alternate team total",
    "f5_h2h": "First 5 innings moneyline", "f5_spreads": "First 5 innings run line",
    "f5_totals": "First 5 innings total", "h2h_3_way": "Three way moneyline",
    "draw_no_bet": "Draw no bet", "btts": "Both teams to score",
    "batter_hits": "Batter hits prop", "batter_total_bases": "Batter total bases prop",
    "batter_home_runs": "Batter home run prop", "batter_rbis": "Batter RBI prop",
    "batter_runs_scored": "Batter runs prop", "batter_hits_runs_rbis": "Hits, runs and RBIs prop",
    "pitcher_strikeouts": "Pitcher strikeouts prop", "pitcher_outs": "Pitcher outs prop",
    "player_points": "Player points prop", "player_rebounds": "Player rebounds prop",
    "player_assists": "Player assists prop", "player_pass_yds": "Passing yards prop",
    "player_rush_yds": "Rushing yards prop", "player_reception_yds": "Receiving yards prop",
    "player_anytime_td": "Anytime touchdown prop", "player_shots_on_goal": "Shots on goal prop",
}
ODDS_BUCKETS = {
    "heavy_favorite": "Heavy favorite (-200 or shorter)", "favorite": "Favorite",
    "even": "Near even money", "underdog": "Underdog", "big_underdog": "Big underdog",
    "heavy_underdog": "Big underdog",
}
FAV_DOG = {"favorite": "Favorites", "underdog": "Underdogs", "even": "Even money"}
DAYS = {"mon": "Mondays", "tue": "Tuesdays", "wed": "Wednesdays", "thu": "Thursdays",
        "fri": "Fridays", "sat": "Saturdays", "sun": "Sundays"}


def num(v, default=0.0):
    try:
        return float(v)
    except (TypeError, ValueError):
        return default


def units(v):
    v = num(v)
    return ("+" if v > 0 else "") + "%.2fu" % v


def pct(v, signed=True):
    v = num(v)
    return (("+" if v > 0 and signed else "") + "%.1f%%" % v)


def amer(o):
    o = int(round(num(o)))
    return "+%d" % o if o > 0 else str(o)


def _dt(iso):
    try:
        return datetime.datetime.fromisoformat(str(iso).replace("Z", "+00:00"))
    except Exception:
        return None


def _pt(t):
    try:
        from zoneinfo import ZoneInfo
        return t.astimezone(ZoneInfo("America/Los_Angeles"))
    except Exception:
        return t.astimezone(datetime.timezone(datetime.timedelta(hours=-7 if 3 < t.month < 11 else -8)))


def day(iso):
    t = _dt(iso)
    if not t:
        return ""
    t = _pt(t)
    return "%s %d, %d" % (MONTHS[t.month], t.day, t.year)


def stamp(iso):
    t = _dt(iso)
    if not t:
        return ""
    t = _pt(t)
    return "%s %d, %d %s PT" % (MONTHS[t.month], t.day, t.year, t.strftime("%I:%M %p").lstrip("0"))


def record(w, l, p):
    return "%d-%d" % (w, l) + ("-%d" % p if p else "")


def market_label(key):
    key = (key or "").strip()
    if key in MARKETS:
        return MARKETS[key]
    words = key.replace("_", " ").strip().lower().split()
    if words and words[0] in ("nfl", "nba", "mlb", "nhl", "ncaaf", "ncaab", "wnba", "soccer"):
        words = words[1:]
    fix = {"rbi": "RBI", "rbis": "RBIs", "td": "touchdown", "tds": "touchdowns", "f5": "first 5 innings",
           "h1": "first half", "h2": "second half", "q1": "first quarter", "ml": "moneyline", "sog": "shots on goal"}
    words = [fix.get(w, w) for w in words]
    label = " ".join(words)
    if words and words[0] in ("batter", "pitcher", "player", "anytime") and "prop" not in words:
        label += " prop"
    return (label[:1].upper() + label[1:]) if label else "Other"


def _table(head, rows, cls="u-table"):
    if not rows:
        return ""
    th = "".join("<th>%s</th>" % e(h) for h in head)
    body = "".join("<tr>%s</tr>" % "".join("<td>%s</td>" % c for c in r) for r in rows)
    return ('<div class="u-scroll"><table class="%s"><thead><tr>%s</tr></thead><tbody>%s</tbody></table></div>'
            % (cls, th, body))


def _block(title, *parts):
    body = "".join(p for p in parts if p)
    if not body:
        return ""
    return '<section class="u-block"><h2>%s</h2>%s</section>' % (e(title), body)


def _p(text):
    return '<p class="u-note">%s</p>' % e(text) if text else ""


def _tone(v):
    v = num(v)
    return "u-win" if v > 0 else "u-loss" if v < 0 else "u-push"


def _cell(v, fmt):
    return '<span class="%s">%s</span>' % (_tone(v), e(fmt(v)))


def _split_rows(items, label_fn, min_total=1):
    rows = []
    merged, order = {}, []
    for s in items or []:
        lab = label_fn(s.get("key"))
        if lab not in merged:
            merged[lab] = {"w": 0, "l": 0, "p": 0, "t": 0, "net": 0.0, "risked": 0.0}
            order.append(lab)
        g = merged[lab]
        g["w"] += int(num(s.get("wins")))
        g["l"] += int(num(s.get("losses")))
        g["p"] += int(num(s.get("pushes")))
        g["t"] += int(num(s.get("total")))
        g["net"] += num(s.get("net"))
        g["risked"] += num(s.get("risked"))
    for lab in sorted(order, key=lambda k: -merged[k]["t"]):
        g = merged[lab]
        if g["t"] < min_total:
            continue
        roi = g["net"] / g["risked"] * 100 if g["risked"] else 0.0
        wr = g["w"] / (g["w"] + g["l"]) * 100 if (g["w"] + g["l"]) else 0.0
        rows.append((lab, g, roi, wr))
    return rows


def _split_table(title, rows, first_col, note=""):
    if not rows:
        return ""
    body = [(e(lab), e(record(g["w"], g["l"], g["p"])), str(g["t"]), _cell(g["net"], units),
             _cell(roi, pct), "%.1f%%" % wr) for lab, g, roi, wr in rows]
    return _block(title, _table([first_col, "Record", "Picks", "Units", "ROI", "Win %"], body, "u-table u-t--split"),
                  _p(note))


def _team_rows(graded):
    teams = {}
    for pk in graded:
        sel = (pk.get("selected_team") or pk.get("selection") or "").strip()
        home, away = (pk.get("home_team") or "").strip(), (pk.get("away_team") or "").strip()
        team = None
        for name in (home, away):
            if name and sel and (sel == name or sel.startswith(name) or name.startswith(sel)):
                team = name
                break
        if not team:
            continue
        g = teams.setdefault(team, {"w": 0, "l": 0, "p": 0, "net": 0.0})
        st = pk.get("status")
        g["w" if st == "won" else "l" if st == "lost" else "p"] += 1
        g["net"] += num(pk.get("result_units"))
    rows = [(t, g) for t, g in teams.items() if g["w"] + g["l"] + g["p"] >= 2]
    rows.sort(key=lambda x: (-(x[1]["w"] + x[1]["l"] + x[1]["p"]), x[0]))
    return rows[:8]


def _history_rows(graded, sport_label, short_team):
    rows = []
    for r in graded:
        matchup = ("%s @ %s" % (short_team(r.get("away_team")), short_team(r.get("home_team")))).strip(" @")
        sel = (r.get("selection") or "").strip()
        line = (r.get("line_snapshot") or "").strip()
        pick = (sel + (" " + line if line and line not in sel else "")).strip()
        if num(r.get("odds_snapshot")):
            pick += " (%s)" % amer(r.get("odds_snapshot"))
        st = r.get("status")
        net = num(r.get("result_units")) if r.get("result_units") is not None else None
        rows.append((e(day(r.get("commence_time") or r.get("graded_at"))), e(sport_label(r.get("sport_key"))),
                     e(matchup), e(pick), e(market_label(r.get("market_type"))),
                     '<span class="u-%s">%s</span>' % ({"won": "win", "lost": "loss"}.get(st, "push"),
                                                      e({"won": "Won", "lost": "Lost", "push": "Push"}.get(st, st or ""))),
                     _cell(net, units) if net is not None else ""))
    return rows


def research_html(disp, un, m, graded, tp, sport_label, short_team, joined=""):
    """HTML research section for one member. `graded` is newest first."""
    m = m or {}
    summ = m.get("summary") or {}
    out = []
    if tp < 1 or not summ:
        text = ("%s joined TrustMyRecord%s and has not had a pick graded yet, so there is no record to report. "
                "Every pick a member makes is locked before the game starts and graded from the final result, "
                "and the first settled pick will appear on this page with its date, price and outcome."
                % (disp, " in " + joined if joined else ""))
        out.append(_block("About this profile", _p(text)))
        out.append(_links(un))
        return '<div id="uResearch">%s</div>' % "".join(out)

    w, l, p = int(num(summ.get("wins"))), int(num(summ.get("losses"))), int(num(summ.get("pushes")))
    first, last = day(summ.get("first_pick_at")), day(summ.get("last_pick_at"))
    lines = []
    lines.append("%s has %d graded pick%s on TrustMyRecord%s%s. The record is %s for %s and a %s return on "
                 "units risked, winning %s of decided picks%s." % (
                     disp, tp, "" if tp == 1 else "s",
                     ", the first locked on " + first if first else "",
                     " and the most recent on " + last if last and last != first else "",
                     record(w, l, p), units(summ.get("net_units")), pct(summ.get("roi")),
                     "%.1f%%" % num(summ.get("win_rate")),
                     " at an average price of " + amer(summ.get("avg_odds")) if summ.get("avg_odds") is not None else ""))
    if summ.get("avg_units") is not None and tp >= 3:
        lines.append("The typical stake is %.2f units, and the largest single stake on record is %.2f units." % (
            num(summ.get("avg_units")), num(summ.get("largest_unit"))))
    if tp < 10:
        lines.append("That is a small sample. With this few settled picks a single result can swing every number "
                     "above, so treat it as an early read. TrustMyRecord keeps grading each new pick %s locks." % disp)
    elif tp < 50:
        lines.append("The sample is still growing, so the splits below are more useful for spotting habits than for "
                     "judging long run skill.")
    out.append(_block("Record summary", "".join(_p(x) for x in lines)))

    # Periods
    per = m.get("periods") or {}
    prow = []
    seen = set()
    for key, label in (("7d", "Last 7 days"), ("30d", "Last 30 days"), ("90d", "Last 90 days"), ("365d", "Last 365 days")):
        d = per.get(key) or {}
        t = int(num(d.get("total")))
        if t < 1 or (t, round(num(d.get("net_units")), 2)) in seen or (t == tp and key == "365d"):
            continue
        seen.add((t, round(num(d.get("net_units")), 2)))
        prow.append((e(label), str(t), _cell(d.get("net_units"), units), _cell(d.get("roi"), pct)))
    prow.append(("All graded picks", str(tp), _cell(summ.get("net_units"), units), _cell(summ.get("roi"), pct)))
    roll = m.get("rolling_form") or {}
    rrow = []
    for key, n in (("last_25", 25), ("last_50", 50), ("last_100", 100)):
        d = roll.get(key) or {}
        if int(num(d.get("total"))) >= n:
            rrow.append(("Last %d graded" % n, e(record(int(num(d.get("wins"))), int(num(d.get("losses"))), int(num(d.get("pushes"))))),
                         _cell(d.get("net_units"), units), _cell(d.get("roi"), pct), "%.1f%%" % num(d.get("win_rate"))))
    note = "Each window counts the graded picks inside that period. A window with no graded picks is left out."
    out.append(_block("Performance over time", _table(["Window", "Picks", "Units", "ROI"], prow),
                      _table(["Recent form", "Record", "Units", "ROI", "Win %"], rrow), _p(note)))

    # Streaks
    st = m.get("streaks") or {}
    srows = []
    cur = int(num(st.get("current")))
    if cur:
        cd = st.get("current_detail") or {}
        srows.append(("Current", "%s %d" % ("Won" if cur > 0 else "Lost", abs(cur)), _cell(cd.get("net_units"), units) if cd else ""))
    for key, label in (("best", "Longest winning run"), ("worst", "Longest losing run")):
        v = int(num(st.get(key)))
        dd = st.get(key + "_detail") or {}
        if v:
            srows.append((label, "%d in a row" % abs(v), _cell(dd.get("net_units"), units) if dd else ""))
    if srows:
        out.append(_block("Streaks", _table(["Streak", "Length", "Units in that run"], srows)))

    sp = m.get("splits") or {}
    out.append(_split_table("Record by bet type", _split_rows(sp.get("by_market"), market_label), "Bet type",
                            "Bet types come from the market each pick was locked in."))
    out.append(_split_table("Favorites and underdogs", _split_rows(sp.get("by_fav_dog"), lambda k: FAV_DOG.get(k, market_label(k))), "Side of the price"))
    out.append(_split_table("Record by price range", _split_rows(sp.get("by_odds_bucket"), lambda k: ODDS_BUCKETS.get(k, market_label(k))), "Price range",
                            "Prices are the odds captured when each pick was locked."))

    # Best and worst, in words
    bw = m.get("best_worst") or {}
    notes = []
    mk = bw.get("market") or {}
    if (mk.get("best") or {}).get("key") and (mk.get("worst") or {}).get("key") and mk["best"]["key"] != mk["worst"]["key"] and tp >= 20:
        notes.append("The strongest bet type so far is %s at %s over %d picks, and the weakest is %s at %s over %d." % (
            market_label(mk["best"]["key"]).lower(), units(mk["best"].get("net")), int(num(mk["best"].get("total"))),
            market_label(mk["worst"]["key"]).lower(), units(mk["worst"].get("net")), int(num(mk["worst"].get("total")))))
    dw = bw.get("day_of_week") or {}
    if (dw.get("best") or {}).get("key") in DAYS and (dw.get("worst") or {}).get("key") in DAYS and tp >= 30:
        notes.append("By day of the week, %s have been best at %s and %s worst at %s." % (
            DAYS[dw["best"]["key"]], units(dw["best"].get("net")), DAYS[dw["worst"]["key"]], units(dw["worst"].get("net"))))
    dd = m.get("drawdown") or {}
    if num(dd.get("max_drawdown")) > 0 and tp >= 20:
        notes.append("The deepest drop from a high point was %.2f units, measured from a peak of %s." % (
            num(dd.get("max_drawdown")), units(dd.get("peak_units"))))
    clv = ((m.get("scores") or {}).get("clv_detail")) or {}
    if clv.get("available") and clv.get("sufficient") and clv.get("avg_clv") is not None:
        notes.append("Against the closing line, the average CLV is %s across %d picks where a close was captured%s." % (
            pct(clv.get("avg_clv")), int(num(clv.get("sample_size"))),
            ", or %s with the book's margin removed" % pct(clv.get("avg_clv_novig")) if clv.get("avg_clv_novig") is not None else ""))
    if notes:
        out.append(_block("What the numbers show", "".join(_p(x) for x in notes)))

    teams = _team_rows(graded)
    if teams:
        rows = [(e(t), str(g["w"] + g["l"] + g["p"]), e(record(g["w"], g["l"], g["p"])), _cell(g["net"], units)) for t, g in teams]
        out.append(_block("Teams picked most often", _table(["Team", "Picks", "Record", "Units"], rows),
                          _p("Counted from moneyline and spread picks that name a team. Teams with a single pick are left out.")))

    hist = graded[5:45]
    if hist:
        shown = len(hist)
        note = ("Showing graded picks 6 to %d of %d, newest first. The five most recent are in the table above." % (5 + shown, tp)
                if tp > 5 + shown else "Every earlier graded pick, newest first. The five most recent are in the table above.")
        out.append(_block("Earlier graded picks",
                          _table(["Date", "Sport", "Matchup", "Pick", "Bet type", "Result", "Net"],
                                 _history_rows(hist, sport_label, short_team), "u-table u-t--picks"), _p(note)))

    gen = stamp(m.get("generated_at"))
    fresh = ("Numbers on this page come from the TrustMyRecord ledger%s. The page is rebuilt from that ledger on a "
             "schedule, so a pick that settles shows up here within the hour." % (", last calculated " + gen if gen else ""))
    out.append(_block("Data freshness", _p(fresh)))
    out.append(_links(un))
    return '<div id="uResearch">%s</div>' % "".join(out)


def _links(un):
    q = e(un)
    return ('<section class="u-block"><h2>Go deeper</h2><p class="u-links">'
            '<a href="/profile/?user=%s#record">Full pick history</a> · '
            '<a href="/profile/?user=%s#charts">Performance charts</a> · '
            '<a href="/how-grading-works/">How grading works</a> · '
            '<a href="/stats/units/">Units explained</a> · '
            '<a href="/stats/sample-size/">Why sample size matters</a> · '
            '<a href="/stats/z-score/">Z score</a> · '
            '<a href="/stats/bad-clv/">Closing line value</a> · '
            '<a href="/leaderboards/">Leaderboards</a></p></section>' % (q, q))
