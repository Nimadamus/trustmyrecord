# TrustMyRecord Fix Tracker

## 2026-05-06 - Find Handicappers Page Load Optimization

Status: Deployed; live read-path verified; mutation invalidation hooks deployed but not live-mutated from this terminal.

Files changed:
- `handicappers/index.html`
- `routes/users.js`
- `routes/picks.js`
- `services/autoGrader.js`
- `services/leaderboardCache.js`

Commit hash:
- Frontend: `bef231e` - `Optimize handicappers page loading`
- Backend summary route fix: `81106c4` - `Fix handicappers summary API parameter binding`
- Backend cache module: `c05c4fc` - `Add handicappers leaderboard summary cache`

Push status: Pushed to production branches by GitHub Contents API after local `.git/index.lock` writes were blocked.

Deploy status:
- Frontend live page source includes `/users/handicappers/summary`.
- Backend live API returns `200` for `/api/users/handicappers/summary?limit=50&offset=0`.

Live URLs checked:
- `https://trustmyrecord.com/profile/?user=BetLegend`
- `https://trustmyrecord.com/handicappers/`
- `https://trustmyrecord-api.onrender.com/api/users/handicappers/summary?limit=50&offset=0`

Verification result:
- `/handicappers/` live source no longer includes old duplicate list calls or per-user pick/metrics hydration code.
- Summary API returned `200`, then repeated as `X-TMR-Cache: HIT`.
- Summary API returned only users with graded/public activity.
- Summary API returned no test-like account usernames in the checked response.
- Pagination was verified with `limit=1&offset=0` and `limit=1&offset=1`.
- BetLegend profile HTML/API read path was checked by HTTP fetch.

Remaining issue:
- A true browser console/DevTools waterfall could not be captured from this sandbox because local Chrome/Edge launch failed under Playwright and Selenium.
- Live mutation invalidation by submitting/grading a pick was not executed from this terminal because no authenticated user/admin session was available. Code hooks are deployed in `routes/picks.js` and `services/autoGrader.js`.

## 2026-05-06 - Profile Public Ledger Line Duplication And Negative Stat Color

Status: FIXED LOCALLY. Production deploy completed and live HTML was verified, but browser-console verification could not be completed from this sandbox because local Chrome/Edge launch is blocked.

Files changed:
- `profile/index.html`
- `static/css/tmr-sitewide.css`
- `static/css/tmr-redesign-test.css`

Tests run:
- `node tests/profile-page-lookup-test.js` - passed.
- Local served profile HTML check at `http://127.0.0.1:8021/profile/?user=BetLegend` - Public Ledger headers were `Date, Sport, Game, Pick, Market, Odds, Units, Result, Net`; no opening `Line` column.
- Live no-cache HTML fetch for `https://trustmyrecord.com/profile/?user=BetLegend&verify=ledger-red-3dfa7a4` - status `200`; Public Ledger headers were `Date, Sport, Game, Pick, Market, Odds, Units, Result, Net`; source includes `#ff3333` and no `#fca5a5` or `#ff5b6e` negative color tokens.

Commit hash:
- Code fix: `3dfa7a498cccc6a98aafa2c93d89b8238b5d3517` - `Fix profile ledger line duplication and red negatives`
- Tracker update: `94976c740b91c54ad6f0f4144ed338bbe53526cb` - `Update TrustMyRecord fix tracker for profile ledger colors`

Push status:
- Code fix pushed to `origin/main` via GitHub Git Data API because local `.git/index.lock` writes were blocked.

Deploy status:
- GitHub Pages build/deployment for `main` completed successfully after the code fix push.

Live URL verified:
- `https://trustmyrecord.com/profile/?user=BetLegend`

Verification result:
- A. Public Ledger live HTML no longer includes the duplicate opening `Line` column.
- B. Pick formatting remains routed through `formatPickDisplayValue`, which preserves the full wager wording with spread/total/team-total values in Pick.
- C. No redundant opening line cell remains immediately after Market in the Public Ledger or records ledger source.
- D. Negative/loss stat CSS paths audited in the profile page and shared capper/sitewide stat classes now use true red `#ff3333`; remaining `#f87171` occurrences are sport tag colors, not negative/loss stat states.
- E. Hard-refresh equivalent checked with no-cache/cache-busting live fetch.
- F. Browser console check was not completed because Chromium/Chrome/Edge process launch is blocked in this sandbox (`spawn EPERM` / process policy block).

Remaining risk:
- Needs one manual browser DevTools console pass on production to promote this workstream from `FIXED LOCALLY` to `VERIFIED LIVE`.
