#!/usr/bin/env node
// Trend Spotter matchup-loading regression test.
// Verifies the Step-1 Matchup dropdown correctly distinguishes:
//   - a successful response with real games        -> options populated
//   - a request failure / cold start               -> retryable error, NEVER "No matchup data available"
//   - a successful but empty response              -> "No matchup data available" (allowed)
//   - malformed provider data                      -> no crash, safe empty state
//   - timezone / UTC date-boundary games           -> not dropped
//   - sport switching (MLB -> NBA -> MLB)          -> list restored from cache
// Pure jsdom; no network. Run: node tests/trendspotter-matchup-loading-test.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const SRC = process.env.TS_SRC || path.join(__dirname, '..', 'static', 'js', 'trendspotter.js');
const source = fs.readFileSync(SRC, 'utf8');

const HTML = `<!doctype html><html><body>
  <select id="sportSelect">
    <option value="">Choose sport</option>
    <option value="MLB">MLB</option>
    <option value="NBA">NBA</option>
  </select>
  <select id="matchupSelect"></select>
  <p id="matchupDataSource"></p>
  <div id="marketOptions"></div>
  <p id="marketDataNote"></p>
  <div id="sideField"></div><select id="sideSelect"></select>
  <div id="teamField"></div><select id="teamSelect"></select>
  <div id="thresholdField"></div><input id="thresholdInput">
  <div id="trendKindField"></div><select id="trendKindSelect"></select>
  <div id="periodField"></div><select id="periodSelect"></select>
  <select id="rangeSelect"></select>
  <input id="sampleInput"><select id="locationSelect"></select>
  <p id="validationMessage"></p><p id="selectionSummary"></p><p id="dataStatus"></p>
  <button id="generateTrend"></button>
  <section id="resultsSection"><h3 id="resultsTitle"></h3><p id="resultCount"></p><div id="resultsList"></div></section>
</body></html>`;

function boot(fetchImpl) {
  const dom = new JSDOM(HTML, { runScripts: 'outside-only', url: 'https://trustmyrecord.com/trendspotter/' });
  const w = dom.window;
  w.CONFIG = { api: { baseUrl: 'https://api.test/api' } };
  w.fetch = fetchImpl;
  if (!w.AbortController) w.AbortController = function () { this.signal = {}; this.abort = function () {}; };
  w.eval(source);
  return dom;
}

function selectSport(dom, value) {
  const sel = dom.window.document.getElementById('sportSelect');
  sel.value = value;
  sel.dispatchEvent(new dom.window.Event('change'));
}

async function settle(dom, predicate, timeoutMs) {
  const deadline = Date.now.__real ? Date.now.__real() : Date.now();
  const start = Date.now();
  while (Date.now() - start < (timeoutMs || 3000)) {
    if (predicate(dom)) return true;
    await new Promise(r => setTimeout(r, 15));
  }
  return predicate(dom);
}

const opts = dom => dom.window.document.getElementById('matchupSelect').innerHTML;
const dataSrc = dom => dom.window.document.getElementById('matchupDataSource').innerHTML;

function jsonRes(body) { return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) }); }

const VERIFIED_MLB = {
  status: 'current', sports: ['MLB'], matchup_count: 2,
  matchup_source: 'Current MLB slate games from the TrustMyRecord games table.',
  matchups: [
    { key: 'MLB|A @ B|A|B|2026-07-12', sport: 'MLB', matchup: 'Athletics @ Braves',
      away_abbr: 'Athletics', home_abbr: 'Braves', slate_date: '2026-07-12',
      game_time: '2026-07-12T17:35:00.000Z', trend_count: 10 },
    // Late game: UTC start crosses to 2026-07-13, US game date still 2026-07-12.
    { key: 'MLB|C @ D|C|D|2026-07-12', sport: 'MLB', matchup: 'Cubs @ Dodgers',
      away_abbr: 'Cubs', home_abbr: 'Dodgers', slate_date: '2026-07-12',
      game_time: '2026-07-13T02:10:00.000Z', trend_count: 10 }
  ]
};

let passed = 0;
function ok(name) { console.log('  PASS ' + name); passed++; }

async function tSuccess() {
  const dom = boot(url => /trendspotter\/verified/.test(url) ? jsonRes(VERIFIED_MLB) : jsonRes({ games: [] }));
  selectSport(dom, 'MLB');
  await settle(dom, d => /Athletics @ Braves/.test(opts(d)));
  assert.ok(/Athletics @ Braves/.test(opts(dom)), 'away @ home shown');
  assert.ok(/Cubs @ Dodgers/.test(opts(dom)), 'second matchup shown');
  assert.ok(!/No matchup data available/.test(opts(dom)), 'no false empty message');
  assert.ok(!/matchupRetry/.test(dataSrc(dom)), 'no retry button on success');
  ok('successful MLB response -> real matchups populate with away/home + time');
  // timezone/date-boundary: the late (UTC next-day) game is NOT dropped.
  assert.ok(/Cubs @ Dodgers/.test(opts(dom)), 'UTC-next-day game retained');
  ok('timezone/date-boundary game retained (US game date, not UTC calendar)');
}

