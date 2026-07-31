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

      if (resolvedId) {
        graph.rebindEdgeTarget(edge, resolvedId);
        resolved.push({ id: edge.id, newTargetId: resolvedId });
      }
    }

    if (resolved.length > 0) {
      logger.info(`🛡️ [IntraLinker] Resolved ${resolved.length} cross-file symbol references.`);
    }

    return resolved;
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
}
