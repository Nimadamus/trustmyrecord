/**
 * TrustMyRecord — POLL → VERIFIED PICK (poll-pick-bridge.js)
 * ==========================================================
 *
 * WHAT IT DOES
 *
 * A poll vote is already a prediction. After a member votes on a poll that maps
 * cleanly onto a game TMR can lock, this offers one voluntary next step: put
 * that same prediction on your verified record.
 *
 * WHAT IT DOES NOT DO
 *
 * It never creates a pick. It never prices a pick. It has no submit path. What
 * it does is write the SAME `tmr_sim_pick_intent` localStorage record the MLB
 * simulator has been writing since July and send the member to
 * /sportsbook/?simpick=1, where static/js/sim-pick-prefill.js — already in
 * production, not modified by this feature beyond one line of banner copy —
 * finds the matchup on the board, reads the CURRENT moneyline price from the
 * board's own bookmakers, and preselects it. The member still chooses units and
 * presses the ordinary submit button.
 *
 * So the resulting row in `picks` is an ordinary pick: same endpoint, same
 * grading, same units, same leaderboard maths, same feed, same timestamps. The
 * only thing this file changes is how the member got to the board.
 *
 * ELIGIBILITY IS THE SERVER'S DECISION, NEVER THIS FILE'S
 *
 * GET /api/polls/:id/pick-bridge answers "is this convertible, and to which
 * team". It refuses opinion polls, trivia, tiebreakers, player props, totals,
 * closed polls, started games, and any option that does not unambiguously name
 * one of the two teams. This file renders whatever the server allows and
 * nothing else — it does no mapping and makes no inference of its own.
 *
 * Analytics (GA4 + dataLayer):
 *   poll_pick_bridge_shown    { poll_id, sport, zero_pick_member }
 *   poll_pick_bridge_declined { poll_id }
 *   poll_pick_bridge_clicked  { poll_id, sport, zero_pick_member, pick_team, line }
 * Every event carries poll_type ('winner' | 'game_total') and market so the one
 * funnel can be split by poll type instead of being duplicated.
 *
 * Two entry points, because the site has two voting paths: offer() for a single
 * poll (submitVote), and offerFirstEligible() for the daily quiz, which submits
 * every child answer in one request (submitGameVote). The quiz is where the
 * convertible "Who wins" questions actually live, so wiring only the first
 * would have shipped a feature that never fires.
 * The completion half is already emitted by sim-pick-prefill.js as
 * simulator_pick_submitted / simulator_verified_pick_created, which carry
 * source:'poll' for intents written here — so vote → shown → clicked → locked
 * is one funnel with no new analytics system.
 */
