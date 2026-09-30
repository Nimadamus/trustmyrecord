#!/usr/bin/env python3
"""HTML for the NHL Featured Game: the game page, the archive, the homepage
module, the sitemap block and the NHL hub card slot. NHL_FEATURED_GAME_20260929,
page rebuilt NHL_FEATURED_REDESIGN_20260930.

The page shell and the section and comparison components come from the
Handicapping design system (scripts/handicap_ui.py, static/css/tmr-handicap.css)
so it reads as the same product as every matchup page. The featured game's own
pieces (the matchup hero with player photography, the odds board, key player
and goalie cards, the article woven between the data modules, the FAQ) live
here and in static/css/tmr-featured-game.css. Every component renders nothing
when its data is missing; nothing is estimated to fill a layout.
"""

import datetime as dt
import os

import featured_game_engine as fg
import handicap_ui as ui

SITE = fg.SITE
ARCHIVE = "/nhl/featured-games/"
SITEMAP_BEGIN = "BEGIN_NHL_FEATURED_URLS"
SITEMAP_END = "END_NHL_FEATURED_URLS"
HOME_MARKER = "homeNhlFeatured"
# Bump when the markup changes, so pages whose data did not move still re-render.
RENDER_VERSION = "2026-09-30.redesign"
OG_IMAGE = SITE + "/static/og/og-home.png"
esc = ui.esc

STATUS_LABEL = {"confirmed": "Confirmed starter", "expected": "Expected starter", "unknown": "Not yet announced"}
POS = {"C": "Center", "L": "Left wing", "R": "Right wing", "D": "Defense", "G": "Goalie"}
CANADA = {"AB", "BC", "MB", "ON", "QC"}
ODDS_FRESH_HOURS = 8


def _img(src, alt, w, h, cls="", eager=False, high=False):
    if not src:
        return ""
    return ('<img%s src="%s" alt="%s" width="%d" height="%d"%s decoding="async"%s>' % (
        (' class="%s"' % cls) if cls else "", esc(src), esc(alt), w, h,
        "" if eager else ' loading="lazy"', ' fetchpriority="high"' if high else ""))


def _lum(hexcolor):
    try:
        h = hexcolor.lstrip("#")
        r, g, b = (int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4))
    except (AttributeError, ValueError):
        return None
    lin = lambda c: c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)


def _accent(t):
    """The club colour the page is tinted with. A near black primary (the
    Penguins, the Bruins) disappears on the dark theme, so its secondary
    colour carries the accent instead."""
    main, alt = t.get("color"), t.get("alt_color")
    lm, la = _lum(main), _lum(alt)
    if lm is not None and lm < 0.03 and la is not None and la > lm:
        return alt
    return main or "#1D7FE8"


def _logo(t):
    li = t.get("logo_img") or {}
    return li.get("src") or t.get("logo")


def _pimg(p):
    return (p.get("img") or {}).get("src") or p.get("headshot")


def _venue_city(ctx):
    return ", ".join(b for b in (ctx.get("city"), ctx.get("region")) if b)


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
    return None


def _angle_tag(ctx):
    riv = ctx.get("rivalry") or ""
    if riv.startswith("the "):
        return riv[4:]
    a, h = ctx["away"], ctx["home"]
    if not a["record"]["gp"] and not h["record"]["gp"] and (a.get("rest") or {}).get("days") is None \
            and (h.get("rest") or {}).get("days") is None:
        return "Season opener"
    if ctx.get("division_game"):
        return "%s Division" % a["standing"]["division"]
    return None


# ================================================================== hero

def _records(ctx, t):
    """Every record in the hero names its season. Before a club has played
    ten games last season's record rides along, labeled as last season's."""
    rows = [("%s record" % ctx["season_label"], t["record"]["text"])]
    st = t.get("standing") or {}
    if t["record"]["gp"] >= 10:
        if st.get("division_rank") and st.get("division"):
            rows.append(("%s Division" % st["division"], fg.ordinal(st["division_rank"])))
        if st.get("points") is not None:
            rows.append(("Points", str(st["points"])))
    elif t.get("prev"):
        rows.append(("%s record" % t["prev"]["label"], t["prev"]["record"]["text"]))
    return '<dl class="fgh-recs">%s</dl>' % "".join(
        '<div><dt>%s</dt><dd>%s</dd></div>' % (esc(k), esc(v)) for k, v in rows)


def _hero_team(ctx, side):
    t = ctx[side]
    ps = [p for p in (ctx.get("key_players") or {}).get(side) or [] if _pimg(p)][:2]
    stars = ""
    if ps:
        imgs = "".join(_img(_pimg(p), "%s, %s" % (p["name"], t["name"]), 320, 320,
                            "fgh-star fgh-star--%d" % i, eager=True, high=(i == 1 and side == "away"))
                       for i, p in enumerate(ps, 1))
        stars = '<div class="fgh-stars fgh-stars--n%d">%s</div>' % (len(ps), imgs)
    names = ""
    if ps:
        names = '<p class="fgh-names">%s</p>' % " &middot; ".join(esc(p["name"]) for p in ps)
    place = t.get("place") or t["name"].replace(t["common"], "").strip()
    return ('<div class="fgh-team fgh-team--%s%s">%s<div class="fgh-id">%s'
            '<p class="fgh-place">%s</p><p class="fgh-nick">%s</p>%s%s</div></div>' % (
                side, "" if ps else " fgh-team--solo", stars,
                _img(_logo(t), "%s logo" % t["name"], 120, 120, "fgh-logo", eager=True),
                esc(place), esc(t["common"]), _records(ctx, t), names))


