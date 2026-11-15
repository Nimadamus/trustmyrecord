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
        pick_tailed: 'fa-arrow-trend-up', pick_faded: 'fa-arrow-trend-down', pick_tail_verified: 'fa-circle-check', pick_fade_verified: 'fa-people-arrows', duel_won: 'fa-trophy',
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

    /* CREATOR_REFERRALS_20261114: the member's own share link and how many
       members joined from links they shared. Owner only (the API needs their
       sign in), counts only, and no reward is attached to any of it. */
    function creatorHtml(d) {
        if (!d || !d.link || !d.stats) return '';
        var st = d.stats;
        var chip = function (n, label, cls) { return '<span class="tmr-pa-stat' + (cls || '') + '"><b>' + esc(Number(n) || 0) + '</b> ' + esc(label) + '</span>'; };
        var sources = [];
        if (st.from_picks) sources.push(plural(st.from_picks, 'from a pick', 'from picks'));
        if (st.from_profile) sources.push(st.from_profile + ' from your profile');
        if (st.from_feed) sources.push(st.from_feed + ' from the feed');
        if (st.from_other) sources.push(st.from_other + ' from other links');
        return '<div class="tmrx-section" id="tmrxCreator">' +
            '<div class="tmrx-section-head"><div>' +
            '<div class="tmrx-section-title">Your Share Link</div>' +
            '<div class="tmrx-section-sub">Only you see this. When someone joins TrustMyRecord from a link you shared, they are counted here. You see counts, never who joined.</div></div></div>' +
            '<div class="tmr-cr-linkrow"><input class="tmr-cr-link" id="tmrCrLink" type="text" readonly value="' + esc(d.link) + '" aria-label="Your share link">' +
            '<button type="button" class="tmr-cr-copy" id="tmrCrCopy">Copy link</button></div>' +
            '<div class="tmr-pa-stats">' + chip(st.joined, st.joined === 1 ? 'member joined' : 'members joined') + chip(st.joined_30d, 'in the last 30 days') +
                chip(st.made_a_pick, st.made_a_pick === 1 ? 'has made a pick' : 'have made a pick', ' is-v') + '</div>' +
            (sources.length ? '<p class="tmr-cr-note">' + esc(sources.join(' \u00b7 ')) + '</p>' : '') +
            '<p class="tmr-cr-note">Links you share with the Share button on picks, posts and your profile already carry your name.</p>' +
        '</div>';
    }
    var creatorDone = false;
    function mountCreator() {
        if (creatorDone) return;
        var anchor = document.getElementById('tmrxPublicLedger');
        var name = profileName();
        var me = window.auth && window.auth.currentUser && window.auth.currentUser.username;
        var c = window.api;
        if (!anchor || !name || !me || !c || typeof c.request !== 'function') return;
        if (String(name).toLowerCase() !== String(me).toLowerCase()) return;   // somebody else's profile: nothing
        creatorDone = true;
        c.request('/referrals/creator').then(function (d) {
            var html = creatorHtml(d);
            var old = document.getElementById('tmrxCreator');
            if (old && old.parentNode) old.parentNode.removeChild(old);
            if (html) anchor.insertAdjacentHTML('beforebegin', html);
        }).catch(function () { /* older API: no section */ });
    }
    document.addEventListener('click', function (e) {
        var b = e.target && e.target.closest ? e.target.closest('#tmrCrCopy') : null;
        if (!b) return;
        var input = document.getElementById('tmrCrLink'); if (!input) return;
        var ok = function () { b.textContent = 'Copied'; setTimeout(function () { b.textContent = 'Copy link'; }, 1800); };
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(input.value).then(ok, function () { input.select(); document.execCommand('copy'); ok(); });
            else { input.select(); document.execCommand('copy'); ok(); }
        } catch (x) { input.select(); }
    });

    /* HEAD_TO_HEAD_20261115: the member's head to head record. A head to head is
       two real picks on opposite sides of one game (GET /api/duels/user/<name>).
       Public, like the picks it is made of; nothing is drawn when there is none. */
    function h2hHtml(d, name) {
        if (!d || !d.ok || !d.record || !Array.isArray(d.duels) || !d.duels.length) return '';
        var r = d.record, me = String(d.username || name || '').toLowerCase();
        var chip = function (n, label, cls) { return '<span class="tmr-pa-stat' + (cls || '') + '"><b>' + esc(Number(n) || 0) + '</b> ' + esc(label) + '</span>'; };
        var chips = chip(r.wins, r.wins === 1 ? 'win' : 'wins', ' is-v') + chip(r.losses, r.losses === 1 ? 'loss' : 'losses') +
            (r.level ? chip(r.level, 'level') : '') + (r.open ? chip(r.open, 'in play') : '');
        var rivals = (d.rivals || []).map(function (x) {
            return '<a class="tmr-h2h-rival" href="/profile/?user=' + encodeURIComponent(x.username) + '">vs ' + esc(x.username) + ' <b>' + esc(x.wins) + '-' + esc(x.losses) + (x.level ? '-' + esc(x.level) : '') + '</b></a>';
        }).join('');
        var rows = d.duels.map(function (x) {
            var mine = String(x.owner.username).toLowerCase() === me ? x.owner : x.challenger;
            var theirs = mine === x.owner ? x.challenger : x.owner;
            var state = x.status === 'open' ? ['In play', ''] : (!x.winner_username ? ['Level', ''] : (String(x.winner_username).toLowerCase() === me ? ['Won', ' is-won'] : ['Lost', ' is-lost']));
            var when = x.status === 'open' ? '' : ago(x.settled_at);
            return '<li><a class="tmr-pa-row tmr-h2h-row" href="/pick/?id=' + encodeURIComponent(mine.pick_id) + '">' +
                '<span class="tmr-h2h-chip' + state[1] + '">' + state[0] + '</span>' +
                '<span class="tmr-pa-text"><b>' + esc(mine.pick_text) + '</b> vs ' + esc(theirs.username) + '\u2019s ' + esc(theirs.pick_text) +
                    (x.matchup ? '<span class="tmr-h2h-sub">' + esc((x.league ? x.league + ' \u00b7 ' : '') + x.matchup) + '</span>' : '') + '</span>' +
                '<span class="tmr-pa-time">' + esc(when) + '</span></a></li>';
        }).join('');
        return '<div class="tmrx-section" id="tmrxH2H">' +
            '<div class="tmrx-section-head"><div>' +
            '<div class="tmrx-section-title">Head to Head</div>' +
            '<div class="tmrx-section-sub">Two members, two real picks on opposite sides of one game. Nothing is staked; each pick counts on its owner\u2019s record.</div></div>' +
            '<div class="tmrx-meta">' + esc(r.wins) + '-' + esc(r.losses) + (r.level ? '-' + esc(r.level) : '') + '</div></div>' +
            '<div class="tmr-pa-stats">' + chips + '</div>' +
            (rivals ? '<div class="tmr-h2h-rivals">' + rivals + '</div>' : '') +
            '<ul class="tmr-pa-list">' + rows + '</ul>' +
        '</div>';
    }
    var h2hDone = false;
    function mountH2H() {
        if (h2hDone) return;
        var anchor = document.getElementById('tmrxPublicLedger');
        var name = profileName();
        if (!anchor || !name) return;
        h2hDone = true;
        fetch(apiBase() + '/duels/user/' + encodeURIComponent(name) + '?limit=10', { credentials: 'omit' })
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (d) {
                var html = h2hHtml(d, name);
                var old = document.getElementById('tmrxH2H');
                if (old && old.parentNode) old.parentNode.removeChild(old);
                if (html) anchor.insertAdjacentHTML('beforebegin', html);
            })
            .catch(function () { h2hDone = false; });
    }

    var done = false;
    function mount() {
        mountCreator();
        mountH2H();
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
                if ((done && creatorDone && h2hDone) || pending) return;
                pending = true;
                setTimeout(function () { pending = false; mount(); }, 300);
            }).observe(document.documentElement, { childList: true, subtree: true });
        } catch (e) {}
        window.addEventListener('tmr-auth-changed', function () {
            creatorDone = false; mountCreator();
            if (!document.getElementById('tmrxActivity')) { done = false; mount(); }
        });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();

    window.TMRProfileActivity = { _sectionHtml: sectionHtml, _creatorHtml: creatorHtml, _h2hHtml: h2hHtml, _ago: ago };
})();
