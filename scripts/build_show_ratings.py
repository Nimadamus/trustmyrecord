"""Build MLB The Show 26 Live Series ratings pages from static/data/show26-ratings.json.
/mlb-the-show-ratings/                      hub
/mlb-the-show-ratings/<team>/               30 team pages
/mlb-the-show-ratings/best-<position>/      12 position leaderboards
/mlb-the-show-ratings/players/<player>/     one page per Live Series card
Data comes from the public mlb26.theshow.com items API via the laptop job (tools/theshow_ratings/refresh.py)."""
import html, json, os, re, shutil, statistics, datetime, unicodedata
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, 'static', 'data', 'show26-ratings.json')
OUT = os.path.join(ROOT, 'mlb-the-show-ratings')
SITE = 'https://trustmyrecord.com'
REL = '/mlb-the-show-ratings/'
BASE = SITE + REL
TEAMS = {'ARI': ('Arizona Diamondbacks', 'diamondbacks'), 'OAK': ('Athletics', 'athletics'), 'ATL': ('Atlanta Braves', 'braves'),
 'BAL': ('Baltimore Orioles', 'orioles'), 'BOS': ('Boston Red Sox', 'red-sox'), 'CHC': ('Chicago Cubs', 'cubs'), 'CWS': ('Chicago White Sox', 'white-sox'),
 'CIN': ('Cincinnati Reds', 'reds'), 'CLE': ('Cleveland Guardians', 'guardians'), 'COL': ('Colorado Rockies', 'rockies'), 'DET': ('Detroit Tigers', 'tigers'),
 'HOU': ('Houston Astros', 'astros'), 'KC': ('Kansas City Royals', 'royals'), 'LAA': ('Los Angeles Angels', 'angels'), 'LAD': ('Los Angeles Dodgers', 'dodgers'),
 'MIA': ('Miami Marlins', 'marlins'), 'MIL': ('Milwaukee Brewers', 'brewers'), 'MIN': ('Minnesota Twins', 'twins'), 'NYM': ('New York Mets', 'mets'),
 'NYY': ('New York Yankees', 'yankees'), 'PHI': ('Philadelphia Phillies', 'phillies'), 'PIT': ('Pittsburgh Pirates', 'pirates'), 'SD': ('San Diego Padres', 'padres'),
 'SF': ('San Francisco Giants', 'giants'), 'SEA': ('Seattle Mariners', 'mariners'), 'STL': ('St. Louis Cardinals', 'cardinals'), 'TB': ('Tampa Bay Rays', 'rays'),
 'TEX': ('Texas Rangers', 'rangers'), 'TOR': ('Toronto Blue Jays', 'blue-jays'), 'WAS': ('Washington Nationals', 'nationals')}
POS = [('C', 'catchers', 'Catchers', 'catcher'), ('1B', 'first-basemen', 'First Basemen', 'first baseman'), ('2B', 'second-basemen', 'Second Basemen', 'second baseman'),
       ('3B', 'third-basemen', 'Third Basemen', 'third baseman'), ('SS', 'shortstops', 'Shortstops', 'shortstop'), ('LF', 'left-fielders', 'Left Fielders', 'left fielder'),
       ('CF', 'center-fielders', 'Center Fielders', 'center fielder'), ('RF', 'right-fielders', 'Right Fielders', 'right fielder'),
       ('DH', 'designated-hitters', 'Designated Hitters', 'designated hitter'), ('SP', 'starting-pitchers', 'Starting Pitchers', 'starting pitcher'),
       ('RP', 'relief-pitchers', 'Relief Pitchers', 'relief pitcher'), ('CP', 'closers', 'Closers', 'closer')]
POSN = {p[0]: p for p in POS}
E = html.escape
SHELL = None
H = {}
SLUG = {}


