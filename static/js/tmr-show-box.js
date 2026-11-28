/* TMR MLB The Show box score viewer (auto tracked games). Opens a full box score over the page. */
(function () {
  if (window.TMRShowBox) return;
  var API = 'https://api.trustmyrecord.com/api/gaming/theshow/game/';
  var MODES = { ARENA: 'Diamond Dynasty', RANKED: 'Diamond Dynasty Ranked', BR: 'Battle Royale', EVENT: 'Diamond Dynasty Event' };
  var css = [
    '.sbx-ov{position:fixed;inset:0;z-index:10050;background:rgba(3,8,18,.78);backdrop-filter:blur(3px);overflow-y:auto;padding:24px 12px}',
    '.sbx{max-width:1180px;margin:0 auto;background:#0a1424;border:1px solid #1d3354;border-radius:16px;color:#e8eef8;font-family:inherit;box-shadow:0 30px 80px rgba(0,0,0,.55);overflow:hidden}',
    '.sbx *{box-sizing:border-box}',
    '.sbx-x{position:absolute;right:14px;top:12px;width:36px;height:36px;border-radius:50%;border:1px solid #2a4570;background:#0d1b31;color:#cfe0ff;font-size:20px;line-height:1;cursor:pointer}',
    '.sbx-hd{position:relative;padding:18px 22px 20px;background:radial-gradient(ellipse at 15% 0,rgba(255,110,40,.22),transparent 55%),radial-gradient(ellipse at 85% 0,rgba(40,120,255,.28),transparent 55%),linear-gradient(180deg,#0f2142,#0a1424)}',
    '.sbx-meta{text-align:center;font-size:12.5px;letter-spacing:.06em;text-transform:uppercase;color:#b9c8e2;margin:0 40px 12px}',
    '.sbx-meta b{color:#f5c542;font-weight:800}',
    '.sbx-sc{display:grid;grid-template-columns:1fr auto auto auto 1fr;align-items:center;gap:18px;max-width:760px;margin:0 auto}',
    '.sbx-tm{min-width:0}.sbx-tm.r{text-align:left}.sbx-tm.l{text-align:right}',
    '.sbx-tm .n{font-size:24px;font-weight:900;line-height:1.1;overflow-wrap:anywhere}',
    '.sbx-tm .u{font-size:13px;color:#9fb3d4;margin-top:3px}.sbx-tm .u a{color:#7fb2ff}',
    '.sbx-tm.w .n{color:#fff}.sbx-tm.lo .n{color:#c5d2e8}',
    '.sbx-big{font-size:52px;font-weight:900;font-variant-numeric:tabular-nums;line-height:1}',
    '.sbx-big.lo{color:#9fb3d4}',
    '.sbx-fin{font-size:15px;font-weight:800;letter-spacing:.08em;color:#cfe0ff}',
    '.sbx-ls{margin:16px auto 0;max-width:760px;border:1px solid #29466f;border-radius:10px;overflow-x:auto;background:rgba(6,14,28,.75)}',
    '.sbx table{border-collapse:collapse;width:100%;font-variant-numeric:tabular-nums}',
    '.sbx-ls th,.sbx-ls td{padding:7px 10px;text-align:center;font-size:15px;white-space:nowrap}',
    '.sbx-ls th{font-size:12.5px;color:#9fb3d4;font-weight:700;border-bottom:1px solid #29466f}',
    '.sbx-ls td:first-child,.sbx-ls th:first-child{text-align:left;font-weight:800;min-width:120px}',
    '.sbx-ls .t{border-left:1px solid #29466f;font-weight:900}',
    '.sbx-body{display:grid;grid-template-columns:280px 1fr 330px;gap:16px;padding:18px}',
    '.sbx-card{background:#0d1b31;border:1px solid #1f3658;border-radius:12px;overflow:hidden;margin-bottom:16px}',
    '.sbx-card:last-child{margin-bottom:0}',
    '.sbx-card h3{margin:0;padding:11px 14px;font-size:17px;font-weight:800;background:#11233f;border-bottom:1px solid #1f3658;color:#fff}',
    '.sbx-card .pad{padding:12px 14px;font-size:14.5px;line-height:1.55;color:#d7e2f3}',
    '.sbx-kp{display:flex;gap:12px;align-items:center;padding:11px 14px;border-bottom:1px solid #1a2f4f}',
    '.sbx-kp:last-child{border-bottom:0}',
    '.sbx-kp .ic{flex:0 0 42px;height:42px;border-radius:50%;display:grid;place-items:center;font-weight:900;font-size:13px;background:linear-gradient(135deg,#1f6fe5,#0b3a86);color:#fff}',
    '.sbx-kp .ic.p{background:linear-gradient(135deg,#f08a24,#a2410c)}',
    '.sbx-kp .nm{font-weight:800;color:#fff;font-size:15px}.sbx-kp .ps{font-size:12px;color:#8fa6c9}.sbx-kp .ln{font-size:14px;color:#e8eef8;margin-top:2px}',
    '.sbx-st th,.sbx-st td{padding:6px 8px;text-align:right;font-size:13.5px;white-space:nowrap;border-bottom:1px solid #172b49}',
    '.sbx-st th{font-size:12px;color:#9fb3d4;font-weight:700;background:#0f2038}',
    '.sbx-st th:first-child,.sbx-st td:first-child{text-align:left}',
    '.sbx-st th:first-child{color:#fff;font-size:14.5px;font-weight:800}',
    '.sbx-st tr.tot td{font-weight:900;border-bottom:0;background:#0f2038}',
    '.sbx-st tr.hi td{background:rgba(31,111,229,.22)}',
    '.sbx-tw{overflow-x:auto}',
    '.sbx-nt div{margin:2px 0}.sbx-nt b{color:#fff;margin-right:4px}',
    '.sbx-msg{padding:40px;text-align:center;color:#b9c8e2}',
    '@media (max-width:1020px){.sbx-body{grid-template-columns:1fr}.sbx-l{display:grid;grid-template-columns:1fr 1fr;gap:16px}.sbx-l .sbx-card{margin:0}}',
    '@media (max-width:640px){.sbx-ov{padding:0}.sbx{border-radius:0;border:0}.sbx-hd{padding:14px 12px 16px}.sbx-sc{gap:8px;grid-template-columns:1fr auto auto auto 1fr}.sbx-tm .n{font-size:16px}.sbx-big{font-size:34px}.sbx-fin{font-size:11px}.sbx-body{padding:12px}.sbx-l{grid-template-columns:1fr}.sbx-ls th,.sbx-ls td{padding:6px 6px;font-size:13px}.sbx-ls td:first-child,.sbx-ls th:first-child{min-width:84px}}'
  ].join('\n');
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function num(v) { var x = parseFloat(v); return isNaN(x) ? 0 : x; }
  function avg(v) { var x = parseFloat(v); if (v === '' || v == null || isNaN(x)) return esc(v); return x.toFixed(3).replace(/^0/, ''); }
  function era(v) { var x = parseFloat(v); if (v === '' || v == null || isNaN(x)) return esc(v); return x.toFixed(2); }
  function modeName(m) { m = String(m || '').toUpperCase(); return MODES[m] || (m ? m.charAt(0) + m.slice(1).toLowerCase().replace(/_/g, ' ') : 'Online'); }
  function short(name) { return String(name || '').split(',')[0].replace(/\s*\((W|L|S|H|BS)\)\s*$/i, '').trim(); }
  function pos(name) { var p = String(name || '').split(','); return p.length > 1 ? p[1].trim() : ''; }
  function initials(n) { var p = String(n || '').replace(/[^A-Za-z .'-]/g, '').split(/[ .]+/).filter(Boolean); return ((p[0] || '?').charAt(0) + (p.length > 1 ? p[p.length - 1].charAt(0) : '')).toUpperCase(); }
  function userLink(s) { return s.member ? '<a href="/profile/?user=' + encodeURIComponent(s.member) + '#gaming">' + esc(s.member) + '</a>' : ''; }
  function abbr(t) { var w = String(t || '').replace(/[^A-Za-z0-9 ]/g, '').split(' ').filter(Boolean); return (w.length > 1 ? w.map(function (x) { return x.charAt(0); }).join('') : (w[0] || '')).slice(0, 3).toUpperCase(); }
  function team(g, side) { var b = g.box || {}; return ((b.teams || []).filter(function (t) { return t.side === side; })[0]) || { r: [], batting: [], pitching: [] }; }
  function pitchers(str) { var p = {}, re = /\b(W|L|SV):\s*([^,(]+\([^)]*\))/g, m; while ((m = re.exec(String(str || '')))) p[m[1]] = m[2].trim(); return p; }
  function line(b) { var ab = num(b.ab), h = num(b.h), x = [h + ' for ' + ab]; if (num(b.hr)) x.push((num(b.hr) > 1 ? num(b.hr) + ' ' : '') + 'HR'); if (num(b.rbi)) x.push(num(b.rbi) + ' RBI'); if (num(b.r)) x.push(num(b.r) + ' R'); if (num(b.bb)) x.push(num(b.bb) + ' BB'); return x.join(', '); }
  function pline(p) { return esc(p.ip) + ' IP, ' + esc(p.h) + ' H, ' + esc(p.er) + ' ER, ' + esc(p.so) + ' K'; }

  function render(g) {
    var A = g.away || {}, Hm = g.home || {}, ta = team(g, 'away'), th = team(g, 'home');
    var n = Math.max(num(g.box && g.box.innings) || 9, ta.r.length, th.r.length);
    var ar = ta.r.slice(), hr = th.r.slice();
    if (Hm.result === 'W' && (hr[n - 1] === '0' || hr[n - 1] == null || hr[n - 1] === '')) {
      var pre = hr.slice(0, n - 1).reduce(function (s, v) { return s + num(v); }, 0);
      if (pre > num(A.runs)) hr[n - 1] = 'X';
    }
    var aw = A.result === 'W', hw = Hm.result === 'W';
    var aT = A.team || 'Away', hT = Hm.team || 'Home';
    function tm(s, t, cls, won) { return '<div class="sbx-tm ' + cls + (won ? ' w' : ' lo') + '"><div class="n">' + esc(t) + '</div><div class="u">' + (s.member ? userLink(s) : (s.result === 'W' ? 'Winner' : '&nbsp;')) + '</div></div>'; }
    var head = '<tr><th></th>';
    for (var i = 1; i <= n; i++) head += '<th>' + i + '</th>';
    head += '<th class="t">R</th><th>H</th><th>E</th></tr>';
    function lrow(s, t, r) { var c = '<tr><td>' + esc(abbr(t)) + '</td>'; for (var i = 0; i < n; i++) c += '<td>' + esc(r[i] != null ? r[i] : '') + '</td>'; return c + '<td class="t">' + esc(s.runs) + '</td><td>' + esc(s.hits) + '</td><td>' + esc(s.errors) + '</td></tr>'; }
    var played = String(g.played || '').split(' ')[0];
    var hd = '<div class="sbx-hd"><button class="sbx-x" type="button" aria-label="Close box score">&times;</button>' +
      '<div class="sbx-meta"><b>MLB The Show 26</b> &nbsp;|&nbsp; ' + esc(modeName(g.mode)) + ' &nbsp;|&nbsp; ' + esc(played) + '</div>' +
      '<div class="sbx-sc">' + tm(A, aT, 'l', aw) + '<div class="sbx-big' + (aw ? '' : ' lo') + '">' + esc(A.runs) + '</div><div class="sbx-fin">FINAL</div><div class="sbx-big' + (hw ? '' : ' lo') + '">' + esc(Hm.runs) + '</div>' + tm(Hm, hT, 'r', hw) + '</div>' +
      '<div class="sbx-ls"><table><thead>' + head + '</thead><tbody>' + lrow(A, aT, ar) + lrow(Hm, hT, hr) + '</tbody></table></div></div>';

    // key performers
    var bats = [];
    [[ta, aT], [th, hT]].forEach(function (x) { (x[0].batting || []).forEach(function (b) { bats.push({ b: b, t: x[1], s: num(b.h) * 2 + num(b.hr) * 4 + num(b.rbi) * 1.5 + num(b.r) + num(b.bb) * 0.5 }); }); });
    bats.sort(function (a, b) { return b.s - a.s; });
    var allP = [];
    [[ta, aT], [th, hT]].forEach(function (x) { (x[0].pitching || []).forEach(function (p) { allP.push({ p: p, t: x[1] }); }); });
    var wp = allP.filter(function (x) { return /\(W\)/.test(x.p.name); })[0];
    var kps = bats.slice(0, wp ? 2 : 3).filter(function (x) { return x.s > 0; }).map(function (x) {
      return '<div class="sbx-kp"><div class="ic">' + esc(initials(short(x.b.name))) + '</div><div><div class="nm">' + esc(short(x.b.name)) + '</div><div class="ps">' + esc(pos(x.b.name)) + ' &middot; ' + esc(x.t) + '</div><div class="ln">' + esc(line(x.b)) + '</div></div></div>';
    });
    if (wp) kps.push('<div class="sbx-kp"><div class="ic p">' + esc(initials(short(wp.p.name))) + '</div><div><div class="nm">' + esc(short(wp.p.name)) + '</div><div class="ps">Winning pitcher &middot; ' + esc(wp.t) + '</div><div class="ln">' + pline(wp.p) + '</div></div></div>');

    // summary
    var W = aw ? A : Hm, L = aw ? Hm : A, WT = aw ? aT : hT, LT = aw ? hT : aT;
    var sum = esc(WT) + (aw ? ' won on the road at ' : ' beat ') + esc(LT) + ' ' + esc(W.runs) + ' to ' + esc(L.runs) + '.';
    if (bats[0] && bats[0].s > 0) sum += ' ' + esc(short(bats[0].b.name)) + ' led the way going ' + esc(line(bats[0].b)) + '.';
    if (wp) sum += ' ' + esc(short(wp.p.name)) + ' earned the win with ' + pline(wp.p) + '.';
    var pp = pitchers(g.pitchers), notes = [];
    [['W', 'WP'], ['L', 'LP'], ['SV', 'SV']].forEach(function (k) { if (pp[k[0]]) notes.push('<div><b>' + k[1] + ':</b>' + esc(pp[k[0]]) + '</div>'); });
    var hrs = [[ta, aT], [th, hT]].map(function (x) { var l = (x[0].batting || []).filter(function (b) { return num(b.hr) > 0; }).map(function (b) { return esc(short(b.name)) + (num(b.hr) > 1 ? ' ' + num(b.hr) : ''); }); return l.length ? esc(x[1]) + ': ' + l.join(', ') + '.' : ''; }).filter(Boolean);
    if (hrs.length) notes.push('<div><b>HR:</b>' + hrs.join(' ') + '</div>');

    var topName = bats[0] && bats[0].s > 0 ? bats[0].b.name : null;
    function hit(t, name) {
      var rows = (t.batting || []).map(function (b) {
        return '<tr' + (b.name === topName ? ' class="hi"' : '') + '><td>' + esc(b.name) + '</td><td>' + esc(b.ab) + '</td><td>' + esc(b.r) + '</td><td>' + esc(b.h) + '</td><td>' + esc(b.rbi) + '</td><td>' + esc(b.bb) + '</td><td>' + esc(b.so) + '</td><td>' + esc(b.hr) + '</td><td>' + avg(b.avg) + '</td></tr>';
      }).join('');
      var T = t.batting_totals || {};
      return '<div class="sbx-card sbx-tw"><table class="sbx-st"><thead><tr><th>' + esc(name) + ' Hitting</th><th>AB</th><th>R</th><th>H</th><th>RBI</th><th>BB</th><th>K</th><th>HR</th><th>AVG</th></tr></thead><tbody>' + rows +
        '<tr class="tot"><td>Totals</td><td>' + esc(T.ab) + '</td><td>' + esc(T.r) + '</td><td>' + esc(T.h) + '</td><td>' + esc(T.rbi) + '</td><td>' + esc(T.bb) + '</td><td>' + esc(T.so) + '</td><td>' + (t.batting || []).reduce(function (s, b) { return s + num(b.hr); }, 0) + '</td><td></td></tr></tbody></table></div>';
    }
    var prow = allP.map(function (x) {
      var m = /\((W|L|S|H|BS)\)/i.exec(x.p.name), tag = m ? m[1].toUpperCase() + ': ' : '';
      return '<tr><td>' + esc(tag + short(x.p.name)) + ' <span style="color:#8fa6c9">(' + esc(abbr(x.t)) + ')</span></td><td>' + esc(x.p.ip) + '</td><td>' + esc(x.p.h) + '</td><td>' + esc(x.p.r) + '</td><td>' + esc(x.p.er) + '</td><td>' + esc(x.p.bb) + '</td><td>' + esc(x.p.so) + '</td><td>' + era(x.p.era) + '</td></tr>';
    }).join('');

    return hd + '<div class="sbx-body">' +
      '<div class="sbx-l"><div class="sbx-card"><h3>Game Summary</h3><div class="pad">' + sum + '</div></div>' +
      (kps.length ? '<div class="sbx-card"><h3>Key Performers</h3>' + kps.join('') + '</div>' : '') + '</div>' +
      '<div>' + hit(ta, aT) + hit(th, hT) + '</div>' +
      '<div><div class="sbx-card sbx-tw"><h3>Pitching Summary</h3><table class="sbx-st"><thead><tr><th style="font-size:12px;color:#9fb3d4">Pitcher</th><th>IP</th><th>H</th><th>R</th><th>ER</th><th>BB</th><th>K</th><th>ERA</th></tr></thead><tbody>' + prow + '</tbody></table></div>' +
      (notes.length ? '<div class="sbx-card"><h3>Game Notes</h3><div class="pad sbx-nt">' + notes.join('') + '</div></div>' : '') + '</div>' +
      '</div>';
  }

  var ov = null, lastFocus = null;
  function close() { if (ov) { ov.remove(); ov = null; document.documentElement.style.overflow = ''; if (lastFocus && lastFocus.focus) lastFocus.focus(); } }
  function open(id) {
    if (!document.getElementById('sbx-css')) { var st = document.createElement('style'); st.id = 'sbx-css'; st.textContent = css; document.head.appendChild(st); }
    close(); lastFocus = document.activeElement;
    ov = document.createElement('div'); ov.className = 'sbx-ov'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-label', 'Box score');
    ov.innerHTML = '<div class="sbx" style="position:relative"><div class="sbx-msg">Loading box score&hellip;</div></div>';
    ov.addEventListener('click', function (e) { if (e.target === ov || (e.target.closest && e.target.closest('.sbx-x'))) close(); });
    document.body.appendChild(ov); document.documentElement.style.overflow = 'hidden';
    fetch(API + encodeURIComponent(id)).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
      if (!ov) return;
      var g = j && j.game;
      ov.firstChild.innerHTML = g && g.box ? render(g) : '<div class="sbx-msg">This box score is not available yet.</div><button class="sbx-x" type="button" aria-label="Close">&times;</button>';
      var x = ov.querySelector('.sbx-x'); if (x) x.focus();
    }).catch(function () { if (ov) ov.firstChild.innerHTML = '<div class="sbx-msg">Box score could not load right now.</div><button class="sbx-x" type="button" aria-label="Close">&times;</button>'; });
  }
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
  window.TMRShowBox = { open: open, close: close, render: render };
})();
