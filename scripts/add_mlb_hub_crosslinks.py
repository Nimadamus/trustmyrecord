#!/usr/bin/env python3
"""
add_mlb_hub_crosslinks.py - crawlable in-content links into the MLB research hub.

WHY THIS EXISTS
Audited 2026-08-23, the same audit that found /handicapping/mlb/ had no server
rendered content. Every MLB surface on TrustMyRecord behaved like a separate
product: the simulator did not link the research hub, the research hub did not
link the season simulator, the Game Files did not link either, and the Tools Hub
listed them as unrelated tiles. The ONLY sitewide route into the MLB hub was the
nav dropdown, which tmr-ds-nav.js injects with JavaScript and a crawler that does
not execute JS never sees.

These are contextual links inside the content of topically related pages, which
is the kind Google weights. Anchor text differs on every page on purpose: eleven
identical anchors reads as boilerplate, and boilerplate is discounted.

Same mechanics as add_gamefile_crosslinks.py, which this is modelled on:
idempotent through <!--MK:--> markers, preserves each file's existing line
endings, and touches nothing outside its own marker.

    python scripts/add_mlb_hub_crosslinks.py
    python scripts/add_mlb_hub_crosslinks.py --check
"""
import io
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KEY = "mlbHubCrossLink"
BEGIN, END = "<!--MK:%s-->" % KEY, "<!--/MK:%s-->" % KEY

WRAP = ('class="tmr-mlbx" style="margin:26px 0 0;padding:14px 0 0;'
        'border-top:1px solid rgba(255,255,255,.09);font-size:14px;line-height:1.6;color:#8FA6BC"')
LINK = 'style="color:#22D2C0;font-weight:700;text-decoration:none"'

HUB = "/handicapping/mlb/"

# (path, sentence). %s is the link style. Anchor text is different every time.
TARGETS = [
    ("mlb-simulator/index.html",
     'Before you simulate, check what the game actually looks like: '
     '<a href="/handicapping/mlb/" %s>today\'s MLB matchups with odds, probable pitchers and '
     'verified trends</a>, one research page per game.'),

    ("mlb-season-simulator/index.html",
     'Simulating the rest of the season is one view. For tonight, the '
     '<a href="/handicapping/mlb/" %s>MLB daily research hub</a> carries every game on the board '
     'with the starters, both records and the current lines.'),

    ("mlb-game-simulator/index.html",
     'Want the inputs rather than the output? '
     '<a href="/handicapping/mlb/" %s>MLB matchups today</a> lists every game with its probable '
     'pitchers, team form and betting lines.'),

    ("mlb-predictions-simulator/index.html",
     'The research behind each of these games lives on '
     '<a href="/handicapping/mlb/" %s>today\'s MLB slate</a>, with a permanent page per matchup.'),

    ("mlb-playoff-simulator/index.html",
     'For the games being played right now rather than the bracket, see '
     '<a href="/handicapping/mlb/" %s>MLB matchups today</a>.'),

    ("matchups/mlb/index.html",
     'A Game File takes one game apart. For the whole board, '
     '<a href="/handicapping/mlb/" %s>today\'s MLB matchups</a> gives every game its own research '
     'page with odds, starters, team form and verified trends.'),

    ("matchup-of-the-day/index.html",
     'We write one of these a day. Every other game on the slate still has a full research page: '
     '<a href="/handicapping/mlb/" %s>MLB matchups today, with odds and probable pitchers</a>.'),

    ("trendspotter/index.html",
     'Trends read better next to the rest of the picture. '
     '<a href="/handicapping/mlb/" %s>Today\'s MLB matchups</a> put each one beside that game\'s '
     'starters, lines and team form, and '
     '<a href="/handicapping/mlb/trends/" %s>every verified MLB trend on today\'s board</a> is '
     'listed with its sample.'),

    ("betlegend-pro/index.html",
     'The free daily version of this research is the '
     '<a href="/handicapping/mlb/" %s>MLB matchup hub</a>: every game today with pitchers, lines, '
     'form and trends already assembled.'),

    ("mlb-handicappers/index.html",
     'Researching a game yourself? '
     '<a href="/handicapping/mlb/" %s>MLB matchups today</a> has the probable pitchers, the odds '
     'and the verified trends for every game on the board.'),

    ("mlb-pick-tracker/index.html",
     'Before you log a pick, read the game: '
     '<a href="/handicapping/mlb/" %s>today\'s MLB matchups with odds, starters and team form</a>.'),

    ("tools/index.html",
     'Daily MLB research starts at the '
     '<a href="/handicapping/mlb/" %s>MLB matchup hub</a>, where every game on today\'s board has '
     'its own page with odds, probable pitchers, team stats and verified trends.'),

    ("today/index.html",
     'Playing MLB tonight? '
     '<a href="/handicapping/mlb/" %s>Today\'s MLB matchups</a> lists the whole board with the '
     'probable pitchers and the current lines.'),

    ("handicapping/index.html",
     'The MLB hub is the one that is fully built: '
     '<a href="/handicapping/mlb/" %s>MLB matchups today, with odds, probable pitchers, team stats '
     'and verified trends</a>, plus a permanent research page for every game.'),
]


