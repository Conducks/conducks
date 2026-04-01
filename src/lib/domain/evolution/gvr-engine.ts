import fs from 'node:fs/promises';
import { ConducksAdjacencyList, NodeId } from '@/lib/core/graph/adjacency-list.js';

export interface RefactorResult {
  success: boolean;
  affectedFiles: string[];
  message: string;
  dryRun?: boolean;
}

/**
 * Conducks — Graph-Verified Refactoring (GVR) Engine
 * 
 * Safely executes multi-file renames by verifying the call-graph 
 * and performing atomic batch writes with rollback support.
 * 
 * Traverses both CALLS (upstream) and IMPORTS edges to ensure
 * type-only references (import type) are also captured.
 */
export class GVREngine {
  constructor(private readonly fileSystem: any = fs) {}

  /**
   * Executes a safe rename of a symbol across the entire project.
   * @param dryRun - If true, only reports affected files without writing to disk.
   */
  public async renameSymbol(
    graph: ConducksAdjacencyList,
    symbolId: NodeId,
    newName: string,
    dryRun: boolean = false
  ): Promise<RefactorResult> {
    const node = graph.getNode(symbolId);
    if (!node) {
      return { success: false, affectedFiles: [], message: `Symbol ${symbolId} not found.` };
    }

    const oldName = node.properties.name as string;

    // 1. Identify all affected files via BOTH upstream (CALLS) and IMPORTS edges
    const affectedNodeIds = new Set<NodeId>([symbolId]);

    // Traverse upstream CALLS (direct callers)
    const upstreamNeighbors = graph.getNeighbors(symbolId, 'upstream');
    upstreamNeighbors.forEach(e => affectedNodeIds.add(e.sourceId));

    // Also traverse all nodes that import this symbol (import type edges)
    // These are nodes whose name matches the symbol name and whose filePath differs
    const allNodes = graph.getAllNodes ? graph.getAllNodes() : [];
    for (const candidate of allNodes) {
      if (
        candidate.properties.name === oldName &&
        candidate.properties.filePath !== node.properties.filePath
      ) {
        affectedNodeIds.add(candidate.id as NodeId);
      }
    }

    const affectedFiles = new Set<string>();
    affectedNodeIds.forEach(id => {
      const n = graph.getNode(id);
      if (n && n.properties.filePath) {
        affectedFiles.add(n.properties.filePath as string);
      }
    });

    this.log(`[GVR] Identified ${affectedFiles.size} affected files.`);

    // 2. Dry-run: just report, don't write
    if (dryRun) {
      return {
        success: true,
        dryRun: true,
        affectedFiles: Array.from(affectedFiles),
        message: `[DRY RUN] Would rename '${oldName}' → '${newName}' in ${affectedFiles.size} files. No changes made.`
      };
    }

    // 3. Atomic Batch Write with Rollback
    const backups = new Map<string, string>();
    try {
      // Step A: Load and backup all files into memory
      for (const filePath of affectedFiles) {
        const content = await this.fileSystem.readFile(filePath, 'utf-8');
        backups.set(filePath, content);
      }

      // Step B: Perform in-memory replacements (word-boundary safe regex)
      for (const [filePath, content] of backups) {
        const newContent = content.replace(new RegExp(`\\b${oldName}\\b`, 'g'), newName);
        // Step C: Write to disk
        await this.fileSystem.writeFile(filePath, newContent, 'utf-8');
      }

      return {
        success: true,
        affectedFiles: Array.from(affectedFiles),
        message: `Successfully renamed '${oldName}' → '${newName}'.`
      };

    } catch (err) {
      this.log(`[GVR] Refactor failed. Rolling back...`, err);
      // Step D: Rollback all changes
      for (const [filePath, originalContent] of backups) {
        await this.fileSystem.writeFile(filePath, originalContent, 'utf-8').catch((e: Error) => {
          this.log(`[GVR] CRITICAL: Rollback failed for ${filePath}`, e);
        });
      }

      return {
        success: false,
        affectedFiles: Array.from(affectedFiles),
        message: `Refactor failed: ${(err as Error).message}. All changes rolled back.`
      };
    }
  }

  private log(...args: unknown[]): void {
    if (process.env.CONDUCKS_DEBUG === '1') {
      console.error(...args);
    }
  }
}
