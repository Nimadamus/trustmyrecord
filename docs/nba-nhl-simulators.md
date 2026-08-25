# Competitive audit and acceptance standard

Written 2026-08-25, before the work it sets the bar for. It exists so that
"best-in-class" is a claim with a definition behind it rather than an adjective.

## What is actually out there

Surveyed the publicly reachable NBA and NHL simulators and matchup models. Some
pages refused automated fetching, and those are marked as such rather than
guessed at, because an audit that invents its competitors is worse than no audit.

| Product | Simulation approach | Current rosters and injuries | Lineup / goalie control | Simulation count | Box score | Play-by-play | Betting-style outputs | Published methodology | Published accuracy |
|---|---|---|---|---|---|---|---|---|---|
| WhatIfSports SimMatchup | Rating-based, historical and "dream" teams | No -- built around historical seasons from 1967-68 | Team choice only, per its own description | One game per press | Not described on the page | Not described | No | No | No |
| MatchSimHub | Tunable outcome model, three "chaos" modes, playstyle and home-advantage toggles | Not stated anywhere on the page | Strength and playstyle sliders, no named lineup | "Instant" results, count not offered | Not described | Not described | No | No -- explicitly independent, no method given | No |
| PlayOBM | Possession-by-possession engine, per its own copy | Current or classic teams | Team choice | 1,000 runs offered | Implied | "SimCast" play-by-play | Not stated | No | No |
| The Sports Terminal | Shot-by-shot single game, lines against the starting goalie | Implied current | Lines and starting goalie referenced | Single game | Implied | Shot by shot | Pinned to their own model line | No | No (403, not directly verifiable) |
| MyGameSim | Predictions plus projected player stats | Implied current | Not stated | Not stated | Player projections | No | Score predictions | No | No (403, not directly verifiable) |
| CapperTek | Its own description: algorithms and AI that **reverse engineer betting lines and odds** | Not stated | No | Single result | No | No | Yes, derived from the market | No | No |
| StatSharp | Game simulations with "value edges" | Implied current | Not stated | Not stated | Projected stats | No | Spread, moneyline, total edges | No | No |

Three things stand out, and they are the whole opportunity.

**Almost nobody publishes a method.** Across every product surveyed, not one
states how its model works in enough detail to be argued with.

**Nobody publishes accuracy at all.** Not a Brier score, not a calibration
curve, not a holdout. A simulator that cannot tell you how often it is right is
asking to be believed rather than checked.

**At least one openly derives its numbers from the betting market.** CapperTek's
own description says it reverse engineers lines and odds. That is a legitimate
product, but it is a market echo, not a model: it cannot disagree with the
market, so it can never tell you the market is wrong.

The common shape of the category is: pick two teams, press a button, receive a
scoreline. The ceiling is low and it is set by presentation rather than by
evidence.

## The standard this product is held to

Ten commitments. Each is either met and evidenced below, or listed as not met.
Nothing is graded on intent.

1. **Every claim about accuracy is measured out of sample.** Settings are chosen
   on calibration seasons and scored once on seasons never used for tuning.
2. **Every number is published with a sample size and an interval.** A skill
   figure without an error bar is not evidence.
3. **Weaknesses are published beside strengths.** Segments where the model has no
   edge are reported as having no edge.
4. **Nothing in a box score is impossible.** Player lines sum to team totals, team
   totals sum to the final score, minutes reconcile including overtime.
5. **Nothing written is invented.** Every sentence of a recap traces to an event
   the simulation played, enforced by a test that reads the box score back.
6. **Scenarios change the game, not the label.** Sitting a player removes him and
   redistributes his minutes; a scenario that changes nothing reports nothing.
7. **Data provenance and freshness are visible.** The response says when the
   season data was built and where it came from.
8. **The method is published in full**, including the parts that did not work.
9. **No market echo.** The model never reads a betting line.
10. **No unsupported superlatives.** No "most accurate" without a number behind it.

## Where the product stands against it

Met: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10. The evidence for 1 to 3 is the holdout
evaluation below; for 4 and 5 the eight-suite gate; for 6 the scenario suite.

# Re-audit against the matrix

Run 2026-08-25, after the work. Same competitors, same columns, our column
filled in from what is actually live and verifiable rather than from intent.

| capability | typical competitor | TrustMyRecord now |
|---|---|---|
| Simulation approach | rating draw or possession loop | possession loop (NBA), shift and event engine (NHL), both with real overtime |
| Current rosters | historical in some, unstated in most | current season snapshot, age published on every response |
| Injuries and availability | not offered | modelled, and **measured**: knowing who is out is worth +1.7 points of Brier skill |
| Starting goalie | referenced by one | selectable, and worth the difference between a model that beats the home side and one that has not been shown to |
| Player modelling | projected stat lines | full possession/shift attribution reconciling to the final score |
| Scenario controls | sliders and "chaos" modes | sit a player, cap his minutes, shift the pace, change the goalie -- with the change reported and a no-op reported as nothing |
| Simulation count | one, or 1,000 | 100 to 50,000 |
| Box-score depth | not shown by most | complete, audited line by line every release |
| Play-by-play | two offer it | NHL scoring summary with strength and assists, penalties, three stars |
| Betting-style outputs | spread/total edges; one reverse-engineers the market | win, spread, puck line, totals, a cover curve across every line, most common scorelines |
| Uncertainty | none seen | percentiles, score ranges, distributions, and a sensitivity panel saying what the answer rests on |
| Charts | rare | margin and total distributions, cover curve, win-probability line |
| Explanations | none seen | plain-language drivers, an event-grounded recap, a published methodology |
| Mobile | varies | verified at six widths including a browser at 125% |
| Speed | varies | 1-2ms per simulated game |
| **Published methodology** | **none found** | full, including what did not work |
| **Published accuracy** | **none found** | holdout evaluation with intervals, by segment |
| **Independence of the market** | one explicitly reverse-engineers lines | never reads a betting line |

## Gaps closed since the first audit

Win-probability progression, player prop distributions, sensitivity analysis,
shareable and printable results, data-freshness labelling, a production health
check, an accessibility sweep, and an honest holdout evaluation.

## Gaps left open, and why

**Shot location.** Rim, midrange and three cannot be separated from this feed. A
rim rate would be invented, so there is none.

**NHL hits by ice-time rank.** Still inverted. The fix was built, measured, and
removed because it cost two per cent of the goal mean.

**Near-even NBA games.** No edge, and now understood: knowing who is out moves
the knowable games out of that bucket, so what remains is genuinely close. Three
separate attempts to improve it failed and are recorded.

**Special teams as a rating input.** Would need per-game power-play data the
feed does not expose without a request per game.

## The standard, re-checked

All ten commitments from the first audit hold. The three that the category does
not meet at all -- published method, published accuracy, independence from the
market -- are the three this product is built around.

# Holdout evaluation

The walk-forward backtest was already leak-free in the way that matters most: on
the morning of each game it has seen only games already played. But the SETTINGS
of that model -- decay, ridge, how much a starting goaltender counts -- were
chosen by looking at how they scored across every season available, which is
optimising against the evaluation set. Every number produced that way is a
little too flattering.

So the evidence is split and the halves are not allowed to touch. Settings are
searched on 2023 and 2024, frozen, and the 2025 and 2026 seasons are scored
once.

    node scripts/holdout_evaluation.js --sport nba
    node scripts/holdout_evaluation.js --sport nhl

## Basketball, on seasons never used to choose anything

| segment | games | Brier | Brier skill [95% CI] | accuracy | margin MAE |
|---|---|---|---|---|---|
| everything | 2,468 | 0.20879 | **15.66% [13.02%, 18.41%]** | 67.71% | 11.24 |
| a clear favourite | 1,130 | 0.17105 | 29.59% [24.50%, 35.29%] | 77.61% | 10.96 |
| heavy favourites | 316 | 0.13504 | 41.88% [28.47%, 52.76%] | 83.86% | 10.87 |
| near coin flips | 479 | 0.24686 | **0.78% [-0.20%, 1.82%]** | 56.16% | 11.36 |

Expected calibration error on the holdout: **2.62%**.

The fourth row is the honest one. On games the model itself calls close to even,
its skill interval includes zero: it has not been shown to beat a coin there, and
saying so is more useful than burying it in an average.

## Hockey, same discipline

| segment | games | Brier | Brier skill [95% CI] | accuracy | margin MAE |
|---|---|---|---|---|---|
| everything | 2,623 | 0.24235 | **2.36% [0.73%, 3.73%]** | 56.58% | 2.13 |
| a clear favourite | 440 | 0.21259 | 7.10% [-1.15%, 14.60%] | 69.77% | 1.99 |
| near coin flips | 909 | 0.25009 | -0.06% [-0.81%, 0.61%] | 50.61% | 2.20 |

Expected calibration error on the holdout: **2.04%**.

### What knowing the starting goaltender is worth

Measured on the holdout, with the setting chosen on the calibration seasons and
then frozen:

| | games | Brier | Brier skill [95% CI] | accuracy |
|---|---|---|---|---|
| knowing the starter | 2,623 | 0.24235 | **2.36% [0.73%, 3.73%]** | 56.58% |
| not knowing it | 2,623 | 0.24480 | 1.37% [-0.11%, 2.72%] | 55.74% |

This is the single most useful result on this page, and it is not the flattering
one. Without the starting goaltender, the hockey model's skill interval INCLUDES
ZERO: on unseen data it has not been demonstrated to beat picking the home side.
With the starter, the interval clears zero. The goaltender is not a refinement
here. It is most of what the model knows.

It is also a correction. Measured across all four seasons -- the seasons whose
results helped choose the settings -- the same model reads 4.7% skill. On seasons
it was never allowed to see, it reads 2.36%. The difference between those two
numbers is exactly the optimism this split exists to remove, and the smaller one
is the true one.

# Release checklist

Kept honestly. An item is ticked when it has been VERIFIED to work, not when
code for it exists. Anything unticked is either not done or not yet proven, and
anything that cannot be done says so with the reason.

Audited against the shipped code on 2026-08-25. A large part of this list was
already built before the audit; those rows say so rather than claiming credit.

Commands that produce the evidence below:

    npm run validate:simulators          # the seven-suite gate, backend repo
    node tests/nba-nhl-simulator-browser-proof.cjs   # real browser, tmrfe3 repo
    node scripts/walkforward.js --sport nba
    node scripts/walkforward.js --sport nhl --goalie 0.9

## NBA engine

- [x] Delivered-vs-requested efficiency slope across the full team range --
      **0.990**, 60 team-sides at 150 simulations each. Verified stable over
      three independent seed sets. Was 0.9344 before the flattening fix, which
      compressed every projected margin by six and a half per cent.
- [x] Margin bias **-0.103** points over 4,000 games against a 0.21 standard
      error. Asserted permanently.
- [x] Slope asserted permanently, banded [0.95, 1.05], measured at 150
      simulations a matchup because 40 could not tell 0.95 from 1.04.
- [x] Close games, blowouts, extreme blowouts, totals, home advantage and
      overtime frequency against 1,235 real 2026 games at 9,880 simulated.
      Current: decided by 3 **14.55%** (real 14.57), won by 20 **22.77%**
      (22.83), by 30 6.87% (7.77), by 40 1.55% (1.62), a team 130+ 24.62%
      (25.02), 140+ 5.58% (5.91), under 90 3.67% (3.81).
- [x] Multiple seeds and large samples on every accepted conclusion. Several
      rounds were reverted precisely because they had not been.
- [x] Overtime simulated as real periods, not appended points.
- [x] Box score reconciles to team totals and the final score.
- [x] **Team minutes reconcile, including overtime.** This was BROKEN and is
      fixed: minutes accrued per possession from the possessions the game
      expected to play, and a decided fourth quarter plays fewer, so a blowout
      finished with 237.1 team minutes against 240. Found by the new payload
      suite, not by any existing test.
- [x] No impossible rates, duplicate players or inactive players -- 600 full
      payloads walked every value.
- [x] Shot selection by player, usage, minutes, assists, rebounds, turnovers,
      steals, blocks, fouls, offensive rebounds and second chances, bonus and
      free throws, end-of-quarter possessions.
- [x] Score-dependent late-game behaviour: intentional fouling, desperation
      threes, protecting a lead, and the three that does not tie it.
- [ ] **Shot location split (rim / midrange / three). NOT DONE and not doable
      from this data.** The feed carries no shot-location field per player, so a
      rim rate would be invented. Recorded as a limitation instead.

## NHL engine

- [x] Delivered-vs-requested margin slope **1.007** over 32 matchups. The
      basketball flattening defect is not present here; this was checked rather
      than assumed.
- [x] Goals 3.07 (real 3.08), shots 27.73 (27.84), save pct 89.33 (89.17),
      penalty minutes 8.78 (8.72), blocks 14.05 (14.20).
- [x] One-goal games, overtime share, shootouts, empty net, shutouts, blowouts.
      Regulation ties 25.03% against a real 25.00%.
- [x] Even strength, power play, short handed, empty net, penalties.
- [x] Pull-the-goalie logic, late pressure, overtime and shootout format.
- [x] Starting goalie materially moves the projection, and goaltender ratings
      are shrunk by shots faced so a two-shot backup is no longer rated the best
      goaltender in the league.
- [x] Zero invariant failures across 4,800 team-games.
- [ ] Hits by ice-time rank still run the wrong way down the lineup. The fix was
      built, measured, and REMOVED because it cost two per cent of the goal mean
      through the finishing reference. Written up in full.

## Output

- [x] Full box score by player and team, both sports.
- [x] Quarter and period scoring with overtime columns.
- [x] Goaltender lines with shots against, saves, goals allowed, save pct.
- [x] Win probability, projected score, spread and puck line, totals, a cover
      curve across lines, score range, margin and total distributions,
      regulation/overtime/shootout shares.
- [x] Plain-language matchup drivers.
- [x] Estimate-not-a-guarantee disclaimer on every response.
- [x] **Game leaders**, both sports. NEW.
- [x] **Event-grounded recap**, both sports. NEW. Every claim is checked against
      the box score of the game it describes by `tests/sim-narrative-test.js`:
      a hat-trick has to be three goals, a quoted save count has to be a real
      one, and overtime can only be mentioned if overtime was played.
- [x] **NHL scoring plays, penalty summary and three stars**, recorded as the
      engine plays them rather than reconstructed from totals. NEW.

## Product and UX

- [x] Any valid current matchup selectable; 30 NBA and 32 NHL teams served with
      current rosters, identities and availability.
- [x] Data freshness exposed as `data_built_at` with the source named.
- [x] One simulation or a batch, with the distribution summarised.
- [x] Controls: venue, simulation count, availability, starting goalie.
- [x] Graceful API-failure handling with a user-facing message.
- [x] **Verified end to end in a real browser, desktop and mobile widths**,
      including the new recap, leaders, scoring summary and three stars, and
      including that the recap scoreline agrees with the header.
- [x] Charts verified to render with the real payload (three cards, 20+ bars,
      cover curve path).
- [x] URLs use replaceState and canonicalise to the clean page, so simulator
      actions cannot generate unbounded indexable URLs.

## SEO

- [x] Unique title, description, canonical, schema and social preview on both
      simulator pages; 30 matchup landing pages each.
- [x] No personal name anywhere in public output.
- [ ] **Sitemap: deliberately NOT updated, and this is correct.** Both
      simulators return 404 in production -- they have never been deployed.
      Listing 404s in a sitemap is an SEO harm, so `add_sim_urls_to_sitemap.js`
      stays unrun until the pages return 200.

## Release gate

- [x] Seven-suite simulator gate green: box score audit, NBA realism, NHL
      realism, calibration lock, availability, narrative, payload invariants.
- [x] 600 full payloads walked for NaN, Infinity, negative counts, impossible
      percentages, impossible minutes, duplicated athletes and out-of-order
      percentiles.
- [x] MLB simulator box-score test passes; no MLB code was touched.
- [x] **DEPLOYED AND LIVE.** Backend `67a85f5` on master, front end `40b25b1ed`
      on main. Both simulator pages and all eight public API routes return 200.
- [x] Production verified in a real browser at 1440x900 and 390x844: teams load
      from the live API, a simulation runs, and the recap, leaders, box score,
      quarter or period scoring and the NHL scoring summary all render with no
      console errors and no failed first-party requests.
- [x] Sitemap updated only after every one of the sixty-two URLs returned 200,
      which the script verifies itself before writing. 328 URLs to 394.
- [x] Both simulators linked from the tools page; they were previously
      unreachable from anywhere on the site.

### What the first deployment got wrong

The first backend push built cleanly and then crashed on boot with
`Cannot find module './simSchedule'`. The release files had been chosen by
searching their contents for the engine module names, which found the engines
and missed two siblings that do not mention them: the slate route and the
calibration baseline. The running site was never affected -- the previous build
stayed live throughout, and Render simply refused to cut over.

