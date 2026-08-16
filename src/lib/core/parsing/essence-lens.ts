import { EXTERNAL_ROOT } from "@/lib/core/graph/index.js";
import { PrismSpectrum } from "@/lib/core/parsing/prism-core.js";
import { mapToCanonical } from "@/contracts/index.js";
import path from "node:path";

/**
 * Conducks — Essence Lens (Phase 5.2) 💎
 * 
 * Specialized lens for environment manifests and project-level 
 * essence extraction (dependencies, frameworks, configs).
 */
export class EssenceLens {
  /**
   * The package NAMES a manifest declares, for import resolution — not for the graph.
   *
   * `refract()` already reads the same manifests, but it runs in step 3 of the pulse, AFTER the
   * wave that resolves imports. So at the moment `ImportProcessor.resolve()` asks
   * "is `next` an external package?", nothing had ever told it about any package, and the answer was
   * always no. `context.registerExternalPackage()` had no production caller at all.
   *
   * The cost of that was not a missing edge but a WRONG one. With step 2 dead, a bare specifier fell
   * through to the basename fallback, and on subject-b `next/headers` matched the project's OWN
   * `packages/core/security/server/headers.ts` and `vitest/config` matched its `config.ts` — six
   * import edges pointing at project files that have nothing to do with those packages. ADR 0070
   * made this argument for aliases; this is the same failure one specifier-shape over.
   *
   * Returns names only, because that is all resolution needs. Versions and node creation stay in
   * `refract()`, which is the one place that builds ECOSYSTEM nodes.
   */
  public declaredDependencies(filePath: string, source: string): string[] {
    const fileName = path.basename(filePath);
    try {
      if (fileName === 'package.json') {
        const pkg = JSON.parse(source);
        return Object.keys({
          ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}), ...(pkg.peerDependencies || {}),
        });
      }
      if (fileName === 'requirements.txt') {
        return source.split(/\r?\n/)
          .map(l => l.trim())
          .filter(l => l && !l.startsWith('#'))
          .map(l => l.split(/[<>=!~;[\s]/)[0].trim())
          .filter(Boolean);
      }
    } catch { /* a malformed manifest declares nothing; `refract` reports the parse failure */ }
    return [];
  }

  /**
   * Refracts a manifest file into a Spectrum of external dependencies.
   */
  public refract(filePath: string, source: string): PrismSpectrum {
    const spectrum: PrismSpectrum = {
      nodes: [],
      relationships: [],
      metadata: { isEssence: true, language: 'manifest' }
    };

    const fileName = path.basename(filePath);

    if (fileName === 'package.json') {
      console.error(`[EssenceLens] Parsing package.json at ${filePath}`);
      this.parsePackageJson(filePath, source, spectrum);
    } else if (fileName === 'requirements.txt') {
      console.error(`[EssenceLens] Parsing requirements.txt at ${filePath}`);
      this.parseRequirementsTxt(filePath, source, spectrum);
    }

    return spectrum;
  }

  /**
   * Conducks — Framework Identification
   * 
   * Detects the primary app framework from manifest content.
   */
  public detectFramework(fileName: string, source: string): string | null {
    if (fileName === 'requirements.txt') {
      if (source.includes('fastapi')) return 'fastapi';
      if (source.includes('flask')) return 'flask';
      if (source.includes('django')) return 'django';
    } else if (fileName === 'package.json') {
      try {
        const pkg = JSON.parse(source);
        const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
        if (deps['next']) return 'nextjs';
        if (deps['express']) return 'express';
      } catch (err) {
        if (process.env.CONDUCKS_DEBUG === '1') {
          console.error('[EssenceLens] JSON parse failed:', err);
        }
        return null;
      }
    } else if (fileName.endsWith('.py')) {
      if (source.includes('from fastapi import') || source.includes('import fastapi')) return 'fastapi';
      if (source.includes('from flask import') || source.includes('import flask')) return 'flask';
    }
    return null;
  }

  /** Declared npm dependencies, which is what separates a third-party import from a project one. */
  private parsePackageJson(filePath: string, source: string, spectrum: PrismSpectrum): void {
    try {
      const pkg = JSON.parse(source);
      const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
      console.error(`[EssenceLens]   -> Found ${Object.keys(deps).length} dependencies.`);

      for (const [name, version] of Object.entries(deps)) {
        const canonical = mapToCanonical('external_dependency');
        spectrum.nodes.push({
          name,
          kind: 'external_dependency' as any,
          canonicalKind: canonical.kind,
          canonicalRank: canonical.rank,
          range: { start: { line: 1, column: 0 }, end: { line: 1, column: 0 } },
          filePath: filePath,
          isExport: true,
          metadata: {
            // Parented to the ecosystem root, so the containment tree has ONE top (ADR 0057).
            // These carried no parent at all, leaving 32 external packages floating: unreachable by
            // any walk, and absent from any answer to "what is under X". The constant lives in
            // `external-nodes.ts` — this is a SpectrumNode, so it takes the parent rather than the
            // whole property block (todo25#P12).
            parentId: EXTERNAL_ROOT,
            ecosystem: 'npm',
            version: version as string,
            isExternal: true
          }
        });

        // Link the manifest file to the dependency
        spectrum.relationships.push({
          sourceName: 'unit',
          targetName: name, // Will be resolved during Neural Binding or via special lookup
          type: 'DEPENDS_ON' as any,
          confidence: 1.0,
          metadata: { ecosystem: 'npm', version }
        });
      }
    } catch (err) {
      console.error(`[EssenceLens] Failed to parse package.json at ${filePath}:`, err);
    }
  }

  /** The same for Python: a declared requirement is a dependency, not a missing local module. */
  private parseRequirementsTxt(filePath: string, source: string, spectrum: PrismSpectrum): void {
    const lines = source.split('\n');
    console.error(`[EssenceLens]   -> Total lines in requirements.txt: ${lines.length}`);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      // Basic regex for PEP 508 / requirements.txt
      // Matches: name==version, name>=version, name
      const match = trimmed.match(/^([^<>==\s]+)\s*([<>==\s]*.*)$/);
      if (match) {
        const name = match[1];
        const version = match[2].trim() || 'latest';

        const canonical = mapToCanonical('external_dependency');
        spectrum.nodes.push({
          name,
          kind: 'external_dependency' as any,
          canonicalKind: canonical.kind,
          canonicalRank: canonical.rank,
          range: { start: { line: 1, column: 0 }, end: { line: 1, column: 0 } },
          filePath: filePath,
          isExport: true,
          metadata: {
            parentId: EXTERNAL_ROOT,   // same as npm above (ADR 0057)
            ecosystem: 'pip',
            version,
            isExternal: true
          }
        });

        spectrum.relationships.push({
          sourceName: 'unit',
          targetName: name,
          type: 'DEPENDS_ON' as any,
          confidence: 1.0,
          metadata: { ecosystem: 'pip', version }
        });
      }
    }
  }
}

export const essenceLens = new EssenceLens();
