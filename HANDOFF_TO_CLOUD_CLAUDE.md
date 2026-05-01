# Handoff: Make TrustMyRecord look like your DK preview WITHOUT breaking the working sportsbook

**Repo:** `C:\Users\Nima\trustmyrecord` (origin: `Nimadamus/trustmyrecord`, GitHub Pages on `main`)
**Live URL:** https://trustmyrecord.com/sportsbook/
**Your preview:** `sportsbook-preview-dk.html` on branch `origin/previews-only`
**Latest commit:** `2a68de9` (CSS overrides) — green tests, deployed, but **Nima says it still looks the same as before**.

## What's already in place — DO NOT redo this part

1. `static/css/tmr-redesign-overrides.css` exists. It is `<link>`-loaded as the **last** stylesheet in the document on `sportsbook/index.html`, `profile/index.html`, and `forum/index.html` (after `sportsbook-pro.css` and `sportsbook-dk-polish.css`). Source-order win is set up.
2. The override is CSS-only. JS, IDs, class names, onclick handlers, modals, ESPN hooks, pick-lock flow, pick-slip code, pending-picks loader, RISK/TO WIN units toggle — all untouched. **Keep it that way.**
3. Pre-push hook runs `C:/Users/Nima/_sb_full_sim.cjs` — currently 85 pass / 0 fail. Don't break it.

## What's broken

The live sportsbook still visually looks identical to before the override. Headless-Chrome screenshot from `2a68de9` deploy shows: dark background works, sport pills work (NBA pill is green), but the **game rows are still tiny / cramped, period bar is cyan-glow, odds buttons are cramped boxes** — not your preview's tall green-accent DK rows.

## Why my port didn't fully take

The live page renders **two parallel class systems** and I only fully covered one:
- `.sportsbook-board-row`, `.sportsbook-board-table-row`, `.sportsbook-board-odds-cell` — partial coverage in v2
- `.sb-board-row`, `.sb-board-col`, `.sb-board-team`, `.sb-odds`, `.sb-odds-line`, `.sb-odds-price`, `.sportsbook-period-tab` — added in v3 with `#picks` prefix

The polish file `sportsbook-dk-polish.css` uses `#picks .sb-board-row { padding: 22px 26px !important; min-height: 148px !important; }` — high specificity. My v3 has matching `#picks .sb-board-row` rules but they aren't visually moving the needle enough for Nima.

## Actually-rendered class names on the live `/sportsbook/` page (curl-grepped)

```
sb-board-col          (10 instances)
sb-odds               (4)   sb-odds-line (4)   sb-odds-price (4)
sb-board-team         (4)   sb-board-action (4)
sportsbook-period-tab (3)
sportsbook-board-table-row    (8)
sportsbook-board-odds-cell    (7)
sportsbook-board-empty (7)    sportsbook-board-empty-icon (7)
sportsbook-board-columns (7)
sportsbook-board-row    (6)
sportsbook-board-table-league (5)
sportsbook-board-tip    (4)
sportsbook-board-table-head   (4)
sportsbook-board-shell  (4)
sportsbook-board-section-head (4)
sportsbook-board-section (4)
sportsbook-board-list-head (4)
```

Plus: `.sportsbook-page-topbar`, `.sportsbook-sports-nav` (top sport pills, working), `.sportsbook-period-bar` (container), `.sportsbook-picks-layout` (right rail), `.sportsbook-rail-board` (8 — sidebar cards), `.sportsbook-league-rail` (left sidebar).

`<body>` has **no class** — `body.tmr-site-shell` selectors in your `tmr-redesign-loader.js` and in `sportsbook-pro.css` are inert because the class isn't applied. Don't rely on `body.tmr-site-shell`.

## Other competing stylesheets in cascade order (mine is last)

```
[0] /static/css/social.css
[1] /static/css/sportsbook.css
[2] /static/css/tmr-redesign-overrides.css?v=20260501c   (in <head>, old, harmless)
[3] /static/css/tmr-sitewide.css?v=20260501navspacing
[4] /static/css/sportsbook-pro.css?v=20260430pickslipexp1
[5] /static/css/sportsbook-dk-polish.css?v=20260430hidedup1
[6] /static/css/tmr-redesign-overrides.css?v=20260501e   (in <body>, my last-resort win)
```

Rules in `sportsbook-dk-polish.css` are scoped to `#picks .…` (specificity 0,1,1). Rules in `sportsbook-pro.css` use `body.tmr-site-shell[data-tmr-route="sportsbook"] …` (inert because no body class).

## What I want you to do

