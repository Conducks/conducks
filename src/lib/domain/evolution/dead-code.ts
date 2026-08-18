import { ConducksAdjacencyList, NodeId, ConducksNode, ConducksEdge } from "@/lib/core/graph/index.js";
// The union used to be spelled out here AND retyped in `conducks_prune`'s summary and enum, which is
// how two of the five went missing from both (todo53). One list, in contracts.
import type { DeadCodeType } from "@/contracts/index.js";
import { hasRegisteringDecorator } from "@/contracts/index.js";

export interface Finding {
  /**
   * `UNIMPORTED_MODULE` is a QUESTION, not a verdict, and it exists because the other four are
   * verdicts (oracle T28, ADR 0104).
   *
   * `memory.md` records the rule: "an unreferenced module is a question, not a finding" — because
   * *disconnected by accident* and *deliberately not wired yet* are the same zero-incoming-edges
   * shape to a graph, and deleting the second destroys a capability nobody decided to drop. A
   * symbol inside a file NOTHING imports cannot be judged from the graph at all: the file may be an
   * entry point, a script, a route loaded by convention, or genuinely dead.
   *
   * The distinction is the FILE, not the symbol. A symbol unused inside a file that IS imported is
   * a real finding — the module is reachable and the symbol still is not.
   */
  type: DeadCodeType;
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
export class DeadCodeAnalyzer {

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

    // See `isModuleScoped`: a declaration written inside an expression is that expression's business.
    const isNested = (n: any): boolean => (n?.properties as any)?.dna?.nestedInExpression === true;

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
      // An AUGMENTATION edge to an unresolved module is not a dangling reference to protect. It is
      // read below by `augmentedByFile`, which is keyed by FILE — and this set is keyed by NAME
      // ALONE, so letting it in here would spare every symbol sharing that name anywhere in the
      // project. That is precisely the laundering the file-keying exists to prevent (todo30).
      if ((edge as any).properties?.isAugmentation) continue;
      const bare = edge.targetId.includes('::') ? edge.targetId.split('::').pop()! : edge.targetId;
      if (!bare) continue;
      danglingRefNames.add(bare.toLowerCase());
      // Method calls dangle as `receiver.method` (e.g. `reflector.reflect`, `registry.evolution.audit`)
      // — whatever the intra-linker could not bind to a concrete node. The USED symbol is the method
      // segment, so protect that name too, or every interface/abstract/dynamically-dispatched method
      // reads as a false orphan. (Errs toward under-reporting — the safe direction for a prune tool.)
      if (bare.includes('.')) danglingRefNames.add(bare.split('.').pop()!.toLowerCase());
    }

    // Object-literal WIRING is reachable even when nothing points at its node.
    //
    // A container records which identifier each property path aliases, and a call through the chain
    // resolves straight to the destination — `container.infrastructure.db.query` lands on
    // `BaseDatabase.query`, skipping the `db` getter entirely. The getter IS reached; it simply has
    // no incoming edge, and reporting it dead is a claim about the resolver rather than the code.
    //
    // Keyed by FILE, so a same-named property elsewhere cannot launder an unrelated symbol (todo30).
    // An AUGMENTING interface is not a declaration. `declare module 'X' { interface Y { ... } }`
    // extends a `Y` that lives in X, and the parser mints a `Y` node in the AUGMENTING file too —
    // which nothing references, because nothing should. Read from the augmentation edges rather than
    // a new column: the edge already carries `isAugmentation` and already persists (todo33).
    const augmentedByFile = new Map<string, Set<string>>();
    for (const e of graph.getAllEdges()) {
      const props = (e as any).properties;
      if (!props?.isAugmentation) continue;
      const file = String(e.sourceId).slice(0, String(e.sourceId).lastIndexOf('::')).toLowerCase();
      const name = String(e.targetId).slice(String(e.targetId).lastIndexOf('::') + 2).toLowerCase();
      const names = augmentedByFile.get(file) ?? new Set<string>();
      names.add(name);
      augmentedByFile.set(file, names);
    }

    const wiringByFile = new Map<string, Set<string>>();
    for (const n of nodes as ConducksNode[]) {
      const paths = (n.properties as any)?.objectPaths as Record<string, string> | undefined;
      if (!paths) continue;
      const f = String(n.properties.filePath || '').toLowerCase();
      const names = wiringByFile.get(f) ?? new Set<string>();
      for (const path of Object.keys(paths)) for (const seg of path.split('.')) names.add(seg);
      wiringByFile.set(f, names);
    }

