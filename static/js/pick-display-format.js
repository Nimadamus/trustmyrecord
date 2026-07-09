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

    window.TMR = window.TMR || {};
    window.TMR.formatPickDisplay = formatPickDisplay;
    window.TMR.formatPickDisplayLabel = function (pick) {
        return formatPickDisplay(pick).pickLabel;
    };
    window.TMR.formatPickLineLabel = function (pick) {
        return formatPickDisplay(pick).lineLabel;
    };
    window.TMR.formatLeagueLabel = formatLeagueLabel;
    window.TMR.formatPickLabel = window.TMR.formatPickDisplayLabel;
}());
