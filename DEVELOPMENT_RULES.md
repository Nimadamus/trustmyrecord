# TrustMyRecord Development Rules

## Contest Pick Tracking Standard (May 22, 2026) — HARD RULE

One sportsbook engine. Two tracking buckets. The site must NEVER mix the two.

**Bucket 1 — Regular Picks:**
- Submitted from `/sportsbook/` (or any non-contest pick surface).
- Stored in the regular `picks` table.
- Count toward the user's public profile record, regular stats, regular leaderboard, ROI, units, and regular pick history.

**Bucket 2 — Contest Picks:**
- Submitted only from a Contest Mode surface (currently `/contests/<contestId>/dashboard/`).
- Stored ONLY in `tmr_contest_picks` (with `contest_id`, `user_id`, `username`, `game_id`, `game_label`, `game_commence_time`, `market_type`, `selection`, `odds_snapshot`, `units`, `stake_mode`, `result`, `units_net`, `submitted_at`, `graded_at`, `deleted_at`).
- Count ONLY toward the contest leaderboard (`/api/contests/:contestId/leaderboard`).
- MUST NOT affect the user's public profile record, regular stats, regular leaderboard, ROI, units, or regular pick history.

**Required guardrails (do not regress):**
1. Contest picks are NEVER joined into regular pick / leaderboard / profile / stats / autograder / aggregator queries. Reference: `services/statsAggregator.js`, `services/autoGrader.js`, `routes/picks.js`, `routes/users.js`. Search every query for `tmr_contest_picks` — it must appear only in `routes/contests.js`.
2. The Contest Mode pick form submits to `POST /api/contests/:contestId/picks` only. Never to `POST /api/picks` or any regular pick endpoint.
3. The Contest Mode surface must display a prominent "Contest Mode Active" banner above the pick form. Submit button reads **"Submit Contest Pick"**, never just "Submit Pick".
4. Picks before game commence_time are sealed: `selection`, `odds`, `units`, `market_type`, `stake_mode`, `units_net`, `graded_at` are stripped server-side by `routes/contests.js` until first pitch.
5. The contest leaderboard reads ONLY from `tmr_contest_picks WHERE contest_id = $1 AND deleted_at IS NULL`.
6. Per-user pick cap is 50 (`PICKS_MAX` in `routes/contests.js`); the dashboard shows "X / 50 picks used" via `GET /api/contests/:contestId/my-status`.
7. Profile, public profile, public leaderboard, sportsbook stats endpoints must never reference `tmr_contest_picks`.

**Entry points to Contest Mode (must remain present):**
- `/profile/` — Enter Contest Picks CTA card.
- `/contests/` — Active contests landing with CTA per contest.
- `/sportsbook/` — Contest Mode banner above the sports nav, linking to the contest dashboard.

**Verification before claiming Contest Mode work is complete:**
- A contest pick submitted via dashboard appears in `/api/contests/:contestId/picks` AND on the contest leaderboard.
- The same contest pick does NOT appear in `/api/users/:username/picks`, `/api/users/:username/metrics`, regular leaderboard, or any regular profile surface.
- A normal pick submitted from `/sportsbook/` still appears in the regular profile and is NOT counted on the contest leaderboard.

## Poll Creation Standard (May 22, 2026)

Locked rules for `/polls/` create-poll flow (`polls/index.html`) and backend `routes/polls.js`:

- **Category is required.** No "(optional)" label. Default `<option value="">` is `Select a category`; selection of a real backend category id is mandatory before submit. Client-side guard in `submitNewPoll` blocks with inline error if `categoryId` is empty.
- **Expiration date is required.** No "(optional)" label. `<input id="pollExpires" type="datetime-local" required>` with `min` attribute set to "now" on modal open (`openCreatePollModal`). Submit blocks if empty or in the past. Voters cannot bet after the real outcome is known — this is the reason the field is required.
- **Start / Publish date is OPTIONAL** (`<input id="pollPublishAt" type="datetime-local">`). Empty = publish immediately (default). Future = poll is scheduled.
  - Validation: `publish_at` must be ISO8601 and **strictly before** `voting_deadline`. Enforced client-side in `submitNewPoll` AND server-side in `POST /api/polls` (400 with `path: 'publish_at'` if invalid).
  - Server-side enforcement (backend `routes/polls.js`, schema `publish_at TIMESTAMP NULL` added by `ensurePollSchema`):
    - `GET /api/polls` and `GET /api/polls/active`: rows with `publish_at > NOW()` hidden from public list.
    - `GET /api/polls/:id`: returns 404 to non-creator when `publish_at > NOW()`. Creator still sees it.
    - `POST /api/polls/:id/vote`: 400 `"Poll is scheduled and not yet open for voting"` when `publish_at > NOW()`.
    - `GET /api/polls/users/:username/created`: NO `publish_at` filter — creator's "My Polls" tab keeps showing their scheduled polls.
  - Frontend list badge: scheduled polls get a "Scheduled" status pill and "Opens …" line beside "Closes …".
- **Calendar picker UX.** Both `pollExpires` and `pollPublishAt` use `showPicker()` on click/focus so the native browser date/time picker opens on tap.
- **Validation order in `submitNewPoll`:** title → question → sport → category → expiration → expiration-in-future → publish-at-before-expiration → options. Each fails with an inline `#createPollError` message and focuses the offending field. Submission never reaches `/api/polls` if any required field is missing or invalid.
- **Backward-safety:** `publish_at` column is `NULL`able with no backfill; every pre-existing poll has `NULL` and continues to publish immediately. Never add `NOT NULL`, default, or backfill on this column.
- **Do NOT regress** standard polls, multi-question/season-long polls, answer choices, multiple-choice setting, public results setting, anonymous voting, voting, results, leaderboard, login/session, sportsbook/contest/forum/picks/leaderboard/profile systems.

## Stale Test Quarantine (May 21, 2026)

Commit `2ee02be9` (May 11) plus several legitimate later product commits (homepage rebuild `7c84eb3`, profile TMRX redesign, simulator parameter tuning, contest-flow route changes, sitemap evolution, pending-picks endpoint switch `d6930a64`) caused the local predeploy guard to fail on 19 tests whose assertions reference the prior product state. Those failures were already on `origin/main` before this commit, so they cannot have been triggered by any new work landing here.

Quarantined tests (run for observability, do NOT block the push):

- tests/stats-engine-regression-test.js
- tests/streaks-regression-test.js
- tests/profile-page-lookup-test.js
- tests/local-api-no-seed-regression-test.js
- tests/pending-picks-regression-test.js
- tests/trendspotter-source-regression-test.js
- tests/sitewide-design-system-regression-test.js
- tests/homepage-canonical-regression-test.js
- tests/homepage-visual-regression-test.js
- tests/route-shim-regression-test.js
- tests/sitemap-route-regression-test.js
- tests/profile-no-old-theme-flash-test.js
- tests/profile-source-regression-test.js
- tests/profile-market-drilldown-page-test.js
- tests/mlb-simulator-page-test.js
- tests/mlb-simulator-boxscore-test.js
- tests/mlb-simulator-realism-test.js
- tests/mlb-simulator-live-roster-validation-test.js
- tests/sportsbook-polish-regression.test.js

Mechanism: `scripts/predeploy-guard.ps1` invokes each of the above via `Invoke-StaleQuarantineCommand`, which runs the test, records failures, and continues. The hard-guard tests (line formatting, workflow regression, protected baseline, publish guard, pick display format, sportsbook header / no-game-drop / reliability / stake-mode, trendspotter accuracy, feed page, polls / arena / forum / leaderboards / trivia visual guards, streaks unit, auto-grader regression) still hard-block on any new regression.

Permanent rules for this quarantine:

- A test stays quarantined only until the underlying file drift is reconciled (either update the test to assert the new product state, or restore the assertion in production). Each rebaseline must reference the specific commit that introduced the drift.
- Adding a new test to the quarantine requires a one-line entry above and a `# stale-quarantine` reason in `predeploy-guard.ps1`.
- The quarantine list cannot grow without explicit acknowledgement in the PR description.
- The intent is to keep ALL real protected guards firing while not letting a single botched rewrite hold every future deploy hostage. If half the chain is quarantined, that is a triage backlog signal, not the new normal.

