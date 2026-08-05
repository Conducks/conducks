import { isBuiltIn, getGlobalId } from '@/lib/core/parsing/built-ins.js';
import { ConducksAdjacencyList, type EdgeType } from './adjacency-list.js';
import { logger } from '@/lib/core/utils/logger.js';
import { TypeScriptResolver } from '../parsing/languages/typescript/resolver.js';

/**
 * Conducks — Intra-Project Symbol Linker 🏺
 *
 * Resolves bare cross-file symbol references in CALLS/CONSTRUCTS/TYPE_REFERENCE edges.
 *
 * Root cause it fixes:
 *   During streaming induction, the in-memory graph contains only the symbols from the
 *   current batch. When file A (batch 1) calls `SynapsePersistence` from file B (batch 2),
 *   `hasNode(B::synapsepersistence)` returns false — the edge is stored with a bare
 *   targetId (`"synapsepersistence"` instead of `"…/persistence.ts::synapsepersistence"`).
 *
 *   This linker runs once after the full graph is reloaded from the vault, at which point
 *   all nodes exist. It uses the IMPORTS adjacency (already fully resolved) to scope the
 *   candidate search to files the source file actually imports.
 */
export class IntraLinker {

  /**
   * Which edge types get a chance to be RESOLVED, keyed exhaustively by `EdgeType` (ADR 0053).
   *
   * This was an allowlist array, and an allowlist here fails in the worst available direction: a new
   * edge type defaults to unresolvable, its target stays bare through every pulse, virtual induction
   * manufactures a phantom node for it, and nothing complains — because a bare target that got
   * induced is indistinguishable from a legitimate external reference. That is exactly how heritage
   * spent months creating a duplicate `ConducksComponent` beside the real one.
   *
   * As a `Record<EdgeType, boolean>` the COMPILER refuses to build until a newly added edge type is
   * classified. The decision still has to be made by a person; it just can no longer be skipped by
   * accident, which is the only part that was going wrong.
   *
   * true  = names a symbol that may live in another file, so the resolver should try.
   * false = the target is a CONSTRUCTED id (containment, manifests, virtual links), so there is
   *         nothing to look up and trying would be noise.
   */
  private static readonly RESOLVABLE: Record<EdgeType, boolean> = {
    CALLS: true,
    CONSTRUCTS: true,
    TYPE_REFERENCE: true,
    ACCESSES: true,
    EXTENDS: true,          // added by ADR 0053 — 72 of 73 heritage targets resolve locally
    IMPLEMENTS: true,       // same
    IMPORTS: false,         // resolved earlier, by ImportProcessor against the file's own specifiers
    MEMBER_OF: false,       // containment; the parent id is constructed, not referenced
    CONTAINS: false,        // containment
    HAS_METHOD: false,      // containment
    HAS_PROPERTY: false,    // containment
    DEPENDS_ON: false,      // a package manifest entry; the target is external by definition
    FROM_IMAGE: false,      // infrastructure, not a source symbol
    VIRTUAL_LINK: false,    // synthesised by induction — resolving it would be circular
    PULSES_TO: false,       // both ends are resolved at bind time by ADR 0051
    GOVERNS: false,         // derived from a doc's own text against real paths (ADR 0058)
    DEFINES: false,         // the target is a `ROUTE::<path>::<METHOD>` id minted by the same
                            // spectrum that emits the edge — constructed, not referenced
    ALIASES: true,          // the target is the ORIGINAL symbol the alias renames, and it routinely
                            // lives in another file (`import { x as y }`, Go and Ruby wildcards)
  };

  private static readonly RESOLVABLE_TYPES = new Set<string>(
    (Object.keys(IntraLinker.RESOLVABLE) as EdgeType[]).filter(t => IntraLinker.RESOLVABLE[t])
  );

  private resolver = new TypeScriptResolver();

