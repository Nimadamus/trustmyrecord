/* SIM_SEASON_WORKER_20260915 -- runs the season simulators off the main thread,
   so 10,000 seasons never freezes the page on a phone. The page posts
   { kind: 'league' | 'nfl', inputs, n, seed, opts } and gets back the same
   result object the engine returns on the main thread. */
/* global importScripts */
self.onmessage = function (e) {
  var m = e.data || {};
  try {
    var result;
    if (m.kind === 'nfl') {
      if (!self.TMRNflSeason) importScripts('/static/js/nfl-playoff-engine.js?v=9292141731a0', '/static/js/nfl-season-project.js?v=75e01bbb4053');
      result = self.TMRNflSeason.project(m.inputs, m.n, m.seed, m.opts || {});
    } else {
      if (!self.TMRLeagueSeason) importScripts('/static/js/league-season-engine.js?v=aceb1b1e35ec');
      result = self.TMRLeagueSeason.project(m.inputs, m.n, m.seed, m.opts || {});
    }
    self.postMessage({ ok: true, result: result });
  } catch (err) {
    self.postMessage({ ok: false, error: String(err && err.message || err) });
  }
};
