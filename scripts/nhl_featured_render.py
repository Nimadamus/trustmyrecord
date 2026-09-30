#!/usr/bin/env python3
"""HTML for the NHL Featured Game: the game page, the archive, the homepage
module, the sitemap block and the NHL hub card slot. NHL_FEATURED_GAME_20260929.

The page is built from the Handicapping design system (scripts/handicap_ui.py
and static/css/tmr-handicap.css) so it reads as the same product as every
matchup page, plus static/css/tmr-featured-game.css for the pieces only a
featured game has: the goalie cards, the article, the head to head cards and
the update stamp. Every component renders nothing when its data is missing.
"""

import datetime as dt
import html
import os

import featured_game_engine as fg
import handicap_ui as ui

SITE = fg.SITE
ARCHIVE = "/nhl/featured-games/"
SITEMAP_BEGIN = "BEGIN_NHL_FEATURED_URLS"
SITEMAP_END = "END_NHL_FEATURED_URLS"
HOME_MARKER = "homeNhlFeatured"
OG_IMAGE = SITE + "/static/og/og-home.png"
esc = ui.esc

STATUS_LABEL = {"confirmed": "Confirmed starter", "expected": "Expected starter", "unknown": "Not yet announced"}


def _venue_line(ctx):
    bits = [b for b in (ctx.get("venue"), ctx.get("city")) if b]
    line = ", ".join(bits)
    if ctx.get("region"):
        line += ", %s" % ctx["region"]
    return line


def _network(ctx):
    nets = []
    for b in ctx.get("tv") or []:
        if b.get("market") == "N" and b.get("net") and b["net"] not in nets:
            nets.append(b["net"])
    return ", ".join(nets[:4])


def _status_kicker(ctx):
    if ctx.get("final"):
        return "Final"
    if ctx.get("state") in ("LIVE", "CRIT"):
        return "Live now"
    if ctx.get("schedule_state") in ("PPD", "CNCL"):
        return "Postponed"
    return ctx["long_date"]


def _markets(ctx):
    o = ctx.get("odds") or {}
    a, h = ctx["away"], ctx["home"]
    ml, pl, tot = o.get("ml") or {}, o.get("pl") or {}, o.get("total") or {}
    m = {"any": bool(ml or pl or tot)}
    if pl:
        m["spread"] = {"rows": [(a["common"], "%+.1f" % float(pl["away"]["point"]), fg.american(pl["away"]["price"])),
                                (h["common"], "%+.1f" % float(pl["home"]["point"]), fg.american(pl["home"]["price"]))]}
    if ml:
        ia, ih = fg.implied(ml.get("away")), fg.implied(ml.get("home"))
        s = (ia + ih) if ia and ih else None
        m["moneyline"] = {"rows": [
            (a["common"], fg.american(ml.get("away")), ("%.0f%% to win" % (100 * ia / s)) if s else ""),
            (h["common"], fg.american(ml.get("home")), ("%.0f%% to win" % (100 * ih / s)) if s else "")]}
    if tot:
        m["total"] = {"point": tot.get("point"), "price": fg.american(tot.get("over")),
                      "sub": "Over %s" % fg.american(tot.get("over")), "sub2": "Under %s" % fg.american(tot.get("under"))}
    if o.get("book"):
        m["book_note"] = ("Prices from %s on the TMR board, checked every 30 minutes. Lines move, so check the book "
                          "before you act on any number here." % o["book"])
    return m


def _sub(t):
    st = t.get("standing") or {}
    bits = []
    if not (st.get("gp") or 0):
        prev = t.get("prev")
        return ("%s: %s" % (prev["label"], prev["record"]["text"])) if prev else ""
    if st.get("division_rank") and st.get("division"):
        bits.append("%s %s" % (fg.ordinal(st["division_rank"]), st["division"]))
    if st.get("points") is not None and (st.get("gp") or 0) > 0:
        bits.append("%d pts" % st["points"])
    return " · ".join(bits)


def hero(ctx):
    a, h = ctx["away"], ctx["home"]
    uictx = {
        "away": {"name": a["name"], "logo": a["logo"], "record": a["record"]["text"], "sub": _sub(a),
                 "color": a["color"], "short": a["common"], "abbr": a["abbr"]},
        "home": {"name": h["name"], "logo": h["logo"], "record": h["record"]["text"], "sub": _sub(h),
                 "color": h["color"], "short": h["common"], "abbr": h["abbr"]},
        "crumbs": [("Home", "/"), ("NHL Handicapping", "/handicapping/nhl/"), ("NHL Featured Games", ARCHIVE),
                   ("%s at %s" % (a["common"], h["common"]), None)],
        "label": "NHL Featured Game of the Day", "kicker2": _status_kicker(ctx),
        "headline": ctx["article"]["headline"],
        "standfirst": "%s at %s, %s. Last updated: %s" % (a["name"], h["name"], ctx["date_text"], ctx["updated_pt"]),
        "date_long": ctx["long_date"], "time_et": "%s ET · %s PT" % (ctx["et_time"], ctx["pt_time"]),
        "venue_line": _venue_line(ctx), "network": _network(ctx), "markets": _markets(ctx),
    }
    out = ui.hero(uictx)
    # The shared board prints a sentence when no price is posted. On this page
    # the betting module is simply omitted instead.
    out = out.replace('<p class="hx-mk-l">Spread</p>', '<p class="hx-mk-l">Puck line</p>')
    return out.replace('            <p class="hx-mk-book">The sportsbook feed is not carrying a price '
                       'on this game yet.</p>\n', "")


def result_banner(ctx):
    f = ctx.get("final")
    if not f:
        return ""
    a, h = ctx["away"], ctx["home"]
    win = a if f["away"] > f["home"] else h
    tail = {"OT": " in overtime", "SO": " in a shootout"}.get(f.get("ended"), "")
    lt = ctx.get("line_track") or {}
    close = []
    last = lt.get("last") or {}
    tot = (last.get("total") or {}).get("point")
    if tot is not None:
        goals = f["away"] + f["home"]
        close.append("%d goals against a closing total of %s on the TMR board: %s" % (
            goals, tot, "over" if goals > tot else "under" if goals < tot else "push"))
    return ('        <div class="fg-final"><span class="fg-final-k">Final</span>'
            '<p><b>%s %d, %s %d</b>%s. The %s win.%s</p></div>\n' % (
                esc(a["common"]), f["away"], esc(h["common"]), f["home"], esc(tail), esc(win["common"]),
                (" " + esc(close[0]) + ".") if close else ""))


