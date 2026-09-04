/**
 * @module plugins/manifest
 * @description
 * The declarative registry of built-in plugins (data layers) for Open World
 * Intelligence. This replaces the hard-coded registration sequence that used to
 * live in `main.js`: the core now discovers what to load from this data, and the
 * loader registers each entry through the stable plugin contract.
 *
 * `load` is a dynamic-import thunk, so importing this manifest does NOT pull in
 * Cesium or any layer code — that happens only when the loader invokes `load()`.
 * That keeps the manifest (and the registry logic that consumes it) unit-testable
 * without a browser/Cesium runtime.
 *
 * Order is authoritative and intentionally identical to the historical
 * registration order; `dependsOn` is declared honestly (the built-in layers have
 * no hard inter-layer load dependencies today) while the mechanism to declare and
 * resolve them exists for future plugins. `needsDataManager` reproduces the two
 * legacy `layer.attachDataManager(manager)` back-references.
 *
 * To add a new plugin: append an entry here (or load one from external config —
 * see docs/PLUGIN-ARCHITECTURE.md). No core code needs to change.
 */

/** @type {ReadonlyArray<import('./registry.js').PluginManifestEntry>} */
export const BUILTIN_PLUGIN_MANIFEST = Object.freeze([
  {
    id: 'flights',
    kind: 'layer',
    load: () => import('../data/flights.js'),
    dependsOn: [],
    description: 'Live civilian aircraft (OpenSky + adsb.lol).',
  },
  {
    id: 'military',
    kind: 'layer',
    load: () => import('../data/militaryFlights.js'),
    dependsOn: [],
    description: 'ADS-B military traffic (adsb.lol).',
  },
  {
    id: 'earthquakes',
    kind: 'layer',
    load: () => import('../data/earthquakes.js'),
    dependsOn: [],
    description: 'Global seismic activity, last 24h (USGS).',
  },
  {
    id: 'satellites',
    kind: 'layer',
    load: () => import('../data/satellites.js'),
    dependsOn: [],
    description: 'Satellite catalog with SGP4 propagation (CelesTrak).',
  },
  {
    id: 'rocket-launches',
    kind: 'layer',
    load: () => import('../data/rocketLaunches.js'),
    dependsOn: [],
    needsDataManager: true,
    description: 'Rolling 30-day launch schedule and ascent replays (Launch Library 2).',
  },
  {
    id: 'traffic',
    kind: 'layer',
    load: () => import('../data/traffic.js'),
    dependsOn: [],
    description: 'Live/simulated road congestion (TomTom + OSM).',
  },
  {
    id: 'cctv',
    kind: 'layer',
    load: () => import('../data/cctv.js'),
    dependsOn: [],
    description: 'Public camera mesh projected into 3D (city APIs).',
  },
  {
    id: 'radio',
    kind: 'layer',
    load: () => import('../data/radio.js'),
    dependsOn: [],
    description: 'Geolocated world radio with analog tuner (Radio Browser).',
  },
  {
    id: 'bikeshare',
    kind: 'layer',
    load: () => import('../data/bikeshare.js'),
    dependsOn: [],
    description: 'Live bikeshare station availability (GBFS).',
  },
  {
    id: 'ais-live-vessels',
    kind: 'layer',
    load: () => import('../data/aisLiveVessels.js'),
    dependsOn: [],
    description: 'Live global ships (AISStream).',
  },
  {
    id: 'military-installations',
    kind: 'layer',
    load: () => import('../data/militaryInstallations.js'),
    dependsOn: [],
    description: 'Viewport-bounded military-site context (OpenStreetMap).',
  },
  {
    id: 'military-awareness',
    kind: 'layer',
    load: () => import('../data/militaryAwareness.js'),
    dependsOn: [],
    needsDataManager: true,
    description: 'Cross-layer military awareness coordination.',
  },
  {
    id: 'local-datasets',
    kind: 'collection',
    load: () => import('../data/localLayers.js'),
    dependsOn: [],
    description: 'Bundled/local datasets: datacenters, dams, submarine cables, FIRMS fires.',
  },
]);
