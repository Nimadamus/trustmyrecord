#!/usr/bin/env python3
"""
One-time editor: drops the Simulation Archive panel onto each simulator page.

WHAT IT ADDS, AND NOTHING ELSE

  - two <link>/<script> tags in the head (the archive's own stylesheet and
    component library, both query-versioned so they are never a new hashed
    filename Cloudflare could cache a 404 for)
  - one container element, placed directly BELOW the simulator's own output
    and ABOVE the page's long-form prose

WHAT IT DOES NOT TOUCH

  The simulator itself. No engine file, no app script, no existing markup,
  no existing style. The panel renders into its own container and every
  request it makes is failure-tolerant, so a page with the panel behaves
  exactly as it did without it if the archive is unreachable.

Idempotent: running it twice changes nothing the second time.
"""

import io
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSET_V = '20260827a'

HEAD_TAGS = (
    '<link rel="stylesheet" href="/static/css/tmr-sim-archive.css?v={v}">\n'
    '<script defer src="/static/js/tmr-sim-archive.js?v={v}"></script>\n'
).format(v=ASSET_V)

MARKER = 'data-sa="panel"'


def panel_html(sport, indent='', force_dark=False):
    classes = ' sa-force-dark' if force_dark else ''
    return (
        '{i}<!-- SIM_ARCHIVE_20260827: the simulation archive for this sport. Additive,\n'
        '{i}     rendered by static/js/tmr-sim-archive.js into this container only. It sits\n'
        '{i}     BELOW the simulator so the tool is never buried under analytics, and it\n'
        '{i}     never touches the simulator\'s own DOM, state or rendering path. -->\n'
        '{i}<div class="sa-root sa-embed{c}" data-sa="panel" data-sport="{s}"></div>\n'
    ).format(i=indent, c=classes, s=sport)


TARGETS = [
    # (file, sport, anchor regex, where, indent, force_dark)
    ('nba-simulator/index.html', 'nba', r'(?m)^</main>\n', 'after', '', False),
    ('nhl-simulator/index.html', 'nhl', r'(?m)^</main>\n', 'after', '', False),
    ('nfl-simulator/index.html', 'nfl', r'(?m)^</main>\n', 'after', '', False),
    # The MLB page's simulator workspace closes before the contest section; the
    # panel goes straight after it, which is directly under the box score.
    ('mlb-simulator/index.html', 'mlb',
     r'(?m)^        <section id="simv2Contest"', 'before', '        ', True),
]


def add_head_tags(text):
    if '/static/css/tmr-sim-archive.css' in text:
        return text, False
    idx = text.find('</head>')
    if idx == -1:
        raise SystemExit('no </head>')
    return text[:idx] + HEAD_TAGS + text[idx:], True


def add_panel(text, sport, anchor, where, indent, force_dark):
    if MARKER in text:
        return text, False
    m = re.search(anchor, text)
    if not m:
        raise SystemExit('anchor not found: ' + anchor)
    block = panel_html(sport, indent, force_dark)
    if where == 'after':
        pos = m.end()
    else:
        pos = m.start()
    return text[:pos] + block + text[pos:], True


def main():
    changed = []
    for rel, sport, anchor, where, indent, force_dark in TARGETS:
        path = os.path.join(ROOT, rel)
        raw = open(path, 'rb').read()
        # PRESERVE THE FILE'S OWN LINE ENDINGS. Writing LF back into a CRLF file
        # rewrites every line in the diff, which buries a three-line addition in a
        # two-thousand-line change and makes the edit impossible to review.
        crlf = raw.count(b'\r\n') > 0
        text = raw.decode('utf-8').replace('\r\n', '\n')
        text, a = add_head_tags(text)
        text, b = add_panel(text, sport, anchor, where, indent, force_dark)
        if a or b:
            out = text.replace('\n', '\r\n') if crlf else text
            open(path, 'wb').write(out.encode('utf-8'))
            changed.append(rel)
        else:
            print('  unchanged (already present): ' + rel)
    for c in changed:
        print('  updated: ' + c)
    print('%d file(s) updated' % len(changed))


if __name__ == '__main__':
    main()
