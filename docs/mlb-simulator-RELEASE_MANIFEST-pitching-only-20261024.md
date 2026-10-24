# MLB Simulator release manifest: pitching and bullpen management only

Prepared 2026-10-24, Pacific time. Nothing here is pushed or deployed.

## 1. Candidate

| Item | Value |
|---|---|
| Branch | `mlb-pitching-release-only`, pushed to `origin/mlb-pitching-release-only` (not main) |
| Worktree | `C:\Users\BL\mlbsim_pitching_release` |
| Commits on top of `origin/main` `0fe2fb014` | `30ce580aa` (engine, tests), `e49e6ef9d` (legibility and contrast), `bf8ff2e0b` (starter hook calibration), plus docs commits |
| Engine SHA-256 (first 12) | `937ffbddef2c`, pinned as `?v=937ffbddef2c-pitchmgmt` |
| CSS SHA-256 (first 12) | `45964a786b1b`, re-pinned on the simulator page and both season pages |
| Live engine at 08:56 PDT | `4cf0065b16b2`, identical to main |
| Engine vs the 24/24 realism build | identical ignoring line endings, except one display string in `pitchingChangesSection` and the starter hook calibration (section 6a); the 12k realism shards were not rerun after those |

## 2. Scope (what reaches the site)

Served files: `static/js/mlb-simulator.js`, `static/css/mlb-simulator.css`,
`mlb-simulator/index.html` (build marker and the two `?v=` pins), and the two
season pages (`?v=` pin only). Page flags are unchanged
(`TMR_MLB_WORKLOAD_V2 = true`, residual 0.010, batted ball table). Every engine
decision change is gated by `workloadV2()`; with the flag off the validator gives
byte-identical numbers for main and candidate (`_audit/release/validate_main.log`,
`validate_rel.log`).

Engine changes: starter effectiveness hook, pitch economy (counts only), mid
inning manager, closer entry and four out cap, role out and pitch ceilings,
postseason pen depth, leverage window, re-entry fix, injury and ejection logging,
change reasons and the Pitching Changes box section, bullpen workload ledger,
regular season extra inning runner, fail open pen depth, reconcile fix.

CSS changes (measured in a real browser on the candidate): team headings in the
Roster Moves and Pitching Changes blocks rendered at 9 px; the dark scheme rule
turned them `#cdd7ee` on the box score card, which stays white in dark mode
(1.5:1), and box score substitution rows went to `#9aa6c0` (2.4:1). Headings now
0.78rem uppercase `#14264d`, list indent 1.35rem, dark override removed.

Not included: rolling team ratings, any league scoring re-anchor, any starter
weight change, backtest scripts.

## 3. Test proof (true exit codes)

The 07:12 PDT "19 of 19 exit 0" report was wrong: the runner read `$?` after a
`$(date)` substitution, so every line said 0. Two suites had actually failed on
the sparse checkout (missing files). Fixed by adding the files to the sparse
checkout; the site-wide link test runs with `_audit/tracked-fs.cjs` so a path
counts when git tracks it.

Clean rerun on `e49e6ef9d`, exit code captured on the next statement, one process
at a time (`_audit/chain2.sh`, logs `_audit/release2/`), 09:42 to 10:10 PDT:
19 of 19 rc=0. Pitching management suite 66 of 66 PASS; postseason odds 87
passed, 0 failed; matchup page contract all passed.

Focused checks (`_audit/focused_extra.cjs`, 09:29 PDT): every regular season
extra half inning starts with the runner on 2nd (68 games, 190 halves, 190
placed, 0 misplaced); postseason extras place none (65 games).

After the starter hook calibration (`bf8ff2e0b`), essential regression only,
12:11 to 12:29 PDT (`_audit/regress.sh`, logs `_audit/release3/`), 11 of 11 rc=0:
page, pitching management (66 of 66 PASS), feature flag isolation, box score
reconciliation, box score, determinism, runs versus hits, postseason series, no
legacy path, archive replay, focused extra inning checks (184 of 184 regular
season extra halves with the runner, 0 in 69 postseason extra games).

## 4. Real game backtest (700 games, pre-game inputs only)

Data: 350 games from 2025 and 350 from 2026, 50 per month, final regular season
games with announced probables (statsapi). Inputs are the probables and their
season lines through the day before. Real boxscores are targets only.
`_audit/bt/games600.json`, runner `full.cjs`, grader `eval_full.cjs`.

16 of 16 configurations ran to completion, each 700 of 700 games with rc=0
(`_audit/release2/summary.txt`, 10:16 to 11:27 PDT). Win probability log loss, paired against neutral ratings on the
same games:

