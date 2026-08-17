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
  'lib/core/algorithms',
  'lib/core/bootstrap',
  'lib/core/git',
  'lib/core/graph',
  'lib/core/parsing',
  'lib/core/persistence',
  'lib/core/registry',
  'lib/core/utils',
  // DOMAIN begins here. The layer was drawn on the canvas before it was swept, and Band 2 says so on
  // its own face — a path read file by file is not a swept layer. Areas land in this list one at a
  // time, leaves first, in the order their dependencies allow (rule 13):
  //   leaves        federation · intelligence · kinetic · manifest · visual
  //   then          evolution -> kinetic
  //   then          governance, metrics -> evolution
  //   last          analysis -> six of the others
  'lib/domain/analysis',
  'lib/domain/coverage',
  'lib/domain/docs',
  'lib/domain/evolution',
  'lib/domain/federation',
  'lib/domain/governance',
  'lib/domain/intelligence',
  'lib/domain/kinetic',
  'lib/domain/manifest',
  'lib/domain/metrics',
  'lib/domain/visual',
];

/**
 * `lib/core/parsing` is listed above as of todo68's close, and the ONE import that kept it out is
 * worth recording, because the fix was the option that had been listed as most expensive.
 *
 * `graph/linker-intra.ts` imported `../parsing/languages/typescript/resolver.js` and constructed it.
 * Exporting it through parsing's door closes a cycle — parsing's door re-exports the processors and
 * they import graph's (rule 5b). Moving it to `contracts/` puts 237 lines of TypeScript module
 * resolution in a vocabulary layer.
 *
 * So it was INVERTED. `IntraLinker` declares a `ResolveSpecifier` port and REFUSES to construct
 * without one; domain supplies `TypeScriptResolver`, which is the layer allowed to know both doors.
 * The cost that had been named — "~10 test sites construct it bare" — was 32, and every one now
 * passes the real resolver rather than a stub, because a stub returning undefined would make those
 * cases pass for the wrong reason: dangling is also what a genuinely unresolvable specifier gives.
 */

/**
 * Test files that belong to a feature despite sitting outside its own folder, and may therefore
 * reach its internals. Each entry is a deliberate exception with a reason, never a convenience.
 */
const OWN_TESTS: Record<string, string[]> = {
  // Drives the git path with a filename containing a quote and `$()` — it is a test OF this
  // feature's shell safety (ADR 0047), filed under integration because it needs a real repository.
  'lib/core/git': ['integration/features/shell-injection.test.ts'],
  // Fakes a watcher marker to prove `status` answers with NO daemon running. The marker writers have
  // zero callers in `src` — nothing but a watcher writes one — so putting them on the door would be
  // the door exporting for a test's benefit, which rule 1 forbids. The exception is narrower than
  // the export would be.
  // `boundaries.test.ts` enforces the ADR 0005 layer contract from governance's OWN rule table, so
  // the gate and the sentinel cannot drift apart. Both constants have zero callers in `src` — the
  // table is consumed by the sentinel that owns it — so putting them on the door would be exporting
  // for a test. Sharing the source of truth is the point; the exception is narrower than the export.
  'lib/domain/governance': ['architecture/boundaries.test.ts'],
  'lib/domain/evolution': [
    // Fakes a watcher marker to prove `status` answers with NO daemon running.
    'unit/domain/analysis/answers-without-a-daemon.test.ts',
    // ADR 0044 — "a check that ran on nothing is not a pass" — spans two features: the status half
    // is evolution's `AuditService`, the gate half is governance's `guard`. The test is filed with
    // the gate it protects. `AuditService` has zero callers in `src`, so putting it on the door to
    // satisfy this would be the door exporting for a test.
    'unit/domain/governance/audit-status.test.ts',
  ],
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
