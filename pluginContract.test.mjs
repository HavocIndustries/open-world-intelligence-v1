import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validatePlugin,
  describePluginContract,
  PLUGIN_API_VERSION,
} from './pluginContract.js';

const minimalLayer = () => ({
  id: 'demo',
  init() {},
  enable() {},
  disable() {},
  destroy() {},
});

test('a well-formed plugin validates with no errors', () => {
  const verdict = validatePlugin(minimalLayer());
  assert.equal(verdict.ok, true);
  assert.equal(verdict.id, 'demo');
  assert.deepEqual(verdict.errors, []);
});

test('a missing id is a hard error', () => {
  const bad = minimalLayer();
  delete bad.id;
  const verdict = validatePlugin(bad);
  assert.equal(verdict.ok, false);
  assert.equal(verdict.id, null);
  assert.ok(verdict.errors.some((e) => e.includes('id')));
});

test('an empty-string id is a hard error', () => {
  const verdict = validatePlugin({ ...minimalLayer(), id: '' });
  assert.equal(verdict.ok, false);
});

test('a duplicate id is reported when knownIds is supplied', () => {
  const verdict = validatePlugin(minimalLayer(), { knownIds: new Set(['demo']) });
  assert.equal(verdict.ok, false);
  assert.ok(verdict.errors.some((e) => e.includes('duplicate')));
});

test('a wrongly-typed lifecycle member is a hard error', () => {
  const verdict = validatePlugin({ ...minimalLayer(), enable: 'nope' });
  assert.equal(verdict.ok, false);
  assert.ok(verdict.errors.some((e) => e.includes('enable')));
});

test('a missing lifecycle member is a warning, not an error', () => {
  const layer = minimalLayer();
  delete layer.update; // update is optional anyway
  delete layer.destroy; // destroy is a lifecycle member -> warning
  const verdict = validatePlugin(layer);
  assert.equal(verdict.ok, true);
  assert.ok(verdict.warnings.some((w) => w.includes('destroy')));
});

test('an apiVersion mismatch warns but does not fail', () => {
  const verdict = validatePlugin({ ...minimalLayer(), apiVersion: PLUGIN_API_VERSION + 1 });
  assert.equal(verdict.ok, true);
  assert.ok(verdict.warnings.some((w) => w.includes('API')));
});

test('a non-object is rejected cleanly', () => {
  const verdict = validatePlugin(null);
  assert.equal(verdict.ok, false);
  assert.equal(verdict.id, null);
});

test('the contract description exposes the required id member', () => {
  const contract = describePluginContract();
  assert.equal(contract.apiVersion, PLUGIN_API_VERSION);
  assert.ok(contract.required.some((m) => m.name === 'id'));
});
