import { ConducksAdjacencyList, NodeId } from '@/lib/core/graph/adjacency-list.js';

/**
 * Conducks — Architecture Detection 🏛️
 *
 * Answers "what IS this codebase" from the graph, as maths and then a decision table — no model, no
 * narration (ADR 0134).
 *
 * Conducks already knew its own answer and had it WRITTEN BY HAND: `LAYER_FRAGMENTS` and
 * `ALLOWED_DEPENDENCIES` in `sentinel-rules.ts` declare seven layers and their legal direction, and
 * `guard` enforces them. A human derived that table by reading the code. Every fact in it is already
 * in the graph, which is the whole argument for inferring it instead.
 *
 * Measured on this repository before any naming existed (todo41#P1):
 *
 *     cone of cli/index.ts          500 nodes
 *     cone of tools/server.ts       429 nodes
 *     cone of web/mirror-server.ts  409 nodes
 *     shared by all three           407 nodes
 *     composition root              registry/index.ts — worst-case distance 1 from ALL THREE
 *
 * The runner-up sits at distance 2, so the convergence is not a close call on this subject.
 */

/** Edges that express a DEPENDENCY. Containment and runtime calls are not architecture (ADR 0120). */
const DEPENDENCY_EDGES = new Set(['IMPORTS', 'EXTENDS', 'IMPLEMENTS', 'DEPENDS_ON']);

export interface Adapter {
  id: NodeId;
  file: string;
  /** `driving` — a door INTO the system. `driven` — something the system reaches out to. */
  role: 'driving' | 'driven';
  reason: string;
}

export interface CompositionRoot {
  id: NodeId;
  file: string;
  /** The largest hop count from any adapter. 1 means every adapter depends on it directly. */
  worstDistance: number;
  /** How many adapters reach it at all. A root every adapter shares is the strong case. */
  reachedBy: number;
}

export interface LayerEdge { from: string; to: string; count: number }

export interface ArchMeasurements {
  adapters: Adapter[];
  compositionRoot: CompositionRoot | null;
  /** Directory-level dependency edges, aggregated. */
  layerEdges: LayerEdge[];
  /** Cluster pairs pointing BOTH ways — a one-way DAG has none. */
  bidirectional: Array<{ a: string; b: string }>;
  unitCount: number;
}

/** BFS over dependency edges only. */
export function dependencyDistances(graph: ConducksAdjacencyList, startId: NodeId): Map<NodeId, number> {
  const d = new Map<NodeId, number>([[startId, 0]]);
  const queue: NodeId[] = [startId];
  while (queue.length) {
    const id = queue.shift()!;
    for (const e of graph.getNeighbors(id, 'downstream')) {
      if (!DEPENDENCY_EDGES.has(String(e.type))) continue;
      if (d.has(e.targetId)) continue;
      d.set(e.targetId, d.get(id)! + 1);
      queue.push(e.targetId);
    }
  }
  return d;
}

/**
 * The doors into the system.
 *
 * `entry` (ADR 0113) answers "where does execution begin", which is close but not the same question:
 * it lists `pulse-worker.ts`, a process conducks spawns for ITSELF, and it misses
 * `web/mirror-server.ts` because that file is imported by the CLI rather than run directly. An
 * ADAPTER is a module that (a) sits in an interface directory and (b) depends on the rest of the
 * system rather than being depended upon by it.
 *
 * A `driven` adapter — a thing the system reaches OUT to, such as the vault — is recognised by the
 * reverse shape: interface-shaped, but depended upon.
 */
