/*
 * LIVE_CHAT_20260901: the site live chat widget.
 *
 * A launcher in the bottom right, a panel above it, and a poll that keeps the
 * thread current so a reply typed by a person lands without a refresh. Every
 * style is scoped under .tmr-lc and set on a shadow-free island with its own
 * variables, so a page theme cannot bleed into it and it cannot bleed out.
 *
 * The conversation id is the only credential. It lives in localStorage, not
 * sessionStorage: a visitor who opens a second tab is still the same person
 * with the same question, and a fresh empty thread per tab made one person
 * show up in the queue five times over.
 */
(function () {
  'use strict';

  if (window.__tmrLiveChatLoaded) return;
  window.__tmrLiveChatLoaded = true;

  var STORAGE_KEY = 'tmr_live_chat_conversation';
  var POLL_IDLE_MS = 12000;
  var POLL_WAITING_MS = 4000;

  function apiBase() {
    try {
      if (window.CONFIG && window.CONFIG.api && window.CONFIG.api.baseUrl) {
        return window.CONFIG.api.baseUrl.replace(/\/+$/, '');
      }
    } catch (err) { /* config.js may not be on this page */ }
    return 'https://trustmyrecord-api.onrender.com/api';
  }

  function authToken() {
    try {
      return localStorage.getItem('trustmyrecord_token') || localStorage.getItem('tmr_token') || null;
    } catch (err) {
      return null;
    }
  }

  function request(path, options) {
    var opts = options || {};
    var headers = { 'Content-Type': 'application/json' };
    var token = authToken();
    if (token) headers.Authorization = 'Bearer ' + token;
    return fetch(apiBase() + '/live-chat' + path, {
      method: opts.method || 'GET',
      headers: headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    }).then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok) throw new Error(data && data.error ? data.error : 'Request failed');
        return data;
      });
    });
  }

  // A headset support agent, drawn inline so the launcher never waits on a
  // network request and cannot break if an asset path moves.
  var AGENT_ICON = [
    '<svg viewBox="0 0 24 24" fill="none" stroke="#06210f" stroke-width="2"',
    ' stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">',
    '<path d="M4 13a8 8 0 0 1 16 0"></path>',
    '<path d="M4 14v3a2 2 0 0 0 2 2h1v-5H6a2 2 0 0 0-2 2z"></path>',
    '<path d="M20 14v3a2 2 0 0 1-2 2h-1v-5h1a2 2 0 0 1 2 2z"></path>',
    '<path d="M17 19v1a2 2 0 0 1-2 2h-3"></path>',
    '</svg>',
  ].join('');

  var STYLES = [
    '.tmr-lc, .tmr-lc * { box-sizing: border-box; }',
    '.tmr-lc {',
    '  --lc-surface: #14161c; --lc-raised: #1d2129; --lc-ink: #f2f4f8;',
    '  --lc-muted: #9aa4b5; --lc-line: #2b313c; --lc-accent: #29c467;',
    '  --lc-visitor: #2a4f8f; position: fixed; right: 20px; bottom: 20px;',
    '  z-index: 2147483000; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;',
    '}',
    // The launcher is the familiar support-agent bubble: a round avatar with an
    // online dot, and the label beside it so it reads as help, not decoration.
    // At rest it is just the round agent bubble, because a fixed corner widget
    // sits on top of whatever the page put there. The label rides out on hover,
    // on keyboard focus, and once on arrival so people see what it is.
    '.tmr-lc-launcher {',
    '  display: flex; align-items: center; gap: 0; cursor: pointer;',
    '  background: var(--lc-raised); color: var(--lc-ink); font-weight: 700; font-size: 15px;',
    '  padding: 6px; border-radius: 999px; box-shadow: 0 10px 28px rgba(0,0,0,.4);',
    '  border: 1px solid var(--lc-line);',
    '}',
    '.tmr-lc-launcher:hover { filter: brightness(1.12); }',
    '.tmr-lc-label {',
    '  max-width: 0; overflow: hidden; white-space: nowrap; opacity: 0;',
    '  transition: max-width .22s ease, opacity .18s ease, margin .22s ease;',
    '}',
    '.tmr-lc-launcher:hover .tmr-lc-label,',
    '.tmr-lc-launcher:focus-visible .tmr-lc-label,',
    '.tmr-lc-launcher.is-wide .tmr-lc-label {',
    '  max-width: 190px; opacity: 1; margin: 0 14px 0 10px;',
    '}',
    '.tmr-lc-avatar {',
    '  position: relative; flex: 0 0 auto; width: 44px; height: 44px; border-radius: 50%;',
    '  background: var(--lc-accent); display: flex; align-items: center; justify-content: center;',
    '}',
    '.tmr-lc-avatar svg { width: 26px; height: 26px; display: block; }',
    '.tmr-lc-avatar.sm { width: 34px; height: 34px; }',
    '.tmr-lc-avatar.sm svg { width: 20px; height: 20px; }',
    '.tmr-lc-dot {',
    '  position: absolute; right: -1px; bottom: -1px; width: 12px; height: 12px;',
    '  border-radius: 50%; background: #35d07f; border: 2px solid var(--lc-raised);',
    '}',
    '.tmr-lc-label > span { display: flex; flex-direction: column; align-items: flex-start; line-height: 1.25; }',
    '.tmr-lc-label small { font-size: 11px; font-weight: 600; color: var(--lc-muted); }',
    '.tmr-lc-panel {',
    '  display: none; flex-direction: column; width: 360px; max-width: calc(100vw - 32px);',
    '  height: 520px; max-height: calc(100vh - 120px); background: var(--lc-surface);',
    '  color: var(--lc-ink); border: 1px solid var(--lc-line); border-radius: 14px;',
    '  overflow: hidden; box-shadow: 0 18px 48px rgba(0,0,0,.45);',
    '}',
    '.tmr-lc.is-open .tmr-lc-panel { display: flex; }',
    '.tmr-lc.is-open .tmr-lc-launcher { display: none; }',
    '.tmr-lc-head { display: flex; align-items: center; justify-content: space-between; padding: 14px 16px; border-bottom: 1px solid var(--lc-line); background: var(--lc-raised); }',
    '.tmr-lc-title { font-size: 15px; font-weight: 700; margin: 0; }',
    '.tmr-lc-sub { font-size: 12px; color: var(--lc-muted); margin: 2px 0 0; }',
    '.tmr-lc-close { background: none; border: 0; color: var(--lc-muted); font-size: 22px; line-height: 1; cursor: pointer; padding: 0 4px; }',
    '.tmr-lc-close:hover { color: var(--lc-ink); }',
    '.tmr-lc-log { flex: 1; overflow-y: auto; padding: 14px 16px; display: flex; flex-direction: column; gap: 10px; }',
    '.tmr-lc-msg { max-width: 84%; padding: 10px 12px; border-radius: 12px; font-size: 14px; line-height: 1.45; white-space: pre-wrap; word-wrap: break-word; }',
    '.tmr-lc-msg.claude, .tmr-lc-msg.human { align-self: flex-start; background: var(--lc-raised); border: 1px solid var(--lc-line); }',
    '.tmr-lc-msg.visitor { align-self: flex-end; background: var(--lc-visitor); }',
    '.tmr-lc-who { display: block; font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: var(--lc-muted); margin-bottom: 4px; }',
    '.tmr-lc-typing { align-self: flex-start; color: var(--lc-muted); font-size: 13px; padding: 4px 2px; }',
    '.tmr-lc-form { display: flex; gap: 8px; padding: 12px; border-top: 1px solid var(--lc-line); background: var(--lc-raised); }',
    '.tmr-lc-input { flex: 1; resize: none; height: 42px; max-height: 120px; padding: 11px 12px; border-radius: 10px; border: 1px solid var(--lc-line); background: var(--lc-surface); color: var(--lc-ink); font: inherit; font-size: 14px; }',
    '.tmr-lc-input:focus { outline: none; border-color: var(--lc-accent); }',
    '.tmr-lc-send { border: 0; border-radius: 10px; padding: 0 16px; background: var(--lc-accent); color: #06210f; font-weight: 700; cursor: pointer; }',
    '.tmr-lc-send[disabled] { opacity: .5; cursor: default; }',
    '.tmr-lc-note { padding: 0 16px 10px; font-size: 12px; color: var(--lc-muted); }',
    '@media (max-width: 480px) { .tmr-lc-launcher.is-wide .tmr-lc-label { max-width: 0; opacity: 0; margin: 0; } .tmr-lc { right: 12px; bottom: 12px; } .tmr-lc-panel { height: calc(100vh - 96px); } }',
  ].join('\n');

  var state = {
    conversationId: null,
    lastMessageId: 0,
    open: false,
    sending: false,
    waitingForHuman: false,
    pollTimer: null,
    seen: {},
  };

  var el = {};

  function mount() {
    var style = document.createElement('style');
    style.setAttribute('data-tmr-live-chat', '1');
    style.textContent = STYLES;
    document.head.appendChild(style);

    var root = document.createElement('div');
    root.className = 'tmr-lc';
    root.innerHTML = [
      '<button class="tmr-lc-launcher" type="button" aria-label="Open live help">',
      '  <span class="tmr-lc-avatar">' + AGENT_ICON + '<span class="tmr-lc-dot"></span></span>',
      '  <span class="tmr-lc-label"><span>Live help<small>Claude, TMR AI agent</small></span></span>',
      '</button>',
      '<div class="tmr-lc-panel" role="dialog" aria-label="Live chat">',
      '  <div class="tmr-lc-head">',
      '    <div style="display:flex;align-items:center;gap:10px">',
      '      <span class="tmr-lc-avatar sm">' + AGENT_ICON + '<span class="tmr-lc-dot"></span></span>',
      '      <span>',
      '        <p class="tmr-lc-title">Live help</p>',
      '        <p class="tmr-lc-sub">Claude, TMR live AI agent</p>',
      '      </span>',
      '    </div>',
      '    <button class="tmr-lc-close" type="button" aria-label="Close live chat">&times;</button>',
      '  </div>',
      '  <div class="tmr-lc-log"></div>',
      '  <p class="tmr-lc-note"></p>',
      '  <form class="tmr-lc-form">',
      '    <textarea class="tmr-lc-input" rows="1" placeholder="Ask anything about the site" maxlength="4000"></textarea>',
      '    <button class="tmr-lc-send" type="submit">Send</button>',
      '  </form>',
      '</div>',
    ].join('');
    document.body.appendChild(root);

    el.root = root;
    el.launcher = root.querySelector('.tmr-lc-launcher');
    el.panel = root.querySelector('.tmr-lc-panel');
    el.close = root.querySelector('.tmr-lc-close');
    el.log = root.querySelector('.tmr-lc-log');
    el.note = root.querySelector('.tmr-lc-note');
    el.form = root.querySelector('.tmr-lc-form');
    el.input = root.querySelector('.tmr-lc-input');
    el.send = root.querySelector('.tmr-lc-send');

    // Say what it is on arrival, then get out of the way. From then on the
    // label is a hover affordance and the footprint is the bubble alone.
    el.launcher.classList.add('is-wide');
    setTimeout(function () { el.launcher.classList.remove('is-wide'); }, 6000);

    el.launcher.addEventListener('click', open);
    el.close.addEventListener('click', close);
    el.form.addEventListener('submit', onSubmit);
    el.input.addEventListener('keydown', function (event) {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        onSubmit(event);
      }
    });
  }

  function label(role) {
    if (role === 'visitor') return 'You';
    if (role === 'human') return 'TrustMyRecord team';
    return 'Claude';
  }

  function render(messages) {
    var added = false;
    (messages || []).forEach(function (message) {
      if (!message || state.seen[message.id]) return;
      state.seen[message.id] = true;
      if (message.id > state.lastMessageId) state.lastMessageId = message.id;

      var node = document.createElement('div');
      node.className = 'tmr-lc-msg ' + message.role;
      var who = document.createElement('span');
      who.className = 'tmr-lc-who';
      who.textContent = label(message.role);
      var body = document.createElement('span');
      body.textContent = message.body;
      node.appendChild(who);
      node.appendChild(body);
      el.log.appendChild(node);
      added = true;
    });
    if (added) el.log.scrollTop = el.log.scrollHeight;
  }

  function setTyping(on) {
    var existing = el.log.querySelector('.tmr-lc-typing');
    if (on && !existing) {
      var node = document.createElement('div');
      node.className = 'tmr-lc-typing';
      node.textContent = 'Claude is typing';
      el.log.appendChild(node);
      el.log.scrollTop = el.log.scrollHeight;
    } else if (!on && existing) {
      existing.remove();
    }
  }

  function setNote(text) {
    el.note.textContent = text || '';
  }

  function open() {
    state.open = true;
    el.root.classList.add('is-open');
    ensureConversation().then(function () {
      el.input.focus();
      schedulePoll();
    });
  }

  function close() {
    state.open = false;
    el.root.classList.remove('is-open');
    if (state.pollTimer) {
      clearTimeout(state.pollTimer);
      state.pollTimer = null;
    }
  }

  function ensureConversation() {
    if (state.conversationId) return Promise.resolve();

    var stored = null;
    try { stored = localStorage.getItem(STORAGE_KEY); } catch (err) { stored = null; }
    if (stored) {
      state.conversationId = stored;
      return request('/' + encodeURIComponent(stored) + '/messages?after=0')
        .then(function (data) {
          state.waitingForHuman = Boolean(data.human_takeover);
          render(data.messages);
        })
        .catch(function () {
          // The stored thread is gone. Start clean rather than stranding them.
          state.conversationId = null;
          try { localStorage.removeItem(STORAGE_KEY); } catch (err) { /* private mode */ }
          return ensureConversation();
        });
    }

    return request('/start', { method: 'POST', body: { page_url: window.location.href } })
      .then(function (data) {
        state.conversationId = data.conversation_id;
        try { localStorage.setItem(STORAGE_KEY, data.conversation_id); } catch (err) { /* private mode */ }
        render(data.messages);
      })
      .catch(function (error) {
        setNote('The chat is not reachable right now. ' + error.message);
      });
  }

  function onSubmit(event) {
    if (event && event.preventDefault) event.preventDefault();
    var body = el.input.value.trim();
    if (!body || state.sending) return;

    state.sending = true;
    el.send.disabled = true;
    el.input.value = '';
    setNote('');

    ensureConversation()
      .then(function () {
        if (!state.conversationId) throw new Error('No conversation');
        setTyping(true);
        return request('/' + encodeURIComponent(state.conversationId) + '/message', {
          method: 'POST',
          body: { body: body },
        });
      })
      .then(function (data) {
        setTyping(false);
        render(data.messages);
        if (data.queued) {
          // Claude is answering from the operator side rather than inside the
          // request. Poll fast so the reply appears the moment it is written.
          state.waitingForHuman = true;
          setNote('I am on this one. The answer lands in this chat, keep the tab open.');
        } else if (data.pending_human) {
          state.waitingForHuman = true;
          setNote('Someone on the team is on this thread. Their reply lands here.');
        } else if (data.escalated) {
          state.waitingForHuman = true;
          setNote('This one is with a person now. Keep this tab open and the reply lands here.');
        }
        schedulePoll();
      })
      .catch(function (error) {
        setTyping(false);
        setNote(error.message);
      })
      .then(function () {
        state.sending = false;
        el.send.disabled = false;
        if (state.open) el.input.focus();
      });
  }

  function schedulePoll() {
    if (state.pollTimer) clearTimeout(state.pollTimer);
    if (!state.open || !state.conversationId) return;
    var delay = state.waitingForHuman ? POLL_WAITING_MS : POLL_IDLE_MS;
    state.pollTimer = setTimeout(poll, delay);
  }

  function poll() {
    if (!state.open || !state.conversationId) return;
    request('/' + encodeURIComponent(state.conversationId) + '/messages?after=' + state.lastMessageId)
      .then(function (data) {
        // A queued thread is waiting on a reply just as much as a human-owned
        // one, so it keeps the fast cadence until the answer arrives.
        state.waitingForHuman = Boolean(data.human_takeover) || data.status === 'queued';
        render(data.messages);
      })
      .catch(function () { /* a poll that fails just tries again */ })
      .then(schedulePoll);
  }

  function boot() {
    // Never mount on the admin console: staff answer from their own inbox.
    if (/^\/admin(\/|$)/.test(window.location.pathname)) return;
    mount();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
