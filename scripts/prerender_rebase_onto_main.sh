#!/usr/bin/env bash
# PRERENDER_REBASE_20261102: put this run's single prerender commit on top of the latest
# origin/main, resolving the conflicts that used to fail ~1 in 4 runs.
#
# Why runs conflicted: Static Asset Versions (tmr-asset-version-bot) re-pins ?v= asset refs in
# every *.html, including u/<member>/index.html, while a bake is running. The bake's copy still
# carries the old pin on the line next to the data it changed, so `git pull --rebase` stopped on
# a content conflict and the run's pages were never published.
#
# Resolution rule (per file, consistent with CI_SYNC_MAIN_20260902's "never revert main"):
#   * files only this job generates (u/, forum/, static/prerender/): take THIS RUN's copy. The only
#     other writer is the asset re-pin, which is re-applied right after on the merged tree.
#   * every other file: MAIN wins (a human or another bot changed it; this job rebuilds its own
#     output on the next run, so dropping one run's copy loses nothing).
# Then version_static_refs.run(_no_sync=True) re-pins every asset ref against the merged tree and the
# result is folded into the same commit. Exit 0 = rebased and ready to push; non-zero = gave up
# (the tree is restored to the pre-rebase state, like the old `git rebase --abort`).
set -u
git fetch --quiet origin main || exit 1
if git rebase --quiet origin/main >/dev/null 2>&1; then
  exit 0
fi
for i in 1 2 3; do
  conflicted=$(git diff --name-only --diff-filter=U)
  if [ -z "$conflicted" ]; then
    # a modify/delete or other non-content stop we do not auto-resolve
    git rebase --abort; exit 1
  fi
  while IFS= read -r f; do
    [ -z "$f" ] && continue
    case "$f" in
      u/*|forum/*|static/prerender/*)
        # during a rebase "theirs" = the commit being replayed = this run's bake
        git checkout --theirs -- "$f" && git add -- "$f" ;;
      *)
        git checkout --ours -- "$f" && git add -- "$f"
        echo "[prerender-rebase] main wins for $f (rebuilt next run)" ;;
    esac
  done <<< "$conflicted"
  echo "[prerender-rebase] resolved: $(echo "$conflicted" | wc -l) file(s)"
  if GIT_EDITOR=true git rebase --continue >/dev/null 2>&1; then
    python -c "import sys; sys.path.insert(0, 'scripts'); import version_static_refs as v; v.run(False, _no_sync=True)" >/dev/null || true
    if ! git diff --quiet; then
      git add -u -- . ':(exclude)around-the-web'
      git commit --quiet --amend --no-edit
      echo "[prerender-rebase] re-pinned asset refs on the merged tree"
    fi
    exit 0
  fi
done
git rebase --abort; exit 1
