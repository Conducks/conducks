/**
 * The gate that would have caught the publish blocker in todo56: `minimatch` and `chalk` were
 * imported by shipped code and declared nowhere, arriving transitively through `duckdb`. Swapping
 * that dependency out took them with it and every real install broke, while the repo stayed green.
 *
 * These cases are the four things the gate has to get right, and three of them are false-positive
 * cases — a gate that cries wolf on comments gets switched off, which is the only way it can fail
 * worse than not existing.
 */
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { findUndeclaredImports } from '../../../scripts/check-declared-deps.mjs';

const PKG = {
  dependencies: { express: '^4.0.0' },
  optionalDependencies: { 'tree-sitter': '^0.25.0' },
  devDependencies: { typescript: '^5.3.3' },
};

describe('declared-dependency gate', () => {
  let dir: string;
  const write = (name: string, source: string) => fs.writeFileSync(path.join(dir, name), source);

  beforeAll(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'declared-deps-')); });
  afterAll(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  it('names an imported package that is not declared, and where it is used', () => {
    write('a.js', 'import { minimatch } from "minimatch";\n');
    const missing = findUndeclaredImports(dir, PKG);
    expect(missing.map(m => m.package)).toEqual(['minimatch']);
    expect(missing[0].file).toContain('a.js');
  });

  it('accepts declared, optional, builtin and relative imports', () => {
    fs.rmSync(path.join(dir, 'a.js'));
    write('b.js', [
      'import express from "express";',              // dependency
      'import Parser from "tree-sitter";',           // optionalDependency — absent by design (ADR 0027)
      'import fs from "node:fs";',                   // builtin
      'import path from "path";',                    // builtin, unprefixed
      'import { x } from "./local.js";',             // relative
      'const y = await import("@/lib/thing.js");',   // path alias, owned by check-build-aliases
    ].join('\n'));
    expect(findUndeclaredImports(dir, PKG)).toEqual([]);
  });

  it('does not read prose in comments as an import', () => {
    fs.rmSync(path.join(dir, 'b.js'));
    // Every line here appeared verbatim in build/ and was reported as a missing package by the
    // first draft of this gate.
    write('c.js', [
      '// a script could not tell it from "stable"',
      '/* export * from \'mod\' */',
      ' * "nothing to lint" from "clean".',
      '// the graph cannot tell "never wired up" from "disconnected"',
      ';;   const { POST } = await import(\'@/app/api/route\');',
    ].join('\n'));
    expect(findUndeclaredImports(dir, PKG)).toEqual([]);
  });

  it('sees dynamic and member-call requires, not just static imports', () => {
    fs.rmSync(path.join(dir, 'c.js'));
    write('d.js', [
      'const a = await import("undeclared-dynamic");',
      'const b = this.require("undeclared-member");',
    ].join('\n'));
    expect(findUndeclaredImports(dir, PKG).map(m => m.package).sort())
      .toEqual(['undeclared-dynamic', 'undeclared-member']);
  });

  it('ignores a dynamic import or require written inside a comment', () => {
    fs.rmSync(path.join(dir, 'd.js'));
    // The dynamic patterns cannot be anchored to the start of a line the way the static ones are,
    // so they read prose. This gate's OWN comments were its first false positive here.
    write('e.js', [
      '// await import("p")',
      ' * require("q"), incl. this.require("q")',
      'const real = await import("express");',
    ].join('\n'));
    expect(findUndeclaredImports(dir, PKG)).toEqual([]);
  });

  it('scans .mjs and .cjs, not only .js', () => {
    // Missing these is exactly how the first version read clean over 26 broken tools and scripts.
    fs.rmSync(path.join(dir, 'e.js'));
    write('f.mjs', 'import x from "undeclared-in-mjs";\n');
    write('g.cjs', 'const y = require("undeclared-in-cjs");\n');
    expect(findUndeclaredImports(dir, PKG).map(m => m.package).sort())
      .toEqual(['undeclared-in-cjs', 'undeclared-in-mjs']);
  });

  it('counts devDependencies only for repo tooling, never for shipped code', () => {
    // `tools/benchmark/doc-truth.mjs` imports `typescript` to read the compiler API and never ships.
    // The same import inside build/ would be a broken publish, so the two are judged differently.
    fs.rmSync(path.join(dir, 'f.mjs'));
    fs.rmSync(path.join(dir, 'g.cjs'));
    write('h.mjs', 'import ts from "typescript";\n');

    expect(findUndeclaredImports(dir, PKG).map(m => m.package)).toEqual(['typescript']);
    expect(findUndeclaredImports(dir, PKG, { allowDev: true })).toEqual([]);
  });
});
