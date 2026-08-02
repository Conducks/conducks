import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { ensureBuild, mkGitRepo, writeFile, commit, runCli, rmRepo } from './helpers.js';

/**
 * ADR 0105 — `explain` and `status --blueprint`, scored against answers written first.
 *
 * Both defects here share a shape with nothing to do with the graph: the DATA was correct and the
 * PRINTER was wrong, so each command produced a complete-looking report that said nothing.
 *
 *  - `explain` read `breakdown.gravity.value` on a breakdown whose members are plain numbers, so
 *    every one of six signals printed the string "NaN" — beneath a composite score computed from
 *    the raw numbers, which was therefore correct and made the report look healthy.
 *  - `status --blueprint` interpolated violation OBJECTS into a template string, printing
 *    `[object Object]` for every row. The one part of that mode naming a real problem named none.
 *
 * A number is not a measurement because it is a number. These assert the values are USABLE, not
 * merely present.
 */
describe('explain and status print values, not placeholders', () => {
  let repo: string;

  beforeAll(() => {
    ensureBuild();
    repo = mkGitRepo('explain-status');
    writeFile(repo, 'src/audit.ts', `export function logAudit(e: string): void { void e; }\n`);
    writeFile(repo, 'src/caller.ts',
      `import { logAudit } from './audit.js';\nexport function action(): void { logAudit('a'); }\n`);
    // A real import cycle, so `--blueprint` has a violation to name.
    writeFile(repo, 'src/cycle-a.ts', `import { b } from './cycle-b.js';\nexport function a(): number { return b(); }\n`);
    writeFile(repo, 'src/cycle-b.ts', `import { a } from './cycle-a.js';\nexport function b(): number { return 1; }\nexport function useA(): number { return a(); }\n`);
    commit(repo, 'init');
    runCli(['analyze', '--yes'], { cwd: repo });
  }, 300000);

  afterAll(() => rmRepo(repo));

  it('every explain signal is a number, never NaN', () => {
    const { combined } = runCli(['explain', 'logAudit'], { cwd: repo });
    expect(combined).toContain('Signal Decomposition');
    expect(combined).not.toContain('NaN');

    // Each named signal carries a numeric value on its own line.
    for (const signal of ['gravity', 'complexity', 'fan-out', 'churn', 'entropy', 'fallback']) {
      const line = combined.split('\n').find(l => l.includes(`${signal}:`));
      expect(line).toBeDefined();
      expect(line).toMatch(/\d+\.\d{2}/);
    }
  }, 120000);

  /**
   * The composite score was ALWAYS right, which is what made the NaN block survive — a reader
   * checking the headline number would have found nothing wrong. Asserted separately so a passing
   * score can never again stand in for a working decomposition.
   */
  it('the composite rating is a real number in range', () => {
    const { combined } = runCli(['explain', 'logAudit'], { cwd: repo });
    const m = /Composite Risk Rating[^\d]*([\d.]+) \/ 10\.0/.exec(combined);
    expect(m).not.toBeNull();
    const score = Number(m![1]);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(10);
  }, 120000);

  it('explain refuses an unknown symbol instead of reporting on nothing', () => {
    const { status } = runCli(['explain', 'zzzNoSuchSymbol'], { cwd: repo, allowFail: true });
    expect(status).not.toBe(0);
  }, 120000);

  it('blueprint names each violation instead of printing [object Object]', () => {
    const { combined } = runCli(['status', '--blueprint'], { cwd: repo });
    expect(combined).not.toContain('[object Object]');
    // The planted cycle is a real finding, and it must be readable.
    expect(combined).toMatch(/Circular/i);
    expect(combined).toMatch(/cycle-[ab]\.ts/);
  }, 120000);

  it('status --json counts agree with the human output', () => {
    const { stdout } = runCli(['status', '--json'], { cwd: repo });
    const nodeCount = Number(JSON.parse(stdout).stats.nodeCount);
    expect(nodeCount).toBeGreaterThan(0);

    const { combined } = runCli(['status'], { cwd: repo });
    expect(combined).toContain(String(nodeCount));
  }, 120000);
});
