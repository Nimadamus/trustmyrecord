# CI push retry (PUSH_RETRY_20260902)

`push-retry.patch` wraps the `git push origin HEAD:main` in the Prerender
Directory Refresh and MLB Matchup Pages workflows in a fetch, rebase and retry
loop. Without it, any commit that lands on main during a 3-minute bake (the
other bots, the asset re-pin, a human push) rejects the bot's push and the run
fails, which is where most of the "Run failed" mail came from.

Workflow files can only be pushed by a credential with the `workflow` scope,
so from any clone with your own GitHub login:

    git pull
    git apply docs/ci/push-retry.patch
    git commit -am "ci: rebase and retry the bots' push to main"
    git push