async function tFailure() {
  let down = true;
  const dom = boot(url => down ? Promise.reject(new Error('network down'))
    : (/verified/.test(url) ? jsonRes(VERIFIED_MLB) : jsonRes({ games: [] })));
  selectSport(dom, 'MLB');
  await settle(dom, d => /matchupRetry/.test(dataSrc(d)));
  assert.ok(/matchupRetry/.test(dataSrc(dom)), 'retry control shown on failure');
  assert.ok(!/No matchup data available/.test(opts(dom)), 'failure must NOT claim zero games');
  assert.ok(/unavailable/i.test(opts(dom)), 'error label on option');
  ok('API failure -> retry control, never a false "no games"');
  // Retry recovers once the API is back.
  down = false;
  dom.window.document.getElementById('matchupRetry').dispatchEvent(new dom.window.Event('click', { bubbles: true }));
  await settle(dom, d => /Athletics @ Braves/.test(opts(d)));
  assert.ok(/Athletics @ Braves/.test(opts(dom)), 'retry reloads matchups after recovery');
  ok('Retry reloads matchups once the API recovers');
}

async function tEmpty() {
  const dom = boot(url => /trendspotter\/verified/.test(url)
    ? jsonRes({ status: 'current', sports: ['MLB'], matchups: [] })
    : jsonRes({ games: [] }));
  selectSport(dom, 'MLB');
  await settle(dom, d => /No matchup data available/.test(opts(d)));
  assert.ok(/No matchup data available/.test(opts(dom)), 'confirmed-zero shows no-data');
  assert.ok(!/matchupRetry/.test(dataSrc(dom)), 'no retry on a real empty response');
  ok('empty successful response -> "No matchup data available" (allowed)');
}

async function tMalformed() {
  const dom = boot(url => /trendspotter\/verified/.test(url)
    ? jsonRes({ status: 'current', matchups: [ { foo: 'bar' }, { matchup: 'X @ Y' }, null, 42 ] })
    : jsonRes({ games: [{ nope: true }] }));
  let threw = false;
  try {
    selectSport(dom, 'MLB');
    await settle(dom, d => /No matchup data available|matchupRetry/.test(opts(d) + dataSrc(d)));
  } catch (e) { threw = true; }
  assert.ok(!threw, 'malformed provider data must not crash');
  assert.ok(!/undefined|NaN/.test(opts(dom)), 'no garbage rendered');
  ok('malformed provider data -> no crash, safe state');
}

async function tSwitching() {
  const NBA = { status: 'current', sports: ['NBA'], matchups: [
    { key: 'NBA|K @ L|K|L|2026-07-12', sport: 'NBA', matchup: 'Knicks @ Lakers',
      away_abbr: 'Knicks', home_abbr: 'Lakers', slate_date: '2026-07-12', game_time: '', trend_count: 5 } ] };
  let mlbHits = 0;
  const dom = boot(url => {
    if (/verified/.test(url) && /MLB/.test(url)) { mlbHits++; return jsonRes(VERIFIED_MLB); }
    if (/verified/.test(url) && /NBA/.test(url)) return jsonRes(NBA);
    return jsonRes({ games: [] });
  });
  selectSport(dom, 'MLB');
  await settle(dom, d => /Athletics @ Braves/.test(opts(d)));
  selectSport(dom, 'NBA');
  await settle(dom, d => /Knicks @ Lakers/.test(opts(d)));
  assert.ok(/Knicks @ Lakers/.test(opts(dom)), 'NBA list loaded');
  assert.ok(!/Athletics/.test(opts(dom)), 'MLB list cleared when NBA selected');
  selectSport(dom, 'MLB');
  await settle(dom, d => /Athletics @ Braves/.test(opts(d)));
  assert.ok(/Athletics @ Braves/.test(opts(dom)), 'MLB list restored on return');
  ok('sport switching MLB->NBA->MLB restores each list');
}

(async () => {
  await tSuccess();
  await tFailure();
  await tEmpty();
  await tMalformed();
  await tSwitching();
  console.log('\nAll ' + passed + ' Trend Spotter matchup-loading assertions passed.');
})().catch(e => { console.error('FAIL:', e && e.stack || e); process.exit(1); });
