/**
 * @module plugins/registry
 * @description
 * Pure planning logic for the plugin system: validate a manifest, resolve a
 * dependency-honoring load order, and apply enable/disable configuration.
 *
 * "Pure" is deliberate: nothing here imports Cesium, touches the DOM, or calls a
 * plugin's `load()`. It operates only on manifest metadata, so it is fully unit
 * testable and the runtime loader (which does touch Cesium) can stay a thin
 * shell around these decisions.
 *
 * A manifest entry is:
 *   {
 *     id: string,                 // stable, unique
 *     kind?: 'layer' | 'collection',   // 'collection' => load() yields an array of modules
 *     load: () => Promise<Module>,     // dynamic import thunk; not called here
 *     dependsOn?: string[],       // ids that must register before this one
 *     needsDataManager?: boolean, // call module.attachDataManager(manager) after register
 *     enabledByDefault?: boolean, // default true
 *     description?: string,
 *   }
 */

/** Error thrown for any structural problem in a manifest or its configuration. */
export class PluginManifestError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PluginManifestError';
  }
}

/**
 * Validate the shape of a manifest. Throws {@link PluginManifestError} with an
 * understandable message on the first structural problem it can name, and
 * returns the (unchanged) entries on success.
 * @param {Array} entries
 * @returns {Array}
 */
export function validateManifest(entries) {
  if (!Array.isArray(entries)) {
    throw new PluginManifestError('Plugin manifest must be an array');
  }
  const seen = new Set();
  for (const [index, entry] of entries.entries()) {
    const where = `manifest entry #${index}`;
    if (!entry || typeof entry !== 'object') {
      throw new PluginManifestError(`${where} is not an object`);
    }
    if (typeof entry.id !== 'string' || !entry.id) {
      throw new PluginManifestError(`${where} is missing a string "id"`);
    }
    if (seen.has(entry.id)) {
      throw new PluginManifestError(`duplicate plugin id "${entry.id}" in the manifest`);
    }
    seen.add(entry.id);
    if (typeof entry.load !== 'function') {
      throw new PluginManifestError(`plugin "${entry.id}" is missing a load() thunk`);
    }
    if (entry.kind !== undefined && entry.kind !== 'layer' && entry.kind !== 'collection') {
      throw new PluginManifestError(`plugin "${entry.id}" has invalid kind "${entry.kind}"`);
    }
    if (entry.dependsOn !== undefined && !Array.isArray(entry.dependsOn)) {
      throw new PluginManifestError(`plugin "${entry.id}" dependsOn must be an array`);
    }
  }
  return entries;
}

/**
 * Apply enable/disable configuration. `config` maps plugin id -> boolean or
 * { enabled: boolean }. Anything not mentioned falls back to the entry's
 * `enabledByDefault` (default true). A disabled plugin is dropped from the
 * returned set; a disabled plugin that others still depend on is a hard error,
 * because silently loading it anyway would hide a misconfiguration.
 *
 * @param {Array} entries validated manifest entries
 * @param {Object<string, (boolean|{enabled:boolean})>} [config]
 * @returns {Array} the subset (in original order) that should be loaded
 */
export function selectEnabled(entries, config = {}) {
  const isEnabled = (entry) => {
    const raw = config[entry.id];
    if (raw === undefined) return entry.enabledByDefault !== false;
    if (typeof raw === 'boolean') return raw;
    if (raw && typeof raw === 'object' && typeof raw.enabled === 'boolean') return raw.enabled;
    return entry.enabledByDefault !== false;
  };
  const enabled = entries.filter(isEnabled);
  const enabledIds = new Set(enabled.map((e) => e.id));
  for (const entry of enabled) {
    for (const dep of entry.dependsOn || []) {
      if (!enabledIds.has(dep)) {
        throw new PluginManifestError(
          `plugin "${entry.id}" depends on "${dep}", which is disabled or absent`,
        );
      }
    }
  }
  return enabled;
}

/**
 * Resolve a load order that satisfies `dependsOn` while staying as close as
 * possible to the manifest's authored order (a stable topological sort). Throws
 * on a missing dependency or a dependency cycle, naming the plugins involved.
 *
 * @param {Array} entries entries to order (already enable-filtered)
 * @returns {Array} the same entries in a dependency-safe order
 */
export function resolveLoadOrder(entries) {
  const byId = new Map(entries.map((e) => [e.id, e]));
  for (const entry of entries) {
    for (const dep of entry.dependsOn || []) {
      if (!byId.has(dep)) {
        throw new PluginManifestError(
          `plugin "${entry.id}" depends on unknown plugin "${dep}"`,
        );
      }
    }
  }

  const ordered = [];
  const state = new Map(); // id -> 'visiting' | 'done'
  const originalIndex = new Map(entries.map((e, i) => [e.id, i]));

  const visit = (entry, stack) => {
    const status = state.get(entry.id);
    if (status === 'done') return;
    if (status === 'visiting') {
      const cycle = [...stack.slice(stack.indexOf(entry.id)), entry.id].join(' -> ');
      throw new PluginManifestError(`plugin dependency cycle: ${cycle}`);
    }
    state.set(entry.id, 'visiting');
    // Visit dependencies in manifest order for deterministic output.
    const deps = [...(entry.dependsOn || [])].sort(
      (a, b) => (originalIndex.get(a) ?? 0) - (originalIndex.get(b) ?? 0),
    );
    for (const depId of deps) visit(byId.get(depId), [...stack, entry.id]);
    state.set(entry.id, 'done');
    ordered.push(entry);
  };

  for (const entry of entries) visit(entry, []);
  return ordered;
}

/**
 * Convenience: validate -> select enabled -> resolve order, returning the final
 * load plan plus the ids in order. Any problem throws {@link PluginManifestError}.
 * @param {Array} entries raw manifest
 * @param {Object} [config] enable/disable config
 * @returns {{plan:Array, orderedIds:string[]}}
 */
export function buildLoadPlan(entries, config = {}) {
  const validated = validateManifest(entries);
  const enabled = selectEnabled(validated, config);
  const plan = resolveLoadOrder(enabled);
  return { plan, orderedIds: plan.map((e) => e.id) };
}
