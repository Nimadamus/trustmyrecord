# TrustMyRecord Development Rules

## Current Baseline

The current live sportsbook baseline is commit `572a29bc38ae4a0aed048752188c8c737a2a4559`.

This baseline includes the working sportsbook page with visible team logos, the current cache-busted sportsbook reliability runtime, the wager slip fixes, the Risk / To Win stake mode behavior, pending-pick visibility fixes, and recent fake-profile cleanup work.

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
- Wager slip still supports both Risk X units and To Win X units.
- Pending picks remain visible only where appropriate.
- Public profile pending-pick privacy is not loosened.
- Profile names, avatars, logos, and leaderboard display are not reverted.
- Fake profiles or fake data are not reintroduced.
- Box score and stake-mode logic are not overwritten.
- Any visual reference from old commits is manually re-applied as a small forward patch, not restored wholesale.
- Live or local visual proof is captured for visual tasks when possible.
- Relevant sportsbook regression tests or guards are run when touched behavior can affect sportsbook flow.

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