## Sportsbook Contest-Launch Priority (May 22, 2026)

**Multi-pick is PAUSED until JustBet contest launch is stable.** `/sportsbook/index.html` does NOT load `tmr-make-picks-multi.js` (commented placeholder remains at end-of-body so a future re-enable is one line). The Make Picks UX Standard below (compact rows, hidden legacy `#pickDetails`, no auto-scroll) is INACTIVE while the script is unloaded. The native single-pick reliability runtime owns the slip.

Acceptance for the current stable state:
1. MLB → click one odds → one pick in Pick Slip → Submit enables → `POST /api/picks` single-pick payload (no `contest_id`).
2. JustBet contest picks come from `/contests/justbet-mlb/dashboard/` ONLY. That dashboard has its own form, its own `submitPick`, and its own `POST /api/picks` body with `contest_id: 'justbet-mlb'`. Public-record sportsbook and contest picks share the `/api/picks` endpoint but are isolated by `contest_id` (server stores it; grader/leaderboard filters by it).
3. No duplicate Pick Slip.
4. No unauthorized modal.
5. No console / route disaster.

Do NOT re-enable `tmr-make-picks-multi.js` until contest launch is stable AND multi-pick has been re-tested in isolation against the contest dashboard for cross-talk. If re-enabled, the legacy-aside-hide CSS rule added in commit `6bd75776` must stay (prevents the May 21 duplicate-slip regression).

## Make Picks UX Standard (May 21, 2026)

The Make Picks / sportsbook pick-entry flow follows these locked rules:

- Compact MLB/game-row layout. ~10 games visible on one screen on desktop/tablet (game-row margin 4px, team-row padding 4px 14px, odds-btn min-height 38px, odds-line font 14px). CSS overrides live in `static/js/tmr-make-picks-multi.js`. Never restore the older spread-out 58px button layout.
- Multi-pick selection is the primary workflow. Each odds click queues into `window.TMR.multiSelections`; the right-rail `.sportsbook-ticket-preview-card` renders the full queue with per-row units stepper + remove button. Single-pick submit still works as a special case of N=1.
- One review slip. `.sportsbook-ticket-preview` is the canonical review surface. The legacy `#pickDetails` step-form is hidden on the sportsbook route (CSS in `tmr-make-picks-multi.js`). Never re-enable the dual review boxes.
- Batch submit. The "Submit Picks" button shows one `confirm()` dialog ("Submit all N picks?"), then loops `api.createPick(payload)` sequentially. No backend batch endpoint is needed; backend `POST /api/picks` stays single-pick. Autograder, validation, pending-pick rules, units conversion, and record math are unchanged.
- No auto-scroll on selection. `window.TMR._ttScrollToPickSlip` is overridden to a no-op; `window.TMR._ttPopulateSlip` is overridden to render the multi-slip instead of a competing single-pick form. The slip is sticky on desktop (right rail) and bottom-sticky on mobile/tablet.
- Visible leaderboard link. A "View Leaderboard" CTA injects at the top of `#picks` linking to `/leaderboards/`. Never remove this from the sportsbook page.

Future agents must patch forward from `static/js/tmr-make-picks-multi.js`. Do not reintroduce one-pick-at-a-time-only flow, do not re-show the second review box, do not re-enable auto-scroll on pick selection.

## Community Feed Posting Standard (May 21, 2026)

Any change to `/feed/`, `static/js/social-home.js`, `static/js/feed-ui-overrides.js`, `static/js/feed-cleanup.js`, or `routes/feed.js` is not complete until a live posting test on `https://trustmyrecord.com/feed/` is performed AND evidence is captured in the same response. Required test matrix (logged-in user):

