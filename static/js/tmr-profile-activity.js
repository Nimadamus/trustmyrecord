/* PROFILE_ACTIVITY_20261114: "Recent Activity" on a member's profile.
 *
 * One read of the shared activity log (GET /api/activity/user/<name>): the
 * same lines the feed and the homepage strip are built from, plus how the
 * community reacted to this member's public picks. The server re-checks the
 * privacy of every line; this file only draws what it is given. Nothing is
 * drawn when the API has no lines and no reactions (or is an older build), so
 * the profile is unchanged in that case. Uses the profile's own section
 * classes (tmrx-section), like Open Picks. */
(function () {
    'use strict';
    if (window.TMRProfileActivity) return;

    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }
    function apiBase() {
        try { if (window.api && window.api.baseUrl) return String(window.api.baseUrl).replace(/\/$/, ''); } catch (e) {}
        return 'https://api.trustmyrecord.com/api';
    }
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
    function ago(iso) {
        var t = Date.parse(iso); if (!isFinite(t)) return '';
        var s = Math.max(0, Math.round((Date.now() - t) / 1000));
        if (s < 60) return 'just now';
        if (s < 3600) return Math.floor(s / 60) + 'm ago';
        if (s < 86400) return Math.floor(s / 3600) + 'h ago';
        if (s < 86400 * 30) return Math.floor(s / 86400) + 'd ago';
        return new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
    var ICON = {
        pick_tailed: 'fa-arrow-trend-up', pick_faded: 'fa-arrow-trend-down', pick_tail_verified: 'fa-circle-check', pick_fade_verified: 'fa-circle-check',
        picks_entered: 'fa-lock', forum_thread: 'fa-comments', forum_reply: 'fa-reply', feed_post: 'fa-pen', poll_vote: 'fa-square-poll-vertical',
        trivia_completed: 'fa-circle-question', user_followed: 'fa-user-plus', milestone: 'fa-trophy', units_milestone: 'fa-trophy', roi_milestone: 'fa-trophy',
        achievement_earned: 'fa-medal', contest_entered: 'fa-flag-checkered', contest_placed: 'fa-ranking-star', user_joined: 'fa-door-open', sim_run: 'fa-dice'
    };
    function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }

    function summaryHtml(s) {
        if (!s) return '';
        var parts = [];
        if (s.tails) parts.push('<span class="tmr-pa-stat"><b>' + esc(s.tails) + '</b> ' + (s.tails === 1 ? 'tail' : 'tails') + '</span>');
        if (s.fades) parts.push('<span class="tmr-pa-stat"><b>' + esc(s.fades) + '</b> ' + (s.fades === 1 ? 'fade' : 'fades') + '</span>');
        if (s.verified_with) parts.push('<span class="tmr-pa-stat is-v"><b>' + esc(s.verified_with) + '</b> ' + (s.verified_with === 1 ? 'verified pick with' : 'verified picks with') + '</span>');
        if (s.verified_against) parts.push('<span class="tmr-pa-stat is-v"><b>' + esc(s.verified_against) + '</b> ' + (s.verified_against === 1 ? 'verified pick against' : 'verified picks against') + '</span>');
        return parts.length ? '<div class="tmr-pa-stats" aria-label="How members reacted to this member\'s public picks">' + parts.join('') + '</div>' : '';
    }
    function sectionHtml(events, summary) {
        var stats = summaryHtml(summary);
        if (!events.length && !stats) return '';
        var rows = events.map(function (ev) {
            var inner = '<i class="fas ' + (ICON[ev.type] || 'fa-bolt') + '" aria-hidden="true"></i><span class="tmr-pa-text">' + esc(ev.text) + '</span><span class="tmr-pa-time">' + esc(ago(ev.created_at)) + '</span>';
            return ev.href && /^\//.test(ev.href)
                ? '<li><a class="tmr-pa-row" href="' + esc(ev.href) + '">' + inner + '</a></li>'
                : '<li><div class="tmr-pa-row">' + inner + '</div></li>';
        }).join('');
        return '<div class="tmrx-section" id="tmrxActivity">' +
            '<div class="tmrx-section-head"><div>' +
            '<div class="tmrx-section-title">Recent Activity</div>' +
            '<div class="tmrx-section-sub">Picks, posts and reactions on TrustMyRecord, newest first.</div></div>' +
            (events.length ? '<div class="tmrx-meta">' + plural(events.length, 'update', 'updates') + '</div>' : '') + '</div>' +
            stats +
            (rows ? '<ul class="tmr-pa-list">' + rows + '</ul>' : '') +
        '</div>';
    }

    var done = false;
    function mount() {
        if (done) return;
        var anchor = document.getElementById('tmrxPublicLedger');
        var name = profileName();
        if (!anchor || !name) return;
        done = true;
        fetch(apiBase() + '/activity/user/' + encodeURIComponent(name) + '?limit=12', { credentials: 'omit' })
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (d) {
                if (!d || !d.ok) return;
                var html = sectionHtml(Array.isArray(d.events) ? d.events : [], d.summary || null);
                var old = document.getElementById('tmrxActivity');
                if (old && old.parentNode) old.parentNode.removeChild(old);
                if (html) anchor.insertAdjacentHTML('beforebegin', html);
            })
            .catch(function () { done = false; });
    }
    function boot() {
        mount();
        try {
            var pending = false;
            new MutationObserver(function () {
                if (done || pending) return;
                pending = true;
                setTimeout(function () { pending = false; mount(); }, 300);
            }).observe(document.documentElement, { childList: true, subtree: true });
        } catch (e) {}
        window.addEventListener('tmr-auth-changed', function () { if (!document.getElementById('tmrxActivity')) { done = false; mount(); } });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();

    window.TMRProfileActivity = { _sectionHtml: sectionHtml, _ago: ago };
})();
