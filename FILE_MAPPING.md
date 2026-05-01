# TrustMyRecord — Live Page File Mapping

**Purpose:** Document which real production files control each live page, what JS/CSS/API hooks they depend on, and how to safely modify visuals without breaking functionality.

Last updated: May 2026 · Maintained on `main`.

---

## 1. Approved design previews — visual source of truth

Located at: `/approved-design-previews/`

| File | Style | Maps to live page |
| --- | --- | --- |
| `sportsbook-preview-dk.html` | DraftKings-style sportsbook board | `/sportsbook/` |
| `forum-preview-2p2.html` | 2+2 / vBulletin-style tabular forum | `/forum/` |
| `index-preview-pickmonitor.html` | PickMonitor-style profile dashboard with LTR stat strip | `/profile/` (or `/my-record/`) |
| `index-preview-social.html` | X / Twitter-style social profile feed | `/profile/` (alternate direction) |

**These are STATIC mockups with placeholder data** (mock users, fake picks, fake leaderboards). They are NOT wired to any backend, auth, or API. They define visual layout, color, typography, and component hierarchy — nothing else.

**Hard rule:** never serve these directly to production. They are reference designs only. To make changes to the live site, port the visual structure into the real production page (preserving all JS hooks), do not replace the live page with these previews.

---

## 2. Live page → real production file mapping

### `/sportsbook/` (Make Picks board)

- **HTML file:** `sportsbook/index.html` (~27,800 lines — markup + inline scripts + 9 inline `<style>` blocks)
- **Redirect stub:** `sportsbook.html` (13-line redirect to `/sportsbook/`)
- **Stylesheets that affect this page (in cascade order):**
  1. `static/css/social.css`
  2. `static/css/sportsbook.css`
  3. `static/css/tmr-redesign-overrides.css?v=20260501f` (in `<head>`, design overhaul)
  4. `static/css/tmr-sitewide.css?v=20260501navspacing`
  5. `static/css/sportsbook-pro.css?v=20260430pickslipexp1`
  6. `static/css/sportsbook-dk-polish.css?v=20260430hidedup1`
  7. `static/css/tmr-redesign-overrides.css?v=20260501f` (in `<body>` — last word, wins cascade)
- **Page-specific JS (must preserve):**
  - `static/js/sportsbook-production-fix-persist.js` — primary picks board renderer; injects `<style>` and HTML for `.tmr-market-card`, `.sb-board-row`, `.sb-odds`, `.sportsbook-period-tab` etc. at runtime
  - `static/js/sportsbook-production-fix.js`
  - `static/js/sportsbook-board-hotfix.js`
  - `static/js/sportsbook-dashboard-sync.js`
  - `static/js/nhl-markets.js`
- **Sitewide JS (do not touch):** `tmr-sitewide.js`, `backend-api.js`, `auth-persistent.js`, `analytics.js`, `nav-badges.js`, `notifications.js`, `verification-banner.js`, `platform-production-fix.js`
- **Modal IDs that are wired to onclick handlers (DO NOT RENAME):**
  `#createChallengeModal`, `#acceptChallengeModal`, `#createThreadModal`, `#profileEditModal`, `#teamSelectorModal`, `#notificationsPanel`
- **Top-level section IDs used by tab routing (DO NOT RENAME):**
  `#picks`, `#feed`, `#arena`, `#promos`, `#consensus`
- **API integration points:**
  - ESPN free odds API via `window.TMR.parseEspnOdds()`, `window.TMR.sportKeyMap`, `window.TMR.espnPaths`, `window.TMR.setSport()`
  - Internal backend via `static/js/backend-api.js` for picks, records, pending picks
- **Inline `onclick` handlers (~42 of them):**
  Examples: `closeCreateThreadForm()`, `createFeedPost()`, `confirmAcceptChallenge()`, `closeProfileEditor()`, `submitPick()`, `lockPick()`, etc. — all referenced from inline attributes in markup. If markup is rewritten, every one of these handlers must remain attached to its corresponding button/link.
- **Form IDs preserved:** `#promoBook`, `#promoOffer`, `#newPostContent`, `#replyTextarea`, `#pickLineInput`, `#pickOddsInput`, `#unitsInput`, `#pickReasoning`, `#unitsModeToggle`
- **Live runtime DOM contract (what JS expects to find):**
  - `.sportsbook-sports-nav` with `button[data-sportsbook-tab][data-sport]` children — sport selector
  - `.sb-board-row` rows inside `#picks` — game rows; rendered at runtime
  - `.sb-odds`, `.sb-odds-line`, `.sb-odds-price` — the actual price button + its inner spans
  - `.sportsbook-period-bar` containing `.sportsbook-period-tab[.is-active]` — period/market tabs
  - `.sportsbook-board-shell`, `.sportsbook-board-section`, `.sportsbook-board-grid-head`, `.sportsbook-board-table-head`
  - `.sportsbook-picks-layout` — right rail / pick slip
  - `.sportsbook-rail-board`, `.sportsbook-league-rail` — sidebar cards
  - `.tmr-pending-picks-panel`, `.tmr-pending-pick`, `.tmr-pending-pick-sport`, `.tmr-pending-pick-meta`, `.tmr-pending-pick-odds`
  - `.make-picks-loggedout` — visible to signed-out users only
