# TrustMyRecord growth program — audit, baseline, and what shipped

Branch `growth-program` in both `trustmyrecord-backend` and `tmrfe3`. Nothing pushed, nothing deployed.
All figures measured against the production database on 2026-08-24. No layout, page, or graphic was redesigned.

---

## 1. What tracking already existed

TMR was already well instrumented. Almost every Phase 1 item had a home before this work started.

| Store | What it captures | State |
|---|---|---|
| `services/activationFunnel.js` → `activation_funnel_daily`, `user_activation` | Simulator funnel, pre and post account, plus a frozen A/B | Live. Only knows people who touched a simulator |
| `services/participationLog.js` → `user_participation`, `user_activation_profile` | Per account, per day: picks, poll votes, trivia, forum, feed, follows, active days | Live, capture began 2026-08-09 |
| `services/milestones.js` → `community_milestones`, `user_awards` | First pick, 10/25/50/100/250/500/1000 picks, streaks, monthly awards | Live |
| `services/signupTelemetry.js` → `signup_telemetry` | Signup attempts, abuse signals, first touch source | Live since 2026-08-23 |
| `users.signup_source` (JSONB), `users.heard_about` | First touch referrer/UTM/gclid/fbclid, self reported source | Live, 63 of 97 recent signups attributed |
| `services/tmrReferrals.js` → `tmr_referrals` | Referral with a qualified activation gate | Live |
| `static/js/analytics.js`, `first-pick-onboarding.js` | GA4 events: `account_created`, `first_pick_cta_clicked`, `first_pick_started`, `first_pick_submitted`, `first_pick_abandoned` | Live |

Already built, so **not** rebuilt: leaderboards, contests, polls, trivia, forum, milestones, awards, referrals,
TMR Coin rewards, share menu (`tmr-share.js`), internal link hub (`tmr-linkhub.js`), `/welcome/` checklist,
`/today/` daily dashboard, simulator to pick handoff (`sim-pick-prefill.js`), welcome email, first pick reminder email.

### Two defects found in the existing measurement

**Retention was not measurable.** `user_activation_profile.d7_at` means *any activity ever at or after
signup + 7 days*. That is trivially true for any old account and impossible for a new one, so the column
cannot answer "of the people who signed up in July, how many were still here a week later".

**A rolling 24h activity test reports ~96% D1 and measures nothing.** A `sessions` row is written at login
*and at every token refresh*, so the signup itself satisfies the test. Both are corrected in
`services/growthMetrics.js` with calendar day brackets in Eastern.

`user_analytics` is an empty table (0 rows). Dead, left alone.

---

## 2. Baseline (production, 2026-08-24)

907 accounts exist. **119 are real members** — the rest are bots, test accounts, internal test and deleted.
Every number below uses the real member definition.

### Activation

| | All members | Signed up in last 90d |
|---|---|---|
| Cohort | 119 | 97 |
| Made a first pick | 46 (38.7%) | 29 (29.9%) |
| First pick within 24h | 44 | 27 (27.8%) |
| First pick within 72h | 45 | 28 (28.9%) |
| Reached 2 picks | 30 | 18 |
| Reached 5 | 21 | 12 |
| Reached 10 | 18 | 10 |
| Reached 25 | 15 | 9 |
| Reached 50 | 11 | — |
| Reached 100 | 5 | — |

**93.1% of every member who has ever made a first pick made it within 24 hours of signing up.**

### Retention (calendar day brackets, Eastern, each against a closed window)

| | Returned | Eligible | Rate |
|---|---|---|---|
| D1 — active on signup day + 1 | 16 | 113 | 14.2% |
| D7 — active on any of days +2..+7 | 14 | 97 | 14.4% |
| D30 — active on any of days +8..+30 | 13 | 56 | 23.2% |

Active in the last 7 days: 30 of 119 (25.2%). Last 30 days: 70 (58.8%). Never active at all: 3.
D30 sits above D7 because the D30-eligible cohort is the older, launch-era membership.

### Feature reach (members who have EVER used it)