  /**
   * Resolves unresolved edge targets in the graph.
   *
   * @returns List of { id, newTargetId } pairs — feed to persistence.updateEdgeTargets().
   */
  public resolve(graph: ConducksAdjacencyList): Array<{ id: string; newTargetId: string }> {
    // ── 1. Build unitId → (lowerName → nodeId) lookup ──────────────────────
    // Nodes that are the unit themselves (fileX::unit) are skipped since they can't
    // be a call target by bare name.
    const unitSymbols = new Map<string, Map<string, string>>();

    for (const node of graph.getAllNodes()) {
      const unitId = (node.properties.unitId as string | undefined)?.toLowerCase();
      if (!unitId) continue;
      const name = (node.properties.name as string | undefined || '').toLowerCase();
      if (!name || name === 'unit') continue;
      if (!node.id.includes('::')) continue; // skip virtual/unqualified ids

      if (!unitSymbols.has(unitId)) unitSymbols.set(unitId, new Map());
      // First-encountered (highest gravity after resonate) wins for ambiguous names.
      const fileMap = unitSymbols.get(unitId)!;
      if (!fileMap.has(name)) fileMap.set(name, node.id);

      // The QUALIFIED member path, keyed alongside the bare name.
      //
      // A member's node id is `<file>::<owner>.<member>` and its `name` is only the LAST segment
      // (`create`), while the call processor emits the target exactly as written in the source —
      // `userrepository.create`. Keying by `name` alone therefore made the qualified form
      // unlookupable: step 3b could never match it, and step 3c fell back to the bare method
      // (`create`), which is generic enough to bind the wrong node or, more often, nothing.
      // Measured on mentorseed: 10 `userrepository.*` edges dangled with the defining node present
      // in the graph under exactly this id.
      const sep = node.id.indexOf('::');
      if (sep > 0) {
        const qualified = node.id.slice(sep + 2);
        if (qualified && qualified !== name && !fileMap.has(qualified)) fileMap.set(qualified, node.id);
      }
    }

    // Strip ::unit to give the resolver raw absolute paths
    const allFilePaths = Array.from(unitSymbols.keys()).map(u => u.split('::')[0]);

    // ── 2. Build sourceUnitId → importedUnitIds from IMPORTS edges ──────────
    const unitImports = new Map<string, string[]>();

    for (const edge of graph.getAllEdges()) {
      if (edge.type !== 'IMPORTS') continue;

      let targetUnit = edge.targetId;
      // If the target is a raw specifier (no ::), resolve it!
      if (!targetUnit.includes('::')) {
        const sourceNode = graph.getNode(edge.sourceId);
        const sourceFile = sourceNode?.properties?.filePath || edge.sourceId.split('::')[0];
        const resolved = this.resolver.resolve(targetUnit, sourceFile, allFilePaths);
        if (resolved) {
          targetUnit = `${resolved}::unit`;
        }
      }

      const sourceUnitId = edge.sourceId.toLowerCase();
      const list = unitImports.get(sourceUnitId);
      if (list) {
        list.push(targetUnit);
      } else {
        unitImports.set(sourceUnitId, [targetUnit]);
      }
      logger.debug(`🛡️ [IntraLinker] Edge ${sourceUnitId} imports ${targetUnit}`);
    }

    // ── 2b. One hop further, through barrels ────────────────────────────────
    //
    // A binding is routinely imported from a BARREL that does not define it: mentorseed's
    // `authService.ts` imports `userRepository` from `@/core/auth/server`, whose `index.ts`
    // re-exports it from `../repositories/user.repository`. Scoped to depth 1 the defining unit is
    // never in the candidate set — measured: 0 of the 10 `userrepository.*` targets are reachable at
    // depth 1, all 10 at depth 2.
    //
    // Depth 2 only, and answered ONLY when exactly one unit at that depth defines the name (see
    // `resolveSymbolUnique`). Depth 1 keeps first-match-wins because that is what it always did and
    // the import list there is the file's own; depth 2 is one inference removed, so an ambiguous
    // answer is refused rather than picked.
    const unitImportsDepth2 = new Map<string, string[]>();
    for (const [sourceUnitId, direct] of unitImports) {
      const seen = new Set<string>(direct);
      seen.add(sourceUnitId);
      const second: string[] = [];
      for (const mid of direct) {
        for (const far of unitImports.get(mid) ?? []) {
          if (seen.has(far)) continue;
          seen.add(far);
          second.push(far);
        }
      }
      if (second.length > 0) unitImportsDepth2.set(sourceUnitId, second);
    }

    // ── 2c. External namespaces, and the symbols the graph attests under them ─
    //
    // An external import emits NO `IMPORTS` edge at all (measured on mentorseed: 0 of 3,095 carry an
    // external origin), so the import scope above cannot see one. What the graph DOES hold is the
    // resolved half of the same import: the call/construct processors write
    // `@heroicons/react/24/outline::academiccapicon` because they consult the file's binding table,
    // while the reference-as-value path writes the BARE name (`academiccapicon`) and dangles.
    //
    // Two facts, both read off edges rather than inferred:
    //   - which external namespaces a unit demonstrably references (it already has a resolved edge
    //     into one), and
    //   - which `<namespace>::<symbol>` pairs exist anywhere in the workspace.
    // A bare name is bound only where both hold and exactly one namespace answers. Built from EDGES,
    // not from nodes, because virtual induction mints those nodes AFTER this linker runs — reading
    // nodes would make the fix work on the second pulse and not the first.
    const unitExternalNamespaces = new Map<string, Set<string>>();
    const attestedExternal = new Map<string, Set<string>>();
    // Memoised: a unit with 40 icon references would otherwise hydrate the same source node 40
    // times, and `getNode` inflates compressed properties on every call.
    const unitIdCache = new Map<string, string | null>();

    for (const edge of graph.getAllEdges()) {
      const sep = edge.targetId.indexOf('::');
      if (sep <= 0) continue;
      const namespace = edge.targetId.slice(0, sep);
      const symbol = edge.targetId.slice(sep + 2);
      if (!symbol || symbol.includes('::')) continue;
      if (!IntraLinker.isExternalNamespace(namespace)) continue;

      let symbols = attestedExternal.get(namespace);
      if (!symbols) { symbols = new Set(); attestedExternal.set(namespace, symbols); }
      symbols.add(symbol);

      let srcUnit = unitIdCache.get(edge.sourceId);
      if (srcUnit === undefined) {
        srcUnit = this.unitIdOf(graph, edge.sourceId);
        unitIdCache.set(edge.sourceId, srcUnit);
      }
      if (!srcUnit) continue;
      let namespaces = unitExternalNamespaces.get(srcUnit);
      if (!namespaces) { namespaces = new Set(); unitExternalNamespaces.set(srcUnit, namespaces); }
      namespaces.add(namespace);
    }

    // ── 3. Resolve unresolved edges ─────────────────────────────────────────
    const resolved: Array<{ id: string; newTargetId: string }> = [];

    for (const edge of graph.getAllEdges()) {
      // Specifier-prefixed pseudo-ids: the call processor's binding resolution emits
      // `./algorithms/traversal.js::graphtraversal.traverseupstream` — a RELATIVE specifier, not a
      // canonical node id. The '::' made this loop treat them as already resolved, so every such
      // edge (imported `new Foo()`, class-qualified static calls) dangled forever. Resolve the
      // specifier against the source file and rewrite ONLY when the target node really exists.
      if (/^\.\.?\//.test(edge.targetId) && edge.targetId.includes('::')) {
        if (!IntraLinker.RESOLVABLE_TYPES.has(edge.type)) continue;
        const [spec, sym] = edge.targetId.split('::');
        const srcNode = graph.getNode(edge.sourceId);
        const srcFile = srcNode?.properties?.filePath || edge.sourceId.split('::')[0];
        const abs = this.resolver.resolve(spec, srcFile, allFilePaths);
        if (abs) {
          const candidate = `${abs.toLowerCase()}::${sym.toLowerCase()}`;
          if (graph.getNode(candidate)) {
            resolved.push({ id: edge.id, newTargetId: candidate });
          }
        }
        continue;
      }

      // A `<barrelFile>::<binding>` IMPORTS target whose node does not exist — the residue ADR 0071
      // left. That record mints a node for every name a barrel names OUTRIGHT
      // (`export { a, b as c } from './x'`), and could not for `export * from './x'`, because the
      // wildcard enumerates nothing at the re-exporting file.
      //
      // It is enumerable at the TARGET file, and by here the whole graph is loaded, so the objection
      // that killed it at parse time (waves clear the graph between flushes) no longer applies. The
      // barrel's own whole-file IMPORTS edges name every file it re-exports FROM — a wildcard emits
      // one of those, which is exactly why the specifier survived even though the names did not.
      // Search those files for a symbol with the binding's name and point the edge at the real
      // definition, which is a better answer than a minted node at the barrel: no node is invented,
      // and the importer lands on the file that actually defines the symbol.
      if (edge.type === 'IMPORTS' && edge.targetId.includes('::') && !graph.hasNode(edge.targetId)) {
        const sep = edge.targetId.lastIndexOf('::');
        const binding = edge.targetId.slice(sep + 2);
        const barrelUnit = `${edge.targetId.slice(0, sep)}::unit`;
        if (binding && binding !== 'unit' && graph.hasNode(barrelUnit)) {
          const viaBarrel =
            this.resolveSymbol(binding, barrelUnit, unitImports, unitSymbols) ??
            this.resolveSymbolUnique(binding, barrelUnit, unitImportsDepth2, unitSymbols);
          if (viaBarrel && viaBarrel !== edge.targetId) {
            graph.rebindEdgeTarget(edge, viaBarrel);
            resolved.push({ id: edge.id, newTargetId: viaBarrel });
          }
        }
        continue;
      }

      // A TYPED receiver whose member id does not exist: `<file>::registry.get`, where `registry`
      // was declared `const registry = ... new ServiceRegistry()` in that same file.
      //
      // The call processor already resolved the RECEIVER — the target carries the file that defines
      // it — and then stopped, because the member belongs to the receiver's TYPE and nothing in the
      // graph said what that type was. `instanceOf` now does (todo29#P3b). On mentorseed this one
      // shape is 192 dangling edges from a single variable, plus `registry.register` / `registry.has`.
      //
      // It has to run HERE, above the `includes('::')` skip: the id is fully qualified, so the
      // bare-name path below never sees it. The member node must ALREADY EXIST — a type without
      // that member resolves to nothing rather than to an invented id (ADR 0070).
      if (edge.targetId.includes('::') && !graph.hasNode(edge.targetId) && IntraLinker.RESOLVABLE_TYPES.has(edge.type)) {
        const sep = edge.targetId.lastIndexOf('::');
        const file = edge.targetId.slice(0, sep);
        const symbol = edge.targetId.slice(sep + 2);
        const dot = symbol.indexOf('.');

        // A PROPERTY CHAIN over an object literal: `container.services.registry.lookup`.
        //
        // Not dynamic dispatch — every hop is written in the source. The root variable records which
        // identifier each property PATH aliases, so the chain is walked by taking the LONGEST path
        // that resolves and treating the rest as the member. Longest-first matters: `services` and
        // `services.registry` may both be recorded, and only the longer one names a real value.
        //
        // A computed key (`handlers[key]()`) records no path and therefore lands nowhere here, which
        // is the correct outcome and the line between the two shapes (todo30).
        if (dot > 0) {
          const rootName = symbol.slice(0, dot);
          const rootId = `${file}::${rootName}`;
          let paths = (graph.getNode(rootId)?.properties as any)?.objectPaths as Record<string, string> | undefined;
          let pathsOwner: string | null = null;

          // The receiver may be a PARAMETER rather than a variable in this file. A CLI command is
          // `execute(args: string[], registry: Registry)`, and `registry.infrastructure.x.y()` is the
          // single largest dangling shape on this repository — 113 edges (todo34).
          //
          // The parameter's declared type is written in the signature, and the enclosing function
          // records it. So: find the parameter, resolve its TYPE to a node, and use that node's
          // object paths. Every step reads something the source states.
          if (!paths) {
            const enclosing = graph.getNode(edge.sourceId)?.properties as any;
            const declaredType = (enclosing?.paramTypes as Record<string, string> | undefined)?.[rootName];
            if (declaredType) {
              // Strip array/generic decoration; a decorated type states a shape, not a single value.
              const bare = declaredType.replace(/\[\]$/, '');
              if (/^[a-z_$][\w$]*$/i.test(bare)) {
                // `${file}::unit`, not `sourceUnitId` — this branch runs before that is computed,
                // and the file is what the qualified target already carries.
                const typeId =
                  unitSymbols.get(`${file}::unit`)?.get(bare) ??
                  this.resolveSymbolUnique(bare, `${file}::unit`, unitImports, unitSymbols);
                if (typeId) {
                  paths = (graph.getNode(typeId)?.properties as any)?.objectPaths as Record<string, string> | undefined;
                  if (paths) pathsOwner = typeId.slice(0, typeId.lastIndexOf('::'));

                  // THE TYPEOF ALIAS (todo42#P2): the type resolved, but it is
                  // `type Registry = typeof registry` — a type node that OWNS no paths and states,
                  // in the source, which VARIABLE carries the shape. Follow that one hop, in the
                  // TYPE's own file (a typeof target is a local name where the alias is written).
                  // One hop only, and only when the variable actually records paths — a chain with
                  // an unresolvable hop refuses rather than guesses (ADR 0085).
                  if (!paths) {
                    const typeofTarget = (graph.getNode(typeId)?.properties as any)?.typeofTarget as string | undefined;
                    if (typeofTarget) {
                      const typeFile = typeId.slice(0, typeId.lastIndexOf('::'));
                      const varId = `${typeFile}::${typeofTarget}`;
                      paths = (graph.getNode(varId)?.properties as any)?.objectPaths as Record<string, string> | undefined;
                      if (paths) pathsOwner = typeFile;
                    }
                  }
                }
              }
            }
          }
          if (paths) {
            const rest = symbol.slice(dot + 1);
            const segments = rest.split('.');
            // Longest prefix first, leaving at least one segment as the member being called.
            // Start at the WHOLE rest, not one short of it. A DELEGATING property consumes every
            // segment — `registry.audit.status` matches the recorded path `audit.status` and leaves
            // no member, because the delegation target IS what is being called. Reserving a segment
            // for a member meant the dominant DI shape never matched at all.
            for (let take = segments.length; take >= 1; take--) {
              // An EMPTY value means "wired, but its type is not stated" — a getter that computes
              // rather than aliases. Dead-code uses those paths; the resolver must not.
              const aliased = paths[segments.slice(0, take).join('.')];
              if (!aliased) continue;
              const member = segments.slice(take).join('.');
              if (!member && !aliased.includes('.')) continue;   // a bare alias with no member names nothing to call
              // The aliased identifier lives in whichever file DECLARED the object, which is not
              // this one when the receiver was a typed parameter.
              const ownerFile = pathsOwner ?? file;

              // A DELEGATION records a dotted callee (`governance.status`), not a variable. Resolve
              // it the way any other receiver.member target is resolved: the receiver's own type,
              // then the member on it. The member being CALLED here is the delegate's, not the
              // caller's, so `member` from the outer split is discarded for this branch.
              if (aliased.includes('.')) {
                const dDot = aliased.indexOf('.');
                const dRecv = aliased.slice(0, dDot);
                const dMember = aliased.slice(dDot + 1);
                const rProps = graph.getNode(`${ownerFile}::${dRecv}`)?.properties as any;
                const rType = (rProps?.instanceOf as string | undefined)
                  ?? this.returnTypeOfCall(graph, rProps?.instanceOfCall as string | undefined, ownerFile, unitImports, unitSymbols);
                if (!rType) continue;
                const rTypeId =
                  unitSymbols.get(`${ownerFile}::unit`)?.get(rType) ??
                  this.resolveSymbolUnique(rType, `${ownerFile}::unit`, unitImports, unitSymbols);
                const delegated = rTypeId ? this.memberOfType(graph, rTypeId, rType, dMember, unitImports, unitSymbols) : null;
                if (delegated) {
                  graph.rebindEdgeTarget(edge, delegated);
                  resolved.push({ id: edge.id, newTargetId: delegated });
                  break;
                }
                continue;
              }

              const targetNode = graph.getNode(`${ownerFile}::${aliased}`);
              const props = targetNode?.properties as any;
              const typeName = (props?.instanceOf as string | undefined)
                ?? this.returnTypeOfCall(graph, props?.instanceOfCall as string | undefined, ownerFile, unitImports, unitSymbols);
              if (!typeName) continue;
              const typeId =
                unitSymbols.get(`${ownerFile}::unit`)?.get(typeName) ??
                this.resolveSymbolUnique(typeName, `${ownerFile}::unit`, unitImports, unitSymbols);
              const candidate = typeId ? this.memberOfType(graph, typeId, typeName, member, unitImports, unitSymbols) : null;
              if (candidate) {
                graph.rebindEdgeTarget(edge, candidate);
                resolved.push({ id: edge.id, newTargetId: candidate });
                break;
              }
            }
            if (graph.hasNode(edge.targetId)) continue;
          }
        }

        // A PLAIN name qualified with a file that does not define it: `lib/index.ts::addMoney`,
        // where the barrel says `export * from './money.js'`. A wildcard enumerates nothing at the
        // re-exporting file, so no node is minted and no ALIASES edge exists — there is nothing to
        // follow, which is what separates this from the named forms (ADR 0071, ADR 0090).
        //
        // It IS enumerable at the target: the barrel's own IMPORTS name every file it re-exports
        // from. Resolve the name through them, uniqueness-gated so two files exporting it refuse.
        if (dot === -1 && symbol && symbol !== 'unit') {
          const viaBarrel = this.resolveSymbolUnique(symbol, `${file}::unit`, unitImports, unitSymbols);
          if (viaBarrel && viaBarrel !== edge.targetId) {
            graph.rebindEdgeTarget(edge, viaBarrel);
            resolved.push({ id: edge.id, newTargetId: viaBarrel });
            continue;
          }
        }

        if (dot > 0) {
          const receiver = symbol.slice(0, dot);
          const member = symbol.slice(dot + 1);
          // The receiver is often a RE-EXPORT of the declaration, not the declaration: mentorseed's
          // `db` is `export { coreDb as db }`, and `coreDb` is what carries the type. Walk the
          // ALIASES chain to the node that actually declares something, then read from THERE — and
          // resolve the type against THAT file, since the class is imported where it is used.
          // INNERMOST SCOPE FIRST — a local declaration shadows a module-level one of the same name.
          // The call target carries the receiver unscoped, so `client.fetchIt()` inside a function
          // that declares its own `client` looked up the MODULE-level variable and resolved into the
          // wrong class. Measured on the oracle fixture: a local `new SmtpClient()` answered
          // `HttpClient.fetchIt`. This is TypeScript's scoping rule, not a heuristic.
          const callerScope = edge.sourceId.slice(edge.sourceId.lastIndexOf('::') + 2);
          const scopedReceiver = `${file}::${callerScope}.${receiver}`;
          const receiverId = graph.hasNode(scopedReceiver) ? scopedReceiver : `${file}::${receiver}`;
          const declId = this.declarationOf(graph, receiverId, unitImports, unitSymbols);
          const declFile = declId.slice(0, declId.lastIndexOf('::'));
          const receiverProps = graph.getNode(declId)?.properties as any;
          // A direct `new Y()` states the type outright. A factory states it on the CALLEE — read
          // that method's DECLARED return type, which is written in the source exactly as often as
          // a `new` is. `getInstance(): CoreDatabaseManager` is 281 dangling edges on mentorseed,
          // and it was never inference: the annotation was there and nothing captured it.
          const typeName = (receiverProps?.instanceOf as string | undefined)
            ?? this.returnTypeOfCall(graph, receiverProps?.instanceOfCall as string | undefined, declFile, unitImports, unitSymbols);
          if (typeName) {
            // The class is looked up from the RECEIVER's file, which is where it is imported —
            // the calling file usually imports the instance and never the class.
            const typeId =
              unitSymbols.get(`${declFile}::unit`)?.get(typeName) ??
              this.resolveSymbolUnique(typeName, `${declFile}::unit`, unitImports, unitSymbols);
            const candidate = typeId ? this.memberOfType(graph, typeId, typeName, member, unitImports, unitSymbols) : null;
            if (candidate) {
              graph.rebindEdgeTarget(edge, candidate);
              resolved.push({ id: edge.id, newTargetId: candidate });
              continue;
            }
          }
        }
      }

      // Skip already-resolved edges (fully qualified IDs always contain '::')
      if (edge.targetId.includes('::')) continue;
      if (!IntraLinker.RESOLVABLE_TYPES.has(edge.type)) continue;

      const sourceNode = graph.getNode(edge.sourceId);
      const sourceUnitId: string | null =
        (sourceNode?.properties?.unitId as string | undefined)?.toLowerCase() ??
        (edge.sourceId.endsWith('::unit') ? edge.sourceId : null);
      if (!sourceUnitId) continue;

      const bareName = edge.targetId.toLowerCase();
      let resolvedId: string | null = null;

      // 3a. Same file first (catches batch-ordering misses within the same file).
      resolvedId = unitSymbols.get(sourceUnitId)?.get(bareName) ?? null;

      // 3b. Check each file the source imports.
      if (!resolvedId) {
        resolvedId = this.resolveSymbol(bareName, sourceUnitId, unitImports, unitSymbols);
      }

      // 3b-bis. A BARE `receiver.method` whose receiver is a variable with a recorded type.
      //
      // This must run BEFORE 3c, which throws the receiver away and matches the method name alone
      // across every imported unit — a guess that picks the first `fetchIt` it finds. Where the
      // receiver's type IS known, the exact member is knowable and guessing is inexcusable.
      //
      // Innermost scope first: a local declaration shadows a module-level one of the same name.
      // Measured on the oracle fixture — a local `new SmtpClient()` was answering
      // `HttpClient.fetchIt`, a different class in the same file.
      if (!resolvedId && bareName.includes('.')) {
        const dot = bareName.indexOf('.');
        const receiver = bareName.slice(0, dot);
        const member = bareName.slice(dot + 1);
        const file = sourceUnitId.slice(0, sourceUnitId.lastIndexOf('::'));
        const callerScope = edge.sourceId.slice(edge.sourceId.lastIndexOf('::') + 2);

        const scoped = `${file}::${callerScope}.${receiver}`;
        const receiverId = graph.hasNode(scoped) ? scoped
          : graph.hasNode(`${file}::${receiver}`) ? `${file}::${receiver}`
          : null;

        if (receiverId) {
          const declId = this.declarationOf(graph, receiverId, unitImports, unitSymbols);
          const declFile = declId.slice(0, declId.lastIndexOf('::'));
          const props = graph.getNode(declId)?.properties as any;
          const typeName = (props?.instanceOf as string | undefined)
            ?? this.returnTypeOfCall(graph, props?.instanceOfCall as string | undefined, declFile, unitImports, unitSymbols);
          if (typeName) {
            // A BUILT-IN receiver resolves to its global id. `const seen = new Set()` then
            // `seen.has(x)` is a Set method — the type IS known, it simply has no project file, and
            // demanding one left 348 edges dangling on this repository with the answer already
            // recorded on the variable (ADR 0097). Same treatment a direct call on a built-in gets.
            if (isBuiltIn(typeName, 'typescript') && graph.hasNode(getGlobalId(typeName))) {
              resolvedId = getGlobalId(typeName);
            } else {
              const typeId =
                unitSymbols.get(`${declFile}::unit`)?.get(typeName) ??
                this.resolveSymbolUnique(typeName, `${declFile}::unit`, unitImports, unitSymbols);
              if (typeId) resolvedId = this.memberOfType(graph, typeId, typeName, member, unitImports, unitSymbols);
            }
          }
        }

        // 3b-quater. The receiver is a TYPED PARAMETER with no node of its own (todo42#P1).
        //
        // `function run(registry: Registry) { registry.lookup(...) }` — a parameter is an ATOM and
        // an unreferenced ATOM is pruned, so the receiver lookup above finds nothing. But the TYPE
        // is written in the signature and the enclosing function records it as `paramTypes` — the
        // same map the three-segment chain (3b-ter) has read all along. The PLAIN two-segment form,
        // which is the more common shape, never did.
        //
        // An untyped parameter is refused outright: `registry` with no annotation states nothing,
        // and guessing from the name is how the vault filled with `results.foreach`.
        if (!resolvedId) {
          const enclosing = graph.getNode(edge.sourceId)?.properties as any;
          const declared = (enclosing?.paramTypes as Record<string, string> | undefined)?.[receiver];
          const bare = declared?.replace(/\[\]$/, '');
          if (bare && /^[a-z_$][\w$]*$/i.test(bare)) {
            if (isBuiltIn(bare, 'typescript') && graph.hasNode(getGlobalId(bare))) {
              resolvedId = getGlobalId(bare);
            } else {
              const typeId =
                unitSymbols.get(sourceUnitId)?.get(bare) ??
                unitSymbols.get(sourceUnitId)?.get(bare.toLowerCase()) ??
                this.resolveSymbolUnique(bare, sourceUnitId, unitImports, unitSymbols) ??
                this.resolveSymbolUnique(bare.toLowerCase(), sourceUnitId, unitImports, unitSymbols);
              if (typeId) resolvedId = this.memberOfType(graph, typeId, bare, member, unitImports, unitSymbols);
            }
          }
        }
      }

      // 3b-ter. A chain through an INTERFACE member: `spectrum.nodes.find(...)`.
      //
      // Three declarations, no inference: the parameter states `spectrum: PrismSpectrum`, the
      // interface states `nodes: SpectrumNode[]`, and `find` is an Array method. The middle step was
      // the one nothing read — 293 unresolved references on this repository (todo36).
      //
      // An ARRAY member resolves the call to the array global, because the method belongs to Array
      // and not to the element type. A member typed with a project type resolves the member on THAT
      // type. A member whose type is a shape (`Array<{...}>`, a union) states no single type and is
      // refused.
      if (!resolvedId && bareName.split('.').length === 3) {
        const [recv, prop, method] = bareName.split('.');
        const file = sourceUnitId.slice(0, sourceUnitId.lastIndexOf('::'));
        const callerScope = edge.sourceId.slice(edge.sourceId.lastIndexOf('::') + 2);
        const enclosing = graph.getNode(edge.sourceId)?.properties as any;
        const recvType = (enclosing?.paramTypes as Record<string, string> | undefined)?.[recv]
          ?? ((graph.getNode(`${file}::${callerScope}.${recv}`) ?? graph.getNode(`${file}::${recv}`))?.properties as any)?.instanceOf;

        if (recvType && /^[a-z_$][\w$]*$/i.test(recvType)) {
          const ifaceId =
            unitSymbols.get(sourceUnitId)?.get(recvType) ??
            this.resolveSymbolUnique(recvType, sourceUnitId, unitImports, unitSymbols);
          const members = ifaceId ? ((graph.getNode(ifaceId)?.properties as any)?.memberTypes as Record<string, string> | undefined) : undefined;
          const memberType = members?.[prop];
          if (memberType) {
            // An ARRAY member is deliberately NOT resolved. `s.entries.filter(...)` really is an
            // Array method, so an edge to the array global would be true — and contentless, because
            // every function in the codebase uses Array. It converts a dangler into a low-information
            // edge and improves the rate while telling nobody anything, which is the failure mode
            // ADR 0096 exists to stop. The sweep removes it as a universal member instead, which is
            // the honest answer (oracle T34).
            if (memberType.endsWith('[]') || /^(array|readonlyarray)</.test(memberType)) {
              // nothing — the sweep owns this case
            } else if (/^[a-z_$][\w$]*$/i.test(memberType)) {
              const ifaceFile = ifaceId!.slice(0, ifaceId!.lastIndexOf('::'));
              const targetTypeId =
                unitSymbols.get(`${ifaceFile}::unit`)?.get(memberType) ??
                this.resolveSymbolUnique(memberType, `${ifaceFile}::unit`, unitImports, unitSymbols);
              if (targetTypeId) resolvedId = this.memberOfType(graph, targetTypeId, memberType, method, unitImports, unitSymbols);
            }
          }
        }
      }

      // 3c. Method-call resolution: targets arrive as `receiver.method` (e.g. `reflector.reflect`,
      // `graph.getNeighbors`). Resolve the METHOD segment against the source file's imported units
      // only. This binds real internal method calls while leaving external receivers (path.join,
      // results.filter — no in-graph method of that name in an imported unit) correctly dangling.
      // Import-scoping is the safety rail: a bare method name is never bound to an arbitrary global.
      if (!resolvedId && bareName.includes('.')) {
        const method = bareName.split('.').pop()!;
        if (method && method !== bareName) {
          resolvedId =
            unitSymbols.get(sourceUnitId)?.get(method) ??
            this.resolveSymbol(method, sourceUnitId, unitImports, unitSymbols);
        }
      }

      // 3d. One import hop further, through a barrel that re-exports the definition rather than
      // owning it. Uniqueness-gated — see `unitImportsDepth2`.
      if (!resolvedId) {
        resolvedId = this.resolveSymbolUnique(bareName, sourceUnitId, unitImportsDepth2, unitSymbols);
      }

      // 3e. A named import of an EXTERNAL symbol. Bound only when this unit already references the
      // namespace and the workspace attests the symbol under it — see `unitExternalNamespaces`.
      if (!resolvedId) {
        const namespaces = unitExternalNamespaces.get(sourceUnitId);
        if (namespaces) {
          let candidate: string | null = null;
          let matches = 0;
          for (const namespace of namespaces) {
            if (!attestedExternal.get(namespace)?.has(bareName)) continue;
            candidate = `${namespace}::${bareName}`;
            matches++;
          }
          // Two packages exporting the same name is exactly the case where a guess would be wrong,
          // and there is nothing left in the graph to break the tie. Refuse (ADR 0070).
          if (matches === 1) resolvedId = candidate;
        }
      }

      if (resolvedId) {
        graph.rebindEdgeTarget(edge, resolvedId);
        resolved.push({ id: edge.id, newTargetId: resolvedId });
      }
    }

    // ── 3f. A target that is a pure ALIAS is not where the code lives ────────
    //
    // A barrel node minted for a republished name (ADR 0071) is a real node, so an edge pointing at
    // it does not dangle and nothing here used to look further. But `lib/index.ts::repo` DEFINES
    // nothing — it aliases `order-repo.ts::OrderRepo`. An impact query answered from the shim misses
    // the file that actually changes, and a member lookup on it finds no members at all.
    //
    // "Pure alias" is decided by structure, not by name: the node carries an outgoing ALIASES edge
    // and owns no members of its own. Following it is a READ of what the export statement says.
    const aliasOf = new Map<string, string>();
    for (const e of graph.getAllEdges()) {
      if (e.type !== 'ALIASES') continue;
      if (!aliasOf.has(e.sourceId) && graph.hasNode(e.targetId)) aliasOf.set(e.sourceId, e.targetId);
    }
    if (aliasOf.size > 0) {
      const ownsMembers = new Set<string>();
      for (const n of graph.getAllNodes()) {
        const id = String(n.id);
        const sep = id.lastIndexOf('::');
        const dot = id.indexOf('.', sep);
        if (dot > -1) ownsMembers.add(id.slice(0, dot));
      }
      for (const edge of graph.getAllEdges()) {
        if (!IntraLinker.RESOLVABLE_TYPES.has(edge.type) || edge.type === 'ALIASES') continue;
        const target = aliasOf.get(edge.targetId);
        if (!target || ownsMembers.has(edge.targetId)) continue;
        graph.rebindEdgeTarget(edge, target);
        resolved.push({ id: edge.id, newTargetId: target });
      }
    }

    // ── 4. Follow ALIASES chains past the first hop ──────────────────────────
    for (const { id, newTargetId } of this.collapseAliasChains(graph)) {
      resolved.push({ id, newTargetId });
    }

    if (resolved.length > 0) {
      logger.info(`🛡️ [IntraLinker] Resolved ${resolved.length} cross-file symbol references.`);
    }

    return resolved;
  }

