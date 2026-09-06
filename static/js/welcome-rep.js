/* =============================================================================
   WELCOME — "Who do you rep?"  (welcome-rep.js)
   -----------------------------------------------------------------------------
   The one place a brand new member is asked for their favourite team, right
   after signup, while they are still in the mood to answer.

   It is ENCOURAGEMENT, NOT A GATE. Nothing on this page or anywhere else waits
   on it: the card can be skipped with one tap, signup already completed before
   this page loaded, and a member who ignores it still gets a real avatar (the
   deterministic initials badge shown in the preview).

   Picking a team writes users.favorite_teams through PUT /users/profile — the
   same field the profile's Sports Identity card edits, merged rather than
   replaced, so this can never wipe a team a returning member already had.

   Created Sep 5, 2026.
   ============================================================================= */
(function () {
  'use strict';
  if (window.__tmrWelcomeRep) return;
  window.__tmrWelcomeRep = true;

  var API = (window.TMR_API_BASE || window.API_BASE_URL || 'https://trustmyrecord-api.onrender.com').replace(/\/$/, '');

  function token() {
    try {
      return localStorage.getItem('trustmyrecord_token') ||
             localStorage.getItem('tmr_token') ||
             localStorage.getItem('accessToken') || '';
    } catch (e) { return ''; }
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function api(path, opts) {
    var o = opts || {};
    o.headers = Object.assign({ Accept: 'application/json' }, o.headers || {});
    var t = token();
    if (t) o.headers.Authorization = 'Bearer ' + t;
    return fetch(API + path, o).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }

  var CSS = [
    '.wr-card{display:flex;gap:14px;align-items:flex-start;padding:16px;border:1px solid #D2DEEA;border-radius:14px;background:#0E1620;margin-top:12px}',
    '.wr-face{width:52px;height:52px;border-radius:50%;flex:0 0 auto;background-size:cover;background-position:center;box-shadow:0 0 0 1px rgba(255,255,255,.1)}',
    '.wr-body{flex:1 1 auto;min-width:0}',
    '.wr-title{margin:0;font-size:16px;font-weight:800;color:#DCE7F4;line-height:1.3}',
    '.wr-why{margin:4px 0 0;font-size:13.5px;color:#C3D6EA;line-height:1.5}',
    '.wr-row{display:flex;gap:8px;flex-wrap:wrap;margin-top:11px}',
    '.wr-row select{background:#121C28;color:#DCE7F4;border:1px solid #D2DEEA;border-radius:10px;padding:11px 12px;font-size:14px;min-height:44px;flex:1 1 150px;max-width:100%}',
    '.wr-act{display:inline-flex;align-items:center;justify-content:center;gap:8px;background:#0B4FA8;color:#04121f;border:0;border-radius:10px;padding:12px 18px;font-weight:800;font-size:14.5px;cursor:pointer;min-height:44px}',
    '.wr-act[disabled]{opacity:.55;cursor:default}',
    '.wr-links{margin-top:10px;display:flex;gap:14px;flex-wrap:wrap;align-items:center}',
    '.wr-links a{color:#C3D6EA;font-size:13px;font-weight:600;text-decoration:underline;cursor:pointer}',
    '.wr-msg{display:block;margin-top:8px;font-size:12.5px;font-weight:700;min-height:1.2em;color:#C3D6EA}',
    '.wr-msg.ok{color:#2ECC71}',
    '@media(max-width:520px){.wr-act{width:100%}}'
  ].join('');

  function injectCss() {
    if (document.getElementById('wr-css')) return;
    var s = document.createElement('style');
    s.id = 'wr-css';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  function faceFor(user) {
    if (!window.TMRAvatar) return '';
    return window.TMRAvatar.dataUri(window.TMRAvatar.identity(user || {}), 96);
  }

  function build(user, catalog) {
    var host = document.querySelector('.wc-wrap section') || document.querySelector('.wc-wrap');
    if (!host) return;

    var card = document.createElement('div');
    card.className = 'wr-card';
    card.id = 'wcStepRep';
    var face = faceFor(user);
    card.innerHTML =
      '<span class="wr-face" id="wrFace"' + (face ? ' style="background-image:url(&quot;' + face.replace(/"/g, '&quot;') + '&quot;)"' : '') + '></span>' +
      '<div class="wr-body">' +
      '<h2 class="wr-title">Who do you rep?</h2>' +
      '<p class="wr-why">Choose your favorite team or upload your own avatar. This is the badge the site shows next to your name until you do.</p>' +
      '<div class="wr-row">' +
      '<select id="wrSport" aria-label="Sport"></select>' +
      '<select id="wrTeam" aria-label="Team"></select>' +
      '<button type="button" class="wr-act" id="wrSave">Rep them</button>' +
      '</div>' +
      '<span class="wr-msg" id="wrMsg" role="status"></span>' +
      '<div class="wr-links"><a href="/profile/" id="wrPhoto">Upload a photo instead</a>' +
      '<a id="wrSkip">Skip for now</a></div>' +
      '</div>';
    host.insertBefore(card, host.firstChild);

    var sportSel = card.querySelector('#wrSport');
    var teamSel = card.querySelector('#wrTeam');
    var msg = card.querySelector('#wrMsg');
    var saveBtn = card.querySelector('#wrSave');
    var sports = (catalog && catalog.sports) || [];

    if (!sports.length) {
      // No catalogue, no picker. The photo link and the skip still work, and
      // the member still has a real avatar either way.
      card.querySelector('.wr-row').innerHTML = '<a class="wr-act" href="/profile/">Pick your team on your profile</a>';
      return;
    }

    sportSel.innerHTML = sports.map(function (s) {
      return '<option value="' + esc(s.sportSlug) + '">' + esc(s.label) + '</option>';
    }).join('');

    function fillTeams() {
      var sport = sports.filter(function (s) { return s.sportSlug === sportSel.value; })[0] || sports[0];
      teamSel.innerHTML = '<option value="">Choose a team&hellip;</option>' + (sport.teams || []).map(function (t) {
        return '<option value="' + esc(t.name) + '">' + esc(t.name) + '</option>';
      }).join('');
    }
    fillTeams();
    sportSel.addEventListener('change', fillTeams);

    card.querySelector('#wrSkip').addEventListener('click', function () { card.remove(); });

    saveBtn.addEventListener('click', function () {
      var team = teamSel.value;
      if (!team) { msg.className = 'wr-msg'; msg.textContent = 'Pick a team first.'; return; }
      saveBtn.disabled = true;
      msg.className = 'wr-msg';
      msg.textContent = 'Saving…';
      var existing = (user && Array.isArray(user.favorite_teams)) ? user.favorite_teams.slice() : [];
      if (existing.indexOf(team) === -1) existing.unshift(team);
      var sportLabel = (sports.filter(function (s) { return s.sportSlug === sportSel.value; })[0] || {}).label;
      var sportsList = (user && Array.isArray(user.favorite_sports)) ? user.favorite_sports.slice() : [];
      if (sportLabel && sportsList.indexOf(sportLabel) === -1) sportsList.push(sportLabel);
      api('/api/users/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ favorite_teams: existing, favorite_sports: sportsList })
      }).then(function () {
        msg.className = 'wr-msg ok';
        msg.textContent = 'You rep the ' + team + '. Your badge is set.';
        saveBtn.textContent = 'Saved';
        var faceEl = card.querySelector('#wrFace');
        // Re-read the identity from the API so the preview shows the same badge
        // every other page will draw for them.
        if (faceEl && user && user.username) {
          faceEl.style.backgroundImage = 'url("' + API + '/api/users/'
            + encodeURIComponent(user.username) + '/avatar?t=' + Date.now() + '")';
        }
      }).catch(function () {
        saveBtn.disabled = false;
        msg.className = 'wr-msg';
        msg.textContent = 'That did not save. You can set it on your profile any time.';
      });
    });
  }

  function start() {
    if (!token()) return;
    injectCss();
    Promise.all([
      api('/api/auth/me').then(function (d) { return (d && (d.user || d)) || {}; }).catch(function () { return {}; }),
      fetch(API + '/api/teams/catalog').then(function (r) { return r.ok ? r.json() : { sports: [] }; }).catch(function () { return { sports: [] }; })
    ]).then(function (out) {
      var user = out[0] || {};
      // Somebody who already has a picture or a team does not need to be asked.
      var hasTeam = Array.isArray(user.favorite_teams) && user.favorite_teams.some(function (t) { return t && String(t).trim(); });
      if (user.avatar_url || hasTeam) return;
      // The resolver arrives with the shared nav bundle, which loads
      // asynchronously. Wait for it rather than drawing an empty circle.
      var waited = 0;
      (function whenReady() {
        if (!window.TMRAvatar && waited < 3000) { waited += 150; return setTimeout(whenReady, 150); }
        try { build(user, out[1]); } catch (e) { /* never break the welcome page */ }
      })();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
