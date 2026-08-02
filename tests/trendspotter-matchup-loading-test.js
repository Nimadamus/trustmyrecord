#!/usr/bin/env node
// Trend Spotter matchup-loading regression test.
//
// Rewritten 2026-08-01 for the workspace redesign. The slate now comes from
// GET /trendspotter/matchups (already deduped and franchise-resolved) instead
// of being assembled in the browser, so what this file guards is the loading
// CONTRACT — the distinction the old build kept getting wrong:
//
//   - a successful response with games   -> cards render
//   - a request failure / cold start     -> retryable error, NEVER "no games"
//   - a successful but empty response    -> an honest "no games scheduled"
//   - a slow response                    -> a loading state, never a false empty
//   - malformed provider data            -> no crash, no half-rendered card
//   - league switching                   -> the slate reloads for the new league
//   - a long slate                       -> capped with an explicit "show all N"
//
// Pure jsdom; no network. Run: node tests/trendspotter-matchup-loading-test.js

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const root = path.resolve(__dirname, '..');
const rawHtml = fs.readFileSync(path.join(root, 'trendspotter', 'index.html'), 'utf8');
const js = fs.readFileSync(process.env.TS_SRC || path.join(root, 'static', 'js', 'trendspotter.js'), 'utf8');

let passed = 0;
const failures = [];
async function test(name, fn) {
  try { await fn(); passed++; console.log(`  ok  ${name}`); }
  catch (error) { failures.push({ name, error }); console.log(`FAIL  ${name}\n      ${error.message}`); }
}

const CAPABILITIES = {
  sports: ['MLB', 'NBA'].map((id) => ({
    id, label: id, markets: ['moneyline', 'spread', 'total'],
    situations: [{ id: 'any', label: 'All games' }],
    spread_label: id === 'MLB' ? 'Run Line' : 'Spread', score_unit: 'runs',
    teams: [
      { id: 'SF', name: 'San Francisco Giants', aliases: ['San Francisco Giants'] },
      { id: 'LAD', name: 'Los Angeles Dodgers', aliases: ['Los Angeles Dodgers'] },
    ],
    priced_markets: ['moneyline'],
  })),
  unavailable_sports: [],
  unavailable_markets: [],
  market_labels: {},
};

function game(i, overrides) {
  return Object.assign({
    id: 'g' + i, sport: 'MLB',
    away_team: 'Los Angeles Dodgers', home_team: 'San Francisco Giants',
    away_id: 'LAD', home_id: 'SF',
    commence_time: '2026-08-02T02:15:00.000Z',
    doubleheader_game: null, starters: null,
    market: { book: 'DraftKings', home_ml: -140, away_ml: 120, home_spread: -1.5, total: 8.5 },
  }, overrides || {});
}

/** Mount the page with a controllable matchups responder. */
async function mount(matchupsResponder) {
  const virtualConsole = new VirtualConsole();
  const pageErrors = [];
  virtualConsole.on('jsdomError', (e) => pageErrors.push(e.message));

  const html = rawHtml
    .replace(/<script src="\/static\/js\/config\.js[^>]*><\/script>/, '')
    .replace(/<script src="\/static\/js\/tmr-team-logo\.js[^>]*><\/script>/, '')
    .replace(/<script src="\/static\/js\/trendspotter\.js[^>]*><\/script>/, '')
    .replace(/<script src="\/static\/js\/tmr-ds-nav[^>]*><\/script>/, '');

  const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'https://trustmyrecord.com/trendspotter/', virtualConsole });
  const win = dom.window;
  const calls = [];

  win.fetch = (url) => {
    const u = String(url);
    calls.push(u);
    if (u.includes('/capabilities')) {
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(CAPABILITIES) });
    }
    if (u.includes('/matchups')) return matchupsResponder(u);
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ status: 'no_games', message: 'none' }) });
  };
  win.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {} });

  win.eval(js);
  const settle = async (ticks) => { for (let i = 0; i < (ticks || 40); i++) await new Promise((r) => win.setTimeout(r, 5)); };
  await settle();
  return { win, doc: win.document, calls, pageErrors, settle };
}

const ok = (body) => () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
const fail = (status) => () => Promise.resolve({ ok: false, status, json: () => Promise.resolve({ reason: 'boom' }) });
const list = (doc) => doc.getElementById('matchupList');

