# Sportsbook Workflow Protocol

## First 5 Innings Markets

First 5 innings markets are period-specific MLB markets and must never be collapsed into full-game markets.

Required F5 market types:

- `f5_h2h` for F5 moneyline
- `f5_spreads` for F5 run line
- `f5_totals` for F5 total
- `f5_team_totals` for F5 team total, when available

Required selection labels:

- F5 moneyline: `<Team> F5 ML`
- F5 run line: `<Team> F5 <signed line>`
- F5 total: `F5 Over <total>` or `F5 Under <total>`

F5 totals board labels must render the side label from the F5 total side, never from the numeric line. The visible button tag for `f5_totals` must be `Over` or `Under`; the total number stays in the line display without a leading plus sign and odds stay unchanged.

The sportsbook board, ticket preview, submitted payload, pending pick display, profile/history display, and grading/admin display must all preserve the F5 designation. A submitted F5 pick must keep the `f5_*` `market_type` through the API payload and database record so grading uses first-five-inning scoring rather than full-game scoring.

Board rendering rule: when a card or board filter selects the First 5 category (`first-5`), the market card scope must switch to `data-scope="f5"` and the active filter must remain `data-market-filter="first-5"`. This keeps F5 groups visible after selection and prevents the board from falling back to an empty full-game scope.

Sportsbook matchup team rows must render exactly one team logo, one home/away badge, and one full team name. Logo restore helpers must not inject a second logo into `.tmr-team-row`, and desktop sportsbook cards must not ellipsize the team name.

The verified F5 sportsbook board layout is locked by `tests/sportsbook-f5-board-layout-lock-test.js`. Do not change F5 totals labels, `.tmr-team-row`, `.tmr-team-name`, market-card header stacking, or market-card option-grid layout without updating that test after live public verification and explicit approval. This guard exists to prevent reverting to duplicate logos, wrapped/truncated team names, overlapping price grids, or `+3.5` total side labels.

Any future F5 sportsbook change must verify the complete workflow:

- ticket population clearly displays F5/First 5
- authenticated submit uses the production pick-lock path
- database persistence keeps `market_type` as the correct `f5_*` value
- post-refresh pending/history visibility still shows the pick
- display labels keep F5 visible for ML, totals, and run line
- grader/admin handling separates `f5_h2h`, `f5_spreads`, and `f5_totals` from full-game `h2h`, `spreads`, and `totals`
- F5 team totals, when offered, must follow the same persisted selection contract as full-game team totals: `<Team> Over <line>` or `<Team> Under <line>`, with `market_type='f5_team_totals'`, exact line/odds snapshots, and owner-only pending visibility
- Live verification accounts must use public-directory-safe test identifiers (`tmrverify_*` username, internal/test email, and internal/test display name). Controlled proof picks may be submitted, but those accounts must not become public leaderboard/profile data.

## Market Label Normalization Before Stats

Market labels must be normalized before any stat aggregation, cache rebuild, profile split, leaderboard split, or displayed performance table is calculated. Singular/plural or wording variants must never create duplicate stat rows.

Required canonical examples:

- `Team Total`, `Team Totals`, and `team_total` aggregate as `team_totals` and display as `Team Totals`
- `First 5 Innings Total`, `First Five Totals`, `First 5 Total`, and `First Five Total` aggregate as `f5_totals`

This normalization must happen before records, pick counts, W-L-P, units, ROI, and win percentage are computed. Do not solve duplicate market rows by only renaming labels in the UI.

## Public Ranking Eligibility

Public rank metadata must use the same eligibility rule on profile pages, main leaderboards, and market leaderboards.

Required public ranking conditions:

- at least 20 graded picks
- positive net units
- active, public, non-test account
- no pending picks counted toward rank, records, ROI, win percentage, or units

If a user has 20 or more graded picks but non-positive net units, profile rank fields must stay unranked and `ranking_status` must read `Not ranked yet`. Do not decorate negative, break-even, inactive, private, or test accounts with `Ranked #...` metadata.

## Profile Analytics / PickMonitor Parity

Public profile analytics must preserve the PickMonitor-style advanced stat catalog unless a metric is explicitly documented as unavailable from the current ledger. The canonical backend source is `services/profileAnalytics.js`; the public profile renderer is `profile/index.html`.

The primary Z-score is odds-adjusted. It must use graded win/loss picks only, exclude pending picks and pushes, convert each pick's American odds to break-even probability, then calculate:

- `expectedWins = sum(p_i)`
- `actualWins = sum(win_i)`
- `variance = sum(p_i * (1 - p_i))`
- `zScore = (actualWins - expectedWins) / sqrt(variance)`

If variance is zero or fewer than five graded non-push picks have usable odds, the profile must display `N/A`/blank instead of a fake number. Do not replace this with a flat 50% or average-odds baseline unless it is added as a separate clearly labeled secondary metric.

Profile redesigns must not hide or remove Z-score, effective units, effective win percentage, average odds, average risk, streaks, rolling form, sport splits, market splits, odds bucket splits, unit bucket splits, day-of-week splits, equity curve, or drawdown without updating the backend unit tests and the PickMonitor parity report. CLV-related metrics remain unavailable until the ledger includes closing odds/line data.

