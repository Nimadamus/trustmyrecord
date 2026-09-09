#!/usr/bin/env python3
"""The sport hub as a research room rather than a price table.

HUB_RESEARCH_20260909.

NFL, NBA and NHL were still shipping a bare <table> of moneylines while NCAAF,
Soccer and Tennis had each become a research page. Nima's rule is that no sport
regresses to a plain odds dump, so this renders the same component set the
matchup page uses, arranged for a slate: one card per game carrying the clubs'
own marks, their records, the full board and their current form, with the deep
research one click away.

WHERE THE CONTENT COMES FROM
Everything on a card is data the build already holds:
  the board    prices, kickoff, which club is favoured
  ESPN         club marks, colours, records, venue and broadcast
  the engine   current form, the streak, the head to head scoring and ATS split
No extra feed is opened for the hub. A sport whose feeds cannot fill a field
simply does not render that field, and a hub with no games says so in one line
rather than showing an empty table.

WHY IT IS A SEPARATE MODULE
build_sport_matchup_pages.py is edited by several sessions at once, and every
collision today has been in that one file. A new renderer of this size belongs
beside handicap_page.py, so the shared builder gains a call and nothing else.
"""

import datetime

import handicap_enrich as enrich
import handicap_page as hp
import handicap_ui as ui

esc = ui.esc

# The day filter. Written inline rather than added to a bundle because it is
# eleven lines, it has no dependencies, and a hub that needs a network round
# trip to filter its own slate is worse than one that does not.
# ET ROLLOVER, HUB_ET_ROLLOVER_20260909.
# A baked page cannot change its own mind about what day it is, and this hub
# bakes four times a day. Between the 22:40 bake and the 10:40 one it would sit
# there through the whole US overnight still leading with a game that has
# already kicked off. So the page decides "today" in the browser, in Eastern
# time, on every load: anything already under way drops out of the default view
# and the day filter opens on the real current date. The slate itself still
# comes from the bake; this only decides which of it you are looking at.
HUB_JS = (
    "(function(){"
    "var cards=document.querySelectorAll('.hx-gcard[data-day]'),"
    "btns=document.querySelectorAll('.hx-chipbtn[data-daypick]');"
    "function etDay(d){try{return new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',"
    "year:'numeric',month:'2-digit',day:'2-digit'}).format(d)}catch(e){"
    "return d.toISOString().slice(0,10)}}"
    "var today=etDay(new Date()),now=Date.now();"
    "function apply(v){Array.prototype.forEach.call(cards,function(el){"
    "var day=el.getAttribute('data-day'),k=el.getAttribute('data-kick'),"
    "started=k&&Date.parse(k)<now-10800000;"
    "el.hidden=(v==='live')?(started||(day&&day<today)):(v!=='all'&&day!==v)});"
    "Array.prototype.forEach.call(btns,function(x){"
    "x.setAttribute('aria-pressed',String(x.getAttribute('data-daypick')===v))});"
    "var vis=0;Array.prototype.forEach.call(cards,function(el){if(!el.hidden)vis++});"
    "var e=document.getElementById('hx-none');if(e)e.hidden=vis>0;}"
    "Array.prototype.forEach.call(btns,function(x){x.addEventListener('click',function(){"
    "apply(x.getAttribute('data-daypick'))})});"
    "var stamp=document.getElementById('hx-today');"
    "if(stamp){try{stamp.textContent=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',"
    "weekday:'long',month:'long',day:'numeric'}).format(new Date())}catch(e){}}"
    "var slate=document.querySelector('.hx-slate');"
    "Array.prototype.forEach.call(document.querySelectorAll('.hx-chipbtn[data-sort]'),"
    "function(b){b.addEventListener('click',function(){"
    "var k=b.getAttribute('data-sort');"
    "Array.prototype.forEach.call(document.querySelectorAll('.hx-chipbtn[data-sort]'),"
    "function(x){x.setAttribute('aria-pressed',String(x===b))});"
    "var arr=Array.prototype.slice.call(cards);"
    "arr.sort(function(p,q){"
    "if(k==='time'){return Date.parse(p.getAttribute('data-kick')||0)-"
    "Date.parse(q.getAttribute('data-kick')||0)}"
    "var a=parseFloat(p.getAttribute('data-'+k))||0,c=parseFloat(q.getAttribute('data-'+k))||0;"
    "return c-a});"
    "arr.forEach(function(el){slate.appendChild(el)})})});"
    "apply('live');})();")