def why_chips(ctx):
    sel = ctx.get("selection") or {}
    fs = sel.get("factors") or []
    if not fs:
        return ""
    chips = "".join('<li class="fg-why-chip" title="%s"><b>%s</b><span>%s</span></li>'
                    % (esc(f["detail"]), esc(f["label"]), esc(f["detail"])) for f in fs[:6])
    n = len(sel.get("board") or [])
    still = " still to be played" if n < (sel.get("slate_games") or n) else ""
    note = ("Chosen from %d games%s on the %s slate by the TMR featured game score (%.1f)." % (n, still, ctx["date_text"], sel.get("score") or 0)
            if n > 1 else "The only game on the %s schedule." % ctx["date_text"])
    return ui.section("Why it's the featured game", '            <ul class="fg-why">%s</ul>\n' % chips,
                      eyebrow="Selection", note=note, anchor="why")


def _gstat(label, value):
    if value in (None, ""):
        return ""
    return '<div class="fg-gstat"><b>%s</b><span>%s</span></div>' % (esc(value), esc(label))


def _gline(line):
    return line and line.get("gp")


def goalie_card(t, gl, opp):
    status = gl.get("status") or "unknown"
    prof = gl.get("profile") or {}
    badge = '<span class="fg-gbadge fg-gbadge--%s">%s</span>' % (status, esc(STATUS_LABEL[status]))
    if status in ("confirmed", "expected") and (prof or gl.get("name")):
        name = prof.get("name") or gl.get("name")
        cur, last = prof.get("current"), prof.get("last_season")
        use, lbl = (cur, prof.get("current_label")) if _gline(cur) and cur["gp"] >= 3 else (last, prof.get("last_label"))
        stats = ""
        if _gline(use):
            stats = "".join((_gstat("Record", use["record"]), _gstat("Save %", fg.svpct(use["sv"])),
                             _gstat("GAA", fg.num(use["gaa"])), _gstat("Shutouts", use["so"]),
                             _gstat("Games", use["gp"])))
            stats = '<p class="fg-glabel">%s</p><div class="fg-gstats">%s</div>' % (esc(lbl), stats)
        if _gline(cur) and cur["gp"] < 3:
            stats += '<p class="fg-gmini">%s so far: %s, %s save %%, %s GAA in %d %s.</p>' % (
                esc(prof.get("current_label")), esc(cur["record"]), esc(fg.svpct(cur["sv"])), esc(fg.num(cur["gaa"])),
                cur["gp"], "game" if cur["gp"] == 1 else "games")
        rec = prof.get("recent") or []
        recent = ""
        if rec:
            cells = "".join('<li><span>%s</span><b>%s</b><em>%s %s</em><i>%s</i></li>' % (
                esc(r["date"][5:].replace("-", "/") if r.get("date") else ""), esc({"O": "OTL"}.get(r["dec"], r["dec"])),
                "vs" if r.get("ha") == "H" else "@", esc(r["opp"]),
                esc("%s SV%%" % fg.svpct(r["sv"]) if r.get("sv") is not None else "")) for r in rec)
            recent = '<p class="fg-glabel">Last %d appearances</p><ul class="fg-grecent">%s</ul>' % (len(rec), cells)
        extra = []
        split = prof.get("road") if t["_side"] == "away" else prof.get("home")
        if _gline(split) and split["gp"] >= 3:
            extra.append("%s %s: %s, %s save %%, %s GAA (%d games)" % (
                "On the road" if t["_side"] == "away" else "At home", prof.get("split_label"), split["record"],
                fg.svpct(split["sv"]), fg.num(split["gaa"]), split["gp"]))
        vs = prof.get("vs")
        if _gline(vs):
            extra.append("Against %s, %s: %s, %s save %%, %s GAA (%d games)" % (
                opp["common"], prof.get("vs_span"), vs["record"], fg.svpct(vs["sv"]), fg.num(vs["gaa"]), vs["gp"]))
        car = prof.get("career")
        if car and car.get("gp"):
            extra.append("Career: %s games, %s, %s save %%, %s GAA, %s shutouts" % (
                car["gp"], car["record"], fg.svpct(car["sv"]), fg.num(car["gaa"]), car["so"]))
        extras = "".join("<li>%s</li>" % esc(e) for e in extra)
        src = ""
        if gl.get("source"):
            at = fg.parse_utc(gl.get("reported_at"))
            src = '<p class="fg-gsrc">%s%s</p>' % (esc(gl["source"]), (", reported %s" % esc(fg.pacific_stamp(at))) if at else "")
        face = ('<img class="fg-gface" src="%s" alt="%s" width="96" height="96" loading="lazy" decoding="async">'
                % (esc(prof["headshot"]), esc(name))) if prof.get("headshot") else '<span class="fg-gface fg-gface--mono"></span>'
        return ('<article class="fg-goalie fg-goalie--%s"><div class="fg-gtop">%s<div><p class="fg-gteam">%s</p>'
                '<p class="fg-gname">%s</p>%s</div></div>%s%s%s%s</article>' % (
                    t["_side"], face, esc(t["name"]), esc(name), badge, stats, recent,
                    ('<ul class="fg-gextra">%s</ul>' % extras) if extras else "", src))
    # Not announced: say so, and show the club's goalies without naming a starter.
    rows = []
    for p in gl.get("roster") or []:
        line = p.get("current") if _gline(p.get("current")) else p.get("last_season")
        lbl = p.get("current_label") if _gline(p.get("current")) else p.get("last_label")
        if _gline(line):
            rows.append("<li><b>%s</b><span>%s: %s, %s save %%, %s GAA in %d games</span></li>" % (
                esc(p["name"]), esc(lbl), esc(line["record"]), esc(fg.svpct(line["sv"])), esc(fg.num(line["gaa"])), line["gp"]))
        else:
            rows.append("<li><b>%s</b></li>" % esc(p["name"]))
    body = ('<p class="fg-glabel">Goalies on the roster</p><ul class="fg-groster">%s</ul>' % "".join(rows)) if rows else ""
    return ('<article class="fg-goalie fg-goalie--%s fg-goalie--tbd"><div class="fg-gtop"><span class="fg-gface fg-gface--mono">'
            '</span><div><p class="fg-gteam">%s</p><p class="fg-gname">Starter not announced</p>%s</div></div>%s</article>'
            % (t["_side"], esc(t["name"]), badge, body))


