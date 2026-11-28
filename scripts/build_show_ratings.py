"""Build MLB The Show 26 Live Series ratings pages from static/data/show26-ratings.json.
/mlb-the-show-ratings/ (hub) + /mlb-the-show-ratings/<team>/ (30 team pages).
Data comes from the public mlb26.theshow.com items API via the laptop job (tools/theshow_ratings)."""
import html, json, os, re, statistics, datetime
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, 'static', 'data', 'show26-ratings.json')
OUT = os.path.join(ROOT, 'mlb-the-show-ratings')
BASE = 'https://trustmyrecord.com/mlb-the-show-ratings/'
TEAMS = {'ARI': ('Arizona Diamondbacks', 'diamondbacks'), 'OAK': ('Athletics', 'athletics'), 'ATL': ('Atlanta Braves', 'braves'),
 'BAL': ('Baltimore Orioles', 'orioles'), 'BOS': ('Boston Red Sox', 'red-sox'), 'CHC': ('Chicago Cubs', 'cubs'), 'CWS': ('Chicago White Sox', 'white-sox'),
 'CIN': ('Cincinnati Reds', 'reds'), 'CLE': ('Cleveland Guardians', 'guardians'), 'COL': ('Colorado Rockies', 'rockies'), 'DET': ('Detroit Tigers', 'tigers'),
 'HOU': ('Houston Astros', 'astros'), 'KC': ('Kansas City Royals', 'royals'), 'LAA': ('Los Angeles Angels', 'angels'), 'LAD': ('Los Angeles Dodgers', 'dodgers'),
 'MIA': ('Miami Marlins', 'marlins'), 'MIL': ('Milwaukee Brewers', 'brewers'), 'MIN': ('Minnesota Twins', 'twins'), 'NYM': ('New York Mets', 'mets'),
 'NYY': ('New York Yankees', 'yankees'), 'PHI': ('Philadelphia Phillies', 'phillies'), 'PIT': ('Pittsburgh Pirates', 'pirates'), 'SD': ('San Diego Padres', 'padres'),
 'SF': ('San Francisco Giants', 'giants'), 'SEA': ('Seattle Mariners', 'mariners'), 'STL': ('St. Louis Cardinals', 'cardinals'), 'TB': ('Tampa Bay Rays', 'rays'),
 'TEX': ('Texas Rangers', 'rangers'), 'TOR': ('Toronto Blue Jays', 'blue-jays'), 'WAS': ('Washington Nationals', 'nationals')}
E = html.escape
SHELL = None


def shell_parts():
    s = open(os.path.join(ROOT, 'mlb-the-show-stat-league', 'index.html'), encoding='utf-8').read()
    boot = re.search(r'<!-- TMR_THEME_BOOT -->.*?<!-- /TMR_THEME_BOOT -->', s, re.S).group(0)
    pre = re.search(r'(<script async src="https://www.googletagmanager.com.*?)<style>', s, re.S).group(1)
    style = re.search(r'<style>(.*?)</style>', s, re.S).group(1)
    post = re.search(r'</script>\s*(<link rel="stylesheet" href="/static/css/tmr-linkhub.*?)</head>', s, re.S).group(1)
    body = re.search(r'<body[^>]*>', s).group(0)
    tail = re.search(r'(<script src="/static/js/tmr-session.*?)</body>', s, re.S).group(1)
    return boot, pre, style, post, body, tail


