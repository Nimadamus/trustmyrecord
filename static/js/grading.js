// AUTO-GRADING SYSTEM FOR TRUST MY RECORD
// Grades pending picks based on completed game scores from The Odds API
// Last Updated: January 5, 2026 - Added comprehensive logging

const ODDS_API_KEY_GRADING = 'deeac7e7af6a8f1a5ac84c625e04973a';

// Logging utility
function gradingLog(level, message, data = null) {
    const timestamp = new Date().toISOString();
    const prefix = `[TMR Grading ${timestamp}]`;
    if (data) {
        console[level](`${prefix} ${message}`, data);
    } else {
        console[level](`${prefix} ${message}`);
    }
    // Store in localStorage for debugging
    const logs = JSON.parse(localStorage.getItem('tmr_grading_logs') || '[]');
    logs.push({ timestamp, level, message, data: data ? JSON.stringify(data).substring(0, 500) : null });
    // Keep last 100 logs
    if (logs.length > 100) logs.shift();
    localStorage.setItem('tmr_grading_logs', JSON.stringify(logs));
}

const gradingSportKeyMap = {
    'NBA': 'basketball_nba',
    'NFL': 'americanfootball_nfl',
    'NHL': 'icehockey_nhl',
    'MLB': 'baseball_mlb',
    'NCAAF': 'americanfootball_ncaaf',
    'NCAAB': 'basketball_ncaab'
};

/**
 * Fetch completed game scores from The Odds API
 */
async function fetchCompletedScores(sportKey, daysFrom = 3) {
    try {
        const url = `https://api.the-odds-api.com/v4/sports/${sportKey}/scores?apiKey=${ODDS_API_KEY_GRADING}&daysFrom=${daysFrom}`;
        gradingLog('info', `Fetching scores from: ${url.replace(ODDS_API_KEY_GRADING, 'API_KEY_HIDDEN')}`);

        const response = await fetch(url);

        // Log API quota remaining
        const remaining = response.headers.get('x-requests-remaining');
        const used = response.headers.get('x-requests-used');
        if (remaining) {
            gradingLog('info', `API Quota - Used: ${used}, Remaining: ${remaining}`);
        }

        if (!response.ok) {
            gradingLog('error', `API returned ${response.status}: ${response.statusText}`);
            return [];
        }

        const scores = await response.json();
        gradingLog('info', `API returned ${scores.length} total games`);

        const completedGames = scores.filter(game => game.completed === true);
        gradingLog('info', `${completedGames.length} games are completed`);

        return completedGames;
    } catch (error) {
        gradingLog('error', 'Error fetching scores: ' + error.message);
        return [];
    }
}

/**
 * Grade a single pick based on game result
 */
function gradePick(pick, gameResult) {
    const homeScore = gameResult.scores?.find(s => s.name === gameResult.home_team)?.score;
    const awayScore = gameResult.scores?.find(s => s.name === gameResult.away_team)?.score;

    if (!homeScore || !awayScore) return null;

    const homePts = parseInt(homeScore);
    const awayPts = parseInt(awayScore);
    const totalPoints = homePts + awayPts;
    const pickStr = pick.pick.toLowerCase();
    const betType = pick.betType?.toLowerCase() || '';

    let result = null;

    // Moneyline bets
    if (betType === 'ml' || betType === 'moneyline' || pickStr.includes(' ml')) {
        const pickedTeam = pick.pick.replace(/ ml$/i, '').trim().toLowerCase();
        const homeShort = gameResult.home_team.toLowerCase().split(' ').pop();
        const awayShort = gameResult.away_team.toLowerCase().split(' ').pop();
        const pickedHome = pickedTeam.includes(homeShort) || homeShort.includes(pickedTeam.split(' ').pop());
        result = pickedHome ? (homePts > awayPts ? 'win' : 'loss') : (awayPts > homePts ? 'win' : 'loss');
    }
    // Spread bets
    else if (betType === 'spread' || /[+-]\d/.test(pickStr)) {
        const spreadMatch = pick.pick.match(/([+-]?\d+\.?\d*)/);
        if (spreadMatch) {
            const pickedSpread = parseFloat(spreadMatch[1]);
            const pickedTeam = pick.pick.replace(/[+-]?\d+\.?\d*/g, '').trim().toLowerCase();
            const homeShort = gameResult.home_team.toLowerCase().split(' ').pop();
            const pickedHome = pickedTeam.includes(homeShort);
            const coverMargin = pickedHome ? (homePts - awayPts + pickedSpread) : (awayPts - homePts + pickedSpread);
            result = coverMargin > 0 ? 'win' : coverMargin < 0 ? 'loss' : 'push';
        }
    }
    // Over/Under bets
    else if (betType === 'over' || betType === 'under' || pickStr.includes('over') || pickStr.includes('under')) {
        const totalMatch = pick.pick.match(/(\d+\.?\d*)/);
        if (totalMatch) {
            const line = parseFloat(totalMatch[1]);
            const isOver = pickStr.includes('over');
            if (isOver) result = totalPoints > line ? 'win' : totalPoints < line ? 'loss' : 'push';
            else result = totalPoints < line ? 'win' : totalPoints > line ? 'loss' : 'push';
        }
    }

    return result;
}

