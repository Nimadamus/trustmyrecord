/* ============================================================================
 * TMR duplicate-pick guard, front end (DUPLICATE_GUARD_UI_20260911 — Nima, F-10)
 *
 * The backend has been answering a re-submitted pick with a rich 409 since the
 * guard shipped: code DUPLICATE_PICK, the existing ticket, whether units may
 * still be added, how many, and the endpoint to add them at. Nothing in the
 * front end read any of it. A member who tried to lock a pick they already held
 * got the generic "Pick Not Submitted: <backend string>" banner, and the add
 * units path the backend offers was unreachable from the sportsbook.
 *
 * This module is that missing surface. It renders three backend answers that
 * are decisions rather than failures:
 *
 *   DUPLICATE_PICK             you already hold this wager. Add units to it, or
 *                              keep what you have.
 *   PRICE_MOVED                the number moved between render and click. Shows
 *                              both prices and lets the member take the new one
 *                              or walk away. Never swaps it in silently.
 *   EXPOSURE_CAP_*             five units of RISK is the ceiling, per ticket
 *                              and per side of a game. Says what is left.
 *   PAYOUT_CAP_EXCEEDED        one wager may not move a record further up than
 *                              a run of ordinary picks can. Says the maximum
 *                              stake at this price.
 *
 * Self-contained: its own DOM, its own styles, no dependency on the slip's
 * markup beyond the API client that is handed to it. If it fails to load, the
 * slip keeps its previous behaviour and shows the plain banner.
 * ========================================================================== */