| Feature | Members | Reach |
|---|---|---|
| Picks | 46 | 38.7% |
| Feed posts | 45 | 37.8% |
| Simulator (saved a result) | 35 | 29.4% |
| Follows | 12 | 10.1% |
| Polls | 10 | 8.4% |
| Trivia | 8 | 6.7% |
| Forum | 2 | 1.7% |
| Contests | 0 | 0% |

### Acquisition

63 of 97 recent signups carry first touch attribution, 34 answered "how did you hear about us".
The attributed traffic is overwhelmingly direct or internal; one signup came from chatgpt.com.
Visitor, organic and referral **session** counts are GA4 only — they are not in this database, and this
report does not invent them.

---

## 3. The largest measurable drop-offs

1. **Registration → first pick: 68 of 97 lost (70.1%).** By a distance the biggest leak on the platform.
2. **First pick → second pick: 11 of 29 lost (37.9%).** Nothing on the site addressed this before now.
3. **Contests: 0 of 119 members have ever entered one.** A complete feature with no participants.
4. **Forum: 117 of 119 have never posted.** Trivia 111 never, polls 109 never.
5. Beyond the second pick the ladder holds well — 5→10 keeps 83%, 10→25 keeps 90%. The problem is
   entirely at the front.

### The finding that changes the strategy

**The first pick reminder email converted 0 out of 26.** 26 members received it, none of them has ever
made a pick. It was last sent 2026-07-20 and no cron runs it — `scripts/send-first-pick-reminders.js`
is a manual script wired to nothing.

Combined with the 93.1% figure above: **activation is won or lost in the first session.** Reviving that
cron would spend sending reputation on a channel with a measured 0% conversion. It was deliberately
left switched off. The lever is the first session and the routes into it, not a nurture sequence.

---

## 4. Which existing features are poorly connected

Present and working: simulator → sportsbook pick (`sim-pick-prefill.js`, `?simpick=1`), register → sportsbook,
sitewide share menu, sitewide internal link hub, `/welcome/` checklist, `/today/` daily dashboard.

Missing, in order of the traffic each would move:

- **Poll vote → lock that prediction on your record.** A poll vote *is* a prediction; the member has
  already done the hard part. No connector exists.
- **Matchup article / Matchup of the Day → pick that game.** 43 MLB handicapping pages and 15 MOTD pages
  have no path into the sportsbook for the game they are about.
- **Trivia result → make a real prediction.** No connector.
- **Leaderboard row → compare your record.** No connector.
- **Contest entry from normal activity.** Contests require a separate workflow, which is why the count is 0.
- **Simulator → pick is moneyline only** and lives on one page.

---

## 5. Highest value SEO opportunities already supported by TMR data

Only families where the data genuinely exists are listed. Thin page generation is explicitly excluded.

| Opportunity | Data behind it | Current pages |
|---|---|---|
| **Team pages** (record, trends, situational splits) | 39,893 MLB historical games, 2010‑04‑04 to 2026‑08‑22 | **0** |
| **Head to head history** (matchup pages) | Same 39,893 game corpus | 1 |
| **Simulator result pages** | 4,039 public sim runs across 234 distinct matchups | 0 |
| **Member consensus per game** | 356 games have 3 or more distinct members with a public pick | 0 |
| **Verified record / handicapper pages** | 3,268 graded public picks over 13 sports and 1,510 games | 118 profile pages |
| Matchup previews | 21 matchup articles, 43 MLB handicapping pages | 43 |

Team pages and head-to-head history are the largest untapped families and the only two with a five figure
row count behind them. Member consensus (Phase 9) is real for 356 games but the sample per game is small —
any such page must print its sample size.

---

## 6. Prioritised implementation list

Ranked by measured impact per unit of risk. ✅ = shipped in this branch.

