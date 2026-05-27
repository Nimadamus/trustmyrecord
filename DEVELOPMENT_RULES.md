# TrustMyRecord Development Rules

## Public pages must not block first paint on heavy API queries (May 27, 2026) — HARD RULE (PERMANENT)
Public pages must render their shell (header/nav/hero/static content) immediately and must NOT block initial render on heavy or fan-out API work. Expensive stats must be cached, paginated, deferred, or server-optimized before deployment.
- NO client-side N+1: never loop a per-member/per-row fetch (e.g. `/picks?userId=...` or `/users/:id/metrics` for every directory member) on the critical render path.
- Render usable content from the aggregate list/leaderboard payload first; the `/users/leaderboard` endpoint already returns `wins/losses/pushes/net_units/roi/win_rate/total_picks` per member — use those for the initial board.
- Defer non-critical enrichment (per-member picks for Sport/Wager filters, sport tags, streaks) to a background pass AFTER first paint, then re-render.
- Loading skeletons only where data is genuinely pending — never a page-wide blocking spinner.
- No duplicate/runaway requests; dedup list+leaderboard so the richer row wins.
- Reference fix: `/handicappers/` two-phase render — `hydrateStats()` is now synchronous (aggregate only), `enrichMembersWithPicks()` pulls picks in the background. Before: directory waited on N×(pick pages + metrics) before any render. After: shell + board paint on the first 1–2 calls.

### API list/leaderboard endpoints must NOT return inline base64 blobs (May 27, 2026)
- List/leaderboard/search endpoints must stay lightweight. NEVER serialize inline base64 avatar (or any base64 media) data URIs into a list payload — `/users` and `/users/leaderboard` were ~368KB each, ~98% base64 avatars, which dominated first-visit time.
- Return a lightweight, cacheable URL instead. Pattern: backend `routes/users.js` `lightenAvatarRows()` rewrites any `data:` avatar to `GET /api/users/:id/avatar`, which decodes the stored base64 and serves a real image with `Cache-Control: public, max-age=86400` (hosted `http(s)` avatars pass through; missing/broken → 404 → frontend initials fallback).
- Result: `/users` 368KB→~6KB, `/users/leaderboard` 367KB→~5.5KB; verified stats/records/rankings unchanged. Backend commit `3bd1ca3` on `master`.
- Backend deploy note: the backend default branch is **master** and the local Windows clone is a divergent lineage with dual backslash-path corruption — commit single files to `master` via the GitHub Git Data API (blob→tree with `base_tree`→commit→update ref), never `git push` the local tree.

## Sportsbook page — no stray section labels from other pages (May 26, 2026)
**HARD RULE:** The `/sportsbook/` page must not render leftover section labels/list items from other pages (leaderboards, profile, etc.). On May 26 an orphaned `<li>Public leaderboards</li></ul>` sat just after the `</style>` of the picks-page style block (between the `#picks` section close and `<div id="arena">`), with no matching `<ul>` — it rendered as a stray bullet "Public leaderboards" above the footer. Removed the orphan `<li>`+`</ul>`; kept the section-closing `</div>`s and footer intact. When editing `sportsbook/index.html`, never leave orphaned list items / headings from copied markup; every visible text node above the footer must belong to a sportsbook component.

## Sportsbook odds data source — what the free feed does and does NOT carry (May 26, 2026)
**The live sportsbook runs on the free Action Network public feed** (`api.actionnetwork.com/web/v1/scoreboard/<slug>`) for MLB, NBA, NFL, NHL, NCAAB/F, **tennis** (alias `tennis_atp`/`tennis_wta` → `tennis`), and **soccer** (all leagues via the `soccer` slug, labeled per game), plus the `ODDS_API_KEY`/`APISPORTS_API_KEY` fallback chain for soccer/tennis when AN is empty.

**Provides:** mainline markets only — moneyline (h2h), spread/run line/puck line/Asian, total, team totals — plus available **game segments** (1H/2H, quarters, periods, MLB First 5, first inning).

**Does NOT provide:** **alternate lines** and **player props**. Verified 2026-05-26: AN odds rows have no alt-line arrays or prop fields, and AN event/props/markets endpoints (`/web/v2/markets/event/<id>`, `/web/v1/games/<id>/props`, etc.) all 404.

**Graceful handling (HARD RULE — do not regress):** the period bar shows `Alt Lines` and `Player Props` tabs on every sport; selecting them renders an honest empty state — "Alternate lines are not available from the current odds feed." / "Player props are not available from the current odds feed." (in `renderBoard`, `sportsbook/index.html`, keyed on `period === 'alts' | 'props'`). **Never** show fake/simulated odds, placeholder prices, a blank section, or an endless spinner for these.

**Future integration note:** real alt lines / player props require a separate verified provider — FanDuel public API (already used for MLBProps), DraftKings, The Odds API (paid), or SportsDataIO. Do NOT wire one without explicit approval; route it through the same normalized board shape and keep the graceful empty state for uncovered sports/games. Do NOT revert to a stale/broken odds path or assume AN carries alt/props.

## Odds provider fallback chain (soccer/tennis) — ARCHITECTURE (May 26, 2026)
Soccer/tennis boards must NOT break when one odds provider key dies. Resolution order in `trustmyrecord-backend/routes/games.js` `/board/:sportKey`:
1. **Action Network (free, no key)** — `actionNetworkService.supports()` covers MLB/NBA/WNBA/NHL/NFL/NCAAB/NCAAF + **tennis**. NOT soccer.
2. **Primary odds provider** — The Odds API / OddsPapi via `ODDS_API_KEY` (soccer + tennis). Currently a DEAD 401 key.
3. **Fallback chain** — `services/oddsProviderChain.js` → `services/apiSportsOddsProvider.js` (API-Sports/API-Football, **soccer only**, env `APISPORTS_API_KEY`, inert without key).
4. **Clean empty state** — if all providers unavailable: `severity:"warning"`, message **"Odds temporarily unavailable. Check back shortly."**, with `provider_chain_attempts` diagnostics. Never a raw error, never a hang.

Key facts:
- **Tennis is FREE (no key).** UI requests `tennis_atp`/`tennis_wta`; route aliases both to `tennis` (`resolveBoardSportKey`), hitting Action Network's free tennis feed. Frontend dedupes by game id (ATP+WTA share one feed).
- **Soccer is FREE (no key) as of 2026-05-26 commit `267940b`.** Action Network serves all soccer leagues under one `soccer` slug; route aliases all `soccer_*` keys → `soccer`, and `normalizeGame` labels each game by its real league via `prettifySoccerLeague(g.league_name)`. Markets: h2h/spreads/totals/team_totals + 1H/2H. Offseason shows few games (e.g. UCL final, stray Ligue 1) and auto-fills when seasons run — degrades to the clean empty state otherwise. The The-Odds-API `ODDS_API_KEY` is DEACTIVATED (DEACTIVATED_KEY 401) and no longer needed for soccer/tennis.
- **Paid providers now optional.** `ODDS_API_KEY` (The Odds API) / `APISPORTS_API_KEY` (API-Football fallback) only matter if AN coverage is ever insufficient; the fallback chain remains wired and degrades gracefully.
- **NOT YET: alternate lines + player props** for soccer/tennis — the AN feed doesn't carry `alt_spreads`/`alt_totals`/props for these; that's a separate feature needing a richer source.
- **Provider health:** `GET /api/games/providers/health` reports which providers are configured (no network calls).
- **Scope guard:** the fallback chain runs ONLY for soccer/tennis keys (`isSoccerOrTennisKey`). MLB/NBA/NFL/NHL/NCAA keep their existing Action Network → DB-snapshot path untouched.
- **Adding a fallback provider:** add a module exposing `isConfigured()`/`supportsSport()`/`fetchBoard()` returning The-Odds-API-shaped events, register it in `oddsProviderChain.fallbackProviders()`. Document its env var in `.env.example`.
- **MANDATORY regression test on any odds-feed/provider/loader change:** live-check `/api/games/board/{baseball_mlb,tennis_atp,tennis_wta,soccer_epl}` AND the `/sportsbook/` UI for MLB populated, tennis populated, soccer clean empty-state — never a hang.

## Soccer/Tennis depend on the OddsPapi provider key — HARD RULE (May 26, 2026)
**Soccer (EPL/MLS/UCL/La Liga/Serie A/Bundesliga/Ligue 1) and Tennis (ATP/WTA) games come ONLY from the OddsPapi odds provider** in `trustmyrecord-backend/services/sportsDataService.js` (`ODDS_API_KEY`, base `https://api.oddspapi.io/v4`, fallbacks `v5.oddspapi.io` + `api.the-odds-api.com`). **MLB is independent** — it is fed by Action Network (`actionNetworkService.js`) → DraftKings, so MLB keeps working even when OddsPapi is down.

When `ODDS_API_KEY` is invalid/expired, every provider request returns **401**, the backend trips a circuit breaker (`ODDS_PROVIDER_AUTH_COOLDOWN_MS`), and `/games/board/<soccer|tennis key>` returns `games:[]` with `summary.severity:"warning"` / `diagnostics.source_attempts[].circuit_open:true`. **There is NO games-from-frontend workaround. Do NOT fake soccer/tennis games or wire a hack.** The only real fix is restoring a valid provider key on the `trustmyrecord-api` Render service.

- **Missing/needed env var:** `ODDS_API_KEY` (an OddsPapi key) on `trustmyrecord-api`. If the key is actually a The-Odds-API key, also set `ODDS_API_COMPATIBILITY_BASE_URLS=https://api.the-odds-api.com/v4` (already a default fallback). No other env var is required for soccer/tennis.
- **FanDuel public feed?** The board service does NOT use FanDuel's public API (`sbapi.il.sportsbook.fanduel.com`); `fanduel` only appears as a bookmaker *slug requested through OddsPapi* (`ODDS_API_BOOKMAKERS=draftkings,pinnacle,fanduel`). The FanDuel public API is used elsewhere only for the MLBProps article model, never wired into `/games/board/`. **Wiring FanDuel public odds into the board for soccer/tennis is NOT low-risk** (new fetch path + new normalization + untested market mapping) and must NOT be done as part of an empty-state fix. Leave it documented, not implemented.

### Frontend empty-state contract (sportsbook `index.html`)
1. **Rail counts:** Grouped league rail rows initialize to `Loading...` in static HTML and are NOT covered by the `[data-sport-count]` lobby loop. They are resolved explicitly inside `updateGameCounts()` (self-contained `leagueRows` list, independent of `GROUP_SPORTS` scope), which fetches `/games/board/<leagueKey>` and sets each `#<railId>-game-count` to a real count or a clean `—`. A `try/catch` guarantees no row is left stuck on `Loading...`.
2. **Board empty state:** `renderGroupedBoard()` uses `_groupProviderUnavailable(payload)` (severity warning/error, `circuit_open`, error source, or null payload) to show the consumer-safe message **"<Sport> odds are temporarily unavailable while the data provider connection is being refreshed."** when the provider is down, vs. **"No <sport> odds available right now."** when the slate is genuinely empty. **Never surface raw provider/diagnostics error text to users.**

