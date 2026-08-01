import { describe, it, expect } from '@jest/globals';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { grammars } from '@/lib/core/parsing/grammar-registry.js';

/**
 * `tree-sitter` and the 12 grammar packages are OPTIONAL dependencies (ADR 0027). The core package
 * ships no prebuilds, so it compiles from source at install time and is simply absent on a machine
 * with no C++ toolchain. Since ADR 0089 removed the regex fallback, that machine gets ONE clear
 * failure from the orchestrator's preflight — telling it to install a toolchain — instead of a
 * graph full of edgeless nodes that looks like a real answer.
 *
 * A single static `import Parser from 'tree-sitter'` breaks that: ESM resolves imports before any
 * line of the module runs, so the whole CLI dies at load with ERR_MODULE_NOT_FOUND instead of
 * degrading. This test pins the invariant, because the failure only shows up on a machine that
 * cannot run the test that would have caught it.
 */
describe('native tree-sitter stays optional', () => {
  const srcRoot = path.resolve(process.cwd(), 'src');

  const tsFiles = (dir: string): string[] => {
    const out: string[] = [];
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) out.push(...tsFiles(full));
      else if (entry.endsWith('.ts')) out.push(full);
    }
    return out;
  };

  it('no source file value-imports tree-sitter (type-only is fine, it erases)', () => {
    // `import type X from 'tree-sitter'` disappears at compile time; a plain import does not.
    const valueImport = /^\s*import\s+(?!type\s)[^;]*?from\s*['"]tree-sitter(?:-[\w-]+)?['"]/m;
    const offenders = tsFiles(srcRoot).filter(f => valueImport.test(readFileSync(f, 'utf8')));

    expect(offenders.map(f => path.relative(srcRoot, f))).toEqual([]);
  });

  it('package.json lists every tree-sitter package as optional, never required', () => {
    const pkg = JSON.parse(readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf8'));
    const isTs = (name: string) => name === 'tree-sitter' || name.startsWith('tree-sitter-');

    expect(Object.keys(pkg.dependencies ?? {}).filter(isTs)).toEqual([]);
    expect(Object.keys(pkg.optionalDependencies ?? {}).filter(isTs).length).toBeGreaterThan(0);
  });

  it('the registry answers whether the binding is live instead of assuming it', () => {
    // Whatever the answer is on this machine, asking must not throw.
    expect(typeof grammars.isNativeAvailable()).toBe('boolean');
  });

  it('no .wasm grammar ships in src — the WASM path was removed, not merely unused', () => {
    // A 20 MB resources/grammars dir survived long after anything stopped loading it (ADR 0027).
    expect(existsSync(path.join(srcRoot, 'resources', 'grammars'))).toBe(false);

    // Matches a GRAMMAR reference (`tree-sitter-python.wasm`, `resources/grammars`), not the bare
    // string `.wasm`. Conducks legitimately names that extension in other contexts — git discovery
    // denylists it so a user's compiled wasm artifact is never read as source — and banning the
    // substring outright made this guard fire on an unrelated, correct change.
    const grammarRef = /tree-sitter[\w-]*\.wasm|resources[/\\]grammars/;
    expect(tsFiles(srcRoot).filter(f => grammarRef.test(readFileSync(f, 'utf8')))
      .map(f => path.relative(srcRoot, f))).toEqual([]);
  });
});
