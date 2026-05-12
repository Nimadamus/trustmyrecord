#!/usr/bin/env node

const assert = require('assert');

global.CONFIG = { api: { baseUrl: 'http://example.test/api', fallbackUrls: [] } };
global.localStorage = {
  getItem() { return null; },
  setItem() {},
  removeItem() {},
};
global.AbortSignal = global.AbortSignal || { timeout() { return undefined; } };
global.fetch = async () => ({
  ok: true,
  json: async () => ({ status: 'ok' }),
});

const { TrustMyRecordAPI } = require('../static/js/backend-api.js');

function makeClient() {
  const client = Object.create(TrustMyRecordAPI.prototype);
  client.calls = [];
  client.request = async function request(endpoint, options = {}) {
    this.calls.push({ endpoint, options });
    return { endpoint, options };
  };
  return client;
}

async function main() {
  const client = makeClient();

  await client.listModelDefinitions();
  assert.strictEqual(client.calls[0].endpoint, '/models', 'list calls strict private /api/models endpoint');
  assert.strictEqual(client.calls[0].options.method, undefined, 'list uses GET/default method');

  await client.listModelDefinitions({ status: 'archived', include_archived: true });
  assert.strictEqual(
    client.calls[1].endpoint,
    '/models?status=archived&include_archived=true',
    'list supports private filter query params'
  );

  await client.getModelDefinition(123);
  assert.strictEqual(client.calls[2].endpoint, '/models/123', 'get calls one private model endpoint');

  await client.createModelDefinition({
    name: 'Private MLB model',
    sport_key: 'baseball_mlb',
    visibility: 'public',
    source_type: 'trendspotter',
    criteria_json: { markets: ['totals'], output: { prediction: 'fake edge' } },
    bankroll_json: { unit_mode: 'flat', performance: { fake: true }, backtest_results: { roi: 99 } },
    roi: 99,
    win_rate: 99,
    sample_size: 1000,
    record: '100-0',
    performance: { fake: true },
    tracker_id: 7,
  });
  const createCall = client.calls[3];
  assert.strictEqual(createCall.endpoint, '/models', 'create calls strict private create endpoint');
  assert.strictEqual(createCall.options.method, 'POST', 'create uses POST');
  assert.strictEqual(createCall.options.body.visibility, 'private', 'create forces private visibility');
  assert.strictEqual(createCall.options.body.source_type, 'manual_builder', 'create forces manual_builder source');
  ['roi', 'win_rate', 'sample_size', 'record', 'performance', 'tracker_id'].forEach((field) => {
    assert(!Object.prototype.hasOwnProperty.call(createCall.options.body, field), `create omits ${field}`);
  });
  assert(!Object.prototype.hasOwnProperty.call(createCall.options.body.criteria_json.output, 'prediction'), 'create omits nested prediction fields');
  assert(!Object.prototype.hasOwnProperty.call(createCall.options.body.bankroll_json, 'performance'), 'create omits nested performance fields');
  assert(!Object.prototype.hasOwnProperty.call(createCall.options.body.bankroll_json, 'backtest_results'), 'create omits nested backtest fields');

  await client.updateModelDefinition(123, {
    name: 'Updated private model',
    criteria_json: { stats: { wins: 20 }, markets: ['h2h'] },
    stats: { wins: 20 },
    analytics: { edge: 'fake' },
    model_tracker_id: 44,
    tracked_pick_id: 55,
    result_units: 12,
  });
  const updateCall = client.calls[4];
  assert.strictEqual(updateCall.endpoint, '/models/123', 'update calls strict private update endpoint');
  assert.strictEqual(updateCall.options.method, 'PATCH', 'update uses PATCH');
  assert.strictEqual(updateCall.options.body.visibility, 'private', 'update forces private visibility');
  assert.strictEqual(updateCall.options.body.source_type, 'manual_builder', 'update forces manual_builder source');
  ['stats', 'analytics', 'model_tracker_id', 'tracked_pick_id', 'result_units'].forEach((field) => {
    assert(!Object.prototype.hasOwnProperty.call(updateCall.options.body, field), `update omits ${field}`);
  });
  assert(!Object.prototype.hasOwnProperty.call(updateCall.options.body.criteria_json, 'stats'), 'update omits nested stats fields');

  await client.archiveModelDefinition(123);
  const archiveCall = client.calls[5];
  assert.strictEqual(archiveCall.endpoint, '/models/123/archive', 'archive calls safe archive path');
  assert.strictEqual(archiveCall.options.method, 'POST', 'archive uses POST');
  assert.strictEqual(archiveCall.options.body, undefined, 'archive sends no performance payload');

  await client.restoreModelDefinition(123);
  const restoreCall = client.calls[6];
  assert.strictEqual(restoreCall.endpoint, '/models/123/restore', 'restore calls safe restore path');
  assert.strictEqual(restoreCall.options.method, 'POST', 'restore uses POST');
  assert.strictEqual(restoreCall.options.body, undefined, 'restore sends no performance payload');

  await client.deleteModelDefinition(123);
  const deleteCall = client.calls[7];
  assert.strictEqual(deleteCall.endpoint, '/models/123', 'delete calls strict private delete endpoint');
  assert.strictEqual(deleteCall.options.method, 'DELETE', 'delete uses DELETE');
  assert.strictEqual(deleteCall.options.body, undefined, 'delete sends no performance payload');

  assert(client.calls.every((call) => !/model-builder\/models|model-tracker|tracker/i.test(call.endpoint)), 'legacy model-builder/model-tracker endpoints are not called');

  console.log('model-builder-api-client-test: ok');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