def _card_tags(hist, away, home, unit):
    """The few numbers worth putting on a slate card.

    Deliberately short. A card that tries to be the matchup page stops being
    scannable, and the matchup page is one click away."""
    tags = []
    if not hist:
        return tags
    for key, side in (("team_1_context", away), ("team_2_context", home)):
        c = hist.get(key) or {}
        streak = (c.get("current_streak") or "").strip()
        if streak:
            tone = ("hot" if streak.upper().startswith("W")
                    else "cold" if streak.upper().startswith("L") else "")
            tags.append(("%s %s" % (side.get("short") or side["name"], streak), "", tone))
    ms = hist.get("matchup_summary") or {}
    sc = ms.get("scoring") or {}
    if sc.get("avg_combined") is not None:
        tags.append(("avg combined %s in this matchup" % unit, str(sc["avg_combined"]), "total"))
    mk = (ms.get("market") or {})
    for key, label in (("ats", "against the spread"), ("over_under", "over / under"),
                       ("favorite", "as favourite"), ("underdog", "as underdog")):
        rec = (mk.get(key) or {}).get("record")
        if rec:
            tags.append((label, str(rec)[:14], ""))
    return tags[:7]


def _faces(sport, away, home, extras, sim_starters=None, season=None):
    """The two people the game turns on, with the league's own photography.

    HUB_FACES_20260909. Nima: use meaningful player imagery, and do not create
    clutter with dozens of meaningless thumbnails. So it is exactly two per
    card, the men the market moves on, and the strip renders only when BOTH are
    known: one face beside an empty frame reads as a bug, not as missing data.

    NFL only for now, because the starting quarterback is the one position the
    site already keeps a live depth chart for. The same shape takes MLB's
    probable pitchers, NBA's listed starters and tennis's two players when those
    feeds are wired in. Every other sport renders nothing at all."""
    if sport != "nfl":
        return ""
    teams_by_name, qb1, _inj = extras or ({}, {}, {})
    cells = []
    for side in (away, home):
        person = {}
        name = None
        # TMR's own depth chart first: it is the authoritative starter and it is
        # refreshed daily. It needs NFL_ADMIN_TOKEN, which the GitHub runner does
        # NOT carry, so the first unattended bake produced a hub with zero faces.
        # ESPN's roster is the keyless fallback and it is on every runner.
        t = (teams_by_name or {}).get(side["name"]) or {}
        starter = (qb1 or {}).get(t.get("franchise_id")) or {}
        roster = enrich.roster(sport, side.get("espn_id")) or {}
        if starter.get("full_name"):
            name = starter["full_name"]
            person = roster.get(enrich.norm_name(name)) or {}
        else:
            # Fallback for the unattended bake, where NFL_ADMIN_TOKEN is absent.
            # NOT the lowest jersey: that put Drew Lock on the Seattle card ahead
            # of Sam Darnold. TrustMyRecord's own simulator publishes the expected
            # starters keylessly and it is already cached from the matchup pages,
            # so it costs nothing and it agrees with the deep page by construction.
            # ESPN's own depth chart, rank 1. Keyless, so it works on the
            # runner, and it is RIGHT: the lowest-jersey guess put Mac Jones on
            # the 49ers card ahead of Brock Purdy and Tyler Huntley on the
            # Ravens ahead of Lamar Jackson. A wrong starter published as a fact
            # is worse than no face at all.
            aid = enrich.depth_starter(sport, side.get("espn_id"), season)
            if aid:
                person = next((q for q in roster.values() if str(q.get("id")) == str(aid)), {})
                name = person.get("name")
            if not name:
                for who in (sim_starters or {}).get(side["name"], []):
                    if (who.get("role") or "").upper() == "QB" and who.get("name"):
                        name = who["name"]
                        person = roster.get(enrich.norm_name(name)) or {}
                        break
        if not name:
            return ""
        shot = person.get("headshot")
        face = (('<img class="hx-face-sm" src="%s" alt="%s" width="72" height="72" '
                 'loading="lazy" decoding="async">' % (esc(shot), esc(name))) if shot else
                ('<span class="hx-face-sm hx-face-sm--mono" aria-hidden="true">%s</span>'
                 % esc(enrich.initials(name))))
        cells.append('<span class="hx-face-cell" style="--hx-c:%s">%s'
                     '<span class="hx-face-name">%s<small>QB</small></span></span>'
                     % (esc(side.get("color") or "#1D7FE8"), face, esc(name)))
    return '                    <div class="hx-faces">%s</div>\n' % "".join(cells)


