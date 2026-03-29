import { PulseContext } from "./context.js";

/**
 * Apostle — Pulse Pipeline
 * 
 * Orchestrates the topological sorting and processing of the Structural Pulse.
 */

export class ApostlePipeline {
  /**
   * Sorts the files in the context by dependency level.
   * Based on Kahn's Algorithm for Topological Sorting.
   */
  public static topologicalSort(importMap: Map<string, Set<string>>, allFiles: string[]): string[][] {
    const inDegree = new Map<string, number>();
    const reverseDeps = new Map<string, string[]>();
    
    // Initialize in-degree and reverse dependencies
    for (const file of allFiles) {
      inDegree.set(file, 0);
    }
    
    for (const [caller, deps] of importMap) {
      for (const dep of deps) {
        if (!inDegree.has(dep)) inDegree.set(dep, 0);
        inDegree.set(caller, (inDegree.get(caller) ?? 0) + 1);
        
        if (!reverseDeps.has(dep)) reverseDeps.set(dep, []);
        reverseDeps.get(dep)!.push(caller);
      }
    }

    const levels: string[][] = [];
    let currentLevel = Array.from(inDegree.entries())
      .filter(([_, degree]) => degree === 0)
      .map(([file, _]) => file);

    while (currentLevel.length > 0) {
      levels.push(currentLevel);
      const nextLevel: string[] = [];
      
      for (const file of currentLevel) {
        for (const dependent of reverseDeps.get(file) ?? []) {
          const newDeg = (inDegree.get(dependent) ?? 1) - 1;
          inDegree.set(dependent, newDeg);
          if (newDeg === 0) nextLevel.push(dependent);
        }
      }
      currentLevel = nextLevel;
    }

    // Identify files in cycles (leftover with in-degree > 0)
    const cycleFiles = Array.from(inDegree.entries())
      .filter(([_, degree]) => degree > 0)
      .map(([file, _]) => file);
      
    if (cycleFiles.length > 0) {
      levels.push(cycleFiles); // Add cycles as the final level
    }

    return levels;
  }
}
