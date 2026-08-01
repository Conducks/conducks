import { describe, it, expect } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { LAYER_FRAGMENTS, ALLOWED_DEPENDENCIES } from '@/lib/domain/governance/sentinel-rules.js';

/**
 * ADR 0005 (the layer contract) enforced against THIS repository, per ADR 0048.
 *
 * Two gates already claim to do this and neither can:
 *
 *   - the `layer_boundaries` sentinel rule reads IMPORTS edges in the graph, so it sees only what the
 *     parser captured. Four runtime `import()` calls violated the contract while it reported clean —
 *     including `pulse-worker.ts` importing the reflector, where a comment explains that the dynamic
 *     form was chosen SPECIFICALLY to avoid a static core→domain edge. The dependency is real; only
 *     its visibility was removed.
 *   - `layer-contract.test.ts` asserts the rule is enabled and configured. That is necessary and it
 *     cannot detect a live violation, because it never looks at this repo's source.
 *
 * This gate reads the files. No graph, no vault, no engine — so nothing the parser missed can defeat
 * it, and it fails in the suite everyone already runs rather than in a separate command.
 *
 * WHAT IT CANNOT SEE, stated rather than implied: a computed specifier — `import(someVariable)` — is
 * not resolvable by reading text, and `require()` is not checked because this codebase is ESM. A gate
 * that claimed otherwise would be the same failure it exists to catch.
 */
const SRC = path.resolve('src');

const layerOf = (file: string): string | null => {
  const norm = file.replace(/\\/g, '/');
  for (const [layer, fragment] of LAYER_FRAGMENTS) if (norm.includes(fragment)) return layer;
  return null;
};

const walk = (dir: string, out: string[] = []): string[] => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith('.ts')) out.push(full);
  }
  return out;
};

/** `@/x` is this repo's alias for `src/x`; a relative specifier resolves against the importer. */
const resolveSpecifier = (fromFile: string, spec: string): string | null => {
  if (spec.startsWith('@/')) return path.join(SRC, spec.slice(2));
  if (spec.startsWith('.')) return path.resolve(path.dirname(fromFile), spec);
  return null; // a bare package — external, not our contract's business
};

/**
 * NO GRANTED EXCEPTIONS — and the list is kept, empty, rather than deleted.
 *
 * There was exactly one: `pulse-worker.ts` importing the reflector, a core -> domain edge. It was
 * defended as unavoidable — the worker is a PROCESS ENTRY POINT, spawned standalone, so nothing can
 * be injected across the process boundary. Making the import dynamic had hidden it from the rule
 * without removing it.
 *
 * The defence was answering the wrong question. The reflector imported NOTHING from domain: every
 * one of its dependencies was core, contracts, or a node builtin. It was not a domain module that
 * core needed — it was a CORE module filed in the wrong folder. Moving it removed the edge outright,
 * with no injection, no port, and no exception (ADR 0093).
 *
 * The array stays so that granting the next one is a visible, reviewable diff rather than a new
 * mechanism invented under pressure.
 */
const GRANTED_EXCEPTIONS: ReadonlyArray<{ file: string; spec: string; why: string }> = [];

const isGranted = (v: { file: string; spec: string }) =>
  GRANTED_EXCEPTIONS.some(e => v.file.replace(/\\/g, '/').endsWith(e.file) && v.spec === e.spec);

interface Violation { from: string; to: string; file: string; spec: string; kind: 'static' | 'dynamic'; }

const collect = (): Violation[] => {
  const out: Violation[] = [];
  for (const file of walk(SRC)) {
    const from = layerOf(file);
    if (!from) continue;
    const src = fs.readFileSync(file, 'utf8');

    const seen: Array<{ spec: string; kind: 'static' | 'dynamic' }> = [];
    // `import type` is EXCLUDED on purpose: TypeScript erases it, so it creates no runtime edge and
    // constrains nothing at execution time. Excluding it silently would be the proxy problem again.
    const staticRe = /^\s*import\s+(type\s+)?[^;]*?from\s+['"]([^'"]+)['"]/gm;
    const dynamicRe = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
    let m: RegExpExecArray | null;
    while ((m = staticRe.exec(src))) if (!m[1]) seen.push({ spec: m[2], kind: 'static' });
    while ((m = dynamicRe.exec(src))) seen.push({ spec: m[1], kind: 'dynamic' });

    for (const { spec, kind } of seen) {
      const target = resolveSpecifier(file, spec);
      if (!target) continue;
      const to = layerOf(target);
      if (!to || to === from) continue;
      if (!(ALLOWED_DEPENDENCIES[from] || []).includes(to)) {
        const v = { from, to, file: path.relative(process.cwd(), file), spec, kind };
        if (!isGranted(v)) out.push(v as Violation);
      }
    }
  }
  return out;
};

const format = (v: Violation) => `${v.from} -> ${v.to}  (${v.kind})  ${v.file}  imports  ${v.spec}`;

describe('layer contract, enforced against this repository', () => {
  it('has no forbidden STATIC import', () => {
    const bad = collect().filter(v => v.kind === 'static');
    expect(bad.map(format)).toEqual([]);
  });

  it('has no forbidden DYNAMIC import', () => {
    // This is the half the graph-based rule cannot see. It went red on four violations the day it
    // was written; if it is ever made to pass by deleting the check rather than the import, the
    // contract has been abandoned rather than met.
    const bad = collect().filter(v => v.kind === 'dynamic');
    expect(bad.map(format)).toEqual([]);
  });

  it('grants no exceptions at all', () => {
    // The list was ONE entry — `pulse-worker.ts` importing the reflector — defended as unavoidable
    // because a process entry point cannot be injected across a process boundary. That reasoning was
    // sound and irrelevant: the reflector imported nothing from domain, so it was a CORE module in
    // the wrong folder, and moving it removed the edge (ADR 0093).
    expect(GRANTED_EXCEPTIONS).toEqual([]);
  });

  it('would still grant a narrow exception rather than a broad one, if one were ever added', () => {
    // The mechanism is kept for the next real case, so this pins its SHAPE: an exception names one
    // file and one specifier. A entry that matched a whole directory, or omitted the specifier,
    // would be a suppression wearing a reason.
    for (const e of GRANTED_EXCEPTIONS as ReadonlyArray<{ file: string; spec: string; why: string }>) {
      expect(e.file).toMatch(/\.tsx?$/);
      expect(e.spec).toBeTruthy();
      expect(e.why.length).toBeGreaterThan(20);
    }
    // And the matcher must not treat an empty list as a licence: nothing is granted right now.
    expect(isGranted({ file: 'src/lib/core/parsing/pulse-worker.ts', spec: '@/lib/core/parsing/reflector.js' })).toBe(false);
  });

  it('actually scanned the source tree', () => {
    // Guards the failure mode ADR 0048 rule 3 names: a gate matching zero subjects reports clean and
    // is indistinguishable from full compliance.
    const files = walk(SRC).filter(f => layerOf(f));
    expect(files.length).toBeGreaterThan(150);
  });
});
