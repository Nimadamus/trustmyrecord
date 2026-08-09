/**
 * TrustMyRecord - /today/ daily card.
 *
 * WHAT IT IS
 *
 * The answer to "what are the best things I can do on TMR right now?", for a
 * member who already has an account. /welcome/ improves the first session for
 * a new signup; this page is for everybody, every day. It is deliberately four
 * modules and no more - it is not a dashboard.
 *
 * IT BUILDS NOTHING. Four read-only endpoints, all of which already existed:
 *
 *   GET /api/auth/me                 -> username, favorite_teams
 *   GET /api/polls/featured          -> today's quiz + user_answered + closes_at
 *   GET /api/trivia/v2/me/stats      -> attempts, last_played_at, streak
 *   GET /api/nav/mlb-slate           -> today's MLB slate (the homepage ticker's source)
 *   GET /api/picks/activation-status -> pick count, for the optional fourth row
 *
 * No write of any kind. No pick, grade, unit, ROI value, coin, ledger row or
 * historical record is created or touched anywhere in this file.
 *
 * THE DAY BOUNDARY IS THE SERVER'S, NOT THE BROWSER'S
 *
 * "Played today" has to reset at the same instant for everyone, and a browser
 * clock can be wrong by hours. So the current instant comes from the HTTP
 * `Date` response header of a call we are already making, and every day
 * comparison is that instant formatted in America/New_York. The browser's
 * timezone is irrelevant - Intl converts a known instant into ET correctly
 * from any zone - and the browser's clock is never consulted.
 *
 * If no server time is available (every request failed), the day-sensitive
 * modules fall back to their neutral state rather than guessing. A wrong
 * "you already played today" is worse than no claim at all.
 *
 * TRUTHFUL STATES, INCLUDING THE UNFLATTERING ONES
 *
 * Today's quiz currently closes around first pitch, which locks out anyone
 * working a normal day. Fixing that is a separate release. Until then this
 * page must not paint a Play button on something the backend will reject, so
 * a closed quiz renders as closed with a link to the standings - never as an
 * invitation. Same rule for every module: open, completed, closed, not yet
 * posted, and unavailable are five distinct, honest states.
 */
