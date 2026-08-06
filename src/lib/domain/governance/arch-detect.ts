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
  /** Fan-in/fan-out per cluster — hub-and-spoke vs mesh vs pipeline is read from this (todo41#P1). */
  shape: ClusterShape;
}

/**
 * BFS over dependency edges — and, when asked, CALLS.
 *
 * Two different questions share this walk (todo41#P2). REACHABILITY — "which modules does this
 * adapter's world contain" — must see a call through the composition root, because DI wiring is
 * exactly the case where an adapter never imports the domain it drives; without CALLS such a
 * codebase reads as unrelated islands, which is the ADR 0120 mistake from the other direction.
 * DIRECTION — "which layer depends on which" — must NOT see calls: a callback from core into an
 * adapter is runtime flow, not architecture, and counting it would report every event emitter as a
 * layering violation. The caller states which question it is asking.
 */
export function dependencyDistances(
  graph: ConducksAdjacencyList,
  startId: NodeId,
  opts: { includeCalls?: boolean } = {}
): Map<NodeId, number> {
  const d = new Map<NodeId, number>([[startId, 0]]);
  const queue: NodeId[] = [startId];
  while (queue.length) {
    const id = queue.shift()!;
    for (const e of graph.getNeighbors(id, 'downstream')) {
      const t = String(e.type);
      if (!DEPENDENCY_EDGES.has(t) && !(opts.includeCalls && t === 'CALLS')) continue;
      if (d.has(e.targetId)) continue;
      // A CALLS edge lands on a SYMBOL; the module it witnesses is the symbol's file. Walk on from
      // the unit so the cone contains modules, not stray members.
      d.set(e.targetId, d.get(id)! + 1);
      queue.push(e.targetId);
      if (opts.includeCalls && t === 'CALLS') {
        const file = String(graph.getNode(e.targetId)?.properties?.filePath ?? '').toLowerCase();
        // Both unit spellings exist across the codebase: the pulse writes `<file>::unit`, older
        // fixtures and some synthesized nodes key the unit by the bare file path.
        for (const unitId of [file ? `${file}::unit` : '', file] as NodeId[]) {
          if (unitId && graph.hasNode(unitId) && !d.has(unitId)) {
            d.set(unitId, d.get(id)! + 1);
            queue.push(unitId);
            break;
          }
        }
      }
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

  // A SYSTEM DOOR LIVES NEAR THE TOP OF THE TREE. Without a depth gate, sofie's calendar plugin —
  // `src/plugins/tools/calendar/adapters/` — matched the `/adapters/` fragment five directories
  // down and the whole repository was named "hexagonal" off one plugin's internal folder; at depth
  // 2 openship's dashboard still leaked `src/components/apps/` as a door. The gate is positional,
  // not semantic: the fragment opens at the root or under ONE parent (`src/interfaces` — the shape
  // a source root gives it), and the match position, subsystem and gate all read the SAME relative
  // path, because the full path contains the service's own name (`apps/dashboard/...` matches
  // `/apps/` in its prefix) and mixing the two picked different matches for gate and subsystem.
  const MAX_DOOR_DEPTH = 1;
  const unitPaths = [...graph.getAllNodes()]
    .filter(n => n.properties.canonicalKind === 'UNIT')
    .map(n => String(n.properties.filePath ?? '').toLowerCase())
    .filter(Boolean);
  const commonRoot = (() => {
    if (unitPaths.length === 0) return '';
    let prefix = unitPaths[0];
    for (const p of unitPaths) {
      while (prefix && !p.startsWith(prefix)) prefix = prefix.slice(0, prefix.lastIndexOf('/'));
    }
    return prefix;
  })();

  for (const node of graph.getAllNodes()) {
    if (node.properties.canonicalKind !== 'UNIT') continue;
    const file = String(node.properties.filePath ?? '').toLowerCase();
    if (!file) continue;
    // A TEST that imports an interface is not a door into the system.
    if (/(^|\/)tests?\//.test(file) || /\.(test|spec)\.[cm]?[jt]sx?$/.test(file)) continue;

    const relative = file.startsWith(commonRoot) ? file.slice(commonRoot.length) : file;
    const fragment = interfaceFragments.find(f => relative.includes(f));
    if (!fragment) continue;
    const at = relative.indexOf(fragment);
    const depth = relative.slice(0, at).split('/').filter(Boolean).length;
    if (depth > MAX_DOOR_DEPTH) continue;
    // The segment after the fragment must be a DIRECTORY — `src/cli/config.ts` has a filename
    // there, and a single file matching a naming convention is not a subsystem.
    const tail = relative.slice(at + fragment.length);
    if (!tail.includes('/')) continue;
    // The subsystem is the segment AFTER the interface fragment: interfaces/cli, interfaces/tools.
    const after = tail.split('/')[0];
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
  // ENTRY-FILE FALLBACK. A single service inside a monorepo has no `interfaces/` convention — its
  // door is `src/index.ts` or `src/main.ts`, which no fragment names. Fires only when the fragment
  // rule found NOTHING, so a repo with a real convention never mixes the two vocabularies. Same
  // honesty gates: near the root, not a test, depends outward, and nothing in-repo (tests aside)
  // depends on it — an entry is entered by a RUNTIME, not by other modules.
  if (out.length === 0) {
    for (const node of graph.getAllNodes()) {
      if (node.properties.canonicalKind !== 'UNIT') continue;
      const file = String(node.properties.filePath ?? '').toLowerCase();
      if (!file) continue;
      if (/(^|\/)tests?\//.test(file) || /\.(test|spec)\.[cm]?[jt]sx?$/.test(file)) continue;
      const relative = file.startsWith(commonRoot) ? file.slice(commonRoot.length) : file;
      if (!/^\/(?:src\/)?(?:index|main|cli|server|app)\.[cm]?[jt]sx?$/.test(relative)) continue;
      const outgoing = graph.getNeighbors(node.id, 'downstream')
        .filter(e => DEPENDENCY_EDGES.has(String(e.type))).length;
      if (outgoing === 0) continue;
      const incoming = graph.getNeighbors(node.id, 'upstream')
        .filter(e => DEPENDENCY_EDGES.has(String(e.type)))
        .filter(e => {
          const src = String(graph.getNode(e.sourceId)?.properties?.filePath ?? '').toLowerCase();
          return !/(^|\/)tests?\//.test(src) && !/\.(test|spec)\.[cm]?[jt]sx?$/.test(src);
        }).length;
      if (incoming > 0) continue;
      out.push({ id: node.id, file, role: 'driving', reason: `entry file at ${relative}` });
    }
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

  // Reachability question — CALLS included, so DI-wired adapters still converge (todo41#P2).
  const dists = driving.map(a => dependencyDistances(graph, a.id, { includeCalls: true }));
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

/** The longest path prefix every unit shares — the tree's own root, computed rather than passed. */
export function commonRootOf(graph: ConducksAdjacencyList): string {
  const paths = [...graph.getAllNodes()]
    .filter(n => n.properties.canonicalKind === 'UNIT')
    .map(n => String(n.properties.filePath ?? '').toLowerCase())
    .filter(Boolean);
  if (paths.length === 0) return '';
  let prefix = paths[0];
  for (const p of paths) {
    while (prefix && !p.startsWith(prefix)) prefix = prefix.slice(0, prefix.lastIndexOf('/'));
  }
  return prefix;
}

/**
 * The directory a file belongs to, at the depth architecture is discussed in.
 *
 * The APP PREFIX IS KEPT. The old rule cut everything before the last `src`, so on a monorepo
 * `apps/cli/src/commands` and `apps/api/src/commands` collapsed into one `src/commands` cluster and
 * the direction report mixed seven applications into one imaginary tree — 88 "bidirectional pairs"
 * on openship, most of them cross-app artifacts of the collapse. `root` strips the machine-specific
 * part so an absolute path cannot leak into a cluster name.
 */
export function clusterOf(file: string, depth = 3, root = ''): string {
  let f = String(file);
  if (root && f.toLowerCase().startsWith(root)) f = f.slice(root.length);
  const parts = f.split('/').filter(Boolean);
  const srcAt = parts.lastIndexOf('src');
  const prefix = srcAt > 0 ? parts.slice(0, srcAt) : [];
  const from = srcAt >= 0 ? srcAt : 0;
  const tail = parts.slice(from, from + depth + 1).slice(0, -1);
  const joined = [...prefix, ...tail].join('/');
  return joined || parts.slice(0, depth).join('/');
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
  const root = commonRootOf(graph);
  for (const edge of graph.getAllEdges()) {
    if (!DEPENDENCY_EDGES.has(String(edge.type))) continue;
    const s = graph.getNode(edge.sourceId), t = graph.getNode(edge.targetId);
    if (!s || !t) continue;
    const sf = String(s.properties.filePath ?? ''), tf = String(t.properties.filePath ?? '');
    if (!sf || !tf) continue;
    // Tests import what they test; that is the definition of a test, not a layer violation.
    if (/(^|\/)tests?\//.test(sf)) continue;
    const a = clusterOf(sf, 3, root), b = clusterOf(tf, 3, root);
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

/**
 * A MONOREPO HOLDS SEVERAL ARCHITECTURES, and one verdict over the whole tree is wrong by
 * construction (todo41#P4). Service roots are derived from the layout convention npm itself uses:
 * a top-level `apps/`, `packages/` or `services/` directory holds one service per child; any other
 * top-level directory with enough files is a candidate root of its own. A tree yielding fewer than
 * two services is not a monorepo and reports whole.
 */
export function detectServiceRoots(graph: ConducksAdjacencyList, minUnits = 15): string[] {
  const root = commonRootOf(graph);
  const counts = new Map<string, number>();
  for (const n of graph.getAllNodes()) {
    if (n.properties.canonicalKind !== 'UNIT') continue;
    const f = String(n.properties.filePath ?? '').toLowerCase();
    if (!f.startsWith(root)) continue;
    const parts = f.slice(root.length).split('/').filter(Boolean);
    if (parts.length < 3) continue;
    // ONLY the workspace convention makes a service. The first version also counted any large
    // top-level directory, and conducks itself promptly reported "5 services" — src, tests and
    // docs are directories, not deployables. `apps/*`, `packages/*`, `services/*` is the layout
    // npm workspaces standardised; a tree not using it reports whole.
    if (!['apps', 'packages', 'services'].includes(parts[0])) continue;
    const service = `${parts[0]}/${parts[1]}`;
    counts.set(service, (counts.get(service) ?? 0) + 1);
  }
  const roots = [...counts].filter(([, c]) => c >= minUnits).map(([s]) => `${root}/${s}`);
  return roots.length >= 2 ? roots.sort() : [];
}

/** The subgraph under one path prefix — nodes and the edges both of whose ends live there. */
export function subgraphUnder(graph: ConducksAdjacencyList, prefix: string): ConducksAdjacencyList {
  const sub = new ConducksAdjacencyList();
  const inScope = (id: NodeId): boolean => {
    const f = String(graph.getNode(id)?.properties?.filePath ?? '').toLowerCase();
    return f.startsWith(prefix);
  };
  for (const n of graph.getAllNodes()) {
    if (inScope(n.id)) sub.addNode(n as never);
  }
  for (const e of graph.getAllEdges()) {
    if (sub.hasNode(e.sourceId) && sub.hasNode(e.targetId)) sub.addEdge(e as never);
  }
  return sub;
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
    shape: clusterShape(layerEdges),
  };
}

/**
 * The SHAPE of the cluster graph (todo41#P1): per-cluster fan-in/fan-out, summarized just enough to
 * tell hub-and-spoke from mesh from pipeline. Distributions, not a verdict — naming stays in
 * arch-verdict, and only when a measurement clears a bar (ADR 0134).
 *
 *   hub-and-spoke  one cluster's degree dwarfs the median — most edges touch it
 *   pipeline       degrees hug 1-2 and the graph is a near-chain (edges ≈ clusters - 1, no hub)
 *   mesh           density high, degrees even — everything talks to everything
 */
export interface ClusterShape {
  perCluster: Array<{ cluster: string; fanIn: number; fanOut: number }>;
  /** Share of all cluster edges that touch the busiest cluster. 1.0 = pure star. */
  hubShare: number;
  busiest: string | null;
  /** Edges over possible directed pairs. Meaningful from 3 clusters up. */
  density: number;
}

export function clusterShape(layerEdges: LayerEdge[]): ClusterShape {
  const degrees = new Map<string, { fanIn: number; fanOut: number }>();
  const touch = (c: string) => degrees.get(c) ?? degrees.set(c, { fanIn: 0, fanOut: 0 }).get(c)!;
  for (const e of layerEdges) {
    touch(e.from).fanOut++;
    touch(e.to).fanIn++;
  }
  const perCluster = [...degrees.entries()]
    .map(([cluster, d]) => ({ cluster, ...d }))
    .sort((a, b) => (b.fanIn + b.fanOut) - (a.fanIn + a.fanOut));
  const total = layerEdges.length;
  const busiest = perCluster[0] ?? null;
  const touching = busiest === null ? 0
    : layerEdges.filter(e => e.from === busiest.cluster || e.to === busiest.cluster).length;
  const n = perCluster.length;
  return {
    perCluster,
    hubShare: total === 0 ? 0 : touching / total,
    busiest: busiest?.cluster ?? null,
    density: n < 2 ? 0 : total / (n * (n - 1)),
  };
}
