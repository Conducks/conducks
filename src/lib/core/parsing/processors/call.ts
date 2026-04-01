import { ConducksAdjacencyList, NodeId, ConducksNode, ConducksEdge } from '@/lib/core/graph/adjacency-list.js';
import { PrismSpectrum } from "@/lib/core/parsing/prism-core.js";
import { AnalyzeContext } from "@/lib/core/parsing/context.js";

/**
 * Conducks — Call Processor
 * 
 * Handles call-site analysis, constructor inference, and return type propagation.
 */
export class CallProcessor {
  /**
   * Processes a call-site capture (@kinesis_target) and identifies its relationship.
   */
  public process(target: string, source: string, type: 'CALLS' | 'CONSTRUCTS' | 'TYPE_REFERENCE', spectrum: PrismSpectrum, args: string[] = [], context?: AnalyzeContext): void {
    if (!target) return;

    let targetName = target;

    // Conducks.6: Perform Cross-Module Symbol Resolution (The Great Binding)
    if (context) {
      const resolvedPath = context.resolveLocalBinding(target);
      if (resolvedPath) {
        targetName = `${resolvedPath}::${target}`;
      }
    }

    spectrum.relationships.push({
      sourceName: source || 'UNIT',
      targetName: targetName,
      type: type,
      confidence: 0.85,
      metadata: { arguments: args, original: target }
    });
  }


  /**
   * Identifies if a name-to-name call is a constructor call.
   * e.g. In Python `new User()` or Java `new User()` or Go `User{}`
   */
  public isConstructor(name: string, provider: any): boolean {
    // Basic heuristic: Starts with uppercase (capitalized class)
    return /^[A-Z]/.test(name);
  }
}