  /**
   * A namespace that names a MODULE this project does not contain, rather than a file inside it.
   *
   * The same test `induceVirtualLibraries` uses, for the same reason: a local id is an absolute
   * path, so anything that does not look like one is a package. The synthesised prefixes are named
   * explicitly because they are not paths either and must NOT be treated as importable packages —
   * `directory::`, `ecosystem::` and `lib::` are constructed containment ids, and `global::` is
   * induction's own bucket for things it could not place.
   */
  private static readonly CONSTRUCTED_NAMESPACES = new Set(['directory', 'ecosystem', 'lib', 'route', 'global', 'unresolved']);

  private static isExternalNamespace(namespace: string): boolean {
    if (!namespace || IntraLinker.CONSTRUCTED_NAMESPACES.has(namespace)) return false;
    if (namespace.startsWith('/') || namespace.startsWith('.') || /^[a-z]:\\/.test(namespace)) return false;
    if (namespace.includes('.ts') || namespace.includes('.js') || namespace.includes('.tsx') || namespace.includes('.jsx')) return false;
    return true;
  }

  /** The unit a node id belongs to, whether it is the unit itself or a symbol inside it. */
  private unitIdOf(graph: ConducksAdjacencyList, nodeId: string): string | null {
    const node = graph.getNode(nodeId);
    const unitId = (node?.properties?.unitId as string | undefined)?.toLowerCase();
    if (unitId) return unitId;
    return nodeId.endsWith('::unit') ? nodeId.toLowerCase() : null;
  }