(function () {
    'use strict';

    var STYLE_ID = 'tmr-dupguard-style';
    var ROOT_ID = 'tmr-dupguard-root';

    function esc(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function signed(n) {
        var v = Number(n);
        if (!isFinite(v)) return '';
        return (v > 0 ? '+' : '') + v;
    }

    function ensureStyles() {
        if (document.getElementById(STYLE_ID)) return;
        var style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = [
            '#' + ROOT_ID + '{position:fixed;inset:0;z-index:99999;display:flex;align-items:center;',
            'justify-content:center;padding:16px;background:rgba(8,12,10,.72);backdrop-filter:blur(2px)}',
            '#' + ROOT_ID + '[hidden]{display:none!important}',
            '.tmr-dg{background:#131a16;color:#e9efe9;border:1px solid #2c3a32;border-radius:10px;',
            'max-width:440px;width:100%;box-shadow:0 18px 48px -20px rgba(0,0,0,.9);font-size:14px;line-height:1.55}',
            '.tmr-dg h4{margin:0;padding:16px 18px 12px;font-size:16px;border-bottom:1px solid #222d27}',
            '.tmr-dg .tmr-dg-body{padding:14px 18px}',
            '.tmr-dg p{margin:0 0 10px}',
            '.tmr-dg .tmr-dg-ticket{background:#0d1310;border:1px solid #222d27;border-radius:6px;',
            'padding:10px 12px;margin:10px 0;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12.5px;color:#b9c6bd}',
            '.tmr-dg .tmr-dg-ticket b{color:#e9efe9}',
            '.tmr-dg .tmr-dg-note{color:#93a39a;font-size:12.5px;margin-top:8px}',
            '.tmr-dg .tmr-dg-row{display:flex;gap:8px;align-items:center;margin:12px 0 4px;flex-wrap:wrap}',
            '.tmr-dg label{font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#93a39a}',
            '.tmr-dg input[type=number]{width:92px;background:#0d1310;border:1px solid #2c3a32;color:#e9efe9;',
            'border-radius:5px;padding:7px 9px;font-size:14px;font-variant-numeric:tabular-nums}',
            '.tmr-dg .tmr-dg-actions{display:flex;gap:8px;padding:12px 18px 16px;border-top:1px solid #222d27;flex-wrap:wrap}',
            '.tmr-dg button{flex:1 1 140px;border-radius:6px;padding:10px 14px;font-size:13.5px;font-weight:600;',
            'cursor:pointer;border:1px solid transparent}',
            '.tmr-dg .tmr-dg-primary{background:#1f6b4a;color:#fff}',
            '.tmr-dg .tmr-dg-primary:disabled{opacity:.5;cursor:not-allowed}',
            '.tmr-dg .tmr-dg-ghost{background:transparent;color:#b9c6bd;border-color:#2c3a32}',
            '.tmr-dg .tmr-dg-error{color:#f0837a;margin-top:10px;font-size:12.5px}',
            '.tmr-dg button:focus-visible,.tmr-dg input:focus-visible{outline:2px solid #6dcf9e;outline-offset:2px}',
            '@media (max-width:420px){.tmr-dg button{flex:1 1 100%}}',
        ].join('');
        document.head.appendChild(style);
    }

    function root() {
        var el = document.getElementById(ROOT_ID);
        if (!el) {
            el = document.createElement('div');
            el.id = ROOT_ID;
            el.hidden = true;
            el.setAttribute('role', 'dialog');
            el.setAttribute('aria-modal', 'true');
            document.body.appendChild(el);
            el.addEventListener('click', function (event) {
                if (event.target === el) close();
            });
            document.addEventListener('keydown', function (event) {
                if (event.key === 'Escape' && !el.hidden) close();
            });
        }
        return el;
    }

    function close() {
        var el = document.getElementById(ROOT_ID);
        if (el) { el.hidden = true; el.innerHTML = ''; }
    }

    function open(html) {
        ensureStyles();
        var el = root();
        el.innerHTML = html;
        el.hidden = false;
        var focusable = el.querySelector('input, button');
        if (focusable) { try { focusable.focus(); } catch (_) {} }
    }

    /** "Los Angeles Dodgers -1.5 (-180)" from the existing_pick block. */
    function describe(pick) {
        if (!pick) return 'this wager';
        var parts = [pick.selection];
        var line = pick.line_snapshot;
        var hasLineInText = /[-+]?\d+(\.\d+)?$/.test(String(pick.selection || '').trim());
        if (line != null && !hasLineInText) {
            var isSpread = String(pick.market_type || '').indexOf('spread') !== -1;
            parts.push(isSpread && Number(line) > 0 ? '+' + line : String(line));
        }
        var odds = Number(pick.odds_snapshot);
        return parts.join(' ') + (isFinite(odds) ? ' (' + signed(odds) + ')' : '');
    }

    /* ---------------------------------------------------------------- */
    /* DUPLICATE_PICK                                                    */
    /* ---------------------------------------------------------------- */
    function showDuplicate(data, ctx) {
        var pick = data.existing_pick || {};
        var canAdd = !!data.can_add_units;
        var remaining = Number(data.units_remaining || 0);
        var mode = pick.stake_mode === 'to_win' ? 'to-win' : 'risk';
        var riskOnSide = data.risk_units_on_side;
        var maxRisk = data.max_risk_units != null ? data.max_risk_units : 5;

        var capLine = riskOnSide != null
            ? '<div class="tmr-dg-note">This side of the game is carrying <b>' + esc(riskOnSide)
              + 'u</b> of risk out of the ' + esc(maxRisk) + ' unit maximum.</div>'
            : '';

        var body = ''
            + '<p>You already have this pick. A wager is recorded once, so it grades once '
            + 'and shows on your record once.</p>'
            + '<div class="tmr-dg-ticket">'
            + 'Ticket <b>#' + esc(pick.ticket || pick.id) + '</b><br>'
            + esc(describe(pick)) + '<br>'
            + 'Currently <b>' + esc(pick.units) + 'u</b> ' + esc(mode)
            + (pick.game ? '<br>' + esc(pick.game.away_team) + ' at ' + esc(pick.game.home_team) : '')
            + '</div>'
            + capLine;

        if (canAdd && remaining > 0) {
            body += ''
                + '<p>You can put more behind the ticket you already hold. It stays one pick '
                + 'and one result.</p>'
                + '<div class="tmr-dg-row">'
                + '<label for="tmrDgUnits">Add units</label>'
                + '<input id="tmrDgUnits" type="number" min="0.5" max="' + esc(remaining) + '" step="0.5" value="'
                + esc(Math.min(1, remaining)) + '">'
                + '<span class="tmr-dg-note" style="margin:0">of ' + esc(remaining) + 'u available, in '
                + esc(mode) + ' units</span>'
                + '</div>'
                + '<div class="tmr-dg-error" id="tmrDgError" hidden></div>';
        } else {
            body += '<p class="tmr-dg-note">This side is already at the ' + esc(maxRisk)
                 + ' unit risk maximum, so no more can be added.</p>';
        }

        open(''
            + '<div class="tmr-dg">'
            + '<h4>You already have this pick</h4>'
            + '<div class="tmr-dg-body">' + body + '</div>'
            + '<div class="tmr-dg-actions">'
            + (canAdd && remaining > 0
                ? '<button type="button" class="tmr-dg-primary" id="tmrDgAdd">Add units to ticket #'
                  + esc(pick.ticket || pick.id) + '</button>' : '')
            + '<button type="button" class="tmr-dg-ghost" id="tmrDgClose">Keep what I have</button>'
            + '</div></div>');

        var closeBtn = document.getElementById('tmrDgClose');
        if (closeBtn) closeBtn.addEventListener('click', close);

        var addBtn = document.getElementById('tmrDgAdd');
        if (addBtn) {
            addBtn.addEventListener('click', function () {
                var input = document.getElementById('tmrDgUnits');
                var errorEl = document.getElementById('tmrDgError');
                var units = Number(input && input.value);
                function fail(message) {
                    if (!errorEl) return;
                    errorEl.textContent = message;
                    errorEl.hidden = false;
                }
                if (!isFinite(units) || units < 0.5) return fail('Enter at least 0.5 units.');
                if (units > remaining + 1e-9) return fail('You can add at most ' + remaining + 'u to this side.');
                addBtn.disabled = true;
                addBtn.textContent = 'Adding...';
                Promise.resolve()
                    .then(function () { return ctx.api.addUnitsToPick(pick.id, units, pick.stake_mode); })
                    .then(function (result) {
                        close();
                        if (typeof ctx.onAdded === 'function') ctx.onAdded(result, pick);
                    })
                    .catch(function (error) {
                        addBtn.disabled = false;
                        addBtn.textContent = 'Add units';
                        var data2 = error && error.data;
                        fail((data2 && (data2.error || data2.message)) || 'Could not add units. Try again.');
                    });
            });
        }
        return true;
    }

    /* ---------------------------------------------------------------- */
    /* PRICE_MOVED                                                       */
    /* ---------------------------------------------------------------- */
    function showPriceMoved(data, ctx) {
        open(''
            + '<div class="tmr-dg">'
            + '<h4>The price moved</h4>'
            + '<div class="tmr-dg-body">'
            + '<p>' + esc(data.selection || 'This selection') + ' is no longer at '
            + '<b>' + esc(signed(data.submitted_odds)) + '</b>. The board now has it at '
            + '<b>' + esc(signed(data.current_odds)) + '</b>.</p>'
            + '<p class="tmr-dg-note">Your record only ever shows a price the board actually '
            + 'offered, so nothing was locked at the old number.</p>'
            + '</div>'
            + '<div class="tmr-dg-actions">'
            + '<button type="button" class="tmr-dg-primary" id="tmrDgAccept">Lock it at '
            + esc(signed(data.current_odds)) + '</button>'
            + '<button type="button" class="tmr-dg-ghost" id="tmrDgClose">Leave it</button>'
            + '</div></div>');
        var closeBtn = document.getElementById('tmrDgClose');
        if (closeBtn) closeBtn.addEventListener('click', close);
        var accept = document.getElementById('tmrDgAccept');
        if (accept) {
            accept.addEventListener('click', function () {
                close();
                if (typeof ctx.onAcceptNewPrice === 'function') {
                    ctx.onAcceptNewPrice(Number(data.current_odds), data.current_line);
                }
            });
        }
        return true;
    }

    /* ---------------------------------------------------------------- */
    /* EXPOSURE_CAP_EXCEEDED / EXPOSURE_CAP_SIDE_EXCEEDED                */
    /* ---------------------------------------------------------------- */
    function showExposure(data) {
        var isSide = data.code === 'EXPOSURE_CAP_SIDE_EXCEEDED';
        var isPayout = data.code === 'PAYOUT_CAP_EXCEEDED';
        if (isPayout) {
            open(''
                + '<div class="tmr-dg">'
                + '<h4>That would win more than one wager may</h4>'
                + '<div class="tmr-dg-body"><p>' + esc(data.error || '') + '</p>'
                + '<div class="tmr-dg-ticket">'
                + 'This ticket would win <b>' + esc(data.to_win_units) + 'u</b><br>'
                + 'Maximum <b>' + esc(data.max_to_win_units) + 'u</b> from a single wager'
                + (data.max_units_at_this_price
                    ? '<br>At ' + esc(signed(data.odds_snapshot)) + ' you can stake up to <b>'
                      + esc(data.max_units_at_this_price) + 'u</b>' : '')
                + '</div>'
                + '<p class="tmr-dg-note">A record is a units ledger. One longshot is not allowed to '
                + 'move it further than a run of ordinary picks can.</p>'
                + '</div>'
                + '<div class="tmr-dg-actions">'
                + '<button type="button" class="tmr-dg-ghost" id="tmrDgClose">Back to the slip</button>'
                + '</div></div>');
            var c0 = document.getElementById('tmrDgClose');
            if (c0) c0.addEventListener('click', close);
            return true;
        }
        var detail = isSide
            ? '<div class="tmr-dg-ticket">'
              + 'Already open on this side <b>' + esc(data.side_risk_units) + 'u</b> of risk'
              + ' across ' + esc(data.side_tickets) + ' ticket' + (Number(data.side_tickets) === 1 ? '' : 's') + '<br>'
              + 'This ticket would add <b>' + esc(data.ticket_risk_units) + 'u</b><br>'
              + 'Maximum <b>' + esc(data.max_risk_units) + 'u</b> of risk per side'
              + '</div>'
              + '<p class="tmr-dg-note">A moved line is still a separate wager and you can still take '
              + 'it. It does not come with a fresh five units.</p>'
            : '<div class="tmr-dg-ticket">'
              + 'This ticket risks <b>' + esc(data.risk_units) + 'u</b><br>'
              + 'Maximum <b>' + esc(data.max_risk_units) + 'u</b> of risk per ticket'
              + (data.max_units_at_this_price
                  ? '<br>At ' + esc(signed(data.odds_snapshot)) + ' you can stake up to <b>'
                    + esc(data.max_units_at_this_price) + 'u</b>' : '')
              + '</div>'
              + '<p class="tmr-dg-note">On a favourite, "units" in to-win mode is profit, not what '
              + 'is at stake. The five unit maximum is measured on what is at stake.</p>';

        open(''
            + '<div class="tmr-dg">'
            + '<h4>' + (isSide ? 'That would pass the limit for this side' : 'That is over the unit limit') + '</h4>'
            + '<div class="tmr-dg-body"><p>' + esc(data.error || '') + '</p>' + detail + '</div>'
            + '<div class="tmr-dg-actions">'
            + '<button type="button" class="tmr-dg-ghost" id="tmrDgClose">Back to the slip</button>'
            + '</div></div>');
        var closeBtn = document.getElementById('tmrDgClose');
        if (closeBtn) closeBtn.addEventListener('click', close);
        return true;
    }

    /* ---------------------------------------------------------------- */
    /* Entry point                                                       */
    /* ---------------------------------------------------------------- */
    /**
     * @param {object} data  the backend response body
     * @param {object} ctx   { api, onAdded, onAcceptNewPrice }
     * @returns {boolean}    true when this module owned the answer and the
     *                       caller should NOT also show its generic banner.
     */
    function handle(data, ctx) {
        if (!data || !data.code) return false;
        try {
            if (data.code === 'DUPLICATE_PICK') return showDuplicate(data, ctx || {});
            if (data.code === 'PRICE_MOVED') return showPriceMoved(data, ctx || {});
            if (data.code === 'EXPOSURE_CAP_EXCEEDED' || data.code === 'EXPOSURE_CAP_SIDE_EXCEEDED'
                || data.code === 'PAYOUT_CAP_EXCEEDED') {
                return showExposure(data);
            }
        } catch (error) {
            try { console.error('[TMR][dupguard] render failed', error); } catch (_) {}
            return false; // fall back to the plain banner rather than swallow it
        }
        return false;
    }

    window.__tmrDuplicateGuardUI = { handle: handle, close: close };
}());
