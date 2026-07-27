import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * `LinkCommand` was imported at the top of `index.ts` and never instantiated in the `commands`
 * array. `conducks link <path>` answered `Unknown command "link"` for as long as that was true,
 * while `FederatedLinker` underneath worked perfectly — the whole feature was unreachable through
 * a one-line omission.
 *
 * Nothing could have caught it. The import satisfied the compiler, `tsc` saw a used symbol, and no
 * test drove the command surface. It is exactly the shape this codebase keeps producing: a
 * declaration that is silently never wired to anything (CONDUCKS-13).
 *
 * Reads the source rather than the module, because the failure IS the gap between what the file
 * imports and what it registers — running the module would only show the half that got wired.
 */
const CLI_INDEX = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)), '../../../../src/interfaces/cli/index.ts',
);

describe('every imported CLI command is registered', () => {
  const src = readFileSync(CLI_INDEX, 'utf8');

  /** `import { FooCommand } from "./commands/foo.js";` → FooCommand */
  const imported = [...src.matchAll(/import\s*\{\s*(\w+Command)\s*\}\s*from\s*["']\.\/commands\//g)]
    .map(m => m[1]);

  /** The `const commands: ConducksCommand[] = [...]` literal, plus any later `commands.push(...)`. */
  const registered = (() => {
    const arr = src.match(/const commands:\s*ConducksCommand\[\]\s*=\s*\[([\s\S]*?)\];/);
    const pushes = [...src.matchAll(/commands\.push\(\s*new\s+(\w+Command)/g)].map(m => m[1]);
    const inArray = [...(arr?.[1] ?? '').matchAll(/new\s+(\w+Command)\s*\(/g)].map(m => m[1]);
    return new Set([...inArray, ...pushes]);
  })();

  it('finds the imports and the registry at all — guards the regexes themselves', () => {
    // If either side silently matched nothing, every assertion below would pass vacuously.
    expect(imported.length).toBeGreaterThan(20);
    expect(registered.size).toBeGreaterThan(20);
  });

  it.each(imported)('%s is instantiated in the commands array', name => {
    expect(registered.has(name)).toBe(true);
  });
});
