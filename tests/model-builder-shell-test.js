#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const shellPath = path.join(root, 'model-builder', 'index.html');
const shellScriptPath = path.join(root, 'static', 'js', 'model-builder-shell.js');
const sitewidePath = path.join(root, 'static', 'js', 'tmr-sitewide.js');

assert(fs.existsSync(shellPath), '/model-builder/ shell file exists');
assert(fs.existsSync(shellScriptPath), 'Model Builder shell client script exists');

const html = fs.readFileSync(shellPath, 'utf8');
const shellScript = fs.readFileSync(shellScriptPath, 'utf8');
const sitewide = fs.existsSync(sitewidePath) ? fs.readFileSync(sitewidePath, 'utf8') : '';
const visibleHtml = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/TrustMyRecord/gi, '').replace(/trustmyrecord/gi, '');
const robotsMeta = html.match(/<meta\b[^>]*\bname=["']robots["'][^>]*>/i);

assert(robotsMeta, 'shell has robots meta tag');
assert(/content=["'][^"']*\bindex\b[^"']*\bfollow\b[^"']*["']/i.test(robotsMeta[0]), 'shell is index/follow for public Tools Hub access');
assert(!/Checking access/.test(html), 'shell does not start behind access check');
assert(!/Login required/.test(html), 'shell does not block logged-out users');
assert(/\/static\/js\/backend-api\.js/.test(html), 'shell loads API client for private endpoints');
assert(/\/static\/js\/model-builder-shell\.js/.test(html), 'shell loads page-specific client script');
assert(!/model-builder/i.test(sitewide), 'sitewide public navigation does not expose Model Builder');
assert(/Guided model setup/.test(html), 'shell presents a guided setup flow');
assert(/Real data is not connected/.test(html), 'shell labels unavailable data clearly');
assert(/results and public claims require real graded data/.test(html), 'shell rejects premature claims');
assert(/id="modelBuilderDetail"/.test(html), 'shell has a model detail panel');
assert(/id="modelCompare"/.test(html), 'shell has a model comparison panel');

[
  'Model Tracker',
  'model-tracker',
  'tracked picks',
  'fake',
  'ROI',
  'win rate',
  'sample size',
  'backtest',
  'prediction',
  'marketplace',
  'leaderboard',
  'grading stats',
  'public profile',
  'performance claims',
].forEach((text) => {
  assert(!visibleHtml.includes(text), `visible shell does not expose disallowed text: ${text}`);
});

function makeElement(id) {
  return {
    id,
    hidden: false,
    value: '',
    textContent: '',
    innerHTML: '',
    className: '',
    listeners: {},
    addEventListener(type, fn) {
      this.listeners[type] = fn;
    },
    reset() {
      this.value = '';
    },
  };
}

function makeContext(storageValues = {}) {
  const elements = {};
  [
    'authCheck',
    'loginRequired',
    'modelBuilderShell',
    'modelBuilderList',
    'modelBuilderForm',
    'modelBuilderMessage',
    'formTitle',
    'modelName',
    'modelDescription',
    'modelSport',
    'modelStatus',
    'modelMarket',
    'modelSide',
    'minOdds',
    'maxOdds',
    'minConfidence',
    'modelOutput',
    'modelNotes',
    'unitMode',
    'defaultUnits',
    'maxUnits',
    'factorControls',
    'modelSummary',
    'modelBuilderDetail',
    'modelCompare',
    'resetModelBtn',
  ].forEach((id) => { elements[id] = makeElement(id); });

  elements.modelBuilderShell.hidden = true;
  elements.loginRequired.hidden = true;
  elements.modelSport.value = 'baseball_mlb';
  elements.modelStatus.value = 'draft';
  elements.modelMarket.value = 'totals';
  elements.modelSide.value = 'any';
  elements.minOdds.value = '-150';
  elements.maxOdds.value = '150';
  elements.minConfidence.value = '0';
  elements.modelOutput.value = 'ranked_shortlist';
  elements.unitMode.value = 'flat';
  elements.defaultUnits.value = '1';
  elements.maxUnits.value = '1';

  let models = [{
    id: 1,
    name: 'Private MLB definition',
    description: 'Owner-only configuration',
    sport_key: 'baseball_mlb',
    status: 'draft',
    visibility: 'private',
    source_type: 'manual_builder',
    criteria_json: { markets: ['totals'], roi: 99, stats: { wins: 20 } },
    bankroll_json: { unit_mode: 'flat', win_rate: 99 },
    roi: 99,
    win_rate: 99,
    sample_size: 1000,
    model_tracker_id: 99,
  }];
  const calls = [];

  const api = {
    ready: Promise.resolve(),
    async listModelDefinitions(options) {
      calls.push({ method: 'listModelDefinitions', options });
      return { models: models.slice() };
    },
    async getModelDefinition(id) {
      calls.push({ method: 'getModelDefinition', id });
      return { model: models.find((model) => String(model.id) === String(id)) };
    },
    async createModelDefinition(payload) {
      calls.push({ method: 'createModelDefinition', payload });
      const model = { id: models.length + 1, ...payload };
      models.push(model);
      return { model };
    },
    async updateModelDefinition(id, payload) {
      calls.push({ method: 'updateModelDefinition', id, payload });
      models = models.map((model) => String(model.id) === String(id) ? { ...model, ...payload } : model);
      return { model: models.find((model) => String(model.id) === String(id)) };
    },
    async archiveModelDefinition(id) {
      calls.push({ method: 'archiveModelDefinition', id });
      models = models.map((model) => String(model.id) === String(id) ? { ...model, status: 'archived' } : model);
      return { model: models.find((model) => String(model.id) === String(id)) };
    },
    async restoreModelDefinition(id) {
      calls.push({ method: 'restoreModelDefinition', id });
      models = models.map((model) => String(model.id) === String(id) ? { ...model, status: 'active' } : model);
      return { model: models.find((model) => String(model.id) === String(id)) };
    },
    async deleteModelDefinition(id) {
      calls.push({ method: 'deleteModelDefinition', id });
      models = models.filter((model) => String(model.id) !== String(id));
      return { deleted: true };
    },
  };

  const context = {
    window: {
      api,
      localStorage: {
        setItem(key, value) {
          storageValues[key] = value;
        },
        getItem(key) {
          return Object.prototype.hasOwnProperty.call(storageValues, key) ? storageValues[key] : null;
        },
      },
      confirm() {
        calls.push({ method: 'confirm' });
        return true;
      },
    },
    document: {
      readyState: 'complete',
      getElementById(id) {
        return elements[id] || null;
      },
      addEventListener() {},
    },
    setTimeout,
    clearTimeout,
    encodeURIComponent,
    console,
  };
  context.window.document = context.document;
  return { context, elements, calls };
}

async function tick() {
  for (let i = 0; i < 8; i += 1) {
    await Promise.resolve();
  }
}

async function main() {
  const loggedOut = makeContext();
  vm.runInNewContext(shellScript, loggedOut.context);
  await tick();
  assert.strictEqual(loggedOut.elements.modelBuilderShell.hidden, false, 'logged-out state shows shell');
  assert.strictEqual(loggedOut.calls.length, 0, 'logged-out state makes no model data calls');
  assert(/Local browser draft mode/.test(loggedOut.elements.modelBuilderMessage.textContent), 'logged-out state labels local draft mode');

  loggedOut.elements.modelName.value = 'Local audit model';
  loggedOut.elements.modelDescription.value = 'Local config';
  loggedOut.elements.modelSport.value = 'baseball_mlb';
  loggedOut.elements.modelStatus.value = 'draft';
  loggedOut.elements.modelMarket.value = 'totals';
  loggedOut.elements.modelSide.value = 'under';
  await loggedOut.context.window.TMRModelBuilderShell.saveModel({ preventDefault() {} });
  assert(/Local audit model/.test(loggedOut.elements.modelBuilderList.innerHTML), 'logged-out save renders local draft');

  const loggedIn = makeContext({
    trustmyrecord_session: JSON.stringify({ user: { username: 'private_user' } }),
  });
  vm.runInNewContext(shellScript, loggedIn.context);
  await tick();
  assert.strictEqual(loggedIn.elements.modelBuilderShell.hidden, false, 'logged-in state shows shell');
  assert(loggedIn.calls.some((call) => call.method === 'listModelDefinitions'), 'logged-in state loads private models');
  assert(/Private MLB definition/.test(loggedIn.elements.modelBuilderList.innerHTML), 'logged-in state renders owner model');
  ['roi', 'win_rate', 'sample_size', 'model_tracker_id', '99', '1000', 'backtest', 'prediction'].forEach((text) => {
    assert(!loggedIn.elements.modelBuilderList.innerHTML.includes(text), `model list does not expose ${text}`);
  });
  ['data-action="view"', 'data-action="edit"', 'data-action="archive"', 'data-action="delete"'].forEach((marker) => {
    assert(loggedIn.elements.modelBuilderList.innerHTML.includes(marker), `model list exposes ${marker}`);
  });

  await loggedIn.context.window.TMRModelBuilderShell.viewModel(1);
  assert(loggedIn.calls.some((call) => call.method === 'listModelDefinitions'), 'list method remains available');
  assert.strictEqual(loggedIn.elements.modelBuilderDetail.hidden, false, 'view shows detail panel');
  assert(/Private MLB definition/.test(loggedIn.elements.modelBuilderDetail.innerHTML), 'detail panel renders selected model');
  ['roi', 'win_rate', 'sample_size', 'model_tracker_id', '99', '1000', 'backtest', 'prediction'].forEach((text) => {
    assert(!loggedIn.elements.modelBuilderDetail.innerHTML.includes(text), `detail panel does not expose ${text}`);
  });

  loggedIn.elements.modelName.value = 'Created private model';
  loggedIn.elements.modelDescription.value = 'Private config';
  loggedIn.elements.modelSport.value = 'basketball_nba';
  loggedIn.elements.modelStatus.value = 'draft';
  loggedIn.elements.modelMarket.value = 'h2h';
  loggedIn.elements.modelSide.value = 'underdog';
  loggedIn.elements.modelOutput.value = 'watchlist_only';
  loggedIn.elements.defaultUnits.value = '0.5';
  loggedIn.elements.maxUnits.value = '1';
  await loggedIn.context.window.TMRModelBuilderShell.saveModel({ preventDefault() {} });
  assert(loggedIn.calls.some((call) => call.method === 'createModelDefinition'), 'create method is called');
  const createCall = loggedIn.calls.find((call) => call.method === 'createModelDefinition');
  assert.strictEqual(createCall.payload.visibility, 'private', 'create stays private');
  assert.strictEqual(createCall.payload.criteria_json.builder_mode, 'guided', 'create uses guided criteria');
  assert.strictEqual(createCall.payload.criteria_json.data_status, 'unavailable_until_connected', 'create labels unavailable data');
  assert.strictEqual(createCall.payload.criteria_json.output.includes_score, false, 'create does not generate a score');
  assert.strictEqual(createCall.payload.bankroll_json.risk_note.includes('Configuration only'), true, 'bankroll is configuration-only');
  assert(!/ROI|record|win rate|prediction|backtest/i.test(createCall.payload.bankroll_json.risk_note), 'bankroll note has no fake performance wording');

  await loggedIn.context.window.TMRModelBuilderShell.archiveModel(1);
  assert(loggedIn.calls.some((call) => call.method === 'archiveModelDefinition'), 'archive method is called');

  await loggedIn.context.window.TMRModelBuilderShell.restoreModel(1);
  assert(loggedIn.calls.some((call) => call.method === 'restoreModelDefinition'), 'restore method is called');

  await loggedIn.context.window.TMRModelBuilderShell.deleteModel(1);
  assert(loggedIn.calls.some((call) => call.method === 'confirm'), 'delete asks for confirmation');
  assert(loggedIn.calls.some((call) => call.method === 'deleteModelDefinition'), 'delete method is called');

  assert(loggedIn.calls.every((call) => !/model-tracker|tracker/i.test(call.method)), 'no public tracker method is called');

  console.log('model-builder-shell-test: ok');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
