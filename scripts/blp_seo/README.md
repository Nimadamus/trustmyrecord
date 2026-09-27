# BetLegend Pro research pages (`/betlegend-pro/<sport>/...`)

`BLP_SEO_NFL_PILOT_20260927`. Approved by Nima 2026-09-27 as an **NFL pilot of 81 pages**:
`/betlegend-pro/nfl/` (hub), 32 team pages `/betlegend-pro/nfl/<team-slug>/` and 48 division
rivalry pages `/betlegend-pro/nfl/<nick>-vs-<nick>/` (nicknames in alphabetical order, the same
slugs as `/nfl-simulator/<nick>-vs-<nick>/`). MLB, NBA and NHL are NOT approved yet. They follow
only once the pilot is crawled and indexed cleanly and Search Console supports expanding.

## The invariant (permanent)

    verified BetLegend Pro data -> exact game ID set -> page
    every statistic on a page is computed from those same IDs

## Pipeline

1. `extract_nfl.py` runs inside the BetLegend Pro backend (private repo `Nimadamus/betlegend-pro`,
   `backend/`) against the shipped runtime artifact, after the engine's own insert only NFL refresh
   (`--refresh`). Rows come from the same functions the live tool answers with. Output goes to a
   data directory **outside this public repo**: it is the paid dataset.
2. `prod_parity.py` asks the live engine's free preview endpoint (never billed, never logged to a
   user's history) for every matchup and compares meeting count, first and last meeting, and the
   NFL game count. Read only.
3. `build_nfl.py <data-dir>` writes the pages and `betlegend-pro/nfl/manifest.json` (every page's
   game IDs, digest and headline figures). It writes nothing unless every gate passes:
   - G1 sane game table, both sides of every game agree
   - G2 this builder's arithmetic equals the engine's own summaries on identical ID sets
   - G3 the live tool agrees (prod-parity.json from the same extract)
   - G4 a market figure uses only seasons the engine marks verified for that market
   - G5 a team page's row against a rival equals the rivalry page, same IDs
   - G6 a rivalry page needs `min_meetings` meetings (`config.json`, currently 10)
4. `python tests/blp-seo-nfl-test.py` validates titles, descriptions, H1s (all unique), canonical,
   robots, JSON-LD and breadcrumbs, links, orphans, parameter URLs, digests and house style.
   Then `npm run test:seo` (the permanent site gate) must still pass.

## Indexing rules

Indexable (and, at launch, in `sitemap.xml`): the hub, team pages, and rivalry pages that pass G6.

Never indexable, never in the sitemap:
- saved or shared research results from the tool, unless one is deliberately promoted into a
  permanent page by Nima
- empty results, filter permutations, sort orders, pagination, any URL with a query string
- `/betlegend-pro/app/` (already `noindex`)

Every page is a static file with a self canonical at its clean trailing slash URL. No page takes
parameters, so no parameter URL can be generated.

## Launch (not done; needs Nima's go after the SEO freeze)

Pages go live only when this branch reaches `main`. Launch order: pages and inbound links first,
confirm every URL returns 200 live, then add the sitemap entries, then `python scripts/seo_audit.py`.
No Search Console or IndexNow submission without his explicit authorization.
