# MLB Simulator — Calibration History & Validated Targets

Engine: plate-appearance Monte Carlo in `static/js/mlb-simulator.js` (the `ev*`
functions). Box scores are simulated PA-by-PA; team run output is anchored to the
expected-run model so totals stay MLB-accurate while box scores, win %, K/BB/HR,
hits, and run distribution emerge from real events.

Validation harness: `scripts/validate-mlb-simulator.cjs`
```
node scripts/validate-mlb-simulator.cjs [engineGames=40000] [endToEndPairs=60]
```
- Track 1 engine integrity (reconciles team↔player totals, pitcher-R↔opponent-R,
  K/BB/H/HR cross-totals, ER≤R, out accounting, runs≤reachers).
- Track 2 distribution calibration (league-average isolation vs MLB baselines).
- Track 1b end-to-end via `simulate()` over a **deterministic** mirror-pair matchup
  set with replication (repeatable home-field % and drift).

## Validated targets (MLB ~2024 approximations; replace with authoritative pull)
| Metric | Target | Engine (current) | Status |
|---|---|---|---|
| Runs / team / game | 4.40 | 4.40 | ok |
| Game total (mean) | 8.80 | 8.80 | ok |
| HR / team | 1.12 | 1.12 | ok |
| K / team | 8.60 | ~8.95 | slightly hot (within tol) |
| BB / team | 3.10 | ~3.35 | slightly hot (within tol) |
| SB / team | 0.70 | ~0.76 | ok |
| Shutout % (team=0) | 7.5% | ~6.3% | ok |
| Blowout % (≥5) | 26% | ~26% | ok |
| Extra-inning % | 8.5% | ~10% | ok |
| Team-games scoring 7+ | 18% (see note) | ~22% | OPEN — see #2 |
| Home win % (mirror) | 53.5% | ~51.6% | ok (within tol) |
| End-to-end target drift | 0% | ~+2–4% | ok after #1 |
| Engine integrity violations | 0 | 0 | CLEAN |

## Calibration corrections
### #1 — Target-aware anchor (DONE, deployed; build `target-aware-anchor-20260527d`)
Replaced the fixed `×0.985` linear-weights anchor correction (tuned only at ~4.4
R/G) with `evAnchorTargetCorrection(t) = clamp(0.985 + 0.02752t − 0.006719t², 0.80, 1.0)`,
fit to the realized-vs-target curve measured by the harness. The engine compounds
above ~4.4 (high-OBP lineups rally more than linear weights predict), which made
lopsided matchups overshoot. Result: per-side realized tracks target within ~1%
across T=3.0–6.5 (was +18.6% at T=6.5); end-to-end drift +8.5% → ~+2–4%; league
mean preserved; integrity clean.

### #2 — 7+ run over-dispersion (ATTEMPTED, NOT SHIPPED — intrinsic, see below)
Goal: pull team-games scoring 7+ from ~22% toward ~18% without moving the mean.
Two tail levers were implemented and measured against the harness:
- Big-inning damping (suppress offense as an inning's run total climbs).
- Reduced discretionary baserunner advancement (lower runs-per-cluster).

**Both moved 7+ by <0.5 pt at fixed mean** (e.g. damp+refit: 22.2% → 21.9% at R/G
4.39). 7+ run *games* come from accumulation across several medium innings, not
single blow-up innings, so tail-tuning + re-anchoring just reshuffles. The
over-dispersion is intrinsic to a faithful PA/Markov process. For context:
Poisson(4.4) → P(7+) ≈ 15.6%; real MLB is over-dispersed (var/mean ≈ 1.2) →
realistic ~19–21%. The engine's ~22% is ~1–2 pts above realistic and far from
Poisson. The harness's 18% baseline is the residual of the 0–6 estimates and is
likely Poisson-low.

**Decision:** reverted both attempts to the clean #1 state (no engine change
shipped). Recommended next step: pull an authoritative real team-game run
distribution to set the true 7+ baseline before deciding whether any action is
warranted; do NOT force 7+ down with structural changes that would reduce realism.

## Not yet built
Betting-market outputs (ML / run-line / total / team-total / F5) — gated until the
distribution calibration is locked. No player props until box-score integrity is
proven over a real-roster sample.