# The stats a handicapper actually opens the page for. Per sport, because the
# sports do not share metrics: points scored and allowed carry football and
# basketball, goals carry hockey. Each row is (label, ESPN key, per-game?,
# higher-is-better).
CARD_STATS = {
    "nfl": [("Points scored", "record.avgPointsFor", False, True),
            ("Points allowed", "record.avgPointsAgainst", False, False),
            ("Point differential", "record.pointDifferential", False, True),
            ("Total yards", "passing.netYardsPerGame", False, True),
            ("Passing yards", "passing.netPassingYardsPerGame", False, True),
            ("Rushing yards", "rushing.rushingYardsPerGame", False, True)],
    "nba": [("Points scored", "record.avgPointsFor", False, True),
            ("Points allowed", "record.avgPointsAgainst", False, False)],
    "nhl": [("Goals for", "record.avgPointsFor", False, True),
            ("Goals against", "record.avgPointsAgainst", False, False)],
}


def _statstrip(sport, away, home, season):
    """Real season numbers on the card, not just the line.

    HUB_CARD_STATS_20260909. Nima, looking at the first live hub: "no real
    stats, just lines". He was right: the card carried the market, the streak
    and a head to head average, and nothing about how either club has actually
    been playing. This is the same ESPN season feed the matchup page uses, so
    the two never disagree, and it is keyless, so it works on the runner.

    Renders nothing at all unless BOTH clubs answer. A one-sided comparison is
    not a comparison."""
    rows = CARD_STATS.get(sport)
    if not rows or not away.get("espn_id") or not home.get("espn_id"):
        return "", None
    a_stats, a_yr, a_prev = enrich.team_stats(sport, away["espn_id"], season)
    h_stats, h_yr, _hp = enrich.team_stats(sport, home["espn_id"], season)
    if not a_stats or not h_stats:
        return "", None
    out = []
    for label, key, _per, higher in rows:
        av, hv = enrich.statf(a_stats, key), enrich.statf(h_stats, key)
        if av is None or hv is None:
            continue
        a_win = (av > hv) if higher else (av < hv)
        share = 50.0
        if av > 0 and hv > 0:
            share = 100.0 * av / (av + hv)
            if not higher:
                share = 100.0 - share
            share = max(8.0, min(92.0, share))
        out.append(
            '<div class="hx-cstat">'
            '<span class="hx-cstat-v%s">%s</span>'
            '<span class="hx-cstat-l">%s</span>'
            '<span class="hx-cstat-v hx-cstat-v--home%s">%s</span>'
            '<span class="hx-cstat-bar"><i style="width:%.1f%%"></i>'
            '<i style="width:%.1f%%"></i></span></div>'
            % (" is-win" if a_win else "", esc(enrich.stat(a_stats, key)),
               esc(label), "" if a_win else " is-win", esc(enrich.stat(h_stats, key)),
               share, 100.0 - share))
    if not out:
        return "", None
    note = ("%d season" % a_yr) if a_yr else None
    if a_prev:
        note = "%d season, complete" % a_yr
    return ('                    <div class="hx-cstats">%s</div>' % "".join(out)) + "\n", note


def _form_pills(pills):
    """The last five results, most recent first, with the score on hover.

    HUB_FORM_20260909. The soccer room proved this: a card reads as research
    when it shows the actual results rather than the word "W10". Same component,
    same meaning, real final scores from the league's own schedule feed."""
    if not pills:
        return ""
    out = []
    for p in pills:
        title = "%s %s-%s %s %s" % (p["r"], p["for"], p["against"],
                                    "vs" if p["home"] else "at", p["opp"])
        out.append('<i data-r="%s" title="%s">%s</i>' % (esc(p["r"]), esc(title), esc(p["r"])))
    return '<span class="hx-seq">%s</span>' % "".join(out)