The fix was to stop selecting by content and walk the require graph from the two
route entry points instead. Twelve modules are reachable; every local require now
resolves inside the commit. That check runs before a push rather than after it.

The production browser check exists for the same reason. The local proof starts
its own servers, so it cannot see a crashed API, a missing module, a stale
cache-busting hash or a CORS header. It passed the whole time the site was
returning 404.

### Genuinely unresolved

- [ ] `tests/nba-nhl-trigger-coverage-test.js` cannot run on this machine. It
      applies `prevent_pick_mutation()` from schema.sql to a local development
      database inside a rolled-back transaction, and there is no PostgreSQL here:
      `pool.connect()` fails with ECONNREFUSED on 127.0.0.1:5432, and the repo
      has only `.env.example`, no `.env`. Pointing it at the production database
      would run DDL against live data to satisfy a test, which is not a trade
      worth making. **To unblock: run a local PostgreSQL, create the
      `trustmyrecord` database, and set DATABASE_URL.** Not fabricated as a pass.
- [ ] `tests/mlb-simulator-realism-test.js` fails on historical teams (1955
      Dodgers innings). Pre-existing and outside this task: no MLB file was
      modified during this release, and the MLB box-score test passes.
- [ ] Lint not run: the repository has no `eslint.config.*` and ESLint 9
      requires one. Adding a lint configuration was not asked for and would
      touch the whole repository.
- [ ] Shot location (rim / midrange / three) remains impossible from this data,
      and the NHL hits-by-ice-time gradient remains a stated residual. Both are
      written up above.

# NBA and NHL simulators

Two new tools, built to the pattern the MLB and NFL simulators already rank on.
Nothing about the existing simulators was changed except two added links.

## What is where

| Piece | Path |
|---|---|
| NBA hub page | `nba-simulator/index.html` |
| NHL hub page | `nhl-simulator/index.html` |
| 60 matchup pages | `nba-simulator/<a>-vs-<b>/`, `nhl-simulator/<a>-vs-<b>/` |
| Shared page styling | `static/css/tmr-sim-arena.css` |
| Shared front end | `static/js/tmr-sim-core.js` |
| Sport front ends | `static/js/nba-simulator-app.js`, `static/js/nhl-simulator-app.js` |
| Live schedule | backend `services/simSchedule.js` |
| Matchup page generator | `scripts/build_sim_matchup_pages.js` |
| Sitemap step | `scripts/add_sim_urls_to_sitemap.js` |
| SEO contract test | `tests/sim-arena-seo-contract-test.js` (`npm run test:simarena`) |
| Browser proof | `tests/nba-nhl-simulator-browser-proof.cjs` (`npm run verify:simarena-browser`) |

Backend, in `trustmyrecord-backend`:

| Piece | Path |
|---|---|
| NBA model inputs | `services/nba/nbaRatings.js` |
| NBA engine | `services/nba/nbaSimEngine.js` |
| NHL model inputs | `services/nhl/nhlRatings.js` |
| NHL engine | `services/nhl/nhlSimEngine.js` |
| Shared route plumbing | `services/simPublicRoute.js` |
| Public routes | `routes/nbaPublic.js`, `routes/nhlPublic.js` |
| Season snapshots | `services/nba/nba-snapshot.json`, `services/nhl/nhl-snapshot.json` |
| Snapshot builders | `scripts/build_nba_snapshot.js`, `scripts/build_nhl_snapshot.js` |
| Realism tests | `tests/nba-sim-realism-test.js`, `tests/nhl-sim-realism-test.js` |
| Availability test | `tests/sim-availability-test.js` |
| Backtest harness | `scripts/backtest_sim.js` |
| Calibration baseline | `services/simCalibrationBaseline.json`, built by `scripts/build_calibration_baseline.js` |
| Calibration lock test | `tests/sim-calibration-lock-test.js` |

## What the tools actually do

Both pages open on the **real slate**, not on an empty pair of dropdowns. Tapping a
game simulates it. `Custom matchup` is the second mode, for any two teams. A deep
link (`?away=LAL&home=BOS`) opens straight into the custom pane with that matchup
already run.

| | NBA | NHL |
|---|---|---|
| Modes | Upcoming games, custom matchup | Upcoming games, custom matchup |
| Result | final score, quarters, win probability, spread, total | final score, periods, shots by period, win probability, total |
| Box score | every player: min, pts, FG, 3PT, FT, OREB/DREB, AST, STL, BLK, TO, PF, +/- | every skater: G, A, P, SOG, PPG, +/-, PIM, hits, blocks, TOI, plus both goaltenders |
| Charts | margin histogram, total histogram, cover-probability curve | margin histogram, total histogram, over-probability curve |
| Availability | Availability tab: rotation, minutes, who is out | Lineups tab: 18 skaters, both goaltenders, who is out |
| Sport-specific control | home court / neutral | starting goaltender per team, home ice / neutral |

Team crests and colours are on the slate cards, the scoreline, the box-score
headers and the generated matchup pages. They come from ESPN and every one of
them degrades to a coloured abbreviation badge if the image fails.

## The schedule

`services/simSchedule.js` reads ESPN's public scoreboard and caches it in memory
for five minutes. It is a **second, independent request**: the simulator is fully
usable before it lands, and every failure path returns an empty slate with a
`degraded` flag so a schedule outage costs a convenience and never the tool.

If today has no games it jumps to the next day that does, in ONE request, using
ESPN's date-RANGE support over a 150-day window. That window has to clear a whole
offseason: the first version walked forward a day at a time, gave up after three
weeks, and left the page empty from June to October.

## Is it accurate? Measured, not asserted

The realism tests check the output looks like basketball and hockey. They are no
evidence at all that it PREDICTS anything. `scripts/walkforward.js` answers that,
and answers it the hard way: it walks four seasons a day at a time, fits ratings
using **only games that had already been played that morning**, and scores that
day's games. Nothing the model sees has happened yet. Every game becomes a test
point, including the opening week, when it knows almost nothing and had better
say so.

| | NBA | NHL |
|---|---|---|
| Games scored | 3,701 | 3,946 |
| Winner called correctly | **66.5%** | **57.3%** |
| Always-pick-the-home-team baseline | 54.8% | 54.1% |
| Brier skill over that baseline | **0.154** | **0.032** |
| Calibration error | **1.8%** | **1.5%** |
| Margin error | 11.26 pts (baseline 12.72) | 2.14 goals (baseline 2.24) |

What it is worth changes through a season, and the site publishes that too:

| Games the model had seen | NBA accuracy | NBA skill | NHL accuracy | NHL skill |
|---|---|---|---|---|
| first 200 | 56.1% | −0.010 | 54.9% | 0.001 |
| 200 to 600 | 62.8% | 0.032 | 61.2% | 0.045 |
| 600 to 1000 | 62.2% | 0.084 | 56.6% | 0.027 |
| 1000+ | 66.6% | 0.150 | 57.7% | 0.039 |

Read the NHL row honestly. It is a real edge and a small one, and hockey is the
reason rather than the model.

## Is the box score realistic? Measured against real ones

Hitting a league average is a weak test. A model can produce exactly 89 shots and
43 rebounds a game and still give every team the same ten players, never produce
a forty-point night, and spread plus-minus so evenly the column means nothing.

`scripts/realism_audit.js` pulls 140 real box scores, simulates the same
matchups, and compares distributions: standard deviations, tails, per-player
extremes, and how often the notable things happen. What it found, and what it
fixed:

| NBA | before | after | real |
|---|---|---|---|
| Plus-minus spread within a team | 4.6 | **31.5** | 28.0 |
| Rotation size (sd) | 10.0 (0.00) | **10.6 (1.29)** | 10.8 (1.50) |
| Players over 30 minutes | 1.63 | **3.25** | 3.14 |
| Highest minutes | 33.0 | **36.4** | 35.8 |
| Leading scorer | 23.2 | **27.1** | 28.4 |
| Leading assists | 6.19 | **7.60** | 7.92 |
| Leading rebounds | 9.23 | **11.0** | 10.5 |
| Scoreless players | 0.15 | **0.75** | 1.19 |
| Free-throw attempts | 21.1 | **23.7** | 23.7 |
| Team fouls (sd) | 2.36 | **4.04** | 4.48 |

| NHL | before | after | real |
|---|---|---|---|
| Plus-minus spread | 0.92 | **3.51** | 3.18 |
| Penalty minutes (sd) | 6.41 (3.61) | **8.64 (5.24)** | 8.74 (6.64) |
| Hits | 18.2 | **20.7** | 20.7 |

### The second pass: relationships, not just columns

An audit on 140 games could not separate signal from noise on anything derived, so
the sample went to 400 real games and the audit was extended to the things a
premium simulator has to get right: how often the team that shot better actually
won, what a fourth line's ice time looks like, whether anyone fouls out.

| NBA relation: how often the team that did X also won | real | sim |
|---|---|---|
| Better effective field-goal % | 82.0% | **82.3%** |
| Fewer turnovers | 65.8% | **65.9%** |
| More rebounds | 69.5% | 65.5% |
| More assists | 76.8% | 72.6% |

| NHL relation | real | sim |
|---|---|---|
| More shots on goal | 49.2% | **48.3%** |
| More hits | 45.0% | 42.7% |
| Fewer penalty minutes | 47.8% | 53.6% |

Those numbers are the interesting ones. **Out-shooting an opponent predicts a
hockey result almost not at all**, and hitting predicts it slightly *negatively*,
because the team chasing the game forechecks harder. The simulator had shots
converting at a near-fixed rate, which made volume mechanically predictive at
57.4%. Conversion now varies substantially night to night and varies inversely
with volume, because a team throwing everything at the net is taking worse shots
to do it.

Basketball needed the opposite kind of fix. Assists were drawn as a fixed share
of made shots, so they were nearly a restatement of field goals and the team with
more of them won 69.5% of the time against a real 76.8%. In real basketball the
causation runs through ball movement: a team executing well assists more, shoots
better and turns it over less, and wins because of all three. One factor per team
per game now drives all three rather than the correlation being imitated.

| NHL ice time | before | after | real |
|---|---|---|---|
| Least-used skater | 11.2 | **8.3** | 8.3 |
| Top ice time (sd) | 24.1 (0.00) | **26.4 (2.16)** | 24.9 (2.18) |
| Skaters over 20 minutes | 3.1 | **5.0** | 4.3 |

Ice time was allocated once per team and never varied, so every simulated game
gave every skater the identical shift load, with a standard deviation of zero.

### What was actually wrong

- **Plus-minus was a fiction in both sports.** It was shared out by minutes or ice
  time, which cannot tell the unit that won a game from the unit that lost it.
  Basketball now accumulates it possession by possession from who was on the
  floor; hockey puts five named skaters on the ice for every even-strength goal,
  which is the NHL's own rule.
- **Every basketball team used exactly ten players, every night.** The rotation is
  now drawn per game, eight to thirteen deep, on a minute curve calibrated to what
  real box scores show at each rotation slot.
- **Lineups were redrawn every possession.** Coaches play units, and a player
  drawn afresh each possession gets a scattered, uncorrelated sample of the game.
  Units now hold for a stint of seven to sixteen possessions.
- **Garbage time did not exist.** A fourth quarter twenty points apart now empties
  both benches, which is where scoreless lines come from and why a ten-minute
  player's plus-minus is small.
- **Nobody could take a five-minute major.** Hockey penalty minutes were exactly
  twice the opponent's power plays, so the total had no tail at all against real
  box scores that reach forty-seven.
- **A tying shot was never modelled.** A basketball team down three shoots a three
  because a two is worthless to it. Without that, overtime happened in 2.8% of
  games against a real 6%.

Every one of those is now asserted in `tests/{nba,nhl}-sim-realism-test.js`
against the real values, so none of it can quietly regress.

## Third measurement pass: the sample size was the bug

The first two realism passes were run with `--sample 400`. The flag is `--games`.
Every one of those runs silently used the default of 150 real box scores, where
the standard error on a derived rate is about 4 points, and several "fixes" were
made against differences that were not there. Re-measured against 1,235 real
games:

| relation | 150 games said | 1,235 games say | model |
|---|---|---|---|
| rebound edge wins | 63.3% | **68.6%** | 67.1% |
| top scorer on winner | 69.3% | **65.4%** | 64.3% |
| fewer PIM wins (NHL) | 47.8% | **50.8%** | 53.1% |

Two of the three "gaps" chased in the earlier pass did not exist. The tuning
those numbers prompted was reverted, and every band below is now set from the
larger sample. **Do not tune a rate on fewer than about a thousand real games.**

## What the line score was hiding

Quarter and period breakdowns are displayed on every result page and had never
been compared to a real one; only that they summed to the final score. They did
not survive contact with real data.

**Basketball leads were too sticky.** A real fourth-quarter lead of eight or more
retains 94% of itself; the possession loop retained 103%, because a random walk
with drift keeps drifting. Real fourth quarters do not: the trailing team
presses and the leader burns clock. Reverting each quarter toward the margin the
projection EXPECTED by that point (not toward a tie, which would drag every game
to a coin flip and bias the displayed score away from the projection printed
above it) puts it at 93.9%. Real quarter scoring also runs 29.4 / 28.8 / 29.2 /
27.7 rather than four identical quarters; the model now matches to within 0.2.

**Hockey leads were the opposite.** A real third-period two-goal lead FINISHES at
109% of itself, because the trailing team pulls its goaltender. The engine gave
the trailing side both more shots and better conversion and compressed leads to
85%. Real chasing teams shoot more and score worse. Splitting the response by
deficit (down one is a real chance at 6-on-5; down two is volume without quality)
and modelling the pulled goaltender for two-goal games as well as one-goal games
took it to 99%.

## Minutes were the plan, not the game

`line.min` was set to the pre-game rotation draw. The box score therefore
reported what a coach intended, not what happened: a starter benched twenty
points down still showed his planned 34 minutes, and no in-game rotation logic
could move the column, which is why two attempts to make rotations respond to the
scoreboard changed precisely nothing.

Minutes are now accumulated possession by possession from who was on the floor,
the way plus-minus already was, and a player's allocation is spent by the minutes
he actually plays. That last part was also wrong: possessions were charged
against the allocation at both ends of the floor, so every rotation burned itself
out twice as fast as drawn.

Fixing it closed the largest remaining box-score gap and exposed a second one
that the inflated denominator had been hiding:

| | real | before | after |
|---|---|---|---|
| best-to-worst plus-minus | 27.8 | 32.4 | **28.2** |
| busiest player, minutes | 35.5 | 36.6 | **35.0** |
| busiest player, sd | 4.28 | 2.99 | **3.52** |
| players over 30 minutes, sd | 1.48 | 1.02 | **1.41** |
| leading scorer, points | 27.5 | 27.4 | **27.0** |

The leading scorer's total had looked correct only because his points were
divided by an invented number of minutes. Against the true denominator he was
producing about 7% more per minute than a real star, so shot concentration came
down; scorers in double figures now matches exactly at 5.19.

## A parameter that did nothing, and a projection that double counted

`goalCalibration` scales the NHL regulation draw so that the overtime, shootout
and empty-net goals added on top land the finished score on the projection.
Setting it to 0.70 changed the simulated score by nothing at all: it was applied
only in the season-aggregate fallback, while every shipped simulation takes the
opponent-adjusted fitted path, which ignored it.

Fixing that surfaced a second fault. `predictAnalytic` was resolving ties and
adding a goal for them on top of `expGoals`, which is fitted on real FINAL
scores and therefore already contains every overtime and shootout winner the
league scored. The closed form projected 6.55 goals a game against a real 6.16.
Both now scale the same regulation lambda, and both model the pulled goaltender
in one shared function rather than two copies that had already drifted apart by
half a goal.

## Rest, and the margin cap that was not worth having

Two accuracy ideas were tested walk-forward over 225 configurations.

**Blowout capping does nothing.** Trimming how far a single lopsided result can
move a rating is standard practice and, measured, worth 0.00014 of Brier score
in the NBA and negative in the NHL. `marginCap` remains in `simRatingFit.js`,
defaults to off, and should stay off.

**Rest is real and unusable.** Solving a back-to-back term alongside the ratings
puts it at -1.1 NBA points and -0.23 NHL goals, and applying it improves Brier
in every configuration tested. It is not shipped: the simulator is handed two
teams and no date, so it cannot know whether either played last night. Fitting
the term without applying it is worth nothing (0.21403 against 0.21407), so the
published accuracy is the no-rest figure, which is what production achieves.

The sweep also confirmed the shipped rating parameters are already the best in
the grid: NBA half-life 60 / ridge 6, NHL 150 / 20.

## Fourth pass: the third period, the joint distribution, and the penalty tail

**Hockey separates late, and it does it through the empty net.** Two independent
Poisson(3.08) goal counts give a mean margin of exactly 1.98, which is what the
simulation produced: its margin was pure chance. Real games finish 2.20 apart
while carrying a SMALLER lead into the third (1.43 against a simulated 1.56), so
the separation is made in the third period and not before it.

