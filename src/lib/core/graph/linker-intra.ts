import { ConducksAdjacencyList } from './adjacency-list.js';
import { logger } from '@/lib/core/utils/logger.js';

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

  private static readonly RESOLVABLE_TYPES = new Set([
    'CALLS', 'CONSTRUCTS', 'TYPE_REFERENCE', 'ACCESSES'
  ]);

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

    // ── 2. Build sourceUnitId → importedUnitIds from IMPORTS edges ──────────
    const unitImports = new Map<string, string[]>();

    for (const edge of graph.getAllEdges()) {
      if (edge.type !== 'IMPORTS') continue;
      const list = unitImports.get(edge.sourceId);
      if (list) {
        list.push(edge.targetId);
      } else {
        unitImports.set(edge.sourceId, [edge.targetId]);
      }
    }

    // ── 3. Resolve unresolved edges ─────────────────────────────────────────
    const resolved: Array<{ id: string; newTargetId: string }> = [];

    for (const edge of graph.getAllEdges()) {
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
        const imports = unitImports.get(sourceUnitId);
        if (imports) {
          for (const importedUnit of imports) {
            const candidate = unitSymbols.get(importedUnit)?.get(bareName);
            if (candidate) {
              resolvedId = candidate;
              break;
            }
          }
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
}
