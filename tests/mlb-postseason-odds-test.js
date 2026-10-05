/* =============================================================================
   MLB POSTSEASON ODDS: ELIMINATED CLUBS STAY AT 0%     MLB_ELIMINATED_ZERO_20261005
   -----------------------------------------------------------------------------
   Oct 5, 2026: /mlb-playoff-odds/ and the 30 /mlb-simulator/teams/<team>/ pages
   still replayed the regular season and a fresh postseason, so the Cubs showed
   a 6% World Series chance after San Diego eliminated them 2 games to 0.

   Locks, on a frozen copy of the real Oct 5 postseason state AND on whatever the
   last build wrote (data/mlb-playoff-odds-inputs.json and the baked pages):

   1. Official seeds are used: the 12 seeded clubs are at 100% playoffs, the
      other 18 at 0% for everything.
   2. A decided series is decided: the loser is at 0% for every later round and
      the World Series, the winner is at 100% for the next round.
   3. A series in progress starts from its real score.
   4. Clubs still alive keep a real chance, and the title chances sum to 1.
   5. No eliminated or non qualifying club shows anything but 0% to win the
      World Series on its team page or on /mlb-playoff-odds/, and no team page
      says "under 1%" once the regular season is over.

   Run: node tests/mlb-postseason-odds-test.js
   ============================================================================= */
const fs = require('fs');
const path = require('path');
const E = require('../static/js/league-season-engine.js');
const { postseasonStatus } = require('../scripts/build_mlb_odds_page.js');

const ROOT = path.join(__dirname, '..');
const FIXTURE = path.join(__dirname, 'fixtures', 'mlb-postseason-inputs-20261005.json');
const BUILT = path.join(ROOT, 'data', 'mlb-playoff-odds-inputs.json');
const RUNS = 3000;
const NEED = { F: 2, D: 3, L: 4, W: 4 };
const LATER = { F: ['round2', 'conf_final', 'final', 'champion'], D: ['conf_final', 'final', 'champion'],
    L: ['final', 'champion'], W: ['champion'] };
const NEXT = { F: 'round2', D: 'conf_final', L: 'final', W: 'champion' };

let pass = 0, fail = 0;
function ok(name, cond, extra) {
    if (cond) { pass++; console.log('  ok  ' + name); }
    else { fail++; console.log('  FAIL ' + name + (extra ? ' :: ' + extra : '')); }
}
const load = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const byAbbr = (res) => Object.fromEntries(res.teams.map((t) => [t.abbr, t]));

function checkState(label, inp) {
    const res = E.project(inp, RUNS, 20261005);
    const T = byAbbr(res);
    const seeded = new Set([].concat(...Object.values(inp.postseason.seeds)));
    ok(label + ': 12 official seeds', seeded.size === 12, String(seeded.size));

    for (const t of res.teams) {
        if (seeded.has(t.abbr)) {
            if (t.playoffs !== 1) ok(label + ': ' + t.abbr + ' seeded club at 100% playoffs', false, String(t.playoffs));
        } else {
            const nz = ['playoffs', 'round2', 'conf_final', 'final', 'champion'].filter((k) => t[k] !== 0);
            if (nz.length) ok(label + ': ' + t.abbr + ' missed the postseason so every chance is 0', false, nz.join(','));
        }
    }
    ok(label + ': non qualifiers all at 0 and seeds all at 100% playoffs', true);

    const dead = new Set();
    for (const s of inp.postseason.series) {
        const need = NEED[s.round];
        for (const [w, l] of [[s.a, s.b], [s.b, s.a]]) {
            if ((s.wins[w] || 0) >= need) {
                dead.add(l);
                const left = LATER[s.round].filter((k) => T[l][k] !== 0);
                ok(label + ': ' + l + ' lost the ' + s.round + ' series, 0% for every later round', !left.length, left.join(','));
                ok(label + ': ' + w + ' won the ' + s.round + ' series, 100% to reach the next stage', T[w][NEXT[s.round]] === 1, String(T[w][NEXT[s.round]]));
            }
        }
    }
    for (const t of res.teams) {
        if (seeded.has(t.abbr) && !dead.has(t.abbr) && !(t.champion > 0)) ok(label + ': ' + t.abbr + ' is alive and keeps a chance', false);
    }
    const sum = res.teams.reduce((a, t) => a + t.champion, 0);
    ok(label + ': title chances sum to 1', Math.abs(sum - 1) < 1e-9, String(sum));
    return { res, T, dead };
}

// 1 to 4 on the frozen Oct 5 state.
const base = load(FIXTURE);
const { T: T0, dead: dead0 } = checkState('Oct 5 fixture', base);
['CHC', 'BOS', 'HOU', 'PHI'].forEach((ab) => ok('Oct 5 fixture: ' + ab + ' (eliminated in the Wild Card Series) is at 0% to win it all', T0[ab] && T0[ab].champion === 0 && dead0.has(ab)));