Redrawing the finishing shock every period to make periods disagree with each
other was tried first, and measured: it moved the lead carried into the third by
0.01 and made two-goal leads finish at 95% of themselves against a real 109%,
because independent periods regress a lead rather than extend it. It was
reverted.

What worked was modelling the empty net as a RATE rather than a coin flip.
Teams pull the goaltender down three as well as down one or two, they pull it
with minutes left rather than seconds, and two empty-net goals in a game is
ordinary. A single Bernoulli capped the margin a third period could add at one
goal:

| | real | before | after |
|---|---|---|---|
| two-goal lead retained | 108.8% | 85.1% | **104.4%** |
| final margin | 2.20 | 1.95 | **2.02** |
| comebacks | 13.9% | 10.4% | **11.6%** |

**Every NBA column matched and the joint distribution did not.** Shot volume moved
with a player's usage for the night; assists and rebounds were dealt from fixed
per-36 rates, so the man with the ball all game was no likelier than usual to
also be setting up team-mates or cleaning the glass. Triple-doubles came out at
0.02 a team-game against a real 0.06 and double-doubles at 0.72 against 0.78.
Usage now carries into both at reduced power, more strongly for assists than
rebounds because both come from having the ball. Double-doubles are now 0.76,
and the leading scorer plays for the winning team 66.5% of the time against a
real 65.4%.

**Penalties had no tail.** One fight at 17% and one brawl at 1.2% gave a standard
deviation of 5.7 against a real 7.6, and a maximum of 65 where real box scores
reach 91. Fights come in runs, and a fighting major often carries a ten-minute
game misconduct. Modelling both, and cutting the frequent standalone misconduct
to keep the mean honest, gives 8.69 penalty minutes against a real 8.72, a
standard deviation of 7.15, and a maximum of 77.

**Turnovers, re-tested against a real target.** An earlier pass moved the ball
movement coupling against a 150-game sample and drew the wrong conclusion. At
1,235 games a turnover edge predicts the winner 61.7% of the time against a
simulated 65.7%. The coupling trades turnover decisiveness against assist
decisiveness, and it now sits where no single relation is more than two standard
errors out.

Request latency, median over forty matchups: NBA 15 ms, NHL 24 ms for a
10,000-simulation request.

## Who is available now changes the projection

The spec asked for injuries. Until now a player listed out was removed from the
rotation, named in the writeup, and changed nothing that mattered: the possession
loop simply rescaled whoever was left until it hit the same team efficiency, so a
side missing its best player returned an identical win probability. Team ratings
are solved from results, and those results were produced by teams that had their
players.

There is no impact metric here and no fitted constant, because neither could be
validated without a history of who was actually available, which the feeds do not
provide. What there is instead is a direct recomputation. In basketball the
possessions a missing player would have used are taken by an average team-mate at
that team-mate's efficiency and his turnovers stop happening; in hockey, where a
team's goals are exactly the sum of what its skaters score, his ice time is taken
by the next man up at that man's rate.

Golden State without Jimmy Butler: 41.2% to 34.0%, projection down 2.1 points.
Colorado without a top scorer: 75.8% to 70.4%, projection down 0.29 goals.

Two deliberate limits, both stated on the pages:

- It counts **scoring and ball security only**. Defence, playmaking and the
  attention a star draws are invisible to it, so it is a floor rather than a full
  accounting.
- A missing player is **never** treated as making his team better. The scoring
  arithmetic does return negatives for inefficient high-usage players, but that
  reflects what the method cannot see, and publishing it would be reporting a
  measurement limit as though it were a finding.

The published accuracy figures are measured on full-strength ratings and do not
include this adjustment.

**This feature is dormant for months of the year, which is how it nearly shipped
broken.** The hockey valuation read `timeOnIcePerGame`, `goals` and
`gamesPlayed` from a snapshot whose fields are `toiPerGame`, `g` and `gp`. Every
missing player was therefore worth exactly zero, and nothing in an August test
run would ever have said so. `tests/sim-availability-test.js` now asserts the
snapshot still carries the fields the valuation reads, that ice time still looks
like seconds, and that an injected absence actually moves the projection.

## Shrinking toward last season, tested and rejected

The ridge pulls every team toward the LEAGUE AVERAGE, which is the right answer
only when nothing is known about them. In October something is known: they played
a full season. Shrinking toward a prior-season prior instead is the obvious fix
and it does not work.

| first three weeks of a season | NBA Brier | NHL Brier |
|---|---|---|
| decay only (shipped) | **0.2211** | **0.2422** |
| prior instead of history | 0.2267 | 0.2455 |
| decay plus prior | 0.2209 | 0.2422 |

Replacing the decayed history with a prior is worse in both sports. Adding a
prior on top of it is worth 0.00006 of Brier score in the NBA and nothing in the
NHL. The existing time decay already carries last season at about the right
weight. `fitRatings` keeps the `prior` and `since` options so the result can be
re-checked; nothing uses them.

## Sixth pass: an ensemble, and the accuracy claim re-verified

### First, does the published number describe the shipped model?

It should have been checked before it was ever published. The accuracy figures
come from a walk-forward over the ridge fit's margins; the site predicts from the
engine's projected margin. Those are two different code paths and nobody had
compared them.

They agree to **0.0000 points over 400 matchups** once the injury adjustment is
zeroed. The only divergence is availability, which is disclosed and excluded from
the measurement by design. The claim is sound.

### Then, what beats the model

Five structural alternatives were run walk-forward against the shipped model.
Four lost:

| variant | NBA Brier vs base | NHL |
|---|---|---|
| logistic instead of normal | +0.00002 | +0.00002 |
| Student t, fatter tails | +0.00120 | +0.00005 |
| two timescales (short + long half-life) | +0.00023 | +0.00019 |
| **margin-damped Elo, blended** | **-0.00044** | +0.00004 |

The winner is an Elo run over the same games, blended 30% into the ridge margin.
Elo is not a better model than the ridge fit and does not replace it; it is a
differently-shaped one. It updates game by game and damps a blowout through the
**logarithm** of the margin, so a forty-point win moves it barely more than a
twenty-point win.

That the two-timescale variant LOST is the informative part. The obvious reading
of "Elo helps" is that it adds recency, and a short half-life ridge fit adds
recency more directly. It made things worse. What Elo contributes is the margin
damping, not the recency. Capping margins inside the ridge fit was tried earlier
and was worth 0.00014 of Brier score; the logarithm is a better-shaped answer to
the same problem.

### Held out, because the settings were chosen by looking

The blend weight and both Elo constants were picked on 2023, 2024 and 2025, then
scored once on 2026, which the choice never saw:

| held-out 2026, 1,235 games | Brier | accuracy | margin MAE |
|---|---|---|---|
| ridge only | 0.20543 | 68.99% | 11.420 |
| blended at the shipped weight | **0.20436** | 68.83% | **11.333** |

Every one of the 72 cells in the tuning grid beat the unblended model, which is
what separates a real effect from a well-chosen one.

Published, walk-forward over 3,701 games:

| | before | after |
|---|---|---|
| accuracy | 66.5% | **67.1%** |
| Brier skill | 0.1528 | **0.1594** |
| calibration error | 0.018 | **0.0154** |
| margin error | 11.261 | **11.096** |

### Basketball only, and that is a finding not a shortfall

The identical test on hockey returned +0.00002 out of sample. A hockey result
carries so little information that a second recency-weighted view has nothing to
add that the ridge fit has not already extracted. The NHL does not use it.

### Two things this could have broken quietly

The calibration layer maps a projected margin to a probability and was fitted on
RIDGE margins. Blended margins are wider, so the old coefficients would have been
applied to a distribution they were never fitted for, quietly miscalibrating
every published probability. They were refitted (a -0.0212 to -0.0307, b 0.13948
to 0.13023), which is where most of the calibration-error improvement comes from.

And a snapshot rebuilt without the Elo block would still load, still work, still
pass every other check, and silently revert to the model the published figure is
no longer describing. `tests/sim-calibration-lock-test.js` now asserts the
snapshot carries Elo ratings for every team AND that they actually reach the
projected margin, rather than merely sitting in the file.

## The NHL engine now plays hockey

### The audit that prompted it

The two sports were in completely different places.

**Basketball was already bottom-up.** Points come out of `playPossession`; the
box score is the product of a real possession loop with earned minutes, coherent
five-man units, stints, foul-outs and garbage time.

**Hockey was not.** `runDetailedGame` called `drawGame` to draw a final score
from a distribution and then dealt goals, assists, shots and penalty minutes to
players until the columns added up. Everything reconciled and none of it had
happened. There was no clock, no manpower state, and penalties were a NUMBER IN
A COLUMN rather than an event that took a player off the ice, which meant a
"power-play goal" was a label applied afterwards rather than a goal scored while
the other side was a man short.

### What replaced it

`services/nhl/nhlEventEngine.js` runs the game forwards. Time advances between
EVENTS, not in ticks: both teams generate shot attempts at a rate that depends on
who is on the ice and what the manpower is, penalties arrive at their own rate,
and the time to the next event is exponential in the sum, which is one logarithm
per event.

A shot attempt resolves into a block, a miss, or a shot on goal, and a shot on
goal into a save or a goal. That single decision is where four box-score columns
come from at once and why they cannot disagree: a blocked shot is a block for the
defender who blocked it, and **saves equal shots against minus goals against
because that is what happened**, not because the subtraction was performed
afterwards to balance a column.

Penalties put a named player in the box for two minutes, which makes it 5-on-4
until it expires or the power play scores. The goaltender comes out when the
clock says so. Overtime is three-on-three, sudden death, and a shootout winner is
credited to the team and to no skater, which is the actual rule.

### Measured against 1,235 real box scores

| | real | event engine |
|---|---|---|
| goals | 3.08 | **3.08** (sd 1.72 vs 1.72) |
| shots on goal | 27.84 | 29.2 |
| shot attempts | 54.0 | 54.8 |
| blocks | 14.20 | 14.6 |
| assists per goal | 1.72 | 1.71 |
| penalty minutes | 8.72 (sd 7.57) | 9.2 (sd 7.49) |
| goalie save % | 89.17 | 89.5 |
| skaters dressed | 18 | **18, always** |
| top ice time | 24.90 | 24.1 |
| lowest ice time | 8.38 | 8.9 |
| empty-net goals a game | ~0.30 | 0.32 |
| out-shooting an opponent wins | 52.1% | **52.2%** |
| overtime share | ~23% | 20.5% |

**Invariant failures across 3,000 team-games: zero.**

### Five bugs the measurements caught

Each of these produced plausible-looking output and was wrong.

1. **Shooter quality was normalised against the roster**, not against the men on
   the ice. Power-play shots come only from the best finishers, so every one was
   quietly multiplied up: power-play goals ran 0.72 a game against a real 0.55.
2. **Lines rotated at the bottom of the event loop**, which every blocked shot,
   missed shot and penalty skipped by `continue`. A line stayed out far too long
   and the busiest skater finished on 31 minutes.
3. **Lines were drawn from a hat rather than rolled.** Independent sampling in
   proportion to each line's share gives the right average and far too much
   spread; over eighty shift changes the top pair could run eight shifts ahead of
   its share by chance, putting skaters past 38 minutes against a real maximum of
   33.4. Handing the next shift to whoever is furthest BEHIND his share is what
   rolling four lines actually is, and it collapsed the tail to real levels.
4. **The same men were on both special teams.** One defenceman took 6.1 minutes
   of a 6.2-minute penalty kill because he was on both units.
5. **A pulled goaltender was read as a power play**, so teams scored on more
   power plays than they were awarded; and the team DEFENDING a six-on-five was
   treated as shorthanded, cutting its shot rate to 0.38 at the exact moment it
   had an open net. Empty-net goals came out at 0.06 a game against a real 0.30.
   Manpower for RATE purposes and manpower for ATTRIBUTION are now separate
   things, because they are.

### One tension worth stating

Real hockey sends 23% of games to overtime where two independent Poissons would
send about 16%, so almost all of the tying comes from score effects. Generating
that through shot VOLUME made the chasing team out-shoot so heavily that
out-shooting predicted LOSING (42.4% against a real 52.1%). Generating it through
CONVERSION does not, and lead growth is left to the empty net, which is where it
comes from in reality.

### Still a rate, and said to be

Hits. There is no puck-level model here that would generate one, so they are
dealt from each player's own per-60 rate over the ice time he actually played.
Because it is scaled by real ice time a man who barely played cannot finish with
six of them, but it is not an event and is not presented as one.

## Conditional realism: what the aggregates were hiding

### The lead-retention metric was not a metric

It was mean(final margin / lead entering the third), as a percentage, over games
with a lead of two or more. It averages a ratio of small integers, so a two-goal
lead finishing plus five contributes 250% and one finishing minus one contributes
-50%. Its standard deviation was 62 on a mean of 109, which is the number telling
you it is mostly noise. **"108.8%" never meant leads grow by 8.8%.**

It is replaced in `scripts/nhl_deep_validation.js` by quantities that mean
something on their own: given a lead of exactly N entering the third, how often
that side wins in regulation, gets caught, or loses; and the mean final
regulation margin. Overtime is excluded so it cannot flatter the answer.

Rebuilding it immediately contradicted the old aggregate. The pooled number said
comebacks were too RARE. Conditioned properly, one-goal leads were being lost
**too often** (14.3% against a real 8.6%) while two-goal leads were caught too
often. The pooled figure had two opposite errors cancelling inside it.

| lead into the third | held | caught | lost | mean final margin |
|---|---|---|---|---|
| 1 goal (463 real) | 59.6% / 57.5% | 31.7% / 31.1% | 8.6% / 11.4% | 1.17 / 1.04 |
| 2 goals (293 real) | 85.7% / 83.4% | 11.6% / 14.2% | 2.7% / 2.4% | 2.25 / 2.19 |
| 3+ (230 real) | 95.2% / 97.4% | 4.3% / 2.2% | 0.4% / 0.4% | 3.66 / 3.68 |

### Overtime was never forced

Regulation ties are the only source of overtime, so that is what is measured:
**real 25.00%, simulated 24.29%.** No target was applied to the overtime rate at
any point; it is what the late-game behaviour produces.

The mechanism that got it there is real. The NHL awards a point for reaching
overtime, so two teams level with minutes left are not playing the same game as
two teams level in the first period: both stop taking risks. The engine had no
notion of this, and it showed exactly where the conditional table looks hardest.
From a one-goal deficit, real teams force a tie 3.7 times for every once they win
in regulation; the simulation managed 2.0, because a side that equalised carried
on and went ahead. Suppressing both teams once the score is level late fixed both
halves at once, and cost nothing elsewhere.

### Tails, against the same season

Comparing simulated 2026 games against a 2023-2026 real pool made the model look
like it produced too many shutouts. It had simulated a different, lower-scoring
season. Matched to 2026:

| | real | simulated |
|---|---|---|
| a side scores 7+ | 6.33% | 6.34% |
| a side scores 9+ | 0.61% | 0.63% |
| margin of 5+ | 5.49% | 5.40% |
| margin of 7+ | 0.76% | 0.78% |
| decided by one goal | 43.22% | 42.55% |
| 1-0 or 0-1 | 1.30% | 1.54% |

### The people, not just the teams

`scripts/nhl_player_validation.js` compares simulated skaters against real ones
by ICE-TIME RANK, which is the only way to line them up without pretending a
simulated player is a particular real person. Ice time tracks within 0.7 minutes
at every one of eighteen ranks. Scoring tails: at least one goal 15.19% real
against 15.37% simulated, two goals 1.73% against 1.58%, three or more 0.20%
against 0.13%. Goaltender workload matches through the 99th percentile (44 shots
against 43) and 40-shot nights occur 4.13% of the time against a real 4.41%.

Stars are stars without being cartoons, and that is now a measured statement.

### Hits: honest about what they are

Hits are the one column with no puck-level mechanism behind them, and that is
said rather than dressed up. Two things were done that do not require pretending
otherwise.

Real teams that OUT-HIT their opponent lose more often than they win (43.1%),
because hitting is what chasing a game looks like. Dealing hits from a flat rate
produced 50.2%, a coin flip, which is the signature of a statistic detached from
the game it came from. Scaling by the share of the game a side actually spent
behind gives 41.2%. And hit counts are the least standardised number in a hockey
box score, varying rink to rink with whoever is recording them, which is why real
team hit totals vary by six a game where a per-player rate model varies by four;
a per-game recording factor applied equally to both teams reproduces that spread
without touching which side out-hit the other.

### Every box score, audited

