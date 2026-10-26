(function (w) {
  'use strict';
  var ZONE = 'America/Los_Angeles';

  function zonedToUtcMs(parts) {
    var want = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second || 0);
    var utc = want;
    var dtf = new Intl.DateTimeFormat('en-US', {
      timeZone: ZONE,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
    for (var i = 0; i < 4; i++) {
      var map = {};
      var gotParts = dtf.formatToParts(new Date(utc));
      for (var j = 0; j < gotParts.length; j++) {
        if (gotParts[j].type !== 'literal') map[gotParts[j].type] = gotParts[j].value;
      }
      var got = Date.UTC(+map.year, +map.month - 1, +map.day, (+map.hour) % 24, +map.minute, +map.second);
      var diff = want - got;
      if (diff === 0) return utc;
      utc += diff;
    }
    return utc;
  }

  var cutoffMs = zonedToUtcMs({ year: 2026, month: 10, day: 26, hour: 16, minute: 0, second: 0 });

  function closed(now) {
    var t = now == null ? Date.now() : new Date(now).getTime();
    return isFinite(t) && t >= cutoffMs;
  }

  function apply() {
    if (!closed()) return;
    var nodes = document.querySelectorAll('[data-day-pass-offer="open"]');
    for (var i = 0; i < nodes.length; i++) nodes[i].hidden = true;
  }

  w.TMRDayPass = { closed: closed, cutoffMs: cutoffMs, zone: ZONE, apply: apply };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply);
  else apply();
})(window);