def goalies_section(ctx):
    gl = ctx.get("goalies") or {}
    if not gl:
        return ""
    a, h = dict(ctx["away"], _side="away"), dict(ctx["home"], _side="home")
    body = '            <div class="fg-goalies">%s%s</div>\n' % (goalie_card(a, gl.get("away") or {}, h),
                                                                  goalie_card(h, gl.get("home") or {}, a))
    return ui.section("Starting goaltenders", body, eyebrow="In goal", anchor="goalies",
                      note="Starter status comes from Daily Faceoff's reports: Confirmed when the club or a beat "
                           "reporter has confirmed it, Expected when reported as likely. Checked every 30 minutes.")


def _row(label, a, h, ka, kh, fmt, higher=True):
    va, vh = (a or {}).get(ka), (h or {}).get(kh)
    if va is None or vh is None:
        return None
    return {"label": label, "away": fmt(va), "home": fmt(vh), "away_cmp": va, "home_cmp": vh, "higher": higher,
            "gap": _gap(va, vh, fmt)}


def _gap(va, vh, fmt):
    d = abs(va - vh)
    out = fmt(d) if fmt not in (fg.svpct,) else ("%.0f pts" % (d * 1000))
    return out.replace("+", "")


def comparison(ctx):
    s = ctx.get("stats") or {}
    a, h = ctx["away"], ctx["home"]
    uictx = {"away": {"name": a["name"], "short": a["common"]}, "home": {"name": h["name"], "short": h["common"]}}
    out = ""
    rows = []
    if a["record"]["gp"] or h["record"]["gp"]:
        rows.append({"label": "Record %s" % ctx["season_label"], "away": a["record"]["text"], "home": h["record"]["text"],
                     "away_cmp": a["record"]["pts"], "home_cmp": h["record"]["pts"],
                     "gap": "%d pts" % abs(a["record"]["pts"] - h["record"]["pts"])})
        rows.append({"label": "Away record (%s) / home record (%s)" % (a["common"], h["common"]),
                     "away": a["road_rec"]["text"], "home": h["home_rec"]["text"],
                     "away_cmp": a["road_rec"]["pts"], "home_cmp": h["home_rec"]["pts"]})
        rows.append({"label": "Goal differential", "away": "%+d" % (a["record"]["gf"] - a["record"]["ga"]),
                     "home": "%+d" % (h["record"]["gf"] - h["record"]["ga"]),
                     "away_cmp": a["record"]["gf"] - a["record"]["ga"], "home_cmp": h["record"]["gf"] - h["record"]["ga"]})
    if rows:
        out += ui.compare(uictx, rows, note="%s regular season, from the league's own results." % ctx["season_label"])
    if s:
        ra, rh = s["away"], s["home"]
        n3 = lambda v: fg.num(v, 2)
        n1 = lambda v: fg.num(v, 1)
        p1 = lambda v: fg.pct(v)
        sg = lambda v: "%+.2f" % v
        srows = [r for r in (
            _row("Points percentage", ra, rh, "ptpct", "ptpct", lambda v: ("%.3f" % v).lstrip("0")),
            _row("Goals per game", ra, rh, "gfpg", "gfpg", n3),
            _row("Goals allowed per game", ra, rh, "gapg", "gapg", n3, False),
            _row("Shots per game", ra, rh, "sfpg", "sfpg", n1),
            _row("Shots allowed per game", ra, rh, "sapg", "sapg", n1, False),
            _row("Shooting percentage", ra, rh, "shpct", "shpct", p1),
            _row("Save percentage", ra, rh, "svpct", "svpct", fg.svpct),
            _row("Power play", ra, rh, "pp", "pp", p1),
            _row("Penalty kill", ra, rh, "pk", "pk", p1),
            _row("Faceoffs won", ra, rh, "fo", "fo", p1),
            _row("Goal differential per game", ra, rh, "gdpg", "gdpg", sg),
            _row("Shot differential per game", ra, rh, "sdpg", "sdpg", lambda v: "%+.1f" % v),
        ) if r]
        for r in srows:
            key = {"Goals per game": "gfpg", "Goals allowed per game": "gapg", "Power play": "pp", "Penalty kill": "pk",
                   "Save percentage": "svpct", "Shooting percentage": "shpct", "Shots per game": "sfpg",
                   "Shots allowed per game": "sapg", "Faceoffs won": "fo"}.get(r["label"])
            if key and ra.get("rank", {}).get(key) and rh.get("rank", {}).get(key):
                r["label"] = "%s (%s / %s in NHL)" % (r["label"], fg.ordinal(ra["rank"][key]), fg.ordinal(rh["rank"][key]))
        out += ui.compare(uictx, srows, note="%s, all situations. League ranks out of 32. Source: NHL.com team stats%s." % (
            s["label"], ", through %d games" % min(ra["gp"], rh["gp"]) if s.get("current") else ""))
    adv = ctx.get("adv") or {}
    if adv:
        xa, xh = adv["away"], adv["home"]
        arows = [r for r in (
            _row("Expected goals for per game", xa, xh, "xgf", "xgf", lambda v: fg.num(v, 2)),
            _row("Expected goals against per game", xa, xh, "xga", "xga", lambda v: fg.num(v, 2), False),
            _row("Expected goals share", xa, xh, "xgpct", "xgpct", fg.pct),
            _row("High danger shots for per game", xa, xh, "hdf", "hdf", lambda v: fg.num(v, 1)),
            _row("High danger shots against per game", xa, xh, "hda", "hda", lambda v: fg.num(v, 1), False),
            _row("5 on 5 shot attempt share", xa, xh, "cf5", "cf5", fg.pct),
            _row("5 on 5 expected goals share", xa, xh, "xgpct5", "xgpct5", fg.pct),
            _row("5 on 5 goals for per game", xa, xh, "gf5", "gf5", lambda v: fg.num(v, 2)),
            _row("5 on 5 goals against per game", xa, xh, "ga5", "ga5", lambda v: fg.num(v, 2), False),
        ) if r]
        out += ('            <h3 class="fg-h3">Advanced and 5 on 5</h3>\n' +
                ui.compare(uictx, arows, note="%s. Expected goals and high danger shots from MoneyPuck.com." % adv["label"]))
    if not out:
        return ""
    lede = None
    if s and not s.get("current"):
        lede = ("Early in the season a handful of games says very little, so the rate stats below are each club's "
                "full %s. This season's record and results are shown with it." % s["label"])
    return ui.section("Team comparison", out, eyebrow="By the numbers", lede=lede, anchor="stats")


