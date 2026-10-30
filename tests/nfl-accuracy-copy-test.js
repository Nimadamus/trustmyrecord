'use strict';
/* NFL_ACCURACY_ONE_SOURCE_20261030. Every accuracy figure on the NFL simulator pages must be
   exactly what scripts/nfl-accuracy-copy.js renders from the committed API snapshot
   (nfl-simulator/accuracy-public.json). A hand-typed or stale number fails here, and so
   does a backtest presented as live. */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const C = require('../scripts/nfl-accuracy-copy');

const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const snap = JSON.parse(read('nfl-simulator/accuracy-public.json'));
const sim = read('nfl-simulator/index.html');
const po = read('nfl-playoff-simulator/index.html');

// 1. The pages are exactly what the renderer produces from the snapshot (idempotent).
assert.strictEqual(C.renderSimulatorPage(sim, snap), sim, 'nfl-simulator accuracy copy is not the rendered snapshot; run scripts/build_nfl_accuracy_copy.js');
assert.strictEqual(C.renderPlayoffPage(po, snap), po, 'nfl-playoff-simulator accuracy copy is not the rendered snapshot');

// 2. No accuracy number outside the rendered regions: strip them and look for Brier-like figures.
const strip = (html) => {
  let s = html;
  for (const [a, b] of Object.values(C.MARK)) { const i = s.indexOf(a); const j = s.indexOf(b); if (i > -1 && j > i) s = s.slice(0, i) + s.slice(j); }
  return s.replace(/"name":"How accurate are the simulations\?","acceptedAnswer":\{"@type":"Answer","text":"(?:[^"\\]|\\.)*"/, '');
};
for (const [name, html] of [['nfl-simulator', sim], ['nfl-playoff-simulator', po]]) {
  const rest = strip(html).replace(/<script[\s\S]*?<\/script>/g, '');
  const hits = rest.match(/\b0\.2[0-4]\d\d\b/g) || [];
  assert.deepStrictEqual(hits, [], `${name}: Brier-like numbers outside the rendered accuracy regions: ${hits.join(', ')}`);
}

// 3. Holdout numbers in the pages equal the snapshot.
assert.ok(sim.includes(`data-k="model.brier">${snap.holdout.model.brier.toFixed(4)}<`));
assert.ok(po.includes(`Brier of ${snap.holdout.model.brier.toFixed(4)}`));

// 4. Labels: the backtest is called a backtest, the served table is called live, never the reverse.
assert.ok(/Backtest of the research configuration/.test(sim));
assert.ok(/id="live-accuracy"/.test(sim));
if (snap.served) {
  assert.ok(sim.includes(`${snap.served.graded_games} graded games`));
  assert.ok(/Graded live: the win probabilities this simulator served before kickoff/.test(sim));
}

// 5. Rendering is deterministic with no snapshot served block.
const noServed = { ...snap, served: null };
assert.ok(!/Graded live/.test(C.faqText(noServed)));
assert.ok(/first graded games appear here/.test(C.servedSection(noServed)));
console.log('NFL_ACCURACY_COPY PASSED');
