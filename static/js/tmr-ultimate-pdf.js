/* ULTIMATE_PDF_20261103: Performance Intelligence report as a downloadable PDF.
   Built in the browser from the same /api/ultimate/intelligence response the report page draws,
   so every number in the PDF is the server's figure for the member's own graded picks. Nothing is
   estimated or typed in here. jsPDF and its table plugin load from cdnjs only when the member asks
   for the PDF. Public API: window.TMRUltimatePdf.download(report, { name }) -> Promise. */
(function () {
  'use strict';
  var LIBS = [
    'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js'
  ];
  var NAVY = [10, 26, 51], INK = [11, 27, 48], BODY = [58, 78, 102], MUTED = [94, 112, 136];
  var BLUE = [30, 99, 240], GOLD = [217, 169, 46], LINE = [220, 228, 238], SOFT = [245, 247, 251];
  var GOOD = [15, 123, 75], BAD = [180, 35, 24];

  function load(src) {
    return new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = src; s.async = false; s.onload = res; s.onerror = function () { rej(new Error('load ' + src)); };
      document.head.appendChild(s);
    });
  }
  var ready = null;
  function libs() {
    if (window.jspdf && window.jspdf.jsPDF && window.jspdf.jsPDF.API.autoTable) return Promise.resolve();
    if (!ready) ready = load(LIBS[0]).then(function () { return load(LIBS[1]); });
    return ready;
  }

  /* number formats, matching the report page */
  function num(v) { return v === null || v === undefined || v === '' || !isFinite(Number(v)) ? null : Number(v); }
  function units(v) { v = num(v); return v === null ? 'n/a' : (v > 0 ? '+' : v < 0 ? '-' : '') + Math.abs(v).toFixed(1) + 'u'; }
  function pct(v, d) { v = num(v); if (v === null) return 'n/a'; if (Math.abs(v) <= 1.5) v = v * 100; return v.toFixed(d == null ? 1 : d) + '%'; }
  function spct(v) { v = num(v); if (v === null) return 'n/a'; if (Math.abs(v) <= 1.5) v = v * 100; return (v > 0 ? '+' : v < 0 ? '-' : '') + Math.abs(v).toFixed(1) + '%'; }
  function rec(c) { if (!c) return 'n/a'; return (c.w || 0) + '-' + (c.l || 0) + (c.p ? '-' + c.p : ''); }
  function int(v) { v = num(v); return v === null ? 'n/a' : Math.round(v).toLocaleString('en-US'); }
  function clean(t) { return String(t == null ? '' : t).replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, ', ').replace(/−/g, '-').replace(/±/g, '+/-').replace(/[^\x09\x0A\x0D\x20-\x7E -ÿ]/g, ''); }
  function day(iso) { var d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/Los_Angeles' }); }
  function verdict(c) { return c && c.verdict && c.verdict.label ? clean(c.verdict.label) : ''; }
  function tone(v) { v = num(v); return v === null || v === 0 ? INK : v > 0 ? GOOD : BAD; }

  function build(r, opts) {
    var jsPDF = window.jspdf.jsPDF;
    var doc = new jsPDF({ unit: 'pt', format: 'letter' });
    var W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 44, CW = W - 2 * M;
    var y = 0;
    var o = r.overall || {};

    function ensure(h) { if (y + h > H - 56) { doc.addPage(); y = 56; } }
    function heading(t, sub) {
      ensure(sub ? 120 : 100);
      y += 14;
      doc.setFillColor.apply(doc, BLUE); doc.rect(M, y - 9, 3, 14, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor.apply(doc, INK);
      doc.text(t.toUpperCase(), M + 10, y + 2);
      y += 14;
      if (sub) { doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor.apply(doc, MUTED); var l = doc.splitTextToSize(clean(sub), CW); doc.text(l, M, y + 4); y += l.length * 11 + 2; }
      y += 4;
    }
    function para(t, size, color, indent) {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(size || 9.5); doc.setTextColor.apply(doc, color || BODY);
      var lines = doc.splitTextToSize(clean(t), CW - (indent || 0));
      var lh = (size || 9.5) * 1.4;
      for (var i = 0; i < lines.length; i++) { ensure(lh); doc.text(lines[i], M + (indent || 0), y + (size || 9.5)); y += lh; }
    }
    function bullet(t) {
      ensure(14);
      doc.setFillColor.apply(doc, GOLD); doc.circle(M + 3, y + 6.5, 1.8, 'F');
      para(t, 9.5, BODY, 12);
      y += 3;
    }
    function table(head, body, colStyles) {
      if (!body.length) return;
      ensure(70);
      doc.autoTable({
        startY: y, head: [head], body: body, margin: { left: M, right: M, top: 56, bottom: 56 },
        theme: 'grid', styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 5, textColor: INK, lineColor: LINE, lineWidth: 0.6, overflow: 'linebreak' },
        headStyles: { fillColor: NAVY, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
        alternateRowStyles: { fillColor: SOFT }, columnStyles: colStyles || {},
        didParseCell: function (d) {
          if (d.section === 'body' && d.cell.raw && typeof d.cell.raw === 'object' && d.cell.raw.color) d.cell.styles.textColor = d.cell.raw.color;
        }
      });
      y = doc.lastAutoTable.finalY + 10;
    }
    function catRows(list, limit) {
      return (list || []).slice(0, limit || 40).map(function (c) {
        return [clean(c.key), int(c.n), rec(c), { content: units(c.net), color: tone(c.net) }, { content: spct(c.roi), color: tone(c.roi) }, pct(c.win_pct), pct(c.break_even_pct), verdict(c)];
      });
    }
    var CAT_HEAD = ['', 'Picks', 'Record', 'Units', 'ROI', 'Win rate', 'Break-even', 'Assessment'];
    var CAT_COLS = { 0: { cellWidth: 118, fontStyle: 'bold' }, 1: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' }, 7: { cellWidth: 124 } };

    /* ---- cover band ---- */
    doc.setFillColor.apply(doc, NAVY); doc.rect(0, 0, W, 132, 'F');
    doc.setFillColor.apply(doc, BLUE); doc.rect(0, 132, W * 0.62, 3, 'F');
    doc.setFillColor.apply(doc, GOLD); doc.rect(W * 0.62, 132, W * 0.38, 3, 'F');
    doc.setTextColor(156, 193, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
    doc.text('TRUSTMYRECORD  |  TMR ULTIMATE', M, 42);
    doc.setTextColor(255, 255, 255); doc.setFontSize(24);
    doc.text('Performance Intelligence Report', M, 72);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(201, 215, 234);
    var gf = r.generated_from || {};
    var who = opts && opts.name ? 'Prepared for ' + clean(opts.name) + '.  ' : '';
    doc.text(who + 'Built from ' + int(o.n) + ' graded picks' + (gf.first && gf.last ? ', ' + day(gf.first) + ' to ' + day(gf.last) : '') + '.', M, 96);
    doc.text('Generated ' + (r.generated_at ? new Date(r.generated_at).toLocaleString('en-US', { timeZone: 'America/Los_Angeles', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' PT' : day(Date.now())) + '.  Graded on the final score by TrustMyRecord.', M, 112);
    y = 160;

    /* ---- key figures ---- */
    var tiles = [
      ['Record', rec(o), INK], ['Units', units(o.net), tone(o.net)], ['ROI', spct(o.roi), tone(o.roi)],
      ['Win rate', pct(o.win_pct), INK], ['Break-even at your prices', pct(o.break_even_pct), INK], ['Units risked', units(o.risked).replace('+', ''), INK]
    ];
    var tw = (CW - 5 * 8) / 6;
    tiles.forEach(function (t, i) {
      var x = M + i * (tw + 8);
      doc.setFillColor.apply(doc, SOFT); doc.setDrawColor.apply(doc, LINE); doc.roundedRect(x, y, tw, 56, 6, 6, 'FD');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(6.8); doc.setTextColor.apply(doc, MUTED);
      doc.text(doc.splitTextToSize(t[0].toUpperCase(), tw - 12), x + 7, y + 13);
      doc.setFontSize(13); doc.setTextColor.apply(doc, t[2]); doc.text(t[1], x + 7, y + 44);
    });
    y += 70;
    if (o.verdict && o.verdict.label) {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor.apply(doc, INK);
      doc.text('Overall assessment: ' + clean(o.verdict.label), M, y + 4); y += 14;
    }
    if (num(o.beat_close_pct) !== null && o.clv_moved) { para('Price against the close: ' + pct(o.beat_close_pct, 0) + ' of ' + int(o.clv_moved) + ' picks whose line moved were taken at a better price than the close.', 9, MUTED); }

    /* ---- evaluation ---- */
    if (r.evaluation && r.evaluation.length) { heading('Overall performance'); r.evaluation.forEach(bullet); }
    if (r.summary && r.summary.length) {
      heading('Key findings');
      table(['Area', 'Reading', 'What it means'], r.summary.map(function (s) {
        var c = s.tone === 'pos' ? GOOD : s.tone === 'neg' ? BAD : INK;
        return [clean(s.k), { content: clean(s.v), color: c }, clean(s.text)];
      }), { 0: { cellWidth: 110, fontStyle: 'bold' }, 1: { cellWidth: 120 } });
    }

    /* ---- breakdowns ---- */
    if (r.by_sport && r.by_sport.length) { heading('Sport by sport'); table(['Sport'].concat(CAT_HEAD.slice(1)), catRows(r.by_sport), CAT_COLS); }
    if (r.by_market && r.by_market.length) { heading('By bet type'); table(['Bet type'].concat(CAT_HEAD.slice(1)), catRows(r.by_market), CAT_COLS); }
    if (r.by_odds && r.by_odds.length) { heading('By price range'); table(['Price range'].concat(CAT_HEAD.slice(1)), catRows(r.by_odds), CAT_COLS); }

    var minS = (r.method && r.method.min_sample) || 30;
    if ((r.strengths && r.strengths.length) || (r.weaknesses && r.weaknesses.length)) {
      heading('Strengths and weaknesses', 'Categories with at least ' + minS + ' graded picks, ranked by the evidence. "Not yet conclusive" means the result could still be chance at this sample size.');
      if (r.strengths && r.strengths.length) { ensure(90); para('Strengths', 10, GOOD); y += 2; table(['Category'].concat(CAT_HEAD.slice(1)), catRows(r.strengths, 10), CAT_COLS); }
      if (r.weaknesses && r.weaknesses.length) { ensure(90); para('Weaknesses', 10, BAD); y += 2; table(['Category'].concat(CAT_HEAD.slice(1)), catRows(r.weaknesses, 10), CAT_COLS); }
    }

    /* ---- trends ---- */
    var tr = r.trend || {};
    if (tr.last_90_days || (r.monthly && r.monthly.length)) {
      heading('Trends');
      var trows = [];
      if (tr.before && tr.before.n) trows.push(['Before the last 90 days', int(tr.before.n), rec(tr.before), { content: units(tr.before.net), color: tone(tr.before.net) }, { content: spct(tr.before.roi), color: tone(tr.before.roi) }, pct(tr.before.win_pct)]);
      if (tr.last_90_days && tr.last_90_days.n) trows.push(['Last 90 days', int(tr.last_90_days.n), rec(tr.last_90_days), { content: units(tr.last_90_days.net), color: tone(tr.last_90_days.net) }, { content: spct(tr.last_90_days.roi), color: tone(tr.last_90_days.roi) }, pct(tr.last_90_days.win_pct)]);
      table(['Period', 'Picks', 'Record', 'Units', 'ROI', 'Win rate'], trows, { 0: { fontStyle: 'bold' }, 1: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' } });
      if (r.monthly && r.monthly.length) {
        table(['Month', 'Picks', 'Record', 'Units', 'ROI', 'Running total'], r.monthly.slice(-18).map(function (m) {
          return [clean(m.key), int(m.n), rec(m), { content: units(m.net), color: tone(m.net) }, { content: spct(m.roi), color: tone(m.roi) }, { content: units(m.cumulative), color: tone(m.cumulative) }];
        }), { 0: { fontStyle: 'bold' }, 1: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' } });
      }
    }

    /* ---- plan ---- */
    if (r.plan && r.plan.length) {
      heading('Your improvement plan', 'Built only from the findings that cleared the statistical bar. Each step is measured over your next picks on the report page.');
      r.plan.forEach(function (p, i) {
        ensure(30);
        doc.setFillColor.apply(doc, NAVY); doc.circle(M + 8, y + 7, 8, 'F');
        doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor.apply(doc, GOLD); doc.text(String(i + 1), M + 8, y + 10, { align: 'center' });
        doc.setTextColor.apply(doc, INK); doc.setFontSize(10);
        var tl = doc.splitTextToSize(clean(p.title), CW - 24); doc.text(tl, M + 24, y + 10); y += tl.length * 13 + 2;
        if (p.detail) para(p.detail, 9, BODY, 24);
        y += 6;
      });
    }

    /* ---- noise ---- */
    var noise = (r.insights && r.insights.within_noise) || [];
    if (noise.length) {
      heading('Differences that are still within chance', 'Gaps that look large but that this sample cannot separate from luck. Do not change your betting because of these yet.');
      noise.slice(0, 8).forEach(function (n) { bullet(n.text || ''); });
    }

    /* ---- method ---- */
    var me = r.method || {};
    heading('Methodology and sample size');
    para('Every figure comes from your own picks as graded on the final score by TrustMyRecord, at the price you took. A category gets an assessment only once it has ' + minS + ' graded picks. Results are compared with the break-even rate of the prices you paid, and comparisons are adjusted for how many were tested, so a run of wins or losses is not reported as skill or a leak unless chance is an unlikely explanation.', 9, BODY);
    y += 4;
    [['Significance', me.significance], ['Luck', me.luck], ['Price against the close', me.clv], ['Leaks', me.leaks], ['Stake sizing', me.sizing], ['Robustness', me.robustness], ['Patterns', me.patterns], ['Not claimed', me.not_claimed]].forEach(function (m) {
      if (!m[1]) return;
      ensure(24);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor.apply(doc, INK); doc.text(m[0], M, y + 9); y += 12;
      para(m[1], 8.5, BODY); y += 3;
    });
    y += 4;
    para('Research on your own record, not betting advice. Past results do not predict future results. Sports betting involves risk of loss. If you or someone you know needs help with gambling, call 1-800-GAMBLER.', 8, MUTED);

    /* ---- footer on every page ---- */
    var pages = doc.internal.getNumberOfPages();
    for (var p = 1; p <= pages; p++) {
      doc.setPage(p);
      doc.setDrawColor.apply(doc, LINE); doc.line(M, H - 38, W - M, H - 38);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor.apply(doc, MUTED);
      doc.text('TrustMyRecord.com  |  TMR Ultimate Performance Intelligence', M, H - 24);
      doc.text('Page ' + p + ' of ' + pages, W - M, H - 24, { align: 'right' });
    }
    return doc;
  }

  function fileName(r) {
    var d = r && r.generated_at ? new Date(r.generated_at) : new Date();
    var s = d.toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
    return 'TMR-Performance-Intelligence-' + s + '.pdf';
  }

  window.TMRUltimatePdf = {
    build: function (r, opts) { return libs().then(function () { return build(r, opts || {}); }); },
    download: function (r, opts) {
      return libs().then(function () {
        var doc = build(r, opts || {});
        doc.save(fileName(r));
        return true;
      });
    },
    fileName: fileName
  };
})();
