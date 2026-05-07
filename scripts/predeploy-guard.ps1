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

    Write-Output "Predeploy guard passed: current main, line formatter regression, profile direct guard, and cache key are intact."
}
finally {
    Pop-Location
}
