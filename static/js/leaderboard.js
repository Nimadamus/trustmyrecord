// Leaderboard Data Loader - TrustMyRecord
// Fetches leaderboard.json and populates all 5 leaderboard panels

(function() {
    let leaderboardData = null;

    async function fetchLeaderboardData() {
        try {
            const resp = await fetch('static/data/leaderboard.json?v=' + Date.now());
            if (!resp.ok) throw new Error('Failed to load leaderboard data');
            leaderboardData = await resp.json();
            renderAllLeaderboards();
        } catch (err) {
            console.error('[Leaderboard] Error loading data:', err);
        }
    }

    function rankBadge(rank) {
        if (rank === 1) return '<div class="rank-badge gold">1</div>';
        if (rank === 2) return '<div class="rank-badge silver">2</div>';
        if (rank === 3) return '<div class="rank-badge bronze">3</div>';
        return '<div class="rank-badge">' + rank + '</div>';
    }

    function verifiedBadge(verified) {
        return verified ? ' <span style="color: var(--neon-cyan); font-size: 14px;" title="Verified">&#10003;</span>' : '';
    }

    function streakBadge(streak) {
        if (!streak) return '';
        const color = streak.startsWith('W') ? 'var(--neon-green)' : 'var(--neon-red)';
        return '<span style="color:' + color + '; font-size: 13px; margin-left: 8px; font-weight: 700;">' + streak + '</span>';
    }

    function renderRow(rank, cols) {
        return '<div class="lb-row">' +
            '<div class="lb-col-rank">' + rankBadge(rank) + '</div>' +
            cols.map(function(c) { return '<div class="lb-col-stat">' + c + '</div>'; }).join('') +
            '</div>';
    }

    // 1. Total Points Leaderboard
    function renderPointsLeaderboard() {
        const body = document.getElementById('pointsLeaderboardBody');
        if (!body || !leaderboardData) return;

        const sorted = leaderboardData.users.slice().sort(function(a, b) {
            return b.totalPoints - a.totalPoints;
        });

        let html = '';
        sorted.forEach(function(u, i) {
            html += '<div class="lb-row">' +
                '<div class="lb-col-rank">' + rankBadge(i + 1) + '</div>' +
                '<div class="lb-col-user" style="font-weight: 700;">' + u.displayName + verifiedBadge(u.verified) + '</div>' +
                '<div class="lb-col-stat">' + (u.trivia ? u.trivia.points.toLocaleString() : '0') + '</div>' +
                '<div class="lb-col-stat">' + (u.polls ? u.polls.correct : '0') + '/' + (u.polls ? u.polls.total : '0') + '</div>' +
                '<div class="lb-col-total" style="color: var(--neon-gold); font-weight: 900; font-size: 18px;">' + u.totalPoints.toLocaleString() + '</div>' +
                '</div>';
        });

        body.innerHTML = html || emptyState();
    }

    // 2. Best Handicappers (Picks) Leaderboard
    function renderPicksLeaderboard() {
        const body = document.getElementById('picksLeaderboardBody');
        if (!body || !leaderboardData) return;

        const sorted = leaderboardData.users.slice().sort(function(a, b) {
            return b.picks.winRate - a.picks.winRate;
        });

        let html = '<div class="leaderboard-table"><div class="lb-table-header">' +
            '<div class="lb-col-rank">Rank</div>' +
            '<div class="lb-col-user">Handicapper</div>' +
            '<div class="lb-col-stat">Record</div>' +
            '<div class="lb-col-stat">Win Rate</div>' +
            '<div class="lb-col-total">Units</div>' +
            '</div><div class="lb-table-body">';

        sorted.forEach(function(u, i) {
            const p = u.picks;
            const record = p.wins + '-' + p.losses + '-' + p.pushes;
            const wrColor = p.winRate >= 57 ? 'var(--neon-green)' : p.winRate >= 53 ? 'var(--neon-cyan)' : 'var(--text-secondary)';
            const unitsColor = p.units > 0 ? 'var(--neon-green)' : 'var(--neon-red)';

            html += '<div class="lb-row">' +
                '<div class="lb-col-rank">' + rankBadge(i + 1) + '</div>' +
                '<div class="lb-col-user" style="font-weight: 700;">' + u.displayName + verifiedBadge(u.verified) + streakBadge(p.streak) + '</div>' +
                '<div class="lb-col-stat">' + record + ' <span style="color: var(--text-secondary); font-size: 12px;">(' + p.total + ' picks)</span></div>' +
                '<div class="lb-col-stat" style="color:' + wrColor + '; font-weight: 800; font-size: 18px;">' + p.winRate.toFixed(1) + '%</div>' +
                '<div class="lb-col-total" style="color:' + unitsColor + '; font-weight: 900; font-size: 18px;">' + (p.units > 0 ? '+' : '') + p.units.toFixed(1) + 'u</div>' +
                '</div>';
        });

        html += '</div></div>';
        body.innerHTML = html;
    }

    // 3. Trivia Champions
    function renderTriviaLeaderboard() {
        const body = document.getElementById('triviaLeaderboardBody');
        if (!body || !leaderboardData) return;

        const sorted = leaderboardData.users.slice().sort(function(a, b) {
            return (b.trivia ? b.trivia.points : 0) - (a.trivia ? a.trivia.points : 0);
        });

        let html = '<div class="leaderboard-table"><div class="lb-table-header">' +
            '<div class="lb-col-rank">Rank</div>' +
            '<div class="lb-col-user">Player</div>' +
            '<div class="lb-col-stat">Games</div>' +
            '<div class="lb-col-stat">Avg Score</div>' +
            '<div class="lb-col-total">Points</div>' +
            '</div><div class="lb-table-body">';

        sorted.forEach(function(u, i) {
            const t = u.trivia || { points: 0, gamesPlayed: 0, avgScore: 0 };
            html += '<div class="lb-row">' +
                '<div class="lb-col-rank">' + rankBadge(i + 1) + '</div>' +
                '<div class="lb-col-user" style="font-weight: 700;">' + u.displayName + verifiedBadge(u.verified) + '</div>' +
                '<div class="lb-col-stat">' + t.gamesPlayed + '</div>' +
                '<div class="lb-col-stat">' + t.avgScore.toFixed(1) + '%</div>' +
                '<div class="lb-col-total" style="color: var(--neon-gold); font-weight: 900; font-size: 18px;">' + t.points.toLocaleString() + '</div>' +
                '</div>';
        });

        html += '</div></div>';
        body.innerHTML = html;
    }

    // 4. Poll Predictions
    function renderPollsLeaderboard() {
        const body = document.getElementById('pollsLeaderboardBody');
        if (!body || !leaderboardData) return;

        const sorted = leaderboardData.users.slice().sort(function(a, b) {
            return (b.polls ? b.polls.accuracy : 0) - (a.polls ? a.polls.accuracy : 0);
        });

        let html = '<div class="leaderboard-table"><div class="lb-table-header">' +
            '<div class="lb-col-rank">Rank</div>' +
            '<div class="lb-col-user">Predictor</div>' +
            '<div class="lb-col-stat">Correct</div>' +
            '<div class="lb-col-stat">Total</div>' +
            '<div class="lb-col-total">Accuracy</div>' +
            '</div><div class="lb-table-body">';

        sorted.forEach(function(u, i) {
            const p = u.polls || { correct: 0, total: 0, accuracy: 0 };
            const accColor = p.accuracy >= 65 ? 'var(--neon-green)' : p.accuracy >= 55 ? 'var(--neon-cyan)' : 'var(--text-secondary)';
            html += '<div class="lb-row">' +
                '<div class="lb-col-rank">' + rankBadge(i + 1) + '</div>' +
                '<div class="lb-col-user" style="font-weight: 700;">' + u.displayName + verifiedBadge(u.verified) + '</div>' +
                '<div class="lb-col-stat">' + p.correct + '</div>' +
                '<div class="lb-col-stat">' + p.total + '</div>' +
                '<div class="lb-col-total" style="color:' + accColor + '; font-weight: 900; font-size: 18px;">' + p.accuracy.toFixed(1) + '%</div>' +
                '</div>';
        });

        html += '</div></div>';
        body.innerHTML = html;
    }

    // 5. Profit Leaders (Units)
    function renderUnitsLeaderboard() {
        const body = document.getElementById('unitsLeaderboardBody');
        if (!body || !leaderboardData) return;

        const sorted = leaderboardData.users.slice().sort(function(a, b) {
            return b.picks.units - a.picks.units;
        });

        let html = '<div class="leaderboard-table"><div class="lb-table-header">' +
            '<div class="lb-col-rank">Rank</div>' +
            '<div class="lb-col-user">Bettor</div>' +
            '<div class="lb-col-stat">ROI</div>' +
            '<div class="lb-col-stat">Best Sport</div>' +
            '<div class="lb-col-total">Units Won</div>' +
            '</div><div class="lb-table-body">';

        sorted.forEach(function(u, i) {
            const p = u.picks;
            const roiColor = p.roi > 10 ? 'var(--neon-green)' : p.roi > 0 ? 'var(--neon-cyan)' : 'var(--neon-red)';
            const unitsColor = p.units > 0 ? 'var(--neon-green)' : 'var(--neon-red)';
            html += '<div class="lb-row">' +
                '<div class="lb-col-rank">' + rankBadge(i + 1) + '</div>' +
                '<div class="lb-col-user" style="font-weight: 700;">' + u.displayName + verifiedBadge(u.verified) + streakBadge(p.streak) + '</div>' +
                '<div class="lb-col-stat" style="color:' + roiColor + '; font-weight: 700;">' + (p.roi > 0 ? '+' : '') + p.roi.toFixed(1) + '%</div>' +
                '<div class="lb-col-stat">' + p.bestSport + '</div>' +
                '<div class="lb-col-total" style="color:' + unitsColor + '; font-weight: 900; font-size: 18px;">' + (p.units > 0 ? '+' : '') + p.units.toFixed(1) + 'u</div>' +
                '</div>';
        });

        html += '</div></div>';
        body.innerHTML = html;
    }

    function emptyState() {
        return '<div style="text-align: center; padding: 40px 20px; color: #6c7380;">' +
            '<div style="font-size: 48px; margin-bottom: 15px;">&#127942;</div>' +
            '<p style="font-size: 16px; margin-bottom: 8px;">No rankings yet</p>' +
            '<p style="font-size: 13px; opacity: 0.7;">Be the first to compete and claim the top spot!</p>' +
            '</div>';
    }

    function renderAllLeaderboards() {
        renderPointsLeaderboard();
        renderPicksLeaderboard();
        renderTriviaLeaderboard();
        renderPollsLeaderboard();
        renderUnitsLeaderboard();
        console.log('[Leaderboard] Rendered ' + leaderboardData.users.length + ' users across all boards');
    }

    // Load on page ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', fetchLeaderboardData);
    } else {
        fetchLeaderboardData();
    }

    // Expose for manual refresh
    window.refreshLeaderboards = fetchLeaderboardData;
})();
