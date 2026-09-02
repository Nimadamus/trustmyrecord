const assert = require('assert');

// CI_RETRIES_20260902: this proof reads production. A cold start, a 502 from
// the edge or a dropped socket is not a regression; retry it three times with
// backoff. A 4xx or a wrong body is returned as-is and fails exactly as before.
const rawFetch = globalThis.fetch;
async function fetch(url, init) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      const response = await rawFetch(url, init);
      const transient = response.status === 429 || (response.status >= 500 && response.status <= 599);
      if (attempt === 3 || !transient) return response;
    } catch (error) {
      if (attempt === 3) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 3000 * attempt));
  }
}

const API = 'https://trustmyrecord-api.onrender.com/api';
const SITE = 'https://www.trustmyrecord.com';

const TEST_USERNAME_RE = /^(qa_|test|audit|tmrverify|tmrtest|tmrcheck|tmrflow|tmrhangout|tmrlogin|tmrfast|tmrnhl|tmrlive|tmrpick|tmrprobe|tmrtokens|tmrtennis|tennislive_|runline_|runline2_|feedcheck|tmr_ui_|tmr_probe_|nhlverify|flowverify|cleanprobe|freshcool|freshafter|sportsbook_|probe|signup_test|smoke_|playwright|cypress|demo)/i;
// Graded = won/lost/push, the same set profile.graded_picks counts. Void and
// cancelled picks are final but not graded (708 vs 679 on 2026-09-02 was them).
const FINAL_STATUSES = new Set(['won', 'lost', 'push']);

async function getJson(url) {
  const response = await fetch(url, { headers: { 'user-agent': 'TrustMyRecord ranking UI test' } });
  assert.strictEqual(response.status, 200, `${url} should return 200`);
  return response.json();
}

async function getText(url) {
  const response = await fetch(url, { headers: { 'user-agent': 'TrustMyRecord ranking UI test' } });
  assert.strictEqual(response.status, 200, `${url} should return 200`);
  return response.text();
}

function normalizeStatus(value) {
  return String(value || '').toLowerCase();
}

function ledgerStats(picks) {
  const graded = (picks || []).filter((pick) => FINAL_STATUSES.has(normalizeStatus(pick.status)));
  const wins = graded.filter((pick) => normalizeStatus(pick.status) === 'won').length;
  const losses = graded.filter((pick) => normalizeStatus(pick.status) === 'lost').length;
  const pushes = graded.filter((pick) => normalizeStatus(pick.status) === 'push').length;
  const netUnits = graded.reduce((sum, pick) => sum + Number(pick.result_units || 0), 0);
  return {
    graded: graded.length,
    wins,
    losses,
    pushes,
    netUnits: Number(netUnits.toFixed(2)),
    winRate: wins + losses > 0 ? Number(((wins / (wins + losses)) * 100).toFixed(2)) : 0,
  };
}