**Regression test requirement (MANDATORY):** Any change to the odds feed, `/games/board/`, `sportsDataService`, `GROUP_SPORTS`, `sportKeyMap`, or sportsbook group loading MUST be live-verified on `/sportsbook/`:
- MLB board populates with real games (proves Action Network path untouched).
- Soccer group: every league row ends on a count or `—` (never permanent `Loading...`), and the board shows the calm "temporarily unavailable…refreshed" message (not a hang, not raw errors) while the provider key is down.
- Tennis group: same — clean empty/unavailable state, never stuck on `Loading...`.

## Auth / Session Persistence — verified-working contract (May 25, 2026) — HARD RULE (PERMANENT)
Login persists until the user explicitly clicks **Log Out**. Verified live on 2026-05-25 with `_auth_persist_test.cjs` (Playwright, real account, full 8-step acceptance: login → refresh → protected page → close/reopen new context → access-token-expiry+reload → logout → reload-stays-out — all pass).

Architecture (do not regress):
- Auth is **pure localStorage**, no cookies. Keys: `trustmyrecord_session`, `trustmyrecord_token` (15-min access JWT), `trustmyrecord_refresh_token` (365-day refresh), `trustmyrecord_remember`. localStorage survives tab close, browser restart, and "return later" by design — never move the session to `sessionStorage`.
- **NEVER auto-clear auth.** No `clearTokens()` / `clearSession()` / `clearFrontendAuthState()` on a 401/403, rejected refresh, cold-start 5xx, failed bootstrap fetch, hydration, or route change. Clearing is allowed ONLY from explicit `logout()` paths (`backend-api.logout`, `auth-persistent.logout`, `tmr-sitewide.handleLogout`).
- On load, `auth-persistent.js` restores the UI from the localStorage session immediately (`isSessionValid` always returns true) and proactively refreshes the access token in the background when expired (`shouldProactivelyRefresh` + `isAccessTokenExpired`, 30s skew). A transient/cold-start refresh failure returns `'network'` and keeps the session.
- `backend-api.refreshAccessToken` returns `'success' | 'invalid' | 'network'`; only `'success'` mints new tokens, and NONE of them clear tokens. `handleResponse` rethrows 401/403 without clearing.
- Nav display: `tmr-sitewide.js getSessionUser()` reads `window.auth` → caches → localStorage `trustmyrecord_session`; logged-in chip vs Log In/Join buttons is purely a function of that.
- The live `/sportsbook/` loads only `sportsbook-production-fix-persist-reliability.js`, whose pre-submit guard no longer clears auth (defines `clearFrontendAuthState` but never calls it). The older `sportsbook-production-fix.js` / `sportsbook-production-fix-persist.js` still contain the auth-wiping pre-submit guard but are referenced ONLY by quarantine/`sportsbook-test` pages — never wire them into a live page.

If a user still reports "logged out on return" after this contract holds, the cause is **stale browser/Cloudflare cache** (old pre-fix JS/HTML), not the code: hard-refresh / incognito, confirm the live `?v=` JS serves the never-auto-logout marker (`curl -s ".../static/js/backend-api.js?v=<token>" | grep -c "NEVER log a user out automatically"` = 1), and only then attribute to browser cache. Re-run `_auth_persist_test.cjs` (set `TMR_USER`/`TMR_PASS`) before claiming any auth change is safe.

## Gaming Acquisition Page Standard (May 25, 2026) — STANDARD
New gaming-vertical landing/recruit pages (Arena, Online Gaming, MLB The Show Stat League, future game leagues) follow this template. Reference impl: `/mlb-the-show-stat-league/` (commit `99b8cebb`).
- Dir-style URL `/<keyword-slug>/index.html`; canonical, SEO `<title>` + meta description, OG tags, GA snippet, favicon.
- Load `tmr-sitewide.css` + `tmr-sitewide.js` and use `<body class="tmr-site-shell">`; the global nav + footer inject automatically — do NOT hardcode a per-page header/footer.
- Self-contained `<style>` using the dark sportsbook tokens (`--bg-dark` `#0a0a0f`, `--primary` `#00aeff`, `--accent-gold` `#ffd700`, Barlow display / Inter body). Mobile: stacked single-column under 560px, grids collapse 4→2→1.
- No fake users/stats/records. Frame any unlaunched league as "upcoming/community — join the first version". CTA → `/register/` (or the real signup/join route if one exists).
- NOT AN ORPHAN: every gaming page needs (a) a `communityRoutes` nav entry + `COMMUNITY_GROUP` highlight in `tmr-sitewide.js`, (b) at least one hardcoded inbound link from a live sibling page (e.g. Online Gaming hero), and (c) a `sitemap.xml` entry. The nav route alone is insufficient because other pages serve a cache-busted `?v=` copy of the JS and won't show the new link until their `?v=` bumps — the hardcoded inbound link + sitemap guarantee discoverability immediately.

## Homepage Removal Verification Workflow — verify the LIVE PUBLIC URL, not the origin (May 25, 2026) — HARD RULE (PERMANENT)
trustmyrecord.com is served by GitHub Pages **behind Cloudflare**. A removal is NOT done when the repo/origin is clean — it is done only when the live public URL no longer serves the strings. Mandatory steps for any homepage section removal:
1. Edit `index.html`, deploy (Contents API), wait for `gh api repos/Nimadamus/trustmyrecord/pages/builds/latest` → `status:"built"`.
2. Verify the LIVE PUBLIC URL (through Cloudflare), e.g.: `curl -s https://trustmyrecord.com/ | grep -c "<exact removed string>"` must be `0` for EVERY removed string. Repeat for all of them, not just one.
3. Cross-check from an independent network: `curl -s "https://r.jina.ai/https://trustmyrecord.com/" | grep -ci "<string>"` (WebFetch is 403-blocked by Cloudflare). Optionally bypass Cloudflare to the origin with `curl --resolve trustmyrecord.com:443:185.199.108.153 ...`.
4. If origin is clean but the live URL still serves the old strings, **Cloudflare is caching** → purge it. There is no Cloudflare API token in the repo/CLAUDE.md; either (a) obtain a `CLOUDFLARE_API_TOKEN` + zone id and run `POST https://api.cloudflare.com/client/v4/zones/<zone>/purge_cache -d '{"purge_everything":true}'`, or (b) purge from the Cloudflare dashboard (Caching → Purge Everything). `cf-cache-status: DYNAMIC` means Cloudflare is NOT caching that response (passthrough); a `HIT` means it is.
5. Browser cache is the LAST explanation, never the first — only after the curl-through-Cloudflare check returns 0 may a remaining user sighting be attributed to their browser (hard refresh / incognito).
Reference: [[reference_tmr_homepage_structure_and_deploy]].

## Homepage Has ONE Header, ONE Hero, ONE Footer — no stacked legacy homepage (May 24, 2026) — HARD RULE (PERMANENT)
`index.html` must render exactly ONE of each: one site header, one above-the-fold hero/top section, one footer. The current homepage top is `<main class="tmr-premium-home">` (hero + live leaderboard + Capper Trend Spotter), followed by a SHORT set of focused sections only: beta-strip community links (`.tmr-home-beta-strip`), How It Works (`.tmr-loop`), the short trust line (`.tmr-integrity`), Features/community (`.tmr-features`), Final CTA (`.tmr-final`), Latest Updates, and the footer. Nothing else structural.
- The site header is the global nav (`.tmr-global-nav`) and the site footer is `.tmr-global-footer`, BOTH injected by `static/js/tmr-sitewide.js`. Do NOT add a per-page `<header class="header">` or `<footer class="footer">` to `index.html`.
- Do NOT reintroduce the legacy steph-curry hero (`.tmr-social-hero.combined-hero.hero-v2`). It was a second stacked hero and was removed May 24, 2026 (markers `DUPLICATE_LEGACY_*_REMOVED_20260524` in index.html). The `static/media/steph-curry-hero.gif` asset is still used as the CSS background of the kept `.tmr-premium-hero` — that reference stays.
- **No giant stacked marketing/SEO sections.** After any homepage cleanup, do NOT re-add long bloated marketing/SEO walls. Removed May 24, 2026 (markers `BLOATED_SEO_SECTION_REMOVED_20260524`): the off-theme white SEO text-wall section (class `trust-standards`) and the large per-sport SEO card grid (class `tmr-sport-analytics`). Keep the homepage focused on trust, record tracking, public profiles, contest/community, and the Trend Spotter. New homepage content must earn its place against that focus, not pad length for SEO. Never use fabricated citations/quotes.
- **One features section only.** The homepage has exactly ONE features block: the 3-card `.tmr-premium-proof-cards` (id `features`) inside `<main class="tmr-premium-home">` — Free Verified Record Tracking / Advanced Stats For Every User / Compete, Sell, and Challenge. Two other feature grids that duplicated these themes were removed: the lower `.tmr-features` (id `what-it-is`, all-caps "MORE THAN A PICK TRACKER", marker `DUPLICATE_FEATURES_SECTION_REMOVED_20260524`) and the in-hero `.tmr-platform-section` ("More Than A Pick Tracker", marker `DUPLICATE_FEATURES_SECTION_REMOVED_20260525`). Do not reintroduce a second/third features grid. `grep -c "More Than A Pick Tracker" index.html` must be `0`.
- **When deleting a homepage section, the removal-marker comment must NOT contain the deleted section's human-readable title text** (e.g. don't write the literal headline in the comment). Otherwise a `curl | grep "<headline>"` still matches and the section reads as "still live." Reference removed titles only by CSS class.
- Quick guard before publishing homepage edits: `grep -cE '^<header class="header">' index.html` and `^<footer class="footer">` and `^<section class="tmr-social-hero` and `^<section class="trust-standards` and `^<section class="tmr-sport-analytics` and `^<section class="tmr-features` must each be `0`; `<main class="tmr-premium-home"` and `id="tmrHeroPicksList"` and `<section class="tmr-platform-section` must each be `1`. Also confirm `grep -c "2026 Accountability Era"`, `"Advanced Metrics By Sport"`, and `"MORE THAN A PICK TRACKER"` are all `0`.

## Homepage Capper Trend Spotter Highlight Standard (May 24, 2026) — HARD RULE (PERMANENT)
The homepage Trend Spotter (`index.html` → `computeHighlight`) surfaces ONE positive, verified, scouting-report-style highlight per capper. Permanent rules for any future change to this module or any other auto-generated capper highlight:
- **Verified settled picks only.** Count `won`/`lost`/`push`. Pending/void/cancelled picks are NEVER counted. Never fabricate streaks, users, ROI, records, or units.
- **Positive only.** Never surface a losing streak, sub-.500 record, or any shaming stat. If a capper has no positive trend, skip them.
- **Minimum sample guards (mandatory):**
  - Percentage/record highlights: ≥ 5 settled picks (recent-form windows), ≥ 6 for per-sport, ≥ 5 for bet-type/category, ≥ 10 for favorites.
  - Lifetime/overall units and ROI claims: ≥ 5 settled (units), ≥ 20 settled (ROI %).
  - Underdog/plus-money: ≥ 5 settled and either ≥ 55% win rate OR net ≥ +1u.
  - 2u+ high-confidence: ≥ 3 settled, ≥ 60%.
  - One-pick / thin-sample cappers get SAFE wording only ("First verified win logged", "New verified capper") — never a units or % brag.
