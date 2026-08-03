/* ============================================================================
 * TMR Multi-Pick Slip (MULTISLIP_20260730)
 *
 * Feature-flagged replacement for the single-pick slip on /sportsbook/.
 * Every selection stays an INDEPENDENT PICK — grouped submission
 * POSTs each one separately through the existing proven /api/picks endpoint
 * (via backend-api.js api.createPick).
 *
 * Flag:
 *   ON  : localStorage.tmr_multislip === '1'  (set once via /sportsbook/?multislip=1)
 *   OFF : anything else. ?multislip=0 clears the flag.
 *   Contest mode (?contest=...) always uses the legacy flow.
 * With the flag off this script installs nothing and the page behaves
 * exactly as before — that is the rollback path.
 *
 * Integration points (both additive, in
 * sportsbook-production-fix-persist-reliability.js):
 *   - selectOption() calls window.__tmrMultiSlip.onOptionSelected(option)
 *     first; a `true` return means the multi slip consumed the click.
 *   - boot() exports window.__tmrMultiSlipInternals so submission reuses the
 *     exact payload/validation helpers the proven single-pick path uses.
 * ========================================================================== */
(function () {
    'use strict';

    // ---- Feature flag / staged rollout ------------------------------------
    // Explicit choice always wins: ?multislip=1 (or stored '1') forces ON,
    // ?multislip=0 (or stored '0') forces OFF. Otherwise a stable per-browser
    // bucket (0-99, assigned once) enables the slip for ROLLOUT_PERCENT% of
    // browsers. Kill switch = deploy with ROLLOUT_PERCENT 0; explicit users
    // can always opt out with ?multislip=0.
    var ROLLOUT_PERCENT = 10;
    function resolveFlag() {
        try {
            var params = new URLSearchParams(window.location.search || '');
            var q = params.get('multislip');
            if (q === '1') { try { localStorage.setItem('tmr_multislip', '1'); } catch (_) {} return !params.get('contest'); }
            if (q === '0') { try { localStorage.setItem('tmr_multislip', '0'); } catch (_) {} return false; }
            if (params.get('contest')) return false; // contest flow stays legacy
            var stored = localStorage.getItem('tmr_multislip');
            if (stored === '1') return true;
            if (stored === '0') return false;
            var bucket = parseInt(localStorage.getItem('tmr_multislip_bucket'), 10);
            if (!Number.isFinite(bucket) || bucket < 0 || bucket > 99) {
                bucket = Math.floor(Math.random() * 100);
                try { localStorage.setItem('tmr_multislip_bucket', String(bucket)); } catch (_) {}
            }
            return bucket < ROLLOUT_PERCENT;
        } catch (_) { return false; }
    }
    if (!resolveFlag()) return; // flag off: install nothing at all

    var STORE_KEY = 'tmr_multislip_v1';
    var MAX_PICKS = 20;
    var UNIT_MIN = 0.5, UNIT_MAX = 5, UNIT_STEP = 0.5;
    var QUICK_UNITS = [0.5, 1, 2, 3, 5];
    var MARKET_KEYS = {
        h2h: ['h2h'], spreads: ['spreads'], totals: ['totals'],
        team_totals: ['team_totals'],
        f5_h2h: ['f5_h2h', 'h2h_1st_5_innings'],
        f5_spreads: ['f5_spreads', 'spreads_1st_5_innings'],
        f5_totals: ['f5_totals', 'totals_1st_5_innings'],
        f5_team_totals: ['f5_team_totals'],
        first_inning_totals: ['first_inning_totals']
    };

    var entries = [];          // [{key, opt, units, addedAt, state, err, newOdds, domId}]
    var busy = false;
    var lastClickedBtn = null;
    var lastClickedAt = 0;
    var root = null, drawer = null, pill = null, listEl = null, liveEl = null;
    var successMsg = null;     // {count} shown after a submit run

    function internals() { return window.__tmrMultiSlipInternals || null; }
    function track(name, params) {
        try {
            if (window.TMRAnalytics && typeof window.TMRAnalytics.track === 'function') window.TMRAnalytics.track(name, params || {});
        } catch (_) {}
    }
    function api() {
        var I = internals();
        return I && I.getApiClientOrFallback ? I.getApiClientOrFallback() : Promise.reject(new Error('API unavailable'));
    }
    // The production-fix fallback client has createPick/getPicks but no
    // .request — GET endpoints (pending, games) need the full backend-api
    // client. Poll for it instead of throwing at boot.
    function apiWithRequest(maxMs) {
        return new Promise(function (resolve, reject) {
            var t0 = Date.now();
            (function poll() {
                if (window.api && typeof window.api.request === 'function') return resolve(window.api);
                if (Date.now() - t0 > (maxMs || 10000)) return reject(new Error('api client unavailable'));
                setTimeout(poll, 300);
            })();
        });
    }

    // ---- Small utils ------------------------------------------------------
    function esc(value) {
        return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }
    function fmtOdds(o) {
        var n = Number(o);
        if (!Number.isFinite(n)) return '';
        return (n > 0 ? '+' : '') + n;
    }
    function fmtUnits(u) {
        var n = Math.round(Number(u) * 100) / 100;
        return Number.isInteger(n) ? String(n) : String(n);
    }
    // SPORTSBOOK_UNITS_NORMALIZATION: one units rule for the whole sportsbook.
    // Delegate to the reliability script's normalizer (the owner) so a multi
    // slip entry, a restored draft, and the single-pick slip can never disagree
    // about what "1.5" means. The inline fallback below is byte-identical and
    // only runs if the owner script failed to load.
    function clampUnits(v) {
        var I = window.TMR;
        if (I && typeof I.normalizeStakeUnits === 'function') return I.normalizeStakeUnits(v);
        var n = typeof v === 'number' ? v : (/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(String(v == null ? '' : v).trim()) ? parseFloat(String(v).trim()) : NaN);
        if (!Number.isFinite(n)) n = 1;
        n = Math.round(n * 2) / 2;
        return Math.max(UNIT_MIN, Math.min(UNIT_MAX, n));
    }
    function entryKey(opt) {
        return [opt.game_id, opt.market_type, String(opt.selection || '').toLowerCase(),
            opt.line == null || opt.line === '' ? '' : Number(opt.line)].join('|');
    }
    var LABELS = {
        h2h: 'Moneyline', spreads: 'Spread', totals: 'Game Total',
        team_totals: 'Team Total', f5_h2h: 'F5 Moneyline', f5_spreads: 'F5 Spread',
        f5_totals: 'F5 Total', f5_team_totals: 'F5 Team Total',
        first_inning_totals: 'NRFI / YRFI'
    };
    function marketLabel(mt) {
        if (LABELS[mt]) return LABELS[mt];
        var I = internals();
        return I && I.getMarketLabel ? I.getMarketLabel(mt) : String(mt || '').replace(/_/g, ' ');
    }
    function gameStarted(game) {
        var I = internals();
        if (I && I.hasGameStarted) return I.hasGameStarted(game);
        if (!game || !game.commence_time) return false;
        var ms = Date.parse(game.commence_time);
        return Number.isFinite(ms) && ms <= Date.now();
    }

    // ---- Persistence ------------------------------------------------------
    function save() {
        try {
            localStorage.setItem(STORE_KEY, JSON.stringify({
                v: 1, at: Date.now(),
                entries: entries.map(function (e) {
                    return { key: e.key, opt: e.opt, units: e.units, addedAt: e.addedAt, state: e.state === 'submitting' ? 'submitting' : 'ready' };
                })
            }));
        } catch (_) {}
    }
    function restore() {
        var raw = null;
        try { raw = JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch (_) {}
        if (!raw || raw.v !== 1 || !Array.isArray(raw.entries)) return;
        var cutoff = Date.now() - 36 * 3600 * 1000;
        raw.entries.forEach(function (e) {
            if (!e || !e.opt || !e.opt.game_id || !e.opt.market_type) return;
            if ((e.addedAt || 0) < cutoff) return;               // expired
            if (gameStarted(e.opt.game)) return;                 // game started: drop
            if (entries.length >= MAX_PICKS) return;
            entries.push({
                key: e.key || entryKey(e.opt), opt: e.opt,
                units: clampUnits(e.units), addedAt: e.addedAt || Date.now(),
                state: e.state === 'submitting' ? 'submitting' : 'ready',
                err: null, newOdds: null, domId: null
            });
        });
        // Reconcile entries that were mid-submit when the page died: if the
        // backend already recorded them they must NOT be resubmitted.
        var stuck = entries.filter(function (e) { return e.state === 'submitting'; });
        if (stuck.length) reconcileStuck(stuck);
    }
    function reconcileStuck(stuck) {
        apiWithRequest(15000).then(function (client) {
            return client.request('/picks/pending?limit=100', { method: 'GET' });
        }).then(function (res) {
            var pending = (res && res.picks) || [];
            stuck.forEach(function (e) {
                var I = internals();
                var line = e.opt.line == null || e.opt.line === '' ? null : Number(e.opt.line);
                var sel = I && I.buildSubmittedSelection ? I.buildSubmittedSelection(e.opt, line) : String(e.opt.selection || '');
                var found = pending.some(function (p) {
                    return p.game_id === e.opt.game_id &&
                        p.market_type === e.opt.market_type &&
                        String(p.selection || '').toLowerCase() === String(sel).toLowerCase() &&
                        Number(p.line_snapshot == null ? 0 : p.line_snapshot) === Number(line == null ? 0 : line);
                });
                if (found) {
                    entries = entries.filter(function (x) { return x !== e; });
                } else {
                    e.state = 'ready';
                }
            });
            save(); render();
        }).catch(function () {
            // Cannot reconcile (offline / logged out): leave as ready — the
            // backend duplicate guard prevents a double record on resubmit.
            stuck.forEach(function (e) { e.state = 'ready'; });
            save(); render();
        });
    }

    // ---- Selection hook (called by selectOption in production-fix) --------
    function onOptionSelected(option) {
        if (!option || !option.game_id) return false;
        if (busy) { announce('Submission in progress — slip is locked until it finishes.'); return true; }
        successMsg = null;
        var key = entryKey(option);
        var existing = entries.findIndex(function (e) { return e.key === key; });
        if (existing !== -1) {
            // Clicking the same line again removes it (toggle), never duplicates.
            unhighlight(entries[existing]);
            entries.splice(existing, 1);
            save(); render();
            announce('Removed from pick slip.');
            return true;
        }
        if (entries.length >= MAX_PICKS) {
            announce('Pick slip is full (' + MAX_PICKS + ' picks max). Remove a pick first.');
            return true;
        }
        if (gameStarted(option.game)) {
            announce('This game has already started, so picks are locked.');
            return true;
        }
        var opt;
        try { opt = JSON.parse(JSON.stringify(sanitizeOption(option))); } catch (_) { return false; }
        var entry = {
            key: key, opt: opt, units: 1, addedAt: Date.now(),
            state: 'ready', err: null, newOdds: null, domId: null
        };
        // Board highlight: stamp the button that produced this selection.
        if (lastClickedBtn && Date.now() - lastClickedAt < 1200) {
            try {
                lastClickedBtn.setAttribute('data-tmr-ms-key', key);
                lastClickedBtn.classList.add('tmr-ms-on');
                lastClickedBtn.setAttribute('aria-pressed', 'true');
                if (lastClickedBtn.id) entry.domId = lastClickedBtn.id;
            } catch (_) {}
        }
        entries.push(entry);
        save(); render();
        announce((opt.selection_label || opt.selection) + ' added to pick slip. ' + entries.length + ' picks selected.');
        return true; // consumed: legacy single-pick slip UI is skipped
    }

    function sanitizeOption(option) {
        var g = option.game || {};
        return {
            game_id: option.game_id, sport_key: option.sport_key,
            market_type: option.market_type, market_key: option.market_key,
            selection: option.selection, selection_label: option.selection_label,
            odds: option.odds, odds_display: option.odds_display,
            line: option.line == null ? null : option.line, line_display: option.line_display,
            book_title: option.book_title, book_key: option.book_key,
            group_label: option.group_label, source: option.source,
            source_updated_at: option.source_updated_at,
            home_team: option.home_team || g.home_team, away_team: option.away_team || g.away_team,
            game: {
                id: g.id || option.game_id, sport_key: g.sport_key || option.sport_key,
                sport_title: g.sport_title || null,
                home_team: g.home_team || null, away_team: g.away_team || null,
                commence_time: g.commence_time || null, updated_at: g.updated_at || null,
                bookmakers: Array.isArray(g.bookmakers) ? g.bookmakers : []
            }
        };
    }

    function unhighlight(entry) {
        try {
            document.querySelectorAll('[data-tmr-ms-key="' + (window.CSS && CSS.escape ? CSS.escape(entry.key) : entry.key) + '"]').forEach(function (b) {
                b.classList.remove('tmr-ms-on');
                b.removeAttribute('data-tmr-ms-key');
                b.setAttribute('aria-pressed', 'false');
            });
        } catch (_) {}
    }
    function reapplyHighlights() {
        entries.forEach(function (e) {
            if (!e.domId) return;
            var btn = document.getElementById(e.domId);
            if (btn && !btn.classList.contains('tmr-ms-on')) {
                btn.classList.add('tmr-ms-on');
                btn.setAttribute('data-tmr-ms-key', e.key);
                btn.setAttribute('aria-pressed', 'true');
            }
        });
    }

    // ---- Rendering --------------------------------------------------------
    function ensureUi() {
        if (root) return;
        root = document.createElement('div');
        root.className = 'tmr-ms-root';
        root.setAttribute('data-tmr-multislip', '1');

        // Mobile pill + drawer
        pill = document.createElement('button');
        pill.type = 'button';
        pill.className = 'tmr-ms-pill';
        pill.setAttribute('aria-label', 'Open pick slip');
        pill.addEventListener('click', function () { openDrawer(true); });
        document.body.appendChild(pill);

        drawer = document.createElement('div');
        drawer.className = 'tmr-ms-drawer';
        drawer.setAttribute('role', 'dialog');
        drawer.setAttribute('aria-modal', 'true');
        drawer.setAttribute('aria-label', 'Pick slip');
        drawer.innerHTML = '<div class="tmr-ms-drawer-backdrop"></div>' +
            '<div class="tmr-ms-drawer-panel"><div class="tmr-ms-drawer-handle"></div>' +
            '<button type="button" class="tmr-ms-drawer-close" aria-label="Close pick slip">&times;</button>' +
            '<div class="tmr-ms-drawer-body"></div></div>';
        drawer.querySelector('.tmr-ms-drawer-backdrop').addEventListener('click', function () { openDrawer(false); });
        drawer.querySelector('.tmr-ms-drawer-close').addEventListener('click', function () { openDrawer(false); });
        document.body.appendChild(drawer);
        document.addEventListener('keydown', function (ev) {
            if (ev.key === 'Escape') {
                if (document.querySelector('.tmr-ms-overlay')) closeModal();
                else if (drawer.classList.contains('open')) openDrawer(false);
            }
        });

        mountRoot();
        window.matchMedia('(max-width: 1180px)').addEventListener('change', mountRoot);
    }

    function isMobile() { return window.matchMedia('(max-width: 1180px)').matches; }

    function mountRoot() {
        var target;
        var aside = document.querySelector('.sportsbook-ticket-preview');
        if (isMobile()) {
            // The stylesheet hide is not reliable against the page's layered
            // !important rules, so enforce it inline.
            if (aside) aside.style.setProperty('display', 'none', 'important');
            target = drawer.querySelector('.tmr-ms-drawer-body');
        } else {
            openDrawer(false);
            if (aside) aside.style.removeProperty('display');
            var card = aside && aside.querySelector('.sportsbook-ticket-preview-card');
            target = card || aside;
            if (target && aside && target === card && !card.contains(root)) card.innerHTML = '';
        }
        if (target && root.parentNode !== target) target.appendChild(root);
    }

    function openDrawer(open) {
        if (!drawer) return;
        drawer.classList.toggle('open', !!open);
        if (open) {
            mountRoot();
            var closeBtn = drawer.querySelector('.tmr-ms-drawer-close');
            if (closeBtn) closeBtn.focus();
        }
    }

    function announce(msg) {
        if (liveEl) liveEl.textContent = msg;
    }

    function totalUnits() {
        return entries.reduce(function (sum, e) { return sum + clampUnits(e.units); }, 0);
    }

    function render() {
        ensureUi();
        // KBD_FOCUS_20260730: root.innerHTML replacement destroys the focused
        // units input, so the keypress after a re-render (number inputs fire
        // 'change' per arrow step) landed on <body> and was swallowed. Capture
        // which units input holds focus and restore it after the rebuild so
        // rapid ArrowUp/ArrowDown runs land every step.
        var refocusIdx = null;
        var ae = document.activeElement;
        if (ae && ae.classList && ae.classList.contains('tmr-ms-units-input') && root.contains(ae)) {
            refocusIdx = ae.getAttribute('data-ms-i');
        }
        var n = entries.length;
        var html = '';
        html += '<div class="tmr-ms-head"><span class="tmr-ms-title">Pick Slip <span class="tmr-ms-count" aria-label="' + n + ' picks selected">' + n + '</span></span>';
        if (n) html += '<button type="button" class="tmr-ms-clear" data-ms-act="clear">Clear all</button>';
        html += '</div>';

        if (successMsg) {
            html += '<div class="tmr-ms-success" role="status">' + successMsg.count + ' pick' + (successMsg.count === 1 ? '' : 's') +
                ' submitted successfully. <a href="/my-pending-picks/">View pending picks</a></div>';
        }

        if (!n) {
            html += '<div class="tmr-ms-empty">Select any available line to add a pick.</div>';
        } else {
            html += '<div class="tmr-ms-bulk"><span class="tmr-ms-bulk-label">Apply units to all:</span>' +
                QUICK_UNITS.map(function (u) {
                    return '<button type="button" class="tmr-ms-chip" data-ms-act="bulk" data-u="' + u + '">' + u + '</button>';
                }).join('') + '</div>';

            var I = internals();
            var mode = I && I.getSelectedStakeMode ? I.getSelectedStakeMode() : 'risk';
            html += '<div class="tmr-ms-mode" role="group" aria-label="Stake mode">' +
                '<button type="button" class="tmr-ms-mode-btn' + (mode === 'risk' ? ' active' : '') + '" data-ms-act="mode" data-mode="risk" aria-pressed="' + (mode === 'risk') + '">Risk</button>' +
                '<button type="button" class="tmr-ms-mode-btn' + (mode === 'to_win' ? ' active' : '') + '" data-ms-act="mode" data-mode="to_win" aria-pressed="' + (mode === 'to_win') + '">To Win</button></div>';

            html += '<div class="tmr-ms-list" role="list">';
            entries.forEach(function (e, i) {
                html += renderCard(e, i);
            });
            html += '</div>';

            html += '<div class="tmr-ms-foot">' +
                '<div class="tmr-ms-totals"><span>' + n + ' pick' + (n === 1 ? '' : 's') + '</span>' +
                '<span>Total: <strong>' + fmtUnits(totalUnits()) + ' units</strong></span></div>' +
                '<button type="button" class="tmr-ms-submit" data-ms-act="submit"' + (busy ? ' disabled' : '') + '>' +
                (busy ? 'Submitting&hellip;' : 'Submit ' + n + ' Pick' + (n === 1 ? '' : 's')) + '</button>' +
                '</div>';
        }
        html += '<div class="tmr-ms-live" role="status" aria-live="polite"></div>';
        root.innerHTML = html;
        listEl = root.querySelector('.tmr-ms-list');
        liveEl = root.querySelector('.tmr-ms-live');
        if (refocusIdx != null) {
            var again = root.querySelector('.tmr-ms-units-input[data-ms-i="' + refocusIdx + '"]');
            if (again) { try { again.focus(); } catch (_) {} }
        }
        if (pill) {
            pill.textContent = 'Pick Slip · ' + n;
            pill.classList.toggle('has-picks', n > 0);
        }
    }

    function renderCard(e, i) {
        var opt = e.opt;
        var matchup = (opt.away_team && opt.home_team) ? esc(opt.away_team) + ' @ ' + esc(opt.home_team) : '';
        var cls = 'tmr-ms-card';
        if (e.state === 'unavailable') cls += ' tmr-ms-unavailable';
        if (e.newOdds != null) cls += ' tmr-ms-odds-moved';
        var status = '';
        if (e.state === 'submitting') status = '<span class="tmr-ms-status busy">Submitting&hellip;</span>';
        else if (e.state === 'done') status = '<span class="tmr-ms-status ok">Locked &#10003;</span>';
        else if (e.state === 'dup') status = '<span class="tmr-ms-status dup">Already on your record</span>';
        else if (e.state === 'fail') status = '<span class="tmr-ms-status fail">Failed</span>';

        var h = '<div class="' + cls + '" role="listitem" data-ms-i="' + i + '">';
        h += '<div class="tmr-ms-card-top"><div>';
        h += '<div class="tmr-ms-sel">' + esc(opt.selection_label || opt.selection) + '</div>';
        if (matchup) h += '<div class="tmr-ms-match">' + matchup + '</div>';
        h += '<div class="tmr-ms-meta">' + esc(marketLabel(opt.market_type)) + ' &middot; <span class="tmr-ms-odds">' + esc(fmtOdds(opt.odds)) + '</span>' + (status ? ' &middot; ' + status : '') + '</div>';
        h += '</div><button type="button" class="tmr-ms-remove" data-ms-act="remove" data-ms-i="' + i + '" aria-label="Remove ' + esc(opt.selection_label || opt.selection) + ' from pick slip">&times;</button></div>';

        if (e.state === 'unavailable') {
            h += '<div class="tmr-ms-card-err">' + esc(e.err || 'This market is no longer available.') + '</div>';
        } else if (e.state === 'fail') {
            h += '<div class="tmr-ms-card-err">' + esc(e.err || 'Submission failed.') + '</div>';
        } else if (e.newOdds != null) {
            h += '<div class="tmr-ms-card-warn">Odds moved: ' + esc(fmtOdds(opt.odds)) + ' &rarr; ' + esc(fmtOdds(e.newOdds)) +
                ' <button type="button" class="tmr-ms-accept-odds" data-ms-act="accept-odds" data-ms-i="' + i + '">Accept ' + esc(fmtOdds(e.newOdds)) + '</button></div>';
        }

        if (e.state === 'ready' || e.newOdds != null) {
            h += '<div class="tmr-ms-units-row"><span class="tmr-ms-units-label" id="msUnitsLabel' + i + '">Units:</span>' +
                '<button type="button" class="tmr-ms-step" data-ms-act="dec" data-ms-i="' + i + '" aria-label="Decrease units"' + (e.units <= UNIT_MIN ? ' disabled' : '') + '>&minus;</button>' +
                '<input class="tmr-ms-units-input" style="width:64px !important;max-width:64px !important;min-width:64px !important;flex:none !important;" data-ms-i="' + i + '" type="number" inputmode="decimal" min="' + UNIT_MIN + '" max="' + UNIT_MAX + '" step="' + UNIT_STEP + '" value="' + fmtUnits(e.units) + '" aria-labelledby="msUnitsLabel' + i + '">' +
                '<button type="button" class="tmr-ms-step" data-ms-act="inc" data-ms-i="' + i + '" aria-label="Increase units"' + (e.units >= UNIT_MAX ? ' disabled' : '') + '>+</button>' +
                '<span class="tmr-ms-mini-chips">' + QUICK_UNITS.map(function (u) {
                    return '<button type="button" class="tmr-ms-chip" data-ms-act="setu" data-ms-i="' + i + '" data-u="' + u + '" aria-label="Set ' + u + ' units">' + u + '</button>';
                }).join('') + '</span></div>';
        }
        h += '</div>';
        return h;
    }

    // ---- Event delegation -------------------------------------------------
    function onRootClick(ev) {
        var btn = ev.target.closest('[data-ms-act]');
        if (!btn) return;
        var act = btn.getAttribute('data-ms-act');
        var i = parseInt(btn.getAttribute('data-ms-i'), 10);
        var e = Number.isFinite(i) ? entries[i] : null;
        if (busy && act !== 'noop') { if (act === 'submit') return; }
        switch (act) {
            case 'remove':
                if (!e) return;
                unhighlight(e);
                entries.splice(i, 1);
                save(); render();
                announce('Pick removed. ' + entries.length + ' remaining.');
                break;
            case 'clear':
                if (busy) return;
                entries.forEach(unhighlight);
                entries = [];
                save(); render();
                announce('Pick slip cleared.');
                break;
            case 'dec':
                if (!e || busy) return;
                e.units = clampUnits(e.units - UNIT_STEP);
                save(); render();
                break;
            case 'inc':
                if (!e || busy) return;
                e.units = clampUnits(e.units + UNIT_STEP);
                save(); render();
                break;
            case 'setu':
                if (!e || busy) return;
                e.units = clampUnits(btn.getAttribute('data-u'));
                save(); render();
                break;
            case 'bulk':
                if (busy) return;
                var u = clampUnits(btn.getAttribute('data-u'));
                entries.forEach(function (x) { if (x.state === 'ready') x.units = u; });
                save(); render();
                announce('Applied ' + u + ' units to all picks.');
                break;
            case 'mode':
                if (busy) return;
                if (typeof window.setUnitsMode === 'function') window.setUnitsMode(btn.getAttribute('data-mode'));
                render();
                break;
            case 'accept-odds':
                if (!e || e.newOdds == null) return;
                e.opt.odds = e.newOdds;
                e.opt.odds_display = fmtOdds(e.newOdds);
                e.newOdds = null;
                e.state = 'ready';
                save(); render();
                announce('Updated odds accepted.');
                break;
            case 'submit':
                if (!busy) beginSubmit();
                break;
        }
    }
    function onRootChange(ev) {
        var input = ev.target.closest('.tmr-ms-units-input');
        if (!input || busy) return;
        var i = parseInt(input.getAttribute('data-ms-i'), 10);
        var e = entries[i];
        if (!e) return;
        var raw = parseFloat(input.value);
        if (!Number.isFinite(raw) || raw < UNIT_MIN || raw > UNIT_MAX) {
            input.classList.add('tmr-ms-invalid');
            announce('Units must be between ' + UNIT_MIN + ' and ' + UNIT_MAX + '.');
        } else {
            input.classList.remove('tmr-ms-invalid');
        }
        e.units = clampUnits(input.value);
        save();
        // re-render only on blur so typing isn't interrupted
        if (ev.type === 'change') render();
    }

    // ---- Pre-submit re-validation -----------------------------------------
    function findFreshOutcome(freshGame, opt) {
        var keys = MARKET_KEYS[opt.market_type];
        if (!keys || !freshGame || !Array.isArray(freshGame.odds)) return null;
        var wantLine = opt.line == null || opt.line === '' ? null : Number(opt.line);
        var sel = String(opt.selection || '').trim().toLowerCase();
        for (var b = 0; b < freshGame.odds.length; b++) {
            var book = freshGame.odds[b];
            var markets = (book && book.markets) || [];
            for (var m = 0; m < markets.length; m++) {
                if (keys.indexOf(markets[m].key) === -1) continue;
                var outs = markets[m].outcomes || [];
                for (var o = 0; o < outs.length; o++) {
                    var out = outs[o];
                    var name = String(out.name || '').trim().toLowerCase();
                    if (name !== sel) continue;
                    if (wantLine != null) {
                        var point = out.point == null ? null : Number(out.point);
                        if (point == null || point !== wantLine) continue;
                    }
                    if (Number.isFinite(Number(out.price))) return out;
                }
            }
        }
        return null;
    }

    function revalidate() {
        var ids = {};
        entries.forEach(function (e) { if (e.state === 'ready' || e.newOdds != null) ids[e.opt.game_id] = true; });
        var idList = Object.keys(ids);
        return apiWithRequest(10000).then(function (client) {
            return Promise.all(idList.map(function (id) {
                return client.request('/games/' + encodeURIComponent(id), { method: 'GET' })
                    .then(function (res) { return { id: id, game: res && res.game }; })
                    .catch(function () { return { id: id, game: null }; }); // unknown to DB yet: not fatal
            }));
        }).then(function (results) {
            var byId = {};
            results.forEach(function (r) { byId[r.id] = r.game; });
            entries.forEach(function (e) {
                if (e.state !== 'ready' && e.newOdds == null) return;
                var fresh = byId[e.opt.game_id];
                // Market closed / game started or completed
                if (gameStarted(e.opt.game) ||
                    (fresh && (fresh.completed || (fresh.commence_time && Date.parse(fresh.commence_time) <= Date.now())))) {
                    e.state = 'unavailable';
                    e.err = fresh && fresh.completed ? 'This game has finished — the market is closed.' : 'This game has started — picks are locked.';
                    e.newOdds = null;
                    return;
                }
                // Odds movement (only when we can confidently find the same line)
                if (fresh) {
                    var out = findFreshOutcome(fresh, e.opt);
                    if (out && Number(out.price) !== Number(e.opt.odds)) {
                        e.newOdds = Number(out.price);
                        e.state = 'ready';
                    }
                }
            });
            save(); render();
        });
    }

    // ---- Confirmation modal -----------------------------------------------
    function closeModal() {
        var ov = document.querySelector('.tmr-ms-overlay');
        if (ov) ov.remove();
    }

    function showConfirmModal(ready, moved, unavailable) {
        closeModal();
        var ov = document.createElement('div');
        ov.className = 'tmr-ms-overlay';
        ov.setAttribute('role', 'dialog');
        ov.setAttribute('aria-modal', 'true');
        ov.setAttribute('aria-label', 'Confirm pick submission');
        var lines = ready.map(function (e) {
            return '<div class="tmr-ms-modal-line"><span class="sel">' + esc(e.opt.selection_label || e.opt.selection) + '</span>' +
                '<span class="nums">' + esc(fmtOdds(e.opt.odds)) + ' &middot; ' + fmtUnits(e.units) + 'u</span></div>';
        }).join('');
        var blockers = '';
        if (moved.length) {
            blockers += '<div class="tmr-ms-card-warn">' + moved.length + ' pick' + (moved.length === 1 ? ' has' : 's have') +
                ' updated odds. Accept the new odds (or remove the pick) in the slip before submitting.</div>';
        }
        if (unavailable.length) {
            blockers += '<div class="tmr-ms-card-err">' + unavailable.length + ' unavailable pick' + (unavailable.length === 1 ? '' : 's') +
                ' will NOT be submitted. Remove ' + (unavailable.length === 1 ? 'it' : 'them') + ' from the slip when convenient — the rest are unaffected.</div>';
        }
        var total = ready.reduce(function (s, e) { return s + clampUnits(e.units); }, 0);
        ov.innerHTML = '<div class="tmr-ms-modal">' +
            '<h3>Confirm ' + ready.length + ' Pick' + (ready.length === 1 ? '' : 's') + '</h3>' +
            lines + blockers +
            '<div class="tmr-ms-totals"><span>Total units</span><strong>' + fmtUnits(total) + '</strong></div>' +
            '<div class="tmr-ms-modal-btns">' +
            '<button type="button" class="tmr-ms-btn-secondary" data-ms-modal="back">Back</button>' +
            (ready.length && !moved.length
                ? '<button type="button" class="tmr-ms-submit" data-ms-modal="go">Submit ' + ready.length + ' Pick' + (ready.length === 1 ? '' : 's') + '</button>'
                : '') +
            '</div></div>';
        ov.addEventListener('click', function (ev) {
            if (ev.target === ov || ev.target.closest('[data-ms-modal="back"]')) { closeModal(); return; }
            if (ev.target.closest('[data-ms-modal="go"]')) { closeModal(); runSubmit(ready); }
        });
        document.body.appendChild(ov);
        var goBtn = ov.querySelector('[data-ms-modal="go"]') || ov.querySelector('[data-ms-modal="back"]');
        if (goBtn) goBtn.focus();
    }

    // ---- Submission -------------------------------------------------------
    function beginSubmit() {
        if (busy || !entries.length) return;
        var I = internals();
        if (!I) { announce('Pick service is still loading. Try again in a moment.'); return; }
        // A previously failed pick is retryable: reset it so it re-validates
        // and resubmits. The backend duplicate guard makes retries safe.
        entries.forEach(function (e) {
            if (e.state === 'fail') { e.state = 'ready'; e.err = null; }
        });
        busy = true; render();
        announce('Checking lines…');
        Promise.resolve(I.ensurePicksAccess ? I.ensurePicksAccess() : true).then(function (allowed) {
            if (!allowed) throw new Error('__access__');
            return revalidate();
        }).then(function () {
            busy = false;
            var ready = entries.filter(function (e) { return e.state === 'ready' && e.newOdds == null; });
            var moved = entries.filter(function (e) { return e.newOdds != null; });
            var unavailable = entries.filter(function (e) { return e.state === 'unavailable'; });
            render();
            if (!ready.length && !moved.length) {
                announce(unavailable.length ? 'No submittable picks — see the slip for reasons.' : 'Nothing to submit.');
                return;
            }
            showConfirmModal(ready, moved, unavailable);
        }).catch(function (err) {
            busy = false; render();
            announce(err && err.message === '__access__'
                ? 'Log in (with a verified email) to submit picks.'
                : 'Could not verify lines. Check your connection and try again.');
        });
    }

    function buildPayload(entry) {
        var I = internals();
        var opt = entry.opt;
        var oddsValue = parseInt(opt.odds, 10);
        var lineValue = opt.line == null || opt.line === '' || !Number.isFinite(Number(opt.line)) ? null : Number(opt.line);
        var stakeMode = I.getSelectedStakeMode();
        var units = clampUnits(entry.units);
        var submittedSelection = I.buildSubmittedSelection(opt, lineValue);
        if (!Number.isFinite(oddsValue) || (oddsValue > -100 && oddsValue < 100)) {
            throw new Error('Invalid odds on this pick. Remove and re-select it.');
        }
        if ((opt.market_type === 'team_totals' || opt.market_type === 'f5_team_totals') &&
            (!/\b(over|under)\b/i.test(submittedSelection) || lineValue == null)) {
            throw new Error('This team total is missing its side or line. Remove and re-select it.');
        }
        var stakeValues = I.calculateStakeValues(stakeMode, units, oddsValue);
        var payload = {
            game_id: opt.game_id,
            external_game_id: opt.game_id,
            sport_key: opt.sport_key,
            market_type: opt.market_type,
            bet_type: opt.market_type === 'team_totals' ? 'team_total' : opt.market_type,
            selection: submittedSelection,
            selection_label: opt.selection_label || submittedSelection,
            line_snapshot: lineValue,
            odds_snapshot: oddsValue,
            units: units,
            stake_mode: stakeMode,
            units_mode: stakeMode,
            risk_units: stakeValues.risk_units,
            to_win_units: stakeValues.win_units,
            book_title: opt.book_title,
            book_key: opt.book_key,
            market_key: opt.market_key,
            market_label: opt.group_label,
            source_type: opt.source,
            source_updated_at: opt.source_updated_at,
            game_snapshot: I.buildSubmittedGameSnapshot(opt),
            reasoning: ''
        };
        Object.assign(payload, I.getTeamTotalSubmitMeta(opt));
        return payload;
    }

    function runSubmit(ready) {
        if (busy) return;
        busy = true;
        window.__tmrLockInFlight = true; // block the legacy path while we run
        successMsg = null;
        var I = internals();
        var okCount = 0;
        var authFailed = false;

        var chain = Promise.resolve();
        ready.forEach(function (e) {
            chain = chain.then(function () {
                if (authFailed) return;
                // Re-check per pick: the game may have started while earlier
                // picks in this run were submitting.
                if (gameStarted(e.opt.game)) {
                    e.state = 'unavailable';
                    e.err = 'This game started before this pick could be submitted.';
                    render();
                    return;
                }
                e.state = 'submitting'; e.err = null;
                save(); render();
                var payload;
                try { payload = buildPayload(e); } catch (err) {
                    e.state = 'fail'; e.err = err.message;
                    save(); render();
                    return;
                }
                return api().then(function (client) {
                    return I.ensureBackendAccessToken ? I.ensureBackendAccessToken(client).then(function () { return client; }) : client;
                }).then(function (client) {
                    return client.createPick(payload);
                }).then(function (response) {
                    if (!response || !response.pick || response.pick.id == null) {
                        throw new Error('Pick was not saved. Please try again.');
                    }
                    if (response.duplicate) {
                        e.state = 'dup';
                        e.err = null;
                        track('multislip_duplicate_refused', { market_type: payload.market_type, sport: payload.sport_key });
                    } else {
                        e.state = 'done';
                        okCount++;
                        try { window.dispatchEvent(new CustomEvent('tmr:pickLocked', { detail: { pick: response.pick } })); } catch (_) {}
                        track('sportsbook_pick_created', { multislip: 1, market_type: payload.market_type, sport: payload.sport_key });
                    }
                    unhighlight(e);
                    save(); render();
                }).catch(function (error) {
                    var status = error && error.status;
                    var data = error && error.data;
                    var backendMsg = (data && (data.error || data.message)) || String(error && error.message || '');
                    var isAuth = status === 401 || status === 403 || /access token|unauthor|session|log ?in|verify your email/i.test(backendMsg);
                    track('multislip_submit_failed', { status: status || 0, auth: isAuth ? 1 : 0 });
                    if (isAuth) {
                        authFailed = true;
                        e.state = 'ready';
                        announce('Your session expired. Log in again — your remaining picks are saved in the slip.');
                    } else {
                        e.state = 'fail';
                        e.err = backendMsg || (status ? 'Error ' + status + '. Try again.' : 'Network error. The pick was NOT confirmed — it stays in your slip; retry when your connection is back.');
                    }
                    save(); render();
                });
            });
        });

        chain.then(function () {
            busy = false;
            window.__tmrLockInFlight = false;
            // Successfully recorded picks (incl. "already locked") leave the slip.
            var done = entries.filter(function (e) { return e.state === 'done' || e.state === 'dup'; });
            done.forEach(unhighlight);
            entries = entries.filter(function (e) { return e.state !== 'done' && e.state !== 'dup'; });
            if (okCount > 0) {
                successMsg = { count: okCount };
                if (I && I.refreshAfterSubmit) {
                    Promise.resolve(I.refreshAfterSubmit()).catch(function () {});
                }
            }
            save(); render();
            var failed = entries.filter(function (e) { return e.state === 'fail'; }).length;
            if (authFailed) {
                announce('Your session expired. Log in again — your picks are saved in the slip.');
            } else {
                announce(okCount + ' submitted' + (failed ? ', ' + failed + ' failed — details on each pick.' : '.'));
            }
        });
    }

    // ---- Boot -------------------------------------------------------------
    function boot() {
        document.body.classList.add('tmr-multislip');
        // Track the physical button behind each selection so the board can
        // show an "in slip" state.
        document.addEventListener('click', function (ev) {
            var b = ev.target && ev.target.closest ? ev.target.closest('button') : null;
            if (b && !b.closest('[data-tmr-multislip]')) { lastClickedBtn = b; lastClickedAt = Date.now(); }
        }, true);
        // Neutralize legacy slip repaints while the multi slip owns the aside.
        var wrapSlip = function () {
            if (window.TMR && typeof window.TMR._ttPopulateSlip === 'function' && !window.TMR._ttPopulateSlip.__msWrapped) {
                var orig = window.TMR._ttPopulateSlip;
                var wrapped = function () { /* multislip owns the slip */ };
                wrapped.__msWrapped = true;
                wrapped.__msOrig = orig;
                window.TMR._ttPopulateSlip = wrapped;
            }
        };
        wrapSlip();
        setTimeout(wrapSlip, 0);

        restore();
        render();
        window.addEventListener('storage', function (ev) {
            if (ev.key === STORE_KEY) { /* another tab changed the slip */ }
        });

        // Re-apply board highlights after re-renders (best-effort).
        var boardHost = document.getElementById('gamesListSection') || document.body;
        var t = null;
        new MutationObserver(function () {
            if (t) clearTimeout(t);
            t = setTimeout(function () { reapplyHighlights(); mountRoot(); }, 300);
        }).observe(boardHost, { childList: true, subtree: true });

        document.addEventListener('click', function (ev) {
            if (root && root.contains(ev.target)) onRootClick(ev);
        });
        document.addEventListener('change', function (ev) {
            if (root && root.contains(ev.target)) onRootChange(ev);
        });
        document.addEventListener('input', function (ev) {
            if (root && root.contains(ev.target)) onRootChange(ev);
        });
    }

    window.__tmrMultiSlip = { onOptionSelected: onOptionSelected, version: '20260730' };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();
