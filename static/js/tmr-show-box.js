/* TMR MLB The Show box score viewer (auto tracked games). Opens a full box score over the page. */
(function () {
  if (window.TMRShowBox) return;
  var API = 'https://api.trustmyrecord.com/api/gaming/theshow/game/';
  var IDX = '/static/data/show26-players.json?v=1127';
  var MODES = { ARENA: 'Diamond Dynasty', RANKED: 'Diamond Dynasty Ranked', BR: 'Battle Royale', EVENT: 'Diamond Dynasty Event' };
  var css = [
    '.sbx-ov{position:fixed;inset:0;z-index:10050;background:rgba(3,8,18,.8);backdrop-filter:blur(3px);overflow-y:auto;padding:24px 12px}',
    '.sbx{position:relative;max-width:1240px;margin:0 auto;background:#07101f;border:1px solid #1d3354;border-radius:16px;color:#e8eef8;font-family:inherit;box-shadow:0 30px 80px rgba(0,0,0,.55);overflow:hidden}',
    '.sbx *{box-sizing:border-box}',
    '.sbx-x{position:absolute;right:14px;top:12px;z-index:5;width:36px;height:36px;border-radius:50%;border:1px solid #2a4570;background:rgba(13,27,49,.9);color:#cfe0ff;font-size:20px;line-height:1;cursor:pointer}',
    '.sbx-hd{position:relative;padding:14px 22px 16px;min-height:300px;background:linear-gradient(90deg,rgba(255,106,26,.30),rgba(10,22,44,0) 32%,rgba(10,22,44,0) 68%,rgba(30,110,255,.34)),linear-gradient(180deg,#132a52,#0a1630 70%,#07101f);overflow:hidden}',
    '.sbx-hero{position:absolute;bottom:0;width:300px;height:290px;object-fit:cover;object-position:top;opacity:.95}',
    '.sbx-hero.l{left:10px;-webkit-mask-image:linear-gradient(90deg,#000 55%,transparent);mask-image:linear-gradient(90deg,#000 55%,transparent)}',
    '.sbx-hero.r{right:10px;-webkit-mask-image:linear-gradient(270deg,#000 55%,transparent);mask-image:linear-gradient(270deg,#000 55%,transparent)}',
    '.sbx-wm{position:absolute;top:70px;font-size:58px;font-weight:900;font-style:italic;letter-spacing:-.02em;opacity:.9;text-shadow:0 4px 18px rgba(0,0,0,.5);white-space:nowrap;pointer-events:none}',
    '.sbx-wm.l{left:250px;color:#ff7a2a}.sbx-wm.r{right:250px;color:#e9f1ff}',
    '.sbx-ctr{position:relative;z-index:2;max-width:680px;margin:0 auto}',
    '.sbx-meta{text-align:center;font-size:12.5px;letter-spacing:.06em;text-transform:uppercase;color:#cdd9ee;margin-bottom:10px}',
    '.sbx-meta b{display:inline-block;padding:2px 7px;border:1px solid #3a5a8c;border-radius:5px;color:#f5c542;font-weight:800;margin-right:8px}',
    '.sbx-sc{display:grid;grid-template-columns:auto 1fr auto auto auto 1fr auto;align-items:center;gap:14px}',
    '.sbx-bdg{width:46px;height:46px;border-radius:10px;display:grid;place-items:center;font-weight:900;font-size:15px;color:#fff;box-shadow:inset 0 0 0 2px rgba(255,255,255,.15)}',
    '.sbx-bdg.a{background:linear-gradient(135deg,#ff7a2a,#b3420a)}.sbx-bdg.h{background:linear-gradient(135deg,#2f7bff,#0b3a96)}',
    '.sbx-bdg.s{width:24px;height:24px;border-radius:6px;font-size:10px;display:inline-grid;vertical-align:middle;flex:0 0 24px}',
    '.sbx-tm .n{font-size:22px;font-weight:900;line-height:1.1;overflow-wrap:anywhere}.sbx-tm .u{font-size:13px;color:#a9bbd9;margin-top:2px}.sbx-tm .u a{color:#8fbcff}',
    '.sbx-tm.r{text-align:right}',
    '.sbx-big{font-size:56px;font-weight:900;font-variant-numeric:tabular-nums;line-height:1}.sbx-big.lo{color:#9fb3d4}',
    '.sbx-fin{font-size:17px;font-weight:800;letter-spacing:.06em}',
    '.sbx-ls{margin-top:12px;border:1px solid #31507f;border-radius:10px;overflow-x:auto;background:rgba(5,12,26,.82)}',
    '.sbx table{border-collapse:collapse;width:100%;font-variant-numeric:tabular-nums}',
    '.sbx-ls th,.sbx-ls td{padding:6px 9px;text-align:center;font-size:15px;white-space:nowrap}',
    '.sbx-ls th{font-size:13px;color:#a9bbd9;font-weight:700;border-bottom:1px solid #31507f}',
    '.sbx-ls td:first-child,.sbx-ls th:first-child{text-align:left;font-weight:800;min-width:78px}',
    '.sbx-ls .t{border-left:1px solid #31507f;font-weight:900}',
    '.sbx-dec{display:flex;justify-content:center;flex-wrap:wrap;gap:8px 22px;margin-top:10px}',
    '.sbx-dec div{display:flex;align-items:center;gap:8px;font-size:13.5px;color:#cdd9ee}.sbx-dec b{color:#fff}.sbx-dec i{font-style:normal;color:#f5c542;font-weight:900;min-width:20px}',
    '.sbx-dec img,.sbx-dec .ini{width:30px;height:30px;border-radius:50%;object-fit:cover;background:#1a3358;border:1px solid #31507f}',
    '.sbx-tabs{display:flex;gap:6px;padding:8px 18px;background:#0b1730;border-top:1px solid #1d3354;border-bottom:1px solid #1d3354;overflow-x:auto}',
    '.sbx-tabs a,.sbx-tabs span{padding:9px 18px;border-radius:8px;font-weight:700;font-size:15px;color:#dce6f7;text-decoration:none;white-space:nowrap}',
    '.sbx-tabs span{background:linear-gradient(180deg,#2f7bff,#1557d6);color:#fff}.sbx-tabs a:hover{background:#13274a}',
    '.sbx-body{display:grid;grid-template-columns:300px minmax(0,1fr) 360px;gap:16px;padding:18px}',
    '.sbx-body>*,.sbx-l>*,.sbx-rt>*{min-width:0}',
    '.sbx-card{background:#0c1a31;border:1px solid #213a60;border-radius:12px;overflow:hidden;margin-bottom:16px}',
    '.sbx-card:last-child{margin-bottom:0}',
    '.sbx-card h3{margin:0;padding:11px 14px;font-size:18px;font-weight:800;background:#0f2242;border-bottom:1px solid #213a60;color:#fff}',
    '.sbx-card .pad{padding:12px 14px;font-size:15px;line-height:1.55;color:#dce6f7}',
    '.sbx-kps{padding:10px}',
    '.sbx-kp{display:flex;gap:12px;align-items:center;padding:8px 10px;margin-bottom:10px;border:1px solid #29466f;border-radius:10px;background:linear-gradient(90deg,#14294c,#0f1f3a)}',
    '.sbx-kp:last-child{margin-bottom:0}',
    '.sbx-kp img,.sbx-kp .ini{flex:0 0 74px;width:74px;height:74px;border-radius:10px;object-fit:cover;object-position:top;background:#1a3358}',
    '.sbx .ini{display:grid;place-items:center;font-weight:900;color:#fff;background:linear-gradient(135deg,#1f6fe5,#0b3a86)}',
    '.sbx-kp .nm{font-weight:800;color:#fff;font-size:16px}.sbx-kp .ps{font-size:12.5px;color:#9fb3d4;margin:1px 0 3px}.sbx-kp .ln{font-size:15px;color:#fff}',
    '.sbx-st th,.sbx-st td{padding:5px 8px;text-align:right;font-size:14px;white-space:nowrap;border-bottom:1px solid #16294a}',
    '.sbx-st thead th{font-size:13px;color:#cdd9ee;font-weight:700;background:#0f2242;padding:9px 8px}',
    '.sbx-st th:first-child,.sbx-st td:first-child{text-align:left}',
    '.sbx-st thead th:first-child{color:#fff;font-size:16px;font-weight:800}',
    '.sbx-st tr.tot td{font-weight:900;border-bottom:0;background:#0f2242}',
    '.sbx-st tr.hi td{background:rgba(47,123,255,.28);font-weight:800;color:#fff}',
    '.sbx-st .dc{color:#f5c542;font-weight:800}',
    '.sbx-tw{overflow-x:auto}',
    '.sbx-pt thead th:first-child{font-size:15px}',
    '.sbx-nt{padding:9px 12px 11px;font-size:13.5px;line-height:1.6;color:#cdd9ee;border-top:1px solid #213a60;white-space:normal}',
    '.sbx-nt div{margin-top:2px}.sbx-nt b{color:#fff;font-weight:800}.sbx-nt .h{font-size:11.5px;letter-spacing:.08em;text-transform:uppercase;color:#f5c542;font-weight:800;margin-top:6px}.sbx-nt .h:first-child{margin-top:0}',
    '.sbx-inn{padding:8px 10px}',
    '.sbx-inn .ih{padding:5px 10px;border-radius:6px;background:#132a4f;font-weight:800;font-size:13.5px;color:#fff;margin-top:6px}',
    '.sbx-inn .ih:first-child{margin-top:0}',
    '.sbx-inn .ir{display:flex;gap:10px;align-items:flex-start;padding:7px 10px;font-size:14px;line-height:1.4;color:#dce6f7}',
    '.sbx-inn .ir .sc{margin-left:auto;font-weight:800;color:#fff;white-space:nowrap;padding-left:8px}',
    '.sbx-msg{padding:40px;text-align:center;color:#b9c8e2}',
    '@media (max-width:1100px){.sbx-hero,.sbx-wm{display:none}.sbx-hd{min-height:0}.sbx-body{grid-template-columns:minmax(0,1fr)}.sbx-l,.sbx-rt{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:16px;align-items:start}.sbx-l .sbx-card,.sbx-rt .sbx-card{margin:0}.sbx-rt>div>.sbx-card{margin-bottom:16px}}',
    '@media (max-width:640px){.sbx-ov{padding:0}.sbx{border-radius:0;border:0}.sbx-hd{padding:12px 10px 14px}.sbx-sc{gap:6px;grid-template-columns:1fr auto auto auto 1fr}.sbx-sc>.sbx-bdg{display:none}.sbx-tm .n{font-size:15px}.sbx-tm .u{font-size:11.5px}.sbx-big{font-size:36px}.sbx-fin{font-size:12px}.sbx-body{padding:10px}.sbx-l,.sbx-rt{grid-template-columns:minmax(0,1fr)}.sbx-ls th,.sbx-ls td{padding:5px 6px;font-size:13px}.sbx-ls td:first-child,.sbx-ls th:first-child{min-width:52px}.sbx-meta{margin:0 34px 8px;font-size:11px}.sbx-tabs{padding:6px 8px}.sbx-tabs a,.sbx-tabs span{padding:7px 12px;font-size:14px}}'
  ].join('\n');

  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function num(v) { var x = parseFloat(v); return isNaN(x) ? 0 : x; }
  function avg(v) { var x = parseFloat(v); if (v === '' || v == null || isNaN(x)) return esc(v); return x.toFixed(3).replace(/^0/, ''); }
  function era(v) { var x = parseFloat(v); if (v === '' || v == null || isNaN(x)) return esc(v); return x.toFixed(2); }
  function modeName(m) { m = String(m || '').toUpperCase(); return MODES[m] || (m ? m.charAt(0) + m.slice(1).toLowerCase().replace(/_/g, ' ') : 'Online'); }
  function plain(s) { return String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\./g, '').trim(); }
  function abbr(t) { var w = String(t || '').replace(/[^A-Za-z0-9 ]/g, '').split(' ').filter(Boolean); return (w.length > 1 ? w.map(function (x) { return x.charAt(0); }).join('') : (w[0] || '')).slice(0, 3).toUpperCase(); }
  function ord(n) { var s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }
  function team(g, side) { var b = g.box || {}; return ((b.teams || []).filter(function (t) { return t.side === side; })[0]) || { r: [], batting: [], pitching: [] }; }
  function listJoin(a) { return a.length > 1 ? a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1] : (a[0] || ''); }

  // "Devers, 3B" / "a-Paredes, PH" / "C. Sale (W)" -> parts
  function parse(raw, pitcher) {
    var s = String(raw || ''), dec = (/\((W|L|S|H|BS)\)/i.exec(s) || [])[1] || '';
    s = s.replace(/\s*\((W|L|S|H|BS)\)\s*/ig, '').replace(/^[a-z0-9]{1,2}-/i, '');
    var parts = s.split(','), nm = parts[0].trim(), pos = pitcher ? 'P' : (parts[1] || '').trim();
    var m = /^([A-Z])\.\s+(.+)$/.exec(nm);
    return { raw: raw, name: nm, init: m ? m[1] : '', last: m ? m[2] : nm, pos: pos, dec: dec.toUpperCase(), pitcher: !!pitcher };
  }
  var IDXDATA = null;
  function find(p) {
    if (!IDXDATA) return null;
    var last = plain(p.last), c = IDXDATA.filter(function (x) { var f = plain(x[0]); return f === last || f.slice(-(last.length + 1)) === ' ' + last; });
    if (p.init) c = c.filter(function (x) { return x[0].charAt(0).toUpperCase() === p.init; });
    c = c.filter(function (x) { return p.pitcher ? !x[2] : x[2]; });
    if (!p.pitcher && /^(C|1B|2B|3B|SS|LF|CF|RF)$/.test(p.pos)) {
      var byPos = c.filter(function (x) { return x[1].split('/').indexOf(p.pos) >= 0; });
      if (byPos.length) c = byPos;
    }
    if (!c.length) return null;
    c.sort(function (a, b) { return b[3] - a[3]; });
    if (c.length > 1 && c[0][3] < c[1][3] * 2) return null; // too close to call: no guessed face
    return { full: c[0][0], id: c[0][4] };
  }
  function shot(id, w) { return 'https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_' + (w || 213) + ',q_auto:best/v1/people/' + id + '/headshot/67/current'; }
  function face(p, w) {
    var f = p.hit;
    return f && f.id ? '<img src="' + shot(f.id, w) + '" alt="' + esc(f.full) + '" loading="lazy">' : '<div class="ini">' + esc((p.init || p.last.charAt(0)).toUpperCase()) + '</div>';
  }
  function full(p) { return p.hit ? p.hit.full : p.name; }

  // Play by play (plain text from The Show game log) -> halves, scoring plays, pitch counts, LOB, errors, game info
  function parseLog(log, names) {
    var L = { halves: [], plays: [], hrs: [], errs: { a: [], h: [] }, pc: { a: {}, h: {} }, amb: { a: {}, h: {} }, lob: { a: 0, h: 0 }, pitches: { a: 0, h: 0 }, info: {}, perfect: [], ok: false };
    if (!log) return L;
    var lines = String(log).split('\n'), inn = 0, cur = { a: '', h: '' }, k = 0;
    function sideOf(t) { return t === names.h ? 'h' : t === names.a ? 'a' : null; }
    for (var i = 0; i < lines.length; i++) {
      var ln = lines[i].trim(), m;
      if ((m = /^Inning (\d+):?$/.exec(ln))) { inn = +m[1]; continue; }
      if (inn && (m = /^(.+?) batting\.\s*(.*)$/.exec(ln))) {
        var bs = sideOf(m[1]) || (k % 2 ? 'h' : 'a'), fs = bs === 'a' ? 'h' : 'a', st = /Runs:\s*(\d+)\s+Hits:\s*(\d+)\s+Walks:\s*(\d+)\s+Errors:\s*(\d+)\s+Pitches:\s*(\d+)(?:\s+Runners Left On:\s*(\d+))?/.exec(lines[i + 1] || '');
        k++;
        var H = { inn: inn, side: bs, runs: st ? +st[1] : 0, pitches: st ? +st[5] : 0, lob: st && st[6] ? +st[6] : 0, plays: [] };
        var text = m[2].replace(/\.\*/g, '.\u0001'), ss = text.split(/(?<=[.\u0001])\s+(?=[A-Z0-9])/), thrown = cur[fs] ? [cur[fs]] : [], events = 0, last = null;
        ss.forEach(function (s) {
          var ga = /\u0001$/.test(s); s = s.replace(/[\u0001*]+$/, '').replace(/\.$/, '').trim(); if (!s) return;
          var pm = /^(.+?) pitching$/.exec(s);
          if (pm) { cur[fs] = pm[1]; if (!events) thrown = [pm[1]]; else thrown.push(pm[1]); return; }
          var sc = /^(.+?) scores$/.exec(s);
          if (sc) { if (last) { last.runs++; last.text += ', ' + sc[1] + ' scores'; } return; }
          events++;
          var play = { inn: inn, side: bs, text: s, runs: 0, ga: ga, pitcher: cur[fs] };
          var hm = /^(.+?) homered to (\w+)(?: \((\d+) feet\))?/.exec(s);
          if (hm) { play.runs = 1; L.hrs.push({ side: bs, who: hm[1], inn: inn, dir: hm[2], ft: hm[3] || '', off: cur[fs] }); }
          var em = /error by (.+?) \(E(\d+)\)/.exec(s);
          if (em) L.errs[fs].push(em[1]);
          H.plays.push(play); last = play;
        });
        var got = H.plays.reduce(function (s, p) { return s + p.runs; }, 0);
        H.exact = got === H.runs;
        if (thrown.length === 1) L.pc[fs][thrown[0]] = (L.pc[fs][thrown[0]] || 0) + H.pitches;
        else thrown.forEach(function (n) { L.amb[fs][n] = 1; });
        L.lob[bs] += H.lob; L.pitches[fs] += H.pitches;
        L.halves.push(H);
        if (st) i++;
        continue;
      }
      if ((m = /^(.+?) \(([\d,]+) ft elevation\)$/.exec(ln))) L.info.venue = m[1];
      else if ((m = /^Weather:\s*(.+)$/.exec(ln))) L.info.weather = m[1];
      else if (/^(No Wind|Wind\b.*)$/.test(ln)) L.info.wind = ln.replace(/^Wind:?\s*/, '');
      else if ((m = /^Maximum attendance:\s*([\d,]+)/.exec(ln))) L.info.att = m[1];
      else if ((m = /^Scheduled First Pitch:\s*(.+)$/.exec(ln))) L.info.first = m[1];
      else if ((m = /^Hitting Difficulty is (.+?)\.?$/.exec(ln))) L.info.diff = m[1];
      else if ((m = /^Game Scores:\s*(.+)$/.exec(ln))) L.info.gs = m[1];
      else if (/^HP:/.test(ln)) L.info.ump = ln;
      else if ((m = /^([A-Z][\w.' -]+): (\d+) mph \(/.exec(ln))) L.perfect.push(m[1] + ' ' + m[2] + ' mph');
    }
    L.ok = L.halves.length > 0;
    return L;
  }

  function render(g) {
    var A = g.away || {}, Hm = g.home || {}, ta = team(g, 'away'), th = team(g, 'home');
    var aT = A.team || 'Away', hT = Hm.team || 'Home', aA = abbr(aT), hA = abbr(hT);
    var aw = A.result === 'W', hw = Hm.result === 'W';
    var n = Math.max(num(g.box && g.box.innings) || 9, ta.r.length, th.r.length);
    var ar = ta.r.slice(), hr = th.r.slice();
    if (hw && (hr[n - 1] === '0' || hr[n - 1] == null || hr[n - 1] === '')) {
      var pre = hr.slice(0, n - 1).reduce(function (s, v) { return s + num(v); }, 0);
      if (pre > num(A.runs)) hr[n - 1] = 'X';
    }
    var LG = parseLog(g.box && g.box.log, { a: aT, h: hT });
    var sides = [
      { key: 'a', t: ta, name: aT, ab: aA, s: A, won: aw },
      { key: 'h', t: th, name: hT, ab: hA, s: Hm, won: hw }
    ];
    sides.forEach(function (S) {
      S.bat = (S.t.batting || []).map(function (b) { var p = parse(b.name, false); p.b = b; p.hit = find(p); p.score = num(b.h) * 2 + num(b.hr) * 4 + num(b.doubles) + num(b.triples) * 2 + num(b.rbi) * 1.5 + num(b.r) + num(b.bb) * 0.5 + num(b.sb) * 0.5; return p; });
      S.pit = (S.t.pitching || []).map(function (x) { var p = parse(x.name, true); p.b = x; p.hit = find(p); return p; });
      S.top = S.bat.slice().sort(function (a, b) { return b.score - a.score; })[0];
      if (S.top && S.top.score <= 0) S.top = null;
    });
    var Wn = aw ? sides[0] : sides[1], Ls = aw ? sides[1] : sides[0];
    function decP(d) { var all = sides[0].pit.concat(sides[1].pit); return all.filter(function (p) { return p.dec === d; })[0]; }
    var wp = decP('W'), lp = decP('L'), sv = decP('S');
    var rec = {}, re = /\b(W|L|SV):\s*([^,(]+)\(([^)]*)\)/g, m;
    while ((m = re.exec(String(g.pitchers || '')))) rec[m[1]] = m[3].split(',')[0].trim();
    function lname(p) { return plain(p.last); }
    function pcOf(S, p) {
      var key = Object.keys(LG.pc[S.key]).concat(Object.keys(LG.amb[S.key])).filter(function (x) { return plain(x) === lname(p); })[0];
      if (!key) return '';
      return LG.amb[S.key][key] ? '' : String(LG.pc[S.key][key]);
    }

    function hitLine(p) {
      var b = p.b, x = [num(b.h) + '-for-' + num(b.ab)];
      if (num(b.hr)) x.push((num(b.hr) > 1 ? num(b.hr) + ' ' : '') + 'HR');
      if (num(b.triples)) x.push((num(b.triples) > 1 ? num(b.triples) + ' ' : '') + '3B');
      if (num(b.doubles)) x.push((num(b.doubles) > 1 ? num(b.doubles) + ' ' : '') + '2B');
      if (num(b.rbi)) x.push(num(b.rbi) + ' RBI');
      if (num(b.r) && !num(b.hr)) x.push((num(b.r) > 1 ? num(b.r) + ' ' : '') + 'R');
      if (num(b.sb)) x.push((num(b.sb) > 1 ? num(b.sb) + ' ' : '') + 'SB');
      if (num(b.bb)) x.push((num(b.bb) > 1 ? num(b.bb) + ' ' : '') + 'BB');
      return x.join(', ');
    }
    function pitLine(p) { var b = p.b; return esc(b.ip) + ' IP, ' + esc(b.h) + ' H, ' + esc(b.er) + ' ER, ' + esc(b.so) + ' K'; }

    // header
    var played = String(g.played || '').split(' ')[0];
    function tm(S, cls) { return '<div class="sbx-tm ' + cls + '"><div class="n">' + esc(S.name) + '</div><div class="u">' + (S.s.member && S.s.member !== S.name ? '<a href="/profile/?user=' + encodeURIComponent(S.s.member) + '#gaming">' + esc(S.s.member) + '</a>' : (S.s.tag ? esc(S.s.tag) : '&nbsp;')) + '</div></div>'; }
    var head = '<tr><th></th>';
    for (var i = 1; i <= n; i++) head += '<th>' + i + '</th>';
    head += '<th class="t">R</th><th>H</th><th>E</th></tr>';
    function lrow(S, r) { var c = '<tr><td><span class="sbx-bdg s ' + S.key + '">' + esc(S.ab.charAt(0)) + '</span> ' + esc(S.ab) + '</td>'; for (var i = 0; i < n; i++) c += '<td>' + esc(r[i] != null ? r[i] : '') + '</td>'; return c + '<td class="t">' + esc(S.s.runs) + '</td><td>' + esc(S.s.hits) + '</td><td>' + esc(S.s.errors) + '</td></tr>'; }
    function hero(S, cls) {
      var p = S.top && S.top.hit && S.top.hit.id ? S.top : null;
      if (S === Wn && wp && wp.hit && wp.hit.id && !(p && p.score > 6)) p = wp;
      if (!p) p = S.bat.concat(S.pit).filter(function (x) { return x.hit && x.hit.id; })[0];
      return p ? '<img class="sbx-hero ' + cls + '" src="' + shot(p.hit.id, 420) + '" alt="' + esc(full(p)) + '">' : '';
    }
    function dec(lbl, p, r) { return p ? '<div><i>' + lbl + '</i>' + face(p, 80) + '<span><b>' + esc(full(p)) + '</b>' + (r ? ' (' + esc(r) + ')' : '') + '</span></div>' : ''; }
    var hd = '<div class="sbx-hd">' + hero(sides[0], 'l') + hero(sides[1], 'r') +
      '<div class="sbx-wm l">' + esc(aT) + '</div><div class="sbx-wm r">' + esc(hT) + '</div>' +
      '<div class="sbx-ctr"><div class="sbx-meta"><b>MLB The Show 26</b>' + esc(modeName(g.mode)) + ' &nbsp;|&nbsp; ' + esc(played) + '</div>' +
      '<div class="sbx-sc"><div class="sbx-bdg a">' + esc(aA) + '</div>' + tm(sides[0], 'l') + '<div class="sbx-big' + (aw ? '' : ' lo') + '">' + esc(A.runs) + '</div><div class="sbx-fin">FINAL</div><div class="sbx-big' + (hw ? '' : ' lo') + '">' + esc(Hm.runs) + '</div>' + tm(sides[1], 'r') + '<div class="sbx-bdg h">' + esc(hA) + '</div></div>' +
      '<div class="sbx-ls"><table><thead>' + head + '</thead><tbody>' + lrow(sides[0], ar) + lrow(sides[1], hr) + '</tbody></table></div>' +
      '<div class="sbx-dec">' + dec('W', wp, rec.W) + dec('L', lp, rec.L) + dec('SV', sv, '') + '</div></div></div>';
    var tabs = '<div class="sbx-tabs"><span>Box Score</span><a href="/mlb-the-show-stat-league/#leaderboard-preview">Standings</a><a href="/sports-gaming/mlb-the-show/">Stat Tracker</a><a href="/online-gaming/#autotrack">Latest Games</a></div>';

    // game summary: winner's story first, the loser's best effort framed as "in the loss"
    var sum = esc(Wn.name) + (Wn.key === 'a' ? ' won on the road at ' : ' beat ') + esc(Ls.name) + ' ' + esc(Wn.s.runs) + ' to ' + esc(Ls.s.runs) + '.';
    var gaPlay = null;
    LG.halves.forEach(function (H) { H.plays.forEach(function (p) { if (p.ga) gaPlay = p; }); });
    if (gaPlay && gaPlay.side === Wn.key) {
      var gh = /^(.+?) homered/.exec(gaPlay.text);
      sum += ' ' + (gh ? esc(gh[1]) + '’s home run in the ' + ord(gaPlay.inn) + ' put ' + esc(Wn.name) + ' ahead for good.' : esc(Wn.name) + ' took the lead for good in the ' + ord(gaPlay.inn) + ' (' + esc(gaPlay.text) + ').');
    }
    if (wp) sum += ' ' + esc(full(wp)) + ' earned the win with ' + pitLine(wp) + (sv ? ', and ' + esc(full(sv)) + ' closed it out for the save.' : '.');
    if (Wn.top) sum += ' ' + esc(full(Wn.top)) + ' paced the offense, going ' + esc(hitLine(Wn.top)) + '.';
    var lHr = Ls.bat.filter(function (p) { return num(p.b.hr) > 0; }).map(function (p) { return esc(p.last); });
    if (lHr.length) sum += ' ' + esc(Ls.name) + ' got ' + (lHr.length > 1 ? 'home runs from ' + listJoin(lHr) : 'a home run from ' + lHr[0]) + ' in the loss.';
    else if (Ls.top) sum += ' ' + esc(full(Ls.top)) + ' went ' + esc(hitLine(Ls.top)) + ' in the loss.';

    // key performers: winner's top bat, winning pitcher, loser's top bat
    var kp = [];
    function kcard(p, S, line) { return '<div class="sbx-kp">' + face(p, 160) + '<div><div class="nm">' + esc(full(p)) + '</div><div class="ps">' + esc(p.pitcher ? 'P' : p.pos) + ' &bull; ' + esc(S.ab) + '</div><div class="ln">' + line + '</div></div></div>'; }
    if (Wn.top) kp.push(kcard(Wn.top, Wn, esc(hitLine(Wn.top))));
    if (wp) kp.push(kcard(wp, Wn, pitLine(wp)));
    if (Ls.top) kp.push(kcard(Ls.top, Ls, esc(hitLine(Ls.top))));

    // MLB style notes under each table
    function cnt(list, f) { return list.filter(function (p) { return num(p.b[f]) > 0; }).map(function (p) { return esc(p.last) + (num(p.b[f]) > 1 ? ' ' + num(p.b[f]) : ''); }); }
    function note(lbl, arr) { return arr.length ? '<div><b>' + lbl + ':</b> ' + arr.join(', ') + '.</div>' : ''; }
    function batNotes(S) {
      var hrs = LG.ok ? LG.hrs.filter(function (h) { return h.side === S.key; }).map(function (h) { return esc(h.who) + ' (' + ord(h.inn) + (h.off ? ' off ' + esc(h.off) : '') + (h.ft ? ', ' + esc(h.ft) + ' ft' : '') + ')'; }) : cnt(S.bat, 'hr');
      var bat = note('2B', cnt(S.bat, 'doubles')) + note('3B', cnt(S.bat, 'triples')) + note('HR', hrs) + note('RBI', cnt(S.bat, 'rbi')) +
        note('SAC', cnt(S.bat, 'sh')) + note('SF', cnt(S.bat, 'sf')) + note('GIDP', cnt(S.bat, 'gidp')) + note('HBP', cnt(S.bat, 'hbp')) +
        (LG.ok ? '<div><b>Team LOB:</b> ' + LG.lob[S.key] + '.</div>' : '');
      var run = note('SB', cnt(S.bat, 'sb')) + note('CS', cnt(S.bat, 'cs'));
      var errs = LG.ok ? LG.errs[S.key].map(esc) : cnt(S.bat, 'e');
      var fld = note('E', errs) + note('PB', cnt(S.bat, 'pb'));
      return (bat || run || fld) ? '<div class="sbx-nt">' + (bat ? '<div class="h">Batting</div>' + bat : '') + (run ? '<div class="h">Baserunning</div>' + run : '') + (fld ? '<div class="h">Fielding</div>' + fld : '') + '</div>' : '';
    }
    function pitNotes(S) {
      var wpL = cnt(S.pit, 'wp');
      var pcs = S.pit.map(function (p) { var c = pcOf(S, p); return c ? esc(p.last) + ' ' + c : ''; }).filter(Boolean);
      var gs = [];
      if (LG.info.gs) LG.info.gs.split(/,\s*/).forEach(function (x) { var m = /^(\d+) \((.+)\)$/.exec(x.trim()); if (m && S.pit.some(function (p) { return plain(p.last) === plain(m[2]); })) gs.push(esc(m[2]) + ' ' + m[1]); });
      var body = note('WP', wpL) + note('Pitches', pcs.length ? pcs : []) + (LG.ok ? '<div><b>Team pitches:</b> ' + LG.pitches[S.key] + '.</div>' : '') + note('Game Score', gs);
      return body ? '<div class="sbx-nt">' + body + '</div>' : '';
    }

    // hitting tables
    function hit(S) {
      var rows = S.bat.map(function (p) {
        var b = p.b;
        return '<tr' + (p === S.top ? ' class="hi"' : '') + '><td>' + esc(b.name) + '</td><td>' + esc(b.ab) + '</td><td>' + esc(b.r) + '</td><td>' + esc(b.h) + '</td><td>' + esc(b.rbi) + '</td><td>' + esc(b.bb) + '</td><td>' + esc(b.so) + '</td><td>' + esc(b.hr) + '</td><td>' + avg(b.avg) + '</td></tr>';
      }).join('');
      var T = S.t.batting_totals || {};
      return '<div class="sbx-card"><div class="sbx-tw"><table class="sbx-st"><thead><tr><th><span class="sbx-bdg s ' + S.key + '">' + esc(S.ab.charAt(0)) + '</span> ' + esc(S.name) + ' Hitting</th><th>AB</th><th>R</th><th>H</th><th>RBI</th><th>BB</th><th>K</th><th>HR</th><th>AVG</th></tr></thead><tbody>' + rows +
        '<tr class="tot"><td>Totals</td><td>' + esc(T.ab) + '</td><td>' + esc(T.r) + '</td><td>' + esc(T.h) + '</td><td>' + esc(T.rbi) + '</td><td>' + esc(T.bb) + '</td><td>' + esc(T.so) + '</td><td>' + S.bat.reduce(function (s, p) { return s + num(p.b.hr); }, 0) + '</td><td></td></tr></tbody></table></div>' + batNotes(S) + '</div>';
    }
    // pitching, one table per team, decisions MLB style
    function pit(S) {
      var hasPc = LG.ok;
      var rows = S.pit.map(function (p) {
        var b = p.b, d = p.dec, tag = '';
        if (d === 'W' && rec.W) tag = 'W, ' + rec.W; else if (d === 'L' && rec.L) tag = 'L, ' + rec.L; else if (d) tag = d;
        return '<tr><td>' + esc(p.name) + (tag ? ' <span class="dc">(' + esc(tag) + ')</span>' : '') + '</td><td>' + esc(b.ip) + '</td><td>' + esc(b.h) + '</td><td>' + esc(b.r) + '</td><td>' + esc(b.er) + '</td><td>' + esc(b.bb) + '</td><td>' + esc(b.so) + '</td>' + (hasPc ? '<td>' + (pcOf(S, p) || '&ndash;') + '</td>' : '') + '<td>' + era(b.era) + '</td></tr>';
      }).join('');
      var T = S.t.pitching_totals || {};
      return '<div class="sbx-card"><div class="sbx-tw"><table class="sbx-st sbx-pt"><thead><tr><th><span class="sbx-bdg s ' + S.key + '">' + esc(S.ab.charAt(0)) + '</span> ' + esc(S.name) + ' Pitching</th><th>IP</th><th>H</th><th>R</th><th>ER</th><th>BB</th><th>K</th>' + (hasPc ? '<th>PC</th>' : '') + '<th>ERA</th></tr></thead><tbody>' + rows +
        '<tr class="tot"><td>Totals</td><td>' + esc(T.ip) + '</td><td>' + esc(T.h) + '</td><td>' + esc(T.r) + '</td><td>' + esc(T.er) + '</td><td>' + esc(T.bb) + '</td><td>' + esc(T.so) + '</td>' + (hasPc ? '<td>' + LG.pitches[S.key] + '</td>' : '') + '<td></td></tr></tbody></table></div>' + pitNotes(S) + '</div>';
    }
    // scoring summary: real scoring plays from the play by play, line score as fallback
    var inn = '', ra = 0, rh = 0;
    function irow(side, text, runs) {
      if (side === 'a') ra += runs; else rh += runs;
      var ab = side === 'a' ? aA : hA;
      return '<div class="ir"><span class="sbx-bdg s ' + side + '">' + esc(ab.charAt(0)) + '</span><span>' + text + '</span><span class="sc">' + esc(aA) + ' ' + ra + ', ' + esc(hA) + ' ' + rh + '</span></div>';
    }
    if (LG.ok) {
      var byInn = {};
      LG.halves.forEach(function (H) {
        if (!H.runs) return;
        var rows = '';
        if (H.exact) H.plays.forEach(function (p) { if (p.runs) rows += irow(H.side, esc(p.text) + '.', p.runs); });
        else rows = irow(H.side, (H.side === 'a' ? esc(aA) : esc(hA)) + ' ' + H.runs + ' run' + (H.runs > 1 ? 's' : ''), H.runs);
        byInn[H.inn] = (byInn[H.inn] || '') + rows;
      });
      Object.keys(byInn).sort(function (a, b) { return a - b; }).forEach(function (k) { inn += '<div class="ih">&#9662; ' + ord(+k) + ' Inning</div>' + byInn[k]; });
    } else {
      for (var q = 0; q < n; q++) {
        var x = num(ar[q]), y = hr[q] === 'X' ? 0 : num(hr[q]), lines = '';
        if (x) lines += irow('a', esc(aA) + ' ' + x + ' run' + (x > 1 ? 's' : ''), x);
        if (y) lines += irow('h', esc(hA) + ' ' + y + ' run' + (y > 1 ? 's' : ''), y);
        if (lines) inn += '<div class="ih">&#9662; ' + ord(q + 1) + ' Inning</div>' + lines;
      }
    }
    // game info, MLB style
    var I = LG.info, info = '';
    if (I.venue) info += '<div><b>Venue:</b> ' + esc(I.venue) + '.</div>';
    if (I.weather) info += '<div><b>Weather:</b> ' + esc(I.weather) + '.</div>';
    if (I.wind) info += '<div><b>Wind:</b> ' + esc(I.wind) + '.</div>';
    if (I.first) info += '<div><b>First pitch:</b> ' + esc(I.first) + '.</div>';
    if (I.att) info += '<div><b>Att:</b> ' + esc(I.att) + '.</div>';
    if (I.ump) info += '<div><b>Umpires:</b> ' + esc(I.ump.replace(/\.\s*$/, '')) + '.</div>';
    if (I.diff) info += '<div><b>Difficulty:</b> ' + esc(I.diff) + '.</div>';
    if (LG.perfect.length) info += '<div><b>Perfect contact:</b> ' + LG.perfect.map(esc).join(', ') + '.</div>';

    return hd + tabs + '<div class="sbx-body">' +
      '<div class="sbx-l"><div class="sbx-card"><h3>Game Summary</h3><div class="pad">' + sum + '</div></div>' +
      (kp.length ? '<div class="sbx-card"><h3>Key Performers</h3><div class="sbx-kps">' + kp.join('') + '</div></div>' : '') + '</div>' +
      '<div>' + hit(sides[0]) + hit(sides[1]) + '</div>' +
      '<div class="sbx-rt">' + (inn ? '<div class="sbx-card"><h3>Scoring Summary</h3><div class="sbx-inn">' + inn + '</div></div>' : '') +
      '<div>' + pit(sides[0]) + pit(sides[1]) + '</div>' +
      (info ? '<div class="sbx-card"><h3>Game Info</h3><div class="sbx-nt" style="border:0">' + info + '</div></div>' : '') + '</div>' +
      '</div>';
  }

  var ov = null, lastFocus = null, idxP = null;
  function loadIdx() { if (!idxP) idxP = fetch(IDX).then(function (r) { return r.ok ? r.json() : []; }).then(function (d) { IDXDATA = d; }).catch(function () { IDXDATA = []; }); return idxP; }
  function close() { if (ov) { ov.remove(); ov = null; document.documentElement.style.overflow = ''; if (lastFocus && lastFocus.focus) lastFocus.focus(); } }
  function open(id) {
    if (!document.getElementById('sbx-css')) { var st = document.createElement('style'); st.id = 'sbx-css'; st.textContent = css; document.head.appendChild(st); }
    close(); lastFocus = document.activeElement;
    ov = document.createElement('div'); ov.className = 'sbx-ov'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-label', 'Box score');
    ov.innerHTML = '<div class="sbx"><div class="sbx-msg">Loading box score&hellip;</div></div>';
    ov.addEventListener('click', function (e) { if (e.target === ov || (e.target.closest && e.target.closest('.sbx-x'))) close(); });
    document.body.appendChild(ov); document.documentElement.style.overflow = 'hidden';
    var X = '<button class="sbx-x" type="button" aria-label="Close box score">&times;</button>';
    Promise.all([fetch(API + encodeURIComponent(id)).then(function (r) { return r.ok ? r.json() : null; }), loadIdx()]).then(function (res) {
      if (!ov) return;
      var g = res[0] && res[0].game;
      ov.firstChild.innerHTML = X + (g && g.box ? render(g) : '<div class="sbx-msg">This box score is not available yet.</div>');
      ov.querySelector('.sbx-x').focus();
    }).catch(function () { if (ov) ov.firstChild.innerHTML = X + '<div class="sbx-msg">Box score could not load right now.</div>'; });
  }
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
  window.TMRShowBox = { open: open, close: close, render: render, _idx: function (d) { IDXDATA = d; } };
})();