def _hero_mid(ctx):
    et = fg.parse_utc(ctx["start_utc"]).astimezone(fg.ET)
    facts = [("Date", "%s, %s %d, %d" % (et.strftime("%a"), et.strftime("%b"), et.day, et.year), None),
             ("Puck drop", "%s ET" % ctx["et_time"], "%s PT" % ctx["pt_time"])]
    if ctx.get("venue"):
        facts.append(("Venue", ctx["venue"], _venue_city(ctx) or None))
    if _network(ctx):
        facts.append(("National TV", _network(ctx), None))
    dl = "".join('<div><dt>%s</dt><dd>%s%s</dd></div>' % (esc(k), esc(v), ('<small>%s</small>' % esc(s)) if s else "")
                 for k, v, s in facts)
    return ('<div class="fgh-mid"><span class="fgh-at" aria-label="at">AT</span>'
            '<p class="fgh-feat">Featured game</p><dl class="fgh-facts">%s</dl></div>' % dl)


def odds_board(ctx):
    """Current prices as one aligned grid: every market card shares the same
    three columns (side, line, price), so names, numbers and prices sit on
    common baselines whatever their length."""
    o = ctx.get("odds") or {}
    pregame = ctx.get("state") in ("FUT", "PRE") and not ctx.get("final")
    lt = ctx.get("line_track") or {}
    closing = False
    if not o and not pregame and lt.get("last"):
        o, closing = lt["last"], True
    ml, pl, tot = o.get("ml") or {}, o.get("pl") or {}, o.get("total") or {}
    if not (ml or pl or tot):
        return ""
    a, h = ctx["away"], ctx["home"]

    def row(who, c1, c2, dot=None, cls=""):
        return ('<div class="fgo-row%s"><span class="fgo-who">%s%s</span><span class="fgo-n">%s</span>'
                '<span class="fgo-n fgo-px">%s</span></div>' % (
                    cls, ('<i class="fgo-dot fgo-dot--%s"></i>' % dot) if dot else "", esc(who), esc(c1), esc(c2)))

    def card(title, h1, h2, rows):
        return ('<div class="fgo-mk"><div class="fgo-row fgo-row--head"><span>%s</span><span>%s</span><span>%s</span></div>%s</div>'
                % (esc(title), esc(h1), esc(h2), "".join(rows)))

    cards = []
    if pl:
        cards.append(card("Puck line", "Line", "Price", [
            row(a["common"], "%+.1f" % float(pl["away"]["point"]), fg.american(pl["away"]["price"]), "away"),
            row(h["common"], "%+.1f" % float(pl["home"]["point"]), fg.american(pl["home"]["price"]), "home")]))
    if ml:
        ia, ih = fg.implied(ml.get("away")), fg.implied(ml.get("home"))
        s = (ia + ih) if ia and ih else None
        cards.append(card("Moneyline", "Price", "Win %", [
            row(a["common"], fg.american(ml.get("away")), ("%.1f%%" % (100 * ia / s)) if s else "", "away"),
            row(h["common"], fg.american(ml.get("home")), ("%.1f%%" % (100 * ih / s)) if s else "", "home")]))
    if tot.get("point") is not None:
        cards.append(card("Total", "Goals", "Price", [
            row("Over", "%s" % tot["point"], fg.american(tot.get("over"))),
            row("Under", "%s" % tot["point"], fg.american(tot.get("under")))]))
    stamp_at = fg.parse_utc(ctx.get("odds_checked")) if not closing else fg.parse_utc(o.get("at"))
    who = o.get("book")
    if closing:
        stamp = "Closing line on the TMR board%s%s" % (
            (" from %s" % who) if who else "", (", posted %s" % fg.pacific_stamp(stamp_at)) if stamp_at else "")
    else:
        stamp = "%s%s" % (("%s on the TMR board" % who) if who else "TMR board",
                          (". Updated %s" % fg.pacific_stamp(stamp_at)) if stamp_at else "")
    fresh = ""
    if pregame and stamp_at:
        start = fg.parse_utc(ctx["start_utc"])
        until = min(stamp_at + dt.timedelta(hours=ODDS_FRESH_HOURS), start) if start else stamp_at + dt.timedelta(hours=ODDS_FRESH_HOURS)
        fresh = ' data-fresh-until="%s"' % fg.iso(until)
    note = ("Win % is the moneyline's implied probability with the book's margin removed. Prices are checked every "
            "30 minutes; confirm with your book before you bet.") if ml and not closing else ""
    return ('            <section class="fgo" aria-labelledby="fgo-h"%s>\n'
            '                <div class="fgo-top"><h2 id="fgo-h" class="fgo-h">%s</h2><p class="fgo-stamp">%s</p></div>\n'
            '                <div class="fgo-grid fgo-grid--%d">%s</div>\n%s'
            '            </section>\n' % (fresh, "Closing odds" if closing else "Current odds", esc(stamp),
                                          len(cards), "".join(cards),
                                          ('                <p class="fgo-note">%s</p>\n' % esc(note)) if note else ""))


