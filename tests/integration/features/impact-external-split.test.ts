import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { ensureBuild, mkGitRepo, writeFile, commit, runCli, rmRepo } from './helpers.js';

/**
 * "N Symbols affected" is the number a reader acts on before making a change, and it counted every
 * built-in, package and unplaceable target the walk reached.
 *
 * MEASURED on the sofie subject: of the 876 nodes reported affected by `registerIpcHandlers`,
 * **338 (39%) carried `filePath: "unknown"` or an `external://` path** — `ipcmain.handle`,
 * `abortsignal.timeout`, `global::set`. The blast radius of a change is a fact about the code you
 * own; `Math.min` is not going to break.
 *
 * Both halves are printed rather than the external one dropped: "this reaches 338 things I could not
 * place" is worth knowing, and it is the same honesty the zero-case in this command already keeps.
 */
describe('impact separates project reach from external reach', () => {
  let repo: string;

  beforeAll(() => {
    ensureBuild();
    repo = mkGitRepo('impact-external-split');

    writeFile(repo, 'src/helper.ts', `
export function helper(xs: number[]): number { return xs.length; }
`);
    writeFile(repo, 'src/wide.ts', `
import { helper } from './helper.js';

/** Touches a lot of built-ins and exactly one project symbol. */
export function wide(xs: number[]): string {
  const a = xs.map(x => x + 1).filter(Boolean).slice(0, 3);
  const b = JSON.stringify(a).trim().toUpperCase().padStart(4, '0');
  const c = Math.max(...a) + Math.min(...a) + Date.now();
  return b + String(c) + String(helper(a));
}
`);
    commit(repo, 'init');
    runCli(['analyze', '--yes'], { cwd: repo });
  }, 180000);

  afterAll(() => rmRepo(repo));

  it('states the in-project count separately from external reach', () => {
    const out = runCli(['impact', 'wide', 'downstream'], { cwd: repo, allowFail: true }).combined;
    expect(out).toMatch(/Symbols affected in this project/);
  }, 180000);

  it('does not fold unresolved and external targets into the headline number', () => {
    const json = JSON.parse(runCli(['impact', 'wide', 'downstream', '--json'], { cwd: repo }).stdout);
    const external = (json.affectedNodes ?? []).filter((n: any) => {
      const f = String(n.filePath ?? '');
      return !f || f === 'unknown' || f.startsWith('external://');
    }).length;

    const out = runCli(['impact', 'wide', 'downstream'], { cwd: repo, allowFail: true }).combined
      .replace(/\[[0-9;]*m/g, '');
    const headline = Number(/(\d+) Symbols affected in this project/.exec(out)?.[1] ?? NaN);

    expect(Number.isNaN(headline)).toBe(false);
    expect(headline).toBe(Number(json.affectedCount) - external);
    // The fixture is built so there IS an external population — otherwise the assertion is vacuous.
    expect(external).toBeGreaterThan(0);
    if (external > 0) expect(out).toMatch(/external or unresolved reference/);
  }, 180000);

  it('still reaches the project symbol it genuinely depends on', () => {
    const json = JSON.parse(runCli(['impact', 'wide', 'downstream', '--json'], { cwd: repo }).stdout);
    expect(JSON.stringify(json).toLowerCase()).toContain('helper');
  }, 180000);
});
