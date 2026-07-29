import { ConducksAdjacencyList } from "./adjacency-list.js";

/**
 * Conducks — 3-Tier Import Resolver
 *
 * Resolves import edges with per-language semantics and confidence scores.
 *
 * Tier 1 (0.95): Same-file symbol — the imported symbol is defined in the same file.
 * Tier 2 (0.9 / 0.85): Import-scoped — match source path against graph, then resolve
 *   named / namespace / default import semantics.
 * Tier 3 (0.5): Global registry fallback — fuzzy match symbol name across all exports.
 */

export type ImportKind = 'named' | 'namespace' | 'default';

export interface ImportResolution {
  targetId: string;
  confidence: number; // 0–1
  tier: 1 | 2 | 3;
}

/**
 * Language family per file extension. An import in one family must never resolve
 * to a symbol in another (a TS `import` cannot bind to a `.rs`/`.go`/`.py` file).
 * Unknown extensions map to `undefined` and are never blocked (fail-open).
 */
const LANGUAGE_FAMILY: Record<string, string> = {
  ts: 'web', tsx: 'web', js: 'web', jsx: 'web', mjs: 'web', cjs: 'web', mts: 'web', cts: 'web',
  py: 'py', pyi: 'py',
  go: 'go',
  rs: 'rs',
  java: 'jvm', kt: 'jvm',
  cs: 'dotnet',
  cpp: 'cfam', cc: 'cfam', hpp: 'cfam', h: 'cfam', c: 'cfam',
  php: 'php', rb: 'ruby', swift: 'swift',
};

function familyOf(fileOrId: string): string | undefined {
  const file = fileOrId.split('::')[0];
  const m = /\.([a-z0-9]+)$/i.exec(file);
  return m ? LANGUAGE_FAMILY[m[1].toLowerCase()] : undefined;
}

/** True unless both files have a known, differing language family. */
export function sameFamily(sourceFileId: string, targetFileId: string): boolean {
  const a = familyOf(sourceFileId);
  const b = familyOf(targetFileId);
  if (a && b && a !== b) return false;
  return true;
}

/**
 * Detect the kind of import from the raw import text.
 *
 * Examples:
 *   `import { A, B } from './foo'`   → named
 *   `import * as X from './bar'`     → namespace
 *   `import X from './baz'`          → default
 *   `import './side-effect'`         → default (no binding)
 */
function detectImportKind(importText?: string): ImportKind {
  if (!importText) return 'default';
  if (/\*\s+as\s+\w+/.test(importText)) return 'namespace';
  if (/\{[^}]+\}/.test(importText)) return 'named';
  return 'default';
}

export class ImportResolver {
  constructor(private readonly graph: ConducksAdjacencyList) {}

  /**
   * Resolve an import to a graph node.
   *
   * @param sourceFileId  - The node ID of the import node (used to derive the file path)
   * @param importSource  - The raw source path string from the import (e.g. `./utils.js`)
   * @param symbolName    - The specific symbol being imported, if any
   * @param importText    - The full import statement text, used to detect import kind
   * @param resolvedCandidates - Pre-computed list of candidate absolute paths to check
   *   (caller is responsible for expanding extensions, index files, etc.)
   */
  public resolve(
    sourceFileId: string,
    importSource: string,
    symbolName?: string,
    importText?: string,
    resolvedCandidates?: string[]
  ): ImportResolution | null {
    const importKind = detectImportKind(importText);

    // Tier 1: Same-file symbol
    if (symbolName) {
      const tier1 = this.resolveSameFile(sourceFileId, symbolName);
      if (tier1) return tier1;
    }

    // Tier 2: Import-scoped resolution (language-family scoped)
    const tier2 = this.resolveByPath(sourceFileId, resolvedCandidates ?? [], symbolName, importKind);
    if (tier2) return tier2;

    // Tier 3: Global registry fallback (language-family scoped)
    if (symbolName) {
      return this.resolveGlobal(sourceFileId, symbolName);
    }

    return null;
  }

  // ---------------------------------------------------------------------------
  // Tier 1 — Same-file symbol (confidence 0.95)
  // ---------------------------------------------------------------------------

  private resolveSameFile(sourceFileId: string, symbolName: string): ImportResolution | null {
    // Derive the file path from the source node ID.
    // Convention: "<filePath>::<symbolName>" or "<filePath>::unit"
    const colonIdx = sourceFileId.indexOf('::');
    const filePrefix = colonIdx !== -1 ? sourceFileId.slice(0, colonIdx) : sourceFileId;

    const candidateId = `${filePrefix}::${symbolName.toLowerCase()}`;
    if (this.graph.getNode(candidateId)) {
      return { targetId: candidateId, confidence: 0.95, tier: 1 };
    }
    return null;
  }

  // ---------------------------------------------------------------------------
  // Tier 2 — Import-scoped resolution (confidence 0.9 / 0.85)
  // ---------------------------------------------------------------------------

  private resolveByPath(
    sourceFileId: string,
    candidates: string[],
    symbolName: string | undefined,
    importKind: ImportKind
  ): ImportResolution | null {
    for (const candidate of candidates) {
      // Never bind across language families (TS import → .rs/.go/.py file, etc.)
      if (!sameFamily(sourceFileId, candidate)) continue;
      const base = candidate.toLowerCase();

      // Named import: prefer the specific symbol node, fall back to unit
      if (importKind === 'named' && symbolName) {
        const symbolId = `${base}::${symbolName.toLowerCase()}`;
        if (this.graph.getNode(symbolId)) {
          return { targetId: symbolId, confidence: 0.9, tier: 2 };
        }
        const unitId = `${base}::unit`;
        if (this.graph.getNode(unitId)) {
          return { targetId: unitId, confidence: 0.9, tier: 2 };
        }
      }

      // Namespace import (* as X): always target the unit node
      if (importKind === 'namespace') {
        const unitId = `${base}::unit`;
        if (this.graph.getNode(unitId)) {
          return { targetId: unitId, confidence: 0.9, tier: 2 };
        }
      }

      // Default import: target the unit node at reduced confidence
      if (importKind === 'default') {
        const unitId = `${base}::unit`;
        if (this.graph.getNode(unitId)) {
          return { targetId: unitId, confidence: 0.85, tier: 2 };
        }
      }
    }

    return null;
  }

  // ---------------------------------------------------------------------------
  // Tier 3 — Global registry fallback (confidence 0.5)
  // ---------------------------------------------------------------------------

  private resolveGlobal(sourceFileId: string, symbolName: string): ImportResolution | null {
    const lowerName = symbolName.toLowerCase();
    const candidates: string[] = [];

    // This used to walk EVERY node in the graph to find the ones whose name matched, and it runs
    // once per unresolved import — O(imports x nodes). The graph already indexes nodes by name, so
    // the same answer is one map lookup plus a walk of the handful of nodes that share the name.
    for (const nodeId of this.graph.getNodeIdsByLowerName(lowerName)) {
      const node = this.graph.getNode(nodeId);
      if (!node) continue;

      // Only consider exported symbols
      if (!node.properties?.isExport) continue;

      // Never bind across language families (a TS symbol cannot import a Rust/Go/Python one)
      if (!sameFamily(sourceFileId, node.id)) continue;

      candidates.push(node.id);
    }

    if (candidates.length === 1) {
      return { targetId: candidates[0], confidence: 0.5, tier: 3 };
    }

    // Multiple matches — too ambiguous, skip
    return null;
  }
}