`tests/sim-box-score-audit-test.js` takes 160 NHL and 160 NBA generated box
scores and checks them line by line: goals against shots, points against goals
plus assists, rebounds splitting, saves against shots faced, the goaltender
facing the other team's shots, power-play goals against power plays awarded, the
line score adding to the final, nobody appearing without ice time, no fractional
penalty minutes, no NaN anywhere, no game ending level. **Zero impossible
combinations.** It runs as a permanent gate.

### Measured and rejected

- **Volume-scaled conversion.** Real NHL goal counts are nearly exactly Poisson
  (4.27% scoreless against a 4.39% benchmark) while real shot counts are
  overdispersed, which implies more shots means worse shots. Feeding realised
  volume back into conversion moved the engine's overdispersion ratio from 1.29
  to 1.23 and cost 4% of the goal mean doing it. Not kept.
- **Concentrated shot selection.** Weighting shot selection more steeply moved
  the puck toward forwards and away from the busiest skater, who is usually a
  defenceman: his shot count fell from 1.73 to 1.58 against a real 2.09.

### Residuals

- Scoreless team-games run 5.9% against a real 4.3%. The engine is about 1.3
  times overdispersed at the low end where real hockey is almost exactly Poisson.
- Hits by ice-time rank run the wrong way. Real hit counts RISE down the lineup
  (0.82 for the busiest skater, 1.51 for the least used); simulated ones fall.
  The per-60 rates carry the right spread, so this is not a hits problem: it is
  that the model's fourth line is not composed of the same players who actually
  finish a real game with the least ice.
- One-goal leads are still lost slightly too often, 11.4% against a real 8.6%.

## The NBA engine, brought to the hockey standard

### Priority 1: the causal chain, audited

The chain is genuinely event-driven. Turnovers happen on a possession and
consume it, and the steal is credited to a named defender. Shooting fouls happen
inside the shot and are what create free throws. Blocks happen on a shot.
Rebounds come from misses, assists from makes, minutes from possessions played.

**One category was not, and it mattered.** Non-shooting fouls were dealt out
AFTER the game: the team's foul total was drawn from a distribution and the
difference from the shooting fouls was sprinkled over the roster. They therefore
happened at no particular time, consumed no possession, and never sent anybody to
the line. In real basketball the fifth team foul of a quarter puts the other side
in the bonus and every non-shooting foul after it is worth two free throws --
about a fifth of all free throws, and the reason the last three minutes of a
quarter do not look like the first nine.

They are now committed by a named defender on a real possession, counted against
that team's total for that quarter, and worth two shots once the quarter's fifth
has been reached. The team foul total is no longer drawn at all:

| | real | before (drawn) | now (emergent) |
|---|---|---|---|
| team fouls | 19.8 | 19.25 | **19.94** |
| team fouls, sd | 4.34 | drawn at 4.0 | **4.63** |
| free-throw attempts | 23.4 | 23.6 | 24.0 |

That change immediately produced two consequences that had to be modelled rather
than clamped. Fouls now concentrate on the five men actually on the floor instead
of being spread over the whole roster, so foul-outs doubled; real coaches do not
wait for a sixth foul, they sit a player in trouble, so the rotation now does
too. And a player who has fouled out can no longer be handed a seventh when a
short bench forces him back on: the whistle goes against the team instead.

### Priority 3: the rotation was flat, and only a by-rank test could see it

Comparing simulated players against real ones by MINUTES RANK, the whole rotation
was too flat: the busiest player scored 17.5 against a real 21.3 while the
thirteenth man scored 2.8 against a real 1.6. Every team total was correct.

Raising the shot-concentration exponent did essentially nothing -- from 1.34 all
the way to 3.0 the top man gained one tenth of a shot. **The problem was never
who shoots within a unit.** Choosing a block of the rotation and filling around
it produced genuine all-reserve lineups, and when five reserves are on the floor
somebody has to shoot: they took a full team's worth of shots at a full team's
rate. Real coaches stagger their best players precisely so that cannot happen.

| minutes rank | real MIN / PTS | before | after staggering |
|---|---|---|---|
| 1 | 35.4 / 21.3 | 34.9 / 17.5 | 34.8 / **18.3** |
| 5 | 26.5 / 11.9 | 26.0 / 12.7 | 26.8 / 13.1 |
| 10 | 8.9 / 3.0 | 9.3 / 4.0 | 8.7 / **3.1** |
| 13 | 4.0 / 1.6 | 6.0 / 2.8 | 5.1 / **2.0** |

### The tails set the limit, not the means

With staggering in place the concentration exponent finally bit, and pushing it
to 2.35 brought the busiest player's scoring to 19.7. It also produced this:

| % of player-games | real | at concentration 2.35 |
|---|---|---|
| scored 40 or more | 0.497 | 2.412 |
| scored 50 or more | 0.064 | 0.754 |
| scored 60 or more | 0.007 | 0.221 |
| took 25 or more shots | 1.047 | 4.573 |
| scoreless in 15+ minutes | 1.601 | 4.374 |

Thirty times the real rate of sixty-point games, and role players going scoreless
three times too often at the other end. That is the cartoon the by-rank means
were quietly asking for. The exponent went back to 1.34:

| % of player-games | real | simulated |
|---|---|---|
| scored 30 or more | 3.534 | 3.500 |
| scored 40 or more | 0.497 | 0.620 |
| scored 50 or more | 0.064 | 0.069 |
| scored 60 or more | 0.007 | 0.006 |
| 20 or more rebounds | 0.097 | 0.121 |
| a double-double | 7.162 | 7.156 |
| 0 for 8 or worse | 0.097 | 0.134 |
| scoreless in 15+ minutes | 1.601 | 1.658 |

The busiest player therefore still scores 18.3 against a real 21.3. That is a
stated trade, not an oversight: real star scoring comes from efficiency and
minutes rather than from taking a larger share of a lineup's shots, and forcing
the share is what breaks the distribution.

### Residuals

- The busiest player scores 18.3 against a real 21.3, and the fourth through
  sixth men about a point more than real ones. Closing it through shot share
  destroys the scoring tails, as measured above.
- Triple-doubles 0.29% against a real 0.51%, and 15-assist games 0.22% against
  0.135%.
- Steals 7.66 against 8.4 and blocks 4.34 against 4.83.

### Still to do at the hockey standard

Comebacks by deficit and quarter, lead retention by lead size, team-tier
identity checks, team-level tails, and an NBA walk-forward holdout on box-score
distributions. The conditional harness that did this for hockey
(`scripts/nhl_deep_validation.js`) has no NBA counterpart yet.

## NBA conditional validation

`scripts/nba_deep_validation.js` is the basketball counterpart to the hockey
harness: everything is conditioned on where the game actually is, and everything
is measured to the end of REGULATION so overtime cannot flatter it.

### Overtime came from manufactured ties

The clutch model exists to let a trailing team tie the game on the last
possession, and it was doing too much of it. Simulated games finished level 6.28%
of the time against a real 4.39%, and the signature was visible in the lead
tables rather than in the overtime rate: every "caught" cell ran high while every
"lost" cell ran low. The trailing side was tying games it should have been
winning or losing outright. Overtime is now **4.01% against a real 4.39%**, and
it was reached by fixing the last-possession rate rather than by aiming at the
overtime number.

### Lead entering the fourth quarter (real / simulated)

| lead | n | held | caught | lost | mean final margin |
|---|---|---|---|---|---|
| 1-5 | 324 | 58.3% / 58.5% | 8.0% / 7.3% | 33.6% / 34.2% | 3.06 / 2.74 |
| 6-10 | 283 | 73.9% / 80.4% | 5.7% / 4.1% | 20.5% / 15.4% | 6.58 / 7.73 |
| 11-15 | 217 | 89.4% / 89.6% | 3.2% / 2.8% | 7.4% / 7.6% | 12.15 / 12.61 |
| 16-20 | 166 | 97.6% / 96.2% | 1.2% / 1.3% | 1.2% / 2.5% | 17.05 / 17.52 |
| 21+ | 210 | 100.0% / 99.7% | 0.0% / 0.2% | 0.0% / 0.2% | 26.60 / 24.73 |

### Tails

| | real | simulated |
|---|---|---|
| a team under 90 | 3.81% | 4.14% |
| a team 130 or more | 25.02% | 23.77% |
| a team 140 or more | 5.91% | 5.58% |
| won by 20 or more | 22.83% | 22.83% |
| won by 30 or more | 7.77% | 6.55% |
| won by 40 or more | 1.62% | 1.38% |
| decided by 3 or fewer | 14.57% | 14.51% |

Team scoring by band matches within 1.6 points of a percent everywhere, and the
under-90 band is exact.

### Do teams stay themselves?

A model can reproduce every league-wide distribution while flattening the teams
inside it. Every team plays all twenty-nine others home and away, so the only
thing that differs is the team:

| | correlation with the team's own | spread |
|---|---|---|
| offensive rating | 0.840 | 14.8 vs real 13.6 |
| pace | 0.981 | 7.1 vs real 8.3 |
| three-point share | 0.966 | |

The first version of this test gave each team a DIFFERENT rotation of opponents
and reported 0.526 for scoring, which measures the schedule rather than the
model. It also compared a three-point COUNT against a three-point SHARE, which
re-measures pace. Both were harness bugs, and both had to be fixed before the
numbers meant anything.

The correlation being 0.840 rather than 1.0 is correct: the engine scores from
opponent-ADJUSTED ratings while the comparison is against raw season ratings, so
a perfect correlation would mean the schedule adjustment was doing nothing.

### Three-point identity was an accident

`shotProfile` computes a team's three-point share and the possession loop never
consulted it. Whether a shot was a three came from the shooter's own rate alone,
so a team's realised share emerged as a by-product of which of its players
happened to take the shots, and correlated 0.65 with what that team actually
does. A multiplier is now solved once per side so the rotation's shot-weighted
average lands on the team's own rate: **0.65 to 0.966**, with three-point
attempts landing at 37.3 against a real 36.9.

Who shoots a three is still the player. How many the team shoots is now the team.

### Residuals

- Leads of 6-10 entering the fourth are too safe: held 80.4% against a real
  73.9%. Reducing the margin-reversion strength was tried and made mid-size leads
  safer still while inflating their final margins, so it was reverted.
- A 21-point lead finishes at 24.7 against a real 26.6.
- Team field-goal percentage 46.5 against a real 47.2.

## Fourth-quarter shot selection

The engine already made a trailing team hunt threes -- in the last five
possessions, and only when it was one to five points down. A side eight down with
ten minutes left played exactly like a side eight up.

That is not basketball, and a conditional table is where it shows: a lead of six
to ten entering the fourth was held 80.4% of the time against a real 73.9%,
because the trailing team never reached for the variance that turns those games.
Threes are the variance. Raising the share a trailing side takes barely moves its
expected points -- a three is worth more and goes in less -- which is exactly why
it works: it widens the distribution of fourth quarters without making comebacks
free.

Shot selection now responds to the scoreboard from the start of the fourth, at
half strength in the third, scaled by deficit.

| lead entering the fourth | held (real / sim) | lost (real / sim) |
|---|---|---|
| 1-5 | 58.3% / 56.3% | 33.6% / 35.6% |
| 6-10 | 73.9% / **76.5%** (was 80.4%) | 20.5% / **17.1%** (was 15.4%) |
| 11-15 | 89.4% / 89.9% | 7.4% / 7.5% |

**It also had to be prevented from double counting.** A team's SEASON three-point
share already contains every fourth quarter it played while trailing, so applying
the boost on top of the season rate counts those possessions twice: attempts went
to 38.6 a game against a real 36.9. The base share was lowered to absorb it, and
attempts now land at 36.6.

Nothing else moved: the leading scorer's tails held (40-point games 0.64% against
a real 0.50%, 60-point games 0.009% against 0.007%), double-doubles 7.21% against
7.16%, and seven-three games improved to 0.63% against a real 0.63%.

## Are the columns RELATED, or merely right?

Every marginal average in the basketball engine matches. That is not the same as
the box score being real. A model that sampled each column independently from the
correct distribution would pass every average test in this repository and still
produce games where a team took ninety shots and grabbed no rebounds off the
misses.

`scripts/nba_correlation_audit.js` measures the structural relationships on 2,468
real team-games and on simulated ones. Possessions are estimated the standard way
for both sides, so nothing depends on the engine's own count.

| relationship | real | simulated |
|---|---|---|
| possessions to shot attempts | 0.632 | 0.702 |
| possessions to points | 0.484 | 0.456 |
| missed shots to opponent defensive rebounds | 0.654 | 0.728 |
| made field goals to assists | 0.699 | 0.625 |
| opponent fouls to own free-throw attempts | 0.802 | 0.830 |
| turnovers to points | -0.146 | -0.165 |
| effective field-goal percentage to points | 0.693 | 0.624 |
| opponent turnovers to own steals | 0.800 | 0.749 |
| three-point attempts to points | 0.172 | 0.215 |

Every relationship lands within 0.09, most within 0.05.

### Turnovers make possessions, they do not only destroy them

A live-ball turnover is a possession that ended early AND a transition chance for
the other side, so a sloppy game fits more possessions into the same forty-eight
minutes. The engine drew its possession count before tip-off and held it fixed,
which made every turnover a pure loss: turnovers correlated with points at -0.302
against a real -0.146, twice as punishing as real basketball.

Ball movement already drives the turnover rate, so the possession count is now
nudged by the same quantity, centred so the average game is unchanged. Turnovers
to points went to **-0.165**, possessions to shot attempts from 0.579 to 0.702
against a real 0.632, and the spread of team shot attempts from 7.66 to 7.95
against a real 7.89.

### The fourth-quarter three-point boost: measured and rejected

A trailing team really does hunt threes, and modelling it really did improve the
weakest thing in the engine: a lead of six to ten entering the fourth went from
being held 80.4% of the time to 76.5%, against a real 73.9%.

It was not worth what it cost. How many threes a team takes and how many points
it scores correlate at +0.172 in real basketball and +0.162 in this engine
without the boost -- essentially exact. Switching it on drove that to **+0.016**,
because nearly all the game-to-game variation in three-point volume became "this
team is losing". Making it time-dependent inside the quarter, and scaling it down
repeatedly, only moved along the same trade: at its best it bought 1.4 points of
lead realism for 0.094 of a real, measurable box-score correlation.

The six-to-ten residual needs the mechanism it actually comes from, which is
PACE. Real trailing teams play faster and generate more possessions, so they get
more threes AND more points, which is exactly why the real correlation survives.
The engine allocates possessions per quarter before the quarter is played, so
doing that properly means making the allocation respond to the score without
moving the game total. That is a separate piece of work, not a constant to turn
up, and the boost is left off until it is done.

## Pace was the mechanism all along

The six-to-ten lead residual had resisted two attempts through shot selection,
and both failed the same way: raising a trailing team's three-point share made
three-point volume mean "this team is losing" and destroyed the real relationship
between threes and points.

Pace does not have that problem, and it is where the effect actually comes from.
A close fourth quarter runs long because the clock keeps stopping. A decided one
runs short in the sense that matters: benches are in, the urgency is gone. More
possessions for BOTH teams widens the distribution of fourth quarters without
handing the trailing team free points, which is precisely the shape the
conditional table was asking for.

| lead entering the fourth | held (real / sim) | lost (real / sim) |
|---|---|---|
| 1-5 | 58.3% / 57.4% | 33.6% / 35.5% |
| 6-10 | 73.9% / **74.9%** | 20.5% / **21.4%** |
| 11-15 | 89.4% / 91.0% | 7.4% / 7.4% |
| 21+ | 100.0% / 99.5% | 0.0% / 0.0% |

And the relationship it was previously destroying is intact: three-point attempts
to points, **real +0.172, simulated +0.164**.

The fourth quarter's length now depends on the score, so `result.possessions`
reports what was PLAYED rather than what was planned. Those were the same number
until this change and are not any more.

### Where the remaining correlation gaps went

`minutes to shot attempts` was 0.684 against a real 0.783. Two levers were tried
and measured. Raising shot concentration made it WORSE (0.658) and blew the
scoring tails open at the same time -- forty-point games nearly doubled. Reducing
the per-game usage noise improved it to 0.717 but drained the tails the other way,
thirty-point games falling to 2.82 against a real 3.53. It sits at 0.185, which
holds the tails and takes the correlation to 0.700.

### Final correlation table

| relationship | real | simulated |
|---|---|---|
| possessions to shot attempts | 0.632 | 0.694 |
| made field goals to assists | 0.699 | 0.635 |
| opponent fouls to own free-throw attempts | 0.802 | 0.826 |
| turnovers to points | -0.146 | -0.190 |
| effective field-goal percentage to points | 0.693 | 0.644 |
| opponent turnovers to own steals | 0.800 | 0.759 |
| opponent shot attempts to own blocks | 0.272 | 0.268 |
| three-point attempts to points | 0.172 | 0.164 |

### Individual tails

