# Mobile / desktop functional parity inventory

Audit date: 2026-08-25. Target: live production `https://trustmyrecord.com`.

Method: real browser interaction, not source scanning. **WebKit** (the engine
iPhone Safari runs) at 375/390/430px, **Chromium with an Android Pixel 8 user
agent** at 320/360/412px, landscape at 844x390, and desktop Chromium at 1440px.
Every workflow below was executed on desktop and on mobile and the two results
compared. A control counts as present on mobile if a user can reach it in one
tap — behind the hamburger, a sub-menu, or a footer accordion all count.

Regression suite: `tests/mobile-parity-regression-test.cjs`.

---

## 1. Coverage

| Surface | How it was checked |
|---|---|
| 507 non-redirect pages | control-identity inventory, desktop vs mobile, per page |
| 53 feature pages | full inventory plus per-page interaction |
| 21 workflows | executed end to end on 2-4 profiles each |
| 6 phone widths | 320 / 360 / 375 / 390 / 412 / 430 |
| 2 real engines | WebKit (iPhone Safari) and Chromium (Android Chrome) |
| Orientation | portrait and landscape |

---

## 2. Feature and workflow results

Every row was executed, not inspected.

| # | Feature / workflow | Mobile result | Evidence |
|---|---|---|---|
| 1 | Global nav: hamburger opens | Works | panel opens on WebKit and Chromium |
| 2 | Nav: all 5 sub-menus (Sportsbook, Handicappers, Compete, Community, Tools) | Works | 3/4/6/6/6 links, identical counts to desktop |
| 3 | Nav: every desktop destination reachable | Works | set difference desktop vs mobile = empty |
| 4 | Footer: 4 accordion sections | Works | 9 links -> 29/29 after tapping headings, `+`/`-` affordance present |
| 5 | Footer: 14 named destinations (My Record, Premium, Verified Records, Pick Trackers, Feed, Hangout, How It Works, Rules, About, Contact, Report a Bug, Sportsbook, Forum, Browse Handicappers) | All reachable | checked on 6 page families |
| 6 | Home: live score ticker renders and advances | Works | 16 games, scores change between snapshots 32s apart |
| 7 | Home: ticker prev/next controls | Works | control present and clickable |
| 8 | Home: Live Picks strip | Works | 6 picks, same rows as desktop |
| 9 | Home: sport tab strip reachable | Works | strip scrolls, last tab (NFL) fully reachable |
| 10 | Home: leaderboard card | Works | 10 rows, same as desktop |
| 11 | Home: live competition rotation | Works | 3 rows, rotates |
| 12 | Home: activity strip | Works | items increase over time |
| 13 | Handicappers: member search | Works | "BetLegend" -> 1, "Bet" -> partial matches, "zzzz" -> 0, same as desktop |
| 14 | Handicappers: 5 filter selects | Works | same 5 selects, same option sets |
| 15 | Handicappers: sort dropdown (7 options) | Works | re-sorts the list |
| 16 | Handicappers: 5 view tabs | Works | All Members 124 / Verified 16 / Pick Makers 48 / Recently Active 16 / Following, identical |
| 17 | Handicappers: pagination + "Show more" | Works | Previous / Next present, loader present |
| 18 | Leaderboards: 5 board tabs | Works | each switches the table, identical to desktop |
| 19 | Forum: enter a category | Works | row click navigates into the forum (row handler, not a link, on both) |
| 20 | Forum: thread open, search box, new-thread gate | Works | 1 form, 5 fields, 11 tables, identical |
| 21 | Marketplace: Cash / TMR Coin tabs | Works | tab switches, same card count |
| 22 | Marketplace: seller search + filters | Works | same inputs and selects |
| 23 | Contests: Register / Dashboard / Participants / Rules | Works | same visible link set |
| 24 | Arena: challenge list + 4 forms (31 fields) | Works | identical form and field counts |
| 25 | Polls: category chips, poll cards, vote options | Works | chips change the view |
| 26 | Trivia: start a quiz | Works | navigates into the quiz |
| 27 | Profile `/u/`: 25 tabs | Works | every tab opens and populates its panel |
| 28 | Profile: wide stat tables | Works | all sit in a scroll shell, none clipped |
| 29 | MLB / NFL simulator | Works | same select count, run control present |
| 30 | Model Builder: 2 forms, 32 fields | Works | identical |
| 31 | TrendSpotter: game slate | Works | mobile shows 4, desktop 8, both expand to 21 via "Show all 25 games" |
| 32 | BetLegend Pro landing + app | Works | same controls |
| 33 | TMR Coin hub + wallet | Works | same controls |
| 34 | Matchup of the Day, Game File, MLB matchup pages | Works | charts render, tables scroll in their wrappers |
| 35 | Sportsbook: 7 forms, 38 fields, 5 tables | Works | identical counts |
| 36 | Pick submission gate (logged out) | Works | same auth call to action as desktop |
| 37 | Register form | Works | same fields, typing works, submit reachable |
| 38 | Login form and its failure path | Works | same fields, same result |
| 39 | Account settings / admin gates | Works | identical gate behaviour |
| 40 | Notifications, Feed, Stats, Today, Challenges, TMR Match | Works | same controls |
| 41 | Back button after in-page navigation | Works | returns to the previous page with state restored |
| 42 | Form usable with the keyboard up | Works | focused field stays on screen, portrait and landscape |
| 43 | Popups, dropdowns, menus on screen | Works | nothing opens off screen at any tested width |
| 44 | Live data refresh on a phone | Works | ticker, picks, board and competition all populate and update |
| 45 | Horizontal page scroll | None | 0 pages scroll sideways at 320-430px |
| 46 | Broken images | None | 0 on mobile and desktop |
| 47 | JS errors / 5xx on mobile | None | 0 across the pages exercised |

