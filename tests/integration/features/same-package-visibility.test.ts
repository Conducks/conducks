import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { ensureBuild, mkGitRepo, writeFile, commit, runCli, rmRepo } from './helpers.js';

/**
 * Java and C# have no import statement for a sibling in the same package.
 *
 * `package com.example.app;` in two files IS the statement that they can see each other, and
 * `Lib.alpha()` needs nothing more. Every resolution block in `IntraLinker` is import-scoped, so
 * with no import edge there was no candidate set at all: the call edge kept a bare target and the
 * declaration sat unreferenced. MEASURED before the fix — `impact alpha upstream` reported **0
 * callers** for a method called on the next file down, in both languages.
 *
 * This cost `impact`, `trace`, `context` and `flows`. It did NOT cost `prune`, and that distinction
 * is worth keeping straight: `isModuleScoped` already refuses to judge a symbol nested inside a
 * class, so Java and C# report no ORPHANs either way. The graph was wrong; the dead-code verdict was
 * silent rather than false.
 *
 * The fix groups units by their DECLARED package/namespace node and makes them mutually visible.
 * Keyed on that node and not on `namespaceId`, which is derived from the DIRECTORY for every
 * language — grouping by it would mean "same folder", and binding an unresolved name to any
 * same-folder file is the coincidence ADR 0070 refuses.
 *
 * Both fixtures use a DOTTED package on purpose. `package app;` is a single identifier, which the
 * Java query's `(scoped_identifier)` does not match, so no PACKAGE node is minted and the whole
 * mechanism is bypassed — a fixture written that way passes for the wrong reason, and mine did.
 */
describe('a call to a sibling in the same declared package resolves', () => {
  describe('Java', () => {
    let repo: string;
    let findings: Array<{ type: string; symbol: string }>;
    let impact: { affectedCount: number };

    beforeAll(() => {
      ensureBuild();
      repo = mkGitRepo('same-package-java');
      writeFile(repo, 'com/example/app/Lib.java', `
package com.example.app;

public class Lib {
    public static int alpha() { return 1; }
    public static int beta() { return 2; }
}
`);
      // No import: same package, so `Lib` is visible by the language's own rule.
      writeFile(repo, 'com/example/app/Main.java', `
package com.example.app;

public class Main {
    public int run() { return Lib.alpha(); }
}
`);
      commit(repo, 'init');
      runCli(['analyze', '--yes'], { cwd: repo });
      findings = JSON.parse(runCli(['prune', '--json'], { cwd: repo }).stdout);
      impact = JSON.parse(runCli(['impact', 'alpha', 'upstream', '--json'], { cwd: repo }).stdout);
    }, 180000);

    afterAll(() => rmRepo(repo));

    it('finds the caller of a same-package method', () => {
      expect(impact.affectedCount).toBeGreaterThan(0);
    });

    it('still reports nothing dead — class methods are not ORPHAN-eligible by design', () => {
      // Asserted so the fix cannot quietly start making delete-verdicts about class members, which
      // `isModuleScoped` deliberately refuses: a nested symbol cannot be proven dead from the graph.
      expect(findings.filter(f => f.type === 'ORPHAN')).toEqual([]);
    });
  });

  describe('C#', () => {
    let repo: string;
    let impact: { affectedCount: number };

    beforeAll(() => {
      ensureBuild();
      repo = mkGitRepo('same-package-csharp');
      writeFile(repo, 'Lib.cs', `
namespace Bench {
  public class Lib {
    public static int UsedFn() { return 1; }
    public static int DeadFn() { return 2; }
  }
}
`);
      writeFile(repo, 'Main.cs', `
namespace Bench {
  public class Program {
    public int Run() { return Lib.UsedFn(); }
  }
}
`);
      commit(repo, 'init');
      runCli(['analyze', '--yes'], { cwd: repo });
      impact = JSON.parse(runCli(['impact', 'UsedFn', 'upstream', '--json'], { cwd: repo }).stdout);
    }, 180000);

    afterAll(() => rmRepo(repo));

    it('finds the caller of a same-namespace method', () => {
      expect(impact.affectedCount).toBeGreaterThan(0);
    });
  });
});
