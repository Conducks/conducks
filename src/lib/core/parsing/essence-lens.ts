import { PrismSpectrum } from "@/lib/core/persistence/prism-core.js";
import path from "node:path";

/**
 * Conducks — Essence Lens (Phase 5.2) 💎
 * 
 * Specialized lens for environment manifests and project-level 
 * essence extraction (dependencies, frameworks, configs).
 */
export class EssenceLens {
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
      } catch { return null; }
    } else if (fileName.endsWith('.py')) {
      if (source.includes('from fastapi import') || source.includes('import fastapi')) return 'fastapi';
      if (source.includes('from flask import') || source.includes('import flask')) return 'flask';
    }
    return null;
  }

  private parsePackageJson(filePath: string, source: string, spectrum: PrismSpectrum): void {
    try {
      const pkg = JSON.parse(source);
      const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
      console.error(`[EssenceLens]   -> Found ${Object.keys(deps).length} dependencies.`);

      for (const [name, version] of Object.entries(deps)) {
        spectrum.nodes.push({
          name,
          kind: 'external_dependency' as any,
          range: { start: { line: 1, column: 0 }, end: { line: 1, column: 0 } },
          filePath: filePath,
          isExport: true,
          metadata: {
            ecosystem: 'npm',
            version: version as string,
            isExternal: true
          }
        });

        // Link the manifest file to the dependency
        spectrum.relationships.push({
          sourceName: 'global',
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

        spectrum.nodes.push({
          name,
          kind: 'external_dependency' as any,
          range: { start: { line: 1, column: 0 }, end: { line: 1, column: 0 } },
          filePath: filePath,
          isExport: true,
          metadata: {
            ecosystem: 'pip',
            version,
            isExternal: true
          }
        });

        spectrum.relationships.push({
          sourceName: 'global',
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