def _injuries(away, home):
    """Availability, both clubs, the names that actually move a line.

    HUB_INJURIES_20260909. Three per side at most: a card is not an injury
    report, but a handicapper who cannot see that a starting back is out is
    reading a price list. Renders nothing when neither club has anyone listed."""
    cells = []
    for side in (away, home):
        listed = side.get("injuries") or []
        if not listed:
            continue
        names = "".join(
            '<span class="hx-inj"><b>%s</b> %s <i>%s</i></span>'
            % (esc(i["pos"] or ""), esc(i["name"] or ""), esc(i["status"]))
            for i in listed[:3])
        more = len(listed) - 3
        cells.append('<div class="hx-inj-side"><span class="hx-inj-who">%s</span>%s%s</div>'
                     % (esc(side.get("short") or side["name"]), names,
                        ('<span class="hx-inj-more">+%d more</span>' % more) if more > 0 else ""))
    if not cells:
        return ""
    return ('                    <div class="hx-injs">%s</div>' % "".join(cells)) + "\n"


def _model(sim, away, home, mk):
    """TrustMyRecord's own projection, on the card.

    HUB_MODEL_20260909. It is the single most useful number a handicapper can
    see before clicking: the projected score, the win probability, and how far
    the model sits from the number the book is offering. Same simulator run the
    matchup page shows, already cached, so the two cannot disagree."""
    p = (sim or {}).get("projection") or {}
    sc, wp = p.get("score") or {}, p.get("win_probability") or {}
    if sc.get("home") is None or wp.get("home") is None:
        return ""
    a, h = sc.get("away"), sc.get("home")
    fav, fwp = (home, wp["home"]) if h >= a else (away, wp.get("away"))
    cells = ['<span class="hx-mdl-score"><b>%s</b> %s &middot; %s <b>%s</b></span>'
             % (esc(away.get("abbr") or away["short"]), esc(a),
                esc(h), esc(home.get("abbr") or home["short"])),
             '<span class="hx-mdl-wp">%s %s to win</span>'
             % (esc(fav.get("abbr") or fav["short"]), esc(enrich.pct(fwp)))]

    # the edge, which is the whole reason to print a projection beside a price
    mkt = (mk.get("spread_by_side") or {}).get(home["name"])
    if mkt is not None:
        edge = (float(h) - float(a)) - (-float(mkt))
        if abs(edge) >= 1.0:
            side = home if edge > 0 else away
            cells.append('<span class="hx-mdl-edge">%s by %.1f vs the number</span>'
                         % (esc(side.get("abbr") or side["short"]), abs(edge)))
    tot = mk.get("total_point")
    proj = p.get("projected_total")
    if tot is not None and proj is not None and abs(float(proj) - tot) >= 2.0:
        cells.append('<span class="hx-mdl-edge">%s %g by %.1f</span>'
                     % ("Under" if float(proj) < tot else "Over", tot, abs(float(proj) - tot)))
    one = (p.get("margin_shape") or {}).get("one_score")
    if one is not None:
        cells.append('<span class="hx-mdl-note">%s one score</span>' % esc(enrich.pct(one)))
    return ('                    <div class="hx-mdl"><span class="hx-mdl-tag">TMR model</span>%s'
            '</div>' % "".join(cells)) + "\n"


def _splits(away, home):
    """Home and road records and recent scoring, both clubs, side by side.

    SITUATIONAL_SPLITS_20260909. The season rate says how good a club is; this
    says where, and how recently. Counted from the same game log the form pills
    come from, so it opens no new feed."""
    a, h = away.get("splits") or {}, home.get("splits") or {}
    if not a or not h:
        return ""
    out = []
    for label, key in (("Home", "home"), ("Road", "road"),
                       ("Points, last 5", "pf5"), ("Allowed, last 5", "pa5")):
        av, hv = a.get(key), h.get(key)
        if av is None or hv is None:
            continue
        out.append('<div class="hx-split"><span class="hx-split-v">%s</span>'
                   '<span class="hx-split-l">%s</span>'
                   '<span class="hx-split-v hx-split-v--home">%s</span></div>'
                   % (esc(av), esc(label), esc(hv)))
    if not out:
        return ""
    return ('                    <div class="hx-splits">%s</div>' % "".join(out)) + chr(10)


