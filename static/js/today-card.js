/**
 * TrustMyRecord - /today/ personalised daily dashboard.
 *
 * WHAT IT IS
 *
 * The answer to "what is happening on TMR right now, for me?", for a member who
 * already has an account. /welcome/ improves the first session for a new signup;
 * this page is for everybody, every day.
 *
 * IT BUILDS NOTHING. Every endpoint below is read-only and already existed:
 *
 *   GET /api/health                   -> the server clock (see below) + which
 *                                        sports currently have upcoming games
 *   GET /api/auth/me                  -> username, avatar, favourite teams, record
 *   GET /api/polls/featured           -> today's quiz + user_answered + closes_at
 *   GET /api/polls/{id}/game          -> that quiz's questions, points and locks
 *   GET /api/polls/leaderboard        -> quiz standings + this member's rank
 *   GET /api/trivia/v2/me/stats       -> career points, streak, accuracy
 *   GET /api/trivia/v2/categories     -> playable trivia categories
 *   GET /api/games/board/{sport_key}  -> today's games and moneylines
 *   GET /api/picks/activation-status  -> pick count, for the board footer
 *   GET /api/forum/stats              -> community pulse
 *
 * No write of any kind. No pick, grade, unit, ROI value, coin, ledger row or
 * historical record is created or touched anywhere in this file.
 *
 * WHY THE GAME SOURCE IS /api/games/board AND NOT /api/nav/mlb-slate
 *
 * The original card asked /api/nav/mlb-slate for today's games. That endpoint
 * stopped answering (measured 2026-08-13: no response inside 45s, three
 * consecutive attempts), so the teams module fell through to its "unavailable"
 * branch every single time and rendered the string "Following 3 teams" - the
 * visible symptom that started this redesign. /api/games/board/{sport_key} is
 * the sportsbook's own source, answers in ~1s, covers every league rather than
 * MLB only, and carries the moneylines as well as the times. The pure teamState()
 * contract below is unchanged; the board is simply adapted into the same shape.
 *
 * THE DAY BOUNDARY IS THE SERVER'S, NOT THE BROWSER'S
 *
 * "Played today" has to reset at the same instant for everyone, and a browser
 * clock can be wrong by hours. So the current instant comes from a response
 * BODY (/api/health's ISO `timestamp`), and every day comparison is that instant
 * formatted in America/New_York. The browser's timezone is irrelevant - Intl
 * converts a known instant into ET correctly from any zone - and the browser's
 * clock is never consulted.
 *
 * If no server time is available (every request failed), the day-sensitive
 * modules fall back to their neutral state rather than guessing. A wrong
 * "you already played today" is worse than no claim at all.
 *
 * TRUTHFUL STATES, INCLUDING THE UNFLATTERING ONES
 *
 * Today's quiz closes per question, at each question's own first pitch, which
 * locks out anyone working a normal day. This page must not paint a Play button
 * on something the backend will reject, so a closed quiz renders as closed with
 * a link to the standings - never as an invitation. Same rule for every module:
 * open, completed, closed, not yet posted, and unavailable are five distinct,
 * honest states, and a module that cannot load says so rather than showing a
 * plausible zero.
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

    // PER_QUESTION_DEADLINES_20260809
    //
    // Each question now closes at its own game's first pitch, so a quiz is
    // routinely part open and part shut and a single open/closed label would
    // be a lie either way. When the API reports per-question state, trust it:
    // it is computed from the same voting_deadline the vote endpoint enforces.
    // A quiz created before this shipped has no such field and falls through
    // to the original parent-deadline logic below, unchanged.
    if (typeof featured.questions_open === 'number') {
      var total = featured.total_questions || featured.question_count || 0;
      var openCount = featured.questions_open;
      var unanswered = (typeof featured.questions_open_unanswered === 'number')
        ? featured.questions_open_unanswered : openCount;
      if (openCount <= 0) {
        // Nothing left to answer. Completed if they played, closed if they did not.
        return featured.user_answered
          ? { state: 'completed', poll: featured }
          : { state: 'closed', poll: featured };
      }
      if (unanswered <= 0) {
        // Every question still open has already been answered by this member.
        return { state: 'completed', poll: featured, open: openCount, total: total };
      }
      return { state: 'open', poll: featured, open: openCount, total: total, unanswered: unanswered };
    }

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

  /* ---- pure helpers added for the dashboard, all unit-testable ---------- */

  /** Normalised team name, for comparing "St. Louis Cardinals" to "st louis cardinals". */
  function normTeam(s) { return String(s || '').toLowerCase().replace(/[^a-z]/g, ''); }

  /** Does this board game involve `team`? Exact-or-contains, both directions. */
  function gameHasTeam(game, team) {
    var w = normTeam(team);
    if (!w) return false;
    return [game && game.away_team, game && game.home_team].some(function (n) {
      var v = normTeam(n);
      return v && (v === w || v.indexOf(w) !== -1 || w.indexOf(v) !== -1);
    });
  }

  /** Board games whose ET calendar day equals `dayStr` (YYYY-MM-DD). */
  function gamesOnDay(games, dayStr) {
    if (!Array.isArray(games) || !dayStr) return [];
    return games.filter(function (g) { return etDay(Date.parse(g && g.commence_time)) === dayStr; });
  }

  /**
   * The game to show for a team: today's if there is one, otherwise the next
   * one that has not started. Returns { game, isToday } or null.
   * Never returns a game in the past - "next up: yesterday" is worse than blank.
   */
  function teamGame(games, team, nowMs) {
    if (!Array.isArray(games)) return null;
    var mine = games.filter(function (g) { return gameHasTeam(g, team); })
      .sort(function (a, b) { return Date.parse(a.commence_time) - Date.parse(b.commence_time); });
    if (!mine.length) return null;
    var today = etDay(nowMs);
    for (var i = 0; i < mine.length; i++) {
      if (today && etDay(Date.parse(mine[i].commence_time)) === today) return { game: mine[i], isToday: true };
    }
    if (nowMs === null || nowMs === undefined) return null;
    for (var j = 0; j < mine.length; j++) {
      if (Date.parse(mine[j].commence_time) >= nowMs) return { game: mine[j], isToday: false };
    }
    return null;
  }

  /**
   * The moneyline for one side of a board game, as the API already formats it
   * ("+107", "-125"), or null when the game has no sportsbook price yet. Reads
   * the market_groups the sportsbook page reads, then falls back to the raw
   * bookmaker payload; it never computes or estimates a price.
   */
  function moneyline(game, team) {
    if (!game) return null;
    var want = normTeam(team);
    var groups = game.market_groups || [];
    for (var i = 0; i < groups.length; i++) {
      var items = groups[i].items || [];
      for (var j = 0; j < items.length; j++) {
        var it = items[j];
        if (it.market_type === 'h2h' && normTeam(it.selection) === want && it.odds_display) return it.odds_display;
      }
    }
    var books = game.bookmakers || [];
    for (var b = 0; b < books.length; b++) {
      var mk = (books[b].markets || []).filter(function (m) { return m.key === 'h2h'; })[0];
      if (!mk) continue;
      var out = (mk.outcomes || []).filter(function (o) { return normTeam(o.name) === want; })[0];
      if (out && typeof out.price === 'number') return (out.price > 0 ? '+' : '') + out.price;
    }
    return null;
  }

  /**
   * A club's nickname, for dense rows where the market name would truncate.
   *
   * Naive "last word" gives "York Yankees" nothing, but naive "last two words"
   * gives exactly that, and "State Warriors", and "Bay Packers". The nickname
   * is the last word EXCEPT for the handful of real two-word nicknames across
   * the four leagues, which are listed rather than guessed at.
   */
  var TWO_WORD_NICKNAMES = {
    'red sox': 1, 'white sox': 1, 'blue jays': 1, 'blue jackets': 1,
    'maple leafs': 1, 'red wings': 1, 'golden knights': 1, 'golden bears': 1,
    'trail blazers': 1, 'hockey club': 1
  };
  function shortTeamName(name) {
    var s = String(name === null || name === undefined ? '' : name).trim();
    var parts = s.split(/\s+/).filter(Boolean);
    if (parts.length <= 1) return s;
    var lastTwo = parts.slice(-2).join(' ');
    if (TWO_WORD_NICKNAMES[lastTwo.toLowerCase()]) return lastTwo;
    return parts[parts.length - 1];
  }

  /** The four pro-league sport keys that currently have upcoming games. */
  var MAJORS = {
    mlb: 'baseball_mlb', nfl: 'americanfootball_nfl',
    nba: 'basketball_nba', nhl: 'icehockey_nhl'
  };
  function activeLeagues(health) {
    var g = (health && health.games) || {};
    return Object.keys(MAJORS).filter(function (k) {
      var row = g[MAJORS[k]];
      return row && Number(row.upcoming) > 0;
    });
  }

  var api = {
    SITE_TZ: SITE_TZ,
    MAJORS: MAJORS,
    etDay: etDay,
    sameEtDay: sameEtDay,
    pollState: pollState,
    triviaState: triviaState,
    teamState: teamState,
    gameHasTeam: gameHasTeam,
    gamesOnDay: gamesOnDay,
    teamGame: teamGame,
    moneyline: moneyline,
    shortTeamName: shortTeamName,
    activeLeagues: activeLeagues
  };

  /* -------------------------------------------------------------- the DOM */

  api.__boot = function () {
    if (typeof window === 'undefined' || window.__tmrTodayCard) return;
    window.__tmrTodayCard = true;

    var API = (window.TMR_API_BASE || window.API_BASE_URL || 'https://trustmyrecord-api.onrender.com').replace(/\/$/, '');
    var TIMEOUT_MS = 9000;
    var serverNow = null;   // ms, from a server response body. Never Date.now().
    var serverNowAt = null; // monotonic reading taken at the same instant.
    var health = null;
    var TL = window.TMRTeamLogo || null;

    /**
     * The current instant, still on the SERVER's clock.
     *
     * serverNow is a single reading and goes stale the moment it lands, which is
     * fine for "is it the same ET day" but not for a ticking countdown. Elapsed
     * time since that reading comes from performance.now(), which is monotonic
     * and - unlike Date.now() - cannot be wrong because the device's wall clock
     * is wrong, cannot jump when the OS syncs time, and never reintroduces the
     * browser clock this file exists to avoid. No performance API, no tick.
     */
    function monotonic() {
      return (typeof performance !== 'undefined' && performance && typeof performance.now === 'function')
        ? performance.now() : null;
    }
    function nowOnServerClock() {
      if (serverNow === null) return null;
      var m = monotonic();
      if (m === null || serverNowAt === null) return serverNow;
      return serverNow + (m - serverNowAt);
    }

    // What the hero sentence is allowed to say, filled in as modules resolve.
    var summary = { name: null, questions: null, points: null, games: null };

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
     *
     * The same response also lists which sports have upcoming games, which is
     * how the board and teams modules know which leagues to ask for without
     * four speculative requests in the off-season.
     */
    function loadServerNow() {
      return get('/api/health', false).then(function (h) {
        health = h;
        var t = h && h.timestamp ? Date.parse(h.timestamp) : NaN;
        if (!isNaN(t)) { serverNow = t; serverNowAt = monotonic(); }
      }).catch(function () { /* serverNow stays null: we decline to guess */ });
    }

    /* ------------------------------------------------------ DOM utilities */

    function el(id) { return document.getElementById(id); }
    function esc(s) {
      return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
    }
    function nfmt(n) {
      var v = Number(n);
      if (!isFinite(v)) return '—';
      try { return v.toLocaleString('en-US'); } catch (e) { return String(v); }
    }
    function setText(id, text) { var n = el(id); if (n) n.textContent = text; }
    function setHTML(id, html) { var n = el(id); if (n) n.innerHTML = html; }
    function setChip(id, text, cls) {
      var n = el(id);
      if (!n) return;
      n.textContent = text;
      n.className = 'td-chip' + (cls ? ' ' + cls : '');
    }
    function setCta(id, text, href, muted) {
      var a = el(id);
      if (!a) return;
      if (text) a.textContent = text;
      if (href) a.setAttribute('href', href);
      if (muted) { a.classList.add('is-muted'); a.classList.remove('primary'); }
    }
    function markDone(cardId) { var c = el(cardId); if (c) c.classList.add('is-done'); }

    /** An instant -> "7:05 PM" in ET. */
    function etTime(ms) {
      if (ms === null || ms === undefined || isNaN(ms)) return '';
      try {
        return new Intl.DateTimeFormat('en-US', {
          timeZone: SITE_TZ, hour: 'numeric', minute: '2-digit'
        }).format(new Date(ms));
      } catch (e) { return ''; }
    }
    /** An instant -> "Today" / "Tomorrow" / "Fri Aug 15", relative to server time. */
    function etDateLabel(ms, nowMs) {
      var d = etDay(ms), today = etDay(nowMs);
      if (d && today) {
        if (d === today) return 'Today';
        if (d === etDay(nowMs + 86400000)) return 'Tomorrow';
      }
      try {
        return new Intl.DateTimeFormat('en-US', {
          timeZone: SITE_TZ, weekday: 'short', month: 'short', day: 'numeric'
        }).format(new Date(ms));
      } catch (e) { return ''; }
    }

    /** Team logo mark, from the shared helper, with an initials fallback. */
    function logoMark(name, cls) {
      cls = cls || 'td-tl';
      if (TL && typeof TL.html === 'function') return TL.html(name, { className: cls });
      return '<span class="' + cls + ' is-fallback"><span class="' + cls + '-fallback">?</span></span>';
    }
    function leagueOf(name) {
      return (TL && typeof TL.league === 'function') ? TL.league(name) : null;
    }
    /** Short team name for dense rows: "Toronto Blue Jays" -> "Blue Jays". */
    function shortTeam(name) { return shortTeamName(name); }

    /* ------------------------------------------------------- hero / header */

    function renderDate() {
      var d = el('tdDate');
      if (!d) return;
      if (serverNow === null) { d.textContent = 'Today'; return; }
      try {
        d.textContent = new Intl.DateTimeFormat('en-US', {
          timeZone: SITE_TZ, weekday: 'long', month: 'long', day: 'numeric'
        }).format(new Date(serverNow));
      } catch (e) { d.textContent = 'Today'; }
    }

    function renderSummary() {
      var bits = [];
      if (summary.questions) {
        bits.push('<b>' + esc(summary.questions) + '</b> quiz question' + (summary.questions === 1 ? '' : 's') +
                  (summary.points ? ' worth <b>' + esc(nfmt(summary.points)) + '</b> points' : ''));
      }
      if (summary.games) bits.push('<b>' + esc(summary.games) + '</b> game' + (summary.games === 1 ? '' : 's') + ' on the board');
      var lead = summary.name ? 'Welcome back, <b>' + esc(summary.name) + '</b>' : 'Here is your card';
      var n = el('tdSub');
      if (!n) return;
      n.innerHTML = bits.length
        ? lead + ' &mdash; ' + bits.join(' and ') + '.'
        : lead + ' &mdash; your quiz, your trivia, your teams and today&rsquo;s board.';
    }

    /**
     * The live countdown to the next question lock.
     *
     * Only started for a quiz that is actually open — counting down to a
     * deadline on something already shut would be theatre. It stops itself at
     * zero and says so rather than rolling into negatives, and it is the only
     * animated thing on the page that carries a number.
     */
    var lockTimer = null;
    function startLockCountdown(targetMs) {
      if (lockTimer) { clearInterval(lockTimer); lockTimer = null; }
      var strip = el('tdLockStrip');
      if (!strip) return;
      if (isNaN(targetMs) || nowOnServerClock() === null || monotonic() === null) { strip.hidden = true; return; }

      function pad(n) { return (n < 10 ? '0' : '') + n; }
      function tick() {
        var left = targetMs - nowOnServerClock();
        if (left <= 0) {
          setText('tdLockVal', 'Locked');
          if (lockTimer) { clearInterval(lockTimer); lockTimer = null; }
          return;
        }
        var s = Math.floor(left / 1000);
        var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
        setText('tdLockVal', h > 0 ? (h + ':' + pad(m) + ':' + pad(sec)) : (m + ':' + pad(sec)));
      }
      strip.hidden = false;
      tick();
      lockTimer = setInterval(tick, 1000);
    }

    /* ------------------------------------------ module 1: today's quiz ---- */

    function renderQuizQuestions(questions, nowMs) {
      var list = el('tdPollList');
      if (!list) return;
      if (!Array.isArray(questions) || !questions.length) { list.innerHTML = ''; return; }
      var shown = questions.slice(0, 4);
      var html = shown.map(function (q, i) {
        var dl = Date.parse(q.voting_deadline);
        var shut = !isNaN(dl) && nowMs !== null && nowMs !== undefined && nowMs >= dl;
        var answered = !!q.user_answer;
        var meta = answered ? 'Answered'
          : (shut ? 'Locked' : (isNaN(dl) ? '' : 'Locks ' + etTime(dl)));
        return '<li class="' + (answered ? 'answered' : '') + (shut && !answered ? ' shut' : '') + '">' +
          '<span class="qn">' + (answered ? '<i class="fas fa-check" aria-hidden="true"></i>' : (i + 1)) + '</span>' +
          '<span class="qt">' + esc(q.title || 'Question ' + (i + 1)) + '</span>' +
          '<span class="qm">' + (q.base_points ? '<span class="pt">+' + esc(q.base_points) + '</span> &middot; ' : '') +
            esc(meta) + '</span>' +
          '</li>';
      }).join('');
      var rest = questions.length - shown.length;
      if (rest > 0) {
        html += '<li><span class="qn">+' + rest + '</span>' +
                '<span class="qt">' + rest + ' more question' + (rest === 1 ? '' : 's') + ' in today&rsquo;s quiz</span>' +
                '<span class="qm"></span></li>';
      }
      list.innerHTML = html;
    }

    function loadPoll() {
      return get('/api/polls/featured', false).then(function (d) {
        var featured = d && d.featured;
        var res = pollState(featured, serverNow);
        var f = res.poll || featured || {};
        var total = f.total_questions || f.question_count || 0;
        var answered = f.user_answered_count || 0;

        setText('tdPollPts', f.points_available ? nfmt(f.points_available) : '—');
        setText('tdPollQs', total ? nfmt(total) : '—');
        setText('tdPollOpen', typeof f.questions_open === 'number' ? nfmt(f.questions_open) : '—');
        var nextLock = Date.parse(f.next_close_at || f.closes_at);
        setText('tdPollLock', isNaN(nextLock) ? '—' : etTime(nextLock));

        var bar = el('tdPollBar');
        if (bar && total) bar.style.width = Math.round((answered / total) * 100) + '%';
        // The travelling highlight describes progress. With nothing answered
        // there is no progress to describe and it would read as a spinner.
        if (bar && bar.parentNode) {
          bar.parentNode.classList.toggle('has-progress', !!(total && answered > 0));
        }
        setText('tdPollBarCap', total
          ? answered + ' of ' + total + ' answered'
          : 'No questions posted yet');

        summary.questions = total || null;
        summary.points = f.points_available || null;
        renderSummary();

        if (res.state === 'unavailable') {
          startLockCountdown(NaN);
          setChip('tdPollChip', 'Not posted yet', 'warn');
          setText('tdPollNote', 'Today’s quiz has not been posted yet.');
          setCta('tdPollCta', 'See recent quizzes', '/polls/history/', true);
          return;
        }

        // The questions give the preview list its rows. It is a nice-to-have:
        // if it fails the module is still complete without it.
        var qs = f.id ? get('/api/polls/' + f.id + '/game', true)
          .then(function (g) { return (g && g.questions) || []; })
          .catch(function () { return []; }) : Promise.resolve([]);

        return qs.then(function (questions) {
          renderQuizQuestions(questions, serverNow);
          if (res.state === 'completed') {
            startLockCountdown(NaN);
            markDone('tdModPoll');
            setChip('tdPollChip', 'Answered', 'done');
            setText('tdPollNote', 'Results post after the games. ' +
              (f.total_players ? f.total_players + ' player' + (f.total_players === 1 ? '' : 's') + ' entered today.' : ''));
            setCta('tdPollCta', 'See the standings', '/polls/', true);
            return;
          }
          if (res.state === 'closed') {
            // The backend would reject a play here, so do not offer one.
            startLockCountdown(NaN);
            setChip('tdPollChip', 'Closed', 'shut');
            setText('tdPollNote', 'Closed for today — results post after the games.');
            setCta('tdPollCta', 'See the standings', '/polls/', true);
            return;
          }
          if (res.state === 'unknown_time') {
            startLockCountdown(NaN);
            setChip('tdPollChip', 'Open the quiz', '');
            setText('tdPollNote', 'Open the quiz to check today’s deadline.');
            setCta('tdPollCta', 'Open the quiz', '/polls/');
            return;
          }
          // Mixed state: say exactly how much is still answerable, so nobody
          // opens the quiz expecting ten questions and finds four.
          if (res.open && res.total && res.open < res.total) {
            startLockCountdown(nextLock);
            setChip('tdPollChip', res.open + ' of ' + res.total + ' questions still open', 'live');
            setText('tdPollNote', res.open + ' of ' + res.total + ' questions still open — the rest have locked.');
            setCta('tdPollCta', 'Answer what’s open', '/polls/');
            return;
          }
          startLockCountdown(nextLock);
          setChip('tdPollChip', 'Open now', 'live');
          setText('tdPollNote', f.total_players
            ? f.total_players + ' player' + (f.total_players === 1 ? '' : 's') + ' in so far today.'
            : 'Be the first in today.');
          setCta('tdPollCta', 'Answer today’s quiz', '/polls/');
        });
      }).catch(function () {
        startLockCountdown(NaN);
        setChip('tdPollChip', 'Unavailable', 'warn');
        setText('tdPollBarCap', 'Today’s quiz could not be loaded.');
        setText('tdPollNote', 'Open the quiz to see today’s questions.');
        setCta('tdPollCta', 'Open the quiz', '/polls/');
      });
    }

    /* ------------------------------------------ module 2: daily trivia ---- */

    function renderTriviaCats(cats) {
      var box = el('tdTriviaCats');
      if (!box) return;
      if (!Array.isArray(cats) || !cats.length) { box.innerHTML = ''; return; }
      box.innerHTML = cats.slice(0, 5).map(function (c) {
        return '<a class="td-cat" href="/trivia/' + esc(c.slug) + '/" data-action="trivia_cat">' +
          (c.icon ? '<span aria-hidden="true">' + esc(c.icon) + '</span>' : '') +
          '<span>' + esc(c.name || c.slug) + '</span>' +
          (c.question_count ? '<span class="n">' + nfmt(c.question_count) + '</span>' : '') +
          '</a>';
      }).join('');
    }

    function loadTrivia() {
      var cats = get('/api/trivia/v2/categories', false)
        .then(function (d) { return (d && d.categories) || []; })
        .catch(function () { return null; });

      return Promise.all([get('/api/trivia/v2/me/stats', true).catch(function () { return null; }), cats])
        .then(function (out) {
          var d = out[0], catList = out[1];
          var playable = Array.isArray(catList) ? catList.length : undefined;
          renderTriviaCats(catList);

          var res = triviaState(d && d.stats, serverNow, playable);
          var s = res.stats || (d && d.stats) || {};

          setText('tdTriviaPts', s.career_points !== undefined ? nfmt(s.career_points) : '—');
          setText('tdTriviaStreak', s.current_streak !== undefined ? nfmt(s.current_streak) : '—');
          setText('tdTriviaBest', s.best_streak !== undefined ? nfmt(s.best_streak) : '—');
          setText('tdTriviaAcc', s.accuracy !== undefined && s.accuracy !== null ? s.accuracy + '%' : '—');
          setText('tdTriviaGames', s.best_game_score !== undefined ? nfmt(s.best_game_score) : '—');
          setText('tdStatTrivia', s.career_points !== undefined ? nfmt(s.career_points) : '—');
          setText('tdStatStreak', s.current_streak !== undefined ? nfmt(s.current_streak) : '—');

          if (res.state === 'closed') {
            setChip('tdTriviaChip', 'No categories', 'shut');
            setText('tdTriviaNote', 'No trivia categories are open right now.');
            setCta('tdTriviaCta', 'Open trivia', '/trivia/', true);
            return;
          }
          if (res.state === 'completed') {
            markDone('tdModTrivia');
            setChip('tdTriviaChip', 'Played today', 'done');
            setText('tdTriviaNote', nfmt(s.day_points || 0) + ' points today');
            setCta('tdTriviaCta', 'Play another', '/trivia/');
            return;
          }
          if (res.state === 'unavailable') {
            setChip('tdTriviaChip', 'Ready', '');
            setText('tdTriviaNote', 'Pick a category and play.');
            setCta('tdTriviaCta', 'Play trivia', '/trivia/');
            return;
          }
          setChip('tdTriviaChip', 'Not played today', 'live');
          setText('tdTriviaNote', res.everPlayed
            ? (nfmt(s.games_played || 0) + ' games played')
            : '2,000+ questions');
          setCta('tdTriviaCta', 'Play trivia', '/trivia/');
        });
    }

    /* -------------------------------------------- boards: the game source */

    var boardCache = {};
    function loadBoard(league) {
      if (boardCache[league]) return boardCache[league];
      var key = MAJORS[league];
      boardCache[league] = get('/api/games/board/' + encodeURIComponent(key) + '?limit=60', false)
        .then(function (d) { return { league: league, games: (d && d.games) || [] }; })
        .catch(function () { return { league: league, games: null }; });
      return boardCache[league];
    }

    /**
     * Every league worth asking about: the ones with upcoming games per
     * /api/health, plus any league one of this member's teams plays in (so a
     * followed team is never silently dropped because its season is quiet).
     */
    function leaguesToLoad(favoriteTeams) {
      var set = {};
      activeLeagues(health).forEach(function (k) { set[k] = 1; });
      (favoriteTeams || []).forEach(function (t) {
        var lg = leagueOf(t);
        if (lg && MAJORS[lg]) set[lg] = 1;
      });
      return Object.keys(set);
    }

    /* ------------------------------------------- module 3: your teams ----- */

    function teamTileHTML(team, boards, nowMs) {
      var lg = leagueOf(team);
      var board = lg ? boards[lg] : null;
      var name = '<div class="td-team-n">' + esc(team) +
        (lg ? '<span class="td-team-league">' + esc(lg.toUpperCase()) + '</span>' : '') + '</div>';

      var body;
      var isToday = false;
      if (!board || board.games === null) {
        body = '<div class="td-matchup"><span class="td-mu-when dim">Schedule unavailable</span></div>';
      } else {
        var found = teamGame(board.games, team, nowMs);
        if (!found) {
          body = '<div class="td-matchup"><span class="td-mu-when dim">No upcoming game</span></div>';
        } else {
          var g = found.game;
          isToday = found.isToday;
          var atHome = gameHasTeam({ away_team: '', home_team: g.home_team }, team);
          var opp = atHome ? g.away_team : g.home_team;
          var ms = Date.parse(g.commence_time);
          var ml = moneyline(g, team);
          body = '<div class="td-matchup">' +
            logoMark(opp, 'td-mu-l') +
            '<span class="td-mu-t">' + (atHome ? 'vs' : 'at') + ' ' + esc(shortTeam(opp)) + '</span>' +
            '<span class="td-mu-when' + (isToday ? '' : ' dim') + '">' +
              esc(etDateLabel(ms, nowMs) + (etTime(ms) ? ' · ' + etTime(ms) : '')) + '</span>' +
            (ml ? '<span class="td-mu-odds">' + esc(ml) + '</span>' : '') +
            '</div>';
        }
      }
      // The club's own colour, taken from its own logo: a blurred copy behind
      // the tile. Decorative and aria-hidden; if the logo will not resolve the
      // tile simply has no bloom.
      var bloomUrl = (TL && typeof TL.url === 'function') ? TL.url(team) : null;
      var bloom = bloomUrl
        ? '<img class="td-team-bloom" src="' + esc(bloomUrl) + '" alt="" aria-hidden="true" loading="eager">'
        : '';
      return '<div class="td-team' + (isToday ? ' is-today' : '') + '">' + bloom +
        logoMark(team, 'td-tl') +
        '<div class="td-team-b">' + name + body + '</div>' +
        '</div>';
    }

    function renderTeams(me, boards) {
      var teams = (me && Array.isArray(me.favorite_teams)) ? me.favorite_teams.filter(Boolean) : [];
      var grid = el('tdTeamGrid');
      if (!grid) return;

      if (!teams.length) {
        setChip('tdTeamChip', 'None yet', 'warn');
        grid.innerHTML = '<div class="td-empty">' +
          '<p>You are not following any teams yet. Follow your teams and their games, times and lines show up here every day.</p>' +
          '<a class="td-cta sm" href="/profile/" data-action="teams">Pick your teams</a></div>';
        setText('tdTeamNote', 'No teams set yet.');
        setCta('tdTeamCta', 'Pick your teams', '/profile/');
        return;
      }

      grid.innerHTML = teams.map(function (t) { return teamTileHTML(t, boards, serverNow); }).join('');

      var playingToday = teams.filter(function (t) {
        var lg = leagueOf(t), b = lg ? boards[lg] : null;
        if (!b || !b.games) return false;
        var f = teamGame(b.games, t, serverNow);
        return !!(f && f.isToday);
      }).length;

      if (playingToday) {
        markDone('tdModTeams');
        setChip('tdTeamChip', playingToday + ' playing today', 'live');
        setText('tdTeamNote', playingToday + ' of your ' + teams.length + ' teams ' +
          (playingToday === 1 ? 'is' : 'are') + ' in action today.');
      } else {
        setChip('tdTeamChip', 'Following ' + teams.length, '');
        setText('tdTeamNote', 'None of your teams play today.');
      }
    }

    /* ------------------------------------------ module 4: today's board --- */

    function gameRowHTML(g, nowMs) {
      var ms = Date.parse(g.commence_time);
      var lg = leagueOf(g.home_team) || leagueOf(g.away_team);
      var awayMl = moneyline(g, g.away_team);
      var homeMl = moneyline(g, g.home_team);

      // Which side is favoured is read off the two posted prices, never
      // computed: lower number = shorter price. With one side missing, or
      // neither posted, nothing is highlighted.
      var an = awayMl === null ? NaN : parseInt(String(awayMl).replace('+', ''), 10);
      var hn = homeMl === null ? NaN : parseInt(String(homeMl).replace('+', ''), 10);
      var bothPriced = isFinite(an) && isFinite(hn);

      function side(team, ml, isFav) {
        var price = ml
          ? '<span class="td-g-ml' + (isFav ? ' fav' : '') + '">' + esc(ml) + '</span>'
          : '<span class="td-g-ml pending">Pending</span>';
        return '<span class="td-g-row">' + logoMark(team, 'td-mu-l') +
          '<span class="td-g-name">' + esc(shortTeam(team)) + '</span>' + price + '</span>';
      }

      // Away above home, the order every scoreboard uses.
      return '<a class="td-game" href="/sportsbook/" data-action="board_game">' +
        '<span class="td-g-when">' + esc(etTime(ms)) +
          (lg ? '<em>' + esc(lg.toUpperCase()) + '</em>' : '') + '</span>' +
        '<span class="td-g-sides">' +
          side(g.away_team, awayMl, bothPriced && an < hn) +
          side(g.home_team, homeMl, bothPriced && hn < an) +
        '</span>' +
      '</a>';
    }

    function renderBoard(boards) {
      var list = el('tdBoardList');
      if (!list) return;
      var today = etDay(serverNow);
      var all = [];
      var anyBoard = false;
      Object.keys(boards).forEach(function (k) {
        if (boards[k] && boards[k].games) { anyBoard = true; all = all.concat(gamesOnDay(boards[k].games, today)); }
      });
      all.sort(function (a, b) { return Date.parse(a.commence_time) - Date.parse(b.commence_time); });
      summary.games = all.length || null;
      renderSummary();

      if (!anyBoard) {
        setChip('tdBoardChip', 'Unavailable', 'warn');
        list.innerHTML = '<div class="td-empty"><p>Today’s lines could not be loaded right now. The full board is still open.</p>' +
          '<a class="td-cta sm" href="/sportsbook/">Open the board</a></div>';
        return;
      }
      if (!all.length) {
        setChip('tdBoardChip', 'No games today', 'shut');
        list.innerHTML = '<div class="td-empty"><p>No games on the board for today. Tomorrow’s slate posts as the lines open.</p>' +
          '<a class="td-cta sm" href="/sportsbook/">Open the board</a></div>';
        return;
      }
      var shown = all.slice(0, 6);
      setChip('tdBoardChip', all.length + ' game' + (all.length === 1 ? '' : 's') + ' today', 'live');
      list.innerHTML = shown.map(function (g) { return gameRowHTML(g, serverNow); }).join('');
      setCta('tdPickCta', all.length > shown.length
        ? 'See all ' + all.length + ' games' : 'See today’s board', '/sportsbook/');
    }

    /* --------------------------------------- module 5: quiz standings ----- */

    function avatarHTML(url, name, cls) {
      cls = cls || 'td-lb-av';
      if (url) return '<img class="' + cls + '" src="' + esc(url) + '" alt="" loading="lazy" ' +
        'onerror="this.style.display=\'none\';this.nextSibling.style.display=\'flex\';">' +
        '<span class="' + cls + 'f" style="display:none" aria-hidden="true">' + esc(String(name || '?').charAt(0).toUpperCase()) + '</span>';
      return '<span class="' + cls + 'f" aria-hidden="true">' + esc(String(name || '?').charAt(0).toUpperCase()) + '</span>';
    }

    function loadStandings(me) {
      return get('/api/polls/leaderboard?limit=25', false).then(function (d) {
        var rows = (d && d.leaderboard) || [];
        var list = el('tdStandList');
        if (!rows.length) {
          setChip('tdStandChip', 'Empty', 'shut');
          if (list) list.innerHTML = '<div class="td-empty"><p>No graded quizzes yet this period.</p></div>';
          return;
        }
        var mine = null;
        if (me && me.username) {
          mine = rows.filter(function (r) { return r.username === me.username; })[0] || null;
        }
        if (mine) {
          setText('tdStatRank', '#' + nfmt(mine.rank));
          setText('tdStatPollPts', nfmt(mine.total_points));
          setChip('tdStandChip', 'You are #' + mine.rank, 'live');
          setText('tdStandNote', nfmt(mine.polls_entered || 0) + ' quiz' + ((mine.polls_entered || 0) === 1 ? '' : 'zes') + ' · ' +
            (mine.prediction_accuracy !== undefined && mine.prediction_accuracy !== null ? mine.prediction_accuracy + '% correct' : ''));
        } else {
          setChip('tdStandChip', rows.length + ' ranked', '');
          setText('tdStandNote', 'Answer a quiz to join the standings.');
        }

        var top = rows.slice(0, 5);
        // If they are ranked outside the top five, show their own row as well
        // rather than a leaderboard they do not appear on.
        if (mine && top.indexOf(mine) === -1) top = top.slice(0, 4).concat([mine]);

        if (list) {
          list.innerHTML = top.map(function (r) {
            var isMe = !!(me && r.username === me.username);
            return '<div class="td-lbrow' + (isMe ? ' me' : '') + '">' +
              '<span class="td-lb-rank">' + esc(r.rank) + '</span>' +
              avatarHTML(r.avatar_url, r.display_name || r.username) +
              '<span class="td-lb-n">' + esc(r.display_name || r.username) +
                '<em>' + esc((r.prediction_accuracy !== undefined && r.prediction_accuracy !== null ? r.prediction_accuracy + '% · ' : '') +
                  (r.polls_entered || 0) + ' quiz' + ((r.polls_entered || 0) === 1 ? '' : 'zes')) + '</em></span>' +
              '<span class="td-lb-p">' + esc(nfmt(r.total_points)) + '</span>' +
              '</div>';
          }).join('');
        }
      }).catch(function () {
        setChip('tdStandChip', 'Unavailable', 'warn');
        var list = el('tdStandList');
        if (list) list.innerHTML = '<div class="td-empty"><p>Standings could not be loaded right now.</p>' +
          '<a class="td-cta sm" href="/leaderboards/">Open leaderboards</a></div>';
      });
    }

    /* ------------------------------------------- module 6: community ------ */

    function loadCommunity() {
      return get('/api/forum/stats', false).then(function (s) {
        if (!s) throw new Error('empty');
        setText('tdCommThreads', nfmt(s.total_threads));
        setText('tdCommPosts', nfmt(s.total_posts));
        setText('tdCommMembers', nfmt(s.total_members));
        setText('tdCommNew', nfmt(s.new_users_today));
        var active = Number(s.active_users);
        setChip('tdCommChip', isFinite(active) && active > 0 ? active + ' active' : 'Open', isFinite(active) && active > 0 ? 'live' : '');
        var nm = s.newest_member;
        var box = el('tdCommNewest');
        if (nm && nm.username && box) {
          box.hidden = false;
          setHTML('tdNewestAvf', esc(String(nm.display_name || nm.username).charAt(0).toUpperCase()));
          var name = el('tdNewestName');
          if (name) {
            name.innerHTML = '<a href="' + esc(nm.profile_url || ('/u/' + nm.username + '/')) + '" data-action="newest_member">' +
              esc(nm.display_name || nm.username) + '</a>';
          }
        }
      }).catch(function () {
        setChip('tdCommChip', 'Unavailable', 'warn');
      });
    }

    /* ------------------------------------------------ the optional record - */

    function loadPicks() {
      return get('/api/picks/activation-status', true).then(function (d) {
        if (d && d.hasPicks) {
          setText('tdPickNote', nfmt(d.pickCount || 0) + ' tracked pick' + (d.pickCount === 1 ? '' : 's') + ' on your record');
          return;
        }
        setText('tdPickNote', 'No tracked picks — entirely optional');
      }).catch(function () {
        setText('tdPickNote', 'Browse the board — entirely optional');
      });
    }

    /* -------------------------------------------------------------- wiring */

    function renderWho(me) {
      if (!me) return;
      var who = el('tdWho');
      if (who) who.hidden = false;
      var av = el('tdAvatar');
      if (av && me.avatar_url) av.src = me.avatar_url;
      setText('tdWhoName', me.display_name || me.username || '');
      var bits = [];
      if (me.total_picks) bits.push((me.wins || 0) + '-' + (me.losses || 0));
      if (me.net_units !== undefined && me.net_units !== null && me.total_picks) {
        var u = Number(me.net_units);
        if (isFinite(u)) bits.push((u >= 0 ? '+' : '') + u.toFixed(2) + 'u');
      }
      if (me.win_rate && me.total_picks) bits.push(Number(me.win_rate).toFixed(1) + '%');
      setText('tdWhoMeta', bits.join(' · ') || 'Member');
      summary.name = me.display_name || me.username || null;
      renderSummary();
      var head = el('tdHead');
      if (head && serverNow !== null) head.textContent = 'Today';
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
        if (h) h.textContent = 'Today';
        var s = el('tdSub');
        if (s) s.textContent = 'Answer today’s prediction quiz, play trivia, and follow your teams. Log in to see your own card.';
        var lo = el('tdLoggedOut');
        if (lo) lo.hidden = false;
        var grid = el('tdGrid');
        if (grid) grid.hidden = true;
        var stats = el('tdStats');
        if (stats) stats.hidden = true;
        track('today_viewed', { authed: 'no' });
        return;
      }
      track('today_viewed', { authed: 'yes' });

      // The server clock has to land before anything that decides "today", so
      // the day-sensitive modules wait on it. The rest start immediately.
      var clock = loadServerNow();
      clock.then(renderDate);
      clock.then(loadPoll);
      clock.then(loadTrivia);

      var me = get('/api/auth/me', true).then(function (d) { return (d && d.user) || null; })
        .catch(function () { return null; });

      me.then(renderWho);
      me.then(loadStandings);
      loadCommunity();
      loadPicks();

      // Teams and the board share one set of board requests.
      Promise.all([clock, me]).then(function (out) {
        var user = out[1];
        var leagues = leaguesToLoad(user && user.favorite_teams);
        return Promise.all(leagues.map(loadBoard)).then(function (results) {
          var boards = {};
          results.forEach(function (r) { boards[r.league] = r; });
          renderTeams(user, boards);
          renderBoard(boards);
        });
      }).catch(function () {
        setChip('tdTeamChip', 'Unavailable', 'warn');
        setChip('tdBoardChip', 'Unavailable', 'warn');
      });

      setTimeout(function () {
        track('today_state', { modules_done: document.querySelectorAll('.td-card.is-done').length });
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
