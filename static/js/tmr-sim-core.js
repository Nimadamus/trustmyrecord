/* tmr-sim-core.js -- the shared front end behind the NBA and NHL simulators.
 *
 * It owns everything that is not a sport: talking to the public API, the team
 * selectors, the simulation-count and venue controls, the loading and error
 * states, the Simulate Again button, and the table and chart primitives.
 *
 * Each sport supplies a small adapter (see nba-simulator-app.js and
 * nhl-simulator-app.js) that says what its extra controls are and how to render
 * its own result. Nothing basketball or hockey specific lives in this file.
 *
 * SEED POLICY, mirrored from the API: a run with no seed is a NEW simulation and
 * the API answers it with a fresh random seed. Simulate Again therefore sends no
 * seed at all rather than reusing the last one, which is what stops the button
 * replaying one frozen game. The seed that was actually used comes back in
 * meta.seed and is put in the URL so a result can be shared and reproduced.
 */
(function (global) {
  'use strict';

  // The production API host. `window.TMR_SIM_API_HOST` overrides it so the
  // end-to-end test can drive the real page against a local backend; nothing in
  // the shipped pages sets it.
  var API_HOST = global.TMR_SIM_API_HOST || 'https://trustmyrecord-api.onrender.com';

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function pct(v, digits) {
    if (v == null || isNaN(v)) return '--';
    return (v * 100).toFixed(digits == null ? 1 : digits) + '%';
  }

  function signed(v, digits) {
    var n = Number(v);
    if (isNaN(n)) return '--';
    var s = n.toFixed(digits == null ? 1 : digits);
    return n > 0 ? '+' + s : s;
  }

  /* ---------------------------------------------------------------------- */

  function SimApp(cfg) {
    this.cfg = cfg;
    this.sport = cfg.sport;
    this.base = API_HOST + '/api/' + cfg.sport + '/public';
    this.teams = [];
    this.byRef = {};
    this.state = { sims: 10000, venue: 'home', away: null, home: null };
    // WHO IS NOT PLAYING, as a question the visitor asked rather than a fact the
    // feed reported. Ids only, one list per side; the API already accepts them
    // and already recomputes the whole projection around them.
    this.scenario = { home: [], away: [] };
    // MINUTE CAPS, keyed by player id. A man on a restriction is not out; the
    // route has taken these as long as it has taken the out list, and nothing
    // on the page could set one.
    this.minutes = { home: {}, away: {} };
    this.lastResult = null;
    this.running = false;
  }

  SimApp.prototype.api = function (path) {
    return fetch(this.base + path, { headers: { Accept: 'application/json' } })
      .then(function (r) {
        return r.json().then(function (body) {
          if (!r.ok) {
            var e = new Error(body && body.message ? body.message : 'Request failed');
            e.code = body && body.error;
            e.status = r.status;
            throw e;
          }
          return body;
        });
      })
      .catch(function (e) {
        if (e && e.code) throw e;
        var err = new Error('Network error. Please try again.');
        err.code = 'network';
        throw err;
      });
  };

  SimApp.prototype.mount = function () {
    var self = this;
    this.nodes = {
      setup: $('#setup'),
      away: $('#awayTeam'),
      home: $('#homeTeam'),
      simSeg: $('#simSeg'),
      venueSeg: $('#venueSeg'),
      extras: $('#extraControls'),
      run: $('#runBtn'),
      swap: $('#swapBtn'),
      result: $('#result'),
      prerun: $('#prerun'),
      modebar: $('#modebar'),
      schedulePane: $('#schedulePane'),
      customPane: $('#customPane'),
      games: $('#games'),
      slateLabel: $('#slateLabel'),
      datePicker: $('#slateDate'),
    };

    this.buildSegments();
    this.buildModes();
    this.buildMethodology();
    this.loadAccuracy();
    if (this.nodes.swap) {
      this.nodes.swap.addEventListener('click', function () { self.swap(); });
    }
    this.nodes.run.addEventListener('click', function () { self.run({ fresh: true }); });

    this.setState('loading', 'Loading teams');
    this.api('/teams').then(function (d) {
      self.teams = d.teams || [];
      self.teams.forEach(function (t) { self.byRef[t.ref] = t; });
      self.fillSelectors();
      self.setState('idle');
      if (self.cfg.onTeamsLoaded) self.cfg.onTeamsLoaded(self);
      self.renderPrerun();
      // The slate is a second, independent request. It must never delay or block
      // the simulator, so it is fired after the page is already usable and every
      // failure path is swallowed into a fallback message.
      self.loadSchedule();
      self.applyUrl();
    }).catch(function (e) {
      self.setState('error', e.message || 'Could not load teams.');
    });
  };

  /**
   * Wire up the simulation-count and venue controls.
   *
   * The buttons are SERVED IN THE HTML, not created here. Building them in
   * JavaScript grew the setup panel after first paint and pushed everything
   * below it down the page, which measured a cumulative layout shift of 0.8 on
   * a phone: four times Google's "poor" threshold, on the two pages the whole
   * project exists to rank. They are static markup now and this only binds
   * behaviour to them.
   */
  SimApp.prototype.buildSegments = function () {
    var self = this;

    var bind = function (host, read, after) {
      $$('button', host).forEach(function (b) {
        b.addEventListener('click', function () {
          read(b);
          $$('button', host).forEach(function (x) { x.classList.remove('on'); });
          b.classList.add('on');
          if (after) after();
        });
      });
    };

    bind(this.nodes.simSeg, function (b) {
      var n = parseInt(b.getAttribute('data-sims'), 10);
      if (n) self.state.sims = n;
    });
    bind(this.nodes.venueSeg, function (b) {
      self.state.venue = b.getAttribute('data-venue') || 'home';
    }, function () { self.renderPrerun(); });

    // Whatever the markup marks as selected is the starting state.
    var onCount = $('button.on', this.nodes.simSeg);
    if (onCount) this.state.sims = parseInt(onCount.getAttribute('data-sims'), 10) || this.state.sims;
    var onVenue = $('button.on', this.nodes.venueSeg);
    if (onVenue) this.state.venue = onVenue.getAttribute('data-venue') || this.state.venue;
  };

  /**
   * The two modes: a real slate, and any two teams. The MLB and NFL simulators
   * both open on a real slate, because the question most visitors arrive with is
   * "what does the model make of tonight's game", not "what if these two played".
   */
  SimApp.prototype.buildModes = function () {
    var self = this;
    if (!this.nodes.modebar) return;
    $$('button', this.nodes.modebar).forEach(function (b) {
      b.addEventListener('click', function () {
        self.setMode(b.getAttribute('data-mode'));
      });
    });
    if (this.nodes.datePicker) {
      this.nodes.datePicker.addEventListener('change', function () {
        self.loadSchedule(self.nodes.datePicker.value || null);
      });
    }
    var on = $('button.on', this.nodes.modebar);
    this.setMode(on ? on.getAttribute('data-mode') : 'schedule');
  };

  /**
   * The methodology endpoint existed and nothing on the page ever called it.
   * The footer link now expands it in place, so the model's own account of what
   * it does is one click away instead of only in the API.
   */
  SimApp.prototype.buildMethodology = function () {
    var self = this;
    var link = $('#methodLink');
    var host = $('#methodBody');
    if (!link || !host) return;
    var loaded = false;
    link.addEventListener('click', function (e) {
      e.preventDefault();
      var open = !host.hidden;
      host.hidden = open;
      link.setAttribute('aria-expanded', String(!open));
      if (open || loaded) return;
      host.innerHTML = '';
      host.appendChild(el('div', 'state', 'Loading'));
      self.api('/methodology').then(function (d) {
        loaded = true;
        host.innerHTML = '';
        host.appendChild(el('div', 'sechead', d.title));
        (d.sections || []).forEach(function (sec) {
          var block = el('div', 'notecard');
          var body = el('div');
          body.appendChild(el('b', '', sec.h + ': '));
          body.appendChild(document.createTextNode(sec.p));
          block.appendChild(body);
          host.appendChild(block);
        });
        if (d.model_version) host.appendChild(el('div', 'dim', 'Model ' + d.model_version));
        host.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }).catch(function () {
        host.innerHTML = '';
        host.appendChild(el('div', 'err', 'The methodology could not be loaded right now.'));
      });
    });
  };

  /**
   * How well the model has actually done, measured on completed seasons.
   *
   * Every other simulator on the site describes itself as calibrated. This one
   * shows the number, including the reliability curve, and including the fact
   * that hockey is barely better than picking the home team. A projection that
   * will not publish its own error rate is asking to be taken on faith.
   */
  SimApp.prototype.loadAccuracy = function () {
    var self = this;
    var host = $('#accuracyBody');
    if (!host) return;
    this.api('/accuracy').then(function (d) {
      self.accuracy = d;
      host.innerHTML = '';
      var c = d.combined;

      host.appendChild(kpis([
        { k: 'Games measured', v: c.games.toLocaleString(),
          s: (d.seasons ? d.seasons.length + ' seasons, ' : '') + 'each projected before it was played' },
        { k: 'Winner called correctly', v: pct(c.accuracy, 1),
          s: 'Against ' + pct(c.baselineAccuracy, 1) + ' for always picking the home team' },
        { k: 'Calibration error', v: pct(c.calibrationError, 1),
          s: 'How far a stated probability is from the real rate' },
        { k: 'Margin error', v: c.marginMae.toFixed(2),
          s: 'Against ' + c.baselineMarginMae.toFixed(2) + ' for the league average' },
      ]));

      // The reliability curve: predicted probability against what happened.
      var pts = (d.calibration || []).slice()
        .sort(function (a, b) { return a.predicted - b.predicted; });
      if (pts.length > 2) {
        var W = 320;
        var H = 200;
        var pad = 26;
        var svg = svgEl('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img' });
        var ttl = svgEl('title', {});
        ttl.textContent = 'Predicted win probability against the rate that actually happened';
        svg.appendChild(ttl);
        var X = function (v) { return pad + v * (W - pad * 2); };
        var Y = function (v) { return (H - pad) - v * (H - pad * 2); };
        // Perfect calibration is the diagonal.
        svg.appendChild(svgEl('line', {
          x1: X(0), y1: Y(0), x2: X(1), y2: Y(1),
          stroke: '#5b6b82', 'stroke-dasharray': '4 4', 'stroke-width': '1',
        }));
        var path = pts.map(function (b, i) { return (i ? 'L' : 'M') + X(b.predicted).toFixed(1) + ' ' + Y(b.actual).toFixed(1); }).join(' ');
        svg.appendChild(svgEl('path', { d: path, fill: 'none', stroke: '#34d399', 'stroke-width': '2' }));
        pts.forEach(function (b) {
          var r = Math.max(2.5, Math.min(7, Math.sqrt(b.n) / 3));
          var dot = svgEl('circle', { cx: X(b.predicted).toFixed(1), cy: Y(b.actual).toFixed(1), r: r.toFixed(1), fill: '#34d399', opacity: '0.75' });
          var t = svgEl('title', {});
          t.textContent = 'said ' + pct(b.predicted, 0) + ', happened ' + pct(b.actual, 0) + ' over ' + b.n + ' games';
          dot.appendChild(t);
          svg.appendChild(dot);
        });
        [['0%', 0], ['50%', 0.5], ['100%', 1]].forEach(function (tk) {
          var t = svgEl('text', { x: X(tk[1]).toFixed(1), y: H - 8, 'text-anchor': 'middle', fill: '#5b6b82', 'font-size': '10' });
          t.textContent = tk[0];
          svg.appendChild(t);
        });
        // A lone chart card would stretch to the full panel width and stand a
        // 320-wide drawing up eight hundred pixels tall; the grid caps it the
        // same way it caps the distribution charts.
        var grid = el('div', 'chartgrid');
        grid.appendChild(chartCard('Reliability: what it said against what happened', svg,
          [{ color: '#34d399', label: 'Each point is a band of projections; the dashed line is perfect' }]));
        host.appendChild(grid);
      }

      if (d.byMaturity && d.byMaturity.length) {
        var mat = el('div');
        mat.appendChild(el('h3', '', 'What it is worth at each stage of a season'));
        mat.appendChild(table(
          [
            { h: 'Games the model had seen', fmt: function (r) { return r.stage; } },
            { h: 'Projections', fmt: function (r) { return r.games.toLocaleString(); } },
            { h: 'Winner called', fmt: function (r) { return pct(r.accuracy, 1); } },
            { h: 'Edge over the baseline', fmt: function (r) { return r.brierSkill.toFixed(3); } },
          ],
          d.byMaturity,
        ));
        mat.appendChild(el('div', 'disc',
          'Early in a season the model has little to go on and its projections are close to a coin '
          + 'flip. That is the honest state of it, not a defect, and it is why the number above is '
          + 'an average across the whole of a season rather than the best part of one.'));
        host.appendChild(mat);
      }

      var note = el('p', 'dim');
      note.textContent = d.method;
      host.appendChild(note);

      // THE UNTOUCHED-SEASON RESULT, published next to the flattering one.
      //
      // Everything above is walk-forward, but the model's settings were chosen
      // by looking at how they scored across all of these seasons, which makes
      // the figure a little kinder than the model deserves. This is the same
      // model with its settings frozen on the early seasons and scored once on
      // seasons nobody had looked at. It is the number to judge it by, and it is
      // shown with its interval because a skill of two percent on two thousand
      // games and one of sixteen are not the same claim.
      if (d.holdout && d.holdout.segments && d.holdout.segments.length) {
        var ho = el('div', 'panel');
        ho.appendChild(el('div', 'sechead', 'Held-out seasons: '
          + d.holdout.holdout_seasons.join(' and ')
          + ', never looked at while anything was tuned'));
        ho.appendChild(table([
          { h: 'On these games', fmt: function (r) { return r.segment; } },
          { h: 'Games', fmt: function (r) { return r.games.toLocaleString(); } },
          { h: 'Winner called', fmt: function (r) { return pct(r.accuracy, 1); } },
          { h: 'Skill over picking the home side',
            fmt: function (r) { return pct(r.brier_skill, 1); },
            title: 'Brier skill: how much of the achievable improvement it captured' },
          { h: '95% interval', fmt: function (r) {
            return pct(r.ci[0], 1) + ' to ' + pct(r.ci[1], 1);
          } },
          { h: 'Margin error', fmt: function (r) { return r.margin_mae.toFixed(2); } },
        ], d.holdout.segments));
        var beats = d.holdout.segments[0].ci[0] > 0;
        ho.appendChild(el('div', 'disc',
          d.holdout_method + ' On the held-out seasons the interval for every game '
          + (beats ? 'sits above zero, so the model is measurably better than picking the home side. '
                   : 'includes zero, so the model has NOT been shown to beat picking the home side. ')
          + 'Expected calibration error on those seasons was '
          + pct(d.holdout.expected_calibration_error, 2)
          + ': a stated seventy percent came in near seventy.'));
        host.appendChild(ho);
      }

      if (d.bySeason && d.bySeason.length) {
        var per = el('div', 'dim');
        per.textContent = 'By season: ' + d.bySeason.map(function (f) {
          return f.season + ' ' + pct(f.accuracy, 1) + ' (' + f.games + ' games)';
        }).join(', ') + '.';
        host.appendChild(per);
      }
    }).catch(function () {
      host.innerHTML = '';
      host.appendChild(el('p', 'dim', 'Measured accuracy is unavailable right now.'));
    });
  };

  SimApp.prototype.setMode = function (mode) {
    this.mode = mode;
    if (this.nodes.modebar) {
      $$('button', this.nodes.modebar).forEach(function (x) {
        x.classList.toggle('on', x.getAttribute('data-mode') === mode);
      });
    }
    if (this.nodes.schedulePane) this.nodes.schedulePane.hidden = mode !== 'schedule';
    if (this.nodes.customPane) this.nodes.customPane.hidden = mode !== 'custom';
  };

  var DAY_FMT = { weekday: 'short', month: 'short', day: 'numeric' };

  SimApp.prototype.loadSchedule = function (date) {
    var self = this;
    var host = this.nodes.games;
    if (!host) return Promise.resolve();
    host.innerHTML = '';
    host.appendChild(el('div', 'state', 'Loading the schedule'));

    return this.api('/schedule' + (date ? '?date=' + encodeURIComponent(date) : ''))
      .then(function (d) { self.renderSchedule(d); })
      .catch(function () {
        // A schedule outage costs a convenience, never the tool.
        host.innerHTML = '';
        host.appendChild(el('div', 'unavail',
          'The schedule is unavailable right now. Custom Matchup still works: pick any two teams.'));
        if (self.nodes.slateLabel) self.nodes.slateLabel.textContent = '';
      });
  };

  SimApp.prototype.renderSchedule = function (d) {
    var self = this;
    var host = this.nodes.games;
    host.innerHTML = '';
    this.slate = d;

    if (this.nodes.datePicker && d.date) this.nodes.datePicker.value = d.date;

    if (this.nodes.slateLabel) {
      var label = '';
      if (d.date) {
        var pretty = new Date(d.date + 'T12:00:00Z').toLocaleDateString(undefined, DAY_FMT);
        label = d.date === d.today ? 'Today, ' + pretty : pretty;
        if (d.showing_next_available) label = 'Next games: ' + pretty;
      }
      this.nodes.slateLabel.textContent = label;
    }

    if (!d.games || !d.games.length) {
      host.appendChild(el('div', 'state', d.degraded
        ? 'The schedule is unavailable right now. Custom Matchup still works.'
        : 'No games on this date. Pick another date, or build a custom matchup.'));
      return;
    }

    d.games.forEach(function (g) {
      var card = el('div', 'game');
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');
      card.setAttribute('aria-label', 'Simulate ' + g.away.name + ' at ' + g.home.name);

      [['away', g.away], ['home', g.home]].forEach(function (pair) {
        var row = el('div', 'g-row');
        var team = el('div', 'team');
        team.appendChild(crest(pair[1], 26));
        team.appendChild(el('div', 'nm', pair[1].name));
        row.appendChild(team);
        if (g.completed && g.final) row.appendChild(el('div', 'mono', String(g.final[pair[0]])));
        else row.appendChild(el('div', 'dim', pair[0]));
        card.appendChild(row);
      });

      var meta = el('div', 'g-meta');
      var when = g.startsAt
        ? new Date(g.startsAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
        : '';
      var bits = [when, g.broadcast];
      if (g.seasonType && g.seasonType !== 'regular-season') bits.push(g.seasonType.replace(/-/g, ' '));
      meta.appendChild(el('span', '', bits.filter(Boolean).join(' \u00b7 ')));
      meta.appendChild(el('span', 'st ' + (g.state === 'post' ? 'final' : (g.state === 'in' ? 'live' : 'upcoming')),
        g.state === 'post' ? 'Final' : (g.state === 'in' ? (g.statusDetail || 'Live') : 'Simulate')));
      card.appendChild(meta);

      var pick = function () {
        $$('.game', host).forEach(function (x) { x.classList.remove('sel'); });
        card.classList.add('sel');
        self.nodes.away.value = g.away.ref;
        self.nodes.home.value = g.home.ref;
        self.state.away = g.away.ref;
        self.state.home = g.home.ref;
        self.state.venue = g.neutralSite ? 'neutral' : 'home';
        $$('button', self.nodes.venueSeg).forEach(function (x) {
          x.classList.toggle('on', x.getAttribute('data-venue') === self.state.venue);
        });
        self.clearScenario();
        if (self.cfg.onMatchupChanged) self.cfg.onMatchupChanged(self);
        self.renderPrerun();
        self.run({ fresh: true });
        // On a phone the result lands below the fold; without this a tap looks
        // like nothing happened.
        if (self.nodes.result && self.nodes.result.scrollIntoView) {
          self.nodes.result.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      };
      card.addEventListener('click', pick);
      card.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); }
      });
      host.appendChild(card);
    });
  };

  SimApp.prototype.fillSelectors = function () {
    var self = this;
    [this.nodes.away, this.nodes.home].forEach(function (sel) {
      sel.innerHTML = '';
      var ph = el('option', '', 'Choose a team');
      ph.value = '';
      sel.appendChild(ph);
      self.teams.forEach(function (t) {
        var o = el('option', '', t.name);
        o.value = t.ref;
        sel.appendChild(o);
      });
      sel.addEventListener('change', function () {
        self.state.away = self.nodes.away.value || null;
        self.state.home = self.nodes.home.value || null;
        self.clearScenario();
        if (self.cfg.onMatchupChanged) self.cfg.onMatchupChanged(self);
        self.renderPrerun();
      });
    });
  };

  /** Deep link: /nba-simulator/?away=<abbr>&home=<abbr>[&seed=N] */
  SimApp.prototype.applyUrl = function () {
    var q = new URLSearchParams(global.location.search);
    var away = q.get('away');
    var home = q.get('home');
    var self = this;
    var refFor = function (key) {
      if (!key) return null;
      var hit = self.teams.filter(function (t) {
        return t.abbr.toLowerCase() === String(key).toLowerCase()
          || t.slug === String(key).toLowerCase();
      })[0];
      return hit ? hit.ref : null;
    };
    var a = refFor(away);
    var h = refFor(home);
    if (a) { this.nodes.away.value = a; this.state.away = a; }
    if (h) { this.nodes.home.value = h; this.state.home = h; }
    if (q.get('venue') === 'neutral') {
      this.state.venue = 'neutral';
      $$('button', this.nodes.venueSeg).forEach(function (x, i) { x.classList.toggle('on', i === 1); });
    }
    var seed = parseInt(q.get('seed'), 10);
    if (a && h) {
      // A deep link is a request for that specific matchup, so open on the pane
      // that shows it selected rather than on a slate nobody asked for.
      this.setMode('custom');
      this.clearScenario();
    if (this.cfg.onMatchupChanged) this.cfg.onMatchupChanged(this);
      this.renderPrerun();
      this.run({ seed: isFinite(seed) && seed > 0 ? seed : null });
    }
  };

  SimApp.prototype.swap = function () {
    var a = this.nodes.away.value;
    this.nodes.away.value = this.nodes.home.value;
    this.nodes.home.value = a;
    this.state.away = this.nodes.away.value || null;
    this.state.home = this.nodes.home.value || null;
    this.clearScenario();
    if (this.cfg.onMatchupChanged) this.cfg.onMatchupChanged(this);
    this.renderPrerun();
  };

  /**
   * Ask the same game again with somebody held out.
   *
   * The seed is carried over deliberately. A visitor toggling a player is asking
   * what changes, and re-drawing a different game underneath the question would
   * bury the answer in noise: same seed, same draw, and the only thing that moved
   * is the thing they changed.
   */
  SimApp.prototype.toggleOut = function (side, id) {
    var list = this.scenario[side];
    var i = list.indexOf(String(id));
    if (i >= 0) list.splice(i, 1); else list.push(String(id));
    var seed = this.lastResult && this.lastResult.meta ? this.lastResult.meta.seed : null;
    this.run(seed ? { seed: seed } : {});
  };

  /** Put a player on a minutes restriction, or lift one. */
  SimApp.prototype.capMinutes = function (side, id, mins) {
    if (mins === null || mins === undefined || mins === '') delete this.minutes[side][String(id)];
    else this.minutes[side][String(id)] = mins;
    var seed = this.lastResult && this.lastResult.meta ? this.lastResult.meta.seed : null;
    this.run(seed ? { seed: seed } : {});
  };

  SimApp.prototype.clearScenario = function () {
    var had = this.scenario.home.length || this.scenario.away.length
      || Object.keys(this.minutes.home).length || Object.keys(this.minutes.away).length;
    this.scenario = { home: [], away: [] };
    this.minutes = { home: {}, away: {} };
    return !!had;
  };

  SimApp.prototype.currentTeams = function () {
    return { away: this.byRef[this.state.away] || null, home: this.byRef[this.state.home] || null };
  };

  SimApp.prototype.renderPrerun = function () {
    if (!this.nodes.prerun) return;
    var t = this.currentTeams();
    this.nodes.prerun.innerHTML = '';
    if (!t.away || !t.home) {
      this.nodes.prerun.appendChild(el('span', 'dim', 'Pick two teams to simulate.'));
      return;
    }
    if (t.away.ref === t.home.ref) {
      this.nodes.prerun.appendChild(el('span', 'dim', 'Pick two different teams.'));
      return;
    }
    var chips = this.cfg.prerunChips ? this.cfg.prerunChips(t.away, t.home, this.state) : [];
    chips.forEach(function (c) {
      var chip = el('span', 'chip');
      chip.innerHTML = esc(c.label) + ' <b>' + esc(c.value) + '</b>';
      this.nodes.prerun.appendChild(chip);
    }, this);
  };

  SimApp.prototype.setState = function (kind, message) {
    var box = this.nodes.result;
    box.innerHTML = '';
    if (kind === 'idle') return;
    if (kind === 'loading') {
      var wrap = el('div', 'state');
      wrap.appendChild(el('div', 'spin'));
      wrap.appendChild(el('div', '', message || 'Simulating'));
      box.appendChild(wrap);
      return;
    }
    if (kind === 'error') {
      box.appendChild(el('div', 'err', message || 'Something went wrong.'));
    }
  };

  SimApp.prototype.run = function (opts) {
    var self = this;
    opts = opts || {};
    if (this.running) return;
    var t = this.currentTeams();
    if (!t.away || !t.home) { this.setState('error', 'Pick two teams first.'); return; }
    if (t.away.ref === t.home.ref) { this.setState('error', 'Pick two different teams.'); return; }

    var params = new URLSearchParams();
    params.set('home', t.home.ref);
    params.set('away', t.away.ref);
    params.set('sims', String(this.state.sims));
    if (this.state.venue === 'neutral') params.set('venue', 'neutral');
    // No seed means a NEW simulation. Only a shared or reloaded link pins one.
    if (opts.seed) params.set('seed', String(opts.seed));
    if (this.cfg.extraParams) {
      var extra = this.cfg.extraParams(this) || {};
      Object.keys(extra).forEach(function (k) { if (extra[k]) params.set(k, extra[k]); });
    }
    if (this.scenario.home.length) params.set('homeOut', this.scenario.home.join(','));
    if (this.scenario.away.length) params.set('awayOut', this.scenario.away.join(','));
    ['home', 'away'].forEach(function (side) {
      var caps = self.minutes[side];
      var keys = Object.keys(caps);
      if (!keys.length) return;
      params.set(side + 'Minutes', keys.map(function (k) { return k + ':' + caps[k]; }).join(','));
    });
    // PLAYER DISTRIBUTIONS ARE ALWAYS ASKED FOR.
    //
    // The API has served these all along and the page has had a tab ready for
    // them, but nothing ever set the parameter, so the tab showed "run a
    // simulation with them enabled" to a visitor who had just run one and had no
    // control to enable anything. A thousand replays cost a fraction of a second.
    //
    // Not in single-game mode: one simulation means one game, and quietly
    // replaying it a thousand times to fill a table would contradict the thing
    // the visitor selected.
    if (this.state.sims >= 100) params.set('props', '1000');

    this.running = true;
    this.nodes.run.disabled = true;
    this.setState('loading', this.state.sims === 1
      ? 'Playing one game'
      : 'Running ' + this.state.sims.toLocaleString() + ' simulations');

    this.api('/simulate?' + params.toString()).then(function (d) {
      self.lastResult = d;
      self.render(d);
      self.pushUrl(t, d);
      if (global.TMRAnalytics && global.TMRAnalytics.track) {
        global.TMRAnalytics.track('simulator_result_viewed', {
          simulation_type: self.sport + '_game',
          simulations: d.meta && d.meta.simulations,
        });
      }
    }).catch(function (e) {
      self.setState('error', e.message || 'The simulation could not be run.');
    }).then(function () {
      self.running = false;
      self.nodes.run.disabled = false;
    });
  };

  SimApp.prototype.pushUrl = function (t, d) {
    if (!global.history || !global.history.replaceState) return;
    var q = new URLSearchParams();
    q.set('away', t.away.abbr);
    q.set('home', t.home.abbr);
    if (this.state.venue === 'neutral') q.set('venue', 'neutral');
    if (d && d.meta && d.meta.seed) q.set('seed', String(d.meta.seed));
    global.history.replaceState(null, '', global.location.pathname + '?' + q.toString());
  };

  SimApp.prototype.render = function (d) {
    var self = this;
    var box = this.nodes.result;
    box.innerHTML = '';
    this.cfg.render(this, d, box);

    // THE SAME TWO ACTIONS, ONCE.
    //
    // A second pair of buttons used to sit at the foot of the result offering
    // "Simulate again" and "Copy link to this run" -- the same two things the
    // action bar at the top does under different names, which reads as four
    // actions that might behave differently rather than two that do not.
    // What is worth keeping from it is the seed, because that is the thing a
    // shared link turns out to be about.
    var foot = el('div', 'againrow');
    foot.appendChild(el('span', 'seednote',
      'Seed ' + (d.meta && d.meta.seed)
      + '. Every run is a fresh simulation; Share result copies a link that replays this exact one.'));
    box.appendChild(foot);

    var disc = el('div', 'disc', d.disclaimer || '');
    box.appendChild(disc);
  };

  /* ---------- rendering primitives shared by both sports ---------------- */

  /**
   * The chance of clearing a line, read straight off the simulated distribution.
   *
   * Every stat published this way is a COUNT, so the engine ships the whole
   * shape -- how many of the replays ended on each value -- and any line at all
   * can then be answered exactly. No curve is fitted and nothing is interpolated
   * between the published percentiles: this counts replays, which is the same
   * thing the percentiles were counted from.
   *
   * A whole-number line can push, and that is reported rather than folded into
   * one side, because a bet on 20 when he scores exactly 20 is not a loss.
   */
  function overUnder(dist, line) {
    if (!dist || !dist.counts || !dist.runs) return null;
    var over = 0;
    var under = 0;
    var push = 0;
    for (var i = 0; i < dist.counts.length; i += 1) {
      var v = dist.from + i;
      var c = dist.counts[i];
      if (v > line) over += c;
      else if (v < line) under += c;
      else push += c;
    }
    return {
      over: over / dist.runs,
      under: under / dist.runs,
      push: push / dist.runs,
      runs: dist.runs,
    };
  }

  /**
   * A number box for a line, stepping in halves because that is how lines are
   * written. Reports on every edit so the probabilities move as it is typed.
   */
  function lineInput(value, onChange) {
    var i = document.createElement('input');
    i.type = 'number';
    i.step = '0.5';
    i.min = '0';
    i.className = 'lineinput';
    i.value = String(value);
    i.setAttribute('aria-label', 'Line');
    i.addEventListener('input', function () {
      var v = parseFloat(i.value);
      if (Number.isFinite(v)) onChange(v);
    });
    return i;
  }

  /**
   * WHAT TO DO WITH A RESULT ONCE YOU HAVE ONE.
   *
   * Four actions, and each answers a question the previous version left the
   * visitor to solve by scrolling: play it again, pick different teams, send it
   * to somebody, put it on paper. Run Again deliberately drops the seed -- it is
   * a NEW game of the same matchup -- while the share link keeps it, because
   * those are opposite intentions and using one control for both made the seed
   * behaviour impossible to predict.
   */
  function actionBar(app, opts) {
    opts = opts || {};
    var bar = el('div', 'actionbar');
    var said = el('span', 'copied', '');
    said.setAttribute('aria-live', 'polite');

    var add = function (label, cls, fn, title) {
      var b = el('button', cls || '', label);
      b.type = 'button';
      if (title) b.title = title;
      b.addEventListener('click', fn);
      bar.appendChild(b);
      return b;
    };

    add('Run again', 'primary', function () {
      // No seed: a fresh draw of the same matchup.
      app.run({});
    }, 'Play this matchup again, from a new draw');

    add('Change matchup', '', function () {
      var setup = $('#setup');
      if (setup) {
        setup.scrollIntoView({ behavior: 'smooth', block: 'start' });
        var away = $('#awayTeam');
        if (away) window.setTimeout(function () { away.focus(); }, 350);
      }
    }, 'Go back to the team pickers');

    add('Share result', '', function () {
      var url = global.location.href;
      var done = function () {
        said.textContent = 'Link copied. It reproduces this exact simulation.';
      };
      if (global.navigator && global.navigator.clipboard) {
        global.navigator.clipboard.writeText(url).then(done, function () { said.textContent = url; });
      } else {
        said.textContent = url;
      }
    }, 'Copy a link that reproduces this exact game');

    add('Print box score', '', function () {
      if (opts.beforePrint) opts.beforePrint();
      global.setTimeout(function () { global.print(); }, 140);
    }, 'Print, or save as a PDF');

    bar.appendChild(said);
    return bar;
  }

  /**
   * TWO WAYS TO READ THE SAME GAME.
   *
   * The analysis view leads with what the model thinks -- the projection, the
   * ranges, what the answer rests on -- and is the right default for somebody
   * deciding whether to trust it. The broadcast view leads with what happened:
   * a scoreboard, then the sheet, in the order and density a sports box score
   * has used for decades because it is the order people scan in.
   *
   * They are the same data. Neither hides anything the other shows, and the
   * choice is remembered per visitor and carried in the link, so a shared
   * result opens the way it was sent.
   */
  var VIEW_KEY = 'tmr-sim-view';

  function currentView() {
    try {
      var q = new URLSearchParams(global.location.search).get('view');
      if (q === 'box' || q === 'analysis') return q;
    } catch (e) { /* a URL we cannot read is not a reason to fail */ }
    try {
      var v = global.localStorage && global.localStorage.getItem(VIEW_KEY);
      if (v === 'box' || v === 'analysis') return v;
    } catch (e) { /* private windows throw on storage; the default is fine */ }
    return 'analysis';
  }

  function viewToggle(app) {
    var wrap = el('div', 'viewtoggle');
    wrap.setAttribute('role', 'group');
    wrap.setAttribute('aria-label', 'Results view');
    var current = currentView();
    [['analysis', 'TMR analysis', 'Lead with the projection, the ranges and the reasoning'],
      ['box', 'Broadcast box score', 'Lead with the scoreboard and the full sheet']]
      .forEach(function (opt) {
        var b = el('button', opt[0] === current ? 'on' : '', opt[1]);
        b.type = 'button';
        b.title = opt[2];
        b.setAttribute('aria-pressed', opt[0] === current ? 'true' : 'false');
        b.addEventListener('click', function () {
          if (currentView() === opt[0]) return;
          try { global.localStorage.setItem(VIEW_KEY, opt[0]); } catch (e) { /* fine */ }
          try {
            var u = new URL(global.location.href);
            u.searchParams.set('view', opt[0]);
            global.history.replaceState({}, '', u.toString());
          } catch (e) { /* fine */ }
          // Re-render the result already in hand rather than running a new one:
          // switching how you look at a game must not change the game.
          if (app.lastResult) app.render(app.lastResult);
        });
        wrap.appendChild(b);
      });
    return wrap;
  }

  /**
   * THE SCOREBOARD, as the top of a broadcast sheet.
   *
   * Everything on it is a fact about the game that was played or the data it was
   * played with: the two clubs and their real records, the final and how it was
   * reached, the line by period, and how many simulations stood behind the
   * projection. The winner is emphasised because a scoreboard that does not tell
   * you who won at a glance has failed at its only job.
   */
  function scoreboard(opts) {
    var wrap = el('div', 'sb');

    var head = el('div', 'sb-head');
    ['away', 'home'].forEach(function (side, i) {
      var t = opts[side];
      var won = opts.winner === side;
      var cell = el('div', 'sb-team' + (won ? ' won' : ''));
      var id = el('div', 'sb-id');
      id.appendChild(crest(t, 44));
      var names = el('div', 'sb-names');
      names.appendChild(el('div', 'sb-abbr', t.abbr));
      names.appendChild(el('div', 'sb-name', t.name));
      if (opts.records && opts.records[side]) {
        names.appendChild(el('div', 'sb-rec', opts.records[side]));
      }
      id.appendChild(names);
      cell.appendChild(id);
      cell.appendChild(el('div', 'sb-score', String(opts.score[side])));
      wrap.appendChild(cell);
      if (i === 0) {
        var mid = el('div', 'sb-mid');
        mid.appendChild(el('div', 'sb-status', opts.status));
        if (opts.subStatus) mid.appendChild(el('div', 'sb-sub', opts.subStatus));
        wrap.appendChild(mid);
      }
    });
    wrap.appendChild(head);

    if (opts.line && opts.line.cols && opts.line.cols.length) {
      var lw = el('div', 'sb-line');
      var t2 = el('table');
      var thead = el('thead');
      var hr = el('tr');
      hr.appendChild(el('th', '', ''));
      opts.line.cols.forEach(function (c) { hr.appendChild(el('th', '', c)); });
      hr.appendChild(el('th', 'tot', 'T'));
      thead.appendChild(hr);
      t2.appendChild(thead);
      var tb = el('tbody');
      ['away', 'home'].forEach(function (side) {
        var tr = el('tr', opts.winner === side ? 'won' : '');
        tr.appendChild(el('td', 'name', opts[side].abbr));
        opts.line[side].forEach(function (v) { tr.appendChild(el('td', '', v === null ? '--' : String(v))); });
        tr.appendChild(el('td', 'tot', String(opts.score[side])));
        tb.appendChild(tr);
      });
      t2.appendChild(tb);
      lw.appendChild(t2);
      wrap.appendChild(lw);
    }

    if (opts.footnote) wrap.appendChild(el('div', 'sb-foot', opts.footnote));
    return wrap;
  }

  /** Tab bar. `panes` is [{id, label, build(node)}]. */
  function tabs(container, panes) {
    var bar = el('div', 'tabs');
    var body = el('div');
    panes.forEach(function (p, i) {
      var b = el('button', i === 0 ? 'on' : '', p.label);
      b.type = 'button';
      b.addEventListener('click', function () {
        $$('button', bar).forEach(function (x) { x.classList.remove('on'); });
        b.classList.add('on');
        body.innerHTML = '';
        p.build(body);
      });
      bar.appendChild(b);
    });
    container.appendChild(bar);
    container.appendChild(body);
    panes[0].build(body);
  }

  /**
   * A table. `cols` is [{k, h, align, fmt}]; `rows` is an array of objects.
   * A row may carry `_class` for a modifier such as the starters/bench split.
   */
  function table(cols, rows, opts) {
    opts = opts || {};
    var wrap = el('div', 'tablewrap' + (opts.sticky ? ' sticky' : ''));
    var t = el('table' );
    var thead = el('thead');
    var tr = el('tr');
    var tbody = el('tbody');
    // A stat table is read by asking a question of it -- who had the most
    // rebounds, who was on the ice longest -- and answering that by eye down
    // twenty rows is work the browser should be doing.
    var sortState = { index: -1, dir: -1 };
    var view = rows.slice();

    function valueOf(r, c) {
      if (c.sortValue) return c.sortValue(r);
      var raw = c.k ? r[c.k] : (c.fmt ? c.fmt(r) : null);
      if (raw && raw.nodeType) raw = raw.textContent;
      var n = parseFloat(String(raw == null ? '' : raw).replace(/[^0-9.\-]/g, ''));
      return Number.isFinite(n) ? n : String(raw == null ? '' : raw).toLowerCase();
    }

    function paint() {
      tbody.innerHTML = '';
      view.forEach(function (r) {
        var row = el('tr', r._class || '');
        cols.forEach(function (c, i) {
          var td = el('td', i === 0 ? 'name' : '');
          if (c.align) td.style.textAlign = c.align;
          var v = c.fmt ? c.fmt(r) : r[c.k];
          if (v && v.nodeType) td.appendChild(v);
          else td.innerHTML = v == null ? '' : String(v);
          row.appendChild(td);
        });
        tbody.appendChild(row);
      });
      if (opts.footer) {
        var f = el('tr', 'groupsplit');
        cols.forEach(function (c, i) {
          var td = el('td', i === 0 ? 'name' : '');
          var v = c.fmt ? c.fmt(opts.footer) : opts.footer[c.k];
          // A COLUMN THAT BUILDS AN ELEMENT BUILDS ONE HERE TOO.
          //
          // This stringified whatever the formatter returned, so the player
          // column -- which returns a span carrying the name and position --
          // printed the team row as "[object HTMLSpanElement]". Every box score
          // on the site said it, on the one row summarising the whole team.
          if (v && v.nodeType) {
            var b = el('b');
            b.appendChild(v);
            td.appendChild(b);
          } else {
            td.innerHTML = v == null ? '' : '<b>' + String(v) + '</b>';
          }
          f.appendChild(td);
        });
        tbody.appendChild(f);
      }
    }

    cols.forEach(function (c, i) {
      var th = el('th', '', c.h);
      if (c.title) th.title = c.title;
      if (opts.sortable && c.sortable !== false) {
        th.tabIndex = 0;
        th.className = 'sortable';
        th.setAttribute('role', 'button');
        th.setAttribute('aria-label', 'Sort by ' + (c.title || c.h));
        var run = function () {
          // Same column again reverses; a new column starts high, because the
          // first thing anybody wants from a stat column is its top.
          if (sortState.index === i) sortState.dir = -sortState.dir;
          else { sortState.index = i; sortState.dir = i === 0 ? 1 : -1; }
          view = rows.slice().sort(function (a, b) {
            var av = valueOf(a, c);
            var bv = valueOf(b, c);
            if (av < bv) return -sortState.dir;
            if (av > bv) return sortState.dir;
            return 0;
          });
          [].forEach.call(tr.children, function (h2) {
            h2.classList.remove('sorted-asc', 'sorted-desc');
          });
          th.classList.add(sortState.dir > 0 ? 'sorted-asc' : 'sorted-desc');
          paint();
        };
        th.addEventListener('click', run);
        th.addEventListener('keydown', function (e) {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); run(); }
        });
      }
      tr.appendChild(th);
    });
    thead.appendChild(tr);
    t.appendChild(thead);
    paint();
    t.appendChild(tbody);
    wrap.appendChild(t);
    return wrap;
  }

  /**
   * The score header at the top of a result: two crests, two scores, and a thin
   * bar in each team's own colour so the two sides are told apart at a glance
   * rather than by reading three grey letters.
   */
  function matchupHeader(away, home, awayScore, homeScore, awayWp, homeWp, midLines) {
    var mh = el('div', 'mh');

    var bar = el('div', 'mh-colorbar');
    var la = el('i');
    la.style.background = away.color || '#38bdf8';
    la.style.flex = String(Math.max(awayWp, 0.05));
    var lh = el('i');
    lh.style.background = home.color || '#22d3ee';
    lh.style.flex = String(Math.max(homeWp, 0.05));
    bar.appendChild(la);
    bar.appendChild(lh);
    mh.appendChild(bar);

    var grid = el('div', 'mh-grid');
    var mk = function (team, score, wp, role, winner) {
      var d = el('div', 'mh-team' + (winner ? ' won' : ''));
      d.appendChild(el('div', 'role', role));
      d.appendChild(crest(team, 46));
      d.appendChild(el('div', 'nm', team.name));
      var pts = el('div', 'pts', String(score));
      if (!winner) pts.style.opacity = '.55';
      d.appendChild(pts);
      d.appendChild(el('div', 'wp', pct(wp) + ' win probability'));
      return d;
    };

    grid.appendChild(mk(away, awayScore, awayWp, 'Away', awayScore > homeScore));
    var mid = el('div', 'mh-mid');
    mid.appendChild(el('div', 'at', 'at'));
    (midLines || []).forEach(function (line) { mid.appendChild(el('div', '', line)); });
    grid.appendChild(mid);
    grid.appendChild(mk(home, homeScore, homeWp, 'Home', homeScore > awayScore));
    mh.appendChild(grid);
    return mh;
  }

  /** KPI cards. `items` is [{k, v, s}]. */
  function kpis(items) {
    var g = el('div', 'kpis');
    items.forEach(function (it) {
      var c = el('div', 'kpi');
      c.appendChild(el('div', 'k', it.k));
      c.appendChild(el('div', 'v', it.v));
      if (it.s) c.appendChild(el('div', 's', it.s));
      g.appendChild(c);
    });
    return g;
  }

  /**
   * Two-sided comparison bars. `rows` is [{label, away, home, fmt, higherIsBetter}].
   * Each bar shows the two values as a share of their sum, so the reader can see
   * the gap without needing the scale of the metric.
   */
  function compare(rows) {
    var box = el('div', 'cmp');
    rows.forEach(function (r) {
      var line = el('div', 'cmp-row');
      var fmt = r.fmt || function (v) { return v; };
      line.appendChild(el('div', 'v a', String(fmt(r.away))));
      var la = el('div', 'cmp-bar');
      var lb = el('div', 'cmp-bar');
      var total = Math.abs(r.away) + Math.abs(r.home);
      var aShare = total > 0 ? Math.abs(r.away) / total : 0.5;
      var ia = el('i', 'away'); ia.style.width = (aShare * 100).toFixed(1) + '%'; ia.style.right = '0';
      var ih = el('i', 'home'); ih.style.width = ((1 - aShare) * 100).toFixed(1) + '%'; ih.style.left = '0';
      la.appendChild(ia); lb.appendChild(ih);
      line.appendChild(la);
      line.appendChild(el('div', 'lab', r.label));
      line.appendChild(lb);
      line.appendChild(el('div', 'v h', String(fmt(r.home))));
      box.appendChild(line);
    });
    return box;
  }

  /** The "why the model moved" cards. */
  function driverCards(drivers) {
    var g = el('div', 'notecards');
    (drivers || []).forEach(function (d) {
      var c = el('div', 'notecard');
      var body = el('div');
      body.appendChild(el('b', '', d.label + ': '));
      body.appendChild(document.createTextNode(d.detail));
      c.appendChild(body);
      g.appendChild(c);
    });
    return g;
  }

  /**
   * A team crest. Logos come from a CDN, so a failure must degrade to the
   * abbreviation rather than leaving a broken-image box on the page.
   */
  function crest(team, size) {
    var px = size || 34;
    if (!team || !team.logo) {
      var fallback = el('span', 'crest-fallback', team ? team.abbr : '');
      fallback.style.width = px + 'px';
      fallback.style.height = px + 'px';
      if (team && team.color) fallback.style.background = team.color;
      return fallback;
    }
    var img = document.createElement('img');
    img.className = 'crest';
    img.src = team.logo;
    img.alt = '';
    img.setAttribute('aria-hidden', 'true');
    img.width = px;
    img.height = px;
    img.loading = 'lazy';
    img.addEventListener('error', function () {
      var f = el('span', 'crest-fallback', team.abbr);
      f.style.width = px + 'px';
      f.style.height = px + 'px';
      if (team.color) f.style.background = team.color;
      if (img.parentNode) img.parentNode.replaceChild(f, img);
    });
    return img;
  }

  var SVGNS = 'http://www.w3.org/2000/svg';
  function svgEl(tag, attrs) {
    var n = document.createElementNS(SVGNS, tag);
    Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    return n;
  }
  function svgTitle(parent, text) {
    var t = svgEl('title', {});
    t.textContent = text;
    parent.appendChild(t);
  }

  /**
   * A distribution histogram. `bars` is the engine's bucket list, and `colorOf`
   * colours bars either side of zero, which is what makes a margin chart
   * readable: one colour per team.
   */
  function histogram(bars, opts) {
    opts = opts || {};
    var W = 320;
    var H = 132;
    var padB = 22;
    var max = bars.reduce(function (m, b) { return Math.max(m, b.count); }, 1);
    var svg = svgEl('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img' });
    svgTitle(svg, opts.title || 'Distribution');
    var bw = W / Math.max(bars.length, 1);
    bars.forEach(function (b, i) {
      var h = ((H - padB) * b.count) / max;
      var r = svgEl('rect', {
        x: (i * bw + 0.6).toFixed(2),
        y: (H - padB - h).toFixed(2),
        width: Math.max(bw - 1.2, 0.8).toFixed(2),
        height: Math.max(h, 0.6).toFixed(2),
        rx: 1.5,
        fill: opts.colorOf ? opts.colorOf(b) : '#38bdf8',
        opacity: '0.92',
      });
      svgTitle(r, (opts.labelOf ? opts.labelOf(b) : b.bucket) + ': ' + pct(b.share, 1));
      svg.appendChild(r);
    });
    // Axis: first, middle and last bucket only, so it stays legible on a phone.
    [0, Math.floor(bars.length / 2), bars.length - 1].forEach(function (i, n) {
      if (!bars[i]) return;
      var t = svgEl('text', {
        x: (i * bw + bw / 2).toFixed(2),
        y: H - 6,
        'text-anchor': n === 0 ? 'start' : (n === 2 ? 'end' : 'middle'),
        fill: '#5b6b82',
        'font-size': '10',
      });
      t.textContent = opts.tickOf ? opts.tickOf(bars[i]) : String(bars[i].bucket);
      svg.appendChild(t);
    });
    return svg;
  }

  /** A monotonic curve, used for cover probability and over/under probability. */
  function curve(points, opts) {
    opts = opts || {};
    var W = 320;
    var H = 132;
    var padB = 22;
    var padL = 4;
    var xs = points.map(function (p) { return p.x; });
    var minX = Math.min.apply(null, xs);
    var maxX = Math.max.apply(null, xs);
    var svg = svgEl('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img' });
    svgTitle(svg, opts.title || 'Probability curve');
    var X = function (v) { return padL + ((v - minX) / Math.max(maxX - minX, 1e-6)) * (W - padL * 2); };
    var Y = function (v) { return (H - padB) - v * (H - padB - 6); };
    [0.25, 0.5, 0.75].forEach(function (g) {
      svg.appendChild(svgEl('line', {
        x1: padL, x2: W - padL, y1: Y(g).toFixed(2), y2: Y(g).toFixed(2),
        stroke: '#1f2b40', 'stroke-width': '1',
      }));
    });
    var d = points.map(function (p, i) { return (i ? 'L' : 'M') + X(p.x).toFixed(2) + ' ' + Y(p.y).toFixed(2); }).join(' ');
    svg.appendChild(svgEl('path', { d: d, fill: 'none', stroke: opts.stroke || '#22d3ee', 'stroke-width': '2' }));
    points.forEach(function (p) {
      var c = svgEl('circle', { cx: X(p.x).toFixed(2), cy: Y(p.y).toFixed(2), r: '6', fill: 'transparent' });
      svgTitle(c, opts.labelOf ? opts.labelOf(p) : p.x + ': ' + pct(p.y, 1));
      svg.appendChild(c);
    });
    [points[0], points[points.length - 1]].forEach(function (p, n) {
      if (!p) return;
      var t = svgEl('text', {
        x: n === 0 ? padL : W - padL, y: H - 6,
        'text-anchor': n === 0 ? 'start' : 'end', fill: '#5b6b82', 'font-size': '10',
      });
      t.textContent = opts.tickOf ? opts.tickOf(p) : String(p.x);
      svg.appendChild(t);
    });
    return svg;
  }

  function chartCard(title, node, legend) {
    var c = el('div', 'chartcard');
    c.appendChild(el('h3', '', title));
    c.appendChild(node);
    if (legend) {
      var l = el('div', 'legend');
      legend.forEach(function (item) {
        var s = el('span');
        var i = el('i');
        i.style.background = item.color;
        s.appendChild(i);
        s.appendChild(document.createTextNode(item.label));
        l.appendChild(s);
      });
      c.appendChild(l);
    }
    return c;
  }

  function panel(title, node) {
    var p = el('div', 'panel');
    if (title) p.appendChild(el('div', 'sechead', title));
    if (node) p.appendChild(node);
    return p;
  }

  global.TMRSim = {
    SimApp: SimApp,
    el: el, $: $, $$: $$, esc: esc, pct: pct, signed: signed,
    tabs: tabs, table: table, matchupHeader: matchupHeader, kpis: kpis,
    overUnder: overUnder, lineInput: lineInput, actionBar: actionBar,
    viewToggle: viewToggle, currentView: currentView, scoreboard: scoreboard,
    compare: compare, driverCards: driverCards, panel: panel,
    crest: crest, histogram: histogram, curve: curve, chartCard: chartCard, svgEl: svgEl,
    API_HOST: API_HOST,
  };
}(window));
