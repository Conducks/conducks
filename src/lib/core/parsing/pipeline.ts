import { AnalyzeContext } from "./context.js";

import { ConducksComponent } from "@/registry/types.js";

/**
 * Conducks — Pulse Pipeline
 * 
 * Orchestrates the topological sorting and processing of the Structural Pulse.
 */
export class ConducksPipeline implements ConducksComponent {
  public readonly id = "structural-pipeline";
  public readonly type = "resolver";
  public readonly version = "2.0.0";
  /**
   * Sorts the files in the context by dependency level.
   * Based on Kahn's Algorithm for Topological Sorting.
   */
  public static topologicalSort(importMap: Map<string, Set<string>>, allFiles: string[]): string[][] {
    const signalStrength = new Map<string, number>();
    const downstreamEchoes = new Map<string, string[]>();

    // Initialize signal strength and downstream echoes
    for (const file of allFiles) {
      signalStrength.set(file, 0);
    }

    for (const [caller, deps] of importMap) {
      for (const dep of deps) {
        if (!signalStrength.has(dep)) signalStrength.set(dep, 0);
        signalStrength.set(caller, (signalStrength.get(caller) ?? 0) + 1);

        if (!downstreamEchoes.has(dep)) downstreamEchoes.set(dep, []);
        downstreamEchoes.get(dep)!.push(caller);
      }
    }

    const resonanceTiers: string[][] = [];
    let activeTier = Array.from(signalStrength.entries())
      .filter(([_, degree]) => degree === 0)
      .map(([file, _]) => file);

    while (activeTier.length > 0) {
      resonanceTiers.push(activeTier);
      const emergingTier: string[] = [];

      for (const file of activeTier) {
        for (const dependent of downstreamEchoes.get(file) ?? []) {
          const newWeight = (signalStrength.get(dependent) ?? 1) - 1;
          signalStrength.set(dependent, newWeight);
          if (newWeight === 0) emergingTier.push(dependent);
        }
      }
      activeTier = emergingTier;
    }

    // Identify isolated loops (leftover with signal strength > 0)
    const isolatedLoops = Array.from(signalStrength.entries())
      .filter(([_, degree]) => degree > 0)
      .map(([file, _]) => file);

    if (isolatedLoops.length > 0) {
      resonanceTiers.push(isolatedLoops); // Add loops as the final resonance tier
    }

    return resonanceTiers;
  }
}
