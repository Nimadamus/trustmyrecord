/* TMR SHARED MARKET LABELS -- 2026-09-28
 *
 * ONE place that turns a stored market identifier (h2h, second_half_h2h,
 * alt_spreads, nfl_rushing_yards, player_receptions ...) into the text a
 * member reads. Before this file the recent picks feed printed the raw key
 * under every pick, and a dozen pages each carried a private lookup table that
 * fell through to the raw key for anything it did not know.
 *
 * Presentation only. Nothing here changes a stored market_type; callers keep
 * passing and storing the exact key the API sent (grading, filters and the
 * API all depend on it) and this module only decides what gets painted.
 *
 * Rules it enforces for every caller:
 *   1. every spelling of a market resolves to the same label
 *   2. an unknown key is NEVER rendered raw: humanize() turns it into words
 *      (player_receptions -> "Player Receptions"), no underscores ever reach
 *      the page
 *
 *   TMR_MARKET_LABELS.label('second_half_h2h')        -> "2nd Half Moneyline"
 *   TMR_MARKET_LABELS.label('spreads', 'baseball_mlb') -> "Run Line"
 */
(function (global) {
    'use strict';

    /* Game segment prefixes. Longest first so "first_half_" wins over "first_". */
    var SEGMENTS = [
        [/^(second_half|2nd_half|half_2|h2|2h)_/, '2nd Half'],
        [/^(first_half|1st_half|half_1|h1|1h)_/, '1st Half'],
        [/^(first_five_innings|first_five|first5|f5)_/, 'First 5'],
        /* FIRST_3_7_INNINGS_20261006: FanDuel First 3 / First 7 innings. */
        [/^(first_three_innings|first_three|f3)_/, 'First 3 Innings'],
        [/^(first_seven_innings|first_seven|f7)_/, 'First 7 Innings'],
        [/^(first_inning|1st_inning|inning_1|f1)_/, '1st Inning'],
        [/^(period_1|p1|1st_period)_/, '1st Period'],
        [/^(period_2|p2|2nd_period)_/, '2nd Period'],
        [/^(period_3|p3|3rd_period)_/, '3rd Period'],
        [/^(quarter_1|q1|1st_quarter)_/, '1st Quarter'],
        [/^(quarter_2|q2|2nd_quarter)_/, '2nd Quarter'],
        [/^(quarter_3|q3|3rd_quarter)_/, '3rd Quarter'],
        [/^(quarter_4|q4|4th_quarter)_/, '4th Quarter'],
        [/^(period_4)_/, '4th Quarter']
    ];

    /* Game lines (after any segment prefix is removed). */
    var GAME = {
        h2h: 'Moneyline', ml: 'Moneyline', moneyline: 'Moneyline', moneylines: 'Moneyline',
        h2h_3_way: '3 Way Moneyline', h2h_3way: '3 Way Moneyline', three_way: '3 Way Moneyline',
        draw_no_bet: 'Draw No Bet', double_chance: 'Double Chance', btts: 'Both Teams to Score',
        spreads: 'Spread', spread: 'Spread', handicap: 'Spread', point_spread: 'Spread',
        totals: 'Total', total: 'Total', over_under: 'Total', game_total: 'Game Total', game_totals: 'Game Total',
        team_totals: 'Team Total', team_total: 'Team Total', teamtotal: 'Team Total',
        alt_spreads: 'Alternate Spread', alternate_spreads: 'Alternate Spread', alt_spread: 'Alternate Spread',
        alt_totals: 'Alternate Total', alternate_totals: 'Alternate Total', alt_total: 'Alternate Total',
        alt_team_totals: 'Alternate Team Total', alternate_team_totals: 'Alternate Team Total',
        alt_lines: 'Alternate Line', alternate_lines: 'Alternate Line',
        run_line: 'Run Line', runline: 'Run Line', puck_line: 'Puck Line', puckline: 'Puck Line',
        outrights: 'Futures', outright: 'Futures', futures: 'Futures', future: 'Futures',
        player_props: 'Player Prop', props: 'Prop', prop: 'Prop', parlay: 'Parlay', teaser: 'Teaser',
        first_half: '1st Half', second_half: '2nd Half', first_five: 'First 5', first5: 'First 5',
        player_anytime_td: 'Anytime Touchdown', player_1st_td: 'First Touchdown', player_last_td: 'Last Touchdown',
        player_goal_scorer_anytime: 'Anytime Goal Scorer', player_goal_scorer_first: 'First Goal Scorer'
    };

    /* Player / prop stats. Keys are the stat after any sport or player prefix. */
    var STATS = {
        pass_yds: 'Passing Yards', passing_yards: 'Passing Yards', pass_yards: 'Passing Yards',
        pass_tds: 'Passing Touchdowns', passing_tds: 'Passing Touchdowns', passing_touchdowns: 'Passing Touchdowns',
        pass_completions: 'Completions', completions: 'Completions', pass_attempts: 'Pass Attempts',
        pass_interceptions: 'Interceptions Thrown', interceptions: 'Interceptions',
        pass_longest_completion: 'Longest Completion',
        rush_yds: 'Rushing Yards', rushing_yards: 'Rushing Yards', rush_yards: 'Rushing Yards',
        rush_attempts: 'Rushing Attempts', rushing_attempts: 'Rushing Attempts', rush_tds: 'Rushing Touchdowns',
        rush_longest: 'Longest Rush',
        reception_yds: 'Receiving Yards', receiving_yards: 'Receiving Yards', rec_yds: 'Receiving Yards',
        receptions: 'Receptions', reception_longest: 'Longest Reception', rec_tds: 'Receiving Touchdowns',
        rush_reception_yds: 'Rushing + Receiving Yards', pass_rush_yds: 'Passing + Rushing Yards',
        anytime_td: 'Anytime Touchdown', tds_over: 'Touchdowns', '1st_td': 'First Touchdown',
        first_td: 'First Touchdown', last_td: 'Last Touchdown',
        kicking_points: 'Kicking Points', field_goals: 'Field Goals', tackles_assists: 'Tackles + Assists',
        sacks: 'Sacks', solo_tackles: 'Solo Tackles',
        points: 'Points', rebounds: 'Rebounds', assists: 'Assists', threes: '3 Pointers Made',
        three_pointers: '3 Pointers Made', blocks: 'Blocks', steals: 'Steals', turnovers: 'Turnovers',
        points_rebounds_assists: 'Points + Rebounds + Assists', pra: 'Points + Rebounds + Assists',
        points_rebounds: 'Points + Rebounds', points_assists: 'Points + Assists',
        rebounds_assists: 'Rebounds + Assists', blocks_steals: 'Blocks + Steals',
        double_double: 'Double Double', triple_double: 'Triple Double',
        hits: 'Hits', home_runs: 'Home Runs', total_bases: 'Total Bases', rbi: 'RBIs', rbis: 'RBIs',
        runs_scored: 'Runs Scored', runs: 'Runs', singles: 'Singles', doubles: 'Doubles', triples: 'Triples',
        walks: 'Walks', stolen_bases: 'Stolen Bases', hits_runs_rbis: 'Hits + Runs + RBIs',
        strikeouts: 'Strikeouts', outs: 'Outs Recorded', hits_allowed: 'Hits Allowed',
        earned_runs: 'Earned Runs', record_a_win: 'To Record a Win',
        goals: 'Goals', shots_on_goal: 'Shots on Goal', blocked_shots: 'Blocked Shots',
        power_play_points: 'Power Play Points', saves: 'Saves', goal_scorer_anytime: 'Anytime Goal Scorer'
    };

    var SPORT_PREFIX = /^(nfl|ncaaf|cfb|nba|ncaab|wnba|mlb|nhl|mls|epl|ufc|pga|soccer|football|basketball|baseball|hockey)_/;
    var ROLE_PREFIX = /^(player|batter|pitcher|goalie)_/;

    /* Word level fixes for the generic fallback. */
    var WORDS = {
        h2h: 'Moneyline', ml: 'Moneyline', alt: 'Alternate', yds: 'Yards', tds: 'Touchdowns', td: 'Touchdown',
        rec: 'Receiving', pts: 'Points', reb: 'Rebounds', ast: 'Assists', sog: 'Shots on Goal',
        rbi: 'RBI', rbis: 'RBIs', ou: 'Over/Under', f5: 'First 5', '1h': '1st Half', '2h': '2nd Half',
        nfl: 'NFL', nba: 'NBA', mlb: 'MLB', nhl: 'NHL', ncaaf: 'NCAAF', ncaab: 'NCAAB', wnba: 'WNBA', mls: 'MLS', ufc: 'UFC'
    };
    var SMALL = { a: 1, an: 1, and: 1, of: 1, on: 1, or: 1, the: 1, to: 1, vs: 1 };

    function text(v) { return v == null ? '' : String(v).trim(); }

    /* Last resort: any identifier becomes readable words, never a raw key. */
    function humanize(key) {
        var k = text(key);
        if (!k) return '';
        var parts = k.replace(/([a-z])([A-Z])/g, '$1 $2').split(/[\s_\-.]+/).filter(Boolean);
        return parts.map(function (w, i) {
            var lw = w.toLowerCase();
            if (WORDS[lw]) return WORDS[lw];
            if (i > 0 && SMALL[lw]) return lw;
            return lw.charAt(0).toUpperCase() + lw.slice(1);
        }).join(' ');
    }

    function sportFamily(sportKey) {
        var s = text(sportKey).toLowerCase();
        if (/baseball|mlb/.test(s)) return 'baseball';
        if (/hockey|nhl/.test(s)) return 'hockey';
        return '';
    }

    function statLabel(stat) {
        var alt = false;
        var s = stat.replace(/_(alternate|alt)$/, function () { alt = true; return ''; })
                    .replace(/^(alternate|alt)_/, function () { alt = true; return ''; });
        var lbl = STATS[s];
        if (!lbl) return null;
        return { label: lbl, alt: alt };
    }

    function gameLabel(base, sport) {
        var lbl = GAME[base];
        if (!lbl) return null;
        var fam = sportFamily(sport);
        if (lbl === 'Spread' && fam === 'baseball') return 'Run Line';
        if (lbl === 'Spread' && fam === 'hockey') return 'Puck Line';
        if (lbl === 'Alternate Spread' && fam === 'baseball') return 'Alternate Run Line';
        if (lbl === 'Alternate Spread' && fam === 'hockey') return 'Alternate Puck Line';
        return lbl;
    }

    /* label(marketKey, sportKey?) -> consumer facing market name. */
    function label(market, sportKey) {
        var raw = text(market);
        if (!raw) return '';
        /* Already a human label ("Moneyline", "Team Total"): leave it alone. */
        if (!/[_]/.test(raw) && /[A-Z ]/.test(raw) && !/^[A-Z0-9]+$/.test(raw)) return raw;
        var key = raw.toLowerCase().replace(/[\s-]+/g, '_');

        var whole = gameLabel(key, sportKey);
        if (whole) return whole;

        var seg = '';
        for (var i = 0; i < SEGMENTS.length; i++) {
            if (SEGMENTS[i][0].test(key)) {
                seg = SEGMENTS[i][1];
                key = key.replace(SEGMENTS[i][0], '');
                break;
            }
        }
        /* Football's period_1 is the 1st Quarter, not a hockey period. */
        if (seg === '1st Period' && /football|^nfl$|^ncaaf$/i.test(text(sportKey))) seg = '1st Quarter';
        /* The F3 / F7 result is three way (Tie is an outcome): never "Moneyline". */
        if ((seg === 'First 3 Innings' || seg === 'First 7 Innings') && key === 'h2h') return seg + ' Result';
        if (seg) {
            var g = gameLabel(key, sportKey);
            if (g) return seg + ' ' + g;
            /* "second_half" alone, or an unknown segment market. */
            if (!key) return seg;
            return seg + ' ' + humanize(key);
        }

        /* Sport prefixed prop: nfl_rushing_yards -> "Rushing Yards Prop". */
        var sp = SPORT_PREFIX.exec(key);
        if (sp) {
            var rest = key.slice(sp[0].length).replace(ROLE_PREFIX, '');
            var st = statLabel(rest);
            if (st) return (st.alt ? 'Alternate ' : '') + st.label + ' Prop';
            var g2 = gameLabel(rest, sportKey || sp[1]);
            if (g2) return g2;
            return humanize(rest) + ' Prop';
        }

        /* Role prefixed prop: player_receptions -> "Player Receptions",
           pitcher_strikeouts -> "Pitcher Strikeouts". */
        var rp = ROLE_PREFIX.exec(key);
        if (rp) {
            var role = humanize(rp[1]);
            var st2 = statLabel(key.slice(rp[0].length));
            if (st2) return (st2.alt ? 'Alternate ' : '') + role + ' ' + st2.label;
            return humanize(key);
        }

        /* Bare stat: "rushing_yards" -> "Rushing Yards Prop". */
        var st3 = statLabel(key);
        if (st3) return (st3.alt ? 'Alternate ' : '') + st3.label + ' Prop';

        return humanize(key);
    }

    /* Plural form for category headings ("Spreads", "Totals"). */
    function plural(market, sportKey) {
        var l = label(market, sportKey);
        if (/(Spread|Total|Line|Prop)$/.test(l)) return l + 's';
        return l;
    }

    var api = { label: label, plural: plural, humanize: humanize };
    global.TMR_MARKET_LABELS = api;
    global.TMR = global.TMR || {};
    global.TMR.marketLabel = label;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : this);