def hero(ctx):
    a, h = ctx["away"], ctx["home"]
    crumbs = [("Home", "/"), ("NHL Handicapping", "/handicapping/nhl/"), ("NHL Featured Games", ARCHIVE),
              ("%s at %s" % (a["common"], h["common"]), None)]
    crumb = ' <span aria-hidden="true">&rsaquo;</span> '.join(
        ('<a href="%s">%s</a>' % (esc(u), esc(n))) if u else '<span aria-current="page">%s</span>' % esc(n) for n, u in crumbs)
    tags = ['<span class="hx-kick">NHL Featured Game of the Day</span>']
    ang = _angle_tag(ctx)
    if ang:
        tags.append('<span class="hx-kick hx-kick--ghost">%s</span>' % esc(ang))
    st = _status_kicker(ctx)
    if st:
        tags.append('<span class="hx-kick hx-kick--ghost fgh-live">%s</span>' % esc(st))
    art = ctx["article"]
    mins = max(1, int(round(art["words"] / 230.0)))
    return (
        '        <header class="hx-hero fgh">\n'
        '            <div class="hx-hero-in">\n'
        '            <nav class="hx-crumb" aria-label="Breadcrumb">%s</nav>\n'
        '            <p class="fgh-tags">%s</p>\n'
        '            <div class="fgh-match">%s%s%s</div>\n'
        '            <h1 class="fgh-h1">%s</h1>\n'
        '            <p class="fgh-sub">%s</p>\n'
        '            <p class="fgh-byline">By TrustMyRecord NHL research &middot; Updated <time datetime="%s">%s</time> &middot; %d min read</p>\n'
        '%s'
        '            </div>\n'
        '        </header>\n' % (
            crumb, "".join(tags), _hero_team(ctx, "away"), _hero_mid(ctx), _hero_team(ctx, "home"),
            esc(art["headline"]), esc(art["description"]), esc(ctx["updated_iso"]), esc(ctx["updated_pt"]), mins,
            odds_board(ctx)))


# ================================================================== body pieces

def prose(ctx, key, lead_only=False):
    s = (ctx["article"]["sections"] or {}).get(key)
    if not s:
        return ""
    if s.get("list"):
        return '            <ol class="fg-keys">%s</ol>\n' % "".join(
            '<li>%s</li>' % _keyline(p) for p in s["paras"])
    return '            <div class="fg-prose">%s</div>\n' % "".join("<p>%s</p>" % esc(p) for p in s["paras"])


def _keyline(p):
    """'Special teams. The rest' -> bold lead then the sentence."""
    head, _, rest = p.partition(". ")
    if rest and len(head) <= 28:
        return "<b>%s.</b> %s" % (esc(head), esc(rest))
    return esc(p)


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


def why_section(ctx):
    sel = ctx.get("selection") or {}
    fs = sel.get("factors") or []
    chips = ""
    if fs:
        chips = '            <ul class="fg-why">%s</ul>\n' % "".join(
            '<li class="fg-why-chip"><b>%s</b><span>%s</span></li>' % (esc(f["label"]), esc(f["detail"])) for f in fs[:6])
    return ui.section("Why this is the featured game", prose(ctx, "why") + chips, eyebrow="Selection", anchor="why")


def breakdown_section(ctx, side):
    key = "team_%s" % side
    s = (ctx["article"]["sections"] or {}).get(key)
    if not s:
        return ""
    return ui.section(s["h2"], prose(ctx, key), eyebrow="Team breakdown", anchor="%s-breakdown" % side)


def _gstat(label, value):
    if value in (None, ""):
        return ""
    return '<div class="fg-gstat"><b>%s</b><span>%s</span></div>' % (esc(value), esc(label))


def _gline(line):
    return line and line.get("gp")


def _season_of(date):
    """NHL season label for a game date: August onward belongs to the season
    that starts that fall."""
    y, mo = int(date[:4]), int(date[5:7])
    start = y if mo >= 8 else y - 1
    return "%d-%02d" % (start, (start + 1) % 100)


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
            stats = '<p class="fg-glabel">%s%s</p><div class="fg-gstats">%s</div>' % (
                esc(lbl), " season (prior season)" if lbl != prof.get("current_label") else " season", stats)
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
            seasons = sorted({_season_of(r.get("date")) for r in rec if r.get("date")})
            recent = '<p class="fg-glabel">Last %d appearances (%s)</p><ul class="fg-grecent">%s</ul>' % (
                len(rec), esc(" and ".join(seasons) + (" season" if len(seasons) == 1 else " seasons")), cells)
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
        face = _img(_pimg(prof), name, 96, 96, "fg-gface") if _pimg(prof) else '<span class="fg-gface fg-gface--mono"></span>'
        return ('<article class="fg-goalie fg-goalie--%s"><div class="fg-gtop">%s<div><p class="fg-gteam">%s</p>'
                '<h3 class="fg-gname">%s</h3>%s</div></div>%s%s%s%s</article>' % (
                    t["_side"], face, esc(t["name"]), esc(name), badge, stats, recent,
                    ('<ul class="fg-gextra">%s</ul>' % extras) if extras else "", src))
    # Not announced: say so, and show the club's goalies without naming a starter.
    rows = []
    for p in gl.get("roster") or []:
        line = p.get("current") if _gline(p.get("current")) else p.get("last_season")
        lbl = p.get("current_label") if _gline(p.get("current")) else p.get("last_label")
        face = _img(_pimg(p), p["name"], 44, 44, "fg-gmug") if _pimg(p) else ""
        if _gline(line):
            rows.append("<li>%s<div><b>%s</b><span>%s: %s, %s save %%, %s GAA in %d games</span></div></li>" % (
                face, esc(p["name"]), esc(lbl), esc(line["record"]), esc(fg.svpct(line["sv"])), esc(fg.num(line["gaa"])),
                line["gp"]))
        else:
            rows.append("<li>%s<div><b>%s</b></div></li>" % (face, esc(p["name"])))
    body = ('<p class="fg-glabel">Goalies on the roster</p><ul class="fg-groster">%s</ul>' % "".join(rows)) if rows else ""
    mark = (_img(_logo(t), "%s logo" % t["name"], 96, 96, "fg-gface fg-gface--logo") if _logo(t)
            else '<span class="fg-gface fg-gface--mono"></span>')
    return ('<article class="fg-goalie fg-goalie--%s fg-goalie--tbd"><div class="fg-gtop">%s'
            '<div><p class="fg-gteam">%s</p><h3 class="fg-gname">Starting goalie</h3>%s</div></div>%s</article>'
            % (t["_side"], mark, esc(t["name"]), badge, body))


