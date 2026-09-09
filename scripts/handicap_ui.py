#!/usr/bin/env python3
"""The handicapping page composition layer: the components tmr-handicap.css
styles, and the one function that assembles them into a matchup page.

HANDICAP_REDESIGN_20260909.

WHY A SEPARATE MODULE
The builder's job is to fetch and to be correct about what the data says. This
module's job is to decide what a premium handicapping page looks like. Keeping
them apart is what lets the NFL, MLB, NBA, NHL, college and tennis builders all
produce the same product: each one assembles a `ctx` describing its own sport,
and calls compose() to get the page.

THE CONTRACT
Every component takes real values and returns "" when it has none. There is no
placeholder state anywhere in this file. A section with no data does not render
an empty card, a zeroed bar, or a "TBD" - it does not render at all, and the
page closes up around it. That is deliberate: a handicapping page that shows a
confident empty component is worse than one section shorter.

SPORT AGNOSTIC BY CONSTRUCTION
Components are named for what they do. `duel` is two people compared side by
side, which is quarterbacks in the NFL, starting pitchers in MLB, the two
players in tennis and the two stars in an NBA game. `compare` is any pair of
numbers with a better side. `dial` is any won/lost split. Adding a sport means
filling the same ctx, not writing new components.
"""

import html
import math

ESPN_LOGO = "https://a.espncdn.com/i/teamlogos/%s/500/%s.png"


# Standing house rule: nothing TrustMyRecord publishes carries a dash in its
# prose. Most of the text on these pages is not written here, it arrives from
# the graded game engine, the league feeds and the simulator's own notes, and
# all three write em dashes. Cleaning on the way out is the only place that
# catches every one of them. Hyphens inside a token ("one-score", "8-2") are
# left alone: only a spaced dash is punctuation.
_DASHES = ((" — ", ", "), (" – ", ", "), ("—", ", "), ("–", ", "),
           (" - ", ", "))


def esc(v):
    v = "" if v is None else str(v)
    for a, b in _DASHES:
        v = v.replace(a, b)
    return html.escape(v, quote=True)


def _n(v):
    """A number for a bar, or None. Strings arrive from ESPN with commas."""
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return float(v)
    try:
        return float(str(v).replace(",", "").replace("%", "").strip())
    except ValueError:
        return None


# ---------------------------------------------------------------- primitives

ICON = {
    "cal": '<path d="M7 2v3M17 2v3M3.5 8.5h17M4 5.5h16a1 1 0 011 1v13a1 1 0 01-1 1H4a1 1 0 '
           '01-1-1v-13a1 1 0 011-1z"/>',
    "clock": '<circle cx="12" cy="12" r="9"/><path d="M12 7.5V12l3 2"/>',
    "pin": '<path d="M12 21s7-5.6 7-11a7 7 0 10-14 0c0 5.4 7 11 7 11z"/><circle cx="12" cy="10" r="2.6"/>',
    "tv": '<rect x="3" y="4.5" width="18" height="12.5" rx="1.6"/><path d="M8.5 21h7"/>',
    "flag": '<path d="M5 21V4M5 4h11l-2 3.5L16 11H5"/>',
}


def icon(name):
    d = ICON.get(name)
    if not d:
        return ""
    return ('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" '
            'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">%s</svg>' % d)


def section(title, body, eyebrow=None, lede=None, note=None, anchor=None):
    if not body:
        return ""
    b = ['        <section class="hx-sec"%s>\n' % (' id="%s"' % esc(anchor) if anchor else "")]
    b.append('            <div class="hx-sec-h"><h2>%s</h2>%s</div>\n'
             % (esc(title), ('<span class="hx-eyebrow">%s</span>' % esc(eyebrow)) if eyebrow else ""))
    if lede:
        b.append('            <p class="hx-lede">%s</p>\n' % esc(lede))
    b.append(body)
    if note:
        b.append('            <p class="hx-note">%s</p>\n' % esc(note))
    b.append('        </section>\n')
    return "".join(b)


def logo_img(src, alt, cls="", size=48):
    if not src:
        return ""
    return ('<img%s src="%s" alt="%s" width="%d" height="%d" loading="lazy" decoding="async">'
            % ((' class="%s"' % cls) if cls else "", esc(src), esc(alt), size, size))


# ---------------------------------------------------------------- hero