  /**
   * Walk an ALIASES chain to the definition it ultimately renames.
   *
   * `IntraLinker`'s main pass rebinds ONE hop, because `unitImports` only ever names files the
   * CURRENT file imports (ADR 0071 states this and deliberately stops there). mentorseed has a real
   * two-hop chain: `server.ts` re-exports `db` from `database/server/index.ts`, which re-exports it
   * from `DatabaseManager.ts` under the name `coreDb`. After one hop `server.ts::db` points at the
   * MIDDLE barrel's node — a real node, so nothing dangles, but the semantic link stops short of the
   * definition.
   *
   * Termination is by construction, not by a depth cap: each step must land on a node not already
   * `seen`, and `seen` only grows, so a chain of N distinct alias nodes takes at most N steps. A
   * cycle (`a` aliases `b` aliases `a`, which a pair of barrels re-exporting each other produces)
   * therefore stops at the repeat and keeps the last node it reached rather than looping or
   * throwing — a partial answer, never a hang.
   */
  private collapseAliasChains(graph: ConducksAdjacencyList): Array<{ id: string; newTargetId: string }> {
    const aliasTarget = new Map<string, string>();
    const aliasEdges = graph.getAllEdges().filter(e => e.type === 'ALIASES');
    for (const edge of aliasEdges) {
      if (!aliasTarget.has(edge.sourceId)) aliasTarget.set(edge.sourceId, edge.targetId);
    }

    const collapsed: Array<{ id: string; newTargetId: string }> = [];
    for (const edge of aliasEdges) {
      const seen = new Set<string>([edge.sourceId]);
      let terminal = edge.targetId;
      while (!seen.has(terminal)) {
        seen.add(terminal);
        const next = aliasTarget.get(terminal);
        // A bare next hop is one this pass could not resolve; stopping keeps the last REAL node
        // rather than replacing it with a name that resolves to nothing.
        if (!next || !graph.hasNode(next)) break;
        terminal = next;
      }
      if (terminal !== edge.targetId) {
        graph.rebindEdgeTarget(edge, terminal);
        collapsed.push({ id: edge.id, newTargetId: terminal });
      }
    }
    return collapsed;
  }