def shell_parts():
    s = open(os.path.join(ROOT, 'mlb-the-show-stat-league', 'index.html'), encoding='utf-8').read()
    boot = re.search(r'<!-- TMR_THEME_BOOT -->.*?<!-- /TMR_THEME_BOOT -->', s, re.S).group(0)
    pre = re.search(r'(<script async src="https://www.googletagmanager.com.*?)<style>', s, re.S).group(1)
    style = re.search(r'<style>(.*?)</style>', s, re.S).group(1)
    post = re.search(r'</script>\s*(<link rel="stylesheet" href="/static/css/tmr-linkhub.*?)</head>', s, re.S).group(1)
    body = re.search(r'<body[^>]*>', s).group(0)
    tail = re.search(r'(<script src="/static/js/tmr-session.*?)</body>', s, re.S).group(1)
    return boot, pre, style, post, body, tail


SORT_JS = """<script>
document.querySelectorAll('.rt-t').forEach(function(t){t.querySelectorAll('th').forEach(function(th,i){th.addEventListener('click',function(){
var b=t.tBodies[0],rows=[].slice.call(b.rows),asc=th.dataset.s!=='d';th.dataset.s=asc?'d':'a';
rows.sort(function(x,y){var a=x.cells[i].dataset.v||x.cells[i].textContent,c=y.cells[i].dataset.v||y.cells[i].textContent,na=parseFloat(a),nc=parseFloat(c);
if(!isNaN(na)&&!isNaN(nc))return asc?nc-na:na-nc;return asc?a.localeCompare(c):c.localeCompare(a)});rows.forEach(function(r){b.appendChild(r)})})})});
</script>"""


def slugify(s):
    s = unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode()
    return re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-')


def rcls(c):
    return {'Diamond': 'r-d', 'Gold': 'r-g', 'Silver': 'r-s', 'Bronze': 'r-b'}.get(c.get('rarity'), 'r-c')


def norm(n):
    n = unicodedata.normalize('NFKD', n).encode('ascii', 'ignore').decode()
    return re.sub(r'[^a-z]', '', n.lower().replace('jr.', '').replace('sr.', ''))


def headshots():
    d = json.load(open(os.path.join(ROOT, 'static', 'data', 'show26-players.json'), encoding='latin-1'))
    return {norm(r[0]): r[4] for r in d if r[4]}


def img_src(c, w=96):
    pid = H.get(norm(c['name'])) or 'generic'
    return 'https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_%d,q_auto:best/v1/people/%s/headshot/67/current' % (w, pid)


def shot(c):
    return '<img src="%s" alt="%s" loading="lazy" width="36" height="36">' % (img_src(c), E(c['name']))


def purl(c):
    return REL + 'players/' + SLUG[id(c)] + '/'


def plink(c):
    return '<a href="%s">%s</a>' % (purl(c), E(c['name']))


def ovr(c):
    return '<span class="ovr %s">%d</span>' % (rcls(c), c['ovr'])


def td(v, hi=85):
    v = v or 0
    return '<td data-v="%d"%s>%d</td>' % (v, ' class="hi"' if v >= hi else '', v)


def team_name(c):
    return TEAMS[c['team_short_name']][0]


def pcell(c, team=False):
    if team:
        sub = c['display_position'] + ' · ' + team_name(c)
    else:
        sub = '%s · Age %s · B/T %s/%s' % (c['display_position'], c['age'], c['bat_hand'], c['throw_hand'])
    return '<td data-v="%s"><div class="rt-p">%s<div>%s<small>%s</small></div></div></td>' % (E(c['name']), shot(c), plink(c), E(sub))


HIT_KEYS = ('contact_left', 'contact_right', 'power_left', 'power_right', 'plate_vision', 'plate_discipline', 'batting_clutch', 'speed', 'fielding_ability', 'arm_strength', 'arm_accuracy')
PIT_KEYS = ('stamina', 'hits_per_bf_right', 'k_per_bf_right', 'bb_per_bf', 'hr_per_bf', 'pitching_clutch', 'pitch_velocity', 'pitch_control', 'pitch_movement')