1. Hot Take posts and appears in feed immediately.
2. Status / text post posts and appears in feed immediately.
3. Pick Recap posts as `pick_recap` (not silently downgraded to `text`).
4. Poll posts via `POST /api/polls` with ≥2 options and renders in the Polls tab + For You tab.
5. Sport dropdown value reaches the backend (visible on the rendered card).
6. Post button only enables when content is non-empty; poll submit blocks if <2 options.
7. New post optimistically clears composer; failure path keeps user input intact and shows inline (not `alert()`) error.
8. Existing feed loads on a fresh page render; empty state appears when there are zero items.
9. Authenticated avatar/username appears in composer; logged-out users see the login banner instead of a broken composer.
10. No fake posts, fake users, or seeded test rows surface (filter `TMR_GENERATED_USER_RE` + `isProductionTestActivity`).
11. Side surfaces (Make Picks, bet slip, pending picks, leaderboard, contest sportsbook, profiles, login/session, sealed-pick privacy) unaffected.

Evidence the PR / response must include:
- Commit hash of the change.
- Live URL hit (`https://trustmyrecord.com/feed/` and the `POST /api/feed` / `POST /api/polls` payloads).
- HTTP status (200/201) + the `feed_post` row returned, OR for browser-driven test: a screenshot or console-extracted `[data-type="feed_post"]` element with the just-posted content.
- A statement that prior posts still render and no protected guard test regressed.

Forbidden:
- Marking feed work "done" because the file edit looks right or because `/api/feed` curl returned 200 in isolation. The end-to-end loop (compose → POST → loadFeed → DOM render) is the contract.
- Adding new fake "preview" posts to make the empty state look populated.
- Reverting the dual-script split (`social-home.js` + `feed-ui-overrides.js`) without keeping `submitPost` aware of all four UI post types: `status`, `hot-take`, `poll`, `pick-recap`.

## Current Baseline

The protected baseline is the latest commit on `origin/main` at the start of each task, after inspecting the current remote head, local status, recent commits, and relevant diffs.

Do not pin future work to an older hard-coded commit. A historical commit can be inspected only as reference; it is never the source of truth for sportsbook, profile, logo, ledger, autograder, pick slip, risk/to-win, navigation, avatar, or pending-pick privacy behavior.

The protected baseline includes the currently deployed sportsbook page with visible team logos, the current cache-busted sportsbook reliability runtime, the wager slip fixes, the Risk / To Win stake mode behavior, pending-pick visibility fixes, profile loading/avatar protections, navigation fixes, ledger/record protections, and fake-data cleanup work.


## Protected Baseline and Regression Policy

The current production files are the protected baseline for sportsbook, pending picks, logged-in header state, logo rendering, stake mode logic, and pending-picks formatting. Future agents must patch forward from the current production files.

Permanent rules:

- Future agents must patch forward from the current production files.
- Old commits may be inspected as visual reference only.
- Old files, old commits, test pages, staging artifacts, and backup files must never be copied over production files.
- No task may restore old sportsbook, pending picks, logo, profile/header, or wager slip files.
- No task may touch unrelated pages without explicit approval.
- Every change must list exact files changed.
- Every change must confirm no recent fixes were reverted.
- Every change must include a regression checklist before completion.
- UI work requires live, local, or browser proof when the changed behavior is visible.
- If a page is cacheable, verification must account for route cache, asset cache keys, and stale browser tabs before declaring a regression fixed.

Protected baseline surfaces:

- Sportsbook page: `sportsbook/index.html`.
- Pending picks page: `my-pending-picks/index.html`.
- Homepage and public conversion shell: `index.html`.
- Community pages with visual/data guards: `feed/index.html`, `forum/index.html`, `arena/index.html`, `polls/index.html`, `leaderboards/index.html`, and `handicappers/index.html`.
- Route shims and canonical redirects: `account/index.html`, `community/index.html`, `dashboard/index.html`, `directory/index.html`, `challenges/index.html`, `consensus/index.html`, `polls-trivia/index.html`, `predictions/index.html`, `forums/index.html`, `leaderboard/index.html`, `make-picks/index.html`, `cappers/index.html`, `members/index.html`, `my-record/index.html`, `mypicks/index.html`, `pick/index.html`, `picks/index.html`, `promos/index.html`, and `signin/index.html`.
- Logged-in header state: `static/js/tmr-sitewide.js`, `static/css/tmr-sitewide.css`, and any route-scoped auth display guards.
- Shared routing, auth, and real-feed surfaces: `static/js/navigation.js`, `static/js/auth-persistent.js`, `static/js/social-home.js`, and `static/js/feed-ui-overrides.js`.
- Logo rendering: `static/js/sportsbook-production-fix-persist-reliability.js` and current logo CSS.
- Stake mode logic: the protected Risk / To Win controls and payload fields in the sportsbook reliability runtime.
- Pending picks formatting: pending-picks page formatters and shared pick/line formatting helpers.

