/* TMR Find Handicappers "Electric" redesign, approved Option 1 "Trading desk".
   Presentation-only enhancer: reads values already rendered on the page and adds
   icons, category headline numbers, verified marks, rank medals, activity dots,
   streak pills and win % meters. It never fetches, never computes new statistics,
   and never changes ranking, sorting, filtering or any data binding. */
(function () {
  'use strict';

  function SVG(d) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>'; }
  var ICONS = {
    members: SVG('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>'),
    makers: SVG('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>'),
    verified: SVG('<path d="M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5Z"/><path d="m9 12 2 2 4-4"/>'),
    active: SVG('<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>'),
    graded: SVG('<path d="M3 3v18h18"/><path d="m7 15 4-4 3 3 6-6"/>'),
    units: SVG('<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>'),
    roi: SVG('<path d="m23 6-9.5 9.5-5-5L1 18"/><path d="M17 6h6v6"/>'),
    win: SVG('<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>'),
    streak: SVG('<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>'),
    hot: SVG('<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>')
  };
  var FLAME = '<svg class="x-flame" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M13.5 1.5s1 3.2-1.3 6.1C10.5 9.8 8 11 8 14.6A4.9 4.9 0 0 0 12.9 19.5c3 0 5.1-2.3 5.1-5.6 0-4.4-4.5-6.6-4.5-12.4zM9.6 4.4C6.9 6.9 4 10 4 14.5 4 18.9 7.6 22.5 12 22.5c-2.7-.9-4.6-3.4-4.6-6.4 0-2.9 1.6-4.7 2.6-6.1-.6-1.6-.8-3.6-.4-5.6z"/></svg>';
  var CHECK = '<svg class="x-verified" viewBox="0 0 24 24" role="img" aria-label="Verified: 25+ graded picks"><path fill="currentColor" d="M12 1.5l2.6 1.9 3.2-.2 1 3.1 2.6 1.9-1 3.1 1 3.1-2.6 1.9-1 3.1-3.2-.2L12 22.5l-2.6-1.9-3.2.2-1-3.1-2.6-1.9 1-3.1-1-3.1 2.6-1.9 1-3.1 3.2.2z"/><path d="m8 12.2 2.7 2.7L16.2 9.4" fill="none" stroke="#04101f" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var METRIC_ICONS = { hmTotalMembers: 'members', hmPickMakers: 'makers', hmVerifiedCount: 'verified', hmActiveWeek: 'active', hmTotalPicks: 'graded' };
  var VERIFIED_MIN = 25; // same threshold as TIER_VERIFIED_MIN on the page
  var SORT_LABEL = { record: 'Record', units: 'Units', roi: 'ROI', winRate: 'Win %', totalPicks: 'Total picks', streak: 'Current streak', active: 'Last active' };

  function graded(txt) {
    var p = String(txt || '').trim().split('-').map(Number);
    if (p.length < 2 || p.some(isNaN)) return null;
    return p[0] + p[1] + (p[2] || 0);
  }
  function num(txt) { var n = parseFloat(String(txt || '').replace(/[^0-9.+-]/g, '')); return isFinite(n) ? n : null; }

  function decorateMetrics() {
    Object.keys(METRIC_ICONS).forEach(function (id) {
      var el = document.getElementById(id);
      var card = el && el.closest('.hm-metric');
      if (!card || card.querySelector('.x-ico')) return;
      var ico = document.createElement('i');
      ico.className = 'x-ico';
      ico.innerHTML = ICONS[METRIC_ICONS[id]];
      card.insertBefore(ico, card.firstChild);
    });
  }

  var CAT = [
    { re: /units leader/i, key: 'units', stat: 'Units', label: 'Units won' },
    { re: /best roi/i, key: 'roi', stat: 'ROI', label: 'Return on investment' },
    { re: /best win/i, key: 'win', stat: null, label: 'Win rate' },
    { re: /most graded/i, key: 'graded', stat: 'Graded', label: 'Graded picks' },
    { re: /streak/i, key: 'streak', stat: 'Streak', label: 'Current streak' },
    { re: /30 days/i, key: 'hot', stat: 'Units 30D', label: 'Units, last 30 days' }
  ];
  function statCell(card, label) {
    var cells = card.querySelectorAll('.hm-feat-stat');
    for (var i = 0; i < cells.length; i++) {
      var s = cells[i].querySelector('span');
      if (s && s.textContent.trim().toLowerCase() === label.toLowerCase()) return cells[i].querySelector('strong');
    }
    return null;
  }
  function decorateFeatured() {
    document.querySelectorAll('#hmFeaturedLeaders .hm-feat-card').forEach(function (card) {
      var catEl = card.querySelector('.hm-feat-cat');
      var def = catEl && CAT.filter(function (c) { return c.re.test(catEl.textContent); })[0];
      if (!def) return;
      if (!card.hasAttribute('data-x')) {
        card.setAttribute('data-x', '1');
        card.classList.add('x-cat-' + def.key, /^(units|roi|win)$/.test(def.key) ? 'x-podium' : 'x-minor');
        var badge = document.createElement('i');
        badge.className = 'x-badge';
        badge.innerHTML = ICONS[def.key];
        catEl.insertBefore(badge, catEl.firstChild);
        var rec = statCell(card, 'Record');
        var gc = statCell(card, 'Graded');
        var g = gc ? num(gc.textContent) : (rec ? graded(rec.textContent) : null);
        var a = card.querySelector('.hm-feat-id a');
        if (a && g >= VERIFIED_MIN) a.insertAdjacentHTML('beforeend', CHECK);
      }
      if (card.querySelector('.x-headline')) return;
      var value = null, cls = '';
      if (def.stat) {
        var s = statCell(card, def.stat);
        if (s) { value = s.textContent.trim(); cls = s.className; }
      } else {
        // Win %: the exact figure this member's leaderboard row already shows.
        var handle = card.querySelector('.hm-feat-id span');
        var uname = handle ? handle.textContent.replace(/^@/, '').trim().replace(/"/g, '') : '';
        var cell = uname && document.querySelector('.hm-member-row[data-username="' + uname + '"] [data-label="Win %"]');
        if (cell) value = (cell.firstChild && cell.firstChild.nodeType === 3 ? cell.firstChild.nodeValue : cell.textContent).trim();
      }
      if (!value) return;
      var h = document.createElement('div');
      h.className = 'x-headline';
      h.innerHTML = '<b></b><span></span>';
      h.querySelector('b').className = cls;
      h.querySelector('b').textContent = value;
      h.querySelector('span').textContent = def.label;
      card.querySelector('.hm-feat-user').insertAdjacentElement('afterend', h);
    });
  }

  function activity(txt) {
    var t = String(txt || '').toLowerCase();
    if (/active today|today/.test(t)) return 'live';
    if (/yesterday|1 day ago/.test(t)) return 'recent';
    var m = t.match(/(\d+)\s+days?\s+ago/);
    return m && Number(m[1]) <= 7 ? 'recent' : '';
  }

  function decorateRows() {
    var rows = document.querySelectorAll('#hmRows .hm-member-row');
    var best = { Units: null, ROI: null };
    rows.forEach(function (r) {
      if ((r.getAttribute('data-official-rank') || 'NR') === 'NR') return;
      ['Units', 'ROI'].forEach(function (k) {
        var c = r.querySelector('[data-label="' + k + '"]');
        var v = c && num(c.firstChild && c.firstChild.nodeType === 3 ? c.firstChild.nodeValue : c.textContent);
        if (v != null && v > 0 && (!best[k] || v > best[k].v)) best[k] = { v: v, cell: c };
      });
    });
    var sortBtn = document.querySelector('.hm-head .hm-sort[aria-sort="ascending"], .hm-head .hm-sort[aria-sort="descending"]');
    var sortLabel = sortBtn ? SORT_LABEL[sortBtn.getAttribute('data-sort')] : null;
    rows.forEach(function (r) {
      var rank = (r.getAttribute('data-official-rank') || '').replace('#', '');
      ['1', '2', '3'].forEach(function (n) { r.classList.toggle('x-medal-' + n, rank === n); });
      r.classList.toggle('x-medal', rank === '1' || rank === '2' || rank === '3');

      var act = r.querySelector('[data-label="Last active"]');
      var a = act ? activity(act.textContent) : '';
      r.classList.toggle('x-live', a === 'live');
      r.classList.toggle('x-recent', a === 'recent');

      r.querySelectorAll('.hm-stat').forEach(function (c) { c.classList.toggle('x-sorted', !!sortLabel && c.getAttribute('data-label') === sortLabel); });

      if (r.hasAttribute('data-x')) return; // per-render, one-time markup below
      r.setAttribute('data-x', '1');

      ['Units', 'ROI'].forEach(function (k) {
        var c = r.querySelector('[data-label="' + k + '"]');
        if (!c) return;
        if (c.classList.contains('is-positive')) c.insertAdjacentHTML('afterbegin', '<i class="x-dir" aria-hidden="true">▲</i>');
        else if (c.classList.contains('is-negative')) c.insertAdjacentHTML('afterbegin', '<i class="x-dir" aria-hidden="true">▼</i>');
      });

      var wp = r.querySelector('[data-label="Win %"]');
      var w = wp && num(wp.textContent);
      if (wp && w != null) wp.insertAdjacentHTML('beforeend', '<span class="x-meter" aria-hidden="true"><i style="width:' + Math.max(0, Math.min(100, w)) + '%"></i></span>');

      var st = r.querySelector('[data-label="Current streak"]');
      var m = st && st.textContent.trim().match(/^([WL])(\d+)$/i);
      if (st && m) {
        var win = m[1].toUpperCase() === 'W', n = Number(m[2]);
        st.classList.add(win ? 'x-w' : 'x-l');
        if (win && n >= 3) st.classList.add('x-hot');
        st.innerHTML = '<span class="x-pill">' + (win && n >= 3 ? FLAME : '') + st.textContent.trim() + '</span>';
      }

      var rec = r.querySelector('[data-label="Record"]');
      var g = rec && graded(rec.textContent);
      var name = r.querySelector('.hm-profile-name');
      if (name && g >= VERIFIED_MIN && !name.querySelector('.x-verified')) name.insertAdjacentHTML('beforeend', CHECK);
    });
    document.querySelectorAll('#hmRows .x-lead').forEach(function (t) { t.remove(); });
    ['Units', 'ROI'].forEach(function (k) {
      if (best[k]) best[k].cell.insertAdjacentHTML('beforeend', '<i class="x-lead" title="Highest ' + k + ' among ranked handicappers on this board">TOP</i>');
    });
  }

  var queued = false;
  function run() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(function () { queued = false; decorateMetrics(); decorateRows(); decorateFeatured(); });
  }
  function boot() {
    run();
    ['hmFeaturedLeaders', 'hmRows'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) new MutationObserver(run).observe(el, { childList: true });
    });
    var head = document.querySelector('.hm-head');
    if (head) new MutationObserver(run).observe(head, { attributes: true, subtree: true, attributeFilter: ['aria-sort'] });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
