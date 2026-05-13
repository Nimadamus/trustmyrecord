#!/usr/bin/env node

const assert = require('assert');

const PUBLIC_SITE = process.env.TMR_PUBLIC_SITE || 'https://trustmyrecord.com';
const PUBLIC_API = process.env.TMR_PUBLIC_API || 'https://trustmyrecord-api.onrender.com/api';

async function getText(url) {
  const response = await fetch(url, { cache: 'no-store' });
  assert(response.ok, `${url} returned ${response.status}`);
  return response.text();
}

async function getJson(url) {
  const response = await fetch(url, { cache: 'no-store' });
  assert(response.ok, `${url} returned ${response.status}`);
  return response.json();
}

async function auditTrendspotterStatic() {
  const js = await getText(`${PUBLIC_SITE}/static/js/trendspotter.js?v=${Date.now()}`);
  assert(js.includes('requiresSourceRows: true'), 'Trendspotter team totals must require source rows');
  assert(js.includes('function marketIsDisabled'), 'Trendspotter must dynamically disable unsupported markets');
  assert(js.includes('["team_total_line", "source_team_total_line"]'), 'Team totals must use only explicit team-total line fields');
  assert(!js.includes('["team_total_line", "total_line", "line"'), 'Team totals must not fall back to generic total/line fields');
  assert(js.includes('First Five trends are disabled'), 'Unsupported First Five trends must stay disabled');
  assert(js.includes('Props are hidden until verified support exists'), 'Unsupported props must stay disabled');
}

async function auditTrendspotterApi() {
  const data = await getJson(`${PUBLIC_API}/trendspotter/verified?sport=MLB`);
  assert.strictEqual(data.source_classification, 'source_backed', 'Trendspotter live source classification must be source-backed');
  assert(data.estimated_team_totals_policy && data.estimated_team_totals_policy.status === 'blocked', 'Estimated team-total policy must be blocked');
  const teamTotals = (data.trends || []).filter((trend) => trend.bet_type === 'TEAM_TOTAL' || trend.market === 'TEAM_TOTAL');
  for (const trend of teamTotals) {
    assert.strictEqual(trend.source_classification, 'source_backed', 'Live team-total trend must be source-backed');
    assert((trend.source_rows || []).every((row) => Number.isFinite(Number(row.team_total_line || row.source_team_total_line))), 'Live team-total rows must carry explicit team-total lines');
  }
}

async function auditMlbSimulator() {
  const js = await getText(`${PUBLIC_SITE}/static/js/mlb-simulator.js?v=${Date.now()}`);
  assert(js.includes('mlb-simulator-realism-runs-20260513'), 'MLB Simulator public bundle must be the realism build');
  assert(/Simulation-based estimate|simulation output/i.test(js), 'MLB Simulator bundle must label simulation output');
  const board = await getJson(`${PUBLIC_API}/mlb-simulator/board`);
  assert(Array.isArray(board.games), 'MLB Simulator live board must return games array');
  assert(board.games.length > 0, 'MLB Simulator live board must have at least one game');
  const projectionResponse = await fetch(`${PUBLIC_API}/mlb-simulator/projection/${encodeURIComponent(board.games[0].id)}`, { cache: 'no-store' });
  assert(projectionResponse.ok, `MLB Simulator projection returned ${projectionResponse.status}`);
  const projection = await projectionResponse.json();
  assert(projection.projection && projection.projection.projected_score, 'MLB Simulator live projection must return projected score');
  assert(!projection.projection.props, 'MLB Simulator live projection must not expose unsupported props');
  assert(!projection.projection.first_five, 'MLB Simulator live projection must not expose unsupported First Five output');
}

(async () => {
  await auditTrendspotterStatic();
  await auditTrendspotterApi();
  await auditMlbSimulator();
  console.log('tools-live-readiness-audit: ok');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