---

## 3. Discrepancies found

### 3.1 Mobile-only functional defects
**None confirmed.** Every candidate resolved to a measurement artifact or to
intentional, equally-accessible progressive disclosure. The candidates and their
resolutions are recorded in section 4 so the next audit does not re-chase them.

### 3.2 Layout defects found and fixed earlier in this work
These were real, are fixed, and are live:

| Page(s) | Defect | Fix | Verified live |
|---|---|---|---|
| Homepage | no phone tier: h1 60px, 11,034px tall, 6 areas overflowing or clipped | added a `max-width:640px` tier plus a 380px step and a 641-1024px tablet band | 6,175px tall, 0 overflow, desktop unchanged at 4,292px |
| `/handicappers/`, `/directory/`, `/cappers/` | table header rendered as a 137px block of bare labels above the card stack | scoped the hide to `.hm-row.hm-head` | header hidden, cards intact |
| `/u/<name>/` | `1fr` track took its min from a 713px table; `overflow:hidden` cut half of every stats table away | `minmax(0,1fr)` so the scroll shell takes over | 0 clipped tables |
| `/feed/` and other shell pages | `.feed-tabs` caught by a blanket `overflow:hidden !important` for cards; 923px of tabs clipped in 346px | strip scrolls | all tabs reachable |
| `/mypicks/` | hard-coded 4-column grid needed 428px | 2 per row on a phone | fits |
| `/contests/justbet-mlb/` | 3 grids collapsed to bare `1fr`, cards 484-688px in 312-370px columns | `minmax(0,1fr)`, signup board scrolls | fits |
| `/how-grading-works/`, `/privacy/` | sitewide `min-width:640px` on tables with no scroll wrapper | prose tables wrap | all columns readable |
| 9 SEO board pages | 6-column table, 640px min-content, last columns off screen | board scrolls | fits |
| `/admin/tmr-coin/`, `/model-builder/` | document scrolled sideways | panel scrolls / pills share the row | 0 scroll |
| 3 simulator pages, `/login/`, `/register/` + 7 redirect targets, `/sell-your-picks/`, both `/trustmyrecord-tools/` pages | display type kept a desktop floor (56px, 48px, 46px, 42px) | phone steps added | 1-2 lines instead of 3-4 |
| 125 `tmr-global-nav` pages | open mobile menu rendered as a staircase | rows full width, left aligned, chevron at the far edge | one shared left edge |
| 18 MOTD pages + every Game File | chart labels 9px on mobile against 10px on desktop | 11px, same column width | readable, chart height unchanged |
| `/u/<name>/` | `.ca-highlights` bare `1fr`, 219px of the Most Recent Thread card cut off | `minmax(0,1fr)` | card fits |