## Public Page Empty States

Launch-facing pages must not ship rough placeholder copy such as `No tracked picks yet` in visible page markup or runtime fallback strings. Empty states may explain that verified records or locked picks are loading or pending, but they must preserve the premium public-record tone and must not imply the platform has no real activity when live data is available.

## Launch-Readiness Regression Standard

Sportsbook work is not complete until the current version is verified end to end on the live public site, not only by localhost, source review, build output, deployment status, or HTTP-only checks.

Required live checks:

- log in with a controlled test account and open `https://trustmyrecord.com/sportsbook/`
- confirm live sportsbook lines load for supported sports and that full-game lines, first-five lines, team totals, spreads/run lines/puck lines, moneylines, and totals are clearly labeled
- confirm team names are readable and no empty decorative columns such as `board` appear without purpose
- click representative lines and confirm exactly one correct ticket opens in the expected ticket area
- submit controlled test picks only from safe test accounts, then refresh and confirm pending picks remain visible to that user
- confirm pending picks are private and are not exposed on public profile, leaderboard, feed, or discovery surfaces before grading
- grade controlled outcomes for win, loss, push, full-game, first-five, and team-total cases, then rebuild/verify stats from the canonical pick ledger
- confirm records, units, ROI, win percentage, advanced stats, public profiles, and public leaderboard/discovery behavior match the graded ledger
- preserve existing graded history order and never delete, duplicate, reorder, or mutate old graded picks as part of a sportsbook fix
- capture browser screenshot proof with the live public URL visible in the browser address bar before marking the work complete

The broad site regression suite must not fail solely on a fixed mobile sportsbook screenshot height when the dedicated sportsbook live workflow has passed. The sportsbook board is dynamic by schedule and odds availability, so mobile layout readiness is proved by the sportsbook live workflow plus functional mobile accessibility checks.

## Tools Hub Launch Standard

No TrustMyRecord tool may launch as a shell, orphan page, or placeholder route. Every new or changed tool must satisfy this checklist before completion is claimed:

- the live route returns the intended page with the canonical URL matching the public path
- the Tools Hub links to the tool, and the tool has a working CTA back into the relevant TrustMyRecord workflow when applicable
- every visible CTA/button/control either performs a useful action or is clearly disabled with a data/functionality reason
- desktop and mobile browser checks show no layout breakage, overlap, or hidden primary controls
- the page contains no placeholder copy, fake records, fake stats, stale data claims, or unsupported betting-performance claims
- any data-backed output is verified against the live API/source, and unavailable data is labeled unavailable instead of invented
- Trend Spotter's Generate Trend panel must never ship a fake-working state: the trend-search dropdown must populate from the selected market, Current Query must reflect the selected trend search, Generate must be disabled until required variables are present, and unavailable backend/source states must use polished intentional copy rather than raw placeholder text such as `source not connected yet`
- MLB Simulator deployments must be live-verified after every simulator data or UI change: current-team selectors, away and home starting-pitcher dropdowns, simulation run, Projection Review output, and Box Score output must all work on `https://trustmyrecord.com/mlb-simulator/`. Current teams must expose starter dropdown options from verified roster data when available and from the checked-in current starter profile dataset when live roster data is unavailable.
- public-record, leaderboard, profile, sportsbook, pick-tracking, grading, forum, and auth routes are not regressed
- final acceptance requires live public browser verification with screenshot proof of the public URL visible, not only localhost, build success, deployment status, or HTTP-only checks

## New Sport / League Onboarding (added June 3, 2026)

A league must never be made pickable on the sportsbook board before its full
settlement path exists. Root cause reference: `soccer_intl_friendly` (Intl
Friendly) was pickable and submitted picks, but the backend score cron had no
ESPN ingestion entry for it, so soccer picks (e.g. Italy ML, June 3, 2026)
stayed pending forever.

Adding a league to the sportsbook frontend (ESPN league map / league tabs)
REQUIRES, in the same change set:

1. Backend `services/gameIngestionService.js`: `SPORT_CONFIG` entry (ESPN
   scoreboard path) + `ACTIVE_SPORTS` membership, so finals ingest and the
   pending-pick backfill reaches the league.
2. Backend grading support for every pickable market of that sport, including
   the per-sport settle delay window.
3. Records surfaces: sport label/bucket mapping on handicappers, leaderboards
   dropdown `<option>`, profile record grids, and my-pending-picks labels.
4. Stats aggregation verified (`user_sport_stats` row appears after first
   graded pick; stats-consistency drift 0).
5. Backend regression coverage: add the league key to
   `tests/soccer-grading-coverage-test.js` (or sport equivalent) in
   trustmyrecord-backend so CI blocks removal of ingestion coverage.
6. Live verification: submit a controlled pick, confirm the auto-grader
   settles it without manual help, and confirm it appears in records pages.

See trustmyrecord-backend `GRADING_BACKFILL_PROTOCOL.md` → "New sport / league
onboarding checklist" for the canonical backend-side runbook.