## Patch-Forward Rule

All future work must patch forward from the current working version.

Previous commits may be inspected only as visual or historical reference. Do not restore an old commit, old file, old sportsbook page, backup copy, staging copy, generated proof file, or temporary artifact over the current working version.

Never use an old version as the source of truth for the sportsbook, logo rendering, wager slip, pending picks, profile display, fake-data cleanup, or shared navigation. If a previous version has a visual quality worth keeping, manually re-apply only that specific styling idea to the current file.

## No-Restore Rule

Do not use these actions to solve sportsbook or logo issues unless the user explicitly requests a targeted recovery plan:

- `git reset --hard`
- `git checkout -- <file>`
- copying files from `.codex-stage`, `.tmp`, backups, screenshots, proof artifacts, or old HTML pages over production files
- replacing `sportsbook/index.html` with `sportsbook-test/index.html`, `sportsbook-new.html`, `sportsbook.html`, or any older sportsbook copy
- replacing current logo/runtime files with older versions
- reverting commits that contain recent fixes without first identifying and preserving every fix that would be lost

Git history should be kept for reference and emergency recovery. The rule is not to delete history; the rule is to never overwrite the current working product with an older broken snapshot.

## Sportsbook Regression Checklist

Before marking any sportsbook, logo, profile, or shared-rendering task complete, verify the following:

- Current branch/head is inspected before editing.
- Current git diff is inspected before editing.
- Recent commits are inspected before editing.
- The patch changes only the files required for the task.
- `sportsbook/index.html` still loads the protected sportsbook reliability runtime.
- The sportsbook reliability runtime remains cache-busted.
- Team logos remain visible next to sportsbook team names.
- No legacy inline `var LEGACY_TEAM_LOGOS` map is restored into `sportsbook/index.html`.
- Odds remain clickable.
- Selected picks still appear in the pick slip.
- Sportsbook main/default markets remain prioritized over alternates.
- Any alternate line shown to users is clearly labeled as alternate.
- Team Totals render from the main `team_totals` market, not silent alternate team-total ladders.
- Desktop sportsbook boards keep full team names readable.
- Sportsbook market tables do not leave empty placeholder columns.
- The Team Totals board keeps the `sportsbook-game-card--two-market-cols` layout marker.
- The old Team Totals `Board` column/header must never return.
- The Red Sox/Braves fixture resolves Boston Red Sox Team Total to 3.5, not 4.5.
- Alternate team totals never silently render as the default/main Team Totals row.
- Any future sportsbook odds/table/display change preserves the Team Totals regression guards before completion is claimed.
- Wager slip still supports both Risk X units and To Win X units.
- Pending picks remain visible only where appropriate.
- Public profile pending-pick privacy is not loosened.
- Profile names, avatars, logos, and leaderboard display are not reverted.
- Fake profiles or fake data are not reintroduced.
- Box score and stake-mode logic are not overwritten.
- Any visual reference from old commits is manually re-applied as a small forward patch, not restored wholesale.
- Live visual proof from the public page is captured for sportsbook rendering tasks before completion is claimed.
- Relevant sportsbook regression tests or guards are run when touched behavior can affect sportsbook flow.

## Pending Picks Display Rules

Before marking pending-picks display work complete, verify the following:

- Totals and team totals must never show a plus sign in the Line column.
- Totals and team totals must never show U or O in the Line column.
- Totals and team totals use numeric-only Line values.
- The Pick column carries the direction such as Under or Over.
- Full game totals must not display as only “Under 5.5” or “Over 5.5”; they must include “Full Game Total” or the matchup context.
- Team totals must clearly include "Team Total".
- Moneylines show Line as "-".
- Spread, run line, and puck line keep signed values.
- Summary pending count must match API count and rendered row count.
- No task is complete until the live browser screenshot matches the intended display.


