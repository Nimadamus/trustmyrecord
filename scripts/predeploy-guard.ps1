param(
    [string]$Root = ".",
    [switch]$SkipRemoteCheck
)

$ErrorActionPreference = "Stop"

$rootPath = (Resolve-Path -LiteralPath $Root).Path
Push-Location $rootPath
try {
    if (-not (Test-Path -LiteralPath ".git")) {
        throw "Predeploy guard must run from a Git checkout."
    }

    $branch = (git branch --show-current).Trim()
    if ($branch -ne "main") {
        throw "Refusing deploy from branch '$branch'. Deploy from current origin/main only."
    }

    $dirty = (git status --porcelain=v1)
    if ($dirty) {
        throw "Refusing deploy from a dirty worktree. Commit/push exact changes to origin/main first; do not deploy local edits or untracked files."
    }

    if (-not $SkipRemoteCheck) {
        $localHead = (git rev-parse HEAD).Trim()
        $remoteHead = ((git ls-remote origin refs/heads/main) -split "\s+")[0]
        if (-not $remoteHead) {
            throw "Could not read origin/main. Refusing deploy."
        }
        if ($localHead -ne $remoteHead) {
            throw "Local HEAD $localHead does not match origin/main $remoteHead. Pull/rebase before deploy."
        }
    }

    node tests/line-formatting-regression-test.js

    $profile = Get-Content -LiteralPath "profile/index.html" -Raw
    $backend = Get-Content -LiteralPath "static/js/backend-api.js" -Raw
    $simCss = Get-Content -LiteralPath "static/css/mlb-simulator.css" -Raw
    $simPage = Get-Content -LiteralPath "mlb-simulator/index.html" -Raw

    if ($profile -notmatch "backend-api\.js\?v=20260506linefix[0-9]+") {
        throw "Profile is not loading a permanent linefix backend-api cache key."
    }
    if ($profile -notmatch "function formatPickLineValue\(pick\)") {
        throw "Profile direct Line-column formatter is missing."
    }
    if ($profile -match "formatLineValue\(p\.line_snapshot\)") {
        throw "Profile still has a raw signed line formatter call for pick rows."
    }
    if ($backend -notmatch "if \(isTotal \|\| /\\b\(over\|under\)\\b/\.test\(selection\)\)") {
        throw "Shared formatter does not force totals/team totals through unsigned total formatting."
    }
    if ($profile -match "PNG\s*/\s*JPG\s*/\s*WebP") {
        throw "Profile avatar upload helper text regressed."
    }
    if ($profile -notmatch "Share Profile") {
        throw "Profile Share Profile button label is missing."
    }
    if ($profile -notmatch "Embed Profile") {
        throw "Profile Embed Profile button label is missing."
    }
    if ($simPage -notmatch "boxScorePanel" -or $simPage -notmatch "viewBoxScoreLink") {
        throw "MLB simulator box score panel or View Box Score link is missing."
    }
    if ($simCss -notmatch "grid-column:\s*1\s*/\s*-1" -or $simCss -notmatch "\.box-score-scroll") {
        throw "MLB simulator box score full-width/contained-scroll CSS guard failed."
    }

    Write-Output "Predeploy guard passed: current clean main, profile, simulator, line formatting, and cache-key checks are intact."
}
finally {
    Pop-Location
}
