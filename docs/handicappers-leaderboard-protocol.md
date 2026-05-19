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

Required visible ranking columns/stat labels:

- Rank
- Handicapper
- Record
- Win %
- ROI
- Total Picks
- Net Units
- Recent Activity, when useful

The handicappers page must always keep visible stat category labels. Future visual improvements must not remove column headers, stat labels, the full real list data, avatars, usernames, profile links, search/filter/sort behavior, or leaderboard functionality.

The Handicapper column must show one compact user block: small avatar, full display name, and muted handle. Avatars must stay compact, roughly 36px to 44px, and each row must show one user only once. The Rank column may be a compact numeric label; do not let rank or avatars dominate the row.

Every row must use that member's own avatar/profile image when available. Use the neutral TrustMyRecord fallback only for that specific user when they do not have an avatar; never let a stale/global avatar value repeat across unrelated members.

Use `--` when a field is unavailable. Do not invent users, sports, records, stats, or activity.

## Data Safety

Pending picks must not affect record, win percentage, net units, ROI, verified pick counts, or promoted leaderboard qualification. Pending picks can exist in source data, but the public ranking metrics must be based on graded outcomes only.

No placeholder members or fake stats are allowed on the live leaderboard.

## Wiring

Any page-scoped leaderboard polish must preserve the public member list and the compact User-column layout above. If a separate polish script is enabled again, it must be page-scoped, cache-busted, and marked so sitewide bundles do not inject duplicate or stale copies. During emergency restore work, disabling a broken polish script is acceptable when the inline page renderer already preserves the full real list.
