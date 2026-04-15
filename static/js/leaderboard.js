// Leaderboard Data Loader - TrustMyRecord
// Prefers backend leaderboard APIs and falls back to static JSON only when unavailable.

(function() {
    let leaderboardData = null;
    let backendLeaderboardState = null;

    async function fetchLeaderboardData() {
        try {
            const backendLoaded = await fetchBackendLeaderboards();
            if (backendLoaded) {
                renderAllLeaderboards();
                return;
            }

            const resp = await fetch('static/data/leaderboard.json?v=' + Date.now());
            if (!resp.ok) throw new Error('Failed to load leaderboard data');
            leaderboardData = await resp.json();
            backendLeaderboardState = null;
            renderAllLeaderboards();
        } catch (err) {
            console.error('[Leaderboard] Error loading data:', err);
            renderErrorState();
        }
    }

    async function fetchBackendLeaderboards() {
        if (typeof api === 'undefined' || !api || !api.ready) return false;

        try {
            await api.ready;
        } catch (err) {
            return false;
        }

        if (!api || typeof api.getLeaderboard !== 'function' || typeof api.request !== 'function') return false;

        try {
            const [capperData, triviaData, pollsData] = await Promise.all([
                api.getLeaderboard({ sortBy: 'roi', limit: 25 }),
                api.request('/trivia/leaderboard?period=all&limit=25'),
                api.request('/polls/leaderboard?period=all&limit=25')
            ]);

            backendLeaderboardState = {
                cappers: Array.isArray(capperData?.leaderboard) ? capperData.leaderboard : [],
                trivia: Array.isArray(triviaData?.leaderboard) ? triviaData.leaderboard : [],
                polls: Array.isArray(pollsData?.leaderboard) ? pollsData.leaderboard : []
            };
            leaderboardData = null;
            return true;
        } catch (err) {
            console.warn('[Leaderboard] Backend leaderboard fetch failed, using static fallback:', err);
            backendLeaderboardState = null;
            return false;
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
        if (!body) return;

        if (backendLeaderboardState) {
            const combined = combinePointsLeaderboard();
            body.innerHTML = combined.length
                ? combined.map(function(entry, i) {
                    return '<div class="lb-row">' +
                        '<div class="lb-col-rank">' + rankBadge(i + 1) + '</div>' +
                        '<div class="lb-col-user" style="font-weight: 700;">' + escapeHtml(entry.display_name) + verifiedBadge(entry.verified) + '</div>' +
                        '<div class="lb-col-stat">' + entry.trivia_points.toLocaleString() + '</div>' +
                        '<div class="lb-col-stat">' + entry.poll_correct + '/' + entry.poll_total + '</div>' +
                        '<div class="lb-col-total" style="color: var(--neon-gold); font-weight: 900; font-size: 18px;">' + entry.total_points.toLocaleString() + '</div>' +
                        '</div>';
                }).join('')
                : emptyState();
            return;
        }

        if (!leaderboardData) return;

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
        if (!body) return;

        if (backendLeaderboardState) {
            const sorted = backendLeaderboardState.cappers.slice();

            let html = '<div class="leaderboard-table"><div class="lb-table-header">' +
                '<div class="lb-col-rank">Rank</div>' +
                '<div class="lb-col-user">Handicapper</div>' +
                '<div class="lb-col-stat">Record</div>' +
                '<div class="lb-col-stat">Win Rate</div>' +
                '<div class="lb-col-total">Units</div>' +
                '</div><div class="lb-table-body">';

            sorted.forEach(function(u, i) {
                const wins = Number(u.wins || 0);
                const losses = Number(u.losses || 0);
                const pushes = Number(u.pushes || 0);
                const totalPicks = Number(u.total_picks || 0);
                const winRate = Number(u.win_rate || 0);
                const units = Number(u.net_units || 0);
                const record = wins + '-' + losses + '-' + pushes;
                const wrColor = winRate >= 57 ? 'var(--neon-green)' : winRate >= 53 ? 'var(--neon-cyan)' : 'var(--text-secondary)';
                const unitsColor = units > 0 ? 'var(--neon-green)' : units < 0 ? 'var(--neon-red)' : 'var(--text-secondary)';

                html += '<div class="lb-row">' +
                    '<div class="lb-col-rank">' + rankBadge(i + 1) + '</div>' +
                    '<div class="lb-col-user" style="font-weight: 700;">' + escapeHtml(u.display_name || u.username || 'User') + verifiedBadge(isVerified(u.verification_status)) + '</div>' +
                    '<div class="lb-col-stat">' + record + ' <span style="color: var(--text-secondary); font-size: 12px;">(' + totalPicks + ' picks)</span></div>' +
                    '<div class="lb-col-stat" style="color:' + wrColor + '; font-weight: 800; font-size: 18px;">' + winRate.toFixed(1) + '%</div>' +
                    '<div class="lb-col-total" style="color:' + unitsColor + '; font-weight: 900; font-size: 18px;">' + (units > 0 ? '+' : '') + units.toFixed(1) + 'u</div>' +
                    '</div>';
            });

            html += '</div></div>';
            body.innerHTML = sorted.length ? html : emptyState();
            return;
        }

        if (!leaderboardData) return;

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
        if (!body) return;

        if (backendLeaderboardState) {
            const sorted = backendLeaderboardState.trivia.slice();
            let html = '<div class="leaderboard-table"><div class="lb-table-header">' +
                '<div class="lb-col-rank">Rank</div>' +
                '<div class="lb-col-user">Player</div>' +
                '<div class="lb-col-stat">Questions</div>' +
                '<div class="lb-col-stat">Accuracy</div>' +
                '<div class="lb-col-total">Points</div>' +
                '</div><div class="lb-table-body">';

            sorted.forEach(function(u, i) {
                const answered = Number(u.questions_answered || 0);
                const correct = Number(u.questions_correct || 0);
                const accuracy = answered > 0 ? (correct / answered) * 100 : 0;
                const points = Number(u.total_points || 0);
                html += '<div class="lb-row">' +
                    '<div class="lb-col-rank">' + rankBadge(i + 1) + '</div>' +
                    '<div class="lb-col-user" style="font-weight: 700;">' + escapeHtml(u.display_name || u.username || 'User') + verifiedBadge(isVerified(u.verification_status)) + '</div>' +
                    '<div class="lb-col-stat">' + answered + '</div>' +
                    '<div class="lb-col-stat">' + accuracy.toFixed(1) + '%</div>' +
                    '<div class="lb-col-total" style="color: var(--neon-gold); font-weight: 900; font-size: 18px;">' + points.toLocaleString() + '</div>' +
                    '</div>';
            });

            html += '</div></div>';
            body.innerHTML = sorted.length ? html : emptyState();
            return;
        }

        if (!leaderboardData) return;

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
        if (!body) return;

        if (backendLeaderboardState) {
            const sorted = backendLeaderboardState.polls.slice();
            let html = '<div class="leaderboard-table"><div class="lb-table-header">' +
                '<div class="lb-col-rank">Rank</div>' +
                '<div class="lb-col-user">Predictor</div>' +
                '<div class="lb-col-stat">Correct</div>' +
                '<div class="lb-col-stat">Total</div>' +
                '<div class="lb-col-total">Accuracy</div>' +
                '</div><div class="lb-table-body">';

            sorted.forEach(function(u, i) {
                const correct = Number(u.polls_correct || 0);
                const total = Number(u.polls_voted || 0);
                const accuracy = total > 0 ? (correct / total) * 100 : 0;
                const accColor = accuracy >= 65 ? 'var(--neon-green)' : accuracy >= 55 ? 'var(--neon-cyan)' : 'var(--text-secondary)';
                html += '<div class="lb-row">' +
                    '<div class="lb-col-rank">' + rankBadge(i + 1) + '</div>' +
                    '<div class="lb-col-user" style="font-weight: 700;">' + escapeHtml(u.display_name || u.username || 'User') + verifiedBadge(isVerified(u.verification_status)) + '</div>' +
                    '<div class="lb-col-stat">' + correct + '</div>' +
                    '<div class="lb-col-stat">' + total + '</div>' +
                    '<div class="lb-col-total" style="color:' + accColor + '; font-weight: 900; font-size: 18px;">' + accuracy.toFixed(1) + '%</div>' +
                    '</div>';
            });

            html += '</div></div>';
            body.innerHTML = sorted.length ? html : emptyState();
            return;
        }

        if (!leaderboardData) return;

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
        if (!body) return;

        if (backendLeaderboardState) {
            const sorted = backendLeaderboardState.cappers.slice().sort(function(a, b) {
                return Number(b.net_units || 0) - Number(a.net_units || 0);
            });

            let html = '<div class="leaderboard-table"><div class="lb-table-header">' +
                '<div class="lb-col-rank">Rank</div>' +
                '<div class="lb-col-user">Bettor</div>' +
                '<div class="lb-col-stat">ROI</div>' +
                '<div class="lb-col-stat">Record</div>' +
                '<div class="lb-col-total">Units Won</div>' +
                '</div><div class="lb-table-body">';

            sorted.forEach(function(u, i) {
                const roi = Number(u.roi || 0);
                const units = Number(u.net_units || 0);
                const wins = Number(u.wins || 0);
                const losses = Number(u.losses || 0);
                const pushes = Number(u.pushes || 0);
                const roiColor = roi > 10 ? 'var(--neon-green)' : roi > 0 ? 'var(--neon-cyan)' : 'var(--neon-red)';
                const unitsColor = units > 0 ? 'var(--neon-green)' : units < 0 ? 'var(--neon-red)' : 'var(--text-secondary)';
                html += '<div class="lb-row">' +
                    '<div class="lb-col-rank">' + rankBadge(i + 1) + '</div>' +
                    '<div class="lb-col-user" style="font-weight: 700;">' + escapeHtml(u.display_name || u.username || 'User') + verifiedBadge(isVerified(u.verification_status)) + '</div>' +
                    '<div class="lb-col-stat" style="color:' + roiColor + '; font-weight: 700;">' + (roi > 0 ? '+' : '') + roi.toFixed(1) + '%</div>' +
                    '<div class="lb-col-stat">' + wins + '-' + losses + '-' + pushes + '</div>' +
                    '<div class="lb-col-total" style="color:' + unitsColor + '; font-weight: 900; font-size: 18px;">' + (units > 0 ? '+' : '') + units.toFixed(1) + 'u</div>' +
                    '</div>';
            });

            html += '</div></div>';
            body.innerHTML = sorted.length ? html : emptyState();
            return;
        }

        if (!leaderboardData) return;

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
        const count = backendLeaderboardState
            ? backendLeaderboardState.cappers.length
            : (leaderboardData && leaderboardData.users ? leaderboardData.users.length : 0);
        console.log('[Leaderboard] Rendered ' + count + ' users across all boards');
    }

    function combinePointsLeaderboard() {
        const map = new Map();

        backendLeaderboardState.trivia.forEach(function(entry) {
            const key = entry.username || ('user_' + entry.user_id);
            map.set(key, {
                display_name: entry.display_name || entry.username || 'User',
                verified: isVerified(entry.verification_status),
                trivia_points: Number(entry.total_points || 0),
                poll_points: 0,
                poll_correct: 0,
                poll_total: 0
            });
        });

        backendLeaderboardState.polls.forEach(function(entry) {
            const key = entry.username || ('user_' + entry.user_id);
            const current = map.get(key) || {
                display_name: entry.display_name || entry.username || 'User',
                verified: isVerified(entry.verification_status),
                trivia_points: 0,
                poll_points: 0,
                poll_correct: 0,
                poll_total: 0
            };
            current.poll_points = Number(entry.total_points || 0);
            current.poll_correct = Number(entry.polls_correct || 0);
            current.poll_total = Number(entry.polls_voted || 0);
            map.set(key, current);
        });

        return Array.from(map.values())
            .map(function(entry) {
                entry.total_points = entry.trivia_points + entry.poll_points;
                return entry;
            })
            .sort(function(a, b) {
                return b.total_points - a.total_points;
            })
            .slice(0, 25);
    }

    function isVerified(status) {
        return ['verified', 'trusted', 'premium'].includes(String(status || '').toLowerCase());
    }

    function escapeHtml(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function renderErrorState() {
        ['pointsLeaderboardBody', 'picksLeaderboardBody', 'triviaLeaderboardBody', 'pollsLeaderboardBody', 'unitsLeaderboardBody']
            .forEach(function(id) {
                const el = document.getElementById(id);
                if (el) {
                    el.innerHTML = '<div style="text-align:center; padding: 28px 16px; color: #6c7380;">Leaderboard data is temporarily unavailable.</div>';
                }
            });
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
