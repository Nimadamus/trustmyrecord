#!/usr/bin/env node
/**
 * MATCHUP_OF_THE_DAY — archive calendar guard.
 *
 * The daily feature's whole value is that the archive keeps growing and nothing
 * in it ever moves. The calendar is the surface where that promise is either
 * kept or quietly broken, and it breaks in ways nobody notices by looking:
 *
 *   - a square linking to the wrong day (an off-by-one from reading the UTC
 *     date instead of the published date, which is a real hazard here because
 *     the job publishes at 07:00 PT and that is the previous day in UTC),
 *   - a day with no article rendered as a link to nowhere,
 *   - yesterday's square silently repointed at today's article,
 *   - a month strip with a hole in it, so prev/next skips a month,
 *   - the dated index and the grid disagreeing about what exists.
 *
 * So this bakes a synthetic archive spanning three months, then checks the two
 * things that matter: every square points where it should, and publishing a new
 * day does not move any square that already existed.
 *
 * Offline. No network, no database — the real generator runs with --from-file
 * against a throwaway tree.
 *
 *   node tests/matchup-calendar-test.js
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
/* Dates are relative to the real clock. The generator marks "today" from the
   system date and the test cannot inject one, so the fixture is anchored to
   today instead of to a hard-coded day that would rot. */
const DISPLAY_TZ = 'America/Los_Angeles';

function todayInDisplayTz() {
  // en-CA gives YYYY-MM-DD, which is the only reason it is used here.
  const iso = new Intl.DateTimeFormat('en-CA', { timeZone: DISPLAY_TZ }).format(new Date());
  const [y, m, d] = iso.split('-').map(Number);
  return { y, m, d, iso };
}

const TODAY = todayInDisplayTz();

function shiftDays(base, delta) {
  const dt = new Date(Date.UTC(base.y, base.m - 1, base.d));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return {
    y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate(),
    iso: dt.toISOString().slice(0, 10),
  };
}

/* 16:00Z is 09:00 PT year round, so the display date always equals the date in
   the key. A fixture published at 02:00Z would be testing the timezone bug
   rather than the calendar. */
const at = (day) => `${day.iso}T16:00:00.000Z`;

function fixture(day, n) {
  return {
    id: 9100 + n,
    short_id: 9100 + n,
    sport: 'mlb',
    slug: `caltest-${day.iso}`,
    away_team: `Away ${n}`,
    home_team: `Home ${n}`,
    game_time_utc: `${day.iso}T23:10:00.000Z`,
    venue_name: 'Test Park',
    status: 'published',
    angle_key: `cal-angle-${n}`,
    angle_label: `Calendar probe ${n}`,
    title: `Calendar probe ${day.iso}`,
    h1: `Calendar probe ${day.iso}`,
    meta_description: 'Fixture used by the calendar regression test.',
    dek: 'Fixture used by the calendar regression test.',
    og_image_url: 'https://trustmyrecord.com/static/og/matchups/g1000.png',
    hero_image_url: '/static/media/matchups/g1000-hero.svg',
    hero_image_alt: 'Calendar probe cover',
    published_at: at(day),
    content_modified_at: at(day),
    body_json: [{ module: 'probe', heading: 'Probe',
                  blocks: [{ type: 'p', claim_kind: 'analysis', text: 'Fixture body.' }] }],
    provenance: [],
  };
}

/* Three months back, one month back, yesterday, today. The two older ones force
   a multi-month strip; the gap month in between is what proves the strip is
   continuous rather than a list of months that happen to have articles. */
const DAYS = {
  old:       shiftDays(TODAY, -70),
  mid:       shiftDays(TODAY, -35),
  yesterday: shiftDays(TODAY, -1),
  today:     TODAY,
};

const HISTORY = [fixture(DAYS.old, 1), fixture(DAYS.mid, 2), fixture(DAYS.yesterday, 3)];
const TODAY_ARTICLE = fixture(DAYS.today, 4);

/* ------------------------------------------------------------- the harness */
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tmr-calendar-'));
for (const rel of ['matchups', 'matchups/mlb', 'matchup-of-the-day', 'scripts']) {
  fs.mkdirSync(path.join(tmp, rel), { recursive: true });
}
for (const rel of ['scripts/build_matchup_articles.py', 'scripts/build_matchup_graphics.py',
                   'matchups/index.html', 'matchups/mlb/index.html',
                   'matchup-of-the-day/index.html']) {
  fs.copyFileSync(path.join(ROOT, rel), path.join(tmp, rel));
}
fs.writeFileSync(path.join(tmp, 'sitemap.xml'),
  '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n</urlset>\n');