def _seq(games):
    return "".join({"W": "W", "L": "L", "OTL": "O"}[g["res"]] for g in games)


def form_section(ctx):
    rows, cards = [], []
    for t in (ctx["away"], ctx["home"]):
        tags = []
        if t.get("last10") and t["last10"]["gp"]:
            tags.append(("last %d" % t["last10"]["gp"], t["last10"]["text"]))
        if t.get("last5") and t["last5"]["gp"]:
            tags.append(("last %d" % t["last5"]["gp"], t["last5"]["text"]))
        if t.get("streak"):
            tags.append(("streak", t["streak"]["text"], "hot" if t["streak"]["kind"] == "W" else "cold"))
        if t["home_rec"]["gp"]:
            tags.append(("at home", t["home_rec"]["text"]))
        if t["road_rec"]["gp"]:
            tags.append(("on the road", t["road_rec"]["text"]))
        r = t.get("rest") or {}
        if r.get("b2b"):
            tags.append(("tonight", "Back to back", "cold"))
        elif r.get("days") is not None:
            tags.append(("rest", "%d %s" % (r["days"], "day" if r["days"] == 1 else "days")))
        else:
            tags.append(("tonight", "Season opener"))
        if not t["record"]["gp"] and t.get("prev"):
            pv = t["prev"]
            tags.append(("%s record" % pv["label"], pv["record"]["text"]))
            tags.append(("%s at home" % pv["label"], pv["home"]["text"]))
            tags.append(("%s on the road" % pv["label"], pv["road"]["text"]))
        if t.get("last5") and t["last5"]["gp"]:
            tags.append(("goals for / against, last %d" % t["last5"]["gp"],
                         "%.1f / %.1f" % (t["last5"]["gf"] / float(t["last5"]["gp"]), t["last5"]["ga"] / float(t["last5"]["gp"]))))
        rows.append({"name": t["name"], "seq": _seq(t.get("games10") or []), "tags": tags})
        g5 = list(reversed(t.get("games5") or []))
        if g5:
            li = "".join('<li class="fg-res fg-res--%s"><span>%s</span><b>%s</b><em>%s %s</em><i>%d-%d%s</i></li>' % (
                g["res"].lower(), esc((g["date"] or "")[5:].replace("-", "/")), esc({"OTL": "OTL"}.get(g["res"], g["res"])),
                "vs" if g["home"] else "@", esc(g["opp"]), g["gf"], g["ga"],
                {"OT": " OT", "SO": " SO"}.get(g.get("ended"), "")) for g in g5)
            cards.append('<div class="fg-rescard"><p class="fg-glabel">%s, most recent first</p><ul>%s</ul></div>' % (esc(t["common"]), li))
    body = ui.form_block(rows) + (('            <div class="fg-rescards">%s</div>\n' % "".join(cards)) if cards else "")
    return ui.section("Form and schedule", body, eyebrow="%s season" % ctx["season_label"], anchor="form")


def h2h_section(ctx):
    hh = ctx.get("h2h") or []
    if not hh:
        return ""
    a, h = ctx["away"], ctx["home"]
    cards = []
    for r in hh:
        win_a = r["winner"] == a["abbr"]
        at = "%s at %s" % (r["away_abbr"], r["home_abbr"])
        cards.append('<li class="fg-h2h-card"><span class="fg-h2h-d">%s%s</span><span class="fg-h2h-m">%s</span>'
                     '<b class="fg-h2h-s"><em class="%s">%s %d</em> <em class="%s">%s %d</em>%s</b></li>' % (
                         esc(dt.date.fromisoformat(r["date"]).strftime("%b %d, %Y")),
                         " · Playoffs" if r.get("playoff") else "", esc(at),
                         "w" if win_a else "", esc(a["abbr"]), r["a_goals"], "" if win_a else "w", esc(h["abbr"]), r["h_goals"],
                         {"OT": " <small>OT</small>", "SO": " <small>SO</small>"}.get(r.get("ended"), "")))
    wins = sum(1 for r in hh if r["winner"] == a["abbr"])
    ga = sum(r["a_goals"] for r in hh)
    gh = sum(r["h_goals"] for r in hh)
    tiles = ui.trend_cards([
        {"value": "%d-%d" % (wins, len(hh) - wins), "label": "%s in these meetings" % a["common"]},
        {"value": "%d-%d" % (ga, gh), "label": "Goals, %s to %s" % (a["abbr"], h["abbr"])},
        {"value": fg.num((ga + gh) / float(len(hh)), 1), "label": "Total goals per game"},
        {"value": str(sum(1 for r in hh if abs(r["a_goals"] - r["h_goals"]) == 1)), "label": "One goal games"},
    ])
    body = tiles + '            <ul class="fg-h2h">%s</ul>\n' % "".join(cards)
    return ui.section("Head to head", body, eyebrow="Last %d meetings" % len(hh), anchor="h2h",
                      note="Regular season and playoff meetings since %s only, so the sample reflects rosters close to "
                           "these ones." % hh[-1]["season"])


