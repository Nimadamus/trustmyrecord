"""refresh_nhl_sim_pages.py -- keep the NHL matchup and team pages on current data.

The 30 matchup pages and 32 team pages are written by build_sim_matchup_pages.js
and build_sim_team_pages.js from the backend engine. Those generators still emit
the August page shell (old stylesheet set, no shared navbar), and the live pages
have since gained the navbar, the Watchdog line and the MK blocks the daily bake
owns. So the generators are run, and only what they own is taken from them:

  matchup pages: <main>, the numbers-bearing first half of the SEO section
                 (up to the MK:leagueSimMatchup block) and the description metas;
  team pages:    <main> (with the live MK:leagueSimTeam block put back), the
                 description metas and the JSON-LD.

Everything else is the committed page. Titles and canonicals must be unchanged or
the page is left alone. The base for each page is HEAD, so run this after the
generators and before committing.

  python scripts/refresh_nhl_sim_pages.py
"""
import glob
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TEAM_MK_OPEN, TEAM_MK_CLOSE = '  <!--MK:leagueSimTeam-->', '  <!--/MK:leagueSimTeam-->'
LINEUP = '  <section class="panel">\n    <h2>The lineup the simulator dresses</h2>'
DESC = [r'<meta name="description" content="[^"]*"', r'<meta property="og:description" content="[^"]*"',
        r'<meta name="twitter:description" content="[^"]*"']
LDJSON = r'<script type="application/ld\+json">.*?</script>'


def committed(rel):
    out = subprocess.run(['git', '-C', ROOT, 'show', 'HEAD:' + rel], capture_output=True)
    return out.stdout.decode('utf8') if out.returncode == 0 else None


def span(s, a, b, include_b=False):
    i = s.index(a)
    j = s.index(b, i)
    return i, (j + len(b) if include_b else j)


def swap_desc(new, gen):
    for pat in DESC:
        m_new, m_gen = re.search(pat, new), re.search(pat, gen)
        if m_new and m_gen:
            new = new.replace(m_new.group(0), m_gen.group(0))
    return new


def head_identity(s):
    return (re.search(r'<title>.*?</title>', s, re.S).group(0), re.findall(r'rel="canonical"[^>]*>', s))


def matchup(live, gen):
    li, lj = span(live, '<main class="wrap">', '</main>')
    gi, gj = span(gen, '<main class="wrap">', '</main>')
    new = live[:li] + gen[gi:gj] + live[lj:]
    li, lj = span(new, '<section class="seo"', '  <!--MK:leagueSimMatchup-->')
    gi, gj = span(gen, '<section class="seo"', '  <hr class="divider" />')
    new = new[:li] + gen[gi:gj] + new[lj:]
    new = swap_desc(new, gen)
    m_new = re.search(r'("@type":"WebPage".*?"description":")([^"]*)"', new)
    m_gen = re.search(r'"@type":"WebPage".*?"description":"([^"]*)"', gen)
    if m_new and m_gen:
        new = new.replace(m_new.group(1) + m_new.group(2) + '"', m_new.group(1) + m_gen.group(1) + '"')
    return new


def team(live, gen):
    mk = ''
    if TEAM_MK_OPEN in live:
        i, j = span(live, TEAM_MK_OPEN, TEAM_MK_CLOSE, include_b=True)
        mk = live[i:j] + '\n'
    gi, gj = span(gen, '<main class="wrap">', '</main>')
    gmain = gen[gi:gj]
    if mk:
        k = gmain.index(LINEUP)
        gmain = gmain[:k] + mk + gmain[k:]
    li, lj = span(live, '<main class="wrap">', '</main>')
    new = live[:li] + gmain + live[lj:]
    new = swap_desc(new, gen)
    a, b = re.findall(LDJSON, new, re.S), re.findall(LDJSON, gen, re.S)
    if len(a) == len(b):
        for x, y in zip(a, b):
            new = new.replace(x, y)
    return new


def main():
    done, skipped = 0, []
    files = [(f, matchup) for f in glob.glob(os.path.join(ROOT, 'nhl-simulator', '*-vs-*', 'index.html'))]
    files += [(f, team) for f in glob.glob(os.path.join(ROOT, 'nhl-simulator', 'teams', '*', 'index.html'))]
    for path, fn in sorted(files):
        rel = os.path.relpath(path, ROOT).replace(os.sep, '/')
        raw = committed(rel)
        if raw is None:
            skipped.append(rel + ' (not committed)')
            continue
        live = raw.replace('\r\n', '\n')
        gen = open(path, encoding='utf8').read().replace('\r\n', '\n')
        try:
            new = fn(live, gen)
            if head_identity(new) != head_identity(live):
                raise ValueError('title or canonical would change')
            done += 1
        except Exception as e:  # leave the committed page exactly as it was
            skipped.append(rel + ' (' + str(e) + ')')
            new = live
        if '\r\n' in raw:
            new = new.replace('\n', '\r\n')
        with open(path, 'w', encoding='utf8', newline='') as f:
            f.write(new)
    print('refreshed %d NHL pages, kept %d as committed' % (done, len(skipped)))
    for s in skipped:
        print('  kept:', s)
    return 1 if files and not done else 0


if __name__ == '__main__':
    sys.exit(main())
