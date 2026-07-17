/*
 * TMRPoll - shared interactive poll component.
 *
 * ONE renderer + ONE voting path for poll cards everywhere they appear
 * (main feed, profile feed, community feed, infinite-scroll loads). Reuses the
 * real backend: POST /api/polls/:id/vote (same model/permissions/validation the
 * /polls/ page uses). No page reload; results update in place from the vote
 * response. Vote-change follows poll.allow_vote_change. Closed/expired polls
 * show results but do not accept votes. Logged-out clicks open the login modal.
 *
 * Public API:
 *   TMRPoll.optionsHTML(poll)  -> string of markup for the options block
 *   TMRPoll.normalize(poll)    -> normalized poll shape (internal, exported for reuse)
 *
 * Voting is handled by a single delegated listener, so cards added later by
 * infinite scroll are interactive with no re-binding.
 */
(function () {
    'use strict';
    if (window.TMRPoll) return;

    function api() { return window.api; }

    function currentUser() {
        try {
            if (window.auth) {
                if (auth.currentUser) return auth.currentUser;
                if (typeof auth.getCurrentUser === 'function') return auth.getCurrentUser();
            }
        } catch (e) {}
        return null;
    }

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function toInt(v) { var n = parseInt(v, 10); return isNaN(n) ? 0 : n; }

    function pct(votes, total) { return total > 0 ? Math.round(votes / total * 100) : 0; }

    function openLogin() {
        if (typeof window.openModal === 'function') { window.openModal('login'); return; }
        var next = encodeURIComponent(location.pathname + location.search);
        location.href = '/login/?next=' + next;
    }

    // Accepts the many shapes feed code hands us and returns a stable object.
    function normalize(poll) {
        poll = poll || {};
        var id = poll.poll_id != null ? poll.poll_id : (poll.id != null ? poll.id : poll.item_id);
        var rawOpts = Array.isArray(poll.options) ? poll.options : [];
        var options = rawOpts.map(function (o, idx) {
            return {
                id: (o.id != null ? o.id : (o.option_id != null ? o.option_id : idx)),
                text: (o.text != null ? o.text : (o.option_text != null ? o.option_text : ('Option ' + (idx + 1)))),
                votes: toInt(o.votes != null ? o.votes : o.vote_count)
            };
        });
        var total = poll.total_votes != null ? toInt(poll.total_votes)
            : (poll.votes_count != null ? toInt(poll.votes_count) : (poll.vote_count != null ? toInt(poll.vote_count) : 0));
        if (!total) total = options.reduce(function (s, o) { return s + o.votes; }, 0);

        // Voted option can arrive as user_vote {option_id}, voted_option_id, or user_voted flag.
        var votedOption = null;
        if (poll.user_vote && poll.user_vote.option_id != null) votedOption = poll.user_vote.option_id;
        else if (poll.voted_option_id != null) votedOption = poll.voted_option_id;
        else if (poll.user_voted_option_id != null) votedOption = poll.user_voted_option_id;

        var status = String(poll.status || 'active').toLowerCase();
        var deadlinePassed = poll.voting_deadline ? (new Date(poll.voting_deadline) < new Date()) : false;
        var closed = (status !== 'active') || deadlinePassed;
        // allow_vote_change defaults to true unless explicitly false.
        var allowChange = poll.allow_vote_change === false ? false : true;

        return { id: id, options: options, total: total, votedOption: votedOption, closed: closed, allowChange: allowChange };
    }

    function optionHTML(n, opt) {
        var voted = n.votedOption != null;
        var isSel = String(opt.id) === String(n.votedOption);
        var p = pct(opt.votes, n.total);
        var showResults = voted || n.closed;      // reveal % once user has voted or poll is closed
        var disabled = n.closed || (voted && !n.allowChange);
        return '<button type="button" class="tmrp-opt' + (isSel ? ' is-selected' : '') + '"' +
            ' role="radio" aria-checked="' + (isSel ? 'true' : 'false') + '"' +
            ' data-option-id="' + esc(opt.id) + '"' +
            (disabled ? ' aria-disabled="true" tabindex="-1"' : '') +
            ' aria-label="' + esc(opt.text) + (showResults ? (', ' + p + ' percent, ' + opt.votes + ' vote' + (opt.votes === 1 ? '' : 's')) : '') + '">' +
            '<span class="tmrp-bar" data-bar style="width:' + (showResults ? p : 0) + '%"></span>' +
            '<span class="tmrp-check" aria-hidden="true"><i class="fas fa-check"></i></span>' +
            '<span class="tmrp-label">' + esc(opt.text) + '</span>' +
            '<span class="tmrp-pct" data-pct' + (showResults ? '' : ' hidden') + '>' + p + '%</span>' +
            '</button>';
    }

    function optionsHTML(poll) {
        var n = normalize(poll);
        if (!n.options.length) {
            // No options hydrated (e.g. multi-question quiz) - link out, never a dead card.
            return '<div class="tmrp" data-poll-id="' + esc(n.id) + '">' +
                '<a class="tmrp-opt tmrp-link" href="/polls/#poll-' + esc(n.id) + '">' +
                '<span class="tmrp-label">Open this poll to vote</span><span class="tmrp-pct">View &rarr;</span></a>' +
                '</div>';
        }
        var opts = n.options.map(function (o) { return optionHTML(n, o); }).join('');
        var lockedNote = (n.votedOption != null && !n.allowChange && !n.closed)
            ? '<span class="tmrp-note">Your vote is locked</span>' : '';
        var closedNote = n.closed ? '<span class="tmrp-note">Voting closed</span>' : '';
        return '<div class="tmrp" role="radiogroup" aria-label="Poll options"' +
            ' data-poll-id="' + esc(n.id) + '"' +
            ' data-closed="' + (n.closed ? 1 : 0) + '"' +
            ' data-allow-change="' + (n.allowChange ? 1 : 0) + '"' +
            ' data-voted-option="' + (n.votedOption != null ? esc(n.votedOption) : '') + '">' +
            opts +
            '<div class="tmrp-foot"><span class="tmrp-total" data-total>' +
            ((n.total === 0 && n.votedOption == null && !n.closed) ? 'Be the first to vote' : (n.total + ' vote' + (n.total === 1 ? '' : 's'))) + '</span>' +
            lockedNote + closedNote +
            '<span class="tmrp-error" data-error hidden></span></div>' +
            '</div>';
    }

    // ---- in-place update helpers ----
    function applyCounts(wrap, options) {
        var total = options.reduce(function (s, o) { return s + toInt(o.vote_count != null ? o.vote_count : o.votes); }, 0);
        options.forEach(function (o) {
            var oid = o.id != null ? o.id : o.option_id;
            var btn = wrap.querySelector('.tmrp-opt[data-option-id="' + cssEsc(oid) + '"]');
            if (!btn) return;
            var votes = toInt(o.vote_count != null ? o.vote_count : o.votes);
            var p = (o.vote_percentage != null && !isNaN(parseFloat(o.vote_percentage)))
                ? Math.round(parseFloat(o.vote_percentage)) : pct(votes, total);
            var bar = btn.querySelector('[data-bar]');
            var pctEl = btn.querySelector('[data-pct]');
            if (bar) bar.style.width = p + '%';
            if (pctEl) { pctEl.textContent = p + '%'; pctEl.hidden = false; }
        });
        var totalEl = wrap.querySelector('[data-total]');
        if (totalEl) totalEl.textContent = total + ' vote' + (total === 1 ? '' : 's');
    }

    function cssEsc(v) { return String(v).replace(/["\\]/g, '\\$&'); }

    function setSelected(wrap, optionId) {
        wrap.querySelectorAll('.tmrp-opt').forEach(function (b) {
            var sel = String(b.getAttribute('data-option-id')) === String(optionId);
            b.classList.toggle('is-selected', sel);
            b.setAttribute('aria-checked', sel ? 'true' : 'false');
        });
    }
    function clearSelected(wrap) {
        wrap.querySelectorAll('.tmrp-opt').forEach(function (b) {
            b.classList.remove('is-selected');
            b.setAttribute('aria-checked', 'false');
        });
    }
    function lockWrap(wrap) {
        wrap.querySelectorAll('.tmrp-opt').forEach(function (b) {
            b.setAttribute('aria-disabled', 'true');
            b.setAttribute('tabindex', '-1');
        });
    }
    function showError(wrap, msg) {
        var el = wrap.querySelector('[data-error]');
        if (!el) return;
        el.textContent = msg;
        el.hidden = false;
    }
    function clearError(wrap) {
        var el = wrap.querySelector('[data-error]');
        if (el) { el.textContent = ''; el.hidden = true; }
    }

    async function handleVote(wrap, btn) {
        if (wrap.getAttribute('data-busy') === '1') return;               // block rapid duplicate submits
        if (btn.getAttribute('aria-disabled') === 'true') return;
        if (wrap.getAttribute('data-closed') === '1') return;

        var user = currentUser();
        if (!user) { openLogin(); return; }

        var pollId = wrap.getAttribute('data-poll-id');
        var optionId = btn.getAttribute('data-option-id');
        var prevVoted = wrap.getAttribute('data-voted-option') || '';
        var allowChange = wrap.getAttribute('data-allow-change') === '1';

        if (prevVoted && String(prevVoted) === String(optionId)) return;  // same option, no-op
        if (prevVoted && !allowChange) return;                            // change not allowed

        wrap.setAttribute('data-busy', '1');
        wrap.classList.add('is-busy');
        clearError(wrap);
        setSelected(wrap, optionId);                                      // optimistic highlight

        try {
            var res = await api().request('/polls/' + encodeURIComponent(pollId) + '/vote', {
                method: 'POST', body: { option_id: Number(optionId) }
            });
            if (res && Array.isArray(res.options)) applyCounts(wrap, res.options);
            wrap.setAttribute('data-voted-option', String(optionId));
            if (!allowChange) lockWrap(wrap);                             // one-shot poll: lock after voting
        } catch (err) {
            if (prevVoted) setSelected(wrap, prevVoted); else clearSelected(wrap);
            var msg = (err && err.message) ? String(err.message) : 'Could not save your vote.';
            if (err && (err.status === 401 || err.status === 403)) { openLogin(); }
            else if (/closed|deadline|not yet open/i.test(msg)) {
                wrap.setAttribute('data-closed', '1'); lockWrap(wrap);
                showError(wrap, 'Voting is closed for this poll.');
            } else if (/already voted/i.test(msg)) {
                lockWrap(wrap); showError(wrap, 'You have already voted.');
            } else {
                showError(wrap, 'Could not save your vote. Please try again.');
            }
        } finally {
            wrap.setAttribute('data-busy', '');
            wrap.classList.remove('is-busy');
        }
    }

    // Single delegated handler - works for infinite-scroll / late-rendered cards.
    document.addEventListener('click', function (e) {
        var btn = e.target.closest ? e.target.closest('.tmrp-opt') : null;
        if (!btn || btn.classList.contains('tmrp-link')) return;
        var wrap = btn.closest('.tmrp');
        if (!wrap) return;
        e.preventDefault();
        handleVote(wrap, btn);
    });

    function injectStyles() {
        if (document.getElementById('tmrp-styles')) return;
        var css =
        '.tmrp{display:grid;gap:8px;margin-top:4px}' +
        '.tmrp-opt{position:relative;display:flex;align-items:center;gap:10px;width:100%;min-height:40px;' +
            'padding:9px 12px;border-radius:10px;border:1px solid rgba(148,163,184,0.18);' +
            'background:rgba(15,23,42,0.62);color:#dbeafe;text-align:left;cursor:pointer;overflow:hidden;' +
            'font:inherit;font-weight:600;transition:border-color .16s ease,background .16s ease,transform .06s ease}' +
        '.tmrp-opt:hover{border-color:rgba(56,189,248,0.6);background:rgba(30,58,95,0.7)}' +
        '.tmrp-opt:active{transform:scale(0.995)}' +
        '.tmrp-opt:focus-visible{outline:2px solid #38bdf8;outline-offset:2px}' +
        '.tmrp-opt[aria-disabled="true"]{cursor:default}' +
        '.tmrp-opt[aria-disabled="true"]:hover{border-color:rgba(148,163,184,0.18);background:rgba(15,23,42,0.62)}' +
        '.tmrp-opt.is-selected{border-color:#22d3ee;background:rgba(34,211,238,0.12);box-shadow:inset 3px 0 0 #22d3ee}' +
        '.tmrp-bar{position:absolute;left:0;top:0;bottom:0;width:0;background:rgba(56,189,248,0.14);' +
            'z-index:0;transition:width .35s cubic-bezier(.4,0,.2,1)}' +
        '.tmrp-opt.is-selected .tmrp-bar{background:rgba(34,211,238,0.2)}' +
        '.tmrp-check{position:relative;z-index:1;flex:0 0 auto;width:16px;height:16px;display:inline-flex;' +
            'align-items:center;justify-content:center;border-radius:50%;font-size:0.6rem;color:#06111f;' +
            'background:#22d3ee;opacity:0;transform:scale(0.4);transition:opacity .18s ease,transform .18s ease}' +
        '.tmrp-opt.is-selected .tmrp-check{opacity:1;transform:scale(1)}' +
        '.tmrp-label{position:relative;z-index:1;flex:1 1 auto}' +
        '.tmrp-pct{position:relative;z-index:1;flex:0 0 auto;color:#7dd3fc;font-size:0.82rem;font-weight:700}' +
        '.tmrp-link{justify-content:space-between;text-decoration:none}' +
        '.tmrp-foot{display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin-top:5px;' +
            'color:var(--text-muted,#94a3b8);font-size:0.78rem}' +
        '.tmrp-note{color:#94a3b8}.tmrp-note:before{content:"\\2022";margin-right:8px;opacity:0.6}' +
        '.tmrp-error{color:#fca5a5}.tmrp-error:before{content:"\\26a0";margin-right:5px}' +
        '.tmrp.is-busy{opacity:0.85;pointer-events:none}';
        var st = document.createElement('style');
        st.id = 'tmrp-styles';
        st.textContent = css;
        (document.head || document.documentElement).appendChild(st);
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', injectStyles);
    } else { injectStyles(); }

    window.TMRPoll = { optionsHTML: optionsHTML, normalize: normalize, _applyCounts: applyCounts };
})();