def goalies_section(ctx):
    gl = ctx.get("goalies") or {}
    if not gl:
        return ""
    a, h = dict(ctx["away"], _side="away"), dict(ctx["home"], _side="home")
    body = '            <div class="fg-goalies">%s%s</div>\n' % (goalie_card(a, gl.get("away") or {}, h),
                                                                  goalie_card(h, gl.get("home") or {}, a))
    return ui.section("Goaltender matchup", prose(ctx, "goalies") + body, eyebrow="In goal", anchor="goalies",
                      note="Starter status comes from Daily Faceoff's reports: Confirmed when the club or a beat "
                           "reporter has confirmed it, Expected when reported as likely. Checked every 30 minutes.")


def _pstat(label, value):
    if value in (None, ""):
        return ""
    return '<div class="fg-pstat"><b>%s</b><span>%s</span></div>' % (esc(value), esc(label))


def player_card(ctx, side, p):
    t = ctx[side]
    ln = p.get("season") or {}
    stats = ""
    if ln.get("gp"):
        stats = "".join((_pstat("GP", ln["gp"]), _pstat("G", ln.get("g")), _pstat("A", ln.get("a")),
                         _pstat("PTS", ln.get("pts")),
                         _pstat("PPP", ln.get("ppp")) if ln.get("ppp") is not None else _pstat("PPG", ln.get("ppg")),
                         _pstat("SH%", fg.pct(ln.get("shpct")) if ln.get("shpct") is not None else None)))
        stats = '<p class="fg-glabel">%s regular season</p><div class="fg-pstats">%s</div>' % (
            esc(p.get("season_label") or ""), stats)
    cur = p.get("current") or {}
    if cur.get("gp") and p.get("current_label") != p.get("season_label"):
        stats += '<p class="fg-gmini">%s so far: %d GP, %d G, %d A, %d PTS</p>' % (
            esc(p["current_label"]), cur["gp"], cur.get("g") or 0, cur.get("a") or 0, cur.get("pts") or 0)
    rows = [r for r in p.get("last5") or [] if r.get("date")]
    last = ""
    if rows:
        cells = "".join('<li title="%s: %d G, %d A"><b>%d</b><span>%s%s</span></li>' % (
            esc(r["date"]), r.get("g") or 0, r.get("a") or 0, r.get("pts") or 0,
            "vs " if r.get("ha") == "H" else "@", esc(r.get("opp") or "")) for r in rows)
        po = [r for r in rows if r.get("playoff")]
        when = (" (%s playoffs)" % rows[0]["date"][:4]) if len(po) == len(rows) else (" (incl. playoffs)" if po else "")
        last = '<p class="fg-glabel">Points, last %d games%s</p><ul class="fg-plast">%s</ul>' % (len(rows), when, cells)
    car = p.get("career") or {}
    career = ('<p class="fg-gsrc">Career: %s GP, %s G, %s A, %s PTS</p>' % (
        "{:,}".format(car["gp"]), "{:,}".format(car.get("g") or 0), "{:,}".format(car.get("a") or 0),
        "{:,}".format(car.get("pts") or 0))) if car.get("gp") else ""
    face = _img(_pimg(p), "%s, %s" % (p["name"], t["name"]), 96, 96, "fg-gface") if _pimg(p) else ""
    meta = " &middot; ".join(esc(x) for x in (POS.get(p.get("pos"), ""), ("No. %s" % p["num"]) if p.get("num") else "") if x)
    return ('<article class="fg-player fg-goalie--%s"><div class="fg-gtop">%s<div><p class="fg-gteam">%s</p>'
            '<h3 class="fg-gname">%s</h3><p class="fg-pmeta">%s</p></div></div>%s%s%s</article>' % (
                side, face, esc(t["name"]), esc(p["name"]), meta, stats, last, career))


def players_section(ctx):
    kp = ctx.get("key_players") or {}
    cards = [player_card(ctx, side, p) for side in ("away", "home") for p in kp.get(side) or []]
    body = prose(ctx, "players")
    if cards:
        body += '            <div class="fg-players">%s</div>\n' % "".join(cards)
    if not body:
        return ""
    return ui.section("Key players to watch", body, eyebrow="Stars", anchor="players",
                      note="Each club's top two scorers who are on its current roster. Source: NHL.com player and "
                           "game center stats." if cards else None)


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


def _rank_labels(rows, ra, rh, keys):
    for r in rows:
        key = keys.get(r["label"])
        if key and ra.get("rank", {}).get(key) and rh.get("rank", {}).get(key):
            r["label"] = "%s (%s / %s in NHL)" % (r["label"], fg.ordinal(ra["rank"][key]), fg.ordinal(rh["rank"][key]))


