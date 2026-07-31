/* Public awards renderer for crawlable /u/<username>/ profiles. */
(function () {
  'use strict';

  var mount = document.getElementById('uAwards') || document.getElementById('uPublicAwards');
  if (!mount) return;
  var username = window.__TMR_PROFILE_USERNAME;
  if (!username) {
    var match = location.pathname.match(/^\/u\/([^/]+)/i);
    username = match ? decodeURIComponent(match[1]) : '';
  }
  if (!username) return;

  var api = (window.CONFIG && window.CONFIG.api && window.CONFIG.api.baseUrl) ||
    'https://trustmyrecord-api.onrender.com/api';

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function num(value) {
    var parsed = Number(value);
    return isFinite(parsed) ? parsed : null;
  }
  function signed(value, suffix) {
    var parsed = num(value);
    return parsed == null ? '' : (parsed > 0 ? '+' : '') + parsed.toFixed(2) + suffix;
  }
  function period(award) {
    if (award.period_label) return award.period_label;
    var month = num(award.awarded_for_month);
    var year = num(award.awarded_for_year);
    if (month && year) return new Date(Date.UTC(year, month - 1, 1)).toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    return 'Special Recognition';
  }
  function details(award) {
    var meta = award.metadata || {}, out = [];
    if (meta.record) out.push(String(meta.record));
    else if (meta.wins != null || meta.losses != null) out.push(Number(meta.wins || 0) + '-' + Number(meta.losses || 0) + (meta.pushes != null ? '-' + Number(meta.pushes || 0) : '') + ' record');
    if (meta.graded != null) out.push('Record: ' + Number(meta.graded) + ' graded picks');
    if (meta.net_units != null) out.push(signed(meta.net_units, ' units'));
    if (meta.roi_pct != null) out.push(signed(meta.roi_pct, '% ROI'));
    if (!out.length && award.description) out.push(award.description);
    return out;
  }
  function badge() {
    return '<span class="u-award-badge" aria-hidden="true"><svg viewBox="0 0 64 64" fill="none">' +
      '<path d="M19 10h26v14c0 9-5.8 16-13 16S19 33 19 24V10Z" fill="url(#uAwardGold)"/>' +
      '<path d="M19 15H9c0 8 3.4 13 10.4 14.7M45 15h10c0 8-3.4 13-10.4 14.7M29 40h6v8h-6zM21 50h22l3 7H18l3-7Z" stroke="#ffe58a" stroke-width="3" stroke-linejoin="round"/>' +
      '<path d="M25 50h14" stroke="#fff6c2" stroke-width="2" stroke-linecap="round"/>' +
      '<defs><linearGradient id="uAwardGold" x1="32" y1="10" x2="32" y2="40" gradientUnits="userSpaceOnUse"><stop stop-color="#fff2a6"/><stop offset=".45" stop-color="#f6c453"/><stop offset="1" stop-color="#a96b12"/></linearGradient></defs>' +
      '</svg></span>';
  }
  function injectCSS() {
    if (document.getElementById('u-awards-css')) return;
    var style = document.createElement('style');
    style.id = 'u-awards-css';
    style.textContent = '.u-awards{margin-top:26px;background:linear-gradient(145deg,rgba(17,24,39,.98),rgba(7,10,18,.98));border:1px solid rgba(255,215,0,.24);border-radius:16px;padding:20px}.u-awards-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px}.u-awards h2{margin:0;font-family:Barlow,Inter,sans-serif;font-size:21px}.u-awards-kicker{color:#aab6c9;font-size:12px;margin:4px 0 0}.u-awards-count{color:#ffd86a;font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}.u-award-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px}.u-award-card{display:grid;grid-template-columns:58px 1fr;gap:12px;align-items:center;min-height:92px;padding:13px;border-radius:13px;background:rgba(255,255,255,.035);border:1px solid rgba(255,215,0,.18)}.u-award-badge{display:grid;place-items:center;width:54px;height:54px;border-radius:50%;background:radial-gradient(circle at 35% 25%,rgba(255,244,180,.28),rgba(255,193,7,.06) 62%,transparent 63%);border:1px solid rgba(255,215,0,.35)}.u-award-badge svg{width:42px;height:42px}.u-award-name{color:#f8fafc;font-weight:800;font-size:15px;line-height:1.25}.u-award-period{color:#ffd86a;font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;margin-top:4px}.u-award-stats{color:#b7c2d4;font-size:12px;line-height:1.5;margin-top:5px}.u-award-stat{white-space:nowrap}.u-award-stat + .u-award-stat::before{content:" · ";color:#68758b}@media(max-width:560px){.u-awards{padding:16px}.u-award-grid{grid-template-columns:1fr}}';
    document.head.appendChild(style);
  }
  function render(awards) {
    injectCSS();
    if (!awards.length) { mount.hidden = true; return; }
    mount.hidden = false;
    var grid = mount.querySelector('.u-award-grid');
    if (!grid) return;
    var count = mount.querySelector('.u-awards-count');
    if (count) count.textContent = awards.length + (awards.length === 1 ? ' award' : ' awards');
    grid.innerHTML = awards.map(function (award) {
      var stats = details(award);
      return '<article class="u-award-card">' + badge() + '<div><div class="u-award-name">' + esc(award.title || 'TrustMyRecord Award') + '</div>' +
        '<div class="u-award-period">' + esc(period(award)) + '</div>' +
        (stats.length ? '<div class="u-award-stats">' + stats.map(function (item) { return '<span class="u-award-stat">' + esc(item) + '</span>'; }).join('') + '</div>' : '') +
        '</div></article>';
    }).join('');
  }
  fetch(api + '/awards/user/' + encodeURIComponent(username), { headers: { Accept: 'application/json' }, cache: 'no-store' })
    .then(function (response) { return response.ok ? response.json() : null; })
    .then(function (data) {
      var seen = {}, awards = [];
      (data && Array.isArray(data.awards) ? data.awards : []).forEach(function (award) {
        var key = award.id != null ? 'id:' + award.id : [award.title, award.period_label, award.awarded_at].join('|');
        if (!seen[key]) { seen[key] = true; awards.push(award); }
      });
      render(awards);
    })
    .catch(function () { /* keep the server-rendered cards visible if the API is unavailable */ });
})();
