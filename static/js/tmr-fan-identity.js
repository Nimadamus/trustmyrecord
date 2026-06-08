/* TrustMyRecord - Sports Fan Identity (Phase 1)
 * Self-contained, additive. Renders the sports-identity card on a profile and,
 * for the profile owner, a by-sport favorite/rival team editor.
 * Profile-first MVP: emphasizes "your verified sports fan profile", not empty rooms.
 */
(function () {
  'use strict';
  if (window.__tmrFanIdentity) return;
  window.__tmrFanIdentity = true;

  function apiBase() {
    try { if (window.api && window.api.baseUrl) return String(window.api.baseUrl).replace(/\/$/, ''); } catch (e) {}
    return (window.TMR_API_BASE || window.API_BASE_URL || 'https://trustmyrecord-api.onrender.com').replace(/\/$/, '');
  }

  var catalogPromise = null;
  function getCatalog() {
    if (!catalogPromise) {
      catalogPromise = fetch(apiBase() + '/api/teams/catalog')
        .then(function (r) { return r.json(); })
        .catch(function () { return { sports: [] }; });
    }
    return catalogPromise;
  }

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function teamHref(name, catalog) {
    if (!catalog || !catalog.sports) return null;
    for (var i = 0; i < catalog.sports.length; i++) {
      var s = catalog.sports[i];
      for (var j = 0; j < s.teams.length; j++) {
        if (s.teams[j].name === name) return '/teams/?sport=' + s.sportSlug + '&team=' + s.teams[j].slug;
      }
    }
    return null;
  }

  function chips(names, catalog, cls) {
    if (!names || !names.length) return '<span class="tmr-fi-empty">None yet</span>';
    return names.map(function (n) {
      var href = teamHref(n, catalog);
      var inner = '<span class="tmr-fi-chip ' + cls + '">' + esc(n) + '</span>';
      return href ? '<a href="' + href + '" style="text-decoration:none">' + inner + '</a>' : inner;
    }).join(' ');
  }

  function isOwner(p) {
    try {
      return !!(window.currentUser && window.currentUser.username && p && p.username &&
        window.currentUser.username.toLowerCase() === p.username.toLowerCase());
    } catch (e) { return false; }
  }

  var PERSONALITIES = ['analyst', 'homer', 'contrarian', 'sharp', 'degenerate', 'casual', 'historian', 'optimist', 'realist'];

  function recordCard(title, value, sub, isPlaceholder) {
    return '<div class="tmr-fi-stat' + (isPlaceholder ? ' is-soon' : '') + '">' +
      '<div class="tmr-fi-stat-label">' + esc(title) + '</div>' +
      '<div class="tmr-fi-stat-value">' + value + '</div>' +
      (sub ? '<div class="tmr-fi-stat-sub">' + sub + '</div>' : '') +
      '</div>';
  }

  function render(p, catalog) {
    var owner = isOwner(p);
    var fav = Array.isArray(p.favorite_teams) ? p.favorite_teams : [];
    var rivals = Array.isArray(p.rival_teams) ? p.rival_teams : [];
    var badges = Array.isArray(p.badges) ? p.badges : [];
    if (p.is_founding_member && !badges.some(function (b) { return b && b.id === 'founding_member'; })) {
      badges = [{ id: 'founding_member', label: 'Founding Member', icon: 'fa-medal' }].concat(badges);
    }
    var vr = p.verified_record || { record: (p.wins || 0) + '-' + (p.losses || 0), net_units: p.net_units, roi: p.roi };
    var netU = (vr.net_units == null ? 0 : Number(vr.net_units));
    var netStr = (netU >= 0 ? '+' : '') + netU.toFixed(2) + 'u';

    var badgeHtml = badges.length ? badges.map(function (b) {
      var founding = b.id === 'founding_member';
      return '<span class="tmr-fi-badge' + (founding ? ' is-founding' : '') + '" title="' + esc(b.description || b.label) + '">' +
        '<i class="fas ' + esc(b.icon || 'fa-certificate') + '"></i> ' + esc(b.label) + '</span>';
    }).join(' ') : '<span class="tmr-fi-empty">No badges yet</span>';

    var html =
      '<section class="tmr-fi-card" id="tmrFanIdentityCard">' +
      '<div class="tmr-fi-head"><h2><i class="fas fa-id-badge"></i> Sports Identity</h2>' +
      (owner ? '<button type="button" class="tmr-fi-edit-btn" id="tmrFiEditBtn">Edit</button>' : '') +
      '</div>' +
      '<div class="tmr-fi-badges">' + badgeHtml + '</div>' +
      '<div class="tmr-fi-teams">' +
      '<div class="tmr-fi-teamcol"><div class="tmr-fi-sub">Favorite Teams</div>' + chips(fav, catalog, 'is-fav') + '</div>' +
      '<div class="tmr-fi-teamcol"><div class="tmr-fi-sub">Rival Teams</div>' + chips(rivals, catalog, 'is-rival') + '</div>' +
      '</div>' +
      '<div class="tmr-fi-stats">' +
      recordCard('Verified Record', esc(vr.record || '0-0'), netStr + (vr.roi != null ? ' &middot; ' + Number(vr.roi).toFixed(1) + '% ROI' : ''), false) +
      recordCard('Contest Record', (p.contest_record && p.contest_record.record) ? esc(p.contest_record.record) : '&mdash;', 'Coming soon', !(p.contest_record && p.contest_record.record)) +
      recordCard('Prediction Record', (p.prediction_record && p.prediction_record.record) ? esc(p.prediction_record.record) : '&mdash;', 'Coming soon', !(p.prediction_record && p.prediction_record.record)) +
      recordCard('KnowBall Score', (p.knowball_score == null ? '&mdash;' : esc(p.knowball_score)), 'Coming soon', p.knowball_score == null) +
      '</div>';

    if (owner) {
      html += '<form class="tmr-fi-editor" id="tmrFiEditor" hidden>' +
        '<div class="tmr-fi-row"><label>Add favorite team</label>' +
        '<div class="tmr-fi-picker"><select id="tmrFiFavSport"></select><select id="tmrFiFavTeam"></select>' +
        '<button type="button" id="tmrFiFavAdd">Add</button></div>' +
        '<div class="tmr-fi-selected" id="tmrFiFavList"></div></div>' +
        '<div class="tmr-fi-row"><label>Add rival team</label>' +
        '<div class="tmr-fi-picker"><select id="tmrFiRivSport"></select><select id="tmrFiRivTeam"></select>' +
        '<button type="button" id="tmrFiRivAdd">Add</button></div>' +
        '<div class="tmr-fi-selected" id="tmrFiRivList"></div></div>' +
        '<div class="tmr-fi-row"><label>Fan personality</label>' +
        '<select id="tmrFiPersonality"><option value="">Not set</option>' +
        PERSONALITIES.map(function (x) { return '<option value="' + x + '"' + (p.sports_personality === x ? ' selected' : '') + '>' + x.charAt(0).toUpperCase() + x.slice(1) + '</option>'; }).join('') +
        '</select></div>' +
        '<div class="tmr-fi-actions"><button type="submit" id="tmrFiSave">Save identity</button>' +
        '<span class="tmr-fi-msg" id="tmrFiMsg"></span></div>' +
        '</form>';
    }
    html += '</section>';

    var card = document.createElement('div');
    card.innerHTML = html;
    card = card.firstChild;

    var header = document.getElementById('profileHeader');
    if (header && header.parentNode) header.parentNode.insertBefore(card, header.nextSibling);
    else document.body.appendChild(card);

    if (owner) wireEditor(p, catalog);
  }

  function wireEditor(p, catalog) {
    var favSel = [].concat(Array.isArray(p.favorite_teams) ? p.favorite_teams : []);
    var rivSel = [].concat(Array.isArray(p.rival_teams) ? p.rival_teams : []);

    function fillSports(sel) {
      sel.innerHTML = catalog.sports.map(function (s) { return '<option value="' + s.sportSlug + '">' + esc(s.label) + '</option>'; }).join('');
    }
    function fillTeams(sportSel, teamSel) {
      var s = catalog.sports.filter(function (x) { return x.sportSlug === sportSel.value; })[0];
      teamSel.innerHTML = (s ? s.teams : []).map(function (t) { return '<option value="' + esc(t.name) + '">' + esc(t.name) + '</option>'; }).join('');
    }
    function renderList(listEl, arr, onRemove) {
      listEl.innerHTML = arr.length ? arr.map(function (n, i) {
        return '<span class="tmr-fi-chip is-editable">' + esc(n) + ' <b data-i="' + i + '">&times;</b></span>';
      }).join(' ') : '<span class="tmr-fi-empty">None</span>';
      Array.prototype.forEach.call(listEl.querySelectorAll('b[data-i]'), function (b) {
        b.addEventListener('click', function () { onRemove(parseInt(b.getAttribute('data-i'), 10)); });
      });
    }

    var editBtn = document.getElementById('tmrFiEditBtn');
    var editor = document.getElementById('tmrFiEditor');
    var favSport = document.getElementById('tmrFiFavSport'), favTeam = document.getElementById('tmrFiFavTeam');
    var rivSport = document.getElementById('tmrFiRivSport'), rivTeam = document.getElementById('tmrFiRivTeam');
    var favList = document.getElementById('tmrFiFavList'), rivList = document.getElementById('tmrFiRivList');
    var msg = document.getElementById('tmrFiMsg');

    fillSports(favSport); fillSports(rivSport);
    fillTeams(favSport, favTeam); fillTeams(rivSport, rivTeam);
    favSport.addEventListener('change', function () { fillTeams(favSport, favTeam); });
    rivSport.addEventListener('change', function () { fillTeams(rivSport, rivTeam); });

    function refresh() {
      renderList(favList, favSel, function (i) { favSel.splice(i, 1); refresh(); });
      renderList(rivList, rivSel, function (i) { rivSel.splice(i, 1); refresh(); });
    }
    refresh();

    editBtn.addEventListener('click', function () { editor.hidden = !editor.hidden; });
    document.getElementById('tmrFiFavAdd').addEventListener('click', function () {
      var v = favTeam.value; if (v && favSel.indexOf(v) === -1) { favSel.push(v); refresh(); }
    });
    document.getElementById('tmrFiRivAdd').addEventListener('click', function () {
      var v = rivTeam.value; if (v && rivSel.indexOf(v) === -1) { rivSel.push(v); refresh(); }
    });

    editor.addEventListener('submit', async function (e) {
      e.preventDefault();
      msg.textContent = 'Saving...'; msg.className = 'tmr-fi-msg';
      var sports = Array.from(new Set(favSel.map(function (name) {
        for (var i = 0; i < catalog.sports.length; i++) {
          if (catalog.sports[i].teams.some(function (t) { return t.name === name; })) return catalog.sports[i].label;
        }
        return null;
      }).filter(Boolean)));
      var body = {
        favorite_teams: favSel,
        rival_teams: rivSel,
        favorite_sports: sports,
        sports_personality: document.getElementById('tmrFiPersonality').value || null,
      };
      try {
        if (window.api && typeof window.api.request === 'function') {
          await window.api.request('/users/profile', { method: 'PUT', body: body });
        } else {
          var token = (window.api && window.api.token) || localStorage.getItem('tmr_token') || localStorage.getItem('token');
          var r = await fetch(apiBase() + '/api/users/profile', {
            method: 'PUT', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
            body: JSON.stringify(body),
          });
          if (!r.ok) throw new Error('HTTP ' + r.status);
        }
        msg.textContent = 'Saved.'; msg.className = 'tmr-fi-msg is-ok';
        window.profileData.favorite_teams = favSel;
        window.profileData.rival_teams = rivSel;
        setTimeout(function () { location.reload(); }, 700);
      } catch (err) {
        msg.textContent = (err && err.message) ? err.message : 'Save failed.';
        msg.className = 'tmr-fi-msg is-err';
      }
    });
  }

  function injectStyles() {
    if (document.getElementById('tmrFiStyles')) return;
    var css = document.createElement('style');
    css.id = 'tmrFiStyles';
    css.textContent =
      '.tmr-fi-card{max-width:1100px;margin:18px auto;padding:20px;background:#141824;border:1px solid #262c3d;border-radius:16px;color:#e6e9f2;font-family:Inter,system-ui,sans-serif}' +
      '.tmr-fi-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px}' +
      '.tmr-fi-head h2{font-size:18px;margin:0;color:#fff;font-weight:800}.tmr-fi-head i{color:#00aeff}' +
      '.tmr-fi-edit-btn{background:#00aeff;color:#04121f;border:0;border-radius:8px;padding:6px 14px;font-weight:700;cursor:pointer}' +
      '.tmr-fi-badges{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px}' +
      '.tmr-fi-badge{display:inline-flex;align-items:center;gap:6px;padding:5px 11px;border-radius:8px;background:rgba(255,255,255,.06);border:1px solid #2c3346;font-size:12px;font-weight:700}' +
      '.tmr-fi-badge.is-founding{background:linear-gradient(135deg,#3a2e07,#5c4708);border-color:#caa12a;color:#ffd966}' +
      '.tmr-fi-teams{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px}' +
      '.tmr-fi-sub{font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#8b93a7;margin-bottom:7px;font-weight:700}' +
      '.tmr-fi-chip{display:inline-block;padding:4px 10px;margin:0 0 4px;border-radius:6px;background:rgba(0,174,255,.12);border:1px solid rgba(0,174,255,.35);color:#7cd4ff;font-size:12px;font-weight:600}' +
      '.tmr-fi-chip.is-rival{background:rgba(255,77,90,.12);border-color:rgba(255,77,90,.35);color:#ff8e97}' +
      '.tmr-fi-chip.is-editable b{cursor:pointer;color:#ff8e97;margin-left:4px}' +
      '.tmr-fi-empty{color:#6b7280;font-size:12px;font-style:italic}' +
      '.tmr-fi-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}' +
      '.tmr-fi-stat{background:#0f1320;border:1px solid #232a3b;border-radius:12px;padding:14px;text-align:center}' +
      '.tmr-fi-stat.is-soon{opacity:.72}' +
      '.tmr-fi-stat-label{font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#8b93a7;font-weight:700}' +
      '.tmr-fi-stat-value{font-size:22px;font-weight:800;color:#fff;margin:6px 0 2px}' +
      '.tmr-fi-stat-sub{font-size:11px;color:#7cd4ff}.tmr-fi-stat.is-soon .tmr-fi-stat-sub{color:#8b93a7}' +
      '.tmr-fi-editor{margin-top:18px;padding-top:16px;border-top:1px solid #262c3d;display:grid;gap:14px}' +
      '.tmr-fi-row label{display:block;font-size:12px;font-weight:700;color:#b9c0d4;margin-bottom:6px}' +
      '.tmr-fi-picker{display:flex;gap:8px;flex-wrap:wrap}' +
      '.tmr-fi-picker select{background:#0f1320;color:#e6e9f2;border:1px solid #2c3346;border-radius:8px;padding:8px;flex:1;min-width:120px}' +
      '.tmr-fi-picker button,.tmr-fi-actions button{background:#00aeff;color:#04121f;border:0;border-radius:8px;padding:8px 16px;font-weight:700;cursor:pointer}' +
      '.tmr-fi-selected{margin-top:8px}' +
      '.tmr-fi-actions{display:flex;align-items:center;gap:12px}' +
      '#tmrFiPersonality{background:#0f1320;color:#e6e9f2;border:1px solid #2c3346;border-radius:8px;padding:8px;min-width:160px}' +
      '.tmr-fi-msg{font-size:12px}.tmr-fi-msg.is-ok{color:#46d39a}.tmr-fi-msg.is-err{color:#ff8e97}' +
      '@media(max-width:720px){.tmr-fi-teams{grid-template-columns:1fr}.tmr-fi-stats{grid-template-columns:repeat(2,1fr)}}';
    document.head.appendChild(css);
  }

  var tries = 0;
  function boot() {
    if (!window.profileData) { if (tries++ < 60) return setTimeout(boot, 250); return; }
    if (document.getElementById('tmrFanIdentityCard')) return;
    injectStyles();
    getCatalog().then(function (catalog) {
      try { render(window.profileData, catalog); } catch (e) { /* never break the page */ }
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
