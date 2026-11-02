/**
 * NEXT_GAMES_20261101: after an NBA/NHL result, the rest of the slate's upcoming games
 * appear as buttons that click the page's own slate cards (same gate, same meter).
 *   node tests/sim-next-games-test.js
 */
const fs = require('fs'); const path = require('path'); const vm = require('vm'); const assert = require('assert');
const src = fs.readFileSync(path.join(__dirname, '..', 'static/js/sim-run-gate.js'), 'utf8');
function mk(tag) {
  const n = { tag, children: [], style: {}, attrs: {}, className: '', id: '', textContent: '', parentNode: null,
    appendChild(c) { this.children.push(c); c.parentNode = this; return c; },
    insertBefore(c, ref) { const i = ref ? this.children.indexOf(ref) : -1; if (i < 0) this.children.push(c); else this.children.splice(i, 0, c); c.parentNode = this; return c; },
    removeChild(c) { this.children.splice(this.children.indexOf(c), 1); },
    get nextSibling() { const p = this.parentNode; return p ? (p.children[p.children.indexOf(this) + 1] || null) : null; },
    setAttribute(k, v) { this.attrs[k] = v; }, getAttribute(k) { return this.attrs[k]; },
    querySelector(sel) { const id = sel.replace('#', ''); const walk = (x) => { for (const c of x.children) { if (c.id === id) return c; const r = walk(c); if (r) return r; } return null; }; return walk(this); },
    classList: { contains() { return false; } } };
  return n;
}
const events = []; let clicked = null;
function SimApp() {}
SimApp.prototype.run = function () {};
SimApp.prototype.render = function () { this.nodes.result.appendChild(mk('div')); };
const ctx = { document: { currentScript: { getAttribute: () => 'nba' }, createElement: mk, getElementById: () => null },
  localStorage: { getItem: () => null, setItem() {} }, setTimeout, Date, JSON, String, Math, Promise };
ctx.window = ctx; ctx.window.location = { href: '' };
ctx.TMRSimGate = { register() {}, track: (n) => events.push(n), authorizeRun: () => Promise.resolve(true), requireAuth: () => true };
ctx.TMRSim = { SimApp, esc: (s) => s };
vm.runInNewContext(src, ctx);

const team = (abbr, name) => ({ abbr, name, ref: abbr });
const slateGames = [
  { away: team('TOR', 'Toronto Raptors'), home: team('LAL', 'Los Angeles Lakers'), state: 'pre' },
  { away: team('BOS', 'Boston Celtics'), home: team('ORL', 'Orlando Magic'), state: 'pre' },
  { away: team('OKC', 'Oklahoma City Thunder'), home: team('HOU', 'Houston Rockets'), state: 'post' },
  { away: team('LAC', 'LA Clippers'), home: team('GS', 'Golden State Warriors'), state: 'in' },
  { away: team('BKN', 'Brooklyn Nets'), home: team('IND', 'Indiana Pacers'), state: 'pre' },
];
const cards = slateGames.map((g) => { const c = mk('div'); c.attrs['aria-label'] = 'Simulate ' + g.away.name + ' at ' + g.home.name; c.click = () => { clicked = c.attrs['aria-label']; }; return c; });
const app = new SimApp();
app.nodes = { result: mk('div'), games: { querySelectorAll: () => cards } };
app.slate = { games: slateGames };
const d = { matchup: { away: { name: 'Toronto Raptors' }, home: { name: 'Los Angeles Lakers' } }, projection: { win_probability: { away: 0.4, home: 0.6 } } };
app.render(d);
const panel = app.nodes.result.querySelector('#simNextGames');
assert.ok(panel, 'next games panel rendered');
const row = panel.children[2];
const labels = row.children.map((b) => b.textContent);
assert.deepStrictEqual(labels, ['BOS at ORL', 'BKN at IND'], 'only upcoming games, current matchup excluded: ' + labels);
row.children[0].onclick();
assert.strictEqual(clicked, 'Simulate Boston Celtics at Orlando Magic', 'button clicks the real slate card');
assert.ok(events.includes('simulator_next_game_shown') && events.includes('simulator_next_game_clicked'));
app.render(d);
let count = 0; const walk = (x) => { for (const c of x.children) { if (c.id === 'simNextGames') count++; walk(c); } }; walk(app.nodes.result);
assert.strictEqual(count, 1, 'a second render replaces, never duplicates');
console.log('sim-next-games-test: ok');