- **`<body>` class:** none. Selectors using `body.tmr-site-shell` are inert until `tmr-sitewide.js` adds the class at runtime. Do not rely on it for first paint.

### `/forum/` (community discussion)

- **HTML file:** `forum/index.html` (~1,300 lines — markup + ~900 lines of inline JavaScript that builds threads/posts/replies dynamically)
- **Redirect stub:** `forum.html` (13-line redirect to `/forum/`)
- **Other forum entry points:** `forums/index.html` (alternate path, redirects to `/forum/`)
- **Stylesheets in cascade order:**
  1. `static/css/tmr-sitewide.css`
  2. `static/css/tmr-redesign-overrides.css?v=20260501f` (in `<head>`)
  3. Inline `<style>` block at the top of `forum/index.html` (lines 14–158, dark 2+2 base)
  4. `static/css/tmr-redesign-overrides.css?v=20260501f` (in `<body>`, last)
- **Page-specific JS (must preserve):** all logic is INLINE in `forum/index.html` (lines ~357-1252). Builds rows by class name. ANY rename of class breaks rendering.
- **Critical class names JS depends on (DO NOT RENAME):**
  - `.fhead`, `.fhead-in`, `.fhead-logo`, `.fhead-search`, `.fhead-links`
  - `.ftabs`, `.ftabs-in`
  - `.fshell`, `.fside`, `.fmain`
  - `.fside-head`, `.fside-row`, `.is-active`
  - `.fcrumb`, `.sep`, `.ftitle`, `.fstats`
  - `.fgroup-table`, `.fgroup-band`, `.fgroup-meta`, `.fcol-head`, `.col-num`, `.col-last`, `.fcell`, `.row-alt`, `.frow`
  - `.frowinner`, `.ffolder` (and `.ffolder.is-pinned`)
  - `.fname`, `.fdesc`, `.flpost-title`, `.flpost-meta`, `.flpost-empty`
  - `.factionrow`, `.fbtn`, `.fbtn.is-primary`, `.fjump`
  - `.fthread-post`, `.fthread-author`, `.fthread-body`
  - `.freply`
  - `.modal-overlay`, `.is-open`, `.modal-box`, `.modal-head`, `.close-btn`, `.modal-body`
  - `.btn`, `.btn-primary`, `.btn-outline`, `.fempty`
- **Critical IDs:** `#searchInput`, `#forumTopNav`, `#forumTopProfileLink`, `#forumTopLoginLink`, `#forumTopRegisterLink`, `#forumTopLogoutBtn`, `#breadcrumb`, `#forumPageTitle`, `#forumPageTitleLabel`, `#viewCategories`, `#categoriesContainer`, `#viewThreads`, `#threadsCategoryLabel`, `#threadsCategoryMeta`, `#threadsBody`, `#sampleThreadBody`, `#viewThread`, `#threadDetailHeader`, `#postsContainer`, `#replyArea`, `#replyText`, `#newThreadModal`, `#newThreadForm`, `#statThreads`, `#statPosts`, `#statUsers`, `#statOnline`, `#forumJumpSelect`, `#indexSampleSectionName`
- **Inline onclick handlers JS expects:** `handleSearch()`, `logoutForumTop()`, `showCategories()`, `openNewThread()`, `closeNewThread()`, `submitThread()`, `onSidebarPick()`, `showThreadsList()`, `showThreadDetail()`, `backToThreads()`, `submitReply()`, `handleForumJump()`, `sortThreads()` — and many `onclick` attributes that pass dynamic args (category slug, thread id) — DO NOT remove or restructure the parent rows; the inline `onclick` strings encode IDs.
- **`<body>` class:** none. Selectors must NOT depend on `body.tmr-site-shell`.

### `/profile/` (user profile / capper record)

- **HTML file:** `profile/index.html` (~7,760 lines)
- **Redirect stub:** `profile.html` (13-line redirect to `/profile/`)
- **Related preview file (NOT live):** `profile-preview.html` at repo root — separate experimental file, currently still on main; should be left alone unless explicitly directed.
- **Stylesheets:**
  - `static/css/tmr-sitewide.css`
  - `static/css/tmr-redesign-overrides.css?v=20260501f` (head + body)
  - 5 inline `<style>` blocks within the file
- **Page-specific JS:** `static/js/profile-widget-embed.js`, `static/js/social-system.js`, `static/js/social-feed.js`, `static/js/social.js`, `static/js/social-home.js`, `static/js/auto-grader-fixed.js`, `static/js/stats-engine.js`, `static/js/forms-fixed.js`, `static/js/forms-login-fix.js`, plus inline scripts for setup-prompt + avatar upload
- **`<body>` class:** `class="profile-page tmr-social-profile"` — selectors using `body.tmr-social-profile` ARE valid here.
- **Critical IDs that must be preserved:**
  - `#profileEditModal`, `#profileAvatarFile` (avatar upload), `#profileAvatarHint`, `#profileAvatarUploader`
  - `#profileSetupPrompt`, `#profileSetupForm`, `#profileSetupMsg`, `#profileSetupSkip`
  - `#setupFavSport`, `#setupFavTeams`
  - `#profileCover`, `#profileHeader`
