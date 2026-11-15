/* ACCOUNT_SETTINGS_20261115 -- Account Settings control panel (/account/settings/).
   Reads GET /api/account/settings, saves each change at once with
   PUT /api/account/settings, and reverts the control if the save fails. */
(function () {
  'use strict';

  var root = document.getElementById('acctRoot');
  var toastEl = document.getElementById('acctToast');
  var state = null;

  var ICON = {
    lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
    eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>',
    sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
    bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>',
    shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/></svg>'
  };

  var ALERTS = [
    { key: 'new_followers', t: 'New followers', s: 'When someone starts following you.' },
    { key: 'comments_replies', t: 'Comments and replies', s: 'Comments on your picks and posts, and replies in forum threads you started or follow.' },
    { key: 'mentions', t: 'Mentions', s: 'When someone tags you with @ in a post or thread.' },
    { key: 'pick_results', t: 'Pick grading and results', s: 'When your picks are graded, and how picks you tailed or faded turned out.' },
    { key: 'contests', t: 'Contest updates', s: 'Your finish and final standings when a contest you entered is graded.' },
    { key: 'awards', t: 'Awards and achievements', s: 'Awards you earn and congratulations on your milestones.' }
  ];

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  function toast(msg, err) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.toggle('err', !!err);
    toastEl.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { toastEl.classList.remove('show'); }, 2600);
  }

  function status(section, kind, text) {
    var el = document.getElementById('acctStatus-' + section);
    if (!el) return;
    el.className = 'acct-status show ' + kind;
    el.textContent = text;
    clearTimeout(el._t);
    if (kind === 'ok') el._t = setTimeout(function () { el.classList.remove('show'); }, 2200);
  }

  function loggedIn() {
    try { return !!(window.api && typeof api.isLoggedIn === 'function' && api.isLoggedIn()); } catch (e) { return false; }
  }

  function request(method, body) {
    var opts = { method: method };
    if (body !== undefined) opts.body = body;
    return window.api.request('/account/settings', opts);
  }

  function themeLocal(theme) {
    if (window.TMRTheme && typeof TMRTheme.set === 'function') TMRTheme.set(theme);
    else {
      try { localStorage.setItem('tmr_theme', theme); } catch (e) {}
      var light = theme === 'light' || (theme === 'system' && window.matchMedia && matchMedia('(prefers-color-scheme: light)').matches);
      if (light) {
        document.documentElement.setAttribute('data-tmr-theme', 'light');
        if (!document.getElementById('tmrThemeLight0')) {
          var l = document.createElement('link'); l.rel = 'stylesheet'; l.id = 'tmrThemeLight0'; l.href = '/static/css/tmr-theme-light.css?v=7a6ea6634b49';
          document.head.appendChild(l);
        }
      } else document.documentElement.removeAttribute('data-tmr-theme');
    }
    try { sessionStorage.setItem('tmr_theme_synced', '1'); } catch (e) {}
  }

  function radio(name, value, checked, title, sub, disabled, extra) {
    return '<label class="acct-opt' + (extra ? ' ' + extra.cls : '') + '"><input type="radio" name="' + name + '" value="' + value + '"' +
      (checked ? ' checked' : '') + (disabled ? ' disabled' : '') + '><span class="acct-opt-in">' + (extra ? extra.pre : '') +
      '<span class="acct-opt-row" style="display:flex;gap:12px;align-items:flex-start"><span class="acct-radio" aria-hidden="true"></span><span><span class="acct-opt-t">' + esc(title) +
      '</span><span class="acct-opt-s">' + esc(sub) + '</span></span></span></span></label>';
  }

  function sw(id, on, label, disabled) {
    return '<label class="acct-sw"><input type="checkbox" role="switch" id="' + id + '" aria-label="' + esc(label) + '"' +
      (on ? ' checked' : '') + (disabled ? ' disabled' : '') + '><span></span></label>';
  }

  function preview(kind) {
    var inner = '<i class="pg"></i><i class="bar"></i><i class="c1"></i><i class="c2"></i><i class="c3"></i><i class="ln"></i><i class="ln2"></i>';
    if (kind !== 'sys') return '<span class="acct-prev ' + kind + '" aria-hidden="true">' + inner + '</span>';
    return '<span class="acct-prev sys" aria-hidden="true"><span class="half acct-prev dk" style="border:0">' + inner + '</span><span class="half r acct-prev lt" style="border:0">' + inner + '</span></span>';
  }

  function render() {
    var p = state.privacy, th = state.appearance.theme, n = state.notifications;
    var locked = !!p.locked;
    var email = n.email || {}, ann = (email.announcements || {});
    var html = '' +
      '<div class="acct-grid">' +
      '<nav class="acct-nav" aria-label="Settings sections">' +
        '<a href="#privacy" class="on">' + ICON.eye + 'Picks &amp; Privacy</a>' +
        '<a href="#appearance">' + ICON.sun + 'Appearance</a>' +
        '<a href="#notifications">' + ICON.bell + 'Notifications</a>' +
      '</nav>' +
      '<div class="acct-sections">' +

      '<section class="acct-card" id="privacy" aria-labelledby="acctPrivH">' +
        '<div class="acct-card-h"><div><h2 id="acctPrivH">Picks &amp; Privacy</h2>' +
        '<p class="acct-card-d">Who can see your picks before they are graded.</p></div>' +
        '<span class="acct-status" id="acctStatus-privacy" aria-live="polite"></span></div>' +
        '<div class="acct-card-b">' +
          '<div class="acct-lock">' + ICON.lock + '<div><strong>All graded picks are public to maintain transparency.</strong>' +
          '<span>You control who can see your pending picks. Wins and losses stay on your verified record and can never be hidden or removed.</span></div></div>' +
          '<span class="acct-label" id="acctPendL">Pending picks visibility</span>' +
          '<div class="acct-opts" role="radiogroup" aria-labelledby="acctPendL">' +
            radio('pending', 'public', p.pending_visibility === 'public', 'Public', 'Everyone can see my pending picks.', locked) +
            radio('pending', 'private', p.pending_visibility === 'private', 'Private', 'Only I can see my pending picks until they are graded.', locked) +
          '</div>' +
          '<p class="acct-note">' + (locked
            ? 'Your picks are sold through the marketplace, so they stay private until graded.'
            : 'Applies to picks you make from now on, and you can still choose on the pick slip for any single pick. A pick already shown publicly stays public. The moment a pick is graded it becomes public, whatever this is set to.') + '</p>' +
        '</div>' +
      '</section>' +

      '<section class="acct-card" id="appearance" aria-labelledby="acctAppH">' +
        '<div class="acct-card-h"><div><h2 id="acctAppH">Appearance</h2>' +
        '<p class="acct-card-d">Saved to your account and restored on every device you sign in on.</p></div>' +
        '<span class="acct-status" id="acctStatus-appearance" aria-live="polite"></span></div>' +
        '<div class="acct-card-b">' +
          '<div class="acct-opts three acct-theme" role="radiogroup" aria-label="Theme">' +
            radio('theme', 'dark', th === 'dark', 'Dark', 'The classic TrustMyRecord look.', false, { cls: '', pre: preview('dk') }) +
            radio('theme', 'light', th === 'light', 'Light', 'Bright panels and dark type.', false, { cls: '', pre: preview('lt') }) +
            radio('theme', 'system', th === 'system', 'System Default', 'Follows your device setting.', false, { cls: '', pre: preview('sys') }) +
          '</div>' +
        '</div>' +
      '</section>' +

      '<section class="acct-card" id="notifications" aria-labelledby="acctNotH">' +
        '<div class="acct-card-h"><div><h2 id="acctNotH">Notifications</h2>' +
        '<p class="acct-card-d">Choose the alerts you get in your TrustMyRecord bell and by email.</p></div>' +
        '<span class="acct-status" id="acctStatus-notifications" aria-live="polite"></span></div>' +
        '<div class="acct-card-b">' +
          '<div class="acct-rows" role="table" aria-label="Notification preferences">' +
            '<div class="acct-rows-h" role="row"><span role="columnheader">Alert</span><span role="columnheader">In app</span><span role="columnheader">Email</span></div>' +
            ALERTS.map(function (a) {
              var v = (n.in_app && n.in_app[a.key]) || { on: true };
              return '<div class="acct-row" role="row"><div role="cell"><span class="acct-row-t">' + esc(a.t) +
                (v.partial ? ' <span class="acct-chip" title="Some forum reply alerts are off on the Notifications page">Partly on</span>' : '') +
                '</span><span class="acct-row-s">' + esc(a.s) + '</span></div>' +
                '<div class="acct-cells"><div class="acct-cell" role="cell"><span class="acct-cell-l">In app</span>' + sw('acctN-' + a.key, v.on, a.t + ' in app') + '</div>' +
                '<div class="acct-cell none" role="cell"></div></div></div>';
            }).join('') +
            '<div class="acct-row" role="row"><div role="cell"><span class="acct-row-t">TMR announcements and product updates</span>' +
              '<span class="acct-row-s">' + esc(ann.locked ? ann.locked_reason : (email.available === false ? 'Add an email address to your account to get these.' : 'New features, contests and occasional news from TrustMyRecord, by email.')) + '</span></div>' +
              '<div class="acct-cells"><div class="acct-cell none" role="cell"></div>' +
              '<div class="acct-cell" role="cell"><span class="acct-cell-l">Email</span>' + sw('acctE-announcements', !!ann.on, 'Announcements by email', ann.locked || email.available === false) + '</div></div></div>' +
          '</div>' +
          '<p class="acct-essential">' + ICON.shield + '<span>Security and account notices, direct messages, purchases, payouts and support replies are always delivered. More forum alert controls are on the <a href="/notifications/">Notifications page</a>.</span></p>' +
        '</div>' +
      '</section>' +
      '</div></div>';
    root.innerHTML = html;
    wire();
  }

  function save(section, body, revert, okMsg) {
    status(section, 'busy', 'Saving...');
    return request('PUT', body).then(function (next) {
      if (next && next.privacy) state = next;
      status(section, 'ok', 'Saved');
      if (okMsg) toast(okMsg);
      return next;
    }).catch(function (err) {
      revert();
      var msg = (err && err.message && !/^HTTP|fetch|network/i.test(err.message)) ? err.message : 'Could not save. Check your connection and try again.';
      status(section, 'err', 'Not saved');
      toast(msg, true);
    });
  }

  function wire() {
    root.querySelectorAll('input[name="pending"]').forEach(function (r) {
      r.addEventListener('change', function () {
        var prev = state.privacy.pending_visibility;
        var v = r.value;
        save('privacy', { pending_visibility: v }, function () {
          var back = root.querySelector('input[name="pending"][value="' + prev + '"]'); if (back) back.checked = true;
        }, v === 'private' ? 'New pending picks are private' : 'New pending picks are public').then(function (next) {
          if (next && next.privacy) state.privacy = next.privacy;
        });
      });
    });

    root.querySelectorAll('input[name="theme"]').forEach(function (r) {
      r.addEventListener('change', function () {
        var prev = state.appearance.theme;
        var v = r.value;
        themeLocal(v);
        save('appearance', { theme: v }, function () {
          themeLocal(prev);
          var back = root.querySelector('input[name="theme"][value="' + prev + '"]'); if (back) back.checked = true;
        }, (v === 'system' ? 'System Default' : v.charAt(0).toUpperCase() + v.slice(1)) + ' appearance saved');
      });
    });

    ALERTS.forEach(function (a) {
      var cb = document.getElementById('acctN-' + a.key);
      if (!cb) return;
      cb.addEventListener('change', function () {
        var on = cb.checked, body = { notifications: {} };
        body.notifications[a.key] = on;
        save('notifications', body, function () { cb.checked = !on; }).then(function (next) {
          if (next) { var chip = cb.closest('.acct-row').querySelector('.acct-chip'); if (chip) chip.remove(); }
        });
      });
    });

    var e = document.getElementById('acctE-announcements');
    if (e) e.addEventListener('change', function () {
      var on = e.checked;
      save('notifications', { email: { announcements: on } }, function () { e.checked = !on; });
    });

    // Section nav: highlight the section in view; smooth scroll on click.
    var links = root.querySelectorAll('.acct-nav a');
    links.forEach(function (l) {
      l.addEventListener('click', function (ev) {
        var t = document.querySelector(l.getAttribute('href'));
        if (!t) return;
        ev.preventDefault();
        t.scrollIntoView({ behavior: 'smooth', block: 'start' });
        history.replaceState(null, '', l.getAttribute('href'));
      });
    });
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (!en.isIntersecting) return;
          links.forEach(function (l) { l.classList.toggle('on', l.getAttribute('href') === '#' + en.target.id); });
        });
      }, { rootMargin: '-30% 0px -60% 0px' });
      ['privacy', 'appearance', 'notifications'].forEach(function (id) { var s = document.getElementById(id); if (s) io.observe(s); });
    }
    if (location.hash) { var t0 = document.querySelector(location.hash); if (t0) setTimeout(function () { t0.scrollIntoView({ block: 'start' }); }, 50); }
  }

  function gate() {
    root.innerHTML = '<div class="acct-card acct-gate"><h2>Sign in to manage your settings</h2>' +
      '<p class="acct-card-d" style="margin:0 0 20px">Your privacy, appearance and notification choices are saved to your account.</p>' +
      '<a class="acct-btn" href="/login/?next=' + encodeURIComponent('/account/settings/') + '">Log in</a></div>';
  }

  function failed() {
    root.innerHTML = '<div class="acct-card acct-gate"><h2>Settings did not load</h2>' +
      '<p class="acct-card-d" style="margin:0 0 20px">We could not reach your account just now.</p>' +
      '<button type="button" class="acct-btn" id="acctRetry">Try again</button></div>';
    document.getElementById('acctRetry').addEventListener('click', load);
  }

  function load() {
    if (!window.api || !loggedIn()) { gate(); return; }
    request('GET').then(function (d) {
      if (!d || !d.privacy) throw new Error('bad');
      state = d;
      // The account is the source of truth for appearance on this device too.
      var cur = window.TMRTheme ? TMRTheme.get() : null;
      if (d.appearance && d.appearance.theme && cur !== d.appearance.theme) themeLocal(d.appearance.theme);
      render();
    }).catch(function (err) {
      if (err && (err.status === 401 || /401|unauthor|expired/i.test(String(err.message || '')))) gate();
      else failed();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load); else load();
})();
