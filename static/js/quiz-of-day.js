/**
 * quiz-of-day.js — compact "Prediction Quiz of the Day" PREVIEW card.
 * ===================================================================
 * Announces the featured quiz returned by GET /api/polls/featured and links to
 * the dedicated quiz page. It is a preview ONLY: it must never render quiz
 * questions, answer options, Over/Under buttons, numeric inputs, or any other
 * response control. Answering happens on /polls/ — the community feed stays
 * social and compact, whatever the quiz is and however many questions it has.
 *
 * Shows: eyebrow, status chip, title, sport, question count, points available,
 * closing time, entries, the viewer's participation status, and one CTA.
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

  function loginUrl(next) {
    try { return '/login/?next=' + encodeURIComponent(next || (location.pathname + location.hash)); }
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
      '.tmr-qotd{--q-line:rgba(120,150,190,.22);--q-mut:#93a4ba;--q-cyan:#22d3ee;--q-green:#34d399;',
      'display:block;text-decoration:none;background:linear-gradient(160deg,#14263f 0%,#0f1b2e 100%);',
      'border:1px solid var(--q-line);border-radius:16px;padding:16px 18px;color:#e6eefb;font-family:inherit;box-shadow:0 6px 26px rgba(4,10,22,.32);transition:border-color .15s ease,transform .15s ease}',
      '.tmr-qotd:hover{border-color:var(--q-cyan);transform:translateY(-1px)}',
      '.tmr-qotd *{box-sizing:border-box}',
      '.tmr-qotd-eyebrow{display:inline-flex;align-items:center;gap:7px;font-size:.68rem;font-weight:900;letter-spacing:.14em;text-transform:uppercase;color:var(--q-cyan)}',
      '.tmr-qotd-chip{font-size:.6rem;font-weight:900;letter-spacing:.08em;text-transform:uppercase;padding:2px 8px;border-radius:999px;margin-left:8px}',
      '.tmr-qotd-chip.live{background:rgba(52,211,153,.14);color:#6ee7b7;border:1px solid rgba(52,211,153,.4)}',
      '.tmr-qotd-chip.done{background:rgba(148,163,184,.14);color:#cbd5e1;border:1px solid rgba(148,163,184,.3)}',
      '.tmr-qotd-title{font-size:1.12rem;font-weight:900;line-height:1.25;margin:8px 0 10px;color:#e6eefb}',
      '.tmr-qotd-facts{display:flex;flex-wrap:wrap;gap:6px 14px;font-size:.76rem;color:var(--q-mut);font-weight:700;margin-bottom:12px}',
      '.tmr-qotd-facts i{color:var(--q-cyan);margin-right:5px}',
      '.tmr-qotd-facts .first{color:var(--q-green)}',
      '.tmr-qotd-note{font-size:.76rem;color:var(--q-mut);font-weight:700}',
      '.tmr-qotd-note strong{color:#cfe0f5}',
      '.tmr-qotd-actions{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin-top:13px}',
      '.tmr-qotd-btn{display:inline-flex;align-items:center;gap:7px;padding:10px 18px;border-radius:999px;border:1px solid rgba(34,211,238,.5);',
      'background:linear-gradient(135deg,var(--q-green),var(--q-cyan));color:#06111f;font-family:inherit;font-weight:900;font-size:.84rem}',
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

  function render(container, f, game) {
    var qs = (game && game.questions) || [];
    var isOpen = f.featured_status === 'open' && f.status !== 'resolved';
    var resolved = f.featured_status === 'results' || f.status === 'resolved';
    var pending = !isOpen && !resolved; // answering closed, awaiting grading
    var loggedIn = isLoggedIn();
    var entries = f.total_players || 0;
    var totalQ = f.question_count || f.total_questions || qs.length || 0;
    var quizUrl = '/polls/#poll-' + f.id;

    // Grading state is authoritative over the answering-window state: a quiz can
    // be open for answers while some questions have already resolved, and can be
    // long closed with nothing resolved at all.
    var gstate = (f.state) || (resolved ? 'final' : 'awaiting');
    var chip = gstate === 'final' ? '<span class="tmr-qotd-chip done">Final Results</span>' :
      gstate === 'partial' ? '<span class="tmr-qotd-chip done">' + (f.questions_resolved || 0) + '/' + totalQ + ' resolved</span>' :
      pending ? '<span class="tmr-qotd-chip done">Awaiting Results</span>' :
      '<span class="tmr-qotd-chip live">Live</span>';

    var facts = '<div class="tmr-qotd-facts">' +
      '<span><i class="fas fa-baseball"></i>' + esc(f.sport || 'Sports') + '</span>' +
      '<span><i class="fas fa-list-ol"></i>' + totalQ + ' questions</span>' +
      '<span><i class="fas fa-coins"></i>' + (f.points_available || 0) + ' pts available</span>' +
      (f.closes_at ? '<span><i class="fas fa-clock"></i>' + (isOpen ? 'Closes ' : 'Closed ') + esc(fmtDate(f.closes_at)) + '</span>' : '') +
      (entries > 0
        ? '<span><i class="fas fa-users"></i>' + entries + (entries === 1 ? ' entry' : ' entries') + '</span>'
        : (isOpen
            ? '<span class="first"><i class="fas fa-bolt"></i>Be the first to predict</span>'
            : '<span><i class="fas fa-users"></i>No entries</span>')) +
      '</div>';

    // Participation status only — never a submission count read as a score.
    var myPicks = qs.filter(function (q) { return q.user_answer; }).length;
    var status = '';
    if (loggedIn && myPicks > 0) {
      status = '<div class="tmr-qotd-note"><strong>' + myPicks + ' of ' + (totalQ || myPicks) + ' picks submitted</strong>' +
        (gstate === 'final' ? ' &middot; graded' :
         gstate === 'partial' ? ' &middot; ' + (f.questions_resolved || 0) + ' of ' + totalQ + ' questions resolved' :
         ' &middot; awaiting results') + '</div>';
    } else if (loggedIn && isOpen) {
      status = '<div class="tmr-qotd-note">You have not entered yet</div>';
    } else if (pending) {
      status = '<div class="tmr-qotd-note">Answering closed &middot; grading soon</div>';
    }

    var cta;
    if (resolved) cta = '<i class="fas fa-trophy"></i> View Results';
    else if (!isOpen) cta = '<i class="fas fa-list-check"></i> View Quiz';
    else if (!loggedIn) cta = '<i class="fas fa-right-to-bracket"></i> Log in to play';
    else cta = '<i class="fas fa-check"></i> ' + (myPicks > 0 ? 'Update My Predictions' : 'Make Predictions');

    var href = (isOpen && !loggedIn) ? loginUrl(quizUrl) : quizUrl;

    container.innerHTML =
      '<a class="tmr-qotd" href="' + esc(href) + '">' +
        '<div><span class="tmr-qotd-eyebrow"><i class="fas fa-trophy"></i> Prediction Quiz of the Day</span>' + chip + '</div>' +
        '<div class="tmr-qotd-title">' + esc(f.title) + '</div>' +
        facts +
        status +
        '<div class="tmr-qotd-actions"><span class="tmr-qotd-btn">' + cta + '</span></div>' +
      '</a>';
  }

  // ---- boot -----------------------------------------------------------------

  async function load(container) {
    injectStyles();
    container.innerHTML = '<div class="tmr-qotd-skel"></div>';
    var data;
    try { data = await req('/polls/featured'); }
    catch (e) { container.style.display = 'none'; return; }
    if (!data || !data.featured) { container.style.display = 'none'; return; }
    container.style.display = '';
    render(container, data.featured, data.game);
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