(async () => {
  console.log('\nMatchup loading contract');

  await test('a successful response renders one card per game', async () => {
    const { doc } = await mount(ok({ sport: 'MLB', available: true, matchup_count: 2, matchups: [game(1), game(2)] }));
    assert.strictEqual(doc.querySelectorAll('.ts-matchup').length, 2);
    assert(/2 games in the next 36 hours/.test(doc.getElementById('slateDate').textContent),
      doc.getElementById('slateDate').textContent);
  });

  await test('a failed request offers a retry and NEVER claims there are no games', async () => {
    const { doc } = await mount(fail(503));
    const text = list(doc).textContent;
    assert(/Schedule unavailable/i.test(text), text.slice(0, 140));
    assert(doc.getElementById('retrySlate'), 'a retry control must be rendered');
    assert(!/no games scheduled/i.test(text), 'a failure must never be reported as an empty slate');
    assert(!/No matchup data available/i.test(text));
  });

  await test('a network rejection is treated as a failure, not as an empty slate', async () => {
    const { doc } = await mount(() => Promise.reject(new Error('offline')));
    assert(/Schedule unavailable/i.test(list(doc).textContent));
    assert(doc.getElementById('retrySlate'));
  });

  await test('a successful but empty response says so honestly', async () => {
    const { doc } = await mount(ok({ sport: 'MLB', available: true, matchup_count: 0, matchups: [] }));
    const text = list(doc).textContent;
    assert(/No games scheduled/i.test(text), text.slice(0, 140));
    assert(/search for any team/i.test(text), 'the tool must still point at the team search');
    assert(!doc.getElementById('retrySlate'), 'an empty slate is not an error and needs no retry');
  });

  await test('a slow response shows a loading state rather than a false empty', async () => {
    let release;
    const pending = new Promise((r) => { release = r; });
    const { doc, settle } = await mount(() => pending.then(() => ({
      ok: true, status: 200, json: () => Promise.resolve({ available: true, matchups: [game(1)] }),
    })));
    assert(!/No games scheduled/i.test(list(doc).textContent), 'must not claim empty while still loading');
    assert(doc.querySelector('#matchupList .ts-skeleton'), 'a skeleton must be shown while loading');
    release();
    await settle();
    assert.strictEqual(doc.querySelectorAll('.ts-matchup').length, 1);
  });

  await test('retrying after a failure recovers', async () => {
    let attempt = 0;
    const { doc, win, settle } = await mount(() => {
      attempt += 1;
      return attempt === 1
        ? Promise.resolve({ ok: false, status: 503, json: () => Promise.resolve({}) })
        : Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ available: true, matchups: [game(1)] }) });
    });
    assert(doc.getElementById('retrySlate'), 'first attempt should fail');
    doc.getElementById('retrySlate').dispatchEvent(new win.Event('click', { bubbles: true }));
    await settle();
    assert.strictEqual(doc.querySelectorAll('.ts-matchup').length, 1, 'retry must reload the slate');
  });

  await test('malformed provider data does not crash the page', async () => {
    const { doc, pageErrors } = await mount(ok({
      available: true,
      matchups: [
        game(1, { commence_time: 'not-a-date', market: null }),
        game(2, { market: { home_ml: null, away_ml: null, total: null } }),
        game(3),
      ],
    }));
    assert.strictEqual(pageErrors.length, 0, pageErrors.join('\n'));
    assert.strictEqual(doc.querySelectorAll('.ts-matchup').length, 3, 'bad rows still render without prices');
    assert(!/NaN|undefined|Invalid Date/.test(list(doc).textContent),
      'no raw NaN/undefined/Invalid Date may leak into a card');
  });

  await test('a long slate is capped with an explicit "show all" control', async () => {
    const many = Array.from({ length: 15 }, (_, i) => game(i));
    const { doc, win } = await mount(ok({ available: true, matchups: many }));
    assert.strictEqual(doc.querySelectorAll('.ts-matchup').length, 6, 'only the first six render by default');
    const toggle = doc.getElementById('toggleSlate');
    assert(toggle && /Show all 15 games/.test(toggle.textContent), toggle && toggle.textContent);
    toggle.dispatchEvent(new win.Event('click', { bubbles: true }));
    await new Promise((r) => win.setTimeout(r, 20));
    assert.strictEqual(doc.querySelectorAll('.ts-matchup').length, 15, 'expanding shows every game');
  });

  await test('switching league reloads the slate for that league', async () => {
    const seen = [];
    const { doc, win, settle } = await mount((url) => {
      seen.push(url);
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ available: true, matchups: [game(1)] }) });
    });
    assert(seen[0].includes('sport=MLB'), seen[0]);
    const nba = Array.from(doc.querySelectorAll('#leagueTabs button')).find((b) => b.textContent.trim() === 'NBA');
    nba.dispatchEvent(new win.Event('click', { bubbles: true }));
    await settle();
    assert(seen.some((u) => u.includes('sport=NBA')), JSON.stringify(seen));
  });

  await test('a game near the UTC date boundary is still listed', async () => {
    const { doc } = await mount(ok({ available: true, matchups: [game(1, { commence_time: '2026-08-02T03:59:00.000Z' })] }));
    assert.strictEqual(doc.querySelectorAll('.ts-matchup').length, 1,
      'a late game must not be dropped by a date-boundary bug');
  });

  await test('picking a card sets both sides of the matchup', async () => {
    const { doc, win } = await mount(ok({ available: true, matchups: [game(1)] }));
    doc.querySelector('.ts-matchup').dispatchEvent(new win.Event('click', { bubbles: true }));
    await new Promise((r) => win.setTimeout(r, 20));
    assert.strictEqual(doc.getElementById('f_team').value, 'SF');
    assert.strictEqual(doc.querySelector('.ts-matchup').getAttribute('aria-checked'), 'true',
      'the selected matchup must be visually and programmatically obvious');
  });

  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) {
    for (const f of failures) console.log(`  ${f.name}\n    ${f.error.stack.split('\n').slice(0, 3).join('\n    ')}`);
    process.exit(1);
  }
})();
