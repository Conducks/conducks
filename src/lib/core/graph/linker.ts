import { ConducksAdjacencyList, ConducksEdge } from "./adjacency-list.js";
import { ImportResolver, sameFamily } from "./import-resolver.js";
import path from "node:path";

/**
 * Conducks — Global Symbol Linker
 * 
 * Orchestrates cross-file symbol resolution. Connects imports 
 * and call-sites across the entire project graph.
 */
export class GlobalSymbolLinker {
  /**
   * Links nodes across the entire adjacency list. 
   * Iterates through all nodes and attempts to resolve dangling references.
   */
  public link(graph: ConducksAdjacencyList): void {
    const nodes = Array.from(graph.getNodesMap().values()) as any[];
    
    this.log(`[Conducks Linker] Starting global resolution for ${nodes.length} nodes...`);

    for (const node of nodes) {
      if (node.label === 'import') {
        this.resolveImport(node, graph);
      }
    }
  }

  /**
   * Resolves a single import node using the 3-tier ImportResolver.
   *
   * Tier 1 (0.95): same-file symbol
   * Tier 2 (0.9 / 0.85): path-scoped resolution with named/namespace/default semantics
   * Tier 3 (0.5): global fuzzy fallback
   */
  private resolveImport(node: any, graph: ConducksAdjacencyList): void {
    const filePath = node.properties.filePath;
    const sourcePath = node.properties.source; // e.g., './utils.js'
    const symbolName = node.properties.name;
    const importText = node.properties.importText; // optional raw import statement

    if (!sourcePath || !filePath) return;

    // Build candidate absolute paths (extensions + index files)
    const absoluteSource = path.resolve(path.dirname(filePath), sourcePath);
    const resolvedCandidates = [
      absoluteSource,
      absoluteSource + '.ts',
      absoluteSource + '.js',
      absoluteSource + '.py',
      absoluteSource + '/index.ts',
      absoluteSource + '/index.js',
    ];

    const resolver = new ImportResolver(graph);
    const resolution = resolver.resolve(
      node.id,
      sourcePath,
      symbolName,
      importText,
      resolvedCandidates
    );

    if (resolution) {
      const edge: ConducksEdge = {
        id: `${node.id}::${resolution.targetId}::IMPORTS`,
        sourceId: node.id,
        targetId: resolution.targetId,
        type: 'IMPORTS',
        confidence: resolution.confidence,
        properties: { tier: resolution.tier }
      };
      graph.addEdge(edge);
      return;
    }

    // Tier 3 fallback: name-only fuzzy match (legacy path)
    if (symbolName) this.fuzzyLink(node, symbolName, graph);
  }

  /**
   * Attempts to link symbols by name if path resolution fails.
   */
  private fuzzyLink(node: any, name: string, graph: ConducksAdjacencyList): void {
    // Find any node with the same name that is a BEHAVIOR or STRUCTURE.
    // Never match across language families (a TS symbol cannot import a Rust/Go/Python one).
    //
    // Was `Array.from(graph.getNodesMap().values()).filter(...)`, which both scanned and COPIED
    // every node in the graph on each call — and this is the tier-3 fallback, so it ran once per
    // symbol that the first two tiers could not resolve. O(unresolved x nodes) in time and O(nodes)
    // of garbage per call. The name index answers it in one lookup.
    //
    // The index is keyed lowercase while this compares the exact spelling, so the case check stays:
    // narrowing by lowercase first is strictly cheaper and cannot miss a match.
    const candidates: any[] = [];
    for (const id of graph.getNodeIdsByLowerName(name.toLowerCase())) {
      const n: any = graph.getNode(id);
      if (!n) continue;
      if (n.properties?.name !== name) continue;
      if (n.label !== 'BEHAVIOR' && n.label !== 'STRUCTURE') continue;
      if (!sameFamily(node.id, n.id)) continue;
      candidates.push(n);
    }

    if (candidates.length === 1) {
      const target = candidates[0] as any;
      const edge: ConducksEdge = {
        id: `${node.id}::${target.id}::IMPORTS_FUZZY`,
        sourceId: node.id,
        targetId: target.id,
        type: 'IMPORTS',
        confidence: 0.5,
        properties: { fuzzy: true, tier: 3 }
      };
      graph.addEdge(edge);
    }
  }

  private log(...args: unknown[]): void {
    if (process.env.CONDUCKS_DEBUG === '1') {
      console.error(...args);
    }
  }
}