/**
 * Auto-grade all pending picks
 */
async function autoGradePicks() {
    gradingLog('info', '=== AUTO-GRADING STARTED ===');

    const picks = JSON.parse(localStorage.getItem('trustMyRecordPicks') || '[]');
    gradingLog('info', `Total picks in storage: ${picks.length}`);

    const pendingPicks = picks.filter(p => p.status === 'pending' || !p.status);
    gradingLog('info', `Pending picks to grade: ${pendingPicks.length}`);

    if (pendingPicks.length === 0) {
        gradingLog('info', 'No pending picks to grade - exiting');
        return { graded: 0, wins: 0, losses: 0, pushes: 0 };
    }

    // Log details of each pending pick
    pendingPicks.forEach((pick, idx) => {
        gradingLog('info', `Pending pick #${idx + 1}:`, {
            sport: pick.sport,
            pick: pick.pick,
            team1: pick.team1,
            team2: pick.team2,
            timestamp: pick.timestamp
        });
    });

    // Group pending picks by sport
    const picksBySport = {};
    pendingPicks.forEach(pick => {
        const sport = pick.sport?.toUpperCase() || 'NBA';
        if (!picksBySport[sport]) picksBySport[sport] = [];
        picksBySport[sport].push(pick);
    });

    let gradedCount = 0, wins = 0, losses = 0, pushes = 0;

    // Fetch scores for each sport and grade picks
    for (const [sport, sportPicks] of Object.entries(picksBySport)) {
        gradingLog('info', `Processing ${sport} - ${sportPicks.length} picks`);

        const sportKey = gradingSportKeyMap[sport];
        if (!sportKey) {
            gradingLog('warn', `No sport key mapping for: ${sport}`);
            continue;
        }

        gradingLog('info', `Fetching completed games for ${sportKey}...`);
        const completedGames = await fetchCompletedScores(sportKey, 10);
        gradingLog('info', `Fetched ${completedGames.length} completed ${sport} games`);

        if (completedGames.length > 0) {
            gradingLog('info', 'Sample completed games:', completedGames.slice(0, 3).map(g => ({
                home: g.home_team,
                away: g.away_team,
                completed: g.completed,
                scores: g.scores
            })));
        }

        for (const pick of sportPicks) {
            gradingLog('info', `Attempting to grade pick: ${pick.pick}`);

            // Extract team names from pick - improved extraction
            let gameTeams = [pick.team1?.toLowerCase(), pick.team2?.toLowerCase()].filter(Boolean);

            // Also extract from the pick string itself (e.g., "Lakers +5.5" -> "lakers")
            const pickTeam = pick.pick?.replace(/[+-]?\d+\.?\d*/g, '').replace(/ml|over|under/gi, '').trim().toLowerCase();
            if (pickTeam && pickTeam.length > 2) {
                gameTeams.push(pickTeam);
            }

            if (gameTeams.length === 0) {
                const gameStr = pick.game || pick.pick || '';
                gameTeams.push(...gameStr.toLowerCase().split(/[@vs]/i).map(t => t.trim()).filter(t => t.length > 2));
            }

            // Remove duplicates
            gameTeams = [...new Set(gameTeams)];
            gradingLog('info', `Searching for teams: [${gameTeams.join(', ')}]`);

            // Find matching completed game - improved matching
            const matchingGame = completedGames.find(game => {
                const home = game.home_team.toLowerCase();
                const away = game.away_team.toLowerCase();
                const homeShort = home.split(' ').pop();
                const awayShort = away.split(' ').pop();
                const homeFirst = home.split(' ')[0];
                const awayFirst = away.split(' ')[0];

                const matches = gameTeams.some(team => {
                    const teamShort = team.split(' ').pop();
                    const teamFirst = team.split(' ')[0];
                    return home.includes(teamShort) ||
                        away.includes(teamShort) ||
                        team.includes(homeShort) ||
                        team.includes(awayShort) ||
                        homeShort.includes(teamShort) ||
                        awayShort.includes(teamShort) ||
                        teamShort.includes(homeShort) ||
                        teamShort.includes(awayShort) ||
                        (teamFirst.length > 3 && (homeFirst.includes(teamFirst) || awayFirst.includes(teamFirst)));
                });

                if (matches) {
                    gradingLog('info', `Found potential match: ${away} @ ${home}`);
                }
                return matches;
            });

            if (matchingGame) {
                gradingLog('info', `Matched game: ${matchingGame.away_team} @ ${matchingGame.home_team}`, matchingGame.scores);
                const result = gradePick(pick, matchingGame);
                if (result) {
                    pick.status = result;
                    pick.result = result;
                    pick.gradedAt = new Date().toISOString();
                    pick.finalScore = `${matchingGame.home_team}: ${matchingGame.scores?.find(s=>s.name===matchingGame.home_team)?.score || '?'} - ${matchingGame.away_team}: ${matchingGame.scores?.find(s=>s.name===matchingGame.away_team)?.score || '?'}`;
                    gradedCount++;
                    if (result === 'win') wins++;
                    else if (result === 'loss') losses++;
                    else pushes++;
                    gradingLog('info', `✓ GRADED: ${pick.pick} -> ${result.toUpperCase()}`);
                } else {
                    gradingLog('warn', `Could not determine result for pick: ${pick.pick}`);
                }
            } else {
                gradingLog('warn', `No matching completed game found for: ${pick.pick} (teams: ${gameTeams.join(', ')})`);
            }
        }
    }

    // Save updated picks
    localStorage.setItem('trustMyRecordPicks', JSON.stringify(picks));
    gradingLog('info', `=== AUTO-GRADING COMPLETE ===`);
    gradingLog('info', `Results: ${gradedCount} graded (${wins}W-${losses}L-${pushes}P)`);

    // Update UI
    if (typeof updateStatsDashboard === 'function') updateStatsDashboard();
    if (typeof loadPicksHistory === 'function') loadPicksHistory();
    if (typeof updateProfileStats === 'function') updateProfileStats();

    return { graded: gradedCount, wins, losses, pushes };
}