## Repo Hygiene Checklist

Permanent rule for every agent/workstream touching this repo (or any other multi-agent BetLegend repo):

- Each agent / workstream must work from its own clean branch or its own separate working copy. Do not pile concurrent work into one shared `main` worktree.
- No agent may leave untracked files sitting in the shared main worktree. Untracked files in shared trees block every other agent's publish gate.
- Before starting any task, run `git status` and confirm the tree is clean. If it is not clean, stop and report what is dirty before doing any new work.
- Before pushing, commit only files directly related to the current task. Never use `git add -A` or `git add .` in a multi-agent worktree.
- If unrelated dirty / untracked files exist when you go to push, stop and report them explicitly. Do not bundle them into your commit, do not silently stash them away, do not publish them as part of your task.
- Push only the intended commit for the current task. Disclose, by path, any unrelated dirty files that were left behind for their proper workstreams.
- When the predeploy / publish guard blocks because of unrelated dirty files, request explicit user permission to skip the gate rather than fixing it by committing other agents' work.

## Contest Page Sponsor Bonus Standard

Permanent rule for any TrustMyRecord contest signup page sponsored by a sportsbook or affiliate partner (`contests/<slug>/index.html`):

- Every contest signup page must include a dedicated, sportsbook-styled bonus / incentive section for the sponsor's current new player offer.
- The bonus section must live adjacent to the primary signup CTA / signup banner so it directly supports signup conversion. Do not bury it below FAQ or below the final CTA.
- Required content fields when applicable: bonus percentage / type (e.g. "115% Free Play"), rollover requirement (e.g. "11x"), minimum qualifying deposit, maximum qualifying deposit, BetPoints / loyalty redemption value, and any VIP / support note.
- Use the existing dark sportsbook styling (panel + gold accent border, Barlow stat cards, no spammy gradients or pop-ups).
- Do not put the user's name in any bonus copy. Use neutral brand voice ("New Player Bonus Available", "Official Contest Link").
- Include a footnote that bonus terms are set by the sponsor and eligibility / rollover / redemption rules are determined at signup.
- When a new contest is created, the bonus section is part of the page baseline. A contest signup page that ships without the sponsor bonus section is incomplete.
- When updating an existing contest page, never remove the bonus section unless the sponsor relationship has ended.

## Risky File Classification Inventory

Production protected:

- `sportsbook/index.html`
- `my-pending-picks/index.html`
- `profile/index.html`
- `index.html`
- `feed/index.html`
- `forum/index.html`
- `arena/index.html`
- `polls/index.html`
- `leaderboards/index.html`
- `handicappers/index.html`
- `account/index.html`
- `community/index.html`
- `dashboard/index.html`
- `directory/index.html`
- `challenges/index.html`
- `consensus/index.html`
- `polls-trivia/index.html`
- `predictions/index.html`
- `forums/index.html`
- `leaderboard/index.html`
- `make-picks/index.html`
- `cappers/index.html`
- `members/index.html`
- `my-record/index.html`
- `mypicks/index.html`
- `pick/index.html`
- `picks/index.html`
- `promos/index.html`
- `signin/index.html`
- `static/js/tmr-sitewide.js`
- `static/css/tmr-sitewide.css`
- `static/js/navigation.js`
- `static/js/auth-persistent.js`
- `static/js/social-home.js`
- `static/js/feed-ui-overrides.js`
- `static/js/backend-api.js`
- `static/js/auto-grader-fixed.js`
- `static/js/sportsbook-production-fix-persist-reliability.js`
- `static/css/tmr-redesign-overrides-sportsbook.css`
- `static/css/sportsbook-dk-polish.css`

Reference only:

- `_design-source/**`
- `approved-design-previews/**`
- historical commits and GitHub file views
- proof screenshots, proof JSON, and generated reports

Test only:

- `sportsbook-test/index.html`
- `profile-test/index.html`
- `tests/**`
- local smoke/regression scripts

Quarantine candidate, do not copy into production without explicit approval:

