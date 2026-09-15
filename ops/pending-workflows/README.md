# Pending workflow change: prerender-directory-refresh.yml

Not deployed. GitHub refuses workflow file changes from a token without the
`workflow` scope, and the Claude sessions on the BL laptop only hold OAuth tokens
with `gist, read:org, repo`.

## Who can push it

The GitHub account **Nimadamus** (repo owner), from any client whose credential
carries the `workflow` scope:

- github.com web editor: open `.github/workflows/prerender-directory-refresh.yml`
  on `main`, replace its contents with `prerender-directory-refresh.yml` from this
  folder, commit to `main`; or
- a local clone: `git apply ops/pending-workflows/prerender-directory-refresh.patch`,
  commit, `git push origin main` with a credential that has `workflow` scope
  (for example after `gh auth refresh -s workflow`).

Then delete this folder in the same or a later commit.

## What it changes

Replaces the one-step-per-generator job with a single isolated run of
`scripts/prerender_run.py` (already on `main`), then commit (with a rebase and
retry if `main` moved), then fail the run when any page or stage failed.

## Already live without it

- Per page isolation inside every generator: `prerender_directory.py` bakes
  /handicappers/, /leaderboards/ and the legacy home preview independently;
  `build_profile_pages.py`, `build_forum_threads.py` and
  `prerender_home_snapshot.cjs` skip and log a bad profile, thread, category or
  homepage region, keep its previous file, and still write every other page.
- The Game File logo guard false positive (Inter Miami CF) is fixed, so the SEO
  gate no longer blocks the job.
- Ranked pages bake from the canonical ranking API; `scripts/verify_cached_ranks.py`
  (also `--live`) compares every baked rank with the API.

## Unavailable until it is pushed

- Stage level isolation in CI: a generator that crashes outright, or a gate
  (SEO indexability, /u/ edge fallback, Game File logos) that fails, still stops
  every later step and the commit, as before.
- Gate attribution: reverting only the stage that broke a gate, and treating a
  pre-existing gate failure as a warning instead of blocking good pages.
- Automatic restore of a baked ranking page whose ranks do not match the API.
- The end of run report (pages attempted / succeeded / kept / failed, reasons,
  duration) in the run summary and step outputs, and ::error / ::warning
  annotations per failed or kept page.
- Commit push retry over a moved `main`, and failing the run AFTER the good pages
  are published.
