"""Bake today's tennis board into /handicapping/tennis/ so it is in the HTML.

WHY THIS EXISTS
The tennis hub renders its board in the browser, which is why it rolls forward
to a new day with no rebuild: a reader arriving tomorrow gets tomorrow's slate
because the page asks the API for it. That is the behaviour Nima asked for and
it stays exactly as it is.

What it did not do is put the slate in the HTML. A crawler, or anything with no
JavaScript, received `<p class="tn-empty">Loading the board.</p>` and nothing
else, so the one page on the site that carries every ATP and WTA match had none
of them in its source. Every other sport bakes its board.

So this writes the same board into the page between markers, and the inline
script hydrates over it on load. Correct with JavaScript off, live with it on.

WHAT IT WILL NOT DO
Nothing here is modelled or estimated. Every number is read from
/api/tennis/slate, which counts completed 2026 matches. A match with no market
says so; a player with no season record is written without one rather than with
a zero. If the feed does not answer, the page is left exactly as it was: a
stale board is worse than the one already on disk, and a half written one is
worse than both.

RUN
    python scripts/build_tennis_board.py            # today, rolling forward
    python scripts/build_tennis_board.py 2026-09-11 # a chosen day
"""

import datetime
import html
import io
import json
import os
import re
import sys
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
PAGE = os.path.join(REPO, "handicapping", "tennis", "index.html")
API = os.environ.get("TMR_API", "https://trustmyrecord-api.onrender.com/api")

BOARD_MARK = "tennisBoard"
FEATURED_MARK = "tennisFeatured"
RANKINGS_MARK = "tennisRankings"
LEADERS_MARK = "tennisLeaders"


def esc(v):
    return html.escape("" if v is None else str(v), quote=True)


