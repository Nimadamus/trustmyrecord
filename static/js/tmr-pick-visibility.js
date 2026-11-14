/* PICK_VISIBILITY_20261114 - open picks public or hidden.
 *
 * Two small pieces, both additive and both silent when the API does not offer
 * the feature (the control is never shown unless the server answered):
 *
 *  1. Pick slip: a Public / Hidden switch above the Lock button, built from the
 *     slip's own Risk / To win control so it looks like part of the slip. The
 *     choice is remembered as the member's default and sent with every pick
 *     through api.createPick, whichever slip submitted it.
 *  2. Profile: an "Open Picks" section above the Public Ledger. A visitor sees
 *     only the picks the member left public; the member sees all of their own,
 *     each marked, and can make a hidden one public. Nothing is drawn when
 *     there is nothing to show.
 *
 * A graded pick is public either way. This only concerns open picks.
 */
(function () {
    'use strict';
    if (window.TMRPickVisibility) return;

    var state = { ready: false, visibility: null, locked: false, loading: null };

    function esc(v) {
        return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }
    function client() { return (window.api && typeof window.api.request === 'function') ? window.api : null; }
    function loggedIn() {
        try { return !!(window.auth && window.auth.currentUser) || !!(client() && client().token); } catch (e) { return false; }
    }

    /* ------------------------------------------------------------ default */
    function loadDefault() {
        if (state.loading) return state.loading;
        var c = client();
        if (!c || !loggedIn()) return Promise.resolve(null);
        state.loading = c.request('/picks/visibility/default').then(function (d) {
            if (d && (d.visibility === 'public' || d.visibility === 'hidden')) {
                state.ready = true; state.visibility = d.visibility; state.locked = !!d.locked;
            }
            return state;
        }).catch(function () { state.loading = null; return null; });
        return state.loading;
    }
    function saveDefault(v) {
        var c = client();
        if (!c) return Promise.reject(new Error('offline'));
        return c.request('/picks/visibility/default', { method: 'PUT', body: { visibility: v } });
    }

    function takeSource() {
        try {
            var raw = sessionStorage.getItem('tmr_pick_source');
            if (!raw) return null;
            sessionStorage.removeItem('tmr_pick_source');
            var v = JSON.parse(raw);
            if (!v || !v.source_pick_id || (v.source_kind !== 'tail' && v.source_kind !== 'fade')) return null;
            if (Date.now() - Number(v.ts || 0) > 30 * 60 * 1000) return null;
            return v;
        } catch (e) { return null; }
    }

    /* Every slip submits through api.createPick: add the choice there. */
    function wrapCreatePick() {
        var c = window.api;
        if (!c || typeof c.createPick !== 'function' || c.createPick.__tmrPickVis) return;
        var original = c.createPick;
        var wrapped = function (pickData) {
            try {
                if (state.ready && pickData && typeof pickData === 'object' && pickData.pending_visibility == null) {
                    pickData = Object.assign({}, pickData, { pending_visibility: state.visibility });
                }
                // PICK_SOURCE_LINK_20261114: a pick that came from a feed card
                // says so once (30 minutes at most); the server checks it.
                var src = takeSource();
                if (src && pickData && typeof pickData === 'object' && pickData.source_pick_id == null) {
                    pickData = Object.assign({}, pickData, { source_pick_id: src.source_pick_id, source_kind: src.source_kind });
                }
            } catch (e) { /* send the pick exactly as it was */ }
            return original.call(this, pickData);
        };
        wrapped.__tmrPickVis = true;
        c.createPick = wrapped;
    }

    /* ---------------------------------------------------------- slip switch */
    var NOTE = {
        public: 'Everyone can see this pick as soon as you lock it.',
        hidden: 'Only you see this pick until it is graded.'
    };
    function switchHtml() {
        var v = state.visibility;
        return '<div class="tmr-pv" id="tmrPickVis">' +
            '<div class="sbn-mode tmr-pv-mode" role="group" aria-label="Who can see this pick before it is graded">' +
            '<button type="button" class="sbn-modebtn' + (v === 'public' ? ' is-on' : '') + '" data-tmr-pv="public" aria-pressed="' + (v === 'public') + '"' + (state.locked ? ' disabled' : '') + '>Public</button>' +
            '<button type="button" class="sbn-modebtn' + (v === 'hidden' ? ' is-on' : '') + '" data-tmr-pv="hidden" aria-pressed="' + (v === 'hidden') + '">Hidden</button>' +
            '</div><div class="tmr-pv-note" aria-live="polite">' + esc(NOTE[v] || '') + '</div></div>';
    }
    function mountSwitch() {
        if (!state.ready) return;
        var btn = document.getElementById('sbnSubmit');
        var cur = document.getElementById('tmrPickVis');
        if (!btn) { if (cur && cur.parentNode) cur.parentNode.removeChild(cur); return; }
        if (cur && cur.nextElementSibling === btn) return;
        if (cur && cur.parentNode) cur.parentNode.removeChild(cur);
        btn.insertAdjacentHTML('beforebegin', switchHtml());
    }
    function paintSwitch() {
        var cur = document.getElementById('tmrPickVis');
        if (!cur) return;
        Array.prototype.forEach.call(cur.querySelectorAll('[data-tmr-pv]'), function (b) {
            var on = b.getAttribute('data-tmr-pv') === state.visibility;
            b.classList.toggle('is-on', on);
            b.setAttribute('aria-pressed', String(on));
        });
        var note = cur.querySelector('.tmr-pv-note');
        if (note) note.textContent = NOTE[state.visibility] || '';
    }
    function onSwitchClick(e) {
        var b = e.target && e.target.closest ? e.target.closest('[data-tmr-pv]') : null;
        if (!b || b.disabled) return;
        e.preventDefault(); e.stopPropagation();
        var want = b.getAttribute('data-tmr-pv');
        if (want === state.visibility) return;
        var before = state.visibility;
        state.visibility = want; paintSwitch();
        saveDefault(want).catch(function () {
            // Not saved as the default: this pick still goes out as chosen.
            var note = document.querySelector('#tmrPickVis .tmr-pv-note');
            if (note) note.textContent = (NOTE[want] || '') + ' This choice was not saved for next time.';
            void before;
        });
    }

    /* -------------------------------------------------------- profile block */
    function profileName() {
        try {
            var q = new URLSearchParams(location.search);
            var u = q.get('user') || q.get('username');
            if (u) return u;
            var m = location.pathname.match(/^\/u\/([^\/]+)\/?/);
            if (m) return decodeURIComponent(m[1]);
            if (/^\/profile\/?$/.test(location.pathname) && window.auth && window.auth.currentUser) return window.auth.currentUser.username;
        } catch (e) {}
        return null;
    }
    function fmtOdds(o) {
        var n = Number(o);
        if (!isFinite(n) || n === 0) return '';
        return (n > 0 ? '+' : '') + Math.round(n);
    }
    function fmtLine(l) {
        if (l == null || l === '') return '';
        var n = Number(l);
        return isFinite(n) ? String(n) : '';
    }
    function fmtMarket(m) {
        var s = String(m || '').replace(/_/g, ' ').trim();
        if (!s) return '';
        if (s === 'h2h') return 'Moneyline';
        return s.replace(/\b[a-z]/g, function (c) { return c.toUpperCase(); }).replace(/\bF5\b/i, 'F5');
    }
    function fmtStart(t) {
        if (!t) return '';
        var d = new Date(t);
        if (isNaN(d.getTime())) return '';
        return d.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    }
    function fmtStake(p) {
        var n = Number(p.risk_units != null ? p.risk_units : p.units);
        return isFinite(n) && n > 0 ? (Math.round(n * 100) / 100) + 'u' : '';
    }
    function isOwnProfile(name) {
        try { return !!(window.auth && window.auth.currentUser && String(window.auth.currentUser.username).toLowerCase() === String(name).toLowerCase()); } catch (e) { return false; }
    }
    function sectionHtml(picks, own) {
        var rows = picks.map(function (p) {
            var game = (p.away_team && p.home_team) ? esc(p.away_team) + ' @ ' + esc(p.home_team) : '';
            var vis = '';
            if (own) {
                vis = p.pending_visibility === 'public'
                    ? '<td><span class="tmr-op-chip is-public">Public</span></td>'
                    : '<td><span class="tmr-op-chip">Hidden</span> <button type="button" class="tmr-op-reveal" data-tmr-reveal="' + esc(p.id) + '">Make public</button></td>';
            }
            return '<tr>' +
                '<td><strong>' + esc(p.pick_text || p.selection) + '</strong></td>' +
                '<td>' + game + '</td>' +
                '<td>' + esc(fmtStart(p.commence_time)) + '</td>' +
                '<td>' + esc(p.wager_market_label || fmtMarket(p.market_type)) + '</td>' +
                '<td class="num">' + esc(fmtOdds(p.odds_snapshot)) + '</td>' +
                '<td class="num">' + esc(fmtStake(p)) + '</td>' + vis + '</tr>';
        }).join('');
        var sub = own
            ? 'Your picks that have not been graded yet. Visitors see only the ones marked Public. A hidden pick becomes public when it is graded.'
            : 'Picks this member chose to show before the games are played. Locked and timestamped; they cannot be edited.';
        return '<div class="tmrx-section" id="tmrxOpenPicks">' +
            '<div class="tmrx-section-head"><div>' +
            '<div class="tmrx-section-title">Open Picks</div>' +
            '<div class="tmrx-section-sub">' + sub + '</div></div>' +
            '<div class="tmrx-meta">' + picks.length + (picks.length === 1 ? ' open pick' : ' open picks') + '</div></div>' +
            '<div class="tmrx-table-shell"><table class="tmrx-table" id="tmrxTableOpenPicks"><thead><tr>' +
            '<th>Pick</th><th>Game</th><th>Starts</th><th>Market</th><th class="num">Odds</th><th class="num">Stake</th>' +
            (own ? '<th>Visibility</th>' : '') + '</tr></thead><tbody>' + rows + '</tbody></table></div></div>';
    }
    var profileDone = false;
    function mountProfile() {
        if (profileDone) return;
        var anchor = document.getElementById('tmrxPublicLedger');
        var c = client();
        var name = profileName();
        if (!anchor || !c || !name) return;
        profileDone = true;
        c.request('/users/' + encodeURIComponent(name) + '/pending?limit=100').then(function (d) {
            var picks = (d && Array.isArray(d.picks)) ? d.picks : [];
            // Only rows the server marked: an older API, or a paywalled seller, draws nothing here.
            picks = picks.filter(function (p) { return p && p.selection && (p.pending_visibility === 'public' || p.pending_visibility === 'hidden'); });
            var old = document.getElementById('tmrxOpenPicks');
            if (old && old.parentNode) old.parentNode.removeChild(old);
            if (!picks.length) return;
            var own = isOwnProfile(name);
            if (!own) picks = picks.filter(function (p) { return p.pending_visibility === 'public'; });
            if (!picks.length) return;
            anchor.insertAdjacentHTML('beforebegin', sectionHtml(picks, own));
        }).catch(function () { profileDone = false; });
    }
    function onRevealClick(e) {
        var b = e.target && e.target.closest ? e.target.closest('[data-tmr-reveal]') : null;
        if (!b || b.disabled) return;
        e.preventDefault();
        var c = client(); if (!c) return;
        b.disabled = true; b.textContent = 'Saving';
        c.request('/picks/' + encodeURIComponent(b.getAttribute('data-tmr-reveal')) + '/reveal', { method: 'POST' }).then(function () {
            var td = b.parentNode;
            if (td) td.innerHTML = '<span class="tmr-op-chip is-public">Public</span>';
        }).catch(function () { b.disabled = false; b.textContent = 'Make public'; });
    }

    /* ----------------------------------------------------------------- boot */
    function tick() {
        wrapCreatePick();
        if (document.getElementById('sbnSubmit') || document.getElementById('tmrPickVis')) {
            if (state.ready) mountSwitch(); else loadDefault().then(function () { mountSwitch(); });
        }
        if (document.getElementById('tmrxPublicLedger')) mountProfile();
    }
    function boot() {
        document.addEventListener('click', onSwitchClick, true);
        document.addEventListener('click', onRevealClick, false);
        tick();
        var pending = false;
        try {
            new MutationObserver(function () {
                if (pending) return;
                pending = true;
                setTimeout(function () { pending = false; tick(); }, 60);
            }).observe(document.documentElement, { childList: true, subtree: true });
        } catch (e) { setInterval(tick, 1500); }
    }

    window.TMRPickVisibility = {
        current: function () { return state.ready ? state.visibility : null; },
        _state: state, _switchHtml: switchHtml, _sectionHtml: sectionHtml,
        _fmt: { odds: fmtOdds, line: fmtLine, market: fmtMarket, stake: fmtStake }
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
