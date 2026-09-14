#!/usr/bin/env node
/**
 * FEATURED MATCHUPS: one source of truth. FEATURED_SOURCE_OF_TRUTH_20260914.
 *
 * On 2026-09-14 the NFL Featured Matchups menu still opened 49ers at Rams, a
 * game played the Thursday before, because three places each stored their own
 * "featured NFL article" and the hourly Matchup of the Day bake rewrote one of
 * them from the newest database Game File. This test holds the fix in place:
 *
 *   1. The Python resolver (bake) and the JS resolver (browser) agree on every
 *      fixture instant, and both obey the clock rule: a finished game is never
 *      the feature, the earliest live kickoff wins, withdrawn entries and
 *      future start_utc entries never resolve.
 *   2. Every featured surface in the repo is wired to the registry: doors and
 *      cards carry the runtime hook and name only a registry href or the hub.
 *   3. No hand kept feature list exists anywhere (the FEATURES array in the
 *      sportsbook, a GAME_OF_THE_WEEK dict in the hub builder).
 *   4. The real Matchup of the Day bake, run offline, bakes the NFL door from
 *      the registry and NOT from the newest NFL Game File, and registers that
 *      Game File with its real kickoff.
 *
 *   node tests/featured-matchups-sync-test.js
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { execFileSync, spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
let failures = 0;
const ok = (m) => console.log('  ok    ' + m);
const bad = (m) => { failures += 1; console.error('  FAIL  ' + m); };
const warn = (m) => console.log('  warn  ' + m);

/* ------------------------------------------------ 1. resolver parity + rules */
const H = 3600 * 1000;
const BASE = Date.parse('2026-09-14T12:00:00Z');
const iso = (ms) => new Date(ms).toISOString().replace('.000Z', 'Z');
const REG = {
  grace_minutes: 210,
  sports: {
    nfl: {
      hub: '/handicapping/nfl/',
      features: [
        { id: 'thursday', href: '/nfl/thursday/', kickoff_utc: iso(BASE - 96 * H) },
        { id: 'game-file-newest-but-played', source: 'game-file', href: '/matchup-of-the-day/played/', kickoff_utc: iso(BASE - 90 * H) },
        { id: 'monday', href: '/nfl/monday/', kickoff_utc: iso(BASE + 12 * H) },
        { id: 'sunday-next', href: '/nfl/sunday-next/', kickoff_utc: iso(BASE + 6 * 24 * H) },
        { id: 'withdrawn', status: 'withdrawn', href: '/nfl/withdrawn/', kickoff_utc: iso(BASE + 1 * H) },
        { id: 'embargoed', href: '/nfl/embargoed/', kickoff_utc: iso(BASE + 2 * H), start_utc: iso(BASE + 1.5 * H) },
        { id: 'no-offset', href: '/nfl/no-offset/', kickoff_utc: '2026-09-14T13:00:00' },
        { id: 'no-href', kickoff_utc: iso(BASE + 3 * H) },
      ],
    },
  },
};
const INSTANTS = {
  'before anything': BASE,
  'embargo lifted': BASE + 1.6 * H,
  'embargoed game in progress': BASE + 4 * H,
  'monday in progress': BASE + 12 * H + 3 * H,
  'monday finished': BASE + 12 * H + 3.5 * H,
  'last game finished': BASE + 6 * 24 * H + 4 * H,
};
const EXPECT = {
  'before anything': 'monday',
  'embargo lifted': 'embargoed',
  'embargoed game in progress': 'embargoed',
  'monday in progress': 'monday',
  'monday finished': 'sunday-next',
  'last game finished': null,
};

const sandbox = { window: {}, document: { readyState: 'complete' }, setTimeout, setInterval, clearTimeout };
sandbox.window.location = { pathname: '/' };
vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'static/js/tmr-featured.js'), 'utf8'), sandbox);
const jsResolve = sandbox.window.TMRFeatured.resolve;

const py = spawnSync('python', ['-c', `
import sys, json, datetime as dt
sys.path.insert(0, ${JSON.stringify(path.join(ROOT, 'scripts'))})
import featured_matchups as fm
reg = json.loads(sys.argv[1]); instants = json.loads(sys.argv[2])
out = {}
for name, ms in instants.items():
    f = fm.resolve(reg, 'nfl', dt.datetime.fromtimestamp(ms / 1000, dt.timezone.utc))
    out[name] = f["id"] if f else None
print(json.dumps(out))
`, JSON.stringify(REG), JSON.stringify(INSTANTS)], { encoding: 'utf8' });
if (py.status !== 0) {
  bad('python resolver did not run: ' + py.stderr);
} else {
  const pyOut = JSON.parse(py.stdout);
  for (const [name, ms] of Object.entries(INSTANTS)) {
    const j = jsResolve(REG, 'nfl', ms);
    const jid = j ? j.id : null;
    if (jid !== pyOut[name]) bad(`${name}: JS resolved ${jid}, Python resolved ${pyOut[name]}`);
    else if (jid !== EXPECT[name]) bad(`${name}: resolved ${jid}, expected ${EXPECT[name]}`);
    else ok(`${name}: both resolvers pick ${jid}`);
  }
}