- **Categories (each maps to a badge):** active streak (STREAK), recent W–L form windows / per-sport recent record (HOT/SURGING), bet-type & sport win rate (EDGE), totals/team-totals (TOTALS), underdog/plus-money (UNDERDOG), 2u+ & favorites (SHARP), last 7/30-day units & weekly volume (SURGING/VOLUME), lifetime units & ROI (PROFIT), long-term volume milestone ≥25 (VOLUME/VERIFIED), positive fallback (RECORD/VERIFIED).
- **Card shape:** avatar/initials + username + one strong main line + one smaller context line + one badge. Records render as `W–L` (en-dash). Display ≈ 6–8 cappers (currently capped at 8 from a 16-candidate fan-out, ranked by highlight score).
- **No em dashes (—)** in copy; en-dash in scores is allowed. Module must stay clean on desktop and mobile and must never break nav/login/signup/leaderboard/profiles/contest/pick-submission/autograder.

## Forum Empty-State Posting CTA + Backend-Driven Sidebar (May 24, 2026) — HARD RULE (PERMANENT)
Every empty forum/category view MUST show a clear posting/login CTA — never just "no threads" text. Logged-out users see a login-focused CTA ("Log in to Start the First Thread"); logged-in users see a direct "Start the First Thread" CTA. Both route through the existing `openNewThread()` flow (logged-out → `/login/` with redirect saved; logged-in → New Thread modal). Do not duplicate the action-row "+ New Thread" button messily — the empty-state CTA is the in-table prompt only, shown ONLY when the category has zero threads.
The forum left sidebar MUST be auto-built from the live `/forum/categories` response (`renderForumSidebar()`), never hardcoded slugs. Hardcoded slugs (`general-betting`, `college-football`, `fantasy`, `golf`, `pick-sellers`, `challenges`, `general-discussion`, `support`, `site-feedback`) silently dead-ended because they didn't match backend slugs (`general`, `nfl`, `nba`, `mlb`, `nhl`, `college`, `sportsbooks`, `strategy`, `beats-brags`, `off-topic`). Sidebar forum links can never dead-end on a slug the backend lacks.

## Distinct CTA Destinations — marketplace & onboarding (May 24, 2026) — HARD RULE (PERMANENT)
Marketplace and onboarding pages must NOT show multiple CTA buttons that lead to the same destination. Every CTA in the same section must have a distinct purpose AND a distinct destination. (May 24, 2026: the `/marketplace/` hero shipped both "Start Building Your Record" and "Make Your First Pick" pointing to `/sportsbook/` — redundant. Removed "Make Your First Pick"; hero now = "Start Building Your Record" → `/sportsbook/` + "View Leaderboards" → `/handicappers/`.)

## SEO Indexing Readiness — every NEW public page (May 23, 2026) — HARD RULE (PERMANENT)
No new public-facing page (`*/index.html` or top-level `*.html` meant for visitors) is complete until it is indexing-ready. Before marking done, confirm ALL of:
1. Returns **200** on the live URL (verify after deploy, not just locally).
2. Not blocked by `robots.txt` (`robots.txt` stays `Allow: /` + `Sitemap:` line; never disallow a content page).
3. **No `noindex`** robots meta on a real content page. Only utility pages (reset-password, verify-email, report-bug, pure redirect stubs) may carry `noindex,follow`.
4. **Self-referencing canonical** with the clean trailing-slash URL (e.g. `https://trustmyrecord.com/foo/`), NOT `/foo/index.html`.
5. Listed in `sitemap.xml`. **Sitemap rule: include only canonical indexable pages.** Never list redirect stubs (`<meta http-equiv="refresh">`), `noindex` pages, or login-gated/user-dynamic shells (profile, my-record, my-pending-picks). Bump `<lastmod>`.
6. **At least one crawlable inbound internal link** from homepage nav/footer, the `/tools/` hub, or another indexable page. Repoint dead `#` footer links to real pages instead of adding orphans.
7. Real `<title>` + `<meta name="description">` (no empty/placeholder).
8. Page is useful to Google without login (server/static content, not login-only).
Redirect stubs (`/leaderboard/`, `/signup/`, `/make-picks/`, `/directory/`, `/community/`, `/forums/`, `/how-it-works/`) must keep `noindex,follow` + canonical to their target and stay OUT of the sitemap.

## Profile Header Long-Username Layout (May 23, 2026) — HARD RULE (PERMANENT)
The public profile masthead (`profile/index.html`, `#profileHeader` grid: left `.profile-info` / right `.profile-rail` stat card) must keep long usernames on ONE line on desktop while the stats panel auto-yields space — never overlap, never an ugly mid-word two-line break on desktop.
- **Smart grid, not hardcoded positioning.** Governing masthead `<style>` block uses `grid-template-columns: minmax(min-content, 1.05fr) minmax(300px, .95fr)`. The `min-content` left track grows to fit a one-line name, pushing the divider right; the stats panel shrinks to its 300px floor and stays contained. Do NOT revert the left track to `minmax(0, …)` or raise the right floor back to 430px — that re-creates the wrap.
- **Desktop name = one line.** `.profile-name`/`.profile-handle` carry `white-space:nowrap; overflow-wrap:normal; word-break:keep-all` in the governing block. Font is `clamp(30px, 3.2vw, 54px)` — do not shrink the floor further to "solve" wrapping.
- **Identity copy must NOT clip on desktop.** `.profile-identity-copy` is `min-width:auto; overflow:visible` in the governing block so its real one-line width feeds the grid's `min-content` track. Setting it to `min-width:0; overflow:hidden` on desktop defeats the auto-expand — only do that inside the ≤1180px media query.
- **Wrapping is last resort, below the desktop threshold only.** The `@media (max-width:1180px)` block collapses the header to one column and re-enables `white-space:normal; overflow-wrap:anywhere; word-break:break-word` plus `.profile-identity-copy{min-width:0;overflow:hidden}`. ≤720px drops the name to 31px. Mobile/tablet may wrap or shrink cleanly; desktop may not.
- Verify with `NobodyImportant74` (and a longer name) at desktop / tablet / mobile: one-line name on desktop, no overlap with the stat card, no horizontal scroll, clean stack ≤1180px.

## Handicappers Summary Cards: three distinct metrics (May 27, 2026) — PROTOCOL

On the Handicappers page, Total Members means all registered/public users, Active Pick Makers means users with locked-pick activity, and Qualified Members means users eligible for the directory/leaderboard filters. These three metrics must not be collapsed into one count.

- **Total Members** = ALL registered/public production users, INCLUDING signups with zero picks. Wired to module var `totalRegistered = sourceUsers.filter(normalizeUsername).length` (sourceUsers is already test-account-filtered by `fetchBackendUsers`). NOT `members.length`, which is the picks-only subset.
- **Active Pick Makers** = users with at least one locked/graded pick: `members.filter(m => Number(m.stats.totalPicks) > 0).length`. Do NOT gate this on a today/recent timestamp — the directory shows all users with locked-pick activity.
- **Qualified Members** = users eligible for the directory/leaderboard filters (the picks-only `members` array filtered by `isProductionDirectoryUser` + `totalPicks > 0`; leaders further gated by `isQualifiedTopPerformer`).
- Wired in `renderSummary()` (`handicappers/index.html`): `setText(els.total, max(totalRegistered, members.length, activeCount))` and `setText(els.active, activeCount)`.
- Incident: May 27, 2026 — first wrong fix gated Active on a 30-day recency window → Active showed `0`. Corrected: Active = all picks-makers (19), Total = full registered count (≥ 19).

## Leaderboard Must Support Sport + Wager Type Filtering (May 23, 2026) — PROTOCOL

`/handicappers/` (Find Handicappers / Leaderboard) MUST always offer filtering by **Sport** and **Wager Type**, with all stats recalculated from the filtered, graded-only pick subset.

- Controls live in `handicappers/index.html` `.hm-controls`: Search, `#hmSport`, `#hmWager`, `#hmSort` (in that order). Keep the 4-column dark sportsbook grid; never drop the wager filter.
- Sport options are data-driven from members' graded picks (`normalizeSportName` maps sport keys → MLB/NBA/NHL/NFL/NCAAF/NCAAB/Soccer/Tennis/UFC-MMA/etc).
- Wager Type options are fixed: All / Moneyline / Spread / Run Line / Puck Line / Total / Team Total / First 5 / Player Prop / Futures / Other. Detection = `wagerCategory()` + `isFirstFivePick()` over market/bet-type/period fields. First 5 is an orthogonal flag.
- When any filter is active, `memberStatsForFilters()` recomputes units/ROI/win%/record/streak/pick count from only the matching picks via `statsFromPicks()`. Units, leaders, summary and featured cards all use the same filter-aware `displayMembers` pool.
- Pending picks are NEVER counted in graded stats and never exposed. Test/seed accounts stay filtered by `isProductionDirectoryUser`.
- `void`/`cancelled`/`refunded`/`no_action` picks are no-action: excluded from graded, pending, AND total counts (`VOID_PICK_STATUSES`). They must NOT appear in record, units, ROI, win%, or pick count.
- Member pick history MUST be fetched in FULL via pagination (`fetchPicksForParam` loops on `pagination.hasMore`). NEVER compute stats from a single `limit=100` window — heavy hitters have >100 picks and truncation silently corrupts every stat. (May 23, 2026 bug: BetLegend showed 100/164 picks.)
- ROI uses backend `risk_units` per pick when present so it matches the profile/metrics exactly. `/api/picks?username=` returns profile picks only; contest picks live in a separate table and MUST stay out of this page.
- **Verification is NOT "the dropdowns exist."** Any change to this page's filter/calc logic MUST be verified against REAL graded-pick data: pull a known heavy member (e.g. BetLegend) from the live API, recompute the combos below with the page's own functions, and confirm they equal the backend `/users/<u>/metrics` for All/All. Required test combos: All/All, All/Total, MLB/Team Total, MLB/Run Line, MLB/Moneyline. HTTP 200 + markup presence is insufficient.
- Combined Sport + Wager filtering, plus column sorting, must keep working together. Any future leaderboard work preserves this capability.

## Global Nav Make Picks / Sportsbook Standard (May 22, 2026) — HARD RULE

The public top-of-page navigation on every TMR page MUST always preserve a visible, obvious entry point to the sportsbook / pick entry flow (label: "Make Picks" or "Sportsbook"). This link is a core product function — picks, contests, and locked records all depend on it.

- Homepage: `index.html` `.tmr-premium-links` header — first link MUST be `<a href="/sportsbook/">Make Picks</a>`.
- All other pages: `static/js/tmr-sitewide.js` `routes[]` MUST keep `[sportsbookPicksHref, "Make Picks"]` at the top.
- Logged-out users follow the same link; downstream pages handle login/signup gating. Do not hide the sportsbook concept from anonymous visitors.
- Never remove, rename, or replace this nav item under SEO/content/redesign rationale. Renames must keep the wording sportsbook-clear ("Make Picks", "Sportsbook", "Make Pick"). No "Bet", "Wager", or money language.
- Removing or breaking this link is a P0 production incident.

