#!/usr/bin/env node
/* SIM_PAGE_FRESHNESS_20261113. Read only alarm for baked simulator pages.
 * From 11/12 12:50 AM PT to 11/13 the hourly bake published nothing (a failed gate) and the
 * pages kept saying "Next NBA games: Wednesday, November 11" for 40 hours. Nothing looked at
 * the pages themselves. This reads the served pages and says which ones are behind:
 *   - season and playoff pages: the "read <date> at <time> PT" stamp is older than the limit
 *   - NBA and NHL game pages:   the "Next <LEAGUE> games: <date>" block names a day before today (PT)
 *   - NFL and NHL handicapping hubs: the "Updated <date>, <time> ET" stamp is over 16 hours old
 * Usage: node scripts/check-sim-page-freshness.js [--base https://trustmyrecord.com] [--max-age-h 6] [--json]
 * Exit 0 fresh, 1 stale or unreadable. It never writes anything. */
'use strict';
const STAMPED = ['nba-season-simulator', 'nhl-season-simulator', 'nfl-season-simulator',
  'nba-playoff-simulator', 'nhl-playoff-simulator', 'nfl-playoff-simulator'];
const SLATE = { 'nba-simulator': 'NBA', 'nhl-simulator': 'NHL' };
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const PT = 'America/Los_Angeles';