  /**
   * Walk ALIASES from a node to the one that actually declares a type, or return the node unchanged.
   *
   * A re-export is a rename, not a definition: `export { coreDb as db }` gives `db` an ALIASES edge
   * and no type of its own. Stops at the first node carrying `instanceOf` or `instanceOfCall`, and
   * otherwise at the end of the chain. Termination is by the `seen` set, which only grows — a cycle
   * (two barrels re-exporting each other) stops at the repeat rather than looping.
   */
  private declarationOf(
    graph: ConducksAdjacencyList,
    nodeId: string,
    unitImports: Map<string, string[]>,
    unitSymbols: Map<string, Map<string, string>>,
  ): string {
    const seen = new Set<string>([nodeId]);
    let current = nodeId;
    for (;;) {
      const props = graph.getNode(current)?.properties as any;
      if (props?.instanceOf || props?.instanceOfCall) return current;

      const sep = current.lastIndexOf('::');
      const name = current.slice(sep + 2);
      // UNIQUE resolution, not first-match-wins: two files behind one barrel can export the same
      // name, and picking the first is the coincidence-binding ADR 0070 refuses. Every lookup the
      // typed-receiver rules make is gated this way — the cost of refusing is a dangling edge, the
      // cost of guessing is a wrong one, and only the second is invisible (ADR 0085).
      //
      // An ALIASES edge is the direct answer. Where there is none, the node may be one ADR 0071
      // MINTED at a barrel for a name the barrel republishes — a real node with the right name and
      // nothing behind it. Resolve that name through the barrel's OWN imports, which is what the
      // IMPORTS rule above already does for these same nodes.
      const next =
        graph.getNeighbors(current, 'downstream', 'ALIASES' as EdgeType)[0]?.targetId ??
        this.resolveSymbolUnique(name, `${current.slice(0, sep)}::unit`, unitImports, unitSymbols);

      if (!next || seen.has(next) || !graph.hasNode(next)) return current;
      seen.add(next);
      current = next;
    }
  }

