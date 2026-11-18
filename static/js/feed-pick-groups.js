/* FEED_GROUPS_20261116 - presentation-only grouping for the community feed.
 *
 * 1. Pick sessions: a member who posts several open picks in one sitting gets ONE
 *    card ("KenBcapper posted 15 new picks", sport breakdown, the first picks
 *    shown, "View all 15 picks" for the rest). Every pick stays a row of its own
 *    with Tail, Fade, Add to my slip and Share, wired to the same handlers as the
 *    single open pick card (feed-open-picks.js).
 * 2. Results roll-up: one grading run that updates several members' records at
 *    once becomes ONE "Results are in" card. Each member keeps a row, and the full
 *    record cards (likes, comments, share) open under "View all".
 *
 * Nothing here changes data. It wraps aggregateFeedItems (after the existing
 * per-day pick grouping), renderFeedItem and focusSharedFeedItem, and the reader
 * can switch grouping off ("Show every update") at any time.
 *
 * Loaded after feed-open-picks.js.
 */
(function () {
    'use strict';
    if (window.TMRFeedGroups) return;

    // FEED_BATCH_20261117: one submission = picks locked within minutes of each
    // other. 90 min chained separate sittings of one member into a single card.
    var SESSION_GAP_MS = 30 * 60 * 1000;   // picks closer together than this are one sitting
    var MIN_SESSION = 2;                   // 2+ open picks from one member = one card
    var RESULTS_WINDOW_MS = 60 * 60 * 1000; // record updates inside one grading hour
    var MIN_RESULTS = 2;                   // 2+ members graded together = one card
    var PREVIEW = 3;                       // rows shown before "View all"
    var MODE_KEY = 'tmr_feed_grouping';
    var SPORT_CODE = {
        americanfootball_nfl: 'NFL', americanfootball_ncaaf: 'NCAAF', basketball_nba: 'NBA',
        basketball_ncaab: 'NCAAB', basketball_wncaab: 'NCAAW', basketball_wnba: 'WNBA',
        baseball_mlb: 'MLB', icehockey_nhl: 'NHL', soccer_epl: 'EPL', mma_mixed_martial_arts: 'MMA'
    };

    var grouping = true;
    try { grouping = localStorage.getItem(MODE_KEY) !== 'off'; } catch (x) { grouping = true; }
    var expanded = {}; // group id -> true; survives re-renders and Load More

    function e(v) {
        return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }
    function t(item) {
        var v = new Date(item.graded_at || item.created_at || item.locked_at || 0).getTime();
        return isFinite(v) ? v : 0;
    }
    function uname(item) {
        return String(item.username || item.display_name || item.user_id || '');
    }
    function league(item) {
        return String(item.pick_league || SPORT_CODE[String(item.pick_sport_key || item.sport || '')] || 'Other');
    }
    function plural(n, w, p) { return n + ' ' + (n === 1 ? w : (p || w + 's')); }
    function ago(ts) {
        return (typeof window.timeAgo === 'function') ? window.timeAgo(new Date(ts).toISOString()) : '';
    }
    function sig(parts) {
        var s = parts.join('|'), h = 0;
        for (var i = 0; i < s.length; i++) { h = ((h << 5) - h + s.charCodeAt(i)) | 0; }
        return (h >>> 0).toString(36) + '.' + parts.length;
    }
    function isOpenPick(i) { return i && i.item_type === 'open_pick' && !i._group; }
    function isResult(i) {
        if (!i || i._group || i.item_type !== 'pick') return false;
        var s = String(i.status || '').toLowerCase();
        return s !== 'pending' && s !== 'locked' && !!uname(i);
    }

    // ---------------- grouping ----------------
    function groupOpenPicks(items) {
        var byUser = {};
        items.forEach(function (i) {
            if (!isOpenPick(i)) return;
            var k = uname(i).toLowerCase();
            (byUser[k] = byUser[k] || []).push(i);
        });
        var absorbed = new Set();
        var groups = [];
        Object.keys(byUser).forEach(function (k) {
            var list = byUser[k].slice().sort(function (a, b) { return t(b) - t(a); });
            var run = [];
            var flush = function () {
                if (run.length >= MIN_SESSION) {
                    run.forEach(function (m) { absorbed.add(m); });
                    groups.push(makeOpenGroup(run));
                }
                run = [];
            };
            list.forEach(function (p) {
                if (run.length && t(run[run.length - 1]) - t(p) > SESSION_GAP_MS) flush();
                run.push(p);
            });
            flush();
        });
        if (!groups.length) return items;
        return items.filter(function (i) { return !absorbed.has(i); }).concat(groups);
    }

    function makeOpenGroup(members) {
        var newest = members[0];
        var oldest = members[members.length - 1];
        var ids = members.map(function (m) { return String(m.item_id || ('openpick:' + m.pick_id)); });
        var sum = function (k) { return members.reduce(function (s, m) { return s + (Number(m[k]) || 0); }, 0); };
        return Object.assign({}, newest, {
            _group: 'open_picks',
            item_type: 'open_pick',
            post_type: 'open_pick',
            item_id: 'opgroup:' + uname(newest) + ':' + (newest.pick_id || ids[0]),
            pick_id: null,
            pick_count: members.length,
            created_at: newest.created_at,
            _first_at: oldest.created_at,
            _members: members,
            _member_ids: ids,
            _sig: sig(members.map(function (m) {
                return m.pick_id + ':' + (m.tails_count || 0) + ':' + (m.fades_count || 0) + ':' + (m.viewer_reaction || '') + ':' + (m.pick_started ? 1 : 0);
            })),
            likes_count: sum('likes_count'),
            comments_count: sum('comments_count')
        });
    }

    function groupResults(items) {
        var results = items.filter(isResult).sort(function (a, b) { return t(b) - t(a); });
        if (results.length < MIN_RESULTS) return items;
        var absorbed = new Set();
        var groups = [];
        var run = [];
        var flush = function () {
            var users = new Set(run.map(function (m) { return uname(m).toLowerCase(); }));
            if (run.length >= MIN_RESULTS && users.size >= MIN_RESULTS) {
                run.forEach(function (m) { absorbed.add(m); });
                groups.push(makeResultsGroup(run));
            }
            run = [];
        };
        results.forEach(function (r) {
            if (run.length && t(run[0]) - t(r) > RESULTS_WINDOW_MS) flush();
            run.push(r);
        });
        flush();
        if (!groups.length) return items;
        return items.filter(function (i) { return !absorbed.has(i); }).concat(groups);
    }

    function makeResultsGroup(members) {
        var newest = members[0];
        var ids = members.map(function (m) { return String(m.item_id || m.pick_id); });
        return {
            _group: 'results',
            item_type: 'pick',
            post_type: 'pick',
            status: 'graded',
            item_id: 'results:' + ids[0],
            created_at: newest.graded_at || newest.created_at,
            graded_at: newest.graded_at || newest.created_at,
            pick_count: members.reduce(function (s, m) { return s + (Number(m.pick_count) || 1); }, 0),
            likes_count: members.reduce(function (s, m) { return s + (Number(m.likes_count) || 0); }, 0),
            comments_count: members.reduce(function (s, m) { return s + (Number(m.comments_count) || 0); }, 0),
            _members: members,
            _member_ids: ids,
            _sig: sig(members.map(function (m) {
                return (m.item_id || m.pick_id) + ':' + (m.pick_count || 1) + ':' + (m.wins_count || 0) + '-' + (m.losses_count || 0) + '-' + (m.pushes_count || 0) + ':' + (m.batch_net_units || '');
            }))
        };
    }

    // FEED_GROUPS_20261116b: a member's "first official pick" milestone and the
    // pick itself are one event. The milestone rides on the pick card as a ribbon
    // (with its Congrats) instead of being a second card.
    var FIRST_PICK_WINDOW_MS = 15 * 60 * 1000;
    function isMilestone(i) { return i && !i._group && i.item_type === 'milestone' && i.post_type !== 'joined_summary' && !!uname(i); }
    function foldFirstPicks(items) {
        var firsts = items.filter(function (i) { return isMilestone(i) && i.post_type === 'first_pick'; });
        if (!firsts.length) return items;
        var drop = new Set();
        var out = items.slice();
        firsts.forEach(function (ms) {
            var u = uname(ms).toLowerCase();
            var best = -1, bestGap = Infinity;
            out.forEach(function (i, idx) {
                if (!i || i.item_type !== 'open_pick' || uname(i).toLowerCase() !== u || i._first_pick_ms) return;
                // a first pick is the OLDEST pick of its sitting, so a group is
                // measured by its closest member, not by its newest one
                var gap = (i._members || [i]).reduce(function (g, m) { return Math.min(g, Math.abs(t(m) - t(ms))); }, Infinity);
                if (gap <= FIRST_PICK_WINDOW_MS && gap < bestGap) { best = idx; bestGap = gap; }
            });
            if (best < 0) return;
            var host = out[best];
            var ids = (host._member_ids || [String(host.item_id || ('openpick:' + host.pick_id))]).concat([String(ms.item_id)]);
            out[best] = Object.assign({}, host, { _first_pick_ms: ms, _member_ids: ids });
            drop.add(ms);
        });
        return out.filter(function (i) { return !drop.has(i); });
    }

    // Milestones announced together (one grading run) become one card; every
    // milestone keeps its own Congrats.
    var MILESTONE_WINDOW_MS = 30 * 60 * 1000;
    function streakLen(m) {
        if (String(m.post_type || '') !== 'win_streak') return null;
        var x = /(\d+)-pick winning streak/i.exec(String(m.content || ''));
        return x ? Number(x[1]) : null;
    }
    var MIN_MILESTONES = 2;
    var SAME_MEMBER_MS_WINDOW = 24 * 60 * 60 * 1000;
    function groupMilestones(items) {
        // FEED_JOINED_STANDALONE_20261116: a welcome card carries its own comment
        // thread (the official welcome), which a grouped row has no room for.
        var ms = items.filter(function (i) { return isMilestone(i) && i.post_type !== 'joined'; }).sort(function (a, b) { return t(b) - t(a); });
        if (ms.length < MIN_MILESTONES) return items;
        var absorbed = new Set();
        var groups = [];
        var run = [];
        var flush = function () {
            if (run.length >= MIN_MILESTONES) {
                run.forEach(function (m) { absorbed.add(m); });
                var ids = run.map(function (m) { return String(m.item_id); });
                // FEED_MS_STREAK_TOP_20261116: a 5-pick and a 7-pick streak by the same
                // member in one card is the same news twice; show the longest one.
                var top = {};
                run.forEach(function (m) {
                    var n = streakLen(m);
                    if (n == null) return;
                    var k = uname(m).toLowerCase();
                    if (!top[k] || n > top[k].n) top[k] = { n: n, m: m };
                });
                var shown = run.filter(function (m) {
                    var n = streakLen(m);
                    return n == null || top[uname(m).toLowerCase()].m === m;
                });
                if (shown.length < MIN_MILESTONES) {
                    // one milestone left: it stands as its own card
                    shown.forEach(function (m) { absorbed.delete(m); });
                    run = [];
                    return;
                }
                run = shown;
                groups.push({
                    _group: 'milestones', item_type: 'milestone', post_type: 'milestone_group',
                    item_id: 'msgroup:' + ids[0], created_at: run[0].created_at,
                    likes_count: run.reduce(function (s, m) { return s + (Number(m.likes_count) || 0); }, 0),
                    comments_count: run.reduce(function (s, m) { return s + (Number(m.comments_count) || 0); }, 0),
                    _members: run, _member_ids: ids,
                    _sig: sig(run.map(function (m) { return m.item_id + ':' + (m.likes_count || 0) + ':' + (m.congratsed_by_user ? 1 : 0); }))
                });
            }
            run = [];
        };
        ms.forEach(function (m) {
            if (run.length && t(run[0]) - t(m) > MILESTONE_WINDOW_MS) flush();
            run.push(m);
        });
        flush();
        // FEED_MS_SAME_MEMBER_20261116: one member's milestones on the same day
        // (100 picks, then a 7-pick streak, then 250 picks) were three cards.
        var byUser = {};
        ms.forEach(function (m) {
            if (absorbed.has(m)) return;
            var k = uname(m).toLowerCase();
            (byUser[k] = byUser[k] || []).push(m);
        });
        Object.keys(byUser).forEach(function (k) {
            byUser[k].forEach(function (m) {
                if (run.length && t(run[0]) - t(m) > SAME_MEMBER_MS_WINDOW) flush();
                run.push(m);
            });
            flush();
        });
        if (!groups.length && !absorbed.size) return items;
        return items.filter(function (i) { return !absorbed.has(i); }).concat(groups);
    }

    function regroup(items) {
        if (!grouping || !Array.isArray(items)) return items;
        try { return groupMilestones(foldFirstPicks(groupResults(groupOpenPicks(items)))); } catch (x) { return items; }
    }

    // ---------------- rendering ----------------
    function fmtOdds(o) {
        var n = Number(o);
        if (!isFinite(n) || n === 0) return '';
        return (n > 0 ? '+' : '') + Math.round(n);
    }
    function fmtUnits(u) {
        var n = Number(u);
        return isFinite(n) && n > 0 ? (Math.round(n * 100) / 100) + 'u' : '';
    }
    function fmtStart(ts) {
        if (!ts) return '';
        var d = new Date(ts);
        if (isNaN(d.getTime())) return '';
        // FEED_START_DATE: a bare weekday is only unambiguous inside the coming
        // 6 days; next week's "Mon" read as tonight's game.
        var ahead = d.getTime() - Date.now();
        var opts = (ahead > -12 * 3600000 && ahead < 6 * 86400000)
            ? { weekday: 'short', hour: 'numeric', minute: '2-digit' }
            : { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' };
        return d.toLocaleString([], opts);
    }
    function started(item) {
        if (item.pick_started === true) return true;
        var ts = item.pick_game_time ? new Date(item.pick_game_time).getTime() : NaN;
        return isFinite(ts) && ts <= Date.now();
    }
    function reactBtn(kind, item) {
        var on = item.viewer_reaction === kind;
        var count = Number(kind === 'tail' ? item.tails_count : item.fades_count) || 0;
        var dead = started(item) || item.is_own_pick;
        return '<button type="button" class="fpg-act fop-react fop-' + kind + (on ? ' is-on' : '') + '"' +
            ' data-fop-react="' + kind + '" aria-pressed="' + on + '"' + (dead ? ' disabled' : '') + ' title="' + REACT_NOTE + '"' +
            ' aria-label="' + (kind === 'tail' ? 'Tail' : 'Fade') + ' ' + e(item.pick_text || item.pick_selection || 'this pick') + '">' +
            '<i class="fas ' + (kind === 'tail' ? 'fa-arrow-trend-up' : 'fa-arrow-trend-down') + '"></i> ' +
            (kind === 'tail' ? 'Tail' : 'Fade') + ' <span>' + count + '</span></button>';
    }

    // FEED_BATCH_20261117: the opponent, from the picked side. "Toronto Raptors ML"
    // with Knicks @ Raptors reads "vs New York Knicks"; totals and props keep the matchup.
    function opponent(item) {
        var away = String(item.pick_away_team || ''), home = String(item.pick_home_team || '');
        if (!away || !home) return '';
        var sel = String(item.pick_selection || item.pick_text || '').toLowerCase();
        var isAway = sel.indexOf(away.toLowerCase()) === 0, isHome = sel.indexOf(home.toLowerCase()) === 0;
        if (isHome && !isAway) return 'vs ' + away;
        if (isAway && !isHome) return '@ ' + home;
        return away + ' @ ' + home;
    }

    function openRow(item) {
        var id = String(item.item_id || ('openpick:' + item.pick_id));
        var op = window.TMRFeedOpenPicks;
        if (op && op._cards) op._cards[id] = item; // Tail / Fade / slip handlers read this
        var h = (op && typeof op._handoff === 'function') ? op._handoff(item) : null;
        var isStarted = started(item);
        var odds = fmtOdds(item.pick_odds);
        var units = fmtUnits(item.pick_units);
        var opp = opponent(item);
        var when = fmtStart(item.pick_game_time);
        var vt = Number(item.verified_tails_count) || 0, vf = Number(item.verified_fades_count) || 0;
        return '<div class="fpg-row fop-card" data-id="' + e(id) + '" data-fop-pick="' + e(item.pick_id) + '">' +
            '<div class="fpg-row-main">' +
                '<span class="fpg-lg">' + e(league(item)) + '</span>' +
                '<div class="fpg-row-text">' +
                    '<b class="fpg-sel">' + e(item.pick_text || item.pick_selection || 'Pick') + '</b>' +
                    '<span class="fpg-mkt">' + (item.pick_market_label ? '<span>' + e(item.pick_market_label) + '</span>' : '') +
                        (odds ? '<b class="fpg-odds">' + e(odds) + '</b>' : '') + '</span>' +
                    ((opp || when) ? '<span class="fpg-game">' + (opp ? '<span>' + e(opp) + '</span> ' : '') + (when ? '<span>' + e(when) + '</span>' : '') + '</span>' : '') +
                '</div>' +
                '<div class="fpg-row-side">' +
                    (units ? '<b class="fpg-u">' + e(units) + '</b>' : '') +
                    '<b class="fv-chip fv-chip--' + (isStarted ? 'graded' : 'pending') + '">' + (isStarted ? 'IN PLAY' : 'OPEN') + '</b>' +
                '</div>' +
            '</div>' +
            '<div class="fpg-row-actions">' +
                reactBtn('tail', item) + reactBtn('fade', item) +
                '<button type="button" class="fpg-act fpg-share" onclick="sharePost(' + e(JSON.stringify(id)) + ')" aria-label="Share this pick"><i class="fas fa-share"></i> Share</button>' +
                (h ? '<button type="button" class="fpg-act fop-slip" data-fop-slip="same"><i class="fas fa-plus"></i> Add to my slip</button>' : '') +
                (h ? '<button type="button" class="fpg-act fop-slip fop-slip--other" data-fop-slip="other">Take ' + e(h.otherLabel) + '</button>' : '') +
            '</div>' +
            ((vt || vf) ? '<p class="fpg-verified"><i class="fas fa-circle-check"></i> ' +
                e([vt ? plural(vt, 'verified pick') + ' with it' : '', vf ? plural(vf, 'verified pick') + ' against it' : ''].filter(Boolean).join(' · ')) + '</p>' : '') +
            '<p class="fop-note" aria-live="polite"></p>' +
        '</div>';
    }

    function toggleBtn(gid, n, label) {
        var open = !!expanded[gid];
        return '<button type="button" class="fpg-toggle" data-fpg-toggle="' + e(gid) + '" aria-expanded="' + open + '">' +
            '<span>' + (open ? openLabel(label) : closedLabel(n, label)) + '</span> <i class="fas fa-chevron-down"></i></button>';
    }
    function openLabel(label) { return label === 'picks' ? 'Collapse Picks' : 'Show fewer';
    }
    // FEED_TOGGLE_LABEL_20261116: "View all 2 record updates" under a card that
    // already lists both names read as nothing new; it opens the full cards.
    function closedLabel(n, label) {
        if (label === 'record updates' && n <= PREVIEW) return 'Show full ' + (n === 1 ? 'update' : 'updates');
        if (label === 'picks') return 'View All ' + n + ' Picks';
        return 'View all ' + n + ' ' + label;
    }

    // FEED_BATCH_20261117: one submission is one compact post. Picks stay
    // collapsed (a one-line peek of the selections) until "View All N Picks";
    // a large batch opens into its own bounded scroll area.
    var SCROLL_AT = 6; // more rows than this scroll inside the card
    function renderOpenGroup(g) {
        var members = g._members;
        var n = members.length;
        var counts = {};
        members.forEach(function (m) { var l = league(m); counts[l] = (counts[l] || 0) + 1; });
        var sports = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a] || (a < b ? -1 : 1); });
        var live = members.filter(started).length;
        var span = Math.max(0, t(members[0]) - t(members[n - 1]));
        var mins = Math.round(span / 60000);
        var when = mins < 2 ? 'Posted together' : 'Posted over ' + mins + ' min';
        var header = (typeof window.renderFeedHeader === 'function')
            ? window.renderFeedHeader(Object.assign({}, members[0], { item_type: 'pick', post_type: 'pick' },
                // FEED_GROUP_SPORT_20261116: the header named the newest pick's sport even
                // when the sitting was 6 NCAAB, 1 NBA and 1 NCAAF.
                sports.length > 1 ? { sport: 'Multi', sport_key: '', league: '', primary_sport: '', pick_league: '' } : {}), '') : '';
        var open = !!expanded[g.item_id];
        // FEED_OPEN_SOONEST: rows run by game start, so tonight's game is not buried
        // under next week's (the order they were posted in said nothing to a reader).
        var gt = function (m) { var v = m.pick_game_time ? new Date(m.pick_game_time).getTime() : NaN; return isFinite(v) ? v : Infinity; };
        var ordered = members.map(function (m, i) { return { m: m, i: i }; })
            .sort(function (a, b) { return (gt(a.m) - gt(b.m)) || (a.i - b.i); })
            .map(function (x) { return x.m; });
        var totalU = members.reduce(function (s, m) { var u = Number(m.pick_units); return s + (isFinite(u) && u > 0 ? u : 0); }, 0);
        var stats = [];
        if (live) stats.push(live + ' in play');
        if (n - live) stats.push((n - live) + ' open');
        if (totalU > 0) stats.push((Math.round(totalU * 100) / 100) + 'u total');
        var name = g.display_name || g.username;
        var what = sports.length === 1 ? plural(n, sports[0] + ' pick') : n + ' picks';
        var peek = '<span>' + ordered.slice(0, 4).map(function (m) { return e(m.pick_text || m.pick_selection || 'Pick'); }).join(' <i aria-hidden="true">·</i> ') + '</span>' +
            (n > 4 ? '<em>+' + (n - 4) + ' more</em>' : '');
        return '<div class="feed-item fpg-card fpg-card--open fpg-batch' + (open ? ' is-open' : '') + (n > SCROLL_AT ? ' fpg-batch--scroll' : '') + '" data-id="' + e(g.item_id) + '" data-type="open_pick_group" data-group-sig="' + e(g._sig) + '">' +
            header +
            firstPickRibbon(g._first_pick_ms) +
            '<div class="fpg-summary">' +
                '<div class="fpg-headline"><span class="fpg-count">' + n + '</span><div><b>' + e(name) + ' posted ' + e(what) + '</b>' +
                    '<small>' + e([when].concat(stats).join(' · ')) + '</small></div></div>' +
                (sports.length > 1 ? '<div class="fpg-sports" aria-label="Sport breakdown">' + sports.map(function (s) {
                    return '<span class="fpg-sport"><b>' + counts[s] + '</b> ' + e(s) + '</span>';
                }).join('') + '</div>' : '') +
                '<p class="fpg-peek"' + (open ? ' hidden' : '') + '>' + peek + '</p>' +
            '</div>' +
            '<div class="fpg-rest fpg-batch-list"' + (open ? '' : ' hidden') + ' role="region" aria-label="' + e(name + '’s ' + n + ' picks') + '"' + (n > SCROLL_AT ? ' tabindex="0"' : '') + '>' +
                ordered.map(openRow).join('') +
            '</div>' +
            toggleBtn(g.item_id, n, 'picks') +
        '</div>';
    }

    function avatar(m) {
        var url = m.avatar_url || ((typeof window.fvAva === 'function') ? window.fvAva(m.username) : '');
        return '<span class="fpg-ava">' + (url ? '<img src="' + e(url) + '" alt="" loading="lazy">' : '') + '</span>';
    }

    function resultRow(m) {
        var w = Number(m.wins_count) || 0, l = Number(m.losses_count) || 0;
        var p = (Number(m.pushes_count) || 0) + (Number(m.voids_count) || 0);
        var n = Number(m.pick_count) || 1;
        var line = (w + l + p) > 0 ? w + '-' + l + (p ? '-' + p : '') : plural(n, 'pick') + ' graded';
        var bu = Number(m.batch_net_units);
        var hasU = m.batch_net_units != null && m.batch_net_units !== '' && isFinite(bu);
        var href = '/profile/?user=' + encodeURIComponent(m.username || '') + '&view=picks';
        return '<a class="fpg-res" href="' + e(href) + '">' + avatar(m) +
            '<span class="fpg-res-name"><b>' + e(m.display_name || m.username) + '</b><small>' + e(plural(n, 'pick')) + ' · ' + e(line) + '</small></span>' +
            (hasU ? '<b class="fpg-res-u ' + (bu >= 0 ? 'fv-pos' : 'fv-neg') + '">' + (bu >= 0 ? '+' : '') + bu.toFixed(2) + 'u</b>' : '') +
            '<i class="fas fa-chevron-right" aria-hidden="true"></i></a>';
    }

    function renderResultsGroup(g, base) {
        var members = g._members;
        var n = members.length;
        var open = !!expanded[g.item_id];
        var wins = 0, losses = 0, pushes = 0, voids = 0;
        members.forEach(function (m) { wins += Number(m.wins_count) || 0; losses += Number(m.losses_count) || 0; pushes += Number(m.pushes_count) || 0; voids += Number(m.voids_count) || 0; });
        // FEED_RESULTS_PUSH_VOID: "140 wins 123 losses 265 picks graded" did not add up;
        // pushes and voids get their own chip when there are any.
        var pv = (pushes ? '<span class="fpg-sport"><b>' + pushes + '</b> ' + (pushes === 1 ? 'push' : 'pushes') + '</span>' : '') +
            (voids ? '<span class="fpg-sport"><b>' + voids + '</b> ' + (voids === 1 ? 'void' : 'voids') + '</span>' : '');
        var full = members.map(function (m) { try { return base(m); } catch (x) { return ''; } }).join('');
        return '<div class="feed-item fpg-card fpg-card--results' + (open ? ' is-open' : '') + '" data-id="' + e(g.item_id) + '" data-type="results_group" data-group-sig="' + e(g._sig) + '">' +
            '<div class="fpg-rhead"><span class="fpg-rico"><i class="fas fa-circle-check"></i></span>' +
                '<div><b>Results are in</b><small>' + plural(n, 'handicapper') + ' had records updated · ' + e(ago(t(members[0]))) + '</small></div>' +
                '<span class="fv-kind fv-kind--pick"><i class="fas fa-check"></i> Graded</span></div>' +
            ((wins + losses + pushes + voids) ? '<div class="fpg-sports"><span class="fpg-sport"><b>' + wins + '</b> ' + (wins === 1 ? 'win' : 'wins') + '</span><span class="fpg-sport"><b>' + losses + '</b> ' + (losses === 1 ? 'loss' : 'losses') + '</span>' + pv + '<span class="fpg-sport"><b>' + g.pick_count + '</b> ' + (g.pick_count === 1 ? 'pick' : 'picks') + ' graded</span></div>' : '') +
            // open = the full record cards replace the name list (same people twice was noise)
            '<div class="fpg-list"' + (open ? ' hidden' : '') + '>' + members.slice(0, PREVIEW).map(resultRow).join('') +
                (n > PREVIEW ? '<div class="fpg-more-names">+ ' + plural(n - PREVIEW, 'more handicapper') + '</div>' : '') +
            '</div>' +
            '<div class="fpg-rest fpg-rest--cards"' + (open ? '' : ' hidden') + '>' + full + '</div>' +
            toggleBtn(g.item_id, n, 'record updates') +
        '</div>';
    }

    function congratsBtn(m) {
        return '<button type="button" class="fpg-act fi-congrats' + (m.congratsed_by_user ? ' is-congratsed' : '') + '" onclick="toggleCongrats(' + e(JSON.stringify(String(m.item_id))) + ', this)">' +
            '<i class="fas fa-hands-clapping"></i> Congrats <span>' + (Number(m.likes_count) || 0) + '</span></button>';
    }

    function firstPickRibbon(ms) {
        if (!ms) return '';
        return '<div class="fpg-first" data-id="' + e(ms.item_id) + '"><span class="fpg-first-ico"><i class="fas fa-flag-checkered"></i></span>' +
            '<span class="fpg-first-text"><b>First official pick</b><small>' + e((ms.display_name || ms.username) + '’s record starts here.') + '</small></span>' +
            congratsBtn(ms) + '</div>';
    }

    function profileHref(m) { return '/profile/?user=' + encodeURIComponent(m.username || '') + '&view=picks'; }

    // "KenBcapper has reached 250 graded picks." under the name KenBcapper read
    // the name twice; the row keeps only the part after it.
    function msLine(m) {
        var text = String(m.content || '').replace(/\s*Nice start.*$/i, '').replace(/\s*Every record starts somewhere\.?$/i, '').trim();
        var name = String(m.username || '');
        if (name && text.toLowerCase().indexOf(name.toLowerCase() + ' ') === 0) {
            text = text.slice(name.length + 1);
            text = text.replace(/^has reached /i, 'reached ').replace(/^is now /i, 'now ').replace(/^is on /i, 'on ').replace(/^just made /i, 'made ');
            text = text.charAt(0).toUpperCase() + text.slice(1);
        }
        return text;
    }

    function renderMilestoneGroup(g) {
        var members = g._members;
        var n = members.length;
        var open = !!expanded[g.item_id];
        var row = function (m) {
            return '<div class="fpg-ms" data-id="' + e(m.item_id) + '">' + avatar(m) +
                '<span class="fpg-ms-text"><a href="' + e(profileHref(m)) + '"><b>' + e(m.display_name || m.username) + '</b></a>' +
                '<small>' + e(msLine(m)) + '</small></span>' +
                congratsBtn(m) + '</div>';
        };
        return '<div class="feed-item fpg-card fpg-card--ms' + (open ? ' is-open' : '') + '" data-id="' + e(g.item_id) + '" data-type="milestone_group" data-group-sig="' + e(g._sig) + '">' +
            '<div class="fpg-rhead"><span class="fpg-rico fpg-rico--gold"><i class="fas fa-trophy"></i></span>' +
                '<div><b>Milestones</b><small>' + plural(n, 'milestone') + ' · ' + e(ago(t(members[0]))) + '</small></div>' +
                '<span class="fv-kind fv-kind--milestone"><i class="fas fa-trophy"></i> Milestone</span></div>' +
            '<div class="fpg-list">' + members.slice(0, PREVIEW).map(row).join('') +
                (n > PREVIEW ? '<div class="fpg-rest"' + (open ? '' : ' hidden') + '>' + members.slice(PREVIEW).map(row).join('') + '</div>' : '') +
            '</div>' +
            (n > PREVIEW ? toggleBtn(g.item_id, n, 'milestones') : '') +
        '</div>';
    }

    function renderJoined(item) {
        var n = Number(item.activity_count) || 0;
        var text = n > 0 ? plural(n, 'new member') + ' joined TrustMyRecord' : String(item.content || 'New members joined TrustMyRecord').replace(/\.$/, '');
        return '<div class="feed-item fpg-joined" data-id="' + e(item.item_id) + '" data-type="milestone">' +
            '<span class="fpg-joined-ico"><i class="fas fa-user-plus"></i></span>' +
            '<span class="fpg-joined-text"><b>' + e(text) + '</b><small>' + e(ago(t(item))) + '</small></span>' +
            '<a class="fpg-joined-link" href="/handicappers/">Find handicappers <i class="fas fa-chevron-right"></i></a>' +
        '</div>';
    }

    function setExpanded(card, open) {
        var gid = card.getAttribute('data-id');
        if (open) expanded[gid] = true; else delete expanded[gid];
        card.classList.toggle('is-open', open);
        var rest = card.querySelector(':scope > .fpg-list > .fpg-rest, :scope > .fpg-rest');
        if (rest) rest.hidden = !open;
        var peek = card.querySelector(':scope > .fpg-summary > .fpg-peek');
        if (peek) peek.hidden = open;
        if (card.classList.contains('fpg-card--results')) {
            // open: the full record cards replace the short name list
            var list = card.querySelector(':scope > .fpg-list');
            if (list) list.hidden = open;
        }
        var btn = card.querySelector(':scope > .fpg-toggle');
        if (btn) {
            btn.setAttribute('aria-expanded', String(open));
            var g2 = cache[gid];
            var n2 = g2 ? g2._members.length : 0;
            var label = card.classList.contains('fpg-card--results') ? 'record updates'
                : card.classList.contains('fpg-card--ms') ? 'milestones' : 'picks';
            btn.querySelector('span').textContent = open ? openLabel(label) : closedLabel(n2, label);
        }
    }

    var cache = {};
    document.addEventListener('click', function (ev) {
        var btn = ev.target && ev.target.closest ? ev.target.closest('[data-fpg-toggle]') : null;
        if (!btn) return;
        var card = btn.closest('.fpg-card');
        if (!card) return;
        ev.preventDefault();
        var open = !card.classList.contains('is-open');
        // FEED_BATCH_20261117: the feed does not move. Opening grows the card
        // downward from where the reader is; closing keeps the button where it
        // was on screen (a long open list would otherwise drop them far below).
        var y0 = window.pageYOffset || 0;
        var b0 = btn.getBoundingClientRect().top;
        setExpanded(card, open);
        try {
            if (open) window.scrollTo(window.pageXOffset || 0, y0);
            else {
                // only when the closed card went up out of sight; otherwise stay put
                var bt = btn.getBoundingClientRect().top;
                if (bt < 70) window.scrollBy(0, bt - Math.max(70, b0));
            }
        } catch (x) { /* the toggle itself already worked */ }
    });

    // ---------------- wiring ----------------
    var baseAggregate = window.aggregateFeedItems;
    if (typeof baseAggregate === 'function') {
        window.aggregateFeedItems = function (items) { return regroup(baseAggregate(items)); };
    }

    var REACT_NOTE = 'Tail and Fade are reactions. They do not add a pick to your record.';
    var baseRender = window.renderFeedItem;
    if (typeof baseRender === 'function') {
        window.renderFeedItem = function (item) {
            if (item && item._group) {
                try {
                    cache[item.item_id] = item;
                    if (item._group === 'open_picks') return renderOpenGroup(item);
                    if (item._group === 'results') return renderResultsGroup(item, baseRender);
                    if (item._group === 'milestones') return renderMilestoneGroup(item);
                } catch (x) { return ''; }
            }
            if (item && item.item_type === 'milestone' && item.post_type === 'joined_summary') {
                try { return renderJoined(item); } catch (x) { /* fall through to the old card */ }
            }
            var html = baseRender(item);
            if (item && item.item_type === 'milestone' && item.post_type !== 'joined_summary' && uname(item)) {
                // FEED_MS_NO_ECHO_20261116: the card title already says "made their
                // first official pick"; the line under it said "johann just made
                // their first official pick." again. Keep only what the title lacks.
                try {
                    var meta = (window.MILESTONE_META || {})[String(item.post_type || '')];
                    var line = msLine(item);
                    var norm = function (s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\bgraded /g, '').trim(); };
                    if (meta && norm(line) === norm(meta.label)) line = '';
                    html = html.replace(/(<div class="fi-content">)([^<]*)/, function (m, open) { return open + e(line) + (line ? ' ' : ''); });
                } catch (x) { /* keep the original card */ }
            }
            if (item && item.item_type === 'open_pick') {
                // FEED_NOTE_ONCE_20261116: the "Tail and Fade are reactions" line sat
                // under every open pick. It now shows only after a reaction (the
                // live note slot stays) and as the buttons' tooltip.
                html = html.replace('<p class="fop-note" aria-live="polite">' + REACT_NOTE + '</p>', '<p class="fop-note" aria-live="polite"></p>')
                    .replace(/(data-fop-react="(?:tail|fade)")/g, '$1 title="' + REACT_NOTE + '"');
            }
            if (item && item._first_pick_ms) {
                var at = html.indexOf('<div class="fv-pick-grid">');
                return at > 0 ? html.slice(0, at) + firstPickRibbon(item._first_pick_ms) + html.slice(at) : html;
            }
            return html;
        };
    }

    // Signed-out Congrats went to /login/ with no way back; it now returns here,
    // the same way Tail and Fade do.
    var baseCongrats = window.toggleCongrats;
    if (typeof baseCongrats === 'function') {
        window.toggleCongrats = function (itemId, btn) {
            var signedIn = false;
            try { signedIn = !!(window.auth && window.auth.currentUser) || !!(window.api && window.api.token); } catch (x) { signedIn = false; }
            if (!signedIn) {
                window.location.href = '/login/?next=' + encodeURIComponent(location.pathname + (location.search || ''));
                return;
            }
            var hasUser = false;
            try { hasUser = !!(window.auth && window.auth.currentUser); } catch (x) { hasUser = false; }
            if (hasUser || !(window.api && typeof window.api.request === 'function')) return baseCongrats.apply(this, arguments);
            // Token is there but the profile has not loaded yet: send it straight to the API
            // (the base handler would open the login box for a member who is signed in).
            var mid = String(itemId).replace(/^milestone:/, '');
            if (!/^\d+$/.test(mid) || !btn) return;
            var isOn = btn.classList.contains('is-congratsed');
            btn.disabled = true;
            return Promise.resolve(window.api.request('/milestones/' + mid + '/congrats', { method: isOn ? 'DELETE' : 'POST' }))
                .then(function (res) {
                    btn.classList.toggle('is-congratsed', !isOn);
                    var span = btn.querySelector('span');
                    if (span && res && typeof res.congrats_count !== 'undefined') span.textContent = String(res.congrats_count);
                }, function () {})
                .then(function () { btn.disabled = false; });
        };
    }

    // The right rail (Most Active, Trending) keeps reading every update, not cards.
    var baseAfter = window.fvAfterFeed;
    if (typeof baseAfter === 'function') {
        window.fvAfterFeed = function (items) {
            var flat = [];
            (items || []).forEach(function (i) { if (i && i._group) flat.push.apply(flat, i._members); else flat.push(i); });
            return baseAfter.call(this, flat);
        };
    }

    // A shared link to a pick inside a group opens the group and lands on the row.
    var baseFocus = window.focusSharedFeedItem;
    var focused = false;
    window.focusSharedFeedItem = function () {
        var wanted = '';
        try { wanted = new URLSearchParams(location.search).get('post') || ''; } catch (x) { wanted = ''; }
        if (wanted && !focused) {
            var q = '[data-id="' + wanted.replace(/[\\"]/g, '\\$&') + '"]';
            var top = document.querySelector('#feedList > .feed-item' + q);
            var inner = top ? null : document.querySelector('#feedList .feed-item ' + q);
            if (inner) {
                var card = inner.closest('.fpg-card');
                if (card && !card.classList.contains('is-open') && inner.closest('.fpg-rest')) setExpanded(card, true);
                inner.classList.add('is-shared-target');
                focused = true;
                inner.scrollIntoView({ block: 'center', behavior: 'smooth' });
                return;
            }
        }
        if (typeof baseFocus === 'function') return baseFocus.apply(this, arguments);
    };

    // A shared open pick leaves the feed once its game starts (it is graded into a
    // results card). When the first load is done and the pick is not on the page,
    // open its own pick page, which shows it pending or graded.
    // FEED_END_MARK_20261116: the list just stopped; say it is the end.
    function markEnd() {
        var list = document.getElementById('feedList');
        var more = document.getElementById('loadMore');
        var mark = document.getElementById('fpgEnd');
        var done = list && more && more.style.display === 'none' && list.querySelector(':scope > .feed-item');
        if (!done) { if (mark) mark.remove(); return; }
        if (!mark) {
            mark = document.createElement('div');
            mark.id = 'fpgEnd';
            mark.className = 'fpg-end';
            mark.innerHTML = '<i class="fas fa-circle-check"></i> You’re all caught up';
            more.parentNode.insertBefore(mark, more.nextSibling);
        }
    }

    var sharedChecked = false;
    function sharedPickFallback() {
        if (sharedChecked || focused) return;
        if (!document.querySelector('#feedList .feed-item')) return; // feed did not load; leave the page alone
        sharedChecked = true;
        var wanted = '';
        try { wanted = new URLSearchParams(location.search).get('post') || ''; } catch (x) { return; }
        if (document.querySelector('#feedList [data-id="' + wanted.replace(/[\\"]/g, '\\$&') + '"]')) return;
        var m = /^openpick:(\d+)$/.exec(wanted);
        if (m) { location.replace('/pick/?id=' + m[1]); return; }
        // FEED_SHARED_OLD_POST_20261116: a shared post or milestone older than the
        // pages the feed loads showed nothing at all. Fetch it and show it above
        // the feed; a member's graded day opens their picks.
        var g = /^pick_group_(.+)_(graded|locked)_\d{4}-\d{2}-\d{2}$/.exec(wanted);
        if (g) { location.replace('/profile/?user=' + encodeURIComponent(g[1]) + '&view=picks'); return; }
        var filter = /^\d+$/.test(wanted) ? 'posts' : (/^milestone:\d+$/.test(wanted) ? 'milestones' : '');
        if (!filter || !window.api || typeof window.api.request !== 'function') return;
        var pages = filter === 'posts' ? [0] : [0, 100, 200];
        var look = function (i) {
            if (i >= pages.length) return Promise.resolve(null);
            return window.api.request('/feed?limit=100&offset=' + pages[i] + '&filter=' + filter).then(function (d) {
                var hit = ((d && d.feed) || []).filter(function (x) { return String(x.item_id) === wanted || String(x.id) === wanted; })[0];
                return hit || (((d && d.feed) || []).length < 100 ? null : look(i + 1));
            });
        };
        // FEED_MS_SINGLE_20261117: a milestone is fetched by id (a welcome folded into
        // the "N new members" card is not in any feed page); the page scan stays as backup.
        var msId = /^milestone:(\d+)$/.exec(wanted);
        var first = msId
            ? window.api.request('/milestones/' + msId[1]).then(function (d) { return (d && d.item) || look(0); }, function () { return look(0); })
            : look(0);
        first.then(function (item) {
            if (!item || typeof window.renderFeedItem !== 'function') return;
            var list = document.getElementById('feedList');
            if (!list || document.getElementById('fpgShared')) return;
            var wrap = document.createElement('div');
            wrap.id = 'fpgShared';
            wrap.className = 'fpg-shared';
            wrap.innerHTML = '<div class="fpg-shared-label"><i class="fas fa-link"></i> Shared with you</div>' + window.renderFeedItem(item);
            list.parentNode.insertBefore(wrap, list);
            var card = wrap.querySelector('.feed-item');
            if (card) { card.classList.add('is-shared-target'); card.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
        }).catch(function () { /* the feed itself is still there */ });
    }

    // A grouped first page can be short; fill the screen with up to two more pages.
    var baseLoadFeed = window.loadFeed;
    if (typeof baseLoadFeed === 'function') {
        window.loadFeed = async function () {
            var r = await baseLoadFeed.apply(this, arguments);
            // a shared post that arrived on a later page (Load More) still gets found
            try { if (!focused && feedOffset > 0) window.focusSharedFeedItem(); } catch (x) { /* optional */ }
            try {
                if (grouping && typeof feedOffset !== 'undefined' && feedOffset < 2 * FEED_LIMIT) {
                    var list = document.getElementById('feedList');
                    var more = document.getElementById('loadMore');
                    var cardsShown = list ? list.querySelectorAll(':scope > .feed-item').length : 99;
                    if (cardsShown < 10 && more && more.style.display === 'block' && typeof loadMorePosts === 'function') { loadMorePosts(); return r; }
                }
            } catch (x) { /* the Load More button still works */ }
            // FEED_DAY_COMPLETE_20261116: the newest graded card adds up the member's
            // whole day, but an earlier batch of that day can sit pages down (the card
            // said KenBcapper 39 picks while the rail, which reads further, said 181).
            // Read on, up to 5 pages, until the page reaches past the start of that day.
            try {
                if (typeof feedOffset !== 'undefined' && feedOffset < 4 * FEED_LIMIT && typeof _feedRawItems !== 'undefined' && _feedRawItems.length) {
                    var raw = _feedRawItems;
                    // the first three members' day cards, as the rail shows them
                    var firsts = [], seenU = {};
                    for (var i = 0; i < raw.length && firsts.length < 3; i++) {
                        var it0 = raw[i];
                        if (!it0 || !(it0._summary === true || it0.post_type === 'graded_pick_summary')) continue;
                        var uk = uname(it0).toLowerCase();
                        if (seenU[uk]) continue;
                        seenU[uk] = 1; firsts.push(it0);
                    }
                    if (firsts.length) {
                        var dayStart = new Date(Math.min.apply(null, firsts.map(function (x) { var d0 = new Date(x.graded_at || x.created_at || 0); d0.setHours(0, 0, 0, 0); return d0.getTime(); })));
                        var oldest = Infinity;
                        // only the paged feed counts; the side list of latest graded picks is not paged
                        raw.forEach(function (it) { if (it && it._attach_only) return; var ts = t(it); if (ts && ts < oldest) oldest = ts; });
                        var more2 = document.getElementById('loadMore');
                        if (oldest >= dayStart.getTime() && more2 && more2.style.display === 'block' && typeof loadMorePosts === 'function') { loadMorePosts(); return r; }
                    }
                }
            } catch (x) { /* the Load More button still works */ }
            try { sharedPickFallback(); } catch (x) { /* optional */ }
            try { markEnd(); } catch (x) { /* optional */ }
            return r;
        };
    }

    // "Group activity" switch at the bottom of the sort menu; off = every update.
    function syncModeBtn(btn) {
        btn.setAttribute('aria-checked', String(grouping));
        btn.innerHTML = '<i class="fas ' + (grouping ? 'fa-square-check' : 'fa-square') + '"></i> Group activity';
        btn.title = grouping ? 'Grouped. Uncheck to show every update on its own.' : 'Showing every update. Check to group activity.';
    }
    function mountModeBtn() {
        var menu = document.getElementById('fvSortMenu');
        if (!menu || document.getElementById('fpgMode')) return;
        // a div, not a button: fvSetSort rewrites aria-checked on every menu button
        var btn = document.createElement('div');
        btn.id = 'fpgMode';
        btn.className = 'fpg-mode';
        btn.tabIndex = 0;
        btn.setAttribute('role', 'menuitemcheckbox');
        syncModeBtn(btn);
        btn.addEventListener('keydown', function (ev) {
            if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); btn.click(); }
        });
        btn.addEventListener('click', function (ev) {
            ev.stopPropagation();
            grouping = !grouping;
            try { localStorage.setItem(MODE_KEY, grouping ? 'on' : 'off'); } catch (x) { /* session only */ }
            syncModeBtn(btn);
            if (typeof window.fvCloseMenus === 'function') window.fvCloseMenus();
            if (typeof feedOffset !== 'undefined') feedOffset = 0;
            if (typeof window.loadFeed === 'function') window.loadFeed();
        });
        menu.appendChild(btn);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountModeBtn);
    else mountModeBtn();

    // SITE_UPDATES_OFFICIAL_ONLY_20261116: Site Updates now holds official
    // TrustMyRecord posts only. Until there is one, the tab stays out of the row
    // instead of opening onto an empty page.
    function hideEmptySiteUpdates() {
        if (typeof document.querySelectorAll !== 'function') return;
        var btn = Array.prototype.find.call(document.querySelectorAll('.feed-tab'), function (b) {
            return (b.getAttribute('onclick') || '').indexOf("'site-updates'") !== -1;
        });
        var c = (window.api && typeof window.api.request === 'function') ? window.api : null;
        if (!btn || !c) return;
        c.request('/feed?limit=1&offset=0&filter=site_updates').then(function (d) {
            if (!(d && d.feed && d.feed.length) && !btn.classList.contains('active')) {
                btn.hidden = true;
                // FEED_TAB_HIDDEN: a theme layer's display:flex beat [hidden].
                if (btn.style && btn.style.setProperty) btn.style.setProperty('display', 'none', 'important');
            }
        }).catch(function () { /* leave the tab as it is */ });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(hideEmptySiteUpdates, 0); });
    else setTimeout(hideEmptySiteUpdates, 0);

    window.TMRFeedGroups = {
        regroup: regroup, renderOpenGroup: renderOpenGroup, renderResultsGroup: renderResultsGroup,
        isGrouping: function () { return grouping; }, _expanded: expanded
    };
})();
