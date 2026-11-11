/* HOME_HOLO_20261110: homepage standings table with sport filters, and the hero laptop's numbers.
   Reads the same public payload the live-competition card reads (/api/users/competition).
   Every figure shown is taken from that payload; win rate is wins / (wins + losses) from the
   record string in it. With no payload nothing here renders and the original card stays as it was. */
(function () {
  'use strict';
  var ORIGIN = 'https://api.trustmyrecord.com';
  var API = ORIGIN + '/api/users/competition';
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function record(meta) {
    var m = /(\d+)-(\d+)(?:-(\d+))?/.exec(String(meta || ''));
    if (!m) return null;
    var w = +m[1], l = +m[2];
    return { text: m[0], pct: (w + l) > 0 ? (100 * w / (w + l)).toFixed(1) + '%' : '' };
  }
  function safeHref(h) { return /^\/[^/]/.test(String(h || '')) ? h : '/handicappers/'; }
  function safeImg(u) { return /^https:\/\/(api\.)?trustmyrecord\.com\//.test(String(u || '')) ? u : ''; }

  function rowsHtml(view) {
    return (view.rows || []).slice(0, 3).map(function (r, i) {
      var c = r.competitor || {}, rec = record(r.meta), img = safeImg(c.avatar_url);
      var mark = esc((c.avatar && c.avatar.mark) || String(c.display_name || c.username || '?').slice(0, 2).toUpperCase());
      var neg = Number(r.value) < 0;
      return '<a class="hx-row' + (i === 0 ? ' r1' : '') + '" role="row" href="' + esc(safeHref(c.href)) + '">'
        + '<span class="hx-rk" role="cell">' + esc(r.rank != null ? r.rank : i + 1) + '</span>'
        + '<span class="hx-who" role="cell"><span class="hx-av">' + (img ? '<img src="' + esc(img) + '" alt="" loading="lazy" onerror="this.remove()">' : '') + '<i>' + mark + '</i></span><b>' + esc(c.display_name || c.username || '') + '</b></span>'
        + '<span class="hx-rec" role="cell">' + esc(rec ? rec.text : '') + '</span>'
        + '<span class="hx-pct" role="cell">' + esc(rec ? rec.pct : '') + '</span>'
        + '<span class="hx-val' + (neg ? ' neg' : '') + '" role="cell">' + esc(r.value_text || '') + '</span></a>';
    }).join('');
  }

  /* Reserve the table's box before the payload lands, so the panel does not change shape when it does. */
  var shell = null;
  function reserve() {
    var card = document.querySelector('.hero.hx .spot.comp');
    if (!card || shell) return;
    shell = document.createElement('div');
    shell.className = 'hx-stand is-wait';
    shell.setAttribute('aria-hidden', 'true');
    shell.innerHTML = '<div class="hx-stand-hd"><span class="hx-stand-t">TMR Live Standings</span></div><div class="hx-table"><div class="hx-th"></div><div class="hx-tb"></div></div><div class="hx-note"></div>';
    card.insertBefore(shell, card.querySelector('.bd') || null);
    card.classList.add('hx-on');
  }
  function unreserve() {
    var card = document.querySelector('.hero.hx .spot.comp');
    if (shell && shell.parentNode) shell.parentNode.removeChild(shell);
    shell = null;
    if (card && !card.querySelector('.hx-stand')) card.classList.remove('hx-on');
  }

  function build(data) {
    var card = document.querySelector('.hero.hx .spot.comp');
    if (!card || !data || !Array.isArray(data.views)) return unreserve();
    var all = null, sports = [];
    data.views.forEach(function (v) {
      if (!v || !Array.isArray(v.rows) || !v.rows.length) return;
      if (v.key === 'units') all = v;
      else if (/^sport:/.test(String(v.key))) sports.push(v);
    });
    if (!all) return unreserve();
    var tabs = [{ label: 'All Sports', view: all }].concat(sports.map(function (v) {
      return { label: String(v.label || '').replace(/\s*rankings$/i, '') || String(v.key).slice(6).toUpperCase(), view: v };
    }));

    Array.prototype.forEach.call(card.querySelectorAll('.hx-stand:not(.is-wait)'), function (old) { old.parentNode.removeChild(old); });
    var box = document.createElement('div');
    box.className = 'hx-stand';
    box.innerHTML = '<div class="hx-stand-hd"><a class="hx-stand-t" href="/handicappers/"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h10v2h4v3a4 4 0 0 1-4.200 4A5.500 5.500 0 0 1 13 15.400V18h3v3H8v-3h3v-2.600A5.500 5.500 0 0 1 7.200 12 4 4 0 0 1 3 8V5h4V3zm0 4H5v1a2 2 0 0 0 2 2V7zm10 0v3a2 2 0 0 0 2-2V7h-2z"/></svg>TMR Live Standings</a>'
      + '<span class="hx-filters" role="group" aria-label="Filter standings by sport">' + tabs.map(function (t, i) {
        return '<button type="button" class="hx-f' + (i === 0 ? ' on' : '') + '" data-i="' + i + '" aria-pressed="' + (i === 0 ? 'true' : 'false') + '">' + esc(t.label) + '</button>';
      }).join('') + '</span></div>'
      + '<div class="hx-table" role="table" aria-label="TMR live standings">'
      + '<div class="hx-th" role="row"><span role="columnheader">#</span><span role="columnheader">Handicapper</span><span role="columnheader">Record</span><span role="columnheader">Win %</span><span role="columnheader">Units</span></div>'
      + '<div class="hx-tb" role="rowgroup" aria-live="polite"></div></div>'
      + '<div class="hx-note"></div>';
    var body = box.querySelector('.hx-tb'), note = box.querySelector('.hx-note');
    function show(i) {
      var t = tabs[i]; if (!t) return;
      body.innerHTML = rowsHtml(t.view);
      note.textContent = t.view.note || '';
      Array.prototype.forEach.call(box.querySelectorAll('.hx-f'), function (b, n) {
        b.classList.toggle('on', n === i); b.setAttribute('aria-pressed', n === i ? 'true' : 'false');
      });
    }
    box.querySelector('.hx-filters').addEventListener('click', function (ev) {
      var b = ev.target.closest('.hx-f'); if (b) show(Number(b.getAttribute('data-i')));
    });
    show(0);
    if (shell && shell.parentNode) shell.parentNode.removeChild(shell);
    shell = null;
    var bd = card.querySelector('.bd');
    card.insertBefore(box, bd || null);
    card.classList.add('hx-on');

    board(data.views, data.footer);
  }

  /* TMR Live Analytics board. Every number on it is read from the public API or from the page's own live counters:
     the standings tabs are the views in /api/users/competition, the picks and the sport split come from /api/picks. */
  var ROT_MS = 6000, rotTimer = null, holdUntil = 0;
  var TAB_NAMES = { units: 'Leaderboard', roi: 'ROI', winrate: 'Win rate', streaks: 'Hot streaks', week: 'This week', volume: 'Most active' };
  var roiOf = {};
  function leadRows(v) {
    var full = v.key === 'units';
    return (v.rows || []).slice(0, 3).map(function (r, i) {
      var c = r.competitor || {}, img = safeImg(c.avatar_url), rec = record(r.meta);
      var mark = esc((c.avatar && c.avatar.mark) || String(c.display_name || c.username || '?').slice(0, 2).toUpperCase());
      var neg = /^[\u2212-]/.test(String(r.value_text || '')), roi = roiOf[c.username] || '';
      return '<a class="hb-row' + (i === 0 ? ' r1' : '') + (full ? ' full' : '') + '" href="' + esc(safeHref(c.href)) + '"><span class="hb-rk">' + (i + 1) + '</span>'
        + '<span class="hb-id"><span class="hb-av">' + (img ? '<img src="' + esc(img) + '" alt="" loading="lazy" onerror="this.remove()">' : '') + '<i>' + mark + '</i></span><b>' + esc(c.display_name || c.username || '') + '</b></span>'
        + (full ? '<span class="hb-c">' + esc(rec ? rec.text : '') + '</span><span class="hb-c g' + (/^[\u2212-]/.test(roi) ? ' neg' : '') + '" data-roi="' + esc(c.username || '') + '">' + esc(roi) + '</span>'
                : '<span class="hb-c m">' + esc(r.meta || '') + '</span>')
        + '<span class="hb-val' + (neg ? ' neg' : '') + '">' + esc(r.value_text || '') + '</span></a>';
    }).join('');
  }
  function leadHead(v) {
    var cols = v.key === 'units' ? ['#', 'Handicapper', 'W-L', 'ROI', 'Units'] : ['#', 'Handicapper', 'Details', TAB_NAMES[v.key] || ''];
    return '<div class="hb-thr' + (v.key === 'units' ? ' full' : '') + '">' + cols.map(function (c) { return '<span>' + esc(c) + '</span>'; }).join('') + '</div>';
  }
  /* ROI for the leaderboard rows: each handicapper's own verified figure from their public profile record. */
  function loadRoi(v) {
    (v.rows || []).slice(0, 3).forEach(function (r) {
      var c = r.competitor || {}, u = String(c.username || '');
      if (!/^[A-Za-z0-9_.-]{1,40}$/.test(u) || roiOf[u] != null) return;
      roiOf[u] = '';
      getJSON(ORIGIN + '/api/users/' + encodeURIComponent(u)).then(function (d) {
        var p = d && d.user; if (!p || p.id !== c.id || p.roi == null || !isFinite(Number(p.roi))) return;
        var n = Number(p.roi); roiOf[u] = (n > 0 ? '+' : n < 0 ? '\u2212' : '') + Math.abs(n).toFixed(2) + '%';
        Array.prototype.forEach.call(document.querySelectorAll('.hb-c[data-roi="' + u + '"]'), function (el) { el.textContent = roiOf[u]; el.classList.toggle('neg', n < 0); });
      }).catch(function () {});
    });
  }
  function board(views, footer) {
    var tabsEl = document.getElementById('hbTabs'), rowsEl = document.getElementById('hbRows'), noteEl = document.getElementById('hbNote');
    if (!tabsEl || !rowsEl) return;
    var fresh = tabsEl.cloneNode(false); tabsEl.parentNode.replaceChild(fresh, tabsEl); tabsEl = fresh;   /* drops the listener from an earlier run */
    var list = [];
    Object.keys(TAB_NAMES).forEach(function (k) {
      views.forEach(function (v) { if (v && v.key === k && Array.isArray(v.rows) && v.rows.length) list.push(v); });
    });
    if (!list.length) return;
    tabsEl.innerHTML = list.map(function (v, i) { return '<button type="button" class="hb-tab' + (i === 0 ? ' on' : '') + '" data-i="' + i + '" aria-pressed="' + (i === 0 ? 'true' : 'false') + '">' + esc(TAB_NAMES[v.key]) + '</button>'; }).join('');
    var cur = 0, still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    function paint(i) {
      cur = i;
      rowsEl.innerHTML = leadRows(list[i]);
      var th = document.getElementById('hbTh'); if (th) th.innerHTML = leadHead(list[i]);
      if (noteEl) noteEl.textContent = list[i].note || '';
      rowsEl.classList.remove('is-out');
      Array.prototype.forEach.call(tabsEl.querySelectorAll('.hb-tab'), function (b, n) { b.classList.toggle('on', n === i); b.setAttribute('aria-pressed', n === i ? 'true' : 'false'); });
    }
    function go(i) { if (still) return paint(i); rowsEl.classList.add('is-out'); setTimeout(function () { paint(i); }, 240); }
    tabsEl.addEventListener('click', function (ev) {
      var b = ev.target.closest('.hb-tab'); if (!b) return;
      holdUntil = Date.now() + 20000; paint(Number(b.getAttribute('data-i')));
    });
    list.forEach(function (v) { if (v.key === 'units') loadRoi(v); });
    paint(0);
    var bd = document.getElementById('hxBoard'); if (bd) bd.classList.add('is-live');
    if (rotTimer) clearInterval(rotTimer);
    if (list.length > 1) rotTimer = setInterval(function () { if (!document.hidden && Date.now() > holdUntil) go((cur + 1) % list.length); }, ROT_MS);
    totals(footer); picks(); fold();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(fold);
  }

  /* Platform totals: the same live counters the stats strip under the hero shows. */
  function totals(footer) {
    var host = document.getElementById('hbTiles'); if (!host) return;
    var tile = function (v, l) { return '<span><b>' + esc(v) + '</b><i>' + l + '</i></span>'; };
    var fmt = function (n) { return Number(n).toLocaleString('en-US'); };
    if (!host.firstChild && footer && isFinite(Number(footer.verified_picks)) && isFinite(Number(footer.competitors))) {
      host.innerHTML = tile(fmt(footer.verified_picks), 'Picks tracked') + tile(fmt(footer.competitors), 'Members');
    }
    var src = [['tmrStatPicks', 'Picks tracked'], ['tmrStatCappers', 'Pick makers'], ['tmrStatMembers', 'Members']], tries = 0;
    (function read() {
      var out = [], ready = true;
      src.forEach(function (s) {
        var el = document.getElementById(s[0]), t = el && !el.querySelector('.sk') ? el.textContent.trim() : '';
        if (!/\d/.test(t)) ready = false; else out.push(tile(t, s[1]));
      });
      if (ready) { host.innerHTML = out.join(''); fold(); }
      else if (++tries < 60) setTimeout(read, 500);
    })();
  }

  var SPORTS = { basketball_nba: 'NBA', americanfootball_nfl: 'NFL', baseball_mlb: 'MLB', icehockey_nhl: 'NHL', americanfootball_ncaaf: 'NCAAF', basketball_ncaab: 'NCAAB' };
  var COLORS = ['#35a8ff', '#3dff86', '#ffc61f', '#a779ff', '#22d3ee', '#8fa6c4'];
  function sportOf(k) { k = String(k || ''); return SPORTS[k] || (/^soccer/.test(k) ? 'Soccer' : /^tennis/.test(k) ? 'Tennis' : 'Other'); }
  function nick(t) { t = String(t || '').trim(); var w = t.split(/\s+/); return w.length > 1 ? w[w.length - 1] : t; }
  var PICK_KEYS = ['status', 'result_units', 'graded_at', 'sport_key', 'away_team', 'home_team', 'selection', 'line_snapshot', 'market_type'];
  function paintPicks(list) {
    var host = document.getElementById('hbPicks'), dn = document.getElementById('hbDonut');
    var all = Array.isArray(list) ? list : [];
    var graded = all.filter(function (p) { return p && (p.status === 'won' || p.status === 'lost' || p.status === 'push') && isFinite(Number(p.result_units)); });
    if (host && graded.length) {
      host.innerHTML = graded.slice(0, 3).map(function (p) {
        var u = Number(p.result_units), st = p.status === 'won' ? 'Win' : p.status === 'lost' ? 'Loss' : 'Push';
        var line = p.line_snapshot != null && p.line_snapshot !== '' ? ' ' + (/spread/.test(String(p.market_type)) && Number(p.line_snapshot) > 0 ? '+' : '') + Number(p.line_snapshot) : '';
        return '<div class="hb-pick"><span class="hb-sp">' + esc(sportOf(p.sport_key)) + '</span><span class="hb-gm">' + esc(nick(p.away_team)) + ' @ ' + esc(nick(p.home_team)) + '</span>'
          + '<span class="hb-pk">' + esc(nick(p.selection)) + esc(line) + '</span><span class="hb-st ' + esc(p.status) + '">' + st + '</span>'
          + '<span class="hb-un' + (u < 0 ? ' neg' : '') + '">' + (u > 0 ? '+' : u < 0 ? '\u2212' : '') + Math.abs(u).toFixed(2) + 'u</span></div>';
      }).join('');
    }
    var tk = document.getElementById('hbTicker');
    if (tk && graded.length >= 4) {
      var items = graded.slice(0, 14).map(function (p) {
        var u = Number(p.result_units), ln = p.line_snapshot != null && p.line_snapshot !== '' ? ' ' + (/spread/.test(String(p.market_type)) && Number(p.line_snapshot) > 0 ? '+' : '') + Number(p.line_snapshot) : '';
        return '<span><b>' + esc(sportOf(p.sport_key)) + '</b> ' + esc(nick(p.away_team)) + ' @ ' + esc(nick(p.home_team)) + ' <i>' + esc(nick(p.selection)) + esc(ln) + '</i> <em class="' + esc(p.status) + '">'
          + (p.status === 'won' ? 'WIN' : p.status === 'lost' ? 'LOSS' : 'PUSH') + ' ' + (u > 0 ? '+' : u < 0 ? '\u2212' : '') + Math.abs(u).toFixed(2) + 'u</em></span>';
      }).join('');
      tk.innerHTML = items + items;
      tk.style.animationDuration = Math.max(30, graded.slice(0, 14).length * 5) + 's';
    }
    var sp = document.getElementById('hbSpark');
    if (sp && graded.length >= 10) {
      var g2 = graded.slice().sort(function (x, y) { return String(x.graded_at) < String(y.graded_at) ? -1 : 1; });
      var cum = [0], run = 0; g2.forEach(function (p) { run += Number(p.result_units); cum.push(run); });
      var lo = Math.min.apply(null, cum), hi = Math.max.apply(null, cum), span = (hi - lo) || 1, nn = cum.length - 1;
      var pts = cum.map(function (v, k) { return (300 * k / nn).toFixed(1) + ' ' + (56 - 52 * (v - lo) / span).toFixed(1); }).join(' L');
      sp.innerHTML = '<svg viewBox="0 0 300 60" preserveAspectRatio="none" aria-hidden="true"><path d="M' + pts + ' L300 60 L0 60Z" fill="rgba(61,255,134,.16)"/><path d="M' + pts + '" fill="none" stroke="#3dff86" stroke-width="2.2" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>'
        + '<span>Net units, last ' + g2.length + ' graded picks: <b class="' + (run < 0 ? 'neg' : '') + '">' + (run >= 0 ? '+' : '−') + Math.abs(run).toFixed(2) + 'u</b></span>';
    }
    if (dn && all.length >= 10) {
      var count = {}, order = [];
      all.forEach(function (p) { var k = sportOf(p && p.sport_key); if (!count[k]) { count[k] = 0; order.push(k); } count[k]++; });
      order.sort(function (x, y) { return count[y] - count[x]; });
      var top = order.slice(0, 4), rest = order.slice(4).reduce(function (n, k) { return n + count[k]; }, 0);
      var parts = top.map(function (k) { return [k, count[k]]; }); if (rest) parts.push(['Other', rest]);
      var acc = 0, stops = [], total = all.length;
      parts.forEach(function (pt, i) { var a0 = 100 * acc / total; acc += pt[1]; stops.push(COLORS[i] + ' ' + a0.toFixed(2) + '% ' + (100 * acc / total).toFixed(2) + '%'); });
      dn.style.background = 'conic-gradient(from 0deg, ' + stops.join(', ') + ')';
      var n = document.getElementById('hbDonutN'), lg = document.getElementById('hbLegend'), sn = document.getElementById('hbSportN');
      if (n) n.textContent = total;
      if (sn) sn.textContent = '(last ' + total + ')';
      if (lg) lg.innerHTML = parts.map(function (pt, i) { return '<li><i style="background:' + COLORS[i] + '"></i><span>' + esc(pt[0]) + '</span><b>' + Math.round(100 * pt[1] / total) + '%</b></li>'; }).join('');
      dn.classList.add('is-live');
    }
    fold();
  }
  function picks() {
    if (!document.getElementById('hbPicks') && !document.getElementById('hbDonut')) return;
    var old = cacheGet('picks'); if (old) paintPicks(old);
    retry(function () { return getJSON(ORIGIN + '/api/picks?limit=50'); }, function (d) {
      if (!d || !Array.isArray(d.picks) || !d.picks.length) return false;
      var slim = d.picks.map(function (p) { var o = {}; PICK_KEYS.forEach(function (k) { o[k] = p ? p[k] : null; }); return o; });
      paintPicks(slim); cacheSet('picks', slim); return true;
    });
  }

  /* Last good payload is kept in the browser so the board is never empty while a request is slow, limited or failing. */
  function cacheGet(k) { try { var v = JSON.parse(localStorage.getItem('hx:' + k) || 'null'); return v && Date.now() - v.t < 864e5 ? v.d : null; } catch (e) { return null; } }
  function cacheSet(k, d) { try { localStorage.setItem('hx:' + k, JSON.stringify({ t: Date.now(), d: d })); } catch (e) {} }
  function retry(load, use, done) {
    var waits = [0, 2500, 7000, 15000, 30000], n = 0;
    (function attempt() {
      var again = function () { if (++n < waits.length) setTimeout(attempt, waits[n]); else if (done) done(false); };
      var pr; try { pr = load(); } catch (e) { return again(); }
      pr.then(function (d) { var ok = false; try { ok = use(d); } catch (e) {} if (ok) { if (done) done(true); } else again(); }).catch(again);
    })();
  }
  function getJSON(url) { return fetch(url, { credentials: 'omit' }).then(function (r) { return r.ok ? r.json() : null; }); }

  /* The laptop artwork is drawn at 902 x 460 and scaled as one piece to the column it sits in. */
  function fit() {
    var st = document.getElementById('hxStage'); if (!st || !st.parentNode) return;
    var w = st.parentNode.clientWidth; if (!w) return;
    st.style.setProperty('--hxk', (w / 902).toFixed(4)); st.classList.add('is-fit');
  }

  /* First screen = headline, laptop and the five cards. The standings band starts just under the fold,
     so the top row is stretched (a little, never more than 170px) until the cards sit at the bottom of the window. */
  function fold() {
    var hero = document.querySelector('.hero.hx'), grid = hero && hero.querySelector('.hero-grid'), cards = hero && hero.querySelector('.hx-cards'), inn = hero && hero.querySelector('.hero-in');
    if (!grid || !cards || !inn) return;
    grid.style.removeProperty('--hxrow'); grid.style.removeProperty('--hxs');
    if (window.innerWidth < 1041) return;
    var gap = parseFloat(getComputedStyle(grid).rowGap) || 0;
    var natural = cards.getBoundingClientRect().top - grid.getBoundingClientRect().top - gap;
    var top = hero.getBoundingClientRect().top + window.pageYOffset;
    var avail = window.innerHeight - top - parseFloat(getComputedStyle(inn).paddingTop) - gap - cards.offsetHeight - 22;
    if (natural <= 0 || avail <= 0) return;
    if (avail < natural) {                       /* short window: shrink the top row until the cards are fully on screen */
      grid.style.setProperty('--hxs', Math.max(0.74, avail / natural).toFixed(3));
      fit();
    } else {
      grid.style.setProperty('--hxrow', Math.round(Math.min(avail, natural + 170)) + 'px');
    }
  }

  /* The Curry plate, same clip and same place, played as a muted looping video on desktop: at 1280px it is
     sharper than the animated image at the same weight. The still frame is already painted underneath
     by the stylesheet, so nothing moves when the video starts. If it cannot play (blocked autoplay, an old
     browser, a failed fetch) html.hx-novideo switches the stylesheet back to the animated image.
     Skipped for reduced motion and data saver, where the still frame stays. */
  var PLATE = '/static/media/steph-curry-hero-plate.7a40bd63bf04.mp4', PLATE_STILL = '/static/media/steph-curry-hero-plate.24e4eecb2e12.webp';
  function heroVideo() {
    var bg = document.querySelector('.hero.hx .hero-bg');
    if (!bg || bg.querySelector('video') || !window.matchMedia) return;
    if (!window.matchMedia('(min-width:1041px)').matches) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var c = navigator.connection;
    if (c && (c.saveData || /(^|-)2g$/.test(c.effectiveType || ''))) return;
    var fail = function () { document.documentElement.classList.add('hx-novideo'); if (v.parentNode) v.parentNode.removeChild(v); };
    var v = document.createElement('video');
    if (!v.canPlayType || !v.canPlayType('video/mp4; codecs="avc1.640028"')) { document.documentElement.classList.add('hx-novideo'); return; }
    v.className = 'hx-plate'; v.muted = true; v.defaultMuted = true; v.loop = true; v.autoplay = true; v.playsInline = true;
    v.setAttribute('muted', ''); v.setAttribute('playsinline', ''); v.setAttribute('aria-hidden', 'true'); v.setAttribute('disablepictureinpicture', '');
    v.tabIndex = -1; v.preload = 'auto'; v.poster = PLATE_STILL;
    v.addEventListener('playing', function () { bg.classList.add('has-video'); }, { once: true });
    v.addEventListener('error', fail, { once: true });
    v.src = PLATE;
    bg.appendChild(v);
    var p = v.play(); if (p && p.catch) p.catch(function () { if (!bg.classList.contains('has-video')) fail(); });
    if (window.IntersectionObserver) {
      new IntersectionObserver(function (es) {
        if (!v.parentNode) return;
        if (es[0].isIntersecting) { var q = v.play(); if (q && q.catch) q.catch(function () {}); } else v.pause();
      }, { threshold: 0.01 }).observe(bg.parentNode || bg);
    }
  }

  function go() {
    heroVideo(); window.addEventListener('resize', heroVideo);
    /* The first screen ends on the six cards, exactly where the install prompt and the chat launcher float.
       body.hx-scrolled lets the stylesheet keep them clear of the cards until the visitor has scrolled. */
    var scrolled = function () { if (document.body) document.body.classList.toggle('hx-scrolled', (window.pageYOffset || 0) > 80); };
    scrolled(); window.addEventListener('scroll', scrolled, { passive: true });
    fit(); fold();
    window.addEventListener('resize', fold); window.addEventListener('load', fold);
    setTimeout(fold, 1200); setTimeout(fold, 3500);
    if (window.ResizeObserver) { var st = document.getElementById('hxStage'); if (st && st.parentNode) new ResizeObserver(fit).observe(st.parentNode); }
    else window.addEventListener('resize', fit);
    reserve();
    var had = false, old = cacheGet('comp');
    if (old && Array.isArray(old.views)) { try { build(old); had = true; } catch (e) {} }
    retry(function () { return getJSON(API); }, function (d) {
      if (!d || !Array.isArray(d.views) || !d.views.length) return false;
      build(d); had = true; cacheSet('comp', d); return true;
    }, function (ok) { if (!ok && !had) unreserve(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go();
})();