  /**
   * The id of `member` on `typeName`, following EXTENDS when the type inherits it. Null if nothing
   * in the chain declares it.
   *
   * Inheritance is not an extra: mentorseed's `CoreDatabaseManager extends BaseDatabaseManager`, and
   * `query` is declared on the PARENT — so 281 of the dangling edges resolve to a type that really
   * has the method and really does not declare it. Stopping at the first class would have refused
   * every one of them and looked like the safety rail working.
   *
   * Bounded by `seen`, which only grows, so a cyclic heritage chain stops rather than looping.
   */
  private memberOfType(
    graph: ConducksAdjacencyList,
    typeId: string,
    typeName: string,
    member: string,
    unitImports: Map<string, string[]>,
    unitSymbols: Map<string, Map<string, string>>,
  ): string | null {
    const seen = new Set<string>();
    let currentId: string | null = typeId;
    let currentName = typeName;

    while (currentId && !seen.has(currentId)) {
      seen.add(currentId);
      const candidate = `${currentId.slice(0, currentId.lastIndexOf('::'))}::${currentName}.${member}`;
      if (graph.hasNode(candidate)) return candidate;

      // The TYPE may itself be a re-export. `const r = new Repo()` where the barrel says
      // `export { OrderRepo as Repo }` gives a type node that owns no members — the members live on
      // OrderRepo. Follow the alias before concluding the member does not exist.
      const typeAlias: string | undefined = graph.getNeighbors(currentId, 'downstream', 'ALIASES' as EdgeType)[0]?.targetId;
      if (typeAlias && graph.hasNode(typeAlias) && !seen.has(typeAlias)) {
        currentId = typeAlias;
        currentName = typeAlias.slice(typeAlias.lastIndexOf('::') + 2);
        continue;
      }

      const raw: string | undefined =
        graph.getNeighbors(currentId, 'downstream', 'EXTENDS' as EdgeType)[0]?.targetId;
      if (!raw) return null;

      // The heritage edge may still be a BARE NAME — this same pass resolves EXTENDS targets, and
      // whether it has done so yet depends on edge order. Resolving it here makes the answer
      // order-independent: without it the identical lookup succeeded 80 times and refused 226,
      // for the same type and the same member, which reads as a flaky rule rather than a wrong one.
      const parentId: string | null = graph.hasNode(raw)
        ? raw
        : this.resolveSymbolUnique(raw, `${currentId.slice(0, currentId.lastIndexOf('::'))}::unit`, unitImports, unitSymbols);
      if (!parentId || !graph.hasNode(parentId)) return null;
      currentId = parentId;
      currentName = parentId.slice(parentId.lastIndexOf('::') + 2);
    }
    return null;
  }

