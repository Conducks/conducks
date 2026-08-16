import { ConducksReflector } from "@/lib/core/parsing/reflector.js";
import { AnalyzeContext } from "@/lib/core/parsing/context.js";
import { SynapseRegistry } from "@/lib/core/registry/synapse-registry.js";
import { ConducksGraph } from "@/lib/core/graph/graph-engine.js";
import { sameFamily } from "@/lib/core/graph/import-resolver.js";
import { canonicalize } from "@/lib/core/utils/index.js";
import { ConducksComponent } from "@/contracts/index.js";
import { ecosystemId, externalNodeProps } from "@/lib/core/graph/external-nodes.js";
import { CanonicalKind, CanonicalRank } from "@/lib/core/parsing/taxonomy.js";
import path from "node:path";

/**
 * A self-import: an import/re-export whose specifier resolves back to its own file — e.g.
 * `export * from './self'` or an `@/alias` pointing at the current file. The resolver often can't
 * bind these (they'd be a self-edge), so they vanish; detect them here so the audit can flag ARCH-4.
 *
 * GENERAL (any language): a RELATIVE specifier is resolved against the file's dir and compared
 * exactly — no heuristic. LANGUAGE-CENTERED (TS/JS convention): the `@/` path alias maps to the
 * project `src/` root; resolve it against the file's own `src/`-relative path and compare exactly.
 * Other languages' alias schemes would add their own branch here (or, better, be pre-resolved by
 * their language plugin's import resolver).
 */
function isSelfImportSpecifier(specifier: string, filePath: string): boolean {
  const noExt = (p: string) => p.replace(/\.(tsx?|jsx?|py)$/i, "").replace(/\\/g, "/");
  const self = noExt(filePath);
  if (specifier.startsWith(".")) return noExt(path.resolve(path.dirname(filePath), specifier)) === self;
  if (specifier.startsWith("@/")) {
    const rel = self.match(/\/src\/(.+)$/);           // TS/JS: @/x === <src>/x
    return rel ? rel[1] === specifier.slice(2) : false;
  }
  return false;
}

/** One file's induction result as handed back by the WorkerPool. */
export interface InductionResult {
  success: boolean;
  path: string;
  spectrum?: any;
}

/**
 * Conducks — Reflection Pipeline
 *
 * todo03 Phase 5 A1: extracted out of AnalyzeOrchestrator.analyze()'s wave loop, which inlined "turn
 * one reflected file's spectrum into graph nodes/edges" inside the same method that also chunks
 * files, dispatches the WorkerPool, and flushes to the vault.
 *
 * This is the module doc's "final resolution pass where imports become real edges" (see
 * docs/modules/domain/analysis/orchestrator/MODULE.md): a cross-file reference cannot be resolved
 * while parsing because the target may not be parsed yet, so the reflector seeds a raw specifier and
 * this pipeline resolves it once `allPaths` is known — self-import, external boundary (ADR 0012), or
 * an in-repo NEURAL:: / BIND:: edge (ADR 0016 for the isTypeOnly tag).
 */
export class ReflectionPipeline {
  constructor(
    private registry: SynapseRegistry<ConducksComponent>,
    private reflector: ConducksReflector
  ) {}