def get_json(path, attempts=3):
    last = None
    for i in range(attempts):
        try:
            req = urllib.request.Request(API + path, headers={"Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=45) as r:
                return json.loads(r.read().decode("utf-8"))
        except Exception as exc:  # noqa: BLE001 - reported, then retried
            last = exc
    raise RuntimeError("%s failed after %d attempts: %s" % (path, attempts, last))


def american(v):
    if v is None:
        return ""
    n = int(round(float(v)))
    return "+%d" % n if n > 0 else str(n)


def record(r):
    return "%d-%d" % (r["wins"], r["losses"]) if r else ""


def et_clock(iso):
    """The start time as an Eastern clock, which is how the rest of the site
    prints a start time. The browser re-prints it in the reader's own zone."""
    if not iso:
        return ""
    try:
        t = datetime.datetime.strptime(iso.replace("Z", "+0000"), "%Y-%m-%dT%H:%M%z")
    except ValueError:
        try:
            t = datetime.datetime.strptime(iso[:19] + "+0000", "%Y-%m-%dT%H:%M:%S%z")
        except ValueError:
            return ""
    # US Eastern, second Sunday in March to the first Sunday in November.
    y = t.year
    mar = datetime.datetime(y, 3, 8, tzinfo=datetime.timezone.utc)
    while mar.weekday() != 6:
        mar += datetime.timedelta(days=1)
    nov = datetime.datetime(y, 11, 1, tzinfo=datetime.timezone.utc)
    while nov.weekday() != 6:
        nov += datetime.timedelta(days=1)
    off = -4 if mar <= t < nov else -5
    lt = t + datetime.timedelta(hours=off)
    hour = lt.hour % 12 or 12
    return "%d:%02d %s ET" % (hour, lt.minute, "AM" if lt.hour < 12 else "PM")


def face(name, shot):
    initials = "".join(w[0] for w in str(name or "").split() if w)[:2].upper()
    img = ('<img src="%s" alt="%s" loading="lazy" decoding="async">' % (esc(shot), esc(name))
           if shot else "")
    return '<span class="tn-face"><span>%s</span>%s</span>' % (esc(initials), img)


def flag(url, country):
    return ('<img class="tn-flag" src="%s" alt="%s" loading="lazy">' % (esc(url), esc(country))
            if url else "")


def player_line(m, i):
    p = m["players"][i]
    c = p.get("card") or {}
    ml = (m.get("market") or {}).get("moneyline") or {}
    price = american(ml.get("a") if i == 0 else ml.get("b")) if ml else ""
    novig = ml.get("noVigPctA") if i == 0 else ml.get("noVigPctB")
    sub = []
    if c.get("rank"):
        sub.append("No. %s" % c["rank"])
    if c.get("record"):
        sub.append("%s in 2026" % record(c["record"]))
    if c.get("surface_record"):
        sub.append("%s on %s" % (record(c["surface_record"]),
                                 str(m.get("surface") or "").lower()))
    won = " won" if m.get("completed") and p.get("winner") else ""
    return ('<div class="tn-rp%s"><span class="tn-rp-id">%s<span><b>%s</b>%s'
            '<em>%s</em></span></span><span class="tn-rp-odds">%s%s</span></div>'
            % (won, face(p.get("name"), c.get("headshot")), esc(p.get("name")),
               flag(p.get("flag"), p.get("country")),
               esc(" · ".join(sub)), esc(price),
               ('<em>%.1f%%</em>' % novig) if novig is not None else ""))


def match_row(m):
    meta = [m.get("round")]
    if m.get("court"):
        meta.append(m["court"])
    if m.get("best_of"):
        meta.append("best of %s" % m["best_of"])
    if m.get("completed"):
        meta.append("final")
    elif m.get("start_utc"):
        meta.append(et_clock(m["start_utc"]))
    surf = str(m.get("surface") or "")
    pills = ('<span class="tn-pill %s">%s</span><span class="tn-pill">%s</span>'
             % (esc(surf.lower()), esc(surf or "Surface unlisted"),
                esc(str(m.get("tour") or "").upper())))
    return ('<article class="tn-row"><div class="tn-rowhead"><div>'
            '<div class="tn-rowmeta">%s<span class="m">%s</span></div>%s%s</div></div></article>'
            % (pills, esc(" · ".join([x for x in meta if x])),
               player_line(m, 0), player_line(m, 1)))


def board_html(slate):
    rows = [m for m in slate.get("matches") or [] if m.get("market")]
    if not rows:
        rows = slate.get("matches") or []
    if not rows:
        return '<p class="tn-empty">No singles matches are on the board for this date.</p>'
    order, groups = [], {}
    for m in rows:
        key = m.get("event") or "Tennis"
        if key not in groups:
            groups[key] = []
            order.append(key)
        groups[key].append(m)
    out = []
    for key in order:
        lst = groups[key]
        surf = lst[0].get("surface") or ""
        out.append('<div class="tn-event"><h3>%s<em>%d %s%s</em></h3>%s</div>'
                   % (esc(key), len(lst), "match" if len(lst) == 1 else "matches",
                      (" · " + esc(surf)) if surf else "",
                      "".join(match_row(m) for m in lst)))
    return "".join(out)


def featured_html(slate):
    """The marquee match as static HTML: the two players facing each other with
    the context, the price and the season line. The script replaces it with the
    full research module, so this is the version a crawler reads."""
    pool = [m for m in slate.get("matches") or [] if m.get("market") and not m.get("completed")]
    if not pool:
        pool = [m for m in slate.get("matches") or [] if not m.get("completed")]
    if not pool:
        pool = slate.get("matches") or []
    if not pool:
        return '<p class="tn-empty">No match on this date to feature.</p>'

    def score(m):
        ranks = [((p.get("card") or {}).get("rank") or 400) for p in m["players"]]
        return min(ranks) * 2 + max(ranks) - (60 if m.get("major") else 0)

    m = sorted(pool, key=score)[0]
    surf = str(m.get("surface") or "")
    pills = ['<span class="tn-pill %s">%s</span>' % (esc(surf.lower()), esc(surf or "Surface unlisted")),
             '<span class="tn-pill">%s</span>' % esc(str(m.get("tour") or "").upper()),
             '<span class="tn-pill">%s</span>' % esc(m.get("event") or ""),
             '<span class="tn-pill">%s</span>' % esc(m.get("round") or "")]
    if m.get("major"):
        pills.append('<span class="tn-pill major">Major</span>')
    elif m.get("tier"):
        pills.append('<span class="tn-pill">%s</span>' % esc(m["tier"]))
    if m.get("best_of"):
        pills.append('<span class="tn-pill">Best of %s</span>' % esc(m["best_of"]))
    if m.get("venue"):
        pills.append('<span class="tn-pill">%s</span>' % esc(m["venue"]))
    if m.get("court"):
        pills.append('<span class="tn-pill">%s</span>' % esc(m["court"]))
    if m.get("start_utc") and not m.get("completed"):
        pills.append('<span class="tn-pill time">%s</span>' % esc(et_clock(m["start_utc"])))

    def side(i):
        p = m["players"][i]
        c = p.get("card") or {}
        ml = (m.get("market") or {}).get("moneyline") or {}
        price = american(ml.get("a") if i == 0 else ml.get("b")) if ml else ""
        novig = ml.get("noVigPctA") if i == 0 else ml.get("noVigPctB")
        bits = []
        if c.get("rank"):
            bits.append("<b>%s No. %s</b>" % (esc(str(c.get("tour") or m.get("tour") or "").upper()),
                                              esc(c["rank"])))
        if c.get("rank_points") is not None:
            bits.append("%s pts" % esc(c["rank_points"]))
        if p.get("country"):
            bits.append(esc(p["country"]))
        if c.get("record"):
            bits.append("<b>%s</b> in 2026" % esc(record(c["record"])))
        if c.get("surface_record"):
            bits.append("%s on %s" % (esc(record(c["surface_record"])), esc(surf.lower())))
        price_html = ('<div class="tn-vs-price">%s%s</div>'
                      % (esc(price),
                         ('<small>%.1f%% to win, vig removed</small>' % novig)
                         if novig is not None else "")) if price else ""
        name = '<h3 class="tn-vs-name">%s%s%s</h3>' % (
            flag(p.get("flag"), p.get("country")) if i == 0 else "",
            esc(p.get("name")),
            flag(p.get("flag"), p.get("country")) if i == 1 else "")
        return ('<div class="tn-vs-side %s">%s<div class="tn-vs-id">%s'
                '<div class="tn-vs-sub">%s</div>%s</div></div>'
                % ("right" if i else "left", face(p.get("name"), c.get("headshot")),
                   name, '<span style="opacity:.45">|</span>'.join(bits), price_html))

    mid = ('<div class="tn-vs-mid"><span class="vs">VS</span>'
           '<span class="when">%s<em>%s</em></span></div>'
           % (esc(m.get("result") or et_clock(m.get("start_utc") or "")),
              esc("Final" if m.get("completed") else (m.get("round") or ""))))
    return ('<div class="tn-research is-featured"><div class="tn-ctx">%s</div>'
            '<div class="tn-vs">%s%s%s</div></div>'
            % ("".join(pills), side(0), mid, side(1)))


def rankings_html(tour="atp"):
    """The tab the page opens on when a reader asks for rankings. Baked for the
    ATP because that is the select's default; the script re-reads either tour."""
    d = get_json("/tennis/rankings?limit=100&tour=%s" % tour)
    if not d.get("ok") or not d.get("rows"):
        return '<p class="tn-empty">No rankings returned.</p>'
    out = ['<table class="tn-table"><thead><tr><th>#</th><th>Move</th><th>Player</th>'
           '<th>Points</th><th>2026</th><th>Hard</th><th>Clay</th><th>Grass</th>'
           '<th>Titles</th></tr></thead><tbody>']
    for r in d["rows"]:
        move = r.get("move")
        mv = ("Same" if not move else
              ('<span class="tn-up">&#9650; %d</span>' % move if move > 0
               else '<span class="tn-down">&#9660; %d</span>' % abs(move)))
        s3 = r.get("surfaces") or {}

        def cell(k):
            v = s3.get(k)
            return "%d-%d" % (v["wins"], v["losses"]) if v else ""

        out.append('<tr><td><b>%s</b></td><td>%s</td><td>%s<b>%s</b></td><td><b>%s</b></td>'
                   '<td><b>%s</b></td><td>%s</td><td>%s</td><td>%s</td><td>%s</td></tr>'
                   % (esc(r.get("rank")), mv,
                      ('<img src="%s" alt="" style="width:20px;height:13px;object-fit:cover;'
                       'border-radius:2px;vertical-align:middle;margin-right:8px">'
                       % esc(r["flag"])) if r.get("flag") else "",
                      esc(r.get("name")),
                      esc(r.get("points") if r.get("points") is not None else ""),
                      esc(record(r.get("record"))), esc(cell("Hard")), esc(cell("Clay")),
                      esc(cell("Grass")),
                      esc(r.get("titles") if r.get("titles") is not None else "")))
    return "".join(out) + "</tbody></table>"


def leaders_html():
    """Match wins, both tours, every surface: the leaderboard the selects open on."""
    d = get_json("/tennis/leaders?limit=25&metric=wins")
    if not d.get("ok") or not d.get("rows"):
        return '<p class="tn-empty">Nobody clears the minimum sample for that split yet.</p>'
    out = ['<table class="tn-table"><thead><tr><th>#</th><th>Player</th><th>Tour</th>'
           '<th>Rank</th><th>Value</th><th>Record</th></tr></thead><tbody>']
    for i, r in enumerate(d["rows"]):
        out.append('<tr><td>%d</td><td>%s<b>%s</b></td><td>%s</td><td>%s</td>'
                   '<td><b>%s</b></td><td>%s</td></tr>'
                   % (i + 1,
                      ('<img src="%s" alt="" style="width:20px;height:13px;object-fit:cover;'
                       'border-radius:2px;vertical-align:middle;margin-right:8px">'
                       % esc(r["flag"])) if r.get("flag") else "",
                      esc(r.get("name")), esc(str(r.get("tour") or "").upper()),
                      ("No. %s" % esc(r["rank"])) if r.get("rank") is not None else "",
                      esc(r.get("display")), esc(r.get("record"))))
    return "".join(out) + "</tbody></table>"


def replace_marker(text, mark, inner):
    begin, end = "<!--MK:%s-->" % mark, "<!--/MK:%s-->" % mark
    pat = re.compile(re.escape(begin) + ".*?" + re.escape(end), re.S)
    if not pat.search(text):
        raise RuntimeError("marker %s is missing from %s" % (mark, PAGE))
    return pat.sub(lambda _: begin + inner + end, text, count=1)


def next_day(iso):
    d = datetime.datetime.strptime(iso, "%Y-%m-%d") + datetime.timedelta(days=1)
    return d.strftime("%Y-%m-%d")


def main():
    day = sys.argv[1] if len(sys.argv) > 1 else datetime.datetime.utcnow().strftime("%Y-%m-%d")
    slate = get_json("/tennis/slate?date=%s" % day)
    # THE SAME ROLL FORWARD THE PAGE DOES. Late in the evening every match on
    # today's card has finished, and a board of finals is not what a reader
    # arriving at midnight came for.
    playable = [m for m in slate.get("matches") or [] if m.get("market") and not m.get("completed")]
    if not playable and len(sys.argv) <= 1:
        day = next_day(day)
        slate = get_json("/tennis/slate?date=%s" % day)
    if not slate.get("ok"):
        raise RuntimeError("the tennis slate did not answer ok")

    text = io.open(PAGE, encoding="utf-8").read()
    text = replace_marker(text, FEATURED_MARK, featured_html(slate))
    text = replace_marker(text, BOARD_MARK, board_html(slate))
    text = replace_marker(text, RANKINGS_MARK, rankings_html())
    text = replace_marker(text, LEADERS_MARK, leaders_html())
    io.open(PAGE, "w", encoding="utf-8", newline="\n").write(text)
    print("tennis board baked for %s: %d matches" % (day, len(slate.get("matches") or [])))


if __name__ == "__main__":
    main()
