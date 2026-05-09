# TrustMyRecord Product Upgrade System

Last updated: 2026-05-09

This document is the operating standard for upgrading TrustMyRecord without repeating one-off visual fixes or regressing protected betting, profile, ledger, navigation, or grading behavior.

## Protected Baseline

- Work from current `main` only.
- Do not revert commits, restore old files, paste old component versions, or use old screenshots as source of truth.
- Inspect current git status, current remote head, recent commits, and relevant diffs before every patch.
- Patch forward with the smallest manual change that solves the current batch.
- Preserve sportsbook, profile, logo, ledger, autograder, pick slip, risk/to-win, navigation, avatar, and pending-pick privacy fixes.
- Every patch must list exact files changed, tests run, screenshots or live proof where applicable, and remaining risks.

## Product Identity

TrustMyRecord is a premium dark sportsbook plus modern sports social platform for verified handicappers.

It should feel professional, premium, competitive, trustworthy, sports-focused, social, data-driven, clean, modern, and easy to use.

It should not feel like a generic SaaS dashboard, spreadsheet, cheap Bootstrap app, unfinished forum, random table tracker, cluttered admin panel, oversized-box layout, messy mobile page, or inconsistent component library.

References are direction only:

- DraftKings and FanDuel: betting clarity, odds cards, ticket hierarchy.
- ESPN: sports data readability, records, compact tables.
- Twitter/X and Reddit: social posting, replies, community scanning.
- Robinhood and Coinbase: performance clarity, ROI, units, charts.
- Modern dark dashboards: navigation, spacing, cards, filters, responsive layouts.

Do not copy another brand directly.

## Design Bible

### Global Layout

- Use dark navy and charcoal foundations: page background, panel background, elevated card background.
- Avoid giant pure-white containers on authenticated or sportsbook-adjacent pages.
- Use a consistent max-width per page type: marketing can be wider and cinematic; tools should be denser and constrained.
- Page sections should be full-width bands or unframed layouts, not nested floating cards.
- Primary work surfaces should have strong alignment, predictable gaps, and obvious scan paths.

### Header And Navigation

- Header must feel like a premium sportsbook shell: dark, crisp, stable, high contrast.
- Primary nav actions should be obvious; secondary nav should be subdued.
- Do not introduce duplicate navigation paths unless they serve distinct workflows.
- Dropdowns must not overlap, clip, or obscure page content on desktop or mobile.
- Logo, login, join, support, community, and main action buttons are protected.

### Typography

- Use strong hierarchy: page title, section title, metric label, body copy, metadata.
- Avoid oversized headings inside dense tools, tables, cards, or sidebars.
- Labels should be concise and never split into broken letters or awkward fragments.
- Numbers, records, odds, units, and ROI must be easy to read at a glance.

### Color System

- Foundation: near-black, navy, charcoal, slate.
- Surfaces: slightly lighter dark panels with subtle borders.
- Positive: green or teal.
- Negative: red, used only for negative performance or errors.
- Accent: cyan, teal, blue, or controlled green.
- Avoid one-note palettes, washed-out pale sidebars, beige/brown dominance, and decorative orbs.

### Buttons

- One clear primary action per view.
- Primary buttons use accent color and compact confident sizing.
- Secondary buttons are lower contrast but readable.
- Disabled buttons must look intentionally disabled and explain why when needed.
- Avoid chunky, cartoonish, or random gray blob buttons.

### Cards

- Cards should have dark surfaces, soft borders, restrained radius, and purposeful padding.
- Do not put cards inside cards except for repeated items, modals, or framed tools.
- Cards should not be oversized when content is sparse.
- Empty state cards must look intentional, not like disabled gray panels.

### Tables

- Tables must be compact, readable, sortable where appropriate, and visually professional.
- Header labels should be short and stable.
- Important columns should not squeeze into unreadable wrapping.
- Numeric cells should align consistently.
- No fake CLV, fake records, fake stats, fake users, or placeholder garbage.

### Forms

- Inputs, selects, toggles, and segmented controls should share height, border, radius, and focus treatment.
- Native controls should be styled into branded controls while preserving accessibility.
- Error states should say what failed and how to recover.
- Form flows must not use vague labels or duplicate submit buttons.

### Pick Submission Screens

