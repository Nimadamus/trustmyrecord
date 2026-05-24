# Handoff — Trendspotter Generate validation fix (commit dbf329f0)

Status: committed locally, NOT pushed, 0% live-verified. Held until worktree is clean.

## Exact bug fixed
On `/trendspotter/`, selecting a market that needs a line (e.g. MLB / Dodgers @ Brewers /
**Spread** / ATS / Side away / Full game / source window / min sample 10) with **no line entered**
showed the generic "Missing required variables for this market." and a hard-`disabled` Generate
button that did nothing on click (silent failure). Distinct missing inputs (side/team/line/sample)
all collapsed into the same vague message.

## Fix (validation/click behavior only — no redesign, no other pages)
- `validationErrors()` emits field-specific keys: `missing_side`, `missing_team`, `missing_line`,
  `invalid_line`, `missing_sample` (was one generic `"missing required variables"`).
- `validationMessage()` returns market-aware, human-readable text naming the field
  (e.g. "Missing field: enter the Spread line (a number, e.g. -1.5) before generating.").
- Generate button: `.is-blocked` + `aria-disabled="true"` + `title` reason while invalid, but stays
  CLICKABLE (hard-`disabled` only while loading). A click while blocked renders the named-field
  message in the results panel — never silent.
- Valid inputs → existing `renderResults()` path: verified trend OR explicit "no verified trend /
  small sample (with size)" message.
- Click handler logs: `[Trendspotter] Generate clicked {query, errors}` then
  `Blocked: <key> -> <message>` or `Validation passed -> evaluating verified source rows`.
- Protocol rule added to `DEVELOPMENT_RULES.md`.

## Files changed
- `static/js/trendspotter.js`
- `static/css/trendspotter.css` (`.ts-run-button.is-blocked` visual)
- `DEVELOPMENT_RULES.md`

## Commit
- `dbf329f0` — "Trendspotter: name the missing field + no silent Generate failure"
- Local only. origin/main is ahead via other agents (`deba230e` …); this commit is not pushed.

## Pre-deploy evidence (already run)
- `node --check static/js/trendspotter.js` → JS SYNTAX OK
- `node /tmp/ts_validate_test.js` (mirrors patched logic): reported scenario → `["missing_line"]` +
  named message; line entered → `[]` (Ready); no side → `missing_side`; bad line → `invalid_line`;
  minSample 0 → `missing_sample`. Button blocked-but-clickable in each failing case.

## Why blocked from deploy
The repo predeploy/publish guard (`scripts/predeploy-guard.ps1` → `guard-trustmyrecord-publish.ps1`)
refuses to push from a dirty worktree. The worktree currently has REAL uncommitted edits owned by the
MLB simulator agent — do NOT touch them:
- `scripts/predeploy-guard.ps1`
- `static/js/mlb-simulator.js`
- `static/css/mlb-simulator.css`
- `tests/mlb-simulator-live-roster-validation-test.js`
- untracked: `tests/mlb-simulator-roster-source-test.js`
The guard is intentional; do not bypass it. Do not stash/overwrite/modify the simulator files.

## Exact steps to finish (once the simulator worktree is clean)
1. Confirm clean: `git status --short` shows nothing but this fix already committed (or empty).
   - If only stat-cache noise remains, refresh with `git update-index -q --refresh`, then re-check.
2. `git push origin main`  (let the guard run; do NOT use --no-verify).
3. Wait for GitHub Pages publish (~30–60s). Confirm: `curl -s https://trustmyrecord.com/trendspotter/ | grep -c is-blocked` (and that the new trendspotter.js is served).
4. Live-verify the reported scenario at `https://trustmyrecord.com/trendspotter/?sport=MLB`:
   - Select Dodgers @ Brewers / Spread / ATS / Side away / Full game / source window / min sample 10,
     leave the line blank.
   - Expect: validation line + button title read "Missing field: enter the Spread line …", button shows
     blocked style, and CLICKING it renders that named message in the results panel (no silent failure).
   - Console shows `[Trendspotter] Generate clicked …` then `Blocked: missing_line -> …`.
   - Enter line `-1.5`: button enables; clicking yields a verified trend OR an explicit
     "no verified trend / small sample" result with sample size.
5. Capture: live URL, deployed commit hash, rendered DOM + console output. Then mark live-verified.
