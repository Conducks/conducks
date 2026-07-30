import { ConducksAdjacencyList } from './adjacency-list.js';
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

  // EXTENDS and IMPLEMENTS belong here for the same reason the other four do: `implements Foo` names
  // a symbol the file IMPORTED, which is exactly what this linker resolves. Leaving them out meant a
  // heritage target stayed bare forever, and virtual induction then materialised a phantom node for
  // it — so the graph held BOTH `contracts/types.ts::conduckscomponent` (real, gravity 0.022) and a
  // bare `conduckscomponent` (invented, gravity 0), and any query keyed on one silently missed the
  // edges pointing at the other. A genuinely external parent (`extends Error`) still falls through
  // to induction, which is where an external symbol belongs (ADR 0053).
  private static readonly RESOLVABLE_TYPES = new Set([
    'CALLS', 'CONSTRUCTS', 'TYPE_REFERENCE', 'ACCESSES', 'EXTENDS', 'IMPLEMENTS'
  ]);

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
