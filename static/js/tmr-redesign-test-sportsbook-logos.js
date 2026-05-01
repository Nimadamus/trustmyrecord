/* ============================================================================
 * TMR REDESIGN TEST — Sportsbook team-logo enhancer (test route only)
 *
 * Loaded ONLY from /sportsbook-test/. Watches #lobbyBoardRows for new
 * .sb-board-row elements and replaces the placeholder <span class="sb-team-tag">
 * (which currently shows just "A" / "H") with a real ESPN team logo image
 * when the row's team name maps to a known team.
 *
 * Hard rules followed:
 *   - No fake teams. The logo URL is built from the REAL team name the
 *     existing renderer placed in <b>.
 *   - No placeholder logos. If the team name is not in the map, we leave
 *     the original "A" / "H" tag exactly as the renderer produced it.
 *   - No JS edits to the existing renderer. This script only reads the DOM
 *     after the renderer runs and decorates it.
 *   - No API edits. Logo URLs come from the public ESPN CDN; failed image
 *     loads silently fall back to the original tag content.
 *   - Only mutations done: replacing the textContent of .sb-team-tag with
 *     an <img> when a match exists. No new structural markup added.
 * ============================================================================ */

(function () {
    'use strict';

    /* ESPN CDN URL pattern: https://a.espncdn.com/i/teamlogos/{league}/500/{abbr}.png
       Maps below use lowercase team-name keys for case-insensitive lookup.
       Where the renderer might produce either short ("Lakers") or long
       ("Los Angeles Lakers") forms, both are mapped. */

    var TEAM_LOGOS = {
        nba: {
            'hawks': 'atl', 'atlanta hawks': 'atl', 'atlanta': 'atl',
            'celtics': 'bos', 'boston celtics': 'bos', 'boston': 'bos',
            'nets': 'bkn', 'brooklyn nets': 'bkn', 'brooklyn': 'bkn',
            'hornets': 'cha', 'charlotte hornets': 'cha', 'charlotte': 'cha',
            'bulls': 'chi', 'chicago bulls': 'chi', 'chicago': 'chi',
            'cavaliers': 'cle', 'cleveland cavaliers': 'cle', 'cleveland': 'cle', 'cavs': 'cle',
            'mavericks': 'dal', 'dallas mavericks': 'dal', 'dallas': 'dal', 'mavs': 'dal',
            'nuggets': 'den', 'denver nuggets': 'den', 'denver': 'den',
            'pistons': 'det', 'detroit pistons': 'det', 'detroit': 'det',
            'warriors': 'gs', 'golden state warriors': 'gs', 'golden state': 'gs',
            'rockets': 'hou', 'houston rockets': 'hou', 'houston': 'hou',
            'pacers': 'ind', 'indiana pacers': 'ind', 'indiana': 'ind',
            'clippers': 'lac', 'la clippers': 'lac', 'los angeles clippers': 'lac',
            'lakers': 'lal', 'los angeles lakers': 'lal', 'la lakers': 'lal',
            'grizzlies': 'mem', 'memphis grizzlies': 'mem', 'memphis': 'mem',
            'heat': 'mia', 'miami heat': 'mia', 'miami': 'mia',
            'bucks': 'mil', 'milwaukee bucks': 'mil', 'milwaukee': 'mil',
            'timberwolves': 'min', 'minnesota timberwolves': 'min', 'minnesota': 'min', 'wolves': 'min',
            'pelicans': 'no', 'new orleans pelicans': 'no', 'new orleans': 'no',
            'knicks': 'ny', 'new york knicks': 'ny', 'new york': 'ny',
            'thunder': 'okc', 'oklahoma city thunder': 'okc', 'oklahoma city': 'okc',
            'magic': 'orl', 'orlando magic': 'orl', 'orlando': 'orl',
            '76ers': 'phi', 'philadelphia 76ers': 'phi', 'philadelphia': 'phi', 'sixers': 'phi',
            'suns': 'phx', 'phoenix suns': 'phx', 'phoenix': 'phx',
            'trail blazers': 'por', 'portland trail blazers': 'por', 'portland': 'por', 'blazers': 'por',
            'kings': 'sac', 'sacramento kings': 'sac', 'sacramento': 'sac',
            'spurs': 'sa', 'san antonio spurs': 'sa', 'san antonio': 'sa',
            'raptors': 'tor', 'toronto raptors': 'tor', 'toronto': 'tor',
            'jazz': 'utah', 'utah jazz': 'utah', 'utah': 'utah',
            'wizards': 'wsh', 'washington wizards': 'wsh', 'washington': 'wsh'
        },

        mlb: {
            'diamondbacks': 'ari', 'arizona diamondbacks': 'ari', 'arizona': 'ari', 'dbacks': 'ari',
            'braves': 'atl', 'atlanta braves': 'atl', 'atlanta': 'atl',
            'orioles': 'bal', 'baltimore orioles': 'bal', 'baltimore': 'bal',
            'red sox': 'bos', 'boston red sox': 'bos', 'boston': 'bos',
            'cubs': 'chc', 'chicago cubs': 'chc',
            'white sox': 'chw', 'chicago white sox': 'chw',
            'reds': 'cin', 'cincinnati reds': 'cin', 'cincinnati': 'cin',
            'guardians': 'cle', 'cleveland guardians': 'cle', 'cleveland': 'cle', 'indians': 'cle',
            'rockies': 'col', 'colorado rockies': 'col', 'colorado': 'col',
            'tigers': 'det', 'detroit tigers': 'det', 'detroit': 'det',
            'astros': 'hou', 'houston astros': 'hou', 'houston': 'hou',
            'royals': 'kc', 'kansas city royals': 'kc', 'kansas city': 'kc',
            'angels': 'laa', 'los angeles angels': 'laa', 'la angels': 'laa', 'anaheim angels': 'laa',
            'dodgers': 'lad', 'los angeles dodgers': 'lad', 'la dodgers': 'lad',
            'marlins': 'mia', 'miami marlins': 'mia', 'miami': 'mia',
            'brewers': 'mil', 'milwaukee brewers': 'mil', 'milwaukee': 'mil',
            'twins': 'min', 'minnesota twins': 'min', 'minnesota': 'min',
            'mets': 'nym', 'new york mets': 'nym',
            'yankees': 'nyy', 'new york yankees': 'nyy',
            'athletics': 'oak', 'oakland athletics': 'oak', 'oakland': 'oak', "a's": 'oak',
            'phillies': 'phi', 'philadelphia phillies': 'phi', 'philadelphia': 'phi',
            'pirates': 'pit', 'pittsburgh pirates': 'pit', 'pittsburgh': 'pit',
            'padres': 'sd', 'san diego padres': 'sd', 'san diego': 'sd',
            'mariners': 'sea', 'seattle mariners': 'sea', 'seattle': 'sea',
            'giants': 'sf', 'san francisco giants': 'sf', 'san francisco': 'sf',
            'cardinals': 'stl', 'st. louis cardinals': 'stl', 'st louis cardinals': 'stl',
            'rays': 'tb', 'tampa bay rays': 'tb', 'tampa bay': 'tb',
            'rangers': 'tex', 'texas rangers': 'tex', 'texas': 'tex',
            'blue jays': 'tor', 'toronto blue jays': 'tor', 'toronto': 'tor',
            'nationals': 'wsh', 'washington nationals': 'wsh', 'washington': 'wsh', 'nats': 'wsh'
        },

        nhl: {
            'ducks': 'ana', 'anaheim ducks': 'ana', 'anaheim': 'ana',
            'coyotes': 'ari', 'arizona coyotes': 'ari', 'utah hockey club': 'utah',
            'bruins': 'bos', 'boston bruins': 'bos', 'boston': 'bos',
            'sabres': 'buf', 'buffalo sabres': 'buf', 'buffalo': 'buf',
            'flames': 'cgy', 'calgary flames': 'cgy', 'calgary': 'cgy',
            'hurricanes': 'car', 'carolina hurricanes': 'car', 'carolina': 'car', 'canes': 'car',
            'blackhawks': 'chi', 'chicago blackhawks': 'chi',
            'avalanche': 'col', 'colorado avalanche': 'col', 'avs': 'col',
            'blue jackets': 'cbj', 'columbus blue jackets': 'cbj', 'columbus': 'cbj',
            'stars': 'dal', 'dallas stars': 'dal',
            'red wings': 'det', 'detroit red wings': 'det',
            'oilers': 'edm', 'edmonton oilers': 'edm', 'edmonton': 'edm',
            'panthers': 'fla', 'florida panthers': 'fla', 'florida': 'fla',
            'kings': 'la', 'los angeles kings': 'la',
            'wild': 'min', 'minnesota wild': 'min',
            'canadiens': 'mtl', 'montreal canadiens': 'mtl', 'montreal': 'mtl', 'habs': 'mtl',
            'predators': 'nsh', 'nashville predators': 'nsh', 'nashville': 'nsh', 'preds': 'nsh',
            'devils': 'nj', 'new jersey devils': 'nj', 'new jersey': 'nj',
            'islanders': 'nyi', 'new york islanders': 'nyi', 'isles': 'nyi',
            'rangers': 'nyr', 'new york rangers': 'nyr',
            'senators': 'ott', 'ottawa senators': 'ott', 'ottawa': 'ott', 'sens': 'ott',
            'flyers': 'phi', 'philadelphia flyers': 'phi',
            'penguins': 'pit', 'pittsburgh penguins': 'pit', 'pens': 'pit',
            'sharks': 'sj', 'san jose sharks': 'sj', 'san jose': 'sj',
            'kraken': 'sea', 'seattle kraken': 'sea',
            'blues': 'stl', 'st. louis blues': 'stl', 'st louis blues': 'stl',
            'lightning': 'tb', 'tampa bay lightning': 'tb', 'bolts': 'tb',
            'maple leafs': 'tor', 'toronto maple leafs': 'tor', 'leafs': 'tor',
            'canucks': 'van', 'vancouver canucks': 'van', 'vancouver': 'van',
            'golden knights': 'vgk', 'vegas golden knights': 'vgk', 'vegas': 'vgk', 'knights': 'vgk',
            'capitals': 'wsh', 'washington capitals': 'wsh', 'caps': 'wsh',
            'jets': 'wpg', 'winnipeg jets': 'wpg', 'winnipeg': 'wpg'
        },

        nfl: {
            'cardinals': 'ari', 'arizona cardinals': 'ari', 'arizona': 'ari',
            'falcons': 'atl', 'atlanta falcons': 'atl', 'atlanta': 'atl',
            'ravens': 'bal', 'baltimore ravens': 'bal', 'baltimore': 'bal',
            'bills': 'buf', 'buffalo bills': 'buf', 'buffalo': 'buf',
            'panthers': 'car', 'carolina panthers': 'car', 'carolina': 'car',
            'bears': 'chi', 'chicago bears': 'chi', 'chicago': 'chi',
            'bengals': 'cin', 'cincinnati bengals': 'cin', 'cincinnati': 'cin',
            'browns': 'cle', 'cleveland browns': 'cle', 'cleveland': 'cle',
            'cowboys': 'dal', 'dallas cowboys': 'dal', 'dallas': 'dal',
            'broncos': 'den', 'denver broncos': 'den', 'denver': 'den',
            'lions': 'det', 'detroit lions': 'det', 'detroit': 'det',
            'packers': 'gb', 'green bay packers': 'gb', 'green bay': 'gb',
            'texans': 'hou', 'houston texans': 'hou', 'houston': 'hou',
            'colts': 'ind', 'indianapolis colts': 'ind', 'indianapolis': 'ind',
            'jaguars': 'jax', 'jacksonville jaguars': 'jax', 'jacksonville': 'jax', 'jags': 'jax',
            'chiefs': 'kc', 'kansas city chiefs': 'kc', 'kansas city': 'kc',
            'raiders': 'lv', 'las vegas raiders': 'lv', 'las vegas': 'lv',
            'chargers': 'lac', 'los angeles chargers': 'lac', 'la chargers': 'lac',
            'rams': 'lar', 'los angeles rams': 'lar', 'la rams': 'lar',
            'dolphins': 'mia', 'miami dolphins': 'mia', 'miami': 'mia',
            'vikings': 'min', 'minnesota vikings': 'min', 'minnesota': 'min',
            'patriots': 'ne', 'new england patriots': 'ne', 'new england': 'ne', 'pats': 'ne',
            'saints': 'no', 'new orleans saints': 'no', 'new orleans': 'no',
            'giants': 'nyg', 'new york giants': 'nyg',
            'jets': 'nyj', 'new york jets': 'nyj',
            'eagles': 'phi', 'philadelphia eagles': 'phi', 'philadelphia': 'phi',
            'steelers': 'pit', 'pittsburgh steelers': 'pit', 'pittsburgh': 'pit',
            '49ers': 'sf', 'san francisco 49ers': 'sf', 'san francisco': 'sf', 'niners': 'sf',
            'seahawks': 'sea', 'seattle seahawks': 'sea', 'seattle': 'sea',
            'buccaneers': 'tb', 'tampa bay buccaneers': 'tb', 'tampa bay': 'tb', 'bucs': 'tb',
            'titans': 'ten', 'tennessee titans': 'ten', 'tennessee': 'ten',
            'commanders': 'wsh', 'washington commanders': 'wsh', 'washington': 'wsh'
        }
    };

    function getCurrentSport() {
        try {
            var s = (window.TMR && window.TMR.selectedSport) ? String(window.TMR.selectedSport) : null;
            if (s) return s.toLowerCase();
        } catch (e) {}
        // Fallback: read the active sport tab
        try {
            var active = document.querySelector('.sportsbook-sport-tab.is-active, .sportsbook-rail-board.is-active');
            if (active && active.dataset && active.dataset.sport) return active.dataset.sport.toLowerCase();
        } catch (e) {}
        return 'nba';
    }

    function lookupLogoUrl(name, sport) {
        if (!name) return null;
        var league = (sport || '').toLowerCase();
        // ESPN serves the same college sports under ncaa-mens-basketball / college-football
        // but we don't have NCAAB / NCAAF maps in this file because team names vary too widely.
        // College sports gracefully fall back to NO logo (existing A/H tag stays).
        var map = TEAM_LOGOS[league];
        if (!map) return null;
        var key = String(name).toLowerCase().trim();
        var abbr = map[key];
        if (!abbr) {
            // Last-word fallback: "New York Yankees" -> "yankees"
            var lastWord = key.split(/\s+/).pop();
            if (lastWord && lastWord !== key) abbr = map[lastWord];
        }
        if (!abbr) return null;
        return 'https://a.espncdn.com/i/teamlogos/' + league + '/500/' + abbr + '.png';
    }

    function enhanceTeam(teamEl, sport) {
        if (!teamEl || teamEl.dataset.tmrLogoEnhanced) return;
        var nameEl = teamEl.querySelector('b');
        var tagEl = teamEl.querySelector('.sb-team-tag');
        if (!nameEl || !tagEl) return;
        var name = (nameEl.textContent || '').trim();
        if (!name) return;
        var url = lookupLogoUrl(name, sport);
        if (!url) {
            // Mark as processed so we don't keep retrying every mutation
            teamEl.dataset.tmrLogoEnhanced = 'no-match';
            return;
        }
        var img = document.createElement('img');
        img.className = 'tmr-team-logo';
        img.src = url;
        img.alt = name + ' logo';
        img.loading = 'lazy';
        img.decoding = 'async';
        var prev = tagEl.textContent;
        img.onerror = function () {
            // Logo URL didn't load — restore the original "A" / "H" letter
            tagEl.classList.remove('has-logo');
            tagEl.textContent = prev;
        };
        tagEl.classList.add('has-logo');
        tagEl.textContent = '';
        tagEl.appendChild(img);
        teamEl.dataset.tmrLogoEnhanced = '1';
    }

    function enhanceAll() {
        var sport = getCurrentSport();
        var teams = document.querySelectorAll('#picks .sb-board-row .sb-board-team');
        for (var i = 0; i < teams.length; i++) enhanceTeam(teams[i], sport);
    }

    function clearStaleAfterSportChange() {
        // When the user clicks a new sport, the board re-renders. Clear our
        // "no-match" flags so previously skipped teams get re-evaluated for
        // the new sport.
        var teams = document.querySelectorAll('#picks .sb-board-row .sb-board-team[data-tmr-logo-enhanced="no-match"]');
        for (var i = 0; i < teams.length; i++) delete teams[i].dataset.tmrLogoEnhanced;
    }

    function init() {
        var container = document.getElementById('lobbyBoardRows');
        if (!container) {
            // Renderer hasn't created the container yet — try again shortly
            return setTimeout(init, 500);
        }
        enhanceAll();
        var observer = new MutationObserver(function () {
            enhanceAll();
        });
        observer.observe(container, { childList: true, subtree: true });

        // Also watch the rail / tab buttons to catch sport switches
        document.addEventListener('click', function (e) {
            var target = e.target.closest('.sportsbook-sport-tab, .sportsbook-rail-board');
            if (target) {
                clearStaleAfterSportChange();
                setTimeout(enhanceAll, 250);
                setTimeout(enhanceAll, 1500);
            }
        }, true);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