1. ✅ **Measurement that can answer the questions** — everything below depends on it.
2. ✅ **First pick → second pick nudge** — 38% loss, nothing existed, low risk.
3. ✅ **A board a new member can win** — the all time board needs 20 graded picks.
4. **Poll vote → lock it as a pick.** Highest value remaining connector: the member has already predicted.
5. **Matchup article / MOTD → pick that game.** 58 existing pages, currently dead ends.
6. **Contests that count normal activity** rather than a separate workflow. Reach is 0%.
7. **Team and head-to-head SEO pages** off the 39,893 game corpus.
8. **Weekly personal recap** — the only re-engagement message with a plausible audience, since
   the reminder email converted 0/26.
9. **Member consensus surfaces**, sample size printed, once per-game samples support it.
10. **A/B tests on activation copy** — only meaningful once the events from items 2 and 4 accumulate.

Deliberately **not** done: reviving the first pick reminder cron (0/26 measured), any homepage
rearrangement, any new visual language.

---

## 7. Exactly what was implemented

### `trustmyrecord-backend`

**`services/growthMetrics.js`** (new). Read only. Adds no capture and no tables. Derives the whole funnel
from source tables with full history — `users`, `picks`, `poll_votes`, `trivia_attempts`, `forum_threads`,
`forum_posts`, `feed_posts`, `pick_comments`, `poll_comments`, `feed_post_comments`, `follows`, `sessions`
— so an April cohort is measured the same way as today's. Corrects the two definitional defects in §1.
Queries run **sequentially** behind a 5 minute cache: nine parallel full table aggregations against the
256 MB Postgres is the exact pattern that exhausted the pool on 2026-08-24.

**`routes/adminGrowth.js`** (new), mounted at `/api/admin/growth`. `/report`, `/tracking-health`, `/funnel`.
Admin gate copied from `routes/participation.js` — `ADMIN_TOKEN` header, or an `account_type='admin'` bearer.

**`routes/participation.js`** — added `GET /my-progress`, the first non-admin endpoint in the file. Returns
total / public / graded / pending pick counts and the next gate the member has not reached. Every gate is
an existing site mechanic read from the constants the backend already enforces: 2 picks, 10 picks (first
community milestone), 20 **graded** (leaderboard eligibility), 25 **graded** (Verified Handicapper).
Graded and total are separate fields because two of the three gates are on graded picks.

**`routes/users.js`** — added `GET /leaderboard/scoped`. Same `mainLeaderboardEligibleSql` builder with one
extra scope predicate, so a scoped board is the main leaderboard *narrowed*, never a second definition of a
record. `cohort=rookie` (joined in the last 30 days), `period=week|month|season`, and `sport=` composing
through the same `sportScopeSql` the sport board uses. `minPicks` defaults to 1 here, not 20 — on a weekly
board a 20 pick floor is an empty page. **`/leaderboard` itself is untouched.**

**`server.js`** — one route mount.

### `tmrfe3`

**`admin/growth/index.html`** (new). Same chrome as `/admin/`: same dark panel grid, same admin token
handling, same fetch helper. No new design system. Renders the funnel, activation speed, the pick ladder,
feature reach, a signup/first-pick sparkline, first touch acquisition, and a tracking health table showing
when each capture layer last received a row. `noindex`. Linked from `/admin/`.

