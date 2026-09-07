/* THE client streak, and the only one on the site.
 *
 * This is a port of services/canonicalStreak.js in the backend, rule for rule,
 * so a page that falls back to computing a member streak from their pick list
 * prints the same number the server would have sent. Keep the two in step:
 *
 *   order   settlement time, clamped into [first pitch, first pitch + 6h] so a
 *           late regrade cannot teleport an old game to the top
 *   group   one event (league, first pitch, both teams) and one wager period is
 *           ONE settlement; the same real game under two feed ids is still one
 *   dedupe  the same wager inside a settlement counts once, whatever price each
 *           copy was taken at
 *   runs    a settlement holding both a win and a loss ends the run; a push is
 *           neutral; N counts deduplicated picks, so four winners on one game
 *           is W4
 */
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

    // A result graded more than this long after first pitch is a backfill, not a
    // settlement -- same constant, same reason, as the backend.
    const GRADING_LAG_CLAMP_MS = 6 * 3600 * 1000;

    function timeMs(value) {
        if (value == null || value === '') return null;
        const time = new Date(value).getTime();
        return Number.isFinite(time) && time > 0 ? time : null;
    }

    function firstTime(values) {
        for (const value of values) {
            const time = timeMs(value);
            if (time != null) return time;
        }
        return null;
    }

    /* The canonical order key: when the game ENDED, as closely as the data can
       say. graded_at is an excellent proxy while grading is timely, so it is
       used, clamped into the six-hour window after first pitch so a month-late
       backfill stays in its own slot instead of jumping to the top of a run. */
    function pickTimestamp(pick) {
        const start = firstTime([
            pick && pick.commence_time,
            pick && pick.event_start_time,
            pick && pick.start_time,
            pick && pick.game && pick.game.commence_time,
            pick && pick.game && pick.game.start_time,
            pick && pick.locked_at,
            pick && pick.graded_at,
            pick && pick.created_at
        ]);
        const settled = firstTime([
            pick && pick.graded_at,
            pick && pick.grade_verified_at,
            pick && pick.finalized_at,
            pick && pick.event_completed_at,
            pick && pick.completed_at,
            pick && pick.game_final_at,
            pick && pick.analytics_settled_at,
            pick && pick.settled_at
        ]);
        if (start == null) return settled == null ? 0 : settled;
        if (settled == null) return start;
        return Math.max(start, Math.min(settled, start + GRADING_LAG_CLAMP_MS));
    }

    const PERIOD_FALLBACK = 'full_game';
    const PERIOD_PREFIXES = [
        ['second_half_', 'second_half'],
        ['first_half_', 'first_half'],
        ['f5_', 'first_five'],
        ['period_1_', 'period_1'],
        ['period_2_', 'period_2'],
        ['period_3_', 'period_3'],
        ['period_4_', 'period_4'],
        ['tennis_set1_', 'set_1'],
        ['tennis_set2_', 'set_2'],
        ['tennis_set3_', 'set_3']
    ];

    function lower(value) {
        return value == null ? '' : String(value).trim().toLowerCase();
    }

    function numeric(value) {
        if (value == null || value === '') return '';
        const n = Number(value);
        return Number.isFinite(n) ? String(n) : lower(value);
    }

    // picks.wager_period is generated from market_type on the server; derive it
    // the same way when a projection did not carry the column.
    function wagerPeriod(pick) {
        const declared = lower(pick && pick.wager_period);
        if (declared) return declared;
        const market = lower(pick && pick.market_type);
        if (market === 'first_inning_totals') return 'first_inning';
        for (const entry of PERIOD_PREFIXES) {
            if (market.indexOf(entry[0]) === 0) return entry[1];
        }
        return PERIOD_FALLBACK;
    }

    /* Which segment of a fixture settles first, for the one case pick order used
       to decide: two settlements of the SAME game whose keys tie because the
       grader wrote them in one loop. A first-five leg is decided in the fifth
       inning and the full game at the end of it. Mirrors PERIOD_RANK in
       services/canonicalStreak.js. */
    const PERIOD_RANK = {
        first_inning: 10, period_1: 10, set_1: 10,
        first_five: 20, first_half: 20, period_2: 20, set_2: 20,
        period_3: 30, set_3: 30,
        second_half: 40, period_4: 40,
        full_game: 100
    };

    function periodRank(period) {
        return PERIOD_RANK[period] == null ? 100 : PERIOD_RANK[period];
    }

    function gameOf(pick) {
        return (pick && pick.game) || {};
    }

    /* The settlement a pick belongs to. Keyed on the matchup rather than the
       game id, because one real fixture can arrive under two feed ids and would
       otherwise read as two separate results. A doubleheader keeps its own slot
       because first pitch is part of the key. */
    function settlementGroupKey(pick, index) {
        const game = gameOf(pick);
        const period = wagerPeriod(pick);
        const home = lower(pick && pick.home_team) || lower(game.home_team);
        const away = lower(pick && pick.away_team) || lower(game.away_team);
        const start = firstTime([
            pick && pick.commence_time,
            game.commence_time,
            pick && pick.event_start_time,
            pick && pick.start_time
        ]);
        const sport = lower(pick && pick.sport_key) || lower(game.sport_key);
        if (home && away && start != null) {
            return 'event:' + sport + '|' + start + '|' + away + '@' + home + '|' + period;
        }
        const gameId = lower((pick && pick.game_id) || game.id);
        if (gameId) return 'game:' + gameId + '|' + period;
        const id = pick && (pick.id || pick.pick_id);
        return id ? 'pick:' + id : 'pick:index:' + index;
    }

    /* The identity of the BET. Price is deliberately not part of it: a second
       ticket on the same side at a different number is the same outcome. */
    function wagerKey(pick, index) {
        return [
            settlementGroupKey(pick, index),
            lower(pick && pick.market_type),
            lower(pick && pick.player_name),
            lower(pick && pick.selection),
            numeric(pick && pick.line_snapshot)
        ].join('|');
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
            groupKey: settlementGroupKey(pick, index),
            wagerKey: wagerKey(pick, index),
            rank: periodRank(wagerPeriod(pick)),
            index: index
        };
    }

    /* Collapse picks into settlements, oldest first. Each group carries its
       deduplicated win and loss counts and sits at the newest order key any of
       its rows has. A group with only pushes is dropped, which is what keeps a
       push neutral. */
    function buildSettlementGroups(ordered) {
        const map = new Map();
        for (const pick of ordered) {
            let group = map.get(pick.groupKey);
            if (!group) {
                group = {
                    key: pick.groupKey, timestamp: null, index: pick.index,
                    rank: pick.rank, wins: [], losses: []
                };
                map.set(pick.groupKey, group);
            }
            const bucket = pick.status === 'won' ? group.wins : pick.status === 'lost' ? group.losses : null;
            /* A PUSH DOES NOT TIME THE GROUP. It is not a result, so it cannot
               move when the group settled - and the server's SQL never sees one,
               because it selects only won/lost rows. */
            if (bucket) {
                if (group.timestamp == null || pick.timestamp > group.timestamp) group.timestamp = pick.timestamp;
                if (bucket.indexOf(pick.wagerKey) === -1) bucket.push(pick.wagerKey);
            }
        }
        const groups = [];
        map.forEach(function(group) {
            const wins = group.wins.length;
            const losses = group.losses.length;
            if (!wins && !losses) return;
            groups.push({
                key: group.key,
                timestamp: group.timestamp,
                index: group.index,
                rank: group.rank,
                wins: wins,
                losses: losses,
                status: wins && losses ? 'mixed' : (wins ? 'won' : 'lost'),
                count: wins && losses ? 0 : (wins || losses)
            });
        });
        return groups.sort(function(a, b) {
            if (a.timestamp !== b.timestamp) return a.timestamp - b.timestamp;
            if (a.rank !== b.rank) return a.rank - b.rank;
            return a.index - b.index;
        });
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
                return pick.status === 'won' || pick.status === 'lost' || pick.status === 'push' || pick.status === 'pushed';
            })
            .sort(compareChronological);
        ordered.forEach(function(pick, index) {
            pick.indexInOrdered = index;
        });

        const groups = buildSettlementGroups(ordered);

        let longestWinStreak = 0;
        let longestLossStreak = 0;
        let runType = null;
        let runLength = 0;

        groups.forEach(function(group) {
            // A game that produced both a win and a loss settled them together.
            // Nothing inside a settlement is after anything else inside it, so
            // a mixed one ends whatever run was running.
            if (group.status === 'mixed') {
                runType = null;
                runLength = 0;
                return;
            }
            if (runType === group.status) runLength += group.count;
            else { runType = group.status; runLength = group.count; }
            if (group.status === 'won') longestWinStreak = Math.max(longestWinStreak, runLength);
            else longestLossStreak = Math.max(longestLossStreak, runLength);
        });

        const currentStreak = runType === 'won' ? runLength : runType === 'lost' ? -runLength : 0;
        const currentType = runType === 'won' ? 'win' : runType === 'lost' ? 'loss' : 'none';

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
            settlements: groups.length,
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
            const data = await root.api.request('/picks' + '?username=' + encodeURIComponent(user) + '&limit=100&offset=' + offset);
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
        settlementGroupKey: settlementGroupKey,
        wagerKey: wagerKey,
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
