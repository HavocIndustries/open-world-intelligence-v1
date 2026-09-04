import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateManifest,
  selectEnabled,
  resolveLoadOrder,
  buildLoadPlan,
  PluginManifestError,
} from './registry.js';
import { BUILTIN_PLUGIN_MANIFEST } from './manifest.js';

const entry = (id, extra = {}) => ({ id, load: async () => ({ default: { id } }), ...extra });

// ---- validateManifest -------------------------------------------------------

test('validateManifest accepts a well-formed manifest', () => {
  const m = [entry('a'), entry('b')];
  assert.equal(validateManifest(m), m);
});

test('validateManifest rejects a non-array', () => {
  assert.throws(() => validateManifest({}), PluginManifestError);
});

test('validateManifest rejects a missing id', () => {
  assert.throws(() => validateManifest([{ load: async () => ({}) }]), PluginManifestError);
});

test('validateManifest rejects a duplicate id', () => {
  assert.throws(() => validateManifest([entry('a'), entry('a')]), /duplicate/);
});

test('validateManifest rejects a missing load thunk', () => {
  assert.throws(() => validateManifest([{ id: 'a' }]), /load/);
});

test('validateManifest rejects an invalid kind', () => {
  assert.throws(() => validateManifest([entry('a', { kind: 'widget' })]), /kind/);
});

// ---- selectEnabled ----------------------------------------------------------

test('selectEnabled enables everything by default', () => {
  const m = [entry('a'), entry('b')];
  assert.deepEqual(selectEnabled(m).map((e) => e.id), ['a', 'b']);
});

test('selectEnabled honors boolean config', () => {
  const m = [entry('a'), entry('b')];
  assert.deepEqual(selectEnabled(m, { b: false }).map((e) => e.id), ['a']);
});

test('selectEnabled honors { enabled } object config', () => {
  const m = [entry('a'), entry('b')];
  assert.deepEqual(selectEnabled(m, { a: { enabled: false } }).map((e) => e.id), ['b']);
});

test('selectEnabled honors enabledByDefault:false', () => {
  const m = [entry('a', { enabledByDefault: false }), entry('b')];
  assert.deepEqual(selectEnabled(m).map((e) => e.id), ['b']);
  assert.deepEqual(selectEnabled(m, { a: true }).map((e) => e.id), ['a', 'b']);
});

test('selectEnabled fails when an enabled plugin depends on a disabled one', () => {
  const m = [entry('a'), entry('b', { dependsOn: ['a'] })];
  assert.throws(() => selectEnabled(m, { a: false }), /depends on "a"/);
});

// ---- resolveLoadOrder -------------------------------------------------------

test('resolveLoadOrder preserves manifest order when there are no deps', () => {
  const m = [entry('a'), entry('b'), entry('c')];
  assert.deepEqual(resolveLoadOrder(m).map((e) => e.id), ['a', 'b', 'c']);
});

test('resolveLoadOrder places dependencies before dependents', () => {
  const m = [entry('a', { dependsOn: ['c'] }), entry('b'), entry('c')];
  const order = resolveLoadOrder(m).map((e) => e.id);
  assert.ok(order.indexOf('c') < order.indexOf('a'));
});

test('resolveLoadOrder throws on an unknown dependency', () => {
  assert.throws(() => resolveLoadOrder([entry('a', { dependsOn: ['ghost'] })]), /unknown plugin "ghost"/);
});

test('resolveLoadOrder throws on a dependency cycle', () => {
  const m = [entry('a', { dependsOn: ['b'] }), entry('b', { dependsOn: ['a'] })];
  assert.throws(() => resolveLoadOrder(m), /cycle/);
});

test('resolveLoadOrder is deterministic for diamond deps', () => {
  const m = [
    entry('top', { dependsOn: ['left', 'right'] }),
    entry('left', { dependsOn: ['base'] }),
    entry('right', { dependsOn: ['base'] }),
    entry('base'),
  ];
  const order = resolveLoadOrder(m).map((e) => e.id);
  assert.ok(order.indexOf('base') < order.indexOf('left'));
  assert.ok(order.indexOf('left') < order.indexOf('top'));
  assert.ok(order.indexOf('right') < order.indexOf('top'));
});

// ---- buildLoadPlan + the REAL manifest -------------------------------------

test('buildLoadPlan runs validate -> select -> order end to end', () => {
  const m = [entry('a', { dependsOn: ['b'] }), entry('b')];
  const { orderedIds } = buildLoadPlan(m);
  assert.deepEqual(orderedIds, ['b', 'a']);
});

test('the shipped built-in manifest is structurally valid', () => {
  assert.doesNotThrow(() => validateManifest(BUILTIN_PLUGIN_MANIFEST));
});

test('the shipped manifest loads in the historical registration order', () => {
  const { orderedIds } = buildLoadPlan(BUILTIN_PLUGIN_MANIFEST);
  assert.deepEqual(orderedIds, [
    'flights',
    'military',
    'earthquakes',
    'satellites',
    'rocket-launches',
    'traffic',
    'cctv',
    'radio',
    'bikeshare',
    'ais-live-vessels',
    'military-installations',
    'military-awareness',
    'local-datasets',
  ]);
});

test('the two legacy attach hooks are declared in the manifest', () => {
  const needsManager = BUILTIN_PLUGIN_MANIFEST.filter((e) => e.needsDataManager).map((e) => e.id);
  assert.deepEqual(needsManager.sort(), ['military-awareness', 'rocket-launches']);
});

test('the bundled datasets entry is a collection', () => {
  const local = BUILTIN_PLUGIN_MANIFEST.find((e) => e.id === 'local-datasets');
  assert.equal(local.kind, 'collection');
});