/**
 * Manual grade a specific pick
 */
function manualGradePick(pickIndex, result) {
    const picks = JSON.parse(localStorage.getItem('trustMyRecordPicks') || '[]');
    if (pickIndex >= 0 && pickIndex < picks.length) {
        picks[pickIndex].status = result;
        picks[pickIndex].result = result;
        picks[pickIndex].gradedAt = new Date().toISOString();
        picks[pickIndex].manualGrade = true;
        localStorage.setItem('trustMyRecordPicks', JSON.stringify(picks));

        if (typeof updateStatsDashboard === 'function') updateStatsDashboard();
        if (typeof loadPicksHistory === 'function') loadPicksHistory();
        if (typeof updateProfileStats === 'function') updateProfileStats();

        return true;
    }
    return false;
}

/**
 * Show grading modal for pending picks
 */
function showGradingModal() {
    const picks = JSON.parse(localStorage.getItem('trustMyRecordPicks') || '[]');
    const pendingPicks = picks.map((p, i) => ({...p, index: i})).filter(p => p.status === 'pending' || !p.status);

    if (pendingPicks.length === 0) {
        alert('No pending picks to grade!');
        return;
    }

    // Create modal
    let modal = document.getElementById('gradingModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'gradingModal';
        modal.className = 'modal';
        modal.style.cssText = 'display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.8);z-index:10000;justify-content:center;align-items:center;';
        modal.innerHTML = `
            <div style="background:var(--card-bg,#1a1a2e);border:1px solid var(--neon-cyan,#00ffff);border-radius:16px;max-width:600px;max-height:80vh;overflow-y:auto;padding:30px;position:relative;">
                <span onclick="closeGradingModal()" style="position:absolute;top:15px;right:20px;font-size:24px;cursor:pointer;color:var(--text-muted,#888);">&times;</span>
                <h2 style="color:var(--neon-cyan,#00ffff);margin-bottom:20px;">Grade Pending Picks</h2>
                <div style="margin-bottom:20px;">
                    <button onclick="autoGradePicks().then(r => { alert('Graded ' + r.graded + ' picks: ' + r.wins + 'W-' + r.losses + 'L-' + r.pushes + 'P'); closeGradingModal(); showGradingModal(); })"
                            style="background:linear-gradient(135deg,#00ffff,#00cccc);border:none;padding:12px 24px;border-radius:8px;color:#000;font-weight:700;cursor:pointer;">
                        Auto-Grade All
                    </button>
                </div>
                <div id="pendingPicksList"></div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    // Populate pending picks
    const listEl = modal.querySelector('#pendingPicksList');
    listEl.innerHTML = pendingPicks.map(pick => `
        <div style="background:rgba(0,255,255,0.05);border:1px solid rgba(0,255,255,0.2);border-radius:8px;padding:15px;margin-bottom:10px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
                <span style="font-weight:700;color:var(--neon-cyan,#00ffff);">${pick.sport || 'N/A'}</span>
                <span style="color:var(--text-muted,#888);font-size:0.85rem;">${new Date(pick.timestamp).toLocaleDateString()}</span>
            </div>
            <div style="font-size:1.1rem;margin-bottom:10px;color:#fff;">${pick.pick} @ ${pick.odds}</div>
            <div style="color:var(--text-secondary,#aaa);font-size:0.9rem;margin-bottom:15px;">${pick.game || (pick.team1 && pick.team2 ? pick.team1 + ' @ ' + pick.team2 : 'Game details unavailable')}</div>
            <div style="display:flex;gap:10px;">
                <button onclick="manualGradePick(${pick.index}, 'win'); showGradingModal();"
                        style="flex:1;background:linear-gradient(135deg,#00ff00,#00cc00);border:none;padding:10px;border-radius:6px;color:#000;font-weight:700;cursor:pointer;">
                    WIN
                </button>
                <button onclick="manualGradePick(${pick.index}, 'loss'); showGradingModal();"
                        style="flex:1;background:linear-gradient(135deg,#ff0000,#cc0000);border:none;padding:10px;border-radius:6px;color:#fff;font-weight:700;cursor:pointer;">
                    LOSS
                </button>
                <button onclick="manualGradePick(${pick.index}, 'push'); showGradingModal();"
                        style="flex:1;background:linear-gradient(135deg,#888888,#666666);border:none;padding:10px;border-radius:6px;color:#fff;font-weight:700;cursor:pointer;">
                    PUSH
                </button>
            </div>
        </div>
    `).join('');

    modal.style.display = 'flex';
}

function closeGradingModal() {
    const modal = document.getElementById('gradingModal');
    if (modal) modal.style.display = 'none';
}

/**
 * Update leaderboards with real user data
 */
function updateLeaderboardsWithRealData() {
    const picks = JSON.parse(localStorage.getItem('trustMyRecordPicks') || '[]');
    const graded = picks.filter(p => p.status === 'win' || p.status === 'loss' || p.result === 'win' || p.result === 'loss');
    const wins = graded.filter(p => p.status === 'win' || p.result === 'win').length;
    const losses = graded.filter(p => p.status === 'loss' || p.result === 'loss').length;

    let totalUnits = 0;
    graded.forEach(p => {
        const units = parseFloat(p.units) || 1;
        if (p.status === 'win' || p.result === 'win') totalUnits += units;
        if (p.status === 'loss' || p.result === 'loss') totalUnits -= units;
    });

    const winRate = graded.length > 0 ? ((wins / graded.length) * 100).toFixed(1) : 0;
    const currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}');

    // Update picks leaderboard with real data
    const picksBody = document.getElementById('picksLeaderboardBody');
    if (picksBody && graded.length > 0) {
        picksBody.innerHTML = `
            <div class="leaderboard-table">
                <div class="lb-table-header">
                    <div class="lb-col-rank">Rank</div>
                    <div class="lb-col-user">User</div>
                    <div class="lb-col-stat">Record</div>
                    <div class="lb-col-stat">Win %</div>
                    <div class="lb-col-total">Units</div>
                </div>
                <div class="lb-table-body">
                    <div class="lb-row">
                        <div class="lb-col-rank"><span class="rank-badge gold">1</span></div>
                        <div class="lb-col-user">
                            <span class="user-avatar-tiny">👑</span>
                            <span class="user-name-lb">@${currentUser.username || 'You'}</span>
                        </div>
                        <div class="lb-col-stat">${wins}-${losses}</div>
                        <div class="lb-col-stat">${winRate}%</div>
                        <div class="lb-col-total" style="color:${totalUnits >= 0 ? '#00ff00' : '#ff0000'}">${totalUnits > 0 ? '+' : ''}${totalUnits.toFixed(2)}</div>
                    </div>
                </div>
            </div>
        `;
    }

    // Update units leaderboard
    const unitsBody = document.getElementById('unitsLeaderboardBody');
    if (unitsBody && graded.length > 0) {
        const roi = graded.length > 0 ? ((totalUnits / graded.length) * 100).toFixed(1) : 0;
        unitsBody.innerHTML = `
            <div class="leaderboard-table">
                <div class="lb-table-header">
                    <div class="lb-col-rank">Rank</div>
                    <div class="lb-col-user">User</div>
                    <div class="lb-col-stat">Record</div>
                    <div class="lb-col-stat">ROI</div>
                    <div class="lb-col-total">Units +/-</div>
                </div>
                <div class="lb-table-body">
                    <div class="lb-row">
                        <div class="lb-col-rank"><span class="rank-badge gold">1</span></div>
                        <div class="lb-col-user">
                            <span class="user-avatar-tiny">💰</span>
                            <span class="user-name-lb">@${currentUser.username || 'You'}</span>
                        </div>
                        <div class="lb-col-stat">${wins}-${losses}</div>
                        <div class="lb-col-stat">${roi}%</div>
                        <div class="lb-col-total" style="color:${totalUnits >= 0 ? '#00ff00' : '#ff0000'}">${totalUnits > 0 ? '+' : ''}${totalUnits.toFixed(2)}</div>
                    </div>
                </div>
            </div>
        `;
    }
}

/**
 * View grading logs for debugging
 */
function viewGradingLogs() {
    const logs = JSON.parse(localStorage.getItem('tmr_grading_logs') || '[]');
    console.log('=== TMR GRADING LOGS ===');
    logs.forEach(log => {
        console.log(`[${log.timestamp}] ${log.level.toUpperCase()}: ${log.message}`, log.data || '');
    });
    return logs;
}

/**
 * Force grade a specific pick by index (for debugging)
 */
function forceGradePick(pickIndex, result) {
    const picks = JSON.parse(localStorage.getItem('trustMyRecordPicks') || '[]');
    if (pickIndex >= 0 && pickIndex < picks.length) {
        picks[pickIndex].status = result;
        picks[pickIndex].result = result;
        picks[pickIndex].gradedAt = new Date().toISOString();
        picks[pickIndex].manualGrade = true;
        localStorage.setItem('trustMyRecordPicks', JSON.stringify(picks));
        gradingLog('info', `Force graded pick #${pickIndex} as ${result}`);
        if (typeof updateStatsDashboard === 'function') updateStatsDashboard();
        if (typeof loadPicksHistory === 'function') loadPicksHistory();
        return true;
    }
    return false;
}