| % of player-games | real | simulated |
|---|---|---|
| scored 30 or more | 3.534 | 3.242 |
| scored 40 or more | 0.497 | 0.493 |
| scored 50 or more | 0.064 | 0.074 |
| scored 60 or more | 0.007 | 0.007 |
| a double-double | 7.162 | 6.934 |
| scoreless in 15+ minutes | 1.601 | 1.472 |

### Walk-forward holdout

Ratings fit only on games already played, calibration fitted only on earlier
seasons, 3,701 games:

| | |
|---|---|
| winner accuracy | 67.06% |
| Brier | 0.20823 |
| Brier skill | 0.1594 |
| log loss | 0.6031 |
| calibration error | 0.0154 |
| margin MAE | 11.096 |
| total MAE | 15.174 |

By season: 62.3%, 65.3%, 66.9%, 69.0% as the ratings mature.

### Team identity

| | correlation with the team's own | spread |
|---|---|---|
| offensive rating | 0.861 | 13.8 vs real 13.6 |
| three-point share | 0.950 | |
| pace | 0.939 | 7.1 vs real 8.3 |

### Residuals

- Teams under 90 points occur 4.9% of the time against a real 3.8%. Real
  basketball scoring is right-skewed -- a long high tail and a short low one --
  and the engine's distribution is more symmetric than that.
- Triple-doubles 0.29% against a real 0.51%.
- A 16-20 point lead entering the fourth is lost 3.8% against a real 1.2%, on a
  real sample containing two such games.

## Garbage time, and where scoring variance is allowed to come from

Two residuals turned out to be the same problem seen from different ends: teams
finished under ninety points too often (4.9% against a real 3.8%) and reached a
hundred and thirty too rarely. Real NBA team scoring is right-skewed -- a long
high tail and a short low one -- and the engine's distribution was more
symmetric than that.

**Being decided changed who was on the floor and nothing about how the game was
played.** A blown-out fourth quarter was contested exactly as hard as a tied one.
Real garbage time is not: nobody helps, nobody rotates, and both offences score
freely, which is what puts a floor under a beaten team's score. Modelling that
moved teams under ninety from 4.9% to 3.98% and games with a side past a hundred
and thirty from 20.5% to 24.5%, and the scoring mean landed exactly on the real
115.34.

An asymmetric version -- the trailing side getting the larger share, which is
what really happens -- was tried and rejected. It compresses the margin
systematically, and the possession loop drifted 0.85 points away from the
projection printed beside it. A final score that leans away from its own win
probability is the one thing a visitor can see is broken.

### The variance had to come from inside the game

Widening the scoring distribution and loosening the leads pulled against each
other for several rounds. Supplying the width through per-game team FORM did the
first and broke the second, because a persistent multiplier means a team shooting
well shoots well all night and its lead never moves: a six-to-ten point lead
entering the fourth was held 80.5% of the time against a real 73.9%.

Real basketball gets its width from WITHIN the game -- quarters differ -- and
`QUARTER_REVERSION` was actively suppressing exactly that, pulling each quarter's
efficiency back toward the game's expectation. Reducing it from 0.38 to 0.18
fixed both at once:

| | before | after | real |
|---|---|---|---|
| team scoring spread | 12.36 | **13.04** | 13.61 |
| a team under 90 | 3.25% | **3.78%** | 3.81% |
| a team 130 or more | 22.5% | **25.1%** | 25.0% |
| 6-10 lead held | 80.5% | **76.7%** | 73.9% |

Overtime landed at **4.39% against a real 4.39%**.

Pushed further to 0.08 the scoring spread improved again (13.45) and both the
under-ninety rate and the leads got worse, so it sits at 0.18.

### Assists track makes more closely

The assist rate carried a per-game execution term at full strength, which added
variance to the assist column beyond what the makes explained: made field goals
to assists correlated 0.632 against a real 0.699. At a reduced exponent it is
0.671, with the assist total and its spread both still on target.

### Margin agreement, measured properly

The guard in the realism test reported a 0.645-point drift, which is 1.7 standard
errors on the 1,200 games it runs. Measured over 21,000: **-0.089, plus or minus
0.199**. Indistinguishable from zero.

## Loose ends

### One command gates the whole thing

Five test files and six measurement harnesses validate these engines, and knowing
which to run after a given change turned out to be its own failure mode. Several
real defects here were found only because a harness nobody would have thought to
run happened to be run: a rotation change broke the scoring tails, a three-point
change broke a correlation, a garbage-time change broke the margin agreement.

    npm run validate:simulators          the five tests, about ten seconds
    npm run validate:simulators:full     plus every distribution harness

The tests assert and fail. The harnesses print distributions for a human to read,
because "does this look like basketball" is not a question a threshold can answer
and pretending otherwise produces a number nobody trusts.

### Variance has to be put in the right place

Lowering `QUARTER_REVERSION` to widen the scoring distribution had a cost that
went unmeasured at the time: it widened MARGINS with it. Games won by twenty or
more ran at 26.35% against a real 22.83%, and close games thinned out to match.

Within-game efficiency variance is independent per team, so it widens the gap
between them. Pace variance is SHARED -- both sides play the same number of
possessions -- so it widens totals and leaves margins alone. Moving some of the
width from the first to the second fixed the margin distribution without giving
back the scoring distribution:

| | before | after | real |
|---|---|---|---|
| team scoring spread | 13.22 | 13.42 | 13.61 |
| won by 20 or more | 26.35% | 25.05% | 22.83% |
| won by 30 or more | 8.29% | **7.77%** | 7.77% |
| won by 40 or more | — | 1.76% | 1.62% |
| a team 130 or more | 25.35% | 25.70% | 25.02% |

### Dead code removed

The NHL's draw-and-deal implementation was kept after the event engine replaced
it, so the two could be compared. That comparison is recorded above, and leaving
three hundred lines that FABRICATE a box score sitting beside the engine that
generates one is an invitation to read the wrong thing as current behaviour. It
is gone, along with the basketball engine's after-the-fact foul allocator, which
stopped being called when non-shooting fouls became real possession events.

### The snapshot build was never actually run

`scripts/build_nba_snapshot.js` gained an Elo block when the ensemble was added,
and nothing had executed it -- the ratings shipped by backfilling the existing
snapshot. A broken build path would only have surfaced at the next rebuild. It
was exercised against the cached results and produces thirty rated teams over
3,693 games, with All-Star sides (STARS, WORLD, STRIPES) removed by the same
allow-list that keeps exhibition teams out of the ridge fit -- the identical
contamination the NHL fit once picked up from the 4 Nations Face-Off.

## Shot volume, and a calibration that had gone stale

The NHL engine was producing 29.5 shots on goal a game against a real 27.8. The
attempt rate is normalised by the expected mix of even strength, power play and
penalty kill -- and third-period score effects, the pulled goaltender and
three-on-three overtime had all been added SINCE that normalisation was written.
Each raised shot volume a little and none of them was in it.

Correcting the volume then dropped scoring from 3.10 goals a side to 2.90, which
exposed a second and more structural problem: **conversion was being solved
against the raw attempt rate while the game was played at the adjusted one.** Any
change to shot volume therefore moved the goal total with it. Solving against the
rate the engine will actually shoot at makes the two independent -- volume can be
recalibrated without touching goals, because conversion rises exactly as far as
volume falls.

The shot-on-goal share was wrong too. Real teams put 27.84 shots on goal from
54.0 attempts, which is 0.516, not the 0.53 assumed. It only showed in the one
column that depends on the opponent's ATTEMPTS rather than its shots: blocks came
out at 13.6 against a real 14.2.

| | before | after | real |
|---|---|---|---|
| shots on goal | 29.51 | **27.82** | 27.84 |
| shot attempts | 55.34 | 53.68 | 54.0 |
| blocks | 14.32 | 13.88 | 14.20 |
| goalie save % | 89.83 | **89.12** | 89.17 |
| goals | 3.10 | 3.11 | 3.08 |

### A level game is neutral, not "not behind"

Penalties lean by game state: a trailing team draws more of them. The test for it
was `goals < theirs`, which treats a TIED game as ahead and applied the full
multiplier to it. Hockey games are level a great deal of the time, so the average
multiplier came out well above one and both sides took more penalties than their
own rate: 3.40 power plays a game against a real 3.10. Level is now neutral, and
it is 3.22.

### Six rivalries are not a league

The NHL realism test drew its sample from BOS/MTL, NYR/PIT, EDM/CGY and three
more of the same kind. Their combined penalty rates run half again the league
average, so the penalty-minute band -- a LEAGUE-wide figure -- was being judged on
a sample chosen for being unrepresentative of it. The engine produced 8.83
penalty minutes a game across the league against a real 8.72 while the test read
10.05 and failed. The sample is now twelve pairs spread across the league.

This is the second time an underpowered or biased sample in a test produced a
false signal; the first was the basketball overtime band. Both were the test
being wrong, not the engine.

### The basketball margin body

Games won by twenty or more ran at 25.05% against a real 22.83%, with close games
correspondingly thin. Strengthening the pull toward the projected margin fixed
the body without touching the tails or the scoring distribution, and improved the
six-to-ten lead bucket at the same time:

| | before | after | real |
|---|---|---|---|
| won by 20 or more | 25.05% | **23.27%** | 22.83% |
| a team 130 or more | 25.70% | 25.91% | 25.02% |
| a team under 90 | 4.44% | 4.10% | 3.81% |
| 6-10 lead held | 77.7% | **75.0%** | 73.9% |

### The efficiency solver was not converging

`solveShotMultiplier` solves a shot multiplier so the possession loop delivers
the efficiency the ratings asked for, and it ran three passes with a tight clamp.
Across all thirty teams what the loop delivered differed from what it was asked
for by up to 3.8 points per hundred possessions in both directions -- a weak
offence outscoring its own rating and a strong one falling short of it. Ten
passes and a wider clamp; it runs once per side per game, not once per
possession, so the extra work is free.

Some of the residual difference is not error at all. A team being blown out
genuinely outscores its rating, because it spends the fourth quarter playing
against a bench that cannot guard anybody, and the garbage-time model reproduces
that on purpose.

## A statistic that was measuring the sample

The team-identity check reported the RANGE of simulated offensive ratings across
the thirty teams, and that range came out at 11.0 or 17.6 depending only on the
random seed. Max minus min over thirty noisy team means inherits the noise of
both extremes: at fifty-eight games a team, the standard error on its mean is
about 1.6 points, so the range carries several points of pure sampling noise.

I had spent time chasing a "compression" that this number appeared to show. There
was none. Measured with a stable statistic and three times the games:

| | simulated | real |
|---|---|---|
| offensive rating, correlation | 0.870 | |
| offensive rating, spread (sd) | 2.99 | 3.22 |
| pace, correlation | 0.962 | |
| pace, spread (sd) | 2.13 | 2.09 |
| three-point share, correlation | 0.962 | |

Teams keep 93% of their real differentiation. The range statistic is gone.

## A rout does not correct itself

Reverting a game's margin toward its projection at full strength, regardless of
how far it had run away, damped exactly the games that produce real blowouts.
Wins by twenty landed correctly while wins by THIRTY came out at 6.5% against a
real 7.8%: the upper tail was decaying too fast relative to the body.

Real basketball is not like that. A modest lead over expectation is mostly luck
and mostly gives itself back; a twenty-five point lead in the third is a team
that has stopped competing, and it tends to get worse. The pull now holds at full
strength until the margin is well past expectation and then fades.

Fading it from zero instead was tried first and pushed every band up at once --
wins by twenty went to 26.3% -- because it weakened the pull on ordinary leads
too. It has to hold before it fades.

| | before | after | real |
|---|---|---|---|
| won by 20 or more | 25.05% | **22.58%** | 22.83% |
| won by 30 or more | 6.50% | 6.77% | 7.77% |
| won by 40 or more | 1.38% | **1.62%** | 1.62% |
| decided by 3 or fewer | 13.57% | 14.32% | 14.57% |
| a team under 90 | 4.44% | **3.93%** | 3.81% |
| a team 130 or more | 25.70% | 25.45% | 25.02% |
| total of 250 or more | — | 18.30% | 18.06% |
| 6-10 lead held | 77.7% | **74.7%** | 73.9% |

Margin agreement re-measured over 21,000 games: **-0.118, plus or minus 0.186**.

## A big night and a long night go together

Usage for the game was drawn independently of minutes, so the man carrying the
offence was no likelier than anyone else to still be on the floor. Real
basketball does not separate those: a player who has it going stays out there,
and one who cannot buy a basket sits.

This was the last thing holding down two figures that had resisted every direct
attempt to fix them. Shot concentration and usage noise had each been tried and
each broke the scoring tails. Drawing usage FIRST and letting it earn minutes,
then renormalising the rotation back to its 240, moved all of them at once:

| | before | after | real |
|---|---|---|---|
| minutes to shot attempts (r) | 0.705 | **0.726** | 0.783 |
| minutes to points (r) | 0.652 | 0.671 | 0.730 |
| busiest player, points | 18.3 | **19.5** | 21.3 |
| busiest player, shot attempts | 14.1 | **14.8** | 15.6 |
| leading scorer, points | 27.17 | **27.56** | 27.48 |
| leading scorer, spread | 6.74 | **6.81** | 6.84 |
| 40-point games | 0.529% | 0.519% | 0.497% |
| triple-doubles | 0.289% | 0.315% | 0.505% |

Going further -- shifting usage OUT of shot selection entirely so a heavy night
arrived only as minutes -- was tried and rejected: forty-point games collapsed
from 0.52% to 0.33%, and the competition metric it was aimed at got worse rather
than better.

## The pull toward a point ramps; it does not switch on

The model that makes two level teams stop taking risks late was a hard threshold
at the last ten minutes, so a game levelled at minute forty-five was played
exactly as openly as one levelled in the first period. Caution grows as the clock
runs down, which is what a point being at stake actually feels like.

| lead into the third | held (real / sim) | caught | lost |
|---|---|---|---|
| 1 goal | 59.6% / **59.3%** | 31.7% / 28.3% | 8.6% / 12.4% |
| 2 goals | 85.7% / **84.9%** | 11.6% / 12.4% | 2.7% / **2.7%** |
| 3+ | 95.2% / **95.2%** | 4.3% / 4.2% | 0.4% / 0.6% |

Regulation ties, which are the only source of overtime, sit at 24.28% against a
real 25.00%.

The one-goal row is worth reading carefully. The TOTAL comeback rate from a goal
down -- tie or win -- is 40.7% against a real 40.3%. What is wrong is only the
split between them: the engine's trailing team, having equalised, goes on to win
more often than a real one does.

## The NHL engine as it now stands

| | simulated | real |
|---|---|---|
| goals | 3.08 | 3.08 |
| shots on goal | 27.86 | 27.84 |
| penalty minutes | 8.74 | 8.72 |
| blocks | 14.00 | 14.20 |
| goalie save % | 89.28 | 89.17 |
| power plays | 3.25 | 3.10 |

Invariant failures across 3,000 team-games: zero.

## The claw-back should take back luck, not quality

The margin distribution had a hole in it. Wins by twenty came out at 22.88%
against a real 22.83% and wins by forty at 1.68% against a real 1.62%, both
essentially exact, while wins by THIRTY sat a full point low at 6.77% against
7.77%. The body was right and the extreme tip was right, with a gap between them.

Every attempt to fill it from the runaway model failed, and failed in a way that
said the model was not where the problem was. Easing the pull off sooner lifted
the thirties and the forties together. Holding it on longer dropped both. The
ramp could move the whole tail up or down but could not change its shape.

The actual defect was in what the claw-back was measuring. It compared the
scored margin against an expectation built from the season ratings alone, so a
team having a genuinely flat night looked like a team getting unlucky, and got
pulled back up all game long. The engine draws a team shooting night at tipoff.
That night is part of the matchup from the moment it is drawn; it is not noise to
be corrected.

Once expectation accounted for it, the claw-back was only fighting luck, which
meant it could be much stronger without flattening anything real:

| | before | after | real |
|---|---|---|---|
| won by 20 or more | 22.88% | **22.96%** | 22.83% |
| won by 30 or more | 6.77% | **7.01%** | 7.77% |
| won by 40 or more | 1.68% | **1.60%** | 1.62% |
| a team 130 or more | 25.70% | **25.16%** | 25.02% |
| a team 140 or more | 6.47% | **6.34%** | 5.91% |
| a team under 90 | 4.03% | 4.20% | 3.81% |

Five of the six improved and the margin projection stayed unbiased at -0.02
points over 1,200 games. Thirty-point wins remain the residual, now three
quarters of a point low rather than a full point.

A second idea was tried and discarded on the way: a rare no-show night drawn as
an extra one-sided deficit, on the theory that a flat night has no equivalent on
the upside. It fattened the thirties, but it fattened the twenties and the
forties by as much, so it bought nothing that the reversion fix did not buy more
cleanly, and it was removed rather than left in at a token weight.

## What actually decides a basketball game

