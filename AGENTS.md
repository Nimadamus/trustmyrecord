# TrustMyRecord Agent Rules

TrustMyRecord is regression-sensitive. The sportsbook is a critical protected surface.

- Never revert to old commits unless the user explicitly instructs it.
- Never restore old files over current files.
- Never overwrite recent fixes.
- Always inspect `git status`, current diffs, and recent commits before changing files.
- Make the smallest targeted patch to the current version.
- Never force push unless explicitly approved.
- Always run `npm run verify:regression` before claiming completion.
- Always visually verify live public pages after deployment.
- Never claim completion from localhost only.
- Never update visual baselines unless explicitly instructed.
- Protect sportsbook layout and functionality as critical.

Regression baselines live in `tests/visual-baselines/`. `npm run verify:regression` must compare against those baselines and must not update them. To intentionally approve new baselines, run `npm run baseline:regression` only after explicit approval and review the screenshot diff before committing.

## Handicappers / Leaderboard (`/handicappers/`)

These rules must be preserved by all future edits to `handicappers/index.html`:

- **Header sorting is required.** Every column header (`Username`, `Record`, `Units`, `ROI`, `Win %`, `Picks`, `Streak`, `Active`) must be a clickable sort control with a visible `↑`/`↓` indicator on the active column. Clicking the same header toggles the direction.
- **Default sort directions** (first click of an idle column): `Units` desc (highest units first), `ROI` desc, `Win %` desc, `Picks` desc, `Record` desc by wins (tiebreak: fewer losses), `Streak` desc by signed value so winning streaks rank above losing streaks, `Active` desc (most recent first), `Username` asc.
- **Minimum-picks qualification.** Leaderboard table eligibility requires at least `LEADERBOARD_MIN_PICKS` verified (graded: W+L+Push) picks. Default is `5` and must remain configurable via `?minPicks=N`, `window.LEADERBOARD_MIN_PICKS`, or `localStorage['tmr_min_picks']`. Do not hard-code or remove the configurability. Users below the threshold are not deleted or hidden anywhere else on the platform — only excluded from the leaderboard table and the "qualified members" count.
- **Qualified-members count** in the leaderboard header and page summary must reflect only members meeting the current `LEADERBOARD_MIN_PICKS` threshold.
- **Do not break profile links.** Row click and the username/avatar links must continue to navigate to `/profile/?user=<username>`.
- **Preserve the current visual design** of the page. Do not restructure the hero, featured leader cards, table layout, or filter controls.
