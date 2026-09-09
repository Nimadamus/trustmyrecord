"""NCAAF_HANDICAPPING_HUB_20260909 - the HTML half of /handicapping/ncaaf/.

Everything here is rendering. Every number it prints was fetched by
ncaaf_hub.py from a live feed on this build. A module whose feed returned
nothing writes no markup at all rather than a placeholder or a note about what
is missing, which is the whole difference between a research page and an
apology.
"""

import html
import os

import ncaaf_hub as H


def esc(s):
    return html.escape(str(s if s is not None else ""), quote=True)


# ---------------------------------------------------------------- numbers

def dash(v):
    """Escape a value, or render an em dash when there is nothing to show.

    esc() on a string that is already an HTML entity prints the entity, which
    is how "&mdash;" ends up on the page as five literal characters."""
    return esc(v) if (v not in (None, "")) else "&mdash;"


def _f(txt):
    try:
        return float(str(txt).replace(",", "").replace("%", ""))
    except (TypeError, ValueError):
        return None


def pick(js, cat, name, prefer="value"):
    """(value, display, rank) for one team statistic, or None.

    Three ESPN quirks are handled here and nowhere else. Season totals and per
    game rates live in the same record, so `prefer` says which one the page
    wants. Several college percentage stats ship a displayValue of 0.00 with
    the real figure in perGameDisplayValue, so a zero falls through to it; when
    that happens the rank is dropped with it, because the rank ESPN attached
    belongs to the zero and reads as "Tied-1st" on every team in the country.
    And the fallback figures carry three decimals, which is a spreadsheet, not
    a page, so anything longer than two is rounded."""
    s = H._stat(js, cat, name)
    if not s:
        return None
    val, disp = s.get("value"), s.get("displayValue")
    pg_disp = s.get("perGameDisplayValue")
    rank = s.get("rankDisplayValue") or ""
    if prefer == "pergame" and pg_disp:
        # ESPN ranks the season TOTAL, not the per game rate. The two only
        # agree while every team has played the same number of games, so the
        # rank is dropped rather than attached to a figure it does not rank.
        disp, val, rank = pg_disp, _f(pg_disp), ""
    elif (_f(disp) in (None, 0.0)) and pg_disp:
        disp, val, rank = pg_disp, _f(pg_disp), ""
    val = _f(val) if val is not None else _f(disp)
    if val is None:
        return None
    text = str(disp)
    if "." in text and len(text.split(".")[-1]) > 2:
        text = "%.1f" % val
    return {"v": val, "d": text, "rank": rank}


