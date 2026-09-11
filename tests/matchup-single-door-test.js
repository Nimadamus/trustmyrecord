#!/usr/bin/env node
/**
 * MATCHUP OF THE DAY — one article behind the door.
 *
 * PERMANENT RULE (Nima, 2026-09-11). "Matchup of the Day" is ONE featured
 * matchup article. Clicking it in the nav, on a card or on a button opens that
 * article. There is never an intermediate landing, index or preview page
 * listing several of them, and there are never three Matchups of the Day for
 * one sport on one day. The complete daily slate belongs to that sport's
 * HANDICAPPING HUB.
 *
 * This broke once and it broke quietly: the bake used to branch, and a sport
 * whose newest day carried more than one piece got a list page instead of the
 * handoff. Tennis published three on 2026-09-11, so a reader clicking "Tennis
 * Matchup of the Day" landed on "3 matchups written today" and had to choose.
 * The generator is the only thing that writes those doors, so the generator is
 * where the guarantee is tested.
 *
 * Offline. No network, no database — the real generator runs with --from-file
 * against a throwaway tree.
 *
 *   node tests/matchup-single-door-test.js
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');

let failures = 0;
const ok = (m) => console.log('  ok    ' + m);
const bad = (m) => { failures += 1; console.error('  FAIL  ' + m); };

/* ------------------------------------------------------------ the fixture */
const DISPLAY_TZ = 'America/Los_Angeles';
const TODAY_ISO = new Intl.DateTimeFormat('en-CA', { timeZone: DISPLAY_TZ }).format(new Date());

/* 16:00Z is 09:00 PT year round, so the display date always equals the date in
   the key and this is not accidentally a timezone test. */
function fixture(n, sport, slug, when) {
  return {
    id: 9300 + n,
    short_id: 9300 + n,
    sport,
    slug,
    away_team: `Away ${n}`,
    home_team: `Home ${n}`,
    game_time_utc: `${TODAY_ISO}T23:10:00.000Z`,
    venue_name: 'Test Court',
    status: 'published',
    angle_key: `door-angle-${n}`,
    angle_label: `Door probe ${n}`,
    title: `Door probe ${n}`,
    h1: `Door probe ${n}`,
    meta_description: 'Fixture used by the single-door regression test.',
    dek: 'Fixture used by the single-door regression test.',
    og_image_url: 'https://trustmyrecord.com/static/og/matchups/g1000.png',
    hero_image_url: '/static/media/matchups/g1000-hero.svg',
    hero_image_alt: 'Door probe cover',
    featured_on: `${TODAY_ISO}T00:00:00.000Z`,
    published_at: when,
    content_modified_at: when,
    body_json: [{ module: 'probe', heading: 'Probe',
                  blocks: [{ type: 'p', claim_kind: 'analysis', text: 'Fixture body.' }] }],
    provenance: [],
  };
}

/* THE EXACT SHAPE THAT USED TO PRODUCE THE INDEX PAGE: three tennis pieces on
   one day, newest first, plus a single-piece sport alongside to prove the door
   for a quiet sport is unchanged. */
const ARTICLES = [
  fixture(1, 'tennis', 'door-tennis-newest', `${TODAY_ISO}T18:00:00.000Z`),
  fixture(2, 'tennis', 'door-tennis-middle', `${TODAY_ISO}T17:00:00.000Z`),
  fixture(3, 'tennis', 'door-tennis-oldest', `${TODAY_ISO}T16:00:00.000Z`),
  fixture(4, 'mlb', 'door-mlb-only', `${TODAY_ISO}T15:00:00.000Z`),
];

/* ------------------------------------------------------------- the harness */
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tmr-motd-door-'));
for (const rel of ['matchups', 'matchups/mlb', 'matchups/tennis', 'matchup-of-the-day',
                   'scripts', 'data', 'handicapping/tennis']) {
  fs.mkdirSync(path.join(tmp, rel), { recursive: true });
}
/* Any new file the bake imports has to be added here AND to
   matchup-hub-reset-test.js and matchup-calendar-test.js, or the sandbox bake
   dies on ModuleNotFoundError and the runner's gate eats the day. */
