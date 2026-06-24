/* TrustMyRecord MLB Season Simulator builder - SEASON_SIMULATOR_20260623 */
(function () {
  'use strict';

  var API = (window.TMR_API_BASE || window.API_BASE_URL || 'https://trustmyrecord-api.onrender.com').replace(/\/$/, '');
  var SEASON = 2026;

  function getToken() {
    try { if (window.api && window.api.token) return window.api.token; } catch (e) {}
    var keys = ['trustmyrecord_token', 'tmr_auth_token', 'accessToken', 'access_token', 'token', 'tmr_token'];
    for (var i = 0; i < keys.length; i++) {
      var v = null;
      try { v = localStorage.getItem(keys[i]); } catch (e) {}
      if (v) return v;
    }
    return null;
  }
  function isLoggedIn() { return !!getToken(); }
  function authHeaders() {
    var h = { 'Content-Type': 'application/json' };
    var t = getToken();
    if (t) h.Authorization = 'Bearer ' + t;
    return h;
  }
  function el(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }

  // State
  var TEAMS = [];
  var TEAM_BY_ABBR = {};
  var DIVISIONS = [];
  var state = {
    division_winners: {}, // label -> abbr
    wild_card_teams: { AL: [], NL: [] },
    al_champion: null, nl_champion: null, world_series_champion: null,
    team_win_totals: {}, is_public: true
  };
  var locked = false;

  function leagueOf(abbr) { return TEAM_BY_ABBR[abbr] ? TEAM_BY_ABBR[abbr].league : null; }
  function nameOf(abbr) { return TEAM_BY_ABBR[abbr] ? TEAM_BY_ABBR[abbr].name : abbr; }

  // Playoff field for a league = division winners + wild cards
  function playoffTeams(lg) {
    var arr = [];
    DIVISIONS.forEach(function (d) {
      if (d.label.indexOf(lg + ' ') === 0 && state.division_winners[d.label]) arr.push(state.division_winners[d.label]);
    });
    (state.wild_card_teams[lg] || []).forEach(function (a) { if (arr.indexOf(a) < 0) arr.push(a); });
    return arr;
  }

  // ---------- Renderers ----------
  function renderDivisions() {
    var host = el('ss-build-divisions');
    host.innerHTML = DIVISIONS.map(function (d) {
      var btns = d.teams.map(function (t) {
        var sel = state.division_winners[d.label] === t.abbr;
        var tip = t.ballpark ? (t.name + ' · ' + t.ballpark + ' (' + (t.city || '') + ') · Mgr: ' + (t.manager || '')) : t.name;
        return '<button type="button" class="ss-team-btn' + (sel ? ' sel' : '') + '" title="' + esc(tip) + '" data-div="' + esc(d.label) + '" data-abbr="' + esc(t.abbr) + '"' + (locked ? ' disabled' : '') + '>' +
          '<span class="ab">' + esc(t.abbr) + '</span><span class="nm">' + esc(t.name) + '</span></button>';
      }).join('');
      return '<div class="ss-div-card"><div class="ss-div-head">' + esc(d.label) + '</div><div class="ss-team-grid">' + btns + '</div></div>';
    }).join('');
    host.querySelectorAll('.ss-team-btn').forEach(function (b) {
      b.addEventListener('click', function () {
        if (locked) return;
        var label = b.getAttribute('data-div'), abbr = b.getAttribute('data-abbr');
        state.division_winners[label] = (state.division_winners[label] === abbr) ? undefined : abbr;
        if (!state.division_winners[label]) delete state.division_winners[label];
        // drop wild card / champ picks that now conflict
        ['AL', 'NL'].forEach(function (lg) {
          state.wild_card_teams[lg] = (state.wild_card_teams[lg] || []).filter(function (a) {
            return !Object.values(state.division_winners).includes(a);
          });
        });
        syncDownstream();
        renderAll();
      });
    });
  }

  function renderWildCards() {
    var host = el('ss-build-wildcards');
    host.innerHTML = ['AL', 'NL'].map(function (lg) {
      var winners = Object.keys(state.division_winners).filter(function (l) { return l.indexOf(lg + ' ') === 0; }).map(function (l) { return state.division_winners[l]; });
      var pool = TEAMS.filter(function (t) { return t.league === lg && winners.indexOf(t.abbr) < 0; });
      var picked = state.wild_card_teams[lg] || [];
      var btns = pool.map(function (t) {
        var sel = picked.indexOf(t.abbr) >= 0;
        var full = picked.length >= 3 && !sel;
        return '<button type="button" class="ss-team-btn' + (sel ? ' sel' : '') + '" data-lg="' + lg + '" data-abbr="' + esc(t.abbr) + '"' + ((locked || full) ? ' disabled' : '') + '>' +
          '<span class="ab">' + esc(t.abbr) + '</span><span class="nm">' + esc(t.name) + '</span></button>';
      }).join('');
      return '<div class="ss-div-card"><div class="ss-div-head">' + lg + ' Wild Cards <span class="ss-count">' + picked.length + '/3</span></div><div class="ss-team-grid">' + btns + '</div></div>';
    }).join('');
    host.querySelectorAll('.ss-team-btn').forEach(function (b) {
      b.addEventListener('click', function () {
        if (locked) return;
        var lg = b.getAttribute('data-lg'), abbr = b.getAttribute('data-abbr');
        var arr = state.wild_card_teams[lg] || (state.wild_card_teams[lg] = []);
        var i = arr.indexOf(abbr);
        if (i >= 0) arr.splice(i, 1);
        else if (arr.length < 3) arr.push(abbr);
        syncDownstream();
        renderAll();
      });
    });
  }

  function champSelect(field, lg) {
    var field2 = field;
    var teams = playoffTeams(lg);
    var opts = ['<option value="">Select ' + lg + ' Champion</option>'].concat(teams.map(function (a) {
      return '<option value="' + esc(a) + '"' + (state[field2] === a ? ' selected' : '') + '>' + esc(nameOf(a)) + '</option>';
    })).join('');
    return '<label class="ss-field"><span>' + lg + ' Champion (Pennant)</span><select data-field="' + field2 + '"' + (locked ? ' disabled' : '') + '>' + opts + '</select></label>';
  }

  function renderChampions() {
    var host = el('ss-build-champions');
    var wsTeams = [state.al_champion, state.nl_champion].filter(Boolean);
    var wsOpts = ['<option value="">Select World Series Champion</option>'].concat(wsTeams.map(function (a) {
      return '<option value="' + esc(a) + '"' + (state.world_series_champion === a ? ' selected' : '') + '>' + esc(nameOf(a)) + '</option>';
    })).join('');
    host.innerHTML =
      champSelect('al_champion', 'AL') +
      champSelect('nl_champion', 'NL') +
      '<label class="ss-field ss-field-ws"><span>World Series Champion</span><select data-field="world_series_champion"' + (locked || wsTeams.length < 2 ? ' disabled' : '') + '>' + wsOpts + '</select></label>';
    host.querySelectorAll('select').forEach(function (s) {
      s.addEventListener('change', function () {
        if (locked) return;
        state[s.getAttribute('data-field')] = s.value || null;
        syncDownstream();
        renderBracket(); renderChampions(); updateProgress();
      });
    });
  }

  function renderBracket() {
    var host = el('ss-build-bracket');
    function chips(lg) {
      var t = playoffTeams(lg);
      if (!t.length) return '<span class="ss-muted">Pick ' + lg + ' division winners + wild cards</span>';
      return t.map(function (a, i) {
        var seed = i < 3 ? ('#' + (i + 1)) : 'WC';
        return '<span class="ss-seed' + (state[lg.toLowerCase() + '_champion'] === a ? ' champ' : '') + '"><b>' + seed + '</b> ' + esc(a) + '</span>';
      }).join('');
    }
    host.innerHTML =
      '<div class="ss-bracket-col"><h4>AL Field</h4><div class="ss-seeds">' + chips('AL') + '</div>' +
        '<div class="ss-pennant">AL Pennant: <b>' + (state.al_champion ? esc(nameOf(state.al_champion)) : 'TBD') + '</b></div></div>' +
      '<div class="ss-bracket-col ss-bracket-ws"><div class="ss-ws-trophy"><i class="fas fa-trophy"></i></div><h4>World Series</h4>' +
        '<div class="ss-ws-pick">' + (state.world_series_champion ? esc(nameOf(state.world_series_champion)) : 'Your Champion') + '</div></div>' +
      '<div class="ss-bracket-col"><h4>NL Field</h4><div class="ss-seeds">' + chips('NL') + '</div>' +
        '<div class="ss-pennant">NL Pennant: <b>' + (state.nl_champion ? esc(nameOf(state.nl_champion)) : 'TBD') + '</b></div></div>';
  }

  function renderWinTotals() {
    var host = el('ss-build-wintotals');
    host.innerHTML = DIVISIONS.map(function (d) {
      var rows = d.teams.map(function (t) {
        var v = state.team_win_totals[t.abbr];
        var rosterLink = t.mlbId ? ' <button type="button" class="ss-roster-link" data-mlbid="' + esc(t.mlbId) + '" data-abbr="' + esc(t.abbr) + '"><i class="fas fa-users"></i> roster</button>' : '';
        var meta = t.ballpark ? '<span class="ss-wt-meta">' + esc(t.ballpark) + ' &middot; Mgr: ' + esc(t.manager || '') + rosterLink + '</span>' : '';
        return '<div class="ss-wt-row"><span class="ss-wt-team"><b>' + esc(t.abbr) + '</b> ' + esc(t.name) + meta + '</span>' +
          '<input type="number" min="0" max="162" inputmode="numeric" data-abbr="' + esc(t.abbr) + '" value="' + (v != null ? v : '') + '" placeholder="--"' + (locked ? ' disabled' : '') + '></div>';
      }).join('');
      return '<div class="ss-wt-group"><div class="ss-wt-head">' + esc(d.label) + '</div>' + rows + '</div>';
    }).join('');
    host.querySelectorAll('.ss-roster-link').forEach(function (btn) {
      btn.addEventListener('click', function (e) { e.preventDefault(); openRoster(btn.getAttribute('data-abbr'), btn.getAttribute('data-mlbid')); });
    });
    host.querySelectorAll('input').forEach(function (inp) {
      inp.addEventListener('input', function () {
        if (locked) return;
        var abbr = inp.getAttribute('data-abbr');
        var n = parseInt(inp.value, 10);
        if (inp.value === '' || isNaN(n)) { delete state.team_win_totals[abbr]; updateProgress(); return; }
        n = Math.max(0, Math.min(162, n));
        state.team_win_totals[abbr] = n;
        updateProgress();
      });
    });
  }

  function syncDownstream() {
    // clear champions no longer in the field
    if (state.al_champion && playoffTeams('AL').indexOf(state.al_champion) < 0) state.al_champion = null;
    if (state.nl_champion && playoffTeams('NL').indexOf(state.nl_champion) < 0) state.nl_champion = null;
    if (state.world_series_champion && [state.al_champion, state.nl_champion].indexOf(state.world_series_champion) < 0) state.world_series_champion = null;
  }

  function updateProgress() {
    var divs = Object.keys(state.division_winners).length;
    var wc = (state.wild_card_teams.AL.length) + (state.wild_card_teams.NL.length);
    var champs = [state.al_champion, state.nl_champion, state.world_series_champion].filter(Boolean).length;
    var wt = Object.keys(state.team_win_totals).length;
    el('ss-progress').innerHTML =
      pill('Divisions', divs + '/6', divs === 6) +
      pill('Wild Cards', wc + '/6', wc === 6) +
      pill('Champions', champs + '/3', champs === 3) +
      pill('Win Totals', wt + '/30', wt > 0);
    var ready = divs === 6 && state.world_series_champion;
    var btn = el('ss-lock-btn');
    if (btn && !locked) { btn.disabled = !ready; btn.title = ready ? '' : 'Pick all 6 division winners and a World Series champion to lock'; }
  }
  function pill(label, val, done) {
    return '<span class="ss-pill' + (done ? ' done' : '') + '"><i class="fas ' + (done ? 'fa-circle-check' : 'fa-circle') + '"></i>' + label + ' <b>' + val + '</b></span>';
  }

  function renderAll() {
    renderDivisions(); renderWildCards(); renderChampions(); renderBracket(); renderWinTotals(); updateProgress();
  }

  // ---------- Status banners ----------
  function setStatus(html, cls) {
    var s = el('ss-status');
    s.className = 'ss-statusbar' + (cls ? ' ' + cls : '');
    s.innerHTML = html;
    s.style.display = html ? 'block' : 'none';
  }
  function showLoggedOut() {
    el('ss-auth-cta').style.display = isLoggedIn() ? 'none' : 'flex';
  }

  function applyPrediction(p) {
    if (!p) return;
    state.division_winners = p.division_winners || {};
    state.wild_card_teams = { AL: (p.wild_card_teams && p.wild_card_teams.AL) || [], NL: (p.wild_card_teams && p.wild_card_teams.NL) || [] };
    state.al_champion = p.al_champion || null;
    state.nl_champion = p.nl_champion || null;
    state.world_series_champion = p.world_series_champion || null;
    state.team_win_totals = p.team_win_totals || {};
    state.is_public = p.is_public !== false;
    locked = !!p.locked;
    var pub = el('ss-public-toggle'); if (pub) pub.checked = state.is_public;
  }

  function showLockedState(p) {
    var when = p.locked_at ? new Date(p.locked_at).toLocaleString() : '';
    setStatus('<i class="fas fa-lock"></i> <b>Predictions locked.</b> Submitted ' + esc(when) + '. Your picks are timestamped and public on your record. <a href="/u/' + esc(p.username || '') + '/">View your profile</a>', 'locked');
    var actions = el('ss-actions'); if (actions) actions.style.display = 'none';
    document.querySelectorAll('#ss-builder input, #ss-builder select, #ss-builder button.ss-team-btn').forEach(function (n) { n.disabled = true; });
  }

  // ---------- Submit ----------
  function buildPayload(lock) {
    return {
      season_year: SEASON, lock: lock,
      division_winners: state.division_winners,
      wild_card_teams: state.wild_card_teams,
      al_champion: state.al_champion,
      nl_champion: state.nl_champion,
      world_series_champion: state.world_series_champion,
      team_win_totals: state.team_win_totals,
      is_public: !!state.is_public
    };
  }

  function submit(lock) {
    if (!isLoggedIn()) { setStatus('<i class="fas fa-circle-exclamation"></i> Please log in to submit your predictions.', 'err'); return; }
    var btn = lock ? el('ss-lock-btn') : el('ss-draft-btn');
    if (btn) { btn.disabled = true; btn.dataset._t = btn.innerHTML; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...'; }
    fetch(API + '/api/season-simulator/submit', { method: 'POST', headers: authHeaders(), body: JSON.stringify(buildPayload(lock)) })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, status: r.status, j: j }; }); })
      .then(function (res) {
        if (btn) { btn.innerHTML = btn.dataset._t; btn.disabled = false; }
        if (!res.ok) {
          var msg = (res.j && res.j.error) || 'Submit failed';
          if (res.j && res.j.details) msg += ': ' + res.j.details.join(', ');
          setStatus('<i class="fas fa-circle-exclamation"></i> ' + esc(msg), 'err');
          return;
        }
        var p = res.j.prediction;
        applyPrediction(p);
        renderAll();
        if (p.locked) { showLockedState(p); }
        else { setStatus('<i class="fas fa-circle-check"></i> <b>Draft saved.</b> Come back any time before you lock. Locking timestamps your picks permanently.', 'ok'); }
        loadPublic();
      })
      .catch(function (e) {
        if (btn) { btn.innerHTML = btn.dataset._t; btn.disabled = false; }
        setStatus('<i class="fas fa-circle-exclamation"></i> Network error. Please try again.', 'err');
      });
  }

  // ---------- Live roster modal (StatsAPI, fetched fresh so never stale) ----------
  var POS_ORDER = ['SP', 'P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'OF', 'DH', 'TWP'];
  function openRoster(abbr, mlbId) {
    var t = TEAM_BY_ABBR[abbr] || {};
    var modal = el('ss-roster-modal');
    el('ss-roster-title').textContent = (t.name || abbr) + ' Roster';
    el('ss-roster-sub').innerHTML = esc((t.ballpark || '') + (t.city ? ' (' + t.city + ')' : '')) + ' &middot; Mgr: ' + esc(t.manager || '') + ' &middot; <span class="ss-muted">Live active roster, 2026</span>';
    el('ss-roster-body').innerHTML = '<p class="ss-muted" style="padding:24px;text-align:center;"><i class="fas fa-spinner fa-spin"></i> Loading live roster...</p>';
    modal.style.display = 'flex';
    fetch('https://statsapi.mlb.com/api/v1/teams/' + encodeURIComponent(mlbId) + '/roster?rosterType=active&season=' + SEASON)
      .then(function (r) { return r.json(); })
      .then(function (d) {
        var roster = (d && d.roster) || [];
        if (!roster.length) { el('ss-roster-body').innerHTML = '<p class="ss-muted" style="padding:24px;text-align:center;">No active roster returned right now. Try again shortly.</p>'; return; }
        roster.sort(function (a, b) {
          var pa = POS_ORDER.indexOf(a.position.abbreviation); var pb = POS_ORDER.indexOf(b.position.abbreviation);
          if (pa < 0) pa = 99; if (pb < 0) pb = 99;
          if (pa !== pb) return pa - pb;
          return a.person.fullName.localeCompare(b.person.fullName);
        });
        var pitchers = roster.filter(function (p) { return /P/.test(p.position.abbreviation) && p.position.abbreviation !== 'TWP'; });
        var hitters = roster.filter(function (p) { return !/^P$|^SP$|^RP$/.test(p.position.abbreviation); });
        function rowHtml(p) {
          return '<div class="ss-roster-row"><span class="ss-jersey">' + esc(p.jerseyNumber || '--') + '</span>' +
            '<span class="ss-pos">' + esc(p.position.abbreviation) + '</span>' +
            '<span class="ss-pname">' + esc(p.person.fullName) + '</span></div>';
        }
        el('ss-roster-body').innerHTML =
          '<div class="ss-roster-cols">' +
          '<div><h4>Pitchers (' + pitchers.length + ')</h4>' + pitchers.map(rowHtml).join('') + '</div>' +
          '<div><h4>Position Players (' + hitters.length + ')</h4>' + hitters.map(rowHtml).join('') + '</div></div>';
      })
      .catch(function () { el('ss-roster-body').innerHTML = '<p class="ss-muted" style="padding:24px;text-align:center;">Could not load roster (data source unreachable).</p>'; });
  }
  function closeRoster() { var m = el('ss-roster-modal'); if (m) m.style.display = 'none'; }

  // ---------- Graded leaderboard ----------
  function loadLeaderboard() {
    var sec = el('ss-leaderboard-section'); var host = el('ss-leaderboard-list');
    if (!sec) return;
    fetch(API + '/api/season-simulator/leaderboard?year=' + SEASON + '&limit=50')
      .then(function (r) { return r.json(); })
      .then(function (d) {
        var rows = (d && d.leaderboard) || [];
        if (!rows.length) { sec.style.display = 'none'; return; }
        sec.style.display = 'block';
        host.innerHTML = '<div class="ss-pub-head"><span>Rank</span><span>Member</span><span>Score</span><span>WS</span><span>Graded</span></div>' +
          rows.map(function (p) {
            return '<div class="ss-pub-row"><span class="ss-rank">#' + p.rank + '</span>' +
              '<a href="/u/' + esc(p.username) + '/" class="ss-pub-user">@' + esc(p.username) + '</a>' +
              '<span class="ss-pub-ws"><b>' + (p.score != null ? p.score : 0) + '</b></span>' +
              '<span>' + esc(p.world_series_champion || '--') + '</span>' +
              '<span class="ss-muted">' + (p.graded_at ? new Date(p.graded_at).toLocaleDateString() : '') + '</span></div>';
          }).join('');
      })
      .catch(function () { sec.style.display = 'none'; });
  }

  // ---------- Public feed ----------
  function loadPublic() {
    var host = el('ss-public-list');
    fetch(API + '/api/season-simulator/predictions?year=' + SEASON + '&limit=50')
      .then(function (r) { return r.json(); })
      .then(function (d) {
        var rows = (d && d.predictions) || [];
        el('ss-public-count').textContent = rows.length;
        if (!rows.length) { host.innerHTML = '<p class="ss-muted" style="padding:18px;text-align:center;">No locked predictions yet. Be the first to call the season.</p>'; return; }
        host.innerHTML = '<div class="ss-pub-head"><span>Member</span><span>WS Champion</span><span>AL</span><span>NL</span><span>Locked</span></div>' +
          rows.map(function (p) {
            return '<div class="ss-pub-row"><a href="/u/' + esc(p.username) + '/" class="ss-pub-user">@' + esc(p.username) + '</a>' +
              '<span class="ss-pub-ws">' + esc(p.world_series_champion || '--') + '</span>' +
              '<span>' + esc(p.al_champion || '--') + '</span>' +
              '<span>' + esc(p.nl_champion || '--') + '</span>' +
              '<span class="ss-muted">' + (p.locked_at ? new Date(p.locked_at).toLocaleDateString() : '') + '</span></div>';
          }).join('');
      })
      .catch(function () { host.innerHTML = '<p class="ss-muted" style="padding:18px;text-align:center;">Could not load predictions.</p>'; });
  }

  // ---------- Init ----------
  function init() {
    showLoggedOut();
    var pub = el('ss-public-toggle');
    if (pub) pub.addEventListener('change', function () { state.is_public = pub.checked; });
    el('ss-lock-btn').addEventListener('click', function () {
      if (confirm('Lock your 2026 MLB season predictions? Once locked they are timestamped and cannot be changed.')) submit(true);
    });
    el('ss-draft-btn').addEventListener('click', function () { submit(false); });
    var clr = el('ss-clear-btn');
    if (clr) clr.addEventListener('click', function () {
      if (locked) return;
      if (!confirm('Clear every pick and start over? This only affects your unsaved builder, not a locked entry.')) return;
      state.division_winners = {}; state.wild_card_teams = { AL: [], NL: [] };
      state.al_champion = null; state.nl_champion = null; state.world_series_champion = null;
      state.team_win_totals = {};
      renderAll(); setStatus('<i class="fas fa-eraser"></i> Builder cleared. Make your picks, then save or lock.', 'ok');
    });
    var rc = el('ss-roster-close'); if (rc) rc.addEventListener('click', closeRoster);
    var rm = el('ss-roster-modal');
    if (rm) rm.addEventListener('click', function (e) { if (e.target === rm) closeRoster(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeRoster(); });

    loadTeams(0);
  }

  // Render placeholders so the page never looks blank while the API (which can
  // cold-start on a free Render instance) is waking up. Retries transient fails.
  function showBuilderLoading() {
    var msg = '<div class="ss-loading"><i class="fas fa-spinner fa-spin"></i> Loading teams...</div>';
    ['ss-build-divisions', 'ss-build-wildcards', 'ss-build-champions', 'ss-build-wintotals', 'ss-build-bracket'].forEach(function (id) {
      var n = el(id); if (n) n.innerHTML = msg;
    });
  }
  function loadTeams(attempt) {
    showBuilderLoading();
    if (attempt === 0) setStatus('<i class="fas fa-spinner fa-spin"></i> Warming up the simulator...', 'ok');
    fetch(API + '/api/season-simulator/teams')
      .then(function (r) { if (!r.ok) throw new Error('http ' + r.status); return r.json(); })
      .then(function (d) {
        if (!d.teams || !d.teams.length) throw new Error('empty');
        TEAMS = d.teams; DIVISIONS = d.divisions || [];
        TEAM_BY_ABBR = {}; TEAMS.forEach(function (t) { TEAM_BY_ABBR[t.abbr] = t; });
        renderAll();
        setStatus('', '');
        if (isLoggedIn()) {
          fetch(API + '/api/season-simulator/me?year=' + SEASON, { headers: authHeaders() })
            .then(function (r) { return r.ok ? r.json() : { prediction: null }; })
            .then(function (d2) {
              if (d2 && d2.prediction) { applyPrediction(d2.prediction); renderAll(); if (locked) showLockedState(d2.prediction); else setStatus('<i class="fas fa-rotate"></i> Loaded your saved draft. Keep editing, then lock when ready.', 'ok'); }
            }).catch(function () {});
        }
        loadPublic();
        loadLeaderboard();
      })
      .catch(function () {
        if (attempt < 4) { setTimeout(function () { loadTeams(attempt + 1); }, 3000 + attempt * 2000); return; }
        setStatus('<i class="fas fa-circle-exclamation"></i> Could not reach the simulator. <button type="button" id="ss-retry" class="ss-roster-link" style="font-size:0.95rem;">Retry</button>', 'err');
        var rb = el('ss-retry'); if (rb) rb.addEventListener('click', function () { loadTeams(0); });
      });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
