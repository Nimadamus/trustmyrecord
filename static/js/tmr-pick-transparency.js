/* PICK_INTEGRITY_20261001 (Nima): the profile "Pregame Record".
   Reads GET /api/transparency/users/:username. Shows how many picks this member
   registered before their games, by league and by day, the sealed snapshots and
   whether every one of those picks is still in the record. It never shows a
   selection, line or odds: the API does not send them. Mounts into
   #pregame-record (profile/index.html); does nothing on a page without it. */
(function () {
  'use strict';
  var API = 'https://trustmyrecord-api.onrender.com/api';
  var mount = document.getElementById('pregame-record');
  if (!mount) return;

  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function ptTime(iso) { return new Date(iso).toLocaleString('en-US', { timeZone: 'America/Los_Angeles', weekday: 'short', hour: 'numeric', minute: '2-digit' }) + ' PT'; }
  function dayLabel(ymd) {
    var d = new Date(ymd + 'T12:00:00Z');
    return d.toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' });
  }
  function leagues(list) { return (list || []).map(function (l) { return '<span class="tpr-lg"><b>' + l.count + '</b> ' + esc(l.label) + '</span>'; }).join(''); }
  var TYPE = { wager_corrected: 'Wager corrected', withdrawn: 'Withdrawn', restored: 'Restored', regraded: 'Regraded', visibility_changed: 'Visibility changed', units_added: 'Units added', voided: 'Voided' };

  var css = document.createElement('style');
  css.textContent = [
    '#pregame-record{margin:0 0 22px;border:1px solid var(--border-color,rgba(140,190,255,.18));border-radius:16px;background:var(--bg-card,#0E2034);color:var(--text-primary,#EEF4FB);padding:20px 22px;font-family:inherit}',
    '#pregame-record[hidden]{display:none}',
    '.tpr-hd{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px;margin-bottom:14px}',
    '.tpr-hd h2{margin:0;font-size:20px;font-weight:800;display:flex;align-items:center;gap:10px}',
    '.tpr-ok{display:inline-flex;align-items:center;gap:6px;border-radius:999px;padding:5px 11px;font-size:12px;font-weight:800;background:rgba(47,211,138,.13);color:#2FD38A;border:1px solid rgba(47,211,138,.35)}',
    '.tpr-hd a{font-size:13.5px;font-weight:700;color:var(--accent-blue,#4DA3FF);text-decoration:none}',
    '.tpr-grid{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,1.4fr);gap:16px}',
    '.tpr-today{border-radius:14px;padding:18px;background:linear-gradient(135deg,rgba(47,211,138,.10),rgba(77,163,255,.08));border:1px solid rgba(47,211,138,.25)}',
    '.tpr-k{font-size:12px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--text-secondary,#8299B2)}',
    '.tpr-big{display:flex;align-items:baseline;gap:10px;margin:8px 0 10px}',
    '.tpr-big b{font-size:52px;line-height:.9;font-weight:900;font-variant-numeric:tabular-nums}',
    '.tpr-big span{font-size:16px;font-weight:700;color:var(--text-secondary,#B9C9DB);line-height:1.3}',
    '.tpr-lgs{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px}',
    '.tpr-lg{border-radius:8px;padding:5px 9px;font-size:13px;font-weight:700;background:rgba(77,163,255,.14);border:1px solid rgba(77,163,255,.3)}',
    '.tpr-acc{font-size:14.5px;font-weight:700}',
    '.tpr-acc .g{color:#2FD38A}.tpr-acc .r{color:#FF6B6B}',
    '.tpr-sec{margin-top:4px}',
    '.tpr-tbl{width:100%;border-collapse:collapse;font-size:13.5px}',
    '.tpr-tbl th,.tpr-tbl td{text-align:left;padding:8px 6px;border-bottom:1px solid var(--border-color,rgba(140,190,255,.14));white-space:nowrap}',
    '.tpr-tbl th{font-size:11.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--text-secondary,#8299B2);font-weight:800}',
    '.tpr-tbl td.ok{color:#2FD38A;font-weight:800}.tpr-tbl td.bad{color:#FF6B6B;font-weight:800}',
    '.tpr-snaps{margin-top:16px;display:grid;gap:8px}',
    '.tpr-snap{display:flex;flex-wrap:wrap;align-items:center;gap:6px 12px;font-size:13.5px;padding:9px 12px;border-radius:10px;background:var(--bg-card-hover,rgba(255,255,255,.04))}',
    '.tpr-snap a{margin-left:auto;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;color:var(--accent-blue,#4DA3FF);text-decoration:none}',
    '.tpr-note{margin-top:14px;font-size:13px;color:var(--text-secondary,#8299B2);line-height:1.5}',
    '.tpr-corr{margin-top:8px;display:grid;gap:6px;font-size:13px}',
    '.tpr-scroll{overflow-x:auto}',
    '@media (max-width:860px){.tpr-grid{grid-template-columns:1fr}#pregame-record{padding:16px}.tpr-big b{font-size:44px}}'
  ].join('\n');
  document.head.appendChild(css);

  function render(d) {
    var t = d.today;
    var active = d.days.filter(function (x) { return x.registered > 0; }).slice(0, 7);
    var todayBlock = t.registered_pregame > 0
      ? '<div class="tpr-big"><b>' + t.registered_pregame + '</b><span>' + (t.registered_pregame === 1 ? 'pick' : 'picks') + ' registered before game time for today’s games</span></div>' +
        '<div class="tpr-lgs">' + leagues(t.leagues) + '</div>' +
        '<div class="tpr-acc"><span class="' + (t.withdrawn ? 'r' : 'g') + '">' + t.accounted_for + ' of ' + t.registered + ' accounted for in the record</span>' +
        ' &middot; ' + t.settled + ' graded &middot; ' + t.pending + ' pending' + (t.void ? ' &middot; ' + t.void + ' void' : '') + (t.withdrawn ? ' &middot; ' + t.withdrawn + ' withdrawn' : '') + '</div>'
      : '<div class="tpr-big"><b>0</b><span>picks registered yet for today’s games</span></div><div class="tpr-acc">Picks appear here the moment they are locked, before kickoff.</div>';

    var days = active.length
      ? '<div class="tpr-scroll"><table class="tpr-tbl"><thead><tr><th>Day</th><th>Pregame</th><th>Leagues</th><th>Graded</th><th>Pending</th><th>Accounted for</th></tr></thead><tbody>' +
        active.map(function (x) {
          var all = x.withdrawn === 0;
          return '<tr><td>' + esc(dayLabel(x.date)) + '</td><td>' + x.registered_pregame + '</td><td>' + x.leagues.map(function (l) { return l.count + ' ' + esc(l.label); }).join(', ') +
            '</td><td>' + x.settled + (x.void ? ' + ' + x.void + ' void' : '') + '</td><td>' + x.pending + '</td><td class="' + (all ? 'ok' : 'bad') + '">' + x.accounted_for + ' of ' + x.registered + '</td></tr>';
        }).join('') + '</tbody></table></div>'
      : '<p class="tpr-note">No picks in the last two weeks.</p>';

    var snaps = (d.snapshots || []).slice(0, 5).map(function (s) {
      return '<div class="tpr-snap"><b>' + esc(ptTime(s.taken_at)) + '</b><span>' + s.pending_count + ' pending (' + s.leagues.map(function (l) { return l.count + ' ' + esc(l.label); }).join(' · ') + ')</span>' +
        '<span class="' + (s.now.withdrawn ? 'bad' : '') + '" style="color:' + (s.now.withdrawn ? '#FF6B6B' : '#2FD38A') + ';font-weight:800">' + s.now.accounted_for + ' of ' + s.pending_count + ' still in the record</span>' +
        '<a href="/pending-picks/?snapshot=' + s.id + '" title="Open this sealed snapshot">' + (s.commitment_verified ? '✓ ' : '') + '#' + esc(String(s.commitment).slice(0, 10)) + '</a></div>';
    }).join('');

    var corr = d.corrections && d.corrections.length
      ? '<div class="tpr-note"><b>Logged changes after game start</b><div class="tpr-corr">' + d.corrections.slice(0, 10).map(function (c) {
          return '<div>Pick #' + c.pick_id + ' &middot; ' + esc(TYPE[c.type] || c.type) + ' &middot; ' + esc(ptTime(c.at)) + (c.reason ? ' &middot; ' + esc(c.reason) : '') + '</div>';
        }).join('') + '</div></div>'
      : '<p class="tpr-note">No picks were changed, hidden or withdrawn after their games started.</p>';

    mount.innerHTML =
      '<div class="tpr-hd"><h2>Pregame Record <span class="tpr-ok">✓ Verified Pregame</span></h2><a href="/pending-picks/">Everyone’s pending picks →</a></div>' +
      '<div class="tpr-grid"><div class="tpr-today"><div class="tpr-k">Today, Pacific time</div>' + todayBlock + '</div>' +
      '<div class="tpr-sec"><div class="tpr-k" style="margin-bottom:6px">Last 7 game days</div>' + days + '</div></div>' +
      (snaps ? '<div class="tpr-snaps"><div class="tpr-k">Sealed snapshots</div>' + snaps + '</div>' : '') +
      corr +
      (d.record_reset_at ? '<p class="tpr-note">This member reset their public record on ' + esc(new Date(d.record_reset_at).toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles', dateStyle: 'medium' })) + '. Every pick from before the reset is still in the ledger.</p>' : '') +
      '<p class="tpr-note">Picks stay private until they are graded. A pick registered before its game cannot be edited or removed once the game starts.</p>';
    mount.hidden = false;
    if (location.hash === '#pregame-record') { try { mount.scrollIntoView({ block: 'start' }); } catch (_) {} }
  }

  var tries = 0;
  function user() {
    var u = typeof window.TMR_DRILL_USER === 'function' ? window.TMR_DRILL_USER() : '';
    if (!u) { var q = new URLSearchParams(location.search); u = q.get('user') || q.get('username') || ''; }
    if (!u) { var m = location.pathname.match(/^\/u\/([^/?#]+)/i); if (m) u = decodeURIComponent(m[1]); }
    return u;
  }
  function start() {
    var u = user();
    if (!u) { if (++tries < 40) setTimeout(start, 500); return; }
    fetch(API + '/transparency/users/' + encodeURIComponent(u), { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(render)
      .catch(function () { /* module omitted when unavailable */ });
  }
  start();
})();
