param(
    [switch]$AllowDirty,
    [switch]$SkipRemoteAncestryCheck,
    [switch]$SkipPredeployGuard
)

$ErrorActionPreference = "Stop"

$ExpectedRoot = "C:\Users\Nima\trustmyrecord"
$ExpectedRemote = "github.com/Nimadamus/trustmyrecord.git"
$ExpectedBranch = "main"
$ForbiddenPathTerms = @(
    "archive",
    "backup",
    "clean",
    "deploy",
    "livepush",
    "old",
    "pending-clean",
    "profile-push",
    "sitewide-clean",
    "smoke",
    ".tmp",
    ".codex-stage"
)

function Fail($Message) {
    throw "[publish guard] $Message"
}

$Root = (Resolve-Path -LiteralPath ".").Path
if ($Root -ne $ExpectedRoot) {
    Fail "Wrong working directory: $Root. Publish only from $ExpectedRoot."
}

foreach ($term in $ForbiddenPathTerms) {
    if ($Root.ToLowerInvariant().Contains($term.ToLowerInvariant())) {
        Fail "Working directory contains forbidden archive/staging term '$term': $Root"
    }
}

if (-not (Test-Path -LiteralPath ".git")) {
    Fail "No .git directory found. Refusing publish."
}

$Remote = ((git remote get-url origin) 2>$null).Trim()
if (-not $Remote) {
    Fail "Could not read origin remote."
}
$NormalizedRemote = $Remote -replace "^https://", "" -replace "^git@", "" -replace ":", "/"
if ($NormalizedRemote -ne $ExpectedRemote) {
    Fail "Wrong origin remote '$Remote'. Expected $ExpectedRemote."
}

$Branch = ((git branch --show-current) 2>$null).Trim()
if ($Branch -ne $ExpectedBranch) {
    Fail "Wrong branch '$Branch'. Publish only from $ExpectedBranch."
}

if (-not $AllowDirty) {
    $Status = (git status --porcelain)
    if ($Status) {
        Fail "Working tree has uncommitted changes. Commit/publish intentionally or rerun with -AllowDirty after review."
    }
}

if (-not $SkipRemoteAncestryCheck) {
    $LocalHead = ((git rev-parse HEAD) 2>$null).Trim()
    $RemoteHead = ((git ls-remote origin "refs/heads/$ExpectedBranch") -split "\s+")[0]
    if (-not $RemoteHead) {
        Fail "Could not read origin/$ExpectedBranch."
    }
    $MergeBase = ((git merge-base $LocalHead $RemoteHead) 2>$null).Trim()
    if ($MergeBase -ne $LocalHead -and $MergeBase -ne $RemoteHead) {
        Fail "Local and remote histories diverged. Refusing publish."
    }
}

if (-not $SkipPredeployGuard) {
    $PredeployGuard = Join-Path $Root "scripts\predeploy-guard.ps1"
    if (-not (Test-Path -LiteralPath $PredeployGuard)) {
        Fail "Missing predeploy guard: $PredeployGuard"
    }
    & pwsh -File $PredeployGuard -Root $Root -SkipRemoteCheck
    if ($LASTEXITCODE -ne 0) {
        Fail "Predeploy guard failed. Refusing publish."
    }
}

Write-Output "[publish guard] OK: $ExpectedRoot -> $ExpectedRemote ($ExpectedBranch)"
