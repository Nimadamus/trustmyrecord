/**
 * FEATURED_TRUE_LEADER_20261011. Every featured award card on /handicappers/
 * must show the real #1 of its category, computed from the member records.
 *
 * Production, 2026-10-11: "Most Graded Picks" showed MoneyMakers (657 graded)
 * while BetLegend's own card on the same page showed 944. The one-card-per-user
 * dedupe had given BetLegend "Units Leader" first, so every later category he
 * led fell to the runner-up. "Hottest Last 30 Days" had the same fault
 * (americanwiseguy held Best Current Streak, so the #3 got Hot).
 *
 * This test runs the page's real renderFeaturedLeaders() and ranking functions
 * (extracted from handicappers/index.html) against fixtures, and checks every
 * award card against a leader computed independently here. No winner is
 * hardcoded: a randomized pass reshuffles the records and recomputes.
 *
 * Run: node tests/handicappers-featured-true-leader-test.js
 */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'handicappers', 'index.html'), 'utf8');

function extractFunction(name) {
  const start = SRC.indexOf('function ' + name + '(');
  assert(start >= 0, 'function ' + name + ' not found in handicappers/index.html');
  let i = SRC.indexOf('{', start), depth = 0;
  for (; i < SRC.length; i++) {
    if (SRC[i] === '{') depth++;
    else if (SRC[i] === '}' && --depth === 0) return SRC.slice(start, i + 1);
  }
  throw new Error('unterminated function ' + name);
}

const FNS = ['gradedCount', 'compareBy', 'positiveMetric', 'rankedWinRateLeaders', 'rankedUnitsLeaders',
  'rankedRoiLeaders', 'rankedMostGraded', 'rankedStreakLeaders', 'hotStats30d', 'qualifiesHot', 'rankedHottest',
  'activePicks30d', 'rankedMostActive', 'memberFeatureKey', 'pickFeatured', 'renderFeaturedLeaders'];

function runPage(members, featuredRows) {
  const rows = new Map(featuredRows.map(r => ['uid:' + String(r.id).toLowerCase(), r]));
  const ctx = {
    console: { info() {} },
    MIN_TOP_PERFORMER_GRADED_PICKS: 25, MIN_HOT_GRADED_PICKS: 10, MIN_STREAK_LENGTH: 2, MIN_ACTIVE_PICKS_30D: 5,
    HOT_WINDOW_DAYS: 30, VOID_PICK_STATUSES: new Set(['void']),
    FEATURED_MIN_LABEL: '', STREAK_INFO: '', ACTIVE_INFO: '', HOT_INFO: '',
    membersAreFresh: true, featuredStatsSettled: true, displayMembers: members, members,
    els: { featured: { innerHTML: '', removeAttribute() {} } },
    featuredRowFor: m => rows.get('uid:' + String(m.id).toLowerCase()) || null,
    officialRankFor: m => ({ rank: m.officialRank || null }),
    isQualifiedTopPerformer: m => !!m.officialRank,
    getTime: v => new Date(v || 0).getTime() || 0,
    escapeHtml: s => String(s), formatRecord: () => '', formatPercent: () => '', formatUnits: () => '',
    formatStreak: () => '', statClass: () => '',
    featuredCardHtml: o => '[' + o.category + '=' + o.member.username + ']'
  };
  vm.createContext(ctx);
  vm.runInContext(FNS.map(extractFunction).join('\n') + '\nrenderFeaturedLeaders();', ctx);
  const out = {};
  for (const m of ctx.els.featured.innerHTML.matchAll(/\[([^=\]]+)=([^\]]+)\]/g)) out[m[1]] = m[2];
  return out;
}

// Independent reference ranking (same tie-break order as the published rules).
const by = (...keys) => (a, b) => { for (const k of keys) { const d = k(b) - k(a); if (d) return d; } return a.username.localeCompare(b.username); };
const g = m => m.stats.wins + m.stats.losses + m.stats.pushes;
function expected(members, rows) {
  const q = members.filter(m => m.officialRank);
  const row = m => rows.find(r => r.id === m.id);
  const first = list => (list[0] ? list[0].username : undefined);
  const hot = members.map(m => ({ m, r: row(m) })).filter(e => e.r && e.r.graded_30d >= 10 && e.r.hot_recent)
    .sort((a, b) => (b.r.units_30d - a.r.units_30d) || (b.r.units_30d / b.r.risk_30d - a.r.units_30d / a.r.risk_30d) || (b.r.graded_30d - a.r.graded_30d) || a.m.username.localeCompare(b.m.username));
  return {
    'Units Leader': first(q.filter(m => m.stats.units > 0).sort(by(m => m.stats.units, m => m.stats.roi, g))),
    'Best ROI': first(q.filter(m => m.stats.roi > 0).sort(by(m => m.stats.roi, m => m.stats.units, g))),
    'Best Win %': first(q.filter(m => m.stats.wins + m.stats.losses > 0).sort(by(m => m.stats.winRate, g, m => m.stats.units))),
    'Most Graded Picks': first(members.filter(m => g(m) > 0).sort(by(g, m => m.stats.units))),
    'Best Current Streak': first(q.filter(m => m.stats.currentStreak >= 2).sort(by(m => m.stats.currentStreak, m => m.stats.units, g))),
    'Hottest Last 30 Days': hot[0] ? hot[0].m.username : undefined
  };
}

