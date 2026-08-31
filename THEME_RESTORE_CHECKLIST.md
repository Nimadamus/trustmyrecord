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

## Next up (visibly damaged, not yet fixed)
- /forum/ - still the legacy gold/amber theme, own nav and sidebar.
- /contest/ - contest card stat values render with a broken textured fill.
- /matchup-of-the-day/, /trendspotter/, /leaderboard/ - not yet inspected in detail.

## Known false positive
`nav.ds-logo span.mk` reports 1:1 in the sweep. It is gradient text with
`background-clip:text` on a parent; it renders correctly.
