import { ConducksAdjacencyList, NodeId, ConducksNode, ConducksEdge } from '@/lib/core/graph/adjacency-list.js';
import { PrismSpectrum } from "@/lib/core/parsing/prism-core.js";
import { AnalyzeContext } from "@/lib/core/parsing/context.js";
import { isBuiltIn, getGlobalId } from "../built-ins.js";

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

    let targetId = target.toLowerCase();
    const langId = spectrum.metadata.language || 'typescript';

    // Conducks.6: Deterministic Symbol Resolution (The Great Binding)
    if (context && context.isResolutionMode()) {
      // Strip this. prefix — class self-calls resolve via same-file IntraLinker lookup
      const startsWithThis = target.toLowerCase().startsWith('this.');
      const afterThis = startsWithThis ? target.toLowerCase().slice(5) : target.toLowerCase();
      // If still dotted after stripping this. (e.g. this.field.method), extract the final
      // property so IntraLinker can resolve it across imported files. Non-this member
      // expressions (Math.random, service.foo) keep their full dotted form — safer.
      const lowTarget = (startsWithThis && afterThis.includes('.'))
        ? afterThis.split('.').pop()!
        : afterThis;

      // 1. Resolve Local Bindings (Imports/Aliases)
      const resolvedPath = context.resolveLocalBinding(lowTarget);
      if (resolvedPath) {
        targetId = `${resolvedPath}::${lowTarget}`;
      }
      // 2. Resolve Global Atmosphere (Built-ins like 'process', 'os')
      else if (isBuiltIn(target, langId)) {
        targetId = getGlobalId(target);
      }
      // 3. Fallback to Local/Naked Symbol (Will be qualified in graph ingestion)
      else {
        targetId = lowTarget;
      }
    }

    spectrum.relationships.push({
      sourceName: (source || 'unit').toLowerCase(),
      targetName: targetId,
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
