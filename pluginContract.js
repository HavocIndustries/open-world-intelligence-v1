/**
 * @module plugins/pluginContract
 * @description
 * The formal plugin contract for Open World Intelligence.
 *
 * A "plugin" is a data layer: a module the core discovers, registers, and drives
 * through {@link DataLayerManager}. This module does NOT change what a layer is —
 * it names, documents, and validates the interface the manager has always relied
 * on, so the core can depend on a stable contract instead of hard-coded
 * knowledge of individual layers. It is deliberately dependency-free (no Cesium,
 * no DOM) so it can be unit-tested in isolation and imported from anywhere.
 *
 * A plugin module is a plain object with a stable string `id` plus the lifecycle
 * members the manager calls. The manager tolerates missing optional members, so
 * validation distinguishes hard requirements (a real error) from recommended
 * members (a warning) — it never rewrites the module.
 */

/**
 * Contract version. Bump when the required surface below changes in a way that
 * existing plugins must react to. Plugins may advertise the version they target
 * via `apiVersion`; a mismatch is reported as a warning, not a hard failure,
 * because the manager remains backward tolerant.
 */
export const PLUGIN_API_VERSION = 1;

/** Members a plugin MUST provide. Absence is a hard validation error. */
export const REQUIRED_MEMBERS = Object.freeze([
  { name: 'id', kind: 'string', why: 'Stable identity used for registration, persistence, and voice-tool enums.' },
]);

/**
 * Members the manager will call when present. Absence is legal (the manager
 * guards every call) but usually intentional only for trivial layers, so a
 * missing lifecycle member is surfaced as a warning.
 */
export const LIFECYCLE_MEMBERS = Object.freeze([
  { name: 'init', kind: 'function', why: 'One-time initialization against the viewer.' },
  { name: 'enable', kind: 'function', why: 'Bring the layer to visible/active state.' },
  { name: 'disable', kind: 'function', why: 'Return the layer to hidden/inactive state.' },
  { name: 'destroy', kind: 'function', why: 'Release all resources; called on shutdown/unregister.' },
]);

/** Members that are purely optional; their absence is neither error nor warning. */
export const OPTIONAL_MEMBERS = Object.freeze([
  { name: 'name', kind: 'string' },
  { name: 'source', kind: 'string' },
  { name: 'icon', kind: 'string' },
  { name: 'showInTogglePanel', kind: 'boolean' },
  { name: 'update', kind: 'function' },
  { name: 'getStats', kind: 'function' },
  { name: 'getParams', kind: 'function' },
  { name: 'setParams', kind: 'function' },
  { name: 'setLifecyclePresentation', kind: 'function' },
  { name: 'getRowControls', kind: 'function' },
  { name: 'resolveTrackingRestoreTarget', kind: 'function' },
  { name: 'cancelPendingRestore', kind: 'function' },
  { name: 'cancelPendingTrackingRestore', kind: 'function' },
  { name: 'attachDataManager', kind: 'function', why: 'Back-reference to the manager; declare needsDataManager in the manifest.' },
  { name: 'updateInterval', kind: 'number' },
  { name: 'refreshInterval', kind: 'number' },
  { name: 'statsRefreshInterval', kind: 'number' },
]);

/** @returns {{apiVersion:number, required:ReadonlyArray, lifecycle:ReadonlyArray, optional:ReadonlyArray}} */
export function describePluginContract() {
  return {
    apiVersion: PLUGIN_API_VERSION,
    required: REQUIRED_MEMBERS,
    lifecycle: LIFECYCLE_MEMBERS,
    optional: OPTIONAL_MEMBERS,
  };
}

function typeOf(value) {
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

/**
 * Validate a single plugin module against the contract.
 * Pure: never mutates the module.
 *
 * @param {*} plugin The module object (typically a layer module's default export).
 * @param {{knownIds?:Set<string>}} [context] Optional set of already-seen ids for duplicate detection.
 * @returns {{id:(string|null), ok:boolean, errors:string[], warnings:string[]}}
 */
export function validatePlugin(plugin, { knownIds } = {}) {
  const errors = [];
  const warnings = [];

  if (!plugin || (typeof plugin !== 'object' && typeof plugin !== 'function')) {
    return { id: null, ok: false, errors: ['Plugin must be an object or function'], warnings };
  }

  const id = typeof plugin.id === 'string' ? plugin.id : null;

  for (const member of REQUIRED_MEMBERS) {
    const actual = typeOf(plugin[member.name]);
    if (actual !== member.kind || (member.kind === 'string' && !plugin[member.name])) {
      errors.push(`missing required "${member.name}" (${member.kind}): ${member.why}`);
    }
  }

  if (id && knownIds instanceof Set && knownIds.has(id)) {
    errors.push(`duplicate plugin id "${id}"`);
  }

  for (const member of LIFECYCLE_MEMBERS) {
    if (plugin[member.name] === undefined) {
      warnings.push(`no "${member.name}" — the manager will skip that lifecycle phase for this plugin`);
    } else if (typeOf(plugin[member.name]) !== member.kind) {
      errors.push(`"${member.name}" must be a ${member.kind}`);
    }
  }

  for (const member of OPTIONAL_MEMBERS) {
    if (plugin[member.name] !== undefined && typeOf(plugin[member.name]) !== member.kind) {
      warnings.push(`"${member.name}" should be a ${member.kind} when present`);
    }
  }

  if (plugin.apiVersion !== undefined && plugin.apiVersion !== PLUGIN_API_VERSION) {
    warnings.push(`targets plugin API v${plugin.apiVersion}; core provides v${PLUGIN_API_VERSION}`);
  }

  return { id, ok: errors.length === 0, errors, warnings };
}
