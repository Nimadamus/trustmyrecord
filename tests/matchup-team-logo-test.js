#!/usr/bin/env node
/**
 * TEAM_LOGO_PIPELINE_20260903 — the guard that keeps club marks permanent.
 *
 * The fixture card on a Game File used to print whatever logo the ARTICLE
 * RECORD carried. Nothing in the bake knew what a club's mark was, so the first
 * college piece shipped a hand-drawn "CU"/"GT" roundel at 30px and every new
 * club would have needed a human to go and find one. scripts/team_logos.py now
 * resolves the mark from the TEAM. This test is what stops that quietly coming
 * undone.
 *
 * It is offline and file-only, which is why it is wired into `npm run test:seo`
 * — the script the Regression Lock runs on every push to main and every PR.
 * Anything slower would not have earned a place there.
 *
 * What it refuses to let happen again:
 *   1. a hero with no club mark at all
 *   2. a mark whose file is not in the repo (the broken-image case)
 *   3. a mark that belongs to a DIFFERENT club than the card names
 *   4. an initials badge standing in for a club the registry actually knows
 *   5. the mark being shrunk back to a decoration
 *
 *   node tests/matchup-team-logo-test.js
 */

'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.dirname(__dirname);
const MOTD = path.join(ROOT, 'matchup-of-the-day');
const CSS = path.join(ROOT, 'static', 'css', 'tmr-article.css');
const REGISTRY = path.join(ROOT, 'data', 'team-logos.json');

let failures = 0;
function ok(msg) { console.log('  ok    ' + msg); }
function bad(msg) { console.log('  FAIL  ' + msg); failures++; }