function ptParts(d) {
  const o = {};
  new Intl.DateTimeFormat('en-US', { timeZone: PT, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', hourCycle: 'h23' })
    .formatToParts(d).forEach((p) => { o[p.type] = Number(p.value); });
  return o;
}
function ptDay(d) { const p = ptParts(d); return p.year * 10000 + p.month * 100 + p.day; }
/* A wall clock time in Pacific to an instant, right on either side of a clock change. */
function ptToDate(y, mo, d, h, mi) {
  for (const off of [8, 7]) {
    const t = new Date(Date.UTC(y, mo - 1, d, h + off, mi));
    if (ptParts(t).hour === h) return t;
  }
  return new Date(Date.UTC(y, mo - 1, d, h + 8, mi));
}
const READ_RE = new RegExp(`read (${MONTHS.join('|')}) (\\d{1,2}), (\\d{4}) at (\\d{1,2}):(\\d{2}) (AM|PM) PT`);
function readStamp(html) {
  const m = html.match(READ_RE);
  if (!m) return null;
  const h = (Number(m[4]) % 12) + (m[6] === 'PM' ? 12 : 0);
  return ptToDate(Number(m[3]), MONTHS.indexOf(m[1]) + 1, Number(m[2]), h, Number(m[5]));
}
function nextSlateDay(html, league) {
  const m = html.match(new RegExp(`Next ${league} games: [A-Za-z]+, (${MONTHS.join('|')}) (\\d{1,2}), (\\d{4})`));
  return m ? Number(m[3]) * 10000 + (MONTHS.indexOf(m[1]) + 1) * 100 + Number(m[2]) : null;
}

/* HUB_FRESHNESS_20261113. The Handicapping hub bake failed every run from 9:59 AM PT on
   11/13/2026 (one NCAAF line crashed it for every sport) and nothing noticed for hours: the NFL
   and NHL hubs kept "Updated Nov 12" and Thursday's finished games. The hubs print
   "Updated Nov 13, 2026, 7:15 PM ET"; the bake runs four times a day with a 12 hour overnight
   gap, so anything older than HUB_MAX_AGE_H means runs are being missed. */
const HUBS = ['handicapping/nfl', 'handicapping/nhl'];
const HUB_MAX_AGE_H = 16;
const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const HUB_RE = new RegExp(`Updated (${SHORT.join('|')})[a-z]* (\\d{1,2}), (\\d{4}), (\\d{1,2}):(\\d{2}) (AM|PM) ET`);
function etHour(d) {
  return Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', hourCycle: 'h23' }).format(d));
}
function hubStamp(html) {
  const m = html.match(HUB_RE);
  if (!m) return null;
  const h = (Number(m[4]) % 12) + (m[6] === 'PM' ? 12 : 0);
  const y = Number(m[3]), mo = SHORT.indexOf(m[1]), d = Number(m[2]), mi = Number(m[5]);
  for (const off of [5, 4]) {           // EST, then EDT: keep the one that reads back as the same hour
    const t = new Date(Date.UTC(y, mo, d, h + off, mi));
    if (etHour(t) === h) return t;
  }
  return new Date(Date.UTC(y, mo, d, h + 5, mi));
}

/* pages: { route: html or null }. Returns a list of problems, empty when fresh. */
function evaluate(pages, now, maxAgeH, hubMaxAgeH = HUB_MAX_AGE_H) {
  const out = [];
  for (const p of HUBS) {
    if (!(p in pages)) continue;          // a caller that did not fetch the hubs is not judged on them
    const html = pages[p];
    if (html == null) { out.push({ page: p, problem: 'page did not answer' }); continue; }
    const at = hubStamp(html);
    if (!at) { out.push({ page: p, problem: 'no "Updated <date>, <time> ET" stamp on the hub' }); continue; }
    const age = (now - at) / 36e5;
    if (age > hubMaxAgeH) out.push({ page: p, problem: `hub last rebuilt ${age.toFixed(1)} h ago (limit ${hubMaxAgeH} h)`, age_h: Number(age.toFixed(1)) });
  }
  for (const p of STAMPED) {
    const html = pages[p];
    if (html == null) { out.push({ page: p, problem: 'page did not answer' }); continue; }
    const at = readStamp(html);
    if (!at) { out.push({ page: p, problem: 'no "read <date> at <time> PT" stamp on the page' }); continue; }
    const age = (now - at) / 36e5;
    if (age > maxAgeH) out.push({ page: p, problem: `built ${age.toFixed(1)} h ago (limit ${maxAgeH} h)`, age_h: Number(age.toFixed(1)) });
  }
  for (const p of Object.keys(SLATE)) {
    const html = pages[p];
    if (html == null) { out.push({ page: p, problem: 'page did not answer' }); continue; }
    const day = nextSlateDay(html, SLATE[p]);
    if (day == null) continue; /* no slate block: off season or between rounds, not a staleness signal */
    if (day < ptDay(now)) out.push({ page: p, problem: `"Next ${SLATE[p]} games" names ${day}, which is before today in Pacific time` });
  }
  return out;
}

module.exports = { evaluate, readStamp, nextSlateDay, ptToDate, ptDay, hubStamp, STAMPED, SLATE, HUBS, HUB_MAX_AGE_H };

if (require.main === module) {
  const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
  const base = arg('--base', 'https://trustmyrecord.com').replace(/\/$/, '');
  const maxAgeH = Number(arg('--max-age-h', '6'));
  (async () => {
    const pages = {};
    for (const p of STAMPED.concat(Object.keys(SLATE), HUBS)) {
      try {
        const r = await fetch(`${base}/${p}/?fresh=${Date.now()}`, { headers: { 'cache-control': 'no-cache' } });
        pages[p] = r.ok ? await r.text() : null;
      } catch (e) { pages[p] = null; }
    }
    const now = new Date();
    const problems = evaluate(pages, now, maxAgeH);
    const when = now.toLocaleString('en-US', { timeZone: PT, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' PT';
    if (process.argv.includes('--json')) console.log(JSON.stringify({ checked_at: when, fresh: !problems.length, problems }));
    else if (!problems.length) console.log(`sim page freshness: all ${STAMPED.length + Object.keys(SLATE).length + HUBS.length} pages fresh at ${when}`);
    else { console.log(`sim page freshness: ${problems.length} problem(s) at ${when}`); problems.forEach((x) => console.log(`  /${x.page}/: ${x.problem}`)); }
    process.exit(problems.length ? 1 : 0);
  })();
}