1. **Open** `static/css/tmr-redesign-overrides.css` (path: `C:\Users\Nima\trustmyrecord\static\css\tmr-redesign-overrides.css`).
2. **Replace its body** with a fresh stylesheet that ports your `sportsbook-preview-dk.html` design **directly** onto these live class names:
   - Sport pill bar → `body .sportsbook-sports-nav` + `body .sportsbook-sports-nav button` (already working, keep)
   - Top page chrome → `body .sportsbook-page-topbar`
   - Game rows (the headline change Nima isn't seeing) → `#picks .sb-board-row` with the preview's `.game .gh / .gb / .team-row` typography, padding, min-height, divider lines, hover lift
   - Odds buttons → `#picks .sb-odds` (the visible price button) — match preview's `.odd` exactly: 56px tall min, JetBrains Mono price in `--green-dk`, picked state with green inset shadow
   - Odds inner → `#picks .sb-odds-line` (point/line value), `#picks .sb-odds-price` (American odds) — these are the two lines inside each `.sb-odds`
   - Period/market tab bar → `#picks .sportsbook-period-bar` + `#picks .sportsbook-period-tab` + `#picks .sportsbook-period-tab.is-active` — kill the cyan glow, use green pill on active
   - Section heads → `#picks .sportsbook-board-grid-head`, `#picks .sportsbook-board-section-head`, `#picks .sportsbook-board-list-head`, `#picks .sportsbook-board-table-head`
   - League rails (sidebar cards) → `body .sportsbook-rail-board`, `body .sportsbook-league-rail`
   - Pick slip → `body .sportsbook-picks-layout` (right column)
   - Pending picks panel → `body .tmr-pending-picks-panel`, `body .tmr-pending-pick`, `body .tmr-pending-pick-sport`, `body .tmr-pending-pick-odds`, `body .tmr-pending-pick-meta`
   - Logged-out prompt → `.make-picks-loggedout` (currently the only thing visible to logged-out users — make sure it doesn't look broken on dark bg)
3. **Use `#picks` prefix** everywhere for elements inside the picks page section so you match the polish file's specificity, and **load order does the rest** (mine loads last).
4. **Use `!important`** on every property — non-negotiable; the polish file uses `!important` everywhere.
5. **Bump the cache-bust** in all 3 HTMLs:
   - `sportsbook/index.html` (lines 9177 + 28045 + the `@import` inside the `<style id="tmr-redesign-tail-guard">` block)
   - `profile/index.html` (in `<head>` and just before `</body>`)
   - `forum/index.html` (in `<head>` and just before `</body>`)
   Bump `?v=20260501e` → `?v=20260501f` (or whatever — just change the string so browsers re-fetch).
6. **Do not touch** the inline `<style>` blocks already inside `sportsbook/index.html` (there are ~9 of them). Don't delete them, don't rename their IDs (`tmr-sportsbook-redesign-overrides`, `tmr-redesign-tail-guard`). They're harmless and removing them would mean re-running the whole pre-push test cycle.
7. **Run `node C:/Users/Nima/_sb_full_sim.cjs` before pushing.** Must report `85 pass / 0 fail`. Pre-push hook will block you otherwise.
8. **Commit + push to `main`.** GitHub Pages auto-deploys. Wait for `gh api repos/Nimadamus/trustmyrecord/pages/builds | head -10` to show `built`. Then `curl -s https://trustmyrecord.com/sportsbook/?bust=$(date +%s) | grep -c "TMR REDESIGN"` should still return ≥1.

## Hard rules (Nima will rage if you violate)

- **CSS only.** No JS edits. No markup edits. No removing onclick handlers. No renaming IDs/classes. No new `<script>` tags.
- **Don't touch** any `*.js` file in `static/js/` (especially `sportsbook-production-fix-persist.js`, `tmr-sitewide.js`, `tmr-redesign-loader.js`, `backend-api.js`).
- **Don't delete** `static/css/sportsbook-pro.css` or `static/css/sportsbook-dk-polish.css` — other parts of the site may depend on them. You're _overriding_, not replacing.
- **Don't push with `--no-verify`.** If the sim fails, fix the cause.
- **Don't write anything to Nima's Desktop** unless explicitly asked.
- **No fabricated verification.** Don't say "verified" / "confirmed" / "looks great" without pasting the literal command + output. There's a stop hook that blocks responses with bare verification claims.

## Quick sanity checks before you finish

```
# 1. CSS is being served
curl -sI https://trustmyrecord.com/static/css/tmr-redesign-overrides.css?v=YOURNEWVERSION | head -3

# 2. CSS link is at the end of body on all 3 pages
for p in sportsbook profile forum; do
  echo "$p: $(curl -s https://trustmyrecord.com/$p/?bust=$(date +%s) | grep -c "tmr-redesign-overrides.css?v=YOURNEWVERSION")"
done
# expect: 1 1 1 (or 2 2 2 — sportsbook has @import + link)

# 3. Pre-push sim
node C:/Users/Nima/_sb_full_sim.cjs | tail -1
# expect: ---- TOTAL: 85 pass / 0 fail ----

# 4. Headless chrome screenshot to actually SEE the change
"/c/Program Files/Google/Chrome/Application/chrome.exe" --headless --disable-gpu --window-size=1480,900 \
  --screenshot=C:/Users/Nima/_sb_after.png \
  "https://trustmyrecord.com/sportsbook/?bust=$(date +%s)"
# Then open _sb_after.png and confirm the rows look like sportsbook-preview-dk.html
```

## TL;DR

Visually it should look like your `sportsbook-preview-dk.html` mock. Functionally it must still be the working sportsbook. The bridge is `static/css/tmr-redesign-overrides.css`. I've set up the load order; you write the CSS to match your preview, target the live class names listed above (not your preview's `.sport-bar / .sp / .game / .gh / .gb / .team-row / .odd / .slip / .leg`), use `#picks` prefix and `!important`, bump the cache-bust, run the sim, push.
