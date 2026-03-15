/**
 * TrustMyRecord - NHL Market Generator
 *
 * Permanent, stable NHL market system that does NOT depend on any paid odds API.
 *
 * NHL betting rules:
 * - Puck Line is ALWAYS ±1.5 (never changes, only odds change)
 * - Moneyline: pick the winner
 * - Total: combined goals, defaults to 6 if unknown
 * - Default odds: -110 across the board when no feed available
 *
 * Data source: ESPN free public scoreboard API (schedule + scores only)
 */

(function() {
    'use strict';

    const NHL_MARKETS = {
        // Fixed NHL constants
        PUCK_LINE: 1.5,
        DEFAULT_TOTAL: 6,
        DEFAULT_ODDS: -110,
        ESPN_BASE: 'https://site.api.espn.com/apis/site/v2/sports/hockey/nhl',

        /**
         * Fetch today's NHL games from ESPN free API
         * Returns clean game objects with correct market structure
         */
        fetchGames: async function() {
            console.log('[NHL] Fetching NHL schedule from ESPN...');

            // Try today first, then tomorrow if no games
            const games = await this._fetchForDate(0);
            if (games.length > 0) return games;

            console.log('[NHL] No games today, checking tomorrow...');
            return await this._fetchForDate(1);
        },

        _fetchForDate: async function(daysOffset) {
            const date = new Date();
            date.setDate(date.getDate() + daysOffset);
            const dateStr = date.toISOString().split('T')[0].replace(/-/g, '');

            let url = this.ESPN_BASE + '/scoreboard';
            if (daysOffset > 0) url += '?dates=' + dateStr;

            try {
                const response = await fetch(url);
                if (!response.ok) throw new Error('ESPN returned ' + response.status);
                const data = await response.json();
                const events = data.events || [];
                const games = [];

                for (const evt of events) {
                    const comp = evt.competitions?.[0];
                    if (!comp) continue;

                    const status = comp.status?.type || evt.status?.type || {};
                    // Skip completed or in-progress games
                    if (status.completed === true || status.state === 'post') continue;
                    if (status.state === 'in' || status.id === '2') continue;
                    // Skip postponed/cancelled
                    if (status.id === '3' || status.id === '6') continue;

                    // Skip games that already started
                    const gameStart = new Date(evt.date || comp.date);
                    if (!isNaN(gameStart.getTime()) && gameStart.getTime() < Date.now() - 5 * 60 * 1000) continue;

                    const competitors = comp.competitors || [];
                    const homeComp = competitors.find(c => c.homeAway === 'home');
                    const awayComp = competitors.find(c => c.homeAway === 'away');
                    if (!homeComp || !awayComp) continue;

                    const homeTeam = homeComp.team?.displayName;
                    const awayTeam = awayComp.team?.displayName;
                    if (!homeTeam || !awayTeam) continue;

                    const game = this._buildGame(evt, comp, homeTeam, awayTeam, homeComp, awayComp);
                    games.push(game);

                    console.log(`[NHL] Game loaded: ${awayTeam} @ ${homeTeam} (${evt.id}) - ${new Date(evt.date).toLocaleTimeString()}`);
                }

                console.log(`[NHL] ${games.length} games loaded for ${dateStr}`);
                return games;

            } catch (e) {
                console.error('[NHL] ESPN fetch failed:', e);
                return [];
            }
        },

        /**
         * Build a game object with CORRECT NHL market structure
         * Puck line is ALWAYS ±1.5. Total defaults to 6. Odds default to -110.
         */
        _buildGame: function(evt, comp, homeTeam, awayTeam, homeComp, awayComp) {
            const homeRecord = homeComp.records?.[0]?.summary || '';
            const awayRecord = awayComp.records?.[0]?.summary || '';

            // Try to extract real odds from ESPN if available
            let homeML = this.DEFAULT_ODDS;
            let awayML = this.DEFAULT_ODDS;
            let puckLineHomeOdds = this.DEFAULT_ODDS;
            let puckLineAwayOdds = this.DEFAULT_ODDS;
            let totalLine = this.DEFAULT_TOTAL;
            let overOdds = this.DEFAULT_ODDS;
            let underOdds = this.DEFAULT_ODDS;

            // Parse ESPN odds if present (bonus, not required)
            const oddsArray = comp.odds || [];
            for (const o of oddsArray) {
                // Moneyline
                const hml = o.homeTeamOdds?.moneyLine ?? o.moneyline?.home?.close?.odds;
                const aml = o.awayTeamOdds?.moneyLine ?? o.moneyline?.away?.close?.odds;
                if (hml && aml && parseFloat(hml) !== 0 && parseFloat(aml) !== 0) {
                    homeML = parseFloat(hml);
                    awayML = parseFloat(aml);
                }
                // Total (use ESPN's total if available)
                const tl = o.total?.over?.close?.line ?? o.overUnder;
                if (tl && parseFloat(tl) > 0) {
                    totalLine = parseFloat(tl);
                }
            }

            // Build the CORRECT market structure
            // Puck Line is ALWAYS ±1.5 - this NEVER varies
            const bookmakers = [{
                key: 'nhl_fixed',
                title: 'NHL Markets',
                markets: [
                    {
                        key: 'spreads',
                        outcomes: [
                            { name: homeTeam, point: -this.PUCK_LINE, price: puckLineHomeOdds },
                            { name: awayTeam, point: this.PUCK_LINE, price: puckLineAwayOdds }
                        ]
                    },
                    {
                        key: 'h2h',
                        outcomes: [
                            { name: homeTeam, price: homeML },
                            { name: awayTeam, price: awayML }
                        ]
                    },
                    {
                        key: 'totals',
                        outcomes: [
                            { name: 'Over', point: totalLine, price: overOdds },
                            { name: 'Under', point: totalLine, price: underOdds }
                        ]
                    }
                ]
            }];

            return {
                id: 'espn_' + evt.id,
                espn_event_id: evt.id,
                sport_key: 'icehockey_nhl',
                sport_title: 'NHL',
                home_team: homeTeam,
                away_team: awayTeam,
                commence_time: evt.date || comp.date,
                home_record: homeRecord,
                away_record: awayRecord,
                bookmakers: bookmakers,
                nhl_fixed_markets: true  // Flag: markets were generated by NHL module
            };
        },

        /**
         * Grade an NHL pick based on final score
         *
         * ML: team must win (OT/SO wins count)
         * Puck Line: favorite must win by 2+, underdog wins if loss by 1 or win
         * Total: combined goals vs line
         */
        gradePick: function(pick, homeScore, awayScore) {
            const market = (pick.market_type || '').toLowerCase();
            const sel = (pick.selection || '').toLowerCase().trim();
            const home = (pick.home_team || '').toLowerCase();
            const away = (pick.away_team || '').toLowerCase();

            // Determine which team was selected
            const isHome = sel.includes(home) || home.includes(sel);
            const isAway = sel.includes(away) || away.includes(sel);

            console.log(`[NHL Grade] market=${market}, sel="${sel}", home="${home}" (${homeScore}), away="${away}" (${awayScore}), isHome=${isHome}, isAway=${isAway}`);

            if (market === 'h2h' || market === 'moneyline') {
                // Moneyline: picked team must win
                if (!isHome && !isAway) return 'pending';
                if (homeScore === awayScore) return 'pushed';
                const homeWon = homeScore > awayScore;
                return (isHome && homeWon) || (isAway && !homeWon) ? 'won' : 'lost';
            }

            if (market === 'spreads' || market === 'spread') {
                // Puck Line: always ±1.5
                const line = parseFloat(pick.line_snapshot ?? pick.line ?? (isHome ? -1.5 : 1.5));
                const margin = isHome
                    ? (homeScore - awayScore + line)
                    : (awayScore - homeScore + line);

                console.log(`[NHL Grade] Puck Line: line=${line}, margin=${margin}`);
                if (margin > 0) return 'won';
                if (margin < 0) return 'lost';
                return 'pushed';
            }

            if (market === 'totals' || market === 'total') {
                const line = parseFloat(pick.line_snapshot ?? pick.line ?? this.DEFAULT_TOTAL);
                const total = homeScore + awayScore;
                const isOver = sel.includes('over');
                const isUnder = sel.includes('under');

                console.log(`[NHL Grade] Total: line=${line}, actual=${total}, isOver=${isOver}`);
                if (total === line) return 'pushed';
                if (isOver) return total > line ? 'won' : 'lost';
                if (isUnder) return total < line ? 'won' : 'lost';
                return 'pending';
            }

            return 'pending';
        }
    };

    // Expose globally
    window.NHL_MARKETS = NHL_MARKETS;
    console.log('[NHL] Market module loaded');
})();