fs.writeFileSync(path.join(tmp, 'index.html'),
  '<!DOCTYPE html><html><body>\n<!--MK:motdCover--><!--/MK:motdCover-->\n</body></html>\n');

function bake(articles, label) {
  const file = path.join(tmp, `${label}.json`);
  fs.writeFileSync(file, JSON.stringify({
    ok: true, count: articles.length, featured: articles[0] || null, articles,
  }));
  execFileSync('python', [path.join(tmp, 'scripts', 'build_matchup_articles.py'),
                          '--from-file', file],
               { cwd: tmp, stdio: 'pipe' });
  return fs.readFileSync(path.join(tmp, 'matchup-of-the-day', 'index.html'), 'utf8');
}

/* ------------------------------------------------------------- assertions */
const calendarOf = (html) => (html.match(/<!--MK:motdCalendar-->([\s\S]*?)<!--\/MK:motdCalendar-->/) || [])[1] || '';
const indexOf_ = (html) => (html.match(/<!--MK:motdByMonth-->([\s\S]*?)<!--\/MK:motdByMonth-->/) || [])[1] || '';

/** Every clickable square, as { month, day, href }. */
function squares(calendar) {
  const out = [];
  const months = calendar.split('<div class="gf-cal-month"').slice(1);
  for (const block of months) {
    const month = (block.match(/data-month="([\d-]+)"/) || [])[1];
    const re = /<a class="gf-cal-day[^"]*" href="([^"]+)"[^>]*><span class="gf-cal-n">(\d+)<\/span><\/a>/g;
    let hit;
    while ((hit = re.exec(block))) out.push({ month, day: Number(hit[2]), href: hit[1] });
  }
  return out;
}

const monthsIn = (calendar) =>
  [...calendar.matchAll(/data-month="([\d-]+)"/g)].map((m) => m[1]);

const key = (d) => `${String(d.y).padStart(4, '0')}-${String(d.m).padStart(2, '0')}`;

try {
  /* ---- 1. an archive that already has history ------------------------- */
  const before = bake(HISTORY, 'history');
  const cal1 = calendarOf(before);
  const sq1 = squares(cal1);

  if (sq1.length === HISTORY.length) ok(`history: ${sq1.length} clickable squares for ${HISTORY.length} articles`);
  else bad(`history: ${sq1.length} clickable squares for ${HISTORY.length} articles`);

  for (const [name, day] of [['old', DAYS.old], ['mid', DAYS.mid], ['yesterday', DAYS.yesterday]]) {
    const article = HISTORY.find((a) => a.published_at.startsWith(day.iso));
    const hit = sq1.find((s) => s.month === key(day) && s.day === day.d);
    if (hit && hit.href === `/matchup-of-the-day/${article.slug}/`) {
      ok(`history: ${day.iso} (${name}) links to its own article`);
    } else {
      bad(`history: ${day.iso} (${name}) links to ${hit ? hit.href : 'NOTHING'}, `
        + `expected /matchup-of-the-day/${article.slug}/`);
    }
  }

  /* The strip has to be continuous or prev/next teleports across the gap. */
  const months1 = monthsIn(cal1);
  const contiguous = months1.every((m, i) => {
    if (i === 0) return true;
    const [py, pm] = months1[i - 1].split('-').map(Number);
    const [cy, cm] = m.split('-').map(Number);
    return cy * 12 + cm === py * 12 + pm + 1;
  });
  if (contiguous && months1.length >= 3) ok(`history: ${months1.length} month(s), contiguous strip`);
  else bad(`history: month strip is ${months1.join(',')}`);

  if (months1[months1.length - 1] === key(TODAY)) ok('history: the strip runs up to the current month');
  else bad(`history: strip ends at ${months1[months1.length - 1]}, expected ${key(TODAY)}`);

  /* Ends of the strip are inert; everything between them navigates. */
  const blocks1 = cal1.split('<div class="gf-cal-month"').slice(1);
  const firstOff = (blocks1[0].match(/gf-cal-nav--off/g) || []).length;
  const lastOff = (blocks1[blocks1.length - 1].match(/gf-cal-nav--off/g) || []).length;
  const middleOff = blocks1.slice(1, -1).reduce((n, b) => n + (b.match(/gf-cal-nav--off/g) || []).length, 0);
  if (firstOff === 1 && lastOff === 1 && middleOff === 0) {
    ok('history: only the first month has no previous and only the last has no next');
  } else {
    bad(`history: disabled controls first=${firstOff} middle=${middleOff} last=${lastOff}`);
  }

  /* Every prev/next target must be a month that is actually on the page. */
  const targets = [...cal1.matchAll(/data-gf-cal-go="([\d-]+)"/g)].map((m) => m[1]);
  const dangling = targets.filter((t) => !months1.includes(t));
  if (!dangling.length) ok(`history: all ${targets.length} month control(s) resolve on the page`);
  else bad(`history: month controls point at absent months: ${[...new Set(dangling)].join(',')}`);

  /* Today has published nothing yet: it is marked, and it is not a link. */
  const todayCells = cal1.match(/<(a|span) class="gf-cal-day[^"]*gf-cal-day--today[^"]*"/g) || [];
  if (todayCells.length === 1) ok('history: exactly one square is marked as today');
  else bad(`history: ${todayCells.length} squares marked as today`);
  if (todayCells.length === 1 && todayCells[0].startsWith('<span')) {
    ok('history: today has not published, so its square is not a link');
  } else if (todayCells.length === 1) {
    bad('history: today has no article but its square is a link');
  }

  /* The dated index and the grid must describe the same archive. */
  const list1 = indexOf_(before);
  for (const a of HISTORY) {
    if (list1.includes(`/matchup-of-the-day/${a.slug}/`)) continue;
    bad(`history: the dated index is missing ${a.slug}`);
  }
  const listed = (list1.match(/<li>/g) || []).length;
  if (listed === HISTORY.length) ok(`history: the dated index lists all ${listed} article(s)`);
  else bad(`history: the dated index lists ${listed} of ${HISTORY.length}`);

  /* ---- 2. today publishes ---------------------------------------------- */
  /* THE point of the feature: a new day is added, and not one existing square
     moves. A calendar that repointed yesterday at today's article would look
     completely normal and would have destroyed the archive. */
  const after = bake([TODAY_ARTICLE, ...HISTORY], 'today');
  const cal2 = calendarOf(after);
  const sq2 = squares(cal2);

  const todayHit = sq2.find((s) => s.month === key(DAYS.today) && s.day === DAYS.today.d);
  if (todayHit && todayHit.href === `/matchup-of-the-day/${TODAY_ARTICLE.slug}/`) {
    ok("today: today's square links to today's article");
  } else {
    bad(`today: today's square links to ${todayHit ? todayHit.href : 'NOTHING'}`);
  }

  let moved = 0;
  for (const old of sq1) {
    const now = sq2.find((s) => s.month === old.month && s.day === old.day);
    if (!now) { moved += 1; bad(`today: ${old.month}-${old.day} disappeared from the calendar`); }
    else if (now.href !== old.href) {
      moved += 1;
      bad(`today: ${old.month}-${old.day} was repointed ${old.href} -> ${now.href}`);
    }
  }
  if (!moved) ok(`today: all ${sq1.length} existing square(s) still point at their own article`);

  if (sq2.length === sq1.length + 1) ok('today: exactly one square was added');
  else bad(`today: ${sq2.length - sq1.length} squares added, expected 1`);

  const todayCells2 = cal2.match(/<(a|span) class="gf-cal-day[^"]*gf-cal-day--today[^"]*"/g) || [];
  if (todayCells2.length === 1 && todayCells2[0].startsWith('<a')) {
    ok('today: the today marker is on the published square');
  } else {
    bad(`today: ${todayCells2.length} today marker(s), linked=${todayCells2[0] && todayCells2[0].startsWith('<a')}`);
  }

  /* ---- 3. the archive is never hidden from search ---------------------- */
  if (!/noindex/i.test(after)) ok('the hub is not noindexed');
  else bad('the hub carries a noindex');
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log('');
if (failures) {
  console.error(`${failures} calendar check(s) FAILED`);
  process.exit(1);
}
console.log('matchup calendar: every square points at its own day, and publishing a new day moves none of them');
