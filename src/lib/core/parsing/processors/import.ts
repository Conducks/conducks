import path from "node:path";
import { canonicalize } from "@/lib/core/utils/path-utils.js";
import { PrismSpectrum } from "@/lib/core/parsing/prism-core.js";
import { AnalyzeContext } from "@/lib/core/parsing/context.js";
import { ConducksProvider } from "@/lib/core/parsing/providers/base.js";

/**
 * Conducks — Structural Resolver (Unified Resolution) 🛡️ 🧬
 * 
 * High-fidelity module resolution. Resolves raw specifiers into 
 * absolute file paths using production-grade logic.
 */
export class ImportProcessor {
  /**
   * The canonical form of every project path, cached against the array it was built from.
   *
   * This Set used to be rebuilt INSIDE `resolve()`, which runs once per import specifier — so a
   * project of N files with M imports each paid N*M canonicalize calls over N paths. Measured on a
   * 2,948-file project that is roughly 70 million calls for work whose answer never changes during a
   * pulse, and it is why the per-file cost grew with project size instead of staying flat.
   *
   * Keyed by array IDENTITY, not by content: the orchestrator builds `allPaths` once per pulse and
   * hands the same reference to every unit, so identity is exact and free. A different array — a
   * second pulse, a different scope — misses and rebuilds, which is correct rather than stale.
   * WeakMap so the cache dies with the array and never pins a project's paths in memory.
   */
  private static canonicalCache = new WeakMap<string[], Set<string>>();

  /**
   * Project paths grouped by basename, for the fuzzy fallback.
   *
   * That fallback scanned every path in the project for each import it could not resolve exactly —
   * the SECOND linear scan per specifier, and the one that runs precisely for the imports the fast
   * paths already failed on. Grouping by basename once turns it into a map lookup plus a walk of the
   * few files that share a name. Cached the same way and for the same reason as the canonical set.
   */
  private static basenameCache = new WeakMap<string[], Map<string, string[]>>();

  private static basenameIndexFor(allPaths: string[]): Map<string, string[]> {
    let index = ImportProcessor.basenameCache.get(allPaths);
    if (!index) {
      index = new Map();
      for (const p of allPaths) {
        const base = path.basename(p);
        const bucket = index.get(base);
        if (bucket) bucket.push(p); else index.set(base, [p]);
      }
      ImportProcessor.basenameCache.set(allPaths, index);
    }
    return index;
  }

  private static canonicalSetFor(allPaths: string[]): Set<string> {
    let set = ImportProcessor.canonicalCache.get(allPaths);
    if (!set) {
      set = new Set(allPaths.map(p => canonicalize(p)));
      ImportProcessor.canonicalCache.set(allPaths, set);
    }
    return set;
  }

