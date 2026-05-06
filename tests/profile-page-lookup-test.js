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

async function main() {
  const cases = [
    ['/profile/?user=BetLegend', 'BetLegend'],
    ['/profile/?user=betlegend', 'betlegend'],
    ['/profile/?user=@BetLegend', '@BetLegend'],
    ['logged-in user profile route', 'BetLegend', { username: 'BetLegend', displayName: 'BetLegend' }],
  ];
  let canonicalId = null;
  for (const [label, value, sessionUser] of cases) {
    const user = await resolveProfileUser(value, sessionUser);
    assert(user, `${label} should resolve a profile`);
    assert.strictEqual(profileLookupKey(user.username), 'betlegend', `${label} should resolve BetLegend`);
    if (canonicalId == null) canonicalId = user.id;
    assert.strictEqual(user.id, canonicalId, `${label} should resolve the same profile`);
  }
  console.log('profile-page-lookup-test: ok');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
