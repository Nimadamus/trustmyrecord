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
  // CANONICAL_RANKING_20260914: an official rank needs 25 graded picks, recent
  // activity, net units > 0 AND ROI > 0, and 3 qualified members. Losing and
  // thin records are listed with "Not Ranked", never a number.
  const leaderboard = await getJson(`${API}/users/leaderboard?sortBy=rank&minPicks=1&limit=100`);
  const ranked = leaderboard.leaderboard || [];
  const official = ranked.filter((user) => user.official_rank);
  const n = leaderboard.ranking ? leaderboard.ranking.qualified_count : 0;
  assert(official.length === 0 || n >= 3, 'numbered ranks require at least 3 qualified handicappers');
  official.forEach((user, index) => {
    assert.strictEqual(user.official_rank, index + 1, `${user.username} official ranks lead the rank order`);
    assert.strictEqual(user.ranking_status, `#${index + 1} of ${n} qualified`, `${user.username} rank label carries its denominator`);
    assert(Number(user.graded_picks) >= 25, `${user.username} must have 25+ graded picks`);
    assert(Number(user.net_units) > 0 && Number(user.roi) > 0, `${user.username} must be profitable to hold a rank`);
  });
  ranked.forEach((user) => {
    assert(!TEST_USERNAME_RE.test(String(user.username || '')), `${user.username} must not be a test/QA account`);
    if (Number(user.net_units) <= 0 || Number(user.roi) <= 0 || Number(user.graded_picks) < 25) {
      assert.strictEqual(user.rank, null, `${user.username} cannot hold a numbered rank`);
      assert(/^Not Ranked/.test(String(user.ranking_status)), `${user.username} reads Not Ranked`);
    }
  });
  const byRoi = await getJson(`${API}/users/leaderboard?sortBy=roi&minPicks=1&limit=100`);
  const officialByName = Object.fromEntries(ranked.map((u) => [u.username, u.rank]));
  (byRoi.leaderboard || []).forEach((user) => {
    assert.strictEqual(user.rank, officialByName[user.username], `${user.username}: a sort never changes the official rank`);
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
    // CANONICAL_RANKING_20260914: the profile rank is the board's official rank.
    assert.strictEqual(user.leaderboard_rank || null, officialByName.BetLegend || officialByName.betlegend || null, 'BETLEGEND profile rank equals the board');
    if (user.leaderboard_rank) assert(/^#\d+ of \d+ qualified$/.test(String(user.ranking_status)), 'a ranked profile carries "#k of N qualified"');
    else assert(/^Not Ranked/.test(String(user.ranking_status)), 'an unranked profile reads Not Ranked');
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
