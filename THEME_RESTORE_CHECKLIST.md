# Theme restore + polish checklist

Goal: keep the new dark / electric-blue TMR direction, repair what the theme
migration damaged on each interior page. One page at a time, verified in a
headless Playwright render at 1440px before moving on.

Tools in this tree:
- `node tests/theme-contrast-sweep.cjs <url>...` - contrast audit (4.5:1 / 3:1).
- `node tests/theme-shots.cjs <outdir> <url>...` - full page screenshots.
- `node tests/theme-clip.cjs <outdir> <url>` - top + footer views, serves this
  working tree behind the production origin so unbuilt edits render live.

## Done

### 1. /sportsbook/  (2026-08-31)
- Page level CSS was leaking into the shared shell: a blanket `body button{...}`
  rule boxed every global nav trigger, `footer{text-align:center}` centred the
  site footer, and `body h1..h5` repainted the footer headings in Anton. All six
  leaking selectors now exclude `.ds-nav`, `.ds-footer` and `.tmrlh-related`.
- DraftKings green (`#53d337/#3eb423`) was the interactive accent across the
  page, `tmr-redesign-overrides.css` and `tmr-redesign-overrides-sportsbook.css`.
  Repointed to electric blue. Win / positive stay green (`--dk-win`).
- Active pill fill deepened to `#1668C8 -> #0F55A8` so white 10.75px labels clear
  4.5:1 (they were at 4.0:1 on `#1D7FE8`).
- Sitewide `.tab.active` gradient was mint `#7cf7e7 -> #1D7FE8` with near black
  ink; now `#4DA3FF -> #1D7FE8` with white ink.
- The league rail and pick slip are `position:sticky` but nine ancestors carried
  `overflow-x:hidden`, which makes a scroll container and silently kills sticky.
  Both columns were stranded at the top of an 8,500px board, leaving two tall
  empty gutters. Swapped to `overflow-x:clip` (same clipping, not a scroll
  container). No horizontal overflow introduced.
- Verified: contrast sweep clean, market tabs switch, league rail intact,
  clicking a price still adds the selection to the pick slip, no page errors.

### 2. /forum/  (2026-08-31)
Structure, nav, sidebar and workflow untouched. Styling only.
- The forum was still on the pre-theme gold identity while the rest of the site
  is electric blue: the TMR mark, the Main Site pill, Register, the active nav
  tab underline and every forum row icon. All on the blue ramp now. Main Site is
  an outlined pill so it stops competing with Register. The gold OFFICIAL badge
  and the TMR Coin tip amounts stay gold, they are semantic.
- `.fbtn.is-primary` had been repainted electric blue but kept `color:#3a2c00`
  and a gold border, so its label was brown on blue.
- The shared footer is appended outside `.fshell`, so it never picked up the
  offset that clears the fixed 250px rail. The rail covered the footer's brand
  column and the legal line. Offset mirrored, dropped under 900px like the shell.
- Last-post column: thread titles were `#1a1a1a` and the by-line `#767676` on the
  near-black table, both light-theme leftovers. Now `#E8EFF8` / `#93AEC7`, hover
  electric blue.
- Verified: contrast sweep 0 fails, 12 category rows, 11 category links, 34
  sidebar links, new-thread and search controls present, stats render, footer
  brand clears the rail at x=273, no page errors.

### 3. /contests/ (and /contest/, which redirects here)  (2026-08-31)
Content, cards and links untouched. Styling only.
- "Register for Contest" was a blue-to-teal gradient wearing a near-black label
  at 4.39:1. tmr-theme-a rule 47e assumes every `.cta-primary` is gold-filled and
  forces `#1A1206`, but `tmr-ds-contests.css` had already repainted this one. The
  fill is the deep brand ramp now and the label is pinned white at a specificity
  that outranks 47e, without touching the gold CTAs on the other 18 pages.
- Mint leftovers on the blue chips: the hero eyebrow `#8DEDE0`, the page-level
  `#b4f1e7` on the eyebrow and the isolation note. All on `#BBD9FF`.
- The JustBet sponsor gold on the card stays; it is the sponsor's colour.
- Verified: contrast sweep 0 fails, all five contest links intact, no page errors.

## Next up (visibly damaged, not yet fixed)
- /matchup-of-the-day/, /trendspotter/, /leaderboard/, /marketplace/ - not yet
  inspected in detail.
- /profile/ also loads tmr-redesign-overrides.css, so it picked up the blue
  accent from step 1. Not yet visually verified (needs a signed-in session).

## Known false positive
`nav.ds-logo span.mk` reports 1:1 in the sweep. It is gradient text with
`background-clip:text` on a parent; it renders correctly.
