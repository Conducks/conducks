import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { ensureBuild, mkGitRepo, writeFile, commit, runCli, rmRepo } from './helpers.js';

/**
 * ADR 0115 — `flows` and `advise`.
 *
 * Every defect here is one shape: **a confident answer where there was no answer.**
 *
 *   advise                    → a REPOSITORY and a DIRECTORY as its top "monolithic hubs"
 *
 * ADR 0115 originally covered `entropy`, `cohesion` and `resonance` too. Those three commands were
 * REMOVED (2026-08-19) — each emitted a score that named no action, which is the whole reason they
 * were cut. Their cases are deleted here rather than rewritten: the rule they proved still binds on
 * the commands that remain, and is enforced by their own tests.
 */
describe('phase 1 commands refuse rather than fabricate', () => {
  let repo: string;

  beforeAll(() => {
    ensureBuild();
    repo = mkGitRepo('phase1');
    writeFile(repo, 'src/a.ts',
      "import { b } from './b.js';\nexport function a(): number { return b() + 1; }\n");
    writeFile(repo, 'src/b.ts', 'export function b(): number { return 2; }\n');
    commit(repo, 'init');
    runCli(['analyze', '--yes'], { cwd: repo });
  }, 300000);

  afterAll(() => rmRepo(repo));

  it('flows offers machine-readable output, and it carries its denominator', () => {
    const { stdout, status } = runCli(['flows', '--json'], { cwd: repo, allowFail: true });
    expect(status).toBe(0);

    // This asserted `Array.isArray` and the payload WAS a bare array, which meant `[]` said both
    // "no flows here" and "4 exist and none matched" — the rendered path had always distinguished
    // them and the MCP tool returned the counts. `--json` is the CLI's machine surface and carries
    // the same data the tool does now (ADR 0148, todo61), so the shape is an object with counts.
    const out = JSON.parse(stdout);
    expect(Array.isArray(out.flows)).toBe(true);
    expect(typeof out.total).toBe('number');
    expect(typeof out.matching).toBe('number');
    expect(typeof out.shown).toBe('number');
  }, 120000);

  /**
   * Containment is not coupling. Every file in a repository depends on the repository, so reporting
   * it as a hub to "consider splitting" is advice nobody can act on.
   */
  it('advise reports no container as a monolithic hub', () => {
    const { stdout, status } = runCli(['advise', '--json'], { cwd: repo, allowFail: true });
    expect(status).toBe(0);
    // `{status, checked, found}` since advise moved to `Verdict`: a bare array could not tell
    // "examined thousands, found nothing" from "examined nothing".
    for (const a of JSON.parse(stdout).found) {
      if (a.type !== 'HUB') continue;
      for (const n of a.nodes ?? []) {
        expect(String(n)).not.toMatch(/^(repository|directory|ecosystem|package)::/);
      }
    }
  }, 120000);
});