CSS = """
.rt-crumbs{margin-top:22px;font-size:.85rem;color:var(--text-muted)} .rt-crumbs a{color:var(--text-dim)}
.rt-meta{margin-top:14px;color:var(--text-muted);font-size:.86rem;font-weight:600}
.rt-sec{margin-top:40px} .rt-sec h2{font-family:var(--font-display);font-weight:900;font-size:clamp(1.4rem,3vw,1.9rem);margin-bottom:8px}
.rt-sec > p{color:var(--text-dim);line-height:1.65;max-width:820px;margin-bottom:16px}
.rt-card{background:var(--bg-card);border:1px solid var(--border);border-radius:18px;padding:18px}
.rt-scroll{overflow-x:auto;-webkit-overflow-scrolling:touch}
.rt-t{width:100%;border-collapse:collapse;font-size:.9rem;min-width:720px}
.rt-t th{text-align:center;font-family:var(--font-display);font-weight:800;font-size:.74rem;text-transform:uppercase;letter-spacing:.04em;color:var(--text-dim);padding:10px 8px;border-bottom:1px solid var(--border);white-space:nowrap;cursor:pointer;user-select:none}
.rt-t th:first-child,.rt-t td:first-child{text-align:left}
.rt-t td{padding:9px 8px;border-bottom:1px solid var(--border);text-align:center;white-space:nowrap;color:var(--text)}
.rt-t tbody tr:last-child td{border-bottom:none}
.rt-p{display:flex;align-items:center;gap:10px;font-weight:800}
.rt-p img{width:36px;height:36px;border-radius:50%;object-fit:cover;background:var(--bg-surface);flex:none}
.rt-p small{display:block;font-weight:600;color:var(--text-muted);font-size:.74rem}
.ovr{display:inline-block;min-width:38px;padding:4px 7px;border-radius:8px;font-family:var(--font-display);font-weight:900;color:#fff}
.r-d{background:#1C1C1C}.r-g{background:#9A7A12}.r-s{background:#6B7785}.r-b{background:#8A5A2B}.r-c{background:#5E7590}
.hi{color:var(--accent-green);font-weight:800}
.rt-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:10px}
.rt-grid a{display:flex;justify-content:space-between;align-items:center;background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:12px 14px;font-weight:700;color:var(--text)}
.rt-grid a span{font-family:var(--font-display);font-weight:900;color:var(--accent-gold)}
.rt-facts{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:12px}
.rt-fact{background:var(--bg-card);border:1px solid var(--border);border-radius:14px;padding:14px 16px}
.rt-fact b{display:block;font-size:.72rem;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted);margin-bottom:6px}
.rt-fact span{font-weight:800}
.rt-faq details{background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:14px 16px;margin-bottom:10px}
.rt-faq summary{font-weight:800;cursor:pointer} .rt-faq p{margin-top:10px;color:var(--text-dim);line-height:1.6}
.rt-cta{margin-top:44px;text-align:center;background:var(--bg-card);border:1px solid var(--border);border-radius:20px;padding:34px 22px}
.rt-cta h2{font-family:var(--font-display);font-weight:900;font-size:1.6rem} .rt-cta p{color:var(--text-dim);margin:12px auto 20px;max-width:640px;line-height:1.6}
"""
SORT_JS = """<script>
document.querySelectorAll('.rt-t').forEach(function(t){t.querySelectorAll('th').forEach(function(th,i){th.addEventListener('click',function(){
var b=t.tBodies[0],rows=[].slice.call(b.rows),asc=th.dataset.s!=='d';th.dataset.s=asc?'d':'a';
rows.sort(function(x,y){var a=x.cells[i].dataset.v||x.cells[i].textContent,c=y.cells[i].dataset.v||y.cells[i].textContent,na=parseFloat(a),nc=parseFloat(c);
if(!isNaN(na)&&!isNaN(nc))return asc?nc-na:na-nc;return asc?a.localeCompare(c):c.localeCompare(a)});rows.forEach(function(r){b.appendChild(r)})})})});
</script>"""


def rcls(c):
    return {'Diamond': 'r-d', 'Gold': 'r-g', 'Silver': 'r-s', 'Bronze': 'r-b'}.get(c.get('rarity'), 'r-c')


def norm(n):
    return re.sub(r'[^a-z]', '', n.lower().replace('jr.', '').replace('sr.', ''))


def headshots():
    d = json.load(open(os.path.join(ROOT, 'static', 'data', 'show26-players.json'), encoding='latin-1'))
    return {norm(r[0]): r[4] for r in d if r[4]}


def shot(c, H):
    i = H.get(norm(c['name']))
    pid = i if i else 'generic'
    src = 'https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_96,q_auto:best/v1/people/%s/headshot/67/current' % pid
    return '<img src="%s" alt="%s" loading="lazy" width="36" height="36">' % (src, E(c['name']))


def ovr(c):
    return '<span class="ovr %s">%d</span>' % (rcls(c), c['ovr'])


def td(v, hi=85):
    v = v or 0
    return '<td data-v="%d"%s>%d</td>' % (v, ' class="hi"' if v >= hi else '', v)


def pcell(c, H, team=False):
    if team and c['team_short_name'] in TEAMS:
        sub = c['display_position'] + ' · ' + TEAMS[c['team_short_name']][0]
    else:
        sub = '%s · Age %s · B/T %s/%s' % (c['display_position'], c['age'], c['bat_hand'], c['throw_hand'])
    return '<td data-v="%s"><div class="rt-p">%s<div>%s<small>%s</small></div></div></td>' % (E(c['name']), shot(c, H), E(c['name']), E(sub))