def hero(ctx):
    a, h = ctx["away"], ctx["home"]
    crumbs = []
    for name, url in ctx.get("crumbs") or []:
        crumbs.append('<a href="%s">%s</a>' % (esc(url), esc(name)) if url else
                      '<span>%s</span>' % esc(name))
    crumb = ('            <nav class="hx-crumb" aria-label="Breadcrumb">%s</nav>\n'
             % ' <span aria-hidden="true">&rsaquo;</span> '.join(crumbs)) if crumbs else ""

    kicks = ['<span class="hx-kick">%s</span>' % esc(ctx["label"])]
    if ctx.get("kicker2"):
        kicks.append('<span class="hx-kick hx-kick--ghost">%s</span>' % esc(ctx["kicker2"]))

    def side(t, which):
        subs = []
        if t.get("record"):
            subs.append("<b>%s</b>" % esc(t["record"]))
        if t.get("sub"):
            subs.append(esc(t["sub"]))
        return (
            '                <div class="hx-team hx-team--%s">\n'
            '                    %s\n'
            '                    <span class="hx-team-rule"></span>\n'
            '                    <p class="hx-team-name">%s</p>\n'
            '                    %s\n'
            '                </div>\n' % (
                which,
                logo_img(t.get("logo"), "%s logo" % t.get("name", ""), "hx-logo", 132),
                esc(t.get("name")),
                ('<span class="hx-team-sub">%s</span>' % " ".join(subs)) if subs else ""))

    meta = []
    for key, val in (("cal", ctx.get("date_long")), ("clock", ctx.get("time_et")),
                     ("pin", ctx.get("venue_line")), ("tv", ctx.get("network"))):
        if val:
            meta.append('<li>%s%s</li>' % (icon(key), esc(val)))
    meta_html = ('            <ul class="hx-meta">%s</ul>\n' % "".join(meta)) if meta else ""

    return (
        '        <header class="hx-hero">\n'
        '            <div class="hx-hero-in">\n'
        '%s'
        '            <p style="margin:0">%s</p>\n'
        '            <div class="hx-teams">\n%s'
        '                <span class="hx-vs">%s</span>\n'
        '%s'
        '            </div>\n'
        '            <h1 class="hx-title">%s</h1>\n'
        '%s'
        '%s'
        '%s'
        '            </div>\n'
        '        </header>\n' % (
            crumb, "".join(kicks), side(a, "away"), esc(ctx.get("vs_word", "AT")), side(h, "home"),
            esc(ctx.get("headline") or "%s at %s" % (a.get("name"), h.get("name"))),
            ('            <p class="hx-sub">%s</p>\n' % esc(ctx["standfirst"])) if ctx.get("standfirst") else "",
            meta_html, board(ctx)))


# ---------------------------------------------------------------- market board

def board(ctx):
    m = ctx.get("markets") or {}
    if not m.get("any"):
        return ('            <p class="hx-mk-book">The sportsbook feed is not carrying a price '
                'on this game yet.</p>\n')
    cards = []

    sp = m.get("spread") or {}
    if sp.get("rows"):
        rows = "".join(
            '<div class="hx-mk-row"><span class="hx-mk-who">%s</span>'
            '<span class="hx-mk-v">%s<small>%s</small></span></div>'
            % (esc(r[0]), esc(r[1]), esc(r[2])) for r in sp["rows"])
        cards.append('<div class="hx-mk"><p class="hx-mk-l">Spread</p>%s</div>' % rows)

    ml = m.get("moneyline") or {}
    if ml.get("rows"):
        rows = "".join(
            '<div class="hx-mk-row"><span class="hx-mk-who">%s</span>'
            '<span class="hx-mk-v">%s</span>%s</div>'
            % (esc(r[0]), esc(r[1]),
               ('<span class="hx-mk-imp">%s</span>' % esc(r[2])) if r[2] else "")
            for r in ml["rows"])
        cards.append('<div class="hx-mk"><p class="hx-mk-l">Moneyline</p>%s</div>' % rows)

    tot = m.get("total") or {}
    if tot.get("point"):
        cards.append(
            '<div class="hx-mk"><p class="hx-mk-l">Total</p>'
            '<div class="hx-mk-single"><span class="hx-mk-v">%s</span>'
            '<span class="hx-mk-imp">%s</span></div>'
            '<div class="hx-mk-row" style="margin-top:8px"><span class="hx-mk-who">%s</span>'
            '<span class="hx-mk-imp">%s</span></div></div>'
            % (esc(tot["point"]), esc(tot.get("price") or ""),
               esc(tot.get("sub") or ""), esc(tot.get("sub2") or "")))

    if not cards:
        return ""
    book = ('            <p class="hx-mk-book">%s</p>\n' % esc(m["book_note"])) if m.get("book_note") else ""
    return '            <div class="hx-board">%s</div>\n%s' % ("".join(cards), book)


