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
      if (!self.TMRNflSeason) importScripts('/static/js/nfl-playoff-engine.js?v=f19b9646d428', '/static/js/nfl-season-project.js?v=c63fb8e0947b');
      result = self.TMRNflSeason.project(m.inputs, m.n, m.seed);
    } else {
      if (!self.TMRLeagueSeason) importScripts('/static/js/league-season-engine.js?v=9248cb227043');
      result = self.TMRLeagueSeason.project(m.inputs, m.n, m.seed, m.opts || {});
    }
    self.postMessage({ ok: true, result: result });
  } catch (err) {
    self.postMessage({ ok: false, error: String(err && err.message || err) });
  }
};