def block(sentence):
    n = sentence.count("%s")
    return '%s\n  <p %s>%s</p>\n  %s' % (BEGIN, WRAP, sentence % ((LINK,) * n), END)


def run(check=False):
    changed, missing, already = [], [], []
    for rel, sentence in TARGETS:
        path = os.path.join(ROOT, rel)
        if not os.path.isfile(path):
            missing.append(rel)
            continue
        # NO NORMALISATION. Six of these pages are MIXED, 137 CRLF lines and one
        # bare LF (mlb-game-simulator/index.html among them). Reading the file,
        # collapsing to LF and writing back the dominant ending rewrites that one
        # innocent line, which shows up in review as an unexplained whitespace
        # change on a page this task had no business touching. So the raw text is
        # never translated: the only bytes that move are the ones between the
        # markers, and the block is emitted with whichever ending the insertion
        # point itself uses.
        text = io.open(path, encoding="utf-8", newline="").read()
        i_main = text.rfind("</main>")
        nl = "\r\n" if text[:i_main if i_main > 0 else len(text)].endswith("\r\n") \
            else ("\r\n" if "\r\n" in text else "\n")
        new = block(sentence).replace("\n", nl)

        if BEGIN in text and END in text:
            head, rest = text.split(BEGIN, 1)
            _, tail = rest.split(END, 1)
            out = head + new + tail
        else:
            if i_main < 0:
                missing.append(rel + " (no </main>)")
                continue
            # Insert before the START of the </main> line, reusing its own
            # indentation, so the closing tag keeps the column it already had.
            # Splicing directly in front of the tag instead re-indents that line
            # and turns a pure three line addition into "+4 -1" in review.
            line_start = text.rfind("\n", 0, i_main) + 1
            indent = text[line_start:i_main]
            out = text[:line_start] + indent + new + nl + text[line_start:]

        if out != text:
            changed.append(rel)
            if not check:
                io.open(path, "w", encoding="utf-8", newline="").write(out)
        else:
            already.append(rel)

    for rel in missing:
        print("  SKIP  %s" % rel)
    for rel in already:
        print("  ok    %s" % rel)
    for rel in changed:
        print("  %s  %s" % ("would update" if check else "updated", rel))
    if check and changed:
        return 1
    if not changed:
        print("  every MLB cross-link is already in place.")
    if not check:
        # Last generator before the MLB workflow's gates and commit step: land on
        # the latest main now so the push that follows is a fast-forward
        # (CI_SYNC_MAIN_20260902, see scripts/ci_sync_main.py). No-op locally.
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        from ci_sync_main import sync_to_origin_main
        sync_to_origin_main("MLB bake")
    return 0


if __name__ == "__main__":
    sys.exit(run(check="--check" in sys.argv))