def _prior_labels(s, rows):
    if not s.get("current"):
        yr = s["label"].replace(" regular season", "")
        for r in rows:
            r["label"] = "%s %s" % (yr, r["label"][0].lower() + r["label"][1:])


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
    elif a.get("prev") and h.get("prev"):
        pa, ph = a["prev"], h["prev"]
        rows.append({"label": "%s record" % pa["label"], "away": pa["record"]["text"], "home": ph["record"]["text"],
                     "away_cmp": pa["record"]["pts"], "home_cmp": ph["record"]["pts"],
                     "gap": "%d pts" % abs(pa["record"]["pts"] - ph["record"]["pts"])})
        rows.append({"label": "%s road record (%s) / home record (%s)" % (pa["label"], a["common"], h["common"]),
                     "away": pa["road"]["text"], "home": ph["home"]["text"],
                     "away_cmp": pa["road"]["pts"], "home_cmp": ph["home"]["pts"]})
    if rows:
        out += ui.compare(uictx, rows, note="Regular season, from the league's own results.")
    if s:
        ra, rh = s["away"], s["home"]
        n2 = lambda v: fg.num(v, 2)
        n1 = lambda v: fg.num(v, 1)
        p1 = lambda v: fg.pct(v)
        srows = [r for r in (
            _row("Points percentage", ra, rh, "ptpct", "ptpct", lambda v: ("%.3f" % v).lstrip("0")),
            _row("Goals per game", ra, rh, "gfpg", "gfpg", n2),
            _row("Goals allowed per game", ra, rh, "gapg", "gapg", n2, False),
            _row("Shots per game", ra, rh, "sfpg", "sfpg", n1),
            _row("Shots allowed per game", ra, rh, "sapg", "sapg", n1, False),
            _row("Shooting percentage", ra, rh, "shpct", "shpct", p1),
            _row("Save percentage", ra, rh, "svpct", "svpct", fg.svpct),
            _row("Power play", ra, rh, "pp", "pp", p1),
            _row("Power play chances per game", ra, rh, "ppo", "ppo", n2),
            _row("Penalty kill", ra, rh, "pk", "pk", p1),
            _row("Times shorthanded per game", ra, rh, "tsh", "tsh", n2, False),
            _row("Faceoffs won", ra, rh, "fo", "fo", p1),
            _row("Goal differential per game", ra, rh, "gdpg", "gdpg", lambda v: "%+.2f" % v),
            _row("Shot differential per game", ra, rh, "sdpg", "sdpg", lambda v: "%+.1f" % v),
        ) if r]
        _rank_labels(srows, ra, rh, {"Goals per game": "gfpg", "Goals allowed per game": "gapg", "Power play": "pp",
                                     "Penalty kill": "pk", "Save percentage": "svpct", "Shooting percentage": "shpct",
                                     "Shots per game": "sfpg", "Shots allowed per game": "sapg", "Faceoffs won": "fo",
                                     "Power play chances per game": "ppo", "Times shorthanded per game": "tsh"})
        _prior_labels(s, srows)
        if not s.get("current"):
            out += '            <h3 class="fg-h3">%s season rates (prior season)</h3>\n' % esc(s["label"].replace(" regular season", ""))
        out += ui.compare(uictx, srows, note="%s, all situations. League ranks out of 32. Source: NHL.com team stats%s." % (
            s["label"], ", through %d games" % min(ra["gp"], rh["gp"]) if s.get("current") else ""))
    if not out:
        return ""
    lede = None
    if s and not s.get("current"):
        lede = ("Early in the season a handful of games says very little, so the rate stats below are each club's "
                "full %s." % s["label"])
    return ui.section("Team comparison", out, eyebrow="By the numbers", lede=lede, anchor="stats")


def advanced_section(ctx):
    s = ctx.get("stats") or {}
    body = prose(ctx, "advanced")
    if s:
        a, h = ctx["away"], ctx["home"]
        uictx = {"away": {"name": a["name"], "short": a["common"]}, "home": {"name": h["name"], "short": h["common"]}}
        ra, rh = s["away"], s["home"]
        p1 = lambda v: fg.pct(v)
        n1 = lambda v: fg.num(v, 1)
        rows = [r for r in (
            _row("Shot attempt share, Corsi", ra, rh, "cf", "cf", p1),
            _row("Unblocked attempt share, Fenwick", ra, rh, "ff", "ff", p1),
            _row("Shot attempt share, score close", ra, rh, "cf_close", "cf_close", p1),
            _row("Goal share", ra, rh, "gf5", "gf5", p1),
            _row("PDO", ra, rh, "pdo", "pdo", lambda v: fg.num(v, 3)),
            _row("Shooting percentage", ra, rh, "sh5", "sh5", p1),
            _row("Save percentage", ra, rh, "sv5", "sv5", fg.svpct),
            _row("Offensive zone start share", ra, rh, "zs", "zs", p1),
            _row("Hits per 60", ra, rh, "hits60", "hits60", n1),
            _row("Blocked shots per 60", ra, rh, "blk60", "blk60", n1),
            _row("Takeaways per 60", ra, rh, "tk60", "tk60", n1),
            _row("Giveaways per 60", ra, rh, "gv60", "gv60", n1, False),
        ) if r]
        _rank_labels(rows, ra, rh, {"Shot attempt share, Corsi": "cf", "Unblocked attempt share, Fenwick": "ff",
                                    "Shot attempt share, score close": "cf_close", "Goal share": "gf5",
                                    "Shooting percentage": "sh5", "Save percentage": "sv5",
                                    "Takeaways per 60": "tk60", "Giveaways per 60": "gv60"})
        _prior_labels(s, rows)
        if rows:
            body += ui.compare(uictx, rows, note="%s. Shares, PDO, shooting, saves and zone starts are five on five; "
                                                 "hits, blocks, takeaways and giveaways are per 60 minutes. League ranks "
                                                 "out of 32. Source: NHL.com team stats." % s["label"])
    if not body:
        return ""
    return ui.section("Advanced stats", body, eyebrow="Five on five", anchor="advanced")


def _seq(games):
    return "".join({"W": "W", "L": "L", "OTL": "O"}[g["res"]] for g in games)


