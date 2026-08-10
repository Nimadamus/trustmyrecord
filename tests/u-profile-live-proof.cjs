/**
 * u-profile-live-proof — production proof that no public member's /u/ URL 404s.
 *
 * Companion to tests/u-profile-edge-fallback-test.mjs, which proves the worker
 * logic offline. This one asserts the property that actually matters, against
 * the live site:
 *
 *   every URL the backend publishes for a member resolves to that member's
 *   profile, and a URL for a non-member still honestly 404s.
 *
 * It is the check that would have caught the 2026-08-10 `whocares67` recurrence
 * in the ~10 minutes it was broken: the newest-member widget linked to
 * /u/whocares67/ from the second the account existed, and the page was not
 * baked until 10m20s later.
 *
 * Run after any deploy that touches the worker, the profile bake or the
 * newest-member surfaces:
 *     node tests/u-profile-live-proof.cjs
 */
const SITE = process.env.TMR_SITE || 'https://trustmyrecord.com';
const API = process.env.TMR_API || 'https://trustmyrecord-api.onrender.com/api';

let failures = 0;
const ok = (m) => console.log('  ok    ' + m);
const fail = (m) => { failures += 1; console.log('  FAIL  ' + m); };

const getJson = async (u) => {
  const r = await fetch(u, { headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error(`${u} -> HTTP ${r.status}`);
  return r.json();
};

/* A page that "resolves" must be that member's profile, not a 200 shell and not
   the 404 document served with a 200. */
function profileIsFor(html, username) {
  if (/We couldn.{0,3}t find that page/i.test(html)) return 'served the 404 page body';
  if (html.includes('__TMR_USERNAME__')) return 'template placeholder left unsubstituted';
  if (!html.includes(username)) return 'page does not name the member';
  const canon = /<link rel="canonical" href="([^"]+)"/i.exec(html);
  const want = `${SITE}/u/${encodeURIComponent(username)}/`;
  if (!canon) return 'no canonical link';
  if (canon[1].replace(/\/$/, '') !== want.replace(/\/$/, ''))
    return `canonical is ${canon[1]}, expected ${want}`;
  if (!/<h1[\s>]/i.test(html)) return 'no <h1>';
  return null;
}

(async () => {
  console.log('\nnewest member — the exact link the site publishes');
  {
    const d = await getJson(`${API}/users/newest-member`);
    const m = d && d.member;
    if (!m || !m.username) {
      fail('/api/users/newest-member returned no member');
    } else {
      // The backend hands out profile_url; the widgets use it verbatim. Test the
      // published string, not a locally reconstructed one — reconstructing it
      // here would hide a disagreement between the two.
      const url = SITE + (m.profile_url || `/u/${encodeURIComponent(m.username)}/`);
      const res = await fetch(url, { redirect: 'follow' });
      const html = await res.text();
      if (res.status !== 200) {
        fail(`newest member ${m.username}: ${url} -> HTTP ${res.status} ` +
             `(registered ${m.created_at}). This is the recurring defect.`);
      } else {
        const why = profileIsFor(html, m.username);
        if (why) fail(`newest member ${m.username}: ${url} -> 200 but ${why}`);
        else ok(`${m.username} -> ${url} 200, resolves to their profile` +
                (res.headers.get('x-tmr-u') ? ' (edge fallback, page not baked yet)' : ' (baked)'));
      }
    }
  }

  console.log('\nevery public-directory member');
  {
    // The same set build_profile_pages.py guarantees a page for. If any of them
    // 404s, some member's canonical URL is dead right now.
    const d = await getJson(`${API}/users/directory-usernames`);
    const names = (d.users || []).map((u) => u.username).filter(Boolean);
    if (names.length < 10) {
      fail(`directory returned only ${names.length} members — refusing to call that a pass`);
    } else {
      const broken = [];
      for (const n of names) {
        const url = `${SITE}/u/${encodeURIComponent(n)}/`;
        try {
          const res = await fetch(url, { redirect: 'follow' });
          if (res.status !== 200) { broken.push(`${n} (HTTP ${res.status})`); continue; }
          const why = profileIsFor(await res.text(), n);
          if (why) broken.push(`${n} (${why})`);
        } catch (e) {
          broken.push(`${n} (${e.message})`);
        }
      }
      if (broken.length) fail(`${broken.length}/${names.length} member URLs broken: ` +
                              broken.slice(0, 10).join(', '));
      else ok(`${names.length} member profile URLs all 200 and resolve to the right member`);
    }
  }

  console.log('\nnon-members still 404 (the fix must not conceal real gaps)');
  {
    const url = `${SITE}/u/zzz-not-a-member-${Date.now()}/`;
    const res = await fetch(url, { redirect: 'manual' });
    if (res.status === 404) ok('unknown username -> genuine 404');
    else fail(`unknown username -> HTTP ${res.status}; the edge is inventing pages`);
  }

  console.log(failures === 0
    ? '\nU PROFILE LIVE PROOF: ALL CHECKS PASSED'
    : `\nU PROFILE LIVE PROOF FAILED: ${failures} problem(s)`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error('\nU PROFILE LIVE PROOF ERRORED:', e); process.exit(1); });
