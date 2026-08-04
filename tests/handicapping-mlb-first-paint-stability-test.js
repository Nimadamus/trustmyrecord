#!/usr/bin/env node
/*
 * /handicapping/mlb/ first-paint stability contract.
 *
 * Aug 3 2026: firstpaint-stability.cjs reported this route flipping a stat
 * "5" -> "1" -> "5". The investigation found the page never changes a value.
 * Every game card is appended in slate order immediately, each showing a
 * value-free skeleton, and each card's matchup fetch paints only that card
 * when it resolves — with bounded concurrency, so cards finish OUT OF ORDER.
 * The old detector keyed cells by a global DOM index, so when a card higher in
 * the slate finished later, index N started pointing at a different card's
 * trend and the detector read that as a value change.
 *
 * What actually has to hold is a per-card contract, and that is what this file
 * pins. Responses are delivered deliberately out of order, so a regression
 * that made a card paint placeholder numbers, or let a stale/superseded
 * response overwrite a card, fails here deterministically.
 *
 * Pure jsdom; no network, no timers beyond the microtask queue.
 * Run: node tests/handicapping-mlb-first-paint-stability-test.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const root = path.resolve(__dirname, '..');
const rawHtml = fs.readFileSync(path.join(root, 'handicapping', 'mlb', 'index.html'), 'utf8');
const js = fs.readFileSync(path.join(root, 'static', 'js', 'handicapping-mlb.js'), 'utf8');

let passed = 0;
const failures = [];
async function test(name, fn) {
  try { await fn(); passed++; console.log(`  ok  ${name}`); }
  catch (error) { failures.push({ name, error }); console.log(`  FAIL ${name}\n       ${error.message}`); }
}

/* ---------- fixtures ---------- */
const iso = (h) => {
  const d = new Date();
  d.setUTCHours(h, 0, 0, 0);
  return d.toISOString();
};

const GAMES = [
  { id: 'g1', away_team: 'Los Angeles Angels', home_team: 'Baltimore Orioles', commence_time: iso(17) },
  { id: 'g2', away_team: 'Washington Nationals', home_team: 'Philadelphia Phillies', commence_time: iso(18) },
  { id: 'g3', away_team: 'Cincinnati Reds', home_team: 'Athletics', commence_time: iso(19) },
];

// Distinct, unmistakable numbers per game so a cross-card mix-up is visible.
const MATCHUP = {
  g1: { wins: '28-39', pct: '41.79%', trend: '57.46%' },
  g2: { wins: '80-130', pct: '38.10%', trend: '42.84%' },
  g3: { wins: '259-217', pct: '54.41%', trend: '59.52%' },
};

function matchupPayload(gid) {
  const m = MATCHUP[gid];
  return {
    overview: {
      available: true, venue: 'Test Park',
      away_starter: { name: 'A. Pitcher', hand: 'R' },
      home_starter: { name: 'B. Pitcher', hand: 'L' },
    },
    records: {
      away: { available: true, record: m.wins, win_pct: m.pct },
      home: { available: true, record: m.wins, win_pct: m.pct },
    },
    trends: [{
      market: 'moneyline', side: 'Home', statement: `Test trend for ${gid}`,
      record: m.wins, win_rate: m.pct, edge: m.trend,
      sample_size: 40, reliability: 'high', games: [],
    }],
    trend_meta: {},
  };
}

/* ---------- harness ---------- */
function bootPage({ games = GAMES } = {}) {
  const vc = new VirtualConsole();
  const dom = new JSDOM(rawHtml, {
    runScripts: 'outside-only',
    url: 'https://trustmyrecord.com/handicapping/mlb/',
    virtualConsole: vc,
  });
  const { window } = dom;
  window.TMR_CONFIG = { API_BASE: 'https://api.test' };
  window.API_BASE = 'https://api.test';

  const pending = new Map();   // gameId -> {resolve, reject}
  const calls = [];

  window.fetch = (url) => {
    calls.push(String(url));
    const u = String(url);
    const json = (body) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
    if (u.includes('/games/board/')) return json({ games });
    if (u.includes('/trendspotter/verified')) return json({ trends: [] });
    if (u.includes('/external-picks/consensus')) return json({ groups: [] });
    if (u.includes('/handicapping/mlb/matchup')) {
      const away = decodeURIComponent((u.match(/away=([^&]*)/) || [])[1] || '');
      const g = games.find((x) => x.away_team === away);
      const gid = g ? g.id : 'unknown';
      return new Promise((resolve, reject) => { pending.set(gid, { resolve, reject, json }); });
    }
    return json({});
  };
  window.AbortController = window.AbortController || function () { this.signal = null; this.abort = () => {}; };

  window.eval(js);

  const flush = async () => { for (let i = 0; i < 30; i++) await new Promise((r) => setImmediate(r)); };
  const settle = async (gid) => {
    const p = pending.get(gid);
    if (!p) throw new Error(`no in-flight matchup request for ${gid} (calls: ${calls.length})`);
    p.resolve({ ok: true, status: 200, json: () => Promise.resolve(matchupPayload(gid)) });
    pending.delete(gid);
    await flush();
  };
  return { window, dom, flush, settle, pending, calls };
}