# ---------------------------------------------------------------- duel

def duel(spec):
    """Two people compared. Renders nothing unless BOTH sides are known: one
    face beside an empty frame reads as a bug, not as a missing feed."""
    if not spec:
        return ""
    a, h = spec.get("away") or {}, spec.get("home") or {}
    if not a.get("name") or not h.get("name"):
        return ""

    def face(p, which):
        if p.get("photo"):
            return ('<img class="hx-face" src="%s" alt="%s" width="116" height="116" '
                    'loading="lazy" decoding="async">' % (esc(p["photo"]), esc(p["name"])))
        return '<span class="hx-face hx-face--mono" aria-hidden="true">%s</span>' % esc(p.get("mono", ""))

    def stats(p, other):
        out = []
        for i, s in enumerate(p.get("stats") or []):
            mine, theirs = _n(s.get("cmp")), None
            o = (other.get("stats") or [])
            if i < len(o):
                theirs = _n(o[i].get("cmp"))
            win = ""
            if mine is not None and theirs is not None and mine != theirs:
                better = mine > theirs if s.get("higher", True) else mine < theirs
                win = " is-win" if better else ""
            out.append('<div class="hx-dstat%s"><b>%s</b><span>%s</span></div>'
                       % (win, esc(s.get("value")), esc(s.get("label"))))
        return "".join(out)

    def side(p, other, which):
        return (
            '                <div class="hx-duel-side hx-duel-side--%s">\n'
            '                    <div class="hx-duel-top">%s<div class="hx-duel-who">'
            '<p class="hx-duel-role">%s</p><p class="hx-duel-name">%s</p>'
            '<p class="hx-duel-meta">%s</p></div></div>\n'
            '                    <div class="hx-duel-stats">%s</div>\n'
            '                </div>\n' % (
                which, face(p, which), esc(p.get("role") or spec.get("role") or ""),
                esc(p["name"]), esc(p.get("meta") or ""), stats(p, other)))

    return ('            <div class="hx-card hx-duel">\n%s%s            </div>\n'
            % (side(a, h, "away"), side(h, a, "home")))


# ---------------------------------------------------------------- comparison

def compare(ctx, rows, note=None):
    """The component that replaces a stat table.

    Each row prints both values at a size you can read across a room, splits a
    bar by each side's share of the pair, and names the side in front. A row
    whose two numbers are not comparable (one side missing) is dropped."""
    live = [r for r in rows if r.get("away") is not None and r.get("home") is not None]
    if not live:
        return ""
    a, h = ctx["away"], ctx["home"]
    head = (
        '                <div class="hx-cmp-head">\n'
        '                    <span class="hx-cmp-club">%s<b>%s</b></span>\n'
        '                    <span class="hx-cmp-vs">VS</span>\n'
        '                    <span class="hx-cmp-club hx-cmp-club--home"><b>%s</b>%s</span>\n'
        '                </div>\n' % (
            logo_img(a.get("logo"), "", "", 34), esc(a.get("short") or a.get("name")),
            esc(h.get("short") or h.get("name")), logo_img(h.get("logo"), "", "", 34)))

    body = []
    for r in live:
        av, hv = _n(r.get("away_cmp", r["away"])), _n(r.get("home_cmp", r["home"]))
        higher = r.get("higher", True)
        aw = hw = ""
        edge = ""
        if av is not None and hv is not None:
            if av != hv:
                a_better = av > hv if higher else av < hv
                aw, hw = (" is-win", "") if a_better else ("", " is-win")
                who = a if a_better else h
                gap = r.get("gap")
                if gap is None:
                    gap = abs(av - hv)
                    gap = ("%g" % round(gap, 1))
                edge = ('<span class="hx-edge">%s by %s</span>'
                        % (esc(who.get("short") or who.get("name")), esc(gap)))
            else:
                edge = '<span class="hx-edge hx-edge--even">Dead even</span>'
        # bar share: a negative or zero pair cannot be split proportionally, so
        # it is shown 50/50 with the advantage carried by the badge instead.
        share = 50.0
        if av is not None and hv is not None and av > 0 and hv > 0:
            share = 100.0 * av / (av + hv)
            if not higher:
                share = 100.0 - share
            share = max(6.0, min(94.0, share))
        body.append(
            '                <div class="hx-cmp-row">\n'
            '                    <div class="hx-cmp-line">'
            '<span class="hx-cmp-v%s">%s</span>'
            '<span class="hx-cmp-l">%s</span>'
            '<span class="hx-cmp-v hx-cmp-v--home%s">%s</span></div>\n'
            '                    <div class="hx-cmp-bar"><i style="width:%.1f%%"></i>'
            '<i style="width:%.1f%%"></i></div>\n'
            '                    <div class="hx-cmp-foot">%s</div>\n'
            '                </div>\n' % (
                aw, esc(r["away"]), esc(r["label"]), hw, esc(r["home"]),
                share, 100.0 - share, edge))
    n = ('            <p class="hx-note">%s</p>\n' % esc(note)) if note else ""
    return '            <div class="hx-card">\n%s%s            </div>\n%s' % (head, "".join(body), n)