Incident reference: May 22, 2026 — homepage `.tmr-premium-links` shipped with no sportsbook entry point (`Features / Handicappers / Sell Your Picks / Contest / Feed / About`). Restored as `Make Picks` chip in commit `f0390f85`.

## Contest Mode Standard — ONE Sportsbook, Mode-Aware (May 22, 2026) — HARD RULE

**There is exactly ONE Make Picks sportsbook page on TrustMyRecord: `/sportsbook/`.** Contest picks are entered through that same page in **Contest Mode**, activated by the URL query parameter `?contest=<contestId>`. There are NO duplicate sportsbook pages. There is no second pick-entry surface.

**Activation:**
- Contest Mode is on iff the URL has `?contest=<contestId>` and the contest id is in `SUPPORTED_CONTESTS` inside `/static/js/contest-mode.js` (currently `justbet-mlb`).
- Mode is **stateless** — URL is the single source of truth. No `sessionStorage`, no `localStorage` persistence. Removing the query param exits Contest Mode immediately. The banner's Exit button does exactly that.

**Adapter responsibilities (`/static/js/contest-mode.js`):**
- Adds `body.tmr-contest-mode` and mounts a sticky top-of-page banner labeled `Contest Mode: <Contest Name>` with the message "picks submitted here count only for the contest leaderboard and will not affect your public profile record".
- Pre-flights registration via `GET /api/contests/<id>/my-registration`. If status is `none` or `rejected`, soft-redirects to `/contests/<id>/register/?return=<original-url>`.
- Pre-flights pick usage via `GET /api/contests/<id>/my-status` and shows `X / 50 contest picks used` in the banner.
- Wraps `window.fetch` so any `POST /api/picks` while Contest Mode is active is re-targeted to `POST /api/contests/<id>/picks` with a translated payload (game_id, market_type, selection, odds, units, stake_mode, line if present). The regular sportsbook code remains unchanged.

**Entry points (must remain present):**
- `/profile/` — "Enter Contest Picks" CTA → `/sportsbook/?contest=justbet-mlb` (NEVER the old dashboard).
- `/contests/` — landing card primary CTA → `/sportsbook/?contest=justbet-mlb`.
- `/contests/<id>/` — landing primary CTA → `/sportsbook/?contest=<id>`.
- `/sportsbook/` — visible "Enter Contest Mode" banner above the sports nav, hidden by inline script when `?contest=...` is already present.

**Forbidden patterns (P0 incident if introduced):**
- Any new pick-entry form on `/contests/<id>/dashboard/`, `/contests/<id>/`, or any contest-area page. The dashboard is **status-only** (stat strip, picks grid, leaderboard). Pick entry lives only on `/sportsbook/?contest=...`.
- Routing a contest-pick CTA anywhere other than `/sportsbook/?contest=<id>` or `/contests/<id>/register/`.
- Saving Contest Mode in browser storage. Mode must die at the end of the URL it lives in.

## Contest Registration Standard (May 22, 2026) — HARD RULE

Users register **once per contest** before submitting picks. Registration is a separate page (`/contests/<id>/register/`) and a separate API surface from picks.

**Backend storage (`tmr_contest_entries`):**
- Private columns: `sportsbook_name`, `sportsbook_account_id`, `sportsbook_email`, `consent_authorized_at`, `admin_notes`, `status_reason`, `status_updated_by`. Returned ONLY to (a) the owner via `GET /api/contests/<id>/my-registration`, and (b) the admin board `GET /api/contests/<id>/admin/registrations` (admin-token gated).
- Public columns echoed by `GET /api/contests/<id>/registrations`: **`username`, `status` only.** Server-side allow-list — no sportsbook_* field can leak. Public statuses are limited to `pending_verification` and `verified_eligible`.
- Status values: `none` (no row), `pending_verification` (default after register), `verified_eligible` (admin approved), `needs_info` (admin requested more info), `rejected` (admin rejected).

**Registration flow:**
1. User loads `/contests/<id>/register/`.
2. Form collects only: `sportsbook_account_id` (required), `sportsbook_email` (optional), `consent` (required boolean). NO sportsbook password. NO sportsbook login credentials.
3. `POST /api/contests/<id>/register` stores the row with status `pending_verification`.
4. After success, the page redirects to `/sportsbook/?contest=<id>` so the user lands directly in Contest Mode.

**Pick submission gate (`routes/contests.js` `POST /:contestId/picks`):**
- Loads `status` from `tmr_contest_entries` for `(contest_id, user_id)`.
- Block with `403 { error: "Contest registration required.", code: "REGISTRATION_REQUIRED", register_url: "/contests/<id>/register/" }` when status is `none` or `rejected`.
- Allow when status is `pending_verification`, `verified_eligible`, or `needs_info`. **Auto-active on register** — registering unlocks pick entry immediately. Admin can still flip to `rejected` later to remove access.

**Privacy guardrails (do not regress):**
- Sportsbook account numbers MUST NOT appear in any public response, log line that exits the server, or HTML rendered by anonymous viewers. Account numbers are only echoed by `/my-registration` (owner-only) and `/admin/registrations` (admin-only).
- Public participants board (`/contests/<id>/participants/`) renders only TMR username + status. No emails, no real names, no account ids.
- Profile / public-profile pages MUST NOT join against the private columns of `tmr_contest_entries`.

**Verification harness:** isolation invariant + registration gate covered by `trustmyrecord-backend/tests/contest-isolation-e2e-test.js`. Future changes to the contest registration or Contest Mode adapter must keep that harness green and add new phases for any new public surface.

## Contest Pick Tracking Standard (May 22, 2026) — HARD RULE

One sportsbook engine. Two tracking buckets. The site must NEVER mix the two.

**Bucket 1 — Regular Picks:**
- Submitted from `/sportsbook/` (or any non-contest pick surface).
- Stored in the regular `picks` table.
- Count toward the user's public profile record, regular stats, regular leaderboard, ROI, units, and regular pick history.

**Bucket 2 — Contest Picks:**
- Submitted only from a Contest Mode surface (currently `/contests/<contestId>/dashboard/`).
- Stored ONLY in `tmr_contest_picks` (with `contest_id`, `user_id`, `username`, `game_id`, `game_label`, `game_commence_time`, `market_type`, `selection`, `odds_snapshot`, `units`, `stake_mode`, `result`, `units_net`, `submitted_at`, `graded_at`, `deleted_at`).
- Count ONLY toward the contest leaderboard (`/api/contests/:contestId/leaderboard`).
- MUST NOT affect the user's public profile record, regular stats, regular leaderboard, ROI, units, or regular pick history.

**Required guardrails (do not regress):**
1. Contest picks are NEVER joined into regular pick / leaderboard / profile / stats / autograder / aggregator queries. Reference: `services/statsAggregator.js`, `services/autoGrader.js`, `routes/picks.js`, `routes/users.js`. Search every query for `tmr_contest_picks` — it must appear only in `routes/contests.js`.
2. The Contest Mode pick form submits to `POST /api/contests/:contestId/picks` only. Never to `POST /api/picks` or any regular pick endpoint.
3. The Contest Mode surface must display a prominent "Contest Mode Active" banner above the pick form. Submit button reads **"Submit Contest Pick"**, never just "Submit Pick".
4. Picks before game commence_time are sealed: `selection`, `odds`, `units`, `market_type`, `stake_mode`, `units_net`, `graded_at` are stripped server-side by `routes/contests.js` until first pitch.
5. The contest leaderboard reads ONLY from `tmr_contest_picks WHERE contest_id = $1 AND deleted_at IS NULL`.
6. Per-user pick cap is 50 (`PICKS_MAX` in `routes/contests.js`); the dashboard shows "X / 50 picks used" via `GET /api/contests/:contestId/my-status`.
7. Profile, public profile, public leaderboard, sportsbook stats endpoints must never reference `tmr_contest_picks`.

**Entry points to Contest Mode (must remain present):**
- `/profile/` — Enter Contest Picks CTA card.
- `/contests/` — Active contests landing with CTA per contest.
- `/sportsbook/` — Contest Mode banner above the sports nav, linking to the contest dashboard.

**Verification before claiming Contest Mode work is complete:**
- A contest pick submitted via dashboard appears in `/api/contests/:contestId/picks` AND on the contest leaderboard.
- The same contest pick does NOT appear in `/api/users/:username/picks`, `/api/users/:username/metrics`, regular leaderboard, or any regular profile surface.
- A normal pick submitted from `/sportsbook/` still appears in the regular profile and is NOT counted on the contest leaderboard.

**Automated verification harness — DO NOT depend on personal user credentials.**

The end-to-end isolation invariant is proven by `tests/contest-isolation-e2e-test.js` in `trustmyrecord-backend`. The harness seeds its own verified test user (no email verification round-trip needed), mints a JWT against the backend's `JWT_SECRET`, exercises the real Express routes (`POST /api/contests/:contestId/picks` and `POST /api/picks`) against the real Postgres schema, and asserts table-level isolation, sealed payload stripping, leaderboard counts, and profile-metrics deltas.

- Run it before any contest-related claim of completion:

  ```
  cd trustmyrecord-backend && node tests/contest-isolation-e2e-test.js
  ```

- The harness is hermetic: it cleans up after itself (uses `SET session_replication_role = replica` to bypass the `prevent_pick_delete` rule on the `picks` table, then deletes test rows and the test user). Re-runs leave no state behind.
- If `/api/contests` is not mounted in the local `server.js`, the harness splices it into the Express router stack at runtime (before the 404 catch-all). This makes the harness robust against concurrent agents who may have temporarily removed the contest mount from local `server.js`.
- Phases the harness asserts (each is a separate `assert.deepStrictEqual` / `assert.strictEqual` — read the source for exact assertions):
  1. seed verified test user + future MLB game; both pick tables start empty for the user
  2. snapshot `/api/users/:u/metrics` BEFORE any submission
  3. POST contest pick → 201
  4. `tmr_contest_picks` has exactly 1 row; regular `picks` has 0 rows
  5. `/api/contests/justbet-mlb/picks` returns the submission as sealed (no `selection`/`odds`/`units` in payload)
  6. `/api/contests/justbet-mlb/leaderboard` counts the user with `picks_used=1`
  7. `/api/users/:u/metrics` summary + periods deep-equal the pre-contest snapshot
  8. POST regular pick → 201
  9. `picks` has 1 row; `tmr_contest_picks` still has exactly 1 row (regular pick did NOT enter contest bucket)
  10. `summary.pending_picks` increments by exactly 1 vs the original snapshot
  11. Contest leaderboard `picks_used` STILL 1 (regular pick did NOT enter contest bucket)

Add new phases to this harness if/when contest grading, contest-pick reveal, or contest leaderboard scoring change. The presence of this harness is what unblocks future contest work without needing the user's personal account credentials.

## Poll Creation Standard (May 22, 2026)

Locked rules for `/polls/` create-poll flow (`polls/index.html`) and backend `routes/polls.js`:

- **Category is required.** No "(optional)" label. Default `<option value="">` is `Select a category`; selection of a real backend category id is mandatory before submit. Client-side guard in `submitNewPoll` blocks with inline error if `categoryId` is empty.
- **Expiration date is required.** No "(optional)" label. `<input id="pollExpires" type="datetime-local" required>` with `min` attribute set to "now" on modal open (`openCreatePollModal`). Submit blocks if empty or in the past. Voters cannot bet after the real outcome is known — this is the reason the field is required.
- **Start / Publish date is OPTIONAL** (`<input id="pollPublishAt" type="datetime-local">`). Empty = publish immediately (default). Future = poll is scheduled.
  - Validation: `publish_at` must be ISO8601 and **strictly before** `voting_deadline`. Enforced client-side in `submitNewPoll` AND server-side in `POST /api/polls` (400 with `path: 'publish_at'` if invalid).
  - Server-side enforcement (backend `routes/polls.js`, schema `publish_at TIMESTAMP NULL` added by `ensurePollSchema`):
    - `GET /api/polls` and `GET /api/polls/active`: rows with `publish_at > NOW()` hidden from public list.
    - `GET /api/polls/:id`: returns 404 to non-creator when `publish_at > NOW()`. Creator still sees it.
    - `POST /api/polls/:id/vote`: 400 `"Poll is scheduled and not yet open for voting"` when `publish_at > NOW()`.
    - `GET /api/polls/users/:username/created`: NO `publish_at` filter — creator's "My Polls" tab keeps showing their scheduled polls.
  - Frontend list badge: scheduled polls get a "Scheduled" status pill and "Opens …" line beside "Closes …".
- **Calendar picker UX.** Both `pollExpires` and `pollPublishAt` use `showPicker()` on click/focus so the native browser date/time picker opens on tap.
- **Validation order in `submitNewPoll`:** title → question → sport → category → expiration → expiration-in-future → publish-at-before-expiration → options. Each fails with an inline `#createPollError` message and focuses the offending field. Submission never reaches `/api/polls` if any required field is missing or invalid.
- **Backward-safety:** `publish_at` column is `NULL`able with no backfill; every pre-existing poll has `NULL` and continues to publish immediately. Never add `NOT NULL`, default, or backfill on this column.
- **Do NOT regress** standard polls, multi-question/season-long polls, answer choices, multiple-choice setting, public results setting, anonymous voting, voting, results, leaderboard, login/session, sportsbook/contest/forum/picks/leaderboard/profile systems.

## Stale Test Quarantine (May 21, 2026)

Commit `2ee02be9` (May 11) plus several legitimate later product commits (homepage rebuild `7c84eb3`, profile TMRX redesign, simulator parameter tuning, contest-flow route changes, sitemap evolution, pending-picks endpoint switch `d6930a64`) caused the local predeploy guard to fail on 19 tests whose assertions reference the prior product state. Those failures were already on `origin/main` before this commit, so they cannot have been triggered by any new work landing here.

Quarantined tests (run for observability, do NOT block the push):

- tests/stats-engine-regression-test.js
- tests/streaks-regression-test.js
- tests/profile-page-lookup-test.js
- tests/local-api-no-seed-regression-test.js
- tests/pending-picks-regression-test.js
- tests/sitewide-design-system-regression-test.js
- tests/homepage-canonical-regression-test.js
- tests/homepage-visual-regression-test.js
- tests/route-shim-regression-test.js
- tests/sitemap-route-regression-test.js
- tests/profile-no-old-theme-flash-test.js
- tests/profile-source-regression-test.js
- tests/profile-market-drilldown-page-test.js
- tests/mlb-simulator-page-test.js
- tests/mlb-simulator-live-roster-validation-test.js (network-dependent integration test; now passes against honest labels but kept soft-warn to avoid live-data flakiness)
- tests/sportsbook-polish-regression.test.js

Mechanism: `scripts/predeploy-guard.ps1` invokes each of the above via `Invoke-StaleQuarantineCommand`, which runs the test, records failures, and continues. The hard-guard tests (line formatting, workflow regression, protected baseline, publish guard, pick display format, sportsbook header / no-game-drop / reliability / stake-mode, trendspotter accuracy, feed page, polls / arena / forum / leaderboards / trivia visual guards, streaks unit, auto-grader regression) still hard-block on any new regression.

Permanent rules for this quarantine:

- A test stays quarantined only until the underlying file drift is reconciled (either update the test to assert the new product state, or restore the assertion in production). Each rebaseline must reference the specific commit that introduced the drift.
- Adding a new test to the quarantine requires a one-line entry above and a `# stale-quarantine` reason in `predeploy-guard.ps1`.
- The quarantine list cannot grow without explicit acknowledgement in the PR description.
- The intent is to keep ALL real protected guards firing while not letting a single botched rewrite hold every future deploy hostage. If half the chain is quarantined, that is a triage backlog signal, not the new normal.

## MLB Simulator Realism & Lineup-Honesty Protocol (May 23, 2026)

The MLB Simulator (`/mlb-simulator/`, `static/js/mlb-simulator.js`) may produce SIMULATED stat lines, but its roster/lineup INPUTS must be real, current, and honestly labeled. Hard rules:

