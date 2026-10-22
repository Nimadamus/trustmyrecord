# Release: NFL Game Simulator UX, Oct 21, 2026

Branch `nfl-sim-ux-20261021`, based on main `fa374ed1abce`. Staging only until Nima approves a merge.
Times are Pacific.

## Commits

| SHA | When (PT) | What |
|---|---|---|
| `274cc9b66d6b` | Oct 21, 2:29 AM | UX overhaul: hero, progress, one headline, conversion under the score, URL sync, deep links, rivalry page CTAs, dash cleanup |
| `3f0d479a566c` | Oct 21, 2:37 AM | Margin range sides kept unbroken on phone (coordinator) |
| `eded26c94e49` | Oct 21, 3:26 AM | Cold start resilience (no double submit, timeout, Try again), neutral link fix, backtest accuracy labels |
| this file's commit | Oct 21 | Release doc |

Diff against `fa374ed1abce`: 85 files, +641 / -350.

| File | Change |
|---|---|
| `nfl-simulator/index.html` | +583 lines changed; the page itself |
| `static/js/tmr-sim-archive.js` | 38 lines; shared archive panel, dashes replaced (all four sport simulators) |
| `scripts/build_nfl_team_pages.js` | 14 lines; rivalry rows and CTA deep link, NFL og image |
| `nfl-simulator/*-vs-*/index.html` (48) | Each meeting and the CTA deep link into the simulator; og image |
| `nfl-simulator/teams/*/index.html` (32) | og image only |
| `nfl-playoff-simulator/index.html`, `sports-simulators/index.html` | One sentence each: backtest label, market statement |

No backend change. No new static pages. No new data source.

## What changes for users

1. A featured game card at the top (live board game, else the next game) with a "Simulate this game" button. Intro is two sentences. Sim count, venue and kickoff window are under a collapsed "Simulation settings".
2. Every game card has a Simulate button; the whole card is still tappable.
3. Tapping shows a progress card where the result will appear, with elapsed seconds. The page scrolls to it, then to the result headline, and keyboard focus moves to the headline.
4. One headline: "Model: NE by 3.4", one projected score, win chance per team, then sims, model name, run time and kickoff in PT. The single sampled game is only in the Box Score tab, labelled "One simulated game".
5. "Take a side on TMR" (Take the X buttons, plus a free account link for logged-out visitors) sits directly under the headline.
6. The address bar holds a share link after each run. Reload shows the same run. Share links replay the same seed and game.
7. `/nfl-simulator/?away=NE&home=CHI` (also LAR, WSH, JAC aliases, nicknames, old team refs) preselects any pair without running. Invalid pairs get a friendly message. Rivalry pages link straight to that matchup.
8. Repeat taps during a slow run do nothing. Errors (server, busy, network, 45 s timeout) show a plain message and Try again.
9. Default stays 10,000 simulations (stability measured by the model agent: 1k mean win probability error 1.21 pts, 10k 0.44).
10. Accuracy section is titled "Backtest accuracy" and says the figures are the model re-run after each game with pre-kickoff data, not the live predictions on the page. The "matched or beaten the closing market" sentence is gone; copy states the model does not beat the closing market across 2022 to 2025. The season to date table switches to "Live predictions graded" only if the accuracy API returns `provenance` with `live_graded: true` (or `kind`/`type`/`source` = `live`, or `source` = `served`).
11. No en or em dashes in visible copy on the NFL simulator or in the shared archive panel.

Behaviour changes to know about: `?ref=` and `?home&away` links WITHOUT a seed now preselect instead of auto-running (links with a seed still run). Neutral site share links now replay with the original home/away order (old links replayed a mirrored game).

## Pre-merge evidence (staging, localhost, API mocked from captured fixtures)

- E2E suite: 565 checks across Chromium (desktop 1366x900, mobile 390x844), WebKit (desktop, iPhone 13 emulation) and Firefox (desktop, mobile). 563 pass. The 2 failures are Firefox console errors for a Google Fonts download cut off by the test's own navigation (no app code involved). One Firefox scenario hit a harness reload timeout and passed on a fresh browser. Log: `C:\Users\BL\AppData\Local\Temp\nflsim_ux\e2e2_final2.txt`.
- Covered: hero, progress, scroll and focus, headline, conversion placement, URL sync, reload, share replay, keyboard, every tab, dashes, overflow, 12 s cold start (counter ticks, no double submit, no signup modal on repeat taps), 500 / 503 / 45 s timeout with Try again, 6 legacy share link formats, 3 preselect links, 6 junk links, 3 rivalry CTAs click-through, all 48 rivalry pages' links statically, accuracy label with provenance absent / live / backtest.
- Regression: 22 simulator pages, base vs branch, desktop and mobile, 0 new errors (`reg_run2.txt`).
- `node scripts/verify-regression.js --static-only`: same two pre-existing failures as base (sportsbook no game drop guard, sportsbook public loading).
- Existing node tests for the simulator and gate: all pass.

