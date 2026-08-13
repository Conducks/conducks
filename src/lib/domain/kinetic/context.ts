import { ConducksAdjacencyList } from '@/lib/core/graph/adjacency-list.js';

/**
 * Conducks — Symbol Neighbourhood (the scored BFS behind `context`)
 *
 * ONE implementation, because there were two (todo57). `conducks context` walked a directional flow
 * trace with source lines; `conducks_context` ran this scored BFS with a token budget. Same question,
 * two answers, one name — and MEASURED on `resolveSymbolId` they shared 44 names out of 2,407 against
 * 83. That is not drift between twins, it is two different features, and the CLI's was the weaker of
 * the two: 247 of its 2,407 entries were unresolved `node` placeholders and 196 were whole files.
 *
 * ADR 0148 decides which survives — "the same input produces the same ANSWER, differing only in
 * rendering", and it names this case in its own text: source lines on the CLI, a token budget on the
 * tool. So the ANSWER is here, and both surfaces reach it through the registry. What stays outside is
 * genuinely presentation: the tool's byte budget, the CLI's line reader.
 *
 * Scoring is `confidence x 1/(depth+1) x 1/(canonicalRank+1)`, and each term has a scar:
 *
 * - `canonicalRank`, NOT the PageRank `rank` field. This read `node.properties.rank` — a small float
 *   every node carries — so the term barely separated ATOM from BEHAVIOR and could score a leaf
 *   variable above the function holding it (todo28#P4).
 * - CONTAINERS are excluded. `1/(canonicalRank+1)` means "lower rank number is worth more", and the
 *   low numbers are DIRECTORY 4 and UNIT 5 against BEHAVIOR 8 — so the formula ranked a folder above
 *   every function in it. Measured on the oracle fixture, `context logAudit` returned nine files and
 *   folders ahead of the six functions that actually call it (ADR 0103).
 * - ATOMs are excluded by default: 51% of the graph is ATOM and they crowded out what a caller wants
 *   (todo28#P4). `includeAtoms` opts back in.
 */

/** Kinds that CONTAIN rather than participate — see the header. */
const CONTAINERS = new Set(['ECOSYSTEM', 'REPOSITORY', 'PACKAGE', 'NAMESPACE', 'DIRECTORY', 'UNIT']);

export interface ContextNode {
  id: string;
  name: string;
  kind: string;
  rank: number;
  file: string;
  line: number | null;
  depth: number;
  relevance_score: number;
}

export interface ContextOptions {
  /** Hops from the anchor. */
  radius?: number;
  /** Admit ATOM nodes, which are excluded by default. */
  includeAtoms?: boolean;
}

export class ContextAnalyzer {
  constructor(private graph: ConducksAdjacencyList) {}

  /**
   * The scored neighbourhood around a symbol, highest relevance first.
   *
   * Returns EVERY scored candidate. Bounding is the caller's business — the tool spends a token
   * budget, the CLI takes a line count — because a bound is the one thing the two surfaces
   * legitimately disagree about, and deciding it here would force one of them to re-cut.
   */
  public neighbourhood(startId: string, options: ContextOptions = {}): ContextNode[] {
    const maxDepth = options.radius ?? 2;
    const includeAtoms = options.includeAtoms === true;
    const graph = this.graph;

    type Entry = { nodeId: string; depth: number; edgeWeight: number };
    const visited = new Map<string, Entry>();
    const queue: Entry[] = [{ nodeId: startId, depth: 0, edgeWeight: 1.0 }];
    visited.set(startId, { nodeId: startId, depth: 0, edgeWeight: 1.0 });

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current.depth >= maxDepth) continue;

      // BOTH directions: callers matter as much as callees for "what is around this symbol".
      for (const dir of ['downstream', 'upstream'] as const) {
        for (const edge of graph.getNeighbors(current.nodeId, dir)) {
          const neighborId = dir === 'downstream' ? edge.targetId : edge.sourceId;
          if (visited.has(neighborId)) continue;
          const entry: Entry = {
            nodeId: neighborId,
            depth: current.depth + 1,
            edgeWeight: edge.confidence ?? 1.0,
          };
          visited.set(neighborId, entry);
          queue.push(entry);
        }
      }
    }

    // The anchor is not its own context.
    visited.delete(startId);

    const scored: ContextNode[] = [];
    for (const entry of visited.values()) {
      const node = graph.getNode(entry.nodeId);
      if (!node) continue;
      if (!includeAtoms && node.properties?.canonicalKind === 'ATOM') continue;
      if (CONTAINERS.has(String(node.properties?.canonicalKind ?? ''))) continue;

      const rankWeight = 1 / ((node.properties?.canonicalRank ?? 4) + 1);
      const relevance_score = (entry.edgeWeight ?? 0.5) * (1 / (entry.depth + 1)) * rankWeight;

      scored.push({
        id: node.id,
        name: node.properties.name,
        kind: node.properties.canonicalKind,
        rank: node.properties.canonicalRank,
        file: node.properties.filePath,
        line: (node.properties as any)?.range?.start?.line ?? null,
        depth: entry.depth,
        relevance_score: parseFloat(relevance_score.toFixed(4)),
      });
    }

    scored.sort((a, b) => b.relevance_score - a.relevance_score);
    return scored;
  }
}
