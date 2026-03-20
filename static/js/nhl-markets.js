/**
 * TrustMyRecord - NHL Market Generator
 *
 * Permanent, stable NHL market system that does NOT depend on any paid odds API.
 *
 * NHL betting rules:
 * - Puck Line is ALWAYS +/- 1.5 (point never changes, only odds vary)
 * - Puck line odds are derived from moneyline differential when real odds unavailable
 * - Moneyline: pick the winner (real ESPN odds when available)
 * - Total: combined goals from ESPN (defaults to 6 if unknown)
 * - Games with no real data are flagged as estimated
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
         * Derive puck line odds from moneyline differential.
         * When a team is a strong ML favorite, they're more likely to cover -1.5,
         * so puck line odds shift accordingly.
         * Returns {favOdds, dogOdds} for the puck line.
         */
        _derivePuckLineOdds: function(homeML, awayML) {
            // If both are default -110, we can't derive anything
            if (homeML === this.DEFAULT_ODDS && awayML === this.DEFAULT_ODDS) {
                return { homeOdds: this.DEFAULT_ODDS, awayOdds: this.DEFAULT_ODDS };
            }

            // Convert American odds to implied probability
            var toProb = function(odds) {
                if (odds < 0) return Math.abs(odds) / (Math.abs(odds) + 100);
                return 100 / (odds + 100);
            };

            var homeProb = toProb(homeML);
            var awayProb = toProb(awayML);

            // Puck line adjustment: favorites covering -1.5 is harder than just winning
            // Typical NHL games: ~23% of wins are by exactly 1 goal
            // So puck line favorite odds are usually worse than ML by a significant margin
            var puckLineAdjust = 0.23; // roughly 23% of wins are by 1 goal

            var homePL_prob, awayPL_prob;
            if (homeProb > awayProb) {
                // Home is favorite: -1.5 is harder to cover
                homePL_prob = Math.max(0.15, homeProb - puckLineAdjust);
                awayPL_prob = Math.min(0.85, 1 - homePL_prob);
            } else {
                // Away is favorite or pick'em
                awayPL_prob = Math.max(0.15, awayProb - puckLineAdjust);
                homePL_prob = Math.min(0.85, 1 - awayPL_prob);
            }

            // Convert probability back to American odds
            var toAmerican = function(prob) {
                if (prob >= 0.5) return Math.round(-100 * prob / (1 - prob));
                return Math.round(100 * (1 - prob) / prob);
            };

            return {
                homeOdds: toAmerican(homePL_prob),
                awayOdds: toAmerican(awayPL_prob)
            };
        },

        /**
         * Build a game object with CORRECT NHL market structure
         * Puck line is ALWAYS +/- 1.5. Odds derived from moneyline when available.
         */
        _buildGame: function(evt, comp, homeTeam, awayTeam, homeComp, awayComp) {
            const homeRecord = homeComp.records?.[0]?.summary || '';
            const awayRecord = awayComp.records?.[0]?.summary || '';

            // Try to extract real odds from ESPN if available
            let homeML = this.DEFAULT_ODDS;
            let awayML = this.DEFAULT_ODDS;
            let totalLine = this.DEFAULT_TOTAL;
            let overOdds = this.DEFAULT_ODDS;
            let underOdds = this.DEFAULT_ODDS;
            let hasRealML = false;
            let hasRealTotal = false;

            // Parse ESPN odds if present
            const oddsArray = comp.odds || [];
            for (const o of oddsArray) {
                // Moneyline
                const hml = o.homeTeamOdds?.moneyLine ?? o.moneyline?.home?.close?.odds;
                const aml = o.awayTeamOdds?.moneyLine ?? o.moneyline?.away?.close?.odds;
                if (hml && aml && parseFloat(hml) !== 0 && parseFloat(aml) !== 0) {
                    homeML = parseFloat(hml);
                    awayML = parseFloat(aml);
                    hasRealML = true;
                }
                // Total (use ESPN's total if available)
                const tl = o.total?.over?.close?.line ?? o.overUnder;
                if (tl && parseFloat(tl) > 0) {
                    totalLine = parseFloat(tl);
                    hasRealTotal = true;
                }
                // Total odds
                const too = o.total?.over?.close?.odds;
                const tuo = o.total?.under?.close?.odds;
                if (too && parseFloat(too) !== 0) overOdds = parseFloat(too);
                if (tuo && parseFloat(tuo) !== 0) underOdds = parseFloat(tuo);

                // Try spread odds directly (some ESPN feeds include puck line odds)
                const hso = o.pointSpread?.home?.close?.odds;
                const aso = o.pointSpread?.away?.close?.odds;
                if (hso && parseFloat(hso) !== 0) this._espnPuckLineHome = parseFloat(hso);
                if (aso && parseFloat(aso) !== 0) this._espnPuckLineAway = parseFloat(aso);
            }

            // Derive puck line odds from moneyline if we have real ML data
            let puckLineHomeOdds, puckLineAwayOdds;
            if (this._espnPuckLineHome && this._espnPuckLineAway) {
                // Use ESPN's actual puck line odds if available
                puckLineHomeOdds = this._espnPuckLineHome;
                puckLineAwayOdds = this._espnPuckLineAway;
                this._espnPuckLineHome = null;
                this._espnPuckLineAway = null;
            } else if (hasRealML) {
                // Derive from moneyline differential
                const derived = this._derivePuckLineOdds(homeML, awayML);
                puckLineHomeOdds = derived.homeOdds;
                puckLineAwayOdds = derived.awayOdds;
            } else {
                puckLineHomeOdds = this.DEFAULT_ODDS;
                puckLineAwayOdds = this.DEFAULT_ODDS;
            }

            // Build the market structure
            // Puck Line point is ALWAYS +/- 1.5 - only the ODDS vary
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
                nhl_fixed_markets: true,
                estimatedOdds: !hasRealML  // Flag if odds are estimated vs real
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
