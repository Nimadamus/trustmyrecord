param(
    [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
)

$ErrorActionPreference = 'Stop'

$routes = @(
    'index.html',
    'sportsbook.html',
    'challenges.html',
    'arena.html',
    'feed.html',
    'polls.html',
    'trivia.html',
    'forum.html',
    'messages.html',
    'friends.html',
    'notifications.html',
    'profile.html',
    'about.html'
)

$rows = foreach ($route in $routes) {
    $path = Join-Path $Root $route
    if (!(Test-Path $path)) {
        [pscustomobject]@{
            Route = $route
            Title = '[missing file]'
            Navigation = ''
        }
        continue
    }

    $html = Get-Content $path -Raw
    $title = ([regex]::Match($html, '(?is)<title>(.*?)</title>')).Groups[1].Value.Trim()

    $links = [regex]::Matches($html, '(?is)<a\s+[^>]*class=["''][^"'']*(?:nav-link|sidebar-link)[^"'']*["''][^>]*href=["'']([^"'']+)["''][^>]*>(.*?)</a>') |
        ForEach-Object {
            $label = ($_.Groups[2].Value -replace '<[^>]+>', '' -replace '\s+', ' ').Trim()
            "$label -> $($_.Groups[1].Value)"
        } |
        Select-Object -Unique

    if ($links.Count -eq 0) {
        $links = [regex]::Matches($html, '(?is)<nav[^>]*>(.*?)</nav>') |
            ForEach-Object {
                [regex]::Matches($_.Groups[1].Value, '(?is)<a\s+[^>]*href=["'']([^"'']+)["''][^>]*>(.*?)</a>')
            } |
            ForEach-Object {
                $label = ($_.Groups[2].Value -replace '<[^>]+>', '' -replace '\s+', ' ').Trim()
                "$label -> $($_.Groups[1].Value)"
            } |
            Select-Object -Unique
    }

    [pscustomobject]@{
        Route = $route
        Title = $title
        Navigation = ($links -join ' | ')
    }
}

$rows | Format-Table -AutoSize -Wrap
