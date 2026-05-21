# TrustMyRecord Development Rules

## Make Picks UX Standard (May 21, 2026)

The Make Picks / sportsbook pick-entry flow follows these locked rules:

- Compact MLB/game-row layout. ~10 games visible on one screen on desktop/tablet (game-row margin 4px, team-row padding 4px 14px, odds-btn min-height 38px, odds-line font 14px). CSS overrides live in `static/js/tmr-make-picks-multi.js`. Never restore the older spread-out 58px button layout.
- Multi-pick selection is the primary workflow. Each odds click queues into `window.TMR.multiSelections`; the right-rail `.sportsbook-ticket-preview-card` renders the full queue with per-row units stepper + remove button. Single-pick submit still works as a special case of N=1.
- One review slip. `.sportsbook-ticket-preview` is the canonical review surface. The legacy `#pickDetails` step-form is hidden on the sportsbook route (CSS in `tmr-make-picks-multi.js`). Never re-enable the dual review boxes.
- Batch submit. The "Submit Picks" button shows one `confirm()` dialog ("Submit all N picks?"), then loops `api.createPick(payload)` sequentially. No backend batch endpoint is needed; backend `POST /api/picks` stays single-pick. Autograder, validation, pending-pick rules, units conversion, and record math are unchanged.
- No auto-scroll on selection. `window.TMR._ttScrollToPickSlip` is overridden to a no-op; `window.TMR._ttPopulateSlip` is overridden to render the multi-slip instead of a competing single-pick form. The slip is sticky on desktop (right rail) and bottom-sticky on mobile/tablet.
- Visible leaderboard link. A "View Leaderboard" CTA injects at the top of `#picks` linking to `/leaderboards/`. Never remove this from the sportsbook page.

Future agents must patch forward from `static/js/tmr-make-picks-multi.js`. Do not reintroduce one-pick-at-a-time-only flow, do not re-show the second review box, do not re-enable auto-scroll on pick selection.

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
