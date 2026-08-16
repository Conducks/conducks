/**
 * Conducks — the graph feature's only door (ADR 0150).
 *
 * The store and everything that binds it: the adjacency list, the engine that ingests a spectrum
 * into it, four linkers that resolve a reference to a node, three algorithms over the result, and
 * the classifiers that decide what is external.
 *
 * IT USED TO IMPORT PARSING, AND PARSING IMPORTS IT. `CONDUCKS-1` passed anyway, because no single
 * FILE closed a loop — but the moment each feature has a door, two `index.ts` importing one another
 * is a real ESM cycle, and this repository has paid for that twice already (`registry` ↔ `watcher`,
 * fixed by injection; `chronicle` ↔ `typescript/resolver`, which is why `getDiscoverySurface` uses a
 * dynamic import). So the cycle was broken BEFORE this file existed: `taxonomy` and `built-ins` moved
 * to `contracts/` — three features use each — and `graph-engine` now takes the prism types from
 * `contracts/` rather than through `parsing/prism-core`, which only re-exported them (todo73).
 *
 * The direction that remains is the true one: parsing PRODUCES spectra, graph STORES them.
 *
 * `tests/architecture/feature-doors.test.ts` fails when anything outside reaches past this file.
 *
 * WHAT STAYS INSIDE: `linker-intra`'s resolution strategies, the ranker's PageRank iteration, the
 * traversal helpers, `cluster-rule`. Callers ask for a linker or an algorithm and get its result;
 * none of them need the machinery, which is what makes `linker-intra` splittable later.
 */
export { ConducksAdjacencyList } from './adjacency-list.js';
export type { ConducksNode, ConducksEdge, NodeId, EdgeType } from './adjacency-list.js';
export {
  STRUCTURAL_EDGE_TYPES,
  NON_RUNTIME_EDGE_TYPES,
  IMPORT_CYCLE_IGNORED_EDGE_TYPES,
} from './adjacency-list.js';

export { ConducksGraph, spectrumNodeId } from './graph-engine.js';

export { GlobalSymbolLinker } from './linker.js';
export { IntraLinker } from './linker-intra.js';
export { FederatedLinker } from './linker-federated.js';
export { HttpServiceLinker } from './http-service-linker.js';

export { StructuralRanker } from './algorithms/ranker.js';

export { classifyOrigin } from './boundary-classifier.js';
export { clusterOf } from './cluster-rule.js';
export { EXTERNAL_ROOT, ecosystemId, externalNodeProps, libraryNamespaceId } from './external-nodes.js';
export { sameFamily } from './import-resolver.js';

export { ConducksDiffEngine } from './diff-engine.js';
