# Handicappers Leaderboard Protocol

The `/handicappers/` page must not look empty when official leaderboard badges have no qualifying member yet.

## Official Leaderboard Eligibility

Keep the strict promoted leaderboard requirements visible:

- At least 20 graded picks.
- Recent graded activity.
- Positive net units where the leaderboard card depends on positive units or ROI.

When no member qualifies, show a deliberate locked state such as `Awaiting Qualified Leader`, not dead-end copy that implies the page is broken.

## Current Member Rankings

The page must also show current production members underneath the official qualification cards. These rankings can include members who do not yet qualify for official promoted badges, but they must use real available data only.

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