- **Critical functions wired via onclick / event listeners:** `handleAvatarUpload(event)`, `closeProfileEditor()`, profile setup form submit handler, tab switching using `.active` class on `.profile-tab` / `.tab` elements.
- **API integration:** Backend user API via `static/js/backend-api.js` — fetches user record, picks history, splits, achievements, marketplace items.
- **Tab system:** Multiple tab containers (`.profile-tabs`, `.tabs`) toggle visibility of section panels via `.active` class. Renaming class names will break tab routing.

---

## 3. CSS files at repo root and their purpose

| File | Purpose | Touch policy |
| --- | --- | --- |
| `static/css/tmr-sitewide.css` | Global nav, footer, sitewide tokens | Read-only — used by every page |
| `static/css/tmr-redesign-overrides.css` | Dark redesign overrides (current implementation) | Editable — this is where styling work happens |
| `static/css/sportsbook.css` | Base sportsbook styles | Read-only unless explicitly directed |
| `static/css/sportsbook-pro.css` | Sportsbook design system + variables (`--sb-accent`, `--sb-cell`, etc.) | Read-only — overrides via `tmr-redesign-overrides.css` only |
| `static/css/sportsbook-dk-polish.css` | DK polish layer for `#picks .sb-board-*` and `#picks .sportsbook-period-tab` | Read-only — overrides via `tmr-redesign-overrides.css` only |
| `static/css/social.css`, `social-home.css` | Social feed / home styles | Read-only |
| `static/css/professional.css`, `style.css` | Misc legacy | Read-only |
| `static/css/tmr-page-polish.css` | Cross-page polish | Read-only |

---

## 4. JS files and protection level

| File | Purpose | Touch policy |
| --- | --- | --- |
| `static/js/tmr-sitewide.js` | Injects global nav, footer, kills legacy navs, runtime team-badge styling | DO NOT TOUCH |
| `static/js/backend-api.js` | Centralized API client | DO NOT TOUCH |
| `static/js/auth-persistent.js`, `auth.js`, `forms-login-fix.js`, `forms-fixed.js` | Auth flows | DO NOT TOUCH |
| `static/js/sportsbook-production-fix-persist.js` | Sportsbook board renderer + runtime styles | DO NOT TOUCH (read-only) |
| `static/js/sportsbook-production-fix.js`, `sportsbook-board-hotfix.js`, `sportsbook-dashboard-sync.js`, `nhl-markets.js` | Sportsbook helpers | DO NOT TOUCH |
| `static/js/challenges-engine.js`, `social-feed.js`, `social-home.js`, `social-system.js`, `social.js`, `forums.js`, `leaderboard.js`, `stats-engine.js`, `auto-grader-fixed.js` | Page features | DO NOT TOUCH |
| `static/js/notifications.js`, `nav-badges.js`, `verification-banner.js`, `analytics.js`, `effects.js`, `app.js`, `navigation.js`, `api.js`, `config.js`, `platform-production-fix.js`, `profile-widget-embed.js` | Cross-cutting infra | DO NOT TOUCH |
| `static/js/tmr-redesign-loader.js` | Redesign-only runtime CSS injector | Editable — created for redesign work |

---

## 5. Editing process — the safe way to change visuals

1. **Never overwrite a live `index.html` with a static preview file.** The previews have placeholder data and no functional code.
2. **CSS-only first.** Try `static/css/tmr-redesign-overrides.css` for any color, typography, spacing, or polish change. Loaded last, so it wins cascade with `!important`.
3. **If CSS alone cannot produce the layout** (e.g., re-arranging columns, adding sidebar that doesn't exist in current markup), use a test-route fork:
   - Copy the live page (e.g., `sportsbook/index.html`) into a parallel folder (e.g., `sportsbook-test/index.html`)
   - Modify markup of the COPY only, preserving every ID, class, onclick, modal, script tag from the original
   - Test at `https://trustmyrecord.com/sportsbook-test/`
   - Once validated, replace `sportsbook/index.html` with the proven copy and delete the test folder
4. **Bump the cache-bust version (`?v=...`) on every CSS edit** so Cloudflare and browsers re-fetch.
5. **Never push `--no-verify`.** If the user's local pre-push sim fails, fix the cause.
6. **No fabricated verification claims.** Always paste literal command output when verifying.

---

## 6. Test routes — to be created on user direction

Once user approves this mapping, the next step is to create:

- `sportsbook-test/index.html` — DK preview design ported into the real sportsbook markup
- `forum-test/index.html` — 2+2 preview design ported into the real forum markup
- `profile-test/index.html` — PickMonitor or social preview design ported into the real profile markup

Each test route uses real backend, real auth, real APIs. The only difference vs. the live page is the visual layout. Test at `https://trustmyrecord.com/sportsbook-test/` etc., then promote when approved.
