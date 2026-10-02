'use strict';
/**
 * NFL simulator upgrade (NFL_SIM_UPGRADE_20261001): the pure helpers of the
 * inline page script, run in a sandbox, plus static guards on the page.
 *
 * Run: node tests/nfl-simulator-upgrade-test.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const J = (x) => JSON.parse(JSON.stringify(x));

const html = fs.readFileSync(path.join(__dirname, '..', 'nfl-simulator', 'index.html'), 'utf8');
let passed = 0;
const t = (name, fn) => { fn(); passed += 1; console.log('  ok -', name); };

const start = html.indexOf('NFL SIMULATOR UPGRADE');
const end = html.indexOf('/* Register only once the schedule');
const block = html.slice(html.lastIndexOf('/*', start), end);

t('upgrade block is present and placed before the gate install', () => {
  assert.ok(start > 0 && end > start);
  assert.ok(/boot\(\)\.then\(installSimGate,installSimGate\)/.test(html.slice(end)));
});

t('SEO surface unchanged: one h1, title, canonical, robots, JSON-LD blocks', () => {
  assert.strictEqual((html.match(/<h1[\s>]/g) || []).length, 1);
  assert.strictEqual(html.split('<title>NFL Simulator 2026 | Game, Score and Matchup Simulator</title>').length, 2);
  assert.ok(/<link rel="canonical" href="https:\/\/trustmyrecord\.com\/nfl-simulator\/"/.test(html));
  assert.strictEqual((html.match(/application\/ld\+json/g) || []).length, 3);
});

t('no em or en dashes in the new copy', () => {
  assert.ok(!/[–—]/.test(block), 'dash found in upgrade block');
});

t('what if refs ride on the run and the share link', () => {
  assert.ok(/const outRefs=whatIfParam\(q,'g:'\+ref\)/.test(html));
  assert.ok(/whatIfParam\(q,'c:'\+\[host\.ref,visitor\.ref\]\.sort\(\)\.join\('\|'\)\)/.test(html));
  assert.ok(/if\(r\.out&&r\.out\.length\)u\.searchParams\.set\('out',r\.out\.join\(','\)\)/.test(html));
  assert.ok(/out:\(STATE\.out\|\|\[\]\)\.map/.test(html), 'saved runs keep the scenario');
});

t('compare store is wrapped in try/catch', () => {
  assert.ok(/function compareRead\(\)\{try\{/.test(block));
  assert.ok(/function compareWrite\(a\)\{try\{/.test(block));
});

// ---- sandbox the pure helpers ----
const STATE = { out: [], outKey: null, lastRun: null };
const ctx = {
  STATE, console, Math, JSON, Number, String, Array, Map, Set, Date, Promise, encodeURIComponent, URLSearchParams,
  esc: (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])),
  col: (a) => ({ GB: '#203731', TB: '#D50A0A', KC: '#E31837', CHI: '#0B162A' }[a] || '#334155'),
  pct: (v, d = 0) => (v == null ? 'n/a' : (v * 100).toFixed(d) + '%'),
  fmtN: (n) => Number(n).toLocaleString('en-US'),
  ESPNABBR: {}, localStorage: { _s: {}, getItem(k) { return this._s[k] || null; }, setItem(k, v) { this._s[k] = v; } },
};
vm.createContext(ctx);
vm.runInContext(block, ctx);
Object.assign(ctx, vm.runInContext('({ sgn, numTxt })', ctx));

t('signed numbers use the minus sign, not a hyphen', () => {
  assert.strictEqual(ctx.sgn(-3.26), '−3.3');
  assert.strictEqual(ctx.sgn(2), '+2');
  assert.strictEqual(ctx.numTxt(-1), '−1');
  assert.strictEqual(ctx.numTxt(null), 'n/a');
});

t('whatIfParam binds players to one matchup and clears them on another', () => {
  const q = new URLSearchParams();
  STATE.out = [{ ref: 'AAA' }, { ref: 'BBB' }]; STATE.outKey = '*';
  assert.deepStrictEqual(J(ctx.whatIfParam(q, 'g:X')), ['AAA', 'BBB']);
  assert.strictEqual(q.get('out'), 'AAA,BBB');
  const q2 = new URLSearchParams();
  assert.deepStrictEqual(J(ctx.whatIfParam(q2, 'g:Y')), []);
  assert.strictEqual(q2.get('out'), null);
  assert.deepStrictEqual(J(STATE.out), []);
});

t('visCol lifts very dark team colors and keeps bright ones', () => {
  assert.notStrictEqual(ctx.visCol('GB'), '#203731');
  assert.notStrictEqual(ctx.visCol('CHI'), '#0B162A');
  assert.strictEqual(ctx.visCol('TB'), '#D50A0A');
});

const bins = []; for (let x = -40; x <= 40; x += 1) bins.push({ x, p: Math.exp(-(x * x) / 200) });
t('histogram: accessible, trimmed, colored by winner, market marker drawn', () => {
  const svg = ctx.svgHist(bins, { kind: 'margin', pct: { p05: -20, p25: -7, p50: 0, p75: 7, p95: 20 }, median: -1, line: -3.5, posColor: '#D50A0A', negColor: '#7a8c86', hAbbr: 'TB', aAbbr: 'GB' });
  assert.ok(/role="img"/.test(svg) && /<title id="h\d+t">/.test(svg) && /<desc id="h\d+d">/.test(svg));
  assert.ok(/class="sr-only"/.test(svg));
  assert.ok(/TB by 5: /.test(svg) && /GB by 5: /.test(svg) && /Tie in regulation/.test(svg));
  assert.ok(/fill="#D50A0A"/.test(svg) && /fill="#7a8c86"/.test(svg));
  assert.ok(/>market</.test(svg) || /stroke="var\(--warn\)"/.test(svg));
  assert.ok(!/TB by 40:/.test(svg), 'extreme tail trimmed');
  assert.strictEqual(ctx.svgHist([], {}), '');
});

const proj = {
  home: [
    { name: 'QB A', pos: 'QB', pass_yards: { mean: 240, p10: 160, p50: 236, p90: 320 }, rush_yards: { mean: 8, p10: 0, p50: 6, p90: 20 }, rec_yards: { mean: 0, p10: 0, p50: 0, p90: 0 } },
    { name: 'RB A', pos: 'RB', pass_yards: { mean: 0 }, rush_yards: { mean: 70, p10: 30, p50: 66, p90: 112 }, rec_yards: { mean: 14, p10: 0, p50: 10, p90: 33 } },
    { name: 'WR A', pos: 'WR', pass_yards: { mean: 0 }, rush_yards: { mean: 0 }, rec_yards: { mean: 72, p10: 22, p50: 68, p90: 125 } },
  ],
  away: [],
};
t('props fall back to box projections when the API has no player_props', () => {
  const list = ctx.propsFromResult({ box_score: { projections: proj } }, 'home', 'KC');
  assert.deepStrictEqual(J(list.map((p) => p.role)), ['QB', 'RB', 'WR']);
  assert.deepStrictEqual(J(list[0].props.pass_yds), { median: 236, low: 160, high: 320, mean: 240 });
  assert.strictEqual(list[0].props.pass_td, null);
  const api = ctx.propsFromResult({ player_props: { home: [{ name: 'X', role: 'QB', props: {} }] } }, 'home', 'KC');
  assert.strictEqual(api[0].name, 'X');
  assert.deepStrictEqual(J(ctx.propsFromResult({}, 'home', 'KC')), []);
});

t('prop rows skip stats a player does not have and label ranges in words', () => {
  assert.strictEqual(ctx.propRow('rec_yds', { median: 0, low: 0, high: 0, mean: 0 }), '');
  const r = ctx.propRow('pass_yds', { median: 236, low: 160, high: 320, mean: 240 });
  assert.ok(/160 to 320/.test(r) && /aria-label="Pass yds range 160 to 320, median 236"/.test(r));
});

t('compare keeps at most four results and survives a broken store', () => {
  for (let i = 0; i < 6; i += 1) ctx.compareAdd({ id: String(i) });
  const a = ctx.compareRead();
  assert.strictEqual(a.length, 4);
  assert.strictEqual(a[3].id, '5');
  ctx.localStorage.getItem = () => { throw new Error('blocked'); };
  assert.deepStrictEqual(J(ctx.compareRead()), []);
});

console.log(`\nnfl-simulator-upgrade-test: ${passed} passed`);
