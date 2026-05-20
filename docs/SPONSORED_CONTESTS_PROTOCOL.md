# Sponsored Contests — Workflow & Protocol

This is the required structure for any future sponsored contest on TrustMyRecord.com.
Locked May 20, 2026 alongside the JustBet MLB Handicapping Contest launch.

## Two-page split (REQUIRED)

Every sponsored contest ships as two pages, never one:

| Page         | URL pattern                                  | Purpose                                                |
|--------------|----------------------------------------------|--------------------------------------------------------|
| Landing      | `/contests/<contest-id>/`                    | Marketing, rules, JustBet signup, entry CTA            |
| Dashboard    | `/contests/<contest-id>/dashboard/`          | Submit form, public picks grid, contest leaderboard    |

The landing page MUST NOT contain the public picks grid, the submit form, the leaderboard table, or any "backend deploy pending" / debug language. It is a polished marketing surface only.

The dashboard MUST NOT contain marketing fluff or sponsor sales copy beyond a tight header strip linking back to the landing page. It is the live contest experience.

## Mandatory structure

Every sponsored contest MUST ship with all of the following:

1. **Affiliate signup CTA**
   - Every sponsor signup CTA must route through the official affiliate tracking link.
   - The link MUST be the current active affiliate URL — never a generic sponsor URL.
   - All CTAs use `rel="sponsored noopener"` and a `data-affiliate-link="<contest_id>"` attribute.
   - JustBet (current active link): `https://www.youwager.lv/join-now?affid=BABS123`

2. **Required-to-enter signup banner above rules**
   - A polished sponsor-styled banner above the rules section.
   - Headline pattern: `Create Your <Sponsor> Account Through The Official Contest Link`.
   - Banner copy MUST state the signup-through-link entry requirement clearly.
   - Banner CTA uses the affiliate tracking link.
   - Brand voice only — no first-person identifiers ("Nima's link", "my link", etc.).

3. **Isolated contest pick storage**
   - Picks live in `contest_picks` (or equivalent isolated table) with `contest_id` filter.
   - Contest picks NEVER appear in regular user public records, profile stats, the standard sportsbook leaderboard, the grading-history feed, or any "all picks" query.
   - Submitting a contest pick MUST NOT write to the regular `picks` table.

4. **Sealed-pick reveal**
   - Picks are publicly sealed until that game's first pitch / start time.
   - The public payload from the API MUST strip `selection`, `odds`, `units`, `market_type` before reveal time.
   - Sealing is computed server-side from `game_commence_time` — never trust a client flag.

5. **Public pick grid**
   - A public table with columns: User, Game, Market, Pick, Odds, Units, Status, Result, Net Units.
   - Sealed rows show `🔒 Sealed until first pitch` for the pick cell and `🔒` for odds/units.
   - Revealed rows show the actual pick.

6. **Dedicated contest leaderboard**
   - Separate from the regular site leaderboard.
   - Columns: Rank, User, Picks Used / Max, W, L, P, Win %, Net Units, Last Pick.
   - Ranked by net units (tie: win %, then earliest submission).

7. **Prize structure section**
   - Visible top-3 (or full breakdown) prize cards.
   - Must match the `prize_breakdown` JSON in the `contests` table.

8. **Homepage promo**
   - An animated (glow/pulse, never blink) promo banner on the homepage linking to the contest LANDING page (not the dashboard).
   - Must persist for the contest window only; remove or swap after `contests.ends_at`.

9. **Sponsor branding**
   - Sponsor name/mark visible in hero (`Presented by <Sponsor>`).
   - Use a stored local asset if a clean logo is available; otherwise use a styled wordmark.
   - Never hotlink a fragile sponsor asset.

10. **Sponsor disclosure footnote**
    - The page footer must disclose: sponsor name, affiliate-link usage, and 21+ / responsible play language where applicable.

## Data model

| Table             | Purpose                                                          |
|-------------------|------------------------------------------------------------------|
| `contests`        | Catalog of sponsored contests (id, name, sport, prizes, window)  |
| `contest_entries` | Per-user signup attestation + (optional) admin verification      |
| `contest_picks`   | All contest picks. Isolated from `picks`.                        |

See `trustmyrecord-backend/database/migration_contests.sql`.

## Endpoints

```
GET  /api/contests/:contestId
GET  /api/contests/:contestId/picks         → sealed picks stripped server-side
GET  /api/contests/:contestId/leaderboard
GET  /api/contests/:contestId/games          → upcoming MLB games for the submit form
POST /api/contests/:contestId/picks          → authed + email-verified + signup attestation
```

See `trustmyrecord-backend/routes/contests.js`.

## Acceptance checklist (every new sponsored contest)

- [ ] Two pages live: `/contests/<id>/` (landing) and `/contests/<id>/dashboard/` (live experience).
- [ ] Landing page is marketing-only: no picks grid, no submit form, no leaderboard, no debug/backend messaging.
- [ ] Dashboard holds the submit form, public picks grid, and contest leaderboard.
- [ ] Affiliate CTA uses the active tracking link, not a generic sponsor URL.
- [ ] Signup banner sits ABOVE the rules section on the landing page.
- [ ] Landing page states sponsor signup-through-link is required to enter — explicitly for users arriving from Twitter, TrustMyRecord, or external sources.
- [ ] Dashboard public pick grid renders sealed state pre-first-pitch and revealed state after.
- [ ] Leaderboard is separate from the regular site leaderboard.
- [ ] Prize structure matches the `prize_breakdown` in the DB.
- [ ] Homepage promo links to the landing page (animated, not blinking).
- [ ] No first-person identifiers in copy.
- [ ] Sponsor disclosure footnote present on both pages.
- [ ] Live verification: landing returns 200, dashboard returns 200, picks endpoint returns valid JSON, sealed/revealed states render with a manual time check.

## Rollback-survival rule for sponsored contest assets

Any sitewide rollback to a tree state must preserve the sponsored-contest
asset set. The following files are critical and must survive any emergency
rollback even when the trigger was unrelated (e.g. homepage click breakage):

* `static/media/justbet-logo.png` (or the current sponsor's logo asset)
* `static/js/contest-promo-modal.js`
* `static/css/contest-promo-modal.css`
* The `// JustBet MLB Contest sitewide promo modal loader` block at the end
  of `static/js/config.js`
* The "Two Steps to Enter" section in `contests/<contest-id>/index.html`
* The picks-used pill markup + `loadMyStatus()` wiring in
  `contests/<contest-id>/dashboard/index.html`

If a rollback strictly requires removing one of these (e.g. the modal
is the actual click-interception culprit), document the cause in the
rollback commit message and immediately ticket the restore so the
contest funnel doesn't regress silently.

Sanity check after any rollback:
```
curl -s https://trustmyrecord.com/contests/justbet-mlb/ | grep -c "Two Steps to Enter"   # expect 1
curl -s https://trustmyrecord.com/static/media/justbet-logo.png -o /dev/null -w "%{http_code}"  # expect 200
curl -s https://trustmyrecord.com/static/js/config.js | grep -c "contest-promo-modal"   # expect >=1
```