Correlation says the columns move together. It does not say how much each of them
DECIDES the result, which is the thing an independently sampled box score gets
most wrong and the thing a bettor is actually buying. This is now a permanent
section of the correlation audit rather than something measured by hand:

| the game is won by | real | simulated |
|---|---|---|
| the better effective field-goal percentage | 81.3% | 79.9% |
| the lower turnover rate | 60.9% | 62.8% |
| the better offensive rebounding rate | 60.5% | 60.9% |
| the better free-throw rate | 55.6% | 55.9% |

Shooting dominates the other three by twenty points in real basketball and the
engine reproduces both the ordering and very nearly the gaps. Turnovers are
about two points too decisive.

## A triple-double is one night, not three coincidences

Triple-doubles came out at 0.308% of player-games against a real 0.505%. Every
attempt to fix that by making any single column bigger failed, and the reason
turned out to be visible the moment the joint was broken into its three pairs:

| | simulated | real |
|---|---|---|
| 10 points and 10 rebounds | 5.87% | 5.73% |
| 10 points and 10 assists | 1.77% | 1.93% |
| **10 rebounds and 10 assists** | **0.32%** | **0.51%** |

Two of the three pairs were already right. The whole shortfall was the player who
does both of the non-scoring things, and it was hiding behind marginals that were
if anything too GENEROUS: twenty-rebound games ran at 0.176% against a real
0.097% and fifteen-assist games at 0.171% against 0.135%. Too much of each column
on its own and not enough of the two together is the exact signature of
independent sampling, and no amount of moving the columns can fix it.

Two things were wrong.

**A player cannot assist his own basket, and his rate already knows that.** The
passer is drawn from the four team-mates who did not shoot. That is correct
basketball, and it was quietly taxing the best player on the floor: he is removed
from the pool in proportion to how often he shoots, far more often than anyone
else, while being weighted by a per-36 assist rate that is real production and
therefore already has that exclusion inside it. The penalty was applied twice.
Weighting by one over one-minus-his-share-of-team-shots restores exactly what the
double count removed and leaves an average-usage player untouched.

**Rebounds and assists were dealt with separate noise.** A single per-game
involvement factor now scales both, so being all over the game is one state
rather than two coincidences, and the concentration exponents came down to pay
for the width it adds.

| | before | after | real |
|---|---|---|---|
| 10 rebounds and 10 assists | 0.32% | **0.49%** | 0.51% |
| a triple-double | 0.308% | **0.425%** | 0.505% |
| a double-double | 7.39% | **7.12%** | 7.16% |
| 20 or more rebounds | 0.176% | **0.119%** | 0.097% |
| 15 or more assists | 0.171% | **0.158%** | 0.135% |

Every one of the five improved at once, which is what a structural fix looks
like as against a tuned one. The pair-level breakdown is now a permanent part of
the player harness, because it is the thing that would have found this in an
afternoon rather than a day.

Tried and rejected on the way: raising the usage exponents on assists and
rebounds (moved the joint by 0.01 and cost the marginals), and lowering assist
concentration to spread assists toward secondary playmakers (collapsed
fifteen-assist games from 0.171% to 0.080% and made triple-doubles worse, not
better).

## A rotation tilts, and tilting costs something

The busiest player's minutes varied by 3.7 against a real 4.3, because minutes
were drawn with independent per-player noise: a starter on thirty-six and a sixth
man on twenty-four had spreads wide enough to cross each other, so the order
reshuffled far more than a real rotation does.

Real rotations TILT. Some nights a coach shortens the bench and every starter is
up together, some nights the game gets away and they all sit; the order almost
never changes. Replacing most of the independent noise with a single tilt per
team-game fixed the spread immediately, and quietly broke three team-level
numbers at once. Wins by thirty fell from 7.01% to 6.55%, a team reaching 140
rose from 6.34% to 7.18%, and scoring needed a correction it had not needed
before.

The reason is that a tilt is not free. Playing the bench more hurts more than
playing the starters more helps, because the rotation curve is concave, so a
symmetric tilt is a net loss in expectation. Every team got slightly worse and
slightly more alike.

Kept at a third of the strength it was first tried at, with the idiosyncratic
part restored, it buys most of the spread and costs almost none of it:

| | before | after | real |
|---|---|---|---|
| busiest player, minutes spread | 3.7 | **3.9** | 4.3 |
| a team under 90 | 4.20% | **3.79%** | 3.81% |
| a team 130 or more | 25.16% | **24.83%** | 25.02% |
| a team 140 or more | 6.34% | **6.04%** | 5.91% |
| won by 20 or more | 22.96% | **22.72%** | 22.83% |
| won by 30 or more | 7.01% | 6.82% | 7.77% |
| won by 40 or more | 1.60% | **1.57%** | 1.62% |

Two other things were tried against the busiest player's scoring, which sits at
19.8 points against a real 21.3, and both were rejected. Raising shot
concentration lifted him to 20.0 and blew the tails open: forty-point games went
to 0.824% against a real 0.497% and fifty-point games to 0.111% against 0.064%.
Concentration adds SPREAD, not level, and the real star scores twenty-one
reliably rather than thirty-five sometimes. Cutting usage noise to compensate
took him down to 18.9 instead, because usage is what earns him the minutes in the
first place.

## Coaches double-shift, and the thirteenth forward sits

Hits ran the WRONG WAY down the lineup. In real box scores the busiest skater
records 0.82 of them and the least busy 1.51, because hitting is what depth
players are dressed to do; the engine had 1.12 at the top and 0.65 at the bottom,
which is the pattern you get when hits follow ice time rather than the player.

The rates were not the problem. The feed grades them steeply -- 2.45 per sixty on
a first line against 6.76 on a fourth -- and the engine deals them from those
rates honestly. The problem was that the wrong men were at the bottom of the
ice-time table.

Linemates share shifts, so the three forwards on a line finish a simulated game
on the same ice time. Real fourth lines do not work out that way. A coach drops
the least trusted forward on the unit and sends a top-six player over the boards
in his place, which is why the lowest ice time in a real box score belongs to a
specific kind of player rather than to whichever fourth-liner the rotation
happened to land on.

Identifying him needed a signal, and season ice time turned out to be too noisy
to pick a man out of a fourth line: it found someone hitting at 7.52 per sixty
when the target was 10.8. Hitting itself is the only role signal the feed carries
for a forward, and using it produced a result worth stating carefully, because
two independent datasets agree on who this player is. Real box scores put the
lowest-ice-time forward at 10.8 hits per sixty. The best hitter on a fourth line
averages 10.82 in the feed.

The swap is a real substitution and not a redistribution after the fact: the
replacement is on the ice for that shift and everything that happens while he is
out there is credited to him.

| ice-time rank | TOI before | TOI after | real | hits before | hits after | real |
|---|---|---|---|---|---|---|
| 1 | 24.2 | **24.6** | 24.9 | 1.12 | 1.11 | 0.82 |
| 16 | 10.9 | **10.7** | 11.1 | 1.20 | 1.17 | 1.42 |
| 17 | 9.8 | **9.7** | 10.0 | 0.95 | 0.93 | 1.51 |
| 18 | 8.9 | **8.7** | 8.4 | 0.65 | **0.83** | 1.51 |

The gradient is no longer inverted at the bottom of the lineup, and it is only
partly repaired. How far it could be pushed was decided by something the
substitution exposed rather than by taste.

### A star is worth less on a fourth line than he is on a first

Turned up to where it closed most of the hits gap, the substitution cost two per
cent of the goal mean, and it cost it WITHOUT costing shots. Same shot count,
fewer goals: putting a better player on the ice was lowering conversion.

Shooter finishing is scaled relative to the men he is on the ice with, which is
deliberate and load-bearing. Scaling it against a team-wide reference is not
mean-neutral on the power play, where every shot comes from the best finishers on
the roster, and doing it that way put power-play goals at 0.72 a game against a
real 0.55. Against the shot-weighted mean of the unit the scaling is neutral by
construction: the weighted average of every shooter's ratio is exactly one.

Exactly one, that is, so long as the shots are actually shared out in the
proportions the reference was weighted by. The substitution breaks that
alignment, because the man arriving takes a share of his new line's shots that
has nothing to do with the season rates the reference was built from, and the
neutrality identity stops holding.

That is a modelling artifact rather than hockey -- a player's finishing should not
depend on whose line he is borrowed onto -- but the reference is the same
mechanism that keeps the power play honest, so it was not worth rewriting on the
strength of one column. The substitution was instead set low enough that the
distortion is small, the goal mean was re-fitted, and the result is a partial fix
with the headline rates intact:

| | simulated | real |
|---|---|---|
| goals | 3.08 | 3.08 |
| penalty minutes | 8.73 | 8.72 |
| shots on goal | 27.73 | 27.84 |
| blocks | 14.05 | 14.20 |
| goalie save percentage | 89.22 | 89.17 |
| a two-goal lead into the third, lost | 2.8% | 2.7% |
| a one-goal lead into the third, caught | 31.2% | 31.7% |

Invariant failures across 4,800 team-games: zero.

## Rotations, measured rather than guessed

The rotation-size weights were a plausible-looking guess. Counting them off 2,470
real team-games gives a much sharper shape: a rotation of ten is far and away the
most common at 31.9%, nine is nearly as common as eleven, and the tail runs to
fifteen rather than stopping at thirteen. The old weights peaked too softly,
which spread minutes further down the bench than a real coach does and cost the
top of the rotation.

With the curve steepened to match, the busiest player's minutes land exactly:

| | before | after | real |
|---|---|---|---|
| busiest player, minutes | 34.9 | **35.4** | 35.4 |
| a triple-double | 0.410% | **0.432%** | 0.505% |
| a double-double | 7.23% | **7.15%** | 7.16% |
| 10 rebounds and 10 assists | 0.500% | 0.482% | 0.512% |

His scoring did not follow, which took a harness to understand.

## The same man in both columns

Comparing simulated players against real ones by minutes RANK cannot tell
under-production apart from dilution. If the simulated busiest player is often
not the team's best player, his line comes out short either way, and every fix
aimed at the wrong one of those failed.

The players are the same real people in both columns, so they can simply be
matched by name and asked whether each of them does what he really does. That is
now part of the player harness, and it settled the question immediately:

| group | real minutes | simulated | real points | simulated |
|---|---|---|---|---|
| plays 30 or more minutes | 32.5 | 30.4 | 19.8 | 17.2 |
| plays 20 to 30 minutes | 25.1 | 22.9 | 11.7 | 10.3 |
| plays under 20 minutes | 15.2 | 7.4 | 5.7 | 2.7 |

Scoring per 36 minutes, averaged over every player with a real workload behind
him, is 0.41 points low. But it is not evenly low: the 30-minute group is 1.7
points per 36 short, the middle group 0.7 short, and the fringe group half a
point OVER. Per-minute production is being flattened across the rotation, which
is a different problem from the engine being short of scoring, and it is why
raising shot concentration always fixed the level and broke the tails.

The bottom row wants care. A fringe player appears in a real box score only on
the nights he plays, and those are disproportionately the blowouts that got him
fifteen minutes, while the engine dresses him every night. Most of that gap is
selection, not simulation. The 30-minute row does not have that problem.

Two attempts on the flattening were measured and rejected. Splitting the shot
exponent so that the season rate carried the concentration and the usage draw
kept its own, which is level without spread and exactly the diagnosis, made the
busiest player worse rather than better at 19.2 points. Giving a player's own
free-throw rate a compounding exponent moved his attempts from 4.2 to 4.4 at a
matched team total and cost him 0.7 points elsewhere.

## A team's free throws were cancelling themselves out

The four-factors check is what caught this. The team with the better free-throw
rate won 52.2% of simulated games against a real 55.6%, which is most of the way
to no signal at all.

The trip rate divided a player's free-throw rate by the SAME matchup-adjusted
team rate it multiplied by. The expression reduced to the trip scale times the
player's own rate, and nothing about the team survived it: a side that really
gets to the line had no advantage, a matchup against a side that really fouls had
no effect, and the clutch adjustment that raises a leading team's rate late was
dead code that had been running for months.

A player's rate belongs relative to HIS OWN TEAM's season rate. The level belongs
to the matchup. Those are two different denominators, and using one for both
deleted the factor.

Turnovers were the other one out of place, deciding 63.6% of games against a real
60.9%, because a turnover was generating too much of an extra possession for the
side that won it. At a fast-break value of 0.22 rather than 0.40 all four factors
come in together:

| the game is won by | real | before | after |
|---|---|---|---|
| the better effective field-goal percentage | 81.3% | 79.2% | **80.0%** |
| the lower turnover rate | 60.9% | 64.7% | **63.2%** |
| the better offensive rebounding rate | 60.5% | 58.9% | **59.2%** |
| the better free-throw rate | 55.6% | 52.2% | **53.1%** |

Total disagreement across the four fell from 10.0 points to 7.4.

## Two tests that could not measure what they asserted

The NHL overtime share failed at 28.33% against a band of 19 to 28 after a change
that did not touch scoring. Six hundred games put a 1.8-point standard error on
that share, wide enough that any change moves the estimate a band-width purely by
reshuffling the random stream. On four times the sample the rate is 25.8% against
a real 25.0%.

The NBA margin-agreement check had the same disease and it was worse, because
nothing failed: it reported drifts of -0.02, +0.17, +0.44 and +0.68 across
configurations that differed only in noise, and two of those were acted on. A
game's margin has a spread of about thirteen points, so 1,200 of them give that
average a 0.38 standard error.

Both samples were raised rather than either band widened. On 4,000 games the
margin drift reads 0.243, which is where it always was. A tolerance loosened to
make a test pass is a tolerance that will not catch the next thing.

## A starter is almost always on the floor

The identity harness said per-minute production was being flattened across the
rotation: the best players a point and a half per 36 short, the fringe half a
point over. That is not the engine being short of scoring. It is the engine
sharing scoring out wrongly, and the cause was in lineup construction rather
than anywhere in the shooting model.

Bench units were being sent out as bench units. Real coaches almost never do
that; they stagger, so that one starter is on the floor with four reserves and
another with the second unit. When five reserves play together they take every
shot between them at inflated rates, and the starters, who only ever shared the
floor with each other, took a smaller share than they really do. Both ends of the
rotation were wrong for the same reason.

Anchoring nearly every bench unit with a starter fixed the level and immediately
created the opposite problem: the anchor took too much. With four low-volume
reserves around him his share ballooned, and forty-point games went to 0.737%
against a real 0.497%.

That is the answer to something that had defeated every previous attempt. Shot
concentration was carrying the star's scoring LEVEL, which is why raising it
always broke the tails and lowering it always broke the level. Once staggering
supplies the level structurally, from who is actually on the floor, the exponent
is free to come down to where the tails want it:

| | before | after | real |
|---|---|---|---|
| busiest player, minutes | 34.9 | **35.5** | 35.4 |
| busiest player, shot attempts | 14.9 | **15.4** | 15.6 |
| busiest player, points | 19.8 | **20.5** | 21.3 |
| scored 30 or more | 3.482% | **3.338%** | 3.534% |
| scored 40 or more | 0.568% | **0.548%** | 0.497% |
| a triple-double | 0.432% | **0.511%** | 0.505% |
| a double-double | 7.154% | 7.237% | 7.162% |
| 10 rebounds and 10 assists | 0.482% | **0.548%** | 0.512% |

Triple-doubles, which began this stretch of work at 0.308%, now land on the real
rate. The rotation curve had to be re-fitted underneath the change, because
staggering keeps a starter out there longer than the plan intended and pushed the
busiest player to 36.1 minutes against a real 35.4.

Where the model stands after it, on the team distributions:

| | simulated | real |
|---|---|---|
| a team under 90 | 3.82% | 3.81% |
| a team 130 or more | 25.21% | 25.02% |
| a team 140 or more | 5.74% | 5.91% |
| won by 20 or more | 23.23% | 22.83% |
| won by 40 or more | 1.44% | 1.62% |
| margin played minus margin projected | 0.028 | 0 |

Wins by thirty remain the one distribution that will not come right. At 6.55%
against a real 7.77% it is where it has been through every version of the
runaway model, the reversion target, the form width and now the rotation: the
body of the margin distribution is correct at twenty and the tip is correct at
forty, and there is a dip between them that nothing structural has reached.

## And then both benches come in

Wins by thirty had survived everything. The runaway model, the reversion target,
the form width, the rotation: every version of the engine put them about a point
low while wins by twenty and wins by forty were both right.

The shape of the miss is what finally said what it was. Conditional on a
twenty-point win, a real game reaches thirty 34.0% of the time and this one
reached it 28.2%. Conditional on THIRTY, it reached forty at very nearly the real
rate. The decay from twenty to thirty was too fast and the decay from thirty to
forty was correct, and no single fade could be both: easing the pull off harder
put wins by thirty on 8.02% against a real 7.77% and wins by forty on 2.30%
against 1.62%.

