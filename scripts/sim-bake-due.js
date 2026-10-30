'use strict';
/* SIM_BAKE_FOURTH_RUN_20261023: decides whether a League Simulator Bake run should bake.
   GitHub starts this repo's scheduled runs 3 to 6 hours late and drops some of them
   (Oct 2 to 23: 68 runs, the 09:20 UTC slot started only twice). So the workflow is
   triggered every hour and this gate bakes once per slot: due when no bake has
   succeeded since the latest slot time. Slots stay 01:20, 09:20, 13:20, 21:20 UTC
   (6:20 PM, 2:20 AM, 6:20 AM, 2:20 PM PDT). A manual run always bakes.

   node scripts/sim-bake-due.js   (needs GH_TOKEN, GITHUB_REPOSITORY, GITHUB_EVENT_NAME,
   GITHUB_RUN_ID; appends due=, stale=, last= to $GITHUB_OUTPUT) */
const SLOTS_UTC = [[1, 20], [9, 20], [13, 20], [21, 20]];
const STALE_HOURS = 14;

function latestSlot(now) {
  const d = new Date(now);
  for (let back = 0; back < 2; back++) {
    const day = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - back);
    const times = SLOTS_UTC.map(([h, m]) => day + (h * 60 + m) * 60000).filter((t) => t <= +d);
    if (times.length) return Math.max(...times);
  }
  throw new Error('no slot');
}

function decide({ now, lastBake, event }) {
  const slot = latestSlot(now);
  const last = lastBake ? +new Date(lastBake) : 0;
  const stale = !last || (+new Date(now) - last) / 3600000 > STALE_HOURS;
  const due = event === 'workflow_dispatch' || event === 'repository_dispatch' || last < slot;
  return { due, stale, slot: new Date(slot).toISOString() };
}

async function lastSuccessfulBake({ repo, token, selfId }) {
  const h = { Accept: 'application/vnd.github+json' };
  if (token) h.Authorization = 'Bearer ' + token;
  const get = async (p) => {
    const r = await fetch('https://api.github.com/repos/' + repo + p, { headers: h });
    if (!r.ok) throw new Error(p + ' -> HTTP ' + r.status);
    return r.json();
  };
  const runs = (await get('/actions/workflows/league-sim-bake.yml/runs?status=success&per_page=40')).workflow_runs;
  for (const run of runs) {
    if (String(run.id) === String(selfId)) continue;
    const jobs = (await get('/actions/runs/' + run.id + '/jobs')).jobs;
    // A gate only run also ends "success"; only a run whose bake job succeeded counts.
    if (jobs.some((j) => j.name === 'bake' && j.conclusion === 'success')) return run.run_started_at || run.created_at;
  }
  return null;
}

if (require.main === module) {
  (async () => {
    const env = process.env;
    let lastBake = null, err = '';
    try { lastBake = await lastSuccessfulBake({ repo: env.GITHUB_REPOSITORY, token: env.GH_TOKEN, selfId: env.GITHUB_RUN_ID }); }
    catch (e) { err = e.message; }
    // Fail open: if the history cannot be read, bake (a bake with nothing new commits nothing).
    const r = err ? { due: true, stale: false, slot: '' } : decide({ now: new Date(), lastBake, event: env.GITHUB_EVENT_NAME });
    console.log(JSON.stringify({ ...r, lastBake, err }));
    if (env.GITHUB_OUTPUT) require('fs').appendFileSync(env.GITHUB_OUTPUT, `due=${r.due}\nstale=${r.stale}\nlast=${lastBake || 'none'}\n`);
  })();
}

module.exports = { decide, latestSlot, SLOTS_UTC, STALE_HOURS };
