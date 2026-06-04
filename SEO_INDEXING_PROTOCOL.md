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

## 2. noindex policy
Keep `noindex` ONLY on: auth pages (`/login/`, `/register/`, `/signup/`, `/reset-password/`,
`/verify-email/`, `/activation/`), user-private pages (`/friends/`, `/messages/`,
`/notifications/`, `/my-pending-picks/`, `/my-record/`, `/mypicks/`, `/usercp/`,
`/profile/sport/`), admin pages (`/admin/`, contest admin), embeds/widgets/previews/tests
(`/embed/`, `/extra-markets/`, `*-test/`, `handicappers/preview/`), `/report-bug/`, and
redirect stubs (legacy flat `.html` files and alias dirs, section 3).
Every other public page MUST be indexable (no robots meta, or `index, follow`).
`/how-it-works/` and `/contact/` are PUBLIC INDEXABLE pages (fixed June 3, 2026 — how-it-works
was an accidental noindex meta-refresh stub, contact had a leftover noindex).
NEVER ship a page with `noindex` that is also listed in `sitemap.xml`.

## 3. Redirect stubs
Legacy `*.html` files and keyword alias dirs keep `noindex` + canonical to the target and a
meta-refresh. They MUST NOT appear in sitemap.xml — only the canonical destination does.
Full alias-stub list (all noindex as of June 3, 2026): `/cappers/`->`/handicappers/`,
`/leaderboard/`->`/leaderboards/`, `/community/`->`/feed/`, `/directory/`+`/members/`->`/handicappers/`,
`/dashboard/`+`/account/`->`/profile/`, `/make-picks/`+`/submit/`+`/submit-pick/`+`/pick/`->`/sportsbook/`,
`/signin/`->`/login/`, `/signup/`->`/register/`, `/forums/`->`/forum/`, `/groups/`->`/friends/`,
`/promos/`+`/live/`->`/sportsbook/`, `/polls-trivia/`->`/polls/`.
Any NEW redirect stub must ship with `noindex, follow` from day one.

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

## 9. Deploy + verify
GitHub Pages from `main`. `git push` is blocked by the local publish guard, so deploy
changed files via the GitHub Contents API (`gh api --method PUT repos/Nimadamus/trustmyrecord/contents/<path>`).
After deploy, re-verify live with `curl -I` (expect 200), run `python scripts/seo_audit.py`,
and confirm sitemap no longer lists removed URLs, then request indexing in GSC.
