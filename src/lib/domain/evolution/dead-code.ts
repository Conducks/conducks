import { ConducksAdjacencyList, NodeId, ConducksNode } from '@/lib/core/graph/adjacency-list.js';
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

      // 3. Stale Imports
      if (node.label === 'import_clause' || node.label === 'import_specifier') {
        const usage = graph.getNeighbors(node.id, 'downstream').filter(e => e.type === 'CALLS' || e.type === 'ACCESSES');
        if (usage.length === 0) {
          findings.push({
            type: 'STALE_IMPORT',
            symbol: node.properties.name,
            file: node.properties.filePath,
            message: `Imported symbol is never used in this file.`
          });
        }
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