    // Files that ANOTHER file imports. A unit node with an incoming IMPORTS edge from a different
    // file is reachable; one with none cannot be judged from the graph, because "never wired yet"
    // and "disconnected by accident" are the same shape (memory.md, ADR 0104).
    //
    // Keyed on the unit node rather than on symbol edges: a module is reached by being IMPORTED,
    // and a symbol inside it may legitimately have no caller while the module is loaded for its
    // side effects.
    const importedFiles = new Set<string>();
    for (const n of nodes as ConducksNode[]) {
      if (String(n.properties.canonicalKind ?? '') !== 'UNIT') continue;
      const self = String(n.properties.filePath || '').toLowerCase();
      const imported = graph.getNeighbors(n.id, 'upstream').some((e: any) => {
        if (e.type !== 'IMPORTS') return false;
        const source = graph.getNode(e.sourceId);
        return !!source && String(source.properties.filePath || '').toLowerCase() !== self;
      });
      if (imported) importedFiles.add(self);
    }

    /**
     * Files holding at least one reference relationship among their own symbols — anything that
     * CALLS, CONSTRUCTS, ACCESSES or type-references anything.
     *
     * "Nothing imports this file" alone is too blunt to separate the two cases the fixture holds:
     * `unused.ts` is one exported leaf that calls nothing and is called by nothing, and `prune`
     * should say it is dead; `orphan-module.ts` is a real module whose `orphanSecond` calls its
     * `orphanHelper`, and there the graph genuinely cannot tell "never wired up" from "disconnected".
     * Treating both as questions swallowed the first; treating both as findings was the original
     * defect (oracle T16 vs T28, ADR 0104).
     *
     * An INERT file — no symbol in it participating in any reference, in or out — cannot be a
     * capability awaiting wiring, because nothing inside it is wired either. That is the line, and
     * it holds without reference to the fixture.
     */
    const wiredFiles = new Set<string>();
    for (const e of allEdges as ConducksEdge[]) {
      if (!DeadCodeAnalyzer.REFERENCE_EDGES.has(e.type)) continue;
      for (const endpoint of [e.sourceId, e.targetId]) {
        const n = graph.getNode(endpoint);
        const f = String(n?.properties?.filePath || '').toLowerCase();
        if (f) wiredFiles.add(f);
      }
    }
    /** A symbol the graph cannot judge: its file is unreachable AND the file does something. */
    const isOpenQuestion = (filePath: unknown): boolean => {
      const f = String(filePath).toLowerCase();
      return !importedFiles.has(f) && wiredFiles.has(f);
    };

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
      // A DEPENDENCY IS NOT DEAD CODE. Virtual induction mints a node for every external module and
      // symbol it sees, and those carry an `external://` path. They were being reported as orphans
      // because nothing in the repo DEFINES them — which is true of every dependency and says
      // nothing: `node:path` was reported dead while being referenced 159 times (ADR 0092).
      //
      // Measured before the fix: 20 of 41 orphan findings on conducks, and 31 on subject-b, were
      // stdlib or package nodes. An unused dependency is a real and different question, and belongs
      // to `supply-chain`, which knows about manifests.
      const isExternal = String(node.properties.filePath || '').startsWith('external://');
      const nodeFile = String(node.properties.filePath || '').toLowerCase();
      const nodeName = String(node.properties.name || '').toLowerCase();
      const isWiring = wiringByFile.get(nodeFile)?.has(nodeName) === true;
      const isAugmenting = augmentedByFile.get(nodeFile)?.has(nodeName) === true;
      // A ROUTE IS SERVED, NOT CALLED, and a REQUEST is issued to something outside this graph.
      // Both are SYNTHESISED nodes standing for an endpoint, so "nothing references it" is their
      // normal state and says nothing about whether the code behind them runs. Reporting them as
      // dead is the same category error as reporting a dependency (ADR 0092).
      const nodeId = String(node.id || '');
      const isEndpoint = nodeId.includes('route::') || nodeId.includes('request::')
        || node.properties.isRoute === true || node.properties.isRequest === true;
      const isSynthetic = isExternal || isEndpoint || isWiring || isAugmenting;
      const isArchitectural = ['STRUCTURE', 'BEHAVIOR', 'INFRA'].includes(node.label) && !isSynthetic;
      const isUntrackableType = DeadCodeAnalyzer.TYPE_KINDS.has((node.properties.kind || '').toLowerCase()) && !graphTracksTypes;
      const referencedByDanglingEdge = danglingRefNames.has(node.properties.name.toLowerCase());