**`static/js/pick-progress-nudge.js`** (new). Renders the **existing** `.tmr-fp-reminder` strip that
`first-pick-onboarding.js` already ships, in the same place, with the same styles — no new component, no
layout change. Quiet by construction: once per Eastern calendar day per browser, dismissible for the day,
never for a zero pick member (that is the other script's job), never once every gate is reached, never on
the pages where the member is already making a pick. Emits `pick_progress_nudge_viewed` / `_clicked` /
`_dismissed` with the gate and pick counts, so Phase 12 can test copy against behaviour.
Loaded on home, profile, `/today/`, `/leaderboards/`, `/polls/`, `/forum/`.

**`leaderboards/index.html`** — a **Board** select added to the existing filter row using the existing
`.field` markup: All time (default, unchanged), This week, This month, This season, New members, New
members this month. Nothing is rearranged and no other control moves. `BOARD_TO_SCOPE` is the only place
the option-to-query mapping lives, so an option missing from it cannot silently serve a different board
than the one selected — the failure `SORT_TO_API` exists to prevent.

**`static/js/backend-api.js`** — `getScopedLeaderboard()`.

### Copy shown to members

Every rung's wording states a real, enforced mechanic. It never invents a reward, and it says *graded*
where the gate is on graded picks:

- 1 pick → "Your verified record has started. One pick is a guess. Add a second and it becomes a record."
- 2–9 → "N picks locked. M more picks and your 10-pick milestone posts to the community feed."
- 10–19 → "N graded picks. M more graded picks put you on the leaderboard." (plus pending count if any)
- 20–24 → "N graded picks — you are on the leaderboard. M more graded picks make you a Verified Handicapper."

---

## 8. Verification

**Growth API** — mounted in an isolated express app against the production database:
no token → 401, wrong token → 401, valid token → 200 with 119 members, 6 funnel stages, 10 health probes,
31 daily points. Second call served from cache. `/tracking-health` → 200.

**Participation observer coverage** — of the 54 members who have made a pick since capture began on
2026-08-09, **54 were logged by the observer (100%)**. The observer is not missing the pick route.

**`/my-progress`** — anonymous → 401. User 667 (1 pick, 1 graded) → `next_gate: second_pick`, 1 remaining.
Users 1 and 626 (665 and 330 picks) → `next_gate: null`, all five gates reached.

**Scoped leaderboard** — against production: `cohort=rookie` 15 rows, `period=week` 14, `period=month` 24,
`period=week&sport=mlb` 14, `cohort=rookie&sport=mlb` 15, `cohort=rookie&period=month&sport=nfl` 1.
Unknown `period` or `cohort` → 400. **Regression: the untouched main board returns 12 rows, 46 eligible,
same top two members, before and after the change.**

**Nudge** — `tests/pick-progress-nudge.test.js`, **14/14 passing**. jsdom loads the real file and asserts on
the DOM it actually produces: the copy for each rung, singular vs plural wording at one remaining, graded
vs total in the leaderboard rung, the once-a-day rule, dismissal persistence, the suppressed paths, the
logged-out path making no API call at all, analytics payloads, and that a failed or malformed request
renders nothing rather than guessing.

**Leaderboard page** — parsed with jsdom: `boardFilter` present with 6 options, the three existing selects
unchanged at 9/5/9 options, all three real inline script blocks syntactically valid.

A bug was found and fixed during verification: the scoped board's denominator query reused a bind
placeholder that already held a `text[]`, producing `graded_picks >= text[]`. Caught by the endpoint
returning 500 before anything was committed.

---

## 9. Before / after metrics

Not available yet, and this section will stay empty until it honestly can be filled. Nothing is deployed,
so no member has seen any of it.

The baseline to measure against is §2, captured 2026-08-24. Once deployed, `/admin/growth/` reproduces
every one of those figures on demand, and these are the specific numbers to watch:

| Metric | Baseline (2026-08-24) |
|---|---|
| First pick within 24h, 90d cohort | 27.8% |
| First pick ever, 90d cohort | 29.9% |
| Second pick, of those who made a first | 62.1% |
| D1 / D7 / D30 | 14.2% / 14.4% / 23.2% |
| Poll reach | 8.4% |
| Trivia reach | 6.7% |
| Forum reach | 1.7% |
| Contest reach | 0% |

The nudge's own effect is separately attributable through `pick_progress_nudge_viewed` and `_clicked`
against the second-pick conversion, which is why those events carry the gate and the pick counts.

---

# MEASUREMENT-MODE CHECKPOINT — 2026-08-25

Everything below was deployed on 2026-08-24/25. **Read this before building anything: every item
here already exists in production.** Nothing in this list should be rebuilt, duplicated or
redesigned. The program is in measurement mode; the next step is reading data, not shipping.

## 1. Baselines to beat (historical, pre-change)

| Metric | Value | Sample |
|---|---|---|
| First pick within 24h, 90-day cohort | **27.8%** | 27 of 97 |
| First pick ever, 90-day cohort | 29.9% | 29 of 97 |
| Of everyone who ever activated, share who did it in 24h | **93.1%** | — |
| Reached `/welcome/` route | **29%** within 24h | 15 of 51 (60d) |
| Simulator-gate route | **13%** within 24h | 4 of 32 (60d) |
| Registration → any measurable action, 24h | **37%** | 31 of 83 (60d); 52 did nothing |
| Retention D1 / D7 / D30 | 14.2% / 14.4% / 23.2% | calendar-day brackets, ET |
| Members (real) | 119–121 | of ~907 accounts |

Activation is decided in the first session: median time to Pick #1 among converters is **4.5
minutes**, and of 74 zero-pick members only **1** ever returned on a later day.

## 2. Everything now deployed

| Thing | Where it lives | State |
|---|---|---|
| Growth dashboard | `services/growthMetrics.js`, `routes/adminGrowth.js`, `/admin/growth/` | live, admin-only, noindex |
| Pick #1 → #2 progression | `GET /api/participation/my-progress`, `static/js/pick-progress-nudge.js` | live |
| Rookie / weekly / monthly / season boards | `GET /api/users/leaderboard/scoped`, Board select on `/leaderboards/` | live; `/leaderboard` untouched |
| Poll → Pick, `winner` | `services/pollPickBridge.js`, `GET /api/polls/:id/pick-bridge` | live |
| Poll → Pick, `game_total` | same service, strict exact-line gate | live |
| Real-market total generation | `services/mlbQuizBot.js` attachBoardTotals() | live; **not yet exercised** (quiz posts 5am ET) |
| Zero-pick strip surfaces | `first-pick-onboarding.js` on `/`, `/sportsbook/`, `/profile/`, `/welcome/`, `/today/`, `/polls/`, `/forum/`, `/trivia/`, `/mlb-simulator/`, `/nfl-simulator/` | live |
| `/welcome/` control vs treatment | `static/js/welcome-checklist.js` | live, 50/50, pinned |
| `/welcome/` + `/today/` analytics | one `analytics.js` tag each | live |
| Simulator zero-pick strip | both simulator pages | live |
| Simulator Pick #2 support | `pick-progress-nudge.js` on both simulator pages | live |
| Surface / cta_location dimensions | all three strips | live |
| Sportsbook activation-arrival event | `first-pick-onboarding.js` emitActivationArrival() | live |
| Poll → Pick stand-down | both generic strips yield to `#tmr-poll-bridge` | live |

## 3. Measurement start times (UTC) — historical vs post-change must stay separable

| Change | Start |
|---|---|
| Growth dashboard page | 2026-08-24T18:25:16Z |
| Pick #1 → #2 progression | 2026-08-24T18:31:17Z |
| Scoped leaderboards | 2026-08-24T18:38:14Z |
| Growth metrics API | 2026-08-24T19:09:42Z |
| Poll → Pick (winner) | 2026-08-24T21:01:11Z |
| Poll → Pick frontend + quiz wiring | 2026-08-24T21:03:56Z / 21:10:47Z |
| Poll → Pick (game_total) | 2026-08-24T21:24:06Z |
| **Real-total poll generation** | 2026-08-24T21:59:35Z |
| **Expanded zero-pick strip + /welcome/ experiment** | 2026-08-24T22:42:27Z |
| **Corrected analytics coverage** (/welcome/, /today/) | 2026-08-25T01:09:39Z |
| **Simulator activation strip** | 2026-08-25T01:24:52Z |
| **Simulator Pick #2 progression** | 2026-08-25T01:41:26Z |
| **Arrival event + surface + stand-down** | 2026-08-25T02:06:19Z |

Client-side events before 2026-08-25T01:09:39Z never left the browser on `/welcome/` and `/today/`
— those pages had no analytics at all. Do not attempt to reconstruct them.

## 4. Event chains as currently implemented

**Welcome**
`welcome_arm_assigned {arm}` → `welcome_viewed {arm}` → `sportsbook_onboarding_viewed {surface:'welcome', cta_location, has_picks}`
→ `welcome_action_clicked {action:'pick', arm}` → `activation_pick_flow_arrival {source:'welcome_checklist', cta_location:'welcome_board_row', from_surface:'welcome', arm}`
→ `first_pick_started` → **Pick #1 server-side** (`picks` table).

**Simulator**
signup attribution `users.signup_source.landing` (`/mlb-simulator/`, `/nfl-simulator/`) → `sportsbook_onboarding_viewed {surface:'mlb_simulator'|'nfl_simulator'}`
→ `first_pick_cta_clicked {cta_location:'reminder_strip', surface}` → `activation_pick_flow_arrival {source:'first_pick_strip', from_surface}`
→ `first_pick_started` → **Pick #1 server-side**.

**Poll → Pick**
`poll_pick_bridge_shown {poll_id, poll_type, market, sport, zero_pick_member, surface:'polls', cta_location}`
→ `poll_pick_bridge_clicked {+ line, pick_team}` → `activation_pick_flow_arrival {source:'poll', poll_type, from_surface:'polls'}`
→ normal `/sportsbook/?simpick=1` prefill → `simulator_pick_submitted` / `simulator_verified_pick_created {source:'poll'}` → **verified pick server-side**.

**Pick #2**
`pick_progress_nudge_viewed|_clicked|_declined {gate, picks_total, picks_graded, surface, cta_location}`,
handoff `{source:'pick_progress_strip', gate}`.

## 5. Surface values — do not collapse these back

`homepage`, `welcome`, `today`, `polls`, `forum`, `trivia`, `mlb_simulator`, `nfl_simulator`,
plus `sportsbook`, `profile`, and `other`. The old single `sitewide_reminder` value made the new
coverage impossible to compare page by page; it is gone from every event.

`cta_location` values: `reminder_strip`, `sportsbook_onboarding_panel`, `sportsbook_reminder`,
`pick_progress_strip`, `poll_pick_bridge`, `welcome_board_row`.

## 6. Intentional behaviour — verify before "fixing"

- **0 picks** → "Start your verified record" (`first-pick-onboarding.js`)
- **1 pick** → "Make Pick #2" (`pick-progress-nudge.js`)
- **5 picks** → progress toward the 10-pick milestone — **pre-existing**, from the `milestone_10`
  gate added 2026-08-24T18:31, not introduced by the simulator work
- **2+ picks with every gate reached** → nothing
- **MLB simulator conversion CTA wins** over both generic prompts when its panel is present
- **Poll → Pick CTA wins** over the generic Pick #2 prompt when its strip is present
- Resulting picks always go through the **normal verified-pick flow** — no parallel submit path
- **Pick #1 creation is server-side truth**; no client event claims a pick was created
- **No second leaderboard, poll, pick or onboarding system may be created**

## 7. Accepted limitations — not bugs, do not spend time here

1. Client-side GA4 totals require GA4 UI/API access and are not queryable from a terminal.
2. A generic nudge impression may fire before the Poll → Pick strip replaces it. The strip genuinely
   was on screen, so the impression is honest; click-through on `/polls/` will read low for it.
3. Activation-arrival attribution is `sessionStorage`-scoped and misses new-tab or unusual
   navigation cases.

## 8. How to pull the next measurement report

**Use `/admin/growth/`. Do not build another dashboard.** It already renders the funnel, activation
speed, the pick ladder, feature reach, acquisition and tracking health, from a 5-minute cache.
The same data is available as JSON at `GET /api/admin/growth/report?window_days=N` with an
`x-admin-token` header, or an `account_type='admin'` bearer token.

Server-side, per measurement start — one query, bind the start timestamp as `$1`:

```sql
WITH m AS (
  SELECT u.* FROM users u
   WHERE u.deleted_at IS NULL
     AND COALESCE(u.is_official_bot,false) = false
     AND COALESCE(u.is_internal_test,false) = false
     AND LOWER(COALESCE(u.account_type,'real')) NOT IN ('admin','test','bot','banned')
     AND u.username !~* '^qa[_-]'
)
SELECT
  COUNT(*) FILTER (WHERE created_at >= $1) AS registrations,
  COUNT(*) FILTER (WHERE created_at >= $1 AND EXISTS (
     SELECT 1 FROM picks p WHERE p.user_id = m.id AND p.deleted_at IS NULL
       AND p.created_at < m.created_at + INTERVAL '24 hours')) AS pick1_24h,
  COUNT(*) FILTER (WHERE created_at >= $1
       AND COALESCE(signup_source->>'landing','') ~* 'simulator') AS sim_registrations,
  COUNT(*) FILTER (WHERE created_at >= $1
       AND COALESCE(signup_source->>'landing','') ~* 'simulator' AND EXISTS (
     SELECT 1 FROM picks p WHERE p.user_id = m.id AND p.deleted_at IS NULL
       AND p.created_at < m.created_at + INTERVAL '24 hours')) AS sim_pick1_24h,
  COUNT(*) FILTER (WHERE created_at >= $1 AND (
     SELECT COUNT(*) FROM picks p WHERE p.user_id = m.id AND p.deleted_at IS NULL) >= 2) AS reached_pick2
FROM m;
```

Poll-originated verified picks: the resulting rows are ordinary picks with no poll marker in the
`picks` table by design, so attribution lives in GA4 via `simulator_verified_pick_created
{source:'poll'}`.

**GA4 REQUIRED** for: `/welcome/` control vs treatment exposures, all CTA impressions and clicks,
`activation_pick_flow_arrival`, `first_pick_started`, poll-bridge shown/clicked, and
poll-originated pick attribution. Split by `arm`, `surface`, `cta_location`, `poll_type`. There is
no server-side copy of these and one must not be built.

## 9. Sample-size rule

Do not declare a winner from a handful of users. For `/welcome/` control vs treatment, simulator
activation and Poll → Pick, report raw counts as they accumulate and judge on **first pick within
24h**, effect size against sample size, downstream Pick #2 behaviour, and any obvious regression.
**Clicks alone do not decide anything.** As of 2026-08-25T02:00Z there had been **0 registrations**
since the analytics fix, so every post-change conversion figure starts empty.

---

## Why /admin/growth/ is noindex

The standing site rule is **never noindex a public TMR page**, enforced by the allowlist in
`tests/seo-indexability-regression-test.js`. `/admin/growth/` is an authorised exception, granted
explicitly by the site owner on 2026-08-24.

It qualifies on exactly the grounds `SEO_INDEXING_PROTOCOL.md` section 2 already carves out for
`/admin/tmr-economy/` and `/admin/tmr-rewards/`: the page is linked only from `/admin/`, it is
useless without an admin session, and every figure it renders is internal membership and conversion
data — member counts, activation rates, retention brackets, per-feature reach. There is nothing on
it a search result should ever show.

**The exception is this one route and nothing else.** It is not a precedent for noindexing public
pages, and it is not a licence to widen the allowlist. Anything public stays indexable.

The page shipped briefly as `index, follow` (frontend `61206753c`) because the SEO regression test
rejected the `noindex` and expanding a governed allowlist was not something to do unasked. The owner
then authorised it directly, so the page carries `noindex, nofollow` and the URL is on the
allowlist.

---

## The poll bridge, and the 8.5 that made totals unconvertible

The Poll to Pick bridge converts a poll vote into an ordinary verified pick. It supports two poll
metrics: `winner` (maps onto h2h) and `game_total` (maps onto totals, behind a strict exact-line gate).

**The generator used to publish a hardcoded 8.5 for every MLB game total** (`mlbQuizBot.gameQuestion`,
`const line = 8.5`). Measured 2026-08-24: all 78 `game_total` options ever created were 8.5, while the
live board ranged 6.5 to 11 and only 1 of 22 upcoming games sat at 8.5. Replaying the exact-line gate
over all 78: **zero passed**. The gate was correct; the generated number was fiction.

**Fixed 2026-08-24** (backend `e7340cf`). `attachBoardTotals` reuses the bridge's own board reader —
`readBoardSnapshot`, `findBoardGame`, `boardTotalsFor` — so the generator and the bridge read the same
board through the same code and cannot disagree. A game with no board row, an ambiguous matchup, no
totals market or an unusable number gets the **winner question instead**; nothing is manufactured.

Replayed on the live board after the fix: **24 of 25** upcoming games get a real total, and all 24 would
pass the gate at that instant. Distribution: 7.5 ×7, 8 ×5, 7 ×4, 9 ×3, 11 ×2, 6.5 ×2, 8.5 ×1.

Two things worth remembering:

- **Whole totals push.** `ouRanges` used `ceil`/`floor`, which made BOTH buckets true at a whole line —
  a push graded as a win. Over 7 is now 8+, Under 7 is 6 or fewer, and exactly 7 matches neither, which
  is how `pollAutoGrade` already voids a question (`VOID_NO_OPTION`). No new grading logic.
- **The bridge gate is unchanged and still required.** A poll generated at 7.5 against a board that has
  since moved to 8 stays refused. Generation-time accuracy and conversion-time integrity are separate
  jobs.

Volume, last 14 days: `player_stat` 108, `game_total` 24, `winner` 19.

### Reverse direction, deliberately not built

Surfacing "TMR community: 62% Cubs" on the sportsbook board is documented and **not implemented**. The
board has `game-meta-row` and `board-meta-chip` slots that could carry it, and `/consensus/` exists.
It is deferred because the priority is 0 picks to Pick #1, not more informational UI, and because a
poll-to-game lookup would be needed on every board row.

---

## Notes for whoever picks this up

- Both branches are `growth-program`. Nothing is pushed. Pushing the backend to `master` auto-deploys.
- The backend `growth-program` branch also contains another session's postgame ticker work
  (commit `c3bdb82`) that was already staged when these commits were made, and `polls/index.html` in
  `tmrfe3` carries unrelated working tree changes from the same source. Nothing was lost or overwritten.
- This repo stores some blobs CRLF and some LF while `core.autocrlf=true` strips CR on commit. Edited files
  were restored to the endings they already had; commit with `-c core.autocrlf=false` when touching a CRLF
  file, or a one line change reads as a whole file rewrite.
### Rebasing this branch onto origin — two commits need paths dropped

Verified 2026-08-24 with `--ignore-cr-at-eol`. Replaying all five commits unedited would ship two
regressions, because two of them carry file content that is not mine — swept in from a concurrent
session's working tree.

- **`386fd0acf` — drop `index.html` entirely.** Its only real change to that file is a homepage build
  hash bump, `923e1232ace0` -> `f405365e34fd`. That asset does **not** exist on `origin/main`, whose
  current build is `adda6284733a`, so replaying it points the homepage at a script that 404s. None of
  my content is in that hunk; the nudge tag arrives separately in `b2d73c123` (verified: 1 insertion,
  0 deletions, and it is the tag). The `f405365e34fd` asset is branch-local — it exists only because
  it was committed in `55de3c12d` on this branch — so nothing on `main` should ever reference it.
  Running `scripts/build_home_critical.py` after the rebase emits the correct hash off main's
  `tmr-home-live.js` and index.html resolves itself.
- **`c3bdb82` — keep only `routes/participation.js`.** Do not drop the whole commit: it holds the
  `/my-progress` endpoint. The rest of it (`package.json`, `services/mlbPostgameInsights.js`,
  `services/postgame/*`, two test files) belongs to the postgame ticker work and is already on
  `master` via `fe204d5`.
- **Do not carry `static/css/tmr-home-v2.css` or `index.html` from `f981164d2` or earlier.** That side
  of the branch holds the tightened hero — h1 62px -> 56px, margins 26px -> 8px, `.hero-in` flex-start
  -> center, `.comp-stage` 200px -> 170px — which is the viewport-flush geometry that was rejected.
  `origin/main` has the approved baseline and keeps it. My five commits do not otherwise touch either file.

- `ENABLE_FIRST_PICK_EMAILS=true` in production. The welcome email is sent inline from `routes/auth.js`
  and is working (81 sent, most recent today). The first pick reminder is a manual script with no cron and
  a measured 0/26 conversion — leave it off.
