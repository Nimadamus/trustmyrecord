/**
 * Public roster clock for the four simulators.
 * A successful check and a roster change are different times. This file
 * prints whichever the status payload actually carries, and it does not
 * invent the one that is missing.
 */
(function (root) {
  var FEED_LABEL = {
    nfl_rosters: 'Roster ingest',
    nfl_injuries_espn: 'ESPN injuries',
    nfl_injuries_official: 'Official injuries',
    nfl_inactives: 'Inactives'
  };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  function pt(iso) {
    var t = new Date(iso);
    if (!Number.isFinite(t.getTime())) return null;
    return t.toLocaleString('en-US', {
      timeZone: 'America/Los_Angeles',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    }) + ' PT';
  }

  function html(sport, n) {
    if (!n || !n.built_at || !pt(n.built_at)) {
      return 'Roster time is unavailable. This page will not invent a timestamp.';
    }
    var check = pt(n.built_at);
    var changed = n.roster_changed_at ? pt(n.roster_changed_at) : null;
    var age = (typeof n.data_age_hours === 'number' && Number.isFinite(n.data_age_hours))
      ? (', ' + n.data_age_hours + ' hours old') : '';
    var lines = [];
    if (n.clock === 'last_successful_roster_check' && changed) {
      lines.push('Last successful roster check: ' + check + ' (' + esc(n.freshness || 'unknown') + age + ').');
      if (changed !== check) {
        lines.push('Last roster change: ' + changed + '. A check that finds the same roster leaves this time where it is.');
      } else {
        lines.push('The last roster change is the same time as that check.');
      }
    } else if (n.clock === 'last_roster_change' && changed) {
      lines.push('Last roster change: ' + changed + '. No successful roster check time is on record.');
    } else {
      lines.push('Last roster snapshot: ' + check + ' (' + esc(n.freshness || 'unknown') + age + ').');
      lines.push('This response has no separate last change time.');
    }
    if (n.refresh_status === 'failed') {
      lines.push('The last roster check failed' + (n.last_error ? ': ' + esc(n.last_error) : '') + '. Stored rows from the previous good check were kept.');
    }
    if (sport === 'mlb') {
      lines.push('Probable pitchers stay labelled probable until MLB posts or confirms the lineup. A posted lineup and a confirmed lineup are labelled on the game. When the injury list does not load, the page says so.');
    } else if (sport === 'nba') {
      lines.push('Starting lineups stay labelled projected until a verified confirmation source is available. Minute restrictions are a scenario you set. Injury rows are only the designations the feed returned.');
    } else if (sport === 'nhl') {
      lines.push('Starting goalies stay labelled projected until a verified confirmation source is available. An empty injury note means the feed returned no current designation.');
    } else if (sport === 'nfl') {
      lines.push('Skill player usage stays labelled projected. An empty inactive list means no inactive players were ingested for that game.');
    }
    if (Array.isArray(n.feeds) && n.feeds.length) {
      var bits = [];
      n.feeds.forEach(function (f) {
        var label = FEED_LABEL[f.feed];
        if (!label) return;
        var when = f.last_success_at ? pt(f.last_success_at) : null;
        bits.push(label + ': ' + (when || 'no successful update on record') + (f.is_stale ? ', past its freshness budget' : ', current'));
      });
      if (bits.length) lines.push(bits.join('. ') + '.');
    }
    if (n.source) lines.push('Source: ' + esc(n.source) + '.');
    return lines.join(' ');
  }

  var api = { html: html };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.TMRRosterClock = api;

  function paintAll() {
    if (typeof document === 'undefined') return;
    if (!document.getElementById('roster-clock-css')) {
      var st = document.createElement('style');
      st.id = 'roster-clock-css';
      st.textContent = '.roster-clock{display:block;box-sizing:border-box;max-width:100%;margin:0 0 14px;padding:10px 14px;border:1px solid rgba(127,127,127,.35);border-left:4px solid #1D7FE8;border-radius:8px;font:500 14px/1.45 Inter,Arial,sans-serif;overflow-wrap:anywhere;white-space:normal}'
        + '@media (max-width:480px){.roster-clock{padding:10px 12px;font-size:13px;margin:0 0 12px}}';
      document.head.appendChild(st);
    }
    var nodes = document.querySelectorAll('[data-roster-clock]');
    if (!nodes.length) return;
    var base = (root.CONFIG && root.CONFIG.api && root.CONFIG.api.baseUrl) || 'https://trustmyrecord-api.onrender.com/api';
    fetch(base + '/roster/status', { headers: { Accept: 'application/json' }, credentials: 'omit' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; })
      .then(function (s) {
        Array.prototype.forEach.call(nodes, function (node) {
          var sport = node.getAttribute('data-roster-clock');
          var row = s && s.sports && s.sports[sport];
          node.innerHTML = html(sport, row);
        });
      });
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', paintAll);
    else paintAll();
  }
})(typeof window !== 'undefined' ? window : globalThis);
