const assert = require('assert');

const API = 'https://trustmyrecord-api.onrender.com/api';
const SITE = 'https://www.trustmyrecord.com';

const TEST_USERNAME_RE = /^(qa_|test|audit|tmrverify|tmrtest|tmrcheck|tmrflow|tmrhangout|tmrlogin|tmrfast|tmrnhl|tmrlive|tmrpick|tmrprobe|tmrtokens|tmrtennis|tennislive_|runline_|runline2_|feedcheck|tmr_ui_|tmr_probe_|nhlverify|flowverify|cleanprobe|freshcool|freshafter|sportsbook_|probe|signup_test|smoke_|playwright|cypress|demo)/i;
const FINAL_STATUSES = new Set(['won', 'lost', 'push', 'void', 'cancelled']);

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
    assert(Number(user.net_units) > 0, `${user.username} must have positive units to be ranked`);
    assert(Number(user.total_picks || user.graded_picks) >= 20, `${user.username} must have 20+ graded picks`);
    assert.strictEqual(user.ranking_status, `Ranked #${index + 1}`, `${user.username} should have sequential public rank text`);
    assert(!TEST_USERNAME_RE.test(String(user.username || '')), `${user.username} must not be a test/QA account`);
    if (index > 0) {
      assert(Number(ranked[index - 1].net_units) >= Number(user.net_units), 'leaderboard must be sorted by net units first');
    }
  });
  assert(!ranked.some((user) => String(user.username || '').toLowerCase() === 'betlegend'), 'negative-unit BETLEGEND must not be ranked');

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
    assert.strictEqual(user.leaderboard_rank, null, 'negative-unit BETLEGEND must not have a public rank');
    assert.strictEqual(user.ranking_status, 'Not ranked yet', 'negative-unit BETLEGEND should show Not ranked yet');
  });

  const picks = await getJson(`${API}/picks?username=BetLegend&limit=100&offset=0`);
  const ledger = ledgerStats(picks.picks || []);
  const profile = profiles[0];
  assert.strictEqual(Number(profile.graded_picks), ledger.graded, 'profile graded picks should match backend ledger');
  assert.strictEqual(Number(profile.wins), ledger.wins, 'profile wins should match backend ledger');
  assert.strictEqual(Number(profile.losses), ledger.losses, 'profile losses should match backend ledger');
  assert.strictEqual(Number(profile.pushes), ledger.pushes, 'profile pushes should match backend ledger');
  assert.strictEqual(Number(profile.net_units), ledger.netUnits, 'profile net units should match backend ledger');
  assert.strictEqual(Number(profile.win_rate), ledger.winRate, 'profile win rate should match backend ledger');

  const profilePage = await getText(`${SITE}/profile/?user=BETLEGEND`);
  assert(profilePage.includes('ranking_status'), 'profile page should render backend ranking_status field');
  assert(profilePage.includes('sidebarLeaderboard'), 'profile sidebar rank slot should be present');

  const handicappersPage = await getText(`${SITE}/handicappers/`);
  assert(handicappersPage.includes('sortBy=net_units'), 'handicappers page should consume net-unit leaderboard policy');
  assert(handicappersPage.includes('Minimum 20 graded picks'), 'handicappers page should show the public rank threshold');
  assert(handicappersPage.includes('positive net units'), 'handicappers page should explain positive-unit rank eligibility');

  const leaderboardsPage = await getText(`${SITE}/leaderboards/`);
  assert(leaderboardsPage.includes('sortBy=net_units'), 'leaderboards hub should request net-unit ranking');
  assert(leaderboardsPage.includes('positive net units'), 'leaderboards hub should disclose positive-unit eligibility');
  assert(leaderboardsPage.includes('20 graded picks'), 'leaderboards hub should disclose the 20-pick public threshold');

  console.log('public-ranking-ui-live-test: ok');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