def table(head, rows):
    return '<div class="rt-card rt-scroll"><table class="rt-t"><thead><tr>%s</tr></thead><tbody>%s</tbody></table></div>' % (''.join('<th>%s</th>' % x for x in head), rows)


def rk(i, rank):
    return '<td data-v="%d">%d</td>' % (i + 1, i + 1) if rank else ''


def hit_table(cards, team=False, rank=False):
    h = (['#'] if rank else []) + ['Player', 'OVR', 'CON L', 'CON R', 'POW L', 'POW R', 'VIS', 'DISC', 'CLU', 'SPD', 'FLD', 'ARM', 'ACC']
    rows = ''.join('<tr>%s%s<td data-v="%d">%s</td>%s</tr>' % (rk(i, rank), pcell(c, team), c['ovr'], ovr(c),
                   ''.join(td(c.get(k)) for k in HIT_KEYS)) for i, c in enumerate(cards))
    return table(h, rows)


def by_usage(c):
    return sorted(c.get('pitches') or [], key=lambda p: -(p.get('usage') or 0))


def arsenal(c):
    return ', '.join('%s %s' % (p['name'], p['speed']) for p in by_usage(c)[:5])


def pit_table(cards, team=False, rank=False):
    h = (['#'] if rank else []) + ['Pitcher', 'OVR', 'STA', 'H/9', 'K/9', 'BB/9', 'HR/9', 'CLU', 'VELO', 'CTRL', 'BRK', 'Top pitches (mph)']
    rows = ''.join('<tr>%s%s<td data-v="%d">%s</td>%s<td class="ars">%s</td></tr>' % (rk(i, rank), pcell(c, team), c['ovr'], ovr(c),
                   ''.join(td(c.get(k)) for k in PIT_KEYS), E(arsenal(c))) for i, c in enumerate(cards))
    return table(h, rows)


CTA = ('<section class="rt-cta"><h2>Play MLB The Show 26 online? Put your record on the board.</h2>'
       '<p>Create a free TrustMyRecord account, link your PlayStation or Xbox username, and every online game you finish posts to your profile with the full box score. '
       'Climb the MLB The Show Stat League standings, call out rivals and build a record nobody can argue with.</p>'
       '<a class="btn btn-gold" href="/register/"><i class="fas fa-user-plus"></i> Create free account</a> '
       '<a class="btn btn-outline" href="/online-gaming/#autotrack"><i class="fas fa-bolt"></i> How auto tracking works</a> '
       '<a class="btn btn-outline" href="/mlb-the-show-stat-league/">Stat League standings</a></section>')
MINI_CTA = ('<div class="rt-mini"><span><b>Track your MLB The Show 26 games automatically.</b> Free box scores and a verified win loss record.</span>'
            '<a class="btn btn-gold" href="/register/">Join free</a></div>')


