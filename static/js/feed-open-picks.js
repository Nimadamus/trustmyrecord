/* FEED_OPEN_PICKS_20261114 - a public open pick as a feed card, with Tail / Fade.
 *
 * Loaded after feed-v2.js and feed-social.js. It only ADDS a renderer for the
 * new feed item type 'open_pick' by wrapping renderFeedItem; every other card
 * is passed through untouched, and feed-v2.js is not edited (other sessions
 * work in that file). The card is built from the feed's own pieces: the same
 * header, the same pick grid and box, the same action buttons.
 *
 * Tail and Fade here are REACTIONS. They never add a pick to anyone's record.
 * A member who wants the pick on their own record uses "Add to my slip", which
 * hands off to the normal pick slip (current price, units, Lock) through the
 * same handoff the simulators and polls already use.
 */
(function () {
    'use strict';
    if (window.TMRFeedOpenPicks) return;

    var INTENT_KEY = 'tmr_sim_pick_intent';
    var SPORT_CODE = {
        americanfootball_nfl: 'NFL', americanfootball_ncaaf: 'NCAAF', basketball_nba: 'NBA',
        basketball_ncaab: 'NCAAB', baseball_mlb: 'MLB', icehockey_nhl: 'NHL'
    };
    var cards = {};

    function e(v) {
        return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }
    function client() { return (window.api && typeof window.api.request === 'function') ? window.api : null; }
    function loggedIn() {
        try { return !!(window.auth && window.auth.currentUser) || !!(client() && client().token); } catch (x) { return false; }
    }
    function fmtOdds(o) {
        var n = Number(o);
        if (!isFinite(n) || n === 0) return '';
        return (n > 0 ? '+' : '') + Math.round(n);
    }
    function fmtUnits(u) {
        var n = Number(u);
        return isFinite(n) && n > 0 ? (Math.round(n * 100) / 100) + 'u' : '';
    }
    function fmtStart(t) {
        if (!t) return '';
        var d = new Date(t);
        if (isNaN(d.getTime())) return '';
        return d.toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    }
    function started(item) {
        if (item.pick_started === true) return true;
        var t = item.pick_game_time ? new Date(item.pick_game_time).getTime() : NaN;
        return isFinite(t) && t <= Date.now();
    }

    /* The two sides the normal slip handoff can preselect: a full game
       moneyline, or a full game total at its line. Everything else has no
       formal handoff here and shows reactions only. */
    function handoff(item) {
        if (started(item) || item.is_own_pick) return null;
        if (item.pick_period && item.pick_period !== 'full_game') return null;
        var sport = SPORT_CODE[String(item.pick_sport_key || '')];
        if (!sport || !item.pick_home_team || !item.pick_away_team) return null;
        var mt = String(item.pick_market_type || '');
        var sel = String(item.pick_selection || '');
        var base = { sport: sport, home_team_name: item.pick_home_team, away_team_name: item.pick_away_team, source: 'feed' };
        if (mt === 'h2h') {
            var other = sel === item.pick_home_team ? item.pick_away_team : (sel === item.pick_away_team ? item.pick_home_team : null);
            if (!other) return null;
            return { same: Object.assign({ pick_team: sel }, base), other: Object.assign({ pick_team: other }, base), otherLabel: other + ' ML' };
        }
        if (mt === 'totals' && (sel === 'Over' || sel === 'Under') && isFinite(Number(item.pick_line))) {
            var opp = sel === 'Over' ? 'Under' : 'Over';
            var line = Number(item.pick_line);
            return {
                same: Object.assign({ market: sel.toLowerCase(), side: sel, line: line }, base),
                other: Object.assign({ market: opp.toLowerCase(), side: opp, line: line }, base),
                otherLabel: opp + ' ' + line
            };
        }
        return null;
    }

    function reactBtn(kind, item) {
        var on = item.viewer_reaction === kind;
        var count = Number(kind === 'tail' ? item.tails_count : item.fades_count) || 0;
        var dead = started(item) || item.is_own_pick;
        return '<button type="button" class="fi-action fop-react fop-' + kind + (on ? ' is-on' : '') + '"' +
            ' data-fop-react="' + kind + '" aria-pressed="' + on + '"' + (dead ? ' disabled' : '') + '>' +
            '<i class="fas ' + (kind === 'tail' ? 'fa-arrow-trend-up' : 'fa-arrow-trend-down') + '"></i> ' +
            (kind === 'tail' ? 'Tail' : 'Fade') + ' <span>' + count + '</span></button>';
    }

    function render(item) {
        var id = String(item.item_id || ('openpick:' + item.pick_id));
        cards[id] = item;
        var isStarted = started(item);
        var matchup = (item.pick_away_team && item.pick_home_team) ? item.pick_away_team + ' @ ' + item.pick_home_team : '';
        var when = fmtStart(item.pick_game_time);
        var sub = [matchup, when].filter(Boolean).join(' · ');
        var odds = fmtOdds(item.pick_odds);
        var units = fmtUnits(item.pick_units);
        var rows =
            '<div class="fv-pr"><i class="fas fa-layer-group"></i><span>' + e(item.pick_market_label || 'Pick') + '</span>' +
                '<b class="fv-chip fv-chip--' + (isStarted ? 'graded' : 'pending') + '">' + (isStarted ? 'IN PLAY' : 'OPEN') + '</b></div>' +
            (odds ? '<div class="fv-pr fv-pr--net"><span>Odds</span><b>' + e(odds) + '</b></div>' : '') +
            (units ? '<div class="fv-pr fv-pr--net"><span>Risk</span><b>' + e(units) + '</b></div>' : '');
        var header = (typeof window.renderFeedHeader === 'function')
            ? window.renderFeedHeader(Object.assign({}, item, { item_type: 'pick' }), '')
            : '';
        var h = handoff(item);
        var formal = h
            ? '<div class="fop-formal">' +
                '<button type="button" class="fv-view-picks fop-slip" data-fop-slip="same">Add to my slip <i class="fas fa-chevron-right"></i></button>' +
                '<button type="button" class="fv-view-picks fop-slip fop-slip--other" data-fop-slip="other">Take ' + e(h.otherLabel) + ' <i class="fas fa-chevron-right"></i></button>' +
              '</div>'
            : '';
        var note = item.is_own_pick
            ? 'Your pick is public. Members can tail or fade it until the game starts.'
            : (isStarted ? 'The game has started. Reactions are closed.' : 'Tail and Fade are reactions. They do not add a pick to your record.');
        return '<div class="feed-item fop-card" data-id="' + e(id) + '" data-type="open_pick" data-fop-pick="' + e(item.pick_id) + '">' +
            header +
            '<div class="fv-pick-grid">' +
                '<div class="fv-pick-text"><div class="fv-title"><i class="fas fa-lock-open"></i> Open pick</div>' +
                    '<p class="fv-pick-line">' + e(item.pick_text || item.pick_selection || '') + '</p>' +
                    (sub ? '<p class="fv-pick-sub">' + e(sub) + '</p>' : '') +
                '</div>' +
                '<div class="fv-pick-side"><div class="fv-pick-box">' + rows + '</div>' + formal + '</div>' +
            '</div>' +
            '<div class="fi-actions">' + reactBtn('tail', item) + reactBtn('fade', item) +
                (typeof window.fvShareBtn === 'function' ? window.fvShareBtn(id) : '') +
            '</div>' +
            '<p class="fop-note" aria-live="polite">' + e(note) + '</p>' +
        '</div>';
    }

    function repaint(card, item) {
        ['tail', 'fade'].forEach(function (kind) {
            var b = card.querySelector('[data-fop-react="' + kind + '"]');
            if (!b) return;
            var on = item.viewer_reaction === kind;
            b.classList.toggle('is-on', on);
            b.setAttribute('aria-pressed', String(on));
            var s = b.querySelector('span');
            if (s) s.textContent = String(Number(kind === 'tail' ? item.tails_count : item.fades_count) || 0);
        });
    }
    function say(card, text) {
        var n = card.querySelector('.fop-note');
        if (n) n.textContent = text;
    }

    function onReact(btn) {
        var card = btn.closest('.fop-card');
        if (!card || card.dataset.busy) return;
        var item = cards[card.getAttribute('data-id')];
        var c = client();
        if (!item || !c) return;
        if (!loggedIn()) {
            window.location.href = '/login/?next=' + encodeURIComponent(location.pathname + (location.search || ''));
            return;
        }
        var kind = btn.getAttribute('data-fop-react');
        var want = item.viewer_reaction === kind ? null : kind;
        var before = { r: item.viewer_reaction, t: item.tails_count, f: item.fades_count };
        card.dataset.busy = '1';
        c.request('/feed/open-pick/' + encodeURIComponent(item.pick_id) + '/reaction', { method: 'PUT', body: { reaction: want } })
            .then(function (out) {
                item.viewer_reaction = out.viewer_reaction || null;
                item.tails_count = out.tails_count; item.fades_count = out.fades_count;
                repaint(card, item);
                say(card, item.viewer_reaction === 'tail' ? 'You tailed this pick. It is a reaction, not a pick on your record.'
                    : item.viewer_reaction === 'fade' ? 'You faded this pick. It is a reaction, not a pick on your record.'
                    : 'Reaction removed.');
            })
            .catch(function (err) {
                item.viewer_reaction = before.r; item.tails_count = before.t; item.fades_count = before.f;
                repaint(card, item);
                var msg = String((err && err.message) || '');
                if (/started/i.test(msg)) {
                    item.pick_started = true;
                    Array.prototype.forEach.call(card.querySelectorAll('[data-fop-react]'), function (b) { b.disabled = true; });
                    var f = card.querySelector('.fop-formal'); if (f && f.parentNode) f.parentNode.removeChild(f);
                    say(card, 'The game has started. Reactions are closed.');
                } else if (/not found/i.test(msg)) {
                    say(card, 'This pick is no longer open.');
                } else {
                    say(card, 'That did not save. Try again.');
                }
            })
            .then(function () { delete card.dataset.busy; });
    }

    function onSlip(btn) {
        var card = btn.closest('.fop-card');
        var item = card && cards[card.getAttribute('data-id')];
        var h = item && handoff(item);
        if (!h) return;
        var intent = Object.assign({ ts: Date.now() }, btn.getAttribute('data-fop-slip') === 'other' ? h.other : h.same);
        try { localStorage.setItem(INTENT_KEY, JSON.stringify(intent)); } catch (x) { return; }
        var dest = '/sportsbook/?simpick=1';
        window.location.href = loggedIn() ? dest : '/login/?next=' + encodeURIComponent(dest);
    }

    document.addEventListener('click', function (ev) {
        var t = ev.target && ev.target.closest ? ev.target : null;
        if (!t) return;
        var r = t.closest('[data-fop-react]');
        if (r) { ev.preventDefault(); if (!r.disabled) onReact(r); return; }
        var s = t.closest('[data-fop-slip]');
        if (s) { ev.preventDefault(); onSlip(s); }
    });

    var base = window.renderFeedItem;
    if (typeof base === 'function') {
        window.renderFeedItem = function (item) {
            try {
                if (item && item.item_type === 'open_pick') return render(item);
            } catch (x) { return ''; }
            return base(item);
        };
    }

    window.TMRFeedOpenPicks = { render: render, _handoff: handoff, _cards: cards };
})();