def betting_section(ctx):
    o = ctx.get("odds") or {}
    lt = ctx.get("line_track") or {}
    a, h = ctx["away"], ctx["home"]
    if not (o.get("ml") or o.get("total") or lt.get("first")):
        return ""
    rows = []

    def mlv(s, side):
        return fg.american(((s or {}).get("ml") or {}).get(side))

    def plv(s, side):
        p = ((s or {}).get("pl") or {}).get(side)
        return ("%+.1f (%s)" % (float(p["point"]), fg.american(p["price"]))) if p else ""

    def totv(s):
        t = (s or {}).get("total") or {}
        return ("%s (o %s / u %s)" % (t["point"], fg.american(t.get("over")), fg.american(t.get("under")))) if t else ""

    cur = {"ml": o.get("ml"), "pl": o.get("pl"), "total": o.get("total")} if o else (lt.get("last") or {})
    first = lt.get("first")
    for label, fn in (("%s moneyline" % a["common"], lambda s: mlv(s, "away")),
                      ("%s moneyline" % h["common"], lambda s: mlv(s, "home")),
                      ("%s puck line" % a["common"], lambda s: plv(s, "away")),
                      ("%s puck line" % h["common"], lambda s: plv(s, "home")),
                      ("Total", totv)):
        now_v = fn(cur)
        open_v = fn(first) if first else ""
        if not now_v and not open_v:
            continue
        rows.append((label, open_v, now_v))
    cur_word = "Final pregame" if ctx.get("final") else "Current"
    body = '            <div class="fg-odds">%s</div>\n' % "".join(
        '<div class="fg-odd"><p class="fg-odd-l">%s</p><div class="fg-odd-v">%s<span><em>%s</em><b>%s</b></span></div></div>' % (
            esc(lbl), ('<span><em>First posted</em><b>%s</b></span>' % esc(ov)) if ov else "", esc(cur_word), esc(nv or ""))
        for lbl, ov, nv in rows)
    moves = lt.get("moves") or []
    if len(moves) >= 2:
        steps = []
        for mv in moves[-6:]:
            at = fg.parse_utc(mv["at"])
            steps.append("<li><span>%s</span><b>%s %s</b><em>Total %s</em></li>" % (
                esc(fg.clock(at.astimezone(fg.PT)) + " PT " + at.astimezone(fg.PT).strftime("%b %d")),
                esc(h["abbr"]), esc(mlv(mv, "home")), esc(((mv.get("total") or {}).get("point")) or "")))
        body += '            <p class="fg-glabel">Line history on the TMR board</p><ul class="fg-moves">%s</ul>\n' % "".join(steps)
    note = []
    if first:
        note.append("First posted means the first price the TMR board carried for this game, at %s." % fg.pacific_stamp(fg.parse_utc(first["at"])))
    if o.get("book"):
        note.append("Book: %s." % o["book"])
    body += ('            <p class="fg-cta-row"><a class="fg-btn" href="/sportsbook/">Make your NHL pick on the TMR '
             'sportsbook</a><a class="fg-btn fg-btn--ghost" href="/picks/">See the public ledger</a></p>\n')
    return ui.section("Betting information", body, eyebrow="Moneyline, puck line, total", anchor="odds", note=" ".join(note))


def trends_section(ctx):
    tr = ctx.get("trends") or []
    if not tr:
        return ""
    li = "".join('<li><span class="fg-trend-tag">%s</span><p>%s</p></li>' % (esc(t["tag"]), esc(t["text"])) for t in tr)
    return ui.section("Key trends", '            <ul class="fg-trends">%s</ul>\n' % li, eyebrow="From the data on this page",
                      anchor="trends")


def injuries_section(ctx):
    inj = ctx.get("injuries") or {}
    cols = []
    for side in ("away", "home"):
        rows = inj.get(side) or []
        if not rows:
            continue
        li = "".join('<li><b>%s</b><span>%s%s</span><em>%s</em></li>' % (
            esc(r["name"]), esc(r.get("pos") or ""), (" · %s" % esc(r["type"])) if r.get("type") else "",
            esc(r.get("status") or "")) for r in rows[:10])
        cols.append('<div class="fg-inj"><p class="fg-glabel">%s</p><ul>%s</ul></div>' % (esc(ctx[side]["name"]), li))
    if not cols:
        return ""
    return ui.section("Injuries", '            <div class="fg-injs">%s</div>\n' % "".join(cols), eyebrow="League injury report",
                      anchor="injuries", note="Source: ESPN NHL injury report.")


def model_section(ctx):
    m = ctx.get("model") or {}
    if not m.get("win") or not m.get("score"):
        return ""
    a, h = ctx["away"], ctx["home"]
    uictx = {"away": {"abbr": a["abbr"], "short": a["common"], "name": a["name"]},
             "home": {"abbr": h["abbr"], "short": h["common"], "name": h["name"]}}
    cells = []
    tot = m.get("total") or {}
    if tot.get("p50") is not None:
        cells.append({"value": str(tot["p50"]), "label": "Median total goals"})
    if tot.get("mean") is not None:
        cells.append({"value": fg.num(tot["mean"], 2), "label": "Average total goals"})
    pl = m.get("puckline") or {}
    if pl.get("home_minus_1_5") is not None:
        cells.append({"value": fg.pct(pl["home_minus_1_5"]), "label": "%s wins by 2 or more" % h["abbr"]})
        cells.append({"value": fg.pct(pl["away_minus_1_5"]), "label": "%s wins by 2 or more" % a["abbr"]})
    if m.get("ot") is not None:
        cells.append({"value": fg.pct(m["ot"]), "label": "Games reaching overtime"})
    named = m.get("named_goalies") or {}
    wp_note = "%s simulations of this exact game by the TMR NHL simulator (%s)%s." % (
        "{:,}".format(m.get("sims") or 10000), m.get("version") or "",
        (", with %s in goal" % " and ".join(v for v in (named.get("away"), named.get("home")) if v)) if named else "")
    panel = ui.model_panel(uictx, {"away_score": fg.num(m["score"]["away"], 1), "home_score": fg.num(m["score"]["home"], 1),
                                   "away_wp": m["win"]["away"], "home_wp": m["win"]["home"], "wp_note": wp_note,
                                   "cells": cells})
    panel += '            <p class="fg-cta-row"><a class="fg-btn fg-btn--ghost" href="/nhl-simulator/">Run it yourself in the NHL simulator</a></p>\n'
    return ui.section("TMR model projection", panel, eyebrow="Prediction", anchor="model",
                      note="A projection from the model, not a pick and not betting advice.")


def article_section(ctx):
    art = ctx["article"]
    out = ['        <article class="fg-article" id="preview">\n',
           '            <p class="fg-article-k">The preview · %s words</p>\n' % "{:,}".format(art["words"])]
    for s in art["sections"]:
        out.append('            <h2>%s</h2>\n' % esc(s["h2"]))
        paras = s["paras"]
        if s.get("list") and len(paras) > 1:
            intro = paras[0] if s["h2"] == "Key trends" else ""
            items = paras[1:] if intro else paras
            if intro:
                out.append("            <p>%s</p>\n" % esc(intro))
            out.append("            <ul>%s</ul>\n" % "".join("<li>%s</li>" % esc(p) for p in items))
        else:
            out.extend("            <p>%s</p>\n" % esc(p) for p in paras)
    out.append('            <p class="fg-article-foot">Every figure in this preview comes from the data modules on '
               'this page. Last updated %s.</p>\n' % esc(ctx["updated_pt"]))
    out.append('        </article>\n')
    return "".join(out)