The two ends want opposite things because they are different situations. A
twenty-five point lead in the third is a team that has stopped competing, and it
tends to get worse. A thirty-five point lead is both coaches emptying the bench,
and a game between two benches does not run away from anybody. It runs out the
clock.

So the pull now fades as the game gets away and comes BACK once it is gone.
Nothing else tried here could raise the middle without lifting the top, because
nothing else distinguished those two states.

| | before | after | real |
|---|---|---|---|
| won by 20 or more | 23.23% | **22.95%** | 22.83% |
| won by 30 or more | 6.55% | **6.95%** | 7.77% |
| won by 40 or more | 1.44% | **1.66%** | 1.62% |
| a team under 90 | 3.82% | 3.67% | 3.81% |
| a team 140 or more | 5.74% | **5.99%** | 5.91% |

Measured on 9,880 simulated games rather than the usual 3,700, because at the
smaller sample the standard error on wins by twenty is 0.7 points and several
earlier rounds of this had been tuning inside it.

## Winning draws free throws; free throws do not win

The four-factors check kept saying the same thing after the trip-rate bug was
fixed: the team with the better free-throw rate won 52.3% of simulated games
against a real 55.6%, the weakest of the four by a distance.

Much of that real figure is not free throws winning games. It is winning games
drawing free throws, and the mechanism is a trailing team deliberately fouling in
the last two minutes. The engine had that, and had it only for leads of five or
fewer, symmetric with the band where a trailing team hunts threes. Those are not
symmetric situations: the side in front gets sent to the line, the side behind
does the sending, and a real team starts fouling well before it is within five.

That, and the trip-rate fix that made the clutch rate live at all, brought the
four factors in together:

| the game is won by | real | at the start | now |
|---|---|---|---|
| the better effective field-goal percentage | 81.3% | 79.9% | **80.8%** |
| the lower turnover rate | 60.9% | 62.8% | **61.9%** |
| the better offensive rebounding rate | 60.5% | 60.9% | 59.5% |
| the better free-throw rate | 55.6% | 55.9% | 54.6% |

Total disagreement across the four: 3.4 points, from 10.0 when the check was
first written.

## Some games are streakier than others

Two residuals were left on the margin distribution and they turned out to be one.
Wins by twenty and wins by forty both landed on the real rates, while games
decided by three or fewer came out at 12.80% against a real 14.57% and wins by
THIRTY at 6.95% against 7.77%. A distribution that is right at twenty and forty
but short of both the very close games and the blowouts is not the wrong width.
It is the right width with the wrong shape: too thick in the middle.

Every game was being drawn at the same volatility. Real basketball is not like
that. Some nights are tight and well played and some are a procession of runs,
and a model with one fixed volatility produces a margin that is close to normal
when the real thing has a sharper peak and heavier tails than normal.

A single volatility for the game, shared by both sides, now scales the
night-level draws. This is a scale mixture, which is the standard way to get
exactly that shape, and it is deliberately mean-preserving: the widths are
divided by the root mean square of the factor, so the overall spread is unchanged
and only the shape moves.

| | before | after | real |
|---|---|---|---|
| decided by 3 or fewer | 12.80% | **13.59%** | 14.57% |
| a team 130 or more | 26.01% | **25.53%** | 25.02% |
| a team 140 or more | 5.99% | **5.85%** | 5.91% |
| won by 20 or more | 22.95% | 22.50% | 22.83% |
| won by 40 or more | 1.66% | 1.48% | 1.62% |
| won by 30 or more | 6.95% | 6.70% | 7.77% |

Measured on 9,880 simulated games. Total disagreement across the seven fell from
3.96 points to 3.41, and the two metrics the change was aimed at account for all
of the gain.

Pushed harder it stops helping: at a volatility half again as wide, close games
went back to 13.32% and wins by thirty to 6.50%. The night-level draws are not
the only source of variance in a game, so scaling them can only reshape so much
of it.

Each side's per-game production spread had to come down afterwards, because a
mixture that widens team nights also widens individual ones: double-doubles went
to 7.50% and triple-doubles to 0.545% before the involvement factor was trimmed
to pay for it. After that, triple-doubles sit at 0.502% against a real 0.505% and
twenty-rebound games at 0.093% against 0.097%.

## Built, measured, and removed

Hits run the wrong way down the NHL lineup. In real box scores the busiest
skater records 0.82 of them and the least busy 1.51, because hitting is what
depth players are dressed to do, and this engine has 1.12 at the top and 0.65 at
the bottom.

The rates are not the problem. The feed grades them steeply, 2.45 per sixty on a
first line against 6.76 on a fourth, and they are dealt from those rates
honestly. The wrong MEN are at the bottom of the ice-time table, because
linemates share shifts and so a line's three forwards all finish a simulated game
on the same ice time. Real coaches break the fourth line up: they drop the
checker and send a top-six forward over the boards in his place.

That was built. It worked on what it was aimed at. Ice time by rank became
near-exact from top to bottom and the least-used forward's hits went from 0.65 to
0.83. Two independent datasets even agreed on who the checker is, which is the
kind of corroboration worth recording: real box scores put the lowest-ice-time
forward at 10.8 hits per sixty, and the best hitter on a fourth line averages
10.82 in the feed.

It was removed anyway.

The substitution lowered the goal mean by two per cent WITHOUT lowering shots.
Same shot count, fewer goals, from putting a better player on the ice, which is
backwards and therefore a defect rather than a cost. Shooter finishing is scaled
against the shot-weighted mean of the men on the ice. That is mean-neutral by
construction, but only while the shots are shared out in the proportions that
mean was weighted by: the weighted average of every shooter's ratio is exactly
one. A borrowed player takes a share of his new line's shots that has nothing to
do with the season rates the reference was built from, and the identity stops
holding.

Restoring the goal mean then meant raising conversion globally, and that cost
lead retention in the third period. That is a headline number for anyone betting
a hockey game and hitting is not, so the trade was the wrong way round.

The unit reference is not the thing to change either. Scaling finishing against a
team-wide reference is not mean-neutral on the POWER PLAY, where every shot comes
from the best finishers on the roster, and it put power-play goals at 0.72 a game
against a real 0.55.

So the hits gradient stays a stated residual rather than a fixed one. It is worth
a rebuild of the finishing reference, not a workaround. The engine is back where
it was, and the removal is recorded in the code so that the next person to notice
the hits column does not spend a day rediscovering why it is still there.

| | simulated | real |
|---|---|---|
| goals | 3.07 | 3.08 |
| shots on goal | 27.73 | 27.84 |
| power-play goals | 0.57 | 0.55 |
| penalty minutes | 8.78 | 8.72 |
| blocks | 14.05 | 14.20 |
| goalie save percentage | 89.33 | 89.17 |
| a 3-goal lead into the third, held | 95.3% | 95.2% |
| a 2-goal lead into the third, held | 84.1% | 85.7% |
| a 1-goal lead into the third, held | 57.9% | 59.6% |

Invariant failures across 4,800 team-games: zero.

The lead-retention figures above are quoted at the sample the harness runs by
default, and they move by two points between that sample and twice it, which is
worth saying because two rounds of work went into chasing a regression that was
partly a draw. Measured properly, at 9,880 simulated games, they are lower than
the table shows and the gap is real rather than noise: a one-goal lead is held
56.0% against a real 59.6% and a two-goal lead 82.5% against 85.7%. Comebacks in
this engine are about three points too common from either deficit. That is now
the largest NHL residual and it is stated here rather than tuned away.

## What decides a hockey game

The NHL engine had the same blind spot the NBA one had before the four-factors
check was written. Every marginal average matched, which is a different claim
from the right things deciding the result, and it is the second one a bettor is
buying. So hockey now gets the equivalent, measured off the same real box scores:

| the game is won by the side with | real | before | after |
|---|---|---|---|
| more shots on goal | 51.4% | 53.4% | **49.9%** |
| the better save percentage | 87.0% | 89.2% | 89.9% |
| more hits | 43.7% | 42.2% | 41.7% |
| more blocks | 59.2% | 55.6% | **56.4%** |

Power plays are not in the real feed at team level and are therefore not in the
table. Guessing them from penalty minutes would be measuring the guess.

The first row is the interesting one, and it is one of the genuinely
counter-intuitive facts about the sport: out-shooting an opponent is close to a
coin flip. The engine had it at 53.4%, and the same defect was showing up
somewhere else entirely as comebacks running about three points too common from
either a one-goal or a two-goal deficit. Two measurements, one cause: the chasing
team's shots were worth too much.

Real hockey runs the other way. A team pushing from behind shoots MORE and shoots
WORSE, into a shell; the side protecting a lead takes fewer shots of much better
quality, because it gets them on the counter-attack. The score-effect model had
been giving the trailing team both volume AND quality, which is why it could not
be tuned into agreement from either end: softening it made out-shooting even more
predictive, and hardening it made comebacks worse.

Volume for the side behind and quality for the side in front fixed both at once,
and the lead table came in with it:

| lead into the third | held (real / sim) | caught | lost |
|---|---|---|---|
| 1 goal | 59.6% / **59.7%** | 31.7% / 29.6% | 8.6% / 10.7% |
| 2 goals | 85.7% / **86.5%** | 11.6% / **11.2%** | 2.7% / **2.3%** |
| 3 or more | 95.2% / 94.0% | 4.3% / 5.4% | 0.4% / 0.6% |

Regulation ties, which are the only source of overtime, sit at 25.03% against a
real 25.00%. The total comeback rate from a goal down is 40.3% against a real
40.3%; what remains wrong there is only the split between tying and winning
outright, which is the residual this engine has carried from the beginning.

Three or more down is not the same state as two down, and had to be separated.
The side in front is protecting rather than pressing, so squeezing the trailing
team's conversion as hard everywhere put shutouts at 10.68% against a real 8.54%.

Shutouts remain at 10.00% against 8.54%, stuck between two knobs that pull
against each other: raising the conversion of a team three goals down cuts
shutouts and costs three-goal lead retention, which is already 94.0% against a
real 95.2%.

The obvious explanation was wrong, which is worth recording because it looked
right. Real hockey does both of those at once because a deficit early is a
different situation from the same deficit late -- there is time to score once
without there being time to score three -- so the fix appeared to be easing the
score effects in over the clock instead of applying them flat. Built, it changed
nothing whatsoever, for the good reason that these effects already apply in the
THIRD PERIOD ONLY. There was no flat application to fix. The shutout residual is
not a score-effect problem at all, and it is left where the measurement actually
points: at dispersion in conversion, which raises the chance of being held
scoreless because the probability of no goals is convex in the rate.

| | simulated | real |
|---|---|---|
| goals | 3.08 | 3.08 |
| shots on goal | 27.73 | 27.84 |
| power-play goals | 0.56 | 0.55 |
| penalty minutes | 8.89 | 8.72 |
| goalie save percentage | 89.20 | 89.17 |

Invariant failures across 4,800 team-games: zero.

## Momentum runs, measured and rejected

Possessions here are independent, so a team's shooting for the night is a fixed
rate and one stretch of a game differs from the next only by coin-flip noise.
Basketball is played in runs. A nine-nothing stretch is not the same event as
nine made shots scattered across a quarter, even though the box score cannot tell
them apart, so an autocorrelated efficiency walk was built with a persistence
that decays a hot stretch over about the length of a real one.

It made the model worse, and the way it did is worth keeping.

Runs accumulate into the final margin, so they widen it a great deal: wins by
twenty went from 22.50% to 26.75%. Clawing that back with a stronger reversion
recovered the bands, but not the thing the feature was built for. Games decided
by three or fewer fell from 14.24% to 12.69% against a real 14.57%, at every
setting tried, including a scale mixture on the run intensity itself.

That says something about the sport which is easy to get backwards. Real
basketball's margin distribution is TIGHTER around zero than independent
possessions already predict. Whatever momentum does inside a game, at the level
of a final score the league behaves as though leads get answered rather than
extended, and adding within-game variance moves away from the real distribution
rather than toward it. The engine already models the answering, and the place to
have looked was not the possession loop.

## Does it actually beat anything

All of the work above is about whether a simulated game looks like a real one.
None of it is about whether the projection is any good, and those are different
questions with different answers. The walk-forward backtest fits ratings from
only what had been played by the morning of each game and scores that day, so
nothing the model sees has happened yet.

| | NBA | NHL |
|---|---|---|
| games | 4,902 | 5,222 |
| accuracy | 65.9% | 58.1% |
| baseline (always the home side) | 55.6% | 53.6% |
| Brier | 0.2131 | 0.2387 |
| Brier skill | 13.7% | 4.0% |
| calibration error | 0.014 | 0.009 |
| margin mean absolute error | 10.90 | 2.14 |

Basketball is in good shape and getting better, which is the more interesting
half of that table:

| season | accuracy | Brier skill |
|---|---|---|
| 2023 | 62.3% | 6.2% |
| 2024 | 65.3% | 14.7% |
| 2025 | 66.9% | 15.8% |
| 2026 | **69.0%** | **17.4%** |

Hockey is the weak half at 4.0%, and most of what looked like a defect there
turned out not to be one.

### Shots on goal do not help, and that is not what the literature says they do

Goals are the noisiest thing a hockey game produces, and the sport's own
analytics have held for years that shot share says more about a team than its
goal margin does. That could not be tested because nothing recorded how many
shots were taken, so per-game shots were fetched for four seasons and the
identical rating fit was run against them.

Blending a shot-margin rating into the projection made the model worse at every
weight, monotonically: Brier skill went 5.01% at no blend, 4.91% at a quarter,
4.56% at a half, 3.54% at three quarters, and 1.07% on shots alone.

The claim is about EXPECTED goals, and shots on goal are not that. A point shot
from the blue line and a breakaway count the same here, and converting a shot
margin back to goals at one league rate throws away finishing and goaltending,
both of which are real and persistent. The data is kept and the flag left in
place, so this stays a measurement rather than a belief.

### The current hockey season is genuinely low on signal

The 2026 season scores 52.9% against 59.3% and 60.6% in the two before it, which
looks like something broken. Fitting ratings on the whole of each season and then
scoring that same season -- cheating completely, as an upper bound on how much
team strength explained at all -- says otherwise:

| season | walk-forward | in-sample ceiling | home edge |
|---|---|---|---|
| 2024 | 60.6% | 62.2% | 0.23 goals |
| 2025 | 59.3% | 62.7% | 0.30 goals |
| 2026 | 52.9% | **59.5%** | **0.12 goals** |

Home ice was worth a tenth of a goal in 2026 against three tenths the season
before, and even a model that had seen the whole season could only reach 59.5%.
Shortening the rating memory does not recover it, at any half-life tried. The
season was harder, and saying so is more useful than tuning against it.

### Two things that were actually wrong

Counting distinct team codes per season found both: thirty-six in every season
before the current one and thirty-two in it.

The four extras are CAN, FIN, SWE and USA, which are 4 Nations Face-Off rosters
rather than clubs. They were being given ratings, and a club's game against a
team of all-stars was being treated as evidence about that club. The missing one
is Utah, which appears as UTAH in the season it entered the league and UTA in the
current one, so a rating fit saw two franchises and Utah began this season with
no history at all.

Both are now handled. Neither moved the headline number by more than a rounding
error, which is worth stating plainly: they were real defects and they were not
what was holding hockey back.

## Knowing who is in goal is worth more than anything else tried

Fitting the whole of a hockey season and then scoring that same season says team
strength alone caps out not far above where the walk-forward already sits.
Getting past that needs information the team ratings cannot contain, and in
hockey there is an obvious candidate: a rating built from goals averages a
starter and a backup together, and the two are frequently a long way apart.

The adjustment is deliberately NOT the starter's quality. A team rating already
contains that team's goaltending, averaged over whoever played, so using the raw
quality would count the same goaltending twice. What the rating cannot know is
which of them is playing tonight, so the adjustment is the starter's save rate
minus his OWN TEAM's, which is exactly the part that is new.

| starter known | Brier | Brier skill | accuracy | margin MAE |
|---|---|---|---|---|
| no | 0.23874 | 4.0% | 58.1% | 2.143 |
| **yes** | **0.23705** | **4.7%** | **59.0%** | **2.126** |

Seventeen per cent more skill than the model has without it, and it holds up
season by season rather than coming from one: 7.1%, 5.0%, 5.3% and 1.1% across
the four, against 5.5%, 5.4%, 3.9% and 0.8% without.

It is left switched off by default, because the headline figure should be what
the model does knowing only who is playing whom. A starting goaltender is
announced about an hour before a game, and the simulator already accepts one, so
this is a capability rather than a hypothetical.

Two things had to be right for the join to work at all, and both are the sort of
thing that fails silently:

