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
    mk = ms.get("market") or {}
    ats = (mk.get("ats") or {}).get("record")
    if ats:
        tags.append(("against the spread", str(ats)[:14], ""))
    return tags[:4]


def _faces(sport, away, home, extras):
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
    if not teams_by_name or not qb1:
        return ""
    cells = []
    for side in (away, home):
        t = (teams_by_name or {}).get(side["name"]) or {}
        starter = (qb1 or {}).get(t.get("franchise_id")) or {}
        name = starter.get("full_name")
        if not name:
            return ""
        person = (enrich.roster(sport, side.get("espn_id")) or {}).get(
            enrich.norm_name(name)) or {}
        shot = person.get("headshot")
        face = (('<img class="hx-face-sm" src="%s" alt="%s" width="72" height="72" '
                 'loading="lazy" decoding="async">' % (esc(shot), esc(name))) if shot else
                ('<span class="hx-face-sm hx-face-sm--mono" aria-hidden="true">%s</span>'
                 % esc(enrich.initials(name))))
        cells.append('<span class="hx-face-cell" style="--hx-c:%s">%s'
                     '<span class="hx-face-name">%s<small>QB</small></span></span>'
                     % (esc(side.get("color") or "#1D7FE8"), face, esc(name)))
    return '                    <div class="hx-faces">%s</div>\n' % "".join(cells)


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
    sub = side.get("record") or side.get("division") or ""
    return ('                        <div class="hx-gteam%s">%s'
            '<span class="hx-gteam-name">%s%s</span>'
            '<span class="hx-gteam-price">%s</span>'
            '<span class="hx-gteam-price">%s</span></div>\n' % (
                fav, ui.logo_img(side.get("logo"), "", "", 34),
                esc(side.get("short") or side["name"]),
                ('<small>%s</small>' % esc(sub)) if sub else "",
                esc(line or ""), esc(price or "")))


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

    cards, days = [], []
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

        tags = []
        tot = (mk.get("total") or {}).get("point")
        if tot:
            tags.append('<span class="hx-gtag hx-gtag--total"><b>o%s</b> total</span>' % esc(tot))
        for txt, val, tone in _card_tags(hist, away, home, S["unit"]):
            tags.append('<span class="hx-gtag%s">%s%s</span>'
                        % (" hx-gtag--%s" % tone if tone else "",
                           ('<b>%s</b> ' % esc(val)) if val else "", esc(txt)))

        cards.append(
            '                <a class="hx-gcard" data-day="%s" data-kick="%s" href="%s">\n'
            '                    <p class="hx-gcard-when">%s</p>\n'
            '                    <div class="hx-gcard-teams">\n%s'
            '                    </div>\n%s'
            '                    <div class="hx-gcard-foot">%s'
            '<span class="hx-gcard-cta">Full research &rsaquo;</span></div>\n'
            '                </a>\n' % (
                esc(day), esc(g.get("commence") or ""), esc(bld.game_url(sport, g)),
                " &middot; ".join(when),
                _team_row(away, home, ml, spreads) + _team_row(home, away, ml, spreads),
                _faces(sport, away, home, extras),
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
            body += '            <div class="hx-toolbar">%s</div>\n' % "".join(chips)
        body += ('            <div class="hx-slate">\n%s            </div>\n'
                 '            <p class="hx-slate-empty" id="hx-none" hidden>Nothing left on the '
                 'board for today. Pick another day above to see what is next.</p>\n'
                 % "".join(cards))
    else:
        body = ('            <p class="hx-slate-empty">The %s board is not posted yet. This page '
                'fills in as soon as the sportsbook feed carries the next slate.</p>\n' % esc(label))

    priced = sum(1 for g in games if g.get("priced"))
    lede = None
    if games:
        lede = ("%d game%s on the board, %d priced. Every card carries the line, each club's "
                "record and its current form, and the full research page for a matchup is one "
                "click away." % (len(games), "" if len(games) == 1 else "s", priced))

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
         '        <section class="hx-sec">\n', body, '        </section>\n',
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
