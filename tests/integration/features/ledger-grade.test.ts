import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { ensureBuild, mkGitRepo, writeFile, commit, runCli, rmRepo } from './helpers.js';

/**
 * The grade had two inputs — density, and a raw orphan count whose deduction saturated at 20 points
 * from ten orphans — so any project with ten or more orphans and ordinary density scored exactly 80.
 *
 * MEASURED: sofie (11,267 symbols, 11 orphans), scraper (5,153 / 11) and orchestrator (7,558 / 77)
 * all graded **B (80/100)**, each with a single deduction line. Three codebases of different sizes,
 * languages and health, one number — a grade that cannot tell them apart carries no information.
 *
 * Orphans count per thousand symbols now (11 dead symbols in 11,267 is not 11 in 300), and two
 * signals the vault already holds were added: unresolved references, and import cycles counted from
 * the same rule `audit` uses. The three subjects then separate: 86 / 84 / 73.
 */
describe('the ledger grade reflects more than one signal', () => {
  let clean: string;
  let tangled: string;

  beforeAll(() => {
    ensureBuild();

    clean = mkGitRepo('ledger-clean');
    writeFile(clean, 'src/util.ts', `
export function used(n: number): number { return n + 1; }
`);
    writeFile(clean, 'src/main.ts', `
import { used } from './util.js';
export function boot(): number { return used(1); }
`);
    commit(clean, 'init');
    runCli(['analyze', '--yes'], { cwd: clean });

    tangled = mkGitRepo('ledger-tangled');
    // A CYCLE: a imports b, b imports a.
    writeFile(tangled, 'src/a.ts', `
import { fromB } from './b.js';
export function fromA(): number { return fromB(); }
export function deadOne(): number { return 1; }
export function deadTwo(): number { return 2; }
export function deadThree(): number { return 3; }
`);
    writeFile(tangled, 'src/b.ts', `
import { fromA } from './a.js';
export function fromB(): number { return 1; }
export function usesA(): number { return fromA(); }
export function deadFour(): number { return 4; }
`);
    writeFile(tangled, 'src/main.ts', `
import { usesA } from './b.js';
export function boot(): number { return usesA(); }
`);
    commit(tangled, 'init');
    runCli(['analyze', '--yes'], { cwd: tangled });
  }, 300000);

  afterAll(() => { rmRepo(clean); rmRepo(tangled); });

  const scoreOf = (repo: string): number => {
    const out = runCli(['ledger'], { cwd: repo, allowFail: true }).combined.replace(/\[[0-9;]*m/g, '');
    const m = /\((\d+)\/100\)/.exec(out);
    return m ? Number(m[1]) : NaN;
  };

  it('grades a tangled codebase below a clean one', () => {
    const cleanScore = scoreOf(clean);
    const tangledScore = scoreOf(tangled);
    expect(Number.isNaN(cleanScore)).toBe(false);
    expect(Number.isNaN(tangledScore)).toBe(false);
    expect(tangledScore).toBeLessThan(cleanScore);
  }, 180000);

  it('itemises the cycle in the deductions, so the grade can be argued with', () => {
    const out = runCli(['ledger'], { cwd: tangled, allowFail: true }).combined;
    expect(out).toMatch(/circular dependency/i);
  }, 180000);

  it('states the orphan rate, not only the raw count', () => {
    const out = runCli(['ledger'], { cwd: tangled, allowFail: true }).combined;
    expect(out).toMatch(/per 1,000 symbols/);
  }, 180000);
});
