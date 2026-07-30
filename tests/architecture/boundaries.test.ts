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
 * The ONE granted exception, named rather than hidden (ADR 0048).
 *
 * `pulse-worker.ts` is a PROCESS ENTRY POINT that happens to live under core. It is spawned
 * standalone — worker thread, fork, or child process — so the reflector cannot be injected across
 * the process boundary; the worker must construct it. Making the import dynamic was the original
 * workaround, and it did not remove the dependency, only its visibility to the graph-based rule.
 *
 * This entry records the edge as ALLOWED and keeps it enforced: any other core → domain import,
 * static or dynamic, still fails. Removing the exception means moving the reflector into core or
 * inverting it behind a contracts-level port — both are real options and neither is free, which is
 * why this is a decision rather than a TODO.
 */
const GRANTED_EXCEPTIONS: ReadonlyArray<{ file: string; spec: string; why: string }> = [
  {
    file: 'src/lib/core/parsing/pulse-worker.ts',
    spec: '../../domain/analysis/reflector.js',
    why: 'process entry point; the reflector cannot cross a process boundary by injection',
  },
];

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

  it('still enforces the layer the one exception sits in', () => {
    // An exception that disabled the rule for its whole layer would be a suppression wearing a
    // reason. Every core -> domain edge other than the named one must still be caught, so this
    // asserts the granted entry is narrow: one file, one specifier.
    expect(GRANTED_EXCEPTIONS).toHaveLength(1);
    expect(GRANTED_EXCEPTIONS[0].file).toBe('src/lib/core/parsing/pulse-worker.ts');
    expect(GRANTED_EXCEPTIONS[0].why).toMatch(/entry point/);
  });

  it('actually scanned the source tree', () => {
    // Guards the failure mode ADR 0048 rule 3 names: a gate matching zero subjects reports clean and
    // is indistinguishable from full compliance.
    const files = walk(SRC).filter(f => layerOf(f));
    expect(files.length).toBeGreaterThan(150);
  });
});
