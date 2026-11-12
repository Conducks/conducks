import { ConducksAdjacencyList, NodeId, ConducksNode, ConducksEdge } from "@/lib/core/graph/index.js";
// The union used to be spelled out here AND retyped in `conducks_prune`'s summary and enum, which is
// how two of the five went missing from both (todo53). One list, in contracts.
import type { DeadCodeType } from "@/contracts/index.js";
import { hasRegisteringDecorator, isTestPath, moduleKeyOf } from "@/contracts/index.js";

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

    // Built once and shared: both the orphan/export branches below and `findStaleImports` ask the
    // same question — "did this file use this name?" — and a second copy would drift.
    const { usedNamesByFile, fileOfNode } = this.buildUsageIndex(graph, allEdges);

    // See `isModuleScoped`: a declaration written inside an expression is that expression's business.
    const isNested = (n: any): boolean => (n?.properties as any)?.dna?.nestedInExpression === true;

    // A TYPE WHOSE MEMBERS ARE USED IS USED. A call to a static member — `Strings.trimAll(...)`, a
    // Python classmethod, a TypeScript static — lands on the MEMBER, so the type had no incoming edge
    // and was reported ORPHAN while javac refused to build without it (Java oracle, 2026-11-12).
    // Recorded per enclosing type, and read by ORPHAN only ("never referenced") — see UNUSED_EXPORT below.
    const typeUse = new Map<string, { outside: boolean }>();
    const ancestors = (id: string): string[] => {
      const out: string[] = [];
      let cur = graph.getNode(id) as any;
      for (let hop = 0; cur && hop < 8; hop++) {
        const parent = String(cur.properties?.parentId ?? '');
        if (!parent) break;
        out.push(parent.toLowerCase());
        cur = graph.getNode(parent);
      }
      return out;
    };
    for (const e of allEdges) {
      if (!DeadCodeAnalyzer.REFERENCE_EDGES.has(e.type) || e.type === 'IMPORTS') continue;
      const target = graph.getNode(e.targetId) as any;
      if (!target) continue;
      const sourceUp = new Set([String(e.sourceId).toLowerCase(), ...ancestors(e.sourceId)]);
      for (const typeId of ancestors(e.targetId)) {
        const holder = graph.getNode(typeId) as any;
        if (!holder || !['STRUCTURE', 'INFRA'].includes(holder.label)) continue;
        if (sourceUp.has(typeId)) continue;           // used from inside the type itself
        typeUse.set(typeId, { outside: true });
      }
    }

    // Member names declared by Go INTERFACES and Swift PROTOCOLS, per language — see
    // `isImplicitConformance` below.
    const requirementNames = { go: new Set<string>(), swift: new Set<string>() };
    for (const n of nodes as ConducksNode[]) {
      const props = n.properties as any;
      const f = String(props?.filePath || '').toLowerCase();
      const lang = f.endsWith('.go') ? 'go' : f.endsWith('.swift') ? 'swift' : null;
      if (!lang || !props?.parentId) continue;
      const parent = graph.getNode(props.parentId) as any;
      if (String(parent?.properties?.kind || '').toLowerCase() === 'interface') requirementNames[lang].add(String(props.name));
    }

    // GO BUILD-CONSTRAINED TWINS. A package can declare one name in several files only when build
    // constraints keep them apart (`result_x86.go` / `result_others.go`, `ttyname_unix.go` /
    // `ttyname_windows.go`); a call binds to one, and the other is exactly as live on its platform.
    // MEASURED on fzf v0.56.3 against go/types: `compareRanks`, `TtyIn`, `TtyOut` reported dead, and
    // most of 26 verdicts on Windows/OpenBSD-only files. Keyed by package (directory) and name.
    const goNodesByKey = new Map<string, string[]>();
    for (const n of nodes as ConducksNode[]) {
      const f = String((n.properties as any)?.filePath || '').toLowerCase();
      if (!f.endsWith('.go') || !(n.properties as any)?.name) continue;
      const key = `${moduleKeyOf(f)}|${(n.properties as any).name}`;
      const list = goNodesByKey.get(key);
      if (list) list.push(n.id); else goNodesByKey.set(key, [n.id]);
    }
    const liveGoTwinKeys = new Set<string>();
    for (const [key, ids] of goNodesByKey) {
      if (ids.length < 2) continue;
      const referenced = ids.some(id => graph.getNeighbors(id, 'upstream')
        .some((e: any) => DeadCodeAnalyzer.REFERENCE_EDGES.has(e.type) && e.type !== 'IMPORTS' && !ids.includes(e.sourceId)));
      if (referenced) liveGoTwinKeys.add(key);
    }

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
    // A Go package or Swift target is reached as a WHOLE: the import names the module, and the
    // resolver answers with one of its files. Every other file of an imported module is imported too.
    const filesByModule = new Map<string, string[]>();
    for (const n of nodes as ConducksNode[]) {
      if (String(n.properties.canonicalKind ?? '') !== 'UNIT') continue;
      const f = String(n.properties.filePath || '').toLowerCase();
      const key = moduleKeyOf(f);
      if (!key) continue;
      const list = filesByModule.get(key);
      if (list) list.push(f); else filesByModule.set(key, [f]);
    }
    for (const files of filesByModule.values()) {
      if (files.some(f => importedFiles.has(f))) for (const f of files) importedFiles.add(f);
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

      // AN UNUSED IMPORT IS NOT A USE — and until this existed, it laundered the symbol behind it.
      //
      // ORPHAN requires zero incoming references, so one import edge silenced it. STALE_IMPORT
      // would have caught the import instead, except its import-site calibration skips a statement
      // where NOTHING is used — which is always true of a single-binding import. The symbol fell
      // between the two rules and was reported by neither.
      //
      // MEASURED on the scraper subject: adding one unused `from foundation.paths import
      // get_data_dir` took prune from 23 findings to 22 and made `get_data_dir` — an ORPHAN a moment
      // earlier — invisible to both checks. Adding dead code LOWERED the dead-code count, which is
      // the shape a real refactor leaves behind: the last caller goes, the import stays, and the
      // symbol stops being reported the day it actually died.
      //
      // Reported as a QUESTION, never a verdict. Saying "delete this" here would rest on
      // `usedNamesByFile`, and that index is measurably not strong enough to carry a delete verdict:
      // removing the calibration guard that depends on it produced 77 FALSE findings on Python.
      // The honest claim is the one this makes — every reference is an import nobody appears to use,
      // so look at the import site.
      const importOnlyRefs = incomingRefs.filter((e: any) => {
        if (e.type !== 'IMPORTS') return false;
        const binding = String(e.properties?.bindingName ?? '').toLowerCase();
        if (!binding) return false;
        // A BARREL IMPORTS IN ORDER TO REPUBLISH, so "it never uses the name" is its normal state
        // and says nothing about the symbol. Python states the republish in `__all__`, a list of
        // STRINGS the parser reads as no reference at all.
        //
        // MEASURED on scraper, and predicted by this todo's own L3 counter-case ("a name re-exported
        // from __init__.py must not be flagged"): without this line the rule produced 11 findings
        // and 8 of them were barrel re-exports — `get_logger`, `classify`, `classify_http`,
        // `RetryDecision`, `BaseQueue` and the three exception types, every one imported by an
        // `__init__.py` and listed in its `__all__`.
        //
        // A barrel that imports something and does NOT republish it is a genuinely stale import that
        // this now misses. Accepted, on this analyzer's standing rule: a missed dead import is
        // acceptable and a wrong one is not.
        if (DeadCodeAnalyzer.isReexportSurface(fileOfNode(e.sourceId))) return false;
        return !(usedNamesByFile.get(fileOfNode(e.sourceId))?.has(binding) === true);
      });
      const liveRefs = incomingRefs.filter((e: any) => !importOnlyRefs.includes(e));
      const memberUse = typeUse.get(String(node.id).toLowerCase());
      const onlyImported = liveRefs.length === 0 && importOnlyRefs.length > 0;
      const ONLY_IMPORTED_MESSAGE = `Every reference to this symbol is an import that the importing file never uses. Either the import is stale and the symbol is dead, or the use is one the parser does not see — read the import site before deleting.`;

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
      // A Rust TRAIT-IMPL method is reached through the trait (`x.to_string()` → `Display::fmt`), which
      // no edge names; rustc never reports one as unused. Same standing as a registered symbol.
      const isTraitImpl = (node.properties as any)?.dna?.inTraitImpl === true;
      // A METHOD REACHED THROUGH AN INTERFACE OR PROTOCOL. `s.Save()` / `s.save()` lands on the
      // interface's requirement and never on the implementation, because nothing in the graph links
      // the two without types. Go conforms implicitly; Swift declares it, but the call still names
      // the protocol.
      //   - Go, staticcheck's rule (U1000): an EXPORTED method may satisfy an interface anywhere,
      //     the standard library's included (`MarshalJSON`, `ServeHTTP`), so it is never judged; an
      //     unexported one is spared when an interface in the project declares its name.
      //   - Swift: a member is spared when a protocol in the project declares its name.
      // Both can only under-report. MEASURED on a Go and a Swift fixture: `Save`, `close`,
      // `MarshalJSON` and `save` were each reported dead while called through the interface.
      const memberFile = String(node.properties.filePath || '').toLowerCase();
      const memberName = String(node.properties.name);
      const isLiveGoTwin = memberFile.endsWith('.go') && liveGoTwinKeys.has(`${moduleKeyOf(memberFile)}|${memberName}`);
      const isImplicitConformance =
        (memberFile.endsWith('.go') && String(node.properties.kind || '').toLowerCase() === 'method'
          && (/^[A-Z]/.test(memberName) || requirementNames.go.has(memberName)))
        || (memberFile.endsWith('.swift') && requirementNames.swift.has(memberName)
          && String((graph.getNode(String(node.properties.parentId ?? '')) as any)?.properties?.kind ?? '').toLowerCase() !== 'interface');
      if (isArchitectural && !isUntrackableType && !referencedByDanglingEdge && !isRegistered && !isTraitImpl && !isImplicitConformance && !isLiveGoTwin && this.isModuleScoped(node, graph, isNested) && liveRefs.length === 0 && !memberUse?.outside && !this.isEntryPoint(node)) {
        // NOTHING IMPORTS THE FILE — so the graph cannot say whether this symbol is dead. Report the
        // question instead of a verdict (oracle T28, ADR 0104). `orphan-module.ts` in the fixture is
        // exactly this: two functions in a file no one imports, previously reported as a confident
        // `[ORPHAN]` alongside genuinely unreferenced symbols in reachable modules.
        findings.push(onlyImported ? {
          type: 'ONLY_IMPORTED',
          symbol: node.properties.name,
          file: node.properties.filePath,
          message: ONLY_IMPORTED_MESSAGE
        } : !isOpenQuestion(node.properties.filePath) ? {
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
      if (isSymbol && !isSynthetic && !isUntrackableType && !referencedByDanglingEdge && !isRegistered && !isTraitImpl && !isImplicitConformance && !isLiveGoTwin && node.properties.isExport) {
        // Find if any incoming edges are 'IMPORTS' from OTHER files or 'CALLS' from other files
        // liveRefs, not incomingRefs — an unused import from another file would otherwise read as
        // external consumption and launder the export exactly as it laundered the orphan above.
        // Member use does NOT count here: UNUSED_EXPORT asks whether another module consumes the EXPORT,
        // and calling methods on an instance a factory handed back does not name it (measured on
        // orchestrator: `Session`, used only inside client.mjs, would have lost its true verdict).
        const externallyUsed = liveRefs.some((e: any) => {
          const source = graph.getNode(e.sourceId);
          return source && (source as any).properties.filePath !== (node as any).properties.filePath;
        });

        if (!externallyUsed && !this.isEntryPoint(node)) {
          // Same gate as the ORPHAN branch above. "Exported but never consumed" is a fact about a
          // reachable module; in a file nothing imports it is a restatement of the file's own
          // unreachability, and the reader cannot act on it either way. `orphanHelper` was landing
          // here — called by `orphanSecond` in the same unimported file — so one symbol of that
          // fixture read as a question and its sibling as a finding (ADR 0104).
          findings.push(onlyImported ? {
            type: 'ONLY_IMPORTED',
            symbol: node.properties.name,
            file: node.properties.filePath,
            message: ONLY_IMPORTED_MESSAGE
          } : !isOpenQuestion(node.properties.filePath) ? {
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

    findings.push(...this.findStaleImports(graph, allEdges, usedNamesByFile, fileOfNode));
    findings.push(...this.findUnusedMembers(graph, nodes as ConducksNode[], danglingRefNames, isNested));

    return findings;
  }

  /**
   * Languages whose class MEMBERS are judged — each one only once an oracle scores member verdicts
   * against its compiler (Java: javac, `oracle-java-dead.mjs`). A language enters this list with its
   * oracle, not before: the module-scope rule above exists because member verdicts made by name were
   * "overwhelming false positives", and only a compiler can say which ones are.
   */
  private static readonly MEMBER_JUDGED = ['.java'];

  /** Methods every Java object has, or that the runtime calls by name (serialization). */
  private static readonly RUNTIME_CALLED_METHODS = new Set<string>([
    'tostring', 'equals', 'hashcode', 'clone', 'finalize', 'compareto', 'close', 'iterator',
    'readobject', 'writeobject', 'readresolve', 'writereplace', 'readobjectnodata', 'main',
  ]);

  /**
   * UNUSED_MEMBER — a method of a LIVE type that nothing calls or references.
   *
   * Only members of a type IN USE are judged; a type nothing reaches is the type's own question
   * (deleting it deletes them). What spares a method, each a way it is reached with no edge:
   *   - any incoming reference, or a dangling call naming it (`x.foo()` the linker could not bind —
   *     duck typing, a receiver of unknown type: under-reporting is the safe side);
   *   - an annotation (`@Override`, `@GetMapping`, `@Test`, `@Bean` — a framework or the compiler
   *     names it), or a registering decorator;
   *   - its name declared by a supertype in the project (an override, reached through the base), or
   *     its type having a supertype the project does not define (a library base class or interface
   *     may declare it: `TypeAdapter.read`);
   *   - a bean accessor (getX/isX/setX), reached by reflection from templates, JSON and JPA;
   *   - a name the runtime calls (toString, equals, readObject…), and entry points.
   */
  private findUnusedMembers(
    graph: ConducksAdjacencyList, nodes: ConducksNode[],
    danglingRefNames: Set<string>, isNested: (n: any) => boolean,
  ): Finding[] {
    const judged = (f: string) => DeadCodeAnalyzer.MEMBER_JUDGED.some(ext => f.endsWith(ext));
    const membersOf = new Map<string, Set<string>>();
    const membersById = new Map<string, string[]>();
    for (const n of nodes) {
      const parent = String((n.properties as any)?.parentId ?? '').toLowerCase();
      if (!parent || !n.properties?.name) continue;
      (membersById.get(parent) ?? membersById.set(parent, []).get(parent)!).push(n.id);
      const set = membersOf.get(parent) ?? new Set<string>();
      set.add(String(n.properties.name).toLowerCase());
      membersOf.set(parent, set);
    }
    // Names declared by every supertype in the project, and whether any supertype is NOT in it.
    const inherited = new Map<string, { names: Set<string>; external: boolean }>();
    const supertypesOf = (typeId: string) => graph.getNeighbors(typeId, 'downstream')
      .filter((e: any) => e.type === 'EXTENDS' || e.type === 'IMPLEMENTS');
    const inheritedOf = (typeId: string) => {
      const key = typeId.toLowerCase();
      const cached = inherited.get(key);
      if (cached) return cached;
      const out = { names: new Set<string>(), external: false };
      const seen = new Set<string>([key]);
      const todo = [typeId];
      while (todo.length) {
        for (const e of supertypesOf(todo.pop()!)) {
          const target = graph.getNode(e.targetId) as any;
          const filePath = String(target?.properties?.filePath ?? '');
          if (!target || !filePath || filePath.startsWith('external://')) { out.external = true; continue; }
          const id = String(target.id).toLowerCase();
          if (seen.has(id)) continue;
          seen.add(id);
          for (const name of membersOf.get(id) ?? []) out.names.add(name);
          todo.push(target.id);
        }
      }
      inherited.set(key, out);
      return out;
    };
    // A GUESSED CALL MAY BE ANY METHOD OF THAT NAME. With no types, `builder.serializeNulls()` is bound
    // by name to ONE `serializeNulls` (`resolved: false`, confidence 0.85) and every other one reads
    // as uncalled. MEASURED on gson against javac: 10 false UNUSED_MEMBER — GsonBuilder.serializeNulls
    // (the call went to Gson.serializeNulls), JsonElement.deepCopy (to JsonArray.deepCopy),
    // TypeAdapter.toJson (to Gson.toJson), BoundField.write … So a guessed call spares the NAME.
    const guessedNames = new Set<string>();
    for (const e of graph.getAllEdges() as ConducksEdge[]) {
      if (!DeadCodeAnalyzer.REFERENCE_EDGES.has(e.type) || e.type === 'IMPORTS') continue;
      const p = (e as any).properties ?? {};
      if (p.resolved !== false && !((e.confidence ?? 1) < 1)) continue;
      const target = graph.getNode(e.targetId) as any;
      if (target?.properties?.name) guessedNames.add(String(target.properties.name).toLowerCase());
      if (p.original) guessedNames.add(String(p.original).split('.').pop()!.toLowerCase());
    }

    const fromOutside = (typeId: string) => (e: any) =>
      DeadCodeAnalyzer.REFERENCE_EDGES.has(e.type) && e.type !== 'IMPORTS'
      && e.sourceId !== typeId && !String(e.sourceId).startsWith(`${typeId}.`);
    const typeInUse = (typeId: string): boolean =>
      graph.getNeighbors(typeId, 'upstream').some(fromOutside(typeId))
      || [...(membersById.get(typeId.toLowerCase()) ?? [])].some(m => graph.getNeighbors(m, 'upstream').some(fromOutside(typeId)));

    const out: Finding[] = [];
    for (const node of nodes) {
      const props = node.properties as any;
      const file = String(props?.filePath ?? '');
      // A PRIVATE FIELD nothing reads or writes. Java's own rule makes this decidable from one file: a
      // private field can be used nowhere else, and the parser records every use of its name there
      // (reflector `@field_use`). Spared: an annotated field (@Autowired, @Column, @SerializedName —
      // a framework sets or reads it), any field of an annotated class (@Entity, @Data: JPA, Lombok
      // and serializers reach fields by reflection), and serialVersionUID, which the JVM reads.
      if (node.label === 'ATOM' && String(props?.kind ?? '') === 'field' && props?.name && judged(file.toLowerCase())) {
        if (DeadCodeAnalyzer.isTestPath(file)) continue;
        if (String(props.dna?.visibility ?? '') !== 'private') continue;
        // The compiler's own annotations hand the field to nobody (`@Deprecated`, `@SuppressWarnings`).
        const hooks = ((props.dna?.decorators ?? []) as string[]).filter(d => !/^@(java\.lang\.)?(Deprecated|SuppressWarnings)\b/.test(d));
        if (hooks.length > 0) continue;
        if (props.name === 'serialVersionUID') continue;
        const holder = graph.getNode(String(props.parentId ?? '')) as any;
        if (!holder || holder.label !== 'STRUCTURE' || !typeInUse(String(holder.id))) continue;
        if (((holder.properties?.dna?.decorators ?? []) as string[]).length > 0) continue;
        const used = graph.getNeighbors(node.id, 'upstream')
          .some((e: any) => DeadCodeAnalyzer.REFERENCE_EDGES.has(e.type) && e.sourceId !== node.id);
        if (used) continue;
        out.push({
          type: 'UNUSED_MEMBER',
          symbol: `${holder.properties.name}.${props.name}`,
          file,
          message: `Private field is never read or written. Only reflection could use it (a serializer, an injector) — check for one before deleting.`,
        });
        continue;
      }
      if (node.label !== 'BEHAVIOR' || !props?.name || !judged(file.toLowerCase())) continue;
      if (DeadCodeAnalyzer.isTestPath(file) || isNested(node)) continue;
      const owner = graph.getNode(String(props.parentId ?? '')) as any;
      if (!owner || owner.label !== 'STRUCTURE') continue;
      // A MEMBER IS JUDGED ONLY WHEN ITS TYPE IS IN USE — referenced, or one of its members used, from
      // outside the type. Not "is its file imported": a Java class used from its own package needs no
      // import (measured on the oracle fixture: `Service`, constructed by `App`, sat in a file nothing
      // imports and its dead method went unreported). A type nothing reaches is the TYPE's question —
      // reported above, or unjudgeable — and its members go with it either way.
      if (!typeInUse(String(owner.id))) continue;
      const ownerKind = String(owner.properties?.kind ?? '').toLowerCase();
      if (ownerKind === 'interface') continue;          // a requirement; its implementations are judged

      const name = String(props.name);
      const lower = name.toLowerCase();
      if (DeadCodeAnalyzer.RUNTIME_CALLED_METHODS.has(lower) || this.isEntryPoint(node)) continue;
      // A CONSTRUCTOR is reached by `new Owner(…)`, which names the TYPE — never the constructor node.
      if (lower === String(owner.properties?.name ?? '').toLowerCase()) continue;
      if (/^(get|is)[A-Z]/.test(name) || /^set[A-Z]/.test(name)) continue;
      // A LIBRARY'S API IS USED OUTSIDE THE PROJECT. A public or protected method of a public type can
      // be called by code this graph never sees (measured on gson: 18 such methods javac finds no
      // caller for, every one of them gson's API). Package-private and private members, and any
      // member of a non-public type, can only be reached from inside — those are judged.
      const visible = (n: any) => ['public', 'protected'].includes(String(n?.properties?.dna?.visibility ?? ''));
      if (visible(node) && visible(owner)) continue;
      if (((props.dna?.decorators ?? []) as string[]).length > 0) continue;
      if (danglingRefNames.has(lower) || guessedNames.has(lower)) continue;
      const refs = graph.getNeighbors(node.id, 'upstream')
        .filter((e: any) => DeadCodeAnalyzer.REFERENCE_EDGES.has(e.type) && e.sourceId !== node.id);
      if (refs.length > 0) continue;
      const up = inheritedOf(owner.id);
      if (up.external || up.names.has(lower)) continue;

      out.push({
        type: 'UNUSED_MEMBER',
        symbol: `${owner.properties.name}.${name}`,
        file,
        message: `Method is never called or referenced (no callers, method references, or overridden declaration).`,
      });
    }
    return out;
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
    'variable',
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
  /**
   * Every name each file was seen USING, from all evidence classes at once — plus the file-of-node
   * helper that keys it.
   *
   * Hoisted out of `findStaleImports` when the ORPHAN branch needed the same answer. Two copies of
   * "did this file use this name" would drift, and they would drift in opposite directions: one
   * decides whether to report an import, the other whether to report the symbol behind it, so a
   * disagreement between them is exactly the gap ONLY_IMPORTED exists to close.
   */
  private buildUsageIndex(graph: ConducksAdjacencyList, allEdges: ConducksEdge[]): {
    usedNamesByFile: Map<string, Set<string>>;
    fileOfNode: (nodeId: NodeId) => string;
  } {
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
      // EXPERIMENT: a RESOLVED dotted tail names a method on a receiver. Record the member, not the
      // receiver segment.
      const tail = targetTail(edge.targetId);
      if (edge.type === 'CALLS' && String(edge.targetId).includes('::') && tail.includes('.')) {
        recordUse(file, tail.split('.').pop()!.toLowerCase());
      } else {
        for (const token of tokensOf(tail)) recordUse(file, token);
      }
      // Identifier-as-value wiring: `register(HANDLERS)` passes the binding without calling it.
      // EXPERIMENT: raw argument tokens removed
    }

    return { usedNamesByFile, fileOfNode };
  }

  private findStaleImports(
    graph: ConducksAdjacencyList,
    allEdges: ConducksEdge[],
    usedNamesByFile: Map<string, Set<string>>,
    fileOfNode: (nodeId: NodeId) => string,
  ): Finding[] {

    // Candidates, grouped per import statement (file + specifier).
    interface Candidate { binding: string; raw: string; targetId: string; isTypeOnly: boolean }
    const statements = new Map<string, { file: string; specifier: string; candidates: Candidate[] }>();

    for (const edge of allEdges) {
      if (edge.type !== 'IMPORTS') continue;
      const props: any = edge.properties || {};
      // Only the per-binding edge carries `bindingName`; the file-level edge never does.
      if (!props.bindingName) continue;
      const file = fileOfNode(edge.sourceId);
      if (!file || DeadCodeAnalyzer.isTestPath(file)) continue;
      // A BARREL IMPORTS IN ORDER TO REPUBLISH. Python states the republish in `__all__`, a list of
      // STRING literals no reference rule reads, so every name an `__init__.py` re-exports looks
      // imported-and-never-touched. MEASURED on scraper: of 56 findings the Python oracle
      // contradicted, **54 were in `__init__.py`** — one shape accounting for 96% of them.
      // Excluding barrels is what makes removing the calibration guard below survivable.
      if (DeadCodeAnalyzer.isBarrelPath(file)) continue;
      const key = `${file}::${props.specifier}`;
      let statement = statements.get(key);
      if (!statement) statements.set(key, statement = { file, specifier: String(props.specifier), candidates: [] });
      statement.candidates.push({
        binding: String(props.bindingName).toLowerCase(),
        // The spelling the FILE wrote, which is the thing a reader has to delete. Empty when the
        // producer did not record one — `bindingName` is FOLDED TO LOWER CASE and is not a
        // substitute: falling back to it renamed `UnusedClass` to `unusedclass` in every finding.
        raw: props.bindingNameRaw ? String(props.bindingNameRaw) : '',
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
      // THE IMPORT-SITE CALIBRATION GUARD IS GONE, and this is the measurement that retired it.
      //
      // It skipped any statement where NOTHING it brings in was seen used, on the premise that the
      // extractor might simply not cover how this file uses it. True in 2026-08-15's measurement,
      // where removing it cost Python 77 false findings. Re-measured 2026-08-26 after the barrel
      // exclusion above: the false findings were not spread across the language, they were 54 of 56
      // in `__init__.py`, and the barrel rule names that shape directly instead of tolerating it
      // with a blanket guard.
      //
      // What the guard cost: it skipped every SINGLE-BINDING import by construction, since "nothing
      // in this statement is used" is always true when the statement brings in one name. That is
      // the shape todo77#P1 planted twice and prune missed twice.
      //
      // Kept in place of the guard: nothing. Precision is now held by the barrel rule, the test-path
      // rule, and the type-only rule, each of which names a REASON a file legitimately imports
      // without using — which is what the guard was approximating.

      for (const candidate of statement.candidates) {
        if (isUsed(candidate)) continue;
        // Only claim staleness about a declaration the graph can fully see used (see
        // PRUNABLE_BINDING_KINDS). An unresolved target proves nothing either way.
        const target = graph.getNode(candidate.targetId) as ConducksNode | undefined;
        const kind = DeadCodeAnalyzer.declaredKindOf(graph, target);
        if (!kind || !DeadCodeAnalyzer.PRUNABLE_BINDING_KINDS.has(kind)) continue;

        const key = `${statement.file}::${candidate.binding}`;
        if (reported.has(key)) continue;
        reported.add(key);
        findings.push({
          type: 'STALE_IMPORT',
          // NAME WHAT THE FILE WROTE, not what the import resolved to.
          //
          // This reported `target.properties.name` — the DECLARATION's name at the far end of the
          // import. Those differ whenever a barrel republishes under another spelling or the import
          // is aliased, and then the finding names a symbol the file does not contain.
          //
          // MEASURED by trying to act on it: `guard.ts:3` reads `import { logger }`, prune said
          // `Logger` (the class the re-export resolves to), and a script deleting exactly the named
          // symbol skipped that one file in silence. A verdict a reader cannot locate is a verdict
          // they cannot act on.
          symbol: candidate.raw || target!.properties.name,
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
  /**
   * A file that re-exports WITHOUT the graph being able to see it — which is `__init__.py`, and only
   * `__init__.py`.
   *
   * Python states a republish in `__all__`, a list of STRING literals no reference rule reads, so a
   * package init looks exactly like a file that imports names and never touches them. MEASURED on
   * scraper: 54 of 56 false stale-import findings were in one.
   *
   * `index.ts` was in this set for one commit and is NOT a barrel for this purpose. TypeScript
   * spells a republish `export { x }`, which the grammar already captures as a use, so the exclusion
   * bought nothing there — and it COST five true findings on this repository, where an `index.ts` is
   * routinely a real module with real code rather than a pure re-export file.
   */
  private static isBarrelPath(filePath: string): boolean {
    return filePath.toLowerCase().split(/[\\/]/).pop() === '__init__.py';
  }

  /**
   * The kind of the DECLARATION an import really lands on, following a barrel's re-export.
   *
   * An import through a barrel resolves to the barrel's own re-export node, whose kind is `binding`
   * — a name this file republishes, not a declaration. `binding` is not a prunable kind, so the
   * candidate was dropped and NO import routed through a barrel could ever be judged stale. On a
   * codebase that reaches everything through `index.ts` doors that is most of them: measured on this
   * repository, it was the single largest cause of the recall gap against `tsc --noUnusedLocals`,
   * and it hid behind three other hypotheses before instrumentation named it (ADR 0164).
   *
   * The re-export node ALIASES the real declaration, so following that edge asks the kind question
   * of the thing the import actually names. Depth-capped: a chain of barrels is normal, a cycle is
   * not, and this must not hang on one.
   */
  private static declaredKindOf(graph: ConducksAdjacencyList, node: ConducksNode | undefined): string {
    let current = node;
    for (let hop = 0; current && hop < 5; hop++) {
      const kind = (current.properties?.kind || '').toLowerCase();
      if (kind !== 'binding') return kind;
      const alias = graph.getNeighbors(current.id, 'downstream')
        .find((e: any) => e.type === 'ALIASES');
      if (!alias) return kind;
      current = graph.getNode(alias.targetId) as ConducksNode | undefined;
    }
    return (current?.properties?.kind || '').toLowerCase();
  }

  /**
   * A file that exists to REPUBLISH what it imports — `__init__.py` and an `index` door.
   *
   * Wider than `isBarrelPath` on purpose, and the difference is the whole point: the two callers ask
   * different questions. `findStaleImports` asks "is this IMPORT dead", and for that a TS `index.ts`
   * must be judged like any other file, because `export { x }` is captured and an index door here is
   * routinely a real module with real code — exempting them cost five true findings.
   *
   * This one asks "is the SYMBOL dead", and a re-export surface is exactly where a consumer becomes
   * invisible: `export const SYSTEMS = BUILTIN_SYSTEMS` in an index door is a bare initializer read
   * and produces no edge at all. MEASURED on sofie: narrowing this to `__init__.py` reported
   * `BUILTIN_SYSTEMS` as an unused export while `systems/index.ts:25` was consuming it.
   */
  private static isReexportSurface(filePath: string): boolean {
    const base = filePath.toLowerCase().split(/[\\/]/).pop() || '';
    return base === '__init__.py' || /^index\.(ts|tsx|js|jsx|mjs|cjs)$/.test(base);
  }

  private static isTestPath(filePath: string): boolean {
    // The contract answers "is this a test file" for every language (incl. Rust `tests.rs`); the
    // extra directories are this analyzer's own: mocks, fixtures and the polyglot verifier are not
    // production code either.
    return isTestPath(filePath)
      || /(^|\/)(__mocks__|fixtures?|polyglot-verify)(\/|$)/.test(filePath.toLowerCase());
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
    // Go runs every `init` before `main`, and nothing ever names it. Go only: a TypeScript `init`
    // is an ordinary function.
    if (name === 'init' && String(node.properties.filePath || '').toLowerCase().endsWith('.go')) return true;

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
