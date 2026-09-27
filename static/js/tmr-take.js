/* =============================================================================
   TrustMyRecord - Share Your Take composer. SHARE_YOUR_TAKE_20260927
   -----------------------------------------------------------------------------
   One composer for every surface. A Take is an ordinary feed post
   (POST /api/feed, post_type 'hot_take'), so it lands in the Community Feed,
   the Hot Takes tab and the poster's profile with the likes, replies and
   verified record line those cards already have. There is no second posting
   system and no separate destination.

   HOW A PAGE USES IT

     Homepage:   TMRTake.dock()                  fixed dock, logged-in only
     Simulator:  document.dispatchEvent(new CustomEvent('tmr:sim-result', {
                   detail: { sport, away: {name, abbr}, home: {name, abbr},
                             away_wp, home_wp, simulations, anchor } }))
                 -> an inline composer is placed right after `anchor`.
     Anywhere:   TMRTake.mount(el, context)
                 context = { source, sport, team, label, game_id, url,
                             kind: 'general'|'sim'|'team'|'game'|'final', ... }

   The prompt is built from the context (team page, matchup, final score,
   simulation) and falls back to a rotating general prompt. Sport/team/game
   tags come from the page; the member is never asked to pick one.
   ============================================================================= */
(function (window, document) {
  'use strict';
  if (window.TMRTake) return;

  var MAX_LEN = 500;
  var LS_PROMPT = 'tmr_take_prompt_i';
  var SS_MIN = 'tmr_take_dock_min';

  function apiBase() {
    if (window.TMRSession && window.TMRSession.api) return window.TMRSession.api;
    var cfg = (typeof CONFIG !== 'undefined' && CONFIG) ? CONFIG : window.CONFIG;
    return ((cfg && cfg.api && cfg.api.baseUrl) || 'https://trustmyrecord-api.onrender.com/api').replace(/\/+$/, '');
  }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { } }
  function ssGet(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }
  function ssSet(k, v) { try { sessionStorage.setItem(k, v); } catch (e) { } }

  function currentUser() {
    var S = window.TMRSession;
    if (!S || !S.hasTokens || !S.hasTokens()) return null;
    var u = S.getCachedUser && S.getCachedUser();
    return u && (u.username || u.id) ? u : null;
  }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  /* ------------------------------------------------------------------ */
  /* Prompts                                                            */
  /* ------------------------------------------------------------------ */

  var GENERAL = [
    "What's on your mind about sports today?",
    'How are you feeling about your team?',
    "Thoughts on today's matchups?",
    "What's your sports take right now?",
    'Who are you watching today?',
    'What are you confident about today?'
  ];

  /* Season aware extras, keyed off the visitor's own calendar. */
  function seasonalPrompts(now) {
    var m = now.getMonth(), d = now.getDay(), out = [];
    var nflSeason = m >= 8 || m === 0;              // Sep through Jan
    if (nflSeason && (d === 0 || d === 1 || d === 4)) {
      out.push("Who's your lock on the NFL slate today?", 'Which NFL game has your attention today?');
    }
    if (m >= 8 && m <= 11 && d === 6) out.push('Which college football game are you watching today?');
    if (m >= 2 && m <= 9) out.push("What's your read on tonight's baseball slate?");
    if (m >= 9 || m <= 5) out.push("How's your team looking on the court or the ice this week?");
    return out;
  }

  function generalPrompt() {
    var pool = GENERAL.concat(seasonalPrompts(new Date()));
    var i = parseInt(lsGet(LS_PROMPT), 10);
    i = isFinite(i) ? (i + 1) % pool.length : Math.floor(Math.random() * pool.length);
    lsSet(LS_PROMPT, String(i));
    return pool[i];
  }

  function pctText(v) {
    var n = Number(v);
    if (!isFinite(n)) return null;
    if (n <= 1) n = n * 100;
    return Math.round(n) + '%';
  }

  function promptFor(ctx) {
    ctx = ctx || {};
    if (ctx.kind === 'sim' && ctx.winner && pctText(ctx.winner_wp)) {
      var sims = ctx.simulations ? ' of ' + Number(ctx.simulations).toLocaleString() + ' simulations' : ' of simulations';
      return ctx.winner + ' won ' + pctText(ctx.winner_wp) + sims + '. Agree or disagree?';
    }
    if (ctx.kind === 'team' && ctx.team) return 'How are you feeling about the ' + ctx.team + ' right now?';
    if (ctx.kind === 'game' && ctx.away && ctx.home) return "What's your take on " + ctx.away + ' vs ' + ctx.home + '?';
    if (ctx.kind === 'final' && ctx.winner && ctx.loser && ctx.score) {
      return ctx.winner + ' just beat ' + ctx.loser + ' ' + ctx.score + '. What stood out?';
    }
    return generalPrompt();
  }

  /* ------------------------------------------------------------------ */
  /* Styles (TMR navy panel, teal brand, gold flame)                     */
  /* ------------------------------------------------------------------ */

  function injectStyles() {
    if (document.getElementById('tmr-take-css')) return;
    var css = [
      '.tmr-take{--tk-bg:#0E1620;--tk-bg2:#121C28;--tk-line:rgba(34,210,192,.28);--tk-ink:#EAF2FA;--tk-mut:#93A9C0;--tk-brand:#0C948C;--tk-brand-lt:#22D2C0;--tk-gold:#FFC93C;',
      'font-family:Inter,"Segoe UI",Arial,sans-serif;color:var(--tk-ink);background:linear-gradient(180deg,var(--tk-bg2),var(--tk-bg));border:1px solid var(--tk-line);border-radius:15px;padding:14px 16px;box-shadow:0 1px 3px rgba(0,0,0,.25),0 15px 45px rgba(0,0,0,.28);text-align:left}',
      '.tmr-take *{box-sizing:border-box}',
      '.tmr-take-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:4px}',
      '.tmr-take-kicker{font:700 12px/1.2 "Barlow Condensed",Inter,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:var(--tk-gold)}',
      '.tmr-take-prompt{font:600 16px/1.35 Inter,"Segoe UI",sans-serif;margin:2px 0 10px;color:var(--tk-ink)}',
      '.tmr-take-row{display:flex;gap:10px;align-items:flex-end}',
      '.tmr-take-input{flex:1;min-width:0;resize:none;min-height:44px;max-height:140px;padding:11px 13px;border-radius:10px;border:1px solid rgba(147,169,192,.35);background:#07111C;color:var(--tk-ink);font:15px/1.4 Inter,"Segoe UI",sans-serif;outline:none}',
      '.tmr-take-input:focus{border-color:var(--tk-brand-lt);box-shadow:0 0 0 3px rgba(34,210,192,.18)}',
      '.tmr-take-input::placeholder{color:#6F869E}',
      '.tmr-take-post{flex:none;height:44px;padding:0 18px;border:0;border-radius:10px;background:var(--tk-brand);color:#fff;font:700 14px/1 "Barlow Condensed",Inter,sans-serif;letter-spacing:.08em;text-transform:uppercase;cursor:pointer}',
      '.tmr-take-post:hover:not(:disabled){background:#07736D}',
      '.tmr-take-post:disabled{opacity:.45;cursor:not-allowed}',
      '.tmr-take-foot{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px;margin-top:9px;min-height:22px}',
      '.tmr-take-tags{display:flex;flex-wrap:wrap;gap:6px;align-items:center}',
      '.tmr-take-tag{display:inline-flex;align-items:center;gap:5px;padding:3px 9px;border-radius:999px;background:rgba(34,210,192,.12);border:1px solid rgba(34,210,192,.35);color:#BFF3EC;font:600 12px/1.3 Inter,sans-serif}',
      '.tmr-take-tag button{border:0;background:none;color:inherit;cursor:pointer;padding:0;font-size:13px;line-height:1;opacity:.7}',
      '.tmr-take-sport{border:1px solid rgba(147,169,192,.3);background:transparent;color:var(--tk-mut);border-radius:999px;padding:3px 9px;font:600 12px/1.3 Inter,sans-serif;cursor:pointer}',
      '.tmr-take-sport:hover{color:var(--tk-ink);border-color:var(--tk-brand-lt)}',
      '.tmr-take-meta{color:var(--tk-mut);font:12px/1.3 Inter,sans-serif}',
      '.tmr-take-meta.is-over{color:#FF8A80}',
      '.tmr-take-msg{font:13px/1.4 Inter,sans-serif;margin-top:8px}',
      '.tmr-take-msg.is-err{color:#FF8A80}',
      '.tmr-take-msg.is-ok{color:#8BE9C8}',
      '.tmr-take-msg a{color:var(--tk-brand-lt);font-weight:700}',
      '.tmr-take-x{border:0;background:none;color:var(--tk-mut);font-size:20px;line-height:1;cursor:pointer;padding:2px 4px}',
      '.tmr-take-x:hover{color:var(--tk-ink)}',
      /* Homepage dock: fixed, so it never moves the locked hero geometry. */
      '.tmr-take-dock{position:fixed;left:50%;bottom:16px;transform:translateX(-50%);width:min(760px,calc(100vw - 32px));z-index:900}',
      '.tmr-take-pill[hidden],.tmr-take-dock[hidden]{display:none}',
      '.tmr-take-pill{position:fixed;left:16px;bottom:16px;z-index:900;display:inline-flex;align-items:center;gap:8px;padding:11px 16px;border-radius:999px;border:1px solid rgba(34,210,192,.45);background:#0E1620;color:#EAF2FA;font:700 14px/1 "Barlow Condensed",Inter,sans-serif;letter-spacing:.08em;text-transform:uppercase;cursor:pointer;box-shadow:0 10px 30px rgba(0,0,0,.35)}',
      '.tmr-take-pill:hover{border-color:#22D2C0}',
      '.tmr-take-inline{margin:18px 0}',
      '.tmr-take-login{display:block;margin:18px 0;padding:14px 16px;border-radius:15px;border:1px dashed rgba(34,210,192,.45);background:rgba(14,22,32,.04);font:600 15px/1.4 Inter,sans-serif;color:inherit;text-decoration:none}',
      '.tmr-take-login b{color:#0C948C}',
      /* Clear the Live help bubble (bottom right) where the dock would reach it. */
      '@media (max-width:1100px){.tmr-take-dock{bottom:84px}}',
      '@media (max-width:600px){.tmr-take{padding:12px}.tmr-take-prompt{font-size:15px}.tmr-take-dock{bottom:80px;width:calc(100vw - 20px)}.tmr-take-post{padding:0 14px}}'
    ].join('');
    var s = el('style');
    s.id = 'tmr-take-css';
    s.textContent = css;
    document.head.appendChild(s);
  }

  /* ------------------------------------------------------------------ */
  /* Composer                                                           */
  /* ------------------------------------------------------------------ */

  var SPORTS = ['NFL', 'NCAAF', 'MLB', 'NBA', 'NHL', 'NCAAB', 'Soccer'];

  function build(ctx, opts) {
    ctx = ctx || {};
    opts = opts || {};
    injectStyles();
    var state = { ctx: ctx, sport: ctx.sport || null, dropped: {}, posting: false };

    var root = el('section', 'tmr-take' + (opts.className ? ' ' + opts.className : ''));
    root.setAttribute('aria-label', 'Share your sports take');

    var head = el('div', 'tmr-take-head');
    head.appendChild(el('div', 'tmr-take-kicker', '🔥 Share your sports take'));
    if (opts.onClose) {
      var x = el('button', 'tmr-take-x', '×');
      x.type = 'button';
      x.setAttribute('aria-label', 'Minimize');
      x.addEventListener('click', opts.onClose);
      head.appendChild(x);
    }
    root.appendChild(head);

    var prompt = el('div', 'tmr-take-prompt', promptFor(ctx));
    root.appendChild(prompt);

    var row = el('div', 'tmr-take-row');
    var input = el('textarea', 'tmr-take-input');
    input.rows = 1;
    input.maxLength = MAX_LEN + 50;
    input.placeholder = ctx.placeholder || 'Type your take…';
    input.setAttribute('aria-label', prompt.textContent);
    var post = el('button', 'tmr-take-post', 'Post take');
    post.type = 'button';
    post.disabled = true;
    row.appendChild(input);
    row.appendChild(post);
    root.appendChild(row);

    var foot = el('div', 'tmr-take-foot');
    var tags = el('div', 'tmr-take-tags');
    var meta = el('div', 'tmr-take-meta', '');
    foot.appendChild(tags);
    foot.appendChild(meta);
    root.appendChild(foot);

    var msg = el('div', 'tmr-take-msg');
    msg.hidden = true;
    root.appendChild(msg);

    function renderTags() {
      tags.textContent = '';
      var c = state.ctx;
      var list = [];
      if (state.sport && !state.dropped.sport) list.push(['sport', state.sport]);
      if (c.team && !state.dropped.team) list.push(['team', c.team]);
      if (c.label && !state.dropped.label) list.push(['label', c.label]);
      list.forEach(function (t) {
        var chip = el('span', 'tmr-take-tag', t[1]);
        var rm = el('button', null, '×');
        rm.type = 'button';
        rm.setAttribute('aria-label', 'Remove tag ' + t[1]);
        rm.addEventListener('click', function () {
          if (t[0] === 'sport' && !c.sport) state.sport = null; else state.dropped[t[0]] = true;
          renderTags();
        });
        chip.appendChild(rm);
        tags.appendChild(chip);
      });
      /* No context from the page: offer one-tap optional sport tags once the
         member starts typing. Never required. */
      if (!list.length && input.value.trim()) {
        SPORTS.forEach(function (sp) {
          var b = el('button', 'tmr-take-sport', sp);
          b.type = 'button';
          b.addEventListener('click', function () { state.sport = sp; state.dropped.sport = false; renderTags(); });
          tags.appendChild(b);
        });
      }
    }

    function sync() {
      var len = input.value.trim().length;
      post.disabled = state.posting || len === 0 || len > MAX_LEN;
      meta.textContent = len ? len + ' / ' + MAX_LEN : '';
      meta.className = 'tmr-take-meta' + (len > MAX_LEN ? ' is-over' : '');
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight + 2, 140) + 'px';
      if (!tags.childNodes.length || (!state.sport && !state.ctx.team && !state.ctx.label)) renderTags();
    }

    function show(kind, nodes) {
      msg.hidden = false;
      msg.className = 'tmr-take-msg ' + (kind === 'ok' ? 'is-ok' : 'is-err');
      msg.textContent = '';
      nodes.forEach(function (n) { msg.appendChild(typeof n === 'string' ? document.createTextNode(n) : n); });
    }

    function link(text, href) { var a = el('a', null, text); a.href = href; return a; }

    function submit() {
      var content = input.value.trim();
      if (!content || content.length > MAX_LEN || state.posting) return;
      var S = window.TMRSession;
      if (!S || !S.authFetch) { show('err', ['Could not reach your session. ', link('Log in', '/login/?next=' + encodeURIComponent(location.pathname + location.search))]); return; }
      state.posting = true;
      post.textContent = 'Posting…';
      sync();
      var c = state.ctx;
      var body = { content: content, post_type: 'hot_take' };
      if (state.sport && !state.dropped.sport) body.sport = state.sport;
      if (c.source) body.context_source = c.source;
      if (c.team && !state.dropped.team) body.context_team = c.team;
      if (c.label && !state.dropped.label) body.context_label = c.label;
      if (c.game_id && !state.dropped.label) body.context_game_id = c.game_id;
      if (c.url && !state.dropped.label) body.context_url = c.url;

      S.authFetch(apiBase() + '/feed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body)
      }).then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (d) { return { r: r, d: d }; });
      }).then(function (res) {
        state.posting = false;
        post.textContent = 'Post take';
        if (res.r.status === 401 || res.r.status === 403) {
          show('err', ['Your session expired. ', link('Log in again', '/login/?next=' + encodeURIComponent(location.pathname + location.search)), ' and your take is still here.']);
          sync();
          return;
        }
        if (!res.r.ok) {
          var e = (res.d && (res.d.error || (res.d.errors && res.d.errors[0] && res.d.errors[0].msg))) || 'Could not post your take. Try again.';
          show('err', [String(e)]);
          sync();
          return;
        }
        var id = res.d && res.d.post && res.d.post.id;
        input.value = '';
        show('ok', ['Posted. Your take is live in the ', link('Community Feed', '/feed/' + (id ? '?post=' + encodeURIComponent(id) : '')), '.']);
        try { document.dispatchEvent(new CustomEvent('tmr:take-posted', { detail: { post: res.d.post, context: c } })); } catch (err) { }
        prompt.textContent = promptFor(c.kind && c.kind !== 'general' ? c : {});
        sync();
        if (opts.onPosted) opts.onPosted(res.d.post);
      }, function () {
        state.posting = false;
        post.textContent = 'Post take';
        show('err', ['Network error. Your take was not posted; it is still in the box.']);
        sync();
      });
    }

    input.addEventListener('input', function () { if (!msg.hidden && msg.className.indexOf('is-ok') > -1) msg.hidden = true; sync(); });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); submit(); }
    });
    post.addEventListener('click', submit);
    renderTags();

    return {
      root: root,
      input: input,
      setContext: function (next) {
        state.ctx = next || {};
        state.sport = state.ctx.sport || null;
        state.dropped = {};
        prompt.textContent = promptFor(state.ctx);
        input.setAttribute('aria-label', prompt.textContent);
        renderTags();
      }
    };
  }

  function loginCta(ctx) {
    injectStyles();
    var a = el('a', 'tmr-take-login');
    a.href = '/login/?next=' + encodeURIComponent(location.pathname + location.search);
    a.appendChild(document.createTextNode(promptFor(ctx) + ' '));
    a.appendChild(el('b', null, 'Log in to share your take →'));
    return a;
  }

  /* ------------------------------------------------------------------ */
  /* Surfaces                                                           */
  /* ------------------------------------------------------------------ */

  function mount(host, ctx, opts) {
    if (!host) return null;
    if (!currentUser()) {
      if (opts && opts.loginCta) { host.textContent = ''; host.appendChild(loginCta(ctx)); }
      return null;
    }
    var c = build(ctx, opts);
    host.textContent = '';
    host.appendChild(c.root);
    return c;
  }

  function dock() {
    if (!currentUser() || document.querySelector('.tmr-take-dock, .tmr-take-pill')) return;
    injectStyles();
    var pill = el('button', 'tmr-take-pill', '🔥 Share your take');
    pill.type = 'button';
    var box = el('div', 'tmr-take-dock');
    var composer = build({ source: 'homepage', kind: 'general' }, {
      onClose: function () { ssSet(SS_MIN, '1'); box.hidden = true; pill.hidden = false; },
      onPosted: function () {
        setTimeout(function () { if (!composer.input.value) { box.hidden = true; pill.hidden = false; } }, 6000);
      }
    });
    box.appendChild(composer.root);
    pill.addEventListener('click', function () {
      ssSet(SS_MIN, '');
      pill.hidden = true;
      box.hidden = false;
      composer.input.focus();
    });
    var minimized = ssGet(SS_MIN) === '1';
    box.hidden = minimized;
    pill.hidden = !minimized;
    document.body.appendChild(box);
    document.body.appendChild(pill);
  }

  /* Simulator hook: every simulator announces its result with the same event. */
  var simComposer = null;
  var simHost = null;
  document.addEventListener('tmr:sim-result', function (e) {
    var d = (e && e.detail) || {};
    if (!d.away || !d.home) return;
    var awayWp = Number(d.away_wp), homeWp = Number(d.home_wp);
    var homeFav = !(awayWp > homeWp);
    var fav = homeFav ? d.home : d.away;
    var sport = d.sport ? String(d.sport).toUpperCase() : null;
    var ctx = {
      source: 'simulator',
      kind: 'sim',
      sport: sport,
      label: (d.away.abbr || d.away.name) + ' @ ' + (d.home.abbr || d.home.name) + ' simulation',
      url: (location.pathname + location.search).slice(0, 300),
      game_id: d.game_id || null,
      winner: fav.name || fav.abbr,
      winner_wp: homeFav ? homeWp : awayWp,
      simulations: d.simulations || null
    };
    var anchor = d.anchor && d.anchor.parentNode ? d.anchor : null;
    if (!simHost || !document.body.contains(simHost)) {
      simHost = el('div', 'tmr-take-inline');
      simHost.setAttribute('data-tmr-take', 'sim');
      simComposer = null;
    }
    if (anchor && simHost.previousSibling !== anchor) anchor.parentNode.insertBefore(simHost, anchor.nextSibling);
    if (!simHost.parentNode) return;
    if (simComposer) { simComposer.setContext(ctx); return; }
    simComposer = mount(simHost, ctx, { loginCta: true });
  });

  window.TMRTake = { mount: mount, dock: dock, promptFor: promptFor, currentUser: currentUser };

  /* <script src="tmr-take.js" data-dock="1"> turns the homepage dock on. */
  var me = document.currentScript;
  if (me && me.getAttribute('data-dock') === '1') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', dock);
    else dock();
  }
})(window, document);
