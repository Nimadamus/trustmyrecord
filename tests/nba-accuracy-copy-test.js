'use strict';
/* NBA_ACCURACY_COPY_20261030: the NBA hub names which model makes which number,
   labels backtests, never calls the game simulator's share of wins "calibrated",
   counts the rating sample correctly (3,701 games = three seasons), and grades a
   live record from the served-prediction ledger. Fails on the copy before 10/30
   ("3,701 NBA games across four seasons", "calibrated, not simply counted").
   LOGO_SIZE_20261030: no NBA simulator page ships a 500 px ESPN crest. */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const hub = fs.readFileSync(path.join(ROOT, 'nba-simulator', 'index.html'), 'utf8');
const sec = hub.slice(hub.indexOf('<h2 id="accuracy">'), hub.indexOf('<h2>Limitations'));
assert.ok(sec.length > 500, 'accuracy section found');
assert.ok(!/across four seasons/.test(hub), '3,701 games are three seasons, not four');
assert.ok(!/calibrated<\/b>, not simply counted/.test(hub), 'the game simulator reports a share of simulated wins');
for (const want of ['nba-forecast-v1', 'tmr-nba-sim-1.1.0', 'backtest', '1,231', '2025-26', 'id="nbaLiveRecord"']) assert.ok(sec.includes(want), 'accuracy section names ' + want);
const ld = [...hub.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
const faq = ld.flatMap((x) => (x['@type'] === 'FAQPage' ? x.mainEntity : [])).find((q) => /How accurate/.test(q.name));
const det = (hub.match(/<details><summary>How accurate is the NBA simulator\?<\/summary><p>([\s\S]*?)<\/p><\/details>/) || [])[1];
assert.ok(faq && det, 'FAQ in JSON-LD and on the page');
assert.strictEqual(faq.acceptedAnswer.text, det, 'JSON-LD answer matches the visible answer');
assert.ok(/Brier/.test(det) && /backtests/.test(det), 'the FAQ answer gives the measure and labels it');
const app = fs.readFileSync(path.join(ROOT, 'static', 'js', 'nba-simulator-app.js'), 'utf8');
assert.ok(/\/nba\/ledger\/report/.test(app), 'the live record is read from the ledger');
assert.ok(!/items\[0\]/.test(app), 'figures are set by name, not list position');
for (const f of ['nba-simulator/index.html', 'nba-season-simulator/index.html', 'nba-playoff-simulator/index.html']) {
  const h = fs.readFileSync(path.join(ROOT, f), 'utf8');
  assert.ok(!/src="https:\/\/a\.espncdn\.com\/i\/teamlogos\/[^"]+\/500\/[^"]+\.png"/.test(h), f + ' ships a 500 px crest');
}
console.log('NBA_ACCURACY_COPY PASSED');
