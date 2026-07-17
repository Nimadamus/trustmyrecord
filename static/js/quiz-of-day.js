/**
 * quiz-of-day.js — shared "Prediction Quiz of the Day" card.
 * ==========================================================
 * Renders the SAME featured quiz record returned by GET /api/polls/featured
 * (no duplication) and lets a logged-in user answer inline, on the homepage
 * and the community feed, then shows their picks + community consensus without
 * leaving the page. Deep-links to /polls/#poll-<id> for the full leaderboard.
 *
 * Prediction quizzes only: every question has an objectively gradeable outcome
 * and is auto-graded by the backend (points + Elo). This widget never creates
 * or renders ungraded opinion polls.
 *
 * Isolated + additive: reuses window.api (auth/refresh) when present; falls
 * back to a plain fetch against the configured API base otherwise. It does NOT
 * touch the /polls/ page quiz engine.
 */
(function () {
  if (window.TMRQuizOfDay) return;

  var API_BASE = (window.CONFIG && window.CONFIG.api && window.CONFIG.api.baseUrl) ||
    'https://trustmyrecord-api.onrender.com/api';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function isLoggedIn() {
    if (window.api && window.api.token) return true;
    try {
      return !!(localStorage.getItem('trustmyrecord_token') || localStorage.getItem('accessToken') ||
        localStorage.getItem('access_token') || localStorage.getItem('token') || localStorage.getItem('tmr_token'));
    } catch (e) { return false; }
  }

  // Prefer the site API client (handles JWT + silent refresh). Fall back to a
  // bare fetch so the card still loads read-only on pages without it.
  async function req(path, opts) {
    if (window.api && typeof window.api.request === 'function') return window.api.request(path, opts);
    var o = opts || {};
    var headers = { 'Content-Type': 'application/json' };
    var t = null;
    try { t = localStorage.getItem('trustmyrecord_token') || localStorage.getItem('accessToken'); } catch (e) {}
    if (t) headers['Authorization'] = 'Bearer ' + t;
    var r = await fetch(API_BASE + path, {
      method: o.method || 'GET', headers: headers,
      body: o.body ? JSON.stringify(o.body) : undefined,
    });
    var data = null; try { data = await r.json(); } catch (e) {}
    if (!r.ok) throw new Error((data && (data.error || data.message)) || ('HTTP ' + r.status));
    return data;
  }

  function loginUrl() {
    try { return '/login/?next=' + encodeURIComponent(location.pathname + location.hash); }
    catch (e) { return '/login/'; }
  }

  function fmtDate(v) {
    if (!v) return '';
    var d = new Date(v);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  }

  var STYLE_ID = 'tmr-qotd-styles';
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var css = [
      '.tmr-qotd{--q-bg:#0f1b2e;--q-card:#132339;--q-line:rgba(120,150,190,.22);--q-mut:#93a4ba;--q-cyan:#22d3ee;--q-green:#34d399;',
      'background:linear-gradient(160deg,#14263f 0%,#0f1b2e 100%);',
      'border:1px solid var(--q-line);border-radius:16px;padding:16px 18px;color:#e6eefb;font-family:inherit;box-shadow:0 6px 26px rgba(4,10,22,.32)}',
      '.tmr-qotd *{box-sizing:border-box}',
      '.tmr-qotd-eyebrow{display:inline-flex;align-items:center;gap:7px;font-size:.68rem;font-weight:900;letter-spacing:.14em;text-transform:uppercase;color:var(--q-cyan)}',
      '.tmr-qotd-chip{font-size:.6rem;font-weight:900;letter-spacing:.08em;text-transform:uppercase;padding:2px 8px;border-radius:999px;margin-left:8px}',
      '.tmr-qotd-chip.live{background:rgba(52,211,153,.14);color:#6ee7b7;border:1px solid rgba(52,211,153,.4)}',
      '.tmr-qotd-chip.done{background:rgba(148,163,184,.14);color:#cbd5e1;border:1px solid rgba(148,163,184,.3)}',
      '.tmr-qotd-title{font-size:1.12rem;font-weight:900;line-height:1.25;margin:8px 0 10px}',
      '.tmr-qotd-facts{display:flex;flex-wrap:wrap;gap:6px 14px;font-size:.76rem;color:var(--q-mut);font-weight:700;margin-bottom:12px}',
      '.tmr-qotd-facts i{color:var(--q-cyan);margin-right:5px}',
      '.tmr-qotd-facts .first{color:var(--q-green)}',
      '.tmr-qotd-q{border-top:1px solid var(--q-line);padding:11px 0}',
      '.tmr-qotd-q:first-of-type{border-top:none}',
      '.tmr-qotd-qtitle{font-size:.86rem;font-weight:800;margin-bottom:8px}',
      '.tmr-qotd-opts{display:grid;gap:6px}',
      '.tmr-qotd-opt{display:flex;align-items:center;justify-content:space-between;gap:8px;position:relative;padding:9px 12px;border-radius:9px;',
      'border:1px solid var(--q-line);background:var(--q-card);color:#e6eefb;font-family:inherit;font-size:.82rem;font-weight:700;cursor:pointer;text-align:left;width:100%;overflow:hidden}',
      '.tmr-qotd-opt:hover:not(:disabled){border-color:var(--q-cyan)}',
      '.tmr-qotd-opt.sel{border-color:var(--q-cyan);background:rgba(34,211,238,.12)}',
      '.tmr-qotd-opt.correct{border-color:var(--q-green);background:rgba(52,211,153,.14)}',
      '.tmr-qotd-opt[disabled]{cursor:default;opacity:.96}',
      '.tmr-qotd-bar{position:absolute;left:0;top:0;bottom:0;background:rgba(34,211,238,.12);z-index:0}',
      '.tmr-qotd-opt.correct .tmr-qotd-bar{background:rgba(52,211,153,.16)}',
      '.tmr-qotd-olabel,.tmr-qotd-opct{position:relative;z-index:1}',
      '.tmr-qotd-opct{font-variant-numeric:tabular-nums;color:var(--q-mut);font-weight:800;font-size:.74rem;white-space:nowrap}',
      '.tmr-qotd-tag{font-size:.58rem;font-weight:900;letter-spacing:.06em;text-transform:uppercase;padding:1px 6px;border-radius:5px;margin-left:6px}',
      '.tmr-qotd-tag.you{background:rgba(34,211,238,.18);color:#67e8f9}',
      '.tmr-qotd-tag.correct{background:rgba(52,211,153,.2);color:#6ee7b7}',
      '.tmr-qotd-tag.pts{background:rgba(250,204,21,.16);color:#fde047}',
      '.tmr-qotd-num{width:100%;padding:9px 12px;border-radius:9px;border:1px solid var(--q-line);background:var(--q-card);color:#e6eefb;font-family:inherit;font-size:.82rem;font-weight:700}',
      '.tmr-qotd-actions{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin-top:13px}',
      '.tmr-qotd-btn{display:inline-flex;align-items:center;gap:7px;padding:10px 18px;border-radius:999px;border:1px solid rgba(34,211,238,.5);',
      'background:linear-gradient(135deg,var(--q-green),var(--q-cyan));color:#06111f;font-family:inherit;font-weight:900;font-size:.84rem;cursor:pointer}',
      '.tmr-qotd-btn[disabled]{opacity:.55;cursor:not-allowed}',
      '.tmr-qotd-link{color:var(--q-cyan);font-weight:800;font-size:.8rem;text-decoration:none}',
      '.tmr-qotd-link:hover{text-decoration:underline}',
      '.tmr-qotd-note{font-size:.76rem;color:var(--q-mut);font-weight:700}',
      '.tmr-qotd-err{color:#fca5a5;font-size:.76rem;font-weight:800;margin-top:8px;min-height:1em}',
      '.tmr-qotd-skel{height:150px;border-radius:16px;border:1px solid var(--q-line);background:linear-gradient(90deg,#122036,#16294247,#122036);',
      'background-size:200% 100%;animation:tmrqotdsk 1.4s ease-in-out infinite}',
      '@keyframes tmrqotdsk{0%{background-position:200% 0}100%{background-position:-200% 0}}',
      '@media (max-width:560px){.tmr-qotd-title{font-size:1.02rem}}'
    ].join('');
    var el = document.createElement('style');
    el.id = STYLE_ID; el.textContent = css;
    document.head.appendChild(el);
  }

  // ---- render ---------------------------------------------------------------

  function optionResultHTML(o, total, yourOptId, resolved) {
    var vc = parseInt(o.vote_count || 0);
    var pct = total > 0 ? (vc / total * 100) : 0;
    var pctText = (parseFloat(o.vote_percentage != null ? o.vote_percentage : pct) || 0).toFixed(0);
    var correct = resolved && o.is_correct;
    var you = yourOptId != null && parseInt(o.id) === parseInt(yourOptId);
    var cls = 'tmr-qotd-opt' + (correct ? ' correct' : '') + (you ? ' sel' : '');
    var tags = (correct ? '<span class="tmr-qotd-tag correct">Correct</span>' : '') +
      (you ? '<span class="tmr-qotd-tag you">You</span>' : '');
    return '<div class="' + cls + '" disabled>' +
      '<span class="tmr-qotd-bar" style="width:' + Math.min(100, pct).toFixed(0) + '%"></span>' +
      '<span class="tmr-qotd-olabel">' + esc(o.option_text) + tags + '</span>' +
      '<span class="tmr-qotd-opct">' + pctText + '% &middot; ' + vc + '</span></div>';
  }

  function questionHTML(q, mode) {
    // mode: 'answer' (open, logged in) | 'results' (voted/resolved/logged out)
    var resolved = q.status === 'resolved';
    var ua = q.user_answer || null;
    var yourOpt = ua ? ua.option_id : null;
    var showResults = mode === 'results' || resolved || !!ua;
    var head = '<div class="tmr-qotd-qtitle">' + esc(q.title) +
      (ua && resolved && ua.points_earned != null ? ' <span class="tmr-qotd-tag pts">+' + ua.points_earned + '</span>' : '') +
      '</div>';

    var body;
    if (showResults) {
      if (q.scoring_mode === 'closest') {
        var yourNum = ua && ua.numeric_value != null ? ua.numeric_value : null;
        body = '<div class="tmr-qotd-note">' + (yourNum != null ? 'Your answer: <strong>' + esc(yourNum) + '</strong>' : 'Closest-number question') +
          (resolved && q.numeric_target != null ? ' &middot; Actual: <strong>' + esc(q.numeric_target) + '</strong>' : '') + '</div>';
      } else {
        var total = parseInt(q.total_votes || 0);
        body = '<div class="tmr-qotd-opts">' + (q.options || []).map(function (o) {
          return optionResultHTML(o, total, yourOpt, resolved);
        }).join('') + '</div>';
      }
    } else {
      if (q.scoring_mode === 'closest') {
        body = '<input class="tmr-qotd-num" type="number" step="any" data-qid="' + q.id + '" data-mode="closest" placeholder="Your number">';
      } else {
        body = '<div class="tmr-qotd-opts" role="radiogroup">' + (q.options || []).map(function (o) {
          return '<button type="button" class="tmr-qotd-opt" role="radio" aria-checked="false" ' +
            'data-qid="' + q.id + '" data-oid="' + o.id + '" data-mode="option">' +
            '<span class="tmr-qotd-olabel">' + esc(o.option_text) + '</span></button>';
        }).join('') + '</div>';
      }
    }
    return '<div class="tmr-qotd-q">' + head + body + '</div>';
  }

  function render(container) {
    var st = STATE.get(container);
    if (!st) return;
    var f = st.f, game = st.game;
    var qs = (game && game.questions) || [];
    var isOpen = f.featured_status === 'open' && f.status !== 'resolved';
    var resolved = f.featured_status === 'results' || f.status === 'resolved';
    var pending = !isOpen && !resolved; // answering closed, awaiting grading
    var loggedIn = isLoggedIn();
    var answerMode = isOpen && loggedIn;
    var entries = f.total_players || 0;

    var chip = resolved ? '<span class="tmr-qotd-chip done">Final Results</span>' :
      pending ? '<span class="tmr-qotd-chip done">Awaiting Results</span>' :
      '<span class="tmr-qotd-chip live">Live</span>';

    var facts = '<div class="tmr-qotd-facts">' +
      '<span><i class="fas fa-baseball"></i>' + esc(f.sport || 'Sports') + '</span>' +
      '<span><i class="fas fa-list-ol"></i>' + (f.question_count || qs.length) + ' questions</span>' +
      '<span><i class="fas fa-coins"></i>' + (f.points_available || 0) + ' pts available</span>' +
      (f.closes_at ? '<span><i class="fas fa-clock"></i>' + (isOpen ? 'Closes ' : 'Closed ') + esc(fmtDate(f.closes_at)) + '</span>' : '') +
      (entries > 0
        ? '<span><i class="fas fa-users"></i>' + entries + (entries === 1 ? ' entry' : ' entries') + '</span>'
        : (isOpen
            ? '<span class="first"><i class="fas fa-bolt"></i>Be the first to predict</span>'
            : '<span><i class="fas fa-users"></i>No entries</span>')) +
      '</div>';

    var qMode = answerMode ? 'answer' : 'results';
    var qsHtml = qs.map(function (q) { return questionHTML(q, qMode); }).join('');

    var actions;
    if (!isOpen) {
      var linkLabel = resolved ? 'View full results &amp; leaderboard &rarr;' : 'View quiz &amp; standings &rarr;';
      actions = '<div class="tmr-qotd-actions">' +
        (pending ? '<span class="tmr-qotd-note">Answering closed &middot; grading soon</span>' : '') +
        '<a class="tmr-qotd-link" href="/polls/#poll-' + f.id + '">' + linkLabel + '</a></div>';
    } else if (!loggedIn) {
      actions = '<div class="tmr-qotd-actions">' +
        '<a class="tmr-qotd-btn" href="' + loginUrl() + '"><i class="fas fa-right-to-bracket"></i> Log in to play</a>' +
        '<a class="tmr-qotd-link" href="/polls/#poll-' + f.id + '">See the quiz &rarr;</a></div>';
    } else {
      var already = qs.some(function (q) { return q.user_answer; });
      actions = '<div class="tmr-qotd-actions">' +
        '<button type="button" class="tmr-qotd-btn" data-act="submit"><i class="fas fa-check"></i> ' +
        (already ? 'Update My Picks' : 'Lock In Picks') + '</button>' +
        '<a class="tmr-qotd-link" href="/polls/#poll-' + f.id + '">Full quiz &amp; leaderboard &rarr;</a></div>';
    }

    container.innerHTML =
      '<div class="tmr-qotd">' +
        '<div><span class="tmr-qotd-eyebrow"><i class="fas fa-trophy"></i> Prediction Quiz of the Day</span>' + chip + '</div>' +
        '<div class="tmr-qotd-title">' + esc(f.title) + '</div>' +
        facts +
        qsHtml +
        '<div class="tmr-qotd-err" data-err></div>' +
        actions +
      '</div>';

    // restore local selections after a re-render (before submit)
    if (st.sel) {
      Object.keys(st.sel).forEach(function (qid) {
        var btn = container.querySelector('.tmr-qotd-opt[data-qid="' + qid + '"][data-oid="' + st.sel[qid] + '"]');
        if (btn) { btn.classList.add('sel'); btn.setAttribute('aria-checked', 'true'); }
      });
    }
  }

  // ---- interaction ----------------------------------------------------------

  function onClick(container, e) {
    var opt = e.target.closest('.tmr-qotd-opt[data-mode="option"]');
    if (opt && !opt.hasAttribute('disabled')) {
      var qid = opt.getAttribute('data-qid');
      var oid = opt.getAttribute('data-oid');
      var st = STATE.get(container); if (!st) return;
      st.sel = st.sel || {};
      st.sel[qid] = oid;
      // clear siblings, mark this
      container.querySelectorAll('.tmr-qotd-opt[data-qid="' + qid + '"]').forEach(function (b) {
        b.classList.remove('sel'); b.setAttribute('aria-checked', 'false');
      });
      opt.classList.add('sel'); opt.setAttribute('aria-checked', 'true');
      return;
    }
    var submit = e.target.closest('[data-act="submit"]');
    if (submit) { e.preventDefault(); doSubmit(container, submit); }
  }

  function collectAnswers(container) {
    var st = STATE.get(container);
    var qs = (st.game && st.game.questions) || [];
    var answers = [];
    qs.forEach(function (q) {
      if (q.scoring_mode === 'closest') {
        var inp = container.querySelector('.tmr-qotd-num[data-qid="' + q.id + '"]');
        if (inp && inp.value !== '' && !isNaN(Number(inp.value))) answers.push({ question_id: q.id, numeric_value: Number(inp.value) });
      } else if (st.sel && st.sel[q.id]) {
        answers.push({ question_id: q.id, option_id: parseInt(st.sel[q.id]) });
      }
    });
    return answers;
  }

  async function doSubmit(container, btn) {
    if (!isLoggedIn()) { location.href = loginUrl(); return; }
    var st = STATE.get(container);
    var errEl = container.querySelector('[data-err]');
    var answers = collectAnswers(container);
    if (!answers.length) { if (errEl) errEl.textContent = 'Answer at least one question first.'; return; }
    if (errEl) errEl.textContent = '';
    btn.disabled = true; var html = btn.innerHTML; btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Saving...';
    try {
      var res = await req('/polls/' + st.f.id + '/game/vote', { method: 'POST', body: { answers: answers } });
      // The vote response is authoritative (includes the user's answers +
      // updated counts). Keep it; do NOT let a lagged /featured read wipe it.
      if (res && res.game) st.game = res.game;
      // Best-effort meta refresh only (entries), never the game payload.
      try {
        var fresh = await req('/polls/featured');
        if (fresh && fresh.featured && String(fresh.featured.id) === String(st.f.id)) st.f = fresh.featured;
      } catch (e) {}
      st.sel = null;
      render(container);
    } catch (err) {
      btn.disabled = false; btn.innerHTML = html;
      if (errEl) errEl.textContent = (err && err.message) ? err.message : 'Could not submit picks.';
    }
  }

  // ---- boot -----------------------------------------------------------------

  var STATE = new WeakMap();

  async function load(container) {
    injectStyles();
    container.innerHTML = '<div class="tmr-qotd-skel"></div>';
    var data;
    try { data = await req('/polls/featured'); }
    catch (e) { container.style.display = 'none'; return; }
    if (!data || !data.featured) { container.style.display = 'none'; return; }
    STATE.set(container, { f: data.featured, game: data.game, sel: null });
    container.style.display = '';
    render(container);
    if (!container._tmrQotdBound) {
      container.addEventListener('click', function (e) { onClick(container, e); });
      container._tmrQotdBound = true;
    }
  }

  window.TMRQuizOfDay = {
    mount: function (target) {
      var el = typeof target === 'string' ? document.querySelector(target) : target;
      if (!el) return;
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { load(el); });
      } else { load(el); }
    }
  };
})();