- Pick selection should feel like a real sportsbook ticket.
- Odds, market, team, side, risk, and to-win should be visually connected.
- Risk and to-win must be clearly separated.
- Units must update immediately when stake amount changes.
- Helper text below controls must update immediately when risk or to-win changes.
- No duplicate buttons or confusing labels.

### Sportsbook Panels

- Boards use sportsbook-dark surfaces, clean team rows, aligned odds buttons, and compact market tabs.
- Logos must come from the protected sportsbook logo system.
- Wager tabs, market subtabs, team totals, alternates, and pick slip behavior are protected.
- Started/locked games must be visually clear.

### Bet Ticket And Pick Slip

- Ticket UI should resemble a modern sportsbook slip, not a raw form.
- Selection title, market, odds, stake mode, units, risk, to-win, and submit action must be visible and ordered.
- Pending picks must not be publicly exposed.
- Submitted/grading payloads must preserve `stake_mode`, `units_mode`, `market_key`, `market_label`, and game context.

### Risk And To Win Controls

- Risk and to-win are peer modes, not ambiguous labels.
- Never allow broken wrapping such as `R I S K` or `T O W I N`.
- Calculated units and explanatory text update live.
- Default stake behavior must be predictable and tested.

### Odds Display

- Moneyline should use odds as odds and line as `-`.
- Spreads should display signed line values.
- Totals and team totals should display unsigned total values in the line column; side belongs in the pick text.
- Odds buttons must show odds and line in a stable scan pattern.

### Profile Pages

- Profiles should feel like credible capper pages, not database dumps.
- Avatar and username must load quickly and display correctly.
- Verified record badge should be credible and restrained.
- Record, ROI, units, win rate, graded picks, rank, and breakdowns must be prominent.
- Pending pick share/embed controls are owner-only unless a future explicit product decision changes this with privacy review.

### Public Profile Pages

- Public profiles must be shareable and professional.
- Public viewers see verified/graded record information only.
- Pending picks must not be publicly exposed by buttons, embeds, or public APIs.
- No fake users, fake stats, fake records, or invented engagement.

### Verified Record Displays

- Clearly distinguish verified backend metrics from unavailable or not-yet-tracked data.
- Missing fields stay neutral; do not estimate or fabricate.
- Graded picks must display result, risk, to-win, odds, units, and final outcome clearly when available.

### Ledger Pages

- Ledger is the source of truth.
- Keep tables readable, compact, and filterable.
- P/L, units, odds, market, result, and date must be easy to scan.
- Pending picks remain private unless owner context is explicit.

### Forums

- Forums should feel like a real sports community feed.
- Posts, replies, and actions should be readable and social, not table-like.
- Reply actions should be obvious but not cluttered.
- Empty states should encourage real posting without fake engagement numbers.

### Arena

- Arena should feel competitive and game-like while staying credible.
- Challenge cards need clear opponent, stakes/context, status, and action.
- Empty states should explain whether no challenges exist or data failed to load.

### Polls

- Polls use dark sportsbook surfaces, dark sidebars, premium segmented tabs, styled filters, and intentional empty states.
- Create Poll remains the primary action.
- Sport/category filters remain present and active.
- Empty copy: `No polls in this view yet.` and `Be the first to create one.`

### Challenges

- Challenge flows must clearly distinguish open, active, completed, and owner actions.
- Avoid duplicate challenge actions.
- Records and outcomes must be verified or explicitly unavailable.

### Mobile Layouts

- Mobile must preserve hierarchy, not just stack oversized cards.
- Buttons and tabs must fit without broken words.
- Tables should become responsive cards or controlled horizontal scrollers.
- Header/dropdowns must not cover core content.

### Empty States

- Empty states use dark bordered cards, concise copy, and one useful next action where appropriate.
- Avoid gray disabled-looking blocks.
- Do not imply fake activity.

### Loading States

- Loading states should reserve space and prevent layout jumps.
- Say what is loading when it matters: profile, ledger, sportsbook board, forum posts.
- Do not show fake stats while loading.

### Error States

- Errors should distinguish backend unavailable, no data, permission/private, and validation failures.
- The user should know whether they can retry, change filters, log in, or wait.

### Footer

- Footer should be dark, quiet, and consistent with the sportsbook shell.
- It should not compete with primary workflows.

### Data Accuracy Presentation

- Verified data is labeled and visually credible.
- Unavailable data is neutral, not negative.
- Never invent records, users, stats, picks, engagement, CLV, rankings, or odds.
- Pending pick visibility is a privacy/security concern and must be tested.