function slug(v) {
  return String(v || '').toLowerCase()
    .normalize('NFKD').replace(/[^\x00-\x7f]/g, '')
    .replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
function decode(v) {
  return String(v || '').replace(/&amp;/g, '&').replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

/* ------------------------------------------------------------- the registry */

assert.ok(fs.existsSync(REGISTRY),
  'data/team-logos.json is missing — the whole pipeline resolves through it. ' +
  'Regenerate with: python scripts/build_team_logo_registry.py');
const registry = JSON.parse(fs.readFileSync(REGISTRY, 'utf8'));
const sportsKnown = Object.keys(registry.sports || {});
assert.ok(sportsKnown.length >= 6,
  'the registry covers only ' + sportsKnown.join(', ') + '; expected at least ' +
  'mlb, nba, nfl, nhl, ncaaf and ncaab');

const teamCount = sportsKnown.reduce(
  (n, s) => n + (registry.sports[s].teams || []).length, 0);
assert.ok(teamCount > 900,
  'the registry holds only ' + teamCount + ' clubs; it looks truncated');
ok(teamCount + ' clubs across ' + sportsKnown.length + ' leagues in the registry');

/* Every spelling that resolves to exactly one club, per sport — the same rule
   team_logos.py applies, so this test agrees with the bake by construction. */
const index = {};
for (const sport of sportsKnown) {
  const seen = new Map();
  for (const t of registry.sports[sport].teams || []) {
    const keys = [t.display, t.slug, t.short,
                  (t.location || '') + ' ' + (t.nick || ''), t.location, t.nick, t.abbr];
    for (const k of keys) {
      const key = slug(k);
      if (!key) continue;
      if (seen.has(key) && (seen.get(key) || {}).id !== t.id) seen.set(key, null);
      else if (!seen.has(key)) seen.set(key, t);
    }
  }
  index[sport] = seen;
}

/* ----------------------------------------------------------- the Game Files */

console.log('\nGame File club marks');

const dirs = fs.existsSync(MOTD)
  ? fs.readdirSync(MOTD).filter(
      d => fs.existsSync(path.join(MOTD, d, 'index.html')))
  : [];
assert.ok(dirs.length, 'no Game Files on disk to check');

let cards = 0;
let official = 0;
for (const dir of dirs) {
  const file = path.join(MOTD, dir, 'index.html');
  const html = fs.readFileSync(file, 'utf8');
  const sport = (html.match(/"sport"\s*:\s*"([a-z]+)"/) ||
                 html.match(/data-sport="([a-z]+)"/) || [])[1] || '';

  const sides = html.match(
    /<div class="ed-team ed-team--(?:away|home)">[\s\S]*?<\/div>/g) || [];
  if (!sides.length) continue;                      // a door page, not a card
  cards++;

  if (sides.length !== 2) {
    bad(dir + ': the fixture card has ' + sides.length + ' sides, not 2');
    continue;
  }

  for (const block of sides) {
    const img = block.match(/<img class="ed-team-logo" src="([^"]+)" alt="([^"]*)"/);
    const city = decode((block.match(/ed-team-city">([^<]*)/) || [])[1]);
    const nick = decode((block.match(/ed-team-nick">([^<]*)/) || [])[1]);
    const name = (city + ' ' + nick).trim();

    if (!img) { bad(dir + ' / ' + name + ': no club mark in the hero'); continue; }
    const [, src, alt] = img;

    const onDisk = path.join(ROOT, src.replace(/^\//, ''));
    if (!fs.existsSync(onDisk)) {
      bad(dir + ' / ' + name + ': ' + src + ' is not in the repo (broken image)');
      continue;
    }
    if (fs.statSync(onDisk).size < 512) {
      bad(dir + ' / ' + name + ': ' + src + ' is a stub, ' +
          fs.statSync(onDisk).size + ' bytes');
      continue;
    }

    const isFallback = src.indexOf('/logos/fallback/') !== -1;
    if (!isFallback) official++;

    /* The mark must belong to the club the card names. A logo pointing at the
       wrong team is the one failure worse than no logo at all. */
    const base = path.basename(src).replace(/-dark(\.\w+)$/, '$1');
    if (!isFallback && base.indexOf(slug(name)) === -1) {
      bad(dir + ': the card says ' + JSON.stringify(name) +
          ' and the mark is ' + base);
    }
    if (alt.toLowerCase() !== (name + ' logo').toLowerCase() &&
        alt.toLowerCase().indexOf(slug(nick).replace(/-/g, ' ')) === -1) {
      bad(dir + ' / ' + name + ': alt text is ' + JSON.stringify(alt));
    }

    /* An initials badge is the safety net, not the destination. If the club is
       in the registry, the article has no business showing a badge. */
    if (isFallback && index[sport] && index[sport].get(slug(name))) {
      bad(dir + ' / ' + name + ': fell back to an initials badge for a club ' +
          'the ' + sport + ' registry knows. Re-run the bake with network access.');
    }
  }
}
if (!failures) {
  ok(cards + ' fixture card(s): both sides carry a club mark that is in the repo ' +
     'and belongs to the club the card names');
  ok(official + ' of ' + (cards * 2) + ' side(s) resolved an official mark');
}

/* ------------------------------------------------------------------ the CSS */

console.log('\nthe mark is presented, not decorated');

const css = fs.readFileSync(CSS, 'utf8');

/* Every rule that sizes the mark, base and cover and phone alike. The smallest
   width any of them can produce is what a reader on some screen actually gets,
   so that is the number this guards — not whichever rule happens to be first. */
const sizingRules = [];
const ruleRe = /([^{}]*\.ed-team-logo[^{}]*)\{([^}]*)\}/g;
let m;
while ((m = ruleRe.exec(css)) !== null) {
  const body = m[2];
  if (!/width\s*:/.test(body)) continue;
  const clamped = body.match(/width:\s*clamp\(\s*([\d.]+)px/);
  const fixed = body.match(/width:\s*([\d.]+)px/);
  const floor = parseFloat((clamped ? clamped[1] : (fixed ? fixed[1] : '0')));
  sizingRules.push({ selector: m[1].trim().replace(/\s+/g, ' '), floor: floor });
}
assert.ok(sizingRules.length,
  'nothing in tmr-article.css sizes .ed-team-logo any more');

const smallest = sizingRules.reduce(
  (lo, r) => (r.floor && r.floor < lo.floor ? r : lo), sizingRules[0]);
if (!smallest.floor || smallest.floor < 48) {
  bad('.ed-team-logo can render at ' + smallest.floor + 'px via "' +
      smallest.selector + '". The card went to real logos BECAUSE a 30px ' +
      'roundel did not identify the teams; anything under 48px is that ' +
      'regression coming back.');
} else {
  ok(sizingRules.length + ' sizing rule(s), smallest ' + smallest.floor +
     'px ("' + smallest.selector + '")');
}

const base = (css.match(/body\.tmr-ds \.ed-team-logo \{[^}]*\}/) || [])[0] || '';
assert.ok(base, 'body.tmr-ds .ed-team-logo has no rule in tmr-article.css');

/* Square on both sides. An aspect that differs left to right is how the strip
   stopped being symmetrical the last time this was sized by height alone. */
if (!/height:\s*clamp\(/.test(base) || !/object-fit:\s*contain/.test(base)) {
  bad('.ed-team-logo must box both sides identically (a clamped height) and ' +
      'letterbox the mark inside it (object-fit: contain)');
} else {
  ok('both sides are boxed identically and the mark is letterboxed, not cropped');
}

/* ------------------------------------------------------------ the pipeline */

console.log('\nthe pipeline itself');

for (const rel of ['scripts/team_logos.py', 'scripts/build_team_logo_registry.py']) {
  if (!fs.existsSync(path.join(ROOT, rel))) bad(rel + ' is gone');
}
const bake = fs.readFileSync(
  path.join(ROOT, 'scripts', 'build_matchup_articles.py'), 'utf8');
if (!/^from team_logos import team_logo/m.test(bake)) {
  bad('build_matchup_articles.py no longer resolves marks through team_logos. ' +
      'Every future Game File would go back to printing whatever its record ' +
      'happened to carry.');
} else {
  ok('the bake resolves every club mark through scripts/team_logos.py');
}

/* The cache has to live where the daily workflow already commits, or a club the
   site covers for the first time ships an article whose logo is not in the repo. */
const logos = fs.readFileSync(path.join(ROOT, 'scripts', 'team_logos.py'), 'utf8');
if (!/CACHE_REL = "\/static\/media\/matchups\/logos"/.test(logos)) {
  bad('team_logos.py caches outside static/media/matchups. That directory is ' +
      'the one matchup-of-the-day.yml git-adds; anywhere else and a new club\'s ' +
      'mark never reaches the repo.');
} else {
  ok('marks cache under static/media/matchups/logos, which the daily job commits');
}

console.log('');
if (failures) {
  console.log('MATCHUP TEAM LOGO GUARD FAILED (' + failures + ' problem(s))');
  process.exit(1);
}
console.log('matchup team logos: every Game File shows its clubs\' own marks');