/**
 * Get list of all pending picks (for debugging)
 */
function getPendingPicks() {
    const picks = JSON.parse(localStorage.getItem('trustMyRecordPicks') || '[]');
    return picks.map((p, idx) => ({
        index: idx,
        sport: p.sport,
        pick: p.pick,
        team1: p.team1,
        team2: p.team2,
        status: p.status || 'pending',
        timestamp: p.timestamp
    })).filter(p => p.status === 'pending' || !p.status);
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    gradingLog('info', '=== GRADING MODULE LOADED ===');
    gradingLog('info', 'Page loaded, scheduling auto-grade in 3 seconds...');

    // Auto-grade after 3 seconds (let page load first)
    setTimeout(() => {
        gradingLog('info', 'Initial auto-grade triggered');
        autoGradePicks();
    }, 3000);

    // Update leaderboards with real data
    setTimeout(updateLeaderboardsWithRealData, 1500);

    // Auto-grade every 2 minutes
    setInterval(() => {
        gradingLog('info', '2-minute interval auto-grade triggered');
        autoGradePicks();
    }, 2 * 60 * 1000);
});

// Export functions globally
window.autoGradePicks = autoGradePicks;
window.manualGradePick = manualGradePick;
window.showGradingModal = showGradingModal;
window.closeGradingModal = closeGradingModal;
window.updateLeaderboardsWithRealData = updateLeaderboardsWithRealData;
window.viewGradingLogs = viewGradingLogs;
window.forceGradePick = forceGradePick;
window.getPendingPicks = getPendingPicks;
window.gradingLog = gradingLog;
