#!/usr/bin/env node

/**
 * MLB SIMULATOR - RECAP LANGUAGE LOCK   RECAP_LANGUAGE_20260831
 * =============================================================================
 * The scoring recap used to read like a stat dump: "1-run HR, 0 on base, 1 out".
 * A box score says solo homer, 2-run homer, 3-run homer, grand slam. This test
 * locks the corrected phrasing so it cannot silently regress, and it checks the
 * property that made the fix cheap - the on-page block and the copied/exported
 * text go through ONE helper, so they cannot drift apart.
 *
 * Two layers, because each catches what the other cannot:
 *   1. STRUCTURAL - both renderers call homerLine(), and the retired phrasings
 *      are gone from the file entirely.
 *   2. BEHAVIOURAL - real simulations are run until every homer size has been
 *      observed, and each rendered line is matched against the rules.
 *
 * Deliberately cheap: it stops as soon as it has seen a solo homer, a multi-run
 * homer and enough non-homer scoring events, so it runs in seconds rather than
 * joining the realism suite's hour.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const scriptPath = path.join(root, 'static', 'js', 'mlb-simulator.js');
const script = fs.readFileSync(scriptPath, 'utf8');

/* ============================================================ 1. STRUCTURAL */

/* Comments are stripped first. The fix's own comment quotes the phrasing it
   retired, and a naive search would match that and report the bug as still
   present - a test that fails on its own documentation is worse than no test. */
const code = script
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/.*/gm, '$1 ');

// The retired wording must be gone from the code, not merely unused.
assert(!/-run HR/.test(code), 'the "N-run HR" phrasing is gone from the simulator');
assert(!/one run home run/i.test(code), 'the "one run home run" phrasing is gone');

