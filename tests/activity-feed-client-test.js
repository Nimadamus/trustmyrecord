#!/usr/bin/env node
/* =============================================================================
   LIVE ON TMR client - freshness + recency proof
   -----------------------------------------------------------------------------
   Boots the REAL static/js/tmr-activity-feed.js against a stub DOM, a stub
   clock and a stub API. No browser, no network, no database, safe in CI.

   It locks the two behaviours that were broken on 2026-09-08:

     1. An activity row can be REWRITTEN IN PLACE by the backend - a second
        graded pick folded into the standing row keeps its id, gets
        created_at = now() and is re-announced under that same id. The strip
        used to dedupe on id alone and threw the update away, so a line that
        had just changed kept showing its old sentence and its old age.
     2. The rotation loop used to cycle everything it had ever held, so a
        long-open homepage replayed yesterday on a five second timer while
        today sat in the same ring.

   Usage: node tests/activity-feed-client-test.js
   ============================================================================= */
'use strict';

const fs = require('fs');
const nodePath = require('path');
const path = nodePath.join(__dirname, '..', 'static', 'js', 'tmr-activity-feed.js');
let fail = 0;
const ok = (n, c, d) => { console.log((c ? '  ok   ' : '  FAIL ') + n + (c ? '' : ' :: ' + d)); if (!c) fail++; };

const timers = []; let clock = 0;
function el(tag) {
  const n = {
    tagName: tag, className: '', children: [], parentNode: null, style: {}, dataset: {},
    _text: '', hidden: false, classList: {
      _s: new Set(),
      add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); }, contains(c) { return this._s.has(c); },
    },
    appendChild(c) { c.parentNode = n; n.children.push(c); return c; },
    removeChild(c) { n.children = n.children.filter((x) => x !== c); c.parentNode = null; },
    addEventListener() {}, setAttribute() {},
    querySelector(sel) {
      const cls = sel.replace('.', '');
      for (const c of n.children) {
        if (String(c.className).split(' ').indexOf(cls) > -1) return c;
        const d = c.querySelector(sel); if (d) return d;
      }
      return null;
    },
    get textContent() { return n._text; },
    set textContent(v) { n._text = v; n.children = []; },
  };
  return n;
}
const slot = el('div'); slot.className = 'tkact-slot';
const root = el('div'); root.className = 'tkact'; root.appendChild(slot);
global.document = {
  hidden: false, readyState: 'complete',
  getElementById: (id) => (id === 'tmrActivity' ? root : null),
  createElement: el,
  _on: {},
  addEventListener(t, f) { (this._on[t] = this._on[t] || []).push(f); },
  fire(t) { (this._on[t] || []).forEach((f) => f()); },
};
global.window = {
  addEventListener() {}, matchMedia: () => ({ matches: false }),
  TMR_API_BASE: 'http://stub/api',
};
global.requestAnimationFrame = (f) => timers.push({ at: clock + 16, f, once: true });
global.setTimeout = (f, ms) => { const t = { at: clock + (ms || 0), f, once: true }; timers.push(t); return t; };
global.setInterval = (f, ms) => { const t = { at: clock + ms, f, every: ms }; timers.push(t); return t; };
global.clearInterval = (t) => { const i = timers.indexOf(t); if (i > -1) timers.splice(i, 1); };
global.clearTimeout = global.clearInterval;
global.requestIdleCallback = (f) => timers.push({ at: clock + 1, f, once: true });
const pending = [];
global.fetch = () => new Promise((res) => pending.push(res));
global.EventSource = function () { this.addEventListener = () => {}; this.close = () => {}; };
global.AbortSignal = { timeout: () => null };

function tick(ms) {
  const end = clock + ms;
  for (let guard = 0; guard < 20000; guard++) {
    const due = timers.filter((t) => t.at <= end).sort((a, b) => a.at - b.at)[0];
    if (!due) break;
    clock = due.at;
    if (due.once) timers.splice(timers.indexOf(due), 1); else due.at = clock + due.every;
    due.f();
  }
  clock = end;
}
const flush = () => new Promise((r) => setImmediate(r));

const NOW = Date.now();
const ago = (m) => new Date(NOW - m * 60000).toISOString();
const ev = (id, uid, type, text, mins, upd) => ({
  id, type, user: { id: uid, username: 'u' + uid }, text,
  created_at: ago(mins), updated_at: upd == null ? ago(mins) : ago(upd), href: '/x/',
});

(async () => {
  eval(fs.readFileSync(path, 'utf8'));
  tick(50); await flush();
  /* first backlog: one fresh event, one 12h old aggregated row, one from two days ago */
  const backlog = [ev(300, 1, 'picks_entered', '4 NFL picks', 20),
                   ev(291, 2, 'pick_graded', 'Lost 2 picks - 10u', 720),
                   ev(120, 3, 'contest_entered', 'Entered a contest', 2660)];
  pending.shift()({ ok: true, json: () => Promise.resolve({ events: backlog }) });
  await flush(); tick(100); await flush();
  const shown = () => { const i = slot.children[slot.children.length - 1]; const a = i && i.querySelector('.tkact-act'); return a ? a.textContent : null; };
  ok('first paint shows the newest event', shown() === '4 NFL picks', shown());

  /* the 12h row is REWRITTEN in place: same id, three more picks, created_at now */
  const rewritten = ev(291, 2, 'pick_graded', 'Lost 5 picks - 22u', 1);
  tick(5000); await flush();                 // rotate onto something else first
  const before = shown();
  /* deliver it the way the poll does */
  tick(300000); await flush();
  pending.shift()({ ok: true, json: () => Promise.resolve({ events: [rewritten, ev(300, 1, 'picks_entered', '4 NFL picks', 25)] }) });
  await flush(); tick(6000); await flush();
  const texts = [];
  for (let i = 0; i < 8; i++) { texts.push(shown()); tick(5000); }
  ok('the rewritten event is accepted, not dropped as a duplicate',
     texts.indexOf('Lost 5 picks - 22u') > -1, JSON.stringify(texts));
  ok('the superseded copy never comes back round',
     texts.indexOf('Lost 2 picks - 10u') === -1, JSON.stringify(texts));
  ok('the two day old event is not cycled while fresher ones are held',
     texts.indexOf('Entered a contest') === -1, JSON.stringify(texts));

  /* THE BACKGROUND TAB CASE. advance() refuses to paint while the tab is
     hidden, so a homepage opened in a BACKGROUND tab had its very first item
     refused outright, and the only thing left to retry was the five second
     rotation interval, which a hidden tab throttles to roughly once a minute.
     Switching to the tab therefore showed the labelled lane over an empty
     slot. Boot a second instance, hidden this time, and prove it paints the
     moment the tab comes forward rather than on some later tick. */
  slot.children.length = 0;
  root.classList._s.clear();
  document._on = {};
  timers.length = 0;
  pending.length = 0;
  window.__tmrActivityFeedBooted = false;
  document.hidden = true;
  eval(fs.readFileSync(path, 'utf8'));
  tick(50); await flush();
  pending.shift()({ ok: true, json: () => Promise.resolve({
    events: [ev(400, 9, 'picks_entered', '2 MLB picks', 3)] }) });
  await flush(); tick(100); await flush();
  ok('a hidden tab paints nothing', shown() === null, String(shown()));
  document.hidden = false;
  document.fire('visibilitychange');
  await flush(); tick(50); await flush();
  ok('coming back to the tab paints at once, without waiting for a rotation tick',
     shown() === '2 MLB picks', String(shown()));

  console.log(fail ? '\nFAILED (' + fail + ')' : '\nPASS');
  process.exit(fail ? 1 : 0);
})();