async function main() {
  const leaderboard = await getJson(`${API}/users/leaderboard?sortBy=net_units&limit=100`);
  const ranked = leaderboard.leaderboard || [];
  ranked.forEach((user, index) => {
    // NET_UNITS_FILTER_20260817: the API no longer gates public rank on
    // net_units > 0; losing records are ranked by the same 20-pick rule.
    assert(Number(user.total_picks || user.graded_picks) >= 20, `${user.username} must have 20+ graded picks`);
    assert.strictEqual(user.ranking_status, `Ranked #${index + 1}`, `${user.username} should have sequential public rank text`);
    assert(!TEST_USERNAME_RE.test(String(user.username || '')), `${user.username} must not be a test/QA account`);
    if (index > 0) {
      assert(Number(ranked[index - 1].net_units) >= Number(user.net_units), 'leaderboard must be sorted by net units first');
    }
  });

  const directory = await getJson(`${API}/users?limit=250&offset=0`);
  const directoryUsers = directory.users || [];
  assert(directoryUsers.some((user) => String(user.username || '').toLowerCase() === 'betlegend'), 'real public BETLEGEND profile should remain discoverable');
  assert(directoryUsers.every((user) => !TEST_USERNAME_RE.test(String(user.username || ''))), 'test and QA usernames should stay hidden from directory');
  assert(directoryUsers.every((user) => Number(user.total_picks || 0) > 0), 'inactive zero-pick users should not appear in directory');

  const profileCases = ['BETLEGEND', 'betlegend', '%40BetLegend'];
  const profiles = [];
  for (const key of profileCases) {
    const data = await getJson(`${API}/users/${key}`);
    profiles.push(data.user);
  }
  profiles.forEach((user) => {
    assert.strictEqual(String(user.username || '').toLowerCase(), 'betlegend', 'profile lookup normalization should resolve BETLEGEND');
    // NET_UNITS_FILTER_20260817: rank follows the 20-graded-pick rule only, so a losing record can hold a public rank.
    if (Number(user.graded_picks) >= 20) { assert(/^Ranked #\d+$/.test(String(user.ranking_status)), 'eligible BETLEGEND should carry a numeric public rank'); assert(Number.isInteger(Number(user.leaderboard_rank)), 'eligible BETLEGEND should expose leaderboard_rank'); } else { assert.strictEqual(user.leaderboard_rank, null, 'ineligible BETLEGEND must not have a public rank'); assert.strictEqual(user.ranking_status, 'Not ranked yet', 'ineligible BETLEGEND should show Not ranked yet'); }
  });

  // Page the whole ledger: BetLegend passed 100 graded picks long ago, and one
  // page compared against profile.graded_picks (679 on 2026-09-02) can never match.
  const picks = { picks: [] };
  for (let offset = 0; offset < 10000; offset += 100) {
    const page = await getJson(`${API}/picks?username=BetLegend&limit=100&offset=${offset}`);
    const batch = page.picks || [];
    if (batch.length === 0) break;
    picks.picks.push(...batch);
  }
  const ledger = ledgerStats(picks.picks || []);
  const profile = profiles[0];
  assert.strictEqual(Number(profile.graded_picks), ledger.graded, 'profile graded picks should match backend ledger');
  assert.strictEqual(Number(profile.wins), ledger.wins, 'profile wins should match backend ledger');
  assert.strictEqual(Number(profile.losses), ledger.losses, 'profile losses should match backend ledger');
  assert.strictEqual(Number(profile.pushes), ledger.pushes, 'profile pushes should match backend ledger');
  assert.strictEqual(Number(profile.net_units), ledger.netUnits, 'profile net units should match backend ledger');
  assert(Math.abs(Number(profile.win_rate) - ledger.winRate) <= 0.1, 'profile win rate should match backend ledger (API rounds to one decimal)');

  const profilePage = await getText(`${SITE}/profile/?user=BETLEGEND`);
  assert(profilePage.includes('ranking_status'), 'profile page should render backend ranking_status field');
  assert(profilePage.includes('sidebarLeaderboard'), 'profile sidebar rank slot should be present');

  const handicappersPage = await getText(`${SITE}/handicappers/`);
  assert(handicappersPage.includes('/api/users/directory'), 'handicappers page should consume the directory endpoint');
  assert(handicappersPage.includes('25+ graded picks'), 'handicappers page should show the graded-picks threshold copy');
  // NET_UNITS_FILTER_20260817: positive-unit eligibility no longer exists.

  const leaderboardsPage = await getText(`${SITE}/leaderboards/`);
  assert(leaderboardsPage.includes('sortBy=net_units'), 'leaderboards hub should request net-unit ranking');
  assert(!leaderboardsPage.includes('positive net units'), 'leaderboards hub must not reintroduce the deleted positive-unit gate copy');
  assert(leaderboardsPage.includes('20 graded picks'), 'leaderboards hub should disclose the 20-pick public threshold');

  console.log('public-ranking-ui-live-test: ok');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