HIT_KEYS = ('contact_left', 'contact_right', 'power_left', 'power_right', 'plate_vision', 'plate_discipline', 'batting_clutch', 'speed', 'fielding_ability', 'arm_strength', 'arm_accuracy')
PIT_KEYS = ('stamina', 'hits_per_bf_right', 'k_per_bf_right', 'bb_per_bf', 'hr_per_bf', 'pitching_clutch', 'pitch_velocity', 'pitch_control', 'pitch_movement')


def table(head, rows):
    return '<div class="rt-card rt-scroll"><table class="rt-t"><thead><tr>%s</tr></thead><tbody>%s</tbody></table></div>' % (''.join('<th>%s</th>' % x for x in head), rows)


def hit_table(cards, H, team=False):
    h = ['Player', 'OVR', 'CON L', 'CON R', 'POW L', 'POW R', 'VIS', 'DISC', 'CLU', 'SPD', 'FLD', 'ARM', 'ACC']
    rows = ''.join('<tr>%s<td data-v="%d">%s</td>%s</tr>' % (pcell(c, H, team), c['ovr'], ovr(c), ''.join(td(c.get(k)) for k in HIT_KEYS)) for c in cards)
    return table(h, rows)


def arsenal(c):
    ps = sorted(c.get('pitches') or [], key=lambda p: -(p.get('usage') or 0))[:5]
    return ', '.join('%s %s' % (p['name'], p['speed']) for p in ps)


def pit_table(cards, H, team=False):
    h = ['Pitcher', 'OVR', 'STA', 'H/9', 'K/9', 'BB/9', 'HR/9', 'CLU', 'VELO', 'CTRL', 'BRK', 'Top pitches (mph)']
    rows = ''.join('<tr>%s<td data-v="%d">%s</td>%s<td style="text-align:left;white-space:normal;min-width:220px">%s</td></tr>' % (
        pcell(c, H, team), c['ovr'], ovr(c), ''.join(td(c.get(k)) for k in PIT_KEYS), E(arsenal(c))) for c in cards)
    return table(h, rows)


