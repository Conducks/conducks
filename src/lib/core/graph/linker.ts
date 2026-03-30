import { ConducksAdjacencyList, NodeId, ConducksEdge } from "./adjacency-list.js";
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
    const nodes = Array.from((graph as any).nodes.values()) as any[]; 
    
    this.log(`[Conducks Linker] Starting global resolution for ${nodes.length} nodes...`);

    for (const node of nodes) {
      if (node.label === 'import') {
        this.resolveImport(node, graph);
      }
    }
  }

  /**
   * Resolves a single import node.
   * Logic: Matches the import name and source path to a specific definition.
   */
  private resolveImport(node: any, graph: ConducksAdjacencyList): void {
    const filePath = node.properties.filePath;
    const sourcePath = node.properties.source; // e.g., './utils.js'
    const symbolName = node.properties.name;

    if (!sourcePath || !filePath) return;

    // 1. Resolve absolute path of the source
    const absoluteSource = path.resolve(path.dirname(filePath), sourcePath);
    
    // 2. Search for the actual definition in the target file
    const targetNodeId = `${absoluteSource}::${symbolName}`;
    const targetNode = graph.getNode(targetNodeId);

    if (targetNode) {
      // 3. Create the IMPORTS edge
      const edge: ConducksEdge = {
        id: `${node.id}::${targetNodeId}::IMPORTS`,
        sourceId: node.id,
        targetId: targetNodeId,
        type: 'IMPORTS',
        confidence: 1.0,
        properties: {}
      };
      graph.addEdge(edge);
      this.log(`[Conducks Linker] Linked: ${node.id} -> ${targetNodeId}`);
    } else {
      // Fuzzy match or cross-package link placeholder
      this.fuzzyLink(node, symbolName, graph);
    }
  }

  /**
   * Attempts to link symbols by name if path resolution fails.
   */
  private fuzzyLink(node: any, name: string, graph: ConducksAdjacencyList): void {
    // Simplified: Find any node with the same name that is a 'function' or 'class'
    const candidates = Array.from((graph as any).nodes.values()).filter((n: any) => 
      n.properties.name === name && (n.label === 'function' || n.label === 'class')
    );

    if (candidates.length === 1) {
      const target = candidates[0] as any;
      const edge: ConducksEdge = {
        id: `${node.id}::${target.id}::IMPORTS_FUZZY`,
        sourceId: node.id,
        targetId: target.id,
        type: 'IMPORTS',
        confidence: 0.7,
        properties: { fuzzy: true }
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
