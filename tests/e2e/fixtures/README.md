# BetLegend Pro e2e fixtures

`matchup-historical.json` is a **real** response from
`POST /api/betlegend-pro/matchup-historical`, captured from production and
trimmed to four games in each team's list. It is not hand-written on purpose:
the payload carries thirty top-level keys and the renderer reads a dozen of
them, so an invented fixture drifts from the shape the app is actually handed
and the tests then pass against a page that would break in production. That has
already happened once — the previous spec in this directory stubbed a `status`
shape the route had never returned.

It is deliberately a **pre-repair** capture: the run lines it carries are the
ones that used to make the Favorite column render `New York Yankees +1.5` on a
game the Yankees were `-148` to win. The favourite assertion in the spec
therefore proves the fix rather than proving the fixture.

## Refreshing it

Any BetLegend Pro account works; a subscriber avoids spending a free report.

```bash
node -e "
const fs = require('fs');
(async () => {
  const login = await fetch('https://trustmyrecord-api.onrender.com/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login: process.env.TMR_USER, password: process.env.TMR_PASS }),
  }).then(r => r.json());

  const res = await fetch('https://trustmyrecord-api.onrender.com/api/betlegend-pro/matchup-historical', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + login.accessToken },
    body: JSON.stringify({
      sport: 'MLB', team_1: 'New York Yankees', team_2: 'Boston Red Sox',
      team_venue: 'away', sample_size: null,
      idempotency_key: 'fixture-refresh-' + Date.now(),
    }),
  }).then(r => r.json());

  const d = res.result;
  for (const key of ['team_1_report', 'team_2_report', 'head_to_head']) {
    if (d[key] && Array.isArray(d[key].games)) d[key].games = d[key].games.slice(0, 4);
  }
  fs.writeFileSync('tests/e2e/fixtures/matchup-historical.json', JSON.stringify(d, null, 1));
})();
"
```

Trimming the game lists while leaving `total_qualifying_games` alone is
intentional: that is exactly the state the app is in when a result limit is
applied, and the table's "most recent N of M" heading is only exercised by it.
