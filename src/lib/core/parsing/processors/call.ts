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
    // A call whose RECEIVER is a literal or an expression is not a reference to any symbol, and the
    // edge it produced could never resolve. Two shapes accounted for 169 dangling edges here:
    // a regex literal (`/\/architecture\//.test`, 77 of them) and a chained call
    // (`id.split('::').pop`, `path.join(x, y).toLowerCase`, 92). The meaningful edge in the second
    // case is the INNER call, which is captured separately — dropping the outer chain loses no
    // reference, it removes a target that was never a symbol.
    if (!CallProcessor.isSymbolReference(target)) return;

    let targetId = target.toLowerCase();
    const langId = spectrum.metadata.language || 'typescript';
    // Starts true so the discovery pass (not resolution mode) is unchanged — those targets are
    // qualified later during ingestion and by IntraLinker, and marking them low here would
    // downgrade edges that do get resolved. Only the explicit give-up branch below sets it false.
    let resolved = true;

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
      let resolvedPath = context.resolveLocalBinding(lowTarget);
      // Class-qualified static call (GraphTraversal.traverseUpstream): the full dotted form is
      // never a binding, but the OBJECT segment is — and the method node id is exactly
      // `path::classname.method`, so resolving the object resolves the call.
      if (!resolvedPath && !startsWithThis && lowTarget.includes('.')) {
        resolvedPath = context.resolveLocalBinding(lowTarget.split('.')[0]);
      }
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
        resolved = false;
      }
    }

    spectrum.relationships.push({
      sourceName: (source || 'unit').toLowerCase(),
      targetName: targetId,
      type: type,
      // A guess must not be recorded at the same confidence as a fact. Both branches above used to
      // stamp 0.85, so an edge whose target was resolved to a real file and an edge that fell
      // through to a bare name were indistinguishable in the vault — which is why
      // `WHERE confidence < 0.6` returned zero rows on a graph where half the edges dangle. The
      // column now says how far to trust the edge, not merely which rule emitted it.
      confidence: resolved ? 0.85 : 0.4,
      metadata: { arguments: args, original: target, resolved }
    });
  }


  /**
   * Whether a captured call target names a symbol at all.
   *
   * Deliberately a denylist of shapes that CANNOT be a symbol rather than an allowlist of valid
   * identifiers: identifier rules differ across the twelve grammars, and a narrow allowlist would
   * silently drop legitimate targets in whichever language it did not anticipate.
   */
  public static isSymbolReference(target: string): boolean {
    const t = target.trim();
    if (!t) return false;
    // A call on the result of another call: the inner call is captured on its own.
    if (t.includes('(') || t.includes(')')) return false;
    // Literal receivers: regex, string, template. `/x/.test(...)` calls nothing declared anywhere.
    if (/^[/"'`]/.test(t)) return false;
    // A numeric receiver is the same case.
    if (/^\d/.test(t)) return false;
    return true;
  }

  /**
   * Identifies if a name-to-name call is a constructor call.
   * e.g. In Python `new User()` or Java `new User()` or Go `User{}`
   */
  public isConstructor(name: string, provider: any): boolean {
    // A dotted name is never a constructor — `new X.Y()` arrives via the new_expression pattern.
    // Without this, every capitalized static/namespace call (Math.random, JSON.parse,
    // GraphTraversal.traverseUpstream) was typed CONSTRUCTS instead of CALLS.
    if (name.includes('.')) return false;
    // Basic heuristic: Starts with uppercase (capitalized class)
    return /^[A-Z]/.test(name);
  }
}