| Configuration | 2025 dLL [95% CI] | 2026 holdout dLL [95% CI] |
|---|---|---|
| neutral (baseline) | 0.6951 | 0.6881 |
| season to date RS/RA (production mechanism) | -0.016 [-0.035, -0.003] | +0.003 [-0.008, +0.018] |
| season, shrunk K=30 | -0.013 [-0.028, -0.004] | +0.003 [-0.006, +0.015] |
| season, shrunk K=60 | -0.010 [-0.024, -0.001] | +0.001 [-0.005, +0.012] |
| rolling ratings | +0.003 [-0.046, +0.028] | -0.000 [-0.019, +0.021] |
| rolling ratings at half strength | -0.009 [-0.036, +0.008] | -0.002 [-0.014, +0.010] |
| shipped table (leaky) | -0.027 | -0.008 [-0.022, +0.021] |
| shipped table + season (production as live, leaky) | -0.029 | -0.004 [-0.019, +0.019] |
| main engine, neutral | -0.001 | -0.001 [-0.009, +0.007] |
| neutral, starter weight 0.020 | +0.001 | -0.001 [-0.006, +0.006] |
| neutral, legacy starter formula | +0.006 | +0.004 [-0.010, +0.017]; total bias -0.57 runs [-0.98, -0.16] |

Pooled over 700 games, season to date data: -0.0065 [-0.016, +0.003].
For scale, always predicting the home side at 53.5% scores 0.6922 and neutral
scores 0.6916. The earlier 0.73 to 0.75 rolling result (42 games) did not
reproduce: rolling now ties neutral. No rating configuration beats neutral on the
2026 holdout with a confidence interval clear of zero. Decision: no rating change
in this release; production keeps its existing pipeline.

Starter weight (season mode), bias by starter quality, slope per 10 quality
points of (expected minus actual) runs allowed:

| Residual weight | slope [95% CI] | 2026 dLL vs 0.010 | team runs RMSE 2025 / 2026 |
|---|---|---|---|
| legacy formula | +0.062 [-0.027, +0.191] | -0.001 | 3.181 / 3.199 |
| 0.010 (shipped) | +0.229 [+0.140, +0.352] | 0 | 3.187 / 3.209 |
| 0.020 | +0.185 [+0.091, +0.313] | -0.000 | 3.168 / 3.198 |
| 0.030 | +0.144 [+0.053, +0.274] | -0.003 [-0.008, +0.001] | 3.184 / 3.187 |

The shipped weight under-credits good starters (the slope's interval excludes
zero on 1,400 starts). Raising the weight reduces that bias but no weight
improves log loss or score error measurably, and higher weights move the 2026
total bias from -0.37 to -0.46 runs. Decision: no change now; open item.

## 5. Realism vs the same real games (regular season)

| Metric | Real | Candidate | Main (production) |
|---|---|---|---|
| Runs per team-game | 4.50 | 4.45 | 4.48 |
| Hits / walks / strikeouts / HR | 8.19 / 3.34 / 8.43 / 1.17 | 8.62 / 2.90 / 7.71 / 1.20 | 8.76 / 2.92 / 7.60 / 1.23 |
| Team shutouts | 5.9% | 6.3% | 6.3% |
| Games 12+ / 15+ / 5 or fewer runs | 26.3 / 12.6 / 24.6% | 24.3 / 10.3 / 23.9% | 25.8 / 12.0 / 24.4% |
| Extra innings | 9.7% (8.6% season) | 10.5% | 8.8% |
| Starter pitches p10 / p50 / p90 | 65 / 88 / 100 | 55 / 89 / 104 | median 79 |
| Starts under 70 pitches | 14.0% | 21.2% | 33.6% |
| Pitchers per team-game | 4.32 | 4.52 | 3.23 |
| Closer outings of 7+ outs | ~0 | 0.1% | 30.2% |
| Closer outings of 35+ pitches | 1.5% (2025 benchmark) | 1.9% | 30.8% |
| Position player pitched | 2.7 to 2.9% (2025-26 season) | 3.4% | 22.0% |
| Good starts (1 ER or fewer) under 70 pitches | 6.6% | 5.8% | n/a |

Backtest teams run without live rosters (the fail open path every historical
club uses), so bullpen names are generic there.

Postseason mode on the same 700 matchups (playoff settings, not playoff teams):
starter pitches median 80 (real October 82), pitchers per team-game 4.99 (real
5.03), closer 4+ outs 32.4% (real 31.5%), 7+ outs 1.2% (real 1.2%), 35+ pitches
5.0% (real 2.4%), position player pitched 4.2% (real postseason: rare).

## 6a. Starter hook calibration (approved by the owner 2026-10-24, commit below)

Three changes, all under `workloadV2()` (`STARTER_HOOK_CALIBRATION_20261024`):
the mid-inning run hook waits for 70 pitches unless he has allowed 6+ runs; the
hit hook waits for 70 pitches unless 8+ hits; the boundary "rocky" hook needs
three innings in instead of two; and a starter is not sent out for another frame
within 10 pitches of the limit (`STARTER_BOUNDARY_HEADROOM = 10`).

