# TrustMyRecord Source Of Truth And Regression Protocol

This repo deploys the static frontend through GitHub Pages from `Nimadamus/trustmyrecord` branch `main`.
Do not deploy from old local folders, staging copies, screenshots, or partial patch directories.

## Current Source Of Truth

- Profile UI, profile buttons, avatar UI, profile picks table shell: `profile/index.html`
- Shared API client and shared pick/line display formatting: `static/js/backend-api.js`
- Profile legacy patch layer currently loaded by the profile page: `static/js/platform-production-fix.js`
- Handicappers page and Active column UI: `handicappers/index.html`
- Sportsbook page shell: `sportsbook/index.html`
- Sportsbook logos, odds rendering protection, Risk/To Win behavior: `static/js/sportsbook-production-fix-persist-reliability.js`
- MLB simulator page shell: `mlb-simulator/index.html`
- MLB simulator layout and box score containment: `static/css/mlb-simulator.css`
- MLB simulator runtime and box score rendering: `static/js/mlb-simulator.js`

Backend source of truth lives in `Nimadamus/trustmyrecord-backend` branch `master`.

## Files That Are Risky For Routine UI Fixes

Do not edit these for routine page polish unless the exact bug has been traced to them:

- `static/js/backend-api.js`
- `static/js/platform-production-fix.js`
- `static/js/stats-engine.js`
- `static/js/streaks.js`
- `static/css/tmr-sitewide.css`
- `static/css/tmr-redesign-test.css`
- `static/css/tmr-redesign-overrides.css`
- `static/css/tmr-redesign-overrides-profile.css`
- `static/css/tmr-redesign-overrides-sportsbook.css`
- `sportsbook/index.html`
- `profile/index.html`

Large page files may be edited only surgically. Do not replace them wholesale from a local folder or old branch.

## Legacy Or Fallback Files

These files are not the primary source of truth for current protected behavior and must not be reintroduced into page includes without a fresh audit:

- `static/js/sportsbook-production-fix.js`
- `static/js/sportsbook-production-fix-persist.js`
- `static/js/sportsbook-board-hotfix.js`
- `static/js/sportsbook-dashboard-sync.js`
- `static/js/tmr-redesign-test-profile.js`
- `static/js/tmr-redesign-loader.js`
- `static/js/pick-display-format.js`

The obsolete `static/js/tmr-redesign-test-sportsbook-logos.js` file was removed because the current logo source of truth is `static/js/sportsbook-production-fix-persist-reliability.js`.
The invalid duplicate path `static\js\backend-api.js` was removed because it breaks clean Windows checkouts and can cause stale-source confusion.

## Required Guard Before Deploy

From a clean checkout of frontend `main`:

```powershell
node tests/line-formatting-regression-test.js
node tests/profile-page-lookup-test.js
node tests/mlb-simulator-page-test.js
node tests/mlb-simulator-boxscore-test.js
node tests/mlb-simulator-realism-test.js
node tests/sportsbook-reliability-guard-test.js
node tests/sportsbook-stake-mode-ui-test.js
pwsh ./scripts/predeploy-guard.ps1
```

In GitHub Actions, `predeploy-guard.ps1 -SkipRemoteCheck` is acceptable after checkout.

## Live Verification

After GitHub Pages builds, verify these URLs load from the same commit:

- `https://trustmyrecord.com/profile/?user=BetLegend`
- `https://trustmyrecord.com/handicappers/`
- `https://trustmyrecord.com/mlb-simulator/`
- `https://trustmyrecord.com/sportsbook/`

For visual UI work, keep browser screenshots before closing the terminal. Required pages depend on the touched area, but simulator, profile, handicappers, and sportsbook should be checked whenever shared layout, shared CSS, pick rendering, or navigation changes.