'use strict';
/* PREDICTIONS_STALE_GUARD_20261113. /predictions/ renders static/data/mlb-run-predictions-latest.json.
   On 2026-11-13 that file still held the May 10, 2026 slate and the page presented 15 finished
   games as "the current model run". This locks the guard: a slate dated before today (Pacific)
   is labelled an archive, on the page and on every card. */
const fs = require('fs'), path = require('path'), vm = require('vm');
const html = fs.readFileSync(path.join(__dirname, '..', 'predictions', 'index.html'), 'utf8');
let pass = 0, fail = 0;
const ok = (n, c, d) => { if (c) pass++; else { fail++; console.log('  FAIL ' + n + (d ? ' :: ' + d : '')); } };
const grab = (name) => { const i = html.indexOf('function ' + name + '('); if (i < 0) return ''; let d = 0, j = html.indexOf('{', i);
  for (let k = j; k < html.length; k++) { if (html[k] === '{') d++; else if (html[k] === '}' && --d === 0) return html.slice(i, k + 1); } return ''; };
const src = grab('runAge') + '\n' + grab('staleBanner');
ok('page defines runAge and staleBanner', /function runAge/.test(src) && /function staleBanner/.test(src));
const ctx = { Intl, Date, Math, String, escapeHtml: (s) => String(s) }; vm.createContext(ctx); vm.runInContext(src, ctx);
const at = (iso) => new Date(iso);
const may = ctx.runAge({ game_date: '2026-05-10' }, at('2026-11-13T17:00:00Z'));
ok('May 10 slate read on Nov 13 is stale by 187 days', may.stale === true && may.days === 187 && may.label === 'May 10, 2026', JSON.stringify(may));
ok('a slate dated today is current', ctx.runAge({ game_date: '2027-03-25' }, at('2027-03-25T20:00:00Z')).stale === false);
ok('late evening Pacific still counts as the same day (UTC has rolled over)', ctx.runAge({ game_date: '2027-03-25' }, at('2027-03-26T05:30:00Z')).stale === false);
ok('the next Pacific morning it is stale by 1 day', ctx.runAge({ game_date: '2027-03-25' }, at('2027-03-26T15:00:00Z')).days === 1);
ok('a missing or malformed date is treated as stale', ctx.runAge({}, at('2026-11-13T17:00:00Z')).stale === true && ctx.runAge({ game_date: '5/10/2026' }).stale === true);
ok('a current run prints no banner', ctx.staleBanner({ stale: false }) === '');
const b = ctx.staleBanner(may);
ok('a stale run prints the archive banner with date and age', /not today's slate/.test(b) && /May 10, 2026, 187 days ago/.test(b) && /not current predictions/.test(b), b);
ok('the banner is rendered ahead of the cards', /grid\.innerHTML = staleBanner\(age\) \+/.test(html));
ok('cards are labelled as archived when stale', /ARCHIVED \? 'Archived run \| '/.test(html) && /ARCHIVED = age\.stale/.test(html));
ok('static copy no longer claims "the current model run"', !/from the current model run/.test(html) && !/Loading latest run predictions/.test(html));
console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
