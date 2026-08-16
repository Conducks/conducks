/**
 * todo02 — `typescript/resolver.ts` sat at 18.57% and decides where an import POINTS. A wrong
 * answer here is worse than a crash: it produces an edge to the wrong file, which reads as real.
 * ADR 0070 is the record of exactly that — an unresolvable alias fell through to a basename guess
 * and 106 imports landed on an unrelated test file.
 *
 * These pin what it RETURNS, including the case where it must return nothing.
 */
import { describe, it, expect, afterEach } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { TypeScriptResolver } from '@/lib/core/parsing/languages/typescript/resolver.js';
import { chronicle, anchorChronicle } from '@/lib/core/git/index.js';

/**
 * `findNearestTsconfig` walks up only while the directory is still INSIDE
 * `chronicle.getProjectDir()`. A fixture outside the anchored project therefore gets no tsconfig,
 * and every alias silently fails to resolve — which is how the first version of the alias test
 * below came back `undefined` and looked like a resolver bug. Anchoring chronicle at the fixture is
 * what makes these tests exercise the alias path at all, and the coupling is worth knowing.
 */
const originalProjectDir = chronicle.getProjectDir();

const roots: string[] = [];
const mkProject = (tsconfig: object, files: string[]): { root: string; all: string[] } => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'conducks-tsres-'));
  roots.push(root);
  anchorChronicle(root);
  fs.writeFileSync(path.join(root, 'tsconfig.json'), JSON.stringify(tsconfig));
  const all = files.map(f => {
    const abs = path.join(root, f);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, '');
    return abs;
  });
  return { root, all };
};
afterEach(() => {
  anchorChronicle(originalProjectDir);
  for (const r of roots.splice(0)) fs.rmSync(r, { recursive: true, force: true });
});

describe('TypeScriptResolver — where an import points (todo02)', () => {
  it('resolves a relative import to the real file', () => {
    const { root, all } = mkProject({}, ['src/a.ts', 'src/b.ts']);
    const got = new TypeScriptResolver().resolve('./b', path.join(root, 'src/a.ts'), all);
    expect(got?.toLowerCase()).toBe(path.join(root, 'src/b.ts').toLowerCase());
  });

  it('resolves a tsconfig paths alias', () => {
    const { root, all } = mkProject(
      { compilerOptions: { baseUrl: '.', paths: { '@/*': ['src/*'] } } },
      ['src/a.ts', 'src/deep/target.ts']);
    const got = new TypeScriptResolver().resolve('@/deep/target', path.join(root, 'src/a.ts'), all);
    expect(got?.toLowerCase()).toBe(path.join(root, 'src/deep/target.ts').toLowerCase());
  });

  it('returns undefined for an alias that points nowhere, rather than guessing', () => {
    // ADR 0070. A near-miss decoy is present on purpose: `target.ts` shares a basename with the
    // unresolvable specifier's tail, which is exactly the coincidence that produced 106 wrong edges.
    const { root, all } = mkProject(
      { compilerOptions: { baseUrl: '.', paths: { '@/*': ['src/*'] } } },
      ['src/a.ts', 'src/unrelated/target.ts']);
    const got = new TypeScriptResolver().resolve('@/nowhere/target', path.join(root, 'src/a.ts'), all);
    expect(got).toBeUndefined();
  });

  it('returns undefined for a bare package specifier', () => {
    const { root, all } = mkProject({}, ['src/a.ts']);
    expect(new TypeScriptResolver().resolve('react', path.join(root, 'src/a.ts'), all)).toBeUndefined();
  });

  it('strips the quotes a tree-sitter string capture carries', () => {
    const { root, all } = mkProject({}, ['src/a.ts', 'src/b.ts']);
    const got = new TypeScriptResolver().resolve("'./b'", path.join(root, 'src/a.ts'), all);
    expect(got?.toLowerCase()).toBe(path.join(root, 'src/b.ts').toLowerCase());
  });

  it('resolves a directory import to its index file', () => {
    const { root, all } = mkProject({}, ['src/a.ts', 'src/mod/index.ts']);
    const got = new TypeScriptResolver().resolve('./mod', path.join(root, 'src/a.ts'), all);
    expect(got?.toLowerCase()).toBe(path.join(root, 'src/mod/index.ts').toLowerCase());
  });
});
