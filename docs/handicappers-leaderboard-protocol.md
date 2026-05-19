# Handicappers Leaderboard Protocol

The `/handicappers/` page must not look empty when official leaderboard badges have no qualifying member yet.

## Official Leaderboard Eligibility

Keep the strict promoted leaderboard requirements visible:

- At least 20 graded picks.
- Recent graded activity.
- Positive net units where the leaderboard card depends on positive units or ROI.

When no member qualifies, show a deliberate locked state such as `Awaiting Qualified Leader`, not dead-end copy that implies the page is broken.

## Empty-state Polish for Hero Count Boxes

The hero summary grid (`.hm-counts`) contains three locked-state count boxes (`#hmBestWinRate`, `#hmTopUnits`, `#hmRecentActivity`). When no qualifier exists, the underlying page renderer drops raw fallback text such as `Not enough graded picks yet`, `No positive units leader yet`, or `No pick activity yet` into both the strong value and the small subtitle. That looks broken.

The polish script must:

- Detect the locked condition (`--`, `is-muted`, or any of the known fallback phrases).
- Replace the strong value with a tasteful `Locked` pill (gold/teal palette).
- Restore the proper static label (`Best Win Percentage`, `Units Leader`, `Most Recent Pick Activity`) in the `<span>`.
- Replace the `<small>` subtitle with a short unlock hint, never with a duplicate of the empty-state phrase.
- Reapply on count mutation, sort change, sport filter change, and pagination clicks.

Never let the literal strings `Not enough graded picks yet`, `No positive units leader yet`, or `No pick activity yet` appear in the rendered DOM.

## Current Member Rankings

The page must also show current production members underneath the official qualification cards. These rankings can include members who do not yet qualify for official promoted badges, but they must use real available data only.

Future leaderboard polish must never remove, hide, replace, or block the full real handicapper/member list. Official leaderboard qualification thresholds may lock promoted leaderboard badges, but all real members should remain visible in the general handicapper/member rankings list unless filtered by the user.

Required ranking columns:

- Rank
- Handicapper
- Record
- Win %
- Net Units
- ROI
- Verified Picks
- Last Active
- Sports

Use `--` when a field is unavailable. Do not invent users, sports, records, stats, or activity.

## Data Safety

Pending picks must not affect record, win percentage, net units, ROI, verified pick counts, or promoted leaderboard qualification. Pending picks can exist in source data, but the public ranking metrics must be based on graded outcomes only.

No placeholder members or fake stats are allowed on the live leaderboard.

## Wiring

`/handicappers/index.html` must load the page-scoped polish script directly. The cache-buster query string should be bumped any time `static/js/handicappers-leaderboard-polish.js` changes, so the CDN serves the updated payload:

```html
<script defer src="/static/js/handicappers-leaderboard-polish.js?v=YYYYMMDDx"></script>
```

Do not move the polish back into `static/js/nav-badges.js` or any sitewide bundle: it is page-scoped on purpose.

The static script tag in `handicappers/index.html` must carry `data-hm-leaderboard-polish="1"`. `static/js/nav-badges.js` still ships a defensive IIFE that injects the polish script if no element with that marker exists. Without the marker, the IIFE adds a duplicate `<script>` with its own pinned cache-buster (`?v=20260519`), which causes the CDN to serve a stale build of the polish JS in parallel to the new one. Always keep the marker on the static tag whenever the cache-buster is bumped.
