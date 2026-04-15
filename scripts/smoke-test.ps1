param(
    [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
)

$ErrorActionPreference = 'Stop'
$failures = New-Object System.Collections.Generic.List[string]

function Add-Failure {
    param([string]$Message)
    $failures.Add($Message) | Out-Null
}

$htmlFiles = Get-ChildItem $Root -Filter *.html

$forbiddenPattern = 'index\.html#leaderboards|href="index\.html"[^>]*>Picks|href="#(?:picks|leaderboards|profile)"|showSection\(''leaderboard''\)|volleyball|cycling|bicycle|bike'
$estimatedPattern = 'Estimated lines|Some lines are estimated|Generated odds|Pre-generated odds|Estimated from full-game|Modeled first 5|Fallback pricing|title="Estimated odds"|deriveMlbFirst5Fallback'
$fakeFallbackPattern = 'renderDemoFeed|getDemoFeedItems|demoTopics|demoUsers|generateRealisticOdds|Real sample games|realistic odds as fallback|estimatedOdds|seedSamplePolls|seedSampleChallenges|sample contest|SharpMoney|DiamondSharp|Team A'

foreach ($file in $htmlFiles) {
    $html = Get-Content $file.FullName -Raw

    foreach ($match in [regex]::Matches($html, '(?i)href=["'']([^"''#?]+(?:\.html)?[^"'']*)["'']')) {
        $href = $match.Groups[1].Value
        if ($href -match '^(https?:|mailto:|tel:|javascript:|#|/)') { continue }

        $clean = ($href -split '[?#]')[0]
        if ([string]::IsNullOrWhiteSpace($clean) -or $clean -notmatch '\.html$') { continue }

        $target = Join-Path $Root $clean
        if (!(Test-Path $target)) {
            Add-Failure "Missing local link target: $($file.Name) -> $href"
        }
    }

    if ($html -match $forbiddenPattern) {
        Add-Failure "Forbidden stale link/image/content pattern found in $($file.Name)"
    }
}

$sportsbookFiles = @(
    (Join-Path $Root 'sportsbook.html'),
    (Join-Path $Root 'static/js/sportsbook-production-fix.js')
) | Where-Object { Test-Path $_ }

foreach ($file in $sportsbookFiles) {
    $content = Get-Content $file -Raw
    if ($content -match $estimatedPattern) {
        Add-Failure "Forbidden estimated-line pattern found in $(Split-Path $file -Leaf)"
    }
}

$fallbackFiles = @(
    (Join-Path $Root 'static/js/social-home.js'),
    (Join-Path $Root 'static/js/api.js'),
    (Join-Path $Root 'static/js/nhl-markets.js'),
    (Join-Path $Root 'static/js/sportsbook-production-fix.js')
) | Where-Object { Test-Path $_ }

foreach ($file in $fallbackFiles) {
    $content = Get-Content $file -Raw
    if ($content -match $fakeFallbackPattern) {
        Add-Failure "Forbidden fake/demo fallback pattern found in $(Split-Path $file -Leaf)"
    }
}

foreach ($file in $htmlFiles) {
    $html = Get-Content $file.FullName -Raw
    $scope = $html

    foreach ($script in [regex]::Matches($html, '(?i)<script[^>]+src=["'']([^"'']+)["'']')) {
        $clean = ($script.Groups[1].Value -split '[?#]')[0]
        if ($clean -match '^(https?:)?//') { continue }

        $scriptPath = Join-Path $Root $clean
        if (Test-Path $scriptPath) {
            $scope += "`n" + (Get-Content $scriptPath -Raw)
        }
    }

    $calls = [regex]::Matches($html, 'onclick=["'']\s*([A-Za-z_$][\w$]*)\s*\(') |
        ForEach-Object { $_.Groups[1].Value } |
        Sort-Object -Unique

    foreach ($fn in $calls) {
        $hasDefinition =
            $scope -match ('function\s+' + [regex]::Escape($fn) + '\s*\(') -or
            $scope -match ('(?:window\.)' + [regex]::Escape($fn) + '\s*=') -or
            $scope -match ('const\s+' + [regex]::Escape($fn) + '\s*=') -or
            $scope -match ('let\s+' + [regex]::Escape($fn) + '\s*=') -or
            $scope -match ('var\s+' + [regex]::Escape($fn) + '\s*=')

        if (!$hasDefinition) {
            Add-Failure "Missing onclick handler: $($file.Name) -> $fn()"
        }
    }
}

$node = Get-Command node -ErrorAction SilentlyContinue
if ($node) {
    Get-ChildItem (Join-Path $Root 'static/js') -Filter *.js | ForEach-Object {
        $output = & node --check $_.FullName 2>&1
        if ($LASTEXITCODE -ne 0) {
            Add-Failure "Static JS syntax failure in $($_.Name): $($output -join ' ')"
        }
    }

    $temp = Join-Path $env:TEMP ('tmr-inline-js-check-' + [Guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $temp | Out-Null

    foreach ($file in $htmlFiles) {
        $html = Get-Content $file.FullName -Raw
        $matches = [regex]::Matches($html, '(?is)<script(?![^>]*\bsrc=)[^>]*>(.*?)</script>')

        for ($i = 0; $i -lt $matches.Count; $i++) {
            $code = $matches[$i].Groups[1].Value.Trim()
            if ([string]::IsNullOrWhiteSpace($code)) { continue }

            $tempFile = Join-Path $temp ($file.BaseName + '-' + $i + '.js')
            Set-Content -LiteralPath $tempFile -Value $code -Encoding UTF8
            $output = & node --check $tempFile 2>&1
            if ($LASTEXITCODE -ne 0) {
                Add-Failure "Inline JS syntax failure in $($file.Name), script $i`: $($output -join ' ')"
            }
        }
    }
} else {
    Write-Warning 'node was not found; skipped JavaScript syntax checks.'
}

if ($failures.Count -gt 0) {
    Write-Host "Smoke test failed:" -ForegroundColor Red
    $failures | ForEach-Object { Write-Host " - $_" -ForegroundColor Red }
    exit 1
}

Write-Host 'Smoke test passed.' -ForegroundColor Green
