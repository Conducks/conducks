import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { TypeScriptResolver } from '@/lib/core/parsing/languages/typescript/resolver.js';
import { chronicle, anchorChronicle } from '@/lib/core/git/index.js';

/**
 * Two TypeScript resolver faults from the state-machine audit (2026-11-12).
 *
 * P-04-7: the tsconfig cache is process-wide and was validated by mtime alone. A tsconfig rewritten
 * within one mtime tick (coarse timestamps, or a tool that preserves mtime) kept serving the old
 * `paths`. The size is now part of the check too.
 *
 * P-04-8: the resolver promises case-insensitive matching, and the package-entry lookup alone
 * compared case-sensitively — it was handed the raw file array instead of the lower-cased index the
 * other branches use, so `"main": "./Dist/Index.js"` missed `dist/index.js`.
 */
let root: string;
let previous: string;
beforeAll(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'conducks-ts-state-')));
  previous = chronicle.getProjectDir();
  anchorChronicle(root);
});
afterAll(() => {
  anchorChronicle(previous);
  fs.rmSync(root, { recursive: true, force: true });
});

describe('TypeScript resolver state', () => {
  it('re-reads a tsconfig rewritten within the same mtime', () => {
    const tsconfig = path.join(root, 'tsconfig.json');
    const from = path.join(root, 'app.ts');
    const files = [from, path.join(root, 'src', 'x.ts'), path.join(root, 'library', 'x.ts')];
    fs.writeFileSync(tsconfig, JSON.stringify({ compilerOptions: { baseUrl: '.', paths: { '@/*': ['src/*'] } } }));
    // A whole-second stamp, set on both writes, so the two mtimes are exactly equal.
    const stamp = new Date('2026-01-01T00:00:00Z');
    fs.utimesSync(tsconfig, stamp, stamp);
    const r = new TypeScriptResolver();
    expect(r.resolve('@/x', from, files)).toBe(files[1]);

    fs.writeFileSync(tsconfig, JSON.stringify({ compilerOptions: { baseUrl: '.', paths: { '@/*': ['library/*'] } } }));
    fs.utimesSync(tsconfig, stamp, stamp);
    expect(r.resolve('@/x', from, files)).toBe(files[2]);
    fs.rmSync(tsconfig);
  });

  it('matches a package entry that differs from the file on disk only by case', () => {
    const pkgDir = path.join(root, 'node_modules', 'casepkg');
    fs.mkdirSync(pkgDir, { recursive: true });
    fs.writeFileSync(path.join(pkgDir, 'package.json'), JSON.stringify({ name: 'casepkg', main: './Dist/Index.js' }));
    const entry = path.join(pkgDir, 'dist', 'index.js');
    const from = path.join(root, 'app.ts');
    expect(new TypeScriptResolver().resolve('casepkg', from, [from, entry])).toBe(entry);
  });
});