def form_section(ctx):
    rows, cards = [], []
    pre = not ctx["away"]["record"]["gp"] and not ctx["home"]["record"]["gp"]
    for t in (ctx["away"], ctx["home"]):
        pv = t.get("prev") or {}
        src = pv if (not t["record"]["gp"] and pv) else t
        tags = []
        lbl = (" of %s" % pv["label"]) if src is pv else ""
        if src.get("last10") and src["last10"]["gp"]:
            tags.append(("last %d%s" % (src["last10"]["gp"], lbl), src["last10"]["text"]))
        if src.get("last5") and src["last5"]["gp"]:
            tags.append(("last %d%s" % (src["last5"]["gp"], lbl), src["last5"]["text"]))
        if src.get("streak"):
            tags.append(("streak" + (" to end %s" % pv["label"] if src is pv else ""), src["streak"]["text"],
                         "hot" if src["streak"]["kind"] == "W" else "cold"))
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
        if not t["record"]["gp"] and pv:
            tags.append(("%s at home" % pv["label"], pv["home"]["text"]))
            tags.append(("%s on the road" % pv["label"], pv["road"]["text"]))
        if src.get("last5") and src["last5"]["gp"]:
            tags.append(("goals for / against, last %d%s" % (src["last5"]["gp"], lbl),
                         "%.1f / %.1f" % (src["last5"]["gf"] / float(src["last5"]["gp"]), src["last5"]["ga"] / float(src["last5"]["gp"]))))
        rows.append({"name": t["name"], "seq": _seq(src.get("games10") or []), "tags": tags})
        g5 = list(reversed(src.get("games5") or []))
        if g5:
            li = "".join('<li class="fg-res fg-res--%s"><span>%s</span><b>%s</b><em>%s %s</em><i>%d-%d%s</i></li>' % (
                g["res"].lower(), esc((g["date"] or "")[5:].replace("-", "/")), esc(g["res"]),
                "vs" if g["home"] else "@", esc(g["opp"]), g["gf"], g["ga"],
                {"OT": " OT", "SO": " SO"}.get(g.get("ended"), "")) for g in g5)
            cards.append('<div class="fg-rescard"><h3 class="fg-glabel">%s, %s</h3><ul>%s</ul></div>' % (
                esc(t["common"]), "final five games of %s" % pv["label"] if src is pv else "most recent first", li))
    body = prose(ctx, "form") + ui.form_block(rows) + (
        ('            <div class="fg-rescards">%s</div>\n' % "".join(cards)) if cards else "")
    return ui.section("Recent form", body, eyebrow=("End of %s" % ctx["prev_label"]) if pre else "%s season" % ctx["season_label"],
                      anchor="form")


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
    body = prose(ctx, "h2h") + tiles + '            <ul class="fg-h2h">%s</ul>\n' % "".join(cards)
    return ui.section("Head to head", body, eyebrow="Last %d meetings" % len(hh), anchor="h2h",
                      note="Regular season and playoff meetings since %s only, so the sample reflects rosters close to "
                           "these ones." % hh[-1]["season"])


def betting_section(ctx):
    o = ctx.get("odds") or {}
    lt = ctx.get("line_track") or {}
    a, h = ctx["away"], ctx["home"]
    body = prose(ctx, "market")
    rows = []

    def mlv(s, side):
        return fg.american(((s or {}).get("ml") or {}).get(side))

    def plv(s, side):
        p = ((s or {}).get("pl") or {}).get(side)
        return ("%+.1f  %s" % (float(p["point"]), fg.american(p["price"]))) if p else ""

    def totv(s, k):
        t = (s or {}).get("total") or {}
        return ("%s  %s" % (t["point"], fg.american(t.get(k)))) if t else ""

    cur = {"ml": o.get("ml"), "pl": o.get("pl"), "total": o.get("total")} if o else (lt.get("last") or {})
    first = lt.get("first")
    for label, fn in (("%s moneyline" % a["common"], lambda s: mlv(s, "away")),
                      ("%s moneyline" % h["common"], lambda s: mlv(s, "home")),
                      ("%s puck line" % a["common"], lambda s: plv(s, "away")),
                      ("%s puck line" % h["common"], lambda s: plv(s, "home")),
                      ("Over", lambda s: totv(s, "over")), ("Under", lambda s: totv(s, "under"))):
        now_v = fn(cur)
        open_v = fn(first) if first else ""
        if not now_v and not open_v:
            continue
        moved = open_v and now_v and open_v != now_v
        rows.append('<tr><th scope="row">%s</th><td>%s</td><td%s>%s</td></tr>' % (
            esc(label), esc(open_v or "n/a"), ' class="fgm-moved"' if moved else "", esc(now_v or "n/a")))
    if rows:
        cur_word = "Closing" if ctx.get("final") or ctx.get("state") in ("LIVE", "CRIT") else "Current"
        body += ('            <div class="fgm-wrap"><table class="fgm"><caption class="fg-glabel">Opening versus %s on the TMR '
                 'board</caption><thead><tr><th scope="col">Market</th><th scope="col">First posted</th><th scope="col">%s</th>'
                 '</tr></thead><tbody>%s</tbody></table></div>\n'
                 % (cur_word.lower(), cur_word, "".join(rows)))
        if any("fgm-moved" in r for r in rows):
            body += '            <p class="hx-note">Prices in gold have moved since the board first posted them.</p>\n'
    moves = lt.get("moves") or []
    if len(moves) >= 2:
        steps = []
        for mv in moves[-6:]:
            at = fg.parse_utc(mv["at"])
            steps.append("<li><span>%s</span><b>%s %s</b><em>Total %s</em></li>" % (
                esc(fg.clock(at.astimezone(fg.PT)) + " PT " + at.astimezone(fg.PT).strftime("%b %d")),
                esc(h["abbr"]), esc(mlv(mv, "home")), esc(((mv.get("total") or {}).get("point")) or "")))
        body += '            <p class="fg-glabel">Line history on the TMR board</p><ul class="fg-moves">%s</ul>\n' % "".join(steps)
    if not body:
        return ""
    note = []
    if first:
        note.append("First posted is the first price the TMR board carried for this game, at %s." % fg.pacific_stamp(fg.parse_utc(first["at"])))
    if o.get("book"):
        note.append("Book: %s." % o["book"])
    body += ('            <p class="fg-cta-row"><a class="fg-btn" href="/sportsbook/">Make your NHL pick on the TMR '
             'sportsbook</a><a class="fg-btn fg-btn--ghost" href="/picks/">See the public ledger</a></p>\n')
    return ui.section("The betting market", body, eyebrow="Moneyline, puck line, total", anchor="odds", note=" ".join(note))


