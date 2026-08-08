# Simulator activation funnel

How to read whether the simulator signup gate is actually converting organic
traffic into **active members**, and where people fall out.

Everything below is GA4 (`G-V5MCVXS2HE`). No backend changes, no new database
tables, no PII. Emitted by:

| File | Emits |
| --- | --- |
| `static/js/sim-auth-gate.js` | everything from page view to first simulation |
| `static/js/tmr-activation-funnel.js` | first verified pick, first TMR Coin |

## The funnel, in order

| # | Event | Means | Fires on |
| --- | --- | --- | --- |
| 1 | `simulator_page_viewed` | someone reached a simulator | every load |
| 2 | `simulator_configured` | they touched any setting — real intent, not a bounce | once per page |
| 3 | `simulator_run_clicked_logged_out` | they tried to run without an account | per click |
| 4 | `simulator_gate_impression` | the signup panel was genuinely on screen | per open |
| — | `simulator_gate_dismissed` | they closed it instead (carries `dismiss_reason`) | per close |
| 5 | `simulator_signup_started` | they left for `/register/` or `/login/` (`auth_method`) | per click |
| 6 | `simulator_signup_completed` / `simulator_login_completed` | they came back authenticated | on return |
| 7 | `simulator_state_restored` | their configuration survived the round trip | on return |
| 8 | `simulator_first_simulation_completed` | their first ever run as a member | once, ever |
| 9 | `activation_first_pick_after_signup` | simulation → **verified pick** | once, ever |
| 10 | `activation_first_coin_after_signup` | they earned TMR Coin | once, ever |
| — | `simulator_return_visit` | they came back later (`days_since_last_visit`) | per return |

Every event from `sim-auth-gate.js` also carries `simulator` (`mlb` / `nfl`),
`device` (`mobile` / `tablet` / `desktop`), `logged_in` and `page_path`, so any
step can be split by simulator or by device. Events 9 and 10 carry
`origin_simulator`, `hours_since_signup` and `days_since_signup`.

## The drop-off questions this answers

- **Is the gate scaring people off?** `simulator_gate_dismissed` ÷
  `simulator_gate_impression`. Split by `dismiss_reason` — `not_now` is a
  considered no, `backdrop`/`escape` is often an accidental close.
- **Is the offer working?** `simulator_signup_started` ÷ `simulator_gate_impression`.
- **Are we losing people inside signup?** `simulator_signup_completed` ÷
  `simulator_signup_started`. A gap here is the register form, not the gate.
- **Does the return path actually work?** `simulator_state_restored` ÷
  `simulator_signup_completed`. This should be ~1.0. **If it drops, the
  state-preservation promise is broken** — treat it as a bug, not a metric.
- **Do new members get value?** `simulator_first_simulation_completed` ÷
  `simulator_signup_completed`. Also ~1.0 by design, since the run auto-fires.
- **Empty account or real member?** `activation_first_pick_after_signup` ÷
  `simulator_signup_completed`. **This is the number the whole project exists to
  move.** A signup that never produces a pick is exactly the empty registered
  account we were trying to stop creating.
- **Are they in the economy?** `activation_first_coin_after_signup` ÷ signups.
- **Do they come back?** `simulator_return_visit` with `member = yes`.

## Where the numbers actually live

GA4 is the **fast** view. The **authoritative** view is server-side and
account-scoped, which is what makes it cross-device:

```
node scripts/activation-report.js --days 30        # in trustmyrecord-backend
GET /api/activation/report?days=30                 # x-admin-token or admin bearer
```

| Store | Holds | Keyed on |
| --- | --- | --- |
| `activation_funnel_daily` | the steps before an account exists | day + simulator + milestone. **No identity of any kind** |
| `user_activation` | signup, return, first simulation, first pick, first coin | `user_id`, one row per member, each milestone write-once |

`first_pick` is stamped by `routes/picks.js` when the pick row is written, so
it cannot be forged, replayed, or missed because the member switched devices.
`first_coin` is derived from `tmr_coin_ledger` (excluding the welcome grant,
which is given rather than earned), so it works retroactively and cannot miss
an award path. `POST /api/activation/milestone` **rejects** both outright —
a client can only report things only it can see.

## Honest limits

- **GA4's** later steps are browser-scoped: a member who signs up on mobile and
  picks on desktop may not link in GA4. The server-side report does not have
  this problem — use it for any decision. GA4 is for speed and for the
  pre-account steps.
- **Pre-signup counters cannot exclude test/QA/bot traffic**, because there is
  no account yet to identify. Post-signup rows do exclude it. So QA runs
  inflate VISITS through SIGNUP STARTS only, which drags SIGNUP START →
  COMPLETE artificially down. It washes out at real volume; do not read that
  one rate on a near-empty window.
- `activation_first_coin_after_signup` records a **baseline** balance the first
  time it looks, and only fires when the balance rises above it. A member who
  already held coin before the simulator gate existed will not produce a false
  positive — and will also not produce an event.
- Attribution window is **30 days** from signup. After that the funnel stops
  measuring that browser and stops calling the balance endpoint entirely.
- `simulator_configured` fires once per page load, not per change, so it is a
  count of engaged sessions, not of edits.

## Kill switches

| Flag | Effect |
| --- | --- |
| `window.SIM_GATE_FLAGS = { gate:false }` | simulators run free again for logged-out visitors |
| `window.SIM_GATE_FLAGS = { resume:false }` | no auto-restore/auto-run after auth |
| `window.SIM_GATE_FLAGS = { autoSave:false }` | no simulation-history writes |
| `window.TMR_FUNNEL_FLAGS = { enabled:false }` | stops events 9 and 10 |

Set inline on the page **before** the corresponding script tag, then redeploy.
`scripts/tools-live-browser-proof.js` exercises the `gate:false` path against
production on every run, so the rollback is proven continuously rather than
assumed.
