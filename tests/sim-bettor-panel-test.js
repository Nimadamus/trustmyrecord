'use strict';
// SIM_BETTOR_PANEL_20261121: the "The bet" panel renders the API's betting block
// honestly: basis labels, book vs sim numbers, exact alternate lines, no edge talk.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function node(tag) {
  const n = { tagName: tag, children: [], attrs: {}, className: '', listeners: {}, _text: '', parentNode: null, id: '' };
  n.appendChild = (c) => { c.parentNode = n; n.children.push(c); return c; };
  n.insertBefore = (c) => n.appendChild(c);
  n.setAttribute = (k, v) => { n.attrs[k] = v; };
  n.addEventListener = (k, f) => { n.listeners[k] = f; };
  n.querySelector = () => null;
  n.remove = () => {};
  Object.defineProperty(n, 'textContent', {
    get() { return n._text + n.children.map((c) => c.textContent).join(' '); },
    set(v) { n._text = String(v); n.children = []; },
  });
  return n;
}
const head = node('head');
const document = { createElement: node, head, getElementById: () => null, addEventListener: () => {} };
const window = { document };
const ctx = vm.createContext({ window, document, isFinite, Math, Number, String, Date, parseFloat });
vm.runInContext(fs.readFileSync(path.join(__dirname, '../static/js/tmr-sim-bettor.js'), 'utf8'), ctx);
const B = window.TMRSimBettor;
assert.ok(B && B.build, 'module exposes build');
const S = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/sim-bettor-sample.json'), 'utf8'));

// market anchored NBA game
const a = B.build(S.nba);
const ta = a.textContent;
assert.ok(/Market anchored/.test(ta), 'anchored badge');
assert.ok(/DraftKings/.test(ta), 'names the book');
assert.ok(/Moneyline/.test(ta) && /Spread/.test(ta) && /Total/.test(ta), 'three markets');
assert.ok(/Independent model, before the book line/.test(ta), 'independent number shown beside the anchored one');
assert.ok(!/\bedge\b/i.test(ta.replace(/not an edge/i, '')), 'never claims an edge');
const bet = S.nba.projection.betting;
assert.ok(ta.includes((Math.round(bet.moneyline.book_novig_home_prob * 1000) / 10).toFixed(1) + '%'), 'book no-vig printed');

// NHL: unanchored total is labelled as the model's
const h = B.build(S.nhl).textContent;
assert.strictEqual(S.nhl.projection.betting.total.basis, 'model');
assert.ok(/Total[^]*Model/.test(h), 'total card says Model');

// no line: model badge, no book columns filled
const m = B.build(S.model).textContent;
assert.ok(/Independent model/.test(m) && /Simulator fair prices/.test(m), 'model basis and source');

// exact alternate line: identical to the backend's own price at the book line
const sp = bet.spread;
const x = B.split(bet.curves.margin, -sp.home_line);
const hp = x.above / (1 - x.at);
assert.ok(Math.abs(hp - sp.home_cover_ex_push) < 0.002, 'client alt line matches server cover at the book line');
assert.strictEqual(B.fairAmerican(0.5), -100);
assert.strictEqual(B.build({ projection: {} }), null, 'no betting block, no panel');
// props: exact over share from the simulated counts (values 0..4)
const ov = B.overOf({ from: 0, counts: [10, 20, 30, 20, 20], runs: 100 }, 2.5);
assert.ok(Math.abs(ov.over - 0.4) < 1e-9 && ov.push === 0, 'over 2.5 = 40%');
const ovp = B.overOf({ from: 0, counts: [10, 20, 30, 20, 20], runs: 100 }, 2);
assert.ok(Math.abs(ovp.push - 0.3) < 1e-9 && Math.abs(ovp.over - 40 / 70) < 1e-9, 'push on a whole line removed');
const rows = B.propRows('nba', { matchup: { home: { name: 'Home Team' }, away: { name: 'Away Team' } },
  result: { player_distributions: { home: [{ name: 'A. Player Jr.', stats: { points: { dist: { from: 0, counts: [50, 50], runs: 100 } } } }], away: [] } } },
  { games: [{ home_team: 'Home Team', away_team: 'Away Team', prop_groups: [{ markets: [{ _stat: 'Points', _player: 'A Player',
    outcomes: [{ selection: 'Over', line: 0.5, odds: -110 }, { selection: 'Under', line: 0.5, odds: -110 }, { selection: 'Over', line: 5.5, odds: 900 }] }] }] }] });
assert.strictEqual(rows.length, 1, 'main line only, name matched without suffix and punctuation');
assert.ok(Math.abs(rows[0].sim_over - 0.5) < 1e-9 && Math.abs(rows[0].book_over - 0.5) < 1e-9);
// tonight's board: open rows carry the sim read, locked rows keep only the book line
const SB = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/sim-slate-bets-sample.json'), 'utf8'));
const bt = B.boardTable('nhl', SB).textContent;
assert.ok(/Tonight/.test(bt) && /first 2 games are open/.test(bt), 'board heading and free note');
assert.strictEqual(SB.games.filter((g) => g.locked).length, SB.games.length - 2);
assert.ok(SB.games.filter((g) => g.locked).every((g) => g.betting.moneyline.sim_home_win_prob === undefined), 'locked rows carry no sim read');
console.log('SIM_BETTOR_PANEL PASSED');
