/* TrustMyRecord - Sports Fan Identity
 * Self-contained, additive. Renders the "Sports Identity" card on a profile and,
 * for the profile owner, a polished favorite/rival team editor.
 * Redesign (2026-06): single compact picker (Sport -> Team -> Add Favorite / Add
 * Rival), chips with sport badges + remove, intentional empty states, dark TMR
 * styling. Data model unchanged: favorite_teams[] / rival_teams[] (team names),
 * favorite_sports[] derived, sports_personality. Persists via PUT /users/profile.
 */
(function () {
  'use strict';
  if (window.__tmrFanIdentity) return;
  window.__tmrFanIdentity = true;

  function apiBase() {
    var base;
    try { base = (window.api && window.api.baseUrl) ? String(window.api.baseUrl) : null; } catch (e) { base = null; }
    if (!base) base = window.TMR_API_BASE || window.API_BASE_URL || 'https://trustmyrecord-api.onrender.com';
    return String(base).replace(/\/+$/, '').replace(/\/api$/, '');
  }

  var catalogPromise = null;
  function getCatalog() {
    if (!catalogPromise) {
      catalogPromise = fetch(apiBase() + '/api/teams/catalog')
        .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then(function (d) { return (d && Array.isArray(d.sports) && d.sports.length) ? d : { sports: [], _error: true }; })
        .catch(function () { return { sports: [], _error: true }; });
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

  function sportLabelForName(name, catalog) {
    if (!catalog || !catalog.sports) return null;
    for (var i = 0; i < catalog.sports.length; i++) {
      var s = catalog.sports[i];
      for (var j = 0; j < s.teams.length; j++) {
        if (s.teams[j].name === name) return s.label;
      }
    }
    return null;
  }

  // Team logo URL from the catalog data model (server-provided team.logo).
  function logoForName(name, catalog) {
    if (!catalog || !catalog.sports) return null;
    for (var i = 0; i < catalog.sports.length; i++) {
      var s = catalog.sports[i];
      for (var j = 0; j < s.teams.length; j++) {
        if (s.teams[j].name === name) return s.teams[j].logo || null;
      }
    }
    return null;
  }

  // Up to two initials for a clean fallback when no logo asset exists.
  function initialsFor(name) {
    var parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  }

  // Reusable team-logo mark: real logo with graceful initials fallback.
  // Used by every team chip so it stays consistent across profile/public/edit views.
  function teamLogoHtml(name, catalog) {
    if (window.TMRTeamLogo && typeof window.TMRTeamLogo.html === 'function') {
      return window.TMRTeamLogo.html(name, { className: 'tmr-fi-logo' });
    }
    var url = logoForName(name, catalog);
    var initials = '<span class="tmr-fi-logo-fallback" aria-hidden="true">' + esc(initialsFor(name)) + '</span>';
    if (!url) return '<span class="tmr-fi-logo is-fallback">' + initials + '</span>';
    return '<span class="tmr-fi-logo">' +
      '<img class="tmr-fi-logo-img" src="' + esc(url) + '" alt="" loading="lazy" ' +
      'onerror="this.style.display=\'none\';this.parentNode.classList.add(\'is-fallback\');" />' +
      initials + '</span>';
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

  // ---- chips / columns -------------------------------------------------------
  function chipHtml(name, catalog, kind, listKey, idx, editable) {
    var lbl = sportLabelForName(name, catalog);
    var sportBadge = lbl ? '<span class="tmr-fi-chip-sport">' + esc(lbl) + '</span>' : '';
    var inner =
      teamLogoHtml(name, catalog) +
      '<span class="tmr-fi-chip-name">' + esc(name) + '</span>' + sportBadge +
      (editable ? '<button type="button" class="tmr-fi-chip-x" data-list="' + listKey + '" data-i="' + idx + '" aria-label="Remove ' + esc(name) + '">&times;</button>' : '');
    if (editable) {
      return '<span class="tmr-fi-chip is-' + kind + '">' + inner + '</span>';
    }
    var href = teamHref(name, catalog);
    if (href) return '<a class="tmr-fi-chip is-' + kind + '" href="' + href + '">' + inner + '</a>';
    return '<span class="tmr-fi-chip is-' + kind + '">' + inner + '</span>';
  }

  function columnHtml(title, icon, kind, names, catalog, editable, emptyText) {
    var chips = (names && names.length)
      ? names.map(function (n, i) { return chipHtml(n, catalog, kind, kind, i, editable); }).join('')
      : '<div class="tmr-fi-empty">' + esc(emptyText) + '</div>';
    return '<div class="tmr-fi-teamcol">' +
      '<div class="tmr-fi-col-head"><span><i class="fas ' + icon + '"></i> ' + esc(title) + '</span>' +
      '<span class="tmr-fi-count">' + (names ? names.length : 0) + '</span></div>' +
      '<div class="tmr-fi-chips">' + chips + '</div></div>';
  }

  function render(p, catalog) {
    var owner = isOwner(p);
    var fav = Array.isArray(p.favorite_teams) ? p.favorite_teams.slice() : [];
    var rivals = Array.isArray(p.rival_teams) ? p.rival_teams.slice() : [];
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
    }).join(' ') : '<span class="tmr-fi-empty-inline">No badges yet</span>';

    var catErr = !!(catalog && catalog._error) || !(catalog && catalog.sports && catalog.sports.length);

    var editorHtml = '';
    if (owner) {
      editorHtml =
        '<form class="tmr-fi-editor" id="tmrFiEditor" hidden>' +
        (catErr ? '<div class="tmr-fi-banner is-err">Team list could not load. Refresh the page to add favorite or rival teams.</div>' : '') +
        '<div class="tmr-fi-ed-title">Add a team</div>' +
        '<div class="tmr-fi-addbar">' +
        '<div class="tmr-fi-field"><label for="tmrFiSport">Sport</label>' +
        '<div class="tmr-fi-selwrap"><select id="tmrFiSport"></select></div></div>' +
        '<div class="tmr-fi-field tmr-fi-field--grow"><label for="tmrFiTeam">Team</label>' +
        '<div class="tmr-fi-selwrap"><select id="tmrFiTeam"></select></div></div>' +
        '<div class="tmr-fi-addbtns">' +
        '<button type="button" id="tmrFiAddFav" class="tmr-fi-add tmr-fi-add--fav"><i class="fas fa-star"></i> Add Favorite</button>' +
        '<button type="button" id="tmrFiAddRiv" class="tmr-fi-add tmr-fi-add--riv"><i class="fas fa-bolt"></i> Add Rival</button>' +
        '</div></div>' +
        '<div class="tmr-fi-pick-msg" id="tmrFiPickMsg" role="status"></div>' +
        '<div class="tmr-fi-field tmr-fi-field--personality"><label for="tmrFiPersonality">Fan Personality</label>' +
        '<div class="tmr-fi-selwrap"><select id="tmrFiPersonality"><option value="">Not set</option>' +
        PERSONALITIES.map(function (x) { return '<option value="' + x + '"' + (p.sports_personality === x ? ' selected' : '') + '>' + x.charAt(0).toUpperCase() + x.slice(1) + '</option>'; }).join('') +
        '</select></div></div>' +
        '<div class="tmr-fi-actions">' +
        '<button type="submit" id="tmrFiSave" class="tmr-fi-save">Save changes</button>' +
        '<span class="tmr-fi-msg" id="tmrFiMsg"></span></div>' +
        '</form>';
    }

    var personalityPill = p.sports_personality
      ? '<span class="tmr-fi-personality"><i class="fas fa-user-tag"></i> ' + esc(p.sports_personality.charAt(0).toUpperCase() + p.sports_personality.slice(1)) + '</span>'
      : (owner ? '' : '');

    var html =
      '<section class="tmr-fi-card" id="tmrFanIdentityCard">' +
      '<div class="tmr-fi-head"><h2><i class="fas fa-id-badge"></i> Sports Identity</h2>' +
      (owner ? '<button type="button" class="tmr-fi-edit-btn" id="tmrFiEditBtn"><i class="fas fa-pen"></i> <span>Edit teams</span></button>' : '') +
      '</div>' +
      '<div class="tmr-fi-badges">' + badgeHtml + personalityPill + '</div>' +
      editorHtml +
      '<div class="tmr-fi-teams" id="tmrFiTeams">' +
      columnHtml('Favorite Teams', 'fa-star', 'fav', fav, catalog, false, 'No favorite teams added yet.') +
      columnHtml('Rival Teams', 'fa-bolt', 'rival', rivals, catalog, false, 'No rival teams added yet.') +
      '</div>' +
      '<div class="tmr-fi-stats">' +
      recordCard('Verified Record', esc(vr.record || '0-0'), netStr + (vr.roi != null ? ' &middot; ' + Number(vr.roi).toFixed(1) + '% ROI' : ''), false) +
      recordCard('Contest Record', (p.contest_record && p.contest_record.record) ? esc(p.contest_record.record) : '&mdash;', 'Coming soon', !(p.contest_record && p.contest_record.record)) +
      recordCard('Prediction Record', (p.prediction_record && p.prediction_record.record) ? esc(p.prediction_record.record) : '&mdash;', 'Coming soon', !(p.prediction_record && p.prediction_record.record)) +
      recordCard('KnowBall Score', (p.knowball_score == null ? '&mdash;' : esc(p.knowball_score)), 'Coming soon', p.knowball_score == null) +
      '</div></section>';

    var wrap = document.createElement('div');
    wrap.innerHTML = html;
    var card = wrap.firstChild;

    var header = document.getElementById('profileHeader');
    if (header && header.parentNode) header.parentNode.insertBefore(card, header.nextSibling);
    else document.body.appendChild(card);

    if (owner) wireEditor(p, catalog);
  }

  function wireEditor(p, catalog) {
    var favSel = [].concat(Array.isArray(p.favorite_teams) ? p.favorite_teams : []);
    var rivSel = [].concat(Array.isArray(p.rival_teams) ? p.rival_teams : []);
    var hasCatalog = !!(catalog && catalog.sports && catalog.sports.length);
    var editing = false;

    var teamsEl = document.getElementById('tmrFiTeams');
    var editBtn = document.getElementById('tmrFiEditBtn');
    var editor = document.getElementById('tmrFiEditor');
    var sportSel = document.getElementById('tmrFiSport');
    var teamSel = document.getElementById('tmrFiTeam');
    var pickMsg = document.getElementById('tmrFiPickMsg');
    var saveMsg = document.getElementById('tmrFiMsg');

    function renderColumns() {
      teamsEl.innerHTML =
        columnHtml('Favorite Teams', 'fa-star', 'fav', favSel, catalog, editing, 'No favorite teams added yet.') +
        columnHtml('Rival Teams', 'fa-bolt', 'rival', rivSel, catalog, editing, 'No rival teams added yet.');
      Array.prototype.forEach.call(teamsEl.querySelectorAll('.tmr-fi-chip-x'), function (b) {
        b.addEventListener('click', function () {
          var list = b.getAttribute('data-list'), i = parseInt(b.getAttribute('data-i'), 10);
          (list === 'fav' ? favSel : rivSel).splice(i, 1);
          renderColumns();
        });
      });
    }
    renderColumns();

    function flash(text, ok) {
      if (!pickMsg) return;
      pickMsg.textContent = text || '';
      pickMsg.className = 'tmr-fi-pick-msg' + (text ? (ok ? ' is-ok' : ' is-err') : '');
    }

    function teamInSport(slug, name) {
      var s = catalog.sports.filter(function (x) { return x.sportSlug === slug; })[0];
      return !!(s && s.teams.some(function (t) { return t.name === name; }));
    }
    function fillSports() {
      sportSel.innerHTML = '<option value="">Choose a sport</option>' +
        catalog.sports.map(function (s) { return '<option value="' + s.sportSlug + '">' + esc(s.label) + '</option>'; }).join('');
    }
    function fillTeams() {
      var s = catalog.sports.filter(function (x) { return x.sportSlug === sportSel.value; })[0];
      teamSel.disabled = !s;
      teamSel.innerHTML = '<option value="">' + (s ? 'Choose a team' : 'Pick a sport first') + '</option>' +
        (s ? s.teams : []).map(function (t) { return '<option value="' + esc(t.name) + '">' + esc(t.name) + '</option>'; }).join('');
    }

    function setEditing(on) {
      editing = on;
      editor.hidden = !on;
      if (editBtn) {
        editBtn.classList.toggle('is-active', on);
        editBtn.querySelector('span').textContent = on ? 'Done' : 'Edit teams';
        editBtn.querySelector('i').className = on ? 'fas fa-check' : 'fas fa-pen';
      }
      renderColumns();
      if (on && hasCatalog) { try { sportSel.focus(); } catch (e) {} }
    }
    if (editBtn) editBtn.addEventListener('click', function () { setEditing(!editing); });

    if (!hasCatalog) {
      [sportSel, teamSel].forEach(function (el) { if (el) el.disabled = true; });
      var fa = document.getElementById('tmrFiAddFav'), ra = document.getElementById('tmrFiAddRiv');
      if (fa) fa.disabled = true; if (ra) ra.disabled = true;
    } else {
      fillSports(); fillTeams();
      sportSel.addEventListener('change', function () { fillTeams(); flash(''); });

      function addTeam(kind) {
        var slug = sportSel.value, name = teamSel.value;
        var sel = kind === 'fav' ? favSel : rivSel;
        var other = kind === 'fav' ? rivSel : favSel;
        var word = kind === 'fav' ? 'favorite' : 'rival';
        if (!slug) { flash('Choose a sport first.', false); return; }
        if (!name) { flash('Choose a team first.', false); return; }
        if (!teamInSport(slug, name)) { flash('That team is not in the selected sport.', false); return; }
        if (sel.indexOf(name) !== -1) { flash(name + ' is already in your ' + word + ' teams.', false); return; }
        if (other.indexOf(name) !== -1) { flash(name + ' is in your ' + (kind === 'fav' ? 'rival' : 'favorite') + ' teams. Remove it there first.', false); return; }
        sel.push(name);
        renderColumns();
        flash('Added ' + name + ' to ' + word + ' teams.', true);
        teamSel.value = '';
      }
      document.getElementById('tmrFiAddFav').addEventListener('click', function () { addTeam('fav'); });
      document.getElementById('tmrFiAddRiv').addEventListener('click', function () { addTeam('riv'); });
    }

    editor.addEventListener('submit', async function (e) {
      e.preventDefault();
      saveMsg.textContent = 'Saving...'; saveMsg.className = 'tmr-fi-msg';
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
        saveMsg.textContent = 'Saved!'; saveMsg.className = 'tmr-fi-msg is-ok';
        window.profileData.favorite_teams = favSel;
        window.profileData.rival_teams = rivSel;
        setTimeout(function () { location.reload(); }, 650);
      } catch (err) {
        saveMsg.textContent = (err && err.message) ? err.message : 'Save failed.';
        saveMsg.className = 'tmr-fi-msg is-err';
      }
    });
  }

  function injectStyles() {
    if (document.getElementById('tmrFiStyles')) return;
    var css = document.createElement('style');
    css.id = 'tmrFiStyles';
    css.textContent = [
      '.tmr-fi-card{max-width:1100px;margin:18px auto;padding:22px;background:#141824;border:1px solid #262c3d;border-radius:16px;color:#e6e9f2;font-family:Inter,system-ui,sans-serif}',
      '.tmr-fi-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px}',
      '.tmr-fi-head h2{font-size:18px;margin:0;color:#fff;font-weight:800;display:flex;align-items:center;gap:9px}.tmr-fi-head h2 i{color:#00aeff}',
      '.tmr-fi-edit-btn{display:inline-flex;align-items:center;gap:7px;background:rgba(0,174,255,.12);color:#7cd4ff;border:1px solid rgba(0,174,255,.4);border-radius:9px;padding:7px 14px;font-weight:700;font-size:13px;cursor:pointer;transition:background .15s,border-color .15s}',
      '.tmr-fi-edit-btn:hover{background:rgba(0,174,255,.2)}',
      '.tmr-fi-edit-btn.is-active{background:#00d27a;border-color:#00d27a;color:#04210f}',
      '.tmr-fi-badges{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:18px}',
      '.tmr-fi-badge{display:inline-flex;align-items:center;gap:6px;padding:5px 11px;border-radius:8px;background:rgba(255,255,255,.06);border:1px solid #2c3346;font-size:12px;font-weight:700}',
      '.tmr-fi-badge.is-founding{background:linear-gradient(135deg,#3a2e07,#5c4708);border-color:#caa12a;color:#ffd966}',
      '.tmr-fi-personality{display:inline-flex;align-items:center;gap:6px;padding:5px 11px;border-radius:8px;background:rgba(168,85,247,.14);border:1px solid rgba(168,85,247,.4);color:#d6b4ff;font-size:12px;font-weight:700}',
      // editor
      '.tmr-fi-editor{margin:0 0 18px;padding:16px;background:#0f1320;border:1px solid #232a3b;border-radius:14px;display:grid;gap:12px}',
      '.tmr-fi-ed-title{font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:#8b93a7;font-weight:800}',
      '.tmr-fi-banner{padding:9px 12px;border-radius:9px;font-size:12.5px;font-weight:600}.tmr-fi-banner.is-err{background:rgba(255,77,90,.12);border:1px solid rgba(255,77,90,.35);color:#ff8e97}',
      '.tmr-fi-addbar{display:flex;flex-wrap:wrap;align-items:flex-end;gap:10px}',
      '.tmr-fi-field{display:flex;flex-direction:column;gap:5px}.tmr-fi-field--grow{flex:1;min-width:180px}',
      '.tmr-fi-field label{font-size:11px;font-weight:700;color:#b9c0d4;text-transform:uppercase;letter-spacing:.03em}',
      '.tmr-fi-selwrap{position:relative}',
      '.tmr-fi-selwrap::after{content:"";position:absolute;right:12px;top:50%;width:8px;height:8px;border-right:2px solid #8b93a7;border-bottom:2px solid #8b93a7;transform:translateY(-65%) rotate(45deg);pointer-events:none}',
      '.tmr-fi-selwrap select{width:100%;background:#161b2b;color:#e6e9f2;border:1px solid #2c3346;border-radius:9px;padding:10px 30px 10px 12px;font-size:14px;font-weight:600;cursor:pointer;color-scheme:dark;appearance:none;-webkit-appearance:none}',
      '.tmr-fi-selwrap select:focus{outline:none;border-color:#00aeff;box-shadow:0 0 0 3px rgba(0,174,255,.18)}',
      '.tmr-fi-selwrap select:disabled{opacity:.55;cursor:not-allowed}',
      '.tmr-fi-field--personality{max-width:240px}',
      '.tmr-fi-addbtns{display:flex;gap:8px;flex-wrap:wrap}',
      '.tmr-fi-add{display:inline-flex;align-items:center;gap:7px;border-radius:9px;padding:10px 16px;font-weight:800;font-size:13px;cursor:pointer;border:1px solid transparent;white-space:nowrap;transition:transform .12s,filter .12s}',
      '.tmr-fi-add:hover{transform:translateY(-1px);filter:brightness(1.08)}',
      '.tmr-fi-add--fav{background:#00aeff;color:#04121f}',
      '.tmr-fi-add--riv{background:rgba(255,77,90,.14);color:#ff8e97;border-color:rgba(255,77,90,.5)}',
      '.tmr-fi-add:disabled{opacity:.5;cursor:not-allowed;transform:none}',
      '.tmr-fi-pick-msg{font-size:12.5px;min-height:16px;font-weight:600}.tmr-fi-pick-msg.is-ok{color:#46d39a}.tmr-fi-pick-msg.is-err{color:#ff8e97}',
      '.tmr-fi-actions{display:flex;align-items:center;gap:12px;margin-top:2px}',
      '.tmr-fi-save{background:#00d27a;color:#04210f;border:0;border-radius:9px;padding:10px 20px;font-weight:800;font-size:14px;cursor:pointer;transition:filter .12s}.tmr-fi-save:hover{filter:brightness(1.08)}',
      '.tmr-fi-msg{font-size:12.5px;font-weight:700}.tmr-fi-msg.is-ok{color:#46d39a}.tmr-fi-msg.is-err{color:#ff8e97}',
      // teams columns + chips
      '.tmr-fi-teams{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:18px}',
      '.tmr-fi-teamcol{background:#0f1320;border:1px solid #232a3b;border-radius:14px;padding:14px}',
      '.tmr-fi-col-head{display:flex;align-items:center;justify-content:space-between;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#8b93a7;font-weight:800;margin-bottom:10px}',
      '.tmr-fi-col-head i{margin-right:5px}',
      '.tmr-fi-teamcol:nth-child(1) .tmr-fi-col-head i{color:#00aeff}.tmr-fi-teamcol:nth-child(2) .tmr-fi-col-head i{color:#ff6b78}',
      '.tmr-fi-count{background:rgba(255,255,255,.07);color:#aab2c6;border-radius:20px;min-width:20px;text-align:center;padding:1px 7px;font-size:11px}',
      '.tmr-fi-chips{display:flex;flex-wrap:wrap;gap:8px}',
      '.tmr-fi-chip{display:inline-flex;align-items:center;gap:7px;padding:6px 10px;border-radius:9px;font-size:13px;font-weight:700;text-decoration:none;line-height:1.1}',
      'a.tmr-fi-chip:hover{filter:brightness(1.12)}',
      '.tmr-fi-chip.is-fav{background:rgba(0,174,255,.12);border:1px solid rgba(0,174,255,.4);color:#7cd4ff}',
      '.tmr-fi-chip.is-rival{background:rgba(255,77,90,.12);border:1px solid rgba(255,77,90,.4);color:#ff8e97}',
      '.tmr-fi-logo{position:relative;display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;flex:0 0 20px;border-radius:5px;overflow:hidden;background:rgba(255,255,255,.06)}',
      '.tmr-fi-logo-img{width:20px;height:20px;object-fit:contain;display:block}',
      '.tmr-fi-logo-fallback{display:none;font-size:9px;font-weight:800;letter-spacing:.02em;color:#cfd5e6;text-transform:uppercase}',
      '.tmr-fi-logo.is-fallback .tmr-fi-logo-fallback{display:block}',
      '.tmr-fi-chip-sport{padding:1px 6px;border-radius:5px;background:rgba(255,255,255,.12);color:#cfd5e6;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.03em}',
      '.tmr-fi-chip-x{background:none;border:0;color:inherit;opacity:.7;font-size:16px;line-height:1;cursor:pointer;padding:0 0 0 1px;font-weight:700}.tmr-fi-chip-x:hover{opacity:1}',
      '.tmr-fi-empty{color:#6b7280;font-size:12.5px;padding:8px 0;font-style:italic}',
      '.tmr-fi-empty-inline{color:#6b7280;font-size:12px;font-style:italic}',
      // stats
      '.tmr-fi-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}',
      '.tmr-fi-stat{background:#0f1320;border:1px solid #232a3b;border-radius:12px;padding:14px;text-align:center}.tmr-fi-stat.is-soon{opacity:.72}',
      '.tmr-fi-stat-label{font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#8b93a7;font-weight:700}',
      '.tmr-fi-stat-value{font-size:22px;font-weight:800;color:#fff;margin:6px 0 2px}',
      '.tmr-fi-stat-sub{font-size:11px;color:#7cd4ff}.tmr-fi-stat.is-soon .tmr-fi-stat-sub{color:#8b93a7}',
      '@media(max-width:720px){.tmr-fi-teams{grid-template-columns:1fr}.tmr-fi-stats{grid-template-columns:repeat(2,1fr)}.tmr-fi-addbtns{width:100%}.tmr-fi-add{flex:1;justify-content:center}.tmr-fi-field--grow{min-width:140px}}'
    ].join('');
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