# ---------------------------------------------------------------- model

def dist_svg(points, mid_label=None):
    """The simulated margin distribution, drawn as bars.

    Nothing is smoothed and nothing is extrapolated: each bar is the share of
    simulations that landed on that exact margin, which is why the football key
    numbers stand up out of it."""
    pts = [(p.get("x"), p.get("p") or 0) for p in points or [] if p.get("x") is not None]
    pts = [(x, p) for x, p in pts if -32 <= x <= 32]
    if len(pts) < 12:
        return ""
    top = max(p for _, p in pts) or 1.0
    w, h = 900.0, 190.0
    step = w / len(pts)
    bars = []
    for i, (x, p) in enumerate(pts):
        bh = max(1.0, (p / top) * (h - 26))
        fill = "var(--hx-home)" if x > 0 else ("var(--hx-away)" if x < 0 else "var(--line-2)")
        op = ".95" if abs(x) in (3, 7) else ".62"
        bars.append('<rect x="%.2f" y="%.2f" width="%.2f" height="%.2f" rx="1.4" fill="%s" '
                    'fill-opacity="%s"></rect>' % (i * step, h - bh, max(1.2, step - 1.6), bh, fill, op))
    zero = next((i for i, (x, _) in enumerate(pts) if x == 0), None)
    line = ('<line x1="%.2f" y1="0" x2="%.2f" y2="%.2f" stroke="var(--line-2)" '
            'stroke-width="1.5" stroke-dasharray="4 4"></line>'
            % (zero * step + step / 2, zero * step + step / 2, h)) if zero is not None else ""
    return ('<svg viewBox="0 0 %d %d" role="img" aria-label="%s" preserveAspectRatio="none">'
            '%s%s</svg>' % (int(w), int(h),
                            esc(mid_label or "Simulated margin distribution"), "".join(bars), line))