  /**
   * The declared return type of `Owner.method`, lowercased, or null.
   *
   * Reads `dna.returns` off the callee node, which is on the SKELETON and therefore survives a
   * shallow load. Refuses in three cases, each of which would otherwise be a guess: the callee is
   * not in the graph, it declares no return type, or the declared type is a shape rather than a
   * name (`Promise<Foo>`, `Foo | null`, `Foo[]`). A generic wrapper is not the type of the value —
   * unwrapping one is inference, and ADR 0070 refuses it.
   */
  private returnTypeOfCall(
    graph: ConducksAdjacencyList,
    callTarget: string | undefined,
    callerFile: string,
    unitImports: Map<string, string[]>,
    unitSymbols: Map<string, Map<string, string>>,
  ): string | undefined {
    if (!callTarget || !callTarget.includes('.')) return undefined;
    // The direct id first: a singleton's factory sits in the same file as the variable it produces,
    // so `<declaring file>::<Owner>.<method>` is usually the node outright and needs no lookup.
    const sameFile = `${callerFile}::${callTarget}`;
    const calleeId = graph.hasNode(sameFile)
      ? sameFile
      : unitSymbols.get(`${callerFile}::unit`)?.get(callTarget)
        ?? this.resolveSymbolUnique(callTarget, `${callerFile}::unit`, unitImports, unitSymbols);
    if (!calleeId) return undefined;

    const calleeProps = graph.getNode(calleeId)?.properties as any;
    const declared = (calleeProps?.declaredReturn ?? calleeProps?.dna?.returns) as string | undefined;
    if (!declared) return undefined;
    // A bare identifier only. Anything carrying `<`, `|`, `[` or a space is a constructed type.
    return /^[A-Za-z_$][\w$]*$/.test(declared) ? declared.toLowerCase() : undefined;
  }

