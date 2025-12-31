// AUTO-GRADING SYSTEM FOR TRUST MY RECORD
// Grades pending picks based on completed game scores from The Odds API
console.log('Grading.js loading...');

const ODDS_API_KEY_GRADING = 'deeac7e7af6a8f1a5ac84c625e04973a';

const gradingSportKeyMap = {
    'NBA': 'basketball_nba',
    'NFL': 'americanfootball_nfl',
    'NHL': 'icehockey_nhl',
    'MLB': 'baseball_mlb',
    'NCAAF': 'americanfootball_ncaaf',
    'NCAAB': 'basketball_ncaab'
};

/**
 * Helper function to normalize team names for matching
 */
function normalizeTeamName(name) {
    if (!name) return '';
    return name.toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Check if two team names match
 */
function teamsMatch(team1, team2) {
    const n1 = normalizeTeamName(team1);
    const n2 = normalizeTeamName(team2);

    // Exact match
    if (n1 === n2) return true;

    // One contains the other
    if (n1.includes(n2) || n2.includes(n1)) return true;

    // Match last word (team nickname)
    const last1 = n1.split(' ').pop();
    const last2 = n2.split(' ').pop();
    if (last1 === last2 && last1.length > 2) return true;

    // Match city/first words
    const first1 = n1.split(' ')[0];
    const first2 = n2.split(' ')[0];
    if (first1 === first2 && first1.length > 2) return true;

    return false;
}

/**
 * Fetch completed game scores from The Odds API
 */
async function fetchCompletedScores(sportKey, daysFrom = 3) {
    try {
        const url = `https://api.the-odds-api.com/v4/sports/${sportKey}/scores?apiKey=${ODDS_API_KEY_GRADING}&daysFrom=${daysFrom}`;
        const response = await fetch(url);
        if (!response.ok) return [];
        const scores = await response.json();
        return scores.filter(game => game.completed === true);
    } catch (error) {
        console.error('Error fetching scores:', error);
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
    const pickStr = (pick.pick || '').toLowerCase();
    const betType = (pick.betType || '').toLowerCase();

    let result = null;

    // Determine if user picked home or away team
    const homeTeamNorm = normalizeTeamName(gameResult.home_team);
    const awayTeamNorm = normalizeTeamName(gameResult.away_team);
    const pickTeamPart = pickStr.replace(/[+-]?\d+\.?\d*/g, '').replace(/\s*(ml|over|under)\s*/gi, '').trim();

    const pickedHomeTeam = teamsMatch(pickTeamPart, gameResult.home_team);
    const pickedAwayTeam = teamsMatch(pickTeamPart, gameResult.away_team);

    // Moneyline bets
    if (betType === 'ml' || betType === 'moneyline' || pickStr.includes(' ml') || pickStr.includes('ml')) {
        if (pickedHomeTeam) {
            result = homePts > awayPts ? 'win' : (homePts < awayPts ? 'loss' : 'push');
        } else if (pickedAwayTeam) {
            result = awayPts > homePts ? 'win' : (awayPts < homePts ? 'loss' : 'push');
        }
    }
    // Spread bets
    else if (betType === 'spread' || /[+-]\d/.test(pickStr)) {
        const spreadMatch = pick.pick.match(/([+-]?\d+\.?\d*)/);
        if (spreadMatch) {
            const pickedSpread = parseFloat(spreadMatch[1]);

            if (pickedHomeTeam) {
                const coverMargin = homePts - awayPts + pickedSpread;
                result = coverMargin > 0 ? 'win' : coverMargin < 0 ? 'loss' : 'push';
            } else if (pickedAwayTeam) {
                const coverMargin = awayPts - homePts + pickedSpread;
                result = coverMargin > 0 ? 'win' : coverMargin < 0 ? 'loss' : 'push';
            }
        }
    }
    // Over/Under bets
    else if (betType === 'over' || betType === 'under' || pickStr.includes('over') || pickStr.includes('under')) {
        const totalMatch = pick.pick.match(/(\d+\.?\d*)/);
        if (totalMatch) {
            const line = parseFloat(totalMatch[1]);
            const isOver = betType === 'over' || pickStr.includes('over');
            if (isOver) result = totalPoints > line ? 'win' : totalPoints < line ? 'loss' : 'push';
            else result = totalPoints < line ? 'win' : totalPoints > line ? 'loss' : 'push';
        }
    }
    // Team totals (check for team name + over/under)
    else if (betType === 'teamtotal') {
        const totalMatch = pick.pick.match(/(\d+\.?\d*)/);
        if (totalMatch) {
            const line = parseFloat(totalMatch[1]);
            const isOver = pickStr.includes('over');

            // Determine which team's total to check
            if (pickedHomeTeam) {
                if (isOver) result = homePts > line ? 'win' : homePts < line ? 'loss' : 'push';
                else result = homePts < line ? 'win' : homePts > line ? 'loss' : 'push';
            } else if (pickedAwayTeam) {
                if (isOver) result = awayPts > line ? 'win' : awayPts < line ? 'loss' : 'push';
                else result = awayPts < line ? 'win' : awayPts > line ? 'loss' : 'push';
            }
        }
    }

    return result;
}

/**
 * Auto-grade all pending picks
 */
async function autoGradePicks() {
    console.log('Starting auto-grading...');
    const picks = JSON.parse(localStorage.getItem('trustMyRecordPicks') || '[]');
    const pendingPicks = picks.filter(p => p.status === 'pending' || !p.status);

    if (pendingPicks.length === 0) {
        console.log('No pending picks to grade');
        return { graded: 0, wins: 0, losses: 0, pushes: 0 };
    }

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
        const sportKey = gradingSportKeyMap[sport];
        if (!sportKey) continue;

        const completedGames = await fetchCompletedScores(sportKey, 10);
        console.log(`Fetched ${completedGames.length} completed ${sport} games`);

        for (const pick of sportPicks) {
            // Extract team names from pick - use team1/team2 if available
            let pickTeam1 = pick.team1 || '';
            let pickTeam2 = pick.team2 || '';

            // If team1/team2 not set, try to parse from game string
            if (!pickTeam1 && !pickTeam2) {
                const gameStr = pick.game || '';
                const parts = gameStr.split(/\s*[@vs]+\s*/i);
                if (parts.length >= 2) {
                    pickTeam1 = parts[0].trim();
                    pickTeam2 = parts[1].trim();
                }
            }

            // Find matching completed game
            const matchingGame = completedGames.find(game => {
                // Check if both teams match
                const homeMatches = teamsMatch(game.home_team, pickTeam1) || teamsMatch(game.home_team, pickTeam2);
                const awayMatches = teamsMatch(game.away_team, pickTeam1) || teamsMatch(game.away_team, pickTeam2);
                return homeMatches && awayMatches;
            });

            if (matchingGame) {
                const result = gradePick(pick, matchingGame);
                if (result) {
                    pick.status = result;
                    pick.result = result;
                    pick.gradedAt = new Date().toISOString();
                    const homeScore = matchingGame.scores?.find(s => s.name === matchingGame.home_team)?.score || '?';
                    const awayScore = matchingGame.scores?.find(s => s.name === matchingGame.away_team)?.score || '?';
                    pick.finalScore = `${matchingGame.away_team} ${awayScore} - ${matchingGame.home_team} ${homeScore}`;
                    gradedCount++;
                    if (result === 'win') wins++;
                    else if (result === 'loss') losses++;
                    else pushes++;
                    console.log(`Graded: ${pick.pick} -> ${result} (${pick.finalScore})`);
                }
            }
        }
    }

    // Save updated picks
    localStorage.setItem('trustMyRecordPicks', JSON.stringify(picks));
    console.log(`Auto-grading complete: ${gradedCount} picks graded (${wins}W-${losses}L-${pushes}P)`);

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

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    // Auto-grade after 3 seconds (let page load first)
    setTimeout(autoGradePicks, 3000);

    // Update leaderboards with real data
    setTimeout(updateLeaderboardsWithRealData, 1500);

    // Auto-grade every 2 minutes
    setInterval(autoGradePicks, 2 * 60 * 1000);
});

// Export functions globally
window.autoGradePicks = autoGradePicks;
window.manualGradePick = manualGradePick;
window.showGradingModal = showGradingModal;
window.closeGradingModal = closeGradingModal;
window.updateLeaderboardsWithRealData = updateLeaderboardsWithRealData;