// 3: a series in progress starts from its real score. MIL leads SD 2 games to 0
// in a best of five; flip it to SD 2, MIL 0 and MIL's chance must fall.
const flipped = JSON.parse(JSON.stringify(base));
const ds = flipped.postseason.series.find((s) => s.round === 'D' && [s.a, s.b].includes('MIL'));
ok('fixture has the MIL v SD Division Series at 2 to 0', ds && ds.wins.MIL === 2 && ds.wins.SD === 0);
if (ds) {
    ds.wins = { MIL: 0, SD: 2 };
    const T1 = byAbbr(E.project(flipped, RUNS, 20261005));
    ok('series score is honoured: MIL up 2 to 0 beats MIL down 0 to 2', T0.MIL.conf_final > T1.MIL.conf_final + 0.3,
        T0.MIL.conf_final + ' vs ' + T1.MIL.conf_final);

    // 2: decide it. SD wins 3 to 2: MIL out, SD through.
    ds.wins = { MIL: 2, SD: 3 };
    checkState('MIL v SD decided for SD', flipped);
}

// A decided World Series leaves exactly one champion at 100%.
const ws = JSON.parse(JSON.stringify(base));
const hi = (k) => ws.postseason.series.filter((s) => s.round === k);
hi('D').forEach((s) => { s.wins = { [s.a]: 3, [s.b]: 0 }; });
const dWin = (lg) => hi('D').map((s) => s.a).filter((ab) => base.teams.find((t) => t.espn_abbr === ab).conference === lg);
const [alA, alB] = dWin('American League'), [nlA, nlB] = dWin('National League');
ws.postseason.series.push({ round: 'L', a: alA, b: alB, wins: { [alA]: 4, [alB]: 1 }, homes: [] });
ws.postseason.series.push({ round: 'L', a: nlA, b: nlB, wins: { [nlA]: 4, [nlB]: 0 }, homes: [] });
ws.postseason.series.push({ round: 'W', a: alA, b: nlA, wins: { [alA]: 4, [nlA]: 3 }, homes: [] });
const TW = byAbbr(E.project(ws, RUNS, 20261005));
ok('a decided World Series: the winner is at 100%', TW[alA].champion === 1, String(TW[alA].champion));
ok('a decided World Series: every other club is at 0%', Object.values(TW).every((t) => t.abbr === alA || t.champion === 0));
const stW = postseasonStatus(ws);
ok('status: the World Series winner is the champion', stW[alA].state === 'champion');
ok('status: the World Series loser is eliminated', stW[nlA].state === 'eliminated');

// 5: what the last build actually wrote.
const built = load(BUILT);
if (built.postseason) {
    checkState('last build', built);
    const status = postseasonStatus(built);
    const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    let pages = 0;
    for (const t of built.teams) {
        const f = path.join(ROOT, 'mlb-simulator', 'teams', slug(t.name), 'index.html');
        if (!fs.existsSync(f)) { ok('team page exists for ' + t.name, false); continue; }
        const html = fs.readFileSync(f, 'utf8');
        const desc = (html.match(/<meta name="description" content="([^"]*)"/) || [])[1] || '';
        const ws1 = (desc.match(/([^ ]+) to win the World Series/) || [])[1];
        const st = status[t.espn_abbr].state;
        if (st !== 'alive' && st !== 'champion') {
            ok(t.name + ' (' + st + ') page says 0% to win the World Series', ws1 === '0%', ws1);
        }
        if (/under 1%/.test(html)) ok(t.name + ' page has no "under 1%" after the regular season', false);
        pages++;
    }
    ok('checked all 30 team pages', pages === 30, String(pages));

    const odds = fs.readFileSync(path.join(ROOT, 'mlb-playoff-odds', 'index.html'), 'utf8');
    const rows = odds.split('<tr><th scope="row">').slice(1);
    const nameOf = Object.fromEntries(built.teams.map((t) => [t.espn_abbr, t.name]));
    let bad = [];
    for (const ab of Object.keys(status)) {
        if (status[ab].state === 'alive' || status[ab].state === 'champion') continue;
        const row = rows.find((r) => r.includes(nameOf[ab]) || r.includes('>' + ab + '<'));
        if (!row) continue;
        const cells = row.split('<td class="p"').slice(1);
        const last = cells[cells.length - 1] || '';
        if (!/>0%</.test(last)) bad.push(ab);
    }
    ok('/mlb-playoff-odds/ shows 0% to win it all for every eliminated or non qualifying club', !bad.length, bad.join(','));
} else {
    console.log('  (last build has no postseason state: regular season still running)');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