Focused validation, same 700 real games, 4 simulated box scores each, same seeds
(`_audit/bt/sw_rel.jsonl` before, `sw_final.jsonl` after; `spm.cjs`):

| Metric | Real | Before | After |
|---|---|---|---|
| Starts with 5+ ER ending under 70 pitches | 16.2% | 48.5% | 40.8% |
| Starts under 70 pitches with 3+ ER (all starts) | 5.8% | 12.8% | 9.3% |
| Starts reaching 100 pitches | 10.2% | 28.7% | 15.2% |
| Starts reaching 105 pitches | 2.8% | 9.3% | 3.4% |
| Starter pitches p10 / p50 / p90 | 65 / 88 / 100 | 55 / 89 / 104 | 60 / 88 / 101 |
| Good starts (1 ER or fewer) under 70 pitches | 6.6% | 5.8% | 5.6% |
| Starts of 6+ innings | 35.6% | 31.0% | 28.8% |
| Runs per team-game | 4.50 | 4.44 | 4.45 |
| Pitchers per team-game | 4.32 | 4.52 | 4.53 |
| Relief outings of 7+ outs per team-game | 0.183 | 0.238 | 0.222 |
| Position player pitched | 2.7 to 2.9% | 3.4% | 3.5% |
| Closer outings of 7+ outs | ~0 | 0.1% | 0.1% |

Both targeted metrics improved and no bullpen metric got worse; 6+ inning starts
fell 2.2 points. The 5+ ER gap is only partly closed: the simulated damage comes
earlier in the outing than real damage does (5+ ER starts average 9.6 outs vs a
real 12.7), which is a plate appearance engine property, and leaving the hooks
looser made it worse (variant D2: 47.0%). Variants tried: `_audit/bt/mkvar.cjs`
(D, D+H, D+H+R, B5, B8, B10, L95, D2+H2+R2 and combinations); chosen B10+D+H+R.

## 6. Known gaps (measured, not fixed in this release)

1. Shelled starters still leave early: 40.8% of 5+ ER starts end under 70
   pitches against a real 16.2% (was 48.5%; see 6a).
2. 100-pitch starts 15.2% against a real 10.2% (was 28.7%); 6+ inning starts
   28.8% against 35.6%.
3. Hits high, walks and strikeouts low, intentional walks never issued: the same
   in production; parked as a separate calibration project.
4. Starter quality is under-credited (section 4).
5. Postseason mode: closer 35+ pitch outings about double the real rate, and
   position players still pitch in 4.2% of team-games on the fail open path.


## 7. Browser check

Measured on the candidate through a local preview (`_audit/serve.cjs`, port
8791, unknown files proxied read-only from the live site) in the owner's Chrome:
text contrast in the Pitching Changes section 14.3:1 (light scheme), 17.9:1
heading, box score cells 13.2:1; no dark-scheme background rule on the card.
These led to the CSS fix. Unverified: the fixed CSS has not been re-rendered in a
browser (the renderer froze under machine load; main froze the same way, so this
is not a candidate defect), mobile width, and named bullpen arms (backend roster
calls fail from localhost because of CORS).

Final display check (12:2x PDT): the Pitching Changes section rendered through
the real `runSimulation` path on the final engine reads "X replaces Y: reason"
(`_audit/snap.cjs`). Static CSS check: no dark-scheme rule touches the box
score or the Roster Moves / Pitching Changes blocks, so dark mode renders the
same colors as light: headings 14.9:1, list text 14.3:1, substitution rows
8.9:1 on the white card. The browser preview froze again under machine load,
so the final CSS is still not confirmed in a rendered browser.

## 8. Close-out state

All jobs finished by 12:29 PDT and the preview server was stopped; nothing from
this work is still running.

## 9. Guarded deployment (only after the owner says yes)

1. `git fetch origin main`; rebase the branch onto it; stop on any conflict in
   the five served files.
2. Recompute both pins (`git show :<file> | sha256sum | cut -c1-12`) and run
   `node tests/mlb-simulator-page-test.js` and the pitching management suite.
3. Push the commits to `main` (fast forward only).
4. Verify with a cache-busted GET of `https://trustmyrecord.com/mlb-simulator/`:
   marker `mlb-simulator-pitching-mgmt-20261023`, served engine hash equal to the pin.
5. Run one simulation on the live page and read the Pitching Changes section.

## 10. Rollback

`git revert` the three code commits (`bf8ff2e0b`, `e49e6ef9d`, `30ce580aa`) and push to `main`: the old engine, CSS and pins
return together. Verify the marker `mlb-simulator-blowout-calibration-20260727a`
with a cache-busted GET.

## 11. Owner question

May I merge `origin/mlb-pitching-release-only` (rebased onto current main) into main of
trustmyrecord so the pitching and bullpen changes go live, with the rollback
above if anything looks wrong?