def page(path, title, desc, h1, crumbs, body, faq, updated):
    boot, pre, style, post, btag, tail = SHELL
    url = BASE + path
    ld = [{'@context': 'https://schema.org', '@type': 'BreadcrumbList', 'itemListElement': [
        {'@type': 'ListItem', 'position': i + 1, 'name': n, 'item': u} for i, (n, u) in enumerate(crumbs)]}]
    if faq:
        ld.append({'@context': 'https://schema.org', '@type': 'FAQPage', 'mainEntity': [
            {'@type': 'Question', 'name': q, 'acceptedAnswer': {'@type': 'Answer', 'text': a}} for q, a in faq]})
    cr = ' › '.join('<a href="%s">%s</a>' % (u.replace('https://trustmyrecord.com', ''), E(n)) for n, u in crumbs[:-1]) + ' › ' + E(crumbs[-1][0])
    fq = ('<section class="rt-sec rt-faq"><h2>Questions</h2>%s</section>' % ''.join(
        '<details><summary>%s</summary><p>%s</p></details>' % (E(q), E(a)) for q, a in faq)) if faq else ''
    lds = '\n'.join('<script type="application/ld+json">%s</script>' % json.dumps(x) for x in ld)
    doc = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">{boot}
    <link rel="canonical" href="{url}">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{E(title)}</title>
    <meta name="description" content="{E(desc)}">
    <meta property="og:title" content="{E(title)}">
    <meta property="og:description" content="{E(desc)}">
    <meta property="og:type" content="website">
    <meta property="og:url" content="{url}">
    <meta property="og:image" content="https://trustmyrecord.com/static/og/og-home.png">
    {pre}<style>{style}{CSS}</style>
{lds}
{post}
</head>
{btag}
<main class="sl-wrap">
<nav class="rt-crumbs" aria-label="Breadcrumb">{cr}</nav>
<section class="sl-hero" style="margin-top:14px">
<span class="sl-kicker"><i class="fas fa-baseball-bat-ball"></i> MLB The Show 26 · Live Series</span>
<h1>{h1}</h1>
<p class="rt-meta">Ratings updated {updated} from the MLB The Show 26 Live Series roster.</p>
</section>
{body}
{fq}
<section class="rt-cta"><h2>Track your MLB The Show 26 record</h2><p>Link your PlayStation or Xbox username and every online game you play posts to your TrustMyRecord profile automatically, with the full box score. Free, nothing to upload.</p>
<a class="btn btn-gold" href="/online-gaming/#autotrack"><i class="fas fa-bolt"></i> Start auto tracking</a> <a class="btn btn-outline" href="/mlb-the-show-stat-league/">MLB The Show Stat League</a></section>
</main>
{SORT_JS}
{tail}</body>
</html>
"""
    d = os.path.join(OUT, path)
    os.makedirs(d, exist_ok=True)
    open(os.path.join(d, 'index.html'), 'w', encoding='utf-8', newline='\n').write(doc)


def main():
    global SHELL
    SHELL = shell_parts()
    H = headshots()
    raw = json.load(open(DATA, encoding='utf-8'))
    dt = datetime.datetime.strptime(raw['fetched'][:10], '%Y-%m-%d')
    updated = '%s %d, %d' % (dt.strftime('%B'), dt.day, dt.year)
    cards = [c for c in raw['cards'] if c['team_short_name'] in TEAMS]
    hitters = lambda cs: sorted([c for c in cs if c['is_hitter']], key=lambda c: -c['ovr'])
    pitchers = lambda cs: sorted([c for c in cs if not c['is_hitter']], key=lambda c: -c['ovr'])
    home = ('Home', 'https://trustmyrecord.com/')
    hub = ('MLB The Show 26 Ratings', BASE)
    avg = {}
    for ab in TEAMS:
        cs = [c for c in cards if c['team_short_name'] == ab]
        if cs:
            avg[ab] = statistics.mean(sorted((c['ovr'] for c in cs), reverse=True)[:26])
    rank = {ab: i + 1 for i, ab in enumerate(sorted(avg, key=lambda a: -avg[a]))}
    for ab, (full, slug) in TEAMS.items():
        cs = [c for c in cards if c['team_short_name'] == ab]
        if not cs:
            continue
        hs, ps = hitters(cs), pitchers(cs)
        nick = ' '.join(full.split(' ')[-2:]) if ab in ('BOS', 'CWS', 'TOR') else full.split(' ')[-1]
        best = max(cs, key=lambda c: c['ovr'])
        con = max(hs, key=lambda c: c['contact_left'] + c['contact_right'])
        pw = max(hs, key=lambda c: c['power_left'] + c['power_right'])
        spd = max(hs, key=lambda c: c['speed'])
        velo = max(ps, key=lambda c: c['pitch_velocity']) if ps else None
        ace = ps[0] if ps else None
        facts = [('Highest rated', '%s (%d OVR, %s)' % (best['name'], best['ovr'], best['display_position'])),
                 ('Best contact', '%s (%d / %d vs L / R)' % (con['name'], con['contact_left'], con['contact_right'])),
                 ('Most power', '%s (%d / %d vs L / R)' % (pw['name'], pw['power_left'], pw['power_right'])),
                 ('Fastest runner', '%s (%d speed)' % (spd['name'], spd['speed']))]
        if ace:
            facts.append(('Top pitcher', '%s (%d OVR)' % (ace['name'], ace['ovr'])))
        if velo:
            facts.append(('Hardest thrower', '%s (%d velocity)' % (velo['name'], velo['pitch_velocity'])))
        facts.append(('Team rank', '%s of 30 by top 26 average (%.1f OVR)' % (rank[ab], avg[ab])))
        n85 = sum(1 for c in cs if c['ovr'] >= 85)
        intro = ('The %s carry %d Live Series cards in MLB The Show 26: %d hitters and %d pitchers, with %d rated 85 or higher. '
                 '%s leads the roster at %d overall. Measured by the average of their top 26 cards, the %s rank %s of 30 teams.') % (
                 full, len(cs), len(hs), len(ps), n85, best['name'], best['ovr'], nick, rank[ab])
        others = ''.join('<a href="/mlb-the-show-ratings/%s/">%s<span>%.1f</span></a>' % (s, E(f), avg[a])
                         for a, (f, s) in sorted(TEAMS.items(), key=lambda t: t[1][0]) if a != ab and a in avg)
        body = ('<section class="rt-sec"><p>%s</p><div class="rt-facts">%s</div></section>' % (
                    E(intro), ''.join('<div class="rt-fact"><b>%s</b><span>%s</span></div>' % (E(k), E(v)) for k, v in facts)) +
                '<section class="rt-sec"><h2>%s hitter ratings</h2><p>Contact and power are split against left and right handed pitching. Tap a column to sort.</p>%s</section>' % (E(nick), hit_table(hs, H)) +
                ('<section class="rt-sec"><h2>%s pitcher ratings</h2><p>H/9, K/9, BB/9 and HR/9 are The Show pitching ratings, not real stats. Pitch speeds are in mph.</p>%s</section>' % (E(nick), pit_table(ps, H)) if ps else '') +
                '<section class="rt-sec"><h2>Other MLB The Show 26 team ratings</h2><p>Number shown is each team top 26 average overall.</p><div class="rt-grid">%s</div></section>' % others)
        faq = [('Who is the highest rated %s player in MLB The Show 26?' % nick,
                '%s is the highest rated %s card in the Live Series at %d overall (%s).' % (best['name'], full, best['ovr'], best['display_position']))]
        if ace:
            faq.append(('Who is the best %s pitcher in MLB The Show 26?' % nick, '%s is the top rated %s pitcher at %d overall.' % (ace['name'], full, ace['ovr'])))
        faq.append(('How good are the %s in MLB The Show 26?' % nick,
                    'By the average of their top 26 Live Series cards (%.1f overall), the %s rank %s of 30 teams.' % (avg[ab], full, rank[ab])))
        page(slug + '/', '%s MLB The Show 26 Ratings: Full Roster | TrustMyRecord' % full,
             'Every %s player rating in MLB The Show 26 Live Series: overall, contact, power, speed, fielding and full pitcher ratings with arsenals. %s leads at %d OVR.' % (full, best['name'], best['ovr']),
             '%s <span class="gold">MLB The Show 26</span> Ratings' % E(full), [home, hub, (full, BASE + slug + '/')], body, faq, updated)
    H_all, P_all = hitters(cards), pitchers(cards)
    pos_best = []
    for pos in ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH', 'SP', 'RP', 'CP']:
        cs = sorted([c for c in cards if c['display_position'] == pos], key=lambda c: -c['ovr'])
        if cs:
            pos_best.append((pos, cs[0]))
    teams = ''.join('<a href="/mlb-the-show-ratings/%s/">%s<span>%.1f</span></a>' % (TEAMS[a][1], E(TEAMS[a][0]), avg[a]) for a in sorted(avg, key=lambda a: -avg[a]))
    top, topp = H_all[0], P_all[0]
    intro = ('All %d Live Series cards on MLB The Show 26 big league rosters, rated attribute by attribute. %s is the top hitter at %d overall and %s the top pitcher at %d. '
             'Pick a team for its full roster or sort the leaderboards below.') % (len(cards), top['name'], top['ovr'], topp['name'], topp['ovr'])
    body = ('<section class="rt-sec"><p>%s</p><div class="rt-facts">%s</div></section>' % (
                E(intro), ''.join('<div class="rt-fact"><b>Best %s</b><span>%s · %d</span></div>' % (p, E(c['name']), c['ovr']) for p, c in pos_best)) +
            '<section class="rt-sec"><h2>Team ratings</h2><p>Teams ranked by the average overall of their top 26 Live Series cards.</p><div class="rt-grid">%s</div></section>' % teams +
            '<section class="rt-sec"><h2>Top 50 hitters in MLB The Show 26</h2>%s</section>' % hit_table(H_all[:50], H, True) +
            '<section class="rt-sec"><h2>Top 50 pitchers in MLB The Show 26</h2>%s</section>' % pit_table(P_all[:50], H, True))
    bt = max(avg, key=lambda a: avg[a])
    faq = [('Who is the highest rated player in MLB The Show 26?', '%s is the highest rated Live Series hitter at %d overall, and %s is the top pitcher at %d.' % (top['name'], top['ovr'], topp['name'], topp['ovr'])),
           ('What is the best team in MLB The Show 26?', 'By the average of their top 26 Live Series cards, the %s rate highest at %.1f overall.' % (TEAMS[bt][0], avg[bt])),
           ('How often do MLB The Show 26 ratings change?', 'Live Series ratings move with real player performance during roster updates. This page rebuilds from the live roster every day.'),
           ('What do CON L and POW R mean?', 'Contact and power are rated separately against left handed (L) and right handed (R) pitching. VIS is plate vision, DISC plate discipline, CLU clutch.')]
    page('', 'MLB The Show 26 Player Ratings: Every Team and Position | TrustMyRecord',
         'MLB The Show 26 Live Series player ratings for all 30 teams: overall, contact and power splits, speed, fielding and pitcher ratings. Top hitter: %s (%d).' % (top['name'], top['ovr']),
         '<span class="gold">MLB The Show 26</span> Player Ratings', [home, hub], body, faq, updated)
    print('built', 1 + len(avg), 'pages')


if __name__ == '__main__':
    main()