export function detectAdapters(graph: ConducksAdjacencyList, interfaceFragments: string[]): Adapter[] {
  // ONE ADAPTER PER SUBSYSTEM, not one per file.
  //
  // The first rule counted any interface module that depended outward, and returned 48 on this
  // repository — every CLI command file. A command is not a door; the CLI is. People say "three
  // adapters: CLI, MCP, Web", and the graph agrees once the question is asked at subsystem
  // granularity: `interfaces/<name>` is the boundary, and the adapter is the module inside it that
  // the others hang off.
  //
  // (The composition root came out right even with 48 — `registry/index.ts` at worst-distance 1 —
  // which is a useful sign that the convergence maths does not depend on the adapter rule being
  // precise. It is still fixed here, because 48 is a wrong ANSWER even when it is a harmless input.)
  const bySubsystem = new Map<string, Array<{ id: NodeId; file: string; incoming: number; outgoing: number }>>();

  for (const node of graph.getAllNodes()) {
    if (node.properties.canonicalKind !== 'UNIT') continue;
    const file = String(node.properties.filePath ?? '').toLowerCase();
    if (!file) continue;
    // A TEST that imports an interface is not a door into the system.
    if (/(^|\/)tests?\//.test(file) || /\.(test|spec)\.[cm]?[jt]sx?$/.test(file)) continue;

    const fragment = interfaceFragments.find(f => file.includes(f));
    if (!fragment) continue;
    // The subsystem is the segment AFTER the interface fragment: interfaces/cli, interfaces/tools.
    const after = file.slice(file.indexOf(fragment) + fragment.length).split('/')[0];
    if (!after) continue;
    const subsystem = `${fragment.replace(/^\/|\/$/g, '')}/${after}`;

    const outgoing = graph.getNeighbors(node.id, 'downstream')
      .filter(e => DEPENDENCY_EDGES.has(String(e.type))).length;
    // INCOMING IGNORES TESTS. A test importing the entry point does not stop it being a door — and
    // measured on this repository it decided the answer: `cli/index.ts` had in=3, ALL THREE from
    // test files, so the CLI's representative came out as `commands/context.ts` (in=1, out=9)
    // instead of the real entry (in=0 once tests are excluded, out=85).
    const incoming = graph.getNeighbors(node.id, 'upstream')
      .filter(e => DEPENDENCY_EDGES.has(String(e.type)))
      .filter(e => {
        const src = String(graph.getNode(e.sourceId)?.properties?.filePath ?? '').toLowerCase();
        return !/(^|\/)tests?\//.test(src) && !/\.(test|spec)\.[cm]?[jt]sx?$/.test(src);
      }).length;
    if (outgoing === 0) continue;

    if (!bySubsystem.has(subsystem)) bySubsystem.set(subsystem, []);
    bySubsystem.get(subsystem)!.push({ id: node.id, file, incoming, outgoing });
  }

  const out: Adapter[] = [];
  for (const [subsystem, members] of bySubsystem) {
    // The subsystem's own door: fewest things inside depend on it, and it depends on the most.
    const entry = [...members].sort((a, b) => a.incoming - b.incoming || b.outgoing - a.outgoing)[0];
    out.push({
      id: entry.id,
      file: entry.file,
      role: 'driving',
      reason: `${subsystem} — ${members.length} module(s), entered at ${entry.file.split('/').pop()}`,
    });
  }
  return out.sort((a, b) => a.file.localeCompare(b.file));
}

/**
 * Where the adapters' dependency cones CONVERGE.
 *
 * The rule is a graph centre: among the nodes every adapter can reach, the one whose WORST distance
 * from an adapter is smallest. Measured on this repository, `registry/index.ts` scores 1 and the
 * runner-up scores 2 — every adapter depends on the root directly, which is what a composition root
 * IS.
 *
 * Returns null when the adapters share nothing, which is a real answer: several entry points with
 * disjoint cones is a plugin or multi-service repository, not a hexagon.
 */
export function detectCompositionRoot(
  graph: ConducksAdjacencyList,
  adapters: Adapter[]
): CompositionRoot | null {
  const driving = adapters.filter(a => a.role === 'driving');
  if (driving.length < 2) return null;

  const dists = driving.map(a => dependencyDistances(graph, a.id));
  const shared = [...dists[0].keys()].filter(id => dists.every(d => d.has(id)));

  let best: CompositionRoot | null = null;
  for (const id of shared) {
    const node = graph.getNode(id);
    if (!node || node.properties.canonicalKind !== 'UNIT') continue;
    // The adapters themselves are trivially in their own cones.
    if (driving.some(a => a.id === id)) continue;
    const worst = Math.max(...dists.map(d => d.get(id)!));
    const total = dists.reduce((s, d) => s + d.get(id)!, 0);
    if (!best || worst < best.worstDistance ||
        (worst === best.worstDistance && total < (best as any).__total)) {
      best = { id, file: String(node.properties.filePath ?? ''), worstDistance: worst, reachedBy: driving.length };
      (best as any).__total = total;
    }
  }
  if (best) delete (best as any).__total;
  return best;
}

/** The directory a file belongs to, at the depth architecture is discussed in. */
export function clusterOf(file: string, depth = 3): string {
  const parts = String(file).split('/').filter(Boolean);
  const srcAt = parts.lastIndexOf('src');
  const from = srcAt >= 0 ? srcAt : 0;
  return parts.slice(from, from + depth + 1).slice(0, -1).join('/') || parts.slice(0, depth).join('/');
}

/**
 * The cluster-level dependency graph, and whether it flows one way.
 *
 * A layered architecture is a DAG at the cluster level. Counting the pairs that point BOTH ways is
 * how "layered" stops being a claim and becomes a number.
 */
export function detectLayers(graph: ConducksAdjacencyList): {
  layerEdges: LayerEdge[];
  bidirectional: Array<{ a: string; b: string }>;
} {
  const counts = new Map<string, number>();
  for (const edge of graph.getAllEdges()) {
    if (!DEPENDENCY_EDGES.has(String(edge.type))) continue;
    const s = graph.getNode(edge.sourceId), t = graph.getNode(edge.targetId);
    if (!s || !t) continue;
    const sf = String(s.properties.filePath ?? ''), tf = String(t.properties.filePath ?? '');
    if (!sf || !tf) continue;
    // Tests import what they test; that is the definition of a test, not a layer violation.
    if (/(^|\/)tests?\//.test(sf)) continue;
    const a = clusterOf(sf), b = clusterOf(tf);
    if (!a || !b || a === b) continue;
    counts.set(`${a} ${b}`, (counts.get(`${a} ${b}`) ?? 0) + 1);
  }

  const layerEdges: LayerEdge[] = [...counts].map(([k, count]) => {
    const [from, to] = k.split(' ');
    return { from, to, count };
  }).sort((x, y) => y.count - x.count);

  const seen = new Set(layerEdges.map(e => `${e.from} ${e.to}`));
  const bidirectional: Array<{ a: string; b: string }> = [];
  for (const e of layerEdges) {
    if (!seen.has(`${e.to} ${e.from}`)) continue;
    if (bidirectional.some(p => p.a === e.to && p.b === e.from)) continue;
    bidirectional.push({ a: e.from, b: e.to });
  }
  return { layerEdges, bidirectional };
}

/** Every measurement, with no naming — naming is a separate decision (todo41#P3). */
export function measure(graph: ConducksAdjacencyList, interfaceFragments: string[]): ArchMeasurements {
  const adapters = detectAdapters(graph, interfaceFragments);
  const { layerEdges, bidirectional } = detectLayers(graph);
  return {
    adapters,
    compositionRoot: detectCompositionRoot(graph, adapters),
    layerEdges,
    bidirectional,
    unitCount: [...graph.getAllNodes()].filter(n => n.properties.canonicalKind === 'UNIT').length,
  };
}