      // A DECORATOR IS A REFERENCE. `@deco def f()` is `f = deco(f)`: the symbol is handed to
      // something, and that something is usually a registry that will call it later by key — which
      // is precisely the shape a graph cannot follow.
      //
      // MEASURED on the scraper subject: seven `@_register_validator("...")` functions in
      // `core/validation/validators.py` reported `[ORPHAN] defined but never referenced`, dispatched
      // in reality through `_SHAPE_VALIDATORS.get(name, _SHAPE_VALIDATORS["non_empty_string"])`.
      // A delete verdict on live code, in the category the reader is told is a verdict.
      //
      // Only REGISTERING decorators count (see contracts/decorators.ts) — `@dataclass` and
      // `@staticmethod` hand the symbol to nobody, which is why `Tab` and `StepMetadata` stay
      // reportable. Unknown decorators count as registering, because a project's own is exactly the
      // one no list can enumerate.
      const decorators = ((node.properties as any)?.dna?.decorators ?? []) as string[];
      const isRegistered = hasRegisteringDecorator(decorators);
      if (isArchitectural && !isUntrackableType && !referencedByDanglingEdge && !isRegistered && this.isModuleScoped(node, graph, isNested) && incomingRefs.length === 0 && !this.isEntryPoint(node)) {
        // NOTHING IMPORTS THE FILE — so the graph cannot say whether this symbol is dead. Report the
        // question instead of a verdict (oracle T28, ADR 0104). `orphan-module.ts` in the fixture is
        // exactly this: two functions in a file no one imports, previously reported as a confident
        // `[ORPHAN]` alongside genuinely unreferenced symbols in reachable modules.
        findings.push(!isOpenQuestion(node.properties.filePath) ? {
          type: 'ORPHAN',
          symbol: node.properties.name,
          file: node.properties.filePath,
          message: `Symbol is defined but never referenced (no callers, constructors, or type references).`
        } : {
          type: 'UNIMPORTED_MODULE',
          symbol: node.properties.name,
          file: node.properties.filePath,
          message: `Nothing imports this file, so the graph cannot tell dead code from a capability that was never wired up. Answer "was this disconnected, or never connected?" before deleting.`
        });
        continue;
      }

