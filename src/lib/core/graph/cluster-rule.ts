/**
 * Conducks — ADR 0028's clustering rule, in one place.
 *
 * The rule: walk up `parentId` until a node that a reader RECOGNISES as a container — a DIRECTORY,
 * REPOSITORY or NAMESPACE — and cluster there. Grouping by the IMMEDIATE parent instead is a
 * different rule with a different answer: measured on this repository it produced 404 clusters
 * against 128, and the 128 are the containers someone can actually name.
 *
 * It lived TWICE. `mirror.engine.detectCluster()` defined it against an in-memory node map, and the
 * SQL wave path re-implemented it against a three-column projection when ADR 0054 moved that work
 * off the materialised graph. Two implementations of one rule drift — todo25#P9 recorded that as
 * accepted debt at the time, deliberately, rather than superseding ADR 0028 as a side effect of a
 * performance change. This closes it the other way: the rule was never the problem, so it is kept
 * and the second copy is removed.
 *
 * It lives in `core/graph` rather than beside the mirror because `core` may not import from
 * `domain` — the boundary gate caught exactly that when this was first placed in `domain/visual`,
 * with `persistence.ts` importing upward. The rule is a pure walk over ids and kinds with no domain
 * dependency, so `core` is where it belongs and both callers reach it downward.
 *
 * Parameterised on a LOOKUP rather than on a graph or a database, because the two callers genuinely
 * have different sources — one a `Map` of full nodes, the other rows of `id, parentId,
 * canonicalKind`. A shared function that demanded one shape would force the other caller to build
 * it, which is how the duplication started.
 */

/** The three kinds that end the walk. A node of any other kind is climbed past. */
export const CLUSTER_CONTAINERS: ReadonlySet<string> = new Set(['DIRECTORY', 'REPOSITORY', 'NAMESPACE']);

/** Where the walk lands when nothing above a node is a container (ADR 0057's single root). */
export const CLUSTER_FALLBACK = 'ecosystem::global';

/**
 * The most hops the walk will take before giving up.
 *
 * A bound rather than a visited-set: the containment tree is shallow in practice, and a cycle is a
 * graph defect that `audit` reports rather than something this should quietly absorb. Both copies
 * used 20 and kept it.
 */
const MAX_HOPS = 20;

/** What the walk needs to know about one node. `undefined` for an id the caller does not hold. */
export interface ClusterLookup {
  (id: string): { parentId?: string | null; canonicalKind?: string } | undefined;
}

/**
 * The cluster `startId` belongs to, per ADR 0028.
 *
 * Stops on a self-parent instead of burning the hop budget: `parentId === id` is a defect the graph
 * engine already guards against, and treating it as "no parent" gives the same answer the copies
 * gave, one immediately and one after twenty no-op hops.
 */
export function clusterOf(startId: string, lookup: ClusterLookup): string {
  let cur: string | undefined = startId;
  for (let hops = 0; hops < MAX_HOPS && cur; hops++) {
    const n = lookup(cur);
    if (!n) break;
    if (CLUSTER_CONTAINERS.has(String(n.canonicalKind))) return cur;
    const parent = n.parentId;
    if (!parent || parent === cur) break;
    cur = parent;
  }
  return CLUSTER_FALLBACK;
}
