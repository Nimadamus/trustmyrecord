#!/usr/bin/env python3
"""
add_gamefile_crosslinks.py - crawlable in-content links to the Game File hub.

WHY THIS EXISTS
Audited 2026-08-10: NOT ONE page on trustmyrecord.com linked to /matchups/ in
server-rendered HTML. The footer "TMR Game Files" entry is injected by
tmr-ds-nav.js and the featured ticker card is injected by tmr-home-live.js, so
both are invisible to a crawler that does not execute JavaScript - and the
ticker card additionally only exists while its game is on the slate. The hubs
themselves link the article correctly, but nothing linked the hubs. The whole
Game File section was reachable only from sitemap.xml, which Google treats as a
discretionary hint rather than an endorsement.

These are contextual links on topically-related pages, which is the kind Google
weights most heavily. Anchor text is varied deliberately: four identical anchors
across four pages reads as boilerplate.

Idempotent (marker-wrapped), preserves each file's existing line endings, and
touches nothing outside the marker.

    python scripts/add_gamefile_crosslinks.py [--check]
"""
import io, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KEY = "gfCrossLink"
BEGIN, END = "<!--MK:%s-->" % KEY, "<!--/MK:%s-->" % KEY

WRAP = ('style="margin:26px 0 0;padding:14px 0 0;border-top:1px solid rgba(255,255,255,.09);'
        'font-size:14px;line-height:1.55;color:#8FA6BC"')
LINK = 'style="color:#22D2C0;font-weight:700;text-decoration:none"'

# (path, sentence). Anchor text differs per page on purpose.
TARGETS = [
    ("today/index.html",
     'Researching tonight&rsquo;s card? Read the '
     '<a href="/matchups/" %s>TMR Game File</a> &mdash; one matchup a day taken apart in full, '
     'with every number sourced.'),
    ("handicapping/mlb/index.html",
     'For a deeper read on one game from this slate, see our '
     '<a href="/matchups/mlb/" %s>MLB matchup analysis and Game Files</a>.'),
    ("mlb-simulator/index.html",
     'Want the research behind a matchup as well as the simulation? Our '
     '<a href="/matchups/mlb/" %s>daily MLB Game File</a> covers starters, bullpens, '
     'handedness splits and head-to-head history.'),
    ("trendspotter/index.html",
     'Trends from this tool feed our '
     '<a href="/matchups/" %s>daily TMR Game File</a>, where they are reported with their '
     'sample size beside them.'),
]


def block(sentence):
    return '%s\n  <p class="tmr-gfx" %s>%s</p>\n  %s' % (BEGIN, WRAP, sentence % LINK, END)


def run(check=False):
    changed, missing = [], []
    for rel, sentence in TARGETS:
        path = os.path.join(ROOT, rel)
        if not os.path.isfile(path):
            missing.append(rel)
            continue
        raw = io.open(path, encoding="utf-8", newline="").read()
        nl = "\r\n" if "\r\n" in raw else "\n"
        text = raw.replace("\r\n", "\n")
        new = block(sentence)

        if BEGIN in text:
            head, rest = text.split(BEGIN, 1)
            _, tail = rest.split(END, 1)
            out = head + new + tail
        else:
            if "</main>" not in text:
                missing.append(rel + " (no </main>)")
                continue
            i = text.rindex("</main>")
            out = text[:i] + "  " + new + "\n" + text[i:]

        if out != text:
            changed.append(rel)
            if not check:
                io.open(path, "w", encoding="utf-8", newline="").write(out.replace("\n", nl))

    for rel in missing:
        print("  SKIP  %s" % rel)
    for rel in changed:
        print("  %s  %s" % ("would update" if check else "updated", rel))
    if not changed:
        print("  all %d cross-links already in place" % len(TARGETS))
    return 1 if (check and changed) else 0


if __name__ == "__main__":
    sys.exit(run(check="--check" in sys.argv))