// One helper, two call sites: the rendered block and the exported text.
const homerLineCalls = (code.match(/homerLine\(/g) || []).length;
assert(homerLineCalls >= 3,
  'homerLine is defined and used by both the rendered recap and the exported text (found '
  + homerLineCalls + ' references)');
assert(/function homerPhrase\(/.test(code), 'homerPhrase helper is present');
assert(/return 'grand slam'/.test(code), 'four-run homers are called a grand slam');
assert(/return 'solo homer'/.test(code), 'one-run homers are called a solo homer');
assert(/r \+ '-run homer'/.test(code), 'two and three run homers are called N-run homers');

// The recap lines carry no em dash.
const recapRegion = code.slice(code.indexOf('function scoringDetailSections('),
  code.indexOf('function pitcherNoteLine('));
assert(recapRegion.length > 200, 'located the scoring-detail renderer');
assert(!/—/.test(recapRegion), 'no em dashes in the scoring-plays recap lines');

/* =========================================================== 2. BEHAVIOURAL */

const elementIds = [
  'awayTeamSelect', 'homeTeamSelect', 'awayPoolSelect', 'homePoolSelect', 'runSimulationButton',
  'refreshTeamsButton', 'awayPitcherSelect', 'homePitcherSelect', 'awayPitcherMeta', 'homePitcherMeta',
  'boxScorePanel', 'boxScoreTitle', 'boxScoreBody', 'boxScoreSummary',
  'copyBoxScoreButton', 'saveBoxScoreButton',
];

function makeElement(id) {
  return {
    id, disabled: false, value: '', textContent: '', innerHTML: '', className: '',
    attributes: {}, listeners: {},
    style: { setProperty(name, value) { this[name] = value; } },
    classList: { toggle() {} },
    addEventListener(type, fn) { this.listeners[type] = fn; },
    setAttribute(name, value) { this.attributes[name] = String(value); },
    getAttribute(name) { return this.attributes[name]; },
  };
}

function createSimulator() {
  const elements = {};
  elementIds.forEach((id) => { elements[id] = makeElement(id); });
  const context = {
    window: { URL: { createObjectURL() { return 'blob:test'; }, revokeObjectURL() {} } },
    document: {
      readyState: 'complete',
      getElementById(id) { return elements[id] || null; },
      addEventListener() {},
      createElement() { return { click() {} }; },
      body: { appendChild() {}, removeChild() {} },
    },
    console, Math, Number, Date, Promise,
    Blob: class Blob {},
    navigator: { clipboard: { writeText() { return Promise.resolve(); } } },
    fetch: () => Promise.reject(new Error('network unavailable')),
    CONFIG: { api: { baseUrl: 'https://trustmyrecord-api.onrender.com/api' } },
  };
  context.window.document = context.document;
  vm.runInNewContext(script, context);
  return context.window.TMRMlbSimulator;
}

/* The recap only names players when a verified roster is present - with no
   roster the lineup is synthetic, `named(e)` is false and the whole scoring
   block renders empty, so the language assertions would pass by finding
   nothing. Seed the same way the realism suite does. */
function teamIdFor(simulator, team) {
  const source = simulator.rosterSourceForTeam(team);
  const match = String((source && source.url) || '').match(/\/teams\/(\d+)\/roster/);
  assert(match, team.name + ' exposes a roster source team id');
  return Number(match[1]);
}

function seedVerifiedCurrentRosters(simulator) {
  const hitters = [
    ['Alex Carter', 'CF'], ['Ben Walker', 'SS'], ['Cal Brooks', 'RF'], ['Drew Mason', '1B'],
    ['Evan Reed', '3B'], ['Frank Ellis', 'LF'], ['Grant Cole', 'DH'], ['Henry Stone', '2B'], ['Ian Price', 'C'],
  ];
  const pitchers = [
    ['Jack Morris', 'P'], ['Kevin Ryan', 'P'], ['Liam Parker', 'P'], ['Miles Turner', 'P'], ['Nathan Ross', 'P'],
  ];
  simulator.localTeams.current.forEach((team) => {
    const teamId = teamIdFor(simulator, team);
    simulator.state.liveContext.teamRosters[team.abbreviation] = {
      teamId,
      source: 'Verified test active roster context',
      players: hitters.concat(pitchers).map(([name, position]) => ({ name, position, teamId })),
    };
  });
}

const simulator = createSimulator();
seedVerifiedCurrentRosters(simulator);
const current = simulator.localTeams.current.slice();
assert(current.length > 4, 'current team library loaded');

function runOne(i) {
  const away = current[i % current.length];
  let home = current[(i * 3 + 1) % current.length];
  if (home.id === away.id) home = current[(i + 2) % current.length];
  simulator.state.preset = 'current';
  simulator.state.awayPool = 'current';
  simulator.state.homePool = 'current';
  simulator.state.awayTeamId = away.id;
  simulator.state.homeTeamId = home.id;
  const ap = simulator.pitcherOptionsFor(away, 'away', null);
  const hp = simulator.pitcherOptionsFor(home, 'home', null);
  simulator.state.awayPitcherId = ap[i % ap.length].id;
  simulator.state.homePitcherId = hp[(i + 1) % hp.length].id;
  return simulator.simulate(away, home, null);
}

const HOMER = /hit a (solo homer|[23]-run homer|grand slam) off /;
const seen = { solo: 0, multi: 0, slam: 0, xbh: 0, sac: 0, sb: 0, hr: 0 };
const offenders = [];

const MAX_RUNS = Number(process.env.TMR_RECAP_RUNS || 40);
for (let i = 0; i < MAX_RUNS; i += 1) {
  const result = runOne(i);
  const log = (result.boxScore && result.boxScore.scoringLog) || [];
  const text = simulator.boxScoreText(result);

  // Every rendered homer line, checked against the rules.
  text.split('\n').forEach((raw) => {
    const line = raw.trim();
    if (!/hit a .*homer|grand slam/.test(line)) return;
    seen.hr += 1;
    if (!HOMER.test(line)) { offenders.push('unrecognised homer phrasing: ' + line); return; }
    if (/—/.test(line)) offenders.push('em dash in recap line: ' + line);
    if (/-run HR|1-run homer|one run home run/.test(line)) offenders.push('retired phrasing: ' + line);

    if (/solo homer/.test(line)) {
      seen.solo += 1;
      // "solo" already says nobody was on: no runner clause may follow.
      if (/with (the bases empty|a runner on|two on|the bases loaded)/.test(line)) {
        offenders.push('solo homer repeats the runner state: ' + line);
      }
      assert(/with (nobody out|one out|two outs)$/.test(line), 'solo homer states the out count: ' + line);
    } else if (/grand slam/.test(line)) {
      seen.slam += 1;
      // "grand slam" already says the bases were loaded.
      if (/with (the bases loaded|a runner on|two on|the bases empty)/.test(line)) {
        offenders.push('grand slam repeats the base state: ' + line);
      }
    } else {
      seen.multi += 1;
      if (!/with (a runner on|two on|the bases loaded) and (nobody out|one out|two outs)$/.test(line)) {
        offenders.push('multi-run homer is missing its runner/out clause: ' + line);
      }
    }
  });

  // Non-homer scoring language.
  text.split('\n').forEach((raw) => {
    const line = raw.trim();
    if (/doubled off|tripled off/.test(line)) {
      seen.xbh += 1;
      if (/, \d+ RBI/.test(line)) offenders.push('extra-base hit still uses raw RBI shorthand: ' + line);
      if (/driving in/.test(line) && !/driving in (a run|[2-9] runs)/.test(line)) {
        offenders.push('unnatural RBI wording: ' + line);
      }
    }
    if (/sacrifice/.test(line)) {
      seen.sac += 1;
      if (!/(hit a sacrifice fly off|laid down a sacrifice bunt|drove in a run with a sacrifice fly)/.test(line)) {
        offenders.push('unnatural sacrifice wording: ' + line);
      }
    }
    if (/caught stealing/.test(line)) {
      seen.sb += 1;
      if (!/was caught stealing/.test(line)) offenders.push('caught stealing needs a verb: ' + line);
    }
  });

  /* Cross-check the phrasing against the underlying event, not just the string.
     Matching on the batter's name alone is not safe: the seeded rosters give
     every team the same nine names and a batter can homer twice in a game, so a
     name-only lookup pulls someone else's line and reports a phantom mismatch.
     Anchor on the full "<frame>: <team>: <batter> hit a" prefix instead, and
     consume each line once so repeat events line up one to one. */
  const ordT = (n) => { n = Number(n) || 0; const a = ['th', 'st', 'nd', 'rd']; const v = n % 100; return n + (a[(v - 20) % 10] || a[v] || a[0]); };
  const frameT = (e) => (e.half === 'bottom' ? 'Bot ' : 'Top ') + ordT(e.inning);
  const unclaimed = text.split(String.fromCharCode(10)).map((s) => s.trim())
    .filter((s) => /hit a .*(homer|grand slam)/.test(s));
  log.filter((e) => e.type === 'HR' && e.batter).forEach((e) => {
    const runs = Number(e.rbi) || 1;
    const want = runs >= 4 ? 'grand slam' : (runs <= 1 ? 'solo homer' : runs + '-run homer');
    const prefix = frameT(e) + ': ' + e.team + ': ' + e.batter + ' hit a ';
    const hit = unclaimed.findIndex((s) => s.startsWith(prefix) && s.includes(want));
    if (hit !== -1) { unclaimed.splice(hit, 1); return; }
    const any = unclaimed.findIndex((s) => s.startsWith(prefix));
    if (any !== -1) {
      offenders.push('a ' + runs + '-RBI homer was not called a ' + want + ': ' + unclaimed[any]);
      unclaimed.splice(any, 1);
    }
  });

  if (seen.solo && seen.multi && seen.xbh > 3 && seen.sb) break;
}

if (offenders.length) {
  offenders.slice(0, 12).forEach((o) => console.error('  ' + o));
  assert.fail(offenders.length + ' recap language violation(s)');
}

assert(seen.hr > 0, 'the run sampled at least one home run');
assert(seen.solo > 0, 'the run sampled at least one solo homer');
assert(seen.multi > 0, 'the run sampled at least one multi-run homer');

console.log('mlb-simulator-recap-language-test: ok '
  + JSON.stringify(seen));