(function (root, factory) {
  // Dual export so the pure date/state logic below can be unit tested in Node
  // without a browser. The DOM half only runs when there is a document.
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.tmrTodayLogic = api;
  if (typeof document !== 'undefined') api.__boot();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var SITE_TZ = 'America/New_York';

  /* ---------------------------------------------------------- pure logic */

  /** An instant (ms) -> that instant's calendar day in ET, as YYYY-MM-DD. */
  function etDay(ms) {
    if (ms === null || ms === undefined || isNaN(ms)) return null;
    try {
      // en-CA formats as YYYY-MM-DD, which sorts and compares as a string.
      return new Intl.DateTimeFormat('en-CA', {
        timeZone: SITE_TZ, year: 'numeric', month: '2-digit', day: '2-digit'
      }).format(new Date(ms));
    } catch (e) { return null; }
  }

  /** Two instants on the same ET calendar day? Null-safe: unknown is not "same". */
  function sameEtDay(aMs, bMs) {
    var a = etDay(aMs), b = etDay(bMs);
    return !!(a && b && a === b);
  }

  /**
   * Today's quiz state.
   *   unavailable - nothing posted yet
   *   completed   - this member has already answered
   *   closed      - past its close time, or not active: NO playable CTA
   *   open        - answer it now
   * `nowMs` must be server time. Without it we cannot tell open from closed,
   * so we decline to offer a Play button and report unknown_time.
   */
  function pollState(featured, nowMs) {
    if (!featured) return { state: 'unavailable' };
    if (featured.user_answered) return { state: 'completed', poll: featured };
    var status = String(featured.status || '').toLowerCase();
    if (status && status !== 'active' && status !== 'open') return { state: 'closed', poll: featured };
    var closes = featured.closes_at ? Date.parse(featured.closes_at) : NaN;
    if (!isNaN(closes)) {
      if (nowMs === null || nowMs === undefined) return { state: 'unknown_time', poll: featured };
      if (nowMs >= closes) return { state: 'closed', poll: featured };
    }
    return { state: 'open', poll: featured };
  }

  /**
   * Daily trivia state. Trivia has no close time in the current system, so
   * "closed" is only reachable if the backend reports nothing playable - it is
   * never invented here.
   */
  function triviaState(stats, nowMs, playableCategories) {
    if (playableCategories === 0) return { state: 'closed' };
    if (!stats) return { state: 'unavailable' };
    var played = stats.last_played_at ? Date.parse(stats.last_played_at) : NaN;
    if (!isNaN(played) && nowMs !== null && nowMs !== undefined && sameEtDay(played, nowMs)) {
      return { state: 'completed', stats: stats };
    }
    return { state: 'open', stats: stats, everPlayed: Number(stats.attempts) > 0 };
  }

  /**
   * Which of today's games involve this member's teams.
   * No teams -> a real call to action, never a dead card.
   */
  function teamState(favoriteTeams, slate) {
    var teams = Array.isArray(favoriteTeams) ? favoriteTeams.filter(Boolean) : [];
    if (!teams.length) return { state: 'no_teams' };
    if (!slate || !Array.isArray(slate.games)) return { state: 'unavailable', teams: teams };
    var norm = function (s) { return String(s || '').toLowerCase().replace(/[^a-z]/g, ''); };
    var wanted = teams.map(norm);
    var hits = slate.games.filter(function (g) {
      var names = [g.away_team_name, g.home_team_name, g.away, g.home].map(norm);
      return wanted.some(function (w) {
        return names.some(function (n) { return n && w && (n === w || n.indexOf(w) !== -1 || w.indexOf(n) !== -1); });
      });
    });
    if (!hits.length) return { state: 'no_games_today', teams: teams };
    return { state: 'games', teams: teams, games: hits };
  }

  var api = {
    SITE_TZ: SITE_TZ,
    etDay: etDay,
    sameEtDay: sameEtDay,
    pollState: pollState,
    triviaState: triviaState,
    teamState: teamState
  };

  /* -------------------------------------------------------------- the DOM */

  api.__boot = function () {
    if (typeof window === 'undefined' || window.__tmrTodayCard) return;
    window.__tmrTodayCard = true;

    var API = (window.TMR_API_BASE || window.API_BASE_URL || 'https://trustmyrecord-api.onrender.com').replace(/\/$/, '');
    var TIMEOUT_MS = 6000;
    var serverNow = null;   // ms, from an HTTP Date header. Never Date.now().

    function token() {
      try {
        return localStorage.getItem('trustmyrecord_token') ||
               localStorage.getItem('tmr_token') ||
               localStorage.getItem('accessToken') || '';
      } catch (e) { return ''; }
    }

    function track(name, params) {
      try { if (typeof window.gtag === 'function') window.gtag('event', name, params || {}); } catch (e) {}
      try {
        window.dataLayer = window.dataLayer || [];
        window.dataLayer.push(Object.assign({ event: name }, params || {}));
      } catch (e) {}
    }

    function get(path, authed) {
      var ctrl = (typeof AbortController === 'function') ? new AbortController() : null;
      var timer = setTimeout(function () { try { ctrl && ctrl.abort(); } catch (e) {} }, TIMEOUT_MS);
      var opts = { signal: ctrl ? ctrl.signal : undefined, headers: {} };
      if (authed) {
        var t = token();
        if (!t) { clearTimeout(timer); return Promise.reject(new Error('no token')); }
        opts.headers.Authorization = 'Bearer ' + t;
      }
      return fetch(API + path, opts).then(function (r) {
        clearTimeout(timer);
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      }).catch(function (e) { clearTimeout(timer); throw e; });
    }

    /**
     * The server's clock.
     *
     * The obvious source - the HTTP `Date` response header - is NOT readable
     * here: `Date` is not on the CORS-safelisted response header list, and the
     * API is a different origin, so headers.get('date') returns null in the
     * browser. Verified against production: the only exposed headers are
     * cache-control, content-type, expires and pragma.
     *
     * So the instant comes from a response BODY instead. /api/health is public,
     * cheap, and returns an ISO `timestamp` written by the server. If it fails,
     * serverNow stays null and every day-sensitive module falls back to its
     * neutral state rather than guessing from the browser clock.
     */
    function loadServerNow() {
      return get('/api/health', false).then(function (h) {
        var t = h && h.timestamp ? Date.parse(h.timestamp) : NaN;
        if (!isNaN(t)) serverNow = t;
      }).catch(function () { /* serverNow stays null: we decline to guess */ });
    }

    function el(id) { return document.getElementById(id); }
    function setStatus(id, text, cls) {
      var n = el(id);
      if (!n) return;
      n.textContent = text;
      n.className = 'td-status' + (cls ? ' ' + cls : '');
    }
    function setCta(id, text, href, disabled) {
      var a = el(id);
      if (!a) return;
      a.textContent = text;
      if (href) a.setAttribute('href', href);
      if (disabled) { a.classList.add('is-muted'); } else { a.classList.remove('is-muted'); }
    }
    function markDone(rowId) { var r = el(rowId); if (r) r.classList.add('is-done'); }

    /* ---- module 1: today's quiz ---- */
    function loadPoll() {
      return get('/api/polls/featured', false).then(function (d) {
        var res = pollState(d && d.featured, serverNow);
        var f = res.poll || {};
        if (res.state === 'unavailable') {
          setStatus('tdPollStatus', 'No quiz posted yet today', 'warn');
          setCta('tdPollCta', 'See recent quizzes', '/polls/history/', true);
          return;
        }
        if (res.state === 'completed') {
          markDone('tdRowPoll');
          setStatus('tdPollStatus', 'Answered — results post after the games', 'ok');
          setCta('tdPollCta', 'See the standings', '/polls/', true);
          return;
        }
        if (res.state === 'closed') {
          // The backend would reject a play here, so do not offer one.
          setStatus('tdPollStatus', 'Closed for today — results post after the games', 'warn');
          setCta('tdPollCta', 'See the standings', '/polls/', true);
          return;
        }
        if (res.state === 'unknown_time') {
          setStatus('tdPollStatus', 'Open the quiz to check today’s deadline');
          setCta('tdPollCta', 'Open the quiz', '/polls/');
          return;
        }
        var bits = [];
        if (f.question_count) bits.push(f.question_count + ' questions');
        if (f.points_available) bits.push(f.points_available + ' points');
        setStatus('tdPollStatus', bits.join(' · ') || 'Open now');
        setCta('tdPollCta', 'Answer today’s quiz', '/polls/');
      }).catch(function () {
        setStatus('tdPollStatus', 'Open the quiz to see today’s questions');
        setCta('tdPollCta', 'Open the quiz', '/polls/');
      });
    }

    /* ---- module 2: daily trivia ---- */
    function loadTrivia() {
      return get('/api/trivia/v2/me/stats', true).then(function (d) {
        var res = triviaState(d && d.stats, serverNow, undefined);
        var s = res.stats || {};
        if (res.state === 'completed') {
          markDone('tdRowTrivia');
          var streak = s.current_streak ? (' · ' + s.current_streak + ' in a row') : '';
          setStatus('tdTriviaStatus', 'Played today — ' + (s.day_points || 0) + ' points' + streak, 'ok');
          setCta('tdTriviaCta', 'Play another', '/trivia/');
          return;
        }
        if (res.state === 'unavailable') {
          setStatus('tdTriviaStatus', 'Pick a category and play');
          return;
        }
        setStatus('tdTriviaStatus', res.everPlayed
          ? ('Not played today · ' + (s.career_points || 0) + ' career points')
          : 'Not played yet · 2,000+ questions');
        setCta('tdTriviaCta', 'Play trivia', '/trivia/');
      }).catch(function () {
        setStatus('tdTriviaStatus', 'Pick a category and play');
      });
    }

    /* ---- module 3: your teams ---- */
    function loadTeams() {
      return Promise.all([
        get('/api/auth/me', true).catch(function () { return null; }),
        get('/api/nav/mlb-slate', false).catch(function () { return null; })
      ]).then(function (out) {
        var me = out[0] && out[0].user ? out[0].user : null;
        var slate = out[1];
        if (!me) {
          setStatus('tdTeamStatus', 'Set your teams to see their games here');
          setCta('tdTeamCta', 'Pick your teams', '/profile/');
          return;
        }
        var res = teamState(me.favorite_teams, slate);
        if (res.state === 'no_teams') {
          setStatus('tdTeamStatus', 'No teams set yet');
          setCta('tdTeamCta', 'Pick your teams', '/profile/');
          return;
        }
        if (res.state === 'unavailable') {
          setStatus('tdTeamStatus', 'Following ' + res.teams.length + ' team' + (res.teams.length === 1 ? '' : 's'));
          setCta('tdTeamCta', 'See today’s board', '/sportsbook/');
          return;
        }
        if (res.state === 'no_games_today') {
          setStatus('tdTeamStatus', 'No MLB games today for ' + res.teams.slice(0, 3).join(', '));
          setCta('tdTeamCta', 'See the full slate', '/sportsbook/');
          return;
        }
        var g = res.games[0];
        var line = (g.away_team_name || g.away) + ' at ' + (g.home_team_name || g.home);
        var more = res.games.length > 1 ? (' · +' + (res.games.length - 1) + ' more') : '';
        markDone('tdRowTeam');
        setStatus('tdTeamStatus', line + more, 'ok');
        setCta('tdTeamCta', 'Discuss & predict', '/polls/');
      }).catch(function () {
        setStatus('tdTeamStatus', 'Set your teams to see their games here');
        setCta('tdTeamCta', 'Pick your teams', '/profile/');
      });
    }

    /* ---- module 4: the optional board ---- */
    function loadPicks() {
      return get('/api/picks/activation-status', true).then(function (d) {
        if (d && d.hasPicks) {
          setStatus('tdPickStatus', (d.pickCount || 0) + ' tracked pick' + (d.pickCount === 1 ? '' : 's') + ' on your record');
          setCta('tdPickCta', 'Open the board', '/sportsbook/');
          return;
        }
        setStatus('tdPickStatus', 'No tracked picks — entirely optional');
      }).catch(function () {
        setStatus('tdPickStatus', 'Browse the board — entirely optional');
      });
    }

    function renderDate() {
      var d = el('tdDate');
      if (!d) return;
      var day = etDay(serverNow);
      if (!day) { d.textContent = 'Today'; return; }
      try {
        d.textContent = new Intl.DateTimeFormat('en-US', {
          timeZone: SITE_TZ, weekday: 'long', month: 'long', day: 'numeric'
        }).format(new Date(serverNow));
      } catch (e) { d.textContent = 'Today'; }
    }

    function bindClicks() {
      document.addEventListener('click', function (ev) {
        var a = ev.target && ev.target.closest ? ev.target.closest('[data-action]') : null;
        if (!a) return;
        track('today_module_clicked', { module: a.getAttribute('data-action') });
      }, true);
    }

    function start() {
      bindClicks();
      if (!token()) {
        // Logged out: the page is a plain, honest description with one CTA.
        // No member state is fetched or implied.
        var h = el('tdHead');
        if (h) h.textContent = 'Your daily card on TrustMyRecord';
        var s = el('tdSub');
        if (s) s.textContent = 'Answer today’s quiz, play trivia, and follow your teams. Log in to see your own card.';
        var lo = el('tdLoggedOut');
        if (lo) lo.hidden = false;
        var grid = el('tdGrid');
        if (grid) grid.hidden = true;
        track('today_viewed', { authed: 'no' });
        return;
      }
      track('today_viewed', { authed: 'yes' });
      // The server clock has to land before anything that decides "today", so
      // the two day-sensitive modules wait on it. The other two do not care and
      // start immediately.
      var clock = loadServerNow();
      clock.then(renderDate);
      clock.then(loadPoll);
      clock.then(loadTrivia);
      loadTeams();
      loadPicks();
      setTimeout(function () {
        track('today_state', { modules_done: document.querySelectorAll('.td-row.is-done').length });
      }, TIMEOUT_MS + 500);
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', start);
    } else {
      start();
    }
  };

  return api;
}));