  /**
   * Ingests one induction result: local symbols via `ConducksGraph.ingestSpectrum`, then every
   * `IMPORTS` relationship it carries into a self-edge, a boundary DEPENDS_ON edge, a NEURAL::
   * cross-file edge, or a per-binding BIND:: edge. No-ops silently for a failed/empty result — the
   * caller already filters those, this mirrors the same guard for direct callers.
   */
  public apply(
    res: InductionResult,
    opts: {
      graph: ConducksGraph;
      context: AnalyzeContext;
      allPaths: string[];
      projectMap: Map<string, string>;
      workspaceRoot: string;
      useShallowMode: boolean;
    }
  ): void {
    if (!res.success || !res.spectrum) return;

    const { graph, context, allPaths, projectMap, workspaceRoot, useShallowMode } = opts;
    const filePath = canonicalize(res.path);
    const unitId = `${filePath}::unit`;
    const projectRoot = projectMap.get(res.path) || workspaceRoot;
    const rootId = `repository::${path.basename(projectRoot).toLowerCase()}`;

    // 3.1 Local Induction (Symbols)
    graph.ingestSpectrum(res.path, res.spectrum, useShallowMode, unitId, rootId);

    // 3.2 Global Neural Binding (Imports -> Units)
    const provider = this.registry.getProvider(res.path);
    for (const rel of res.spectrum.relationships) {
      if (rel.type === 'IMPORTS' && rel.metadata?.isRaw) {
        const specifier = rel.metadata.specifier;
        // Each branch rebuilds `properties` by hand rather than spreading the relationship's
        // metadata, so anything the reflector adds has to be carried here explicitly or it is
        // silently dropped at the edge — which is exactly what happened to `line` (ADR 0099).
        const line = (rel.metadata.line as number) ?? 0;
        const emitSelfEdge = () => graph.getGraph().addEdge({
          id: `SELF::${unitId}`, sourceId: unitId, targetId: unitId,
          type: 'IMPORTS', confidence: 1.0, properties: { specifier, selfImport: true, line }
        });
        // Self-import (e.g. `export * from './self'`): emit a durable unit → unit self-edge so
        // the audit flags it as ARCH-4, and skip normal linkage (it would never bind to self).
        // Keyed strictly off the SPECIFIER (a relative or `@/` path pointing at this file) — NOT
        // off resolution, because the fuzzy resolver matches a bare package name (`context`,
        // `routing`) to a same-named local file and would report a false self-import.
        if (isSelfImportSpecifier(specifier, filePath)) { emitSelfEdge(); continue; }

        // System 2 (ADR 0012): an external import (stdlib/dependency) is a BOUNDARY. It never
        // resolves to an in-repo node, and during streaming no ECOSYSTEM node exists yet, so the
        // old code dropped it entirely — the dependency surface was invisible. Emit a durable
        // boundary node + a DEPENDS_ON edge tagged with origin/package: the supply-chain surface.
        // RESOLUTION BEATS CLASSIFICATION. `classifyOrigin` is a pure function over the specifier
        // string, and its vocabulary is npm's: a bare word that is not a Node core module is a
        // third-party dependency. Every bare PYTHON import is a bare word — `foundation`,
        // `core.errors` — so the whole in-repo module tree of a Python project classified as
        // external, this branch fired, and the language's own resolver was NEVER CONSULTED.
        // Measured on the frozen scraper subject: all of `foundation.*` sat in
        // `DEPENDS_ON ecosystem::`, and `impact` answered 0 callers for a function with 10
        // (todo44#P6 — the benchmark's headline finding).
        //
        // Only the provider's own SPECIALIZED resolver may overturn the classification — it answers
        // with an exact module-path match or not at all. The generic fallback chain (basename,
        // prefix) stays out of this: ADR 0070 records what fuzzy matching does to a bare specifier.
        const origin = rel.metadata.origin;
        const specialized = origin && origin !== 'internal'
          ? provider?.resolveImport?.(specifier, res.path, allPaths)
          : undefined;
        if (origin && origin !== 'internal' && !(specialized && sameFamily(res.path, specialized))) {
          const pkg = (rel.metadata.package as string | null) || specifier.replace(/^node:/, '');
          const boundaryId = ecosystemId(pkg);
          if (!graph.getGraph().getNode(boundaryId)) {
            graph.getGraph().addNode({
              id: boundaryId, label: 'ECOSYSTEM', isShallow: true,
              properties: {
                // Shape and parent come from `external-nodes.ts` — the one place that defines
                // what an external node is (todo25#P12). This was the THIRD of four sites setting
                // `parentId: 'ecosystem::global'` by hand, which is why ADR 0057 was a hunt.
                ...externalNodeProps({ name: pkg, canonicalKind: 'ECOSYSTEM', canonicalRank: CanonicalRank[CanonicalKind.ECOSYSTEM] }),
                origin, package: origin === 'dependency' ? pkg : null, isBoundary: true,
              } as any,
            });
          }
          graph.getGraph().addEdge({
            id: `DEP::${unitId}->${boundaryId}`, sourceId: unitId, targetId: boundaryId,
            type: 'DEPENDS_ON', confidence: 1.0,
            properties: { specifier, origin, package: rel.metadata.package, line },
          });
          continue;
        }

        const linkage = this.reflector.imports.link(specifier, res.path, allPaths, provider, context);
        // B2 fix: guard both linkage and targetId before accessing fields
        // Never bind across language families (e.g. a .py import resolving to a .tsx/.go file by basename).
        if (linkage && linkage.targetId && sameFamily(res.path, linkage.targetId)) {
          graph.getGraph().addEdge({
            id: `NEURAL::${unitId}->${linkage.targetId}`,
            sourceId: unitId,
            targetId: linkage.targetId.includes('::') ? linkage.targetId : `${linkage.targetId}::unit`,
            type: linkage.type,
            confidence: 1.0,
            // isTypeOnly (ADR 0016): erased by the compiler, so excluded from cycle/hub findings.
            properties: { specifier, origin: rel.metadata.origin, package: rel.metadata.package, isTypeOnly: rel.metadata.isTypeOnly === true, line }
          });
        }
      }

      // Per-binding IMPORTS: file::unit → target_file::unit::bindingName
      if (rel.type === 'IMPORTS' && rel.metadata?.isRawBinding) {
        const specifier = rel.metadata.specifier;
        const line = (rel.metadata.line as number) ?? 0;
        const bindingName = rel.metadata.bindingName as string;
        const linkage = this.reflector.imports.link(specifier, res.path, allPaths, provider, context);
        if (linkage && linkage.type === 'IMPORTS' && linkage.targetId && sameFamily(res.path, linkage.targetId)) {
          const fileBase = linkage.targetId.includes('::') ? linkage.targetId.split('::')[0] : linkage.targetId;
          const targetNodeId = `${fileBase}::${bindingName}`;
          graph.getGraph().addEdge({
            id: `BIND::${unitId}->${targetNodeId}`,
            sourceId: unitId,
            targetId: targetNodeId,
            type: 'IMPORTS',
            confidence: 0.9,
            properties: { specifier, bindingName, origin: rel.metadata.origin, package: rel.metadata.package, isTypeOnly: rel.metadata.isTypeOnly === true, line }
          });
        }
      }
    }
  }
}