### Social Sharing Presentation

- Share profile and embed stats are public-profile actions.
- Pending-pick share/embed actions are owner-only and require explicit privacy review before expansion.
- Social cards should promote verified public records, not pending picks.

## UX Rubric

Grade each page from 0 to 2 for each item: 0 fails, 1 partial, 2 passes.

1. The page immediately tells the user what it is.
2. There is one clear primary action.
3. Secondary actions are visually less important.
4. Important numbers and records are easy to read.
5. Buttons are aligned, readable, and consistent.
6. Cards are sized correctly.
7. Tables are compact, readable, and professional.
8. Forms are clean and obvious.
9. Text does not wrap awkwardly or split into broken labels.
10. Nothing is too large, too small, cramped, or empty.
11. There are no redundant buttons or duplicate actions.
12. Desktop layout is polished.
13. Mobile layout is polished.
14. The page feels like a premium sports betting social platform.
15. Nothing looks amateur, unfinished, generic, or confusing.

Minimum standard for shipping visual work: no rubric item can score 0 unless the item is explicitly out of scope and documented.

## Audit Template

For every page or component, record:

- Current issue.
- Why it is wrong.
- Target state.
- File, component, or route.
- Visual-only or business-logic impact.
- Safe to fix now: yes/no.
- Regression risk.
- Required before screenshots.
- Required after screenshots.
- First patch recommendation.

## Current Audit Summary

### Homepage

- Issue: visually inconsistent with newer sportsbook/profile direction in parts.
- Target: premium first impression, clearer product identity, stronger conversion hierarchy.
- Likely files: `index.html`, `static/css/social-home.css`, `static/css/tmr-sitewide.css`.
- Risk: navigation and conversion links.
- Patch priority: after shared shell standards.

### Header And Navigation

- Issue: protected but historically regression-prone.
- Target: stable sportsbook-dark shell, clean dropdowns, no duplicate nav.
- Likely files: `static/js/navigation.js`, `static/js/tmr-sitewide.js`, `static/css/tmr-sitewide.css`.
- Risk: high.
- Patch priority: Phase 1 guard coverage before visual edits.

### Sportsbook Page

- Issue: high-risk protected surface with recent fixes.
- Target: preserve current functional behavior; only patch with guard-backed changes.
- Likely files: `sportsbook/index.html`, `static/js/sportsbook-production-fix-persist-reliability.js`, sportsbook CSS.
- Risk: very high.
- Patch priority: guard-first only.

### Pick Submission Flow

- Issue: stake mode, unit calculation, helper text, and duplicate buttons are protected.
- Target: sportsbook-grade ticket with clear risk/to-win controls.
- Risk: very high.
- Patch priority: only after regression lockdown.

### Profile And Public Profile

- Issue: improved but still dense; public pending actions were a privacy risk and are now locked down.
- Target: real capper profile with clear verified record and controlled sharing.
- Likely files: `profile/index.html`, `static/js/backend-api.js`.
- Risk: high for profile loading, avatars, pending visibility.
- Patch priority: protect tests, then visual cleanup.

### Ledger And Records

- Issue: table density and source-of-truth clarity need standardization.
- Target: compact verified ledger with clean filters and clear outcomes.
- Risk: high for data accuracy.
- Patch priority: after record display rules are guarded.

### Forums And Forum Posts

- Issue: need more social-feed feel and stronger empty states.
- Target: readable community feed with restrained actions.
- Likely files: `feed/index.html`, forum routes.
- Risk: medium.
- Patch priority: after shared cards/buttons/empty states.

### Forum Post Pages

- Issue: thread detail pages must not drift into cramped table/comment dumps or fake activity.
- Target: readable post/reply hierarchy with clear author, timestamp, reply, moderation, and empty/error states.
- Likely files: `forum/index.html`, `forums/index.html`, `static/js/forums.js`.
- Risk: medium for API thread loading and reply actions.
- Patch priority: after forum list/feed shell remains guarded.

### Arena

- Issue: challenge loading and empty states need consistency.
- Target: competitive dark challenge surface.
- Likely files: `arena/index.html`.
- Risk: medium.
- Patch priority: after shared empty-state design.

### Polls

- Issue: dark visual overhaul already patched, but should be folded into system standards.
- Target: dark sportsbook social poll surface.
- Likely file: `polls/index.html`.
- Risk: low to medium.
- Patch priority: verify against rubric before further changes.