The two feeds do not share a game id, so games are matched on the two clubs plus
the date, and the date needs care. A results file stamps a game in UTC, so a late
start on the fifteenth is filed under the sixteenth while the goaltending log
calls it the fifteenth. Matching on an exact date loses every late game, which is
not a random sample of games. A day either way is allowed, and the join lands
98.7% of appearances.

The goaltending feed also spells four clubs at full length where the results feed
does not. Same teams, and a join that does not know it drops them.

### One shrinkage that is not what the textbook says

Save percentage is a noisy rate and wants shrinking. The textbook figure is high:
the talent spread between goaltenders is about eight thousandths and the
per-shot noise is roughly eighty times that, which argues for waiting until a man
has faced something like thirteen hundred shots before trusting his own number.

The model does not want that. It prefers a fraction of it -- 4.7% skill at fifty
shots against 4.3% at twenty-five hundred -- and prefers it in three seasons out
of four.

Which says the deviation is carrying more than finishing talent. Who a coach
starts is itself information, about who is hurt and who is playing well, and that
is worth something before a save percentage alone would be. The figure used is a
hundred and fifty, about five starts: it keeps nearly all of the measured gain
without asking the model to believe a goaltender after two games.

## A backup with three games was the best goaltender in the league

Chasing what a starting goaltender is worth turned up something worse in the
shipped model. Goaltenders arrived with their raw season save percentage, clamped
at either end and otherwise believed, with no account taken of how many shots
that number was built on. There are only two goaltenders on a roster and one of
them has usually played a handful of games, so this was not a rare case:

| Boston, before | shots faced | rated at |
|---|---|---|
| Jeremy Swayman | 1,571 | .908 |
| Jiri Patera | 40 | .850 |
| Michael DiPietro | **2** | **.945** |

A man who had faced two shots was being handed to the simulator as the best
goaltender in the league, and asking for him rather than the starter moved the
projected score by several goals.

The spread of real goaltending talent is about eight thousandths of a save
percentage, and the noise on a single shot is roughly eighty times that, which
puts the crossover -- where a goaltender's own number outweighs the league's --
above a thousand shots. Shrinking toward the league by shots faced, weighted by
shots rather than games because that is the unit the noise is in:

| Boston, after | shots faced | rated at |
|---|---|---|
| Jeremy Swayman | 1,571 | .903 |
| Jiri Patera | 40 | .895 |
| Michael DiPietro | 2 | .897 |

Real starters keep their differentiation, which is the thing a shrinkage like this
can easily destroy. Across the forty-four goaltenders with eight hundred shots or
more the range runs from .886 to .908, with Vasilevskiy near the top of it, and
the league's headline numbers do not move: goals 3.09 against a real 3.08, save
percentage 89.19 against 89.17, shots 27.75 against 27.84, zero invariant
failures.

## Three rotation players were hundred per cent three-point shooters

The goaltending defect turned out to have a twin, and a worse one. Basketball
player percentages arrived raw off the season with no account taken of how many
attempts they were built on:

| in a current rotation | three-point attempts | rated at | minutes a night |
|---|---|---|---|
| Mark Williams | **1** | **100.0%** | 23.6 |
| Trayce Jackson-Davis | 1 | 100.0% | 9.4 |
| Jaxson Hayes | 3 | 100.0% | 18.3 |
| Walker Kessler | 8 | 75.0% | 30.8 |

Fifteen rotation players were rated above 42% from three on fewer than sixty
attempts. The damage was bounded, because a player who has taken one three all
season is not given many to take in a simulated game either, but a hundred per
cent shooter has no business being in a model at all, and it leaks into his
two-point rate, which is derived from his overall percentage net of his threes.

The crossover follows from how far real talent spreads against how noisy a single
shot is. Three-point shooting spreads about four and a half points and a single
attempt carries roughly ten times that in variance, which lands near a couple of
hundred attempts. Free throws spread much wider and settle far sooner, which is
why they take a much smaller figure: a player really can be shown to be a poor
free-throw shooter inside a month.

| after shrinking | attempts | rated at |
|---|---|---|
| Mark Williams | 1 | 36.6% |
| Walker Kessler | 8 | 37.9% |

Volume shooters keep their differentiation, which is what a shrinkage like this
can easily destroy: across players with three hundred attempts or more the range
runs from 32.7% to 41.8%.

It cost something, and the cost is worth stating rather than hiding. Compressing
player quality removes variance from a game, and some of that variance was doing
real work: a team reaching 140 fell from 5.99% to 5.46% against a real 5.91% and
wins by forty from 1.66% to 1.37% against 1.62%. Roughly a third of it was
recovered by widening the per-player night-to-night form draw, which is a real
thing rather than a fake one, but not all. The shooting percentages were wrong
and are now right, and a slightly thin margin tail is the better of the two
problems to have.

## The loop was flattening the league by six and a half per cent

This one matters more than anything else on this page, because it is not about
whether a box score looks real. It is about whether the number the model puts on
a game is the number it means to.

The simulation was finishing half a point below its own projection over four
thousand games. That reads like noise until you look at where it comes from: the
shortfall is not spread evenly, it is proportional to the projected margin and
opposite in sign. A game projected at ten came out at eight and a third. A game
projected at twenty-five came out at twenty-four. An away favourite projected at
minus ten and a half came out at minus ten. Everything was being squeezed toward
zero.

Measured properly across sixty team-sides, what the possession loop delivered
against what it was asked for had a slope of **0.9344**. A team ten points of
offensive rating above the league finished six and a half tenths short of its
rating; a team ten below finished six and a half tenths high. Every projected
margin was compressed by six and a half per cent.

The cause is that `solveShotMultiplier` inverts a closed-form model of a
possession to find the shooting multiplier that delivers a given efficiency, and
the loop it is solving for does more than that model knows about: non-shooting
fouls and the bonus, second chances off missed free throws, garbage time, the run
of play. Those extras do not scale with team quality, so they pull everyone
toward the middle. No amount of extra passes inside the solve can fix it, because
the solve is converging correctly on the wrong target -- which is why an earlier
round adding passes helped and did not cure it.

Asking for a proportionally wider target cancels a slope exactly. It took
calibrating rather than deriving, because the loop saturates against its own
clamps as the target gets extreme: stretching by the naive 1/0.934 recovered only
a third of it, and stretching by 1.23 overshot.

Calibrating it also had to be done twice, which is the more useful half of the
story. The first attempt was fitted on sixty simulations a matchup, landed on a
stretch of 1.125, and reported a slope of 0.999. At a hundred and fifty a matchup
the same setting reads 1.04 across three separate seed sets: the estimate was
noisier than the correction it was being used to size, and the first answer
overshot by four per cent. The check that now guards this had the same problem
and reads the slope at 0.95 or 1.04 depending on the sample, so it was given the
larger one too. A check that cannot tell those apart is not a check.

| | before | after |
|---|---|---|
| slope of delivered against asked | 0.9344 | **0.990** |
| margin played minus margin projected | -0.498 | **-0.103** |

And the margin distribution came with it, because a six and a half per cent
compression was exactly what had been holding the blowout band down through every
round of tuning on this page:

| | before | after | real |
|---|---|---|---|
| decided by 3 or fewer | 14.26% | **14.55%** | 14.57% |
| won by 20 or more | 22.76% | **22.77%** | 22.83% |
| won by 30 or more | 6.77% | **6.87%** | 7.77% |
| won by 40 or more | 1.37% | **1.55%** | 1.62% |
| a team 140 or more | 5.46% | **5.58%** | 5.91% |
| a team 130 or more | 25.20% | 24.62% | 25.02% |
| a team under 90 | 3.68% | 3.67% | 3.81% |

Wins by thirty had been a point low through the runaway model, the reversion
target, the form width, the rotation and the bench-emptying stabiliser. They were
a point low because the engine was quietly regressing every team toward the
league average and no amount of work on the margin model could reach that.

## The three that does not tie it

Games decided by three or fewer sat at 13.4% against a real 14.6%, and every
attempt to fix it by adding variance made it worse, for the reason recorded
above: real basketball's margins are tighter around zero than independent
possessions predict.

The answer was not variance but a missing event. The engine modelled a team down
one to three getting the last shot at levelling, and nothing else. It left out
the most common finish in the sport: a side down five hits a three with eight
seconds left, fouls, and loses by two.

Adding it moved only the metric it should: games decided by three went to 14.46%
and no other band moved by more than a rounding error. It also had to be paired
with the other half of an endgame -- the side in front being fouled and shooting
free throws -- because giving the trailing team points and the leading team none
is not neutral when the home side is the one in front more often.

## Residuals, stated rather than tuned away

Still measurably off, and left alone because closing them by hand would be
fitting noise or breaking something that matches:

- NHL comebacks run 11.6% against a real 13.9%, and final margins 2.02 against
  2.20. Pushing the one-goal chase harder closes both but takes the overtime
  share past its real 23%, so it stops here.
- NHL least-used skater's ice time varies by 1.9 minutes against a real 2.4.
  Widening it further pulls the MEAN off, because ice time is allocated and
  rescaled rather than earned; the honest fix is the one the NBA minutes column
  got, and the NHL engine has no possession loop to earn it from.
- NBA triple-doubles remain rare: 0.03 a team-game against a real 0.06.
- NBA assists still carry slightly too much spread (sd ratio 1.09) and rebounds
  slightly too little (0.90).

## Where team strength comes from

**Not from points scored and points allowed.** Those numbers do not know who a
team played, and a soft schedule flatters them.

`services/simRatingFit.js` solves every team's offence and defence together from
the actual game results by weighted ridge regression:

```
home points = mu + offence(home) - defence(away) + homeEdge
away points = mu + offence(away) - defence(home)
```

Three properties fall out of that, each replacing a hand-set constant:

- **Opponent adjustment** comes from solving jointly rather than team by team.
- **Time decay** replaces the old carryover constant. Each game is weighted by
  `exp(-age / halfLife)`, so the summer gap handles itself and nobody has to
  decide what "a season old" means.
- **Ridge shrinkage** replaces the old sample-size constant. A team with five
  games is regressed because the arithmetic regresses it.

Fitted walk-forward: NBA half-life 60 days and ridge 6, NHL 150 days and ridge 20.
The home edge is solved rather than assumed and comes out at 1.74 points and 0.16
goals.

Swapping this in for the raw aggregates is the single largest accuracy change in
the project:

| | aggregates | ridge fit |
|---|---|---|
| NBA accuracy | 61.1% | **66.8%** |
| NBA Brier skill | 0.061 | **0.154** |
| NBA margin error | 12.17 | **11.20** |
| NHL accuracy | 55.2% | **57.2%** |
| NHL Brier skill | 0.007 | **0.032** |

The aggregates are still what drive pace, shot profile, rotations, goaltending
and the whole box score. Only expected scoring comes from the fit, converted to
the per-hundred-possessions scale the rest of the engine already speaks, so
nothing downstream changed.

If a snapshot is ever rebuilt without the fit (`--no-fit`, or a failed results
fetch) everything falls back to the aggregates and keeps working, measurably
worse. `tests/sim-calibration-lock-test.js` fails loudly rather than let that
ship silently.

## The calibration layer

The reported win probability is not the share of simulations the home team won.
That is unbiased only if the simulation's spread is exactly right, and
walk-forward it is close but not exact. Instead the projected margin is mapped to
a probability by a logistic fitted on **earlier seasons only**:

```
P(home win) = 1 / (1 + exp(-(a + b x projected margin)))
```

That is what makes a stated 70% a real 70%, and it is why the calibration error
is under two and a half percent in both sports.

## Re-running the measurement

```
cd ../trustmyrecord-backend
node scripts/walkforward.js --sport nba --fit     # refit the rating parameters
node scripts/walkforward.js --sport nhl --fit
node scripts/build_calibration_baseline.js        # freeze what the site quotes
node scripts/build_nba_snapshot.js                # rebuild, refitting the ratings
node scripts/build_nhl_snapshot.js
node tests/sim-calibration-lock-test.js
```

`scripts/backtest_sim.js` is still there and still useful: it answers the
narrower question of how the model does with ratings a whole season old, which
is its state before a season starts. Its `--verify` flag is not optional when a
conclusion rests on the closed-form predictor, because it caught a harness bug
that compared two different seasons' ratings and reported a half-probability
disagreement that did not exist.

## The one architectural decision worth knowing

The NFL simulator is roughly 15,700 lines across 45 service files, backed by
about eight Postgres tables and a nightly ingest. That is the right shape for a
play-by-play engine fed by nflverse. It is the wrong shape to add twice more to
a 512Mi Render web instance that was already taken down once, on 2026-08-24, by
concurrent simulate requests exhausting the connection pool and starving the
health check.

So the NBA and NHL engines have the NFL engine's OUTPUT quality and API shape,
with the MLB curated-teams module's data provisioning: their season inputs live
in a committed JSON snapshot loaded once at boot. **A simulate request for these
two sports never checks out a database client.** They are still behind the same
per-IP rate limit and the same two-at-a-time concurrency gate, because a run
holds the event loop even when it holds no pool connection.

## Refreshing the season data

The snapshots are the only thing that goes stale. Rebuild them, re-run the
matchup pages so the printed numbers match, then run the tests.

```
cd ../trustmyrecord-backend
node scripts/build_nba_snapshot.js --season 2027         # ESPN, no key needed
node scripts/build_nhl_snapshot.js --stats-season 20262027 --roster-season 20272028 \
                                   --standings-date 2027-04-15
node tests/sim-availability-test.js
node tests/nba-sim-realism-test.js
node tests/nhl-sim-realism-test.js

cd ../tmrfe3
node scripts/build_sim_matchup_pages.js
npm run test:simarena
```

`--season` for the NBA is the ESPN season year (2026 means the 2025-26 season).
The NHL takes two seasons deliberately: `--stats-season` is the last COMPLETED
season the ratings are fit from, `--roster-season` is the season whose roster is
shown, which in the offseason is the upcoming one.

ESPN rejects an unfamiliar User-Agent with a 403. The builder sends `curl/8.4.0`
for that reason; do not "fix" it to a descriptive one.

## Sitemap

`scripts/add_sim_urls_to_sitemap.js` refuses to write until every URL it is
about to add returns a live 200. That is the May 2026 incident in
`SEO_INDEXING_PROTOCOL.md` turned into code: sitemap entries were added for
pages that were never committed, they 404'd live, and Search Console filled with
errors. Run it AFTER the pages are pushed and live:

```
node scripts/add_sim_urls_to_sitemap.js --check    # verify only
node scripts/add_sim_urls_to_sitemap.js            # verify, then write
```

## Why there are 60 matchup pages and not 931

Thirty NBA teams make 435 ordered pairs and thirty-two NHL teams make 496. A page
per pair would be 931 near-identical pages, which is the thin doorway pattern
that gets a whole section discounted. The generator holds a fixed, hand-edited
list of matchups people actually search for. Each page carries a real projection,
a real team comparison and real players, because the numbers come out of the live
model, and the SEO contract test asserts that all 62 titles and all 62 meta
descriptions are distinct and that every page carries at least 500 crawlable
words with JavaScript disabled.

To add or remove matchups, edit `NBA_MATCHUPS` / `NHL_MATCHUPS` at the top of the
generator and re-run it. It rewrites the "Popular matchups" grid on both hub
pages to match, so a generated page can never end up orphaned.

## Availability, and why the date matters more than the status

Neither league's own feed is the whole story:

- **NBA**: ESPN's roster carries an injury list per player. A player listed out is
  removed from the rotation and his minutes pass to the next player up.
- **NHL**: the NHL's own roster feed carries no injury information at all, so it
  comes from ESPN and is joined on a normalised name. The build prints the match
  rate and **throws** if it ever collapses to zero, because a silent join failure
  would quietly stop scratching injured players.

Both honour a designation only if it is recent (`INJURY_FRESH_DAYS`, 21). ESPN
leaves an "Out" on a player for months: in late August, sixty-four NHL players
still carried one from the previous April, and without the freshness cut the
model was scratching Troy Terry and three other Anaheim regulars on four-month-old
flags. After the cut, three teams carry a current designation, which is what the
offseason should look like.

## Known limits, stated on the pages themselves

- Season ratings are raw, not schedule-adjusted, so each team's distance from
  average is shrunk by 15% before it is used.
- Rest, travel, back-to-backs, in-game injuries, trades since the last snapshot
  and coaching decisions are not modelled.
- Plus-minus is weighted by minutes or ice time, not tracked possession by
  possession or shift by shift.
- Simulated NBA overtime happens slightly less often than the real 6%: an endgame
  model closes most but not all of that gap.
- NHL overtime now matches reality (about 23% of games, 10% shootouts) because the
  pulled goaltender is modelled properly: the leader scores into the empty net 30%
  of the time and the trailing team ties it 13% of the time. Modelling only the
  first of those was what held simulated overtime down at 16%.
- NHL roster slots with no qualifying NHL season are filled at replacement level
  and labelled as such on the page rather than passed off as real production.