/* --------------------------------------- 2. every surface wired to registry */
const reg = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/featured-matchups.json'), 'utf8'));
for (const [sport, s] of Object.entries(reg.sports)) {
  const hrefs = new Set(s.features.map((f) => f.href).concat([s.hub]));
  for (const door of s.doors) {
    const html = fs.readFileSync(path.join(ROOT, door.file), 'utf8');
    const m = html.match(/data-baked-href="([^"]*)"/);
    if (!/data-tmr-featured-door=/.test(html) || !/tmr-featured\.js/.test(html)) {
      bad(`${door.url}: not baked by featured_matchups.py (no runtime hook)`);
    } else if (!m || (m[1] !== '' && !hrefs.has(m[1]))) {
      bad(`${door.url}: names ${m && m[1]}, which is not in the registry`);
    } else {
      ok(`${door.url}: baked from the registry (${m[1]})`);
    }
  }
  if (s.hub_file) {
    const hub = fs.readFileSync(path.join(ROOT, s.hub_file), 'utf8');
    const card = hub.match(new RegExp(`<!--MK:featured-card-${sport}-->([\\s\\S]*?)<!--/MK:featured-card-${sport}-->`));
    const href = card && card[1].match(/data-feat-link href="([^"]+)"/);
    if (!card) bad(`${s.hub_file}: featured card is not the registry card`);
    else if (!href || !hrefs.has(href[1])) bad(`${s.hub_file}: card names ${href && href[1]}, not in the registry`);
    else ok(`${s.hub_file}: card baked from the registry (${href[1]})`);
    if (/class="mm-sec mm-gotw">/.test(hub)) bad(`${s.hub_file}: still carries an unmarked legacy card`);
  }
  for (const strip of s.strips || []) {
    const html = fs.readFileSync(path.join(ROOT, strip.file), 'utf8');
    const block = html.match(new RegExp(`<!--MK:${strip.marker}-->([\\s\\S]*?)<!--/MK:${strip.marker}-->`));
    const href = block && block[1].match(/data-feat-link href="([^"]+)"/);
    if (!block || !href || !hrefs.has(href[1])) bad(`${strip.file}: strip is not baked from the registry`);
    else ok(`${strip.file}: strip baked from the registry (${href[1]})`);
  }
}
const check = spawnSync('python', [path.join(ROOT, 'scripts/featured_matchups.py'), 'sync', '--check'], { encoding: 'utf8' });
if (check.status === 0) ok('sync --check: every surface matches the registry right now');
else warn('sync --check reports a surface behind the clock; tmr-featured.js corrects it in the browser '
          + 'and the next bake rewrites it:\n' + check.stdout);