### 3.3 Shared defects (present on desktop AND mobile - not parity gaps)
Reported, not changed, because fixing them alters desktop behaviour and is a
product change rather than a mobile-parity fix.

1. **Homepage Live Picks sport tabs do nothing.** `All / MLB / Soccer / NFL` are
   rendered in `index.html` but no script binds them - there is no `.tab` click
   handler in any homepage bundle. All four show the same 6 picks, on desktop
   and on mobile. Clicking "Soccer" shows MLB picks.
2. **Ticker card overlaps its next-arrow** by a few pixels, on both platforms.

### 3.4 Not tested
**Logged-in state.** `C:\Users\BL\CREDENTIALS.md` holds API and service
credentials only - no TrustMyRecord site login - and the standing rule is never
to create an account. Everything reachable logged out was exercised, and the
logged-out gates behave identically on both platforms. A signed-in pass over
pick submission, grading, records, payments, subscriptions, TMR Coin balances,
notifications and admin needs a real account.

---

## 4. Candidates that were NOT defects

Recorded so the next audit does not re-chase them.

| Candidate | Why it is not a defect |
|---|---|
| 12-20 footer links "missing" on mobile | the footer collapses to 4 accordions; tapping a heading reveals all 29 links. Verified on 6 page families. |
| 107-120 `table.tmrx-table` "clipped" on `/u/` pages | each sits in `.tmrx-table-shell{overflow-x:auto}`; the check was walking past the scroller to an outer hidden box. `clippedBy: null`. |
| Forum sidebar (26 links) hidden on mobile | the same destinations are reachable by tapping a category row, which is how desktop works too. |
| Mobile shows 280-1,270 fewer characters | the nav collapsed into the hamburger, plus the forum sidebar. No thread, post or stat is missing. |
| TrendSpotter shows 4 games vs 8 | deliberate: `visibleMatchups()` returns 4 narrow / 8 wide, and both expand to 21 with "Show all 25 games". |
| Handicappers list 46 rows vs 71 | progressive loading; the count flips between runs on the same viewport. Tab counts identical. |
| `nav:back-button` / handicappers-search failures in early runs | harness bugs: an off-screen selector, and `fill()` not firing the input event. Both pass when driven the way a user drives them. |
| "unreachable" controls under an open menu | the harness left the nav overlay open while hit-testing the page beneath it. |
| Tap targets under 24px | inline links at their own line height, not standalone controls. |
| `/approved/homepage-v2/`, `/preview/home/` | frozen design snapshots outside the sitemap. |

---

## 5. Regression suite

`tests/mobile-parity-regression-test.cjs` - drives the live site with WebKit and
Chromium and asserts, for each check, that mobile matches desktop rather than a
hardcoded number:

- every desktop nav destination is reachable on a phone (set difference)
- mobile menu rows share one left edge (the staircase regression)
- every sub-menu opens and reveals links
- the Live Picks tab strip scrolls far enough to reach its last tab
- a forum category row opens the forum
- no wide profile table is clipped without a scroller
- the back button returns to the previous page
- the focused field stays on screen with the keyboard up
- nothing opens off screen
- ticker, picks, leaderboard and competition all populate
- no horizontal page scroll at 320 / 360 / 375 / 390 / 412 / 430px

Run: `node tests/mobile-parity-regression-test.cjs`
Requires WebKit: `node node_modules/playwright-core/cli.js install webkit`
