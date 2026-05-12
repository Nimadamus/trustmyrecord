# TrustMyRecord Agent Rules

TrustMyRecord is regression-sensitive. The sportsbook is a critical protected surface.

- Never revert to old commits unless the user explicitly instructs it.
- Never restore old files over current files.
- Never overwrite recent fixes.
- Always inspect `git status`, current diffs, and recent commits before changing files.
- Make the smallest targeted patch to the current version.
- Never force push unless explicitly approved.
- Always run `npm run verify:regression` before claiming completion.
- Always visually verify live public pages after deployment.
- Never claim completion from localhost only.
- Never update visual baselines unless explicitly instructed.
- Protect sportsbook layout and functionality as critical.

Regression baselines live in `tests/visual-baselines/`. `npm run verify:regression` must compare against those baselines and must not update them. To intentionally approve new baselines, run `npm run baseline:regression` only after explicit approval and review the screenshot diff before committing.
