#!/usr/bin/env python3
"""Bring a CI bake's working tree onto the latest origin/main right before it commits.

CI_SYNC_MAIN_20260902. The bake workflows (Prerender Directory Refresh, MLB
Matchup Pages) check out main, spend two to four minutes generating pages, then
`git push origin HEAD:main`. Anything that lands on main during those minutes
(the other bake bot, the asset re-pin that follows every human push, the
handicapping cron, a person) makes that push non-fast-forward and the whole run
reads as failed: 18 of the prerender's last 30 runs, 21 of the MLB bot's. Those
are not failed bakes; the pages were built fine.

The workflow files cannot be changed by the automation token (GitHub requires
the `workflow` scope for that), so the fix lives here, in the last repo script
each bake runs before its commit step: stash the generated output, fast-forward
onto origin/main, put the output back. That shrinks the race window from the
length of the bake to the few seconds between this call and the push.

Only runs on GitHub Actions (GITHUB_ACTIONS=true); a local run is a no-op.
Never fails the bake: if main cannot be fast-forwarded (a local commit exists,
which the bakes never create) the tree is left exactly as it was and the push
step decides, as before.

Conflict rule: if the stash cannot be re-applied cleanly, the freshly generated
file wins for the files this bake produces (they are rebuilt from live data on
every run; the next run regenerates any block another bot owns), and anything
else keeps the version that just landed on main.
"""
import os
import subprocess
import sys


def _git(*args, check=True):
    return subprocess.run(["git", *args], check=check, text=True,
                          capture_output=True).stdout.strip()


def sync_to_origin_main(label="bake"):
    if os.environ.get("GITHUB_ACTIONS") != "true":
        return
    try:
        _git("fetch", "--quiet", "origin", "main")
        behind = int(_git("rev-list", "--count", "HEAD..origin/main") or "0")
    except subprocess.CalledProcessError as exc:
        print("[ci-sync] fetch failed, continuing on the checkout: %s" % (exc.stderr or exc).strip()[:200])
        return
    if behind == 0:
        print("[ci-sync] main did not move during the %s." % label)
        return

    dirty = _git("status", "--porcelain", "--untracked-files=all")
    stashed = False
    if dirty:
        _git("stash", "push", "--include-untracked", "--quiet", "-m", "ci-sync-%s" % label)
        stashed = True
    try:
        _git("merge", "--ff-only", "--quiet", "origin/main")
    except subprocess.CalledProcessError as exc:
        print("[ci-sync] cannot fast-forward onto origin/main (%s); leaving the tree as it was."
              % (exc.stderr or "").strip()[:200])
        if stashed:
            _git("stash", "pop", "--quiet", check=False)
        return

    if stashed:
        pop = subprocess.run(["git", "stash", "pop", "--quiet"], text=True, capture_output=True)
        if pop.returncode != 0:
            conflicted = [p for p in _git("diff", "--name-only", "--diff-filter=U").splitlines() if p]
            for path in conflicted:
                # `--theirs` in a stash apply is the stash: the output this run just built.
                _git("checkout", "--theirs", "--", path, check=False)
                _git("add", "--", path, check=False)
            _git("stash", "drop", "--quiet", check=False)
            print("[ci-sync] re-applied the %s output over %d new commit(s); kept this run's version of %d conflicted file(s): %s"
                  % (label, behind, len(conflicted), ", ".join(conflicted[:8])))
            return
    print("[ci-sync] fast-forwarded onto origin/main (%d new commit(s) landed during the %s); output re-applied."
          % (behind, label))


if __name__ == "__main__":
    sync_to_origin_main(sys.argv[1] if len(sys.argv) > 1 else "bake")