### Challenges

- Issue: needs clear status/action hierarchy.
- Target: challenge cards with explicit state and one primary action.
- Risk: medium.
- Patch priority: after Arena standards.

### Leaderboards And Rankings

- Issue: must avoid fake rank/record presentation.
- Target: verified ranking cards/tables with clear eligibility.
- Likely files: `leaderboards/index.html`, `handicappers/index.html`.
- Risk: high for data accuracy.
- Patch priority: guard eligibility and fake-data rules first.

### Any Leaderboard Pages

- Issue: ranking routes can mislead users if eligibility, sort, or data source is unclear.
- Target: verified rank tables/cards with visible thresholds, positive-unit eligibility, and no invented standings.
- Likely files: `leaderboards/index.html`, `leaderboard/index.html`, `static/js/leaderboard.js`.
- Risk: high for public ranking accuracy.
- Patch priority: keep ranking endpoint, threshold copy, and fake-data guards green before visual changes.

### Any Capper Ranking Pages

- Issue: capper directories can regress into generic profile tables or stale fake records.
- Target: professional capper discovery with verified record, ROI/units, recent activity, eligibility copy, and clean profile links.
- Likely files: `handicappers/index.html`, `cappers/index.html`, `members/index.html`.
- Risk: high for fake users, profile links, and ledger-derived stats.
- Patch priority: protect live summary endpoint, profile links, and eligibility copy before layout work.

### Mobile

- Issue: several pages need controlled mobile audit.
- Target: no broken labels, no overflow except intentional table scrollers, stable header.
- Risk: medium to high.
- Patch priority: add screenshot checklist per page batch.

### Shared UI Components

- Issue: button, card, table, form, and empty-state styles are inconsistent.
- Target: shared tokens/classes with page-specific overrides only when justified.
- Likely files: `static/css/tmr-sitewide.css`, page CSS.
- Risk: high blast radius.
- Patch priority: small additive utilities first.

## Master Punch List

Priority 1: functionality and data accuracy

- Pending picks private on public profile views.
- Risk/to-win calculations and unit text update live.
- Autograder and grading logic protected.
- Verified records, ledger outcomes, rankings, and fake-data rules guarded.

Priority 2: regression risks

- Predeploy guard must match current protected implementation.
- Sportsbook logo, market tabs, pick slip, and payload tests must stay green.
- Profile loading, avatars, and public record display must have proof before visual edits.

Priority 3: major UX problems

- Standardize primary action hierarchy.
- Remove duplicate or ambiguous actions.
- Clarify empty/error/loading states.

Priority 4: major visual design problems

- Replace generic light panels with premium dark surfaces.
- Standardize cards, tabs, filters, selects, and buttons.
- Align typography and spacing.

Priority 5: mobile issues

- Audit top pages at mobile width.
- Fix wrapped labels, overflow, header dropdowns, and table handling.

Priority 6: polish

- Microcopy, hover states, focus states, spacing refinements, subtle gradients.

## Phased Upgrade Plan

### Phase 1: Regression Lockdown

- Protect autograder logic.
- Protect pending pick visibility.
- Protect profile loading and avatar display.
- Protect risk/to-win calculations and units text.
- Protect verified records, ledger, rankings, and grading logic.
- Keep GitHub Actions green before design expansion.

### Phase 2: Shared Design System Cleanup

- Add shared dark surface, button, card, form, table, filter, tab, empty, loading, and error patterns.
- Apply utilities in narrow page batches.
- Avoid broad CSS rewrites without screenshots.

### Phase 3: Page-By-Page Visual Overhaul

- Homepage.
- Sportsbook.
- Pick submission flow.
- Profile and public profiles.
- Ledger and records.
- Forums and forum posts.
- Arena and challenges.
- Polls.
- Leaderboards and capper rankings.

### Phase 4: QA And Proof

- Each batch includes before/after screenshots, live URL proof, exact files changed, git diff summary, tests run, and protected-flow confirmation.
- No batch closes with failing protected guards unless explicitly documented as unrelated and immediately queued.

## Batch Acceptance Checklist

- Current branch/status/recent commits inspected.
- Current remote `main` identified.
- No old version restored.
- Exact files changed listed.
- Protected flows identified.
- Tests run and results recorded.
- Screenshots/live proof captured where UI changed.
- Regression risk stated.
- Project completion percentage updated.