// Card identity that survives out-of-order painting.
function readCards(window) {
  const out = {};
  window.document.querySelectorAll('.hh-game').forEach((card) => {
    const a = (card.querySelector('[data-away-name]') || {}).textContent || '?';
    const h = (card.querySelector('[data-home-name]') || {}).textContent || '?';
    const nums = [];
    card.querySelectorAll('[data-hhctop] b, [data-hhctop] strong').forEach((b) => {
      const t = (b.textContent || '').trim();
      if (/[\d]/.test(t)) nums.push(t);
    });
    out[`${a.trim()}@${h.trim()}`] = nums;
  });
  return out;
}

(async () => {
  console.log('\n/handicapping/mlb/ first-paint stability\n');

  await test('the pre-data card state carries no numeric values to flash from', async () => {
    const h = bootPage();
    await h.flush();
    const cards = readCards(h.window);
    const keys = Object.keys(cards);
    assert.strictEqual(keys.length, GAMES.length, `expected ${GAMES.length} cards, got ${keys.length}`);
    for (const k of keys) {
      assert.deepStrictEqual(cards[k], [],
        `card ${k} rendered ${JSON.stringify(cards[k])} before its data arrived; ` +
        'the loading state must be a value-free skeleton');
    }
    const skel = h.window.document.querySelectorAll('[data-hhctop] .hhc-skel');
    assert.strictEqual(skel.length, GAMES.length, 'every card should show a skeleton before its data lands');
  });

  await test('out-of-order responses never change an already-painted card', async () => {
    const h = bootPage();
    await h.flush();
    // Deliberately paint the LAST card first, then the first — the exact
    // ordering that made a global DOM index alias onto another card.
    const seen = {};
    for (const gid of ['g3', 'g1', 'g2']) {
      await h.settle(gid);
      const cards = readCards(h.window);
      for (const [k, v] of Object.entries(cards)) {
        if (!v.length) continue;
        if (seen[k]) {
          assert.deepStrictEqual(v, seen[k],
            `card ${k} changed from ${JSON.stringify(seen[k])} to ${JSON.stringify(v)} ` +
            `after ${gid} resolved — a painted card must never repaint`);
        } else {
          seen[k] = v;
        }
      }
    }
    assert.strictEqual(Object.keys(seen).length, GAMES.length, 'every card should end painted');
  });

  await test('each card shows its OWN numbers, never a neighbour\'s', async () => {
    const h = bootPage();
    await h.flush();
    for (const gid of ['g3', 'g1', 'g2']) await h.settle(gid);
    const cards = readCards(h.window);
    for (const g of GAMES) {
      const key = `${g.away_team}@${g.home_team}`;
      const joined = (cards[key] || []).join(' ');
      assert.ok(joined.includes(MATCHUP[g.id].wins),
        `card ${key} should show its own record ${MATCHUP[g.id].wins}, got ${joined}`);
      for (const other of GAMES) {
        if (other.id === g.id) continue;
        assert.ok(!joined.includes(MATCHUP[other.id].wins),
          `card ${key} showed ${other.id}'s record ${MATCHUP[other.id].wins} — cross-card leak`);
      }
    }
  });

  await test('a response for a card no longer in the DOM is discarded', async () => {
    const h = bootPage();
    await h.flush();
    // Simulate a re-render (date switch / search) dropping the cards.
    const gamesEl = h.window.document.getElementById('hh-games');
    const removed = gamesEl.innerHTML;
    gamesEl.innerHTML = '';
    await h.settle('g1');
    assert.strictEqual(gamesEl.innerHTML, '',
      'a late response painted into a container whose cards were replaced');
    assert.ok(removed.length > 0, 'sanity: cards existed before removal');
  });

  await test('the card grid and the deep dive share one in-flight request', async () => {
    // The comparison grid fetches every card on load; opening "View Full
    // Analysis" asks for the SAME game again while that fetch is still in
    // flight. Without the in-flight dedupe these are two independent requests
    // for one card, and whichever lands second wins — the actual shape of a
    // stale-overwrites-newer bug. Assert the second caller reuses the first.
    const h = bootPage();
    await h.flush();
    const countFor = (away) => h.calls.filter(
      (u) => u.includes('/handicapping/mlb/matchup') &&
             decodeURIComponent((u.match(/away=([^&]*)/) || [])[1] || '') === away
    ).length;

    const target = GAMES[0];
    assert.strictEqual(countFor(target.away_team), 1, 'sanity: the grid issues exactly one fetch per card');

    const card = h.window.document.getElementById(`game-${target.id}`);
    assert.ok(card, 'expected the first card in the DOM');
    card.querySelector('[data-toggle]').dispatchEvent(new h.window.Event('click', { bubbles: true }));
    await h.flush();

    assert.strictEqual(countFor(target.away_team), 1,
      `opening the deep dive issued a second concurrent fetch for ${target.away_team}; ` +
      'two in-flight responses for one card can resolve out of order and overwrite each other');
  });

  await test('the source paints a card only through the isConnected guard', async () => {
    // Static guard: every paintTop call site must be gated, so a future edit
    // that drops the guard fails here rather than in production.
    const paintCalls = js.split('\n').filter((l) => /paintTop\(/.test(l) && !/function paintTop/.test(l));
    assert.ok(paintCalls.length >= 2, `expected multiple paintTop call sites, found ${paintCalls.length}`);
    const unguarded = paintCalls.filter((l) => !/isConnected/.test(l) && !/cached/.test(l));
    assert.deepStrictEqual(unguarded, [],
      `paintTop called without an isConnected guard:\n${unguarded.join('\n')}`);
  });

  await test('a superseded render stops issuing fetches for the old slate', async () => {
    // render() is called again on a date switch or a search. Painting is
    // already safe (detached nodes fail isConnected), but before STATE.renderSeq
    // was actually used the superseded queue kept firing the rest of the old
    // slate's matchup fetches — each a multi-provider fan-out — for cards
    // nobody can see. Concurrency is 4, so with 3 games the queue is drained
    // immediately; drive the search box to force a fresh render and assert the
    // old queue does not add more requests for the same games.
    // A slate LARGER than the concurrency limit (4), so work is still queued
    // when the re-render happens — with only 3 games the queue drains instantly
    // and the gate is never reached.
    const BIG = Array.from({ length: 10 }, (_, i) => ({
      id: `b${i + 1}`,
      away_team: `Away Team ${i + 1}`,
      home_team: `Home Team ${i + 1}`,
      commence_time: iso(14 + (i % 8)),
    }));
    const h = bootPage({ games: BIG });
    await h.flush();
    const count = () => h.calls.filter((u) => u.includes('/handicapping/mlb/matchup')).length;

    const inFlight = count();
    assert.strictEqual(inFlight, 4, `bounded concurrency should hold this at 4 in flight, got ${inFlight}`);
    assert.ok(BIG.length > 4, 'sanity: the slate must exceed the concurrency limit');

    // Supersede the render by filtering the slate down to one card.
    const find = h.window.document.getElementById('hh-find');
    assert.ok(find, 'expected the find box');
    find.value = BIG[0].away_team;
    find.dispatchEvent(new h.window.Event('input', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 250)); // the page debounces 180ms
    await h.flush();

    // Now let the four in-flight requests finish. That advances the OLD queue,
    // which is exactly when it would otherwise start requests 5..8 for cards
    // that no longer exist.
    for (const gid of ['b1', 'b2', 'b3', 'b4']) {
      const p = h.pending.get(gid);
      if (!p) continue;
      p.resolve({ ok: true, status: 200, json: () => Promise.resolve({ overview: { available: false }, trends: [] }) });
      h.pending.delete(gid);
    }
    await h.flush();

    const after = count();
    assert.strictEqual(after, inFlight,
      `the superseded queue issued ${after - inFlight} further matchup fetches for cards ` +
      'that are no longer on screen; STATE.renderSeq must stop it');

    assert.ok(/STATE\.renderSeq\+\+/.test(js) && /mySeq !== STATE\.renderSeq/.test(js),
      'STATE.renderSeq must actually gate the queue, not sit unused implying protection that does not exist');
  });

  await test('a failed matchup fetch is not cached as a resolved value', async () => {
    assert.ok(/p\.catch\(function \(\) \{ if \(STATE\.matchupPromise\[game\.id\] === p\) delete STATE\.matchupPromise\[game\.id\]/.test(js),
      'a rejected matchup promise must be evicted so Retry re-requests instead of replaying the rejection');
  });

  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) {
    failures.forEach((f) => console.log(`\nFAIL ${f.name}\n${f.error.stack}`));
    process.exit(1);
  }
})();
