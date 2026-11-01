/**
 * NBA / NHL post-result Take the {team} buttons (sim-run-gate.js).
 * One tap writes tmr_sim_pick_intent and goes to /sportsbook/?simpick=1. Nothing POSTs.
 *   node tests/sim-take-sides-nba-nhl-test.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const src = fs.readFileSync(path.join(__dirname, '..', 'static/js/sim-run-gate.js'), 'utf8');

function node(tag) {
  return { tag, children: [], style: {}, attrs: {}, className: '', id: '', innerHTML: '', textContent: '',
    classList: { contains(c) { return (this._n.className || '').split(/\s+/).includes(c); } },
    appendChild(c) { this.children.push(c); c.parentNode = this; return c; },
    insertBefore(c, ref) { const i = ref ? this.children.indexOf(ref) : -1; if (i < 0) this.children.push(c); else this.children.splice(i, 0, c); c.parentNode = this; return c; },
    get nextSibling() { const p = this.parentNode; if (!p) return null; return p.children[p.children.indexOf(this) + 1] || null; },
    setAttribute(k, v) { this.attrs[k] = v; },
    querySelector(sel) { const id = sel.replace('#', ''); const walk = (n) => { for (const c of n.children) { if (c.id === id) return c; const r = walk(c); if (r) return r; } return null; }; return walk(this); },
  };
}
function mk(tag) { const n = node(tag); n.classList._n = n; return n; }

for (const sport of ['nhl', 'nba']) {
  const store = {}; const events = [];
  function SimApp() {}
  SimApp.prototype.run = function () {};
  SimApp.prototype.render = function (d) { const h = mk('div'); h.className = 'mh'; this.nodes.result.appendChild(mk('div')); this.nodes.result.appendChild(h); this.nodes.result.appendChild(mk('div')); };
  const ctx = {
    document: { currentScript: { getAttribute: () => sport }, createElement: mk, getElementById: () => null },
    localStorage: { setItem: (k, v) => { store[k] = v; } },
    setTimeout, Date, JSON, String, Math, Promise,
  };
  ctx.window = ctx;
  ctx.window.location = { href: '' };
  ctx.TMRSimGate = { register() {}, track: (n, p) => events.push(n), authorizeRun: () => Promise.resolve(true), requireAuth: () => true };
  ctx.TMRSim = { SimApp, esc: (s) => s };
  vm.runInNewContext(src, ctx);

  const app = new SimApp(); app.nodes = { result: mk('div') };
  const d = { matchup: { away: { name: 'Anaheim Ducks', common: 'Ducks' }, home: { name: 'Boston Bruins', common: 'Bruins' } },
    projection: { win_probability: { away: 0.4, home: 0.6 } } };
  app.render(d);
  const kids = app.nodes.result.children;
  const idx = kids.findIndex((c) => c.id === 'simConvertPanel');
  assert.strictEqual(idx, 2, sport + ': panel sits right under the win probability header');
  const btns = kids[idx].children.find((c) => c.children.length).children;
  assert.deepStrictEqual(btns.map((b) => b.textContent), ['Take the Ducks', 'Take the Bruins']);
  app.render(d);
  assert.strictEqual(app.nodes.result.children.filter((c) => c.id === 'simConvertPanel').length, 1, sport + ': one panel per result box');

  btns[1].onclick();
  const intent = JSON.parse(store.tmr_sim_pick_intent);
  assert.strictEqual(intent.pick_team, 'Boston Bruins');
  assert.strictEqual(intent.away_team_name, 'Anaheim Ducks');
  assert.strictEqual(intent.home_team_name, 'Boston Bruins');
  assert.strictEqual(intent.sport, sport.toUpperCase());
  assert.strictEqual(intent.source, sport + '-simulator');
  assert.strictEqual(ctx.window.location.href, '/sportsbook/?simpick=1');
  assert.ok(events.includes('simulator_pick_started'));

  const app2 = new SimApp(); app2.nodes = { result: mk('div') };
  app2.render({ matchup: d.matchup });
  assert.ok(!app2.nodes.result.children.some((c) => c.id === 'simConvertPanel'), sport + ': no panel without a projection');
}
assert.ok(!/method:\s*['"]POST/.test(src), 'take path never POSTs');
console.log('sim-take-sides-nba-nhl-test: ok');