for (const rel of ['scripts/build_matchup_articles.py', 'scripts/build_matchup_graphics.py',
                   'scripts/schema_event.py', 'scripts/team_logos.py',
                   'data/team-logos.json',
                   'matchups/index.html', 'matchups/mlb/index.html',
                   'matchup-of-the-day/index.html',
                   'handicapping/tennis/index.html']) {
  fs.copyFileSync(path.join(ROOT, rel), path.join(tmp, rel));
}
fs.writeFileSync(path.join(tmp, 'sitemap.xml'),
  '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n</urlset>\n');
fs.writeFileSync(path.join(tmp, 'index.html'),
  '<!DOCTYPE html><html><body>\n<!--MK:motdCover--><!--/MK:motdCover-->\n</body></html>\n');

const file = path.join(tmp, 'doors.json');
fs.writeFileSync(file, JSON.stringify({
  ok: true, count: ARTICLES.length, featured: ARTICLES[0], articles: ARTICLES,
}));
execFileSync('python', [path.join(tmp, 'scripts', 'build_matchup_articles.py'),
                        '--from-file', file], { cwd: tmp, stdio: 'pipe' });

const doorOf = (sport) =>
  fs.readFileSync(path.join(tmp, 'matchup-of-the-day', sport, 'index.html'), 'utf8');

/* ------------------------------------------------------------- assertions */
try {
  for (const [sport, expected] of [['tennis', 'door-tennis-newest'], ['mlb', 'door-mlb-only']]) {
    const html = doorOf(sport);
    const target = `/matchup-of-the-day/${expected}/`;

    /* 1. ONE article link, and it is the newest piece for that sport. */
    const hrefs = [...html.matchAll(/href="(\/matchup-of-the-day\/[^"]+)"/g)]
      .map((m) => m[1])
      .filter((h) => h !== `/matchup-of-the-day/${sport}/`);
    const distinct = [...new Set(hrefs)];
    if (distinct.length === 1 && distinct[0] === target) {
      ok(`${sport}: the door carries exactly one article link, ${target}`);
    } else {
      bad(`${sport}: door links to ${distinct.length ? distinct.join(', ') : 'NOTHING'}, `
        + `expected only ${target}`);
    }

    /* 2. It OPENS that article rather than offering it. A reader who clicks
          "Matchup of the Day" must never have to click again. */
    if (html.includes(`location.replace('${target}')`) && html.includes(`url=${target}`)) {
      ok(`${sport}: hands off to the article (meta refresh + location.replace)`);
    } else {
      bad(`${sport}: the door does not hand off to ${target}`);
    }

    /* 3. It canonicalises TO the article, so search holds the permanent URL. */
    if (html.includes(`<link rel="canonical" href="https://trustmyrecord.com${target}">`)) {
      ok(`${sport}: canonical points at the article`);
    } else {
      bad(`${sport}: canonical does not point at ${target}`);
    }

    /* 4. NO MULTI-ARTICLE INDEX, in any wording. This is the regression. */
    if (!/matchups written today/i.test(html) && !/<ol[\s>]/i.test(html)) {
      ok(`${sport}: no list, index or "choose one" page`);
    } else {
      bad(`${sport}: the door rendered a multi-article index page`);
    }
  }

  /* 5. The pieces that did not win the door are still published and still in
        the archive. Removing the index page must not lose them. */
  for (const slug of ['door-tennis-middle', 'door-tennis-oldest']) {
    if (fs.existsSync(path.join(tmp, 'matchup-of-the-day', slug, 'index.html'))) {
      ok(`${slug}: still published at its own permanent URL`);
    } else {
      bad(`${slug}: was not written`);
    }
  }
  const hub = fs.readFileSync(path.join(tmp, 'matchup-of-the-day', 'index.html'), 'utf8');
  if (['door-tennis-middle', 'door-tennis-oldest']
      .every((s) => hub.includes(`/matchup-of-the-day/${s}/`))) {
    ok('archive: the non-featured pieces are listed on the hub');
  } else {
    bad('archive: a non-featured piece is not reachable from the hub');
  }

  /* 6. A sport the nav links to that has never published gets a graceful door
        pointing at its handicapping hub, not a 404 and not a list. */
  const empty = fs.readFileSync(path.join(tmp, 'matchup-of-the-day', 'nfl', 'index.html'), 'utf8');
  if (empty.includes('/handicapping/nfl/') && !/matchups written today/i.test(empty)) {
    ok('nfl: no featured article, so the door points at the handicapping hub');
  } else {
    bad('nfl: the empty door is wrong');
  }
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log(failures ? `\n${failures} failure(s)` : '\nall checks passed');
process.exit(failures ? 1 : 0);