      // 2. Unused Export — only real symbols, never containers (files,
      // directories, namespaces all carry isExport but are not "exports").
      // Untrackable type declarations are skipped for the same reason as above.
      const isSymbol = ['STRUCTURE', 'BEHAVIOR', 'ATOM', 'INFRA'].includes(node.label);
      if (isSymbol && !isSynthetic && !isUntrackableType && !referencedByDanglingEdge && !isRegistered && node.properties.isExport) {
        // Find if any incoming edges are 'IMPORTS' from OTHER files or 'CALLS' from other files
        const externallyUsed = incomingRefs.some((e: any) => {
          const source = graph.getNode(e.sourceId);
          return source && (source as any).properties.filePath !== (node as any).properties.filePath;
        });

        if (!externallyUsed && !this.isEntryPoint(node)) {
          // Same gate as the ORPHAN branch above. "Exported but never consumed" is a fact about a
          // reachable module; in a file nothing imports it is a restatement of the file's own
          // unreachability, and the reader cannot act on it either way. `orphanHelper` was landing
          // here — called by `orphanSecond` in the same unimported file — so one symbol of that
          // fixture read as a question and its sibling as a finding (ADR 0104).
          findings.push(!isOpenQuestion(node.properties.filePath) ? {
            type: 'UNUSED_EXPORT',
            symbol: node.properties.name,
            file: node.properties.filePath,
            message: `Symbol is exported but never consumed by other modules.`
          } : {
            type: 'UNIMPORTED_MODULE',
            symbol: node.properties.name,
            file: node.properties.filePath,
            message: `Nothing imports this file, so the graph cannot tell dead code from a capability that was never wired up. Answer "was this disconnected, or never connected?" before deleting.`
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
  // `variable` is ABSENT on purpose (todo63). It is the only kind here whose use can be completely
  // invisible to the graph: a plain value read — `return usedValue`, `= CONFIG`, `for (const x of
  // TABLE)` — produces no relationship at all, so "no evidence of use" is not evidence of no use.
  // MEASURED: `import { usedValue, usedFn }` where only `usedFn` is called reported `usedValue` as a
  // STALE_IMPORT — a verdict telling the user to delete an import their code needs. The import-site
  // calibration below exists for exactly this blind spot but is keyed per (file, specifier), so ANY
  // used sibling from the same module lifts it; splitting the import into two statements does not
  // help, because they merge into one record.
  //
  // A const arrow function is `function`, not `variable` (measured), so callable exports keep their
  // coverage. What this costs is the genuinely-stale value import, which is no longer reported at
  // all — accepted deliberately, per this analyzer's own rule: a missed dead import is acceptable
  // and a wrong one is not. Restoring that recall means making a bare identifier read produce an
  // edge, which is a parser change across every language and is NOT what this set is for.
  private static readonly PRUNABLE_BINDING_KINDS = new Set<string>([
    'function', 'class', 'struct', 'method',
    'interface', 'enum', 'field', 'property',
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
      // MEASURED 2026-08-15, once the oracles existed to measure it. Removing this line:
      //
      //   TypeScript : findings 1 -> 20, MISSED 30 -> 11, EXTRA still 0    (19 TRUE findings gained)
      //   Python     : findings 7 -> 87, MISSED 4 -> 1,   EXTRA 0 -> 77    (77 FALSE findings gained)
      //
      // So the guard costs real recall on the language whose extractor is strong, and prevents a
      // collapse on the language whose extractor is not. Its premise — "absence of evidence is not
      // evidence of absence when the extractor may not cover this shape" — is still TRUE, just no
      // longer true everywhere.
      //
      // KEPT, and deliberately NOT made language-conditional. A flag saying "TypeScript's extractor
      // is good enough now" would be a constant asserting something that was false last week and is
      // only true today because thirteen use-positions were closed. `npm run oracle` is where that
      // claim belongs, because there it is re-measured rather than remembered.
      // Import-site calibration, kept at STATEMENT scope after measuring the alternative.
      //
      // Widening it to FILE scope — "this file demonstrably uses some other import, so the extractor
      // understands it" — closed the Python recall gap (MISSED 4 -> 1) with the parser oracle clean,
      // and then produced TWO FALSE FINDINGS on the TypeScript subjects, which the oracle could not
      // see because neither shape occurs in this repository:
      //
      //   sofie  `ExecutionReport`  — imported as a type and used only in a type annotation
      //                               (`toReport?: (result: R) => ExecutionReport`).
      //   orch.  `trackAction`      — imported ALIASED (`trackAction as coreTrackAction`); the local
      //                               name is used three times, and the check reads the original.
      //
      // Both are extractor coverage gaps, which is exactly what this guard exists to tolerate. The
      // recall gap stays until those two positions are captured; a missed dead import is acceptable
      // and a wrong one is not.
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
  private isModuleScoped(node: any, graph: ConducksAdjacencyList, nested?: (n: any) => boolean): boolean {
    const parentId = node.properties.parentId;
    if (!parentId) return true;
    const parent = graph.getNode(parentId);
    if (!parent) return true;
    if (!['UNIT', 'NAMESPACE', 'REPOSITORY', 'ECOSYSTEM'].includes((parent as any).label)) return false;

    // A SYMBOL WRITTEN INSIDE ANOTHER DECLARATION IS NOT MODULE-SCOPED, whatever its parentId says.
    //
    // `export const adminAuthOptions = { providers: [ CredentialsProvider({ async authorize(...) {...} }) ] }`
    // — the parser builds its scope map from function/class/method captures only, so an object
    // literal is not a scope and the method inside it is parented to the FILE. It then reads as a
    // module-scoped symbol nothing references, and `prune` issued `[ORPHAN] never referenced` about
    // NextAuth's sign-in callback on the orchestrator subject (twice: `admin/src/lib/auth/nextauth-admin.ts:36`
    // and `packages/core/auth/server/modules/nextauth.ts:47`). Deleting it removes admin login.
    //
    // Reachability of such a member is the CONTAINER's question, not its own, and the container is
    // judged on its own row. The parser records the nesting (`dna.nestedInExpression`) because a
    // variable's recorded RANGE is its identifier — `adminAuthOptions` spans line 1 of a 13-line
    // literal — so containment is not visible from the graph's line numbers at all. Re-parenting
    // instead would change the node's id, which every resolved edge and every stored pulse spells.
    return !nested?.(node);
  }

  // Test fixtures, specs, and mocks are not product code — their symbols are never "dead".
  private static isTestPath(filePath: string): boolean {
    const fp = filePath.toLowerCase();
    return /(^|\/)(tests?|__tests__|__mocks__|spec|fixtures?|polyglot-verify)(\/|$)/.test(fp)
      || /\.(test|spec)\.[cm]?[jt]sx?$/.test(fp);
  }

  private isEntryPoint(node: any): boolean {
    // The name IS the convention, so it must match the whole name. This was a SUBSTRING test, and a
    // substring test on these five words exempts a large, arbitrary slice of ordinary code from both
    // verdicts: "Approval" contains app, "Domain" contains main, "Wrapper" contains app, "NameIndex"
    // contains index. MEASURED across the three subjects — 53 of sofie's 887 exported names, 21 of
    // orchestrator's 656, 5 of this repository's 445 — and tightening it to equality turned 18 of
    // them into findings the language service agrees with, with EXTRA still 0 on all three.
    //
    // No oracle could have found this. A suppression makes the tool SILENT, and silence never
    // contradicts a compiler; it only shows up in MISSED, mixed in with every other reason.
    const entryNames = ['main', 'index', 'app', 'handler', 'setup'];
    const name = node.properties.name.toLowerCase();
    if (entryNames.includes(name)) return true;

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
