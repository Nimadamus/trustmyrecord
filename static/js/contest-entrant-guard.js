/* CONTEST_ENTRANT_GUARD_20260917 (Nima: "fix it").
   2026-09-17 08:24 PDT a registered entrant opened Contest Mode, landed back on the regular sportsbook four
   seconds later, and made 9 MLB picks that went to his regular TMR record instead of the contest.
   On the REGULAR sportsbook (no ?contest=), while the JustBet MLB contest is live and the signed-in user is a
   registered entrant, this:
     1. shows a sticky red notice that picks here are NOT contest picks, with a Contest Mode button, and
     2. before any MLB pick is sent, asks once: contest pick (switch to Contest Mode, nothing is saved) or a
        regular TMR pick (sent as normal). The answer holds for 2 minutes so a multi-pick slip asks once.
   Contest Mode itself and everyone who is not an entrant are untouched. */
(function () {
    'use strict';
    var CONTEST_ID = 'justbet-mlb';
    try { if (new URLSearchParams(window.location.search).get('contest')) return; } catch (e) { return; }
    var apiBase = (window.TMR_API_BASE || window.API_BASE_URL || 'https://trustmyrecord-api.onrender.com').replace(/\/$/, '');
    var CONTEST_URL = '/sportsbook/?contest=' + CONTEST_ID;

    function token() {
        var keys = ['tmr_auth_token', 'trustmyrecord_token', 'accessToken', 'access_token', 'token', 'tmr_token'];
        for (var i = 0; i < keys.length; i++) { try { var v = localStorage.getItem(keys[i]); if (v) return v; } catch (e) {} }
        return null;
    }
    var entrant = null;            // null = unknown yet, true / false once checked
    var checking = null;
    var decided = { at: 0, regular: false };
    var pendingAsk = null;
    var origFetch = window.fetch.bind(window);

    function check() {
        if (checking) return checking;
        var t = token();
        if (!t) { entrant = false; return Promise.resolve(false); }
        checking = Promise.all([
            origFetch(apiBase + '/api/contests/' + CONTEST_ID, { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }),
            origFetch(apiBase + '/api/contests/' + CONTEST_ID + '/my-registration', { headers: { Authorization: 'Bearer ' + t }, cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; })
        ]).then(function (out) {
            var c = out[0] || {}, reg = (out[1] && out[1].registration) || null;
            var now = Date.now();
            var live = !!c.is_active && c.starts_at && Date.parse(c.starts_at) <= now && (!c.ends_at || Date.parse(c.ends_at) > now);
            var status = reg && reg.status ? String(reg.status) : 'none';
            entrant = !!(live && status !== 'none' && status !== 'rejected');
            if (entrant) showNotice();
            return entrant;
        }).catch(function () { entrant = false; return false; });
        return checking;
    }

    function css() {
        if (document.getElementById('tmr-entrant-guard-css')) return;
        var s = document.createElement('style');
        s.id = 'tmr-entrant-guard-css';
        s.textContent =
            '#tmr-entrant-guard{position:sticky;top:0;z-index:9500;display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:12px 16px;background:#8f1d17;color:#fff;font-family:Inter,system-ui,sans-serif;border-bottom:3px solid #f0c449}' +
            '#tmr-entrant-guard .g-t{flex:1;min-width:220px;font-weight:800;font-size:.95rem;line-height:1.35}' +
            '#tmr-entrant-guard .g-t small{display:block;font-weight:600;font-size:.82rem;opacity:.92}' +
            '#tmr-entrant-guard a{display:inline-flex;align-items:center;gap:8px;padding:10px 16px;border-radius:10px;background:linear-gradient(180deg,#f0c449,#d4a72c);color:#1a1206;font-weight:900;text-decoration:none;white-space:nowrap}' +
            '#tmr-entrant-modal{position:fixed;inset:0;z-index:100000;background:rgba(7,12,20,.72);display:flex;align-items:center;justify-content:center;padding:16px}' +
            '#tmr-entrant-modal .m{max-width:460px;width:100%;background:#fff;color:#07182A;border-radius:16px;padding:20px;border:3px solid #f0c449;font-family:Inter,system-ui,sans-serif}' +
            '#tmr-entrant-modal h3{margin:0 0 8px;font-size:1.15rem;font-weight:900}' +
            '#tmr-entrant-modal p{margin:0 0 16px;font-size:.95rem;line-height:1.45}' +
            '#tmr-entrant-modal .b{display:flex;flex-direction:column;gap:10px}' +
            '#tmr-entrant-modal button{padding:13px 14px;border-radius:12px;font-weight:900;font-size:.95rem;cursor:pointer;border:0}' +
            '#tmr-entrant-modal .c{background:linear-gradient(180deg,#f0c449,#d4a72c);color:#1a1206}' +
            '#tmr-entrant-modal .r{background:#e9eef5;color:#07182A}';
        document.head.appendChild(s);
    }
    function showNotice() {
        if (document.getElementById('tmr-entrant-guard') || !document.body) return;
        css();
        var n = document.createElement('div');
        n.id = 'tmr-entrant-guard';
        n.setAttribute('role', 'alert');
        n.innerHTML = '<div class="g-t">You are on the REGULAR sportsbook. Picks made here do NOT count for the JustBet MLB Contest.' +
            '<small>They go on your regular TrustMyRecord record. To make contest picks, switch to Contest Mode.</small></div>' +
            '<a href="' + CONTEST_URL + '">Switch to Contest Mode</a>';
        document.body.insertBefore(n, document.body.firstChild);
    }
    function ask() {
        return new Promise(function (resolve) {
            css();
            var m = document.createElement('div');
            m.id = 'tmr-entrant-modal';
            m.innerHTML = '<div class="m" role="dialog" aria-modal="true"><h3>Is this a contest pick?</h3>' +
                '<p>You are registered for the <strong>JustBet MLB Contest</strong>, but you are on the <strong>regular sportsbook</strong>. ' +
                'A pick made here goes on your regular TrustMyRecord record and does <strong>not</strong> count for the contest.</p>' +
                '<div class="b"><button type="button" class="c">Make contest picks instead (switch to Contest Mode)</button>' +
                '<button type="button" class="r">This is a regular TMR pick, submit it</button></div></div>';
            document.body.appendChild(m);
            m.querySelector('.c').addEventListener('click', function () { m.remove(); resolve('contest'); });
            m.querySelector('.r').addEventListener('click', function () { m.remove(); resolve('regular'); });
        });
    }
    function blocked(msg) {
        return new Response(JSON.stringify({ error: msg, code: 'CONTEST_ENTRANT_SWITCH' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }
    function isMlb(init) {
        try {
            var b = init && typeof init.body === 'string' ? JSON.parse(init.body) : {};
            var s = String(b.sport_key || b.sportKey || b.sport || '').toLowerCase();
            var g = String(b.game_id || b.gameId || '').toLowerCase();
            if (!s && !g) return true;
            return s.indexOf('baseball_mlb') !== -1 || s === 'mlb' || g.indexOf('baseball_mlb') !== -1 || (!s && g.indexOf('espn_') === 0);
        } catch (e) { return true; }
    }
    var PICKS_RE = /\/api\/picks(?:\/?$|\?)/;
    window.fetch = function (input, init) {
        try {
            var method = (init && init.method ? String(init.method) : (typeof input !== 'string' && input && input.method) || 'GET').toUpperCase();
            var url = typeof input === 'string' ? input : (input && input.url) || '';
            if (method === 'POST' && PICKS_RE.test(url) && isMlb(init)) {
                return check().then(function (isEntrant) {
                    if (!isEntrant) return origFetch(input, init);
                    if (Date.now() - decided.at < 120000) {
                        return decided.regular ? origFetch(input, init) : blocked('Not saved. Switching to Contest Mode so this counts for the JustBet MLB Contest.');
                    }
                    // one question per slip: concurrent submits share the same answer
                    if (!pendingAsk) pendingAsk = ask().then(function (choice) {
                        decided = { at: Date.now(), regular: choice === 'regular' };
                        pendingAsk = null;
                        if (choice !== 'regular') setTimeout(function () { window.location.href = CONTEST_URL; }, 50);
                        return choice;
                    });
                    return pendingAsk.then(function (choice) {
                        return choice === 'regular' ? origFetch(input, init) : blocked('Not saved. Switching to Contest Mode so this counts for the JustBet MLB Contest.');
                    });
                });
            }
        } catch (e) {}
        return origFetch(input, init);
    };
    function start() { check(); }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
