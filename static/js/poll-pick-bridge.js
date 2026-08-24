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
 *   poll_pick_bridge_clicked  { poll_id, sport, zero_pick_member, pick_team }
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
        var facts = {
            poll_id: answer.poll_id,
            sport: intent.sport || 'MLB',
            zero_pick_member: isZeroPick === null ? 'unknown' : String(!!isZeroPick),
        };

        var bar = document.createElement('div');
        bar.id = ELEMENT_ID;
        bar.className = 'tmr-fp-reminder';
        bar.setAttribute('role', 'status');
        bar.innerHTML =
            '<span class="tmr-fp-reminder__icon" aria-hidden="true">&#9673;</span>' +
            '<span class="tmr-fp-reminder__text"><strong></strong> <span class="tmr-pb-rest"></span></span>' +
            '<button type="button" class="tmr-fp-btn tmr-fp-btn--primary" id="tmr-pb-cta"></button>' +
            '<button type="button" class="tmr-fp-reminder__close" aria-label="No thanks">&times;</button>';

        /* textContent for everything server-derived — a team name is data. */
        bar.querySelector('strong').textContent = 'Put this prediction on your verified record.';
        bar.querySelector('.tmr-pb-rest').textContent =
            'You picked ' + intent.pick_team + '. Lock it as a real pick and it grades itself.';
        var cta = bar.querySelector('#tmr-pb-cta');
        cta.textContent = isZeroPick ? 'Start My Record' : 'Lock This Pick';

        mount.insertBefore(bar, mount.firstChild);
        track('poll_pick_bridge_shown', facts);

        cta.addEventListener('click', function () {
            /* Write the intent the existing prefill script consumes, then hand
               over to the ordinary sportsbook flow. Nothing is submitted here. */
            try {
                localStorage.setItem(INTENT_KEY, JSON.stringify({
                    sport: intent.sport || 'MLB',
                    source: 'poll',
                    poll_id: answer.poll_id,
                    pick_team: intent.pick_team,
                    home_team_name: intent.home_team_name,
                    away_team_name: intent.away_team_name,
                    ts: Date.now()
                }));
            } catch (e) {
                log('could not store intent', e && e.message);
            }
            track('poll_pick_bridge_clicked', Object.assign({ pick_team: intent.pick_team }, facts));
            navigate('/sportsbook/?simpick=1');
        });

        bar.querySelector('.tmr-fp-reminder__close').addEventListener('click', function () {
            track('poll_pick_bridge_declined', { poll_id: answer.poll_id });
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
            if (!answer || !answer.eligible || !answer.intent || !answer.intent.pick_team) {
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

    window.TMRPollPickBridge = {
        offer: offer,
        remove: remove,
        INTENT_KEY: INTENT_KEY,
        /* Test seam only. Overriding this in production would break the
           handoff, so nothing on the site does. */
        _setNavigate: function (fn) { navigate = fn; }
    };
})();
