/**
 * Conducks — the registry feature's only door (ADR 0150).
 *
 * One class: the map from a file to the provider that can parse it, and from an id to a component.
 * It is the smallest feature in core and the most widely held — persistence, composition and two
 * domain services each keep one.
 *
 * WHY THE BOOTSTRAPPER IS NOT HERE, though the names suggest it belongs. `RegistryBootstrapper`
 * fills a registry, so `core/registry` looks like its home — but it imports the graph, persistence,
 * git, parsing and utils doors, while `persistence.ts` imports THIS one. Re-exporting the two
 * together would make `persistence -> registry -> bootstrapper -> persistence` a cycle, because a
 * door is itself a dependency edge (rule 5b) and importing one pulls in everything it re-exports.
 * That is the exact failure this campaign already paid for once with the graph door. So the
 * bootstrapper has its own door at `core/bootstrap`, and this one stays a leaf.
 *
 * `tests/architecture/feature-doors.test.ts` fails when anything outside reaches past this file.
 */
export { SynapseRegistry } from './synapse-registry.js';
export type { ConducksSuite } from './synapse-registry.js';