  private resolveSymbol(targetId: string, sourceUnitId: string, imports: Map<string, string[]>, symbols: Map<string, Map<string, string>>): string | null {
    const lowerName = targetId.toLowerCase();
    const importedUnits = imports.get(sourceUnitId) || [];

    for (const unitId of importedUnits) {
      const candidates = symbols.get(unitId);
      if (!candidates) continue;

      const resolvedNodeId = candidates.get(lowerName);
      if (resolvedNodeId) {
        return resolvedNodeId;
      }
    }
    return null;
  }

  /**
   * Same lookup, but it REFUSES when more than one unit in the candidate set defines the name.
   *
   * Used for the depth-2 (through-a-barrel) set only. At depth 1 the candidate list is the file's
   * own import statement and first-match-wins is the behaviour every existing edge was resolved
   * under. At depth 2 the linker is inferring which of a barrel's own imports the binding came from,
   * and two answers there means the graph does not know — so it says nothing rather than picking.
   */
  private resolveSymbolUnique(targetId: string, sourceUnitId: string, imports: Map<string, string[]>, symbols: Map<string, Map<string, string>>): string | null {
    const lowerName = targetId.toLowerCase();
    let found: string | null = null;

    for (const unitId of imports.get(sourceUnitId) || []) {
      const resolvedNodeId = symbols.get(unitId)?.get(lowerName);
      if (!resolvedNodeId || resolvedNodeId === found) continue;
      if (found) return null;
      found = resolvedNodeId;
    }
    return found;
  }
}
