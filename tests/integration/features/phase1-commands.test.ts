import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { ensureBuild, mkGitRepo, writeFile, commit, runCli, rmRepo } from './helpers.js';

/**
 * ADR 0115 — `flows`, `entropy`, `cohesion`, `resonance`, `advise`.
 *
 * Every defect here is one shape: **a confident answer where there was no answer.**
 *
 *   entropy zzzNoSuchSymbol   → 0.0000, 0 authors, 0.00% risk, exit 0
 *   cohesion zzzA zzzB        → 0.00% similarity, exit 0
 *   resonance <stale vault>   → a raw DuckDB Binder object, exit 0
 *   advise                    → a REPOSITORY and a DIRECTORY as its top "monolithic hubs"
 *
 * Zero is a legitimate value for entropy and for similarity. That is precisely why it must never be
 * printed for a symbol the graph does not hold — the reader cannot tell the two apart.
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

  it('entropy refuses a symbol that does not exist instead of reporting 0.0000', () => {
    const { combined, status } = runCli(['entropy', 'zzzNoSuchSymbol'], { cwd: repo, allowFail: true });
    expect(status).not.toBe(0);
    expect(combined).toMatch(/not found/i);
    expect(combined).not.toMatch(/0\.0000/);
  }, 120000);

  it('entropy resolves a bare name like every other symbol command', () => {
    const { stdout, status } = runCli(['entropy', 'a', '--json'], { cwd: repo, allowFail: true });
    expect(status).toBe(0);
    const e = JSON.parse(stdout);
    // Resolved to a real node id rather than passed through as a literal.
    expect(e.id).toContain('::');
    expect(e.id).toContain('a.ts');
  }, 120000);

  it('cohesion refuses when either symbol does not exist', () => {
    const { combined, status } = runCli(['cohesion', 'a', 'zzzNoSuchSymbol'], { cwd: repo, allowFail: true });
    expect(status).not.toBe(0);
    expect(combined).toMatch(/not found/i);
    expect(combined).not.toMatch(/0\.00%/);
  }, 120000);

  it('cohesion still answers for two real symbols', () => {
    const { stdout, status } = runCli(['cohesion', 'a', 'b', '--json'], { cwd: repo, allowFail: true });
    expect(status).toBe(0);
    expect(typeof JSON.parse(stdout).similarity).toBe('number');
  }, 120000);

  it('resonance refuses a path that is not an analyzed project', () => {
    const { combined, status } = runCli(['resonance', '/tmp/not-a-conducks-project-at-all'], { cwd: repo, allowFail: true });
    expect(status).not.toBe(0);
    expect(combined).toMatch(/does not exist|not an analyzed/i);
    // A driver internal is not an answer.
    expect(combined).not.toMatch(/DUCKDB_NODEJS_ERROR|Binder Error/);
  }, 120000);

  it('flows offers machine-readable output', () => {
    const { stdout, status } = runCli(['flows', '--json'], { cwd: repo, allowFail: true });
    expect(status).toBe(0);
    expect(Array.isArray(JSON.parse(stdout))).toBe(true);
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
