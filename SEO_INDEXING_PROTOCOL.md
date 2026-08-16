# TrustMyRecord — Permanent SEO Indexing Protocol

Goal: keep Google Search Console clean. Every public page indexable, every private page
intentionally excluded, sitemap = live canonical 200 URLs only. No 404s or redirects in sitemap.

## 1. The rule that caused the May 2026 incident
NEVER add a URL to `sitemap.xml` before the page is committed AND deployed AND returns 200 live.
The "SEO 4A" change added 3 page dirs + 1 redirect alias to the sitemap, but the 3 page
directories were never committed/pushed (they stayed untracked), so they 404'd live while
sitting in the sitemap. That produced the GSC "Not found (404)" + "Discovered, not indexed"
errors. The redirect alias `/cappers/` produced the "Page with redirect" error.

The 4 GSC "Not found (404)" URLs (June 2026 audit) were `/_design-source/*.html` preview
files listed in an old sitemap; GitHub Pages (Jekyll) never serves `_`-prefixed dirs.
They are intentionally dead: private design previews, never SEO pages, no redirect needed.
NEVER put `_design-source/`, `approved-design-previews/`, test pages, or admin URLs in the sitemap.

Checklist before any sitemap addition:
1. `git status` shows the page file is tracked (not `??`).
2. The page is pushed/deployed.
3. `curl -I https://trustmyrecord.com/<path>/` returns `200` (not 404, not 301/302, not meta-refresh).

## 2. noindex policy (superseded July 15, 2026 — owner directive: "never noindex anything")
As of July 15, 2026, noindex was intentionally removed sitewide, including from all auth
pages and redirect stubs previously listed here — see `scripts/build_profile_pages.py:10-15`
for the standing directive. Do NOT re-add noindex to any public page, including the auth/
redirect-stub examples that used to be listed in this section.
The only `noindex` tags that should exist are on genuinely private/gated surfaces: admin
tools (`/admin/tmr-coin/`), and confirm-before-touching gated features flagged separately
to the owner (currently `/arena/challenge/` per-invite pages, `/mlb-simulator/season/` +
`/mlb-simulator/season/calendar/` login-gated pages). Anything else with `noindex` is a bug —
grep both repos for `noindex`/`X-Robots-Tag` and report it rather than assuming it's policy.

Added 2026-08-16: `/betlegend-pro/app/offline.html`. It is the BetLegend Pro
service worker's offline fallback for `/betlegend-pro/app/`, which is already on
this list. Nobody navigates to it — the worker returns it when an installed app
cannot reach the network, it is linked from nowhere, and its entire content is
"you're offline". Indexing it would put that sentence in search results under
the product's name. It is not in `sitemap.xml`.
`/how-it-works/`, `/contact/`, and `/community/` are PUBLIC INDEXABLE pages, in the sitemap.
NEVER ship a page with `noindex` that is also listed in `sitemap.xml`.

## 3. Redirect stubs
Legacy `*.html` files and keyword alias dirs keep a canonical to the target and a meta-refresh,
and (per the July 15, 2026 policy above) now ship `index, follow`, NOT noindex. They MUST NOT
appear in sitemap.xml — only the canonical destination does. Full alias-stub list: `/cappers/`,
`/directory/`, `/members/` -> `/handicappers/`; `/leaderboard/` -> `/leaderboards/`;
`/dashboard/`+`/account/` -> `/profile/`; `/make-picks/`+`/submit/`+`/submit-pick/` -> `/sportsbook/`;
`/signin/` -> `/login/`; `/signup/` -> `/register/`; `/forums/` -> `/forum/`;
`/groups/` -> `/friends/`; `/promos/`+`/live/` -> `/sportsbook/`; `/polls-trivia/` -> `/polls/`.
`/community/` is NOT a stub — it was rebuilt into a real indexable content hub; do not treat it
as an alias to `/feed/` (that entry above is stale). Every stub must carry both `index, follow`
AND a self-consistent `<link rel="canonical">` to its target (audited/fixed July 28, 2026 —
`/dashboard/`, `/account/`, `/signin/`, `/signup/` were missing canonical entirely).

## 4. Canonical tags
Every indexable page has a self-referencing canonical
`<link rel="canonical" href="https://trustmyrecord.com/<path>/">`. Redirect stubs and
duplicate views canonicalize to the real target. The canonical may sit deep in a long
`<head>` (e.g. `/sportsbook/` line ~2717) — when auditing, parse the FULL head, not the
first N KB, before declaring a canonical missing.

## 5. sitemap.xml
- Namespace MUST be `http://www.sitemaps.org/schemas/sitemap/0.9`.
- ONLY live, 200-status, indexable, canonical public URLs. No 404, no redirect, no noindex.
- Update `<lastmod>` when a page changes.

## 6. robots.txt
`Allow: /` with the sitemap referenced as `Sitemap: https://trustmyrecord.com/sitemap.xml`.
Do not Disallow any indexable page. Cloudflare prepends a managed content-signals block
(disallows AI crawlers like GPTBot/ClaudeBot) — that is fine; Googlebot stays allowed.

## 7. No orphans (Core Rule #17)
Every indexable page needs at least one inbound internal link from live structure
(nav, footer, hub, or a related-links block) in addition to the sitemap entry.
The global footer is injected by `static/js/tmr-sitewide.js` (buildGlobalFooter); key SEO
pages should ALSO get a static HTML link (homepage nav/CTA) so discovery does not depend
on JS rendering.