def model_panel(ctx, m):
    """The TMR model block. `m` is the normalised projection, not a raw payload,
    so a second sport can fill it from its own engine."""
    if not m:
        return ""
    a, h = ctx["away"], ctx["home"]
    ascore, hscore = m.get("away_score"), m.get("home_score")
    awp, hwp = m.get("away_wp"), m.get("home_wp")
    if ascore is None or hscore is None or awp is None or hwp is None:
        return ""
    a_win = ascore > hscore
    score = (
        '                    <div class="hx-score">\n'
        '                        <div class="hx-score-side">%s<span class="hx-score-v%s">%s</span>'
        '<span class="hx-score-abbr">%s</span></div>\n'
        '                        <span class="hx-score-dash">&middot;</span>\n'
        '                        <div class="hx-score-side">%s<span class="hx-score-v%s">%s</span>'
        '<span class="hx-score-abbr">%s</span></div>\n'
        '                    </div>\n' % (
            logo_img(a.get("logo"), "", "", 46), " is-win" if a_win else "", esc(ascore),
            esc(a.get("abbr") or a.get("short")),
            logo_img(h.get("logo"), "", "", 46), "" if a_win else " is-win", esc(hscore),
            esc(h.get("abbr") or h.get("short"))))

    aw = max(8.0, min(92.0, awp * 100.0))
    wp = (
        '                    <div class="hx-wp">\n'
        '                        <div class="hx-wp-l"><span>%s win</span><span>%s win</span></div>\n'
        '                        <div class="hx-wp-bar"><i style="width:%.1f%%">%.0f%%</i>'
        '<i style="width:%.1f%%">%.0f%%</i></div>\n'
        '                        <p class="hx-note" style="margin-top:10px">%s</p>\n'
        '                    </div>\n' % (
            esc(a.get("abbr") or a.get("short")), esc(h.get("abbr") or h.get("short")),
            aw, awp * 100.0, 100.0 - aw, hwp * 100.0, esc(m.get("wp_note") or "")))

    cells = []
    for c in m.get("cells") or []:
        cells.append('<div class="hx-mcell%s"><b>%s</b><span>%s</span>%s</div>'
                     % (" hx-mcell--edge" if c.get("edge") else "", esc(c["value"]),
                        esc(c["label"]),
                        ('<em>%s</em>' % esc(c["note"])) if c.get("note") else ""))
    grid = ('                <div class="hx-mgrid">%s</div>\n' % "".join(cells)) if cells else ""

    chips = []
    for c in m.get("chips") or []:
        chips.append('<li class="hx-chip"><b>%s</b>%s</li>' % (esc(c[1]), esc(c[0])))
    chip_html = ('                <ul class="hx-chips">%s</ul>\n' % "".join(chips)) if chips else ""

    d = dist_svg(m.get("dist"))
    dist_html = ""
    if d:
        dist_html = (
            '                <div class="hx-dist">%s<div class="hx-dist-l"><span>%s by 30+</span>'
            '<span>Pick em</span><span>%s by 30+</span></div></div>\n'
            % (d, esc(a.get("short") or a.get("name")), esc(h.get("short") or h.get("name"))))

    lean = ""
    if m.get("lean"):
        lean = ('                <div class="hx-lean%s"><span class="hx-lean-tag">%s</span>'
                '<p>%s</p></div>\n'
                % ("" if m.get("lean_live") else " hx-lean--none",
                   esc(m.get("lean_tag") or "TMR lean"), esc(m["lean"])))

    return ('            <div class="hx-card hx-model">\n'
            '                <div class="hx-model-top">\n%s%s                </div>\n'
            '%s%s%s%s            </div>\n' % (score, wp, grid, chip_html, dist_html, lean))


# ---------------------------------------------------------------- people

def people(items):
    if not items:
        return ""
    cards = []
    for p in items:
        if p.get("photo"):
            shot = ('<img src="%s" alt="%s" width="320" height="320" loading="lazy" '
                    'decoding="async">' % (esc(p["photo"]), esc(p["name"])))
        else:
            shot = '<span class="hx-person-mono" aria-hidden="true">%s</span>' % esc(p.get("mono", ""))
        badge = ('<span class="hx-person-badge">%s</span>' % esc(p["badge"])) if p.get("badge") else ""
        cards.append(
            '                <article class="hx-person hx-person--%s">\n'
            '                    <div class="hx-person-shot">%s%s</div>\n'
            '                    <div class="hx-person-body"><p class="hx-person-name">%s</p>'
            '<p class="hx-person-meta">%s</p></div>\n'
            '                </article>\n' % (
                esc(p.get("side", "away")), shot, badge, esc(p["name"]), esc(p.get("meta") or "")))
    return '            <div class="hx-people">\n%s            </div>\n' % "".join(cards)


# ---------------------------------------------------------------- form

def form_block(rows):
    if not rows:
        return ""
    out = []
    for r in rows:
        seq = "".join('<i data-r="%s">%s</i>' % (esc(c), esc(c)) for c in (r.get("seq") or ""))
        tags = "".join('<span class="hx-tag%s"><b>%s</b> %s</span>'
                       % (" hx-tag--%s" % t[2] if len(t) > 2 and t[2] else "", esc(t[1]), esc(t[0]))
                       for t in (r.get("tags") or []))
        out.append(
            '                <div class="hx-form-row">\n'
            '                    <span class="hx-form-who">%s<b>%s</b></span>\n'
            '                    %s\n'
            '                    <span class="hx-form-bits">%s</span>\n'
            '                </div>\n' % (
                logo_img(r.get("logo"), "", "", 30), esc(r["name"]),
                ('<span class="hx-seq">%s</span>' % seq) if seq else "", tags))
    return '            <div class="hx-card">\n%s            </div>\n' % "".join(out)


# ---------------------------------------------------------------- dial

