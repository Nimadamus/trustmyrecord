(function(root) {
    const STATUS_MAP = {
        win: 'won',
        won: 'won',
        loss: 'lost',
        lost: 'lost',
        push: 'push',
        pushed: 'push',
        void: 'void',
        voided: 'void',
        cancel: 'cancelled',
        canceled: 'cancelled',
        cancelled: 'cancelled',
        pending: 'pending'
    };

    function normalizePickStatus(status) {
        const key = String(status || '').trim().toLowerCase();
        return STATUS_MAP[key] || key;
    }

    function pickTimestamp(pick) {
        const candidates = [
            pick && pick.graded_at,
            pick && pick.grade_verified_at,
            pick && pick.finalized_at,
            pick && pick.event_completed_at,
            pick && pick.completed_at,
            pick && pick.game_final_at,
            pick && pick.analytics_settled_at,
            pick && pick.settled_at,
            pick && pick.commence_time,
            pick && pick.event_start_time,
            pick && pick.start_time,
            pick && pick.game && pick.game.commence_time,
            pick && pick.game && pick.game.start_time,
            pick && pick.locked_at,
            pick && pick.created_at
        ];
        for (const value of candidates) {
            const time = new Date(value || 0).getTime();
            if (Number.isFinite(time) && time > 0) return time;
        }
        return 0;
    }

    function pickId(pick, index) {
        return pick && (pick.id || pick.pick_id || pick.uuid || pick._id) || index;
    }

    function normalizeStreakPick(pick, index) {
        return {
            original: pick || {},
            id: pickId(pick, index),
            status: normalizePickStatus(pick && (pick.status || pick.result || pick.pick_result || pick.outcome)),
            timestamp: pickTimestamp(pick),
            index: index
        };
    }

    function compareChronological(a, b) {
        if (a.timestamp !== b.timestamp) return a.timestamp - b.timestamp;
        return a.index - b.index;
    }

    function calculateStreaks(picks, options) {
        const opts = options || {};
        const normalized = Array.isArray(picks) ? picks.map(normalizeStreakPick) : [];
        const ordered = normalized
            .filter(function(pick) {
                return pick.status === 'won' || pick.status === 'lost' || pick.status === 'push';
            })
            .sort(compareChronological);
        ordered.forEach(function(pick, index) {
            pick.indexInOrdered = index;
        });

        let longestWinStreak = 0;
        let longestLossStreak = 0;
        let winRun = 0;
        let lossRun = 0;

        ordered.forEach(function(pick) {
            if (pick.status === 'won') {
                winRun += 1;
                lossRun = 0;
                longestWinStreak = Math.max(longestWinStreak, winRun);
            } else if (pick.status === 'lost') {
                lossRun += 1;
                winRun = 0;
                longestLossStreak = Math.max(longestLossStreak, lossRun);
            } else {
                // Pushes are neutral for W/L streaks.
            }
        });

        let currentStreak = 0;
        let currentType = 'none';
        let latest = null;
        for (let i = ordered.length - 1; i >= 0; i -= 1) {
            if (ordered[i].status === 'won' || ordered[i].status === 'lost') {
                latest = ordered[i];
                break;
            }
        }
        if (latest) {
            currentType = latest.status === 'won' ? 'win' : 'loss';
            currentStreak = latest.status === 'won' ? 1 : -1;
            for (let i = latest.indexInOrdered - 1; i >= 0; i -= 1) {
                const status = ordered[i].status;
                if (status === 'push') continue;
                if (status !== latest.status) break;
                currentStreak += latest.status === 'won' ? 1 : -1;
            }
        }

        const sequence = ordered.map(function(pick) {
            return {
                id: pick.id,
                status: pick.status,
                label: pick.status === 'won' ? 'W' : pick.status === 'lost' ? 'L' : 'P',
                timestamp: pick.timestamp ? new Date(pick.timestamp).toISOString() : null,
                selection: pick.original.selection || pick.original.pick || pick.original.market || ''
            };
        });

        const result = {
            currentStreak: currentStreak,
            longestWinStreak: longestWinStreak,
            longestLossStreak: longestLossStreak,
            currentType: currentType,
            gradedCount: ordered.length,
            sequence: sequence
        };

        if (opts.debug && root && root.console) {
            root.console.table(sequence);
            root.console.info('[TMR Streaks]', result);
        }

        return result;
    }

    function formatStreak(value) {
        const streak = Number(value) || 0;
        if (streak > 0) return streak + 'W';
        if (streak < 0) return Math.abs(streak) + 'L';
        return '0';
    }

    async function debugStreakSequence(username) {
        if (!root.api || typeof root.api.request !== 'function') {
            throw new Error('TMR API client is not available on this page.');
        }
        const user = String(username || new URLSearchParams(root.location && root.location.search || '').get('user') || '').trim();
        if (!user) throw new Error('Pass a username or open a profile URL with ?user=username.');

        let offset = 0;
        const picks = [];
        while (offset < 1000) {
            const data = await root.api.request('/picks?username=' + encodeURIComponent(user) + '&limit=100&offset=' + offset);
            const batch = Array.isArray(data && data.picks) ? data.picks : [];
            picks.push.apply(picks, batch);
            if (batch.length < 100) break;
            offset += 100;
        }

        const streaks = calculateStreaks(picks, { debug: true });
        root.console.info('[TMR Streak Audit] ' + user, {
            current: formatStreak(streaks.currentStreak),
            longestWin: streaks.longestWinStreak + 'W',
            longestLoss: streaks.longestLossStreak + 'L',
            gradedSequence: streaks.sequence.map(function(item) { return item.label; }).join('')
        });
        return streaks;
    }

    const api = {
        normalizePickStatus: normalizePickStatus,
        calculateStreaks: calculateStreaks,
        formatStreak: formatStreak,
        debugStreakSequence: debugStreakSequence
    };

    root.TMR = root.TMR || {};
    Object.assign(root.TMR, api);
    root.calculateTmrStreaks = calculateStreaks;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof window !== 'undefined' ? window : globalThis);
