/**
 * The ONLY sanctioned way for a test to create an account on TrustMyRecord.
 *
 * Background (2026-08-15): tests/e2e/betlegend-pro-live.spec.mjs needed "a
 * non-entitled, non-test account" to exercise the free-tier path. Whoever
 * provisioned `ledgercheck_mv7` did the literal thing -- registered it by hand
 * with account_type='real', is_internal_test=false, verification_status=
 * 'verified' and an email on the reserved domain @blpaudit.example. The result
 * was an account that production could not distinguish from a human: it entered
 * the member directory, became the site's "Newest Member", posted a joined event
 * to the LIVE ON TMR strip, minted itself 25 TMR Coin, and had an indexable
 * /u/ledgercheck_mv7/ page baked and shipped to the live site.
 *
 * That trade-off no longer exists. The backend accepts an `X-TMR-Automation`
 * header on signup, which records `users.automation_provenance`. A database
 * trigger (trg_users_automation_guard) then forces `is_internal_test = true`,
 * which is what every production surface actually gates on:
 *
 *   counted as a member          NO   (publicDirectoryUserWhere)
 *   directory / leaderboards     NO   (publicDirectoryUserWhere)
 *   newest-member widget         NO   (publicDirectoryUserWhere)
 *   forum listings / feed        NO   (publicUserCondition)
 *   LIVE ON TMR activity strip   NO   (services/activityFeed.js)
 *   milestones / monthly awards  NO   (services/milestones.js)
 *   TMR Coin signup grant        NO   (routes/auth.js)
 *   welcome email                NO   (routes/auth.js)
 *   /u/ SEO bake + sitemap       NO   (prerender reads the directory filter)
 *
 *   account_type                 'real'      <- unchanged
 *   verification_status          'verified'  <- unchanged
 *   password / login / session   identical   <- unchanged
 *   entitlement + paywall path   identical   <- unchanged
 *
 * So the behavioural path under test is the genuine one, and none of the
 * exclusions above can be undone by editing a route: the invariant lives in the
 * database, not in Express.
 *
 * The provenance is written IN the INSERT, not by a follow-up UPDATE, so the
 * account is excluded from creation time -- it never counts as a member, not
 * even for the instant between two statements. (That gap was real: the
 * "user joined" feed trigger is AFTER INSERT and reads is_internal_test at that
 * moment, which is how 2136 announced itself on the LIVE ON TMR strip.)
 *
 * DO NOT create an account on production to satisfy a spec without asking Nima
 * first. This helper is for fixtures he has already approved; it makes an
 * approved account safe, it does not make an unapproved one acceptable.
 *
 * Do not register accounts any other way from a test. If you need one that
 * outlives the run, still create it through here -- provenance is what keeps it
 * out of the numbers, and it is permanent.
 */

const API = process.env.BLP_LIVE_API || 'https://trustmyrecord-api.onrender.com';

/**
 * @param {import('@playwright/test').APIRequestContext} request
 * @param {object} opts
 * @param {string} opts.origin  What created this account. Be specific enough to
 *                              trace it back later, e.g.
 *                              'playwright:betlegend-pro-live.spec.mjs:free-persona'.
 * @param {string} [opts.prefix] Username prefix. Defaults to 'qa_'.
 * @returns {Promise<{username: string, password: string, email: string, userId: number}>}
 */
export async function createAutomationAccount(request, { origin, prefix = 'qa_' }) {
  if (!origin) throw new Error('createAutomationAccount requires an `origin` -- it becomes the permanent provenance record.');

  const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const username = `${prefix}${stamp}`;
  // Reserved-domain address (RFC 2606). Non-deliverable by design, and a
  // second, independent trigger to the same guard if the header is ever lost.
  const email = `${username}@qa.trustmyrecord.test`;
  const password = `Qa!${stamp}#auto`;

  const res = await request.post(`${API}/api/auth/signup`, {
    headers: { 'X-TMR-Automation': origin },
    data: { username, email, password, displayName: username },
  });

  if (!res.ok()) {
    throw new Error(`automation signup failed (${res.status()}): ${await res.text()}`);
  }
  const body = await res.json();
  return { username, password, email, userId: body?.user?.id };
}

/**
 * Fails the calling test if `username` is not marked as automation in
 * production. Call this once in a setup hook for any long-lived fixture account
 * a suite depends on, so a fixture can never silently drift back into the member
 * counts the way user 2136 did.
 */
export async function assertMarkedAsAutomation(request, username) {
  const res = await request.get(`${API}/api/users/${encodeURIComponent(username)}`);
  // A correctly-marked automation account is NOT a public profile: the API must
  // not resolve it. A 200 here means it is masquerading as a member again.
  if (res.ok()) {
    throw new Error(
      `FIXTURE LEAK: ${username} resolves as a public profile, so it is being counted as a real member. ` +
      `Set users.automation_provenance for it (see database/migration_users_automation_provenance.sql).`
    );
  }
}
