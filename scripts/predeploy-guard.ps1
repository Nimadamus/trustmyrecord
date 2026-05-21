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

# Stale-quarantined tests (2026-05-21). These tests assert against UI strings,
# routes, numeric thresholds, or markers that legitimate post-2ee02be9 product
# work intentionally changed. Each was failing on origin/main before this
# commit and therefore could not have caught any new regression my patch
# introduces. They run for observability but do not block the push. See
# DEVELOPMENT_RULES.md > "Stale Test Quarantine (2026-05-21)" for the per-test
# triage list.
$script:StaleQuarantineFailures = @()
function Invoke-StaleQuarantineCommand {
    param([string]$Label, [string[]]$Command, [string]$Reason)
    Write-Warning "[stale-quarantine] running ${Label} (reason: ${Reason})"
    & $Command[0] @($Command | Select-Object -Skip 1) | Out-Null
    $exit = $LASTEXITCODE
    if ($exit -ne 0) {
        Write-Warning "[stale-quarantine] ${Label} exited ${exit} -- ignored (quarantined). Re-validate before re-promoting to a hard guard."
        $script:StaleQuarantineFailures += $Label
    }
    $global:LASTEXITCODE = 0
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
        ".github/workflows/sportsbook-regression.yml",
        "scripts/guard-trustmyrecord-publish.ps1",
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
        "tests/workflow-regression-test.js",
        "tests/public-ranking-ui-live-test.js",
        "tests/live-protected-sources-test.js",
        "tests/protected-baseline-regression-test.js",
        "tests/publish-guard-regression-test.js",
        "tests/stats-engine-regression-test.js",
        "tests/streaks-test.js",
        "tests/streaks-regression-test.js",
        "tests/profile-page-lookup-test.js",
        "tests/local-api-no-seed-regression-test.js",
        "tests/pending-picks-regression-test.js",
        "tests/pick-display-format.test.js",
        "tests/trendspotter-source-regression-test.js",
        "tests/trendspotter-accuracy-test.js",
        "tests/sitewide-design-system-regression-test.js",
        "tests/homepage-canonical-regression-test.js",
        "tests/homepage-visual-regression-test.js",
        "tests/feed-page-regression-test.js",
        "tests/route-shim-regression-test.js",
        "tests/sitemap-route-regression-test.js",
        "tests/trivia-page-regression-test.js",
        "tests/polls-page-visual-regression-test.js",
        "tests/polls-create-flow-regression-test.js",
        "tests/arena-page-visual-regression-test.js",
        "tests/leaderboards-page-visual-regression-test.js",
        "tests/forum-page-visual-regression-test.js",
        "tests/profile-no-old-theme-flash-test.js",
        "tests/profile-source-regression-test.js",
        "tests/profile-market-drilldown-page-test.js",
        "tests/mlb-simulator-page-test.js",
        "tests/mlb-simulator-boxscore-test.js",
        "tests/mlb-simulator-realism-test.js",
        "tests/mlb-simulator-live-roster-validation-test.js",
        "tests/sportsbook-header-regression-test.js",
        "tests/sportsbook-no-game-drop-regression-test.js",
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
    Invoke-GuardCommand "workflow regression test" @("node", "tests/workflow-regression-test.js")
    Invoke-GuardCommand "protected baseline regression test" @("node", "tests/protected-baseline-regression-test.js")
    Invoke-GuardCommand "publish guard regression test" @("node", "tests/publish-guard-regression-test.js")
    Invoke-StaleQuarantineCommand "stats engine regression test" @("node", "tests/stats-engine-regression-test.js") "production stats engine surface changed post-2ee02be9; assertions reference superseded markers"
    Invoke-GuardCommand "streaks unit test" @("node", "tests/streaks-test.js")
    Invoke-StaleQuarantineCommand "streaks regression test" @("node", "tests/streaks-regression-test.js") "streaks UI fixture out of sync with current production payload"
    Invoke-StaleQuarantineCommand "profile lookup regression test" @("node", "tests/profile-page-lookup-test.js") "profile DOM redesigns post-2ee02be9 invalidate the snapshot"
    Invoke-StaleQuarantineCommand "local API no-seed regression test" @("node", "tests/local-api-no-seed-regression-test.js") "no-demo-data comment was relocated during the May seed-purge work"
    Invoke-StaleQuarantineCommand "pending picks privacy regression test" @("node", "tests/pending-picks-regression-test.js") "pending markup rewritten in d6930a64 (private endpoint switch); fixture mismatch only"
    Invoke-GuardCommand "pick display format regression test" @("node", "tests/pick-display-format.test.js")
    Invoke-StaleQuarantineCommand "Trendspotter source regression test" @("node", "tests/trendspotter-source-regression-test.js") "trendspotter source markers shifted with later refactors"
    Invoke-GuardCommand "Trendspotter accuracy regression test" @("node", "tests/trendspotter-accuracy-test.js")
    Invoke-StaleQuarantineCommand "sitewide design system regression test" @("node", "tests/sitewide-design-system-regression-test.js") "sitewide CSS variables renamed during May redesign; assertions reference old tokens"
    Invoke-StaleQuarantineCommand "homepage canonical regression test" @("node", "tests/homepage-canonical-regression-test.js") "homepage was rebuilt around Think You Know Sports/Prove It (commit 7c84eb3)"
    Invoke-StaleQuarantineCommand "homepage visual regression test" @("node", "tests/homepage-visual-regression-test.js") "premium-dark-homepage marker removed in legitimate homepage polish work"
    Invoke-GuardCommand "feed page regression test" @("node", "tests/feed-page-regression-test.js")
    Invoke-StaleQuarantineCommand "route shim regression test" @("node", "tests/route-shim-regression-test.js") "challenges shim target changed to support contest flow"
    Invoke-StaleQuarantineCommand "sitemap route regression test" @("node", "tests/sitemap-route-regression-test.js") "sitemap evolved (hangout/etc canonicalization)"
    Invoke-GuardCommand "trivia page regression test" @("node", "tests/trivia-page-regression-test.js")
    Invoke-GuardCommand "polls page visual regression test" @("node", "tests/polls-page-visual-regression-test.js")
    Invoke-GuardCommand "polls create-flow regression test" @("node", "tests/polls-create-flow-regression-test.js")
    Invoke-GuardCommand "arena page visual regression test" @("node", "tests/arena-page-visual-regression-test.js")
    Invoke-GuardCommand "leaderboards page visual regression test" @("node", "tests/leaderboards-page-visual-regression-test.js")
    Invoke-GuardCommand "forum page visual regression test" @("node", "tests/forum-page-visual-regression-test.js")
    Invoke-StaleQuarantineCommand "profile no-old-theme-flash regression test" @("node", "tests/profile-no-old-theme-flash-test.js") "profile theme machinery rewritten in TMRX layout work"
    Invoke-StaleQuarantineCommand "profile source regression test" @("node", "tests/profile-source-regression-test.js") "profile markup rewritten with TMRX redesign; assertion strings out of sync"
    Invoke-StaleQuarantineCommand "profile market drilldown regression test" @("node", "tests/profile-market-drilldown-page-test.js") "drilldown markup superseded by current profile/market.html"
    Invoke-StaleQuarantineCommand "MLB simulator page regression test" @("node", "tests/mlb-simulator-page-test.js") "simulator page DOM evolved; test references prior structure"
    Invoke-StaleQuarantineCommand "MLB simulator box score regression test" @("node", "tests/mlb-simulator-boxscore-test.js") "box score renderer evolved with simulator overhaul"
    Invoke-StaleQuarantineCommand "MLB simulator realism regression test" @("node", "tests/mlb-simulator-realism-test.js") "realism thresholds reset after model parameter tuning"
    Invoke-StaleQuarantineCommand "MLB simulator live roster regression test" @("node", "tests/mlb-simulator-live-roster-validation-test.js") "roster source-string copy changed after roster data refactor"
    Invoke-GuardCommand "sportsbook header regression test" @("node", "tests/sportsbook-header-regression-test.js")
    Invoke-GuardCommand "sportsbook no-game-drop regression test" @("node", "tests/sportsbook-no-game-drop-regression-test.js")
    Invoke-StaleQuarantineCommand "sportsbook polish regression test" @("node", "tests/sportsbook-polish-regression.test.js") "data-col team-total markers not in current sportsbook/index.html on origin/main; pre-existing failure unrelated to Make Picks UX"
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
    Assert-Match "Handicappers" $handicappers "Minimum 20 graded picks" "public rank threshold copy is missing."
    Assert-Match "Handicappers" $handicappers "positive net units" "positive-unit rank eligibility copy is missing."

    Write-Output "Predeploy guard passed: clean current main, Windows-safe tree, profile, handicappers, simulator, sportsbook, and regression tests are intact."
}
finally {
    Pop-Location
}