  /**
   * Conducks Resolution Algorithm:
   * 1. Resolve specifier relative to importer.
   * 2. Infer extensions/index files.
   * 3. Return Absolute Target Path.
   */
  public resolve(
    specifier: string, 
    importerPath: string, 
    allPaths: string[], 
    provider?: ConducksProvider, 
    context?: AnalyzeContext
  ): string | { name: string, kind: 'external_dependency' } | undefined {
    
    // Strip surrounding quotes (tree-sitter (string) nodes include them)
    specifier = specifier.replace(/^['"]|['"]$/g, '');

    // 1. Specialized Provider Resolution (Higher Priority)
    if (provider?.resolveImport) {
      const specialized = provider.resolveImport(specifier, importerPath, allPaths);
      if (specialized) return specialized;
    }

    // 2. External Package Check
    //
    // The package name is the FIRST TWO segments when the specifier is scoped, and the first one
    // otherwise. `@playwright/test` is one package; `@playwright` is not a package at all, so
    // splitting on the first `/` unconditionally meant a scoped package could never match, whatever
    // the manifest said. Same for `@vercel/analytics/next`, where the third segment is a subpath.
    //
    // This branch answers at PACKAGE level and is deliberately narrow, because package level is
    // coarser than what the graph already gets for free. Left to fall through, an unresolved
    // external specifier is induced as `lib::<pkg>::<symbol>` — a node per imported SYMBOL, which is
    // what makes "who uses `useState`" answerable at all. MEASURED on mentorseed (974 units) when
    // this branch was first made to fire for every declared dependency: nodes 5,997 -> 3,182 and
    // edges 19,014 -> 6,179, because every named external import collapsed into one package link.
    // The dangling COUNT fell 194 -> 99 and looked like a win; the dangling RATE went 1.02% -> 1.60%
    // and the graph had lost two thirds of itself. A count that improves while the rate worsens is
    // the shape of a denominator being destroyed, and it is why this is measured rather than
    // reasoned about.
    //
    // So a declared package is used to REFUSE the basename fallback in step 4, not to short-circuit
    // here. `declaredExternal` carries that one bit forward.
    const seg = specifier.split('/');
    const pkgName = specifier.startsWith('@') && seg.length >= 2 ? `${seg[0]}/${seg[1]}` : seg[0];
    const declaredExternal = !specifier.startsWith('.') && !!context?.isExternalPackage(pkgName);

    const dir = path.dirname(importerPath);

    // 3. Conducks Resolution Engine (Relative -> Absolute)
    if (specifier.startsWith('.')) {
      // For TypeScript ESM: imports use .js extension but files are .ts
      // Try both the specifier as-is and with .js stripped (enabling .ts resolution)
      const bases = [path.resolve(dir, specifier)];
      if (specifier.endsWith('.js')) {
        bases.push(path.resolve(dir, specifier.slice(0, -3)));
      }

      // Try exact, then extensions, then index files
      const candidates = [
        '', // Exact
        '.ts', '.tsx', '.js', '.jsx', // TS/JS
        '.py', '.go', '.rs', '.rb', '.java', '.cs', '.php', '.swift', '.c', '.cpp', // Polyglot
        '/index.ts', '/index.tsx', '/index.js' // Node-style indices
      ];

      const canonicalPaths = ImportProcessor.canonicalSetFor(allPaths);

      for (const absoluteBase of bases) {
        for (const ext of candidates) {
          const fullPath = absoluteBase + ext;
          const candidateCanonical = canonicalize(fullPath);
          if (canonicalPaths.has(candidateCanonical)) {
            return fullPath;
          }
        }
      }
    }

    // 3b. Alias specifiers (`@/x`, `~/x`).
    //
    // These are neither relative nor a bare package, so they fell straight past the branch above
    // into the basename fallback — which correctly refuses on `index.js` (24 files share it here),
    // leaving 817 dangling edges with ids like `@/registry/index.js::registry.audit.advise`. The
    // alias is resolved by SUFFIX rather than by reading tsconfig: the alias root is a project
    // convention (`@/* -> src/*` here) and matching the tail of a real path finds it without this
    // processor needing to know the mapping. Ambiguity refuses, same rule as everywhere else.
    if (/^[@~]\//.test(specifier)) {
      const tail = specifier.replace(/^[@~]\//, '');
      const bases = [tail];
      if (tail.endsWith('.js')) bases.push(tail.slice(0, -3));
      const exts = ['', '.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx', '/index.js'];
      const wanted = new Set<string>();
      for (const b of bases) for (const ext of exts) wanted.add(canonicalize(b + ext));

      let hit: string | undefined;
      for (const p of allPaths) {
        const canon = canonicalize(p);
        for (const w of wanted) {
          if (canon === w || canon.endsWith('/' + w)) {
            if (hit && hit !== p) return undefined;
            hit = p;
            break;
          }
        }
      }
      if (hit) return hit;

      // An alias that does not resolve here is not a bare word to keep guessing at. Its root is a
      // project convention (`@/* -> src/*`, or a workspace alias like `@/core -> ../packages/core`)
      // and when the suffix match above finds nothing, the target is either genuinely outside
      // `allPaths` (a sibling package/service this analysis was never pointed at) or a typo — never
      // a coincidence to resolve by basename. Falling through to the fuzzy fallback below matched
      // `@/core/registry/Registry`'s tail segment "Registry" against an unrelated in-scope file
      // (`Registry.test.ts`) whose basename happened to start with the same word, and every importer
      // of that alias then bound to it — 106 edges into one wrong file (ADR 0070). Refuse instead:
      // ADR 0055's rule — a node is a symbol, not a guess — applies here exactly as it does there.
      return undefined;
    }

    // 4. Fuzzy Module Fallback (For languages with less strict relative paths)
    //
    // UNIQUE MATCH ONLY. This used to return the first candidate in `allPaths` order, which is
    // arbitrary: in this repository alone 15 basenames are ambiguous, and `index.ts` occurs 24
    // times, `queries.ts` 13, `resolver.ts` 11. Resolving an unresolved `index` import that way is
    // right about one time in twenty-four, and the edge it writes is indistinguishable from a
    // correctly resolved one. Refusing costs an edge; guessing costs a WRONG edge, and a wrong
    // edge is what `impact` and `trace` then walk.
    //
    // A DECLARED dependency never reaches the fallback at all. `next/headers` has basename `headers`
    // and mentorseed owns a `packages/core/security/server/headers.ts`, so the fallback matched them
    // and wrote an IMPORTS edge from a Next.js import to the project's own file — `vitest/config`
    // onto `config.ts` the same way. Six such edges, each one a WRONG edge rather than a missing
    // one, which is the trade ADR 0070 already refused for aliases: the manifest says this specifier
    // names a package, so a file that happens to share its last segment is a coincidence, never a
    // resolution. Returning undefined hands it to induction, which mints `lib::<pkg>::<symbol>` and
    // keeps the symbol-level answer.
    if (declaredExternal) return undefined;

    const baseName = path.basename(specifier);
    const exact = ImportProcessor.basenameIndexFor(allPaths).get(baseName);
    if (exact && exact.length === 1) return exact[0];
    if (exact && exact.length > 1) return undefined;
    // Prefix match, same rule. The original returned the first path whose basename started with the
    // specifier's; it now collects and only answers when the answer is unambiguous. Short-circuits
    // on the second hit rather than scanning the rest.
    let prefixHit: string | undefined;
    for (const p of allPaths) {
      if (path.basename(p).startsWith(baseName)) {
        if (prefixHit) return undefined;
        prefixHit = p;
      }
    }
    return prefixHit;
  }

  /**
   * Final Neural Linkage (Post-Discovery Pass)
   */
  public link(
    specifier: string,
    callerPath: string,
    allPaths: string[],
    provider?: ConducksProvider,
    context?: AnalyzeContext
  ): { targetId: string, type: 'IMPORTS' | 'DEPENDS_ON' } | undefined {
    const resolved = this.resolve(specifier, callerPath, allPaths, provider, context);
    if (!resolved) return undefined;

    if (typeof resolved === 'object') {
      return { 
        targetId: `ECOSYSTEM::${resolved.name.toLowerCase()}`, 
        type: 'DEPENDS_ON' 
      };
    }

    return { 
      targetId: canonicalize(resolved), 
      type: 'IMPORTS' 
    };
  }
}
