import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { ensureBuild, mkGitRepo, writeFile, commit, runCli, rmRepo } from './helpers.js';

// Governance domain: `conducks audit` (GovernanceService -> ConducksSentinel policy engine +
// ConducksAdvisor), driven end to end. Sentinel rules are read from config/sentinel.json in the
// analyzed repo (real file, real rule engine, real graph) — not mocked.
//
// PRODUCTION BUG FOUND (reported, not fixed — out of this agent's scope, src/ is owned elsewhere):
// this repo's own config/sentinel.json uses `"matchLabel": "class"` on both real rules
// (require-conducks-component, domain-visibility-rule). ConducksSentinel.validate()
// (src/lib/domain/governance/sentinel.ts:59) compares against `node.label`, which reflector.ts:350
// sets to the CANONICAL kind (`(canonical as any).kind`, e.g. "STRUCTURE"/"BEHAVIOR") — never the
// raw language token "class" (taxonomy.ts:60 maps class/interface/struct/enum -> STRUCTURE). So
// `node.label !== rule.matchLabel` is true for every node and BOTH rules are permanently no-ops:
// `conducks audit` always reports "Governance confirmed" for them regardless of real violations.
// Verified live: a non-exported class under src/lib/domain/ with matchLabel:"class" audits clean;
// the identical rule with matchLabel:"STRUCTURE" (the real label value) correctly fails. The
// fixtures below use "STRUCTURE" for this reason — using "class" would silently test nothing.
describe('Governance domain integration', () => {
  let repo: string;

  beforeAll(() => {
    ensureBuild();
    repo = mkGitRepo('governance');
  });

  afterAll(() => rmRepo(repo));

  it('a custom Sentinel rule PASSES against a graph that satisfies it', () => {
    writeFile(repo, 'src/lib/domain/thing.ts', `
export class Thing {
  doWork(): void {}
}
`);
    // require_export rule scoped to src/lib/domain/ — Thing is exported, so this must pass.
    writeFile(repo, 'config/sentinel.json', JSON.stringify([
      { id: 'domain-must-export', type: 'require_export', matchPath: 'src/lib/domain/', matchLabel: 'STRUCTURE' }
    ], null, 2));
    commit(repo, 'init');
    runCli(['analyze', '--yes'], { cwd: repo });

    const { combined, status } = runCli(['audit'], { cwd: repo });
    expect(status).toBe(0);
    // Both halves report separately (ADR 0059). The single "Governance confirmed" line this used to
    // assert was printed only when the rule set AND the core checks both passed, so a run where the
    // rules passed and the core checks did not printed no verdict at all.
    expect(combined).toContain('[Sentinel] 1 project rule(s) passed');
    expect(combined).toContain('[Core] No structural regressions found');
  });

  // Assertion can fail: flip the fixture to violate the SAME rule and confirm audit turns red.
  it('the SAME rule FAILS once the graph violates it (proves the check is not vacuous)', () => {
    writeFile(repo, 'src/lib/domain/thing.ts', `
class Thing {
  doWork(): void {}
}
`); // no longer exported
    commit(repo, 'remove export');
    runCli(['analyze', '--yes', '--force'], { cwd: repo });

    const { combined, status } = runCli(['audit'], { cwd: repo, allowFail: true });
    expect(status).not.toBe(0);
    expect(combined).toContain('domain-must-export');
    expect(combined).toContain('Custom Governance Violations');
  });

  it('detects a real circular import between two files', () => {
    // Fix the sentinel violation from the previous test (re-export Thing) so this test isolates
    // the cycle detector rather than re-tripping the export rule.
    writeFile(repo, 'src/lib/domain/thing.ts', `export class Thing { doWork(): void {} }`);
    writeFile(repo, 'src/a.ts', `import { b } from './b.js'; export const a = () => b();`);
    writeFile(repo, 'src/b.ts', `import { a } from './a.js'; export const b = () => a();`);
    commit(repo, 'add cycle');
    runCli(['analyze', '--yes', '--force'], { cwd: repo });

    const { combined } = runCli(['audit'], { cwd: repo, allowFail: true });
    expect(combined).toContain('Circular Dependencies Detected');
  });
});
