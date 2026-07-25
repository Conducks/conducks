import { ConducksAdjacencyList, NodeId, ConducksNode, ConducksEdge } from '@/lib/core/graph/adjacency-list.js';
import { ConducksComponent } from "@/contracts/types.js";

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
   * Edge types that represent actual *usage* of a symbol.
   * Containment edges (MEMBER_OF, CONTAINS, HAS_METHOD, HAS_PROPERTY) are
   * hierarchy, not usage — counting them as references hides truly-dead
   * symbols whose own children point back at them.
   */
  private static readonly REFERENCE_EDGES = new Set<string>([
    'CALLS', 'ACCESSES', 'CONSTRUCTS', 'EXTENDS', 'IMPLEMENTS',
    'IMPORTS', 'TYPE_REFERENCE', 'DEPENDS_ON', 'VIRTUAL_LINK',
  ]);

  /**
   * Scans the entire graph for structural dead weight.
   */
  // Type-only declarations whose usage is expressed through type annotations.
  private static readonly TYPE_KINDS = new Set<string>([
    'interface', 'type', 'typealias', 'enum', 'struct',
  ]);

  // Container nodes (files, dirs, modules) are sometimes mis-classified as
  // STRUCTURE and carry isExport — they are never real symbols, so they must
  // never be reported as orphan or unused-export.
  private static readonly CONTAINER_KINDS = new Set<string>([
    'file', 'directory', 'folder', 'module', 'package', 'namespace',
  ]);

  public analyze(graph: ConducksAdjacencyList): Finding[] {
    const findings: Finding[] = [];
    const nodes = Array.from(graph.getAllNodes());

    const allEdges = graph.getAllEdges();

    // Self-calibrate: only reason about type-declaration deadness if the
    // language plugin actually emitted type-reference edges. TS/TSX (and
    // others) currently emit none, so every type would look orphaned —
    // skip them entirely rather than flood the report with false positives.
    const graphTracksTypes = allEdges.some(e => e.type === 'TYPE_REFERENCE');

    // Cross-file usage is often recorded as a DANGLING reference edge whose
    // target is the bare symbol name (e.g. `ensureCollection`) or a wrong
    // extension (`mod.js::ensureCollection`) that never bound to the real
    // node id. Such edges leave genuinely-used symbols looking orphaned.
    // Collect the bare names that any dangling reference edge points at, so a
    // symbol referenced this way is not reported as dead. (Errs toward
    // under-reporting — the safe direction for a prune tool.)
    const danglingRefNames = new Set<string>();
    for (const edge of allEdges) {
      if (!DeadCodeAnalyzer.REFERENCE_EDGES.has(edge.type)) continue;
      if (graph.getNode(edge.targetId)) continue; // resolved to a real node
      const bare = edge.targetId.includes('::') ? edge.targetId.split('::').pop()! : edge.targetId;
      if (!bare) continue;
      danglingRefNames.add(bare.toLowerCase());
      // Method calls dangle as `receiver.method` (e.g. `reflector.reflect`, `registry.evolution.audit`)
      // — whatever the intra-linker could not bind to a concrete node. The USED symbol is the method
      // segment, so protect that name too, or every interface/abstract/dynamically-dispatched method
      // reads as a false orphan. (Errs toward under-reporting — the safe direction for a prune tool.)
      if (bare.includes('.')) danglingRefNames.add(bare.split('.').pop()!.toLowerCase());
    }

    for (const node of nodes as ConducksNode[]) {
      // Skip virtual/taxonomy nodes that have no file path
      if (!node.properties.filePath || !node.properties.name) continue;
      // Skip container nodes (files/dirs/modules) even if mis-kinded as STRUCTURE.
      if (DeadCodeAnalyzer.CONTAINER_KINDS.has((node.properties.kind || '').toLowerCase())) continue;
      // Skip test/fixture code: its symbols are inputs and test scaffolding, not product code —
      // their "deadness" is meaningless (a fixture function is never called by the app by design).
      if (DeadCodeAnalyzer.isTestPath(node.properties.filePath)) continue;

      // Count only reference (usage) edges, not structural containment.
      const incomingRefs = graph.getNeighbors(node.id, 'upstream')
        .filter((e: any) => DeadCodeAnalyzer.REFERENCE_EDGES.has(e.type));

      // 1. Orphaned Symbol (No callers/importers).
      // Restricted to MODULE-SCOPED architectural symbols (top-level
      // functions, classes, interfaces). The graph cannot reliably track
      // usage of local variables, parameters, class fields, or
      // dynamically-dispatched methods — flagging them produces
      // overwhelming false positives, so they are excluded here.
      const isArchitectural = ['STRUCTURE', 'BEHAVIOR', 'INFRA'].includes(node.label);
      const isUntrackableType = DeadCodeAnalyzer.TYPE_KINDS.has((node.properties.kind || '').toLowerCase()) && !graphTracksTypes;
      const referencedByDanglingEdge = danglingRefNames.has(node.properties.name.toLowerCase());
      if (isArchitectural && !isUntrackableType && !referencedByDanglingEdge && this.isModuleScoped(node, graph) && incomingRefs.length === 0 && !this.isEntryPoint(node)) {
        findings.push({
          type: 'ORPHAN',
          symbol: node.properties.name,
          file: node.properties.filePath,
          message: `Symbol is defined but never referenced (no callers, constructors, or type references).`
        });
        continue;
      }

      // 2. Unused Export — only real symbols, never containers (files,
      // directories, namespaces all carry isExport but are not "exports").
      // Untrackable type declarations are skipped for the same reason as above.
      const isSymbol = ['STRUCTURE', 'BEHAVIOR', 'ATOM', 'INFRA'].includes(node.label);
      if (isSymbol && !isUntrackableType && !referencedByDanglingEdge && node.properties.isExport) {
        // Find if any incoming edges are 'IMPORTS' from OTHER files or 'CALLS' from other files
        const externallyUsed = incomingRefs.some((e: any) => {
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

    }

    findings.push(...this.findStaleImports(graph, allEdges));

    return findings;
  }

  /**
   * Edge types that count as EVIDENCE OF USE for an imported binding.
   * All of them must be affirmatively absent before a binding is called stale.
   */
  private static readonly USAGE_EVIDENCE_EDGES = new Set<string>([
    'CALLS', 'CONSTRUCTS', 'ACCESSES',   // value positions
    'TYPE_REFERENCE',                    // type annotations / type arguments
    'EXTENDS', 'IMPLEMENTS',             // heritage clauses (`implements ConducksCommand`)
    'DEPENDS_ON', 'VIRTUAL_LINK',        // boundary + inferred references
  ]);

  /**
   * Declaration kinds a stale-import claim is allowed to be made about.
   *
   * Deliberately VALUE-only (a class is kinded `struct` here). Type declarations are excluded
   * because the type-position captures are incomplete: `(type_annotation (type_identifier))`,
   * `(type_annotation (generic_type name:))` and `(type_arguments (type_identifier))` are captured,
   * but `Foo[]` (array_type), `x as Foo[]` (as_expression) and `n is Foo` (type_predicate) are NOT —
   * so an interface used only in those positions leaves no TYPE_REFERENCE edge and would read as
   * unused. Measured on conducks itself: allowing type targets turned 22 true positives into 22
   * true + 11 false. Widened 2026-07-25: the type-position captures now exist (array_type,
   * as_expression, type_predicate, union_type — todo14, canary-tested in
   * tests/unit/core/type-position-targets.test.ts), and the re-validation against
   * `tsc --noUnusedLocals` was re-run on a fresh pulse before shipping the wider set.
   */
  private static readonly PRUNABLE_BINDING_KINDS = new Set<string>([
    'function', 'class', 'struct', 'method',
    'interface', 'enum', 'variable', 'field', 'property',
  ]);

  /**
   * Conducks — Stale import detection. ✂️
   *
   * A binding is stale ONLY when every class of evidence is affirmatively absent: no value use
   * (CALLS / CONSTRUCTS / ACCESSES), no type use (TYPE_REFERENCE, or the reflector's `isTypeOnly`
   * verdict), no heritage clause naming it (EXTENDS / IMPLEMENTS), and no use as a bare value
   * inside a recorded call's argument list. Anything ambiguous is NOT stale — prune must err
   * toward under-reporting, so a missed dead import is acceptable and a wrong one is not.
   *
   * NEVER reported, by construction rather than by a filter:
   *   - `import * as x from "..."`  — a namespace import binds no specifier, so the reflector emits
   *     no per-binding IMPORTS edge for it. Its members are reached as `x.member`, which the graph
   *     records against the member, not the namespace: absence of evidence is guaranteed and would
   *     be a false positive every time.
   *   - `import "./x"`             — a side-effect import has no binding at all; being "unused" is
   *     the entire point of writing it.
   *   - default imports, and any import whose specifier did not resolve to a project file
   *     (dependencies, stdlib) — the orchestrator only emits a per-binding edge for a resolved
   *     in-project named import (orchestrator.ts:412), so these never become candidates.
   */
  private findStaleImports(graph: ConducksAdjacencyList, allEdges: ConducksEdge[]): Finding[] {
    const fileOfNode = (nodeId: NodeId): string => {
      const node = graph.getNode(nodeId) as ConducksNode | undefined;
      const fromNode = node?.properties?.filePath;
      if (fromNode) return fromNode.toLowerCase();
      // Unit ids are `<file>::unit`; fall back to the id prefix when the node is not loaded.
      return nodeId.includes('::') ? nodeId.split('::')[0] : '';
    };

    // Identifier tokens, lowercased — node ids and binding names are already folded to lower case.
    const tokensOf = (value: unknown): string[] =>
      String(value ?? '').toLowerCase().match(/[a-z_$][a-z0-9_$]*/g) || [];

    // A resolved target is `<file>::<symbol>`; a dangling one is the raw expression text.
    const targetTail = (targetId: string): string => targetId.includes('::') ? targetId.split('::').pop()! : targetId;

    // Every name the file was seen USING, from all evidence classes at once.
    const usedNamesByFile = new Map<string, Set<string>>();
    const recordUse = (file: string, name: string): void => {
      if (!file || !name) return;
      let names = usedNamesByFile.get(file);
      if (!names) usedNamesByFile.set(file, names = new Set<string>());
      names.add(name);
    };

    for (const edge of allEdges) {
      if (!DeadCodeAnalyzer.USAGE_EVIDENCE_EDGES.has(edge.type)) continue;
      const file = fileOfNode(edge.sourceId);
      const props: any = edge.properties || {};
      // `original` carries the pre-lowercase spelling; the target tail carries the resolved symbol
      // or the raw member expression (`graphtraversal.traverseupstream`), so both receiver and
      // member count as evidence.
      for (const token of tokensOf(props.original)) recordUse(file, token);
      for (const token of tokensOf(targetTail(edge.targetId))) recordUse(file, token);
      // Identifier-as-value wiring: `register(HANDLERS)` passes the binding without calling it.
      if (Array.isArray(props.arguments)) {
        for (const argument of props.arguments) for (const token of tokensOf(argument)) recordUse(file, token);
      }
    }

    // Candidates, grouped per import statement (file + specifier).
    interface Candidate { binding: string; targetId: string; isTypeOnly: boolean }
    const statements = new Map<string, { file: string; specifier: string; candidates: Candidate[] }>();

    for (const edge of allEdges) {
      if (edge.type !== 'IMPORTS') continue;
      const props: any = edge.properties || {};
      // Only the per-binding edge carries `bindingName`; the file-level edge never does.
      if (!props.bindingName) continue;
      const file = fileOfNode(edge.sourceId);
      if (!file || DeadCodeAnalyzer.isTestPath(file)) continue;
      const key = `${file}::${props.specifier}`;
      let statement = statements.get(key);
      if (!statement) statements.set(key, statement = { file, specifier: String(props.specifier), candidates: [] });
      statement.candidates.push({
        binding: String(props.bindingName).toLowerCase(),
        targetId: edge.targetId,
        isTypeOnly: props.isTypeOnly === true,
      });
    }

    const findings: Finding[] = [];
    const reported = new Set<string>();

    for (const statement of statements.values()) {
      const usedNames = usedNamesByFile.get(statement.file) || new Set<string>();
      const isUsed = (c: Candidate) => c.isTypeOnly || usedNames.has(c.binding);

      // Import-site calibration: if NOTHING this statement brings in was ever seen being used, the
      // extractor may simply not cover how this file uses it (an aliased specifier is recorded
      // under the ORIGINAL name, a bare `= CONFIG` initializer and a `for (const x of TABLE)`
      // produce no relationship at all). Absence of evidence is then not evidence of absence, so
      // the whole statement is left alone. This costs recall on single-binding imports and is the
      // price of never being wrong.
      if (!statement.candidates.some(isUsed)) continue;

      for (const candidate of statement.candidates) {
        if (isUsed(candidate)) continue;
        // Only claim staleness about a declaration the graph can fully see used (see
        // PRUNABLE_BINDING_KINDS). An unresolved target proves nothing either way.
        const target = graph.getNode(candidate.targetId) as ConducksNode | undefined;
        const kind = (target?.properties?.kind || '').toLowerCase();
        if (!kind || !DeadCodeAnalyzer.PRUNABLE_BINDING_KINDS.has(kind)) continue;

        const key = `${statement.file}::${candidate.binding}`;
        if (reported.has(key)) continue;
        reported.add(key);
        findings.push({
          type: 'STALE_IMPORT',
          symbol: target!.properties.name,
          file: statement.file,
          message: `Imported from '${statement.specifier}' but never used in this file (no call, construction, access, type reference, or heritage clause).`,
        });
      }
    }

    return findings;
  }

  /**
   * A symbol is module-scoped if it is declared directly inside a file,
   * namespace, or repository — not nested inside a function body or class.
   * Nested symbols (locals, methods) cannot be reliably proven dead from
   * the static graph, so orphan detection ignores them.
   */
  private isModuleScoped(node: any, graph: ConducksAdjacencyList): boolean {
    const parentId = node.properties.parentId;
    if (!parentId) return true;
    const parent = graph.getNode(parentId);
    if (!parent) return true;
    return ['UNIT', 'NAMESPACE', 'REPOSITORY', 'ECOSYSTEM'].includes((parent as any).label);
  }

  // Test fixtures, specs, and mocks are not product code — their symbols are never "dead".
  private static isTestPath(filePath: string): boolean {
    const fp = filePath.toLowerCase();
    return /(^|\/)(tests?|__tests__|__mocks__|spec|fixtures?|polyglot-verify)(\/|$)/.test(fp)
      || /\.(test|spec)\.[cm]?[jt]sx?$/.test(fp);
  }

  private isEntryPoint(node: any): boolean {
    const entryNames = ['main', 'index', 'app', 'handler', 'setup'];
    const name = node.properties.name.toLowerCase();
    if (entryNames.some(e => name.includes(e))) return true;

    // Framework convention (Next.js / app-router, etc.): symbols in these
    // special files are invoked by the framework via file-based routing, not
    // imported — so they are entry points, never dead code.
    const fp = (node.properties.filePath || '').toLowerCase();
    const base = (fp.split('/').pop() || '').replace(/\.(t|j)sx?$/, '');
    return DeadCodeAnalyzer.FRAMEWORK_ENTRY_BASENAMES.has(base);
  }

  private static readonly FRAMEWORK_ENTRY_BASENAMES = new Set<string>([
    'page', 'layout', 'route', 'template', 'loading', 'error', 'not-found',
    'global-error', 'default', 'middleware', 'instrumentation', 'sitemap',
    'robots', 'manifest', 'opengraph-image', 'twitter-image', 'icon',
    'apple-icon', 'favicon', 'next.config',
  ]);
}
