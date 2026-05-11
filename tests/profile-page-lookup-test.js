const assert = require('assert');

function normalizeProfileLookup(value) {
  return String(value == null ? '' : value).trim().replace(/^@+/, '').trim();
}

function profileLookupKey(value) {
  return normalizeProfileLookup(value).toLowerCase();
}

function profileLookupSlug(value) {
  return profileLookupKey(value).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function profileLookupMatchesUser(value, user) {
  const key = profileLookupKey(value);
  if (!key || !user) return false;
  return [user.username, user.displayName, user.display_name, user.handle, user.slug].some((candidate) => (
    profileLookupKey(candidate) === key || profileLookupSlug(candidate) === key
  ));
}

async function resolveProfileUser(rawUserParam, sessionUser) {
  const requested = normalizeProfileLookup(rawUserParam);
  const candidates = Array.from(new Set([
    requested,
    requested.toLowerCase(),
    sessionUser && profileLookupMatchesUser(requested, sessionUser) ? sessionUser.username : '',
  ].map(normalizeProfileLookup).filter(Boolean)));

  for (const candidate of candidates) {
    const response = await fetch(`https://trustmyrecord-api.onrender.com/api/users?query=${encodeURIComponent(candidate)}&limit=8`);
    assert.strictEqual(response.status, 200, `search lookup should not fail for ${candidate}`);
    const data = await response.json();
    const match = (data.users || []).find((user) => profileLookupMatchesUser(candidate, user));
    if (match) return match;
  }
  return null;
}

function normalizeStatus(status) {
  const raw = String(status || 'pending').toLowerCase();
  if (raw === 'win') return 'won';
  if (raw === 'loss') return 'lost';
  if (raw === 'pushed') return 'push';
  return raw;
}

function calculateLedgerStats(picks) {
  const graded = (picks || []).filter((pick) => ['won', 'lost', 'push'].includes(normalizeStatus(pick.status)));
  const wins = graded.filter((pick) => normalizeStatus(pick.status) === 'won').length;
  const losses = graded.filter((pick) => normalizeStatus(pick.status) === 'lost').length;
  const pushes = graded.filter((pick) => normalizeStatus(pick.status) === 'push').length;
  const net = graded.reduce((sum, pick) => sum + Number(pick.result_units || 0), 0);
  const risked = graded.reduce((sum, pick) => sum + Number(pick.units || 0), 0);
  return {
    graded: graded.length,
    wins,
    losses,
    pushes,
    record: `${wins}-${losses}-${pushes}`,
    winRate: wins + losses ? (wins / (wins + losses)) * 100 : null,
    net,
    roi: risked > 0 ? (net / risked) * 100 : null,
  };
}

async function main() {
  const cases = [
    ['/profile/?user=BetLegend', 'BetLegend'],
    ['/profile/?user=betlegend', 'betlegend'],
    ['/profile/?user=BetLegendPicks casing alias', 'BetLegendPicks'],
    ['/profile/?user=@BetLegend', '@BetLegend'],
    ['logged-in user profile route', 'BetLegend', { username: 'BetLegend', displayName: 'BetLegend' }],
  ];
  let canonicalId = null;
  for (const [label, value, sessionUser] of cases) {
    const user = await resolveProfileUser(value, sessionUser);
    if (value === 'BetLegendPicks') {
      assert(!user || user.id === canonicalId, `${label} must not create or resolve a separate phantom profile`);
      continue;
    }
    assert(user, `${label} should resolve a profile`);
    assert.strictEqual(profileLookupKey(user.username), 'betlegend', `${label} should resolve BetLegend`);
    if (canonicalId == null) canonicalId = user.id;
    assert.strictEqual(user.id, canonicalId, `${label} should resolve the same profile`);
  }

  const picksResponse = await fetch('https://trustmyrecord-api.onrender.com/api/picks?username=BetLegend&limit=100&offset=0');
  assert.strictEqual(picksResponse.status, 200, 'BetLegend pick ledger should load');
  const picksData = await picksResponse.json();
  const stats = calculateLedgerStats(picksData.picks || []);
  assert(stats.graded > 0, 'BetLegend graded pick count should come from the ledger');
  assert.notStrictEqual(stats.record, '0-0-0', 'BetLegend record must not be zero when graded picks exist');
  assert(stats.winRate != null, 'BetLegend win rate must be calculable when wins/losses exist');

  const profileResponse = await fetch('https://trustmyrecord-api.onrender.com/api/users/BetLegend');
  assert.strictEqual(profileResponse.status, 200, 'BetLegend profile API should load');
  const profileData = await profileResponse.json();
  const profileUser = profileData.user || {};
  assert.strictEqual(Number(profileUser.graded_picks), stats.graded, 'profile graded picks should match ledger');
  assert.strictEqual(`${profileUser.wins}-${profileUser.losses}-${profileUser.pushes}`, stats.record, 'profile record should match ledger');
  assert.strictEqual(Math.round(Number(profileUser.win_rate) * 10), Math.round(stats.winRate * 10), 'profile win rate should match ledger');

  const leaderboardResponse = await fetch('https://trustmyrecord-api.onrender.com/api/users/leaderboard?sortBy=net_units&limit=250');
  assert.strictEqual(leaderboardResponse.status, 200, 'leaderboard should load');
  const leaderboardData = await leaderboardResponse.json();
  const leaderboardUser = (leaderboardData.leaderboard || []).find((user) => profileLookupKey(user.username) === 'betlegend');
  if (leaderboardUser) {
    assert.strictEqual(Number(leaderboardUser.total_picks), stats.graded, 'leaderboard graded picks should match ledger');
    assert.strictEqual(`${leaderboardUser.wins}-${leaderboardUser.losses}-${leaderboardUser.pushes}`, stats.record, 'leaderboard record should match ledger');
    assert.strictEqual(Math.round(Number(leaderboardUser.win_rate) * 10), Math.round(stats.winRate * 10), 'leaderboard win rate should match ledger');
    assert.strictEqual(Math.round(Number(leaderboardUser.net_units) * 100), Math.round(stats.net * 100), 'leaderboard net units should match ledger');
  } else {
    assert.strictEqual(profileUser.leaderboard_rank, null, 'unranked BetLegend profile rank should be hidden');
    assert.strictEqual(profileUser.ranking_status, 'Not ranked yet', 'unranked BetLegend should show Not ranked yet');
  }

  console.log('profile-page-lookup-test: ok');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