def links_section(root, ctx):
    a, h = ctx["away"], ctx["home"]
    items = []
    for t in (a, h):
        if os.path.exists(os.path.join(root, "nhl-simulator", "teams", t["slug"], "index.html")):
            items.append(("%s season projection" % t["name"], "/nhl-simulator/teams/%s/" % t["slug"], t["logo"]))
    for x, y in ((a, h), (h, a)):
        slug = "%s-vs-%s" % (fg.slugify(x["common"]), fg.slugify(y["common"]))
        if os.path.exists(os.path.join(root, "nhl-simulator", slug, "index.html")):
            items.append(("%s vs %s rivalry simulator" % (x["common"], y["common"]), "/nhl-simulator/%s/" % slug, None))
            break
    research = ctx.get("research_page")
    if research:
        items.append(("Full handicapping page for this game", research, None))
    items += [("NHL handicapping hub: every game today", "/handicapping/nhl/", None),
              ("Every NHL Featured Game", ARCHIVE, None),
              ("NHL simulator", "/nhl-simulator/", None),
              ("NHL season simulator and standings projection", "/nhl-season-simulator/", None),
              ("NHL playoff simulator", "/nhl-playoff-simulator/", None),
              ("NHL pick tracker", "/nhl-pick-tracker/", None),
              ("Make NHL picks on the TMR sportsbook", "/sportsbook/", None),
              ("Public ledger of every tracked pick", "/picks/", None),
              ("Find verified handicappers", "/handicappers/", None),
              ("BetLegend Pro research", "/betlegend-pro/", None),
              ("TMR Pro", "/premium/", None)]
    return ui.section("Keep going", ui.links(items), eyebrow="More NHL on TrustMyRecord", anchor="more")


def sources_block(ctx):
    names = []
    s = ctx.get("sources") or {}
    has = lambda p: any(k.startswith(p) for k in s)
    if has("schedule") or has("standings"):
        names.append("NHL.com (schedule, standings, results, team and goalie stats)")
    if has("moneypuck") and ctx.get("adv"):
        names.append("MoneyPuck.com (expected goals, high danger shots, 5 on 5)")
    if ctx.get("goalies") and any((ctx["goalies"].get(x) or {}).get("status") in ("confirmed", "expected") for x in ("away", "home")):
        names.append("Daily Faceoff (starting goalie reports)")
    if ctx.get("injuries"):
        names.append("ESPN (injury report)")
    if ctx.get("odds") or ctx.get("line_track"):
        names.append("the TMR sportsbook board (odds, with the book named)")
    if ctx.get("model"):
        names.append("the TMR NHL simulator")
    return ('        <p class="hx-foot">Data: %s. This page refreshes every 30 minutes. Last updated: %s.</p>\n'
            % (esc("; ".join(names)), esc(ctx["updated_pt"])))


def ld_graph(ctx):
    a, h = ctx["away"], ctx["home"]
    url = SITE + ctx["url"]
    org = {"@type": "Organization", "name": "TrustMyRecord", "url": SITE + "/",
           "logo": {"@type": "ImageObject", "url": SITE + "/static/favicon.png"}}
    status = "https://schema.org/EventScheduled"
    if ctx.get("schedule_state") == "PPD":
        status = "https://schema.org/EventPostponed"
    elif ctx.get("schedule_state") == "CNCL":
        status = "https://schema.org/EventCancelled"
    place = {"@type": "Place", "name": ctx.get("venue") or "",
             "address": {"@type": "PostalAddress", "addressLocality": ctx.get("city") or "",
                         "addressRegion": ctx.get("region") or ""}}
    event = {"@type": "SportsEvent", "name": "%s at %s" % (a["name"], h["name"]), "sport": "Ice Hockey",
             "startDate": ctx["start_utc"], "eventStatus": status,
             "eventAttendanceMode": "https://schema.org/OfflineEventAttendanceMode",
             "location": place, "url": url, "image": [a["logo"], h["logo"]],
             "description": "%s at %s, NHL regular season." % (a["name"], h["name"]),
             "organizer": {"@type": "SportsOrganization", "name": "National Hockey League", "url": "https://www.nhl.com/"},
             "homeTeam": {"@type": "SportsTeam", "name": h["name"], "sport": "Ice Hockey"},
             "awayTeam": {"@type": "SportsTeam", "name": a["name"], "sport": "Ice Hockey"},
             "competitor": [{"@type": "SportsTeam", "name": a["name"]}, {"@type": "SportsTeam", "name": h["name"]}]}
    article = {"@type": "Article", "headline": ctx["article"]["title"][:110], "description": ctx["article"]["description"],
               "url": url, "mainEntityOfPage": url, "image": OG_IMAGE, "datePublished": ctx["published_iso"],
               "dateModified": ctx["updated_iso"], "author": org, "publisher": org, "about": {"@id": url + "#event"},
               "articleSection": "NHL", "wordCount": ctx["article"]["words"], "inLanguage": "en-US"}
    event["@id"] = url + "#event"
    crumbs = fg.breadcrumb_ld([("Home", "/"), ("NHL Handicapping", "/handicapping/nhl/"), ("NHL Featured Games", ARCHIVE),
                               ("%s at %s" % (a["common"], h["common"]), ctx["url"])])
    return [article, crumbs, event]