(function () {
    'use strict';

    if (window.TMRPollPickBridge) return;

    /* The intent contract owned by static/js/sim-pick-prefill.js. Same key,
       same shape, same six-hour TTL — this is a second writer of an existing
       record, not a new mechanism. */
    var INTENT_KEY = 'tmr_sim_pick_intent';
    var ELEMENT_ID = 'tmr-poll-bridge';
    /* A daily quiz runs to ten questions. Asking about every one of them after
       a single submission would be ten requests to learn one answer, so the
       walk stops early. */
    var MAX_QUIZ_LOOKUPS = 12;

    /* One seam, so the handoff can be asserted in a test without jsdom
       refusing to navigate. Production behaviour is a plain location change. */
    var navigate = function (url) { window.location.href = url; };

    function log() {
        try { console.log.apply(console, ['[TMR PollBridge]'].concat([].slice.call(arguments))); } catch (e) {}
    }

    function track(name, params) {
        var payload = params || {};
        try { if (typeof window.gtag === 'function') window.gtag('event', name, payload); } catch (e) {}
        try {
            window.dataLayer = window.dataLayer || [];
            window.dataLayer.push(Object.assign({ event: name }, payload));
        } catch (e) {}
    }

    function apiReady() {
        if (!window.api || typeof window.api.request !== 'function') return null;
        return (window.api.ready && typeof window.api.ready.then === 'function')
            ? window.api.ready.catch(function () {})
            : Promise.resolve();
    }

    /* Reuses the strip first-pick-onboarding.js already ships sitewide, so this
       introduces no new visual language and no layout change. If that file has
       not injected its stylesheet on this page, a copy of the strip rules only
       is added under its own id. */
    function ensureStyles() {
        if (document.getElementById('tmr-fp-styles')) return;
        if (document.getElementById('tmr-pb-styles')) return;
        var css = [
            '.tmr-fp-reminder{position:relative;display:flex;align-items:center;gap:12px;flex-wrap:wrap;',
            'max-width:1180px;margin:12px auto;padding:11px 44px 11px 15px;border-radius:12px;',
            'background:linear-gradient(90deg,rgba(0,110,124,0.30),rgba(10,17,24,0.97));',
            'border:1px solid rgba(0,255,255,0.26);color:#dbe6f3;font:600 0.92rem/1.4 var(--font,Inter,sans-serif);}',
            '.tmr-fp-reminder__icon{flex:0 0 auto;width:30px;height:30px;border-radius:9px;display:flex;',
            'align-items:center;justify-content:center;background:rgba(0,255,255,0.14);color:#67e8f9;font-size:14px;}',
            '.tmr-fp-reminder__text{flex:1 1 200px;}',
            '.tmr-fp-reminder__text strong{color:#f8fafc;font-weight:800;}',
            '.tmr-fp-btn{display:inline-flex;align-items:center;justify-content:center;gap:9px;',
            'border-radius:11px;letter-spacing:.02em;cursor:pointer;border:1px solid transparent;',
            'text-decoration:none;transition:transform .14s ease,box-shadow .14s ease;}',
            '.tmr-fp-btn:hover{transform:translateY(-2px);}',
            '.tmr-fp-reminder .tmr-fp-btn{padding:9px 16px;font:800 0.85rem/1 var(--font,Inter,sans-serif);}',
            '#' + ELEMENT_ID + ' .tmr-fp-btn--primary{background:linear-gradient(135deg,#00ffff,#67e8f9) !important;',
            'color:#04111a !important;box-shadow:0 12px 30px rgba(0,255,255,0.24) !important;text-decoration:none !important;}',
            '.tmr-fp-reminder__close{position:absolute;top:8px;right:10px;background:transparent;border:0;',
            'color:#7f8ea6;font-size:18px;line-height:1;cursor:pointer;padding:4px 6px;}',
            '#' + ELEMENT_ID + ' .tmr-fp-reminder__close{background:transparent !important;border:0 !important;',
            'box-shadow:none !important;color:#7f8ea6 !important;}',
            '.tmr-fp-reminder__close:hover{color:#e2e8f0 !important;}',
            '.tmr-fp-reminder--light{background:#FFFFFF;background-image:none;border-color:#D2DEEA;color:#2E4459;',
            'box-shadow:0 1px 2px rgba(7,24,42,0.04);}',
            '.tmr-fp-reminder--light .tmr-fp-reminder__icon{background:rgba(12,148,140,0.12);color:#0C948C;}',
            '.tmr-fp-reminder--light .tmr-fp-reminder__text strong{color:#07182A;}',
            '#' + ELEMENT_ID + '.tmr-fp-reminder--light .tmr-fp-reminder__close{color:#6B7C8F !important;}',
            '.tmr-fp-reminder--light .tmr-fp-reminder__close:hover{color:#07182A !important;}',
            '#' + ELEMENT_ID + '.tmr-fp-reminder--light .tmr-fp-btn--primary{background:#0C948C !important;',
            'color:#FFFFFF !important;box-shadow:0 1px 2px rgba(7,24,42,0.10) !important;}',
            '@media(max-width:640px){.tmr-fp-reminder{margin:10px 0;}.tmr-fp-reminder .tmr-fp-btn{flex:1 1 100%;}}'
        ].join('');
        var style = document.createElement('style');
        style.id = 'tmr-pb-styles';
        style.textContent = css;
        (document.head || document.documentElement).appendChild(style);
    }

    function remove() {
        var el = document.getElementById(ELEMENT_ID);
        if (el && el.parentNode) el.parentNode.removeChild(el);
    }

    /* Is this member still on zero verified picks? Reuses the progression
       endpoint built for the pick nudge — this file adds no counting of its
       own. A failure here is not fatal: it only affects an analytics label. */
    function zeroPickMember() {
        if (!window.api || typeof window.api.request !== 'function') return Promise.resolve(null);
        return window.api.request('/participation/my-progress')
            .then(function (p) { return !!(p && p.picks && p.picks.total === 0); })
            .catch(function () { return null; });
    }

    function render(answer, mount, isZeroPick) {
        remove();
        ensureStyles();

        var intent = answer.intent || {};
        /* poll_type rides the SAME funnel rather than starting a second one, so
           winner and game_total can be compared inside one conversion rate. */
        var facts = {
            poll_id: answer.poll_id,
            sport: intent.sport || 'MLB',
            poll_type: intent.poll_type || answer.poll_type || 'winner',
            market: intent.market || 'ml',
            zero_pick_member: isZeroPick === null ? 'unknown' : String(!!isZeroPick),
        };

        /* THEME_MATCH_20260824: /polls/ is a light page and the shared strip is
           styled for the homepage's dark band. Match the surface. */
        var light = (function (node) {
            try {
                var el = node;
                for (var hops = 0; el && hops < 6; hops++, el = el.parentElement) {
                    var bg = window.getComputedStyle(el).backgroundColor;
                    var m = bg && bg.match(/rgba?\(([^)]+)\)/);
                    if (!m) continue;
                    var parts = m[1].split(',').map(function (x) { return parseFloat(x); });
                    if (parts.length > 3 && parts[3] < 0.5) continue;
                    return ((0.299 * parts[0] + 0.587 * parts[1] + 0.114 * parts[2]) / 255) > 0.6;
                }
            } catch (e) {}
            return false;
        })(mount);

        var bar = document.createElement('div');
        bar.id = ELEMENT_ID;
        bar.className = 'tmr-fp-reminder' + (light ? ' tmr-fp-reminder--light' : '');
        bar.setAttribute('role', 'status');
        bar.innerHTML =
            '<span class="tmr-fp-reminder__icon" aria-hidden="true">&#9673;</span>' +
            '<span class="tmr-fp-reminder__text"><strong></strong> <span class="tmr-pb-rest"></span></span>' +
            '<button type="button" class="tmr-fp-btn tmr-fp-btn--primary" id="tmr-pb-cta"></button>' +
            '<button type="button" class="tmr-fp-reminder__close" aria-label="No thanks">&times;</button>';

        /* textContent for everything server-derived — a team name is data. */
        /* What the member actually chose, in their own terms. A totals poll has
           no team, so the sentence names the side and the line instead. */
        var choice = intent.pick_team
            ? intent.pick_team
            : (intent.side || '') + ' ' + (intent.line == null ? '' : intent.line);
        bar.querySelector('strong').textContent = 'Put this prediction on your verified record.';
        bar.querySelector('.tmr-pb-rest').textContent =
            'You picked ' + String(choice).trim() + '. Lock it as a real pick and it grades itself.';
        var cta = bar.querySelector('#tmr-pb-cta');
        cta.textContent = isZeroPick ? 'Start My Record' : 'Lock This Pick';

        mount.insertBefore(bar, mount.firstChild);
        track('poll_pick_bridge_shown', facts);

        cta.addEventListener('click', function () {
            /* Write the intent the existing prefill script consumes, then hand
               over to the ordinary sportsbook flow. Nothing is submitted here. */
            try {
                /* Written verbatim from the server's answer. This file invents
                   no line, no side and no team: whatever the exact-line gate
                   approved is what the prefill receives. */
                localStorage.setItem(INTENT_KEY, JSON.stringify({
                    sport: intent.sport || 'MLB',
                    source: 'poll',
                    poll_id: answer.poll_id,
                    poll_type: intent.poll_type || 'winner',
                    market: intent.market || 'ml',
                    pick_team: intent.pick_team,
                    side: intent.side,
                    line: intent.line,
                    odds: intent.odds,
                    home_team_name: intent.home_team_name,
                    away_team_name: intent.away_team_name,
                    board_game_id: intent.board_game_id,
                    ts: Date.now()
                }));
            } catch (e) {
                log('could not store intent', e && e.message);
            }
            track('poll_pick_bridge_clicked', Object.assign({ pick_team: intent.pick_team || null, line: intent.line == null ? null : intent.line }, facts));
            navigate('/sportsbook/?simpick=1');
        });

        bar.querySelector('.tmr-fp-reminder__close').addEventListener('click', function () {
            track('poll_pick_bridge_declined', facts);
            remove();
        });
    }

    /**
     * Ask the server whether the vote just cast is convertible, and offer it if
     * so. Safe to call after every vote: an ineligible poll is a 200 with a
     * reason and renders nothing.
     *
     * @param {number|string} pollId
     * @param {Element} [mountEl] where to place the strip; defaults to the poll
     *        detail container, then to <main>.
     */
    function offer(pollId, mountEl) {
        remove();
        var ready = apiReady();
        if (!ready || !pollId) return Promise.resolve(false);

        var mount = mountEl
            || document.getElementById('pollDetail')
            || document.querySelector('main')
            || document.body;

        return ready.then(function () {
            return window.api.request('/polls/' + encodeURIComponent(pollId) + '/pick-bridge');
        }).then(function (answer) {
            var hasChoice = answer && answer.intent && (answer.intent.pick_team ||
                ((answer.intent.market === 'over' || answer.intent.market === 'under') &&
                 answer.intent.line != null));
            if (!answer || !answer.eligible || !hasChoice) {
                log('not convertible:', (answer && answer.reason) || 'no answer');
                return false;
            }
            return zeroPickMember().then(function (isZero) {
                render(answer, mount, isZero);
                return true;
            });
        }).catch(function (err) {
            /* Never let a measurement or eligibility failure disturb voting.
               The vote already succeeded; this is strictly additive. */
            log('pick-bridge failed', (err && err.message) || err);
            return false;
        });
    }

    /**
     * The daily quiz submits every answer at once, so the convertible question
     * is one of several children rather than the poll the member is "on".
     * Asks each in turn and offers the FIRST that is convertible.
     *
     * Almost every child is a prop or a total and refuses immediately, so this
     * is a short walk in practice; it is capped anyway so a long quiz cannot
     * turn one submission into a burst of requests. Sequential on purpose —
     * the first eligible answer wins and the rest are never asked.
     *
     * @param {Array<number|string>} pollIds child poll ids, in display order
     * @param {Element} [mountEl]
     */
    function offerFirstEligible(pollIds, mountEl) {
        var ids = (pollIds || []).filter(Boolean).slice(0, MAX_QUIZ_LOOKUPS);
        if (!ids.length) return Promise.resolve(false);
        var i = 0;
        function next() {
            if (i >= ids.length) return Promise.resolve(false);
            var id = ids[i++];
            return offer(id, mountEl).then(function (shown) {
                return shown ? true : next();
            });
        }
        return next();
    }

    window.TMRPollPickBridge = {
        offer: offer,
        offerFirstEligible: offerFirstEligible,
        remove: remove,
        INTENT_KEY: INTENT_KEY,
        /* Test seam only. Overriding this in production would break the
           handoff, so nothing on the site does. */
        _setNavigate: function (fn) { navigate = fn; }
    };
})();