def trends_section(ctx):
    tr = ctx.get("trends") or []
    if not tr:
        return ""
    li = "".join('<li><span class="fg-trend-tag">%s</span><p>%s</p></li>' % (esc(t["tag"]), esc(t["text"])) for t in tr)
    return ui.section("Betting trends", prose(ctx, "trends") + '            <ul class="fg-trends">%s</ul>\n' % li,
                      eyebrow="Calculated, not curated", anchor="trends")


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
        cols.append('<div class="fg-inj"><h3 class="fg-glabel">%s</h3><ul>%s</ul></div>' % (esc(ctx[side]["name"]), li))
    if not cols:
        return ""
    return ui.section("Injury report", '            <div class="fg-injs">%s</div>\n' % "".join(cols), eyebrow="Availability",
                      anchor="injuries", note="Source: ESPN NHL injury report, refreshed every 30 minutes.")


def keys_section(ctx):
    body = prose(ctx, "keys")
    return ui.section("Matchup keys", body, eyebrow="What decides it", anchor="keys") if body else ""


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
    prior = m.get("stats_season") and m["stats_season"] != ctx["season_label"]
    wp_note = "%s simulations of this exact game by the TMR NHL simulator (%s)%s" + (
        ", with team ratings built from %s stats (prior season)." % m["stats_season"] if prior else ".")
    wp_note = wp_note % (
        "{:,}".format(m.get("sims") or 10000), m.get("version") or "",
        (", with %s in goal" % " and ".join(v for v in (named.get("away"), named.get("home")) if v)) if named else "")
    panel = ui.model_panel(uictx, {"away_score": fg.num(m["score"]["away"], 1), "home_score": fg.num(m["score"]["home"], 1),
                                   "away_wp": m["win"]["away"], "home_wp": m["win"]["home"], "wp_note": wp_note,
                                   "cells": cells})
    drivers = m.get("drivers") or []
    if drivers:
        panel += '            <ul class="fg-drivers">%s</ul>\n' % "".join(
            '<li><b>%s</b><span>%s</span></li>' % (esc(d.get("label")), esc(d.get("detail"))) for d in drivers if d.get("detail"))
    panel += prose(ctx, "model")
    panel += '            <p class="fg-cta-row"><a class="fg-btn fg-btn--ghost" href="/nhl-simulator/">Run it yourself in the NHL simulator</a></p>\n'
    return ui.section("TMR model projection and lean", panel, eyebrow="Prediction", anchor="model",
                      note="A projection from the model, not a pick and not betting advice.")


def faq_section(ctx):
    qa = ctx["article"].get("faq") or []
    if not qa:
        return ""
    body = '            <div class="fg-faq">%s</div>\n' % "".join(
        '<div class="fg-faq-i"><h3>%s</h3><p>%s</p></div>' % (esc(q), esc(a)) for q, a in qa)
    return ui.section("Frequently asked questions", body, eyebrow="FAQ", anchor="faq")


def preview_section(ctx):
    art = ctx["article"]
    body = prose(ctx, "intro")
    if not body:
        return ""
    return ui.section("Game preview", body, eyebrow="%s words" % "{:,}".format(art["words"]), anchor="preview")


def links_section(root, ctx):
    a, h = ctx["away"], ctx["home"]
    items = []
    for t in (a, h):
        if os.path.exists(os.path.join(root, "nhl-simulator", "teams", t["slug"], "index.html")):
            items.append(("%s season projection" % t["name"], "/nhl-simulator/teams/%s/" % t["slug"], None))
    for x, y in ((a, h), (h, a)):
        slug = "%s-vs-%s" % (fg.slugify(x["common"]), fg.slugify(y["common"]))
        if os.path.exists(os.path.join(root, "nhl-simulator", slug, "index.html")):
            items.append(("%s vs %s rivalry simulator" % (x["common"], y["common"]), "/nhl-simulator/%s/" % slug, None))
            break
    research = ctx.get("research_page")
    if research:
        items.append(("Full handicapping page for this game", research, None))
    for o in ctx.get("others") or []:
        items.append((o["headline"], o["url"], None))
    items += [("NHL handicapping hub: every game today", "/handicapping/nhl/", None),
              ("Every NHL Featured Game", ARCHIVE, None),
              ("NHL simulator", "/nhl-simulator/", None),
              ("NHL season simulator and standings projection", "/nhl-season-simulator/", None),
              ("NHL pick tracker", "/nhl-pick-tracker/", None),
              ("Make NHL picks on the TMR sportsbook", "/sportsbook/", None),
              ("Find verified handicappers", "/handicappers/", None),
              ("BetLegend Pro research", "/betlegend-pro/", None)]
    return ui.section("Keep going", ui.links(items), eyebrow="More NHL on TrustMyRecord", anchor="more")


def sources_block(ctx):
    names = []
    s = ctx.get("sources") or {}
    has = lambda p: any(k.startswith(p) for k in s)
    if has("schedule") or has("standings"):
        names.append("NHL.com (schedule, standings, results, rosters, team, player and goalie stats)")
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


# ================================================================== head

def og_image(ctx):
    og = ctx.get("og")
    if og:
        return SITE + og[0], tuple(og[1])
    return OG_IMAGE, None