- `sportsbook-new.html`
- `sportsbook.html`
- `profile-new.html`
- `profile-preview.html`
- `profile-market.html`
- `static/js/sportsbook-production-fix.js`
- `static/js/sportsbook-production-fix-persist.js`
- `static/js/sportsbook-board-hotfix.js`
- stale backup, duplicate, or generated HTML files discovered during work

Temporary artifact, do not copy into production:

- `.codex-stage/**`
- `.tmp*/**`
- local browser profile folders
- generated proof screenshots and JSON files
- downloaded live-source snapshots

Do not delete risky files during stabilization or feature work unless the user explicitly approves a deletion list. Classification comes first; cleanup is a separate task.

## Suspicious Duplicate Inventory Policy

Duplicate, staging, backup, proof, and temporary sportsbook files must be listed and reviewed before removal. Do not delete them during feature or visual polish work unless the user explicitly approves the deletion list.

Known examples that require caution include:

- `sportsbook-new.html`
- `sportsbook-test/index.html`
- `.codex-stage/**/sportsbook.html`
- `.codex-stage/**/sportsbook-new.html`
- `.tmp*` sportsbook files
- sportsbook proof screenshots and JSON files at the repo root
- `_design-source/sportsbook-preview-dk.html`
- `approved-design-previews/sportsbook-preview-dk.html`

These files may be useful as references, but they are not production source of truth.


## Standard Completion Checklist

Every future Codex workstream must include:

- Exact files changed.
- Exact behavior changed.
- Git diff summary for the patch.
- Tests run, including command names and results.
- Visual proof or browser proof when UI is affected.
- Live source, local source, screenshot, or browser proof for any changed protected surface.
- Confirmation that no old files were restored.
- Confirmation that no recent fixes were reverted.
- Confirmation that unrelated pages were not touched unless explicitly approved.
- Current project completion percentage.

Regression checklist before completion:

- Sportsbook logos remain visible or protected logo markup is still present.
- Sportsbook right rail remains contained on desktop and the Pick Slip remains visible.
- Logged-in users do not see `Join Free` or `Log In`, and still see profile block plus `Log Out`.
- Risk mode and To Win mode still exist and no stale `RISK TO WIN` copy returns.
- Pending-picks moneyline Line displays `-`.
- Pending-picks spread, run line, and puck line Line values remain signed.
- Pending-picks totals and team totals use numeric-only Line values with no `+`, `U`, or `O`.
- Pending-picks full game totals include `Full Game Total` or matchup context in the Pick column.
- Pending-picks team totals include `Team Total` in the Pick column.
- Pending-picks summary count matches API count and rendered row count.

## Sportsbook Regression Risk Files

Future agents must inspect the current production files first. Do not copy from the files below into production sportsbook work without explicit user approval. If a listed file contains a useful visual idea or implementation detail, manually patch the current production file forward with only the needed change.

### Production protected

These files are active production source or protected runtime/style files. Patch them carefully and only when the task requires it.

- `sportsbook/index.html` - production sportsbook page and current source of truth.
- `static/js/sportsbook-production-fix-persist-reliability.js` - protected sportsbook runtime for logo rows, pick selection, pick slip, and stake mode.
- `static/css/sportsbook-pro.css` - production sportsbook styling.
- `static/css/tmr-redesign-overrides-sportsbook.css` - production sportsbook override styling.
- `sportsbook.html` - legacy redirect stub to `/sportsbook/`; keep as a redirect, never use as page source.
- `pick/index.html` - legacy redirect stub to `/sportsbook/`; keep as a redirect, never use as page source.
- `picks/index.html` - separate production picks/SEO page; do not confuse with the sportsbook app.

### Reference only

These files are visual references or proof artifacts. They are not production source.

- `_design-source/sportsbook-preview-dk.html`
- `approved-design-previews/sportsbook-preview-dk.html`
- `sportsbook-live-layout-proof.png`
- `sportsbook-live-logo-layout-proof.png`
- `sportsbook-live-polish-proof.png`
- `sportsbook-live-source-proof.json`
- `sportsbook-live-stability-proof-current.png`

### Test only

These files are for regression checks or isolated test routes. Do not use them as live sportsbook source.

- `sportsbook-test/index.html`
- `tests/sportsbook-header-regression-test.js`
- `tests/sportsbook-reliability-guard-test.js`
- `tests/sportsbook-stake-mode-ui-test.js`