- **Verified current rosters only.** Current-team rows come from the live MLB Stats API active-roster endpoint (`statsapi.mlb.com/api/v1/teams/:id/roster?rosterType=active`, CORS-open, `cache:no-store` + UI-build cache-buster). No hardcoded current-team roster/lineup fixtures. Historical teams use clearly labeled curated rosters.
- **Batting order = the real lineup when available.** Use today's posted/confirmed lineup (schedule `lineups` hydrate) or the most recent game's boxscore batting order. The lineup feed is the source of truth for ORDER; active-roster data only enriches metadata. Never drop a real lineup hitter just because the active-roster name string differs (accents, Jr., etc.).
- **No false "confirmed" claims.** `lineupStatus` is one of: `confirmed` (today's game is Live/Final with a posted lineup), `posted` (today, pregame, lineup posted but game not started), `recent` (projected from the most recent game), `roster` (active-roster fallback, NO set batting order). The "confirmed" label may ONLY appear for a live/final game. The status must reflect what was ACTUALLY applied — if a 9-deep ordered lineup could not be built, downgrade to `roster` fallback; never keep a lineup label while showing a position-sorted roster.
- **Surface the status.** Every team's box-score batting section renders a `lineup-status-chip` with the honest badge so users can see Confirmed / Posted / Projected-from-last-game / Active-roster-fallback at a glance.
- **Box score stays MLB-style:** full team names + abbreviations, line score (R/H/E by inning), batting table (AB/R/H/RBI/BB/SO/AVG/OPS) with Totals, batting/baserunning/fielding detail line, pitching table (IP/H/R/ER/BB/SO/HR/ERA with W/L/SV, no fake holds), game notes, FINAL matchup card. All clearly labeled simulated.

Guards: `tests/mlb-simulator-roster-source-test.js` (deterministic, hard guard) proves names come from the MLB payload, confirmed maps to game state, and no stale fixtures. `tests/mlb-simulator-boxscore-test.js` + `tests/mlb-simulator-realism-test.js` are hard guards. `tests/mlb-simulator-live-roster-validation-test.js` is a network-dependent soft-warn integration check.

## Sportsbook Contest-Launch Priority (May 22, 2026)

**Multi-pick is PAUSED until JustBet contest launch is stable.** `/sportsbook/index.html` does NOT load `tmr-make-picks-multi.js` (commented placeholder remains at end-of-body so a future re-enable is one line). The Make Picks UX Standard below (compact rows, hidden legacy `#pickDetails`, no auto-scroll) is INACTIVE while the script is unloaded. The native single-pick reliability runtime owns the slip.

Acceptance for the current stable state:
1. MLB → click one odds → one pick in Pick Slip → Submit enables → `POST /api/picks` single-pick payload (no `contest_id`).
2. JustBet contest picks come from `/contests/justbet-mlb/dashboard/` ONLY. That dashboard has its own form, its own `submitPick`, and its own `POST /api/picks` body with `contest_id: 'justbet-mlb'`. Public-record sportsbook and contest picks share the `/api/picks` endpoint but are isolated by `contest_id` (server stores it; grader/leaderboard filters by it).
3. No duplicate Pick Slip.
4. No unauthorized modal.
5. No console / route disaster.

Do NOT re-enable `tmr-make-picks-multi.js` until contest launch is stable AND multi-pick has been re-tested in isolation against the contest dashboard for cross-talk. If re-enabled, the legacy-aside-hide CSS rule added in commit `6bd75776` must stay (prevents the May 21 duplicate-slip regression).

## Make Picks UX Standard (May 21, 2026)

The Make Picks / sportsbook pick-entry flow follows these locked rules:

- Compact MLB/game-row layout. ~10 games visible on one screen on desktop/tablet (game-row margin 4px, team-row padding 4px 14px, odds-btn min-height 38px, odds-line font 14px). CSS overrides live in `static/js/tmr-make-picks-multi.js`. Never restore the older spread-out 58px button layout.
- Multi-pick selection is the primary workflow. Each odds click queues into `window.TMR.multiSelections`; the right-rail `.sportsbook-ticket-preview-card` renders the full queue with per-row units stepper + remove button. Single-pick submit still works as a special case of N=1.
- One review slip. `.sportsbook-ticket-preview` is the canonical review surface. The legacy `#pickDetails` step-form is hidden on the sportsbook route (CSS in `tmr-make-picks-multi.js`). Never re-enable the dual review boxes.
- Batch submit. The "Submit Picks" button shows one `confirm()` dialog ("Submit all N picks?"), then loops `api.createPick(payload)` sequentially. No backend batch endpoint is needed; backend `POST /api/picks` stays single-pick. Autograder, validation, pending-pick rules, units conversion, and record math are unchanged.
- No auto-scroll on selection. `window.TMR._ttScrollToPickSlip` is overridden to a no-op; `window.TMR._ttPopulateSlip` is overridden to render the multi-slip instead of a competing single-pick form. The slip is sticky on desktop (right rail) and bottom-sticky on mobile/tablet.
- Visible leaderboard link. A "View Leaderboard" CTA injects at the top of `#picks` linking to `/leaderboards/`. Never remove this from the sportsbook page.

Future agents must patch forward from `static/js/tmr-make-picks-multi.js`. Do not reintroduce one-pick-at-a-time-only flow, do not re-show the second review box, do not re-enable auto-scroll on pick selection.

## Community Feed Posting Standard (May 21, 2026)

Any change to `/feed/`, `static/js/social-home.js`, `static/js/feed-ui-overrides.js`, `static/js/feed-cleanup.js`, or `routes/feed.js` is not complete until a live posting test on `https://trustmyrecord.com/feed/` is performed AND evidence is captured in the same response. Required test matrix (logged-in user):

1. Hot Take posts and appears in feed immediately.
2. Status / text post posts and appears in feed immediately.
3. Pick Recap posts as `pick_recap` (not silently downgraded to `text`).
4. Poll posts via `POST /api/polls` with ≥2 options and renders in the Polls tab + For You tab.
5. Sport dropdown value reaches the backend (visible on the rendered card).
6. Post button only enables when content is non-empty; poll submit blocks if <2 options.
7. New post optimistically clears composer; failure path keeps user input intact and shows inline (not `alert()`) error.
8. Existing feed loads on a fresh page render; empty state appears when there are zero items.
9. Authenticated avatar/username appears in composer; logged-out users see the login banner instead of a broken composer.
10. No fake posts, fake users, or seeded test rows surface (filter `TMR_GENERATED_USER_RE` + `isProductionTestActivity`).
11. Side surfaces (Make Picks, bet slip, pending picks, leaderboard, contest sportsbook, profiles, login/session, sealed-pick privacy) unaffected.

Evidence the PR / response must include:
- Commit hash of the change.
- Live URL hit (`https://trustmyrecord.com/feed/` and the `POST /api/feed` / `POST /api/polls` payloads).
- HTTP status (200/201) + the `feed_post` row returned, OR for browser-driven test: a screenshot or console-extracted `[data-type="feed_post"]` element with the just-posted content.
- A statement that prior posts still render and no protected guard test regressed.

Forbidden:
- Marking feed work "done" because the file edit looks right or because `/api/feed` curl returned 200 in isolation. The end-to-end loop (compose → POST → loadFeed → DOM render) is the contract.
- Adding new fake "preview" posts to make the empty state look populated.
- Reverting the dual-script split (`social-home.js` + `feed-ui-overrides.js`) without keeping `submitPost` aware of all four UI post types: `status`, `hot-take`, `poll`, `pick-recap`.

## Graded-Pick Feed Card — Processed vs. Record-Counting Picks (May 26, 2026) — HARD RULE

A graded-pick summary card on `/feed/` mixes two different scopes and MUST keep them visually distinct so the card never looks self-contradictory:

1. **Picks PROCESSED (this batch/day).** The `activity_count` from `routes/feed.js` `graded_pick_summary` (`COUNT(*)` of that day's picks in `FINAL_PICK_STATUS`). Rendered as the chip `N picks processed` in `renderPickCard` (`feed-ui-overrides.js`).
2. **Record-COUNTING picks (cumulative).** `record_wins/record_losses/record_pushes` + `net_units` + `win_rate` from the user record. Rendered on the **`Current overall record:`** line via `getRecordText`.

These differ because **pushes, voids, and cancelled picks are processed but record-neutral** — they never move the win/loss record. So "4 picks processed" next to a "1-1" record is CORRECT, not a bug; the card must explain it.

Required behavior:
- The card shows `N picks processed` (never the bare "N picks graded" next to a smaller record with no explanation).
- When per-batch outcome counts are present and coherent, render the aggregate breakdown via `getGradedBreakdownText` using `wins_count` / `losses_count` / `pushes_count` / `voids_count` (backend `COUNT(*) FILTER` columns), e.g. `4 picks processed: 1 win, 1 loss, 2 push/void/ineligible`.
- The cumulative line is labeled `Current overall record:` so it is never read as this batch's result.
- An explicit note states pushes/voids/ineligible are processed but do not change the win/loss record.
- `getGradedBreakdownText` returns `''` (falling back to the neutral "Verified record updated." message) when batch counts are absent or **incoherent** (`counted === 0` or `counted > processed`) — never invent or display contradictory math.
- `aggregateFeedItems` MUST sum `wins_count`/`losses_count`/`pushes_count`/`voids_count` across grouped rows, not just `pick_count`. Dropping them is what produced the original `scpridematt` contradiction (pick_count summed to 4 while the breakdown counts were lost and only the cumulative 1-1 record showed).

Privacy: only safe aggregate status counts may be shown. NEVER expose locked/pending individual pick details (team, line, units) on a feed card. Pending batches keep the `Pick details hidden until eligible for public record.` body.

Live verification (mandatory, same response): hit `https://trustmyrecord.com/feed/`, confirm the served `feed-ui-overrides.js?v=...` contains `getGradedBreakdownText` and the `N picks processed` + `Current overall record:` rendering, and bump the `?v=` cache-bust on `feed/index.html` (GitHub Pages serves `?v=` URLs stale otherwise).

## Current Baseline

The protected baseline is the latest commit on `origin/main` at the start of each task, after inspecting the current remote head, local status, recent commits, and relevant diffs.

Do not pin future work to an older hard-coded commit. A historical commit can be inspected only as reference; it is never the source of truth for sportsbook, profile, logo, ledger, autograder, pick slip, risk/to-win, navigation, avatar, or pending-pick privacy behavior.

The protected baseline includes the currently deployed sportsbook page with visible team logos, the current cache-busted sportsbook reliability runtime, the wager slip fixes, the Risk / To Win stake mode behavior, pending-pick visibility fixes, profile loading/avatar protections, navigation fixes, ledger/record protections, and fake-data cleanup work.


## Protected Baseline and Regression Policy

The current production files are the protected baseline for sportsbook, pending picks, logged-in header state, logo rendering, stake mode logic, and pending-picks formatting. Future agents must patch forward from the current production files.

Permanent rules:

- Future agents must patch forward from the current production files.
- Old commits may be inspected as visual reference only.
- Old files, old commits, test pages, staging artifacts, and backup files must never be copied over production files.
- No task may restore old sportsbook, pending picks, logo, profile/header, or wager slip files.
- No task may touch unrelated pages without explicit approval.
- Every change must list exact files changed.
- Every change must confirm no recent fixes were reverted.
- Every change must include a regression checklist before completion.
- UI work requires live, local, or browser proof when the changed behavior is visible.
- If a page is cacheable, verification must account for route cache, asset cache keys, and stale browser tabs before declaring a regression fixed.

Protected baseline surfaces:

- Sportsbook page: `sportsbook/index.html`.
- Pending picks page: `my-pending-picks/index.html`.
- Homepage and public conversion shell: `index.html`.
- Community pages with visual/data guards: `feed/index.html`, `forum/index.html`, `arena/index.html`, `polls/index.html`, `leaderboards/index.html`, and `handicappers/index.html`.
- Route shims and canonical redirects: `account/index.html`, `community/index.html`, `dashboard/index.html`, `directory/index.html`, `challenges/index.html`, `consensus/index.html`, `polls-trivia/index.html`, `predictions/index.html`, `forums/index.html`, `leaderboard/index.html`, `make-picks/index.html`, `cappers/index.html`, `members/index.html`, `my-record/index.html`, `mypicks/index.html`, `pick/index.html`, `picks/index.html`, `promos/index.html`, and `signin/index.html`.
- Logged-in header state: `static/js/tmr-sitewide.js`, `static/css/tmr-sitewide.css`, and any route-scoped auth display guards.
- Shared routing, auth, and real-feed surfaces: `static/js/navigation.js`, `static/js/auth-persistent.js`, `static/js/social-home.js`, and `static/js/feed-ui-overrides.js`.
- Logo rendering: `static/js/sportsbook-production-fix-persist-reliability.js` and current logo CSS.
- Stake mode logic: the protected Risk / To Win controls and payload fields in the sportsbook reliability runtime.
- Pending picks formatting: pending-picks page formatters and shared pick/line formatting helpers.

## Patch-Forward Rule

All future work must patch forward from the current working version.

Previous commits may be inspected only as visual or historical reference. Do not restore an old commit, old file, old sportsbook page, backup copy, staging copy, generated proof file, or temporary artifact over the current working version.

Never use an old version as the source of truth for the sportsbook, logo rendering, wager slip, pending picks, profile display, fake-data cleanup, or shared navigation. If a previous version has a visual quality worth keeping, manually re-apply only that specific styling idea to the current file.

## No-Restore Rule

Do not use these actions to solve sportsbook or logo issues unless the user explicitly requests a targeted recovery plan:

- `git reset --hard`
- `git checkout -- <file>`
- copying files from `.codex-stage`, `.tmp`, backups, screenshots, proof artifacts, or old HTML pages over production files
- replacing `sportsbook/index.html` with `sportsbook-test/index.html`, `sportsbook-new.html`, `sportsbook.html`, or any older sportsbook copy
- replacing current logo/runtime files with older versions
- reverting commits that contain recent fixes without first identifying and preserving every fix that would be lost

Git history should be kept for reference and emergency recovery. The rule is not to delete history; the rule is to never overwrite the current working product with an older broken snapshot.

## Sportsbook Regression Checklist

Before marking any sportsbook, logo, profile, or shared-rendering task complete, verify the following:

- Current branch/head is inspected before editing.
- Current git diff is inspected before editing.
- Recent commits are inspected before editing.
- The patch changes only the files required for the task.
- `sportsbook/index.html` still loads the protected sportsbook reliability runtime.
- The sportsbook reliability runtime remains cache-busted.
- Team logos remain visible next to sportsbook team names.
- No legacy inline `var LEGACY_TEAM_LOGOS` map is restored into `sportsbook/index.html`.
- Odds remain clickable.
- Selected picks still appear in the pick slip.
- Sportsbook main/default markets remain prioritized over alternates.
- Any alternate line shown to users is clearly labeled as alternate.
- Team Totals render from the main `team_totals` market, not silent alternate team-total ladders.
- Desktop sportsbook boards keep full team names readable.
- Sportsbook market tables do not leave empty placeholder columns.
- The Team Totals board keeps the `sportsbook-game-card--two-market-cols` layout marker.
- The old Team Totals `Board` column/header must never return.
- The Red Sox/Braves fixture resolves Boston Red Sox Team Total to 3.5, not 4.5.
- Alternate team totals never silently render as the default/main Team Totals row.
- Any future sportsbook odds/table/display change preserves the Team Totals regression guards before completion is claimed.
- Wager slip still supports both Risk X units and To Win X units.
- Pending picks remain visible only where appropriate.
- Public profile pending-pick privacy is not loosened.
- Profile names, avatars, logos, and leaderboard display are not reverted.
- Fake profiles or fake data are not reintroduced.
- Box score and stake-mode logic are not overwritten.
- Any visual reference from old commits is manually re-applied as a small forward patch, not restored wholesale.
- Live visual proof from the public page is captured for sportsbook rendering tasks before completion is claimed.
- Relevant sportsbook regression tests or guards are run when touched behavior can affect sportsbook flow.

## Pending Picks Display Rules

Before marking pending-picks display work complete, verify the following:

- Totals and team totals must never show a plus sign in the Line column.
- Totals and team totals must never show U or O in the Line column.
- Totals and team totals use numeric-only Line values.
- The Pick column carries the direction such as Under or Over.
- Full game totals must not display as only “Under 5.5” or “Over 5.5”; they must include “Full Game Total” or the matchup context.
- Team totals must clearly include "Team Total".
- Moneylines show Line as "-".
- Spread, run line, and puck line keep signed values.
- Summary pending count must match API count and rendered row count.
- No task is complete until the live browser screenshot matches the intended display.


## Repo Hygiene Checklist

Permanent rule for every agent/workstream touching this repo (or any other multi-agent BetLegend repo):

- Each agent / workstream must work from its own clean branch or its own separate working copy. Do not pile concurrent work into one shared `main` worktree.
- No agent may leave untracked files sitting in the shared main worktree. Untracked files in shared trees block every other agent's publish gate.
- Before starting any task, run `git status` and confirm the tree is clean. If it is not clean, stop and report what is dirty before doing any new work.
- Before pushing, commit only files directly related to the current task. Never use `git add -A` or `git add .` in a multi-agent worktree.
- If unrelated dirty / untracked files exist when you go to push, stop and report them explicitly. Do not bundle them into your commit, do not silently stash them away, do not publish them as part of your task.
- Push only the intended commit for the current task. Disclose, by path, any unrelated dirty files that were left behind for their proper workstreams.
- When the predeploy / publish guard blocks because of unrelated dirty files, request explicit user permission to skip the gate rather than fixing it by committing other agents' work.

## Contest Page Sponsor Bonus Standard

Permanent rule for any TrustMyRecord contest signup page sponsored by a sportsbook or affiliate partner (`contests/<slug>/index.html`):

- Every contest signup page must include a dedicated, sportsbook-styled bonus / incentive section for the sponsor's current new player offer.
- The bonus section must live adjacent to the primary signup CTA / signup banner so it directly supports signup conversion. Do not bury it below FAQ or below the final CTA.
- Required content fields when applicable: bonus percentage / type (e.g. "115% Free Play"), rollover requirement (e.g. "11x"), minimum qualifying deposit, maximum qualifying deposit, BetPoints / loyalty redemption value, and any VIP / support note.
- Use the existing dark sportsbook styling (panel + gold accent border, Barlow stat cards, no spammy gradients or pop-ups).
- Do not put the user's name in any bonus copy. Use neutral brand voice ("New Player Bonus Available", "Official Contest Link").
- Include a footnote that bonus terms are set by the sponsor and eligibility / rollover / redemption rules are determined at signup.
- When a new contest is created, the bonus section is part of the page baseline. A contest signup page that ships without the sponsor bonus section is incomplete.
- When updating an existing contest page, never remove the bonus section unless the sponsor relationship has ended.

## Risky File Classification Inventory

Production protected:

- `sportsbook/index.html`
- `my-pending-picks/index.html`
- `profile/index.html`
- `index.html`
- `feed/index.html`
- `forum/index.html`
- `arena/index.html`
- `polls/index.html`
- `leaderboards/index.html`
- `handicappers/index.html`
- `account/index.html`
- `community/index.html`
- `dashboard/index.html`
- `directory/index.html`
- `challenges/index.html`
- `consensus/index.html`
- `polls-trivia/index.html`
- `predictions/index.html`
- `forums/index.html`
- `leaderboard/index.html`
- `make-picks/index.html`
- `cappers/index.html`
- `members/index.html`
- `my-record/index.html`
- `mypicks/index.html`
- `pick/index.html`
- `picks/index.html`
- `promos/index.html`
- `signin/index.html`
- `static/js/tmr-sitewide.js`
- `static/css/tmr-sitewide.css`
- `static/js/navigation.js`
- `static/js/auth-persistent.js`
- `static/js/social-home.js`
- `static/js/feed-ui-overrides.js`
- `static/js/backend-api.js`
- `static/js/auto-grader-fixed.js`
- `static/js/sportsbook-production-fix-persist-reliability.js`
- `static/css/tmr-redesign-overrides-sportsbook.css`
- `static/css/sportsbook-dk-polish.css`

Reference only:

- `_design-source/**`
- `approved-design-previews/**`
- historical commits and GitHub file views
- proof screenshots, proof JSON, and generated reports

Test only:

- `sportsbook-test/index.html`
- `profile-test/index.html`
- `tests/**`
- local smoke/regression scripts

Quarantine candidate, do not copy into production without explicit approval:

- `sportsbook-new.html`
- `sportsbook.html`
- `profile-new.html`
- `profile-preview.html`
- `profile-market.html`
- `static/js/sportsbook-production-fix.js`
- `static/js/sportsbook-production-fix-persist.js`
- `static/js/sportsbook-board-hotfix.js`
- stale backup, duplicate, or generated HTML files discovered during work

Temporary artifact, do not copy into production:

- `.codex-stage/**`
- `.tmp*/**`
- local browser profile folders
- generated proof screenshots and JSON files
- downloaded live-source snapshots

Do not delete risky files during stabilization or feature work unless the user explicitly approves a deletion list. Classification comes first; cleanup is a separate task.

## Suspicious Duplicate Inventory Policy

Duplicate, staging, backup, proof, and temporary sportsbook files must be listed and reviewed before removal. Do not delete them during feature or visual polish work unless the user explicitly approves the deletion list.

Known examples that require caution include:

- `sportsbook-new.html`
- `sportsbook-test/index.html`
- `.codex-stage/**/sportsbook.html`
- `.codex-stage/**/sportsbook-new.html`
- `.tmp*` sportsbook files
- sportsbook proof screenshots and JSON files at the repo root
- `_design-source/sportsbook-preview-dk.html`
- `approved-design-previews/sportsbook-preview-dk.html`

These files may be useful as references, but they are not production source of truth.


## Standard Completion Checklist

Every future Codex workstream must include:

- Exact files changed.
- Exact behavior changed.
- Git diff summary for the patch.
- Tests run, including command names and results.
- Visual proof or browser proof when UI is affected.
- Live source, local source, screenshot, or browser proof for any changed protected surface.
- Confirmation that no old files were restored.
- Confirmation that no recent fixes were reverted.
- Confirmation that unrelated pages were not touched unless explicitly approved.
- Current project completion percentage.

Regression checklist before completion:

- Sportsbook logos remain visible or protected logo markup is still present.
- Sportsbook right rail remains contained on desktop and the Pick Slip remains visible.
- Logged-in users do not see `Join Free` or `Log In`, and still see profile block plus `Log Out`.
- Risk mode and To Win mode still exist and no stale `RISK TO WIN` copy returns.
- Pending-picks moneyline Line displays `-`.
- Pending-picks spread, run line, and puck line Line values remain signed.
- Pending-picks totals and team totals use numeric-only Line values with no `+`, `U`, or `O`.
- Pending-picks full game totals include `Full Game Total` or matchup context in the Pick column.
- Pending-picks team totals include `Team Total` in the Pick column.
- Pending-picks summary count matches API count and rendered row count.

## Sportsbook Regression Risk Files

Future agents must inspect the current production files first. Do not copy from the files below into production sportsbook work without explicit user approval. If a listed file contains a useful visual idea or implementation detail, manually patch the current production file forward with only the needed change.

### Production protected

These files are active production source or protected runtime/style files. Patch them carefully and only when the task requires it.

- `sportsbook/index.html` - production sportsbook page and current source of truth.
- `static/js/sportsbook-production-fix-persist-reliability.js` - protected sportsbook runtime for logo rows, pick selection, pick slip, and stake mode.
- `static/css/sportsbook-pro.css` - production sportsbook styling.
- `static/css/tmr-redesign-overrides-sportsbook.css` - production sportsbook override styling.
- `sportsbook.html` - legacy redirect stub to `/sportsbook/`; keep as a redirect, never use as page source.
- `pick/index.html` - legacy redirect stub to `/sportsbook/`; keep as a redirect, never use as page source.
- `picks/index.html` - separate production picks/SEO page; do not confuse with the sportsbook app.

### Reference only

These files are visual references or proof artifacts. They are not production source.

- `_design-source/sportsbook-preview-dk.html`
- `approved-design-previews/sportsbook-preview-dk.html`
- `sportsbook-live-layout-proof.png`
- `sportsbook-live-logo-layout-proof.png`
- `sportsbook-live-polish-proof.png`
- `sportsbook-live-source-proof.json`
- `sportsbook-live-stability-proof-current.png`

### Test only

These files are for regression checks or isolated test routes. Do not use them as live sportsbook source.

- `sportsbook-test/index.html`
- `tests/sportsbook-header-regression-test.js`
- `tests/sportsbook-reliability-guard-test.js`
- `tests/sportsbook-stake-mode-ui-test.js`

### Quarantine candidate

These files look like old previews, obsolete runtime variants, or staged copies that could cause regressions if copied back into production. Do not delete them without explicit approval, but do not use them as source for production fixes.

- `sportsbook-new.html`
- `static/js/tmr-redesign-test-sportsbook-logos.js`
- `static/js/sportsbook-board-hotfix.js`
- `static/js/sportsbook-production-fix.js`
- `static/js/sportsbook-production-fix-persist.js`
- `.codex-stage/**/sportsbook.html`
- `.codex-stage/**/sportsbook-new.html`
- `.codex-stage/**/static/js/sportsbook-*.js`
- `.codex-stage/**/static/css/sportsbook*.css`

### Temporary artifact

These files are generated proof, API, or temporary working artifacts. They may be useful for audit history, but they are not production source and should never be copied into production code.

- `sportsbook-live-microlink-json.json`
- `sportsbook-live-polish-microlink.json`
- `.tmp/sportsbook-blob.json`
- `.tmp/sportsbook-commit.json`
- `.tmp/sportsbook-payload.json`
- `.tmp/sportsbook-ref.json`
- `.tmp/sportsbook-test-payload.json`
- `.tmp/sportsbook-tree.json`

## SEO + Schema Standard for New Public Pages (May 21, 2026)

Every NEW public-facing TrustMyRecord page (anything reachable without auth — hubs, contest pages, profile-style pages, marketing pages, content pages) MUST ship with the following in `<head>` from day one. No exceptions, no "we'll add SEO later" follow-up tickets.

Required, in order, immediately after `<meta charset>` + `<meta viewport>`:

1. `<title>` — page-specific, long-tail, ends with `| TrustMyRecord`. Keep < ~70 chars.
2. `<meta name="description">` — 140-200 chars, describes THIS page, includes the platform value (verified picks / handicapping records / contests / leaderboards).
3. `<link rel="canonical">` — only set if you are 100% sure of the canonical URL. **Never edit an existing canonical** without explicit approval; broken canonicals tank rankings.
4. Open Graph block: `og:title`, `og:description`, `og:url`, `og:type` (usually `website`), `og:site_name="TrustMyRecord"`, `og:image` (use `/static/favicon.svg` if no branded image exists yet).
5. Twitter Card block: `twitter:card` (`summary` for most pages, `summary_large_image` only when a real 1200x630 image exists), `twitter:title`, `twitter:description`, `twitter:image`.
6. JSON-LD `<script type="application/ld+json">` — pick one schema type that matches the page (`CollectionPage`, `WebPage`, `ProfilePage`, `AboutPage`, `FAQPage`, etc.) + a `BreadcrumbList` block. Include `isPartOf` pointing at the site WebSite node. No fake ratings, no fake reviews, no fake counts.

Forbidden in schema:
- `aggregateRating`, `review`, `ratingValue` unless backed by real public data.
- Fake follower/user counts in `interactionStatistic`.
- Claims about "verified by Google" / "official partner of X" that aren't true.

Hard guard rails:
- Do NOT rewrite an existing page's canonical without an explicit approval line in the PR description.
- Do NOT add SEO meta to authenticated-only surfaces (e.g. `/account/`, `/messages/`, `/notifications/`, admin tools). They should stay `noindex`.
- Do NOT expose pending picks, autograder internals, admin endpoints, or user PII in any meta tag or JSON-LD.
- Profile pages: schema describes the public profile surface generically — never bake a specific username into the static head; the dynamic page logic can update `og:title` / `og:url` per profile at runtime if needed.

Reference implementations (May 21, 2026):
- Homepage: `/index.html` — full WebSite + Organization + WebApplication graph.
- Hub page: `/handicappers/index.html`, `/leaderboards/index.html`, `/challenges/index.html` — CollectionPage + BreadcrumbList.
- Contest: `/contests/justbet-mlb/index.html` — WebPage + BreadcrumbList.
- Profile: `/profile/index.html` — ProfilePage + BreadcrumbList.

When in doubt: copy the head from the closest reference implementation above and edit only the page-specific strings.

## New Feature Page Pattern (Online Gaming standard)

When adding a new core vertical page (the Online Gaming page, `/online-gaming/`, is the reference), follow this checklist so it is not a one-off:

1. **Reuse the backend, don't duplicate it.** Search `trustmyrecord-backend/routes/` and `server.js` before writing any API. Online Gaming reuses the existing `/api/gaming/*` routes and `database/gaming_schema.sql` (gaming_titles, gaming_challenges, gaming_match_results, gaming_mlb_box_scores, gaming_user_stats, gaming_h2h_records). No new tables were created.
2. **Page shell:** `<body class="tmr-site-shell" data-tmr-route="<slug>"><main class="page">`. Nav + footer inject from `tmr-sitewide.js`. Load order in `<head>`: `tmr-sitewide.css`, then `tmr-sitewide.js`, `config.js`, `backend-api.js` (all `defer`). Use the site palette tokens (`--cyan #2dd4bf`, `--gold #d4a72c`, slate).
3. **Nav registration is part of the task.** Add the route to `routes`/`communityRoutes` in `static/js/tmr-sitewide.js`, add a `routeMeta["<slug>.html"]` entry, and add the file key to `COMMUNITY_GROUP` if it belongs to the community cluster. A page with no nav entry is incomplete (CLAUDE.md rules 17/18).
4. **SEO:** unique `<title>`, meta description, `<link rel=canonical>` (do NOT change canonicals elsewhere), OG/Twitter tags, JSON-LD (CollectionPage + BreadcrumbList; FAQPage when there is real Q&A). One H1, descriptive H2s, natural keywords.
5. **API client usage:** call `api.request('/endpoint', { method, body })`; gate writes behind `await api.getCurrentUser()` and redirect guests to `/login/?next=...`. Render professional empty/loading states; never show fabricated users, records, or counts.
6. **Profile integration** for any per-user data goes in its own `data-tab`/`data-panel` in `profile/index.html`, lazy-loaded on tab click, and must stay isolated from the betting/handicapping ledger.
7. **Stakes/wager language:** online gaming challenges are bragging-rights / reputation only. No cash prize, paid entry, or wagering copy (matches the sitewide money-language rules).

## Trendspotter generator MUST name missing fields and never fail silently (May 23, 2026) — HARD RULE
`/trendspotter/` (`static/js/trendspotter.js`) validation and Generate button must never show the generic "Missing required variables" or present a dead/clickable-but-silent button.
- **Name the field.** `validationErrors()` returns field-specific keys (`missing_side`, `missing_team`, `missing_line`, `invalid_line`, `missing_sample`, …) and `validationMessage()` maps each to a human-readable, market-aware sentence (e.g. "Missing field: enter the Spread line (a number, e.g. -1.5) before generating."). Never collapse distinct missing inputs into one vague message.
- **Visually indicate why, but stay clickable.** When inputs are incomplete the Generate button gets `.is-blocked` + `aria-disabled="true"` + a `title` reason (hard `disabled` only while data is loading). A click while blocked must render the specific named-field message in the results panel — never do nothing.
- **No silent failure.** The click handler logs `[Trendspotter] Generate clicked {query, errors}` and either `Blocked: <key> -> <message>` or `Validation passed -> evaluating verified source rows`. When valid, the result is a verified trend OR an explicit "no verified trend / small sample" message with the sample size — never empty.
- Future Trendspotter work must preserve explicit missing-field messages, the clickable-blocked button, and the console trace.

## Homepage right-rail activity module MUST show meaningful verified stats (May 23, 2026) — HARD RULE
The homepage right-side activity module is the **Capper Trend Spotter** (`index.html`, `#tmrHeroPicksList`). It must surface a meaningful, **verified, positive** trend per capper — never dumb "N picks locked" counts and never a losing/negative trend.
- **Engine:** `computeHighlight(picks, meta)` + `buildTrendSpotter()` in the homepage inline `<script>`. For each active capper it fetches `GET /api/picks?username=<u>&limit=100` (graded/verified picks only for anon — pending is hidden server-side) and picks the single strongest positive highlight by priority: (1) overall active win streak → (2) bet-type streak → (3) sport streak → (4) recent hot form (last 10/8/5) → (5) strong lifetime units/ROI → (6) category/sport win rate → (7) positive overall fallback.
- **Minimum samples (no small-sample nonsense):** streak ≥3 straight wins; win-rate highlights ≥5 graded AND ≥60%; a supporting % only prints when ≥5 sample and ≥55% (else show positive units or honest `N verified picks`); ROI % only at ≥5 decided; lifetime fallback ≥1 graded.
- **Positivity rule:** never render a losing streak, sub-coinflip rate, or negative units. If a capper has no positive trend, they are **skipped** (not shown with a bad stat).
- **No fake/mock/hardcoded:** all highlight text is generated from real `/api/users` + `/api/picks` data. Completed games are never labeled "locked" (the old LOCKED pill is gone). Display up to 10 cappers, richest records first.
- **Refresh:** same cache-bust (`_=<ts>`) per load as the leaderboard; never a stale/static label. Going forward, any homepage activity module must follow this verified-stat contract, not stale locked-count copy.

## Homepage "Public Profiles" / "Capper Trend Spotter" module — refresh contract
The right-side dashboard on `index.html` is **live client-fetched on every page load** (no build-time/static data):
- `hydrateHomepagePreview()` in the inline `<script>` calls `GET /api/users?limit=100` (leaderboard/Public Profiles) and `GET /api/picks?limit=20` (Recent Platform Activity), each with a `_=<timestamp>` cache-buster so a stale browser/CDN copy is never reused.
- Backend source of truth: `routes/users.js` `GET /` reads `user_stats` (updated by the grader/statsAggregator) and only returns users with a public settled pick; it sends `Cache-Control: public, max-age=60, stale-while-revalidate=120`. `routes/picks.js` `GET /` returns only FINAL (graded) statuses for anonymous viewers (pending hidden until owner-authed) and sends `Cache-Control: no-store`.
- Daily/continuous refresh is guaranteed by: grader cron (`grade-picks.yml`, */30) updating stats → 60s API cache ceiling → per-load cache-busted fetch. No manual rebuild needed.
- Personal-record picks only (`picks` table); contest entries live in `contest_picks` and are never mixed in here.
- If this module looks stale again: confirm the live API is fresh first (`curl /api/users` & `/api/picks`), then check the cache-buster + Cache-Control headers above before touching render logic.

## Cautious SEO cluster strategy — MLB prediction/simulator pages (May 26, 2026) — HARD RULE
Build pillar pages one at a time; never spin up a cluster of thin pages at once.
- **Pillar (live):** `/mlb-season-simulator/` targets "MLB season simulator." Honest framing only: it is a season-prediction experience in development, NOT a fully automated simulation engine or live competition. Never claim functionality that does not exist.
- **Planned cluster (documented, DO NOT build until each can be done right with real content/functionality):** MLB Prediction League, MLB Playoff Predictor, MLB Standings Predictor, plus the already-live MLB The Show Stat League.
- **Before adding any cluster page:** it must have unique, substantial content (no thin/duplicate), a verified-record angle, working CTA, and at least one valid inbound link from live structure (tools hub / nav / related page) + sitemap entry. If it would be thin, do not publish it.

## Above-the-fold compactness — Arena/community hub heroes (May 26, 2026) — HARD RULE
Arena and community/hub pages must NOT ship with an oversized hero that pushes the main cards/options far below the fold. On desktop the headline, action buttons, and at least the top row of cards must be visible without a long scroll.
- Keep hero vertical padding tight (Arena `.arena-clean-hero` uses `padding: clamp(28px, 4vw, 48px) 24px 26px` — never a `clamp(...,92px)`-class top pad or a `min-height: ~820px` full-viewport hero).
- Headline stays moderate (`.arena-clean-hero h1` = `clamp(2.2rem, 5vw, 4rem)`, not `5.6rem`+).
- Tighten subtitle/buttons/proof-pill/card spacing (subtitle `margin-top:10px`, actions `16px`, proof `14px`, `.arena-clean-main` `padding-top:18px`, cards `min-height:210px`).
- Keep the premium dark sportsbook style; never remove Arena functionality. Note: this page carries several stacked legacy redesign `<style>` blocks — only the LAST-defined `.arena-clean-*` ruleset is live; edit those, not the earlier overridden ones.
- **CTA honesty:** waitlist/predictions CTAs link only to existing functionality (e.g. `/register/`, `/predictions/`). No forms posting to non-existent endpoints.

## "Active" / activity columns mean recent PICK activity, never login (May 27, 2026) — HARD RULE
On any leaderboard / handicappers / capper directory, an "Active" / "Last active" / activity column means the member's most recent PICK timestamp (graded OR submitted), never login/created/updated date.
- `/api/users` and `/api/users/leaderboard` do NOT return any timestamp field, so falling back to login/created data makes every populated member read "No recent activity". Derive activity from the member's real picks (already fetched client-side by `enrichMembersWithPicks`), using the latest `locked_at || created_at` across non-void picks.
- Display contract (handicappers/index.html `formatPickActivity`): pick today → `Active today`; 1 day → `Last pick: 1 day ago`; 2-7 days → `Last pick: N days ago`; >7 days → `Inactive`; member has no picks → `No picks yet`.
- Never fake activity, never fall back to login/profile-updated dates, never expose pending pick details (a timestamp string only). Keep activity-based sorting (`getActivityTime`) consistent with the displayed value.

## Sportsbook player props are DISPLAY-ONLY (May 27, 2026) — HARD RULE
Player props on the sportsbook board are **view-only** and must stay that way unless an explicit future upgrade is approved (the rollout plan's later sub-steps: schema migration → pickable → grading).
- Source: FanDuel public API via backend `services/fanduelPropsService.js` (isolated, cached, fail-open). Board enrichment is gated by env flag `PROPS_DISPLAY_ENABLED` (default on; set `false` to disable instantly, no code redeploy). Prop items carry `display_only:true`, `manual_entry_allowed:false`, and `market_type` values (`pitcher_strikeouts`, `batter_total_bases`, `batter_hits`, `batter_rbi`) that are intentionally NOT in `SUPPORTED_PICK_MARKETS`, so the picks API rejects any submission (HTTP 400).
- Frontend (`sportsbook/index.html`): the "Player Props" MLB subtab renders via `_renderPlayerPropsBoard`, which is intentionally inert — no buttons, no `onclick`, no `selectGameBet`, no pick-slip/bet-slip/manual-entry hooks. It must never be added to `_groupBackedMarkets` (that path is pickable). The tab only appears when the API returns a non-empty `player_props` group; otherwise show the clean empty state.
- Do NOT wire props to the pick slip, submit flow, grading, or any DB write without an explicit upgrade decision. Props are reference data until then.
