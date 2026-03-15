/**
 * TrustMyRecord - Auto-Grader (FIXED VERSION)
 * Grades picks using ESPN API scores
 */

(function() {
    'use strict';

    const TMR_GRADER = {
        // Config
        PICKS_KEY: 'tmr_picks',
        GRADING_INTERVAL: 5 * 60 * 1000, // 5 minutes
        
        // ESPN sport paths
        SPORT_PATHS: {
            'basketball_nba': 'basketball/nba',
            'nba': 'basketball/nba',
            'baseball_mlb': 'baseball/mlb',
            'mlb': 'baseball/mlb',
            'americanfootball_nfl': 'football/nfl',
            'nfl': 'football/nfl',
            'icehockey_nhl': 'hockey/nhl',
            'nhl': 'hockey/nhl',
            'americanfootball_ncaaf': 'football/college-football',
            'ncaaf': 'football/college-football',
            'basketball_ncaab': 'basketball/mens-college-basketball',
            'ncaab': 'basketball/mens-college-basketball',
            'soccer_epl': 'soccer/eng.1',
            'soccer_mls': 'soccer/usa.1'
        },

        // Utility: Get picks from storage
        getPicks: function() {
            return JSON.parse(localStorage.getItem(this.PICKS_KEY) || '[]');
        },

        // Utility: Save picks to storage
        savePicks: function(picks) {
            localStorage.setItem(this.PICKS_KEY, JSON.stringify(picks));
        },

        // Normalize team name for matching
        normalizeTeam: function(name) {
            return (name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        },

        // Fetch scores from ESPN for a specific date
        fetchScoresForDate: async function(sportPath, dateStr) {
            const url = `https://site.api.espn.com/apis/site/v2/sports/${sportPath}/scoreboard?dates=${dateStr}`;
            console.log(`[Grader] Fetching: ${url}`);
            
            try {
                const response = await fetch(url);
                const data = await response.json();
                const events = data.events || [];
                
                const scoreMap = {};
                
                for (const evt of events) {
                    if (!evt.competitions || !evt.competitions[0]) continue;
                    
                    const comp = evt.competitions[0];
                    const teams = comp.competitors || [];
                    
                    const homeTeam = teams.find(t => t.homeAway === 'home');
                    const awayTeam = teams.find(t => t.homeAway === 'away');
                    
                    if (!homeTeam || !awayTeam) continue;
                    
                    const homeScore = parseInt(homeTeam.score, 10);
                    const awayScore = parseInt(awayTeam.score, 10);
                    
                    if (isNaN(homeScore) || isNaN(awayScore)) continue;
                    
                    const homeName = homeTeam.team?.displayName || homeTeam.team?.name || '';
                    const awayName = awayTeam.team?.displayName || awayTeam.team?.name || '';
                    
                    const scoreData = {
                        homeScore,
                        awayScore,
                        homeTeam: homeName,
                        awayTeam: awayName,
                        completed: evt.status?.type?.completed === true || evt.status?.type?.state === 'post',
                        status: evt.status?.type?.detail || 'unknown'
                    };
                    
                    // Store by ESPN ID
                    scoreMap['espn_' + evt.id] = scoreData;
                    scoreMap[evt.id] = scoreData;
                    
                    // Store by normalized team names
                    const homeNorm = this.normalizeTeam(homeName);
                    const awayNorm = this.normalizeTeam(awayName);
                    scoreMap[homeNorm + '_' + awayNorm] = scoreData;
                    scoreMap[awayNorm + '_' + homeNorm] = scoreData;
                    
                    console.log(`[Grader] Stored: ${homeName} ${homeScore} vs ${awayName} ${awayScore}`);
                }
                
                console.log(`[Grader] Found ${events.length} games for ${dateStr}`);
                return scoreMap;
            } catch (e) {
                console.error('[Grader] Fetch error:', e);
                return {};
            }
        },

        // Find matching score for a pick
        findMatchingScore: function(pick, allScores) {
            // Try game_id first (most reliable)
            if (pick.game_id) {
                const cleanId = pick.game_id.toString().replace('espn_', '');
                
                // Try various ID formats
                const keysToTry = [
                    'espn_' + cleanId,
                    cleanId,
                    parseInt(cleanId, 10)
                ];
                
                for (const key of keysToTry) {
                    if (allScores[key]) {
                        console.log(`[Grader] Matched by game_id: ${key}`);
                        return allScores[key];
                    }
                }
            }
            
            // Try team name matching
            if (pick.home_team && pick.away_team) {
                const homeNorm = this.normalizeTeam(pick.home_team);
                const awayNorm = this.normalizeTeam(pick.away_team);
                const key1 = homeNorm + '_' + awayNorm;
                const key2 = awayNorm + '_' + homeNorm;
                
                if (allScores[key1]) {
                    console.log(`[Grader] Matched by team names: ${key1}`);
                    return allScores[key1];
                }
                if (allScores[key2]) {
                    console.log(`[Grader] Matched by team names: ${key2}`);
                    return allScores[key2];
                }
            }
            
            return null;
        },

        // Grade a moneyline pick
        gradeMoneyline: function(pick, homeScore, awayScore) {
            const sel = (pick.selection || '').toLowerCase().replace(/\s*[-+]\d+\.?\d*/g, '').trim();
            const home = (pick.home_team || '').toLowerCase();
            const away = (pick.away_team || '').toLowerCase();
            
            const isHome = sel === home || home.includes(sel) || sel.includes(home);
            const isAway = sel === away || away.includes(sel) || sel.includes(away);
            
            console.log(`[Grader] ML: sel='${sel}', home='${home}', away='${away}', isHome=${isHome}, isAway=${isAway}`);
            
            if (!isHome && !isAway) {
                console.log('[Grader] ML: Could not match selection to team');
                return 'pending';
            }
            
            if (homeScore === awayScore) return 'pushed';
            
            const homeWon = homeScore > awayScore;
            const selectedWon = (isHome && homeWon) || (isAway && !homeWon);
            
            return selectedWon ? 'won' : 'lost';
        },

        // Grade a spread pick
        gradeSpread: function(pick, homeScore, awayScore) {
            const line = parseFloat(pick.line_snapshot ?? pick.line);
            if (isNaN(line)) {
                console.log('[Grader] Spread: No line available');
                return 'pending';
            }
            
            const sel = (pick.selection || '').toLowerCase().replace(/\s*[-+]\d+\.?\d*/g, '').trim();
            const home = (pick.home_team || '').toLowerCase();
            const away = (pick.away_team || '').toLowerCase();
            
            const isHome = sel === home || home.includes(sel) || sel.includes(home);
            const margin = isHome ? (homeScore - awayScore + line) : (awayScore - homeScore + line);
            
            console.log(`[Grader] Spread: line=${line}, margin=${margin}, isHome=${isHome}`);
            
            if (margin > 0) return 'won';
            if (margin < 0) return 'lost';
            return 'pushed';
        },

        // Grade a totals pick
        gradeTotal: function(pick, homeScore, awayScore) {
            const line = parseFloat(pick.line_snapshot ?? pick.line);
            if (isNaN(line)) {
                console.log('[Grader] Total: No line available');
                return 'pending';
            }
            
            const total = homeScore + awayScore;
            const sel = (pick.selection || '').toLowerCase();
            const isOver = sel.includes('over');
            const isUnder = sel.includes('under');
            
            console.log(`[Grader] Total: line=${line}, total=${total}, isOver=${isOver}, isUnder=${isUnder}`);
            
            if (total === line) return 'pushed';
            if (isOver) return total > line ? 'won' : 'lost';
            if (isUnder) return total < line ? 'won' : 'lost';
            
            return 'pending';
        },

        // Calculate units won/lost
        calculateUnits: function(result, units, odds) {
            if (result === 'push' || result === 'pushed') return 0;
            if (result === 'lost') {
                return odds < 0 ? parseFloat((-(units * Math.abs(odds) / 100)).toFixed(2)) : -units;
            }
            if (result === 'won') {
                return odds < 0 ? units : parseFloat((units * odds / 100).toFixed(2));
            }
            return 0;
        },

        // Main grading function
        gradePick: function(pick, scores) {
            let result = 'pending';
            const market = (pick.market_type || '').toLowerCase();
            
            if (market === 'h2h' || market === 'moneyline') {
                result = this.gradeMoneyline(pick, scores.homeScore, scores.awayScore);
            } else if (market === 'spreads' || market === 'spread') {
                result = this.gradeSpread(pick, scores.homeScore, scores.awayScore);
            } else if (market === 'totals' || market === 'total') {
                result = this.gradeTotal(pick, scores.homeScore, scores.awayScore);
            }
            
            const units = this.calculateUnits(result, pick.units || 1, pick.odds_snapshot || pick.odds || -110);
            
            return {
                status: result,
                result: result,
                result_units: units,
                home_score: scores.homeScore,
                away_score: scores.awayScore,
                graded_at: new Date().toISOString()
            };
        },

        // Run grading for all pending picks
        runGrading: async function() {
            console.log('[Grader] ========== STARTING GRADING ==========');
            
            const picks = this.getPicks();
            const pending = picks.filter(p => {
                const status = (p.status || p.result || 'pending').toString().toLowerCase().trim();
                return status === 'pending';
            });
            
            console.log(`[Grader] Total picks: ${picks.length}, Pending: ${pending.length}`);
            
            if (pending.length === 0) {
                console.log('[Grader] No pending picks');
                return { graded: 0, total: 0 };
            }
            
            // Group by sport
            const bySport = {};
            for (const pick of pending) {
                const sport = pick.sport_key || pick.sport || 'unknown';
                if (!bySport[sport]) bySport[sport] = [];
                bySport[sport].push(pick);
            }
            
            let graded = 0;
            
            // Fetch scores for each sport
            for (const [sport, sportPicks] of Object.entries(bySport)) {
                const path = this.SPORT_PATHS[sport];
                if (!path) {
                    console.log(`[Grader] Unknown sport: ${sport}`);
                    continue;
                }
                
                console.log(`[Grader] Processing ${sportPicks.length} picks for ${sport}`);
                
                // Get unique dates from picks (today + yesterday + pick dates)
                const dates = new Set();
                const today = new Date();
                const todayStr = today.toISOString().split('T')[0].replace(/-/g, '');
                dates.add(todayStr);

                // Also check yesterday and day before (games that finished overnight)
                const yesterday = new Date(today);
                yesterday.setDate(yesterday.getDate() - 1);
                dates.add(yesterday.toISOString().split('T')[0].replace(/-/g, ''));

                const dayBefore = new Date(today);
                dayBefore.setDate(dayBefore.getDate() - 2);
                dates.add(dayBefore.toISOString().split('T')[0].replace(/-/g, ''));

                for (const pick of sportPicks) {
                    // Add date from commence_time
                    if (pick.commence_time) {
                        const d = new Date(pick.commence_time);
                        if (!isNaN(d.getTime())) {
                            dates.add(d.toISOString().split('T')[0].replace(/-/g, ''));
                        }
                    }
                    // Also add date from locked_at / created_at
                    const fallbackDate = pick.locked_at || pick.created_at;
                    if (fallbackDate) {
                        const d = new Date(fallbackDate);
                        if (!isNaN(d.getTime())) {
                            dates.add(d.toISOString().split('T')[0].replace(/-/g, ''));
                        }
                    }
                }
                
                // Fetch scores for all dates
                const allScores = {};
                for (const dateStr of dates) {
                    const scores = await this.fetchScoresForDate(path, dateStr);
                    Object.assign(allScores, scores);
                }
                
                console.log(`[Grader] Score map has ${Object.keys(allScores).length} entries for ${sport}`);

                // Grade each pick
                for (const pick of sportPicks) {
                    console.log(`[Grader] Attempting to grade pick ${pick.id}: game_id=${pick.game_id}, home=${pick.home_team}, away=${pick.away_team}, sport=${pick.sport_key}, market=${pick.market_type}`);
                    const scores = this.findMatchingScore(pick, allScores);

                    if (!scores) {
                        console.warn(`[Grader] NO SCORE MATCH for pick ${pick.id} (game_id=${pick.game_id}, teams=${pick.away_team} @ ${pick.home_team})`);
                        continue;
                    }
                    
                    if (!scores.completed) {
                        console.log(`[Grader] Game not completed for pick ${pick.id}`);
                        continue;
                    }
                    
                    const gradeResult = this.gradePick(pick, scores);
                    
                    // Update the pick
                    const pickInArray = picks.find(p => p.id === pick.id);
                    if (pickInArray) {
                        Object.assign(pickInArray, gradeResult);
                        console.log(`[Grader] Graded ${pick.id}: ${gradeResult.status} (${gradeResult.result_units > 0 ? '+' : ''}${gradeResult.result_units}u)`);
                        graded++;
                    }
                }
            }
            
            // Save updated picks
            this.savePicks(picks);
            
            // Refresh UI
            this.refreshUI();
            
            console.log(`[Grader] ========== GRADING COMPLETE: ${graded} picks graded ==========`);
            return { graded, total: pending.length };
        },

        // Refresh the UI after grading
        refreshUI: function() {
            if (typeof window.renderPicksList === 'function') {
                try { window.renderPicksList(); } catch(e) {}
            }
            if (typeof window.loadMyPicks === 'function') {
                try { window.loadMyPicks(window.currentPicksTab || 'pending'); } catch(e) {}
            }
            if (typeof window.renderStatCards === 'function') {
                try { 
                    const picks = this.getPicks();
                    window.renderStatCards(picks);
                } catch(e) {}
            }
        },

        // Initialize the grader
        init: function() {
            console.log('[Grader] Auto-grader initialized');
            
            // Run immediately
            this.runGrading();
            
            // Set up interval
            if (this.intervalId) clearInterval(this.intervalId);
            this.intervalId = setInterval(() => this.runGrading(), this.GRADING_INTERVAL);
            
            return this;
        },

        // Stop the grader
        stop: function() {
            if (this.intervalId) {
                clearInterval(this.intervalId);
                this.intervalId = null;
            }
            console.log('[Grader] Stopped');
        },

        // Manual grade trigger
        manualGrade: function() {
            return this.runGrading();
        }
    };

    // Expose globally
    window.TMR_GRADER = TMR_GRADER;
    
    // Auto-initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => TMR_GRADER.init());
    } else {
        TMR_GRADER.init();
    }

    console.log('[Grader] Script loaded, TMR_GRADER available');
})();