function member(id, username, w, l, p, units, roi, streak, officialRank) {
  return { id, username, officialRank, stats: { wins: w, losses: l, pushes: p, gradedPicks: w + l + p, totalPicks: w + l + p,
    units, roi, winRate: w + l ? (w / (w + l)) * 100 : null, currentStreak: streak } };
}
function hotRow(id, graded, units, risk, picks) {
  return { id, graded_30d: graded, units_30d: units, risk_30d: risk, wins_30d: Math.ceil(graded / 2), losses_30d: Math.floor(graded / 2), picks_30d: picks, hot_recent: true };
}

let passed = 0;
function check(name, fn) { fn(); passed++; console.log('  PASS  ' + name); }

// Fixture shaped like production on 2026-10-11 (leaderboard + featured-stats).
const PROD = [
  member(1, 'BetLegend', 519, 412, 13, 58.39, 1.83, -7, 1),
  member(625, 'MoneyMakers', 420, 230, 7, -100.15, -3.1, 0, 25),
  member(626, 'makaveli66', 210, 180, 8, 51.95, 2.9, 1, 3),
  member(2, 'americanwiseguy', 180, 155, 5, 53.19, 3.15, 9, 2),
  member(3, 'clinscheid72', 36, 30, 1, 7.53, 10.23, 0, 4),
  member(4, 'Firelink', 42, 18, 0, 0.55, 0.9, 1, 6),
  member(5, '11space', 30, 25, 0, 2.1, 1.2, 5, 7),
  member(6, 'SharperGambler', 70, 74, 2, -51.57, -4, 0, 22)
];
const PROD_ROWS = [hotRow(1, 214, 49.54, 1002.15, 215), hotRow(2, 267, 73.66, 1100, 267), hotRow(6, 43, 5.73, 200, 43), hotRow(625, 40, -9, 200, 60)];

check('Most Graded Picks shows the member with the most graded picks, not the runner-up', () => {
  const cards = runPage(PROD, PROD_ROWS);
  assert.strictEqual(cards['Most Graded Picks'], 'BetLegend', JSON.stringify(cards));
  assert.notStrictEqual(cards['Most Graded Picks'], 'MoneyMakers');
});

check('Hottest Last 30 Days shows the true 30-day units leader even when he holds Best Current Streak', () => {
  const cards = runPage(PROD, PROD_ROWS);
  assert.strictEqual(cards['Hottest Last 30 Days'], 'americanwiseguy');
  assert.strictEqual(cards['Best Current Streak'], 'americanwiseguy');
});

check('all six award cards equal the independently computed leader (production fixture)', () => {
  assert.deepStrictEqual(runPage(PROD, PROD_ROWS), expected(PROD, PROD_ROWS));
});

check('a newly graded pick that changes the leader moves the award (records drive it, nothing hardcoded)', () => {
  const next = PROD.map(m => m.username === 'MoneyMakers' ? member(625, 'MoneyMakers', 700, 240, 7, -100.15, -3.1, 0, 25) : m);
  assert.strictEqual(runPage(next, PROD_ROWS)['Most Graded Picks'], 'MoneyMakers');
});

check('randomized records: every award card is its category leader (500 trials)', () => {
  let seed = 20261011;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  for (let t = 0; t < 500; t++) {
    const ms = [], rows = [];
    const n = 4 + Math.floor(rnd() * 12);
    for (let i = 1; i <= n; i++) {
      const w = Math.floor(rnd() * 600), l = Math.floor(rnd() * 600), p = Math.floor(rnd() * 20);
      const units = Math.round((rnd() * 200 - 80) * 100) / 100;
      ms.push(member(i, 'u' + i, w, l, p, units, Math.round(units / Math.max(1, w + l) * 10000) / 100, Math.floor(rnd() * 12) - 3, rnd() < 0.6 ? i : null));
      if (rnd() < 0.7) rows.push(hotRow(i, Math.floor(rnd() * 80), Math.round((rnd() * 120 - 40) * 100) / 100, 50 + rnd() * 500, Math.floor(rnd() * 90)));
    }
    const got = runPage(ms, rows), want = expected(ms, rows);
    for (const cat of Object.keys(want)) {
      if (want[cat] === undefined) continue;
      assert.strictEqual(got[cat], want[cat], 'trial ' + t + ' ' + cat + ': ' + JSON.stringify(got));
    }
  }
});

check('Most Active filler never repeats a member who already holds a card', () => {
  const ms = [member(1, 'a', 300, 200, 0, 40, 4, 0, 1), member(2, 'b', 50, 40, 0, 5, 1, 0, 2), member(3, 'c', 20, 20, 0, -3, -1, 0, null)];
  const rows = [hotRow(1, 5, 1, 10, 90), hotRow(2, 5, 1, 10, 50), hotRow(3, 5, 1, 10, 40)];
  const html = Object.entries(runPage(ms, rows));
  const active = html.filter(([c]) => c === 'Most Active').map(([, u]) => u);
  assert(active.every(u => !['a', 'b'].includes(u)), JSON.stringify(html));
});

console.log('\n' + passed + ' passed');
