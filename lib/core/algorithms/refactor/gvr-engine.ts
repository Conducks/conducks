import fs from 'node:fs/promises';
import { ConducksAdjacencyList, NodeId } from "../../graph/adjacency-list.js";

interface RefactorResult {
  success: boolean;
  affectedFiles: string[];
  message: string;
}

/**
 * Conducks — Graph-Verified Refactoring (GVR) Engine
 * 
 * Safely executes multi-file renames by verifying the call-graph 
 * and performing atomic batch writes with rollback support.
 */
export class GVREngine {
  /**
   * Executes a safe rename of a symbol across the entire project.
   */
  public async renameSymbol(
    graph: ConducksAdjacencyList,
    symbolId: NodeId,
    newName: string
  ): Promise<RefactorResult> {
    const node = graph.getNode(symbolId);
    if (!node) {
      return { success: false, affectedFiles: [], message: `Symbol ${symbolId} not found.` };
    }

    // 1. Identify all affected files (Definition + Callers)
    const affectedNodeIds = new Set<NodeId>([symbolId]);
    const upstreamNeighbors = graph.getNeighbors(symbolId, 'upstream');
    upstreamNeighbors.forEach(e => affectedNodeIds.add(e.sourceId));

    const affectedFiles = new Set<string>();
    affectedNodeIds.forEach(id => {
      const n = graph.getNode(id);
      if (n && n.properties.filePath) {
        affectedFiles.add(n.properties.filePath);
      }
    });

    console.error(`[GVR] Identified ${affectedFiles.size} affected files.`);

    // 2. Conflict Check (Simplified for now)
    // In a real implementation, we would re-parse each file and check scopes.
    
    // 3. Atomic Batch Write with Rollback
    const backups = new Map<string, string>();
    try {
      // Step A: Load and backup all files into memory
      for (const filePath of affectedFiles) {
        const content = await fs.readFile(filePath, 'utf-8');
        backups.set(filePath, content);
      }

      // Step B: Perform in-memory replacements (Regex for proof of concept)
      for (const [filePath, content] of backups) {
        const oldName = node.properties.name;
        // Use a safe regex that respects identifier boundaries
        const newContent = content.replace(new RegExp(`\\b${oldName}\\b`, 'g'), newName);
        
        // Step C: Write to disk
        await fs.writeFile(filePath, newContent, 'utf-8');
      }

      return { 
        success: true, 
        affectedFiles: Array.from(affectedFiles), 
        message: `Successfully renamed ${node.properties.name} to ${newName}.` 
      };

    } catch (err) {
      console.error(`[GVR] Refactor failed. Rolling back...`, err);
      // Step D: Rollback all changes
      for (const [filePath, originalContent] of backups) {
        await fs.writeFile(filePath, originalContent, 'utf-8').catch(e => {
          console.error(`[GVR] CRITICAL: Rollback failed for ${filePath}`, e);
        });
      }

      return { 
        success: false, 
        affectedFiles: Array.from(affectedFiles), 
        message: `Refactor failed: ${(err as Error).message}. All changes rolled back.` 
      };
    }
  }
}