def dial(won, lost, centre_label, arc_label=None):
    """A won/lost split as a ring. Real counts only; no percentage is printed
    that the two numbers do not support."""
    try:
        won, lost = int(won), int(lost)
    except (TypeError, ValueError):
        return ""
    total = won + lost
    if total <= 0:
        return ""
    frac = won / float(total)
    r, cx, cy = 62.0, 80.0, 80.0
    circ = 2 * math.pi * r
    return (
        '                <div class="hx-dial">\n'
        '                    <svg viewBox="0 0 160 160" role="img" aria-label="%s">\n'
        '                        <circle cx="%g" cy="%g" r="%g" fill="none" stroke="var(--hx-home)" '
        'stroke-width="17" stroke-opacity=".85"></circle>\n'
        '                        <circle cx="%g" cy="%g" r="%g" fill="none" stroke="var(--hx-away)" '
        'stroke-width="17" stroke-dasharray="%.2f %.2f" transform="rotate(-90 %g %g)"></circle>\n'
        '                    </svg>\n'
        '                    <span class="hx-dial-c"><b>%s</b><span>%s</span></span>\n'
        '                </div>\n' % (
            esc(arc_label or centre_label), cx, cy, r, cx, cy, r,
            circ * frac, circ * (1 - frac), cx, cy,
            esc("%d-%d" % (won, lost)), esc(centre_label)))


def trend_cards(cards):
    if not cards:
        return ""
    out = []
    for c in cards:
        tone = c.get("tone")
        out.append('<div class="hx-trend%s"><b>%s</b><span>%s</span>%s</div>'
                   % (" hx-trend--%s" % tone if tone else "", esc(c["value"]), esc(c["label"]),
                      ('<em>%s</em>' % esc(c["note"])) if c.get("note") else ""))
    return '            <div class="hx-grid-4">%s</div>\n' % "".join(out)


# ---------------------------------------------------------------- stories

def stories(items):
    if not items:
        return ""
    out = []
    for s in items:
        shot = ('<img class="hx-story-shot" src="%s" alt="%s" width="184" height="184" '
                'loading="lazy" decoding="async">' % (esc(s["photo"]), esc(s.get("photo_alt") or ""))
                ) if s.get("photo") else ""
        mark = logo_img(s.get("logo"), "", "", 22)
        paras = "".join("<p>%s</p>" % esc(p) for p in s.get("paras") or [])
        out.append(
            '                <article class="hx-story-card hx-story-card--%s">\n'
            '                    <p class="hx-story-k">%s%s</p>\n'
            '                    <h3>%s</h3>\n'
            '                    %s%s\n'
            '                </article>\n' % (
                esc(s.get("side", "gold")), mark, esc(s.get("kicker") or ""), esc(s["title"]),
                shot, paras))
    return '            <div class="hx-story">\n%s            </div>\n' % "".join(out)


# ---------------------------------------------------------------- tables/links

def table(headers, rows, min_width=None):
    if not rows:
        return ""
    style = ' style="min-width:%dpx"' % min_width if min_width else ""
    head = "".join("<th>%s</th>" % esc(h) for h in headers)
    body = "".join("<tr>%s</tr>" % "".join("<td>%s</td>" % c for c in r) for r in rows)
    return ('            <div class="hx-tablewrap"><table class="hx-table"%s>'
            '<thead><tr>%s</tr></thead><tbody>%s</tbody></table></div>\n' % (style, head, body))


def deflist(rows):
    """The long tail: provenance, coverage, caveats. Still a table, but it is
    the LAST thing on the page rather than the whole of it."""
    if not rows:
        return ""
    body = "".join('<tr><th scope="row">%s</th><td>%s</td></tr>' % (esc(k), v) for k, v in rows)
    return ('            <div class="hx-tablewrap"><table class="hx-table" style="min-width:0">'
            '<tbody>%s</tbody></table></div>\n' % body)


def links(items):
    if not items:
        return ""
    out = "".join('<li><a href="%s">%s%s</a></li>' % (esc(u), logo_img(l, "", "", 26), esc(t))
                  for t, u, l in items)
    return '            <ul class="hx-links">%s</ul>\n' % out


# ---------------------------------------------------------------- page shell

def body_open(ctx, extra_class="", data=""):
    a, h = ctx["away"], ctx["home"]
    style = "--hx-away:%s;--hx-home:%s" % (a.get("color") or "#1D7FE8", h.get("color") or "#B98505")
    return ('<body class="tmr-ds tmr-ds--dark tmr-site-shell hx-page%s" style="%s"%s>\n'
            % ((" " + extra_class) if extra_class else "", esc(style), data))