/* ------------------------------------------------ 3. no hand kept lists */
const sportsbook = fs.readFileSync(path.join(ROOT, 'sportsbook/index.html'), 'utf8');
if (/var\s+FEATURES\s*=\s*\[/.test(sportsbook)) bad('sportsbook/index.html: a hand kept FEATURES list is back');
else ok('sportsbook/index.html: no hand kept FEATURES list');
const builder = fs.readFileSync(path.join(ROOT, 'scripts/build_sport_matchup_pages.py'), 'utf8');
if (/^GAME_OF_THE_WEEK\s*=/m.test(builder)) bad('build_sport_matchup_pages.py: a GAME_OF_THE_WEEK dict is back');
else ok('build_sport_matchup_pages.py: no hand kept GAME_OF_THE_WEEK dict');

/* ------------------------------ 4. the real bake obeys the registry offline */
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tmr-featured-'));
for (const rel of ['matchups', 'matchups/mlb', 'matchup-of-the-day', 'scripts', 'data',
                   'static/js', 'handicapping/tennis', 'nfl-game-of-the-week']) {
  fs.mkdirSync(path.join(tmp, rel), { recursive: true });
}
for (const rel of ['scripts/build_matchup_articles.py', 'scripts/build_matchup_graphics.py',
                   'scripts/schema_event.py', 'scripts/team_logos.py',
                   'scripts/featured_matchups.py', 'data/team-logos.json',
                   'static/js/tmr-featured.js',
                   'matchups/index.html', 'matchups/mlb/index.html',
                   'matchup-of-the-day/index.html', 'handicapping/tennis/index.html']) {
  fs.copyFileSync(path.join(ROOT, rel), path.join(tmp, rel));
}
fs.writeFileSync(path.join(tmp, 'sitemap.xml'),
  '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n</urlset>\n');
fs.writeFileSync(path.join(tmp, 'index.html'),
  '<!DOCTYPE html><html><body>\n<!--MK:motdCover--><!--/MK:motdCover-->\n</body></html>\n');

const NOW = Date.now();
const TODAY_ISO = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(new Date());
fs.writeFileSync(path.join(tmp, 'data/featured-matchups.json'), JSON.stringify({
  grace_minutes: 210,
  sports: { nfl: {
    label: 'NFL', hub: '/handicapping/nfl/',
    doors: [{ file: 'matchup-of-the-day/nfl/index.html', url: '/matchup-of-the-day/nfl/', eyebrow: 'NFL Matchup of the Day' },
            { file: 'nfl-game-of-the-week/index.html', url: '/nfl-game-of-the-week/', eyebrow: 'NFL Game of the Week' }],
    features: [{ id: 'hand-live', source: 'hand', href: '/nfl/hand-built-live/', headline: 'Hand built live feature',
                 matchup: 'Away at Home', kickoff_utc: iso(NOW + 5 * H) }],
  } },
}, null, 2));
const gameFile = {
  id: 9901, short_id: 9901, sport: 'nfl', slug: 'played-nfl-game-file',
  away_team: 'Played Away', home_team: 'Played Home',
  game_time_utc: new Date(NOW - 80 * H).toISOString(), venue_name: 'Test Field', status: 'published',
  angle_key: 'played-angle', angle_label: 'Played', title: 'Played', h1: 'Played NFL Game File',
  meta_description: 'Fixture.', dek: 'Fixture.',
  og_image_url: 'https://trustmyrecord.com/static/og/matchups/g1000.png',
  hero_image_url: '/static/media/matchups/g1000-hero.svg', hero_image_alt: 'Fixture',
  featured_on: `${TODAY_ISO}T00:00:00.000Z`,
  published_at: `${TODAY_ISO}T16:00:00.000Z`, content_modified_at: `${TODAY_ISO}T16:00:00.000Z`,
  body_json: [{ module: 'probe', heading: 'Probe', blocks: [{ type: 'p', claim_kind: 'analysis', text: 'Fixture body.' }] }],
  provenance: [],
};
const payload = path.join(tmp, 'payload.json');
fs.writeFileSync(payload, JSON.stringify({ ok: true, count: 1, featured: gameFile, articles: [gameFile] }));
try {
  execFileSync('python', [path.join(tmp, 'scripts/build_matchup_articles.py'), '--from-file', payload],
               { cwd: tmp, stdio: 'pipe' });
  for (const door of ['matchup-of-the-day/nfl/index.html', 'nfl-game-of-the-week/index.html']) {
    const html = fs.readFileSync(path.join(tmp, door), 'utf8');
    if (/played-nfl-game-file/.test(html)) bad(`bake: ${door} follows the newest Game File, a game already played`);
    else if (!/data-baked-href="\/nfl\/hand-built-live\/"/.test(html)) bad(`bake: ${door} does not name the registry feature`);
    else ok(`bake: ${door} names the registry feature, not the newest Game File`);
  }
  const after = JSON.parse(fs.readFileSync(path.join(tmp, 'data/featured-matchups.json'), 'utf8'));
  const reg9901 = after.sports.nfl.features.find((f) => f.id === 'game-file-9901');
  if (reg9901 && reg9901.kickoff_utc === iso(Math.floor(Date.parse(gameFile.game_time_utc) / 1000) * 1000)) {
    ok('bake: the published NFL Game File was registered with its real kickoff');
  } else {
    bad('bake: the NFL Game File was not registered: ' + JSON.stringify(reg9901));
  }
  if (fs.existsSync(path.join(tmp, 'matchup-of-the-day/played-nfl-game-file/index.html'))) {
    ok('bake: the Game File itself is still published at its permanent URL');
  } else {
    bad('bake: the Game File page was not written');
  }
} catch (err) {
  bad('bake failed: ' + String(err.stderr || err));
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

if (failures) { console.error(`\n${failures} failure(s)`); process.exit(1); }
console.log('\nfeatured matchups: one source of truth, holding');