def page(root, ctx):
    a, h = ctx["away"], ctx["home"]
    art = ctx["article"]
    extra = ('<meta name="tmr-featured" content="nhl">\n'
             '<meta name="tmr-featured-kickoff" content="%s">\n'
             '<meta name="tmr-featured-headline" content="%s">\n'
             '<meta name="tmr-featured-matchup" content="%s">\n'
             '<meta name="tmr-featured-when" content="%s">\n'
             '<meta name="tmr-featured-label" content="NHL Featured Game of the Day">\n'
             '<meta name="tmr-featured-cta" content="Read the featured game breakdown">\n'
             '<meta name="tmr-featured-away-logo" content="%s">\n'
             '<meta name="tmr-featured-home-logo" content="%s">\n'
             '<meta name="nhl-featured-game" content="nhl-featured-game:%s">\n') % (
        esc(ctx["start_utc"]), esc(art["headline"]), esc("%s at %s" % (a["name"], h["name"])),
        esc("%s, %s ET" % (ctx["long_date"], ctx["et_time"])), esc(a["logo"]), esc(h["logo"]), esc(ctx["id"]))
    head = fg.head(root, "%s | TrustMyRecord" % art["title"], art["description"], SITE + ctx["url"], OG_IMAGE,
                   ld_graph(ctx), extra_meta=extra,
                   css=("static/css/tmr-handicap.css", "static/css/tmr-featured-game.css"),
                   published=ctx["published_iso"], modified=ctx["updated_iso"])
    body_ctx = {"away": {"color": a["color"]}, "home": {"color": h["color"]}}
    parts = [head, ui.body_open(body_ctx, "hx-matchup fg-page", ' data-sport="nhl" data-featured-game="%s"' % esc(ctx["id"])),
             hero(ctx),
             '    <main class="hx-wrap">\n',
             result_banner(ctx),
             '        <nav class="fg-jump" aria-label="On this page"><a href="#goalies">Goalies</a><a href="#stats">Stats</a>'
             '<a href="#form">Form</a><a href="#h2h">Head to head</a><a href="#odds">Odds</a><a href="#trends">Trends</a>'
             '<a href="#model">Model</a><a href="#preview">Preview</a></nav>\n',
             why_chips(ctx), goalies_section(ctx), comparison(ctx), form_section(ctx), h2h_section(ctx),
             betting_section(ctx), trends_section(ctx), injuries_section(ctx), model_section(ctx),
             article_section(ctx), links_section(root, ctx), sources_block(ctx),
             '    </main>\n', fg.foot(root)]
    return "".join(parts)


# ================================================================== archive

def archive_page(root, state, current, now):
    games = sorted([dict(sg, id=gid) for gid, sg in state["games"].items() if not sg.get("withdrawn") and sg.get("title")],
                   key=lambda x: x.get("start") or "", reverse=True)
    cards = []
    for sg in games:
        f = sg.get("final")
        res = ("Final: %s %s, %s %s" % (sg["names"]["away_common"], f["away"], sg["names"]["home_common"], f["home"])
               if f else "%s, %s ET" % (sg.get("long_date"), sg.get("et_time")))
        cards.append(
            '<a class="fg-arc" href="/nhl/%s/"><span class="fg-arc-logos"><img src="%s" alt="" width="40" height="40" loading="lazy">'
            '<img src="%s" alt="" width="40" height="40" loading="lazy"></span><span class="fg-arc-body"><b>%s</b>'
            '<span>%s</span><em>%s</em></span></a>' % (
                esc(sg["slug"]), esc(sg["logos"]["away"]), esc(sg["logos"]["home"]), esc(sg["headline"]),
                esc("%s at %s · %s" % (sg["names"]["away"], sg["names"]["home"], sg.get("long_date") or "")), esc(res)))
    lead = ""
    if current:
        lead = ('<p class="hx-lede">Now featuring: <a href="/nhl/%s/">%s</a>, %s at %s ET.</p>'
                % (esc(current["slug"]), esc(current.get("headline") or current.get("matchup")),
                   esc(current.get("long_date") or ""), esc(current.get("et_time") or "")))
    title = "NHL Featured Game of the Day: Previews, Predictions and Trends"
    desc = ("Every NHL Featured Game of the Day on TrustMyRecord: the strongest matchup on each slate with goalies, "
            "advanced stats, odds, trends and a full preview.")
    url = SITE + ARCHIVE
    ld = [{"@type": "CollectionPage", "name": title, "description": desc, "url": url},
          fg.breadcrumb_ld([("Home", "/"), ("NHL Handicapping", "/handicapping/nhl/"), ("NHL Featured Games", ARCHIVE)]),
          {"@type": "ItemList", "itemListElement": [
              {"@type": "ListItem", "position": i, "url": SITE + "/nhl/%s/" % sg["slug"], "name": sg["headline"]}
              for i, sg in enumerate(games[:50], 1)]}]
    head = fg.head(root, "%s | TrustMyRecord" % title, desc, url, OG_IMAGE, ld, og_type="website",
                   css=("static/css/tmr-handicap.css", "static/css/tmr-featured-game.css"))
    return (head + '<body class="tmr-ds tmr-ds--dark tmr-site-shell hx-page hx-hub fg-page">\n'
            '    <main class="hx-wrap" style="padding-top:26px">\n'
            '        <nav class="hx-crumb" aria-label="Breadcrumb"><a href="/">Home</a> <span aria-hidden="true">&rsaquo;</span> '
            '<a href="/handicapping/nhl/">NHL Handicapping</a> <span aria-hidden="true">&rsaquo;</span> <span>NHL Featured Games</span></nav>\n'
            '        <div class="hx-sec-h" style="margin-top:10px"><h1 style="font-size:clamp(1.7rem,5vw,2.6rem)">NHL Featured Game of the Day</h1></div>\n'
            '        <p class="hx-lede">One game from every NHL slate, chosen by team quality, standings stakes, rivalries, '
            'star power, the goalie matchup, betting interest and national TV. Each one gets a full breakdown that '
            'stays up after the final horn.</p>\n        %s\n'
            '        <section class="hx-sec"><div class="hx-sec-h"><h2>Every featured game</h2><span class="hx-eyebrow">%d so far</span></div>'
            '<div class="fg-arcs">%s</div></section>\n'
            '        <section class="hx-sec"><div class="hx-sec-h"><h2>Elsewhere on TrustMyRecord</h2></div>%s</section>\n'
            '    </main>\n' % (lead, len(games), "".join(cards), ui.links([
                ("NHL handicapping hub", "/handicapping/nhl/", None), ("NHL simulator", "/nhl-simulator/", None),
                ("NHL season simulator", "/nhl-season-simulator/", None), ("Make picks", "/sportsbook/", None),
                ("Public ledger", "/picks/", None), ("Handicappers", "/handicappers/", None)])) + fg.foot(root))


# ================================================================== homepage module

