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
        // A RENAMED binding is called by its local name and DEFINED under its original one, so the
        // id has to carry the original: `import { POST as stepAction }` then `stepAction(...)` is
        // `<route>::post`, never `<route>::stepaction` — an id no node has (ADR 0085). Only the
        // FIRST segment is a binding; a dotted target keeps the rest verbatim.
        const head = lowTarget.includes('.') ? lowTarget.slice(0, lowTarget.indexOf('.')) : lowTarget;
        const original = context.resolveBindingOriginal?.(head);
        const symbol = original ? `${original}${lowTarget.slice(head.length)}` : lowTarget;
        targetId = `${resolvedPath}::${symbol}`;
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
    // Optional chaining is punctuation on an otherwise ordinary path.
    const path = t.replace(/\?\./g, '.');
    // A call target must look like an IDENTIFIER PATH — `foo`, `foo.bar`, `this.baz`. Anything else
    // is an expression, and an expression is not a symbol any graph can hold.
    //
    // The previous version denied only parens, which let far worse through: the receiver text of a
    // method call on a LITERAL was captured verbatim, so the vault held nodes whose id was a
    // fifteen-line array literal complete with newlines and comments — `['analyze','clean'].includes`,
    // `[...board.decisions].sort`, and 1,480 more. Induction then materialised every one as a
    // "library symbol", because induction cannot tell an external reference from a thing that was
    // never a reference at all (ADR 0053).
    //
    // An allowlist of shape is correct here where a denylist of characters was not: there is one
    // form a symbol reference takes, and unbounded forms it does not.
    //
    // The form is polyglot, which a first version got wrong by writing it for TypeScript alone and
    // breaking two real cases the suite caught: C# `System.Nullable<int>` carries generic arguments,
    // and Rust `std::fmt::Result` uses `::` where TS uses `.`. Both are genuine symbol paths. So
    // generics are stripped and both separators are accepted — while brackets, quotes, whitespace
    // and newlines stay rejected, which is what actually distinguishes a name from an expression.
    const withoutGenerics = path.replace(/<[^<>]*>/g, '');
    return /^[A-Za-z_$][A-Za-z0-9_$]*([.:]{1,2}[A-Za-z_$][A-Za-z0-9_$]*)*$/.test(withoutGenerics);
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
