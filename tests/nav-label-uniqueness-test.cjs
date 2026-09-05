/**
 * NAV_LABEL_UNIQUENESS_20260905
 *
 * The Sportsbook menu, the footer Explore column and the link hub each carry
 * their own route table. On 2026-09-05 the same page was reachable under three
 * different names ('MLB Matchups Today', 'MLB Matchups', 'MLB Handicapping
 * Hub') and the section index was called 'Matchup of the Day' one word off the
 * menu's 'MLB Matchup of the Day'. On /sportsbook/ the menu's links render
 * inline above the footer, so both near-identical pairs landed on one screen
 * and read as a duplicated menu.
 *
 * Two rules, enforced across every table in the three nav sources. Scope is
 * the matchup family only (WATCHED below): the link hub deliberately writes
 * sentence-case contextual phrasing for general routes ('Pick marketplace' in a
 * related-links rail vs 'Pick Marketplace' in the nav), and that is copy, not a
 * duplicated menu item. The matchup routes are the ones a reader meets side by
 * side, so they are the ones held to one wording.
 *   1. ONE DESTINATION, ONE WORDING, for every watched route.
 *   2. ONE FEATURED DAILY ARTICLE PER SPORT. Exactly one entry may be named
 *      '<SPORT> Matchup of the Day', and no entry may be named bare 'Matchup
 *      of the Day' - that name cannot say which sport it opens.
 *
 * Source-level on purpose: no server, no browser, runs in under a second, and
 * it fails on the edit rather than on the deploy.
 *
 * Run:  node tests/nav-label-uniqueness-test.cjs
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SOURCES = [
  'static/js/tmr-ds-nav.js',
  'static/js/tmr-sitewide.js',
  'static/js/tmr-linkhub.js',
];

// The routes a reader meets side by side: the daily article doors, the full
// slate, and the section index they are all one word away from.
const WATCHED = /^\/(matchup-of-the-day|matchups|today)(\/|$)|^\/handicapping\/mlb\//;

// A route row is ['/path/', 'Label'] or ["/path/", "Label"], quotes either way.
const ROW = /\[\s*(['"])(\/[^'"]*)\1\s*,\s*(['"])([^'"]+)\3\s*\]/g;

// Comment bodies carry old labels as prose and must not be read as rows.
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
}

const byPath = new Map();   // path -> Map(label -> [source, ...])
const failures = [];

for (const rel of SOURCES) {
  const src = stripComments(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
  for (const m of src.matchAll(ROW)) {
    const [, , href, , label] = m;
    if (!byPath.has(href)) byPath.set(href, new Map());
    const labels = byPath.get(href);
    if (!labels.has(label)) labels.set(label, []);
    labels.get(label).push(rel);
  }
}

// Rule 1
for (const [href, labels] of byPath) {
  if (WATCHED.test(href) && labels.size > 1) {
    const shown = [...labels].map(([l, wh]) => `'${l}' (${[...new Set(wh)].join(', ')})`);
    failures.push(`${href} is named ${labels.size} different ways: ${shown.join('  vs  ')}`);
  }
}

// Rule 2
const featured = [];
for (const [href, labels] of byPath) {
  for (const label of labels.keys()) {
    if (/^Matchup of the Day$/i.test(label)) {
      failures.push(`${href} is labelled bare 'Matchup of the Day' - name the sport, or name the section something else`);
    }
    const sport = /^([A-Z]{2,6})\s+Matchup of the Day$/.exec(label);
    if (sport) featured.push({ sport: sport[1], href, label });
  }
}
const bySport = new Map();
for (const f of featured) {
  if (!bySport.has(f.sport)) bySport.set(f.sport, new Set());
  bySport.get(f.sport).add(f.href);
}
for (const [sport, hrefs] of bySport) {
  if (hrefs.size > 1) {
    failures.push(`${sport} Matchup of the Day points at ${hrefs.size} different pages: ${[...hrefs].join(', ')}`);
  }
}
if (!bySport.has('MLB')) failures.push(`no 'MLB Matchup of the Day' entry survives in the nav tables`);

if (failures.length) {
  console.error('NAV_LABEL_UNIQUENESS FAILED\n');
  for (const f of failures) console.error('  - ' + f);
  process.exit(1);
}
const watched = [...byPath.keys()].filter((h) => WATCHED.test(h));
console.log(`NAV_LABEL_UNIQUENESS PASS - ${watched.length} matchup routes, one label each; ` +
  `featured lanes: ${[...bySport.keys()].sort().join(', ')}`);
