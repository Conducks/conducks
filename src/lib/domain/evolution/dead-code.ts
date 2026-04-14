import { ConducksAdjacencyList, NodeId, ConducksNode } from '@/lib/core/graph/adjacency-list.js';
import { ConducksComponent } from "@/registry/types.js";

export interface Finding {
  type: 'ORPHAN' | 'UNUSED_EXPORT' | 'UNREACHABLE_LOGIC' | 'STALE_IMPORT';
  symbol: string;
  file: string;
  message: string;
}

/**
 * Conducks — Dead Code Analyzer
 * 
 * Logic for identifying unused, orphaned, and unreachable 
 * structural elements across the Synapse.
 */
export class DeadCodeAnalyzer implements ConducksComponent {
  public readonly id = 'dead-code-analyzer';
  public readonly type = 'analyzer';
  public readonly description = 'Identifiers unused, orphaned, and unreachable structural elements.';
  /**
   * Scans the entire graph for structural dead weight.
   */
  public analyze(graph: ConducksAdjacencyList): Finding[] {
    const findings: Finding[] = [];
    const nodes = Array.from(graph.getAllNodes());

    for (const node of nodes as ConducksNode[]) {
      const incoming = graph.getNeighbors(node.id, 'upstream');
      
      // 1. Orphaned Symbol (No callers/importers)
      // Only flag if it's a "Significant" symbol (Hierarchy Rank >= 5: Structure, Behavior, Atom)
      const isSignificant = ['STRUCTURE', 'BEHAVIOR', 'ATOM', 'INFRA'].includes(node.label);
      if (isSignificant && incoming.length === 0 && !this.isEntryPoint(node)) {
        findings.push({
          type: 'ORPHAN',
          symbol: node.properties.name,
          file: node.properties.filePath,
          message: `Symbol is defined but never called or referenced.`
        });
        continue;
      }

      // 2. Unused Export 
      if (node.properties.isExport) {
        // Find if any incoming edges are 'IMPORTS' from OTHER files or 'CALLS' from other files
        const externallyUsed = incoming.some((e: any) => {
          const source = graph.getNode(e.sourceId);
          return source && (source as any).properties.filePath !== (node as any).properties.filePath;
        });

        if (!externallyUsed && !this.isEntryPoint(node)) {
          findings.push({
            type: 'UNUSED_EXPORT',
            symbol: node.properties.name,
            file: node.properties.filePath,
            message: `Symbol is exported but never consumed by other modules.`
          });
        }
      }

      // 3. Stale Imports
      if (node.label === 'import_clause' || node.label === 'import_specifier') {
        const usage = graph.getNeighbors(node.id, 'upstream').filter(e => e.type === 'CALLS' || e.type === 'ACCESSES');
        if (usage.length === 0) {
          findings.push({
            type: 'STALE_IMPORT',
            symbol: node.properties.name,
            file: node.properties.filePath,
            message: `Imported symbol is never used in this file.`
          });
        }
      }
    }

    return findings;
  }

  private isEntryPoint(node: any): boolean {
    const entryNames = ['main', 'index', 'app', 'handler', 'setup'];
    const name = node.properties.name.toLowerCase();
    return entryNames.some(e => name.includes(e));
  }
}
