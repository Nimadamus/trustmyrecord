#!/usr/bin/env python3
"""
One-time editor: gives each simulator page a real HTML link to its archive hub.

WHY THIS IS SEPARATE FROM THE PANEL

The archive panel on a simulator page is rendered by JavaScript, so its
"Open the full archive" link does not exist in the served HTML. A crawler
therefore never reaches /<sport>-simulator/results/ and the whole archive is
orphaned no matter how good it is. This adds ONE static anchor per simulator
page, in the block that page already uses for related tools.

Preserves each file's own line endings. Idempotent.
"""

import io
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MARKER = '-simulator/results/"'

GRID_LINK = ('    <a href="/{s}-simulator/results/">{n} Simulation Results'
             '<small>Archived box scores and matchup aggregates</small></a>\n')

TARGETS = [
    # (file, sport, league label, anchor regex for the related-tools grid)
    ('nba-simulator/index.html', 'nba', 'NBA', r'(?m)^  <div class="linkgrid">\n'),
    ('nhl-simulator/index.html', 'nhl', 'NHL', r'(?m)^  <div class="linkgrid">\n'),
    ('nfl-simulator/index.html', 'nfl', 'NFL', r'(?m)^  <div class="linkgrid">\n'),
]

MLB_ANCHOR = '<!--/MK:mlbHubCrossLink-->'
MLB_BLOCK = (
    '\n<!-- SIM_ARCHIVE_20260827: a crawlable link to the archive. The panel above\n'
    '     is rendered by JavaScript, so without this anchor the archive pages are\n'
    '     orphaned in the served HTML. -->\n'
    '  <p class="tmr-simarchive" style="margin:26px 0 0;padding:14px 0 0;'
    'border-top:1px solid rgba(255,255,255,.09);font-size:14px;line-height:1.6;color:#8FA6BC">'
    'Every simulation run here is kept: browse the '
    '<a href="/mlb-simulator/results/" style="color:#22D2C0;font-weight:700;text-decoration:none">'
    'MLB simulation results archive</a> for full box scores and matchup aggregates.</p>'
)


def main():
    changed = []
    for rel, sport, league, anchor in TARGETS:
        path = os.path.join(ROOT, rel)
        raw = open(path, 'rb').read()
        crlf = raw.count(b'\r\n') > 0
        text = raw.decode('utf-8').replace('\r\n', '\n')
        if MARKER in text:
            print('  unchanged (already linked): ' + rel)
            continue
        m = re.search(anchor, text)
        if not m:
            raise SystemExit('anchor not found in ' + rel)
        text = text[:m.end()] + GRID_LINK.format(s=sport, n=league) + text[m.end():]
        out = text.replace('\n', '\r\n') if crlf else text
        open(path, 'wb').write(out.encode('utf-8'))
        changed.append(rel)

    path = os.path.join(ROOT, 'mlb-simulator/index.html')
    raw = open(path, 'rb').read()
    crlf = raw.count(b'\r\n') > 0
    text = raw.decode('utf-8').replace('\r\n', '\n')
    if MARKER in text:
        print('  unchanged (already linked): mlb-simulator/index.html')
    else:
        if MLB_ANCHOR not in text:
            raise SystemExit('anchor not found in mlb-simulator/index.html')
        text = text.replace(MLB_ANCHOR, MLB_ANCHOR + MLB_BLOCK, 1)
        out = text.replace('\n', '\r\n') if crlf else text
        open(path, 'wb').write(out.encode('utf-8'))
        changed.append('mlb-simulator/index.html')

    for c in changed:
        print('  updated: ' + c)
    print('%d file(s) updated' % len(changed))


if __name__ == '__main__':
    main()