def _team_row(side, other, ml, spreads):
    price = hp._odds(ml.get(side["name"]))
    point = spreads.get(side["name"])
    line = hp._fmt_line(point) if point is not None else None
    fav = ""
    try:
        if ml.get(side["name"]) is not None and ml.get(other["name"]) is not None:
            fav = " is-fav" if float(ml[side["name"]]) < float(ml[other["name"]]) else ""
    except (TypeError, ValueError):
        fav = ""
    bits = [b for b in (side.get("form_record"), side.get("record"), side.get("division")) if b]
    sub = " &middot; ".join(esc(b) for b in bits[:2])
    return ('                        <div class="hx-gteam%s">%s'
            '<span class="hx-gteam-name">%s%s</span>'
            '<span class="hx-gteam-price">%s</span>'
            '<span class="hx-gteam-price">%s</span>%s</div>\n' % (
                fav, ui.logo_img(side.get("logo"), "", "", 34),
                esc(side.get("short") or side["name"]),
                ('<small>%s</small>' % sub) if sub else "",
                esc(line or ""), esc(price or ""),
                _form_pills(side.get("form"))))


def render(bld, sport, games, built_at, hist_by_pair=None, extras=None):
    S = bld.SPORTS[sport]
    label = S["label"]
    hist_by_pair = hist_by_pair or {}
    teams_by_name = (extras or ({}, {}, {}))[0]

    dates = ""
    if games:
        try:
            d0 = datetime.date.fromisoformat((games[0].get("commence") or "")[:10])
            d1 = datetime.date.fromisoformat((games[-1].get("commence") or "")[:10])
            dates = "%s-%s" % ((d0 - datetime.timedelta(days=1)).strftime("%Y%m%d"),
                               (d1 + datetime.timedelta(days=1)).strftime("%Y%m%d"))
        except ValueError:
            dates = ""
    sb = enrich.scoreboard(sport, dates) if dates else {}
    season = hp._season_for(sport, games[0].get("commence") if games else None)

    cards, days = [], []
    stat_note = None
    for g in games:
        key = tuple(sorted([enrich.norm_name(g["away"]), enrich.norm_name(g["home"])]))
        ev = sb.get(key) or {}
        ev_teams = ev.get("teams") or {}
        away = hp.club(sport, g["away"], None, ev_teams.get(enrich.norm_name(g["away"])), teams_by_name)
        home = hp.club(sport, g["home"], None, ev_teams.get(enrich.norm_name(g["home"])), teams_by_name)
        for side in (away, home):
            side["color"] = enrich.lift(side.get("color") or side.get("alt"))
            # A club at 0-0 says nothing in week one; its division says more.
            if side.get("record") and not side["record"].replace("-", "").strip("0"):
                side["record"] = None
            # The last five, with real scores, from the league's own schedule.
            pills, rec, fnote, splits = enrich.team_form(sport, side.get("espn_id"), season)
            side["form"], side["form_record"], side["splits"] = pills, rec, splits
            side["injuries"] = enrich.injuries(sport, side.get("espn_id"))
            if fnote and not stat_note:
                stat_note = fnote

        mk = hp.markets(g, away, home)
        ml = (g.get("markets") or {}).get("h2h") or {}
        spreads = mk.get("spread_by_side") or {}
        hist = hist_by_pair.get((g["away"], g["home"]))

        day = (g.get("commence") or "")[:10]
        if day and day not in days:
            days.append(day)

        when = []
        if g.get("commence"):
            when.append("<b>%s</b>" % esc(bld.kickoff(g["commence"])))
            when.append(esc(bld.long_date(g["commence"])))
        if ev.get("venue"):
            when.append(esc(ev["venue"]))
        if ev.get("network"):
            when.append(esc(ev["network"]))
        if g.get("comp"):
            when.append(esc(g["comp"]))

        # The simulator's expected starters, keyless and already cached by the
        # matchup build. One call per fixture, and it is the same answer the deep
        # page shows.
        sim_starters, sim_payload = {}, None
        if sport == "nfl":
            sim_payload = enrich.simulate_pair(g["away"], g["home"], season)
            for which, side in (("away", away), ("home", home)):
                blk = ((sim_payload or {}).get("roster") or {}).get(which) or {}
                sim_starters[side["name"]] = blk.get("expected_starters") or []

        strip, note = _statstrip(sport, away, home, season)
        if note and not stat_note:
            stat_note = note

        tags = []
        tot = (mk.get("total") or {}).get("point")
        if tot:
            tags.append('<span class="hx-gtag hx-gtag--total"><b>o%s</b> total</span>' % esc(tot))
        for txt, val, tone in _card_tags(hist, away, home, S["unit"]):
            tags.append('<span class="hx-gtag%s">%s%s</span>'
                        % (" hx-gtag--%s" % tone if tone else "",
                           ('<b>%s</b> ' % esc(val)) if val else "", esc(txt)))

        cards.append(
            '                <a class="hx-gcard" data-day="%s" data-kick="%s" data-fav="%s" '
            'data-total="%s" href="%s">\n'
            '                    <p class="hx-gcard-when">%s</p>\n'
            '                    <div class="hx-gcard-teams">\n%s'
            '                    </div>\n%s'
            '                    <div class="hx-gcard-foot">%s'
            '<span class="hx-gcard-cta">Full research &rsaquo;</span></div>\n'
            '                </a>\n' % (
                esc(day), esc(g.get("commence") or ""),
                esc("%.1f" % abs(float(list(spreads.values())[0]))) if spreads else "",
                esc(str((mk.get("total") or {}).get("point") or "")),
                esc(bld.game_url(sport, g)),
                " &middot; ".join(when),
                _team_row(away, home, ml, spreads) + _team_row(home, away, ml, spreads),
                _faces(sport, away, home, extras, sim_starters, season)
                + _model(sim_payload, away, home, mk) + strip + _splits(away, home)
                + _injuries(away, home),
                "".join(tags)))

    if cards:
        body = ""
        if len(days) > 1:
            chips = ['<span class="hx-toolbar-l">Show</span>',
                     # "Upcoming" is the default and it is decided in the
                     # browser, in Eastern time, so the page rolls over at
                     # midnight ET without waiting for the next bake.
                     '<button type="button" class="hx-chipbtn" data-daypick="live" '
                     'aria-pressed="true">Upcoming</button>',
                     '<button type="button" class="hx-chipbtn" data-daypick="all" '
                     'aria-pressed="false">Every game</button>']
            for d in days[:7]:
                try:
                    lab = datetime.date.fromisoformat(d).strftime("%a %b %d").replace(" 0", " ")
                except ValueError:
                    continue
                chips.append('<button type="button" class="hx-chipbtn" data-daypick="%s" '
                             'aria-pressed="false">%s</button>' % (esc(d), esc(lab)))
            # Sort, the way the soccer room does it: what a handicapper scans
            # for first is the biggest number, not the earliest kickoff.
            chips.append('<span class="hx-toolbar-l" style="margin-left:10px">Sort</span>')
            for key, lab in (("time", "Kickoff"), ("fav", "Biggest favourite"),
                             ("total", "Highest total")):
                chips.append('<button type="button" class="hx-chipbtn" data-sort="%s" '
                             'aria-pressed="%s">%s</button>'
                             % (key, "true" if key == "time" else "false", lab))
            body += '            <div class="hx-toolbar">%s</div>\n' % "".join(chips)
        body += ('            <div class="hx-slate">\n%s            </div>\n'
                 '            <p class="hx-slate-empty" id="hx-none" hidden>Nothing left on the '
                 'board for today. Pick another day above to see what is next.</p>\n'
                 % "".join(cards))
    else:
        body = ('            <p class="hx-slate-empty">The %s board is not posted yet. This page '
                'fills in as soon as the sportsbook feed carries the next slate.</p>\n' % esc(label))

    priced = sum(1 for g in games if g.get("priced"))
    # HUB_TILES_20260909. The soccer and NCAAF rooms open with a row of counts,
    # and it is the first thing that tells a reader this is a research product
    # rather than a list. Same idea, counted from this slate.
    tv = sum(1 for g in games
             if (sb.get(tuple(sorted([enrich.norm_name(g["away"]),
                                      enrich.norm_name(g["home"])]))) or {}).get("network"))
    days_n = len({(g.get("commence") or "")[:10] for g in games if g.get("commence")})
    tiles = ""
    if games:
        cells = [(len(games), "games on the board"), (priced, "priced by the book"),
                 (tv, "on a national network"), (days_n, "days covered")]
        tiles = ('            <div class="hx-tiles">%s</div>'
                 % "".join('<div class="hx-tile"><b>%s</b><span>%s</span></div>'
                           % (esc(v), esc(l)) for v, l in cells)) + "\n"
    lede = None
    if games:
        lede = ("%d game%s on the board, %d priced. Every card carries the line, both clubs' "
                "season rates%s, their current form and the starting quarterbacks, with the full "
                "research page one click away."
                % (len(games), "" if len(games) == 1 else "s", priced,
                   (" from the %s" % stat_note) if stat_note else ""))

    title = "%s Handicapping: Odds, Trends and Matchup Research" % label
    desc = ("Every %s game on the board with the moneyline, the spread and the total, each club's "
            "record and current form, and a full research page for every matchup." % label)
    url = bld.SITE + "/handicapping/%s/" % sport
    items = [{"@type": "ListItem", "position": i + 1,
              "name": "%s at %s" % (g["away"], g["home"]),
              "url": bld.SITE + bld.game_url(sport, g)} for i, g in enumerate(games)]
    ld = {"@context": "https://schema.org", "@graph": [
        bld.breadcrumb_ld([("Handicapping", "/handicapping/"), (label, None)]),
        {"@type": "ItemList", "itemListElement": items}]}

    ctx = {"sport": sport, "label": label,
           "away": {"name": label, "color": "#1D7FE8"},
           "home": {"name": label, "color": "#B98505"},
           "markets": {"any": False}}

    stamp = built_at[:16].replace("T", " ") + " UTC"
    links = [("The handicapping hub, every sport", "/handicapping/", None)]
    if bld.featured_article(sport):
        links.append(("%s Matchup of the Day" % label, "/matchup-of-the-day/%s/" % sport, None))
    links.append(("MLB matchups, odds and probable pitchers", "/handicapping/mlb/", None))
    if S.get("simulator"):
        links.append(("%s simulator" % label, S["simulator"], None))
    links.append(("BetLegend Pro, the research database behind these pages", "/betlegend-pro/", None))

    b = [ui.body_open(ctx, "hx-hub", ' data-sport="%s"' % esc(sport)),
         '    <main class="hx-wrap" style="padding-top:26px">\n',
         '        <nav class="hx-crumb" aria-label="Breadcrumb" style="color:var(--muted)">'
         '<a href="/handicapping/" style="color:var(--brand-dk)">Handicapping</a> '
         '<span aria-hidden="true">&rsaquo;</span> <span>%s</span></nav>\n' % esc(label),
         # An <h1>, not an <h2>. tests/seo-indexability-regression-test.js fails
         # any sitemap URL that has no <h1>, and it caught this hub.
         '        <div class="hx-sec-h" style="margin-top:10px">'
         '<h1 style="font-size:clamp(1.7rem,5vw,2.6rem)">%s Handicapping</h1>'
         '<span class="hx-eyebrow">Updated %s</span></div>\n' % (esc(label), esc(stamp)),
         ('        <p class="hx-lede">%s</p>\n' % esc(lede)) if lede else "",
         bld.gotw_block(sport),
         '        <section class="hx-sec">\n', tiles, body, '        </section>\n',
         ui.section("Elsewhere on TrustMyRecord", ui.links(links), eyebrow="Keep going"),
         '        <p class="hx-foot">Lines come from the sportsbook feed and refresh through the '
         'day. Club marks, records and form come from the league feed and the graded game '
         'database. Built %s.</p>\n' % esc(stamp),
         '    </main>\n',
         '    <script>%s</script>\n' % HUB_JS,
         bld.mlb.FOOT_SCRIPTS, '</body>\n</html>\n']
    head = bld.page_head(title, desc, url, ld)
    head = head.replace("</head>", hp._sheet_link() + "</head>", 1)
    return head + "".join(b)
