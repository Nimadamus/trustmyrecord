param(
    [string]$Root = ".",
    [switch]$SkipRemoteCheck
)

$ErrorActionPreference = "Stop"

function Assert-Match {
    param([string]$Name, [string]$Content, [string]$Pattern, [string]$Message)
    if ($Content -notmatch $Pattern) {
        throw "$Name guard failed: $Message"
    }
}

function Assert-NoMatch {
    param([string]$Name, [string]$Content, [string]$Pattern, [string]$Message)
    if ($Content -match $Pattern) {
        throw "$Name guard failed: $Message"
    }
}

function Invoke-GuardCommand {
    param([string]$Label, [string[]]$Command)
    & $Command[0] @($Command | Select-Object -Skip 1)
    if ($LASTEXITCODE -ne 0) {
        throw "$Label failed with exit code $LASTEXITCODE."
    }
}

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

    $treePaths = @(git ls-tree -r --name-only HEAD)
    $invalidPaths = $treePaths | Where-Object { $_ -match "\\" }
    if ($invalidPaths) {
        throw "Repository contains Windows-unsafe paths: $($invalidPaths -join ', ')"
    }

    $requiredFiles = @(
        "TRUSTMYRECORD_PRODUCT_UPGRADE_SYSTEM.md",
        "profile/index.html",
        "handicappers/index.html",
        "sportsbook/index.html",
        "trendspotter/index.html",
        "mlb-simulator/index.html",
        "static/js/backend-api.js",
        "static/js/tmr-sitewide.js",
        "static/css/tmr-sitewide.css",
        "static/js/sportsbook-production-fix-persist-reliability.js",
        "static/js/pick-display-format.js",
        "static/js/trendspotter.js",
        "static/css/trendspotter.css",
        "static/js/mlb-simulator.js",
        "static/css/mlb-simulator.css",
        "tests/line-formatting-regression-test.js",
        "tests/profile-page-lookup-test.js",
        "tests/pending-picks-regression-test.js",
        "tests/pick-display-format.test.js",
        "tests/trendspotter-source-regression-test.js",
        "tests/sitewide-design-system-regression-test.js",
        "tests/polls-page-visual-regression-test.js",
        "tests/profile-source-regression-test.js",
        "tests/profile-market-drilldown-page-test.js",
        "tests/mlb-simulator-page-test.js",
        "tests/mlb-simulator-boxscore-test.js",
        "tests/mlb-simulator-realism-test.js",
        "tests/mlb-simulator-live-roster-validation-test.js",
        "tests/sportsbook-header-regression-test.js",
        "tests/sportsbook-polish-regression.test.js",
        "tests/sportsbook-reliability-guard-test.js",
        "tests/sportsbook-stake-mode-ui-test.js",
        "tests/auto-grader-regression-test.js"
    )
    foreach ($file in $requiredFiles) {
        if (-not (Test-Path -LiteralPath $file)) {
            throw "Required source/test file missing: $file"
        }
    }

    Invoke-GuardCommand "line formatting regression test" @("node", "tests/line-formatting-regression-test.js")
    Invoke-GuardCommand "profile lookup regression test" @("node", "tests/profile-page-lookup-test.js")
    Invoke-GuardCommand "pending picks privacy regression test" @("node", "tests/pending-picks-regression-test.js")
    Invoke-GuardCommand "pick display format regression test" @("node", "tests/pick-display-format.test.js")
    Invoke-GuardCommand "Trendspotter source regression test" @("node", "tests/trendspotter-source-regression-test.js")
    Invoke-GuardCommand "sitewide design system regression test" @("node", "tests/sitewide-design-system-regression-test.js")
    Invoke-GuardCommand "polls page visual regression test" @("node", "tests/polls-page-visual-regression-test.js")
    Invoke-GuardCommand "profile source regression test" @("node", "tests/profile-source-regression-test.js")
    Invoke-GuardCommand "profile market drilldown regression test" @("node", "tests/profile-market-drilldown-page-test.js")
    Invoke-GuardCommand "MLB simulator page regression test" @("node", "tests/mlb-simulator-page-test.js")
    Invoke-GuardCommand "MLB simulator box score regression test" @("node", "tests/mlb-simulator-boxscore-test.js")
    Invoke-GuardCommand "MLB simulator realism regression test" @("node", "tests/mlb-simulator-realism-test.js")
    Invoke-GuardCommand "MLB simulator live roster regression test" @("node", "tests/mlb-simulator-live-roster-validation-test.js")
    Invoke-GuardCommand "sportsbook header regression test" @("node", "tests/sportsbook-header-regression-test.js")
    Invoke-GuardCommand "sportsbook polish regression test" @("node", "tests/sportsbook-polish-regression.test.js")
    Invoke-GuardCommand "sportsbook reliability regression test" @("node", "tests/sportsbook-reliability-guard-test.js")
    Invoke-GuardCommand "sportsbook stake-mode regression test" @("node", "tests/sportsbook-stake-mode-ui-test.js")
    Invoke-GuardCommand "auto-grader regression test" @("node", "tests/auto-grader-regression-test.js")

    $productSystem = Get-Content -LiteralPath "TRUSTMYRECORD_PRODUCT_UPGRADE_SYSTEM.md" -Raw
    $profile = Get-Content -LiteralPath "profile/index.html" -Raw
    $backend = Get-Content -LiteralPath "static/js/backend-api.js" -Raw
    $simCss = Get-Content -LiteralPath "static/css/mlb-simulator.css" -Raw
    $simPage = Get-Content -LiteralPath "mlb-simulator/index.html" -Raw
    $sportsbook = Get-Content -LiteralPath "sportsbook/index.html" -Raw
    $handicappers = Get-Content -LiteralPath "handicappers/index.html" -Raw
    $reliability = Get-Content -LiteralPath "static/js/sportsbook-production-fix-persist-reliability.js" -Raw

    Assert-Match "Product Upgrade System" $productSystem "Design Bible" "Design Bible section is missing."
    Assert-Match "Product Upgrade System" $productSystem "UX Rubric" "UX Rubric section is missing."
    Assert-Match "Product Upgrade System" $productSystem "Phase 1: Regression Lockdown" "Phase 1 plan is missing."
    Assert-Match "Product Upgrade System" $productSystem "Do not revert commits" "forward-only baseline rule is missing."

    Assert-Match "Profile" $profile "backend-api\.js\?v=20260506linefix[0-9]+" "profile must load the protected backend-api cache key."
    $hasLegacyDirectFormatter = $profile -match "function formatPickLineValue\(pick\)"
    $hasCurrentSharedFormatter = $profile -match "const fmtLine = \(p\) => \{" -and $profile -match "window\.TMR\.formatPickLine\(p\)"
    if (-not ($hasLegacyDirectFormatter -or $hasCurrentSharedFormatter)) {
        throw "Profile Line-column formatter guard is missing."
    }
    Assert-NoMatch "Profile" $profile "PNG\s*/\s*JPG\s*/\s*WebP" "avatar upload helper text regressed."
    Assert-Match "Profile" $profile "Share Profile" "Share Profile label is missing."
    if ($profile -notmatch "Embed Profile" -and $profile -notmatch "Embed Stats") {
        throw "Profile guard failed: Embed profile/stats label is missing."
    }
    Assert-Match "Profile" $profile "platform-production-fix\.js\?v=20260415d" "known profile patch include changed; inspect before deploy."

    Assert-Match "Backend API" $backend "if \(isTotal \|\| /\\b\(over\|under\)\\b/\.test\(selection\)\)" "totals/team totals must use unsigned total formatting."

    Assert-Match "MLB simulator" $simPage "boxScorePanel" "box score panel is missing."
    Assert-Match "MLB simulator" $simPage "viewBoxScoreLink" "View Box Score link is missing."
    Assert-Match "MLB simulator CSS" $simCss "grid-column:\s*1\s*/\s*-1" "box score must span the simulator grid."
    Assert-Match "MLB simulator CSS" $simCss "\.box-score-scroll" "box score scroll container is missing."
    Assert-Match "MLB simulator CSS" $simCss "overflow-x:\s*auto" "box score horizontal scrolling must stay inside the table container."

    Assert-Match "Sportsbook" $sportsbook "sportsbook-production-fix-persist-reliability\.js\?[^`"'<]+" "current reliability script include is missing."
    Assert-Match "Sportsbook" $sportsbook "window\.TMR\._teamLogo" "protected team-logo renderer is missing from sportsbook board rows."
    Assert-NoMatch "Sportsbook" $sportsbook "tmr-redesign-test-sportsbook-logos\.js" "obsolete logo patch script was reintroduced."
    Assert-NoMatch "Sportsbook" $sportsbook "sportsbook-production-fix\.js" "stale non-reliability sportsbook patch was reintroduced."
    Assert-NoMatch "Sportsbook" $sportsbook "sportsbook-production-fix-persist\.js" "stale persist sportsbook patch was reintroduced."
    Assert-NoMatch "Sportsbook" $sportsbook "sportsbook-board-hotfix\.js" "stale sportsbook board hotfix was reintroduced."
    Assert-NoMatch "Sportsbook" $sportsbook "sportsbook-dashboard-sync\.js" "stale sportsbook dashboard sync script was reintroduced."
    Assert-Match "Sportsbook reliability" $reliability "SPORTSBOOK_RELIABILITY_OWNERSHIP" "ownership marker is missing."
    Assert-Match "Sportsbook reliability" $reliability "CANONICAL_TEAM_LOGOS" "canonical logo map is missing."
    Assert-Match "Sportsbook reliability" $reliability "modeRisk" "Risk stake mode control is missing."
    Assert-Match "Sportsbook reliability" $reliability "modeToWin" "To Win stake mode control is missing."

    Assert-Match "Handicappers" $handicappers "<div>Active</div>" "Active column header is missing."
    Assert-Match "Handicappers" $handicappers "formatLastActive" "Active column formatter is missing."

    Write-Output "Predeploy guard passed: clean current main, Windows-safe tree, profile, handicappers, simulator, sportsbook, and regression tests are intact."
}
finally {
    Pop-Location
}