def mmss(seconds):
    if seconds is None:
        return None
    s = int(round(seconds))
    return "%d:%02d" % (s // 60, s % 60)


def derived(js, standings_row):
    """The comparison rows that are not a single feed field.

    Points allowed comes from the standings because the college team
    statistics feed answers 0 for it. Yards per play is a division ESPN does
    not publish for college. Yards allowed has no source at all, so there is no
    row for it."""
    out = {}
    gp = (pick(js, "general", "gamesPlayed") or {}).get("v")
    yards = pick(js, "passing", "netTotalYards")
    plays = pick(js, "passing", "totalOffensivePlays")
    if yards and plays and plays["v"]:
        out["ypp"] = {"v": yards["v"] / plays["v"], "d": "%.2f" % (yards["v"] / plays["v"]),
                      "rank": ""}
    pa = _f((standings_row or {}).get("pointsagainst"))
    if pa is not None and gp:
        out["papg"] = {"v": pa / gp, "d": "%.1f" % (pa / gp), "rank": ""}
    top = pick(js, "miscellaneous", "possessionTimeSeconds", "pergame")
    if top and top["v"]:
        out["top"] = {"v": top["v"], "d": mmss(top["v"]), "rank": top["rank"]}
    pen = pick(js, "general", "totalPenaltyYards")
    if pen and gp:
        out["pen"] = {"v": pen["v"] / gp, "d": "%.1f" % (pen["v"] / gp), "rank": ""}
    return out


# label, where to read it, higher is better, unit suffix
COMPARE = [
    ("Points per game", ("scoring", "totalPointsPerGame", "value"), True, ""),
    ("Points allowed per game", ("d", "papg"), False, ""),
    ("Total yards per game", ("passing", "netYardsPerGame", "value"), True, ""),
    ("Yards per play", ("d", "ypp"), True, ""),
    ("Pass yards per game", ("passing", "netPassingYardsPerGame", "value"), True, ""),
    ("Yards per pass attempt", ("passing", "yardsPerPassAttempt", "value"), True, ""),
    ("Rush yards per game", ("rushing", "rushingYardsPerGame", "value"), True, ""),
    ("Yards per carry", ("rushing", "yardsPerRushAttempt", "value"), True, ""),
    ("First downs per game", ("miscellaneous", "firstDownsPerGame", "value"), True, ""),
    ("Third down conversions", ("miscellaneous", "thirdDownConvPct", "value"), True, "%"),
    ("Fourth down conversions", ("miscellaneous", "fourthDownConvPct", "value"), True, "%"),
    ("Red zone scoring", ("miscellaneous", "redzoneScoringPct", "value"), True, "%"),
    ("Sacks per game", ("defensive", "sacks", "pergame"), True, ""),
    ("Tackles for loss per game", ("defensive", "tacklesForLoss", "pergame"), True, ""),
    ("Takeaways", ("miscellaneous", "totalTakeaways", "value"), True, ""),
    ("Giveaways", ("miscellaneous", "totalGiveaways", "value"), False, ""),
    ("Turnover margin", ("miscellaneous", "turnOverDifferential", "value"), True, ""),
    ("Time of possession", ("d", "top"), True, ""),
    ("Penalty yards per game", ("d", "pen"), False, ""),
]


def _read(spec, js, der):
    if spec[0] == "d":
        return der.get(spec[1])
    return pick(js, spec[0], spec[1], spec[2])


# ---------------------------------------------------------------- pieces

def team_chip(t, size=44):
    rank = t.get("ap") or t.get("rank")
    rk = '<span class="cf-rk">%s</span>' % esc(rank) if rank and rank <= 25 else ""
    return ('<span class="cf-team">%s<img src="%s" alt="" width="%d" height="%d" loading="lazy">'
            '<b>%s</b></span>' % (rk, esc(t["logo"]), size, size, esc(t["short"] or t["name"])))


def fmt_spread(v):
    if v is None:
        return None
    if abs(v) < 1e-9:
        return "PK"
    return ("%+.1f" % v).replace(".0", "")


def fmt_ml(v):
    if v in (None, ""):
        return None
    try:
        n = int(float(v))
    except (TypeError, ValueError):
        return str(v)
    return "%+d" % n


def market_line(g):
    """The card's price row, from whichever feed priced the game."""
    home, away = g["home"], g["away"]
    sp = g.get("spread")
    cells = []
    if sp is not None:
        fav, dog = (home, away) if sp < 0 else (away, home)
        cells.append(("Spread", "%s %s" % (fav["abbr"] or fav["short"],
                                           fmt_spread(-abs(sp)))))
    if g.get("total") is not None:
        cells.append(("Total", "%g" % float(g["total"])))
    hm, am = fmt_ml(g.get("home_ml")), fmt_ml(g.get("away_ml"))
    if hm and am:
        cells.append(("Moneyline", "%s %s / %s %s" % (away["abbr"] or away["short"], am,
                                                      home["abbr"] or home["short"], hm)))
    if not cells:
        return ""
    book = ('<span class="cf-book">%s</span>' % esc(g["book"])) if g.get("book") else ""
    return ('<div class="cf-mkt">%s%s</div>'
            % ("".join('<span class="cf-mkt-i"><i>%s</i><b>%s</b></span>' % (esc(k), esc(v))
                       for k, v in cells), book))


def conf_badge(t):
    if not t.get("conf"):
        return ""
    return '<span class="cf-badge cf-badge--%s">%s</span>' % (esc(t["tier"]), esc(t["conf"]))


# ---------------------------------------------------------------- modules

def mod_records(ctx):
    a, h = ctx["g"]["away"], ctx["g"]["home"]
    rows = [("Overall", a.get("rec"), h.get("rec")),
            ("Home", a.get("home_rec"), h.get("home_rec")),
            ("Road", a.get("away_rec"), h.get("away_rec")),
            ("In conference", a.get("conf_rec"), h.get("conf_rec"))]
    rows = [r for r in rows if r[1] or r[2]]
    sp = ctx.get("pts") or {}
    for label, key in (("Points scored", "pointsfor"), ("Points allowed", "pointsagainst"),
                       ("Point differential", "pointdifferential")):
        av = (sp.get(a["id"]) or {}).get(key)
        hv = (sp.get(h["id"]) or {}).get(key)
        if av or hv:
            rows.append((label, av, hv))
    st_a = (sp.get(a["id"]) or {}).get("streak")
    st_h = (sp.get(h["id"]) or {}).get("streak")
    if st_a or st_h:
        rows.append(("Current streak", st_a, st_h))
    if not rows:
        return ""
    body = "".join('<tr><th scope="row">%s</th><td>%s</td><td>%s</td></tr>'
                   % (esc(l), dash(x), dash(y)) for l, x, y in rows)
    return _panel("Records", ctx, body,
                  note="Season records from the ESPN scoreboard, scoring from the FBS standings.")


def _panel(title, ctx, body_rows, note=None):
    a, h = ctx["g"]["away"], ctx["g"]["home"]
    return ('<div class="cf-panel"><h4>%s</h4>'
            '<table class="cf-cmp"><thead><tr><th></th>'
            '<th><img src="%s" alt="" width="20" height="20" loading="lazy">%s</th>'
            '<th><img src="%s" alt="" width="20" height="20" loading="lazy">%s</th>'
            '</tr></thead><tbody>%s</tbody></table>%s</div>'
            % (esc(title), esc(a["logo"]), esc(a["abbr"] or a["short"]),
               esc(h["logo"]), esc(h["abbr"] or h["short"]), body_rows,
               ('<p class="cf-note">%s</p>' % esc(note)) if note else ""))


def mod_compare(ctx):
    """The statistical comparison, with the national rank on every figure and a
    bar showing which side owns the category."""
    ja, jh = ctx["stats_a"], ctx["stats_h"]
    da, dh = ctx["der_a"], ctx["der_h"]
    rows = []
    for label, spec, higher, unit in COMPARE:
        va, vh = _read(spec, ja, da), _read(spec, jh, dh)
        if not va or not vh:
            continue
        lead = None
        if abs(va["v"] - vh["v"]) > 1e-9:
            lead = "a" if ((va["v"] > vh["v"]) == higher) else "h"
        total = abs(va["v"]) + abs(vh["v"]) or 1
        wa = max(6, min(94, abs(va["v"]) / total * 100))
        rows.append(
            '<tr class="cf-row"><th scope="row">%s</th>'
            '<td class="%s"><b>%s%s</b>%s</td>'
            '<td class="cf-barcell"><span class="cf-bar">'
            '<i class="cf-bar-a" style="width:%.1f%%"></i>'
            '<i class="cf-bar-h" style="width:%.1f%%"></i></span></td>'
            '<td class="%s"><b>%s%s</b>%s</td></tr>'
            % (esc(label),
               "cf-win" if lead == "a" else "", esc(va["d"]), unit,
               ('<em>%s</em>' % esc(va["rank"])) if va.get("rank") else "",
               wa, 100 - wa,
               "cf-win" if lead == "h" else "", esc(vh["d"]), unit,
               ('<em>%s</em>' % esc(vh["rank"])) if vh.get("rank") else ""))
    if not rows:
        return ""
    a, h = ctx["g"]["away"], ctx["g"]["home"]
    seasons = sorted({ctx["season_a"], ctx["season_h"]})
    label = ("%d season" % seasons[0] if len(seasons) == 1
             else "%s seasons" % " and ".join(str(s) for s in seasons))
    return ('<div class="cf-panel cf-panel--wide"><h4>Team comparison</h4>'
            '<table class="cf-stat"><thead><tr><th></th>'
            '<th><img src="%s" alt="" width="22" height="22" loading="lazy">%s</th>'
            '<th class="cf-barhead"></th>'
            '<th><img src="%s" alt="" width="22" height="22" loading="lazy">%s</th></tr></thead>'
            '<tbody>%s</tbody></table>'
            '<p class="cf-note">%s. Small figures are the national rank among all '
            'FBS teams.</p></div>'
            % (esc(a["logo"]), esc(a["abbr"] or a["short"]),
               esc(h["logo"]), esc(h["abbr"] or h["short"]),
               "".join(rows), esc(label)))


ATS_ROWS = [("Against the spread", "ats"), ("ATS at home", "ats_home"),
            ("ATS on the road", "ats_away"), ("ATS as favorite", "ats_fav"),
            ("ATS as underdog", "ats_dog"), ("Over/under", "ou"),
            ("Over/under at home", "ou_home"), ("Over/under on the road", "ou_away"),
            ("Straight up", "su")]


def _ats_cell(rec):
    if not rec:
        return "&mdash;"
    pct = rec.get("pct")
    tag = ""
    if pct is not None and (rec["w"] + rec["l"]) >= 4:
        tag = '<em class="%s">%.0f%%</em>' % ("cf-good" if pct >= 0.5 else "cf-bad", pct * 100)
    return "%s%s" % (esc(rec["record"]), tag)


def _last5(rows, key, win, lose):
    w = sum(1 for r in rows if r.get(key) == win)
    l = sum(1 for r in rows if r.get(key) == lose)
    p = sum(1 for r in rows if r.get(key) == "P")
    if not (w + l + p):
        return ""
    return "%d-%d%s" % (w, l, "-%d" % p if p else "")


def mod_ats(ctx):
    aa, ah = ctx["ats_a"], ctx["ats_h"]
    if not aa and not ah:
        return ""
    rows = []
    for label, key in ATS_ROWS:
        if key not in aa and key not in ah:
            continue
        rows.append('<tr><th scope="row">%s</th><td>%s</td><td>%s</td></tr>'
                    % (esc(label), _ats_cell(aa.get(key)), _ats_cell(ah.get(key))))
    if not rows:
        return ""
    for label, key, win, lose in (("ATS, last %d" % H.FORM_GAMES, "cover", "W", "L"),
                                  ("Over/under, last %d" % H.FORM_GAMES, "ou", "O", "U")):
        va, vh = _last5(ctx["form_a"], key, win, lose), _last5(ctx["form_h"], key, win, lose)
        if va or vh:
            rows.append('<tr><th scope="row">%s</th><td>%s</td><td>%s</td></tr>'
                        % (esc(label), dash(va), dash(vh)))
    na = max((v.get("n") or 0) for v in (aa or {"x": {"n": 0}}).values())
    nh = max((v.get("n") or 0) for v in (ah or {"x": {"n": 0}}).values())
    span = max(na, nh)
    return _panel("Betting trends", ctx, "".join(rows),
                  note="Counted off the last %d games each team has played, every one "
                       "settled at that game's own closing number." % span)


def _form_rows(rows, tid):
    out = []
    for r in rows:
        us, them = r["us"], r["them"]
        res = "W" if us.get("winner") else "L"
        where = "vs" if us["home"] else "at"
        if r.get("neutral"):
            where = "vs"
        cover = r.get("cover")
        ou = r.get("ou")
        line = ""
        if r.get("line") is not None:
            line = fmt_spread(r["line"]) or ""
        out.append(
            '<tr><td class="cf-date">%s</td>'
            '<td class="cf-opp">%s %s</td>'
            '<td><span class="cf-res cf-res--%s">%s</span> %d&ndash;%d</td>'
            '<td>%s</td>'
            '<td>%s</td>'
            '<td>%s</td></tr>'
            % (esc(H.short_date(r["iso"])), esc(where), esc(them["name"]),
               "w" if res == "W" else "l", res, us["score"], them["score"],
               dash(line),
               ('<span class="cf-tag cf-tag--%s">%s</span>'
                % ({"W": "w", "L": "l", "P": "p"}[cover],
                   {"W": "Cover", "L": "No cover", "P": "Push"}[cover])) if cover else "&mdash;",
               ('<span class="cf-tag cf-tag--%s">%s</span>'
                % ({"O": "o", "U": "u", "P": "p"}[ou],
                   {"O": "Over", "U": "Under", "P": "Push"}[ou])) if ou else "&mdash;"))
    return "".join(out)


def mod_form(ctx):
    blocks = []
    for side, key in (("away", "form_a"), ("home", "form_h")):
        rows = ctx[key]
        if not rows:
            continue
        t = ctx["g"][side]
        blocks.append(
            '<div class="cf-form"><h5><img src="%s" alt="" width="22" height="22" '
            'loading="lazy">%s, last %d</h5>'
            '<div class="cf-scroll"><table class="cf-log"><thead><tr>'
            '<th>Date</th><th>Opponent</th><th>Result</th><th>Line</th>'
            '<th>Spread</th><th>Total</th></tr></thead><tbody>%s</tbody></table></div></div>'
            % (esc(t["logo"]), esc(t["short"] or t["name"]), len(rows),
               _form_rows(rows, t["id"])))
    if not blocks:
        return ""
    return ('<div class="cf-panel cf-panel--wide"><h4>Recent form</h4>%s'
            '<p class="cf-note">Line is the team\'s own closing number in that game. '
            'The spread and total columns settle it against the closing number.</p></div>'
            % "".join(blocks))


def mod_h2h(ctx):
    rows = ctx.get("h2h") or []
    if not rows:
        return ""
    home = ctx["g"]["home"]
    body = []
    for r in rows:
        us, them = r["us"], r["them"]
        site = "Neutral" if r.get("neutral") else (home["short"] if us["home"] else them["name"])
        winner = us["name"] if us.get("winner") else them["name"]
        tot = us["score"] + them["score"]
        ou = ""
        if r.get("total") is not None:
            ou = "%s %g" % ("Over" if tot > r["total"] else
                            ("Under" if tot < r["total"] else "Push"), float(r["total"]))
        sp = ""
        if r.get("spread") is not None:
            h_side, a_side = (us, them) if us["home"] else (them, us)
            margin = (h_side["score"] + r["spread"]) - a_side["score"]
            covered = h_side["name"] if margin > 0 else (a_side["name"] if margin < 0 else "Push")
            sp = "%s %s" % (covered, fmt_spread(r["spread"]) or "")
        body.append('<tr><td class="cf-date">%s</td><td>%s</td>'
                    '<td>%s %d&ndash;%d</td><td>%s</td><td>%s</td></tr>'
                    % (esc(H.short_date(r["iso"])), esc(site), esc(winner),
                       max(us["score"], them["score"]), min(us["score"], them["score"]),
                       dash(sp), dash(ou)))
    return ('<div class="cf-panel cf-panel--wide"><h4>Head to head</h4>'
            '<div class="cf-scroll"><table class="cf-log"><thead><tr><th>Date</th><th>Site</th>'
            '<th>Result</th><th>Spread</th><th>Total</th></tr></thead><tbody>%s</tbody>'
            '</table></div>'
            '<p class="cf-note">Every meeting on record, settled at each game\'s closing '
            'number.</p></div>' % "".join(body))


LEADER_SPEC = [("passingYards", "Passing"), ("rushingYards", "Rushing"),
               ("receivingYards", "Receiving"), ("totalTackles", "Tackles"),
               ("sacks", "Sacks"), ("interceptions", "Interceptions")]


def mod_leaders(ctx):
    la, lh = ctx["lead_a"], ctx["lead_h"]
    if not la and not lh:
        return ""
    rows = []
    for key, label in LEADER_SPEC:
        a, h = la.get(key), lh.get(key)
        if not a and not h:
            continue

        def one(x):
            if not x:
                return "&mdash;"
            return '%s%s<em>%s</em>' % (esc(x["name"]),
                                        (' <span class="cf-pos">%s</span>' % esc(x["pos"]))
                                        if x.get("pos") else "", esc(x["line"]))
        rows.append('<tr><th scope="row">%s</th><td>%s</td><td>%s</td></tr>'
                    % (esc(label), one(a), one(h)))
    if not rows:
        return ""
    return _panel("Season leaders", ctx, "".join(rows))


def mod_context(ctx):
    a, h = ctx["g"]["away"], ctx["g"]["home"]
    rows = []
    ca, ch = ctx.get("coach_a"), ctx.get("coach_h")
    if ca or ch:
        def cname(c):
            if not c:
                return "&mdash;"
            extra = []
            if c.get("years"):
                extra.append("year %s" % c["years"])
            if c.get("record"):
                extra.append(c["record"])
            return "%s%s" % (esc(c["name"]),
                             (' <em>%s</em>' % esc(", ".join(extra))) if extra else "")
        rows.append('<tr><th scope="row">Head coach</th><td>%s</td><td>%s</td></tr>'
                    % (cname(ca), cname(ch)))
    if a.get("conf") or h.get("conf"):
        rows.append('<tr><th scope="row">Conference</th><td>%s</td><td>%s</td></tr>'
                    % (dash(a.get("conf")), dash(h.get("conf"))))
    ap_a = a.get("ap") or a.get("rank")
    ap_h = h.get("ap") or h.get("rank")
    if (ap_a and ap_a <= 25) or (ap_h and ap_h <= 25):
        def poll(t):
            bits = []
            if t.get("ap") and t["ap"] <= 25:
                bits.append("AP %d" % t["ap"])
            if t.get("coaches") and t["coaches"] <= 25:
                bits.append("Coaches %d" % t["coaches"])
            return ", ".join(bits) or "Unranked"
        rows.append('<tr><th scope="row">Polls</th><td>%s</td><td>%s</td></tr>'
                    % (esc(poll(a)), esc(poll(h))))
    pts = ctx.get("pts") or {}
    va = (pts.get(a["id"]) or {}).get("vsaprankedteams_wins")
    vh = (pts.get(h["id"]) or {}).get("vsaprankedteams_wins")
    if va or vh:
        rows.append('<tr><th scope="row">Wins over AP ranked teams</th>'
                    '<td>%s</td><td>%s</td></tr>' % (esc(va or "0"), esc(vh or "0")))
    if not rows:
        return ""
    return _panel("Team context", ctx, "".join(rows))


def mod_conditions(g):
    bits = []
    if g.get("venue"):
        bits.append(("Venue", "%s%s" % (g["venue"], ", %s" % g["city"] if g["city"] else "")))
    if g.get("neutral"):
        bits.append(("Site", "Neutral field"))
    if g.get("tv"):
        bits.append(("Television", g["tv"]))
    w = g.get("weather") or {}
    if not g.get("indoor") and (w.get("text") or w.get("temp")):
        txt = w.get("text") or ""
        if w.get("temp"):
            txt = ("%s, %s&deg;F" % (txt, w["temp"])) if txt else "%s&deg;F" % w["temp"]
        bits.append(("Forecast", txt))
    elif g.get("indoor"):
        bits.append(("Roof", "Indoors"))
    if not bits:
        return ""
    return ('<div class="cf-panel"><h4>Conditions</h4><table class="cf-cmp cf-cmp--kv"><tbody>%s'
            '</tbody></table></div>'
            % "".join('<tr><th scope="row">%s</th><td colspan="2">%s</td></tr>'
                      % (esc(k), v if k == "Forecast" else esc(v)) for k, v in bits))


# ---------------------------------------------------------------- card

def featured_card(ctx, idx):
    g = ctx["g"]
    a, h = g["away"], g["home"]
    tabs = [("Comparison", mod_compare(ctx)),
            ("Trends", mod_ats(ctx)),
            ("Form", mod_form(ctx)),
            ("History", mod_h2h(ctx)),
            ("Team", "".join([mod_records(ctx), mod_context(ctx), mod_leaders(ctx),
                              mod_conditions(g)]))]
    tabs = [(n, b) for n, b in tabs if b.strip()]
    if not tabs:
        return ""
    nav = "".join('<button type="button" class="cf-tab%s" data-tab="%d-%d">%s</button>'
                  % (" is-on" if i == 0 else "", idx, i, esc(n))
                  for i, (n, _) in enumerate(tabs))
    panes = "".join('<div class="cf-pane%s" data-pane="%d-%d">%s</div>'
                    % (" is-on" if i == 0 else "", idx, i, b)
                    for i, (_, b) in enumerate(tabs))
    meta = " &middot; ".join(esc(x) for x in [H.day_label(g["date"]), H.kickoff_et(g["date"]),
                                              g.get("tv"), g.get("venue")] if x)
    tagline = "Conference game" if g.get("conf_game") else ""
    if a.get("ap") and h.get("ap") and a["ap"] <= 25 and h["ap"] <= 25:
        tagline = "Ranked matchup"
    return (
        '<article class="cf-card">\n'
        '  <header class="cf-card-head">\n'
        '    <div class="cf-card-tags">%s%s%s</div>\n'
        '    <div class="cf-vs">%s<span class="cf-at">%s</span>%s</div>\n'
        '    <p class="cf-when">%s</p>\n'
        '    %s\n'
        '  </header>\n'
        '  <div class="cf-tabs" role="tablist">%s</div>\n'
        '  <div class="cf-panes">%s</div>\n'
        '</article>\n'
        % (('<span class="cf-tag cf-tag--feat">%s</span>' % esc(tagline)) if tagline else "",
           conf_badge(a), conf_badge(h) if h.get("conf") != a.get("conf") else "",
           team_chip(a), "at" if not g.get("neutral") else "vs", team_chip(h),
           meta, market_line(g), nav, panes))


# ---------------------------------------------------------------- board

def _row_filters(g):
    tags = ["all"]
    for t in (g["away"], g["home"]):
        if t.get("conf_id"):
            tags.append("c%s" % t["conf_id"])
        if t.get("tier") == "g5":
            tags.append("g5")
        if (t.get("ap") or 99) <= 25:
            tags.append("top25")
    if (g["away"].get("ap") or 99) <= 25 and (g["home"].get("ap") or 99) <= 25:
        tags.append("ranked")
    return " ".join(sorted(set(tags)))


CONF_TABS = [("all", "All games"), ("featured", "Featured"), ("top25", "Top 25"),
             ("ranked", "Ranked matchups"), ("c8", "SEC"), ("c5", "Big Ten"),
             ("c4", "Big 12"), ("c1", "ACC"), ("c9", "Pac-12"), ("g5", "Group of Five"),
             ("soon", "Starting soon")]

SORTS = [("time", "Kickoff time"), ("fav", "Biggest favorites"),
         ("close", "Closest spreads"), ("high", "Highest totals"),
         ("low", "Lowest totals"), ("rank", "Ranked first")]


def board_section(games, featured_ids, priced_ids):
    if not games:
        return ""
    import datetime
    now = H._eastern_now()[0]
    rows = []
    for g in games:
        a, h = g["away"], g["home"]
        tags = _row_filters(g)
        if g["id"] in featured_ids:
            tags += " featured"
        dt = H._to_et(g["date"])
        if dt and (dt.replace(tzinfo=None) - now.replace(tzinfo=None)).total_seconds() < 86400:
            tags += " soon"
        sp = g.get("spread")
        tot = g.get("total")
        fav_txt = "&mdash;"
        if sp is not None:
            fav = h if sp < 0 else a
            fav_txt = '<b>%s</b> %s' % (esc(fav["abbr"] or fav["short"]),
                                        esc(fmt_spread(-abs(sp))))
        # The moneyline always occupies the same two line box, priced or not.
        # Left to wrap on its own it made a row with a long price two lines
        # tall and its neighbour one, and the board lost its rhythm.
        hm, am = fmt_ml(g.get("home_ml")), fmt_ml(g.get("away_ml"))
        if hm and am:
            ml = ('<span class="cf-mlbox"><span><i>%s</i>%s</span>'
                  '<span><i>%s</i>%s</span></span>'
                  % (esc(a["abbr"] or a["short"]), esc(am),
                     esc(h["abbr"] or h["short"]), esc(hm)))
        else:
            ml = '<span class="cf-mlbox">&mdash;</span>' 
        # The book rides on the same line as the kickoff time. Given a line of
        # its own it made every priced row twenty pixels taller than its
        # neighbours, and a board you scan is a board with an even rhythm.
        book = ""
        if g["id"] in priced_ids and g.get("book"):
            book = ' &middot; <span class="cf-priced">%s</span>' % esc(g["book"])
        rows.append(
            '<tr class="cf-brow" data-f="%s" data-sp="%s" data-tot="%s" data-t="%s" '
            'data-rank="%d">\n'
            '  <td><div class="cf-bteams">%s%s%s</div></td>\n'
            '  <td class="cf-bwhen"><b>%s</b><i>%s%s</i></td>\n'
            '  <td class="cf-bnum">%s</td>\n'
            '  <td class="cf-bnum">%s</td>\n'
            '  <td class="cf-bml">%s</td>\n</tr>\n'
            % (tags, "" if sp is None else "%.1f" % abs(sp),
               "" if tot is None else "%.1f" % float(tot), esc(g["date"]),
               min(a.get("ap") or 99, h.get("ap") or 99),
               _board_team(a), '<span class="cf-bat">at</span>', _board_team(h),
               esc(H.day_label(g["date"])), esc(H.kickoff_et(g["date"])), book,
               fav_txt, "&mdash;" if tot is None else esc("%g" % float(tot)), ml))
    tabs = "".join('<button type="button" class="cf-fbtn%s" data-filter="%s">%s</button>'
                   % (" is-on" if k == "all" else "", k, esc(lab)) for k, lab in CONF_TABS)
    sorts = "".join('<option value="%s">%s</option>' % (k, esc(lab)) for k, lab in SORTS)
    return (
        '        <section class="mm-sec" id="board">\n'
        '            <h2>The full NCAAF board</h2>\n'
        '            <p class="cf-lede">%d game%s on the slate. Filter it by conference or by '
        'what the market is saying, then sort it. Times are Eastern.</p>\n'
        '            <div class="cf-filters">%s</div>\n'
        '            <div class="cf-sortbar"><label for="cf-sort">Sort by</label>'
        '<select id="cf-sort">%s</select>'
        '<span class="cf-count" id="cf-count"></span></div>\n'
        '            <div class="cf-boardwrap"><table class="cf-board"><thead><tr>'
        '<th scope="col">Matchup</th><th scope="col">Kickoff</th>'
        '<th scope="col">Spread</th><th scope="col">Total</th>'
        '<th scope="col">Moneyline</th></tr></thead><tbody id="cf-tbody">%s</tbody>'
        '</table></div>\n'
        '            <p class="cf-empty" id="cf-empty" hidden>No games match that filter.</p>\n'
        '        </section>\n'
        % (len(games), "" if len(games) == 1 else "s", tabs, sorts, "".join(rows)))


def _board_team(t):
    rank = t.get("ap") or t.get("rank")
    rk = ('<span class="cf-brk">%s</span>' % esc(rank)) if rank and rank <= 25 else ""
    return ('<span class="cf-bteam">%s<img src="%s" alt="" width="26" height="26" '
            'loading="lazy"><span class="cf-bname">%s</span>%s</span>'
            % (rk, esc(t["logo"]), esc(t["short"] or t["name"]),
               ('<span class="cf-bconf">%s</span>' % esc(t["conf"])) if t.get("conf") else ""))


# ---------------------------------------------------------------- poll rail

def poll_rail(rows):
    if not rows:
        return ""
    chips = "".join(
        '<span class="cf-poll"><i>%s</i>'
        '<img src="%s" alt="" width="26" height="26" loading="lazy">'
        '<b>%s</b><em>%s</em></span>'
        % (esc(r["rank"]), esc(r["logo"]), esc(r["name"]), esc(r["record"]))
        for r in rows)
    return ('        <section class="mm-sec cf-pollsec">\n'
            '            <h2>AP Top 25</h2>\n'
            '            <div class="cf-pollrail">%s</div>\n'
            '        </section>\n' % chips)


# ---------------------------------------------------------------- page CSS/JS

CSS = """
    <style>
    .cf-lede{max-width:74ch;line-height:1.6;opacity:.85;margin:0 0 16px;font-size:0.95rem}
    .cf-hero{border-radius:18px;padding:clamp(20px,3vw,32px);margin:0 0 28px;
        background:linear-gradient(125deg,rgba(255,201,60,.13),rgba(0,53,148,.20) 55%,rgba(170,0,0,.16));
        border:1px solid rgba(255,201,60,.32)}
    .cf-hero h1{margin:10px 0 12px;font:900 clamp(1.9rem,5vw,3rem)/1.02 "Barlow Condensed",Inter,sans-serif;
        text-transform:uppercase;letter-spacing:.01em}
    .cf-kicker{display:inline-block;font:800 0.74rem/1 "Barlow Condensed",Inter,sans-serif;
        letter-spacing:.2em;text-transform:uppercase;color:#04101c;background:#FFC93C;
        padding:6px 11px;border-radius:5px}
    .cf-hero p{max-width:78ch;line-height:1.65;opacity:.9;margin:0 0 18px;font-size:1rem}
    .cf-stats{display:flex;flex-wrap:wrap;gap:10px}
    .cf-stat-tile{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);
        border-radius:12px;padding:11px 15px;min-width:112px}
    .cf-stat-tile b{display:block;font:900 1.45rem/1 "Barlow Condensed",Inter,sans-serif}
    .cf-stat-tile i{display:block;font-style:normal;font-size:0.74rem;letter-spacing:.12em;
        text-transform:uppercase;opacity:.7;margin-top:5px}
    .cf-pollsec h2,.mm-sec h2{font:900 clamp(1.15rem,2.6vw,1.5rem)/1.1 "Barlow Condensed",Inter,sans-serif;
        text-transform:uppercase;letter-spacing:.03em;margin:0 0 12px}
    .cf-pollrail{display:flex;gap:9px;overflow-x:auto;padding:4px 2px 12px;
        scrollbar-width:thin}
    .cf-poll{display:flex;align-items:center;gap:7px;flex:0 0 auto;padding:8px 12px 8px 8px;
        border-radius:11px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1)}
    .cf-poll i{font-style:normal;font:900 0.82rem/1 "Barlow Condensed",Inter,sans-serif;
        min-width:20px;text-align:center;color:#FFC93C}
    .cf-poll img{width:26px;height:26px;object-fit:contain}
    .cf-poll b{font-size:0.85rem;white-space:nowrap}
    .cf-poll em{font-style:normal;font-size:0.75rem;opacity:.6}
    .cf-cards{display:grid;gap:20px}
    .cf-card{border-radius:16px;border:1px solid rgba(255,255,255,.13);
        background:rgba(255,255,255,.035);overflow:hidden}
    .cf-card-head{padding:clamp(15px,2.4vw,22px)}
    .cf-card-tags{display:flex;flex-wrap:wrap;gap:7px;margin-bottom:12px}
    .cf-badge{font:800 0.74rem/1 "Barlow Condensed",Inter,sans-serif;letter-spacing:.13em;
        text-transform:uppercase;padding:5px 9px;border-radius:5px;
        background:rgba(255,255,255,.09);border:1px solid rgba(255,255,255,.16)}
    .cf-badge--power{background:rgba(66,211,146,.16);border-color:rgba(66,211,146,.4);color:#8ef0c4}
    .cf-badge--g5{background:rgba(120,170,255,.14);border-color:rgba(120,170,255,.36);color:#b8d2ff}
    .cf-tag{font:800 0.74rem/1 "Barlow Condensed",Inter,sans-serif;letter-spacing:.12em;
        text-transform:uppercase;padding:5px 9px;border-radius:5px;display:inline-block}
    .cf-tag--feat{background:#FFC93C;color:#04101c}
    .cf-tag--w{background:rgba(66,211,146,.2);color:#8ef0c4}
    .cf-tag--l{background:rgba(255,110,110,.16);color:#ffb3b3}
    .cf-tag--p{background:rgba(255,255,255,.12);opacity:.85}
    .cf-tag--o{background:rgba(255,201,60,.2);color:#ffdf95}
    .cf-tag--u{background:rgba(120,170,255,.18);color:#c2d8ff}
    .cf-vs{display:flex;align-items:center;flex-wrap:wrap;gap:12px}
    .cf-team{display:flex;align-items:center;gap:9px}
    .cf-team img{width:44px;height:44px;object-fit:contain}
    .cf-team b{font:900 clamp(1.05rem,2.6vw,1.4rem)/1.08 "Barlow Condensed",Inter,sans-serif;
        text-transform:uppercase}
    .cf-rk{font:900 0.8rem/1 "Barlow Condensed",Inter,sans-serif;color:#FFC93C}
    .cf-at{font-size:0.74rem;letter-spacing:.16em;text-transform:uppercase;opacity:.55}
    .cf-when{margin:11px 0 0;font-size:0.88rem;opacity:.78}
    .cf-mkt{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px;align-items:center}
    .cf-mkt-i{background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.13);
        border-radius:10px;padding:8px 12px;display:flex;flex-direction:column;gap:3px}
    .cf-mkt-i i{font-style:normal;font-size:0.74rem;letter-spacing:.13em;text-transform:uppercase;
        opacity:.62}
    .cf-mkt-i b{font:800 0.98rem/1 Inter,sans-serif}
    .cf-book{font-size:0.74rem;opacity:.55}
    .cf-tabs{display:flex;gap:3px;overflow-x:auto;padding:0 clamp(10px,2vw,16px);
        border-top:1px solid rgba(255,255,255,.1);border-bottom:1px solid rgba(255,255,255,.1);
        background:rgba(0,0,0,.14)}
    .cf-tab{flex:0 0 auto;background:none;border:0;border-bottom:2px solid transparent;
        color:inherit;opacity:.62;cursor:pointer;padding:12px 13px;font:800 0.78rem/1 Inter,sans-serif;
        letter-spacing:.06em;text-transform:uppercase}
    .cf-tab:hover{opacity:.9}
    .cf-tab.is-on{opacity:1;border-bottom-color:#FFC93C;color:#FFC93C}
    .cf-pane{display:none;padding:clamp(14px,2.4vw,20px)}
    .cf-pane.is-on{display:grid;gap:18px}
    .cf-panel{min-width:0}
    .cf-panel h4{margin:0 0 10px;font:900 0.95rem/1.1 "Barlow Condensed",Inter,sans-serif;
        text-transform:uppercase;letter-spacing:.1em;opacity:.9}
    .cf-panel h5{margin:0 0 8px;display:flex;align-items:center;gap:7px;
        font:800 0.85rem/1.1 Inter,sans-serif}
    .cf-panel h5 img{width:22px;height:22px;object-fit:contain}
    .cf-cmp,.cf-stat,.cf-log,.cf-board{width:100%;border-collapse:collapse;font-size:0.88rem}
    .cf-cmp th,.cf-cmp td,.cf-stat th,.cf-stat td{padding:8px 9px;border-bottom:1px solid rgba(255,255,255,.08);
        text-align:right;vertical-align:middle}
    .cf-cmp th[scope=row],.cf-stat th[scope=row]{text-align:left;font-weight:500;opacity:.78;
        font-size:0.84rem}
    .cf-cmp thead th,.cf-stat thead th{text-align:right;font:800 0.74rem/1 Inter,sans-serif;
        letter-spacing:.08em;text-transform:uppercase;opacity:.8;white-space:nowrap}
    .cf-cmp thead th img,.cf-stat thead th img{vertical-align:-5px;margin-right:5px;
        width:20px;height:20px;object-fit:contain}
    .cf-cmp td em,.cf-stat td em{display:block;font-style:normal;font-size:0.74rem;opacity:.5;
        margin-top:2px}
    .cf-cmp td em.cf-good{display:inline;margin-left:6px;color:#8ef0c4;opacity:.95;font-size:0.74rem}
    .cf-cmp td em.cf-bad{display:inline;margin-left:6px;color:#ffb3b3;opacity:.95;font-size:0.74rem}
    .cf-stat .cf-win b{color:#FFC93C}
    .cf-barcell{width:34%;padding:8px 6px!important}
    .cf-bar{display:flex;height:7px;border-radius:4px;overflow:hidden;
        background:rgba(255,255,255,.08);min-width:70px}
    .cf-bar-a{background:linear-gradient(90deg,rgba(255,201,60,.45),#FFC93C)}
    .cf-bar-h{background:linear-gradient(90deg,#5b8cff,rgba(91,140,255,.45))}
    .cf-note{margin:10px 0 0;font-size:0.78rem;line-height:1.55;opacity:.6;max-width:78ch}
    .cf-scroll{overflow-x:auto;-webkit-overflow-scrolling:touch}
    .cf-log{min-width:520px}
    .cf-log th,.cf-log td{padding:8px 10px;text-align:left;white-space:nowrap;
        border-bottom:1px solid rgba(255,255,255,.08)}
    .cf-log thead th{font:800 0.74rem/1 Inter,sans-serif;letter-spacing:.08em;
        text-transform:uppercase;opacity:.65}
    .cf-date{opacity:.65;font-size:0.82rem}
    .cf-res{font-weight:900}
    .cf-res--w{color:#8ef0c4}
    .cf-res--l{color:#ffb3b3}
    .cf-form{margin-bottom:16px}
    .cf-pos{font-size:0.74rem;opacity:.55}
    .cf-filters{display:flex;flex-wrap:wrap;gap:7px;margin:0 0 12px}
    .cf-fbtn{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.13);
        color:inherit;border-radius:999px;padding:8px 14px;cursor:pointer;
        font:700 0.8rem/1 Inter,sans-serif;opacity:.82}
    .cf-fbtn:hover{opacity:1;border-color:rgba(255,201,60,.5)}
    .cf-fbtn.is-on{background:#FFC93C;color:#04101c;border-color:#FFC93C;opacity:1}
    .cf-sortbar{display:flex;align-items:center;gap:9px;flex-wrap:wrap;margin:0 0 14px;
        font-size:0.84rem}
    .cf-sortbar select{background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.16);
        color:inherit;border-radius:8px;padding:8px 11px;font:600 0.84rem/1 Inter,sans-serif}
    .cf-sortbar option{background:#0b1626;color:#f1f5f9}
    .cf-count{opacity:.6}
    .cf-boardwrap{overflow-x:auto;border:1px solid rgba(255,255,255,.11);border-radius:14px}
    .cf-board{min-width:660px;font-size:0.88rem}
    .cf-board thead th{position:sticky;top:0;background:#0d1a2b;text-align:left;
        font:800 0.74rem/1 Inter,sans-serif;letter-spacing:.09em;text-transform:uppercase;
        opacity:.85;padding:12px 14px;border-bottom:1px solid rgba(255,255,255,.14)}
    .cf-board td{padding:12px 14px;border-bottom:1px solid rgba(255,255,255,.07);
        vertical-align:middle}
    .cf-brow:hover{background:rgba(255,255,255,.04)}
    .cf-bteams{display:flex;align-items:center;gap:9px;flex-wrap:wrap;row-gap:5px;
        min-width:250px}
    .cf-bteam{display:flex;align-items:center;gap:7px}
    .cf-bteam img{width:26px;height:26px;object-fit:contain}
    .cf-bname{font-weight:700;white-space:nowrap}
    .cf-brk{font:900 0.74rem/1 "Barlow Condensed",Inter,sans-serif;color:#FFC93C;min-width:14px}
    .cf-bconf{font-size:0.74rem;opacity:.5;white-space:nowrap}
    .cf-bat{font-size:0.74rem;letter-spacing:.14em;text-transform:uppercase;opacity:.45}
    .cf-bwhen b{display:block;font-size:0.84rem;white-space:nowrap}
    .cf-bwhen i{display:block;font-style:normal;font-size:0.78rem;opacity:.62;white-space:nowrap}
    .cf-bnum{white-space:nowrap;font-variant-numeric:tabular-nums}
    .cf-mlbox{display:flex;flex-direction:column;justify-content:center;gap:3px;
        min-height:36px;font-variant-numeric:tabular-nums}
    .cf-mlbox>span{display:flex;gap:6px;white-space:nowrap}
    .cf-mlbox i{font-style:normal;opacity:.55;min-width:44px}
    .cf-priced{font-weight:800;color:#8ef0c4;text-transform:uppercase;letter-spacing:.06em;
        font-size:0.74rem}
    .cf-empty{opacity:.65;padding:16px 2px}
    @media (min-width:900px){
        .cf-pane.is-on{grid-template-columns:repeat(2,minmax(0,1fr))}
        .cf-panel--wide{grid-column:1/-1}
    }
    @media (max-width:620px){
        .cf-team img{width:36px;height:36px}
        .cf-barcell{display:none}
        .cf-cmp th[scope=row],.cf-stat th[scope=row]{font-size:0.8rem}
        .cf-stat th,.cf-stat td{padding:7px 5px}
    }
    </style>
"""

JS = """
    <script>
    (function(){
      document.querySelectorAll('.cf-tab').forEach(function(btn){
        btn.addEventListener('click',function(){
          var card=btn.closest('.cf-card');
          card.querySelectorAll('.cf-tab').forEach(function(b){b.classList.remove('is-on');});
          card.querySelectorAll('.cf-pane').forEach(function(p){p.classList.remove('is-on');});
          btn.classList.add('is-on');
          var pane=card.querySelector('[data-pane="'+btn.dataset.tab+'"]');
          if(pane){pane.classList.add('is-on');}
        });
      });
      var tbody=document.getElementById('cf-tbody');
      if(!tbody){return;}
      var rows=Array.prototype.slice.call(tbody.querySelectorAll('.cf-brow'));
      var count=document.getElementById('cf-count');
      var empty=document.getElementById('cf-empty');
      var sel=document.getElementById('cf-sort');
      var filter='all';
      function num(r,k){var v=r.dataset[k];return v===''?null:parseFloat(v);}
      function apply(){
        var shown=0;
        rows.forEach(function(r){
          var ok=filter==='all'||(' '+r.dataset.f+' ').indexOf(' '+filter+' ')>-1;
          r.hidden=!ok; if(ok){shown++;}
        });
        if(count){count.textContent=shown+(shown===1?' game':' games')+' shown';}
        if(empty){empty.hidden=shown>0;}
      }
      function sort(){
        var mode=sel?sel.value:'time';
        var sorted=rows.slice().sort(function(a,b){
          if(mode==='fav'){return (num(b,'sp')===null?-1:num(b,'sp'))-(num(a,'sp')===null?-1:num(a,'sp'));}
          if(mode==='close'){return (num(a,'sp')===null?999:num(a,'sp'))-(num(b,'sp')===null?999:num(b,'sp'));}
          if(mode==='high'){return (num(b,'tot')===null?-1:num(b,'tot'))-(num(a,'tot')===null?-1:num(a,'tot'));}
          if(mode==='low'){return (num(a,'tot')===null?999:num(a,'tot'))-(num(b,'tot')===null?999:num(b,'tot'));}
          if(mode==='rank'){var d=num(a,'rank')-num(b,'rank');if(d){return d;}}
          return a.dataset.t.localeCompare(b.dataset.t);
        });
        sorted.forEach(function(r){tbody.appendChild(r);});
      }
      document.querySelectorAll('.cf-fbtn').forEach(function(b){
        b.addEventListener('click',function(){
          document.querySelectorAll('.cf-fbtn').forEach(function(x){x.classList.remove('is-on');});
          b.classList.add('is-on'); filter=b.dataset.filter; apply();
        });
      });
      if(sel){sel.addEventListener('change',function(){sort();apply();});}
      apply();
    })();
    </script>
"""
