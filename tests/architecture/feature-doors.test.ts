import { describe, it, expect } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';

/**
 * ADR 0150 rule 1, enforced: outside code reaches a feature through its door and nowhere else.
 *
 * The rule exists because a feature reachable at many paths cannot be changed. Measured on this
 * repository: `core/parsing` is imported from outside at 24 separate files, which is why
 * `reflector.ts` sits at 1,676 lines and `linker-intra.ts` at 1,120 — splitting either would mean
 * checking two dozen call surfaces, so nobody has.
 *
 * Reads the FILES, like `boundaries.test.ts` and for the same reason: a gate reading the graph sees
 * only what the parser captured, and the first violation someone writes may be the one it missed.
 *
 * A RELATIVE import is a violation too, and this is not a hypothetical. Pointing the eight `@/`
 * importers of `core/git` at its door left TWO more — `reflector.ts` and `micro-pulse.ts` — reaching
 * in via `../../core/git/chronicle-interface.js`. The count that said "eight" had been measured with
 * a `@/`-shaped grep, so a third of the real importers were invisible to the measurement. This gate
 * resolves relative specifiers before judging them.
 *
 * WHAT IT CANNOT SEE, stated rather than implied: a computed specifier — `import(someVariable)` —
 * cannot be resolved by reading text. Same limit `boundaries.test.ts` declares, same reason.
 *
 * TESTS ARE NOT EXEMPT — only a feature's OWN tests are (rule 3). A leaf is tested by reaching its
 * internals, so `tests/unit/core/git/` may import them; `tests/unit/core/parsing/` may not, and it
 * was. Four test files and two debug scripts reached into git from outside its own suite, which is
 * the same coupling the rule exists to prevent — a test pinned to an internal path blocks the rename
 * exactly as a source file does.
 *
 * A feature's own tests are identified by PATH: `tests/**\/<feature-tail>/**`, where the tail is the
 * feature's directory name. `core/git` owns `tests/unit/core/git/` and `shell-injection.test.ts`,
 * which drives git's own shell-safety path and is listed explicitly.
 */
const SRC = path.resolve('src');

/** Features that have a door, and must be entered through it. One line per door as they land. */
const DOORS = [
  'contracts',
  'lib/core/git',
  'lib/core/graph',
  'lib/core/utils',
];

/**
 * `lib/core/parsing` HAS a door — `src/lib/core/parsing/index.ts`, and 31 files use it — but is NOT
 * listed above, and the reason is a decision rather than an oversight (todo68).
 *
 * `graph/linker-intra.ts` imports `../parsing/languages/typescript/resolver.js` and constructs it to
 * resolve a specifier to a file. Every way of satisfying rule 1 here costs something real:
 *
 *   - export it through parsing's door → graph imports parsing's door while parsing imports graph's,
 *     which is the feature cycle rule 5b exists to prevent;
 *   - move it to `contracts/` → 237 lines of TypeScript-specific module resolution in a layer that
 *     holds shared vocabulary, not language logic;
 *   - inject it → ~10 test sites construct `new IntraLinker()` bare, and a default that silently
 *     does nothing is the failure-looks-like-absence conflation this codebase keeps paying for.
 *
 * Listing it here with the violation present would fail the gate; removing the violation quietly
 * would pick one of those costs without saying so. So the door exists, the gate does not yet hold it,
 * and the choice is stated where someone will read it.
 */

/**
 * Test files that belong to a feature despite sitting outside its own folder, and may therefore
 * reach its internals. Each entry is a deliberate exception with a reason, never a convenience.
 */
const OWN_TESTS: Record<string, string[]> = {
  // Drives the git path with a filename containing a quote and `$()` — it is a test OF this
  // feature's shell safety (ADR 0047), filed under integration because it needs a real repository.
  'lib/core/git': ['integration/features/shell-injection.test.ts'],
};

const TESTS = path.resolve('tests');

const walk = (dir: string, out: string[] = []): string[] => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith('.ts')) out.push(full);
  }
  return out;
};

/** Every `from '...'` specifier in a file, resolved to a repo-relative path under `src/`. */
const importsOf = (file: string): string[] => {
  const text = fs.readFileSync(file, 'utf-8');
  const specifiers = [...text.matchAll(/from\s+['"]([^'"]+)['"]/g)].map(m => m[1]);
  const resolved: string[] = [];
  for (const spec of specifiers) {
    if (spec.startsWith('@/')) {
      resolved.push(spec.slice(2).replace(/\.js$/, ''));
    } else if (spec.startsWith('.')) {
      const abs = path.resolve(path.dirname(file), spec);
      if (!abs.startsWith(SRC)) continue;
      resolved.push(path.relative(SRC, abs).replace(/\\/g, '/').replace(/\.js$/, ''));
    }
  }
  return resolved;
};

/** The same read, for a test file — its `@/` specifiers point at `src/`, its relative ones do not. */
const importsOfTest = (file: string): string[] =>
  [...fs.readFileSync(file, 'utf-8').matchAll(/from\s+['"]([^'"]+)['"]/g)]
    .map(m => m[1])
    .filter(spec => spec.startsWith('@/'))
    .map(spec => spec.slice(2).replace(/\.js$/, ''));

describe('a feature is entered through its door (ADR 0150)', () => {
  const files = walk(SRC);

  for (const door of DOORS) {
    it(`nothing outside src/${door} imports past its door`, () => {
      const offenders: string[] = [];
      for (const file of files) {
        const rel = path.relative(SRC, file).replace(/\\/g, '/');
        if (rel.startsWith(`${door}/`)) continue;              // inside the feature — allowed
        for (const target of importsOf(file)) {
          if (!target.startsWith(`${door}/`)) continue;
          if (target === `${door}/index`) continue;            // the door itself
          offenders.push(`${rel}  imports  ${target}`);
        }
      }
      expect(offenders).toEqual([]);
    });
  }

  for (const door of DOORS) {
    const tail = door.split('/').pop()!;
    it(`only src/${door}'s OWN tests import past its door`, () => {
      const offenders: string[] = [];
      for (const file of walk(TESTS)) {
        const rel = path.relative(TESTS, file).replace(/\\/g, '/');
        if (rel.includes(`/${tail}/`)) continue;                      // the feature's own suite
        if ((OWN_TESTS[door] ?? []).includes(rel)) continue;          // a named exception
        for (const target of importsOfTest(file)) {
          if (!target.startsWith(`${door}/`)) continue;
          if (target === `${door}/index`) continue;
          offenders.push(`${rel}  imports  ${target}`);
        }
      }
      expect(offenders).toEqual([]);
    });
  }

  it('every declared door exists', () => {
    // A door named here but absent would make the gate above pass by checking nothing — the same
    // "0 checked, exit 0" failure ADR 0124 names.
    const missing = DOORS.filter(d => !fs.existsSync(path.join(SRC, d, 'index.ts')));
    expect(missing).toEqual([]);
  });

  it('reads enough files to be meaningful', () => {
    // A walk that silently returned nothing would also report zero offenders.
    expect(files.length).toBeGreaterThan(100);
  });
});