## 8. MANDATORY automated SEO crawl check after every deploy
Every deployment that touches pages, `sitemap.xml`, or `robots.txt` MUST end with:

    python scripts/seo_audit.py

It verifies live: homepage/robots/sitemap 200; robots.txt references the sitemap and does
not block Googlebot; every sitemap URL returns 200 directly (no redirect/404), has no
meta-robots or X-Robots-Tag noindex, has an exact self-referencing canonical, and has a
title + H1. The deploy is NOT complete until it prints `ALL SEO CHECKS PASSED`.
A failure (exit 2) means fix and re-run — never report the deploy done while it fails.

## 8b. August 9, 2026 — soft-404 root cause and the gate that now blocks it
Search Console showed 76 "Soft 404" + 62 "Not found (404)" + 53 noindex + 13
"Crawled - currently not indexed" AFTER the June/July repairs. The sitemap was
clean and `scripts/seo_audit.py` passed, because **neither tool looked at the
pages that were not in the sitemap.** Findings:

1. **The soft 404s were the compact `/u/<username>/` template.** `GRADED_MIN`
   selected between two templates, and the compact one baked NO record data —
   `Loading record` plus an empty `#uDeep`, ~500 chars of crawlable text, every
   number arriving only after `tmr-profile-hydrate.js` ran. 70 URLs served 200 OK
   saying nothing. The data was already fetched at build time. **There is now ONE
   template** (`page_html(..., compact=True)`); `compact` only changes the title
   wording, adds the "building a record" note, and keeps the page out of the
   sitemap. Do NOT fork the profile template again — the fork is how an entire
   page family drifted into an empty-shell state unnoticed.
2. **Nine `/u/` pages belonged to accounts the API 404s** (deleted members + 4 QA
   accounts). `existing` meant a `/u/` dir, once created, was regenerated forever.
   `build_profile_pages.py` now prunes a page only when `/api/users/<name>`
   positively returns 404/410, and fails closed on every other outcome. Never
   change that to prune on a generic fetch failure.
3. **`build_forum_threads.py` deleted live threads on a transient API failure.**
   `keep` was populated only after the per-thread fetch succeeded, while the prune
   loop deletes any id not in `keep` — so one cold-start/rate-limit/OOM blip
   deleted that thread's page and sitemap entry, and the next 30-minute cron run
   re-created it. Each flap = a real indexed thread 404ing to Googlebot. `keep` is
   now seeded from the (fail-closed) enumeration first.
4. **Two login-gated pages were in the sitemap** (`/trivia/history/`,
   `/wallet/referrals/` — the latter literally renders "This page is private to
   your account"). Removed. Private/personal pages are never submitted.
5. **Empty forum boards are no longer submitted** until they have ≥1 thread. The
   page stays live and linked; only the `<loc>` waits.
6. Thread breadcrumbs pointed at `/forum/#cat-<slug>` (a fragment, not a URL), so
   the 12 real board pages got no inbound link from any of the 103 thread pages.
   Now `/forum/<slug>/`, in both the visible crumb and the JSON-LD.

**The 62 real 404s were legitimate**: ~69 forum threads deleted from the database
since July 20. Nothing links to them and none is in the sitemap. A deleted thread
returning 404 is correct — do not resurrect or redirect them.

**The 53 noindex are correct too**, and `/mlb-simulator/simulations/<date>/<matchup>/`
must stay 200+noindex rather than 404 when the matchup is thin: that URL space is
time-indexed, so today's "nonexistent" matchup is tomorrow's real one. 404ing it
would break a URL that is about to be valid.

**Gate:** `npm run test:seo`
(`tests/seo-indexability-regression-test.js`) is offline, runs in
`regression-lock.yml` on every push/PR, and — critically — runs inside
`prerender-directory-refresh.yml` **before the commit step**, so the 30-minute
cron that owns `/u/`, `/forum/` and `sitemap.xml` cannot publish a bad bake. It
asserts: every sitemap URL resolves + is self-canonical + not noindex + not a
meta-refresh + has title/h1; no page is noindex outside a 4-entry allowlist;
every alias stub stays out of the sitemap with a canonical matching its refresh
target; every `/u/` page is index,follow + self-canonical + ProfilePage + carries
baked stats (the `Loading record` placeholder is a hard failure); every internal
href in every HTML file resolves; and no shipped JS builds the slugless
`/forum/thread/<slug>/` URL. `seo_audit.py` (live) and this test (static) are
complementary — run both.

## 9. Deploy + verify
GitHub Pages from `main`. `git push` is blocked by the local publish guard, so deploy
changed files via the GitHub Contents API (`gh api --method PUT repos/Nimadamus/trustmyrecord/contents/<path>`).
After deploy, re-verify live with `curl -I` (expect 200), run `python scripts/seo_audit.py`,
and confirm sitemap no longer lists removed URLs, then request indexing in GSC.

## 10. Deploy staging dir + push-gate exemption (June 3, 2026)
Deploy sources for Contents-API uploads are staged in `C:\Users\Nima\tmr_seo_staging\`
(NEVER as scratch `.html` inside the trustmyrecord working tree). The local push gate
(`~/.claude/hooks/verify_pushed.py`) exempts that directory, because trustmyrecord has no
publish.py site key and the gate could otherwise never be satisfied (caused an end-of-turn
false-positive loop during the June 3 SEO repair). Verification for anything staged there is
NOT the publish log — it is: (1) the Contents API PUT returns a commit sha, (2) the live URL
returns 200 and matches the staged file (hash compare), (3) `python scripts/seo_audit.py`
exits 0. Do not remove the exemption; do not stage TMR deploy files anywhere else.