## Merge (needs Nima's go)

```
git -C <checkout> fetch origin
git -C <checkout> checkout main && git -C <checkout> pull --ff-only
git -C <checkout> merge --no-ff origin/nfl-sim-ux-20261021 -m "Merge NFL simulator UX (nfl-sim-ux-20261021)"
git -C <checkout> push origin main
```

After the push, the `static-asset-versions` workflow re-pins `?v=` hashes (tmr-sim-archive.js changed). GitHub Pages rebuild usually lands in 1 to 3 minutes; confirm the `pages-build-deployment` run is green before the smoke test.

## Production smoke test (after Pages is green)

Use cache-busted URLs (`?cb=<epoch>` or the share params plus `&cb=`). Desktop 1366 wide and a real phone.

GETs (curl, expect 200 and the new markers):
- [ ] `https://trustmyrecord.com/nfl-simulator/?cb=N` contains `id="featBtn"`, `DEFAULT_SIMS=10000`, `Backtest accuracy`, no `matched or beaten`
- [ ] `https://trustmyrecord.com/nfl-simulator/bears-vs-lions/?cb=N` contains `/nfl-simulator/?away=` and `og-nfl-simulator.png`
- [ ] Page HTML references `tmr-sim-archive.js?v=` with the NEW hash (re-pin ran)

Taps (desktop, then phone):
- [ ] Hero card names a real upcoming game with a PT kickoff; settings collapsed
- [ ] Tap "Simulate this game": progress card shows at once with elapsed seconds; result headline "Model: XX by N.N" scrolls into view
- [ ] One projected score only; Take the X buttons directly under it; Box Score tab says "One simulated game"
- [ ] Address bar now has `seed=`, `sims=10000`, `ref=`; reload shows the same headline
- [ ] Open that link in a private window: same headline and game selected
- [ ] `/nfl-simulator/?away=NE&home=CHI`: featured card says "Your matchup", nothing runs until tapped
- [ ] `/nfl-simulator/?away=XYZ&home=CHI`: friendly message, page usable
- [ ] Accuracy section shows the yellow "Backtest" note and the season table caption says Backtest
- [ ] No horizontal scroll on phone; no console errors (desktop devtools)
- [ ] Spot check one other simulator (NBA) and its archive panel still renders

Each real tap creates one anonymous run row; keep production taps to the list above.

## GO / NO-GO

GO when all of:
- Every smoke item above passes on desktop and phone
- Pages deploy and asset re-pin both green
- No new console errors vs the pre-merge page

NO-GO (roll back) if any of:
- Result never renders, or renders without the headline, on either size
- Take the X buttons missing or not handing off to `/sportsbook/?simpick=1`
- Signup gate fires on a first run for a new visitor, or on Try again
- Share link or reload shows a different game than the one run
- Any page error on load of `/nfl-simulator/` or a rivalry page

## Rollback

Merge commit (preferred, one step):
```
git -C <checkout> revert -m 1 <merge-sha>
git -C <checkout> push origin main
```
If the branch was fast forwarded instead, revert the commits newest first:
```
git -C <checkout> revert --no-edit <doc-commit> eded26c94e49 3f0d479a566c 274cc9b66d6b
git -C <checkout> push origin main
```
Pages rebuild again in about 1 to 3 minutes; re-run the first two GETs to confirm the old markers (`Measured accuracy`, no `featBtn`). The rivalry pages are also rebuilt by `league-sim-bake`; after a rollback the reverted builder keeps them on the old CTA.

## Not verified before merge

- Nothing has been checked on the live site; all browser runs were localhost with mocked API answers.
- The `provenance` field does not exist yet; the live label path is tested only with a mocked field.
- Real cold start time with 10,000 sims was not measured (cold 5,000 took 10.4 s, warm 10,000 took 1.5 s).
