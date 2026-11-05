'use strict';
/* Guards the MLB game simulator finish: each line is a defect found in the 11/05 browser audit. */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

const hub = read('mlb-simulator/index.html');
const engine = read('static/js/mlb-simulator.js');
const finish = read('static/js/tmr-mlb-game.js');
const css = read('static/css/tmr-mlb-game.css');
const cta = read('static/js/sim-run-cta.js');

assert(hub.includes('/static/js/tmr-mlb-game.js') && hub.includes('/static/css/tmr-mlb-game.css'), 'finish layer loads on the hub');
assert(hub.includes('Games behind the win chance') && hub.includes('Box scores to play'), 'the two counts say what they do');
assert(!/resultShowing = [^;]*realButtonInView/.test(cta), 'sticky run bar stays away once a result is showing');
assert(/saveLastResult\(\);\s*return state\.simulation;/.test(engine), 'a finished run is kept for refresh and Back');
assert(/if \(state\.pendingShare/.test(engine.slice(engine.indexOf('function restoreLastResult'))), 'a shared link beats a kept result');
assert(!/runSimulation\(\)/.test(engine.slice(engine.indexOf('function restoreLastResult'), engine.indexOf('function copyBoxScore'))), 'restoring never starts a run');
assert(/#tmr-fp-reminder/.test(finish) && /#tmr-fp-reminder:not\(\.bc-afterbox \*\)\{display:none\}/.test(css), 'first pick reminder cannot push the tool');
assert(/\.bc-tally/.test(css) && /box scores played/.test(finish), 'multi game runs show their tally');
assert(/-webkit-text-fill-color:var\(--bc-ink\)/.test(css), 'team abbreviations stay readable on the dark board');
console.log('mlb-game-finish-test: ok');
