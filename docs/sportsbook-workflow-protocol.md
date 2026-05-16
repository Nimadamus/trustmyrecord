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

The sportsbook board, ticket preview, submitted payload, pending pick display, profile/history display, and grading/admin display must all preserve the F5 designation. A submitted F5 pick must keep the `f5_*` `market_type` through the API payload and database record so grading uses first-five-inning scoring rather than full-game scoring.

Board rendering rule: when a card or board filter selects the First 5 category (`first-5`), the market card scope must switch to `data-scope="f5"` and the active filter must remain `data-market-filter="first-5"`. This keeps F5 groups visible after selection and prevents the board from falling back to an empty full-game scope.

Any future F5 sportsbook change must verify the complete workflow:

- ticket population clearly displays F5/First 5
- authenticated submit uses the production pick-lock path
- database persistence keeps `market_type` as the correct `f5_*` value
- post-refresh pending/history visibility still shows the pick
- display labels keep F5 visible for ML, totals, and run line
- grader/admin handling separates `f5_h2h`, `f5_spreads`, and `f5_totals` from full-game `h2h`, `spreads`, and `totals`
