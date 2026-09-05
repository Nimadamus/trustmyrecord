(function () {
    'use strict';

    function text(value) {
        return value == null ? '' : String(value).trim();
    }

    function formatLeagueLabel(value) {
        var key = text(value).toLowerCase().replace(/[\s-]+/g, '_');
        var labels = {
            baseball_mlb: 'MLB',
            mlb: 'MLB',
            icehockey_nhl: 'NHL',
            hockey_nhl: 'NHL',
            nhl: 'NHL',
            basketball_nba: 'NBA',
            nba: 'NBA',
            basketball_nba_summer: 'NBA Summer League',
            nba_summer: 'NBA Summer League',
            americanfootball_nfl: 'NFL',
            football_nfl: 'NFL',
            nfl: 'NFL',
            americanfootball_ncaaf: 'College Football',
            football_ncaaf: 'College Football',
            ncaaf: 'College Football',
            college_football: 'College Football',
            basketball_ncaab: 'College Basketball',
            ncaab: 'College Basketball',
            college_basketball: 'College Basketball'
        };
        if (labels[key]) return labels[key];
        return key ? text(value).replace(/_/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); }) : 'League';
    }

    function marketOf(pick) {
        return text(pick && (pick.market_type || pick.market || pick.bet_type || pick.betType || pick.pick_type || pick.pickType)).toLowerCase();
    }

    function lineOf(pick) {
        if (!pick) return null;
        if (pick.line_snapshot != null && pick.line_snapshot !== '') return pick.line_snapshot;
        if (pick.line != null && pick.line !== '') return pick.line;
        if (pick.point != null && pick.point !== '') return pick.point;
        if (pick.points != null && pick.points !== '') return pick.points;
        return null;
    }

    function trimLine(value) {
        if (value == null || value === '') return '';
        var n = Number(value);
        if (!Number.isFinite(n)) return text(value);
        var s = String(n);
        if (s.indexOf('.') !== -1) s = s.replace(/0+$/, '').replace(/\.$/, '');
        return s;
    }

    function signedLine(value) {
        var s = trimLine(value);
        if (!s) return '';
        var n = Number(s);
        return Number.isFinite(n) && n > 0 ? '+' + s : s;
    }

    function totalLine(value) {
        if (value == null || value === '') return '';
        var n = Number(value);
        return Number.isFinite(n) ? trimLine(Math.abs(n)) : trimLine(value);
    }

    function isMoneyline(market) {
        return market === 'h2h' || market === 'ml' || market === 'moneyline' || market.indexOf('moneyline') !== -1 || /(^|_)h2h$/.test(market);
    }

    function isTeamTotal(market) {
        return market.indexOf('team_total') !== -1 || market.indexOf('team totals') !== -1 || market.indexOf('teamtotal') !== -1;
    }

    function isSpread(market) {
        return market.indexOf('spread') !== -1 || market.indexOf('run_line') !== -1 || market.indexOf('puck_line') !== -1 || market.indexOf('runline') !== -1 || market.indexOf('puckline') !== -1;
    }

    function isTotal(market) {
        return !isTeamTotal(market) && (market.indexOf('total') !== -1 || market.indexOf('over_under') !== -1);
    }

    function sideOf(pick, raw) {
        var source = [
            raw,
            pick && pick.side,
            pick && pick.total_side,
            pick && pick.bet_side,
            pick && pick.pick_side,
            pick && pick.type,
            pick && pick.description
        ].map(text).join(' ');
        if (/\bover\b/i.test(source)) return 'Over';
        if (/\bunder\b/i.test(source)) return 'Under';
        return '';
    }

    function stripLineSuffix(value) {
        return text(value)
            .replace(/\b(team\s+total|moneyline|ml)\b/ig, '')
            .replace(/\b(over|under)\b/ig, '')
            .replace(/\s+[+-]?\d+(?:\.\d+)?\s*$/i, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function teamOf(pick, raw) {
        return stripLineSuffix((pick && (pick.team || pick.team_name || pick.selection_team)) || raw || pick && (pick.selection || pick.pick)) || text(raw) || 'Pick';
    }

    function appendLineIfNeeded(label, lineText) {
        if (!lineText) return label || 'Pick';
        var escaped = lineText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        if (new RegExp('(?:^|\\s)' + escaped + '$').test(text(label))) return label;
        return stripLineSuffix(label) + ' ' + lineText;
    }

    function formatPickDisplay(pick) {
        pick = pick || {};
        var market = marketOf(pick);
        var raw = text(pick.selection_label || pick.selection || pick.pick || pick.team || pick.team_name || pick.description) || 'Pick';
        var line = lineOf(pick);
        var lineText = trimLine(line);
        var side = sideOf(pick, raw);

        if (isTeamTotal(market)) {
            var team = teamOf(pick, raw);
            var ttLineText = totalLine(line);
            var ttLine = side && ttLineText ? side + ' ' + ttLineText : (side || ttLineText || '');
            return {
                pickLabel: ttLine ? team + ' Team Total ' + ttLine : team + ' Team Total',
                lineLabel: ttLine || '-'
            };
        }

        if (isMoneyline(market)) {
            var mlTeam = stripLineSuffix(raw) || teamOf(pick, raw);
            return {
                pickLabel: /\bML\b$/i.test(mlTeam) ? mlTeam : mlTeam + ' ML',
                lineLabel: 'Moneyline'
            };
        }

        if (isSpread(market)) {
            var spreadLine = signedLine(line);
            return {
                pickLabel: spreadLine ? appendLineIfNeeded(raw, spreadLine) : raw,
                lineLabel: spreadLine || '-'
            };
        }

        if (isTotal(market)) {
            var gameTotalLine = totalLine(line);
            var totalLineLabel = side && gameTotalLine ? side + ' ' + gameTotalLine : (side || gameTotalLine || raw);
            return {
                pickLabel: totalLineLabel || raw,
                lineLabel: totalLineLabel || '-'
            };
        }

        return {
            pickLabel: raw,
            lineLabel: lineText || '-'
        };
    }

    /* ========================================================================
     * SECOND_HALF_20260905 — say which SEGMENT of the game a wager settles on.
     *
     * "49ers -2.5" is the same six characters whether it is a full-game spread
     * or a second-half spread, and they are completely different wagers. Every
     * history and record surface reads this so a 2H wager can never be mistaken
     * for a full-game one. Mirrors utils/marketTypes.js on the backend.
     * ===================================================================== */
    var WAGER_SEGMENTS = [
        { key: 'second_half', short: '2H', long: 'Second Half', test: /^second_half_/ },
        { key: 'first_half', short: '1H', long: 'First Half', test: /^first_half_/ },
        { key: 'first_five', short: 'F5', long: 'First 5 Innings', test: /^f5_/ },
        { key: 'first_inning', short: '1st Inn', long: 'First Inning', test: /^first_inning_/ },
        { key: 'period_1', short: '1st', long: 'First Period', test: /^period_1_/ },
        { key: 'period_2', short: '2nd', long: 'Second Period', test: /^period_2_/ },
        { key: 'period_3', short: '3rd', long: 'Third Period', test: /^period_3_/ },
        { key: 'period_4', short: '4th', long: 'Fourth Period', test: /^period_4_/ }
    ];
    /* One constant so the separator can be restyled site-wide in one edit. */
    var WAGER_LABEL_SEPARATOR = ' \u2014 ';

    function wagerSegment(market) {
        var m = text(market).toLowerCase();
        for (var i = 0; i < WAGER_SEGMENTS.length; i++) {
            if (WAGER_SEGMENTS[i].test.test(m)) return WAGER_SEGMENTS[i];
        }
        return null;
    }
    function wagerFamilyLabel(market) {
        var m = text(market).toLowerCase();
        if (isTeamTotal(m)) return 'Team Total';
        if (isMoneyline(m)) return 'ML';
        if (m.indexOf('spread') !== -1) return 'Spread';
        if (m.indexOf('total') !== -1) return 'Total';
        return 'Wager';
    }
    /* "2H Spread", "Spread". */
    function formatMarketLabel(pick) {
        var market = marketOf(pick || {});
        var seg = wagerSegment(market);
        var family = wagerFamilyLabel(market);
        if (!seg) return family === 'ML' ? 'Moneyline' : family;
        return seg.short + ' ' + family;
    }
    /* "NFL \u2014 2H Spread". The wager description the record surfaces show. */
    function formatWagerCategory(pick) {
        var p = pick || {};
        return formatLeagueLabel(p.sport_key || p.sport || p.league) +
            WAGER_LABEL_SEPARATOR + formatMarketLabel(p);
    }
    function wagerSegmentKey(pick) {
        var seg = wagerSegment(marketOf(pick || {}));
        return seg ? seg.key : 'full_game';
    }
    function isSecondHalfWager(pick) {
        return wagerSegmentKey(pick) === 'second_half';
    }

    /* The canonical description says WHICH SEGMENT. "49ers -2.5" is the same
       six characters for a full-game spread and for a second-half spread, and
       they are different wagers with different results. Every surface that
       describes a pick goes through here, so tagging it once here is what makes
       a 2H wager unmistakable on the feed, the ledger, the pending list, a
       share card and a pick page alike. Full-game wagers are untouched. */
    var formatPickDisplayBase = formatPickDisplay;
    formatPickDisplay = function (pick) {
        var out = formatPickDisplayBase(pick) || {};
        var seg = wagerSegment(marketOf(pick || {}));
        out.segment = seg ? seg.key : 'full_game';
        out.segmentShort = seg ? seg.short : '';
        out.segmentLabel = seg ? seg.long : '';
        out.marketLabel = formatMarketLabel(pick);
        out.wagerCategory = formatWagerCategory(pick);
        if (seg && out.pickLabel && String(out.pickLabel).indexOf(seg.short + ' ') !== 0) {
            out.pickLabel = seg.short + ' ' + out.pickLabel;
        }
        return out;
    };

    window.TMR = window.TMR || {};
    window.TMR.formatPickDisplay = formatPickDisplay;
    window.TMR.formatPickDisplayLabel = function (pick) {
        return formatPickDisplay(pick).pickLabel;
    };
    window.TMR.formatPickLineLabel = function (pick) {
        return formatPickDisplay(pick).lineLabel;
    };
    window.TMR.formatLeagueLabel = formatLeagueLabel;
    window.TMR.formatMarketLabel = formatMarketLabel;
    window.TMR.formatWagerCategory = formatWagerCategory;
    window.TMR.wagerSegmentKey = wagerSegmentKey;
    window.TMR.isSecondHalfWager = isSecondHalfWager;
    window.TMR.WAGER_SEGMENTS = WAGER_SEGMENTS;
    window.TMR.formatPickLabel = window.TMR.formatPickDisplayLabel;
}());
