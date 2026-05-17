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