def ld_graph(ctx):
    a, h = ctx["away"], ctx["home"]
    url = SITE + ctx["url"]
    art = ctx["article"]
    img, _ = og_image(ctx)
    org_id = SITE + "/#organization"
    org = {"@type": "Organization", "@id": org_id, "name": "TrustMyRecord", "url": SITE + "/",
           "logo": {"@type": "ImageObject", "url": SITE + "/static/favicon.png"}}
    status = "https://schema.org/EventScheduled"
    if ctx.get("schedule_state") == "PPD":
        status = "https://schema.org/EventPostponed"
    elif ctx.get("schedule_state") == "CNCL":
        status = "https://schema.org/EventCancelled"
    addr = {"@type": "PostalAddress", "addressLocality": ctx.get("city") or "",
            "addressRegion": ctx.get("region") or ""}
    if ctx.get("region"):
        addr["addressCountry"] = "CA" if ctx["region"] in CANADA else "US"
    place = {"@type": "Place", "name": ctx.get("venue") or "", "address": addr}

    def team(t):
        out = {"@type": "SportsTeam", "name": t["name"], "sport": "Ice Hockey"}
        if t.get("logo"):
            out["logo"] = t["logo"]
        return out

    event = {"@type": "SportsEvent", "@id": url + "#event", "name": "%s at %s" % (a["name"], h["name"]),
             "sport": "Ice Hockey", "startDate": ctx["start_utc"],
             "eventStatus": status, "eventAttendanceMode": "https://schema.org/OfflineEventAttendanceMode",
             "location": place, "url": url, "image": [img],
             "description": "%s at %s, NHL %s regular season game at %s." % (
                 a["name"], h["name"], ctx["season_label"], ctx.get("venue") or "the home arena"),
             "organizer": {"@type": "SportsOrganization", "name": "National Hockey League", "url": "https://www.nhl.com/"},
             "homeTeam": team(h), "awayTeam": team(a),
             "competitor": [team(a), team(h)]}
    event = {k: v for k, v in event.items() if v is not None}
    page = {"@type": "WebPage", "@id": url, "url": url, "name": "%s | TrustMyRecord" % art["title"],
            "description": art["description"], "inLanguage": "en-US",
            "isPartOf": {"@type": "WebSite", "@id": SITE + "/#website", "name": "TrustMyRecord", "url": SITE + "/"},
            "breadcrumb": {"@id": url + "#breadcrumb"}, "about": {"@id": url + "#event"},
            "primaryImageOfPage": {"@type": "ImageObject", "url": img},
            "datePublished": ctx["published_iso"], "dateModified": ctx["updated_iso"]}
    article = {"@type": "Article", "@id": url + "#article", "headline": art["headline"][:110],
               "description": art["description"], "url": url, "mainEntityOfPage": {"@id": url}, "image": [img],
               "datePublished": ctx["published_iso"], "dateModified": ctx["updated_iso"],
               "author": {"@id": org_id}, "publisher": {"@id": org_id}, "about": {"@id": url + "#event"},
               "articleSection": "NHL", "wordCount": art["words"], "inLanguage": "en-US",
               "keywords": ", ".join(("%s vs. %s %s" % (a["common"], h["common"], k)).strip() for k in
                                     ("prediction", "odds", "preview", "stats", "betting trends"))}
    crumbs = fg.breadcrumb_ld([("Home", "/"), ("NHL Handicapping", "/handicapping/nhl/"), ("NHL Featured Games", ARCHIVE),
                               ("%s at %s" % (a["common"], h["common"]), ctx["url"])])
    crumbs["@id"] = url + "#breadcrumb"
    graph = [page, article, event, crumbs, org]
    qa = art.get("faq") or []
    if qa:
        graph.append({"@type": "FAQPage", "@id": url + "#faq", "mainEntity": [
            {"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": ans}} for q, ans in qa]})
    return graph


FRESH_JS = ('<script>(function(){var e=document.querySelector("[data-fresh-until]");'
            'if(e&&Date.now()>Date.parse(e.getAttribute("data-fresh-until")))e.hidden=true;})();</script>\n')


def jump_nav(parts):
    """Only anchors whose section rendered."""
    have = "".join(parts)
    links = [(a, t) for a, t in (("preview", "Preview"), ("away-breakdown", "Breakdown"), ("players", "Key players"),
                                 ("goalies", "Goalies"), ("stats", "Team stats"), ("advanced", "Advanced"),
                                 ("form", "Form"), ("h2h", "Head to head"), ("odds", "Odds"), ("trends", "Trends"),
                                 ("model", "Model"), ("faq", "FAQ"))
             if ('id="%s"' % a) in have]
    return ('        <nav class="fg-jump" aria-label="On this page">%s</nav>\n'
            % "".join('<a href="#%s">%s</a>' % (a, esc(t)) for a, t in links))


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
    img, size = og_image(ctx)
    head = fg.head(root, "%s | TrustMyRecord" % art["title"], art["description"], SITE + ctx["url"], img,
                   ld_graph(ctx), extra_meta=extra,
                   css=("static/css/tmr-handicap.css", "static/css/tmr-featured-game.css"),
                   published=ctx["published_iso"], modified=ctx["updated_iso"],
                   og_alt="%s at %s, NHL Featured Game preview, %s" % (a["name"], h["name"], ctx["date_text"]),
                   og_size=size)
    body_ctx = {"away": {"color": _accent(a)}, "home": {"color": _accent(h)}}
    sections = [preview_section(ctx), why_section(ctx), breakdown_section(ctx, "away"), breakdown_section(ctx, "home"),
                comparison(ctx), players_section(ctx), goalies_section(ctx), advanced_section(ctx), form_section(ctx),
                h2h_section(ctx), injuries_section(ctx), betting_section(ctx), trends_section(ctx), keys_section(ctx),
                model_section(ctx), faq_section(ctx), links_section(root, ctx)]
    parts = [head, ui.body_open(body_ctx, "hx-matchup fg-page", ' data-sport="nhl" data-featured-game="%s"' % esc(ctx["id"])),
             hero(ctx),
             '    <main class="hx-wrap">\n',
             result_banner(ctx), jump_nav(sections),
             '        <article class="fg-story" aria-label="%s">\n' % esc(art["headline"])] + sections + [
             '        </article>\n', sources_block(ctx),
             '    </main>\n', FRESH_JS, fg.foot(root)]
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
