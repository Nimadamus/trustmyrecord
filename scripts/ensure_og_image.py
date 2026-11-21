#!/usr/bin/env python3
"""Give every page that has Open Graph tags but no og:image the site share card.

A page with og:title and no og:image unfurls as bare text when its link is
shared. 740 sitemap pages were in that state on 2026-11-20 (615 of them under
/handicapping/). This inserts the default 1200x630 card right after the page's
og:url (or og:title) tag, keeping the tag's own indentation and line ending.

It only ever ADDS the three image tags. It never touches a page that already
names an image, a title, description, canonical or robots tag, and it skips
redirect stubs and noindex pages.

    python scripts/ensure_og_image.py            # fix in place, print the count
    python scripts/ensure_og_image.py --check    # exit 1 if any page is missing one
"""
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMAGE = 'https://trustmyrecord.com/static/og/og-home.png'
SKIP_DIRS = {'.git', 'node_modules', 'scripts', 'tests', 'docs', 'workers', 'test-results', 'static'}
ANCHOR = re.compile(r'^([ \t]*)<meta property="og:url"[^>]*>[ \t]*(\r?\n)', re.M)
ANCHOR_TITLE = re.compile(r'^([ \t]*)<meta property="og:title"[^>]*>[ \t]*(\r?\n)', re.M)


def patch(text):
    head_end = text.find('</head>')
    head = text[:head_end] if head_end != -1 else text[:20000]
    if 'og:title' not in head or 'og:image' in head:
        return None
    if 'http-equiv="refresh"' in head or re.search(r'<meta name="robots" content="[^"]*noindex', head):
        return None
    m = ANCHOR.search(head) or ANCHOR_TITLE.search(head)
    if not m:
        return None
    indent, nl = m.group(1), m.group(2)
    block = ''.join(indent + line + nl for line in (
        '<meta property="og:image" content="%s">' % IMAGE,
        '<meta property="og:image:width" content="1200">',
        '<meta property="og:image:height" content="630">',
    ))
    return text[:m.end()] + block + text[m.end():]


def main():
    check = '--check' in sys.argv
    changed = []
    for base, dirs, files in os.walk(ROOT):
        if base == ROOT:
            dirs[:] = [d for d in dirs if d not in SKIP_DIRS and not d.startswith(('_', '.'))]
        for name in files:
            if not name.endswith('.html'):
                continue
            path = os.path.join(base, name)
            with open(path, 'rb') as fh:
                raw = fh.read()
            try:
                text = raw.decode('utf-8')
            except UnicodeDecodeError:
                continue
            new = patch(text)
            if new is None:
                continue
            changed.append(os.path.relpath(path, ROOT).replace(os.sep, '/'))
            if not check:
                with open(path, 'wb') as fh:
                    fh.write(new.encode('utf-8'))
    print('%d page(s) %s an og:image' % (len(changed), 'are missing' if check else 'were given'))
    for rel in changed[:15]:
        print('  ' + rel)
    return 1 if (check and changed) else 0


if __name__ == '__main__':
    sys.exit(main())
