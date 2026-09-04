/**
 * @module plugins/loader
 * @description
 * Runtime glue between the declarative manifest and the existing
 * {@link DataLayerManager}. It is intentionally thin: all planning decisions
 * (validation, enable/disable, dependency order) live in the pure `registry.js`,
 * and all lifecycle mechanics still live in the manager. The loader only:
 *
 *   1. builds the load plan (registry),
 *   2. dynamically imports each plugin module,
 *   3. validates it against the plugin contract,
 *   4. registers it (spreading `collection` plugins into their member layers),
 *   5. wires the optional `attachDataManager` back-reference,
 *   6. isolates failures so one bad plugin cannot abort the others,
 *   7. seals the manager once (finalizeRegistrations).
 *
 * Behavior is identical to the former hard-coded block in `main.js`; the
 * difference is that the core no longer names individual layers.
 */

import { buildLoadPlan } from './registry.js';
import { validatePlugin } from './pluginContract.js';

/** Resolve a plugin module's default export (modules export the layer as default). */
function resolveModuleExport(imported) {
  return imported && imported.default !== undefined ? imported.default : imported;
}

/**
 * Load every enabled built-in plugin and register it with the manager.
 *
 * @param {object} args
 * @param {*} args.viewer Cesium viewer (passed through to the manager/layers).
 * @param {import('../data/manager.js').DataLayerManager} args.dataManager
 * @param {Array} args.manifest Plugin manifest (defaults handled by the registry).
 * @param {*} args.stateRegistry LAYER_STATE_REGISTRY passed to finalizeRegistrations.
 * @param {object} [args.config] Enable/disable config keyed by plugin id.
 * @param {Console} [args.logger] Where to report per-plugin problems.
 * @returns {Promise<{loaded:string[], failed:Array<{id:string, error:*}>, warnings:Array<{id:string, warnings:string[]}>}>}
 */
export async function loadPlugins({
  viewer,
  dataManager,
  manifest,
  stateRegistry,
  config = {},
  logger = console,
}) {
  void viewer; // The manager owns the viewer; kept in the signature for symmetry/future use.

  const { plan } = buildLoadPlan(manifest, config);

  const loaded = [];
  const failed = [];
  const warnings = [];
  const knownIds = new Set();

  for (const entry of plan) {
    try {
      const imported = await entry.load();
      const exported = resolveModuleExport(imported);
      const modules = entry.kind === 'collection'
        ? (Array.isArray(exported) ? exported : [])
        : [exported];

      if (entry.kind === 'collection' && !Array.isArray(exported)) {
        throw new Error(`collection plugin "${entry.id}" did not export an array`);
      }

      for (const module of modules) {
        const verdict = validatePlugin(module, { knownIds });
        if (!verdict.ok) {
          throw new Error(`invalid plugin (${verdict.id || 'no id'}): ${verdict.errors.join('; ')}`);
        }
        if (verdict.warnings.length) {
          warnings.push({ id: verdict.id, warnings: verdict.warnings });
        }
        dataManager.register(module);
        knownIds.add(verdict.id);
        if (entry.needsDataManager) {
          if (typeof module.attachDataManager !== 'function') {
            throw new Error(`plugin "${verdict.id}" declared needsDataManager but has no attachDataManager()`);
          }
          module.attachDataManager(dataManager);
        }
        loaded.push(verdict.id);
      }
    } catch (error) {
      // Error isolation: record and continue so unrelated plugins still load.
      failed.push({ id: entry.id, error });
      logger?.error?.(`[Plugins] failed to load "${entry.id}":`, error);
    }
  }

  // Restoration starts only after the complete registry is sealed — unchanged
  // from the historical contract.
  dataManager.finalizeRegistrations(stateRegistry);

  return { loaded, failed, warnings };
}
