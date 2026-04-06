/**
 * Trust My Record - Auto-Grader using ESPN API
 * Fetches actual game scores and grades picks accurately.
 */

const TMR_GRADER = {
    PICKS_KEY: 'tmr_picks',
    CACHE_TTL: 5 * 60 * 1000,

    // Normalize team name for lookup keys
    _norm: function(name) {
        if (!name) return '';
        return name.toLowerCase().replace(/[^a-z0-9]/g, '');
    },

    SPORT_PATHS: {
        'americanfootball_nfl': 'football/nfl',
        'basketball_nba': 'basketball/nba',
        'icehockey_nhl': 'hockey/nhl',
        'baseball_mlb': 'baseball/mlb',
        'americanfootball_ncaaf': 'football/college-football',
        'basketball_ncaab': 'basketball/mens-college-basketball'
    },

    init: function() {
        console.log('[TMR Grader] Auto-grader initialized');
        this.runAutoGrading();
        setInterval(() => this.runAutoGrading(), 2 * 60 * 1000);
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) this.runAutoGrading();
        });
    },

    getPicks: function() {
        try {
            let picks = JSON.parse(localStorage.getItem(this.PICKS_KEY) || '[]');
            
            // MIGRATION: Fix old picks with missing/malformed fields
            let needsSave = false;
            picks = picks.map(pick => {
                // Clone to avoid mutation issues
                const p = { ...pick };
                // Fix missing ID
                if (!p.id) {
                    p.id = 'pick_mig_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
                    needsSave = true;
                }
                // Fix game_id: remove espn_ prefix if present, store raw ESPN event ID
                if (p.game_id && typeof p.game_id === 'string') {
                    if (p.game_id.startsWith('espn_')) {
                        p.game_id = p.game_id.replace('espn_', '');
                        needsSave = true;
                    }
                }
                // Ensure espn_event_id exists
                if (!p.espn_event_id && p.game_id) {
                    p.espn_event_id = p.game_id;
                    needsSave = true;
                }
                // Ensure locked_at exists for date extraction
                if (!p.locked_at && p.commence_time) {
                    p.locked_at = p.commence_time;
                    needsSave = true;
                }
                // Normalize status
                if (p.status) {
                    p.status = p.status.toString().trim().toLowerCase();
                }
                // CRITICAL FIX: Ensure result field exists (for compatibility with profile page)
                if (!p.result && p.status) {
                    p.result = p.status;
                    needsSave = true;
                }
                // CRITICAL FIX: Ensure user_id exists (picks need this for profile filtering)
                if (!p.user_id) {
                    const currentUser = JSON.parse(localStorage.getItem('tmr_current_user') || '{}');
                    p.user_id = currentUser.username || currentUser.id || 'anonymous';
                    needsSave = true;
                }
                return p;
            });
            if (needsSave) {
                localStorage.setItem(this.PICKS_KEY, JSON.stringify(picks));
                console.log('[TMR Grader] Migrated picks to new format');
            }
            
            // Filter by current user if logged in
            let currentUserId = null;
            try {
                const user = JSON.parse(localStorage.getItem('tmr_current_user') || 'null');
                currentUserId = user?.id || user?.user_id || user?.username;
            } catch(e) {}
            console.log('[TMR Grader] Stage 1 - Current user ID:', currentUserId);
            console.log('[TMR Grader] Stage 1 - Total picks in storage:', picks.length);
            picks.forEach((p, i) => {
                console.log(`[TMR Grader]   Pick ${i+1}: id=${p.id}, user_id=${p.user_id}, status=${p.status}, selection=${p.selection}`);
            });
            // Return all picks (grading filters by pending status later)
            return picks;
        } catch (e) {
            console.error('[TMR Grader] ERROR loading picks:', e);
            return [];
        }
    },

    savePicks: function(picks) {
        localStorage.setItem(this.PICKS_KEY, JSON.stringify(picks));
    },

    fetchScoresForDate: async function(sportPath, dateStr) {
        let url = 'https://site.api.espn.com/apis/site/v2/sports/' + sportPath + '/scoreboard';
        if (dateStr) url += '?dates=' + dateStr;
        console.log(`[TMR Grader] Fetching: ${url}`);
        console.log(`[TMR Grader] Date string being used: ${dateStr}`);

        try {
            const response = await fetch(url);
            console.log(`[TMR Grader] Response status: ${response.status} for ${url}`);
            if (!response.ok) return {};
            const data = await response.json();
            const scoreMap = {};
            const events = data.events || [];

            for (const evt of events) {
                const comp = evt.competitions && evt.competitions[0];
                if (!comp) continue;

                const status = (comp.status && comp.status.type) || (evt.status && evt.status.type) || {};
                // Game is complete if status.completed is true OR state is 'post'
                const isCompleted = status.completed === true || status.state === 'post';
                if (!isCompleted) {
                    console.log(`[TMR Grader] Skipping incomplete game: ${evt.id} (completed: ${status.completed}, state: ${status.state})`);
                    continue;
                }

                const competitors = comp.competitors || [];
                const homeComp = competitors.find(c => c.homeAway === 'home');
                const awayComp = competitors.find(c => c.homeAway === 'away');
                if (!homeComp || !awayComp) continue;

                const hs = parseInt(homeComp.score, 10);
                const as = parseInt(awayComp.score, 10);
                if (isNaN(hs) || isNaN(as)) continue;

                const homeTeam = (homeComp.team && homeComp.team.displayName) || (homeComp.team && homeComp.team.name) || '';
                const awayTeam = (awayComp.team && awayComp.team.displayName) || (awayComp.team && awayComp.team.name) || '';
                const homeDisplay = homeTeam;
                const awayDisplay = awayTeam;

                // Store by ESPN ID
                const key = 'espn_' + evt.id;
                const scoreData = { homeScore: hs, awayScore: as, homeTeam, awayTeam, homeDisplay, awayDisplay };
                scoreMap[key] = scoreData;
                console.log(`[TMR Grader] Stored score: ${key} - ${homeTeam} ${hs} vs ${awayTeam} ${as}`);
                // ALSO store by raw game ID for easier matching
                scoreMap[evt.id] = scoreData;
                console.log(`[TMR Grader] Also stored as raw ID: ${evt.id}`);
                // Store by team matchup for fuzzy matching (normalized: lowercase, no spaces, no punctuation)
                const normalizeTeam = (name) => name.toLowerCase().replace(/[^a-z0-9]/g, '');
                const homeNorm = normalizeTeam(homeTeam);
                const awayNorm = normalizeTeam(awayTeam);
                scoreMap[homeNorm + '_' + awayNorm] = scoreData;
                scoreMap[awayNorm + '_' + homeNorm] = scoreData;
                console.log(`[TMR Grader] Also stored as: ${homeNorm}_${awayNorm} and ${awayNorm}_${homeNorm}`);
            }
            console.log(`[TMR Grader] Total scores stored for ${dateStr}: ${Object.keys(scoreMap).length / 3} games`);
            return scoreMap;
        } catch (e) {
            console.error('[TMR Grader] Fetch error:', e);
            return {};
        }
    },

    fetchScoresForSport: async function(sportPath, pendingPicks) {
        const datesToCheck = {};
        const today = new Date();
        // FIX: Use UTC date to match ESPN's scoreboard (games are queried by UTC date)
        const todayStr = today.getUTCFullYear().toString() + 
                         String(today.getUTCMonth() + 1).padStart(2, '0') + 
                         String(today.getUTCDate()).padStart(2, '0');
        datesToCheck[todayStr] = true;

        if (pendingPicks && pendingPicks.length > 0) {
            pendingPicks.forEach(p => {
                const timeField = p.commence_time || p.locked_at;
                console.log(`[TMR Grader] Date extraction: pick=${p.id}, timeField=${timeField}, commence_time=${p.commence_time}, locked_at=${p.locked_at}`);
                if (timeField) {
                    try {
                        const d = new Date(timeField);
                        if (!isNaN(d.getTime())) {
                            // FIX: Use UTC date to match ESPN's scoreboard (games are queried by UTC date)
                            const ds = d.getUTCFullYear().toString() + 
                                       String(d.getUTCMonth() + 1).padStart(2, '0') + 
                                       String(d.getUTCDate()).padStart(2, '0');
                            // Only check past dates (not future), no 14-day limit
                            const diffDays = (today - d) / (1000 * 60 * 60 * 24);
                            console.log(`[TMR Grader] Date extraction: parsed=${d}, ds=${ds}, diffDays=${diffDays}`);
                            if (diffDays >= 0) datesToCheck[ds] = true;
                        } else {
                            console.log(`[TMR Grader] Date extraction: invalid date for ${timeField}`);
                        }
                    } catch(e) {
                        console.log(`[TMR Grader] Date extraction: error parsing ${timeField}: ${e}`);
                    }
                }
            });
        }

        const dateList = Object.keys(datesToCheck);
        console.log(`[TMR Grader] Fetching scores for ${sportPath}, dates:`, dateList);
        const results = await Promise.all(dateList.map(ds => this.fetchScoresForDate(sportPath, ds)));

        const merged = {};
        results.forEach(scoreMap => Object.assign(merged, scoreMap));
        console.log(`[TMR Grader] Found ${Object.keys(merged).length} score entries for ${sportPath}`);
        return merged;
    },

    calculateResultUnits: function(status, units, odds) {
        if (status === 'push') return 0;
        if (status === 'won') {
            return odds < 0 ? units : parseFloat((units * odds / 100).toFixed(2));
        }
        if (status === 'lost') {
            return odds < 0 ? parseFloat((-(units * Math.abs(odds) / 100)).toFixed(2)) : -units;
        }
        return 0;
    },

    gradeMoneyline: function(pick, homeScore, awayScore) {
        // Support both naming conventions
        if (homeScore === undefined && pick.homeScore !== undefined) homeScore = pick.homeScore;
        if (awayScore === undefined && pick.awayScore !== undefined) awayScore = pick.awayScore;
        
        // Strip odds from selection (e.g., "Celtics -180" -> "celtics")
        const rawSel = (pick.selection || '').trim().toLowerCase();
        const sel = rawSel.replace(/\s*[\(\)]?[-+]?\d+\.?\d*[\(\)]?/g, '').trim();
        const homeTeam = ((pick.home_team || pick.home || '')).trim().toLowerCase();
        const awayTeam = ((pick.away_team || pick.away || '')).trim().toLowerCase();
        
        // Fuzzy matching: exact match OR substring match
        const isHome = sel === homeTeam || sel.indexOf(homeTeam) !== -1 || homeTeam.indexOf(sel) !== -1;
        const isAway = sel === awayTeam || sel.indexOf(awayTeam) !== -1 || awayTeam.indexOf(sel) !== -1;
        
        console.log(`[TMR Grader]     gradeMoneyline(): selection=${pick.selection}, normalized=${sel}, home=${pick.home_team}, away=${pick.away_team}, isHome=${isHome}, isAway=${isAway}`);
        if (!isHome && !isAway) {
            console.log(`[TMR Grader]     gradeMoneyline() -> pending (selection doesn't match either team)`);
            return 'pending';
        }
        if (homeScore === awayScore) return 'push';
        const homeWon = homeScore > awayScore;
        const selectedWon = (isHome && homeWon) || (isAway && !homeWon);
        const result = selectedWon ? 'won' : 'lost';
        console.log(`[TMR Grader]     gradeMoneyline() -> ${result}`);
        return result;
    },

    gradeSpread: function(pick, homeScore, awayScore) {
        // Support both naming conventions
        if (homeScore === undefined && pick.homeScore !== undefined) homeScore = pick.homeScore;
        const line = parseFloat(pick.line_snapshot ?? pick.line);
        console.log(`[TMR Grader]     gradeSpread(): line=${pick.line}, line_snapshot=${pick.line_snapshot}, parsedLine=${line}, isNaN=${isNaN(line)}`);

        if (isNaN(line)) {
            console.log(`[TMR Grader]     gradeSpread() -> pending (line is NaN)`);
            return 'pending';
        }
        
        // Strip odds from selection for team matching
        const rawSel = (pick.selection || '').trim().toLowerCase();
        const sel = rawSel.replace(/\s*[\(\)]?[-+]?\d+\.?\d*[\(\)]?/g, '').trim();
        const homeTeam = ((pick.home_team || pick.home || '')).trim().toLowerCase();
        const awayTeam = ((pick.away_team || pick.away || '')).trim().toLowerCase();
        
        const isHome = sel === homeTeam || sel.indexOf(homeTeam) !== -1 || homeTeam.indexOf(sel) !== -1;
        const margin = isHome ? (homeScore - awayScore + line) : (awayScore - homeScore + line);
        console.log(`[TMR Grader]     gradeSpread(): isHome=${isHome}, margin=${margin}`);
        if (margin > 0) {
            console.log(`[TMR Grader]     gradeSpread() -> won`);
            return 'won';
        }
        if (margin < 0) {
            console.log(`[TMR Grader]     gradeSpread() -> lost`);
            return 'lost';
        }
        console.log(`[TMR Grader]     gradeSpread() -> push`);
        return 'push';
    },
    gradeTotal: function(pick, homeScore, awayScore) {
        // Support both naming conventions
        if (homeScore === undefined && pick.homeScore !== undefined) homeScore = pick.homeScore;
        if (awayScore === undefined && pick.awayScore !== undefined) awayScore = pick.awayScore;
        const line = parseFloat(pick.line_snapshot ?? pick.line);
        const total = homeScore + awayScore;
        console.log(`[TMR Grader]     gradeTotal(): line=${pick.line}, line_snapshot=${pick.line_snapshot}, parsedLine=${line}, totalScore=${total}, isNaN=${isNaN(line)}`);

        if (isNaN(line)) {
            console.log(`[TMR Grader]     gradeTotal() -> pending (line is NaN)`);
            return 'pending';
        }
        if (total === line) {
            console.log(`[TMR Grader]     gradeTotal() -> push`);
            return 'push';
        }
        const sel = (pick.market_type === 'total' || pick.market_type === 'totals') ? (pick.selection.toLowerCase().includes('over') ? 'over' : 'under') : 'pending';
        console.log(`[TMR Grader]     gradeTotal(): selection=${pick.selection}, sel=${sel}`);
        if (sel === 'over') {
            const result = total > line ? 'won' : 'lost';
            console.log(`[TMR Grader]     gradeTotal() -> ${result}`);
            return result;
        }
        if (sel === 'under') {
            const result = total < line ? 'won' : 'lost';
            console.log(`[TMR Grader]     gradeTotal() -> ${result}`);
            return result;
        }
        console.log(`[TMR Grader]     gradeTotal() -> pending (could not determine over/under)`);
        return 'pending';
    },

    gradePick: function(pick, homeScore, awayScore) {
        console.log(`[TMR Grader]   gradePick() START: market_type=${pick.market_type}, homeScore=${homeScore}, awayScore=${awayScore}`);
        let status = 'pending';
        // Support both old format ('moneyline', 'spread', 'total') and new format ('h2h', 'spreads', 'totals')
        if (pick.market_type === 'moneyline' || pick.market_type === 'h2h') {
            console.log(`[TMR Grader]   -> Using gradeMoneyline()`);
            status = this.gradeMoneyline(pick, homeScore, awayScore);
        } else if (pick.market_type === 'spread' || pick.market_type === 'spreads') {
            console.log(`[TMR Grader]   -> Using gradeSpread(), line_snapshot=${pick.line_snapshot}`);
            status = this.gradeSpread(pick, homeScore, awayScore);
        } else if (pick.market_type === 'total' || pick.market_type === 'totals') {
            console.log(`[TMR Grader]   -> Using gradeTotal(), line_snapshot=${pick.line_snapshot}`);
            status = this.gradeTotal(pick, homeScore, awayScore);
        } else {
            console.log(`[TMR Grader]   -> UNKNOWN market_type: ${pick.market_type}`);
        }

        console.log(`[TMR Grader]   gradePick() intermediate status: ${status}`);
        if (status === 'pending') {
            console.log(`[TMR Grader]   gradePick() RETURNING pending ( grading failed )`);
            return { status: 'pending', resultUnits: 0 };
        }
        const resultUnits = this.calculateResultUnits(status, pick.units, pick.odds_snapshot);
        console.log(`[TMR Grader]   gradePick() RETURNING: status=${status}, resultUnits=${resultUnits}`);
        return { status, resultUnits };
    },

    // Find matching scores for a pick using multiple strategies
    // Fetch a single game's score by ESPN event ID (for old games not on scoreboard)
    fetchSingleGameScore: async function(sportPath, eventId) {
        if (!eventId) return null;
        const url = `https://site.api.espn.com/apis/site/v2/sports/${sportPath}/summary?event=${eventId}`;
        console.log(`[TMR Grader] Fetching single game: ${url}`);
        try {
            const response = await fetch(url);
            if (!response.ok) {
                console.log(`[TMR Grader] Single game fetch failed: ${response.status}`);
                return null;
            }
            const data = await response.json();
            const evt = data.header?.competition || data.boxscore?.teams?.[0]?.team?.id ? data : null;
            if (!evt) return null;
            
            // Try to extract from different possible locations in response
            let comp = evt.competitions?.[0];
            if (!comp && data.boxscore) {
                // Alternative structure for summary endpoint
                // CRITICAL: Must check game status before grading - do NOT grade in-progress games
                const headerStatus = data.header?.competitions?.[0]?.status?.type || {};
                const boxscoreComplete = headerStatus.completed === true || headerStatus.state === 'post';
                if (!boxscoreComplete) {
                    console.log(`[TMR Grader] Single game (boxscore path) NOT complete: state=${headerStatus.state}, completed=${headerStatus.completed}`);
                    return null;
                }
                const teams = data.boxscore.teams || [];
                const homeTeam = teams.find(t => t.homeAway === 'home') || teams[1];
                const awayTeam = teams.find(t => t.homeAway === 'away') || teams[0];
                if (homeTeam && awayTeam) {
                    const homeScore = parseInt(homeTeam.statistics?.find(s => s.name === 'totalPoints')?.displayValue || homeTeam.score || 0);
                    const awayScore = parseInt(awayTeam.statistics?.find(s => s.name === 'totalPoints')?.displayValue || awayTeam.score || 0);
                    return {
                        homeScore,
                        awayScore,
                        homeTeam: homeTeam.team?.displayName || homeTeam.team?.name || 'Home',
                        awayTeam: awayTeam.team?.displayName || awayTeam.team?.name || 'Away',
                        completed: true
                    };
                }
            }
            
            if (!comp) return null;
            
            const status = comp.status?.type || {};
            const isCompleted = status.completed === true || status.state === 'post';
            if (!isCompleted) return null;
            
            const competitors = comp.competitors || [];
            const homeComp = competitors.find(c => c.homeAway === 'home');
            const awayComp = competitors.find(c => c.homeAway === 'away');
            if (!homeComp || !awayComp) return null;
            
            return {
                homeScore: parseInt(homeComp.score || 0),
                awayScore: parseInt(awayComp.score || 0),
                homeTeam: homeComp.team?.displayName || homeComp.team?.name || 'Home',
                awayTeam: awayComp.team?.displayName || awayComp.team?.name || 'Away',
                completed: true
            };
        } catch (e) {
            console.error(`[TMR Grader] Error fetching single game: ${e}`);
            return null;
        }
    },

    findMatchingScores: function(pick, allScores) {
        const pickId = pick.id || pick.selection || 'unknown';
        console.log(`[TMR Grader] Finding scores for pick: ${pickId}`);
        console.log(`[TMR Grader]   game_id: ${pick.game_id}, home: ${pick.home_team}, away: ${pick.away_team}`);
        
        // DEBUG: Log all available score keys
        const allKeys = Object.keys(allScores);
        console.log(`[TMR Grader]   Total scores available: ${allKeys.length}`);
        console.log(`[TMR Grader]   ESPN keys:`, allKeys.filter(k => k.startsWith('espn_')));
        
        // Strategy 1: Direct ESPN game_id match (with espn_ prefix)
        console.log(`[TMR Grader]   Checking game_id: ${pick.game_id}`);
        // FIX: game_id already includes 'espn_' prefix from game.id, don't double-prefix
        let espnKey = null;
        if (pick.game_id) {
            espnKey = pick.game_id.startsWith('espn_') 
                ? pick.game_id  // game_id is already espn_XXX
                : 'espn_' + pick.game_id;  // game_id is raw XXX, add prefix
        }
        console.log(`[TMR Grader]   Generated ESPN key: ${espnKey}`);
        console.log(`[TMR Grader]   Available ESPN keys:`, Object.keys(allScores).filter(k => k.startsWith('espn_')));
        if (espnKey && allScores[espnKey]) {
            console.log(`[TMR Grader]   ✓ Matched by ESPN key: ${espnKey}`);
            return allScores[espnKey];
        }
        console.log(`[TMR Grader]   ✗ ESPN key not found: ${espnKey}`);

        // Strategy 2: Raw game_id match (if stored with espn_ prefix)
        if (pick.game_id && allScores[pick.game_id]) {
            console.log(`[TMR Grader]   ✓ Matched by game_id: ${pick.game_id}`);
            return allScores[pick.game_id];
        }

        // Strategy 3: Team name matching (if home/away teams exist)
        const homeTeam = pick.home_team || pick.home;
        const awayTeam = pick.away_team || pick.away;
        if (homeTeam && awayTeam) {
            // Use consistent normalization
            const key1 = this._norm(homeTeam) + '_' + this._norm(awayTeam);
            const key2 = this._norm(awayTeam) + '_' + this._norm(homeTeam);
            console.log(`[TMR Grader]   Team normalization: '${homeTeam}'->'${this._norm(homeTeam)}', '${awayTeam}'->'${this._norm(awayTeam)}'`);
            if (allScores[key1]) {
                console.log(`[TMR Grader]   ✓ Matched by team names (key1): ${key1}`);
                return allScores[key1];
            }
            if (allScores[key2]) {
                console.log(`[TMR Grader]   ✓ Matched by team names (key2): ${key2}`);
                return allScores[key2];
            }
            
            // Strategy 4: Fuzzy team name matching
            for (const [key, scores] of Object.entries(allScores)) {
                if (key.startsWith('espn_')) continue;
                const scoreHome = scores.homeTeam.toLowerCase();
                const scoreAway = scores.awayTeam.toLowerCase();
                const pickHome = homeTeam.toLowerCase();
                const pickAway = awayTeam.toLowerCase();
                
                // Normalize: remove all non-alphanumeric for comparison (handles "LA Lakers" vs "Los Angeles Lakers")
                const normalize = (s) => s.replace(/[^a-z0-9]/g, '');
                const scoreHomeNorm = normalize(scoreHome);
                const scoreAwayNorm = normalize(scoreAway);
                const pickHomeNorm = normalize(pickHome);
                const pickAwayNorm = normalize(pickAway);
                
                // Check both regular and normalized forms
                const homeMatch = scoreHome.includes(pickHome) || pickHome.includes(scoreHome) ||
                                  scoreHome.includes(pickAway) || pickAway.includes(scoreHome) ||
                                  scoreHomeNorm.includes(pickHomeNorm) || pickHomeNorm.includes(scoreHomeNorm) ||
                                  scoreHomeNorm.includes(pickAwayNorm) || pickAwayNorm.includes(scoreHomeNorm);
                const awayMatch = scoreAway.includes(pickAway) || pickAway.includes(scoreAway) ||
                                  scoreAway.includes(pickHome) || pickHome.includes(scoreAway) ||
                                  scoreAwayNorm.includes(pickAwayNorm) || pickAwayNorm.includes(scoreAwayNorm) ||
                                  scoreAwayNorm.includes(pickHomeNorm) || pickHomeNorm.includes(scoreAwayNorm);
                
                if (homeMatch && awayMatch) {
                    console.log(`[TMR Grader]   ✓ Fuzzy matched: ${homeTeam}/${awayTeam} -> ${scores.homeTeam}/${scores.awayTeam}`);
                    return scores;
                }
            }
        }

        // Strategy 5: Selection-only matching (last resort)
        if (pick.selection) {
            const sel = this._norm(pick.selection);
            for (const [key, scores] of Object.entries(allScores)) {
                if (key.startsWith('espn_')) continue;
                const scoreHomeNorm = this._norm(scores.homeTeam);
                const scoreAwayNorm = this._norm(scores.awayTeam);
                if (scoreHomeNorm.includes(sel) || sel.includes(scoreHomeNorm) ||
                    scoreAwayNorm.includes(sel) || sel.includes(scoreAwayNorm)) {
                    console.log(`[TMR Grader]   ✓ Matched by selection only: ${pick.selection} -> ${scores.homeTeam}/${scores.awayTeam}`);
                    return scores;
                }
            }
        }

        console.log(`[TMR GrADER] MATCHING DEBUG for pick ${pickId}:`);
        console.log(`[TMR GrADER]   pick.home_team='${pick.home_team}', pick.away_team='${pick.away_team}'`);
        console.log(`[TMR GrADER]   pick.game_id='${pick.game_id}', espn_event_id='${pick.espn_event_id}'`);
        console.log(`[TMR GrADER]   pick.selection='${pick.selection}'`);

        // Show ALL available score keys
        const debugKeys = Object.keys(allScores);
        const nonEspnKeys = debugKeys.filter(k => !k.startsWith('espn_'));
        console.log(`[TMR GrADER]   Total score entries: ${debugKeys.length}, Non-ESPN keys: ${nonEspnKeys.length}`);
        console.log(`[TMR GrADER]   ALL available keys:`, nonEspnKeys);
        
        // Show what the pick's normalized keys would look like
        if (pick.home_team && pick.away_team) {
            const ht = this._norm(pick.home_team);
            const at = this._norm(pick.away_team);
            console.log(`[TMR GrADER]   This pick normalized key: '${ht}_${at}' or '${at}_${ht}'`);
        }
        
        return null;
    },

    runAutoGrading: async function() {
        console.log('[TMR Grader] ========== STARTING GRADING RUN ==========');
        
        const allPicks = this.getPicks();
        console.log(`[TMR Grader] Total picks in storage: ${allPicks.length}`);
        
        // Stage 2: Filter ungraded picks (case-insensitive, trim whitespace)
        const pendingPicks = allPicks.filter(p => {
            const status = (p.status || p.result || '').toString().trim().toLowerCase();
            return status === 'pending';
        });
        console.log('[TMR Grader] Stage 2 - Ungraded picks count:', pendingPicks.length);
        console.log('[TMR Grader] Stage 2 - All pick statuses:', allPicks.map(p => ({id: p.id, status: p.status, result: p.result, sport: p.sport_key || p.sport})));
        pendingPicks.forEach((p, i) => {
            console.log(`[TMR Grader]   Ungraded pick ${i+1}: id=${p.id}, market_type=${p.market_type}, game_id=${p.game_id}, sport=${p.sport_key || p.sport}`);
            console.log(`[TMR Grader]     teams: home='${p.home_team}', away='${p.away_team}', selection='${p.selection}'`);
        });
        
        if (pendingPicks.length === 0) {
            console.log('[TMR Grader] No pending picks to grade');
            return { graded: 0, total: 0 };
        }

        // Log each pending pick
        pendingPicks.forEach((p, i) => {
            console.log(`[TMR Grader] Pending pick ${i+1}: id=${p.id}, sport=${p.sport_key || p.sport}, selection=${p.selection}, game_id=${p.game_id}`);
        });

        // Group by sport path
        const picksBySport = {};
        pendingPicks.forEach(p => {
            const sportKey = p.sport_key || p.sport; console.log(`[TMR Grader] Mapping sport_key: '${sportKey}' -> path: '${this.SPORT_PATHS[sportKey] || 'NOT FOUND'}'`);
            const path = this.SPORT_PATHS[sportKey];
            if (path) {
                if (!picksBySport[path]) picksBySport[path] = [];
                picksBySport[path].push(p);
            } else {
                console.warn(`[TMR Grader] Unknown sport_key: '${sportKey}' (type: ${typeof sportKey})`);
            }
        });
        console.log(`[TMR Grader] Sports to fetch:`, Object.keys(picksBySport));

        // Fetch all scores
        const allScores = {};
        const fetchPromises = Object.keys(picksBySport).map(path =>
            this.fetchScoresForSport(path, picksBySport[path]).then(scores => {
                Object.assign(allScores, scores);
            })
        );
        await Promise.all(fetchPromises);
        console.log(`[TMR Grader] Total score entries available: ${Object.keys(allScores).length}`);

        // Stage 4 & 5: Grade each pending pick
        let gradedCount = 0;
        // CRITICAL FIX: Create a map of pending picks by ID to ensure we modify the correct objects in allPicks
        const pendingPickIds = new Set(pendingPicks.map(p => p.id));
        console.log('[TMR Grader] Stage 4 - Pending pick IDs:', Array.from(pendingPickIds));
        
        // Iterate directly over pendingPicks to ensure we process ALL pending picks
        const picksToGrade = pendingPicks;
        console.log('[TMR Grader] Stage 4 - Picks entering grading loop:', picksToGrade.length);
        
        for (let i = 0; i < picksToGrade.length; i++) {
            const pick = picksToGrade[i];
            console.log(`[TMR Grader] Stage 5 - Processing pick ${i+1}/${picksToGrade.length}: id=${pick.id}, market_type=${pick.market_type}, selection=${pick.selection}`);
            
            let scores = this.findMatchingScores(pick, allScores);
            
            // Fallback: If no scoreboard match and we have game_id, try individual game endpoint
            if (!scores && pick.game_id) {
                console.log(`[TMR Grader] No scoreboard match for pick ${pick.id}, trying individual game endpoint...`);
                const path = this.SPORT_PATHS[pick.sport_key || pick.sport];
                if (path) {
                    // Strip 'espn_' prefix if present for the API call
                    const rawGameId = pick.game_id.startsWith('espn_') ? pick.game_id.substring(5) : pick.game_id;
                    console.log(`[TMR Grader]   Using raw game ID: ${rawGameId}`);
                    scores = await this.fetchSingleGameScore(path, rawGameId);
                    if (scores) {
                        console.log(`[TMR Grader] Found game via individual endpoint!`);
                    }
                }
            }
            
            if (!scores) {
                console.log(`[TMR Grader] SKIPPING pick ${pick.id}: no scores found`);
                continue;
            }

            console.log(`[TMR Grader] Scores found: ${scores.homeTeam} ${scores.homeScore} - ${scores.awayScore} ${scores.awayTeam}`);
            
            // Stage 6: Execute grading
            console.log(`[TMR Grader] Stage 6 - Calling gradePick() for pick ${pick.id}`);
            const result = this.gradePick(pick, scores.homeScore, scores.awayScore);
            console.log(`[TMR Grader] Stage 6 - Grade result: status=${result.status}, resultUnits=${result.resultUnits}`);
            
            // Stage 7: Write result back - CRITICAL: Find the pick in allPicks by ID and update it
            if (result.status !== 'pending') {
                console.log(`[TMR Grader] Stage 7 - WRITING result for pick ${pick.id}: status=${result.status}`);
                // Find the actual pick object in allPicks array to ensure changes persist
                const pickInAllPicks = allPicks.find(p => p.id === pick.id);
                if (pickInAllPicks) {
                    // Set both status and result for compatibility
                    pickInAllPicks.status = result.status;
                    pickInAllPicks.result = result.status;
                    pickInAllPicks.result_units = result.resultUnits;
                    pickInAllPicks.home_score = scores.homeScore;
                    pickInAllPicks.away_score = scores.awayScore;
                    pickInAllPicks.graded_at = new Date().toISOString();
                    // Also update the current pick object for consistency
                    // Set both status and result for compatibility
                    pick.status = result.status;
                    pick.result = result.status;
                    pick.result_units = result.resultUnits;
                    pick.home_score = scores.homeScore;
                    pick.away_score = scores.awayScore;
                    pick.graded_at = new Date().toISOString();
                    gradedCount++;
                    console.log(`[TMR Grader] Stage 7 - ✓ Pick ${pick.id} graded successfully: ${result.status}`);
                } else {
                    console.error(`[TMR Grader] Stage 7 - ERROR: Could not find pick ${pick.id} in allPicks array!`);
                }
                
                if (result.status === 'won') {
                    this.showToast(`Pick WON: ${pick.selection} +${result.resultUnits.toFixed(2)}u`, 'success');
                } else if (result.status === 'lost') {
                    this.showToast(`Pick Lost: ${pick.selection} ${result.resultUnits.toFixed(2)}u`, 'error');
                } else if (result.status === 'push') {
                    this.showToast(`Pick Pushed: ${pick.selection}`, 'info');
                }
            } else {
                console.log(`[TMR Grader] Pick still pending after grading attempt`);
            }
        }

        // Stage 8: Save and refresh stats
        if (gradedCount > 0) {
            console.log(`[TMR Grader] Stage 8 - Saving ${gradedCount} graded picks to storage`);
            this.savePicks(allPicks);
            console.log(`[TMR Grader] Stage 8 - ✓ Picks saved`);
            
            // CRITICAL: Clear cache and rebuild it to ensure stats use fresh data
            window._cachedBackendPicks = null;
            if (typeof ensureBackendPicks === 'function') {
                ensureBackendPicks();
                console.log(`[TMR Grader] Cache rebuilt with ${window._cachedBackendPicks?.length || 0} picks`);
            }
            
            console.log(`[TMR Grader] Saved ${gradedCount} graded pick(s) to storage`);
            
            // Clear cached picks so stats recalculate from updated localStorage
            if (window._cachedBackendPicks) {
                window._cachedBackendPicks = null;
                console.log('[TMR Grader] Cleared cached picks for stat recalculation');
            }
            
            // Refresh UI - call loadProfile (profile.html) or loadUserProfile (other pages) to update stats
            if (typeof window.loadProfile === 'function') {
                try { window.loadProfile(); } catch(e) {}
            } else if (typeof window.loadUserProfile === 'function') {
                try { window.loadUserProfile(); } catch(e) {}
            }
            if (typeof window.renderPicksList === 'function') window.renderPicksList();
            if (typeof window.loadMyPicks === 'function') window.loadMyPicks(window.currentPicksTab || 'pending');
            if (typeof window.loadProfile === 'function') {
                try { window.loadProfile(); } catch(e) {}
            }
            if (typeof window.renderStatCards === 'function') {
                try { 
                    var picks = JSON.parse(localStorage.getItem('tmr_picks') || '[]');
                    window.renderStatCards(picks);
                } catch(e) {}
            }
            if (typeof window.renderSportBreakdown === 'function') {
                try { 
                    var picks = JSON.parse(localStorage.getItem('tmr_picks') || '[]');
                    window.renderSportBreakdown(picks);
                } catch(e) {}
            }
            console.log('[TMR Grader] UI refresh triggered');
        }

        console.log(`[TMR Grader] ========== GRADING COMPLETE: ${gradedCount}/${picksToGrade.length} graded ==========`);
        return { graded: gradedCount, total: picksToGrade.length };
    },

    showToast: function(message, type) {
        const toast = document.createElement('div');
        const bgColor = type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#06b6d4';
        toast.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${bgColor};
            color: white;
            padding: 16px 24px;
            border-radius: 8px;
            font-weight: 600;
            z-index: 10000;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            animation: slideIn 0.3s ease;
        `;
        toast.textContent = message;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 4000);
    }
};

// Export grading functions to window.TMR for backward compatibility
if (typeof window !== 'undefined') {
    window.TMR = window.TMR || {};
    window.TMR.gradePick = TMR_GRADER.gradePick.bind(TMR_GRADER);
    window.TMR.gradeML = TMR_GRADER.gradeMoneyline.bind(TMR_GRADER);
    window.TMR.gradeSpread = TMR_GRADER.gradeSpread.bind(TMR_GRADER);
    window.TMR.gradeTotal = TMR_GRADER.gradeTotal.bind(TMR_GRADER);
    window.TMR.runAutoGrading = TMR_GRADER.runAutoGrading.bind(TMR_GRADER);
}

// One-time fix: Revert any picks that were incorrectly graded while games were still in progress
// This runs once per session to catch the Cardinals/Tigers Over 8 bug from April 5 2026
(function fixIncorrectlyGradedPicks() {
    try {
        var picks = JSON.parse(localStorage.getItem('tmr_picks') || '[]');
        var fixed = 0;
        var today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
        picks.forEach(function(p) {
            // Find picks graded today that have suspiciously low scores (0-0, 1-0, etc.)
            // These were graded while games were still in progress due to the boxscore bug
            if (p.graded_at && p.graded_at.startsWith(today) && (p.status === 'lost' || p.status === 'won' || p.result === 'lost' || p.result === 'won')) {
                var totalScore = (parseInt(p.home_score) || 0) + (parseInt(p.away_score) || 0);
                // If total score is very low AND it was graded today, it was likely graded mid-game
                // For over/under picks with line >= 5 and total score <= 2, this is almost certainly a bug
                var line = parseFloat(p.line_snapshot || p.line || 0);
                var isTotal = (p.market_type === 'total' || p.market_type === 'totals');
                if (isTotal && line >= 5 && totalScore <= 2) {
                    console.log('[TMR Fix] Reverting incorrectly graded pick:', p.id, p.selection, 'Score was:', p.away_score, '-', p.home_score);
                    p.status = 'pending';
                    p.result = 'pending';
                    delete p.graded_at;
                    delete p.home_score;
                    delete p.away_score;
                    delete p.result_units;
                    fixed++;
                }
            }
        });
        if (fixed > 0) {
            localStorage.setItem('tmr_picks', JSON.stringify(picks));
            console.log('[TMR Fix] Reverted ' + fixed + ' incorrectly graded picks back to pending');
        }
    } catch(e) {
        console.error('[TMR Fix] Error fixing picks:', e);
    }
})();

// Auto-init if DOM ready
document.addEventListener('DOMContentLoaded', () => {
    if (typeof TMR_GRADER !== 'undefined') {
        TMR_GRADER.init();
    }
});
