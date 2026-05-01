# Handoff to Local Claude — Make the Visual Redesign Actually Render

**Repo:** `Nimadamus/trustmyrecord` · **Live site:** trustmyrecord.com (GitHub Pages from `main`) · **Branch with all this work:** `claude/redesign-trust-record-site-gL6Od` (already merged to `main` in commits `e0cd925` and `ec8ade6`).

## What was already done — CSS-only, zero functionality changes

A web-based Claude Code session redesigned three pages by adding **only CSS**. No HTML markup, no JavaScript, no IDs, no class names, no onclick handlers, no modals, no API hooks were touched.

1. **`forum/index.html`** — the inline `<style>` block (lines 14–158) was replaced with new dark 2+2-style CSS. Every class name preserved 1:1 (`.fhead`, `.fshell`, `.fgroup-table`, `.frow`, `.ffolder`, `.fname`, `.fbtn`, `.fthread-post`, `.modal-overlay`, `.is-active`, etc.). The ~900 lines of inline JS that builds threads/posts by class name keeps working.

2. **`profile/index.html`** — a new `<style>` block was appended right before `</head>`, scoped to `body.tmr-social-profile`. The 5 existing style blocks above it are untouched. `#profileEditModal`, `#profileAvatarFile`, `handleAvatarUpload(event)`, and tab `.active` logic all preserved.

3. **`sportsbook/index.html`** — same pattern. A new `<style id="tmr-sportsbook-redesign-overrides">` block before `</head>`. None of the 27,533 lines of existing markup/JS touched. All 42+ inline `onclick` handlers, modal IDs (`#createChallengeModal`, `#acceptChallengeModal`, `#createThreadModal`, `#profileEditModal`, `#teamSelectorModal`), and ESPN API hooks (`window.TMR.setSport`, `window.TMR.parseEspnOdds`) intact.

Commit `ec8ade6` also removed 4 standalone preview HTMLs that contained placeholder/mock data and never should have been merged to production.

## The problem the user reports

The redesign is on `main` but the user does **not** see any visual change at trustmyrecord.com/forum/, /profile/, or /sportsbook/.

## Most likely cause

`static/js/tmr-sitewide.js` injects sitewide styling at runtime via a `<style id="tmr-sitewide-...">` element appended to `<head>` AFTER page load. That late injection can sit lower in the source order but win the cascade against the inline `<style>` block I placed in head. End result: my redesign is in the HTML but visually overridden.

Browser cache / Cloudflare cache may also be serving stale HTML.

## What you (local Claude) need to do

**Diagnose in this order:**

1. **Confirm the deploy actually shipped:**
   ```
   gh api repos/Nimadamus/trustmyrecord/pages/builds | head -40
   ```
   Verify the latest build's commit matches `ec8ade6` and status is `built`.

2. **View live source to confirm the CSS is on the deployed file:**
   ```
   curl -s https://trustmyrecord.com/forum/ | grep -c "tmr-redesign\|--bg:#0a0e18\|2+2 redesign"
   ```
   If the count is 0, the deploy didn't actually update or Cloudflare is caching. Purge cache via Cloudflare API or wait it out and have user hard-refresh (Cmd+Shift+R).

3. **Audit runtime CSS injection that might override:**
   ```
   grep -rn "createElement('style')\|innerHTML.*<style\|appendChild.*style" static/js/
   ```
   Check `static/js/tmr-sitewide.js` and any page-specific JS for runtime style injection. If found, that's why my overrides lose.

**The fix (do this regardless):**

Move the redesign CSS out of inline `<style>` blocks into a real stylesheet file that loads AFTER everything else, including any runtime JS injection:

1. Create `static/css/tmr-redesign.css` containing:
   - The forum CSS that's currently in `forum/index.html` lines 14–158
   - The profile override CSS that's currently in `profile/index.html` near `</head>`
   - The sportsbook override CSS that's currently in `sportsbook/index.html` near `</head>`

   Scope each section with a body class selector so the right rules only apply to the right page (e.g., `body.tmr-social-profile { ... }`, `body[data-tmr-page="sportsbook"] { ... }`, etc.). The forum already has its own stylesheet scope; just leave its selectors intact.

2. In each of the three HTML files, replace the inline `<style>` block(s) I added with a single link tag, placed as the LAST stylesheet in `<head>`:
   ```html
   <link rel="stylesheet" href="/static/css/tmr-redesign.css?v=20260501a">
   ```
   Match the `?v=` cache-buster format already used by other stylesheets on the site.

3. Most importantly: if `tmr-sitewide.js` is appending a `<style>` element at runtime, modify the redesign CSS to use slightly higher-specificity selectors (e.g., `body.profile-page.tmr-social-profile .stat-card { ... !important }`) so we win regardless of source order. Keep `!important` on backgrounds, colors, borders, and font-family.

4. Verify with the user via hard-refresh (Cmd+Shift+R or Ctrl+Shift+F5) once the new commit deploys. If Cloudflare is in the path, purge the cache via dashboard or API.

## Hard rules — DO NOT VIOLATE

- **Do not** rewrite HTML markup
- **Do not** rename or remove IDs
- **Do not** rename or remove class names
- **Do not** modify any `.js` file in `static/js/`
- **Do not** remove inline `onclick=""` / `onchange=""` / `onsubmit=""` handlers
- **Do not** change modal markup or IDs (`#createChallengeModal`, `#profileEditModal`, etc.)
- **Do not** touch the ESPN API integration code
- **Do not** touch `index.html` (homepage) — user explicitly said leave it alone

The user's recurring complaint about previous attempts is that functionality kept breaking. CSS-only is mandatory.

## Quick verification

After your fix, verify with:
```
git diff main^..main -- forum/index.html profile/index.html sportsbook/index.html static/css/tmr-redesign.css
```
The diff should show CSS additions and `<style>` block removal/replacement only. No HTML markup changes outside the `<style>`/`<link>` swap. No JS file changes.

## If you'd rather not do all the above and just want a fast win

The minimal fast fix: bump the existing `<style>` blocks I added so they have stronger specificity and `!important` on more rules. That alone may beat any runtime injection. Try this first; if it works, the user is unblocked. The full move-to-external-stylesheet refactor can come later.