HOME_CSS = (
    "<style>.nhlfg{margin-top:27px;background:linear-gradient(120deg,rgba(29,127,232,.16),rgba(8,25,43,.0) 60%),var(--panel,#0E1620);"
    "border:1px solid rgba(77,163,255,.38);border-radius:var(--r,15px);box-shadow:var(--sh);overflow:hidden}"
    ".nhlfg a.nhlfg-in{display:grid;grid-template-columns:1.2fr 1fr;gap:22px;padding:26px 30px;text-decoration:none;color:inherit}"
    ".nhlfg-k{display:inline-block;font:800 .7rem/1 'Barlow Condensed',Inter,sans-serif;letter-spacing:.18em;text-transform:uppercase;"
    "color:#04101c;background:#4DA3FF;padding:6px 10px;border-radius:5px}"
    ".nhlfg-teams{display:flex;align-items:center;gap:14px;margin:14px 0 6px}.nhlfg-teams img{width:54px;height:54px}"
    ".nhlfg-teams b{font:900 clamp(1.4rem,3.4vw,2rem)/1.05 'Barlow Condensed',Inter,sans-serif;text-transform:uppercase;color:#EAF2FA}"
    ".nhlfg-teams i{font-style:normal;color:#8FAECB;font-weight:800}"
    ".nhlfg-rec{margin:0;color:#C3D8EC;font-size:14px}.nhlfg-when{margin:6px 0 0;color:#8FAECB;font-size:14px}"
    ".nhlfg-side{display:flex;flex-direction:column;gap:10px;justify-content:center}"
    ".nhlfg-line{display:flex;gap:10px;flex-wrap:wrap}.nhlfg-line span{background:rgba(12,33,56,.9);border:1px solid rgba(174,198,220,.18);"
    "border-radius:9px;padding:8px 11px;font-size:13px;color:#C3D8EC}.nhlfg-line b{color:#EAF2FA;margin-left:4px}"
    ".nhlfg-trend{margin:0;color:#C3D8EC;font-size:14px;line-height:1.5}"
    ".nhlfg-cta{font-weight:800;color:#4DA3FF}.nhlfg a:hover .nhlfg-cta{text-decoration:underline}"
    "@media (max-width:820px){.nhlfg a.nhlfg-in{grid-template-columns:1fr;padding:20px}.nhlfg-teams img{width:44px;height:44px}}"
    "</style>")


def home_module(state, current, now, game_days):
    if not current:
        return ""
    sg = current
    today = (now.astimezone(fg.ET) - dt.timedelta(hours=5)).date().isoformat()
    head = "NHL Featured Game of the Day"
    if sg.get("date") and sg["date"] != today and not sg.get("final"):
        head = "Next NHL Featured Game"
    o = sg.get("odds") or {}
    ml, tot = o.get("ml") or {}, o.get("total") or {}
    line = []
    if ml:
        line.append('<span>%s<b>%s</b></span><span>%s<b>%s</b></span>' % (
            esc(sg["names"]["away_common"]), esc(fg.american(ml.get("away"))), esc(sg["names"]["home_common"]), esc(fg.american(ml.get("home")))))
    if tot:
        line.append('<span>Total<b>%s</b></span>' % esc(tot.get("point")))
    f = sg.get("final")
    when = ("Final: %s %s, %s %s" % (sg["names"]["away_common"], f["away"], sg["names"]["home_common"], f["home"]) if f
            else "%s · %s ET / %s PT" % (sg.get("long_date"), sg.get("et_time"), sg.get("pt_time")))
    return ('%s<section class="nhlfg" aria-label="NHL Featured Game of the Day"><a class="nhlfg-in" href="/nhl/%s/">'
            '<div><span class="nhlfg-k">%s</span><div class="nhlfg-teams"><img src="%s" alt="%s logo" width="54" height="54" loading="lazy">'
            '<b>%s <i>@</i> %s</b><img src="%s" alt="%s logo" width="54" height="54" loading="lazy"></div>'
            '<p class="nhlfg-rec">%s %s · %s %s</p><p class="nhlfg-when">%s</p></div>'
            '<div class="nhlfg-side">%s%s<span class="nhlfg-cta">Read the featured game analysis &rarr;</span></div></a></section>'
            % (HOME_CSS, esc(sg["slug"]), esc(head), esc(sg["logos"]["away"]), esc(sg["names"]["away"]),
               esc(sg["names"]["away_common"]), esc(sg["names"]["home_common"]), esc(sg["logos"]["home"]), esc(sg["names"]["home"]),
               esc(sg["names"]["away_common"]), esc(sg["records"]["away"]), esc(sg["names"]["home_common"]), esc(sg["records"]["home"]),
               esc(when), ('<div class="nhlfg-line">%s</div>' % "".join(line)) if line and not f else "",
               ('<p class="nhlfg-trend">%s</p>' % esc(sg["teaser"])) if sg.get("teaser") else ""))


def site_surfaces(root, state, current, now, game_days):
    """Archive, homepage module, sitemap block. Returns the paths changed."""
    changed = []
    p = os.path.join(root, ARCHIVE.strip("/").replace("/", os.sep), "index.html")
    if fg.write_text(p, archive_page(root, state, current, now)):
        changed.append(p)
    home = os.path.join(root, "index.html")
    try:
        with open(home, encoding="utf-8") as fh:
            text = fh.read()
        new = fg.replace_marker(text, HOME_MARKER, home_module(state, current, now, game_days))
        if new is not None and fg.write_text(home, new):
            changed.append(home)
    except OSError:
        pass
    urls = [(SITE + ARCHIVE, fg.iso(now)[:10])]
    for gid, sg in sorted(state["games"].items(), key=lambda kv: kv[1].get("start") or "", reverse=True):
        if sg.get("withdrawn") or not sg.get("title"):
            continue
        urls.append((SITE + "/nhl/%s/" % sg["slug"], (sg.get("updated") or sg.get("published") or fg.iso(now))[:10]))
    # The archive's lastmod follows its newest entry, not the clock, so an
    # unchanged sitemap is not rewritten every run.
    if len(urls) > 1:
        urls[0] = (urls[0][0], max(u[1] for u in urls[1:]))
    if fg.sync_sitemap(root, SITEMAP_BEGIN, SITEMAP_END, urls):
        changed.append(os.path.join(root, "sitemap.xml"))
    return changed