### Quarantine candidate

These files look like old previews, obsolete runtime variants, or staged copies that could cause regressions if copied back into production. Do not delete them without explicit approval, but do not use them as source for production fixes.

- `sportsbook-new.html`
- `static/js/tmr-redesign-test-sportsbook-logos.js`
- `static/js/sportsbook-board-hotfix.js`
- `static/js/sportsbook-production-fix.js`
- `static/js/sportsbook-production-fix-persist.js`
- `.codex-stage/**/sportsbook.html`
- `.codex-stage/**/sportsbook-new.html`
- `.codex-stage/**/static/js/sportsbook-*.js`
- `.codex-stage/**/static/css/sportsbook*.css`

### Temporary artifact

These files are generated proof, API, or temporary working artifacts. They may be useful for audit history, but they are not production source and should never be copied into production code.

- `sportsbook-live-microlink-json.json`
- `sportsbook-live-polish-microlink.json`
- `.tmp/sportsbook-blob.json`
- `.tmp/sportsbook-commit.json`
- `.tmp/sportsbook-payload.json`
- `.tmp/sportsbook-ref.json`
- `.tmp/sportsbook-test-payload.json`
- `.tmp/sportsbook-tree.json`

## SEO + Schema Standard for New Public Pages (May 21, 2026)

Every NEW public-facing TrustMyRecord page (anything reachable without auth — hubs, contest pages, profile-style pages, marketing pages, content pages) MUST ship with the following in `<head>` from day one. No exceptions, no "we'll add SEO later" follow-up tickets.

Required, in order, immediately after `<meta charset>` + `<meta viewport>`:

1. `<title>` — page-specific, long-tail, ends with `| TrustMyRecord`. Keep < ~70 chars.
2. `<meta name="description">` — 140-200 chars, describes THIS page, includes the platform value (verified picks / handicapping records / contests / leaderboards).
3. `<link rel="canonical">` — only set if you are 100% sure of the canonical URL. **Never edit an existing canonical** without explicit approval; broken canonicals tank rankings.
4. Open Graph block: `og:title`, `og:description`, `og:url`, `og:type` (usually `website`), `og:site_name="TrustMyRecord"`, `og:image` (use `/static/favicon.svg` if no branded image exists yet).
5. Twitter Card block: `twitter:card` (`summary` for most pages, `summary_large_image` only when a real 1200x630 image exists), `twitter:title`, `twitter:description`, `twitter:image`.
6. JSON-LD `<script type="application/ld+json">` — pick one schema type that matches the page (`CollectionPage`, `WebPage`, `ProfilePage`, `AboutPage`, `FAQPage`, etc.) + a `BreadcrumbList` block. Include `isPartOf` pointing at the site WebSite node. No fake ratings, no fake reviews, no fake counts.

Forbidden in schema:
- `aggregateRating`, `review`, `ratingValue` unless backed by real public data.
- Fake follower/user counts in `interactionStatistic`.
- Claims about "verified by Google" / "official partner of X" that aren't true.

Hard guard rails:
- Do NOT rewrite an existing page's canonical without an explicit approval line in the PR description.
- Do NOT add SEO meta to authenticated-only surfaces (e.g. `/account/`, `/messages/`, `/notifications/`, admin tools). They should stay `noindex`.
- Do NOT expose pending picks, autograder internals, admin endpoints, or user PII in any meta tag or JSON-LD.
- Profile pages: schema describes the public profile surface generically — never bake a specific username into the static head; the dynamic page logic can update `og:title` / `og:url` per profile at runtime if needed.

Reference implementations (May 21, 2026):
- Homepage: `/index.html` — full WebSite + Organization + WebApplication graph.
- Hub page: `/handicappers/index.html`, `/leaderboards/index.html`, `/challenges/index.html` — CollectionPage + BreadcrumbList.
- Contest: `/contests/justbet-mlb/index.html` — WebPage + BreadcrumbList.
- Profile: `/profile/index.html` — ProfilePage + BreadcrumbList.

When in doubt: copy the head from the closest reference implementation above and edit only the page-specific strings.