def page(path, title, desc, h1, crumbs, body, faq, updated, kicker='MLB The Show 26 · Live Series', hero_extra=''):
    boot, pre, style, post, btag, tail = SHELL
    url = BASE + path
    ld = [{'@context': 'https://schema.org', '@type': 'BreadcrumbList', 'itemListElement': [
        {'@type': 'ListItem', 'position': i + 1, 'name': n, 'item': u} for i, (n, u) in enumerate(crumbs)]}]
    if faq:
        ld.append({'@context': 'https://schema.org', '@type': 'FAQPage', 'mainEntity': [
            {'@type': 'Question', 'name': q, 'acceptedAnswer': {'@type': 'Answer', 'text': a}} for q, a in faq]})
    cr = ' › '.join('<a href="%s">%s</a>' % (u.replace(SITE, ''), E(n)) for n, u in crumbs[:-1]) + ' › ' + E(crumbs[-1][0])
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
    {pre}<style>{style}</style>
    <link rel="stylesheet" href="/static/css/tmr-show-ratings.css">
{lds}
{post}
</head>
{btag}
<main class="sl-wrap">
<nav class="rt-crumbs" aria-label="Breadcrumb">{cr}</nav>
<section class="sl-hero" style="margin-top:14px">
<span class="sl-kicker"><i class="fas fa-baseball-bat-ball"></i> {kicker}</span>
<h1>{h1}</h1>
{hero_extra}<p class="rt-meta">Ratings updated {updated} from the MLB The Show 26 Live Series roster.</p>
</section>
{body}
{fq}
{CTA}
</main>
{SORT_JS}
{tail}</body>
</html>
"""
    d = os.path.join(OUT, path)
    os.makedirs(d, exist_ok=True)
    open(os.path.join(d, 'index.html'), 'w', encoding='utf-8', newline='\n').write(doc)


def bar(label, v, hi=85):
    v = v or 0
    cls = 'b-hi' if v >= hi else ('b-mid' if v >= 65 else 'b-lo')
    return '<div class="rt-bar"><span>%s</span><div><i class="%s" style="width:%d%%"></i></div><b>%d</b></div>' % (E(label), cls, min(v, 125) * 100 // 125, v)


def links(xs):
    return '<div class="rt-grid">%s</div>' % ''.join('<a href="%s">%s<span>%d</span></a>' % (purl(x), E(x['name'] + ' · ' + x['display_position']), x['ovr']) for x in xs)


def player_page(c, cards, updated, posrank, poscount):
    full, tslug = TEAMS[c['team_short_name']]
    pos = c['display_position']
    pinfo = POSN.get(pos)
    pitcher = not c['is_hitter']
    name = c['name']
    sec = c.get('display_secondary_positions') or ''
    intro = '%s is a %d overall %s for the %s in MLB The Show 26 Live Series' % (name, c['ovr'], pinfo[3] if pinfo else pos, full)
    intro += (', ranked %d of %d %s in the game.' % (posrank, poscount, pinfo[2].lower())) if pinfo else '.'
    ps = by_usage(c)
    if pitcher and ps:
        intro += ' He throws %d pitches, led by a %d mph %s.' % (len(ps), ps[0]['speed'] or 0, ps[0]['name'])
    elif not pitcher:
        best = max(('contact', max(c['contact_left'], c['contact_right'])), ('power', max(c['power_left'], c['power_right'])), ('speed', c['speed']),
                   ('fielding', c['fielding_ability']), key=lambda t: t[1])
        intro += ' His best tool is %s at %d.' % (best[0], best[1])
    info = [('Team', '<a href="%s%s/">%s</a>' % (REL, tslug, E(full))), ('Position', E(pos + (' (also ' + sec + ')' if sec else ''))),
            ('Bats / Throws', E('%s / %s' % (c['bat_hand'], c['throw_hand']))), ('Age', E(str(c['age'])))]
    if c.get('height'):
        info.append(('Height / Weight', E('%s, %s' % (c['height'], c.get('weight') or ''))))
    if c.get('jersey_number'):
        info.append(('Jersey', '#' + E(str(c['jersey_number']))))
    if c.get('born'):
        info.append(('Born', E(c['born'])))
    info.append(('Card', E('%s Live Series' % (c.get('rarity') or ''))))
    hero = ('<div class="rt-hero"><img src="%s" alt="%s" width="140" height="140"><div class="rt-hero-ovr">%s<span>OVERALL</span></div>'
            '<dl class="rt-info">%s</dl></div>') % (img_src(c, 213), E(name), ovr(c), ''.join('<div><dt>%s</dt><dd>%s</dd></div>' % (k, v) for k, v in info))
    groups = []
    if c['is_hitter'] or c.get('two_way'):
        groups.append(('Hitting', [('Contact vs L', c['contact_left']), ('Contact vs R', c['contact_right']), ('Power vs L', c['power_left']), ('Power vs R', c['power_right']),
                                   ('Plate vision', c['plate_vision']), ('Plate discipline', c['plate_discipline']), ('Batting clutch', c['batting_clutch'])]))
        fr = [('Speed', c['speed']), ('Fielding', c['fielding_ability']), ('Arm strength', c['arm_strength']), ('Arm accuracy', c['arm_accuracy'])]
        if c.get('reaction_left') is not None:
            fr.append(('Reaction', c['reaction_left']))
        if pos == 'C' and c.get('blocking'):
            fr.append(('Blocking', c['blocking']))
        groups.append(('Fielding and running', fr))
    if pitcher or c.get('two_way'):
        groups.append(('Pitching', [('Stamina', c['stamina']), ('H/9 vs L', c.get('hits_per_bf_left')), ('H/9 vs R', c['hits_per_bf_right']), ('K/9 vs L', c.get('k_per_bf_left')),
                                    ('K/9 vs R', c['k_per_bf_right']), ('BB/9', c['bb_per_bf']), ('HR/9', c['hr_per_bf']), ('Pitching clutch', c['pitching_clutch']),
                                    ('Velocity', c['pitch_velocity']), ('Control', c['pitch_control']), ('Break', c['pitch_movement'])]))
    attrs = '<section class="rt-sec"><h2>%s MLB The Show 26 attributes</h2><div class="rt-attr">%s</div></section>' % (E(name), ''.join(
        '<div class="rt-card"><h3>%s</h3>%s</div>' % (E(g), ''.join(bar(l, v) for l, v in items if v is not None)) for g, items in groups))
    pitches = ''
    if ps:
        rows = ''.join('<tr><td>%s</td>%s%s%s%s<td data-v="%d">%d%%</td></tr>' % (E(p['name']), td(p.get('speed'), 999), td(p.get('control')), td(p.get('movement')),
                       td(p.get('rating')), p.get('usage') or 0, p.get('usage') or 0) for p in ps)
        pitches = ('<section class="rt-sec"><h2>%s pitch arsenal</h2><p>Speed in mph, with The Show control, break and overall pitch rating. Usage is how often he throws it.</p>'
                   '<div class="rt-card rt-scroll"><table class="rt-t rt-t-sm"><thead><tr><th>Pitch</th><th>MPH</th><th>CTRL</th><th>BRK</th><th>RATING</th><th>USAGE</th></tr></thead><tbody>%s</tbody></table></div></section>') % (E(name), rows)
    quirks = ''
    if c.get('quirks'):
        quirks = '<section class="rt-sec"><h2>%s quirks</h2><div class="rt-chips">%s</div></section>' % (E(name), ''.join('<span>%s</span>' % E(q) for q in c['quirks']))
    same = sorted([x for x in cards if x['display_position'] == pos and x is not c], key=lambda x: (abs(x['ovr'] - c['ovr']), -x['ovr']))[:8]
    mates = sorted([x for x in cards if x['team_short_name'] == c['team_short_name'] and x is not c], key=lambda x: -x['ovr'])[:8]
    more = '<section class="rt-sec"><h2>Similar %s</h2>%s%s</section>' % (E(pinfo[2].lower() if pinfo else pos + ' cards'), links(same),
            '<p class="rt-more"><a href="%sbest-%s/">See all %s ranked</a></p>' % (REL, pinfo[1], E(pinfo[2].lower())) if pinfo else '')
    more += '<section class="rt-sec"><h2>%s teammates</h2>%s<p class="rt-more"><a href="%s%s/">Full %s ratings</a></p></section>' % (E(full), links(mates), REL, tslug, E(full))
    body = '<section class="rt-sec"><p class="rt-lead">%s</p></section>%s%s%s%s%s' % (E(intro), attrs, MINI_CTA, pitches, quirks, more)
    faq = [('What is %s\'s rating in MLB The Show 26?' % name, '%s is rated %d overall in the MLB The Show 26 Live Series as a %s for the %s.' % (name, c['ovr'], pos, full))]
    if ps:
        faq.append(('What pitches does %s throw in MLB The Show 26?' % name, '%s throws %s.' % (name, '; '.join('%s at %s mph' % (p['name'], p['speed']) for p in ps))))
    if c.get('quirks'):
        faq.append(('What quirks does %s have in MLB The Show 26?' % name, '%s has %s.' % (name, ', '.join(c['quirks']))))
    what = 'pitch arsenal' if ps else 'contact and power splits'
    page('players/' + SLUG[id(c)] + '/', '%s MLB The Show 26 Rating: %d OVR %s | TrustMyRecord' % (name, c['ovr'], pos),
         '%s is a %d overall %s for the %s in MLB The Show 26. Full attributes, %s%s.' % (name, c['ovr'], pos, full, what, ' and quirks' if c.get('quirks') else ''),
         '%s <span class="gold">MLB The Show 26</span> Rating' % E(name),
         [('Home', SITE + '/'), ('MLB The Show 26 Ratings', BASE), (full, BASE + tslug + '/'), (name, BASE + 'players/' + SLUG[id(c)] + '/')],
         hero + body, faq, updated, kicker='%s · %s' % (E(full), E(pos)))


def main():
    global SHELL, H
    SHELL = shell_parts()
    H = headshots()
    raw = json.load(open(DATA, encoding='utf-8'))
    dt = datetime.datetime.strptime(raw['fetched'][:10], '%Y-%m-%d')
    updated = '%s %d, %d' % (dt.strftime('%B'), dt.day, dt.year)
    cards = [c for c in raw['cards'] if c['team_short_name'] in TEAMS]
    names = {}
    for c in cards:
        names.setdefault(slugify(c['name']), []).append(c)
    for s, cs in names.items():
        for c in cs:
            SLUG[id(c)] = s if len(cs) == 1 else s + '-' + TEAMS[c['team_short_name']][1]
    if os.path.isdir(OUT):
        shutil.rmtree(OUT)
    hitters = lambda cs: sorted([c for c in cs if c['is_hitter']], key=lambda c: -c['ovr'])
    pitchers = lambda cs: sorted([c for c in cs if not c['is_hitter']], key=lambda c: -c['ovr'])
    home = ('Home', SITE + '/')
    hub = ('MLB The Show 26 Ratings', BASE)
    avg = {}
    for ab in TEAMS:
        cs = [c for c in cards if c['team_short_name'] == ab]
        if cs:
            avg[ab] = statistics.mean(sorted((c['ovr'] for c in cs), reverse=True)[:26])
    rank = {ab: i + 1 for i, ab in enumerate(sorted(avg, key=lambda a: -avg[a]))}
    bypos = {p: sorted([c for c in cards if c['display_position'] == p], key=lambda c: -c['ovr']) for p in POSN}
    poslinks = '<div class="rt-grid">%s</div>' % ''.join('<a href="%sbest-%s/">Best %s<span>%d</span></a>' % (REL, s, E(lbl), bypos[p][0]['ovr']) for p, s, lbl, _ in POS if bypos[p])
    n = 0
    for c in cards:
        cs = bypos.get(c['display_position'])
        player_page(c, cards, updated, (cs.index(c) + 1) if cs else 1, len(cs) if cs else 1)
        n += 1
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
        facts = [('Highest rated', best, '%d OVR, %s' % (best['ovr'], best['display_position'])),
                 ('Best contact', con, '%d / %d vs L / R' % (con['contact_left'], con['contact_right'])),
                 ('Most power', pw, '%d / %d vs L / R' % (pw['power_left'], pw['power_right'])),
                 ('Fastest runner', spd, '%d speed' % spd['speed'])]
        if ace:
            facts.append(('Top pitcher', ace, '%d OVR' % ace['ovr']))
        if velo:
            facts.append(('Hardest thrower', velo, '%d velocity' % velo['pitch_velocity']))
        fh = ''.join('<div class="rt-fact"><b>%s</b><span>%s (%s)</span></div>' % (E(k), plink(x), E(v)) for k, x, v in facts)
        fh += '<div class="rt-fact"><b>Team rank</b><span>%s of 30 by top 26 average (%.1f OVR)</span></div>' % (rank[ab], avg[ab])
        n85 = sum(1 for c in cs if c['ovr'] >= 85)
        intro = ('The %s carry %d Live Series cards in MLB The Show 26: %d hitters and %d pitchers, with %d rated 85 or higher. '
                 '%s leads the roster at %d overall. Measured by the average of their top 26 cards, the %s rank %s of 30 teams.') % (
                 full, len(cs), len(hs), len(ps), n85, best['name'], best['ovr'], nick, rank[ab])
        others = ''.join('<a href="%s%s/">%s<span>%.1f</span></a>' % (REL, s, E(f), avg[a])
                         for a, (f, s) in sorted(TEAMS.items(), key=lambda t: t[1][0]) if a != ab and a in avg)
        body = ('<section class="rt-sec"><p>%s</p><div class="rt-facts">%s</div></section>' % (E(intro), fh) +
                '<section class="rt-sec"><h2>%s hitter ratings</h2><p>Contact and power are split against left and right handed pitching. Tap a column to sort, tap a name for the full card.</p>%s</section>' % (E(nick), hit_table(hs)) +
                MINI_CTA +
                ('<section class="rt-sec"><h2>%s pitcher ratings</h2><p>H/9, K/9, BB/9 and HR/9 are The Show pitching ratings, not real stats. Pitch speeds are in mph.</p>%s</section>' % (E(nick), pit_table(ps)) if ps else '') +
                '<section class="rt-sec"><h2>Best players by position</h2>%s</section>' % poslinks +
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
        n += 1
    for p, s, lbl, one in POS:
        cs = bypos[p]
        if not cs:
            continue
        top = cs[0]
        isp = p in ('SP', 'RP', 'CP')
        if isp:
            v = max(cs[:30], key=lambda c: c['pitch_velocity'])
            k = max(cs[:30], key=lambda c: c['k_per_bf_right'])
            extra = ' %s throws hardest of the top 30 at %d velocity, and %s misses the most bats with a %d K/9 rating against righties.' % (v['name'], v['pitch_velocity'], k['name'], k['k_per_bf_right'])
        else:
            pw = max(cs[:30], key=lambda c: c['power_left'] + c['power_right'])
            cn = max(cs[:30], key=lambda c: c['contact_left'] + c['contact_right'])
            extra = ' %s has the most power of the top 30 and %s the best bat to ball skills.' % (pw['name'], cn['name'])
        intro = ('There are %d %s on MLB The Show 26 Live Series rosters. %s of the %s is the best %s in the game at %d overall, followed by %s.%s') % (
            len(cs), lbl.lower(), top['name'], team_name(top), one, top['ovr'], ', '.join('%s (%d)' % (x['name'], x['ovr']) for x in cs[1:4]), extra)
        tbl = pit_table(cs[:30], True, True) if isp else hit_table(cs[:30], True, True)
        others = '<div class="rt-grid">%s</div>' % ''.join('<a href="%sbest-%s/">Best %s<span>%d</span></a>' % (REL, s2, E(l2), bypos[p2][0]['ovr']) for p2, s2, l2, _ in POS if p2 != p and bypos[p2])
        body = ('<section class="rt-sec"><p class="rt-lead">%s</p></section>' % E(intro) +
                '<section class="rt-sec"><h2>Top %d %s in MLB The Show 26</h2><p>Ranked by overall. Tap a column to sort, tap a name for the full card.</p>%s</section>' % (min(30, len(cs)), E(lbl.lower()), tbl) +
                MINI_CTA + '<section class="rt-sec"><h2>Other positions</h2>%s</section>' % others)
        faq = [('Who is the best %s in MLB The Show 26?' % one, '%s of the %s is the highest rated %s in MLB The Show 26 Live Series at %d overall.' % (top['name'], team_name(top), one, top['ovr'])),
               ('Who are the top 5 %s in MLB The Show 26?' % lbl.lower(), ', '.join('%s (%d)' % (x['name'], x['ovr']) for x in cs[:5]) + '.')]
        page('best-%s/' % s, 'Best %s in MLB The Show 26: Top 30 Ranked | TrustMyRecord' % lbl,
             'The best %s in MLB The Show 26 ranked by Live Series rating. %s leads at %d overall. Full attributes for the top 30.' % (lbl.lower(), top['name'], top['ovr']),
             'Best %s in <span class="gold">MLB The Show 26</span>' % E(lbl), [home, hub, ('Best ' + lbl, BASE + 'best-%s/' % s)], body, faq, updated)
        n += 1
    H_all, P_all = hitters(cards), pitchers(cards)
    teams = ''.join('<a href="%s%s/">%s<span>%.1f</span></a>' % (REL, TEAMS[a][1], E(TEAMS[a][0]), avg[a]) for a in sorted(avg, key=lambda a: -avg[a]))
    top, topp = H_all[0], P_all[0]
    intro = ('All %d Live Series cards on MLB The Show 26 big league rosters, rated attribute by attribute. %s is the top hitter at %d overall and %s the top pitcher at %d. '
             'Pick a team, a position or a player for the full card, or sort the leaderboards below.') % (len(cards), top['name'], top['ovr'], topp['name'], topp['ovr'])
    body = ('<section class="rt-sec"><p>%s</p><div class="rt-facts">%s</div></section>' % (
                E(intro), ''.join('<div class="rt-fact"><b><a href="%sbest-%s/">Best %s</a></b><span>%s · %d</span></div>' % (REL, s, p, plink(bypos[p][0]), bypos[p][0]['ovr']) for p, s, _, _ in POS if bypos[p])) +
            '<section class="rt-sec"><h2>Team ratings</h2><p>Teams ranked by the average overall of their top 26 Live Series cards.</p><div class="rt-grid">%s</div></section>' % teams +
            '<section class="rt-sec"><h2>Best players by position</h2>%s</section>' % poslinks +
            MINI_CTA +
            '<section class="rt-sec"><h2>Top 50 hitters in MLB The Show 26</h2>%s</section>' % hit_table(H_all[:50], True, True) +
            '<section class="rt-sec"><h2>Top 50 pitchers in MLB The Show 26</h2>%s</section>' % pit_table(P_all[:50], True, True))
    bt = max(avg, key=lambda a: avg[a])
    faq = [('Who is the highest rated player in MLB The Show 26?', '%s is the highest rated Live Series hitter at %d overall, and %s is the top pitcher at %d.' % (top['name'], top['ovr'], topp['name'], topp['ovr'])),
           ('What is the best team in MLB The Show 26?', 'By the average of their top 26 Live Series cards, the %s rate highest at %.1f overall.' % (TEAMS[bt][0], avg[bt])),
           ('How often do MLB The Show 26 ratings change?', 'Live Series ratings move with real player performance during roster updates. These pages rebuild from the live roster every day.'),
           ('What do CON L and POW R mean?', 'Contact and power are rated separately against left handed (L) and right handed (R) pitching. VIS is plate vision, DISC plate discipline, CLU clutch.')]
    page('', 'MLB The Show 26 Player Ratings: Every Team and Position | TrustMyRecord',
         'MLB The Show 26 Live Series player ratings for all 30 teams: overall, contact and power splits, speed, fielding and pitcher ratings. Top hitter: %s (%d).' % (top['name'], top['ovr']),
         '<span class="gold">MLB The Show 26</span> Player Ratings', [home, hub], body, faq, updated)
    print('built', n + 1, 'pages')


if __name__ == '__main__':
    main()
